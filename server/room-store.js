const fs=require('fs'),path=require('path');
function loadRooms(file){
 const rooms=Object.create(null);if(!fs.existsSync(file))return rooms;
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!Array.isArray(data))throw Error('Invalid room registry');
 for(const room of data){if(typeof room.id!=='string'||!room.id.trim()||['__proto__','prototype','constructor'].includes(room.id))throw Error('Invalid saved room');rooms[room.id]={users:[],password:room.password||null,createdAt:room.createdAt||Date.now()};}
 return rooms;
}
function saveRooms(file,rooms){
 const data=Object.entries(rooms).map(([id,r])=>({id,password:r.password||null,createdAt:r.createdAt||Date.now()}));
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,2),{mode:0o600});fs.renameSync(file+'.tmp',file);
}
module.exports={loadRooms,saveRooms};
