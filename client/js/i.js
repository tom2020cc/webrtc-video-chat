/* ============ 环境配置 ============ */
const CONFIG_KEY = "upWebRTCConfig";
const PRESETS = {
  local: { env: "local", serverUrl: "http://localhost:3000", peerHost: "localhost", peerPort: "9000", secure: false, path: "/peerjs", nickname: "" },
  prod:  { env: "prod",  serverUrl: "https://www.howfq.icu", peerHost: "www.howfq.icu", peerPort: "", secure: true, path: "/peerjs", nickname: "" },
};

/* ============ 设备信息收集（增强版） ============ */
function getClientInfo() {
  // 获取Canvas指纹
  function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const txt = 'BrowserFingerprint,123!';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText(txt, 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText(txt, 4, 17);
      return canvas.toDataURL().substring(0, 100); // 只取前100个字符
    } catch (e) {
      return 'canvas-not-supported';
    }
  }

  // 获取WebGL指纹
  function getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'webgl-not-supported';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';

      return `${vendor}|${renderer}`;
    } catch (e) {
      return 'webgl-error';
    }
  }

  // 获取浏览器唯一ID（如果有）
  function getBrowserId() {
    let browserId = localStorage.getItem('browserId');
    if (!browserId) {
      // 生成新的浏览器ID
      browserId = 'bid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('browserId', browserId);
    }
    return browserId;
  }

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenResolution: `${screen.width}x${screen.height}`,
    colorDepth: screen.colorDepth,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    canvasFingerprint: getCanvasFingerprint(),
    webglFingerprint: getWebGLFingerprint(),
    hardwareConcurrency: navigator.hardwareConcurrency || 'unknown',
    deviceMemory: navigator.deviceMemory || 'unknown',
    browserId: getBrowserId(),
    cookieEnabled: navigator.cookieEnabled,
    doNotTrack: navigator.doNotTrack || 'unset'
  };
}

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch (e) { cfg = {}; }
  const merged = Object.assign({}, PRESETS.local, cfg);
  merged.path = merged.path || "/peerjs";
  if (merged.theme === undefined) merged.theme = "dark";
  if (merged.sound === undefined) merged.sound = true;
  if (merged.requirePassword === undefined) merged.requirePassword = false;
  if (merged.defaultPassword === undefined) merged.defaultPassword = "";
  if (merged.camOn === undefined) merged.camOn = true;
  if (merged.micOn === undefined) merged.micOn = true;
  if (!merged.nickname) {
    merged.nickname = "用户" + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  }
  return merged;
}
const config = loadConfig();

/* ============ DOM 引用 ============ */
const userNicknameDisplay = document.getElementById("userNickname");
const userPeerIdDisplay = document.getElementById("userPeerId");
const deviceIdDisplay = document.getElementById("deviceId");
const locationInfoDisplay = document.getElementById("locationInfo");
const currentRoomIdDisplay = document.getElementById("currentRoomId");
const videoContainer = document.getElementById("videoContainer");
const roomControls = document.getElementById("roomControls");
const roomIdInput = document.getElementById("roomId");
const roomPasswordInput = document.getElementById("roomPassword");
const createRoomBtn = document.getElementById("createRoomBtn");
const inRoomChip = document.getElementById("inRoomChip");
const roomListEl = document.getElementById("roomList");
const memberCount = document.getElementById("memberCount");
const memberList = document.getElementById("memberList");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const emojiBtn = document.getElementById("emojiBtn");
const emojiPanel = document.getElementById("emojiPanel");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const screenBtn = document.getElementById("screenBtn");
const raiseHandBtn = document.getElementById("raiseHandBtn");
const snapshotBtn = document.getElementById("snapshotBtn");
const copyRoomBtn = document.getElementById("copyRoomBtn");
const hangupBtn = document.getElementById("hangupBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const fileTransferArea = document.getElementById("fileTransferArea");
const closeFileArea = document.getElementById("closeFileArea");
const fileList = document.getElementById("fileList");
const clearChatBtn = document.getElementById("clearChatBtn");
const callTimerPill = document.getElementById("callTimerPill");
const callTimer = document.getElementById("callTimer");
const themeBtn = document.getElementById("themeBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const cfgNickname = document.getElementById("cfgNickname");
const cfgServerUrl = document.getElementById("cfgServerUrl");
const cfgPeerHost = document.getElementById("cfgPeerHost");
const cfgPeerPort = document.getElementById("cfgPeerPort");
const cfgSecure = document.getElementById("cfgSecure");
const cfgSound = document.getElementById("cfgSound");
const cfgRequirePassword = document.getElementById("cfgRequirePassword");
const cfgDefaultPassword = document.getElementById("cfgDefaultPassword");
const cfgDefaultPasswordField = document.getElementById("cfgDefaultPasswordField");
const cfgCamOn = document.getElementById("cfgCamOn");
const cfgMicOn = document.getElementById("cfgMicOn");
const cfgSave = document.getElementById("cfgSave");
const cfgCancel = document.getElementById("cfgCancel");
const cfgClose = document.getElementById("cfgClose");
const presetLocal = document.getElementById("presetLocal");
const presetProd = document.getElementById("presetProd");
const joinModal = document.getElementById("joinModal");
const joinRoomName = document.getElementById("joinRoomName");
const joinPassword = document.getElementById("joinPassword");
const joinConfirm = document.getElementById("joinConfirm");
const joinCancel = document.getElementById("joinCancel");
const joinClose = document.getElementById("joinClose");

/* ============ 全局状态 ============ */
let socket = null;
let peer = null;
let userPeerId = null;        // 当前用户 PeerID
let localStream = null;       // 本地视频流
let currentRoomId = null;     // 当前房间号
let currentUsers = [];        // 当前房间成员列表
let screenStream = null;      // 屏幕共享流
let screenTrack = null;       // 屏幕共享视频轨
let isSharing = false;
let isMuted = false;
let isCameraOff = false;
let handRaised = false;
let pendingJoinRoom = null;
const calls = new Map();        // peerId -> call，用于去重连接
const memberNames = new Map();  // peerId -> nickname
const raisedHands = new Set();  // 举手的 peerId 集合
let audioCtx = null;
const analysers = new Map();    // key -> {source, analyser}
let fileTransfers = new Map();  // transferId -> {name, size, from, progress, status}
let callStartTime = null;
let timerInterval = null;

/* ============ 提示条 ============ */
function showNotice(text) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    document.body.appendChild(t);
  }
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

/* ============ 音频工具：提示音 + 音量检测 ============ */
function ensureAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
// 用户首次交互时恢复音频上下文（浏览器自动播放策略）
window.addEventListener("pointerdown", () => { if (audioCtx && audioCtx.state === "suspended") audioCtx.resume(); });

function playTone(freq, dur, type, vol) {
  if (config.sound === false) return;
  try {
    const ctx = ensureAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (dur || 0.12));
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + (dur || 0.12));
  } catch (e) {}
}

