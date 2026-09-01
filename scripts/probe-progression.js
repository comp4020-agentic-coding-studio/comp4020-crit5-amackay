// One-off: drive the game from level 1 through a level change and read the
// state back out, to see what the centre-drop does to a coincident pair.
(() => {
  const out = { steps: [] };
  const stage = document.querySelector("#stage");
  const balls = () => [...document.querySelectorAll(".ball")].map((el) => {
    const m = el.style.transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  });
  out.stageSize = [stage.clientWidth, stage.clientHeight];
  out.ballCount = document.querySelectorAll(".ball").length;
  out.boxRect = document.querySelector(".box").getBoundingClientRect().width;
  out.advanceHidden = document.querySelector("button.advance").hidden;
  out.navRows = document.querySelectorAll("#levels a.level").length;
  out.positions = balls();
  return out;
})();
