const path = require("path");
const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { ExpressPeerServer } = require("peer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const crypto = require("crypto");
const {createTranslator, attachTranslation} = require('./translation');
const translator = createTranslator();
const {attachRooms} = require('./rooms');
const {loadRooms,saveRooms}=require('./room-store');

// 管理员配置
const ADMIN_CONFIG = {
  password: process.env.ADMIN_PASSWORD || "admin123",
  allowedIPs: (process.env.ADMIN_ALLOWED_IPS || "127.0.0.1,::1,localhost").split(",").map(ip => ip.trim()),
  secretKey: process.env.ADMIN_SECRET || crypto.randomBytes(32).toString("hex"),
  sessionDuration: 30 * 60 * 1000, // 会话时长：30分钟
  features: ["clear-room", "delete-message", "view-logs", "view-devices"] // 可用功能
};

if (process.env.NODE_ENV === "production" && !process.env.ADMIN_PASSWORD) {
  throw new Error("Production requires ADMIN_PASSWORD");
}

// 本地IP集合（用于免外部查询/管理员校验）
const LOCAL_IPS = new Set(["127.0.0.1", "::1", "localhost", "unknown"]);

// 规范化IP：x-forwarded-for 可能是逗号分隔列表；IPv4映射地址去掉 ::ffff: 前缀
function normalizeIp(rawIp) {
  if (!rawIp) return "unknown";
  let ip = String(rawIp).split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.substring(7);
  return ip || "unknown";
}

// 管理员密码验证（密码 + IP 白名单）
function authenticateAdmin(password, ip) {
  const normalizedIp = normalizeIp(ip);
  if (!ADMIN_CONFIG.allowedIPs.includes(normalizedIp) && !ADMIN_CONFIG.allowedIPs.includes(ip)) {
    return { success: false, message: "当前IP不在管理员白名单内" };
  }
  if (String(password) !== ADMIN_CONFIG.password) {
    return { success: false, message: "管理员密码错误" };
  }
  return { success: true, message: "管理员登录成功" };
}

// 生成管理员会话令牌
function generateAdminToken() {
  return crypto.createHmac("sha256", ADMIN_CONFIG.secretKey)
    .update(uuidv4() + "|" + Date.now() + "|" + Math.random())
    .digest("hex");
}

// 验证管理员令牌（存在且未过期，过期自动清除）
function verifyAdminToken(token) {
  if (!token || !adminTokens.has(token)) return false;
  const session = adminTokens.get(token);
  if (Date.now() > session.expires) {
    adminTokens.delete(token);
    return false;
  }
  return true;
}

const app = express();
app.use(cors()); // 配置 CORS，允许来自任意源的请求
app.use(express.json()); // 支持JSON解析
app.use(express.static(path.join(__dirname, "..", "client")));
app.get("/", (req, res) => { res.sendFile(path.join(__dirname, "..", "client", "index.html")); });
app.get("/hi", (req, res) => { res.send("<h1>Hello Dear</h1>"); });

const server = http.createServer(app);
// maxHttpBufferSize 提升到 5MB，以支持最大 1MB 的图片 base64 消息（base64 约有 4/3 膨胀）
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] }, pingInterval:5000, pingTimeout:10000, maxHttpBufferSize: 5 * 1024 * 1024 }); // 失联通常在15秒内清理
// 单端口模式：PeerJS 信令挂载到同一 HTTP 服务的 /peerjs 路径（与页面同源，反代/隧道只需一个端口）
// 注意：ExpressPeerServer 会接管其收到 server 上的所有 upgrade 事件，与 Socket.IO 的
// WebSocket 冲突，因此给它挂一个不监听端口的内部服务器，由主服务器把 /peerjs 的
// upgrade 请求转发过去，两者互不干扰。
const peerInnerServer = http.createServer();
const peerServer = ExpressPeerServer(peerInnerServer, { debug: false });
app.use("/peerjs", peerServer); // 客户端路径 = /peerjs + 内置 peerjs 前缀 = /peerjs/peerjs/...

server.on("upgrade", (req, socket, head) => {
  const pathname = (req.url || "").split("?")[0];
  if (pathname === "/peerjs" || pathname.startsWith("/peerjs/")) {
    peerInnerServer.emit("upgrade", req, socket, head);
  }
});

peerServer.on("error", (err) => console.error("PeerJS 服务错误：", err));

// 数据存储
let rooms = Object.create(null); // 房间信息：roomId -> { users: [{socketId, peerId, nickname}], password }
let chatHistory = {}; // 聊天记录：roomId -> [{from, text, time, isSystem, messageType}]
let userProfiles = new Map(); // 用户配置：deviceId -> {nickname, preferences}
let userSocialLinks = new Map(); // 用户社交链接：deviceId -> {whatsapp, telegram, etc}
let roomMetadata = {}; // 房间元数据：roomId -> {createdAt, createdBy, messageCount, lastActivity}
let adminTokens = new Map(); // 管理员会话令牌：token -> {ip, socketId, createdAt, expires, nickname}
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const CHAT_HISTORY_FILE = path.join(DATA_DIR, "chat-history.json");
const USER_PROFILES_FILE = path.join(DATA_DIR, "user-profiles.json");
const USER_SOCIAL_FILE = path.join(DATA_DIR, "user-social.json");
const ROOM_METADATA_FILE = path.join(DATA_DIR, "room-metadata.json");
const ADMIN_LOGS_FILE = path.join(DATA_DIR, "admin-logs.json");
const ROOM_REGISTRY_FILE=path.join(DATA_DIR,'rooms.json');
let adminLogs = []; // 管理员操作日志
const imageStore = new Map(); // 图片内存暂存：messageId -> {roomId, imageData, ...}，不持久化

