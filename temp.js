/************************************************************
 * THINGSBOARD SCADA SVG - DEVICE: NMNBV (PRO VERSION - FIXED)
 ************************************************************/

let svgReady = false;
let sharedTimer = null;
let telemetryTimer = null; // <-- THÊM DÒNG NÀY VÀO ĐÂY
let lastUpdateTime = 0;

// Set true to log (key -> value) retrieved from telemetry
const LOG_TELEMETRY_VALUE = true;

// Cache + throttle for fetching latest telemetry via service (similar to shared attribute)
const telemetryCache = new Map(); // normalizedKey -> value
const telemetryFetchState = new Map(); // normalizedKey -> { inFlight: boolean, lastFetch: number }
const telemetryPendingCallbacks = new Map(); // key -> Array<Function>

// Hàm xóa cache telemetry để buộc fetch lại dữ liệu mới
function clearTelemetryCache() {
    telemetryCache.clear();
    telemetryFetchState.clear();
    console.log('🔄 Telemetry cache cleared - will fetch fresh data');
}

function logTelemetryValue(key, value, extra) {
    if (!LOG_TELEMETRY_VALUE) return;
    const suffix = extra ? ` ${extra}` : "";
    console.log(`📡 Telemetry: ${key} = ${value}${suffix}`);
}

function logAttributeValue(key, value, extra) {
    if (!LOG_TELEMETRY_VALUE) return;
    const suffix = extra ? ` ${extra}` : "";
    console.log(`🔑 Attribute: ${key} = ${value}${suffix}`);
}

function enqueueTelemetryCallback(k, cb) {
    if (typeof cb !== 'function') return;
    const arr = telemetryPendingCallbacks.get(k) || [];
    arr.push(cb);
    telemetryPendingCallbacks.set(k, arr);
}

function flushTelemetryCallbacks(k, value) {
    const arr = telemetryPendingCallbacks.get(k);
    if (!arr || arr.length === 0) return;
    telemetryPendingCallbacks.delete(k);
    arr.forEach(fn => {
        try { fn(value); } catch (e) { /* ignore */ }
    });
}

/* ================= CONFIG ================= */

const SVG_URL = "https://raw.githubusercontent.com/chauctw-ctn/scada/6226492fb75810937e91fb5e71ae7a094e65e307/Main_NMNCT1_2801.svg";

