(function(){
 'use strict';
 const $=id=>document.getElementById(id),languages={'zh-CN':'中文','en-US':'英语','ja-JP':'日语','ko-KR':'韩语','fr-FR':'法语','de-DE':'德语','es-ES':'西班牙语'};
 let saved={};try{saved=JSON.parse(localStorage.getItem('videoCaptionDisplay'))||{};}catch{}
 const prefs={display:['bilingual','translation','hidden'].includes(saved.display)?saved.display:'bilingual',size:[15,18,22].includes(Number(saved.size))?Number(saved.size):18,duration:[8,15,30].includes(Number(saved.duration))?Number(saved.duration):15};
 let panel='lobby',room=null,unread=0;
 function selectPanel(name){panel=name;document.body.dataset.mobilePanel=name;for(const [id,value] of [['mobileTabCall','call'],['mobileTabChat','chat'],['mobileTabLobby','lobby']])$(id).setAttribute('aria-pressed',String(value===name));if(name==='chat'){unread=0;$('mobileUnread').textContent='';}}
 function sync(){const next=window.currentRoomId||null;if(next!==room){room=next;selectPanel(next?'call':'lobby');unread=0;$('mobileUnread').textContent='';}document.body.classList.toggle('in-call',Boolean(room));const running=window.Subtitles?.isRunning()||false;const b=$('quickCaptionToggle');b.setAttribute('aria-pressed',String(running));b.classList.toggle('on',running);b.textContent=running?'📝 我的字幕已开':'📝 开启我的字幕';$('quickSpeakingLanguage').value=window.config.sourceLang;const hint=$('videoPlaceholder')?.querySelector('p');if(hint)hint.textContent=room?'已加入房间，等待视频画面':'创建或加入房间，开始面对面交流';}
 for(const id of ['quickSpeakingLanguage','quickVoiceLanguage']){for(const [value,name] of Object.entries(languages)){const option=document.createElement('option');option.value=value;option.textContent=name;$(id).appendChild(option);}}
 $('quickVoiceLanguage').value=$('voiceReaderLang').value;
 $('quickSpeakingLanguage').onchange=()=>{window.config.sourceLang=$('quickSpeakingLanguage').value;try{localStorage.setItem('upWebRTCConfig',JSON.stringify(window.config));}catch{}window.Subtitles?.updateLanguage(window.config.sourceLang);};
 $('quickVoiceLanguage').onchange=()=>window.VoiceReader.setLanguage($('quickVoiceLanguage').value);
 $('quickCaptionToggle').onclick=()=>{if(!window.Subtitles?.isRunning()&&window.VoiceReader.isSpeaking())window.VoiceReader.interruptForSpeech();$('subtitleBtn').click();sync();};
 $('quickVoiceToggle').onclick=()=>window.VoiceReader.setEnabled(!window.VoiceReader.isEnabled());
 $('quickVoiceSettings').onclick=()=>window.VoiceReader.open();$('quickVoiceReplay').onclick=()=>window.VoiceReader.replay();
 for(const [id,name] of [['mobileTabCall','call'],['mobileTabChat','chat'],['mobileTabLobby','lobby']])$(id).onclick=()=>selectPanel(name);
 const tools=[['voiceReaderBtn','🔊 字幕与声音'],['subtitleHistoryBtn','📝 字幕历史'],['copyRoomBtn','🔗 复制房号'],['raiseHandBtn','✋ 举手'],['screenBtn','🖥 共享屏幕'],['snapshotBtn','📸 截图'],['imageBtn','🖼 发送图片'],['fileBtn','📁 发送文件'],['settingsBtn','⚙ 通话设置']];
 for(const [id,label] of tools){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{if($(id).disabled)return;$('mobileToolsModal').classList.add('hidden');$(id).click();};button.dataset.tool=id;$('mobileToolsGrid').appendChild(button);}
 $('mobileMoreBtn').onclick=()=>{for(const button of $('mobileToolsGrid').children)button.disabled=Boolean($(button.dataset.tool).disabled);$('mobileToolsModal').classList.remove('hidden');};$('mobileToolsClose').onclick=()=>$('mobileToolsModal').classList.add('hidden');
 function apply(){document.body.dataset.captionDisplay=prefs.display;document.documentElement.style.setProperty('--caption-size',prefs.size+'px');try{localStorage.setItem('videoCaptionDisplay',JSON.stringify(prefs));}catch{}}
 for(const [id,key] of [['captionDisplay','display'],['captionSize','size'],['captionDuration','duration']]){$(id).value=prefs[key];$(id).onchange=()=>{prefs[key]=key==='display'?$(id).value:Number($(id).value);apply();};}
 // Observe the existing rendered state, avoiding a second room or recognition state machine.
 new MutationObserver(sync).observe($('currentRoomId'),{childList:true,characterData:true,subtree:true});
 new MutationObserver(()=>{if(room&&panel!=='chat'){unread++;$('mobileUnread').textContent=unread>99?'99+':String(unread);}}).observe($('chatMessages'),{childList:true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){for(const id of ['voiceReaderModal','mobileToolsModal'])$(id).classList.add('hidden');}});
 $('chatInput').addEventListener('focus',()=>document.body.classList.add('chat-editing'));$('chatInput').addEventListener('blur',()=>document.body.classList.remove('chat-editing'));
 window.CallExperience={sync,captionDuration:()=>prefs.duration};apply();sync();selectPanel(room?'call':'lobby');
})();
