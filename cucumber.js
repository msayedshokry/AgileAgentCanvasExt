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
    // Skip @wip scenarios — same as default profile. Product-gap and
    // deferred-feature tests run only via --profile wip.
    tags: 'not @wip',
    format: [
      'progress',
      'json:reports/cucumber-report.json'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true
  },

  // ── CI category profiles (run in parallel to isolate failures) ──
  // ci-artifacts is used by CI; the other categories are split into
  // individual feature-file jobs in .github/workflows/ci.yml

  'ci-artifacts': {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: [
      'features/artifact-store.feature',
      'features/artifact-transformer.feature',
      'features/artifacts-tree-provider.feature',
      'features/schema-validator.feature',
      'features/artifact-commands.feature'
    ],
    tags: 'not @wip',
    format: [
      'progress',
      'json:reports/cucumber-report-artifacts.json'
    ],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true
  },

  'ci-workflow': {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: [
      'features/workflow-executor.feature',
      'features/agentic-kanban.feature',
      'features/lane-transitions.feature',
      'features/terminal-executor.feature',
      'features/kanban-orchestrator.feature',
      'features/kanban-data-integrity.feature'
    ],
    tags: 'not @wip',
    format: [
      'progress',
      'json:reports/cucumber-report-workflow.json'
    ],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true
  },

  'ci-views': {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: [
      'features/chat-participant.feature',
      'features/wizard-steps-provider.feature',
      'features/canvas-view-provider.feature',
      'features/webview-message-handler.feature',
      'features/extension.feature'
    ],
    tags: 'not @wip',
    format: [
      'progress',
      'json:reports/cucumber-report-views.json'
    ],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true
  },

  'ci-agents': {
    requireModule: ['ts-node/register/transpile-only'],
    require: [
      'features/support/vscode-shim.ts',
      'features/support/**/*.ts',
      'features/step_definitions/**/*.ts'
    ],
    paths: [
      'features/harness-policies.feature',
      'features/trace-recorder.feature',
      'features/a2a-outbound-client.feature',
      'features/acp-protocol.feature',
      'features/chat-bridge.feature',
      'features/graphify-integration.feature',
      'features/agent-team.feature',
      'features/agent-message-bus.feature',
      'features/data-pipeline.feature'
    ],
    tags: 'not @wip',
    format: [
      'progress',
      'json:reports/cucumber-report-agents.json'
    ],
    formatOptions: { snippetInterface: 'async-await' },
    publishQuiet: true
  }
};
