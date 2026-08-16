<script setup lang="ts">
import Icon from './Icon.vue';

defineProps<{
  icon?: string;
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
      <Icon :name="icon ?? 'inbox'" :size="26" />
    </div>
    <div>
      <p class="text-sm font-medium text-slate-700 dark:text-slate-200">{{ title }}</p>
      <p v-if="description" class="mt-1 text-xs text-slate-400 dark:text-slate-500">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
