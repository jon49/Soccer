module main

import gg
import math
import os
import time
import core
import gui

enum Screen {
	teams
	team
	games
	game
	match
	goal_picker
	stats
	stats_edit
	formation
	templates
	share
	join
	settings
	login
	register
	forgot
}

// Route is a screen and what it shows, like a URL in the web app.
struct Route {
	screen  Screen
	team_id string
	game_id int
	// The goal picker: add a goal (true) or take one back.
	inc bool
}

const pad = f32(16)
const zoom_min = 50
const zoom_max = 300
const zoom_step = 10
const max_content_width = f32(1000)
// Debounce before an automatic sync after a change, as the web app does.
const auto_sync_ms = 1500

struct SyncDone {
	req core.SyncRequest
	res core.SyncResponse
}

enum SyncPhase {
	normal
	// A 403 means some record names a space we're no longer in: learn the
	// current membership with a sync that sends nothing, then retry once.
	probe
	retry
}

// Confirm is a pending yes/no question; `action` runs on yes.
struct Confirm {
	message string
	yes     string
	action  ConfirmAction
	team_id string
	game_id int
	user    string
}

enum ConfirmAction {
	none_
	end_game
	restart_game
	all_out
	delete_game
	leave_team
	remove_coach
	logout
}

@[heap]
struct App {
mut:
	gg    &gg.Context = unsafe { nil }
	ui    &gui.Ui
	store &core.Store
	route Route
	// Screens to go back to.
	history []Route
	// Toast message at the bottom of the window.
	toast       string
	toast_error bool
	toast_until i64
	confirm     Confirm
	// Sync runs on a worker thread; results come back on this channel.
	syncing     bool
	sync_ch     chan SyncDone
	sync_phase  SyncPhase
	sync_manual bool
	sync_due    i64
	last_sync   i64
	// The screen whose tab the navigation last scrolled into view.
	nav_screen   Screen
	after_sync   []AfterSync
	sync_message string
	// Other network calls (login, sharing, publishing) report here.
	job_ch chan JobDone
	busy   map[int]bool
	// Redraw once a second while a clock is shown.
	tick_due i64
	// Forms and per-screen state.
	teams          TeamsForm
	team           TeamForm
	games          GamesForm
	game           GameForm
	match          MatchView
	formation      FormationForm
	stats          StatsForm
	stats_ed       StatsEditForm
	share          ShareForm
	join           JoinForm
	settings       SettingsForm
	login          LoginForm
	register       RegisterForm
	forgot         ForgotForm
	theme_resolved string
	// gg's own scale for the screen's DPI; the zoom multiplies it.
	base_scale   f32 = 1
	zoom_changed bool
	// --script: steps to run, for checking the app without a person.
	autopilot ?Autopilot
}

fn new_app(store &core.Store) &App {
	mut app := &App{
		ui:      gui.new_ui()
		store:   store
		sync_ch: chan SyncDone{cap: 1}
		job_ch:  chan JobDone{cap: 16}
	}
	app.ui.paste_fn = paste_text
	app.apply_theme()
	app.route = Route{
		screen: .teams
	}
	app.load_screen()
	return app
}

fn now_ms() i64 {
	return time.now().unix_milli()
}

// ---- theme and zoom ----

fn (mut app App) apply_theme() {
	mut theme := app.store.settings.theme
	if theme == '' {
		theme = if system_prefers_dark() { 'dark' } else { 'light' }
	}
	app.theme_resolved = theme
	app.ui.theme = if theme == 'dark' { gui.dark_theme } else { gui.light_theme }
	if app.gg != unsafe { nil } {
		app.gg.set_bg_color(app.ui.theme.bg)
	}
}

// system_prefers_dark makes a best guess at the desktop's color scheme.
fn system_prefers_dark() bool {
	$if linux {
		if os.getenv('GTK_THEME').to_lower().contains('dark') {
			return true
		}
		res := os.exec(['gsettings', 'get', 'org.gnome.desktop.interface', 'color-scheme'])
		return res.exit_code == 0 && res.output.contains('dark')
	}
	return false
}

