# Organizations Management (إدارة المنظمات)

## Access
- Navigate to **/organizations** (also the home page after login) from the admin navbar.
- Requires admin/editor role.

## Files
- `views/organizations.ejs` – UI with filters, table, modal CRUD.
- `src/admin.js` – API routes `/api/organizations` CRUD + page route.
- `src/index.js` – creation helper extended with slug/status/contact fields.
- `src/utils/slugify.js` – shared slug generator.
- `migrations/0000000000005_organizations_management.js` – adds slug/status/contact columns.

## Adding fields
1. Extend `organizations` table via a new migration.
2. Include the column in admin queries within `src/admin.js`.
3. Surface the field in `views/organizations.ejs` form and table.
