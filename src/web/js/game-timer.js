// @ts-check

class Timer {
  times = new Map();

  constructor() { }

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

class DisconnectWatcher {
  /** @type {Map<HTMLElement, { disconnectedCallback: () => void }>} */
  registry = new Map();

  constructor() {
    let observer = new MutationObserver((mutations) => {
      if (this.registry.size === 0) return;
      for (let mutation of mutations) {
        for (let node of mutation.removedNodes) {
          for (let [el, instance] of this.registry) {
            if (node.contains(el)) {
              this.registry.delete(el);
              instance.disconnectedCallback();
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * @param {HTMLElement} el
   * @param {{ disconnectedCallback: () => void }} instance
   */
  register(el, instance) {
    this.registry.set(el, instance);
  }
}

let watcher = new DisconnectWatcher();

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

class GameTimer {
  /**
   * @param {HTMLElement} el
   */
  constructor(el) {
    this.el = el;

    this.interval = +(el.dataset.interval ?? 0) || 1e3;

    document.addEventListener("hz:completed", this);
    watcher.register(el, this);

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
    let start_ = +(start || 0) || currentTime;
    let total_ = +(total || 0);
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
    el.textContent = formatTime(currentTime, start_, total_);
  }
}

/**
 * @param {number} currentTime
 * @param {number} start
 * @param {number} total
 */
function formatTime(currentTime, start, total) {
  let grandTotal = total + (currentTime - start);
  let time = new Date(grandTotal);
  let seconds = `${time.getSeconds()}`.padStart(2, "0");
  let minutes = `${time.getMinutes()}`.padStart(2, "0");
  let hours = (grandTotal / 1e3 / 60 / 60) | 0;
  return `${hours ? `${hours}:` : ""}${minutes}:${seconds}`;
}

// @ts-ignore
window.app.gameTimer = (_, el) => {
  if (el._) return;
  el._ = true;
  new GameTimer(el);
};
