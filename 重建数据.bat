@echo off
chcp 65001 >nul
title 重建题库数据
cd /d "%~dp0"

if not exist "data\xingcezhenti\README.md" (
  echo 首次运行：先从 GitHub 拉取上游题库（约 260MB，需要网络）...
  node tools\fetch-bank.cjs
  if errorlevel 1 (
    echo.
    echo 拉取失败。可手动下载：https://github.com/ERRRC/xingcezhenti/archive/refs/heads/main.zip
    echo 解压后把内容放到 data\xingcezhenti\ 再重新运行本脚本。
    pause
    exit /b 1
  )
)

echo 正在构建题库 JSON（约需几分钟）...
node tools\build.mjs
if errorlevel 1 goto fail
echo 正在构建考点库 knowledge.json / materials.json / qidmap.json ...
node tools\build-knowledge.cjs
if errorlevel 1 goto fail
echo.
echo 完成。数据位于 app\data\ 目录。
pause
exit /b 0
:fail
echo.
echo 构建失败，请把上面的报错截图提 Issue。
pause
exit /b 1
