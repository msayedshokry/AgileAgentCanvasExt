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

  # ─── Harness launch (prompt always staged) ────────────────────────────────
  # Every run stages its prompt to a private file under
  # <outputFolder>/_terminal-output/prompts. stdin harnesses (claude, codex,
  # opencode, pi) get it on stdin; pointer harnesses (gemini, copilot,
  # cursor-agent) get a short "Read the file …" argument; aider gets
  # --message-file. Prompt text never travels on the command line, so
  # PowerShell 5.1 argv mangling and ConPTY paste limits cannot corrupt it.
  # The default permission posture is "sandboxed".

  @windows @command @headless
  Scenario: PowerShell pipes the staged prompt into claude's stdin (sandboxed)
    Given the VS Code shell is "powershell.exe"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    # $OutputEncoding pinned to UTF-8: PS 5.1 defaults to ASCII and would
    # corrupt non-ASCII prompt text crossing the pipe.
    And the sent command should contain "Get-Content -Raw -Encoding UTF8"
    And the sent command should contain "$OutputEncoding"
    And the sent command should contain "| claude -p"
    And the sent command should contain "acceptEdits"
    And the sent command should not contain "bypassPermissions"
    And the sent command should not contain "--dangerously-skip-permissions"
    And the sent command should not contain "$null |"
    And the sent command should not contain "<"
    And the sent command should not contain "BBBBBBBB"

  @windows @command @headless
  Scenario: Full permission posture uses claude's bypass flags
    Given the VS Code shell is "powershell.exe"
    And the permission posture is "full"
    When I execute a terminal workflow with a long prompt
    Then the sent command should contain "bypassPermissions"
    And the sent command should contain "--dangerously-skip-permissions"

  @windows @command @headless
  Scenario: Bash redirects the staged prompt into claude's stdin
    Given the VS Code shell is "/bin/bash"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "claude -p"
    And the sent command should contain "_terminal-output/prompts/"
    And the sent command should contain " < "
    And the sent command should not contain "/dev/null"
    And the sent command should not contain "Get-Content"
    And the sent command should not contain "BBBBBBBB"

  @windows @command @headless
  Scenario: cmd.exe redirects the staged prompt into claude's stdin
    Given the VS Code shell is "C:\Windows\System32\cmd.exe"
    When I execute a terminal workflow with a long prompt
    Then the sent command should start with "claude -p"
    And the sent command should contain " < "
    And the sent command should not contain "Get-Content"

  # ─── Other harnesses ──────────────────────────────────────────────────────

  @windows @command @headless @codex
  Scenario: Codex exec reads the prompt from stdin inside the workspace-write sandbox
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "codex"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "codex exec"
    And the sent command should contain "--sandbox workspace-write"
    And the sent command should contain "--skip-git-repo-check"
    # codex exec 0.163 rejects --ask-for-approval ("unexpected argument").
    And the sent command should not contain "--ask-for-approval"
    And the sent command should contain "- < "

  @windows @command @headless @opencode
  Scenario: OpenCode run trusts the local model config
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "opencode"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "opencode run"
    And the sent command should not contain "--model"
    And the sent command should not contain "--auto"
    And the sent command should contain " < "

  @windows @command @headless @pi
  Scenario: Pi CLI runs with a restricted tool list when sandboxed
    Given the VS Code shell is "/bin/bash"
    And the terminal provider is "pi"
    When I execute a terminal workflow with a long prompt
    Then sendText should have been called
    And the sent command should start with "pi --no-session"
    And the sent command should contain "--tools 'read,write,edit'"
    And the sent command should not contain "--approve"
    And the sent command should contain "-p < "

  @windows @command @headless
  Scenario: Gemini CLI gets a short pointer to the staged prompt
    Given the VS Code shell is "powershell.exe"
    And the terminal provider is "gemini"
    When I execute a terminal workflow with a long prompt
    Then the sent command should start with "gemini --approval-mode auto_edit -p 'Read the file "
    And the sent command should contain "_terminal-output/prompts/"
    And the sent command should not contain "Get-Content"
    And the sent command should not contain "BBBBBBBB"

  # ─── Short Prompt ────────────────────────────────────────────────────────

  @windows @command
  Scenario: Short prompts are staged too (PowerShell)
    Given the VS Code shell is "powershell.exe"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should not contain "$null |"
    And the sent command should contain "Get-Content -Raw -Encoding UTF8"
    And the sent command should contain "| claude -p"

  @windows @command
  Scenario: Short prompts are staged too (Bash)
    Given the VS Code shell is "/bin/bash"
    And the prompt length is short (< 8192 chars)
    When I execute a terminal workflow with a short prompt
    Then sendText should have been called
    And the sent command should start with "claude -p"
    And the sent command should not contain "/dev/null"
    And the sent command should contain " < "

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
