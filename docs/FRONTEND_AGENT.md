# FRONTEND AGENT INSTRUCTIONS

You are an expert frontend engineer and UX designer.  
Your task is to build a **complete admin frontend** for the existing WhatsApp bot platform backend.

## 1. What You Have

You will be given the following documents:

- `docs/API_FOR_UI.md`  
  → Precise description of all backend endpoints intended to be consumed by the UI.

- `docs/BACKEND_NOTES_FOR_FRONTEND.md`  
  → Extra notes about environment, Docker setup, and how the backend expects the UI to behave.

- `docs/FRONTEND_PLAN.md`  
  → Overall goals, constraints, modules, and priorities for the frontend project.

- `docs/FRONTEND_SCREENS.md`  
  → Detailed description of required screens and their behaviour.

- `docs/FRONTEND_UX_NOTES.md`  
  → Design and UX guidelines.

Read **all** of them carefully **before** writing any code.

## 2. High-Level Requirements

- Build a **separate frontend project** that runs in its own container and communicates with the backend API described in `docs/API_FOR_UI.md`.
- Do **not** assume any specific frontend technology in these instructions; choose a mainstream SPA stack you are very comfortable with, and then use it consistently across the whole project.
- Configuration requirement:
  - The API base URL must be configurable via an environment variable (for example `API_BASE_URL`), not hard-coded.

## 3. Output Structure

When you implement the project, you must:

1. Create a clean, modular source structure (screens, components, services/api, config, etc.).
2. Implement all screens and flows described in `docs/FRONTEND_SCREENS.md`.
3. Implement a small, clear API layer that wraps all HTTP calls to endpoints from `docs/API_FOR_UI.md`.
4. Handle loading states, error states, and empty states in a user-friendly way according to `docs/FRONTEND_UX_NOTES.md`.
5. Provide a **README** explaining:
   - How to install and run the frontend locally.
   - How to configure the API base URL.
   - How to run the frontend in Docker and link it to the backend container.

## 4. Behaviour and Quality

- The UI must work **end-to-end** against the backend (list organizations, create/update, list bots, etc.).
- Respect the backend contract exactly:
  - Parameter names.
  - Path names.
  - HTTP methods.
  - Request and response formats.
- Do not silently ignore errors; surface them in the UI in a clean, concise way.
- Keep the codebase readable, with meaningful names and minimal but precise comments where helpful.

## 5. What You Should **Not** Do

- Do not redesign or modify backend endpoints.
- Do not hard-code environment-specific values.
- Do not over-engineer or introduce unnecessary complexity.

Your final code should be ready to plug into Docker Compose alongside the backend so that, once both containers are up and the API URL is set, the whole system is usable by an admin with no extra manual steps.
