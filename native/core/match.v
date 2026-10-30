module core

// The match state machine, ported from the web client's
// pages/match/state-logic.ts and its helpers. Player status moves between
// in play, on deck (queued for a position), out (on the bench) and not
// playing. Time is kept as intervals: an open interval has only a start,
// a closed one has both, and a player's not-yet-started interval has only
// a position. Every change to the intervals goes through the methods below
// so those invariants hold. `now` is passed in so the logic is testable.

// ---- totals ----

pub fn game_times_total(times []GameTime) i64 {
	mut total := i64(0)
	for t in times {
		if t.start != 0 && t.end != 0 {
			total += t.end - t.start
		}
	}
	return total
}

pub fn game_times_current_total(times []GameTime, now i64) i64 {
	mut total := game_times_total(times)
	if times.len > 0 {
		t := times.last()
		if t.end == 0 && t.start != 0 {
			total += now - t.start
		}
	}
	return total
}

pub fn player_times_total(times []PlayerGameTime) i64 {
	mut total := i64(0)
	for t in times {
		if t.start != 0 && t.end != 0 {
			total += t.end - t.start
		}
	}
	return total
}

pub fn player_times_current_total(times []PlayerGameTime, now i64) i64 {
	mut total := player_times_total(times)
	if times.len > 0 {
		t := times.last()
		if t.end == 0 && t.start != 0 {
			total += now - t.start
		}
	}
	return total
}

// ---- the game clock (GameTimeCalculator) ----

pub fn (mut g GameState) clock_start(now i64) {
	if g.game_time.len > 0 && g.game_time.last().end == 0 {
		return
	}
	g.game_time << GameTime{
		start: now
	}
}

pub fn (mut g GameState) clock_end(now i64) ! {
	if g.game_time.len == 0 || g.game_time.last().start == 0 {
		return error('Cannot end time without starting!')
	}
	if g.game_time.last().end == 0 {
		g.game_time[g.game_time.len - 1].end = now
	}
}

pub fn (g GameState) is_game_on() bool {
	if g.game_time.len == 0 {
		return false
	}
	t := g.game_time.last()
	return t.end == 0 && t.start != 0
}

pub fn (g GameState) last_start() i64 {
	return if g.game_time.len > 0 { g.game_time.last().start } else { 0 }
}

pub fn (g GameState) last_end() i64 {
	return if g.game_time.len > 0 { g.game_time.last().end } else { 0 }
}

pub fn (g GameState) total() i64 {
	return game_times_total(g.game_time)
}

pub fn (g GameState) current_total(now i64) i64 {
	return game_times_current_total(g.game_time, now)
}

pub fn (g GameState) is_in_play() bool {
	return g.status == 'play'
}

pub fn (g GameState) is_ended() bool {
	return g.status == 'ended'
}

pub fn (g GameState) is_paused() bool {
	return g.status == 'paused' || (!g.is_in_play() && !g.is_ended())
}

// ---- a player's clock (PlayerGameTimeCalculator) ----

pub fn (mut p PlayerGame) clock_start(game_on bool, now i64) {
	if !game_on || p.game_time.len == 0 {
		return
	}
	t := p.game_time.last()
	if t.position == '' || t.end != 0 {
		return
	}
	p.game_time[p.game_time.len - 1].start = now
}

pub fn (mut p PlayerGame) clock_end(now i64) {
	if p.game_time.len == 0 {
		return
	}
	t := p.game_time.last()
	if t.start == 0 || t.end != 0 {
		return
	}
	p.game_time[p.game_time.len - 1].end = now
}

pub fn (p PlayerGame) has_started() bool {
	return p.game_time.len > 0 && p.game_time.last().start != 0
}

pub fn (mut p PlayerGame) set_position(position string, game_on bool, now i64) {
	if p.game_time.len > 0 {
		t := p.game_time.last()
		if t.end == 0 && t.start != 0 {
			p.clock_end(now)
			p.game_time << PlayerGameTime{
				position: position
			}
			p.clock_start(game_on, now)
			return
		}
		if !p.has_started() {
			p.game_time[p.game_time.len - 1].position = position
			return
		}
	}
	p.game_time << PlayerGameTime{
		position: position
	}
}

