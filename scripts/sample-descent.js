// One-off: release a ball onto a neighbour and sample the neighbour's position
// over the following half second, to see whether the shove takes time.
(() => {
  const stage = document.querySelector("#stage");
  const r = parseFloat(getComputedStyle(stage).getPropertyValue("--r"));
  const centreOf = (el) => {
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    const d = parseFloat(el.style.width);
    return { x: parseFloat(m[1]) + d / 2, y: parseFloat(m[2]) + d / 2 };
  };
  const balls = () => [...document.querySelectorAll(".ball")].map(centreOf);
  const start = balls();
  const samples = [];
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      const now = performance.now() - t0;
      samples.push({
        ms: Math.round(now),
        spread: balls()
          .map((b, i) => +(Math.hypot(b.x - start[i].x, b.y - start[i].y) / r).toFixed(3))
          .join(" "),
      });
      if (now < 700) setTimeout(tick, 60);
      else resolve(JSON.stringify(samples));
    };
    tick();
  });
})();
