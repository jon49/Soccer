import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";
import type { GameState, Theme } from "../../server/db.js";
import {
  GameTimeCalculator,
  PlayerGameTimeCalculator,
  PlayerStateView,
  isInPlayPlayer,
} from "./shared.js";
import render, { getPointsView } from "./_game-play-view.js";
import { swapAll } from "./player-swap.js";
import targetPositionView from "./_target-position-view.js";
import targetPosition from "./player-target-position.js";
import { activityPlayerSelectorView } from "./_activity-position-view.js";
import playMatchView, { opponentPointsView } from "./_play-match-view.js";
import { play } from "./_play.js";

const {
  db,
  globalDb,
  html,
  layout,
  repo: {
    gameStateGet,
    gameStateSave,
    playerGameAllGet,
    playerGameSave,
    saveGameNotes,
    statIds,
    teamGet,
    teamSave,
  },
  views: { teamNav },
  validation: {
    queryTeamIdGameIdValidator,
    validateObject,
    reject,
    createIdNumber,
    createPositiveWholeNumber,
    createString25,
    createStringInfinity,
    maybe,
    required,
  },
} = self.sw;

const queryTeamGamePlayerValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: createIdNumber("Query Player Id"),
};

function setPoints(target: string, f: (gameState: GameState) => number) {
  return async ({ query }: { query: any }) => {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let gameState = await gameStateGet(teamId, gameId);
    let points = f(gameState);
    if (points >= 0) {
      await gameStateSave(teamId, gameState);
    } else {
      return reject("Points cannot be negative!");
    }
    return html`<span id="${target}">${getPointsView(points)}</span>`;
  };
}

async function inPlayerOut(state: PlayerStateView, playerId: number) {
  let [player, gameState] = await Promise.all([state.playerGame(playerId), state.gameState()]);
  let gameCalc = new GameTimeCalculator(gameState);
  player.status = { _: "out" };
  let calc = new PlayerGameTimeCalculator(player, gameCalc);
  calc.playerOut();
  await calc.save(state.teamId);
}

async function onDeckPlayerOut(state: PlayerStateView, playerId: number) {
  let player = await state.playerGame(playerId);
  player.status = { _: "out" };
  if (player.gameTime.slice(-1)[0]?.end == null) {
    player.gameTime.pop();
  }
  await playerGameSave(state.teamId, player);
}

const dataNotesValidator = {
  notes: createStringInfinity("Notes"),
};

const queryPositionUpdateValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: createIdNumber("Player ID"),
  position: createPositiveWholeNumber("Position"),
};

const dataSetPlayerActivity = {
  activityId: createIdNumber("Activity ID"),
  playerId: createIdNumber("Player ID"),
  operation: createString25("Action"),
  returnUrl: maybe(createStringInfinity("Return URL")),
  points: maybe(createPositiveWholeNumber("Points")),
};

interface PlayerStatUpdatedArgs {
  activityId: number;
  action: string;
  playerId: number;
  teamId: number;
  gameId: number;
}

async function handlePlayerStatUpdated(data: PlayerStatUpdatedArgs) {
  if (data.activityId === 1) {
    let action: (query: any) => Promise<any> =
      data.action === "inc"
        ? setPoints("points", (gameState) => ++gameState.points)
        : setPoints("points", (gameState) => --gameState.points);
    await action({ query: data });
  }
}

