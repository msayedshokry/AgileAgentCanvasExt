---
title: "Risk Assessment"
project: "{project_name}"
version: "1.0"
date: "{date}"
status: "draft"
output_format: json
schema: "bmm/risks.schema.json"
---

# Risk Assessment

## Executive Summary

**Project:** {project_name}
**Assessment Date:** {date}
**Overall Risk Level:** [Low/Medium/High/Critical]

| Risk Level | Count |
|------------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 0 |
| Low | 0 |
| **Total** | **0** |

**Key Findings:**
- [Top risk summary]
- [Second risk summary]
- [Action items]

---

## Risk Matrix

```
                    IMPACT
              Low   Med   High  Critical
         ┌─────────────────────────────┐
Very High│     │     │     │          │
         ├─────────────────────────────┤
P   High │     │     │     │          │
R        ├─────────────────────────────┤
O Medium │     │     │     │          │
B        ├─────────────────────────────┤
    Low  │     │     │     │          │
         └─────────────────────────────┘
```

**Risk IDs by Quadrant:**
- Critical: [RISK-XX, ...]
- High: [RISK-XX, ...]
- Medium: [RISK-XX, ...]
- Low: [RISK-XX, ...]

---

## Detailed Risks

### RISK-01: [Risk Title]

| Attribute | Value |
|-----------|-------|
| **ID** | RISK-01 |
| **Category** | [technical/operational/security/resource/schedule/integration] |
| **Probability** | [Low/Medium/High/Very High] |
| **Impact** | [Low/Medium/High/Critical] |
| **Risk Score** | [Low/Medium/High/Critical] |
| **Owner** | [Name/Team] |
| **Status** | [Identified/Analyzing/Mitigating/Monitoring/Closed] |

**Description:**
[Detailed description of the risk]

**Impact Analysis:**
[What happens if this risk materializes - specific consequences]

**Mitigation Strategy:**
1. [Action to reduce probability or impact]
2. [Additional mitigation action]

**Contingency Plan:**
[What to do if the risk occurs despite mitigation]

**Triggers/Warning Signs:**
- [Early indicator 1]
- [Early indicator 2]

**Related:**
- Requirements: [REQ-XX]
- Components: [Component name]

**Residual Risk:** [None/Low/Medium/High] after mitigation

---

### RISK-02: [Risk Title]

[Repeat structure]

---

## Assumptions

Assumptions that could become risks if proven false:

| ID | Assumption | If False | Validation Method | Validated |
|----|------------|----------|-------------------|-----------|
| ASM-01 | [Assumption] | [Risk that emerges] | [How to validate] | [ ] |
| ASM-02 | [Assumption] | [Risk that emerges] | [How to validate] | [ ] |

---

## Dependencies

External dependencies that pose risk:

| ID | Dependency | Type | Risk | Mitigation |
|----|------------|------|------|------------|
| DEP-01 | [Dependency] | [upstream/vendor/infrastructure] | [Risk description] | [Mitigation] |
| DEP-02 | [Dependency] | [Type] | [Risk] | [Mitigation] |

---

## Risk Management Plan

### Review Schedule
- **Weekly:** High/Critical risk status review
- **Sprint Planning:** Risk register update
- **Major Changes:** Impact assessment
- **Milestones:** Comprehensive review

### Escalation Path
1. Risk Owner → identifies and monitors
2. Tech Lead → approves mitigation plans
3. Project Lead → escalates blockers
4. Stakeholders → critical risk decisions

### Risk Closure Criteria
- [ ] Mitigation implemented
- [ ] No longer applicable
- [ ] Risk occurred and resolved
- [ ] Accepted with documented rationale

---

## Appendix

### Risk Category Definitions

| Category | Description |
|----------|-------------|
| Technical | Technology, architecture, implementation risks |
| Operational | Deployment, monitoring, support risks |
| Security | Data protection, access, compliance risks |
| Resource | Team, skills, availability risks |
| Schedule | Timeline, deadline, dependency timing risks |
| Integration | Third-party, API, data sync risks |

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {date} | [Author] | Initial assessment |