fn (mut app App) toggle_theme() {
	mut st := app.store.settings
	st.theme = if app.theme_resolved == 'dark' { 'light' } else { 'dark' }
	app.store.set_settings(st) or { app.show_error('Could not save the theme: ${err}') }
	app.apply_theme()
}

fn (mut app App) apply_zoom() {
	app.gg.scale = app.base_scale * f32(app.store.settings.zoom)
	app.gg.ft.scale = app.gg.scale
	app.ui.request_redraw()
}

fn (mut app App) zoom_by(steps int) {
	pct := int(math.round(app.store.settings.zoom * 100))
	mut next := if steps > 0 {
		pct / zoom_step * zoom_step + steps * zoom_step
	} else {
		(pct + zoom_step - 1) / zoom_step * zoom_step + steps * zoom_step
	}
	next = if next < zoom_min {
		zoom_min
	} else if next > zoom_max {
		zoom_max
	} else {
		next
	}
	app.set_zoom(f64(next) / 100)
}

fn (mut app App) set_zoom(zoom f64) {
	if zoom == app.store.settings.zoom {
		return
	}
	mut st := app.store.settings
	st.zoom = zoom
	app.store.set_settings(st) or { app.show_error('Could not save the text size: ${err}') }
	// Applied at the start of the next frame, so a frame is never drawn
	// half at one size and half at another.
	app.zoom_changed = true
	app.ui.request_redraw()
	app.show_toast('Text size ${zoom_percent(zoom)}')
}

fn zoom_percent(zoom f64) string {
	return '${int(math.round(zoom * 100))}%'
}

// ---- toasts and timers ----

fn (mut app App) show_toast(msg string) {
	app.toast = msg
	app.toast_error = false
	app.toast_until = now_ms() + 3000
	app.wake_after(3050)
}

fn (mut app App) show_error(msg string) {
	app.toast = msg
	app.toast_error = true
	app.toast_until = now_ms() + 5000
	app.wake_after(5050)
}

// wake_after requests a redraw later; in ui_mode nothing is drawn without
// input, so timers (toasts, delayed sync, clocks) need a nudge.
fn (mut app App) wake_after(ms int) {
	if app.gg == unsafe { nil } {
		return
	}
	spawn fn (ctx &gg.Context, ms int) {
		time.sleep(ms * time.millisecond)
		mut c := unsafe { ctx }
		c.refresh_ui()
	}(app.gg, ms)
}

// tick keeps clocks moving: one redraw at the next whole second.
fn (mut app App) tick() {
	now := now_ms()
	if app.tick_due > now {
		return
	}
	wait := 1000 - int(now % 1000) + 5
	app.tick_due = now + wait
	app.wake_after(wait)
}

// ---- navigation ----

fn (mut app App) go(r Route) {
	if r == app.route {
		return
	}
	app.leave_screen()
	app.history << app.route
	if app.history.len > 50 {
		app.history.delete(0)
	}
	app.route = r
	app.enter_screen()
}

// replace changes the screen without adding to the history.
fn (mut app App) replace(r Route) {
	app.leave_screen()
	app.route = r
	app.enter_screen()
}

fn (mut app App) back() {
	if app.history.len == 0 {
		if app.route.screen != .teams {
			app.replace(Route{
				screen: .teams
			})
		}
		return
	}
	app.leave_screen()
	app.route = app.history.pop()
	app.enter_screen()
}

fn (mut app App) leave_screen() {
	app.commit_forms()
	app.ui.blur()
	app.match.clear()
}

fn (mut app App) enter_screen() {
	app.ui.set_scroll('main', 0)
	app.load_screen()
	app.ui.request_redraw()
}

