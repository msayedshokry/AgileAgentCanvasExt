/**
 * Cucumber Hooks - Setup and teardown for test scenarios
 */

import { Before, After, BeforeAll, AfterAll, Status } from '@cucumber/cucumber';
import { BmadWorld } from './world';

BeforeAll(function() {
  // Global setup if needed
});

AfterAll(function() {
  // Global cleanup if needed
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
