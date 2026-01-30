/* =====================================================
   CONFIG
===================================================== */
const SVG_URL = "https://raw.githubusercontent.com/chauctw-ctn/scada/28d326e748acc701b349fe2ac3012a2cc9c9d0e4/Main_BV_3001.svg";
const deviceName = "CTW_TAG";

const MAP_ICON = [
  { key: "running", svg: "bv_st_c1_nt_hz_p1", source: "shared" },
];

const MAP_TEXT = [
  { key: "API_BVT01_Cm_34_nc_th_Flow01", svg: "bv_c1_nt_hz_p1", source: "telemetry", format: v => Number(v).toFixed(2) },
];

/* =====================================================
   STATE
===================================================== */
let svgReady = false;
let updateTimer = null;
const cache = new Map();
const fetchState = new Map();
const callbacks = new Map();

const clearCache = () => { cache.clear(); fetchState.clear(); };

/* =====================================================
   HELPERS
===================================================== */
const normalize = (v) => v == null ? "" : String(v).trim().toLowerCase();

const getEntityId = (entity) => {
  if (!entity) return "";
  const raw = entity.id;
  return typeof raw === 'string' ? raw : (raw?.id ? String(raw.id) : String(raw));
};

const normalizeEntity = (entity) => {
  if (!entity) return null;
  try {
    const id = getEntityId(entity);
    const type = entity.entityType || entity.type || 'DEVICE';
    return { id, entityType: type };
  } catch { return null; }
};

const enqueue = (key, cb) => {
  if (typeof cb !== 'function') return;
  callbacks.set(key, [...(callbacks.get(key) || []), cb]);
};

const flush = (key, value) => {
  const arr = callbacks.get(key);
  if (!arr?.length) return;
  callbacks.delete(key);
  arr.forEach(fn => { try { fn(value); } catch {} });
};

/* =====================================================
   CORE: TELEMETRY
===================================================== */
const getEntityByDevice = (deviceName) => {
  if (!deviceName || !self.ctx?.datasources) return null;
  const wanted = normalize(deviceName);
  
  for (const ds of self.ctx.datasources) {
    if (!ds) continue;
    const name = ds.entityName || ds.name || ds.label;
    if (name && normalize(name) === wanted && ds.entityId) {
      const type = ds.entityType || ds.entityId.entityType || "DEVICE";
      const id = typeof ds.entityId === 'string' ? ds.entityId : (ds.entityId.id || ds.entityId);
      return normalizeEntity({ id, entityType: type });
    }
  }
  return null;
};

const getToken = () => {
  try {
    for (const k of ['jwt_token', 'JWT_TOKEN', 'tb_auth_token', 'token']) {
      const v = window.localStorage?.getItem(k) || window.sessionStorage?.getItem(k);
      if (v?.split('.').length >= 2) return v;
    }
    const user = window.localStorage?.getItem('authUser') || window.sessionStorage?.getItem('authUser');
    if (user) {
      const obj = JSON.parse(user);
      return obj?.token || obj?.jwtToken || obj?.accessToken;
    }
  } catch {}
  return null;
};

const extractValue = (data) => {
  if (data == null) return null;
  if (Array.isArray(data)) {
    for (let i = data.length - 1; i >= 0; i--) {
      const item = data[i];
      if (Array.isArray(item) && item[1] != null) return item[1];
      if (item?.value != null) return item.value;
      if (item?.val != null) return item.val;
    }
    return null;
  }
  return typeof data === 'object' ? (data.value ?? data.val ?? null) : data;
};

const extractFromResponse = (res, key) => {
  if (!res) return null;
  try {
    if (typeof res === 'object' && !Array.isArray(res)) {
      if (res[key]) return extractValue(res[key]);
      const wanted = normalize(key);
      for (const k of Object.keys(res)) {
        if (normalize(k) === wanted) return extractValue(res[k]);
      }
    }
    if (Array.isArray(res)) {
      const wanted = normalize(key);
      for (let i = res.length - 1; i >= 0; i--) {
        const it = res[i];
        if (it?.key && normalize(it.key) === wanted) {
          return it.value ?? it.val ?? extractValue(it.data);
        }
      }
      return extractValue(res);
    }
  } catch {}
  return extractValue(res);
};

const fetchTelemetry = (entity, key, onOk, onErr) => {
  const norm = normalizeEntity(entity);
  if (!norm) {
    (onErr || onOk)(onErr ? new Error('No entity') : null);
    return;
  }

  const url = `/api/plugins/telemetry/${norm.entityType}/${norm.id}/values/timeseries?keys=${encodeURIComponent(key)}`;
  const http = self.ctx?.http || self.ctx?.httpClient;
  
  if (http?.get) {
    try {
      const obs = http.get(url);
      if (obs?.subscribe) {
        obs.subscribe(
          res => onOk(extractFromResponse(res, key)),
          err => (onErr || onOk)(onErr ? err : null)
        );
        return;
      }
    } catch {}
  }

  const headers = {};
  const token = getToken();
  if (token) headers['X-Authorization'] = `Bearer ${token}`;

  fetch(url, { method: 'GET', headers })
    .then(r => r.json())
    .then(res => onOk(extractFromResponse(res, key)))
    .catch(err => (onErr || onOk)(onErr ? err : null));
};

