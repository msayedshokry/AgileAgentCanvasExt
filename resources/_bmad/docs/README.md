# BMAD Dual-Output System Documentation

Welcome to the documentation for the BMAD Dual-Output System. This system produces workflow artifacts in both JSON (machine-readable) and Markdown (human-readable) formats.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Dual-Output System](dual-output-system.md) | Overview, architecture, and quick start guide |
| [Converting Artifacts to JSON](bmad-to-json.md) | How to convert existing Markdown artifacts to JSON |
| [Schema Reference](schema-reference.md) | Detailed reference for all JSON schemas |
| [Migration Guide](migration-guide.md) | How to migrate from `_bmad` to `_bmad_new` |
| [JSON to Markdown](json-to-markdown.md) | How the Markdown rendering works |
| [Workflow Format Conventions](workflow-format-conventions.md) | File format conventions (.yaml vs .md, step architecture) |
| [Special Features](special-features.md) | Party Mode, Brainstorming, Teach Me Testing, Teams |

## Quick Links

### For Users
- [Quick Start Guide](dual-output-system.md#quick-start)
- [Converting Existing Artifacts](bmad-to-json.md#quick-start)
- [Supported Artifact Types](bmad-to-json.md#supported-artifacts)

### For Workflow Authors
- [Workflow Configuration](dual-output-system.md#configuration-reference)
- [Template Variables](dual-output-system.md#template-variables)
- [Enabling Dual Output](dual-output-system.md#1-enable-dual-output-in-a-workflow)
- [File Format Conventions](workflow-format-conventions.md)
- [Step File Architecture](workflow-format-conventions.md#step-file-architecture)

### For Special Features
- [Party Mode](special-features.md#party-mode)
- [Brainstorming](special-features.md#brainstorming-workflow)
- [Teach Me Testing](special-features.md#teach-me-testing)
- [Team Configurations](special-features.md#team-configurations)
- [Agent Customization](special-features.md#agent-customization)

### For Schema Designers
- [Common Schemas](schema-reference.md#common-schemas)
- [Creating New Schemas](schema-reference.md#creating-new-schemas)
- [Validation Rules](schema-reference.md#schema-validation-rules)

### For Migration
- [Step-by-Step Migration](migration-guide.md#migration-steps)
- [Metadata Changes](migration-guide.md#step-4-metadata-format-changes)
- [Converting Artifacts](migration-guide.md#migrating-existing-artifacts)

## Validation

Run the validation script to check your schemas, templates, and workflows:

```bash
cd _bmad/scripts
python validate_schemas.py
```

## File Structure

```
_bmad/
├── docs/                 # This documentation
│   ├── README.md         # This file
│   ├── dual-output-system.md
│   ├── bmad-to-json.md
│   ├── schema-reference.md
│   ├── migration-guide.md
│   ├── json-to-markdown.md
│   ├── workflow-format-conventions.md
│   └── special-features.md
├── schemas/              # JSON Schema definitions
│   ├── index.json        # Schema registry
│   ├── common/           # Shared schemas
│   ├── bmm/              # BMM module schemas
│   ├── tea/              # TEA module schemas
│   └── cis/              # CIS module schemas
├── scripts/              # Validation and utility scripts
│   ├── validate_schemas.py
│   ├── test_workflow_runtime.py
│   ├── json_to_markdown.py
│   └── fix_template_metadata.py
├── bmm/                  # Business & Method Module
│   ├── workflows/
│   │   ├── 1-analysis/
│   │   ├── 2-plan-workflows/
│   │   ├── 3-solutioning/
│   │   ├── 4-implementation/
│   │   ├── supporting/   # Use cases, risks, DoD workflows
│   │   └── qa/
│   └── teams/            # Team configurations
├── tea/                  # Test Engineering & Architecture
│   ├── workflows/testarch/
│   └── teams/
├── cis/                  # Creative & Innovation Strategies
│   ├── workflows/
│   └── teams/
└── core/                 # Core workflow infrastructure
    └── workflows/
        ├── party-mode/   # Multi-agent collaboration
        └── brainstorming/
```

## System Statistics

- **36** JSON Schema files (including 8 new schemas added)
- **21+** JSON template files (aligned with schemas)
- **27+** workflows configured with dual output
- **3** supporting workflows (use-cases, risks, definition-of-done)
- **7** documentation files