const MAP_ICON = [
    //{ key: "running", svg: "g1", source: "shared" }
    { key: "c1_nt_hz_p1", svg: "st_c1_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c1_nt_hz_p2", svg: "st_c1_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c1_nt_hz_p3", svg: "st_c1_nt_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c1_ns_hz_p1", svg: "st_c1_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c1_ns_hz_p2", svg: "st_c1_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c1_ns_hz_p3", svg: "st_c1_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c1_hz_pac1", svg: "st_c1_hz_pac1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c1_hz_pac2", svg: "st_c1_hz_pac2", source: "telemetry", deviceName: "CTW_TAG" },
    
    
    
    { key: "c2_nt_hz_p1", svg: "st_c2_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_nt_hz_p2", svg: "st_c2_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_nt_hz_p3", svg: "st_c2_nt_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c2_ns_hz_p1", svg: "st_c2_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_ns_hz_p2", svg: "st_c2_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_ns_hz_p3", svg: "st_c2_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c2_hz_pac1", svg: "st_c2_hz_pac1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_hz_pac2", svg: "st_c2_hz_pac2", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c34_nt_hz_p1", svg: "st_c34_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_nt_hz_p2", svg: "st_c34_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_nt_hz_p3", svg: "st_c34_nt_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c34_nt_pac_Lh", svg: "st_c34_nt_hz_pac1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_ns_pac_Lh", svg: "st_c34_ns_hz_pac2", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c1_clo_Grh", svg: "st_c1_hz_clo1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c2_clo_Grh", svg: "st_c2_hz_clo1", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "c34_ns_hz_p1", svg: "st_c34_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_ns_hz_p2", svg: "st_c34_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_ns_hz_p3", svg: "st_c34_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "c34_ns_hz_p4", svg: "st_c34_ns_hz_p4", source: "telemetry", deviceName: "CTW_TAG" }
    
];

const MAP_TEXT = [
    
    
    
    { key: "CTN_NUOCSACH_CUM1__pH", svg: "c1_ns_pH", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM1__Clo", svg: "c1_ns_mgL", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM1__Tur", svg: "c1_ns_ntu", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM2__pH", svg: "c2_ns_pH", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM2__Clo", svg: "c2_ns_mgL", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM2__Tur", svg: "c2_ns_ntu", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    
    { key: "c1_nt_hz_p1", svg: "c1_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_hz_p2", svg: "c1_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_hz_p3", svg: "c1_nt_hz_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_ampe_p1", svg: "c1_nt_ampe_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_ampe_p2", svg: "c1_nt_ampe_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_ampe_p3", svg: "c1_nt_ampe_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_nt_flow", svg: "c1_nt_flow", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_nt_ntu", svg: "c1_nt_ntu", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_hz_pac1", svg: "c1_hz_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_hz_pac2", svg: "c1_hz_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_ns_hz_p1", svg: "c1_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_ns_hz_p2", svg: "c1_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_ns_hz_p3", svg: "c1_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_ns_ampe_p1", svg: "c1_ns_ampe_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_ns_ampe_p2", svg: "c1_ns_ampe_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_ns_ampe_p3", svg: "c1_ns_ampe_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_basin_M", svg: "c1_basin_M", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    { key: "c2_nt_hz_p1", svg: "c2_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_nt_hz_p2", svg: "c2_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_nt_hz_p3", svg: "c2_nt_hz_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ns_hz_p1", svg: "c2_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ns_hz_p2", svg: "c2_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ns_hz_p3", svg: "c2_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ns_ampe_p1", svg: "c2_ns_ampe_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_ns_ampe_p2", svg: "c2_ns_ampe_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_ns_ampe_p3", svg: "c2_ns_ampe_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_nt_ampe_p1", svg: "c2_nt_ampe_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_nt_ampe_p2", svg: "c2_nt_ampe_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_nt_ampe_p3", svg: "c2_nt_ampe_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_nt_flow", svg: "c2_nt_flow", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_hz_pac1", svg: "c2_hz_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_hz_pac2", svg: "c2_hz_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ns_flow", svg: "c2_ns_flow", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "API_BVT01_NM__NM1_Cm_2_D500_Pulse01", svg: "c2_ns_total", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_ns_bar", svg: "c2_ns_bar", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_basin_M", svg: "c2_basin_M", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    
    
    { key: "c34_nt_hz_p1", svg: "c34_nt_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_hz_p2", svg: "c34_nt_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_ampe_p1", svg: "c34_nt_ampe_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_ampe_p2", svg: "c34_nt_ampe_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_flow", svg: "c34_nt_flow", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_ntu", svg: "c34_nt_ntu", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_nt_pH", svg: "c34_nt_pH", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    { key: "c34_ns_hz_p1", svg: "c34_ns_hz_p1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_ns_hz_p2", svg: "c34_ns_hz_p2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_ns_hz_p3", svg: "c34_ns_hz_p3", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_ns_hz_p4", svg: "c34_ns_hz_p4", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c34_ns_flow", svg: "c34_ns_flow", source: "telemetry", deviceName: "CTW_TAG" },
    { key: "API_BVT01_NM__NM1_Cm_4_D400_Pulse01", svg: "c34_ns_total", source: "telemetry", deviceName: "CTW_TAG" },
    
    { key: "CTN_NUOCSACH_CUM34__pH", svg: "c34_ns_pH", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM34__Tur", svg: "c34_ns_ntu", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "CTN_NUOCSACH_CUM34__Clo", svg: "c34_ns_mgL", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    { key: "c34_nt_pac1", svg: "c34_nt_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c34_nt_pac2", svg: "c34_nt_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c34_nt_pac_Lh", svg: "c34_nt_pac_Lh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c34_ns_pac_Lh", svg: "c34_ns_pac_Lh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c34_clo_Grh", svg: "c34_clo_Grh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    
    { key: "c34_ns_pac1", svg: "c34_ns_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c34_ns_pac2", svg: "c34_ns_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    
    
    { key: "c1_pac1", svg: "c1_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_pac2", svg: "c1_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_pac1", svg: "c2_pac1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_pac2", svg: "c2_pac2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c12_kg_clo1", svg: "c12_kg_clo1", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c12_kg_clo2", svg: "c12_kg_clo2", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_pac_Lh", svg: "c1_pac_Lh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_pac_Lh", svg: "c2_pac_Lh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_clo_Grh", svg: "c1_clo_Grh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c2_clo_Grh", svg: "c2_clo_Grh", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "c1_ntu_sl", svg: "c1_ntu_sl", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c2_ntu_sl", svg: "c2_ntu_sl", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    { key: "c1_ns_bar", svg: "c1_ns_bar", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(2) },
    
    { key: "API_BVT01_NM__NM1_Cm_1_D600_Pulse01", svg: "c1_ns_total", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    { key: "API_BVT01_Cm_34_nc_th_Pulse01", svg: "c34_nt_total", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    
    //{ key: "c1_nt_total", svg: "c1_nt_total", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    //{ key: "c2_nt_total1", svg: "c2_nt_total", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) },
    
    
    { key: "c1_ns_flow", svg: "c1_ns_flow", source: "telemetry", deviceName: "CTW_TAG", format: v => Number(v).toFixed(0) }
    
];


/* ================= INIT ================= */

self.onInit = function () {
    fetch(SVG_URL)
        .then(r => r.text())
        .then(svg => {
            const container = document.getElementById("svg-container");
            if (!container) { return; }

            container.innerHTML = svg;
            svgReady = true;
            // Update ngay khi load xong
            self.onDataUpdated();

            // Đọc shared attribute định kỳ (2s)
            sharedTimer = setInterval(updateSharedAttributes, 2000);
            
            // Cập nhật telemetry định kỳ (5s): clear cache và gọi onDataUpdated
            telemetryTimer = setInterval(() => {
                clearTelemetryCache();
                lastUpdateTime = 0; // Reset debounce để cho phép update
                self.onDataUpdated();
            }, 5000);
        })
        .catch(() => {});
};

self.onDestroy = function () { 
    if (sharedTimer) clearInterval(sharedTimer);
    if (telemetryTimer) clearInterval(telemetryTimer);
};


/* ================= CORE: TELEMETRY (FIXED) ================= */

/**
 * Lấy giá trị telemetry từ ctx.data - Phiên bản cải thiện
 * Hỗ trợ nhiều cách lấy dữ liệu khác nhau
 */
function getTelemetryValue(key, deviceName) {
    if (!key) { return null; }

    const wanted = normalizeKey(key);
    
    // If deviceName provided, use same cache key format as getTelemetryLatestForDevice
    if (deviceName) {
        const cacheKey = normalizeKey(deviceName) + "::" + wanted;
        if (telemetryCache.has(cacheKey)) { return telemetryCache.get(cacheKey); }
        return null;
    }
    
    // Single source of truth: use cached latest fetched via service/REST per entity
    const entity = getEntityId();
    const entityKey = entity ? normalizeKey(entityIdToString(entity)) : "";
    const cacheKey = entityKey ? (entityKey + "::" + wanted) : wanted;

    if (telemetryCache.has(cacheKey)) { return telemetryCache.get(cacheKey); }

    // Optional: also check plain key cache in case some callers stored without entity prefix
    if (cacheKey !== wanted && telemetryCache.has(wanted)) { return telemetryCache.get(wanted); }

    return null;
}

/**
 * Lấy telemetry latest theo key bằng service (giống shared attribute: gọi theo entityId + key).
 * Kết quả sẽ cache vào telemetryCache và gọi callback.
 */
// Removed: getTelemetryLatest (unused after simplification). Use getTelemetryLatestForDevice instead.

function getTelemetryLatestForDevice(deviceName, key, callback) {
    const byName = getEntityIdByDeviceName(deviceName);
    const entity = byName || getEntityId();
    if (!entity) { callback(null); return; }

    // Reuse the same cache by key+device to avoid collisions across devices
    const cacheKey = normalizeKey(`${deviceName || entityIdToString(entity)}`) + "::" + normalizeKey(key);
    if (telemetryCache.has(cacheKey)) {
        callback(telemetryCache.get(cacheKey));
        return;
    }

    // Minimal throttle per cacheKey
    const state = telemetryFetchState.get(cacheKey) || { inFlight: false, lastFetch: 0 };
    const now = Date.now();
    if (state.inFlight) { enqueueTelemetryCallback(cacheKey, callback); return; }

    const minIntervalMs = telemetryCache.has(cacheKey) ? 1000 : 200;
    if (now - state.lastFetch < minIntervalMs) {
        enqueueTelemetryCallback(cacheKey, callback);
        return;
    }
    state.inFlight = true;
    state.lastFetch = now;
    telemetryFetchState.set(cacheKey, state);

    const svc = (self.ctx && (self.ctx.telemetryService || self.ctx.timeseriesService || self.ctx.timeSeriesService)) || null;
    if (!svc) {
        // Không có service -> gọi REST trực tiếp
        getTelemetryLatestViaRest(entity, key, v => {
            telemetryCache.set(cacheKey, v);
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, v);
            callback(v);
        }, err => {
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, null);
            callback(null);
        });
        return;
    }

    getTelemetryLatestByEntity(svc, entity, key, (value, raw) => {
        if (value !== null && value !== undefined) {
            telemetryCache.set(cacheKey, value);
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, value);
            callback(value);
            return;
        }

        // Service trả null -> fallback REST trực tiếp
        getTelemetryLatestViaRest(entity, key, v => {
            telemetryCache.set(cacheKey, v);
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, v);
            callback(v);
        }, err => {
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, null);
            callback(null);
        });
    }, err => {
        // Service lỗi -> fallback REST
        getTelemetryLatestViaRest(entity, key, v => {
            telemetryCache.set(cacheKey, v);
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, v);
            callback(v);
        }, err2 => {
            state.inFlight = false;
            telemetryFetchState.set(cacheKey, state);
            flushTelemetryCallbacks(cacheKey, null);
            callback(null);
        });
    });
}

function getTelemetryLatestViaRest(entity, key, onOk, onErr) {
    const normalizedEntity = normalizeEntityRef(entity);
    if (!normalizedEntity) {
        if (typeof onErr === 'function') onErr(new Error('No entity'));
        else onOk(null);
        return;
    }

    const entityType = normalizedEntity.entityType || 'DEVICE';
    const entityId = entityIdToString(normalizedEntity);
    const url = `/api/plugins/telemetry/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/values/timeseries?keys=${encodeURIComponent(key)}`;

    // Preferred: Angular HttpClient from ThingsBoard (auto-injects JWT)
    const http = self.ctx && (self.ctx.http || self.ctx.httpClient);
    if (http && typeof http.get === 'function') {
        try {
            const obs = http.get(url);
            if (obs && typeof obs.subscribe === 'function') {
                obs.subscribe(
                    res => {
                        const v = extractTelemetryFromServiceResponse(res, key);
                        onOk(v);
                    },
                    err => (typeof onErr === 'function' ? onErr(err) : onOk(null))
                );
                return;
            }
        } catch (e) {
            // fall through
        }
    }

    // Fallback: fetch + try to attach JWT from localStorage (if present)
    const headers = {};
    const token = tryGetTbJwtToken();
    if (token) headers['X-Authorization'] = `Bearer ${token}`;

    fetch(url, { method: 'GET', headers })
        .then(r => r.json())
        .then(res => {
            const v = extractTelemetryFromServiceResponse(res, key);
            onOk(v);
        })
        .catch(err => (typeof onErr === 'function' ? onErr(err) : onOk(null)));
}

function tryGetTbJwtToken() {
    try {
        const candidates = [
            'jwt_token',
            'JWT_TOKEN',
            'tb_auth_token',
            'TB_AUTH_TOKEN',
            'token',
            'access_token',
            'auth_token'
        ];
        for (const k of candidates) {
            const v1 = window.localStorage && window.localStorage.getItem(k);
            if (v1 && typeof v1 === 'string' && v1.split('.').length >= 2) return v1;
            const v2 = window.sessionStorage && window.sessionStorage.getItem(k);
            if (v2 && typeof v2 === 'string' && v2.split('.').length >= 2) return v2;
        }

        // Some TB builds store token JSON
        const maybe = (window.localStorage && (window.localStorage.getItem('authUser') || window.localStorage.getItem('user')))
            || (window.sessionStorage && (window.sessionStorage.getItem('authUser') || window.sessionStorage.getItem('user')));
        if (maybe) {
            const obj = JSON.parse(maybe);
            const t = obj?.token || obj?.jwtToken || obj?.accessToken;
            if (t) return t;
        }
    } catch (e) {
        // ignore
    }
    return null;
}

function getTelemetryLatestByEntity(svc, entity, key, onOk, onErr) {
    const normalizedEntity = normalizeEntityRef(entity) || entity;
    const entityType = normalizedEntity?.entityType;
    const entityIdStr = normalizedEntity ? entityIdToString(normalizedEntity) : entityIdToString(entity);

    const now = Date.now();
    const startTs = now - 24 * 60 * 60 * 1000; // 24h window
    const endTs = now;
    const limit = 1;

    // Thử nhiều signature vì mỗi bản TB/Widget có thể khác
    const attempts = [
        // Latest timeseries API
        () => (typeof svc.getLatestTimeseries === 'function' ? svc.getLatestTimeseries(normalizedEntity, [key]) : null),
        () => (typeof svc.getLatestTimeseries === 'function' ? svc.getLatestTimeseries(normalizedEntity, key) : null),
        // Some builds use (entityType, entityId, keys)
        () => (typeof svc.getLatestTimeseries === 'function' && entityType ? svc.getLatestTimeseries(entityType, entityIdStr, [key]) : null),
        () => (typeof svc.getLatestTimeseries === 'function' ? svc.getLatestTimeseries(entityIdStr, [key]) : null),

        // Timeseries API (thường cần start/end/limit)
        () => (typeof svc.getEntityTimeseries === 'function' ? svc.getEntityTimeseries(normalizedEntity, [key], startTs, endTs, 0, limit, 'NONE', 'DESC') : null),
        () => (typeof svc.getTimeseries === 'function' ? svc.getTimeseries(normalizedEntity, [key], startTs, endTs, 0, limit, 'NONE', 'DESC') : null),
        // Some builds use (entityType, entityId, keys, startTs, endTs, ...)
        () => (typeof svc.getEntityTimeseries === 'function' && entityType ? svc.getEntityTimeseries(entityType, entityIdStr, [key], startTs, endTs, 0, limit, 'NONE', 'DESC') : null),
        () => (typeof svc.getTimeseries === 'function' && entityType ? svc.getTimeseries(entityType, entityIdStr, [key], startTs, endTs, 0, limit, 'NONE', 'DESC') : null),

        // Fallback minimal params (nếu service có default)
        () => (typeof svc.getEntityTimeseries === 'function' ? svc.getEntityTimeseries(normalizedEntity, [key]) : null),
        () => (typeof svc.getTimeseries === 'function' ? svc.getTimeseries(normalizedEntity, [key]) : null),
        () => (typeof svc.getEntityTimeseries === 'function' && entityType ? svc.getEntityTimeseries(entityType, entityIdStr, [key]) : null),
        () => (typeof svc.getTimeseries === 'function' && entityType ? svc.getTimeseries(entityType, entityIdStr, [key]) : null)
    ];

    let obs = null;
    for (const fn of attempts) {
        try {
            obs = fn();
            if (obs && typeof obs.subscribe === 'function') break;
        } catch (e) {
            obs = null;
        }
    }

    if (!obs || typeof obs.subscribe !== 'function') { onOk(null, null); return; }

    obs.subscribe(
        res => {
            const value = extractTelemetryFromServiceResponse(res, key);
            onOk(value, res);
        },
        err => { if (typeof onErr === 'function') onErr(err); else onOk(null, null); }
    );
}

function entityIdToString(entity) {
    if (!entity) return "";
    // entity may be {id: 'uuid', entityType: 'DEVICE'} or {id: {id:'uuid'}, entityType:'DEVICE'}
    const raw = entity.id;
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && raw.id) return String(raw.id);
    return String(raw);
}

function normalizeEntityRef(entity) {
    if (!entity) return null;

    // If already looks like a TB entityId object
    if (entity.entityType && entity.id !== undefined) {
        const idStr = entityIdToString(entity);
        return { id: idStr, entityType: entity.entityType };
    }

    // Some contexts provide entityId object directly: {id:'uuid', entityType:'DEVICE'}
    if (entity.id && entity.entityType) {
        return { id: String(entity.id), entityType: entity.entityType };
    }

    // If given raw UUID string
    if (typeof entity === 'string') {
        return { id: entity, entityType: 'DEVICE' };
    }

    // Fallback best-effort
    try {
        const idStr = entityIdToString(entity);
        const type = entity.entityType || entity.type || 'DEVICE';
        return { id: idStr, entityType: type };
    } catch (e) {
        return null;
    }
}

function getEntityIdByDeviceName(deviceName) {
    if (!deviceName || !self.ctx || !Array.isArray(self.ctx.datasources)) return null;
    const wanted = normalizeKey(deviceName);

    for (const ds of self.ctx.datasources) {
        if (!ds) continue;
        const name = ds.entityName || ds.name || ds.label;
        if (name && normalizeKey(name) === wanted && ds.entityId) {
            // ds.entityId might already be {id:'uuid', entityType:'DEVICE'}
            const type = ds.entityType || ds.entityId.entityType || "DEVICE";
            const idStr = (typeof ds.entityId === 'string') ? ds.entityId : (ds.entityId.id || ds.entityId);
            return normalizeEntityRef({ id: idStr, entityType: type });
        }
    }

    return null;
}

function extractTelemetryFromServiceResponse(res, key) {
    if (res === null || res === undefined) return null;

    // Common TB shapes:
    // 1) { key1: [{ts:..., value:...}], key2: [...] }
    // 2) [{key:'k', value:...}] or [{key:'k', ts:..., value:...}]
    // 3) [{ts:..., value:...}] (single key)
    try {
        if (typeof res === 'object' && !Array.isArray(res)) {
            if (res[key] !== undefined) {
                return extractLatestValue(res[key]);
            }
            const wanted = normalizeKey(key);
            for (const k of Object.keys(res)) {
                if (normalizeKey(k) === wanted) {
                    return extractLatestValue(res[k]);
                }
            }
        }

        if (Array.isArray(res)) {
            // If array of kv
            const wanted = normalizeKey(key);
            for (let i = res.length - 1; i >= 0; i--) {
                const it = res[i];
                if (it && typeof it === 'object') {
                    if (it.key !== undefined && normalizeKey(it.key) === wanted) {
                        if (it.value !== undefined) return it.value;
                        if (it.val !== undefined) return it.val;
                        if (it.data !== undefined) return extractLatestValue(it.data);
                    }
                }
            }
            // Or array of datapoints
            return extractLatestValue(res);
        }
    } catch (e) {
        // ignore
    }

    return extractLatestValue(res);
}

function normalizeKey(k) {
    if (k === null || k === undefined) return "";
    return String(k).trim().toLowerCase();
}

// Removed unused helpers: collectTelemetrySeriesArrays, getSeriesKeyCandidates

function extractLatestValue(value) {
    // latestData/deviceData có thể chứa primitive, object {value}, array series...
    if (value === null || value === undefined) return null;
    if (Array.isArray(value)) return extractValue(value);
    if (typeof value === 'object') {
        if (value.value !== undefined) return value.value;
        if (value.val !== undefined) return value.val;
        // Some TB uses {ts:..., value:...}
        if (value.ts !== undefined && value.value !== undefined) return value.value;
    }
    return value;
}

/**
 * Lấy giá trị cuối cùng từ mảng data
 */
function extractValue(data) {
    if (!data || !Array.isArray(data) || data.length === 0) {
        return null;
    }

    // ThingsBoard đôi khi trả về datapoint mới nhất là null/undefined.
    // Vì vậy ưu tiên lấy "giá trị hợp lệ cuối cùng" (scan ngược).
    for (let i = data.length - 1; i >= 0; i--) {
        const item = data[i];

        // Format: [timestamp, value]
        if (Array.isArray(item) && item.length >= 2) {
            const v = item[1];
            if (v !== null && v !== undefined) return v;
            continue;
        }

        // Format: {value: ...} hoặc {ts:..., value:...}
        if (typeof item === 'object' && item !== null) {
            if (item.value !== undefined && item.value !== null) return item.value;
            if (item.val !== undefined && item.val !== null) return item.val;
            if (item.data && Array.isArray(item.data)) {
                const nested = extractValue(item.data);
                if (nested !== null && nested !== undefined) return nested;
            }
            continue;
        }

        // Primitive
        if (item !== null && item !== undefined) return item;
    }

    return null;
}

/**
 * Tìm kiếm key trong toàn bộ context
 */
// Removed: searchInContext (unused in simplified telemetry lookup)

/**
 * Lấy danh sách tất cả keys có sẵn (để debug)
 */
// Removed: getAvailableKeys (used only by debug/logging helpers)


/* ================= CORE: SHARED ATTRIBUTE (FIXED) ================= */

function getEntityId() {
    if (!self.ctx || !self.ctx.datasources || !self.ctx.datasources.length) { return null; }

    const ds = self.ctx.datasources[0];

    if (!ds.entityId) { return null; }

    const type = ds.entityType || ds.entityId.entityType || "DEVICE";
    const idStr = (typeof ds.entityId === 'string') ? ds.entityId : (ds.entityId.id || ds.entityId);
    return normalizeEntityRef({ id: idStr, entityType: type });
}

function getSharedAttr(key, callback) {
    const entityId = getEntityId();
    if (!entityId) { callback(null); return; }

    if (!self.ctx.attributeService) { callback(null); return; }

    self.ctx.attributeService
        .getEntityAttributes(entityId, "SHARED_SCOPE", [key])
        .subscribe(
            res => { if (res && res.length > 0 && res[0].value !== undefined) { callback(res[0].value); } else { callback(null); } },
            err => { callback(null); }
        );
}


/* ================= SVG UPDATE ================= */

/**
 * Cập nhật text trong SVG
 */
function updateText(svgId, value) {
    if (!svgId) return;

    const el = document.getElementById(svgId);
    if (!el) { return; }

    const txt = (value !== null && value !== undefined) ? String(value) : "--";

    // Căn giữa text
    el.setAttribute("text-anchor", "middle");
    
    const tspan = el.querySelector("tspan");
    if (tspan) {
        tspan.textContent = txt;
    } else {
        el.textContent = txt;
    }
}

/**
 * Áp dụng style status (color + glow) vào SVG element
 */
function applyStatusToSvg(svgId, key, deviceName) {
    if (!svgId || !key) return;

    const val = getTelemetryValue(key, deviceName);
    
    if (val !== null && val !== undefined) {
        logTelemetryValue(key, val, "(from cache)");
        const running = toBooleanStatus(val);
        
        const color = running ? "lime" : "red";
        const glow = running
            ? "drop-shadow(0 0 8px lime)"
            : "drop-shadow(0 0 10px red)";

        const styleId = "style-" + svgId;
        let styleTag = document.getElementById(styleId);

        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = styleId;
            document.head.appendChild(styleTag);
        }

        styleTag.innerHTML = `
            #${svgId} path,
            #${svgId} circle,
            #${svgId} rect,
            #${svgId} line,
            #${svgId} polygon {
                stroke: ${color} !important;
                stroke-width: 2px !important;
                transition: stroke 0.3s ease, filter 0.3s ease;
            }

            #${svgId} {
                filter: ${glow};
            }
        `;
    } else {
        // Fallback: gọi API lấy telemetry latest
        getTelemetryLatestForDevice(deviceName, key, v => {
            if (v !== null && v !== undefined) {
                logTelemetryValue(key, v, deviceName ? `(API/service, device=${deviceName})` : "(API/service)");
                const running = toBooleanStatus(v);
                
                const color = running ? "lime" : "red";
                const glow = running
                    ? "drop-shadow(0 0 8px lime)"
                    : "drop-shadow(0 0 10px red)";

                const styleId = "style-" + svgId;
                let styleTag = document.getElementById(styleId);

                if (!styleTag) {
                    styleTag = document.createElement("style");
                    styleTag.id = styleId;
                    document.head.appendChild(styleTag);
                }

                styleTag.innerHTML = `
                    #${svgId} path,
                    #${svgId} circle,
                    #${svgId} rect,
                    #${svgId} line,
                    #${svgId} polygon {
                        stroke: ${color} !important;
                        stroke-width: 2px !important;
                        transition: stroke 0.3s ease, filter 0.3s ease;
                    }

                    #${svgId} {
                        filter: ${glow};
                    }
                `;
            }
        });
    }
}


/* ================= VALUE CONVERSION ================= */

/**
 * Convert giá trị thô thành boolean status
 */
function toBooleanStatus(value) {
    if (value === null || value === undefined) return false;

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        // Check for boolean strings first
        if (lower === "true" || lower === "on" || lower === "yes") return true;
        if (lower === "false" || lower === "off" || lower === "no") return false;
        
        // Try to parse as number
        const num = parseFloat(lower);
        if (!isNaN(num)) {
            return num !== 0;
        }
        
        // Default for non-empty strings
        return lower.length > 0;
    }

    return false;
}



/* ================= UPDATE ICON ================= */

function updateIcon(item) {
    if (!item || !item.key || !item.svg) return;

    if (item.source === "telemetry") {
        const deviceName = item.deviceName || item.device;

        applyStatusToSvg(item.svg, item.key, deviceName);
    }
    else if (item.source === "shared") {
        getSharedAttr(item.key, val => {
            logAttributeValue(item.key, val, "(shared)");
            const running = toBooleanStatus(val);
            
            const color = running ? "lime" : "red";
            const glow = running
                ? "drop-shadow(0 0 8px lime)"
                : "drop-shadow(0 0 10px red)";

            const styleId = "style-" + item.svg;
            let styleTag = document.getElementById(styleId);

            if (!styleTag) {
                styleTag = document.createElement("style");
                styleTag.id = styleId;
                document.head.appendChild(styleTag);
            }

            styleTag.innerHTML = `
                #${item.svg} path,
                #${item.svg} circle,
                #${item.svg} rect,
                #${item.svg} line,
                #${item.svg} polygon {
                    stroke: ${color} !important;
                    stroke-width: 2px !important;
                    transition: stroke 0.3s ease, filter 0.3s ease;
                }

                #${item.svg} {
                    filter: ${glow};
                }
            `;
        });
    }
}


/* ================= UPDATE SHARED ATTRIBUTES ================= */

function updateSharedAttributes() {
    if (!svgReady) return;

    MAP_ICON.forEach(item => {
        if (item.source === "shared") { updateIcon(item); }
    });
}

/* ================= CỘNG KEY TELEMETRY ================= */
/* ================= SAVE TELEMETRY ================= */

/**
 * Ghi giá trị telemetry vào thiết bị
 */
function saveTelemetryToDevice(deviceName, telemetryData, onSuccess, onError) {
    const entity = getEntityIdByDeviceName(deviceName);
    if (!entity) {
        console.error(`❌ Không tìm thấy thiết bị: ${deviceName}`);
        if (onError) onError(new Error('Device not found'));
        return;
    }

    const entityType = entity.entityType || 'DEVICE';
    const entityId = entityIdToString(entity);
    
    // API endpoint để ghi telemetry
    const url = `/api/plugins/telemetry/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}/timeseries/ANY`;

    // Chuẩn bị payload
    const payload = telemetryData;

    console.log(`💾 Saving telemetry to ${deviceName}:`, payload);

    // Sử dụng Angular HttpClient nếu có
    const http = self.ctx && (self.ctx.http || self.ctx.httpClient);
    if (http && typeof http.post === 'function') {
        try {
            const obs = http.post(url, payload);
            if (obs && typeof obs.subscribe === 'function') {
                obs.subscribe(
                    res => {
                        console.log(`✅ Telemetry saved successfully:`, res);
                        if (onSuccess) onSuccess(res);
                    },
                    err => {
                        console.error(`❌ Error saving telemetry:`, err);
                        if (onError) onError(err);
                    }
                );
                return;
            }
        } catch (e) {
            console.error('❌ HttpClient error:', e);
        }
    }

    // Fallback: dùng fetch API
    const headers = {
        'Content-Type': 'application/json'
    };
    const token = tryGetTbJwtToken();
    if (token) headers['X-Authorization'] = `Bearer ${token}`;

    fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
    })
    .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json().catch(() => ({}));
    })
    .then(res => {
        console.log(`✅ Telemetry saved successfully:`, res);
        if (onSuccess) onSuccess(res);
    })
    .catch(err => {
        console.error(`❌ Error saving telemetry:`, err);
        if (onError) onError(err);
    });
}

