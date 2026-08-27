@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 设置颜色和标题
color 0B
title WebRTC 视频通话系统 - 备份工具

echo.
echo ========================================
echo   WebRTC 视频通话系统 - 备份工具
echo ========================================
echo.

:: 设置备份目录
set "BACKUP_DIR=backup"
set "TIMESTAMP=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=%TIMESTAMP: =0%"

:: 创建备份目录
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set "CURRENT_BACKUP=%BACKUP_DIR%\backup_%TIMESTAMP%"
mkdir "%CURRENT_BACKUP%"

echo 📁 开始备份...
echo.

:: 备份重要数据文件
echo [1/5] 备份聊天历史...
if exist "data\chat-history.json" (
    copy "data\chat-history.json" "%CURRENT_BACKUP%\chat-history.json" >nul
    echo ✅ 聊天历史已备份
)

echo [2/5] 备份用户配置...
if exist "data\user-profiles.json" (
    copy "data\user-profiles.json" "%CURRENT_BACKUP%\user-profiles.json" >nul
    echo ✅ 用户配置已备份
)

echo [3/5] 备份字幕历史记录...
if exist "data\*" (
    xcopy "data\*" "%CURRENT_BACKUP%\data\" /Y /I >nul 2>&1
    echo ✅ 字幕历史已备份
)

echo [4/5] 备份配置文件...
if exist "package.json" copy "package.json" "%CURRENT_BACKUP%\package.json" >nul
if exist ".gitignore" copy ".gitignore" "%CURRENT_BACKUP%\.gitignore" >nul
echo ✅ 配置文件已备份

echo [5/5] 创建备份信息文件...
(
    echo 备份时间: %date% %time%
    echo 备份目录: %CURRENT_BACKUP%
    echo 项目路径: %CD%
    echo 备份内容:
    dir /b "%CURRENT_BACKUP%"
) > "%CURRENT_BACKUP%\backup-info.txt"
echo ✅ 备份信息已创建

echo.
echo ========================================
echo   ✅ 备份完成！
echo ========================================
echo.
echo 📂 备份位置: %CURRENT_BACKUP%
echo 📊 备份文件:
dir /b "%CURRENT_BACKUP%" | find /v "" >nul
if errorlevel 1 (
    echo   (无文件)
) else (
    dir /b "%CURRENT_BACKUP%"
)
echo.

:: 清理旧备份（保留最近5个）
echo 🔧 清理旧备份（保留最近5个）...
for /f "skip=5 delims=" %%d in ('dir /b /ad /o-d "%BACKUP_DIR%\backup_*"') do (
    rd /s /q "%BACKUP_DIR%\%%d" 2>nul
    echo   删除旧备份: %%d
)

echo.
echo 💡 备份提示:
echo    - 定期备份可防止数据丢失
echo    - 可将备份文件夹复制到安全位置
echo    - 建议在重要操作前创建备份
echo.

pause