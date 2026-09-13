# 🎥 WebRTC 多人音视频通话系统

基于 **Express + Socket.IO + PeerJS** 的多人音视频通话与聊天室系统，支持 **AI 实时字幕翻译** 功能。

## ✨ 核心功能

### 🎬 视频通话
- ✅ 多人音视频通话
- ✅ 屏幕共享
- ✅ 摄像头/麦克风控制
- ✅ 截图功能
- ✅ 举手功能

### 💬 聊天室
- ✅ 实时文字聊天
- ✅ 表情面板
- ✅ 图片分享（服务端中转，1小时内可从历史恢复）
- ✅ 真实文件传输（P2P 分块直传，最大 200MB，实时进度、可保存、可拒绝）
- ✅ 消息回复 / 转发 / 编辑（"已编辑"标记）/ 删除
- ✅ 消息内容 HTML 转义（防 XSS 注入）
- ✅ 聊天记录保存（服务器重启不丢失）

### 🤖 AI 字幕翻译
- ✅ 实时语音识别（浏览器内置，免费）
- ✅ 多语言翻译支持（OpenAI/DeepL/Google/百度）
- ✅ 字幕历史查看和导出
- ✅ 字幕样式自定义
- ✅ 支持SRT/TXT/JSON格式导出

### 🔐 其他功能
- ✅ 房间密码保护
- ✅ 管理员面板（清除房间+强制离开 / 查看管理日志，令牌会话 30 分钟）
- ✅ 昵称修改（全员系统消息播报"旧昵称→新昵称"）
- ✅ 主题切换（深色/浅色）
- ✅ 响应式设计
- ✅ 设备指纹识别
- ✅ 地理位置显示

### 🏗️ 工程化
- ✅ **单端口架构**：页面 + Socket.IO + PeerJS（`/peerjs` 路径）统一走 3000，反代/隧道只需一个端口
- ✅ 服务器端到端冒烟测试：`npm run smoke-test`（10 个场景 14 项断言，零额外依赖）
- ✅ PeerJS 同源自动适配：客户端按页面地址自动推导信令连接，部署后零配置

## 🚀 快速开始

### 📋 系统要求

- **Node.js** >= 14.0.0
- **npm** >= 6.0.0
- **现代浏览器**：Chrome、Edge、Firefox、Safari
- **操作系统**：Windows、macOS、Linux

### 🔧 一键安装

#### Windows 系统
```bash
# 双击运行一键安装脚本
一键安装.bat
```

#### macOS/Linux 系统
```bash
# 运行安装脚本
chmod +x install.sh
./install.sh
```

#### 手动安装
```bash
# 1. 克隆或下载项目
git clone https://github.com/tom2020cc/webrtc-video-chat.git
cd webrtc-video-chat

# 2. 安装依赖
npm install

# 3. 启动服务器
npm start
```

> 🟢 **宝塔面板用户**：请直接看 [docs/宝塔面板部署指南.md](docs/宝塔面板部署指南.md)，含反代 WebSocket、SSL、安全配置的完整步骤。

### 🌐 访问应用

1. **启动服务器后**，访问：`http://localhost:3000`
2. **设置昵称**和偏好
3. **创建或加入房间**
4. **允许浏览器访问**摄像头和麦克风

## 📖 使用指南

### 基础功能

1. **创建房间**：输入房间号，点击"创建房间"
2. **加入房间**：输入房间号和密码（如有）
3. **视频控制**：使用底部控制栏管理摄像头/麦克风
4. **屏幕共享**：点击"共享屏幕"按钮
5. **发送消息**：在聊天室输入文字发送

### AI 字幕功能

1. **启用 AI 功能**：
   - 点击⚙️设置
   - 勾选"启用AI功能"
   - 选择语音识别引擎（推荐"浏览器内置"）

2. **开启字幕**：
   - 点击"📝 字幕"按钮或按T键
   - 开始说话，实时显示字幕

3. **翻译设置**（需要API密钥）：
   - 选择翻译服务
   - 输入API密钥
   - 设置源语言和目标语言

4. **查看历史**：
   - 点击聊天室的📝按钮
   - 搜索、过滤和导出字幕记录

### 高级功能

- **管理员功能**：点击🔐按钮登录（默认密码 `admin123`，**部署前务必在 `server/app.js` 的 `ADMIN_CONFIG` 中修改**；服务器部署还需把访问IP加入 `allowedIPs` 白名单），可清除房间、强制成员离开、查看管理日志
- **主题切换**：点击🌙按钮切换深色/浅色主题
- **WhatsApp分享**：配置并分享WhatsApp联系方式
- **文件传输**：点击"发送文件"选择文件，对方接受后走 P2P 直传（不经过服务器），显示实时进度，完成后点击"💾 保存"落盘；单文件最大 200MB
- **消息操作**：鼠标悬停消息显示操作按钮 —— 回复↩️/转发➦（所有人可用），编辑✏️/删除🗑️（仅自己的消息）；编辑后显示"已编辑"标记，Esc 取消编辑/回复

## 🔑 API 密钥配置

### 免费功能
- **浏览器内置语音识别**：无需API密钥

### 付费翻译服务

