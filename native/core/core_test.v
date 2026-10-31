module core

import json2
import os
import rand

// Ports of the web client's unit tests (state-logic, player-swap-logic,
// player-target-position-logic, match-page-logic, share-logic, sync) plus
// tests of what only this client has (keys, the store file).

fn pg(id int, status PlayerStatus, times []PlayerGameTime) PlayerGame {
	return PlayerGame{
		player_id: id
		game_id:   1
		status:    status
		game_time: times
	}
}

fn running_game() GameState {
	return GameState{
		game_id:   1
		game_time: [GameTime{
			start: 1000
		}]
	}
}

// ---- keys and JSON ----

fn test_keys_match_the_web_client() {
	assert teams_key == '"teams"'
	assert team_key('4') == '["team",4]'
	s := '8f3c1d2e-0000-4000-8000-000000000001'
	assert team_key(s) == '["team","${s}"]'
	assert player_game_key('4', 2, 7) == '["player-game",4,2,7]'
	assert game_state_key(s, 3) == '["game-state","${s}",3]'
	k := parse_team_key('["player-game",4,2,7]') or { panic('no key') }
	assert k.kind == 'player-game' && k.team_id == '4'
	assert k.with_team(s) == '["player-game","${s}",2,7]'
	assert is_team_key('["stats",4]', '4')
	assert !is_team_key('["stats",4]', '1')
	assert !is_team_key(teams_key, '4')
	assert parse_team_key('["other",4]') == none
	// The server echoes keys as JSON text; numbers decode as floats.
	assert canon(parse_json_text(json2.Any('["team",4]'))) == '["team",4]'
	assert canon(parse_json_text(json2.Any('"teams"'))) == teams_key
	assert !is_shared_team('12') && is_shared_team(s)
}

fn test_records_round_trip_and_keep_unknown_fields() {
	raw := decode_json('{"id":4,"name":"Hawks","year":"2026","active":true,"players":[{"id":1,"name":"Ann","active":true,"number":7,"nick":"A"}],"games":[{"id":2,"date":"2026-11-01","time":"10:00","home":true,"opponent":"Owls","points":3}],"positions":[],"_v":0,"future":"x","_rev":9}')
	mut t := team_from_any(raw)
	assert t.id == '4' && t.name == 'Hawks' && t.rev == 9
	assert t.players[0].number == 7
	assert t.stale_after_minutes == -1
	t.name = 'Falcons'
	m := as_map(t.to_any())
	assert any_str(m['future'] or { json2.null }) == 'x'
	assert any_str(m['name'] or { json2.null }) == 'Falcons'
	p := as_map(any_arr(m['players'] or { json2.null })[0])
	assert any_str(p['nick'] or { json2.null }) == 'A'
	assert 'staleAfterMinutes' !in m
	// Legacy score fields embedded in the game are still readable.
	gs := game_state_from_legacy(2, t.games[0])
	assert gs.points == 3

	st := player_game_from_any(decode_json('{"playerId":1,"gameId":2,"stats":[],"gameTime":[{"position":"GK"}],"status":{"_":"onDeck","targetPosition":null},"_rev":0}'))
	assert st.status.kind == .on_deck && st.status.target == -1
	assert st.to_any().json_str().contains('"targetPosition":null')
}

fn test_positions_upgrade_from_the_original_shape() {
	p := positions_from_any(decode_json('{"positions":["A","B","C","D"],"grid":[1,2,1],"_rev":2}'))
	assert p.positions == [['A'], ['B', 'C'], ['D']]
	assert p.rev == 2
	assert p.to_any().json_str().contains('"_v":0')
}

// ---- totals and clocks (state-logic.test.ts) ----

fn test_totals() {
	assert game_times_total([]) == 0
	assert game_times_total([GameTime{100, 400}, GameTime{500, 700}]) == 500
	assert game_times_total([GameTime{100, 400}, GameTime{
		start: 500
	}]) == 300
	assert game_times_current_total([GameTime{100, 400}, GameTime{
		start: 1000
	}], 1500) == 800
	assert game_times_current_total([GameTime{100, 400}, GameTime{}], 1500) == 300
}

