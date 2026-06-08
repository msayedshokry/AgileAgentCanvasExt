const fs = require('fs');
const path = 'src/chat/agileagentcanvas-tools.ts';
const EOL = '\r\n';

let content = fs.readFileSync(path, 'utf8');

// Helper: add a chunk after a target string
function insertAfter(target, chunk) {
  const idx = content.indexOf(target);
  if (idx === -1) throw new Error(`Target not found: ${target.substring(0, 40)}`);
  content = content.substring(0, idx + target.length) + chunk + content.substring(idx + target.length);
}

// Helper: replace all occurrences of a string
function replaceAll(find, replace) {
  while (content.includes(find)) {
    content = content.replace(find, replace);
  }
}

// === PHASE 1: Non-tool changes ===

// 1. Add import
insertAfter(
  "import { trackToolCall, toolTelemetry } from './tool-telemetry';" + EOL,
  "import { getTraceRecorder } from '../trace/trace-recorder';" + EOL
);
console.log('1. Added getTraceRecorder import');

// 2. Add interface fields
replaceAll(
  "    /** The artifact store instance for agileagentcanvas_update_artifact */" + EOL +
  "    store: ArtifactStore;" + EOL +
  "}",
  "    /** The artifact store instance for agileagentcanvas_update_artifact */" + EOL +
  "    store: ArtifactStore;" + EOL +
  "    /** Set by the chat participant before tool invocations to enable trace recording. */" + EOL +
  "    currentSessionId?: string;" + EOL +
  "    /** Set by the chat participant before tool invocations to identify the agent. */" + EOL +
  "    currentAgentName?: string;" + EOL +
  "}"
);
console.log('2. Added currentSessionId/currentAgentName to interface');

// 3. Add helper function
const helperFn = 
  "// \u2500\u2500\u2500 Project-standard error-to-string \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" + EOL +
  "function errMsg(err: unknown): string {" + EOL +
  "    return err instanceof Error ? err.message : String(err);" + EOL +
  "}" + EOL +
  "" + EOL +
  "// \u2500\u2500\u2500 Dynamic tracing wrapper \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500" + EOL +
  "/**" + EOL +
  " * Wraps a tool with trace recording using the session/agent context from" + EOL +
  " * `sharedToolContext` at invocation time.  This is needed because tools are" + EOL +
  " * registered globally via `vscode.lm.registerTool()`, but sessionId and" + EOL +
  " * agentName are dynamic (set per chat session)." + EOL +
  " *" + EOL +
  " * If `sharedToolContext.currentSessionId` or `currentAgentName` is not set," + EOL +
  " * the tool runs without tracing (no-op guard)." + EOL +
  " */" + EOL +
  "function wrapToolWithDynamicTracing(" + EOL +
  "    tool: vscode.LanguageModelTool<any>," + EOL +
  "    toolName: string" + EOL +
  "): vscode.LanguageModelTool<any> {" + EOL +
  "    return {" + EOL +
  "        ...tool," + EOL +
  "        invoke: async (inputs: any, token: vscode.CancellationToken) => {" + EOL +
  "            const { currentSessionId, currentAgentName } = sharedToolContext;" + EOL +
  "            if (!currentSessionId || !currentAgentName) {" + EOL +
  "                return tool.invoke(inputs, token);" + EOL +
  "            }" + EOL +
  "            const startTime = Date.now();" + EOL +
  "            try {" + EOL +
  "                const result = await tool.invoke(inputs, token);" + EOL +
  "                try {" + EOL +
  "                    getTraceRecorder().record({" + EOL +
  "                        sessionId: currentSessionId," + EOL +
  "                        type: 'tool_call'," + EOL +
  "                        agent: currentAgentName," + EOL +
  "                        data: { toolName, toolInput: inputs, toolResult: result }," + EOL +
  "                        durationMs: Date.now() - startTime," + EOL +
  "                    });" + EOL +
  "                } catch { /* trace recording failures are non-fatal */ }" + EOL +
  "                return result;" + EOL +
  "            } catch (err) {" + EOL +
  "                try {" + EOL +
  "                    getTraceRecorder().record({" + EOL +
  "                        sessionId: currentSessionId," + EOL +
  "                        type: 'error'," + EOL +
  "                        agent: currentAgentName," + EOL +
  "                        data: { toolName, toolInput: inputs, error: errMsg(err) }," + EOL +
  "                        durationMs: Date.now() - startTime," + EOL +
  "                    });" + EOL +
  "                } catch { /* trace recording failures are non-fatal */ }" + EOL +
  "                throw err;" + EOL +
  "            }" + EOL +
  "        }" + EOL +
  "    };" + EOL +
  "}" + EOL +
  "" + EOL;

replaceAll(
  "// \u2500\u2500\u2500 Tool registration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500",
  helperFn + "// \u2500\u2500\u2500 Tool registration \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
);
console.log('3. Added helper functions');

// === PHASE 2: Wrap tools ===

// Tool names in order of appearance
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

// For each tool, find its registration section and wrap it
// Strategy: split content by tool comment sections and process each one
// Tool comment format: "    // ── agileagentcanvas_<name> ──"

