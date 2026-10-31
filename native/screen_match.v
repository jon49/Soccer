module main

import gg
import math
import core
import gui

// The match play view (match/_play-match-view.ts and match-select.js): the
// field with a card per position, the bench, and the scoreboard bar. Tap a
// player to select them, then tap where they go: a field position queues a
// bench player for it (or moves a field player there), a queued player's
// own spot swaps just them in, and the Bench and Not playing boxes take the
// selected player off. With the Goal stat on, tapping our score selects it
// and the next player tapped gets the goal. Holding a score (or right
// clicking it) takes a point back.

enum SelKind {
	none_
	player
	score
}

struct Selection {
	kind      SelKind
	player_id int
	status    core.StatusKind
	// The score was held: the next player tapped loses a goal.
	unscore bool
}

struct MatchView {
mut:
	sel    Selection
	points int = 2 // basketball mode: points for the next goal
	// The not playing list is open.
	show_not_playing bool
}

fn (mut v MatchView) clear() {
	v.sel = Selection{}
}

// Hit is what a tap landed on.
struct Hit {
	player_id int
	status    core.StatusKind
	position  int = -1
	target    string // 'bench', 'notPlaying' or 'noScorer'
	score     bool
}

const hold_ms = 500

// ---- drawing ----

fn (mut app App) draw_match(w f32, h f32) {
	mut ui := app.ui
	t := ui.theme
	m := app.store.match_get(app.route.team_id, app.route.game_id) or {
		app.show_error(err.msg())
		app.back()
		return
	}
	now := now_ms()
	if m.state.is_in_play() || m.state.is_paused() {
		app.tick()
	}
	bar_h := app.draw_match_bar(m, w, now)
	body := gui.Rect{0, bar_h, w, h - bar_h}
	landscape := w >= 640 && w >= h * 0.9
	bench_hidden := app.store.settings.bench_hidden
	selecting := app.match.sel.kind != .none_
	if landscape {
		bench_w := if bench_hidden && !selecting { f32(0) } else { f32(230) }
		field_r := gui.Rect{0, body.y, w - bench_w, body.h}
		off := ui.begin_scroll('match', field_r)
		fh := app.draw_field(m, gui.Rect{pad / 2, field_r.y + 8 - off, field_r.w - pad, 0},
			now)
		ui.end_scroll('match', field_r, fh + 16)
		if bench_w > 0 {
			bench_r := gui.Rect{w - bench_w, body.y, bench_w, body.h}
			ui.rect(bench_r, t.bg)
			ty := app.draw_targets(m, gui.Rect{bench_r.x + 8, bench_r.y + 8, bench_w - 16, 0})
			if !bench_hidden {
				list_r := gui.Rect{bench_r.x, ty, bench_w, bench_r.bottom() - ty}
				boff := ui.begin_scroll('bench', list_r)
				bh := app.draw_bench(m, gui.Rect{list_r.x + 8, list_r.y - boff, bench_w - 16, 0},
					1, now)
				ui.end_scroll('bench', list_r, bh + 8)
			}
		}
	} else {
		off := ui.begin_scroll('match', body)
		mut y := body.y + 8 - off
		y += app.draw_field(m, gui.Rect{pad / 2, y, w - pad, 0}, now) + 12
		if !bench_hidden {
			y += app.draw_bench(m, gui.Rect{pad / 2, y, w - pad, 0}, 2, now)
		}
		// Room so the floating targets never cover the last row.
		extra := if selecting { f32(140) } else { f32(16) }
		ui.end_scroll('match', body, y - (body.y - off) + extra)
		if selecting {
			app.draw_floating_targets(m, w, h)
		}
	}
	// A tap that landed on nothing clears the selection.
	if selecting && ui.clicked(gui.Rect{0, 0, w, h}) {
		app.match.clear()
	}
}

