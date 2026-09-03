'use strict';

module.exports = function registerStreamRoutes(router, { store, engine }) {
  function buildContext() {
    const config = store.load();
    const scene = config.scenes.find((s) => s.id === config.activeSceneId) || config.scenes[0];
    return { scene, settings: config.settings, platforms: config.platforms };
  }

  router.post('/api/stream/start', async (ctx) => {
    if (engine.isStreaming) { ctx.sendJson(409, { error: 'Already streaming' }); return; }
    try {
      engine.start({ ...buildContext(), refresh: buildContext });
      ctx.sendJson(200, { ok: true, status: engine.status() });
    } catch (err) {
      ctx.sendJson(400, { error: err.message });
    }
  });

  router.post('/api/stream/stop', async (ctx) => {
    engine.stop();
    ctx.sendJson(200, { ok: true, status: engine.status() });
  });

  router.get('/api/stream/status', async (ctx) => {
    const config = store.load();
    ctx.sendJson(200, {
      ...engine.status(),
      platforms: config.platforms.map((p) => ({ id: p.id, name: p.name, enabled: p.enabled }))
    });
  });
};
