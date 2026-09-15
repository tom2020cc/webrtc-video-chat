/* 手机输入法/文字备用路径：只把用户确认的文字交给站点翻译接口。 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const modal=$('quickTranslationModal'),input=$('quickTranslationInput'),source=$('quickSourceLang'),target=$('quickTargetLang');
  const output=$('quickTranslationResult'),send=$('quickTranslationSend'),button=$('quickTranslateBtn');
  let version=0,panelVersion=0,result=null,busy=false;
  function invalidate(){version++;result=null;send.disabled=true;}
  function open(){
    invalidate();target.value=window.config?.targetLang||'en-US';source.value='auto';output.textContent='';
    modal.classList.remove('hidden');
    const current=++panelVersion;$('quickTranslationService').textContent='正在检查翻译连接…';
    window.Subtitles.status().then(s=>{if(current===panelVersion)$('quickTranslationService').textContent=s.configured?(window.currentRoomId?'DeepSeek 已连接，可以翻译文字。':'DeepSeek 已配置，请先加入房间。'):'服务器未配置翻译服务，请联系管理员';}).catch(()=>{if(current===panelVersion)$('quickTranslationService').textContent='站点连接不可用，请刷新或重新加入房间';});
  }
  function close(){invalidate();panelVersion++;modal.classList.add('hidden');}
  $('quickTranslationBtn').addEventListener('click',open);
  $('subtitleFallbackBtn').addEventListener('click',open);
  $('quickTranslationClose').addEventListener('click',close);
  modal.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  for(const el of [input,source,target])el.addEventListener('input',()=>{invalidate();output.textContent='';});
  button.addEventListener('click',async()=>{
    if(busy)return;
    invalidate();
    const text=input.value.trim(),roomId=window.currentRoomId,sourceLang=source.value,targetLang=target.value;
    if(!text){output.textContent='请先输入文字，或用手机输入法麦克风输入';return;}
    if(!window.socket?.connected||!roomId){output.textContent='请先关闭此窗口，加入房间后再翻译';return;}
    if(sourceLang===targetLang){output.textContent='两种语言相同，请选择不同的译文语言';return;}
    const current=version;busy=true;button.disabled=true;output.textContent='DeepSeek 正在翻译…';
    try{
      const response=await new Promise((resolve,reject)=>window.socket.timeout(15000).emit('translateSubtitle',{roomId,text,sourceLang,targetLang},(error,data)=>error?reject(new Error('翻译超时，请稍后重试')):resolve(data)));
      if(current!==version)return;
      if(roomId!==window.currentRoomId||!window.socket.connected)throw new Error('已离开房间，译文不会发送');
      if(!response?.ok)throw new Error(response?.error||'翻译未完成');
      result={roomId,originalText:text,translatedText:response.text,sourceLang,targetLang};
      output.textContent=response.text;send.disabled=false;
    }catch(e){if(current===version)output.textContent=e.message;}
    finally{busy=false;button.disabled=false;}
  });
  send.addEventListener('click',()=>{
    if(!result)return;
    if(result.roomId!==window.currentRoomId||!window.socket?.connected){invalidate();output.textContent='房间已变化，请重新翻译';return;}
    window.socket.emit('subtitleMessage',result);invalidate();output.textContent+='\n已提交到当前房间';
  });
})();
