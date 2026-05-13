import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    USER_CATALOGUE_SETTING,
    DISABLED_SKILLS_KEY,
    REPOS_SUBFOLDER,
    SKILL_TEMPLATE,
    SKILL_TOML_TEMPLATE,
} from './constants';
import { clearPersonaCache } from '../chat/agent-personas';
import { createLogger } from '../utils/logger';

const logger = createLogger('catalogue-service');

// ── Types ────────────────────────────────────────────────────────────────────

export interface CatalogueEntry {
    name: string;
    description: string;
    source: 'builtin' | 'user';
    enabled: boolean;
    /** Absolute path to the skill directory */
    skillPath: string;
    /** Set when the skill was cloned from a git repo */
    repoSlug?: string;
    /** Whether this entry is an agent (vs a pure skill/workflow) */
    isAgent: boolean;
}

export interface SkillManifestEntry {
    name: string;
    folderName: string;
    description: string;
    source: 'builtin' | 'user';
    enabled: boolean;
    isAgent: boolean;
    repoSlug?: string;
}

// ── CatalogueService ─────────────────────────────────────────────────────────

export class CatalogueService {
    private readonly context: vscode.ExtensionContext;
    private readonly builtinSkillsPath: string;
    private watcher: vscode.FileSystemWatcher | undefined;

    private readonly _onCatalogueChanged = new vscode.EventEmitter<void>();
    /** Fires whenever the catalogue changes (user file added/removed, skill toggled). */
    readonly onCatalogueChanged = this._onCatalogueChanged.event;

    constructor(context: vscode.ExtensionContext, extensionPath: string) {
        this.context = context;
        this.builtinSkillsPath = path.join(extensionPath, 'resources', '_aac', 'skills');
    }

    // ── User catalogue path ───────────────────────────────────────────────────

    getUserCataloguePath(): string {
        const cfg = vscode.workspace.getConfiguration();
        return cfg.get<string>(USER_CATALOGUE_SETTING, '').trim();
    }

    /** Ordered list of skill root paths to search: user first, builtin second. */
    getSearchPaths(): string[] {
        const userPath = this.getUserCataloguePath();
        const paths: string[] = [];
        if (userPath && fs.existsSync(userPath)) {
            paths.push(userPath);
        }
        if (fs.existsSync(this.builtinSkillsPath)) {
            paths.push(this.builtinSkillsPath);
        }
        return paths;
    }

    // ── Disabled skills ───────────────────────────────────────────────────────

    private getDisabledSkills(): Set<string> {
        const stored = this.context.globalState.get<string[]>(DISABLED_SKILLS_KEY, []);
        return new Set(stored);
    }

    async toggleSkill(name: string, enabled: boolean): Promise<void> {
        const disabled = this.getDisabledSkills();
        if (enabled) {
            disabled.delete(name);
        } else {
            disabled.add(name);
        }
        await this.context.globalState.update(DISABLED_SKILLS_KEY, Array.from(disabled));
        clearPersonaCache();
        this._onCatalogueChanged.fire();
    }

    // ── Catalogue loading ─────────────────────────────────────────────────────

    loadAllSkills(): CatalogueEntry[] {
        const userPath = this.getUserCataloguePath();
        const disabled = this.getDisabledSkills();
        const seen = new Set<string>(); // tracks skill folder names already added
        const results: CatalogueEntry[] = [];

        // User skills (override built-ins by name)
        if (userPath && fs.existsSync(userPath)) {
            this._scanSkillDir(userPath, 'user', seen, disabled, results, userPath);
        }

        // Built-in skills (only if not already overridden by user)
        if (fs.existsSync(this.builtinSkillsPath)) {
            this._scanSkillDir(this.builtinSkillsPath, 'builtin', seen, disabled, results);
        }

        return results.sort((a, b) => a.name.localeCompare(b.name));
    }

