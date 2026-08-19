@echo off
chcp 65001 >nul
echo ============================================
echo   多人音视频通话 - 一键关闭
echo ============================================
echo.
echo 正在查找占用 3000 端口的进程并停止...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo.
echo 服务器已停止（如原本未运行则无操作）。
echo.
pause
