# 多人音视频通话（WebRTC + Socket.IO）

基于 **Express + Socket.IO + PeerJS** 的多人音视频通话应用，支持聊天室、屏幕共享、静音/关摄像头、昵称、成员列表、房间密码、举手、说话高亮，以及生产/本地环境一键切换。

## 功能

- 🎥 多人音视频通话（WebRTC / PeerJS）
- 💬 聊天室（带昵称 + 时间戳 + 😊 表情面板）
- 🖥️ 屏幕共享
- 🎙️ 静音 / 关摄像头
- 😀 昵称系统 + 在线成员列表
- ✋ 举手 + 🔊 活跃说话者高亮
- 🔐 房间密码
- ⏱ 通话时长计时器 + 📸 截图 + 🔗 复制房号
- ☀️/🌙 亮暗主题切换 + 🔔 提示音
- ⌨️ 键盘快捷键：`M` 静音 · `V` 摄像头 · `S` 屏幕共享 · `R` 举手
- ⚙️ 页面内设置面板（环境预设、是否需要密码、自动开摄像头/麦克风等）

## 目录结构

```
.
├── server/
│   └── app.js            # 服务端：Express + Socket.IO + PeerJS
├── client/
│   ├── index.html
│   ├── css/i.css
│   └── js/i.js           # 前端逻辑（socket.io.min.js / peerjs.min.js 同目录）
├── install.bat           # 一键安装依赖
├── start.bat             # 一键启动
├── stop.bat              # 一键关闭
├── package.json
└── README.md
```

## 技术栈

- 后端：Node.js + Express（端口 3000）+ Socket.IO（信令）
- WebRTC 信令：PeerJS Server（端口 9000）
- 前端：原生 HTML / CSS / JS

## 一键脚本（Windows）

| 脚本 | 作用 |
| --- | --- |
| `install.bat` | 双击安装依赖（优先 pnpm，否则 npm） |
| `start.bat` | 双击启动服务器（端口 3000） |
| `stop.bat` | 双击关闭服务器（停止占用 3000 端口的进程） |

## 手动运行

```bash
pnpm install        # 或 npm install
npm start           # 即 node server/app.js
```

- 前端页面：http://localhost:3000
- 默认「本地测试」环境；生产环境请在页面右上角 ⚙️ 设置中切换

## 使用

1. 双击 `start.bat`（或 `npm start`），打开浏览器访问 http://localhost:3000
2. 右上角 ⚙️ 设置昵称、环境、是否需要密码等，保存
3. 开两个标签页：一个「创建房间」，另一个「进入房间」
4. 即可看到对方视频，并使用聊天、屏幕共享、举手、截图等功能

## 说明

当前为 P2P 网状（mesh）架构，人数较多时可能因上行带宽受限而卡顿。如需支持更多人，可迁移到 SFU 媒体服务器（如 mediasoup / LiveKit）。
