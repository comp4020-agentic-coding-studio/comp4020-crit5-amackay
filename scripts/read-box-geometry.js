// One-off: read the drawn box and balls back out of the DOM and check the
// rendered geometry against the rules' own arithmetic. Not part of the contract.
(() => {
const stage = document.querySelector("#stage");
const box = document.querySelector(".box");
const cs = getComputedStyle(stage);
const r = parseFloat(cs.getPropertyValue("--r"));
const wall = parseFloat(cs.getPropertyValue("--wall"));
const boxCs = getComputedStyle(box);
const before = getComputedStyle(box, "::before");
const m = box.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
const left = parseFloat(m[1]);
const w = parseFloat(boxCs.width);
const balls = [...document.querySelectorAll(".ball")].map((el) => {
  const t = el.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  const d = parseFloat(el.style.width);
  return { cx: parseFloat(t[1]) + d / 2, cy: parseFloat(t[2]) + d / 2, d };
});
const out = {
  radiusPx: r,
  wallPx: wall,
  wallInRadii: wall / r,
  boxInteriorPx: w,
  innerFaceLeft: left,
  innerFaceRight: left + w,
  outerFaceRight: left + w + wall,
  drawnBorderWidth: before.borderTopWidth,
  drawnInsetTop: before.top,
  // Gaps in radii, so they read against the rules directly: 0 means touching.
  balls: balls.map((b) => ({
    centreXinRadii: +((b.cx - (left + w / 2)) / r).toFixed(4),
    gapLeftInnerFace: +((b.cx - b.d / 2 - left) / r).toFixed(4),
    gapRightInnerFace: +((left + w - (b.cx + b.d / 2)) / r).toFixed(4),
    gapLeftOuterFace: +((left - wall - (b.cx + b.d / 2)) / r).toFixed(4),
    gapRightOuterFace: +((b.cx - b.d / 2 - (left + w + wall)) / r).toFixed(4),
  })),
};
return JSON.stringify(out, null, 1);

})();
