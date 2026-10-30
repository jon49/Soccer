module core

import json2

// Records are stored under the same keys the web client uses in IndexedDB,
// written as their compact JSON ("canonical" keys):
//
//   "teams"                                  personal teams list
//   ["team", t]                              a team (or a moved-team tombstone)
//   ["positions", t]                         its formation
//   ["stats", t]                             its stat settings
//   ["game-state", t, gameId]                a game's score and clock
//   ["game-notes", t, gameId]                a game's notes
//   ["player-game", t, playerId, gameId]     a player's time and stats in a game
//
// A team id `t` is a number for a personal team and its space uuid for a
// shared team. Here it is always a string; team_id_any turns it back into
// the right JSON type.

pub const teams_key = '"teams"'

pub const team_key_kinds = ['team', 'positions', 'stats', 'game-state', 'game-notes', 'player-game']

// is_shared_team: personal team ids are whole numbers, shared ones are uuids.
pub fn is_shared_team(team_id string) bool {
	return team_id == '' || !team_id.bytes().all(it.is_digit())
}

pub fn team_id_any(team_id string) json2.Any {
	return if is_shared_team(team_id) { json2.Any(team_id) } else { json2.Any(team_id.int()) }
}

pub fn team_id_from_any(a json2.Any) string {
	return match a {
		string { a.to_lower() }
		else { fmt_num(any_num(a)) }
	}
}

pub fn team_key(team_id string) string {
	return make_key('team', team_id, [])
}

pub fn positions_key(team_id string) string {
	return make_key('positions', team_id, [])
}

pub fn stats_key(team_id string) string {
	return make_key('stats', team_id, [])
}

pub fn game_state_key(team_id string, game_id int) string {
	return make_key('game-state', team_id, [game_id])
}

pub fn game_notes_key(team_id string, game_id int) string {
	return make_key('game-notes', team_id, [game_id])
}

pub fn player_game_key(team_id string, player_id int, game_id int) string {
	return make_key('player-game', team_id, [player_id, game_id])
}

fn make_key(kind string, team_id string, ids []int) string {
	mut parts := [json2.Any(kind), team_id_any(team_id)]
	for id in ids {
		parts << json2.Any(id)
	}
	return canon(parts)
}

// TeamKey is a parsed per-team key.
pub struct TeamKey {
pub:
	kind    string
	team_id string
	rest    []json2.Any
}

pub fn parse_team_key(key string) ?TeamKey {
	if !key.starts_with('[') {
		return none
	}
	arr := any_arr(decode_json(key))
	if arr.len < 2 {
		return none
	}
	kind := any_str(arr[0])
	if kind !in team_key_kinds {
		return none
	}
	if arr[1] !is string && arr[1] !is f64 && arr[1] !is i64 && arr[1] !is int {
		return none
	}
	return TeamKey{
		kind:    kind
		team_id: team_id_from_any(arr[1])
		rest:    arr[2..]
	}
}

// with_team returns the key with its team id replaced.
pub fn (k TeamKey) with_team(team_id string) string {
	mut parts := [json2.Any(k.kind), team_id_any(team_id)]
	for x in k.rest {
		parts << x
	}
	return canon(parts)
}

pub fn is_team_key(key string, team_id string) bool {
	k := parse_team_key(key) or { return false }
	return k.team_id == team_id
}

// key_any is the key as a JSON value, for the sync request.
pub fn key_any(key string) json2.Any {
	return decode_json(key)
}
