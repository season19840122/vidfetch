// 浏览器自动化测试：使用 Playwright (headless chromium) 验证前端真实运行。
// 用法：node scripts/browser-test.mjs [BASE_URL]
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://localhost:3000';
const CHROME =
  process.env.CHROME_PATH ||
  process.env.HOME +
    '/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell';

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`== 浏览器测试（${BASE}）==\n`);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });

  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('  [pageerror]', e.message));

    // 1. 首页打开
    await page.goto(BASE, { waitUntil: 'networkidle' });
    const title = await page.title();
    check('首页标题', title.includes('在线视频下载管理器'), title);
    const h1 = await page.locator('h1').first().textContent();
    check('首页主标题', h1?.includes('在线视频下载管理器'), h1 ?? '');

    // 2. URL 输入框
    const input = page.locator('input[type="url"], input[placeholder*="粘贴视频链接"]').first();
    check('URL 输入框存在', (await input.count()) > 0);

    // 3. URL 校验：非法
    await input.fill('not a url');
    await page.getByRole('button', { name: /解析视频/ }).click();
    await sleep(500);
    const errText = await page.locator('body').textContent();
    check('非法 URL 校验', errText?.includes('URL 格式错误') || errText?.includes('请输入视频链接'), '未出现错误提示');

    // 4. 通用站点（非白名单）也能解析
    await input.fill('https://example.com/video');
    await page.getByRole('button', { name: /解析视频/ }).click();
    await sleep(800);
    const body2 = await page.locator('body').textContent();
    check('通用站点解析', body2?.includes('其他网站') || body2?.includes('加入下载队列'), '');

    // 5. 平台识别 + 解析
    await input.fill('https://www.youtube.com/watch?v=browsertest1');
    await page.getByRole('button', { name: /解析视频/ }).click();
    await page.waitForSelector('text=选择清晰度 / 格式', { timeout: 10000 });
    const hasPreview = (await page.locator('body').textContent())?.includes('加入下载队列');
    check('解析出预览卡片', hasPreview === true, '');
    const platformBadge = await page.locator('body').textContent();
    check('识别平台 YouTube', platformBadge?.includes('YouTube') === true, '');

    // 6. 加入下载队列
    await page.getByRole('button', { name: /加入下载队列/ }).click();
    await page.waitForURL('**/tasks', { timeout: 10000 });
    check('跳转到任务页', page.url().includes('/tasks'));
    await page.waitForSelector('.card', { timeout: 10000 }).catch(() => {});
    await sleep(1500);
    const tasksText = await page.locator('body').textContent();
    check('任务出现在列表', tasksText?.includes('下载中') || tasksText?.includes('已完成') || tasksText?.includes('等待中'), '');

    // 7. Dashboard
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await sleep(800);
    const dashText = await page.locator('body').textContent();
    check('Dashboard 标题', dashText?.includes('Dashboard') === true, '');
    const canvases = await page.locator('canvas').count();
    check('图表渲染 (canvas)', canvases >= 2, `canvas=${canvases}`);

    // 8. 历史页
    await page.goto(BASE + '/history', { waitUntil: 'networkidle' });
    await sleep(500);
    check('历史页加载', (await page.locator('body').textContent())?.includes('下载历史') === true, '');

    // 9. 设置页 + 深色模式
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle' });
    await sleep(500);
    check('设置页加载', (await page.locator('body').textContent())?.includes('下载设置') === true, '');
    await page.getByRole('button', { name: /深色/ }).click();
    await page.getByRole('button', { name: /保存设置/ }).click();
    await sleep(600);
    const isDark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    check('深色模式生效', isDark === true, '');

    // 10. 手机端布局
    const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mpage = await mctx.newPage();
    await mpage.goto(BASE, { waitUntil: 'networkidle' });
    await sleep(500);
    const noHScroll = await mpage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    check('手机端无横向滚动', noHScroll === true, `scrollWidth=${await mpage.evaluate(() => document.documentElement.scrollWidth)}`);
    const hasMenu = (await mpage.locator('body').textContent())?.length > 0;
    check('手机端内容渲染', hasMenu === true, '');
    await mctx.close();

    console.log(`\n== 浏览器测试结果：${pass} 通过 / ${fail} 失败 ==`);
  } finally {
    await browser.close();
  }
}

main()
  .then(() => process.exit(fail ? 1 : 0))
  .catch((e) => {
    console.error('浏览器测试异常:', e.message);
    process.exit(1);
  });
