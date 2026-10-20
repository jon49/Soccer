// @ts-check

// Match page: tap a player to select them, then tap where they go. A field
// position queues a bench player for it (or moves a field player there); a
// queued player's own spot swaps just them in; the Bench and Not playing boxes
// move the selected player off. Tapping our score selects it too, and the next
// player tapped gets the goal. Tapping anywhere else clears the selection.

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
 * @param {Element} t
 */
function onScoreSelected(t) {
  let player = t.closest("[data-player-id]");
  let target = t.closest("[data-target]");
  if (t.closest(".score-points")) return;
  if (target instanceof HTMLElement && target.dataset.target === "noScorer") {
    post("scorePoint", scorePoints());
  } else if (player instanceof HTMLElement) {
    post("scorePoint", { playerId: player.dataset.playerId ?? "", ...scorePoints() });
  } else {
    clear();
  }
}

document.addEventListener("click", (e) => {
  let t = e.target;
  if (!(t instanceof Element)) return;
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
