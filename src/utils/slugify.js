function slugify (value) {
  if (!value) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\u0600-\u06FF\s]+/g, match => match.trim().replace(/\s+/g, '-'))
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

module.exports = { slugify };
