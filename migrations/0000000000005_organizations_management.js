/* eslint-disable camelcase */
exports.shorthands = undefined;

function slugExpression () {
  return "lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))";
}

exports.up = pgm => {
  pgm.addColumns('organizations', {
    slug: { type: 'text' },
    contact_email: { type: 'text' },
    contact_phone: { type: 'text' },
    status: { type: 'text', notNull: true, default: pgm.func("'active'") },
    description: { type: 'text' }
  });

  pgm.sql(`UPDATE organizations SET slug=${slugExpression()} WHERE slug IS NULL OR slug=''`);
  pgm.alterColumn('organizations', 'slug', { notNull: true });

  pgm.createIndex('organizations', 'slug', { unique: true, ifNotExists: true });
  pgm.createIndex('organizations', 'status', { ifNotExists: true });
  pgm.createIndex('organizations', 'contact_email', {
    unique: true,
    ifNotExists: true,
    where: 'contact_email IS NOT NULL'
  });
  pgm.createIndex('organizations', 'contact_phone', {
    unique: true,
    ifNotExists: true,
    where: 'contact_phone IS NOT NULL'
  });
};

exports.down = pgm => {
  pgm.dropIndex('organizations', 'contact_phone', { ifExists: true });
  pgm.dropIndex('organizations', 'contact_email', { ifExists: true });
  pgm.dropIndex('organizations', 'status', { ifExists: true });
  pgm.dropIndex('organizations', 'slug', { ifExists: true });
  pgm.dropColumns('organizations', ['description', 'status', 'contact_phone', 'contact_email', 'slug']);
};
