(function () {
  const canvasEl = document.getElementById('workspace-canvas');
  const previewToggle = document.getElementById('preview-toggle');
  let previewEnabled = previewToggle.checked;
  let scale = 1;

  const SNAP_DISTANCE = 8;
  const MIN_SOURCE_SIZE = 10;

  const interaction = {
      active: false,
      type: null,
      source: null,
      el: null,
      handle: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      startRect: null,
      pending: null,
      raf: 0
  };

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
  const mediaElements = canvasEl.querySelectorAll('video, audio');

  mediaElements.forEach((media) => {
    media.pause();

    media.removeAttribute('src');
    media.removeAttribute('srcObject');
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
el.style.left = '0';
el.style.top = '0';
el.style.transform =
    `translate3d(${px(source.x || 0)}, ${px(source.y || 0)}, 0)`;

el.style.width = px(source.width || 100);
el.style.height = px(source.height || 100);

      el.dataset.id = source.id;

      const label = document.createElement('div');
      label.className = 'src-label';
      label.textContent = source.name;
      el.appendChild(label);

      renderSourceContent(el, source);

if (!source.locked) {
    createResizeHandles(el, source);

    el.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.resize-handle')) return;
        startDrag(e, source, el);
    });
}

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectSource(source.id);
      });

      canvasEl.appendChild(el);
    });
  }

  function createResizeHandles(el, source) {
    const handles = [
        'nw', 'n', 'ne',
        'w',       'e',
        'sw', 's', 'se'
    ];

    handles.forEach((direction) => {
        const handle = document.createElement('div');

        handle.className = `resize-handle resize-${direction}`;
        handle.dataset.handle = direction;

        handle.addEventListener('pointerdown', (e) => {
            startResize(e, source, el, direction);
        });

        el.appendChild(handle);
    });
}

  function selectSource(id) {
    store.state.selectedSourceId = id;
    store.notify();
  }

  canvasEl.addEventListener('click', () => selectSource(null));

function startDrag(e, source, el) {
    if (source.locked || interaction.active) return;

    e.preventDefault();
    e.stopPropagation();

    selectSource(source.id);

    interaction.active = true;
    interaction.type = 'drag';
    interaction.source = source;
    interaction.el = el;
    interaction.pointerId = e.pointerId;

    interaction.startX = e.clientX;
    interaction.startY = e.clientY;

    interaction.startRect = {
        x: Number(source.x) || 0,
        y: Number(source.y) || 0,
        width: Number(source.width) || 100,
        height: Number(source.height) || 100
    };

    interaction.pending = { ...interaction.startRect };

    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');

    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', finishPointerInteraction);
    el.addEventListener('pointercancel', finishPointerInteraction);
}

