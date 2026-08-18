<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import { api } from '@/api';
import { useSettingsStore } from '@/stores/settings';
import { useToastStore } from '@/stores/toast';
import type { AppSettings } from '@/types';
import { formatBytes } from '@/utils/format';

const settingsStore = useSettingsStore();
const toastStore = useToastStore();
const selectingDefaultDirectory = ref(false);

const form = reactive({
  defaultQuality: '1080p',
  defaultFormat: 'mp4',
  maxConcurrent: 3,
  saveDir: '',
  maxSpeedMB: 0,
  timeoutSec: 60,
  retries: 3,
  cookiesFromBrowser: '',
  theme: 'system' as 'light' | 'dark' | 'system',
});

const concurrencyOptions = [1, 2, 3, 5, 10];
const qualityOptions = ['best', '2160p', '1440p', '1080p', '720p', '480p', '360p', 'audio'];
const formatOptions = ['mp4', 'webm', 'mkv', 'm4a'];
const cookiesOptions = [
  { value: '', label: '关闭（不使用浏览器登录状态）' },
  { value: 'chrome', label: 'Chrome' },
  { value: 'firefox', label: 'Firefox' },
  { value: 'edge', label: 'Edge' },
  { value: 'safari', label: 'Safari' },
  { value: 'brave', label: 'Brave' },
  { value: 'chromium', label: 'Chromium' },
];
const themeOptions = [
  { id: 'light', label: '浅色', icon: 'sun' },
  { id: 'dark', label: '深色', icon: 'moon' },
  { id: 'system', label: '跟随系统', icon: 'monitor' },
] as const;

function applyToForm(s: AppSettings) {
  form.defaultQuality = s['download.defaultQuality'];
  form.defaultFormat = s['download.defaultFormat'];
  form.maxConcurrent = s['download.maxConcurrent'];
  form.saveDir = s['download.saveDir'];
  form.maxSpeedMB = Math.round(s['network.maxSpeed'] / (1024 * 1024));
  form.timeoutSec = Math.round(s['network.timeout'] / 1000);
  form.retries = s['network.retries'];
  form.cookiesFromBrowser = s['network.cookiesFromBrowser'] ?? '';
  form.theme = s['appearance.theme'];
}

onMounted(async () => {
  if (!settingsStore.settings) await settingsStore.load();
  if (settingsStore.settings) applyToForm(settingsStore.settings);
  await settingsStore.loadSystem();
});

function selectTheme(theme: AppSettings['appearance.theme']) {
  form.theme = theme;
  settingsStore.previewTheme(theme);

  // 设置尚未加载完成时也能立即预览；加载完成后由 App.vue 统一维护主题状态。
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && systemDark));
}

async function chooseDefaultSaveDir() {
  selectingDefaultDirectory.value = true;
  try {
    const { cancelled, dir } = await api.selectDirectory();
    if (!cancelled) form.saveDir = dir;
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '无法打开文件夹选择器');
  } finally {
    selectingDefaultDirectory.value = false;
  }
}

async function save() {
  try {
    await settingsStore.update({
      'download.defaultQuality': form.defaultQuality,
      'download.defaultFormat': form.defaultFormat,
      'download.maxConcurrent': form.maxConcurrent,
      'download.saveDir': form.saveDir,
      'network.maxSpeed': Math.round(form.maxSpeedMB * 1024 * 1024),
      'network.timeout': Math.round(form.timeoutSec * 1000),
      'network.retries': form.retries,
      'network.cookiesFromBrowser': form.cookiesFromBrowser,
      'appearance.theme': form.theme,
    });
    toastStore.success('设置已保存');
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '保存失败');
  }
}

async function reset() {
  try {
    await settingsStore.reset();
    if (settingsStore.settings) applyToForm(settingsStore.settings);
    toastStore.success('已恢复默认设置');
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '重置失败');
  }
}

const sys = () => settingsStore.system;
const diskUsedPercent = () => {
  const d = sys()?.disk;
  if (!d || !d.total) return 0;
  return Math.min(100, Math.round((d.used / d.total) * 100));
};
</script>

