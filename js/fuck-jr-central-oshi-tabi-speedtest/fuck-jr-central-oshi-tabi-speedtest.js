// ==UserScript==
// @name         fuck-jr-central-oshi-tabi-speedtest
// @namespace    https://recommend.jr-central.co.jp/oshi-tabi/
// @version      1.0
// @description  去他妈的JR东海/东日本 推し旅 活动测速（沿新干线轨迹模拟，支持方向判定）
// @author       Stardream
// @match        https://oshi-tabi.voistock.com/*
// @match        https://recommend.jr-central.co.jp/oshi-tabi/*
// @grant        none
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // ===== 夜间测试开关 =====
    // 测速接口在深夜会关闭（503 / available_from 05:55 JST）。
    // 页面内联脚本会在 devMode 下设置 window.NIGHT_BYPASS_TOKEN 以绕开夜间窗口。
    // 本脚本 @run-at document-start 先于该内联脚本执行，所以这里提前置位即可生效。
    // 注意：这只是绕开“营业时间”，且 token 由 JR 维护，随时可能失效；白天测试无需此项。
    const ENABLE_NIGHT_BYPASS = true;
    if (ENABLE_NIGHT_BYPASS) {
        try {
            if (localStorage.getItem('devMode') !== '1') {
                localStorage.setItem('devMode', '1');
            }
        } catch (e) { /* localStorage 不可用时忽略 */ }
    }

    // ===== 可配置项 =====
    // 模拟速度，单位 km/h（活动页要求落在 150-360 之间）
    const SPEED_KMH = 250;
    // 成功回调的采样间隔（毫秒）
    const SAMPLE_INTERVAL_MS = 1000;
    // GPS 精度（米）
    const ACCURACY_M = 10;
    // 默认行进方向：'towards' = 名古屋行き（驶向名古屋），'away' = 名古屋帰り（驶离名古屋）
    let DIRECTION = 'towards';

    const SPEED_MPS = (SPEED_KMH * 1000) / 3600;

    // ===== 东海道新干线 东京→名古屋 主要途经点（名古屋为终点）=====
    // 沿真实线路排列，保证“驶向名古屋”时到名古屋的距离单调递减。
    const ROUTE_TO_NAGOYA = [
        { lat: 35.681236, lon: 139.767125 }, // 東京
        { lat: 35.628471, lon: 139.738760 }, // 品川
        { lat: 35.507871, lon: 139.617495 }, // 新横浜
        { lat: 35.256293, lon: 139.155720 }, // 小田原
        { lat: 35.103156, lon: 139.078000 }, // 熱海
        { lat: 35.126363, lon: 138.911040 }, // 三島
        { lat: 35.142395, lon: 138.663320 }, // 新富士
        { lat: 34.971401, lon: 138.389500 }, // 静岡
        { lat: 34.838074, lon: 138.130700 }, // 掛川付近
        { lat: 34.703608, lon: 137.734900 }, // 浜松
        { lat: 34.762960, lon: 137.381900 }, // 豊橋
        { lat: 34.962145, lon: 137.081050 }, // 三河安城
        { lat: 35.170993, lon: 136.881557 }  // 名古屋（目标点）
    ];

    // ===== 几何工具 =====
    const R = 6371000; // 地球半径（米）
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;

    function haversine(a, b) {
        const dLat = toRad(b.lat - a.lat);
        const dLon = toRad(b.lon - a.lon);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const h =
            Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(h));
    }

    // 计算从 a 指向 b 的方位角（0-360，正北为0，顺时针）
    function bearing(a, b) {
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const dLon = toRad(b.lon - a.lon);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x =
            Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    // 在两点之间按比例 t 线性插值（短距离下足够精确）
    function lerp(a, b, t) {
        return {
            lat: a.lat + (b.lat - a.lat) * t,
            lon: a.lon + (b.lon - a.lon) * t
        };
    }

    // ===== 预计算某方向路线的累计距离 =====
    function buildRoute(points) {
        const cum = [0];
        for (let i = 1; i < points.length; i++) {
            cum.push(cum[i - 1] + haversine(points[i - 1], points[i]));
        }
        return { points, cum, total: cum[cum.length - 1] };
    }

    const routeTowards = buildRoute(ROUTE_TO_NAGOYA);
    const routeAway = buildRoute([...ROUTE_TO_NAGOYA].reverse());

    function activeRoute() {
        return DIRECTION === 'away' ? routeAway : routeTowards;
    }

    // 给定沿路线已行驶的距离（米），返回当前坐标与航向
    function pointAtDistance(route, dist) {
        const { points, cum, total } = route;
        const d = Math.max(0, Math.min(dist, total));
        let i = 0;
        while (i < cum.length - 2 && cum[i + 1] < d) i++;
        const segLen = cum[i + 1] - cum[i] || 1;
        const t = (d - cum[i]) / segLen;
        const pos = lerp(points[i], points[i + 1], t);
        const head = bearing(points[i], points[i + 1]);
        return { pos, head };
    }

    // ===== 轨迹状态 =====
    let startTime = null; // 本次测速的起始时间戳

    function ensureStarted() {
        if (startTime === null) startTime = Date.now();
    }

    function currentCoords() {
        ensureStarted();
        const elapsedSec = (Date.now() - startTime) / 1000;
        const traveled = elapsedSec * SPEED_MPS;
        const { pos, head } = pointAtDistance(activeRoute(), traveled);
        return {
            latitude: pos.lat,
            longitude: pos.lon,
            accuracy: ACCURACY_M,
            altitude: null,
            altitudeAccuracy: null,
            heading: head,
            speed: SPEED_MPS // 单位 m/s
        };
    }

    function createPosition() {
        return {
            coords: currentCoords(),
            timestamp: Date.now()
        };
    }

    // ===== 覆写 geolocation API =====
    const geo = navigator.geolocation;

    geo.watchPosition = function (success, error, options) {
        // 每次开始监听都重置轨迹，从线路起点出发
        startTime = Date.now();
        if (typeof success === 'function') success(createPosition());
        const id = setInterval(() => {
            if (typeof success === 'function') success(createPosition());
        }, SAMPLE_INTERVAL_MS);
        return id;
    };

    geo.clearWatch = function (watchId) {
        clearInterval(watchId);
    };

    geo.getCurrentPosition = function (success, error, options) {
        if (typeof success === 'function') success(createPosition());
    };

    // ===== 方向选择悬浮面板 =====
    function injectPanel() {
        if (document.getElementById('fjct-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'fjct-panel';
        panel.style.cssText = [
            'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
            'background:rgba(20,20,28,0.92)', 'color:#fff', 'font:12px/1.5 sans-serif',
            'padding:10px 12px', 'border-radius:10px', 'box-shadow:0 4px 16px rgba(0,0,0,.4)',
            'min-width:150px'
        ].join(';');
        panel.innerHTML =
            '<div style="font-weight:700;margin-bottom:6px">推し旅 测速模拟</div>' +
            '<label style="display:block;margin:2px 0;cursor:pointer">' +
            '<input type="radio" name="fjct-dir" value="towards" checked> 名古屋行き（去）</label>' +
            '<label style="display:block;margin:2px 0;cursor:pointer">' +
            '<input type="radio" name="fjct-dir" value="away"> 名古屋帰り（回）</label>' +
            '<div id="fjct-status" style="margin-top:6px;opacity:.75"></div>';
        const mount = () => {
            (document.body || document.documentElement).appendChild(panel);
            panel.querySelectorAll('input[name="fjct-dir"]').forEach((r) => {
                r.addEventListener('change', (e) => {
                    DIRECTION = e.target.value;
                    startTime = Date.now(); // 切换方向后重新出发
                    updateStatus();
                });
            });
            updateStatus();
        };
        if (document.body) mount();
        else document.addEventListener('DOMContentLoaded', mount);
    }

    function updateStatus() {
        const el = document.getElementById('fjct-status');
        if (!el) return;
        const dir = DIRECTION === 'away' ? '驶离名古屋' : '驶向名古屋';
        el.textContent = `${dir} · ${SPEED_KMH}km/h`;
    }

    injectPanel();
})();
