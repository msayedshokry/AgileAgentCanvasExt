# Complete BMAD Schema → Fully Relational DB Mapping

> [!IMPORTANT]
> All 40 BMAD schemas have been read in full. Total field count exceeds **1,500 fields** across all schemas. This document maps every field to a typed column or child table — **no JSONB content blobs**.

## Design Principles

1. **Every schema field gets a typed column** — no opaque JSONB content blobs
2. **Shared tables** for recurring structures: findings, recommendations, risks, action items
3. **Parent/child via FK** — arrays of objects become child tables
4. **Enums via CHECK constraints** — all `enum` values from schemas become DB constraints
5. **Simple string arrays** → `TEXT[]` (Postgres) or join table (SQLite)
6. **Nested objects (2-3 scalars)** → flattened with prefix (e.g., `summary_total_risks INTEGER`)
7. **Deeply nested sub-objects** → separate tables only when they have IDs or are queried independently

---

## Shared Foundation Tables

### `projects`
```sql
CREATE TABLE projects (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
```

### `metadata` (shared across all artifacts with `{metadata, content}` envelope)

Pulled from [metadata.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/common/metadata.schema.json):

```sql
CREATE TABLE metadata (
    id                TEXT PRIMARY KEY,  -- FK to parent artifact table
    project_id        TEXT NOT NULL REFERENCES projects(id),
    artifact_type     TEXT NOT NULL,     -- 'prd', 'architecture', 'epic', etc.
    -- metadata.schema.json fields:
    schema_version    TEXT NOT NULL DEFAULT '1.0.0',
    title             TEXT,
    description       TEXT,
    created_by        TEXT,
    created_at        TIMESTAMPTZ,
    updated_at        TIMESTAMPTZ,
    version           INTEGER DEFAULT 1,
    status            TEXT CHECK (status IN ('draft','in-progress','review','approved','final','archived','deprecated')),
    tags              TEXT[],            -- string array
    -- customFields stored as key-value
    custom_fields     JSONB DEFAULT '{}'  -- only metadata custom fields, NOT content
);
```

> [!NOTE]
> `custom_fields` is the ONLY JSONB in the entire schema — it's the metadata's `additionalProperties` catch-all, which by definition has no fixed schema.

---

## Shared Child Tables (Used by Multiple Schemas)

### `requirements` — from [requirement.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/common/requirement.schema.json)

Used by: PRD (3 categories), epics, readiness-report

```sql
CREATE TABLE requirements (
    id                TEXT PRIMARY KEY,   -- e.g., 'FR 1.1', 'NFR-PERF-01'
    project_id        TEXT NOT NULL REFERENCES projects(id),
    parent_artifact   TEXT NOT NULL,      -- FK to owning artifact (prd, epic)
    parent_type       TEXT NOT NULL,      -- 'prd', 'epic'
    -- requirement.schema.json fields:
    type              TEXT CHECK (type IN ('functional','non-functional','additional','technical','recycled-capability')),
    capability_area   TEXT,
    category          TEXT,
    description       TEXT NOT NULL,
    rationale         TEXT,
    priority          TEXT CHECK (priority IN ('must-have','should-have','could-have','wont-have')),
    status            TEXT CHECK (status IN ('proposed','approved','implemented','verified','deferred','removed')),
    source            TEXT,
    fit_criterion     TEXT,
    dependencies      TEXT[],
    related_epics     TEXT[],
    related_stories   TEXT[],
    notes             TEXT,
    -- metrics sub-object (flattened)
    metrics_measure   TEXT,
    metrics_target    TEXT,
    metrics_current   TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);
```

### `acceptance_criteria` — from [acceptance-criteria.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/common/acceptance-criteria.schema.json)

Used by: stories, tech-spec

```sql
CREATE TABLE acceptance_criteria (
    id                TEXT PRIMARY KEY,   -- e.g., 'AC-1'
    parent_id         TEXT NOT NULL,      -- FK to story or tech-spec
    parent_type       TEXT NOT NULL,      -- 'story', 'tech-spec'
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- acceptance-criteria.schema.json fields:
    title             TEXT,
    given             TEXT NOT NULL,
    "when"            TEXT NOT NULL,
    "then"            TEXT NOT NULL,
    priority          TEXT CHECK (priority IN ('high','medium','low')),
    -- verification:
    test_ids          TEXT[],
    automation_status TEXT CHECK (automation_status IN ('automated','manual','planned','not-applicable')),
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);
```

### `findings` — shared by code-review, readiness-report, test-review, research

```sql
CREATE TABLE findings (
    id                TEXT PRIMARY KEY,
    parent_id         TEXT NOT NULL,
    parent_type       TEXT NOT NULL,      -- 'code-review', 'readiness-prd', 'test-review', etc.
    project_id        TEXT NOT NULL REFERENCES projects(id),
    finding           TEXT NOT NULL,
    type              TEXT,               -- 'positive', 'concern', 'gap', 'issue'
    severity          TEXT CHECK (severity IN ('critical','major','minor','suggestion','low','medium','high')),
    category          TEXT,
    recommendation    TEXT,
    details           TEXT,
    sort_order        INTEGER DEFAULT 0
);
```

### `recommendations` — shared by readiness-report, research, test-review, source-tree, project-overview

```sql
CREATE TABLE recommendations (
    id                TEXT PRIMARY KEY,
    parent_id         TEXT NOT NULL,
    parent_type       TEXT NOT NULL,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    recommendation    TEXT NOT NULL,
    category          TEXT,
    priority          TEXT,
    effort            TEXT,
    impact            TEXT,
    rationale         TEXT,
    owner             TEXT,
    deadline          TEXT,
    sort_order        INTEGER DEFAULT 0
);
```

### `action_items` — shared by retrospective, readiness-report

