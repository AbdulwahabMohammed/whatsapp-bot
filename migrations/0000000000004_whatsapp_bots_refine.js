/* eslint-disable camelcase */
exports.shorthands = undefined;

exports.up = pgm => {
  pgm.addColumns('whatsapp_bots', {
    session_folder: { type: 'text' },
    active: { type: 'boolean', notNull: true, default: pgm.func("'true'") }
  });

  pgm.alterColumn('whatsapp_bots', 'status', { notNull: true, default: pgm.func("'stopped'") });
  pgm.alterColumn('whatsapp_bots', 'created_at', { notNull: true, default: pgm.func('now()') });
  pgm.alterColumn('whatsapp_bots', 'updated_at', { notNull: true, default: pgm.func('now()') });
  pgm.alterColumn('whatsapp_bots', 'organization_id', { notNull: true });

  pgm.createIndex('whatsapp_bots', ['organization_id', 'active'], {
    ifNotExists: true
  });
};

exports.down = pgm => {
  pgm.dropIndex('whatsapp_bots', ['organization_id', 'active'], { ifExists: true });
  pgm.alterColumn('whatsapp_bots', 'organization_id', { notNull: false });
  pgm.alterColumn('whatsapp_bots', 'updated_at', { default: null, notNull: false });
  pgm.alterColumn('whatsapp_bots', 'created_at', { default: null, notNull: false });
  pgm.alterColumn('whatsapp_bots', 'status', { default: null, notNull: false });
  pgm.dropColumns('whatsapp_bots', ['session_folder', 'active']);
};
