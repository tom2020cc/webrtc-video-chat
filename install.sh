#!/bin/bash

# WebRTC 视频通话系统 - 一键安装脚本 (macOS/Linux)

set -e  # 遇到错误立即退出

# 设置颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    local color=$1
    local message=$2
    echo -e "${color}${message}${NC}"
}

print_header() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  WebRTC 视频通话系统 - 一键安装${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

check_node() {
    print_message "${YELLOW}" "[1/6] 检查 Node.js 安装..."

    if ! command -v node &> /dev/null; then
        print_message "${RED}" "❌ 未检测到 Node.js，请先安装 Node.js"
        print_message "${YELLOW}" "📥 安装方法："
        print_message "${YELLOW}" "  Ubuntu/Debian: sudo apt install nodejs npm"
        print_message "${YELLOW}" "  macOS: brew install node"
        print_message "${YELLOW}" "  或访问: https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node -v)
    NPM_VERSION=$(npm -v)
    print_message "${GREEN}" "✅ Node.js 已安装: $NODE_VERSION"
    print_message "${GREEN}" "✅ npm 版本: $NPM_VERSION\n"
}

check_files() {
    print_message "${YELLOW}" "[2/6] 检查项目文件..."

    if [ ! -f "package.json" ]; then
        print_message "${RED}" "❌ 缺少 package.json 文件"
        exit 1
    fi

    if [ ! -f "server/app.js" ]; then
        print_message "${RED}" "❌ 缺少服务端文件 server/app.js"
        exit 1
    fi

    if [ ! -f "client/index.html" ]; then
        print_message "${RED}" "❌ 缺少客户端文件 client/index.html"
        exit 1
    fi

    print_message "${GREEN}" "✅ 项目文件检查完成\n"
}

create_dirs() {
    print_message "${YELLOW}" "[3/6] 创建数据目录..."

    mkdir -p data
    print_message "${GREEN}" "✅ 数据目录创建完成\n"
}

install_deps() {
    print_message "${YELLOW}" "[4/6] 安装项目依赖..."
    print_message "${YELLOW}" "这可能需要几分钟时间，请耐心等待...\n"

    if npm install --verbose; then
        print_message "${GREEN}" "✅ 依赖安装完成\n"
    else
        print_message "${RED}" "❌ 依赖安装失败！"
        print_message "${YELLOW}" "\n可能的解决方案："
        print_message "${YELLOW}" "1. 检查网络连接"
        print_message "${YELLOW}" "2. 清除 npm 缓存: npm cache clean --force"
        print_message "${YELLOW}" "3. 更换 npm 镜像源:"
        print_message "${YELLOW}" "   npm config set registry https://registry.npmmirror.com"
        print_message "${YELLOW}" "4. 尝试使用 sudo 运行（Linux）"
        exit 1
    fi
}

verify_deps() {
    print_message "${YELLOW}" "[5/6] 验证关键依赖..."

    node -e "try{require('express');console.log('✅ express');}catch{console.log('❌ express');}"
    node -e "try{require('socket.io');console.log('✅ socket.io');}catch{console.log('❌ socket.io');}"
    node -e "try{require('peer');console.log('✅ peer');}catch{console.log('❌ peer');}"
    echo ""
}

create_scripts() {
    print_message "${YELLOW}" "[6/6] 创建快捷启动脚本..."

    # 创建启动脚本
    cat > start.sh << 'EOF'
#!/bin/bash
echo "🚀 正在启动 WebRTC 视频通话系统..."
echo ""
node server/app.js
EOF

    chmod +x start.sh

    print_message "${GREEN}" "✅ 快捷启动脚本已创建: ./start.sh\n"
}

installation_complete() {
    print_header
    print_message "${GREEN}" "✅ 安装完成！"
    echo ""
    print_message "${YELLOW}" "📋 后续步骤:"
    echo ""
    print_message "${BLUE}" "1. 启动服务器:"
    print_message "${YELLOW}" "   - 运行: ./start.sh"
    print_message "${YELLOW}" "   - 或: npm start"
    echo ""
    print_message "${BLUE}" "2. 打开浏览器:"
    print_message "${YELLOW}" "   - 访问: http://localhost:3000"
    print_message "${YELLOW}" "   - 推荐使用 Chrome 或 Edge 浏览器"
    echo ""
    print_message "${BLUE}" "3. 允许浏览器访问:"
    print_message "${YELLOW}" "   - 摄像头权限"
    print_message "${YELLOW}" "   - 麦克风权限"
    echo ""
    print_message "${BLUE}" "4. 详细使用指南请查看:"
    print_message "${YELLOW}" "   - docs/本地测试指南.md"
    print_message "${YELLOW}" "   - README.md"
    echo ""
}

# 主安装流程
print_header

check_node
check_files
create_dirs
install_deps
verify_deps
create_scripts

installation_complete

# 询问是否立即启动
read -p "是否立即启动服务器？(Y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_message "${GREEN}" "🚀 正在启动服务器..."
    echo ""

    # 尝试打开浏览器
    if command -v xdg-open &> /dev/null; then
        xdg-open http://localhost:3000
    elif command -v open &> /dev/null; then
        open http://localhost:3000
    fi

    npm start
else
    print_message "${GREEN}" "👋 安装完成！请随时运行 ./start.sh 启动服务"
    echo ""
fi