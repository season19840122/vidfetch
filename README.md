# VidFetch · 在线视频下载管理器

一个功能完整、界面现代的「在线视频下载管理器」Web 应用。粘贴公开视频链接，自动识别平台、解析元信息、创建下载任务，并以队列方式管理并发下载、暂停/继续/取消/重试，支持任务持久化与服务重启后的任务恢复。

> **合规声明**：本工具仅用于下载你有权访问、下载或已获授权的**公开**视频资源。它不破解 DRM、不绕过付费墙、登录限制、访问控制或其他平台安全机制。若某平台因官方限制无法直接下载，应用会返回清晰的中文错误提示，而不是尝试绕过限制。

## 功能特性

- **多平台解析**：YouTube、Bilibili、抖音、TikTok、Vimeo、X、Instagram 等重点平台，以及**任意 yt-dlp 支持的上千个网站**（自动归入「其他网站」通用解析）；抖音“精选页”链接会自动转换为标准视频链接
- **元信息预览**：标题、缩略图、平台、时长、作者、可用分辨率与格式、文件大小；哔哩哔哩封面通过本地安全代理加载，避免 CDN 防盗链导致空白
- **下载任务队列**：并发限制（1/2/3/5/10）、多任务、状态持久化
- **任务状态机**：Waiting / Parsing / Downloading / Paused / Completed / Failed / Cancelled
- **实时进度**：百分比、速度、剩余时间（SSE 实时推送）；续传和分段下载时进度只增不减，避免视觉回退
- **任务控制**：暂停 / 继续 / 取消 / 重试 / 删除（记录与文件明确区分）；失败或已取消的历史记录均可按上一次的格式和保存位置重试
- **任务恢复**：服务重启后自动恢复中断的任务（`--continue` 断点续传）
- **下载历史**：搜索、平台/状态筛选、时间排序、清空；视频标题可跳转至源链接
- **音频下载**：优先使用所选音频格式；当平台没有独立音频流时，自动从可用视频流提取 M4A（需要 ffmpeg）
- **Dashboard**：今日/累计统计、成功率、各平台分布、每日下载量（图表）
- **设置**：默认质量/格式、并发数、保存目录、限速、超时、重试、主题（浅色/深色/跟随系统）
- **响应式**：桌面 / 平板 / 手机自适应
- **Docker 部署**：一键 `docker compose up -d`

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Vue 3 · TypeScript · Vite · Tailwind CSS · Pinia · Vue Router · Chart.js |
| 后端 | Node.js · TypeScript · Fastify · node:sqlite · SSE |
| 数据 | SQLite（内置 `node:sqlite`，WAL 模式） |
| 下载引擎 | yt-dlp + ffmpeg |
| 部署 | Docker · docker-compose |

## 目录结构

```
.
├── client/                     # 前端（Vue 3 + Vite + Tailwind）
│   ├── src/
│   │   ├── api/                # API 客户端
│   │   ├── components/         # UI 组件（Icon/Modal/ProgressBar/Badge/图表…）
│   │   ├── stores/             # Pinia 状态（tasks/settings/toast）
│   │   ├── utils/              # 格式化工具
│   │   ├── views/              # 页面（Home/Tasks/History/Dashboard/Settings）
│   │   ├── App.vue / main.ts / router
│   └── vite.config.ts / tailwind.config.js
├── server/                     # 后端（Fastify + SQLite）
│   └── src/
│       ├── index.ts            # 入口
│       ├── config.ts           # 环境变量配置
│       ├── db.ts               # SQLite 数据层
│       ├── platform.ts         # 平台识别 / URL 校验
│       ├── resolver.ts         # 元信息解析（yt-dlp + 模拟）
│       ├── downloader.ts       # 下载执行（进度/暂停/继续/取消）
│       ├── queue.ts            # 并发任务队列 + 恢复
│       ├── stats.ts            # 统计聚合
│       ├── settings.ts         # 设置 / 系统信息
│       ├── routes.ts           # API 路由 + SSE
│       └── types.ts            # 共享类型
├── Dockerfile
├── docker-compose.yml
├── railway.json                # Railway 配置即代码
└── package.json                # npm workspaces
```

## 环境要求

- Node.js ≥ 22.5（使用内置 `node:sqlite`）
- 可选：`yt-dlp`（建议）与 `ffmpeg`（用于合并音视频流）

## 安装

```bash
npm install
```

## 开发环境启动

```bash
# 同时启动后端(45392)与前端(45391，代理到 45392)
npm run dev
```

- 前端：http://localhost:45391
- 后端：http://localhost:45392

也可以分开启动：

```bash
npm run dev:server   # 后端
npm run dev:client   # 前端
```

## 生产环境启动

```bash
npm run build    # 构建后端(server/dist) + 前端(client/dist)
npm start        # 后端托管前端静态资源，单端口访问
```

访问 http://localhost:45392。

## 环境变量配置

