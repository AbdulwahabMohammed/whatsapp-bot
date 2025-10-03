/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = pgm => {
  // Organizations hardening
  pgm.addColumn('organizations', {
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('organizations', 'name', { unique: true, ifNotExists: true });
  pgm.createIndex('organizations', 'phone', {
    unique: true,
    ifNotExists: true,
    where: 'phone IS NOT NULL'
  });
  pgm.createIndex('organizations', 'vector_store_id', {
    unique: true,
    ifNotExists: true,
    where: 'vector_store_id IS NOT NULL'
  });

  // Documents metadata for sync + dedupe
  pgm.addColumns('documents', {
    checksum: { type: 'text' },
    source_url: { type: 'text' },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') }
  });
  pgm.createIndex('documents', ['organization_id', 'file_id'], {
    unique: true,
    ifNotExists: true,
    where: 'file_id IS NOT NULL'
  });
  pgm.createIndex('documents', ['organization_id', 'created_at'], { ifNotExists: true });

  // Conversations escalation context and dedupe
  pgm.addColumns('conversations', {
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    last_message_at: { type: 'timestamp' },
    escalated_at: { type: 'timestamp' },
    escalated_by: {
      type: 'integer',
      references: 'users(id)',
      onDelete: 'SET NULL'
    }
  });
  pgm.createIndex('conversations', 'thread_id', { unique: true, ifNotExists: true });
  pgm.createIndex('conversations', ['organization_id', 'customer_phone'], { ifNotExists: true });
  pgm.createIndex('conversations', ['organization_id', 'escalated'], {
    ifNotExists: true,
    where: 'escalated = true'
  });

  // Messages observability
  pgm.addColumn('messages', {
    metadata: { type: 'jsonb' }
  });
  pgm.createIndex('messages', ['conversation_id', 'created_at'], { ifNotExists: true });

  // Scheduled messages delivery feedback
  pgm.addColumns('scheduled_messages', {
    status: { type: 'text', notNull: true, default: pgm.func("'pending'") },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    last_attempt_at: { type: 'timestamp' },
    error: { type: 'text' }
  });
  pgm.createIndex('scheduled_messages', ['organization_id', 'phone', 'send_at'], {
    unique: true,
    ifNotExists: true
  });

  // Usage stats aggregation periods
  pgm.addColumns('usage_stats', {
    period_start: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    period_end: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    run_count: { type: 'integer', notNull: true, default: 0 },
    total_cost: { type: 'numeric', notNull: true, default: 0 }
  });
  pgm.createIndex('usage_stats', ['organization_id', 'period_start', 'period_end'], {
    unique: true,
    ifNotExists: true
  });

  // Conversation stats traceability
  pgm.addColumns('conversation_stats', {
    message_id: {
      type: 'integer',
      references: 'messages(id)',
      onDelete: 'CASCADE'
    }
  });
  pgm.createIndex('conversation_stats', ['conversation_id', 'created_at'], { ifNotExists: true });
  pgm.createIndex('conversation_stats', 'message_id', { unique: true, ifNotExists: true, where: 'message_id IS NOT NULL' });

  // Unanswered question routing
  pgm.addColumns('unanswered_questions', {
    organization_id: {
      type: 'integer',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    handled: { type: 'boolean', notNull: true, default: false },
    handled_at: { type: 'timestamp' },
    handled_by: {
      type: 'integer',
      references: 'users(id)',
      onDelete: 'SET NULL'
    }
  });
  pgm.createIndex('unanswered_questions', ['organization_id', 'handled'], { ifNotExists: true });

  // FAQ suggestions scoped per organization
  pgm.dropConstraint('faq_suggestions', 'faq_suggestions_question_key', { ifExists: true });
  pgm.addColumns('faq_suggestions', {
    organization_id: {
      type: 'integer',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    last_suggested_at: { type: 'timestamp' }
  });
  pgm.createIndex('faq_suggestions', ['organization_id', 'question'], {
    unique: true,
    ifNotExists: true
  });

  // Bot + user auditing
  pgm.addColumn('bots', {
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') }
  });
  pgm.alterColumn('bots', 'organization_id', { notNull: true });

  pgm.addColumns('users', {
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    last_login_at: { type: 'timestamp' }
  });
};

exports.down = pgm => {
  pgm.dropColumns('users', ['last_login_at', 'updated_at', 'created_at']);
  pgm.alterColumn('bots', 'organization_id', { notNull: false });
  pgm.dropColumn('bots', 'updated_at');

  pgm.dropIndex('faq_suggestions', ['organization_id', 'question'], { ifExists: true });
  pgm.dropColumn('faq_suggestions', 'last_suggested_at');
  pgm.dropColumn('faq_suggestions', 'organization_id');
  pgm.addConstraint('faq_suggestions', 'faq_suggestions_question_key', {
    unique: ['question']
  });

  pgm.dropIndex('unanswered_questions', ['organization_id', 'handled'], { ifExists: true });
  pgm.dropColumns('unanswered_questions', ['handled_by', 'handled_at', 'handled', 'organization_id']);

  pgm.dropIndex('conversation_stats', 'message_id', { ifExists: true });
  pgm.dropIndex('conversation_stats', ['conversation_id', 'created_at'], { ifExists: true });
  pgm.dropColumn('conversation_stats', 'message_id');

  pgm.dropIndex('usage_stats', ['organization_id', 'period_start', 'period_end'], { ifExists: true });
  pgm.dropColumns('usage_stats', ['total_cost', 'run_count', 'period_end', 'period_start']);

  pgm.dropIndex('scheduled_messages', ['organization_id', 'phone', 'send_at'], { ifExists: true });
  pgm.dropColumns('scheduled_messages', ['error', 'last_attempt_at', 'updated_at', 'status']);

  pgm.dropIndex('messages', ['conversation_id', 'created_at'], { ifExists: true });
  pgm.dropColumn('messages', 'metadata');

  pgm.dropIndex('conversations', ['organization_id', 'escalated'], { ifExists: true });
  pgm.dropIndex('conversations', ['organization_id', 'customer_phone'], { ifExists: true });
  pgm.dropIndex('conversations', 'thread_id', { ifExists: true });
  pgm.dropColumns('conversations', ['escalated_by', 'escalated_at', 'last_message_at', 'updated_at']);

  pgm.dropIndex('documents', ['organization_id', 'created_at'], { ifExists: true });
  pgm.dropIndex('documents', ['organization_id', 'file_id'], { ifExists: true });
  pgm.dropColumns('documents', ['updated_at', 'source_url', 'checksum']);

  pgm.dropIndex('organizations', 'vector_store_id', { ifExists: true });
  pgm.dropIndex('organizations', 'phone', { ifExists: true });
  pgm.dropIndex('organizations', 'name', { ifExists: true });
  pgm.dropColumn('organizations', 'updated_at');
};
