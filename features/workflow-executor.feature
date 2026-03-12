Feature: Workflow Executor - Workflow Management and Execution
  As a BMAD Studio user
  I want to manage and execute workflows
  So that I can automate product development tasks

  Background:
    Given a fresh workflow executor

  # Workflow Registry Tests
  @registry
  Scenario: Registry contains minimum number of workflows
    Then the workflow registry should contain at least 51 workflows

  @registry
  Scenario: Registry has workflows in all modules
    Then workflows should exist in module "core"
    And workflows should exist in module "bmm"
    And workflows should exist in module "bmb"
    And workflows should exist in module "tea"
    And workflows should exist in module "cis"

  @registry
  Scenario: Registry has unique workflow IDs
    Then all workflow IDs should be unique

  @registry
  Scenario: All workflows have required fields
    Then all workflows should have required fields

  @registry
  Scenario: Core module contains expected workflows
    Then the "core" module should contain at least 3 workflows
    And the "core" module should have workflow "brainstorming"
    And the "core" module should have workflow "convert-to-json"
    And the "core" module should have workflow "party-mode"

  @registry
  Scenario: BMM module contains phase workflows
    Then the "bmm" module should have workflow "create-product-brief"
    And the "bmm" module should have workflow "create-prd"
    And the "bmm" module should have workflow "create-architecture"

  @registry
  Scenario: TEA module contains testing workflows
    Then the "tea" module should contain at least 8 workflows
    And the "tea" module should have workflow "test-design"
    And the "tea" module should have workflow "test-review"

  @registry
  Scenario: BMB module contains builder workflows
    Then the "bmb" module should contain at least 10 workflows
    And the "bmb" module should have workflow "create-agent"
    And the "bmb" module should have workflow "create-module"
    And the "bmb" module should have workflow "create-workflow"

  @registry
  Scenario: CIS module contains innovation workflows
    Then the "cis" module should contain at least 4 workflows
    And the "cis" module should have workflow "design-thinking"
    And the "cis" module should have workflow "innovation-strategy"

  # Frontmatter Parsing Tests
  @parsing @frontmatter
  Scenario: Parse valid YAML frontmatter
    When I parse frontmatter from content:
      """
      ---
      name: Test Workflow
      description: A test workflow
      output_format: markdown
      ---

      # Workflow Body

      This is the workflow content.
      """
    Then the frontmatter name should be "Test Workflow"
    And the frontmatter description should be "A test workflow"
    And the frontmatter output_format should be "markdown"
    And the body should be "# Workflow Body\n\nThis is the workflow content."

  @parsing @frontmatter
  Scenario: Handle content without frontmatter
    When I parse frontmatter from content:
      """
      # Just Content

      No frontmatter here.
      """
    Then the frontmatter should be empty
    And the body should be "# Just Content\n\nNo frontmatter here."

  @parsing @frontmatter
  Scenario: Handle empty frontmatter
    When I parse frontmatter from content:
      """
      ---

      ---
      Body content
      """
    Then the frontmatter should be null
    And the body should be "Body content"

  @parsing @frontmatter
  Scenario: Parse complex frontmatter with arrays and objects
    When I parse frontmatter from content:
      """
      ---
      name: Complex Workflow
      tags:
        - testing
        - development
      config:
        timeout: 30
        retries: 3
      ---

      Body
      """
    Then the frontmatter name should be "Complex Workflow"
    And the frontmatter tags should contain "testing" and "development"
    And the frontmatter config timeout should be 30
    And the frontmatter config retries should be 3

  @parsing @frontmatter
  Scenario: Parse frontmatter with step file references
    When I parse frontmatter from content:
      """
      ---
      name: Multi-step Workflow
      editWorkflow: ./steps/step-01-edit.md
      validateWorkflow: ./steps/step-02-validate.md
      nextStepFile: ./steps/step-02.md
      ---

      Instructions
      """
    Then the frontmatter editWorkflow should be "./steps/step-01-edit.md"
    And the frontmatter validateWorkflow should be "./steps/step-02-validate.md"
    And the frontmatter nextStepFile should be "./steps/step-02.md"

  # Session Management - Creation Tests
  @session @create
  Scenario: Create a new session with correct properties
    When I create a session with:
      | path         | /path/to/workflow.md       |
      | name         | Test Workflow              |
      | artifactType | epic                       |
      | artifactId   | EPIC-1                     |
    Then the session ID should match pattern "ws-\d+-[a-z0-9]+"
    And the session workflow path should be "/path/to/workflow.md"
    And the session workflow name should be "Test Workflow"
    And the session artifact type should be "epic"
    And the session artifact ID should be "EPIC-1"
    And the session status should be "active"
    And the session current step number should be 0
    And the session steps completed should be empty
    And the session user inputs should be empty

  @session @create
  Scenario: Creating session sets it as current
    When I create a session with:
      | path         | /path/to/workflow.md |
      | name         | Test Workflow        |
      | artifactType | story                |
      | artifactId   | STORY-1              |
    Then the current session should be the created session

  @session @create
  Scenario: Multiple sessions have unique IDs
    When I create a session with:
      | path         | /path/1.md |
      | name         | Workflow 1 |
      | artifactType | epic       |
      | artifactId   | EPIC-1     |
    And I also store the session ID as "session1"
    And I create a session with:
      | path         | /path/2.md |
      | name         | Workflow 2 |
      | artifactType | epic       |
      | artifactId   | EPIC-2     |
    And I also store the session ID as "session2"
    Then session ID "session1" should be different from "session2"

  @session @create
  Scenario: Session extracts workflow ID from path
    When I create a session with:
      | path         | /bmad/bmm/workflows/create-epics-and-stories/workflow.md |
      | name         | Create Epics                                              |
      | artifactType | epic                                                      |
      | artifactId   | EPIC-1                                                    |
    Then the session workflow ID should be "create-epics-and-stories"

  # Session Management - Get/Retrieve Tests
  @session @retrieve
  Scenario: Get current session returns null when no session exists
    Then the current session should be null

  @session @retrieve
  Scenario: Get current session after creation
    When I create a session with:
      | path         | /path/to/workflow.md |
      | name         | Test                 |
      | artifactType | epic                 |
      | artifactId   | EPIC-1               |
    Then the current session should not be null
    And the current session workflow name should be "Test"

  @session @retrieve
  Scenario: Get session by ID
    When I create a session with:
      | path         | /path.md |
      | name         | Test     |
      | artifactType | epic     |
      | artifactId   | EPIC-1   |
    Then getting the session by its ID should return the same session

  @session @retrieve
  Scenario: Get session returns null for non-existent ID
    When I get session with ID "non-existent-id"
    Then the retrieved session should be null

  # Session Management - Update Tests
  @session @update
  Scenario: Update session adds user input
    Given I have an active session
    When I update the session with input "User provided input"
    Then the session should have 1 user input
    And the session user input 1 should be "User provided input"

  @session @update
  Scenario: Update session marks step as completed
    Given I have an active session
    When I update the session with input "input" and mark step completed
    Then the session should have 1 completed step

  @session @update
  Scenario: Update session advances to next step
    Given I have an active session
    When I update the session with input "input" and next step "/path/step-2.md"
    Then the session current step path should be "/path/step-2.md"
    And the session current step number should be 1

  @session @update
  Scenario: Update session updates last activity time
    Given I have an active session
    And I store the session last activity time
    When I update the session with input "input"
    Then the session last activity time should be updated

  @session @update
  Scenario: Update session returns null when no current session
    When I update the session with input "input"
    Then the update result should be null

  # Session Management - Complete/Cancel Tests
  @session @lifecycle
  Scenario: Complete session marks it as completed
    Given I have an active session
    When I complete the session
    Then the session status should be "completed"

  @session @lifecycle
  Scenario: Complete session clears current session
    Given I have an active session
    When I complete the session
    Then the current session should be null

  @session @lifecycle
  Scenario: Cancel session marks it as cancelled
    Given I have an active session
    When I cancel the session
    Then the session status should be "cancelled"

  @session @lifecycle
  Scenario: Cancel session clears current session
    Given I have an active session
    When I cancel the session
    Then the current session should be null

  # Session Management - Switch Tests
  @session @switch
  Scenario: Switch to a different active session
    When I create a session with:
      | path         | /path1.md  |
      | name         | Workflow 1 |
      | artifactType | epic       |
      | artifactId   | EPIC-1     |
    And I also store the session ID as "session1"
    And I create a session with:
      | path         | /path2.md  |
      | name         | Workflow 2 |
      | artifactType | epic       |
      | artifactId   | EPIC-2     |
    Then the current session workflow name should be "Workflow 2"
    When I switch to session "session1"
    Then the switch should succeed
    And the current session workflow name should be "Workflow 1"

  @session @switch
  Scenario: Cannot switch to non-existent session
    When I switch to session "non-existent"
    Then the switch should fail

  @session @switch
  Scenario: Cannot switch to completed session
    Given I have an active session
    And I store the session ID as "completed-session"
    And I complete the current session
    When I switch to session "completed-session"
    Then the switch should fail

  # Step Navigation Parsing Tests
  @navigation @parsing
  Scenario: Parse nextStepFile from frontmatter
    When I parse step navigation from content:
      """
      ---
      name: Step 1
      nextStepFile: './step-02.md'
      ---

      Step content
      """
    Then the next step should be "./step-02.md"

  @navigation @parsing
  Scenario: Parse thisStepFile from frontmatter
    When I parse step navigation from content:
      """
      ---
      thisStepFile: './step-01.md'
      nextStepFile: './step-02.md'
      ---

      Content
      """
    Then the this step should be "./step-01.md"
    And the next step should be "./step-02.md"

  @navigation @parsing
  Scenario: Handle content without step references
    When I parse step navigation from content:
      """
      # Just content

      No frontmatter
      """
    Then the next step should be undefined
    And the this step should be undefined

  @navigation @parsing
  Scenario: Handle frontmatter without step references
    When I parse step navigation from content:
      """
      ---
      name: Simple step
      description: No navigation
      ---

      Content
      """
    Then the next step should be undefined

  # User Prompt Detection Tests
  @prompt @detection
  Scenario: Detect menu options with bracket format
    When I detect user prompt in response:
      """
      Please select an option:

      [A] Create new epic
      [B] Edit existing epic
      [C] Continue
      """
    Then waiting for input should be true
    And menu options should contain "[A] Create new epic"
    And menu options should contain "[C] Continue"
    And continue option should be true

  @prompt @detection
  Scenario: Detect menu options with dash format
    When I detect user prompt in response:
      """
      Select:
      A - Option one
      B - Option two
      C - Continue to next step
      """
    Then waiting for input should be true
    And continue option should be true

  @prompt @detection
  Scenario: Detect explicit input prompts
    When I detect user prompt in response "Please select your preferred option from above."
    Then waiting for input should be true

  @prompt @detection
  Scenario: Detect waiting for input phrases
    When I detect user prompt in response "I am waiting for your input before proceeding."
    Then waiting for input should be true

  @prompt @detection
  Scenario: Detect what would you like phrases
    When I detect user prompt in response "What would you like to do next?"
    Then waiting for input should be true

  @prompt @detection
  Scenario: No detection in normal content
    When I detect user prompt in response "The workflow has been completed successfully. All changes have been saved."
    Then waiting for input should be false

  @prompt @detection
  Scenario: Deduplicate menu options
    When I detect user prompt in response:
      """
      [A] Option A
      [A] Option A
      [B] Option B
      """
    Then menu options starting with "[A]" should appear only once

  # Workflow Query Methods Tests
  @query @workflows
  Scenario: Get all workflows returns registry
    When I get all workflows
    Then the result should be the workflow registry
    And the result should contain more than 0 workflows

  @query @filter
  Scenario: Filter workflows by core module
    When I get workflows for module "core"
    Then all returned workflows should have module "core"

  @query @filter
  Scenario: Filter workflows by bmm module
    When I get workflows for module "bmm"
    Then all returned workflows should have module "bmm"

  @query @filter
  Scenario: Filter workflows by tea module
    When I get workflows for module "tea"
    Then all returned workflows should have module "tea"

  @query @tag
  Scenario: Filter workflows by tag
    When I get workflows with tag "testing"
    Then all returned workflows should have tag "testing"

  @query @tag
  Scenario: Return empty array for non-existent tag
    When I get workflows with tag "nonexistent-tag-xyz"
    Then the result should be empty

  @query @artifact
  Scenario: Get workflows for epic artifact
    When I get workflows for artifact type "epic"
    Then all returned workflows should support artifact "epic"

  @query @artifact
  Scenario: Get workflows for story artifact
    When I get workflows for artifact type "story"
    Then the result should not be empty

  @query @artifact
  Scenario: Return empty for unknown artifact type
    When I get workflows for artifact type "unknown-type"
    Then the result should be empty

  @query @available
  Scenario: Get available workflows for vision
    When I get available workflows for artifact "vision"
    Then the result should not be empty
    And all results should have path, name, and description

  @query @available
  Scenario: Get available workflows for epic includes specific workflows
    When I get available workflows for artifact "epic"
    Then the result should contain workflow named "Epic Enhancement"

  @query @available
  Scenario: Get available workflows for story includes specific workflows
    When I get available workflows for artifact "story"
    Then the result should contain workflow named "Story Enhancement"

  @query @available
  Scenario: Get available workflows for architecture
    When I get available workflows for artifact "architecture"
    Then the result should not be empty

  @query @available
  Scenario: Get default workflows for unknown artifact
    When I get available workflows for artifact "unknown"
    Then the result should contain workflow named "Brainstorming"

  # Workflow Menu Tests
  @menu
  Scenario: Generate menu for artifact type
    When I get workflow menu for "epic"
    Then the menu should contain "BMAD Workflow Selection"
    And the menu should contain "epic"
    And the menu should contain "[1]"

  @menu
  Scenario: Menu includes workflow descriptions
    When I get workflow menu for "story"
    Then the menu should contain "Story Enhancement"

  @menu @all
  Scenario: Generate menu with all modules
    When I get all available workflows menu
    Then the menu should contain "All BMAD Workflows"
    And the menu should contain "CORE Module"
    And the menu should contain "BMM Module"
    And the menu should contain "TEA Module"
    And the menu should contain "BMB Module"
    And the menu should contain "CIS Module"

  @menu @all
  Scenario: All workflows menu includes counts
    When I get all available workflows menu
    Then the menu should match pattern "\(\d+ workflows\)"

  # Variable Resolution Tests
  @variables
  Scenario: Pass through strings without variables
    When I resolve variable "/simple/path/file.md"
    Then the resolved value should be "/simple/path/file.md"

  @variables
  Scenario: Leave unresolved variables as-is
    When I resolve variable "{unknown-var}/path"
    Then the resolved value should be "{unknown-var}/path"

  # Getter Methods Tests
  @getters
  Scenario: Get BMAD path returns empty when not initialized
    Then the BMAD path should be empty

  @getters
  Scenario: Get project root returns empty when not initialized
    Then the project root should be empty

  # Singleton Tests
  @singleton
  Scenario: Singleton returns same instance
    When I get the workflow executor singleton twice
    Then both instances should be the same

  # Interface Structure Tests
  @interface @definition
  Scenario: WorkflowDefinition has correct structure
    Given a workflow definition with:
      | id          | test-workflow     |
      | name        | Test Workflow     |
      | description | A test workflow   |
      | module      | core              |
      | path        | test/workflow.md  |
      | format      | md                |
    Then the definition should have all required fields

  @interface @definition
  Scenario: WorkflowDefinition supports optional fields
    Given a workflow definition with:
      | id           | test-workflow     |
      | name         | Test Workflow     |
      | description  | A test workflow   |
      | module       | bmm               |
      | phase        | 1-analysis        |
      | category     | research          |
      | path         | test/workflow.md  |
      | format       | md                |
    Then the definition phase should be "1-analysis"
    And the definition category should be "research"

  @interface @session
  Scenario: WorkflowSession has correct structure when created
    When I create a session with:
      | path         | /path/workflow.md |
      | name         | Test Workflow     |
      | artifactType | epic              |
      | artifactId   | EPIC-1            |
    Then the session should have all required fields
    And the session started at should be a valid date
    And the session last activity at should be a valid date
