module gui

// ---- keyboard navigation ----
//
// Every control that can be clicked is also a stop for the keyboard. While
// no field is being typed in, Tab and Shift+Tab move keyboard focus to the
// next and previous stop in drawing order, and j k l ; move it to the
// nearest stop left, down, up and right (vim's h j k l, one key over).
// Enter or Space presses the focused control; Enter on a field starts
// editing it, and Tab into a field starts editing straight away. Clicking or
// touching anywhere drops keyboard focus.

struct Stop {
	id    string
	r     Rect
	clip  Rect
	field bool
	// The scroll areas the stop is drawn in, to bring it into view.
	vscroll string
	hscroll string
}

enum NavDir {
	left
	down
	up
	right
}

fn (mut ui Ui) add_stop(id string, r Rect, field bool) {
	if id == ui.nav {
		ui.nav_rect = r
	}
	ui.stops << Stop{
		id:      id
		r:       r
		clip:    ui.clip
		field:   field
		vscroll: if ui.vscroll_ids.len > 0 { ui.vscroll_ids.last() } else { '' }
		hscroll: if ui.hscroll_ids.len > 0 { ui.hscroll_ids.last() } else { '' }
	}
}

// focusable makes r a keyboard stop named `name` (repeated names are
// numbered in drawing order), draws the focus ring when it has keyboard
// focus, and returns true when Enter or Space presses it.
pub fn (mut ui Ui) focusable(r Rect, name string) bool {
	if ui.blocked {
		ui.under_modal = true
		return false
	}
	n := ui.stop_count[name] or { 0 }
	ui.stop_count[name] = n + 1
	id := '${name}#${n}'
	ui.add_stop(id, r, false)
	if ui.nav != id || ui.focus != '' {
		return false
	}
	ui.nav_ring(r)
	return ui.take_press(true)
}

// tap reports a click on r, or a press of it from the keyboard.
pub fn (mut ui Ui) tap(r Rect, name string) bool {
	pressed := ui.focusable(r, name)
	return ui.clicked(r) || pressed
}

// take_press consumes an Enter (or Space, when `space`) press.
fn (mut ui Ui) take_press(space bool) bool {
	for i, k in ui.keys {
		if (k.code in [.enter, .kp_enter] || (space && k.code == .space)) && !k.ctrl() && !k.alt() {
			ui.keys.delete(i)
			ui.redraw = true
			return true
		}
	}
	return false
}

// nav_ring marks the control that has keyboard focus.
fn (ui &Ui) nav_ring(r Rect) {
	t := ui.theme
	ui.rounded_border(r.inset(-4, -4), 9, t.focus_ring)
	ui.rounded_border(r.inset(-3, -3), 8, t.primary)
	ui.rounded_border(r.inset(-2, -2), 7, t.primary)
}

// clear_nav drops keyboard focus, as when a new screen opens.
pub fn (mut ui Ui) clear_nav() {
	ui.nav = ''
}

fn (ui &Ui) stop_index(id string) int {
	for i, s in ui.stops {
		if s.id == id {
			return i
		}
	}
	return -1
}

// stop_in_place finds the control drawn where the focused one was, for when
// that one is gone: a button whose label changed when it was pressed (which
// names it anew), or the next row's button after a row was removed. It is
// in the same row, and overlaps it the most; '' when there is none.
fn (ui &Ui) stop_in_place(r Rect) string {
	mut best := ''
	mut best_overlap := f32(0)
	for s in ui.stops {
		if abs(s.r.y - r.y) > 1 || abs(s.r.h - r.h) > 1 {
			continue
		}
		overlap := s.r.intersect(r).w
		if overlap > best_overlap {
			best = s.id
			best_overlap = overlap
		}
	}
	return best
}

// reachable: the stop can be seen, or scrolled to.
fn (s Stop) reachable() bool {
	v := s.r.intersect(s.clip)
	return (v.w > 0 && v.h > 0) || s.vscroll != '' || s.hscroll != ''
}

fn (s Stop) visible() bool {
	v := s.r.intersect(s.clip)
	return v.w > 0 && v.h > 0
}

// keyboard_nav moves keyboard focus for the Tab and j k l ; presses no
// control used this frame. end_frame calls it while no field is focused.
fn (mut ui Ui) keyboard_nav() {
	for k in ui.keys {
		if k.ctrl() || k.alt() {
			continue
		}
		target := match k.code {
			.tab { ui.tab_target(k.shift()) }
			.j {
				if k.shift() { -1 } else { ui.spatial_target(.left) }
			}
			.k {
				if k.shift() { -1 } else { ui.spatial_target(.down) }
			}
			.l {
				if k.shift() { -1 } else { ui.spatial_target(.up) }
			}
			.semicolon {
				if k.shift() { -1 } else { ui.spatial_target(.right) }
			}
			else { -1 }
		}
		if target >= 0 {
			ui.move_nav(target, k.code == .tab)
		}
	}
}

