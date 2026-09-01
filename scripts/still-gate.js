// The gate the share card and the tab icon are shot through: a screenshot
// records whatever is on screen, including an empty carpet, so nothing is shot
// until the page says what it drew. Reads how many balls to expect off the
// stage itself, so the two pages need no separate list here.
(() => {
  const stage = document.querySelector("#stage");
  if (!stage) return { ok: false, problems: ["no #stage on the page"] };

  const problems = [];
  const expected = Number(stage.dataset.n);
  const balls = document.querySelectorAll(".ball");
  const box = document.querySelector(".box");
  const handle = document.querySelector(".handle");
  const text = (document.body.innerText || "").trim();

  if (stage.dataset.ready !== "true") problems.push("the still never finished drawing");
  if (balls.length !== expected) {
    problems.push(`${balls.length} balls drawn, expected ${expected}`);
  }
  const boxWidth = box ? box.getBoundingClientRect().width : 0;
  if (!(boxWidth > 0)) problems.push("the box has no width");
  const wantsHandle = stage.dataset.handle === "true";
  const showing = handle !== null && handle.offsetParent !== null;
  if (showing !== wantsHandle) {
    problems.push(wantsHandle ? "the handle is missing" : "the handle is still showing");
  }
  if (text !== "") problems.push(`there is text on the picture: ${JSON.stringify(text)}`);

  return { ok: problems.length === 0, problems, balls: balls.length, boxWidth, handle: showing };
})();
