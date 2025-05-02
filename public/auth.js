// public/auth.js
const form           = document.getElementById('authForm');
const toastContainer = document.getElementById('toastContainer');
const redirectInput  = document.getElementById('redirectInput');
const toRegister     = document.getElementById('toRegister');
const toLogin        = document.getElementById('toLogin');
const guestBtn       = document.getElementById('guestBtn');

const params        = new URLSearchParams(window.location.search);
const redirectParam = params.get('redirect') || '/';
redirectInput.value = redirectParam;
if (toRegister) toRegister.href += `?redirect=${encodeURIComponent(redirectParam)}`;
if (toLogin)    toLogin.href    += `?redirect=${encodeURIComponent(redirectParam)}`;

function showToast(type, msg) {
  const el = document.createElement('div');
  el.className = `toast align-items-center text-bg-${type} border-0`;
  el.role = 'alert'; el.ariaLive = 'assertive'; el.ariaAtomic = 'true';
  el.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${msg}</div>
      <button type="button"
        class="btn-close btn-close-white me-2 m-auto"
        data-bs-dismiss="toast"
        aria-label="Close"></button>
    </div>`;
  toastContainer.appendChild(el);
  new bootstrap.Toast(el, { delay:3000 }).show();
  el.addEventListener('hidden.bs.toast', () => el.remove());
}

// login / register / guest all in one
form.addEventListener('submit', async e => {
  e.preventDefault();
  const action = form.dataset.action;
  const payload = {
    username: form.username.value,
    password: form.password?.value || ''
  };
  const res  = await fetch(action, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify(payload)
  });
  const obj  = await res.json();
  if (obj.success) {
    window.location.href = redirectParam;
  } else {
    showToast('warning', obj.message);
  }
});

// bouton invité pour la page login uniquement
if (guestBtn) {
  guestBtn.addEventListener('click', () => {
    window.location.href = `/guest?redirect=${encodeURIComponent(redirectParam)}`;
  });
}
