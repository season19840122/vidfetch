// API 冒烟测试：覆盖健康检查、平台、解析、任务 CRUD、控制、历史、统计、设置、系统。
// 用法：node scripts/smoke-test.mjs [BASE_URL]
const BASE = process.argv[2] || 'http://localhost:45392';

let pass = 0;
let fail = 0;
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  ✅ ${name}`);
  } else {
    fail++;
    console.log(`  ❌ ${name} ${extra}`);
  }
}

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  console.log(`== API 冒烟测试（${BASE}）==\n`);

  // 1. 健康检查
  const health = await api('GET', '/api/health');
  check('健康检查', health.status === 200 && health.data?.ok === true);

  // 2. 平台列表
  const platforms = await api('GET', '/api/platforms');
  check('平台列表', platforms.status === 200 && Array.isArray(platforms.data) && platforms.data.length >= 6);

  // 3. URL 校验（非法）+ 通用站点识别
  const bad = await api('POST', '/api/resolve', { url: 'not a url' });
  check('非法 URL 被拒绝', bad.status === 400 && bad.data?.error === 'INVALID_URL');

  const generic = await api('POST', '/api/resolve', { url: 'https://example.com/video' });
  check('通用站点识别为 other', generic.status === 200 && generic.data?.video?.platform === 'other');

  // 4. 平台识别（解析一个模拟 URL）
  const resolve = await api('POST', '/api/resolve', { url: 'https://www.youtube.com/watch?v=smoke1' });
  check('解析视频', resolve.status === 200 && resolve.data?.video?.platform === 'youtube');
  const video = resolve.data?.video;
  check('视频含标题/缩略图/格式', !!video?.title && Array.isArray(video?.formats) && video.formats.length > 0);

  // 5. 创建任务
  const fmt = video.formats.find((f) => f.resolution !== 'audio') ?? video.formats[0];
  const create = await api('POST', '/api/tasks', { url: 'https://www.youtube.com/watch?v=smoke1', formatId: fmt.id, ext: fmt.ext, resolution: fmt.resolution, quality: fmt.resolution });
  check('创建任务', create.status === 200 && create.data?.id);
  const taskId = create.data?.id;
  check('任务初始状态', ['waiting', 'parsing', 'downloading', 'completed'].includes(create.data?.status), `got ${create.data?.status}`);

  // 6. 重复添加被拒绝
  const dup = await api('POST', '/api/tasks', { url: 'https://www.youtube.com/watch?v=smoke1' });
  check('重复添加被拒绝', dup.status === 409 && dup.data?.error === 'DUPLICATE', JSON.stringify(dup.data));

  // 7. 任务列表
  const list = await api('GET', '/api/tasks');
  check('任务列表', list.status === 200 && Array.isArray(list.data) && list.data.some((t) => t.id === taskId));

  // 8. 等待任务结束
  let task = create.data;
  const t0 = Date.now();
  while (!['completed', 'failed', 'cancelled'].includes(task.status) && Date.now() - t0 < 60000) {
    await new Promise((r) => setTimeout(r, 300));
    task = (await api('GET', `/api/tasks/${taskId}`)).data;
  }
  check('任务最终完成', task.status === 'completed', `status=${task.status} err=${task.errorMessage}`);

  // 9. 仅音频：确认音频格式能独立入队并生成对应扩展名的文件
  const audio = video.formats.find((f) => f.resolution === 'audio');
  check('解析结果含仅音频格式', !!audio, '未返回音频格式');
  let audioTask;
  if (audio) {
    const audioCreate = await api('POST', '/api/tasks', {
      url: 'https://www.youtube.com/watch?v=smoke-audio',
      formatId: audio.id,
      ext: audio.ext,
      resolution: audio.resolution,
      quality: 'audio',
    });
    check('创建仅音频任务', audioCreate.status === 200 && audioCreate.data?.id);
    const audioTaskId = audioCreate.data?.id;
    audioTask = audioCreate.data;
    const audioStart = Date.now();
    while (audioTaskId && !['completed', 'failed', 'cancelled'].includes(audioTask.status) && Date.now() - audioStart < 60000) {
      await new Promise((r) => setTimeout(r, 300));
      audioTask = (await api('GET', `/api/tasks/${audioTaskId}`)).data;
    }
    check('仅音频任务完成', audioTask?.status === 'completed', `status=${audioTask?.status} err=${audioTask?.errorMessage}`);
    check('仅音频文件格式正确', audioTask?.filePath?.endsWith(`.${audio.ext}`), audioTask?.filePath ?? '');
    if (audioTaskId) await api('DELETE', `/api/history/${audioTaskId}`);
  }

  // 10. 历史记录
  const history = await api('GET', '/api/history');
  check('历史记录含完成任务', history.status === 200 && history.data.some((t) => t.id === taskId));

  // 11. 统计
  const stats = await api('GET', '/api/stats');
  check('统计接口', stats.status === 200 && typeof stats.data?.totals?.tasks === 'number' && stats.data.totals.tasks >= 1);
  check('统计成功率', typeof stats.data?.successRate === 'number');

  // 12. 设置读写
  const settings = await api('GET', '/api/settings');
  check('读取设置', settings.status === 200 && settings.data?.['download.maxConcurrent'] > 0);
  const upd = await api('PUT', '/api/settings', { 'download.maxConcurrent': 5 });
  check('更新设置', upd.status === 200 && upd.data?.['download.maxConcurrent'] === 5);
  await api('PUT', '/api/settings', { 'download.maxConcurrent': 3 });

  // 13. 系统信息
  const sys = await api('GET', '/api/system');
  check('系统信息', sys.status === 200 && sys.data?.version && sys.data?.database?.connected === true);

  // 14. 文件管理（完成的任务有文件）
  if (task.filePath) {
    const open = await api('POST', `/api/tasks/${taskId}/open`);
    check('打开文件夹', open.status === 200 && open.data?.ok === true);
    const del = await api('DELETE', `/api/tasks/${taskId}/file`);
    check('删除文件', del.status === 200 && del.data?.ok === true && del.data?.task?.filePath === '');
  }

  // 15. 删除历史（不删文件）
  const delHist = await api('DELETE', `/api/history/${taskId}`);
  check('删除历史记录', delHist.status === 200 && delHist.data?.ok === true);

  console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
