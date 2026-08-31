// One-off: how many animation frames a second does this browser actually run?
(() => new Promise((resolve) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => {
    n++;
    if (performance.now() - t0 < 1000) requestAnimationFrame(tick);
    else resolve(`${n} frames in ${Math.round(performance.now() - t0)}ms`);
  };
  requestAnimationFrame(tick);
}))();
