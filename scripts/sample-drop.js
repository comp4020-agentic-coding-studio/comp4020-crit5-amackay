// One-off: world positions of every ball, sampled each frame through a drop.
(() => {
  const stage = document.querySelector("#stage");
  const cs = getComputedStyle(stage);
  const r = parseFloat(cs.getPropertyValue("--r"));
  const ox = stage.clientWidth / 2;
  const oy = stage.clientHeight / 2;
  const world = (el) => {
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    const d = parseFloat(el.style.width);
    return {
      x: +((parseFloat(m[1]) + d / 2 - ox) / r).toFixed(4),
      y: +((oy - (parseFloat(m[2]) + d / 2)) / r).toFixed(4),
    };
  };
  const read = () => [...document.querySelectorAll(".ball")].map(world);
  const frames = [];
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      frames.push({ ms: Math.round(performance.now() - t0), b: read() });
      if (performance.now() - t0 < 600) requestAnimationFrame(tick);
      else
        resolve(
          JSON.stringify(
            frames
              .filter((_, i) => i % 4 === 0)
              .map((f) => `${f.ms}ms ` + f.b.map((p) => `(${p.x},${p.y})`).join(" ")),
          ),
        );
    };
    requestAnimationFrame(tick);
  });
})();
