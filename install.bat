@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   多人音视频通话 - 一键安装依赖
echo ============================================
echo.
echo 正在安装依赖（优先 pnpm，否则 npm）...
where pnpm >nul 2>nul && (call pnpm install) || (call npm install)
echo.
echo 依赖安装完成！可双击 start.bat 启动服务器。
echo.
pause
