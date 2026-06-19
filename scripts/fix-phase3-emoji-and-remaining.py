#!/usr/bin/env python
"""Phase-3 finish-script: apply remaining ~19 edits after main script applied 8.

This file processes only what didn't get applied by `apply-phase3-lint-edits.py`:
  - agent-team.steps.ts: emoji regex bug fix (L555)
  - terminal-executor.steps.ts: regex useless-escape (L161)
  - workflow-executor.steps.ts: regex useless-escape (L75)
  - agent-message-bus.steps.ts: 7 no-bare-assert messages
  - a2a-outbound-client.steps.ts: 4 no-bare-assert messages
  - agentic-kanban.steps.ts: 1 no-bare-assert message
  - kanban-data-integrity.steps.ts: 1 no-bare-assert message
  - kanban-orchestrator.steps.ts: 2 no-bare-assert messages
  - trace-recorder.steps.ts: 2 no-empty catch comments

CRITICAL: This script writes ALL anchors/labels via sys.stdout.write to avoid
charset-incompatible print statements that triggered UnicodeEncodeError on
the prior main-script run.
"""

import sys

def apply_one(filepath, old, new, label):
    with open(filepath, encoding="utf-8") as f:
        text = f.read()
    had_trailing_newline = text.endswith("\n")
    body = text[:-1] if had_trailing_newline else text
    count = body.count(old)
    if count == 1:
        body = body.replace(old, new, 1)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(body + ("\n" if had_trailing_newline else ""))
        sys.stdout.write(f"  {label}: OK (1 match)\n")
        return True
    else:
        sys.stdout.write(f"  {label}: FAIL (count={count}, NOT FOUND OR AMBIGUOUS)\n")
        if count != 0:
            sys.stdout.write(f"    expected single unique anchor\n")
        return False

# ============================================================================
# agent-team.steps.ts L555 — emoji regex bug (/gu flag added)
# ============================================================================
# The anchor uses ENTIRE surrogate-pair notation for the 🤖 emoji:
#   \ud83e\udd16 = the surrogate halves of 🤖 (U+1F916)
#   \u2705       = ✅
#   \u274c       = ❌
# This works because the file has the literal UTF-8 bytes for these code points,
# and Python's str treats \ud83e\udd16 as one logical character (U+1F916).
AGENT_TEAM_ANCHOR = ".replace(/[\U0001F916\u2705\u274c]/g"
AGENT_TEAM_NEW    = ".replace(/[\U0001F916\u2705\u274c]/gu"

# ============================================================================
# Run all remaining edits
# ============================================================================
TOTAL = 0
SUCCESS = 0

# 1. Emoji bug fix (agent-team)
TOTAL += 1
if apply_one(
    "features/step_definitions/agent-team.steps.ts",
    AGENT_TEAM_ANCHOR,
    AGENT_TEAM_NEW,
    "agent-team.steps.ts L555 emoji",
):
    SUCCESS += 1

# 2-3. Useless-escape in terminal-executor + workflow-executor stubs (sanitizeId)
# Both files have identical stub text. Apply directly.
SE_STUB_OLD = "id.replace(/[^A-Za-z0-9._\\-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),"
SE_STUB_NEW = "id.replace(/[^A-Za-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''),"

for filepath, label in [
    ("features/step_definitions/terminal-executor.steps.ts", "terminal-executor L161 stub"),
    ("features/step_definitions/workflow-executor.steps.ts", "workflow-executor L75 stub"),
]:
    TOTAL += 1
    if apply_one(filepath, SE_STUB_OLD, SE_STUB_NEW, label):
        SUCCESS += 1

# 4. agent-message-bus.steps.ts (7 no-bare-assert)
AMB_EDITS = [
    (
        "      assert.deepStrictEqual(entry.received[0].payload, expected);\n      return;\n    }\n  }\n  assert.fail('No agent received any message to inspect');\n});\n\nThen('the most recent message should have priority {string}'",
        "      assert.deepStrictEqual(entry.received[0].payload, expected, 'Expected same agent first payload to match');\n      return;\n    }\n  }\n  assert.fail('No agent received any message to inspect');\n});\n\nThen('the most recent message should have priority {string}'",
    ),
    (
        "  assert.strictEqual(latest.priority, priority);\n});\n\nThen('the publish should return {int} envelopes'",
        "  assert.strictEqual(latest.priority, priority, `Expected latest.priority to be '${priority}'`);\n});\n\nThen('the publish should return {int} envelopes'",
    ),
    (
        "  assert.strictEqual(ctx.lastEnvelopes.length, count);\n});\n\nThen('the publish should return {int} envelope with delivered false'",
        "  assert.strictEqual(ctx.lastEnvelopes.length, count, `Expected ${count} envelope(s), got ${ctx.lastEnvelopes.length}`);\n});\n\nThen('the publish should return {int} envelope with delivered false'",
    ),
    (
        "  assert.strictEqual(ctx.lastEnvelopes.length, count);\n  for (const env of ctx.lastEnvelopes) {\n    assert.strictEqual(env.delivered, false,",
        "  assert.strictEqual(ctx.lastEnvelopes.length, count, `Expected ${count} envelope(s), got ${ctx.lastEnvelopes.length}`);\n  for (const env of ctx.lastEnvelopes) {\n    assert.strictEqual(env.delivered, false,",
    ),
    (
        "      assert.strictEqual(entry.received[0].topic, topic);\n      return;\n    }\n  }\n  assert.fail('No agent received any message to inspect');\n});\n\nThen('the history should have {int} entries'",
        "      assert.strictEqual(entry.received[0].topic, topic, `Expected first received topic to be '${topic}'`);\n      return;\n    }\n  }\n  assert.fail('No agent received any message to inspect');\n});\n\nThen('the history should have {int} entries'",
    ),
    (
        "  assert.strictEqual(history.length, count);\n});\n\nThen('the most recent history entry should have payload {string}'",
        "  assert.strictEqual(history.length, count, `Expected history to have ${count} entries, got ${history.length}`);\n});\n\nThen('the most recent history entry should have payload {string}'",
    ),
    (
        "  assert.deepStrictEqual(history[history.length - 1].message.payload, expected);\n});",
        "  assert.deepStrictEqual(history[history.length - 1].message.payload, expected, 'Expected most recent history entry payload to match');\n});",
    ),
]
for i, (old, new) in enumerate(AMB_EDITS, start=1):
    TOTAL += 1
    if apply_one(
        "features/step_definitions/agent-message-bus.steps.ts",
        old, new, f"agent-message-bus #{i}",
    ):
        SUCCESS += 1

