import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import type { Epic, Story } from '../types';

const syncLogger = createLogger('sprint-status-sync');
const logDebug = (...args: unknown[]) => syncLogger.debug(...args);

/**
 * SprintStatusSync — extracted collaborator that handles the Sprint-Status
 * YAML → JSON sync pipeline previously embedded in ArtifactStore.
 *
 * Dependencies on store state (sourceFolder, artifacts map, sourceFiles map,
 * output format, syncingUntil timestamp) are injected via constructor args
 * rather than reached back into the store, per the Phase 4 extraction plan.
 */
export class SprintStatusSync {
  constructor(
    private getSourceFolder: () => vscode.Uri | null,
    private getArtifacts: () => Map<string, any>,
    private getSourceFiles: () => Map<string, vscode.Uri>,
    private getOutputFormat: () => 'json' | 'markdown' | 'dual',
    private setSyncingUntil: (ms: number) => void,
  ) {}

  // ── Pure mappers (public for unit-testability) ──────────────────────────

  mapYamlStatusToInternal(rawStatus: string): string | undefined {
    switch (rawStatus) {
      case 'ready-for-dev': return 'ready';
      case 'in-progress': return 'in-progress';
      case 'review': return 'review';
      case 'done': return 'done';
      case 'backlog': return 'draft';
      default: return undefined;
    }
  }

  mapInternalStatusToYaml(status: string): string {
    switch (status) {
      case 'ready': return 'ready-for-dev';
      case 'draft': return 'backlog';
      case 'in-progress': return 'in-progress';
      case 'review': return 'review';
      case 'done': return 'done';
      default: return status;
    }
  }

  // ── File discovery ──────────────────────────────────────────────────────

  async findSprintStatusYaml(folderUri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const candidates = ['sprint-status.yaml', 'sprint-status.yml'];
    // Root folder
    for (const name of candidates) {
      const candidate = vscode.Uri.joinPath(folderUri, name);
      try {
        await vscode.workspace.fs.stat(candidate);
        return candidate;
      } catch { /* not found */ }
    }
    // bmm/ subfolder
    const bmmDir = vscode.Uri.joinPath(folderUri, 'bmm');
    for (const name of candidates) {
      const candidate = vscode.Uri.joinPath(bmmDir, name);
      try {
        await vscode.workspace.fs.stat(candidate);
        return candidate;
      } catch { /* not found */ }
    }
    return undefined;
  }

  // ── YAML parsing ────────────────────────────────────────────────────────

  async parseSprintStatusYamlFile(fileUri: vscode.Uri): Promise<Record<string, string>> {
    const raw = await vscode.workspace.fs.readFile(fileUri);
    const content = Buffer.from(raw).toString('utf-8');
    const statusMap: Record<string, string> = {};
    let inDevStatus = false;

    for (const line of content.split('\n')) {
      if (/^\s*development_status\s*:\s*$/.test(line)) {
        inDevStatus = true;
        continue;
      }
      if (inDevStatus) {
        // Exit on a new top-level key (non-indented, non-comment line)
        if (/^[a-zA-Z]/.test(line) && !/^\s/.test(line)) {
          break;
        }
        const match = line.match(/^\s+([^:]+?)\s*:\s*(.+)$/);
        if (match) {
          statusMap[match[1].trim()] = match[2].trim();
        }
      }
    }
    return statusMap;
  }

  // ── Reverse sync (in-memory → YAML) ─────────────────────────────────────

