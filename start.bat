@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   多人音视频通话 - 一键启动
echo ============================================
echo.
echo 正在启动服务器（端口 3001）...
echo 启动完成后请在浏览器访问：http://localhost:3001
echo 关闭本窗口即可停止服务器。
echo.
set PORT=3001
node server/app.js
echo.
echo 服务器已退出。
pause
