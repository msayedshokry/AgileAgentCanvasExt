import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { simpleGit, SimpleGit, GitError } from 'simple-git';
import { SKILL_REPOS_SETTING, REPOS_SUBFOLDER } from './constants';
import { getCatalogueService } from './catalogue-service';
import { createLogger } from '../utils/logger';

const logger = createLogger('skill-repo-manager');

// ── Types ────────────────────────────────────────────────────────────────────

export interface RepoConfig {
    url: string;
    name?: string;
}

export interface RepoEntry extends RepoConfig {
    slug: string;
    skillCount: number;
    lastSynced: string | null; // ISO date string
    status: 'cloned' | 'error' | 'cloning' | 'pending';
    errorMessage?: string;
}

export interface SyncResult {
    slug: string;
    added: string[];
    updated: string[];
    removed: string[];
}

// ── SkillRepoManager ─────────────────────────────────────────────────────────

export class SkillRepoManager {
    private readonly context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    // ── Config helpers ────────────────────────────────────────────────────────

    private getRepoConfigs(): RepoConfig[] {
        return vscode.workspace.getConfiguration().get<RepoConfig[]>(SKILL_REPOS_SETTING, []);
    }

    private async saveRepoConfigs(configs: RepoConfig[]): Promise<void> {
        await vscode.workspace.getConfiguration().update(
            SKILL_REPOS_SETTING,
            configs,
            vscode.ConfigurationTarget.Global,
        );
    }

    private getUserCataloguePath(): string {
        return getCatalogueService().getUserCataloguePath();
    }

