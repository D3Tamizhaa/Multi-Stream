'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { EventEmitter } = require('events');
const { UPLOADS_DIR } = require('./store');
const { VIDEO_ENCODERS, AUDIO_ENCODERS } = require('./encoderCapabilities');

const RESOLUTIONS = {
  '1920x1080': [1920, 1080],
  '1280x720': [1280, 720],
  '852x480': [852, 480],
  '640x360': [640, 360]
};

const RTMP_SERVERS = {
  YouTube: 'rtmp://a.rtmp.youtube.com/live2',
  Facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
  Twitch: 'rtmp://live.twitch.tv/app',
  Kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net:443/app'
};

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

function hexToDrawtextColor(hexOrRgba) {
  // Accept #RRGGBB, #RRGGBBAA, or rgba(r,g,b,a) and emit ffmpeg's 0xRRGGBB@alpha form.
  let value = String(hexOrRgba).trim();
  const rgbaMatch = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const hex = [r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    return a !== undefined ? `0x${hex}@${a}` : `0x${hex}`;
  }
  if (value.startsWith('#')) value = value.slice(1);
  if (value.length === 8) {
    const rgb = value.slice(0, 6);
    const alpha = (parseInt(value.slice(6, 8), 16) / 255).toFixed(3);
    return `0x${rgb}@${alpha}`;
  }
  return `0x${value}`;
}

function resolveResolution(videoSettings) {
  if (videoSettings.custom) {
    return [Number(videoSettings.customWidth) || 1920, Number(videoSettings.customHeight) || 1080];
  }
  return RESOLUTIONS[videoSettings.resolution] || RESOLUTIONS['1920x1080'];
}

