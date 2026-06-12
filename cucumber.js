/**
 * Cucumber.js configuration for BMAD Studio VS Code Extension
 */
module.exports = {
  default: {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      // vscode-shim MUST load before world.ts / step files so the global
      // Module._load hook is installed before proxyquire is required.
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: ['features/**/*.feature'],
    // Skip @wip scenarios (product-gap tests) by default. Run them with
    // --profile wip (or override tags: `cucumber-js --tags @wip`).
    tags: 'not @wip',
    format: [
      'progress-bar',
      'html:reports/cucumber-report.html',
      'json:reports/cucumber-report.json'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true
  },
  wip: {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: ['features/**/*.feature'],
    tags: '@wip',
    format: ['progress'],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true
  },
  ci: {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: ['features/**/*.feature'],
    format: [
      'progress',
      'json:reports/cucumber-report.json'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true
  }
};