  async syncStatusToYaml(
    type: 'epic' | 'story',
    epicId: string,
    storyId: string | undefined,
    newStatus: string,
  ): Promise<void> {
    const sourceFolder = this.getSourceFolder();
    if (!sourceFolder) return;

    const yamlUri = await this.findSprintStatusYaml(sourceFolder);
    if (!yamlUri) return;

    try {
      const raw = await vscode.workspace.fs.readFile(yamlUri);
      let content = Buffer.from(raw).toString('utf-8');
      const yamlStatus = this.mapInternalStatusToYaml(newStatus);

      // Build lookup key from prefix + id
      const id = type === 'story' && storyId ? storyId : epicId;
      const keyPrefix = type === 'epic'
        ? epicId.replace(/^EPIC-/i, '')
        : (storyId || '').replace(/^S-?/i, '').replace(/\./g, '-');
      const keyPattern = new RegExp(`^(\\s+)(${keyPrefix}[\\w-]*)\\s*:\\s*.*$`, 'm');

      let inDevStatus = false;
      const lines = content.split('\n');
      let updated = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^\s*development_status\s*:\s*$/.test(line)) {
          inDevStatus = true;
          continue;
        }
        if (inDevStatus && /^[a-zA-Z]/.test(line) && !/^\s/.test(line)) {
          break;
        }
        if (inDevStatus) {
          const match = line.match(/^(\s+)([^:]+?)\s*:\s*(.+)$/);
          if (match && match[2].trim().startsWith(keyPrefix)) {
            const indent = match[1];
            lines[i] = `${indent}${match[2].trim()}: ${yamlStatus}`;
            updated = true;
            break;
          }
        }
      }

