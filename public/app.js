function getCsrfToken () {
  if (typeof document === 'undefined') return '';
  const meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.getAttribute('content') || '' : '';
}

function updateCsrfToken (token) {
  if (!token || typeof document === 'undefined') return;
  const meta = document.querySelector('meta[name="csrf-token"]');
  if (meta) meta.setAttribute('content', token);
  document.querySelectorAll('input[name="_csrf"]').forEach(input => {
    input.value = token;
  });
}

if (typeof window !== 'undefined') {
  window.getCsrfToken = getCsrfToken;
  window.updateCsrfToken = updateCsrfToken;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', e => {
      const msg = form.getAttribute('data-confirm') || 'Are you sure?';
      if (!confirm(msg)) {
        e.preventDefault();
      }
    });
  });
});
