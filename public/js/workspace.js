(function () {
  const canvasEl = document.getElementById('workspace-canvas');
  const previewToggleBtn = document.getElementById('preview-toggle');
  let previewEnabled = true;
  let scale = 1;

  function outputSize() {
    const v = store.state.settings && store.state.settings.video;
    if (!v) return [1920, 1080];
    if (v.custom) return [Number(v.customWidth) || 1920, Number(v.customHeight) || 1080];
    const [w, h] = (v.resolution || '1920x1080').split('x').map(Number);
    return [w, h];
  }

  function layout() {
    const [outW, outH] = outputSize();
    const container = canvasEl.parentElement;
    const availW = container.clientWidth - 40;
    const availH = container.clientHeight - 40;
    const ratio = outW / outH;
    let dispW = availW;
    let dispH = dispW / ratio;
    if (dispH > availH) {
      dispH = availH;
      dispW = dispH * ratio;
    }
    scale = dispW / outW;
    canvasEl.style.width = dispW + 'px';
    canvasEl.style.height = dispH + 'px';
  }

  function px(n) { return Math.round(n * scale) + 'px'; }

  function fileUrl(filename) { return '/uploads/' + encodeURIComponent(filename); }

  function cleanupMediaElements() {
    const videos = canvasEl.querySelectorAll('video, audio');

    videos.forEach((media) => {
        media.pause();
        media.removeAttribute('src');
        media.load();
    });
}

  function renderSourceContent(el, source) {
    el.innerHTML = '';
    if (!previewEnabled) return;
    if (source.type === 'image') {
      const img = document.createElement('img');
      img.src = fileUrl(source.file);
      img.draggable = false;
      el.appendChild(img);
    } else if (source.type === 'media') {
      if (/\.mp3$/i.test(source.file || '')) {
        const box = document.createElement('div');
        box.className = 'text-preview';
        box.style.color = '#8A95A6';
        box.style.fontSize = '11px';
        box.style.padding = '4px';
        box.textContent = '♪ ' + (source.originalFilename || source.name);
        el.appendChild(box);
      } else {
        const video = document.createElement('video');
        video.src = fileUrl(source.file);
        video.muted = true;
        video.loop = !!source.loop;
        video.autoplay = true;
        video.playsInline = true;
        video.preload = 'metadata';
        el.appendChild(video);
      }
    } else if (source.type === 'text') {
      const box = document.createElement('div');
      box.className = 'text-preview';
      box.style.color = colorToCss(source.color);
      box.style.fontFamily = source.fontFamily || 'sans-serif';
      box.style.fontSize = Math.max(6, Math.round((source.fontSize || 32) * scale)) + 'px';
      box.textContent = source.text || '';
      el.appendChild(box);
    }
  }

  function colorToCss(hexOrRgba) {
    if (!hexOrRgba) return '#FFFFFF';
    if (hexOrRgba.startsWith('rgba') || hexOrRgba.startsWith('rgb')) return hexOrRgba;
    let v = hexOrRgba.replace('#', '');
    if (v.length === 8) {
      const r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
      const a = (parseInt(v.slice(6, 8), 16) / 255).toFixed(2);
      return `rgba(${r},${g},${b},${a})`;
    }
    return '#' + v;
  }

  function render() {
    layout();
    const scene = store.selectedScene();
    cleanupMediaElements();
    canvasEl.innerHTML = '';
    if (!scene) return;
    scene.sources.forEach((source) => {
      const el = document.createElement('div');
      el.className = 'canvas-source';
      if (source.id === store.state.selectedSourceId) el.classList.add('selected');
      if (source.locked) el.classList.add('locked');
      if (source.visible === false) el.style.opacity = '0.28';
      el.style.left = px(source.x || 0);
      el.style.top = px(source.y || 0);
      el.style.width = px(source.width || 100);
      el.style.height = px(source.height || 100);
      el.dataset.id = source.id;

      const label = document.createElement('div');
      label.className = 'src-label';
      label.textContent = source.name;
      el.appendChild(label);

      renderSourceContent(el, source);

      if (!source.locked) {
        const handle = document.createElement('div');
        handle.className = 'resize-handle';
        handle.addEventListener('pointerdown', (e) => startResize(e, source, el));
        el.appendChild(handle);
        el.addEventListener('pointerdown', (e) => startDrag(e, source, el));
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSource(source.id);
      });

      canvasEl.appendChild(el);
    });
  }

  function selectSource(id) {
    store.state.selectedSourceId = id;
    store.notify();
  }

  canvasEl.addEventListener('click', () => selectSource(null));

  function startDrag(e, source, el) {
    if (source.locked) return;
    e.preventDefault();
    e.stopPropagation();
    selectSource(source.id);
    const startX = e.clientX, startY = e.clientY;
    const origX = source.x || 0, origY = source.y || 0;
    const [outW, outH] = outputSize();

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const nx = Math.max(0, Math.min(outW - (source.width || 0), Math.round(origX + dx)));
      const ny = Math.max(0, Math.min(outH - (source.height || 0), Math.round(origY + dy)));
      el.style.left = px(nx);
      el.style.top = px(ny);
      source._pendingX = nx;
      source._pendingY = ny;
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (source._pendingX !== undefined) {
        source.x = source._pendingX;
        source.y = source._pendingY;
        api.updateSource(store.selectedScene().id, source.id, { x: source.x, y: source.y }).then(() => {
          window.dispatchEvent(new CustomEvent('sources:changed'));
        }).catch((err) => alert(err.message));
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  function startResize(e, source, el) {
    if (source.locked) return;
    e.preventDefault();
    e.stopPropagation();
    selectSource(source.id);
    const startX = e.clientX, startY = e.clientY;
    const origW = source.width || 100, origH = source.height || 100;
    const [outW, outH] = outputSize();

    function onMove(ev) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const nw = Math.max(10, Math.min(outW - (source.x || 0), Math.round(origW + dx)));
      const nh = Math.max(10, Math.min(outH - (source.y || 0), Math.round(origH + dy)));
      el.style.width = px(nw);
      el.style.height = px(nh);
      source._pendingW = nw;
      source._pendingH = nh;
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      if (source._pendingW !== undefined) {
        source.width = source._pendingW;
        source.height = source._pendingH;
        api.updateSource(store.selectedScene().id, source.id, { width: source.width, height: source.height }).then(() => {
          window.dispatchEvent(new CustomEvent('sources:changed'));
        }).catch((err) => alert(err.message));
      }
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }

  previewToggleBtn.addEventListener('click', () => {
    previewEnabled = !previewEnabled;
    previewToggleBtn.classList.toggle('active', previewEnabled);
    render();
  });

  window.addEventListener('resize', render);
  store.subscribe(render);
  window.workspace = { render };
})();
