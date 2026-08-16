<script setup lang="ts">
import type { PlatformId } from '@/types';
import { PLATFORM_META } from '@/utils/format';

const props = defineProps<{ platform: PlatformId }>();
const meta = PLATFORM_META[props.platform] ?? { name: props.platform, color: '#64748b' };
</script>

<template>
  <span class="badge bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
    <span class="h-2 w-2 rounded-full" :style="{ backgroundColor: meta.color }"></span>
    {{ meta.name }}
  </span>
</template>
