import * as vscode from 'vscode';
import { createLogger } from '../utils/logger';
import { resolveArtifactTargetUri, writeJsonFile, writeMarkdownCompanion } from './artifact-file-io';
import { generateVisionMarkdown, generateSingleEpicMarkdown, generateEpicsMarkdown, generateProductBriefMarkdown, generatePRDMarkdown, generateArchitectureMarkdown, generateTestStrategyMarkdown, generateTestDesignMarkdown } from './artifact-markdown-generator';
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
    private callbacks?: {
      reloadState?: (folderUri: vscode.Uri) => Promise<void>;
      syncFiles?: () => Promise<void>;
    },
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

  // ── Path helpers ───────────────────────────────────────────────────

  /**
   * Build the epic-scoped directory path for a given epic ID.
   * E.g. epicId = 'EPIC-3' → baseUri/epics/epic-3
   *      epicId = '7'      → baseUri/epics/epic-7
   */
  static epicScopedDir(baseUri: vscode.Uri, epicId: string): vscode.Uri {
    const idSlug = String(epicId).replace(/\D/g, '') || '0';
    return vscode.Uri.joinPath(baseUri, 'epics', `epic-${idSlug}`);
  }

  // ── saveVisionToFile ───────────────────────────────────────────────────

  /**

   * Save vision to JSON file

   */

  async saveVisionToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const targetUri = vscode.Uri.joinPath(baseUri, 'vision.json');

      logDebug('Writing vision to:', targetUri.fsPath);


      const visionJson = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'vision',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: {

                  created: new Date().toISOString(),

                  lastModified: new Date().toISOString()

              },

              status: state.vision?.status || 'draft'

          },

          content: {

              productName: state.vision?.productName || state.projectName,

              vision: {

                  statement: state.vision?.vision?.statement || state.vision?.valueProposition || '',

                  problemStatement: state.vision?.vision?.problemStatement || state.vision?.problemStatement || '',

                  proposedSolution: state.vision?.vision?.proposedSolution || state.vision?.valueProposition || '',

              },

              targetUsers: (state.vision?.targetUsers || []).map((u: any) =>

                  typeof u === 'string' ? { persona: u, description: '' } : u

              ),

              successMetrics: (state.vision?.successMetrics || state.vision?.successCriteria || []).map((c: any) =>

                  typeof c === 'string' ? { metric: c, description: c } : c

              ),

          }

      };


      const outputFormat = this.getOutputFormat();


      if (outputFormat === 'json' || outputFormat === 'dual') {

          await vscode.workspace.fs.writeFile(

              targetUri,

              Buffer.from(JSON.stringify(visionJson, null, 2), 'utf-8')

          );

          logDebug('Saved vision to:', targetUri.fsPath);

      }


      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(targetUri, 'vision.md', generateVisionMarkdown(state));

          logDebug('Saved vision markdown companion:', mdUri.fsPath);

      }


      // Track the source file for future saves

      this.sourceFiles.set('vision', targetUri);

  }


  // ── saveStoriesToFile ───────────────────────────────────────────────────

  async saveStoriesToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const allEpics = state.epics || [];

      const outputFormat = this.getOutputFormat();


      for (const epic of allEpics) {

          if (!epic.stories || !Array.isArray(epic.stories) || epic.stories.length === 0) continue;


          // CR-5: hoist createDirectory to per-epic, not per-story

          const epicDir = ArtifactFileWriter.epicScopedDir(baseUri, epic.id);

          const storiesDir = vscode.Uri.joinPath(epicDir, 'stories');

          try { await vscode.workspace.fs.createDirectory(storiesDir); } catch { /* exists */ }


          const writtenFileNames = new Set<string>();


          for (const story of epic.stories) {

              const safeId = String(story.id).replace(/[^a-zA-Z0-9.-]/g, '-');

              const storyFileName = `${safeId}.json`;

              const storyFileUri = vscode.Uri.joinPath(storiesDir, storyFileName);

              writtenFileNames.add(storyFileName);


              const storyJson: Record<string, unknown> = {

                  metadata: {

                      schemaVersion: '1.0.0',

                      artifactType: 'story',

                      workflowName: 'agileagentcanvas',

                      projectName: state.projectName,

                      timestamps: {

                          // CR-2: only set lastModified; writeJsonFile will preserve

                          // the original `created` from the existing file on disk

                          lastModified: new Date().toISOString()

                      },

                      status: story.status || 'draft'

                  },

                  content: { ...story }

              };


              if (outputFormat === 'json' || outputFormat === 'dual') {

                  await writeJsonFile(storyFileUri, storyJson);

                  logDebug(`Saved standalone story file: ${storyFileName}`);

              }


              this.sourceFiles.set(ArtifactFileWriter.perIdKey('story', story.id), storyFileUri);

          }


          // CR-7: delete orphaned story files that are no longer in state

          try {

              const entries = await vscode.workspace.fs.readDirectory(storiesDir);

              for (const [name, type] of entries) {

                  if (type === vscode.FileType.File && name.endsWith('.json') && !writtenFileNames.has(name)) {

                      const orphanUri = vscode.Uri.joinPath(storiesDir, name);

                      try {

                          await vscode.workspace.fs.delete(orphanUri, { useTrash: true });

                          logDebug(`Deleted orphan story file: ${name}`);

                      } catch { /* ignore */ }

                  }

              }

          } catch {

              // stories/ directory listing failed — may not exist yet, ignore

          }

      }

  }


  // ── saveEpicsToFile ───────────────────────────────────────────────────

  async saveEpicsToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      // Resolve the directory that contains (or will contain) epics.json

      // Manifest always goes at project root

      const manifestDir = baseUri;

      logDebug('Writing epics manifest to project root:', manifestDir.fsPath);


      const manifestUri = vscode.Uri.joinPath(manifestDir, 'epics.json');


      const allEpics = state.epics || [];

      const epicRefs: { id: string; title: string; status: string; file: string }[] = [];

      const outputFormat = this.getOutputFormat();


      // ── Write each epic to its own file ────────────────────────────

      for (const epic of allEpics) {

          const epicFields = { ...epic };

          // Write slim storyRefs instead of full story objects to epic.json.

          // Full story data lives in standalone files: stories/{id}.json

          if (Array.isArray(epicFields.stories)) {

              (epicFields as Record<string, unknown>).storyRefs = epicFields.stories.map((story: any) => ({

                  id: story.id,

                  title: story.title || 'Untitled',

                  file: `stories/${String(story.id).replace(/[^a-zA-Z0-9.-]/g, '-')}.json`

              }));

              delete (epicFields as Record<string, unknown>).stories;

          }


          // Derive a filesystem-safe ID slug

          const idSlug = String(epic.id).replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();

          const epicFileName = `epic-${idSlug}.json`;


          // Epic-scoped directory: epics/epic-{N}/epic.json

          const epicDir = ArtifactFileWriter.epicScopedDir(baseUri, epic.id);

          try { await vscode.workspace.fs.createDirectory(epicDir); } catch { /* exists */ }

          const epicFileUri = vscode.Uri.joinPath(epicDir, 'epic.json');


          // === Extract useCases to separate file ===

          const ucToWrite = epicFields.useCases;

          if (Array.isArray(ucToWrite) && ucToWrite.length > 0) {

              const ucFileUri = vscode.Uri.joinPath(epicDir, 'use-cases.json');

              const ucJson = {

                  metadata: {

                      schemaVersion: '1.0.0',

                      artifactType: 'use-cases',

                      epicId: String(epic.id),

                      timestamps: { lastModified: new Date().toISOString() }

                  },

                  content: { useCases: ucToWrite }

              };

              if (outputFormat === 'json' || outputFormat === 'dual') {

                  await writeJsonFile(ucFileUri, ucJson);

                  logDebug(`Saved use-cases.json for epic ${epic.id}`);

              }

          } else {

              // Guard: don't delete existing on-disk use-cases when in-memory has none

              try {

                  const existingUcBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(epicDir, 'use-cases.json'));

                  const existingUc = JSON.parse(Buffer.from(existingUcBytes).toString('utf-8'));

                  if (existingUc.content?.useCases?.length) {

                      logDebug(`Preserved on-disk use-cases.json for epic ${epic.id} (memory had none)`);

                  }

              } catch { /* no existing file — nothing to preserve */ }

          }

          delete epicFields.useCases; // Don't embed in epic.json


          // === Extract testStrategy to separate file ===

          const tsToWrite = epicFields.testStrategy;

          if (tsToWrite && typeof tsToWrite === 'object' && Object.keys(tsToWrite).length > 0) {

              const testsDir = vscode.Uri.joinPath(epicDir, 'tests');

              try { await vscode.workspace.fs.createDirectory(testsDir); } catch { /* exists */ }

              const tsFileUri = vscode.Uri.joinPath(testsDir, 'test-strategy.json');

              const tsJson = {

                  metadata: {

                      schemaVersion: '1.0.0',

                      artifactType: 'epic-test-strategy',

                      epicId: String(epic.id),

                      timestamps: { lastModified: new Date().toISOString() }

                  },

                  content: tsToWrite

              };

              if (outputFormat === 'json' || outputFormat === 'dual') {

                  await writeJsonFile(tsFileUri, tsJson);

                  logDebug(`Saved test-strategy.json for epic ${epic.id}`);

              }

          } else {

              // Guard: don't delete existing on-disk test-strategy when in-memory has none

              try {

                  const existingTsBytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(epicDir, 'tests', 'test-strategy.json'));

                  const existingTs = JSON.parse(Buffer.from(existingTsBytes).toString('utf-8'));

                  if (existingTs.content && Object.keys(existingTs.content).length > 0) {

                      logDebug(`Preserved on-disk test-strategy.json for epic ${epic.id} (memory had none)`);

                  }

              } catch { /* no existing file — nothing to preserve */ }

          }

          delete epicFields.testStrategy; // Don't embed in epic.json


          const epicFileJson = {

              metadata: {

                  schemaVersion: '1.0.0',

                  artifactType: 'epic',

                  workflowName: 'agileagentcanvas',

                  projectName: state.projectName,

                  timestamps: {

                      created: new Date().toISOString(),

                      lastModified: new Date().toISOString()

                  },

                  status: epic.status || 'draft',

                  _llmHint: [

                      'This file contains epic metadata and lightweight storyRefs.',

                      'Full story content is at: stories/{storyId}.json (relative to this file).',

                      'Do NOT add full story objects to this file — they belong in standalone story files.'

                  ].join(' ')

              },

              content: epicFields

          };


          // Write JSON if output format includes JSON

          if (outputFormat === 'json' || outputFormat === 'dual') {

              await writeJsonFile(epicFileUri, epicFileJson);

              logDebug(`Saved standalone epic file: ${epicFileName}`);

          }


          // Write per-epic markdown companion if output format includes markdown

          if (outputFormat === 'markdown' || outputFormat === 'dual') {

              const epicMdFilename = `epic-${idSlug}.md`;

              const epicMd = generateSingleEpicMarkdown(epic, state);

              await writeMarkdownCompanion(epicFileUri, epicMdFilename, epicMd);

              logDebug(`Saved epic markdown companion: ${epicMdFilename}`);

          }


          // Track each epic file for reload awareness

          this.sourceFiles.set(ArtifactFileWriter.perIdKey('epic', epic.id), epicFileUri);


          epicRefs.push({

              id: epic.id,

              title: epic.title || 'Untitled Epic',

              status: epic.status || 'draft',

              file: `epics/epic-${idSlug}/epic.json`

          });

      }


      // ── Write the manifest ─────────────────────────────────────────

      const manifestJson = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'epics',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: {

                  created: new Date().toISOString(),

                  lastModified: new Date().toISOString()

              },

              status: 'draft',

              _llmHint: [

                  'This is a manifest file. Each epic\'s full content is in a separate file.',

                  'Epic files: epics/epic-{id}/epic.json (relative to this file)',

                  'Stories: epics/epic-{id}/stories/{id}.json  (e.g. S-1.2.json — immutable ID, no slugs)',

                  'Tests: epics/epic-{id}/tests/test-cases.json, test-design.json',

                  'To read a specific epic, load its file from the epics array below.'

              ].join(' ')

          },

          content: {

              overview: {

                  projectName: state.projectName,

                  totalEpics: allEpics.length,

                  totalStories: allEpics.reduce((sum, e) => sum + (e.stories?.length || 0), 0)

              },

              // NOTE: requirementsInventory is intentionally NOT written back

              // to epics.json. PRD is the single source of truth for requirements.

              epics: epicRefs

          }

      };


      // Write manifest JSON if output format includes JSON

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(manifestUri, manifestJson);

          logDebug('Saved epics manifest:', manifestUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(manifestUri, 'epics.md', generateEpicsMarkdown(state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      // Track the manifest file for future saves

      this.sourceFiles.set('epics', manifestUri);

  }


  // ── saveProductBriefToFile ───────────────────────────────────────────────────

  /**

   * Save product brief to JSON file

   */

  async saveProductBriefToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const targetUri = await resolveArtifactTargetUri({

          baseUri,

          folderName: 'discovery',

          fileName: 'product-brief.json'

      });

      const json = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'product-brief',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },

              status: state.productBrief?.status || 'draft'

          },

          content: (() => {

              if (!state.productBrief) return {};

              // Strip id and status — they live in metadata, not content

              const { id, status, ...contentFields } = state.productBrief;

              return contentFields;

          })()

      };

      // Write JSON if output format includes JSON

      const outputFormat = this.getOutputFormat();

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(targetUri, json);

          logDebug('Saved product-brief to:', targetUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(targetUri, 'product-brief.md', generateProductBriefMarkdown(state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      this.sourceFiles.set('productBrief', targetUri);

  }


  // ── savePRDToFile ───────────────────────────────────────────────────

  /**

   * Save PRD to JSON file

   */

  async savePRDToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const targetUri = await resolveArtifactTargetUri({

          baseUri,

          folderName: 'planning',

          fileName: 'prd.json'

      });

      const json = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'prd',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },

              status: state.prd?.status || 'draft'

          },

          content: (() => {

              if (!state.prd) return {};

              // Strip id, status, and UI-only ID-reference arrays — they aren't in the schema content

              const { id, status, functionalRequirementIds, nonFunctionalRequirementIds, technicalRequirementIds, ...contentFields } = state.prd;

              return contentFields;

          })()

      };

      // Write JSON if output format includes JSON

      const outputFormat = this.getOutputFormat();

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(targetUri, json);

          logDebug('Saved PRD to:', targetUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(targetUri, 'prd.md', generatePRDMarkdown(state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      this.sourceFiles.set('prd', targetUri);

  }


  // ── saveArchitectureToFile ───────────────────────────────────────────────────

  /**

   * Save architecture to JSON file

   */

  async saveArchitectureToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const targetUri = await resolveArtifactTargetUri({

          baseUri,

          folderName: 'solutioning',

          fileName: 'architecture.json'

      });

      const json = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'architecture',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },

              status: state.architecture?.status || 'draft'

          },

          content: (() => {

              if (!state.architecture) return {};

              // Strip id and status — they live in metadata, not content

              const { id, status, ...contentFields } = state.architecture;

              return contentFields;

          })()

      };

      // Write JSON if output format includes JSON

      const outputFormat = this.getOutputFormat();

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(targetUri, json);

          logDebug('Saved architecture to:', targetUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(targetUri, 'architecture.md', generateArchitectureMarkdown(state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      this.sourceFiles.set('architecture', targetUri);

  }


  // ── saveTestCasesToFile ───────────────────────────────────────────────────

  /**

   * Save test cases to JSON file

   */

  async saveTestCasesToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      // Group test cases by epicId → per-epic files

      const allCases = state.testCases || [];

      const groupedByEpic = new Map<string, any[]>();

      const orphans: any[] = [];


      for (const tc of allCases) {

          const eid = tc.epicId || tc.epicInfo?.epicId || '';

          if (eid) {

              if (!groupedByEpic.has(eid)) groupedByEpic.set(eid, []);

              groupedByEpic.get(eid)!.push({ ...tc });

          } else {

              orphans.push({ ...tc });

          }

      }


      const outputFormat = this.getOutputFormat();


      // Write per-epic test case files

      for (const [epicId, cases] of groupedByEpic) {

          const testsDir = vscode.Uri.joinPath(

              ArtifactFileWriter.epicScopedDir(baseUri, epicId),

              'tests'

          );

          try { await vscode.workspace.fs.createDirectory(testsDir); } catch { /* exists */ }

          const targetUri = vscode.Uri.joinPath(testsDir, 'test-cases.json');

          const json = {

              metadata: {

                  schemaVersion: '1.0.0',

                  artifactType: 'test-cases',

                  workflowName: 'agileagentcanvas',

                  projectName: state.projectName,

                  timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },

                  status: 'draft'

              },

              content: { testCases: cases }

          };

          if (outputFormat === 'json' || outputFormat === 'dual') {

              await writeJsonFile(targetUri, json);

              logDebug(`Saved ${cases.length} test cases for ${epicId} to:`, targetUri.fsPath);

          }

      }


      // Write orphan test cases to root testing/

      if (orphans.length > 0) {

          const testingUri = vscode.Uri.joinPath(baseUri, 'testing');

          try { await vscode.workspace.fs.createDirectory(testingUri); } catch { /* exists */ }

          const targetUri = vscode.Uri.joinPath(testingUri, 'test-cases.json');

          const json = {

              metadata: {

                  schemaVersion: '1.0.0',

                  artifactType: 'test-cases',

                  workflowName: 'agileagentcanvas',

                  projectName: state.projectName,

                  timestamps: { created: new Date().toISOString(), lastModified: new Date().toISOString() },

                  status: 'draft'

              },

              content: { testCases: orphans }

          };

          if (outputFormat === 'json' || outputFormat === 'dual') {

              await writeJsonFile(targetUri, json);

              logDebug(`Saved ${orphans.length} orphan test cases to:`, targetUri.fsPath);

          }

          this.sourceFiles.set('testCases', targetUri);

      }

  }


  // ── saveTestStrategyToFile ───────────────────────────────────────────────────

  /**

   * Save test strategy to JSON file

   */

  async saveTestStrategyToFile(state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      const testingUri = vscode.Uri.joinPath(baseUri, 'testing');

      try {

          await vscode.workspace.fs.createDirectory(testingUri);

      } catch {

          // Folder might already exist

      }

      const targetUri = vscode.Uri.joinPath(testingUri, 'test-strategy.json');


      const testStrategyJson = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'test-strategy',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: {

                  created: new Date().toISOString(),

                  lastModified: new Date().toISOString()

              },

              status: state.testStrategy?.status || 'draft'

          },

          content: (() => {

              if (state.testStrategy) {

                  const { id, status, ...contentFields } = state.testStrategy as unknown as { id?: string; status?: string; [key: string]: unknown };

                  return contentFields;

              }

              return state.testStrategy;

          })()

      };


      // Write JSON if output format includes JSON

      const outputFormat = this.getOutputFormat();

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(targetUri, testStrategyJson);

          logDebug('Saved test strategy to:', targetUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          const mdUri = await writeMarkdownCompanion(targetUri, 'test-strategy.md', generateTestStrategyMarkdown(state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      this.sourceFiles.set('testStrategy', targetUri);

  }


  // ── saveTestDesignToFile ───────────────────────────────────────────────────

  /**

   * Save test design to JSON file

   */

  async saveTestDesignToFile(td: any, state: BmadArtifacts, baseUri: vscode.Uri): Promise<void> {

      let targetUri: vscode.Uri;

      const sourceKey = `testDesign:${td.id}`;


      if (td.epicInfo?.epicId) {

          // Epic-scoped: epics/epic-{N}/tests/test-design.json

          const testsDir = vscode.Uri.joinPath(

              ArtifactFileWriter.epicScopedDir(baseUri, td.epicInfo.epicId),

              'tests'

          );

          try { await vscode.workspace.fs.createDirectory(testsDir); } catch { /* exists */ }

          const safeId = td.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          targetUri = vscode.Uri.joinPath(testsDir, `test-design-${safeId}.json`);

      } else {

          const testingUri = vscode.Uri.joinPath(baseUri, 'testing');

          try {

              await vscode.workspace.fs.createDirectory(testingUri);

          } catch {

              // Folder might already exist

          }

          // Generate a safe filename

          const safeId = td.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');

          const filename = safeId ? `test-design-${safeId}.json` : 'test-design.json';

          targetUri = vscode.Uri.joinPath(testingUri, filename);

      }

      const testDesignJson = {

          metadata: {

              schemaVersion: '1.0.0',

              artifactType: 'test-design',

              workflowName: 'agileagentcanvas',

              projectName: state.projectName,

              timestamps: {

                  created: new Date().toISOString(),

                  lastModified: new Date().toISOString()

              },

              status: td.status || 'draft'

          },

          content: {

              epicInfo: td.epicInfo,

              summary: td.summary,

              notInScope: td.notInScope,

              riskAssessment: td.riskAssessment,

              entryExitCriteria: td.entryExitCriteria,

              projectTeam: td.projectTeam,

              coveragePlan: td.coveragePlan,

              testCases: td.testCases,

              executionOrder: td.executionOrder,

              testEnvironment: td.testEnvironment,

              resourceEstimates: td.resourceEstimates,

              qualityGateCriteria: td.qualityGateCriteria,

              mitigationPlans: td.mitigationPlans,

              assumptionsAndDependencies: td.assumptionsAndDependencies,

              defectManagement: td.defectManagement,

              approval: td.approval,

              appendices: td.appendices

          }

      };


      // Write JSON if output format includes JSON

      const outputFormat = this.getOutputFormat();

      if (outputFormat === 'json' || outputFormat === 'dual') {

          await writeJsonFile(targetUri, testDesignJson);

          logDebug('Saved test design to:', targetUri.fsPath);

      }


      // Write markdown companion if output format includes markdown

      if (outputFormat === 'markdown' || outputFormat === 'dual') {

          let mdFilename = 'test-design.md';

          if (targetUri.fsPath.endsWith('.json')) {

              const match = targetUri.fsPath.match(/([^\/\\]+)\.json$/);

              if (match) mdFilename = match[1] + '.md';

          }

          const mdUri = await writeMarkdownCompanion(targetUri, mdFilename, generateTestDesignMarkdown(td, state));

          logDebug('Saved markdown companion:', mdUri.fsPath);

      }


      this.sourceFiles.set(sourceKey, targetUri);

  }

}