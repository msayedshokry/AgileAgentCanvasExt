/**
 * Fixes:
 * 1. Type errors in policy-engine.ts (wrong property names on TraceEntry, wrong method name)
 * 2. Double-recording: remove external recordEvaluation() calls from lane-transitions.ts and artifact-store.ts
 * 3. Circular dependency: use import type in harness-feedback.ts
 */
const fs = require('fs');

// ============================================================
// 1. Fix policy-engine.ts type errors
// ============================================================
let pe = fs.readFileSync('src/harness/policy-engine.ts', 'utf-8');

// Fix 1a: TraceEntry data doesn't have .message — use .error only
// Old: e.data?.message || e.data?.error || ''
// New: e.data?.error || ''
pe = pe.replace(
  "const errorMessages = lastFew.map(e => e.data?.message || e.data?.error || '').filter(Boolean);",
  "const errorMessages = lastFew.map(e => e.data?.error || '').filter(Boolean);"
);

// Fix 1b: TraceRecorder doesn't have .search() — use .searchTraces()
// Old: traceEntries = getTraceRecorder().search({ sessionId });
// New: traceEntries = await getTraceRecorder().searchTraces({ sessionId: sessionId, limit: 100 });
pe = pe.replace(
  "traceEntries = getTraceRecorder().search({ sessionId });",
  "traceEntries = await getTraceRecorder().searchTraces({ sessionId, limit: 100 });"
);

// Fix 1c: evaluateContinuous is not async in the searchTraces context
// Actually the evaluateContinuous method already uses await, but searchTraces returns a Promise too
// Let me check if evaluateContinuous is already async... yes it's: async evaluateContinuous(...)

fs.writeFileSync('src/harness/policy-engine.ts', pe);
console.log('1. Fixed policy-engine.ts type errors.');

// ============================================================
// 2. Fix double-recording — remove external recordEvaluation calls
// ============================================================

// 2a: lane-transitions.ts — remove the outer harnessFeedback.recordEvaluation()
let lt = fs.readFileSync('src/workflow/lane-transitions.ts', 'utf-8');
const doubleRecordLt = `      // ── Continuous governance evaluation ───────────────────────────────\n      // After workflow execution, run continuous policies to detect patterns\n      // (repeated errors, stuck loops) that need correction.\n      if (rule?.workflowId) {\n        try {\n          const sessionId = found?.artifact?.sessionId || \`harness-\${Date.now()}-\${Math.random().toString(36).substr(2, 6)}\`;\n          harnessFeedback.recordEvaluation(\n            artifactId,\n            artifactType,\n            await harnessEngine.evaluate(\n              { artifactType, artifactId, artifact: found.artifact, sessionId },\n              'continuous'\n            )\n          );`;
const fixedLt = `      // ── Continuous governance evaluation ───────────────────────────────\n      // After workflow execution, run continuous policies to detect patterns\n      // (repeated errors, stuck loops) that need correction.\n      if (rule?.workflowId) {\n        try {\n          const sessionId = found?.artifact?.sessionId || \`harness-\${Date.now()}-\${Math.random().toString(36).substr(2, 6)}\`;\n          // evaluate() already calls harnessFeedback.recordEvaluation() internally\n          await harnessEngine.evaluate(\n            { artifactType, artifactId, artifact: found.artifact, sessionId },\n            'continuous'\n          );`;

if (lt.includes(doubleRecordLt)) {
  lt = lt.replace(doubleRecordLt, fixedLt);
  fs.writeFileSync('src/workflow/lane-transitions.ts', lt);
  console.log('2a. Fixed double-recording in lane-transitions.ts.');
} else {
  console.log('2a. lane-transitions.ts pattern not matched, checking...');
  // Try alternative matching
  if (lt.includes('harnessFeedback.recordEvaluation')) {
    console.log('   Found harnessFeedback.recordEvaluation in lane-transitions.ts');
  } else {
    console.log('   No harnessFeedback.recordEvaluation found — may already be fixed.');
  }
}

// 2b: artifact-store.ts — remove the outer harnessFeedback.recordEvaluation()
let as = fs.readFileSync('src/state/artifact-store.ts', 'utf-8');
const doubleRecordAs = "                        // Feed post-flight results into the governance feedback loop\n                        harnessFeedback.recordEvaluation(doc.id, doc.type || 'unknown', postResults);";

if (as.includes(doubleRecordAs)) {
  as = as.replace(doubleRecordAs, "                        // evaluate() already calls harnessFeedback.recordEvaluation() internally");
  fs.writeFileSync('src/state/artifact-store.ts', as);
  console.log('2b. Fixed double-recording in artifact-store.ts.');
} else {
  console.log('2b. artifact-store.ts pattern not matched.');
  if (as.includes('harnessFeedback.recordEvaluation')) {
    console.log('   Found harnessFeedback.recordEvaluation in artifact-store.ts');
  } else {
    console.log('   No harnessFeedback.recordEvaluation found — may already be fixed.');
  }
}

// ============================================================
// 3. Fix circular dependency — use import type in harness-feedback.ts
// ============================================================
let hf = fs.readFileSync('src/harness/harness-feedback.ts', 'utf-8');
hf = hf.replace(
  "import { EvaluationResult } from './policy-engine';",
  "import type { EvaluationResult } from './policy-engine';"
);
fs.writeFileSync('src/harness/harness-feedback.ts', hf);
console.log('3. Fixed circular dependency — import type in harness-feedback.ts.');

console.log('\nAll fixes complete.');
