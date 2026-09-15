/* 播放恢复与接收字幕不依赖手机语音识别能力。 */
(function(){
  let captionTimer;
  async function play(video,tile){
    let button=tile.querySelector('.resume-media');
    const show=()=>{if(!button){button=document.createElement('button');button.className='resume-media';tile.appendChild(button);}button.textContent='点击播放画面和声音';button.onclick=async()=>{video.muted=false;try{await video.play();button.remove();button=null;}catch{button.textContent='播放受限，请检查浏览器声音权限后重试';}};};
    try{await video.play();if(!video.muted){button?.remove();return;}}catch{}
    if(!video.muted){video.muted=true;try{await video.play();}catch{}}
    show();
  }
  function clearCaption(){clearTimeout(captionTimer);const el=document.getElementById('receivedCaption');el?.classList.add('hidden');}
  function receive(data){
    if(!window.currentRoomId||data.roomId!==window.currentRoomId)return;
    const el=document.getElementById('receivedCaption');if(!el)return;
    document.getElementById('receivedSpeaker').textContent=(data.speaker||data.from||'对方')+' · 字幕';
    document.getElementById('receivedOriginal').textContent=data.originalText||'';
    document.getElementById('receivedTranslated').textContent=data.translatedText||'';
    el.classList.remove('hidden');clearTimeout(captionTimer);captionTimer=setTimeout(clearCaption,12000);
  }
  window.MediaUI={play,receive,clearCaption};
})();
