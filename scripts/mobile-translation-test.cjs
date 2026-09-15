const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
function setup(){
 const map=new Map(),requests=[],sent=[];
 function get(id){if(!map.has(id))map.set(id,{value:'',textContent:'',disabled:false,events:{},classList:{add(){},remove(){}},addEventListener(n,f){this.events[n]=f;}});return map.get(id);}
 const socket={connected:true,timeout:()=>({emit:(n,p,cb)=>requests.push({n,p,cb})}),emit:(n,p)=>sent.push({n,p})};
 const window={currentRoomId:'a',config:{targetLang:'en-US'},socket,Subtitles:{status:async()=>({configured:true})}};
 vm.runInNewContext(fs.readFileSync('client/js/mobile-translation.js','utf8'),{document:{getElementById:get},window});
 get('quickTranslationBtn').events.click();get('quickTranslationInput').value='你好';
 return {get,requests,sent,window};
}
test('mobile translation previews before explicit room broadcast',async()=>{
 const t=setup(),pending=t.get('quickTranslateBtn').events.click();
 t.requests[0].cb(null,{ok:true,text:'Hello'});await pending;assert.equal(t.sent.length,0);
 assert.equal(t.get('quickTranslationResult').textContent,'Hello');t.get('quickTranslationSend').events.click();
 assert.equal(t.sent[0].p.originalText,'你好');assert.equal(t.sent[0].p.translatedText,'Hello');
});
test('editing text or leaving a room cannot send stale translation',async()=>{
 const t=setup(),pending=t.get('quickTranslateBtn').events.click();t.get('quickTranslationInput').events.input();
 t.requests[0].cb(null,{ok:true,text:'Hello'});await pending;t.get('quickTranslationSend').events.click();assert.equal(t.sent.length,0);
 const second=t.get('quickTranslateBtn').events.click();t.window.currentRoomId='b';t.requests[1].cb(null,{ok:true,text:'Hello'});await second;
 assert.match(t.get('quickTranslationResult').textContent,/已离开房间/);assert.equal(t.sent.length,0);
});
