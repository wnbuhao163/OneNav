# 推送到 Docker Hub（GitHub Actions）

本机不用装好 Docker。流程：代码 → GitHub → Actions 构建 → Docker Hub。

## 一次性准备

### 1. GitHub 仓库

若还没有 git：

```powershell
cd D:\个人项目列表\OneNav
git init
git add .
git commit -m "Initial commit: OneNav"
```

在 GitHub 新建空仓库后：

```powershell
git remote add origin https://github.com/你的GitHub用户名/OneNav.git
git branch -M main
git push -u origin main
```

### 2. Docker Hub Token

1. 打开 https://hub.docker.com/settings/security  
2. New Access Token → 复制保存

### 3. 配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Name | Value |
|------|--------|
| `DOCKERHUB_USERNAME` | 你的 Docker Hub 用户名（不要用邮箱） |
| `DOCKERHUB_TOKEN` | 上一步的 Access Token |

## 触发构建

- 推送到 `main` / `master` 自动构建推送  
- 或 Actions → **docker-publish** → Run workflow  
- 打标签：`git tag v1.0.0 && git push origin v1.0.0` 会推送版本号标签

## 使用镜像

```powershell
$env:DOCKERHUB_USERNAME="wnbuhao"
docker compose -f docker-compose.hub.yml up -d
```
