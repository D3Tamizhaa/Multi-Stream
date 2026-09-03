'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOADS_DIR } = require('../lib/store');

const ALLOWED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.tga', '.bmp'];
const ALLOWED_MEDIA_EXT = ['.mp4', '.mp3', '.webm'];

function findScene(config, sceneId) {
  return config.scenes.find((s) => s.id === sceneId);
}

function saveUploadedFile(file) {
  const ext = path.extname(file.filename).toLowerCase();
  const storedName = crypto.randomBytes(8).toString('hex') + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, storedName), file.data);
  return storedName;
}

module.exports = function registerSourceRoutes(router, { store }) {
  router.get('/api/scenes/:sceneId/sources', async (ctx) => {
    const config = store.load();
    const scene = findScene(config, ctx.params.sceneId);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    ctx.sendJson(200, { sources: scene.sources });
  });

  router.post('/api/scenes/:sceneId/sources', async (ctx) => {
    const config = store.load();
    const scene = findScene(config, ctx.params.sceneId);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }

    const { type } = ctx.body;
    const name = (ctx.body.name || '').trim();
    if (!name) { ctx.sendJson(400, { error: 'Source name is required' }); return; }
    if (scene.sources.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      ctx.sendJson(409, { error: 'A source with that name already exists in this scene' });
      return;
    }

    const base = {
      id: 'src-' + crypto.randomBytes(6).toString('hex'),
      name,
      type,
      locked: false,
      visible: true,
      x: Number(ctx.body.x) || 0,
      y: Number(ctx.body.y) || 0
    };

    if (type === 'image') {
      const file = ctx.files.file;
      if (!file) { ctx.sendJson(400, { error: 'Image file is required' }); return; }
      const ext = path.extname(file.filename).toLowerCase();
      if (!ALLOWED_IMAGE_EXT.includes(ext)) {
        ctx.sendJson(400, { error: `Unsupported image format ${ext}. Allowed: ${ALLOWED_IMAGE_EXT.join(', ')}` });
        return;
      }
      base.file = saveUploadedFile(file);
      base.originalFilename = file.filename;
      base.width = Number(ctx.body.width) || 320;
      base.height = Number(ctx.body.height) || 240;
    } else if (type === 'media') {
      const file = ctx.files.file;
      if (!file) { ctx.sendJson(400, { error: 'Media file is required' }); return; }
      const ext = path.extname(file.filename).toLowerCase();
      if (!ALLOWED_MEDIA_EXT.includes(ext)) {
        ctx.sendJson(400, { error: `Unsupported media format ${ext}. Allowed: ${ALLOWED_MEDIA_EXT.join(', ')}` });
        return;
      }
      base.file = saveUploadedFile(file);
      base.originalFilename = file.filename;
      base.loop = ctx.body.loop === 'true' || ctx.body.loop === true;
      base.width = Number(ctx.body.width) || 320;
      base.height = Number(ctx.body.height) || 240;
      base.volume = 1;
      base.muted = false;
    } else if (type === 'text') {
      base.text = ctx.body.text || '';
      base.fontFamily = ctx.body.fontFamily || 'Sans';
      base.fontSize = Number(ctx.body.fontSize) || 32;
      base.color = ctx.body.color || '#FFFFFFFF';
      base.width = Number(ctx.body.width) || 200;
      base.height = Number(ctx.body.height) || 60;
    } else {
      ctx.sendJson(400, { error: 'type must be image, media, or text' });
      return;
    }

    scene.sources.push(base);
    await store.save(config);
    ctx.sendJson(201, { source: base });
  });

  router.put('/api/scenes/:sceneId/sources/:id', async (ctx) => {
    const config = store.load();
    const scene = findScene(config, ctx.params.sceneId);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    const source = scene.sources.find((s) => s.id === ctx.params.id);
    if (!source) { ctx.sendJson(404, { error: 'Source not found' }); return; }
    if (source.locked && ctx.body.locked !== false) {
      // Locked sources may still be renamed/relabeled via explicit unlock, but reject
      // silent geometry changes while locked.
      const geometryKeys = ['x', 'y', 'width', 'height'];
      if (geometryKeys.some((k) => k in ctx.body)) {
        ctx.sendJson(423, { error: 'Source is locked' });
        return;
      }
    }

    const allowedFields = ['name', 'x', 'y', 'width', 'height', 'locked', 'visible', 'loop', 'volume', 'muted', 'text', 'fontFamily', 'fontSize', 'color'];
    for (const key of allowedFields) {
      if (key in ctx.body) {
        source[key] = ['x', 'y', 'width', 'height', 'fontSize', 'volume'].includes(key) ? Number(ctx.body[key]) : ctx.body[key];
      }
    }
    await store.save(config);
    ctx.sendJson(200, { source });
  });

  router.delete('/api/scenes/:sceneId/sources/:id', async (ctx) => {
    const config = store.load();
    const scene = findScene(config, ctx.params.sceneId);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    const idx = scene.sources.findIndex((s) => s.id === ctx.params.id);
    if (idx === -1) { ctx.sendJson(404, { error: 'Source not found' }); return; }
    scene.sources.splice(idx, 1);
    await store.save(config);
    ctx.sendJson(200, { ok: true });
  });

  router.post('/api/scenes/:sceneId/sources/:id/move', async (ctx) => {
    const { direction } = ctx.body;
    const config = store.load();
    const scene = findScene(config, ctx.params.sceneId);
    if (!scene) { ctx.sendJson(404, { error: 'Scene not found' }); return; }
    const idx = scene.sources.findIndex((s) => s.id === ctx.params.id);
    if (idx === -1) { ctx.sendJson(404, { error: 'Source not found' }); return; }
    const swapWith = direction === 'up' ? idx + 1 : idx - 1; // "up" in the list raises stacking order (later = on top)
    if (swapWith < 0 || swapWith >= scene.sources.length) { ctx.sendJson(200, { sources: scene.sources }); return; }
    [scene.sources[idx], scene.sources[swapWith]] = [scene.sources[swapWith], scene.sources[idx]];
    await store.save(config);
    ctx.sendJson(200, { sources: scene.sources });
  });
};
