const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const { PeerServer } = require("peer");
const { v4: uuidv4 } = require("uuid"); // 用于生成唯一的 PeerID

const app = express();
app.use(cors()); // 配置 CORS，允许来自任意源的请求
app.use(express.static("client"));
app.get("/", (req, res) => { res.sendFile(__dirname + "/client/index.html") });
app.get("/hi", (req, res) => { res.send("<h1>Hello Dear</h1>") });

const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*", methods: ["GET", "POST"] } }); // 创建 Socket.IO 实例
const peerServer = PeerServer({ port: 9000, path: "/peerjs" }); // 配置 PeerJS 服务器

let rooms = {}; // 存储房间信息：roomId -> { users: [{socketId, peerId, nickname}] }

// 广播所有房间号
function broadcastRoomList() {
  io.emit("roomList", Object.keys(rooms));
}

// 广播某个房间内的用户列表
function broadcastRoomUpdate(roomId) {
  if (rooms[roomId]) io.to(roomId).emit("roomUpdate", rooms[roomId].users);
}

// 房间为空时清理，避免残留幽灵房间
function cleanupEmptyRoom(roomId) {
  if (rooms[roomId] && rooms[roomId].users.length === 0) {
    delete rooms[roomId];
    broadcastRoomList();
  }
}

// 向房间发送系统消息（加入/离开提示）
function systemMessage(roomId, text) {
  io.to(roomId).emit("systemMessage", { text, time: Date.now() });
}

io.on("connection", (socket) => {
  const peerId = uuidv4(); // 为每个用户生成一个唯一的 PeerID
  const nickname = (socket.handshake.auth && socket.handshake.auth.nickname) || "匿名用户";
  socket.data.nickname = nickname; // 记录当前连接的昵称
  console.log(`用户连接：${socket.id}，PeerID=${peerId}，昵称=${nickname}`);

  socket.emit("peerId", peerId); // 向客户端发送 PeerID
  socket.emit("roomList", Object.keys(rooms)); // 发送当前所有房间号

  socket.on("createRoom", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [] };
      rooms[roomId].users.push({ socketId: socket.id, peerId, nickname });
      socket.join(roomId);
      broadcastRoomList();
      broadcastRoomUpdate(roomId);
      systemMessage(roomId, `${nickname} 创建了房间`);
    } else {
      socket.emit("theRoomExist", "房间已存在");
    }
  });

  socket.on("joinRoom", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].users.push({ socketId: socket.id, peerId, nickname });
      socket.join(roomId);
      systemMessage(roomId, `${nickname} 加入了房间`);
      broadcastRoomUpdate(roomId);
    } else {
      socket.emit("theRoomNotExist", "房间不存在");
    }
  });

  socket.on("leaveRoom", (roomId) => {
    if (rooms[roomId]) {
      const before = rooms[roomId].users.length;
      rooms[roomId].users = rooms[roomId].users.filter((user) => user.socketId !== socket.id);
      if (rooms[roomId].users.length < before) {
        socket.leave(roomId);
        systemMessage(roomId, `${nickname} 离开了房间`);
      }
      if (rooms[roomId].users.length === 0) {
        delete rooms[roomId];
        broadcastRoomList();
      } else {
        broadcastRoomUpdate(roomId);
      }
    }
  });

  // 聊天消息：服务端转发到房间内所有人
  socket.on("chatMessage", ({ roomId, text }) => {
    if (rooms[roomId] && socket.rooms.has(roomId)) {
      io.to(roomId).emit("chatMessage", { from: socket.data.nickname, text, time: Date.now() });
    }
  });

  socket.on("disconnect", () => {
    // 只遍历当前 socket 加入过的房间（socket.rooms 含自身私有房间 id，会被过滤掉）
    socket.rooms.forEach((roomId) => {
      if (rooms[roomId]) {
        rooms[roomId].users = rooms[roomId].users.filter((user) => user.socketId !== socket.id);
        if (rooms[roomId].users.length === 0) {
          delete rooms[roomId];
          broadcastRoomList();
        } else {
          systemMessage(roomId, `${socket.data.nickname} 离开了房间`);
          broadcastRoomUpdate(roomId);
        }
      }
    });
  });
});

server.listen(3000, () => { console.log("服务器启动，监听端口 3000") });
