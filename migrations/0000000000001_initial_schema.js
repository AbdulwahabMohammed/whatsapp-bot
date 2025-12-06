/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createTable('organizations', {
    id: { type: 'bigserial', primaryKey: true },
    name: { type: 'text', notNull: true },
    phone: { type: 'text' },
    instructions: { type: 'text' },
    vector_store_id: { type: 'text' },
    language: { type: 'text', notNull: true, default: pgm.func("'ar'") },
    working_hours_start: { type: 'time' },
    working_hours_end: { type: 'time' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('documents', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    file_id: { type: 'text' },
    file_name: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('conversations', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    customer_phone: { type: 'text', notNull: true },
    thread_id: { type: 'text', notNull: true },
    escalated: { type: 'boolean', notNull: true, default: false },
    detected_language: { type: 'text' },
    summary: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('messages', {
    id: { type: 'bigserial', primaryKey: true },
    conversation_id: {
      type: 'bigint',
      references: 'conversations(id)',
      onDelete: 'CASCADE'
    },
    sender: { type: 'text', notNull: true },
    text: { type: 'text', notNull: false, default: pgm.func("''") },
    attachment_type: { type: 'text' },
    attachment_path: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('scheduled_messages', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    phone: { type: 'text', notNull: true },
    text: { type: 'text', notNull: true },
    send_at: { type: 'timestamptz', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('usage_stats', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    tokens_prompt: { type: 'integer', notNull: true },
    tokens_completion: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('conversation_stats', {
    id: { type: 'bigserial', primaryKey: true },
    conversation_id: {
      type: 'bigint',
      references: 'conversations(id)',
      onDelete: 'CASCADE'
    },
    response_time_ms: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('unanswered_questions', {
    id: { type: 'bigserial', primaryKey: true },
    phone: { type: 'text', notNull: true },
    message: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('faq_suggestions', {
    id: { type: 'bigserial', primaryKey: true },
    question: { type: 'text', notNull: true, unique: true },
    count: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('whatsapp_bots', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE',
      notNull: true
    },
    assistant_id: { type: 'text' },
    name: { type: 'text' },
    phone: { type: 'text' },
    status: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createTable('users', {
    id: { type: 'bigserial', primaryKey: true },
    username: { type: 'text', notNull: true, unique: true },
    password_hash: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: pgm.func("'admin'") },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)'
    },
    totp_secret: { type: 'text' }
  }, { ifNotExists: true });

  pgm.createIndex('whatsapp_bots', 'organization_id', { ifNotExists: true });
  pgm.createIndex('whatsapp_bots', 'assistant_id', { unique: true, ifNotExists: true });
  pgm.createIndex('whatsapp_bots', 'phone', { unique: true, ifNotExists: true });
  pgm.createIndex('messages', 'conversation_id', { ifNotExists: true });
  pgm.createIndex('conversations', 'customer_phone', { ifNotExists: true });
  pgm.createIndex('users', 'organization_id', { ifNotExists: true });
};

exports.down = pgm => {
  pgm.dropIndex('users', 'organization_id', { ifExists: true });
  pgm.dropIndex('conversations', 'customer_phone', { ifExists: true });
  pgm.dropIndex('messages', 'conversation_id', { ifExists: true });
  pgm.dropIndex('whatsapp_bots', 'phone', { ifExists: true });
  pgm.dropIndex('whatsapp_bots', 'assistant_id', { ifExists: true });
  pgm.dropIndex('whatsapp_bots', 'organization_id', { ifExists: true });

  pgm.dropTable('users', { ifExists: true });
  pgm.dropTable('whatsapp_bots', { ifExists: true });
  pgm.dropTable('faq_suggestions', { ifExists: true });
  pgm.dropTable('unanswered_questions', { ifExists: true });
  pgm.dropTable('conversation_stats', { ifExists: true });
  pgm.dropTable('usage_stats', { ifExists: true });
  pgm.dropTable('scheduled_messages', { ifExists: true });
  pgm.dropTable('messages', { ifExists: true });
  pgm.dropTable('conversations', { ifExists: true });
  pgm.dropTable('documents', { ifExists: true });
  pgm.dropTable('organizations', { ifExists: true });
};