fn (mut app App) draw_match_bar(m core.Match, w f32, now i64) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := f32(48)
	gap := f32(8)
	y := f32(6)
	// Right group: swap, bench, end. On a narrow window it gets its own row.
	queued := m.on_deck().filter(it.status.target >= 0).len
	benched := m.on_deck().filter(it.status.target < 0).len + m.benched().len
	swap_label := 'Swap ${queued}'
	bench_label := 'Bench (${benched})'
	end_label := if m.state.is_ended() { 'Restart' } else { 'End' }
	mut right_w := ui.button_width(bench_label) + gap + ui.button_width(end_label)
	if queued > 0 {
		right_w += ui.button_width(swap_label) + gap
	}
	left_min := f32(40 + 64 + 20 + 64 + 120) + 4 * gap
	two_rows := left_min + right_w + gap + pad > w
	row1_right := if two_rows { w - pad / 2 } else { w - pad / 2 - right_w - gap }

	mut x := pad / 2
	if ui.button(gui.Rect{x, y, 40, bh}, '‹', .ghost) {
		app.back()
	}
	x += 40 + gap
	// Our score.
	us := gui.Rect{x, y, 64, bh}
	app.draw_score(us, 'Us', m.state.points, true, m)
	x += 64 + 4
	ui.text(x + 6, y + bh / 2, '–', gui.TextStyle{
		valign: .middle
		bold:   true
	})
	x += 16 + 4
	them := gui.Rect{x, y, 64, bh}
	app.draw_score(them, 'Them', m.state.opponent_points, false, m)
	x += 64 + gap

	// The clock: tap to start or pause.
	clock := gui.Rect{x, y, row1_right - x, bh}
	mut shown := i64(0)
	mut flash := false
	if m.state.is_in_play() {
		shown = m.state.current_total(now)
	} else if m.state.is_ended() {
		shown = m.state.total()
	} else {
		// Paused: how long the break has been.
		last_end := m.state.last_end()
		shown = if last_end > 0 { now - last_end } else { 0 }
		flash = (now / 1000) % 2 == 0
	}
	time_text := core.format_timer(shown)
	if flash {
		tw := ui.text_width(time_text, gui.TextStyle{ size: 24, bold: true }) + 12
		ui.rounded(gui.Rect{clock.x + (clock.w - tw) / 2, y + 2, tw, 30}, 5, t.flash)
	}
	if !m.state.is_ended() && ui.hovered(clock) {
		ui.rounded(clock, 6, t.surface_alt)
	}
	ui.text(clock.x + clock.w / 2, y + 17, time_text, gui.TextStyle{
		size:   24
		bold:   true
		align:  .center
		valign: .middle
		color:  if flash && !t.dark { gui.hex(0x0f171f) } else { gui.transparent }
	})
	if !m.state.is_ended() {
		hint := if m.state.is_in_play() { 'tap to pause' } else { 'tap to start' }
		ui.text(clock.x + clock.w / 2, y + bh - 8, hint, gui.TextStyle{
			size:   11
			color:  t.muted
			align:  .center
			valign: .middle
		})
		ui.pointer_cursor(clock)
		if ui.tap(clock, 'clock') {
			app.match_clock(if m.state.is_in_play() {
				core.ClockChange.pause
			} else {
				core.ClockChange.start
			})
		}
	}

	// Right group.
	ry := if two_rows { y + bh + gap } else { y }
	mut rx := w - pad / 2
	ew := ui.button_width(end_label)
	rx -= ew
	if ui.button(gui.Rect{rx, ry, ew, bh}, end_label, .outline) {
		if m.state.is_ended() {
			app.ask(Confirm{
				message: 'Are you sure you would like to restart the game?'
				yes:     'Restart'
				action:  .restart_game
			})
		} else {
			app.ask(Confirm{
				message: 'Are you sure you would like to end the game?'
				yes:     'End game'
				action:  .end_game
			})
		}
	}
	bw := ui.button_width(bench_label)
	rx -= bw + gap
	br := gui.Rect{rx, ry, bw, bh}
	if !app.store.settings.bench_hidden {
		ui.rounded(br, 6, gui.mix(t.bg, t.primary, 0.15))
	}
	if ui.button(br, bench_label, .outline) {
		mut st := app.store.settings
		st.bench_hidden = !st.bench_hidden
		app.store.set_settings(st) or {}
	}
	if queued > 0 {
		sw := ui.button_width(swap_label)
		rx -= sw + gap
		sr := gui.Rect{rx, ry, sw, bh}
		ui.rounded(sr, 6, t.on)
		ui.text(sr.x + sw / 2, sr.y + bh / 2, swap_label, gui.TextStyle{
			color:  t.on_text
			bold:   true
			align:  .center
			valign: .middle
		})
		ui.pointer_cursor(sr)
		if ui.tap(sr, 'swap') {
			app.match_swap(0)
		}
	}
	total_h := if two_rows { y + 2 * bh + gap + 6 } else { y + bh + 6 }
	ui.hline(0, total_h - 1, w, t.border)
	return total_h
}

