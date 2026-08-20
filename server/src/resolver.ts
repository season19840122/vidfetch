import { config } from './config';
import { AppError, ErrorCodes } from './errors';
import { getSettings, shouldSimulate } from './settings';
import type { FormatInfo, PlatformId, VideoInfo } from './types';
import { getPlatformMeta } from './platform';
import { authenticationArgs, hashString, mapYtDlpError, runYtDlp } from './ytdlp';

const cache = new Map<string, { at: number; info: VideoInfo }>();
const CACHE_TTL = 10 * 60 * 1000;
const FALLBACK_AUDIO_BITRATE_KBPS = 128;

export function getResolveCache(url: string): VideoInfo | undefined {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.info;
  return undefined;
}

/** 解析视频元信息。 */
export async function resolveVideo(url: string, platform: PlatformId): Promise<VideoInfo> {
  const hit = getResolveCache(url);
  if (hit) return hit;

  let info: VideoInfo;
  if (shouldSimulate()) {
    info = simulateResolve(url, platform);
  } else {
    info = await ytdlpResolve(url, platform);
  }
  cache.set(url, { at: Date.now(), info });
  return info;
}

async function ytdlpResolve(url: string, platform: PlatformId): Promise<VideoInfo> {
  const timeoutSec = Math.max(10, Math.floor(config.timeout / 1000) || 30);
  const cookies = authenticationArgs(getSettings()['network.cookiesFromBrowser']);
  const { stdout, stderr, code } = await runYtDlp(
    [
      '--dump-single-json',
      '--no-download',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      ...cookies,
      '--socket-timeout',
      String(timeoutSec),
      '--',
      url,
    ],
    config.timeout,
  );

  if (code !== 0 || !stdout.trim()) {
    throw mapYtDlpError(stderr || 'empty response', platform);
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new AppError(ErrorCodes.RESOLVER_UNAVAILABLE, '解析失败：无法读取视频信息', 422);
  }
  return mapJsonToInfo(data, url, platform);
}

function mapJsonToInfo(
  data: Record<string, unknown>,
  url: string,
  platform: PlatformId,
): VideoInfo {
  const title = String(data.title ?? data.fulltitle ?? '未命名视频');
  const thumbnail = normalizeThumbnailUrl(data.thumbnail);
  const author = String(
    data.uploader ?? data.channel ?? data.creator ?? data.uploader_id ?? getPlatformMeta(platform).name,
  );
  const duration = Number(data.duration ?? 0);

  const formats: FormatInfo[] = [];
  const seen = new Set<string>();
  const rawFormats = Array.isArray(data.formats) ? (data.formats as Record<string, unknown>[]) : [];
  // yt-dlp 的码率单位为 kbit/s。对于分离的音视频流，下载时会取最佳音频流合并，
  // 因此视频预估大小需要将最佳音频码率一起计算。
  const bestAudioBitrate = rawFormats.reduce((best, f) => {
    const isAudio = String(f.vcodec ?? '') === 'none' && String(f.acodec ?? '') !== 'none';
    if (!isAudio) return best;
    return Math.max(best, getBitrateKbps(f));
  }, 0);

  const pushFormat = (f: FormatInfo) => {
    const key = `${f.ext}:${f.resolution}`;
    if (seen.has(key)) return;
    seen.add(key);
    formats.push(f);
  };

  for (const f of rawFormats) {
    const vcodec = String(f.vcodec ?? '');
    const acodec = String(f.acodec ?? '');
    if (vcodec === 'none' && acodec === 'none') continue;
    if (String(f.protocol ?? '').includes('storyboard')) continue;

    const ext = String(f.ext ?? '').toLowerCase();
    if (!ext) continue;

    const height = Number(f.height ?? 0) || 0;
    const noteRaw = String(f.format_note ?? '');
    const fps = Number(f.fps ?? 0) || 0;
    const exactSize = Number(f.filesize ?? 0) || 0;
    const approximateSize = Number(f.filesize_approx ?? 0) || 0;

    const isAudio = vcodec === 'none' && acodec !== 'none';
    const resolution = isAudio ? 'audio' : height ? `${height}p` : noteRaw || 'video';
    const filesize =
      exactSize ||
      approximateSize ||
      estimateFilesize(duration, f, isAudio || acodec !== 'none' ? 0 : bestAudioBitrate);

    let note = noteRaw;
    const extras: string[] = [];
    if (fps >= 50) extras.push(`${fps}fps`);
    if (String(f.dynamic_range ?? '').toUpperCase().includes('HDR')) extras.push('HDR');
    if (extras.length) note = extras.join(' · ');

    pushFormat({
      id: String(f.format_id ?? ''),
      ext,
      resolution,
      height,
      note,
      filesize,
      vcodec,
      acodec,
    });
  }

  // 兜底：确保至少有一个音频选项
  if (!formats.some((f) => f.resolution === 'audio')) {
    pushFormat({
      id: 'bestaudio',
      ext: 'm4a',
      resolution: 'audio',
      height: 0,
      note: '音频',
      // 部分 HLS 清单不单独提供音频格式信息，按常见 AAC 码率给出参考值。
      filesize: estimateFilesize(duration, { tbr: FALLBACK_AUDIO_BITRATE_KBPS }, 0),
      vcodec: 'none',
      acodec: 'aac',
    });
  }

  formats.sort((a, b) => {
    if (a.resolution === 'audio' && b.resolution !== 'audio') return 1;
    if (b.resolution === 'audio' && a.resolution !== 'audio') return -1;
    return b.height - a.height;
  });

  return { url, platform, title, thumbnail, author, duration, formats };
}

