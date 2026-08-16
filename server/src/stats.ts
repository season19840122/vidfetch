import { listTasks } from './db';
import { PLATFORMS } from './platform';
import type { Task } from './types';

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
  platformCounts: Array<{ platform: string; name: string; color: string; count: number }>;
  dailyDownloads: Array<{ date: string; count: number }>;
  recentTasks: Task[];
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function computeStats(): DashboardStats {
  const all = listTasks({ orderBy: 'createdAt', orderDir: 'desc' });
  const todayStart = startOfToday();

  let todayTotal = 0;
  let todayCompleted = 0;
  let todayFailed = 0;
  let downloading = 0;
  let waiting = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;
  let downloadedBytes = 0;

  const platformMap = new Map<string, number>();

  for (const t of all) {
    const p = platformMap.get(t.platform) ?? 0;
    platformMap.set(t.platform, p + 1);

    if (t.createdAt >= todayStart) todayTotal++;
    if (t.status === 'downloading' || t.status === 'parsing') downloading++;
    if (t.status === 'waiting' || t.status === 'paused') waiting++;
    if (t.status === 'completed') {
      completed++;
      downloadedBytes += t.filesize || 0;
      if (t.completedAt && t.completedAt >= todayStart) todayCompleted++;
    }
    if (t.status === 'failed') {
      failed++;
      if (t.updatedAt >= todayStart) todayFailed++;
    }
    if (t.status === 'cancelled') cancelled++;
  }

  const platformCounts = PLATFORMS.map((meta) => ({
    platform: meta.id,
    name: meta.name,
    color: meta.color,
    count: platformMap.get(meta.id) ?? 0,
  }));

  // 未在已知列表中的站点聚合为「其他网站」
  const knownIds = new Set(PLATFORMS.map((p) => p.id));
  let otherCount = 0;
  for (const [id, count] of platformMap) {
    if (!knownIds.has(id as never)) otherCount += count;
  }
  if (otherCount > 0) {
    platformCounts.push({ platform: 'other', name: '其他网站', color: '#6366f1', count: otherCount });
  }
  platformCounts.sort((a, b) => b.count - a.count);

  // 每日下载量（最近 14 天，按完成时间）
  const dailyMap = new Map<string, number>();
  const now = new Date();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dailyMap.set(key, 0);
  }
  for (const t of all) {
    if (t.status === 'completed' && t.completedAt) {
      const d = new Date(t.completedAt);
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    }
  }
  const dailyDownloads = Array.from(dailyMap.entries()).map(([date, count]) => ({ date, count }));

  const finished = completed + failed;
  const successRate = finished > 0 ? Math.round((completed / finished) * 1000) / 10 : 100;

  return {
    today: {
      total: todayTotal,
      completed: todayCompleted,
      downloading,
      failed: todayFailed,
    },
    totals: {
      tasks: all.length,
      completed,
      failed,
      cancelled,
      downloading,
      waiting,
      downloadedBytes,
    },
    successRate,
    platformCounts,
    dailyDownloads,
    recentTasks: all.slice(0, 8),
  };
}