// tab_target is the next (or, going back, previous) stop in drawing order.
fn (ui &Ui) tab_target(back bool) int {
	n := ui.stops.len
	if n == 0 {
		return -1
	}
	cur := ui.stop_index(ui.nav)
	mut i := cur
	for _ in 0 .. n {
		i = if i < 0 {
			if back { n - 1 } else { 0 }
		} else if back {
			(i - 1 + n) % n
		} else {
			(i + 1) % n
		}
		if i != cur && ui.stops[i].reachable() {
			return i
		}
	}
	return -1
}

// spatial_target is the nearest stop in `dir` from the focused one. With
// nothing focused it is the first one in view in a scroll area (the page's
// content rather than its header), or else the first in view.
fn (ui &Ui) spatial_target(dir NavDir) int {
	cur := ui.stop_index(ui.nav)
	if cur < 0 {
		for i, s in ui.stops {
			if s.vscroll != '' && s.visible() {
				return i
			}
		}
		for i, s in ui.stops {
			if s.visible() {
				return i
			}
		}
		return -1
	}
	from := ui.stops[cur].r
	mut best := -1
	mut best_score := f32(0)
	for i, s in ui.stops {
		if i == cur || !s.reachable() {
			continue
		}
		score := nav_score(from, s.r, dir) or { continue }
		if best < 0 || score < best_score {
			best = i
			best_score = score
		}
	}
	return best
}

// nav_score rates how near `to` is from `from` going `dir`, lower being
// nearer, or none when it isn't that way (or, going sideways, not in the
// same row). The gap along the way counts once, the gap across it three
// times (stay in the column), and the distance between centers breaks ties.
fn nav_score(from Rect, to Rect, dir NavDir) ?f32 {
	fx, fy := from.x + from.w / 2, from.y + from.h / 2
	tx, ty := to.x + to.w / 2, to.y + to.h / 2
	mut ahead := f32(0)
	mut gap := f32(0)
	mut across := f32(0)
	mut off := f32(0)
	match dir {
		.down {
			ahead = ty - fy
			gap = to.y - from.bottom()
			across = span_gap(from.x, from.right(), to.x, to.right())
			off = abs(tx - fx)
		}
		.up {
			ahead = fy - ty
			gap = from.y - to.bottom()
			across = span_gap(from.x, from.right(), to.x, to.right())
			off = abs(tx - fx)
		}
		.right {
			ahead = tx - fx
			gap = to.x - from.right()
			across = span_gap(from.y, from.bottom(), to.y, to.bottom())
			off = abs(ty - fy)
		}
		.left {
			ahead = fx - tx
			gap = from.x - to.right()
			across = span_gap(from.y, from.bottom(), to.y, to.bottom())
			off = abs(ty - fy)
		}
	}
	// It must start past the middle of `from`, not just reach past it.
	lead := match dir {
		.down { to.y - fy }
		.up { fy - to.bottom() }
		.right { to.x - fx }
		.left { fx - to.right() }
	}
	if ahead < 1 || lead < 0 {
		return none
	}
	// j and ; stay in the row.
	if dir in [.left, .right] && across > 0 {
		return none
	}
	if gap < 0 {
		gap = 0
	}
	return gap + 3 * across + 0.1 * off + 0.01 * ahead
}

// span_gap is the distance between two spans, 0 when they overlap.
fn span_gap(a1 f32, a2 f32, b1 f32, b2 f32) f32 {
	if b1 > a2 {
		return b1 - a2
	}
	if a1 > b2 {
		return a1 - b2
	}
	return 0
}

// move_nav gives stop i keyboard focus and scrolls it into view. Tab into a
// field starts editing it.
fn (mut ui Ui) move_nav(i int, edit bool) {
	s := ui.stops[i]
	ui.nav = s.id
	if edit && s.field {
		ui.focus_request = s.id
	}
	margin := f32(12)
	if s.vscroll != '' {
		if area := ui.vareas[s.vscroll] {
			mut off := ui.scrolls[s.vscroll] or { 0 }
			if s.r.bottom() + margin > area.bottom() {
				off += s.r.bottom() + margin - area.bottom()
			}
			if s.r.y - margin < area.y {
				off -= area.y - (s.r.y - margin)
			}
			ui.scrolls[s.vscroll] = if off < 0 { 0 } else { off }
		}
	}
	if s.hscroll != '' {
		if area := ui.hareas[s.hscroll] {
			mut off := ui.hscrolls[s.hscroll] or { 0 }
			if s.r.right() + margin > area.right() {
				off += s.r.right() + margin - area.right()
			}
			if s.r.x - margin < area.x {
				off -= area.x - (s.r.x - margin)
			}
			ui.hscrolls[s.hscroll] = if off < 0 { 0 } else { off }
		}
	}
	ui.redraw = true
}
