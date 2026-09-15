// 首次升级仅迁移仍存在的公开房间；有密码的旧内存房间必须先保全密码。
const fs=require('fs'),io=require('../client/js/socket.io.min.js');
const file='/var/lib/webrtc-video/rooms.json';
if(fs.existsSync(file)){console.log('ROOM_REGISTRY_ALREADY_EXISTS');process.exit(0);}
const s=io('http://127.0.0.1:3100',{transports:['websocket'],reconnection:false});
const timer=setTimeout(()=>{console.error('Room migration timed out');s.disconnect();process.exitCode=1;},8000);
s.once('roomList',list=>{clearTimeout(timer);s.disconnect();if(list.some(r=>r.hasPassword)){console.error('PROTECTED_ROOMS_REQUIRE_PASSWORD_PRESERVATION');process.exitCode=1;return;}
fs.writeFileSync(file,JSON.stringify(list.map(r=>({id:r.id,password:null,createdAt:Date.now()})),null,2),{mode:0o600});console.log('EXISTING_ROOMS_PRESERVED',list.length);});
