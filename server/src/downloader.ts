import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AppError } from './errors';
import { buildFormatSelector, cookiesArgs, hashString, mapYtDlpError, ytdlpBinary } from './ytdlp';
import type { DownloadProgress, DownloadResult, PlatformId } from './types';

export interface DownloadOptions {
  url: string;
  platform: PlatformId;
  taskId: string;
  title: string;
  formatId: string;
  quality: string;
  ext: string;
  outputDir: string;
  sizeBytes: number;
  maxSpeed: number;
  timeout: number;
  retries: number;
  cookiesBrowser: string;
  simulate: boolean;
}

export interface DownloadHandle {
  pause(): void;
  resume(): void;
  cancel(): void;
}

export interface DownloadTask {
  promise: Promise<DownloadResult>;
  handle: DownloadHandle;
}

const PROGRESS_MARKER = '__VMD_PROG__';
const CANCELLED_CODE = 'CANCELLED';

export function startDownload(
  opts: DownloadOptions,
  onProgress: (p: DownloadProgress) => void,
): DownloadTask {
  return opts.simulate ? simulateDownload(opts, onProgress) : spawnDownload(opts, onProgress);
}

/* ---------------- 真实下载（yt-dlp） ---------------- */

function spawnDownload(
  opts: DownloadOptions,
  onProgress: (p: DownloadProgress) => void,
): DownloadTask {
  const selector = buildFormatSelector(opts.quality, opts.ext, opts.formatId);
  const timeoutSec = Math.max(10, Math.floor(opts.timeout / 1000) || 30);
  const template =
    `${PROGRESS_MARKER}%(progress._percent_str)s|%(progress._speed_str)s|` +
    `%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.status)s`;

  const args = [
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '--no-check-certificates',
    '--progress-template',
    template,
    '-f',
    selector,
    '--retries',
    String(opts.retries),
    '--fragment-retries',
    String(opts.retries),
    '--socket-timeout',
    String(timeoutSec),
    '--output',
    path.join(opts.outputDir, filenameBase(opts) + '.%(ext)s'),
    '--continue',
  ];
  const needsAudioExtraction =
    (opts.quality === 'audio' || opts.ext === 'm4a') &&
    ['audio', 'bestaudio'].includes(opts.formatId.trim().toLowerCase());
  // 当平台未提供独立音频流时，先下载含音轨的最佳可用流，再由 ffmpeg 提取 M4A。
  // 这与解析页面展示的“仅音频 · M4A”承诺保持一致。
  if (needsAudioExtraction) {
    args.push('--extract-audio', '--audio-format', 'm4a');
  }
  // 仅视频容器需要 ffmpeg 合并输出格式；纯音频(m4a)合并会报错
  if (opts.ext === 'mp4' || opts.ext === 'webm' || opts.ext === 'mkv') {
    args.push('--merge-output-format', opts.ext);
  }
  // 本机浏览器 cookies（解决 YouTube 人机验证）
  args.push(...cookiesArgs(opts.cookiesBrowser));
  if (opts.maxSpeed > 0) {
    args.push('--limit-rate', `${Math.max(1, Math.round(opts.maxSpeed / 1024))}K`);
  }
  args.push('--', opts.url);

  let child: ReturnType<typeof spawn>;
  try {
    child = spawn(ytdlpBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    const e = new AppError(
      'RESOLVER_UNAVAILABLE',
      '无法启动 yt-dlp，请检查安装或设置 YTDLP_PATH',
      500,
    );
    return {
      promise: Promise.reject(e),
      handle: { pause() {}, resume() {}, cancel() {} },
    };
  }

  let finalPath = '';
  let settled = false;
  let cancelled = false;
  let paused = false;

  const handle: DownloadHandle = {
    pause() {
      if (settled) return;
      paused = true;
      try {
        child.kill('SIGSTOP');
      } catch {
        /* ignore */
      }
    },
    resume() {
      if (settled) return;
      paused = false;
      try {
        child.kill('SIGCONT');
      } catch {
        /* ignore */
      }
    },
    cancel() {
      if (settled) return;
      cancelled = true;
      try {
        child.kill('SIGCONT');
      } catch {
        /* ignore */
      }
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    },
  };

  const promise = new Promise<DownloadResult>((resolve, reject) => {
    let stdoutBuf = '';
    let stderrBuf = '';
    let stderrLineBuf = '';

    const hardTimeout = setTimeout(
      () => {
        if (!settled) {
          try {
            child.kill('SIGKILL');
          } catch {
            /* ignore */
          }
        }
      },
      Math.max(opts.timeout, 30000) * (opts.retries + 2),
    );

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.includes(PROGRESS_MARKER)) {
        const p = parseProgress(trimmed);
        if (p) onProgress(p);
        return;
      }
      // --print after_move:filepath 输出的绝对路径
      if (
        trimmed.startsWith(opts.outputDir) &&
        !trimmed.includes('.part') &&
        !trimmed.includes('.ytdl')
      ) {
        finalPath = trimmed;
      }
    };

    child.stdout?.on('data', (d: Buffer) => {
      stdoutBuf += d.toString('utf8');
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx);
        stdoutBuf = stdoutBuf.slice(idx + 1);
        handleLine(line);
      }
    });
    child.stderr?.on('data', (d: Buffer) => {
      // yt-dlp 的进度输出在 stderr，需一并解析；同时保留原始内容用于错误映射
      const chunk = d.toString('utf8');
      stderrBuf += chunk;
      stderrLineBuf += chunk;
      let idx: number;
      while ((idx = stderrLineBuf.indexOf('\n')) >= 0) {
        const line = stderrLineBuf.slice(0, idx);
        stderrLineBuf = stderrLineBuf.slice(idx + 1);
        handleLine(line);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      if ((err as { code?: string }).code === 'ENOENT') {
        reject(new AppError('RESOLVER_UNAVAILABLE', '未找到 yt-dlp，请安装后重试', 500));
      } else {
        reject(new AppError('DOWNLOAD_FAILED', `下载进程异常：${err.message}`, 500));
      }
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      if (stdoutBuf.trim()) handleLine(stdoutBuf);

      if (cancelled) {
        cleanupPartials(opts);
        reject(new AppError(CANCELLED_CODE, '任务已取消', 499));
        return;
      }
      if (code === 0) {
        const fp = finalPath || findFinalFile(opts);
        const size = fp ? safeSize(fp) : 0;
        resolve({ filePath: fp, size, downloaded: size });
      } else {
        reject(mapYtDlpError(stderrBuf, opts.platform));
      }
    });

    // 暂停状态下的说明性状态，供调试
    void paused;
  });

  return { promise, handle };
}

