-- Canonical database schema generated from migrations

CREATE TABLE organizations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  instructions TEXT,
  vector_store_id TEXT,
  language TEXT NOT NULL DEFAULT 'ar',
  working_hours_start TIME,
  working_hours_end TIME,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS organizations_name_key ON organizations(name);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_phone_key ON organizations(phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_vector_store_id_key ON organizations(vector_store_id) WHERE vector_store_id IS NOT NULL;

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  organization_id INTEGER REFERENCES organizations(id),
  totp_secret TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  last_login_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS users_organization_id_idx ON users(organization_id);

CREATE TABLE whatsapp_bots (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assistant_id TEXT,
  name TEXT,
  phone TEXT,
  status TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_bots_organization_id_idx ON whatsapp_bots(organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_bots_assistant_id_key ON whatsapp_bots(assistant_id);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_bots_phone_key ON whatsapp_bots(phone);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_bots_org_name_key ON whatsapp_bots(organization_id, name) WHERE name IS NOT NULL;

CREATE TABLE documents (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  file_id TEXT,
  file_name TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  checksum TEXT,
  source_url TEXT,
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS documents_org_file_id_key ON documents(organization_id, file_id) WHERE file_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_org_created_at_idx ON documents(organization_id, created_at);

CREATE TABLE conversations (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  escalated BOOLEAN NOT NULL DEFAULT false,
  detected_language TEXT,
  summary TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  last_message_at TIMESTAMP,
  escalated_at TIMESTAMP,
  escalated_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_thread_id_key ON conversations(thread_id);
CREATE INDEX IF NOT EXISTS conversations_org_phone_idx ON conversations(organization_id, customer_phone);
CREATE INDEX IF NOT EXISTS conversations_org_escalated_idx ON conversations(organization_id, escalated) WHERE escalated = true;

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,
  text TEXT DEFAULT '' ,
  attachment_type TEXT,
  attachment_path TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON messages(conversation_id, created_at);

CREATE TABLE scheduled_messages (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  text TEXT NOT NULL,
  send_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending',
  updated_at TIMESTAMP NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMP,
  error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS scheduled_messages_org_phone_send_at_key ON scheduled_messages(organization_id, phone, send_at);

CREATE TABLE usage_stats (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  tokens_prompt INTEGER NOT NULL,
  tokens_completion INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  period_start TIMESTAMP NOT NULL DEFAULT now(),
  period_end TIMESTAMP NOT NULL DEFAULT now(),
  run_count INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_stats_org_period_key ON usage_stats(organization_id, period_start, period_end);

CREATE TABLE conversation_stats (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
  response_time_ms INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  message_id INTEGER REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS conversation_stats_conversation_created_idx ON conversation_stats(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS conversation_stats_message_id_key ON conversation_stats(message_id) WHERE message_id IS NOT NULL;

CREATE TABLE unanswered_questions (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  handled BOOLEAN NOT NULL DEFAULT false,
  handled_at TIMESTAMP,
  handled_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS unanswered_questions_org_handled_idx ON unanswered_questions(organization_id, handled);

CREATE TABLE faq_suggestions (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  count INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  last_suggested_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS faq_suggestions_org_question_key ON faq_suggestions(organization_id, question);
