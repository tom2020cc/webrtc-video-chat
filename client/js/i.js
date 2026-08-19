/* ============ 环境配置 ============ */
const CONFIG_KEY = "upWebRTCConfig";
const PRESETS = {
  local: { env: "local", serverUrl: "http://localhost:3000", peerHost: "localhost", peerPort: "9000", secure: false, path: "/peerjs", nickname: "" },
  prod:  { env: "prod",  serverUrl: "https://www.howfq.icu", peerHost: "www.howfq.icu", peerPort: "", secure: true, path: "/peerjs", nickname: "" },
};

function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch (e) { cfg = {}; }
  const merged = Object.assign({}, PRESETS.local, cfg);
  merged.path = merged.path || "/peerjs";
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
const currentRoomIdDisplay = document.getElementById("currentRoomId");
const videoContainer = document.getElementById("videoContainer");
const roomControls = document.getElementById("roomControls");
const roomIdInput = document.getElementById("roomId");
const createRoomBtn = document.getElementById("createRoomBtn");
const inRoomChip = document.getElementById("inRoomChip");
const roomListEl = document.getElementById("roomList");
const memberCount = document.getElementById("memberCount");
const memberList = document.getElementById("memberList");
const chatMessages = document.getElementById("chatMessages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatSendBtn = document.getElementById("chatSendBtn");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const screenBtn = document.getElementById("screenBtn");
const hangupBtn = document.getElementById("hangupBtn");
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const cfgNickname = document.getElementById("cfgNickname");
const cfgServerUrl = document.getElementById("cfgServerUrl");
const cfgPeerHost = document.getElementById("cfgPeerHost");
const cfgPeerPort = document.getElementById("cfgPeerPort");
const cfgSecure = document.getElementById("cfgSecure");
const cfgSave = document.getElementById("cfgSave");
const cfgCancel = document.getElementById("cfgCancel");
const cfgClose = document.getElementById("cfgClose");
const presetLocal = document.getElementById("presetLocal");
const presetProd = document.getElementById("presetProd");

/* ============ 全局状态 ============ */
let socket = null;
let peer = null;
let userPeerId = null;        // 当前用户 PeerID
let localStream = null;       // 本地视频流
let currentRoomId = null;     // 当前房间号
let screenStream = null;      // 屏幕共享流
let screenTrack = null;       // 屏幕共享视频轨
let isSharing = false;
let isMuted = false;
let isCameraOff = false;
const calls = new Map();       // peerId -> call，用于去重连接
const memberNames = new Map(); // peerId -> nickname

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

/* ============ Socket 初始化 ============ */
socket = io(config.serverUrl, { auth: { nickname: config.nickname } });
userNicknameDisplay.textContent = config.nickname;

socket.on("connect_error", () => {
  showNotice("无法连接服务器，请在「设置」中检查环境配置");
});

// 收到服务端下发的 PeerID
socket.on("peerId", (peerId) => {
  userPeerId = peerId;
  userPeerIdDisplay.textContent = peerId;
  initializePeer();
  initLocalStream(); // 初始化本地音视频
});

socket.on("theRoomExist", (msg) => { alert(msg); resetRoomUI(); });
socket.on("theRoomNotExist", (msg) => { alert(msg); resetRoomUI(); });

// 房间列表更新
socket.on("roomList", (list) => {
  roomListEl.innerHTML = "";
  if (!list || list.length === 0) {
    roomListEl.innerHTML = '<span class="room-empty">暂无房间</span>';
    return;
  }
  list.forEach((roomId) => {
    const btn = document.createElement("button");
    btn.className = "room-btn";
    btn.textContent = `进入 ${roomId}`;
    btn.addEventListener("click", () => joinRoom(roomId));
    roomListEl.appendChild(btn);
  });
});

// 房间内成员更新
socket.on("roomUpdate", (users) => {
  renderMembers(users);
  updateVideoPeers(users);
});

// 聊天消息 / 系统消息
socket.on("chatMessage", ({ from, text, time }) => appendMessage(from, text, time, false));
socket.on("systemMessage", ({ text, time }) => appendMessage(null, text, time, true));

/* ============ Peer 初始化 ============ */
function initializePeer() {
  const opts = { host: config.peerHost, path: config.path, secure: config.secure };
  if (config.peerPort && config.peerPort !== "") opts.port = parseInt(config.peerPort, 10);

  peer = new Peer(userPeerId, opts);

  // 接听来电（独立于本地流，避免 getUserMedia 失败时无法接听）
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
    video.autoplay = true; video.playsInline = true; video.muted = true; // 静音本地，防回声
    const label = document.createElement("span");
    label.className = "label me";
    label.textContent = `我 · ${config.nickname}`;
    tile.appendChild(video);
    tile.appendChild(label);
    videoContainer.appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
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
    tile.appendChild(video);
    tile.appendChild(label);
    videoContainer.appendChild(tile);
  }
  tile.querySelector("video").srcObject = stream;
  tile.querySelector(".label").textContent = memberNames.get(peerId) || peerId;
}

function removeRemoteVideo(peerId) {
  const tile = document.getElementById(`tile-${peerId}`);
  if (tile) tile.remove();
}

/* ============ 通话管理（去重连接） ============ */
function registerCall(peerId, call) {
  calls.set(peerId, call);
  call.on("stream", (remoteStream) => displayRemoteVideo(peerId, remoteStream));
  call.on("close", () => { calls.delete(peerId); removeRemoteVideo(peerId); });
  call.on("error", () => { calls.delete(peerId); removeRemoteVideo(peerId); });
  // 若正在屏幕共享，新连接也要换成屏幕画面
  if (screenTrack) replaceVideoTrackOn(call, screenTrack);
}