function attachAnalyser(key, stream) {
  if (!stream || stream.getAudioTracks().length === 0) { analysers.delete(key); return; }
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const prev = analysers.get(key);
  if (prev) { try { prev.source.disconnect(); } catch (e) {} }
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);
  analysers.set(key, { source, analyser });
}

function getVolume(key) {
  const a = analysers.get(key);
  if (!a) return 0;
  const buf = new Uint8Array(a.analyser.fftSize);
  a.analyser.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}

function setSpeaking(tileId, speaking) {
  const tile = document.getElementById(tileId);
  if (tile) tile.classList.toggle("speaking", speaking);
}

// 每 200ms 检测一次谁在说话，高亮其视频框
setInterval(() => {
  setSpeaking("localTile", getVolume("local") > 0.06);
  calls.forEach((call, peerId) => setSpeaking(`tile-${peerId}`, getVolume(peerId) > 0.06));
}, 200);

/* ============ 通话时长计时器 ============ */
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function updateTimer() {
  const s = Math.floor((Date.now() - callStartTime) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  callTimer.textContent = (h > 0 ? h + ":" + pad(m) : pad(m)) + ":" + pad(sec);
}
function startTimer() {
  callStartTime = Date.now();
  callTimerPill.classList.remove("hidden");
  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}
function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  callTimerPill.classList.add("hidden");
  callTimer.textContent = "00:00";
}

/* ============ 主题 ============ */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", config.theme === "light" ? "light" : "dark");
  themeBtn.textContent = config.theme === "light" ? "☀️" : "🌙";
}
applyTheme();
themeBtn.addEventListener("click", () => {
  config.theme = config.theme === "light" ? "dark" : "light";
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  applyTheme();
});

/* ============ Socket 初始化 ============ */
socket = io(config.serverUrl, {
  auth: {
    nickname: config.nickname,
    ...getClientInfo()
  }
});
userNicknameDisplay.textContent = config.nickname;

socket.on("connect_error", () => {
  showNotice("无法连接服务器，请在「设置」中检查环境配置");
});

socket.on("peerId", (peerId) => {
  userPeerId = peerId;
  userPeerIdDisplay.textContent = peerId;
  initializePeer();
  initLocalStream();
});

// 用户信息响应（可能包含服务器端恢复的昵称）
socket.on("userInfo", ({ nickname, deviceFingerprint }) => {
  if (nickname && nickname !== config.nickname) {
    config.nickname = nickname;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    userNicknameDisplay.textContent = nickname;
    showNotice(`欢迎回来，${nickname}！`);
  }

  // 存储设备指纹
  if (deviceFingerprint) {
    window.currentDeviceFingerprint = deviceFingerprint;
  }

  // 获取设备信息
  socket.emit("getDeviceInfo");
});

// 设备信息响应
socket.on("deviceInfo", (deviceInfo) => {
  console.log("设备信息：", deviceInfo);

  // 显示设备ID（简化显示，只显示前8位）
  if (deviceInfo.fingerprint) {
    const shortId = deviceInfo.fingerprint.substring(0, 8) + "...";
    deviceIdDisplay.textContent = shortId;
    deviceIdDisplay.title = `完整设备ID: ${deviceInfo.fingerprint}\n浏览器ID: ${deviceInfo.browserId}\n连接时间: ${deviceInfo.connectionTime}`;
  }

  // 显示地理位置信息
  if (deviceInfo.location) {
    const loc = deviceInfo.location;
    const locationText = `${loc.countryEmoji} ${loc.city}, ${loc.region}`;
    locationInfoDisplay.textContent = locationText;
    locationInfoDisplay.title = `IP: ${deviceInfo.ip || "未知"}\n国家: ${loc.country}\n地区: ${loc.region}\n城市: ${loc.city}\nISP: ${loc.isp}\n时区: ${loc.timezone}`;

    // 如果IP变化了，提示用户
    if (config.lastIp && config.lastIp !== deviceInfo.ip) {
      showNotice(`检测到IP地址变化: ${config.lastIp} -> ${deviceInfo.ip}`);
    }
    config.lastIp = deviceInfo.ip;
  }

  // 保存设备信息到配置
  config.deviceInfo = deviceInfo;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
});

// 错误处理
socket.on("error", ({ message }) => {
  console.error("服务器错误：", message);
  showNotice(`错误：${message}`);
});

// 聊天历史
socket.on("chatHistory", ({ roomId, messages }) => {
  if (roomId === currentRoomId && messages && messages.length > 0) {
    messages.forEach(msg => {
      appendMessage(msg.from, msg.text, msg.time, false);
    });
    showNotice(`已加载 ${messages.length} 条历史消息`);
  }
});

// 聊天历史清空通知
socket.on("chatHistoryCleared", () => {
  chatMessages.innerHTML = "";
  showNotice("聊天记录已清空");
});

// 昵称更新确认
socket.on("nicknameUpdated", ({ nickname }) => {
  config.nickname = nickname;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  userNicknameDisplay.textContent = nickname;
  showNotice("昵称已更新");
});

socket.on("theRoomExist", (msg) => { alert(msg); resetRoomUI(); });
socket.on("theRoomNotExist", (msg) => { alert(msg); resetRoomUI(); });
socket.on("theRoomPasswordWrong", (msg) => {
  showNotice(msg);
  const rid = currentRoomId;
  resetRoomUI();
  if (rid) openJoinModal(rid);
});

// 房间列表（含是否有密码）
socket.on("roomList", (list) => {
  roomListEl.innerHTML = "";
  if (!list || list.length === 0) {
    roomListEl.innerHTML = '<span class="room-empty">暂无房间</span>';
    return;
  }
  list.forEach((room) => {
    const btn = document.createElement("button");
    btn.className = "room-btn";
    btn.textContent = (room.hasPassword ? "🔒 " : "") + `进入 ${room.id}`;
    btn.addEventListener("click", () => openJoinModal(room.id));
    roomListEl.appendChild(btn);
  });
});

socket.on("roomUpdate", (users) => {
  currentUsers = users;
  renderMembers();
  updateVideoPeers(users);
});

