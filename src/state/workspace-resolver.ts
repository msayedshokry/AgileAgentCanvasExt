import { createLogger } from '../utils/logger';
const logger = createLogger('workspace-resolver');
import * as vscode from 'vscode';

import { BMAD_RESOURCE_DIR, DEFAULT_OUTPUT_FOLDER } from './constants';

// Re-export pure constants so existing `import { BMAD_RESOURCE_DIR } from './workspace-resolver'`
// call-sites keep working.  New code should prefer importing from './constants' directly
// to avoid pulling in the vscode dependency (important for tests).
export { BMAD_RESOURCE_DIR, DEFAULT_OUTPUT_FOLDER };

/**
 * Legacy output folder name (pre-0.2.3).
 * Auto-detection scans for this as a fallback so existing projects are found
 * without requiring the user to rename their folder.
 */
const LEGACY_OUTPUT_FOLDER = '_bmad-output';

/** Key used to persist the last active project URI in workspaceState. */
const STATE_KEY = 'agileagentcanvas.activeProjectUri';

/** Represents a detected BMAD project folder inside a workspace folder. */
export interface DetectedProject {
    /** The workspace folder this project lives in. */
    workspaceFolder: vscode.WorkspaceFolder;
    /** Full URI to the output folder (e.g. file:///repo-A/.agileagentcanvas-context). */
    outputUri: vscode.Uri;
    /** Display label for pickers. */
    label: string;
}

/**
 * Centralized workspace resolver.
 *
 * Manages which workspace folder + output subfolder is the "active" BMAD
 * project.  Provides a single source of truth that replaces the old
 * `workspaceFolders[0]` hardcoding throughout the codebase.
 *
 * Lifecycle:
 *   1. `activate()` creates a WorkspaceResolver and calls `initialize()`.
 *   2. `initialize()` checks workspaceState, then auto-detects.
 *   3. Consumer code calls `getActiveOutputUri()` instead of
 *      `workspaceFolders[0].uri` + config.
 *   4. On project switch (via command or canvas button), call
 *      `switchProject()` — this clears the store, reloads, and fires
 *      `onDidChangeActiveProject`.
 */
export class WorkspaceResolver {
    private _activeProject: DetectedProject | null = null;
    private _detectedProjects: DetectedProject[] = [];
    private _context: vscode.ExtensionContext;

    private _onDidChangeActiveProject = new vscode.EventEmitter<DetectedProject | null>();
    readonly onDidChangeActiveProject = this._onDidChangeActiveProject.event;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    // ── Public getters ──────────────────────────────────────────────────

    /** The active project, or null if none detected / workspace has no folders. */
    getActiveProject(): DetectedProject | null {
        return this._activeProject;
    }

    /**
     * URI of the active output folder (e.g. `file:///repo-A/.agileagentcanvas-context`).
     * This replaces every `workspaceFolders[0].uri + outputFolder` pattern.
     * Returns null if no project is active.
     */
    getActiveOutputUri(): vscode.Uri | null {
        return this._activeProject?.outputUri ?? null;
    }

    /**
     * The workspace folder that contains the active project.
     * Returns null if no project is active.
     */
    getActiveWorkspaceFolder(): vscode.WorkspaceFolder | null {
        return this._activeProject?.workspaceFolder ?? null;
    }

    /** All detected BMAD projects across workspace folders (cached from last scan). */
    getDetectedProjects(): readonly DetectedProject[] {
        return this._detectedProjects;
    }

    /**
     * The configured output folder name (from `agileagentcanvas.outputFolder` setting).
     * Used by artifact-store and other code that needs the folder *name*
     * rather than the full URI.
     */
    getOutputFolderName(): string {
        return vscode.workspace.getConfiguration('agileagentcanvas').get('outputFolder', DEFAULT_OUTPUT_FOLDER) as string;
    }

    // ── Initialization ──────────────────────────────────────────────────

    /**
     * Initialize the resolver.  Called once during extension activation.
     *
     * Strategy:
     * 1. Check `workspaceState` for a persisted URI — if it still exists on disk, use it.
     * 2. Otherwise, scan all workspace folders for `.agileagentcanvas-context` (and legacy `_bmad-output`).
     * 3. If exactly one found → auto-select.
     * 4. If multiple found → show a picker.
     * 5. If none found → remain null (user can create/browse later).
     */
    async initialize(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            logger.debug('[WorkspaceResolver] No workspace folders — skipping initialization');
            return;
        }

