# Minimal API contract for the external frontend SPA

Backend API base URL inside Docker: http://app:3001/api
Backend API base URL from outside Docker (local dev): http://localhost:31371/api

## Organizations
- **GET /api/organizations**
  - Headers: `Accept: application/json`
  - Query: `page` (number), `pageSize` (number), optional `search`, optional `status` (`active`|`inactive`|`all`)
  - Response: `{ "data": Organization[], "total": number, "page": number, "pageSize": number }`
  - Status: `200`, `500`

- **POST /api/organizations**
  - Headers: `Content-Type: application/json`
  - Body: `{ "name": string, "slug?": string, "phone?": string, "instructions?": string, "language?": string, "status?": "active"|"inactive", "contact_email?": string, "contact_phone?": string, "working_hours_start?": string, "working_hours_end?": string, "description?": string }`
  - Response: created organization row
  - Status: `201`, `400`, `409`, `500`

- **GET /api/organizations/:id**
  - Response: organization row or `{ "error": "Organization not found" }`
  - Status: `200`, `404`, `500`

- **PUT /api/organizations/:id**
  - Headers: `Content-Type: application/json`
  - Body: any subset of the POST fields
  - Response: updated organization row or `{ "error": "..." }`
  - Status: `200`, `400`, `404`, `409`, `500`

- **DELETE /api/organizations/:id**
  - Response: updated organization row with status `inactive`, or `{ "error": "Organization not found" }`
  - Status: `200`, `404`, `500`

## Bots
- **GET /api/organizations/:orgId/bots**
  - Response: `{ id, name, assistant_id, status }[]`
  - Status: `200`

- **POST /api/organizations/:orgId/bots**
  - Headers: `Content-Type: application/json`
  - Body: `{ "assistant_id": string, "name?": string, "phone?": string }`
  - Response: created bot row (same shape as GET)
  - Status: `200`, `500`

- **POST /api/bots/:botId/start**
  - Response: `{ "status": string }`
  - Status: `200`, `404`, `500`

- **POST /api/bots/:botId/stop**
  - Response: `{ "status": "stopped" }`
  - Status: `200`

- **GET /api/bots/:botId/status**
  - Response: `{ "status": string }`
  - Status: `200`

## Knowledge base uploads
- **POST /api/organizations/:id/upload**
  - Headers: `Content-Type: application/json`
  - Body: `{ "filePath": string }`
  - Response: `{ "ok": boolean, "message": string }`
  - Status: `200`, `4xx`, `5xx` (depends on validation)
