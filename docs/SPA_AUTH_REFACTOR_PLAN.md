# SPA Auth Refactor Plan

## 1. Background & Problem Summary
- Legacy admin uses server-rendered HTML with session+CSRF; SPA needs JSON APIs without redirects.
- Current mix of HTML and JSON in `/api` causes 302/HTML leakage to SPA.
- Temporary auth bypass flag exists but needs documentation and hardening for SPA bring-up.

## 2. Current Auth/CSRF Architecture (Legacy Model)
- Session-based auth stored in `req.session.*` with role and organization scope.
- Middlewares: `requireLogin`, `requireAdmin`, `requireEditor`, `requireOrgAccess`, `requireBotAccess`.
- CSRF enforced globally on HTML routes via `csurf`; APIs were exempted ad-hoc.
- Admin pages rely on redirects and server-rendered templates under mixed paths.

## 3. Conflict Inventory (Legacy vs SPA)
- `/api/*` sometimes returns HTML/302 when session missing.
- CSRF blocks JSON clients even when cookie-based auth is planned.
- Role checks tied directly to session; no hook for token-derived `req.user`.
- Admin and API share handlers, blurring HTML vs JSON expectations.

## 4. Target Architecture for SPA-Friendly Auth
- Clear split: admin HTML under `/admin/*` (with legacy aliases), APIs under `/api/*` JSON-only.
- Toggle `DISABLE_AUTH_FOR_API` to temporarily bypass auth for `/api/*` while keeping admin secured.
- Future `apiAuthMiddleware` populates `req.user` for APIs (JWT/cookie ready) without CSRF.
- CSRF retained for admin forms; `/api/*` designed to be CSRF-optional once API auth lands.

## 5. Detailed Refactor Plan
- Harden bypass flag:
  - Name: `DISABLE_AUTH_FOR_API`.
  - When `true`, `/api/*` skips legacy auth/role checks; admin HTML still requires session+CSRF.
- Separate routers:
  - `adminRouter` for HTML with session+CSRF+role middlewares; mounted at `/admin` and legacy roots.
  - `apiRouter` for JSON-only responses; never redirects.
- Normalize API responses to `{ error, code?, details? }` and status codes (401/403/404/500).
- Add `apiAuth.js` scaffolding exporting `apiAuthMiddleware`, `loginHandler`, `logoutHandler`, `meHandler`.
- Prepare middlewares to read `req.user` (future token context) while keeping session fallback.
- Split HTML vs API handlers where mixed; keep admin pages rendering views, APIs returning JSON only.

## 6. Migration / Transition Strategy
- Introduce `/admin/*` aliases while preserving existing paths to avoid breaking bookmarks.
- Keep session+CSRF auth for admin; allow SPA to call `/api/*` with bypass during integration.
- Gradually implement real API auth inside `apiAuthMiddleware` and handlers without changing routes.

## 7. Backward Compatibility & Risk Mitigation
- Legacy admin routes remain reachable via old paths plus `/admin/*` aliases.
- No DB schema changes; session-based auth untouched for admin.
- Bypass flag defaults to secure mode (auth enforced) when unset/false.
- Clear comments around bypass to avoid accidental production use.

## 8. Testing & Validation Strategy
- Manual checks while SPA integrates:
  - `/api/organizations` and `/api/bots` with `DISABLE_AUTH_FOR_API=true` (no session required).
  - Same endpoints with flag unset (legacy auth enforced; expect 401/403 JSON).
  - `/login` and other admin pages remain session/CSRF protected.
  - Ensure `/api/*` never returns 302/HTML.
- `docker compose up -d --build` should still start successfully.

## 9. "Done" Criteria
- `DISABLE_AUTH_FOR_API` documented and enforced for `/api/*` only.
- Admin HTML isolated under `/admin/*` + legacy aliases; still session+CSRF protected.
- `/api/*` handlers return JSON exclusively with normalized error shapes.
- API auth scaffolding available at `/api/auth/login|logout|me` with 501 placeholders (or mock user when bypass enabled).
- Middlewares ready to consume `req.user` from future API auth without breaking session behavior.