    private getReposRoot(): string {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('Set agileagentcanvas.userCataloguePath before managing skill repos.');
        }
        return path.join(userPath, REPOS_SUBFOLDER);
    }

    // ── Slug ─────────────────────────────────────────────────────────────────

    private urlToSlug(url: string): string {
        // e.g. https://github.com/org/my-skills.git → my-skills
        const stripped = url.replace(/\.git$/, '').replace(/\/$/, '');
        const parts = stripped.split(/[/:]/).filter(Boolean);
        return parts[parts.length - 1]?.toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'repo';
    }

    private uniqueSlug(base: string, existing: string[]): string {
        let slug = base;
        let i = 2;
        while (existing.includes(slug)) {
            slug = `${base}-${i++}`;
        }
        return slug;
    }

    // ── List repos ────────────────────────────────────────────────────────────

    listRepos(): RepoEntry[] {
        const configs = this.getRepoConfigs();
        const userPath = this.getUserCataloguePath();

        return configs.map(cfg => {
            const slug = this.urlToSlug(cfg.url);
            const repoDir = userPath ? path.join(userPath, REPOS_SUBFOLDER, slug) : '';
            const cloned = repoDir ? fs.existsSync(path.join(repoDir, '.git')) : false;

            const skillCount = cloned ? this._countSkillsInRepo(repoDir) : 0;
            const lastSynced = cloned ? this._readLastSynced(repoDir) : null;

            return {
                url: cfg.url,
                name: cfg.name ?? slug,
                slug,
                skillCount,
                lastSynced,
                status: cloned ? 'cloned' : 'pending',
            } satisfies RepoEntry;
        });
    }

    // ── Add repo (clone) ──────────────────────────────────────────────────────

    async addRepo(
        url: string,
        onProgress?: (message: string) => void,
    ): Promise<RepoEntry> {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('Set agileagentcanvas.userCataloguePath before adding skill repos.');
        }

        // Validate URL format (basic guard — not a security boundary)
        if (!this._isValidGitUrl(url)) {
            throw new Error(`Invalid git URL: "${url}". Expected a git-cloneable URL.`);
        }

        const configs = this.getRepoConfigs();
        const existingSlugs = configs.map(c => this.urlToSlug(c.url));

        // Prevent duplicate
        if (configs.some(c => c.url === url)) {
            throw new Error('This repository is already tracked.');
        }

        const slug = this.uniqueSlug(this.urlToSlug(url), existingSlugs);
        const reposRoot = path.join(userPath, REPOS_SUBFOLDER);
        const cloneDir = path.join(reposRoot, slug);

        fs.mkdirSync(reposRoot, { recursive: true });

        onProgress?.(`Cloning ${url}…`);
        logger.info(`Cloning ${url} → ${cloneDir}`);

        const git = simpleGit();
        try {
            await git.clone(url, cloneDir, ['--depth', '1']);
        } catch (err) {
            const msg = err instanceof GitError ? err.message : String(err);
            throw new Error(`git clone failed: ${msg}`);
        }

        onProgress?.('Scanning for skills…');
        const discovered = this._discoverAndCopySkills(cloneDir, userPath, slug);

        if (discovered.length === 0) {
            // Keep clone but warn — user may want to keep it in case the repo adds skills later
            logger.warn(`No skill folders (with SKILL.md) found in ${url}`);
        }

        this._writeLastSynced(cloneDir);

        // Persist config
        const newConfig: RepoConfig = { url, name: slug };
        configs.push(newConfig);
        await this.saveRepoConfigs(configs);

        onProgress?.(`Done — found ${discovered.length} skill(s).`);
        logger.info(`Repo ${slug} cloned. Skills discovered: ${discovered.join(', ') || 'none'}`);

        // Notify catalogue
        getCatalogueService()['_onCatalogueChanged'].fire();

        return {
            url,
            name: slug,
            slug,
            skillCount: discovered.length,
            lastSynced: new Date().toISOString(),
            status: 'cloned',
        };
    }

    // ── Sync repo (pull) ──────────────────────────────────────────────────────

    async syncRepo(
        slug: string,
        onProgress?: (message: string) => void,
    ): Promise<SyncResult> {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('No user catalogue path configured.');
        }

        const cloneDir = path.join(userPath, REPOS_SUBFOLDER, slug);
        if (!fs.existsSync(path.join(cloneDir, '.git'))) {
            throw new Error(`Repo "${slug}" is not cloned yet.`);
        }

        onProgress?.(`Pulling latest from ${slug}…`);
        const git: SimpleGit = simpleGit(cloneDir);
        try {
            await git.pull();
        } catch (err) {
            const msg = err instanceof GitError ? err.message : String(err);
            throw new Error(`git pull failed: ${msg}`);
        }

        onProgress?.('Updating skills…');

        // Get current skills from this repo in user catalogue
        const before = this._getUserSkillsFromRepo(userPath, slug);

        // Re-discover and overwrite
        const after = this._discoverAndCopySkills(cloneDir, userPath, slug);

        // Compute diff
        const beforeSet = new Set(before);
        const afterSet = new Set(after);
        const added = after.filter(s => !beforeSet.has(s));
        const updated = after.filter(s => beforeSet.has(s));
        const removed = before.filter(s => !afterSet.has(s));

        // Remove skills no longer in repo
        for (const skillFolder of removed) {
            const skillDir = path.join(userPath, skillFolder);
            if (fs.existsSync(skillDir)) {
                fs.rmSync(skillDir, { recursive: true, force: true });
            }
        }

        this._writeLastSynced(cloneDir);
        onProgress?.(`Done. +${added.length} added, ${updated.length} updated, ${removed.length} removed.`);

        getCatalogueService()['_onCatalogueChanged'].fire();

        return { slug, added, updated, removed };
    }

    // ── Remove repo ───────────────────────────────────────────────────────────

    async removeRepo(slug: string): Promise<void> {
        const userPath = this.getUserCataloguePath();
        if (!userPath) {
            throw new Error('No user catalogue path configured.');
        }

        // Remove skills from user catalogue that came from this repo
        const skillFolders = this._getUserSkillsFromRepo(userPath, slug);
        for (const skillFolder of skillFolders) {
            const skillDir = path.join(userPath, skillFolder);
            if (fs.existsSync(skillDir)) {
                fs.rmSync(skillDir, { recursive: true, force: true });
                logger.info(`Removed skill ${skillFolder} (from repo ${slug})`);
            }
        }

        // Remove cloned repo folder
        const cloneDir = path.join(userPath, REPOS_SUBFOLDER, slug);
        if (fs.existsSync(cloneDir)) {
            fs.rmSync(cloneDir, { recursive: true, force: true });
        }

        // Remove from config
        const configs = this.getRepoConfigs().filter(c => this.urlToSlug(c.url) !== slug);
        await this.saveRepoConfigs(configs);

        getCatalogueService()['_onCatalogueChanged'].fire();
        logger.info(`Removed repo: ${slug}`);
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    /** Discover skill folders in the cloned repo and copy them to the user catalogue.
     *  First checks if the repo root itself is a skill (has a SKILL.md at root).
     *  Otherwise walks the tree up to MAX_SCAN_DEPTH levels deep looking for subfolders containing SKILL.md. */
    private _discoverAndCopySkills(cloneDir: string, userPath: string, slug: string): string[] {
        const MAX_SCAN_DEPTH = 4;
        const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.next']);
        const discovered: string[] = [];

        // ── Root-level skill (entire repo is a single skill) ──────────────────
        if (fs.existsSync(path.join(cloneDir, 'SKILL.md'))) {
            const dest = path.join(userPath, slug);
            this._copyDir(cloneDir, dest);
            fs.writeFileSync(path.join(dest, '.repo-source'), slug, 'utf-8');
            discovered.push(slug);
            logger.info(`Repo root is a skill — imported as "${slug}"`);
            return discovered;
        }

        // ── Subfolder skills ──────────────────────────────────────────────────
        const walk = (dir: string, depth: number): void => {
            if (depth > MAX_SCAN_DEPTH) { return; }
            let entries: string[];
            try { entries = fs.readdirSync(dir); } catch { return; }

            for (const entry of entries) {
                if (entry.startsWith('.') && SKIP_DIRS.has(entry)) { continue; }
                if (SKIP_DIRS.has(entry)) { continue; }
                const fullPath = path.join(dir, entry);
                try { if (!fs.statSync(fullPath).isDirectory()) { continue; } } catch { continue; }

                if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
                    // Use the folder's own name as the skill name (flatten into user catalogue)
                    const skillName = entry;
                    const dest = path.join(userPath, skillName);
                    this._copyDir(fullPath, dest);
                    fs.writeFileSync(path.join(dest, '.repo-source'), slug, 'utf-8');
                    discovered.push(skillName);
                    // Don't recurse further into a discovered skill folder
                } else {
                    // Keep looking deeper
                    walk(fullPath, depth + 1);
                }
            }
        };

        walk(cloneDir, 0);
        return discovered;
    }

    private _copyDir(src: string, dest: string): void {
        fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                this._copyDir(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    private _getUserSkillsFromRepo(userPath: string, slug: string): string[] {
        const skills: string[] = [];
        try {
            const entries = fs.readdirSync(userPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) { continue; }
                if (entry.name === REPOS_SUBFOLDER) { continue; }
                const metaPath = path.join(userPath, entry.name, '.repo-source');
                if (fs.existsSync(metaPath)) {
                    const src = fs.readFileSync(metaPath, 'utf-8').trim();
                    if (src === slug) {
                        skills.push(entry.name);
                    }
                }
            }
        } catch { /* ignore */ }
        return skills;
    }

    private _countSkillsInRepo(cloneDir: string): number {
        const MAX_SCAN_DEPTH = 4;
        const SKIP_DIRS = new Set(['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.next']);
        let count = 0;

        const walk = (dir: string, depth: number): void => {
            if (depth > MAX_SCAN_DEPTH) { return; }
            let entries: string[];
            try { entries = fs.readdirSync(dir); } catch { return; }
            for (const entry of entries) {
                if (entry.startsWith('.') || SKIP_DIRS.has(entry)) { continue; }
                const fullPath = path.join(dir, entry);
                try { if (!fs.statSync(fullPath).isDirectory()) { continue; } } catch { continue; }
                if (fs.existsSync(path.join(fullPath, 'SKILL.md'))) {
                    count++;
                } else {
                    walk(fullPath, depth + 1);
                }
            }
        };

        walk(cloneDir, 0);
        return count;
    }

    private _readLastSynced(cloneDir: string): string | null {
        try {
            const p = path.join(cloneDir, '.last-synced');
            if (fs.existsSync(p)) {
                return fs.readFileSync(p, 'utf-8').trim() || null;
            }
        } catch { /* ignore */ }
        return null;
    }

    private _writeLastSynced(cloneDir: string): void {
        try {
            fs.writeFileSync(path.join(cloneDir, '.last-synced'), new Date().toISOString(), 'utf-8');
        } catch { /* ignore */ }
    }

    private _isValidGitUrl(url: string): boolean {
        // HTTPS repos need at least host/org/repo (two path segments)
        if (/^https?:\/\/[^/]+\/[^/]+\/[^/]+/.test(url)) { return true; }
        // git@host:org/repo.git
        if (/^git@[^:]+:.+\/.+/.test(url)) { return true; }
        // ssh://host/org/repo
        if (/^ssh:\/\/[^/]+\/.+\/.+/.test(url)) { return true; }
        return false;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _repoManager: SkillRepoManager | undefined;

export function getSkillRepoManager(): SkillRepoManager {
    if (!_repoManager) {
        throw new Error('SkillRepoManager not yet initialised — call initialiseSkillRepoManager() in activate()');
    }
    return _repoManager;
}

export function initialiseSkillRepoManager(context: vscode.ExtensionContext): SkillRepoManager {
    _repoManager = new SkillRepoManager(context);
    return _repoManager;
}
