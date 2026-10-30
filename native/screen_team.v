module main

import core
import gui

// A team's settings and players (pages/players.page.ts).

struct TeamForm {
mut:
	team_id    string
	name       gui.Input
	year       gui.Input
	numbers    map[int]gui.Input
	names      map[int]gui.Input
	new_player gui.Input
}

fn (mut app App) load_team() {
	team := app.store.team_get(app.route.team_id) or { return }
	app.team.team_id = team.id
	app.team.name = gui.input(team.name)
	app.team.year = gui.input(team.year)
	app.team.numbers.clear()
	app.team.names.clear()
	for p in team.players {
		app.team.numbers[p.id] = gui.input(if p.number > 0 { p.number.str() } else { '' })
		app.team.names[p.id] = gui.input(p.name)
	}
}

fn (mut app App) draw_team(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	bh := ui.button_height()
	fh := ui.field_height()
	mut y := app.heading(x, y0, '${team.name} (${team.year})')
	share_label := if team.is_shared() { 'Sharing' } else { 'Share' }
	sw := ui.button_width(share_label)
	if ui.button(gui.Rect{x, y - 8, sw, bh}, share_label, .outline) {
		app.go(Route{
			screen:  .share
			team_id: team.id
		})
	}
	y += bh + 8

	y = app.subheading(x, y, 'Team Settings')
	cols := columns(w, 2, 240)
	cw := (w - f32(cols - 1) * pad) / f32(cols)
	ev1, y1 := app.labeled_field('team-name', 'Team Name', x, y, cw, mut app.team.name, .text,
		'')
	yx := if cols == 2 { x + cw + pad } else { x }
	yy := if cols == 2 { y } else { y1 }
	ev2, y2 := app.labeled_field('team-year', 'Year', yx, yy, cw, mut app.team.year, .text,
		'')
	y = if y1 > y2 { y1 } else { y2 }
	if ev1 in [.committed, .submitted] || ev2 in [.committed, .submitted] {
		app.save_team_settings(team.active)
	}
	tw := ui.toggle_width('Inactive', 'Active')
	if ui.toggle(gui.Rect{x, y, tw, bh}, 'Inactive', 'Active', team.active) {
		app.save_team_settings(!team.active)
	}
	y += bh + 30

	active := team.players.filter(it.active).len
	y = app.subheading(x, y, 'Players Settings (${active})')
	if team.players.len == 0 {
		y = app.paragraph(x, y, w, 'No players have been added.', true)
	}
	num_w := f32(64)
	pw := ui.toggle_width('Inactive', 'Active')
	for p in team.players {
		mut num := app.team.numbers[p.id] or { gui.input('') }
		mut name := app.team.names[p.id] or { gui.input(p.name) }
		nw := w - num_w - pw - 2 * 8
		ev_num := ui.field('pnum-${p.id}', gui.Rect{x, y, num_w, fh}, mut num, .number, '#')
		ev_name := ui.field('pname-${p.id}', gui.Rect{x + num_w + 8, y, nw, fh}, mut name,
			.text, 'Player name')
		app.team.numbers[p.id] = num
		app.team.names[p.id] = name
		if ev_num in [.committed, .submitted] || ev_name in [.committed, .submitted] {
			app.save_player(p.id, p.active)
		}
		if ui.toggle(gui.Rect{x + w - pw, y + (fh - bh) / 2, pw, bh}, 'Inactive', 'Active',
			p.active)
		{
			app.save_player(p.id, !p.active)
		}
		y += fh + 8
	}
	y += 14
	ui.text(x, y, 'Add a player', gui.TextStyle{
		size:  14
		color: t.muted
	})
	y += 22
	aw := ui.button_width('Add')
	fw := if w > 480 { f32(480) } else { w }
	ev := ui.field('new-player', gui.Rect{x, y, fw - aw - 8, fh}, mut app.team.new_player,
		.text, 'Player name')
	if ui.button(gui.Rect{x + fw - aw, y, aw, fh}, 'Add', .primary) || ev == .submitted {
		app.add_player()
	}
	return y + fh
}

fn (mut app App) save_team_settings(active bool) {
	mut team := app.store.team_get(app.route.team_id) or { return }
	name := core.check_text('Team Name', app.team.name.text, 25) or {
		app.show_error(err.msg())
		app.team.name = gui.input(team.name)
		return
	}
	year := core.check_text('Team Year', app.team.year.text, 25) or {
		app.show_error(err.msg())
		app.team.year = gui.input(team.year)
		return
	}
	if team.name == name && team.year == year && team.active == active {
		return
	}
	team.name = name
	team.year = year
	team.active = active
	app.store.team_save(team) or {
		app.show_error(err.msg())
		app.load_team()
		return
	}
	app.changed()
}

fn (mut app App) save_player(id int, active bool) {
	mut team := app.store.team_get(app.route.team_id) or { return }
	name_in := (app.team.names[id] or { gui.input('') }).text
	num_in := (app.team.numbers[id] or { gui.input('') }).text.trim_space()
	name := core.check_text('Player Name', name_in, 25) or {
		app.show_error(err.msg())
		app.load_team()
		return
	}
	mut number := 0
	if num_in != '' {
		number = num_in.int()
		if number <= 0 || !num_in.bytes().all(it.is_digit()) {
			app.show_error('"Player Number" must be a whole number above 0.')
			app.load_team()
			return
		}
	}
	for i, p in team.players {
		if p.id != id && core.equals(p.name, name) {
			app.show_error('The player name "${p.name}" has already been chosen.')
			app.load_team()
			return
		}
		if p.id == id {
			if p.name == name && p.number == number && p.active == active {
				return
			}
			team.players[i].name = name
			team.players[i].number = number
			team.players[i].active = active
		}
	}
	app.store.team_save(team) or {
		app.show_error(err.msg())
		return
	}
	app.changed()
}

fn (mut app App) add_player() {
	p := app.store.player_create(app.route.team_id, app.team.new_player.text) or {
		app.show_error(err.msg())
		return
	}
	app.team.new_player = gui.Input{}
	app.team.names[p.id] = gui.input(p.name)
	app.team.numbers[p.id] = gui.input('')
	app.ui.focus_field('new-player')
	app.changed()
}
