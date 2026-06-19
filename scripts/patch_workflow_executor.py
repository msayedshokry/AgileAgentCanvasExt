import io, sys
p = r'D:/PersonalDev/AgileAgentCanvas/AgileAgentCanvasExt/src/workflow/workflow-executor.ts'
with io.open(p, 'r', encoding='utf-8') as f:
    content = f.read()

# Site A: Started decision (16-space indent). Unique by `decision: `Started ${workflowId}``
OLD_A = (
    "                sessionId: traceSessionId,\n"
    "                type: 'decision',\n"
    "                agent: 'lane-transition',\n"
    "                data: {\n"
    "                    decision: `Started ${workflowId} for ${artifact?.id || 'unknown'}`,\n"
)
NEW_A = (
    "                sessionId: traceSessionId,\n"
    "                workflowName: workflowId, // audit gap #20/#42 \u2014 top-level workflow tag\n"
    "                type: 'decision',\n"
    "                agent: 'lane-transition',\n"
    "                data: {\n"
    "                    decision: `Started ${workflowId} for ${artifact?.id || 'unknown'}`,\n"
)
assert content.count(OLD_A) == 1, f'Site A not unique, found {content.count(OLD_A)}'
content = content.replace(OLD_A, NEW_A, 1)

# Site B: Completed decision (24-space indent, nested under executeWithTools try/catch)
OLD_B = (
    "                        sessionId: traceSessionId,\n"
    "                        type: 'decision',\n"
    "                        agent: 'lane-transition',\n"
    "                        data: {\n"
    "                            decision: `Completed ${workflowId} for ${artifact?.id || 'unknown'}`,\n"
)
NEW_B = (
    "                        sessionId: traceSessionId,\n"
    "                        workflowName: workflowId, // audit gap #20/#42 \u2014 top-level workflow tag\n"
    "                        type: 'decision',\n"
    "                        agent: 'lane-transition',\n"
    "                        data: {\n"
    "                            decision: `Completed ${workflowId} for ${artifact?.id || 'unknown'}`,\n"
)
assert content.count(OLD_B) == 1, f'Site B not unique, found {content.count(OLD_B)}'
content = content.replace(OLD_B, NEW_B, 1)

# Site C: Error entry (24-space indent). Unique by `error: `Workflow "${workflowId}" failed:``
OLD_C = (
    "                        sessionId: traceSessionId,\n"
    "                        type: 'error',\n"
    "                        agent: 'lane-transition',\n"
    "                        data: {\n"
    "                            error: `Workflow \"${workflowId}\" failed: ${err instanceof Error ? err.message : String(err)}`,\n"
)
NEW_C = (
    "                        sessionId: traceSessionId,\n"
    "                        workflowName: workflowId, // audit gap #20/#42 \u2014 top-level workflow tag\n"
    "                        type: 'error',\n"
    "                        agent: 'lane-transition',\n"
    "                        data: {\n"
    "                            error: `Workflow \"${workflowId}\" failed: ${err instanceof Error ? err.message : String(err)}`,\n"
)
assert content.count(OLD_C) == 1, f'Site C not unique, found {content.count(OLD_C)}'
content = content.replace(OLD_C, NEW_C, 1)

with io.open(p, 'w', encoding='utf-8') as f:
    f.write(content)
print('PATCHED_OK')
