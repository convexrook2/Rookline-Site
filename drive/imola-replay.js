/* Recorded surface playback; no live connection or model calculation. */

  (async()=>{
    const root=document.getElementById('imola-after-fix-v1');
    const asset=new URL('assets/imola-wetness.json?v=imola-1',document.currentScript.src);
    const response=await fetch(asset);if(!response.ok)return;const data=await response.json();
    const query=s=>root.querySelector(s),ns='http://www.w3.org/2000/svg';
    const slider=query('#imola-wetness-time'),speedControl=query('#imola-wetness-speed'),play=query('[data-play]');
    const frames=data.frames,first=frames[0].t,last=frames.at(-1).t;
    const stops=[[0,[255,255,255]],[.05,[115,236,217]],[.125,[89,212,237]],[.4,[72,172,245]],[.6,[39,137,239]],[1,[52,120,230]]];
    const minimumX=Math.min(...data.path.map(p=>p[1])),maximumX=Math.max(...data.path.map(p=>p[1]));
    const minimumZ=Math.min(...data.path.map(p=>p[2])),maximumZ=Math.max(...data.path.map(p=>p[2]));
    const scale=Math.min(624/(maximumX-minimumX),300/(maximumZ-minimumZ));
    const map=data.path.map(p=>[p[0],340+(p[1]-(minimumX+maximumX)/2)*scale,175-(p[2]-(minimumZ+maximumZ)/2)*scale]);
    const outline=map.map((p,i)=>(i?'L':'M')+p[1].toFixed(2)+','+p[2].toFixed(2)).join(' ');
    query('[data-outline]').setAttribute('d',outline);
    query('.imola-map').removeAttribute('hidden');query('[data-poster]').hidden=true;
    const gradients=query('[data-gradients]'),segments=query('[data-segments]'),paints=[];
    function node(tag,attributes){const e=document.createElementNS(ns,tag);Object.entries(attributes).forEach(([k,v])=>e.setAttribute(k,v));return e;}
    for(let i=0;i<map.length-1;i++){
      const a=map[i],b=map[i+1],id='imola-after-gradient-'+i;
      const gradient=node('linearGradient',{id,gradientUnits:'userSpaceOnUse',x1:a[1],y1:a[2],x2:b[1],y2:b[2]});
      const start=node('stop',{offset:0}),end=node('stop',{offset:1});gradient.append(start,end);gradients.append(gradient);
      segments.append(node('path',{d:`M${a[1]},${a[2]} L${b[1]},${b[2]}`,stroke:`url(#${id})`}));
      paints.push([a[0],b[0],start,end]);
    }
    const clock=t=>Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0');
    function colour(value){const v=Math.max(0,Math.min(1,value));let i=1;while(i<stops.length-1&&v>stops[i][0])i++;const a=stops[i-1],b=stops[i],u=(v-a[0])/(b[0]-a[0]);return 'rgb('+a[1].map((c,k)=>Math.round(c+(b[1][k]-c)*u)).join(',')+')';}
    function sample(t){let low=0,high=frames.length-1;while(low<high){const m=Math.ceil((low+high)/2);if(frames[m].t<=t)low=m;else high=m-1;}const a=frames[low],b=frames[Math.min(low+1,frames.length-1)],u=a===b?0:(t-a.t)/(b.t-a.t);return {cells:a.cells.map((v,i)=>v+(b.cells[i]-v)*u)};}
    let time=first,speed=40,running=false,previous=0,animation=0;
    function render(){const state=sample(time),cells=state.cells,n=cells.length;
      const at=d=>{const p=d/data.length*n-.5,i=Math.floor(p),u=p-i;return cells[(i%n+n)%n]*(1-u)+cells[((i+1)%n+n)%n]*u;};
      for(const [a,b,start,end] of paints){start.setAttribute('stop-color',colour(at(a)));end.setAttribute('stop-color',colour(at(b)));}
      query('[data-time]').textContent=clock(time);
      slider.value=time;
      play.textContent=running?'Pause':'Play';play.setAttribute('aria-label',running?'Pause wetness replay':'Play wetness replay');
    }
    function pause(){running=false;cancelAnimationFrame(animation);previous=0;render();}
    function tick(now){if(!running)return;if(!previous)previous=now;if(now-previous>=40){time=Math.min(last,time+Math.min((now-previous)/1000,.25)*speed);previous=now;render();}if(time>=last){pause();query('[data-status]').textContent='Replay completed.';return;}animation=requestAnimationFrame(tick);}
    play.addEventListener('click',()=>{if(running)pause();else{if(time>=last)time=first;running=true;previous=0;render();animation=requestAnimationFrame(tick);}query('[data-status]').textContent=(running?'Playing at ':'Paused at ')+clock(time);});
    slider.addEventListener('input',()=>{const selected=Number(slider.value);pause();time=Math.max(first,Math.min(last,selected));render();});
    slider.addEventListener('change',()=>{query('[data-status]').textContent='Selected '+clock(time);});
    speedControl.addEventListener('change',()=>{speed=Number(speedControl.value);});
    query('[data-start]').addEventListener('click',()=>{pause();time=first;render();query('[data-status]').textContent='Replay at beginning.';});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&running)pause();});
    render();query('.imola-controls').hidden=false;
    new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting)&&running)pause();}).observe(root);
  })().catch(()=>{});
  