fn test_player_time_stays_within_an_open_halfs_time() {
	now := i64(100_000)
	half := now - 20_000
	game := [GameTime{
		start: half
	}]
	player := [PlayerGameTime{half, half + 5_000, 'Fullback R'},
		PlayerGameTime{half + 5_000, half + 12_000, 'Midfielder C'}, PlayerGameTime{
			start:    half + 12_000
			position: 'Forward R'
		}]
	assert player_times_current_total(player, now) <= game_times_current_total(game, now)
}

fn test_game_clock() {
	mut g := GameState{}
	g.clock_start(10)
	assert g.game_time.len == 1 && g.game_time[0].start == 10
	g.clock_start(20) // still open: no-op
	assert g.game_time.len == 1
	assert g.is_game_on()
	g.clock_end(30)!
	assert g.game_time[0].end == 30
	g.clock_end(40)! // already ended: kept
	assert g.game_time[0].end == 30
	assert !g.is_game_on()
	g.clock_start(50)
	assert g.game_time.len == 2
	assert g.last_start() == 50 && g.last_end() == 0
	mut empty := GameState{}
	if _ := empty.clock_end(1) {
		assert false, 'ending a clock that never started must fail'
	}
}

fn test_player_clock() {
	mut p := PlayerGame{}
	p.clock_start(true, 5) // no position: no-op
	assert p.game_time.len == 0
	p.set_position('GK', false, 5)
	assert p.game_time == [PlayerGameTime{
		position: 'GK'
	}]
	p.clock_start(false, 6) // game not on: no-op
	assert p.game_time[0].start == 0
	p.set_position('DEF', false, 7) // not started: changes in place
	assert p.game_time.len == 1 && p.game_time[0].position == 'DEF'
	p.clock_start(true, 10)
	assert p.game_time[0].start == 10
	p.set_position('MID', true, 20) // while playing: closes and reopens
	assert p.game_time.len == 2
	assert p.game_time[0].end == 20
	assert p.game_time[1] == PlayerGameTime{20, 0, 'MID'}
	p.clock_out(30)
	assert p.game_time[1].end == 30
	assert p.total() == 20
	mut q := PlayerGame{
		game_time: [PlayerGameTime{
			position: 'GK'
		}]
	}
	q.clock_out(1) // never started: dropped
	assert q.game_time.len == 0
}

// ---- swaps (player-swap-logic.test.ts) ----

fn test_swap_moves_a_queued_player_into_an_empty_position() {
	mut players := [pg(1, on_deck(0), [PlayerGameTime{
		position: 'pos-0'
	}])]
	changed := swap_in(mut players, [], true, 2000)!
	assert players[0].status == in_play(0)
	assert changed == [0]
	assert players[0].game_time.last().start == 2000
}

fn test_swap_does_not_start_the_clock_while_paused() {
	mut players := [pg(1, on_deck(0), [PlayerGameTime{
		position: 'pos-0'
	}])]
	swap_in(mut players, [], false, 2000)!
	assert players[0].game_time.last().start == 0
}

fn test_swap_benches_the_player_in_that_position() {
	mut players := [pg(1, on_deck(0), [PlayerGameTime{
		position: 'pos-0'
	}]), pg(2, in_play(0), [PlayerGameTime{
		start:    500
		position: 'pos-0'
	}])]
	changed := swap_in(mut players, [], true, 2000)!
	assert players[1].status.kind == .out
	assert players[1].game_time.last().end == 2000
	assert changed == [1, 0]
}

fn test_swap_one_player_only() {
	mut players := [pg(1, on_deck(0), [PlayerGameTime{
		position: 'a'
	}]), pg(2, on_deck(1), [PlayerGameTime{
		position: 'b'
	}])]
	swap_in(mut players, [2], true, 5)!
	assert players[0].status == on_deck(0)
	assert players[1].status == in_play(1)
}