复制 `.env.example` 为 `.env` 或直接设置环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `45392` | 后端端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data` | 数据目录（数据库 + 下载文件） |
| `DB_PATH` | 空 | 数据库路径（默认 `DATA_DIR/app.db`） |
| `DOWNLOAD_DIR` | 空 | 下载目录（默认 `DATA_DIR/downloads`） |
| `MAX_CONCURRENT` | `3` | 默认最大并发 |
| `DEFAULT_QUALITY` | `1080p` | 默认质量 |
| `DEFAULT_FORMAT` | `mp4` | 默认格式 |
| `MAX_SPEED` | `0` | 限速（字节/秒，0 不限） |
| `TIMEOUT` | `60000` | 请求超时（毫秒） |
| `RETRY_COUNT` | `3` | 自动重试次数 |
| `YTDLP_PATH` | 空 | yt-dlp 可执行文件路径 |
| `SIMULATE` | `auto` | 模拟模式：`auto`/`on`/`off` |

> **模拟模式**：当未安装 yt-dlp（或 `SIMULATE=on`）时，后端自动降级为「模拟下载」，用于本地开发与功能测试（生成模拟文件并真实走完队列/进度/暂停/恢复全流程）。生产环境请安装 yt-dlp 并保持 `SIMULATE=auto`。

## Docker 部署

```bash
docker compose up -d
```

访问 http://localhost:45392。下载文件持久化在宿主机的 `./data` 目录。

## Railway 部署（后端）

仓库根目录的 `railway.json` 已将构建方式、健康检查与重启策略纳入版本控制，并会显式清空旧的面板构建命令。Railway 每次从 GitHub 拉取代码时都会使用该配置，因此不需要重复填写构建命令或启动命令。

1. 在 Railway 中新建 **一个** GitHub 服务，选择本仓库的 `main` 分支；服务根目录保持为仓库根目录，不要分别部署 `server` 与 `client`。
2. Railway 会使用根目录 `Dockerfile` 构建镜像，并通过 `/api/health` 进行健康检查。
3. 为该服务一次性添加 Volume，挂载路径填写 `/data`。下载历史、SQLite 数据库与下载文件会保存在此处。
4. 在 Networking 中生成服务域名。
5. 在 Netlify 的环境变量中设置 `VITE_API_BASE=https://<你的-railway-域名>`，然后重新部署前端。

`Dockerfile` 已提供 `DATA_DIR=/data`、`NODE_ENV=production`、`HOST=0.0.0.0` 等生产默认值；Railway 会自动注入 `PORT`，无需手动设置。可按需在 Railway Variables 中额外设置：

| 变量 | 推荐值 | 用途 |
| --- | --- | --- |
| `SIMULATE` | `off` | 强制使用镜像内的 yt-dlp，不降级为模拟下载 |
| `MAX_CONCURRENT` | `1` | 初次上线时限制并发，降低资源占用 |

> 不要把 Cookies、密钥或任何登录凭据提交到 Git。此类敏感配置仅应放在 Railway Variables。云端容器不能读取本机浏览器的 Cookies，`YTDLP_COOKIES_FROM_BROWSER` 应保持为空。

## 静态站点部署（GitHub Pages / Netlify，仅前端 UI）

> **重要说明**：本章只发布**前端 UI**。vidfetch 的下载后端（Fastify + SQLite + yt-dlp + ffmpeg）需要 Node ≥ 22 与常驻进程，无法在 GitHub Pages / Netlify 静态托管上运行。静态站点在前端会提示「无法连接到服务器」；接入后端后功能即可用（见下文）。

### 部署地址

- GitHub Pages：https://season19840122.github.io/vidfetch/（推送 `main` 自动部署，workflow 见 `.github/workflows/deploy-gh-pages.yml`）
- Netlify：https://vidfetch.netlify.app/（`netlify.toml` 已配置构建与 SPA 回退）

### 接入后端（可选）

构建前端时指定后端地址，前端将请求 `<后端地址>/api`：

```bash
VITE_API_BASE=https://your-backend.example.com npm run build:client
```

- **GitHub Pages**：在仓库 Settings → Secrets and variables → Actions → **Variables** 新建 `VITE_API_BASE` 后重新构建。
- **Netlify**：`netlify.toml` 已配置当前 Railway 后端地址；如更换 Railway 域名，更新其中的 `VITE_API_BASE` 后重新部署。

## API 文档

