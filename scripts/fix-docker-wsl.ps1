# 以管理员身份运行本脚本，修复 WSL 并重启 Docker Desktop
# 右键 PowerShell -> 以管理员身份运行，然后执行：
#   Set-ExecutionPolicy -Scope Process Bypass -Force
#   & "D:\个人项目列表\OneNav\scripts\fix-docker-wsl.ps1"

$ErrorActionPreference = "Continue"
Write-Host "==> 启用 Windows 功能..." -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

Write-Host "==> 安装/更新 WSL..." -ForegroundColor Cyan
wsl --install --no-distribution 2>&1
wsl --update 2>&1

$msi = Join-Path $env:TEMP "wsl.msi"
if (Test-Path $msi) {
  Write-Host "==> 安装已下载的 WSL 内核包..." -ForegroundColor Cyan
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait
}

Write-Host "==> 设置 WSL2 默认..." -ForegroundColor Cyan
wsl --set-default-version 2 2>&1

Write-Host "==> 重启 Docker Desktop..." -ForegroundColor Cyan
Get-Process "Docker Desktop","com.docker.backend","com.docker.service" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 2
$svc = Get-Service com.docker.service -ErrorAction SilentlyContinue
if ($svc) { Start-Service com.docker.service -ErrorAction SilentlyContinue }
Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"

Write-Host ""
Write-Host "完成后请等待 Docker Desktop 显示 Engine running，再执行：" -ForegroundColor Green
Write-Host '  docker login -u wnbuhao'
Write-Host "若提示重启电脑，请先重启再开 Docker Desktop。" -ForegroundColor Yellow
