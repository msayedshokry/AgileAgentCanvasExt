---
description: Perform STRIDE and OWASP Top 10 security assessment
---

# Security Audit Workflow

This workflow performs an adversarial security review of a specification.

## 1. Initial Assessment
Review the provided artifact (PRD, Architecture, or Epic) to understand the system boundaries, data flows, and actors. Identify the most critical assets.

## 2. STRIDE Threat Modeling
Apply the STRIDE framework to the core components:
- **S**poofing: How can identity be faked?
- **T**ampering: How can data be modified?
- **R**epudiation: How can actions be denied?
- **I**nformation Disclosure: How can data leak?
- **D**enial of Service: How can availability be disrupted?
- **E**levation of Privilege: How can authorization be bypassed?

## 3. OWASP Cross-Check
Quickly check against the OWASP Top 10 vulnerabilities (Injection, Broken Authentication, Sensitive Data Exposure, etc.) relevant to the tech stack.

## 4. Confidence Gate
Provide a security confidence score out of 10.
- If the score is `< 8`, you must list blocking vulnerabilities that must be addressed before implementation.
- If the score is `>= 8`, list accepted risks and proceed.

## 5. Output Generation
Generate a brief `security-audit.md` document in the appropriate project folder summarizing the findings, or update the existing document if instructed by the user.
