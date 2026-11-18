/* Saved-run projection. Playback never connects to a game or runs a water model. */
(async()=>{
  const root=document.getElementById('interlagos-road-evolution'),q=s=>root.querySelector(s);
  const asset=new URL('assets/interlagos-road-evolution.json?v=combined-r8',document.currentScript.src);
  const response=await fetch(asset);if(!response.ok)throw new Error('Replay data unavailable');
  const data=await response.json(),frames=data.frames,first=frames[0].t,last=frames.at(-1).t;
  const slider=q('#interlagos-time'),speedControl=q('#interlagos-speed'),play=q('[data-play]');
  const ns='http://www.w3.org/2000/svg',palette=data.palette;
  const minX=Math.min(...data.path.map(p=>p[0])),maxX=Math.max(...data.path.map(p=>p[0]));
  const minZ=Math.min(...data.path.map(p=>p[1])),maxZ=Math.max(...data.path.map(p=>p[1]));
  const scale=Math.min(624/(maxX-minX),300/(maxZ-minZ));
  const map=data.path.map(p=>[340+(p[0]-(minX+maxX)/2)*scale,175-(p[1]-(minZ+maxZ)/2)*scale]);
  const node=(tag,attrs)=>{const e=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))e.setAttribute(k,v);return e;};
  q('[data-outline]').setAttribute('d',map.map((p,i)=>(i?'L':'M')+p.join(',')).join(' '));
  const paints=[];
  for(let i=0;i<map.length-1;i++){
    const a=map[i],b=map[i+1],id='interlagos-gradient-'+i;
    const gradient=node('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:a[0],y1:a[1],x2:b[0],y2:b[1]});
    const start=node('stop',{offset:0}),end=node('stop',{offset:1});gradient.append(start,end);q('[data-gradients]').append(gradient);
    q('[data-segments]').append(node('path',{d:`M${a.join(',')} L${b.join(',')}`,stroke:`url(#${id})`}));paints.push([start,end]);
  }
  function colour(value){const w=Math.max(0,Math.min(1,value));let j=1;while(j<palette.length-1&&w>palette[j][0])j++;const a=palette[j-1],b=palette[j],u=(w-a[0])/(b[0]-a[0]);return 'rgb('+a[1].map((v,k)=>Math.round(v+(b[1][k]-v)*u)).join(',')+')';}
  const clock=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
  function sample(t){let low=0,high=frames.length-1;while(low<high){const mid=Math.ceil((low+high)/2);if(frames[mid].t<=t)low=mid;else high=mid-1;}const a=frames[low],b=frames[Math.min(low+1,frames.length-1)],u=a===b?0:(t-a.t)/(b.t-a.t);return {cells:a.cells.map((v,i)=>(v+(b.cells[i]-v)*u)/1e6),mean:a.mean+(b.mean-a.mean)*u};}
  let time=first,speed=40,running=false,previous=0,animation=0;
  function render(){
    const state=sample(time),n=state.cells.length;
    const at=j=>{const u=j/(map.length-1)*n,k=Math.floor(u)%n,f=u-Math.floor(u);return state.cells[k]*(1-f)+state.cells[(k+1)%n]*f;};
    paints.forEach(([a,b],i)=>{a.setAttribute('stop-color',colour(at(i)));b.setAttribute('stop-color',colour(at(i+1)));});
    slider.value=time;q('[data-time]').textContent=clock(time);root.dataset.time=time;root.dataset.mean=state.mean;
    play.textContent=running?'Pause':'Play';play.setAttribute('aria-label',(running?'Pause':'Play')+' Interlagos wetness replay');
  }
  function pause(){running=false;cancelAnimationFrame(animation);previous=0;}
  function tick(now){if(!running)return;if(!previous)previous=now;if(now-previous>=40){time=Math.min(last,time+Math.min((now-previous)/1000,.25)*speed);previous=now;render();}if(time>=last){pause();render();q('[data-status]').textContent='Replay completed.';}else animation=requestAnimationFrame(tick);}
  play.addEventListener('click',()=>{if(running)pause();else{if(time>=last)time=first;running=true;previous=0;animation=requestAnimationFrame(tick);}render();q('[data-status]').textContent=(running?'Playing from ':'Paused at ')+clock(time);});
  slider.addEventListener('input',()=>{pause();time=Math.max(first,Math.min(last,+slider.value));render();});
  slider.addEventListener('change',()=>{q('[data-status]').textContent='Selected '+clock(time);});
  speedControl.addEventListener('change',()=>{speed=+speedControl.value;});
  q('[data-start]').addEventListener('click',()=>{pause();time=first;render();q('[data-status]').textContent='Replay at beginning.';});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&running){pause();render();}});
  new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)&&running){pause();render();}}).observe(root);
  const report=()=>parent!==window&&parent.postMessage({type:'drive:interlagos-replay-size',height:Math.ceil(root.getBoundingClientRect().height)},location.origin);
  new ResizeObserver(report).observe(root);render();report();
})().catch(error=>console.warn(error.message));
