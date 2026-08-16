export type PlatformId = 'youtube' | 'bilibili' | 'vimeo' | 'x' | 'tiktok' | 'instagram' | 'other';

export type TaskStatus =
  | 'waiting'
  | 'parsing'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface FormatInfo {
  id: string;
  ext: string;
  resolution: string;
  height: number;
  note: string;
  filesize: number;
  vcodec: string;
  acodec: string;
}

export interface VideoInfo {
  url: string;
  platform: PlatformId;
  title: string;
  thumbnail: string;
  author: string;
  duration: number;
  formats: FormatInfo[];
}

export interface Task {
  id: string;
  url: string;
  platform: PlatformId;
  title: string;
  thumbnail: string;
  author: string;
  duration: number;
  formatId: string;
  formatExt: string;
  resolution: string;
  quality: string;
  filesize: number;
  saveDir: string;
  status: TaskStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  speed: number;
  eta: number;
  errorCode: string;
  errorMessage: string;
  filePath: string;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

export interface AppSettings {
  'download.defaultQuality': string;
  'download.defaultFormat': string;
  'download.maxConcurrent': number;
  'download.saveDir': string;
  'network.maxSpeed': number;
  'network.timeout': number;
  'network.retries': number;
  'network.cookiesFromBrowser': string;
  'appearance.theme': 'light' | 'dark' | 'system';
}

export interface PlatformMeta {
  id: PlatformId;
  name: string;
  color: string;
}

export interface SystemInfo {
  version: string;
  nodeVersion: string;
  platform: string;
  database: { connected: boolean; path: string; sizeBytes: number; taskCount: number };
  downloadDir: { path: string; exists: boolean; writable: boolean; fileCount: number };
  disk: { total: number; free: number; used: number };
  resolver: { ytdlpAvailable: boolean; simulate: boolean };
}

export interface DashboardStats {
  today: { total: number; completed: number; downloading: number; failed: number };
  totals: {
    tasks: number;
    completed: number;
    failed: number;
    cancelled: number;
    downloading: number;
    waiting: number;
    downloadedBytes: number;
  };
  successRate: number;
  platformCounts: Array<{ platform: PlatformId; name: string; color: string; count: number }>;
  dailyDownloads: Array<{ date: string; count: number }>;
  recentTasks: Task[];
}
