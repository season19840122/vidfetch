<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/Icon.vue';
import PlatformBadge from '@/components/PlatformBadge.vue';
import { api } from '@/api';
import { useTasksStore } from '@/stores/tasks';
import { useToastStore } from '@/stores/toast';
import type { FormatInfo, VideoInfo } from '@/types';
import { formatBytes, formatDuration, PLATFORM_META } from '@/utils/format';
import { thumbnailSrc } from '@/utils/thumbnail';

const router = useRouter();
const tasksStore = useTasksStore();
const toastStore = useToastStore();

const url = ref('');
const dragging = ref(false);
const resolving = ref(false);
const adding = ref(false);
const video = ref<VideoInfo | null>(null);
const resolveError = ref('');

const selectedFormatId = ref('');
const selectedExt = ref('');
const saveDir = ref('');
const selectingDirectory = ref(false);

/** 按分辨率分组去重后的清晰度选项。 */
const qualityOptions = computed(() => {
  if (!video.value) return [];
  const map = new Map<string, FormatInfo>();
  for (const f of video.value.formats) {
    const key = `${f.resolution}`;
    if (!map.has(key)) map.set(key, f);
  }
  return Array.from(map.values());
});

const selectedQuality = computed(() => {
  if (!video.value) return '';
  return video.value.formats.find((f) => f.id === selectedFormatId.value)?.resolution ?? '';
});

const selectedSize = computed(() => {
  if (!video.value) return 0;
  return video.value.formats.find((f) => f.id === selectedFormatId.value)?.filesize ?? 0;
});

async function resolve() {
  resolveError.value = '';
  video.value = null;
  const u = url.value.trim();
  if (!u) {
    toastStore.warning('请先粘贴视频链接');
    return;
  }
  resolving.value = true;
  try {
    const { video: v } = await api.resolve(u);
    video.value = v;
    // 默认选最高分辨率
    const best = v.formats.find((f) => f.resolution !== 'audio') ?? v.formats[0];
    selectedFormatId.value = best.id;
    selectedExt.value = best.ext;
  } catch (e) {
    resolveError.value = e instanceof Error ? e.message : '解析失败';
  } finally {
    resolving.value = false;
  }
}

function selectFormat(f: FormatInfo) {
  selectedFormatId.value = f.id;
  selectedExt.value = f.ext;
}

async function chooseSaveDir() {
  selectingDirectory.value = true;
  try {
    const { cancelled, dir } = await api.selectDirectory();
    if (!cancelled) saveDir.value = dir;
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '无法打开文件夹选择器');
  } finally {
    selectingDirectory.value = false;
  }
}

