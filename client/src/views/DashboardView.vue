<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import BaseChart from '@/components/BaseChart.vue';
import Icon from '@/components/Icon.vue';
import PlatformBadge from '@/components/PlatformBadge.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import { api } from '@/api';
import type { DashboardStats } from '@/types';
import { formatBytes, formatDateTime } from '@/utils/format';

const stats = ref<DashboardStats | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;

async function load() {
  try {
    stats.value = await api.stats();
  } catch {
    /* ignore */
  }
}

onMounted(() => {
  void load();
  timer = setInterval(load, 10000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});

const platformData = computed<any>(() => {
  const list = stats.value?.platformCounts ?? [];
  return {
    labels: list.map((p) => p.name),
    datasets: [
      {
        label: '下载数量',
        data: list.map((p) => p.count),
        backgroundColor: list.map((p) => p.color),
        borderRadius: 8,
        maxBarThickness: 44,
      },
    ],
  };
});

const dailyData = computed<any>(() => {
  const list = stats.value?.dailyDownloads ?? [];
  return {
    labels: list.map((d) => d.date),
    datasets: [
      {
        label: '每日下载',
        data: list.map((d) => d.count),
        borderColor: '#6366f1',
        backgroundColor: 'rgba(99, 102, 241, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: '#6366f1',
      },
    ],
  };
});

const successData = computed<any>(() => {
  const t = stats.value?.totals;
  const completed = t?.completed ?? 0;
  const failed = t?.failed ?? 0;
  return {
    labels: ['成功', '失败'],
    datasets: [
      {
        data: [completed, failed],
        backgroundColor: ['#10b981', '#f43f5e'],
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };
});

const successRate = computed(() => stats.value?.successRate ?? 100);

const todayCards = computed(() => {
  const t = stats.value?.today ?? { total: 0, completed: 0, downloading: 0, failed: 0 };
  return [
    { label: '今日任务', value: t.total, icon: 'inbox', color: 'bg-sky-500/10 text-sky-500' },
    { label: '已完成', value: t.completed, icon: 'check-circle', color: 'bg-emerald-500/10 text-emerald-500' },
    { label: '下载中', value: t.downloading, icon: 'download', color: 'bg-indigo-500/10 text-indigo-500' },
    { label: '失败', value: t.failed, icon: 'alert-circle', color: 'bg-rose-500/10 text-rose-500' },
  ];
});
</script>

<template>
  <div>
    <div>
      <h1 class="text-xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
      <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">下载数据统计总览</p>
    </div>

    <!-- 今日统计 -->
    <div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div v-for="c in todayCards" :key="c.label" class="card flex items-center gap-3 p-4">
        <div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" :class="c.color">
          <Icon :name="c.icon" :size="20" />
        </div>
        <div>
          <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ c.value }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ c.label }}</p>
        </div>
      </div>
    </div>

    <!-- 累计指标 -->
    <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div class="card p-4">
        <p class="text-xl font-bold text-slate-900 dark:text-white">{{ formatBytes(stats?.totals.downloadedBytes ?? 0) }}</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">累计下载数据量</p>
      </div>
      <div class="card p-4">
        <p class="text-xl font-bold text-slate-900 dark:text-white">{{ stats?.totals.tasks ?? 0 }}</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">累计任务</p>
      </div>
      <div class="card p-4">
        <p class="text-xl font-bold text-slate-900 dark:text-white">{{ stats?.totals.completed ?? 0 }}</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">累计完成</p>
      </div>
      <div class="card p-4">
        <p class="text-xl font-bold text-emerald-500">{{ successRate }}%</p>
        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">成功率</p>
      </div>
    </div>

    <!-- 图表 -->
    <div class="mt-5 grid gap-4 lg:grid-cols-3">
      <div class="card p-5 lg:col-span-2">
        <h3 class="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">各平台下载数量</h3>
        <BaseChart type="bar" :data="platformData" :height="240" />
      </div>
      <div class="card p-5">
        <h3 class="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">成功率</h3>
        <BaseChart type="doughnut" :data="successData" :height="200" show-legend />
      </div>
    </div>

    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      <div class="card p-5 lg:col-span-2">
        <h3 class="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">每日下载量（近 14 天）</h3>
        <BaseChart type="line" :data="dailyData" :height="220" />
      </div>
      <div class="card p-5">
        <h3 class="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-200">最近下载任务</h3>
        <div v-if="stats?.recentTasks.length" class="space-y-3">
          <div v-for="t in stats.recentTasks.slice(0, 6)" :key="t.id" class="flex items-center gap-3">
            <div class="h-9 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100 dark:bg-slate-800">
              <img v-if="t.thumbnail" :src="t.thumbnail" class="h-full w-full object-cover" @error="($event.target as HTMLImageElement).style.display='none'" />
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{{ t.title || '未命名' }}</p>
              <p class="text-[11px] text-slate-400">{{ formatDateTime(t.updatedAt) }}</p>
            </div>
            <StatusBadge :status="t.status" />
          </div>
        </div>
        <p v-else class="py-8 text-center text-xs text-slate-400">暂无下载记录</p>
      </div>
    </div>
  </div>
</template>
