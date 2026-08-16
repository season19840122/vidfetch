<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    value: number;
    status?: string;
    showLabel?: boolean;
  }>(),
  { status: '', showLabel: false },
);

const percent = computed(() => Math.max(0, Math.min(100, props.value)));

const barColor = computed(() => {
  switch (props.status) {
    case 'completed':
      return 'bg-emerald-500';
    case 'failed':
      return 'bg-rose-500';
    case 'paused':
      return 'bg-amber-500';
    case 'cancelled':
      return 'bg-slate-400';
    default:
      return 'bg-brand-500';
  }
});
</script>

<template>
  <div class="w-full">
    <div class="flex items-center justify-between gap-2 text-xs" v-if="showLabel || $slots.default">
      <slot>
        <span class="text-slate-500 dark:text-slate-400">{{ percent.toFixed(0) }}%</span>
      </slot>
    </div>
    <div class="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div
        class="h-full rounded-full transition-[width] duration-300 ease-linear"
        :class="barColor"
        :style="{ width: percent + '%' }"
      ></div>
    </div>
  </div>
</template>