// load_screen fills the current screen's form from the store.
fn (mut app App) load_screen() {
	match app.route.screen {
		.teams { app.load_teams() }
		.team { app.load_team() }
		.games { app.load_games() }
		.game { app.load_game() }
		.formation { app.load_formation() }
		.stats_edit { app.load_stats_edit() }
		.share { app.load_share() }
		.settings { app.load_settings() }
		.login { app.load_login() }
		.templates { app.load_templates() }
		else {}
	}
	// A team that is gone (moved or no longer shared) can't be shown.
	if app.route.team_id != '' && app.route.screen !in [.settings, .login, .register, .forgot] {
		app.store.team_get(app.route.team_id) or {
			app.show_error(err.msg())
			app.route = Route{
				screen: .teams
			}
			app.history.clear()
			app.load_teams()
		}
	}
}

// commit_forms saves edits that have not been committed yet.
fn (mut app App) commit_forms() {
	app.commit_game_notes()
}

// changed is called after every local edit: it queues an automatic sync.
fn (mut app App) changed() {
	app.schedule_sync(auto_sync_ms)
}

// ---- sync ----

fn (app &App) auto_sync_paused() bool {
	return app.route.screen == .match && app.store.settings.disable_auto_sync_during_game
}

fn (mut app App) schedule_sync(ms int) {
	if !app.store.auth.logged_in() {
		return
	}
	app.sync_due = now_ms() + ms
	app.wake_after(ms + 50)
}

fn (mut app App) on_focus() {
	// Pick up changes made on other devices.
	if now_ms() - app.last_sync > 60_000 && !app.auto_sync_paused() {
		app.start_sync(false)
	}
}

fn (mut app App) start_sync(manual bool) {
	if app.syncing {
		if manual {
			app.sync_manual = true
		}
		return
	}
	if !app.store.auth.logged_in() {
		if manual {
			app.show_error('You are not logged in!')
			app.go(Route{
				screen: .login
			})
		}
		return
	}
	app.commit_forms()
	app.sync_due = 0
	app.sync_manual = manual
	app.sync_phase = .normal
	app.send_sync(true)
}

fn (mut app App) send_sync(with_data bool) {
	app.syncing = true
	app.last_sync = now_ms()
	req := app.store.begin_sync(with_data)
	spawn sync_worker(app.sync_ch, req, app.gg)
}

fn sync_worker(ch chan SyncDone, req core.SyncRequest, ctx &gg.Context) {
	res := core.perform_sync(req)
	ch <- SyncDone{req, res}
	if ctx != unsafe { nil } {
		mut c := unsafe { ctx }
		c.refresh_ui()
	}
}

fn (mut app App) on_sync_done(done SyncDone) {
	app.syncing = false
	outcome := app.store.finish_sync(done.req, done.res) or {
		if app.sync_manual || !app.store.auth.logged_in() {
			app.show_error(err.msg())
		}
		app.finish_after_sync(false)
		return
	}
	for m in outcome.messages {
		app.show_error(m)
	}
	match app.sync_phase {
		.normal {
			if outcome.status == 403 {
				app.sync_phase = .probe
				app.send_sync(false)
				return
			}
		}
		.probe {
			if outcome.status == 403 {
				app.show_error('Sync was refused.')
				app.finish_after_sync(false)
				return
			}
			app.sync_phase = .retry
			app.send_sync(true)
			return
		}
		.retry {
			if outcome.status == 403 {
				app.show_error('Sync was refused.')
				app.finish_after_sync(false)
				return
			}
		}
	}
	if app.sync_manual {
		app.show_toast('Synced!')
	}
	app.refresh_forms()
	app.finish_after_sync(true)
	// Edits made during the sync still need uploading.
	if app.store.pending.len > 0 && !app.auto_sync_paused() {
		app.schedule_sync(auto_sync_ms)
	}
}

// refresh_forms reloads forms after a sync, unless one is being edited.
fn (mut app App) refresh_forms() {
	if app.ui.has_focus() {
		return
	}
	app.load_screen()
}

fn (mut app App) poll_workers() {
	mut done := SyncDone{}
	if app.sync_ch.try_pop(mut done) == .success {
		app.on_sync_done(done)
	}
	for {
		mut job := JobDone{}
		if app.job_ch.try_pop(mut job) != .success {
			break
		}
		app.on_job_done(job)
	}
	if app.sync_due > 0 && now_ms() >= app.sync_due {
		if app.auto_sync_paused() {
			app.sync_due = 0
		} else {
			app.start_sync(false)
		}
	}
}

