module gui

import gg

// ---- horizontal scrolling (wide tables) ----

// begin_hscroll starts a horizontal scroll area and returns its offset.
// Draw the content at `r.x - offset`, then call end_hscroll with its width.
// It scrolls with Shift+wheel, a sideways wheel, touch drags and its bar.
pub fn (mut ui Ui) begin_hscroll(id string, r Rect) f32 {
	mut off := ui.hscrolls[id] or { 0 }
	inside := r.contains(ui.mx, ui.my) || (ui.drag && r.contains(ui.press_x, ui.press_y))
	if ui.scroll_dx != 0 && !ui.blocked && inside {
		off += ui.scroll_dx
		ui.scroll_dx = 0
	}
	if bar := ui.hscroll_bar(id, r) {
		if ui.pressed && !ui.touch && !ui.blocked && bar.track.contains(ui.press_x, ui.press_y)
			&& ui.in_clip(ui.press_x, ui.press_y) {
			ui.pressed = false
			if bar.thumb.contains(ui.press_x, ui.press_y) {
				ui.hbar_drag = id
				ui.hbar_grab = ui.press_x - bar.thumb.x
			} else if ui.press_x < bar.thumb.x {
				off -= r.w * 0.9
			} else {
				off += r.w * 0.9
			}
		}
		if ui.hbar_drag == id {
			if ui.down {
				span := r.w - bar.thumb.w
				if span > 0 {
					off = (ui.mx - ui.hbar_grab - r.x) / span * bar.max
				}
			} else {
				ui.hbar_drag = ''
			}
		}
		if off > bar.max {
			off = bar.max
		}
	}
	if off < 0 {
		off = 0
	}
	ui.hscrolls[id] = off
	ui.push_clip(r)
	return off
}

pub fn (mut ui Ui) set_hscroll(id string, off f32) {
	ui.hscrolls[id] = if off < 0 { 0 } else { off }
	ui.redraw = true
}

pub fn (mut ui Ui) end_hscroll(id string, r Rect, content_w f32) {
	ui.pop_clip()
	ui.content_ws[id] = content_w
	max := if content_w > r.w { content_w - r.w } else { 0 }
	if (ui.hscrolls[id] or { 0 }) > max {
		ui.hscrolls[id] = max
		ui.redraw = true
	}
	if bar := ui.hscroll_bar(id, r) {
		active := ui.hbar_drag == id || ui.hovered(bar.track)
		h := if active { f32(8) } else { f32(5) }
		ui.ctx.draw_rounded_rect_filled(bar.thumb.x, bar.track.bottom() - h - 2, bar.thumb.w,
			h, h / 2, hexa(0x808080, if active { u8(180) } else { u8(110) }))
	}
}

// hscroll_bar_height is the room under a horizontal scroll area for its bar.
pub const hscroll_bar_height = f32(14)

fn (ui &Ui) hscroll_bar(id string, r Rect) ?ScrollBar {
	content_w := ui.content_ws[id] or { return none }
	if content_w <= r.w {
		return none
	}
	max := content_w - r.w
	mut off := ui.hscrolls[id] or { 0 }
	off = if off < 0 {
		0
	} else if off > max {
		max
	} else {
		off
	}
	mut tw := r.w * r.w / content_w
	if tw < 32 {
		tw = 32
	}
	track := Rect{r.x, r.bottom() - hscroll_bar_height, r.w, hscroll_bar_height}
	return ScrollBar{
		track: track
		thumb: Rect{r.x + (r.w - tw) * off / max, track.y, tw, hscroll_bar_height}
		max:   max
	}
}

pub fn (ui &Ui) scroll_offset(id string) f32 {
	return ui.scrolls[id] or { 0 }
}

// ---- toggles and choices ----

// toggle draws a two-sided switch like the web app's Inactive | Active
// buttons and returns true when clicked (the caller flips the value).
pub fn (mut ui Ui) toggle(r Rect, off_label string, on_label string, value bool) bool {
	t := ui.theme
	half := r.w / 2
	left := Rect{r.x, r.y, half, r.h}
	right := Rect{r.x + half, r.y, r.w - half, r.h}
	ui.rounded(r, 6, t.surface)
	active := if value { right } else { left }
	ui.rounded(active, 6, if value { t.on } else { t.off })
	ui.rounded_border(r, 6, t.border)
	for side in [false, true] {
		rr := if side { right } else { left }
		label := if side { on_label } else { off_label }
		selected := side == value
		style := TextStyle{
			color:  if selected { t.on_text } else { t.muted }
			bold:   selected
			align:  .center
			valign: .middle
		}
		ui.text(rr.x + rr.w / 2, rr.y + rr.h / 2, ui.fit(label, rr.w - 8, style), style)
	}
	if ui.hovered(r) {
		ui.rounded(r, 6, hexa(0x808080, 30))
	}
	ui.pointer_cursor(r)
	return ui.clicked(r)
}

