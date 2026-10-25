'use strict';
(async()=>{
  const fixture=window.RooklineCurrentPreview,presenter=fixture.presenter();
  await presenter.mountLayeredHud();
  const response=await fetch('assets/tyres.svg');
  if(!response.ok)throw Error('Tyre drawing unavailable');
  const parsed=new DOMParser().parseFromString(await response.text(),'image/svg+xml');
  if(parsed.querySelector('parsererror')||parsed.documentElement.localName!=='svg')throw Error('Invalid tyre drawing');
  const tyresSvg=document.importNode(parsed.documentElement,true);
  document.querySelector('.recent-tyres').replaceChildren(tyresSvg);
  const large=new window.LMUTyreHUD(tyresSvg,{staleAfterMs:0});
  if(!document.querySelector('.recent-compact svg'))throw Error('Driving drawing unavailable');
  const theme=window.RooklineManufacturerPreview(document.querySelector('.recent-compact svg'));
  const mode=document.getElementById('rookline-recent-mode');
  function apply(){
    const {source,discrete}=fixture.sample(mode.value);
    presenter.renderLayeredHud(source,0,discrete,source.vehicleName);
    large.applyFrame(fixture.tyreFrame(source));
    document.getElementById('rookline-recent-label').textContent=fixture.names[mode.value];
    window.currentPreviewSample={source,discrete};
  }
  mode.addEventListener('change',apply);
  document.getElementById('pause-motion').addEventListener('change',e=>{
    document.getElementById('rookline-recent-previews').classList.toggle('motion-paused',e.target.checked);
  });
  apply();window.currentPreview={presenter,large,apply,theme};
})().catch(problem=>{
  const error=document.getElementById('rookline-recent-error');error.hidden=false;
  error.textContent='Preview could not start: '+problem.message;console.error(problem);
});
