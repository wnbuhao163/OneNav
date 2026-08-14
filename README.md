# OneNav

React + Ant Design + Go(Gin) + SQLite 个人导航 / 书签系统。  
**单镜像部署**，无需额外数据库 / Redis / Nginx 容器。

## 功能

- 首次启动初始化管理员账号
- 登录鉴权（JWT + Cookie，SameSite=Lax）
- 分类 / 链接 CRUD（支持是否私有、备用 URL）
- **私有规则**：未登录时前台不展示私有分类与私有链接；登录后可见
- Chrome / Edge 书签 HTML 导入；链接列表支持勾选后**批量修改分类**
- **Docker 容器导入**（可选）：扫描宿主机容器并一键添加导航链接
- 站点设置、主题、**完整备份**（zip：数据库 + uploads + 主题）
- 链接表单支持 URL 识别标题图标、智能推荐分类
- 前台展示页：搜索、分类锚点、页头实时日期时间与天气
- **网站 LOGO**：用于前台页头；设置后同步为浏览器标签 favicon
- 公开 API 可供外部 HTML/CSS/JS 主题调用
- 自定义 HTML 主题开发说明（后台「主题 → AI要求文档」）

## 一键部署

```bash
docker compose up -d --build
```

浏览器打开：http://localhost:8080  
数据目录：`./data`（挂载到容器 `/data`）

### 用 GitHub Actions 推送到 Docker Hub（推荐，本机不用 Docker）

1. 在 GitHub 新建空仓库，把本项目推上去（`main` 分支）
2. Docker Hub 创建 [Access Token](https://hub.docker.com/settings/security)
3. GitHub 仓库 → **Settings → Secrets and variables → Actions**，新增：
   - `DOCKERHUB_USERNAME`：你的 Hub 用户名（如 `wnbuhao`）
   - `DOCKERHUB_TOKEN`：刚才的 Access Token
4. 推送代码到 `main`，或在 Actions 里手动运行 **docker-publish**
5. 完成后镜像为：`你的用户名/onenav:latest`

别人使用（或你在 NAS 上拉取）：

```bash
set DOCKERHUB_USERNAME=wnbuhao
docker compose -f docker-compose.hub.yml up -d
```

### 生产建议清单

1. **JWT**：不设置时首次启动会在 `/data/.jwt_secret` 自动生成；也可显式设置 `ONENAV_JWT_SECRET`（≥16 位随机串）
2. **HTTPS 反代**：开启 `ONENAV_COOKIE_SECURE=1`
3. **跨域**：若前后端不同源，设置 `ONENAV_CORS_ORIGINS=https://你的域名`（逗号分隔）；留空仅允许本机开发源
4. **备份**：后台「站点设置 → 数据备份」导出 `.zip`，换机后恢复同一 zip
5. **健康检查**：`GET /api/health`（含 DB ping 与 version）
6. **不要默认挂载 docker.sock**（见下）

### Docker 容器 → 链接（可选）

默认 **不** 挂载 `docker.sock`。需要导入功能时：

```bash
# 可选：NAS / 宿主机局域网 IP，便于自动生成访问地址
export ONENAV_DOCKER_PUBLIC_HOST=192.168.1.10
docker compose -f docker-compose.yml -f docker-compose.docker.yml up -d --build
```

后台「链接列表」→「Docker 容器」→ 勾选 → 导入。可选容器标签：

```yaml
labels:
  onenav.enable: "true"
  onenav.name: "Jellyfin"
  onenav.url: "https://media.nas.local"
  onenav.icon: "https://..."
  onenav.private: "true"
```

## 本地开发

### 后端

需安装 Go 1.22+

```bash
cd backend
go mod tidy
# Windows 示例
set ONENAV_DATA=D:\个人项目列表\OneNav\data
go run ./cmd/server
```

默认监听 `8080`。

### 前端

```bash
cd frontend
npm install
npm run dev
```

Vite 已代理 `/api` → `http://127.0.0.1:8080`

## 目录结构

```
backend/                 # Go(Gin) 后端
frontend/                # React + Ant Design
home/                    # 参考用示例主题（不随镜像部署）
Dockerfile               # 多阶段 / 多架构构建 → 单镜像
docker-compose.yml
docker-compose.docker.yml  # 可选：启用 Docker 导入
.github/workflows/ci.yml
```

## 站点 LOGO 与浏览器标签

后台「站点设置 → 网站 LOGO」上传或填写图片地址后：

- 前台页头显示该 LOGO
- 浏览器标签页图标（favicon）自动使用**同一张图**
- 网站标题同步为标签页文字（`document.title`）

自定义 HTML 主题须在拿到 `/api/public/settings` 后同样设置 favicon（见后台「主题 → AI要求文档」中的「标题与 favicon」）。

| 模块 | 路径 |
|------|------|
| 健康检查 | `GET /api/health` |
| 初始化状态 | `GET /api/init/status` |
| 初始化 | `POST /api/init` |
| 登录 | `POST /api/auth/login` |
| 当前用户 | `GET /api/auth/me` |
| 站点设置 | `GET /api/public/settings` |
| 分类与链接 | `GET /api/public/categories` |
| 前台合并 | `GET /api/public/nav` |
| 备份导出/恢复 | `/api/admin/backup/export\|restore` |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `ONENAV_PORT` | `8080` | 端口 |
| `ONENAV_DATA` | `/data` | 数据目录（SQLite / uploads / themes） |
| `ONENAV_STATIC` | `/app/static` | 前端静态资源 |
| `ONENAV_JWT_SECRET` | 自动生成到 `.jwt_secret` | 生产可显式指定 |
| `ONENAV_COOKIE_SECURE` | `0` | HTTPS 时设为 `1` |
| `ONENAV_CORS_ORIGINS` | 空（仅本机开发源） | 允许的 Origin，逗号分隔 |
| `ONENAV_DOCKER_HOST` | 空（关闭） | 如 `unix:///var/run/docker.sock` |
| `ONENAV_DOCKER_PUBLIC_HOST` | 空 | 生成容器链接时的主机名/IP |