    private _scanSkillDir(
        dir: string,
        source: 'builtin' | 'user',
        seen: Set<string>,
        disabled: Set<string>,
        results: CatalogueEntry[],
        userRootPath?: string,
    ): void {
        let entries: string[];
        try {
            entries = fs.readdirSync(dir);
        } catch {
            return;
        }

        for (const entry of entries) {
            // Skip _repos subfolder — repos are tracked separately
            if (entry === REPOS_SUBFOLDER) { continue; }
            if (seen.has(entry)) { continue; }

            const skillDir = path.join(dir, entry);
            try {
                if (!fs.statSync(skillDir).isDirectory()) { continue; }
            } catch { continue; }

            const skillMdPath = path.join(skillDir, 'SKILL.md');
            if (!fs.existsSync(skillMdPath)) { continue; }

            seen.add(entry);

            const { name, description } = this._readSkillMeta(skillMdPath, entry);
            const isAgent = entry.includes('agent');

            // Detect if skill came from a cloned repo
            let repoSlug: string | undefined;
            if (userRootPath) {
                const reposBase = path.join(userRootPath, REPOS_SUBFOLDER);
                // Skills from repos are placed directly in userRootPath, but we
                // track which slug they came from via the _repos/<slug>/ presence.
                // We use a sidecar metadata file written by SkillRepoManager.
                const metaPath = path.join(skillDir, '.repo-source');
                if (fs.existsSync(metaPath)) {
                    try {
                        repoSlug = fs.readFileSync(metaPath, 'utf-8').trim() || undefined;
                    } catch { /* ignore */ }
                }
                void reposBase; // suppress unused warning
            }

            results.push({
                name,
                description,
                source,
                enabled: !disabled.has(entry),
                skillPath: skillDir,
                repoSlug,
                isAgent,
            });
        }
    }

    private _readSkillMeta(skillMdPath: string, fallbackName: string): { name: string; description: string } {
        try {
            const content = fs.readFileSync(skillMdPath, 'utf-8');

            // Look for YAML frontmatter anywhere in the file (top or bottom)
            const fmMatch = content.match(/\n---\s*\n([\s\S]*?)\n---/) || content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fmMatch) {
                const fm = fmMatch[1];
                const nameMatch = fm.match(/^name\s*:\s*(.+)$/m);
                const descMatch = fm.match(/^description\s*:\s*(.+)$/m);
                const name = nameMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') || fallbackName;
                const description = descMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '') || '';
                if (name || description) {
                    return { name: name || fallbackName, description };
                }
            }