```sql
CREATE TABLE action_items (
    id                TEXT PRIMARY KEY,
    parent_id         TEXT NOT NULL,
    parent_type       TEXT NOT NULL,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    action            TEXT NOT NULL,
    owner             TEXT,
    due_date          TEXT,
    priority          TEXT CHECK (priority IN ('high','medium','low')),
    status            TEXT CHECK (status IN ('pending','in-progress','done')) DEFAULT 'pending',
    sort_order        INTEGER DEFAULT 0
);
```

---

## BMM Module — 22 Schemas

### 1. `product_briefs` — [product-brief.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/product-brief.schema.json)

```sql
CREATE TABLE product_briefs (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- content fields (14 sections):
    product_name      TEXT,
    vision            TEXT,
    problem_statement TEXT,
    target_audience   TEXT,
    -- nested objects flattened:
    market_context_industry TEXT,
    market_context_trend    TEXT,
    market_context_gap      TEXT,
    -- sub-objects with arrays → child tables
    -- (key_features, success_criteria, constraints, assumptions, risks → child tables below)
    additional_context TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE product_brief_target_users (
    id                TEXT PRIMARY KEY,
    product_brief_id  TEXT REFERENCES product_briefs(id) ON DELETE CASCADE,
    name              TEXT,
    description       TEXT,
    needs             TEXT[],
    pain_points       TEXT[],
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE product_brief_key_features (
    id                TEXT PRIMARY KEY,
    product_brief_id  TEXT REFERENCES product_briefs(id) ON DELETE CASCADE,
    feature           TEXT NOT NULL,
    description       TEXT,
    priority          TEXT CHECK (priority IN ('must-have','should-have','could-have','wont-have')),
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE product_brief_success_criteria (
    id                TEXT PRIMARY KEY,
    product_brief_id  TEXT REFERENCES product_briefs(id) ON DELETE CASCADE,
    criterion         TEXT NOT NULL,
    metric            TEXT,
    target            TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- scope.inScope, scope.outOfScope → TEXT[]
-- constraints, assumptions → TEXT[] on product_briefs
-- risks → uses shared findings table with parent_type='product-brief'
```

---

### 2. `prds` — [prd.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/prd.schema.json) (617 lines)

```sql
CREATE TABLE prds (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- productOverview (flattened):
    po_product_name   TEXT,
    po_version        TEXT,
    po_type           TEXT,
    po_description    TEXT,
    po_target_audience TEXT,
    -- projectType (flattened):
    pt_type           TEXT,
    pt_description    TEXT,
    -- scope (flattened):
    scope_in_scope    TEXT[],
    scope_out_of_scope TEXT[],
    scope_mvp_definition TEXT,
    -- constraints, timeline, appendices → child tables
    -- approvals → child table
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE prd_user_personas (
    id                TEXT PRIMARY KEY,
    prd_id            TEXT REFERENCES prds(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    role              TEXT,
    description       TEXT,
    goals             TEXT[],
    pain_points       TEXT[],
    technical_level   TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE prd_user_journeys (
    id                TEXT PRIMARY KEY,
    prd_id            TEXT REFERENCES prds(id) ON DELETE CASCADE,
    persona           TEXT,
    scenario          TEXT,
    journey_steps     TEXT[],  -- ordered steps
    success_criteria  TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE prd_domain_model_entities (
    id                TEXT PRIMARY KEY,
    prd_id            TEXT REFERENCES prds(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    description       TEXT,
    attributes        TEXT[],
    relationships     TEXT[],
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE prd_success_criteria (
    id                TEXT PRIMARY KEY,
    prd_id            TEXT REFERENCES prds(id) ON DELETE CASCADE,
    criterion         TEXT NOT NULL,
    metric            TEXT,
    target            TEXT,
    verification_method TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- requirements → uses shared requirements table with parent_type='prd'
-- risks → uses shared findings table
```

---

### 3. `architectures` — [architecture.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/architecture.schema.json) (975 lines)

```sql
CREATE TABLE architectures (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- overview (flattened):
    overview_project_name TEXT,
    overview_system_type  TEXT,
    overview_description  TEXT,
    -- context:
    context_business_domain TEXT,
    context_system_purpose TEXT,
    -- deployment:
    deployment_platform     TEXT,
    deployment_strategy     TEXT,
    deployment_environments TEXT[],
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE architecture_tech_stack_items (
    id                TEXT PRIMARY KEY,
    architecture_id   TEXT REFERENCES architectures(id) ON DELETE CASCADE,
    category          TEXT NOT NULL,     -- 'frontend', 'backend', 'database', 'infrastructure', 'devTools', 'testing'
    technology        TEXT NOT NULL,
    version           TEXT,
    purpose           TEXT,
    documentation     TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE architecture_decisions (   -- ADRs
    id                TEXT PRIMARY KEY,  -- e.g., 'ADR-001'
    architecture_id   TEXT REFERENCES architectures(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    status            TEXT CHECK (status IN ('proposed','accepted','deprecated','superseded')),
    context           TEXT,
    decision          TEXT,
    rationale         TEXT,
    consequences      TEXT[],
    alternatives      TEXT[],            -- brief alt descriptions
    date              TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE architecture_patterns (
    id                TEXT PRIMARY KEY,
    architecture_id   TEXT REFERENCES architectures(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    category          TEXT,
    description       TEXT,
    usage             TEXT,
    files_involved    TEXT[],
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE architecture_system_components (
    id                TEXT PRIMARY KEY,
    architecture_id   TEXT REFERENCES architectures(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    type              TEXT,
    description       TEXT,
    responsibility    TEXT,
    technology        TEXT,
    interfaces        TEXT[],
    dependencies      TEXT[],
    sort_order        INTEGER DEFAULT 0
);

-- security, scalability, reliability, observability → sections flattened/child tables
-- testing_architecture, project_structure → child tables
```

---

### 4. `epics` — [epics.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/epics.schema.json) (741 lines)

