const apiAuthBypass = process.env.DISABLE_AUTH_FOR_API === 'true';

function buildMockUser () {
  return {
    username: 'spa-demo',
    role: 'admin',
    organization_id: null
  };
}

function apiAuthMiddleware (req, res, next) {
  if (req.path.startsWith('/auth')) return next();
  if (apiAuthBypass) return next();
  if (req.session?.user) {
    req.user = {
      username: req.session.user,
      role: req.session.role,
      organization_id: req.session.organization_id
    };
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized', code: 'ERR_UNAUTHORIZED' });
}

function loginHandler (_req, res) {
  if (apiAuthBypass) {
    return res.status(200).json({ user: buildMockUser(), message: 'Auth bypass enabled (development only)' });
  }
  return res.status(501).json({ error: 'Not implemented yet', code: 'ERR_NOT_IMPLEMENTED' });
}

function logoutHandler (_req, res) {
  if (apiAuthBypass) {
    return res.status(200).json({ message: 'Logged out (noop with bypass)' });
  }
  return res.status(501).json({ error: 'Not implemented yet', code: 'ERR_NOT_IMPLEMENTED' });
}

function meHandler (_req, res) {
  if (apiAuthBypass) {
    return res.status(200).json({ user: buildMockUser(), bypass: true });
  }
  return res.status(501).json({ error: 'Not implemented yet', code: 'ERR_NOT_IMPLEMENTED' });
}

module.exports = {
  apiAuthMiddleware,
  loginHandler,
  logoutHandler,
  meHandler
};
