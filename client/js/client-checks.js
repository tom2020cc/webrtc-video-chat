/* Evidence is scoped to this connection, room, languages and selected voice. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id),ttl=120000;
 const labels={secure:'安全网页',connection:'房间与服务器',microphone:'通话麦克风',media:'音视频连接',recognition:'本机语音识别',translation:'DeepSeek 实际翻译',captions:'收到对方实时字幕',voice:'目标语言与音色',playback:'朗读开启与听音确认'};
 const words={pass:'通过',fail:'未通过',pending:'待检测'};
 let connectionError='',evidence={},scope='',peerId=null,peerReport=null,peerAt=0,connectionAt=0,checking=false,running=false,completedAt=0,lastRows={};
 function context(){return JSON.stringify([window.socket?.id,window.currentRoomId,window.config?.sourceLang,window.config?.targetLang,window.config?.translationApi,window.config?.aiEnabled,window.VoiceReader?.health().key,window.VoiceReader?.isEnabled?.(),window.Subtitles?.isRunning()]);}
 function reset(){connectionError='';evidence={};peerReport=null;peerAt=0;connectionAt=0;completedAt=0;$('checksHeard').disabled=true;}
 function ensure(){const next=context();if(scope!==next){scope=next;reset();}return next;}
 function record(id,state,detail){ensure();if(!window.currentRoomId||!window.socket?.connected)return;evidence[id]={state,detail,at:Date.now()};render();}
 function recent(id,fallback){const e=evidence[id];return e&&Date.now()-e.at<ttl?e:fallback;}
 const row=(state,detail)=>({state,detail});
 function read(){
  ensure();const s=window.socket,room=window.currentRoomId,m=window.getClientMediaState?.()||{},v=window.VoiceReader?.health()||{},connected=Boolean(room&&s?.connected),list=m.peers||[];
  const nextPeer=list[0]||null;if(peerId!==nextPeer){peerId=nextPeer;peerReport=null;peerAt=0;delete evidence.captions;}
  const pending=detail=>row('pending',detail),fail=detail=>row('fail',detail);
  return {
   secure:row(window.isSecureContext?'pass':'fail',window.isSecureContext?'安全上下文可用':'请使用 HTTPS，浏览器可能禁止麦克风'),
   connection:!connected?fail('请先加入房间；断网后需重新加入'):connectionError?fail(connectionError):Date.now()-connectionAt<10000?row('pass','已收到服务器本房间检测应答'):pending('等待服务器应答'),
   microphone:!connected?fail('加入房间后检测'):m.muted?fail('当前已静音，请取消静音'):row(m.microphone?'pass':'fail',m.microphone?'麦克风音轨可用；识别文字另行实测':'未取得有效麦克风，请检查权限并重新加入'),
   media:row(m.media&&connected?'pass':'fail',m.media&&connected?'音视频传输连接已建立（不代表画面或声音已播放）':'等待对方加入并建立音视频连接'),
   recognition:!connected?fail('请先加入房间'):!window.config?.aiEnabled?fail('请在环境设置开启 AI 字幕'):!(window.SpeechRecognition||window.webkitSpeechRecognition)?fail('浏览器不支持语音识别，可用文字 / 输入法翻译'):!window.Subtitles?.isRunning()?fail('语音字幕未开启，请点击上方开启字幕'):recent('recognition',pending('已启动，尚未识别出文字；请按「我说」的语言说一句')),
   translation:!connected?fail('加入房间后点击检测翻译服务'):window.config?.translationApi==='none'?fail('翻译已关闭，请在环境设置开启'):recent('translation',pending('尚未发起真实翻译请求')),
   captions:!connected||!peerId?fail('等待对方加入并说话'):recent('captions',pending('等待对方的新字幕；历史记录不算通过')),
   voice:!v.supported?fail('浏览器未提供系统朗读接口，需更换支持的浏览器'):row(v.count?'pass':'fail',v.count?`${v.lang} 匹配 ${v.count} 个音色；请继续试听`:`${v.lang} 暂无匹配声音，自动匹配、安装语音包或更换浏览器`),
   playback:!connected?fail('加入房间后试听并确认'):!v.enabled?fail('译文朗读已关闭，请在声音设置中开启'):!v.count?fail('缺少匹配音色，无法朗读'):recent('playback',pending('请试听，再点击「我已听到试听声音」'))
  };
 }
 function render(){
  const rows=read();lastRows=rows;const fresh=Date.now()-peerAt<10000&&Boolean(peerId),all=Object.values(rows).every(r=>r.state==='pass'),remote=fresh&&peerReport&&Object.keys(labels).every(id=>peerReport[id]==='pass');
  const failed=Object.values(rows).filter(r=>r.state==='fail').length,passed=Object.values(rows).filter(r=>r.state==='pass').length;
  $('clientChecksOpen').textContent=`● 互译检测 · 本机 ${passed}/${Object.keys(labels).length} 项通过${failed?' · '+failed+' 项红灯':''}${all&&remote?' · 双方近期实测通过':' · 查看'}`;
  $('clientChecksOpen').dataset.state=all&&remote?'pass':failed?'fail':'pending';
  for(const [id,r] of Object.entries(rows)){
   const tr=$('check-'+id);tr.querySelector('small').textContent=r.detail;
   const cells=tr.querySelectorAll('.check-light');cells[0].dataset.state=r.state;cells[0].textContent=words[r.state];
   const state=fresh&&peerReport?.[id]||'pending';cells[1].dataset.state=state;cells[1].textContent=words[state];
  }
  $('checksPeer').textContent=!peerId?'对方尚未加入。':fresh&&peerReport?'对方灯号来自其页面最近上报；任意一项未通过，都不能确认双向语音翻译可用。':'未收到对方最新检测，请让对方刷新页面并打开检测；后台、断线或旧版本均可能无报告。';
  $('checksHeard').disabled=!completedAt||Date.now()-completedAt>30000;
 }
 async function poll(){
  render();if(checking||!window.socket?.connected||!window.currentRoomId||document.hidden)return;
  checking=true;const token=ensure(),roomId=window.currentRoomId;
  window.socket.timeout(4000).emit('clientChecks',{roomId,checks:Object.fromEntries(Object.entries(lastRows).map(([k,v])=>[k,v.state]))},(err,r)=>{
   checking=false;if(token!==ensure())return;
   if(err||!r?.ok){connectionAt=0;connectionError=r?.error||'检测服务未响应，请检查网络或刷新至最新版本';peerReport=null;}else{connectionError='';connectionAt=Date.now();peerReport=r.peerId===peerId?r.peer:null;peerAt=Date.now();}
   render();
  });
 }
 const samples={'zh-CN':'你好，今天很高兴见到你。','en-US':'Hello, it is nice to meet you today.','ja-JP':'こんにちは、今日はお会いできて嬉しいです。','ko-KR':'안녕하세요. 오늘 만나서 반갑습니다.','fr-FR':'Bonjour, je suis heureux de vous rencontrer.','de-DE':'Hallo, schön Sie heute zu treffen.','es-ES':'Hola, me alegra verte hoy.'};
 async function testTranslation(){
  if(running)return;ensure();if(!window.currentRoomId||!window.socket?.connected){$('checksOutput').textContent='请先加入房间，再检测真实翻译。';return;}
  if(window.config?.translationApi==='none'){$('checksOutput').textContent='请先在环境设置开启翻译。';return;}
  const token=scope,source=window.config?.sourceLang==='auto'?'zh-CN':window.config?.sourceLang||'zh-CN',target=window.VoiceReader?.health().lang||window.config?.targetLang||'en-US';
  // Also test the reverse direction. Never count the same-language shortcut as translation.
  const other=source===target?(target==='en-US'?'zh-CN':'en-US'):source;
  running=true;$('checksRun').disabled=true;$('checksOutput').textContent='正在实测双向文字翻译（使用短测试句，消耗少量 API 额度）…';const start=performance.now();
  try{
   for(const [from,to] of [[other,target],[target,other]]){
    const r=await new Promise((resolve,reject)=>window.socket.timeout(15000).emit('translateSubtitle',{roomId:window.currentRoomId,text:samples[from],sourceLang:from,targetLang:to},(e,r)=>e?reject(Error('翻译响应超时')):resolve(r)));
    if(token!==ensure())return;if(!r?.ok||!String(r.text||'').trim())throw Error(r?.error||'翻译未返回文字');
   }
   record('translation','pass',`${other} ↔ ${target} 实际返回译文，共 ${((performance.now()-start)/1000).toFixed(1)} 秒`);$('checksOutput').textContent='双向文字翻译请求成功；还需要双方识别、字幕接收和听音测试。';
  }catch(e){if(token===ensure()){record('translation','fail',e.message);$('checksOutput').textContent=e.message;}}
  finally{running=false;$('checksRun').disabled=false;}
 }
 for(const [id,label] of Object.entries(labels)){
  const el=document.createElement('div');el.id='check-'+id;el.className='checks-row';
  const text=document.createElement('div'),title=document.createElement('b'),detail=document.createElement('small');title.textContent=label;text.append(title,detail);el.append(text);
  for(let i=0;i<2;i++){const light=document.createElement('span');light.className='check-light';el.append(light);}$('checksRows').append(el);
 }
 $('clientChecksOpen').onclick=()=>{$('clientChecksModal').classList.remove('hidden');render();};
 $('clientChecksClose').onclick=()=>$('clientChecksModal').classList.add('hidden');
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('clientChecksClose').click();});
 $('checksRun').onclick=testTranslation;
 $('checksRecognize').onclick=()=>{if(!window.Subtitles?.isRunning())$('quickCaptionToggle').click();render();};
 $('checksVoice').onclick=()=>{$('clientChecksClose').click();window.VoiceReader?.open();};
 $('checksPreview').onclick=()=>{completedAt=0;record('playback','pending','试听中，请等待结束并确认声音');window.VoiceReader?.preview();};
 $('checksHeard').onclick=()=>{ensure();if(completedAt&&Date.now()-completedAt<30000){record('playback','pass','已完成播放回调，并由本机用户确认听到声音');completedAt=0;render();}};
 $('checksSilent').onclick=()=>{completedAt=0;record('playback','fail','未听到声音：检查媒体音量、蓝牙输出与音色，换浏览器后重测');};
 window.ClientChecks={record,read,received(data){ensure();if(data.roomId===window.currentRoomId&&data.senderId!==window.socket?.id&&data.originalText){record('captions','pass',data.translatedText?'已呈现对方新字幕与译文':'已呈现对方新字幕（此句尚无译文）');}},playbackFinished(){ensure();completedAt=Date.now();render();},testTranslation};
 window.socket?.on('roomState',render);
 window.socket?.on('roomLeft',render);
 window.socket?.on('disconnect',()=>{reset();render();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){reset();render();}else poll();});
 setInterval(poll,2500);poll();
})();
