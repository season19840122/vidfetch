/**
 * 业务错误：附带稳定错误码与面向用户的中文提示。
 */
export class AppError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode = 400) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const ErrorCodes = {
  INVALID_URL: 'INVALID_URL',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
  VIDEO_NOT_FOUND: 'VIDEO_NOT_FOUND',
  VIDEO_UNAVAILABLE: 'VIDEO_UNAVAILABLE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  DOWNLOAD_FAILED: 'DOWNLOAD_FAILED',
  TIMEOUT: 'TIMEOUT',
  DISK_FULL: 'DISK_FULL',
  WRITE_FAILED: 'WRITE_FAILED',
  DUPLICATE: 'DUPLICATE',
  RESOLVER_UNAVAILABLE: 'RESOLVER_UNAVAILABLE',
  BOT_VERIFICATION: 'BOT_VERIFICATION',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  INVALID_STATE: 'INVALID_STATE',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
} as const;