fn (mut app App) draw_score(r gui.Rect, label string, value int, ours bool, m core.Match) {
	mut ui := app.ui
	t := ui.theme
	pressing := ui.holding(r)
	rr := if pressing { r.inset(3, 3) } else { r }
	if ours {
		ui.rounded(rr, 6, if ui.hovered(r) { t.primary_hover } else { t.primary })
	} else {
		ui.rounded(rr, 6, if ui.hovered(r) { t.surface_alt } else { t.bg })
		ui.rounded_border(rr, 6, t.border)
	}
	fg := if ours { t.on_primary } else { t.text }
	ui.text(r.x + r.w / 2, r.y + 13, label.to_upper(), gui.TextStyle{
		size:   10
		bold:   true
		color:  fg
		align:  .center
		valign: .middle
	})
	ui.text(r.x + r.w / 2, r.y + 32, value.str(), gui.TextStyle{
		size:   20
		bold:   true
		color:  fg
		align:  .center
		valign: .middle
	})
	sel := app.match.sel
	if ours && sel.kind == .score {
		ring := r.inset(-4, -4)
		ui.outline(ring, 3, if sel.unscore { t.off } else { t.primary })
	}
	ui.pointer_cursor(r)
	if ui.held(r, hold_ms) || ui.right_clicked(r) {
		app.take_back(ours, m)
		return
	}
	if ui.tap(r, if ours { 'score-ours' } else { 'score-theirs' }) {
		if !ours {
			app.match_opponent(1)
		} else if m.credit_scorer() {
			app.match_tap(Hit{
				score: true
			}, m)
		} else {
			app.match.clear()
			app.match_score(0, 1)
		}
	}
}

// take_back: holding a score takes a point back; with the Goal stat on,
// from the next player tapped.
fn (mut app App) take_back(ours bool, m core.Match) {
	if !ours {
		app.match_opponent(-1)
	} else if m.credit_scorer() {
		app.match.sel = Selection{
			kind:    .score
			unscore: true
		}
	} else {
		app.match_unscore(0, 1)
	}
}

// draw_field draws the pitch with a card per position and returns its height.
fn (mut app App) draw_field(m core.Match, area gui.Rect, now i64) f32 {
	mut ui := app.ui
	t := ui.theme
	lh := ui.line_height(0)
	cell_w := f32(112)
	gap := f32(8)
	inner_x := area.x + 8
	inner_w := area.w - 16
	per_line := int(math.max(1, math.floor((inner_w + gap) / (cell_w + gap))))
	card_h := 8 + lh + lh * 0.85 + 6 + 8
	sub_h := f32(28)
	// Measure first, to draw the pitch behind the cards.
	mut rows_h := []f32{}
	mut index := 0
	for row in m.positions.positions {
		mut lines := (row.len + per_line - 1) / per_line
		if lines < 1 {
			lines = 1
		}
		mut row_h := f32(0)
		for line in 0 .. lines {
			mut line_h := card_h
			for j in line * per_line .. math.min(row.len, (line + 1) * per_line) {
				pos := index + j
				if _ := m.at_position(pos) {
					if _ := m.queued_for(pos) {
						line_h = card_h + sub_h
					}
				}
			}
			row_h += line_h + gap
		}
		rows_h << row_h
		index += row.len
	}
	mut content_h := f32(20 + 12)
	for rh in rows_h {
		content_h += rh
	}
	if m.positions.positions.len == 0 {
		content_h = 120
	}
	field := gui.Rect{area.x, area.y, area.w, content_h}
	draw_pitch(ui, field)
	if m.positions.positions.len == 0 {
		ui.text(field.x + field.w / 2, field.y + field.h / 2, 'No positions yet. Set up the formation first.',
			gui.TextStyle{
				align:  .center
				valign: .middle
				color:  t.muted
			})
		r := gui.Rect{field.x, field.y, field.w, field.h}
		if ui.tap(r, 'formation') {
			app.go(Route{
				screen:  .formation
				team_id: m.team_id
			})
		}
		return content_h
	}

	fair := m.fair_share()
	stale_limit := core.stale_after_ms(m.team.stale_after_minutes)
	scale := f64(stale_limit or { i64(core.default_stale_after_minutes) * 60_000 })
	game_total := m.state.current_total(now)
	mut y := field.y + 20
	index = 0
	for ri, row in m.positions.positions {
		_ = ri
		mut start := 0
		for start < row.len {
			end := math.min(row.len, start + per_line)
			n := end - start
			total := f32(n) * cell_w + f32(n - 1) * gap
			mut cx := inner_x + (inner_w - total) / 2
			mut line_h := card_h
			for j in start .. end {
				pos := index + j
				h := app.draw_position(m, pos, row[j], gui.Rect{cx, y, cell_w, card_h}, sub_h,
					fair, scale, stale_limit, game_total, now)
				if h > line_h {
					line_h = h
				}
				cx += cell_w + gap
			}
			y += line_h + gap
			start = end
		}
		index += row.len
	}
	return content_h
}