基础路径：`/api`。所有错误响应统一为 `{ "error": "错误码", "message": "中文提示" }`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/platforms` | 支持的平台列表 |
| GET | `/api/thumbnail?url=` | 获取哔哩哔哩封面代理（仅限 hdslb CDN 图片） |
| POST | `/api/resolve` | 解析视频元信息（`{ url }`） |
| POST | `/api/tasks` | 创建下载任务（`{ url, formatId?, quality?, ext?, saveDir? }`） |
| GET | `/api/tasks` | 任务列表（`?status=&search=&platform=&orderBy=&orderDir=`） |
| GET | `/api/tasks/:id` | 任务详情 |
| POST | `/api/tasks/:id/pause` | 暂停 |
| POST | `/api/tasks/:id/resume` | 继续 |
| POST | `/api/tasks/:id/cancel` | 取消 |
| POST | `/api/tasks/:id/retry` | 重试 |
| DELETE | `/api/tasks/:id` | 删除任务记录（不删文件） |
| DELETE | `/api/tasks/:id/file` | 删除实际文件 |
| POST | `/api/tasks/:id/open` | 打开所在文件夹 |
| GET | `/api/history` | 历史记录（`?status=&search=&platform=`） |
| DELETE | `/api/history/:id` | 删除单条历史（不删文件） |
| DELETE | `/api/history` | 清空历史（不删文件） |
| GET | `/api/stats` | Dashboard 统计 |
| GET | `/api/settings` | 读取设置 |
| PUT | `/api/settings` | 更新设置 |
| POST | `/api/settings/reset` | 恢复默认设置 |
| GET | `/api/system` | 系统状态（版本/数据库/磁盘/解析引擎） |
| POST | `/api/system/select-directory` | 打开本机文件夹选择器，返回所选下载目录 |
| GET | `/api/events` | SSE 实时事件流 |

### 错误码

`INVALID_URL`、`UNSUPPORTED_PLATFORM`、`VIDEO_NOT_FOUND`、`VIDEO_UNAVAILABLE`、`NETWORK_ERROR`、`DOWNLOAD_FAILED`、`TIMEOUT`、`DISK_FULL`、`WRITE_FAILED`、`DUPLICATE`、`RESOLVER_UNAVAILABLE`、`TASK_NOT_FOUND`、`INVALID_STATE`。

## 自动化测试

项目内置四套测试脚本（位于 `scripts/`），建议在模拟模式下运行以获得确定性结果：

```bash
# 启动后端（模拟模式，无需网络）
SIMULATE=on DATA_DIR=./data-test node server/dist/index.js

# API 冒烟测试（健康、解析、音频任务、历史、统计、设置、文件）
node scripts/smoke-test.mjs

# 控制流测试（暂停/继续/取消/重试/删除）
node scripts/control-test.mjs

# 压力测试（20 个任务并发，验证并发限制与队列）
node scripts/stress-test.mjs

# 浏览器自动化测试（需 Playwright + Chromium）
node scripts/browser-test.mjs
```

## 常见问题

**Q：为什么解析/下载失败？**
A：先看错误提示。常见原因：未安装 yt-dlp、网络不通、视频需要登录、视频受 DRM 保护、链接格式错误。应用会给出对应的中文原因。

**Q：YouTube 提示「Sign in to confirm you're not a bot / 需要登录」？**
A：这是 YouTube 的**人机验证**（反机器人检测），并非视频本身受限，多发生在数据中心 IP 或频繁下载时。解决方法：在「设置 → 网络设置 → Cookies 来源」中选择你本机**已登录 YouTube 的浏览器**（如 Chrome/Firefox），应用会读取你自己的浏览器登录状态来解析公开视频。也可用环境变量 `YTDLP_COOKIES_FROM_BROWSER=chrome` 指定。注意：该方式读取的是本机浏览器，Docker 容器内无浏览器、应保持关闭。

**Q：为什么 YouTube 的“仅音频”下载会要求 ffmpeg？**
A：部分视频不提供独立音频流。应用会下载可用的含音轨流，再提取为 M4A；请安装 ffmpeg。若视频本身提供独立音频流，则会直接下载所选音频格式。

**Q：抖音“精选页”链接可以直接粘贴吗？**
A：可以。形如 `https://www.douyin.com/jingxuan?modal_id=...` 的链接会自动转换为标准视频页再解析。抖音可能要求新鲜的浏览器 Cookies；如出现访问提示，请在设置中选择已登录抖音的浏览器。

**Q：为什么某些低分辨率格式反而更大？**
A：文件大小由源站提供的编码、码率、是否带水印等共同决定，并不只取决于分辨率。例如 H.265 的 720P 可能比高码率 H.264 的 576P 或带水印的 405P 更小；页面显示的是平台返回的预估值。

**Q：如何安装 yt-dlp？**
A：macOS `brew install yt-dlp`；Linux `pip install yt-dlp`（或 `pipx install yt-dlp`）。确保 `ffmpeg` 也已安装（合并音视频流需要）。

**Q：重启服务后任务会丢失吗？**
A：不会。任务状态持久化在 SQLite，服务重启后会自动把中断的任务重新入队，并通过 `--continue` 断点续传。

**Q：删除历史会删除视频文件吗？**
A：不会。「删除记录」与「删除文件」是两个独立操作，明确区分。

**Q：为什么显示「模拟模式」？**
A：后端未检测到 yt-dlp 时自动降级为模拟下载，用于保证本地可运行与测试。安装 yt-dlp 后重启即可使用真实下载。
