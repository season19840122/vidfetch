import type { PlatformId } from './types';

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  color: string;
  hosts: string[];
}

export const PLATFORMS: PlatformMeta[] = [
  {
    id: 'youtube',
    name: 'YouTube',
    color: '#FF0033',
    hosts: ['youtube.com', 'youtu.be'],
  },
  {
    id: 'bilibili',
    name: 'Bilibili',
    color: '#FB7299',
    hosts: ['bilibili.com', 'b23.tv'],
  },
  {
    id: 'vimeo',
    name: 'Vimeo',
    color: '#1AB7EA',
    hosts: ['vimeo.com'],
  },
  {
    id: 'x',
    name: 'X',
    color: '#000000',
    hosts: ['x.com', 'twitter.com', 't.co'],
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    color: '#010101',
    hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  },
  {
    id: 'instagram',
    name: 'Instagram',
    color: '#E1306C',
    hosts: ['instagram.com', 'instagr.am'],
  },
];

export function getPlatformMeta(id: PlatformId): PlatformMeta {
  return (
    PLATFORMS.find((p) => p.id === id) ?? {
      id: 'other',
      name: '其他网站',
      color: '#6366f1',
      hosts: [],
    }
  );
}

/** 归一化 URL：补全协议、去除首尾空白。 */
export function normalizeUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

/** 从原始输入解析出 host。 */
function parseHost(raw: string): string | null {
  try {
    const url = new URL(normalizeUrl(raw));
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function detectPlatform(raw: string): PlatformId | null {
  const host = parseHost(raw);
  if (!host) return null;
  for (const p of PLATFORMS) {
    if (p.hosts.some((h) => host === h || host.endsWith('.' + h))) return p.id;
  }
  return null;
}

export interface ValidationResult {
  ok: boolean;
  normalized?: string;
  platform?: PlatformId;
  error?: string;
  errorCode?: string;
}

/** 校验 URL 格式并识别平台。 */
export function validateUrl(raw: string): ValidationResult {
  const s = raw.trim();
  if (!s) {
    return { ok: false, error: '请输入视频链接', errorCode: 'INVALID_URL' };
  }
  const normalized = normalizeUrl(s);
  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return {
      ok: false,
      error: 'URL 格式错误，请检查链接是否完整',
      errorCode: 'INVALID_URL',
    };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      ok: false,
      error: '仅支持 http / https 协议的链接',
      errorCode: 'INVALID_URL',
    };
  }
  if (!url.hostname) {
    return {
      ok: false,
      error: 'URL 缺少主机名',
      errorCode: 'INVALID_URL',
    };
  }
  // 未识别的站点视为「其他」，交由 yt-dlp 判断是否支持（yt-dlp 支持上千个站点）
  const platform = detectPlatform(normalized) ?? 'other';
  return { ok: true, normalized, platform };
}
