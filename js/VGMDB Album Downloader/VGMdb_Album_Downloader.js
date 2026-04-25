// ==UserScript==
// @name         VGMdb Album Downloader
// @namespace    https://vgmdb.net/
// @version      2.9.4
// @description  支持 单张下载 & zip 打包 & 实时进度显示 & 图片重命名 | Single download & ZIP packaging & real-time progress & image renaming
// @match        https://vgmdb.net/album/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @connect      vgmdb.net
// @connect      media.vgm.io
// @author       Stardream
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/530686/VGMdb%20Album%20Downloader.user.js
// @updateURL https://update.greasyfork.org/scripts/530686/VGMdb%20Album%20Downloader.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ── 语言检测 & 翻译 ──────────────────────────────────────────────
    const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en';

    const i18n = {
        zh: {
            btnSingle:        '📥 单张下载',
            btnZip:           '📦 打包下载',
            btnSingleLoading: '⏳ 正在下载...',
            btnSingleDone:    '✅ 下载完成',
            btnZipLoading:    '⏳ 正在打包...',
            btnZipDone:       '✅ 打包完成',
            noLinks:          '❌ 没有找到图片页面链接！',
            foundLinks:       n  => `共找到 ${n} 个图片页面链接。`,
            readingPage:      i  => `📄 正在读取第 ${i} 个页面...`,
            noImage:          url => `⚠️ 未找到图片于: ${url}`,
            added:            f  => `✅ 已添加：${f}`,
            downloaded:       f  => `✅ 下载完成：${f}`,
            dlFailed:         f  => `❌ 单张下载失败：${f}`,
            pageFailed:       url => `❌ 页面处理失败：${url}`,
            zipping:          '📦 开始生成压缩包...',
            zipDone:          '✅ 压缩包已生成并开始下载！',
            zipFailed:        e  => `❌ 打包失败：${e}`,
        },
        en: {
            btnSingle:        '📥 Download',
            btnZip:           '📦 Download ZIP',
            btnSingleLoading: '⏳ Downloading...',
            btnSingleDone:    '✅ Done',
            btnZipLoading:    '⏳ Packaging...',
            btnZipDone:       '✅ Packed',
            noLinks:          '❌ No image page links found!',
            foundLinks:       n  => `Found ${n} image page link(s).`,
            readingPage:      i  => `📄 Reading page ${i}...`,
            noImage:          url => `⚠️ No image found at: ${url}`,
            added:            f  => `✅ Added: ${f}`,
            downloaded:       f  => `✅ Downloaded: ${f}`,
            dlFailed:         f  => `❌ Download failed: ${f}`,
            pageFailed:       url => `❌ Page error: ${url}`,
            zipping:          '📦 Building ZIP...',
            zipDone:          '✅ ZIP created and download started!',
            zipFailed:        e  => `❌ ZIP failed: ${e}`,
        }
    };

    const T = i18n[lang];
    // ────────────────────────────────────────────────────────────────

    let btnZipRef = null;
    let logTimeout = null;

    window.addEventListener('load', () => {
        setTimeout(() => {
            const btnSingle = createBtn(T.btnSingle, 20);
            const btnZip = createBtn(T.btnZip, 60);
            btnZipRef = btnZip;

            btnSingle.addEventListener('click', () => {
                showLogArea();
                btnSingle.disabled = true;
                btnSingle.textContent = T.btnSingleLoading;
                extractAndDownload(false).then(() => {
                    btnSingle.textContent = T.btnSingleDone;
                    hideLogAreaAfterDelay();
                });
            });

            btnZip.addEventListener('click', () => {
                showLogArea();
                btnZip.disabled = true;
                btnZip.textContent = T.btnZipLoading;
                extractAndDownload(true);
            });

            document.body.appendChild(btnSingle);
            document.body.appendChild(btnZip);
        }, 500);
    });

    function createBtn(text, offsetY) {
        const btn = document.createElement('button');
        btn.textContent = text;
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: offsetY + 'px',
            right: '20px',
            zIndex: 9999,
            padding: '10px 16px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer',
            boxShadow: '0 2px 6px rgba(0,0,0,0.3)'
        });
        return btn;
    }

    const logArea = document.createElement('div');
    Object.assign(logArea.style, {
        position: 'fixed',
        bottom: '110px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: 'white',
        padding: '10px',
        borderRadius: '5px',
        fontSize: '12px',
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: 9999,
        width: '300px',
        display: 'none'
    });
    document.body.appendChild(logArea);

    function showLogArea() {
        logArea.style.display = 'block';
        clearTimeout(logTimeout);
    }

    function hideLogAreaAfterDelay() {
        logTimeout = setTimeout(() => {
            logArea.style.display = 'none';
            logArea.innerHTML = '';
        }, 5000);
    }

    function log(msg) {
        const p = document.createElement('div');
        p.textContent = msg;
        logArea.appendChild(p);
        logArea.scrollTop = logArea.scrollHeight;
    }

    async function extractAndDownload(asZip = false) {
        const anchors = Array.from(document.querySelectorAll("div#cover_list a[href*='covers.php?do=view&cover=']"));
        const coverLinks = anchors.map(a => a.href);
        const coverNames = anchors.map(a => a.textContent.trim());

        if (coverLinks.length === 0) {
            alert(T.noLinks);
            return;
        }

        log(T.foundLinks(coverLinks.length));

        const zipFiles = [];
        for (let i = 0; i < coverLinks.length; i++) {
            const url = coverLinks[i];
            const niceName = coverNames[i].replace(/[/\\:*?"<>|]/g, '');

            log(T.readingPage(i + 1));
            try {
                const html = await fetch(url).then(r => r.text());
                const match = html.match(/<img[^>]+id=["']scrollpic["'][^>]+src=["']([^"']+)["']/);
                if (!match || !match[1]) {
                    log(T.noImage(url));
                    continue;
                }
                const imageUrl = match[1].startsWith("http") ? match[1] : "https://vgmdb.net" + match[1];
                const extension = imageUrl.split('.').pop().split('?')[0].toLowerCase();
                const filename = `${niceName}.${extension}`;

                if (asZip) {
                    const blob = await new Promise((resolve, reject) => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: imageUrl,
                            responseType: 'blob',
                            onload: res => resolve(res.response),
                            onerror: err => reject(err)
                        });
                    });
                    await new Promise(res => setTimeout(res, 400));
                    zipFiles.push({ name: `Scans/${filename}`, lastModified: new Date(), input: blob });
                    log(T.added(filename));
                } else {
                    GM_download({
                        url: imageUrl,
                        name: filename,
                        saveAs: false,
                        onload: () => {
                            log(T.downloaded(filename));
                            if (i === coverLinks.length - 1) {
                                btnSingle.textContent = T.btnSingleDone;
                                hideLogAreaAfterDelay();
                            }
                        },
                        onerror: err => {
                            console.error(T.dlFailed(filename), err);
                            log(T.dlFailed(filename));
                        }
                    });
                }
            } catch (e) {
                log(T.pageFailed(url));
                console.error(e);
            }
        }

        if (asZip && zipFiles.length > 0) {
            log(T.zipping);
            await downloadZipBuiltIn(zipFiles);
            if (btnZipRef) btnZipRef.textContent = T.btnZipDone;
            hideLogAreaAfterDelay();
        }
    }

    async function downloadZipBuiltIn(files) {
        try {
            const zipBlob = await zip(files);
            const title = document.querySelector("h1")?.innerText || 'vgmdb_album';
            const a = document.createElement('a');
            a.href = URL.createObjectURL(zipBlob);
            a.download = `${title}.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
            log(T.zipDone);
        } catch (err) {
            alert(T.zipFailed(err));
            console.error(err);
            log(T.zipFailed(err));
        }
    }

    function zip(files) {
        return new Response(new ReadableStream({
            async start(controller) {
                const encoder = new TextEncoder();
                const fileRecords = [];
                let centralDirSize = 0;
                let offset = 0;

                for (let file of files) {
                    const filenameBytes = encoder.encode(file.name);
                    const modTime = getDosTime(file.lastModified || new Date());

                    const localHeader = new Uint8Array(30 + filenameBytes.length);
                    const view = new DataView(localHeader.buffer);
                    view.setUint32(0, 0x04034b50, true);
                    view.setUint16(4, 20, true);
                    view.setUint16(6, 0, true);
                    view.setUint16(8, 0, true);
                    view.setUint16(10, modTime.time, true);
                    view.setUint16(12, modTime.date, true);
                    view.setUint32(14, 0, true);
                    view.setUint32(18, file.input.size, true);
                    view.setUint32(22, file.input.size, true);
                    view.setUint16(26, filenameBytes.length, true);
                    view.setUint16(28, 0, true);
                    localHeader.set(filenameBytes, 30);

                    controller.enqueue(localHeader);
                    const blobBuf = new Uint8Array(await file.input.arrayBuffer());
                    controller.enqueue(blobBuf);

                    const central = new Uint8Array(46 + filenameBytes.length);
                    const cv = new DataView(central.buffer);
                    cv.setUint32(0, 0x02014b50, true);
                    cv.setUint16(4, 20, true);
                    cv.setUint16(6, 20, true);
                    cv.setUint16(8, 0, true);
                    cv.setUint16(10, 0, true);
                    cv.setUint16(12, modTime.time, true);
                    cv.setUint16(14, modTime.date, true);
                    cv.setUint32(16, 0, true);
                    cv.setUint32(20, file.input.size, true);
                    cv.setUint32(24, file.input.size, true);
                    cv.setUint16(28, filenameBytes.length, true);
                    cv.setUint16(30, 0, true);
                    cv.setUint16(32, 0, true);
                    cv.setUint16(34, 0, true);
                    cv.setUint16(36, 0, true);
                    cv.setUint32(38, 0, true);
                    cv.setUint32(42, offset, true);
                    central.set(filenameBytes, 46);

                    fileRecords.push(central);
                    offset += localHeader.length + blobBuf.length;
                    centralDirSize += central.length;
                }

                const startOfCentral = offset;
                for (let record of fileRecords) controller.enqueue(record);

                const end = new Uint8Array(22);
                const dv = new DataView(end.buffer);
                dv.setUint32(0, 0x06054b50, true);
                dv.setUint16(8, fileRecords.length, true);
                dv.setUint16(10, fileRecords.length, true);
                dv.setUint32(12, centralDirSize, true);
                dv.setUint32(16, startOfCentral, true);
                controller.enqueue(end);
                controller.close();
            }
        })).blob();
    }

    function getDosTime(date) {
        const d = new Date(date);
        const time =
            (d.getHours() << 11) |
            (d.getMinutes() << 5) |
            (d.getSeconds() / 2);
        const day =
            ((d.getFullYear() - 1980) << 9) |
            ((d.getMonth() + 1) << 5) |
            d.getDate();
        return { time: time & 0xffff, date: day & 0xffff };
    }
})();
