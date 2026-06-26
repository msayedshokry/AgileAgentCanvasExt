Feature: Chat provider availability detection
  As a canvas user
  I want the "Select Provider" dropdown to list only providers that are actually set up
  So that I never pick a provider that fails to launch

  Background:
    Given a fresh chat-bridge module context

  # ─── Always-available providers ─────────────────────────────────────────

  @chat-bridge @availability
  Scenario: 'auto' is always available regardless of host
    When I list available providers
    Then the provider "auto" should be marked available
    And the reason for "auto" should be "always"

  @chat-bridge @availability
  Scenario: 'copilot' is always available
    When I list available providers
    Then the provider "copilot" should be marked available
    And the reason for "copilot" should be "always"

  @chat-bridge @availability
  Scenario: 'terminal' is always available (built-in)
    When I list available providers
    Then the provider "terminal" should be marked available
    And the reason for "terminal" should be "always"

  # ─── Panel providers ────────────────────────────────────────────────────

  @chat-bridge @availability
  Scenario: Panel provider is available when its panel command is registered
    Given the panel command "claude.openChat" is registered
    And no CLI binaries are on PATH
    When I list available providers
    Then the provider "claude" should be marked available
    And the reason for "claude" should be "panel"

  @chat-bridge @availability
  Scenario: Panel provider falls back to CLI binary when panel command is missing
    Given no panel commands are registered
    And the CLI binary "claude" is on PATH
    When I list available providers
    Then the provider "claude" should be marked available
    And the reason for "claude" should be "cli"

  @chat-bridge @availability
  Scenario: Panel provider is unavailable when neither panel nor CLI exists
    Given no panel commands are registered
    And no CLI binaries are on PATH
    When I list available providers
    Then the provider "claude" should be marked unavailable

  @chat-bridge @availability
  Scenario: Panel probe errors are treated as panel-missing
    Given the panel command "claude.openChat" probe throws "extension not loaded"
    And the CLI binary "claude" is on PATH
    When I list available providers
    Then the provider "claude" should be marked available
    And the reason for "claude" should be "cli"

  @chat-bridge @availability
  Scenario: omp is available when its standalone CLI is on PATH but VS Code panel is missing
    Given no panel commands are registered
    And the CLI binary "omp" is on PATH
    When I list available providers
    Then the provider "omp" should be marked available
    And the reason for "omp" should be "cli"

  @chat-bridge @availability
  Scenario: omp is unavailable when neither panel nor CLI exists
    Given no panel commands are registered
    And no CLI binaries are on PATH
    When I list available providers
    Then the provider "omp" should be marked unavailable

  @chat-bridge @availability
  Scenario: omp is available when the OMP VS Code extension is installed
    Given the panel command "omp.openPanel" is registered
    And no CLI binaries are on PATH
    When I list available providers
    Then the provider "omp" should be marked available
    And the reason for "omp" should be "panel"

  # ─── CLI-only providers ─────────────────────────────────────────────────

  @chat-bridge @availability
  Scenario: codex is available when its CLI is on PATH
    Given the CLI binary "codex" is on PATH
    When I list available providers
    Then the provider "codex" should be marked available
    And the reason for "codex" should be "cli"

  @chat-bridge @availability
  Scenario: codex is unavailable when its CLI is missing
    Given no CLI binaries are on PATH
    When I list available providers
    Then the provider "codex" should be marked unavailable

  @chat-bridge @availability
  Scenario: aider is available when installed
    Given the CLI binary "aider" is on PATH
    When I list available providers
    Then the provider "aider" should be marked available

  @chat-bridge @availability
  Scenario: opencode is available when its CLI is on PATH
    Given the CLI binary "opencode" is on PATH
    When I list available providers
    Then the provider "opencode" should be marked available
    And the reason for "opencode" should be "cli"

  @chat-bridge @availability
  Scenario: opencode is unavailable when its CLI is missing
    Given no CLI binaries are on PATH
    When I list available providers
    Then the provider "opencode" should be marked unavailable

  @chat-bridge @availability
  Scenario: codex is unavailable on a stock host with no CLIs installed
    Given no CLI binaries are on PATH
    When I list available providers
    Then the provider "codex" should be marked unavailable
    And the provider "aider" should be marked unavailable
    And the provider "auto" should be marked available
    And the provider "copilot" should be marked available
    And the provider "terminal" should be marked available

  # ─── resolveCliOnPath helper ─────────────────────────────────────────────

  @chat-bridge @probe
  Scenario: resolveCliOnPath returns true for installed binaries
    Given the CLI binary "claude" is on PATH
    When I call resolveCliOnPath with "claude"
    Then it should return true

  @chat-bridge @probe
  Scenario: resolveCliOnPath returns false for missing binaries
    Given no CLI binaries are on PATH
    When I call resolveCliOnPath with "nope-not-installed-xyz"
    Then it should return false

  # ─── Caching ────────────────────────────────────────────────────────────

  @chat-bridge @cache
  Scenario: Results are cached so repeated list calls do not re-probe
    Given the CLI binary "codex" is on PATH
    When I list available providers
    And I list available providers again
    Then the codex availability probe should have been called once

  @chat-bridge @cache
  Scenario: Clearing the cache forces a re-probe
    Given the CLI binary "codex" is on PATH
    When I list available providers
    And I clear the provider availability cache
    And I list available providers
    Then the codex availability probe should have been called twice
