<script setup lang="ts">
import { useToastStore } from '@/stores/toast';
import Icon from './Icon.vue';

const toastStore = useToastStore();

const iconFor = (type: string) =>
  type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : type === 'warning' ? 'alert' : 'info';

const colorFor = (type: string) =>
  type === 'success'
    ? 'text-emerald-500'
    : type === 'error'
      ? 'text-rose-500'
      : type === 'warning'
        ? 'text-amber-500'
        : 'text-sky-500';
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="slide-up">
      <div
        v-for="t in toastStore.toasts"
        :key="t.id"
        class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card-lg dark:border-slate-700 dark:bg-slate-800"
      >
        <Icon :name="iconFor(t.type)" :size="18" :class="colorFor(t.type)" class="mt-0.5 shrink-0" />
        <p class="flex-1 text-sm text-slate-700 dark:text-slate-200">{{ t.message }}</p>
        <button
          class="shrink-0 rounded-md p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          @click="toastStore.dismiss(t.id)"
        >
          <Icon name="close" :size="14" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