fn draw_pitch(ui &gui.Ui, r gui.Rect) {
	t := ui.theme
	ui.rounded(r, 4, t.pitch)
	line := t.pitch_line
	ui.ctx.draw_rounded_rect_empty(r.x, r.y, r.w, r.h, 4, line)
	ui.ctx.draw_rounded_rect_empty(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 4, line)
	mid := r.y + r.h / 2
	ui.rect(gui.Rect{r.x, mid - 1, r.w, 2}, line)
	radius := f32(46)
	if r.h > radius * 2.5 {
		ui.circle_border(r.x + r.w / 2, mid, radius, line)
		ui.circle_border(r.x + r.w / 2, mid, radius + 1, line)
	}
	box_h := f32(48)
	bx := r.x + r.w / 4
	bw := r.w / 2
	ui.ctx.draw_rect_empty(bx, r.y, bw, box_h, line)
	ui.ctx.draw_rect_empty(bx + 1, r.y, bw - 2, box_h - 1, line)
	ui.ctx.draw_rect_empty(bx, r.bottom() - box_h, bw, box_h, line)
	ui.ctx.draw_rect_empty(bx + 1, r.bottom() - box_h + 1, bw - 2, box_h - 1, line)
}

// shade_colors is the card background for a player `ahead` ms past their
// fair share, and text that reads on it (game-timer.js's applyShade).
fn shade_colors(t gui.Theme, ahead f64, scale f64) (gg.Color, gg.Color) {
	mut alpha := ahead / scale
	alpha = if alpha < 0 {
		0
	} else if alpha > 1 {
		1
	} else {
		alpha
	}
	bg := gui.mix(t.bg, t.shade, f32(alpha))
	if alpha == 0 {
		return bg, t.text
	}
	dark := gui.hex(0x000000)
	light := gui.hex(0xffffff)
	text := if contrast(bg, dark) >= contrast(bg, light) { dark } else { light }
	return bg, text
}

fn luminance(c gg.Color) f64 {
	mut sum := 0.0
	for i, v in [f64(c.r), f64(c.g), f64(c.b)] {
		x := v / 255
		lin := if x <= 0.04045 { x / 12.92 } else { math.pow((x + 0.055) / 1.055, 2.4) }
		sum += lin * [0.2126, 0.7152, 0.0722][i]
	}
	return sum
}

fn contrast(a gg.Color, b gg.Color) f64 {
	la := luminance(a)
	lb := luminance(b)
	return if la > lb { (la + 0.05) / (lb + 0.05) } else { (lb + 0.05) / (la + 0.05) }
}