            // Fallback: extract from markdown body (first # heading + first paragraph)
            const headingMatch = content.match(/^#\s+(.+)$/m);
            const name = headingMatch?.[1]?.trim() || fallbackName;
            // First non-empty paragraph after heading (skip blank lines, blockquotes, bold markers)
            const afterHeading = content.replace(/^[\s\S]*?^#\s+.+$/m, '').trim();
            const rawPara = afterHeading.match(/^([^\n#][^\n]*)/)?.[1]?.trim() || '';
            // Strip markdown blockquote prefix (> or >> etc.) and bold/italic markers
            const firstPara = rawPara.replace(/^[>*_\s]+/, '').trim();
            const description = firstPara.length > 200 ? firstPara.slice(0, 197) + '...' : firstPara;
            return { name, description };
        } catch { /* ignore */ }
        return { name: fallbackName, description: '' };
    }

    getSkillManifest(): SkillManifestEntry[] {
        return this.loadAllSkills().map(e => ({
            name: e.name,
            folderName: path.basename(e.skillPath),
            description: e.description,
            source: e.source,
            enabled: e.enabled,
            isAgent: e.isAgent,
            repoSlug: e.repoSlug,
        }));
    }

    // ── Create new user skill ────────────────────────────────────────────────

    async createSkillFromTemplate(folderName: string): Promise<string> {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('Set agileagentcanvas.userCataloguePath before creating user skills.');
        }

        // Sanitise folder name
        const safeName = folderName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
        if (!safeName) {
            throw new Error('Invalid skill folder name.');
        }

        const skillDir = path.join(userPath, safeName);
        if (fs.existsSync(skillDir)) {
            throw new Error(`Skill folder "${safeName}" already exists.`);
        }

        fs.mkdirSync(skillDir, { recursive: true });
        fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_TEMPLATE, 'utf-8');
        fs.writeFileSync(path.join(skillDir, 'customize.toml'), SKILL_TOML_TEMPLATE, 'utf-8');

        logger.info(`Created new user skill: ${safeName}`);
        clearPersonaCache();
        this._onCatalogueChanged.fire();
        return skillDir;
    }

    // ── Delete user skill ────────────────────────────────────────────────────

    async deleteUserSkill(folderName: string): Promise<void> {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('No user catalogue path configured.');
        }

        const skillDir = path.join(userPath, folderName);
        // Security: ensure the target is strictly inside the user catalogue path
        const resolved = path.resolve(skillDir);
        const resolvedBase = path.resolve(userPath);
        if (!resolved.startsWith(resolvedBase + path.sep)) {
            throw new Error('Invalid skill path — path traversal denied.');
        }

        if (!fs.existsSync(skillDir)) {
            throw new Error(`Skill "${folderName}" not found.`);
        }

        // Guard: do not delete if the directory is actually inside _repos (raw clone)
        if (resolved.includes(path.sep + REPOS_SUBFOLDER + path.sep)) {
            throw new Error('Cannot delete skills inside a cloned repo. Remove the repo instead.');
        }

        // Check it's a skill (has SKILL.md)
        if (!fs.existsSync(path.join(skillDir, 'SKILL.md'))) {
            throw new Error(`"${folderName}" is not a skill folder.`);
        }

        fs.rmSync(skillDir, { recursive: true, force: true });
        logger.info(`Deleted user skill: ${folderName}`);
        clearPersonaCache();
        this._onCatalogueChanged.fire();
    }

    // ── Open skill folder in Explorer ────────────────────────────────────────

    openSkillFolder(folderName: string): void {
        const userPath = this.getUserCataloguePath();
        const entry = this.loadAllSkills().find(e => {
            const base = path.basename(e.skillPath);
            return base === folderName;
        });

        const target = entry?.skillPath ?? (userPath ? path.join(userPath, folderName) : undefined);
        if (!target) {
            vscode.window.showErrorMessage('Could not locate skill folder.');
            return;
        }

        // Open in the OS file manager — revealInExplorer only works within the workspace
        vscode.env.openExternal(vscode.Uri.file(target));
    }

    // ── Filesystem watcher ───────────────────────────────────────────────────

    startWatcher(): void {
        this.stopWatcher();
        const userPath = this.getUserCataloguePath();
        if (!userPath || !fs.existsSync(userPath)) { return; }

        const pattern = new vscode.RelativePattern(userPath, '**/*');
        this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

        const onChange = () => {
            logger.debug('User catalogue changed — invalidating persona cache');
            clearPersonaCache();
            this._onCatalogueChanged.fire();
        };

        this.watcher.onDidCreate(onChange);
        this.watcher.onDidDelete(onChange);
        this.watcher.onDidChange(onChange);

        logger.info(`Watching user catalogue: ${userPath}`);
    }

    stopWatcher(): void {
        this.watcher?.dispose();
        this.watcher = undefined;
    }

    dispose(): void {
        this.stopWatcher();
        this._onCatalogueChanged.dispose();
    }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _instance: CatalogueService | undefined;

export function getCatalogueService(): CatalogueService {
    if (!_instance) {
        throw new Error('CatalogueService not yet initialised — call initialiseCatalogueService() in activate()');
    }
    return _instance;
}

export function initialiseCatalogueService(
    context: vscode.ExtensionContext,
    extensionPath: string,
): CatalogueService {
    _instance = new CatalogueService(context, extensionPath);
    return _instance;
}
