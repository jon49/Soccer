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

// The background blends smoothly, but the text is only ever dark or light:
// whichever reads better on the blended color.

const DARK_TEXT = [0, 0, 0];
const LIGHT_TEXT = [255, 255, 255];

/**
 * The shade color and the page surface it is blended over (nimble's
 * --nc-surface-1).
 * @returns {[number[], number[]]}
 */
function shadeColors() {
  let theme =
    document.documentElement.dataset.theme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  return theme === "dark"
    ? [
        [255, 255, 255],
        [15, 17, 20],
      ]
    : [
        [19, 23, 31],
        [249, 250, 251],
      ];
}

/**
 * WCAG relative luminance.
 * @param {number[]} rgb
 */
function luminance(rgb) {
  let [r, g, b] = rgb.map((c) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function contrast(a, b) {
  let [darker, lighter] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * @param {HTMLElement} el
 * @param {number} playerTotal
 * @param {number} gameTotal
 */
function applyShade(el, playerTotal, gameTotal) {
  let alpha = Math.min(1, +(playerTotal / (gameTotal || 1)).toFixed(3));
  let [shade, surface] = shadeColors();
  let background = shade.map((c, i) => surface[i] * (1 - alpha) + c * alpha);
  let text =
    contrast(background, DARK_TEXT) >= contrast(background, LIGHT_TEXT) ? DARK_TEXT : LIGHT_TEXT;
  el.style.setProperty("--game-shader-background", `rgba(${shade.join(",")},${alpha})`);
  el.style.setProperty("--game-shader-color", `rgb(${text.join(",")})`);
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
      let stint = currentTime - start_;
      // The player card's bar: fresh, then warm at half the stale limit, then
      // stale. No level while the clock is stopped.
      let level =
        static_ === ""
          ? ""
          : stint >= staleAfter
            ? "stale"
            : stint >= staleAfter / 2
              ? "warm"
              : "fresh";
      let card = el.closest(".player-card");
      if (card instanceof HTMLElement) card.dataset.stint = level;
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
