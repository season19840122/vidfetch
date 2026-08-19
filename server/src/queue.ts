import { randomUUID } from 'node:crypto';
import { deleteTaskRow, getTask, insertTask, listTasks, updateTask } from './db';
import { startDownload, type DownloadHandle } from './downloader';
import { AppError, ErrorCodes } from './errors';
import { publish } from './events';
import { validateUrl } from './platform';
import { getResolveCache, resolveVideo } from './resolver';
import { getSettings, resolveSaveDir, shouldSimulate } from './settings';
import type { FormatInfo, PlatformId, Task, TaskStatus, VideoInfo } from './types';

const TERMINAL: TaskStatus[] = ['completed', 'failed', 'cancelled'];

function isTerminal(s: TaskStatus): boolean {
  return TERMINAL.includes(s);
}

export interface CreateTaskInput {
  url: string;
  formatId?: string;
  quality?: string;
  ext?: string;
  resolution?: string;
  saveDir?: string;
}

/** 根据默认质量/格式挑选最佳可用格式。 */
export function pickFormat(info: VideoInfo, quality: string, ext: string): FormatInfo {
  const videoFormats = info.formats.filter((f) => f.resolution !== 'audio');
  const audioFormat = info.formats.find((f) => f.resolution === 'audio');
  if (quality === 'audio') return audioFormat ?? info.formats[0];

  const targetH = quality === 'best' ? Infinity : parseInt(quality, 10) || Infinity;

  let best: FormatInfo | null = null;
  for (const f of videoFormats) {
    if (f.height > targetH) continue;
    if (ext && ext !== 'm4a' && f.ext !== ext) continue;
    if (!best || f.height > best.height) best = f;
  }
  if (!best) {
    for (const f of videoFormats) {
      if (f.height > targetH) continue;
      if (!best || f.height > best.height) best = f;
    }
  }
  return best ?? audioFormat ?? info.formats[0];
}

class TaskQueue {
  /** 正在运行（解析中或下载中）的任务 id。 */
  private running = new Set<string>();
  /** 下载中的任务对应的可控制句柄。 */
  private handles = new Map<string, DownloadHandle>();
  /** 等待执行的任务 id 队列。 */
  private pending: string[] = [];
  /** 已被请求取消、待 runTask 收敛的任务。 */
  private cancelRequested = new Set<string>();
  private lastPersist = new Map<string, number>();
  private draining = false;

  /** 服务启动：恢复中断任务。 */
  init(): void {
    const recoverable = listTasks({ statuses: ['downloading', 'waiting', 'parsing'] });
    for (const t of recoverable) {
      t.status = 'waiting';
      t.speed = 0;
      t.eta = 0;
      t.errorCode = '';
      t.errorMessage = '';
      updateTask(t);
      publish({ type: 'task', data: t });
    }
    this.pending = recoverable.map((t) => t.id);
    // paused 任务保持 paused，等待用户手动继续
    void this.drain();
  }

  private maxConcurrent(): number {
    const n = getSettings()['download.maxConcurrent'];
    return [1, 2, 3, 5, 10].includes(n) ? n : 3;
  }

  enqueue(id: string): void {
    const t = getTask(id);
    if (!t || isTerminal(t.status)) return;
    if (!this.pending.includes(id) && !this.running.has(id)) {
      this.pending.push(id);
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      const max = this.maxConcurrent();
      while (this.pending.length > 0 && this.running.size < max) {
        const id = this.pending.shift() as string;
        const t = getTask(id);
        if (!t) continue;
        if (isTerminal(t.status)) continue;
        if (this.cancelRequested.has(id)) {
          this.markCancelled(id);
          continue;
        }
        this.running.add(id);
        void this.runTask(id);
      }
    } finally {
      this.draining = false;
    }
  }

  /* ---------------- 任务创建 ---------------- */