function rateControlArgs(encoderKey, rateControl, bitrateKbps) {
  const kbps = Number(bitrateKbps) || 2500;
  const family = encoderKey;
  switch (rateControl) {
    case 'CBR':
      return ['-b:v', `${kbps}k`, '-minrate', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`];
    case 'VBR':
    case 'ABR':
      return ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`];
    case 'VBV':
      return ['-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${Math.round(kbps * 1.5)}k`];
    case 'CRF':
      return ['-crf', String(kbps <= 51 ? kbps : 23)];
    case 'CQ':
      if (family.includes('NVIDIA')) return ['-rc', 'vbr', '-cq', String(kbps <= 51 ? kbps : 23)];
      return ['-crf', String(kbps <= 63 ? kbps : 32), '-b:v', '0'];
    case 'QP':
      return ['-qp', String(kbps <= 51 ? kbps : 23)];
    case 'None':
    default:
      return [];
  }
}

const PRESET_MAP = {
  'Ultra Fast': 'ultrafast', 'Super Fast': 'superfast', 'Very Fast': 'veryfast',
  'Faster': 'faster', 'Fast': 'fast', 'Medium': 'medium', 'Slow': 'slow',
  'Slower': 'slower', 'Very Slow': 'veryslow', 'Placebo': 'placebo'
};
const PROFILE_MAP = {
  'Baseline': 'baseline', 'Main': 'main', 'High': 'high',
  'High 10': 'main10', 'High 422': 'high422', 'High 444': 'high444'
};
const TUNE_MAP = {
  'Zero latency': 'zerolatency', 'Film': 'film', 'Animation': 'animation',
  'Grain': 'grain', 'Still image': 'stillimage', 'PSNR': 'psnr', 'SSIM': 'ssim', 'Fast decode': 'fastdecode'
};

function absFile(filename) {
  return path.join(UPLOADS_DIR, filename);
}

/**
 * Build the full argv for ffmpeg from the active scene + settings + enabled platforms.
 * Composition strategy: every visible source is a real ffmpeg input (image loop, looped
 * or single-shot media) laid onto a black canvas with `overlay`, in scene stacking order.
 * Text sources are pure `drawtext` filters, no extra input needed. Audio from media
 * sources is volume-adjusted per the mixer and combined with `amix`. The composited
 * output is then duplicated to every enabled platform with the `tee` muxer so one encode
 * feeds all destinations at once.
 */
function buildArgs({ scene, settings, platforms }) {
  const [width, height] = resolveResolution(settings.video);
  const fps = Number(settings.video.fps) || 30;

  const visibleSources = (scene.sources || []).filter((s) => s.visible !== false);

  // The base canvas is a real, real-time-paced input (not an inline filter source) so the
  // whole graph is paced to wall-clock time even for a text-only scene with no media/image
  // inputs to pace against.
  const inputArgs = ['-re', '-f', 'lavfi', '-i', `color=size=${width}x${height}:rate=${fps}:color=black`];
  const filterParts = [];
  let lastVideo = '0:v';
  const audioLabels = [];
  let inputIndex = 1;

  visibleSources.forEach((source, idx) => {
    const w = Math.max(1, Math.round(source.width || 320));
    const h = Math.max(1, Math.round(source.height || 240));
    const x = Math.round(source.x || 0);
    const y = Math.round(source.y || 0);

    if (source.type === 'image') {
      // -re paces this input to real (wall-clock) time. Without it ffmpeg decodes as fast
      // as the CPU allows, which for a live RTMP push means the whole graph races far ahead
      // of real time instead of streaming at a steady, playable rate.
      inputArgs.push('-re', '-loop', '1', '-framerate', String(fps), '-i', absFile(source.file));
      const scaled = `simg${idx}`;
      const ov = `ov${idx}`;
      filterParts.push(`[${inputIndex}:v]scale=${w}:${h}[${scaled}]`);
      filterParts.push(`[${lastVideo}][${scaled}]overlay=${x}:${y}:shortest=0[${ov}]`);
      lastVideo = ov;
      inputIndex += 1;
    } else if (source.type === 'media') {
      inputArgs.push('-re');
      if (source.loop) inputArgs.push('-stream_loop', '-1');
      inputArgs.push('-i', absFile(source.file));
      const isAudioOnly = /\.mp3$/i.test(source.file || '');
      if (!isAudioOnly) {
        const scaled = `smed${idx}`;
        const ov = `ov${idx}`;
        filterParts.push(`[${inputIndex}:v]scale=${w}:${h},setpts=PTS-STARTPTS[${scaled}]`);
        filterParts.push(`[${lastVideo}][${scaled}]overlay=${x}:${y}:shortest=0[${ov}]`);
        lastVideo = ov;
      }
      const vol = source.muted ? 0 : (typeof source.volume === 'number' ? source.volume : 1);
      const aLabel = `amed${idx}`;
      filterParts.push(`[${inputIndex}:a]volume=${vol},asetpts=PTS-STARTPTS[${aLabel}]`);
      audioLabels.push(`[${aLabel}]`);
      inputIndex += 1;
    } else if (source.type === 'text') {
      const ov = `ovt${idx}`;
      const fontsize = Math.max(1, Math.round(source.fontSize || 32));
      const color = hexToDrawtextColor(source.color || '#FFFFFFFF');
      const fontfileArg = source.fontFile ? `:fontfile='${absFile(source.fontFile).replace(/\\/g, '\\\\').replace(/:/g, '\\:')}'` : '';
      filterParts.push(
        `[${lastVideo}]drawtext=text='${escapeDrawtext(source.text || '')}'${fontfileArg}:fontsize=${fontsize}:fontcolor=${color}:x=${x}:y=${y}[${ov}]`
      );
      lastVideo = ov;
    }
  });

  // Final video label
  filterParts.push(`[${lastVideo}]format=yuv420p[outv]`);

  // Audio mix (or silence if nothing produces audio)
  let outAudioLabel;
  if (audioLabels.length > 0) {
    filterParts.push(`${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=0[outa]`);
    outAudioLabel = 'outa';
  } else {
    filterParts.push(`anullsrc=channel_layout=stereo:sample_rate=48000[outa]`);
    outAudioLabel = 'outa';
  }

  const output = settings.output;
  const isSimple = output.mode === 'Simple';

  const videoEncoderKey = isSimple ? output.simple.videoEncoder : output.advanced.video.encoder;
  const videoEncoderInfo = VIDEO_ENCODERS[videoEncoderKey] || VIDEO_ENCODERS['H.264'];
  const audioEncoderKey = isSimple ? output.simple.audioEncoder : output.advanced.audio.encoder;
  const audioEncoderFfmpeg = AUDIO_ENCODERS[audioEncoderKey] || 'aac';

  const encodeArgs = [];
  if (videoEncoderInfo.ffmpeg === 'copy') {
    encodeArgs.push('-c:v', 'copy');
  } else {
    encodeArgs.push('-c:v', videoEncoderInfo.ffmpeg);
    if (isSimple) {
      encodeArgs.push(...rateControlArgs(videoEncoderKey, 'CBR', output.simple.videoBitrate));
      const presetFfmpeg = PRESET_MAP[output.simple.preset];
      if (presetFfmpeg && videoEncoderInfo.preset.includes(output.simple.preset)) encodeArgs.push('-preset', presetFfmpeg);
    } else {
      const v = output.advanced.video;
      encodeArgs.push(...rateControlArgs(videoEncoderKey, v.rateControl, v.bitrate));
      if (v.keyframeInterval) encodeArgs.push('-g', String(Math.round(Number(v.keyframeInterval) * fps)));
      const presetFfmpeg = PRESET_MAP[v.preset];
      if (presetFfmpeg && videoEncoderInfo.preset.includes(v.preset)) encodeArgs.push('-preset', presetFfmpeg);
      const profileFfmpeg = PROFILE_MAP[v.profile];
      if (profileFfmpeg && videoEncoderInfo.profile.includes(v.profile)) encodeArgs.push('-profile:v', profileFfmpeg);
      const tuneFfmpeg = TUNE_MAP[v.tune];
      if (tuneFfmpeg && videoEncoderInfo.tune.includes(v.tune)) encodeArgs.push('-tune', tuneFfmpeg);
    }
  }

  if (audioEncoderFfmpeg === 'copy') {
    encodeArgs.push('-c:a', 'copy');
  } else {
    encodeArgs.push('-c:a', audioEncoderFfmpeg);
    const audioBitrate = isSimple ? output.simple.audioBitrate : output.advanced.audio.bitrate;
    encodeArgs.push('-b:a', `${Number(audioBitrate) || 160}k`);
  }

  const sampleRate = settings.audio.sampleRate === '44.1 kHz' ? 44100 : 48000;
  const channelMap = { Mono: 1, Stereo: 2, '5.1 surround': 6, '7.1 surround': 8 };
  const channels = channelMap[settings.audio.channels] || 2;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'info',
    ...inputArgs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[outv]',
    '-map', `[${outAudioLabel}]`,
    '-r', String(fps),
    '-s', `${width}x${height}`,
    '-ar', String(sampleRate),
    '-ac', String(channels),
    ...encodeArgs
  ];

  const targets = platforms
    .filter((p) => p.enabled && p.streamKey)
    .map((p) => {
      const server = p.service === 'RTMP' ? p.server : (RTMP_SERVERS[p.service] || p.server);
      const url = `${server.replace(/\/$/, '')}/${p.streamKey}`;
      return url;
    });

  if (targets.length === 0) {
    throw new Error('No enabled platform has a stream key configured.');
  }

  if (targets.length === 1) {
    args.push('-f', 'flv', targets[0]);
  } else {
    const teeTargets = targets.map((url) => `[f=flv]${url}`).join('|');
    args.push('-f', 'tee', teeTargets);
  }

  return args;
}