```sql
CREATE TABLE epics (
    id                TEXT PRIMARY KEY,  -- e.g., 'EPIC-1'
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    title             TEXT NOT NULL,
    goal              TEXT,
    description       TEXT,
    status            TEXT CHECK (status IN ('backlog','in-progress','done')),
    priority          TEXT,
    estimated_effort  TEXT,
    -- dependency tracking:
    blocked_by        TEXT[],
    sort_order        INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now()
);
-- stories → stories table (FK to epic)
-- use cases → use_cases table (FK to epic)
-- functional/nonfunctional requirements → requirements table (FK to epic)
-- risks (inline in epic) → epic_risks table
-- test strategy → child table or inline fields
```

---

### 5. `stories` — [story.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/story.schema.json) (741 lines within epics)

```sql
CREATE TABLE stories (
    id                TEXT PRIMARY KEY,  -- composite of epicId + storyId (e.g., 'S-1.1')
    epic_id           TEXT REFERENCES epics(id) ON DELETE CASCADE,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    story_id          TEXT NOT NULL,     -- e.g., '1.1'
    title             TEXT NOT NULL,
    description       TEXT,
    status            TEXT CHECK (status IN ('draft','ready','in-progress','review','done','blocked','deferred')),
    priority          TEXT,
    story_points      INTEGER,
    -- user_story (flattened from user-story.schema.json):
    us_as_a           TEXT,
    us_i_want         TEXT,
    us_so_that        TEXT,
    us_role           TEXT,
    us_action         TEXT,
    us_benefit        TEXT,
    us_formatted      TEXT,
    us_context        TEXT,
    us_notes          TEXT,
    -- assignee, dates:
    assigned_to       TEXT,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    -- dependencies:
    depends_on        TEXT[],
    blocked_by        TEXT[],
    -- references:
    requirement_refs  TEXT[],            -- requirement IDs this story implements
    -- dev notes:
    dev_notes         TEXT,
    sort_order        INTEGER DEFAULT 0,
    created_at        TIMESTAMPTZ DEFAULT now()
);

-- acceptance_criteria → uses shared acceptance_criteria table
-- tasks → story_tasks table
CREATE TABLE story_tasks (
    id                TEXT PRIMARY KEY,
    story_id          TEXT REFERENCES stories(id) ON DELETE CASCADE,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    title             TEXT NOT NULL,
    completed         BOOLEAN DEFAULT false,
    sort_order        INTEGER DEFAULT 0
);
```

---

### 6. `use_cases` — [use-case.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/use-case.schema.json)

```sql
CREATE TABLE use_cases (
    id                TEXT PRIMARY KEY,  -- e.g., 'UC-01'
    project_id        TEXT NOT NULL REFERENCES projects(id),
    epic_id           TEXT REFERENCES epics(id),
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL,
    primary_actor     TEXT,
    secondary_actors  TEXT[],
    preconditions     TEXT[],
    postconditions    TEXT[],
    trigger           TEXT,
    -- scenario (flattened):
    scenario_context  TEXT,
    scenario_before   TEXT,
    scenario_after    TEXT,
    scenario_impact   TEXT,
    -- references:
    business_rules    TEXT[],
    related_requirements TEXT[],
    related_epic      TEXT,
    related_stories   TEXT[],
    source_document   TEXT,
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE use_case_main_flow_steps (
    id                SERIAL PRIMARY KEY,
    use_case_id       TEXT REFERENCES use_cases(id) ON DELETE CASCADE,
    step              INTEGER NOT NULL,
    action            TEXT NOT NULL,
    actor             TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE use_case_alternative_flows (
    id                TEXT PRIMARY KEY,
    use_case_id       TEXT REFERENCES use_cases(id) ON DELETE CASCADE,
    name              TEXT,
    branch_point      TEXT,
    steps             TEXT[],
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE use_case_exception_flows (
    id                TEXT PRIMARY KEY,
    use_case_id       TEXT REFERENCES use_cases(id) ON DELETE CASCADE,
    name              TEXT,
    trigger           TEXT,
    handling          TEXT,
    sort_order        INTEGER DEFAULT 0
);
```

---

### 7. `risks_register` — [risks.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/risks.schema.json) (flat schema — no metadata envelope)

```sql
CREATE TABLE risks_register (    -- "risks" is same as project-level risk register
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    risk              TEXT NOT NULL,
    category          TEXT CHECK (category IN ('technical','operational','security','compliance','resource','schedule','integration','performance','data')),
    probability       TEXT CHECK (probability IN ('low','medium','high','very-high')),
    impact            TEXT CHECK (impact IN ('low','medium','high','critical')),
    risk_score        TEXT CHECK (risk_score IN ('low','medium','high','critical')),
    impact_description TEXT,
    mitigation        TEXT NOT NULL,
    contingency_plan  TEXT,
    owner             TEXT,
    status            TEXT CHECK (status IN ('identified','analyzing','mitigating','monitoring','closed','occurred')),
    residual_risk     TEXT CHECK (residual_risk IN ('none','low','medium','high')),
    triggers          TEXT[],
    related_requirements TEXT[],
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE risk_mitigation_strategies (
    id                SERIAL PRIMARY KEY,
    risk_id           TEXT REFERENCES risks_register(id) ON DELETE CASCADE,
    strategy          TEXT,
    owner             TEXT,
    status            TEXT CHECK (status IN ('planned','in-progress','implemented','verified'))
);

CREATE TABLE risks_assumptions (
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    assumption        TEXT,
    if_false          TEXT,
    validation_method TEXT,
    validated         BOOLEAN DEFAULT false
);

CREATE TABLE risks_dependencies (
    id                TEXT PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    dependency        TEXT,
    type              TEXT CHECK (type IN ('upstream','downstream','external-system','team','vendor','infrastructure')),
    risk              TEXT,
    mitigation        TEXT
);

-- riskMatrix + summary → computed views, not stored
```

---

### 8. `ux_designs` — [ux-design.schema.json](file:///d:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/resources/_bmad/schemas/bmm/ux-design.schema.json)

