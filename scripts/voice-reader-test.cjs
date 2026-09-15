const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs');
function setup(){
 const elements=new Map(),spoken=[],requests=[],guards=[],timers=[];
 function el(){return {value:'',checked:false,disabled:false,textContent:'',innerHTML:'',classList:{add(){},remove(){},toggle(){}},appendChild(){}};}
 const $=id=>{if(!elements.has(id))elements.set(id,el());return elements.get(id);};
 const voices=[{name:'Microsoft Huihui',voiceURI:'female',lang:'zh-CN',localService:true},{name:'Microsoft Kangkang',voiceURI:'male',lang:'zh-CN',localService:true}];
 const synth={getVoices:()=>voices,addEventListener(){},resume(){},cancel(){},speak:u=>spoken.push(u)};
 const window={speechSynthesis:synth,currentRoomId:'r',socket:{connected:true,timeout:()=>({emit:(name,payload,cb)=>requests.push({name,payload,cb})})},VoiceAudioGuard:v=>guards.push(v),addEventListener(){}};
 const context={window,document:{getElementById:$,createElement:el},localStorage:{getItem:()=>null,setItem(){}},SpeechSynthesisUtterance:function(text){this.text=text;},performance:{now:()=>100},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){}};
 vm.runInNewContext(fs.readFileSync('client/js/voice-reader.js','utf8'),context);
 const enable=()=>{$('voiceReaderEnabled').checked=true;$('voiceReaderEnabled').onchange();};
 return {window,spoken,requests,guards,$,enable};
}
const message=(id=1)=>({id,roomId:'r',originalText:'Hello',translatedText:'你好',sourceLang:'en-US',targetLang:'zh-CN'});
const settle=()=>new Promise(r=>setImmediate(r));
test('voice is off until enabled; female and male voices honor explicit selection',async()=>{const t=setup();t.window.VoiceReader.receive(message());assert.equal(t.spoken.length,0);t.enable();t.window.VoiceReader.receive(message(2));assert.equal(t.spoken[0].voice.voiceURI,'female');t.spoken[0].onstart();assert.equal(t.guards.at(-1),true);t.spoken[0].onend();await settle();assert.equal(t.guards.at(-1),false);t.$('voiceReaderGender').value='male';t.$('voiceReaderGender').onchange();t.window.VoiceReader.receive(message(3));assert.equal(t.spoken[1].voice.voiceURI,'male');t.window.VoiceReader.stop();});
test('new language translates original and leaving suppresses a late response',async()=>{const t=setup();t.enable();t.window.VoiceReader.receive({...message(),targetLang:'fr-FR',translatedText:'Bonjour'});assert.equal(t.requests[0].payload.targetLang,'zh-CN');t.window.currentRoomId=null;t.window.VoiceReader.stop();t.requests[0].cb(null,{ok:true,text:'你好'});await settle();assert.equal(t.spoken.length,0);});
test('no matching voice gives feedback rather than pretending to use another gender/language',()=>{const t=setup();t.$('voiceReaderLang').value='ja-JP';t.$('voiceReaderLang').onchange();t.enable();t.window.VoiceReader.receive(message());assert.equal(t.spoken.length,0);assert.match(t.$('voiceReaderStatus').textContent,/没有匹配声音/);});
test('duplicate subtitle IDs are not spoken twice and stop clears queued speech',async()=>{const t=setup();t.enable();t.window.VoiceReader.receive(message());t.window.VoiceReader.receive(message());t.window.VoiceReader.receive(message(2));assert.equal(t.spoken.length,1);t.window.VoiceReader.stop();t.spoken[0].onend();await settle();assert.equal(t.spoken.length,1);});
test('subtitle notifications are silent and microphone processing is explicit',()=>{const window={};vm.runInNewContext(fs.readFileSync('client/js/audio-tools.js','utf8'),{window});assert.equal(window.AudioTools.shouldNotify('subtitle','other','self'),false);assert.equal(window.AudioTools.shouldNotify('text','other','self'),true);assert.equal(window.AudioTools.constraints().echoCancellation,true);const stats=window.AudioTools.summarize(new Map([['a',{type:'inbound-rtp',kind:'audio',packetsReceived:10,packetsLost:2,jitter:.04}]]));assert.equal(stats.jitter,40);assert.equal(stats.lost,2);});