// draw_position draws one position's card and handles taps on it. Returns
// the card's height.
fn (mut app App) draw_position(m core.Match, pos int, name string, r gui.Rect, sub_h f32, fair f64, scale f64, stale_limit ?i64, game_total i64, now i64) f32 {
	mut ui := app.ui
	t := ui.theme
	lh := ui.line_height(0)
	sel := app.match.sel
	selecting := sel.kind != .none_
	player := m.at_position(pos)
	queued := m.queued_for(pos)
	mut h := r.h
	if _ := player {
		if _ := queued {
			h += sub_h
		}
	}
	card := gui.Rect{r.x, r.y, r.w, h}
	mut sub_r := gui.Rect{}
	if p := player {
		// The player, shaded by how far past their fair share they are.
		total := p.current_total(now)
		ahead := f64(total) - f64(game_total) * fair
		bg, fg := shade_colors(t, ahead, scale)
		main_r := gui.Rect{r.x, r.y, r.w, r.h}
		ui.rounded(card, 4, t.bg)
		ui.rounded(main_r, 4, bg)
		name_style := gui.TextStyle{
			bold:  true
			color: fg
			align: .center
		}
		ui.text(r.x + r.w / 2, r.y + 6, ui.fit(m.name(p.player_id), r.w - 10, name_style),
			name_style)
		ui.text(r.x + r.w / 2, r.y + 6 + lh, core.format_timer(total), gui.TextStyle{
			size:  13
			color: fg
			align: .center
		})
		// The stint bar: fresh, warm at half the limit, then stale.
		mut bar := t.border
		if limit := stale_limit {
			if m.state.is_in_play() && p.last_start() > 0 {
				stint := now - p.last_start()
				bar = if stint >= limit {
					t.stale
				} else if stint >= limit / 2 {
					t.warm
				} else {
					t.fresh
				}
			}
		}
		ui.rect(gui.Rect{r.x + 1, r.bottom() - 8, r.w - 2, 8}, bar)
		if q := queued {
			sub_r = gui.Rect{r.x, r.bottom(), r.w, sub_h}
			ui.rect(sub_r.inset(1, 0), gui.mix(t.bg, t.on, 0.18))
			label := '↔ ${m.name(q.player_id)} next'
			st := gui.TextStyle{
				size:   12
				align:  .center
				valign: .middle
			}
			ui.text(sub_r.x + sub_r.w / 2, sub_r.y + sub_h / 2, ui.fit(label, r.w - 8, st), st)
			app.selection_ring(sub_r, q.player_id, .on_deck)
		}
		app.selection_ring(main_r, p.player_id, .in_play)
		if selecting && !app.is_selected(p.player_id, .in_play) && !app.queued_selected(q_id(queued)) {
			ui.dashed_border(card, t.primary)
		} else {
			ui.rounded_border(card, 4, t.border)
		}
		ui.pointer_cursor(card)
		if q := queued {
			if ui.tap(sub_r, 'queued-${pos}') {
				app.match_tap(Hit{
					player_id: q.player_id
					status:    .on_deck
					position:  pos
				}, m)
				return h
			}
		}
		if ui.tap(main_r, 'position-${pos}') {
			app.match_tap(Hit{
				player_id: p.player_id
				status:    .in_play
				position:  pos
			}, m)
		}
		return h
	}
	if q := queued {
		// Queued for an empty position.
		ui.rounded(card, 4, t.bg)
		ui.text(r.x + r.w / 2, r.y + 8, ui.fit(name, r.w - 8, gui.TextStyle{ size: 13 }),
			gui.TextStyle{
				size:  13
				color: t.muted
				align: .center
			})
		sub_r = gui.Rect{r.x, r.y + 8 + lh, r.w, r.h - 8 - lh}
		ui.rect(sub_r.inset(1, 1), gui.mix(t.bg, t.on, 0.18))
		label := '${m.name(q.player_id)} queued'
		st := gui.TextStyle{
			size:   13
			align:  .center
			valign: .middle
		}
		ui.text(sub_r.x + sub_r.w / 2, sub_r.y + sub_r.h / 2, ui.fit(label, r.w - 8, st), st)
		ui.rounded_border(card, 4, t.on)
		app.selection_ring(sub_r, q.player_id, .on_deck)
		ui.pointer_cursor(card)
		// For the keyboard, the position is the strip above the queued player.
		to_pos := ui.focusable(gui.Rect{r.x, r.y, r.w, sub_r.y - r.y}, 'position-${pos}')
		if ui.tap(sub_r, 'queued-${pos}') {
			app.match_tap(Hit{
				player_id: q.player_id
				status:    .on_deck
				position:  pos
			}, m)
			return h
		}
		if ui.clicked(card) || to_pos {
			app.match_tap(Hit{
				position: pos
			}, m)
		}
		return h
	}
	// An empty position.
	ui.rounded(card, 4, gui.mix(t.pitch, t.bg, 0.5))
	ui.dashed_border(card, if selecting { t.primary } else { t.border })
	st := gui.TextStyle{
		size:   13
		color:  t.muted
		align:  .center
		valign: .middle
	}
	ui.text(r.x + r.w / 2, r.y + r.h / 2, ui.fit(name, r.w - 8, st), st)
	ui.pointer_cursor(card)
	if ui.tap(card, 'position-${pos}') {
		app.match_tap(Hit{
			position: pos
		}, m)
	}
	return h
}

fn q_id(q ?core.PlayerGame) int {
	p := q or { return 0 }
	return p.player_id
}

fn (app &App) is_selected(player_id int, status core.StatusKind) bool {
	s := app.match.sel
	return s.kind == .player && s.player_id == player_id && s.status == status
}

fn (app &App) queued_selected(player_id int) bool {
	return player_id > 0 && app.is_selected(player_id, .on_deck)
}

fn (mut app App) selection_ring(r gui.Rect, player_id int, status core.StatusKind) {
	if app.is_selected(player_id, status) {
		app.ui.outline(r, 3, app.ui.theme.primary)
	}
}