fn test_swap_skips_queued_players_without_a_position() {
	mut players := [pg(1, on_deck(-1), [])]
	assert swap_in(mut players, [], true, 5)! == []
}

// ---- moving players (player-target-position-logic.test.ts) ----

const test_names = ['GK', 'DEF', 'MID', 'FWD']

fn test_bench_player_is_queued_for_a_position() {
	mut players := [pg(1, status_out(), [])]
	changed := target_position(mut players, 1, test_names, 1, true, 5)
	assert players[0].status == on_deck(1)
	assert changed == [0]
	assert players[0].game_time.last() == PlayerGameTime{
		position: 'DEF'
	}
	mut fresh := [pg(1, PlayerStatus{}, [])]
	target_position(mut fresh, 1, test_names, 0, true, 5)
	assert fresh[0].status == on_deck(0)
}

fn test_queueing_bumps_whoever_was_queued_there() {
	mut players := [pg(1, status_out(), []), pg(2, on_deck(1), [PlayerGameTime{
		position: 'DEF'
	}])]
	changed := target_position(mut players, 1, test_names, 1, true, 5)
	assert players[1].status.kind == .out
	assert changed == [1, 0]
}

fn test_field_player_moves_and_swaps_positions() {
	mut players := [pg(1, in_play(0), [PlayerGameTime{
		start:    500
		position: 'GK'
	}]), pg(2, in_play(2), [PlayerGameTime{
		start:    500
		position: 'MID'
	}])]
	changed := target_position(mut players, 1, test_names, 2, true, 900)
	assert players[0].status == in_play(2)
	assert players[1].status == in_play(0)
	assert changed == [0, 1]
	assert players[0].game_time.last().position == 'MID'
	assert players[1].game_time.last().position == 'GK'
	assert players[0].game_time[0].end == 900
	assert players[0].game_time.last().start == 900
}

fn test_field_player_moves_while_paused_only_renames() {
	mut players := [pg(1, in_play(0), [PlayerGameTime{
		position: 'GK'
	}])]
	target_position(mut players, 1, test_names, 2, false, 900)
	assert players[0].game_time.len == 1
	assert players[0].game_time[0] == PlayerGameTime{
		position: 'MID'
	}
}

// ---- start, pause, end (match-page-logic.test.ts) ----

fn test_pause_and_end_in_play_players() {
	mut players := [pg(1, in_play(0), [PlayerGameTime{
		start:    100
		position: 'GK'
	}]), pg(2, status_out(), [])]
	assert pause_in_play(mut players, false, 200) == [0]
	assert players[0].game_time.len == 2
	assert players[0].game_time[0].end == 200
	assert players[0].game_time[1] == PlayerGameTime{
		position: 'GK'
	}
	assert start_in_play(mut players, true, 300) == [0]
	assert players[0].game_time[1].start == 300
	assert end_in_play(mut players, 400) == [0]
	assert players[0].game_time[1].end == 400
	assert players[0].status.kind == .out
}

fn test_stat_operation_and_take_back() {
	a, b := stat_operation(0, true, 1)
	assert a == 1 && b == 0
	c, d := stat_operation(2, true, 3)
	assert c == 5 && d == 2
	e, f := stat_operation(5, false, 3)
	assert e == 2 && f == -2
	assert take_back_error(1, 0, '', 0, false)? == 'Points cannot be negative!'
	assert take_back_error(1, 3, 'Ann', 0, true)? == "Ann doesn't have a goal to take back."
	assert take_back_error(2, 3, 'Ann', 1, true)? == "Ann doesn't have 2 points to take back."
	assert take_back_error(1, 3, 'Ann', 1, true) == none
}

