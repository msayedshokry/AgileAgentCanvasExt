import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import type { BmadArtifacts } from '../types';
import { ArtifactFileWriter } from './artifact-file-writer';
import { writeMarkdownCompanion } from './artifact-file-io';

const migratorLogger = createLogger('artifact-migrator');
const logDebug = (...args: unknown[]) => migratorLogger.debug(...args);

/**
 * ArtifactMigrator — extracted collaborator that handles folder-structure
 * migrations (e.g., migrating legacy implementation/ folders to canonical
 * stories/ locations, and the inline-story → standalone-file migration).
 * Previously embedded in ArtifactStore.
 */
export class ArtifactMigrator {
    constructor(
        private getSourceFolder: () => vscode.Uri | null,
        private getSourceFiles: () => Map<string, vscode.Uri>,
        private getOutputChannel: () => vscode.OutputChannel,
        private getOutputFormat: () => 'json' | 'markdown' | 'dual',
        private loadFromFolder: (folderUri: vscode.Uri) => Promise<void>,
        private syncToFiles: () => Promise<void>,
    ) {}

    /**
     * Migrate story files from legacy `epics/epic-{N}/implementation/`
     * directories to the canonical `epics/epic-{N}/stories/` location.
     *
     * This is a best-effort migration — failures are logged but never
     * thrown, so the load path is never blocked.
     */
    async migrateImplementationFolder(folderUri: vscode.Uri): Promise<void> {
        try {
            const epicsDir = vscode.Uri.joinPath(folderUri, 'epics');
            let epicEntries: [string, vscode.FileType][];
            try {
                epicEntries = await vscode.workspace.fs.readDirectory(epicsDir);
            } catch {
                // No epics/ directory — nothing to migrate
                return;
            }

            let totalMigrated = 0;
            let totalSkipped = 0;

            for (const [epicDirName, epicType] of epicEntries) {
                if (epicType !== vscode.FileType.Directory) { continue; }

                const epicFolderUri = vscode.Uri.joinPath(epicsDir, epicDirName);
                const implDir = vscode.Uri.joinPath(epicFolderUri, 'implementation');

                try {
                    await vscode.workspace.fs.stat(implDir);
                } catch {
                    continue;
                }

                migratorLogger.debug(`[Migration] Detected legacy implementation/ in ${epicDirName} — migrating...`);

                let migratedCount = 0;
                let skippedCount = 0;

                let existingStoryFiles: [string, vscode.FileType][] = [];
                const storiesDirUri = vscode.Uri.joinPath(epicFolderUri, 'stories');
                try {
                    existingStoryFiles = await vscode.workspace.fs.readDirectory(storiesDirUri);
                } catch { /* stories/ doesn't exist yet */ }

                const storyPrefix = (fname: string) => {
                    const m = fname.match(/^(\d+\.\d+(?:\.\d+)?)-/);
                    return m ? m[1] + '-' : null;
                };

                const entries = await vscode.workspace.fs.readDirectory(implDir);
                for (const [name, type] of entries) {
                    if (type !== vscode.FileType.File || !name.endsWith('.json')) { continue; }

                    try {
                        const fileUri = vscode.Uri.joinPath(implDir, name);
                        const rawBytes = await vscode.workspace.fs.readFile(fileUri);
                        const raw = Buffer.from(rawBytes).toString('utf-8');
                        const data = JSON.parse(raw);

                        const storyId: string = data?.content?.id || data?.id || '';
                        const epicId: string = data?.content?.epicId || data?.epicId || '';

                        if (!storyId) {
                            migratorLogger.debug(`[Migration] Skipping ${name}: missing id field`);
                            skippedCount++;
                            continue;
                        }

                        const resolvedEpicFolder = epicId
                            ? vscode.Uri.joinPath(epicsDir, `epic-${epicId.replace(/\D/g, '')}`)
                            : epicFolderUri;
                        const storiesDir = vscode.Uri.joinPath(resolvedEpicFolder, 'stories');
                        try { await vscode.workspace.fs.createDirectory(storiesDir); } catch { /* exists */ }

                        let currentStoryFiles = existingStoryFiles;
                        if (epicId && epicId.replace(/\D/g, '') !== epicDirName.replace(/\D/g, '')) {
                            try { currentStoryFiles = await vscode.workspace.fs.readDirectory(storiesDir); } catch { currentStoryFiles = []; }
                        }

                        const prefix = storyPrefix(name);
                        const existingMatch = prefix
                            ? currentStoryFiles.find(([fn]) => fn.startsWith(prefix) && fn.endsWith('.json'))
                            : undefined;

                        let shouldWrite = true;
                        let targetFilename = name;

                        if (existingMatch) {
                            const [existingName] = existingMatch;
                            const existingUri = vscode.Uri.joinPath(storiesDir, existingName);
                            const existingStat = await vscode.workspace.fs.stat(existingUri);

                            if (existingStat.size >= rawBytes.byteLength) {
                                migratorLogger.debug(`[Migration] ${existingName} already up-to-date (${existingStat.size}B ≥ ${rawBytes.byteLength}B) — skipping`);
                                shouldWrite = false;
                                skippedCount++;
                            } else {
                                migratorLogger.debug(`[Migration] ${existingName} is smaller (${existingStat.size}B < ${rawBytes.byteLength}B) — replacing with richer version`);
                                try { await vscode.workspace.fs.delete(existingUri); } catch { /* best-effort */ }
                                targetFilename = existingName;
                            }
                        }

                        if (shouldWrite) {
                            const canonicalUri = vscode.Uri.joinPath(storiesDir, targetFilename);
                            await vscode.workspace.fs.writeFile(canonicalUri, rawBytes);
                            migratorLogger.debug(`[Migration] Migrated ${epicDirName}/implementation/${name} → stories/${targetFilename}`);
                            migratedCount++;
                        }
                    } catch (err) {
                        migratorLogger.debug(`[Migration] Error processing ${epicDirName}/implementation/${name}: ${err}`);
                        skippedCount++;
                    }
                }

                const deprecatedDir = vscode.Uri.joinPath(epicFolderUri, '.deprecated_implementation');
                try {
                    await vscode.workspace.fs.rename(implDir, deprecatedDir, { overwrite: false });
                    migratorLogger.debug(`[Migration] ${epicDirName}: Renamed implementation/ → .deprecated_implementation/ (${migratedCount} migrated, ${skippedCount} skipped)`);
                } catch (err) {
                    migratorLogger.debug(`[Migration] ${epicDirName}: Could not rename implementation/: ${err}`);
                }

                totalMigrated += migratedCount;
                totalSkipped += skippedCount;
            }

            if (totalMigrated > 0) {
                void vscode.window.showInformationMessage(
                    `Migrated ${totalMigrated} story file${totalMigrated > 1 ? 's' : ''} from epic implementation/ folders to canonical stories/ locations. ` +
                    `The old implementation/ folders have been renamed to .deprecated_implementation/ for safety.`,
                );
            }
        } catch (err) {
            migratorLogger.debug(`[Migration] migrateImplementationFolder failed: ${err}`);
        }
    }

