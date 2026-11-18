(() => {
  const frames = [
    [document.querySelector('#daytona-race-replay iframe'), 'drive:daytona-replay-size'],
    [document.querySelector('#interlagos-road-replay iframe'), 'drive:interlagos-replay-size']
  ];
  window.addEventListener('message', event => {
    const match = frames.find(([frame,type]) => frame && event.source === frame.contentWindow && event.origin === location.origin && event.data?.type === type);
    if (!match) return;
    const [frame] = match;
    const height = event.data.height;
    if (Number.isFinite(height) && height >= 200 && height <= 1400) frame.height = String(Math.ceil(height));
  });
})();