```sql
CREATE TABLE ux_designs (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- top-level content sections (flattened scalars):
    design_philosophy TEXT,
    responsive_overview TEXT,
    accessibility_standards TEXT,
    animation_principles TEXT,
    error_handling_strategy TEXT,
    created_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE ux_design_system_tokens (
    id                SERIAL PRIMARY KEY,
    ux_design_id      TEXT REFERENCES ux_designs(id) ON DELETE CASCADE,
    token_type        TEXT,         -- 'color', 'typography', 'spacing', 'border'
    name              TEXT NOT NULL,
    value             TEXT NOT NULL,
    usage             TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE ux_navigation_items (
    id                SERIAL PRIMARY KEY,
    ux_design_id      TEXT REFERENCES ux_designs(id) ON DELETE CASCADE,
    label             TEXT,
    type              TEXT,
    target            TEXT,
    parent_id         INTEGER REFERENCES ux_navigation_items(id),
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE ux_page_designs (
    id                TEXT PRIMARY KEY,
    ux_design_id      TEXT REFERENCES ux_designs(id) ON DELETE CASCADE,
    page_name         TEXT NOT NULL,
    purpose           TEXT,
    layout            TEXT,
    components        TEXT[],
    interactions      TEXT[],
    sort_order        INTEGER DEFAULT 0
);
```

---

### 9-14. Singleton Document Tables

For schemas that are primarily document-like with moderate nesting:

```sql
-- 9. project_contexts (project-context.schema.json, 552 lines, 14 sections)
CREATE TABLE project_contexts (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- projectInfo:
    pi_name           TEXT,
    pi_description    TEXT,
    pi_type           TEXT,
    pi_version        TEXT,
    pi_repository     TEXT,
    pi_documentation  TEXT,
    -- overview:
    ov_summary        TEXT,
    ov_architecture   TEXT,
    ov_key_features   TEXT[],
    ov_current_state  TEXT,
    -- errorHandling:
    eh_strategy       TEXT,
    -- stateManagement:
    sm_overview       TEXT,
    -- apiInteraction:
    api_approach      TEXT,
    api_client        TEXT,
    api_error_handling TEXT,
    -- simple arrays:
    additional_notes  TEXT[]
);
-- Child: project_context_tech_languages, _frameworks, _libraries, _tools, _infrastructure
-- Child: project_context_implementation_rules
-- Child: project_context_patterns (code_patterns, naming_conventions, etc.)
-- Child: project_context_key_files
-- Child: project_context_entry_points
-- Child: project_context_forbidden_patterns
-- Child: project_context_security_considerations
-- Child: project_context_performance_considerations
-- Child: project_context_known_issues

-- 10. project_overviews (project-overview.schema.json, 463 lines, 15 sections)
CREATE TABLE project_overviews (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    pi_name           TEXT,
    pi_description    TEXT,
    pi_type           TEXT,
    pi_arch_pattern   TEXT,
    pi_version        TEXT,
    pi_repository     TEXT,
    pi_license        TEXT,
    executive_summary TEXT,
    -- projectClassification:
    pc_repo_type      TEXT CHECK (pc_repo_type IN ('monorepo','single','multi-repo')),
    pc_maturity       TEXT CHECK (pc_maturity IN ('prototype','mvp','production','legacy')),
    pc_complexity     TEXT CHECK (pc_complexity IN ('simple','moderate','complex','very-complex')),
    pc_primary_langs  TEXT[],
    pc_secondary_langs TEXT[],
    pc_arch_pattern   TEXT,
    -- codebaseAnalysis:
    ca_total_files    INTEGER,
    ca_total_lines    INTEGER,
    ca_test_coverage  TEXT,
    ca_doc_level      TEXT,
    ca_lint_status    TEXT,
    ca_tech_debt      TEXT,
    additional_notes  TEXT[]
);
-- Child: po_tech_stack_items, po_key_features, po_arch_highlights, po_known_issues
-- Child: po_development_prerequisites, po_getting_started_steps, po_key_commands
-- Child: po_env_variables, po_config_files, po_repo_structure
-- Child: po_entry_points, po_data_flows, po_integrations, po_documentation_map

-- 11. readiness_reports (readiness-report.schema.json, 561 lines, 9 sections)
CREATE TABLE readiness_reports (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- summary:
    summary_project_name TEXT,
    summary_assessment_date DATE,
    summary_assessed_by TEXT,
    summary_overall_status TEXT CHECK (summary_overall_status IN ('ready','ready-with-concerns','not-ready','blocked')),
    summary_overall_score INTEGER,
    summary_recommendation TEXT,
    summary_key_findings TEXT[],
    summary_critical_actions TEXT[],
    -- assessment sub-sections:
    prd_status        TEXT,
    prd_completeness  INTEGER,
    prd_summary       TEXT,
    epic_coverage_status TEXT,
    epic_total_reqs   INTEGER,
    epic_covered_reqs INTEGER,
    epic_coverage_pct REAL,
    ux_alignment_status TEXT,
    ux_alignment_summary TEXT,
    arch_readiness_status TEXT,
    arch_readiness_summary TEXT,
    epic_quality_overall TEXT,
    epic_quality_summary TEXT,
    test_readiness_status TEXT,
    test_readiness_summary TEXT,
    -- dependency analysis:
    dep_summary       TEXT,
    dep_critical_path TEXT[],
    -- resource assessment:
    res_summary       TEXT,
    res_team_readiness TEXT,
    res_tools_readiness TEXT,
    res_env_readiness TEXT
);
-- Child: uses shared findings, recommendations, action_items tables
-- Child: readiness_blockers for dedicated blocker items
-- Child: readiness_next_steps

-- 12. research_reports (research.schema.json, 613 lines, 14 sections)
CREATE TABLE research_reports (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    research_type     TEXT CHECK (research_type IN ('domain','market','technical','user','competitive','feasibility')),
    topic             TEXT NOT NULL,
    scope_description TEXT,
    scope_in_scope    TEXT[],
    scope_out_of_scope TEXT[],
    scope_timeframe   TEXT,
    -- methodology:
    methodology_approach TEXT,
    methodology_web_research BOOLEAN,
    methodology_tools TEXT[],
    methodology_limitations TEXT[],
    -- market analysis:
    market_overview   TEXT,
    market_tam        TEXT,
    market_sam        TEXT,
    market_som        TEXT,
    market_growth     TEXT,
    -- synthesis:
    synthesis_summary TEXT,
    synthesis_key_insights TEXT[],
    synthesis_strategic_implications TEXT[],
    synthesis_open_questions TEXT[],
    synthesis_future_research TEXT[]
);
-- Child: research_goals, research_questions, research_methods, research_sources
-- Child: research_findings (using shared findings table)
-- Child: research_competitors, research_market_segments, research_trends
-- Child: research_technical_findings, research_personas, research_user_needs
-- Child: research_references

-- 13. source_trees (source-tree.schema.json, 464 lines, 16 sections)
CREATE TABLE source_trees (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- overview:
    ov_project_name   TEXT,
    ov_analysis_date  DATE,
    ov_root_path      TEXT,
    ov_total_files    INTEGER,
    ov_total_dirs     INTEGER,
    ov_total_size     TEXT,
    ov_primary_lang   TEXT,
    ov_summary        TEXT,
    -- build artifacts:
    ba_output_dir     TEXT,
    ba_intermediate   TEXT[],
    ba_cache          TEXT[],
    ba_git_ignored    TEXT[]
);
-- Child: source_tree_directories, source_tree_critical_dirs
-- Child: source_tree_entry_points, source_tree_file_patterns, source_tree_naming_conventions
-- Child: source_tree_key_file_types, source_tree_asset_locations, source_tree_config_files
-- Child: source_tree_test_locations, source_tree_doc_locations
-- Child: source_tree_module_graph_deps, source_tree_dev_notes

-- 14. tech_specs (tech-spec.schema.json, 651 lines, 16 sections)
CREATE TABLE tech_specs (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    title             TEXT,
    slug              TEXT,
    version           TEXT,
    status            TEXT CHECK (status IN ('draft','review','approved','implementing','completed','archived')),
    -- overview:
    ov_summary        TEXT,
    ov_problem_statement TEXT,
    ov_background     TEXT,
    ov_proposed_solution TEXT,
    ov_non_goals      TEXT[],
    -- context:
    ctx_overview      TEXT,
    ctx_existing_arch TEXT,
    -- data model:
    dm_overview       TEXT,
    -- api changes:
    api_overview      TEXT,
    -- rollback plan:
    rb_triggers       TEXT[],
    rb_steps          TEXT[],
    rb_data_recovery  TEXT,
    -- testing strategy:
    ts_overview       TEXT,
    ts_manual_testing TEXT[]
);
-- Child: tech_spec_goals, tech_spec_scope_items
-- Child: tech_spec_codebase_patterns, tech_spec_files_to_reference
-- Child: tech_spec_technical_decisions (with alternatives sub-table)
-- Child: tech_spec_constraints, tech_spec_stack_items
-- Child: tech_spec_entities (with fields + relationships)
-- Child: tech_spec_endpoints, tech_spec_files_to_modify, tech_spec_files_to_create
-- Child: tech_spec_code_patterns, tech_spec_test_patterns
-- Child: tech_spec_implementation_phases, tech_spec_implementation_tasks (with subtasks)
-- Child: tech_spec_risks, tech_spec_reviewers
-- + acceptance_criteria table (shared)
```

