# API Reference — {project_name}

> Version: {version} | Base URL: `{base_url}`

## Authentication

{auth_description}

```bash
# Example authenticated request
curl -H "Authorization: Bearer {token}" {base_url}/endpoint
```

## Endpoints

### {resource_name}

#### {method} {path}

{endpoint_description}

**Parameters:**

| Name | In | Type | Required | Description |
|------|------|------|----------|-------------|
| {param_name} | {param_in} | {param_type} | {required} | {param_description} |

**Request Body:**

```json
{request_body_example}
```

**Response:**

`{status_code}` — {status_description}

```json
{response_body_example}
```

**Errors:**

| Status | Code | Description |
|--------|------|-------------|
| {error_status} | {error_code} | {error_description} |

## Error Handling

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description"
  }
}
```

## Rate Limiting

{rate_limit_description}
