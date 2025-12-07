# FRONTEND SCREENS SPEC

This document describes the frontend screens that must be implemented, with their fields and UX behaviour, without enforcing any specific technology.

---

## 1. Login Screen (If Supported by the API)

> First, check `docs/API_FOR_UI.md` for authentication-related endpoints.  
> If no authentication endpoints exist yet, this screen can be postponed or implemented as a simple form using a fixed token in configuration.

- Fields:
  - Email / Username
  - Password
- Buttons:
  - “Log in”
- Behaviour:
  - On success: store session data (token) in a secure layer appropriate for your chosen stack.
  - On failure: show a clear error message.

---

## 2. Admin Dashboard Screen

- Displays:
  - Number of organizations.
  - Number of bots.
  - A summary of worker/background-process state, if the API provides it.
- May include:
  - Statistic cards (small panels with counts).
  - A table of latest organizations or latest bots.
  - A section for alerts (e.g. Redis connectivity problems, backend health issues, if available from the API).

---

## 3. Organizations List Screen

- Organizations table:
  - Suggested columns (based on API data):
    - ID
    - Name
    - Status (Active / Inactive)
    - Created at
    - Number of associated bots
    - Action buttons (View / Edit / Activate / Deactivate)
- Features:
  - Free-text search (e.g. by name).
  - Filter by status (Active / Inactive).
  - Button to create a new organization.
- UX:
  - Clicking a row navigates to the “Organization Details” screen.

---

## 4. Create/Edit Organization Screen (Organization Form)

- Fields:
  - Organization name.
  - Any additional fields the API supports (e.g. domain, contact person, notes).
- Behaviour:
  - Validate fields before submitting.
  - Show success or error messages.
  - After saving:
    - Either return to Organizations list,
    - Or navigate to the Organization Details screen.

---

## 5. Organization Details Screen

- Contains:
  - Core organization info.
  - List of bots that belong to this organization (table or cards).
- From this screen the user can:
  - Create a new bot for this organization.
  - Navigate to any bot’s detail/edit screen.

---

## 6. Bots List Screen (Per Organization)

- Bots table:
  - Suggested columns:
    - ID
    - Name
    - Phone number
    - Status (Active / Inactive / Error)
    - Last contact with WhatsApp (if available).
    - Actions (View / Edit / Start / Stop)
- Features:
  - “Add bot” button for the current organization.
  - Filter by status if helpful.

---

## 7. Create/Edit Bot Screen (Bot Form)

- Fields:
  - Bot name.
  - Associated phone number.
  - Organization (in a global context; if opened from Organization Details, this can be prefilled).
  - Any other configuration fields described in the API (assistant id, thread id, description, etc.).
- Behaviour:
  - Validate phone number and other fields before submission.
  - Show backend validation errors in a structured way.

---

## 8. Auth Sessions / Folders Status Screen

> This is related to the logic in `checkEnv.js` and the auth folders for bots.

- Purpose:
  - Display whether each bot has its auth folder present or missing (e.g. `auth-1`, `auth-2`, etc.).
- Contents:
  - A table that connects:
    - Organization name
    - Bot name
    - Bot number / phone
    - Auth folder status (present / missing)
- Data source:
  - Fetch this from a backend endpoint that exposes this information.  
    If there is no such endpoint, this screen can be implemented later or as a partial “read-only” view based on what is available.

---

## 9. System Settings Screen

- Entirely dependent on what is documented in the API.
- Examples:
  - Default configuration values for new bots.
  - Global keys or toggles exposed by the backend.
- It can start simple and be extended as the backend grows.

---

## 10. Global Behaviour Across All Screens

- **Loading indicators:**
  - Show loading states while fetching data or submitting forms.
- **Empty states:**
  - If no data is available (for example, no organizations yet), show a friendly message and a button to create the first record.
- **Error states:**
  - If connection to the backend fails or an unexpected error occurs, show a clear message and a button to retry.
