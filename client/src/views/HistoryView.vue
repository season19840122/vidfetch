<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import Modal from '@/components/Modal.vue';
import PlatformBadge from '@/components/PlatformBadge.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import EmptyState from '@/components/EmptyState.vue';
import { api } from '@/api';
import { useTasksStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toast';
import type { PlatformId, TaskStatus } from '@/types';
import { formatBytes, formatDateTime, PLATFORM_META } from '@/utils/format';

const tasksStore = useTasksStore();
const toastStore = useToastStore();

const search = ref('');
const platform = ref<string>('');
const status = ref<string>('');
const sortDesc = ref(true);
const confirmClear = ref(false);

const platforms = Object.entries(PLATFORM_META).map(([id, m]) => ({ id, ...m }));
const statuses: Array<{ id: TaskStatus; label: string }> = [
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败' },
  { id: 'cancelled', label: '已取消' },
];

const filtered = computed(() => {
  let list = tasksStore.terminalTasks;
  if (search.value.trim()) {
    const q = search.value.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.url.toLowerCase().includes(q) ||
        t.author.toLowerCase().includes(q),
    );
  }
  if (platform.value) list = list.filter((t) => t.platform === platform.value);
  if (status.value) list = list.filter((t) => t.status === status.value);
  return [...list].sort((a, b) =>
    sortDesc.value ? (b.updatedAt ?? 0) - (a.updatedAt ?? 0) : (a.updatedAt ?? 0) - (b.updatedAt ?? 0),
  );
});

async function remove(id: string) {
  try {
    await api.deleteHistory(id);
    tasksStore.removeLocal(id);
    toastStore.success('已删除记录');
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '删除失败');
  }
}

async function openFolder(id: string) {
  try {
    await api.openFolder(id);
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '打开失败');
  }
}

async function clearAll() {
  try {
    const { count } = await api.clearHistory();
    toastStore.success(`已清空 ${count} 条历史记录`);
    confirmClear.value = false;
    await tasksStore.fetch();
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '清空失败');
  }
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">下载历史</h1>
        <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">查看已完成的下载记录</p>
      </div>
      <button
        v-if="filtered.length"
        class="btn-secondary text-rose-500"
        @click="confirmClear = true"
      >
        <Icon name="trash" :size="15" /> 清空历史
      </button>
    </div>

    <!-- 筛选栏 -->
    <div class="card mt-5 flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
      <div class="relative flex-1">
        <Icon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          v-model="search"
          class="input pl-9"
          placeholder="搜索视频名称、作者或链接…"
        />
      </div>
      <select v-model="platform" class="input sm:w-40">
        <option value="">全部平台</option>
        <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <select v-model="status" class="input sm:w-36">
        <option value="">全部状态</option>
        <option v-for="s in statuses" :key="s.id" :value="s.id">{{ s.label }}</option>
      </select>
      <button class="btn-secondary" @click="sortDesc = !sortDesc">
        <Icon name="history" :size="15" />
        {{ sortDesc ? '最新优先' : '最早优先' }}
      </button>
    </div>

    <!-- 表格 -->
    <div v-if="filtered.length" class="card mt-5 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full min-w-[640px] text-left text-sm">
          <thead class="border-b border-slate-100 bg-slate-50 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
            <tr>
              <th class="px-4 py-3 font-medium">视频</th>
              <th class="px-4 py-3 font-medium">平台</th>
              <th class="px-4 py-3 font-medium">大小</th>
              <th class="hidden px-4 py-3 font-medium md:table-cell">下载时间</th>
              <th class="px-4 py-3 font-medium">状态</th>
              <th class="hidden px-4 py-3 font-medium lg:table-cell">文件路径</th>
              <th class="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="t in filtered" :key="t.id" class="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
              <td class="px-4 py-3">
                <div class="flex items-center gap-3">
                  <div class="h-10 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
                    <img v-if="t.thumbnail" :src="t.thumbnail" class="h-full w-full object-cover" @error="($event.target as HTMLImageElement).style.display='none'" />
                  </div>
                  <div class="max-w-[180px]">
                    <p class="truncate font-medium text-slate-800 dark:text-slate-100" :title="t.title">{{ t.title || '未命名' }}</p>
                    <p class="truncate text-xs text-slate-400">{{ t.author }}</p>
                  </div>
                </div>
              </td>
              <td class="px-4 py-3"><PlatformBadge :platform="t.platform" /></td>
              <td class="px-4 py-3 text-slate-600 dark:text-slate-300">{{ formatBytes(t.filesize) }}</td>
              <td class="hidden px-4 py-3 text-slate-500 dark:text-slate-400 md:table-cell">{{ formatDateTime(t.completedAt ?? t.updatedAt) }}</td>
              <td class="px-4 py-3"><StatusBadge :status="t.status" /></td>
              <td class="hidden max-w-[200px] px-4 py-3 lg:table-cell">
                <span class="block truncate text-xs text-slate-400" :title="t.filePath">{{ t.filePath || '—' }}</span>
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-end gap-1">
                  <button
                    v-if="t.filePath"
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                    title="打开文件夹"
                    @click="openFolder(t.id)"
                  >
                    <Icon name="folder" :size="16" />
                  </button>
                  <button
                    class="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10"
                    title="删除记录（不删除文件）"
                    @click="remove(t.id)"
                  >
                    <Icon name="trash" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-else class="mt-6">
      <EmptyState icon="history" title="暂无历史记录" description="完成的下载会显示在这里" />
    </div>

    <Modal :open="confirmClear" title="清空下载历史" max-width="max-w-sm" @close="confirmClear = false">
      <p class="text-sm text-slate-600 dark:text-slate-300">
        确定清空所有历史记录吗？此操作<span class="font-medium text-rose-500">不会删除</span>已下载的视频文件。
      </p>
      <template #footer>
        <button class="btn-secondary" @click="confirmClear = false">取消</button>
        <button class="btn-danger" @click="clearAll">确认清空</button>
      </template>
    </Modal>
  </div>
</template>
