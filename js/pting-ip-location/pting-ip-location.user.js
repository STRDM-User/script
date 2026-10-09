// ==UserScript==
// @name         蜂巢 - 帖子/回复显示 IP 属地
// @namespace    https://fengchao.chat/
// @version      1.0.2
// @description  在帖子、回复及头像悬浮资料卡中显示用户资料页已公开的 IP 属地。
// @author       Stardream
// @match        https://fengchao.chat/*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(() => {
  'use strict';

  const CACHE_KEY = 'pting-ip-location-cache-v2';
  const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
  const cache = new Map();
  const pending = new Map();
  const unavailable = new Set();
  const badgeByTarget = new WeakMap();
  let scanTimer;

  try {
    const stored = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');

    for (const [username, item] of Object.entries(stored)) {
      if (item && item.location && Date.now() - item.updatedAt < CACHE_TTL) {
        cache.set(username, item);
      }
    }
  } catch {}

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(cache)));
    } catch {}
  }

  function getUsername(link) {
    try {
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return null;

      const match = url.pathname.match(/^\/users\/([^/?#]+)\/?$/);
      return match ? decodeURIComponent(match[1]) : null;
    } catch {
      return null;
    }
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

  function isUserSearch() {
    return location.pathname === '/search' &&
      new URLSearchParams(location.search).get('type') === 'users';
  }

  function getSearchUsernameElement(link, username) {
    if (!isUserSearch()) return null;

    return [...link.querySelectorAll('p')].find(
      element => element.textContent.trim() === '@' + username
    ) || null;
  }

  function extractLocation(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 只在“加入日期”所在的资料信息行中匹配，避免误读简介或帖子内容。
    const joined = [...doc.querySelectorAll('body *')].find(
      el => el.children.length === 0 &&
        (el.textContent || '').trim().endsWith('加入')
    );

    if (!joined?.parentElement) return null;

    const locationRow = [...joined.parentElement.children].find(
      el => /^IP\s*属地\s*[：:]\s*.+$/.test((el.textContent || '').trim())
    );

    const match = locationRow?.textContent.trim()
      .match(/^IP\s*属地\s*[：:]\s*(.+)$/);

    return match?.[1].trim() || null;
  }

  function fetchLocation(username) {
    const cached = cache.get(username);
    if (cached) return Promise.resolve(cached.location);
    if (pending.has(username)) return pending.get(username);

    const task = fetch('/users/' + encodeURIComponent(username), {
      credentials: 'same-origin'
    })
      .then(response => response.ok ? response.text() : '')
      .then(extractLocation)
      .catch(() => null)
      .then(locationName => {
        pending.delete(username);

        if (locationName) {
          cache.set(username, {
            location: locationName,
            updatedAt: Date.now()
          });
          saveCache();
        } else {
          unavailable.add(username);
        }

        return locationName;
      });

    pending.set(username, task);
    return task;
  }

  function appendBadge(target, username) {
    const knownBadge = badgeByTarget.get(target);
    if (knownBadge?.isConnected) return;

    const usernameElement = getSearchUsernameElement(target, username);

    // 用户搜索结果的卡片本身是网格项目，只允许插到 @username 行内。
    if (isUserSearch() && !usernameElement) return;

    if (usernameElement) {
      const existingBadge = [...usernameElement.children].find(
        element =>
          element.classList.contains('tm-pting-ip-location') &&
          element.dataset.username === username
      );

      if (existingBadge) {
        badgeByTarget.set(target, existingBadge);
        return;
      }
    }

    const next = target.nextElementSibling;

    if (
      !usernameElement &&
      next &&
      next.classList.contains('tm-pting-ip-location') &&
      next.dataset.username === username
    ) {
      badgeByTarget.set(target, next);
      return;
    }

    const badge = document.createElement('span');
    badge.className = 'tm-pting-ip-location';
    badge.dataset.username = username;
    badge.textContent = 'IP · …';
    badge.title = 'IP 属地';

    badgeByTarget.set(target, badge);

    if (usernameElement) {
      usernameElement.append(badge);
    } else {
      target.insertAdjacentElement('afterend', badge);
    }

    fetchLocation(username).then(locationName => {
      if (!badge.isConnected) return;

      if (locationName) {
        badge.textContent = 'IP · ' + locationName;
      } else {
        badgeByTarget.delete(target);
        badge.remove();
      }
    });
  }

  function scan() {
    // 个人资料页已经原生显示 IP 属地。
    if (location.pathname.startsWith('/users/')) return;

    if (isUserSearch()) {
      // 清理旧版错误插入到用户搜索网格同级的徽标。
      for (const badge of document.querySelectorAll('.tm-pting-ip-location')) {
        const parent = badge.parentElement;

        if (
          parent?.classList.contains('grid') &&
          parent.querySelector(':scope > a[href^="/users/"]')
        ) {
          badge.remove();
        }
      }
    }

    for (const link of document.querySelectorAll('a[href]')) {
      const username = getUsername(link);

      if (username && isPrimaryProfileLink(link) && !unavailable.has(username)) {
        appendBadge(link, username);
      }
    }

    // “作者复言”等条目可能只有资料卡按钮、没有用户链接。
    for (const button of document.querySelectorAll('[data-user-profile-preview-trigger]')) {
      if (!button.textContent.trim() || hasNearbyUserLink(button)) continue;

      const username = getProfileButtonUsername(button);

      if (username && !unavailable.has(username)) {
        appendBadge(button, username);
      }
    }
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 120);
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