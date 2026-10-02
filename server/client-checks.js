// Only bounded status codes are shared, within the caller's current room.
const CHECK_IDS=['secure','connection','microphone','media','recognition','translation','captions','voice','playback'];
function attachClientChecks(socket,{rooms,io,now=Date.now}) {
  let last=0;
  socket.on('clientChecks',(payload,ack)=>{
    if(typeof ack!=='function')return;
    const roomId=payload?.roomId,room=typeof roomId==='string'?rooms[roomId]:null;
    if(!room||!socket.rooms.has(roomId)||!room.users.some(u=>u.socketId===socket.id))return ack({ok:false,error:'请先加入房间'});
    if(now()-last<1000)return ack({ok:false,error:'检测过于频繁'});
    last=now();
    const checks=Object.fromEntries(CHECK_IDS.map(id=>[id,['pass','fail','pending'].includes(payload?.checks?.[id])?payload.checks[id]:'pending']));
    socket.data.clientChecks={roomId,at:now(),checks};
    const peerId=room.users.find(u=>u.socketId!==socket.id)?.socketId;
    const peer=peerId&&io.sockets.sockets.get(peerId),report=peer?.data.clientChecks;
    const fresh=peer?.connected&&peer.rooms.has(roomId)&&report?.roomId===roomId&&now()-report.at<10000;
    ack({ok:true,peerId:peer?.connected?peerId:null,peer:fresh?report.checks:null});
  });
  socket.on('leaveRoom',()=>{delete socket.data.clientChecks;});
}
module.exports={attachClientChecks,CHECK_IDS};
