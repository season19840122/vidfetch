import type {
  AppSettings,
  DashboardStats,
  PlatformMeta,
  SystemInfo,
  Task,
  VideoInfo,
} from '@/types';

const BASE = '/api';

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = 'ERROR', status = 500) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('无法连接到服务器，请确认后端已启动', 'NETWORK_ERROR', 0);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* 非 JSON 响应 */
  }

  if (!res.ok) {
    const obj = data as { error?: string; message?: string } | null;
    throw new ApiError(obj?.message ?? `请求失败 (${res.status})`, obj?.error ?? 'ERROR', res.status);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean }>('GET', '/health'),
  platforms: () => request<PlatformMeta[]>('GET', '/platforms'),

  resolve: (url: string) => request<{ video: VideoInfo }>('POST', '/resolve', { url }),

  createTask: (payload: {
    url: string;
    formatId?: string;
    quality?: string;
    ext?: string;
    resolution?: string;
    saveDir?: string;
  }) => request<Task>('POST', '/tasks', payload),

  listTasks: (params?: {
    status?: string;
    search?: string;
    platform?: string;
    orderBy?: string;
    orderDir?: string;
    limit?: number;
    offset?: number;
  }) => request<Task[]>('GET', '/tasks' + buildQuery({ ...params })),

  getTask: (id: string) => request<Task>('GET', `/tasks/${id}`),
  pauseTask: (id: string) => request<Task>('POST', `/tasks/${id}/pause`),
  resumeTask: (id: string) => request<Task>('POST', `/tasks/${id}/resume`),
  cancelTask: (id: string) => request<Task>('POST', `/tasks/${id}/cancel`),
  retryTask: (id: string) => request<Task>('POST', `/tasks/${id}/retry`),
  removeTask: (id: string) => request<{ ok: boolean }>('DELETE', `/tasks/${id}`),
  deleteFile: (id: string) => request<{ ok: boolean; task: Task }>('DELETE', `/tasks/${id}/file`),
  openFolder: (id: string) => request<{ ok: boolean; dir: string }>('POST', `/tasks/${id}/open`),

  listHistory: (params?: {
    status?: string;
    search?: string;
    platform?: string;
    orderBy?: string;
    orderDir?: string;
    limit?: number;
  }) => request<Task[]>('GET', '/history' + buildQuery({ ...params })),
  deleteHistory: (id: string) => request<{ ok: boolean }>('DELETE', `/history/${id}`),
  clearHistory: () => request<{ ok: boolean; count: number }>('DELETE', '/history'),

  stats: () => request<DashboardStats>('GET', '/stats'),
  settings: () => request<AppSettings>('GET', '/settings'),
  updateSettings: (patch: Partial<AppSettings>) => request<AppSettings>('PUT', '/settings', patch),
  resetSettings: () => request<AppSettings>('POST', '/settings/reset'),
  system: () => request<SystemInfo>('GET', '/system'),
};
