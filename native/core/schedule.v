module core

// The published schedule page, as the web client's pages/schedule-html.ts
// renders it. The fixed parts live in schedule_template.html (copied from
// there); this fills in the title and the game cards.

const schedule_template = $embed_file('schedule_template.html')

pub fn escape_html(s string) string {
	return s.replace_each(['&', '&amp;', '<', '&lt;', '>', '&gt;', '"', '&quot;'])
}

// GameGoals is one player's points in one game, from their Goal stat.
pub struct GameGoals {
pub:
	game_id   int
	player_id int
	points    int
}

struct Scorer {
	name   string
	points int
}

fn points_label(points int, basketball bool) string {
	unit := if basketball { 'point' } else { 'goal' }
	return '${points} ${unit}${if points == 1 { '' } else { 's' }}'
}

// Points that weren't credited to a player are listed as "Other" so the
// popover adds up to the final score.
fn score_line(team Team, state ?GameState, scorers []Scorer) string {
	gs := state or { return '' }
	if gs.status != 'ended' {
		return ''
	}
	score := 'Final: ${gs.points} – ${gs.opponent_points}'
	if scorers.len == 0 {
		return '\n  <div class="game-score">${score}</div>'
	}
	id := 'scorers-${gs.game_id}'
	mut credited := 0
	mut rows := []string{}
	for x in scorers {
		credited += x.points
		rows << '\n      <li><span>${escape_html(x.name)}</span><span>${points_label(x.points, team.basketball_mode)}</span></li>'
	}
	if gs.points > credited {
		rows << '\n      <li class="scorer-other"><span>Other</span><span>${points_label(gs.points - credited, team.basketball_mode)}</span></li>'
	}
	button := '<button type="button" class="score-button" popovertarget="${id}">'
	popover := '\n  <div class="scorers" id="${id}" popover>\n    <h2>${escape_html(team.name)} scorers</h2>\n    <ul>${rows.join('')}\n    </ul>\n  </div>'
	return '\n  <div class="game-score">${button}${score}</button></div>${popover}'
}

fn game_card(game Game, score string) string {
	opponent := escape_html(if game.opponent == '' { 'TBD' } else { game.opponent })
	location := escape_html(if game.location == '' { 'TBD' } else { game.location })
	home_away := if game.home { 'Home' } else { 'Away' }
	badge := if game.home { 'badge-home' } else { 'badge-away' }
	return '<li class="game" data-date="${escape_html(game.date)}">
  <span class="game-date">${escape_html(format_game_date(game.date))}</span>
  <span class="game-time">${escape_html(format_game_time(game.time))}</span>
  <div class="game-opponent">
    vs ${opponent}
    <span class="badge ${badge}">${home_away}</span>
  </div>
  <span class="game-location">${location}</span>${score}
</li>'
}

pub fn render_schedule_html(team Team, states []GameState, goals []GameGoals) string {
	mut by_id := map[int]GameState{}
	for st in states {
		by_id[st.game_id] = st
	}
	mut scorers := map[int][]Scorer{}
	for g in goals {
		name := team.player_name(g.player_id)
		if name == '' || g.points <= 0 {
			continue
		}
		mut list := scorers[g.game_id] or { []Scorer{} }
		list << Scorer{name, g.points}
		scorers[g.game_id] = list
	}
	for id, mut list in scorers {
		list.sort_with_compare(fn (a &Scorer, b &Scorer) int {
			if a.points != b.points {
				return b.points - a.points
			}
			return if a.name < b.name {
				-1
			} else if a.name > b.name {
				1
			} else {
				0
			}
		})
		scorers[id] = list
	}
	mut games := team.games.clone()
	games.sort_with_compare(fn (a &Game, b &Game) int {
		ka := a.date + ' ' + a.time
		kb := b.date + ' ' + b.time
		return if ka < kb {
			-1
		} else if ka > kb {
			1
		} else {
			0
		}
	})
	items := if games.len == 0 {
		'<li class="game empty">No games scheduled yet.</li>'
	} else {
		games.map(game_card(it, score_line(team, by_id[it.id] or { GameState{} }, scorers[it.id] or {
			[]Scorer{}
		}))).join('\n')
	}
	title := escape_html('${team.name} ${team.year}')
	return schedule_template.to_string().replace('{{TITLE}}', title).replace('{{ITEMS}}',
		items)
}

// schedule_goals: who scored in ended games with a score, for the page.
pub fn (s &Store) schedule_goals(team Team, states []GameState) []GameGoals {
	ids := team.players.map(it.id)
	mut res := []GameGoals{}
	if ids.len == 0 {
		return res
	}
	for st in states {
		if st.status != 'ended' || st.points <= 0 {
			continue
		}
		for pg in s.player_games_get(team.id, st.game_id, ids) {
			res << GameGoals{st.game_id, pg.player_id, pg.stat_count(goal_stat_id)}
		}
	}
	return res
}
