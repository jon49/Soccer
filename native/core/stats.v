module core

// The stats page's tables (pages/stats/*). Each is a list of rows with a
// player name and string cells, ready to draw.

pub struct StatsTable {
pub mut:
	title   string
	headers []string
	// Per-game columns get a date over the opponent: sub_headers line up
	// with headers ('' for none).
	sub_headers []string
	rows        []StatsRow
}

pub struct StatsRow {
pub mut:
	name  string
	cells []string
}

pub struct PlayedGame {
pub:
	game    Game
	state   GameState
	players []PlayerGame
}

// played_games: games started at least once, soonest first, with every
// team player's record.
pub fn (s &Store) played_games(team Team) []PlayedGame {
	ids := team.players.map(it.id)
	mut res := []PlayedGame{}
	for g in team.games {
		state := s.game_state_get(team.id, g.id, g)
		if state.status == '' {
			continue
		}
		res << PlayedGame{g, state, s.player_games_get(team.id, g.id, ids)}
	}
	res.sort_with_compare(fn (a &PlayedGame, b &PlayedGame) int {
		ka := a.game.date + ' ' + a.game.time
		kb := b.game.date + ' ' + b.game.time
		return if ka < kb {
			-1
		} else if ka > kb {
			1
		} else {
			0
		}
	})
	return res
}

// players_by_name: every team player, sorted by name.
fn players_by_name(team Team) []TeamPlayer {
	mut ps := team.players.clone()
	ps.sort_with_compare(fn (a &TeamPlayer, b &TeamPlayer) int {
		an := a.name.to_lower()
		bn := b.name.to_lower()
		return if an < bn {
			-1
		} else if an > bn {
			1
		} else {
			0
		}
	})
	return ps
}

// hms: "1:05:07".
pub fn hms(ms i64) string {
	total := ms / 1000
	return '${total / 3600}:${(total % 3600) / 60:02}:${total % 60:02}'
}

// time_played_table: time each player spent in each position, over every
// game the team has (Hours:Minutes:Seconds).
pub fn (s &Store) time_played_table(team Team) StatsTable {
	ids := team.players.map(it.id)
	// position -> player id -> time
	mut by_pos := map[string]map[int]i64{}
	for g in team.games {
		for pg in s.player_games_get(team.id, g.id, ids) {
			for t in pg.game_time {
				if t.position == '' {
					continue
				}
				if t.position !in by_pos {
					by_pos[t.position] = map[int]i64{}
				}
				mut cur := by_pos[t.position][pg.player_id] or { i64(0) }
				if t.start != 0 && t.end != 0 {
					cur += t.end - t.start
				}
				by_pos[t.position][pg.player_id] = cur
			}
		}
	}
	mut positions := by_pos.keys()
	positions.sort()
	mut table := StatsTable{
		title: 'Positions Played (Hours:Minutes:Seconds)'
	}
	table.headers = positions.clone()
	table.headers << 'Total'
	table.sub_headers = []string{len: table.headers.len}
	for p in players_by_name(team) {
		mut row := StatsRow{
			name: p.name
		}
		mut total := i64(0)
		for pos in positions {
			if t := by_pos[pos][p.id] {
				row.cells << hms(t)
				total += t
			} else {
				row.cells << ''
			}
		}
		row.cells << hms(total)
		table.rows << row
	}
	return table
}

// percentage_table: each player's share of each played game's time, and
// their average over the games they played in.
pub fn (s &Store) percentage_table(team Team, now i64) StatsTable {
	games := s.played_games(team)
	mut table := StatsTable{
		title:   'Average Percentage of Games Played'
		headers: ['Total Games', '% Played']
	}
	table.sub_headers = ['', '']
	for g in games {
		table.headers << format_short_date(g.game.date)
		table.sub_headers << g.game.opponent
	}
	for p in players_by_name(team) {
		mut rates := []f64{}
		mut played := 0
		for g in games {
			mut rate := 0.0
			for pg in g.players {
				if pg.player_id == p.id && pg.game_time.len > 0 {
					game_total := g.state.current_total(now)
					rate = f64(pg.current_total(now)) / f64(if game_total > 0 {
						game_total
					} else {
						1
					})
					played++
				}
			}
			rates << rate
		}
		mut sum := 0.0
		for r in rates {
			sum += r
		}
		avg := sum / f64(if played > 0 { played } else { 1 }) * 100
		mut row := StatsRow{
			name: p.name
		}
		row.cells << played.str()
		row.cells << if avg == 0 { '-' } else { '${avg:.0f}%' }
		for r in rates {
			row.cells << if r == 0 { '-' } else { '${r * 100:.0f}%' }
		}
		table.rows << row
	}
	return table
}

// points_table: each player's stat counts per played game.
pub fn (s &Store) points_table(team Team) StatsTable {
	games := s.played_games(team)
	mut table := StatsTable{
		title:   'Player Points'
		headers: ['Total Points']
	}
	table.sub_headers = ['']
	for g in games {
		table.headers << format_short_date(g.game.date)
		table.sub_headers << g.game.opponent
	}
	for p in players_by_name(team) {
		mut per_game := []int{}
		for g in games {
			mut n := 0
			for pg in g.players {
				if pg.player_id == p.id {
					for st in pg.stats {
						n += st.count
					}
				}
			}
			per_game << n
		}
		mut total := 0
		for n in per_game {
			total += n
		}
		mut row := StatsRow{
			name: p.name
		}
		row.cells << if total == 0 { '-' } else { total.str() }
		for n in per_game {
			row.cells << if n == 0 { '-' } else { n.str() }
		}
		table.rows << row
	}
	return table
}