let wrapCount = 0;

// Process tools in order - work backwards to maintain positions
for (let i = toolNames.length - 1; i >= 0; i--) {
  const t = toolNames[i];
  const toolRef = `'${t}'`;
  
  // Find the tool's opening registerTool call
  // The tool name appears in: registerTool<...>('tool_name', ...)
  // Find the registerTool call that contains this tool name
  
  const nameIdx = content.indexOf(toolRef);
  if (nameIdx === -1) {
    console.log(`  ERROR: ${t} - name not found`);
    continue;
  }
  
  // Check if already wrapped
  const searchBefore = content.substring(Math.max(0, nameIdx - 30), nameIdx + 5);
  if (searchBefore.includes('wrapToolWithDynamicTracing')) {
    console.log(`  Already wrapped: ${t}`);
    wrapCount++;
    continue;
  }
  
  // Find the opening { after the tool name
  // Pattern: 'tool_name', {  (single-line) or 'tool_name',\n            {  (multi-line)
  const afterName = content.substring(nameIdx + toolRef.length);
  
  // Find the { - skip whitespace, comma, and newlines
  let braceOffset = 0;
  for (let j = 0; j < afterName.length; j++) {
    const ch = afterName[j];
    if (ch === '{') {
      braceOffset = j;
      break;
    }
    if (ch !== ',' && ch !== ' ' && ch !== '\r' && ch !== '\n') {
      // Unexpected character, might be type annotation end
      continue;
    }
  }
  
  if (braceOffset === 0) {
    console.log(`  ERROR: ${t} - cannot find opening brace`);
    continue;
  }
  
  const openPos = nameIdx + toolRef.length + braceOffset;
  
  // Insert wrapToolWithDynamicTracing( before the {
  content = content.substring(0, openPos) + 'wrapToolWithDynamicTracing(' + content.substring(openPos);
  
  // Now find the closing for this tool
  // After inserting wrapToolWithDynamicTracing(, the content shifted
  const adjustedSearch = openPos + 'wrapToolWithDynamicTracing('.length;
  
  // Determine the tool type: single-line or multi-line
  // Single-line: { is on the same line as the tool name, after a comma
  // Multi-line: { is on a new line after the tool name
  const isSingleLine = afterName.substring(0, braceOffset).indexOf('\n') === -1;
  
  let closePos = -1;
  let oldClosing = '';
  let newClosing = '';
  
  if (isSingleLine) {
    // Single-line pattern:        })\n    );
    // After wrapping:             }, 'tool_name'))\n    );
    oldClosing = '        })' + EOL + '    );';
    newClosing = `        }, '${t}'))` + EOL + '    );';
  } else {
    // Multi-line pattern:            }\n        )\n    );
    // After wrapping:               }, 'tool_name')\n        )\n    );
    // The } at 12 spaces closes the tool object (arg 1 of wrapToolWithDynamicTracing)
    // Then ), 'tool_name') closes wrapToolWithDynamicTracing
    // Then ) at 8 spaces closes registerTool
    
    // Find the closing:            }\n        )\n    );
    // This is: 12 spaces + } + \n + 8 spaces + ) + \n + 4 spaces + );
    const multiPattern = '            }' + EOL + '        )' + EOL + '    );';
    closePos = content.indexOf(multiPattern, adjustedSearch);
    
    if (closePos !== -1) {
      oldClosing = multiPattern;
      newClosing = `            }, '${t}')` + EOL + '        )' + EOL + '    );';
    } else {
      // Try alternative: just the 8-space closing
      const simplePattern = '        )' + EOL + '    );';
      closePos = content.indexOf(simplePattern, adjustedSearch);
      if (closePos !== -1) {
        oldClosing = simplePattern;
        newClosing = `        }, '${t}'))` + EOL + '    );';
      }
    }
  }
  
  if (closePos === -1 && !isSingleLine) {
    // Try the multi-line pattern again - sometimes the } at 12 spaces isn't there
    // because the tool object is closed differently
    const altPattern = '        )' + EOL + '    );';
    closePos = content.indexOf(altPattern, adjustedSearch);
    if (closePos !== -1) {
      oldClosing = altPattern;
      newClosing = `        ), '${t}')` + EOL + '    );';
    }
  }
  
  if (closePos === -1) {
    console.log(`  ERROR: ${t} - cannot find closing pattern`);
    continue;
  }
  
  content = content.substring(0, closePos) + newClosing + content.substring(closePos + oldClosing.length);
  
  wrapCount++;
  console.log(`  Wrapped: ${t} (${isSingleLine ? 'single-line' : 'multi-line'})`);
}

console.log(`\nTotal: ${wrapCount}/${toolNames.length} tools wrapped`);

// Verify wrapping count
const wrapperCalls = (content.match(/wrapToolWithDynamicTracing\({/g) || []).length;
console.log(`Verification: ${wrapperCalls} wrapToolWithDynamicTracing({ calls (tool wrapping)`);
console.log(`              ${(content.match(/wrapToolWithDynamicTracing/g) || []).length} total occurrences`);

fs.writeFileSync(path, content, 'utf8');
console.log('Saved successfully');
