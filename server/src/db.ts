import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import type { Task, TaskStatus, PlatformId } from './types';

let db: DatabaseSync | null = null;

export function initDb(): DatabaseSync {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  fs.mkdirSync(config.downloadDir, { recursive: true });

  const database = new DatabaseSync(config.dbPath);
  database.exec('PRAGMA journal_mode = WAL;');
  database.exec('PRAGMA busy_timeout = 5000;');

  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      platform TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      thumbnail TEXT DEFAULT '',
      author TEXT DEFAULT '',
      duration REAL DEFAULT 0,
      format_id TEXT DEFAULT '',
      format_ext TEXT DEFAULT '',
      resolution TEXT DEFAULT '',
      quality TEXT DEFAULT '',
      filesize INTEGER DEFAULT 0,
      save_dir TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      progress REAL DEFAULT 0,
      downloaded_bytes INTEGER DEFAULT 0,
      total_bytes INTEGER DEFAULT 0,
      speed REAL DEFAULT 0,
      eta INTEGER DEFAULT 0,
      error_code TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_platform ON tasks(platform);
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    -- 旧版任务会保存 yt-dlp 返回的 http 哔哩哔哩封面地址；升级为 HTTPS，
    -- 避免在 HTTPS 页面中被浏览器按混合内容拦截。
    UPDATE tasks
    SET thumbnail = REPLACE(thumbnail, 'http://', 'https://')
    WHERE platform = 'bilibili' AND thumbnail LIKE 'http://i%.hdslb.com/%';
  `);

  db = database;
  return database;
}

export function getDb(): DatabaseSync {
  if (!db) return initDb();
  return db;
}

/* ---------------- Task 行映射 ---------------- */

const COLUMNS =
  'id, url, platform, title, thumbnail, author, duration, format_id, format_ext, ' +
  'resolution, quality, filesize, save_dir, status, progress, downloaded_bytes, ' +
  'total_bytes, speed, eta, error_code, error_message, file_path, created_at, ' +
  'updated_at, started_at, completed_at';

interface TaskRow {
  [key: string]: unknown;
}

export function rowToTask(r: TaskRow): Task {
  return {
    id: String(r.id),
    url: String(r.url),
    platform: r.platform as PlatformId,
    title: String(r.title ?? ''),
    thumbnail: String(r.thumbnail ?? ''),
    author: String(r.author ?? ''),
    duration: Number(r.duration ?? 0),
    formatId: String(r.format_id ?? ''),
    formatExt: String(r.format_ext ?? ''),
    resolution: String(r.resolution ?? ''),
    quality: String(r.quality ?? ''),
    filesize: Number(r.filesize ?? 0),
    saveDir: String(r.save_dir ?? ''),
    status: r.status as TaskStatus,
    progress: Number(r.progress ?? 0),
    downloadedBytes: Number(r.downloaded_bytes ?? 0),
    totalBytes: Number(r.total_bytes ?? 0),
    speed: Number(r.speed ?? 0),
    eta: Number(r.eta ?? 0),
    errorCode: String(r.error_code ?? ''),
    errorMessage: String(r.error_message ?? ''),
    filePath: String(r.file_path ?? ''),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    startedAt: r.started_at === null || r.started_at === undefined ? null : Number(r.started_at),
    completedAt:
      r.completed_at === null || r.completed_at === undefined ? null : Number(r.completed_at),
  };
}

function taskToParams(t: Task): (string | number | null)[] {
  return [
    t.id, t.url, t.platform, t.title, t.thumbnail, t.author, t.duration, t.formatId,
    t.formatExt, t.resolution, t.quality, t.filesize, t.saveDir, t.status, t.progress,
    t.downloadedBytes, t.totalBytes, t.speed, t.eta, t.errorCode, t.errorMessage,
    t.filePath, t.createdAt, t.updatedAt, t.startedAt, t.completedAt,
  ];
}

/* ---------------- Task CRUD ---------------- */

export function insertTask(t: Task): void {
  const placeholders = new Array(26).fill('?').join(', ');
  getDb()
    .prepare(`INSERT INTO tasks (${COLUMNS}) VALUES (${placeholders})`)
    .run(...taskToParams(t));
}

export function updateTask(t: Task): void {
  getDb()
    .prepare(
      `UPDATE tasks SET url=?, platform=?, title=?, thumbnail=?, author=?, duration=?, ` +
        `format_id=?, format_ext=?, resolution=?, quality=?, filesize=?, save_dir=?, status=?, ` +
        `progress=?, downloaded_bytes=?, total_bytes=?, speed=?, eta=?, error_code=?, ` +
        `error_message=?, file_path=?, created_at=?, updated_at=?, started_at=?, completed_at=? ` +
        `WHERE id=?`,
    )
    .run(...taskToParams(t).slice(1), t.id);
}

export function getTask(id: string): Task | null {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined;
  return row ? rowToTask(row) : null;
}

export function deleteTaskRow(id: string): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id);
}

export interface TaskFilter {
  statuses?: TaskStatus[];
  platform?: PlatformId;
  search?: string;
  orderBy?: 'createdAt' | 'updatedAt' | 'completedAt';
  orderDir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export function listTasks(filter: TaskFilter = {}): Task[] {
  const where: string[] = [];
  const params: (string | number)[] = [];

  if (filter.statuses && filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.platform) {
    where.push('platform = ?');
    params.push(filter.platform);
  }
  if (filter.search) {
    where.push('(title LIKE ? OR url LIKE ? OR author LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  const orderBy = filter.orderBy ?? 'createdAt';
  const orderDir = filter.orderDir ?? 'desc';
  const columnMap: Record<string, string> = {
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    completedAt: 'completed_at',
  };
  const orderColumn = columnMap[orderBy] ?? 'created_at';

  let sql = `SELECT ${COLUMNS} FROM tasks`;
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ` ORDER BY ${orderColumn} ${orderDir === 'asc' ? 'ASC' : 'DESC'}`;
  if (filter.limit !== undefined) {
    sql += ' LIMIT ?';
    params.push(filter.limit);
  }
  if (filter.offset !== undefined) {
    sql += ' OFFSET ?';
    params.push(filter.offset);
  }

  const rows = getDb().prepare(sql).all(...params) as TaskRow[];
  return rows.map(rowToTask);
}

export function countTasks(filter: TaskFilter = {}): number {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.statuses && filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.platform) {
    where.push('platform = ?');
    params.push(filter.platform);
  }
  if (filter.search) {
    where.push('(title LIKE ? OR url LIKE ? OR author LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  let sql = 'SELECT COUNT(*) AS c FROM tasks';
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  const row = getDb().prepare(sql).get(...params) as { c: number };
  return Number(row.c);
}

/* ---------------- Settings 键值 ---------------- */

export function getSettingRaw(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

export function setSettingRaw(key: string, value: string): void {
  getDb()
    .prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}