// 清理图片暂存：最多保留50张、且只保留1小时内的图片
function trimImageStore() {
  const ONE_HOUR = 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, img] of imageStore) {
    if (now - img.time > ONE_HOUR) imageStore.delete(id);
  }
  if (imageStore.size > 50) {
    const excess = imageStore.size - 50;
    const oldestIds = [...imageStore.keys()].slice(0, excess);
    oldestIds.forEach((id) => imageStore.delete(id));
  }
}

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}

// 加载持久化数据
function loadPersistedData() {
  try {
    if (fs.existsSync(CHAT_HISTORY_FILE)) {
      chatHistory = JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, "utf8"));
    }
    if (fs.existsSync(USER_PROFILES_FILE)) {
      const profiles = JSON.parse(fs.readFileSync(USER_PROFILES_FILE, "utf8"));
      userProfiles = new Map(Object.entries(profiles));
    }
    if (fs.existsSync(USER_SOCIAL_FILE)) {
      const social = JSON.parse(fs.readFileSync(USER_SOCIAL_FILE, "utf8"));
      userSocialLinks = new Map(Object.entries(social));
    }
    if (fs.existsSync(ROOM_METADATA_FILE)) {
      roomMetadata = JSON.parse(fs.readFileSync(ROOM_METADATA_FILE, "utf8"));
    }
    if (fs.existsSync(ADMIN_LOGS_FILE)) {
      adminLogs = JSON.parse(fs.readFileSync(ADMIN_LOGS_FILE, "utf8"));
    }
  } catch (e) {
    console.error("加载数据失败：", e);
  }
}

// 保存聊天历史
function saveChatHistory() {
  try {
    fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(chatHistory, null, 2));
  } catch (e) { console.error("保存聊天历史失败：", e); }
}

// 保存用户配置
function saveUserProfiles() {
  try {
    const obj = Object.fromEntries(userProfiles);
    fs.writeFileSync(USER_PROFILES_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error("保存用户配置失败：", e); }
}

// 保存用户社交链接
function saveUserSocialLinks() {
  try {
    const obj = Object.fromEntries(userSocialLinks);
    fs.writeFileSync(USER_SOCIAL_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error("保存用户社交链接失败：", e); }
}

// 保存房间元数据
function saveRoomMetadata() {
  try {
    fs.writeFileSync(ROOM_METADATA_FILE, JSON.stringify(roomMetadata, null, 2));
  } catch (e) { console.error("保存房间元数据失败：", e); }
}

// 记录管理员操作
function logAdminAction(action, details, adminInfo) {
  const logEntry = {
    timestamp: Date.now(),
    action,
    details,
    admin: adminInfo || "unknown",
    id: uuidv4().substring(0, 8)
  };
  adminLogs.push(logEntry);

  // 只保留最近1000条日志
  if (adminLogs.length > 1000) {
    adminLogs = adminLogs.slice(-1000);
  }

  try {
    fs.writeFileSync(ADMIN_LOGS_FILE, JSON.stringify(adminLogs, null, 2));
  } catch (e) { console.error("保存管理员日志失败：", e); }

  console.log(`管理员操作：${action} - ${details}`);
}

// 生成设备指纹 - 多层次识别策略
function generateDeviceFingerprint(info) {
  // 第一层：基于浏览器特征的指纹
  const browserData = [
    info.userAgent,
    info.platform,
    info.language,
    info.screenResolution,
    info.colorDepth,
    info.timezone,
    info.canvasFingerprint,
    info.webglFingerprint
  ].join("|");

  // 第二层：基于网络环境的指纹
  const networkData = [
    info.ip,
    info.browserId
  ].join("|");

  // 生成复合指纹
  const browserHash = crypto.createHash("sha256").update(browserData).digest("hex").substring(0, 8);
  const networkHash = crypto.createHash("sha256").update(networkData).digest("hex").substring(0, 8);

  // 组合生成最终指纹：浏览器特征(8位) + 网络特征(8位)
  return `${browserHash}${networkHash}`;
}

// 生成浏览器唯一ID（基于Canvas和WebGL指纹）
function generateBrowserId(info) {
  // 如果客户端提供了浏览器ID，直接使用
  if (info.browserId) return info.browserId;

  // 否则基于特征生成
  const data = [
    info.userAgent,
    info.platform,
    info.language,
    info.screenResolution,
    info.colorDepth,
    info.timezone,
    info.hardwareConcurrency,
    info.deviceMemory
  ].join("|");

  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

// 启动时加载数据
loadPersistedData();
rooms=loadRooms(ROOM_REGISTRY_FILE);

// IP地理位置缓存
const ipGeoCache = new Map();
const IP_GEO_CACHE_FILE = path.join(DATA_DIR, "ip-geo-cache.json");

// 加载IP地理位置缓存
function loadIpGeoCache() {
  try {
    if (fs.existsSync(IP_GEO_CACHE_FILE)) {
      const cache = JSON.parse(fs.readFileSync(IP_GEO_CACHE_FILE, "utf8"));
      for (const [ip, data] of Object.entries(cache)) {
        // 只缓存7天内的数据
        if (Date.now() - data.timestamp < 7 * 24 * 60 * 60 * 1000) {
          ipGeoCache.set(ip, data);
        }
      }
    }
  } catch (e) {
    console.error("加载IP地理位置缓存失败：", e);
  }
}

// 保存IP地理位置缓存
function saveIpGeoCache() {
  try {
    const obj = Object.fromEntries(ipGeoCache);
    fs.writeFileSync(IP_GEO_CACHE_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.error("保存IP地理位置缓存失败：", e);
  }
}

// 获取IP地理位置信息
function getIpLocation(ip) {
  return new Promise((resolve, reject) => {
    // 检查缓存
    if (ipGeoCache.has(ip)) {
      const cached = ipGeoCache.get(ip);
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) { // 24小时有效
        resolve(cached.data);
        return;
      }
    }

    // 本地IP直接返回
    if (LOCAL_IPS.has(ip)) {
      const localData = {
        country: "本地",
        countryEmoji: "🏠",
        region: "本地网络",
        city: "localhost",
        isp: "本地连接",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      };
      resolve(localData);
      return;
    }

    // 使用免费的IP地理位置API
    const url = `http://ip-api.com/json/${ip}?lang=zh-CN`;

    http.get(url, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const geoData = JSON.parse(data);
          if (geoData.status === "success") {
            const locationData = {
              country: geoData.country || "未知",
              countryEmoji: getCountryEmoji(geoData.countryCode),
              region: geoData.regionName || "未知",
              city: geoData.city || "未知",
              isp: geoData.isp || "未知",
              timezone: geoData.timezone || "未知",
              lat: geoData.lat,
              lon: geoData.lon
            };

            // 缓存结果
            ipGeoCache.set(ip, {
              data: locationData,
              timestamp: Date.now()
            });
            saveIpGeoCache();

            resolve(locationData);
          } else {
            resolve({
              country: "未知",
              countryEmoji: "❓",
              region: "未知",
              city: "未知",
              isp: "未知",
              timezone: "未知"
            });
          }
        } catch (e) {
          console.error("解析IP地理位置数据失败：", e);
          reject(e);
        }
      });
    }).on("error", (err) => {
      console.error("获取IP地理位置失败：", err);
      resolve({
        country: "未知",
        countryEmoji: "❓",
        region: "网络错误",
        city: "查询失败",
        isp: "未知",
        timezone: "未知"
      });
    });
  });
}

