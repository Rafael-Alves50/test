(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const startBtn = document.getElementById('startBtn');
  const difficulty = document.getElementById('difficulty');
  const hintBtn = document.getElementById('hintBtn');
  const sprintBtn = document.getElementById('sprintBtn');
  const joy = document.getElementById('joy');
  const camJoy = document.getElementById('camJoy');
  const banner = document.getElementById('banner');
  const msg = document.getElementById('msg');
  const lcBadge = document.getElementById('lcBadge');
  const numHud = document.getElementById('numHud');
  const spinHud = document.getElementById('spinHud');
  const scoreHud = document.getElementById('scoreHud');
  const timeHud = document.getElementById('timeHud');

  const W = 720, H = 720, CX = 360, CY = 360, R = 298;
  const WAYMARKS = [
    {mark:'A', angle:0, kind:'card'}, {mark:'2', angle:45, kind:'inter'},
    {mark:'B', angle:90, kind:'card'}, {mark:'3', angle:135, kind:'inter'},
    {mark:'C', angle:180, kind:'card'}, {mark:'4', angle:225, kind:'inter'},
    {mark:'D', angle:270, kind:'card'}, {mark:'1', angle:315, kind:'inter'}
  ];
  const COLORS = {A:'#ef5350',B:'#ef5350',C:'#ef5350',D:'#ef5350','1':'#4b8cff','2':'#4b8cff','3':'#4b8cff','4':'#4b8cff'};
  const DODGE_R = 242;
  const PLAYER_R = 13;
  const SAFE_RADIUS = 50;
  const PREP_MS = 1600;
  const RESOLVE_FLASH_MS = 700;
  const DASH_COUNT = 8;
  const DASH_INTERVAL_MS = 760;

  const state = {
    running:false, phase:'idle', scenario:null, prepEndsAt:0, readStartAt:0, snapshotAt:0, resultEndsAt:0,
    player:{x:CX, y:CY, vx:0, vy:0}, keys:new Set(), joyX:0, joyY:0, camJoyX:0, camJoyY:0,
    pointerId:null, camJoyPointerId:null, sprintUntil:0, score:0, attempts:0, enteredAt:null,
    lastTs:performance.now(), hints:false, result:null, dashProgress:0, onCorrectSpot:false, moveMs:5000,
    dashStartAt:0, dashEndsAt:0, numberRevealed:false,
    cameraAngle:0
  };

  function norm(a){ return ((a % 360) + 360) % 360; }
  function relNorth(originAngle){ return norm(originAngle + 180); }
  function resolve(originAngle, rotation, number){
    const rn = relNorth(originAngle);
    const countSgn = rotation === 'CCW' ? 1 : -1;
    const angle = norm(rn + countSgn * (45 * number - 22.5));
    const spotIndex = Math.round(norm(angle - 22.5) / 45) % 8;
    return {angle, spotIndex};
  }
  function angleToXY(angle, radius){
    const rad = angle * Math.PI / 180;
    return {x:CX + radius*Math.sin(rad), y:CY - radius*Math.cos(rad)};
  }
  function randInt(n){ return Math.floor(Math.random()*n); }
  function deal(){
    const origin = WAYMARKS[randInt(8)];
    const rotation = Math.random() < .5 ? 'CW' : 'CCW';
    const number = randInt(8)+1;
    const solved = resolve(origin.angle, rotation, number);
    return {origin, rotation, number, solved};
  }

  function newRound(){
    const now = performance.now();
    const moveMs = Math.max(3000, Number(difficulty.value) || 5000);
    state.scenario = deal();
    state.running = true;
    state.phase = 'prep';
    state.moveMs = moveMs;
    state.prepEndsAt = now + PREP_MS;
    state.readStartAt = state.prepEndsAt;
    state.snapshotAt = 0;
    state.resultEndsAt = 0;
    state.player.x = CX; state.player.y = CY; state.player.vx = 0; state.player.vy = 0;
    state.enteredAt = null; state.result = null; state.dashProgress = 0; state.onCorrectSpot = false;
    state.dashStartAt = state.readStartAt;
    state.dashEndsAt = state.dashStartAt + DASH_COUNT * DASH_INTERVAL_MS;
    state.numberRevealed = false;
    state.cameraAngle = 0;
    state.sprintUntil = 0; sprintBtn.classList.remove('on');
    lcBadge.textContent = '?'; lcBadge.classList.remove('even');
    numHud.textContent = '—';
    spinHud.textContent = '—';
    timeHud.textContent = 'READY';
    banner.textContent = 'GET READY';
    msg.textContent = 'A mecânica vai aparecer em instantes. Use o joystick da direita para girar a câmera.';
    startBtn.textContent = 'Retry';
    stage.focus({preventScroll:true});
  }

  function beginRead(){
    if (!state.running || !state.scenario || state.phase !== 'prep') return;
    const now = performance.now();
    state.phase = 'read';
    state.dashStartAt = now;
    state.dashEndsAt = now + DASH_COUNT * DASH_INTERVAL_MS;
    state.numberRevealed = false;
    lcBadge.textContent = '?'; lcBadge.classList.remove('even');
    numHud.textContent = '—';
    spinHud.textContent = 'WATCH';
    timeHud.textContent = 'READ';
    banner.textContent = 'WATCH THE DASHES';
    msg.textContent = 'Leia o primeiro ponto e o sentido. Use o joystick de câmera para alinhar o novo norte embaixo se isso te ajudar.';
  }

  function beginMove(now){
    if (!state.running || !state.scenario || state.phase !== 'read') return;
    state.phase = 'move';
    state.numberRevealed = true;
    state.snapshotAt = now + state.moveMs;
    state.enteredAt = null;
    const n = state.scenario.number;
    lcBadge.textContent = n;
    lcBadge.classList.toggle('even', n % 2 === 0);
    numHud.textContent = '#' + n;
    spinHud.textContent = state.hints ? state.scenario.rotation : 'DECIDE';
    timeHud.textContent = (state.moveMs/1000).toFixed(1)+'s';
    banner.textContent = `#${n} — MOVE`;
    msg.textContent = 'Agora resolva seu número no sentido oposto ao Kefka e chegue no spot antes do snapshot.';
  }

  function finishRound(snapshotTime){
    if (!state.running || !state.scenario || state.phase !== 'move') return;
    const target = angleToXY(state.scenario.solved.angle, DODGE_R);
    const d = Math.hypot(state.player.x-target.x, state.player.y-target.y);
    const ok = d <= SAFE_RADIUS;
    state.phase = 'result';
    state.running = false;
    state.attempts++;
    if (ok) state.score++;
    state.result = {ok, distance:d, snapshotTime};
    state.resultEndsAt = snapshotTime + RESOLVE_FLASH_MS;
    scoreHud.textContent = `${state.score} / ${state.attempts}`;
    const reaction = state.enteredAt ? (state.enteredAt-(state.snapshotAt-state.moveMs))/1000 : null;
    timeHud.textContent = reaction !== null ? reaction.toFixed(2)+'s' : '—';
    banner.textContent = ok ? '✓ SAFE' : '✕ WIPE';
    msg.textContent = ok
      ? `Acertou #${state.scenario.number}${reaction !== null ? ` · chegou em ${reaction.toFixed(2)}s` : ''}.`
      : `Wipe: você estava ${Math.round(d)}px do centro do spot correto no snapshot. O spot certo está destacado.`;
    spinHud.textContent = state.scenario.rotation;
  }

  function update(dt, now){
    let dx=state.joyX, dy=state.joyY;
    if (state.keys.has('arrowleft') || state.keys.has('a')) dx -= 1;
    if (state.keys.has('arrowright') || state.keys.has('d')) dx += 1;
    if (state.keys.has('arrowup') || state.keys.has('w')) dy -= 1;
    if (state.keys.has('arrowdown') || state.keys.has('s')) dy += 1;
    const m = Math.hypot(dx,dy);
    if (m>1){ dx/=m; dy/=m; }

    const ca = Math.cos(state.cameraAngle), sa = Math.sin(state.cameraAngle);
    const worldDx = ca*dx + sa*dy;
    const worldDy = -sa*dx + ca*dy;

    const camDeadzone = 0.12;
    const camInput = Math.abs(state.camJoyX) > camDeadzone ? state.camJoyX : 0;
    if (camInput) rotateCamera(camInput * dt * 2.6);

    const sprint = now < state.sprintUntil;
    const speed = sprint ? 285 : 205;
    if (state.phase !== 'result') {
      state.player.x += worldDx*speed*dt;
      state.player.y += worldDy*speed*dt;
    }

    const vx=state.player.x-CX, vy=state.player.y-CY;
    const dist=Math.hypot(vx,vy);
    const maxR=R-PLAYER_R-5;
    if (dist>maxR){ state.player.x=CX+vx/dist*maxR; state.player.y=CY+vy/dist*maxR; }

    if (state.running && state.scenario){
      if (state.phase === 'prep') {
        const prepRemain = state.prepEndsAt - now;
        timeHud.textContent = prepRemain > 0 ? (prepRemain/1000).toFixed(1)+'s' : 'GO';
        if (now >= state.prepEndsAt) beginRead();
        return;
      }

      if (state.phase === 'read') {
        const dashElapsed = Math.max(0, now - state.dashStartAt);
        state.dashProgress = Math.min(DASH_COUNT, Math.floor(dashElapsed / DASH_INTERVAL_MS) + 1);
        timeHud.textContent = `D${Math.min(DASH_COUNT,state.dashProgress)}`;
        banner.textContent = `DASH ${Math.min(DASH_COUNT,state.dashProgress)} / ${DASH_COUNT}`;
        spinHud.textContent = state.hints ? state.scenario.rotation : 'WATCH';
        msg.textContent = 'Leia o ponto onde o primeiro dash termina e observe para qual lado os seguintes avançam.';
        if (now >= state.dashEndsAt) beginMove(now);
        return;
      }

      if (state.phase === 'move') {
        const target = angleToXY(state.scenario.solved.angle, DODGE_R);
        const td = Math.hypot(state.player.x-target.x, state.player.y-target.y);
        const wasCorrect = state.onCorrectSpot;
        state.onCorrectSpot = td <= SAFE_RADIUS;
        if (state.onCorrectSpot && state.enteredAt === null) state.enteredAt = now;
        if (!state.onCorrectSpot && wasCorrect && state.enteredAt !== null && now-state.enteredAt < 120) state.enteredAt = null;

        const remain = Math.max(0, state.snapshotAt-now);
        timeHud.textContent = (remain/1000).toFixed(1)+'s';
        const whole = Math.ceil(remain/1000);
        if (remain <= 3000 && remain > 0) banner.textContent = `${whole}… ${state.onCorrectSpot ? 'SPOT OK' : 'MOVE'}`;
        else if (state.onCorrectSpot) banner.textContent = '✓ SPOT OK — HOLD';
        else banner.textContent = `#${state.scenario.number} — MOVE`;

        msg.textContent = state.onCorrectSpot
          ? 'Você está no spot correto. Segure até o snapshot.'
          : 'Corra para o seu spot. A câmera continua livre durante a resolução.';
        spinHud.textContent = state.hints ? state.scenario.rotation : 'DECIDE';

        if (now >= state.snapshotAt) finishRound(now);
      }
    }
  }

  function line(x1,y1,x2,y2,w,color,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore();
  }
  function circle(x,y,r,fill,stroke=null,w=1,alpha=1){
    ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke();}ctx.restore();
  }
  function text(t,x,y,size,color,weight='700',align='center'){
    ctx.save();ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui,-apple-system,Segoe UI,sans-serif`;ctx.textAlign=align;ctx.textBaseline='middle';ctx.fillText(t,x,y);ctx.restore();
  }
  function drawArrowHead(x,y,angle,color,size=12){
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(size,0);ctx.lineTo(-size*.65,size*.65);ctx.lineTo(-size*.65,-size*.65);ctx.closePath();ctx.fill();ctx.restore();
  }

  function drawArena(now){
    ctx.clearRect(0,0,W,H);
    const g=ctx.createRadialGradient(CX,CY,20,CX,CY,R);g.addColorStop(0,'#23233b');g.addColorStop(.65,'#17192a');g.addColorStop(1,'#0b0d15');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);

    ctx.save();
    ctx.translate(CX,CY);
    ctx.rotate(state.cameraAngle);
    ctx.translate(-CX,-CY);

    circle(CX,CY,R,'rgba(29,31,48,.98)','#707793',4);
    circle(CX,CY,R-24,'rgba(0,0,0,0)','#353b51',1.5);
    for(let i=0;i<8;i++){
      const a=i*45; const p=angleToXY(a,R-26);
      line(CX,CY,p.x,p.y,1,'#343a50',.7);
    }
    circle(CX,CY,76,'rgba(100,90,150,.10)','#3d405a',2);

    for(const wm of WAYMARKS){
      const p=angleToXY(wm.angle,R-60);
      circle(p.x,p.y,24,COLORS[wm.mark]+'33',COLORS[wm.mark],2);
      text(wm.mark,p.x,p.y,20,'#ffffff','900');
    }

    if(state.scenario && state.phase !== 'prep'){
      const s=state.scenario;
      for(let i=0;i<8;i++){
        const p=angleToXY(22.5+i*45,DODGE_R);
        circle(p.x,p.y,SAFE_RADIUS,'rgba(255,255,255,.018)','#596177',1.5,.9);
      }

      const spinStep = s.rotation === 'CW' ? 45 : -45;
      const activeDash = state.phase === 'result' ? DASH_COUNT : Math.max(1, state.dashProgress || 1);
      const elapsed = state.phase === 'read' ? Math.max(0, now-state.dashStartAt) : DASH_COUNT*DASH_INTERVAL_MS;
      const localT = state.phase === 'read' ? Math.min(1,(elapsed % DASH_INTERVAL_MS)/DASH_INTERVAL_MS) : 1;

      for(let i=0;i<activeDash;i++){
        const originAngle = norm(s.origin.angle + spinStep*i);
        const origin = angleToXY(originAngle,R-92);
        const end = angleToXY(norm(originAngle+180),R-92);
        const isCurrent = state.phase==='read' && i===activeDash-1 && activeDash<=DASH_COUNT;
        const alpha = isCurrent ? .96 : Math.max(.15,.52 - (activeDash-1-i)*.055);
        const width = isCurrent ? 5 : 3;
        line(origin.x,origin.y,end.x,end.y,30,'#ff6379',isCurrent ? .13 : .035);
        line(origin.x,origin.y,end.x,end.y,width,'#ff6379',alpha);
        const ang=Math.atan2(end.y-origin.y,end.x-origin.x);
        drawArrowHead((origin.x+end.x)/2,(origin.y+end.y)/2,ang,'#ff8a9a',isCurrent?14:9);
        if(isCurrent){
          const kx=origin.x+(end.x-origin.x)*localT, ky=origin.y+(end.y-origin.y)*localT;
          circle(kx,ky,22,'#9c69cc','#e0b4ff',2);
          text('K',kx,ky,16,'#fff','900');
        }
      }

      if(state.phase==='read' && elapsed < 40){
        const origin=angleToXY(s.origin.angle,R-92);
        circle(origin.x,origin.y,22,'#9c69cc','#e0b4ff',2);text('K',origin.x,origin.y,16,'#fff','900');
      }

      if(state.hints){
        const rn=angleToXY(relNorth(s.origin.angle),DODGE_R);
        circle(rn.x,rn.y,16,'rgba(100,220,255,.12)','#6fe0ff',2);
        text('RN',rn.x,rn.y,10,'#a9efff','900');
        text(s.rotation,CX,CY-112,16,'#e4baff','900');
      }

      if(state.phase==='result'){
        const target=angleToXY(s.solved.angle,DODGE_R);
        circle(target.x,target.y,SAFE_RADIUS,'rgba(255,224,132,.14)','#ffe084',4);
        text('#'+s.number,target.x,target.y,18,'#ffe084','900');
        for(let n=1;n<=8;n++){
          const q=resolve(s.origin.angle,s.rotation,n);const p=angleToXY(q.angle,DODGE_R);
          circle(p.x,p.y,18,'rgba(20,22,30,.72)','#8992aa',1.5);text(String(n),p.x,p.y,12,'#f5f7ff','800');
        }
      }
    }

    if(state.phase==='move' && state.onCorrectSpot){
      circle(state.player.x,state.player.y,PLAYER_R+12,'rgba(98,217,159,.16)','#62d99f',3);
    } else {
      circle(state.player.x,state.player.y,PLAYER_R+6,'rgba(98,217,159,.15)');
    }
    circle(state.player.x,state.player.y,PLAYER_R,'#62d99f','#d8fff0',2);
    drawArrowHead(state.player.x,state.player.y-23,-Math.PI/2,'#d8fff0',7);

    ctx.restore();
  }

  function frame(ts){
    const dt=Math.min(.04,(ts-state.lastTs)/1000);state.lastTs=ts;
    update(dt,ts);drawArena(ts);requestAnimationFrame(frame);
  }

  function getStickVector(el, e){
    const r=el.getBoundingClientRect();const cx=r.left+r.width/2,cy=r.top+r.height/2;
    let dx=(e.clientX-cx)/(r.width*.36),dy=(e.clientY-cy)/(r.height*.36);
    const m=Math.hypot(dx,dy);if(m>1){dx/=m;dy/=m;}
    return {dx,dy,r};
  }
  function setMoveJoyFromEvent(e){
    const {dx,dy,r}=getStickVector(joy,e);
    state.joyX=dx;state.joyY=dy;
    joy.style.setProperty('--jx',(dx*r.width*.24)+'px');joy.style.setProperty('--jy',(dy*r.height*.24)+'px');
  }
  function releaseJoy(){state.joyX=0;state.joyY=0;state.pointerId=null;joy.style.setProperty('--jx','0px');joy.style.setProperty('--jy','0px');}
  function setCamJoyFromEvent(e){
    const {dx,dy,r}=getStickVector(camJoy,e);
    state.camJoyX=dx;state.camJoyY=dy;
    camJoy.style.setProperty('--jx',(dx*r.width*.24)+'px');camJoy.style.setProperty('--jy',(dy*r.height*.24)+'px');
  }
  function releaseCamJoy(){state.camJoyX=0;state.camJoyY=0;state.camJoyPointerId=null;camJoy.style.setProperty('--jx','0px');camJoy.style.setProperty('--jy','0px');}

  joy.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    state.pointerId=e.pointerId;joy.setPointerCapture(e.pointerId);setMoveJoyFromEvent(e);e.preventDefault();
  });
  joy.addEventListener('pointermove',e=>{if(e.pointerId===state.pointerId){e.stopPropagation();setMoveJoyFromEvent(e);e.preventDefault();}});
  joy.addEventListener('pointerup',e=>{e.stopPropagation();if(e.pointerId===state.pointerId)releaseJoy();});
  joy.addEventListener('pointercancel',e=>{e.stopPropagation();releaseJoy();});

  camJoy.addEventListener('pointerdown',e=>{
    e.stopPropagation();
    state.camJoyPointerId=e.pointerId;camJoy.setPointerCapture(e.pointerId);setCamJoyFromEvent(e);e.preventDefault();
  });
  camJoy.addEventListener('pointermove',e=>{if(e.pointerId===state.camJoyPointerId){e.stopPropagation();setCamJoyFromEvent(e);e.preventDefault();}});
  camJoy.addEventListener('pointerup',e=>{e.stopPropagation();if(e.pointerId===state.camJoyPointerId)releaseCamJoy();});
  camJoy.addEventListener('pointercancel',e=>{e.stopPropagation();releaseCamJoy();});

  function rotateCamera(delta){
    state.cameraAngle += delta;
    if (state.cameraAngle > Math.PI*4 || state.cameraAngle < -Math.PI*4) {
      state.cameraAngle = Math.atan2(Math.sin(state.cameraAngle),Math.cos(state.cameraAngle));
    }
  }

  sprintBtn.addEventListener('pointerdown',e=>{e.stopPropagation();activateSprint();e.preventDefault();});

  window.addEventListener('keydown',e=>{
    const k=e.key.toLowerCase();
    if(['arrowleft','arrowright','arrowup','arrowdown','w','a','s','d'].includes(k)){state.keys.add(k);e.preventDefault();}
    if(k==='shift'){activateSprint();}
    if(k==='q' && !e.repeat){rotateCamera(-Math.PI/8);e.preventDefault();}
    if(k==='e' && !e.repeat){rotateCamera(Math.PI/8);e.preventDefault();}
    if((k==='r'||k==='enter'||k===' ') && !e.repeat){newRound();e.preventDefault();}
  },{passive:false});
  window.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));

  function activateSprint(){
    const now=performance.now();
    if(now<state.sprintUntil) return;
    state.sprintUntil=now+2600;sprintBtn.classList.add('on');setTimeout(()=>sprintBtn.classList.remove('on'),2650);
  }
  startBtn.addEventListener('click',newRound);
  hintBtn.addEventListener('click',()=>{
    state.hints=!state.hints;hintBtn.textContent=state.hints?'Hints ON':'Hints OFF';hintBtn.setAttribute('aria-pressed',String(state.hints));
    if(state.scenario){
      spinHud.textContent = state.hints ? state.scenario.rotation : (state.phase==='result' ? state.scenario.rotation : (state.phase==='read' ? 'WATCH' : (state.phase==='move' ? 'DECIDE' : '—')));
    }
  });

  drawArena(performance.now());requestAnimationFrame(frame);
})();