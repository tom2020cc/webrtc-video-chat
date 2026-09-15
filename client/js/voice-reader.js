/* 系统语音库朗读：只处理对方当前房间的新字幕，用户主动开启。 */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),synth=window.speechSynthesis;
 const languages={'zh-CN':'中文','en-US':'英语','ja-JP':'日语','ko-KR':'韩语','fr-FR':'法语','de-DE':'德语','es-ES':'西班牙语'};
 const samples={'zh-CN':'你好，这是翻译朗读试听。','en-US':'Hello, this is a translation voice preview.','ja-JP':'こんにちは。音声のテストです。','ko-KR':'안녕하세요. 음성 테스트입니다.','fr-FR':'Bonjour, ceci est un essai de voix.','de-DE':'Hallo, dies ist eine Sprachprobe.','es-ES':'Hola, esta es una prueba de voz.'};
 const female=/\b(huihui|yaoyao|xiaoxiao|xiaoyi|zira|hazel|susan|aria|jenny|samantha|karen|moira|tessa|victoria|haruka|nanami|sunhi|hortense|julie|denise|hedda|katja|helena|sabina|elvira|monica)\b|女声|female/i;
 const male=/\b(kangkang|yunxi|yunjian|yunyang|david|mark|george|guy|ryan|alex|daniel|fred|ichiro|keita|injoon|paul|henri|stefan|conrad|pablo|jorge|alvaro)\b|男声|\bmale\b/i;
 let saved={};try{saved=JSON.parse(localStorage.getItem('videoVoicePreferences'))||{};}catch{}
 const prefs={lang:languages[saved.lang]?saved.lang:'zh-CN',gender:['female','male','all'].includes(saved.gender)?saved.gender:'female',quality:saved.quality==='online'?'online':'local',voice:saved.voice||'',rate:Number(saved.rate)||1,volume:Number.isFinite(saved.volume)?saved.volume:.8};
 let enabled=false,queue=[],busy=false,epoch=0,lastId=null,activeUtterance=null,finishSpeech=null;
 const status=text=>{$('voiceReaderStatus').textContent=text;};
 const save=()=>localStorage.setItem('videoVoicePreferences',JSON.stringify(prefs));
 function matchingVoices(){return (synth?.getVoices()||[]).filter(v=>v.lang.toLowerCase().split('-')[0]===prefs.lang.toLowerCase().split('-')[0]).filter(v=>prefs.gender==='all'||(prefs.gender==='female'?female:male).test(v.name)).sort((a,b)=>Number(b.localService===(prefs.quality==='local'))-Number(a.localService===(prefs.quality==='local')));}
 function refreshVoices(){
   const choices=matchingVoices(),select=$('voiceReaderVoice');select.innerHTML='';
   for(const voice of choices){const option=document.createElement('option');option.value=voice.voiceURI||voice.name;option.textContent=voice.name+(voice.localService?' · 本机':' · 在线');select.appendChild(option);}
   if(!choices.length){const option=document.createElement('option');option.value='';option.textContent='此语言/性别暂无可用声音';select.appendChild(option);}
   if(choices.some(v=>(v.voiceURI||v.name)===prefs.voice))select.value=prefs.voice;
   else prefs.voice=choices[0]?.voiceURI||choices[0]?.name||'';
   $('voiceReaderAvailability').textContent=choices.length?`有 ${choices.length} 个可选音色。实际音质由系统声音决定；在线声音需要网络。`:'系统未提供匹配音色。可选“全部声音”试听，或在设备上安装对应语言语音包；不会冒充指定男女声。';
   $('voiceReaderPreview').disabled=!choices.length;
 }
 function selectedVoice(){return matchingVoices().find(v=>(v.voiceURI||v.name)===prefs.voice);}
 function stop(){epoch++;queue=[];busy=false;synth?.cancel();finishSpeech?.();window.VoiceAudioGuard?.(false);activeUtterance=null;}
 function valid(job){return enabled&&job.epoch===epoch&&job.room===window.currentRoomId&&window.socket?.connected;}
 function speak(text,voice,job){return new Promise(resolve=>{
   const utterance=new SpeechSynthesisUtterance(text);activeUtterance=utterance;utterance.voice=voice;utterance.lang=prefs.lang;utterance.rate=Math.max(.7,Math.min(1.4,prefs.rate));utterance.volume=Math.max(0,Math.min(1,prefs.volume));
   let finished=false;
   const done=()=>{if(finished)return;finished=true;clearTimeout(timer);window.VoiceAudioGuard?.(false);if(activeUtterance===utterance)activeUtterance=null;if(finishSpeech===done)finishSpeech=null;resolve();};finishSpeech=done;
   const timer=setTimeout(()=>{if(activeUtterance===utterance)synth.cancel();status('朗读超时，已停止；请检查系统声音或换成本机音色');done();},20000);
   utterance.onstart=()=>{if(job&&!valid(job)){synth.cancel();done();return;}window.VoiceAudioGuard?.(true);const ms=job?Math.round(performance.now()-job.at):null;if(ms!==null)$('voiceReaderTiming').textContent=`最近一次：收到字幕→起声 ${(ms/1000).toFixed(1)} 秒（不含发送方语音识别和翻译耗时）${ms>3000?'，超过3秒目标':''}`;status(ms===null?'正在试听…':'正在朗读…');};
   utterance.onend=()=>{done();if(!job||valid(job))status('朗读完成');};
   utterance.onerror=event=>{done();if(!job||valid(job))status(event.error==='not-allowed'?'浏览器阻止朗读，请点击试听后再开启':'朗读失败，请检查设备语音包或切换音色');};
   try{synth.speak(utterance);}catch{done();status('此浏览器无法启动朗读');}
 });}
 async function drain(){
   if(busy)return;busy=true;const run=epoch;
   try{while(queue.length&&run===epoch){const job=queue.shift();if(!valid(job)||performance.now()-job.at>8000)continue;
     const voice=selectedVoice();if(!voice){status('没有匹配声音，请打开朗读设置选择可用音色');continue;}
     let text=job.data.targetLang===prefs.lang?job.data.translatedText:job.data.sourceLang===prefs.lang?job.data.originalText:'';
     if(!text){status('正在翻译为'+languages[prefs.lang]+'…');try{const response=await new Promise((resolve,reject)=>window.socket.timeout(12000).emit('translateSubtitle',{roomId:job.room,text:job.data.originalText,sourceLang:job.data.sourceLang||'auto',targetLang:prefs.lang},(err,r)=>err?reject(Error('翻译超时')):resolve(r)));if(!response?.ok)throw Error(response?.error||'翻译失败');text=response.text;}catch(e){if(valid(job))status(e.message);continue;}}
     if(!valid(job)||performance.now()-job.at>10000)continue;
     $('voiceReaderText').textContent=text;await speak(text,voice,job);
   }}finally{if(run===epoch)busy=false;}
 }
 function receive(data){if(!enabled||!window.currentRoomId||data.roomId!==window.currentRoomId||data.id===lastId)return;lastId=data.id;const job={data,room:data.roomId,epoch,at:performance.now()};if(queue.length>=2)queue.shift();queue.push(job);drain();}
 function open(){refreshVoices();$('voiceReaderModal').classList.remove('hidden');}
 $('voiceReaderBtn').onclick=open;$('voiceReaderClose').onclick=()=>$('voiceReaderModal').classList.add('hidden');
 $('voiceReaderLang').value=prefs.lang;$('voiceReaderGender').value=prefs.gender;$('voiceReaderQuality').value=prefs.quality;$('voiceReaderRate').value=prefs.rate;$('voiceReaderVolume').value=prefs.volume;
 for(const [id,key] of [['voiceReaderLang','lang'],['voiceReaderGender','gender'],['voiceReaderQuality','quality'],['voiceReaderVoice','voice'],['voiceReaderRate','rate'],['voiceReaderVolume','volume']])$(id).onchange=()=>{stop();prefs[key]=['rate','volume'].includes(key)?Number($(id).value):$(id).value;if(key!=='voice')refreshVoices();save();};
 $('voiceReaderEnabled').onchange=()=>{stop();enabled=$('voiceReaderEnabled').checked&&Boolean(synth);$('voiceReaderEnabled').checked=enabled;$('voiceReaderBtn').classList.toggle('on',enabled);status(enabled?'朗读已开启，等待对方的新字幕；建议戴耳机':'朗读已关闭');synth?.resume();};
 $('voiceReaderPreview').onclick=()=>{stop();const voice=selectedVoice();if(voice)speak(samples[prefs.lang],voice);};
 $('voiceReaderStop').onclick=()=>{stop();enabled=false;$('voiceReaderEnabled').checked=false;$('voiceReaderBtn').classList.remove('on');status('朗读已关闭');};
 $('audioDiagnosticsBtn').onclick=async()=>{const text=$('audioDiagnosticsResult');text.textContent='正在采样音频网络（约2秒）…';try{text.textContent=await window.getAudioDiagnostics();}catch{text.textContent='暂时无法读取音频统计，请先建立通话';}};
 if(synth){synth.addEventListener('voiceschanged',refreshVoices);refreshVoices();}else{status('此浏览器不支持系统朗读');$('voiceReaderEnabled').disabled=true;$('voiceReaderPreview').disabled=true;}
 window.VoiceReader={receive,stop,isSpeaking:()=>Boolean(activeUtterance),matchingVoices};
 window.addEventListener('pagehide',stop);
})();
