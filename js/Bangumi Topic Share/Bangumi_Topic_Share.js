// ==UserScript==
// @name         Bangumi Topic Share
// @namespace    http://tampermonkey.net/
// @version      6.2
// @description  Bangumi 分享工具：生成分享卡片，支持图片复制/下载、一键复制分享文案、可选 AI 标签
// @author       Stardream
// @contributor  Chang ji, Mewtw0
// @match        *://bgm.tv/group/topic/*
// @match        *://bangumi.tv/group/topic/*
// @match        *://chii.in/group/topic/*
// @match        *://bgm.tv/blog/*
// @match        *://bangumi.tv/blog/*
// @match        *://chii.in/blog/*
// @match        *://bgm.tv/ep/*
// @match        *://bangumi.tv/ep/*
// @match        *://chii.in/ep/*
// @match        *://bgm.tv/character/*
// @match        *://bangumi.tv/character/*
// @match        *://chii.in/character/*
// @match        *://bgm.tv/person/*
// @match        *://bangumi.tv/person/*
// @match        *://chii.in/person/*
// @match        *://bgm.tv/subject/*
// @match        *://bangumi.tv/subject/*
// @match        *://chii.in/subject/*
// @match        *://bgm.tv/rakuen*
// @match        *://bangumi.tv/rakuen*
// @match        *://chii.in/rakuen*
// @match        *://bgm.tv/anime/list/*
// @match        *://bangumi.tv/anime/list/*
// @match        *://chii.in/anime/list/*
// @match        *://bgm.tv/music/list/*
// @match        *://bangumi.tv/music/list/*
// @match        *://chii.in/music/list/*
// @match        *://bgm.tv/game/list/*
// @match        *://bangumi.tv/game/list/*
// @match        *://chii.in/game/list/*
// @match        *://bgm.tv/real/list/*
// @match        *://bangumi.tv/real/list/*
// @match        *://chii.in/real/list/*
// @match        *://bgm.tv/book/list/*
// @match        *://bangumi.tv/book/list/*
// @match        *://chii.in/book/list/*
// @match        *://bgm.tv/user/*/timeline/status/*
// @match        *://bangumi.tv/user/*/timeline/status/*
// @match        *://chii.in/user/*/timeline/status/*
// @match        *://bgm.tv/user/*/timeline
// @match        *://bangumi.tv/user/*/timeline
// @match        *://chii.in/user/*/timeline
// @match        *://bgm.tv/timeline
// @match        *://bangumi.tv/timeline
// @match        *://chii.in/timeline
// @match        *://bgm.tv/
// @match        *://bangumi.tv/
// @match        *://chii.in/
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const CARD_CONTENT_IMAGE_LIMIT = 3;


    // ================= Bangumi OAuth =================
    const BGM_CLIENT_ID = 'bgm600069e7caaa1d2ba';
    const BGM_REDIRECT_URI = 'https://bgm.tv/rakuen';
    const BGM_TOKEN_PROXY = 'https://bgm-topic-share.stdm.workers.dev';
    const getBgmToken = () => GM_getValue('bgm_share_token', '');
    const setBgmToken = t => GM_setValue('bgm_share_token', t);
    const clearBgmToken = () => {
        GM_setValue('bgm_share_token', '');
        GM_setValue('bgm_share_refresh_token', '');
        GM_setValue('bgm_share_token_expiry', 0);
    };
    function _refreshAuthStatusUI() {
        const statusEl = document.getElementById('bgm-share-auth-status');
        const authBtn = document.getElementById('bgm-share-auth-btn');
        const deauthBtn = document.getElementById('bgm-share-deauth-btn');
        if (!statusEl) return;
        const hasToken = !!getBgmToken();
        statusEl.textContent = hasToken ? '✓ 已授权，API 请求将携带 Token' : '未授权 - NSFW 条目数据将降级为 DOM 抓取';
        statusEl.style.color = hasToken ? '#4caf50' : '#aaa';
        if (authBtn) authBtn.style.display = hasToken ? 'none' : '';
        if (deauthBtn) deauthBtn.style.display = hasToken ? '' : 'none';
    }

    const startBgmOAuth = () => {
        const w = 600, h = 600;
        const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
        const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
        window.open(
            `https://bgm.tv/oauth/authorize?client_id=${BGM_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(BGM_REDIRECT_URI)}`,
            'bgm_oauth',
            `width=${w},height=${h},left=${left},top=${top},popup=1`
        );
        const onFocus = () => {
            window.removeEventListener('focus', onFocus);
            _refreshAuthStatusUI();
        };
        window.addEventListener('focus', onFocus);
    };
    GM_registerMenuCommand('Bangumi Topic Share 授权', startBgmOAuth);
    GM_registerMenuCommand('Bangumi Topic Share 清除授权', () => { clearBgmToken(); alert('已清除授权'); });

    function _saveBgmTokenResponse(data) {
        if (!data?.access_token) return false;
        setBgmToken(data.access_token);
        if (data.refresh_token) GM_setValue('bgm_share_refresh_token', data.refresh_token);
        if (data.expires_in) GM_setValue('bgm_share_token_expiry', Date.now() + data.expires_in * 1000);
        return true;
    }

    function _showOAuthToast(msg, ok = true) {
        const toast = document.createElement('div');
        toast.textContent = msg;
        toast.style.cssText = `position:fixed;top:20px;right:20px;background:${ok ? '#F09199' : '#888'};color:#fff;padding:10px 20px;border-radius:8px;font-size:14px;z-index:100002;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    function checkOAuthCallback() {
        if (window.location.pathname !== '/rakuen') return;
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        if (!code) return;
        history.replaceState(null, '', '/rakuen');
        GM_xmlhttpRequest({
            method: 'POST',
            url: BGM_TOKEN_PROXY,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
            }).toString(),
            onload: res => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (_saveBgmTokenResponse(data)) {
                        window.close();
                    } else {
                        _showOAuthToast('✗ 授权失败：' + (data.error_description || data.error || '未知错误'), false);
                    }
                } catch { _showOAuthToast('✗ 授权响应解析失败', false); }
            },
            onerror: () => _showOAuthToast('✗ 授权请求失败', false)
        });
    }

    function refreshBgmTokenIfNeeded() {
        const expiry = GM_getValue('bgm_share_token_expiry', 0);
        const refreshToken = GM_getValue('bgm_share_refresh_token', '');
        if (!refreshToken || !expiry) return;
        if (Date.now() < expiry - 86400000) return; // 超过剩余 1 天才刷新
        GM_xmlhttpRequest({
            method: 'POST',
            url: BGM_TOKEN_PROXY,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            data: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            }).toString(),
            onload: res => {
                try { _saveBgmTokenResponse(JSON.parse(res.responseText)); } catch {}
            }
        });
    }
    // =================================================

    const style = document.createElement('style');
    style.innerHTML = `
        #bgm-share-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); display: none; justify-content: center;
            align-items: flex-start; overflow-y: auto; z-index: 100000;
            box-sizing: border-box;
        }
        .share-card {
            width: 420px; background: #fff; border-radius: 20px; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
        }
        .card-top-bar { height: 6px; background: #F09199; }
        .card-header { padding: 25px 25px 15px; display: flex; align-items: center; gap: 15px; text-align: left; border-bottom: 1px solid #eee; }
        .avatar-img { width: 54px; height: 54px; border-radius: 12px; background: #eee; background-size: cover; background-position: center; border: 1px solid #f0f0f0; flex-shrink: 0; }
        .user-meta { text-align: left; }
        .user-meta .name { display: block; font-weight: bold; color: #F09199; font-size: 17px; line-height: 1.2; }
        .user-meta .time { font-size: 12px; color: #aaa; margin-top: 4px; display: block; }
        .card-body { padding: 15px 25px 25px; text-align: left; }
        .main-title { font-size: 20px; color: #111; margin: 0 0 15px 0; line-height: 1.5; font-weight: 800; }
        .topic-sub-title { font-size: 16px; color: #333; margin: 0 0 14px; font-weight: 700; line-height: 1.4; }
        .content-box { background: #fdfafb; padding: 18px; border-radius: 12px; border-left: 5px solid #F09199; }
        .content-text { font-size: 14px; color: #333; line-height: 1.8; margin: 0; word-break: break-all; font-kerning: none; }
        .tags-container { display: flex; flex-wrap: wrap; gap: 8px; }
        .share-card .tags-container { margin-top: 15px; }
        .tag-item { background: #FEEFF0; color: #F09199; font-size: 11px; padding: 4px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #F0919944; }
        .card-footer { background: #f9f9f9; padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #eee; }
        .qr-img { width: 55px; height: 55px; background: #fff; }
        #loading-info { position: fixed; top: 55%; left: 50%; transform: translateX(-50%); color: #fff; font-size: 14px; z-index: 100001; }
        .bgm-btn-row { display: flex; gap: 16px; margin: 20px auto 0; justify-content: center; }
        .bgm-action-btn {
            width: 48px; height: 48px; padding: 0;
            background: rgba(255,255,255,0.15); color: #fff;
            border: 1.5px solid rgba(255,255,255,0.35);
            border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;
            transition: background 0.2s, transform 0.15s, opacity 0.2s;
            position: relative;
        }
        .bgm-action-btn:hover:not(:disabled) { background: rgba(255,255,255,0.3); transform: scale(1.1); }
        .bgm-action-btn:disabled { opacity: 0.3; cursor: default; }
        .bgm-action-btn svg { display: block; }
        .bgm-action-btn::after {
            content: attr(data-tip);
            position: absolute;
            top: calc(100% + 10px);
            left: 50%;
            transform: translateX(-50%) translateY(-6px);
            background: rgba(20,20,20,0.82);
            color: #fff;
            font-size: 12px;
            padding: 5px 12px;
            border-radius: 8px;
            white-space: nowrap;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.18s ease, transform 0.18s ease;
        }
        .bgm-action-btn:hover:not(:disabled)::after {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }

        /* ===== 暗色主题 ===== */
        .share-card.dark { background: #1e1e1e; }
        .share-card.dark .card-header { border-bottom: 1px solid rgba(255,255,255,0.1); }
        .share-card.dark .card-body { background: #1e1e1e; padding-top: 15px; }
        .share-card.dark .main-title { color: #f0f0f0; }
        .share-card.dark .topic-sub-title { color: #e0e0e0; }
        .share-card.dark .content-box { background: #2a2a2a; border-left: 5px solid #F09199; }
        .share-card.dark .content-text { color: #ddd; }
        .share-card.dark .tags-container { margin-top: 15px; }
        .share-card.dark .tag-item { background: #2a2a2a; border: 1px solid #F0919966; }
        .share-card.dark .card-footer { background: #181818; border-top: 1px solid rgba(255,255,255,0.1); }
        .share-card.dark .qr-img { background: #2a2a2a; }
        .content-text img[data-bgm-emoji]:not(.smile-dynamic) { height: 1.5em; width: auto; vertical-align: baseline; }
        .content-text img.bmoji-image { display: inline; vertical-align: baseline; }
        .content-text img.smile-dynamic { display: inline !important; height: 3em !important; width: auto !important; vertical-align: baseline; }
        .content-text img:not([data-bgm-emoji]):not(.bmoji-image):not(.smile-dynamic) { max-width: 100%; height: auto; border-radius: 4px; margin: 4px 0; display: block; }
        [data-bgm-mask] { display: inline; background-color: #555; color: #555; border-radius: 2px; padding: 0 5px; position: relative; transition: color 0.5s linear; }
    `;
    document.head.appendChild(style);

    function fetchAsBase64(url) {
        return new Promise((resolve) => {
            if (!url) { resolve(""); return; }
            const finalUrl = url.startsWith('//') ? 'https:' + url : url;
            GM_xmlhttpRequest({
                method: "GET", url: finalUrl, responseType: "blob",
                onload: (res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(res.response);
                },
                onerror: () => resolve("")
            });
        });
    }

    async function inlineImages(html) {
        if (!html) return html;
        const div = document.createElement('div');
        div.innerHTML = html;
        div.querySelectorAll('.embed-play-btn, .embed-player-wrapper, iframe, #catfish_likes_grid').forEach(el => el.remove());
        div.querySelectorAll('p').forEach(el => { if (!el.textContent.trim() && !el.querySelector('img')) el.remove(); });
        // Remove <br> immediately after non-emoji images (avoids blank line below image)
        div.querySelectorAll('img:not([smileid]):not([data-bgm-emoji])').forEach(img => {
            let next = img.nextSibling;
            while (next && next.nodeType === 3 && !next.textContent.trim()) next = next.nextSibling;
            if (next && next.nodeName === 'BR') next.remove();
        });
        div.querySelectorAll('.text_mask').forEach(el => { el.removeAttribute('style'); el.classList.remove('text_mask'); el.dataset.bgmMask = '1'; });
        let imgs = [...div.querySelectorAll('img')];
        imgs.forEach(img => {
            if (img.hasAttribute('smileid') || /\/smiles\//.test(img.src)) {
                img.setAttribute('data-bgm-emoji', '1');
            }
        });
        const contentImgs = imgs.filter(img =>
            !img.hasAttribute('data-bgm-emoji') &&
            !img.classList.contains('bmoji-image') &&
            !img.classList.contains('smile-dynamic')
        );
        if (CARD_CONTENT_IMAGE_LIMIT >= 0 && contentImgs.length > CARD_CONTENT_IMAGE_LIMIT) {
            const omitted = contentImgs.length - CARD_CONTENT_IMAGE_LIMIT;
            contentImgs.slice(CARD_CONTENT_IMAGE_LIMIT).forEach(img => img.remove());
            const omittedTip = document.createElement('div');
            omittedTip.style.cssText = 'font-size:12px;color:#999;margin-top:6px;';
            omittedTip.textContent = `还有 ${omitted} 张图片已省略`;
            div.appendChild(omittedTip);
            imgs = [...div.querySelectorAll('img')];
        }
        if (imgs.length > 0) {
            const base64s = await Promise.all(imgs.map(img => fetchAsBase64(img.src)));
            imgs.forEach((img, i) => { if (base64s[i]) img.src = base64s[i]; });
        }
        return div.innerHTML;
    }

    async function getPageTags(contentDoc) {
        const contentWin = contentDoc.defaultView || window;
        const pathname = contentWin.location.pathname;
        const isBlog = /\/blog\/\d+/.test(pathname);
        const isEpisode = /\/ep\/\d+/.test(pathname);
        const isCharacter = /\/character\/\d+|\/rakuen\/topic\/crt\/\d+/.test(pathname);
        const isPerson = /\/person\/\d+|\/rakuen\/topic\/prsn\/\d+/.test(pathname);
        const isSubject = /^\/subject\/\d+$/.test(pathname);
        if (isSubject) {
            const subjectIdMatch = pathname.match(/\/subject\/(\d+)/);
            if (subjectIdMatch) {
                const subjectData = await fetchSubjectDataById(subjectIdMatch[1]);
                if (subjectData?.type) return [subjectData.type];
            }
            return ['作品'];
        }
        if (isEpisode) {
            const epIdMatch = pathname.match(/\/ep\/(\d+)/);
            const replyCount = contentDoc.querySelectorAll('[id^="post_"]').length;
            if (epIdMatch) {
                const epData = await fetchEpisodeData(epIdMatch[1]);
                if (epData?.subjectName) return [epData.subjectName, `${replyCount} 回复`];
            }
            return [`${replyCount} 回复`];
        }
        if (isBlog) {
            const subjectNames = [...new Set(
                [...contentDoc.querySelectorAll('a')]
                    .filter(a => /\/subject\/\d+$/.test(a.href) && a.textContent.trim())
                    .map(a => a.textContent.trim())
            )];
            const replyCount = contentDoc.querySelectorAll('[id^="post_"]').length;
            // Single subject: name moves to main title, skip it from tags
            const tagSubjects = subjectNames.length === 1 ? [] : subjectNames;
            return [...tagSubjects, `${replyCount} 回复`, '日志'];
        }
        if (isCharacter) {
            const replyCount = contentDoc.querySelectorAll('[id^="post_"]').length;
            const crtMatch = pathname.match(/\/rakuen\/topic\/crt\/(\d+)/);
            if (crtMatch) {
                const [subjects, persons] = await Promise.all([
                    fetchBangumiAPI(`characters/${crtMatch[1]}/subjects`),
                    fetchBangumiAPI(`characters/${crtMatch[1]}/persons`)
                ]);
                const staffPriority = { '主角': 0, '配角': 1, '客串': 2 };
                const typePriorityApi = { 2: 0, 4: 1 };
                const scored = (subjects || []).map(s => ({
                    name: s.name_cn || s.name,
                    rp: staffPriority[s.staff] ?? 99,
                    tp: typePriorityApi[s.type] ?? 99
                })).sort((a, b) => a.rp !== b.rp ? a.rp - b.rp : a.tp - b.tp);
                const subjectNames = [...new Set(scored.map(s => s.name))].slice(0, 2);
                const cvNames = [...new Set((persons || []).filter(p => p.type === 1).map(p => p.name))];
                const tags = [];
                if (cvNames.length) tags.push('!CV: ' + cvNames.join(' / '));
                tags.push(...subjectNames);
                tags.push(`${replyCount} 回复`);
                return tags;
            }
            const cvNames = [...new Set(
                [...contentDoc.querySelectorAll('.browserList .badge_actor h3 a')]
                    .map(a => a.textContent.trim()).filter(Boolean)
            )];
            const rolePriority = { '1': 0, '2': 1, '3': 2 };
            const typePriority = { '2': 0, '3': 1 };
            const scoredItems = [...contentDoc.querySelectorAll('.browserList .item')].map(item => {
                const nameEl = item.querySelector('.innerLeftItem h3 a.l');
                if (!nameEl) return null;
                const roleAttr = item.querySelector('.badge_job[attr-crt-type]')?.getAttribute('attr-crt-type') || '99';
                const typeMatch = item.querySelector('.ico_subject_type')?.className.match(/subject_type_(\d+)/);
                const typeNum = typeMatch ? typeMatch[1] : '99';
                return { name: nameEl.textContent.trim(), rp: rolePriority[roleAttr] ?? 99, tp: typePriority[typeNum] ?? 99 };
            }).filter(Boolean);
            scoredItems.sort((a, b) => a.rp !== b.rp ? a.rp - b.rp : a.tp - b.tp);
            const subjectNames = [...new Set(scoredItems.map(s => s.name))].slice(0, 2);
            const tags = [];
            if (cvNames.length) tags.push('!CV: ' + cvNames.join(' / '));
            tags.push(...subjectNames);
            tags.push(`${replyCount} 回复`);
            return tags;
        }
        if (isPerson) {
            const replyCount = contentDoc.querySelectorAll('[id^="post_"]').length;
            const personIdMatch = pathname.match(/\/rakuen\/topic\/prsn\/(\d+)/) || pathname.match(/\/person\/(\d+)/);
            if (personIdMatch) {
                const workTags = await fetchPersonWorkTags(personIdMatch[1]);
                return [...workTags, `${replyCount} 回复`];
            }
        }
        const groupLink = contentDoc.querySelector('a.avatar[href^="/group/"]');
        let groupName = '';
        if (groupLink) {
            groupLink.childNodes.forEach(n => { if (n.nodeType === 3) groupName += n.textContent.trim(); });
        }
        if (!groupName) {
            const subjectLink = contentDoc.querySelector('#pageHeader a[href^="/subject/"]')
                || contentDoc.querySelector('a[href^="/subject/"]');
            if (subjectLink) groupName = subjectLink.textContent.trim();
        }
        const replyCount = Math.max(0, contentDoc.querySelectorAll('[id^="post_"]').length - 1);
        return [groupName || 'Bangumi', `${replyCount} 回复`];
    }

    async function getAITags(title, content, contentDoc) {
        const apiKey = GM_getValue('bgm_share_ai_key', '');
        const apiUrl = GM_getValue('bgm_share_ai_url', '');
        const model = GM_getValue('bgm_share_ai_model', '') || 'gpt-3.5-turbo';
        if (!apiKey || !apiUrl) return getPageTags(contentDoc);
        return new Promise((resolve) => {
            const prompt = `根据标题和内容生成3个短标签，只要标签名，空格隔开。内容：${title} ${content.substring(0, 150)}`;
            GM_xmlhttpRequest({
                method: "POST", url: apiUrl,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
                data: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.5 }),
                onload: (res) => {
                    try {
                        const tags = JSON.parse(res.responseText).choices[0].message.content.trim().split(/\s+/).slice(0, 3);
                        resolve(tags);
                    } catch (e) { resolve(getPageTags(contentDoc)); }
                },
                onerror: () => resolve(getPageTags(contentDoc))
            });
        });
    }

    // contentDoc: the document containing the topic (may be an iframe's doc on Rakuen)
    // Overlay is always rendered in the outer document (where GM functions are available)
    async function _doShareCard({ username, postTime, avatarUrl, contentEl, pureTitle, contentDoc, contentWin, dark,
                                   replies = [], replyId = '', charImageUrl = '', badgeLabel = '', overrideTags = null, topicTitle = '', noCardTitle = false, shareTitle = '' }) {
        if (document.getElementById('bgm-share-overlay')) return;
        if (typeof html2canvas === 'undefined') {
            alert("截图库加载失败，请刷新页面或检查网络。");
            return;
        }

        const loading = document.createElement('div');
        loading.innerHTML = '<div id="bgm-share-overlay" style="display:flex"><div id="loading-info">AI 正在提炼标签...</div></div>';
        document.body.appendChild(loading);

        let fullContent = "";
        let displayContentHtml = "";
        if (contentEl) {
            const toHide = contentEl.querySelectorAll('.forum_category, #catfish_likes_grid, .embed-play-btn');
            toHide.forEach(el => el.style.display = 'none');
            const computedHidden = [...contentEl.querySelectorAll('*')].filter(el => {
                const cs = getComputedStyle(el);
                return cs.display === 'none' || cs.visibility === 'hidden';
            });
            computedHidden.forEach(el => { el.dataset.hiddenSnapshot = '1'; el.style.display = 'none'; });
            fullContent = contentEl.innerText?.trim() || "";
            const fullHtml = contentEl.innerHTML?.trim() || "";
            computedHidden.forEach(el => { delete el.dataset.hiddenSnapshot; el.style.display = ''; });
            toHide.forEach(el => el.style.display = '');
            const lim = replies.length > 0 ? 200 : 300;
            displayContentHtml = fullContent.length > lim ? truncateHtml(fullHtml, lim) : fullHtml;
        }
        const currentFullUrl = contentWin.location.origin + contentWin.location.pathname;
        const shareUrl = replyId ? currentFullUrl + '#' + replyId : currentFullUrl;
        const displayUrl = currentFullUrl.replace(/^https?:\/\//, '');

        const [tags, base64Avatar, base64CharImage, base64QR, ...base64ReplyAvatars] = await Promise.all([
            overrideTags ? Promise.resolve(overrideTags) : getAITags(pureTitle, fullContent, contentDoc),
            fetchAsBase64(avatarUrl),
            fetchAsBase64(charImageUrl),
            fetchAsBase64(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(shareUrl)}${dark ? '&color=F09199&bgcolor=2a2a2a' : ''}`),
            ...replies.map(r => fetchAsBase64(r.avatarUrl))
        ]);

        const [inlinedMainContent, ...inlinedReplyContents] = await Promise.all([
            inlineImages(displayContentHtml),
            ...replies.map(r => inlineImages(r.contentHtml || r.content))
        ]);

        const tagsHtml = tags.map(tag => tag.startsWith('!') ? `<span class="tag-item">${tag.slice(1)}</span>` : `<span class="tag-item"># ${tag}</span>`).join('');
        const divider = dark ? 'rgba(255,255,255,0.1)' : '#eee';
        const hasMainContent = !!inlinedMainContent || !!username;
        const renderLevel = (idx) => {
            if (idx >= replies.length) return '';
            const r = replies[idx];
            const b64 = base64ReplyAvatars[idx];
            const avatarSize = Math.max(24, 36 - idx * 4);
            const suppressGap = base64CharImage && !topicTitle && !inlinedMainContent && !username;
            const topStyle = idx === 0
                ? `margin-top:${suppressGap ? '0' : '14'}px;padding-top:${suppressGap ? '0' : '14'}px;${hasMainContent ? `border-top:1px solid ${divider};` : ''}`
                : `margin-top:10px;padding-left:14px;border-left:3px solid ${dark ? '#F0919955' : '#F0919933'};`;
            const inner = idx + 1 < replies.length ? `<div style="margin-top:10px;">${renderLevel(idx + 1)}</div>` : '';
            return `<div style="${topStyle}">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <img src="${b64}" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:${idx === 0 ? '9' : '7'}px;object-fit:cover;border:1px solid ${dark ? '#444' : '#f0f0f0'};">
                    <span style="font-weight:bold;color:#F09199;font-size:${15 - idx}px;">${r.username}</span>
                    ${r.rating ? `<span style="color:${dark ? '#f5c842' : '#e6a800'};font-size:${12 - idx}px;font-weight:bold;">★ ${r.rating}</span>` : ''}
                    <span style="color:#aaa;font-size:${12 - idx}px;">${r.time}</span>
                </div>
                <div class="content-box"><div class="content-text" style="font-size:${14 - idx}px;">${inlinedReplyContents[idx]}</div></div>
                ${inner}
            </div>`;
        };
        const replySection = replies.length > 0 ? renderLevel(0) : '';
        loading.remove();

        const overlay = document.createElement('div');
        overlay.id = 'bgm-share-overlay';
        overlay.style.display = 'flex';
        const notice = _shareNotice;
        _shareNotice = '';
        overlay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; margin: auto; padding: 30px 0 50px;">
            <div style="position:relative;">
            ${notice ? `<div id="bgm-share-notice" style="position:absolute;bottom:calc(100% + 14px);left:50%;transform:translateX(-50%);background:rgba(30,30,30,0.9);border:1px solid #F09199;color:#F09199;padding:10px 20px;border-radius:10px;font-size:13px;white-space:nowrap;opacity:0;transition:opacity 0.4s;pointer-events:none;">⚠ ${notice}</div>` : ''}
            <div id="capture-area" style="padding: 4px; background: transparent;">
                <div class="share-card${dark ? ' dark' : ''}">
                    <div class="card-top-bar"></div>
                    ${base64CharImage ? `<div style="display:flex;align-items:stretch;"><div style="flex:1;padding:22px 20px 14px 25px;display:flex;flex-direction:column;justify-content:center;min-height:150px;position:relative;"><div style="font-size:22px;font-weight:800;color:${dark ? '#f0f0f0' : '#111'};line-height:1.3;">${pureTitle}</div><div style="margin-top:10px;"><span style="background:${dark ? '#2a2a2a' : '#FEEFF0'};color:#F09199;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:bold;border:1px solid ${dark ? '#F0919966' : '#F0919944'};">${badgeLabel}</span></div><div style="position:absolute;bottom:0;left:25px;right:0;height:1px;background:linear-gradient(to right,${dark ? 'rgba(255,255,255,0.15)' : '#ddd'} 0%,${dark ? 'rgba(255,255,255,0.15)' : '#ddd'} 60%,transparent 100%);"></div></div><div style="position:relative;width:130px;flex-shrink:0;min-height:150px;overflow:hidden;background-color:${dark ? '#2a2a2a' : '#f9f5f5'};"><div style="position:absolute;top:0;left:0;right:0;bottom:0;background-image:url('${base64CharImage}');background-size:cover;background-position:center top;background-repeat:no-repeat;"></div><div style="position:absolute;top:0;left:-1px;right:0;bottom:-1px;background:linear-gradient(to right,${dark ? '#1e1e1e' : '#fff'} 0%,${dark ? 'rgba(30,30,30,0)' : 'rgba(255,255,255,0)'} 20%),linear-gradient(to top,${dark ? '#1e1e1e' : '#fff'} 0%,${dark ? 'rgba(30,30,30,0)' : 'rgba(255,255,255,0)'} 20%);"></div></div></div>` : badgeLabel ? `<div style="padding:22px 25px 14px;position:relative;"><div style="font-size:22px;font-weight:800;color:${dark ? '#f0f0f0' : '#111'};line-height:1.3;">${pureTitle}</div><div style="margin-top:10px;"><span style="background:${dark ? '#2a2a2a' : '#FEEFF0'};color:#F09199;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:bold;border:1px solid ${dark ? '#F0919966' : '#F0919944'};">${badgeLabel}</span></div><div style="position:absolute;bottom:0;left:25px;right:25px;height:1px;background:${dark ? 'rgba(255,255,255,0.1)' : '#eee'};"></div></div>` : ''}
                    ${username ? `<div class="card-header" style="">
                        <img class="avatar-img" src="${base64Avatar}">
                        <div class="user-meta">
                            <span class="name">${username}</span>
                            <span class="time">${postTime}</span>
                        </div>
                    </div>` : ''}
                    <div class="card-body">
                        ${(base64CharImage || badgeLabel || noCardTitle) ? '' : `<h1 class="main-title">${pureTitle}</h1>`}
                        ${topicTitle ? `<h2 class="topic-sub-title">${topicTitle}</h2>` : ''}
                        ${inlinedMainContent ? `<div class="content-box"><div class="content-text">${inlinedMainContent}</div></div>` : ''}
                        ${replySection}
                        <div class="tags-container">${tagsHtml}</div>
                    </div>
                    <div class="card-footer">
                        <div style="text-align:left">
                            <div style="font-size:14px; font-weight:bold; color:#F09199">Bangumi 番组计划</div>
                            <div style="font-size:10px; color:${dark ? '#888' : '#aaa'}; margin-top:2px;">${displayUrl}</div>
                        </div>
                        <img class="qr-img" src="${base64QR}">
                    </div>
                </div>
            </div>
            </div>
            <div class="bgm-btn-row">
                <button id="bgm-copy-btn" class="bgm-action-btn" disabled data-tip="复制图片">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button id="bgm-download-btn" class="bgm-action-btn" disabled data-tip="下载图片">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button id="bgm-text-btn" class="bgm-action-btn" data-tip="复制文案">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </button>
                <button id="bgm-mask-btn" class="bgm-action-btn" data-tip="显示剧透">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
            </div>
            </div>
        `;
        document.body.appendChild(overlay);
        const noticeEl = document.getElementById('bgm-share-notice');
        if (noticeEl) {
            requestAnimationFrame(() => requestAnimationFrame(() => { noticeEl.style.opacity = '1'; }));
            setTimeout(() => { noticeEl.style.opacity = '0'; setTimeout(() => noticeEl.remove(), 400); }, 4000);
        }

        let cancelled = false;
        let maskRevealed = false;
        let currentCanvas = null;

        const maskPreviewStyle = document.createElement('style');
        document.head.appendChild(maskPreviewStyle);

        const copyBtn = document.getElementById('bgm-copy-btn');
        const downloadBtn = document.getElementById('bgm-download-btn');

        const hasMask = !!document.querySelector('#capture-area [data-bgm-mask]');
        if (!hasMask) document.getElementById('bgm-mask-btn').style.display = 'none';

        const updateMaskPreview = () => {
            maskPreviewStyle.textContent = maskRevealed
                ? '#capture-area [data-bgm-mask] { color: #fff !important; }'
                : '';
            const btn = document.getElementById('bgm-mask-btn');
            if (btn) btn.setAttribute('data-tip', maskRevealed ? '遮住剧透' : '显示剧透');
        };
        updateMaskPreview();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                cancelled = true;
                maskPreviewStyle.remove();
                overlay.remove();
            }
        });

        const showToast = (msg) => {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;z-index:100002;opacity:1;transition:opacity 0.5s';
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 1800);
        };

        document.getElementById('bgm-text-btn').addEventListener('click', async () => {
            const shareText = `【链接】${shareTitle || topicTitle || pureTitle} | Bangumi番组计划\n${shareUrl}`;
            try {
                await navigator.clipboard.writeText(shareText);
                showToast('✓ 文案已复制');
            } catch (e) {
                showToast('✗ 复制失败');
            }
        });

        document.getElementById('bgm-mask-btn').addEventListener('click', () => {
            maskRevealed = !maskRevealed;
            updateMaskPreview();
            doCapture();
        });

        copyBtn.addEventListener('click', async () => {
            if (!currentCanvas) return;
            try {
                const blob = await new Promise(resolve => currentCanvas.toBlob(resolve, 'image/png'));
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                showToast('✓ 已复制到剪贴板');
            } catch (e) {
                showToast('✗ 复制失败，请改用下载');
            }
        });

        downloadBtn.addEventListener('click', () => {
            if (!currentCanvas) return;
            const link = document.createElement('a');
            link.download = `BGM_Share_${username}.png`;
            link.href = currentCanvas.toDataURL('image/png');
            link.click();
        });

        const doCapture = async () => {
            if (cancelled) return;
            copyBtn.disabled = true;
            downloadBtn.disabled = true;
            let canvas;
            let iframe = null;
            try {
                const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000));
                const captureEl = document.querySelector('#capture-area');

                iframe = document.createElement('iframe');
                iframe.style.cssText = 'position:fixed;top:0;left:0;border:0;opacity:0;pointer-events:none;z-index:99999;';
                iframe.style.width = captureEl.offsetWidth + 'px';
                iframe.style.height = captureEl.offsetHeight + 'px';
                document.body.appendChild(iframe);

                const iDoc = iframe.contentDocument;
                const iStyle = iDoc.createElement('style');
                const maskCss = maskRevealed ? '[data-bgm-mask] { color: #fff !important; }' : '';
                const sampleLink = contentDoc.querySelector('.topic_content a[href], #entry_content a[href], .message a[href], .statusContent .text a[href], .subReply a.l[href]')
                    || contentDoc.querySelector('a[href^="http"]')
                    || contentDoc.querySelector('a[href]');
                const rawLinkColor = sampleLink ? getComputedStyle(sampleLink).color : '';
                const linkColor = rawLinkColor && rawLinkColor !== 'rgba(0, 0, 0, 0)' && rawLinkColor !== 'transparent'
                    ? rawLinkColor : (dark ? '#8ec8e8' : '#0066cc');
                const sampleLinkDecoration = sampleLink ? getComputedStyle(sampleLink).textDecorationLine : 'none';
                let quoteCss = '';
                try {
                    for (const sheet of document.styleSheets) {
                        try {
                            for (const rule of sheet.cssRules) {
                                if (rule.selectorText && /\.quote/.test(rule.selectorText)) {
                                    quoteCss += rule.cssText + '\n';
                                    // Also add ancestor-stripped version to ensure match inside card
                                    const sel = rule.selectorText.split(',').map(s => {
                                        const i = s.indexOf('.quote');
                                        return i >= 0 ? s.slice(i).trim() : s.trim();
                                    }).join(',');
                                    if (sel !== rule.selectorText.trim()) {
                                        quoteCss += `${sel}{${rule.style.cssText}}\n`;
                                    }
                                }
                            }
                        } catch (e) { /* cross-origin sheet */ }
                    }
                } catch (e) {}
                // Sync quote and body text colors from actual page computed styles
                try {
                    const cw = contentDoc.defaultView || window;
                    const sampleQuoteQ = contentDoc.querySelector('.quote q');
                    const sampleBody = contentDoc.querySelector('.cmt_sub_content') || contentDoc.querySelector('.reply_content .message') || contentDoc.querySelector('.topic_content');
                    if (sampleQuoteQ) {
                        const quoteColor = cw.getComputedStyle(sampleQuoteQ).color;
                        if (quoteColor) quoteCss += `.quote,.quote q{color:${quoteColor} !important;}`;
                    }
                    if (sampleBody) {
                        const bodyColor = cw.getComputedStyle(sampleBody).color;
                        if (bodyColor) quoteCss += `.content-text{color:${bodyColor} !important;}`;
                    }
                } catch (e) {}
                iStyle.textContent = style.innerHTML + maskCss + quoteCss + ` a { color: ${linkColor} !important; text-decoration: ${sampleLinkDecoration}; } span[style*="line-through"], span[style*="line-through"] * { text-decoration: line-through !important; text-decoration-color: white !important; }`;
                iDoc.head.appendChild(iStyle);
                iDoc.body.style.cssText = 'margin:0;padding:0;background:transparent;display:inline-block;';
                iDoc.body.innerHTML = captureEl.innerHTML;

                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

                // html2canvas renders inline backgrounds as full-width blocks; replace each
                // [data-bgm-mask] background with precisely-positioned absolute overlays
                // matching the actual per-line text rects from getClientRects().
                const captureRoot = iDoc.body.firstElementChild;
                captureRoot.style.position = 'relative';
                const rootRect = captureRoot.getBoundingClientRect();
                iDoc.querySelectorAll('[data-bgm-mask]').forEach(el => {
                    Array.from(el.getClientRects()).forEach(rect => {
                        const ov = iDoc.createElement('div');
                        ov.style.cssText = `position:absolute;left:${rect.left - rootRect.left}px;top:${rect.top - rootRect.top}px;width:${rect.width}px;height:${rect.height}px;background-color:#555;border-radius:2px;pointer-events:none;`;
                        // Revealed: overlay behind text (prepend); Hidden: overlay on top (append)
                        if (maskRevealed) captureRoot.insertBefore(ov, captureRoot.firstChild);
                        else captureRoot.appendChild(ov);
                    });
                    el.style.backgroundColor = 'transparent';
                    el.style.backgroundImage = 'none';
                });

                // html2canvas undercounts advance widths for full-width CJK punctuation (《（【etc.)
                // because canvas.measureText() returns only the glyph width, not the full advance.
                // Wrapping each as display:inline-block with width:1em forces html2canvas to read
                // the DOM layout box instead of measureText, giving the correct advance.
                const CJK_PUNCT_RE = /[《》〈〉「」【】〔〕〖〗（）｛｝]/;
                const CJK_PUNCT_SPLIT_RE = /(《|》|〈|〉|「|」|【|】|〔|〕|〖|〗|（|）|｛|｝)/u;
                iDoc.querySelectorAll('.content-text').forEach(contentEl => {
                    const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, null);
                    const textNodes = [];
                    let tn;
                    while (tn = walker.nextNode()) {
                        if (CJK_PUNCT_RE.test(tn.textContent)) textNodes.push(tn);
                    }
                    textNodes.forEach(tn => {
                        const parts = tn.textContent.split(CJK_PUNCT_SPLIT_RE);
                        if (parts.length <= 1) return;
                        const frag = iDoc.createDocumentFragment();
                        parts.forEach(part => {
                            if (!part) return;
                            if (CJK_PUNCT_RE.test(part) && part.length === 1) {
                                const sp = iDoc.createElement('span');
                                sp.style.cssText = 'display:inline-block;width:1em;text-align:center;';
                                sp.textContent = part;
                                frag.appendChild(sp);
                            } else {
                                frag.appendChild(iDoc.createTextNode(part));
                            }
                        });
                        tn.parentNode.replaceChild(frag, tn);
                    });
                });

                canvas = await Promise.race([
                    html2canvas(iDoc.body.firstElementChild, { scale: 2, backgroundColor: null }),
                    timeout
                ]);

                // 裁掉底部全透明行（inline-block baseline gap 产生的透明条）
                const imgData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
                let trimH = canvas.height;
                for (let y = canvas.height - 1; y >= 0; y--) {
                    let opaque = false;
                    for (let x = 0; x < canvas.width; x++) {
                        if (imgData[(y * canvas.width + x) * 4 + 3] > 0) { opaque = true; break; }
                    }
                    if (opaque) { trimH = y + 1; break; }
                }
                if (trimH < canvas.height) {
                    const trimmed = document.createElement('canvas');
                    trimmed.width = canvas.width;
                    trimmed.height = trimH;
                    trimmed.getContext('2d').drawImage(canvas, 0, 0);
                    canvas = trimmed;
                }
            } catch (e) {
                iframe?.remove();
                showToast('✗ 截图失败，请刷新后重试');
                return;
            }
            iframe?.remove();
            if (cancelled) return;
            currentCanvas = canvas;
            copyBtn.disabled = false;
            downloadBtn.disabled = false;
        };

        setTimeout(() => doCapture(), 800);
    }

    function extractCharImageUrl(contentDoc) {
        const link = contentDoc.querySelector('#columnCrtA a.thickbox')
            || contentDoc.querySelector('a.thickbox[href*="/pic/crt/"]')
            || contentDoc.querySelector('a.thickbox[href*="/pic/user/"]');
        if (link?.href) return link.href;
        const img = contentDoc.querySelector('#columnCrtA img')
            || contentDoc.querySelector('#crt_cover img')
            || contentDoc.querySelector('img[src*="/pic/crt/l/"]')
            || contentDoc.querySelector('img[src*="/pic/user/l/"]')
            || contentDoc.querySelector('img[src*="/pic/crt/m/"]');
        return img?.src || '';
    }

    async function fetchPersonWorkTags(personId) {
        const staffPriority = { '主角': 0, '配角': 1, '客串': 2 };
        const typePriority = { 2: 0, 4: 1 };
        const chars = await fetchBangumiAPI(`persons/${personId}/characters`);
        if (chars && chars.length) {
            const charMap = new Map();
            for (const c of chars) {
                const rp = staffPriority[c.staff] ?? 99;
                const tp = typePriority[c.subject_type] ?? 99;
                const existing = charMap.get(c.id);
                if (!existing || rp < existing.rp || (rp === existing.rp && tp < existing.tp)) {
                    charMap.set(c.id, { charName: c.name, workName: c.subject_name_cn || c.subject_name, rp, tp });
                }
            }
            return [...charMap.values()]
                .sort((a, b) => a.rp !== b.rp ? a.rp - b.rp : a.tp - b.tp)
                .slice(0, 2)
                .map(c => `${c.charName} - ${c.workName}`);
        }
        const subjects = await fetchBangumiAPI(`persons/${personId}/subjects`);
        if (subjects && subjects.length) {
            const staffOrder = [
                // 核心创作
                '监督', '原案', '原作', '系列构成', '脚本', '剧本', '编剧', '企画',
                // 人设/美术
                '人物设计', '总作画监督', '作画监督', '作画监督助理', '监修', '设定协力',
                // 动画制作
                '演出', '分镜', '原画', '主动画师', '作画', '第二原画', '补间动画', '动画',
                // 音乐
                '音乐', '作曲', '编曲', '作词', '主题歌演出', '主题歌作曲', '主题歌编曲', '母带制作', '艺术家',
                // 技术/制作
                '音响监督', '摄影监督', '色彩设计', '美术监督', '制作人', '监制', '执行制片人', '协力',
                // 出演
                '主演', '配角', '出演', '客串'
            ];
            const staffRank = (staff) => { const i = staffOrder.indexOf(staff); return i === -1 ? staffOrder.length : i; };
            const seen = new Set();
            const seenStaff = new Set();
            const result = [];
            for (const s of [...subjects].sort((a, b) => {
                const sr = staffRank(a.staff) - staffRank(b.staff);
                if (sr !== 0) return sr;
                return (typePriority[a.type] ?? 99) - (typePriority[b.type] ?? 99);
            })) {
                const name = s.name_cn || s.name;
                if (name && !seen.has(s.id) && !seenStaff.has(s.staff)) {
                    seen.add(s.id);
                    seenStaff.add(s.staff);
                    result.push(s.staff ? `${s.staff} - ${name}` : name);
                }
                if (result.length >= 2) break;
            }
            return result;
        }
        return [];
    }

    function fetchBangumiAPI(path) {
        const token = getBgmToken();
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bgm.tv/v0/' + path,
                headers: { 'Accept': 'application/json', ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                onload: res => {
                    if (res.status === 401) clearBgmToken();
                    if (res.status !== 200) { resolve(null); return; }
                    try { resolve(JSON.parse(res.responseText)); } catch { resolve(null); }
                },
                onerror: () => resolve(null)
            });
        });
    }

    async function getRakuenCharPersonData(pathname) {
        const crtMatch = pathname.match(/\/rakuen\/topic\/crt\/(\d+)/);
        const prsnMatch = pathname.match(/\/rakuen\/topic\/prsn\/(\d+)/);
        if (!crtMatch && !prsnMatch) return null;
        const id = (crtMatch || prsnMatch)[1];
        const type = crtMatch ? 'characters' : 'persons';
        const data = await fetchBangumiAPI(`${type}/${id}`);
        if (!data) return null;
        const imageUrl = data.images?.large || data.images?.medium || '';
        const name = data.name || '';
        const careerMap = { producer: '制作人', mangaka: '漫画家', artist: '画师', seiyu: '声优', writer: '作者', illustrator: '插画师', actor: '演员' };
        const badgeLabel = crtMatch ? '角色' : ((data.career || []).map(c => careerMap[c]).filter(Boolean).join(' ') || '人物');
        return { imageUrl, name, badgeLabel, id, type };
    }

    const _episodeDataCache = {};
    async function fetchEpisodeData(episodeId) {
        if (_episodeDataCache[episodeId]) {
            if (_episodeDataCache[episodeId]._domFallback) _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
            return _episodeDataCache[episodeId];
        }
        const ep = await fetchBangumiAPI(`episodes/${episodeId}`);
        if (!ep) {
            _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
            let episodeName = '', epNumber = null;
            const epH2 = document.querySelector('h2.title');
            if (epH2) {
                let rawText = '';
                epH2.childNodes.forEach(n => { if (n.nodeType === 3) rawText += n.textContent; });
                rawText = rawText.trim();
                const epMatch = rawText.match(/^ep\.(\d+)\s*(.*)$/i);
                if (epMatch) { epNumber = parseInt(epMatch[1]); episodeName = epMatch[2].trim() || rawText; }
                else episodeName = rawText;
            }
            if (!episodeName) {
                const h1Node = document.querySelector('#pageHeader h1') || document.querySelector('h1');
                if (h1Node) h1Node.childNodes.forEach(n => { if (n.nodeType === 3) episodeName += n.textContent; });
                episodeName = episodeName.replace(/[»\n]/g, '').trim();
            }
            const subjectLink = document.querySelector('#headerSubject a[href*="/subject/"]')
                || document.querySelector('#pageHeader a[href*="/subject/"]')
                || document.querySelector('a.cover[href*="/subject/"]');
            const subjectName = subjectLink?.textContent?.trim() || '';
            const subjectImg = document.querySelector('img[src*="/pic/cover/l/"]') || document.querySelector('img[src*="/pic/cover/m/"]');
            const subjectImageUrl = subjectImg?.src || '';
            const result = { episodeName, subjectName, subjectImageUrl, epNumber, _domFallback: true };
            _episodeDataCache[episodeId] = result;
            return result;
        }
        const subject = await fetchBangumiAPI(`subjects/${ep.subject_id}`);
        let subjectName = subject?.name_cn || subject?.name || '';
        let subjectImageUrl = subject?.images?.medium || subject?.images?.common || '';
        if (!subject) {
            _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
            const subjectLink = document.querySelector('#headerSubject a[href*="/subject/"]') || document.querySelector('a.cover[href*="/subject/"]');
            if (subjectLink) subjectName = subjectLink.textContent?.trim() || '';
            const subjectImg = document.querySelector('img[src*="/pic/cover/l/"]') || document.querySelector('img[src*="/pic/cover/m/"]');
            if (subjectImg) subjectImageUrl = subjectImg.src;
        }
        const result = {
            episodeName: ep.name_cn || ep.name || '',
            subjectName,
            subjectImageUrl,
            epNumber: ep.ep,
            _domFallback: !subject
        };
        _episodeDataCache[episodeId] = result;
        return result;
    }

    function extractSubjectDataFromDOM(subjectId, doc) {
        const h1 = doc.querySelector('#pageHeader h1');
        let name = '';
        if (h1) h1.childNodes.forEach(n => { if (n.nodeType === 3) name += n.textContent; });
        name = name.trim() || doc.title?.split(/\s*[|／/]\s*/)[0].trim() || '';
        const coverA = doc.querySelector('a.thickbox[href*="/pic/cover/"]');
        const coverImg = doc.querySelector('img[src*="/pic/cover/l/"]') || doc.querySelector('img[src*="/pic/cover/m/"]') || doc.querySelector('#bangumiInfo img');
        const imageUrl = coverA?.href || coverImg?.src || '';
        const navTypeMap = { '/anime': ['动画', 2], '/book': ['书籍', 1], '/music': ['音乐', 3], '/game': ['游戏', 4], '/real': ['三次元', 6] };
        let type = '作品', typeNum = 0;
        for (const [href, [t, n]] of Object.entries(navTypeMap)) {
            if (doc.querySelector(`#navMenuNeue a[href="${href}"].focus, #navMenuNeue a[href="${href}"][class*="selected"]`)) {
                type = t; typeNum = n; break;
            }
        }
        return { name, imageUrl, type, typeNum, infobox: [] };
    }

    function getSubjectIdFromTopicPage(pathname, contentDoc) {
        const direct = pathname.match(/\/subject\/(\d+)\/topic\/\d+/);
        if (direct) return direct[1];
        if (/\/subject\/topic\/\d+/.test(pathname) || /\/rakuen\/topic\/subject\/\d+/.test(pathname)) {
            const link = contentDoc.querySelector('#pageHeader a[href^="/subject/"]')
                || contentDoc.querySelector('a.cover[href^="/subject/"]')
                || contentDoc.querySelector('a[href^="/subject/"]');
            const m = link?.getAttribute('href')?.match(/\/subject\/(\d+)/);
            if (m) return m[1];
        }
        return null;
    }

    let _shareNotice = '';
    const _subjectDataCache = {};
    async function fetchSubjectDataById(subjectId) {
        if (_subjectDataCache[subjectId]) {
            if (_subjectDataCache[subjectId]._domFallback) _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
            return _subjectDataCache[subjectId];
        }
        const data = await fetchBangumiAPI(`subjects/${subjectId}`);
        if (!data) {
            if (new RegExp(`/subject/${subjectId}(/|$)`).test(window.location.pathname)) {
                _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
                const result = extractSubjectDataFromDOM(subjectId, document);
                result._domFallback = true;
                _subjectDataCache[subjectId] = result;
                return result;
            }
            return null;
        }
        const typeMap = { 1: '书籍', 2: '动画', 3: '音乐', 4: '游戏', 6: '三次元' };
        const result = {
            name: data.name_cn || data.name || '',
            imageUrl: data.images?.medium || data.images?.common || '',
            type: typeMap[data.type] || '作品',
            typeNum: data.type,
            infobox: data.infobox || []
        };
        _subjectDataCache[subjectId] = result;
        return result;
    }

    function getInfoboxValue(infobox, key) {
        const entry = (infobox || []).find(e => e.key === key);
        if (!entry) return null;
        if (typeof entry.value === 'string') {
            const parts = entry.value.split(/[、\/]/).map(s => s.trim()).filter(Boolean);
            if (parts.length > 3) return parts.slice(0, 3).join(' / ') + ' 等';
            return entry.value;
        }
        if (Array.isArray(entry.value)) {
            const vals = entry.value.map(v => v.v || v).filter(Boolean);
            const limited = vals.slice(0, 3);
            return limited.join(' / ') + (vals.length > 3 ? ' 等' : '');
        }
        return null;
    }

    const SUBJECT_INFOBOX_KEYS = {
        1: ['作者', '出版社'],
        2: ['导演', '原作'],
        3: ['艺术家', '厂牌'],
        4: ['游戏类型', '开发'],
        6: ['导演', '主演']
    };

    function extractCommentItemInfo(itemEl, contentWin) {
        const userLink = itemEl.querySelector('a[href*="/user/"]');
        const username = userLink ? userLink.textContent.trim() : '未知用户';
        const userSlug = userLink ? (userLink.getAttribute('href') || '').replace('/user/', '').replace(/^\//, '') : '';
        const avatarEl = itemEl.querySelector('.avatarNeue') || itemEl.querySelector('[class*="avatar"]');
        let avatarUrl = '';
        if (avatarEl) {
            const bg = contentWin.getComputedStyle(avatarEl).backgroundImage;
            if (bg && bg !== 'none') avatarUrl = bg.replace(/url\(["']?([^"']+)["']?\)/, '$1');
            if (!avatarUrl) {
                const m = (avatarEl.getAttribute('style') || '').match(/background-image:\s*url\(["']?([^"']+)["']?\)/);
                if (m) avatarUrl = m[1];
            }
        }
        const commentEl = itemEl.querySelector('p.comment');
        const rawText = commentEl?.innerText?.trim() || '';
        const truncated = rawText.length > 150;
        const contentHtml = truncated ? rawText.substring(0, 150) + '...' : (commentEl?.innerHTML?.trim() || '');
        const greyEls = [...itemEl.querySelectorAll('small.grey')];
        const timeEl = greyEls.find(el => el.textContent.trim().startsWith('@'));
        const domTime = timeEl ? timeEl.textContent.trim().replace(/^@\s*/, '') : '';
        const statusEl = greyEls.find(el => !el.textContent.trim().startsWith('@'));
        const collectionStatus = statusEl ? statusEl.textContent.trim() : '';
        return {
            username, userSlug, avatarUrl,
            time: domTime, rating: 0, collectionStatus,
            content: truncated ? rawText.substring(0, 150) + '...' : rawText,
            contentHtml
        };
    }

    async function createSubjectCommentShareImage(itemEl, contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;
        const subjectIdMatch = contentWin.location.pathname.match(/\/subject\/(\d+)/);
        if (!subjectIdMatch) return;
        const subjectId = subjectIdMatch[1];
        const subjectData = await fetchSubjectDataById(subjectId);
        const pureTitle = subjectData?.name || contentDoc.title?.split(/\s*[|／/]\s*/)[0].trim() || '作品';
        const charImageUrl = subjectData?.imageUrl || '';
        const badgeLabel = subjectData?.type || '作品';
        const commentInfo = extractCommentItemInfo(itemEl, contentWin);
        let userTags = null;
        if (commentInfo.userSlug) {
            const collection = await fetchBangumiAPI(`users/${commentInfo.userSlug}/collections/${subjectId}`);
            if (collection) {
                commentInfo.rating = collection.rate || 0;
                if (collection.updated_at) {
                    const d = new Date(collection.updated_at);
                    const pad = n => String(n).padStart(2, '0');
                    commentInfo.time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                if (collection.tags?.length > 0) userTags = collection.tags;
            }
        }
        if (!commentInfo.time) commentInfo.time = '未知时间';
        const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
            .map(key => getInfoboxValue(subjectData?.infobox, key))
            .filter(Boolean);
        const fallbackTags = [commentInfo.collectionStatus, ...infoboxTags].filter(Boolean);
        const overrideTags = userTags
            ? [commentInfo.collectionStatus, ...userTags].filter(Boolean)
            : fallbackTags;
        await _doShareCard({
            username: '', postTime: '', avatarUrl: '', contentEl: null,
            pureTitle, contentDoc, contentWin, dark,
            replies: [commentInfo], replyId: itemEl.id || '',
            charImageUrl, badgeLabel, overrideTags
        });
    }

    function extractCollectionPageItemInfo(itemEl, contentWin) {
        const userLink = itemEl.querySelector('a.avatar[href*="/user/"]');
        const userSlug = userLink?.getAttribute('href')?.match(/\/user\/([^\/\?]+)/)?.[1] || '';
        let username = '';
        if (userLink) {
            userLink.childNodes.forEach(n => { if (n.nodeType === 3) username += n.textContent; });
            username = username.trim();
        }
        if (!username) username = '未知用户';
        const avatarEl = itemEl.querySelector('.avatarNeue');
        let avatarUrl = '';
        if (avatarEl) {
            const bg = contentWin.getComputedStyle(avatarEl).backgroundImage;
            if (bg && bg !== 'none') avatarUrl = bg.replace(/url\(["']?([^"']+)["']?\)/, '$1');
            if (!avatarUrl) {
                const m = (avatarEl.getAttribute('style') || '').match(/background-image:\s*url\(["']?([^"']+)["']?\)/);
                if (m) avatarUrl = m[1];
            }
        }
        const ratingMatch = itemEl.querySelector('.starlight')?.className.match(/stars(\d+)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
        const timeEl = itemEl.querySelector('p.info');
        const time = timeEl ? (timeEl.textContent.trim().match(/\d{4}-\d+-\d+\s+\d+:\d+/)?.[0] || timeEl.textContent.trim()) : '';
        const container = itemEl.querySelector('.userContainer');
        let rawText = '';
        if (container) {
            let afterInfo = false;
            container.childNodes.forEach(n => {
                if (n.nodeType === 1 && n.tagName === 'P' && n.classList.contains('info')) { afterInfo = true; return; }
                if (afterInfo) rawText += n.nodeType === 3 ? n.textContent : (n.innerText || n.textContent || '');
            });
            rawText = rawText.trim();
        }
        const truncated = rawText.length > 150;
        const contentHtml = truncated ? rawText.substring(0, 150) + '...' : rawText;
        return { username, userSlug, avatarUrl, rating, time, content: contentHtml, contentHtml };
    }

    const COLLECTION_PAGE_STATUS = { collections: '看过', wishes: '想看', doings: '在看', on_hold: '搁置', dropped: '抛弃' };

    async function createCollectionPageShareImage(itemEl, contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;
        const subjectIdMatch = contentWin.location.pathname.match(/\/subject\/(\d+)/);
        if (!subjectIdMatch) return;
        const subjectId = subjectIdMatch[1];
        const subjectData = await fetchSubjectDataById(subjectId);
        const pureTitle = subjectData?.name || contentDoc.title?.split(/\s*[|／/]\s*/)[0].trim() || '作品';
        const charImageUrl = subjectData?.imageUrl || '';
        const badgeLabel = subjectData?.type || '作品';
        const commentInfo = extractCollectionPageItemInfo(itemEl, contentWin);
        let userTags = null;
        if (commentInfo.userSlug) {
            const collection = await fetchBangumiAPI(`users/${commentInfo.userSlug}/collections/${subjectId}`);
            if (collection) {
                if (!commentInfo.rating) commentInfo.rating = collection.rate || 0;
                if (!commentInfo.time && collection.updated_at) {
                    const d = new Date(collection.updated_at);
                    const pad = n => String(n).padStart(2, '0');
                    commentInfo.time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                if (collection.tags?.length > 0) userTags = collection.tags;
            }
        }
        if (!commentInfo.time) commentInfo.time = '未知时间';
        const pageType = contentWin.location.pathname.match(/\/subject\/\d+\/(\w+)/)?.[1] || '';
        const collectionStatus = COLLECTION_PAGE_STATUS[pageType] || '';
        const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
            .map(key => getInfoboxValue(subjectData?.infobox, key))
            .filter(Boolean);
        const overrideTags = userTags
            ? [collectionStatus, ...userTags].filter(Boolean)
            : [collectionStatus, ...infoboxTags].filter(Boolean);
        await _doShareCard({
            username: '', postTime: '', avatarUrl: '', contentEl: null,
            pureTitle, contentDoc, contentWin, dark,
            replies: [commentInfo], replyId: '',
            charImageUrl, badgeLabel, overrideTags
        });
    }

    async function createShareImage(contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;

        const isBlog = /\/blog\/\d+/.test(contentWin.location.pathname);
        const isEpisode = /\/ep\/\d+/.test(contentWin.location.pathname);
        const isCharacter = /\/character\/\d+|\/rakuen\/topic\/crt\/\d+/.test(contentWin.location.pathname);
        const isPerson = /\/person\/\d+|\/rakuen\/topic\/prsn\/\d+/.test(contentWin.location.pathname);
        const subjectTopicId = getSubjectIdFromTopicPage(contentWin.location.pathname, contentDoc);
        const isSubjectTopic = !!subjectTopicId;

        let username, postTime, avatarUrl, contentEl;
        if (isEpisode || isCharacter || isPerson) {
            username = ""; postTime = ""; avatarUrl = ""; contentEl = null;
        } else if (isBlog) {
            const authorLink = contentDoc.querySelector('.author.user-card .title p a')
                || contentDoc.querySelector('.author.user-card a.avatar');
            username = authorLink ? authorLink.textContent.trim() : "未知用户";
            const timeEl = contentDoc.querySelector('.header .tools .time');
            postTime = timeEl ? (timeEl.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";
            const avatarImg = contentDoc.querySelector('.author.user-card a.avatar img');
            avatarUrl = avatarImg ? avatarImg.src : "";
            contentEl = contentDoc.querySelector('#entry_content');
        } else {
            const firstPost = contentDoc.querySelector('.postTopic') || contentDoc.querySelector('[id^="post_"]');
            const idNode = firstPost?.querySelector('strong a') || firstPost?.querySelector('.author strong a');
            username = idNode ? idNode.innerText.trim() : "未知用户";
            const timeNode = firstPost?.querySelector('small');
            postTime = timeNode ? (timeNode.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";
            const avatarBox = firstPost?.querySelector('.avatarSize48');
            avatarUrl = avatarBox ? contentWin.getComputedStyle(avatarBox).backgroundImage.replace(/url\(["']?([^"']+)["']?\)/, '$1') : "";
            contentEl = firstPost?.querySelector('.topic_content') || firstPost?.querySelector('.inner');
        }

        const h1Node = contentDoc.querySelector('#pageHeader h1') || contentDoc.querySelector('h1.title') || contentDoc.querySelector('h1.nameSingle a') || contentDoc.querySelector('h1');
        let pureTitle = "";
        if (h1Node) h1Node.childNodes.forEach(n => { if (n.nodeType === 3) pureTitle += n.textContent; });
        pureTitle = pureTitle.replace(/[»\n]/g, '').trim();
        if (!pureTitle) {
            const rawTitle = (contentDoc.title || '').split(/\s*[|／/]\s*/)[0].trim();
            pureTitle = rawTitle || "分享话题";
        }

        let charImageUrl = (isCharacter || isPerson) ? extractCharImageUrl(contentDoc) : '';
        let badgeLabel = '';
        let topicTitle = '';
        if (isCharacter) badgeLabel = '角色';
        if (isPerson) {
            const subtitleEl = contentDoc.querySelector('h2.subtitle');
            const subtitleText = subtitleEl ? subtitleEl.textContent.trim() : '';
            badgeLabel = subtitleText.replace(/^[^:：]*[:：]\s*/, '').trim() || '人物';
        }
        if ((isCharacter || isPerson) && (!charImageUrl || /\/rakuen\/topic\/(crt|prsn)\//.test(contentWin.location.pathname))) {
            const apiData = await getRakuenCharPersonData(contentWin.location.pathname);
            if (apiData) {
                if (!charImageUrl) charImageUrl = apiData.imageUrl;
                if (!badgeLabel || badgeLabel === '人物') badgeLabel = apiData.badgeLabel;
            }
        }
        if (isEpisode) {
            const epIdMatch = contentWin.location.pathname.match(/\/ep\/(\d+)/);
            if (epIdMatch) {
                const epData = await fetchEpisodeData(epIdMatch[1]);
                if (epData) {
                    if (epData.episodeName) pureTitle = epData.episodeName;
                    if (epData.subjectImageUrl) charImageUrl = epData.subjectImageUrl;
                    badgeLabel = epData.epNumber ? `第${epData.epNumber}话` : '章节';
                }
            }
        }
        if (isSubjectTopic) {
            const subjectData = await fetchSubjectDataById(subjectTopicId);
            if (subjectData) {
                topicTitle = pureTitle;
                pureTitle = subjectData.name || pureTitle;
                charImageUrl = subjectData.imageUrl || '';
                badgeLabel = subjectData.type || '';
            }
        }
        if (isBlog) {
            const blogSubjectIds = [...new Set(
                [...contentDoc.querySelectorAll('a[href]')]
                    .map(a => (a.getAttribute('href') || '').match(/\/subject\/(\d+)$/)?.[1])
                    .filter(Boolean)
            )];
            if (blogSubjectIds.length === 1) {
                const subjectData = await fetchSubjectDataById(blogSubjectIds[0]);
                if (subjectData) {
                    topicTitle = pureTitle;
                    pureTitle = subjectData.name || pureTitle;
                    charImageUrl = subjectData.imageUrl || '';
                    badgeLabel = subjectData.type || '';
                }
            }
        }
        await _doShareCard({ username, postTime, avatarUrl, contentEl, pureTitle, contentDoc, contentWin, dark, charImageUrl, badgeLabel, topicTitle });
    }

    function truncateHtml(html, limit) {
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        let count = 0, done = false;
        const walk = (node) => {
            if (done) { node.remove(); return; }
            if (node.nodeType === 3) {
                const rem = limit - count;
                if (node.textContent.length > rem) {
                    node.textContent = node.textContent.substring(0, rem) + '...';
                    done = true;
                } else { count += node.textContent.length; }
                return;
            }
            if (node.nodeType !== 1) return;
            [...node.childNodes].forEach(c => walk(c));
        };
        [...tmp.childNodes].forEach(c => walk(c));
        return tmp.innerHTML;
    }

    function extractPostInfo(postEl, contentWin) {
        const idNode = postEl.querySelector('.userInfo strong a') || postEl.querySelector('.userName a') || postEl.querySelector('strong a');
        const username = idNode ? idNode.innerText.trim() : "未知用户";
        const timeNode = postEl.querySelector('.post_actions.re_info small');
        const time = timeNode ? (timeNode.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";
        const avatarBox = postEl.querySelector('.avatarReSize40') || postEl.querySelector('.avatarReSize32') || postEl.querySelector('.avatarSize48');
        let avatarUrl = "";
        if (avatarBox) {
            const bg = contentWin.getComputedStyle(avatarBox).backgroundImage;
            if (bg && bg !== 'none') avatarUrl = bg.replace(/url\(["']?([^"']+)["']?\)/, '$1');
            if (!avatarUrl) {
                const m = (avatarBox.getAttribute('style') || '').match(/background-image:\s*url\(["']?([^"']+)["']?\)/);
                if (m) avatarUrl = m[1];
            }
        }
        if (!avatarUrl) {
            const anyBg = postEl.querySelector('[style*="background-image"]');
            if (anyBg) {
                const m = (anyBg.getAttribute('style') || '').match(/background-image:\s*url\(["']?([^"']+)["']?\)/);
                if (m) avatarUrl = m[1];
            }
        }
        if (!avatarUrl) {
            const avatarImg = postEl.querySelector('a.avatar img') || postEl.querySelector('[href*="/user/"] img') || postEl.querySelector('img[src*="/pic/user"]');
            if (avatarImg) avatarUrl = avatarImg.src;
        }
        const contentEl = postEl.querySelector('.reply_content .message') || postEl.querySelector('.cmt_sub_content') || postEl.querySelector('.topic_content');
        const contentClone = contentEl ? contentEl.cloneNode(true) : null;
        contentClone?.querySelectorAll('.embed-play-btn, .embed-player-wrapper, iframe').forEach(el => el.remove());
        const quoteEl = contentClone?.querySelector('.quote');
        const savedQuoteHtml = quoteEl ? quoteEl.outerHTML : '';
        const bodyClone = contentClone?.cloneNode(true);
        bodyClone?.querySelector('.quote')?.remove();
        const bodyText = bodyClone?.innerText?.trim() || "";
        const rawText = contentClone?.innerText?.trim() || "";
        const truncated = bodyText.length > 150;
        const contentHtml = truncated
            ? savedQuoteHtml + truncateHtml(bodyClone?.innerHTML?.trim() || "", 150)
            : (contentEl?.innerHTML?.trim() || "");
        return { username, time, avatarUrl, content: truncated ? rawText.substring(0, 150) + "..." : rawText, contentHtml };
    }

    async function createReplyShareImage(replyEl, contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;

        // Main post (楼主) data
        const isBlog = /\/blog\/\d+/.test(contentWin.location.pathname);
        const isEpisode = /\/ep\/\d+/.test(contentWin.location.pathname);
        const isCharacter = /\/character\/\d+|\/rakuen\/topic\/crt\/\d+/.test(contentWin.location.pathname);
        const isPerson = /\/person\/\d+|\/rakuen\/topic\/prsn\/\d+/.test(contentWin.location.pathname);
        const subjectTopicId = getSubjectIdFromTopicPage(contentWin.location.pathname, contentDoc);
        const isSubjectTopic = !!subjectTopicId;
        let username, postTime, avatarUrl, contentEl;
        if (isEpisode || isCharacter || isPerson) {
            username = ""; postTime = ""; avatarUrl = ""; contentEl = null;
        } else if (isBlog) {
            const authorLink = contentDoc.querySelector('.author.user-card .title p a') || contentDoc.querySelector('.author.user-card a.avatar');
            username = authorLink ? authorLink.textContent.trim() : "未知用户";
            const timeEl = contentDoc.querySelector('.header .tools .time');
            postTime = timeEl ? (timeEl.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";
            const avatarImg = contentDoc.querySelector('.author.user-card a.avatar img');
            avatarUrl = avatarImg ? avatarImg.src : "";
            contentEl = contentDoc.querySelector('#entry_content');
        } else {
            const firstPost = contentDoc.querySelector('.postTopic') || contentDoc.querySelector('[id^="post_"]');
            const mainIdNode = firstPost?.querySelector('strong a') || firstPost?.querySelector('.author strong a');
            username = mainIdNode ? mainIdNode.innerText.trim() : "未知用户";
            const mainTimeNode = firstPost?.querySelector('small');
            postTime = mainTimeNode ? (mainTimeNode.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";
            const mainAvatarBox = firstPost?.querySelector('.avatarSize48');
            avatarUrl = mainAvatarBox ? contentWin.getComputedStyle(mainAvatarBox).backgroundImage.replace(/url\(["']?([^"']+)["']?\)/, '$1') : "";
            contentEl = firstPost?.querySelector('.topic_content') || firstPost?.querySelector('.inner');
        }

        // Build replies chain: if sub-reply, prepend the parent reply first
        const replies = [];
        const parentPost = replyEl.closest('.topic_sub_reply')?.closest('[id^="post_"]');
        if (parentPost) {
            replies.push(extractPostInfo(parentPost, contentWin));
        }
        replies.push(extractPostInfo(replyEl, contentWin));

        const h1Node = contentDoc.querySelector('#pageHeader h1') || contentDoc.querySelector('h1.title') || contentDoc.querySelector('h1.nameSingle a') || contentDoc.querySelector('h1');
        let pureTitle = "";
        if (h1Node) h1Node.childNodes.forEach(n => { if (n.nodeType === 3) pureTitle += n.textContent; });
        pureTitle = pureTitle.replace(/[»\n]/g, '').trim();
        if (!pureTitle) {
            const rawTitle = (contentDoc.title || '').split(/\s*[|／/]\s*/)[0].trim();
            pureTitle = rawTitle || "分享话题";
        }

        let charImageUrl = (isCharacter || isPerson) ? extractCharImageUrl(contentDoc) : '';
        let badgeLabel = '';
        let topicTitle = '';
        if (isCharacter) badgeLabel = '角色';
        if (isPerson) {
            const subtitleEl = contentDoc.querySelector('h2.subtitle');
            const subtitleText = subtitleEl ? subtitleEl.textContent.trim() : '';
            badgeLabel = subtitleText.replace(/^[^:：]*[:：]\s*/, '').trim() || '人物';
        }
        if ((isCharacter || isPerson) && (!charImageUrl || /\/rakuen\/topic\/(crt|prsn)\//.test(contentWin.location.pathname))) {
            const apiData = await getRakuenCharPersonData(contentWin.location.pathname);
            if (apiData) {
                if (!charImageUrl) charImageUrl = apiData.imageUrl;
                if (!badgeLabel || badgeLabel === '人物') badgeLabel = apiData.badgeLabel;
            }
        }
        if (isEpisode) {
            const epIdMatch = contentWin.location.pathname.match(/\/ep\/(\d+)/);
            if (epIdMatch) {
                const epData = await fetchEpisodeData(epIdMatch[1]);
                if (epData) {
                    if (epData.episodeName) pureTitle = epData.episodeName;
                    if (epData.subjectImageUrl) charImageUrl = epData.subjectImageUrl;
                    badgeLabel = epData.epNumber ? `第${epData.epNumber}话` : '章节';
                }
            }
        }
        if (isSubjectTopic) {
            const subjectData = await fetchSubjectDataById(subjectTopicId);
            if (subjectData) {
                topicTitle = pureTitle;
                pureTitle = subjectData.name || pureTitle;
                charImageUrl = subjectData.imageUrl || '';
                badgeLabel = subjectData.type || '';
            }
        }
        if (isBlog) {
            const blogSubjectIds = [...new Set(
                [...contentDoc.querySelectorAll('a[href]')]
                    .map(a => (a.getAttribute('href') || '').match(/\/subject\/(\d+)$/)?.[1])
                    .filter(Boolean)
            )];
            if (blogSubjectIds.length === 1) {
                const subjectData = await fetchSubjectDataById(blogSubjectIds[0]);
                if (subjectData) {
                    topicTitle = pureTitle;
                    pureTitle = subjectData.name || pureTitle;
                    charImageUrl = subjectData.imageUrl || '';
                    badgeLabel = subjectData.type || '';
                }
            }
        }
        await _doShareCard({ username, postTime, avatarUrl, contentEl, pureTitle, contentDoc, contentWin, dark,
            replies, replyId: replyEl.id, charImageUrl, badgeLabel, topicTitle });
    }

    const REPLY_SHARE_BTN_CLASS = 'bgm-reply-share-btn';
    const SHARE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

    const insertReplyButtons = (targetDoc = document) => {
        targetDoc.querySelectorAll('[id^="post_"]').forEach(post => {
            if (post.classList.contains('postTopic')) return;
            const reInfo = post.querySelector('.post_actions.re_info');
            if (!reInfo || post.querySelector('.' + REPLY_SHARE_BTN_CLASS)) return;
            const wrap = targetDoc.createElement('span');
            wrap.className = 'action';
            wrap.innerHTML = `<a href="javascript:void(0);" class="${REPLY_SHARE_BTN_CLASS} icon" title="分享回复" style="display:inline-flex;align-items:center;gap:3px;">${SHARE_SVG}<span class="title">分享</span></a>`;
            const dropdowns = reInfo.querySelectorAll('.action.dropdown');
            const moreMenu = dropdowns[dropdowns.length - 1];
            moreMenu ? reInfo.insertBefore(wrap, moreMenu) : reInfo.appendChild(wrap);
            wrap.querySelector('a').addEventListener('click', () => createReplyShareImage(post, targetDoc));
        });
    };

    const insertButton = (targetDoc = document) => {
        if (targetDoc.getElementById('gen-card-btn')) return;

        const postActions = targetDoc.querySelector('.entry-actions .post_actions')
            || targetDoc.querySelector('.postTopic .post_actions:not(.re_info)')
            || targetDoc.querySelector('[id^="post_"] .post_actions:not(.re_info)')
            || [...targetDoc.querySelectorAll('.post_actions:not(.re_info)')].find(el => !el.closest('#sliderContainer') && !el.closest('#comment_box') && !el.closest('#timeline') && !el.closest('.statusContent'));
        if (postActions) {
            const wrap = targetDoc.createElement('span');
            wrap.className = 'action';
            wrap.innerHTML = '<a href="javascript:void(0);" id="gen-card-btn" class="icon" title="分享话题" style="display:inline-flex;align-items:center;gap:3px;"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg><span class="title">分享</span></a>';
            postActions.appendChild(wrap);
            targetDoc.getElementById('gen-card-btn').addEventListener('click', () => createShareImage(targetDoc));
            return;
        }

        // 降级：插入普通页面侧栏（仅非 Rakuen 场景）
        if (targetDoc === document) {
            const menuInner = document.querySelector('#columnInSubjectB .menu_inner')
                || document.querySelector('#columnSubjectB .menu_inner');
            if (menuInner) {
                const br = document.createElement('br');
                const btn = document.createElement('a');
                btn.id = 'gen-card-btn';
                btn.href = 'javascript:void(0);';
                btn.className = 'l';
                btn.textContent = '/ 分享';
                menuInner.appendChild(br);
                menuInner.appendChild(btn);
                btn.addEventListener('click', () => createShareImage(document));
            }
        }
    };

    async function createMyCollectionShareImage(targetDoc) {
        const dark = targetDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = targetDoc.defaultView || window;
        const subjectIdMatch = contentWin.location.pathname.match(/\/subject\/(\d+)/);
        if (!subjectIdMatch) return;
        const subjectId = subjectIdMatch[1];

        const commentText = (targetDoc.querySelector('textarea#comment')?.value || '').trim();
        if (!commentText) return;

        const collectLink = targetDoc.querySelector('.shareBtn a[href*="/user/"]');
        const userSlug = collectLink?.getAttribute('href').match(/\/user\/([^\/\?]+)/)?.[1] || '';

        let avatarUrl = '';
        let username = userSlug;
        if (userSlug) {
            const userInfo = await fetchBangumiAPI(`users/${userSlug}`);
            if (userInfo) {
                avatarUrl = userInfo.avatar?.medium || userInfo.avatar?.large || userInfo.avatar?.small || '';
                username = userInfo.nickname || userInfo.username || userSlug;
            }
        }

        const ratedInput = targetDoc.querySelector('#panelInterestWrapper input[name="rate"]:checked');
        const rating = ratedInput ? parseInt(ratedInput.value) : 0;

        const timeEl = targetDoc.querySelector('#panelInterestWrapper p.tip');
        const timeText = timeEl ? (timeEl.textContent.match(/\d{4}-\d+-\d+\s+\d+:\d+/)?.[0] || '') : '';

        const interestNow = targetDoc.querySelector('.interest_now')?.textContent.trim() || '';
        const statusKeys = ['看过', '在看', '想看', '玩过', '在玩', '想玩', '读过', '在读', '想读', '听过', '在听', '想听', '搁置', '抛弃'];
        const collectionStatus = statusKeys.find(k => interestNow.includes(k)) || '';

        const subjectData = await fetchSubjectDataById(subjectId);
        const pureTitle = subjectData?.name || targetDoc.title?.split(/\s*[|／/]\s*/)[0].trim() || '作品';
        const charImageUrl = subjectData?.imageUrl || '';
        const badgeLabel = subjectData?.type || '作品';

        const domTagsRaw = (targetDoc.querySelector('#collectBoxForm input[name="tags"]')?.value || '').trim();
        const domTags = domTagsRaw ? domTagsRaw.split(/[\s,，]+/).map(t => t.trim()).filter(Boolean) : [];
        const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
            .map(key => getInfoboxValue(subjectData?.infobox, key))
            .filter(Boolean);
        const overrideTags = domTags.length > 0
            ? [collectionStatus, ...domTags].filter(Boolean)
            : [collectionStatus, ...infoboxTags].filter(Boolean);

        const truncated = commentText.length > 150;
        const contentHtml = truncated ? commentText.substring(0, 150) + '...' : commentText;

        await _doShareCard({
            username: '', postTime: '', avatarUrl: '', contentEl: null,
            pureTitle, contentDoc: targetDoc, contentWin, dark,
            replies: [{ username, time: timeText, avatarUrl, rating, content: contentHtml, contentHtml }],
            charImageUrl, badgeLabel, overrideTags
        });
    }

    const insertMyCollectionShareButton = (targetDoc = document) => {
        if (targetDoc.getElementById('bgm-my-collection-share-btn')) return;
        const shareBtn = targetDoc.querySelector('.shareBtn');
        if (!shareBtn) return;
        const commentText = (targetDoc.querySelector('textarea#comment')?.value || '').trim();
        if (!commentText) return;
        shareBtn.querySelector('.share_pasteboard')?.closest('.action')?.remove();
        shareBtn.querySelector('.shareText')?.remove();
        shareBtn.querySelectorAll('a.share').forEach(el => el.remove());
        const wrap = targetDoc.createElement('span');
        wrap.className = 'action';
        wrap.innerHTML = `<a href="javascript:void(0);" id="bgm-my-collection-share-btn" class="icon" title="分享我的吐槽" style="display:inline-flex;align-items:center;gap:3px;">${SHARE_SVG}<span class="title">分享</span></a>`;
        shareBtn.appendChild(wrap);
        wrap.querySelector('a').addEventListener('click', () => createMyCollectionShareImage(targetDoc));
    };

    const SUBJECT_COMMENT_SHARE_BTN_CLASS = 'bgm-subject-comment-share-btn';

    const insertSubjectCommentButtons = (targetDoc = document) => {
        targetDoc.querySelectorAll('#comment_box .item.clearit').forEach(item => {
            if (item.querySelector('.' + SUBJECT_COMMENT_SHARE_BTN_CLASS)) return;
            const postActions = item.querySelector('.post_actions');
            if (!postActions) return;
            const wrap = targetDoc.createElement('span');
            wrap.className = 'action';
            wrap.innerHTML = `<a href="javascript:void(0);" class="${SUBJECT_COMMENT_SHARE_BTN_CLASS} icon" title="分享吐槽" style="display:inline-flex;align-items:center;gap:3px;">${SHARE_SVG}<span class="title">分享</span></a>`;
            postActions.appendChild(wrap);
            wrap.querySelector('a').addEventListener('click', () => createSubjectCommentShareImage(item, targetDoc));
        });
    };

    const COLLECTION_PAGE_SHARE_BTN_CLASS = 'bgm-collection-page-share-btn';

    const insertCollectionPageButtons = (targetDoc = document) => {
        if (!Object.keys(COLLECTION_PAGE_STATUS).some(k =>
            new RegExp(`/subject/\\d+/${k}`).test((targetDoc.defaultView || window).location.pathname)
        )) return;
        targetDoc.querySelectorAll('#memberUserList li.user').forEach(item => {
            if (item.querySelector('.' + COLLECTION_PAGE_SHARE_BTN_CLASS)) return;
            const container = item.querySelector('.userContainer');
            if (!container) return;
            let hasComment = false;
            let afterInfo = false;
            container.childNodes.forEach(n => {
                if (n.nodeType === 1 && n.tagName === 'P' && n.classList.contains('info')) { afterInfo = true; return; }
                if (afterInfo && n.nodeType === 3 && n.textContent.trim()) hasComment = true;
            });
            if (!hasComment) return;
            const infoEl = item.querySelector('p.info');
            if (!infoEl) return;
            const btn = targetDoc.createElement('a');
            btn.href = 'javascript:void(0);';
            btn.className = COLLECTION_PAGE_SHARE_BTN_CLASS + ' icon';
            btn.title = '分享吐槽';
            btn.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:12px;';
            btn.innerHTML = SHARE_SVG + '<span class="title">分享</span>';
            infoEl.appendChild(btn);
            btn.addEventListener('click', () => createCollectionPageShareImage(item, targetDoc));
        });
    };

    const BROWSER_LIST_CATEGORY_STATUS = {
        anime: { do: '在看', collect: '看过', wish: '想看', on_hold: '搁置', dropped: '抛弃' },
        music: { do: '在听', collect: '听过', wish: '想听', on_hold: '搁置', dropped: '抛弃' },
        game:  { do: '在玩', collect: '玩过', wish: '想玩', on_hold: '搁置', dropped: '抛弃' },
        real:  { do: '在看', collect: '看过', wish: '想看', on_hold: '搁置', dropped: '抛弃' },
        book:  { do: '在读', collect: '读过', wish: '想读', on_hold: '搁置', dropped: '抛弃' }
    };

    function extractBrowserListItemInfo(itemEl, contentWin) {
        const subjectId = itemEl.id?.replace('item_', '') || '';
        const ratingMatch = itemEl.querySelector('.starlight')?.className.match(/stars(\d+)/);
        const rating = ratingMatch ? parseInt(ratingMatch[1]) : 0;
        const time = itemEl.querySelector('.tip_j')?.textContent.trim() || '';
        const tagsRaw = itemEl.querySelector('p.collectInfo .tip')?.textContent.replace(/^[^:：]*[:：]\s*/, '').trim() || '';
        const domTags = tagsRaw ? tagsRaw.split(/\s+/).filter(Boolean) : [];
        const commentEl = itemEl.querySelector('#comment_box .text');
        const rawText = commentEl?.textContent.trim() || '';
        const truncated = rawText.length > 150;
        const contentHtml = truncated ? rawText.substring(0, 150) + '...' : rawText;
        return { subjectId, rating, time, domTags, content: contentHtml, contentHtml };
    }

    async function createBrowserListShareImage(itemEl, contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;
        const m = contentWin.location.pathname.match(/\/(anime|music|game|real|book)\/list\/([^\/]+)\/(do|collect|wish|on_hold|dropped)/);
        if (!m) return;
        const [, category, userSlug, statusKey] = m;
        const collectionStatus = BROWSER_LIST_CATEGORY_STATUS[category]?.[statusKey] || '';
        const itemInfo = extractBrowserListItemInfo(itemEl, contentWin);
        if (!itemInfo.subjectId) return;
        const [subjectData, userInfo] = await Promise.all([
            fetchSubjectDataById(itemInfo.subjectId),
            fetchBangumiAPI(`users/${userSlug}`)
        ]);
        const categoryTypeMap = { anime: '动画', music: '音乐', game: '游戏', real: '三次元', book: '书籍' };
        let pureTitle = subjectData?.name || '';
        let charImageUrl = subjectData?.imageUrl || '';
        let badgeLabel = subjectData?.type || '';
        if (!subjectData) {
            _shareNotice = 'NSFW 条目 API 无权访问，已降级为页面数据，部分信息可能不完整';
            pureTitle = itemEl.querySelector('h3 a.l')?.textContent.trim() || '';
            const coverImg = itemEl.querySelector('.subjectCover img');
            charImageUrl = coverImg?.src || coverImg?.dataset.src || '';
            badgeLabel = categoryTypeMap[category] || '作品';
        }
        if (!badgeLabel) badgeLabel = categoryTypeMap[category] || '作品';
        let username = userInfo?.nickname || userInfo?.username || userSlug;
        let avatarUrl = userInfo?.avatar?.medium || userInfo?.avatar?.large || '';
        let userTags = null;
        if (userSlug) {
            const collection = await fetchBangumiAPI(`users/${userSlug}/collections/${itemInfo.subjectId}`);
            if (collection) {
                if (!itemInfo.rating) itemInfo.rating = collection.rate || 0;
                if (!itemInfo.time && collection.updated_at) {
                    const d = new Date(collection.updated_at);
                    const pad = n => String(n).padStart(2, '0');
                    itemInfo.time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                if (collection.tags?.length > 0) userTags = collection.tags;
            }
        }
        if (!itemInfo.time) itemInfo.time = '未知时间';
        const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
            .map(key => getInfoboxValue(subjectData?.infobox, key))
            .filter(Boolean);
        const effectiveTags = userTags || (itemInfo.domTags.length > 0 ? itemInfo.domTags : null);
        const overrideTags = effectiveTags
            ? [collectionStatus, ...effectiveTags].filter(Boolean)
            : [collectionStatus, ...infoboxTags].filter(Boolean);
        await _doShareCard({
            username: '', postTime: '', avatarUrl: '', contentEl: null,
            pureTitle, contentDoc, contentWin, dark,
            replies: [{ username, time: itemInfo.time, avatarUrl, rating: itemInfo.rating, content: itemInfo.content, contentHtml: itemInfo.contentHtml }],
            charImageUrl, badgeLabel, overrideTags
        });
    }

    const BROWSER_LIST_SHARE_BTN_CLASS = 'bgm-browser-list-share-btn';

    const insertBrowserListButtons = (targetDoc = document) => {
        const pathname = (targetDoc.defaultView || window).location.pathname;
        if (!/\/(anime|music|game|real|book)\/list\/[^\/]+\/(do|collect|wish|on_hold|dropped)/.test(pathname)) return;
        targetDoc.querySelectorAll('#browserItemList li.item').forEach(item => {
            if (item.querySelector('.' + BROWSER_LIST_SHARE_BTN_CLASS)) return;
            const commentEl = item.querySelector('#comment_box .text');
            if (!commentEl?.textContent.trim()) return;
            const modifyP = item.querySelector('p.collectModify');
            if (!modifyP) return;
            modifyP.appendChild(targetDoc.createTextNode(' | '));
            const btn = targetDoc.createElement('a');
            btn.href = 'javascript:void(0);';
            btn.className = BROWSER_LIST_SHARE_BTN_CLASS + ' l';
            btn.style.cssText = 'display:inline-flex;align-items:center;gap:3px;vertical-align:middle;';
            btn.innerHTML = SHARE_SVG + '<span>分享</span>';
            modifyP.appendChild(btn);
            btn.addEventListener('click', () => createBrowserListShareImage(item, targetDoc));
        });
    };

    function injectShareSettingsTab() {
        const panel = document.getElementById('customize-panel');
        if (!panel || panel.querySelector('[data-tab="bgm-topic-share"]')) return;
        const tabList = panel.querySelector('.panel-tabs .scrollable');
        const contentArea = panel.querySelector('.content');
        if (!tabList || !contentArea) return;

        tabList.style.overflowX = 'auto';
        tabList.style.scrollbarWidth = 'thin';
        tabList.style.flexWrap = 'nowrap';

        const tabLi = document.createElement('li');
        tabLi.innerHTML = '<a href="javascript:void(0);" class="tab-item" data-tab="bgm-topic-share">番组分享</a>';
        tabList.appendChild(tabLi);

        const token = getBgmToken();
        const aiUrl = GM_getValue('bgm_share_ai_url', '');
        const aiKey = GM_getValue('bgm_share_ai_key', '');
        const aiModel = GM_getValue('bgm_share_ai_model', '') || 'gpt-3.5-turbo';

        const tabDiv = document.createElement('div');
        tabDiv.className = 'tab-content';
        tabDiv.id = 'bgm-topic-share-tab';
        tabDiv.innerHTML = `
            <div class="section">
                <div class="title">Bangumi 授权（解锁 NSFW 数据）</div>
                <div class="options-container" style="flex-direction:column;align-items:flex-start;gap:10px;padding-top:8px;">
                    <div id="bgm-share-auth-status" style="font-size:13px;color:${token ? '#4caf50' : '#aaa'};">
                        ${token ? '✓ 已授权，API 请求将携带 Token' : '未授权 - NSFW 条目数据将降级为 DOM 抓取'}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <a id="bgm-share-auth-btn" href="javascript:void(0);" class="btnPink" style="${token ? 'display:none' : ''}">立即授权</a>
                        <a id="bgm-share-deauth-btn" href="javascript:void(0);" class="btnGraySmall" style="${token ? '' : 'display:none'}">撤销授权</a>
                    </div>
                </div>
            </div>
            <div class="section">
                <div class="title">AI 标签配置（可选）</div>
                <div style="display:flex;flex-direction:column;gap:10px;padding-top:8px;padding-right:10px;font-size:13px;">
                    <label>API URL<br><input id="bgm-share-ai-url" type="text" class="inputtext" style="width:100%;margin-top:4px;" value="${aiUrl}" placeholder="https://api.openai.com/v1/chat/completions"></label>
                    <label>API Key<br><input id="bgm-share-ai-key" type="password" class="inputtext" style="width:100%;margin-top:4px;" value="${aiKey}" placeholder="sk-..."></label>
                    <label>模型<br><input id="bgm-share-ai-model" type="text" class="inputtext" style="width:100%;margin-top:4px;" value="${aiModel}"></label>
                    <div style="display:flex;align-items:center;gap:10px;">
                        <a id="bgm-share-ai-save" href="javascript:void(0);" class="btnPink">保存</a>
                        <span id="bgm-share-ai-saved" style="color:#4caf50;display:none;font-size:12px;">✓ 已保存</span>
                    </div>
                </div>
            </div>`;
        contentArea.appendChild(tabDiv);

        const tabLink = tabLi.querySelector('a');
        tabLink.addEventListener('click', () => {
            panel.querySelectorAll('.tab-item').forEach(t => t.classList.remove('focus'));
            tabLink.classList.add('focus');
            panel.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tabDiv.classList.add('active');
        });
        tabDiv.querySelector('#bgm-share-auth-btn').addEventListener('click', startBgmOAuth);
        tabDiv.querySelector('#bgm-share-deauth-btn').addEventListener('click', () => {
            clearBgmToken();
            tabDiv.querySelector('#bgm-share-auth-status').textContent = '未授权 - NSFW 条目数据将降级为 DOM 抓取';
            tabDiv.querySelector('#bgm-share-auth-status').style.color = '#aaa';
            tabDiv.querySelector('#bgm-share-auth-btn').style.display = '';
            tabDiv.querySelector('#bgm-share-deauth-btn').style.display = 'none';
        });
        tabDiv.querySelector('#bgm-share-ai-save').addEventListener('click', () => {
            GM_setValue('bgm_share_ai_url', tabDiv.querySelector('#bgm-share-ai-url').value);
            GM_setValue('bgm_share_ai_key', tabDiv.querySelector('#bgm-share-ai-key').value);
            GM_setValue('bgm_share_ai_model', tabDiv.querySelector('#bgm-share-ai-model').value);
            const s = tabDiv.querySelector('#bgm-share-ai-saved');
            s.style.display = '';
            setTimeout(() => s.style.display = 'none', 2000);
        });
    }

    function _getStatusAuthorInfo(doc) {
        const usernameEl = doc.querySelector('.statusHeader h3 a');
        const username = usernameEl?.textContent.trim() || '';
        const avatarSpan = doc.querySelector('.statusHeader .avatarNeue');
        let avatarUrl = '';
        const bgImg = avatarSpan?.style.backgroundImage;
        if (bgImg) {
            const m = bgImg.match(/url\(['"]?([^'"]+)['"]?\)/);
            if (m) avatarUrl = m[1].replace(/^\/\//, 'https://');
        }
        const timeEl = doc.querySelector('.statusContent .post_actions .tip_j');
        const postTime = timeEl?.textContent.trim() || '';
        return { username, avatarUrl, postTime };
    }

    async function _buildCollectionStatusInfo(doc, contentWin, username, avatarUrl, postTime) {
        const statusContent = doc.querySelector('.statusContent');
        const subjectLink = statusContent?.querySelector('a[data-subject-id]');
        const subjectId = subjectLink?.getAttribute('data-subject-id');
        const collectComment = statusContent?.querySelector('.comment');
        if (!subjectId || !collectComment) return null;

        const userSlug = contentWin.location.pathname.match(/\/user\/([^\/]+)\//)?.[1] || '';
        let collectionStatus = '';
        if (subjectLink) {
            let node = subjectLink.previousSibling;
            while (node) {
                if (node.nodeType === 3 && node.textContent.trim()) { collectionStatus = node.textContent.trim().replace(/了$/, ''); break; }
                node = node.previousSibling;
            }
        }
        const ratingEl = collectComment.querySelector('.starstop-s .starlight');
        const domRating = parseInt(ratingEl?.className.match(/stars(\d+)/)?.[1] || '0');
        const cleanCommentHtml = (() => {
            const tmp = document.createElement('div');
            tmp.innerHTML = collectComment.innerHTML;
            tmp.querySelector('.starstop-s')?.remove();
            return tmp.innerHTML.trim();
        })();
        const subjectData = await fetchSubjectDataById(subjectId);
        const subjectName = subjectData?.name || subjectLink?.textContent.trim() || '作品';
        let rating = domRating, userTags = null, apiTime = postTime;
        if (userSlug) {
            const collection = await fetchBangumiAPI(`users/${userSlug}/collections/${subjectId}`);
            if (collection) {
                rating = collection.rate || rating;
                if (collection.updated_at) {
                    const d = new Date(collection.updated_at);
                    const pad = n => String(n).padStart(2, '0');
                    apiTime = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
                }
                if (collection.tags?.length > 0) userTags = collection.tags;
            }
        }
        const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
            .map(key => getInfoboxValue(subjectData?.infobox, key)).filter(Boolean);
        const overrideTags = userTags
            ? [collectionStatus, ...userTags].filter(Boolean)
            : [collectionStatus, ...infoboxTags].filter(Boolean);
        return { subjectData, subjectName, collectComment, cleanCommentHtml, username, avatarUrl, apiTime, rating, overrideTags };
    }

    async function createStatusShareImage(doc = document) {
        const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = doc.defaultView || window;
        const { username, avatarUrl, postTime } = _getStatusAuthorInfo(doc);
        const replyCount = doc.querySelectorAll('.subReply .reply_item').length;

        const collectInfo = await _buildCollectionStatusInfo(doc, contentWin, username, avatarUrl, postTime);
        if (collectInfo) {
            const { subjectData, subjectName, collectComment, cleanCommentHtml, apiTime, rating, overrideTags } = collectInfo;
            await _doShareCard({
                username: '', postTime: '', avatarUrl: '', contentEl: null,
                pureTitle: subjectName,
                shareTitle: `${username}的收藏 - ${subjectName}`,
                contentDoc: doc, contentWin, dark,
                replies: [{ username, avatarUrl, content: collectComment.innerText?.trim() || '', contentHtml: cleanCommentHtml, time: apiTime, rating }],
                charImageUrl: subjectData?.imageUrl || '',
                badgeLabel: subjectData?.type || '作品',
                overrideTags,
            });
        } else {
            const contentEl = doc.querySelector('.statusContent .text');
            await _doShareCard({
                username, postTime, avatarUrl, contentEl,
                pureTitle: username + '的吐槽', contentDoc: doc, contentWin, dark,
                noCardTitle: true,
                overrideTags: replyCount ? [`${replyCount} 回复`, '吐槽'] : ['吐槽'],
            });
        }
    }

    async function createStatusReplyShareImage(replyLi, doc = document) {
        const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = doc.defaultView || window;
        const { username, avatarUrl, postTime } = _getStatusAuthorInfo(doc);

        const replyUserEl = replyLi.querySelector('a.l[href*="/user/"]');
        const replyUsername = replyUserEl?.textContent.trim() || '';
        const replySlug = replyUserEl?.getAttribute('href')?.match(/\/user\/([^\/]+)/)?.[1] || '';
        let replyAvatarUrl = '';
        if (replySlug) {
            const userInfo = await fetchBangumiAPI(`users/${replySlug}`);
            replyAvatarUrl = userInfo?.avatar?.medium || userInfo?.avatar?.large || '';
        }
        let replyHtml = '';
        let afterDash = false;
        replyLi.childNodes.forEach(n => {
            if (!afterDash) {
                if (n.nodeType === 1 && n.tagName === 'SPAN' && n.classList.contains('tip_j')) afterDash = true;
                return;
            }
            if (n.nodeType === 1 && n.classList?.contains(STATUS_REPLY_SHARE_BTN_CLASS)) return;
            replyHtml += n.nodeType === 3 ? n.textContent : n.outerHTML;
        });

        const replyCount = doc.querySelectorAll('.subReply .reply_item').length;
        const collectInfo = await _buildCollectionStatusInfo(doc, contentWin, username, avatarUrl, postTime);
        if (collectInfo) {
            const { subjectData, subjectName, collectComment, cleanCommentHtml, apiTime, rating, overrideTags } = collectInfo;
            await _doShareCard({
                username: '', postTime: '', avatarUrl: '', contentEl: null,
                pureTitle: subjectName,
                shareTitle: `${username}的收藏 - ${subjectName}`,
                contentDoc: doc, contentWin, dark,
                replies: [
                    { username, avatarUrl, content: collectComment.innerText?.trim() || '', contentHtml: cleanCommentHtml, time: apiTime, rating },
                    { username: replyUsername, avatarUrl: replyAvatarUrl, content: replyHtml.trim(), contentHtml: replyHtml.trim(), time: '' },
                ],
                charImageUrl: subjectData?.imageUrl || '',
                badgeLabel: subjectData?.type || '作品',
                overrideTags,
            });
        } else {
            const contentEl = doc.querySelector('.statusContent .text');
            await _doShareCard({
                username, postTime, avatarUrl, contentEl,
                pureTitle: username + '的吐槽', contentDoc: doc, contentWin, dark,
                noCardTitle: true,
                replies: [{ username: replyUsername, avatarUrl: replyAvatarUrl, content: replyHtml.trim(), contentHtml: replyHtml.trim(), time: '' }],
                overrideTags: replyCount ? [`${replyCount} 回复`, '吐槽'] : ['吐槽'],
            });
        }
    }

    const STATUS_REPLY_SHARE_BTN_CLASS = 'bgm-status-reply-share-btn';

    const insertStatusReplyButtons = (doc = document) => {
        if (!/\/user\/[^\/]+\/timeline\/status\/\d+/.test((doc.defaultView || window).location.pathname)) return;
        doc.querySelectorAll('.subReply .reply_item').forEach(li => {
            if (li.querySelector('.' + STATUS_REPLY_SHARE_BTN_CLASS)) return;
            const btn = doc.createElement('a');
            btn.href = 'javascript:void(0);';
            btn.className = STATUS_REPLY_SHARE_BTN_CLASS;
            btn.title = '分享回复';
            btn.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-left:6px;vertical-align:middle;opacity:0.6;';
            btn.innerHTML = SHARE_SVG;
            li.appendChild(btn);
            btn.addEventListener('click', () => createStatusReplyShareImage(li, doc));
        });
    };

    const insertStatusShareButton = (doc = document) => {
        if (!/\/user\/[^\/]+\/timeline\/status\/\d+/.test((doc.defaultView || window).location.pathname)) return;
        if (doc.getElementById('bgm-status-share-btn')) return;
        const postActions = doc.querySelector('.statusContent .post_actions');
        if (!postActions) return;
        const btn = doc.createElement('a');
        btn.id = 'bgm-status-share-btn';
        btn.href = 'javascript:void(0);';
        btn.title = '分享吐槽';
        btn.style.cssText = 'color:inherit;display:inline-flex;align-items:center;margin-right:6px;opacity:0.75;';
        btn.innerHTML = SHARE_SVG;
        const dropdown = postActions.querySelector('.action.dropdown');
        dropdown ? dropdown.after(btn) : postActions.appendChild(btn);
        btn.addEventListener('click', () => createStatusShareImage(doc));
    };

    const TML_SHARE_BTN_CLASS = 'bgm-tml-share-btn';

    function fetchStatusReplyCount(statusUrl) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: statusUrl,
                onload: res => {
                    if (res.status !== 200) { resolve(0); return; }
                    const statusDoc = new DOMParser().parseFromString(res.responseText, 'text/html');
                    resolve(statusDoc.querySelectorAll('.subReply .reply_item').length);
                },
                onerror: () => resolve(0),
            });
        });
    }

    function extractTimelineVia(postActionsEl) {
        if (!postActionsEl) return '';
        const smallEl = postActionsEl.querySelector('small.grey');
        if (smallEl) return smallEl.textContent.trim();
        const titleTip = postActionsEl.querySelector('.titleTip');
        let node = titleTip ? titleTip.nextSibling : null;
        while (node) {
            if (node.nodeType === 3) {
                const text = node.textContent.replace(/[\u00B7·\s]/g, '').trim();
                if (text) return text;
            }
            node = node.nextSibling;
        }
        return '';
    }

    async function createTimelineShareImage(item, doc = document) {
        const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = doc.defaultView || window;
        let userSlug = item.getAttribute('data-item-user') || '';
        if (!userSlug) {
            // Own-user timeline has data-item-user="" — extract from tml_comment href or page URL
            userSlug = item.querySelector('.tml_comment')?.href?.match(/\/user\/([^\/]+)\/timeline/)?.[1]
                || (doc.defaultView || window).location.pathname.match(/\/user\/([^\/]+)\/timeline/)?.[1]
                || '';
        }

        const userLink = item.querySelector('.info a.l[href*="/user/"], .info_full a.l[href*="/user/"]');
        let username = userLink?.textContent.trim() || '';

        const _extractNeueAvatar = el => {
            if (!el) return '';
            const m = el.style.backgroundImage?.match(/url\(['"]?([^'"]+)['"]?\)/);
            return m ? m[1].replace(/^\/\//, 'https://') : '';
        };
        let avatarUrl = _extractNeueAvatar(item.querySelector('.avatar .avatarNeue'));
        if (!avatarUrl && userSlug) {
            const siblingNeue = doc.querySelector(`.tml_item[data-item-user="${CSS.escape(userSlug)}"] .avatar .avatarNeue`);
            avatarUrl = _extractNeueAvatar(siblingNeue);
        }
        // For .info_full items (timeline owner's entries), there is no username link or avatar span —
        // always fetch from API so username is authoritative (not a stale DOM fallback).
        const isInfoFull = !!item.querySelector('.info_full');
        if ((isInfoFull || !avatarUrl || !username) && userSlug) {
            const userInfo = await fetchBangumiAPI(`users/${userSlug}`);
            if (!avatarUrl) avatarUrl = userInfo?.avatar?.medium || userInfo?.avatar?.large || '';
            if (isInfoFull || !username) username = userInfo?.nickname || userInfo?.username || username;
        }

        const timeTip = item.querySelector('.post_actions .titleTip');
        const postTimeRaw = timeTip?.getAttribute('data-original-title') || timeTip?.textContent.trim() || '';
        const via = extractTimelineVia(item.querySelector('.post_actions'));
        const postTime = postTimeRaw + (via ? `  via ${via}` : '');

        const statusP = item.querySelector('.info p.status, .info_full p.status');
        const collectComment = item.querySelector('.collectInfo .comment');
        const blogLink = item.querySelector('.info a[href*="/blog/"], .info_full a[href*="/blog/"]');

        if (statusP && statusP.textContent.trim()) {
            const statusUrl = item.querySelector('.tml_comment')?.href;
            const replyCount = statusUrl ? await fetchStatusReplyCount(statusUrl) : 0;
            await _doShareCard({
                username, postTime, avatarUrl,
                contentEl: statusP,
                pureTitle: username + '的吐槽',
                contentDoc: doc, contentWin, dark,
                noCardTitle: true,
                overrideTags: replyCount ? [`${replyCount} 回复`, '吐槽'] : ['吐槽'],
            });
        } else if (collectComment && collectComment.textContent.trim()) {
            // Subject link is in .info, carries data-subject-id attribute
            const subjectLink = item.querySelector('a[data-subject-id]');
            const subjectId = subjectLink?.getAttribute('data-subject-id');

            // Collection status ("看过"/"在看" etc.) is in the text node just before the subject link
            let collectionStatus = '';
            if (subjectLink) {
                let node = subjectLink.previousSibling;
                while (node) {
                    if (node.nodeType === 3 && node.textContent.trim()) {
                        collectionStatus = node.textContent.trim().replace(/了$/, '');
                        break;
                    }
                    node = node.previousSibling;
                }
            }

            // Extract user rating and clean comment HTML (remove star span)
            const ratingEl = collectComment.querySelector('.starstop-s .starlight');
            const domRating = parseInt(ratingEl?.className.match(/stars(\d+)/)?.[1] || '0');
            const cleanCommentHtml = (() => {
                const tmp = document.createElement('div');
                tmp.innerHTML = collectComment.innerHTML;
                tmp.querySelector('.starstop-s')?.remove();
                return tmp.innerHTML.trim();
            })();

            const statusUrl = item.querySelector('.tml_comment')?.href;
            const statusUrlParsed = statusUrl ? new URL(statusUrl) : null;

            if (subjectId) {
                const subjectData = await fetchSubjectDataById(subjectId);
                const subjectName = subjectData?.name || subjectLink?.textContent.trim() || '作品';

                let rating = domRating;
                let userTags = null;
                let apiTime = postTime;

                if (userSlug) {
                    const collection = await fetchBangumiAPI(`users/${userSlug}/collections/${subjectId}`);
                    if (collection) {
                        rating = collection.rate || rating;
                        if (collection.updated_at) {
                            const d = new Date(collection.updated_at);
                            const pad = n => String(n).padStart(2, '0');
                            apiTime = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` + (via ? `  via ${via}` : '');
                        }
                        if (collection.tags?.length > 0) userTags = collection.tags;
                    }
                }

                const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
                    .map(key => getInfoboxValue(subjectData?.infobox, key))
                    .filter(Boolean);
                const overrideTags = userTags
                    ? [collectionStatus, ...userTags].filter(Boolean)
                    : [collectionStatus, ...infoboxTags].filter(Boolean);

                await _doShareCard({
                    username: '', postTime: '', avatarUrl: '', contentEl: null,
                    pureTitle: subjectName,
                    shareTitle: `${username}的收藏 - ${subjectName}`,
                    contentDoc: doc,
                    contentWin: statusUrlParsed
                        ? { location: { origin: statusUrlParsed.origin, pathname: statusUrlParsed.pathname } }
                        : { location: { origin: contentWin.location.origin, pathname: `/subject/${subjectId}` } },
                    dark,
                    replies: [{ username, avatarUrl, content: collectComment.innerText?.trim() || '', contentHtml: cleanCommentHtml, time: apiTime, rating }],
                    charImageUrl: subjectData?.imageUrl || '',
                    badgeLabel: subjectData?.type || '作品',
                    overrideTags,
                });
            } else {
                await _doShareCard({
                    username, postTime, avatarUrl,
                    contentEl: collectComment,
                    pureTitle: username + '的收藏',
                    contentDoc: doc, contentWin, dark,
                    noCardTitle: true,
                    overrideTags: ['收藏'],
                });
            }
        } else if (blogLink) {
            const blogUrl = blogLink.href;
            const blogHtml = await new Promise(resolve => {
                GM_xmlhttpRequest({
                    method: 'GET', url: blogUrl,
                    onload: res => resolve(res.status === 200 ? res.responseText : null),
                    onerror: () => resolve(null),
                });
            });
            const blogDoc = blogHtml ? new DOMParser().parseFromString(blogHtml, 'text/html') : null;
            const entryContent = blogDoc?.querySelector('#entry_content');
            let contentEl = null;
            if (entryContent) {
                contentEl = document.createElement('div');
                contentEl.innerHTML = entryContent.innerHTML;
            }
            let pureTitle = blogLink.textContent.trim();
            let topicTitle = '';
            let charImageUrl = '';
            let badgeLabel = '';
            const blogSubjectIds = blogDoc ? [...new Set(
                [...blogDoc.querySelectorAll('a[href]')]
                    .map(a => (a.getAttribute('href') || '').match(/\/subject\/(\d+)$/)?.[1])
                    .filter(Boolean)
            )] : [];
            if (blogSubjectIds.length === 1) {
                const subjectData = await fetchSubjectDataById(blogSubjectIds[0]);
                if (subjectData) {
                    topicTitle = pureTitle;
                    pureTitle = subjectData.name || pureTitle;
                    charImageUrl = subjectData.imageUrl || '';
                    badgeLabel = subjectData.type || '';
                }
            }
            const blogReplyCount = blogDoc?.querySelectorAll('[id^="post_"]').length || 0;
            const subjectNamesFromBlog = blogDoc ? [...new Set(
                [...blogDoc.querySelectorAll('a')]
                    .filter(a => /\/subject\/\d+$/.test(a.getAttribute('href') || '') && a.textContent.trim())
                    .map(a => a.textContent.trim())
            )] : [];
            const tagSubjects = subjectNamesFromBlog.length === 1 ? [] : subjectNamesFromBlog;
            const overrideTags = [...tagSubjects, `${blogReplyCount} 回复`, '日志'];
            const blogUrlParsed = new URL(blogUrl);
            await _doShareCard({
                username, postTime, avatarUrl,
                contentEl,
                pureTitle,
                contentDoc: doc,
                contentWin: { location: { origin: blogUrlParsed.origin, pathname: blogUrlParsed.pathname } },
                dark,
                charImageUrl, badgeLabel, topicTitle,
                overrideTags,
            });
        }
    }

    const TML_REPLY_SHARE_BTN_CLASS = 'bgm-tml-reply-share-btn';

    async function createTimelineReplyShareImage(replyLi, tmlItem, doc = document) {
        const dark = doc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = doc.defaultView || window;

        let userSlug = tmlItem.getAttribute('data-item-user') || '';
        if (!userSlug) {
            userSlug = tmlItem.querySelector('.tml_comment')?.href?.match(/\/user\/([^\/]+)\/timeline/)?.[1]
                || (doc.defaultView || window).location.pathname.match(/\/user\/([^\/]+)\/timeline/)?.[1]
                || '';
        }
        const userLink = tmlItem.querySelector('.info a.l[href*="/user/"], .info_full a.l[href*="/user/"]');
        let username = userLink?.textContent.trim() || '';
        const _extractNeueAvatar = el => {
            if (!el) return '';
            const m = el.style.backgroundImage?.match(/url\(['"]?([^'"]+)['"]?\)/);
            return m ? m[1].replace(/^\/\//, 'https://') : '';
        };
        let avatarUrl = _extractNeueAvatar(tmlItem.querySelector('.avatar .avatarNeue'));
        if (!avatarUrl && userSlug) {
            const siblingNeue = doc.querySelector(`.tml_item[data-item-user="${CSS.escape(userSlug)}"] .avatar .avatarNeue`);
            avatarUrl = _extractNeueAvatar(siblingNeue);
        }
        const isInfoFull = !!tmlItem.querySelector('.info_full');
        if ((isInfoFull || !avatarUrl || !username) && userSlug) {
            const userInfo = await fetchBangumiAPI(`users/${userSlug}`);
            if (!avatarUrl) avatarUrl = userInfo?.avatar?.medium || userInfo?.avatar?.large || '';
            if (isInfoFull || !username) username = userInfo?.nickname || userInfo?.username || username;
        }

        const statusP = tmlItem.querySelector('.info p.status, .info_full p.status');
        const collectComment = tmlItem.querySelector('.collectInfo .comment');
        const contentEl = statusP || collectComment;
        const isCollect = !statusP && !!collectComment;

        const timeTip = tmlItem.querySelector('.post_actions .titleTip');
        const postTimeRaw = timeTip?.getAttribute('data-original-title') || timeTip?.textContent.trim() || '';
        const via = extractTimelineVia(tmlItem.querySelector('.post_actions'));
        const postTime = postTimeRaw + (via ? `  via ${via}` : '');

        const replyUserEl = replyLi.querySelector('a.l[href*="/user/"]');
        const replyUsername = replyUserEl?.textContent.trim() || '';
        const replySlug = replyUserEl?.getAttribute('href')?.match(/\/user\/([^\/]+)/)?.[1] || '';
        let replyAvatarUrl = '';
        if (replySlug) {
            const userInfo = await fetchBangumiAPI(`users/${replySlug}`);
            replyAvatarUrl = userInfo?.avatar?.medium || userInfo?.avatar?.large || '';
        }

        let replyHtml = '';
        let afterDash = false;
        replyLi.childNodes.forEach(n => {
            if (!afterDash) {
                if (n.nodeType === 1 && n.tagName === 'SPAN' && n.classList.contains('tip_j')) afterDash = true;
                return;
            }
            if (n.nodeType === 1 && n.classList?.contains(TML_REPLY_SHARE_BTN_CLASS)) return;
            replyHtml += n.nodeType === 3 ? n.textContent : n.outerHTML;
        });

        const statusUrl = tmlItem.querySelector('.tml_comment')?.href;
        const statusUrlParsed = statusUrl ? new URL(statusUrl) : null;
        const replyCount = tmlItem.querySelectorAll('.subReply .reply_item').length;

        if (isCollect) {
            const subjectLink = tmlItem.querySelector('a[data-subject-id]');
            const subjectId = subjectLink?.getAttribute('data-subject-id');
            let collectionStatus = '';
            if (subjectLink) {
                let node = subjectLink.previousSibling;
                while (node) {
                    if (node.nodeType === 3 && node.textContent.trim()) { collectionStatus = node.textContent.trim().replace(/了$/, ''); break; }
                    node = node.previousSibling;
                }
            }
            const ratingEl = collectComment.querySelector('.starstop-s .starlight');
            const domRating = parseInt(ratingEl?.className.match(/stars(\d+)/)?.[1] || '0');
            const cleanCommentHtml = (() => {
                const tmp = document.createElement('div');
                tmp.innerHTML = collectComment.innerHTML;
                tmp.querySelector('.starstop-s')?.remove();
                return tmp.innerHTML.trim();
            })();

            if (subjectId) {
                const subjectData = await fetchSubjectDataById(subjectId);
                const subjectName = subjectData?.name || subjectLink?.textContent.trim() || '作品';
                let rating = domRating;
                let userTags = null;
                let apiTime = postTime;
                if (userSlug) {
                    const collection = await fetchBangumiAPI(`users/${userSlug}/collections/${subjectId}`);
                    if (collection) {
                        rating = collection.rate || rating;
                        if (collection.updated_at) {
                            const d = new Date(collection.updated_at);
                            const pad = n => String(n).padStart(2, '0');
                            apiTime = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` + (via ? `  via ${via}` : '');
                        }
                        if (collection.tags?.length > 0) userTags = collection.tags;
                    }
                }
                const infoboxTags = (SUBJECT_INFOBOX_KEYS[subjectData?.typeNum] || [])
                    .map(key => getInfoboxValue(subjectData?.infobox, key))
                    .filter(Boolean);
                const overrideTags = userTags
                    ? [collectionStatus, ...userTags].filter(Boolean)
                    : [collectionStatus, ...infoboxTags].filter(Boolean);
                await _doShareCard({
                    username: '', postTime: '', avatarUrl: '', contentEl: null,
                    pureTitle: subjectName,
                    shareTitle: `${username}的收藏 - ${subjectName}`,
                    contentDoc: doc,
                    contentWin: statusUrlParsed
                        ? { location: { origin: statusUrlParsed.origin, pathname: statusUrlParsed.pathname } }
                        : { location: { origin: contentWin.location.origin, pathname: `/subject/${subjectId}` } },
                    dark,
                    replies: [
                        { username, avatarUrl, content: collectComment.innerText?.trim() || '', contentHtml: cleanCommentHtml, time: apiTime, rating },
                        { username: replyUsername, avatarUrl: replyAvatarUrl, content: replyHtml.trim(), contentHtml: replyHtml.trim(), time: '' },
                    ],
                    charImageUrl: subjectData?.imageUrl || '',
                    badgeLabel: subjectData?.type || '作品',
                    overrideTags,
                });
            } else {
                await _doShareCard({
                    username, postTime, avatarUrl,
                    contentEl: collectComment,
                    pureTitle: username + '的收藏',
                    contentDoc: doc,
                    contentWin: statusUrlParsed
                        ? { location: { origin: statusUrlParsed.origin, pathname: statusUrlParsed.pathname } }
                        : contentWin,
                    dark, noCardTitle: true,
                    replies: [{ username: replyUsername, avatarUrl: replyAvatarUrl, content: replyHtml.trim(), contentHtml: replyHtml.trim(), time: '' }],
                    overrideTags: ['收藏'],
                });
            }
        } else {
            await _doShareCard({
                username, postTime, avatarUrl,
                contentEl,
                pureTitle: username + '的吐槽',
                contentDoc: doc,
                contentWin: statusUrlParsed
                    ? { location: { origin: statusUrlParsed.origin, pathname: statusUrlParsed.pathname } }
                    : contentWin,
                dark, noCardTitle: true,
                replies: [{ username: replyUsername, avatarUrl: replyAvatarUrl, content: replyHtml.trim(), contentHtml: replyHtml.trim(), time: '' }],
                overrideTags: replyCount ? [`${replyCount} 回复`, '吐槽'] : ['吐槽'],
            });
        }
    }

    const insertTimelineShareButtons = (doc = document) => {
        doc.querySelectorAll('.tml_item').forEach(item => {
            if (item.querySelector('.' + TML_SHARE_BTN_CLASS)) return;

            const statusP = item.querySelector('.info p.status, .info_full p.status');
            const collectComment = item.querySelector('.collectInfo .comment');
            const blogLink = item.querySelector('.info a[href*="/blog/"], .info_full a[href*="/blog/"]');
            const hasContent = (statusP?.textContent.trim()) || (collectComment?.textContent.trim()) || blogLink;
            if (!hasContent) return;

            const postActions = item.querySelector('.post_actions');
            if (!postActions) return;

            const btn = doc.createElement('a');
            btn.href = 'javascript:void(0);';
            btn.className = TML_SHARE_BTN_CLASS;
            btn.title = '分享';
            btn.style.cssText = 'color:inherit;display:inline-flex;align-items:center;margin-right:6px;opacity:0.75;cursor:pointer;';
            btn.innerHTML = SHARE_SVG;

            const dropdown = postActions.querySelector('.action.dropdown');
            dropdown ? dropdown.after(btn) : postActions.prepend(btn);

            btn.addEventListener('click', () => createTimelineShareImage(item, doc));
        });

        doc.querySelectorAll('.tml_item').forEach(item => {
            if (!item.querySelector('.info p.status, .info_full p.status') && !item.querySelector('.collectInfo .comment')) return;
            item.querySelectorAll('.subReply .reply_item').forEach(li => {
                if (li.querySelector('.' + TML_REPLY_SHARE_BTN_CLASS)) return;
                const btn = doc.createElement('a');
                btn.href = 'javascript:void(0);';
                btn.className = TML_REPLY_SHARE_BTN_CLASS;
                btn.title = '分享回复';
                btn.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-left:6px;vertical-align:middle;opacity:0.6;cursor:pointer;';
                btn.innerHTML = SHARE_SVG;
                li.appendChild(btn);
                btn.addEventListener('click', () => createTimelineReplyShareImage(li, item, doc));
            });
        });
    };

    const observeTimeline = (doc = document) => {
        const root = doc.querySelector('#columnTimelineA') || doc.querySelector('#main') || doc.body;
        if (!root) return;
        let debounce = null;
        const obs = new MutationObserver(() => {
            clearTimeout(debounce);
            debounce = setTimeout(() => insertTimelineShareButtons(doc), 150);
        });
        obs.observe(root, { childList: true, subtree: true });
    };

    const observeReplies = (targetDoc) => {
        const observer = new MutationObserver(() => {
            insertReplyButtons(targetDoc);
            insertSubjectCommentButtons(targetDoc);
        });
        const root = targetDoc.getElementById('comment_list') || targetDoc.getElementById('reply_list')
            || targetDoc.getElementById('comment_box') || targetDoc.body;
        if (root) observer.observe(root, { childList: true, subtree: true });
    };

    // 超展开：在外层页面监听 #right iframe 导航，注入按钮
    const rightFrame = document.getElementById('right');
    if (rightFrame && rightFrame.tagName === 'IFRAME') {
        const onRightFrameLoad = () => {
            setTimeout(() => {
                try {
                    const iDoc = rightFrame.contentDocument;
                    const iUrl = rightFrame.contentWindow.location.href;
                    if (/\/(group\/topic|subject(?:\/\d+)?\/topic)\//.test(iUrl) || /\/blog\/\d+/.test(iUrl) || /\/ep\/\d+/.test(iUrl) || /\/character\/\d+/.test(iUrl) || /\/person\/\d+/.test(iUrl)) {
                        insertButton(iDoc);
                        insertReplyButtons(iDoc);
                        observeReplies(iDoc);
                    }
                } catch (e) {}
            }, 800);
        };
        rightFrame.addEventListener('load', onRightFrameLoad);
    } else {
        setTimeout(() => { insertButton(); insertReplyButtons(); insertSubjectCommentButtons(); insertCollectionPageButtons(); insertBrowserListButtons(); insertMyCollectionShareButton(); insertStatusShareButton(); insertStatusReplyButtons(); insertTimelineShareButtons(); observeTimeline(); observeReplies(document); }, 500);
    }

    checkOAuthCallback();
    refreshBgmTokenIfNeeded();

    if (document.getElementById('customize-panel')) {
        injectShareSettingsTab();
    } else {
        const _panelObs = new MutationObserver(() => {
            if (document.getElementById('customize-panel')) {
                _panelObs.disconnect();
                injectShareSettingsTab();
            }
        });
        _panelObs.observe(document.body, { childList: true, subtree: true });
    }
})();