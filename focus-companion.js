/* Optional on-device presence/phone hints. No frames, camera permission or streams are persisted. */
'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const plantStages = ['种下一点耐心', '小芽冒出来了', '长出一片新叶', '花苞在慢慢打开', '今天的小花开了'];
  const tones = {
    gentle: {phone:['先把手机放到够不到的地方，回来继续这一句。'], absent:['暂时没看到你。还在纸上默写就忽略；离开了可以暂停。']},
    sharp: {
      phone:['又摸手机？刚背两句就想溜？放下，别拿考试给拖延买单。','手机里没有这道题的答案。别给拖延找借口，放下它，把这一句背完整。','刷一分钟很爽，回头重背更烦。现在放下手机，别让刚才的功夫白费。'],
      absent:['镜头里半天没人了。要休息就按暂停，别让计时器替你演努力。低头默写中可忽略。','人呢？时间可不会替你背书。离开了就暂停，回来了把这一句补齐。低头默写中可忽略。']
    }
  };
  let stream=null, face=null, object=null, interval=null, token=0, busy=false;
  let absentSince=null, phoneSince=null, lastAlert=-Infinity, activeBefore=false, audio=null, sequence=0;
  const detectorState={phase:'off',lastReason:null,alerts:0};
  const active=()=>clock.running&&clock.mode==='focus'&&!document.hidden;
  function status(message){$('camera-status').textContent=message;}
  function resetEvidence(){absentSince=null;phoneSince=null;}
  function renderPlant(){
    const minutes=today().ms/60000,stage=minutes>=25?4:minutes>=15?3:minutes>=8?2:minutes>=2?1:0;
    $('focus-plant').dataset.stage=stage;
    $('plant-caption').textContent=plantStages[stage];
    $('plant-progress').textContent=`今日 ${Math.floor(minutes)} 分钟 · 25 分钟开花`;
    $('plant-growth').value=Math.min(minutes,25);
    $('focus-plant').setAttribute('aria-label',`${plantStages[stage]}，今日专注 ${Math.floor(minutes)} 分钟。休息不扣进度。`);
  }
  function dismiss(){ $('focus-reminder').hidden=true;if('speechSynthesis' in window)window.speechSynthesis.cancel(); }
  function remind(reason,now=Date.now()){
    if(!active()||now-lastAlert<60000)return false;
    lastAlert=now;detectorState.lastReason=reason;detectorState.alerts++;
    const pool=tones[$('reminder-tone').value]?.[reason]||tones.sharp[reason];
    const message=pool[sequence++%pool.length];
    $('reminder-text').textContent=message;$('focus-reminder').hidden=false;
    if($('reminder-sound').checked&&audio){try{const o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);g.gain.value=.06;o.frequency.value=640;o.start();o.stop(audio.currentTime+.18);}catch{}}
    if($('reminder-voice').checked&&'speechSynthesis' in window){const u=new SpeechSynthesisUtterance(message);u.lang='zh-CN';u.rate=1.05;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);}
    return true;
  }
  function observe(hasFace,hasPhone,now=Date.now()){
    if(!active()){resetEvidence();return;}
    if(hasPhone){phoneSince??=now;}else phoneSince=null;
    if(!hasFace){absentSince??=now;}else absentSince=null;
    if(phoneSince!==null&&now-phoneSince>=8000){remind('phone',now);status('持续检测到手机 · 请确认是否误判');}
    else if($('absence-check').checked&&absentSince!==null&&now-absentSince>=Number($('absence-seconds').value)*1000){remind('absent',now);status('暂时未检测到人脸 · 低头默写可忽略');}
    else status(hasPhone?'看到疑似手机，确认中…':hasFace?'已看到人脸 · 正在本机检测手机':'暂时没看到人脸，缓冲中…');
  }
  function syncCamera(){
    if(!stream)return;
    const enabled=active();stream.getVideoTracks().forEach(t=>{t.enabled=enabled;});
    if(!enabled){resetEvidence();if(activeBefore)dismiss();status(document.hidden?'页面在后台，已暂停检测':'专注计时未运行，已暂停检测');}
    else if(!activeBefore)status('专注中，正在检测…');
    activeBefore=enabled;
  }
  function stopCamera(message='摄像头已关闭'){
    ++token;clearInterval(interval);interval=null;
    if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;
    $('camera-video').srcObject=null;
    for(const detector of [face,object]){try{detector?.close();}catch{}}face=null;object=null;
    resetEvidence();busy=false;activeBefore=false;detectorState.phase='off';
    $('camera-start').disabled=false;$('camera-stop').disabled=true;$('camera-indicator').textContent='摄像头关';$('camera-settings').dataset.camera='off';
    dismiss();status(message);
  }
  async function sample(){
    if(busy||!stream||!face||!object)return;syncCamera();
    const video=$('camera-video');if(!active()||video.readyState<2)return;
    busy=true;
    try{
      const stamp=performance.now();
      const f=face.detectForVideo(video,stamp),o=object.detectForVideo(video,stamp);
      observe(f.detections.length>0,o.detections.some(d=>d.categories.some(c=>c.categoryName==='cell phone'&&c.score>=.5)));
    }catch{stopCamera('检测失败，已关闭摄像头。可以重新开启；当前没有自动提醒。');}
    finally{busy=false;}
  }
  async function startCamera(){
    if(stream||detectorState.phase==='loading')return;
    if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){status('当前环境不支持摄像头，请在 HTTPS 网页的 Chrome 或 Edge 中打开。');return;}
    const mine=++token;detectorState.phase='loading';lastAlert=-Infinity;resetEvidence();
    $('camera-start').disabled=true;$('camera-stop').disabled=false;status('等待摄像头授权；仅请求视频，不使用麦克风…');
    try{const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio??=new Audio();audio.resume().catch(()=>{});}}catch{}
    let acquired=null,loadedFace=null,loadedObject=null;
    try{
      acquired=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user'},audio:false});
      if(mine!==token){acquired.getTracks().forEach(t=>t.stop());return;}
      stream=acquired;$('camera-video').srcObject=stream;$('camera-indicator').textContent='摄像头开';$('camera-settings').dataset.camera='on';
      stream.getVideoTracks().forEach(t=>t.addEventListener('ended',()=>{if(mine===token)stopCamera('摄像头连接中断，已停止提醒。');}));
      await $('camera-video').play();status('首次载入本机识别模型（约 15 MB），请稍等；可随时关闭。');
      const {FilesetResolver,FaceDetector,ObjectDetector}=await import('./vendor/mediapipe/vision_bundle.mjs');
      const vision=await FilesetResolver.forVisionTasks('./vendor/mediapipe/wasm');
      if(mine!==token)return;
      loadedFace=await FaceDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:'./vendor/mediapipe/blaze_face_short_range.tflite',delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.6});
      if(mine!==token){loadedFace.close();return;}
      loadedObject=await ObjectDetector.createFromOptions(vision,{baseOptions:{modelAssetPath:'./vendor/mediapipe/efficientdet_lite0.tflite',delegate:'CPU'},runningMode:'VIDEO',categoryAllowlist:['cell phone'],scoreThreshold:.5,maxResults:3});
      if(mine!==token){loadedFace.close();loadedObject.close();return;}
      face=loadedFace;object=loadedObject;detectorState.phase='on';interval=setInterval(sample,2000);syncCamera();await sample();
    }catch(error){
      if(mine!==token){try{loadedFace?.close();loadedObject?.close();}catch{}return;}
      if(face!==loadedFace)try{loadedFace?.close();}catch{}
      if(object!==loadedObject)try{loadedObject?.close();}catch{}
      const message=error?.name==='NotAllowedError'?'未获得摄像头权限，没有开启检测。可在浏览器地址栏调整权限后重试。':error?.name==='NotFoundError'?'没有找到摄像头，没有开启检测。':'摄像头或识别模型载入失败，已停止检测。检查网络或摄像头占用后重试。';
      stopCamera(message);
    }
  }
  const preferences=state.companion||{};
  $('reminder-tone').value=preferences.tone==='gentle'?'gentle':'sharp';
  $('reminder-sound').checked=preferences.sound!==false;
  $('reminder-voice').checked=preferences.voice===true;
  $('absence-check').checked=preferences.absence!==false;
  $('absence-seconds').value=preferences.seconds===60?'60':'30';
  for(const id of ['reminder-tone','reminder-sound','reminder-voice','absence-check','absence-seconds'])$(id).addEventListener('change',()=>{state.companion={tone:$('reminder-tone').value,sound:$('reminder-sound').checked,voice:$('reminder-voice').checked,absence:$('absence-check').checked,seconds:Number($('absence-seconds').value)};resetEvidence();persist();});
  $('camera-start').addEventListener('click',startCamera);$('camera-stop').addEventListener('click',()=>stopCamera());
  $('reminder-dismiss').addEventListener('click',dismiss);
  $('reminder-preview').addEventListener('click',()=>{const m=tones[$('reminder-tone').value].phone[0];$('reminder-text').textContent=m;$('focus-reminder').hidden=false;});
  document.addEventListener('visibilitychange',()=>{resetEvidence();syncCamera();});
  window.addEventListener('pagehide',()=>stopCamera());
  $('camera-settings').addEventListener('keydown',e=>{if(e.key==='Escape'){$('camera-settings').open=false;$('camera-settings').querySelector('summary').focus();}});
  document.addEventListener('pointerdown',e=>{if(!$('camera-settings').contains(e.target))$('camera-settings').open=false;});
  setInterval(()=>{renderPlant();syncCamera();},1000);renderPlant();
  window.__FOCUS_TEST__={observe,remind,renderPlant,stopCamera,detectorState};
})();
