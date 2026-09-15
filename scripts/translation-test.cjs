const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTranslator,attachTranslation}=require('../server/translation');
const query={text:'你好',sourceLang:'zh-CN',targetLang:'en-US'};
test('DeepSeek request uses server key, bounded output and disabled thinking',async()=>{
 let body;
 const t=createTranslator({apiKey:'test-secret',fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer test-secret');body=JSON.parse(options.body);
  return {ok:true,json:async()=>({choices:[{message:{content:'Hello'},finish_reason:'stop'}]})};
 }});
 assert.equal(await t.translate(query),'Hello');assert.equal(body.thinking.type,'disabled');assert.equal(body.messages[1].content,'你好');
});
test('missing key, invalid input and billing failure produce useful errors',async()=>{
 await assert.rejects(createTranslator({apiKey:''}).translate(query),/尚未配置/);
 await assert.rejects(createTranslator({apiKey:'test'}).translate({...query,text:'x'.repeat(1201)}),/无效/);
 await assert.rejects(createTranslator({apiKey:'test',fetchImpl:async()=>({ok:false,status:402})}).translate(query),/余额不足/);
});
test('truncated and empty translations are never reported as success',async()=>{
 for(const choice of [{message:{content:''}},{message:{content:'partial'},finish_reason:'length'}]){
  const t=createTranslator({apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({choices:[choice]})})});
  await assert.rejects(t.translate(query));
 }
});
test('network timeout becomes a safe user-facing error',async()=>{
 const t=createTranslator({apiKey:'test',fetchImpl:async()=>{const e=new Error('internal');e.name='TimeoutError';throw e;}});
 await assert.rejects(t.translate(query),/超时/);
});
test('socket membership, cache and in-flight concurrency protect paid translation',async()=>{
 const handlers={},socket={connected:true,on:(n,f)=>handlers[n]=f};let member=false,calls=0,resolve;
 attachTranslation(socket,{isMember:()=>member,translator:{configured:true,translate:()=>{calls++;return new Promise(r=>resolve=r);}}});
 const send=p=>new Promise(r=>handlers.translateSubtitle(p,r));const p={...query,roomId:'test'};
 assert.match((await send(p)).error,/加入房间/);assert.equal(calls,0);
 member=true;const a=send(p);assert.match((await send(p)).error,/过快/);
 resolve('Hello');assert.equal((await a).text,'Hello');assert.equal((await send(p)).text,'Hello');assert.equal(calls,1);
 member=false;assert.match((await send(p)).error,/加入房间/);
});
test('leaving a room while translating cancels delivery',async()=>{
 const h={},s={connected:true,on:(n,f)=>h[n]=f};let member=true,resolve;
 attachTranslation(s,{isMember:()=>member,translator:{translate:()=>new Promise(r=>resolve=r)}});
 const result=new Promise(r=>h.translateSubtitle({...query,roomId:'test'},r));member=false;resolve('Hello');
 assert.match((await result).error,/取消/);
});
