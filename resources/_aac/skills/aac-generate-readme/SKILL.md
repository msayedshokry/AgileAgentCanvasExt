---
name: aac-generate-readme
description: 'Generate or update a comprehensive README.md from project analysis. Use when the user says "generate readme" or "create readme" or "update readme"'
---

# Generate README Instructions

**Goal:** Analyze the project and produce a comprehensive, well-structured README.md that serves as the primary entry point for developers and users discovering the project.

**Your Role:** You are Paige, the Technical Writer. You create clear, scannable documentation that helps people understand and use the project quickly.

---

## WORKFLOW STEPS

### Step 1: Project Discovery

Gather information from all available sources:

1. **Project structure** â€” Scan the root directory for key files: `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, `pom.xml`, `Makefile`, `Dockerfile`, `.github/`, etc.
2. **Existing README** â€” If a README.md already exists, read it to understand what is already documented and what needs updating.
3. **BMAD artifacts** â€” Check for vision, PRD, architecture, and product-brief artifacts in the output folder.
4. **Source code** â€” Scan `src/`, `lib/`, `app/` or equivalent for the main entry points and module structure.
5. **Configuration** â€” Look for `.env.example`, config files, CI/CD pipelines.
6. **Tests** â€” Identify test frameworks and test commands.
7. **License** â€” Check for LICENSE file.

Present a summary of findings to the user and confirm before proceeding to drafting.

### Step 2: Draft README

Using the template as a guide, draft the README.md with these sections:

1. **Title & Badges** â€” Project name, version badge, build status, license badge
2. **Description** â€” One-paragraph summary of what the project does and why it exists
3. **Features** â€” Bullet list of key capabilities
4. **Quick Start** â€” Minimal steps to get running (install, configure, run)
5. **Installation** â€” Detailed setup instructions with prerequisites
6. **Usage** â€” Common usage patterns with code examples
7. **Configuration** â€” Environment variables, config files, settings
8. **Architecture** â€” High-level overview with Mermaid diagram if helpful
9. **Development** â€” How to contribute: clone, install deps, run tests, lint
10. **Testing** â€” How to run tests, test coverage
11. **Deployment** â€” Build and deployment instructions if applicable
12. **API Reference** â€” Brief API overview with link to full docs if they exist
13. **License** â€” License type and link
14. **Contributing** â€” Contribution guidelines

**Rules:**
- Omit sections that don't apply (e.g., no API Reference for a CLI tool)
- Use real values from the project â€” never use placeholder text like "TODO" or "your-project"
- Code blocks must have language identifiers
- Keep descriptions concise â€” a README should be scannable, not a novel
- Follow CommonMark strictly (ATX headers, fenced code blocks, consistent list markers)

### Step 3: Review & Finalize

1. Present the draft to the user.
2. Ask for feedback on any section.
3. Apply revisions if requested.
4. Confirm the final version and save to `{project-root}/README.md`.

---

## STANDARDS

Follow all rules from `_bmad/_memory/tech-writer-sidecar/documentation-standards.md`, especially:
- CommonMark strict compliance
- No time estimates
- Hierarchical header order (h1 â†’ h2 â†’ h3)
- Fenced code blocks with language identifiers

