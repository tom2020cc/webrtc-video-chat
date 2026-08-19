# 多人音视频通话（WebRTC + Socket.IO）

基于 **Express + Socket.IO + PeerJS** 的多人音视频通话应用，支持聊天室、屏幕共享、静音/关摄像头、昵称、成员列表，以及生产/本地环境一键切换。

## 功能

- 🎥 多人音视频通话（WebRTC / PeerJS）
- 💬 聊天室
- 🖥️ 屏幕共享
- 🎙️ 静音 / 关摄像头
- 😀 昵称系统 + 在线成员列表
- ⚙️ 生产 / 本地环境配置面板（页面内切换，无需改代码）

## 技术栈

- 后端：Node.js + Express（端口 3000）+ Socket.IO（信令）
- WebRTC 信令：PeerJS Server（端口 9000）
- 前端：原生 HTML / CSS / JS

## 运行

```bash
pnpm install    # 或 npm install
node app.js     # 或 npm start
```

- 前端页面：http://localhost:3000
- 默认「本地测试」环境；生产环境请在页面右上角 ⚙️ 设置中切换

## 使用

1. 打开两个浏览器标签页访问 http://localhost:3000
2. 各自设置昵称，一个「创建房间」，另一个「进入房间」
3. 即可看到对方视频，并可使用聊天、屏幕共享等功能

## 说明

当前为 P2P 网状（mesh）架构，人数较多时可能因上行带宽受限而卡顿。如需支持更多人，可迁移到 SFU 媒体服务器（如 mediasoup / LiveKit）。
