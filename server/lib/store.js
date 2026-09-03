'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

function defaultConfig() {
  return {
    auth: {
      username: 'admin',
      passwordHash: hashPassword('admin')
    },
    scenes: [
      { id: 'scene-default', name: 'Scene 1', sources: [] }
    ],
    activeSceneId: 'scene-default',
    platforms: [],
    settings: {
      output: {
        mode: 'Simple',
        simple: {
          videoEncoder: 'H.264',
          videoBitrate: 2500,
          audioEncoder: 'AAC',
          audioBitrate: 160,
          preset: 'Very Fast'
        },
        advanced: {
          video: {
            encoder: 'H.264',
            rateControl: 'CBR',
            bitrate: 2500,
            keyframeInterval: 2,
            preset: 'Very Fast',
            profile: 'High',
            tune: 'None'
          },
          audio: {
            encoder: 'AAC',
            bitrate: 160
          }
        }
      },
      audio: {
        sampleRate: '48 kHz',
        channels: 'Stereo'
      },
      video: {
        resolution: '1920x1080',
        custom: false,
        customWidth: 1920,
        customHeight: 1080,
        fps: 30
      },
      advanced: {
        autoReconnect: true,
        network: {
          bindToInterface: '',
          bufferSizeKb: 1024
        }
      }
    }
  };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2));
  }
}

function load() {
  ensureDataDir();
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    const fresh = defaultConfig();
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(fresh, null, 2));
    return fresh;
  }
}

let writeQueue = Promise.resolve();
function save(config) {
  // Serialize writes so rapid successive updates from the UI never interleave.
  writeQueue = writeQueue.then(() => fs.promises.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2)));
  return writeQueue;
}

module.exports = {
  DATA_DIR,
  UPLOADS_DIR,
  load,
  save,
  hashPassword,
  verifyPassword
};
