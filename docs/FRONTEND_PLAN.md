# FRONTEND PLAN

## 1. Overall Goal

We want a complete admin frontend UI for managing the bot platform (WhatsApp Bot Platform).  
This frontend must:

- Run in its own container (frontend container).
- Communicate with the existing backend API, which is documented in:

  - `docs/API_FOR_UI.md`
  - `docs/BACKEND_NOTES_FOR_FRONTEND.md`

The goal is to make frontend startup simple:

- When the backend container and the frontend container are both running,
- The UI should work and connect to the API immediately,
- Without manual code changes,
- Only by configuring an environment variable for the API base URL.

## 2. General Constraints

- **Do NOT assume any specific technology in this document**; you will choose the framework and tooling yourself (SPA framework, build tool, state management…).
- The project must be:
  - Modular, well-structured, and scalable.
  - Easy to understand and modify by another developer.
  - Ready to support multiple languages later (at least have a structure that can hold translations).
  - Responsive on all screen sizes (desktop, tablet, mobile).

## 3. Backend Connectivity

- There must be a single, clear environment variable for the API base URL, for example:
  - `VITE_API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, or any similar naming that fits your chosen stack.
- **Do NOT hard-code** API URLs inside components.
- Read all endpoint details, fields, and error formats from:
  - `docs/API_FOR_UI.md`
- Make sure to:
  - Centralize API consumption in one place (e.g. `api/` or `services/` folder).
  - Implement proper error handling and show clear success/failure messages to the user.

## 4. Main Modules in the Frontend

Rely on the API definitions and entities described in the documentation files.  
Assume the system contains at least the following modules:

1. **Organizations Management**
   - List organizations with search and filtering.
   - Create a new organization, edit, enable/disable, and delete (if supported by the API).
   - Show details of a specific organization (including bots associated with it).

2. **Bots Management (WhatsApp Bots)**
   - List all bots that belong to a specific organization.
   - Create/edit bot properties (name, phone number, active state, etc., based on the API).
   - Show connection state, last sync, and possible error states if available.

3. **Simple Admin Dashboard (Overview)**
   - High-level statistics: number of organizations, number of bots, status of workers if the API provides that.
   - Show warning messages if there are connection problems with the backend, Redis, or other services, according to what the API exposes.

4. **System Settings**
   - Show any global settings that the backend allows (if any).
   - This screen can be kept simple at first and based only on what is available in the API.

5. **Sessions/Auth Files Management for Bots (if defined in the API)**
   - A screen that shows session status for each bot (e.g. session present/missing), based on what the backend exposes.

## 5. UI / UX Requirements

- Modern, clean, lightweight design without distracting effects.
- Consistent layout (grid system, sidebar, top bar, etc.), for example:
  - Top bar with system title and possibly a future language switcher.
  - Sidebar (or main navigation) to move between all primary screens.
- The layout must be easy to switch to right-to-left (RTL) in the future:
  - If your tech stack has built-in support for RTL, use it.
  - If not, structure styles and layout so that RTL can be enabled without a full rewrite.
- Forms UX:
  - Reuse standardized components for inputs (text, select, date, etc.).
  - Show validation errors under each field when there are backend or frontend validation issues.

## 6. State Management

- Use a consistent approach for state management (internal component state, a state library, data-fetching library, etc.) **but do not name specific libraries in this document**.
- Important points:
  - Use a unified approach for fetching and caching data, when needed.
  - Support manual refetching from the UI (e.g. "Reload" buttons).

## 7. Suggested Folder Structure (Adjust as Needed)

This is just an example; you may adapt it to your chosen stack:

- `src/`
  - `screens/` — main screens (Organizations, Bots, Dashboard, Settings, etc.).
  - `components/` — shared UI components (Buttons, Forms, Layout, etc.).
  - `api/` or `services/` — functions for calling the backend API.
  - `hooks/` — shared hooks / reusable logic.
  - `config/` — general configuration (e.g. reading the API base URL).
  - `routes/` — routing definitions if using a router.
  - `styles/` — global styles / theme.

## 8. Priorities

1. Successfully connect the frontend to the backend via an environment variable for the API base URL.
2. Implement the Organizations management screen fully (list + create + edit + detail view).
3. Implement the Bots management screens per organization.
4. Implement a basic dashboard that shows system health/overview.
5. Polish the user experience and visual design.

## 9. What We Expect You to Deliver

- A complete frontend project ready to run in its own Docker container.
- Clear run instructions in a `README`, including:
  - How to configure the API base URL environment variable.
  - How to run the project locally.
  - How to run it in Docker.
- All screens described above should be wired to the backend using the endpoints documented in `docs/API_FOR_UI.md`.
