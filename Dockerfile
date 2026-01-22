# 第一阶段：构建阶段
FROM node:22-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci

# 复制项目文件
COPY . .

# 构建应用
RUN npm run build

# 第二阶段：运行阶段
FROM nginx:alpine

# 复制构建产物到 nginx 默认目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 nginx 配置文件
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
