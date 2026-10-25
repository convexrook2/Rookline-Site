'use strict';
(async()=>{
  const $=id=>document.getElementById(id),panel=$('panel');
  const fixture=window.RooklineCurrentPreview,presenter=fixture.presenter();
  await presenter.mountLayeredHud();
  const root=document.querySelector('#lmuLiveDriveLayeredHudMount svg');
  if(!root)throw Error('Driving drawing unavailable');
  const theme=window.RooklineManufacturerPreview(root);
  function render(){
    const p=+$('progress').value/100,{source,discrete}=fixture.sample('clear');
    source.player.rpm=p*source.player.maxRpm*.98;
    source.player.gear=$('gear').value==='N'?0:1;
    presenter.renderLayeredHud(source,0,discrete,source.vehicleName);
    $('percent').value=`${(p*100).toFixed(1)}%`;
    $('readout').textContent=p>=1?'Full red · arc endpoint reached':p>.875?'Continuous white fill · coloured endpoint tip':'Continuous white fill';
  }
  function resize(w){w=Math.max(240,Math.min(1000,w));panel.style.width=`${w}px`;$('width').value=w;$('dimensions').value=`${Math.round(w)} × ${Math.round(w*580/855)} px`;}
  let offset={x:0,y:0},drag=null;
  panel.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,offset:{...offset},width:panel.getBoundingClientRect().width,resize:e.target===$('handle')};panel.setPointerCapture(e.pointerId);panel.focus();});
  panel.addEventListener('pointermove',e=>{if(!drag)return;if(drag.resize)resize(drag.width+e.clientX-drag.x);else{offset={x:drag.offset.x+e.clientX-drag.x,y:drag.offset.y+e.clientY-drag.y};panel.style.transform=`translate(${offset.x}px,${offset.y}px)`;}});
  const release=()=>{drag=null;};panel.addEventListener('pointerup',release);panel.addEventListener('pointercancel',release);panel.addEventListener('lostpointercapture',release);
  panel.addEventListener('keydown',e=>{const d=e.shiftKey?10:1,moves={ArrowLeft:[-d,0],ArrowRight:[d,0],ArrowUp:[0,-d],ArrowDown:[0,d]};if(e.target!==panel||!moves[e.key])return;e.preventDefault();offset.x+=moves[e.key][0];offset.y+=moves[e.key][1];panel.style.transform=`translate(${offset.x}px,${offset.y}px)`;});
  $('progress').addEventListener('input',render);$('gear').addEventListener('change',render);$('width').addEventListener('input',()=>resize(+$('width').value));
  document.querySelectorAll('[data-progress]').forEach(b=>b.addEventListener('click',()=>{$('progress').value=b.dataset.progress;render();}));
  document.querySelectorAll('[data-width]').forEach(b=>b.addEventListener('click',()=>resize(+b.dataset.width)));
  $('reference-opacity').addEventListener('input',()=>{$('reference').style.opacity=+$('reference-opacity').value/100;$('opacity-value').value=`${$('reference-opacity').value}%`;});
  $('reset').addEventListener('click',()=>{offset={x:0,y:0};panel.style.transform='';resize(Math.min(640,$('stage').clientWidth-40));});
  resize(Math.min(640,$('stage').clientWidth-40));render();window.speedoPreview={render,resize,root,presenter,theme};
})().catch(error=>{document.getElementById('readout').textContent=error.message;console.error(error);});