const fetchAttribute = (entity, key, onOk, onErr) => {
  const norm = normalizeEntity(entity);
  if (!norm) {
    (onErr || onOk)(onErr ? new Error('No entity') : null);
    return;
  }

  const url = `/api/plugins/telemetry/${norm.entityType}/${norm.id}/values/attributes/SHARED_SCOPE?keys=${encodeURIComponent(key)}`;
  const http = self.ctx?.http || self.ctx?.httpClient;
  
  if (http?.get) {
    try {
      const obs = http.get(url);
      if (obs?.subscribe) {
        obs.subscribe(
          res => onOk(extractFromResponse(res, key)),
          err => (onErr || onOk)(onErr ? err : null)
        );
        return;
      }
    } catch {}
  }

  const headers = {};
  const token = getToken();
  if (token) headers['X-Authorization'] = `Bearer ${token}`;

  fetch(url, { method: 'GET', headers })
    .then(r => r.json())
    .then(res => onOk(extractFromResponse(res, key)))
    .catch(err => (onErr || onOk)(onErr ? err : null));
};

const getKey = (deviceName, source, key, callback, forceRefresh = false) => {
  const entity = getEntityByDevice(deviceName);
  if (!entity) { 
    callback(null); 
    return; 
  }

  const normSource = normalize(source);
  const isAttribute = normSource === 'attribute' || normSource === 'attributes' || normSource === 'shared';
  const cacheKey = `${isAttribute ? 'attr' : 'tele'}::${normalize(deviceName)}::${normalize(key)}`;
  
  if (!forceRefresh && cache.has(cacheKey)) {
    callback(cache.get(cacheKey));
    return;
  }

  const state = fetchState.get(cacheKey) || { inFlight: false, lastFetch: 0 };
  const now = Date.now();
  
  if (state.inFlight) { 
    enqueue(cacheKey, callback); 
    return; 
  }

  const minInterval = cache.has(cacheKey) ? 1000 : 200;
  if (now - state.lastFetch < minInterval) {
    enqueue(cacheKey, callback);
    return;
  }
  
  state.inFlight = true;
  state.lastFetch = now;
  fetchState.set(cacheKey, state);

  const fetchFn = isAttribute ? fetchAttribute : fetchTelemetry;
  fetchFn(entity, key, v => {
    cache.set(cacheKey, v);
    state.inFlight = false;
    fetchState.set(cacheKey, state);
    flush(cacheKey, v);
    callback(v);
  }, err => {
    state.inFlight = false;
    fetchState.set(cacheKey, state);
    flush(cacheKey, null);
    callback(null);
  });
};

/* =====================================================
   SVG & UPDATE HELPERS
===================================================== */

const toBooleanStatus = (value) => {
  if (value == null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (["true", "on", "yes"].includes(lower)) return true;
    if (["false", "off", "no"].includes(lower)) return false;
    const num = parseFloat(lower);
    return !isNaN(num) ? num !== 0 : lower.length > 0;
  }
  return false;
};

const updateText = (svgId, value) => {
  const el = document.getElementById(svgId);
  if (!el) return;
  const txt = value != null ? String(value) : "--";
  el.setAttribute("text-anchor", "middle");
  const tspan = el.querySelector("tspan");
  (tspan || el).textContent = txt;
};

const applyStatusStyle = (svgId, running) => {
  const color = running ? "lime" : "red";
  const glow = running ? "drop-shadow(0 0 8px lime)" : "drop-shadow(0 0 10px red)";
  const styleId = "style-" + svgId;
  let styleTag = document.getElementById(styleId);
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = styleId;
    document.head.appendChild(styleTag);
  }
  styleTag.innerHTML = `#${svgId} path,#${svgId} circle,#${svgId} rect,#${svgId} line,#${svgId} polygon{stroke:${color}!important;stroke-width:2px!important;transition:stroke .3s,filter .3s}#${svgId}{filter:${glow}}`;
};

const updateIcon = (item) => {
  if (!item?.key || !item.svg) return;
  getKey(deviceName, item.source, item.key, value => {
    applyStatusStyle(item.svg, toBooleanStatus(value));
  });
};

/* =====================================================
   SVG & UPDATE
===================================================== */
self.onInit = function () {
  fetch(SVG_URL)
    .then(r => r.text())
    .then(svg => {
      const container = document.getElementById("svg-container");
      if (!container) return;

      container.innerHTML = svg;
      const svgEl = container.querySelector("svg");
      if (svgEl) {
        svgEl.setAttribute("width", "100%");
        svgEl.setAttribute("height", "100%");
        svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }

      svgReady = true;
      self.onDataUpdated();
      
      // Auto refresh mỗi 5s
      if (updateTimer) clearInterval(updateTimer);
      updateTimer = setInterval(() => {
        clearCache();
        self.onDataUpdated();
      }, 5000);
    })
    .catch(err => console.error("SVG load error", err));
};

self.onDestroy = function () {
  if (updateTimer) clearInterval(updateTimer);
};

self.onDataUpdated = function () {
  if (!svgReady) return;
  MAP_ICON.forEach(updateIcon);
  MAP_TEXT.forEach(item => {
    if (!item?.key) return;
    getKey(deviceName, item.source, item.key, value => {
      updateText(item.svg, value != null && item.format ? item.format(value) : (value ?? "--"));
    });
  });
};