fn (mut app App) logout() {
	server := app.store.settings.server_url
	refresh := app.store.auth.refresh_token
	spawn core.logout(server, refresh)
	app.store.auth = core.AuthTokens{
		email: app.store.auth.email
	}
	app.store.save_auth() or {}
	app.show_toast('Logged out.')
}

fn open_in_browser(url string) {
	os.open_uri(url) or {}
}

// ---- frame ----

fn (mut app App) frame() {
	app.poll_workers()
	if app.zoom_changed {
		app.zoom_changed = false
		app.apply_zoom()
	}
	mut ui := app.ui
	ui.begin_frame()
	app.gg.begin()
	// The status bar's strip, on phones, in the web app's theme color.
	ui.begin_drawing(ui.theme.primary)
	w := ui.width()
	h := ui.height()
	modal := app.confirm.action != .none_
	ui.blocked = modal

	if app.route.screen == .match {
		app.draw_match(w, h)
	} else {
		header_h := app.draw_header(w)
		area := gui.Rect{0, header_h, w, h - header_h}
		off := ui.begin_scroll('main', area)
		cw := if w - 2 * pad > max_content_width { max_content_width } else { w - 2 * pad }
		x := (w - cw) / 2
		y := area.y + pad - off
		content_h := app.draw_screen(x, y, cw) + 2 * pad
		ui.end_scroll('main', area, content_h)
		if !ui.has_focus() && !modal {
			app.scroll_keys(area, content_h)
		}
	}
	ui.blocked = false
	if modal {
		app.draw_confirm(w, h)
	}
	app.draw_toast(w, h)
	app.shortcuts()
	app.gg.end()
	if ui.end_frame() {
		app.gg.refresh_ui()
	}
}

fn (mut app App) draw_screen(x f32, y f32, w f32) f32 {
	return match app.route.screen {
		.teams { app.draw_teams(x, y, w) }
		.team { app.draw_team(x, y, w) }
		.games { app.draw_games(x, y, w) }
		.game { app.draw_game(x, y, w) }
		.goal_picker { app.draw_goal_picker(x, y, w) }
		.stats { app.draw_stats(x, y, w) }
		.stats_edit { app.draw_stats_edit(x, y, w) }
		.formation { app.draw_formation(x, y, w) }
		.templates { app.draw_templates(x, y, w) }
		.share { app.draw_share(x, y, w) }
		.join { app.draw_join(x, y, w) }
		.settings { app.draw_settings(x, y, w) }
		.login { app.draw_login(x, y, w) }
		.register { app.draw_register(x, y, w) }
		.forgot { app.draw_forgot(x, y, w) }
		.match { y }
	} - y
}

fn (mut app App) scroll_keys(area gui.Rect, content_h f32) {
	mut ui := app.ui
	page := area.h * 0.9
	if ui.key_pressed(.page_down, false) {
		ui.scroll_by('main', page)
	}
	if ui.key_pressed(.page_up, false) {
		ui.scroll_by('main', -page)
	}
	if ui.key_pressed(.down, false) {
		ui.scroll_by('main', 48)
	}
	if ui.key_pressed(.up, false) {
		ui.scroll_by('main', -48)
	}
	if ui.key_pressed(.home, false) || ui.key_pressed(.home, true) {
		ui.set_scroll('main', 0)
		ui.request_redraw()
	}
	if ui.key_pressed(.end, false) || ui.key_pressed(.end, true) {
		ui.scroll_by('main', content_h)
	}
}

