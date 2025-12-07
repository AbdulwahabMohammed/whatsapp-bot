// Admin/JSON HTTP server (Express + express-ws) runs on ADMIN_PORT/APP_PORT (default 3001), serves admin HTML, websockets (/ws), metrics (/metrics), and programmatic APIs mounted under /api (see router below).
const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const session = require('express-session');
const csrf = require('csurf');
const bcrypt = require('bcrypt');
const {
  client,
  requestCounter,
  connectionGauge,
  queueLengthGauge
} = require('./metrics');
const { messageQueue, bulkQueue, getQueueLength } = require('./queue');
const { createAssistant } = require('./assistant');
const {
  upload,
  formatAllowedFileTypes,
  formatFileSize,
  MAX_FILE_SIZE_BYTES
} = require('./scripts/uploadFile');
const { createOrganization, listOrganizations } = require('./index');
const logger = require('./logger');
const pool = require('./db');
const { createObjectCsvStringifier } = require('csv-writer');
const PDFDocument = require('pdfkit');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const expressLayouts = require('express-ejs-layouts');
const { slugify } = require('./utils/slugify');
const {
  startBot,
  stopBot,
  getBotStatus,
  events: botEvents
} = require('./botManager');

const sessionSecret = process.env.SESSION_SECRET;

function ensureSessionSecret () {
  if (!sessionSecret) {
    const error = new Error('SESSION_SECRET environment variable is required');
    logger.error(error.message);
    throw error;
  }
  if (sessionSecret === 'secret') {
    const error = new Error('SESSION_SECRET must not equal "secret"');
    logger.error(error.message);
    throw error;
  }
}

ensureSessionSecret();

const app = express();
expressWs(app);
const wsClients = new Set();
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(expressLayouts);
app.set('layout', 'layout');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/static', express.static(path.join(__dirname, '../public')));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    }
  })
);

const csrfProtection = csrf();
app.use(csrfProtection);

// expose alert stored in session
app.use((req, res, next) => {
  try {
    if (typeof req.csrfToken === 'function') {
      const token = req.csrfToken();
      res.locals.csrfToken = token;
      res.set('X-CSRF-Token', token);
    } else {
      res.locals.csrfToken = '';
    }
  } catch (err) {
    return next(err);
  }

  if (req.session.alert) {
    res.locals.alert = req.session.alert;
    delete req.session.alert;
  } else {
    res.locals.alert = null;
  }
  next();
});

function requireAdmin (req, res, next) {
  if (req.session.role === 'admin') return next();
  res.status(403).send('Forbidden');
}

function requireEditor (req, res, next) {
  if (req.session.role === 'admin' || req.session.role === 'editor') return next();
  res.status(403).send('Forbidden');
}

function requireOrgAccess (req, res, next) {
  if (req.session.role === 'admin') return next();
  const orgId = req.session.organization_id;
  const target =
    req.params.id ||
    req.params.orgId ||
    req.body.organization_id ||
    req.query.organization_id;
  if (target && Number(target) !== Number(orgId)) {
    return res.status(403).send('Forbidden');
  }
  next();
}

function normalizeStatus (status) {
  return status === 'inactive' ? 'inactive' : 'active';
}

function parsePagination (query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  return { page, pageSize };
}

