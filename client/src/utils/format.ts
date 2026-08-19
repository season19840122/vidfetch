import type { PlatformId, TaskStatus } from '@/types';

export function formatBytes(n: number): string {
  if (!n || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 100 ? Math.round(v).toString() : v.toFixed(1)} ${units[i]}`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '—';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const s = Math.floor(sec % 60);
  const m = Math.floor((sec / 60) % 60);
  const h = Math.floor(sec / 3600);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatEta(sec: number): string {
  if (!sec || sec <= 0) return '—';
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatDateTime(ts: number | null): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface PlatformStyle {
  name: string;
  color: string;
}

export const PLATFORM_META: Record<PlatformId, PlatformStyle> = {
  youtube: { name: 'YouTube', color: '#FF0033' },
  bilibili: { name: 'Bilibili', color: '#FB7299' },
  vimeo: { name: 'Vimeo', color: '#1AB7EA' },
  x: { name: 'X', color: '#0f0f0f' },
  tiktok: { name: 'TikTok', color: '#010101' },
  douyin: { name: '抖音', color: '#161823' },
  instagram: { name: 'Instagram', color: '#E1306C' },
  other: { name: '其他网站', color: '#6366f1' },
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  waiting: '等待中',
  parsing: '解析中',
  downloading: '下载中',
  paused: '已暂停',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const STATUS_STYLE: Record<TaskStatus, string> = {
  waiting: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  parsing: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  downloading: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  paused: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  failed: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  cancelled: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

export const STATUS_DOT: Record<TaskStatus, string> = {
  waiting: 'bg-slate-400',
  parsing: 'bg-sky-500',
  downloading: 'bg-indigo-500',
  paused: 'bg-amber-500',
  completed: 'bg-emerald-500',
  failed: 'bg-rose-500',
  cancelled: 'bg-slate-400',
};
