(function () {
  const contentEl = document.getElementById('settings-content');
  const navEl = document.getElementById('settings-nav');

  const SERVICE_URLS = {
    YouTube: 'rtmp://a.rtmp.youtube.com/live2',
    Facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    Twitch: 'rtmp://live.twitch.tv/app',
    Kick: 'rtmps://fa723fc1b171.global-contribute.live-video.net'
  };

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    });
    (children || []).forEach((c) => node.appendChild(c));
    return node;
  }
  function field(labelText, inputEl) {
    return el('div', { class: 'field' }, [el('label', { text: labelText }), inputEl]);
  }
  function select(options, selected) {
    const s = document.createElement('select');
    options.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      if (opt === selected) o.selected = true;
      s.appendChild(o);
    });
    return s;
  }
  function toast(msg) {
    const t = el('div', { class: 'saved-toast', text: msg });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
  function goEditor() { window.location.hash = '#/editor'; }

  function actionsBar(applyLabel, onApply) {
    const bar = el('div', { class: 'settings-actions-bar' });
    const cancelBtn = el('button', { class: 'btn' }, [document.createTextNode('Cancel')]);
    cancelBtn.addEventListener('click', goEditor);
    const applyBtn = el('button', { class: 'btn btn-primary' }, [document.createTextNode(applyLabel)]);
    applyBtn.addEventListener('click', async () => {
      applyBtn.disabled = true;
      try { await onApply(); toast('Saved'); goEditor(); }
      catch (e) { alert(e.message); }
      finally { applyBtn.disabled = false; }
    });
    bar.appendChild(cancelBtn);
    bar.appendChild(applyBtn);
    return bar;
  }

  // ================= Authorization =================
  function renderAuthorization() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Authorization' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Credentials used to sign in to this Multi Stream Studio instance.' }));

    const section = el('div', { class: 'settings-section' });
    const usernameEl = document.createElement('input'); usernameEl.type = 'text'; usernameEl.value = store.state.username || '';
    const currentPwEl = document.createElement('input'); currentPwEl.type = 'password'; currentPwEl.autocomplete = 'current-password';
    const newPwEl = document.createElement('input'); newPwEl.type = 'password'; newPwEl.autocomplete = 'new-password';
    newPwEl.placeholder = 'Leave blank to keep current password';

    section.appendChild(field('Username', usernameEl));
    section.appendChild(field('Current Password (required to save changes)', currentPwEl));
    section.appendChild(field('Password (new)', newPwEl));
    contentEl.appendChild(section);

    contentEl.appendChild(actionsBar('Update', async () => {
      await api.updateCredentials({ username: usernameEl.value, currentPassword: currentPwEl.value, newPassword: newPwEl.value });
      const usernameLabel = document.getElementById('username-label');
      if (usernameLabel) usernameLabel.textContent = usernameEl.value;
    }));
  }

  // ================= Stream (Add Service) =================
  function renderStream() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Stream' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Add a streaming destination. It will appear in Platforms on the Editor page.' }));

    const section = el('div', { class: 'settings-section' });
    const serviceEl = select(['YouTube', 'Facebook', 'Twitch', 'Kick', 'RTMP'], 'YouTube');
    section.appendChild(field('Service', serviceEl));

    const serviceNameWrap = el('div', {}, []);
    const serviceNameEl = document.createElement('input'); serviceNameEl.type = 'text'; serviceNameEl.placeholder = 'e.g. Backup Server';

    const serverEl = document.createElement('input'); serverEl.type = 'text';
    const serverField = field('Server', serverEl);

    const keyEl = document.createElement('input'); keyEl.type = 'password';
    const showBtn = el('button', { class: 'btn btn-sm' }, [document.createTextNode('Show')]);
    showBtn.addEventListener('click', (e) => {
      e.preventDefault();
      keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
      showBtn.textContent = keyEl.type === 'password' ? 'Show' : 'Hide';
    });
    const keyRow = el('div', { class: 'stream-key-row' }, [keyEl, showBtn]);

    section.appendChild(serviceNameWrap);
    section.appendChild(serverField);
    section.appendChild(field('Stream Key', keyRow));
    const urlNote = el('div', { class: 'svc-url-note', text: '' });
    section.appendChild(urlNote);

    function syncServiceFields() {
      const svc = serviceEl.value;
      if (svc === 'RTMP') {
        serviceNameWrap.innerHTML = '';
        serviceNameWrap.appendChild(field('Service Name', serviceNameEl));
        serverEl.disabled = false;
        serverEl.value = '';
        serverEl.placeholder = 'rtmp://your-server/app';
        urlNote.textContent = '';
      } else {
        serviceNameWrap.innerHTML = '';
        serverEl.disabled = true;
        serverEl.value = SERVICE_URLS[svc];
        urlNote.textContent = 'URL is set automatically for this service and cannot be edited.';
      }
    }
    serviceEl.addEventListener('change', syncServiceFields);
    syncServiceFields();

    contentEl.appendChild(section);

    contentEl.appendChild(actionsBar('Add Service', async () => {
      const payload = { service: serviceEl.value, streamKey: keyEl.value };
      if (serviceEl.value === 'RTMP') {
        if (!serviceNameEl.value.trim()) throw new Error('A service name is required for custom RTMP');
        if (!serverEl.value.trim()) throw new Error('Server URL is required for custom RTMP');
        payload.name = serviceNameEl.value.trim();
        payload.server = serverEl.value.trim();
      }
      await api.addPlatform(payload);
      await store.refreshPlatforms();
    }));
  }

  // ================= Output =================
  function renderOutput() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Output' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Encoding settings used for every enabled platform.' }));

    const out = store.state.settings.output;
    const caps = store.state.encoders.capabilities;
    const videoEncoders = store.state.encoders.video;
    const audioEncoders = store.state.encoders.audio;

    const modeEl = select(['Simple', 'Advanced'], out.mode);
    const section = el('div', { class: 'settings-section' });
    section.appendChild(field('Output Mode', modeEl));
    contentEl.appendChild(section);

    const dynamicWrap = el('div', { class: 'settings-section' });
    contentEl.appendChild(dynamicWrap);

    let collect = () => ({});

    function renderSimple() {
      dynamicWrap.innerHTML = '';
      const s = out.simple;
      const videoEncEl = select(videoEncoders, s.videoEncoder);
      const videoBrEl = document.createElement('input'); videoBrEl.type = 'number'; videoBrEl.value = s.videoBitrate;
      const audioEncEl = select(audioEncoders, s.audioEncoder);
      const audioBrEl = document.createElement('input'); audioBrEl.type = 'number'; audioBrEl.value = s.audioBitrate;
      const presetEl = select(caps[s.videoEncoder].preset, s.preset);

      dynamicWrap.appendChild(el('h3', { text: 'Video' }));
      dynamicWrap.appendChild(field('Encoder', videoEncEl));
      dynamicWrap.appendChild(field('Bitrate (kbps)', videoBrEl));
      dynamicWrap.appendChild(field('Preset', presetEl));
      dynamicWrap.appendChild(el('h3', { text: 'Audio' }));
      dynamicWrap.appendChild(field('Encoder', audioEncEl));
      dynamicWrap.appendChild(field('Bitrate (kbps)', audioBrEl));

      videoEncEl.addEventListener('change', () => {
        const opts = caps[videoEncEl.value].preset;
        presetEl.innerHTML = '';
        opts.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o; presetEl.appendChild(op); });
      });

      collect = () => ({
        mode: 'Simple',
        simple: {
          videoEncoder: videoEncEl.value, videoBitrate: Number(videoBrEl.value),
          audioEncoder: audioEncEl.value, audioBitrate: Number(audioBrEl.value),
          preset: presetEl.value
        }
      });
    }

    function renderAdvanced() {
      dynamicWrap.innerHTML = '';
      const v = out.advanced.video, a = out.advanced.audio;
      const encEl = select(videoEncoders, v.encoder);
      const rateEl = select(caps[v.encoder].rateControl, v.rateControl);
      const bitrateEl = document.createElement('input'); bitrateEl.type = 'number'; bitrateEl.value = v.bitrate;
      const keyframeEl = document.createElement('input'); keyframeEl.type = 'number'; keyframeEl.step = '0.1'; keyframeEl.value = v.keyframeInterval;
      const presetEl = select(caps[v.encoder].preset, v.preset);
      const profileEl = select(caps[v.encoder].profile, v.profile);
      const tuneEl = select(caps[v.encoder].tune, v.tune);

      dynamicWrap.appendChild(el('h3', { text: 'Video' }));
      dynamicWrap.appendChild(field('Encoder', encEl));
      dynamicWrap.appendChild(field('Rate Control', rateEl));
      dynamicWrap.appendChild(field('Bitrate (kbps, or quality value for CRF/CQ/QP)', bitrateEl));
      dynamicWrap.appendChild(field('Keyframe Interval (seconds)', keyframeEl));
      dynamicWrap.appendChild(field('Preset', presetEl));
      dynamicWrap.appendChild(field('Profile', profileEl));
      dynamicWrap.appendChild(field('Tune', tuneEl));

      function resyncEncoderOptions() {
        const info = caps[encEl.value];
        [[rateEl, info.rateControl], [presetEl, info.preset], [profileEl, info.profile], [tuneEl, info.tune]].forEach(([sel, opts]) => {
          sel.innerHTML = '';
          opts.forEach((o) => { const op = document.createElement('option'); op.value = o; op.textContent = o; sel.appendChild(op); });
        });
      }
      encEl.addEventListener('change', resyncEncoderOptions);

      const audEncEl = select(audioEncoders, a.encoder);
      const audBrEl = document.createElement('input'); audBrEl.type = 'number'; audBrEl.value = a.bitrate;
      dynamicWrap.appendChild(el('h3', { text: 'Audio' }));
      dynamicWrap.appendChild(field('Encoder', audEncEl));
      dynamicWrap.appendChild(field('Bitrate (kbps)', audBrEl));

      collect = () => ({
        mode: 'Advanced',
        advanced: {
          video: {
            encoder: encEl.value, rateControl: rateEl.value, bitrate: Number(bitrateEl.value),
            keyframeInterval: Number(keyframeEl.value), preset: presetEl.value, profile: profileEl.value, tune: tuneEl.value
          },
          audio: { encoder: audEncEl.value, bitrate: Number(audBrEl.value) }
        }
      });
    }

    function syncMode() { modeEl.value === 'Simple' ? renderSimple() : renderAdvanced(); }
    modeEl.addEventListener('change', syncMode);
    syncMode();

    contentEl.appendChild(actionsBar('Apply', async () => {
      await api.updateOutputSettings(collect());
      await store.refreshSettings();
    }));
  }

  // ================= Audio =================
  function renderAudio() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Audio' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Global audio format for the stream output.' }));

    const a = store.state.settings.audio;
    const section = el('div', { class: 'settings-section' });
    const sampleRateEl = select(['44.1 kHz', '48 kHz'], a.sampleRate);
    const channelsEl = select(['Mono', 'Stereo', '5.1 surround', '7.1 surround'], a.channels);
    section.appendChild(field('Sample Rate', sampleRateEl));
    section.appendChild(field('Channels', channelsEl));
    contentEl.appendChild(section);

    contentEl.appendChild(actionsBar('Apply', async () => {
      await api.updateAudioSettings({ sampleRate: sampleRateEl.value, channels: channelsEl.value });
      await store.refreshSettings();
    }));
  }

  // ================= Video =================
  function renderVideo() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Video' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Output resolution and frame rate for the composited stream.' }));

    const v = store.state.settings.video;
    const section = el('div', { class: 'settings-section' });

    const resolutions = ['1920x1080', '1280x720', '852x480', '640x360', 'Custom'];
    const resEl = select(resolutions, v.custom ? 'Custom' : v.resolution);
    section.appendChild(field('Output Resolution', resEl));

    const customWrap = el('div', {}, []);
    section.appendChild(customWrap);

    function syncCustom() {
      customWrap.innerHTML = '';
      if (resEl.value === 'Custom') {
        const wEl = document.createElement('input'); wEl.type = 'number'; wEl.value = v.customWidth || 1920;
        const hEl = document.createElement('input'); hEl.type = 'number'; hEl.value = v.customHeight || 1080;
        customWrap.appendChild(el('div', { class: 'field-row' }, [field('Width', wEl), field('Height', hEl)]));
        customWrap.dataset.w = '';
        customWrap._w = wEl; customWrap._h = hEl;
      }
    }
    resEl.addEventListener('change', syncCustom);
    syncCustom();

    const fpsEl = select(['10', '20', '24', '25', '29.97', '30', '48', '59.94', '60'], String(v.fps));
    section.appendChild(field('FPS', fpsEl));
    contentEl.appendChild(section);

    contentEl.appendChild(actionsBar('Apply', async () => {
      const payload = { fps: Number(fpsEl.value) };
      if (resEl.value === 'Custom') {
        payload.custom = true;
        payload.customWidth = Number(customWrap._w.value);
        payload.customHeight = Number(customWrap._h.value);
      } else {
        payload.custom = false;
        payload.resolution = resEl.value;
      }
      await api.updateVideoSettings(payload);
      await store.refreshSettings();
    }));
  }

  // ================= Advanced =================
  function renderAdvancedSettings() {
    contentEl.innerHTML = '';
    contentEl.appendChild(el('h2', { text: 'Advanced' }));
    contentEl.appendChild(el('p', { class: 'settings-sub', text: 'Reconnection and network behavior.' }));

    const a = store.state.settings.advanced;
    const section = el('div', { class: 'settings-section' });
    const reconnectEl = select(['Enable', 'Disable'], a.autoReconnect ? 'Enable' : 'Disable');
    section.appendChild(field('Automatically Reconnect', reconnectEl));

    const bindEl = document.createElement('input'); bindEl.type = 'text'; bindEl.value = a.network.bindToInterface || '';
    bindEl.placeholder = 'Default';
    const bufferEl = document.createElement('input'); bufferEl.type = 'number'; bufferEl.value = a.network.bufferSizeKb || 1024;
    section.appendChild(el('h3', { text: 'Network' }));
    section.appendChild(field('Bind to Interface (IP, optional)', bindEl));
    section.appendChild(field('Buffer Size (KB)', bufferEl));
    contentEl.appendChild(section);

    contentEl.appendChild(actionsBar('Apply', async () => {
      await api.updateAdvancedSettings({
        autoReconnect: reconnectEl.value === 'Enable',
        network: { bindToInterface: bindEl.value, bufferSizeKb: Number(bufferEl.value) }
      });
      await store.refreshSettings();
    }));
  }

  const RENDERERS = {
    authorization: renderAuthorization,
    stream: renderStream,
    output: renderOutput,
    audio: renderAudio,
    video: renderVideo,
    advanced: renderAdvancedSettings
  };

  function renderSettingsPage(section) {
    navEl.querySelectorAll('a').forEach((a) => a.classList.toggle('active', a.dataset.settingsNav === section));
    (RENDERERS[section] || renderAuthorization)();
  }

  window.settingsView = { renderSettingsPage };
})();