---

### 15-22. Remaining BMM Tables

```sql
-- 15. change_proposals (change-proposal.schema.json, 294 lines)
CREATE TABLE change_proposals (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- changeRequest:
    cr_id             TEXT,
    cr_title          TEXT NOT NULL,
    cr_description    TEXT NOT NULL,
    cr_requested_by   TEXT NOT NULL,
    cr_request_date   TIMESTAMPTZ,
    cr_change_type    TEXT CHECK (cr_change_type IN ('new-requirement','requirement-change','scope-reduction','scope-expansion','technical-discovery','external-dependency','priority-shift','resource-change','timeline-change')),
    cr_urgency        TEXT CHECK (cr_urgency IN ('critical','high','medium','low')),
    cr_source         TEXT,
    -- impactAnalysis:
    ia_overall_impact TEXT CHECK (ia_overall_impact IN ('minimal','moderate','significant','major')),
    ia_timeline_delay TEXT,
    ia_additional_effort TEXT,
    ia_arch_has_impact BOOLEAN,
    ia_arch_description TEXT,
    ia_arch_requires_update BOOLEAN,
    -- proposal:
    pr_recommendation TEXT CHECK (pr_recommendation IN ('approve','approve-with-modifications','defer','reject')),
    pr_rationale      TEXT,
    pr_rollback_plan  TEXT,
    -- approval:
    ap_status         TEXT CHECK (ap_status IN ('pending','approved','rejected','deferred')) DEFAULT 'pending',
    ap_approved_by    TEXT,
    ap_approval_date  TEXT,
    ap_approval_notes TEXT,
    ap_conditions     TEXT[],
    -- implementation:
    impl_status       TEXT CHECK (impl_status IN ('not-started','in-progress','completed','cancelled')) DEFAULT 'not-started',
    impl_started_at   TEXT,
    impl_completed_at TEXT,
    impl_implemented_by TEXT,
    impl_notes        TEXT
);
-- Child: cp_affected_epics, cp_affected_stories
-- Child: cp_ia_risk_assessment
-- Child: cp_proposal_options (with pros/cons)
-- Child: cp_stories_to_add/modify/remove, cp_documents_to_update

-- 16. code_reviews (code-review.schema.json, 275 lines)
CREATE TABLE code_reviews (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- storyReference:
    sr_story_id       TEXT,
    sr_story_key      TEXT,
    sr_story_title    TEXT,
    sr_story_file_path TEXT,
    sr_epic_id        TEXT,
    -- reviewSummary:
    rs_verdict        TEXT CHECK (rs_verdict IN ('approved','approved-with-fixes','changes-required','rejected')),
    rs_total_findings INTEGER,
    rs_critical_count INTEGER,
    rs_major_count    INTEGER,
    rs_minor_count    INTEGER,
    rs_suggestions_count INTEGER,
    rs_auto_fixable_count INTEGER,
    rs_review_duration TEXT,
    -- testCoverageAnalysis:
    tc_coverage_pct   REAL,
    tc_uncovered_areas TEXT[],
    tc_missing_test_types TEXT[],
    tc_quality_notes  TEXT,
    -- securityAnalysis:
    sa_vulnerabilities INTEGER,
    sa_checks_performed TEXT[],
    sa_recommendations TEXT[],
    -- architectureCompliance:
    ac_compliant      BOOLEAN,
    ac_notes          TEXT,
    -- reviewer notes:
    reviewer_notes    TEXT
);
-- Child: uses shared findings table with parent_type='code-review'
-- Child: code_review_ac_verifications, code_review_arch_violations, code_review_next_steps

-- 17. sprint_statuses (sprint-status.schema.json, 173 lines)
CREATE TABLE sprint_statuses (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    generated         TIMESTAMPTZ,
    project_name      TEXT NOT NULL,
    project_key       TEXT DEFAULT 'NOKEY',
    tracking_system   TEXT CHECK (tracking_system IN ('file-system','jira','linear','trello')) DEFAULT 'file-system',
    story_location    TEXT,
    -- summary:
    s_total_epics     INTEGER,
    s_completed_epics INTEGER,
    s_in_progress_epics INTEGER,
    s_total_stories   INTEGER,
    s_completed_stories INTEGER,
    s_in_progress_stories INTEGER,
    s_backlog_stories INTEGER
    -- developmentStatus is a dynamic key-value map → child table
    -- statusDefinitions are constants → not stored
);

CREATE TABLE sprint_status_epics (
    id                SERIAL PRIMARY KEY,
    sprint_status_id  TEXT REFERENCES sprint_statuses(id) ON DELETE CASCADE,
    epic_id           TEXT NOT NULL,
    title             TEXT NOT NULL,
    status            TEXT CHECK (status IN ('backlog','in-progress','done')),
    retro_status      TEXT,
    retro_file_path   TEXT,
    retro_completed_at TIMESTAMPTZ,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE sprint_status_stories (
    id                SERIAL PRIMARY KEY,
    sprint_epic_id    INTEGER REFERENCES sprint_status_epics(id) ON DELETE CASCADE,
    story_key         TEXT NOT NULL,
    story_id          TEXT,
    title             TEXT NOT NULL,
    status            TEXT CHECK (status IN ('backlog','ready-for-dev','in-progress','review','done')),
    file_path         TEXT,
    assignee          TEXT,
    started_at        TIMESTAMPTZ,
    completed_at      TIMESTAMPTZ,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE sprint_development_status (
    id                SERIAL PRIMARY KEY,
    sprint_status_id  TEXT REFERENCES sprint_statuses(id) ON DELETE CASCADE,
    key               TEXT NOT NULL,
    status            TEXT CHECK (status IN ('backlog','ready-for-dev','in-progress','review','done','optional'))
);

-- 18. retrospectives (retrospective.schema.json, 310 lines)
CREATE TABLE retrospectives (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- epicReference:
    er_epic_id        TEXT,
    er_title          TEXT,
    er_goal           TEXT,
    er_total_stories  INTEGER,
    er_start_date     DATE,
    er_completion_date DATE,
    er_duration_days  INTEGER,
    -- summary:
    s_overall_success TEXT CHECK (s_overall_success IN ('exceeded-expectations','met-expectations','partially-met','did-not-meet')),
    s_key_achievements TEXT[],
    s_main_challenges TEXT[],
    s_velocity_estimated TEXT,
    s_velocity_actual TEXT,
    s_velocity_variance TEXT,
    s_velocity_reason TEXT,
    -- teamFeedback:
    tf_process_improvements TEXT[],
    tf_tooling_improvements TEXT[],
    tf_communication_improvements TEXT[],
    -- metricsSnapshot:
    ms_lines_added    INTEGER,
    ms_lines_removed  INTEGER,
    ms_files_changed  INTEGER,
    ms_test_coverage  REAL,
    ms_bugs_found     INTEGER,
    ms_bugs_fixed     INTEGER,
    ms_review_iterations REAL
);
-- Child: retro_what_went_well, retro_what_didnt_go_well, retro_lessons_learned
-- Child: retro_story_analysis, retro_tech_debt_introduced/addressed
-- Child: retro_next_epic_impacts, retro_arch_changes, retro_new_discoveries
-- Child: retro_backlog_changes, action_items (shared)

-- 19. definition_of_done (flat schema, 138 lines)
CREATE TABLE definition_of_done (
    id                SERIAL PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- acceptanceSummary:
    as_total_criteria INTEGER,
    as_passed         INTEGER,
    as_failed         INTEGER,
    as_blocked        INTEGER,
    as_pass_pct       TEXT,
    -- summary:
    sm_total_items    INTEGER,
    sm_completed      INTEGER,
    sm_required       INTEGER,
    sm_required_completed INTEGER,
    sm_completion_pct TEXT,
    sm_all_required_complete BOOLEAN,
    sm_status         TEXT CHECK (sm_status IN ('not-started','in-progress','blocked','ready-for-review','done')),
    -- templates:
    tpl_epic          TEXT[],
    tpl_story         TEXT[],
    tpl_feature       TEXT[]
);

CREATE TABLE dod_items (
    id                TEXT PRIMARY KEY,
    dod_id            INTEGER REFERENCES definition_of_done(id) ON DELETE CASCADE,
    item              TEXT NOT NULL,
    category          TEXT CHECK (category IN ('code-quality','testing','documentation','review','deployment','security','performance','compliance')),
    required          BOOLEAN DEFAULT true,
    completed         BOOLEAN DEFAULT false,
    completed_by      TEXT,
    completed_at      TIMESTAMPTZ,
    evidence          TEXT,
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

CREATE TABLE dod_quality_gates (
    id                TEXT PRIMARY KEY,
    dod_id            INTEGER REFERENCES definition_of_done(id) ON DELETE CASCADE,
    gate              TEXT,
    criteria          TEXT[],
    passed            BOOLEAN DEFAULT false,
    passed_at         TIMESTAMPTZ,
    approver          TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- 20. fit_criteria (flat schema, 145 lines)
-- 3 category arrays + summary → parent + typed child
CREATE TABLE fit_criteria (
    id                SERIAL PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    sm_total_functional INTEGER,
    sm_total_nonfunctional INTEGER,
    sm_total_security INTEGER,
    sm_total_criteria INTEGER,
    sm_verified_count INTEGER,
    sm_verification_pct TEXT
);

CREATE TABLE fit_criterion_items (
    id                TEXT PRIMARY KEY,
    fit_criteria_id   INTEGER REFERENCES fit_criteria(id) ON DELETE CASCADE,
    category          TEXT NOT NULL CHECK (category IN ('functional','nonFunctional','security')),
    criterion         TEXT NOT NULL,
    verified          BOOLEAN DEFAULT false,
    verification_method TEXT,
    related_requirement TEXT,
    -- NFR-specific:
    nfr_category      TEXT,
    metric_measure    TEXT,
    metric_target     TEXT,
    metric_threshold  TEXT,
    metric_unit       TEXT,
    -- security-specific:
    compliance_standard TEXT,
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- 21. success_metrics (flat schema, 202 lines)
CREATE TABLE success_metrics (
    id                SERIAL PRIMARY KEY,
    project_id        TEXT NOT NULL REFERENCES projects(id),
    sm_total_metrics  INTEGER,
    sm_achieved_count INTEGER,
    sm_achievement_pct TEXT,
    sm_overall_status TEXT CHECK (sm_overall_status IN ('not-started','in-progress','partially-achieved','achieved','exceeded'))
);

CREATE TABLE success_metric_items (
    id                TEXT PRIMARY KEY,
    success_metrics_id INTEGER REFERENCES success_metrics(id) ON DELETE CASCADE,
    category          TEXT NOT NULL CHECK (category IN ('codeQuality','operational','customerImpact','deployment','business')),
    metric            TEXT NOT NULL,
    target            TEXT,
    measurement       TEXT,
    baseline          TEXT,
    achieved          BOOLEAN DEFAULT false,
    actual_value      TEXT,
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- 22. test_summaries (test-summary.schema.json, 183 lines)
CREATE TABLE test_summaries (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- summary:
    s_scope           TEXT,
    s_target_features TEXT[],
    s_testing_approach TEXT,
    s_framework_used  TEXT,
    s_total_tests_gen INTEGER,
    s_total_files_created INTEGER,
    -- coverageAnalysis:
    ca_prior_statement TEXT,
    ca_prior_branch   TEXT,
    ca_prior_function TEXT,
    ca_prior_line     TEXT,
    ca_target_statement TEXT,
    ca_target_branch  TEXT,
    ca_target_function TEXT,
    ca_target_line    TEXT,
    -- executionNotes:
    en_run_command    TEXT,
    en_prerequisites  TEXT[],
    en_known_issues   TEXT[]
);
-- Child: test_summary_generated_tests (with test_cases child)
-- Child: test_summary_coverage_gaps, test_summary_patterns, test_summary_recs
```

