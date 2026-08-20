# ===== 构建阶段 =====
FROM node:22-alpine AS build
WORKDIR /app

# 先复制依赖清单，利用缓存
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --no-audit --no-fund

# 复制源码并构建
COPY . .
RUN npm run build

# ===== 运行阶段 =====
FROM node:22-alpine AS runtime
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --no-cache-dir --break-system-packages yt-dlp

WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=45392 \
    DATA_DIR=/data

# 仅安装生产依赖
COPY package.json package-lock.json* ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --omit=dev --no-audit --no-fund

# 复制构建产物
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist

EXPOSE 45392

CMD ["node", "server/dist/index.js"]
