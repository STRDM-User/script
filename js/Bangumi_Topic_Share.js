// ==UserScript==
// @name         Bangumi Topic Share
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Bangumi 话题分享工具：生成分享卡片，支持图片复制/下载、一键复制分享文案、可选 AI 标签
// @author       Chang ji
// @contributor  Stardream
// @match        *://bgm.tv/group/topic/*
// @match        *://bangumi.tv/group/topic/*
// @match        *://chii.in/group/topic/*
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
            align-items: center; z-index: 100000;
        }
        .share-card {
            width: 420px; background: #fff; border-radius: 20px; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
        }
        .card-top-bar { height: 6px; background: #F09199; }
        .card-header { padding: 25px 25px 15px; display: flex; align-items: center; gap: 15px; text-align: left; }
        .avatar-img { width: 54px; height: 54px; border-radius: 12px; background: #eee; background-size: cover; background-position: center; border: 1px solid #f0f0f0; flex-shrink: 0; }
        .user-meta { text-align: left; }
        .user-meta .name { display: block; font-weight: bold; color: #F09199; font-size: 17px; line-height: 1.2; }
        .user-meta .time { font-size: 12px; color: #aaa; margin-top: 4px; display: block; }
        .card-body { padding: 0 25px 25px; text-align: left; }
        .main-title { font-size: 20px; color: #111; margin: 0 0 15px 0; line-height: 1.5; font-weight: 800; }
        .content-box { background: #fdfafb; padding: 18px; border-radius: 12px; border-left: 5px solid #F09199; }
        .content-text { font-size: 14px; color: #333; line-height: 1.8; margin: 0; white-space: pre-wrap; word-break: break-all; }
        .tags-container { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
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
    `;
    document.head.appendChild(style);

    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

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

    async function getAITags(title, content) {
        if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey.includes("填入")) return ["话题", "讨论", "Bangumi"];
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
                    } catch (e) { resolve(["话题", "讨论", "Bangumi"]); }
                },
                onerror: () => resolve(["话题", "讨论", "Bangumi"])
            });
        });
    }

    async function createShareImage() {
        if (typeof html2canvas === 'undefined') {
            alert("截图库加载失败，请刷新页面或检查网络。");
            return;
        }

        const loading = document.createElement('div');
        loading.innerHTML = '<div id="bgm-share-overlay" style="display:flex"><div id="loading-info">AI 正在提炼标签...</div></div>';
        document.body.appendChild(loading);

        const idNode = getElementByXpath("/html/body/div[1]/div[2]/div[1]/div[1]/div[2]/div[2]/strong/a");
        const username = idNode ? idNode.innerText.trim() : "未知用户";
        const timeNode = getElementByXpath("/html/body/div[1]/div[2]/div[1]/div[1]/div[2]/div[1]/div[1]/small");
        let postTime = timeNode ? (timeNode.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";

        const h1Node = document.querySelector('#pageHeader h1') || document.querySelector('h1');
        let pureTitle = "";
        if (h1Node) h1Node.childNodes.forEach(n => { if (n.nodeType === 3) pureTitle += n.textContent; });
        pureTitle = pureTitle.replace(/[»\n]/g, '').trim() || "分享话题";

        const masterPost = document.querySelector('.postTopic') || document.querySelector('[id^="post_"]');
        let fullContent = (masterPost?.querySelector('.topic_content') || masterPost?.querySelector('.inner'))?.innerText?.trim() || "";
        let displayContent = fullContent.length > 300 ? fullContent.substring(0, 300) + "..." : fullContent;

        const avatarBox = masterPost?.querySelector('.avatarSize48');
        let avatarUrl = avatarBox ? window.getComputedStyle(avatarBox).backgroundImage.replace(/url\(["']?([^"']+)["']?\)/, '$1') : "";

        const currentFullUrl = window.location.origin + window.location.pathname;
        const displayUrl = currentFullUrl.replace(/^https?:\/\//, '');

        const [tags, base64Avatar, base64QR] = await Promise.all([
            getAITags(pureTitle, fullContent),
            fetchAsBase64(avatarUrl),
            fetchAsBase64(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}`)
        ]);

        const tagsHtml = tags.map(tag => `<span class="tag-item"># ${tag}</span>`).join('');
        loading.remove();

        const overlay = document.createElement('div');
        overlay.id = 'bgm-share-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center;">
            <div id="capture-area" style="padding: 30px; background: transparent;">
                <div class="share-card">
                    <div class="card-top-bar"></div>
                    <div class="card-header">
                        <img class="avatar-img" src="${base64Avatar}">
                        <div class="user-meta">
                            <span class="name">${username}</span>
                            <span class="time">${postTime}</span>
                        </div>
                    </div>
                    <div class="card-body">
                        <h1 class="main-title">${pureTitle}</h1>
                        <div class="content-box"><p class="content-text">${displayContent}</p></div>
                        <div class="tags-container">${tagsHtml}</div>
                    </div>
                    <div class="card-footer">
                        <div style="text-align:left">
                            <div style="font-size:14px; font-weight:bold; color:#555">Bangumi 番组计划</div>
                            <div style="font-size:10px; color:#aaa; margin-top:2px;">${displayUrl}</div>
                        </div>
                        <img class="qr-img" src="${base64QR}">
                    </div>
                </div>
            </div>
            <div class="bgm-btn-row">
                <button id="bgm-copy-btn" class="bgm-action-btn" disabled title="复制图片">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
                <button id="bgm-download-btn" class="bgm-action-btn" disabled title="下载图片">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button id="bgm-text-btn" class="bgm-action-btn" title="复制文案">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                </button>
                <button id="bgm-close-btn" class="bgm-action-btn" title="关闭">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let cancelled = false;
        document.getElementById('bgm-close-btn').addEventListener('click', () => {
            cancelled = true;
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
            const shareText = `【链接】${pureTitle} | Bangumi番组计划\n${currentFullUrl}`;
            try {
                await navigator.clipboard.writeText(shareText);
                showToast('✓ 文案已复制');
            } catch (e) {
                showToast('✗ 复制失败');
            }
        });

        setTimeout(async () => {
            if (cancelled) return;
            const canvas = await html2canvas(document.querySelector('#capture-area'), { scale: 2, backgroundColor: null, useCORS: true });
            if (cancelled) return;

            const copyBtn = document.getElementById('bgm-copy-btn');
            const downloadBtn = document.getElementById('bgm-download-btn');
            copyBtn.disabled = false;
            downloadBtn.disabled = false;

            copyBtn.addEventListener('click', async () => {
                try {
                    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                    showToast('✓ 已复制到剪贴板');
                } catch (e) {
                    showToast('✗ 复制失败，请改用下载');
                }
            });

            downloadBtn.addEventListener('click', () => {
                const link = document.createElement('a');
                link.download = `BGM_Share_${username}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
            });
        }, 800);
    }

    const insertButton = () => {
        const menuInner = document.querySelector('#columnInSubjectB .menu_inner');
        if (menuInner && !document.getElementById('gen-card-btn')) {
            const br = document.createElement('br');
            const btn = document.createElement('a');
            btn.id = 'gen-card-btn';
            btn.href = 'javascript:void(0);';
            btn.className = 'l';
            btn.textContent = '/ 分享';
            menuInner.appendChild(br);
            menuInner.appendChild(btn);
            btn.addEventListener('click', createShareImage);
        }
    };

    setTimeout(insertButton, 500);
})();