/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = pgm => {
  pgm.createIndex('whatsapp_bots', 'organization_id', { ifNotExists: true });
  pgm.createIndex('whatsapp_bots', 'assistant_id', { unique: true, ifNotExists: true });
  pgm.createIndex('whatsapp_bots', 'phone', { unique: true, ifNotExists: true });
  pgm.createIndex('whatsapp_bots', ['organization_id', 'name'], { unique: true, ifNotExists: true, where: 'name IS NOT NULL' });

  pgm.sql(`
    DO $$
    BEGIN
      IF to_regclass('public.bots') IS NOT NULL THEN
        INSERT INTO whatsapp_bots (id, organization_id, assistant_id, name, phone, status, created_at, updated_at)
        SELECT id, organization_id, assistant_id, name, phone, status, created_at, COALESCE(updated_at, created_at, NOW())
        FROM bots
        ON CONFLICT DO NOTHING;

        PERFORM setval(pg_get_serial_sequence('whatsapp_bots', 'id'), (SELECT COALESCE(MAX(id), 0) FROM whatsapp_bots));

        DROP TABLE bots;
      END IF;
    END$$;
  `);
};

exports.down = pgm => {
  pgm.createTable('bots', {
    id: { type: 'bigserial', primaryKey: true },
    organization_id: {
      type: 'bigint',
      references: 'organizations(id)',
      onDelete: 'CASCADE'
    },
    assistant_id: { type: 'text' },
    name: { type: 'text' },
    phone: { type: 'text' },
    status: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
  }, { ifNotExists: true });

  pgm.createIndex('bots', 'organization_id', { ifNotExists: true });
  pgm.createIndex('bots', 'assistant_id', { unique: true, ifNotExists: true });
  pgm.createIndex('bots', 'phone', { unique: true, ifNotExists: true });

  pgm.sql(`
    INSERT INTO bots (id, organization_id, assistant_id, name, phone, status, created_at, updated_at)
    SELECT id, organization_id, assistant_id, name, phone, status, created_at, updated_at
    FROM whatsapp_bots
    ON CONFLICT DO NOTHING;

    PERFORM setval(pg_get_serial_sequence('bots', 'id'), (SELECT COALESCE(MAX(id), 0) FROM bots));

    DROP TABLE IF EXISTS whatsapp_bots;
  `);
};
