---
title: "Definition of Done"
project: "{project_name}"
version: "1.0"
date: "{date}"
status: "draft"
output_format: dual
schema: "bmm/definition-of-done.schema.json"
---

# Definition of Done

## Overview

This document defines the criteria that must be met before any work item can be considered "Done" for {project_name}. All team members must verify these criteria before closing stories or epics.

**Purpose:** Ensure consistent quality and clear completion criteria across the team.

**Scope:** Applies to all epics, stories, and tasks in this project.

---

## DoD Checklist

### Code Quality

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-01 | Code follows project style guide (linting passes) | ✅ | code-quality |
| DOD-02 | No TypeScript/compilation errors | ✅ | code-quality |
| DOD-03 | No commented-out code or debug statements | ✅ | code-quality |
| DOD-04 | Code is self-documenting with clear naming | ✅ | code-quality |
| DOD-05 | Complex logic has explanatory comments | ⚪ | code-quality |

### Testing

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-06 | Unit tests written for new functionality | ✅ | testing |
| DOD-07 | All unit tests pass | ✅ | testing |
| DOD-08 | Code coverage meets threshold (≥80%) | ✅ | testing |
| DOD-09 | Integration tests pass | ✅ | testing |
| DOD-10 | Edge cases and error paths tested | ⚪ | testing |
| DOD-11 | No flaky tests introduced | ✅ | testing |

### Documentation

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-12 | README updated if setup changes | ✅ | documentation |
| DOD-13 | API documentation updated | ✅ | documentation |
| DOD-14 | Inline code documentation complete | ⚪ | documentation |
| DOD-15 | CHANGELOG entry added | ⚪ | documentation |

### Code Review

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-16 | Pull request created with description | ✅ | review |
| DOD-17 | At least one code review approval | ✅ | review |
| DOD-18 | All review comments addressed | ✅ | review |
| DOD-19 | No unresolved conversations | ✅ | review |

### Deployment

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-20 | Build passes in CI pipeline | ✅ | deployment |
| DOD-21 | Successfully deployed to staging | ✅ | deployment |
| DOD-22 | Smoke tests pass in staging | ✅ | deployment |
| DOD-23 | No deployment errors or warnings | ✅ | deployment |

### Security

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-24 | No secrets in code or commits | ✅ | security |
| DOD-25 | Security scan passes (no critical/high) | ✅ | security |
| DOD-26 | Input validation implemented | ✅ | security |
| DOD-27 | Authentication/authorization verified | ✅ | security |

### Performance

| ID | Item | Required | Category |
|----|------|----------|----------|
| DOD-28 | No performance regressions | ✅ | performance |
| DOD-29 | Meets performance requirements | ⚪ | performance |
| DOD-30 | No memory leaks introduced | ⚪ | performance |

---

## Quality Gates

### Gate 1: Code Review
- **Criteria:** PR approved by at least one code owner
- **Approver:** Code Owner / Tech Lead
- **Evidence:** GitHub/GitLab approval

### Gate 2: Testing
- **Criteria:** All tests pass, coverage threshold met
- **Approver:** Automated (CI)
- **Evidence:** CI pipeline green

### Gate 3: Security
- **Criteria:** Security scan passes
- **Approver:** Automated (CI) / Security Lead for exceptions
- **Evidence:** Security scan report

### Gate 4: Deployment
- **Criteria:** Successfully deployed to staging
- **Approver:** CI/CD Pipeline
- **Evidence:** Deployment logs

### Gate 5: Acceptance
- **Criteria:** All acceptance criteria verified
- **Approver:** Product Owner / QA
- **Evidence:** Acceptance checklist completed

---

## Templates

### Epic Definition of Done

For an epic to be considered done:

- [ ] All stories in epic are Done
- [ ] Epic-level integration testing complete
- [ ] End-to-end user flow verified
- [ ] Documentation complete (user-facing + technical)
- [ ] Stakeholder demo completed
- [ ] Deployed to production
- [ ] Monitoring/alerting configured
- [ ] Retrospective held

### Story Definition of Done

For a story to be considered done:

- [ ] All DoD checklist items verified
- [ ] All acceptance criteria met
- [ ] All quality gates passed
- [ ] PR merged to main branch
- [ ] Deployed to staging
- [ ] Product Owner acceptance

### Task Definition of Done

For a task to be considered done:

- [ ] Work completed as described
- [ ] Code reviewed (if applicable)
- [ ] Tests pass (if applicable)
- [ ] No blockers remaining

---

## Tracking Process

### When to Verify DoD

1. **Before requesting review:** Developer self-checks
2. **During code review:** Reviewer verifies
3. **Before merging:** Final verification
4. **Sprint review:** Confirm all items done

### Exception Process

If a DoD item cannot be met:

1. Document the exception with reason
2. Get Tech Lead approval
3. Create follow-up ticket to address
4. Note in sprint retrospective

### Evidence Requirements

| Gate | Evidence Required |
|------|-------------------|
| Code Review | PR approval screenshot/link |
| Testing | CI pipeline link showing green |
| Security | Security scan report |
| Deployment | Deployment log/URL |
| Acceptance | Completed acceptance checklist |

---

## Summary

| Metric | Value |
|--------|-------|
| Total DoD Items | 30 |
| Required Items | 24 |
| Optional Items | 6 |
| Quality Gates | 5 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {date} | [Author] | Initial definition |
