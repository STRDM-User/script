#!/usr/bin/env python3
"""
API 压力测试脚本
方法: GET (与浏览器一致)
"""

import asyncio
import aiohttp
import time
import json
import sys
from datetime import datetime
from collections import Counter

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36 Edg/145.0.0.0",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en,zh-CN;q=0.9,zh;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}


def prompt_config():
    print("=" * 60)
    print("  API 压力测试 — 参数配置（直接回车使用默认值）")
    print("=" * 60)

    def ask(prompt, default, cast=str):
        raw = input(f"  {prompt} [{default}]: ").strip()
        return cast(raw) if raw else default

    while True:
        target_url = input("  目标 URL: ").strip()
        if target_url:
            break
        print("  目标 URL 不能为空，请重新输入。")
    concurrency  = ask("并发数",                       10,   int)
    total_reqs   = ask("总请求数 (0=无限/Ctrl+C 停止)", 0,    int)
    timeout_sec  = ask("超时秒数",                     5,    int)
    rate_per_sec = ask("速率限制 (次/秒)",              1,    int)
    log_file     = ask("日志文件名",                   "stress_test_log.jsonl")

    kw_raw = input("  停止关键词 (逗号分隔) [恭喜,机器人]: ").strip()
    stop_keywords = [k.strip() for k in kw_raw.split(",") if k.strip()] if kw_raw else ["恭喜", "机器人"]

    print()
    return target_url, concurrency, total_reqs, timeout_sec, rate_per_sec, log_file, stop_keywords

stats = {
    "sent": 0,
    "success": 0,
    "failed": 0,
    "total_ms": 0.0,
    "status_counter": Counter(),
    "responses": [],
}

lock = asyncio.Lock()
stop_event = asyncio.Event()   # 触发后所有 worker 停止
triggered_info = {}            # 记录触发停止的那条响应


class RateLimiter:
    def __init__(self, rate: int):
        self.rate = rate
        self.tokens = float(rate)
        self.last = time.perf_counter()
        self._lock = asyncio.Lock()

    async def acquire(self):
        async with self._lock:
            now = time.perf_counter()
            self.tokens += (now - self.last) * self.rate
            self.last = now
            if self.tokens > self.rate:
                self.tokens = float(self.rate)
            if self.tokens < 1.0:
                wait = (1.0 - self.tokens) / self.rate
                await asyncio.sleep(wait)
                self.tokens = 0.0
            else:
                self.tokens -= 1.0


async def single_request(session: aiohttp.ClientSession, req_id: int, log_fh,
                         target_url: str, stop_keywords: list):
    t0 = time.perf_counter()
    result = {
        "id":         req_id,
        "timestamp":  datetime.utcnow().isoformat(),
        "status":     None,
        "elapsed_ms": None,
        "body":       None,
        "error":      None,
    }
    try:
        async with session.get(target_url, headers=HEADERS) as resp:
            body = await resp.text(errors="replace")
            elapsed = (time.perf_counter() - t0) * 1000
            result.update(status=resp.status, elapsed_ms=round(elapsed, 2), body=body)

            async with lock:
                stats["sent"]     += 1
                stats["success"]  += 1
                stats["total_ms"] += elapsed
                stats["status_counter"][resp.status] += 1
                if body not in stats["responses"]:
                    stats["responses"].append(body)
                    print(f"\n  ★ 新响应体 [{len(stats['responses'])}]: {body[:200]}")

                # 关键词检测
                for kw in stop_keywords:
                    if kw in body:
                        print(f"\n  🎯 检测到关键词「{kw}」，正在停止...")
                        print(f"     完整响应: {body}")
                        triggered_info["keyword"] = kw
                        triggered_info["body"] = body
                        triggered_info["id"] = req_id
                        triggered_info["timestamp"] = result["timestamp"]
                        stop_event.set()
                        break

    except Exception as e:
        elapsed = (time.perf_counter() - t0) * 1000
        result.update(elapsed_ms=round(elapsed, 2), error=str(e))
        async with lock:
            stats["sent"]   += 1
            stats["failed"] += 1

    log_fh.write(json.dumps(result, ensure_ascii=False) + "\n")
    log_fh.flush()
    return result