function buildOrgFilters (req) {
  const conditions = [];
  const params = [];
  let idx = 1;
  const search = (req.query.search || '').trim().toLowerCase();
  const status = (req.query.status || 'all').toLowerCase();

  if (req.session.role !== 'admin') {
    conditions.push(`id=$${idx++}`);
    params.push(req.session.organization_id);
  }

  if (search) {
    conditions.push(`(LOWER(name) LIKE $${idx} OR LOWER(slug) LIKE $${idx})`);
    params.push(`%${search}%`);
    idx += 1;
  }

  if (status && status !== 'all') {
    conditions.push(`status=$${idx++}`);
    params.push(normalizeStatus(status));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

function isValidEmail (email) {
  if (!email) return true;
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

async function requireBotAccess (req, res, next) {
  if (req.session.role === 'admin') return next();
  try {
    const { rows } = await pool.query('SELECT organization_id FROM whatsapp_bots WHERE id=$1', [
      req.params.botId
    ]);
    const orgId = rows[0]?.organization_id;
    if (!orgId || Number(orgId) !== Number(req.session.organization_id)) {
      return res.status(403).send('Forbidden');
    }
    next();
  } catch (e) {
    next(e);
  }
}

function requireLogin (req, res, next) {
  if (req.method === 'OPTIONS') return next();
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

function buildAllowedOrigins () {
  const origins = new Set();
  const envOrigins = [process.env.FRONTEND_ORIGIN, process.env.FRONTEND_ORIGIN_ADDITIONAL]
    .filter(Boolean)
    .flatMap(value => value.split(',').map(item => item.trim()).filter(Boolean));
  envOrigins.forEach(origin => origins.add(origin));

  if (process.env.NODE_ENV !== 'production') {
    ['http://localhost:3000', 'http://localhost:4173', 'http://localhost:5173'].forEach(origin => origins.add(origin));
  }

  return origins;
}

const allowedOrigins = buildAllowedOrigins();

// FRONTEND_ORIGIN/FRONTEND_ORIGIN_ADDITIONAL control which origins are allowed to call the API; centralized CORS middleware below.
function corsMiddleware (req, res, next) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return next();

  res.header('Access-Control-Allow-Origin', origin);
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Requested-With, X-CSRF-Token');
  res.header('Access-Control-Expose-Headers', 'X-CSRF-Token');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

const apiRouter = express.Router();
// All API endpoints are now mounted under `/api` for the external frontend SPA (legacy paths remain as compatibility aliases).
apiRouter.use(corsMiddleware);

function registerApiRoute (method, path, handlers, legacyPaths = []) {
  apiRouter[method](path, ...handlers);
  legacyPaths.forEach(legacyPath => {
    app[method](legacyPath, corsMiddleware, ...handlers);
  });
}

// expose Prometheus metrics without auth
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.ws('/ws', (ws, _req) => {
  wsClients.add(ws);
  ws.on('close', () => wsClients.delete(ws));
});

// forward bot status events to websocket clients
botEvents.on('update', data => {
  const payload = JSON.stringify(data);
  wsClients.forEach(client => {
    try { client.send(payload); } catch (e) {}
  });
});

async function broadcastStatus () {
  const queue = await getQueueLength();
  queueLengthGauge.set(queue);
  const conn = {};
  const values = connectionGauge.get().values || [];
  values.forEach(v => {
    conn[v.labels.bot_id] = v.value;
  });
  const { rows } = await pool.query('SELECT id FROM whatsapp_bots');
  const statuses = {};
  rows.forEach(r => {
    statuses[r.id] = getBotStatus(r.id);
  });
  const data = JSON.stringify({ queue, connections: conn, statuses });
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
    'SELECT password_hash, role, totp_secret, organization_id FROM users WHERE username=$1',
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
    req.session.organization_id = user.organization_id;
    return res.redirect('/');
  }

  req.session.user = username;
  req.session.role = user.role;
  req.session.organization_id = user.organization_id;
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
      enabled: !!user.totp_secret
    });
  } catch (err) {
    logger.error('Profile loading failed:', err);
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
  req.session.alert = { type: 'success', message: '2FA disabled' };
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

app.use('/api', apiRouter);

function renderOrganizations (req, res) {
  res.render('organizations', { role: req.session.role });
}

app.get('/', requireEditor, renderOrganizations);
app.get('/organizations', requireEditor, renderOrganizations);

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

async function listOrganizationsHandler (req, res) {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const { where, params } = buildOrgFilters(req);
    const { rows: countRows } = await pool.query(`SELECT COUNT(*) FROM organizations ${where}`, params);
    const total = Number(countRows[0]?.count || 0);
    const listQuery =
      'SELECT id, name, slug, phone, contact_email, contact_phone, status, language, created_at, updated_at, description FROM organizations ' +
      `${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const { rows } = await pool.query(listQuery, [...params, pageSize, (page - 1) * pageSize]);
    res.json({ data: rows, total, page, pageSize });
  } catch (error) {
    logger.error('Failed to list organizations', error);
    res.status(500).json({ error: 'Failed to list organizations' });
  }
}

async function getOrganizationHandler (req, res) {
  try {
    const { rows } = await pool.query(
      'SELECT id, name, slug, phone, contact_email, contact_phone, status, language, instructions, working_hours_start, working_hours_end, description FROM organizations WHERE id=$1',
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Organization not found' });
    res.json(rows[0]);
  } catch (error) {
    logger.error(`Failed to load organization ${req.params.id}`, error);
    res.status(500).json({ error: 'Failed to load organization' });
  }
}

async function createOrganizationHandler (req, res) {
  const {
    name,
    slug,
    phone,
    instructions,
    language,
    status,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    working_hours_start: workingHoursStart,
    working_hours_end: workingHoursEnd,
    description
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!isValidEmail(contactEmail)) return res.status(400).json({ error: 'Invalid email' });

  const normalizedSlug = slugify(slug || name) || `org-${Date.now()}`;
  const normalizedStatus = normalizeStatus(status);

  try {
    const { rows } = await pool.query(
      'INSERT INTO organizations (name, slug, phone, instructions, language, working_hours_start, working_hours_end, status, contact_email, contact_phone, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [
        name,
        normalizedSlug,
        phone,
        instructions,
        language || 'ar',
        workingHoursStart || null,
        workingHoursEnd || null,
        normalizedStatus,
        contactEmail || null,
        contactPhone || null,
        description || null
      ]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    const isConflict = error?.code === '23505';
    logger[isConflict ? 'warn' : 'error']('Failed to create organization', error);
    const statusCode = isConflict ? 409 : 500;
    const message = isConflict ? 'Organization already exists' : 'Failed to create organization';
    res.status(statusCode).json({ error: message });
  }
}

async function updateOrganizationHandler (req, res) {
  const updates = [];
  const params = [];
  let idx = 1;

  const fields = {
    name: req.body.name,
    slug: req.body.slug,
    phone: req.body.phone,
    instructions: req.body.instructions,
    language: req.body.language,
    working_hours_start: req.body.working_hours_start,
    working_hours_end: req.body.working_hours_end,
    status: req.body.status,
    contact_email: req.body.contact_email,
    contact_phone: req.body.contact_phone,
    description: req.body.description
  };

  if (fields.contact_email && !isValidEmail(fields.contact_email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined) {
      if (key === 'slug') {
        const normalized = slugify(value || req.body.name || '');
        updates.push(`${key}=$${idx++}`);
        params.push(normalized || `org-${Date.now()}`);
      } else if (key === 'status') {
        updates.push(`${key}=$${idx++}`);
        params.push(normalizeStatus(value));
      } else {
        updates.push(`${key}=$${idx++}`);
        params.push(value || null);
      }
    }
  });

  updates.push(`updated_at=now()`);

  try {
    const { rows } = await pool.query(
      `UPDATE organizations SET ${updates.join(', ')} WHERE id=$${idx} RETURNING *`,
      [...params, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Organization not found' });
    res.json(rows[0]);
  } catch (error) {
    const isConflict = error?.code === '23505';
    logger[isConflict ? 'warn' : 'error'](`Failed to update organization ${req.params.id}`, error);
    res.status(isConflict ? 409 : 500).json({ error: isConflict ? 'Organization already exists' : 'Failed to update organization' });
  }
}

async function deactivateOrganizationHandler (req, res) {
  try {
    const { rows } = await pool.query(
      'UPDATE organizations SET status=$1, updated_at=now() WHERE id=$2 RETURNING *',
      ['inactive', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Organization not found' });
    res.json(rows[0]);
  } catch (error) {
    logger.error(`Failed to delete organization ${req.params.id}`, error);
    res.status(500).json({ error: 'Failed to delete organization' });
  }
}

registerApiRoute('get', '/organizations', [requireEditor, listOrganizationsHandler]);
registerApiRoute('get', '/organizations/:id', [requireEditor, requireOrgAccess, getOrganizationHandler]);
registerApiRoute('post', '/organizations', [requireAdmin, createOrganizationHandler]);
registerApiRoute('put', '/organizations/:id', [requireEditor, requireOrgAccess, updateOrganizationHandler]);
registerApiRoute('delete', '/organizations/:id', [requireEditor, requireOrgAccess, deactivateOrganizationHandler]);

app.post('/org/:id/assistant', requireEditor, requireOrgAccess, async (req, res) => {
  const { instructions } = req.body;
  if (instructions !== undefined) {
    await pool.query('UPDATE organizations SET instructions=$1 WHERE id=$2', [instructions, req.params.id]);
  }
  await createAssistant(req.params.id);
  res.redirect('/');
});

app.get('/org/:id/assistant', requireEditor, requireOrgAccess, async (req, res) => {
  const { rows } = await pool.query('SELECT instructions FROM organizations WHERE id=$1', [req.params.id]);
  const instructions = rows[0]?.instructions || '';
  res.render('createAssistant', { orgId: req.params.id, instructions });
});

function wantsJson (req) {
  const accept = req.headers.accept || '';
  return accept.includes('application/json');
}

app.get('/org/:id/upload', requireEditor, requireOrgAccess, (req, res) => {
  res.render('upload', {
    orgId: req.params.id,
    error: null,
    allowedFileTypes: formatAllowedFileTypes(),
    maxFileSize: formatFileSize(MAX_FILE_SIZE_BYTES)
  });
});

async function uploadOrganizationFileHandler (req, res) {
  const { filePath } = req.body;
  try {
    const result = await upload(req.params.id, filePath);
    const message = result?.skipped
      ? `File skipped: ${result.reason}`
      : 'File uploaded';

    if (wantsJson(req)) {
      return res.json({ ok: true, message });
    }

    req.session.alert = { type: 'success', message };
    res.redirect('/');
  } catch (error) {
    const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
    const message = error?.message || 'Failed to upload file';
    const logMethod = statusCode >= 500 ? logger.error : logger.warn;
    logMethod.call(logger, `Upload failed for organization ${req.params.id}: ${message}`, error);

    if (wantsJson(req)) {
      return res.status(statusCode).json({ ok: false, message });
    }

    res.status(statusCode);
    return res.render('upload', {
      orgId: req.params.id,
      error: message,
      allowedFileTypes: formatAllowedFileTypes(),
      maxFileSize: formatFileSize(MAX_FILE_SIZE_BYTES)
    });
  }
}

registerApiRoute('post', '/organizations/:id/upload', [requireEditor, requireOrgAccess, uploadOrganizationFileHandler], [
  '/org/:id/upload'
]);

app.get('/org/:id/hours', requireEditor, requireOrgAccess, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT name, working_hours_start, working_hours_end FROM organizations WHERE id=$1',
    [req.params.id]
  );
  const org = rows[0] || {};
  res.render('editHours', {
    orgId: req.params.id,
    name: org.name,
    start: org.working_hours_start || '',
    end: org.working_hours_end || ''
  });
});

app.post('/org/:id/hours', requireEditor, requireOrgAccess, async (req, res) => {
  const { working_hours_start, working_hours_end } = req.body;
  await pool.query(
    'UPDATE organizations SET working_hours_start=$1, working_hours_end=$2 WHERE id=$3',
    [working_hours_start || null, working_hours_end || null, req.params.id]
  );
  res.redirect('/');
});

async function listBotsHandler (req, res) {
  const { rows } = await pool.query(
    'SELECT id, name, assistant_id, status FROM whatsapp_bots WHERE organization_id=$1',
    [req.params.orgId]
  );
  res.json(rows);
}

app.get('/org/:orgId/bots/manage', requireEditor, requireOrgAccess, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, assistant_id, status FROM whatsapp_bots WHERE organization_id=$1',
    [req.params.orgId]
  );
  res.render('bots', { orgId: req.params.orgId, bots: rows, role: req.session.role });
});

app.get('/org/:orgId/bots/new', requireEditor, requireOrgAccess, (req, res) => {
  res.render('newBot', { orgId: req.params.orgId });
});

async function createBotHandler (req, res) {
  const { assistant_id, name, phone } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO whatsapp_bots (organization_id, assistant_id, name, phone, status) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [req.params.orgId, assistant_id, name || null, phone || null, 'stopped']
  );
  if (req.headers.accept === 'application/json') {
    return res.json(rows[0]);
  }
  res.redirect(`/org/${req.params.orgId}/bots/manage`);
}

async function startBotHandler (req, res) {
  const { rows } = await pool.query('SELECT * FROM whatsapp_bots WHERE id=$1', [req.params.botId]);
  const bot = rows[0];
  if (!bot) return res.status(404).send('Not found');
  await startBot(bot);
  res.json({ status: getBotStatus(bot.id) });
}

async function stopBotHandler (req, res) {
  stopBot(req.params.botId);
  res.json({ status: 'stopped' });
}

async function botStatusHandler (req, res) {
  res.json({ status: getBotStatus(req.params.botId) });
}

registerApiRoute('get', '/organizations/:orgId/bots', [requireEditor, requireOrgAccess, listBotsHandler], [
  '/org/:orgId/bots'
]);
registerApiRoute('post', '/organizations/:orgId/bots', [requireEditor, requireOrgAccess, createBotHandler], [
  '/org/:orgId/bots'
]);
registerApiRoute('post', '/bots/:botId/start', [requireEditor, requireBotAccess, startBotHandler], [
  '/bot/:botId/start'
]);
registerApiRoute('post', '/bots/:botId/stop', [requireEditor, requireBotAccess, stopBotHandler], [
  '/bot/:botId/stop'
]);
registerApiRoute('get', '/bots/:botId/status', [requireEditor, requireBotAccess, botStatusHandler], [
  '/bot/:botId/status'
]);

app.get('/users', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, role, organization_id FROM users ORDER BY id');
  const orgs = await listOrganizations();
  res.render('users', { users: rows, orgs });
});

app.get('/users/new', requireAdmin, async (req, res) => {
  const orgs = await listOrganizations();
  res.render('newUser', { orgs });
});

app.post('/users/new', requireAdmin, async (req, res) => {
  const { username, password, role, organization_id } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    'INSERT INTO users (username, password_hash, role, organization_id) VALUES ($1,$2,$3,$4) ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, organization_id=EXCLUDED.organization_id',
    [username, hash, role, organization_id || null]
  );
  res.redirect('/users');
});

app.post('/users/:id/role', requireAdmin, async (req, res) => {
  const { role, organization_id } = req.body;
  await pool.query('UPDATE users SET role=$1, organization_id=$2 WHERE id=$3', [role, organization_id || null, req.params.id]);
  res.redirect('/users');
});

app.post('/users/:id/disable-2fa', requireAdmin, async (req, res) => {
  await pool.query('UPDATE users SET totp_secret=NULL WHERE id=$1', [req.params.id]);
  req.session.alert = { type: 'success', message: '2FA disabled for user' };
  res.redirect('/users');
});

app.get('/schedule/new', requireEditor, async (req, res) => {
  let orgs = await listOrganizations();
  if (req.session.role !== 'admin') {
    orgs = orgs.filter(o => o.id === req.session.organization_id);
  }
  res.render('newSchedule', { orgs });
});

app.post('/schedule/new', requireEditor, requireOrgAccess, async (req, res) => {
  const { organization_id, phone, text, send_at } = req.body;
  await pool.query(
    'INSERT INTO scheduled_messages (organization_id, phone, text, send_at) VALUES ($1,$2,$3,$4)',
    [organization_id, phone, text, send_at]
  );
  res.redirect('/');
});

app.get('/broadcast', requireEditor, async (req, res) => {
  let orgs = await listOrganizations();
  if (req.session.role !== 'admin') {
    orgs = orgs.filter(o => o.id === req.session.organization_id);
  }
  res.render('broadcast', { orgs });
});

app.post('/broadcast', requireEditor, requireOrgAccess, async (req, res) => {
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
      phones: list
    });
  }
  res.redirect('/');
});

app.get('/messages', requireEditor, (req, res) => {
  res.render('messages');
});

app.post('/messages', requireEditor, async (req, res) => {
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
  if (req.session.role !== 'admin') {
    conditions.push(`c.organization_id=$${idx++}`);
    params.push(req.session.organization_id);
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
    sumQuery += ` AND customer_phone=$${sumParams.length + 1}`;
    sumParams.push(phone);
  }
  if (req.session.role !== 'admin') {
    sumQuery += ` AND organization_id=$${sumParams.length + 1}`;
    sumParams.push(req.session.organization_id);
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
        { id: 'attachment_path', title: 'Attachment' }
      ]
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
  req.session.alert = { type: 'success', message: 'FAQ entry deleted' };
  res.redirect('/faq');
});

app.use((err, req, res, next) => {
  if (err && err.code === 'EBADCSRFTOKEN') {
    logger.warn('Invalid CSRF token detected', { path: req.path, method: req.method });
    const accept = req.headers.accept || '';
    if (accept.includes('application/json')) {
      return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    return res.status(403).send('Invalid CSRF token');
  }
  next(err);
});

function startAdminServer () {
  const port = process.env.ADMIN_PORT || 3001;
  statusInterval = setInterval(broadcastStatus, 5000);
  const server = app.listen(port, () => {
    logger.info(`Admin server listening on ${port}`);
  });
  return { server, intervalId: statusInterval };
}

async function stopAdminServer (server, intervalId) {
  if (intervalId) clearInterval(intervalId);
  if (server && server.close) server.close();
  if (messageQueue && messageQueue.close) await messageQueue.close();
}

if (require.main === module) {
  startAdminServer();
}

module.exports = { app, startAdminServer, stopAdminServer };