// draw_targets draws the boxes a selected player (or score) can go to, and
// returns the y below them.
fn (mut app App) draw_targets(m core.Match, area gui.Rect) f32 {
	sel := app.match.sel
	if sel.kind == .none_ {
		return area.y
	}
	mut ui := app.ui
	t := ui.theme
	gap := f32(8)
	th := f32(48)
	mut y := area.y
	if sel.kind == .score {
		if sel.unscore {
			hint := 'Take back a goal: tap who scored it.'
			lines := ui.wrap(hint, area.w - 20, gui.TextStyle{ bold: true })
			hh := lines.len * ui.line_height(0) + 16
			hr := gui.Rect{area.x, y, area.w, hh}
			ui.rounded(hr, 4, t.bg)
			ui.rounded_border(hr, 4, t.off)
			ui.outline(hr, 2, t.off)
			for i, l in lines {
				ui.text(area.x + area.w / 2, y + 8 + i * ui.line_height(0), l, gui.TextStyle{
					bold:  true
					align: .center
				})
			}
			y += hh + gap
		}
		if app.drop_target(gui.Rect{area.x, y, area.w, th}, 'No scorer') {
			app.match_tap(Hit{
				target: 'noScorer'
			}, m)
		}
		y += th + gap
		if m.team.basketball_mode {
			choice := ui.segmented(gui.Rect{area.x, y, area.w, ui.button_height()}, [
				'1',
				'2',
				'3',
			], app.match.points - 1)
			if choice >= 0 {
				app.match.points = choice + 1
			}
			y += ui.button_height() + gap
		}
		return y
	}
	benched := sel.status in [.out, .none_]
	cols := if benched { 1 } else { 2 }
	cw := (area.w - f32(cols - 1) * gap) / f32(cols)
	mut x := area.x
	if !benched {
		if app.drop_target(gui.Rect{x, y, cw, th}, 'Bench') {
			app.match_tap(Hit{
				target: 'bench'
			}, m)
		}
		x += cw + gap
	}
	if app.drop_target(gui.Rect{x, y, cw, th}, 'Not playing') {
		app.match_tap(Hit{
			target: 'notPlaying'
		}, m)
	}
	return y + th + gap
}

// In portrait the targets float over the bottom of the screen.
fn (mut app App) draw_floating_targets(m core.Match, w f32, h f32) {
	mut ui := app.ui
	t := ui.theme
	bw := w - 2 * pad
	// Measure by drawing into an empty clip first would be costly; the
	// targets are at most ~170 high.
	est := if app.match.sel.kind == .score {
		f32(48 + 8) + if app.match.sel.unscore { f32(56) } else { f32(0) } + if m.team.basketball_mode {
			ui.button_height() + 8
		} else {
			f32(0)
		}
	} else {
		f32(56)
	}
	top := h - pad - est
	ui.rounded(gui.Rect{pad - 4, top - 4, bw + 8, est + 4}, 8, gui.hexa(0x000000, 50))
	ui.rounded(gui.Rect{pad - 2, top - 2, bw + 4, est}, 8, t.bg)
	app.draw_targets(m, gui.Rect{pad, top, bw, 0})
}

fn (mut app App) drop_target(r gui.Rect, label string) bool {
	mut ui := app.ui
	t := ui.theme
	ui.rounded(r, 4, gui.mix(t.bg, t.primary, if ui.hovered(r) { f32(0.25) } else { f32(0.12) }))
	ui.dashed_border(r, t.primary)
	ui.outline(r.inset(1, 1), 1, gui.hexa(0x000000, 0))
	ui.text(r.x + r.w / 2, r.y + r.h / 2, label, gui.TextStyle{
		bold:   true
		align:  .center
		valign: .middle
	})
	ui.pointer_cursor(r)
	return ui.tap(r, label)
}

