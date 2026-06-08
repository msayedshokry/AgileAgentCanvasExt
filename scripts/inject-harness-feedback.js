/**
 * Injects harness feedback into buildWorkflowPrompt() in workflow-executor.ts
 * and adds continuous evaluation trigger to lane-transitions.ts.
 * Also wires harnessFeedback recording into artifact-store.ts _harmonizeAndNotify().
 */
const fs = require('fs');
const wfPath = 'src/workflow/workflow-executor.ts';
const ltPath = 'src/workflow/lane-transitions.ts';
const asPath = 'src/state/artifact-store.ts';

// =====================================================
// 1. Inject harness feedback into buildWorkflowPrompt
// =====================================================
let wf = fs.readFileSync(wfPath, 'utf-8');

const injectPoint = '## CRITICAL \u2014 BMAD Grounding Rule';
const feedbackSection = 
'\n## Harness Governance Feedback\n' +
'${(() => {\n' +
'  const aType = artifactContext?.type || artifactContext?.artifactType || \'\';\n' +
'  const aId = artifactContext?.id || artifactContext?.artifactId || \'\';\n' +
'  if (!aType || !aId) return \'No active governance issues.\';\n' +
'  const fb = harnessFeedback.getFeedbackForArtifact(aId, aType);\n' +
'  if (!fb || fb.activeFailureCount === 0) return \'No active governance issues.\';\n' +
'  return fb.summary;\n' +
'})()}\n\n';

if (wf.includes('Harness Governance Feedback')) {
  console.log('Feedback section already injected. Skipping.');
} else {
  wf = wf.replace(injectPoint, feedbackSection + injectPoint);
  fs.writeFileSync(wfPath, wf);
  console.log('1. Injected harness feedback into buildWorkflowPrompt');
}

// =====================================================
// 2. Add continuous evaluation import to lane-transitions
// =====================================================
let lt = fs.readFileSync(ltPath, 'utf-8');

const ltHarnessImport = "import { harnessEngine } from '../harness/policy-engine';";
const ltFeedbackImport = "import { harnessEngine } from '../harness/policy-engine';\nimport { harnessFeedback } from '../harness/harness-feedback';";

if (lt.includes('harnessFeedback')) {
  console.log('2. lane-transitions.ts already has harnessFeedback import. Skipping.');
} else {
  lt = lt.replace(ltHarnessImport, ltFeedbackImport);
  fs.writeFileSync(ltPath, lt);
  console.log('2. Added harnessFeedback import to lane-transitions.ts');
}

// =====================================================
// 3. Add continuous evaluation after workflow completion
//    in handleTransition()
// =====================================================
const evalTrigger = 
'\n      // \u2500\u2500 Continuous governance evaluation \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n' +
'      // After workflow execution (or terminal launch), run continuous policies\n' +
'      // to detect patterns (repeated errors, stuck loops) that need correction.\n' +
'      if (rule?.workflowId) {\n' +
'        try {\n' +
'          const sessionId = found?.artifact?.sessionId || harness feedback-harness + Math.random().toString(36).substr(2, 6);\n' +
'          harnessFeedback.evaluateContinuous(\n' +
'            artifactId,\n' +
'            artifactType,\n' +
'            sessionId\n' +
'          );\n' +
'        } catch (err) {\n' +
'          // Non-blocking \u2014 continuous evaluation is advisory\n' +
'          logger.debug(\n' +
'            harness [Harness] Continuous eval failed: ${err instanceof Error ? err.message : String(err)}\n' +
'          );\n' +
'        }\n' +
'      }\n';

const beforeReturn = "      return { ok: true, workflowLaunched: !!rule?.workflowId, status: 'complete' };";

// Check if it's already there
if (lt.includes('Continuous governance evaluation')) {
  console.log('3. Continuous evaluation trigger already added. Skipping.');
} else {
  lt = lt.replace(beforeReturn, evalTrigger + '\n      ' + beforeReturn);
  fs.writeFileSync(ltPath, lt);
  console.log('3. Added continuous evaluation trigger to lane-transitions.ts');
}

// =====================================================
// 4. Add harnessFeedback recording to artifact-store.ts _harmonizeAndNotify
// =====================================================
let as = fs.readFileSync(asPath, 'utf-8');

const harnessImport = "import { harnessEngine } from '../harness/policy-engine';";
const harnessImportWithFeedback = 
  "import { harnessEngine } from '../harness/policy-engine';\n" +
  "import { harnessFeedback } from '../harness/harness-feedback';";

if (as.includes('harnessFeedback')) {
  console.log('4. artifact-store.ts already has harnessFeedback import. Skipping.');
} else {
  as = as.replace(harnessImport, harnessImportWithFeedback);
  
  // Find the post-flight evaluation result recording block
  const postFlightTarget = 
    'const advisory = postResults.filter(r => !r.passed);\n' +
    '                        if (advisory.length > 0) this._onHarnessFailures.fire(advisory);';
  const feedbackRecord =
    'const advisory = postResults.filter(r => !r.passed);\n' +
    '                        if (advisory.length > 0) this._onHarnessFailures.fire(advisory);\n' +
    '                        // Feed post-flight results into the governance feedback loop\n' +
    '                        harnessFeedback.recordEvaluation(doc.id, doc.type || \'unknown\', postResults);';
  
  if (as.includes('harnessFeedback.recordEvaluation')) {
    console.log('4. Feedback recording already added. Skipping.');
  } else {
    as = as.replace(postFlightTarget, feedbackRecord);
    fs.writeFileSync(asPath, as);
    console.log('4. Added harnessFeedback recording to artifact-store.ts');
  }
}

console.log('\nAll changes complete.');
