// ─── Visual Plan Webview Types ────────────────────────────────────────────────
// Wire-format mirror of src/types/visual-plan.ts.  Defined locally (not
// imported) because the extension and webview-ui are separate TS projects
// with independent tsconfigs — the wire format is the structural identity,
// and any drift is caught by the consumer's structural check.
//
// Field names must stay byte-identical to the extension-side definitions.

export type PlanStatus =
  | 'generating'
  | 'pending'
  | 'changes-requested'
  | 'approved'
  | 'dispatched'
  | 'failed';

export type PlanSectionKind =
  | 'overview'
  | 'fileMap'
  | 'diagram'
  | 'wireframe'
  | 'apiSpec'
  | 'schemaMap'
  | 'annotatedCode'
  | 'openQuestions'
  | 'tasks';

export interface PlanComment {
  id: string;
  sectionId: string;
  body: string;
  author?: string;
  createdAt: number;
}

export interface PlanTask {
  id: string;
  title: string;
  description?: string;
  priority?: string;
  scope?: string[];
  selected?: boolean;
}

export interface FileMapEntry {
  path: string;
  change: 'add' | 'modify' | 'delete' | 'rename';
  note?: string;
}

export interface DiagramSpec {
  id: string;
  title?: string;
  mermaid?: string;
  nodes?: { id: string; label: string }[];
  edges?: { from: string; to: string; label?: string }[];
}

export interface WireframeSpec {
  id: string;
  title?: string;
  description?: string;
  sections?: { id: string; label: string; elements?: { type: string; label: string }[] }[];
}

export interface ApiSpecEntry {
  method: string;
  path: string;
  summary?: string;
  requestBody?: string;
  responses?: { code: string; description: string }[];
}

export interface SchemaEntity {
  name: string;
  fields?: { name: string; type: string; required?: boolean }[];
  relationships?: { target: string; type: string; cardinality?: string }[];
}

export interface AnnotatedCodeBlock {
  file: string;
  language?: string;
  code: string;
  annotations?: { line: number; comment: string }[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  status?: 'open' | 'answered' | 'blocked';
  answer?: string;
}

export type PlanSection =
  | { id: string; kind: 'overview'; markdown: string; risk?: 'low' | 'medium' | 'high'; groundedFiles?: string[] }
  | { id: string; kind: 'fileMap'; entries: FileMapEntry[] }
  | { id: string; kind: 'diagram'; diagram: DiagramSpec }
  | { id: string; kind: 'wireframe'; wireframe: WireframeSpec }
  | { id: string; kind: 'apiSpec'; entries: ApiSpecEntry[] }
  | { id: string; kind: 'schemaMap'; entities: SchemaEntity[] }
  | { id: string; kind: 'annotatedCode'; blocks: AnnotatedCodeBlock[] }
  | { id: string; kind: 'openQuestions'; questions: OpenQuestion[] }
  | { id: string; kind: 'tasks'; tasks: PlanTask[] };

export interface VisualPlan {
  id: string;
  title: string;
  goal: string;
  status: PlanStatus;
  createdAt: number;
  updatedAt: number;
  sourceArtifactId?: string;
  targets?: string[];
  sections: PlanSection[];
  comments: PlanComment[];
}
