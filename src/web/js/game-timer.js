// @ts-check

class Timer {
  times = new Map();

  constructor() {}

  /**
   * @param {GameTimer} instance
   * */
  add(instance) {
    let time = instance.interval;
    if (this.times.get(time)?.add(instance)) return;

    let m = new Set([instance]);
    this.times.set(time, m);
    let interval = setInterval(() => {
      if (m.size === 0) {
        this.times.delete(time);
        clearInterval(interval);
        return;
      }
      requestAnimationFrame(() => {
        let currentTime = +new Date();
        for (let instance of m) {
          instance.update(currentTime);
        }
      });
    }, time);
  }

  /**
   * @param {GameTimer} instance
   * */
  remove(instance) {
    let time = instance.interval;
    let m = this.times.get(time);
    if (!m) return;
    m.delete(instance);
    if (m.size === 0) this.times.delete(time);
  }
}

let timer = new Timer();

// Fallback for how long a player can be in a position before being flagged
// as not recently substituted in, when a per-element override isn't set via
// data-stale-after (see team settings).
const DEFAULT_STALE_AFTER_MS = 8 * 60 * 1e3;

document.head.insertAdjacentHTML(
  "beforeend",
  `<style>
.flash {
    background-color: yellow;
    animation: 2s flash infinite;
}
span {
    padding: 0.25em;
    border-radius: 5px;
}
@keyframes flash {
    50% {
        background-color: transparent;
    }
}
</style>`,
);

/**
 * Total elapsed time represented by a start/total pair, as of `currentTime`.
 * When `start` is absent (the interval isn't currently running), this is
 * just `total` — the pair represents a value that has stopped growing.
 *
 * @param {number} currentTime
 * @param {string | undefined} start
 * @param {string | undefined} total
 */
function computeTotal(currentTime, start, total) {
  let start_ = +(start || 0) || currentTime;
  let total_ = +(total || 0);
  return total_ + (currentTime - start_);
}

/**
 * @param {number} grandTotal
 */
function formatTime(grandTotal) {
  let time = new Date(grandTotal);
  let seconds = `${time.getSeconds()}`.padStart(2, "0");
  let minutes = `${time.getMinutes()}`.padStart(2, "0");
  let hours = (grandTotal / 1e3 / 60 / 60) | 0;
  return `${hours ? `${hours}:` : ""}${minutes}:${seconds}`;
}

// --- Shading -------------------------------------------------------------
// Elements with the `game-shader` class (or a `game-shader` ancestor, for a
// timer nested inside a shaded button) get a background/text color that
// shifts toward the theme's contrast color as a player's time on the field
// approaches the game's total elapsed time. Computing it here — on the same
// tick that updates the timer text — keeps it live instead of only
// refreshing on the next full page morph.

/**
 * @param {number} color
 * @param {number} alpha
 */
function invertChannel(color, alpha) {
  return alpha >= 0.4 ? 255 - color : color;
}

function baseShadeRGB() {
  let theme =
    document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  return theme === "dark" ? [255, 255, 255] : [19, 23, 31];
}

/**
 * @param {HTMLElement} el
 * @param {number} playerTotal
 * @param {number} gameTotal
 */
function applyShade(el, playerTotal, gameTotal) {
  let alpha = +(playerTotal / (gameTotal || 1)).toFixed(3);
  let [r, g, b] = baseShadeRGB();
  let color = [invertChannel(r, alpha), invertChannel(g, alpha), invertChannel(b, alpha)];
  el.style.setProperty("--game-shader-background", `rgba(${r},${g},${b},${alpha})`);
  el.style.setProperty("--game-shader-color", `rgb(${color.join(",")})`);
}

class GameTimer {
  /**
   * @param {HTMLElement} el
   */
  constructor(el) {
    this.el = el;

    this.interval = +(el.dataset.interval ?? 0) || 1e3;

    document.addEventListener("hz:completed", this);

    this.update(Date.now());
  }

  handleEvent() {
    this.update(Date.now());
  }

  disconnectedCallback() {
    timer.remove(this);
    document.removeEventListener("hz:completed", this);
  }

  /**
   * @param {number} currentTime
   */
  update(currentTime) {
    let el = this.el;
    let { start, total, static: static_ } = el.dataset;
    let grandTotal = computeTotal(currentTime, start, total);
    if (el.hasAttribute("data-flash")) {
      el.classList.add("flash");
    } else {
      el.classList.remove("flash");
    }
    if (static_ !== "") {
      timer.add(this);
    } else {
      timer.remove(this);
    }
    el.textContent = formatTime(grandTotal);
    if (el.hasAttribute("data-highlight-stale")) {
      let staleAfter = +(el.dataset.staleAfter || 0) || DEFAULT_STALE_AFTER_MS;
      let start_ = +(start || 0) || currentTime;
      let isStale = static_ !== "" && currentTime - start_ >= staleAfter;
      el.parentElement?.classList.toggle("in-play-stale", isStale);
    }

    let shadeEl = el.classList.contains("game-shader") ? el : el.closest(".game-shader");
    if (shadeEl instanceof HTMLElement) {
      let gameTotal = computeTotal(currentTime, el.dataset.gameStart, el.dataset.gameTotal);
      applyShade(shadeEl, grandTotal, gameTotal);
    }
  }
}

// @ts-ignore
window.app.gameTimer = ({ el }) => new GameTimer(el);
