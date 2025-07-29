const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { client, requestCounter } = require('./metrics');
const { createAssistant } = require('./assistant');
const { upload } = require('./scripts/uploadFile');
const { createOrganization, listOrganizations } = require('./index');
const logger = require('./logger');
const pool = require('./db');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
  })
);

function requireAdmin(req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).send('Forbidden');
}

function requireEditor(req, res, next) {
  if (req.session.role === 'admin' || req.session.role === 'editor') return next();
  res.status(403).send('Forbidden');
}

// count all incoming requests
app.use((req, res, next) => {
  res.on('finish', () => {
    const route = req.route?.path || req.path;
    requestCounter.inc({ method: req.method, route, status: res.statusCode });
  });
  next();
});

// expose Prometheus metrics without auth
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { rows } = await pool.query(
    'SELECT password_hash, role FROM users WHERE username=$1',
    [username]
  );
  const user = rows[0];
  if (user && (await bcrypt.compare(password, user.password_hash))) {
    req.session.user = username;
    req.session.role = user.role;
    return res.redirect('/');
  }
  res.status(401).send('Invalid credentials');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// auth middleware
app.use((req, res, next) => {
  if (req.session.user) return next();
  res.redirect('/login');
});

app.get('/', async (req, res) => {
  const orgs = await listOrganizations();
  res.render('list', { orgs });
});

app.get('/org/new', requireEditor, (req, res) => {
  res.render('newOrg');
});

app.post('/org/new', requireEditor, async (req, res) => {
  const { name, phone, instructions, language } = req.body;
  await createOrganization(name, phone, instructions, language);
  res.redirect('/');
});

app.post('/org/:id/assistant', requireEditor, async (req, res) => {
  const { instructions } = req.body;
  if (instructions !== undefined) {
    await pool.query('UPDATE organizations SET instructions=$1 WHERE id=$2', [instructions, req.params.id]);
  }
  await createAssistant(req.params.id);
  res.redirect('/');
});

app.get('/org/:id/assistant', requireEditor, async (req, res) => {
  const { rows } = await pool.query('SELECT instructions FROM organizations WHERE id=$1', [req.params.id]);
  const instructions = rows[0]?.instructions || '';
  res.render('createAssistant', { orgId: req.params.id, instructions });
});

app.get('/org/:id/upload', requireEditor, (req, res) => {
  res.render('upload', { orgId: req.params.id });
});

app.post('/org/:id/upload', requireEditor, async (req, res) => {
  const { filePath } = req.body;
  await upload(req.params.id, filePath);
  res.redirect('/');
});

app.get('/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role FROM users ORDER BY id');
  res.render('users', { users: rows });
});

app.get('/users/new', requireAdmin, (req, res) => {
  res.render('newUser');
});

app.post('/users/new', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role',
    [username, hash, role]
  );
  res.redirect('/users');
});

app.post('/users/:id/role', requireAdmin, async (req, res) => {
  const { role } = req.body;
  await pool.query('UPDATE users SET role=$1 WHERE id=$2', [role, req.params.id]);
  res.redirect('/users');
});

const port = process.env.ADMIN_PORT || 3001;
app.listen(port, () => {
  logger.info(`Admin server listening on ${port}`);
});

module.exports = app;
