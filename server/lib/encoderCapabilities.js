'use strict';

/**
 * Capability map for every video encoder exposed in Settings > Output > Advanced.
 * `ffmpeg` is the actual libav codec name used when building the command line.
 * Each list below is exactly what the UI is allowed to show for that encoder;
 * the server re-validates against this same map so a crafted request can't
 * pass an unsupported combination through to ffmpeg.
 */
const VIDEO_ENCODERS = {
  'H.264': {
    ffmpeg: 'libx264',
    rateControl: ['CBR', 'VBR', 'CRF', 'VBV', 'None'],
    preset: ['Ultra Fast', 'Super Fast', 'Very Fast', 'Faster', 'Fast', 'Medium', 'Slow', 'Slower', 'Very Slow', 'Placebo', 'None'],
    profile: ['Baseline', 'Main', 'High', 'None'],
    tune: ['Zero latency', 'Film', 'Animation', 'Grain', 'Still image', 'PSNR', 'SSIM', 'Fast decode', 'None'],
    keyframeInterval: true
  },
  'H.265': {
    ffmpeg: 'libx265',
    rateControl: ['CBR', 'VBR', 'CRF', 'VBV', 'None'],
    preset: ['Ultra Fast', 'Super Fast', 'Very Fast', 'Faster', 'Fast', 'Medium', 'Slow', 'Slower', 'Very Slow', 'Placebo', 'None'],
    profile: ['Main', 'High 10', 'High 422', 'High 444', 'None'],
    tune: ['Zero latency', 'Grain', 'PSNR', 'SSIM', 'Fast decode', 'None'],
    keyframeInterval: true
  },
  'VP9': {
    ffmpeg: 'libvpx-vp9',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['None'],
    profile: ['None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'AV1': {
    ffmpeg: 'libaom-av1',
    rateControl: ['CBR', 'VBR', 'CRF', 'CQ', 'None'],
    preset: ['Very Slow', 'Slower', 'Slow', 'Medium', 'Fast', 'Faster', 'Very Fast', 'Ultra Fast', 'None'],
    profile: ['Main', 'High', 'None'],
    tune: ['PSNR', 'SSIM', 'None'],
    keyframeInterval: true
  },
  'SVT AV1': {
    ffmpeg: 'libsvtav1',
    rateControl: ['CBR', 'VBR', 'CRF', 'None'],
    preset: ['Very Slow', 'Slower', 'Slow', 'Medium', 'Fast', 'Faster', 'Very Fast', 'Ultra Fast', 'None'],
    profile: ['Main', 'High', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'H.264 NVIDIA': {
    ffmpeg: 'h264_nvenc',
    rateControl: ['CBR', 'VBR', 'CQ', 'VBV', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Baseline', 'Main', 'High', 'None'],
    tune: ['Zero latency', 'None'],
    keyframeInterval: true
  },
  'H.265 NVIDIA': {
    ffmpeg: 'hevc_nvenc',
    rateControl: ['CBR', 'VBR', 'CQ', 'VBV', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Main', 'High 10', 'None'],
    tune: ['Zero latency', 'None'],
    keyframeInterval: true
  },
  'AV1 NVIDIA': {
    ffmpeg: 'av1_nvenc',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Main', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'H.264 IQS': {
    ffmpeg: 'h264_qsv',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Very Fast', 'Faster', 'Fast', 'Medium', 'Slow', 'Slower', 'Very Slow', 'None'],
    profile: ['Baseline', 'Main', 'High', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'HEVC IQS': {
    ffmpeg: 'hevc_qsv',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Very Fast', 'Faster', 'Fast', 'Medium', 'Slow', 'Slower', 'Very Slow', 'None'],
    profile: ['Main', 'High 10', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'AV1 IQS': {
    ffmpeg: 'av1_qsv',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Main', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'H.264 AMD': {
    ffmpeg: 'h264_amf',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Baseline', 'Main', 'High', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'HEVC AMD': {
    ffmpeg: 'hevc_amf',
    rateControl: ['CBR', 'VBR', 'CQ', 'None'],
    preset: ['Fast', 'Medium', 'Slow', 'None'],
    profile: ['Main', 'High 10', 'None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'MPEG-4': {
    ffmpeg: 'mpeg4',
    rateControl: ['CBR', 'VBR', 'None'],
    preset: ['None'],
    profile: ['None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'MPEG-2': {
    ffmpeg: 'mpeg2video',
    rateControl: ['CBR', 'VBR', 'None'],
    preset: ['None'],
    profile: ['None'],
    tune: ['None'],
    keyframeInterval: true
  },
  'None': {
    ffmpeg: 'copy',
    rateControl: ['None'],
    preset: ['None'],
    profile: ['None'],
    tune: ['None'],
    keyframeInterval: false
  }
};

const AUDIO_ENCODERS = {
  'AAC': 'aac',
  'Opus': 'libopus',
  'MP3': 'libmp3lame',
  'AC-3': 'ac3',
  'EAC-3': 'eac3',
  'FLAC': 'flac',
  'PCM 16': 'pcm_s16le',
  'None': 'copy'
};

const RATE_CONTROL_FFMPEG_ARGS = {
  // Returns extra ffmpeg args for a given (encoder family, rateControl, bitrateKbps, crfLike).
  // `crfLike` is a 0-51 style quality value used for CRF/CQ/QP entries, reusing the same
  // numeric field the UI calls "Bitrate" is NOT reused here - CRF/CQ/QP get their own meaning
  // but to keep the UI simple we treat the single "Bitrate" number field as:
  //  - kbps target for CBR/VBR/ABR/VBV
  //  - the constant quality value for CRF/CQ/QP/ICQ (typically 0-51, lower = better quality)
};

module.exports = { VIDEO_ENCODERS, AUDIO_ENCODERS };
