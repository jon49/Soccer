module core

// The match page's actions (pages/match/match.page.ts). Each one reads the
// records fresh, applies a transition from match.v and saves what changed.

// Match is everything the match screens show for one game.
pub struct Match {
pub:
	team_id string
	game_id int
pub mut:
	team  Team // active players only
	game  Game
	state GameState
	// One record per active player, in the team's player order.
	players   []PlayerGame
	positions Positions
	stats     Stats
}

pub fn (s &Store) match_get(team_id string, game_id int) !Match {
	mut team := s.team_get(team_id)!
	game := team.game(game_id) or { return error('Could not find game ID!') }
	team.players = team.players.filter(it.active)
	return Match{
		team_id:   team_id
		game_id:   game_id
		team:      team
		game:      game
		state:     s.game_state_get(team_id, game_id, game)
		players:   s.player_games_get(team_id, game_id, team.players.map(it.id))
		positions: s.positions_get(team_id)
		stats:     s.stats_get(team_id)
	}
}

pub fn (m &Match) name(player_id int) string {
	return m.team.player_name(player_id)
}

pub fn (m &Match) number(player_id int) int {
	p := m.team.player(player_id) or { return 0 }
	return p.number
}

pub fn (m &Match) in_play() []PlayerGame {
	return m.players.filter(it.is_in_play())
}

pub fn (m &Match) on_deck() []PlayerGame {
	return m.players.filter(it.is_on_deck())
}

// benched: out (or no status yet), least time played first.
pub fn (m &Match) benched() []PlayerGame {
	mut res := m.players.filter(it.is_benched())
	res.sort_with_compare(fn (a &PlayerGame, b &PlayerGame) int {
		ta := a.total()
		tb := b.total()
		return if ta < tb {
			-1
		} else if ta > tb {
			1
		} else {
			0
		}
	})
	return res
}

pub fn (m &Match) not_playing() []PlayerGame {
	return m.players.filter(it.is_not_playing())
}

pub fn (m &Match) at_position(index int) ?PlayerGame {
	for p in m.players {
		if p.is_in_play() && p.status.position == index {
			return p
		}
	}
	return none
}

pub fn (m &Match) queued_for(index int) ?PlayerGame {
	for p in m.players {
		if p.is_on_deck() && p.status.target == index {
			return p
		}
	}
	return none
}

pub fn (m &Match) fair_share() f64 {
	available := m.players.filter(!it.is_not_playing()).len
	return fair_share_ratio(m.positions.flat().len, available)
}

pub fn (m &Match) credit_scorer() bool {
	return m.stats.is_active(goal_stat_id)
}

// ---- actions ----

// all_players is a record for every player on the team, active or not, as
// the web client's swaps use.
fn (s &Store) all_players(team Team, game_id int) []PlayerGame {
	return s.player_games_get(team.id, game_id, team.players.map(it.id))
}

fn (mut s Store) save_players(team_id string, players []PlayerGame, idx []int) ! {
	for i in idx {
		s.player_game_save(team_id, players[i])!
	}
}

pub fn (mut s Store) game_points_change(team_id string, game_id int, opponent bool, delta int) ! {
	mut gs := s.game_state_get(team_id, game_id, none)
	next := if opponent { gs.opponent_points + delta } else { gs.points + delta }
	if next < 0 {
		return error('Points cannot be negative!')
	}
	if opponent {
		gs.opponent_points = next
	} else {
		gs.points = next
	}
	s.game_state_save(team_id, gs)!
}

pub enum ClockChange {
	start
	pause
	end
}

// game_clock starts, pauses or ends the game clock and moves every in-play
// player's clock with it.
pub fn (mut s Store) game_clock(team_id string, game_id int, change ClockChange, now i64) ! {
	team := s.team_get(team_id)!
	game := team.game(game_id) or { return error('Could not find game! ${game_id}') }
	mut gs := s.game_state_get(team_id, game_id, game)
	match change {
		.start {
			gs.status = 'play'
			gs.clock_start(now)
		}
		.pause {
			gs.status = 'paused'
			gs.clock_end(now)!
		}
		.end {
			gs.status = 'ended'
			gs.clock_end(now)!
		}
	}
	mut players := s.all_players(team, game_id)
	game_on := gs.is_game_on()
	changed := match change {
		.start { start_in_play(mut players, game_on, now) }
		.pause { pause_in_play(mut players, game_on, now) }
		.end { end_in_play(mut players, now) }
	}
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	s.game_state_save(team_id, gs)!
	s.save_players(team_id, players, changed)!
}

pub fn (mut s Store) game_restart(team_id string, game_id int) ! {
	mut gs := s.game_state_get(team_id, game_id, none)
	gs.status = 'paused'
	s.game_state_save(team_id, gs)!
}

// swap moves queued players onto the field: all of them, or just player_id.
pub fn (mut s Store) swap(team_id string, game_id int, player_id int, now i64) ! {
	team := s.team_get(team_id)!
	game := team.game(game_id) or { return error('Could not find game ID!') }
	gs := s.game_state_get(team_id, game_id, game)
	mut players := s.all_players(team, game_id)
	ids := if player_id > 0 { [player_id] } else { []int{} }
	changed := swap_in(mut players, ids, gs.is_game_on(), now)!
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	s.save_players(team_id, players, changed)!
}

