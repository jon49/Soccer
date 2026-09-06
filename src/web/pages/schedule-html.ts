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

function gameRow(game: Game): string {
  let opponent = escapeHtml(game.opponent || "TBD");
  let location = escapeHtml(game.location || "TBD");
  let homeAway = game.home ? "Home" : "Away";
  return `<tr data-date="${escapeHtml(game.date)}">
  <td>${escapeHtml(formatDate(game.date))}</td>
  <td>${escapeHtml(formatTime(game.time))}</td>
  <td>${opponent}</td>
  <td>${homeAway}</td>
  <td>${location}</td>
</tr>`;
}

export function renderScheduleHtml(team: Team): string {
  let title = `${team.name} ${team.year}`;
  let games = [...team.games].sort((a, b) =>
    a.date === b.date ? (a.time ?? "").localeCompare(b.time ?? "") : a.date.localeCompare(b.date),
  );

  let rows = games.length
    ? games.map(gameRow).join("\n")
    : `<tr><td colspan="5">No games scheduled yet.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.5rem 1rem; border-bottom: 1px solid #ddd; }
  th { border-bottom-width: 2px; }
  tbody tr.row-alt { background: #f2f2f2; }
  tbody tr.current-game { background: #fff3b0; font-weight: 600; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead>
<tr><th>Date</th><th>Time</th><th>Opponent</th><th>Home/Away</th><th>Location</th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>
<script>
(function () {
  // Highlighting is computed here, client-side, using the viewer's own
  // clock — not at publish time — since this file is a static snapshot
  // that may be viewed long after it was generated.
  var rows = Array.prototype.slice.call(document.querySelectorAll("tbody tr[data-date]"));
  var now = new Date();
  var todayStr = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0") + "-" + String(now.getDate()).padStart(2, "0");

  var current = null;
  var others = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!current && row.getAttribute("data-date") >= todayStr) {
      current = row;
    } else {
      others.push(row);
    }
  }

  if (current) current.classList.add("current-game");
  others.forEach(function (row, i) {
    if (i % 2 === 1) row.classList.add("row-alt");
  });
})();
</script>
</body>
</html>
`;
}
