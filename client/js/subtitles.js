/* 浏览器语音识别 + 服务端 DeepSeek 翻译，密钥不进入客户端。 */
(function () {
  'use strict';
  const language = v => !v || v === 'auto' ? 'zh-CN' : v;
  function request(event, payload, timeout = 15000) {
    return new Promise((resolve, reject) => {
      if (!window.socket?.connected) return reject(new Error('连接已断开，请重新加入房间'));
      const cb = (error, data) => error ? reject(new Error('服务器响应超时')) : resolve(data);
      if (payload === undefined) window.socket.timeout(timeout).emit(event, cb);
      else window.socket.timeout(timeout).emit(event, payload, cb);
    });
  }
  async function translate(text, sourceLang, targetLang, roomId) {
    if (!roomId) throw new Error('请先加入房间再翻译');
    if (window.config?.translationApi === 'none' || sourceLang === targetLang) return '';
    const result = await request('translateSubtitle', {roomId,text,sourceLang,targetLang});
    if (!result?.ok) throw new Error(result?.error || '翻译未完成');
    return result.text;
  }
  class SubtitleManager {
    constructor() {
      this.isActive=false; this.queue=[]; this.processing=false;
      this.session=0; this.visual=0; this.lastFinal={text:'',at:0}; this.networkFailures=0;
    }
    init() {
      for (const name of ['Overlay','Original','Translated','Box','Loading','Error']) this['subtitle'+name]=document.getElementById('subtitle'+name);
      this.updateSubtitlePosition(); this.updateSubtitleStyle();
    }
    updateSubtitlePosition() {this.subtitleOverlay?.classList.toggle('position-top',window.config?.subtitlePosition==='top');}
    updateSubtitleStyle() {
      if(!this.subtitleBox)return;
      const c=window.config||{};
      this.subtitleBox.style.fontSize=({small:'14px',medium:'16px',large:'20px','x-large':'24px'})[c.subtitleFontSize]||'16px';
      this.subtitleBox.style.backgroundColor=({transparent:'transparent','semi-transparent':'rgba(0,0,0,.75)',solid:'#000','white-transparent':'rgba(255,255,255,.9)','white-solid':'#fff'})[c.subtitleBgColor]||'rgba(0,0,0,.75)';
      this.subtitleBox.style.color=String(c.subtitleBgColor).startsWith('white')?'#111827':'#fff';
    }
    status(message,error=false) {
      const health=document.getElementById('subtitleHealth');
      const healthText=document.getElementById('subtitleHealthText');
      if(health&&healthText){health.classList.toggle('hidden',!message);healthText.textContent=message;}
      if(!this.subtitleError)return;
      this.subtitleError.textContent=message;
      this.subtitleError.classList.toggle('hidden',!message);
      this.subtitleError.classList.toggle('show',Boolean(message));
      this.subtitleError.classList.toggle('translation-error',error);
    }
    syncButton(){if(typeof syncSubtitleButton==='function')syncSubtitleButton();}
    notice(text){if(typeof showNotice==='function')showNotice(text);}
    start() {
      if(this.isActive)return true;
      if(!window.currentRoomId || !window.socket?.connected){this.notice('请先加入房间再开启字幕');return false;}
      const Engine=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!Engine){this.status('此浏览器不支持网页语音识别。请使用下方「文字 / 输入法翻译」。',true);return false;}
      this.session++;this.isActive=true;this.room=window.currentRoomId;
      this.queue=[];this.lastFinal={text:'',at:0};this.networkFailures=0;
      this.subtitleOverlay?.classList.remove('hidden');this.subtitleOverlay?.classList.add('active');
      this.updateSubtitlePosition();this.updateSubtitleStyle();this.status('正在启动语音识别，请允许麦克风并说一句话…');
      this.lastRecognitionAt=Date.now();this.audioStarted=false;this.speechDetected=false;
      this.createRecognition(Engine);
      if(this.isActive)this.roomWatch=setInterval(()=>{
        if(!window.socket?.connected||window.currentRoomId!==this.room){this.stop();return;}
        this.checkRecognitionHealth();
      },500);
      return this.isActive;
    }
    checkRecognitionHealth(){
      if(!this.isActive)return;
      const elapsed=Date.now()-this.lastRecognitionAt;
      if(elapsed>=45000){
        this.stop();
        this.status('45秒未收到识别文字，语音字幕已暂停。可能是未说话、麦克风权限或识别服务网络不可用。可重开字幕，或使用「文字 / 输入法翻译」。',true);
      }else if(elapsed>=18000){
        this.status(this.audioStarted?'麦克风已启动，但尚未收到识别文字。请确认源语言并说一句话；手机直连时，浏览器识别服务可能不可达。':'尚未确认麦克风启动。请检查权限、浏览器和语音识别服务连接。',true);
      }
    }
    createRecognition(Engine) {
      const engine=new Engine();this.engine=engine;
      engine.lang=language(window.config?.sourceLang);engine.continuous=true;engine.interimResults=true;engine.maxAlternatives=1;
      engine.onaudiostart=()=>{if(this.isActive&&this.engine===engine){this.audioStarted=true;this.status('麦克风已启动，等待语音识别结果…');}};
      engine.onspeechstart=()=>{if(this.isActive&&this.engine===engine){this.speechDetected=true;this.status('检测到语音，正在等待识别文字…');}};
      engine.onresult=event=>{
        if(!this.isActive||this.engine!==engine)return;
        this.networkFailures=0;this.lastRecognitionAt=Date.now();let interim='';
        for(let i=event.resultIndex;i<event.results.length;i++){
          const r=event.results[i];
          if(r.isFinal)this.processFinalSubtitle(r[0].transcript,engine.lang);else interim+=r[0].transcript;
        }
        if(interim)this.showInterimSubtitle(interim);
      };
      engine.onerror=event=>{
        if(!this.isActive||this.engine!==engine)return;
        if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(event.error)){
          const reason={'not-allowed':'麦克风权限被拒绝','service-not-allowed':'浏览器不允许使用识别服务','audio-capture':'麦克风设备不可用','language-not-supported':'浏览器不支持所选识别语言'}[event.error];
          this.stop();this.status(reason+'。可检查手机权限或使用「文字 / 输入法翻译」。',true);
        }else if(event.error==='network'){
          this.networkFailures++;
          if(this.networkFailures>=3){this.stop();this.status('浏览器语音识别服务连接失败，已停止重试。DeepSeek 文字翻译仍可使用，请点击「文字 / 输入法翻译」。',true);}
          else this.status('语音识别网络波动，正在重连…',true);
        }
      };
      engine.onend=()=>{
        if(!this.isActive||this.engine!==engine)return;
        clearTimeout(this.restartTimer);
        this.restartTimer=setTimeout(()=>{
          if(!this.isActive||this.engine!==engine)return;
          engine.lang=language(window.config?.sourceLang);
          try{engine.start();}catch{this.stop();this.notice('识别重连失败，请关闭后重开字幕');}
        },this.networkFailures?Math.min(1000*2**this.networkFailures,15000):300);
      };
      try{engine.start();}catch{this.stop();this.notice('语音识别启动失败，请检查浏览器权限');}
    }
    stop() {
      this.isActive=false;this.session++;this.visual++;this.queue=[];
      clearInterval(this.roomWatch);clearTimeout(this.restartTimer);clearTimeout(this.clearTimer);
      if(this.engine){this.engine.onend=null;this.engine.onresult=null;this.engine.onerror=null;this.engine.onaudiostart=null;this.engine.onspeechstart=null;try{this.engine.abort();}catch{}}
      this.engine=null;this.subtitleOverlay?.classList.add('hidden');this.subtitleOverlay?.classList.remove('active');
      this.clearSubtitles();this.syncButton();
    }
    updateLanguage(sourceLang) {
      if(this.isActive&&this.engine&&this.engine.lang!==language(sourceLang)){this.engine.lang=language(sourceLang);this.engine.stop();}
    }
    showInterimSubtitle(text) {
      clearTimeout(this.clearTimer);this.visual++;
      this.showOriginalSubtitle(text);this.subtitleOriginal?.classList.add('interim');this.showTranslatedSubtitle('');
    }
    processFinalSubtitle(text,sourceLang) {
      text=String(text||'').trim();
      if(!text||!this.isActive||this.room!==window.currentRoomId)return;
      if(this.lastFinal.text===text&&Date.now()-this.lastFinal.at<2000)return;
      this.lastFinal={text,at:Date.now()};clearTimeout(this.clearTimer);
      const visual=++this.visual;this.showOriginalSubtitle(text);this.showTranslatedSubtitle('');
      // 最终结果串行翻译；临时结果仅在本机显示，避免逐字计费。
      for(let start=0;start<text.length;start+=1200){
        const item={text:text.slice(start,start+1200),sourceLang,targetLang:window.config?.targetLang||'en-US',roomId:this.room,session:this.session,visual};
        if(this.queue.length>=5){this.sendSubtitleToChat(item,'');this.status('翻译跟不上语速，部分字幕仅保留原文',true);}
        else this.queue.push(item);
      }
      this.drain();
    }
    async drain() {
      if(this.processing)return;this.processing=true;
      try{
        while(this.queue.length){
          const item=this.queue.shift();if(!this.valid(item))continue;
          if(this.visual===item.visual)this.status(window.config?.translationApi==='none'?'仅显示原文':'DeepSeek 正在翻译…');
          let translated='',error='';
          try{translated=await translate(item.text,item.sourceLang,item.targetLang,item.roomId);}catch(e){error=e.message;}
          if(!this.valid(item))continue;
          this.sendSubtitleToChat(item,translated);
          if(this.visual===item.visual){
            this.showTranslatedSubtitle(translated);this.status(error||(translated?'DeepSeek 翻译完成':'仅显示原文'),Boolean(error));
            if(window.config?.autoClearSubtitle!==false)this.clearTimer=setTimeout(()=>{if(this.visual===item.visual)this.clearSubtitles();},8000);
          }
        }
      }finally{this.processing=false;}
    }
    valid(item){return this.isActive&&item.session===this.session&&item.roomId===window.currentRoomId&&window.socket?.connected;}
    sendSubtitleToChat(item,translatedText){if(this.valid(item))window.socket.emit('subtitleMessage',{roomId:item.roomId,originalText:item.text,translatedText,sourceLang:item.sourceLang,targetLang:item.targetLang});}
    showOriginalSubtitle(text){this.subtitleOverlay?.classList.toggle('has-caption',Boolean(text));if(this.subtitleOriginal){this.subtitleOriginal.textContent=text;this.subtitleOriginal.classList.add('show');this.subtitleOriginal.classList.remove('interim');}}
    showTranslatedSubtitle(text){if(this.subtitleTranslated){this.subtitleTranslated.textContent=text;this.subtitleTranslated.classList.add('show');}}
    clearSubtitles(){this.showOriginalSubtitle('');this.showTranslatedSubtitle('');this.status('');}
    isRunning(){return this.isActive;}
  }
  window.Subtitles={
    manager:null,
    init(){if(!this.manager){this.manager=new SubtitleManager();this.manager.init();}return this.manager;},
    start(){return this.init().start();},stop(){this.manager?.stop();},isRunning(){return this.manager?.isRunning()||false;},
    updateLanguage(sourceLang){this.manager?.updateLanguage(sourceLang);},translateText:translate,
    status:()=>request('translationStatus',undefined,5000)
  };
})();
