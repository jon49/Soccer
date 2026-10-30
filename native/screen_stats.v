module main

import core
import gui

// Stats (pages/stats/stats.page.ts) and their settings
// (stats/edit/stats-edit.page.ts).

struct StatsForm {
mut:
	tab int // 0: time played, 1: % played, 2: points
	// The table drawn last, rebuilt when the data (or, for a game in
	// progress, the second) changes, not on every frame.
	key   string
	table core.StatsTable
}

const stat_tabs = ['Time played', '% played', 'Points']

fn (mut app App) draw_stats(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	bh := ui.button_height()
	mut y := app.heading(x, y0, '${team.name} — Stats')
	ew := ui.button_width('Edit')
	if ui.button(gui.Rect{x + w - ew, y0 - 4, ew, bh}, 'Edit', .outline) {
		app.go(Route{
			screen:  .stats_edit
			team_id: team.id
		})
	}
	tw := if w > 420 { f32(420) } else { w }
	choice := ui.segmented(gui.Rect{x, y, tw, bh}, stat_tabs, app.stats.tab)
	if choice >= 0 {
		app.stats.tab = choice
	}
	y += bh + 20
	now := now_ms()
	key := '${team.id}/${app.stats.tab}/${app.store.version}/${now / 1000}'
	if key != app.stats.key {
		app.stats.key = key
		app.stats.table = match app.stats.tab {
			0 { app.store.time_played_table(team) }
			1 { app.store.percentage_table(team, now) }
			else { app.store.points_table(team) }
		}
	}
	table := app.stats.table
	y = app.subheading(x, y, table.title)
	if table.rows.len == 0 {
		return app.paragraph(x, y, w, 'No players yet.', true)
	}
	y = app.draw_table(table, x, y, w)
	_ = t
	return y
}

// draw_table draws a stats table whose first column (the player) stays put
// while the rest scrolls sideways.
fn (mut app App) draw_table(table core.StatsTable, x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	lh := ui.line_height(0)
	row_h := lh + 14
	has_sub := table.sub_headers.any(it != '')
	head_h := if has_sub { lh * 2 + 14 } else { row_h }
	bold := gui.TextStyle{
		bold: true
	}
	// Column widths from their contents.
	mut name_w := ui.text_width('Player', bold)
	for r in table.rows {
		nw := ui.text_width(r.name, bold)
		if nw > name_w {
			name_w = nw
		}
	}
	name_w += 24
	if name_w > w * 0.45 {
		name_w = w * 0.45
	}
	mut col_w := []f32{}
	for i, h in table.headers {
		mut cw := ui.text_width(h, bold)
		sub := table.sub_headers[i] or { '' }
		sw := ui.text_width(sub, gui.TextStyle{ size: 12 })
		if sw > cw {
			cw = sw
		}
		for r in table.rows {
			c := r.cells[i] or { '' }
			vw := ui.text_width(c, gui.TextStyle{})
			if vw > cw {
				cw = vw
			}
		}
		col_w << cw + 24
	}
	mut content_w := f32(0)
	for cw in col_w {
		content_w += cw
	}
	body_h := head_h + f32(table.rows.len) * row_h
	total_h := body_h + gui.hscroll_bar_height
	// Stripes span the whole table.
	for i in 0 .. table.rows.len {
		if i % 2 == 1 {
			ui.rect(gui.Rect{x, y0 + head_h + f32(i) * row_h, w, row_h}, t.surface_alt)
		}
	}
	scroll_id := 'stats-${app.route.team_id}-${app.stats.tab}'
	scroll_r := gui.Rect{x + name_w, y0, w - name_w, total_h}
	off := ui.begin_hscroll(scroll_id, scroll_r)
	mut cx := scroll_r.x - off
	for i, cw in col_w {
		for ri, r in table.rows {
			ry := y0 + head_h + f32(ri) * row_h
			ui.text(cx + cw - 12, ry + row_h / 2, r.cells[i] or { '' }, gui.TextStyle{
				align:  .right
				valign: .middle
			})
		}
		cx += cw
	}
	ui.end_hscroll(scroll_id, scroll_r, content_w)
	// The sticky player column.
	for ri, r in table.rows {
		ry := y0 + head_h + f32(ri) * row_h
		ui.text(x + 10, ry + row_h / 2, ui.fit(r.name, name_w - 16, bold), gui.TextStyle{
			bold:   true
			valign: .middle
		})
	}
	ui.rect(gui.Rect{x + name_w - 1, y0, 1, body_h}, t.border)
	// The header row, kept at the top of the screen while the rows under it
	// are scrolled past, until the table's end pushes it off.
	// The clip starts on a whole pixel (gg's scissor rounds down); so does
	// the header, or a sliver of the row beneath shows above it.
	visible_top := f32(int(ui.clip_rect().y))
	head_y := if y0 >= visible_top {
		y0
	} else if visible_top < y0 + body_h - head_h {
		visible_top
	} else {
		y0 + body_h - head_h
	}
	app.draw_table_head(table, gui.Rect{x, head_y, w, head_h}, name_w, col_w, off)
	return y0 + total_h + 8
}