  async createTask(input: CreateTaskInput): Promise<Task> {
    const v = validateUrl(input.url);
    if (!v.ok) {
      throw new AppError(v.errorCode ?? ErrorCodes.INVALID_URL, v.error ?? 'URL 无效', 400);
    }
    const normalized = v.normalized as string;
    const platform = v.platform as PlatformId;

    // 重复任务检测（同一 URL 尚未结束）
    const dup = listTasks({ statuses: ['waiting', 'parsing', 'downloading', 'paused'] }).find(
      (t) => t.url === normalized,
    );
    if (dup) {
      throw new AppError(ErrorCodes.DUPLICATE, '该视频已在下载队列中，请勿重复添加', 409);
    }

    const settings = getSettings();
    const quality = input.quality ?? settings['download.defaultQuality'];
    const ext = input.ext ?? settings['download.defaultFormat'];
    const saveDir = resolveSaveDir(input.saveDir);

    const now = Date.now();
    const id = randomUUID();

    const task: Task = {
      id,
      url: normalized,
      platform,
      title: '',
      thumbnail: '',
      author: '',
      duration: 0,
      formatId: input.formatId ?? '',
      formatExt: ext,
      resolution: input.resolution ?? '',
      quality,
      filesize: 0,
      saveDir,
      status: 'waiting',
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      errorCode: '',
      errorMessage: '',
      filePath: '',
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      completedAt: null,
    };

    // 若解析缓存命中（用户刚预览过），直接填充元信息
    const cached = getResolveCache(normalized);
    if (cached) {
      task.title = cached.title;
      task.thumbnail = cached.thumbnail;
      task.author = cached.author;
      task.duration = cached.duration;
      if (!task.formatId) {
        const fmt = pickFormat(cached, quality, ext);
        task.formatId = fmt.id;
        task.formatExt = fmt.ext;
        task.resolution = fmt.resolution;
        task.filesize = fmt.filesize;
      } else {
        const fmt = cached.formats.find((f) => f.id === task.formatId);
        if (fmt) {
          task.formatExt = fmt.ext;
          task.resolution = fmt.resolution;
          task.filesize = fmt.filesize;
        }
      }
      task.status = 'waiting';
    }

    insertTask(task);
    publish({ type: 'task', data: task });
    this.enqueue(id);
    return task;
  }

  /* ---------------- 核心执行 ---------------- */

  private async runTask(id: string): Promise<void> {
    let t = getTask(id);
    if (!t) {
      this.running.delete(id);
      void this.drain();
      return;
    }

    try {
      // 补充元信息
      if (!t.title || !t.formatId) {
        t.status = 'parsing';
        t.updatedAt = Date.now();
        updateTask(t);
        publish({ type: 'task', data: t });

        if (this.cancelRequested.has(id)) throw new AppError('CANCELLED', '任务已取消', 499);

        const info = await resolveVideo(t.url, t.platform);
        const refreshed = getTask(id);
        if (!refreshed) throw new AppError('CANCELLED', '任务已取消', 499);
        t = refreshed;
        if (this.cancelRequested.has(id)) throw new AppError('CANCELLED', '任务已取消', 499);
        t.title = info.title;
        t.thumbnail = info.thumbnail;
        t.author = info.author;
        t.duration = info.duration;
        // 无论是否已有 formatId，都补齐格式信息（含文件大小）
        const existingFormatId = t.formatId;
        const fmt = existingFormatId
          ? info.formats.find((f) => f.id === existingFormatId) ?? pickFormat(info, t.quality, t.formatExt)
          : pickFormat(info, t.quality, t.formatExt);
        t.formatId = fmt.id;
        t.formatExt = fmt.ext;
        t.resolution = fmt.resolution;
        t.filesize = fmt.filesize;
        t.status = 'waiting';
        updateTask(t);
        publish({ type: 'task', data: t });
      }

      t = getTask(id) as Task;
      t.status = 'downloading';
      t.startedAt = t.startedAt ?? Date.now();
      t.updatedAt = Date.now();
      t.errorCode = '';
      t.errorMessage = '';
      t.speed = 0;
      t.eta = 0;
      if (t.totalBytes === 0 && t.filesize > 0) t.totalBytes = t.filesize;
      updateTask(t);
      publish({ type: 'task', data: t });

      const settings = getSettings();
      const { promise, handle } = startDownload(
        {
          url: t.url,
          platform: t.platform,
          taskId: t.id,
          title: t.title,
          formatId: t.formatId,
          quality: t.quality,
          ext: t.formatExt || 'mp4',
          outputDir: t.saveDir,
          sizeBytes: t.filesize,
          maxSpeed: settings['network.maxSpeed'],
          timeout: settings['network.timeout'],
          retries: settings['network.retries'],
          cookiesBrowser: settings['network.cookiesFromBrowser'],
          simulate: shouldSimulate(),
        },
        (p) => this.onProgress(id, p),
      );
      this.handles.set(id, handle);

      const res = await promise;
      t = getTask(id);
      if (!t) return;
      t.status = 'completed';
      t.progress = 100;
      t.speed = 0;
      t.eta = 0;
      t.filePath = res.filePath;
      if (res.size > 0) t.filesize = res.size;
      t.downloadedBytes = res.downloaded;
      t.completedAt = Date.now();
      t.updatedAt = Date.now();
      updateTask(t);
      publish({ type: 'task', data: t });
    } catch (err) {
      t = getTask(id);
      if (!t) return;
      if (err instanceof AppError && err.code === 'CANCELLED') {
        this.markCancelled(id);
      } else {
        const appErr =
          err instanceof AppError
            ? err
            : new AppError(ErrorCodes.DOWNLOAD_FAILED, '下载过程中发生未知错误', 500);
        t.status = 'failed';
        t.errorCode = appErr.code;
        t.errorMessage = appErr.message;
        t.speed = 0;
        t.eta = 0;
        t.updatedAt = Date.now();
        updateTask(t);
        publish({ type: 'task', data: t });
      }
    } finally {
      this.handles.delete(id);
      this.running.delete(id);
      this.lastPersist.delete(id);
      void this.drain();
    }
  }