/* ---------------- 模拟下载（用于测试与降级） ---------------- */

function simulateDownload(
  opts: DownloadOptions,
  onProgress: (p: DownloadProgress) => void,
): DownloadTask {
  const state = {
    paused: false,
    cancelled: false,
    waiters: [] as Array<() => void>,
  };
  const base = filenameBase(opts);
  const partPath = path.join(opts.outputDir, `${base}.${opts.ext}.part`);
  const finalPath = path.join(opts.outputDir, `${base}.${opts.ext}`);
  const total = opts.sizeBytes > 0 ? opts.sizeBytes : 24 * 1024 * 1024;
  const startOffset = fs.existsSync(partPath) ? safeSize(partPath) : 0;
  const baseSpeed = (8 + (hashString(opts.url) % 12)) * 1024 * 1024;
  const CHUNK = 512 * 1024;

  const handle: DownloadHandle = {
    pause() {
      state.paused = true;
    },
    resume() {
      if (!state.paused) return;
      state.paused = false;
      const ws = state.waiters.splice(0);
      ws.forEach((w) => w());
    },
    cancel() {
      state.cancelled = true;
      handle.resume();
    },
  };

  const promise = (async (): Promise<DownloadResult> => {
    const fd = fs.openSync(partPath, startOffset > 0 ? 'a' : 'w');
    let downloaded = startOffset;
    const startedAt = Date.now();
    const buffer = Buffer.alloc(CHUNK, 0x5a);

    try {
      while (downloaded < total) {
        if (state.cancelled) throw new AppError(CANCELLED_CODE, '任务已取消', 499);
        if (state.paused) {
          await new Promise<void>((res) => state.waiters.push(res));
        }
        const n = Math.min(CHUNK, total - downloaded);
        fs.writeSync(fd, buffer, 0, n);
        downloaded += n;

        const effSpeed =
          opts.maxSpeed > 0 ? Math.min(baseSpeed, opts.maxSpeed) : baseSpeed;
        const elapsedMs = Date.now() - startedAt;
        const expectedMs = (downloaded / effSpeed) * 1000;
        if (expectedMs > elapsedMs) {
          await sleep(Math.min(250, expectedMs - elapsedMs));
        }

        const percent = Math.min(100, (downloaded / total) * 100);
        const eta = effSpeed > 0 ? Math.ceil((total - downloaded) / effSpeed) : 0;
        onProgress({ percent, speed: effSpeed, eta, downloaded, total });
      }
      fs.closeSync(fd);
      fs.renameSync(partPath, finalPath);
      onProgress({ percent: 100, speed: 0, eta: 0, downloaded: total, total });
      return { filePath: finalPath, size: total, downloaded: total };
    } catch (err) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
      if (err instanceof AppError && err.code === CANCELLED_CODE) {
        try {
          fs.unlinkSync(partPath);
        } catch {
          /* ignore */
        }
      }
      throw err;
    }
  })();

  return { promise, handle };
}