/**
 * yt-dlp 对哔哩哔哩常返回 http 的 hdslb CDN 地址。
 * 页面通过 HTTPS 部署时，浏览器会拦截该混合内容，因此在服务端统一升级为 HTTPS。
 */
function normalizeThumbnailUrl(value: unknown): string {
  const url = String(value ?? '').trim();
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (/^http:\/\/i\d+\.hdslb\.com\//i.test(url)) return url.replace(/^http:/i, 'https:');
  return url;
}

/** 读取 yt-dlp 格式对象中的码率（kbit/s）。 */
function getBitrateKbps(format: Record<string, unknown>): number {
  for (const key of ['tbr', 'vbr', 'abr']) {
    const value = Number(format[key] ?? 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

/** 当平台没有提供大小时，按时长与码率计算下载大小的近似值。 */
function estimateFilesize(
  durationSeconds: number,
  format: Record<string, unknown>,
  additionalAudioKbps: number,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const totalKbps = getBitrateKbps(format) + additionalAudioKbps;
  if (totalKbps <= 0) return 0;
  return Math.round((durationSeconds * totalKbps * 1000) / 8);
}

/* ---------------- 模拟解析 ---------------- */

const SIM_QUALITIES: Array<{ resolution: string; height: number; mb: number }> = [
  { resolution: '2160p', height: 2160, mb: 90 },
  { resolution: '1440p', height: 1440, mb: 60 },
  { resolution: '1080p', height: 1080, mb: 32 },
  { resolution: '720p', height: 720, mb: 18 },
  { resolution: '480p', height: 480, mb: 10 },
  { resolution: '360p', height: 360, mb: 6 },
];

export function simulateResolve(url: string, platform: PlatformId): VideoInfo {
  const seed = hashString(url);
  const meta = getPlatformMeta(platform);
  const pick = (arr: string[]): string => arr[seed % arr.length];

  const subjects = [
    '城市夜景延时摄影',
    '手冲咖啡完整教程',
    '高山徒步 Vlog',
    '人工智能技术解析',
    '古典音乐现场演奏',
    '旅行美食探店',
    '编程入门实战课',
  ];
  const title = `${meta.name} · ${pick(subjects)} #${seed % 1000}`;

  const formats: FormatInfo[] = SIM_QUALITIES.map((q) => {
    const jitter = 1 + ((seed % 20) / 100);
    return {
      id: `${q.height}`,
      ext: 'mp4',
      resolution: q.resolution,
      height: q.height,
      note: q.height >= 1440 ? '4K/2K' : 'H.264',
      filesize: Math.round(q.mb * 1024 * 1024 * jitter),
      vcodec: 'h264',
      acodec: 'aac',
    };
  });
  formats.push({
    id: 'audio',
    ext: 'm4a',
    resolution: 'audio',
    height: 0,
    note: 'AAC',
    filesize: Math.round(3 * 1024 * 1024 * (1 + (seed % 15) / 100)),
    vcodec: 'none',
    acodec: 'aac',
  });

  return {
    url,
    platform,
    title,
    thumbnail: `https://picsum.photos/seed/${seed}/640/360`,
    author: `创作者_${seed % 100}`,
    duration: 60 + (seed % 1800),
    formats,
  };
}
