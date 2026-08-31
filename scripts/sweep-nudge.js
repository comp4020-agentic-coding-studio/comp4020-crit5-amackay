// One-off: sweep the pointer across the balls and report the closest a ball
// centre ever comes to the pointer, in radii. 1.0 means never intersected.
(() => new Promise((resolve) => {
  const stage = document.querySelector("#stage");
  const r = parseFloat(getComputedStyle(stage).getPropertyValue("--r"));
  const ox = stage.clientWidth / 2;
  const oy = stage.clientHeight / 2;
  const at = (wx, wy) => ({ x: ox + wx * r, y: oy - wy * r });
  const centres = () => [...document.querySelectorAll(".ball")].map((el) => {
    const m = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
    const d = parseFloat(el.style.width);
    return { x: (parseFloat(m[1]) + d / 2 - ox) / r, y: (oy - (parseFloat(m[2]) + d / 2)) / r };
  });
  const fire = (type, wx, wy) => {
    const p = at(wx, wy);
    const ev = new PointerEvent(type, { clientX: p.x, clientY: p.y, bubbles: true, pointerId: 1 });
    (type === "pointerdown" ? stage : window).dispatchEvent(ev);
  };
  let closest = 99;
  const path = [];
  for (let i = 0; i <= 40; i++) path.push(-5 + i * 0.25);
  fire("pointerdown", path[0], -1.2);
  let k = 0;
  // Measured a frame after the move, which is where the game's own step() has
  // had its turn — in the same frame the read is simply one frame stale.
  let previous = null;
  const tick = () => {
    if (previous !== null) {
      for (const c of centres()) {
        closest = Math.min(closest, Math.hypot(c.x - previous, c.y + 1.2));
      }
    }
    if (k < path.length) {
      previous = path[k++];
      fire("pointermove", previous, -1.2);
      requestAnimationFrame(tick);
    } else {
      fire("pointerup", previous, -1.2);
      resolve(`closest approach: ${closest.toFixed(4)} radii`);
    }
  };
  requestAnimationFrame(tick);
}))();