/* ---------------- 工具函数 ---------------- */

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function safeSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function cleanupPartials(opts: DownloadOptions): void {
  try {
    for (const name of fs.readdirSync(opts.outputDir)) {
      if (name.startsWith(filenameBase(opts) + '.') && (name.includes('.part') || name.includes('.ytdl'))) {
        try {
          fs.unlinkSync(path.join(opts.outputDir, name));
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }
}

function findFinalFile(opts: DownloadOptions): string {
  try {
    let best = '';
    let bestMtime = 0;
    for (const name of fs.readdirSync(opts.outputDir)) {
      if (!name.startsWith(filenameBase(opts) + '.')) continue;
      if (name.includes('.part') || name.includes('.ytdl') || name.includes('.tmp')) continue;
      const full = path.join(opts.outputDir, name);
      try {
        const st = fs.statSync(full);
        if (st.mtimeMs > bestMtime) {
          bestMtime = st.mtimeMs;
          best = full;
        }
      } catch {
        /* ignore */
      }
    }
    return best;
  } catch {
    return '';
  }
}

/** 将视频标题清洗为安全、跨平台的文件名。 */
function sanitizeFilename(name: string): string {
  const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  let s = (name || '')
    // 替换文件系统非法字符（含控制字符）
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    // 合并连续空白
    .replace(/\s+/g, ' ')
    .trim()
    // 去掉首尾的点与空白（Windows 不允许尾随点/空格）
    .replace(/^[.\s]+|[.\s]+$/g, '');
  // 限制长度，避免“文件名过长”
  if (s.length > 120) s = s.slice(0, 120).replace(/[.\s]+$/g, '');
  if (!s || WINDOWS_RESERVED.test(s)) s = 'video';
  return s;
}

/** 下载时使用的文件名主体：优先标题，空标题回退为任务 ID。 */
function filenameBase(opts: DownloadOptions): string {
  const title = sanitizeFilename(opts.title);
  return title || opts.taskId;
}

function parseIntSafe(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function parsePercent(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function parseSpeed(s: string): number {
  const m = s.match(/([\d.]+)\s*([KMGT]?)i?B\/s/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  const unit = (m[2] || '').toUpperCase();
  const mult: Record<string, number> = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };
  return Number.isFinite(v) ? v * (mult[unit] ?? 1) : 0;
}

function parseEta(s: string): number {
  if (!s || /unknown|na/i.test(s)) return 0;
  const parts = s.split(':').map((x) => parseInt(x, 10));
  if (parts.some((x) => Number.isNaN(x))) return 0;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

function parseProgress(line: string): DownloadProgress | null {
  const i = line.indexOf(PROGRESS_MARKER);
  if (i < 0) return null;
  const rest = line.slice(i + PROGRESS_MARKER.length);
  const parts = rest.split('|');
  if (parts.length < 6) return null;
  return {
    percent: parsePercent(parts[0]),
    speed: parseSpeed(parts[1]),
    eta: parseEta(parts[2]),
    downloaded: parseIntSafe(parts[3]),
    total: parseIntSafe(parts[4]),
  };
}
