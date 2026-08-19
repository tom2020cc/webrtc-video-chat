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
  if (merged.theme === undefined) merged.theme = "dark";
  if (merged.sound === undefined) merged.sound = true;
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
socket = io(config.serverUrl, { auth: { nickname: config.nickname } });
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

socket.on("chatMessage", ({ from, text, time }) => {
  appendMessage(from, text, time, false);
  if (from !== config.nickname) playTone(880, 0.08, "sine", 0.07);
});
socket.on("systemMessage", ({ text, time }) => {
  appendMessage(null, text, time, true);
  playTone(520, 0.12, "sine", 0.07);
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
  const password = roomPasswordInput.value.trim();
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

/* ============ 设置面板 ============ */
function openSettings() {
  cfgNickname.value = config.nickname;
  cfgServerUrl.value = config.serverUrl;
  cfgPeerHost.value = config.peerHost;
  cfgPeerPort.value = config.peerPort;
  cfgSecure.checked = config.secure;
  cfgSound.checked = config.sound;
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
raiseHandBtn.addEventListener("click", () => {
  if (!currentRoomId) return;
  handRaised = !handRaised;
  socket.emit("raiseHand", { roomId: currentRoomId, raised: handRaised });
  raiseHandBtn.classList.toggle("on", handRaised);
});
snapshotBtn.addEventListener("click", captureSnapshot);
copyRoomBtn.addEventListener("click", copyRoomId);
emojiBtn.addEventListener("click", () => emojiPanel.classList.toggle("hidden"));
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

cfgSave.addEventListener("click", () => {
  config.nickname = cfgNickname.value.trim() || "匿名用户";
  config.serverUrl = cfgServerUrl.value.trim();
  config.peerHost = cfgPeerHost.value.trim();
  config.peerPort = cfgPeerPort.value.trim();
  config.secure = cfgSecure.checked;
  config.sound = cfgSound.checked;
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

// 键盘快捷键（在输入框内不触发）
window.addEventListener("keydown", (e) => {
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
  if (e.repeat) return;
  switch (e.key.toLowerCase()) {
    case "m": toggleMute(); break;
    case "v": toggleCamera(); break;
    case "s": isSharing ? stopScreenShare() : startScreenShare(); break;
    case "r": if (currentRoomId) raiseHandBtn.click(); break;
  }
});

// 点击弹窗外部关闭
document.querySelectorAll(".modal").forEach((m) => {
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.add("hidden"); });
});

// 页面关闭时清理
window.addEventListener("beforeunload", () => {
  if (currentRoomId) socket.emit("leaveRoom", currentRoomId);
  closeAllCalls();
  if (localStream) localStream.getTracks().forEach((t) => t.stop());
});