        // 1. Check persisted URI
        const persistedUri = this._context.workspaceState.get<string>(STATE_KEY);
        if (persistedUri) {
            const uri = vscode.Uri.parse(persistedUri);
            try {
                await vscode.workspace.fs.stat(uri);
                // Find the workspace folder this URI belongs to
                const wsFolder = vscode.workspace.getWorkspaceFolder(uri);
                if (wsFolder) {
                    this._activeProject = {
                        workspaceFolder: wsFolder,
                        outputUri: uri,
                        label: `${wsFolder.name} (${this._folderBasename(uri)})`
                    };
                    logger.debug(`[WorkspaceResolver] Restored persisted project: ${uri.fsPath}`);
                    // Still scan for the detected projects list (for switch button visibility)
                    this._detectedProjects = await this._scanWorkspaceFolders();
                    return;
                }
            } catch {
                logger.debug(`[WorkspaceResolver] Persisted URI no longer exists: ${persistedUri}`);
            }
            // Clear stale value
            await this._context.workspaceState.update(STATE_KEY, undefined);
        }

        // 2. Scan all workspace folders
        this._detectedProjects = await this._scanWorkspaceFolders();
        logger.debug(`[WorkspaceResolver] Detected ${this._detectedProjects.length} project(s)`);

        if (this._detectedProjects.length === 1) {
            // 3. Exactly one → auto-select
            await this._setActiveProject(this._detectedProjects[0]);
        } else if (this._detectedProjects.length > 1) {
            // 4. Multiple → picker
            await this._showProjectPicker(this._detectedProjects);
        } else {
            // 5. None found — try the first workspace folder as a default
            // (autoLoadProject will check if the folder exists)
            const outputName = this.getOutputFolderName();
            this._activeProject = {
                workspaceFolder: workspaceFolders[0],
                outputUri: vscode.Uri.joinPath(workspaceFolders[0].uri, outputName),
                label: `${workspaceFolders[0].name} (${outputName})`
            };
            logger.debug(`[WorkspaceResolver] No projects detected — defaulting to ${this._activeProject.outputUri.fsPath}`);
        }