// toggle_width is the natural width of a toggle with these labels.
pub fn (ui &Ui) toggle_width(off_label string, on_label string) f32 {
	a := ui.text_width(off_label, TextStyle{ bold: true })
	b := ui.text_width(on_label, TextStyle{ bold: true })
	w := if a > b { a } else { b }
	return 2 * (w + f32(ui.font_size) * 1.4)
}

// segmented draws a row of choices and returns the index clicked, or -1.
pub fn (mut ui Ui) segmented(r Rect, labels []string, selected int) int {
	t := ui.theme
	n := labels.len
	if n == 0 {
		return -1
	}
	w := r.w / n
	mut clicked := -1
	ui.rounded(r, 6, t.surface)
	for i, label in labels {
		cell := Rect{r.x + w * i, r.y, w, r.h}
		on := i == selected
		if on {
			ui.rounded(cell.inset(2, 2), 5, t.primary)
		} else if ui.pressing(cell) {
			ui.rounded(cell.inset(2, 2), 5, t.surface_hi)
		} else if ui.hovered(cell) {
			ui.rounded(cell.inset(2, 2), 5, t.surface_alt)
		}
		style := TextStyle{
			color:  if on { t.on_primary } else { t.text }
			bold:   on
			align:  .center
			valign: .middle
		}
		ui.text(cell.x + w / 2, cell.y + r.h / 2, ui.fit(label, w - 6, style), style)
		ui.pointer_cursor(cell)
		if ui.clicked(cell) {
			clicked = i
		}
	}
	ui.rounded_border(r, 6, t.border)
	return clicked
}

// checkbox draws a box and label; returns true when clicked.
pub fn (mut ui Ui) checkbox(x f32, y f32, label string, value bool) (bool, f32) {
	t := ui.theme
	s := f32(ui.font_size) * 1.3
	lw := ui.text_width(label, TextStyle{})
	h := ui.line_height(0)
	row := Rect{x, y, s + 10 + lw, if h > s { h } else { s }}
	box := Rect{x, y + (row.h - s) / 2, s, s}
	if value {
		ui.rounded(box, 4, t.primary)
		c := t.on_primary
		ui.ctx.draw_line(box.x + s * 0.22, box.y + s * 0.52, box.x + s * 0.42, box.y + s * 0.72,
			c)
		ui.ctx.draw_line(box.x + s * 0.42, box.y + s * 0.72, box.x + s * 0.78, box.y + s * 0.3,
			c)
	} else {
		ui.rounded(box, 4, t.input_bg)
		ui.rounded_border(box, 4, if ui.hovered(row) { t.primary } else { t.border })
	}
	ui.text(x + s + 10, row.y + row.h / 2, label, TextStyle{ valign: .middle })
	ui.pointer_cursor(row)
	return ui.clicked(row), row.h
}

// circle draws a filled circle.
pub fn (ui &Ui) circle(x f32, y f32, radius f32, c gg.Color) {
	ui.ctx.draw_circle_filled(x, y, radius, c)
}

pub fn (ui &Ui) circle_border(x f32, y f32, radius f32, c gg.Color) {
	ui.ctx.draw_circle_empty(x, y, radius, c)
}

pub fn (ui &Ui) line(x1 f32, y1 f32, x2 f32, y2 f32, c gg.Color) {
	ui.ctx.draw_line(x1, y1, x2, y2, c)
}

// dashed_border draws a rectangle's outline with dashes.
pub fn (ui &Ui) dashed_border(r Rect, c gg.Color) {
	dash := f32(6)
	mut x := r.x
	for x < r.right() {
		e := if x + dash > r.right() { r.right() } else { x + dash }
		ui.rect(Rect{x, r.y, e - x, 1}, c)
		ui.rect(Rect{x, r.bottom() - 1, e - x, 1}, c)
		x += dash * 2
	}
	mut y := r.y
	for y < r.bottom() {
		e := if y + dash > r.bottom() { r.bottom() } else { y + dash }
		ui.rect(Rect{r.x, y, 1, e - y}, c)
		ui.rect(Rect{r.right() - 1, y, 1, e - y}, c)
		y += dash * 2
	}
}

// outline draws a border `w` thick inside r.
pub fn (ui &Ui) outline(r Rect, w f32, c gg.Color) {
	ui.rect(Rect{r.x, r.y, r.w, w}, c)
	ui.rect(Rect{r.x, r.bottom() - w, r.w, w}, c)
	ui.rect(Rect{r.x, r.y, w, r.h}, c)
	ui.rect(Rect{r.right() - w, r.y, w, r.h}, c)
}

// is_focused reports whether the field with this id has focus.
pub fn (ui &Ui) is_focused(id string) bool {
	return ui.focus == id
}

// focus_field asks for the field with this id to take focus when drawn.
pub fn (mut ui Ui) focus_field(id string) {
	ui.focus_request = id
	ui.redraw = true
}