socket.on("chatMessage", ({ from, text, time, id, replyTo, forwardFrom, type }) => {
  appendMessage(from, text, time, false, id, replyTo, forwardFrom, type);
  if (from !== config.nickname) playTone(880, 0.08, "sine", 0.07);
});
socket.on("systemMessage", ({ text, time }) => {
  appendMessage(null, text, time, true);
  playTone(520, 0.12, "sine", 0.07);
});
socket.on("message-deleted", ({ messageId }) => {
  removeMessageFromUI(messageId);
  showNotice("消息已被删除");
});
socket.on("message-edited", ({ messageId, newText, editTime }) => {
  updateMessageInUI(messageId, newText, editTime);
});
socket.on("whatsapp-info-shared", (shareData) => {
  const shareMessage = `${shareData.from} 分享了WhatsApp信息: ${shareData.whatsappDisplayName} - ${shareData.whatsappNumber}`;
  appendMessage("System", shareMessage, shareData.time, true);
  showNotice(`收到 ${shareData.from} 的WhatsApp信息`);
  playTone(660, 0.15, "sine", 0.1);
});
socket.on("raiseHand", ({ peerId, nickname, raised }) => {
  if (raised) { raisedHands.add(peerId); showNotice(`${nickname} 举手了 ✋`); playTone(660, 0.18, "sine", 0.1); }
  else raisedHands.delete(peerId);
  renderMembers();
});

/* ============ Peer 初始化 ============ */
function initializePeer() {
  const opts = { host: config.peerHost, path: config.path, secure: config.secure };
  if (config.peerPort && config.peerPort !== "") opts.port = parseInt(config.peerPort, 10);

  peer = new Peer(userPeerId, opts);

  peer.on("call", (call) => {
    call.answer(localStream || new MediaStream());
    registerCall(call.peer, call);
  });
  peer.on("error", (err) => {
    console.error("PeerJS 错误：", err);
    showNotice("信令连接出错：" + (err.type || "未知错误"));
  });
  peer.on("disconnected", () => { try { peer.reconnect(); } catch (e) {} });
}

/* ============ 媒体：本地/远程视频 ============ */
function removePlaceholder() {
  const ph = document.getElementById("videoPlaceholder");
  if (ph) ph.classList.add("hidden");
}

async function initLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    if (config.micOn === false && localStream.getAudioTracks()[0]) {
      localStream.getAudioTracks()[0].enabled = false;
      isMuted = true;
    }
    if (config.camOn === false && localStream.getVideoTracks()[0]) {
      localStream.getVideoTracks()[0].enabled = false;
      isCameraOff = true;
    }
    syncControlButtons();
    displayLocalVideo(localStream);
  } catch (err) {
    console.error("获取媒体流失败：", err);
    showNotice("无法访问摄像头/麦克风，将以旁观模式加入");
  }
}

function displayLocalVideo(stream) {
  removePlaceholder();
  let tile = document.getElementById("localTile");
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = "localTile";
    const video = document.createElement("video");
    video.id = "localVideo";
    video.autoplay = true; video.playsInline = true; video.muted = true;
    const label = document.createElement("span");
    label.className = "label me";
    label.textContent = `我 · ${config.nickname}`;
    const badge = document.createElement("span");
    badge.className = "voice-badge";
    badge.textContent = "🔊";
    tile.appendChild(video);
    tile.appendChild(label);
    tile.appendChild(badge);
    videoContainer.appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
  attachAnalyser("local", stream);
}

function displayRemoteVideo(peerId, stream) {
  removePlaceholder();
  let tile = document.getElementById(`tile-${peerId}`);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "video-tile";
    tile.id = `tile-${peerId}`;
    const video = document.createElement("video");
    video.id = `video-${peerId}`;
    video.autoplay = true; video.playsInline = true;
    const label = document.createElement("span");
    label.className = "label";
    const badge = document.createElement("span");
    badge.className = "voice-badge";
    badge.textContent = "🔊";
    tile.appendChild(video);
    tile.appendChild(label);
    tile.appendChild(badge);
    videoContainer.appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
  tile.querySelector(".label").textContent = memberNames.get(peerId) || peerId;
  attachAnalyser(peerId, stream);
}

function removeRemoteVideo(peerId) {
  const tile = document.getElementById(`tile-${peerId}`);
  if (tile) tile.remove();
  analysers.delete(peerId);
}

/* ============ 通话管理（去重连接） ============ */
function registerCall(peerId, call) {
  calls.set(peerId, call);
  call.on("stream", (remoteStream) => displayRemoteVideo(peerId, remoteStream));
  call.on("close", () => { calls.delete(peerId); removeRemoteVideo(peerId); });
  call.on("error", () => { calls.delete(peerId); removeRemoteVideo(peerId); });
  if (screenTrack) replaceVideoTrackOn(call, screenTrack);
}

function updateVideoPeers(users) {
  if (!localStream) return;
  users.forEach((user) => {
    if (user.peerId !== userPeerId && userPeerId < user.peerId && !calls.has(user.peerId)) {
      try {
        const call = peer.call(user.peerId, localStream);
        registerCall(user.peerId, call);
      } catch (e) { console.warn("发起呼叫失败", e); }
    }
  });
}

function closeAllCalls() {
  calls.forEach((call) => { try { call.close(); } catch (e) {} });
  calls.clear();
}