        // Notify user if a legacy folder was detected (modal — await so the
        // user's choice takes effect before the rest of activation proceeds)
        await this._notifyLegacyFolderIfNeeded();
    }

    // ── Project switching ───────────────────────────────────────────────

    /**
     * Switch to a different project.  Fires `onDidChangeActiveProject`.
     * The caller (extension.ts) is responsible for reloading the store
     * and re-pointing the file watcher.
     */
    async switchProject(project: DetectedProject): Promise<void> {
        await this._setActiveProject(project);
        this._onDidChangeActiveProject.fire(this._activeProject);
    }

    /**
     * Show the project picker (for the canvas switch button or the command).
     * Re-scans workspace folders first to catch any new/deleted projects.
     * Returns true if the user picked a project (i.e. a switch happened).
     */
    async promptSwitchProject(): Promise<boolean> {
        this._detectedProjects = await this._scanWorkspaceFolders();

        if (this._detectedProjects.length === 0) {
            // Offer browse + create options even when no projects detected
            return this._showEmptyProjectPicker();
        }

        // Build picker items: detected projects + Browse + Create options
        const items: (vscode.QuickPickItem & { _project?: DetectedProject; _browse?: boolean; _create?: boolean })[] =
            this._detectedProjects.map(p => ({
                label: p.label,
                description: p.outputUri.fsPath,
                _project: p
            }));

        items.push(
            {
                label: '$(folder) Browse for Folder...',
                description: 'Select any folder containing artifacts',
                _browse: true
            },
            {
                label: '$(new-folder) Create New Folder...',
                description: 'Start a project in a new custom-named folder',
                _create: true
            }
        );

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Switch project folder or create a new one'
        });

        if (!picked) return false;

        if (picked._browse) {
            return this._showBrowsePicker();
        }

        if (picked._create) {
            return this._showCreateFolderPicker();
        }

        if (picked._project) {
            await this.switchProject(picked._project);
            return true;
        }

        return false;
    }

    // ── Workspace folder change handling ────────────────────────────────

    /**
     * Called when workspace folders change (add/remove).
     * Re-scans and checks if the active project's folder was removed.
     */
    async onWorkspaceFoldersChanged(e: vscode.WorkspaceFoldersChangeEvent): Promise<void> {
        logger.debug(`[WorkspaceResolver] Workspace folders changed: +${e.added.length} -${e.removed.length}`);

        // Check if active project's workspace folder was removed
        if (this._activeProject) {
            const activeWsFolder = this._activeProject.workspaceFolder;
            const wasRemoved = e.removed.some(f => f.uri.toString() === activeWsFolder.uri.toString());
            if (wasRemoved) {
                logger.debug(`[WorkspaceResolver] Active project's workspace folder was removed!`);
                this._activeProject = null;
                await this._context.workspaceState.update(STATE_KEY, undefined);
                this._onDidChangeActiveProject.fire(null);
                vscode.window.showWarningMessage(
                    `BMAD project folder "${activeWsFolder.name}" was removed from the workspace.`
                );
            }
        }

        // Re-scan
        this._detectedProjects = await this._scanWorkspaceFolders();
    }

    // ── Internal helpers ────────────────────────────────────────────────

    /**
     * Show a **modal** dialog when the active (or any detected) project uses
     * the legacy `_bmad-output` folder name.
     *
     * The modal gives the user three choices:
     *   1. **Use Default** — create `.agileagentcanvas-context` and switch to it.
     *   2. **Custom Name…** — enter a custom folder name, create it, and switch.
     *   3. **Keep _bmad-output** — dismiss the dialog and continue using the
     *      legacy folder (this is the implicit cancel / Escape action).
     *
     * After switching, the existing `switchProject()` path fires
     * `onDidChangeActiveProject` so extension.ts reloads the store and file
     * watcher automatically.
     *
     * Note: the user's existing data in `_bmad-output` is left untouched —
     * the new folder starts empty and the user can move files at their leisure.
     */
    private async _notifyLegacyFolderIfNeeded(): Promise<void> {
        const legacyProjects = this._detectedProjects.filter(
            p => this._folderBasename(p.outputUri) === LEGACY_OUTPUT_FOLDER
        );
        if (legacyProjects.length === 0) return;

        const folders = legacyProjects.map(p => p.workspaceFolder.name).join(', ');
        logger.debug(
            `[WorkspaceResolver] Legacy folder detected in workspace(s): ${folders}`
        );

        // ── Modal dialog ────────────────────────────────────────────────
        const USE_DEFAULT = `Use Default (${DEFAULT_OUTPUT_FOLDER})`;
        const CUSTOM_NAME = 'Custom Name…';
        const KEEP_LEGACY = `Keep ${LEGACY_OUTPUT_FOLDER}`;

        const choice = await vscode.window.showWarningMessage(
            `A legacy project folder "${LEGACY_OUTPUT_FOLDER}" was detected in: ${folders}.\n\n` +
            `The extension now defaults to "${DEFAULT_OUTPUT_FOLDER}". ` +
            `You can switch to the new default, choose a custom folder name, ` +
            `or keep using the legacy folder.\n\n` +
            `Your existing files in "${LEGACY_OUTPUT_FOLDER}" will not be moved or deleted.`,
            { modal: true },
            USE_DEFAULT,
            CUSTOM_NAME,
            KEEP_LEGACY
        );

        // Treat both explicit "Keep" and Escape/dismiss as "keep legacy"
        if (!choice || choice === KEEP_LEGACY) {
            logger.debug('[WorkspaceResolver] User chose to keep legacy folder');
            return;
        }

        // Determine the target workspace folder (use the first legacy project's ws folder)
        const targetWsFolder = legacyProjects[0].workspaceFolder;

        let newFolderName: string;

        if (choice === USE_DEFAULT) {
            newFolderName = DEFAULT_OUTPUT_FOLDER;
        } else {
            // CUSTOM_NAME — show input box
            const input = await vscode.window.showInputBox({
                prompt: 'Enter a name for the new project folder',
                value: DEFAULT_OUTPUT_FOLDER,
                placeHolder: '.my-project-context',
                validateInput: (v) => {
                    if (!v || v.trim().length === 0) return 'Folder name cannot be empty';
                    if (/[<>:"|?*]/.test(v)) return 'Folder name contains invalid characters';
                    if (v.trim() === LEGACY_OUTPUT_FOLDER) return `That is the legacy folder name — choose a different name`;
                    return undefined;
                }
            });

            if (!input) {
                logger.debug('[WorkspaceResolver] User cancelled custom folder name input');
                return;
            }
            newFolderName = input.trim();
        }

        // Create the new folder (no-op if it already exists)
        const newUri = vscode.Uri.joinPath(targetWsFolder.uri, newFolderName);
        try {
            await vscode.workspace.fs.createDirectory(newUri);
        } catch {
            // Directory may already exist — that's fine
        }

        // Build a DetectedProject and switch to it
        const project: DetectedProject = {
            workspaceFolder: targetWsFolder,
            outputUri: newUri,
            label: `${targetWsFolder.name} (${newFolderName})`
        };

        await this.switchProject(project);

        // Re-scan so the project list is up to date
        this._detectedProjects = await this._scanWorkspaceFolders();

        logger.debug(
            `[WorkspaceResolver] Switched from legacy folder to "${newFolderName}" in ${targetWsFolder.name}`
        );
        vscode.window.showInformationMessage(
            `Switched to "${newFolderName}". Your files in "${LEGACY_OUTPUT_FOLDER}" were not modified.`
        );
    }

    private async _setActiveProject(project: DetectedProject): Promise<void> {
        this._activeProject = project;
        await this._context.workspaceState.update(STATE_KEY, project.outputUri.toString());
        logger.debug(`[WorkspaceResolver] Active project set: ${project.outputUri.fsPath}`);
    }

    /**
     * Scan all workspace folders for BMAD output directories.
     * Checks for the configured output folder name, DEFAULT_OUTPUT_FOLDER,
     * and LEGACY_OUTPUT_FOLDER.
     */
    private async _scanWorkspaceFolders(): Promise<DetectedProject[]> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return [];

        const configuredName = this.getOutputFolderName();
        // Build a unique set of folder names to probe
        const namesToProbe = new Set<string>([configuredName, DEFAULT_OUTPUT_FOLDER, LEGACY_OUTPUT_FOLDER]);

        const detected: DetectedProject[] = [];

        for (const wsFolder of workspaceFolders) {
            for (const name of namesToProbe) {
                const candidateUri = vscode.Uri.joinPath(wsFolder.uri, name);
                try {
                    const stat = await vscode.workspace.fs.stat(candidateUri);
                    if (stat.type & vscode.FileType.Directory) {
                        detected.push({
                            workspaceFolder: wsFolder,
                            outputUri: candidateUri,
                            label: `${wsFolder.name} (${name})`
                        });
                        // Don't probe further names for this workspace folder —
                        // one match is enough (prefer first found: configured > default > legacy)
                        break;
                    }
                } catch {
                    // Folder doesn't exist — try next name
                }
            }
        }

        return detected;
    }

    private async _showProjectPicker(projects: DetectedProject[]): Promise<void> {
        const items = projects.map(p => ({
            label: p.label,
            description: p.outputUri.fsPath,
            _project: p
        }));

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Multiple BMAD projects found. Which one to load?'
        });

        if (picked?._project) {
            await this._setActiveProject(picked._project);
        } else if (projects.length > 0) {
            // User dismissed — default to first
            await this._setActiveProject(projects[0]);
        }
    }

    private async _showBrowsePicker(): Promise<boolean> {
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Load AgileAgentCanvas Project',
            title: 'Select folder containing AgileAgentCanvas artifacts (.agileagentcanvas-context or similar)'
        });

        if (!selected || selected.length === 0) return false;

        const uri = selected[0];
        const wsFolder = vscode.workspace.getWorkspaceFolder(uri);

        // Build a DetectedProject even for a browsed folder outside workspace
        const project: DetectedProject = {
            workspaceFolder: wsFolder ?? {
                uri: vscode.Uri.joinPath(uri, '..'),
                name: this._folderBasename(uri),
                index: -1
            },
            outputUri: uri,
            label: this._folderBasename(uri)
        };

        await this.switchProject(project);
        return true;
    }

    /**
     * Shown when no projects are auto-detected.  Offers Browse + Create.
     */
    private async _showEmptyProjectPicker(): Promise<boolean> {
        const picked = await vscode.window.showQuickPick(
            [
                {
                    label: '$(folder) Browse for Folder...',
                    description: 'Select any folder containing artifacts',
                    value: 'browse' as const
                },
                {
                    label: '$(new-folder) Create New Folder...',
                    description: 'Start a project in a new custom-named folder',
                    value: 'create' as const
                }
            ],
            { placeHolder: 'No projects detected — browse for an existing folder or create a new one' }
        );

        if (!picked) return false;
        if (picked.value === 'browse') return this._showBrowsePicker();
        return this._showCreateFolderPicker();
    }

    /**
     * Prompt user for a folder name, create it inside the first workspace
     * folder, and switch to it as the active project.
     */
    private async _showCreateFolderPicker(): Promise<boolean> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage('No workspace folder open — open a folder first.');
            return false;
        }

        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter a name for the new project folder',
            value: DEFAULT_OUTPUT_FOLDER,
            placeHolder: '.my-project-context',
            validateInput: (v) => {
                if (!v || v.trim().length === 0) return 'Folder name cannot be empty';
                if (/[<>:"|?*]/.test(v)) return 'Folder name contains invalid characters';
                return undefined;
            }
        });

        if (!folderName) return false;

        const wsFolder = workspaceFolders[0];
        const newUri = vscode.Uri.joinPath(wsFolder.uri, folderName.trim());

        try {
            await vscode.workspace.fs.createDirectory(newUri);
        } catch {
            // Directory may already exist — that's fine
        }

        const project: DetectedProject = {
            workspaceFolder: wsFolder,
            outputUri: newUri,
            label: `${wsFolder.name} (${folderName.trim()})`
        };

        await this.switchProject(project);
        logger.debug(`[WorkspaceResolver] Created and switched to new folder: ${newUri.fsPath}`);
        vscode.window.showInformationMessage(`Project folder "${folderName.trim()}" created and activated.`);
        return true;
    }

    private _folderBasename(uri: vscode.Uri): string {
        const parts = uri.fsPath.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || '';
    }

    // ── Disposal ────────────────────────────────────────────────────────

    dispose(): void {
        this._onDidChangeActiveProject.dispose();
    }
}
