/**
 * Script to fix sample project JSON files to conform to metadata schemas.
 * 
 * Three fix types:
 * 1. Pattern A: Files with old-format metadata -> transform to new format
 * 2. Pattern B: Bare arrays -> wrap in expected object structure
 * 3. Pattern C: Files with old metadata + extra fields (id, description) -> transform
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_DIR = path.join(__dirname, 'resources', 'sample-project');

// Pattern A: Files with { metadata: { version, createdAt, updatedAt, ... }, content: {...} }
// These need metadata transformed to { schemaVersion, artifactType, timestamps, ... }
const patternAFiles = [
  // bmm-artifacts (using author)
  'bmm-artifacts/project-context.json',
  'bmm-artifacts/project-overview.json',
  'bmm-artifacts/research.json',
  'bmm-artifacts/retrospective.json',
  'bmm-artifacts/source-tree.json',
  'bmm-artifacts/sprint-status.json',
  'bmm-artifacts/tech-spec.json',
  'bmm-artifacts/test-summary.json',
  'bmm-artifacts/ux-design.json',
  // bmm-artifacts (using createdBy)
  'bmm-artifacts/change-proposal.json',
  'bmm-artifacts/code-review.json',
  'bmm-artifacts/readiness-report.json',
  // cis-artifacts (using createdBy)
  'cis-artifacts/design-thinking.json',
  'cis-artifacts/innovation-strategy.json',
  'cis-artifacts/problem-solving.json',
  'cis-artifacts/storytelling.json',
];

// Pattern C: Testing artifacts with extra id and description in metadata
const patternCFiles = [
  'testing-artifacts/atdd-checklist.json',
  'testing-artifacts/automation-summary.json',
  'testing-artifacts/ci-pipeline.json',
  'testing-artifacts/nfr-assessment.json',
  'testing-artifacts/test-framework.json',
  'testing-artifacts/test-review.json',
  'testing-artifacts/traceability-matrix.json',
];

function fixPatternAMetadata(filePath) {
  const fullPath = path.join(SAMPLE_DIR, filePath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  const oldMeta = data.metadata;
  if (!oldMeta) {
    console.log(`  SKIP (no metadata): ${filePath}`);
    return false;
  }
  
  // Already conforming?
  if (oldMeta.schemaVersion && oldMeta.timestamps) {
    console.log(`  SKIP (already conforming): ${filePath}`);
    return false;
  }
  
  const newMeta = {
    schemaVersion: oldMeta.version || '1.0.0',
    artifactType: oldMeta.artifactType,
  };
  
  // Optionally add workflowName if present
  if (oldMeta.workflowName) {
    newMeta.workflowName = oldMeta.workflowName;
  }
  
  // Optionally add projectName if present
  if (oldMeta.projectName) {
    newMeta.projectName = oldMeta.projectName;
  }
  
  // Build timestamps
  newMeta.timestamps = {};
  if (oldMeta.createdAt) {
    newMeta.timestamps.created = oldMeta.createdAt;
  } else {
    newMeta.timestamps.created = '2026-01-15T09:00:00Z';
  }
  if (oldMeta.updatedAt) {
    newMeta.timestamps.lastModified = oldMeta.updatedAt;
  }
  
  // Status
  if (oldMeta.status) {
    newMeta.status = oldMeta.status;
  }
  
  // Tags
  if (oldMeta.tags) {
    newMeta.tags = oldMeta.tags;
  }
  
  // Author (from author or createdBy)
  if (oldMeta.author) {
    newMeta.author = oldMeta.author;
  } else if (oldMeta.createdBy) {
    newMeta.author = oldMeta.createdBy;
  }
  
  // stepsCompleted
  if (oldMeta.stepsCompleted) {
    newMeta.stepsCompleted = oldMeta.stepsCompleted;
  }
  
  // inputDocuments
  if (oldMeta.inputDocuments) {
    newMeta.inputDocuments = oldMeta.inputDocuments;
  }
  
  data.metadata = newMeta;
  
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  FIXED: ${filePath}`);
  return true;
}

function fixPatternCMetadata(filePath) {
  const fullPath = path.join(SAMPLE_DIR, filePath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  const oldMeta = data.metadata;
  if (!oldMeta) {
    console.log(`  SKIP (no metadata): ${filePath}`);
    return false;
  }
  
  // Already conforming?
  if (oldMeta.schemaVersion && oldMeta.timestamps) {
    console.log(`  SKIP (already conforming): ${filePath}`);
    return false;
  }
  
  const newMeta = {
    schemaVersion: oldMeta.version || '1.0.0',
    artifactType: oldMeta.artifactType,
  };
  
  if (oldMeta.workflowName) {
    newMeta.workflowName = oldMeta.workflowName;
  }
  
  if (oldMeta.projectName) {
    newMeta.projectName = oldMeta.projectName;
  }
  
  // Build timestamps
  newMeta.timestamps = {};
  if (oldMeta.createdAt) {
    newMeta.timestamps.created = oldMeta.createdAt;
  } else {
    newMeta.timestamps.created = '2026-01-15T09:00:00Z';
  }
  if (oldMeta.updatedAt) {
    newMeta.timestamps.lastModified = oldMeta.updatedAt;
  }
  
  if (oldMeta.status) {
    newMeta.status = oldMeta.status;
  }
  
  if (oldMeta.tags) {
    newMeta.tags = oldMeta.tags;
  }
  
  if (oldMeta.createdBy) {
    newMeta.author = oldMeta.createdBy;
  } else if (oldMeta.author) {
    newMeta.author = oldMeta.author;
  }
  
  // Note: id, title, description are dropped from metadata (not in schema)
  // title and description can be preserved in content if they exist there
  
  data.metadata = newMeta;
  
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`  FIXED: ${filePath}`);
  return true;
}

function fixBareArrayRisks() {
  const filePath = 'bmm-artifacts/risks.json';
  const fullPath = path.join(SAMPLE_DIR, filePath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  if (!Array.isArray(data)) {
    console.log(`  SKIP (not an array): ${filePath}`);
    return false;
  }
  
  // Transform each risk item to match schema expectations
  const risks = data.map(item => {
    const risk = {
      id: item.id,
      risk: item.title || item.description,
      category: item.category,
      probability: item.likelihood, // schema uses 'probability', data uses 'likelihood'
      impact: item.impact,
      mitigation: item.mitigation,
    };
    if (item.riskScore) risk.riskScore = String(item.riskScore);
    if (item.status) risk.status = item.status;
    if (item.owner) risk.owner = item.owner;
    if (item.contingency) risk.contingency = item.contingency;
    if (item.triggers) risk.triggers = item.triggers;
    if (item.identifiedDate) risk.identifiedDate = item.identifiedDate;
    if (item.lastReviewDate) risk.lastReviewDate = item.lastReviewDate;
    if (item.description && item.title) {
      risk.description = item.description;
    }
    return risk;
  });
  
  const wrapped = { risks };
  
  fs.writeFileSync(fullPath, JSON.stringify(wrapped, null, 2) + '\n', 'utf8');
  console.log(`  FIXED: ${filePath}`);
  return true;
}

function fixBareArrayDoD() {
  const filePath = 'bmm-artifacts/definition-of-done.json';
  const fullPath = path.join(SAMPLE_DIR, filePath);
  const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  
  if (!Array.isArray(data)) {
    console.log(`  SKIP (not an array): ${filePath}`);
    return false;
  }
  
  // Transform items to match schema: needs 'item' field (required by schema)
  const items = data.map(entry => {
    const item = {
      id: entry.id,
      item: entry.criterion,
      category: entry.category,
    };
    if (entry.verification) item.verification = entry.verification;
    if (entry.status === 'active') item.required = true;
    return item;
  });
  
  const wrapped = { items };
  
  fs.writeFileSync(fullPath, JSON.stringify(wrapped, null, 2) + '\n', 'utf8');
  console.log(`  FIXED: ${filePath}`);
  return true;
}

// Run all fixes
console.log('Fixing Pattern A files (old metadata format)...');
let fixedCount = 0;
for (const file of patternAFiles) {
  if (fixPatternAMetadata(file)) fixedCount++;
}

console.log('\nFixing Pattern C files (testing artifacts with extra metadata fields)...');
for (const file of patternCFiles) {
  if (fixPatternCMetadata(file)) fixedCount++;
}

console.log('\nFixing bare array files...');
if (fixBareArrayRisks()) fixedCount++;
if (fixBareArrayDoD()) fixedCount++;

console.log(`\nDone! Fixed ${fixedCount} files.`);
