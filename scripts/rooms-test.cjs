const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('http'),{Server}=require('socket.io'),ioClient=require('../client/js/socket.io.min.js'),WebSocket=require('ws');
const {attachRooms}=require('../server/rooms');
const waitFor=(socket,event,condition=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{socket.off(event,listener);reject(Error('Timeout '+event));},3000);function listener(value){if(condition(value)){clearTimeout(timer);socket.off(event,listener);resolve(value);}}socket.on(event,listener);});
const call=(socket,event,value)=>new Promise((resolve,reject)=>{const cb=(error,data)=>error?reject(error):resolve(data);if(value===undefined)socket.timeout(2000).emit(event,cb);else socket.timeout(2000).emit(event,value,cb);});
test('two-person room lifecycle stays authoritative across duplicate joins, contention and lost network',async()=>{
 const server=http.createServer(),io=new Server(server,{pingInterval:100,pingTimeout:250});const rooms=Object.create(null),clients=[];
 const list=()=>io.emit('roomList',Object.entries(rooms).map(([id,r])=>({id,count:r.users.length,capacity:2})));
 io.on('connection',s=>attachRooms(s,{rooms,io,identity:()=>({peerId:s.id,nickname:s.id}),broadcastList:list,broadcastUpdate:id=>{if(rooms[id])io.to(id).emit('roomState',{roomId:id,users:rooms[id].users});},systemMessage:()=>{},history:()=>null}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 async function connect(){const c=ioClient(url,{transports:['websocket'],reconnection:false});clients.push(c);await waitFor(c,'connect');return c;}
 try{
  const a=await connect(),b=await connect(),c=await connect();
  assert.equal((await call(a,'createRoom',{roomId:'pair',password:'secret'})).ok,true);
  assert.equal((await call(b,'joinRoom',{roomId:'pair',password:'bad'})).ok,false);
  const race=await Promise.all([call(b,'joinRoom',{roomId:'pair',password:'secret'}),call(c,'joinRoom',{roomId:'pair',password:'secret'})]);
  assert.equal(race.filter(x=>x.ok).length,1);assert.equal(rooms.pair.users.length,2);
  const joined=race[0].ok?b:c,third=joined===b?c:b;
  assert.equal((await call(joined,'joinRoom',{roomId:'pair',password:'secret'})).ok,true);assert.equal(rooms.pair.users.length,2);
  assert.equal((await call(joined,'createRoom',{roomId:'second'})).ok,false);
  const reduced=waitFor(a,'roomState',s=>s.users.length===1);joined.disconnect();await reduced;assert.equal(rooms.pair.users.length,1);
  assert.equal((await call(third,'joinRoom',{roomId:'pair',password:'secret'})).ok,true);
  await call(third,'leaveRoom','pair');assert.equal((await call(third,'roomSync')).roomId,null);
  // 原始 Engine.IO 客户端只握手/加入，不回应 ping，模拟断网而非主动关闭。
  const raw=new WebSocket(url.replace('http','ws')+'/socket.io/?EIO=4&transport=websocket');
  const two=waitFor(a,'roomState',s=>s.users.length===2);
  raw.on('message',bytes=>{const p=bytes.toString();if(p[0]==='0')raw.send('40');else if(p.startsWith('40'))raw.send('42'+JSON.stringify(['joinRoom',{roomId:'pair',password:'secret'}]));});
  await two;const one=waitFor(a,'roomState',s=>s.users.length===1);await one;assert.equal(rooms.pair.users.length,1);raw.terminate();
  await call(a,'leaveRoom','pair');assert.equal(rooms.pair.users.length,0);
  assert.equal(rooms.pair.password,'secret');
  assert.equal((await call(a,'createRoom',{roomId:'pair'})).ok,false);
  assert.equal((await call(a,'joinRoom',{roomId:'pair',password:'bad'})).ok,false);
  assert.equal((await call(a,'joinRoom',{roomId:'pair',password:'secret'})).ok,true);
  assert.equal((await call(a,'createRoom',{roomId:'__proto__'})).ok,false);
  console.log('ROOM_CAPACITY_DISCONNECT_EMPTY_ROOM_RETAINED_OK');
 }finally{clients.forEach(s=>s.disconnect());await new Promise(r=>io.close(r));server.close();}
});
