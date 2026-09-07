import type { Game, Team } from "../server/db.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(date: string): string {
  let d = new Date(`${date}T00:00:00`);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatTime(time: string | undefined): string {
  if (!time) return "TBD";
  let d = new Date(`2000-01-01T${time}`);
  if (isNaN(d.getTime())) return time;
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function gameCard(game: Game): string {
  let opponent = escapeHtml(game.opponent || "TBD");
  let location = escapeHtml(game.location || "TBD");
  let homeAway = game.home ? "Home" : "Away";
  return `<li class="game" data-date="${escapeHtml(game.date)}">
  <div class="game-when">
    <span class="game-date">${escapeHtml(formatDate(game.date))}</span>
    <span class="game-time">${escapeHtml(formatTime(game.time))}</span>
  </div>
  <div class="game-opponent">
    vs ${opponent}
    <span class="badge ${game.home ? "badge-home" : "badge-away"}">${homeAway}</span>
  </div>
  <div class="game-location">${location}</div>
</li>`;
}

export function renderScheduleHtml(team: Team): string {
  let title = `${team.name} ${team.year}`;
  let games = [...team.games].sort((a, b) =>
    a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date),
  );

  let items = games.length
    ? games.map(gameCard).join("\n")
    : `<li class="game empty">No games scheduled yet.</li>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${escapeHtml(title)}</title>
<script>
// Restore a saved theme choice before first paint, so there's no flash of
// the wrong theme. A missing/cleared choice falls back to the OS setting
// via the CSS below.
(function () {
  try {
    var saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {}
})();
</script>
<style>
  :root {
    --bg: #fafafa;
    --fg: #1a1a1a;
    --muted-fg: #666;
    --card-bg: #fff;
    --card-border: #ddd;
    --card-alt-bg: #f2f2f2;
    --current-bg: #fff3b0;
    --current-border: #e6c200;
    --meta-fg: #444;
    --location-fg: #555;
    --badge-home-bg: #d6f0d6;
    --badge-home-fg: #1e5e1e;
    --badge-away-bg: #e0e0f0;
    --badge-away-fg: #29296e;
    --toggle-bg: #fff;
    --toggle-border: #ccc;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --bg: #121212;
      --fg: #eee;
      --muted-fg: #999;
      --card-bg: #1e1e1e;
      --card-border: #333;
      --card-alt-bg: #262626;
      --current-bg: #4a3b00;
      --current-border: #a98600;
      --meta-fg: #bbb;
      --location-fg: #aaa;
      --badge-home-bg: #1e3d1e;
      --badge-home-fg: #a8e6a8;
      --badge-away-bg: #26264d;
      --badge-away-fg: #b8b8f0;
      --toggle-bg: #1e1e1e;
      --toggle-border: #444;
    }
  }
  :root[data-theme="dark"] {
    --bg: #121212;
    --fg: #eee;
    --muted-fg: #999;
    --card-bg: #1e1e1e;
    --card-border: #333;
    --card-alt-bg: #262626;
    --current-bg: #4a3b00;
    --current-border: #a98600;
    --meta-fg: #bbb;
    --location-fg: #aaa;
    --badge-home-bg: #1e3d1e;
    --badge-home-fg: #a8e6a8;
    --badge-away-bg: #26264d;
    --badge-away-fg: #b8b8f0;
    --toggle-bg: #1e1e1e;
    --toggle-border: #444;
  }
  body {
    font-family: system-ui, sans-serif;
    margin: 0 auto;
    padding: 1.5rem;
    max-width: 40rem;
    background: var(--bg);
    color: var(--fg);
  }
  h1 { margin-bottom: 1.5rem; font-size: 1.5rem; padding-right: 3rem; }
  ul.schedule { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
  li.game {
    border: 1px solid var(--card-border);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--card-bg);
  }
  li.game.row-alt { background: var(--card-alt-bg); }
  li.game.current-game { background: var(--current-bg); border-color: var(--current-border); }
  li.game.empty { text-align: center; color: var(--muted-fg); }
  .game-when {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    font-size: 0.9rem;
    color: var(--meta-fg);
  }
  .game-date { font-weight: 600; }
  .game-opponent { margin-top: 0.35rem; font-size: 1.1rem; }
  .game-location { margin-top: 0.25rem; color: var(--location-fg); }
  .badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    vertical-align: middle;
  }
  .badge-home { background: var(--badge-home-bg); color: var(--badge-home-fg); }
  .badge-away { background: var(--badge-away-bg); color: var(--badge-away-fg); }
  #theme-toggle {
    position: fixed;
    top: 1rem;
    right: 1rem;
    border: 1px solid var(--toggle-border);
    background: var(--toggle-bg);
    color: var(--fg);
    border-radius: 1.5rem;
    padding: 0.4rem 0.75rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
</style>
</head>
<body>
<button id="theme-toggle" aria-label="Toggle dark mode" type="button"></button>
<h1>${escapeHtml(title)}</h1>
<ul class="schedule">
${items}
</ul>
<script>
(function () {
  // Highlighting is computed here, client-side, using the viewer's own
  // clock — not at publish time — since this file is a static snapshot
  // that may be viewed long after it was generated.
  var games = Array.prototype.slice.call(document.querySelectorAll("li.game[data-date]"));
  var now = new Date();
  var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

  var current = null;
  var others = [];
  for (var i = 0; i < games.length; i++) {
    var game = games[i];
    if (!current && game.getAttribute("data-date") >= todayStr) {
      current = game;
    } else {
      others.push(game);
    }
  }

  if (current) current.classList.add("current-game");
  others.forEach(function (game, i) {
    if (i % 2 === 1) game.classList.add("row-alt");
  });
})();

(function () {
  // Theme toggle: flips an explicit choice that overrides the OS setting,
  // remembered per-browser so it sticks on the next visit. With no explicit
  // choice, the CSS above already follows prefers-color-scheme.
  var root = document.documentElement;
  var button = document.getElementById("theme-toggle");
  if (!button) return;

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function effectiveTheme() {
    var explicit = root.getAttribute("data-theme");
    if (explicit === "light" || explicit === "dark") return explicit;
    return systemPrefersDark() ? "dark" : "light";
  }

  function render() {
    button.textContent = effectiveTheme() === "dark" ? "☀️ Light mode" : "🌙 Dark mode";
  }

  button.addEventListener("click", function () {
    var next = effectiveTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch (e) {}
    render();
  });

  render();
})();
</script>
</body>
</html>
`;
}
