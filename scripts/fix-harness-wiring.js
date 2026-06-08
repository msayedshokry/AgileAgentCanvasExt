/**
 * Fixes remaining harnessFeedback wiring:
 * 1. Add harnessFeedback import + recordEvaluation to artifact-store.ts
 * 2. Inject governance feedback section into workflow-executor.ts buildWorkflowPrompt()
 */
const fs = require('fs');

// ============================================================
// 1. Fix artifact-store.ts
// ============================================================
let as = fs.readFileSync('src/state/artifact-store.ts', 'utf-8');

// Add import after existing harnessEngine import
const importTarget = "import { harnessEngine } from '../harness/policy-engine';";
const importReplace = importTarget + "\nimport { harnessFeedback } from '../harness/harness-feedback';";

if (as.includes('harnessFeedback')) {
  console.log('artifact-store.ts already has harnessFeedback import, skipping.');
} else {
  as = as.replace(importTarget, importReplace);
}

// Add recordEvaluation call after post-flight results
const recordTarget = "const advisory = postResults.filter(r => !r.passed);\n                        if (advisory.length > 0) this._onHarnessFailures.fire(advisory);";
const recordReplace = recordTarget + "\n                        // Feed post-flight results into the governance feedback loop\n                        harnessFeedback.recordEvaluation(doc.id, doc.type || 'unknown', postResults);";

if (as.includes('harnessFeedback.recordEvaluation')) {
  console.log('artifact-store.ts already has harnessFeedback.recordEvaluation, skipping.');
} else {
  as = as.replace(recordTarget, recordReplace);
}

fs.writeFileSync('src/state/artifact-store.ts', as);
console.log('artifact-store.ts updated successfully.');

// ============================================================
// 2. Inject governance feedback into workflow-executor.ts prompt
// ============================================================
let wf = fs.readFileSync('src/workflow/workflow-executor.ts', 'utf-8');

// The template literal in the prompt already uses ${...} syntax for vars.get(...).
// We need to inject a similar template expression that calls harnessFeedback.
// The prompt is already a template literal, so we can inject:
//
// ## Harness Governance Feedback
// ${(function() {
//   const aType = artifactContext?.type || artifactContext?.artifactType || '';
//   const aId = artifactContext?.id || artifactContext?.artifactId || '';
//   if (!aType || !aId) return 'No active governance issues.';
//   const fb = harnessFeedback.getFeedbackForArtifact(aId, aType);
//   if (!fb || fb.activeFailureCount === 0) return 'No active governance issues.';
//   return fb.summary;
// })()}

if (wf.includes('Harness Governance Feedback')) {
  console.log('workflow-executor.ts already has feedback section, skipping.');
} else {
  // Insert the feedback section before "## CRITICAL - BMAD Grounding Rule"
  const injectPoint = "## CRITICAL \u2014 BMAD Grounding Rule";
  const feedbackSection = `
## Harness Governance Feedback
\${(function() {
  const aType = artifactContext?.type || artifactContext?.artifactType || '';
  const aId = artifactContext?.id || artifactContext?.artifactId || '';
  if (!aType || !aId) return 'No active governance issues.';
  const fb = harnessFeedback.getFeedbackForArtifact(aId, aType);
  if (!fb || fb.activeFailureCount === 0) return 'No active governance issues.';
  return fb.summary;
})()}

`;

  wf = wf.replace(injectPoint, feedbackSection + injectPoint);
  fs.writeFileSync('src/workflow/workflow-executor.ts', wf);
  console.log('workflow-executor.ts feedback section injected.');
}

console.log('\nAll done!');