/* ============ 成员列表 / 聊天 ============ */
function renderMembers() {
  const users = currentUsers;
  memberNames.clear();
  users.forEach((u) => memberNames.set(u.peerId, u.nickname));
  memberCount.textContent = users.length;
  memberList.innerHTML = "";
  if (!users || users.length === 0) {
    memberList.innerHTML = '<li class="member-empty">暂无成员</li>';
    return;
  }
  users.forEach((u) => {
    const li = document.createElement("li");
    li.className = "member";
    li.id = `member-${u.peerId}`;
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = (u.nickname || "?").slice(0, 1);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = u.nickname;
    li.appendChild(avatar);
    li.appendChild(name);
    if (raisedHands.has(u.peerId)) {
      const hand = document.createElement("span");
      hand.className = "hand";
      hand.textContent = "✋";
      hand.title = "举手";
      li.appendChild(hand);
    }
    if (u.peerId === userPeerId) {
      const you = document.createElement("span");
      you.className = "you";
      you.textContent = "你";
      li.appendChild(you);
    }
    memberList.appendChild(li);
  });
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function appendMessage(from, text, time, isSystem, messageId = null, replyTo = null, forwardFrom = null, type = 'text') {
  const wrap = document.createElement("div");
  if (isSystem) {
    wrap.className = "msg system";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
  } else {
    wrap.className = "msg" + (from === config.nickname ? " mine" : "");
    if (messageId) wrap.dataset.messageId = messageId;
    if (from === config.nickname) wrap.dataset.isOwnMessage = "true";

    const meta = document.createElement("div");
    meta.className = "meta-line";

    // 添加消息类型标识
    let typeIndicator = '';
    if (type === 'forward') typeIndicator = '↪️ ';
    if (type === 'whatsapp_share') typeIndicator = '📱 ';

    meta.textContent = `${typeIndicator}${from} · ${formatTime(time)}`;

    // 添加消息操作按钮（仅对自己的消息显示）
    if (from === config.nickname && messageId) {
      const actionsBtn = document.createElement("span");
      actionsBtn.className = "msg-actions";
      actionsBtn.innerHTML = `
        <button class="action-btn" data-action="reply" title="回复">↩️</button>
        <button class="action-btn" data-action="delete" title="删除">🗑️</button>
      `;
      meta.appendChild(actionsBtn);

      // 添加事件监听
      actionsBtn.addEventListener('click', (e) => {
        if (e.target.dataset.action === 'delete') {
          deleteMessage(messageId);
        } else if (e.target.dataset.action === 'reply') {
          startReply(messageId, text, from);
        }
      });
    }

    wrap.appendChild(meta);

    // 显示回复信息
    if (replyTo) {
      const replyEl = document.createElement("div");
      replyEl.className = "reply-context";
      replyEl.innerHTML = `
        <span class="reply-label">↩️ 回复 ${replyTo.from}:</span>
        <span class="reply-text">${replyTo.text}</span>
      `;
      wrap.appendChild(replyEl);
    }

    // 显示转发信息
    if (forwardFrom) {
      const forwardEl = document.createElement("div");
      forwardEl.className = "forward-context";
      forwardEl.innerHTML = `
        <span class="forward-label">↪️ 转发自 ${forwardFrom.originalFrom} 在房间 ${forwardFrom.originalRoom}:</span>
        <span class="forward-text">${forwardFrom.originalText}</span>
      `;
      wrap.appendChild(forwardEl);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;

    if (forwardFrom) {
      bubble.classList.add('forwarded');
    }

    wrap.appendChild(bubble);
  }
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 删除消息
function deleteMessage(messageId) {
  if (!currentRoomId) return;

  if (confirm('确定要删除这条消息吗？')) {
    socket.emit('deleteMessage', {
      roomId: currentRoomId,
      messageId: messageId
    });
  }
}

// 开始回复消息
function startReply(messageId, text, from) {
  const chatInput = document.getElementById('chatInput');
  chatInput.focus();
  chatInput.dataset.replyingTo = messageId;
  chatInput.dataset.originalText = text;
  chatInput.dataset.originalFrom = from;
  chatInput.placeholder = `回复 ${from}: ${text.substring(0, 30)}...`;
}

// 从UI中移除消息
function removeMessageFromUI(messageId) {
  const messageEl = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.remove();
  }
}

// 更新UI中的消息
function updateMessageInUI(messageId, newText, editTime) {
  const messageEl = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    const bubble = messageEl.querySelector('.bubble');
    if (bubble) {
      bubble.textContent = newText;
      bubble.classList.add('edited');

      // 更新时间显示
      const metaLine = messageEl.querySelector('.meta-line');
      if (metaLine) {
        const timeText = metaLine.childNodes[0].textContent;
        metaLine.childNodes[0].textContent = timeText + ' (已编辑)';
      }
    }
  }
}

/* ============ 房间逻辑 ============ */
function setRoomState(inRoom) {
  roomControls.classList.toggle("hidden", inRoom);
  inRoomChip.classList.toggle("hidden", !inRoom);
  roomListEl.classList.toggle("hidden", inRoom);
  hangupBtn.disabled = !inRoom;
  chatSendBtn.disabled = !inRoom;
  raiseHandBtn.disabled = !inRoom;
  copyRoomBtn.disabled = !inRoom;
  if (inRoom) { inRoomChip.textContent = `🏠 当前房间：${currentRoomId}`; startTimer(); }
  else stopTimer();
}

function resetRoomUI() {
  currentRoomId = null;
  currentRoomIdDisplay.textContent = "未加入房间";
  roomIdInput.value = "";
  setRoomState(false);
}

createRoomBtn.addEventListener("click", async () => {
  const roomId = roomIdInput.value.trim();
  if (!roomId) { alert("房间号不能为空"); return; }
  let password = roomPasswordInput.value.trim();
  if (config.requirePassword) {
    if (!password) password = config.defaultPassword || "";
    if (!password) { alert("请在设置中填写默认密码，或在此输入房间密码"); return; }
  }
  if (!localStream) await initLocalStream();
  socket.emit("createRoom", { roomId, password });
  currentRoomId = roomId;
  currentRoomIdDisplay.textContent = roomId;
  roomIdInput.value = "";
  roomPasswordInput.value = "";
  setRoomState(true);
});

async function doJoinRoom(roomId, password) {
  if (currentRoomId) { alert("请先离开当前房间"); return; }
  if (!localStream) await initLocalStream();
  socket.emit("joinRoom", { roomId, password });
  currentRoomId = roomId;
  currentRoomIdDisplay.textContent = roomId;
  setRoomState(true);
}

function leaveRoom() {
  if (!currentRoomId) return;
  socket.emit("leaveRoom", currentRoomId);
  currentRoomId = null;
  currentRoomIdDisplay.textContent = "未加入房间";
  closeAllCalls();
  stopLocalStream();
  resetVideoContainer();
  raisedHands.clear();
  handRaised = false;
  raiseHandBtn.classList.remove("on");
  currentUsers = [];
  renderMembers();
  analysers.clear();

  // 清理文件传输
  fileTransfers.clear();
  hideFileTransferArea();

  setRoomState(false);
}

function stopLocalStream() {
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach((t) => t.stop()); }
  screenStream = null; screenTrack = null; isSharing = false;
  screenBtn.classList.remove("on");
  screenBtn.querySelector(".txt").textContent = "共享屏幕";
  isMuted = false; isCameraOff = false;
  syncControlButtons();
}

function resetVideoContainer() {
  videoContainer.innerHTML = "";
  const ph = document.createElement("div");
  ph.className = "video-placeholder";
  ph.id = "videoPlaceholder";
  ph.innerHTML = '<div class="ph-icon">🎬</div><p>创建或加入房间后，这里将显示视频画面</p>';
  videoContainer.appendChild(ph);
}

/* ============ 加入房间弹窗 ============ */
function openJoinModal(roomId) {
  pendingJoinRoom = roomId;
  joinRoomName.textContent = roomId;
  joinPassword.value = "";
  joinModal.classList.remove("hidden");
  joinPassword.focus();
}
function closeJoinModal() { joinModal.classList.add("hidden"); pendingJoinRoom = null; }