fn test_fairness() {
	assert stale_after_ms(5)? == 5 * 60 * 1000
	assert stale_after_ms(-1)? == 8 * 60 * 1000
	assert stale_after_ms(0) == none
	assert !is_roster_full(5, 1, 7)
	assert is_roster_full(5, 2, 7)
	assert fair_share_ratio(4, 8) == 0.5
	assert fair_share_ratio(4, 3) == 1.0
	assert fair_share_ratio(0, 6) == 1.0
	assert format_clock(65_000) == '1:05'
	assert format_clock(3_725_000) == '1:02:05'
	assert format_timer(65_000) == '01:05'
}

// ---- match actions on a store ----

fn test_a_match_from_kickoff_to_final_whistle() {
	mut s := memory_store()
	team := s.team_create('Hawks', '2026')!
	s.player_create(team.id, 'Ann')!
	s.player_create(team.id, 'Bea')!
	mut t := s.team_get(team.id)!
	t.games << Game{
		id:       1
		date:     '2026-11-01'
		opponent: 'Owls'
	}
	s.team_save(t)!
	s.positions_save(team.id, Positions{
		positions: [['GK']]
	})!

	s.move_to_position(team.id, 1, 1, 0, 1000)! // Ann queued for GK
	s.swap(team.id, 1, 0, 1000)!
	s.game_clock(team.id, 1, .start, 2000)!
	mut m := s.match_get(team.id, 1)!
	assert m.at_position(0)?.player_id == 1
	assert m.state.is_in_play()
	s.score_point(team.id, 1, 1, 1)!
	s.move_to_position(team.id, 1, 2, 0, 5000)! // Bea queued
	s.swap(team.id, 1, 2, 5000)!
	s.game_clock(team.id, 1, .end, 9000)!
	m = s.match_get(team.id, 1)!
	assert m.state.points == 1
	assert m.state.is_ended()
	ann := m.players[0]
	bea := m.players[1]
	assert ann.total() == 3000 && ann.stat_count(goal_stat_id) == 1
	assert bea.total() == 4000 && bea.status.kind == .out
	// Taking back a goal from someone without one fails; from Ann works.
	if _ := s.remove_point(team.id, 1, 2, 1) {
		assert false
	}
	s.remove_point(team.id, 1, 1, 1)!
	assert s.game_state_get(team.id, 1, none).points == 0

	// Stats see the game.
	pct := s.percentage_table(s.team_get(team.id)!, 10_000)
	assert pct.rows[0].cells[1] == '43%' // Ann: 3 of 7 seconds
	tp := s.time_played_table(s.team_get(team.id)!)
	assert tp.headers == ['GK', 'Total']
	assert tp.rows[1].cells == ['0:00:04', '0:00:04']

	s.game_delete(team.id, 1)!
	assert s.team_get(team.id)!.games.len == 0
	assert s.game_state_get(team.id, 1, none).status == ''
}

fn test_team_names_must_be_unique() {
	mut s := memory_store()
	s.team_create('Hawks', '2026')!
	if _ := s.team_create('hawks', '2026') {
		assert false
	}
	s.team_create('Hawks', '2025')!
	teams, total := s.teams_all(.all)
	assert total == 2
	assert teams[0].year == '2026'
	assert s.teams_doc().teams.len == 2
	assert s.pending.len == 3 // the teams doc and both teams
}

// ---- sharing (share-logic.test.ts) ----

const test_space = '8f3c1d2e-0000-4000-8000-000000000001'

fn share_entries() []MoveEntry {
	return [
		MoveEntry{'["team",4]', decode_json('{"id":4,"name":"Hawks","year":"2026","active":true,"players":[],"games":[],"_rev":9}')},
		MoveEntry{'["stats",4]', decode_json('{"stats":[],"_rev":5}')},
		MoveEntry{'["player-game",4,2,7]', decode_json('{"playerId":2,"gameId":7,"_rev":6}')},
	]
}

fn share_teams() json2.Any {
	return decode_json('{"_rev":3,"teams":[{"id":1,"name":"Owls","year":"2025","active":true},{"id":4,"name":"Hawks","year":"2026","active":true}]}')
}

