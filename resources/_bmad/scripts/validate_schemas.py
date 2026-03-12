#!/usr/bin/env python3
"""
BMAD Dual Output System - Static Validation Script

Validates:
1. JSON Schema syntax (27 schema files)
2. JSON Template syntax (21 template files)
3. Template-Schema alignment
4. Schema $ref cross-references
5. Workflow configuration (20 workflows)
6. Schema index registry

Usage:
    python validate_schemas.py [--verbose]
"""

import json
import os
import re
import sys
from pathlib import Path
from typing import Any

try:
    from jsonschema import Draft7Validator
    from jsonschema.exceptions import SchemaError
    HAS_JSONSCHEMA = True
except ImportError:
    HAS_JSONSCHEMA = False
    print("WARNING: jsonschema not installed. Run: pip install jsonschema")

# ANSI colors for terminal output
class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    CYAN = '\033[96m'
    BOLD = '\033[1m'
    END = '\033[0m'

def ok(msg: str) -> str:
    return f"{Colors.GREEN}[PASS]{Colors.END} {msg}"

def fail(msg: str) -> str:
    return f"{Colors.RED}[FAIL]{Colors.END} {msg}"

def warn(msg: str) -> str:
    return f"{Colors.YELLOW}[WARN]{Colors.END} {msg}"

def info(msg: str) -> str:
    return f"{Colors.CYAN}[INFO]{Colors.END} {msg}"

def header(msg: str) -> str:
    return f"\n{Colors.BOLD}{'='*60}\n{msg}\n{'='*60}{Colors.END}"


