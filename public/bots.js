function getCsrfHelpers () {
  const getToken =
    typeof window !== 'undefined' && typeof window.getCsrfToken === 'function'
      ? window.getCsrfToken
      : () => {
        if (typeof document === 'undefined') return null;
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
      };

  const updateToken =
    typeof window !== 'undefined' && typeof window.updateCsrfToken === 'function'
      ? window.updateCsrfToken
      : token => {
        if (!token || typeof document === 'undefined') return;
        const meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) meta.setAttribute('content', token);
        document.querySelectorAll('input[name="_csrf"]').forEach(input => {
          input.value = token;
        });
      };

  return { getToken, updateToken };
}

function initBotsPage (wsFactory) {
  const { getToken, updateToken } = getCsrfHelpers();
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  const ws = wsFactory ? wsFactory(url) : new WebSocket(url);
  ws.onmessage = evt => {
    let data;
    try { data = JSON.parse(evt.data); } catch (e) { return; }
    if (!data.botId) return;
    const row = document.querySelector(`tr[data-bot-id="${data.botId}"]`);
    if (!row) return;
    const statusCell = row.querySelector('.status');
    if (statusCell) statusCell.textContent = data.status;
    const btn = row.querySelector('button.start-stop');
    if (btn) {
      btn.textContent = data.status === 'connected' ? 'Stop' : 'Start';
    }
    if (data.qr) {
      const img = document.getElementById('qrImage');
      if (img) img.src = data.qr;
      const modal = document.getElementById('qrModal');
      if (modal) modal.style.display = 'block';
    }
  };

  document.querySelectorAll('button.start-stop').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('tr');
      const id = row.dataset.botId;
      const action = btn.textContent.trim() === 'Start' ? 'start' : 'stop';
      const headers = {};
      const csrfToken = getToken();
      if (csrfToken) headers['CSRF-Token'] = csrfToken;
      fetch(`/bot/${id}/${action}`, { method: 'POST', headers })
        .then(res => {
          const refreshed = res.headers.get('x-csrf-token');
          if (refreshed) updateToken(refreshed);
          return res.json();
        })
        .then(data => {
          btn.textContent = data.status === 'connected' ? 'Stop' : 'Start';
          const statusCell = row.querySelector('.status');
          if (statusCell) statusCell.textContent = data.status;
        });
    });
  });
}

if (typeof window !== 'undefined') {
  window.initBotsPage = initBotsPage;
}

if (typeof module !== 'undefined') {
  module.exports = { initBotsPage };
}
