import * as vscode from 'vscode';
import { acOutput } from '../extension';

/**
 * Default output folder name used by AgentCanvas.
 * Also used as the primary auto-detection target when scanning workspace folders.
 */
export const DEFAULT_OUTPUT_FOLDER = '.agentcanvas-context';

/**
 * Legacy output folder name (pre-0.2.3).
 * Auto-detection scans for this as a fallback so existing projects are found
 * without requiring the user to rename their folder.
 */
const LEGACY_OUTPUT_FOLDER = '_bmad-output';

/** Key used to persist the last active project URI in workspaceState. */
const STATE_KEY = 'agentcanvas.activeProjectUri';

/** Represents a detected BMAD project folder inside a workspace folder. */
export interface DetectedProject {
    /** The workspace folder this project lives in. */
    workspaceFolder: vscode.WorkspaceFolder;
    /** Full URI to the output folder (e.g. file:///repo-A/.agentcanvas-context). */
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
     * URI of the active output folder (e.g. `file:///repo-A/.agentcanvas-context`).
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
     * The configured output folder name (from `agentcanvas.outputFolder` setting).
     * Used by artifact-store and other code that needs the folder *name*
     * rather than the full URI.
     */
    getOutputFolderName(): string {
        return vscode.workspace.getConfiguration('agentcanvas').get('outputFolder', DEFAULT_OUTPUT_FOLDER) as string;
    }

    // ── Initialization ──────────────────────────────────────────────────

    /**
     * Initialize the resolver.  Called once during extension activation.
     *
     * Strategy:
     * 1. Check `workspaceState` for a persisted URI — if it still exists on disk, use it.
     * 2. Otherwise, scan all workspace folders for `.agentcanvas-context` (and legacy `_bmad-output`).
     * 3. If exactly one found → auto-select.
     * 4. If multiple found → show a picker.
     * 5. If none found → remain null (user can create/browse later).
     */
    async initialize(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            acOutput.appendLine('[WorkspaceResolver] No workspace folders — skipping initialization');
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
                    acOutput.appendLine(`[WorkspaceResolver] Restored persisted project: ${uri.fsPath}`);
                    // Still scan for the detected projects list (for switch button visibility)
                    this._detectedProjects = await this._scanWorkspaceFolders();
                    return;
                }
            } catch {
                acOutput.appendLine(`[WorkspaceResolver] Persisted URI no longer exists: ${persistedUri}`);
            }
            // Clear stale value
            await this._context.workspaceState.update(STATE_KEY, undefined);
        }

        // 2. Scan all workspace folders
        this._detectedProjects = await this._scanWorkspaceFolders();
        acOutput.appendLine(`[WorkspaceResolver] Detected ${this._detectedProjects.length} project(s)`);

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
            acOutput.appendLine(`[WorkspaceResolver] No projects detected — defaulting to ${this._activeProject.outputUri.fsPath}`);
        }

        // Notify user if a legacy folder was detected
        this._notifyLegacyFolderIfNeeded();
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
            // Offer browse option even when no projects detected
            const browseResult = await this._showBrowsePicker();
            return browseResult;
        }

        // Build picker items: detected projects + Browse option
        const items: (vscode.QuickPickItem & { _project?: DetectedProject; _browse?: boolean })[] =
            this._detectedProjects.map(p => ({
                label: p.label,
                description: p.outputUri.fsPath,
                _project: p
            }));

        items.push({
            label: '$(folder) Browse for Folder...',
            description: 'Select any folder containing BMAD artifacts',
            _browse: true
        });

        const picked = await vscode.window.showQuickPick(items, {
            placeHolder: 'Switch BMAD project'
        });

        if (!picked) return false;

        if (picked._browse) {
            return this._showBrowsePicker();
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
        acOutput.appendLine(`[WorkspaceResolver] Workspace folders changed: +${e.added.length} -${e.removed.length}`);

        // Check if active project's workspace folder was removed
        if (this._activeProject) {
            const activeWsFolder = this._activeProject.workspaceFolder;
            const wasRemoved = e.removed.some(f => f.uri.toString() === activeWsFolder.uri.toString());
            if (wasRemoved) {
                acOutput.appendLine(`[WorkspaceResolver] Active project's workspace folder was removed!`);
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
     * Show an informational message when the active (or any detected) project
     * uses the legacy `_bmad-output` folder name, so the user knows they can
     * rename it to `.agentcanvas-context`.
     */
    private _notifyLegacyFolderIfNeeded(): void {
        const legacyProjects = this._detectedProjects.filter(
            p => this._folderBasename(p.outputUri) === LEGACY_OUTPUT_FOLDER
        );
        if (legacyProjects.length === 0) return;

        const folders = legacyProjects.map(p => p.workspaceFolder.name).join(', ');
        vscode.window.showInformationMessage(
            `Legacy folder "${LEGACY_OUTPUT_FOLDER}" detected in: ${folders}. ` +
            `Consider renaming to "${DEFAULT_OUTPUT_FOLDER}" for consistency.`,
            'Dismiss'
        );
        acOutput.appendLine(
            `[WorkspaceResolver] Legacy folder detected in workspace(s): ${folders}`
        );
    }

    private async _setActiveProject(project: DetectedProject): Promise<void> {
        this._activeProject = project;
        await this._context.workspaceState.update(STATE_KEY, project.outputUri.toString());
        acOutput.appendLine(`[WorkspaceResolver] Active project set: ${project.outputUri.fsPath}`);
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
            openLabel: 'Load AgentCanvas Project',
            title: 'Select folder containing AgentCanvas artifacts (.agentcanvas-context or similar)'
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

    private _folderBasename(uri: vscode.Uri): string {
        const parts = uri.fsPath.replace(/\\/g, '/').split('/');
        return parts[parts.length - 1] || '';
    }

    // ── Disposal ────────────────────────────────────────────────────────

    dispose(): void {
        this._onDidChangeActiveProject.dispose();
    }
}
