import type { GameState, PlayerGame } from "../../server/db.js";
import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";
import {
  GameTimeCalculator,
  PlayerGameTimeCalculator,
  PlayerStateView,
  isInPlayPlayer,
  isOnDeckPlayer,
} from "./shared.js";
import render from "./_game-play-view.js";
import { swapAll } from "./player-swap.js";
import targetPosition from "./player-target-position.js";
import playMatchView, { opponentPointsView } from "./_play-match-view.js";
import { play } from "./_play.js";
import {
  adjustPoints,
  applyInPlayerOut,
  applyOnDeckPlayerOut,
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
    createStringInfinity,
    maybe,
    required,
  },
} = self.sw;

const queryTeamGamePlayerValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: createIdNumber("Query Player Id"),
};

// The play view's opponent score, after changing it by `delta`.
function opponentPointsPlay(delta: 1 | -1) {
  return async ({ query }: { query: any }) => {
    let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
    let state = new PlayerStateView(teamId, gameId);
    let gameState = await state.gameState();
    let points = adjustPoints(gameState.opponentPoints, delta);
    if (!isValidPointsValue(points)) return reject("Points cannot be negative!");
    gameState.opponentPoints = points;
    await gameStateSave(teamId, gameState);
    return html`${opponentPointsView(state.queryTeamGame, await state.gameCalc())}`;
  };
}

// Starts, pauses or ends the game clock (`update`) and moves every in-play
// player's clock with it (`updatePlayers`, which returns the players it
// changed), then saves both.
async function changeGameClock(
  query: any,
  update: (gameState: GameState, calc: GameTimeCalculator) => void,
  updatePlayers: (players: PlayerGame[], calc: GameTimeCalculator) => PlayerGame[],
) {
  let { teamId, gameId } = await validateObject(query, queryTeamIdGameIdValidator);
  let team = await teamGet(teamId);
  await required(
    team.games.find((x) => x.id === gameId),
    `Could not find game! ${gameId}`,
  );
  let gameState = await gameStateGet(teamId, gameId);
  let calc = new GameTimeCalculator(gameState);
  update(gameState, calc);
  await gameStateSave(teamId, gameState);

  let players = await playerGameAllGet(
    teamId,
    gameId,
    team.players.map((x) => x.id),
  );
  await Promise.all(
    updatePlayers(players, calc).map((player) =>
      new PlayerGameTimeCalculator(player, calc).save(teamId),
    ),
  );
  return { team, teamId, gameId };
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

const queryScorePointValidator = {
  ...queryTeamIdGameIdValidator,
  playerId: maybe(createIdNumber("Player ID")),
  points: maybe(createPositiveWholeNumber("Points")),
};

// Credits `playerId` with `points` scored (negative takes them back), on
// their Goal stat and on the team's score.
async function addGoal(state: PlayerStateView, playerId: number, points: number) {
  let [player, gameState] = await Promise.all([state.playerGame(playerId), state.gameState()]);
  let goal = player.stats.find((x) => x.statId === statIds.Goal);
  if (!goal) player.stats.push((goal = { statId: statIds.Goal, count: 0 }));
  goal.count += points;
  gameState.points += points;
  await gameStateSave(state.teamId, gameState);
  await playerGameSave(state.teamId, player);
}

const getHandlers: RouteGetHandler = {
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
      title: `Match — ${team.name} VS ${game.opponent}`,
    });
  },
};

function getApp(state: PlayerStateView) {
  return playMatchView(state);
}

const postHandlers: RoutePostHandler = {
  oPointsIncPlay: opponentPointsPlay(1),
  // Holding the opponent's score on the play view.
  oPointsDecPlay: opponentPointsPlay(-1),

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
    let { teamId, gameId } = await changeGameClock(
      query,
      (gameState, calc) => {
        gameState.status = "play";
        calc.start();
      },
      startInPlayPlayers,
    );
    return getApp(new PlayerStateView(teamId, gameId));
  },

  async pauseGame({ query }) {
    let { teamId, gameId } = await changeGameClock(
      query,
      (gameState, calc) => {
        gameState.status = "paused";
        calc.end();
      },
      pauseInPlayPlayers,
    );
    return getApp(new PlayerStateView(teamId, gameId));
  },

  async endGame({ query }) {
    let now = Date.now();
    let { team, teamId, gameId } = await changeGameClock(
      query,
      (gameState, calc) => {
        gameState.status = "ended";
        calc.end(now);
      },
      (players, calc) => endInPlayPlayers(players, calc, now),
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

  // The play view's score: credit the goal to a player, or with no player
  // just add to the team's score.
  async scorePoint({ query }) {
    let { teamId, gameId, playerId, points } = await validateObject(
      query,
      queryScorePointValidator,
    );
    let state = new PlayerStateView(teamId, gameId);
    if (playerId) {
      await addGoal(state, playerId, points ?? 1);
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
      await addGoal(state, playerId, -points);
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
