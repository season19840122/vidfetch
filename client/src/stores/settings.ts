import { defineStore } from 'pinia';
import { api } from '@/api';
import type { AppSettings, SystemInfo } from '@/types';

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    settings: null as AppSettings | null,
    system: null as SystemInfo | null,
    loading: false,
    saving: false,
  }),
  actions: {
    async load() {
      this.loading = true;
      try {
        this.settings = await api.settings();
      } finally {
        this.loading = false;
      }
    },
    async loadSystem() {
      try {
        this.system = await api.system();
      } catch {
        /* ignore */
      }
    },
    async update(patch: Partial<AppSettings>) {
      this.saving = true;
      try {
        this.settings = await api.updateSettings(patch);
        return this.settings;
      } finally {
        this.saving = false;
      }
    },
    previewTheme(theme: AppSettings['appearance.theme']) {
      if (!this.settings) return;
      // 通过替换对象触发 App.vue 的主题监听；点击时立即预览，保存后再持久化。
      this.settings = { ...this.settings, 'appearance.theme': theme };
    },
    async reset() {
      this.settings = await api.resetSettings();
      return this.settings;
    },
  },
});