<template>
  <div class="max-w-3xl">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-xl font-bold text-slate-900 dark:text-white">设置</h1>
        <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">下载、网络与外观偏好</p>
      </div>
      <div class="flex gap-2">
        <button class="btn-secondary" @click="reset">恢复默认</button>
        <button class="btn-primary" :disabled="settingsStore.saving" @click="save">
          <Icon v-if="settingsStore.saving" name="spinner" :size="15" class="animate-spin" />
          保存设置
        </button>
      </div>
    </div>

    <!-- 下载设置 -->
    <div class="card mt-5 p-5">
      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">下载设置</h3>
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">默认下载质量</label>
          <select v-model="form.defaultQuality" class="input">
            <option v-for="q in qualityOptions" :key="q" :value="q">{{ q === 'best' ? '最佳质量' : q === 'audio' ? '仅音频' : q }}</option>
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">默认文件格式</label>
          <select v-model="form.defaultFormat" class="input">
            <option v-for="f in formatOptions" :key="f" :value="f">{{ f.toUpperCase() }}</option>
          </select>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">最大并发任务</label>
          <div class="flex gap-2">
            <button
              v-for="n in concurrencyOptions"
              :key="n"
              class="flex-1 rounded-lg border py-2 text-sm font-medium transition"
              :class="
                form.maxConcurrent === n
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
              "
              @click="form.maxConcurrent = n"
            >
              {{ n }}
            </button>
          </div>
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">默认保存目录</label>
          <div class="flex gap-2">
            <input v-model="form.saveDir" class="input min-w-0 flex-1" placeholder="/path/to/downloads" />
            <button
              type="button"
              class="btn-secondary shrink-0"
              :disabled="selectingDefaultDirectory"
              title="选择本地文件夹"
              @click="chooseDefaultSaveDir"
            >
              <Icon v-if="selectingDefaultDirectory" name="spinner" :size="16" class="animate-spin" />
              <Icon v-else name="folder" :size="16" />
              {{ selectingDefaultDirectory ? '打开中…' : '浏览' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 网络设置 -->
    <div class="card mt-4 p-5">
      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">网络设置</h3>
      <div class="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">最大下载速度（MB/s，0 不限）</label>
          <input v-model.number="form.maxSpeedMB" type="number" min="0" class="input" />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">请求超时（秒）</label>
          <input v-model.number="form.timeoutSec" type="number" min="5" class="input" />
        </div>
        <div>
          <label class="mb-1.5 block text-xs font-medium text-slate-500">自动重试次数</label>
          <input v-model.number="form.retries" type="number" min="0" max="20" class="input" />
        </div>
        <div class="sm:col-span-3">
          <label class="mb-1.5 block text-xs font-medium text-slate-500">Cookies 来源（读取本机浏览器登录状态）</label>
          <select v-model="form.cookiesFromBrowser" class="input">
            <option v-for="c in cookiesOptions" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
          <p class="mt-1.5 text-xs text-slate-400">
            当 YouTube 提示「Sign in to confirm you're not a bot」或需要登录时，可选择本机已登录的浏览器，使用你自己的登录状态来解析公开视频。
          </p>
        </div>
      </div>
    </div>

    <!-- 外观 -->
    <div class="card mt-4 p-5">
      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">外观</h3>
      <div class="mt-4 grid grid-cols-3 gap-2">
        <button
          v-for="o in themeOptions"
          :key="o.id"
          class="flex flex-col items-center gap-2 rounded-xl border py-3 text-xs font-medium transition"
          :class="
            form.theme === o.id
              ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
          "
          @click="selectTheme(o.id)"
        >
          <Icon :name="o.icon" :size="20" />
          {{ o.label }}
        </button>
      </div>
    </div>

    <!-- 系统 -->
    <div class="card mt-4 p-5">
      <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-200">系统</h3>
      <div class="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div class="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <span class="text-slate-500">当前版本</span>
          <span class="font-medium text-slate-700 dark:text-slate-200">v{{ sys()?.version ?? '—' }}</span>
        </div>
        <div class="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <span class="text-slate-500">运行环境</span>
          <span class="font-medium text-slate-700 dark:text-slate-200">Node {{ sys()?.nodeVersion ?? '—' }}</span>
        </div>
        <div class="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <span class="text-slate-500">数据库状态</span>
          <span class="font-medium text-emerald-500">已连接 · {{ sys()?.database.taskCount ?? 0 }} 条任务</span>
        </div>
        <div class="flex justify-between border-b border-slate-100 pb-2 dark:border-slate-800">
          <span class="text-slate-500">解析引擎</span>
          <span class="font-medium" :class="sys()?.resolver.simulate ? 'text-amber-500' : 'text-emerald-500'">
            {{ sys()?.resolver.simulate ? '模拟模式（未检测到 yt-dlp）' : 'yt-dlp 可用' }}
          </span>
        </div>
        <div class="sm:col-span-2">
          <span class="text-xs text-slate-400">数据库文件</span>
          <p class="truncate text-xs font-mono text-slate-500">{{ sys()?.database.path ?? '—' }}</p>
        </div>
        <div class="sm:col-span-2">
          <span class="text-xs text-slate-400">下载目录</span>
          <p class="truncate text-xs font-mono text-slate-500">{{ sys()?.downloadDir.path ?? '—' }}</p>
          <p class="mt-1 text-xs" :class="sys()?.downloadDir.writable ? 'text-emerald-500' : 'text-rose-500'">
            {{ sys()?.downloadDir.exists ? (sys()?.downloadDir.writable ? '✓ 可写' : '✗ 不可写') : '✗ 不存在' }}
            · {{ sys()?.downloadDir.fileCount ?? 0 }} 个文件
          </p>
        </div>
        <div class="sm:col-span-2">
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">磁盘剩余空间</span>
            <span class="font-medium text-slate-600 dark:text-slate-300">
              {{ formatBytes(sys()?.disk.free ?? 0) }} / {{ formatBytes(sys()?.disk.total ?? 0) }}
            </span>
          </div>
          <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div class="h-full rounded-full bg-brand-500" :style="{ width: diskUsedPercent() + '%' }"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