// shortcuts handles the keys no field used.
fn (mut app App) shortcuts() {
	mut ui := app.ui
	if app.confirm.action != .none_ {
		if ui.key_pressed(.escape, false) {
			app.confirm = Confirm{}
		}
		if ui.key_pressed(.enter, false) || ui.key_pressed(.kp_enter, false) {
			app.confirm_yes()
		}
		return
	}
	if ui.key_pressed(.r, true) {
		app.start_sync(true)
	}
	if ui.key_pressed(.escape, false) {
		if app.route.screen == .match && app.match.sel.kind != .none_ {
			app.match.clear()
		} else if !ui.has_focus() && app.history.len > 0 {
			app.back()
		}
	}
	if ui.key_pressed(.backspace, false) && !ui.has_focus() && app.history.len > 0 {
		app.back()
	}
	if ui.key_pressed(.left, true) {
		app.back()
	}
	if ui.key_pressed(.equal, true) || ui.key_pressed(.kp_add, true) {
		app.zoom_by(1)
	}
	if ui.key_pressed(.minus, true) || ui.key_pressed(.kp_subtract, true) {
		app.zoom_by(-1)
	}
	if ui.key_pressed(._0, true) || ui.key_pressed(.kp_0, true) {
		app.set_zoom(1.0)
	}
	steps := ui.take_zoom_steps()
	if steps != 0 {
		app.zoom_by(steps)
	}
}

// ---- header ----

fn (mut app App) draw_header(w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	top_h := bh + 16
	ui.rect(gui.Rect{0, 0, w, top_h}, t.surface)

	// Left: back and the app name, which goes to the teams.
	mut lx := pad
	if app.history.len > 0 {
		if ui.button(gui.Rect{lx - 6, 8, bh, bh}, '‹', .ghost) {
			app.back()
		}
		lx += bh
	}
	title := gui.TextStyle{
		size:   20
		bold:   true
		valign: .middle
	}
	ball := f32(12)
	tw := ball * 2 + 8 + ui.text_width('Soccer', title)
	brand := gui.Rect{lx, 8, tw, bh}
	draw_ball(ui, lx + ball, top_h / 2, ball)
	ui.text(lx + ball * 2 + 8, top_h / 2, 'Soccer', title)
	ui.pointer_cursor(brand)
	if ui.clicked(brand) {
		app.go(Route{
			screen: .teams
		})
	}

	// Right: theme, sync, settings, login.
	mut rx := w - pad
	logged_in := app.store.auth.logged_in()
	auth_label := if logged_in { 'Logout' } else { 'Login' }
	aw := ui.button_width(auth_label)
	rx -= aw
	if ui.button(gui.Rect{rx, 8, aw, bh}, auth_label, .outline) {
		if logged_in {
			app.ask(Confirm{
				message: 'Log out? Changes not synced yet stay on this device.'
				yes:     'Logout'
				action:  .logout
			})
		} else {
			app.go(Route{
				screen: .login
			})
		}
	}
	rx -= bh + 6
	if ui.button(gui.Rect{rx, 8, bh, bh}, '⚙', .ghost) {
		app.go(Route{
			screen: .settings
		})
	}
	pending := app.store.pending.len
	sync_label := if app.syncing {
		'↻ …'
	} else if pending > 0 {
		'↻ (${pending})'
	} else {
		'↻'
	}
	sw := ui.button_width(sync_label)
	rx -= sw + 6
	if ui.button(gui.Rect{rx, 8, sw, bh}, sync_label, .ghost) {
		app.start_sync(true)
	}
	theme_label := if app.theme_resolved == 'dark' { '☀' } else { '☾' }
	rx -= bh + 6
	if ui.button(gui.Rect{rx, 8, bh, bh}, theme_label, .ghost) {
		app.toggle_theme()
	}

	// Navigation: the teams, and the team's pages when one is open.
	nav_y := top_h
	nav_h := bh + 8
	nav_r := gui.Rect{0, nav_y, w, nav_h}
	ui.rect(nav_r, t.bg)
	ui.hline(0, nav_y + nav_h - 1, w, t.border)
	mut items := [NavItem{'Teams', Route{
		screen: .teams
	}}]
	tid := app.route.team_id
	if tid != '' && app.route.screen !in [.settings, .login, .register, .forgot, .join] {
		items << NavItem{'Players', Route{
			screen:  .team
			team_id: tid
		}}
		items << NavItem{'Games', Route{
			screen:  .games
			team_id: tid
		}}
		items << NavItem{'Stats', Route{
			screen:  .stats
			team_id: tid
		}}
		items << NavItem{'Formation', Route{
			screen:  .formation
			team_id: tid
		}}
	}
	// The tabs scroll sideways when they don't fit, as on a phone, and a
	// newly opened screen brings its tab into view.
	off := ui.begin_hscroll('nav', nav_r)
	mut nx := pad
	mut active_x, mut active_w := f32(0), f32(0)
	for item in items {
		bw := ui.button_width(item.label)
		active := item.route.screen == app.route.screen
			|| (item.route.screen == .stats && app.route.screen == .stats_edit)
			|| (item.route.screen == .formation && app.route.screen == .templates)
			|| (item.route.screen == .games && app.route.screen in [.game, .goal_picker])
			|| (item.route.screen == .team && app.route.screen == .share)
		if active {
			active_x, active_w = nx, bw
		}
		style := if active { gui.ButtonStyle.tab_active } else { gui.ButtonStyle.tab }
		if ui.button(gui.Rect{nx - off, nav_y + 4, bw, bh}, item.label, style) {
			app.go(item.route)
		}
		nx += bw + 4
	}
	content_w := nx - 4 + pad
	ui.end_hscroll('nav', nav_r, content_w)
	if app.nav_screen != app.route.screen {
		app.nav_screen = app.route.screen
		if active_x + active_w + pad > off + w {
			ui.set_hscroll('nav', active_x + active_w + pad - w)
		} else if active_x - pad < off {
			ui.set_hscroll('nav', active_x - pad)
		}
	}
	return nav_y + nav_h
}

