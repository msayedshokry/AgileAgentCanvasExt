import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { resolveArtifactTargetUri, writeJsonFile, writeMarkdownCompanion } from './artifact-file-io';
import type { BmadArtifacts } from '../types';

const writerLogger = createLogger('artifact-file-writer');
const logDebug = (...args: unknown[]) => writerLogger.debug(...args);

/**
 * ArtifactFileWriter — extracted collaborator that handles generic artifact
 * serialization to disk (JSON + Markdown companion files).
 * Previously embedded in ArtifactStore.
 */
export class ArtifactFileWriter {
  constructor(
    private sourceFiles: Map<string, vscode.Uri>,
    private getSourceFolder: () => vscode.Uri | null,
    private getOutputFormat: () => 'json' | 'markdown' | 'dual',
  ) {}

  // ── Helpers (copied from ArtifactStore to avoid circular deps) ──────────

  static perIdKey(prefix: string, id: string): string {
    return `${prefix}:${id}`;
  }

  // ── Disk writer methods ─────────────────────────────────────────────────

  async deleteSourceFile(key: string): Promise<void> {
    if (!this.sourceFiles.has(key)) return;
    const fileUri = this.sourceFiles.get(key)!;
    try {
      await vscode.workspace.fs.delete(fileUri);
      this.sourceFiles.delete(key);
      logDebug(`Deleted ${key} file from disk: ${fileUri.fsPath}`);
    } catch (e) {
      // File may already be gone
      this.sourceFiles.delete(key);
      logDebug(`Could not delete ${key} file (may already be removed):`, e);
    }
  }

  async saveGenericArtifactToFile(
    storeKey: string,
    fileSlug: string,
    artifact: Record<string, unknown>,
    state: BmadArtifacts,
    baseUri: vscode.Uri,
  ): Promise<void> {
    let targetUri: vscode.Uri;

    // Determine the output folder based on the artifact module
    let folder: string;
    const baseType = storeKey.split(':')[0];
    const teaTypes = ['traceabilityMatrix', 'testReview', 'nfrAssessment', 'testFramework', 'ciPipeline', 'automationSummary', 'atddChecklist'];
    const cisTypes = ['storytelling', 'problemSolving', 'innovationStrategy', 'designThinking'];
    if (teaTypes.includes(baseType)) {
      folder = 'testing';
    } else if (cisTypes.includes(baseType)) {
      folder = 'cis';
    } else {
      folder = 'bmm';
    }
    const folderUri = vscode.Uri.joinPath(baseUri, folder);
    try {
      await vscode.workspace.fs.createDirectory(folderUri);
    } catch {
      // Folder might already exist
    }
    targetUri = vscode.Uri.joinPath(folderUri, `${fileSlug}.json`);

    // Build the JSON envelope: separate id/status into metadata, rest is content
    const { id, status, ...contentFields } = artifact;
    const jsonEnvelope = {
      metadata: {
        schemaVersion: '1.0.0',
        artifactType: fileSlug,
        workflowName: 'agileagentcanvas',
        projectName: state.projectName,
        timestamps: {
          created: new Date().toISOString(),
          lastModified: new Date().toISOString(),
        },
        status: (status as string) || 'draft',
      },
      content: contentFields,
    };

    // Write JSON if output format includes JSON
    const outputFormat = this.getOutputFormat();
    if (outputFormat === 'json' || outputFormat === 'dual') {
      await writeJsonFile(targetUri, jsonEnvelope);
      logDebug(`Saved ${fileSlug} to:`, targetUri.fsPath);
    }

    // Write markdown companion if output format includes markdown
    if (outputFormat === 'markdown' || outputFormat === 'dual') {
      const md = this.generateGenericArtifactMarkdown(fileSlug, artifact, state);
      const mdUri = await writeMarkdownCompanion(targetUri, `${fileSlug}.md`, md);
      logDebug('Saved markdown companion:', mdUri.fsPath);
    }

    this.sourceFiles.set(storeKey, targetUri);
  }

  // ── Markdown generation ─────────────────────────────────────────────────

  generateGenericArtifactMarkdown(
    fileSlug: string,
    artifact: Record<string, unknown>,
    state: BmadArtifacts,
  ): string {
    // Convert kebab-case to Title Case for heading
    const title = fileSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    let md = `# ${state.projectName} - ${title}\n\n`;

    const renderValue = (value: unknown, depth: number): string => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) {
        return value.map((item, i) => {
          if (typeof item === 'string') return `- ${item}`;
          if (typeof item === 'object' && item !== null) {
            const entries = Object.entries(item as Record<string, unknown>);
            if (entries.length === 0) return `- (empty)`;
            // For objects in arrays, render as a bullet with key-value sub-items
            const firstVal = entries[0][1];
            const label = typeof firstVal === 'string' ? firstVal : `Item ${i + 1}`;
            let result = `- **${label}**`;
            for (const [k, v] of entries.slice(typeof firstVal === 'string' ? 1 : 0)) {
              if (v === null || v === undefined) continue;
              if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
                result += `\n  - ${formatKey(k)}: ${v}`;
              } else if (Array.isArray(v)) {
                result += `\n  - ${formatKey(k)}: ${(v as unknown[]).filter(x => x != null).join(', ')}`;
              }
            }
            return result;
          }
          return `- ${String(item)}`;
        }).join('\n');
      }
      if (typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>);
        return entries.map(([k, v]) => {
          if (v === null || v === undefined) return '';
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            return `- **${formatKey(k)}**: ${v}`;
          }
          if (Array.isArray(v)) {
            return `**${formatKey(k)}**:\n${renderValue(v, depth + 1)}`;
          }
          if (typeof v === 'object') {
            return `**${formatKey(k)}**:\n${renderValue(v, depth + 1)}`;
          }
          return '';
        }).filter(Boolean).join('\n');
      }
      return String(value);
    };

    const formatKey = (key: string): string => {
      // camelCase to Title Case
      return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
    };

    // Skip id and status (already in header / metadata)
    for (const [key, value] of Object.entries(artifact)) {
      if (key === 'id' || key === 'status') continue;
      if (value === null || value === undefined) continue;

      const heading = formatKey(key);
      md += `## ${heading}\n\n`;

      if (typeof value === 'string') {
        md += `${value}\n\n`;
      } else {
        md += `${renderValue(value, 0)}\n\n`;
      }
    }

    return md;
  }
}
