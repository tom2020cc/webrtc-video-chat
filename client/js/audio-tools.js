(function(){
 const shouldNotify=(type,from,self)=>type!=='subtitle'&&from!==self;
 const constraints=()=>({echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:{ideal:1}});
 function summarize(stats){const out={received:0,lost:0,concealed:0,samples:0,jitter:0,rtt:0};stats.forEach(s=>{if(s.type==='inbound-rtp'&&(s.kind==='audio'||s.mediaType==='audio')){out.received+=s.packetsReceived||0;out.lost+=s.packetsLost||0;out.concealed+=s.concealedSamples||0;out.samples+=s.totalSamplesReceived||0;out.jitter=Math.max(out.jitter,(s.jitter||0)*1000);}if(s.type==='candidate-pair'&&s.state==='succeeded'&&(s.nominated||s.selected))out.rtt=Math.max(out.rtt,(s.currentRoundTripTime||0)*1000);});return out;}
 window.AudioTools={shouldNotify,constraints,summarize};
})();