// 国家代码转表情符号
function getCountryEmoji(countryCode) {
  if (!countryCode || countryCode.length !== 2) return "🌍";

  const emojiMap = {
    "CN": "🇨🇳", "US": "🇺🇸", "JP": "🇯🇵", "KR": "🇰🇷", "GB": "🇬🇧",
    "DE": "🇩🇪", "FR": "🇫🇷", "RU": "🇷🇺", "BR": "🇧🇷", "IN": "🇮🇳",
    "CA": "🇨🇦", "AU": "🇦🇺", "IT": "🇮🇹", "ES": "🇪🇸", "MX": "🇲🇽",
    "ID": "🇮🇩", "NL": "🇳🇱", "SA": "🇸🇦", "TR": "🇹🇷", "TW": "🇹🇼",
    "HK": "🇭🇰", "SG": "🇸🇬", "MY": "🇲🇾", "TH": "🇹🇭", "VN": "🇻🇳",
    "PH": "🇵🇭", "PK": "🇵🇰", "BD": "🇧🇩", "IR": "🇮🇷", "EG": "🇪🇬"
  };

  return emojiMap[countryCode] || "🌍";
}

// 加载IP地理位置缓存
loadIpGeoCache();

// 房间列表（携带是否有密码，供前端显示 🔒）
function roomListPayload() {
  return Object.entries(rooms).map(([id, r]) => ({ id, hasPassword: !!r.password, count:r.users.length, capacity:2 }));
}
function broadcastRoomList() { io.emit("roomList", roomListPayload()); }
function broadcastRoomUpdate(roomId) {
  if(rooms[roomId]){
    io.to(roomId).emit('roomState',{roomId,users:rooms[roomId].users,capacity:2});
    io.to(roomId).emit('roomUpdate',rooms[roomId].users); // 兼容尚未刷新的客户端
  }
}
function systemMessage(roomId, text) { io.to(roomId).emit("systemMessage", { text, time: Date.now() }); }