struct NavItem {
	label string
	route Route
}

// draw_ball is the app's icon: a ball with a pentagon patch.
fn draw_ball(ui &gui.Ui, cx f32, cy f32, r f32) {
	t := ui.theme
	ui.circle(cx, cy, r, t.text)
	ui.circle(cx, cy, r - 1.5, t.bg)
	mut pts := []f32{}
	for i in 0 .. 5 {
		a := -math.pi / 2 + f64(i) * 2 * math.pi / 5
		pts << cx + f32(math.cos(a)) * r * 0.42
		pts << cy + f32(math.sin(a)) * r * 0.42
	}
	ui.ctx.draw_convex_poly(pts, t.text)
	for i in 0 .. 5 {
		a := -math.pi / 2 + f64(i) * 2 * math.pi / 5
		ui.line(cx + f32(math.cos(a)) * r * 0.42, cy + f32(math.sin(a)) * r * 0.42, cx +
			f32(math.cos(a)) * (r - 1), cy + f32(math.sin(a)) * (r - 1), t.text)
	}
}

// ---- toast and confirm ----

fn (mut app App) draw_toast(w f32, h f32) {
	if app.toast == '' {
		return
	}
	if now_ms() > app.toast_until {
		app.toast = ''
		return
	}
	mut ui := app.ui
	t := ui.theme
	style := gui.TextStyle{
		color:  t.on_primary
		align:  .center
		valign: .middle
	}
	max_w := if w - 2 * pad > 520 { f32(520) } else { w - 2 * pad }
	lines := ui.wrap(app.toast, max_w - 32, style)
	lh := ui.line_height(0)
	th := lines.len * lh + 20
	r := gui.Rect{(w - max_w) / 2, h - th - 20, max_w, th}
	ui.rounded(r, 8, if app.toast_error { t.danger } else { t.primary })
	for i, line in lines {
		ui.text(w / 2, r.y + 10 + lh * i + lh / 2, line, style)
	}
	if ui.clicked(r) {
		app.toast = ''
	}
}

fn (mut app App) ask(c Confirm) {
	app.ui.blur()
	app.confirm = c
}

