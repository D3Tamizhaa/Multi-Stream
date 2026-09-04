'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const Router = require('./lib/router');
const session = require('./lib/session');
const { parseMultipart } = require('./lib/multipart');
const store = require('./lib/store');
const { StreamEngine } = require('./lib/ffmpegEngine');

const PORT = process.env.PORT || 4455;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const router = new Router();
const engine = new StreamEngine();

require('./routes/auth')(router, { store, session });
require('./routes/scenes')(router, { store });
require('./routes/sources')(router, { store });
require('./routes/platforms')(router, { store });
require('./routes/settings')(router, { store });
require('./routes/stream')(router, { store, engine });

const PUBLIC_API_PATHS = new Set(['/api/login', '/api/session']);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;

    const MAX_SIZE = 500 * 1024 * 1024;

    function cleanup() {
      req.removeListener('data', onData);
      req.removeListener('end', onEnd);
      req.removeListener('error', onError);
      req.removeListener('aborted', onAborted);
      req.removeListener('close', onClose);
    }

    function fail(error) {
      if (settled) return;

      settled = true;
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      size += chunk.length;

      if (size > MAX_SIZE) {
        fail(new Error('Request body too large'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    }

    function onEnd() {
      if (settled) return;

      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks));
    }

    function onError(err) {
      fail(err);
    }

    function onAborted() {
      fail(new Error('Request aborted by client'));
    }

    function onClose() {
      if (!req.complete) {
        fail(new Error('Request connection closed before upload completed'));
      }
    }

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.on('aborted', onAborted);
    req.on('close', onClose);
  });
}

function serveStatic(req, res, pathname) {
  let relPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, relPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const UPLOAD_MIME_TYPES = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.tga': 'image/x-tga',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg'
};

function serveUpload(req, res, filename) {
    const safeFilename = path.basename(filename);
    const filePath = path.join(store.UPLOADS_DIR, safeFilename);

    fs.stat(filePath, (err, stat) => {
        if (err || !stat.isFile()) {
            res.writeHead(404, {
                'Content-Type': 'text/plain; charset=utf-8'
            });
            res.end('Not found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType =
            UPLOAD_MIME_TYPES[ext] || 'application/octet-stream';

        const fileSize = stat.size;
        const range = req.headers.range;

        if (!range) {
            res.writeHead(200, {
                'Content-Type': contentType,
                'Content-Length': fileSize,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, max-age=3600'
            });

            fs.createReadStream(filePath).pipe(res);
            return;
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(range);

        if (!match) {
            res.writeHead(416, {
                'Content-Range': `bytes */${fileSize}`
            });
            res.end();
            return;
        }

        let start;
        let end;

        if (match[1] === '') {
            const suffixLength = Number(match[2]);

            if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                });
                res.end();
                return;
            }

            start = Math.max(fileSize - suffixLength, 0);
            end = fileSize - 1;
        } else {
            start = Number(match[1]);

            if (!Number.isFinite(start) || start < 0 || start >= fileSize) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                });
                res.end();
                return;
            }

            if (match[2] === '') {
                end = fileSize - 1;
            } else {
                end = Number(match[2]);

                if (!Number.isFinite(end) || end < start) {
                    res.writeHead(416, {
                        'Content-Range': `bytes */${fileSize}`
                    });
                    res.end();
                    return;
                }

                end = Math.min(end, fileSize - 1);
            }
        }

        const chunkSize = end - start + 1;

        res.writeHead(206, {
            'Content-Type': contentType,
            'Content-Length': chunkSize,
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'private, max-age=3600'
        });

        fs.createReadStream(filePath, {
            start,
            end
        }).pipe(res);
    });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname.startsWith('/uploads/') && req.method === 'GET') {
    serveUpload(req, res, pathname.slice('/uploads/'.length));
    return;
  }

  if (!pathname.startsWith('/api/')) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      serveStatic(req, res, pathname);
    } else {
      res.writeHead(405);
      res.end();
    }
    return;
  }

  // --- API routing ---
  const currentSession = session.getSession(req);
  if (!PUBLIC_API_PATHS.has(pathname) && !currentSession) {
    sendJson(res, 401, { error: 'Not authenticated' });
    return;
  }

  const match = router.match(req.method, pathname);
  if (!match) {
    sendJson(res, 404, { error: 'No such API route' });
    return;
  }

  try {
    let body = {};
    let files = {};
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
      const raw = await readBody(req);
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        const parsed = parseMultipart(raw, contentType);
        body = parsed.fields;
        files = parsed.files;
      } else if (raw.length > 0) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch (e) {
          sendJson(res, 400, { error: 'Invalid JSON body' });
          return;
        }
      }
    }

    const ctx = {
      req, res, params: match.params, body, files,
      session: currentSession,
      sendJson: (status, payload) => sendJson(res, status, payload)
    };
    await match.handler(ctx);
} catch (err) {
  if (
    err.message === 'Request aborted by client' ||
    err.message === 'Request connection closed before upload completed'
  ) {
    return;
  }

  console.error(err);

  if (!res.headersSent) {
    sendJson(
      res,
      500,
      { error: err.message || 'Internal server error' }
    );
  }
}
});

server.listen(PORT, () => {
  console.log(`Multi Stream Studio listening on http://localhost:${PORT}`);
  console.log('Default login: admin / admin  (change this in Settings > Authorization immediately)');
});

process.on('SIGINT', () => {
  engine.stop();
  process.exit(0);
});
