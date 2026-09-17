(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas=$('game'), ctx=canvas.getContext('2d'), stage=$('stage');
  const startBtn=$('startBtn'), difficulty=$('difficulty'), hintBtn=$('hintBtn'), sprintBtn=$('sprintBtn');
  const joy=$('joy'), camJoy=$('camJoy'), banner=$('banner'), msg=$('msg'), lcBadge=$('lcBadge');
  const numHud=$('numHud'), spinHud=$('spinHud'), scoreHud=$('scoreHud'), timeHud=$('timeHud');

  const W=960,H=600,R=100,DODGE_R=81,SAFE_R=16,PREP=1600,DASH_MS=760,DASHES=8;
  const WAYMARKS=[['A',0],['2',45],['B',90],['3',135],['C',180],['4',225],['D',270],['1',315]];
  const MARK_COL={A:'#ef5350',B:'#ef5350',C:'#ef5350',D:'#ef5350','1':'#4b8cff','2':'#4b8cff','3':'#4b8cff','4':'#4b8cff'};
  const state={phase:'idle',scenario:null,player:{x:0,z:0},cam:0,joyX:0,joyY:0,camX:0,keys:new Set(),
    movePid:null,camPid:null,sprintUntil:0,prepEnd:0,dashStart:0,dashEnd:0,snapshot:0,moveMs:5000,
    dash:0,hints:false,score:0,attempts:0,enteredAt:null,onSpot:false,last:performance.now()};

  const norm=a=>((a%360)+360)%360;
  const pt=(deg,r)=>{const a=deg*Math.PI/180;return{x:r*Math.sin(a),z:-r*Math.cos(a)}};
  const relNorth=a=>norm(a+180);
  function solve(origin,rotation,n){
    const dir=rotation==='CCW'?1:-1;
    return norm(relNorth(origin)+dir*(45*n-22.5));
  }
  function deal(){
    const origin=WAYMARKS[Math.floor(Math.random()*8)][1];
    const rotation=Math.random()<.5?'CW':'CCW', number=1+Math.floor(Math.random()*8);
    return {origin,rotation,number,target:solve(origin,rotation,number)};
  }
  function dist(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}

  function newRound(){
    const now=performance.now(); state.scenario=deal(); state.phase='prep'; state.player={x:0,z:0}; state.cam=0;
    state.moveMs=Math.max(3000,+difficulty.value||5000); state.prepEnd=now+PREP; state.dash=0; state.enteredAt=null; state.onSpot=false;
    state.sprintUntil=0; sprintBtn.classList.remove('on');
    lcBadge.textContent='?'; lcBadge.classList.remove('even'); numHud.textContent='—'; spinHud.textContent='—'; timeHud.textContent='READY';
    banner.textContent='GET READY'; msg.textContent='Use MOVE para andar e CAM para girar a câmera.'; startBtn.textContent='Retry'; stage.focus({preventScroll:true});
  }
  function beginRead(now){
    state.phase='read'; state.dashStart=now; state.dashEnd=now+DASHES*DASH_MS; state.dash=1;
    banner.textContent='WATCH THE DASHES'; spinHud.textContent=state.hints?state.scenario.rotation:'WATCH'; timeHud.textContent='READ';
    msg.textContent='Leia o primeiro dash e descubra sozinho se o padrão gira para a direita ou esquerda.';
  }
  function beginMove(now){
    state.phase='move'; state.snapshot=now+state.moveMs; state.enteredAt=null;
    const n=state.scenario.number; lcBadge.textContent=n; lcBadge.classList.toggle('even',n%2===0); numHud.textContent='#'+n;
    spinHud.textContent=state.hints?state.scenario.rotation:'DECIDE'; banner.textContent=`#${n} — MOVE`; timeHud.textContent=(state.moveMs/1000).toFixed(1)+'s';
    msg.textContent='Resolva o número e corra até seu spot antes do snapshot.';
  }
  function finish(now){
    const t=pt(state.scenario.target,DODGE_R), d=dist(state.player,t), ok=d<=SAFE_R;
    state.phase='result'; state.attempts++; if(ok)state.score++;
    scoreHud.textContent=`${state.score} / ${state.attempts}`; banner.textContent=ok?'✓ SAFE':'✕ WIPE'; spinHud.textContent=state.scenario.rotation;
    const reaction=state.enteredAt?(state.enteredAt-(state.snapshot-state.moveMs))/1000:null;
    timeHud.textContent=reaction!=null?reaction.toFixed(2)+'s':'—';
    msg.textContent=ok?`Acertou #${state.scenario.number}${reaction!=null?` · ${reaction.toFixed(2)}s`:''}.`:`Wipe — o spot correto foi revelado.`;
  }

  function rotateCamera(d){state.cam+=d;if(Math.abs(state.cam)>Math.PI*4)state.cam=Math.atan2(Math.sin(state.cam),Math.cos(state.cam))}
  function update(dt,now){
    let x=state.joyX,y=state.joyY;
    if(state.keys.has('a')||state.keys.has('arrowleft'))x-=1;if(state.keys.has('d')||state.keys.has('arrowright'))x+=1;
    if(state.keys.has('w')||state.keys.has('arrowup'))y-=1;if(state.keys.has('s')||state.keys.has('arrowdown'))y+=1;
    const m=Math.hypot(x,y);if(m>1){x/=m;y/=m}
    if(Math.abs(state.camX)>.12)rotateCamera(state.camX*dt*2.6);
    const ca=Math.cos(state.cam),sa=Math.sin(state.cam), speed=now<state.sprintUntil?95:68;
    if(state.phase!=='result'){
      state.player.x+=(ca*x+sa*y)*speed*dt;
      state.player.z+=(-sa*x+ca*y)*speed*dt;
      const r=Math.hypot(state.player.x,state.player.z),max=R-4;if(r>max){state.player.x*=max/r;state.player.z*=max/r}
    }
    if(state.phase==='prep'&&now>=state.prepEnd)beginRead(now);
    if(state.phase==='read'){
      const elapsed=Math.max(0,now-state.dashStart);state.dash=Math.min(DASHES,Math.floor(elapsed/DASH_MS)+1);
      banner.textContent=`DASH ${state.dash} / 8`;timeHud.textContent='D'+state.dash;spinHud.textContent=state.hints?state.scenario.rotation:'WATCH';
      if(now>=state.dashEnd)beginMove(now);
    }else if(state.phase==='move'){
      const target=pt(state.scenario.target,DODGE_R), d=dist(state.player,target);state.onSpot=d<=SAFE_R;
      if(state.onSpot&&state.enteredAt==null)state.enteredAt=now;
      const remain=Math.max(0,state.snapshot-now);timeHud.textContent=(remain/1000).toFixed(1)+'s';
      if(remain<=3000&&remain>0)banner.textContent=`${Math.ceil(remain/1000)}… ${state.onSpot?'SPOT OK':'MOVE'}`;
      else banner.textContent=state.onSpot?'✓ SPOT OK — HOLD':`#${state.scenario.number} — MOVE`;
      if(now>=state.snapshot)finish(now);
    }
  }

  function camCoords(x,z){const dx=x-state.player.x,dz=z-state.player.z,ca=Math.cos(state.cam),sa=Math.sin(state.cam);return{right:ca*dx-sa*dz,forward:-sa*dx-ca*dz}}
  function project(x,z,h=0){const c=camCoords(x,z),pers=clamp(1-c.forward/350,.55,1.5);return{x:W/2+c.right*4.0*pers,y:H*.72-c.forward*2.15-h*pers,s:pers,d:c.forward}}
  function poly(points,fill,stroke=null,w=1,a=1){if(points.length<3)return;ctx.save();ctx.globalAlpha=a;ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill()}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke()}ctx.restore()}
  function line(points,color,w=1,a=1){if(points.length<2)return;ctx.save();ctx.globalAlpha=a;ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);ctx.stroke();ctx.restore()}
  function circle(x,y,r,fill,stroke=null,w=1,a=1){ctx.save();ctx.globalAlpha=a;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.stroke()}ctx.restore()}
  function ellipse(x,y,rx,ry,fill,a=1){ctx.save();ctx.globalAlpha=a;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.restore()}
  function text(t,x,y,size,color='#fff',weight='800'){ctx.save();ctx.fillStyle=color;ctx.font=`${weight} ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='rgba(0,0,0,.8)';ctx.shadowBlur=4;ctx.fillText(t,x,y);ctx.restore()}
  function groundCircle(x,z,r,fill,stroke,w=1,a=1){const pts=[];for(let i=0;i<32;i++){const q=i/32*Math.PI*2;pts.push(project(x+Math.cos(q)*r,z+Math.sin(q)*r))}poly(pts,fill,stroke,w,a)}
  function lane(a,b,half,active){const dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz)||1,nx=-dz/L*half,nz=dx/L*half;poly([project(a.x+nx,a.z+nz),project(b.x+nx,b.z+nz),project(b.x-nx,b.z-nz),project(a.x-nx,a.z-nz)],active?'rgba(187,78,230,.30)':'rgba(187,78,230,.055)',active?'#d78cff':'#74468c',active?2:1,active?1:.38)}

  function drawFloor(){
    const sky=ctx.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#666a80');sky.addColorStop(.44,'#34384f');sky.addColorStop(1,'#090b12');ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
    for(let i=0;i<32;i++){const a0=i/32*Math.PI*2,a1=(i+1)/32*Math.PI*2,p=[project(0,0)];for(let j=0;j<=3;j++){const a=a0+(a1-a0)*j/3;p.push(project(Math.cos(a)*R,Math.sin(a)*R))}poly(p,i%2?'#1d2235':'#252a40')}
    for(const rr of [34,68,98]){const pts=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;pts.push(project(Math.cos(a)*rr,Math.sin(a)*rr))}line(pts,rr===98?'#607a96':'#2e3b55',rr===98?3:1.2,rr===98?.9:.75)}
    for(let i=0;i<16;i++){const a=i*Math.PI/8;line([project(0,0),project(Math.cos(a)*98,Math.sin(a)*98)],i%2?'#242d44':'#38455f',1,.7)}
  }
  function drawWaymark(mark,ang){const p=pt(ang,80),g=project(p.x,p.z),s=clamp(g.s,.65,1.45),col=MARK_COL[mark];ctx.save();ctx.translate(g.x,g.y);ctx.scale(1,.46);ctx.rotate(Math.PI/4);ctx.globalAlpha=.28;ctx.fillStyle=col;ctx.fillRect(-18*s,-18*s,36*s,36*s);ctx.restore();line([{x:g.x,y:g.y-3},{x:g.x,y:g.y-36*s}],col,2,.65);circle(g.x,g.y-45*s,18*s,col+'55',col,2);text(mark,g.x,g.y-45*s,15*s)}
  function drawBoss(x,z){const g=project(x,z),s=clamp(g.s,.6,1.45);ellipse(g.x,g.y+3,22*s,6*s,'rgba(0,0,0,.4)');ctx.save();ctx.translate(g.x,g.y-22*s);ctx.scale(s,s);ctx.fillStyle='#8b4ed0';ctx.strokeStyle='#e0b7ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-35);ctx.quadraticCurveTo(-15,-20,-15,7);ctx.lineTo(-25,26);ctx.lineTo(-6,17);ctx.lineTo(0,31);ctx.lineTo(7,16);ctx.lineTo(25,25);ctx.lineTo(15,5);ctx.quadraticCurveTo(14,-20,0,-35);ctx.fill();ctx.stroke();ctx.strokeStyle='#c977ff';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-8,-16);ctx.quadraticCurveTo(-33,-29,-43,-6);ctx.moveTo(8,-16);ctx.quadraticCurveTo(33,-29,43,-6);ctx.stroke();circle(0,-40,8,'#efc5b3','#fff',1);ctx.restore();text('Kefka',g.x,g.y-67*s,11*s,'#f1dcff')}
  function drawPlayer(){const x=W/2,y=H*.72,b=Math.sin(performance.now()/130)*1.2;ellipse(x,y+8,24,7,'rgba(0,0,0,.45)');ctx.save();ctx.translate(x,y-7+b);ctx.fillStyle='#efe9dc';ctx.strokeStyle='#bcb1ad';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-31);ctx.quadraticCurveTo(-16,-8,-18,28);ctx.lineTo(18,28);ctx.quadraticCurveTo(16,-8,0,-31);ctx.fill();ctx.stroke();ctx.strokeStyle='#9a7bff';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(-9,-5);ctx.lineTo(-13,24);ctx.moveTo(9,-5);ctx.lineTo(13,24);ctx.stroke();circle(0,-41,10,'#e1bda0','#24232c',2);circle(0,-49,8,'#d8d8df','#3a3944',1);ctx.strokeStyle='#d7c577';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(18,-20);ctx.lineTo(27,26);ctx.stroke();circle(16,-23,6,'#8e80ff','#eee9ff',2);ctx.restore();text('H1',x,y-76,11,'#baffcf')}
  function drawLC(){if(state.phase!=='move'&&state.phase!=='result')return;const n=state.scenario.number,x=W/2,y=H*.72-112;circle(x,y,24,n%2?'#386bbd':'#b52f48','#fff',2);text(n,x,y,21)}
  function drawCast(now){if(!['read','move'].includes(state.phase))return;let p,label;if(state.phase==='read'){p=clamp((now-state.dashStart)/(state.dashEnd-state.dashStart),0,1);label='Limit Cut — reading dashes'}else{p=1-clamp((state.snapshot-now)/state.moveMs,0,1);label='Limit Cut — resolve'}const w=280,x=W/2-w/2,y=H-22;ctx.fillStyle='rgba(8,10,16,.82)';ctx.fillRect(x-6,y-18,w+12,31);ctx.fillStyle='#252b40';ctx.fillRect(x,y,w,9);ctx.fillStyle=state.phase==='read'?'#7f61dc':'#d0a74c';ctx.fillRect(x,y,w*p,9);text(label,W/2,y-9,11)}

  function draw(now){
    ctx.clearRect(0,0,W,H);drawFloor();
    if(state.scenario&&state.phase!=='prep'&&state.phase!=='idle'){
      const s=state.scenario,step=s.rotation==='CW'?45:-45,active=state.phase==='result'?8:Math.max(1,state.dash);
      const elapsed=state.phase==='read'?Math.max(0,now-state.dashStart):8*DASH_MS,local=state.phase==='read'?Math.min(1,(elapsed%DASH_MS)/DASH_MS):1;
      for(let i=0;i<active;i++){const oa=norm(s.origin+step*i),a=pt(oa,70),b=pt(norm(oa+180),70);lane(a,b,i===active-1&&state.phase==='read'?5:3,i===active-1&&state.phase==='read')}
      if(state.hints&&state.phase!=='result')for(let i=0;i<8;i++){const q=pt(22.5+i*45,DODGE_R);groundCircle(q.x,q.z,SAFE_R,'rgba(255,255,255,.012)','#79829a',1,.55)}
      const sorted=[...WAYMARKS].sort((a,b)=>project(pt(b[1],80).x,pt(b[1],80).z).d-project(pt(a[1],80).x,pt(a[1],80).z).d);for(const w of sorted)drawWaymark(w[0],w[1]);
      if(state.phase==='read'){const i=active-1,oa=norm(s.origin+step*i),a=pt(oa,70),b=pt(norm(oa+180),70);drawBoss(a.x+(b.x-a.x)*local,a.z+(b.z-a.z)*local)}else{const oa=norm(s.origin+step*7),b=pt(norm(oa+180),70);drawBoss(b.x,b.z)}
      if(state.hints){const q=pt(relNorth(s.origin),DODGE_R),g=project(q.x,q.z);text('REL N',g.x,g.y-18,11,'#78ecff')}
      if(state.phase==='result'){const q=pt(s.target,DODGE_R);groundCircle(q.x,q.z,SAFE_R,'rgba(255,224,132,.17)','#ffe084',3,.95);const g=project(q.x,q.z);text('#'+s.number,g.x,g.y-14,15,'#ffe084')}
    } else for(const w of WAYMARKS)drawWaymark(w[0],w[1]);
    drawPlayer();drawLC();drawCast(now);
    const v=ctx.createRadialGradient(W/2,H*.5,H*.2,W/2,H*.5,W*.7);v.addColorStop(.5,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,0,.38)');ctx.fillStyle=v;ctx.fillRect(0,0,W,H);
  }
  function frame(now){const dt=Math.min(.04,(now-state.last)/1000);state.last=now;update(dt,now);draw(now);requestAnimationFrame(frame)}

  function stick(el,e){const r=el.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;let x=(e.clientX-cx)/(r.width*.36),y=(e.clientY-cy)/(r.height*.36),m=Math.hypot(x,y);if(m>1){x/=m;y/=m}return{x,y,r}}
  function bindStick(el,type){
    el.addEventListener('pointerdown',e=>{e.stopPropagation();const s=stick(el,e);if(type==='move'){state.movePid=e.pointerId;state.joyX=s.x;state.joyY=s.y}else{state.camPid=e.pointerId;state.camX=s.x}el.setPointerCapture(e.pointerId);el.style.setProperty('--jx',s.x*s.r.width*.24+'px');el.style.setProperty('--jy',s.y*s.r.height*.24+'px');e.preventDefault()});
    el.addEventListener('pointermove',e=>{const id=type==='move'?state.movePid:state.camPid;if(e.pointerId!==id)return;const s=stick(el,e);if(type==='move'){state.joyX=s.x;state.joyY=s.y}else state.camX=s.x;el.style.setProperty('--jx',s.x*s.r.width*.24+'px');el.style.setProperty('--jy',s.y*s.r.height*.24+'px');e.preventDefault()});
    const up=e=>{if(type==='move'&&e.pointerId===state.movePid){state.movePid=null;state.joyX=state.joyY=0}else if(type==='cam'&&e.pointerId===state.camPid){state.camPid=null;state.camX=0}else return;el.style.setProperty('--jx','0px');el.style.setProperty('--jy','0px')};el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  }
  bindStick(joy,'move');bindStick(camJoy,'cam');
  sprintBtn.addEventListener('pointerdown',e=>{e.stopPropagation();const now=performance.now();if(now>=state.sprintUntil){state.sprintUntil=now+2600;sprintBtn.classList.add('on');setTimeout(()=>sprintBtn.classList.remove('on'),2650)}e.preventDefault()});
  startBtn.addEventListener('click',newRound);
  hintBtn.addEventListener('click',()=>{state.hints=!state.hints;hintBtn.textContent=state.hints?'Hints ON':'Hints OFF';hintBtn.setAttribute('aria-pressed',state.hints);if(state.scenario)spinHud.textContent=state.hints?state.scenario.rotation:(state.phase==='result'?state.scenario.rotation:state.phase==='read'?'WATCH':state.phase==='move'?'DECIDE':'—')});
  window.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(['w','a','s','d','arrowleft','arrowright','arrowup','arrowdown'].includes(k)){state.keys.add(k);e.preventDefault()}if(k==='q')rotateCamera(-.18);if(k==='e')rotateCamera(.18);if((k==='r'||k==='enter'||k===' ')&&!e.repeat){newRound();e.preventDefault()}},{passive:false});
  window.addEventListener('keyup',e=>state.keys.delete(e.key.toLowerCase()));
  draw(performance.now());requestAnimationFrame(frame);
})();