class StreamEngine extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.startedAt = null;
    this.stopping = false;
    this.lastError = null;
    this.lastArgs = null;
    this.autoReconnect = false;
    this.getContext = null; // function returning { scene, settings, platforms }
  }

  get isStreaming() {
    return !!this.process;
  }

  status() {
    return {
      streaming: this.isStreaming,
      uptimeSeconds: this.startedAt ? Math.floor((Date.now() - this.startedAt) / 1000) : 0,
      lastError: this.lastError
    };
  }

  start(context) {
    if (this.isStreaming) throw new Error('Already streaming.');
    this.getContext = context.refresh;
    this.autoReconnect = !!context.settings.advanced.autoReconnect;
    this.lastError = null;
    this._spawn(context);
  }

  _spawn(context) {
    const args = buildArgs(context);
    this.lastArgs = args;
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = proc;
    this.startedAt = Date.now();
    this.stopping = false;

    let stderrTail = '';
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-4000);
      this.emit('log', chunk.toString());
    });

    proc.on('exit', (code, signal) => {
      this.process = null;
      this.startedAt = null;
      this.emit('exit', { code, signal });
      if (!this.stopping && code !== 0) {
        this.lastError = `ffmpeg exited unexpectedly (code ${code}). Last output: ${stderrTail.slice(-500)}`;
        if (this.autoReconnect) {
          setTimeout(() => {
            if (!this.isStreaming && this.getContext) {
              try {
                this._spawn(this.getContext());
              } catch (e) {
                this.lastError = e.message;
              }
            }
          }, 3000);
        }
      }
    });

    proc.on('error', (err) => {
      this.lastError = `Failed to launch ffmpeg: ${err.message}. Is ffmpeg installed and on PATH?`;
      this.process = null;
      this.startedAt = null;
    });
  }

  stop() {
    if (!this.process) return;
    this.stopping = true;
    this.autoReconnect = false;
    this.process.stdin && this.process.stdin.end && this.process.stdin.end();
    // Ask ffmpeg to shut down its output(s) cleanly, then hard-kill if it lingers.
    this.process.kill('SIGINT');
    const proc = this.process;
    setTimeout(() => {
      if (proc && !proc.killed) {
        try { proc.kill('SIGKILL'); } catch (e) { /* already gone */ }
      }
    }, 5000);
    this.process = null;
    this.startedAt = null;
  }
}

module.exports = { StreamEngine, buildArgs, resolveResolution };