pub fn (mut s Store) move_to_position(team_id string, game_id int, player_id int, position int, now i64) ! {
	team := s.team_get(team_id)!
	game := team.game(game_id) or { return error('Could not find game ID!') }
	gs := s.game_state_get(team_id, game_id, game)
	mut players := s.all_players(team, game_id)
	if index_of_player(players, player_id) < 0 {
		return error('Could not find player ID!')
	}
	names := s.positions_get(team_id).flat()
	changed := target_position(mut players, player_id, names, position, gs.is_game_on(), now)
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	s.save_players(team_id, players, changed)!
}

// player_off takes a player off the field or out of the queue, to the
// bench, or to not playing.
pub fn (mut s Store) player_off(team_id string, game_id int, player_id int, not_playing bool, now i64) ! {
	mut p := s.player_game_get(team_id, game_id, player_id)
	if p.is_in_play() {
		p.in_play_out(now)
	} else if p.is_on_deck() {
		p.on_deck_out()
	}
	if not_playing {
		p.status = status_not_playing()
	}
	s.player_game_save(team_id, p)!
}

// back_in puts a not-playing player back on the bench.
pub fn (mut s Store) back_in(team_id string, game_id int, player_id int) ! {
	mut p := s.player_game_get(team_id, game_id, player_id)
	p.status = status_out()
	s.player_game_save(team_id, p)!
}

// all_out benches every field player and every queued player with a position.
pub fn (mut s Store) all_out(team_id string, game_id int, now i64) ! {
	m := s.match_get(team_id, game_id)!
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	for p in m.players {
		if p.is_in_play() || (p.is_on_deck() && p.status.target >= 0) {
			s.player_off(team_id, game_id, p.player_id, false, now)!
		}
	}
}

// player_stat adds to (or takes from) a player's stat. Goals beyond the
// first point go onto the score here; the Goal stat's own point changes the
// team's score too.
pub fn (mut s Store) player_stat(team_id string, game_id int, player_id int, stat_id int, inc bool, points int) ! {
	mut p := s.player_game_get(team_id, game_id, player_id)
	mut found := false
	mut new_count := 0
	mut delta := 0
	for mut st in p.stats {
		if st.stat_id == stat_id {
			new_count, delta = stat_operation(st.count, inc, points)
			st.count = new_count
			found = true
		}
	}
	if !found {
		new_count, delta = stat_operation(0, inc, points)
		p.stats << StatCount{stat_id, new_count}
	}
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	if delta != 0 {
		mut gs := s.game_state_get(team_id, game_id, none)
		gs.points += delta
		s.game_state_save(team_id, gs)!
	}
	s.player_game_save(team_id, p)!
	if stat_id == goal_stat_id {
		s.game_points_change(team_id, game_id, false, if inc { 1 } else { -1 }) or {}
	}
}

// score_point credits a goal to a player, or with no player (0) just adds
// to the team's score.
pub fn (mut s Store) score_point(team_id string, game_id int, player_id int, points int) ! {
	pts := if points > 0 { points } else { 1 }
	if player_id > 0 {
		s.player_stat(team_id, game_id, player_id, goal_stat_id, true, pts)!
		return
	}
	mut gs := s.game_state_get(team_id, game_id, none)
	gs.points += pts
	s.game_state_save(team_id, gs)!
}

// remove_point takes points back: from the scorer when one is given,
// otherwise just from the team's score.
pub fn (mut s Store) remove_point(team_id string, game_id int, player_id int, points int) ! {
	pts := if points > 0 { points } else { 1 }
	mut gs := s.game_state_get(team_id, game_id, none)
	if player_id > 0 {
		team := s.team_get(team_id)!
		p := s.player_game_get(team_id, game_id, player_id)
		if msg := take_back_error(pts, gs.points, team.player_name(player_id), p.stat_count(goal_stat_id),
			true)
		{
			return error(msg)
		}
		s.player_stat(team_id, game_id, player_id, goal_stat_id, false, pts)!
		return
	}
	if msg := take_back_error(pts, gs.points, '', 0, false) {
		return error(msg)
	}
	gs.points -= pts
	s.game_state_save(team_id, gs)!
}

// game_delete removes a game from the schedule, and clears (rather than
// deletes, so it syncs) its score and every player's time and stats.
pub fn (mut s Store) game_delete(team_id string, game_id int) ! {
	mut team := s.team_get(team_id)!
	active := team.players.filter(it.active)
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	for mut p in s.player_games_get(team_id, game_id, active.map(it.id)) {
		p.game_time.clear()
		p.stats.clear()
		p.status = PlayerStatus{}
		s.player_game_save(team_id, p)!
	}
	mut gs := s.game_state_get(team_id, game_id, team.game(game_id))
	gs.status = ''
	gs.points = 0
	gs.opponent_points = 0
	gs.game_time.clear()
	s.game_state_save(team_id, gs)!
	team.games = team.games.filter(it.id != game_id)
	s.team_save(team)!
}

// game_requeue re-marks a game's records as needing sync without changing
// them (Settings > Force resync a game). Returns how many were queued.
pub fn (mut s Store) game_requeue(team_id string, game_id int) !int {
	team := s.team_get(team_id)!
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	gs := s.game_state_get(team_id, game_id, team.game(game_id))
	s.game_state_save(team_id, gs)!
	mut n := 1
	for p in team.players {
		key := player_game_key(team_id, p.id, game_id)
		if data := s.get(key) {
			if rev_of(data) > 0 {
				s.requeue(key)!
				n++
			}
		}
	}
	return n
}
