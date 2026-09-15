/* 系统朗读：显式开启、可恢复失败、严格隔离房间及过期回调。 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),synth=window.speechSynthesis;
 const supported=Boolean(synth&&typeof synth.speak==='function'&&typeof synth.getVoices==='function'&&typeof SpeechSynthesisUtterance==='function');
 const unsupported='此浏览器未提供系统朗读能力。视频和字幕可继续使用；请换用支持系统朗读的浏览器。';
 const languages={'zh-CN':'中文','en-US':'英语','ja-JP':'日语','ko-KR':'韩语','fr-FR':'法语','de-DE':'德语','es-ES':'西班牙语'};
 const samples={'zh-CN':'你好，译文朗读已准备好。','en-US':'Translation voice is ready.','ja-JP':'音声の準備ができました。','ko-KR':'번역 음성이 준비되었습니다.','fr-FR':'La voix est prête.','de-DE':'Die Stimme ist bereit.','es-ES':'La voz está lista.'};
 const female=/\b(huihui|yaoyao|xiaoxiao|xiaoyi|zira|hazel|susan|aria|jenny|samantha|karen|moira|tessa|victoria|haruka|nanami|sunhi|hortense|julie|denise|hedda|katja|helena|sabina|elvira|monica)\b|女声|female/i;
 const male=/\b(kangkang|yunxi|yunjian|yunyang|david|mark|george|guy|ryan|alex|daniel|fred|ichiro|keita|injoon|paul|henri|stefan|conrad|pablo|jorge|alvaro)\b|男声|\bmale\b/i;
 let saved={};try{saved=JSON.parse(localStorage.getItem('videoVoicePreferences'))||{};}catch{}
 const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.max(min,Math.min(max,Number(v))):fallback;
 const prefs={lang:languages[saved.lang]?saved.lang:'zh-CN',gender:['auto','female','male','all'].includes(saved.gender)?saved.gender:'auto',quality:saved.quality==='online'?'online':'local',voice:saved.voice||'',rate:clamp(saved.rate,.7,1.4,1),volume:clamp(saved.volume,.2,1,.8),pitch:clamp(saved.pitch,.8,1.2,1),queue:saved.queue==='ordered'?'ordered':'latest'};
 let enabled=false,queue=[],busy=false,epoch=0,active=null,latest=null,voicePolls=0;
 const seen=new Set();
 const put=(id,value)=>{if($(id))$(id).textContent=value;};
 function status(text){put('voiceReaderStatus',text);put('quickVoiceStatus',text);}
 const save=()=>{try{localStorage.setItem('videoVoicePreferences',JSON.stringify(prefs));}catch{status('设置在本次页面有效，浏览器未允许保存');}};
 function voiceList(){try{return supported?synth.getVoices():[];}catch{return[];}}
 function matchingVoices(){return voiceList().filter(v=>v.lang.toLowerCase().replace('_','-').split('-')[0]===prefs.lang.split('-')[0]).filter(v=>['auto','all'].includes(prefs.gender)||(prefs.gender==='female'?female:male).test(v.name)).sort((a,b)=>Number(b.localService===(prefs.quality==='local'))-Number(a.localService===(prefs.quality==='local')));}
 function refreshVoices(){
  const choices=matchingVoices(),select=$('voiceReaderVoice');select.innerHTML='';
  for(const voice of choices){const o=document.createElement('option');o.value=voice.voiceURI||voice.name;o.textContent=voice.name+(voice.localService?' · 本机':' · 在线');select.appendChild(o);}
  if(!choices.length){const o=document.createElement('option');o.value='';o.textContent='暂无匹配声音';select.appendChild(o);}
  if(!choices.some(v=>(v.voiceURI||v.name)===prefs.voice))prefs.voice=choices[0]?.voiceURI||choices[0]?.name||'';
  select.value=prefs.voice;
  put('voiceReaderAvailability',!supported?unsupported:choices.length?`找到 ${choices.length} 个声音 · ${languages[prefs.lang]}。自动匹配不保证男女声，具体音质以试听为准。`:'暂无匹配声音：点击「自动匹配」重新查找，或安装对应语言语音包。');
  $('voiceReaderPreview').disabled=!choices.length;
  if($('quickVoiceLanguage'))$('quickVoiceLanguage').value=prefs.lang;
  return choices;
 }
 function selectedVoice(){return matchingVoices().find(v=>(v.voiceURI||v.name)===prefs.voice);}
 function sync(){
  $('voiceReaderEnabled').checked=enabled;$('voiceReaderBtn').classList.toggle('on',enabled);
  const quick=$('quickVoiceToggle');if(quick){quick.setAttribute('aria-pressed',String(enabled));quick.classList.toggle('on',enabled);quick.textContent=!supported?'朗读不可用 · 查看原因':enabled?'🔊 朗读已开启':'🔈 开启译文朗读';}
  for(const id of ['voiceReaderReplay','quickVoiceReplay'])if($(id))$(id).disabled=!latest||latest.roomId!==window.currentRoomId;
 }
 function cancel(){epoch++;queue=[];busy=false;const old=active;if(old)old.finish();synth?.cancel?.();}
 function stop(){cancel();enabled=false;latest=null;seen.clear();sync();status('朗读已关闭');}
 function valid(job){return job.epoch===epoch&&job.room===window.currentRoomId&&window.socket?.connected&&(enabled||job.manual);}
 const chunks=text=>Array.from(String(text).trim()).reduce((out,c)=>{if(!out.length||out[out.length-1].length>=140)out.push('');out[out.length-1]+=c;if(/[。！？!?\n]/.test(c)&&out[out.length-1].length>45)out.push('');return out;},[]).filter(s=>s.trim());
 function speak(text,voice,job){return new Promise(resolve=>{
  if(!synth||!voice){resolve(false);return;}
  const run=epoch,u=new SpeechSynthesisUtterance(text),record={finish:null};active=record;
  u.voice=voice;u.lang=prefs.lang;u.rate=prefs.rate;u.volume=prefs.volume;u.pitch=prefs.pitch;
  let finished=false,started=false,startTimer,endTimer;
  const current=()=>!finished&&active===record&&run===epoch&&(!job||valid(job));
  record.finish=(ok=false)=>{if(finished)return;finished=true;clearTimeout(startTimer);clearTimeout(endTimer);if(active===record){window.VoiceAudioGuard?.(false);active=null;}resolve(ok);};
  const fail=message=>{if(!current())return;record.finish();synth.cancel();status(message);};
  startTimer=setTimeout(()=>fail('声音没有启动，请点「重播上一句」或试听；也可换成本机音色'),5000);
  u.onstart=()=>{if(!current())return;started=true;clearTimeout(startTimer);window.VoiceAudioGuard?.(true);if(job&&!job.started){job.started=true;put('voiceReaderTiming',`收到字幕 → 起声 ${((performance.now()-job.at)/1000).toFixed(1)} 秒（不含发送方识别与翻译）`);}status(job?'正在朗读译文…':'正在试听…');endTimer=setTimeout(()=>fail('朗读中断，请点重播或切换音色'),Math.min(60000,Math.max(20000,text.length*550/prefs.rate)));};
  u.onend=()=>{if(!current())return;if(!started){fail('声音未确认启动，请点击试听或重播');return;}record.finish(true);status('朗读完成，等待下一句');};
  u.onerror=e=>{if(!current())return;fail(e.error==='not-allowed'?'声音被浏览器拦截，请点「重播上一句」或试听':`朗读失败（${e.error||'未知'}），请试听或换音色`);};
  try{synth.resume();synth.speak(u);}catch{fail('无法启动声音，请换浏览器或检查系统语音包');}
 });}
 async function waitVoice(job){
  for(let n=0;n<10&&valid(job);n++){refreshVoices();const voice=selectedVoice();if(voice)return voice;if(voiceList().length)break;status('正在加载设备声音…');await new Promise(r=>setTimeout(r,400));}
  return null;
 }
 async function drain(){
  if(busy||active)return;busy=true;const run=epoch;
  try{while(queue.length&&run===epoch){const job=queue.shift();if(!valid(job))continue;
   if(!job.manual&&performance.now()-job.at>20000){status('旧字幕已跳过，可点重播上一句');continue;}
   const voice=await waitVoice(job);if(!valid(job))continue;if(!voice){status('没有匹配声音，请点「自动匹配」或选择其他音色');continue;}
   let text=job.data.targetLang===prefs.lang?job.data.translatedText:job.data.sourceLang===prefs.lang?job.data.originalText:'';
   if(!text){status('正在翻译为'+languages[prefs.lang]+'…');try{const r=await new Promise((resolve,reject)=>window.socket.timeout(12000).emit('translateSubtitle',{roomId:job.room,text:job.data.originalText,sourceLang:job.data.sourceLang||'auto',targetLang:prefs.lang},(e,r)=>e?reject(Error('翻译超时，请重播重试')):resolve(r)));if(!r?.ok)throw Error(r?.error||'翻译失败');text=r.text;}catch(e){if(valid(job))status(e.message);continue;}}
   if(!valid(job))continue;if(!String(text||'').trim()){status('这条字幕没有可朗读的文字');continue;}
   job.data={...job.data,targetLang:prefs.lang,translatedText:text};if(latest?.id===job.data.id)latest=job.data;
   put('voiceReaderText',text);window.MediaUI?.updateTranslation(job.data);
   for(const part of chunks(text)){if(!valid(job)||!await speak(part,voice,job))break;}
  }}finally{if(run===epoch){busy=false;if(queue.length&&!active)drain();}}
 }
 function enqueue(data,manual=false){if(prefs.queue==='latest')queue=[];else if(queue.length>=3)queue.shift();queue.push({data:{...data},room:data.roomId,epoch,at:performance.now(),manual});drain();}
 function receive(data){
  if(!window.currentRoomId||!window.socket?.connected||data.roomId!==window.currentRoomId||data.senderId===window.socket.id||!data.originalText)return;
  if(data.id&&seen.has(data.id))return;if(data.id){seen.add(data.id);if(seen.size>200)seen.delete(seen.values().next().value);}
  latest={...data};sync();if(enabled&&!document.hidden)enqueue(data);
 }
 async function preview(){cancel();refreshVoices();const voice=selectedVoice();if(!voice){status('没有可用声音，请先自动匹配或安装语音包');return;}await speak(samples[prefs.lang],voice);drain();}
 function setEnabled(value){if(value&&!supported){cancel();enabled=false;sync();status(unsupported);return;}cancel();enabled=Boolean(value&&supported);sync();if(enabled){refreshVoices();const voice=selectedVoice();if(voice){status('正在启用声音…');speak(samples[prefs.lang],voice).then(()=>drain());}else status(`朗读已开启，但没有可用的${languages[prefs.lang]}音色；请点齿轮检查本机朗读`);}else status('仅显示字幕，朗读已关闭');}
 function replay(){if(!latest||latest.roomId!==window.currentRoomId){status('还没有对方的新字幕');return;}const data={...latest};cancel();refreshVoices();const voice=selectedVoice();const text=data.targetLang===prefs.lang?data.translatedText:data.sourceLang===prefs.lang?data.originalText:'';
  // 在点击事件中直接起声，给移动浏览器真实的播放手势。
  if(voice&&text){put('voiceReaderText',text);window.MediaUI?.updateTranslation(data);const job={room:data.roomId,epoch,manual:true,at:performance.now()};const parts=chunks(text);busy=true;const run=epoch;(async()=>{try{for(const part of parts){if(!valid(job)||!await speak(part,voice,job))break;}}finally{if(run===epoch){busy=false;drain();}}})();}
  else enqueue(data,true);
 }
 function setPreference(key,value){cancel();put('voiceReaderCapability','');prefs[key]=value;if(['lang','gender','quality'].includes(key))prefs.voice='';refreshVoices();save();status(enabled?'设置已更新，等待对方新字幕，或重播上一句':'设置已保存，点击开启朗读');sync();}
 function open(){refreshVoices();$('voiceReaderModal').classList.remove('hidden');const box=$('voiceReaderModal').querySelector('.modal-box');if(box)box.scrollTop=0;}
 $('voiceReaderBtn').onclick=open;$('voiceReaderClose').onclick=()=>$('voiceReaderModal').classList.add('hidden');
 for(const [id,key] of [['voiceReaderLang','lang'],['voiceReaderGender','gender'],['voiceReaderQuality','quality'],['voiceReaderVoice','voice'],['voiceReaderRate','rate'],['voiceReaderVolume','volume'],['voiceReaderPitch','pitch'],['voiceReaderQueue','queue']]){if(!$(id))continue;$(id).value=prefs[key];$(id).onchange=()=>setPreference(key,['rate','volume','pitch'].includes(key)?Number($(id).value):$(id).value);}
 $('voiceReaderEnabled').onchange=()=>setEnabled($('voiceReaderEnabled').checked);
 $('voiceReaderPreview').onclick=preview;$('voiceReaderStop').onclick=()=>setEnabled(false);
 if($('voiceReaderCheck'))$('voiceReaderCheck').onclick=()=>{refreshVoices();const total=voiceList().length,matching=matchingVoices().length;const result=!supported?unsupported:`本机朗读接口可用；共 ${total} 个系统声音；当前${languages[prefs.lang]} / ${prefs.gender==='auto'?'自动匹配':prefs.gender==='female'?'女声':prefs.gender==='male'?'男声':'全部声音'}匹配 ${matching} 个。${matching?'请点试听确认媒体音量与声音输出。':'请先自动匹配；仍为0时需安装对应语音包或换浏览器。'}`;put('voiceReaderCapability',result);status(result);};
 if($('voiceReaderReplay'))$('voiceReaderReplay').onclick=replay;
 if($('voiceReaderAuto'))$('voiceReaderAuto').onclick=()=>{setPreference('gender','auto');$('voiceReaderGender').value='auto';status('已自动匹配，点击试听检查声音');};
 $('audioDiagnosticsBtn').onclick=async()=>{put('audioDiagnosticsResult','正在采样音频网络（约2秒）…');try{put('audioDiagnosticsResult',await window.getAudioDiagnostics());}catch{put('audioDiagnosticsResult','暂时无法读取，请先建立通话');}};
 function loadVoices(){refreshVoices();if(!voiceList().length&&voicePolls++<8)setTimeout(loadVoices,500);}
 if(supported){synth.addEventListener('voiceschanged',refreshVoices);loadVoices();}else{status(unsupported);$('voiceReaderEnabled').disabled=true;$('voiceReaderPreview').disabled=true;}
 window.VoiceReader={receive,stop,interruptForSpeech:()=>{cancel();status("已暂停本句朗读，可以开始说话");},isSpeaking:()=>Boolean(active),matchingVoices,isEnabled:()=>enabled,setEnabled,replay,open,setLanguage:lang=>{if(languages[lang]){setPreference('lang',lang);$('voiceReaderLang').value=lang;}},chunks};
 window.addEventListener('pagehide',stop);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&enabled){cancel();status('页面在后台，暂停朗读；回到页面后接收新字幕');}else if(enabled){synth?.resume();refreshVoices();status('已返回通话，等待新字幕；没声音可点重播');}});
 sync();
})();
