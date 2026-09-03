'use strict';

const { VIDEO_ENCODERS, AUDIO_ENCODERS } = require('../lib/encoderCapabilities');

module.exports = function registerSettingsRoutes(router, { store }) {
  router.get('/api/settings', async (ctx) => {
    const config = store.load();
    ctx.sendJson(200, { settings: config.settings });
  });

  router.get('/api/settings/encoders', async (ctx) => {
    ctx.sendJson(200, {
      video: Object.keys(VIDEO_ENCODERS),
      audio: Object.keys(AUDIO_ENCODERS),
      capabilities: VIDEO_ENCODERS
    });
  });

  router.put('/api/settings/output', async (ctx) => {
    const config = store.load();
    config.settings.output = { ...config.settings.output, ...ctx.body };
    if (ctx.body.simple) config.settings.output.simple = { ...config.settings.output.simple, ...ctx.body.simple };
    if (ctx.body.advanced) {
      config.settings.output.advanced = {
        video: { ...config.settings.output.advanced.video, ...(ctx.body.advanced.video || {}) },
        audio: { ...config.settings.output.advanced.audio, ...(ctx.body.advanced.audio || {}) }
      };
    }
    await store.save(config);
    ctx.sendJson(200, { output: config.settings.output });
  });

  router.put('/api/settings/audio', async (ctx) => {
    const config = store.load();
    config.settings.audio = { ...config.settings.audio, ...ctx.body };
    await store.save(config);
    ctx.sendJson(200, { audio: config.settings.audio });
  });

  router.put('/api/settings/video', async (ctx) => {
    const config = store.load();
    config.settings.video = { ...config.settings.video, ...ctx.body };
    await store.save(config);
    ctx.sendJson(200, { video: config.settings.video });
  });

  router.put('/api/settings/advanced', async (ctx) => {
    const config = store.load();
    config.settings.advanced = {
      ...config.settings.advanced,
      ...ctx.body,
      network: { ...config.settings.advanced.network, ...(ctx.body.network || {}) }
    };
    await store.save(config);
    ctx.sendJson(200, { advanced: config.settings.advanced });
  });
};
