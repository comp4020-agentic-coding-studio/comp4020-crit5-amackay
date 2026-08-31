// One-off: the --h custom property on each ball, sampled through a fall.
(() => new Promise((resolve) => {
  const out = [];
  const t0 = performance.now();
  const tick = () => {
    const ms = Math.round(performance.now() - t0);
    out.push(ms + "ms " + [...document.querySelectorAll(".ball")]
      .map((b) => (+b.style.getPropertyValue("--h")).toFixed(3)).join(" "));
    if (performance.now() - t0 < 620) requestAnimationFrame(tick);
    else resolve(JSON.stringify(out.filter((_, i) => i % 5 === 0)));
  };
  requestAnimationFrame(tick);
}))();
