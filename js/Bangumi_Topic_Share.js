// ==UserScript==
// @name         Bangumi Topic Share
// @namespace    http://tampermonkey.net/
// @version      5.0
// @description  Bangumi 话题/日志分享工具：生成分享卡片，支持图片复制/下载、一键复制分享文案、可选 AI 标签
// @author       Chang ji
// @contributor  Stardream
// @match        *://bgm.tv/group/topic/*
// @match        *://bangumi.tv/group/topic/*
// @match        *://chii.in/group/topic/*
// @match        *://bgm.tv/subject/*/topic/*
// @match        *://bangumi.tv/subject/*/topic/*
// @match        *://chii.in/subject/*/topic/*
// @match        *://bgm.tv/subject/topic/*
// @match        *://bangumi.tv/subject/topic/*
// @match        *://chii.in/subject/topic/*
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
// @match        *://bgm.tv/rakuen*
// @match        *://bangumi.tv/rakuen*
// @match        *://chii.in/rakuen*
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // ================= 配置区 =================
    const AI_CONFIG = {
        apiUrl: "在此处填入你的_API_URL",
        apiKey: "在此处填入你的_API_KEY",
        model: "gpt-3.5-turbo",
    };
    // =========================================

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
        .content-box { background: #fdfafb; padding: 18px; border-radius: 12px; border-left: 5px solid #F09199; }
        .content-text { font-size: 14px; color: #333; line-height: 1.8; margin: 0; word-break: break-all; }
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
        [data-bgm-mask] { display: inline; background-color: #555; color: #555; border: 1px solid #555; border-radius: 2px; padding: 0 4px; transition: color 0.3s ease; }
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
        div.querySelectorAll('.embed-play-btn, .embed-player-wrapper, iframe').forEach(el => el.remove());
        div.querySelectorAll('.text_mask').forEach(el => { el.removeAttribute('style'); el.classList.remove('text_mask'); el.dataset.bgmMask = '1'; });
        const imgs = [...div.querySelectorAll('img')];
        imgs.forEach(img => {
            if (img.hasAttribute('smileid') || /\/smiles\//.test(img.src)) {
                img.setAttribute('data-bgm-emoji', '1');
            }
        });
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
        const isCharacter = /\/character\/\d+|\/rakuen\/topic\/crt\/\d+/.test(pathname);
        const isPerson = /\/person\/\d+|\/rakuen\/topic\/prsn\/\d+/.test(pathname);
        if (isBlog) {
            const subjectNames = [...new Set(
                [...contentDoc.querySelectorAll('a')]
                    .filter(a => /\/subject\/\d+$/.test(a.href) && a.textContent.trim())
                    .map(a => a.textContent.trim())
            )];
            const replyCount = contentDoc.querySelectorAll('[id^="post_"]').length;
            return [...subjectNames, `${replyCount} 回复`, '日志'];
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
        if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey.includes("填入")) return getPageTags(contentDoc);
        return new Promise((resolve) => {
            const prompt = `根据标题和内容生成3个短标签，只要标签名，空格隔开。内容：${title} ${content.substring(0, 150)}`;
            GM_xmlhttpRequest({
                method: "POST", url: AI_CONFIG.apiUrl,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.apiKey}` },
                data: JSON.stringify({ model: AI_CONFIG.model, messages: [{ role: "user", content: prompt }], temperature: 0.5 }),
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
                                   replies = [], replyId = '', charImageUrl = '', badgeLabel = '' }) {
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
            fullContent = contentEl.innerText?.trim() || "";
            const fullHtml = contentEl.innerHTML?.trim() || "";
            toHide.forEach(el => el.style.display = '');
            const lim = replies.length > 0 ? 200 : 300;
            displayContentHtml = fullContent.length > lim ? (fullContent.substring(0, lim) + "...") : fullHtml;
        }
        const mainLimit = replies.length > 0 ? 200 : 300;
        let displayContent = fullContent.length > mainLimit ? fullContent.substring(0, mainLimit) + "..." : fullContent;

        const currentFullUrl = contentWin.location.origin + contentWin.location.pathname;
        const shareUrl = replyId ? currentFullUrl + '#' + replyId : currentFullUrl;
        const displayUrl = currentFullUrl.replace(/^https?:\/\//, '');

        const [tags, base64Avatar, base64CharImage, base64QR, ...base64ReplyAvatars] = await Promise.all([
            getAITags(pureTitle, fullContent, contentDoc),
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
            const avatarSize = Math.max(22, 28 - idx * 4);
            const topStyle = idx === 0
                ? `margin-top:${base64CharImage ? '6' : '14'}px;padding-top:${base64CharImage ? '6' : '14'}px;${hasMainContent ? `border-top:1px solid ${divider};` : ''}`
                : `margin-top:10px;padding-left:14px;border-left:3px solid ${dark ? '#F0919955' : '#F0919933'};`;
            const inner = idx + 1 < replies.length ? `<div style="margin-top:10px;">${renderLevel(idx + 1)}</div>` : '';
            return `<div style="${topStyle}">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                    <img src="${b64}" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:7px;object-fit:cover;border:1px solid ${dark ? '#444' : '#f0f0f0'};">
                    <span style="font-weight:bold;color:#F09199;font-size:${13 - idx}px;">${r.username}</span>
                    <span style="color:#aaa;font-size:11px;">${r.time}</span>
                </div>
                <div class="content-box"><p class="content-text" style="font-size:${14 - idx}px;">${inlinedReplyContents[idx]}</p></div>
                ${inner}
            </div>`;
        };
        const replySection = replies.length > 0 ? renderLevel(0) : '';
        loading.remove();

        const overlay = document.createElement('div');
        overlay.id = 'bgm-share-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; margin: auto; padding: 30px 0 50px;">
            <div id="capture-area" style="padding: 4px; background: transparent;">
                <div class="share-card${dark ? ' dark' : ''}">
                    <div class="card-top-bar"></div>
                    ${base64CharImage ? `<div style="display:flex;align-items:stretch;"><div style="flex:1;padding:22px 20px 14px 25px;display:flex;flex-direction:column;justify-content:center;min-height:150px;position:relative;"><div style="font-size:22px;font-weight:800;color:${dark ? '#f0f0f0' : '#111'};line-height:1.3;">${pureTitle}</div><div style="margin-top:10px;"><span style="background:${dark ? '#2a2a2a' : '#FEEFF0'};color:#F09199;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:bold;border:1px solid ${dark ? '#F0919966' : '#F0919944'};">${badgeLabel}</span></div><div style="position:absolute;bottom:0;left:25px;right:0;height:1px;background:linear-gradient(to right,${dark ? 'rgba(255,255,255,0.15)' : '#ddd'} 0%,${dark ? 'rgba(255,255,255,0.15)' : '#ddd'} 60%,transparent 100%);"></div></div><div style="position:relative;width:130px;flex-shrink:0;overflow:hidden;min-height:150px;background-image:url('${base64CharImage}');background-size:cover;background-position:center top;background-color:${dark ? '#2a2a2a' : '#f9f5f5'};background-repeat:no-repeat;"><div style="position:absolute;inset:0;background:linear-gradient(to right,${dark ? '#1e1e1e' : '#fff'} 0%,transparent 15%),linear-gradient(to top,${dark ? '#1e1e1e' : '#fff'} 0%,transparent 15%);"></div></div></div>` : badgeLabel ? `<div style="padding:22px 25px 14px;position:relative;"><div style="font-size:22px;font-weight:800;color:${dark ? '#f0f0f0' : '#111'};line-height:1.3;">${pureTitle}</div><div style="margin-top:10px;"><span style="background:${dark ? '#2a2a2a' : '#FEEFF0'};color:#F09199;font-size:11px;padding:3px 10px;border-radius:20px;font-weight:bold;border:1px solid ${dark ? '#F0919966' : '#F0919944'};">${badgeLabel}</span></div><div style="position:absolute;bottom:0;left:25px;right:25px;height:1px;background:${dark ? 'rgba(255,255,255,0.1)' : '#eee'};"></div></div>` : ''}
                    ${username ? `<div class="card-header" style="">
                        <img class="avatar-img" src="${base64Avatar}">
                        <div class="user-meta">
                            <span class="name">${username}</span>
                            <span class="time">${postTime}</span>
                        </div>
                    </div>` : ''}
                    <div class="card-body">
                        ${base64CharImage ? '' : `<h1 class="main-title">${pureTitle}</h1>`}
                        ${inlinedMainContent ? `<div class="content-box"><p class="content-text">${inlinedMainContent}</p></div>` : ''}
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
                <button id="bgm-close-btn" class="bgm-action-btn" data-tip="关闭">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            </div>
        `;
        document.body.appendChild(overlay);

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

        document.getElementById('bgm-close-btn').addEventListener('click', () => {
            cancelled = true;
            maskPreviewStyle.remove();
            overlay.remove();
        });

        const showToast = (msg) => {
            const toast = document.createElement('div');
            toast.textContent = msg;
            toast.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:8px 20px;border-radius:20px;font-size:14px;z-index:100002;opacity:1;transition:opacity 0.5s';
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 1800);
        };

        document.getElementById('bgm-text-btn').addEventListener('click', async () => {
            const shareText = `【链接】${pureTitle} | Bangumi番组计划\n${shareUrl}`;
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
                iStyle.textContent = style.innerHTML + maskCss;
                iDoc.head.appendChild(iStyle);
                iDoc.body.style.cssText = 'margin:0;padding:0;background:transparent;display:inline-block;';
                iDoc.body.innerHTML = captureEl.innerHTML;

                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

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
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://api.bgm.tv/v0/' + path,
                headers: { 'Accept': 'application/json' },
                onload: res => { try { resolve(JSON.parse(res.responseText)); } catch { resolve(null); } },
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

    async function createShareImage(contentDoc = document) {
        const dark = contentDoc.documentElement.getAttribute('data-theme') === 'dark';
        const contentWin = contentDoc.defaultView || window;

        const isBlog = /\/blog\/\d+/.test(contentWin.location.pathname);
        const isCharacter = /\/character\/\d+|\/rakuen\/topic\/crt\/\d+/.test(contentWin.location.pathname);
        const isPerson = /\/person\/\d+|\/rakuen\/topic\/prsn\/\d+/.test(contentWin.location.pathname);

        let username, postTime, avatarUrl, contentEl;
        if (isBlog) {
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
            const masterPost = contentDoc.querySelector('.postTopic') || contentDoc.querySelector('[id^="post_"]');
            const avatarBox = masterPost?.querySelector('.avatarSize48');
            avatarUrl = avatarBox ? contentWin.getComputedStyle(avatarBox).backgroundImage.replace(/url\(["']?([^"']+)["']?\)/, '$1') : "";
            contentEl = masterPost?.querySelector('.topic_content') || masterPost?.querySelector('.inner');
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
        await _doShareCard({ username, postTime, avatarUrl, contentEl, pureTitle, contentDoc, contentWin, dark, charImageUrl, badgeLabel });
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
        const rawText = contentClone?.innerText?.trim() || "";
        const truncated = rawText.length > 150;
        const contentHtml = truncated ? (rawText.substring(0, 150) + "...") : (contentEl?.innerHTML?.trim() || "");
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
        await _doShareCard({ username, postTime, avatarUrl, contentEl, pureTitle, contentDoc, contentWin, dark,
            replies, replyId: replyEl.id, charImageUrl, badgeLabel });
    }

    const REPLY_SHARE_BTN_CLASS = 'bgm-reply-share-btn';
    const SHARE_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>';

    const insertReplyButtons = (targetDoc = document) => {
        targetDoc.querySelectorAll('[id^="post_"]').forEach(post => {
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
            || targetDoc.querySelector('.post_actions:not(.re_info)');
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

    const observeReplies = (targetDoc) => {
        const observer = new MutationObserver(() => insertReplyButtons(targetDoc));
        const root = targetDoc.getElementById('comment_list') || targetDoc.getElementById('reply_list') || targetDoc.body;
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
        setTimeout(() => { insertButton(); insertReplyButtons(); observeReplies(document); }, 500);
    }
})();