// clock_out: a player leaving the field. A stint that never started is
// dropped; a running one is ended.
pub fn (mut p PlayerGame) clock_out(now i64) {
	if !p.has_started() {
		if p.game_time.len > 0 {
			p.game_time.delete_last()
		}
	} else {
		p.clock_end(now)
	}
}

pub fn (p PlayerGame) last_start() i64 {
	return if p.game_time.len > 0 { p.game_time.last().start } else { 0 }
}

pub fn (p PlayerGame) current_position() string {
	return if p.game_time.len > 0 { p.game_time.last().position } else { '' }
}

pub fn (p PlayerGame) total() i64 {
	return player_times_total(p.game_time)
}

pub fn (p PlayerGame) current_total(now i64) i64 {
	return player_times_current_total(p.game_time, now)
}

pub fn (p PlayerGame) is_in_play() bool {
	return p.status.kind == .in_play
}

pub fn (p PlayerGame) is_on_deck() bool {
	return p.status.kind == .on_deck
}

// is_benched: out, or no status yet.
pub fn (p PlayerGame) is_benched() bool {
	return p.status.kind in [.none_, .out]
}

pub fn (p PlayerGame) is_not_playing() bool {
	return p.status.kind == .not_playing
}

// ---- transitions (match-page-logic.ts) ----

pub fn (mut p PlayerGame) in_play_out(now i64) {
	p.status = status_out()
	p.clock_out(now)
}

pub fn (mut p PlayerGame) on_deck_out() {
	p.status = status_out()
	if p.game_time.len > 0 && p.game_time.last().end == 0 {
		p.game_time.delete_last()
	}
}

// start_in_play / pause_in_play / end_in_play move every in-play player's
// clock with the game's, returning the indexes of the players changed.
pub fn start_in_play(mut players []PlayerGame, game_on bool, now i64) []int {
	mut changed := []int{}
	for i, mut p in players {
		if p.is_in_play() {
			p.clock_start(game_on, now)
			changed << i
		}
	}
	return changed
}

pub fn pause_in_play(mut players []PlayerGame, game_on bool, now i64) []int {
	mut changed := []int{}
	for i, mut p in players {
		if p.is_in_play() {
			position := p.current_position()
			p.clock_end(now)
			p.set_position(position, game_on, now)
			changed << i
		}
	}
	return changed
}

pub fn end_in_play(mut players []PlayerGame, now i64) []int {
	mut changed := []int{}
	for i, mut p in players {
		if p.is_in_play() {
			p.clock_end(now)
			p.status = status_out()
			changed << i
		}
	}
	return changed
}

// stat_operation: the first point of a stat is the goal itself (counted by
// the score's own flow); points beyond it go straight onto the game score.
pub fn stat_operation(count int, inc bool, points int) (int, int) {
	sign := if inc { 1 } else { -1 }
	new_count := count + sign * points
	delta := if points > 1 { sign * (points - 1) } else { 0 }
	return new_count, delta
}

// take_back_error explains why `points` can't be taken back from the
// team's score, or from a scorer with `goals` points this game.
pub fn take_back_error(points int, team_points int, scorer_name string, goals int, has_scorer bool) ?string {
	if team_points - points < 0 {
		return 'Points cannot be negative!'
	}
	if has_scorer && goals < points {
		what := if points == 1 { 'a goal' } else { '${points} points' }
		return "${scorer_name} doesn't have ${what} to take back."
	}
	return none
}

// ---- swaps (player-swap-logic.ts, player-target-position-logic.ts) ----

pub fn (p PlayerGame) field_position() int {
	return match p.status.kind {
		.on_deck { p.status.target }
		.in_play { p.status.position }
		else { -1 }
	}
}