      // Update last_updated timestamp
      if (updated) {
        const now = new Date().toISOString().split('T')[0];
        for (let i = 0; i < lines.length; i++) {
          if (/^\s*last_updated\s*:/.test(lines[i])) {
            lines[i] = lines[i].replace(/:.*$/, `: ${now}`);
            break;
          }
        }
        // Suppress file-watcher self-trigger
        this.setSyncingUntil(Date.now() + 3000);
        await vscode.workspace.fs.writeFile(yamlUri, Buffer.from(lines.join('\n'), 'utf-8'));
        logDebug(`[SprintStatusSync] Synced ${type} ${id} → ${yamlStatus} in ${yamlUri.fsPath}`);
      }
    } catch (err: any) {
      logDebug(`[SprintStatusSync] Failed to sync ${type} status to YAML: ${err?.message ?? err}`);
    }
  }

  // ── Mismatch detection ──────────────────────────────────────────────────

  detectSprintStatusMismatches(
    statusMap: Record<string, string>,
  ): { key: string; type: 'epic' | 'story'; epicId: string; storyId?: string; currentStatus: string; newStatus: string }[] {
    const artifacts = this.getArtifacts();
    const epics: any[] = artifacts.get('epics') || [];
    const mismatches: { key: string; type: 'epic' | 'story'; epicId: string; storyId?: string; currentStatus: string; newStatus: string }[] = [];

    for (const [key, rawStatus] of Object.entries(statusMap)) {
      const newStatus = this.mapYamlStatusToInternal(rawStatus);
      if (!newStatus) continue;

      const isEpic = key.toLowerCase().startsWith('epic');
      if (isEpic) {
        const epicId = key.replace(/^epic-/i, '');
        const ep = epics.find((e: any) => e.id === epicId || e.id === `EPIC-${epicId}` || String(e.id) === epicId);
        if (ep) {
          const currentStatus = ep.status || 'draft';
          if (currentStatus !== newStatus) {
            mismatches.push({ key, type: 'epic', epicId: String(ep.id), currentStatus, newStatus });
          }
        }
      } else {
        // Story key format: X-Y-slug → storyId S-X.Y
        const parts = key.split('-');
        if (parts.length >= 2) {
          const storyId = `S-${parts[0]}.${parts[1]}`;
          for (const ep of epics) {
            const st = (ep.stories || []).find((s: any) => s.id === storyId);
            if (st) {
              const currentStatus = st.status || 'draft';
              if (currentStatus !== newStatus) {
                mismatches.push({ key, type: 'story', epicId: String(ep.id), storyId, currentStatus, newStatus });
              }
              break;
            }
          }
        }
      }
    }

    return mismatches;
  }

  // ── Surgical disk patching ──────────────────────────────────────────────

  async patchEpicStatusOnDisk(epicId: string, newStatus: string, skipYamlSync = false): Promise<boolean> {
    const artifacts = this.getArtifacts();
    const sourceFolder = this.getSourceFolder();
    if (!sourceFolder) return false;

    const epics: Epic[] = artifacts.get('epics') || [];
    const epicIndex = epics.findIndex((e: Epic) => e.id === epicId);
    if (epicIndex < 0) return false;

    const epic = epics[epicIndex];
    const oldStatus = epic.status;

    // In-memory update
    epic.status = newStatus as Epic['status'];
    artifacts.set('epics', [...epics]);

    // Disk update — find the epic JSON file
    try {
      const sourceFiles = this.getSourceFiles();
      const epicKey = `epic:${epicId}`;
      let fileUri = sourceFiles.get(epicKey);
      if (!fileUri) {
        // Fall back to scanning epics/ directory
        const epicNum = epicId.replace(/\D/g, '') || '0';
        const epicDir = vscode.Uri.joinPath(sourceFolder, 'epics', `epic-${epicNum}`);
        const rootEpicFile = vscode.Uri.joinPath(sourceFolder, `epic-${epicId.toLowerCase()}.json`);
        try { await vscode.workspace.fs.stat(rootEpicFile); fileUri = rootEpicFile; } catch { /* try dir */ }
        if (!fileUri) {
          try {
            const entries = await vscode.workspace.fs.readDirectory(epicDir);
            const jsonFile = entries.find(([n]) => n.endsWith('.json'));
            if (jsonFile) fileUri = vscode.Uri.joinPath(epicDir, jsonFile[0]);
          } catch { /* dir may not exist */ }
        }
      }

      if (fileUri) {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
        if (data.metadata) {
          data.metadata.status = newStatus;
          data.metadata.timestamps = data.metadata.timestamps || {};
          data.metadata.timestamps.lastModified = new Date().toISOString();
        }
        if (data.content) {
          data.content.status = newStatus;
        }
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
        logDebug(`[SprintStatusSync] Patched epic ${epicId} status on disk: ${oldStatus} → ${newStatus}`);
      }
    } catch (err: any) {
      logDebug(`[SprintStatusSync] Failed to patch epic ${epicId} on disk: ${err?.message ?? err}`);
    }

    if (!skipYamlSync) {
      await this.syncStatusToYaml('epic', epicId, undefined, newStatus);
    }
    return true;
  }

  async patchStoryStatusOnDisk(
    epicId: string, storyId: string, newStatus: string, skipYamlSync = false,
  ): Promise<boolean> {
    const artifacts = this.getArtifacts();
    const sourceFolder = this.getSourceFolder();
    if (!sourceFolder) return false;

    const epics: Epic[] = artifacts.get('epics') || [];
    let storyFound = false;

    for (const epic of epics) {
      const storyIndex = (epic.stories || []).findIndex((s: Story) => s.id === storyId);
      if (storyIndex >= 0) {
        const story = epic.stories![storyIndex];
        const oldStatus = story.status;
        story.status = newStatus as Story['status'];
        storyFound = true;
        break;
      }
    }

    if (!storyFound) return false;
    artifacts.set('epics', [...epics]);

    // Disk patch — find standalone story JSON file
    try {
      const sourceFiles = this.getSourceFiles();
      const storyKey = `story:${storyId}`;
      let fileUri = sourceFiles.get(storyKey);
      if (!fileUri) {
        const epicNum = epicId.replace(/\D/g, '') || '0';
        const epicDir = vscode.Uri.joinPath(sourceFolder, 'epics', `epic-${epicNum}`);
        const storiesDir = vscode.Uri.joinPath(epicDir, 'stories');
        try {
          const entries = await vscode.workspace.fs.readDirectory(storiesDir);
          const jsonFile = entries.find(([n]) => n.endsWith('.json'));
          if (jsonFile) fileUri = vscode.Uri.joinPath(storiesDir, jsonFile[0]);
        } catch { /* dir may not exist */ }
      }

      if (fileUri) {
        const raw = await vscode.workspace.fs.readFile(fileUri);
        const data = JSON.parse(Buffer.from(raw).toString('utf-8'));
        if (data.metadata) {
          data.metadata.status = newStatus;
          data.metadata.timestamps = data.metadata.timestamps || {};
          data.metadata.timestamps.lastModified = new Date().toISOString();
        }
        if (data.content) {
          data.content.status = newStatus;
        }
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(JSON.stringify(data, null, 2), 'utf-8'));
        logDebug(`[SprintStatusSync] Patched story ${storyId} status on disk → ${newStatus}`);
      }
    } catch (err: any) {
      logDebug(`[SprintStatusSync] Failed to patch story ${storyId} on disk: ${err?.message ?? err}`);
    }

    if (!skipYamlSync) {
      await this.syncStatusToYaml('story', epicId, storyId, newStatus);
    }
    return true;
  }
}
