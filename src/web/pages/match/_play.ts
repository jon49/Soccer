import playMatchView from "./_play-match-view.js";
import { PlayerStateView } from "./shared.js";

let {
  layout,
  validation: { queryTeamIdGameIdValidator, validateObject },
} = self.sw;

// The match play view, as its own full-screen page.
export async function play({ query }: { query: any }) {
  let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
  return layout({
    bare: true,
    title: "Match",
    main: await playMatchView(new PlayerStateView(teamId, gameId)),
    cssLinks: ["/web/css/match.css"],
    scripts: ["/web/js/game-timer.js", "/web/js/match-select.js"],
  });
}