fn test_moves_in() {
	moves := moves_in([
		MoveEntry{'["team",4]', decode_json('{"movedTo":"${test_space}","_rev":1}')},
		MoveEntry{'["team",5]', decode_json('{"name":"x"}')},
	])
	assert moves == [TeamMove{'4', test_space}]
}

fn test_plan_team_move_when_sharing() {
	plan := plan_team_move('4', test_space, share_entries(), none, share_teams())
	assert plan.puts.map(it.key) == ['["team","${test_space}"]', '["stats","${test_space}"]',
		'["player-game","${test_space}",2,7]', '["team",4]']
	assert rev_of(plan.puts[1].data) == 0
	assert any_str(as_map(plan.puts[0].data)['id'] or { json2.null }) == test_space
	assert moved_to(plan.puts[3].data) == test_space && rev_of(plan.puts[3].data) == 9
	assert plan.deletes == ['["stats",4]', '["player-game",4,2,7]']
	t := teams_from_any(plan.teams or { panic('no teams') })
	assert t.teams.map(it.id) == ['1']
	assert t.retired_ids == [4]
	assert plan.queue == ['["team","${test_space}"]', '["stats","${test_space}"]',
		'["player-game","${test_space}",2,7]', '["team",4]', teams_key]
}

fn test_plan_team_move_on_another_device() {
	plan := plan_team_move('4', test_space, share_entries(), {
		'["stats",4]': true
	}, share_teams())
	assert plan.puts.map(it.key) == ['["stats","${test_space}"]', '["team",4]']
	assert plan.queue == ['["stats","${test_space}"]', teams_key]
	done := decode_json('{"_rev":4,"teams":[{"id":1,"name":"Owls","year":"2025","active":true}],"retiredIds":[4]}')
	plan2 := plan_team_move('4', test_space, [], map[string]bool{}, done)
	assert plan2.teams == none
	assert plan2.queue == []
	tomb := plan_team_move('4', test_space, [
		MoveEntry{'["team",4]', decode_json('{"movedTo":"${test_space}","_rev":12}')},
	], none, none)
	assert tomb.puts.len == 1 && rev_of(tomb.puts[0].data) == 12
	assert tomb.queue == []
}

// ---- sync ----

fn sync_res(body string) SyncResponse {
	return SyncResponse{
		status: 200
		body:   body
	}
}

fn test_sync_confirms_saved_records_and_applies_incoming_ones() {
	mut s := memory_store()
	team := s.team_create('Hawks', '2026')!
	req := s.begin_sync(true)
	body := as_map(decode_json(req.body))
	items := any_arr(body['data'] or { json2.null })
	assert items.len == 2
	// Keys go up as JSON values, not strings.
	assert as_map(items[1])['key'] or { json2.null }.json_str() == '["team",1]'
	// Edit the team while the request is in flight.
	mut t := s.team_get(team.id)!
	t.active = false
	s.team_save(t)!
	out := s.finish_sync(req, sync_res('{"data":[{"key":"[\\"team\\",9]","data":"{\\"id\\":9,\\"name\\":\\"X\\"}","id":40}],"saved":[{"key":"\\"teams\\"","id":41},{"key":"[\\"team\\",1]","id":42}],"conflicted":[],"lastSyncedId":42,"spaces":{}}'))!
	assert out.status == 200 && out.received == 1
	assert s.settings.last_synced_id == 42
	assert rev_of(s.get('["team",9]')?) == 40
	assert rev_of(s.get(team_key('1'))?) == 42
	// "teams" was confirmed, but the team was edited in flight: still queued.
	assert s.pending.keys() == ['["team",1]', teams_key] || s.pending.keys() == [
		teams_key,
		'["team",1]',
	]
}

