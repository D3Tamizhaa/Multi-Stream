'use strict';

const crypto = require('crypto');

module.exports = function registerSceneRoutes(router, { store }) {
  router.get('/api/scenes', async (ctx) => {
    const config = store.load();
    ctx.sendJson(200, { scenes: config.scenes, activeSceneId: config.activeSceneId });
  });

  router.post('/api/scenes', async (ctx) => {
    const { name } = ctx.body;
    if (!name || !name.trim()) {
      ctx.sendJson(400, { error: 'Scene name is required' });
      return;
    }
    const config = store.load();
    const trimmed = name.trim();
    if (config.scenes.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      ctx.sendJson(409, { error: 'A scene with that name already exists' });
      return;
    }
    const scene = { id: 'scene-' + crypto.randomBytes(6).toString('hex'), name: trimmed, sources: [] };
    config.scenes.push(scene);
    if (!config.activeSceneId) config.activeSceneId = scene.id;
    await store.save(config);
    ctx.sendJson(201, { scene });
  });

  router.put('/api/scenes/:id', async (ctx) => {
    const { name } = ctx.body;
    const config = store.load();
    const scene = config.scenes.find((s) => s.id === ctx.params.id);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    if (name && name.trim()) {
      const trimmed = name.trim();
      if (config.scenes.some((s) => s.id !== scene.id && s.name.toLowerCase() === trimmed.toLowerCase())) {
        ctx.sendJson(409, { error: 'A scene with that name already exists' });
        return;
      }
      scene.name = trimmed;
    }
    await store.save(config);
    ctx.sendJson(200, { scene });
  });

  router.delete('/api/scenes/:id', async (ctx) => {
    const config = store.load();
    const idx = config.scenes.findIndex((s) => s.id === ctx.params.id);
    if (idx === -1) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    if (config.scenes.length === 1) {
      ctx.sendJson(400, { error: 'At least one scene must exist' });
      return;
    }
    config.scenes.splice(idx, 1);
    if (config.activeSceneId === ctx.params.id) {
      config.activeSceneId = config.scenes[0].id;
    }
    await store.save(config);
    ctx.sendJson(200, { ok: true, activeSceneId: config.activeSceneId });
  });

  router.post('/api/scenes/:id/move', async (ctx) => {
    const { direction } = ctx.body;
    const config = store.load();
    const idx = config.scenes.findIndex((s) => s.id === ctx.params.id);
    if (idx === -1) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= config.scenes.length) { ctx.sendJson(200, { scenes: config.scenes }); return; }
    [config.scenes[idx], config.scenes[swapWith]] = [config.scenes[swapWith], config.scenes[idx]];
    await store.save(config);
    ctx.sendJson(200, { scenes: config.scenes });
  });

  router.post('/api/scenes/:id/activate', async (ctx) => {
    const config = store.load();
    const scene = config.scenes.find((s) => s.id === ctx.params.id);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    config.activeSceneId = scene.id;
    await store.save(config);
    ctx.sendJson(200, { activeSceneId: config.activeSceneId });
  });
};
