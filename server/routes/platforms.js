'use strict';

const crypto = require('crypto');

const SERVICE_URLS = {
  YouTube: 'rtmp://a.rtmp.youtube.com/live2',
  Facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
  Twitch: 'rtmp://live.twitch.tv/app',
  Kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net'
};

module.exports = function registerPlatformRoutes(router, { store }) {
  router.get('/api/platforms', async (ctx) => {
    const config = store.load();
    ctx.sendJson(200, { platforms: config.platforms });
  });

  router.post('/api/platforms', async (ctx) => {
    const { service, server: rtmpServer, streamKey, name } = ctx.body;
    if (!service) { ctx.sendJson(400, { error: 'Service is required' }); return; }
    if (service === 'RTMP' && !name) {
      ctx.sendJson(400, { error: 'A service name is required for custom RTMP' });
      return;
    }
    if (service === 'RTMP' && !rtmpServer) {
      ctx.sendJson(400, { error: 'Server URL is required for custom RTMP' });
      return;
    }
    const config = store.load();
    const platform = {
      id: 'plat-' + crypto.randomBytes(6).toString('hex'),
      service,
      name: service === 'RTMP' ? name.trim() : service,
      server: service === 'RTMP' ? rtmpServer.trim() : (SERVICE_URLS[service] || ''),
      streamKey: streamKey || '',
      enabled: true
    };
    config.platforms.push(platform);
    await store.save(config);
    ctx.sendJson(201, { platform });
  });

  router.put('/api/platforms/:id', async (ctx) => {
    const config = store.load();
    const platform = config.platforms.find((p) => p.id === ctx.params.id);
    if (!platform) { ctx.sendJson(404, { error: 'Platform not found' }); return; }
    const { service, server: rtmpServer, streamKey, name, enabled } = ctx.body;
    if (service) {
      platform.service = service;
      platform.name = service === 'RTMP' ? (name || platform.name) : service;
      platform.server = service === 'RTMP' ? (rtmpServer || platform.server) : (SERVICE_URLS[service] || '');
    }
    if (streamKey !== undefined) platform.streamKey = streamKey;
    if (enabled !== undefined) platform.enabled = enabled === true || enabled === 'true';
    await store.save(config);
    ctx.sendJson(200, { platform });
  });

  router.delete('/api/platforms/:id', async (ctx) => {
    const config = store.load();
    const idx = config.platforms.findIndex((p) => p.id === ctx.params.id);
    if (idx === -1) { ctx.sendJson(404, { error: 'Platform not found' }); return; }
    config.platforms.splice(idx, 1);
    await store.save(config);
    ctx.sendJson(200, { ok: true });
  });
};