/* ============ 通话控制 ============ */
function syncControlButtons() {
  muteBtn.classList.toggle("on", isMuted);
  muteBtn.querySelector(".ico").textContent = isMuted ? "🔇" : "🎙️";
  muteBtn.querySelector(".txt").textContent = isMuted ? "取消静音" : "静音";
  cameraBtn.classList.toggle("on", isCameraOff);
  cameraBtn.querySelector(".ico").textContent = isCameraOff ? "🚫" : "📷";
  cameraBtn.querySelector(".txt").textContent = isCameraOff ? "打开摄像头" : "关摄像头";
}

function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  isMuted = !track.enabled;
  syncControlButtons();
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  isCameraOff = !track.enabled;
  syncControlButtons();
}

function replaceVideoTrackOn(call, track) {
  const pc = call.peerConnection;
  if (!pc) return;
  pc.getSenders().forEach((sender) => {
    if (sender.track && sender.track.kind === "video") {
      sender.replaceTrack(track).catch(() => {});
    }
  });
}
function replaceVideoTrackOnAll(track) {
  calls.forEach((call) => replaceVideoTrackOn(call, track));
}

async function startScreenShare() {
  if (isSharing) return;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    screenTrack = screenStream.getVideoTracks()[0];
    screenTrack.addEventListener("ended", stopScreenShare);
    replaceVideoTrackOnAll(screenTrack);
    isSharing = true;
    screenBtn.classList.add("on");
    screenBtn.querySelector(".txt").textContent = "停止共享";
    const localVideo = document.getElementById("localVideo");
    if (localVideo) localVideo.srcObject = screenStream;
  } catch (err) {
    console.error("屏幕共享失败：", err);
  }
}

function stopScreenShare() {
  if (!isSharing) return;
  const camTrack = localStream ? localStream.getVideoTracks()[0] : null;
  if (camTrack) replaceVideoTrackOnAll(camTrack);
  const localVideo = document.getElementById("localVideo");
  if (localVideo) localVideo.srcObject = localStream;
  if (screenStream) screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null; screenTrack = null; isSharing = false;
  screenBtn.classList.remove("on");
  screenBtn.querySelector(".txt").textContent = "共享屏幕";
}

/* ============ 截图 / 复制房号 / 表情 ============ */
function captureSnapshot() {
  const video = document.getElementById("localVideo");
  if (!video || !video.videoWidth) { showNotice("暂无画面可截图"); return; }
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "snapshot_" + Date.now() + ".png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice("已截图保存");
  }, "image/png");
}

async function copyRoomId() {
  if (!currentRoomId) { showNotice("请先加入房间"); return; }
  try {
    await navigator.clipboard.writeText(currentRoomId);
    showNotice("房间号已复制");
  } catch (e) {
    prompt("复制失败，请手动复制", currentRoomId);
  }
}

const EMOJIS = ["😀","😂","😍","😎","🤔","😭","😅","🤣","😊","🥰","😴","🤯","👀","👍","👏","🙏","🎉","❤️","🔥","💯","😉","😇","🤗","😱","✨","⭐","🎁","🍀","🤝","💪","🚀","☕"];
function buildEmojiPanel() {
  emojiPanel.innerHTML = EMOJIS.map((e) => `<button type="button">${e}</button>`).join("");
  emojiPanel.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => { chatInput.value += b.textContent; chatInput.focus(); });
  });
}
buildEmojiPanel();

/* ============ 文件传输功能 ============ */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const iconMap = {
    "pdf": "📄", "doc": "📝", "docx": "📝", "txt": "📃",
    "jpg": "🖼️", "jpeg": "🖼️", "png": "🖼️", "gif": "🖼️",
    "mp4": "🎬", "avi": "🎬", "mov": "🎬",
    "mp3": "🎵", "wav": "🎵", "flac": "🎵",
    "zip": "📦", "rar": "📦", "7z": "📦",
    "js": "📜", "html": "🌐", "css": "🎨"
  };
  return iconMap[ext] || "📄";
}

function renderFileItem(transfer) {
  const div = document.createElement("div");
  div.className = "file-item";
  div.id = `file-${transfer.id}`;

  const icon = document.createElement("span");
  icon.className = "file-icon";
  icon.textContent = getFileIcon(transfer.name);

  const info = document.createElement("div");
  info.className = "file-info";

  const name = document.createElement("div");
  name.className = "file-name";
  name.textContent = transfer.name;

  const meta = document.createElement("div");
  meta.className = "file-meta";
  meta.textContent = `${transfer.from || "未知"} · ${formatFileSize(transfer.size)}`;

  info.appendChild(name);
  info.appendChild(meta);

  if (transfer.status === "transferring") {
    const progress = document.createElement("div");
    progress.className = "file-progress";
    const bar = document.createElement("div");
    bar.className = "file-progress-bar";
    bar.style.width = `${transfer.progress || 0}%`;
    progress.appendChild(bar);
    info.appendChild(progress);
  }

  const actions = document.createElement("div");
  actions.className = "file-actions";

  if (transfer.status === "incoming") {
    const acceptBtn = document.createElement("button");
    acceptBtn.className = "file-action-btn primary";
    acceptBtn.textContent = "接收";
    acceptBtn.onclick = () => acceptFile(transfer.id);

    const rejectBtn = document.createElement("button");
    rejectBtn.className = "file-action-btn";
    rejectBtn.textContent = "拒绝";
    rejectBtn.onclick = () => rejectFile(transfer.id);

    actions.appendChild(acceptBtn);
    actions.appendChild(rejectBtn);
  } else if (transfer.status === "outgoing") {
    const statusSpan = document.createElement("span");
    statusSpan.className = "file-action-btn";
    statusSpan.textContent = "发送中...";
    statusSpan.disabled = true;
    actions.appendChild(statusSpan);
  } else if (transfer.status === "completed") {
    const doneBtn = document.createElement("button");
    doneBtn.className = "file-action-btn";
    doneBtn.textContent = "已完成";
    doneBtn.disabled = true;
    actions.appendChild(doneBtn);
  }

  div.appendChild(icon);
  div.appendChild(info);
  div.appendChild(actions);

  return div;
}

function updateFileTransferUI() {
  fileList.innerHTML = "";
  if (fileTransfers.size === 0) {
    fileList.innerHTML = '<div class="empty-files">暂无文件传输</div>';
    return;
  }

  fileTransfers.forEach((transfer) => {
    fileList.appendChild(renderFileItem(transfer));
  });
}

function showFileTransferArea() {
  fileTransferArea.classList.remove("hidden");
}

function hideFileTransferArea() {
  fileTransferArea.classList.add("hidden");
}

