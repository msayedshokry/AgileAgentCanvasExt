import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';

const migratorLogger = createLogger('artifact-migrator');

/**
 * ArtifactMigrator — extracted collaborator that handles folder-structure
 * migrations (e.g., migrating legacy implementation/ folders to canonical
 * stories/ locations).
 * Previously embedded in ArtifactStore.migrateImplementationFolder().
 */
export class ArtifactMigrator {
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
}
