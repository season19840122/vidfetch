import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { config } from './config';
import { getDb, getSettingRaw, setSettingRaw } from './db';
import type { AppSettings } from './types';

/** 默认设置：环境变量优先级高于此处硬编码。 */
export function defaultSettings(): AppSettings {
  return {
    'download.defaultQuality': config.defaultQuality,
    'download.defaultFormat': config.defaultFormat,
    'download.maxConcurrent': config.maxConcurrent,
    'download.saveDir': config.downloadDir,
    'network.maxSpeed': config.maxSpeed,
    'network.timeout': config.timeout,
    'network.retries': config.retries,
    'network.cookiesFromBrowser': config.cookiesFromBrowser,
    'appearance.theme': 'system',
  };
}

const VALID_CONCURRENCY = [1, 2, 3, 5, 10];
const VALID_QUALITY = ['best', '2160p', '1440p', '1080p', '720p', '480p', '360p', 'audio'];
const VALID_FORMAT = ['mp4', 'webm', 'mkv', 'm4a'];
const VALID_COOKIES_BROWSER = ['', 'chrome', 'firefox', 'edge', 'safari', 'brave', 'chromium', 'off', 'none'];

function coerce(key: keyof AppSettings, raw: string): AppSettings[keyof AppSettings] {
  switch (key) {
    case 'download.maxConcurrent':
      return VALID_CONCURRENCY.includes(Number(raw)) ? Number(raw) : config.maxConcurrent;
    case 'network.maxSpeed':
    case 'network.timeout':
    case 'network.retries': {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? n : (defaultSettings()[key] as number);
    }
    case 'download.defaultQuality':
      return VALID_QUALITY.includes(raw) ? raw : config.defaultQuality;
    case 'download.defaultFormat':
      return VALID_FORMAT.includes(raw) ? raw : config.defaultFormat;
    case 'network.cookiesFromBrowser':
      return VALID_COOKIES_BROWSER.includes(raw) ? raw : '';
    case 'appearance.theme':
      return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
    default:
      return raw;
  }
}

export function getSettings(): AppSettings {
  const s = defaultSettings();
  for (const key of Object.keys(s) as (keyof AppSettings)[]) {
    const raw = getSettingRaw(key);
    if (raw !== null) {
      (s as unknown as Record<string, unknown>)[key] = coerce(key, raw);
    }
  }
  return s;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const next: AppSettings = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    const key = k as keyof AppSettings;
    if (v === undefined) continue;
    // 校验并写入
    const raw = String(v);
    (next as unknown as Record<string, unknown>)[key] = coerce(key, raw);
    setSettingRaw(key, raw);
  }
  return next;
}

export function resetSettings(): AppSettings {
  const s = defaultSettings();
  for (const key of Object.keys(s) as (keyof AppSettings)[]) {
    setSettingRaw(key, String(s[key]));
  }
  return s;
}

/* ---------------- 系统状态 ---------------- */

export interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  database: {
    connected: boolean;
    path: string;
    sizeBytes: number;
    taskCount: number;
  };
  downloadDir: {
    path: string;
    exists: boolean;
    writable: boolean;
    fileCount: number;
  };
  disk: {
    total: number;
    free: number;
    used: number;
  };
  resolver: {
    ytdlpAvailable: boolean;
    simulate: boolean;
  };
}

export function getSystemInfo(): SystemInfo {
  const db = getDb();
  let dbSize = 0;
  try {
    dbSize = fs.statSync(config.dbPath).size;
  } catch {
    /* ignore */
  }
  const countRow = db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number } | undefined;
  const taskCount = countRow ? Number(countRow.c) : 0;

  const dirExists = fs.existsSync(config.downloadDir);
  let writable = false;
  let fileCount = 0;
  if (dirExists) {
    try {
      fs.accessSync(config.downloadDir, fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    try {
      fileCount = fs.readdirSync(config.downloadDir).length;
    } catch {
      fileCount = 0;
    }
  }

  let disk = { total: 0, free: 0, used: 0 };
  try {
    const stat = fs.statfsSync(config.downloadDir);
    disk = {
      total: Number(stat.blocks * stat.bsize),
      free: Number(stat.bavail * stat.bsize),
      used: Number((stat.blocks - stat.bavail) * stat.bsize),
    };
  } catch {
    /* ignore */
  }

  return {
    version: config.version,
    nodeVersion: process.version,
    platform: `${os.platform()} ${os.release()}`,
    database: {
      connected: true,
      path: config.dbPath,
      sizeBytes: dbSize,
      taskCount,
    },
    downloadDir: {
      path: config.downloadDir,
      exists: dirExists,
      writable,
      fileCount,
    },
    disk,
    resolver: {
      ytdlpAvailable: isYtDlpAvailable(),
      simulate: shouldSimulate(),
    },
  };
}

export function isYtDlpAvailable(): boolean {
  if (config.simulate === 'on') return false;
  if (config.ytdlpPath) return true;
  // PATH 查找交给运行时；这里用 spawnSync 探测一次（轻量）
  const { spawnSync } = require('node:child_process') as typeof import('node:child_process');
  const r = spawnSync('yt-dlp', ['--version'], { timeout: 5000, encoding: 'utf8' });
  return r.status === 0;
}

export function shouldSimulate(): boolean {
  if (config.simulate === 'on') return true;
  if (config.simulate === 'off') return false;
  return !isYtDlpAvailable();
}

export function resolveSaveDir(requested?: string): string {
  const dir = requested && requested.trim() ? path.resolve(requested.trim()) : getSettings()['download.saveDir'];
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