# 5. a2a-outbound-client.steps.ts (4 bare-assert)
A2A_EDITS = [
    (
        "  assert.strictEqual(ctx.lastResult.id, id);\n});",
        "  assert.strictEqual(ctx.lastResult.id, id, `Expected result.id to be '${id}'`);\n});",
    ),
    (
        "  assert.strictEqual(ctx.lastResult.status?.state, state);\n});",
        "  assert.strictEqual(ctx.lastResult.status?.state, state, `Expected result.status.state to be '${state}'`);\n});",
    ),
    (
        "  assert.strictEqual(ctx.lastResult.history?.length ?? 0, n);\n});",
        "  assert.strictEqual(ctx.lastResult.history?.length ?? 0, n, `Expected history to have ${n} entries, got ${ctx.lastResult.history?.length ?? 0}`);\n});",
    ),
    (
        "  assert.strictEqual(ctx.lastResult.artifacts?.length ?? 0, n);\n});",
        "  assert.strictEqual(ctx.lastResult.artifacts?.length ?? 0, n, `Expected artifacts to have ${n} entries, got ${ctx.lastResult.artifacts?.length ?? 0}`);\n});",
    ),
]
for i, (old, new) in enumerate(A2A_EDITS, start=1):
    TOTAL += 1
    if apply_one(
        "features/step_definitions/a2a-outbound-client.steps.ts",
        old, new, f"a2a-outbound #{i}",
    ):
        SUCCESS += 1

# 6. agentic-kanban.steps.ts (1 bare-assert)
TOTAL += 1
if apply_one(
    "features/step_definitions/agentic-kanban.steps.ts",
    "  assert.strictEqual(ctx.lastPostMessage.type, 'kanban:statusChanged');\n});",
    "  assert.strictEqual(ctx.lastPostMessage.type, 'kanban:statusChanged', 'Expected postMessage type to be kanban:statusChanged');\n});",
    "agentic-kanban L528",
):
    SUCCESS += 1

# 7. kanban-data-integrity.steps.ts (1 bare-assert)
TOTAL += 1
if apply_one(
    "features/step_definitions/kanban-data-integrity.steps.ts",
    "    assert.strictEqual(found.artifact.status, status);",
    "    assert.strictEqual(found.artifact.status, status, `Expected story ${storyId} status to be '${status}', got '${found.artifact.status}'`);",
    "kanban-data-integrity L123",
):
    SUCCESS += 1

# 8. kanban-orchestrator.steps.ts (2 bare-assert)
TOTAL += 1
if apply_one(
    "features/step_definitions/kanban-orchestrator.steps.ts",
    "  assert.strictEqual(ctx.result.status, 'complete');\n});",
    "  assert.strictEqual(ctx.result.status, 'complete', `Expected status 'complete', got '${ctx.result.status}'`);\n});",
    "kanban-orchestrator L155",
):
    SUCCESS += 1
TOTAL += 1
if apply_one(
    "features/step_definitions/kanban-orchestrator.steps.ts",
    "  assert.strictEqual(ctx.result.status, 'blocked');\n});",
    "  assert.strictEqual(ctx.result.status, 'blocked', `Expected status 'blocked', got '${ctx.result.status}'`);\n});",
    "kanban-orchestrator L161",
):
    SUCCESS += 1

# 9. trace-recorder.steps.ts (2 no-empty catch)
TR_EDITS = [
    (
        "  } catch {}\n});\n\nGiven('trace entries exist across sessions'",
        "  } catch { /* noop: missing dir is acceptable during test setup */ }\n});\n\nGiven('trace entries exist across sessions'",
    ),
    (
        "  } catch {}\n});\n\nGiven('recent trace sessions exist'",
        "  } catch { /* noop: dir may already be missing during teardown */ }\n});\n\nGiven('recent trace sessions exist'",
    ),
]
for i, (old, new) in enumerate(TR_EDITS, start=1):
    TOTAL += 1
    if apply_one(
        "features/step_definitions/trace-recorder.steps.ts",
        old, new, f"trace-recorder #{i}",
    ):
        SUCCESS += 1

sys.stdout.write(f"\nTOTAL: {SUCCESS}/{TOTAL} applied\n")
if SUCCESS < TOTAL:
    sys.stdout.write("FAIL: some edits did not match\n")
    sys.exit(1)
sys.stdout.write("ALL CLEAN\n")