io.on("connection", async (socket) => {
  attachTranslation(socket, {translator, isMember: roomId => Boolean(rooms[roomId] && socket.rooms.has(roomId))});
  // 获取客户端信息
  const clientInfo = socket.handshake.auth || {};
  const peerId = uuidv4();
  attachRooms(socket,{rooms,io,identity:()=>({peerId,nickname:socket.data.nickname||clientInfo.nickname||'匿名用户'}),broadcastList:broadcastRoomList,broadcastUpdate:broadcastRoomUpdate,systemMessage,history:id=>chatHistory[id],persist:()=>saveRooms(ROOM_REGISTRY_FILE,rooms)});

  // 获取真实IP地址（考虑代理；取 x-forwarded-for 首个IP并去掉 ::ffff: 前缀）
  const clientIp = normalizeIp(
    socket.handshake.headers["x-forwarded-for"] ||
    socket.handshake.headers["x-real-ip"] ||
    socket.handshake.address
  );

  // 管理员相关变量
  let isAdmin = false;
  let adminToken = null;
  let adminSession = null;

  // 获取IP地理位置信息
  let locationInfo = {};
  try {
    locationInfo = await getIpLocation(clientIp);
    console.log(`用户IP地理位置：${clientIp} -> ${locationInfo.countryEmoji} ${locationInfo.country} ${locationInfo.city}`);
  } catch (e) {
    console.error("获取IP地理位置失败：", e);
    locationInfo = { country: "未知", countryEmoji: "❓", city: "未知" };
  }

  // 生成设备指纹
  const deviceFingerprint = generateDeviceFingerprint({
    ip: clientIp,
    userAgent: clientInfo.userAgent || "unknown",
    platform: clientInfo.platform || "unknown",
    language: clientInfo.language || "unknown",
    screenResolution: clientInfo.screenResolution || "unknown",
    colorDepth: clientInfo.colorDepth || "unknown",
    timezone: clientInfo.timezone || "unknown",
    canvasFingerprint: clientInfo.canvasFingerprint || "unknown",
    webglFingerprint: clientInfo.webglFingerprint || "unknown",
    browserId: clientInfo.browserId || "unknown"
  });

  // 查找匹配的用户配置（支持模糊匹配）
  let nickname = clientInfo.nickname || "匿名用户";
  let matchedProfile = null;
  let matchedFingerprint = null;

  // 精确匹配
  if (userProfiles.has(deviceFingerprint)) {
    matchedProfile = userProfiles.get(deviceFingerprint);
    matchedFingerprint = deviceFingerprint;
    console.log(`精确匹配到老用户：${deviceFingerprint}，昵称：${matchedProfile.nickname}`);
  } else {
    // 模糊匹配：当IP变化时，通过浏览器ID匹配
    for (const [fp, profile] of userProfiles) {
      if (profile.browserId === clientInfo.browserId) {
        matchedProfile = profile;
        matchedFingerprint = fp;
        console.log(`通过浏览器ID模糊匹配到用户：${fp} -> ${deviceFingerprint}`);
        break;
      }
    }
  }

  if (matchedProfile) {
    nickname = matchedProfile.nickname || nickname;
    // 如果指纹变化了，更新配置
    if (matchedFingerprint !== deviceFingerprint) {
      userProfiles.delete(matchedFingerprint);
      userProfiles.set(deviceFingerprint, {
        ...matchedProfile,
        browserId: clientInfo.browserId,
        lastSeen: Date.now(),
        fingerprintHistory: matchedProfile.fingerprintHistory || []
      });

      // 记录指纹历史
      const profile = userProfiles.get(deviceFingerprint);
      profile.fingerprintHistory.push({
        old: matchedFingerprint,
        new: deviceFingerprint,
        timestamp: Date.now(),
        reason: 'IP或其他特征变化'
      });
      saveUserProfiles();
      console.log(`用户指纹已更新：${matchedFingerprint} -> ${deviceFingerprint}`);
    }
  } else {
    // 保存新用户配置
    userProfiles.set(deviceFingerprint, {
      nickname,
      browserId: clientInfo.browserId,
      preferences: {},
      createdAt: Date.now(),
      lastSeen: Date.now(),
      fingerprintHistory: []
    });
    saveUserProfiles();
    console.log(`新用户注册：${deviceFingerprint}，昵称：${nickname}`);
  }

  socket.data.nickname = nickname;
  if(!socket.connected)return;
  for(const [id,room] of Object.entries(rooms)){
    const member=room.users.find(u=>u.socketId===socket.id);
    if(member){member.nickname=nickname;broadcastRoomUpdate(id);}
  }
  socket.data.deviceFingerprint = deviceFingerprint;
  console.log(`用户连接：${socket.id}，PeerID=${peerId}，昵称=${nickname}，设备ID=${deviceFingerprint}`);

  socket.emit("peerId", peerId);
  socket.emit("roomList", roomListPayload());
  socket.emit("userInfo", { nickname, deviceFingerprint });

  // 管理员登录
  socket.on("admin-login", ({ password }) => {
    const result = authenticateAdmin(password, clientIp);

    if (result.success) {
      adminToken = generateAdminToken();
      adminTokens.set(adminToken, {
        ip: clientIp,
        socketId: socket.id,
        createdAt: Date.now(),
        expires: Date.now() + ADMIN_CONFIG.sessionDuration,
        nickname: `管理员-${socket.id.substring(0, 8)}`
      });

      isAdmin = true;
      adminSession = adminTokens.get(adminToken);
      logAdminAction("LOGIN", "管理员登录成功", { ip: clientIp, socketId: socket.id, token: adminToken.substring(0, 16) + '...' });

      socket.emit("admin-login-success", {
        token: adminToken,
        message: result.message,
        sessionInfo: {
          duration: ADMIN_CONFIG.sessionDuration,
          expiresAt: adminSession.expires,
          features: ADMIN_CONFIG.features
        }
      });
    } else {
      logAdminAction("LOGIN_FAILED", `管理员登录失败: ${result.message}`, { ip: clientIp, socketId: socket.id });
      socket.emit("admin-login-failed", { message: result.message });
    }
  });

  // 验证管理员会话
  socket.on("verify-admin", ({ token }) => {
    const valid = verifyAdminToken(token);
    if (valid && adminTokens.has(token)) {
      adminSession = adminTokens.get(token);
      isAdmin = true;
      adminToken = token;
    }
    socket.emit("admin-verify-result", { valid, isAdmin });
  });

  // 管理员操作：清除房间
  socket.on("admin-clear-room", ({ roomId, token, reason }) => {
    if (!isAdmin || !verifyAdminToken(token) || adminTokens.get(token)?.socketId!==socket.id) {
      socket.emit("admin-operation-failed", { message: "管理员权限验证失败" });
      return;
    }

    if (rooms[roomId]) {
      const roomName = roomId;
      const participantCount = rooms[roomId].users.length;

      // 保存操作前的房间信息
      const roomInfo = {
        id: roomId,
        name: roomName,
        participantCount,
        messageCount: chatHistory[roomId]?.length || 0,
        createdBy: roomMetadata[roomId]?.createdBy || 'unknown',
        createdAt: roomMetadata[roomId]?.createdAt || Date.now()
      };

      // 先保存删除后的目录；磁盘失败时不删除在线房间。
      const remaining=Object.assign(Object.create(null),rooms);delete remaining[roomId];
      try{saveRooms(ROOM_REGISTRY_FILE,remaining);}catch{socket.emit('admin-operation-failed',{message:'房间目录保存失败，删除未执行'});return;}
      // 清除房间数据
      delete rooms[roomId];
      delete chatHistory[roomId];
      delete roomMetadata[roomId];

      saveChatHistory();
      saveRoomMetadata();

      // 通知所有房间成员
      io.to(roomId).emit("room-cleared-by-admin", {
        reason: reason || '管理员操作',
        timestamp: Date.now()
      });

      // 强制所有成员离开房间
      io.to(roomId).emit("force-leave-room");
      io.in(roomId).socketsLeave(roomId);

      logAdminAction("CLEAR_ROOM", `清除房间: ${roomName}`, {
        roomId,
        roomInfo,
        reason,
        admin: adminSession?.nickname || 'unknown'
      });

      socket.emit("admin-operation-success", {
        operation: "clear-room",
        roomId,
        message: `房间 ${roomName} 已清除`,
        roomInfo
      });

      broadcastRoomList();
    } else {
      socket.emit("admin-operation-failed", { message: "房间不存在" });
    }
  });

  // 获取管理员日志
  socket.on("admin-get-logs", ({ token, limit }) => {
    if (!isAdmin || !verifyAdminToken(token)) {
      socket.emit("admin-operation-failed", { message: "管理员权限验证失败" });
      return;
    }

    const logs = adminLogs.slice(-limit || -50).reverse();
    socket.emit("admin-logs-response", { logs });
  });

  // 聊天消息：服务端转发到房间内所有人并保存历史
  socket.on("chatMessage", ({ roomId, text, replyTo, forwardFrom }) => {
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      const message = {
        id: Date.now() + Math.random(),
        from: socket.data.nickname,
        deviceFingerprint,
        text,
        time: Date.now(),
        type: 'text'
      };

      // 处理回复消息
      if (replyTo) {
        message.replyTo = {
          id: replyTo.id,
          from: replyTo.from,
          text: replyTo.text?.substring(0, 50) + (replyTo.text?.length > 50 ? '...' : ''),
          time: replyTo.time
        };
      }

      // 处理转发消息
      if (forwardFrom) {
        message.forwardFrom = {
          originalRoom: forwardFrom.roomId,
          originalFrom: forwardFrom.from,
          originalText: forwardFrom.text?.substring(0, 50) + (forwardFrom.text?.length > 50 ? '...' : ''),
          originalTime: forwardFrom.time
        };
        message.type = 'forward';
      }

      // 保存聊天历史
      if (!chatHistory[roomId]) {
        chatHistory[roomId] = [];
      }
      chatHistory[roomId].push(message);

      // 保持最近100条消息
      if (chatHistory[roomId].length > 100) {
        chatHistory[roomId] = chatHistory[roomId].slice(-100);
      }
      saveChatHistory();

      // 转发消息
      io.to(roomId).emit("chatMessage", message);
    }
  });

  // 字幕消息：AI实时翻译的字幕内容
  let lastSubtitle = {text:'', at:0};
  socket.on("subtitleMessage", (payload = {}) => {
    if (!payload || typeof payload !== 'object') return;
    const {roomId, originalText, translatedText, sourceLang, targetLang} = payload;
    if(typeof originalText !== 'string' || !originalText.trim() || originalText.length > 1200 || (translatedText && (typeof translatedText !== 'string' || translatedText.length>6000))) return;
    if(lastSubtitle.text===originalText && Date.now()-lastSubtitle.at<2000) return;
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      lastSubtitle={text:originalText,at:Date.now()};
      const subtitleMessage = {
        roomId,
        senderId:socket.id,
        id: Date.now() + Math.random(),
        from: socket.data.nickname || '匿名用户',
        deviceFingerprint,
        originalText: originalText,
        translatedText: translatedText || '',
        sourceLang: sourceLang || 'auto',
        targetLang: targetLang || 'en-US',
        speaker: socket.data.nickname || '匿名用户',
        time: Date.now(),
        type: 'subtitle'
      };

      // 保存字幕到聊天历史
      if (!chatHistory[roomId]) {
        chatHistory[roomId] = [];
      }
      chatHistory[roomId].push(subtitleMessage);

      // 保持最近100条消息（包括字幕）
      if (chatHistory[roomId].length > 100) {
        chatHistory[roomId] = chatHistory[roomId].slice(-100);
      }
      saveChatHistory();

      // 广播字幕消息到房间内所有人
      io.to(roomId).emit("chatMessage", subtitleMessage);

    }
  });

  // 删除消息（仅限发送者或管理员）
  socket.on("deleteMessage", ({ roomId, messageId, adminToken }) => {
    if (!rooms[roomId] || !socket.rooms.has(roomId)) {
      socket.emit("delete-message-failed", { message: "房间访问权限不足" });
      return;
    }

    const roomHistory = chatHistory[roomId];
    if (!roomHistory) {
      socket.emit("delete-message-failed", { message: "聊天记录不存在" });
      return;
    }

    // 查找目标消息
    const messageIndex = roomHistory.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) {
      socket.emit("delete-message-failed", { message: "消息不存在" });
      return;
    }

    const targetMessage = roomHistory[messageIndex];
    const isMessageSender = targetMessage.deviceFingerprint === deviceFingerprint;
    const isAdminAction = adminToken && verifyAdminToken(adminToken);

    // 只有发送者或管理员可以删除消息
    if (!isMessageSender && !isAdminAction) {
      socket.emit("delete-message-failed", { message: "无权删除此消息" });
      return;
    }

    // 删除消息
    roomHistory.splice(messageIndex, 1);
    saveChatHistory();

    // 通知房间内所有人
    io.to(roomId).emit("message-deleted", { messageId, deletedBy: isAdminAction ? 'admin' : socket.data.nickname });

    if (isAdminAction) {
      logAdminAction("DELETE_MESSAGE", `删除消息在房间 ${roomId}`, {
        messageId,
        originalFrom: targetMessage.from,
        room: roomId
      });
    }

    socket.emit("delete-message-success", { message: "消息已删除", messageId });
  });

  // 编辑消息（仅限发送者）
  socket.on("editMessage", ({ roomId, messageId, newText }) => {
    if (!rooms[roomId] || !socket.rooms.has(roomId)) {
      socket.emit("edit-message-failed", { message: "房间访问权限不足" });
      return;
    }

    const roomHistory = chatHistory[roomId];
    if (!roomHistory) {
      socket.emit("edit-message-failed", { message: "聊天记录不存在" });
      return;
    }

    const message = roomHistory.find(msg => msg.id === messageId);
    if (!message) {
      socket.emit("edit-message-failed", { message: "消息不存在" });
      return;
    }

    // 只有发送者可以编辑自己的消息
    if (message.deviceFingerprint !== deviceFingerprint) {
      socket.emit("edit-message-failed", { message: "无权编辑此消息" });
      return;
    }

    // 更新消息内容
    const originalText = message.text;
    message.text = newText;
    message.edited = true;
    message.editTime = Date.now();

    saveChatHistory();

    // 通知房间内所有人
    io.to(roomId).emit("message-edited", { messageId, newText, editTime: message.editTime });

    socket.emit("edit-message-success", { message: "消息已编辑", messageId });
  });

  // 转发消息到另一个房间（需在源房间内；目标房间存在即可，带密码的房间需是成员）
  socket.on("forwardMessage", ({ sourceRoomId, messageId, targetRoomId }) => {
    if (!rooms[sourceRoomId] || !rooms[targetRoomId]) {
      socket.emit("forward-message-failed", { message: "房间不存在" });
      return;
    }

    if (!socket.rooms.has(sourceRoomId)) {
      socket.emit("forward-message-failed", { message: "需要是源房间的成员" });
      return;
    }

    // 带密码的房间：非成员不允许向其转发内容
    if (rooms[targetRoomId].password && !socket.rooms.has(targetRoomId)) {
      socket.emit("forward-message-failed", { message: "目标房间受密码保护" });
      return;
    }

    const sourceHistory = chatHistory[sourceRoomId];
    if (!sourceHistory) {
      socket.emit("forward-message-failed", { message: "源聊天记录不存在" });
      return;
    }

    const originalMessage = sourceHistory.find(msg => msg.id === messageId);
    if (!originalMessage) {
      socket.emit("forward-message-failed", { message: "源消息不存在" });
      return;
    }

    // 创建转发消息
    const forwardMessage = {
      id: Date.now() + Math.random(),
      from: socket.data.nickname,
      deviceFingerprint,
      text: originalMessage.text,
      time: Date.now(),
      type: 'forward',
      forwardFrom: {
        originalRoom: sourceRoomId,
        originalFrom: originalMessage.from,
        originalText: originalMessage.text,
        originalTime: originalMessage.time
      }
    };

    // 保存到目标房间
    if (!chatHistory[targetRoomId]) {
      chatHistory[targetRoomId] = [];
    }
    chatHistory[targetRoomId].push(forwardMessage);
    saveChatHistory();

    // 通知目标房间
    io.to(targetRoomId).emit("chatMessage", forwardMessage);

    socket.emit("forward-message-success", {
      message: "消息已转发",
      messageId: forwardMessage.id,
      targetRoom: targetRoomId
    });
  });

  // 获取聊天历史
  socket.on("getChatHistory", ({ roomId }) => {
    if (chatHistory[roomId]) {
      socket.emit("chatHistory", { roomId, messages: chatHistory[roomId] });
    } else {
      socket.emit("chatHistory", { roomId, messages: [] });
    }
  });

  // WhatsApp社交链接管理
  socket.on("update-social-links", ({ platform, contactInfo }) => {
    if (!deviceFingerprint) return;

    const currentLinks = userSocialLinks.get(deviceFingerprint) || {};

    if (platform === 'whatsapp') {
      currentLinks.whatsapp = {
        number: contactInfo.number || '',
        displayName: contactInfo.displayName || '',
        updatedAt: Date.now(),
        verified: false // 可以添加验证逻辑
      };

      userSocialLinks.set(deviceFingerprint, currentLinks);
      saveUserSocialLinks();

      socket.emit("social-links-updated", {
        platform: 'whatsapp',
        success: true,
        data: currentLinks.whatsapp
      });

      console.log(`用户 ${nickname} (${deviceFingerprint}) 更新了WhatsApp信息: ${currentLinks.whatsapp.number}`);
    }
  });

  // 获取用户的社交链接
  socket.on("get-social-links", ({ targetDeviceFingerprint }) => {
    const targetFp = targetDeviceFingerprint || deviceFingerprint;
    const links = userSocialLinks.get(targetFp) || {};

    socket.emit("social-links-response", {
      deviceFingerprint: targetFp,
      links: {
        whatsapp: links.whatsapp || null
      }
    });
  });

  // 分享WhatsApp信息到聊天室
  socket.on("share-whatsapp-info", ({ roomId }) => {
    if (!rooms[roomId] || !socket.rooms.has(roomId)) return;

    const userLinks = userSocialLinks.get(deviceFingerprint);
    if (!userLinks || !userLinks.whatsapp) {
      socket.emit("whatsapp-share-failed", { message: "请先设置您的WhatsApp信息" });
      return;
    }

    const whatsappInfo = userLinks.whatsapp;
    const shareMessage = {
      type: 'whatsapp_share',
      from: socket.data.nickname,
      deviceFingerprint,
      whatsappInfo: {
        number: whatsappInfo.number,
        displayName: whatsappInfo.displayName
      },
      time: Date.now(),
      id: Date.now() + Math.random()
    };

    // 保存到聊天历史
    if (!chatHistory[roomId]) {
      chatHistory[roomId] = [];
    }
    chatHistory[roomId].push(shareMessage);
    saveChatHistory();

    // 广播到房间
    io.to(roomId).emit("whatsapp-info-shared", shareMessage);
    socket.emit("whatsapp-share-success", { message: "WhatsApp信息已分享到聊天室" });
  });

  // 一键WhatsApp聊天（生成WhatsApp链接）
  socket.on("get-whatsapp-link", ({ targetDeviceFingerprint }) => {
    const targetLinks = userSocialLinks.get(targetDeviceFingerprint);
    if (!targetLinks || !targetLinks.whatsapp) {
      socket.emit("whatsapp-link-failed", { message: "该用户未设置WhatsApp信息" });
      return;
    }

    const whatsappNumber = targetLinks.whatsapp.number.replace(/\D/g, ''); // 移除非数字字符
    const whatsappLink = `https://wa.me/${whatsappNumber}`;

    socket.emit("whatsapp-link-response", {
      targetDeviceFingerprint,
      whatsappLink,
      displayName: targetLinks.whatsapp.displayName,
      number: targetLinks.whatsapp.number
    });
  });

  // 图片消息处理：图片数据走内存暂存（不写入磁盘），聊天历史只存元数据
  socket.on("image-message", ({ roomId, imageInfo }) => {
    if (!rooms[roomId] || !socket.rooms.has(roomId)) {
      socket.emit("image-error", { message: "房间访问权限不足" });
      return;
    }
    if (!imageInfo || typeof imageInfo.imageData !== "string") {
      socket.emit("image-error", { message: "图片数据无效" });
      return;
    }

    // 创建图片消息记录（聊天历史只包含元数据）
    const imageMessage = {
      id: Date.now() + Math.random(),
      type: 'image',
      from: socket.data.nickname,
      deviceFingerprint,
      fileName: imageInfo.fileName,
      fileSize: imageInfo.fileSize,
      fileType: imageInfo.fileType,
      time: imageInfo.time || Date.now(),
      roomId
    };

    // 保存到聊天历史（仅元数据）
    if (!chatHistory[roomId]) {
      chatHistory[roomId] = [];
    }
    chatHistory[roomId].push(imageMessage);
    saveChatHistory();

    // 图片数据放入内存暂存，供历史记录恢复
    imageStore.set(imageMessage.id, {
      roomId,
      from: socket.data.nickname,
      imageData: imageInfo.imageData,
      fileName: imageInfo.fileName,
      fileSize: imageInfo.fileSize,
      fileType: imageInfo.fileType,
      time: imageMessage.time
    });
    trimImageStore();

    // 全量转发图片（含数据）给房间内其他用户
    socket.to(roomId).emit("image-message", { ...imageMessage, imageData: imageInfo.imageData });

    console.log(`用户 ${socket.data.nickname} 在房间 ${roomId} 发送了图片: ${imageInfo.fileName}`);
  });

  // 拉取历史图片数据（客户端加载聊天历史后按需请求）
  socket.on("get-image-data", ({ messageId }) => {
    const img = imageStore.get(messageId);
    if (!img) {
      socket.emit("image-data-response", { messageId, imageData: null });
      return;
    }
    socket.emit("image-data-response", {
      messageId,
      imageData: img.imageData,
      fileName: img.fileName,
      fileSize: img.fileSize,
      fileType: img.fileType,
      from: img.from
    });
  });

  // 清空聊天历史
  socket.on("clearChatHistory", ({ roomId }) => {
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      chatHistory[roomId] = [];
      saveChatHistory();
      io.to(roomId).emit("chatHistoryCleared");
    }
  });

  // 更新用户昵称
  socket.on("updateNickname", ({ nickname }) => {
    if (nickname && nickname.trim()) {
      const newNickname = nickname.trim();
      const oldNickname = socket.data.nickname;
      socket.data.nickname = newNickname;

      // 更新设备配置
      if (socket.data.deviceFingerprint) {
        if (userProfiles.has(socket.data.deviceFingerprint)) {
          const profile = userProfiles.get(socket.data.deviceFingerprint);
          profile.nickname = newNickname;
        } else {
          userProfiles.set(socket.data.deviceFingerprint, { nickname: newNickname, preferences: {} });
        }
        saveUserProfiles();
      }

      // 同步房间成员列表里的昵称
      Object.values(rooms).forEach((room) => {
        const member = room.users.find((u) => u.socketId === socket.id);
        if (member) member.nickname = newNickname;
      });

      // 通知当前房间的其他用户
      socket.rooms.forEach((roomId) => {
        if (rooms[roomId] && roomId !== socket.id) {
          systemMessage(roomId, `${oldNickname} 更新了昵称为 ${newNickname}`);
          broadcastRoomUpdate(roomId);
        }
      });

      socket.emit("nicknameUpdated", { nickname: newNickname });
    }
  });

  // 举手：转发给房间内其他人
  socket.on("raiseHand", ({ roomId, raised }) => {
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      io.to(roomId).emit("raiseHand", { peerId, nickname: socket.data.nickname, raised: !!raised });
    }
  });

  // 文件传输信令：转发文件信息
  socket.on("fileSignal", ({ roomId, signal, data }) => {
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      socket.to(roomId).emit("fileSignal", {
        from: socket.data.nickname,
        peerId: peerId,
        signal,
        data
      });
    }
  });

  // 文件传输状态更新（透传 transferId，否则接收方无法匹配进度到具体文件）
  socket.on("fileProgress", ({ roomId, fromPeerId, transferId, progress }) => {
    if (rooms[roomId]) {
      io.to(roomId).emit("fileProgress", { fromPeerId, transferId, progress });
    }
  });

  // 获取设备信息（用于调试和管理）
  socket.on("getDeviceInfo", () => {
    const deviceInfo = {
      fingerprint: deviceFingerprint,
      nickname: socket.data.nickname,
      browserId: clientInfo.browserId || "unknown",
      ip: clientIp,
      location: locationInfo,
      connectionTime: new Date().toISOString()
    };

    if (userProfiles.has(deviceFingerprint)) {
      const profile = userProfiles.get(deviceFingerprint);
      deviceInfo.createdAt = profile.createdAt ? new Date(profile.createdAt).toISOString() : "unknown";
      deviceInfo.lastSeen = profile.lastSeen ? new Date(profile.lastSeen).toISOString() : "unknown";
      deviceInfo.fingerprintHistory = profile.fingerprintHistory || [];
    }

    socket.emit("deviceInfo", deviceInfo);
  });

  // 管理员功能：获取所有设备信息（需要权限验证）
  socket.on("getAllDevices", () => {
    // 简单的权限检查：只有在本地环境的客户端才能查看
    const isLocal = LOCAL_IPS.has(clientIp) ||
                    clientInfo.serverUrl?.includes("localhost");

    if (isLocal) {
      const allDevices = [];
      for (const [fingerprint, profile] of userProfiles) {
        allDevices.push({
          fingerprint,
          nickname: profile.nickname,
          browserId: profile.browserId,
          createdAt: profile.createdAt,
          lastSeen: profile.lastSeen,
          fingerprintHistory: profile.fingerprintHistory || []
        });
      }
      socket.emit("allDevices", allDevices);
    } else {
      socket.emit("error", { message: "权限不足" });
    }
  });


});

// 监听所有网络接口，支持手机访问
const PORT = Number(process.env.PORT || 3000);
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`📡 HTTP服务器启动，监听所有网络接口的 ${PORT} 端口`);
  console.log(`🖥️ 本地访问: http://localhost:${PORT}`);
  console.log(`📱 局域网访问: http://YOUR_LOCAL_IP:${PORT}`);
  console.log(`🌐 正式访问: ${process.env.PUBLIC_URL || 'https://video.shanbo-rig.com'}`);
  console.log("💡 提示: 真实环境建议配置HTTPS以获得完整摄像头权限");
});