#### OpenAI Translation
```javascript
{
  translationApi: 'openai',
  apiKey: 'sk-xxxxxxxxxxxx',
  sourceLang: 'zh-CN',
  targetLang: 'en-US'
}
```

#### DeepL API
```javascript
{
  translationApi: 'deepl',
  apiKey: 'xxxxxxxxxxxxx:fx',
  sourceLang: 'zh-CN',
  targetLang: 'en-US'
}
```

#### 百度翻译
```javascript
{
  translationApi: 'baidu',
  apiKey: 'appId:secretKey',  // 格式：appId:密钥
  sourceLang: 'zh-CN',
  targetLang: 'en-US'
}
```

#### Google Cloud Translation
```javascript
{
  translationApi: 'google',
  apiKey: 'your-google-api-key',
  sourceLang: 'zh-CN',
  targetLang: 'en-US'
}
```

## 🛠️ 开发指南

### 项目结构
```
webrtc-video-chat/
├── client/                 # 前端文件
│   ├── css/               # 样式文件
│   ├── js/                # JavaScript 文件
│   │   ├── i.js          # 主逻辑
│   │   ├── subtitles.js  # 字幕模块
│   │   ├── socket.io.min.js
│   │   └── peerjs.min.js
│   └── index.html         # 主页面
├── server/                # 后端文件
│   └── app.js            # Express 服务器（含 PeerJS 挂载）
├── scripts/               # 工具脚本
│   └── smoke-test.js     # 服务器端到端冒烟测试
├── data/                  # 数据存储目录（运行时 JSON，随聊天自动生成）
├── package.json           # 项目配置
└── README.md             # 项目说明
```

### 可用脚本

```bash
# 启动服务器
npm start

# 开发模式（自动重启）
npm run dev

# 服务器端到端冒烟测试（需先启动服务器）
npm run smoke-test

# 检查 Node.js 版本
npm run check-node

# 清理依赖
npm run clean

# 重新安装依赖
npm run reinstall
```

### 端口说明

服务器为**单端口架构**：页面、Socket.IO 信令、PeerJS 信令（挂载在 `/peerjs` 路径）统一走 **3000 端口**，
无需单独的信令端口。如需修改端口，编辑 `server/app.js` 末尾的 `server.listen(3000, ...)`。

> 实现要点：PeerJS 的 `ExpressPeerServer` 会接管所在 HTTP 服务上的**所有** WebSocket upgrade 事件，
> 与 Socket.IO 冲突。服务端给它挂了一个不监听端口的内部服务器，由主服务器按路径把 `/peerjs` 的
> upgrade 请求转发过去，两条信令通道互不干扰。

## 📚 文档索引

| 文档 | 内容 |
|------|------|
| [宝塔面板部署指南.md](docs/宝塔面板部署指南.md) | 宝塔 + Nginx 多站点共存部署（推荐入门） |
| [真实域名部署指南.md](docs/真实域名部署指南.md) | 通用域名部署、Let's Encrypt 证书、Nginx 配置 |
| [快速开始指南.md](docs/快速开始指南.md) | 最快上手路径 |
| [本地测试指南.md](docs/本地测试指南.md) | 局域网/本机测试方法 |
| [快速域名测试指南.md](docs/快速域名测试指南.md) | 域名快速验证流程 |
| [新功能使用指南-完整版.md](docs/新功能使用指南-完整版.md) | 全部功能的详细使用说明与关键实现点 |
| [免费AI字幕使用指南.md](docs/免费AI字幕使用指南.md) / [AI字幕功能测试指南.md](docs/AI字幕功能测试指南.md) | AI 字幕的配置与测试 |
| [图片功能使用指南.md](docs/图片功能使用指南.md) | 图片消息功能 |
| [故障排除指南.md](docs/故障排除指南.md) | 常见问题排查 |
| [设备指纹识别技术文档.md](docs/设备指纹识别技术文档.md) | 设备指纹实现原理 |
| [项目部署总结.md](docs/项目部署总结.md) | 部署要点汇总 |

## 🔧 故障排除

### 常见问题

**Q: 摄像头/麦克风无法访问？**
A: 检查浏览器权限设置，确保已允许访问

**Q: 字幕功能不工作？**
A: 
1. 确保使用Chrome或Edge浏览器
2. 检查是否启用了AI功能
3. 验证API密钥是否正确

**Q: 服务器启动失败？**
A: 
1. 检查端口3000是否被占用
2. 确认Node.js版本是否符合要求
3. 尝试重新安装依赖：`npm run reinstall`

**Q: 依赖安装失败？**
A: 
1. 检查网络连接
2. 尝试清除npm缓存：`npm cache clean --force`
3. 更换npm镜像源：`npm config set registry https://registry.npmmirror.com`

### 调试技巧

- **浏览器控制台**：按F12查看前端日志
- **服务器日志**：查看命令行输出
- **网络检查**：使用浏览器开发者工具的网络标签

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系方式

如有问题，请通过以下方式联系：
- 提交 GitHub Issue
- 发送邮件至：your.email@example.com

---

**🎉 现在就开始体验多人视频通话和AI实时字幕功能吧！**