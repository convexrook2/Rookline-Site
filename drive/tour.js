'use strict';
const tourSteps=[...document.querySelectorAll('[data-tour-step]')];
const tourStops=[...document.querySelectorAll('[data-step]')];
const tourModes=[...document.querySelectorAll('[data-mode-button]')];
const tourBodies=[...document.querySelectorAll('[data-mode]')];
const tourPrev=document.getElementById('tour-prev');
const tourNext=document.getElementById('tour-next');
const tourProgress=document.getElementById('tour-progress');
let tourIndex=0,tourMode='desktop';
function showTourStep(index,focus=false){
 tourIndex=Math.max(0,Math.min(tourSteps.length-1,index));
 tourSteps.forEach((step,i)=>{step.hidden=i!==tourIndex;});
 tourStops.forEach((button,i)=>{if(i===tourIndex)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
 tourPrev.disabled=tourIndex===0;
 tourNext.textContent=tourIndex===tourSteps.length-1?'Start again ↺':'Next stop →';
 tourProgress.textContent=`Step ${tourIndex+1} of ${tourSteps.length}`;
 if(focus)tourSteps[tourIndex].querySelector('h2').focus();
}
function setTourMode(mode){
 tourMode=mode==='vr'?'vr':'desktop';
 tourModes.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.modeButton===tourMode)));
 tourBodies.forEach(body=>{body.hidden=body.dataset.mode!==tourMode;});
}
tourStops.forEach(button=>button.addEventListener('click',()=>showTourStep(Number(button.dataset.step),true)));
tourModes.forEach(button=>button.addEventListener('click',()=>setTourMode(button.dataset.modeButton)));
tourPrev.addEventListener('click',()=>showTourStep(tourIndex-1,true));
tourNext.addEventListener('click',()=>showTourStep(tourIndex===tourSteps.length-1?0:tourIndex+1,true));
for(const id of ['tour-mode','tour-stops','tour-controls'])document.getElementById(id).hidden=false;
setTourMode('desktop');showTourStep(0);
