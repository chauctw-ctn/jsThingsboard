/* =====================================================
   CONFIG
===================================================== */
const SVG_URL = "https://raw.githubusercontent.com/chauctw-ctn/scada/28d326e748acc701b349fe2ac3012a2cc9c9d0e4/Main_BV_3001.svg";
const deviceName = "CTW_TAG";
const UPDATE_INTERVAL = 5000; // Fallback polling interval (ms)
const USE_WEBSOCKET = true; // Enable/disable WebSocket

const MAP_ICON = [
  { key: "running", svg: "bv_st_c1_nt_hz_p1", source: "shared" },
];

const MAP_TEXT = [
  { key: "API_BVT01_Cm_34_nc_th_Flow01", svg: "bv_c1_nt_hz_p1", source: "telemetry", format: v => Number(v).toFixed(2) },
];

const MAP_CALCULATION = [  
  {
    name: "c12_total_flow",
    inputs: ["API_BVT01_NM__NM1_Cm_1_D600_Pulse01", "API_BVT01_NM__NM1_Cm_2_D500_Pulse01"],
    source: "telemetry",
    calculate: (values) => {
      const [flow1, flow2] = Object.values(values);
      return (Number(flow1) || 0) + (Number(flow2) || 0);
    },
    // Scale 4-20mA → 0-10bar    
    // name: "pressure_bar",
    // inputs: ["current_sensor_mA"], // Key chứa giá trị dòng điện (mA)
    // source: "telemetry",
    // calculate: (values) => {
    //   const current = Number(values.current_sensor_mA) || 0;      
    //   // Giới hạn trong khoảng [4, 20] mA
    //   const currentClamped = Math.max(4, Math.min(20, current));      
    //   // Scale tuyến tính:
    //   // 4mA  → 0 bar
    //   // 20mA → 10 bar
    //   // Công thức: pressure = ((current - 4) / (20 - 4)) * (10 - 0)
    //   const pressure = ((currentClamped - 4) / 16) * 10;      
    //   return pressure.toFixed(2); // 2 chữ số thập phân
    // },
    interval: 10000 // ms
  },
];

/* =====================================================
   STATE
===================================================== */
let svgReady = false;
let updateTimer = null;
let wsSubscriptions = [];
let calcTimers = new Map();
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
    const status = toBooleanStatus(value);
    console.log(`🎨 Icon: ${item.key} = ${value} → ${status ? 'ON' : 'OFF'} [${item.svg}]`);
    applyStatusStyle(item.svg, status);
  });
};

/* =====================================================
   SEND TELEMETRY
===================================================== */
const sendTelemetry = (deviceName, key, value) => {
  const entity = getEntityByDevice(deviceName);
  if (!entity) {
    console.error(`❌ Cannot send telemetry: device "${deviceName}" not found`);
    return Promise.reject(new Error('Device not found'));
  }

  const url = `/api/plugins/telemetry/${entity.entityType}/${entity.id}/timeseries/ANY`;
  const body = { [key]: value };
  
  const http = self.ctx?.http || self.ctx?.httpClient;
  
  if (http?.post) {
    try {
      const obs = http.post(url, body);
      if (obs?.subscribe) {
        return new Promise((resolve, reject) => {
          obs.subscribe(
            res => {
              console.log(`✅ Sent telemetry: ${key} = ${value}`);
              resolve(res);
            },
            err => {
              console.error(`❌ Send telemetry failed: ${key}`, err);
              reject(err);
            }
          );
        });
      }
    } catch (e) {}
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Authorization'] = `Bearer ${token}`;

  return fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      console.log(`✅ Sent telemetry: ${key} = ${value}`);
      return r.json().catch(() => ({}));
    })
    .catch(err => {
      console.error(`❌ Send telemetry failed: ${key}`, err);
      throw err;
    });
};

/* =====================================================
   CALCULATION & AUTO SEND
===================================================== */
const processCalculation = (calcConfig) => {
  if (!calcConfig?.name || !calcConfig.inputs?.length || !calcConfig.calculate) return;

  const values = {};
  let pending = calcConfig.inputs.length;

  const tryCalculate = () => {
    if (pending > 0) return;
    
    try {
      const result = calcConfig.calculate(values);
      console.log(`🧮 Calculated: ${calcConfig.name} = ${result}`, values);
      
      sendTelemetry(deviceName, calcConfig.name, result)
        .catch(err => console.error(`Failed to send ${calcConfig.name}:`, err));
    } catch (err) {
      console.error(`Calculation error for ${calcConfig.name}:`, err);
    }
  };

  calcConfig.inputs.forEach(key => {
    getKey(deviceName, calcConfig.source || 'telemetry', key, value => {
      values[key] = value;
      pending--;
      tryCalculate();
    });
  });
};

