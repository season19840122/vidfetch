import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config';
import { initDb } from './db';
import { queue } from './queue';
import { registerRoutes } from './routes';

async function main(): Promise<void> {
  initDb();
  queue.init();

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'info' },
    bodyLimit: 1024 * 1024,
  });

  await app.register(cors, { origin: true });

  // 生产环境：直接托管前端构建产物
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  const hasClient = fs.existsSync(path.join(clientDist, 'index.html'));

  if (hasClient) {
    await app.register(fastifyStatic, {
      root: clientDist,
      prefix: '/',
    });
  }

  registerRoutes(app);

  // SPA 回退：非 /api 路由返回 index.html
  app.setNotFoundHandler((req, reply) => {
    const url = req.raw.url ?? '';
    if (url.startsWith('/api')) {
      reply.code(404).send({ error: 'NOT_FOUND', message: '接口不存在' });
      return;
    }
    if (hasClient) {
      reply.type('text/html').send(fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8'));
      return;
    }
    reply.code(404).send({ error: 'NOT_FOUND', message: '资源不存在' });
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `在线视频下载管理器已启动: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
  );
  app.log.info(`下载目录: ${config.downloadDir}  数据库: ${config.dbPath}`);
}

main().catch((err) => {
  console.error('[FATAL] 服务启动失败:', err);
  process.exit(1);
});