function updateCombinedTelemetry(inputKeys, targetSvgId, outputKey, deviceName, formatFn) {
    let total = 0;
    let keysFound = 0;

    inputKeys.forEach(key => {
        const val = getTelemetryValue(key, deviceName);
        if (val !== null && val !== undefined) {
            total += Number(val);
            keysFound++;
        }
    });

    // Nếu tất cả các key đều có trong cache, cập nhật ngay
    if (keysFound === inputKeys.length) {
        const formatted = formatFn ? formatFn(total) : total;
        updateText(targetSvgId, formatted);
        
        // 🔥 SAVE VÀO TELEMETRY
        if (outputKey && deviceName) {
            const telemetryPayload = {};
            telemetryPayload[outputKey] = Number(total);
            
            saveTelemetryToDevice(deviceName, telemetryPayload, 
                () => console.log(`✅ Saved ${outputKey} = ${total}`),
                (err) => console.error(`❌ Failed to save ${outputKey}:`, err)
            );
        }
    } else {
        // Nếu thiếu dữ liệu trong cache, gọi API lấy thủ công (Fallback)
        let fetchedValues = {};
        inputKeys.forEach(key => {
            getTelemetryLatestForDevice(deviceName, key, v => {
                fetchedValues[key] = Number(v || 0);
                if (Object.keys(fetchedValues).length === inputKeys.length) {
                    const sum = Object.values(fetchedValues).reduce((a, b) => a + b, 0);
                    const formatted = formatFn ? formatFn(sum) : sum;
                    updateText(targetSvgId, formatted);
                    
                    // 🔥 SAVE VÀO TELEMETRY
                    if (outputKey && deviceName) {
                        const telemetryPayload = {};
                        telemetryPayload[outputKey] = Number(sum);
                        
                        saveTelemetryToDevice(deviceName, telemetryPayload,
                            () => console.log(`✅ Saved ${outputKey} = ${sum}`),
                            (err) => console.error(`❌ Failed to save ${outputKey}:`, err)
                        );
                    }
                }
            });
        });
    }
}

