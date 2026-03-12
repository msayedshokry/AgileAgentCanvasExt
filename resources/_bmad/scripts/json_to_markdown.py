#!/usr/bin/env python3
"""
BMAD JSON to Markdown Renderer

Converts JSON artifacts to human-readable Markdown with:
- Proper YAML frontmatter formatting
- Intelligent content rendering based on data types
- Clean heading capitalization
- Card-style rendering for complex objects in arrays

Usage:
    from json_to_markdown import render_artifact
    markdown = render_artifact(json_data)
"""

import re
from datetime import datetime
from typing import Any


def camel_to_title(name: str) -> str:
    """Convert camelCase or snake_case to Title Case.
    
    Examples:
        researchType -> Research Type
        user_name -> User Name
        projectInfo -> Project Info
    """
    # Handle snake_case
    name = name.replace("_", " ")
    # Handle camelCase - insert space before capitals
    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', name)
    # Title case
    return name.title()


def format_yaml_value(value: Any, indent: int = 0) -> str:
    """Format a value for YAML frontmatter with proper indentation."""
    prefix = "  " * indent
    
    if value is None or value == "":
        return ""
    elif isinstance(value, bool):
        return "true" if value else "false"
    elif isinstance(value, (int, float)):
        return str(value)
    elif isinstance(value, str):
        # Quote strings with special characters
        if any(c in value for c in [':', '#', '{', '}', '[', ']', ',', '&', '*', '?', '|', '-', '<', '>', '=', '!', '%', '@', '`']):
            return f'"{value}"'
        return value
    elif isinstance(value, list):
        if not value:
            return "[]"
        lines = []
        for item in value:
            if isinstance(item, dict):
                # Complex object in list
                lines.append(f"{prefix}-")
                for k, v in item.items():
                    formatted = format_yaml_value(v, indent + 2)
                    lines.append(f"{prefix}  {k}: {formatted}")
            else:
                lines.append(f"{prefix}- {format_yaml_value(item)}")
        return "\n" + "\n".join(lines)
    elif isinstance(value, dict):
        if not value:
            return "{}"
        lines = []
        for k, v in value.items():
            formatted = format_yaml_value(v, indent + 1)
            if "\n" in formatted:
                lines.append(f"{prefix}{k}:{formatted}")
            else:
                lines.append(f"{prefix}{k}: {formatted}")
        return "\n" + "\n".join(lines)
    else:
        return str(value)


def render_frontmatter(metadata: dict) -> str:
    """Render metadata as YAML frontmatter."""
    lines = ["---"]
    
    # Order keys for consistent output
    key_order = [
        "schemaVersion", "artifactType", "workflowName", "projectName",
        "status", "author", "timestamps", "stepsCompleted", "currentStep",
        "inputDocuments", "tags"
    ]
    
    # Render ordered keys first
    rendered_keys = set()
    for key in key_order:
        if key in metadata:
            value = metadata[key]
            # Skip empty values
            if value is None or value == "" or value == []:
                continue
            rendered_keys.add(key)
            formatted = format_yaml_value(value)
            if "\n" in formatted:
                lines.append(f"{key}:{formatted}")
            else:
                lines.append(f"{key}: {formatted}")
    
    # Render any remaining keys
    for key, value in metadata.items():
        if key not in rendered_keys:
            if value is None or value == "" or value == []:
                continue
            formatted = format_yaml_value(value)
            if "\n" in formatted:
                lines.append(f"{key}:{formatted}")
            else:
                lines.append(f"{key}: {formatted}")
    
    lines.append("---")
    return "\n".join(lines)


def render_value(value: Any, level: int = 0) -> list[str]:
    """Render a value as Markdown lines."""
    lines = []
    
    if value is None or value == "":
        return lines
    
    if isinstance(value, str):
        lines.append(value)
        lines.append("")
    
    elif isinstance(value, bool):
        lines.append("Yes" if value else "No")
        lines.append("")
    
    elif isinstance(value, (int, float)):
        lines.append(str(value))
        lines.append("")
    
    elif isinstance(value, list):
        if not value:
            return lines
        
        # Check if it's a list of simple items or complex objects
        if all(isinstance(item, str) for item in value):
            # Simple string list
            for item in value:
                lines.append(f"- {item}")
            lines.append("")
        
        elif all(isinstance(item, dict) for item in value):
            # List of objects - render as cards
            for i, item in enumerate(value):
                lines.extend(render_object_as_card(item, i + 1))
        
        else:
            # Mixed list
            for item in value:
                if isinstance(item, dict):
                    lines.extend(render_object_as_card(item))
                else:
                    lines.append(f"- {item}")
            lines.append("")
    
    elif isinstance(value, dict):
        lines.extend(render_object(value, level))
    
    return lines


