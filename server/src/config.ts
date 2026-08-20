import path from 'node:path';
import fs from 'node:fs';

function str(v: string | undefined, d: string): string {
  return v === undefined || v === '' ? d : v;
}

function int(v: string | undefined, d: number): number {
  if (v === undefined || v === '') return d;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
}

function bool(v: string | undefined): boolean {
  return v === '1' || v === 'true' || v === 'yes';
}

function resolvePath(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
}

const DATA_DIR = resolvePath(str(process.env.DATA_DIR, './data'));

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  dbPath: string;
  downloadDir: string;
  maxConcurrent: number;
  defaultQuality: string;
  defaultFormat: string;
  maxSpeed: number;
  timeout: number;
  retries: number;
  cookiesFromBrowser: string;
  cookiesFile: string;
  cookieAdminToken: string;
  ytdlpPath: string | null;
  simulate: 'auto' | 'on' | 'off';
  version: string;
}

/**
 * 将 Railway 的私密 Base64 变量写入数据卷，供 yt-dlp 读取。
 * 不记录 Cookie 内容，也不将其暴露到 API 或前端。
 */
function resolveCookiesFile(dataDir: string): string {
  const explicit = str(process.env.YTDLP_COOKIES_FILE, '').trim();
  if (explicit) return resolvePath(explicit);

  const encoded = str(process.env.YTDLP_COOKIES_BASE64, '').replace(/\s/g, '');
  if (!encoded) {
    const managedFile = path.join(dataDir, 'youtube-cookies.txt');
    return fs.existsSync(managedFile) ? managedFile : '';
  }

  // Base64 非法时 Buffer.from 也可能静默解码，因此先做格式校验。
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('YTDLP_COOKIES_BASE64 不是有效的 Base64 内容');
  }
  const content = Buffer.from(encoded, 'base64').toString('utf8');
  if (!content.startsWith('# HTTP Cookie File') && !content.startsWith('# Netscape HTTP Cookie File')) {
    throw new Error('YTDLP_COOKIES_BASE64 必须是 Netscape cookies.txt 格式');
  }

  fs.mkdirSync(dataDir, { recursive: true });
  const target = path.join(dataDir, 'youtube-cookies.txt');
  fs.writeFileSync(target, content, { encoding: 'utf8', mode: 0o600 });
  fs.chmodSync(target, 0o600);
  return target;
}

function findYtDlp(): string | null {
  const explicit = process.env.YTDLP_PATH;
  if (explicit && explicit.trim() !== '') {
    return fs.existsSync(explicit) ? explicit : null;
  }
  const candidates = ['yt-dlp'];
  if (process.platform === 'win32') candidates.unshift('yt-dlp.exe');
  // 常见自装位置（macOS/Linux）
  candidates.push(
    path.join(process.env.HOME || '', '.local', 'bin', 'yt-dlp'),
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
  );
  for (const c of candidates) {
    try {
      if (c.includes('/')) {
        if (fs.existsSync(c)) return c;
      } else {
        // 通过 which 语义：尝试用 child_process 同步探测代价过高，交给下载时兜底
        return null; // 交给运行时解析 PATH
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

export function loadConfig(): Config {
  const simulateRaw = str(process.env.SIMULATE, 'auto').trim().toLowerCase();
  const simulate: Config['simulate'] = ['1', 'true', 'yes', 'on'].includes(simulateRaw)
    ? 'on'
    : ['0', 'false', 'no', 'off'].includes(simulateRaw)
      ? 'off'
      : 'auto';

  const version = (() => {
    try {
      // 打包后 package.json 位于 server/dist 的上一级
      const pkg = require(path.join(__dirname, '..', 'package.json')) as {
        version?: string;
      };
      return pkg.version ?? '1.0.0';
    } catch {
      return '1.0.0';
    }
  })();

  return {
    port: int(process.env.PORT, 45392),
    host: str(process.env.HOST, '0.0.0.0'),
    dataDir: DATA_DIR,
    dbPath: str(process.env.DB_PATH, '').trim()
      ? resolvePath(process.env.DB_PATH as string)
      : path.join(DATA_DIR, 'app.db'),
    downloadDir: str(process.env.DOWNLOAD_DIR, '').trim()
      ? resolvePath(process.env.DOWNLOAD_DIR as string)
      : path.join(DATA_DIR, 'downloads'),
    maxConcurrent: int(process.env.MAX_CONCURRENT, 3),
    defaultQuality: str(process.env.DEFAULT_QUALITY, '1080p'),
    defaultFormat: str(process.env.DEFAULT_FORMAT, 'mp4'),
    maxSpeed: int(process.env.MAX_SPEED, 0),
    timeout: int(process.env.TIMEOUT, 60000),
    retries: int(process.env.RETRY_COUNT, 3),
    cookiesFromBrowser: str(process.env.YTDLP_COOKIES_FROM_BROWSER, ''),
    cookiesFile: resolveCookiesFile(DATA_DIR),
    cookieAdminToken: str(process.env.COOKIE_ADMIN_TOKEN, '').trim(),
    ytdlpPath: findYtDlp(),
    simulate,
    version,
  };
}

export const config = loadConfig();
