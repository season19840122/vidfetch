<script setup lang="ts">
import type { TaskStatus } from '@/types';
import { STATUS_DOT, STATUS_LABEL, STATUS_STYLE } from '@/utils/format';

defineProps<{ status: TaskStatus; pulse?: boolean }>();
</script>

<template>
  <span class="badge" :class="STATUS_STYLE[status]">
    <span class="h-1.5 w-1.5 rounded-full" :class="[STATUS_DOT[status], pulse ? 'animate-pulse' : '']"></span>
    {{ STATUS_LABEL[status] }}
  </span>
</template>