// draw_bench draws the bench (queued players without a position, players
// out, and those not playing) in `cols` columns. Returns its height.
fn (mut app App) draw_bench(m core.Match, area gui.Rect, cols int, now i64) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	lh := ui.line_height(0)
	gap := f32(6)
	mut y := area.y
	waiting := m.on_deck().filter(it.status.target < 0)
	out := m.benched()
	count := waiting.len + out.len
	ui.text(area.x, y + bh / 2, 'Bench (${count})', gui.TextStyle{
		bold:   true
		valign: .middle
	})
	if m.in_play().len > 0 || m.on_deck().any(it.status.target >= 0) {
		aw := ui.button_width('All Out')
		if ui.button(gui.Rect{area.right() - aw, y, aw, bh}, 'All Out', .outline) {
			app.ask(Confirm{
				message: 'Are you sure you want to take all players out?'
				yes:     'All Out'
				action:  .all_out
			})
		}
	}
	y += bh + 8
	item_h := f32(48)
	cw := (area.w - f32(cols - 1) * gap) / f32(cols)
	scoring := app.match.sel.kind == .score
	mut i := 0
	for p in waiting {
		r := gui.Rect{area.x + f32(i % cols) * (cw + gap), y + f32(i / cols) * (item_h + gap), cw, item_h}
		ui.rounded(r, 4, t.bg)
		if scoring {
			ui.dashed_border(r, t.primary)
		} else {
			ui.rounded_border(r, 4, t.border)
		}
		tag_style := gui.TextStyle{
			size:   12
			valign: .middle
		}
		tag_w := ui.text_width('on deck', tag_style) + 12
		ui.rounded(gui.Rect{r.right() - tag_w - 8, r.y + (item_h - 20) / 2, tag_w, 20}, 8,
			gui.mix(t.bg, t.on, 0.18))
		ui.text(r.right() - tag_w - 2, r.y + item_h / 2, 'on deck', tag_style)
		label := player_label(m, p.player_id)
		ui.text(r.x + 10, r.y + item_h / 2, ui.fit(label, r.w - tag_w - 26, gui.TextStyle{
			bold: true
		}), gui.TextStyle{
			bold:   true
			valign: .middle
		})
		app.selection_ring(r, p.player_id, .on_deck)
		ui.pointer_cursor(r)
		if ui.tap(r, 'player-${p.player_id}') {
			app.match_tap(Hit{
				player_id: p.player_id
				status:    .on_deck
			}, m)
		}
		i++
	}
	fair := m.fair_share()
	stale_limit := core.stale_after_ms(m.team.stale_after_minutes)
	scale := f64(stale_limit or { i64(core.default_stale_after_minutes) * 60_000 })
	game_total := m.state.current_total(now)
	for p in out {
		r := gui.Rect{area.x + f32(i % cols) * (cw + gap), y + f32(i / cols) * (item_h + gap), cw, item_h}
		total := p.total()
		ahead := f64(total) - f64(game_total) * fair
		bg, fg := shade_colors(t, ahead, scale)
		ui.rounded(r, 4, bg)
		if scoring {
			ui.dashed_border(r, t.primary)
		} else {
			ui.rounded_border(r, 4, t.border)
		}
		time_style := gui.TextStyle{
			size:  13
			color: fg
			align: .right
		}
		ui.text(r.right() - 10, r.y + 6, core.format_timer(total), time_style)
		mut tw := ui.text_width(core.format_timer(total), time_style)
		if game_total >= 1000 {
			behind := ahead < 0
			delta := '${if behind { '−' } else { '+' }}${core.format_timer(i64(math.abs(ahead)))} vs fair'
			ds := gui.TextStyle{
				size:  11
				bold:  behind
				color: fg
				align: .right
			}
			ui.text(r.right() - 10, r.y + 8 + lh * 0.8, delta, ds)
			dw := ui.text_width(delta, ds)
			if dw > tw {
				tw = dw
			}
		}
		label := player_label(m, p.player_id)
		ui.text(r.x + 10, r.y + item_h / 2, ui.fit(label, r.w - tw - 30, gui.TextStyle{
			bold: true
		}), gui.TextStyle{
			bold:   true
			color:  fg
			valign: .middle
		})
		app.selection_ring(r, p.player_id, p.status.kind)
		ui.pointer_cursor(r)
		if ui.tap(r, 'player-${p.player_id}') {
			app.match_tap(Hit{
				player_id: p.player_id
				status:    p.status.kind
			}, m)
		}
		i++
	}
	rows := (i + cols - 1) / cols
	y += f32(rows) * (item_h + gap)

	// Not playing: tapping one puts them back on the bench.
	not_playing := m.not_playing()
	if not_playing.len > 0 {
		y += 6
		arrow := if app.match.show_not_playing { '▾' } else { '▸' }
		if ui.link(area.x, y, '${arrow} Not playing (${not_playing.len})', gui.TextStyle{}) {
			app.match.show_not_playing = !app.match.show_not_playing
		}
		y += lh + 8
		if app.match.show_not_playing {
			for j, p in not_playing {
				r := gui.Rect{area.x + f32(j % cols) * (cw + gap), y + f32(j / cols) * (item_h + gap), cw, item_h}
				ui.rounded(r, 4, t.surface)
				ui.rounded_border(r, 4, t.border)
				ui.text(r.right() - 10, r.y + item_h / 2, core.format_timer(p.total()),
					gui.TextStyle{
						size:   13
						color:  t.muted
						align:  .right
						valign: .middle
					})
				ui.text(r.x + 10, r.y + item_h / 2, ui.fit(player_label(m, p.player_id), r.w - 80,
					gui.TextStyle{}), gui.TextStyle{
					valign: .middle
					color:  t.muted
				})
				ui.pointer_cursor(r)
				if ui.tap(r, 'back-in-${p.player_id}') {
					app.match.clear()
					app.match_back_in(p.player_id)
				}
			}
			y += f32((not_playing.len + cols - 1) / cols) * (item_h + gap)
		}
	}
	return y - area.y
}

