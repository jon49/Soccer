module main

import core
import gui

// The formation editor and its templates (pages/positions.page.ts).

struct FormationForm {
mut:
	team_id string
	names   [][]gui.Input
	// Templates: how many players.
	players int = 4
}

fn (mut app App) load_formation() {
	tid := app.route.team_id
	p := app.store.positions_get(tid)
	app.formation.team_id = tid
	app.formation.names = p.positions.map(it.map(gui.input(it)))
}

fn (mut app App) load_templates() {
	p := app.store.positions_get(app.route.team_id)
	n := p.flat().len
	app.formation.players = core.template_count(if n > 0 { n } else { 4 })
}

fn (app &App) formation_from_inputs() [][]string {
	return app.formation.names.map(it.map(it.text.trim_space()))
}

fn (mut app App) draw_formation(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	bh := ui.button_height()
	fh := ui.field_height()
	mut y := app.heading(x, y0, team.name)
	uw := ui.button_width('Use a template')
	if ui.button(gui.Rect{x, y - 8, uw, bh}, 'Use a template', .outline) {
		app.go(Route{
			screen:  .templates
			team_id: team.id
		})
	}
	y += bh + 12

	// The preview beside the editor when there's room, else above it.
	side := w >= 720
	pw := if side {
		f32(240)
	} else if w > 320 {
		f32(320)
	} else {
		w
	}
	ph := pw * 1.3
	rows := core.row_sizes(app.formation_from_inputs())
	draw_formation_pitch(ui, gui.Rect{x, y, pw, ph}, rows, true)
	name := core.formation_name(rows)
	caption := if rows.len > 0 { 'Formation: ${name}' } else { 'No positions yet' }
	ui.text(x + pw / 2, y + ph + 8, caption, gui.TextStyle{
		size:  14
		color: t.muted
		align: .center
	})
	mut ex := x
	mut ey := y
	mut ew := w
	if side {
		ex = x + pw + 2 * pad
		ew = w - pw - 2 * pad
	} else {
		ey = y + ph + 40
	}
	ey = app.subheading(ex, ey, 'Grid')
	rw := ui.button_width('+ Row')
	if ui.button(gui.Rect{ex + 44, ey, rw, bh}, '+ Row', .outline) {
		app.resize_formation(-1, true)
		return ey
	}
	ey += bh + 8
	mut commit := false
	for ri in 0 .. app.formation.names.len {
		row_len := app.formation.names[ri].len
		if ui.button(gui.Rect{ex, ey + (fh - bh) / 2, 36, bh}, '−', .outline) {
			app.resize_formation(ri, false)
			return ey
		}
		fw := (ew - 2 * 44 - f32(row_len - 1) * 4) / f32(if row_len > 0 { row_len } else { 1 })
		for ci in 0 .. row_len {
			mut input := app.formation.names[ri][ci]
			ev := ui.field('pos-${ri}-${ci}', gui.Rect{ex + 44 + f32(ci) * (fw + 4), ey, fw, fh}, mut
				input, .text, '')
			app.formation.names[ri][ci] = input
			if ev in [.committed, .submitted] {
				commit = true
			}
		}
		if ui.button(gui.Rect{ex + ew - 36, ey + (fh - bh) / 2, 36, bh}, '+', .outline) {
			app.resize_formation(ri, true)
			return ey
		}
		ey += fh + 8
	}
	if ui.button(gui.Rect{ex + 44, ey, rw, bh}, '+ Row', .outline) {
		app.resize_formation(app.formation.names.len, true)
		return ey
	}
	ey += bh
	if commit {
		app.save_formation(app.formation_from_inputs())
	}
	bottom := y + ph + 30
	return if ey > bottom { ey } else { bottom }
}

fn (mut app App) save_formation(positions [][]string) bool {
	mut p := app.store.positions_get(app.route.team_id)
	if p.positions == positions && app.store.get(core.positions_key(app.route.team_id)) != none {
		return true
	}
	p.positions = positions
	app.store.positions_save(app.route.team_id, p) or {
		app.show_error(err.msg())
		return false
	}
	app.changed()
	return true
}

fn (mut app App) resize_formation(row int, inc bool) {
	app.ui.blur()
	next := core.resize_row(app.formation_from_inputs(), row, inc)
	app.save_formation(next)
	app.load_formation()
}

// draw_formation_pitch shows rows of positions as dots on a small pitch,
// the attacking end at the top. spread: rows use the whole height (the
// preview); otherwise the top is kept clear for the template's name.
fn draw_formation_pitch(ui &gui.Ui, r gui.Rect, rows []int, spread bool) {
	t := ui.theme
	draw_pitch(ui, r)
	total := rows.len
	for i, count in rows {
		y := if spread {
			r.y + r.h * (f32(i) + 0.5) / f32(total)
		} else {
			r.y + r.h * 0.9 * f32(i + 1) / f32(total)
		}
		for j in 0 .. count {
			cx := r.x + r.w * f32(j + 1) / f32(count + 1)
			ui.circle(cx, y, r.w * 0.03 + 2, t.text)
		}
	}
}

// ---- templates ----

fn (mut app App) draw_templates(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	mut y := app.heading(x, y0, 'Formation Templates')
	cw := ui.button_width('Cancel')
	if ui.button(gui.Rect{x, y - 8, cw, bh}, 'Cancel', .outline) {
		app.back()
		return y
	}
	y += bh + 12
	ui.text(x, y, 'Number of players', gui.TextStyle{ bold: true })
	y += 28
	counts := core.template_player_counts
	sel := counts.index(app.formation.players)
	choice := ui.segmented(gui.Rect{x, y, 280, bh}, counts.map(it.str()), sel)
	if choice >= 0 {
		app.formation.players = counts[choice]
	}
	y += bh + 20
	grids := core.formation_templates[app.formation.players] or { [][]int{} }
	cols := columns(w, 4, 200)
	card_w := (w - f32(cols - 1) * pad) / f32(cols)
	card_h := card_w * 1.1
	for i, grid in grids {
		cx := x + f32(i % cols) * (card_w + pad)
		cy := y + f32(i / cols) * (card_h + pad)
		r := gui.Rect{cx, cy, card_w, card_h}
		ui.rounded(r, 8, if ui.hovered(r) { t.surface_alt } else { t.surface })
		ui.rounded_border(r, 8, t.border)
		inner := r.inset(10, 10)
		draw_formation_pitch(ui, inner, grid, false)
		ui.text(inner.x + 6, inner.y + 4, core.formation_name(grid), gui.TextStyle{
			size: 18
			bold: true
		})
		ui.pointer_cursor(r)
		if ui.clicked(r) {
			if app.save_formation(core.template_positions(grid)) {
				app.back()
			}
			return y
		}
	}
	rows := (grids.len + cols - 1) / cols
	return y + f32(rows) * (card_h + pad)
}
