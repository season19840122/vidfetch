import { EventEmitter } from 'node:events';
import type { ServerEvent } from './types';

/** 进程内事件总线：队列把任务变更广播给 SSE 客户端。 */
export const emitter = new EventEmitter();
emitter.setMaxListeners(0);

export function publish(ev: ServerEvent): void {
  emitter.emit('event', ev);
}

export function subscribe(fn: (ev: ServerEvent) => void): () => void {
  emitter.on('event', fn);
  return () => emitter.off('event', fn);
}
