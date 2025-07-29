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
const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');

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

app.get('/stats', (req, res) => {
  res.render('stats');
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

app.get('/messages', requireAdmin, (req, res) => {
  res.render('messages');
});

app.post('/messages', requireAdmin, async (req, res) => {
  const { phone, from, to, export: exportType } = req.body;
  const conditions = [];
  const params = [];
  let idx = 1;
  if (phone) {
    conditions.push(`c.customer_phone=$${idx++}`);
    params.push(phone);
  }
  if (from) {
    conditions.push(`m.created_at >= $${idx++}`);
    params.push(from);
  }
  if (to) {
    conditions.push(`m.created_at <= $${idx++}`);
    params.push(to);
  }
  let query =
    'SELECT m.sender, m.text, m.created_at, c.customer_phone, o.name AS organization ' +
    'FROM messages m JOIN conversations c ON m.conversation_id=c.id ' +
    'JOIN organizations o ON c.organization_id=o.id';
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY m.created_at DESC';
  const { rows } = await pool.query(query, params);

  if (exportType === 'csv') {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'created_at', title: 'Date' },
        { id: 'organization', title: 'Organization' },
        { id: 'customer_phone', title: 'Phone' },
        { id: 'sender', title: 'Sender' },
        { id: 'text', title: 'Text' },
      ],
    });
    const csv = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.attachment('messages.csv');
    return res.send(csv);
  }

  if (exportType === 'pdf') {
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.attachment('messages.pdf');
    doc.pipe(res);
    rows.forEach(r => {
      doc.text(`${r.created_at.toISOString()} | ${r.organization} | ${r.customer_phone} | ${r.sender} | ${r.text}`);
      doc.moveDown();
    });
    return doc.end();
  }

  res.render('messageResults', { results: rows, phone, from, to });
});

app.get('/usage', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT o.name, DATE(u.created_at) AS date,
            SUM(u.tokens_prompt) AS tokens_prompt,
            SUM(u.tokens_completion) AS tokens_completion
       FROM usage_stats u
       JOIN organizations o ON u.organization_id=o.id
      GROUP BY o.name, DATE(u.created_at)
      ORDER BY date DESC`
  );
  res.render('usage', { stats: rows });
});

const port = process.env.ADMIN_PORT || 3001;
app.listen(port, () => {
  logger.info(`Admin server listening on ${port}`);
});

module.exports = app;
