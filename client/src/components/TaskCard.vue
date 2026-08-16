<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
import PlatformBadge from './PlatformBadge.vue';
import ProgressBar from './ProgressBar.vue';
import StatusBadge from './StatusBadge.vue';
import { useTasksStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toast';
import type { Task } from '@/types';
import { formatBytes, formatDateTime, formatEta, formatSpeed } from '@/utils/format';

const props = defineProps<{ task: Task }>();

const tasksStore = useTasksStore();
const toastStore = useToastStore();
const busy = ref(false);
const thumbFailed = ref(false);
const confirmDelete = ref(false);
const confirmDeleteFile = ref(false);

watch(
  () => props.task.thumbnail,
  () => (thumbFailed.value = false),
);

const isActive = computed(() =>
  ['waiting', 'parsing', 'downloading', 'paused'].includes(props.task.status),
);

async function run(fn: () => Promise<unknown>, success?: string) {
  if (busy.value) return;
  busy.value = true;
  try {
    await fn();
    if (success) toastStore.success(success);
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '操作失败');
  } finally {
    busy.value = false;
  }
}

const actionButtons = computed(() => {
  const t = props.task.status;
  const list: Array<{ key: string; icon: string; label: string; primary?: boolean; danger?: boolean }> = [];
  if (t === 'downloading') {
    list.push({ key: 'pause', icon: 'pause', label: '暂停' });
    list.push({ key: 'cancel', icon: 'close', label: '取消' });
  } else if (t === 'paused') {
    list.push({ key: 'resume', icon: 'play', label: '继续', primary: true });
    list.push({ key: 'cancel', icon: 'close', label: '取消' });
  } else if (t === 'waiting' || t === 'parsing') {
    list.push({ key: 'cancel', icon: 'close', label: '取消' });
  } else if (t === 'failed') {
    list.push({ key: 'retry', icon: 'refresh', label: '重试', primary: true });
    list.push({ key: 'remove', icon: 'trash', label: '删除' });
  } else if (t === 'cancelled') {
    list.push({ key: 'retry', icon: 'refresh', label: '重试' });
    list.push({ key: 'remove', icon: 'trash', label: '删除' });
  } else if (t === 'completed') {
    list.push({ key: 'open', icon: 'folder', label: '打开文件夹' });
    list.push({ key: 'deleteFile', icon: 'disk', label: '删除文件', danger: true });
    list.push({ key: 'remove', icon: 'trash', label: '删除记录' });
  }
  return list;
});

function onAction(key: string) {
  switch (key) {
    case 'pause':
      return run(() => tasksStore.pause(props.task.id), '已暂停');
    case 'resume':
      return run(() => tasksStore.resume(props.task.id), '已继续');
    case 'cancel':
      return run(() => tasksStore.cancel(props.task.id), '已取消');
    case 'retry':
      return run(() => tasksStore.retry(props.task.id), '已重新加入队列');
    case 'open':
      return run(async () => {
        const { api } = await import('@/api');
        await api.openFolder(props.task.id);
      }, '已打开文件夹');
    case 'deleteFile':
      confirmDeleteFile.value = true;
      return;
    case 'remove':
      confirmDelete.value = true;
      return;
  }
}
</script>

