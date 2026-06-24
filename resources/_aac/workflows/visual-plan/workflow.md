---
name: visual-plan
description: Generate a structured VisualPlan JSON document for human review before code changes begin.
type: generate
outputFormat: json
---

# Visual Plan Generation

You are generating a **Visual Plan** — a structured, reviewable plan document that a developer will review BEFORE any code is written. This is the **APPROVAL GATE**: nothing gets implemented until the user explicitly approves the plan.

**Your output must be a SINGLE JSON object** and nothing else. No code fences (```json), no markdown wrappers, no explanatory prose before or after — ONLY the JSON object, starting with `{` and ending with `}`.

## When to Use This Workflow

Generate a Visual Plan for: multi-file changes, architecture-heavy work, data-model changes, UI work, risky refactors, or any work the user explicitly requests a plan for.

Skip for: trivial single-line fixes, typo corrections, or changes the user says are obvious.

## Output Contract

You MUST return a JSON object with this exact structure:

```json
{
  "title": "<short title, max 80 chars>",
  "sections": [
    {
      "id": "overview-1",
      "kind": "overview",
      "markdown": "## What We're Building\n\nA clear 2-5 paragraph summary of the change, including:\n- **What**: The feature or change being planned\n- **Why**: The motivation and value\n- **How**: The high-level approach\n- **Risks**: Any concerns or unknowns",
      "risk": "low",
      "groundedFiles": [
        "src/auth/login.ts",
        "src/routes/api.ts",
        "src/types/user.ts"
      ]
    },
    {
      "id": "filemap-1",
      "kind": "fileMap",
      "entries": [
        {
          "path": "src/auth/login.ts",
          "change": "add",
          "note": "New login form component with validation"
        },
        {
          "path": "src/routes/api.ts",
          "change": "modify",
          "note": "Add POST /login endpoint handler"
        },
        {
          "path": "src/types/user.ts",
          "change": "modify",
          "note": "Add LoginRequest and AuthToken types"
        },
        {
          "path": "src/legacy/auth-v1.ts",
          "change": "delete",
          "note": "Replaced by new auth module"
        }
      ]
    },
    {
      "id": "diagram-1",
      "kind": "diagram",
      "diagram": {
        "id": "auth-flow",
        "title": "Authentication Flow",
        "mermaid": "sequenceDiagram\n  Client->>API: POST /login {email, password}\n  API->>DB: SELECT user WHERE email\n  DB-->>API: user row\n  API->>API: bcrypt.compare\n  API-->>Client: 200 {token, user}",
        "nodes": [
          { "id": "client", "label": "Client" },
          { "id": "api", "label": "API Server" },
          { "id": "db", "label": "Database" }
        ],
        "edges": [
          { "from": "client", "to": "api", "label": "POST /login" },
          { "from": "api", "to": "db", "label": "SELECT user" }
        ]
      }
    },
    {
      "id": "wireframe-1",
      "kind": "wireframe",
      "wireframe": {
        "id": "login-page",
        "title": "Login Page",
        "description": "Clean centered login form with email, password, and submit button",
        "sections": [
          {
            "id": "header",
            "label": "Header",
            "elements": [
              { "type": "heading", "label": "Sign In" }
            ]
          },
          {
            "id": "form",
            "label": "Form",
            "elements": [
              { "type": "input", "label": "Email" },
              { "type": "input", "label": "Password" },
              { "type": "button", "label": "Login" }
            ]
          }
        ]
      }
    },
    {
      "id": "apispec-1",
      "kind": "apiSpec",
      "entries": [
        {
          "method": "POST",
          "path": "/api/auth/login",
          "summary": "Authenticate a user and return a JWT token",
          "requestBody": "{ \"email\": \"string\", \"password\": \"string\" }",
          "responses": [
            { "code": "200", "description": "Success — returns { token, user }" },
            { "code": "401", "description": "Invalid credentials" },
            { "code": "429", "description": "Rate limited" }
          ]
        }
      ]
    },
    {
      "id": "schemamap-1",
      "kind": "schemaMap",
      "entities": [
        {
          "name": "User",
          "fields": [
            { "name": "id", "type": "uuid", "required": true },
            { "name": "email", "type": "string", "required": true },
            { "name": "password_hash", "type": "string", "required": true },
            { "name": "created_at", "type": "timestamp", "required": true }
          ],
          "relationships": [
            { "target": "Session", "type": "has-many", "cardinality": "1:N" }
          ]
        },
        {
          "name": "Session",
          "fields": [
            { "name": "id", "type": "uuid", "required": true },
            { "name": "user_id", "type": "uuid", "required": true },
            { "name": "token", "type": "string", "required": true },
            { "name": "expires_at", "type": "timestamp", "required": true }
          ]
        }
      ]
    },
    {
      "id": "code-1",
      "kind": "annotatedCode",
      "blocks": [
        {
          "file": "src/auth/login.ts",
          "language": "typescript",
          "code": "export async function login(req: LoginRequest): Promise<AuthToken> {\n  const user = await db.findUser(req.email);\n  if (!user) throw new AuthError('Invalid credentials');\n  const valid = await bcrypt.compare(req.password, user.password_hash);\n  if (!valid) throw new AuthError('Invalid credentials');\n  return createToken(user);\n}",
          "annotations": [
            { "line": 2, "comment": "Rate-limit this lookup by IP" },
            { "line": 3, "comment": "Use constant-time comparison to prevent timing attacks" },
            { "line": 5, "comment": "JWT with 24h expiry, signed with RS256" }
          ]
        }
      ]
    },
    {
      "id": "questions-1",
      "kind": "openQuestions",
      "questions": [
        {
          "id": "q1",
          "question": "Should we use JWT or session cookies for auth?",
          "status": "open"
        },
        {
          "id": "q2",
          "question": "Do we need refresh token rotation?",
          "status": "open"
        },
        {
          "id": "q3",
          "question": "What rate-limiting strategy should we use?",
          "status": "open"
        }
      ]
    },
    {
      "id": "tasks-1",
      "kind": "tasks",
      "tasks": [
        {
          "id": "task-1",
          "title": "Add LoginRequest and AuthToken types",
          "description": "Define TypeScript interfaces for the login request body and JWT auth token response in src/types/user.ts",
          "priority": "P0",
          "scope": ["src/types/user.ts"]
        },
        {
          "id": "task-2",
          "title": "Create login form component",
          "description": "Build the LoginForm React component with email/password fields, validation, and submit handler in src/auth/login.ts",
          "priority": "P0",
          "scope": ["src/auth/login.ts"]
        },
        {
          "id": "task-3",
          "title": "Add POST /api/auth/login endpoint",
          "description": "Implement the login API route with bcrypt password verification and JWT token generation in src/routes/api.ts",
          "priority": "P0",
          "scope": ["src/routes/api.ts"]
        },
        {
          "id": "task-4",
          "title": "Add rate limiting middleware",
          "description": "Implement IP-based rate limiting (5 attempts/minute) on the login endpoint",
          "priority": "P1",
          "scope": ["src/middleware/rate-limit.ts", "src/routes/api.ts"]
        }
      ]
    }
  ],
  "targets": ["epic-auth-101", "story-login-202"]
}
```

## Section Guidelines

### 1. overview (REQUIRED)
Summarize the plan in 2-5 paragraphs of markdown. Include:
- **What** is being built or changed
- **Why** it matters (user value, business need)
- **How** you'll approach it (high-level strategy)
- **Risks** — `risk` field must be `"low"`, `"medium"`, or `"high"`
- **`groundedFiles`** — list the KEY files you've verified exist in the workspace (3-10 files). These prove you've examined the codebase and aren't guessing.

### 2. fileMap (REQUIRED)
List EVERY file affected by this plan. Each entry needs:
- `path` — real workspace path (verify with `findFiles` or `codebase_search`)
- `change` — one of: `"add"`, `"modify"`, `"delete"`, `"rename"` (aliases accepted: create→add, edit/update→modify, remove→delete, move→rename)
- `note` — WHY this file is changing (1 sentence)

**Grounding rule**: If you don't know the exact path, search for it. Never fabricate a path. If a file truly doesn't exist yet, mark it `"add"` with its intended path.

### 3. diagram
Include when architecture, data flow, or component relationships are non-trivial. Provide:
- `mermaid` — the diagram source (preferred format; use `sequenceDiagram`, `graph TD`, `flowchart`, `classDiagram`, etc.)
- `nodes` / `edges` — fallback for renderers that don't support mermaid (list all nodes and edges explicitly)

### 4. wireframe
Include for UI-heavy work. Describe the UI layout:
- `sections` — logical regions of the page (header, form, sidebar, etc.)
- Each section has `elements` — the UI components within it (`"type"` and `"label"`)

### 5. apiSpec
Include when the plan touches API endpoints. Each entry needs:
- `method` — GET, POST, PUT, PATCH, DELETE
- `path` — the URL path (e.g., `/api/auth/login`)
- `summary` — 1-line description
- `responses` — at minimum the success and error response codes

### 6. schemaMap
Include for database/schema/model changes. Each entity:
- `name` — table/model name
- `fields` — columns/properties with name, type, and required flag
- `relationships` — foreign keys or associations to other entities

### 7. annotatedCode
Include when you want to show specific code patterns or critical implementation details. Each block:
- `file` — which file (match a fileMap entry)
- `language` — syntax highlighting hint
- `code` — the actual code snippet
- `annotations` — line-by-line comments explaining key decisions

### 8. openQuestions
Include any decisions, tradeoffs, or unknowns that need user input before proceeding. Each question:
- `question` — the decision to be made
- `status` — `"open"` (default), `"answered"`, or `"blocked"`

### 9. tasks (REQUIRED)
Break the plan into discrete, **independently completable** tasks. Each task:
- `id` — unique identifier (e.g., `"task-1"`)
- `title` — short action-oriented description
- `description` — what needs to be done (1-3 sentences)
- `priority` — `"P0"` (blocking), `"P1"` (important), `"P2"` (nice-to-have)
- `scope` — the file paths this task touches (should match fileMap entries)

**Task quality rules:**
- Tasks should be completable in one focused session (not multi-day epics)
- Order tasks by dependency — foundational work first
- Each task should touch 1-5 files — if a task spans 10+ files, split it
- P0 tasks are the minimum viable implementation; the plan is shippable after P0

## Grounding Rules

1. **Reference REAL files from the workspace.** Grounding context (file paths, artifact summaries) is provided in the user message — use it. Fabricated paths will break the canvas dependency arrows and file map.
2. **If you're unsure about a path**, prefer paths from the provided context. If a file doesn't appear in the context but you're confident it's needed, mark it `"add"` with the intended path.
3. **The plan is the APPROVAL GATE** — nothing is implemented until the user clicks "Approve & Dispatch". Your job is to produce the best possible review document, not to start coding.
4. **`targets`** (optional) — list artifact IDs this plan affects. These draw dependency arrows on the canvas, showing how the plan connects to existing epics, stories, or requirements.
5. **Be specific, not vague.** "Add validation" is bad. "Add email format validation and password minimum length check (8 chars) to the login form" is good.

## JSON Output Rules

1. **Output ONLY the JSON object.** Start with `{`, end with `}`. No surrounding text, no markdown fences, no explanations.
2. **No trailing commas.** JSON.parse() will reject them.
3. **No comments.** `//` and `/* */` are not valid JSON.
4. **All strings must be double-quoted.** Single quotes are not valid JSON.
5. **Required fields per section kind:**
   - `overview`: `id`, `kind`, `markdown` (risk, groundedFiles optional)
   - `fileMap`: `id`, `kind`, `entries[]` (each with `path`, `change`; note optional)
   - `diagram`: `id`, `kind`, `diagram` (with `id` inside; nodes/edges/mermaid optional)
   - `wireframe`: `id`, `kind`, `wireframe` (with `id` inside; title/description/sections optional)
   - `apiSpec`: `id`, `kind`, `entries[]` (each with `method`, `path`; summary/requestBody/responses optional)
   - `schemaMap`: `id`, `kind`, `entities[]` (each with `name`; fields/relationships optional)
   - `annotatedCode`: `id`, `kind`, `blocks[]` (each with `file`, `code`; language/annotations optional)
   - `openQuestions`: `id`, `kind`, `questions[]` (each with `id`, `question`; status/answer optional)
   - `tasks`: `id`, `kind`, `tasks[]` (each with `id`, `title`; description/priority/scope optional)
6. **Every section MUST have `id` (unique string) and `kind` (one of the 9 kinds).**
7. **The `title` must be ≤ 80 characters.**

If you follow these rules, the plan will parse cleanly on the first attempt and the user can begin their review immediately.