function startResize(e, source, el, handle) {
    if (source.locked || interaction.active) return;

    e.preventDefault();
    e.stopPropagation();

    selectSource(source.id);

    interaction.active = true;
    interaction.type = 'resize';
    interaction.source = source;
    interaction.el = el;
    interaction.handle = handle;
    interaction.pointerId = e.pointerId;

    interaction.startX = e.clientX;
    interaction.startY = e.clientY;

    interaction.startRect = {
        x: Number(source.x) || 0,
        y: Number(source.y) || 0,
        width: Number(source.width) || 100,
        height: Number(source.height) || 100
    };

    interaction.pending = { ...interaction.startRect };

    el.setPointerCapture(e.pointerId);

    el.classList.add('is-resizing');

    el.addEventListener('pointermove', handlePointerMove);
    el.addEventListener('pointerup', finishPointerInteraction);
    el.addEventListener('pointercancel', finishPointerInteraction);
}

  function handlePointerMove(e) {
    if (!interaction.active) return;
    if (interaction.pointerId !== e.pointerId) return;

    e.preventDefault();

    interaction.lastClientX = e.clientX;
    interaction.lastClientY = e.clientY;

    if (interaction.raf) return;

    interaction.raf = requestAnimationFrame(() => {
        interaction.raf = 0;

        if (!interaction.active) return;

        const dx = (interaction.lastClientX - interaction.startX) / scale;
        const dy = (interaction.lastClientY - interaction.startY) / scale;

        if (interaction.type === 'drag') {
            updateDragPreview(dx, dy);
        } else {
            updateResizePreview(dx, dy);
        }
    });
}

  function updateDragPreview(dx, dy) {
    const start = interaction.startRect;
    const [outW, outH] = outputSize();

    let x = start.x + dx;
    let y = start.y + dy;

    x = Math.max(0, Math.min(outW - start.width, x));
    y = Math.max(0, Math.min(outH - start.height, y));

    const snapped = snapPosition(
        x,
        y,
        start.width,
        start.height
    );

    x = Math.max(0, Math.min(outW - start.width, snapped.x));
    y = Math.max(0, Math.min(outH - start.height, snapped.y));

    interaction.pending = {
        x: Math.round(x),
        y: Math.round(y),
        width: start.width,
        height: start.height
    };

    applyPreview(interaction.el, interaction.pending);
}

  function updateResizePreview(dx, dy) {
    const start = interaction.startRect;
    const handle = interaction.handle;
    const [outW, outH] = outputSize();

    let left = start.x;
    let top = start.y;
    let right = start.x + start.width;
    let bottom = start.y + start.height;

    if (handle.includes('w')) left += dx;
    if (handle.includes('e')) right += dx;
    if (handle.includes('n')) top += dy;
    if (handle.includes('s')) bottom += dy;

    const keepRatio =
        interaction.source.type === 'image' ||
        interaction.source.type === 'media';

    let width = right - left;
    let height = bottom - top;

    if (keepRatio && (handle.length === 2 || handle === 'nw' || handle === 'ne' || handle === 'sw' || handle === 'se')) {
        const ratio = start.width / Math.max(1, start.height);

        if (Math.abs(dx) >= Math.abs(dy)) {
            height = width / ratio;
        } else {
            width = height * ratio;
        }

        if (handle.includes('w')) {
            left = right - width;
        } else {
            right = left + width;
        }

        if (handle.includes('n')) {
            top = bottom - height;
        } else {
            bottom = top + height;
        }
    }

    width = Math.max(MIN_SOURCE_SIZE, width);
    height = Math.max(MIN_SOURCE_SIZE, height);

    if (left < 0) {
        left = 0;
        width = right - left;
    }

    if (top < 0) {
        top = 0;
        height = bottom - top;
    }

    if (right > outW) {
        right = outW;
        width = right - left;
    }

    if (bottom > outH) {
        bottom = outH;
        height = bottom - top;
    }

    const rect = {
        x: Math.round(left),
        y: Math.round(top),
        width: Math.round(width),
        height: Math.round(height)
    };

    interaction.pending = rect;

    applyPreview(interaction.el, rect);
}

  function snapPosition(x, y, width, height) {
    const scene = store.selectedScene();
    const [outW, outH] = outputSize();

    const candidatesX = [
        0,
        outW / 2,
        outW - width
    ];

    const candidatesY = [
        0,
        outH / 2,
        outH - height
    ];

    if (scene) {
        scene.sources.forEach((other) => {
            if (other.id === interaction.source.id) return;

            const ox = Number(other.x) || 0;
            const oy = Number(other.y) || 0;
            const ow = Number(other.width) || 0;
            const oh = Number(other.height) || 0;

            candidatesX.push(
                ox,
                ox + ow / 2 - width / 2,
                ox + ow - width
            );

            candidatesY.push(
                oy,
                oy + oh / 2 - height / 2,
                oy + oh - height
            );
        });
    }

    const sx = nearestSnap(x, candidatesX);
    const sy = nearestSnap(y, candidatesY);

    return {
        x: sx === null ? x : sx,
        y: sy === null ? y : sy
    };
}

