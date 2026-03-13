Feature: Schema Validator - Artifact Data Validation
  As an AgileAgentCanvas developer
  I want to validate artifact data against BMAD JSON schemas
  So that LLM-generated changes are caught before corrupting the store

  Background:
    Given a fresh schema validator

  # ─── Initialization ──────────────────────────────────────────────────

  @schema @initialization
  Scenario: Initialize with valid schemas directory
    When I initialize the schema validator with the real BMAD schemas path
    Then the schema validator should be initialized
    And the schema validator should have relaxed validators
    And the schema validator should have no schema load errors
    And the relaxed validator build warnings should only be for known problematic schemas

  @schema @initialization
  Scenario: Initialize is idempotent
    When I initialize the schema validator with the real BMAD schemas path
    And I initialize the schema validator with the real BMAD schemas path again
    Then the schema validator should be initialized
    And the initialization count should be 1

  @schema @initialization
  Scenario: Initialize with missing schemas directory
    When I initialize the schema validator with a non-existent path
    Then the schema validator should not be initialized

  @schema @initialization
  Scenario: getSupportedTypes returns all mapped types
    When I initialize the schema validator with the real BMAD schemas path
    Then getSupportedTypes should return all mapped artifact types
    And getSupportedTypes should include "story"
    And getSupportedTypes should include "vision"
    And getSupportedTypes should include "prd"
    And getSupportedTypes should include "architecture"
    And getSupportedTypes should include "test-design"
    And getSupportedTypes should include "ci-pipeline"
    And getSupportedTypes should include "design-thinking"

  # ─── validateChanges — passthrough for unknown types ─────────────────

  @schema @validateChanges @passthrough
  Scenario: validateChanges returns valid for unknown artifact type
    Given the schema validator is initialized
    When I validate changes for type "unknown-type" with:
      | field | value        |
      | foo   | bar          |
    Then the validation result should be valid
    And the validation errors should be empty

  @schema @validateChanges @passthrough
  Scenario: validateChanges returns valid when validator is not initialized
    When I validate changes for type "story" with:
      | field | value        |
      | title | Test Story   |
    Then the validation result should be valid

  # ─── validateChanges — correct data ─────────────────────────────────

  @schema @validateChanges @valid
  Scenario: validateChanges accepts valid story title change
    Given the schema validator is initialized
    When I validate changes for type "story" with:
      | field  | value        |
      | title  | My Story     |
    Then the validation result should be valid

  @schema @validateChanges @valid
  Scenario: validateChanges accepts valid story status enum
    Given the schema validator is initialized
    When I validate changes for type "story" with:
      | field  | value   |
      | status | draft   |
    Then the validation result should be valid

  @schema @validateChanges @valid
  Scenario: validateChanges accepts valid product-brief fields
    Given the schema validator is initialized
    When I validate changes for type "product-brief" with:
      | field       | value              |
      | productName | My Product         |
      | status      | draft              |
    Then the validation result should be valid

  @schema @validateChanges @valid
  Scenario: validateChanges accepts alias type "vision"
    Given the schema validator is initialized
    When I validate changes for type "vision" with:
      | field       | value              |
      | productName | My Vision Product  |
    Then the validation result should be valid

  @schema @validateChanges @valid
  Scenario: validateChanges allows partial data (no required fields enforced)
    Given the schema validator is initialized
    When I validate changes for type "story" with:
      | field          | value       |
      | technicalNotes | Some notes  |
    Then the validation result should be valid

  @schema @validateChanges @valid
  Scenario: validateChanges accepts integer storyPoints
    Given the schema validator is initialized
    When I validate changes for type "story" with integer field "storyPoints" value 5
    Then the validation result should be valid

  # ─── validateChanges — type mismatches ──────────────────────────────

  @schema @validateChanges @invalid
  Scenario: validateChanges catches invalid status enum value
    Given the schema validator is initialized
    When I validate changes for type "story" with:
      | field  | value             |
      | status | totally-not-valid |
    Then the validation result should be invalid
    And the validation errors should not be empty

  @schema @validateChanges @invalid
  Scenario: validateChanges catches wrong type for storyPoints
    Given the schema validator is initialized
    When I validate changes for type "story" with:
      | field       | value          |
      | storyPoints | not-a-number   |
    Then the validation result should be invalid
    And the validation errors should mention "storyPoints"

  @schema @validateChanges @invalid
  Scenario: validateChanges catches invalid product-brief status enum
    Given the schema validator is initialized
    When I validate changes for type "product-brief" with:
      | field  | value   |
      | status | invalid |
    Then the validation result should be invalid

  # ─── validateChanges — metadata flattening ──────────────────────────

  @schema @validateChanges @metadata
  Scenario: validateChanges flattens metadata into top-level
    Given the schema validator is initialized
    When I validate changes for type "story" with nested metadata:
      | metadataField | metadataValue | contentField | contentValue |
      | version       | 1.0.0         | title        | Test Story   |
    Then the validation result should be valid

  # ─── validate (strict mode) ────────────────────────────────────────

  @schema @validate @strict
  Scenario: validate strict mode rejects incomplete data
    Given the schema validator is initialized
    When I strictly validate type "product-brief" with:
      | field       | value      |
      | productName | Test       |
    Then the strict validation result should be invalid

  @schema @validate @strict
  Scenario: validate returns valid for unknown type
    Given the schema validator is initialized
    When I strictly validate type "unknown-type" with:
      | field | value |
      | foo   | bar   |
    Then the strict validation result should be valid

  # ─── Error formatting ──────────────────────────────────────────────

  @schema @errors
  Scenario: Error count is capped at 10
    Given the schema validator is initialized
    When I validate changes with many type errors for "story"
    Then the validation errors should have at most 11 entries
