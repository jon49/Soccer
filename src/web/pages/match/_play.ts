import type { RouteGetArgs } from "@jon49/sw/routes.middleware.js";
import playMatchView from "./_play-match-view.js";
import { PlayerStateView } from "./shared.js";

let {
  globalDb,
  html,
  validation: { queryTeamIdGameIdValidator, validateObject },
} = self.sw;

export async function play({
  app,
  query,
  head,
}: RouteGetArgs & { head?: string; app?: Promise<AsyncGenerator<any, void, unknown>> }) {
  let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
  let state = new PlayerStateView(teamId, gameId);
  let { disableAutoSyncDuringGame, theme } = await globalDb.settings();
  // This page is rendered outside of the layout, so there is no #theme radio
  // for app.css to key off of. Emit data-theme when the setting is set
  // (nimble maps it to color-scheme); when it isn't, leave the attribute off
  // so nimble's `color-scheme: light dark` follows the system preference.
  let themeAttr = theme ? ` data-theme="${theme}"` : "";
  return html`
<!DOCTYPE html>
<html$${themeAttr}>
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="auto-sync-disable-during-game" content="${disableAutoSyncDuringGame ? "1" : "0"}">
    <base target=htmz>
    <title>Match - Soccer</title>
    <link rel="icon" type="image/x-icon" href="/web/images/soccer.ico">
    <link href="/web/css/app.css" rel=stylesheet>
    $${head}
    <style>
        .game-timer {
            width: 5em;
            text-align: center;
        }

        /* Scoreboard bar */
        .match-bar {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 0.5rem;
            padding-block: 0.25rem 0.5rem;
            border-bottom: 1px solid var(--nc-border);
        }
        .match-bar button {
            min-height: 2.75rem;
        }
        .match-back {
            min-width: 2rem;
            font-size: 1.5rem;
            text-decoration: none;
        }
        .match-clock {
            flex: 1;
            flex-direction: column;
            gap: 0;
            min-height: 2.75rem;
            padding: 0;
            text-align: center;
            line-height: 1.1;
            font-size: 1.6rem;
            font-weight: 700;
            font-variant-numeric: tabular-nums;
            background: transparent;
            border: 0;
            color: var(--nc-text);
        }
        .match-clock small {
            font-size: 0.65rem;
            font-weight: 400;
            opacity: 0.8;
        }
        .match-clock .flash {
            color: oklch(0.2 0.02 250);
        }
        .score {
            min-width: 2.75rem;
            font-weight: 700;
        }
        .score-them,
        .match-end {
            background: transparent;
            color: var(--nc-text);
            border-color: var(--nc-border);
        }
        .swap-all {
            background: var(--app-on);
            border-color: var(--app-on);
            color: var(--app-on-off-text);
        }

        /* Field on the left, bench on the right; stacked in portrait. */
        .match-body {
            display: flex;
            align-items: flex-start;
            gap: 0.75rem;
            padding-top: 0.5rem;
        }
        .match-field {
            flex: 1;
            min-width: 0;
        }
        .match-bench {
            width: 13rem;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .match-bench-head {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.4rem;
        }
        .match-bench-head h2 {
            flex: 1;
            margin: 0;
            font-size: 1rem;
        }
        .bench-list {
            list-style: none;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 0.4rem;
        }
        .bench-list:empty {
            display: none;
        }
        @media (orientation: portrait) {
            .match-body {
                flex-direction: column;
                align-items: stretch;
            }
            .match-bench {
                width: auto;
            }
            .bench-list {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
        }

        /* Tap a player to select them, then tap where they go
           (match-select.js). */
        .player-card {
            align-self: start;
            width: 100%;
            max-width: 7rem;
            overflow: hidden;
            /* Every position is a tap target, filled or not. */
            cursor: pointer;
            text-align: center;
            background: var(--nc-surface-1);
            border: 1px solid var(--nc-border);
            border-radius: var(--nc-radius);
        }
        .player-main,
        .player-next,
        .bench-item {
            width: 100%;
            min-height: 0;
            margin: 0;
            border: 0;
            border-radius: 0;
            background: transparent;
            color: var(--nc-text);
            font-weight: inherit;
        }
        .player-main {
            flex-direction: column;
            align-items: stretch;
            gap: 0;
            padding: 0.35rem 0.4rem 0;
        }
        /* Darker the more of the game they have played (game-timer.js). */
        .player-main.game-shader,
        .bench-item.game-shader {
            background: var(--game-shader-background);
            color: var(--game-shader-color);
        }
        .player-next {
            display: block;
            padding: 0.2rem 0.4rem;
            font-size: 0.75rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            background: color-mix(in oklch, var(--app-on) 18%, var(--nc-surface-1));
        }
        .bench-item {
            justify-content: space-between;
            gap: 0.5rem;
            min-height: 2.75rem;
            padding: 0 0.6rem;
            border: 1px solid var(--nc-border);
            border-radius: var(--nc-radius);
        }
        .player-name {
            min-width: 0;
            padding: 0;
            font-weight: 600;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .player-card .player-time,
        .bench-item .player-time {
            padding: 0;
            font-size: 0.8rem;
            font-variant-numeric: tabular-nums;
        }
        .player-card .stint-bar {
            display: block;
            height: 8px;
            margin: 0.3rem -0.4rem 0;
            padding: 0;
            border-radius: 0;
            background: var(--nc-border);
        }
        .player-card[data-stint="fresh"] .stint-bar {
            background: oklch(0.72 0.1 175);
        }
        .player-card[data-stint="warm"] .stint-bar {
            background: oklch(0.78 0.12 70);
        }
        .player-card[data-stint="stale"] .stint-bar {
            background: oklch(0.52 0.13 55);
        }
        .bench-item .tag {
            padding: 0.15rem 0.4rem;
            border-radius: 0.5rem;
            font-size: 0.75rem;
            background: color-mix(in oklch, var(--app-on) 18%, var(--nc-surface-1));
        }
        .player-card.is-queued {
            border-color: var(--app-on);
        }
        .player-card .position-name {
            display: block;
            padding: 0.5rem 0.4rem;
            font-size: 0.8rem;
            color: color-mix(in oklch, var(--nc-text), var(--nc-surface-1) 25%);
        }
        .player-card.is-queued .player-next {
            padding-block: 0.6rem;
            font-size: 0.85rem;
        }
        .player-card.is-empty {
            padding: 0.5rem 0.4rem;
            border-style: dashed;
            color: color-mix(in oklch, var(--nc-text), var(--nc-surface-1) 25%);
        }
        .is-selected {
            outline: 3px solid var(--nc-primary);
            outline-offset: -3px;
        }
        /* The score button is filled with the outline color, so ring it. */
        .score.is-selected {
            outline-offset: 3px;
        }
        body[data-selecting] .player-card:not(:has(.is-selected)) {
            border-style: dashed;
            border-color: var(--nc-primary);
        }
        .match-targets {
            display: none;
            gap: 0.5rem;
        }
        body[data-selecting] .match-targets {
            display: flex;
        }
        body[data-selecting="out"] .drop-target[data-target="bench"] {
            display: none;
        }
        .drop-target {
            flex: 1;
            min-height: 3rem;
            background: color-mix(in oklch, var(--nc-primary) 12%, var(--nc-surface-1));
            color: var(--nc-text);
            border: 2px dashed var(--nc-primary);
        }
        /* Scoring: the score is selected and the next player tapped scores. */
        .score-only {
            display: none;
        }
        body[data-selecting="score"] .score-only {
            display: flex;
        }
        body[data-selecting="score"] .drop-target:not(.score-only) {
            display: none;
        }
        body[data-selecting="score"] .bench-item {
            border-style: dashed;
            border-color: var(--nc-primary);
        }
        .score-points {
            align-items: center;
            gap: 0.75rem;
            padding: 0 0.6rem;
            background: var(--nc-surface-1);
            border: 1px solid var(--nc-border);
            border-radius: var(--nc-radius);
        }
        .score-points label {
            display: flex;
            align-items: center;
            gap: 0.25rem;
            margin: 0;
            font-weight: 600;
        }
        @media (orientation: portrait) {
            .match-targets {
                position: fixed;
                z-index: 5;
                left: 1rem;
                right: 1rem;
                bottom: calc(1rem + env(safe-area-inset-bottom));
            }
            .drop-target {
                box-shadow: 0 6px 20px rgb(0 0 0 / 0.25);
            }
        }

        /* Game Shader CSS — the actual color is computed client-side (see
           game-timer.js) from the timer's data-* attributes; these are just
           the pre-JS/no-JS fallback. */
        :root {
            --game-shader-background: transparent;
            --game-shader-color: inherit;
        }
        .game-shader {
            background: var(--game-shader-background);
            color: var(--game-shader-color);
        }
        .game-shader a {
            color: var(--game-shader-color);
        }
    </style>

    <script src="/web/js/app.bundle.js" type="module"></script>
    <script src="/web/js/game-timer.js" type="module"></script>
    <script src="/web/js/match-select.js" type="module"></script>
</head>
<body>
<script>window.app = {}</script>

${app ? app : playMatchView(state)}

<div id=temp></div>

<form id=post method=post hidden></form>

</body>
</html>
`;
}
