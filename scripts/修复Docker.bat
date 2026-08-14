@echo off
chcp 65001 >nul
title 修复 Docker / WSL
echo ========================================
echo  请确认本窗口标题栏显示“管理员”
echo  若不是，请关闭后：右键此文件 - 以管理员身份运行
echo ========================================
echo.

echo [1/5] 启用 WSL 功能...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
echo.

echo [2/5] 启用虚拟机平台...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
echo.

echo [3/5] 安装/更新 WSL...
wsl --install --no-distribution
wsl --update
echo.

echo [4/5] 安装本地内核包（如有）...
if exist "%TEMP%\wsl.msi" (
  msiexec /i "%TEMP%\wsl.msi" /qb /norestart
) else (
  echo 未找到 %TEMP%\wsl.msi ，跳过
)
echo.

echo [5/5] 启动 Docker 服务与 Desktop...
net start com.docker.service
start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
echo.

echo ========================================
echo 完成后请看 Docker Desktop 是否变为 Running
echo 若提示重启电脑，请先重启
echo ========================================
pause
