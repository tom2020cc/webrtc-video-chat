// 在宝塔服务器终端运行；密码只从 root 环境文件读取，不打印、不传到浏览器。
const fs=require('fs'),io=require('../client/js/socket.io.min.js');
const [operation='list',roomId,confirmation]=process.argv.slice(2);
if(!['list','delete'].includes(operation)||(operation==='delete'&&(!roomId||confirmation!=='--confirm'))){console.error('用法：node deploy/manage-rooms.cjs list\n删除：node deploy/manage-rooms.cjs delete 房间号 --confirm');process.exit(1);}
let password;
if(operation==='delete'){
 try{const content=fs.readFileSync('/etc/webrtc-video.env','utf8');password=content.split(/\r?\n/).find(line=>line.startsWith('ADMIN_PASSWORD='))?.slice('ADMIN_PASSWORD='.length);if(!password)throw Error('Missing password');if(/^(["']).*\1$/.test(password))password=password.slice(1,-1);}catch{console.error('请在宝塔服务器 root 终端执行，管理员配置不可读取');process.exit(1);}
}
const socket=io('http://127.0.0.1:3100',{transports:['websocket'],reconnection:false});
const timer=setTimeout(()=>finish('操作超时',1),8000);
function finish(message,code=0){if(message)console.log(message);clearTimeout(timer);socket.disconnect();process.exitCode=code;}
socket.on('connect_error',()=>finish('无法连接视频服务',1));
socket.on('roomList',list=>{if(operation==='list')finish(list.length?list.map(r=>`${r.id}  ${r.count}/2${r.hasPassword?'  有密码':''}`).join('\n'):'大厅暂无房间');});
socket.on('peerId',()=>{if(operation==='delete')socket.emit('admin-login',{password});});
socket.on('admin-login-success',({token})=>{password=null;socket.emit('admin-clear-room',{roomId,token,reason:'所有者通过宝塔终端删除'});});
socket.on('admin-login-failed',()=>finish('管理员登录失败，请核对本机访问限制和管理员配置',1));
socket.on('admin-operation-failed',({message})=>finish(message,1));
socket.on('admin-operation-success',({message})=>finish(message));
