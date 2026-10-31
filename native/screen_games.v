module main

import core
import gui

// A team's games (pages/games.page.ts), one game's page
// (match/_game-play-view.ts) and the goal scorer picker
// (match/_activity-position-view.ts).

struct GameFields {
mut:
	date     gui.Input
	time     gui.Input
	opponent gui.Input
	location gui.Input
	home     bool
}

struct GamesForm {
mut:
	team_id string
	add     GameFields
	editing int // the game being edited, or 0
	edit    GameFields
}

fn (mut app App) load_games() {
	if app.games.team_id != app.route.team_id {
		app.games = GamesForm{
			team_id: app.route.team_id
		}
	}
}

fn is_upcoming(g core.Game) bool {
	return core.today_str() <= g.date
}

// ordered_games: soonest first; a game sinks to the bottom a day after it
// is played (oldest-played last).
fn ordered_games(games []core.Game) []core.Game {
	mut sorted := games.clone()
	sorted.sort_with_compare(fn (a &core.Game, b &core.Game) int {
		return if a.date < b.date {
			-1
		} else if a.date > b.date {
			1
		} else {
			0
		}
	})
	mut res := sorted.filter(is_upcoming(it))
	res << sorted.filter(!is_upcoming(it))
	return res
}

fn (mut app App) draw_games(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	bh := ui.button_height()
	lh := ui.line_height(0)
	mut y := app.heading(x, y0, team.name)

	// The published schedule.
	pub_label := if app.is_busy(.publish) {
		'Publishing…'
	} else if team.schedule_file_id != '' {
		'Republish Schedule'
	} else {
		'Publish Schedule'
	}
	pw := ui.button_width('Republish Schedule')
	if ui.button(gui.Rect{x, y, pw, bh}, pub_label, .outline) {
		if !app.store.auth.logged_in() {
			app.show_error('Log in to publish the schedule.')
		} else {
			app.publish_schedule(team.id, false)
		}
	}
	y += bh + 8
	if team.schedule_file_id != '' {
		url := core.schedule_url(app.store.settings.server_url, team.schedule_file_id)
		ui.text(x, y, 'Shared schedule:', gui.TextStyle{ color: t.muted })
		lw := ui.text_width('Shared schedule: ', gui.TextStyle{})
		shown := url.all_before('?t=')
		if ui.link(x + lw, y, ui.fit(shown, w - lw - 70, gui.TextStyle{}), gui.TextStyle{}) {
			open_in_browser(url)
		}
		cw := ui.button_width('Copy')
		if ui.button(gui.Rect{x + w - cw, y - 8, cw, bh}, 'Copy', .ghost) {
			if copy_text(shown) {
				app.show_toast('Link copied.')
			} else {
				app.show_error('Could not copy the link.')
			}
		}
		y += lh + 16
	}
	y += 8

	games := ordered_games(team.games)
	mut next_id := -1
	for g in games {
		if is_upcoming(g) {
			next_id = g.id
			break
		}
	}
	for g in games {
		y = app.draw_game_card(team, g, g.id == next_id, x, y, w) + 10
	}
	if games.len == 0 {
		y = app.paragraph(x, y, w, 'No games yet. Add one below.', true)
	}

	y += 10
	y = app.subheading(x, y, 'Add a game')
	y = app.game_fields('add', x, y, w, mut app.games.add)
	sw := ui.button_width('Save')
	if ui.button(gui.Rect{x, y, sw, bh}, 'Save', .primary) {
		app.save_game(0)
	}
	return y + bh
}

