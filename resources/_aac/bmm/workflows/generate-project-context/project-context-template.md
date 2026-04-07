---
project_name: '{{project_name}}'
user_name: '{{user_name}}'
date: '{{date}}'
sections_completed: ['technology_stack']
existing_patterns_found: { { number_of_patterns_discovered } }
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

_Documented after discovery phase_

## Critical Implementation Rules

_Documented after discovery phase_

**Agent Integrity Patterns (CRITICAL)**
- **Unbacked Success Logs Banned**: Never print a success message (✅, "seeded", "complete", "Done") unless the preceding lines contain a real operation (HTTP call, DB query, file write, docker exec). A console log without preceding verifiable I/O is considered hallucination and is strictly prohibited.

**Path Resolution**
- **Absolute Resolution**: Use `import.meta.url` (ESM) or `__dirname` (CJS) for all file reads/writes within the application logic.
- **Banned Practices**: Do NOT use `process.cwd()` or string-relative paths (e.g. `'./config.json'`) which break unpredictably depending on execution location.
