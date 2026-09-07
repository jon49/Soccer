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
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0 auto; padding: 1.5rem; max-width: 40rem; color: #1a1a1a; }
  h1 { margin-bottom: 1.5rem; font-size: 1.5rem; }
  ul.schedule { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
  li.game {
    border: 1px solid #ddd;
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    background: #fff;
  }
  li.game.row-alt { background: #f7f7f7; }
  li.game.current-game { background: #fff3b0; border-color: #e6c200; }
  li.game.empty { text-align: center; color: #666; }
  .game-when {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    font-size: 0.9rem;
    color: #444;
  }
  .game-date { font-weight: 600; }
  .game-opponent { margin-top: 0.35rem; font-size: 1.1rem; }
  .game-location { margin-top: 0.25rem; color: #555; }
  .badge {
    display: inline-block;
    margin-left: 0.5rem;
    padding: 0.1rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    vertical-align: middle;
  }
  .badge-home { background: #d6f0d6; color: #1e5e1e; }
  .badge-away { background: #e0e0f0; color: #29296e; }
</style>
</head>
<body>
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
</script>
</body>
</html>
`;
}