// 文件发送
function sendFile(file) {
  if (!currentRoomId) {
    showNotice("请先加入房间");
    return;
  }

  const transferId = `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 通知其他用户有文件要发送
  socket.emit("fileSignal", {
    roomId: currentRoomId,
    signal: "offer",
    data: {
      id: transferId,
      name: file.name,
      size: file.size,
      type: file.type,
      from: config.nickname
    }
  });

  // 添加到传输列表
  fileTransfers.set(transferId, {
    id: transferId,
    name: file.name,
    size: file.size,
    from: config.nickname,
    status: "outgoing",
    progress: 0
  });

  updateFileTransferUI();
  showFileTransferArea();

  // 模拟文件传输进度（实际应用中需要使用WebRTC数据通道）
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 10;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      const transfer = fileTransfers.get(transferId);
      if (transfer) {
        transfer.status = "completed";
        transfer.progress = 100;
        updateFileTransferUI();
        showNotice("文件发送完成");
      }
    } else {
      const transfer = fileTransfers.get(transferId);
      if (transfer) {
        transfer.progress = progress;
        updateFileTransferUI();
      }

      // 通知进度更新
      socket.emit("fileProgress", {
        roomId: currentRoomId,
        transferId,
        progress
      });
    }
  }, 500);
}

// 文件接收
function acceptFile(transferId) {
  const transfer = fileTransfers.get(transferId);
  if (!transfer) return;

  transfer.status = "transferring";
  transfer.progress = 0;
  updateFileTransferUI();

  // 模拟接收进度
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 15;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      transfer.status = "completed";
      transfer.progress = 100;
      updateFileTransferUI();
      showNotice("文件接收完成");
    } else {
      transfer.progress = progress;
      updateFileTransferUI();
    }
  }, 300);
}

function rejectFile(transferId) {
  const transfer = fileTransfers.get(transferId);
  if (!transfer) return;

  fileTransfers.delete(transferId);
  updateFileTransferUI();

  if (fileTransfers.size === 0) {
    hideFileTransferArea();
  }

  showNotice("已拒绝文件接收");
}

// 处理文件信号
socket.on("fileSignal", ({ from, peerId, signal, data }) => {
  if (signal === "offer") {
    const transferId = data.id;

    // 避免重复添加
    if (fileTransfers.has(transferId)) return;

    fileTransfers.set(transferId, {
      id: transferId,
      name: data.name,
      size: data.size,
      from: from || data.from,
      status: "incoming",
      progress: 0
    });

    updateFileTransferUI();
    showFileTransferArea();
    showNotice(`${from || data.from} 想要发送文件：${data.name}`);

    playTone(440, 0.1, "sine", 0.08);
  }
});

// 处理文件传输进度
socket.on("fileProgress", ({ fromPeerId, transferId, progress }) => {
  const transfer = fileTransfers.get(transferId);
  if (transfer) {
    transfer.progress = progress;
    if (progress >= 100) {
      transfer.status = "completed";
    }
    updateFileTransferUI();
  }
});
function openSettings() {
  cfgNickname.value = config.nickname;
  cfgServerUrl.value = config.serverUrl;
  cfgPeerHost.value = config.peerHost;
  cfgPeerPort.value = config.peerPort;
  cfgSecure.checked = config.secure;
  cfgSound.checked = config.sound;
  cfgRequirePassword.checked = !!config.requirePassword;
  cfgDefaultPassword.value = config.defaultPassword || "";
  cfgCamOn.checked = config.camOn !== false;
  cfgMicOn.checked = config.micOn !== false;
  syncPasswordField();
  updatePresetActive();
  settingsModal.classList.remove("hidden");
}
function closeSettings() { settingsModal.classList.add("hidden"); }
function updatePresetActive() {
  presetLocal.classList.toggle("active", config.env === "local");
  presetProd.classList.toggle("active", config.env === "prod");
}
function syncPasswordField() {
  const on = cfgRequirePassword.checked;
  cfgDefaultPassword.disabled = !on;
  cfgDefaultPasswordField.style.opacity = on ? "1" : "0.5";
}
function applyPreset(env) {
  const p = PRESETS[env];
  cfgServerUrl.value = p.serverUrl;
  cfgPeerHost.value = p.peerHost;
  cfgPeerPort.value = p.peerPort;
  cfgSecure.checked = p.secure;
  config.env = env;
  updatePresetActive();
}

/* ============ 聊天记录管理 ============ */
function clearChatHistory() {
  if (!currentRoomId) {
    showNotice("请先加入房间");
    return;
  }

  if (confirm("确定要清空聊天记录吗？此操作无法撤销。")) {
    socket.emit("clearChatHistory", { roomId: currentRoomId });
    chatMessages.innerHTML = "";
    showNotice("聊天记录已清空");
  }
}

/* ============ 昵称更新功能 ============ */
function updateNickname(newNickname) {
  if (!newNickname || !newNickname.trim()) {
    showNotice("昵称不能为空");
    return;
  }

  socket.emit("updateNickname", { nickname: newNickname.trim() });
}

/* ============ 事件绑定 ============ */
muteBtn.addEventListener("click", toggleMute);
cameraBtn.addEventListener("click", toggleCamera);
screenBtn.addEventListener("click", () => { isSharing ? stopScreenShare() : startScreenShare(); });
hangupBtn.addEventListener("click", leaveRoom);
raiseHandBtn.addEventListener("click", () => {
  if (!currentRoomId) return;
  handRaised = !handRaised;
  socket.emit("raiseHand", { roomId: currentRoomId, raised: handRaised });
  raiseHandBtn.classList.toggle("on", handRaised);
});
snapshotBtn.addEventListener("click", captureSnapshot);
copyRoomBtn.addEventListener("click", copyRoomId);
emojiBtn.addEventListener("click", () => emojiPanel.classList.toggle("hidden"));

// 文件传输事件
fileBtn.addEventListener("click", () => {
  fileInput.click();
});

// 图片按钮和图片处理
const imageBtn = document.getElementById("imageBtn");
const imageInput = document.getElementById("imageInput");
const imagePreviewModal = document.getElementById("imagePreviewModal");
const previewImage = document.getElementById("previewImage");
const closeImagePreview = document.getElementById("closeImagePreview");

imageBtn.addEventListener("click", () => {
  if (!currentRoomId) {
    showNotice("请先加入房间");
    return;
  }
  imageInput.click();
});

imageInput.addEventListener("change", (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => {
      if (file.type.startsWith('image/')) {
        sendImage(file);
      } else {
        showNotice("请选择图片文件");
      }
    });
    imageInput.value = ""; // 重置文件输入
  }
});

// 发送图片功能
function sendImage(file) {
  // 检查文件大小（1MB限制）
  const maxSize = 1 * 1024 * 1024; // 1MB
  if (file.size > maxSize) {
    showNotice("图片大小不能超过1MB");
    return;
  }

  if (!currentRoomId) {
    showNotice("请先加入房间");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const imageData = e.target.result;

    // 创建图片消息对象
    const imageMessage = {
      type: 'image',
      from: config.nickname,
      deviceFingerprint: currentDeviceFingerprint,
      imageData: imageData,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      time: Date.now(),
      id: Date.now() + Math.random()
    };

    // 通过DataChannel发送图片（如果有Peer连接）
    sendImageToPeers(imageMessage);

    // 也在本地显示
    displayImageMessage(imageMessage);

    // 通知服务器
    socket.emit('image-message', {
      roomId: currentRoomId,
      imageInfo: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        time: Date.now()
      }
    });

    showNotice("图片发送成功");
  };

  reader.onerror = () => {
    showNotice("图片读取失败");
  };

  reader.readAsDataURL(file);
}

// 通过DataChannel发送图片给Peers
function sendImageToPeers(imageMessage) {
  // 这里可以通过WebRTC DataChannel发送图片
  // 目前简化处理，主要通过socket.io信号传输
  Object.values(peerConnections).forEach(conn => {
    if (conn.dataChannel && conn.dataChannel.readyState === 'open') {
      try {
        // 将imageData转换为字符串传输
        const dataStr = JSON.stringify({
          type: 'image',
          data: imageMessage
        });
        conn.dataChannel.send(dataStr);
      } catch (e) {
        console.error("发送图片失败:", e);
      }
    }
  });
}

// 显示图片消息
function displayImageMessage(message) {
  const wrap = document.createElement("div");
  wrap.className = "msg" + (message.from === config.nickname ? " mine" : "") + " image";
  wrap.dataset.messageId = message.id || message.time;

  const meta = document.createElement("div");
  meta.className = "meta-line";
  meta.textContent = `${message.from} · ${formatTime(message.time)}`;

  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";

  const img = document.createElement("img");
  img.src = message.imageData;
  img.alt = message.fileName || "图片";

  // 点击图片预览
  img.addEventListener('click', () => {
    openImagePreview(message.imageData);
  });

  const imageInfo = document.createElement("div");
  imageInfo.className = "image-info";

  const sizeText = formatFileSize(message.fileSize);
  imageInfo.innerHTML = `
    <span>${message.fileName || "image"} (${sizeText})</span>
    <div class="image-actions">
      <button class="image-action-btn" data-action="download" data-url="${message.imageData}" data-name="${message.fileName || "image"}">⬇️ 下载</button>
    </div>
  `;

  // 下载按钮功能
  const downloadBtn = imageInfo.querySelector('.image-action-btn');
  downloadBtn.addEventListener('click', () => {
    downloadImage(message.imageData, message.fileName || "image");
  });

  imageContainer.appendChild(img);
  imageContainer.appendChild(imageInfo);

  wrap.appendChild(meta);
  wrap.appendChild(imageContainer);

  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 打开图片预览
function openImagePreview(imageUrl) {
  previewImage.src = imageUrl;
  imagePreviewModal.classList.add('active');
}

// 关闭图片预览
closeImagePreview.addEventListener('click', () => {
  imagePreviewModal.classList.remove('active');
});

// 点击模态框背景关闭预览
imagePreviewModal.addEventListener('click', (e) => {
  if (e.target === imagePreviewModal) {
    imagePreviewModal.classList.remove('active');
  }
});

// 下载图片
function downloadImage(imageUrl, fileName) {
  const link = document.createElement('a');
  link.href = imageUrl;
  link.download = fileName || 'image';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showNotice("开始下载图片");
}

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

fileInput.addEventListener("change", (e) => {
  const files = e.target.files;
  if (files && files.length > 0) {
    Array.from(files).forEach(file => sendFile(file));
    fileInput.value = ""; // 重置文件输入
  }
});

closeFileArea.addEventListener("click", hideFileTransferArea);

// 清空聊天记录
clearChatBtn.addEventListener("click", clearChatHistory);
joinConfirm.addEventListener("click", () => {
  if (!pendingJoinRoom) return;
  const roomId = pendingJoinRoom;
  const password = joinPassword.value.trim();
  closeJoinModal();
  doJoinRoom(roomId, password);
});
joinCancel.addEventListener("click", closeJoinModal);
joinClose.addEventListener("click", closeJoinModal);
settingsBtn.addEventListener("click", openSettings);
cfgClose.addEventListener("click", closeSettings);
cfgCancel.addEventListener("click", closeSettings);
presetLocal.addEventListener("click", () => applyPreset("local"));
presetProd.addEventListener("click", () => applyPreset("prod"));
cfgRequirePassword.addEventListener("change", syncPasswordField);

cfgSave.addEventListener("click", () => {
  const newNickname = cfgNickname.value.trim() || "匿名用户";
  const nicknameChanged = newNickname !== config.nickname;

  config.nickname = newNickname;
  config.serverUrl = cfgServerUrl.value.trim();
  config.peerHost = cfgPeerHost.value.trim();
  config.peerPort = cfgPeerPort.value.trim();
  config.secure = cfgSecure.checked;
  config.sound = cfgSound.checked;
  config.requirePassword = cfgRequirePassword.checked;
  config.defaultPassword = cfgDefaultPassword.value.trim();
  config.camOn = cfgCamOn.checked;
  config.micOn = cfgMicOn.checked;
  config.env = /localhost|127\.0\.0\.1/.test(config.peerHost + config.serverUrl) ? "local" : "prod";
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));

  // 如果昵称改变且在房间内，通知服务器
  if (nicknameChanged && currentRoomId) {
    updateNickname(newNickname);
  }

  closeSettings();
  showNotice("设置已保存");
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!currentRoomId) { showNotice("请先加入房间"); return; }

  // 检查是否是回复消息
  const replyToId = chatInput.dataset.replyingTo;
  const originalText = chatInput.dataset.originalText;
  const originalFrom = chatInput.dataset.originalFrom;

  if (replyToId) {
    // 发送回复消息
    socket.emit("chatMessage", {
      roomId: currentRoomId,
      text,
      replyTo: {
        id: replyToId,
        from: originalFrom,
        text: originalText,
        time: Date.now()
      }
    });

    // 清除回复状态
    delete chatInput.dataset.replyingTo;
    delete chatInput.dataset.originalText;
    delete chatInput.dataset.originalFrom;
    chatInput.placeholder = "说点什么…(回车发送)";
  } else {
    // 发送普通消息
    socket.emit("chatMessage", { roomId: currentRoomId, text });
  }

  chatInput.value = "";
});

// 键盘快捷键（在输入框内不触发）
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case "m": toggleMute(); break;
    case "v": toggleCamera(); break;
    case "s": isSharing ? stopScreenShare() : startScreenShare(); break;
    case "r": if (currentRoomId) raiseHandBtn.click(); break;
    case "i": if (currentRoomId) imageBtn.click(); break; // 图片快捷键
  }
});

// 点击弹窗外部关闭
document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
});

// 页面关闭时清理
window.addEventListener("beforeunload", () => {
  if (currentRoomId) socket.emit("leaveRoom", currentRoomId);
});

/* ============ 管理员和WhatsApp功能 ============ */
let isAdmin = false;
let adminToken = null;
let currentAdminSession = null;

// 管理员登录按钮
document.getElementById("adminLoginBtn").addEventListener("click", () => {
  document.getElementById("adminLoginModal").classList.remove("hidden");
  document.getElementById("adminPassword").focus();
});

// 管理员登录表单
document.getElementById("adminLoginConfirm").addEventListener("click", () => {
  const password = document.getElementById("adminPassword").value;
  if (!password.trim()) {
    showNotice("请输入管理员密码");
    return;
  }

  socket.emit("admin-login", { password: password });
});

// 管理员登录取消
document.getElementById("adminLoginCancel").addEventListener("click", () => {
  document.getElementById("adminLoginModal").classList.add("hidden");
  document.getElementById("adminPassword").value = "";
});

document.getElementById("adminLoginClose").addEventListener("click", () => {
  document.getElementById("adminLoginModal").classList.add("hidden");
  document.getElementById("adminPassword").value = "";
});

// 监听管理员登录结果
socket.on("admin-login-success", ({ token, message, sessionInfo }) => {
  isAdmin = true;
  adminToken = token;
  currentAdminSession = sessionInfo;

  document.getElementById("adminLoginModal").classList.add("hidden");
  document.getElementById("adminPassword").value = "";

  showNotice(`管理员登录成功！会话时长: ${Math.round(sessionInfo.duration / 60000)}分钟`);

  // 更新UI显示管理员状态
  document.getElementById("adminLoginBtn").innerHTML = "👑 管理员";
  document.getElementById("adminLoginBtn").classList.add("admin-active");

  console.log("管理员会话信息:", sessionInfo);
});

socket.on("admin-login-failed", ({ message }) => {
  showNotice(`管理员登录失败: ${message}`);
  document.getElementById("adminPassword").value = "";
});

// WhatsApp分享按钮
document.getElementById("whatsappShareBtn").addEventListener("click", () => {
  if (!currentRoomId) {
    showNotice("请先加入房间");
    return;
  }

  // 检查是否已设置WhatsApp信息
  socket.emit("get-social-links", {});
});

// 监听WhatsApp信息响应
socket.on("social-links-response", ({ links }) => {
  if (links.whatsapp) {
    // 已设置WhatsApp信息，分享到房间
    socket.emit("share-whatsapp-info", { roomId: currentRoomId });
  } else {
    // 未设置，显示设置弹窗
    document.getElementById("whatsappModal").classList.remove("hidden");
    document.getElementById("whatsappNumber").focus();
  }
});

// WhatsApp设置保存
document.getElementById("whatsappSave").addEventListener("click", () => {
  const number = document.getElementById("whatsappNumber").value.trim();
  const displayName = document.getElementById("whatsappDisplayName").value.trim();

  if (!number) {
    showNotice("请输入WhatsApp号码");
    return;
  }

  socket.emit("update-social-links", {
    platform: "whatsapp",
    contactInfo: {
      number,
      displayName: displayName || config.nickname
    }
  });

  document.getElementById("whatsappModal").classList.add("hidden");

  // 如果在房间内，自动分享
  if (currentRoomId) {
    setTimeout(() => {
      socket.emit("share-whatsapp-info", { roomId: currentRoomId });
    }, 500);
  }
});

// WhatsApp设置取消
document.getElementById("whatsappCancel").addEventListener("click", () => {
  document.getElementById("whatsappModal").classList.add("hidden");
});

document.getElementById("whatsappClose").addEventListener("click", () => {
  document.getElementById("whatsappModal").classList.add("hidden");
});

// 监听WhatsApp设置结果
socket.on("social-links-updated", ({ platform, success, data }) => {
  if (success && platform === "whatsapp") {
    showNotice("WhatsApp信息已保存");
    console.log("WhatsApp信息设置成功:", data);
  }
});

socket.on("whatsapp-share-success", ({ message }) => {
  showNotice(message);
});

socket.on("whatsapp-share-failed", ({ message }) => {
  showNotice(message);
});

// 监听其他用户分享的WhatsApp信息
socket.on("whatsapp-info-shared", (shareData) => {
  const contactInfo = shareData.whatsappInfo;
  const message = `
    <div class="whatsapp-share">
      <div class="share-header">📱 ${shareData.from} 分享了WhatsApp联系信息</div>
      <div class="share-content">
        <strong>${contactInfo.displayName}</strong><br>
        ${contactInfo.number}
      </div>
      <button class="whatsapp-chat-btn" data-number="${contactInfo.number}" data-name="${contactInfo.displayName}">
        💬 一键聊天
      </button>
    </div>
  `;

  // 显示为HTML消息
  const wrap = document.createElement("div");
  wrap.className = "msg whatsapp";
  wrap.innerHTML = message;

  // 添加一键聊天功能
  const chatBtn = wrap.querySelector('.whatsapp-chat-btn');
  if (chatBtn) {
    chatBtn.addEventListener('click', () => {
      const whatsappNumber = contactInfo.number.replace(/\D/g, '');
      const whatsappLink = `https://wa.me/${whatsappNumber}`;
      window.open(whatsappLink, '_blank');
      showNotice(`正在打开WhatsApp与 ${contactInfo.displayName} 对话`);
    });
  }

  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// 管理员操作结果监听
socket.on("admin-operation-success", ({ operation, roomId, message, roomInfo }) => {
  showNotice(message);
  if (operation === "clear-room") {
    console.log("房间清除成功:", roomInfo);
  }
});

socket.on("admin-operation-failed", ({ message }) => {
  showNotice(`管理员操作失败: ${message}`);
});

// 图片消息接收
socket.on("image-message", (messageData) => {
  if (messageData.roomId === currentRoomId) {
    displayImageMessage(messageData);
    playTone(660, 0.15, "sine", 0.1);
    showNotice(`收到 ${messageData.from} 的图片`);
  }
});

// 图片发送错误处理
socket.on("image-error", ({ message }) => {
  showNotice(`图片发送失败: ${message}`);
});
