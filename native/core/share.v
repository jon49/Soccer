module core

import json2

// Moving a personal team into a shared team (a TrailBase "space"), the same
// way the web client's share-logic.ts does. The team's id becomes the space
// uuid; ["team", oldId] is left as a tombstone {movedTo, _rev} so other
// devices know to ignore the old rows, which the server keeps forever.

pub struct MoveEntry {
pub:
	key  string
	data json2.Any
}

pub struct TeamMove {
pub:
	from string
	to   string
}

pub struct TeamMovePlan {
pub mut:
	puts    []MoveEntry
	deletes []string
	// Keys to add to / drop from the pending-sync set.
	queue   []string
	unqueue []string
	teams   ?json2.Any
}

// moves_in finds the moves announced by tombstones in a batch of rows.
pub fn moves_in(rows []MoveEntry) []TeamMove {
	mut moves := map[string]string{}
	mut order := []string{}
	for r in rows {
		k := parse_team_key(r.key) or { continue }
		if k.kind == 'team' && !is_shared_team(k.team_id) && is_moved_team(r.data) {
			if k.team_id !in moves {
				order << k.team_id
			}
			moves[k.team_id] = moved_to(r.data)
		}
	}
	return order.map(TeamMove{it, moves[it]})
}

// plan_team_move moves personal team `from` into shared team `to`. `entries`
// are all the local keys of team `from`. Only the ones in `carry` are copied
// over (all of them when it is none, as when sharing; just the unsynced
// edits when another device learns about a move). ["team", from] becomes
// the tombstone, and `from` moves to the teams list's retired ids.
pub fn plan_team_move(from string, to string, entries []MoveEntry, carry ?map[string]bool, teams ?json2.Any) TeamMovePlan {
	mut plan := TeamMovePlan{}
	mut old_team := json2.Any(json2.null)
	mut has_old := false
	for e in entries {
		k := parse_team_key(e.key) or { continue }
		if k.team_id != from {
			continue
		}
		plan.unqueue << e.key
		is_team := k.kind == 'team'
		if is_team {
			old_team = e.data
			has_old = true
		} else {
			plan.deletes << e.key
		}
		if is_null(e.data) || is_moved_team(e.data) || !carries(carry, e.key) {
			continue
		}
		new_key := k.with_team(to)
		mut m := as_map(e.data).clone()
		m['_rev'] = 0
		if is_team {
			m['id'] = to
		}
		plan.puts << MoveEntry{new_key, m}
		plan.queue << new_key
	}

	team_key_ := team_key(from)
	plan.puts << MoveEntry{team_key_, json2.Any({
		'movedTo': json2.Any(to)
		'_rev':    rev_of(old_team)
	})}
	// Only re-send the tombstone when we're the one that wrote over it.
	if has_old && !is_moved_team(old_team) && carries(carry, team_key_) {
		plan.queue << team_key_
	}

	if t := teams {
		mut ts := teams_from_any(t)
		listed := ts.teams.any(it.id == from)
		retired := from.int() in ts.retired_ids
		if listed || !retired {
			ts.teams = ts.teams.filter(it.id != from)
			if !retired {
				ts.retired_ids << from.int()
			}
			plan.teams = ts.to_any()
			plan.queue << teams_key
		}
	}
	return plan
}

fn carries(carry ?map[string]bool, key string) bool {
	if c := carry {
		return key in c
	}
	return true
}
