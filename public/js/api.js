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

  function uploadSource(sceneId, formData, { onProgress } = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.open(
        'POST',
        `/api/scenes/${encodeURIComponent(sceneId)}/sources`
      );

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;

        const percent = Math.min(
          100,
          Math.round((event.loaded / event.total) * 100)
        );

        if (onProgress) {
          onProgress({
            percent,
            loaded: event.loaded,
            total: event.total
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
          reject(new Error('Invalid server response'));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
          return;
        }

        const err = new Error(
          (data && data.error) ||
          `Request failed (${xhr.status})`
        );

        err.status = xhr.status;
        reject(err);
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed. Check your connection.'));
      });

      xhr.addEventListener('abort', () => {
        const err = new Error('Upload cancelled');
        err.name = 'AbortError';
        reject(err);
      });

      xhr.addEventListener('timeout', () => {
        reject(new Error('Upload timed out'));
      });

      xhr.send(formData);

      // Return the XHR so the UI can cancel it.
      resolve.xhr = xhr;
    });
  }

  // Better cancellation-safe version.
  function addSourceWithProgress(sceneId, formData, onProgress) {
    const xhr = new XMLHttpRequest();

    const promise = new Promise((resolve, reject) => {
      xhr.open(
        'POST',
        `/api/scenes/${encodeURIComponent(sceneId)}/sources`
      );

      xhr.upload.addEventListener('progress', (event) => {
        if (!event.lengthComputable) return;

        const percent = Math.round(
          (event.loaded / event.total) * 100
        );

        if (onProgress) {
          onProgress({
            percent,
            loaded: event.loaded,
            total: event.total
          });
        }
      });

      xhr.onload = () => {
        let data = null;

        try {
          data = xhr.responseText
            ? JSON.parse(xhr.responseText)
            : null;
        } catch (e) {
          reject(new Error('Invalid server response'));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          const error = new Error(
            (data && data.error) ||
            `Request failed (${xhr.status})`
          );

          error.status = xhr.status;
          reject(error);
        }
      };

      xhr.onerror = () => {
        reject(new Error('Upload failed. Check your connection.'));
      };

      xhr.onabort = () => {
        const error = new Error('Upload cancelled');
        error.name = 'AbortError';
        reject(error);
      };

      xhr.send(formData);
    });

    // Important: caller can abort the actual upload.
    promise.xhr = xhr;

    return promise;
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

    getScenes: () => request('GET', '/api/scenes'),

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
      request('POST', `/api/scenes/${sceneId}/sources`, {
        isMultipart: true,
        form: formData
      }),

    addSourceWithProgress,

    updateSource: (sceneId, id, payload) =>
      request('PUT', `/api/scenes/${sceneId}/sources/${id}`, {
        json: payload
      }),

    removeSource: (sceneId, id) =>
      request('DELETE', `/api/scenes/${sceneId}/sources/${id}`),

    moveSource: (sceneId, id, direction) =>
      request('POST', `/api/scenes/${sceneId}/sources/${id}/move`, {
        json: { direction }
      }),

    getPlatforms: () => request('GET', '/api/platforms'),

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

    getSettings: () => request('GET', '/api/settings'),

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