fn (mut app App) draw_game_card(team core.Team, g core.Game, is_next bool, x f32, y f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	lh := ui.line_height(0)
	bh := ui.button_height()
	state := app.store.game_state_get(team.id, g.id, g)
	past := !is_upcoming(g)
	editing := app.games.editing == g.id
	mut h := 14 + lh + 4 + lh + 14
	if g.location != '' {
		h += lh + 2
	}
	main_h := h
	if editing {
		h += app.game_fields_height(w - 32) + bh + 16
	}
	card := gui.Rect{x, y, w, h}
	bg := if is_next { gui.mix(t.surface, t.on, 0.12) } else { t.surface }
	ui.rounded(card, 8, bg)
	ui.rounded_border(card, 8, if is_next { t.on } else { t.border })
	fg := if past { t.muted } else { t.text }
	main_r := gui.Rect{x, y, w - 150, main_h}
	if ui.hovered(main_r) {
		ui.rounded(main_r, 8, gui.hexa(0x808080, 25))
	}
	mut tx := x + 16
	if is_next {
		tx += badge(ui, tx, y + 14, 'Next') + 8
	}
	when := core.format_game_date(g.date) + if g.time != '' {
		' · ' + core.format_game_time(g.time)
	} else {
		''
	}
	ui.text(tx, y + 14, when, gui.TextStyle{ color: fg, size: 14 })
	ui.text(x + 16, y + 14 + lh + 4, ui.fit('vs ${g.opponent}', main_r.w - 32, gui.TextStyle{
		bold: true
	}), gui.TextStyle{
		bold:  true
		color: fg
	})
	if g.location != '' {
		ui.text(x + 16, y + 14 + 2 * lh + 6, ui.fit(g.location, main_r.w - 32, gui.TextStyle{}),
			gui.TextStyle{ color: t.muted, size: 14 })
	}
	ui.pointer_cursor(main_r)
	if ui.tap(main_r, 'game-${g.id}') {
		app.go(Route{
			screen:  .game
			team_id: team.id
			game_id: g.id
		})
	}
	// Right side: home/away, the score, edit.
	rx := x + w - 16
	side := if g.home { 'Home' } else { 'Away' }
	side_w := ui.text_width(side, gui.TextStyle{ size: 12, bold: true }) + 14
	ui.rounded(gui.Rect{rx - side_w, y + 12, side_w, 20}, 10, t.surface_hi)
	ui.text(rx - side_w + 7, y + 22, side, gui.TextStyle{
		size:   12
		bold:   true
		valign: .middle
	})
	if state.status != '' {
		score := '${state.points} – ${state.opponent_points}'
		ui.text(rx, y + 40, score, gui.TextStyle{
			bold:  true
			align: .right
			size:  18
		})
	}
	ew := ui.button_width('✎ Edit')
	er := gui.Rect{rx - ew, y + main_h - bh - 6, ew, bh}
	if ui.button(er, if editing { 'Close' } else { '✎ Edit' }, .ghost) {
		if editing {
			app.games.editing = 0
		} else {
			app.games.editing = g.id
			app.games.edit = GameFields{
				date:     gui.input(g.date)
				time:     gui.input(g.time)
				opponent: gui.input(g.opponent)
				location: gui.input(g.location)
				home:     g.home
			}
		}
	}
	if editing {
		mut fy := y + main_h
		fy = app.game_fields('edit-${g.id}', x + 16, fy, w - 32, mut app.games.edit)
		sw := ui.button_width('Save')
		if ui.button(gui.Rect{x + 16, fy, sw, bh}, 'Save', .primary) {
			app.save_game(g.id)
		}
	}
	return y + h
}

fn (app &App) game_fields_height(w f32) f32 {
	fh := app.ui.field_height()
	row := 22 + fh + 14
	cols := columns(w, 2, 220)
	rows := if cols == 2 { 2 } else { 4 }
	return rows * row + app.ui.button_height() + 14
}

// game_fields draws the date, time, opponent and location fields and the
// home/away toggle.
fn (mut app App) game_fields(id string, x f32, y0 f32, w f32, mut f GameFields) f32 {
	mut ui := app.ui
	cols := columns(w, 2, 220)
	cw := if cols == 2 { (w - pad) / 2 } else { w }
	x2 := if cols == 2 { x + cw + pad } else { x }
	mut y := y0
	_, a1 := app.labeled_field('${id}-date', 'Date (YYYY-MM-DD)', x, y, cw, mut f.date,
		.date, core.today_str())
	if cols == 1 {
		y = a1
	}
	_, a2 := app.labeled_field('${id}-time', 'Time (e.g. 10:00 or 2:30 pm)', x2, y, cw, mut
		f.time, .time, 'TBD')
	y = a2
	_, b1 := app.labeled_field('${id}-opponent', 'Opponent', x, y, cw, mut f.opponent, .text,
		'')
	if cols == 1 {
		y = b1
	}
	_, b2 := app.labeled_field('${id}-location', 'Location', x2, y, cw, mut f.location, .text,
		'')
	y = b2
	bh := ui.button_height()
	tw := ui.toggle_width('Visiting', 'Home')
	if ui.toggle(gui.Rect{x, y, tw, bh}, 'Visiting', 'Home', f.home) {
		f.home = !f.home
	}
	return y + bh + 14
}