fn (mut app App) draw_confirm(w f32, h f32) {
	mut ui := app.ui
	t := ui.theme
	ui.rect(gui.Rect{0, 0, w, h}, gui.hexa(0x000000, 110))
	bw := if w - 2 * pad > 440 { f32(440) } else { w - 2 * pad }
	lines := ui.wrap(app.confirm.message, bw - 40, gui.TextStyle{})
	lh := ui.line_height(0)
	bh := ui.button_height()
	box_h := 20 + lines.len * lh + 20 + bh + 20
	r := gui.Rect{(w - bw) / 2, (h - box_h) / 2, bw, box_h}
	ui.rounded(r, 10, t.bg)
	ui.rounded_border(r, 10, t.border)
	for i, line in lines {
		ui.text(r.x + 20, r.y + 20 + i * lh, line, gui.TextStyle{})
	}
	by := r.bottom() - 20 - bh
	yes := if app.confirm.yes == '' { 'OK' } else { app.confirm.yes }
	yw := ui.button_width(yes)
	cw := ui.button_width('Cancel')
	if ui.button(gui.Rect{r.right() - 20 - yw, by, yw, bh}, yes, if app.confirm.action in [
		.delete_game,
		.leave_team,
		.remove_coach,
	] {
		gui.ButtonStyle.danger
	} else {
		gui.ButtonStyle.primary
	})
	{
		app.confirm_yes()
		return
	}
	if ui.button(gui.Rect{r.right() - 20 - yw - 10 - cw, by, cw, bh}, 'Cancel', .outline) {
		app.confirm = Confirm{}
		return
	}
	// A click outside the box cancels.
	if !ui.hovered(r) && ui.clicked(gui.Rect{0, 0, w, h}) {
		app.confirm = Confirm{}
	}
}

fn (mut app App) confirm_yes() {
	c := app.confirm
	app.confirm = Confirm{}
	match c.action {
		.none_ {}
		.end_game { app.match_clock(.end) }
		.restart_game { app.match_restart() }
		.all_out { app.match_all_out() }
		.delete_game { app.delete_game(c.team_id, c.game_id) }
		.leave_team { app.share_leave(c.team_id) }
		.remove_coach { app.share_remove(c.team_id, c.user) }
		.logout { app.logout() }
	}
}

// ---- shared layout helpers ----

fn (mut app App) heading(x f32, y f32, s string) f32 {
	app.ui.text(x, y, s, gui.TextStyle{
		size: 24
		bold: true
	})
	return y + 44
}

fn (mut app App) subheading(x f32, y f32, s string) f32 {
	app.ui.text(x, y, s, gui.TextStyle{
		size: 18
		bold: true
	})
	return y + 32
}

// paragraph draws wrapped text and returns the y below it.
fn (mut app App) paragraph(x f32, y f32, w f32, s string, muted bool) f32 {
	mut ui := app.ui
	style := gui.TextStyle{
		color: if muted { ui.theme.muted } else { gui.transparent }
	}
	lh := ui.line_height(0)
	lines := ui.wrap(s, w, style)
	for i, line in lines {
		ui.text(x, y + i * lh, line, style)
	}
	return y + lines.len * lh + 10
}

// labeled_field draws a label above a field and returns the field's event
// and the y below it.
fn (mut app App) labeled_field(id string, label string, x f32, y f32, w f32, mut input gui.Input, kind gui.FieldKind, placeholder string) (gui.FieldEvent, f32) {
	mut ui := app.ui
	ui.text(x, y, label, gui.TextStyle{
		size:  14
		color: ui.theme.muted
	})
	fy := y + 22
	fh := if kind == .multiline { ui.multiline_height(input.text) } else { ui.field_height() }
	ev := ui.field(id, gui.Rect{x, fy, w, fh}, mut input, kind, placeholder)
	return ev, fy + fh + 14
}

// columns splits a width into n columns when there is room, else one.
fn columns(w f32, n int, min_w f32) int {
	mut c := n
	for c > 1 && (w - f32(c - 1) * pad) / f32(c) < min_w {
		c--
	}
	return c
}
