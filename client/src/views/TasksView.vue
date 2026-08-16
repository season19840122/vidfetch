<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import EmptyState from '@/components/EmptyState.vue';
import TaskCard from '@/components/TaskCard.vue';
import { useTasksStore } from '@/stores/tasks';

const router = useRouter();
const tasksStore = useTasksStore();

const pausedCount = computed(
  () => tasksStore.tasks.filter((t) => t.status === 'paused').length,
);
const completedCount = computed(
  () => tasksStore.tasks.filter((t) => t.status === 'completed').length,
);

const stats = computed(() => [
  { label: '下载中', value: tasksStore.activeCount, color: 'text-indigo-600 dark:text-indigo-400' },
  {
    label: '等待中',
    value: tasksStore.waitingCount + pausedCount.value,
    color: 'text-amber-600 dark:text-amber-400',
  },
  { label: '已完成', value: completedCount.value, color: 'text-emerald-600 dark:text-emerald-400' },
]);
</script>

<template>
  <div>
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">下载任务</h1>
        <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">管理进行中与排队的下载任务</p>
      </div>
      <button class="btn-primary" @click="router.push('/')">
        <span class="text-base leading-none">+</span> 添加任务
      </button>
    </div>

    <div class="mt-5 grid grid-cols-3 gap-3">
      <div v-for="s in stats" :key="s.label" class="card p-4">
        <p class="text-2xl font-bold" :class="s.color">{{ s.value }}</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{{ s.label }}</p>
      </div>
    </div>

    <div v-if="tasksStore.activeTasks.length" class="mt-6 space-y-3">
      <TaskCard v-for="t in tasksStore.activeTasks" :key="t.id" :task="t" />
    </div>

    <div v-else class="mt-6">
      <EmptyState
        icon="download"
        title="暂无下载任务"
        description="回到首页粘贴视频链接，开始你的第一个下载"
      >
        <button class="btn-primary" @click="router.push('/')">去添加任务</button>
      </EmptyState>
    </div>
  </div>
</template>
