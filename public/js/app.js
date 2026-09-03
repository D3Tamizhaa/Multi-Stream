(function () {
  const editorView = document.getElementById('editor-view');
  const settingsView = document.getElementById('settings-view');
  const menuBtn = document.getElementById('menu-btn');
  const menuDropdown = document.getElementById('menu-dropdown');
  const userMenuBtn = document.getElementById('user-menu-btn');
  const userDropdown = document.getElementById('user-dropdown');

  function closeDropdowns() {
    menuDropdown.classList.add('hidden');
    userDropdown.classList.add('hidden');
  }
  menuBtn.addEventListener('click', (e) => { e.stopPropagation(); userDropdown.classList.add('hidden'); menuDropdown.classList.toggle('hidden'); });
  userMenuBtn.addEventListener('click', (e) => { e.stopPropagation(); menuDropdown.classList.add('hidden'); userDropdown.classList.toggle('hidden'); });
  document.addEventListener('click', closeDropdowns);
  menuDropdown.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeDropdowns));

  document.getElementById('logout-btn').addEventListener('click', async () => {
    await api.logout();
    window.location.href = '/login.html';
  });

  function route() {
    closeDropdowns();
    const hash = window.location.hash || '#/editor';
    const parts = hash.replace('#/', '').split('/');
    if (parts[0] === 'settings') {
      editorView.classList.add('hidden');
      settingsView.classList.remove('hidden');
      settingsView_render(parts[1] || 'authorization');
    } else {
      settingsView.classList.add('hidden');
      editorView.classList.remove('hidden');
      workspace.render();
      store.refreshStreamStatus();
    }
  }

  function settingsView_render(section) {
    window.settingsView.renderSettingsPage(section);
  }

  window.addEventListener('hashchange', route);

  async function boot() {
    let session;
    try { session = await api.session(); } catch (e) { session = { authenticated: false }; }
    if (!session.authenticated) {
      window.location.href = '/login.html';
      return;
    }
    document.getElementById('username-label').textContent = session.username;
    document.getElementById('user-menu-username').textContent = session.username;
    document.getElementById('user-avatar').textContent = (session.username || '?')[0].toUpperCase();

    await store.loadAll();
    panels.renderAll();
    route();
  }

  boot();
})();
