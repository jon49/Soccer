import html from "html-template-tag-stream";
import type { Team } from "../server/db.js";
import { settings } from "../server/global-model.js";
import { positionGetAll } from "../server/repo-player-game.js";
import { gameStatesGet } from "../server/repo-team.js";
import { todayDateString } from "../server/utils.js";
import {
  nextSetupStep,
  setupSteps,
  type SetupProgress,
  type SetupStep,
  type SetupStepId,
} from "./setup-guide-logic.js";

type Html = AsyncGenerator<any, void, unknown>;

// The Getting started guide shows unless the coach turned it off in
// Settings. The ? for a page's help is always there.
export async function showHelp(): Promise<boolean> {
  return !(await settings()).hideHelp;
}

// A page's "How this page works": a popover, opened by the ? in the header
// (_layout.html.ts), or after End on the match screen. app.css hides the
// header's ? on pages without one. Tapping outside it or Close shuts it.
export function helpView(body: Html, { title = "How this page works" } = {}) {
  return html`<div id=pageHelp class=help-popover popover aria-labelledby=pageHelpTitle>
    <div class=help-popover-head>
        <h2 id=pageHelpTitle>${title}</h2>
        <button type=button class=condense-padding popovertarget=pageHelp popovertargetaction=hide>Close</button>
    </div>
    <div class=help-body>${body}</div>
</div>`;
}

export async function setupProgress(team: Team): Promise<SetupProgress> {
  let [{ positions }, states] = await Promise.all([
    positionGetAll(team.id),
    gameStatesGet(team.id, team.games),
  ]);
  let started = states.find((x) => x.status);
  let today = todayDateString();
  let soonest =
    [...team.games].sort((a, b) => a.date.localeCompare(b.date)).find((x) => x.date >= today) ??
    team.games[0];
  return {
    teamId: team.id,
    players: team.players.filter((x) => x.active).length,
    positions: positions.flat().length,
    games: team.games.length,
    gameId: started?.gameId ?? soonest?.id,
    started: !!started,
  };
}

// The team's next setup step, for its card on the Teams page.
export async function nextSetupStepFor(team: Team): Promise<SetupStep | undefined> {
  if (!(await showHelp())) return;
  return nextSetupStep(setupSteps(await setupProgress(team)));
}

// Getting started: the steps from a new team to its first match, shown on
// the team's pages until a game has been started. `page` is the step this
// page is for. Always renders #setupGuide, empty once done, so a response
// can swap it in as the step is finished.
export async function setupGuideView(team: Team, page: SetupStepId) {
  let steps = setupSteps(await setupProgress(team));
  let next = nextSetupStep(steps);
  if (!next || !(await showHelp()))
    return html`
      <div id="setupGuide"></div>
    `;
  let number = steps.indexOf(next) + 1;
  return html`
<section id=setupGuide class=setup-guide aria-labelledby=setupGuideTitle>
    <h3 id=setupGuideTitle>Getting started <small>Step ${number} of ${steps.length}</small></h3>
    <ol>
        ${steps.map((step, i) => stepView(step, i + 1, step === next, step.id === page))}
    </ol>
</section>`;
}

function stepView(step: SetupStep, number: number, isNext: boolean, isThisPage: boolean) {
  let name = isThisPage
    ? html`<strong>${step.title}</strong>`
    : html`<a href="${step.url}" target=_self>${step.title}</a>`;
  if (step.done) {
    return html`<li class=is-done><span class=step-mark aria-hidden=true>&#10003;</span>
        <span>${name}<span class=visually-hidden> (done)</span></span></li>`;
  }
  if (isNext) {
    return html`<li class=is-next aria-current=step><span class=step-mark aria-hidden=true>${number}</span>
        <span>${name}<span class=step-todo>${step.todo}</span></span></li>`;
  }
  return html`<li><span class=step-mark aria-hidden=true>${number}</span><span>${name}</span></li>`;
}