def render_object_as_card(obj: dict, index: int = None) -> list[str]:
    """Render a dict as a card-style block."""
    lines = []
    
    # Try to find a title field
    title_fields = ["title", "name", "finding", "recommendation", "criterion", "category", "id"]
    title = None
    for field in title_fields:
        if field in obj and obj[field]:
            title = obj[field]
            break
    
    if index and title:
        lines.append(f"### {index}. {title}")
    elif title:
        lines.append(f"### {title}")
    elif index:
        lines.append(f"### Item {index}")
    
    lines.append("")
    
    # Render fields as a definition list style
    for key, value in obj.items():
        if key in title_fields and value == title:
            continue  # Skip title field, already used as heading
        
        label = camel_to_title(key)
        
        if isinstance(value, list):
            if value and all(isinstance(v, str) for v in value):
                lines.append(f"**{label}:**")
                for item in value:
                    lines.append(f"  - {item}")
            elif value:
                lines.append(f"**{label}:** {', '.join(str(v) for v in value)}")
        elif isinstance(value, dict):
            lines.append(f"**{label}:**")
            for k, v in value.items():
                lines.append(f"  - {camel_to_title(k)}: {v}")
        elif value is not None and value != "":
            lines.append(f"**{label}:** {value}")
    
    lines.append("")
    return lines


def render_object(obj: dict, level: int = 2) -> list[str]:
    """Render a dict as nested sections."""
    lines = []
    
    for key, value in obj.items():
        if value is None or value == "" or value == [] or value == {}:
            continue
        
        heading = camel_to_title(key)
        heading_prefix = "#" * min(level + 1, 6)
        
        if isinstance(value, str):
            lines.append(f"{heading_prefix} {heading}")
            lines.append("")
            lines.append(value)
            lines.append("")
        
        elif isinstance(value, (int, float, bool)):
            lines.append(f"{heading_prefix} {heading}")
            lines.append("")
            lines.append(str(value) if not isinstance(value, bool) else ("Yes" if value else "No"))
            lines.append("")
        
        elif isinstance(value, list):
            lines.append(f"{heading_prefix} {heading}")
            lines.append("")
            lines.extend(render_value(value, level + 1))
        
        elif isinstance(value, dict):
            # Check if it's a simple key-value object or nested structure
            has_nested = any(isinstance(v, (dict, list)) for v in value.values())
            
            if has_nested:
                lines.append(f"{heading_prefix} {heading}")
                lines.append("")
                lines.extend(render_object(value, level + 1))
            else:
                # Simple object - render as definition list
                lines.append(f"{heading_prefix} {heading}")
                lines.append("")
                for k, v in value.items():
                    if v is not None and v != "":
                        lines.append(f"- **{camel_to_title(k)}:** {v}")
                lines.append("")
    
    return lines


def render_artifact(data: dict) -> str:
    """Convert a JSON artifact to Markdown.
    
    Args:
        data: JSON artifact with 'metadata' and 'content' sections
        
    Returns:
        Formatted Markdown string
    """
    lines = []
    
    metadata = data.get("metadata", {})
    content = data.get("content", {})
    
    # Frontmatter
    lines.append(render_frontmatter(metadata))
    lines.append("")
    
    # Title
    artifact_type = metadata.get("artifactType", "Artifact")
    project_name = metadata.get("projectName", "")
    
    if project_name:
        lines.append(f"# {camel_to_title(artifact_type)}: {project_name}")
    else:
        lines.append(f"# {camel_to_title(artifact_type)}")
    lines.append("")
    
    # Content
    lines.extend(render_object(content, level=1))
    
    # Footer
    lines.append("---")
    
    # Generated timestamp
    timestamps = metadata.get("timestamps", {})
    last_modified = timestamps.get("lastModified") or timestamps.get("created")
    if last_modified:
        # Format nicely if it's an ISO timestamp
        try:
            dt = datetime.fromisoformat(last_modified.replace("Z", "+00:00"))
            formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
        except (ValueError, AttributeError):
            formatted = last_modified
        lines.append(f"*Generated: {formatted}*")
    else:
        lines.append(f"*Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*")
    
    return "\n".join(lines)


# Standalone test
if __name__ == "__main__":
    import json
    import sys
    
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            data = json.load(f)
        print(render_artifact(data))
    else:
        # Demo with sample data
        sample = {
            "metadata": {
                "schemaVersion": "1.0.0",
                "artifactType": "research",
                "workflowName": "research",
                "projectName": "Demo Project",
                "status": "completed",
                "author": "Test User",
                "timestamps": {
                    "created": "2026-02-16T10:00:00",
                    "lastModified": "2026-02-16T12:30:00"
                },
                "stepsCompleted": ["init", "research", "synthesis"]
            },
            "content": {
                "researchType": "market",
                "topic": "AI Assistants Market",
                "findings": [
                    {
                        "category": "Market Size",
                        "finding": "Market valued at $5B",
                        "confidence": "high",
                        "implications": ["Large opportunity", "Growing fast"]
                    },
                    {
                        "category": "Competition",
                        "finding": "5 major players dominate",
                        "confidence": "medium",
                        "implications": ["High barriers", "Need differentiation"]
                    }
                ],
                "recommendations": [
                    {
                        "recommendation": "Focus on enterprise",
                        "priority": "high",
                        "rationale": "Higher margins"
                    }
                ],
                "synthesis": "Strong market opportunity with room for new entrants."
            }
        }
        print(render_artifact(sample))
