// 压力测试：同时加入 20 个任务，验证并发限制、队列与状态。
// 用法：node scripts/stress-test.mjs [BASE_URL]
const BASE = process.argv[2] || 'http://localhost:45392';
const N = 20;

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`== 压力测试：向 ${BASE} 加入 ${N} 个任务 ==`);

  const started = [];
  for (let i = 0; i < N; i++) {
    const url = `https://www.youtube.com/watch?v=stress${i}`;
    const t = await api('POST', '/api/tasks', { url });
    started.push(t.id);
    console.log(`  + 任务 ${i + 1}: ${t.id} (${t.title || '解析中'})`);
  }
  console.log(`已加入 ${started.length} 个任务\n`);

  let maxConcurrent = 0;
  let maxDownloading = 0;
  const t0 = Date.now();
  let done = 0;

  while (done < N) {
    await sleep(250);
    const tasks = await api('GET', '/api/tasks');
    const active = tasks.filter((t) => t.status === 'downloading' || t.status === 'parsing');
    const downloading = tasks.filter((t) => t.status === 'downloading');
    maxConcurrent = Math.max(maxConcurrent, active.length);
    maxDownloading = Math.max(maxDownloading, downloading.length);
    done = tasks.filter((t) => ['completed', 'failed', 'cancelled'].includes(t.status)).length;

    const progress = tasks
      .filter((t) => t.status === 'downloading')
      .map((t) => `${Math.round(t.progress)}%`)
      .join(',');
    process.stdout.write(
      `\r  进行中=${active.length} 下载中=${downloading.length} 完成=${done}/${N}  [${progress}]    `,
    );
    if (Date.now() - t0 > 180000) {
      console.log('\n超时（180s），停止等待');
      break;
    }
  }
  console.log('\n');

  const tasks = await api('GET', '/api/tasks');
  const counts = {};
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  console.log('== 结果 ==');
  console.log(`  最大并发（解析中+下载中）: ${maxConcurrent}`);
  console.log(`  最大同时下载: ${maxDownloading}`);
  console.log(`  总耗时: ${elapsed}s`);
  console.log(`  最终状态分布:`, counts);

  const failed = tasks.filter((t) => t.status === 'failed');
  if (failed.length) {
    console.log(`  失败任务 ${failed.length} 个:`);
    for (const f of failed) console.log(`    - ${f.title}: ${f.errorMessage}`);
  }

  const ok = maxConcurrent <= 3 && (counts.completed || 0) === N && !failed.length;
  console.log(ok ? '\n✅ 压力测试通过' : '\n❌ 压力测试未通过');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('测试异常:', e.message);
  process.exit(1);
});
