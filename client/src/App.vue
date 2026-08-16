<script setup lang="ts">
import { onMounted, onUnmounted, ref, watchEffect } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import Icon from '@/components/Icon.vue';
import ToastHost from '@/components/ToastHost.vue';
import { useSettingsStore } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';

const route = useRoute();
const settingsStore = useSettingsStore();
const tasksStore = useTasksStore();
const sidebarOpen = ref(false);

const nav = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/tasks', label: '下载任务', icon: 'download' },
  { to: '/history', label: '下载历史', icon: 'history' },
  { to: '/dashboard', label: 'Dashboard', icon: 'chart' },
  { to: '/settings', label: '设置', icon: 'settings' },
];

let media: MediaQueryList | null = null;
function applyTheme() {
  const theme = settingsStore.settings?.['appearance.theme'] ?? 'system';
  const systemDark =
    media?.matches ?? window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  document.documentElement.classList.toggle('dark', dark);
}

watchEffect(() => {
  void settingsStore.settings;
  applyTheme();
});

onMounted(() => {
  media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', applyTheme);
  void settingsStore.load();
  void settingsStore.loadSystem();
  tasksStore.connect();
});

onUnmounted(() => {
  media?.removeEventListener('change', applyTheme);
  tasksStore.disconnect();
});
</script>

<template>
  <div class="min-h-screen">
    <!-- 桌面侧边栏 -->
    <aside
      class="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:flex"
    >
      <div class="flex items-center gap-3 px-6 py-6">
        <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
          <Icon name="video" :size="20" />
        </div>
        <div class="leading-tight">
          <p class="text-sm font-semibold text-slate-900 dark:text-white">视频下载管理器</p>
          <p class="text-[11px] text-slate-400">Online Download Manager</p>
        </div>
      </div>

      <nav class="flex-1 space-y-1 px-3">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition"
          :class="
            route.path === item.to
              ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          "
        >
          <Icon :name="item.icon" :size="19" />
          <span class="flex-1">{{ item.label }}</span>
          <span
            v-if="item.to === '/tasks' && tasksStore.activeCount > 0"
            class="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white"
          >
            {{ tasksStore.activeCount }}
          </span>
        </RouterLink>
      </nav>

      <div class="border-t border-slate-200 px-6 py-4 text-xs text-slate-400 dark:border-slate-800">
        v{{ settingsStore.system?.version ?? '1.0.0' }} · 本地运行
      </div>
    </aside>

    <!-- 移动端顶栏 -->
    <header
      class="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90 lg:hidden"
    >
      <button class="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" @click="sidebarOpen = true">
        <Icon name="menu" :size="20" />
      </button>
      <div class="flex items-center gap-2">
        <div class="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Icon name="video" :size="16" />
        </div>
        <span class="text-sm font-semibold">视频下载管理器</span>
      </div>
    </header>

    <!-- 移动端抽屉 -->
    <Transition name="fade">
      <div v-if="sidebarOpen" class="fixed inset-0 z-50 bg-slate-900/50 lg:hidden" @click="sidebarOpen = false">
        <div class="flex h-full w-72 flex-col bg-white dark:bg-slate-900" @click.stop>
          <div class="flex items-center justify-between px-5 py-5">
            <div class="flex items-center gap-2">
              <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Icon name="video" :size="18" />
              </div>
              <span class="text-sm font-semibold">视频下载管理器</span>
            </div>
            <button class="rounded-lg p-1 text-slate-400 hover:bg-slate-100" @click="sidebarOpen = false">
              <Icon name="close" :size="18" />
            </button>
          </div>
          <nav class="flex-1 space-y-1 px-3">
            <RouterLink
              v-for="item in nav"
              :key="item.to"
              :to="item.to"
              class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition"
              :class="
                route.path === item.to
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              "
              @click="sidebarOpen = false"
            >
              <Icon :name="item.icon" :size="19" />
              <span class="flex-1">{{ item.label }}</span>
              <span
                v-if="item.to === '/tasks' && tasksStore.activeCount > 0"
                class="rounded-full bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white"
              >
                {{ tasksStore.activeCount }}
              </span>
            </RouterLink>
          </nav>
        </div>
      </div>
    </Transition>

    <!-- 主内容 -->
    <main class="lg:pl-64">
      <div class="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </div>
    </main>

    <ToastHost />
  </div>
</template>