fn test_sync_keeps_local_edits_over_incoming_rows() {
	mut s := memory_store()
	s.team_create('Hawks', '2026')!
	req := s.begin_sync(false)
	assert any_arr(as_map(decode_json(req.body))['data'] or { json2.null }).len == 0
	s.finish_sync(req, sync_res('{"data":[{"key":"[\\"team\\",1]","data":"{\\"id\\":1,\\"name\\":\\"Other\\"}","id":3}],"saved":[],"lastSyncedId":3,"spaces":{}}'))!
	assert s.team_get('1')!.name == 'Hawks'
}

fn test_sync_tags_shared_records_and_forgets_lost_spaces() {
	mut s := memory_store()
	s.settings.spaces[test_space] = 5
	s.put(team_key(test_space), Team{
		id:   test_space
		name: 'Shared'
		year: '2026'
	}.to_any(), true)!
	req := s.begin_sync(true)
	assert req.body.contains('"space":"${test_space}"')
	assert req.body.contains('"spaces":{"${test_space}":5}')
	out := s.finish_sync(req, sync_res('{"data":[],"saved":[],"lastSyncedId":0,"spaces":{}}'))!
	assert out.messages == ['You no longer have access to "Shared".']
	assert s.get(team_key(test_space)) == none
	assert s.pending.len == 0
	assert test_space !in s.settings.spaces
}

fn test_sync_learns_a_team_moved_on_another_device() {
	mut s := memory_store()
	team := s.team_create('Hawks', '2026')!
	s.player_create(team.id, 'Ann')!
	s.pending.clear()
	s.put(stats_key(team.id), default_stats().to_any(), true)! // an unsynced edit
	req := s.begin_sync(false)
	out := s.finish_sync(req, sync_res('{"data":[{"key":"[\\"team\\",1]","data":"{\\"movedTo\\":\\"${test_space}\\"}","id":7},{"key":"[\\"team\\",\\"${test_space}\\"]","data":"{\\"id\\":\\"${test_space}\\",\\"name\\":\\"Hawks\\",\\"year\\":\\"2026\\",\\"active\\":true,\\"players\\":[],\\"games\\":[]}","id":8}],"saved":[],"lastSyncedId":7,"spaces":{"${test_space}":8}}'))!
	assert out.status == 200
	assert is_moved_team(s.get(team_key('1'))?)
	assert s.get(stats_key('1')) == none
	assert s.get(stats_key(test_space)) != none
	assert stats_key(test_space) in s.pending
	teams, _ := s.teams_all(.all)
	assert teams.map(it.id) == [test_space]
	assert s.teams_doc().retired_ids == [1]
}

fn test_sync_403_and_401() {
	mut s := memory_store()
	s.auth = AuthTokens{
		email:      'a@b.c'
		auth_token: 't'
	}
	req := s.begin_sync(true)
	out := s.finish_sync(req, SyncResponse{
		status: 403
	})!
	assert out.status == 403
	if _ := s.finish_sync(req, SyncResponse{
		status: 401
	})
	{
		assert false
	}
	assert !s.auth.logged_in()
	assert s.auth.email == 'a@b.c'
}

// ---- the store file ----

fn test_store_persists_records_pending_and_settings() {
	dir := os.join_path(os.temp_dir(), 'soccer-test-${rand.ulid()}')
	defer {
		os.rmdir_all(dir) or {}
	}
	mut s := open_store(dir)!
	s.team_create('Hawks', '2026')!
	s.settings.theme = 'dark'
	s.settings.spaces[test_space] = 3
	s.save()!
	r := open_store(dir)!
	assert r.team_get('1')!.name == 'Hawks'
	assert r.pending.len == 2
	assert r.edit_seq == 2
	assert r.settings.theme == 'dark'
	assert r.settings.spaces[test_space] == 3
	assert r.export_json().contains('"teams"')
}

