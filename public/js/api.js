(function () {
  async function request(method, path, { json, form, isMultipart } = {}) {
    const opts = { method, headers: {} };

    if (isMultipart) {
      opts.body = form;
    } else if (json !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(json);
    }

    const res = await fetch(path, opts);

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      /* no body */
    }

    if (!res.ok) {
      const err = new Error(
        (data && data.error) || `Request failed (${res.status})`
      );
      err.status = res.status;
      throw err;
    }

    return data;
  }

  function addSourceWithProgress(sceneId, formData, { onProgress, signal } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open(
        'POST',
        `/api/scenes/${sceneId}/sources`,
        true
      );

      xhr.withCredentials = true;

      let settled = false;

      function cleanupSignal() {
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      }

      function finishResolve(data) {
        if (settled) return;
        settled = true;
        cleanupSignal();
        resolve(data);
      }

      function finishReject(error) {
        if (settled) return;
        settled = true;
        cleanupSignal();
        reject(error);
      }

      function onAbort() {
        if (settled) return;

        xhr.abort();

        const error = new Error('Upload cancelled');
        error.name = 'AbortError';

        finishReject(error);
      }

      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener('abort', onAbort, { once: true });
      }

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const percent = Math.min(
          100,
          Math.round((event.loaded / event.total) * 100)
        );

        if (typeof onProgress === 'function') {
          onProgress({
            loaded: event.loaded,
            total: event.total,
            percent
          });
        }
      });

      xhr.addEventListener('load', () => {
        let data = null;

        try {
          data = xhr.responseText
            ? JSON.parse(xhr.responseText)
            : null;
        } catch (e) {
          data = null;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof onProgress === 'function') {
            onProgress({
              loaded: 1,
              total: 1,
              percent: 100
            });
          }

          finishResolve(data);
          return;
        }

        const error = new Error(
          (data && data.error) ||
          `Request failed (${xhr.status})`
        );

        error.status = xhr.status;

        finishReject(error);
      });

      xhr.addEventListener('error', () => {
        finishReject(new Error('Network error while uploading'));
      });

      xhr.addEventListener('timeout', () => {
        finishReject(new Error('Upload timed out'));
      });

      xhr.addEventListener('abort', () => {
        if (settled) return;

        const error = new Error('Upload cancelled');
        error.name = 'AbortError';

        finishReject(error);
      });

      xhr.send(formData);
    });
  }

  window.api = {
    session: () => request('GET', '/api/session'),

    login: (username, password) =>
      request('POST', '/api/login', {
        json: { username, password }
      }),

    logout: () => request('POST', '/api/logout'),

    updateCredentials: (payload) =>
      request('PUT', '/api/auth/credentials', {
        json: payload
      }),

    getScenes: () =>
      request('GET', '/api/scenes'),

    addScene: (name) =>
      request('POST', '/api/scenes', {
        json: { name }
      }),

    renameScene: (id, name) =>
      request('PUT', `/api/scenes/${id}`, {
        json: { name }
      }),

    removeScene: (id) =>
      request('DELETE', `/api/scenes/${id}`),

    moveScene: (id, direction) =>
      request('POST', `/api/scenes/${id}/move`, {
        json: { direction }
      }),

    activateScene: (id) =>
      request('POST', `/api/scenes/${id}/activate`),

    getSources: (sceneId) =>
      request('GET', `/api/scenes/${sceneId}/sources`),

    addSource: (sceneId, formData) =>
      request(
        'POST',
        `/api/scenes/${sceneId}/sources`,
        {
          isMultipart: true,
          form: formData
        }
      ),

    addSourceWithProgress,

    updateSource: (sceneId, id, payload) =>
      request(
        'PUT',
        `/api/scenes/${sceneId}/sources/${id}`,
        {
          json: payload
        }
      ),

    removeSource: (sceneId, id) =>
      request(
        'DELETE',
        `/api/scenes/${sceneId}/sources/${id}`
      ),

    moveSource: (sceneId, id, direction) =>
      request(
        'POST',
        `/api/scenes/${sceneId}/sources/${id}/move`,
        {
          json: { direction }
        }
      ),

    getPlatforms: () =>
      request('GET', '/api/platforms'),

    addPlatform: (payload) =>
      request('POST', '/api/platforms', {
        json: payload
      }),

    updatePlatform: (id, payload) =>
      request('PUT', `/api/platforms/${id}`, {
        json: payload
      }),

    removePlatform: (id) =>
      request('DELETE', `/api/platforms/${id}`),

    getSettings: () =>
      request('GET', '/api/settings'),

    getEncoders: () =>
      request('GET', '/api/settings/encoders'),

    updateOutputSettings: (payload) =>
      request('PUT', '/api/settings/output', {
        json: payload
      }),

    updateAudioSettings: (payload) =>
      request('PUT', '/api/settings/audio', {
        json: payload
      }),

    updateVideoSettings: (payload) =>
      request('PUT', '/api/settings/video', {
        json: payload
      }),

    updateAdvancedSettings: (payload) =>
      request('PUT', '/api/settings/advanced', {
        json: payload
      }),

    startStream: () =>
      request('POST', '/api/stream/start'),

    stopStream: () =>
      request('POST', '/api/stream/stop'),

    streamStatus: () =>
      request('GET', '/api/stream/status')
  };
})();
