import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { FastifyInstance } from 'fastify';
import { deleteTaskRow, getTask, listTasks, updateTask } from './db';
import { AppError, ErrorCodes } from './errors';
import { subscribe } from './events';
import { PLATFORMS, validateUrl } from './platform';
import { queue } from './queue';
import { resolveVideo } from './resolver';
import { getSettings, getSystemInfo, resetSettings, updateSettings } from './settings';
import { computeStats } from './stats';
import type { PlatformId, Task } from './types';

function asPlatform(s: unknown): PlatformId | undefined {
  const ids = PLATFORMS.map((p) => p.id);
  return typeof s === 'string' && ids.includes(s as PlatformId) ? (s as PlatformId) : undefined;
}

/**
 * 调起运行服务的本机文件夹选择器。
 * 浏览器无法直接读取本地路径，因此由本地 Node 服务完成这一交互。
 */
function selectDirectory(): Promise<string | null> {
  const commands: Record<string, { command: string; args: string[] }> = {
    darwin: {
      command: 'osascript',
      args: ['-e', 'POSIX path of (choose folder with prompt "请选择下载保存位置")'],
    },
    win32: {
      command: 'powershell.exe',
      args: [
        '-NoProfile',
        '-STA',
        '-Command',
        'Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.FolderBrowserDialog; $dialog.Description = "请选择下载保存位置"; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($dialog.SelectedPath) }',
      ],
    },
    linux: {
      command: 'zenity',
      args: ['--file-selection', '--directory', '--title=请选择下载保存位置'],
    },
  };
  const picker = commands[process.platform];
  if (!picker) {
    return Promise.reject(new AppError(ErrorCodes.INTERNAL, '当前系统不支持选择本地文件夹', 501));
  }

  return new Promise((resolve, reject) => {
    const child = spawn(picker.command, picker.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.once('error', () => {
      const installHint = process.platform === 'linux' ? '，请安装 zenity 后重试' : '';
      reject(new AppError(ErrorCodes.INTERNAL, `无法打开本地文件夹选择器${installHint}`, 500));
    });
    child.once('close', (code) => {
      const dir = stdout.trim();
      if (code === 0 && dir) {
        resolve(dir);
        return;
      }
      if (!dir) {
        resolve(null);
        return;
      }
      reject(new AppError(ErrorCodes.INTERNAL, stderr.trim() || '无法选择本地文件夹', 500));
    });
  });
}

export function registerRoutes(app: FastifyInstance): void {
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      reply.status(err.statusCode).send({ error: err.code, message: err.message });
      return;
    }
    req.log.error(err);
    reply.status(500).send({ error: ErrorCodes.INTERNAL, message: '服务器内部错误' });
  });

  /* ---------------- 基础 ---------------- */

  app.get('/api/health', async () => {
    const mem = process.memoryUsage();
    return {
      ok: true,
      uptime: process.uptime(),
      timestamp: Date.now(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      cpu: process.cpuUsage(),
    };
  });

  app.get('/api/platforms', async () => {
    return PLATFORMS.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  });

  // 哔哩哔哩图片 CDN 会校验 Referer，浏览器从本地应用直接加载会得到 403。
  // 仅代理其公开封面域名，避免该接口成为任意 URL 的转发入口。
  app.get<{ Querystring: { url?: string } }>('/api/thumbnail', async (req, reply) => {
    const rawUrl = req.query.url;
    let url: URL;
    try {
      url = new URL(rawUrl ?? '');
    } catch {
      throw new AppError(ErrorCodes.INVALID_URL, '封面地址无效', 400);
    }
    if (url.protocol !== 'https:' || !/^i\d+\.hdslb\.com$/i.test(url.hostname)) {
      throw new AppError(ErrorCodes.INVALID_URL, '不支持的封面地址', 400);
    }

    const response = await fetch(url, {
      headers: {
        Referer: 'https://www.bilibili.com/',
        'User-Agent': 'Mozilla/5.0 (compatible; VidFetch/1.0)',
      },
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.startsWith('image/')) {
      throw new AppError(ErrorCodes.NETWORK_ERROR, '无法获取视频封面', 502);
    }
    reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=86400')
      .send(Buffer.from(await response.arrayBuffer()));
  });

  app.post('/api/system/select-directory', async () => {
    const dir = await selectDirectory();
    return { cancelled: !dir, dir: dir ?? '' };
  });

  /* ---------------- 解析 ---------------- */

  app.post<{ Body: { url?: string } }>('/api/resolve', async (req) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      throw new AppError(ErrorCodes.INVALID_URL, '请输入视频链接', 400);
    }
    const v = validateUrl(url);
    if (!v.ok) {
      throw new AppError(v.errorCode ?? ErrorCodes.INVALID_URL, v.error ?? 'URL 无效', 400);
    }
    const video = await resolveVideo(v.normalized as string, v.platform as PlatformId);
    return { video };
  });

  /* ---------------- 任务 ---------------- */

  app.post<{
    Body: {
      url?: string;
      formatId?: string;
      quality?: string;
      ext?: string;
      resolution?: string;
      saveDir?: string;
    };
  }>('/api/tasks', async (req) => {
    const body = req.body ?? {};
    if (!body.url) {
      throw new AppError(ErrorCodes.INVALID_URL, '请输入视频链接', 400);
    }
    const task = await queue.createTask({ ...body, url: body.url });
    return task;
  });

  app.get<{ Querystring: Record<string, string | undefined> }>('/api/tasks', async (req) => {
    const q = req.query;
    const statuses = q.status ? (q.status.split(',') as Task['status'][]) : undefined;
    const platform = asPlatform(q.platform);
    return listTasks({
      statuses,
      platform,
      search: q.search,
      orderBy: (q.orderBy as 'createdAt' | 'updatedAt' | 'completedAt' | undefined) ?? 'createdAt',
      orderDir: (q.orderDir as 'asc' | 'desc' | undefined) ?? 'desc',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    const t = getTask(req.params.id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    return t;
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/pause', async (req) => {
    return queue.pause(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/resume', async (req) => {
    return queue.resume(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/cancel', async (req) => {
    return queue.cancel(req.params.id);
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/retry', async (req) => {
    return queue.retry(req.params.id);
  });

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req) => {
    queue.remove(req.params.id);
    return { ok: true };
  });

  /* ---------------- 文件管理 ---------------- */

  app.delete<{ Params: { id: string } }>('/api/tasks/:id/file', async (req) => {
    const t = getTask(req.params.id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    if (!t.filePath) throw new AppError(ErrorCodes.NOT_FOUND, '该任务没有已下载的文件', 404);
    try {
      fs.unlinkSync(t.filePath);
    } catch (err) {
      throw new AppError(ErrorCodes.NOT_FOUND, '文件不存在或已被删除', 404);
    }
    t.filePath = '';
    t.updatedAt = Date.now();
    updateTask(t);
    return { ok: true, task: t };
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/open', async (req) => {
    const t = getTask(req.params.id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '任务不存在', 404);
    const dir = t.filePath ? path.dirname(t.filePath) : t.saveDir;
    if (!dir || !fs.existsSync(dir)) {
      throw new AppError(ErrorCodes.NOT_FOUND, '目录不存在', 404);
    }
    const cmd =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
    const child = spawn(cmd, [dir], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, dir };
  });

  /* ---------------- 历史 ---------------- */

  app.get<{ Querystring: Record<string, string | undefined> }>('/api/history', async (req) => {
    const q = req.query;
    const terminal: Task['status'][] = ['completed', 'failed', 'cancelled'];
    let statuses: Task['status'][] = terminal;
    if (q.status && terminal.includes(q.status as Task['status'])) {
      statuses = [q.status as Task['status']];
    }
    return listTasks({
      statuses,
      platform: asPlatform(q.platform),
      search: q.search,
      orderBy: (q.orderBy as 'createdAt' | 'updatedAt' | 'completedAt' | undefined) ?? 'updatedAt',
      orderDir: (q.orderDir as 'asc' | 'desc' | undefined) ?? 'desc',
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
    });
  });

  app.delete<{ Params: { id: string } }>('/api/history/:id', async (req) => {
    const t = getTask(req.params.id);
    if (!t) throw new AppError(ErrorCodes.TASK_NOT_FOUND, '记录不存在', 404);
    deleteTaskRow(t.id);
    return { ok: true };
  });

  app.delete('/api/history', async () => {
    const terminal = ['completed', 'failed', 'cancelled'] as Task['status'][];
    const rows = listTasks({ statuses: terminal });
    for (const t of rows) deleteTaskRow(t.id);
    return { ok: true, count: rows.length };
  });

  /* ---------------- 统计与设置 ---------------- */

  app.get('/api/stats', async () => computeStats());

  app.get('/api/settings', async () => getSettings());

  app.put<{ Body: Record<string, unknown> }>('/api/settings', async (req) => {
    return updateSettings(req.body ?? {});
  });

  app.post('/api/settings/reset', async () => resetSettings());

  app.get('/api/system', async () => getSystemInfo());

  /* ---------------- SSE 实时推送 ---------------- */

  app.get('/api/events', (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(': connected\n\n');

    const unsub = subscribe((ev) => {
      try {
        reply.raw.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.data)}\n\n`);
      } catch {
        /* ignore */
      }
    });

    const heartbeat = setInterval(() => {
      try {
        reply.raw.write(': ping\n\n');
      } catch {
        /* ignore */
      }
    }, 25000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsub();
    });
  });
}
