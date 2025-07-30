const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const {
  client,
  requestCounter,
  connectionGauge,
  queueLengthGauge,
} = require('./metrics');
const { messageQueue, bulkQueue, getQueueLength } = require('./queue');
const { createAssistant } = require('./assistant');
const { upload } = require('./scripts/uploadFile');
const { createOrganization, listOrganizations } = require('./index');
const logger = require('./logger');
const pool = require('./db');
const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');

const app = express();
expressWs(app);

const wsClients = new Set();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
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

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
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

app.ws('/ws', (ws, _req) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

async function broadcastStatus() {
  const queue = await getQueueLength();
  queueLengthGauge.set(queue);
  const conn = {};
  const values = connectionGauge.get().values || [];
  values.forEach(v => {
    conn[v.labels.org_id] = v.value;
  });
  const data = JSON.stringify({ queue, connections: conn });
  wsClients.forEach(client => {
    try { client.send(data); } catch (e) {}
  });
}

let statusInterval;

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password, token } = req.body;
  const { rows } = await pool.query(
    'SELECT password_hash, role, totp_secret FROM users WHERE username=$1',
    [username]
  );
  const user = rows[0];
  if (!user) return res.status(401).send('Invalid credentials');

  const pwOk = await bcrypt.compare(password, user.password_hash);
  if (!pwOk) return res.status(401).send('Invalid credentials');

  if (user.totp_secret) {
    const verified = token && speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token
    });
    if (!verified) return res.status(401).send('Invalid token');
    req.session.user = username;
    req.session.role = user.role;
    return res.redirect('/');
  }

  req.session.user = username;
  req.session.role = user.role;
  return res.redirect('/');
});

app.post('/setup-2fa', async (req, res) => {
  const { token } = req.body;
  const secret = req.session.temp_secret;
  const username = req.session.temp_user;
  const role = req.session.temp_role;
  if (!secret || !username) return res.redirect('/login');
  const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token });
  if (!verified) return res.status(401).send('Invalid token');
  await pool.query('UPDATE users SET totp_secret=$1 WHERE username=$2', [secret, username]);
  req.session.user = username;
  req.session.role = role;
  delete req.session.temp_secret;
  delete req.session.temp_user;
  delete req.session.temp_role;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

app.get('/profile', requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT role, totp_secret FROM users WHERE username=$1',
      [req.session.user]
    );
    const user = rows[0] || {};
    res.render('profile', {
      username: req.session.user,
      role: user.role,
      enabled: !!user.totp_secret,
    });
  } catch (err) {
    if (req.session.temp_secret) delete req.session.temp_secret;
    logger.error('2FA setup failed:', err);
    res.status(500).send('Failed to load profile. Please try again.');
  }
});

app.get('/profile/setup-2fa', requireLogin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT totp_secret FROM users WHERE username=$1',
      [req.session.user]
    );
    if (rows[0]?.totp_secret) return res.redirect('/profile');
    const secret = speakeasy.generateSecret({ name: `whatsapp-bot:${req.session.user}` });
    req.session.temp_secret = secret.base32;
    const qr = await qrcode.toDataURL(secret.otpauth_url);
    res.render('enable2fa', { qr, secret: secret.base32 });
  } catch (err) {
    if (req.session.temp_secret) delete req.session.temp_secret;
    logger.error('2FA setup failed:', err);
    res.status(500).send('Failed to setup 2FA. Please try again.');
  }
});

app.post('/profile/enable-2fa', requireLogin, async (req, res) => {
  const { token } = req.body;
  const secret = req.session.temp_secret;
  const { rows } = await pool.query(
    'SELECT totp_secret FROM users WHERE username=$1',
    [req.session.user]
  );
  if (rows[0]?.totp_secret) {
    delete req.session.temp_secret;
    return res.redirect('/profile');
  }
  if (!secret) return res.redirect('/profile');
  const verified = speakeasy.totp.verify({ secret, encoding: 'base32', token });
  if (!verified) return res.status(401).send('Invalid token');
  await pool.query('UPDATE users SET totp_secret=$1 WHERE username=$2', [secret, req.session.user]);
  delete req.session.temp_secret;
  res.redirect('/profile');
});

app.post('/profile/disable-2fa', requireLogin, async (req, res) => {
  await pool.query('UPDATE users SET totp_secret=NULL WHERE username=$1', [req.session.user]);
  res.redirect('/profile');
});

app.get('/stats', (req, res) => {
  res.render('stats');
});

app.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

// auth middleware
app.use(requireLogin);

app.get('/', async (req, res) => {
  const orgs = await listOrganizations();
  res.render('list', { orgs });
});

app.get('/org/new', requireEditor, (req, res) => {
  res.render('newOrg');
});

app.post('/org/new', requireEditor, async (req, res) => {
  const { name, phone, instructions, language, working_hours_start, working_hours_end } = req.body;
  await createOrganization(
    name,
    phone,
    instructions,
    language,
    working_hours_start || null,
    working_hours_end || null
  );
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

app.get('/org/:id/hours', requireEditor, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT name, working_hours_start, working_hours_end FROM organizations WHERE id=$1',
    [req.params.id]
  );
  const org = rows[0] || {};
  res.render('editHours', {
    orgId: req.params.id,
    name: org.name,
    start: org.working_hours_start || '',
    end: org.working_hours_end || '',
  });
});