fn player_label(m core.Match, player_id int) string {
	n := m.number(player_id)
	return if n > 0 { '${m.name(player_id)} ${n}' } else { m.name(player_id) }
}

// ---- taps ----

fn (mut app App) match_tap(hit Hit, m core.Match) {
	sel := app.match.sel
	if sel.kind == .none_ {
		if hit.score {
			app.match.sel = Selection{
				kind: .score
			}
		} else if hit.player_id > 0 {
			app.select_player(hit)
		}
		return
	}
	if sel.kind == .score {
		if hit.score {
			app.match.clear()
			return
		}
		points := if m.team.basketball_mode { app.match.points } else { 1 }
		player := if hit.target == 'noScorer' {
			0
		} else if hit.player_id > 0 {
			hit.player_id
		} else {
			-1
		}
		app.match.clear()
		if player >= 0 {
			if sel.unscore {
				app.match_unscore(player, points)
			} else {
				app.match_score(player, points)
			}
		}
		return
	}
	pid := sel.player_id
	sel_cell := match sel.status {
		.in_play {
			p := m.players.filter(it.player_id == pid)
			if p.len > 0 { p[0].status.position } else { -1 }
		}
		.on_deck {
			p := m.players.filter(it.player_id == pid)
			if p.len > 0 { p[0].status.target } else { -1 }
		}
		else {
			-1
		}
	}
	if hit.target != '' {
		app.match.clear()
		if hit.target == 'notPlaying' {
			app.match_off(pid, true)
		} else if sel.status in [.in_play, .on_deck] {
			app.match_off(pid, false)
		}
	} else if hit.player_id == pid && hit.status == sel.status {
		app.match.clear()
	} else if hit.position >= 0 && hit.position == sel_cell && sel.status == .on_deck {
		// A queued player, then their own spot: swap just them in now.
		app.match.clear()
		app.match_swap(pid)
	} else if hit.position >= 0 && hit.position != sel_cell {
		app.match.clear()
		app.match_move(pid, hit.position)
	} else if hit.score {
		app.match.sel = Selection{
			kind: .score
		}
	} else if hit.player_id > 0 {
		app.select_player(hit)
	} else {
		app.match.clear()
	}
}

fn (mut app App) select_player(hit Hit) {
	app.match.sel = Selection{
		kind:      .player
		player_id: hit.player_id
		status:    hit.status
	}
}

// ---- actions ----

fn (mut app App) after_match_change() {
	app.changed()
}

fn (mut app App) match_clock(change core.ClockChange) {
	r := app.route
	app.store.game_clock(r.team_id, r.game_id, change, now_ms()) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
	if change == .end {
		// Keep an already-shared schedule current with the final score.
		// Ending the game still succeeds if this fails (offline at the field).
		team := app.store.team_get(r.team_id) or { return }
		if team.schedule_file_id != '' && app.store.auth.logged_in() {
			app.publish_schedule(team.id, true)
		}
	}
}

fn (mut app App) match_restart() {
	app.store.game_restart(app.route.team_id, app.route.game_id) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_all_out() {
	app.store.all_out(app.route.team_id, app.route.game_id, now_ms()) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_swap(player_id int) {
	app.store.swap(app.route.team_id, app.route.game_id, player_id, now_ms()) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_move(player_id int, position int) {
	app.store.move_to_position(app.route.team_id, app.route.game_id, player_id, position,
		now_ms()) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_off(player_id int, not_playing bool) {
	app.store.player_off(app.route.team_id, app.route.game_id, player_id, not_playing, now_ms()) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_back_in(player_id int) {
	app.store.back_in(app.route.team_id, app.route.game_id, player_id) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_score(player_id int, points int) {
	app.store.score_point(app.route.team_id, app.route.game_id, player_id, points) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_unscore(player_id int, points int) {
	app.store.remove_point(app.route.team_id, app.route.game_id, player_id, points) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}

fn (mut app App) match_opponent(delta int) {
	app.store.game_points_change(app.route.team_id, app.route.game_id, true, delta) or {
		app.show_error(err.msg())
		return
	}
	app.after_match_change()
}
