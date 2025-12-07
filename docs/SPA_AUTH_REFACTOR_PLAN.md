# SPA Authentication Refactor Plan

## Background & Problem Summary
The current backend couples authentication to legacy EJS pages via Express sessions and CSRF, redirecting unauthenticated traffic to `/login` and expecting session-backed role checks. The SPA frontend issues stateless API calls without sessions, triggering 302 redirects and 403/401 errors. Mixed HTML and JSON responses further complicate integration, and CSRF/session assumptions bleed into `/api` routes.

## Detailed Technical Risks
- Global session + CSRF middleware block API calls lacking cookies/tokens.
- `requireLogin` redirects instead of returning JSON, breaking XHR clients.
- Role/org/bot checks (`requireAdmin`, `requireEditor`, `requireOrgAccess`, `requireBotAccess`) rely solely on `req.session.*` and emit HTML/text responses.
- Legacy handlers reuse redirects for success/failure even when mounted under `/api`.
- No API-native login/logout endpoints; SPA cannot establish auth context.
- Cookie settings assume same-site delivery; cross-origin SPA may not send them.
- API and admin share middleware stack, so changes risk breaking the admin panel.

## Conflict Inventory
- All `/api/*` routes require legacy session + CSRF and redirect on missing auth.
- POST/PUT/PATCH/DELETE blocked by CSRF token requirements not exposed to SPA.
- Org/bot/user management endpoints expect `req.session.role`/`organization_id`.
- Upload/bot creation handlers mix redirects and JSON depending on `Accept`.
- Metrics endpoint intentionally unauthenticated; must remain so.
- WebSocket clients piggyback on session auth but are unaudited for SPA flows.

## Full Remediation Plan
- Introduce API-first auth layer (JWT or API cookie) alongside legacy sessions; expose `/api/auth/*` endpoints for SPA.
- Guard `/api` with dedicated middleware that returns JSON (401/403) and can be bypassed via env flag during migration.
- Keep legacy session + CSRF for EJS routes; decouple middleware stacks so admin and API evolve independently.
- Normalize `/api` responses to JSON `{ error, message }`; remove redirects/HTML from API code paths.
- Embed role/org info in API auth context (e.g., `req.user`) to power authorization checks without session coupling.
- Document CORS/cookie requirements and standardize error payloads.
- Add auth-focused integration tests to prevent regressions.

## Step-by-Step Refactor Phases
1. **Bridge (current change)**: Add `DISABLE_AUTH_FOR_API` flag to bypass auth/CSRF expectations on `/api`; introduce API middleware that emits JSON errors; preserve admin behavior.
2. **API Auth Surface**: Scaffold `/api/auth/login|logout|refresh` endpoints; decide on JWT vs. API cookie; wire middleware to validate tokens and populate `req.user`.
3. **Route Normalization**: Update all `/api` handlers to return JSON only and rely on `req.user` for roles/org access; keep legacy redirects for admin pages.
4. **Hardening**: Remove bypass flag in production configs; enforce CORS/credentials, add rate limits/lockouts, and observability around auth failures.

## Backward Compatibility Considerations
- Legacy `/login`, admin pages, and CSRF-protected forms remain unchanged.
- Session-based role checks stay active for non-API routes.
- Metrics/WebSocket behavior preserved; new API auth runs alongside existing sessions.
- Env flag defaults to secure mode; opting in is explicit and documented.

## API Contract Adjustments
- Standardize error payloads: `{ error: 'unauthorized'|'forbidden'|..., message: '...' }` with status codes 401/403 for auth issues.
- `/api` must never issue redirects or HTML; responses are JSON or status-only.
- Future `/api/auth/*` endpoints will exchange credentials for tokens/cookies and return user/role metadata.

## Testing Plan
- Unit tests for API auth middleware: unauthorized, forbidden, bypass flag behavior, and role/org access checks.
- Integration tests for representative `/api` routes ensuring JSON errors and no redirects.
- Regression tests for legacy admin flows (CSRF tokens, redirects) to confirm isolation.

## Migration Notes
- Deploy with `DISABLE_AUTH_FOR_API=true` only in non-prod to unblock SPA while frontend implements real login.
- Coordinate SPA changes to consume `/api/auth/*` and send credentials (cookie or bearer token).
- After SPA migration, disable the bypass and remove reliance on legacy session headers for API calls.

## “Successful State” Definition
- `/api/*` authenticated via API-first mechanism (token or API cookie), returning JSON-only responses with consistent error formats.
- Legacy admin routes continue to use session + CSRF and redirects as before.
- Role/org/bot checks read from unified `req.user` context, not legacy session-only fields.
- No unexpected 302/403 responses for authorized SPA clients; metrics/WebSocket flows remain operational.
