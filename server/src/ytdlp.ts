import { spawn } from 'node:child_process';
import { config } from './config';
import { AppError, ErrorCodes } from './errors';

export interface YtDlpResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: string | null;
}

export function ytdlpBinary(): string {
  return config.ytdlpPath ?? 'yt-dlp';
}

/** 根据设置生成 --cookies-from-browser 参数（读取本机浏览器登录状态）。 */
export function cookiesArgs(browser: string | undefined | null): string[] {
  const b = (browser ?? '').trim().toLowerCase();
  if (!b || b === 'off' || b === 'none') return [];
  return ['--cookies-from-browser', b];
}

/** 运行 yt-dlp，带整体超时。 */
export function runYtDlp(args: string[], timeoutMs: number): Promise<YtDlpResult> {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(ytdlpBinary(), args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      reject(new AppError(ErrorCodes.RESOLVER_UNAVAILABLE, '无法启动 yt-dlp，请检查安装', 500));
      return;
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
      }
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if ((err as { code?: string }).code === 'ENOENT') {
        reject(
          new AppError(
            ErrorCodes.RESOLVER_UNAVAILABLE,
            '未找到 yt-dlp，请安装后重试或设置 YTDLP_PATH 环境变量',
            500,
          ),
        );
      } else {
        reject(new AppError(ErrorCodes.INTERNAL, `yt-dlp 启动失败：${err.message}`, 500));
      }
    });
    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, code, signal });
    });
  });
}

/** 将 yt-dlp 的 stderr / 退出码映射为面向用户的中文错误。 */
export function mapYtDlpError(stderr: string, platform: string): AppError {
  const s = (stderr || '').toLowerCase();
  const msg = stderr || '';

  if (/drm/.test(s) || /encrypted/.test(s)) {
    return new AppError(ErrorCodes.VIDEO_UNAVAILABLE, '该视频受 DRM 保护，无法下载', 422);
  }
  if (/unsupported url/.test(s)) {
    return new AppError(ErrorCodes.UNSUPPORTED_PLATFORM, '当前平台不支持或链接格式不正确', 400);
  }
  if (/not a valid url/.test(s) || /invalid url/.test(s)) {
    return new AppError(ErrorCodes.INVALID_URL, 'URL 格式错误，请检查链接是否完整', 400);
  }
  if (/video unavailable|this video is unavailable|video has been removed/.test(s)) {
    return new AppError(ErrorCodes.VIDEO_UNAVAILABLE, '视频资源不可访问或已被删除', 422);
  }
  if (/private video|is private/.test(s)) {
    return new AppError(ErrorCodes.VIDEO_UNAVAILABLE, '该视频为私密视频，无法下载', 422);
  }
  // YouTube 的人机验证（"Sign in to confirm you're not a bot"）——这是反机器人检测，
  // 并非内容访问限制。可通过读取本机浏览器登录状态（cookies）解决。
  if (/sign in to confirm you.{0,40}not a bot|captcha/.test(s)) {
    return new AppError(
      ErrorCodes.BOT_VERIFICATION,
      'YouTube 触发了人机验证：请在「设置 → 网络设置」中配置 Cookies 来源（读取你本机浏览器的登录状态）后重试',
      422,
    );
  }
  if (/sign in|login|confirm your age|members-only|age.?restricted|requires authentication/.test(s)) {
    return new AppError(
      ErrorCodes.VIDEO_UNAVAILABLE,
      '该视频需要登录或受限访问，请勿绕过平台限制',
      422,
    );
  }
  if (/no space left|enospc|disk quota|not enough space/.test(s)) {
    return new AppError(ErrorCodes.DISK_FULL, '磁盘空间不足，无法写入文件', 507);
  }
  if (
    /unable to download webpage|http error|timed out|timeout|connection.*(reset|refused|aborted)|network is unreachable|name resolution|getaddrinfo/.test(
      s,
    )
  ) {
    return new AppError(ErrorCodes.NETWORK_ERROR, '网络连接中断或超时，请稍后重试', 502);
  }
  if (/did not get any data/.test(s)) {
    return new AppError(ErrorCodes.VIDEO_UNAVAILABLE, '未能获取视频数据（可能需要登录）', 422);
  }
  if (/postprocess|ffmpeg|merging|conversion/.test(s) && /error|failed/.test(s)) {
    return new AppError(ErrorCodes.DOWNLOAD_FAILED, '视频合并/转码失败，请检查 ffmpeg 是否安装', 500);
  }
  return new AppError(
    ErrorCodes.DOWNLOAD_FAILED,
    msg ? `下载失败：${msg.trim().split('\n').slice(-1)[0].slice(0, 160)}` : '下载失败',
    500,
  );
}

/**
 * 根据质量与容器格式构建 yt-dlp 的 -f 选择器。
 * 优先下载分离的 bestvideo+bestaudio 再用 ffmpeg 合并，保证音画最佳。
 */
export function buildFormatSelector(quality: string, ext: string): string {
  if (quality === 'audio' || ext === 'm4a') {
    return ext === 'm4a' ? 'bestaudio[ext=m4a]/bestaudio' : 'bestaudio/best';
  }
  const height =
    quality === 'best' ? null : parseInt(quality.replace(/\D/g, ''), 10) || null;
  const hFilter = height ? `[height<=${height}]` : '';
  const videoPart = `bestvideo${hFilter}[ext=${ext}]`;
  const fallbackVideo = `bestvideo${hFilter}`;
  const bestSingle = `best${hFilter}[ext=${ext}]`;
  return `${videoPart}+bestaudio/${fallbackVideo}+bestaudio/${bestSingle}/best`;
}

/** 简单确定性哈希（用于模拟器）。 */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
