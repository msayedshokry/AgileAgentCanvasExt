#!/usr/bin/env python3
"""
Fix all JSON templates to use the correct metadata schema format.

Transforms:
  - version -> schemaVersion
  - createdAt/updatedAt -> timestamps.created/lastModified
  - Removes additionalProperties not in schema
"""

import json
from pathlib import Path

BASE_PATH = Path(__file__).parent.parent

# All template files
TEMPLATE_PATTERNS = [
    "**/*.template.json",
    "**/template.json", 
    "**/*-template.json"
]

def get_all_templates():
    """Find all template files."""
    templates = set()
    for pattern in TEMPLATE_PATTERNS:
        for f in BASE_PATH.glob(pattern):
            # Skip test_output
            if "test_output" not in str(f):
                templates.add(f)
    return sorted(templates)

def fix_metadata(template: dict) -> dict:
    """Transform metadata to match common/metadata.schema.json"""
    old_meta = template.get("metadata", {})
    
    new_meta = {
        "schemaVersion": old_meta.get("version", "1.0.0"),
        "artifactType": old_meta.get("artifactType", ""),
        "workflowName": old_meta.get("workflowName", ""),
        "projectName": old_meta.get("projectName", "{{project_name}}"),
        "stepsCompleted": old_meta.get("stepsCompleted", []),
        "currentStep": old_meta.get("currentStep", ""),
        "timestamps": {
            "created": old_meta.get("createdAt", "{{timestamp}}"),
            "lastModified": old_meta.get("updatedAt", "{{timestamp}}")
        },
        "author": old_meta.get("author", "{{user_name}}"),
        "status": old_meta.get("status", "draft")
    }
    
    template["metadata"] = new_meta
    return template

def main():
    templates = get_all_templates()
    print(f"Found {len(templates)} templates to fix\n")
    
    fixed = 0
    for template_path in templates:
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                template = json.load(f)
            
            # Check if already fixed (has schemaVersion)
            if "schemaVersion" in template.get("metadata", {}):
                print(f"[SKIP] {template_path.relative_to(BASE_PATH)} - already fixed")
                continue
            
            # Fix the metadata
            fixed_template = fix_metadata(template)
            
            # Write back
            with open(template_path, 'w', encoding='utf-8') as f:
                json.dump(fixed_template, f, indent=2)
                f.write('\n')  # Trailing newline
            
            print(f"[FIXED] {template_path.relative_to(BASE_PATH)}")
            fixed += 1
            
        except Exception as e:
            print(f"[ERROR] {template_path.relative_to(BASE_PATH)}: {e}")
    
    print(f"\nFixed {fixed} templates")

if __name__ == "__main__":
    main()
