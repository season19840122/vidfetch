<script setup lang="ts">
import Icon from './Icon.vue';

const props = withDefaults(
  defineProps<{
    open: boolean;
    title?: string;
    maxWidth?: string;
  }>(),
  { title: '', maxWidth: 'max-w-lg' },
);

const emit = defineEmits<{ (e: 'close'): void }>();

function onBackdrop(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close');
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        class="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center"
        @click="onBackdrop"
      >
        <div
          class="slide-up w-full rounded-2xl border border-slate-200 bg-white shadow-card-lg dark:border-slate-700 dark:bg-slate-900"
          :class="maxWidth"
        >
          <div
            v-if="title"
            class="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"
          >
            <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">{{ title }}</h3>
            <button
              class="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              @click="emit('close')"
            >
              <Icon name="close" :size="18" />
            </button>
          </div>
          <div class="px-5 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