fn test_wipe_forgets_everything_but_device_preferences() {
	dir := os.join_path(os.temp_dir(), 'soccer-test-${rand.ulid()}')
	defer {
		os.rmdir_all(dir) or {}
	}
	mut s := open_store(dir)!
	s.team_create('Hawks', '2026')!
	s.settings.theme = 'dark'
	s.settings.zoom = 1.25
	s.settings.server_url = 'http://localhost:4000'
	s.settings.last_synced_id = 42
	s.settings.spaces[test_space] = 3
	s.log_sync('info', 'synced', '{}')
	s.auth = AuthTokens{
		email:         'coach@example.com'
		auth_token:    'a'
		refresh_token: 'r'
	}
	s.save()!
	s.save_auth()!
	s.wipe()!
	r := open_store(dir)!
	assert r.records.len == 0
	assert r.pending.len == 0
	assert r.sync_log.len == 0
	assert r.settings.last_synced_id == 0
	assert r.settings.spaces.len == 0
	assert r.settings.theme == 'dark'
	assert r.settings.zoom == 1.25
	assert r.settings.server_url == 'http://localhost:4000'
	assert !r.auth.logged_in()
	assert r.auth.email == ''
	assert !os.exists(os.join_path(dir, 'auth.json'))
}

// ---- dates and the schedule page ----

fn test_dates_and_times() {
	assert format_game_date('2026-11-01') == 'Sun, Nov 1, 2026'
	assert format_short_date('2026-11-01') == 'Nov 1'
	assert format_game_time('') == 'TBD'
	assert format_game_time('10:00') == '10:00 AM'
	assert format_game_time('13:05') == '1:05 PM'
	assert format_game_time('00:30') == '12:30 AM'
	assert parse_time('10:00')? == '10:00'
	assert parse_time('9:05 pm')? == '21:05'
	assert parse_time('12am')? == '00:00'
	assert parse_time('3p')? == '15:00'
	assert parse_time('25:00') == none
	assert parse_time('10:5') == none
	assert parse_date('2023-02-29') == none
}

fn test_schedule_page() {
	mut t := Team{
		id:      '1'
		name:    'Hawks & Co'
		year:    '2026'
		players: [TeamPlayer{
			id:   1
			name: 'Ann'
		}]
		games:   [Game{
			id:       2
			date:     '2026-11-08'
			opponent: 'Owls'
		}, Game{
			id:       1
			date:     '2026-11-01'
			time:     '10:00'
			home:     true
			opponent: 'Bats'
		}]
	}
	html := render_schedule_html(t, [GameState{
		game_id:         1
		status:          'ended'
		points:          3
		opponent_points: 1
	}], [GameGoals{1, 1, 2}])
	assert html.contains('<title>Hawks &amp; Co 2026</title>')
	assert html.index('vs Bats')? < html.index('vs Owls')?
	assert html.contains('Final: 3 – 1</button>')
	assert html.contains('<span>Ann</span><span>2 goals</span>')
	assert html.contains('<li class="scorer-other"><span>Other</span><span>1 goal</span>')
	assert html.contains('Sun, Nov 1, 2026')
	assert !html.contains('{{')
}

fn test_invite_codes() {
	code := '0a1b2c3d-0000-4000-8000-00000000abcd'
	assert invite_code('https://soccer.jnyman.com/web/join/?code=${code}')? == code
	assert invite_code(' ${code.to_upper()} ')? == code
	assert invite_code('nope') == none
}

fn test_formations() {
	assert formation_name([1, 2, 1]) == '1-2-1'
	assert formation_name([2, 3, 3, 1]) == '3 - 3 - 2'
	assert template_positions([1, 2, 1]) == [['Forward '], ['Midfield L', 'Midfield R'], ['Fullback ']]
	assert template_positions([2, 4, 2, 1])[3] == ['Goalkeeper ']
	assert template_positions([1, 3, 2, 4, 1])[0] == ['Striker ']
	assert resize_row([['a']], -1, true) == [[''], ['a']]
	assert resize_row([['a']], 1, true) == [['a'], ['']]
	assert resize_row([['a'], ['b', 'c']], 1, false) == [['a'], ['b']]
	assert resize_row([['a'], ['b']], 0, false) == [['b']]
	assert template_count(8) == 4
}
