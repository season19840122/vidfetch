// 控制流测试：暂停/继续/取消/重试/删除，验证暂停时进度真正冻结。
// 用法：node scripts/control-test.mjs [BASE_URL]
const BASE = process.argv[2] || 'http://localhost:3000';

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
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(id, predicate, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const t = await api('GET', `/api/tasks/${id}`);
    if (predicate(t)) return t;
    await sleep(250);
  }
  throw new Error(`超时等待 ${label}`);
}

async function main() {
  console.log(`== 控制流测试（${BASE}）==\n`);

  // 限速到 2MB/s，让下载足够慢以便暂停
  await api('PUT', '/api/settings', { 'network.maxSpeed': 2 * 1024 * 1024 });
  try {
    await run();
  } finally {
    // 清理：恢复不限速
    await api('PUT', '/api/settings', { 'network.maxSpeed': 0 });
  }
}

async function run() {

  // 1. 暂停 / 继续
  console.log('【暂停/继续】');
  const resolve = await api('POST', '/api/resolve', { url: 'https://www.youtube.com/watch?v=ctrl1' });
  const fmt1080 = resolve.video.formats.find((f) => f.resolution === '1080p');
  const t1 = await api('POST', '/api/tasks', {
    url: 'https://www.youtube.com/watch?v=ctrl1',
    formatId: fmt1080.id,
    ext: 'mp4',
    resolution: '1080p',
    quality: '1080p',
  });
  await waitFor(t1.id, (t) => t.status === 'downloading' && t.progress >= 20, 30000, '进入下载');
  await api('POST', `/api/tasks/${t1.id}/pause`);
  await sleep(1500);
  const pausedAt = await api('GET', `/api/tasks/${t1.id}`);
  check('暂停后状态为 paused', pausedAt.status === 'paused', `got ${pausedAt.status}`);
  const frozenProgress = pausedAt.progress;
  await sleep(2000);
  const still = await api('GET', `/api/tasks/${t1.id}`);
  check('暂停时进度冻结', Math.abs(still.progress - frozenProgress) < 2, `${frozenProgress} -> ${still.progress}`);

  await api('POST', `/api/tasks/${t1.id}/resume`);
  await waitFor(t1.id, (t) => t.status === 'completed', 90000, '继续后完成');
  check('继续后最终完成', true);

  // 2. 取消
  console.log('【取消】');
  const t2 = await api('POST', '/api/tasks', {
    url: 'https://www.youtube.com/watch?v=ctrl2',
    formatId: fmt1080.id,
    ext: 'mp4',
    resolution: '1080p',
    quality: '1080p',
  });
  await waitFor(t2.id, (t) => t.status === 'downloading' && t.progress >= 10, 30000, '进入下载');
  await api('POST', `/api/tasks/${t2.id}/cancel`);
  const cancelled = await waitFor(t2.id, (t) => t.status === 'cancelled', 10000, '取消生效');
  check('取消后状态为 cancelled', cancelled.status === 'cancelled');

  // 3. 重试（取消的任务）
  console.log('【重试】');
  await api('POST', `/api/tasks/${t2.id}/retry`);
  await waitFor(t2.id, (t) => t.status === 'completed', 90000, '重试后完成');
  const retried = await api('GET', `/api/tasks/${t2.id}`);
  check('重试后最终完成', retried.status === 'completed');

  // 4. 删除记录（不删文件）
  console.log('【删除记录】');
  await api('DELETE', `/api/tasks/${t2.id}`);
  const goneRes = await fetch(`${BASE}/api/tasks/${t2.id}`);
  check('删除后任务不存在', goneRes.status === 404, `status=${goneRes.status}`);

  // 5. 删除文件（用 t1）
  console.log('【删除文件】');
  const del = await api('DELETE', `/api/tasks/${t1.id}/file`);
  check('删除文件接口成功', del.ok === true && del.task.filePath === '');
  const t1After = await api('GET', `/api/tasks/${t1.id}`);
  check('删除文件后记录保留', t1After.status === 'completed' && t1After.filePath === '');

}

main().then(() => {
  console.log(`\n== 结果：${pass} 通过 / ${fail} 失败 ==`);
  process.exit(fail ? 1 : 0);
}).catch((e) => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
