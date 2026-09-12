// ==UserScript==
// @name         蜂巢 - 帖子/回复显示 IP 属地
// @namespace    https://pting.club/
// @version      1.0.0
// @description  在帖子、回复及头像悬浮资料卡中显示用户资料页已公开的 IP 属地。
// @author       Stardream
// @match        https://pting.club/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';
  const CACHE_KEY = 'pting-ip-location-cache-v1';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const cache = new Map();
  const pending = new Map();
  const unavailable = new Set();
  let scanTimer;

  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    for (const [username, item] of Object.entries(stored)) {
      if (item && item.location && Date.now() - item.updatedAt < CACHE_TTL) cache.set(username, item);
    }
  } catch {}

  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache))); } catch {}
  }

  function getUsername(link) {
    try {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return null;
      const match = url.pathname.match(/^\/users\/([^/?#]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch { return null; }
  }

  function getProfileButtonUsername(button) {
    const label = button.getAttribute('aria-label') || '';
    const match = label.match(/^查看\s+(.+?)\s+的资料卡$/);
    return match ? match[1].trim() : null;
  }

  function hasNearbyUserLink(button) {
    const parent = button.parentElement;
    return !!parent && [...parent.querySelectorAll('a[href]')].some(getUsername);
  }

  function isPrimaryProfileLink(link) {
    const card = link.closest('[data-slot="popover-content"]');
    if (!card) return true;
    const firstUserLink = [...card.querySelectorAll('a[href]')].find(getUsername);
    return link === firstUserLink;
  }

  function extractLocation(html) {
    // IP 属地位于个人页“加入”文字之后的同一资料行。
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const joined = [...doc.querySelectorAll('body *')].find(
      el => el.children.length === 0 && (el.textContent || '').trim().endsWith('加入')
    );
    if (!joined) return null;

    // “加入”和城市不一定处于同一个最小元素内；向上寻找资料行，
    // 再取“加入”之后最近的纯中文叶子节点（例如“北京”）。
    for (let scope = joined.parentElement; scope; scope = scope.parentElement) {
      const leaves = [...scope.querySelectorAll('*')]
        .filter(el => el.children.length === 0);
      const index = leaves.indexOf(joined);
      if (index < 0) continue;
      const locationName = leaves
        .slice(index + 1, index + 5)
        .map(el => (el.textContent || '').trim())
        .find(text => /^[\u4e00-\u9fff]{2,12}$/.test(text));
      if (locationName) return locationName;
    }
    return null;
  }

  function fetchLocation(username) {
    const cached = cache.get(username);
    if (cached) return Promise.resolve(cached.location);
    if (pending.has(username)) return pending.get(username);
    const task = fetch('/users/' + encodeURIComponent(username), { credentials: 'same-origin' })
      .then(response => response.ok ? response.text() : '')
      .then(extractLocation)
      .catch(() => null)
      .then(locationName => {
        pending.delete(username);
        if (locationName) {
          cache.set(username, { location: locationName, updatedAt: Date.now() });
          saveCache();
        } else unavailable.add(username);
        return locationName;
      });
    pending.set(username, task);
    return task;
  }

  function appendBadge(link, username) {
    const next = link.nextElementSibling;
    if (next && next.classList.contains('tm-pting-ip-location') &&
        next.dataset.username === username) return;
    const badge = document.createElement('span');
    badge.className = 'tm-pting-ip-location';
    badge.dataset.username = username;
    badge.textContent = 'IP · …';
    badge.title = 'IP 属地';
    link.insertAdjacentElement('afterend', badge);
    fetchLocation(username).then(locationName => {
      if (!badge.isConnected) return;
      if (locationName) badge.textContent = 'IP · ' + locationName;
      else badge.remove();
    });
  }

  function scan() {
    // 个人页原生显示属地，因此不重复插入。
    if (location.pathname.startsWith('/users/')) return;
    for (const link of document.querySelectorAll('a[href]')) {
      const username = getUsername(link);
      if (username && isPrimaryProfileLink(link) && !unavailable.has(username)) {
        appendBadge(link, username);
      }
    }

    // “作者复言”等条目只提供资料卡按钮，没有用户链接。
    for (const button of document.querySelectorAll('[data-user-profile-preview-trigger]')) {
      if (!button.textContent.trim() || hasNearbyUserLink(button)) continue;
      const username = getProfileButtonUsername(button);
      if (username && !unavailable.has(username)) appendBadge(button, username);
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => scan(), 120);
  }

  const style = document.createElement('style');
  style.textContent = [
    '.tm-pting-ip-location {',
    'display:inline-flex;align-items:center;vertical-align:middle;',
    'margin-left:.35em;padding:.08em .42em;',
    'border:1px solid color-mix(in srgb,currentColor 22%,transparent);',
    'border-radius:999px;color:inherit;font-size:.78em;line-height:1.35;',
    'opacity:.7;pointer-events:none;white-space:nowrap;',
    '}',
    '.tm-pting-ip-location:hover { opacity:1; }'
  ].join('');
  document.documentElement.append(style);
  scan();
  new MutationObserver(scheduleScan).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
