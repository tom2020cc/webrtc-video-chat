const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('vm');const fs=require('fs');
function setup(){
 const elements=new Map(),timers=[],requests=[],sent=[];
 function el(){const classes=new Set();return {textContent:'',style:{},classList:{add:(...x)=>x.forEach(v=>classes.add(v)),remove:(...x)=>x.forEach(v=>classes.delete(v)),toggle:(x,b)=>b?classes.add(x):classes.delete(x)}};}
 class Speech {start(){this.starts=(this.starts||0)+1;}stop(){this.onend?.();}abort(){}}
 const socket={connected:true,timeout:()=>({emit:(name,p,cb)=>requests.push({name,p,cb})}),emit:(name,p)=>sent.push({name,p})};
 const window={socket,currentRoomId:'room',config:{sourceLang:'zh-CN',targetLang:'en-US',translationApi:'deepseek',autoClearSubtitle:true},SpeechRecognition:Speech};
 const context={window,document:{getElementById:id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout:()=>{},setInterval:()=>0,clearInterval:()=>{}};
 vm.runInNewContext(fs.readFileSync('client/js/subtitles.js','utf8'),context);
 const manager=window.Subtitles.init();manager.start();return {window,manager,requests,sent,elements,timers};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('voice playback suppresses recognition results and resumes only once',()=>{const t=setup(),old=t.manager.engine;t.manager.setPlaybackSuppressed(true);old.onresult({resultIndex:0,results:[Object.assign([{transcript:'回录朗读'}],{isFinal:true})]});assert.equal(t.requests.length,0);t.manager.setPlaybackSuppressed(false);const resumed=t.manager.engine;assert.notEqual(resumed,old);t.manager.setPlaybackSuppressed(false);assert.equal(t.manager.engine,resumed);t.manager.stop();});
test('recognition restarts after end and processes all final results once',async()=>{
 const t=setup();const e=t.manager.engine;e.onend();t.timers.shift()();assert.equal(e.starts,2);
 const results=[Object.assign([{transcript:'你好'}],{isFinal:true}),Object.assign([{transcript:'再见'}],{isFinal:true})];
 e.onresult({resultIndex:0,results});assert.equal(t.requests.length,1);
 t.requests[0].cb(null,{ok:true,text:'Hello'});await settle();assert.equal(t.requests.length,2);
 t.requests[1].cb(null,{ok:true,text:'Goodbye'});await settle();assert.deepEqual(t.sent.map(s=>s.p.originalText),['你好','再见']);
 t.manager.processFinalSubtitle('再见','zh-CN');assert.equal(t.requests.length,2);t.manager.stop();
});
test('late translation cannot overwrite newer speech or leak after leaving',async()=>{
 const t=setup();t.manager.processFinalSubtitle('你好','zh-CN');t.manager.showInterimSubtitle('新的句子');
 t.requests[0].cb(null,{ok:true,text:'Hello'});await settle();
 assert.equal(t.elements.get('subtitleOriginal').textContent,'新的句子');assert.equal(t.elements.get('subtitleTranslated').textContent,'');
 t.manager.processFinalSubtitle('下一句','zh-CN');t.window.currentRoomId='another';t.requests[1].cb(null,{ok:true,text:'Next'});await settle();assert.equal(t.sent.length,1);t.manager.stop();
});
test('translation errors preserve original without fake translation',async()=>{
 const t=setup();t.manager.processFinalSubtitle('测试原文','zh-CN');t.requests[0].cb(null,{ok:false,error:'余额不足'});await settle();
 assert.equal(t.sent[0].p.originalText,'测试原文');assert.equal(t.sent[0].p.translatedText,'');assert.match(t.elements.get('subtitleError').textContent,/余额不足/);t.manager.stop();
});
test('silent recognition times out instead of showing listening forever',()=>{
 const t=setup();t.manager.lastRecognitionAt=Date.now()-19000;t.manager.checkRecognitionHealth();
 assert.match(t.elements.get('subtitleHealthText').textContent,/麦克风/);
 t.manager.lastRecognitionAt=Date.now()-46000;t.manager.checkRecognitionHealth();
 assert.equal(t.manager.isActive,false);assert.match(t.elements.get('subtitleHealthText').textContent,/45秒/);assert.equal(t.requests.length,0);
});
test('microphone activity alone is not reported as successful recognition',()=>{
 const t=setup();t.manager.engine.onaudiostart();t.manager.lastRecognitionAt=Date.now()-19000;t.manager.checkRecognitionHealth();
 assert.match(t.elements.get('subtitleHealthText').textContent,/尚未收到识别文字/);t.manager.stop();
});
test('network failure leaves a persistent alternative and bounded retries',()=>{
 const t=setup(),engine=t.manager.engine;for(let i=0;i<3;i++)engine.onerror({error:'network'});
 assert.equal(t.manager.isActive,false);assert.match(t.elements.get('subtitleHealthText').textContent,/文字翻译仍可使用/);
});
