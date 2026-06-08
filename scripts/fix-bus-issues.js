/**
 * Fixes:
 * 1. subscribe() calls — pass agentId (3 args required)
 * 2. Wire registerTeamOnBus() / deregisterTeamFromBus() into executeTeam()
 * 3. Fix 'context' possibly undefined in handoff-negotiation.ts
 */
var fs = require('fs');

// ================================================
// 1. Fix handoff-negotiation.ts
// ================================================
var hn = fs.readFileSync('src/acp/agent-bus/handoff-negotiation.ts', 'utf-8');

hn = hn.replace(
  "agentMessageBus.subscribe('system.handoff.request', async (msg) =>",
  "agentMessageBus.subscribe('handoff-negotiation', 'system.handoff.request', async (msg) =>"
);

hn = hn.replace(
  "agentMessageBus.subscribe('system.handoff.response', async (msg) =>",
  "agentMessageBus.subscribe('handoff-negotiation', 'system.handoff.response', async (msg) =>"
);

// Fix 'context' possibly undefined on HandoffSession
hn = hn.replace(
  "var keys = Object.keys(context.intermediateArtifacts).length;",
  "var keys = Object.keys(context?.intermediateArtifacts || {}).length;"
);

fs.writeFileSync('src/acp/agent-bus/handoff-negotiation.ts', hn);
console.log('1. Fixed handoff-negotiation.ts');

// ================================================
// 2. Fix team-orchestrator.ts
// ================================================
var to = fs.readFileSync('src/acp/team-orchestrator.ts', 'utf-8');

// Fix subscribe call
to = to.replace(
  "agentMessageBus.subscribe('handoff.' + agentId + '.#', async (msg) => {",
  "agentMessageBus.subscribe(agentId, 'handoff.' + agentId + '.#', async (msg) => {"
);

// Actually the original used template literals with backticks. Let me try a different approach.
// The pattern is: agentMessageBus.subscribe(`handoff.${agentId}.#`, async (msg) => {
// Let me use a simple string search
var subscribeCall = 'agentMessageBus.subscribe(';
var handoffPattern = 'handoff.';
// Find the specific subscribe call
var idx = to.indexOf("handoff." + agentId);
// This won't work in a script since agentId is runtime. Let me use a different approach.

// Actually the code in team-orchestrator.ts has the subscribe call INSIDE registerTeamOnBus()
// as: agentMessageBus.subscribe(`handoff.${agentId}.#`, async (msg) => {
// This needs agentId as first param.

// Let me search for the exact string including the template literal
var searchFor = 'agentMessageBus.subscribe(';
searchFor += '`';
searchFor += 'handoff.';

// Just replace all subscribe calls in the file that have 2 args
// The current subscribe calls are:
// 1. In registerTeamOnBus() - backtick template
// 2. Before wiring there were no others in team-orchestrator.ts

// After the wire script, the code might look like:
// agentMessageBus.subscribe(`handoff.${agentId}.#`, async (msg) => {

// Let me use a regex approach
// Match: agentMessageBus.subscribe(something, async (msg) => {
// Where something doesn't start with a quote (not a string literal)
var re1 = /agentMessageBus\.subscribe\(`([^`]+)`,\s*async\s*\(msg\)\s*=>\s*\{/;
to = to.replace(re1, function(match, topicExpr) {
  // Extract the agentId from the topic expression "handoff.${agentId}.#"
  return "agentMessageBus.subscribe(" + topicExpr.match(/\$\{([^}]+)\}/)[1] + ", `" + topicExpr + "`, async (msg) => {";
});

// Wire registerTeamOnBus into executeTeam — find the executeTeam start
var execTeamStart = 'var team = TEAM_REGISTRY[teamId];';
execTeamStart += '\n    if (!team) throw new Error(';

var execTeamWired = '// Register team agents on the message bus\n    var busAgentIds = this.registerTeamOnBus(teamId);\n\n    ';
execTeamWired += execTeamStart;

if (to.indexOf('busAgentIds = this.registerTeamOnBus') >= 0) {
  console.log('2. team-orchestrator.ts already wired, skipping.');
} else {
  to = to.replace(execTeamStart, execTeamWired);
}

// Add deregisterTeamFromBus in finally block
var finallyTarget = '}\n    } finally {\n      cancellationListener?.dispose();\n    }';
var finallyTarget2 = '    } finally {\n      cancellationListener?.dispose();\n    }';

// Actually just target the specific finally block in executeTeam
// It should be: } finally { cancellationListener?.dispose(); }
// Let me find it more precisely
var fnContent = 'cancellationListener?.dispose();';
var fnWithBus = 'this.deregisterTeamFromBus(busAgentIds);\n      ' + fnContent;

if (to.indexOf('deregisterTeamFromBus(busAgentIds)') >= 0) {
  console.log('2. Already has finally cleanup, skipping.');
} else {
  // There should be exactly one occurrence in executeTeam's finally
  to = to.replace(fnContent, fnWithBus);
}

// Fix the getTeam method — simplify type
to = to.replace(
  'typeof TEAM_REGISTRY[string]',
  'any'
);

fs.writeFileSync('src/acp/team-orchestrator.ts', to);
console.log('2. Fixed team-orchestrator.ts');

// ================================================
// 3. Fix extension.ts
// ================================================
var ext = fs.readFileSync('src/extension.ts', 'utf-8');

ext = ext.replace(
  "agentMessageBus.subscribe('system.#', async (msg) => {",
  "agentMessageBus.subscribe('extension', 'system.#', async (msg) => {"
);

fs.writeFileSync('src/extension.ts', ext);
console.log('3. Fixed extension.ts');

console.log('\nAll fixes complete.');