// swap_in moves each queued player (with a target position) onto the
// field, sending whoever holds that position to the bench. `players` is
// every player in the game; `ids` limits it to some of the queued players.
// Returns the indexes changed.
pub fn swap_in(mut players []PlayerGame, ids []int, game_on bool, now i64) ![]int {
	mut changed := []int{}
	queued := players.filter(it.is_on_deck() && it.status.target >= 0
		&& (ids.len == 0 || it.player_id in ids)).map(it.player_id)
	for pid in queued {
		qi := index_of_player(players, pid)
		target := players[qi].field_position()
		for i, mut p in players {
			if p.is_in_play() && p.status.position == target {
				p.clock_end(now)
				p.status = status_out()
				if i !in changed {
					changed << i
				}
			}
		}
		players[qi].clock_start(game_on, now)
		if target < 0 {
			return error('Player position number is required!')
		}
		players[qi].status = in_play(target)
		if qi !in changed {
			changed << qi
		}
	}
	return changed
}

fn index_of_player(players []PlayerGame, player_id int) int {
	for i, p in players {
		if p.player_id == player_id {
			return i
		}
	}
	return -1
}

// target_position sends a player to a field position: a field player moves
// there (swapping with whoever holds it), and a bench or queued player is
// queued for it (bumping whoever was queued there back to the bench).
// Returns the indexes changed.
pub fn target_position(mut players []PlayerGame, player_id int, names []string, target int, game_on bool, now i64) []int {
	i := index_of_player(players, player_id)
	if i < 0 || target < 0 || target >= names.len {
		return []int{}
	}
	mut changed := []int{}
	if players[i].is_in_play() {
		old := players[i].status.position
		mut other := -1
		for j, p in players {
			if j != i && p.is_in_play() && p.status.position == target {
				other = j
			}
		}
		players[i].status = in_play(target)
		players[i].set_position(names[target], game_on, now)
		players[i].clock_start(game_on, now)
		changed << i
		if other >= 0 {
			players[other].status = in_play(old)
			players[other].set_position(names[old], game_on, now)
			players[other].clock_start(game_on, now)
			changed << other
		}
		return changed
	}
	if players[i].status.kind in [.on_deck, .out, .none_] {
		for j, mut p in players {
			if j != i && p.is_on_deck() && p.status.target == target {
				p.status = status_out()
				changed << j
			}
		}
		players[i].status = on_deck(target)
		players[i].set_position(names[target], game_on, now)
		changed << i
	}
	return changed
}

// ---- fairness and highlights (player-state-logic.ts) ----

pub const default_stale_after_minutes = 8

// stale_after_ms is the team's highlight limit, or none when switched off (0).
pub fn stale_after_ms(minutes int) ?i64 {
	m := if minutes < 0 { default_stale_after_minutes } else { minutes }
	return if m > 0 { i64(m) * 60 * 1000 } else { none }
}

pub fn is_roster_full(in_play int, on_deck int, positions int) bool {
	return in_play + on_deck >= positions
}

// fair_share_ratio is each available player's even share of the game:
// field spots over players available, or 1 when everyone fits.
pub fn fair_share_ratio(spots int, available int) f64 {
	return if spots > 0 && available > spots { f64(spots) / f64(available) } else { 1.0 }
}

// ---- display ----

// format_clock: "12:05", or "1:02:05" past an hour.
pub fn format_clock(ms i64) string {
	total := if ms < 0 { i64(0) } else { ms / 1000 }
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	return if h > 0 { '${h}:${m:02}:${s:02}' } else { '${m}:${s:02}' }
}

// format_timer is the match view's timer: "05:07" or "1:05:07".
pub fn format_timer(ms i64) string {
	total := if ms < 0 { i64(0) } else { ms / 1000 }
	h := total / 3600
	m := (total % 3600) / 60
	s := total % 60
	return if h > 0 { '${h}:${m:02}:${s:02}' } else { '${m:02}:${s:02}' }
}

pub fn game_status_text(status string, played_ms i64) string {
	return match status {
		'play' { 'In progress' }
		'paused' { 'Paused at ${format_clock(played_ms)}' }
		'ended' { 'Ended at ${format_clock(played_ms)}' }
		else { 'Not started' }
	}
}