/* ================= MAIN UPDATE ================= */

self.onDataUpdated = function () {
    if (!svgReady) return;

    const now = Date.now();
    if (now - lastUpdateTime < 10000) return;  // Debounce 1s để tránh call quá nhiều
    lastUpdateTime = now;
    MAP_ICON.forEach((item, i) => {
        if (item.source === "telemetry") { updateIcon(item); }
    });
    MAP_TEXT.forEach((item, i) => {
        if (!item || !item.key) return;

        const deviceName = item.deviceName || item.device;
        const val = getTelemetryValue(item.key, deviceName);
        if (val !== null && val !== undefined) {
            logTelemetryValue(item.key, val, "(from cache)");
            const formatted = item.format ? item.format(val) : val;
            updateText(item.svg, formatted);
        } else {
            // Fallback: gọi service/REST lấy telemetry latest theo device (nếu có)
            getTelemetryLatestForDevice(deviceName, item.key, v => {
                if (v !== null && v !== undefined) {
                    logTelemetryValue(item.key, v, deviceName ? `(API/service, device=${deviceName})` : "(API/service)");
                    const formatted = item.format ? item.format(v) : v;
                    updateText(item.svg, formatted);
                } else {
                    updateText(item.svg, "--");
                }
            });
        }
    });
    
    updateCombinedTelemetry(
        ["c1_nt_total1", "c1_nt_total2"], // Các key đầu vào
        "c1_nt_total",               // ID SVG kết quả
        "c1_nt_total",               // Output key
        "CTW_TAG",                       // Tên thiết bị
        v => Number(v).toFixed(0)        // Hàm format (làm tròn số)
    );
    updateCombinedTelemetry(
        ["c2_nt_total1", "c2_nt_total2"], // Các key đầu vào
        "c2_nt_total",               // ID SVG kết quả
        "c2_nt_total",               // Output key
        "CTW_TAG",                       // Tên thiết bị
        v => Number(v).toFixed(0)        // Hàm format (làm tròn số)
    );
};