    /**
     * Migrate inline stories from epics.json into standalone story files,
     * and remove the legacy requirementsInventory key.
     */
    async migrateToReferenceArchitecture(): Promise<{ success: boolean; summary: string }> {
        const sourceFolder = this.getSourceFolder();
        if (!sourceFolder) {
            return { success: false, summary: 'No project loaded. Open a project first.' };
        }

        logDebug('[Migration] Starting migrate-to-reference-architecture...');

        try {
            const epicsFile = this.getSourceFiles().get('epics');
            if (!epicsFile) {
                return { success: false, summary: 'No epics.json found in this project.' };
            }

            const raw = await vscode.workspace.fs.readFile(epicsFile);
            const epicsJson = JSON.parse(Buffer.from(raw).toString('utf-8'));

            const backupUri = vscode.Uri.file(epicsFile.fsPath + '.pre-migration.bak');
            await vscode.workspace.fs.writeFile(backupUri, raw);
            logDebug(`[Migration] Backup created: ${backupUri.fsPath}`);

            const epics = epicsJson.content?.epics || epicsJson.epics || [];
            let extractedCount = 0;
            let skippedCount = 0;
            const migrationLog: string[] = [];

            for (const epic of epics) {
                if (!Array.isArray(epic.stories)) continue;

                const storyRefs: string[] = [];

                for (const story of epic.stories) {
                    if (typeof story === 'string') {
                        storyRefs.push(story);
                        continue;
                    }

                    const storyId = story.id || story.storyId || `S${epic.id?.replace(/\D/g, '') || '0'}.${extractedCount + 1}`;
                    const epicId = epic.id || 'EPIC-1';

                    const storyFileContent = {
                        metadata: {
                            schemaVersion: '1.0.0',
                            artifactType: 'story',
                            timestamps: {
                                created: new Date().toISOString(),
                                lastModified: new Date().toISOString(),
                            },
                            status: 'draft',
                        },
                        content: {
                            id: storyId,
                            epicId: epicId,
                            epicTitle: epic.title || '',
                            title: story.title || 'Untitled Story',
                            status: story.status || 'draft',
                            ...story,
                        },
                    };
                    storyFileContent.content.id = storyId;
                    storyFileContent.content.epicId = epicId;

                    const safeStoryId = String(storyId).replace(/[^a-zA-Z0-9.-]/g, '-');
                    const fileName = `${safeStoryId}.json`;
                    const storiesDir = vscode.Uri.joinPath(
                        ArtifactFileWriter.epicScopedDir(sourceFolder, epicId),
                        'stories',
                    );
                    try { await vscode.workspace.fs.createDirectory(storiesDir); } catch { /* exists */ }
                    const fileUri = vscode.Uri.joinPath(storiesDir, fileName);

                    let alreadyExists = false;
                    try {
                        await vscode.workspace.fs.stat(fileUri);
                        alreadyExists = true;
                    } catch { /* file doesn't exist */ }

                    if (alreadyExists) {
                        logDebug(`[Migration] Story file already exists: ${fileName} — skipping (standalone wins)`);
                        skippedCount++;
                    } else {
                        const migFormat = this.getOutputFormat();
                        if (migFormat === 'json' || migFormat === 'dual') {
                            const content = Buffer.from(JSON.stringify(storyFileContent, null, 2), 'utf-8');
                            await vscode.workspace.fs.writeFile(fileUri, content);
                        }
                        if (migFormat === 'markdown' || migFormat === 'dual') {
                            const sc = storyFileContent.content;
                            let sMd = `# Story ${sc.id}: ${sc.title}\n\n`;
                            sMd += `**Epic:** ${sc.epicId} — ${sc.epicTitle}\n`;
                            sMd += `**Status:** ${sc.status || 'draft'}\n\n`;
                            if (sc.userStory) sMd += `${sc.userStory}\n\n`;
                            const mdName = fileName.replace(/\.json$/, '.md');
                            await writeMarkdownCompanion(fileUri, mdName, sMd);
                        }
                        extractedCount++;
                        migrationLog.push(`  Extracted: ${storyId} → ${fileName}`);
                    }

                    storyRefs.push(storyId);
                }

                epic.stories = storyRefs;
            }

            let reqsRemoved = false;
            if (epicsJson.content?.requirementsInventory) {
                delete epicsJson.content.requirementsInventory;
                reqsRemoved = true;
                migrationLog.push('  Removed requirementsInventory from epics.json (PRD is authoritative)');
            }

            const migEpicsFormat = this.getOutputFormat();
            if (migEpicsFormat === 'json' || migEpicsFormat === 'dual') {
                const updatedContent = Buffer.from(JSON.stringify(epicsJson, null, 2), 'utf-8');
                await vscode.workspace.fs.writeFile(epicsFile, updatedContent);
            }
            logDebug('[Migration] Updated epics.json with story refs');

            await this.loadFromFolder(sourceFolder);
            await this.syncToFiles();
            migrationLog.push('  Re-synced all project files to enforce slim epic format');

            const maxLogLines = 10;
            const truncatedLog = migrationLog.length > maxLogLines
                ? [...migrationLog.slice(0, maxLogLines), `  ... and ${migrationLog.length - maxLogLines} more files`]
                : migrationLog;

            const summary = [
                'Migration complete:',
                `  ${extractedCount} stories extracted to files`,
                `  ${skippedCount} stories skipped (files already exist)`,
                reqsRemoved ? '  requirementsInventory removed from epics.json' : '',
                `  Backup: ${backupUri.fsPath}`,
                '',
                ...truncatedLog,
            ].filter(Boolean).join('\n');

            logDebug(`[Migration] ${summary}`);
            return { success: true, summary };

        } catch (err: any) {
            const msg = `Migration failed: ${err?.message ?? err}`;
            logDebug(`[Migration] ${msg}`);
            return { success: false, summary: msg };
        }
    }

    /**
     * Restore epics.json from the pre-migration backup.
     */
    async restorePreMigrationBackup(): Promise<{ success: boolean; summary: string }> {
        const sourceFolder = this.getSourceFolder();
        if (!sourceFolder) {
            return { success: false, summary: 'No project loaded.' };
        }

        const epicsFile = this.getSourceFiles().get('epics');
        if (!epicsFile) {
            return { success: false, summary: 'No epics.json found.' };
        }

        const backupUri = vscode.Uri.file(epicsFile.fsPath + '.pre-migration.bak');
        try {
            const backupContent = await vscode.workspace.fs.readFile(backupUri);
            await vscode.workspace.fs.writeFile(epicsFile, backupContent);
            logDebug(`[Migration] Restored epics.json from backup: ${backupUri.fsPath}`);

            await this.loadFromFolder(sourceFolder);

            return {
                success: true,
                summary: `Restored epics.json from pre-migration backup.\nNote: Extracted story files in epics/epic-{N}/stories/ were NOT deleted.\nYou can delete them manually if needed.`,
            };
        } catch (err: any) {
            return {
                success: false,
                summary: `Restore failed: ${err?.message ?? err}\nBackup file may not exist at: ${backupUri.fsPath}`,
            };
        }
    }
}