async def worker(queue: asyncio.Queue, session: aiohttp.ClientSession,
                 log_fh, limiter: RateLimiter, target_url: str, stop_keywords: list):
    while not stop_event.is_set():
        try:
            req_id = queue.get_nowait()
        except asyncio.QueueEmpty:
            await asyncio.sleep(0.05)
            continue
        if req_id is None:
            queue.task_done()
            break
        await limiter.acquire()
        if stop_event.is_set():
            queue.task_done()
            break
        await single_request(session, req_id, log_fh, target_url, stop_keywords)
        queue.task_done()


def print_progress():
    s = stats
    if s["sent"] == 0:
        return
    avg = s["total_ms"] / max(s["success"], 1)
    status_str = " | ".join(f"HTTP {k}: {v}" for k, v in sorted(s["status_counter"].items()))
    print(
        f"\r[{datetime.now().strftime('%H:%M:%S')}] "
        f"发送:{s['sent']}  成功:{s['success']}  失败:{s['failed']}  "
        f"均耗时:{avg:.0f}ms  {status_str}   ",
        end="", flush=True,
    )


async def progress_loop():
    while not stop_event.is_set():
        await asyncio.sleep(1)
        print_progress()


async def run(target_url, concurrency, total_reqs, timeout_sec, rate_per_sec, log_file, stop_keywords):
    connector = aiohttp.TCPConnector(limit=concurrency, ssl=False)
    timeout   = aiohttp.ClientTimeout(total=timeout_sec)
    limiter   = RateLimiter(rate_per_sec)

    print("=" * 60)
    print(f"  目标 URL   : {target_url}")
    print(f"  请求方法   : GET")
    print(f"  并发数     : {concurrency}")
    print(f"  速率限制   : {rate_per_sec} 次/秒")
    print(f"  总请求数   : {'∞ (Ctrl+C 停止)' if total_reqs == 0 else total_reqs}")
    print(f"  停止关键词 : {stop_keywords}")
    print(f"  超时       : {timeout_sec}s")
    print(f"  日志文件   : {log_file}")
    print("=" * 60 + "\n")

    queue = asyncio.Queue(maxsize=concurrency * 2)
    prog  = None

    with open(log_file, "w", encoding="utf-8") as log_fh:
        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            workers = [
                asyncio.create_task(worker(queue, session, log_fh, limiter, target_url, stop_keywords))
                for _ in range(concurrency)
            ]
            prog = asyncio.create_task(progress_loop())

            # 持续往队列塞任务，直到 stop_event 或 Ctrl+C
            try:
                req_id = 0
                infinite = (total_reqs == 0)
                limit = total_reqs if not infinite else float("inf")

                while req_id < limit and not stop_event.is_set():
                    try:
                        queue.put_nowait(req_id)
                        req_id += 1
                    except asyncio.QueueFull:
                        await asyncio.sleep(0.05)

                if not infinite and not stop_event.is_set():
                    for _ in range(concurrency):
                        await queue.put(None)
                    await queue.join()
                else:
                    # 等待 stop_event（关键词触发或 Ctrl+C）
                    await stop_event.wait()

            except (KeyboardInterrupt, asyncio.CancelledError):
                stop_event.set()
            finally:
                if prog:
                    prog.cancel()
                # 清空队列
                while not queue.empty():
                    try:
                        queue.get_nowait()
                        queue.task_done()
                    except Exception:
                        break
                await asyncio.gather(*workers, return_exceptions=True)

    print_progress()
    s = stats
    print("\n\n" + "=" * 60)
    print("  压测结束 — 汇总")
    print("=" * 60)
    print(f"  总发送   : {s['sent']}")
    print(f"  成功     : {s['success']}")
    print(f"  失败     : {s['failed']}")
    if s["success"]:
        print(f"  平均耗时 : {s['total_ms']/s['success']:.1f} ms")
    print(f"  状态码   : {dict(s['status_counter'])}")
    print(f"\n  ── 全部不同响应体（共 {len(s['responses'])} 种）──")
    for i, body in enumerate(s["responses"], 1):
        print(f"  [{i}] {body[:400]}")
    print(f"\n  详细日志 → {log_file}")
    print("=" * 60)

    if triggered_info:
        print(f"\n  {'='*60}")
        print(f"  🎯 触发停止的响应（第 {triggered_info['id']} 条 / {triggered_info['timestamp']}）")
        print(f"  关键词 : 「{triggered_info['keyword']}」")
        print(f"  内容   : {triggered_info['body']}")
        print(f"  {'='*60}")


if __name__ == "__main__":
    try:
        cfg = prompt_config()
        asyncio.run(run(*cfg))
    except KeyboardInterrupt:
        sys.exit(0)
