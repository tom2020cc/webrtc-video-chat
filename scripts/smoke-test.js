/* 服务器端到端冒烟测试：验证聊天/图片/转发/管理员/进度透传等关键链路
 * 使用前先启动服务器（npm start），然后运行 npm run smoke-test
 * 直接复用 client/js/socket.io.min.js（UMD 包，Node 可加载），避免引入新依赖 */
const io = require("../client/js/socket.io.min.js");

const URL = process.env.TEST_URL || `http://localhost:${process.env.PORT || 3000}`;
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name}`); }
}
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  // Node 环境没有 XHR，强制 websocket 传输
  const opts = { transports: ["websocket"] };
  const a = io(URL, { ...opts, auth: { nickname: "测试A" } });
  const b = io(URL, { ...opts, auth: { nickname: "测试B" } });
  const c = io(URL, { ...opts, auth: { nickname: "测试C" } });
  await Promise.all([
    new Promise((res) => a.on("connect", res)),
    new Promise((res) => b.on("connect", res)),
    new Promise((res) => c.on("connect", res)),
  ]);
  await wait(300);

  // 1. 基础房间 + 聊天
  console.log("\n[1] 房间与聊天");
  const msgPromise = new Promise((res) => b.on("chatMessage", res));
  a.emit("createRoom", { roomId: "smoke-room" });
  await wait(200);
  b.emit("joinRoom", { roomId: "smoke-room" });
  await wait(200);
  a.emit("chatMessage", { roomId: "smoke-room", text: "<img src=x onerror=alert(1)>你好" });
  const msg = await Promise.race([msgPromise, wait(2000)]);
  check("B 收到 A 的聊天消息", !!msg && msg.text.includes("你好"));

  // 2. 编辑消息
  console.log("\n[2] 消息编辑");
  const editPromise = new Promise((res) => b.on("message-edited", res));
  a.emit("editMessage", { roomId: "smoke-room", messageId: msg.id, newText: "已编辑文本" });
  const edited = await Promise.race([editPromise, wait(2000)]);
  check("B 收到编辑通知且内容正确", !!edited && edited.newText === "已编辑文本");

  // 3. 图片消息全量转发
  console.log("\n[3] 图片消息");
  const imgPromise = new Promise((res) => b.on("image-message", res));
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==" + "A".repeat(2000);
  a.emit("image-message", { roomId: "smoke-room", imageInfo: { imageData: dataUrl, fileName: "t.png", fileSize: 1500, fileType: "image/png", time: Date.now() } });
  const img = await Promise.race([imgPromise, wait(2000)]);
  check("B 收到图片且含完整 imageData", !!img && img.imageData === dataUrl);

  // 4. 历史图片拉取
  console.log("\n[4] 历史图片恢复");
  const imgDataPromise = new Promise((res) => b.on("image-data-response", res));
  b.emit("get-image-data", { messageId: img.id });
  const imgData = await Promise.race([imgDataPromise, wait(2000)]);
  check("get-image-data 返回图片数据", !!imgData && imgData.imageData === dataUrl);

  // 5. 转发消息到另一房间
  console.log("\n[5] 消息转发");
  c.emit("createRoom", { roomId: "smoke-room-2" });
  await wait(200);
  const fwdPromise = new Promise((res) => c.on("chatMessage", res));
  const fwdAckPromise = new Promise((res) => a.on("forward-message-success", res));
  a.emit("forwardMessage", { sourceRoomId: "smoke-room", messageId: msg.id, targetRoomId: "smoke-room-2" });
  const fwd = await Promise.race([fwdPromise, wait(2000)]);
  const fwdAck = await Promise.race([fwdAckPromise, wait(2000)]);
  check("目标房间收到转发消息", !!fwd && fwd.type === "forward" && fwd.text === "已编辑文本");
  check("转发方收到成功回执", !!fwdAck && fwdAck.targetRoom === "smoke-room-2");

  // 6. fileProgress 透传 transferId
  console.log("\n[6] fileProgress 透传");
  const progPromise = new Promise((res) => b.on("fileProgress", res));
  a.emit("fileProgress", { roomId: "smoke-room", transferId: "transfer-xyz", progress: 42 });
  const prog = await Promise.race([progPromise, wait(2000)]);
  check("B 收到进度且 transferId 未丢失", !!prog && prog.transferId === "transfer-xyz" && prog.progress === 42);

  // 7. 管理员登录
  console.log("\n[7] 管理员认证");
  const failPromise = new Promise((res) => a.on("admin-login-failed", res));
  a.emit("admin-login", { password: "wrong" });
  const fail = await Promise.race([failPromise, wait(2000)]);
  check("错误密码被拒绝", !!fail && !!fail.message);
  const okPromise = new Promise((res) => a.on("admin-login-success", res));
  a.emit("admin-login", { password: process.env.ADMIN_PASSWORD || "admin123" });
  const ok = await Promise.race([okPromise, wait(2000)]);
  check("正确密码登录成功且下发令牌/会话", !!ok && !!ok.token && ok.sessionInfo && ok.sessionInfo.duration > 0);

  // 8. 管理员日志
  console.log("\n[8] 管理员日志");
  const logsPromise = new Promise((res) => a.on("admin-logs-response", res));
  a.emit("admin-get-logs", { token: ok.token, limit: 10 });
  const logs = await Promise.race([logsPromise, wait(2000)]);
  check("返回日志数组且含登录记录", !!logs && Array.isArray(logs.logs) && logs.logs.length > 0);
  const badLogsPromise = new Promise((res) => a.on("admin-operation-failed", res));
  a.emit("admin-get-logs", { token: "fake-token", limit: 10 });
  const badLogs = await Promise.race([badLogsPromise, wait(2000)]);
  check("伪造令牌被拒绝", !!badLogs);

  // 9. 管理员清除房间
  console.log("\n[9] 管理员清房");
  const clearedPromise = new Promise((res) => b.on("room-cleared-by-admin", res));
  const forceLeavePromise = new Promise((res) => b.once("force-leave-room", () => res(true)));
  a.emit("admin-clear-room", { roomId: "smoke-room", token: ok.token, reason: "冒烟测试" });
  const cleared = await Promise.race([clearedPromise, wait(2000)]);
  const forceLeft = await Promise.race([forceLeavePromise, wait(2000)]);
  check("房间成员收到清房通知", !!cleared && cleared.reason === "冒烟测试");
  check("房间成员收到强制离开指令", forceLeft === true);

  // 10. 昵称更新系统消息（收集加入后的所有系统消息，避免被加入提示抢占；随机昵称保证可重复运行）
  console.log("\n[10] 昵称更新");
  const sysMessages = [];
  b.on("systemMessage", ({ text }) => sysMessages.push(text));
  const newName = "测试B_" + Math.floor(Math.random() * 100000);
  a.emit("createRoom", { roomId: "smoke-room-3" });
  await wait(200);
  b.emit("joinRoom", { roomId: "smoke-room-3" });
  await wait(400);
  b.emit("updateNickname", { nickname: newName });
  await wait(600);
  check("系统消息显示 旧昵称→新昵称",
    sysMessages.some((t) => t.includes(" 更新了昵称为 " + newName)));

  [a, b, c].forEach((s) => s.close());
  console.log(`\n========== 结果：${passed} 通过，${failed} 失败 ==========`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error("测试脚本异常：", e); process.exit(1); });