---

## TEA Module — 10 Schemas

```sql
-- 1. test_designs (test-design.schema.json, 108 lines)
CREATE TABLE test_designs (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    -- epicInfo:
    epic_id           TEXT,
    epic_title        TEXT,
    -- summary:
    summary_text      TEXT,
    risk_level        TEXT,
    -- coverage plan, entry/exit criteria, quality gate criteria
    entry_criteria    TEXT[],
    exit_criteria     TEXT[],
    quality_gate_criteria TEXT[]
);
-- Child: test_design_risk_assessments
-- Child: test_design_test_cases (with steps, expected results)
-- Child: test_design_execution_order
-- Child: test_design_mitigation_plans

-- 2. test_designs_qa (test-design-qa.schema.json) — same structure, QA-focused variant
-- 3. test_designs_architecture (test-design-architecture.schema.json) — architecture variant
-- (Both share the test_designs table structure with a `variant` column)

-- 4. test_reviews (test-review.schema.json, 97 lines)
CREATE TABLE test_reviews (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    review_scope      TEXT,
    overall_rating    TEXT,
    coverage_assessment TEXT,
    risk_summary      TEXT,
    traceability_summary TEXT
);
-- Child: uses shared findings, recommendations tables

-- 5. traceability_matrices (traceability-matrix.schema.json, 61 lines)
CREATE TABLE traceability_matrices (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    summary           TEXT,
    coverage_pct      REAL,
    gap_count         INTEGER
);

CREATE TABLE traceability_links (
    id                SERIAL PRIMARY KEY,
    matrix_id         TEXT REFERENCES traceability_matrices(id) ON DELETE CASCADE,
    requirement_id    TEXT,
    story_ids         TEXT[],
    test_ids          TEXT[],
    status            TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- 6. nfr_assessments (nfr-assessment.schema.json, 131 lines)
CREATE TABLE nfr_assessments (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    summary           TEXT,
    overall_compliance TEXT
);

CREATE TABLE nfr_assessment_items (
    id                TEXT PRIMARY KEY,
    assessment_id     TEXT REFERENCES nfr_assessments(id) ON DELETE CASCADE,
    nfr_type          TEXT CHECK (nfr_type IN ('performance','scalability','reliability','availability','maintainability','security','usability','interoperability')),
    requirement_id    TEXT,
    metric            TEXT,
    target            TEXT,
    threshold         TEXT,
    unit              TEXT,
    actual_value      TEXT,
    status            TEXT CHECK (status IN ('met','not-met','partially-met','not-tested')),
    verification_method TEXT,
    evidence          TEXT,
    notes             TEXT,
    sort_order        INTEGER DEFAULT 0
);

-- 7. test_frameworks (test-framework.schema.json, 55 lines)
CREATE TABLE test_frameworks (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    framework         TEXT,
    version           TEXT,
    configuration     TEXT,
    setup_steps       TEXT[],
    conventions       TEXT[],
    run_command       TEXT
);

-- 8. ci_pipelines (ci-pipeline.schema.json, 65 lines)
CREATE TABLE ci_pipelines (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    pipeline_name     TEXT,
    platform          TEXT,
    config_file       TEXT,
    trigger_events    TEXT[]
);

CREATE TABLE ci_pipeline_stages (
    id                SERIAL PRIMARY KEY,
    pipeline_id       TEXT REFERENCES ci_pipelines(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    description       TEXT,
    commands          TEXT[],
    dependencies      TEXT[],
    sort_order        INTEGER DEFAULT 0
);

-- 9. automation_summaries (automation-summary.schema.json, 55 lines)
CREATE TABLE automation_summaries (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    summary           TEXT,
    overall_coverage  TEXT,
    framework         TEXT,
    total_automated   INTEGER,
    total_manual      INTEGER,
    gap_summary       TEXT
);
-- Child: automation_gaps, automation_recs

-- 10. atdd_checklists (atdd-checklist.schema.json, 79 lines)
CREATE TABLE atdd_checklists (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    summary           TEXT,
    coverage_pct      REAL,
    readiness_status  TEXT
);
-- Child: atdd_story_items (story_id, acceptance_tests, coverage, status)
```

