const fs = require('fs');
let f = fs.readFileSync('features/step_definitions/harness-policies.steps.ts', 'utf8');

// Fix 1: results should include {string} (artifactType: {string})
f = f.replace(
  "Then('the results should include {string} \\(artifactType: {string}\\)', function (this: BmadWorld, expected: string, artifactType: string) {",
  "Then(/^the results should include \"([^\"]+)\" \\(artifactType: ([^)]+)\\)$/, function (this: BmadWorld, expected: string, artifactType: string) {"
);

// Fix 2: results should not include {string} (no artifactType filter)
f = f.replace(
  "Then('the results should not include {string} \\(no artifactType filter\\)', function (this: BmadWorld, expected: string) {",
  "Then(/^the results should not include \"([^\"]+)\" \\(no artifactType filter\\)$/, function (this: BmadWorld, expected: string) {"
);

// Fix 3: results should not include {string} (artifactType: {string})
f = f.replace(
  "Then('the results should not include {string} \\(artifactType: {string}\\)', function (this: BmadWorld, expected: string, artifactType: string) {",
  "Then(/^the results should not include \"([^\"]+)\" \\(artifactType: ([^)]+)\\)$/, function (this: BmadWorld, expected: string, artifactType: string) {"
);

// Fix 4: engine should have {int} policies (from builtInPolicies)
f = f.replace(
  "Then('the engine should have {int} policies \\(from builtInPolicies\\)', function (this: BmadWorld, count: number) {",
  "Then(/^the engine should have (\\d+) policies \\(from builtInPolicies\\)$/, function (this: BmadWorld, count: string) {"
);
// Fix the count parameter type
f = f.replace(
  "Then(/^the engine should have (\\d+) policies \\(from builtInPolicies\\)$/, function (this: BmadWorld, count: string) {",
  "Then(/^the engine should have (\\d+) policies \\(from builtInPolicies\\)$/, function (this: BmadWorld, count: string) {\n  const ctx = getCtx(this);\n  assert.strictEqual(ctx.engine.policies.length, parseInt(count, 10));\n});\n\n// placeholder",
);

// Fix 5: policy evaluation should return null (LLM not supported)
f = f.replace(
  "Then('the policy evaluation should return null \\(LLM not supported\\)', function (this: BmadWorld) {",
  "Then(/^the policy evaluation should return null \\(LLM not supported\\)$/, function (this: BmadWorld) {"
);

// Clean up placeholder
f = f.replace("// placeholder\n", "");

fs.writeFileSync('features/step_definitions/harness-policies.steps.ts', f);
console.log('Fixed all paren patterns with regex');
