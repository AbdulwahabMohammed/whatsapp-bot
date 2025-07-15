# WhatsApp AI Bot (Skeleton)

This project is a starting point for building a WhatsApp customer service bot powered by OpenAI Assistants API.

## Setup
1. Copy `.env.example` to `.env` and fill in your OpenAI and PostgreSQL credentials.
2. Install the project dependencies (the project expects `openai@^5.9.0`):
   ```bash
   npm install
   ```
   The OpenAI client is imported using `require('openai').default` so that beta
   features like vector stores are available.
3. Initialize the database tables:
   ```bash
   node src/initDb.js
   ```
4. Run the sample script:
   ```bash
   npm start
   ```
5. To create an OpenAI assistant for an organization:
   ```bash
   node src/scripts/createAssistant.js <organizationId>
   ```

6. To upload a reference file to an organization's assistant. The script checks
   whether the organization already has a vector store. If not, a new one is
   created, stored in the database, and linked to the assistant. The file is then
   indexed using a file batch so GPT-4o can search it:
   ```bash
   node src/scripts/uploadFile.js <organizationId> <path/to/file>
   ```

7. Start the WhatsApp bot for an organization (requires `ORGANIZATION_ID` in the `.env` file):
   ```bash
   npm run whatsapp
   ```
   The first run will display a QR code in the console which must be scanned with the WhatsApp account for that organization.

The project includes utilities to create an OpenAI assistant for each organization and manage its vector store for reference files.

-## Scripts
- `src/initDb.js` – Creates the required tables. Organizations now store their
  vector store ID in the `vector_store_id` column.
- `src/index.js` – Simple example to insert and list organizations.
- `src/assistant.js` – Functions to create an assistant and manage vector stores.
- `src/scripts/createAssistant.js` – CLI to create an assistant for an organization.
- `src/scripts/uploadFile.js` – CLI to upload a reference file and add it to the organization's vector store.
- `src/whatsappBot.js` – Connects to WhatsApp using Baileys and routes incoming
  messages through the organization's assistant.

This is only the foundation; further steps include integrating a WhatsApp client and managing chat sessions.