function nearestSnap(value, candidates) {
    let best = null;
    let distance = SNAP_DISTANCE;

    candidates.forEach((candidate) => {
        const d = Math.abs(value - candidate);

        if (d <= distance) {
            distance = d;
            best = candidate;
        }
    });

    return best;
}

  function applyPreview(el, rect) {
    el.style.left = '0';
    el.style.top = '0';

    el.style.width = px(rect.width);
    el.style.height = px(rect.height);

    el.style.transform =
        `translate3d(${px(rect.x)}, ${px(rect.y)}, 0)`;
}
  
function finishPointerInteraction(e) {
    if (!interaction.active) return;
    if (interaction.pointerId !== e.pointerId) return;

    if (interaction.raf) {
        cancelAnimationFrame(interaction.raf);
        interaction.raf = 0;
    }

    const source = interaction.source;
    const el = interaction.el;
    const finalRect = interaction.pending;

    el.releasePointerCapture?.(interaction.pointerId);

    el.removeEventListener('pointermove', handlePointerMove);
    el.removeEventListener('pointerup', finishPointerInteraction);
    el.removeEventListener('pointercancel', finishPointerInteraction);

    el.classList.remove('is-dragging', 'is-resizing');

    interaction.active = false;

    if (!finalRect) {
        resetInteraction();
        return;
    }

    const changed =
        finalRect.x !== interaction.startRect.x ||
        finalRect.y !== interaction.startRect.y ||
        finalRect.width !== interaction.startRect.width ||
        finalRect.height !== interaction.startRect.height;

    if (!changed) {
        resetInteraction();
        return;
    }

    source.x = finalRect.x;
    source.y = finalRect.y;
    source.width = finalRect.width;
    source.height = finalRect.height;

    const scene = store.selectedScene();

    if (!scene) {
        resetInteraction();
        return;
    }

    const updates = {
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height
    };

    api.updateSource(scene.id, source.id, updates)
        .then(() => {
            window.dispatchEvent(new CustomEvent('sources:changed'));
        })
        .catch((err) => {
            alert(err.message);
            workspace.render();
        })
        .finally(() => {
            resetInteraction();
        });
}

function resetInteraction() {
    interaction.active = false;
    interaction.type = null;
    interaction.source = null;
    interaction.el = null;
    interaction.handle = null;
    interaction.pointerId = null;
    interaction.startRect = null;
    interaction.pending = null;
    interaction.raf = 0;
}

document.addEventListener('keydown', (e) => {
    if (interaction.active) return;

    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    const source = store.selectedSource();
    if (!source || source.locked) return;

    const step = e.shiftKey ? 10 : 1;

    let dx = 0;
    let dy = 0;

    if (e.key === 'ArrowLeft') dx = -step;
    if (e.key === 'ArrowRight') dx = step;
    if (e.key === 'ArrowUp') dy = -step;
    if (e.key === 'ArrowDown') dy = step;

    if (!dx && !dy) return;

    e.preventDefault();

    const [outW, outH] = outputSize();

    source.x = Math.max(
        0,
        Math.min(outW - (source.width || 100), (source.x || 0) + dx)
    );

    source.y = Math.max(
        0,
        Math.min(outH - (source.height || 100), (source.y || 100) + dy)
    );

    const scene = store.selectedScene();
    if (!scene) return;

    api.updateSource(scene.id, source.id, {
        x: source.x,
        y: source.y
    }).then(() => {
        window.dispatchEvent(new CustomEvent('sources:changed'));
    }).catch((err) => {
        alert(err.message);
    });

    workspace.render();
});

previewToggle.addEventListener('change', () => {
  previewEnabled = previewToggle.checked;
  render();
});

  window.addEventListener('resize', render);
  store.subscribe(render);
  window.workspace = { render };
})();
