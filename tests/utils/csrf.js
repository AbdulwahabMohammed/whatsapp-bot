const TOKEN_REGEX = /name="_csrf" value="([^"]+)"/i;

async function getCsrfToken (agent, path = '/login') {
  const res = await agent.get(path);
  if (!res.text) {
    throw new Error(`Empty response when requesting CSRF token from ${path}`);
  }
  const match = TOKEN_REGEX.exec(res.text);
  if (!match) {
    throw new Error(`Unable to locate CSRF token in response from ${path}`);
  }
  return match[1];
}

function buildFormBody (fields) {
  const params = new URLSearchParams();
  Object.entries(fields).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.append(key, value);
    }
  });
  return params.toString();
}

async function postWithCsrf (agent, path, data = {}, options = {}) {
  const csrfToken = await getCsrfToken(agent, options.tokenPath || path);
  let req = agent.post(path).set('Content-Type', 'application/x-www-form-urlencoded');
  if (options.accept) {
    req = req.set('Accept', options.accept);
  }
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      req = req.set(key, value);
    });
  }
  if (typeof options.redirects === 'number') {
    req = req.redirects(options.redirects);
  }
  const body = buildFormBody({ _csrf: csrfToken, ...data });
  return req.send(body);
}

async function postExpectStatus (agent, path, status, data = {}, options = {}) {
  const res = await postWithCsrf(agent, path, data, options);
  expect(res.status).toBe(status);
  return res;
}

module.exports = { getCsrfToken, buildFormBody, postWithCsrf, postExpectStatus };
