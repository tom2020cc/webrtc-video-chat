const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),io=require('../client/js/socket.io.min.js');
const wait=(s,e,p=()=>true)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{s.off(e,fn);reject(Error('Timeout '+e));},7000);function fn(v){if(p(v)){clearTimeout(timer);s.off(e,fn);resolve(v);}}s.on(e,fn);});
const call=(s,e,v)=>new Promise((resolve,reject)=>{const cb=(err,r)=>err?reject(err):resolve(r);v===undefined?s.timeout(3000).emit(e,cb):s.timeout(3000).emit(e,v,cb);});
test('empty lobby persists across restart and only authenticated owner deletes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'video-lobby-')),clients=[];let child;
 async function start(){child=spawn(process.execPath,['server/app.js'],{env:{...process.env,PORT:'3317',HOST:'127.0.0.1',DATA_DIR:dir,NODE_ENV:'production',ADMIN_PASSWORD:'lobby-test-only'},stdio:['ignore','ignore','pipe']});child.stderr.on('data',()=>{});}
 async function stop(){clients.splice(0).forEach(s=>s.disconnect());if(child){const done=new Promise(r=>child.once('exit',r));child.kill();await done;child=null;}}
 async function connect(){const s=io('http://127.0.0.1:3317',{transports:['websocket'],reconnectionDelay:100});clients.push(s);await wait(s,'peerId');return s;}
 async function login(s){const p=wait(s,'admin-login-success');s.emit('admin-login',{password:'lobby-test-only'});return (await p).token;}
 try{
  await start();const a=await connect();assert.equal((await call(a,'createRoom',{roomId:'persistent',password:'room-secret'})).ok,true);await call(a,'leaveRoom','persistent');
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'rooms.json')));assert.equal(saved[0].id,'persistent');assert.equal(saved[0].users,undefined);
  await stop();await start();const b=await connect(),c=await connect();
  assert.equal((await call(b,'joinRoom',{roomId:'persistent',password:'bad'})).ok,false);assert.equal((await call(b,'joinRoom',{roomId:'persistent',password:'room-secret'})).ok,true);
  let denied=wait(c,'admin-operation-failed');c.emit('admin-clear-room',{roomId:'persistent',token:'fake'});await denied;
  const token=await login(b);const verified=wait(c,'admin-verify-result');c.emit('verify-admin',{token});await verified;
  denied=wait(c,'admin-operation-failed');c.emit('admin-clear-room',{roomId:'persistent',token});await denied;
  const removed=wait(b,'admin-operation-success');b.emit('admin-clear-room',{roomId:'persistent',token});await removed;
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'rooms.json'))).length,0);
  await stop();await start();const d=await connect();assert.equal((await call(d,'joinRoom',{roomId:'persistent'})).ok,false);
  console.log('RESTART_PERSISTENCE_PASSWORD_OWNER_ONLY_DELETE_PASS');
 }finally{await stop();const full=path.resolve(dir);if(full.startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(full,{recursive:true,force:true});}
});