// save_game adds a game (id 0) or saves the one being edited.
fn (mut app App) save_game(id int) {
	f := if id == 0 { app.games.add } else { app.games.edit }
	date := core.parse_date(f.date.text) or {
		app.show_error('"Game Date" must be a date like ${core.today_str()}.')
		return
	}
	mut time_ := ''
	if f.time.text.trim_space() != '' {
		time_ = core.parse_time(f.time.text) or {
			app.show_error('"Game Time" must be a time like 10:00 or 2:30 pm.')
			return
		}
	}
	mut opponent := core.check_optional_text('Game Opponent', f.opponent.text, 50) or {
		app.show_error(err.msg())
		return
	}
	if opponent == '' {
		if id == 0 {
			app.show_error('"Game Opponent" is required.')
			return
		}
		opponent = 'Unknown'
	}
	location := core.check_optional_text('Game Location', f.location.text, 50) or {
		app.show_error(err.msg())
		return
	}
	mut team := app.store.team_get(app.route.team_id) or {
		app.show_error(err.msg())
		return
	}
	ds := date.str()
	for g in team.games {
		if g.id != id && core.equals(g.date, ds) && core.equals(g.opponent, opponent) {
			app.show_error('The game "${ds} - ${opponent}" already exists!')
			return
		}
	}
	if id == 0 {
		team.games << core.Game{
			id:       core.new_id(team.games.map(it.id))
			date:     ds
			time:     time_
			home:     f.home
			opponent: opponent
			location: location
		}
	} else {
		for mut g in team.games {
			if g.id == id {
				g.date = ds
				g.time = time_
				g.home = f.home
				g.opponent = opponent
				g.location = location
			}
		}
	}
	app.store.team_save(team) or {
		app.show_error(err.msg())
		return
	}
	if id == 0 {
		app.games.add = GameFields{}
	} else {
		app.games.editing = 0
	}
	app.changed()
}

// ---- one game ----

struct GameForm {
mut:
	key   string
	notes gui.Input
	dirty bool
}

fn (mut app App) load_game() {
	key := '${app.route.team_id}/${app.route.game_id}'
	if app.game.key == key && app.game.dirty {
		return
	}
	app.game = GameForm{
		key:   key
		notes: gui.input(app.store.game_notes_get(app.route.team_id, app.route.game_id).notes)
	}
}

fn (mut app App) commit_game_notes() {
	if !app.game.dirty {
		return
	}
	app.game.dirty = false
	parts := app.game.key.split('/')
	if parts.len != 2 {
		return
	}
	app.store.game_notes_save(parts[0], parts[1].int(), app.game.notes.text) or {
		app.show_error(err.msg())
		return
	}
	app.changed()
}

fn (mut app App) draw_game(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	m := app.store.match_get(app.route.team_id, app.route.game_id) or { return y0 }
	bh := ui.button_height()
	lh := ui.line_height(0)
	mut y := app.heading(x, y0, ui.fit('${m.team.name} vs ${m.game.opponent}', w, gui.TextStyle{
		size: 24
		bold: true
	}))
	mut details := [core.format_game_date(m.game.date)]
	if m.game.time != '' {
		details << core.format_game_time(m.game.time)
	}
	details << if m.game.home { 'Home' } else { 'Away' }
	if m.game.location != '' {
		details << m.game.location
	}
	text := details.join('  ·  ')
	ui.text(x, y, ui.fit(text, w, gui.TextStyle{}), gui.TextStyle{ color: t.muted })
	y += lh + 8
	status := core.game_status_text(m.state.status, m.state.total())
	sw := badge(ui, x, y, status)
	_ = sw
	y += 36

	ow := ui.button_width('Open match') + 40
	if ui.button(gui.Rect{x, y, ow, bh + 8}, 'Open match', .primary) {
		app.go(Route{
			screen:  .match
			team_id: m.team_id
			game_id: m.game_id
		})
	}
	y += bh + 28

	// The score.
	for opponent in [false, true] {
		label := if opponent { 'Opponent' } else { 'Points' }
		value := if opponent { m.state.opponent_points } else { m.state.points }
		row := gui.Rect{x, y, w, bh + 12}
		ui.hline(x, row.bottom(), w, t.border)
		ui.text(x, y + row.h / 2, label, gui.TextStyle{ valign: .middle })
		pw := f32(44)
		bx := x + w - pw * 2 - 60
		if ui.button(gui.Rect{bx, y + 6, pw, bh}, '−', .outline) {
			app.game_points(m, opponent, false)
		}
		ui.text(bx + pw + 30, y + row.h / 2, value.str(), gui.TextStyle{
			bold:   true
			size:   18
			align:  .center
			valign: .middle
		})
		if ui.button(gui.Rect{bx + pw + 60, y + 6, pw, bh}, '+', .outline) {
			app.game_points(m, opponent, true)
		}
		y += row.h + 1
	}
	y += 24

	y = app.subheading(x, y, 'Notes')
	nh := ui.multiline_height(app.game.notes.text)
	ev := ui.field('game-notes', gui.Rect{x, y, w, nh}, mut app.game.notes, .multiline, 'Notes about the game')
	if ev == .changed {
		app.game.dirty = true
	}
	if ev in [.committed, .submitted, .cancelled] {
		app.commit_game_notes()
	}
	y += nh + 36

	mut zy := app.subheading(x + 16, y + 16, 'Delete game')
	zy = app.paragraph(x + 16, zy, w - 32, "Removes the game from the schedule, along with its score and every player's time and stats for it.",
		false)
	dw := ui.button_width('Delete game')
	if ui.button(gui.Rect{x + 16, zy, dw, bh}, 'Delete game', .danger) {
		app.ask(Confirm{
			message: 'Are you sure you would like to delete this game?'
			yes:     'Delete game'
			action:  .delete_game
			team_id: m.team_id
			game_id: m.game_id
		})
	}
	zy += bh + 16
	ui.rounded_border(gui.Rect{x, y, w, zy - y}, 8, t.danger)
	return zy
}