app.post('/org/:id/hours', requireEditor, async (req, res) => {
  const { working_hours_start, working_hours_end } = req.body;
  await pool.query(
    'UPDATE organizations SET working_hours_start=$1, working_hours_end=$2 WHERE id=$3',
    [working_hours_start || null, working_hours_end || null, req.params.id]
  );
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

app.post('/users/:id/disable-2fa', requireAdmin, async (req, res) => {
  await pool.query('UPDATE users SET totp_secret=NULL WHERE id=$1', [req.params.id]);
  res.redirect('/users');
});

app.get('/schedule/new', requireEditor, async (req, res) => {
  const orgs = await listOrganizations();
  res.render('newSchedule', { orgs });
});

app.post('/schedule/new', requireEditor, async (req, res) => {
  const { organization_id, phone, text, send_at } = req.body;
  await pool.query(
    'INSERT INTO scheduled_messages (organization_id, phone, text, send_at) VALUES ($1,$2,$3,$4)',
    [organization_id, phone, text, send_at]
  );
  res.redirect('/');
});

app.get('/broadcast', requireEditor, async (req, res) => {
  const orgs = await listOrganizations();
  res.render('broadcast', { orgs });
});

app.post('/broadcast', requireEditor, async (req, res) => {
  const { organization_id, phones, text } = req.body;
  let list = [];
  if (phones) {
    list = phones.split(',').map(p => p.trim()).filter(Boolean);
  }
  if (organization_id) {
    const { rows } = await pool.query(
      'SELECT DISTINCT customer_phone FROM conversations WHERE organization_id=$1',
      [organization_id]
    );
    list = Array.from(new Set([...list, ...rows.map(r => r.customer_phone)]));
  }
  if (list.length) {
    await bulkQueue.add('broadcast', {
      orgId: Number(organization_id),
      text,
      phones: list,
    });
  }
  res.redirect('/');
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
    'SELECT m.sender, m.text, m.attachment_type, m.attachment_path, m.created_at, c.customer_phone, o.name AS organization ' +
    'FROM messages m JOIN conversations c ON m.conversation_id=c.id ' +
    'JOIN organizations o ON c.organization_id=o.id';
  if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
  query += ' ORDER BY m.created_at DESC';
  const { rows } = await pool.query(query, params);

  let sumQuery = 'SELECT id, customer_phone, summary, escalated FROM conversations WHERE summary IS NOT NULL';
  const sumParams = [];
  if (phone) {
    sumQuery += ' AND customer_phone=$1';
    sumParams.push(phone);
  }
  sumQuery += ' ORDER BY id DESC LIMIT 50';
  const { rows: summaries } = await pool.query(sumQuery, sumParams);

  if (exportType === 'csv') {
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'created_at', title: 'Date' },
        { id: 'organization', title: 'Organization' },
        { id: 'customer_phone', title: 'Phone' },
        { id: 'sender', title: 'Sender' },
        { id: 'text', title: 'Text' },
        { id: 'attachment_path', title: 'Attachment' },
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
      const attachment = r.attachment_path ? ` | ${r.attachment_path}` : '';
      doc.text(`${r.created_at.toISOString()} | ${r.organization} | ${r.customer_phone} | ${r.sender} | ${r.text}${attachment}`);
      doc.moveDown();
    });
    return doc.end();
  }

  res.render('messageResults', { results: rows, summaries, phone, from, to });
});

app.post('/conversations/:id/escalate', requireAdmin, async (req, res) => {
  await pool.query('UPDATE conversations SET escalated=TRUE WHERE id=$1', [req.params.id]);
  res.redirect('back');
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

app.get('/analytics', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) AS date, AVG(response_time_ms) AS avg_response
       FROM conversation_stats
      GROUP BY DATE(created_at)
      ORDER BY date`
  );
  res.render('analytics', { stats: rows });
});

app.get('/unanswered', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT phone, message, created_at FROM unanswered_questions ORDER BY created_at DESC'
  );
  res.render('unanswered', { alerts: rows });
});

app.get('/faq', requireAdmin, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, question, count FROM faq_suggestions ORDER BY count DESC'
  );
  res.render('faq', { faqs: rows });
});

app.post('/faq/:id/delete', requireAdmin, async (req, res) => {
  await pool.query('DELETE FROM faq_suggestions WHERE id=$1', [req.params.id]);
  res.redirect('/faq');
});

function startAdminServer() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'secret') {
    logger.error('SESSION_SECRET must be set and not equal to "secret"');
    process.exit(1);
  }
  const port = process.env.ADMIN_PORT || 3001;
  statusInterval = setInterval(broadcastStatus, 5000);
  const server = app.listen(port, () => {
    logger.info(`Admin server listening on ${port}`);
  });
  return { server, intervalId: statusInterval };
}

async function stopAdminServer(server, intervalId) {
  if (intervalId) clearInterval(intervalId);
  if (server && server.close) server.close();
  if (messageQueue && messageQueue.close) await messageQueue.close();
}

if (require.main === module) {
  startAdminServer();
}

module.exports = { app, startAdminServer, stopAdminServer };
