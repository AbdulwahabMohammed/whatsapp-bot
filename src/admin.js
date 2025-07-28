const express = require('express');
const path = require('path');
const { createAssistant } = require('./assistant');
const { upload } = require('./scripts/uploadFile');
const { createOrganization, listOrganizations } = require('./index');
const logger = require('./logger');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.urlencoded({ extended: true }));

// Basic auth middleware
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Authentication required.');
  }
  const [, base64] = auth.split(' ');
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');
  if (pass !== process.env.ADMIN_PASSWORD) {
    res.set('WWW-Authenticate', 'Basic realm="admin"');
    return res.status(401).send('Access denied');
  }
  req.user = user;
  next();
});

app.get('/', async (req, res) => {
  const orgs = await listOrganizations();
  res.render('list', { orgs });
});

app.get('/org/new', (req, res) => {
  res.render('newOrg');
});

app.post('/org/new', async (req, res) => {
  const { name, phone } = req.body;
  await createOrganization(name, phone);
  res.redirect('/');
});

app.post('/org/:id/assistant', async (req, res) => {
  await createAssistant(req.params.id);
  res.redirect('/');
});

app.get('/org/:id/assistant', (req, res) => {
  res.render('createAssistant', { orgId: req.params.id });
});

app.get('/org/:id/upload', (req, res) => {
  res.render('upload', { orgId: req.params.id });
});

app.post('/org/:id/upload', async (req, res) => {
  const { filePath } = req.body;
  await upload(req.params.id, filePath);
  res.redirect('/');
});

const port = process.env.ADMIN_PORT || 3001;
app.listen(port, () => {
  logger.info(`Admin server listening on ${port}`);
});

module.exports = app;
