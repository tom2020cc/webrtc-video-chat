// 房间成员是在线连接的集合；同一连接最多占一个位置。
function attachRooms(socket,{rooms,io,identity,broadcastList,broadcastUpdate,systemMessage,history,persist=()=>{}}) {
  const validId=id=>typeof id==='string'&&id.trim().length>0&&id.trim().length<=80&&!/[\x00-\x1f]/.test(id)&&!['__proto__','prototype','constructor',socket.id].includes(id.trim());
  const memberRoom=()=>Object.keys(rooms).find(id=>rooms[id].users.some(u=>u.socketId===socket.id));
  function reject(ack,error,event,requestId){if(typeof ack==='function')ack({ok:false,error,requestId});else socket.emit(event||'roomRejected',error);}
  function accept(id,ack,requestId){
    const result={ok:true,roomId:id,requestId,capacity:2};
    socket.emit('roomJoined',result);if(typeof ack==='function')ack(result);
    broadcastUpdate(id);broadcastList();
    if(history(id))socket.emit('chatHistory',{roomId:id,messages:history(id)});
  }
  function prune(id){
    const room=rooms[id];if(!room)return;
    room.users=room.users.filter(u=>{const s=io.sockets.sockets.get(u.socketId);return s?.connected&&s.rooms.has(id);});
  }
  function enter(kind,payload,ack){
    if(!payload||!validId(payload.roomId))return reject(ack,'房间号无效','roomRejected');
    const id=payload.roomId.trim(),requestId=payload.requestId;
    if(!socket.connected)return;
    const existing=memberRoom();
    if(existing&&existing!==id)return reject(ack,'请先退出当前房间','roomRejected',requestId);
    prune(id);
    let room=rooms[id];
    if(room?.users.some(u=>u.socketId===socket.id))return accept(id,ack,requestId);
    if(kind==='create'&&room)return reject(ack,'房间已存在','theRoomExist',requestId);
    if(kind==='join'&&!room)return reject(ack,'房间不存在','theRoomNotExist',requestId);
    if(room?.password&&room.password!==String(payload.password||''))return reject(ack,'房间密码错误','theRoomPasswordWrong',requestId);
    if(room?.users.length>=2)return reject(ack,'房间已满，每个房间最多2人','roomFull',requestId);
    if(!room){
      rooms[id]=room={users:[],password:payload.password?String(payload.password):null,createdAt:Date.now()};
      try{persist();}catch{delete rooms[id];return reject(ack,'房间保存失败，请稍后重试','roomRejected',requestId);}
    }
    room.users.push({socketId:socket.id,...identity()});
    socket.join(id);
    accept(id,ack,requestId);
    systemMessage(id,`${identity().nickname} ${kind==='create'?'创建':'加入'}了房间`);
  }
  function leave(id,reason){
    if(!validId(id)||!rooms[id])return;
    const room=rooms[id],before=room.users.length;
    room.users=room.users.filter(u=>u.socketId!==socket.id);
    socket.leave(id);
    if(room.users.length===before)return;
    systemMessage(id,`${identity().nickname} ${reason}`);broadcastUpdate(id);
    broadcastList();
  }
  socket.on('createRoom',(p,a)=>enter('create',p,a));
  socket.on('joinRoom',(p,a)=>enter('join',p,a));
  socket.on('leaveRoom',(id,ack)=>{leave(id,'离开了房间');if(typeof ack==='function')ack({ok:true});socket.emit('roomLeft',{roomId:id});});
  socket.on('roomSync',ack=>{
    const roomId=memberRoom()||null;
    if(typeof ack==='function')ack({roomId,users:roomId?rooms[roomId].users:[],capacity:2});
  });
  socket.on('disconnecting',()=>{
    for(const id of Object.keys(rooms))if(rooms[id].users.some(u=>u.socketId===socket.id))leave(id,'已断开连接并退出房间');
  });
}
module.exports={attachRooms};
