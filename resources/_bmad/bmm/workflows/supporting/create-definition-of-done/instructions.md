# Definition of Done Instructions

## Purpose

Create clear, measurable Definition of Done (DoD) criteria that define when work items (epics, stories, tasks) are truly complete. A well-defined DoD ensures consistent quality, prevents incomplete work from being marked done, and aligns team expectations.

## When to Use This Workflow

- At project kickoff (define project-wide DoD)
- When starting a new epic (customize DoD for epic)
- When team standards evolve
- After quality issues indicate DoD gaps
- When onboarding new team members

## Benefits of a Clear DoD

1. **Consistency**: All team members agree on "done"
2. **Quality**: Built-in quality gates prevent defects
3. **Transparency**: Clear expectations for stakeholders
4. **Velocity**: Reduces rework from incomplete items
5. **Trust**: Stakeholders can rely on "done" status

## DoD Structure

### Checklist Items

Individual items that must be verified:

| Category | Example Items |
|----------|--------------|
| **Code Quality** | Linting passes, no TypeScript errors, follows style guide |
| **Testing** | Unit tests written, integration tests pass, coverage threshold met |
| **Documentation** | Code documented, README updated, API docs current |
| **Review** | PR approved, code review complete, no blocking comments |
| **Deployment** | Builds successfully, deploys to staging, smoke tests pass |
| **Security** | No vulnerabilities, secrets not exposed, access controls verified |
| **Performance** | Meets performance criteria, no regressions |
| **Compliance** | Accessibility checked, license compliance verified |

### Quality Gates

Major checkpoints that require approval:

1. **Code Review Gate**: All code reviewed and approved
2. **Testing Gate**: All tests pass, coverage met
3. **Security Gate**: Security scan passes
4. **Deployment Gate**: Successfully deployed to staging
5. **Acceptance Gate**: Acceptance criteria verified

## Creation Process

### Step 1: Understand Context

1. Review existing team standards
2. Identify project-specific requirements
3. Consider compliance/regulatory needs
4. Note past quality issues to address

**Questions to Ask:**
- What quality issues have occurred?
- What standards does the team follow?
- Are there compliance requirements?
- What deployment process is used?

### Step 2: Define Categories

Organize DoD items by category:

```
Code Quality     → Clean, maintainable code
Testing          → Verified functionality
Documentation    → Knowledge captured
Review           → Peer validation
Deployment       → Production-ready
Security         → Safe and compliant
Performance      → Meets requirements
```

### Step 3: Create Checklist Items

For each category, define specific, verifiable items:

**Good DoD Item:**
- ✅ "All unit tests pass with >80% coverage"
- ✅ "PR has at least one approval from code owner"
- ✅ "No critical/high security vulnerabilities"

**Poor DoD Item:**
- ❌ "Code is good quality" (subjective)
- ❌ "Tests are written" (not measurable)
- ❌ "Everything works" (not specific)

### Step 4: Define Quality Gates

Identify major checkpoints:
1. What gates must be passed?
2. Who can approve each gate?
3. What criteria define gate passage?

### Step 5: Create Templates

Provide DoD templates for different work types:

**Epic DoD** (higher-level):
- All stories complete
- Integration tested
- Documentation complete
- Stakeholder demo done
- Production deployed

**Story DoD** (detailed):
- Code complete
- Tests written and passing
- PR approved
- Deployed to staging
- Acceptance criteria met

### Step 6: Document Tracking Process

Define how DoD is tracked:
- When is DoD checked?
- Who verifies each item?
- How are exceptions handled?
- Where is evidence recorded?

## Quality Checklist

Before finalizing:

- [ ] All categories covered
- [ ] Items are specific and measurable
- [ ] Items are achievable within sprint
- [ ] No redundant items
- [ ] Quality gates defined
- [ ] Templates for epic/story created
- [ ] Tracking process documented
- [ ] Team has agreed to DoD

## Output Format

Produce output in dual format:
1. **Markdown** (`definition-of-done.md`) - Human-readable document
2. **JSON** (`definition-of-done.json`) - Machine-processable format

### Markdown Structure

```markdown
# Definition of Done

## Overview
Purpose and scope of this DoD.

## DoD Checklist

### Code Quality
- [ ] Item 1
- [ ] Item 2

### Testing
- [ ] Item 1
...

## Quality Gates
### Gate 1: [Name]
- Criteria: [...]
- Approver: [Role]

## Templates
### Epic DoD
[Checklist]

### Story DoD
[Checklist]

## Tracking
[Process description]
```

## Interaction Style

- Ask about existing team practices
- Propose industry best practices
- Ensure items are measurable
- Balance thoroughness with practicality
- Get agreement on each category

## DoD Evolution

The DoD should evolve:
- **Add items** when quality issues emerge
- **Remove items** that are automated/redundant
- **Refine items** that cause confusion
- **Review quarterly** with the team

## Common Pitfalls to Avoid

1. **Too many items**: Overwhelming, ignored
2. **Vague items**: Can't verify, inconsistent
3. **Too strict**: Slows delivery, causes workarounds
4. **No ownership**: Nobody checks
5. **Never updated**: Becomes irrelevant

## Next Steps After Completion

1. Review with full team for buy-in
2. Add to project documentation
3. Integrate into PR templates
4. Train team on using DoD
5. Review and update regularly