async function addToQueue() {
  if (!video.value) return;
  adding.value = true;
  try {
    const fmt = video.value.formats.find((f) => f.id === selectedFormatId.value);
    await tasksStore.add({
      url: video.value.url,
      formatId: fmt?.id,
      ext: fmt?.ext,
      resolution: fmt?.resolution,
      quality: fmt?.resolution === 'audio' ? 'audio' : fmt?.resolution,
      saveDir: saveDir.value || undefined,
    });
    toastStore.success('已加入下载队列');
    router.push('/tasks');
  } catch (e) {
    toastStore.error(e instanceof Error ? e.message : '加入队列失败');
  } finally {
    adding.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  const text = e.dataTransfer?.getData('text/plain')?.trim();
  if (text) {
    url.value = text;
    void resolve();
  }
}

const platformMeta = computed(() => (video.value ? PLATFORM_META[video.value.platform] : null));
</script>

<template>
  <div class="mx-auto max-w-3xl">
    <!-- Hero -->
    <div class="pt-6 text-center sm:pt-12">
      <div class="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30">
        <Icon name="video" :size="26" />
      </div>
      <h1 class="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
        在线视频下载管理器
      </h1>
      <p class="mt-3 text-sm text-slate-500 dark:text-slate-400 sm:text-base">
        统一管理你的在线视频下载任务
      </p>
    </div>

    <!-- 输入区 -->
    <div class="mt-8">
      <div
        class="card flex flex-col gap-3 p-3 transition sm:flex-row sm:items-center"
        :class="dragging ? 'border-brand-500 ring-2 ring-brand-500/30' : ''"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="flex flex-1 items-center gap-3 px-2">
          <Icon name="link" :size="20" class="shrink-0 text-slate-400" />
          <input
            v-model="url"
            type="url"
            inputmode="url"
            placeholder="粘贴视频链接（支持拖拽到此处）"
            class="w-full bg-transparent py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none dark:text-slate-100"
            @keyup.enter="resolve"
          />
        </div>
        <button class="btn-primary shrink-0" :disabled="resolving" @click="resolve">
          <Icon v-if="resolving" name="spinner" :size="16" class="animate-spin" />
          <Icon v-else name="search" :size="16" />
          {{ resolving ? '解析中…' : '解析视频' }}
        </button>
      </div>

      <p v-if="resolveError" class="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
        <Icon name="alert-circle" :size="16" class="shrink-0" />
        {{ resolveError }}
      </p>

      <p class="mt-3 text-center text-xs text-slate-400">
        支持 YouTube · Bilibili · 抖音 · TikTok · Vimeo · X · Instagram，以及更多 yt-dlp 支持的网站（仅限公开且你有权下载的内容）
      </p>
    </div>

    <!-- 预览卡片 -->
    <div v-if="video" class="card mt-6 overflow-hidden">
      <div class="flex flex-col sm:flex-row">
        <div class="relative aspect-video w-full shrink-0 overflow-hidden bg-slate-100 dark:bg-slate-800 sm:aspect-auto sm:h-44 sm:w-72">
          <img
            v-if="video.thumbnail"
            :src="thumbnailSrc(video.thumbnail, video.platform)"
            :alt="video.title"
            class="h-full w-full object-cover"
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          />
          <div class="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-xs font-medium text-white">
            {{ formatDuration(video.duration) }}
          </div>
        </div>
        <div class="flex-1 p-5">
          <div class="flex items-start justify-between gap-3">
            <h2 class="line-clamp-2 text-base font-semibold text-slate-900 dark:text-white">{{ video.title }}</h2>
          </div>
          <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <PlatformBadge :platform="video.platform" />
            <span>作者：{{ video.author }}</span>
            <span v-if="video.duration">时长：{{ formatDuration(video.duration) }}</span>
          </div>

          <!-- 格式选择 -->
          <p class="mt-4 mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">选择清晰度 / 格式</p>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="f in qualityOptions"
              :key="f.id"
              class="rounded-lg border px-3 py-1.5 text-xs font-medium transition"
              :class="
                selectedFormatId === f.id
                  ? 'border-brand-600 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-500/10 dark:text-brand-300'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
              "
              @click="selectFormat(f)"
            >
              <span>{{ f.resolution === 'audio' ? '仅音频' : f.resolution.toUpperCase() }} · {{ f.ext.toUpperCase() }}</span>
              <span class="ml-1.5 opacity-70">约 {{ f.filesize ? formatBytes(f.filesize) : '未知' }}</span>
            </button>
          </div>

          <!-- 保存目录 -->
          <div class="mt-4">
            <label class="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">保存位置（可选）</label>
            <div class="flex gap-2">
              <input v-model="saveDir" class="input min-w-0 flex-1" placeholder="留空使用默认下载目录" />
              <button
                type="button"
                class="btn-secondary shrink-0"
                :disabled="selectingDirectory"
                title="选择本地文件夹"
                @click="chooseSaveDir"
              >
                <Icon v-if="selectingDirectory" name="spinner" :size="16" class="animate-spin" />
                <Icon v-else name="folder" :size="16" />
                {{ selectingDirectory ? '打开中…' : '浏览' }}
              </button>
            </div>
          </div>

          <div class="mt-5 flex items-center justify-between gap-3">
            <div class="text-sm">
              <span class="text-slate-500 dark:text-slate-400">将下载：</span>
              <span class="font-semibold text-slate-900 dark:text-white">
                {{ selectedQuality === 'audio' ? '音频' : selectedQuality.toUpperCase() }}
                · {{ selectedExt.toUpperCase() }}
                <span class="text-slate-400"> · 约 {{ selectedSize ? formatBytes(selectedSize) : '未知' }}</span>
              </span>
            </div>
            <button class="btn-primary shrink-0" :disabled="adding" @click="addToQueue">
              <Icon v-if="adding" name="spinner" :size="16" class="animate-spin" />
              <Icon v-else name="plus" :size="16" />
              {{ adding ? '加入中…' : '加入下载队列' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