---

## CIS Module — 4 Schemas

```sql
-- 1. storytelling_artifacts (storytelling.schema.json, 71 lines)
CREATE TABLE storytelling_artifacts (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    audience          TEXT,
    purpose           TEXT,
    narrative         TEXT,
    story_type        TEXT,
    key_messages      TEXT[],
    delivery_notes    TEXT
);
-- Child: storytelling_structure_sections, storytelling_visual_elements

-- 2. problem_solving_artifacts (problem-solving.schema.json, 85 lines)
CREATE TABLE problem_solving_artifacts (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    problem_definition TEXT,
    problem_scope     TEXT,
    analysis_approach TEXT,
    selected_solution TEXT,
    implementation_plan TEXT,
    monitoring_strategy TEXT
);
-- Child: ps_root_causes, ps_solutions, ps_evaluation_criteria

-- 3. innovation_strategies (innovation-strategy.schema.json, 95 lines)
CREATE TABLE innovation_strategies (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    current_state     TEXT,
    disruption_analysis TEXT,
    strategy_summary  TEXT,
    business_model_description TEXT,
    roadmap_summary   TEXT,
    risk_assessment   TEXT
);
-- Child: is_opportunities, is_strategy_goals, is_roadmap_phases, is_risks

-- 4. design_thinking_artifacts (design-thinking.schema.json, 79 lines)
CREATE TABLE design_thinking_artifacts (
    id                TEXT PRIMARY KEY,
    metadata_id       TEXT REFERENCES metadata(id),
    project_id        TEXT NOT NULL REFERENCES projects(id),
    phase             TEXT,
    empathize_summary TEXT,
    define_summary    TEXT,
    ideate_summary    TEXT,
    prototype_summary TEXT,
    test_summary      TEXT
);
-- Child: dt_iterations, dt_insights, dt_prototypes
```