// game_points: with the Goal stat on, a goal goes to a player (the picker);
// otherwise it just changes the score.
fn (mut app App) game_points(m core.Match, opponent bool, inc bool) {
	if !opponent && m.credit_scorer() {
		app.go(Route{
			screen:  .goal_picker
			team_id: m.team_id
			game_id: m.game_id
			inc:     inc
		})
		return
	}
	app.store.game_points_change(m.team_id, m.game_id, opponent, if inc { 1 } else { -1 }) or {
		app.show_error(err.msg())
		return
	}
	app.changed()
}

fn (mut app App) delete_game(team_id string, game_id int) {
	app.store.game_delete(team_id, game_id) or {
		app.show_error(err.msg())
		return
	}
	app.changed()
	app.forget_routes(fn [team_id, game_id] (r Route) bool {
		return r.team_id == team_id && r.game_id == game_id
	})
	app.replace(Route{
		screen:  .games
		team_id: team_id
	})
}

// ---- the goal scorer picker ----

fn (mut app App) draw_goal_picker(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	m := app.store.match_get(app.route.team_id, app.route.game_id) or { return y0 }
	bh := ui.button_height()
	mut y := app.heading(x, y0, if app.route.inc { 'Player Goal' } else { 'Take Back a Goal' })
	cw := ui.button_width('Cancel')
	if ui.button(gui.Rect{x, y - 8, cw, bh}, 'Cancel', .outline) {
		app.back()
		return y
	}
	y += bh + 8
	if m.team.basketball_mode {
		ui.text(x, y, 'Points', gui.TextStyle{ bold: true })
		y += 26
		choice := ui.segmented(gui.Rect{x, y, 300, bh}, ['1 Point', '2 Points', '3 Points'],
			app.match.points - 1)
		if choice >= 0 {
			app.match.points = choice + 1
		}
		y += bh + 16
	}
	cell_w := f32(110)
	gap := f32(8)
	mut index := 0
	for row in m.positions.positions {
		total := f32(row.len) * cell_w + f32(row.len - 1) * gap
		mut cx := x + (w - total) / 2
		for _ in row {
			if p := m.at_position(index) {
				if ui.button(gui.Rect{cx, y, cell_w, bh}, m.name(p.player_id), .secondary) {
					app.pick_scorer(m, p.player_id)
					return y
				}
			}
			cx += cell_w + gap
			index++
		}
		y += bh + gap
	}
	y += 8
	mut others := m.on_deck()
	others << m.benched()
	per_row := int((w + gap) / (cell_w + gap))
	for i, p in others {
		col := i % (if per_row > 0 { per_row } else { 1 })
		if i > 0 && col == 0 {
			y += bh + gap
		}
		if ui.button(gui.Rect{x + col * (cell_w + gap), y, cell_w, bh}, m.name(p.player_id),
			.secondary)
		{
			app.pick_scorer(m, p.player_id)
			return y
		}
	}
	return y + bh
}

fn (mut app App) pick_scorer(m core.Match, player_id int) {
	points := if m.team.basketball_mode { app.match.points } else { 1 }
	app.store.player_stat(m.team_id, m.game_id, player_id, core.goal_stat_id, app.route.inc,
		points) or { app.show_error(err.msg()) }
	app.changed()
	app.back()
}
