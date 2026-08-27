@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: 设置颜色和标题
color 0A
title WebRTC 视频通话系统 - 一键安装

echo.
echo ========================================
echo   WebRTC 视频通话系统 - 一键安装
echo ========================================
echo.

:: 检查 Node.js 是否安装
echo [1/6] 检查 Node.js 安装...
node -v >nul 2>&1
if errorlevel 1 (
    echo ❌ 未检测到 Node.js，请先安装 Node.js
    echo 📥 下载地址: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: 显示 Node.js 版本
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo ✅ Node.js 已安装: !NODE_VERSION!
echo ✅ npm 版本: !NPM_VERSION!
echo.

:: 检查项目文件完整性
echo [2/6] 检查项目文件...
if not exist "package.json" (
    echo ❌ 缺少 package.json 文件
    pause
    exit /b 1
)
if not exist "server\app.js" (
    echo ❌ 缺少服务端文件 server\app.js
    pause
    exit /b 1
)
if not exist "client\index.html" (
    echo ❌ 缺少客户端文件 client\index.html
    pause
    exit /b 1
)
echo ✅ 项目文件检查完成
echo.

:: 创建必要的目录
echo [3/6] 创建数据目录...
if not exist "data" mkdir data
echo ✅ 数据目录创建完成
echo.

:: 安装依赖
echo [4/6] 安装项目依赖...
echo 这可能需要几分钟时间，请耐心等待...
echo.
call npm install --verbose
if errorlevel 1 (
    echo.
    echo ❌ 依赖安装失败！
    echo.
    echo 可能的解决方案：
    echo 1. 检查网络连接
    echo 2. 尝试使用管理员权限运行
    echo 3. 清除 npm 缓存: npm cache clean --force
    echo 4. 更换 npm 镜像源: npm config set registry https://registry.npmmirror.com
    echo.
    pause
    exit /b 1
)
echo ✅ 依赖安装完成
echo.

:: 验证关键依赖
echo [5/6] 验证关键依赖...
node -e "try{require('express');console.log('✅ express');}catch{console.log('❌ express');}"
node -e "try{require('socket.io');console.log('✅ socket.io');}catch{console.log('❌ socket.io');}"
node -e "try{require('peer');console.log('✅ peer');}catch{console.log('❌ peer');}"
echo.

:: 创建快捷启动脚本
echo [6/6] 创建快捷启动脚本...
(
    echo @echo off
    echo title WebRTC 视频通话系统
    echo echo 正在启动服务器...
    echo echo.
    echo node server\app.js
    echo pause
) > "启动服务器.bat"

echo ✅ 快捷启动脚本已创建: 启动服务器.bat
echo.

:: 安装完成提示
echo ========================================
echo   ✅ 安装完成！
echo ========================================
echo.
echo 📋 后续步骤:
echo.
echo 1. 启动服务器:
echo    - 双击运行 "启动服务器.bat"
echo    - 或在命令行运行: npm start
echo.
echo 2. 打开浏览器:
echo    - 访问: http://localhost:3000
echo    - 推荐使用 Chrome 或 Edge 浏览器
echo.
echo 3. 允许浏览器访问:
echo    - 摄像头权限
echo    - 麦克风权限
echo.
echo 4. 详细使用指南请查看:
echo    - 本地测试指南.md
echo    - README.md
echo.
echo ========================================
echo.

:: 询问是否立即启动
set /p LAUNCH="是否立即启动服务器？(Y/N): "
if /i "%LAUNCH%"=="Y" (
    echo.
    echo 🚀 正在启动服务器...
    echo.
    start http://localhost:3000
    call npm start
) else (
    echo.
    echo 👋 安装完成！请随时运行 "启动服务器.bat" 启动服务
    echo.
    pause
)

endlocal