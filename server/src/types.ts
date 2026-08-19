/**
 * 全局共享类型定义。
 */

export type PlatformId =
  | 'youtube'
  | 'bilibili'
  | 'vimeo'
  | 'x'
  | 'tiktok'
  | 'douyin'
  | 'instagram'
  | 'other';

export type TaskStatus =
  | 'waiting'
  | 'parsing'
  | 'downloading'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** 单个可用格式/清晰度。 */
export interface FormatInfo {
  /** yt-dlp format_id。 */
  id: string;
  /** 容器扩展名：mp4 / webm / mkv / m4a ... */
  ext: string;
  /** 人类可读分辨率："1080p" / "720p" / "audio"。 */
  resolution: string;
  /** 高度像素，纯音频为 0。 */
  height: number;
  /** 备注，例如 "HDR" / "60fps"。 */
  note: string;
  /** 字节大小，未知为 0。 */
  filesize: number;
  vcodec: string;
  acodec: string;
}

/** URL 解析得到的视频元信息。 */
export interface VideoInfo {
  url: string;
  platform: PlatformId;
  title: string;
  thumbnail: string;
  author: string;
  /** 秒。 */
  duration: number;
  formats: FormatInfo[];
}

/** 下载任务（数据库持久化后的完整结构）。 */
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

/** 进度回调。 */
export interface DownloadProgress {
  percent: number;
  speed: number;
  eta: number;
  downloaded: number;
  total: number;
}

/** 下载结果。 */
export interface DownloadResult {
  filePath: string;
  size: number;
  downloaded: number;
}

/** 应用设置结构。 */
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

export type ServerEvent =
  | { type: 'task'; data: Task }
  | { type: 'tasks'; data: Task[] }
  | { type: 'settings'; data: Partial<AppSettings> }
  | { type: 'stats'; data: unknown };