const startCalculations = () => {
  if (!MAP_CALCULATION || MAP_CALCULATION.length === 0) {
    console.log('ℹ️ No calculations configured');
    return;
  }

  calcTimers.forEach(timer => clearInterval(timer));
  calcTimers.clear();

  MAP_CALCULATION.forEach(calc => {
    const interval = calc.interval || UPDATE_INTERVAL;
    
    processCalculation(calc);
    
    const timer = setInterval(() => {
      clearCache();
      processCalculation(calc);
    }, interval);
    
    calcTimers.set(calc.name, timer);
    console.log(`⏰ Calculation "${calc.name}" scheduled every ${interval}ms`);
  });
};

const stopCalculations = () => {
  calcTimers.forEach(timer => clearInterval(timer));
  calcTimers.clear();
  if (MAP_CALCULATION?.length > 0) {
    console.log('🛑 All calculations stopped');
  }
};

/* =====================================================
   WEBSOCKET SUBSCRIPTION
===================================================== */
const subscribeToKeys = () => {
  if (!USE_WEBSOCKET || !self.ctx?.subscriptionApi) {
    console.log('⚠️ WebSocket disabled or not available');
    return;
  }
  
  const entity = getEntityByDevice(deviceName);
  if (!entity) {
    console.log('⚠️ Cannot subscribe: entity not found');
    return;
  }

  // Cleanup old subscriptions
  wsSubscriptions.forEach(sub => {
    try { self.ctx.subscriptionApi.removeSubscription(sub); } catch {}
  });
  wsSubscriptions = [];

  // Subscribe to telemetry keys
  const teleKeys = [...MAP_TEXT, ...MAP_ICON]
    .filter(m => normalize(m.source) === 'telemetry')
    .map(m => m.key)
    .filter((k, i, arr) => arr.indexOf(k) === i); // unique
  
  if (teleKeys.length) {
    const teleSub = {
      entityId: entity,
      type: 'timeseries',
      keys: teleKeys
    };
    try {
      self.ctx.subscriptionApi.createSubscription(teleSub, (data) => {
        console.log('🔄 WebSocket Telemetry update:', data);
        clearCache();
        self.onDataUpdated();
      });
      wsSubscriptions.push(teleSub);
      console.log('✅ Subscribed to telemetry keys:', teleKeys);
    } catch (err) {
      console.error('❌ Telemetry subscription failed:', err);
    }
  }

  // Subscribe to attribute keys
  const attrKeys = [...MAP_TEXT, ...MAP_ICON]
    .filter(m => ['shared', 'attribute', 'attributes'].includes(normalize(m.source)))
    .map(m => m.key)
    .filter((k, i, arr) => arr.indexOf(k) === i); // unique
  
  if (attrKeys.length) {
    const attrSub = {
      entityId: entity,
      type: 'attributes',
      scope: 'SHARED_SCOPE',
      keys: attrKeys
    };
    try {
      self.ctx.subscriptionApi.createSubscription(attrSub, (data) => {
        console.log('🔄 WebSocket Attribute update:', data);
        clearCache();
        self.onDataUpdated();
      });
      wsSubscriptions.push(attrSub);
      console.log('✅ Subscribed to attribute keys:', attrKeys);
    } catch (err) {
      console.error('❌ Attribute subscription failed:', err);
    }
  }
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
      
      // Setup WebSocket subscriptions
      subscribeToKeys();
      
      // Start calculations
      startCalculations();
      
      // Fallback polling (nếu WebSocket lỗi hoặc tắt)
      if (updateTimer) clearInterval(updateTimer);
      updateTimer = setInterval(() => {
        clearCache();
        self.onDataUpdated();
      }, UPDATE_INTERVAL);
    })
    .catch(err => console.error("SVG load error", err));
};

self.onDestroy = function () {
  if (updateTimer) clearInterval(updateTimer);
  
  // Stop calculations
  stopCalculations();
  
  // Cleanup WebSocket subscriptions
  wsSubscriptions.forEach(sub => {
    try { 
      if (self.ctx?.subscriptionApi) {
        self.ctx.subscriptionApi.removeSubscription(sub);
      }
    } catch {}
  });
  wsSubscriptions = [];
  console.log('🔌 Cleanup completed');
};

self.onDataUpdated = function () {
  if (!svgReady) return;
  MAP_ICON.forEach(updateIcon);
  MAP_TEXT.forEach(item => {
    if (!item?.key) return;
    getKey(deviceName, item.source, item.key, value => {
      const formatted = value != null && item.format ? item.format(value) : (value ?? "--");
      console.log(`📊 Text: ${item.key} = ${value} → "${formatted}" [${item.svg}]`);
      updateText(item.svg, formatted);
    });
  });
};
