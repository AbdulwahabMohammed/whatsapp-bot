# WhatsApp AI Bot (Skeleton)

This project is a starting point for building a WhatsApp customer service bot powered by OpenAI Assistants API.

## Setup
1. Copy `.env.example` to `.env` and fill in your OpenAI and PostgreSQL credentials.
2. Initialize the database tables:
   ```bash
   node src/initDb.js
   ```
3. Run the sample script:
   ```bash
   npm start
   ```

The project includes utilities to create an OpenAI assistant for each organization and upload reference files.

## Scripts
- `src/initDb.js` – Creates the required tables.
- `src/index.js` – Simple example to insert and list organizations.
- `src/assistant.js` – Functions to create an assistant and upload files.

This is only the foundation; further steps include integrating a WhatsApp client and managing chat sessions.