// draw_table_head draws a stats table's header row in r, its columns
// scrolled sideways by `off` like the rows below.
fn (mut app App) draw_table_head(table core.StatsTable, r gui.Rect, name_w f32, col_w []f32, off f32) {
	mut ui := app.ui
	t := ui.theme
	lh := ui.line_height(0)
	ui.rect(r, t.surface)
	cols := gui.Rect{r.x + name_w, r.y, r.w - name_w, r.h}
	ui.push_clip(cols)
	mut cx := cols.x - off
	for i, h in table.headers {
		cw := col_w[i]
		sub := table.sub_headers[i] or { '' }
		if sub != '' {
			ui.text(cx + cw - 12, r.y + 7, h, gui.TextStyle{
				bold:  true
				align: .right
			})
			ui.text(cx + cw - 12, r.y + 7 + lh, ui.fit(sub, cw - 12, gui.TextStyle{ size: 12 }),
				gui.TextStyle{
					size:  12
					color: t.muted
					align: .right
				})
		} else {
			ui.text(cx + cw - 12, r.y + r.h / 2, h, gui.TextStyle{
				bold:   true
				align:  .right
				valign: .middle
			})
		}
		cx += cw
	}
	ui.pop_clip()
	ui.text(r.x + 10, r.y + r.h / 2, 'Player', gui.TextStyle{
		bold:   true
		valign: .middle
	})
	ui.rect(gui.Rect{r.x + name_w - 1, r.y, 1, r.h}, t.border)
	ui.hline(r.x, r.y + r.h - 1, r.w, t.border)
}

// ---- settings ----

struct StatsEditForm {
mut:
	team_id string
	names   map[int]gui.Input
	stale   gui.Input
}

fn (mut app App) load_stats_edit() {
	tid := app.route.team_id
	team := app.store.team_get(tid) or { return }
	app.stats_ed = StatsEditForm{
		team_id: tid
	}
	for s in app.store.stats_get(tid).stats {
		app.stats_ed.names[s.id] = gui.input(s.name)
	}
	minutes := if team.stale_after_minutes >= 0 {
		team.stale_after_minutes
	} else {
		core.default_stale_after_minutes
	}
	app.stats_ed.stale = gui.input(minutes.str())
}

fn (mut app App) draw_stats_edit(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	stats := app.store.stats_get(team.id)
	bh := ui.button_height()
	fh := ui.field_height()
	mut y := app.heading(x, y0, '${team.name} — Stats')
	y = app.subheading(x, y, 'Stats')
	tw := ui.toggle_width('Inactive', 'Active')
	for s in stats.stats {
		mut name := app.stats_ed.names[s.id] or { gui.input(s.name) }
		fw := if w - tw - 8 > 300 { f32(300) } else { w - tw - 8 }
		ev := ui.field('stat-${s.id}', gui.Rect{x, y, fw, fh}, mut name, .text, '')
		app.stats_ed.names[s.id] = name
		if ev in [.committed, .submitted] {
			app.save_stat(s.id, s.active)
		}
		if ui.toggle(gui.Rect{x + fw + 8, y + (fh - bh) / 2, tw, bh}, 'Inactive', 'Active',
			s.active)
		{
			app.save_stat(s.id, !s.active)
		}
		y += fh + 6
		desc := core.stat_description(s.id)
		if desc != '' {
			y = app.paragraph(x, y, w, desc, true)
		}
		y += 8
	}
	y += 12
	y = app.subheading(x, y, 'Scoring')
	mw := ui.toggle_width('Soccer Mode', 'Basketball Mode')
	if ui.toggle(gui.Rect{x, y, mw, bh}, 'Soccer Mode', 'Basketball Mode', team.basketball_mode) {
		mut tm := team
		tm.basketball_mode = !team.basketball_mode
		app.store.team_save(tm) or { app.show_error(err.msg()) }
		app.changed()
	}
	y += bh + 6
	y = app.paragraph(x, y, w, 'Basketball mode lets a goal count for 1, 2 or 3 points.', true)
	y += 12
	y = app.subheading(x, y, 'Substitutions')
	y = app.paragraph(x, y, w, 'Highlight players in a position for this many minutes without a substitution',
		false)
	ev := ui.field('stale-minutes', gui.Rect{x, y, 100, fh}, mut app.stats_ed.stale, .number,
		'')
	if ev in [.committed, .submitted] {
		app.save_stale_minutes()
	}
	y += fh + 6
	ui.text(x, y, 'Set to 0 to turn the highlight off.', gui.TextStyle{
		size:  14
		color: t.muted
	})
	return y + 24
}

fn (mut app App) save_stat(id int, active bool) {
	name_in := (app.stats_ed.names[id] or { gui.input('') }).text
	name := core.check_text('Stat Name', name_in, 25) or {
		app.show_error(err.msg())
		app.load_stats_edit()
		return
	}
	stats := app.store.stats_get(app.route.team_id)
	for s in stats.stats {
		if s.id == id && s.name == name && s.active == active && app.store.get(core.stats_key(app.route.team_id)) != none {
			return
		}
	}
	app.store.stat_save(app.route.team_id, core.Stat{id, name, active}) or {
		app.show_error(err.msg())
		app.load_stats_edit()
		return
	}
	app.changed()
}

fn (mut app App) save_stale_minutes() {
	text := app.stats_ed.stale.text.trim_space()
	if text == '' || !text.bytes().all(it.is_digit()) {
		app.show_error('"Highlight after minutes" must be a whole number.')
		app.load_stats_edit()
		return
	}
	mut team := app.store.team_get(app.route.team_id) or { return }
	if team.stale_after_minutes == text.int() {
		return
	}
	team.stale_after_minutes = text.int()
	app.store.team_save(team) or {
		app.show_error(err.msg())
		return
	}
	app.changed()
}