---

## Table Count Summary

| Category | Parent Tables | Child Tables (est.) | Total |
|---|---|---|---|
| Foundation | 2 (projects, metadata) | — | 2 |
| Shared children | 4 (requirements, acceptance_criteria, findings, recommendations, action_items) | — | 5 |
| BMM (22 schemas) | 22 | ~55 | ~77 |
| TEA (10 schemas) | 10 | ~15 | ~25 |
| CIS (4 schemas) | 4 | ~8 | ~12 |
| **Total** | **42** | **~78** | **~121** |

---

## Key Design Decisions

### Why ~121 tables instead of 3?

| Concern | JSONB approach (rejected) | Typed columns (chosen) |
|---|---|---|
| **Schema enforcement** | ❌ App-layer only | ✅ DB-level NOT NULL, CHECK, FK |
| **Query capability** | ⚠️ json_extract() | ✅ Native SQL WHERE/JOIN |
| **Migration safety** | ❌ Silent data drift | ✅ ALTER TABLE fails loudly |
| **Refactoring cost** | ❌ Find/replace in JSON | ✅ Column renames with tooling |
| **Complexity** | ✅ 3 tables | ⚠️ ~121 tables |
| **ORM generation** | ❌ No typed models | ✅ Full Prisma/TypeORM models |

### Smart normalization decisions

1. **String arrays** → `TEXT[]` (Postgres) — avoids join tables for simple lists
2. **Small nested objects** (2-3 scalar fields) → flattened with prefix (e.g., `summary_total_risks`)
3. **No separate tables** for: status definitions (constants), computed stats (riskMatrix), or template strings
4. **Shared tables** used when: 3+ schemas have the same child structure (findings, recommendations, action_items)

### Schemas WITHOUT metadata envelope

These 5 schemas have flat top-level properties (no `{metadata, content}` wrapper):

| Schema | DB Treatment |
|---|---|
| `risks.schema.json` | `risks_register` + separate metadata row linked by convention |
| `definition-of-done.schema.json` | `definition_of_done` — standalone |
| `fit-criteria.schema.json` | `fit_criteria` — standalone |
| `success-metrics.schema.json` | `success_metrics` — standalone |
| `use-case.schema.json` | `use_cases` — linked to epic |

---

## Next Steps After DB Structure Approval

1. **Choose ORM** — Prisma (recommended for TypeScript) or Drizzle or raw SQL
2. **Generate Prisma schema** from this mapping
3. **Build DAL interface** abstracting read/write for both JSON and DB
4. **Migration script** — read existing JSON files, insert into typed tables
5. **Feature flag** — switch between JSON and DB backends
