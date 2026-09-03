# Multi Stream Studio

A lightweight, self-hosted, single-operator live production console. Compose
scenes from images, video/audio clips, and text in a browser, then push the
composited output to several RTMP platforms at once (YouTube, Facebook,
Twitch, Kick, or any custom RTMP server) simultaneously.

- **Zero npm dependencies.** The server is plain Node.js core modules
  (`http`, `crypto`, `child_process`, `fs`) — no Express, no database. Clone
  it and run it; there's nothing to `npm install`.
- **FFmpeg is the streaming engine.** Scenes are compiled into a single
  `ffmpeg` `filter_complex` graph (overlay for images/video, `drawtext` for
  text, `amix` for audio) and pushed out with the `tee` muxer so one encode
  feeds every enabled platform at once.

## Requirements

- Node.js 18+
- `ffmpeg` installed and on your `PATH` (test with `ffmpeg -version`)

## Getting started

```bash
git clone <this repo>
cd multi-stream-studio
node server/index.js
```

Open `http://localhost:4455`. Default login is **admin / admin** — change it
immediately under **Settings → Authorization** once you're in; the app will
not do this for you.

The port can be overridden with `PORT=8080 node server/index.js`.

## How it's put together

```
server/
  index.js               HTTP server, routing, static file serving, auth gate
  lib/
    router.js             tiny path-param router
    session.js             in-memory sessions + HttpOnly cookies
    store.js                JSON-file persistence (data/config.json)
    multipart.js             dependency-free multipart/form-data parser
    encoderCapabilities.js    which Rate Control/Preset/Profile/Tune options
                              are valid per video encoder (UI + server both
                              enforce this so a bad combination never reaches
                              ffmpeg)
    ffmpegEngine.js            builds the ffmpeg argv from the active scene +
                                settings + enabled platforms, spawns/monitors
                                the process, handles auto-reconnect
  routes/                  one file per resource: auth, scenes, sources,
                            platforms, settings, stream
public/
  login.html / js/login.js
  index.html               app shell matching the Header → Workspace →
                            Scenes/Sources/Audio → Platforms/Controls →
                            Status hierarchy
  js/
    api.js                  fetch wrapper for the REST API
    state.js                  tiny client-side store + pub/sub
    workspace.js               drag/resize canvas editor (scaled to your
                                configured output resolution)
    panels.js                   Scenes / Sources / Audio Mixer / Platforms /
                                 Controls / status bar
    modals.js                    Add Scene, Add Source (Image/Media/Text),
                                  Source Properties, Edit Platform
    settings.js                   Authorization / Stream / Output / Audio /
                                   Video / Advanced settings pages
    app.js                        hash router + auth guard
data/
  config.json               all app state (created on first run)
  uploads/                   uploaded image/media source files
```

### How a scene becomes a stream

Every visible source in the active scene becomes part of one `ffmpeg`
command:

1. A `color` (black canvas) input at your configured output resolution/fps
   is the base layer.
2. Each image source is `-loop 1`-ed in and `overlay`n onto the canvas at
   its saved x/y, scaled to its saved width/height.
3. Each media (video) source is decoded, scaled, and `overlay`n the same
   way; its audio is volume-adjusted per the mixer and combined with every
   other media source's audio via `amix`.
4. Each text source is a `drawtext` filter chained directly onto the video,
   no extra input needed.
5. All real inputs are read with `-re` (including the base canvas, via a
   `lavfi` input rather than an inline filter) so the whole graph is paced
   to real (wall-clock) time — this matters a lot for live RTMP: without it
   ffmpeg encodes as fast as the CPU allows instead of at playback speed,
   and the stream will desync or the destination will drop the connection.
6. The encoded output is sent with `-f flv` to the one enabled platform, or
   duplicated to all of them at once with `-f tee "[f=flv]url1|[f=flv]url2"`
   if more than one platform is enabled.

This was tested during development by generating synthetic test video/image
assets, running the exact argv the app produces, and inspecting the output
frame-by-frame and via `ffprobe` to confirm composition, positioning, and
real-time pacing were all correct.

## What to know before you go live

- **This was built and tested in a sandboxed environment with no route to
  real RTMP ingest servers (YouTube/Twitch/etc.), so the actual network
  push has not been verified against a live platform.** The `ffmpeg`
  command construction, real-time pacing, and full composition pipeline
  were verified end-to-end against a local file target — that's the part
  that's hardest to get right and easiest to get subtly wrong. Actually
  reaching e.g. `rtmp://a.rtmp.youtube.com/live2` depends on your network
  and a valid stream key, which only you can test.
- **Change the default password.** It's `admin` / `admin` until you change
  it in Settings → Authorization.
- **Single operator, single process.** There's one admin account and one
  in-memory session table — this is meant to run on a machine you control,
  not as a multi-tenant service.
- **Hardware encoders** (NVIDIA/QSV/AMD entries in Output settings) only
  work if the corresponding GPU, drivers, and an `ffmpeg` build with that
  encoder compiled in are present on the host. If a selected encoder isn't
  actually available, `ffmpeg` will fail to start and the error (surfaced
  in the status bar) will say so.
- **Large uploads**: the request-body cap is 500MB, which is enough for
  most short clips and images but not for long-form video — trim clips
  before uploading, or raise `MAX_SIZE` in `server/index.js`.
