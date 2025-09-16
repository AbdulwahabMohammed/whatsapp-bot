# AGENTS.md — Operating Guide for Codex

## 0) Purpose
This repository is an intelligent WhatsApp bot for organizations. It connects to:
- OpenAI Assistants (Threads/Runs, file_search)
- PostgreSQL for persistence
- BullMQ + Redis for job queues
- A WhatsApp socket (Baileys-like) via botManager

Your primary goals:
1) Implement features quickly without blocking on the WhatsApp socket during development.
2) Keep OpenAI calls resilient and configurable via ENV (no hard-coded delays).
3) Preserve tests and CI stability.

---

## 1) Project Map (what matters)
- `src/openai.js`: OpenAI client init (must **throw** on invalid key – already done).
- `src/chat.js`: Sends user text to assistant (Threads/Runs polling).
- `src/worker.js`: BullMQ workers: single messages + bulk broadcast; WhatsApp socket gating.
- `src/assistant.js`: Creating/updating assistants, uploading files to vector stores.
- `src/utils/systemInstructions.js`: filters organization system instructions.
- `tests/**`: Jest tests (please keep them green).

---

## 2) Fast Dev Mode (LOW LATENCY)
Introduce a **fast dev** mode controlled by `FAST_DEV=true` that:
- Skips language detection (`DETECT_LANGUAGE=false`) on first message.
- Reduces run polling latency and retry counts via ENV:
  - `RUN_MAX_RETRIES` (default 60 → dev 20)
  - `RUN_INITIAL_DELAY_MS` (default 1000 → dev 300)
  - `RUN_MAX_DELAY_MS` (default 5000 → dev 1500)
  - `RUN_DELAY_GROWTH` (default 1.2 → dev 1.15)
- Reduces WhatsApp socket reschedule delay:
  - `CONNECTION_RETRY_DELAY` (default 5000 → dev 1000)
- Reduces bulk delay:
  - `BULK_MESSAGE_DELAY` (default 500ms → dev 0)

**Implementation notes**:
- In `src/chat.js`: if `process.env.DETECT_LANGUAGE === 'false'`, skip detection API call entirely.
- Make polling constants read from ENV; fall back to current defaults to avoid breaking prod.
- In `src/worker.js`: read `CONNECTION_RETRY_DELAY` + `BULK_MESSAGE_DELAY` from ENV (already partially) and let FAST_DEV override them.
- Keep behavior identical in production when `FAST_DEV` unset.

---

## 3) Error Handling & Resilience
- Never `process.exit` from libraries; **throw** errors and handle them at call sites.
- When OpenAI is unavailable, degrade gracefully:
  - Log, store the user message in DB, and **return null** from chat to let the worker decide user-notification.
- Always guard Baileys socket usage with the existing `ensureReadySocketOrReschedule`.

---

## 4) Quality Gates
- Keep all `tests/**` passing. If behavior changes (e.g., throwing vs exiting), **update tests** to assert messages/errors instead of expecting exits.
- Run `npm run lint` and `npm test` before pushing.
- Prefer small PRs: a PR per domain change (e.g., “fast-dev mode”, “polling ENV”).

---

## 5) How to run locally (fast)
```bash
cp .env.dev.example .env
npm ci
npm run worker     # queues
npm start          # web/admin if applicable
