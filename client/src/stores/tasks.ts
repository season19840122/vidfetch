import { defineStore } from 'pinia';
import { api, API_BASE } from '@/api';
import type { Task } from '@/types';

const TERMINAL = ['completed', 'failed', 'cancelled'];

let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: [] as Task[],
    connected: false,
    loaded: false,
  }),
  getters: {
    activeTasks: (s) => s.tasks.filter((t) => !TERMINAL.includes(t.status)),
    terminalTasks: (s) => s.tasks.filter((t) => TERMINAL.includes(t.status)),
    byId: (s) => (id: string) => s.tasks.find((t) => t.id === id),
    activeCount: (s) =>
      s.tasks.filter((t) => t.status === 'downloading' || t.status === 'parsing').length,
    waitingCount: (s) => s.tasks.filter((t) => t.status === 'waiting').length,
  },
  actions: {
    async fetch() {
      try {
        this.tasks = await api.listTasks();
        this.loaded = true;
      } catch {
        /* 后端未就绪 */
      }
    },
    upsert(task: Task) {
      const i = this.tasks.findIndex((t) => t.id === task.id);
      if (i >= 0) this.tasks[i] = task;
      else this.tasks.unshift(task);
    },
    replace(list: Task[]) {
      this.tasks = list;
      this.loaded = true;
    },
    removeLocal(id: string) {
      this.tasks = this.tasks.filter((t) => t.id !== id);
    },

    connect() {
      if (typeof EventSource !== 'undefined') {
        eventSource = new EventSource(`${API_BASE}/events`);
        eventSource.onopen = () => {
          this.connected = true;
          void this.fetch();
        };
        eventSource.addEventListener('task', (e: MessageEvent) => {
          try {
            this.upsert(JSON.parse(e.data) as Task);
          } catch {
            /* ignore */
          }
        });
        eventSource.addEventListener('tasks', (e: MessageEvent) => {
          try {
            this.replace(JSON.parse(e.data) as Task[]);
          } catch {
            /* ignore */
          }
        });
        eventSource.onerror = () => {
          this.connected = false;
        };
      } else {
        // 降级：轮询
        void this.fetch();
        pollTimer = setInterval(() => void this.fetch(), 3000);
      }
    },

    disconnect() {
      eventSource?.close();
      eventSource = null;
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    },

    async add(payload: {
      url: string;
      formatId?: string;
      quality?: string;
      ext?: string;
      resolution?: string;
      saveDir?: string;
    }) {
      const t = await api.createTask(payload);
      this.upsert(t);
      return t;
    },
    async pause(id: string) {
      const t = await api.pauseTask(id);
      this.upsert(t);
      return t;
    },
    async resume(id: string) {
      const t = await api.resumeTask(id);
      this.upsert(t);
      return t;
    },
    async cancel(id: string) {
      const t = await api.cancelTask(id);
      this.upsert(t);
      return t;
    },
    async retry(id: string) {
      const t = await api.retryTask(id);
      this.upsert(t);
      return t;
    },
    async remove(id: string) {
      await api.removeTask(id);
      this.removeLocal(id);
    },
    async deleteFile(id: string) {
      const { task } = await api.deleteFile(id);
      this.upsert(task);
    },
  },
});
