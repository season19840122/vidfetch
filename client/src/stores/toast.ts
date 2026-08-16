import { defineStore } from 'pinia';

export interface Toast {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

let nextId = 1;

export const useToastStore = defineStore('toast', {
  state: () => ({
    toasts: [] as Toast[],
  }),
  actions: {
    show(type: Toast['type'], message: string, duration = 3500) {
      const id = nextId++;
      this.toasts.push({ id, type, message });
      setTimeout(() => this.dismiss(id), duration);
    },
    success(message: string) {
      this.show('success', message);
    },
    error(message: string) {
      this.show('error', message, 5000);
    },
    info(message: string) {
      this.show('info', message);
    },
    warning(message: string) {
      this.show('warning', message, 4500);
    },
    dismiss(id: number) {
      const i = this.toasts.findIndex((t) => t.id === id);
      if (i >= 0) this.toasts.splice(i, 1);
    },
  },
});
