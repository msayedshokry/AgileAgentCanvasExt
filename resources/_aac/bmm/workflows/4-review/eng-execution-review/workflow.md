---
description: Lock down execution architecture, data flows, and edge cases
---

# Eng Execution Review Workflow

This workflow performs an aggressive "Eng Manager" teardown of technical plans to lock in the architecture.

## 1. Data Flow Analysis
Trace data entirely through the system. Identify possible race conditions, deadlocks, state staleness, or excessive latency points.

## 2. DB Architecture
Evaluate the rigidity of the database schema (if any). Are relationships over-normalized or under-normalized? What are the migration failure modes?

## 3. Edge Cases
Enumerate exactly 5 specific, probable failure modes that are currently unaccounted for in the architecture doc. 

## 4. Test Coverage Gaps
Identify which critical paths are hardest to test with the current design. Advocate for testability (e.g., dependency injection).

## 5. Output
Output your findings either as direct, actionable amendments to the Architecture document or as a standalone `eng-review.md` artifact. Provide an explicit "Locked for Code" binary verdict.
