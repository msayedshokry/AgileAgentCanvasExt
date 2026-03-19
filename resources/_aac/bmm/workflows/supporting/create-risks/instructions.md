# Risk Assessment Instructions

## Purpose

Create a comprehensive risk assessment document that identifies potential threats to project success, analyzes their impact, and defines mitigation strategies. This proactive approach helps teams anticipate and prepare for challenges.

## When to Use This Workflow

- During project planning (after PRD, before implementation)
- When starting a new sprint or epic
- After significant scope changes
- When integrating with external systems
- During architecture review
- As part of go-live readiness assessment

## Input Artifacts

Review these to identify risks:

1. **PRD** (required) - Business and functional risks
2. **Architecture** (required) - Technical and integration risks
3. **Tech Spec** (if available) - Implementation risks
4. **Project Timeline** - Schedule risks
5. **Team Composition** - Resource risks
6. **External Dependencies** - Dependency risks

## Risk Categories

Systematically review each category:

### Technical Risks
- Technology maturity and stability
- Integration complexity
- Performance concerns
- Security vulnerabilities
- Data integrity issues
- Scalability limitations

### Operational Risks
- Deployment complexity
- Monitoring gaps
- Support readiness
- Documentation gaps
- Training needs

### Resource Risks
- Team availability
- Skill gaps
- Knowledge concentration
- Vendor dependencies

### Schedule Risks
- Deadline feasibility
- Dependency timing
- Scope creep potential
- External blockers

### Security/Compliance Risks
- Data protection
- Access control
- Audit requirements
- Regulatory compliance

### Integration Risks
- Third-party systems
- API stability
- Data synchronization
- Version compatibility

## Risk Assessment Process

### Step 1: Risk Identification

1. Review all input artifacts
2. Brainstorm risks in each category
3. Document assumptions that could become risks
4. Identify external dependencies

**Questions to Ask:**
- What could prevent us from delivering on time?
- What could cause the system to fail in production?
- What are we assuming that might not be true?
- What external factors are outside our control?

### Step 2: Risk Analysis

For each risk, assess:

**Probability** (likelihood of occurrence):
- Low: Unlikely (<20%)
- Medium: Possible (20-50%)
- High: Likely (50-80%)
- Very High: Almost certain (>80%)

**Impact** (consequence if it occurs):
- Low: Minor inconvenience, workaround exists
- Medium: Moderate delay or degraded functionality
- High: Significant delay or major functionality impact
- Critical: Project failure or severe business impact

**Risk Score** = Probability × Impact

| | Low Impact | Medium Impact | High Impact | Critical Impact |
|---|---|---|---|---|
| **Very High Prob** | Medium | High | Critical | Critical |
| **High Prob** | Medium | High | High | Critical |
| **Medium Prob** | Low | Medium | High | High |
| **Low Prob** | Low | Low | Medium | High |

### Step 3: Mitigation Planning

For each significant risk (Medium or higher):

1. **Mitigation Strategy**: Actions to reduce probability or impact
2. **Contingency Plan**: What to do if the risk materializes
3. **Triggers**: Warning signs to watch for
4. **Owner**: Who is responsible for monitoring
5. **Timeline**: When mitigations should be in place

### Step 4: Document Assumptions

List assumptions that underpin the project:
- If assumption proves false, what risk emerges?
- How can we validate the assumption?
- When should validation occur?

### Step 5: Track Dependencies

Document external dependencies:
- What is the dependency?
- What type (upstream, vendor, infrastructure)?
- What risk does it pose?
- What is the mitigation?

## Quality Checklist

Before finalizing:

- [ ] All risk categories reviewed
- [ ] Each risk has ID, description, probability, impact
- [ ] High/Critical risks have mitigation strategies
- [ ] All risks have owners assigned
- [ ] Assumptions documented with validation plans
- [ ] Dependencies identified with mitigations
- [ ] Risk matrix summary is accurate
- [ ] Related requirements are linked

## Output Format

Produce output in dual format:
1. **Markdown** (`risks.md`) - Human-readable document
2. **JSON** (`risks.json`) - Machine-processable format

### Markdown Structure

```markdown
# Risk Assessment

## Executive Summary
- Total Risks: X
- Critical: X | High: X | Medium: X | Low: X
- Overall Risk Level: [Low/Medium/High/Critical]

## Risk Matrix
[Visual or table representation]

## Detailed Risks

### RISK-01: [Title]
- **Category:** [technical/operational/security/etc.]
- **Probability:** [Low/Medium/High/Very High]
- **Impact:** [Low/Medium/High/Critical]
- **Risk Score:** [Low/Medium/High/Critical]
- **Description:** [Detailed description]
- **Impact Analysis:** [What happens if it occurs]
- **Mitigation Strategy:** [How to prevent/reduce]
- **Contingency Plan:** [What to do if it happens]
- **Triggers:** [Warning signs]
- **Owner:** [Responsible person/team]
- **Status:** [Identified/Mitigating/Monitoring/Closed]

## Assumptions
[List with validation plans]

## Dependencies
[List with risk analysis]
```

## Interaction Style

- Ask probing questions to uncover hidden risks
- Challenge optimistic assessments constructively
- Propose mitigations based on best practices
- Ensure coverage of all risk categories
- Link risks to specific requirements/components

## Risk Review Cadence

Recommend ongoing risk management:
- **Weekly**: Review high/critical risks
- **Sprint Start**: Update risk register
- **Major Changes**: Re-assess impacted risks
- **Milestone**: Comprehensive risk review

## Next Steps After Completion

1. Review with technical leads and stakeholders
2. Assign owners to all significant risks
3. Add risk monitoring to sprint ceremonies
4. Update as project progresses
5. Close risks that are fully mitigated
