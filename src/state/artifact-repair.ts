import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { schemaValidator } from './schema-validator';
import { repairArtifactData } from './schema-artifact-mapper';

const repairLogger = createLogger('artifact-repair');
const logDebug = (...args: unknown[]) => repairLogger.debug(...args);

/**
 * ArtifactRepairer — schema-aware on-disk repair pass.
 *
 * Reads every JSON file from the source folder, applies targeted
 * schema-conformance repairs, writes repaired files back to disk.
 *
 * Repairs applied per file:
 *   • Ensure `metadata.timestamps.created` exists (all types with metadata)
 *   • Strip properties not allowed by `additionalProperties: false`
 *   • product-brief / vision: add empty `content.vision` if missing;
 *     coerce `targetUsers` string items to `{ persona: string }` objects
 *     (etc.; see `schema-artifact-mapper.ts` for the full rule set).
 *
 * Dependencies on store state are injected via constructor args to
 * avoid circular imports with ArtifactStore.
 */
export class ArtifactRepairer {
    constructor(
        private getSourceFolder: () => vscode.Uri | null,
        private setSyncingUntil: (ms: number) => void,
        private markDirty: () => void,
        private getOutputFormat: () => 'json' | 'markdown' | 'dual',
        private syncToFiles: () => Promise<void>,
        private findAllJsonFiles: (folderUri: vscode.Uri) => Promise<vscode.Uri[]>,
        private detectArtifactType: (data: any, fileName: string) => string,
    ) {}

    /**
     * Read every JSON file, apply targeted repairs, write repaired
     * files back.  Then run the normal `syncToFiles()` pass ONLY if
     * there is no source folder (the fallback path).
     *
     * NOTE: We intentionally do NOT call `syncToFiles()` in the
     * normal path. `syncToFiles()` re-serialises from in-memory
     * state which may still contain the unrepaired data, so calling
     * it would overwrite our on-disk fixes.  Callers (e.g.
     * `webview-message-handler`) reload from folder after this method
     * returns, picking up the repaired files naturally.
     */
    async fixAndSyncToFiles(): Promise<void> {
        logDebug('[ArtifactRepairer] fixAndSyncToFiles: starting schema-aware repair pass');
        const sourceFolder = this.getSourceFolder();
        if (!sourceFolder) {
            logDebug('[ArtifactRepairer] fixAndSyncToFiles: no sourceFolder — falling back to plain syncToFiles');
            this.markDirty(); // Force sync even if not otherwise dirty
            await this.syncToFiles();
            return;
        }

        // Mark syncing to suppress file-watcher
        this.setSyncingUntil(Date.now() + 60_000);

        try {
            const allJsonFiles = await this.findAllJsonFiles(sourceFolder);
            logDebug(`[ArtifactRepairer] fixAndSyncToFiles: found ${allJsonFiles.length} JSON files`);

            let repaired = 0;
            for (const fileUri of allJsonFiles) {
                try {
                    const raw = await vscode.workspace.fs.readFile(fileUri);
                    const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
                    const sfBase = sourceFolder.path.replace(/\/$/, '');
                    const fileName = fileUri.path.startsWith(sfBase)
                        ? fileUri.path.slice(sfBase.length + 1)
                        : fileUri.path.split('/').pop() || '';
                    const artifactType = data.metadata?.artifactType || this.detectArtifactType(data, fileName);

                    if (!artifactType || artifactType === 'unknown') continue;

                    // Validate before repair — skip files that are already valid
                    if (schemaValidator.isInitialized()) {
                        const pre = schemaValidator.validate(artifactType, data, fileName);
                        if (pre.valid) continue;
                    }

                    const fixed = repairArtifactData(data, artifactType, fileName);
                    if (fixed !== data) {
                        const repairFormat = this.getOutputFormat();
                        if (repairFormat === 'json' || repairFormat === 'dual') {
                            await vscode.workspace.fs.writeFile(
                                fileUri,
                                Buffer.from(JSON.stringify(fixed, null, 2), 'utf-8'),
                            );
                        }
                        // Intentionally NO markdown companion write here.
                        // fixAndSyncToFiles repairs JSON only; syncToFiles is NOT
                        // called afterward, so no derived MD is produced.
                        repaired++;
                        logDebug(`[ArtifactRepairer] fixAndSyncToFiles: repaired ${fileName}`);
                    }
                } catch (e) {
                    logDebug(`[ArtifactRepairer] fixAndSyncToFiles: error repairing ${fileUri.fsPath}: ${e}`);
                }
            }

            logDebug(`[ArtifactRepairer] fixAndSyncToFiles: repaired ${repaired}/${allJsonFiles.length} files`);
        } finally {
            this.setSyncingUntil(Date.now() + 500);
        }
    }
}
