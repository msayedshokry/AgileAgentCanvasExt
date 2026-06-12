Feature: Harness Policies - Continuous Quality Governance
  As an AgileAgentCanvas user
  I want the harness engine to evaluate agent output against built-in and user-defined policies
  So that blocking issues prevent corrupt data and advisory warnings help improve quality

  Background:
    Given a fresh harness engine
    And the harness engine has built-in policies registered

  # ─── Built-in Policies ─────────────────────────────────────────────────────

  @harness @builtin
  Scenario: Harness engine has 6 built-in policies
    Then the harness engine should have 6 registered policies
    And the policies should include "schema-conformance"
    And the policies should include "required-fields"
    And the policies should include "no-placeholders"
    And the policies should include "token-budget"
    And the policies should include "trace-anomaly"
    And the policies should include "feedback-accumulation"

  @harness @builtin
  Scenario: schema-conformance is pre-flight blocking
    When I get policy "schema-conformance"
    Then the policy type should be "pre-flight"
    And the policy severity should be "blocking"

  @harness @builtin
  Scenario: required-fields is pre-flight blocking for stories
    When I get policy "required-fields"
    Then the policy type should be "pre-flight"
    And the policy severity should be "blocking"
    And the policy artifactType should be "story"

  @harness @builtin
  Scenario: no-placeholders is post-flight advisory
    When I get policy "no-placeholders"
    Then the policy type should be "post-flight"
    And the policy severity should be "advisory"

  @harness @builtin
  Scenario: token-budget is post-flight advisory for epics
    When I get policy "token-budget"
    Then the policy type should be "post-flight"
    And the policy severity should be "advisory"
    And the policy artifactType should be "epic"

  # ─── Pre-flight: schema-conformance ────────────────────────────────────────

  @harness @schema
  Scenario: schema-conformance passes for valid artifact
    Given the harness schema validator is initialized
    When I evaluate "schema-conformance" as "pre-flight" with artifact:
      | type  | story             |
      | title | Valid Story       |
      | id    | S-1               |
    Then the policy should pass
    And the evaluation result failures should be empty

  @harness @schema
  Scenario: schema-conformance fails for invalid artifact
    Given the harness schema validator is initialized
    When I evaluate "schema-conformance" as "pre-flight" with artifact:
      | type  | story             |
      | title | Bad Story         |
      | id    | S-2               |
      | status| totally-invalid   |
    Then the policy should fail
    And the evaluation result failures should not be empty

  @harness @schema
  Scenario: schema-conformance auto-fixes on failure
    Given the harness schema validator is initialized
    And the repair engine can fix the artifact
    When I evaluate "schema-conformance" as "pre-flight" with a repairable artifact
    Then the evaluation result fixed should be true
    And the evaluation result fixedArtifact should be defined
    And the re-evaluated artifact should pass

  @harness @schema
  Scenario: schema-conformance handles missing artifact gracefully
    When I evaluate "schema-conformance" as "pre-flight" with null artifact
    Then the policy should fail
    And the failures should contain "No artifact data"

  # ─── Pre-flight: required-fields ───────────────────────────────────────────

  @harness @required
  Scenario: required-fields passes for complete story
    When I evaluate "required-fields" as "pre-flight" with story artifact containing:
      | title            | Login feature         |
      | userStory.iWant  | to authenticate       |
      | acceptanceCriteria | ["Must support OAuth"] |
    Then the policy should pass

  @harness @required
  Scenario: required-fields fails for story without title
    When I evaluate "required-fields" as "pre-flight" with story artifact containing:
      | userStory.iWant  | to authenticate       |
      | acceptanceCriteria | ["Must work"]         |
    Then the policy should fail
    And the failures should contain "title"

  @harness @required
  Scenario: required-fields fails for story without user story
    When I evaluate "required-fields" as "pre-flight" with story artifact containing:
      | title            | Login feature         |
      | acceptanceCriteria | ["Must work"]         |
    Then the policy should fail
    And the failures should contain "user story"

  @harness @required
  Scenario: required-fields fails for story without acceptance criteria
    When I evaluate "required-fields" as "pre-flight" with story artifact containing:
      | title            | Login feature         |
      | userStory.iWant  | to authenticate       |
    Then the policy should fail
    And the failures should contain "acceptance criterion"

  @wip
  @harness @required
  Scenario: required-fields only applies to story artifacts
    When I evaluate "required-fields" as "pre-flight" with epic artifact
    Then the evaluation result should be empty

  # ─── Post-flight: no-placeholders ──────────────────────────────────────────

  @harness @placeholder
  Scenario: no-placeholders passes for clean content
    When I evaluate "no-placeholders" as "post-flight" with artifact:
      | title | Complete Story     |
      | id    | S-3               |
    Then the policy should pass

  @harness @placeholder
  Scenario: no-placeholders warns about TODO
    When I evaluate "no-placeholders" as "post-flight" with artifact:
      | title | TODO: implement later |
      | id    | S-4                   |
    Then the policy should fail
    And the failures should contain "TODO"

  @harness @placeholder
  Scenario: no-placeholders warns about FIXME
    When I evaluate "no-placeholders" as "post-flight" with artifact:
      | title | FIXME: this is broken |
    Then the policy should fail
    And the failures should contain "FIXME"

  @harness @placeholder
  Scenario: no-placeholders warns about TBD
    When I evaluate "no-placeholders" as "post-flight" with artifact:
      | title | TBD: scope unknown    |
    Then the policy should fail
    And the failures should contain "TBD"

  @harness @placeholder
  Scenario: no-placeholders case-insensitive detection
    When I evaluate "no-placeholders" as "post-flight" with artifact:
      | title | fixme: case test       |
    Then the policy should fail
    And the failures should contain "fixme"

  # ─── Post-flight: token-budget ─────────────────────────────────────────────

  @harness @budget
  Scenario: token-budget passes when under capacity
    When I evaluate "token-budget" as "post-flight" with epic containing stories:
      | storyPoints |
      | 5           |
      | 3           |
      | 8           |
    Then the policy should pass

  @harness @budget
  Scenario: token-budget fails when over capacity
    When I evaluate "token-budget" as "post-flight" with epic containing stories:
      | storyPoints |
      | 13          |
      | 8           |
      | 5           |
    Then the policy should fail
    And the failures should contain "capacity"

  @harness @budget
  Scenario: token-budget passes for epic with no stories
    When I evaluate "token-budget" as "post-flight" with epic having no stories
    Then the policy should pass

  @harness @budget
  Scenario: token-budget only applies to epic artifacts
    When I evaluate "token-budget" as "post-flight" with story artifact
    Then the policy should not be evaluated

  # ─── Engine evaluate() ─────────────────────────────────────────────────────

  @harness @evaluate
  Scenario: evaluate returns results for all applicable policies
    Given a story artifact with missing title and TODO in content
    When I evaluate all pre-flight policies
    Then 2 evaluation results should be returned
    And one result should have policyId "required-fields"
    And one result should have policyId "schema-conformance"

  @harness @evaluate
  Scenario: evaluate filters by phase
    When I evaluate pre-flight policies
    Then the results should only include pre-flight policies
    When I evaluate post-flight policies
    Then the results should only include post-flight policies

  @wip
  @harness @evaluate
  Scenario: evaluate filters by artifactType
    When I evaluate pre-flight policies for artifactType "story"
    Then the results should include "required-fields" (artifactType: story)
    And the results should not include "schema-conformance" (no artifactType filter)
    And the results should not include "token-budget" (artifactType: epic)

  @harness @evaluate
  Scenario: evaluate records decisions to trace recorder
    Given the harness trace recorder is initialized
    When I evaluate all pre-flight policies for a failing story
    Then a harness "decision" trace entry should have been recorded
    And the trace entry agent should be "harness"

  # ─── User-defined Policies (Policy Loader) ─────────────────────────────────

  @harness @userpolicies
  Scenario: loadUserPolicies returns empty when no policies dir
    Given the artifact store has a source folder without a policies directory
    When I load user policies
    Then the harness result should be an empty array

  @harness @userpolicies
  Scenario: loadUserPolicies loads regex-based policies from YAML
    Given a policies directory with a "secret-check.yaml" containing:
      """
      policies:
        - id: no-secrets
          name: No Secrets in Content
          description: Content must not contain API keys
          type: post-flight
          severity: blocking
          artifactType: story
          regex:
            - sk-[a-zA-Z0-9]{20,}
            - AKIA[A-Z0-9]{16}
      """
    When I load user policies
    Then 1 policy should be loaded
    And the policy id should be "no-secrets"
    And the loaded policy type should be "post-flight"

  @harness @userpolicies
  Scenario: User policy regex evaluation catches secrets
    Given a user policy with regex "sk-[a-zA-Z0-9]{20,}"
    When I evaluate the user policy with artifact containing "sk-abc123def456ghi789jklmno"
    Then the policy should fail
    And the failures should contain "forbidden pattern"

  @harness @userpolicies
  Scenario: User policy regex evaluation passes for clean content
    Given a user policy with regex "sk-[a-zA-Z0-9]{20,}"
    When I evaluate the user policy with artifact containing "no secrets here"
    Then the policy should pass

  @harness @userpolicies
  Scenario: User policy without regex is skipped with warning
    Given a policies directory with a "llm-policy.yaml" containing:
      """
      policies:
        - id: llm-check
          name: LLM Check
          type: post-flight
          severity: advisory
      """
    When I load user policies
    Then 1 policy should be loaded
    And the policy evaluation should return null (LLM not supported)

  @harness @userpolicies
  Scenario: loadUserPolicies handles malformed YAML gracefully
    Given a policies directory with an invalid YAML file
    When I load user policies
    Then no harness error should be thrown
    And the harness result should be an empty array

  @harness @userpolicies
  Scenario: loadUserPolicies handles missing source folder gracefully
    Given the artifact store has no source folder
    When I load user policies
    Then the harness result should be an empty array

  # ─── Auto-fix ──────────────────────────────────────────────────────────────

  @harness @autofix
  Scenario: Auto-fix is attempted when policy has autoFix function
    Given the schema-conformance policy has an autoFix
    When I evaluate with a repairable artifact
    Then the auto-fix should have been attempted
    And if the fix succeeds, fixed should be true

  @harness @autofix
  Scenario: Auto-fix failure is non-fatal and logged
    Given the schema-conformance autoFix throws
    When I evaluate with a failing artifact
    Then the evaluation should still complete
    And the policy failures should still be reported

  # ─── registerPolicy ────────────────────────────────────────────────────────

  @harness @registration
  Scenario: registerPolicy adds policy to engine
    When I register a new custom policy
    Then the harness engine should have 7 registered policies
    And the new policy should be in the policies list

  @harness @registration
  Scenario: Built-in policies are auto-registered at module level
    Given a fresh harness engine
    Then the engine should have 6 policies (from builtInPolicies)
    And the policies should be auto-registered via the module-level loop
