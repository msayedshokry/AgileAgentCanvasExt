Feature: Terminal Executor - Windows Shell Compatibility and Headless CLI Flags
  As a Windows user
  I want the terminal executor to generate correct shell commands for PowerShell vs bash/zsh
  So that workflows execute without syntax errors on Windows

  As a kanban orchestrator
  I want CLI providers (claude, codex, opencode, pi) to launch in headless mode
  So that the agent writes a verdict JSON file instead of opening an interactive TUI in the user's terminal

  Background:
    Given a fresh terminal executor context

  # ─── Shell Detection ──────────────────────────────────────────────────────

  @windows @shell
  Scenario: Detect PowerShell when shell is powershell.exe
    Given the VS Code shell is "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
    When I check if the shell is PowerShell
    Then the result should be true

  @windows @shell
  Scenario: Detect PowerShell when shell is pwsh
    Given the VS Code shell is "C:\Program Files\PowerShell\7\pwsh.exe"
    When I check if the shell is PowerShell
    Then the result should be true

  @windows @shell
  Scenario: Detect non-PowerShell when shell is bash
    Given the VS Code shell is "/bin/bash"
    When I check if the shell is PowerShell
    Then the result should be false

  @windows @shell
  Scenario: Detect non-PowerShell when shell is zsh
    Given the VS Code shell is "/bin/zsh"
    When I check if the shell is PowerShell
    Then the result should be false

  @windows @shell
  Scenario: Detect non-PowerShell when shell is cmd.exe
    Given the VS Code shell is "C:\Windows\System32\cmd.exe"
    When I check if the shell is PowerShell
    Then the result should be false

  # ─── Shell Quoting ────────────────────────────────────────────────────────

  @windows @quoting
  Scenario: PowerShell quoting wraps paths with spaces in double quotes
    Given the VS Code shell is "powershell.exe"
    When I quote the path "C:/temp/my project/file.md"
    Then the quoted result should be "\"C:/temp/my project/file.md\""

  @windows @quoting
  Scenario: PowerShell quoting escapes backticks
    Given the VS Code shell is "powershell.exe"
    When I quote the path "C:/temp/special`file.md"
    Then the quoted result should contain "``"

  @windows @quoting
  Scenario: PowerShell quoting escapes dollar signs
    Given the VS Code shell is "powershell.exe"
    When I quote the path "C:\\$temp/file.md"
    Then the quoted result should contain "`$"

  @windows @quoting
  Scenario: Bash quoting wraps in single quotes
    Given the VS Code shell is "/bin/bash"
    When I quote the path "/home/user/my project/file.md"
    Then the quoted result should be "'/home/user/my project/file.md'"

  @windows @quoting
  Scenario: Simple paths without special chars are not quoted
    Given the VS Code shell is "powershell.exe"
    When I quote the path "simple/path/file.md"
    Then the quoted result should be "simple/path/file.md"

  @windows @quoting
  Scenario: Empty string is quoted as two single quotes
    Given the VS Code shell is "/bin/bash"
    When I quote the path ""
    Then the quoted result should be "''"

  # ─── Headless Flags (Long Prompt) ─────────────────────────────────────────
  # Headless CLIs (claude -p, codex exec, opencode run) require the
  # prompt as a positional arg value and DO NOT read it from stdin. The prompt
  # is therefore always sent inline via shellQuote, regardless of length.

  @windows @command @headless
  Scenario: PowerShell terminal command emits headless flags inline (long prompt)
    Given the VS Code shell is "powershell.exe"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should contain "$null |"
    And the sent command should contain "claude"
    And the sent command should contain "--permission-mode"
    And the sent command should contain "acceptEdits"
    And the sent command should contain "--output-format"
    And the sent command should not contain "<"
    And the sent command should not contain "Get-Content"
    And the sent command should not contain "--bare"

  @windows @command @headless
  Scenario: PowerShell terminal command keeps headless shape with custom CLI args
    Given the VS Code shell is "powershell.exe"
    And the chat-bridge returns CLI args for claude
    When I execute a terminal workflow with a long prompt
    Then the sent command should contain "--permission-mode"
    And the sent command should not contain "<"
    And the sent command should not contain "Get-Content"

  @windows @command @headless
  Scenario: Bash terminal command emits headless flags inline (long prompt)
    Given the VS Code shell is "/bin/bash"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "claude"
    And the sent command should contain "--permission-mode"
    And the sent command should contain "< /dev/null"
    And the sent command should not contain "Get-Content"
    And the sent command should not contain "--bare"

  @windows @command @headless
  Scenario: Bash terminal command keeps headless shape with custom CLI args
    Given the VS Code shell is "/bin/bash"
    And the chat-bridge returns CLI args for claude
    When I execute a terminal workflow with a long prompt
    Then the sent command should start with "claude"
    And the sent command should contain "< /dev/null"

  # ─── Headless Flags (Other Providers) ─────────────────────────────────────

  @windows @command @headless @codex
  Scenario: Codex exec launches with headless flags inline
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "codex"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "codex"
    And the sent command should contain "exec"
    And the sent command should contain "--ask-for-approval"
    And the sent command should contain "never"
    And the sent command should contain "--sandbox"
    And the sent command should contain "< /dev/null"
    And the sent command should not contain "Get-Content"

  @windows @command @headless @opencode
  Scenario: OpenCode run launches with headless flags inline
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "opencode"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "opencode"
    And the sent command should contain "run"
    And the sent command should contain "--model"
    And the sent command should contain "--format"
    And the sent command should contain "< /dev/null"
    And the sent command should not contain "Get-Content"

  @windows @command @headless @pi
  Scenario: Pi CLI launches with headless flags inline
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "pi"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "pi"
    And the sent command should contain "--no-session"
    And the sent command should contain "--mode"
    And the sent command should contain "json"
    And the sent command should contain "--approve"
    And the sent command should contain "-p"
    And the sent command should contain "< /dev/null"
    And the sent command should not contain "Get-Content"

  # ─── Short Prompt ────────────────────────────────────────────────────────

  @windows @command
  Scenario: Short prompt passes command directly (PowerShell)
    Given the VS Code shell is "powershell.exe"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should contain "$null |"
    And the sent command should contain "claude"
    And the sent command should not contain "<"
    And the sent command should not contain "Get-Content"

  @windows @command
  Scenario: Short prompt passes command directly (Bash)
    Given the VS Code shell is "/bin/bash"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should start with "claude"
    And the sent command should contain "< /dev/null"

  # ─── Filename Sanitization ────────────────────────────────────────────────

  @windows @sanitize
  Scenario: Sanitize removes spaces from artifact ID
    When I sanitize the ID "Epic 2"
    Then the sanitized result should be "Epic-2"

  @windows @sanitize
  Scenario: Sanitize preserves alphanumeric and hyphen
    When I sanitize the ID "EPIC-42"
    Then the sanitized result should be "EPIC-42"

  @windows @sanitize
  Scenario: Sanitize handles special characters
    When I sanitize the ID "Story #3 (urgent)"
    Then the sanitized result should be "Story-3-urgent"

  @windows @sanitize
  Scenario: Sanitize collapses consecutive hyphens
    When I sanitize the ID "Epic  2  !!!"
    Then the sanitized result should be "Epic-2"
