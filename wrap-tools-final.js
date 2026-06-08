const fs = require('fs');
const EOL = '\r\n';

const path = 'src/chat/agileagentcanvas-tools.ts';
let content = fs.readFileSync(path, 'utf8');

// Helper: find all positions of a substring
function findAll(str, pattern) {
  const positions = [];
  let idx = 0;
  while ((idx = str.indexOf(pattern, idx)) !== -1) {
    positions.push(idx);
    idx++;
  }
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: Non-tool changes
// ─────────────────────────────────────────────────────────────────────────────

// 1. Add import
if (!content.includes('getTraceRecorder')) {
  content = content.replace(
    "import { trackToolCall, toolTelemetry } from './tool-telemetry';",
    "import { trackToolCall, toolTelemetry } from './tool-telemetry';\r\nimport { getTraceRecorder } from '../trace/trace-recorder';"
  );
  console.log('1. Added getTraceRecorder import');
}

// 2. Add interface fields
if (!content.includes('currentSessionId')) {
  content = content.replace(
    "    /** The artifact store instance for agileagentcanvas_update_artifact */\r\n    store: ArtifactStore;\r\n}",
    "    /** The artifact store instance for agileagentcanvas_update_artifact */\r\n    store: ArtifactStore;\r\n    /** Set by the chat participant before tool invocations to enable trace recording. */\r\n    currentSessionId?: string;\r\n    /** Set by the chat participant before tool invocations to identify the agent. */\r\n    currentAgentName?: string;\r\n}"
  );
  console.log('2. Added currentSessionId/currentAgentName');
}

// 3. Add helper function
if (!content.includes('wrapToolWithDynamicTracing')) {
  const helperFn = [
    "// ─── Project-standard error-to-string ────────────────────────────────────────",
    "function errMsg(err: unknown): string {",
    "    return err instanceof Error ? err.message : String(err);",
    "}",
    "",
    "// ─── Dynamic tracing wrapper ──────────────────────────────────────────────────",
    "/**",
    " * Wraps a tool with trace recording using the session/agent context from",
    " * `sharedToolContext` at invocation time.  This is needed because tools are",
    " * registered globally via `vscode.lm.registerTool()`, but sessionId and",
    " * agentName are dynamic (set per chat session).",
    " *",
    " * If `sharedToolContext.currentSessionId` or `currentAgentName` is not set,",
    " * the tool runs without tracing (no-op guard).",
    " */",
    "function wrapToolWithDynamicTracing(",
    "    tool: vscode.LanguageModelTool<any>,",
    "    toolName: string",
    "): vscode.LanguageModelTool<any> {",
    "    return {",
    "        ...tool,",
    "        invoke: async (inputs: any, token: vscode.CancellationToken) => {",
    "            const { currentSessionId, currentAgentName } = sharedToolContext;",
    "            if (!currentSessionId || !currentAgentName) {",
    "                return tool.invoke(inputs, token);",
    "            }",
    "            const startTime = Date.now();",
    "            try {",
    "                const result = await tool.invoke(inputs, token);",
    "                try {",
    "                    getTraceRecorder().record({",
    "                        sessionId: currentSessionId,",
    "                        type: 'tool_call',",
    "                        agent: currentAgentName,",
    "                        data: { toolName, toolInput: inputs, toolResult: result },",
    "                        durationMs: Date.now() - startTime,",
    "                    });",
    "                } catch { /* trace recording failures are non-fatal */ }",
    "                return result;",
    "            } catch (err) {",
    "                try {",
    "                    getTraceRecorder().record({",
    "                        sessionId: currentSessionId,",
    "                        type: 'error',",
    "                        agent: currentAgentName,",
    "                        data: { toolName, toolInput: inputs, error: errMsg(err) },",
    "                        durationMs: Date.now() - startTime,",
    "                    });",
    "                } catch { /* trace recording failures are non-fatal */ }",
    "                throw err;",
    "            }",
    "        }",
    "    };",
    "}",
    "",
  ].join('\r\n');

  content = content.replace(
    "// ─── Tool registration ───────────────────────────────────────────────────────",
    helperFn + "// ─── Tool registration ───────────────────────────────────────────────────────"
  );
  console.log('3. Added helper functions');
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: Wrap tools
// ─────────────────────────────────────────────────────────────────────────────

const toolNames = [
  'agileagentcanvas_read_file',
  'agileagentcanvas_list_directory',
  'agileagentcanvas_update_artifact',
  'agileagentcanvas_write_file',
  'agileagentcanvas_sync_story_status',
  'agileagentcanvas_sync_epic_status',
  'agileagentcanvas_read_jira',
  'agileagentcanvas_graph_query',
  'agileagentcanvas_graph_path',
  'agileagentcanvas_graph_community',
  'agileagentcanvas_codeburn_report',
  'agileagentcanvas_repair_json',
  'agileagentcanvas_frontmatter_extract',
  'agileagentcanvas_yaml_to_json',
  'agileagentcanvas_json_diff',
  'agileagentcanvas_json_merge',
  'agileagentcanvas_artifact_query',
  'agileagentcanvas_workflow_resolve_vars',
  'agileagentcanvas_types_from_schema',
  'agileagentcanvas_schema_from_json',
  'agileagentcanvas_codebase_search',
];

// Strategy: find each tool name that appears after registerTool<
// Find all registerTool positions
const registerPositions = findAll(content, 'registerTool<');

let wrapCount = 0;

// Process tools in reverse order to maintain positions
for (let i = toolNames.length - 1; i >= 0; i--) {
  const t = toolNames[i];
  const toolRef = `'${t}'`;

  // Check if already wrapped
  const alreadyWrapped = 
    content.indexOf(`wrapToolWithDynamicTracing({\r\n                async invoke(request, _token) {\r\n                    return trackToolCall('${t}'`, 0) !== -1 ||
    content.indexOf(`wrapToolWithDynamicTracing({\r\n                async invoke(request, token) {\r\n                    return trackToolCall('${t}'`, 0) !== -1 ||
    content.indexOf(`wrapToolWithDynamicTracing({\r\n            async invoke(request, _token) {\r\n                return trackToolCall('${t}'`, 0) !== -1;
  
  if (alreadyWrapped) {
    console.log(`  Already wrapped: ${t}`);
    wrapCount++;
    continue;
  }

  // Find the registerTool call that contains this tool name
  let matchedPos = -1;
  
  // Go through each registerTool position (backwards for efficiency)
  for (let r = registerPositions.length - 1; r >= 0; r--) {
    const regPos = registerPositions[r];
    // Look for the tool name within the next ~200 chars
    const window = content.substring(regPos, regPos + 200);
    if (window.includes(toolRef)) {
      matchedPos = regPos;
      break;
    }
  }

  if (matchedPos === -1) {
    console.log(`  ERROR: ${t} - no registerTool call found`);
    continue;
  }

  // The tool name is within 200 chars of registerTool.
  // Find the exact position of the tool name after this registerTool position
  const localWindow = content.substring(matchedPos, matchedPos + 200);
  const localNameIdx = localWindow.indexOf(toolRef);
  const nameIdx = matchedPos + localNameIdx;

  // After the tool name, find the opening {
  const afterName = content.substring(nameIdx + toolRef.length);
  let braceOffset = -1;
  for (let j = 0; j < afterName.length; j++) {
    if (afterName[j] === '{') { braceOffset = j; break; }
    if (afterName[j] !== ',' && afterName[j] !== ' ' && afterName[j] !== '\r' && afterName[j] !== '\n') break;
  }

  if (braceOffset === -1) {
    console.log(`  ERROR: ${t} - cannot find opening brace`);
    continue;
  }

  const openPos = nameIdx + toolRef.length + braceOffset;
  const preBrace = afterName.substring(0, braceOffset);
  const isSingleLine = preBrace.indexOf('\n') === -1;

  // Insert wrapToolWithDynamicTracing(
  content = content.substring(0, openPos) + 'wrapToolWithDynamicTracing(' + content.substring(openPos);

  // Find closing pattern
  const searchFrom = openPos + 'wrapToolWithDynamicTracing('.length;
  let closeFound = false;

  if (isSingleLine) {
    const oldCl = '        })\r\n    );';
    const newCl = `        }, '${t}'))\r\n    );`;
    const cp = content.indexOf(oldCl, searchFrom);
    if (cp !== -1) {
      content = content.substring(0, cp) + newCl + content.substring(cp + oldCl.length);
      closeFound = true;
    }
  } else {
    // Multi-line: try the 12-space } pattern first
    const oldCl1 = '            }\r\n        )\r\n    );';
    const newCl1 = `            }, '${t}')\r\n        )\r\n    );`;
    const cp1 = content.indexOf(oldCl1, searchFrom);
    if (cp1 !== -1) {
      content = content.substring(0, cp1) + newCl1 + content.substring(cp1 + oldCl1.length);
      closeFound = true;
    } else {
      // Fallback: try the 8-space pattern
      const oldCl2 = '        }\r\n    );\r\n';
      const newCl2 = `        }, '${t}'))\r\n    );\r\n`;
      const cp2 = content.indexOf(oldCl2, searchFrom);
      if (cp2 !== -1) {
        content = content.substring(0, cp2) + newCl2 + content.substring(cp2 + oldCl2.length);
        closeFound = true;
      }
    }
  }

  if (!closeFound) {
    console.log(`  ERROR: ${t} - cannot find closing pattern`);
    continue;
  }

  wrapCount++;
  console.log(`  Wrapped: ${t} (${isSingleLine ? 'single' : 'multi'})`);
}

console.log(`\nTotal: ${wrapCount}/${toolNames.length} tools wrapped`);

const wrapperCalls = (content.match(/wrapToolWithDynamicTracing\({/g) || []).length;
console.log(`Verification: ${wrapperCalls} wrapToolWithDynamicTracing({ calls`);

fs.writeFileSync(path, content, 'utf8');
console.log('Saved');