<template>
  <div class="card p-4">
    <div class="flex gap-4">
      <!-- 缩略图 -->
      <div class="relative hidden h-16 w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 sm:block">
        <img
          v-if="!thumbFailed && task.thumbnail"
          :src="task.thumbnail"
          :alt="task.title"
          class="h-full w-full object-cover"
          @error="thumbFailed = true"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
          <Icon name="video" :size="24" />
        </div>
        <div
          v-if="task.status === 'downloading'"
          class="absolute inset-0 flex items-center justify-center bg-black/40 text-white"
        >
          <Icon name="download" :size="18" />
        </div>
      </div>

      <!-- 主体 -->
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {{ task.title || '解析中…' }}
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <PlatformBadge :platform="task.platform" />
              <span v-if="task.resolution && task.resolution !== 'video'">
                {{ task.resolution.toUpperCase() }} · {{ task.formatExt.toUpperCase() }}
              </span>
              <span v-if="task.filesize">{{ formatBytes(task.filesize) }}</span>
              <span class="hidden md:inline">{{ formatDateTime(task.createdAt) }}</span>
            </div>
          </div>
          <div class="shrink-0">
            <StatusBadge :status="task.status" :pulse="task.status === 'downloading' || task.status === 'parsing'" />
          </div>
        </div>

        <!-- 进度 -->
        <div v-if="isActive" class="mt-3">
          <div class="flex items-center gap-3">
            <ProgressBar :value="task.progress" :status="task.status" class="flex-1" />
            <span class="w-11 shrink-0 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
              {{ Math.round(task.progress) }}%
            </span>
          </div>
          <div
            v-if="task.status === 'downloading' || task.status === 'paused'"
            class="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500"
          >
            <span>速度 {{ formatSpeed(task.speed) }}</span>
            <span v-if="task.eta > 0">剩余 {{ formatEta(task.eta) }}</span>
            <span v-if="task.downloadedBytes > 0">
              {{ formatBytes(task.downloadedBytes) }} / {{ task.totalBytes ? formatBytes(task.totalBytes) : '—' }}
            </span>
          </div>
        </div>

        <!-- 失败原因 -->
        <div v-if="task.status === 'failed' && task.errorMessage" class="mt-2 flex items-start gap-1.5 text-xs text-rose-500">
          <Icon name="alert-circle" :size="14" class="mt-px shrink-0" />
          <span>{{ task.errorMessage }}</span>
        </div>

        <!-- 完成文件路径 -->
        <div
          v-if="task.status === 'completed' && task.filePath"
          class="mt-2 truncate text-xs text-slate-400 dark:text-slate-500"
          :title="task.filePath"
        >
          <Icon name="folder" :size="12" class="mr-1 inline" />
          {{ task.filePath }}
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex shrink-0 flex-wrap items-center gap-1.5">
        <button
          v-for="b in actionButtons"
          :key="b.key"
          :disabled="busy"
          class="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition disabled:opacity-50"
          :class="
            b.primary
              ? 'bg-brand-600 text-white hover:bg-brand-500'
              : b.danger
                ? 'text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          "
          @click="onAction(b.key)"
        >
          <Icon :name="b.icon" :size="14" />
          <span class="hidden xl:inline">{{ b.label }}</span>
        </button>
      </div>
    </div>

    <!-- 删除记录确认 -->
    <Modal :open="confirmDelete" title="删除任务记录" max-width="max-w-sm" @close="confirmDelete = false">
      <p class="text-sm text-slate-600 dark:text-slate-300">
        确定删除「{{ task.title }}」的任务记录吗？
      </p>
      <p class="mt-2 text-xs text-slate-400">
        此操作仅删除记录，<span class="font-medium text-slate-600 dark:text-slate-300">不会删除</span>已下载的视频文件。
      </p>
      <template #footer>
        <button class="btn-secondary" @click="confirmDelete = false">取消</button>
        <button
          class="btn-danger"
          @click="
            confirmDelete = false;
            run(() => tasksStore.remove(task.id));
          "
        >
          确认删除
        </button>
      </template>
    </Modal>

    <!-- 删除文件确认 -->
    <Modal :open="confirmDeleteFile" title="删除视频文件" max-width="max-w-sm" @close="confirmDeleteFile = false">
      <p class="text-sm text-slate-600 dark:text-slate-300">
        确定删除实际视频文件吗？此操作<span class="font-medium text-rose-500">不可撤销</span>。
      </p>
      <p class="mt-2 truncate text-xs text-slate-400">{{ task.filePath }}</p>
      <template #footer>
        <button class="btn-secondary" @click="confirmDeleteFile = false">取消</button>
        <button
          class="btn-danger"
          @click="
            confirmDeleteFile = false;
            run(() => tasksStore.deleteFile(task.id), '文件已删除');
          "
        >
          删除文件
        </button>
      </template>
    </Modal>
  </div>
</template>