// 房间内每个成员，只由 PeerID 较小的一方发起连接，避免重复连接
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
function renderMembers(users) {
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
    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = (u.nickname || "?").slice(0, 1);
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = u.nickname;
    li.appendChild(avatar);
    li.appendChild(name);
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

function appendMessage(from, text, time, isSystem) {
  const wrap = document.createElement("div");
  if (isSystem) {
    wrap.className = "msg system";
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(bubble);
  } else {
    wrap.className = "msg" + (from === config.nickname ? " mine" : "");
    const meta = document.createElement("div");
    meta.className = "meta-line";
    meta.textContent = `${from} · ${formatTime(time)}`;
    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.textContent = text;
    wrap.appendChild(meta);
    wrap.appendChild(bubble);
  }
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

/* ============ 房间逻辑 ============ */
function setRoomState(inRoom) {
  roomControls.classList.toggle("hidden", inRoom);
  inRoomChip.classList.toggle("hidden", !inRoom);
  roomListEl.classList.toggle("hidden", inRoom);
  hangupBtn.disabled = !inRoom;
  chatSendBtn.disabled = !inRoom;
  if (inRoom) inRoomChip.textContent = `🏠 当前房间：${currentRoomId}`;
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
  if (!localStream) await initLocalStream();
  socket.emit("createRoom", roomId);
  currentRoomId = roomId;
  currentRoomIdDisplay.textContent = roomId;
  roomIdInput.value = "";
  setRoomState(true);
});

async function joinRoom(roomId) {
  if (currentRoomId) { alert("请先离开当前房间"); return; }
  if (!localStream) await initLocalStream();
  socket.emit("joinRoom", roomId);
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
  setRoomState(false);
}

function stopLocalStream() {
  if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
  if (screenStream) { screenStream.getTracks().forEach((t) => t.stop()); }
  screenStream = null; screenTrack = null; isSharing = false;
  screenBtn.classList.remove("on");
  screenBtn.querySelector(".txt").textContent = "共享屏幕";
  isMuted = false; isCameraOff = false;
  muteBtn.classList.remove("on"); muteBtn.querySelector(".ico").textContent = "🎙️"; muteBtn.querySelector(".txt").textContent = "静音";
  cameraBtn.classList.remove("on"); cameraBtn.querySelector(".ico").textContent = "📷"; cameraBtn.querySelector(".txt").textContent = "关摄像头";
}

function resetVideoContainer() {
  videoContainer.innerHTML = "";
  const ph = document.createElement("div");
  ph.className = "video-placeholder";
  ph.id = "videoPlaceholder";
  ph.innerHTML = '<div class="ph-icon">🎬</div><p>创建或加入房间后，这里将显示视频画面</p>';
  videoContainer.appendChild(ph);
}

/* ============ 通话控制 ============ */
function toggleMute() {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  isMuted = !track.enabled;
  muteBtn.classList.toggle("on", isMuted);
  muteBtn.querySelector(".ico").textContent = isMuted ? "🔇" : "🎙️";
  muteBtn.querySelector(".txt").textContent = isMuted ? "取消静音" : "静音";
}

function toggleCamera() {
  if (!localStream) return;
  const track = localStream.getVideoTracks()[0];
  if (!track) return;
  track.enabled = !track.enabled;
  isCameraOff = !track.enabled;
  cameraBtn.classList.toggle("on", isCameraOff);
  cameraBtn.querySelector(".ico").textContent = isCameraOff ? "🚫" : "📷";
  cameraBtn.querySelector(".txt").textContent = isCameraOff ? "打开摄像头" : "关摄像头";
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
    if (localVideo) localVideo.srcObject = screenStream; // 本地预览显示屏幕
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

/* ============ 设置面板 ============ */
function openSettings() {
  cfgNickname.value = config.nickname;
  cfgServerUrl.value = config.serverUrl;
  cfgPeerHost.value = config.peerHost;
  cfgPeerPort.value = config.peerPort;
  cfgSecure.checked = config.secure;
  updatePresetActive();
  settingsModal.classList.remove("hidden");
}
function closeSettings() { settingsModal.classList.add("hidden"); }

function updatePresetActive() {
  presetLocal.classList.toggle("active", config.env === "local");
  presetProd.classList.toggle("active", config.env === "prod");
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

/* ============ 事件绑定 ============ */
muteBtn.addEventListener("click", toggleMute);
cameraBtn.addEventListener("click", toggleCamera);
screenBtn.addEventListener("click", () => { isSharing ? stopScreenShare() : startScreenShare(); });
hangupBtn.addEventListener("click", leaveRoom);
settingsBtn.addEventListener("click", openSettings);
cfgClose.addEventListener("click", closeSettings);
cfgCancel.addEventListener("click", closeSettings);
presetLocal.addEventListener("click", () => applyPreset("local"));
presetProd.addEventListener("click", () => applyPreset("prod"));

cfgSave.addEventListener("click", () => {
  config.nickname = cfgNickname.value.trim() || "匿名用户";
  config.serverUrl = cfgServerUrl.value.trim();
  config.peerHost = cfgPeerHost.value.trim();
  config.peerPort = cfgPeerPort.value.trim();
  config.secure = cfgSecure.checked;
  config.env = /localhost|127\.0\.0\.1/.test(config.peerHost + config.serverUrl) ? "local" : "prod";
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  location.reload();
});

chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  if (!currentRoomId) { showNotice("请先加入房间"); return; }
  socket.emit("chatMessage", { roomId: currentRoomId, text });
  chatInput.value = "";
});

// 页面关闭时清理
window.addEventListener("beforeunload", () => {
  if (currentRoomId) socket.emit("leaveRoom", currentRoomId);
  closeAllCalls();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
});
