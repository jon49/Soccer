import type { TeamId } from "../../server/db.js";
import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";
import {
  GameTimeCalculator,
  PlayerGameTimeCalculator,
  PlayerStateView,
  isInPlayPlayer,
  isOnDeckPlayer,
} from "./shared.js";
import render, { getPointsView } from "./_game-play-view.js";
import { swapAll } from "./player-swap.js";
import targetPosition from "./player-target-position.js";
import { activityPlayerSelectorView } from "./_activity-position-view.js";
import playMatchView, { opponentPointsView } from "./_play-match-view.js";
import { play } from "./_play.js";
import {
  adjustPoints,
  applyInPlayerOut,
  applyOnDeckPlayerOut,
  applyStatOperation,
  endInPlayPlayers,
  isValidPointsValue,
  pauseInPlayPlayers,
  resetGameStateForDeletedGame,
  resetPlayerForDeletedGame,
  startInPlayPlayers,
  takeBackPointsError,
} from "./match-page-logic.js";

const {
  html,
  layout,
  repo: {
    gameStateGet,
    gameStateSave,
    playerGameAllGet,
    playerGameSave,
    publishTeamSchedule,
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

function setPoints(target: string, field: "points" | "opponentPoints", delta: 1 | -1) {
  return async ({ query }: { query: any }) => {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let gameState = await gameStateGet(teamId, gameId);
    let points = adjustPoints(gameState[field], delta);
    if (isValidPointsValue(points)) {
      gameState[field] = points;
      await gameStateSave(teamId, gameState);
    } else {
      return reject("Points cannot be negative!");
    }
    return html`<span id="${target}">${getPointsView(points)}</span>`;
  };
}

// The play view's opponent score, after changing it by `delta`.
function opponentPointsPlay(delta: 1 | -1) {
  return async (o: { query: any }) => {
    let { teamId, gameId } = await validateObject(o.query, queryTeamIdGameIdValidator);
    await setPoints("o-points", "opponentPoints", delta)(o);
    let state = new PlayerStateView(teamId, gameId);
    return html`${opponentPointsView(state.queryTeamGame, await state.gameCalc())}`;
  };
}

async function inPlayerOut(state: PlayerStateView, playerId: number) {
  let [player, gameState] = await Promise.all([state.playerGame(playerId), state.gameState()]);
  let gameCalc = new GameTimeCalculator(gameState);
  applyInPlayerOut(player, gameCalc);
  await new PlayerGameTimeCalculator(player, gameCalc).save(state.teamId);
}

async function onDeckPlayerOut(state: PlayerStateView, playerId: number) {
  let player = await state.playerGame(playerId);
  applyOnDeckPlayerOut(player);
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

const queryScorePointValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: maybe(createIdNumber("Player ID")),
  points: maybe(createPositiveWholeNumber("Points")),
};

interface PlayerStatUpdatedArgs {
  activityId: number;
  action: string;
  playerId: number;
  teamId: TeamId;
  gameId: number;
}

async function handlePlayerStatUpdated(data: PlayerStatUpdatedArgs) {
  if (data.activityId === 1) {
    let action = setPoints("points", "points", data.action === "inc" ? 1 : -1);
    await action({ query: data });
  }
}

async function addPlayerStat(
  state: PlayerStateView,
  {
    activityId,
    playerId,
    operation,
    points,
  }: { activityId: number; playerId: number; operation: "inc" | "dec"; points?: number },
) {
  let { teamId, gameId } = state;
  let player = await state.playerGame(playerId);

  let activity = player.stats.find((x) => x.statId === activityId);
  if (!activity) {
    activity = {
      statId: activityId,
      count: 0,
    };
    player.stats.push(activity);
  }

  let { newCount, gameScoreDelta } = applyStatOperation(activity.count, operation, points);
  activity.count = newCount;
  if (gameScoreDelta !== 0) {
    let gameState = await state.gameState();
    gameState.points += gameScoreDelta;
    await gameStateSave(teamId, gameState);
  }

  await playerGameSave(teamId, player);

  await handlePlayerStatUpdated({
    activityId,
    action: operation,
    playerId,
    teamId,
    gameId,
  });
}

const getHandlers: RouteGetHandler = {
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

  async points({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let gameState = await gameStateGet(teamId, gameId);

    return getPointsView(gameState.points);
  },

  async play(o) {
    return play(o);
  },

  // Just the play view's <main>, which auto-sync morphs in when a sync
  // brings new data, so the page isn't reloaded mid-game.
  async playMain({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    return playMatchView(new PlayerStateView(teamId, gameId));
  },

  async get({ query }) {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let team = await teamGet(teamId);
    let game = await required(
      team.games.find((x) => x.id === gameId),
      `Could not find game! ${query.gameId}`,
    );
    return layout({
      main: await render(query),
      nav: teamNav(teamId),
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
  oPointsDec: setPoints("o-points", "opponentPoints", -1),
  oPointsInc: setPoints("o-points", "opponentPoints", 1),
  pointsDec: setPoints("points", "points", -1),
  pointsInc: setPoints("points", "points", 1),

  oPointsIncPlay: opponentPointsPlay(1),
  // Holding the opponent's score on the play view.
  oPointsDecPlay: opponentPointsPlay(-1),

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
    return playMatchView(new PlayerStateView(o.teamId, o.gameId));
  },

  async playerNowOut({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let state = new PlayerStateView(teamId, gameId);

    await inPlayerOut(state, playerId);

    return getApp(new PlayerStateView(teamId, gameId));
  },

  // From anywhere straight to not playing: take them out first, the same as
  // the Out / Cancel actions, so gameTime has no open interval left behind.
  async playerNotPlaying({ query }) {
    let { teamId, playerId, gameId } = await validateObject(query, queryTeamGamePlayerValidator);
    let state = new PlayerStateView(teamId, gameId);
    let current = await state.playerGame(playerId);
    if (isInPlayPlayer(current)) {
      await inPlayerOut(state, playerId);
    } else if (isOnDeckPlayer(current)) {
      await onDeckPlayerOut(state, playerId);
    }
    let [player] = await playerGameAllGet(teamId, gameId, [playerId]);
    player.status = { _: "notPlaying" };
    await playerGameSave(teamId, player);

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
    let gameCalc = new GameTimeCalculator(gameState);
    let inPlayPlayers = startInPlayPlayers(players, gameCalc);
    await Promise.all(
      inPlayPlayers.map((player) => new PlayerGameTimeCalculator(player, gameCalc).save(teamId)),
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
    let inPlayPlayers = pauseInPlayPlayers(players, gameCalc);
    await Promise.all(
      inPlayPlayers.map((player) => new PlayerGameTimeCalculator(player, gameCalc).save(teamId)),
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
    let inPlayPlayers = endInPlayPlayers(players, calc, now);
    await Promise.all(
      inPlayPlayers.map((player) => new PlayerGameTimeCalculator(player, calc).save(teamId)),
    );

    // Keep an already-shared schedule current with the final score. Ending the
    // game must still succeed if this fails (e.g. offline at the field).
    let message: string | undefined;
    if (team.scheduleFileId) {
      try {
        await publishTeamSchedule(team);
      } catch (e: any) {
        message = `Game ended, but the schedule was not republished: ${e?.message ?? e}`;
      }
    }

    return { body: await getApp(new PlayerStateView(teamId, gameId)), message };
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
    await addPlayerStat(new PlayerStateView(teamId, gameId), {
      activityId,
      playerId,
      operation: operation as "inc" | "dec",
      points,
    });

    return html`<i _load=redirect id=temp data-url="$${returnUrl}"></i>`;
  },

  // The play view's score: credit the goal to a player, or with no player
  // just add to the team's score.
  async scorePoint({ query }) {
    let { teamId, gameId, playerId, points } = await validateObject(
      query,
      queryScorePointValidator,
    );
    let state = new PlayerStateView(teamId, gameId);
    if (playerId) {
      await addPlayerStat(state, { activityId: statIds.Goal, playerId, operation: "inc", points });
    } else {
      let gameState = await state.gameState();
      gameState.points += points ?? 1;
      await gameStateSave(teamId, gameState);
    }

    return getApp(new PlayerStateView(teamId, gameId));
  },

  // Holding the play view's score takes points back: from the scorer when
  // one was picked (Goal stat on), otherwise just from the team's score.
  async removePoint({ query }) {
    let {
      teamId,
      gameId,
      playerId,
      points = 1,
    } = await validateObject(query, queryScorePointValidator);
    let state = new PlayerStateView(teamId, gameId);
    let gameState = await state.gameState();
    if (playerId) {
      let [player, { name }] = await Promise.all([
        state.playerGame(playerId),
        state.player(playerId),
      ]);
      let goals = player.stats.find((x) => x.statId === statIds.Goal)?.count ?? 0;
      let error = takeBackPointsError(points, gameState.points, { name, goals });
      if (error) return reject(error);
      await addPlayerStat(state, { activityId: statIds.Goal, playerId, operation: "dec", points });
    } else {
      let error = takeBackPointsError(points, gameState.points);
      if (error) return reject(error);
      gameState.points -= points;
      await gameStateSave(teamId, gameState);
    }

    return getApp(new PlayerStateView(teamId, gameId));
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
      resetPlayerForDeletedGame(player);
      await playerGameSave(teamId, player);
    }
    // Clear and persist the live game-state so the deletion propagates via sync
    // (mirrors how player records are zeroed rather than removed).
    resetGameStateForDeletedGame(gameState);
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
