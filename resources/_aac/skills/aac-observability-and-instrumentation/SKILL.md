---
name: aac-observability-and-instrumentation
description: 'Instruments code so production behavior is visible and diagnosable. Use when adding logging, metrics, tracing, or alerting to a feature. Use when shipping anything that runs in production and the user needs evidence it works. Use when production issues were reported but the available data could not answer what happened.'
---

# Observability and Instrumentation

Code you can't observe is code you can't operate. Observability is the ability to answer "what is the system doing and why?" from the outside, using the telemetry the code emits. Instrumentation is not a post-launch add-on — it is written alongside the feature, the same way tests are. If a feature ships without telemetry, the first user-reported bug becomes archaeology instead of a query.

## Overview

Three signals cover most production diagnostics. Knowing which to emit, where, and at what cardinality is what separates observable code from code that merely logs.

- **Logs** — discrete events with a message and structured fields. The "what happened" record. Use for state transitions, user actions, errors.
- **Metrics** — numeric time series, aggregated at write. The "is it healthy" record. Use for rates, latencies, queue depths, error counts.
- **Traces** — causal chains across service boundaries. The "where did the time go" record. Use for any request that crosses a function, a service, a queue, or a database.

The cheapest instrumentation is the one you write *with* the feature, not after.

## When to Use

- Building any feature that will run in production
- Adding a new service, endpoint, background job, or external integration
- A production incident took too long to diagnose because "we couldn't tell what happened"
- Setting up or reviewing alerting rules
- Reviewing a PR that adds I/O, retries, queues, or cross-service calls
- A new log line is being added and the question "will this be useful in three months?" is not obvious

**When NOT to use:**

- Diagnosing a failure happening right now — that is `aac-diagnose` (the diagnose skill). Observability is what makes the next diagnose fast.
- Profiling a measured slowness — that is a performance skill. Observability feeds the measurement.
- Launch-day monitoring checklists and rollback triggers — that is the shipping skill. Observability is the telemetry the shipping skill checks.

## The Process

### 1. Name the failure modes

Before writing instrumentation, list the three or four most likely ways the feature could fail in production. "It could be slow", "it could return wrong data", "it could be down entirely" — concretely, with examples. Each failure mode maps to a signal that would diagnose it.

### 2. Pick the signal for each

- **Is the symptom "it happened / it didn't"?** Log. A discrete event.
- **Is the symptom "how fast / how often / how big"?** Metric. A counter, gauge, or histogram.
- **Is the symptom "where did the request go"?** Trace. A span per hop.

It is common for one failure mode to need two or all three signals. "It returned wrong data" might need a log for the event, a trace to find the request, and a metric for the count.

### 3. Pick the cardinality carefully

Every label on a metric is a dimension in the time-series database. A metric labelled by user-id has unbounded cardinality and will blow up the storage. A metric labelled by `endpoint × status × region` is bounded. Decide which fields are *identifiers* (go in logs) and which are *dimensions* (go in metrics). The rule: anything that grows with users goes in logs; anything that grows with system structure goes in metrics.

### 4. Set the SLO before the alert

Every alert should map to a Service Level Objective. The SLO is the contract; the alert fires when the contract is at risk of being broken. Alerting on raw thresholds ("error count > 100") produces noise; alerting on SLO burn rate ("we will breach the 99.9% SLO in 4 hours at this rate") produces signal.

### 5. Test the instrumentation

A log line that is never written is a log line that does not exist. Test that the instrumentation fires by running the code path under a test or staging environment and grepping the output. A metric that does not increment is the same as no metric.

## Common Rationalizations

| Rationalization | Reality |
|---|---|
| "We'll add logging when there's a problem" | The first user-reported bug will be the archaeology case. Add the signal now, while you know the code path. |
| "The error message is enough" | An error message is a single signal. Production needs logs (events), metrics (trends), and traces (causality). One signal is not observability. |
| "We'll use the default logger" | Default loggers emit unstructured strings. Structured fields are what makes logs queryable. |
| "Adding metrics will slow it down" | A counter increment is nanoseconds. A trace span is microseconds. The cost of *not* having them is hours of incident response. |
| "We can infer it from existing logs" | Inference is what you do when the right signal does not exist. Inference is not a substitute for the signal. |
| "Cardinality is fine" | It is fine until a user-id gets logged as a label. Audit every label before shipping. |
| "Alerts on raw thresholds are fine" | Raw thresholds alert on noise. SLO burn-rate alerts page on real risk. |

## Red Flags

- A new feature has no metrics, only logs (or only metrics, no logs)
- Log lines are unstructured strings rather than `{ event, fields, timestamp }`
- Metrics have user-controlled fields as labels (user-id, request-id, anything unbounded)
- Alerts exist with no corresponding SLO documented
- A log line includes a secret, a password, a token, or PII
- A trace span is opened but never closed
- An error is caught and swallowed without a log or metric
- The instrumentation was added in a "we'll add it later" follow-up ticket that is still open six months later

## Verification

Before a feature is considered observability-ready:

- [ ] The three or four most likely failure modes are named
- [ ] Each failure mode has at least one signal (log, metric, or trace) that would diagnose it
- [ ] Metric labels are bounded — no user-controlled fields, no unbounded cardinality
- [ ] Every alert has a documented SLO it protects
- [ ] No log line, metric label, or trace field contains secrets, tokens, or PII
- [ ] The instrumentation is tested in staging or via a unit test that asserts it fires
- [ ] Caught errors are logged with stack and context, not silently swallowed
- [ ] The instrumentation code is reviewed alongside the feature, not in a follow-up