class ValidationResult:
    """Stores validation results for reporting"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.warnings = 0
        self.issues: list[dict] = []
    
    def add_pass(self):
        self.passed += 1
    
    def add_fail(self, file: str, issue: str, fix_hint: str = ""):
        self.failed += 1
        self.issues.append({"file": file, "issue": issue, "fix_hint": fix_hint, "severity": "error"})
    
    def add_warning(self, file: str, issue: str, fix_hint: str = ""):
        self.warnings += 1
        self.issues.append({"file": file, "issue": issue, "fix_hint": fix_hint, "severity": "warning"})


class BMADValidator:
    """Main validator class for BMAD dual output system"""
    
    def __init__(self, base_path: Path, verbose: bool = False):
        self.base_path = base_path
        self.schemas_path = base_path / "schemas"
        self.verbose = verbose
        self.results = ValidationResult()
        
        # Caches
        self.loaded_schemas: dict[str, Any] = {}
        self.loaded_templates: dict[str, Any] = {}
    
    def log(self, msg: str):
        """Print verbose logs"""
        if self.verbose:
            print(msg)
    
    def load_json(self, path: Path) -> tuple[Any | None, str | None]:
        """Load and parse a JSON file, return (data, error)"""
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f), None
        except json.JSONDecodeError as e:
            return None, f"JSON parse error at line {e.lineno}, col {e.colno}: {e.msg}"
        except FileNotFoundError:
            return None, f"File not found: {path}"
        except Exception as e:
            return None, str(e)
    
    # =========================================================================
    # 1. JSON SCHEMA VALIDATION
    # =========================================================================
    
    def validate_all_schemas(self) -> None:
        """Validate all JSON Schema files"""
        print(header("1. JSON SCHEMA VALIDATION"))
        
        schema_files = list(self.schemas_path.rglob("*.schema.json"))
        print(info(f"Found {len(schema_files)} schema files"))
        
        for schema_file in sorted(schema_files):
            self.validate_schema_file(schema_file)
    
    def validate_schema_file(self, path: Path) -> bool:
        """Validate a single schema file"""
        rel_path = path.relative_to(self.base_path)
        
        # 1. Load JSON
        data, error = self.load_json(path)
        if error:
            print(fail(f"{rel_path}: {error}"))
            self.results.add_fail(str(rel_path), error, "Fix JSON syntax")
            return False
        
        self.loaded_schemas[str(path)] = data
        
        # 2. Check required schema fields
        issues = []
        
        if data.get("$schema") != "http://json-schema.org/draft-07/schema#":
            issues.append("Missing or incorrect $schema (expected draft-07)")
        
        if not data.get("$id"):
            issues.append("Missing $id field")
        
        if not data.get("title"):
            issues.append("Missing title field")
        
        # 3. Validate as JSON Schema (if jsonschema available)
        if HAS_JSONSCHEMA:
            try:
                Draft7Validator.check_schema(data)
            except SchemaError as e:
                issues.append(f"Invalid JSON Schema: {e.message}")
        
        # 4. Check $ref paths
        ref_issues = self.check_refs_in_schema(data, path)
        issues.extend(ref_issues)
        
        if issues:
            for issue in issues:
                print(fail(f"{rel_path}: {issue}"))
                self.results.add_fail(str(rel_path), issue)
            return False
        else:
            print(ok(f"{rel_path}"))
            self.results.add_pass()
            return True
    
    def check_refs_in_schema(self, data: Any, schema_path: Path, path_prefix: str = "") -> list[str]:
        """Recursively check all $ref paths in a schema"""
        issues = []
        
        if isinstance(data, dict):
            if "$ref" in data:
                ref = data["$ref"]
                # Check if it's a file reference (not internal #/definitions/...)
                if not ref.startswith("#"):
                    ref_path = (schema_path.parent / ref).resolve()
                    if not ref_path.exists():
                        issues.append(f"$ref not found: {ref} (resolved: {ref_path})")
            
            for key, value in data.items():
                issues.extend(self.check_refs_in_schema(value, schema_path, f"{path_prefix}.{key}"))
        
        elif isinstance(data, list):
            for i, item in enumerate(data):
                issues.extend(self.check_refs_in_schema(item, schema_path, f"{path_prefix}[{i}]"))
        
        return issues
    
    # =========================================================================
    # 2. JSON TEMPLATE VALIDATION
    # =========================================================================
    
    def validate_all_templates(self) -> None:
        """Validate all JSON template files"""
        print(header("2. JSON TEMPLATE VALIDATION"))
        
        # Find templates with different naming patterns
        templates = []
        for pattern in ["**/*.template.json", "**/template.json", "**/*-template.json"]:
            templates.extend(self.base_path.glob(pattern))
        
        # Deduplicate
        templates = list(set(templates))
        print(info(f"Found {len(templates)} template files"))
        
        for template_file in sorted(templates):
            self.validate_template_file(template_file)
    
    def validate_template_file(self, path: Path) -> bool:
        """Validate a single template file"""
        rel_path = path.relative_to(self.base_path)
        
        # 1. Load JSON
        data, error = self.load_json(path)
        if error:
            print(fail(f"{rel_path}: {error}"))
            self.results.add_fail(str(rel_path), error, "Fix JSON syntax")
            return False
        
        self.loaded_templates[str(path)] = data
        
        issues = []
        
        # 2. Check structure
        if not isinstance(data, dict):
            issues.append("Template must be a JSON object")
        else:
            # Check for metadata
            if "metadata" not in data:
                issues.append("Missing 'metadata' object")
            else:
                metadata = data["metadata"]
                # Check required metadata fields per metadata.schema.json
                if "artifactType" not in metadata and "workflowName" not in metadata:
                    issues.append("metadata missing 'artifactType' or 'workflowName'")
            
            # Check for content
            if "content" not in data:
                issues.append("Missing 'content' object")
            
            # Check $schema reference
            if "$schema" in data:
                schema_ref = data["$schema"]
                schema_path = (path.parent / schema_ref).resolve()
                if not schema_path.exists():
                    issues.append(f"$schema reference not found: {schema_ref}")
        
        if issues:
            for issue in issues:
                print(fail(f"{rel_path}: {issue}"))
                self.results.add_fail(str(rel_path), issue)
            return False
        else:
            print(ok(f"{rel_path}"))
            self.results.add_pass()
            return True
    
    # =========================================================================
    # 3. TEMPLATE-SCHEMA ALIGNMENT
    # =========================================================================
    
    def validate_template_schema_alignment(self) -> None:
        """Check that templates align with their schemas"""
        print(header("3. TEMPLATE-SCHEMA ALIGNMENT"))
        
        for template_path_str, template_data in self.loaded_templates.items():
            template_path = Path(template_path_str)
            rel_path = template_path.relative_to(self.base_path)
            
            if not isinstance(template_data, dict) or "$schema" not in template_data:
                print(warn(f"{rel_path}: No $schema reference, skipping alignment check"))
                self.results.add_warning(str(rel_path), "No $schema reference")
                continue
            
            # Resolve schema path
            schema_ref = template_data["$schema"]
            schema_path = (template_path.parent / schema_ref).resolve()
            
            if str(schema_path) not in self.loaded_schemas:
                # Try to load it
                schema_data, error = self.load_json(schema_path)
                if error:
                    print(fail(f"{rel_path}: Cannot load schema {schema_ref}"))
                    self.results.add_fail(str(rel_path), f"Schema not loadable: {schema_ref}")
                    continue
                self.loaded_schemas[str(schema_path)] = schema_data
            
            schema_data = self.loaded_schemas[str(schema_path)]
            
            # Check alignment
            issues = self.check_alignment(template_data, schema_data, template_path)
            
            if issues:
                for issue in issues:
                    print(fail(f"{rel_path}: {issue}"))
                    self.results.add_fail(str(rel_path), issue)
            else:
                print(ok(f"{rel_path} aligns with schema"))
                self.results.add_pass()
    
    def check_alignment(self, template: dict, schema: dict, template_path: Path) -> list[str]:
        """Check if template content aligns with schema content definition"""
        issues = []
        
        # Get schema content properties
        schema_content = schema.get("properties", {}).get("content", {})
        schema_content_props = schema_content.get("properties", {})
        schema_required = schema_content.get("required", [])
        
        # Get template content
        template_content = template.get("content", {})
        
        if not schema_content_props:
            return issues  # Can't validate without schema properties
        
        # Check required fields exist in template
        for req_field in schema_required:
            if req_field not in template_content:
                # Check for known field name variations
                if req_field == "story" and "userStory" in template_content:
                    issues.append(f"Field mismatch: template uses 'userStory' but schema expects 'story'")
                else:
                    issues.append(f"Missing required field in template content: '{req_field}'")
        
        # Check metadata schema alignment
        metadata_issues = self.check_metadata_alignment(template.get("metadata", {}))
        issues.extend(metadata_issues)
        
        return issues
    
    def check_metadata_alignment(self, metadata: dict) -> list[str]:
        """Check if metadata follows common/metadata.schema.json structure"""
        issues = []
        
        # Required fields per metadata.schema.json
        required_fields = ["schemaVersion", "artifactType", "timestamps"]
        for field in required_fields:
            if field not in metadata:
                issues.append(f"Metadata missing required field: '{field}'")
        
        # Check timestamps structure
        if "timestamps" in metadata:
            ts = metadata["timestamps"]
            if not isinstance(ts, dict):
                issues.append("metadata.timestamps must be an object")
            elif "created" not in ts:
                issues.append("metadata.timestamps missing 'created' field")
        
        # Check for old-style fields that shouldn't be there
        old_fields = ["version", "createdAt", "updatedAt"]
        for field in old_fields:
            if field in metadata:
                issues.append(f"Metadata uses deprecated field '{field}' - should use new schema format")
        
        return issues
    
    # =========================================================================
    # 4. WORKFLOW CONFIGURATION VALIDATION
    # =========================================================================
    
    def validate_workflow_configs(self) -> None:
        """Validate workflow configurations with output_format: dual"""
        print(header("4. WORKFLOW CONFIGURATION VALIDATION"))
        
        # Find all workflow.yaml and workflow.md files
        workflow_files = list(self.base_path.rglob("workflow.yaml"))
        workflow_files.extend(self.base_path.rglob("workflow.md"))
        
        dual_workflows = []
        
        for wf_path in workflow_files:
            content = wf_path.read_text(encoding='utf-8')
            if "output_format:" in content and "dual" in content:
                dual_workflows.append(wf_path)
        
        print(info(f"Found {len(dual_workflows)} workflows with output_format: dual"))
        
        for wf_path in sorted(dual_workflows):
            self.validate_workflow_config(wf_path)
    
    def validate_workflow_config(self, path: Path) -> bool:
        """Validate a single workflow configuration"""
        rel_path = path.relative_to(self.base_path)
        content = path.read_text(encoding='utf-8')
        
        issues = []
        
        # Extract YAML content (from .yaml or frontmatter in .md)
        if path.suffix == ".md":
            # Extract frontmatter
            match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
            if match:
                yaml_content = match.group(1)
            else:
                issues.append("No YAML frontmatter found in workflow.md")
                yaml_content = ""
        else:
            yaml_content = content
        
        # Check for schema_file
        schema_match = re.search(r'schema_file:\s*["\']?([^"\'\n]+)', yaml_content)
        if not schema_match:
            issues.append("Missing schema_file configuration")
        else:
            schema_path = schema_match.group(1).strip()
            # Check if path contains unresolved variables (ok, will be resolved at runtime)
            if "{project-root}" not in schema_path and "{" not in schema_path:
                # Try to resolve relative to workflow
                resolved = (path.parent / schema_path).resolve()
                if not resolved.exists():
                    issues.append(f"schema_file not found: {schema_path}")
        
        # Check for template_json
        template_match = re.search(r'template_json:\s*["\']?([^"\'\n]+)', yaml_content)
        if not template_match:
            issues.append("Missing template_json configuration")
        else:
            template_path = template_match.group(1).strip()
            # Handle {installed_path} - resolve relative to workflow dir
            if "{installed_path}" in template_path:
                template_path = template_path.replace("{installed_path}/", "").replace("{installed_path}", "")
                resolved = (path.parent / template_path).resolve()
            elif "./" in template_path:
                resolved = (path.parent / template_path.replace("./", "")).resolve()
            elif "{" not in template_path:
                resolved = (path.parent / template_path).resolve()
            else:
                resolved = None
            
            if resolved and not resolved.exists():
                issues.append(f"template_json not found: {template_path} (resolved: {resolved})")
        
        if issues:
            for issue in issues:
                print(fail(f"{rel_path}: {issue}"))
                self.results.add_fail(str(rel_path), issue)
            return False
        else:
            print(ok(f"{rel_path}"))
            self.results.add_pass()
            return True
    
    # =========================================================================
    # 5. INDEX REGISTRY VALIDATION
    # =========================================================================
    
    def validate_index_registry(self) -> None:
        """Validate the schema index registry"""
        print(header("5. SCHEMA INDEX REGISTRY VALIDATION"))
        
        index_path = self.schemas_path / "index.json"
        
        if not index_path.exists():
            print(fail("schemas/index.json not found"))
            self.results.add_fail("schemas/index.json", "Index file missing")
            return
        
        data, error = self.load_json(index_path)
        if error:
            print(fail(f"schemas/index.json: {error}"))
            self.results.add_fail("schemas/index.json", error)
            return
        
        # Get all actual schema files
        actual_schemas = set()
        for schema_file in self.schemas_path.rglob("*.schema.json"):
            rel = schema_file.relative_to(self.schemas_path)
            actual_schemas.add(str(rel).replace("\\", "/"))
        
        # Get indexed schemas
        indexed_schemas = set()
        schemas_section = data.get("schemas", {})
        
        for module, schemas in schemas_section.items():
            for schema_name, schema_info in schemas.items():
                path = schema_info.get("path", "")
                indexed_schemas.add(path)
        
        # Find orphans (exist but not indexed)
        orphans = actual_schemas - indexed_schemas
        if orphans:
            for orphan in sorted(orphans):
                print(warn(f"Schema not in index: {orphan}"))
                self.results.add_warning("schemas/index.json", f"Orphan schema: {orphan}")
        
        # Find missing (indexed but don't exist)
        missing = indexed_schemas - actual_schemas
        if missing:
            for m in sorted(missing):
                print(fail(f"Indexed but missing: {m}"))
                self.results.add_fail("schemas/index.json", f"Missing schema file: {m}")
        
        if not orphans and not missing:
            print(ok("schemas/index.json - all schemas indexed correctly"))
            self.results.add_pass()
    
    # =========================================================================
    # MAIN VALIDATION RUNNER
    # =========================================================================
    
    def run_all(self) -> ValidationResult:
        """Run all validations"""
        print(f"\n{Colors.BOLD}BMAD Dual Output System - Static Validation{Colors.END}")
        print(f"Base path: {self.base_path}\n")
        
        self.validate_all_schemas()
        self.validate_all_templates()
        self.validate_template_schema_alignment()
        self.validate_workflow_configs()
        self.validate_index_registry()
        
        # Summary
        print(header("VALIDATION SUMMARY"))
        print(f"  {Colors.GREEN}Passed:{Colors.END} {self.results.passed}")
        print(f"  {Colors.RED}Failed:{Colors.END} {self.results.failed}")
        print(f"  {Colors.YELLOW}Warnings:{Colors.END} {self.results.warnings}")
        
        if self.results.issues:
            print(f"\n{Colors.BOLD}Issues Found:{Colors.END}")
            for i, issue in enumerate(self.results.issues, 1):
                severity_color = Colors.RED if issue["severity"] == "error" else Colors.YELLOW
                print(f"  {i}. [{severity_color}{issue['severity'].upper()}{Colors.END}] {issue['file']}")
                print(f"     {issue['issue']}")
                if issue.get("fix_hint"):
                    print(f"     Fix: {issue['fix_hint']}")
        
        return self.results


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description="BMAD Schema Validation")
    parser.add_argument("--verbose", "-v", action="store_true", help="Verbose output")
    parser.add_argument("--base-path", "-p", type=str, help="Base path to _bmad folder")
    args = parser.parse_args()
    
    # Determine base path
    if args.base_path:
        base_path = Path(args.base_path)
    else:
        # Default: assume script is in _bmad/scripts/
        base_path = Path(__file__).parent.parent
    
    if not base_path.exists():
        print(f"Error: Base path not found: {base_path}")
        sys.exit(1)
    
    if not (base_path / "schemas").exists():
        print(f"Error: schemas/ folder not found in {base_path}")
        sys.exit(1)
    
    validator = BMADValidator(base_path, verbose=args.verbose)
    results = validator.run_all()
    
    # Exit code based on results
    sys.exit(0 if results.failed == 0 else 1)


if __name__ == "__main__":
    main()
