import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { findAllJsonFiles } from './artifact-load-helpers';

const backupLogger = createLogger('artifact-backup');
const logDebug = (...args: unknown[]) => backupLogger.debug(...args);

/**
 * Backup all artifact JSON files to a timestamped .bmad-backup directory.
 */
export async function backupArtifactFiles(sourceFolder: vscode.Uri): Promise<vscode.Uri | null> {
    const results: vscode.Uri[] = [];

    const parentUri = vscode.Uri.joinPath(sourceFolder, '..');
    const backupRoot = vscode.Uri.joinPath(parentUri, '.bmad-backup');
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
    const backupDir = vscode.Uri.joinPath(backupRoot, timestamp);

    try {
        await vscode.workspace.fs.createDirectory(backupDir);
    } catch (err) {
        logDebug(`[Backup] Could not create backup directory ${backupDir.fsPath}: ${err}`);
        return null;
    }

    const allJsonFiles = await findAllJsonFiles(sourceFolder);
    for (const fileUri of allJsonFiles) {
        try {
            // Compute relative path from sourceFolder to preserve structure
            const relPath = fileUri.fsPath.replace(sourceFolder.fsPath, '').replace(/^[/\\]/, '');
            const destUri = vscode.Uri.joinPath(backupDir, relPath);

            // Ensure parent directory exists
            const destParent = vscode.Uri.joinPath(destUri, '..');
            try { await vscode.workspace.fs.createDirectory(destParent); } catch { /* may exist */ }

            await vscode.workspace.fs.copy(fileUri, destUri, { overwrite: true });
            results.push(destUri);
        } catch (err) {
            logDebug(`[Backup] Could not backup ${fileUri.fsPath}: ${err}`);
        }
    }

    logDebug(`[Backup] Backed up ${results.length} files to ${backupDir.fsPath}`);
    return backupDir;
}

/**
 * Prune old backup directories, keeping only the most recent `keepCount`.
 */
export async function pruneOldBackups(sourceFolder: vscode.Uri, keepCount = 5): Promise<void> {
    const parentUri = vscode.Uri.joinPath(sourceFolder, '..');
    const backupRoot = vscode.Uri.joinPath(parentUri, '.bmad-backup');

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(backupRoot);
    } catch {
        return; // No backup directory
    }

    const timestampDirs = entries
        .filter(([, type]) => type === vscode.FileType.Directory)
        .map(([name]) => name)
        .sort(); // ISO timestamps sort lexicographically

    const toDelete = timestampDirs.slice(0, Math.max(0, timestampDirs.length - keepCount));
    for (const dirName of toDelete) {
        const dirUri = vscode.Uri.joinPath(backupRoot, dirName);
        try {
            await vscode.workspace.fs.delete(dirUri, { recursive: true });
            logDebug(`[Backup] Pruned old backup: ${dirName}`);
        } catch (err) {
            logDebug(`[Backup] Could not prune ${dirName}: ${err}`);
        }
    }
}