const getHandlers: RouteGetHandler = {
  async cancelSwap({ query }) {
    return getApp(new PlayerStateView(query.teamId, query.gameId));
  },

  async playerSwap({ query }) {
    return targetPositionView(query);
  },

  async rapidFire({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let state = new PlayerStateView(teamId, gameId);
    let onDeckPlayers = await state.onDeckPlayers();

    let firstPlayer = onDeckPlayers.find((x) => x.status.targetPosition == null);
    if (firstPlayer) {
      await db.set("rapidFire", true, false);
      return targetPositionView({ teamId, gameId, playerId: firstPlayer.playerId });
    }

    await db.set("rapidFire", false, false);
    return playMatchView(state);
  },

  async activityPlayerSelector(o) {
    let { query } = o;
    return play({
      ...o,
      app: activityPlayerSelectorView(query),
      head: `
<style>
.points {
  margin-top: 1em;
  margin-bottom: 1em;
}
</style>`,
    });
  },

  async showInPlay({ query }) {
    return getApp(new PlayerStateView(query.teamId, query.gameId));
  },

  async points({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let gameState = await gameStateGet(teamId, gameId);

    return getPointsView(gameState.points);
  },

  async play(o) {
    let { query } = o;
    let settings = await globalDb.settings();
    settings.defaultTheme = query.theme as Theme;
    await globalDb.setSettings(settings);
    return play(o);
  },

  async get({ query }) {
    let team = await teamGet(+query.teamId);
    let game = await required(
      team.games.find((x) => x.id === +query.gameId),
      `Could not find game! ${query.gameId}`,
    );
    return layout({
      main: await render(query),
      nav: teamNav(+query.teamId),
      scripts: ["/web/js/game-timer.js"],
      title: `Match — ${team.name} VS ${game.opponent}`,
    });
  },
};

function getApp(state: PlayerStateView) {
  return playMatchView(state);
}

const queryActionValidatory = {
  ...queryTeamIdGameIdValidator,
  action: createString25("Action"),
};

const postHandlers: RoutePostHandler = {
  oPointsDec: setPoints("o-points", (gameState) => --gameState.opponentPoints),
  oPointsInc: setPoints("o-points", (gameState) => ++gameState.opponentPoints),
  pointsDec: setPoints("points", (gameState) => --gameState.points),
  pointsInc: setPoints("points", (gameState) => ++gameState.points),

  async oPointsIncPlay(o) {
    let { teamId, gameId } = await validateObject(o.query, queryTeamIdGameIdValidator);
    await setPoints("o-points", (gameState) => ++gameState.opponentPoints)(o);
    let state = new PlayerStateView(teamId, gameId);
    return html`${opponentPointsView(state.queryTeamGame, await state.gameCalc())}`;
  },

  async points(o) {
    let { query, req } = o;
    let { action, teamId, gameId } = await validateObject(query, queryActionValidatory);
    let state = new PlayerStateView(teamId, gameId);
    let { stats } = await state.stats();

    if (stats.find((x) => x.id === statIds.Goal)?.active) {
      return html`<i _load=redirect id=temp data-url="/web/match?teamId=${teamId}&action=${action}&activityId=1&gameId=${gameId}&handler=activityPlayerSelector&returnUrl=${encodeURIComponent(req.referrer)}"></i>`;
    }

    if (action === "inc") {
      return postHandlers.pointsInc(o);
    } else {
      return postHandlers.pointsDec(o);
    }
  },

  async updateNote({ query, data }) {
    let { gameId, teamId } = await validateObject(query, queryTeamIdGameIdValidator);
    let { notes } = await validateObject(data, dataNotesValidator);
    await saveGameNotes(teamId, gameId, notes);

    return { status: 200 };
  },

  async swap({ query }) {
    let o = await validateObject(query, queryTeamGamePlayerValidator);
    // The query contains the player ID and so will only swap one player.
    await swapAll(query);

    return getApp(new PlayerStateView(o.teamId, o.gameId));
  },

  async swapAll({ query }) {
    let o = await validateObject(query, queryTeamIdGameIdValidator);
    await swapAll(query);
    return getApp(new PlayerStateView(o.teamId, o.gameId));
  },

  async allOut({ query }) {
    let o = await validateObject(query, queryTeamIdGameIdValidator);
    let state = new PlayerStateView(o.teamId, o.gameId);
    let [inPlayPlayers, onDeckPlayers] = await Promise.all([
      state.inPlayPlayers(),
      state.onDeckPlayers(),
    ]);

    await Promise.all([
      ...inPlayPlayers.map((player) => inPlayerOut(state, player.playerId)),
      ...onDeckPlayers
        .filter((x) => x.status.targetPosition != null)
        .map((player) => onDeckPlayerOut(state, player.playerId)),
    ]);

    return getApp(new PlayerStateView(o.teamId, o.gameId));
  },

  async updateUserPosition({ query }) {
    let o = await validateObject(query, queryPositionUpdateValidator);
    await targetPosition(query, o.position);

    let rapidFire = await db.get("rapidFire");

    if (rapidFire) {
      // @ts-expect-error
      return getHandlers.rapidFire({ query });
    }

    return playMatchView(new PlayerStateView(o.teamId, o.gameId));
  },

  async playerOnDeck({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let state = new PlayerStateView(teamId, gameId);
    let player = await state.playerGame(playerId);
    player.status = { _: "onDeck", targetPosition: null };
    await playerGameSave(teamId, player);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async playerNowOut({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let state = new PlayerStateView(teamId, gameId);

    await inPlayerOut(state, playerId);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async cancelOnDeck({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let state = new PlayerStateView(teamId, gameId);
    await onDeckPlayerOut(state, playerId);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async notPlaying({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let [player] = await playerGameAllGet(teamId, gameId, [playerId]);
    player.status = { _: "notPlaying" };
    await playerGameSave(teamId, player);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async backIn({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let [player] = await playerGameAllGet(teamId, gameId, [playerId]);
    player.status = { _: "out" };
    await playerGameSave(teamId, player);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async startGame({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let timestamp = +new Date();
    let team = await teamGet(teamId);

    let game = await required(
      team.games.find((x) => x.id === gameId),
      `Could not find game! ${gameId}`,
    );
    let gameState = await gameStateGet(teamId, gameId, game);
    gameState.status = "play";
    gameState.gameTime.push({
      start: timestamp,
    });
    await gameStateSave(teamId, gameState);

    let players = await playerGameAllGet(
      teamId,
      gameId,
      team.players.map((x) => x.id),
    );
    let inPlayPlayers = players.filter(isInPlayPlayer);
    await Promise.all(
      inPlayPlayers.map((player) => {
        let calc = new PlayerGameTimeCalculator(player, new GameTimeCalculator(gameState));
        calc.start();
        return calc.save(teamId);
      }),
    );

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async pauseGame({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let team = await teamGet(teamId);

    let game = await required(
      team.games.find((x) => x.id === gameId),
      `Could not find game! ${gameId}`,
    );
    let gameState = await gameStateGet(teamId, gameId, game);
    gameState.status = "paused";
    let gameCalc = new GameTimeCalculator(gameState);
    gameCalc.end();
    await gameStateSave(teamId, gameState);

    let players = await playerGameAllGet(
      teamId,
      gameId,
      team.players.map((x) => x.id),
    );
    let inPlayPlayers = players.filter(isInPlayPlayer);
    await Promise.all(
      inPlayPlayers
        .map((player) => {
          let calc = new PlayerGameTimeCalculator(player, gameCalc);
          let currentPosition = calc.currentPosition();
          calc.end();
          calc.position(currentPosition);
          return calc.save(teamId);
        })
        .filter((x) => x),
    );

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async endGame({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let team = await teamGet(teamId);

    let now = Date.now();

    let game = await required(
      team.games.find((x) => x.id === gameId),
      `Could not find game! ${gameId}`,
    );
    let gameState = await gameStateGet(teamId, gameId, game);
    gameState.status = "ended";
    let calc = new GameTimeCalculator(gameState);
    calc.end(now);
    await gameStateSave(teamId, gameState);

    let players = await playerGameAllGet(
      teamId,
      gameId,
      team.players.map((x) => x.id),
    );
    await Promise.all(
      players.filter(isInPlayPlayer).map((player) => {
        let playerCalc = new PlayerGameTimeCalculator(player, calc);
        playerCalc.end(now);
        // @ts-ignore
        player.status = { _: "out" };
        return playerCalc.save(teamId);
      }),
    );

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async restartGame({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let gameState = await gameStateGet(teamId, gameId);
    gameState.status = "paused";
    await gameStateSave(teamId, gameState);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  async setPlayerStat({ query, data }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let { activityId, playerId, operation, returnUrl, points } = await validateObject(
      data,
      dataSetPlayerActivity,
    );
    let state = new PlayerStateView(teamId, gameId);
    let player = await state.playerGame(playerId);

    let activity = player.stats.find((x) => x.statId === activityId);
    if (!activity) {
      activity = {
        statId: activityId,
        count: 0,
      };
      player.stats.push(activity);
    }

    points = points ?? 1;
    if (operation === "inc") {
      activity.count += points;
      if (points > 1) {
        let gameState = await state.gameState();
        gameState.points += points - 1;
        await gameStateSave(teamId, gameState);
      }
    } else {
      activity.count -= points;
      if (points > 1) {
        let gameState = await state.gameState();
        gameState.points -= points - 1;
        await gameStateSave(teamId, gameState);
      }
    }

    await playerGameSave(teamId, player);

    await handlePlayerStatUpdated({
      activityId,
      action: operation,
      playerId,
      teamId,
      gameId,
    });

    return html`<i _load=redirect id=temp data-url="$${returnUrl}"></i>`;
  },

  async deleteGame({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let state = new PlayerStateView(teamId, gameId);
    let team = await state.team();
    let game = await state.game();
    let [players, gameState] = await Promise.all([state.gamePlayers(), state.gameState()]);
    let gameIndex = team.games.findIndex((x) => x === game);
    team.games.splice(gameIndex, 1);
    for (let player of players) {
      player.gameTime.length = 0;
      player.stats.length = 0;
      player.status = void 0;
      await playerGameSave(teamId, player);
    }
    // Clear and persist the live game-state so the deletion propagates via sync
    // (mirrors how player records are zeroed rather than removed).
    gameState.status = void 0;
    gameState.points = 0;
    gameState.opponentPoints = 0;
    gameState.gameTime = [];
    await gameStateSave(teamId, gameState);
    await teamSave(team);

    return html`<i _load=redirect id=temp data-url="/web/games?teamId=${teamId}"></i>`;
  },
};

const route: RoutePage = {
  get: getHandlers,
  post: postHandlers,
};

export default route;
