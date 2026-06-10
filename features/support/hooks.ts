/**
 * Cucumber Hooks - Setup and teardown for test scenarios
 */

import { After, AfterAll, Before, BeforeAll, Status } from '@cucumber/cucumber';
import * as fs from 'fs';
import * as path from 'path';
import { BmadWorld } from './world';

// M-T7: Scratch files/dirs the test suite creates at the repo root. Strict
// patterns only - never wildcard-match user content.
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRATCH_FILES = new Set([
  'cucumber-output.txt',
  'cucumber-output.json',
  'cucumber-full-output.txt',
  'cucumber-remaining.json',
  'full-output.txt',
  'full-output-2.txt',
  'remaining-failures.txt',
]);
// Strictly numeric suffix avoids wiping unrelated dotfolders.
const TRACE_DIR_RE = /^\.test-traces-\d+$/;

BeforeAll(function() {
  // M-T7 (hardened): wipe any .test-traces-* scratch dirs left over from
  // previous (possibly aborted) runs BEFORE this suite starts. Without this,
  // any partial run leaves a fresh timestamped dir behind and the AfterAll
  // sweep never gets a chance to fire. Strict numeric-suffix regex only.
  try {
    for (const entry of fs.readdirSync(REPO_ROOT)) {
      if (SCRATCH_FILES.has(entry) || TRACE_DIR_RE.test(entry)) {
        fs.rmSync(path.join(REPO_ROOT, entry), { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.warn(`[hooks] BeforeAll scratch sweep skipped: ${(err as Error).message}`);
  }
});

AfterAll(function() {
  // M-T7: Best-effort sweep of scratch files/dirs the suite leaves behind.
  // Never fail the suite on cleanup; log and move on.
  try {
    for (const entry of fs.readdirSync(REPO_ROOT)) {
      if (SCRATCH_FILES.has(entry) || TRACE_DIR_RE.test(entry)) {
        fs.rmSync(path.join(REPO_ROOT, entry), { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.warn(`[hooks] scratch cleanup skipped: ${(err as Error).message}`);
  }
});

Before(function(this: BmadWorld) {
  // Reset world state before each scenario
  this.resetMocks();
});

After(function(this: BmadWorld, scenario) {
  // Log any errors for failed scenarios
  if (scenario.result?.status === Status.FAILED && this.lastError) {
    console.error(`Scenario failed with error: ${this.lastError.message}`);
    console.error(this.lastError.stack);
  }
  
  // Clean up
  this.createdArtifacts.clear();
});
