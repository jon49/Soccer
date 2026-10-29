// @ts-check

// Match page: tap a player to select them, then tap where they go. A field
// position queues a bench player for it (or moves a field player there); a
// queued player's own spot swaps just them in; the Bench and Not playing boxes
// move the selected player off. Tapping our score selects it too, and the next
// player tapped gets the goal. Tapping anywhere else clears the selection.
// Holding a score takes a point back (with the Goal stat on, from the next
// player tapped).

/** @type {HTMLElement | null} */
let selected = null;

function clear() {
  selected?.classList.remove("is-selected");
  selected = null;
  delete document.body.dataset.selecting;
}

/**
 * @param {HTMLElement} el
 */
function select(el) {
  clear();
  selected = el;
  el.classList.add("is-selected");
  document.body.dataset.selecting = el.dataset.status;
}

/**
 * @param {string} handler
 * @param {Record<string, string>} params
 */
function post(handler, params) {
  let page = new URLSearchParams(location.search);
  let query = new URLSearchParams({
    teamId: page.get("teamId") ?? "",
    gameId: page.get("gameId") ?? "",
    ...params,
    handler,
  });
  let form = document.getElementById("post");
  clear();
  if (!(form instanceof HTMLFormElement)) return;
  form.action = `?${query}`;
  form.requestSubmit();
}

/**
 * @param {HTMLElement} el
 */
function moveOffHandler(el) {
  let status = selected?.dataset.status;
  if (el.dataset.target === "notPlaying") return "playerNotPlaying";
  return status === "inPlay" ? "playerNowOut" : status === "onDeck" ? "cancelOnDeck" : null;
}

/**
 * The scorer's points: the basketball-mode choice, if shown.
 * @returns {Record<string, string>}
 */
function scorePoints() {
  let checked = document.querySelector("input[name=scorePoints]:checked");
  return checked instanceof HTMLInputElement ? { points: checked.value } : {};
}

/**
 * After the score is selected: a goal for the player tapped, or for no one.
 * Held instead of tapped, the same taps take a goal back.
 * @param {Element} t
 */
function onScoreSelected(t) {
  let player = t.closest("[data-player-id]");
  let target = t.closest("[data-target]");
  let handler = document.body.dataset.selecting === "unscore" ? "removePoint" : "scorePoint";
  if (t.closest(".score-points")) return;
  if (target instanceof HTMLElement && target.dataset.target === "noScorer") {
    post(handler, scorePoints());
  } else if (player instanceof HTMLElement) {
    post(handler, { playerId: player.dataset.playerId ?? "", ...scorePoints() });
  } else {
    clear();
  }
}

// --- Hold a score to take a point back -------------------------------------

const HOLD_MS = 500;
// Moving further than this while pressing is a scroll, not a hold.
const HOLD_SLOP_PX = 10;

/** @type {{ el: HTMLElement, x: number, y: number, timer: number } | null} */
let hold = null;
// The current press took a point back, so the click it ends with mustn't
// also add one.
let held = false;

/**
 * @param {EventTarget | null} t
 */
function scoreAt(t) {
  let score = t instanceof Element ? t.closest(".match-bar .score") : null;
  return score instanceof HTMLElement ? score : null;
}

function cancelHold() {
  if (!hold) return;
  clearTimeout(hold.timer);
  hold.el.classList.remove("is-pressing");
  hold = null;
}

/**
 * @param {HTMLElement} score
 */
function takeBack(score) {
  cancelHold();
  held = true;
  navigator.vibrate?.(20);
  if (score.id === "opponentPoints") {
    post("oPointsDecPlay", {});
  } else if (score.dataset.status === "score") {
    // The Goal stat is on: the next tap picks whose goal it was.
    select(score);
    document.body.dataset.selecting = "unscore";
  } else {
    post("removePoint", {});
  }
}

document.addEventListener("pointerdown", (e) => {
  held = false;
  cancelHold();
  let score = scoreAt(e.target);
  if (!score || !e.isPrimary || e.button !== 0) return;
  score.classList.add("is-pressing");
  hold = {
    el: score,
    x: e.clientX,
    y: e.clientY,
    timer: window.setTimeout(() => takeBack(score), HOLD_MS),
  };
});

document.addEventListener("pointermove", (e) => {
  if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_SLOP_PX) cancelHold();
});
document.addEventListener("pointerup", cancelHold);
document.addEventListener("pointercancel", cancelHold);
// A keyboard click has no pointerdown to reset `held`.
document.addEventListener("keydown", () => {
  held = false;
});

// Swallow the click that ends a hold, before it submits or selects anything.
document.addEventListener(
  "click",
  (e) => {
    if (!held) return;
    held = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  },
  true,
);

// No menu on a held score. A right-click or the menu key takes a point back
// too, for mouse and keyboard users.
document.addEventListener("contextmenu", (e) => {
  let score = scoreAt(e.target);
  if (!score) return;
  e.preventDefault();
  if (!held) takeBack(score);
});

// The Bench button hides the bench so the field gets the whole screen. The
// choice is remembered on this device.
const BENCH_HIDDEN_KEY = "match-bench-hidden";

/**
 * @param {boolean} hidden
 */
function showBench(hidden) {
  if (hidden) {
    document.body.dataset.bench = "hidden";
  } else {
    delete document.body.dataset.bench;
  }
  document.querySelector("[data-bench-toggle]")?.setAttribute("aria-expanded", String(!hidden));
}

function toggleBench() {
  let hidden = document.body.dataset.bench !== "hidden";
  showBench(hidden);
  try {
    localStorage.setItem(BENCH_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {}
}

try {
  showBench(localStorage.getItem(BENCH_HIDDEN_KEY) === "1");
} catch {}
// The page is re-rendered after each action; keep the button's state in sync.
document.addEventListener("hz:completed", () =>
  showBench(document.body.dataset.bench === "hidden"),
);

document.addEventListener("click", (e) => {
  let t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest("[data-bench-toggle]")) {
    toggleBench();
    return;
  }
  let player = t.closest("[data-player-id]");
  let position = t.closest("[data-position]");
  let target = t.closest("[data-target]");
  let score = t.closest("[data-status=score]");

  if (!selected) {
    let pick = score ?? player;
    if (pick instanceof HTMLElement) select(pick);
    return;
  }

  if (selected.dataset.status === "score") {
    score === selected ? clear() : onScoreSelected(t);
    return;
  }

  let playerId = selected.dataset.playerId ?? "";
  if (target instanceof HTMLElement) {
    let handler = moveOffHandler(target);
    handler ? post(handler, { playerId }) : clear();
  } else if (player === selected) {
    clear();
  } else if (position?.contains(selected) && selected.dataset.status === "onDeck") {
    // A queued player, then their own spot: swap just them in now.
    post("swap", { playerId });
  } else if (position instanceof HTMLElement && !position.contains(selected)) {
    post("updateUserPosition", { playerId, position: position.dataset.position ?? "" });
  } else if (score instanceof HTMLElement) {
    select(score);
  } else if (player instanceof HTMLElement) {
    select(player);
  } else {
    clear();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") clear();
});