  private onProgress(id: string, p: { percent: number; speed: number; eta: number; downloaded: number; total: number }): void {
    const t = getTask(id);
    if (!t) return;
    // yt-dlp 在续传、切换分段或重算总大小时可能短暂回报更小的进度。
    // 同一下载会话中的进度应只前进；用户主动“重试”会在 retry() 中显式归零。
    t.progress = Math.max(t.progress, Math.max(0, Math.min(100, p.percent)));
    t.speed = p.speed;
    t.eta = p.eta;
    t.downloadedBytes = Math.max(t.downloadedBytes, p.downloaded);
    if (p.total > 0) t.totalBytes = p.total;
    t.updatedAt = Date.now();

    const now = Date.now();
    const last = this.lastPersist.get(id) ?? 0;
    if (now - last >= 800) {
      this.lastPersist.set(id, now);
      updateTask(t);
    }
    publish({ type: 'task', data: t });
  }

  /* ---------------- 控制操作 ---------------- */

  pause(id: string): Task {
    const t = getTask(id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    if (t.status !== 'downloading') {
      throw new AppError(ErrorCodes.INVALID_STATE, '只有下载中的任务可以暂停', 409);
    }
    const h = this.handles.get(id);
    if (h) h.pause();
    t.status = 'paused';
    t.speed = 0;
    t.eta = 0;
    t.updatedAt = Date.now();
    updateTask(t);
    publish({ type: 'task', data: t });
    return t;
  }

  resume(id: string): Task {
    const t = getTask(id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    if (t.status !== 'paused') {
      throw new AppError(ErrorCodes.INVALID_STATE, '只有已暂停的任务可以继续', 409);
    }
    const h = this.handles.get(id);
    if (h) {
      h.resume();
      t.status = 'downloading';
      t.updatedAt = Date.now();
      updateTask(t);
      publish({ type: 'task', data: t });
    } else {
      // 服务重启后没有活动句柄：重新入队
      t.status = 'waiting';
      t.updatedAt = Date.now();
      updateTask(t);
      publish({ type: 'task', data: t });
      this.enqueue(id);
    }
    return t;
  }

  cancel(id: string): Task {
    const t = getTask(id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    if (isTerminal(t.status)) return t;

    this.cancelRequested.add(id);
    const h = this.handles.get(id);
    if (h) h.cancel();
    this.pending = this.pending.filter((x) => x !== id);

    if (!this.running.has(id)) {
      this.markCancelled(id);
    }
    return getTask(id) as Task;
  }

  private markCancelled(id: string): void {
    const t = getTask(id);
    if (!t) return;
    t.status = 'cancelled';
    t.speed = 0;
    t.eta = 0;
    t.updatedAt = Date.now();
    updateTask(t);
    publish({ type: 'task', data: t });
  }

  retry(id: string): Task {
    const t = getTask(id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    if (this.running.has(id)) {
      throw new AppError(ErrorCodes.INVALID_STATE, '任务仍在运行，请先取消', 409);
    }
    this.cancelRequested.delete(id);
    t.status = 'waiting';
    t.progress = 0;
    t.downloadedBytes = 0;
    t.speed = 0;
    t.eta = 0;
    t.errorCode = '';
    t.errorMessage = '';
    t.startedAt = null;
    t.completedAt = null;
    t.updatedAt = Date.now();
    updateTask(t);
    publish({ type: 'task', data: t });
    this.enqueue(id);
    return t;
  }

  /** 删除任务记录（不会删除已完成的文件）。 */
  remove(id: string): void {
    const t = getTask(id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    this.cancelRequested.add(id);
    const h = this.handles.get(id);
    if (h) h.cancel();
    this.pending = this.pending.filter((x) => x !== id);
    deleteTaskRow(id);
    publish({ type: 'tasks', data: listTasks() });
  }

  getRunningCount(): number {
    return this.running.size;
  }

  getPendingCount(): number {
    return this.pending.length;
  }
}

export const queue = new TaskQueue();
