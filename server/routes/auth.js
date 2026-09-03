'use strict';

module.exports = function registerAuthRoutes(router, { store, session }) {
  router.post('/api/login', async (ctx) => {
    const { username, password } = ctx.body;
    const config = store.load();
    if (
      username === config.auth.username &&
      typeof password === 'string' &&
      store.verifyPassword(password, config.auth.passwordHash)
    ) {
      const token = session.createSession(username);
      session.setSessionCookie(ctx.res, token);
      ctx.sendJson(200, { ok: true, username });
    } else {
      ctx.sendJson(401, { error: 'Invalid username or password' });
    }
  });

  router.post('/api/logout', async (ctx) => {
    if (ctx.session) session.destroySession(ctx.session.token);
    session.clearSessionCookie(ctx.res);
    ctx.sendJson(200, { ok: true });
  });

  router.get('/api/session', async (ctx) => {
    if (ctx.session) {
      ctx.sendJson(200, { authenticated: true, username: ctx.session.username });
    } else {
      ctx.sendJson(200, { authenticated: false });
    }
  });

  router.put('/api/auth/credentials', async (ctx) => {
    const { username, currentPassword, newPassword } = ctx.body;
    const config = store.load();
    if (!store.verifyPassword(currentPassword || '', config.auth.passwordHash)) {
      ctx.sendJson(400, { error: 'Current password is incorrect' });
      return;
    }
    if (username && username.trim()) config.auth.username = username.trim();
    if (newPassword && newPassword.trim()) config.auth.passwordHash = store.hashPassword(newPassword.trim());
    await store.save(config);
    ctx.sendJson(200, { ok: true, username: config.auth.username });
  });
};
