(function () {
  // If already authenticated, skip straight to the editor.
  fetch('/api/session').then((r) => r.json()).then((data) => {
    if (data.authenticated) window.location.href = '/';
  });

  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('username').value,
          password: document.getElementById('password').value
        })
      });
      const data = await res.json();
      if (!res.ok) {
        errorBox.textContent = data.error || 'Login failed';
        errorBox.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Login';
        return;
      }
      window.location.href = '/';
    } catch (err) {
      errorBox.textContent = 'Could not reach the server.';
      errorBox.classList.remove('hidden');
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  });
})();
