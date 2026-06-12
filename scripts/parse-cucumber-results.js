// Parse the cucumber JSON report to identify ambiguous steps and failed scenarios.
const fs = require('fs');
const r = JSON.parse(fs.readFileSync('reports/cucumber-report.json', 'utf-8'));

const ambiguousSteps = new Map();
const failedByFeature = new Map();
let totalScenarios = 0;
let totalAmbiguous = 0;
let totalFailed = 0;
let totalPassed = 0;
let totalWip = 0;

for (const feat of r) {
  for (const e of (feat.elements || [])) {
    if (!e.steps || e.steps.length === 0) continue;
    totalScenarios++;
    let scenarioFailed = false;
    let isWip = false;
    for (const step of e.steps) {
      if (step.result?.status === 'ambiguous') {
        totalAmbiguous++;
        const key = step.name;
        if (!ambiguousSteps.has(key)) {
          ambiguousSteps.set(key, { count: 0, examples: [] });
        }
        const entry = ambiguousSteps.get(key);
        entry.count++;
        if (entry.examples.length < 2) {
          // Capture which step definitions matched by looking at the error message
          const errMsg = step.result.error_message || '';
          entry.examples.push({
            scenario: e.name,
            feature: feat.name,
            error: errMsg.substring(0, 400),
          });
        }
      } else if (step.result?.status === 'failed') {
        scenarioFailed = true;
        if (!failedByFeature.has(feat.name)) {
          failedByFeature.set(feat.name, []);
        }
        const fails = failedByFeature.get(feat.name);
        if (!fails.find(f => f.scenario === e.name)) {
          fails.push({
            scenario: e.name,
            tags: e.tags?.map(t => t.name) || [],
            step: step.name,
            error: (step.result.error_message || '').substring(0, 200),
          });
        }
      }
    }
    if (scenarioFailed) totalFailed++;
    else if (e.tags?.some(t => t.name === '@wip')) totalWip++;
    else totalPassed++;
  }
}

console.log('=== TOTALS ===');
console.log(`Total scenarios: ${totalScenarios}`);
console.log(`Passed: ${totalPassed}`);
console.log(`Failed: ${totalFailed}`);
console.log(`@wip: ${totalWip}`);
console.log(`Ambiguous step invocations: ${totalAmbiguous}`);

console.log('\n=== AMBIGUOUS STEP PATTERNS ===');
const sortedAmbiguous = [...ambiguousSteps.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [name, info] of sortedAmbiguous) {
  console.log(`\n"${name}" (${info.count} ambiguous invocation${info.count > 1 ? 's' : ''})`);
  for (const ex of info.examples) {
    console.log(`  in: ${ex.feature} > ${ex.scenario}`);
    console.log(`  error: ${ex.error}`);
  }
}

console.log('\n=== FAILED SCENARIOS BY FEATURE ===');
for (const [feat, fails] of [...failedByFeature.entries()].sort()) {
  console.log(`\n${feat}: ${fails.length} failed`);
  for (const f of fails.slice(0, 5)) {
    const tagStr = f.tags.filter(t => t !== '@wip').join(' ');
    console.log(`  - ${f.scenario} [${tagStr}]`);
    console.log(`    step: ${f.step}`);
    console.log(`    error: ${f.error.split('\n')[0]}`);
  }
  if (fails.length > 5) console.log(`  ... and ${fails.length - 5} more`);
}
