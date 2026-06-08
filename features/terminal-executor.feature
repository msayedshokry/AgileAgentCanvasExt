Feature: Terminal Executor - Windows Shell Compatibility
  As a Windows user
  I want the terminal executor to generate correct shell commands for PowerShell vs bash/zsh
  So that workflows execute without syntax errors on Windows

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

  # ─── Terminal Command Building (PowerShell) ───────────────────────────────

  @windows @command
  Scenario: PowerShell terminal command uses Get-Content pipe for long prompts
    Given the VS Code shell is "powershell.exe"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should contain "Get-Content"
    And the sent command should contain "| & claude"
    And the sent command should not contain "<"

  @windows @command
  Scenario: PowerShell terminal command with CLI args
    Given the VS Code shell is "powershell.exe"
    And the chat-bridge returns CLI args for claude
    When I execute a terminal workflow with a long prompt
    Then the sent command should contain "Get-Content"
    And the sent command should contain "--model"
    And the sent command should contain "| & claude"

  # ─── Terminal Command Building (Bash) ─────────────────────────────────────

  @windows @command
  Scenario: Bash terminal command uses stdin redirect for long prompts
    Given the VS Code shell is "/bin/bash"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should contain "<"
    And the sent command should start with "claude"
    And the sent command should not contain "Get-Content"

  @windows @command
  Scenario: Bash terminal command with CLI args
    Given the VS Code shell is "/bin/bash"
    And the chat-bridge returns CLI args for claude
    When I execute a terminal workflow with a long prompt
    Then the sent command should start with "claude"
    And the sent command should contain "--model"
    And the sent command should contain "<"

  # ─── Short Prompt (no temp file) ──────────────────────────────────────────

  @windows @command
  Scenario: Short prompt passes command directly (PowerShell)
    Given the VS Code shell is "powershell.exe"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should start with "claude"
    And the sent command should not contain "Get-Content"
    And the sent command should not contain "<"

  @windows @command
  Scenario: Short prompt passes command directly (Bash)
    Given the VS Code shell is "/bin/bash"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should start with "claude"

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

  @windows @sanitize
  Scenario: Sanitize used in temp filename (long prompt)
    Given the VS Code shell is "/bin/bash"
    And the artifact ID contains a space
    When I execute a terminal workflow with a long prompt
    Then the temp filename should contain "Epic-2"
    And the temp filename should not contain "Epic 2"
