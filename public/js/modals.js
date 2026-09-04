(function () {
  const root = document.getElementById('modal-root');

  function close() { root.innerHTML = ''; }

  function open({ title, bodyNode, footer }) {
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

    const modal = document.createElement('div');
    modal.className = 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    header.innerHTML = `<span>${title}</span>`;
    const closeX = document.createElement('button');
    closeX.className = 'icon-btn';
    closeX.textContent = '✕';
    closeX.addEventListener('click', close);
    header.appendChild(closeX);

    const body = document.createElement('div');
    body.className = 'modal-body';
    body.appendChild(bodyNode);

    const footerEl = document.createElement('div');
    footerEl.className = 'modal-footer';
    footer.forEach((btn) => footerEl.appendChild(btn));

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footerEl);
    overlay.appendChild(modal);
    root.appendChild(overlay);
  }

  function field(labelText, inputEl) {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const label = document.createElement('label');
    label.textContent = labelText;
    wrap.appendChild(label);
    wrap.appendChild(inputEl);
    return wrap;
  }

  function fieldRow(...fields) {
    const row = document.createElement('div');
    row.className = 'field-row';
    fields.forEach((f) => row.appendChild(f));
    return row;
  }

  function textInput(value, placeholder) {
    const el = document.createElement('input');
    el.type = 'text';
    if (value !== undefined) el.value = value;
    if (placeholder) el.placeholder = placeholder;
    return el;
  }
  function numberInput(value) {
    const el = document.createElement('input');
    el.type = 'number';
    el.value = value !== undefined ? value : 0;
    return el;
  }
  function btn(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = 'btn ' + cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }
  function cancelBtn() { return btn('Cancel', '', close); }

  // ---------------- Add Scene ----------------
  function openAddScene() {
    const body = document.createElement('div');
    const nameEl = textInput('', 'e.g. Camera + Overlay');
    body.appendChild(field('Scene name', nameEl));
    const errBox = document.createElement('div');
    errBox.className = 'login-error hidden';
    body.appendChild(errBox);

    open({
      title: 'Add Scene',
      bodyNode: body,
      footer: [cancelBtn(), btn('Add Scene', 'btn-primary', async () => {
        try {
          await api.addScene(nameEl.value.trim());
          await store.refreshScenes();
          close();
        } catch (e) {
          errBox.textContent = e.message;
          errBox.classList.remove('hidden');
        }
      })]
    });
  }

  function openSceneProperties(scene) {
    const body = document.createElement('div');
    const nameEl = textInput(scene.name);
    body.appendChild(field('Scene name', nameEl));
    const errBox = document.createElement('div');
    errBox.className = 'login-error hidden';
    body.appendChild(errBox);

    open({
      title: 'Scene Properties',
      bodyNode: body,
footer: [
  cancelBtn(),

  btn('Add Source', 'btn-primary', async () => {
    errBox.classList.add('hidden');

    const sourceName = nameEl.value.trim();

    if (!sourceName) {
      errBox.textContent = 'Source name is required';
      errBox.classList.remove('hidden');
      return;
    }

    try {
      const fd = new FormData();

      fd.append('type', type);
      fd.append('name', sourceName);

      if (type === 'image' || type === 'media') {
        if (!fileInput.files || !fileInput.files[0]) {
          throw new Error('Please choose a file');
        }

        const file = fileInput.files[0];

        fd.append('file', file);
        fd.append('width', widthEl.value);
        fd.append('height', heightEl.value);
        fd.append('x', xEl.value);
        fd.append('y', yEl.value);

        if (type === 'media') {
          fd.append(
            'loop',
            loopEl.checked ? 'true' : 'false'
          );
        }

        uploadProgress.classList.remove('hidden');
        uploadCancelBtn.classList.remove('hidden');

        uploadProgress.querySelector(
          '.upload-progress-status'
        ).textContent = 'Uploading...';

        uploadProgress.querySelector(
          '.upload-progress-percent'
        ).textContent = '0%';

        uploadProgress.querySelector(
          '.upload-progress-bar'
        ).style.width = '0%';

        uploadProgress.querySelector(
          '.upload-progress-loaded'
        ).textContent = formatBytes(0);

        uploadProgress.querySelector(
          '.upload-progress-total'
        ).textContent = formatBytes(file.size);

        activeUpload = api.addSourceWithProgress(
          scene.id,
          fd,
          ({ loaded, total, percent }) => {
            uploadProgress.querySelector(
              '.upload-progress-percent'
            ).textContent = `${percent}%`;

            uploadProgress.querySelector(
              '.upload-progress-bar'
            ).style.width = `${percent}%`;

            uploadProgress.querySelector(
              '.upload-progress-loaded'
            ).textContent = formatBytes(loaded);

            uploadProgress.querySelector(
              '.upload-progress-total'
            ).textContent = formatBytes(total);
          }
        );

        uploadCancelBtn.onclick = () => {
          uploadCancelled = true;

          if (activeUpload) {
            activeUpload.abort();
          }

          fileInput.value = '';

          uploadProgress.querySelector(
            '.upload-progress-status'
          ).textContent = 'Upload cancelled';

          uploadProgress.querySelector(
            '.upload-progress-percent'
          ).textContent = '0%';

          uploadProgress.querySelector(
            '.upload-progress-bar'
          ).style.width = '0%';

          uploadCancelBtn.classList.add('hidden');

          setTimeout(() => {
            close();
          }, 250);
        };

        await activeUpload;

        if (uploadCancelled) {
          return;
        }

        uploadProgress.querySelector(
          '.upload-progress-status'
        ).textContent = 'Upload complete';

        uploadProgress.querySelector(
          '.upload-progress-percent'
        ).textContent = '100%';

        uploadProgress.querySelector(
          '.upload-progress-bar'
        ).style.width = '100%';

        uploadCancelBtn.classList.add('hidden');

      } else if (type === 'text') {
        fd.append('text', textEl.value);
        fd.append('fontFamily', fontFamilyEl.value);
        fd.append('fontSize', fontSizeEl.value);
        fd.append('color', colorEl.value + 'FF');
        fd.append('x', xEl.value);
        fd.append('y', yEl.value);

        fd.append(
          'width',
          Math.max(
            120,
            textEl.value.length *
              fontSizeEl.value *
              0.6
          )
        );

        fd.append(
          'height',
          Number(fontSizeEl.value) * 1.4
        );

        await api.addSource(scene.id, fd);
      }

      await store.refreshScenes();
      close();

    } catch (e) {
      if (e.code === 'UPLOAD_ABORTED' || uploadCancelled) {
        return;
      }

      errBox.textContent = e.message;
      errBox.classList.remove('hidden');

    } finally {
      activeUpload = null;
    }
  })
]
    });
  }

  // ---------------- Add Source ----------------
  function openAddSourceChooser() {
    const body = document.createElement('div');
    body.innerHTML = '<div class="modal-desc">Choose a source type</div>';
    const choices = document.createElement('div');
    choices.style.display = 'flex';
    choices.style.gap = '8px';
    [['Image', 'image'], ['Media', 'media'], ['Text', 'text']].forEach(([label, type]) => {
      const b = btn(label, 'btn-primary', () => { close(); openAddSourceForm(type); });
      b.style.flex = '1';
      choices.appendChild(b);
    });
    body.appendChild(choices);
    open({ title: 'Add Source', bodyNode: body, footer: [cancelBtn()] });
  }
  
function openAddSourceForm(type) {
  const scene = store.selectedScene();
  const body = document.createElement('div');

  const nameEl = textInput('', 'Source name');
  body.appendChild(field('Source Name', nameEl));

  const errBox = document.createElement('div');
  errBox.className = 'login-error hidden';

    let uploadXhr = null;

const uploadProgress = document.createElement('div');
uploadProgress.className = 'upload-progress hidden';

uploadProgress.innerHTML = `
  <div class="upload-progress-header">
    <span class="upload-progress-label">Uploading...</span>
    <span class="upload-progress-percent">0%</span>
  </div>

  <div class="upload-progress-track">
    <div class="upload-progress-bar"></div>
  </div>

  <div class="upload-progress-details">
    <span class="upload-progress-size">0 B / 0 B</span>
  </div>
`;

body.appendChild(uploadProgress);
body.appendChild(errBox);

const progressBar = uploadProgress.querySelector('.upload-progress-bar');
const progressPercent = uploadProgress.querySelector('.upload-progress-percent');
const progressLabel = uploadProgress.querySelector('.upload-progress-label');
const progressSize = uploadProgress.querySelector('.upload-progress-size');

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  return `${value.toFixed(value >= 100 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function setUploadProgress({ loaded, total, percent }) {
  uploadProgress.classList.remove('hidden');

  const safePercent = Math.max(
    0,
    Math.min(100, Number(percent) || 0)
  );

  progressBar.style.width = `${safePercent}%`;
  progressPercent.textContent = `${safePercent}%`;

  progressSize.textContent =
    `${formatBytes(loaded)} / ${formatBytes(total)}`;
}

function setUploadingState(uploading) {
  isUploading = uploading;

  uploadProgress.classList.toggle(
    'hidden',
    !uploading
  );
}

  let fileInput, widthEl, heightEl, xEl, yEl, loopEl;
  let textEl, fontFamilyEl, fontSizeEl, colorEl;

let uploadController = null;
let isUploading = false;
  
  if (type === 'image') {
    const desc = document.createElement('div');
    desc.className = 'modal-desc';
    desc.textContent =
      'Add images to your scene. Supported: PNG, JPG, JPEG, GIF, TGA, BMP';
    body.appendChild(desc);

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.png,.jpg,.jpeg,.gif,.tga,.bmp';

    body.appendChild(field('Image File', fileInput));

    widthEl = numberInput(320);
    heightEl = numberInput(240);

    body.appendChild(
      fieldRow(
        field('Width', widthEl),
        field('Height', heightEl)
      )
    );

    xEl = numberInput(0);
    yEl = numberInput(0);

    body.appendChild(
      fieldRow(
        field('Position X', xEl),
        field('Position Y', yEl)
      )
    );

  } else if (type === 'media') {
    const desc = document.createElement('div');
    desc.className = 'modal-desc';
    desc.textContent =
      'Add videos or audio clips to your scene. Supported: MP4, MP3, WEBM';
    body.appendChild(desc);

    fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.mp4,.mp3,.webm';

    body.appendChild(field('Local File', fileInput));

    loopEl = document.createElement('input');
    loopEl.type = 'checkbox';

    const loopWrap = document.createElement('label');
    loopWrap.style.display = 'flex';
    loopWrap.style.alignItems = 'center';
    loopWrap.style.gap = '6px';

    loopWrap.appendChild(loopEl);
    loopWrap.appendChild(document.createTextNode('Loop'));

    body.appendChild(loopWrap);

    widthEl = numberInput(320);
    heightEl = numberInput(240);

    body.appendChild(
      fieldRow(
        field('Width', widthEl),
        field('Height', heightEl)
      )
    );

    xEl = numberInput(0);
    yEl = numberInput(0);

    body.appendChild(
      fieldRow(
        field('Position X', xEl),
        field('Position Y', yEl)
      )
    );

  } else if (type === 'text') {
    const desc = document.createElement('div');
    desc.className = 'modal-desc';
    desc.textContent = 'Add text to your scene and adjust its style.';
    body.appendChild(desc);

    fontFamilyEl = textInput('Sans');
    body.appendChild(field('Font Family', fontFamilyEl));

    fontSizeEl = numberInput(32);
    body.appendChild(field('Font Size', fontSizeEl));

    textEl = document.createElement('textarea');
    textEl.rows = 3;
    body.appendChild(field('Text', textEl));

    colorEl = document.createElement('input');
    colorEl.type = 'color';
    colorEl.value = '#ffffff';
    body.appendChild(field('Color', colorEl));

    xEl = numberInput(40);
    yEl = numberInput(40);

    body.appendChild(
      fieldRow(
        field('Position X', xEl),
        field('Position Y', yEl)
      )
    );
  }

  body.appendChild(errBox);

  open({
    title: `Add ${type[0].toUpperCase() + type.slice(1)} Source`,
    bodyNode: body,

footer: [
  (() => {
    const cancel = btn('Cancel', '', () => {
      if (isUploading && uploadController) {
        uploadController.abort();
      }

      uploadController = null;
      isUploading = false;

      if (fileInput) {
        fileInput.value = '';
      }

      close();
    });

    return cancel;
  })(),

  btn('Add Source', 'btn-primary', async () => {
    errBox.classList.add('hidden');

    if (isUploading) {
      return;
    }

    const sourceName = nameEl.value.trim();

    if (!sourceName) {
      errBox.textContent = 'Source name is required';
      errBox.classList.remove('hidden');
      return;
    }

    try {
      const fd = new FormData();

      fd.append('type', type);
      fd.append('name', sourceName);

      if (type === 'image' || type === 'media') {
        if (!fileInput.files || !fileInput.files[0]) {
          throw new Error('Please choose a file');
        }

        const selectedFile = fileInput.files[0];

        fd.append('file', selectedFile);
        fd.append('width', widthEl.value);
        fd.append('height', heightEl.value);
        fd.append('x', xEl.value);
        fd.append('y', yEl.value);

        if (type === 'media') {
          fd.append(
            'loop',
            loopEl.checked ? 'true' : 'false'
          );
        }

        uploadController = new AbortController();
        setUploadingState(true);

        progressLabel.textContent =
          `Uploading ${type}...`;

        setUploadProgress({
          loaded: 0,
          total: selectedFile.size,
          percent: 0
        });

        const buttons = root.querySelectorAll(
          '.modal-footer .btn'
        );

        buttons.forEach((button) => {
          if (button.textContent === 'Add Source') {
            button.disabled = true;
          }
        });

        try {
          await api.addSourceWithProgress(
            scene.id,
            fd,
            {
              signal: uploadController.signal,

              onProgress: ({
                loaded,
                total,
                percent
              }) => {
                setUploadProgress({
                  loaded,
                  total,
                  percent
                });
              }
            }
          );

          progressLabel.textContent = 'Upload complete';
          progressBar.style.width = '100%';
          progressPercent.textContent = '100%';

          await store.refreshScenes();

          uploadController = null;
          isUploading = false;

          close();

        } catch (e) {

          if (e.name === 'AbortError') {
            uploadController = null;
            isUploading = false;

            if (fileInput) {
              fileInput.value = '';
            }

            close();
            return;
          }

          throw e;
        }

        return;
      }

      if (type === 'text') {
        fd.append('text', textEl.value);
        fd.append('fontFamily', fontFamilyEl.value);
        fd.append('fontSize', fontSizeEl.value);
        fd.append('color', colorEl.value + 'FF');
        fd.append('x', xEl.value);
        fd.append('y', yEl.value);

        fd.append(
          'width',
          Math.max(
            120,
            textEl.value.length *
              fontSizeEl.value *
              0.6
          )
        );

        fd.append(
          'height',
          Number(fontSizeEl.value) * 1.4
        );
      }

      await api.addSource(scene.id, fd);

      await store.refreshScenes();

      close();

    } catch (e) {
      uploadController = null;
      isUploading = false;

      errBox.textContent = e.message;
      errBox.classList.remove('hidden');

      const buttons = root.querySelectorAll(
        '.modal-footer .btn'
      );

      buttons.forEach((button) => {
        if (button.textContent === 'Add Source') {
          button.disabled = false;
        }
      });
    }
  })
]
  });
}

  // ---------------- Source Properties ----------------
  function openSourceProperties(source) {
    const scene = store.selectedScene();
    const body = document.createElement('div');
    const nameEl = textInput(source.name);
    body.appendChild(field('Source Name', nameEl));

    let widthEl, heightEl, xEl, yEl, loopEl, textEl, fontFamilyEl, fontSizeEl, colorEl;

    if (source.type === 'image' || source.type === 'media') {
      widthEl = numberInput(source.width); heightEl = numberInput(source.height);
      body.appendChild(fieldRow(field('Width', widthEl), field('Height', heightEl)));
      xEl = numberInput(source.x); yEl = numberInput(source.y);
      body.appendChild(fieldRow(field('Position X', xEl), field('Position Y', yEl)));
      if (source.type === 'media') {
        loopEl = document.createElement('input'); loopEl.type = 'checkbox'; loopEl.checked = !!source.loop;
        const loopWrap = document.createElement('label');
        loopWrap.style.display = 'flex'; loopWrap.style.alignItems = 'center'; loopWrap.style.gap = '6px';
        loopWrap.appendChild(loopEl); loopWrap.appendChild(document.createTextNode('Loop'));
        body.appendChild(loopWrap);
      }
    } else if (source.type === 'text') {
      fontFamilyEl = textInput(source.fontFamily);
      body.appendChild(field('Font Family', fontFamilyEl));
      fontSizeEl = numberInput(source.fontSize);
      body.appendChild(field('Font Size', fontSizeEl));
      textEl = document.createElement('textarea'); textEl.rows = 3; textEl.value = source.text || '';
      body.appendChild(field('Text', textEl));
      colorEl = document.createElement('input'); colorEl.type = 'color';
      colorEl.value = (source.color || '#FFFFFFFF').slice(0, 7);
      body.appendChild(field('Color', colorEl));
      xEl = numberInput(source.x); yEl = numberInput(source.y);
      body.appendChild(fieldRow(field('Position X', xEl), field('Position Y', yEl)));
    }

    const errBox = document.createElement('div');
    errBox.className = 'login-error hidden';
    body.appendChild(errBox);

    open({
      title: 'Source Properties',
      bodyNode: body,
      footer: [cancelBtn(), btn('Save', 'btn-primary', async () => {
        try {
          const payload = { name: nameEl.value.trim(), x: Number(xEl.value), y: Number(yEl.value) };
          if (widthEl) { payload.width = Number(widthEl.value); payload.height = Number(heightEl.value); }
          if (loopEl) payload.loop = loopEl.checked;
          if (source.type === 'text') {
            payload.text = textEl.value;
            payload.fontFamily = fontFamilyEl.value;
            payload.fontSize = Number(fontSizeEl.value);
            payload.color = colorEl.value + 'FF';
          }
          await api.updateSource(scene.id, source.id, payload);
          await store.refreshScenes();
          close();
        } catch (e) {
          errBox.textContent = e.message;
          errBox.classList.remove('hidden');
        }
      })]
    });
  }

  // ---------------- Edit Platform ----------------
  function openEditPlatform(platform) {
    const body = document.createElement('div');
    const keyEl = textInput(platform.streamKey);
    keyEl.type = 'password';
    const showBtnEl = btn('Show', 'btn-sm', () => {
      keyEl.type = keyEl.type === 'password' ? 'text' : 'password';
      showBtnEl.textContent = keyEl.type === 'password' ? 'Show' : 'Hide';
    });
    const keyRow = document.createElement('div');
    keyRow.className = 'stream-key-row';
    keyRow.appendChild(keyEl);
    keyRow.appendChild(showBtnEl);

    body.appendChild(field('Service', (() => { const s = document.createElement('div'); s.textContent = platform.name; s.style.color = 'var(--text-dim)'; return s; })()));
    body.appendChild(field('Stream Key', keyRow));

    let serverEl;
    if (platform.service === 'RTMP') {
      serverEl = textInput(platform.server);
      body.appendChild(field('Server', serverEl));
    }

    const errBox = document.createElement('div');
    errBox.className = 'login-error hidden';
    body.appendChild(errBox);

    open({
      title: 'Edit Platform',
      bodyNode: body,
      footer: [cancelBtn(), btn('Save', 'btn-primary', async () => {
        try {
          const payload = { streamKey: keyEl.value };
          if (serverEl) payload.server = serverEl.value;
          await api.updatePlatform(platform.id, payload);
          await store.refreshPlatforms();
          close();
        } catch (e) {
          errBox.textContent = e.message;
          errBox.classList.remove('hidden');
        }
      })]
    });
  }

  window.modals = {
    openAddScene, openSceneProperties,
    openAddSourceChooser, openSourceProperties,
    openEditPlatform,
    close
  };
})();
