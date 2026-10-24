@echo off
chcp 65001 >nul
title 行测刷题网站
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

echo 正在启动行测刷题网站...
start "" http://localhost:3456
node server.js
pause
