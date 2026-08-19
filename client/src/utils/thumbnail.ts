import { API_BASE } from '@/api';
import type { PlatformId } from '@/types';

/** 哔哩哔哩 CDN 会拒绝浏览器跨站直连，改由本地服务携带正确 Referer 转发。 */
export function thumbnailSrc(thumbnail: string, platform: PlatformId): string {
  if (!thumbnail || platform !== 'bilibili') return thumbnail;
  return `${API_BASE}/thumbnail?url=${encodeURIComponent(thumbnail)}`;
}
