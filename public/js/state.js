(function () {
  const listeners = new Set();

  const state = {
    username: null,
    scenes: [],
    activeSceneId: null,
    platforms: [],
    settings: null,
    encoders: null,
    selectedSourceId: null,
    selectedSceneId: null,   // highlighted in the Scenes panel (not necessarily active/live)
    streamStatus: { streaming: false, uptimeSeconds: 0, lastError: null }
  };

  function notify() { listeners.forEach((fn) => fn(state)); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function activeScene() {
    return state.scenes.find((s) => s.id === state.activeSceneId) || state.scenes[0] || null;
  }

  function selectedScene() {
    return state.scenes.find((s) => s.id === state.selectedSceneId) || activeScene();
  }

  function selectedSource() {
    const scene = selectedScene();
    if (!scene) return null;
    return scene.sources.find((s) => s.id === state.selectedSourceId) || null;
  }

  async function loadAll() {
    const [sessionRes, scenesRes, platformsRes, settingsRes, encodersRes] = await Promise.all([
      api.session(), api.getScenes(), api.getPlatforms(), api.getSettings(), api.getEncoders()
    ]);
    state.username = sessionRes.username;
    state.scenes = scenesRes.scenes;
    state.activeSceneId = scenesRes.activeSceneId;
    state.selectedSceneId = scenesRes.activeSceneId;
    state.platforms = platformsRes.platforms;
    state.settings = settingsRes.settings;
    state.encoders = encodersRes;
    notify();
  }

  async function refreshScenes() {
    const res = await api.getScenes();
    state.scenes = res.scenes;
    state.activeSceneId = res.activeSceneId;
    if (!state.scenes.find((s) => s.id === state.selectedSceneId)) {
      state.selectedSceneId = res.activeSceneId;
    }
    notify();
  }

  async function refreshPlatforms() {
    const res = await api.getPlatforms();
    state.platforms = res.platforms;
    notify();
  }

  async function refreshSettings() {
    const res = await api.getSettings();
    state.settings = res.settings;
    notify();
  }

  async function refreshStreamStatus() {
    try {
      const res = await api.streamStatus();
      state.streamStatus = res;
      notify();
    } catch (e) { /* transient - ignore */ }
  }

  window.store = {
    state, subscribe, notify,
    activeScene, selectedScene, selectedSource,
    loadAll, refreshScenes, refreshPlatforms, refreshSettings, refreshStreamStatus
  };
})();
