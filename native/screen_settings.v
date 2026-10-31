module main

import os
import time
import core
import gui

// Settings (pages/settings.page.ts), plus logging in, registering and
// resetting a password, which the web app does on its own pages.

struct SettingsForm {
mut:
	server      gui.Input
	resync_all  bool
	resync_team string
	resync_game int
}

fn (mut app App) load_settings() {
	app.settings.server = gui.input(app.store.settings.server_url)
}

fn (mut app App) draw_settings(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	lh := ui.line_height(0)
	mut y := app.heading(x, y0, 'Settings')

	// Account.
	y = app.subheading(x, y, 'Account')
	if app.store.auth.logged_in() {
		y = app.paragraph(x, y, w, 'Logged in as ${app.store.auth.email}.', false)
		lw := ui.button_width('Logout')
		if ui.button(gui.Rect{x, y, lw, bh}, 'Logout', .outline) {
			app.ask(Confirm{
				message: 'Log out? Changes not synced yet stay on this device.'
				yes:     'Logout'
				action:  .logout
			})
		}
		y += bh + 10
	} else {
		y = app.paragraph(x, y, w, 'Log in to sync your teams between devices and share them with other coaches.',
			true)
		lw := ui.button_width('Login')
		if ui.button(gui.Rect{x, y, lw, bh}, 'Login', .primary) {
			app.go(Route{
				screen: .login
			})
		}
		rw := ui.button_width('Register')
		if ui.button(gui.Rect{x + lw + 8, y, rw, bh}, 'Register', .outline) {
			app.go(Route{
				screen: .register
			})
		}
		y += bh + 10
	}
	if app.store.settings.last_synced > 0 {
		y = app.paragraph(x, y, w, 'Last synced ${format_time(app.store.settings.last_synced)}.',
			true)
	}
	fw := if w > 480 { f32(480) } else { w }
	ev, y1 := app.labeled_field('server-url', 'Server', x, y, fw, mut app.settings.server,
		.text, core.default_server_url)
	y = y1
	if ev in [.committed, .submitted] {
		app.set_server(app.settings.server.text)
	}

	// Appearance.
	y += 10
	y = app.subheading(x, y, 'Appearance')
	themes := ['System', 'Light', 'Dark']
	cur := match app.store.settings.theme {
		'light' { 1 }
		'dark' { 2 }
		else { 0 }
	}
	choice := ui.segmented(gui.Rect{x, y, 300, bh}, themes, cur)
	if choice >= 0 && choice != cur {
		mut st := app.store.settings
		st.theme = ['', 'light', 'dark'][choice]
		app.store.set_settings(st) or { app.show_error(err.msg()) }
		app.apply_theme()
	}
	y += bh + 14
	ui.text(x, y + bh / 2, 'Text size', gui.TextStyle{ valign: .middle })
	sx := x + ui.text_width('Text size', gui.TextStyle{}) + 16
	if ui.button(gui.Rect{sx, y, bh, bh}, '−', .outline) {
		app.zoom_by(-1)
	}
	ui.text(sx + bh + 36, y + bh / 2, zoom_percent(app.store.settings.zoom), gui.TextStyle{
		align:  .center
		valign: .middle
	})
	if ui.button(gui.Rect{sx + bh + 72, y, bh, bh}, '+', .outline) {
		app.zoom_by(1)
	}
	rw := ui.button_width('Reset')
	if ui.button(gui.Rect{sx + 2 * bh + 80, y, rw, bh}, 'Reset', .ghost) {
		app.set_zoom(1.0)
	}
	y += bh + 6
	ui.text(x, y, 'Also Ctrl + and Ctrl −.', gui.TextStyle{
		size:  14
		color: t.muted
	})
	y += lh + 10

	// Sync during games.
	y = app.subheading(x, y, 'Games')
	clicked, ch := ui.checkbox(x, y, 'Disable auto-sync during games', app.store.settings.disable_auto_sync_during_game)
	if clicked {
		mut st := app.store.settings
		st.disable_auto_sync_during_game = !st.disable_auto_sync_during_game
		app.store.set_settings(st) or { app.show_error(err.msg()) }
	}
	y += ch + 6
	y = app.paragraph(x, y, w, 'When on, the app will not auto-sync while you are on a match. You can still tap the sync button to sync manually.',
		true)

	// Data.
	y += 10
	y = app.subheading(x, y, 'Data')
	dw := ui.button_width('Save data as JSON')
	if ui.button(gui.Rect{x, y, dw, bh}, 'Save data as JSON', .outline) {
		app.save_export('soccer-data', app.store.export_json())
	}
	y += bh + 6
	y = app.paragraph(x, y, w, 'Saves all synced app data to a JSON file in your Downloads folder.',
		true)
	y += 6
	y = app.subheading(x, y, 'Diagnostics')
	lw := ui.button_width('Save sync log')
	if ui.button(gui.Rect{x, y, lw, bh}, 'Save sync log', .outline) {
		app.save_export('soccer-sync-log', app.store.sync_log_json())
	}
	y += bh + 6
	y = app.paragraph(x, y, w, "Records what happens on each sync (kept on this device only, never sent to the server, and cleared after a week). Useful for troubleshooting a sync count that doesn't clear.",
		true)
	y = app.paragraph(x, y, w, 'Data folder: ${app.store.dir}', true)

	y += 10
	y = app.draw_force_resync(x, y, w)
	if app.store.auth.logged_in() {
		y = app.draw_delete_account(x, y + 30, w)
	}
	return y
}

// draw_delete_account is the danger zone at the bottom of Settings.
fn (mut app App) draw_delete_account(x f32, y f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	mut zy := app.subheading(x + 16, y + 16, 'Delete account')
	zy = app.paragraph(x + 16, zy, w - 32, "Permanently deletes your account and the teams, games and stats you've synced, from the server and from this device. Teams you share with other coaches stay with them. This can't be undone.",
		false)
	label := if app.is_busy(.delete_account) { 'Deleting…' } else { 'Delete account' }
	dw := ui.button_width('Delete account')
	if ui.named_button(gui.Rect{x + 16, zy, dw, bh}, label, .danger, 'delete-account')
		&& !app.is_busy(.delete_account) {
		app.ask(Confirm{
			message: "Delete your account and all of its data? This can't be undone."
			yes:     'Delete account'
			action:  .delete_account
		})
	}
	zy += bh + 16
	ui.rounded_border(gui.Rect{x, y, w, zy - y}, 8, ui.theme.danger)
	return zy
}

fn (mut app App) draw_force_resync(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	bh := ui.button_height()
	mut y := app.subheading(x, y0, 'Force Resync a Game')
	y = app.paragraph(x, y, w, "If a game's data doesn't seem to have reached the server (e.g. it still shows as in-progress on another device after you ended it here), use this to re-queue that game's records for sync without changing their content. Then sync.",
		true)
	clicked, ch := ui.checkbox(x, y, 'Include inactive teams', app.settings.resync_all)
	if clicked {
		app.settings.resync_all = !app.settings.resync_all
	}
	y += ch + 10
	teams, _ := app.store.teams_all(if app.settings.resync_all {
		core.TeamFilter.all
	} else {
		core.TeamFilter.active
	})
	if teams.len == 0 {
		return app.paragraph(x, y, w, 'No teams.', true)
	}
	ui.text(x, y, 'Team', gui.TextStyle{
		size:  14
		color: t.muted
	})
	y += 22
	y, app.settings.resync_team = app.choice_buttons(x, y, w, teams.map(it.title()), teams.map(it.id),
		app.settings.resync_team)
	team := app.store.team_get(app.settings.resync_team) or { return y }
	if !teams.any(it.id == team.id) {
		return y
	}
	today := core.today_str()
	mut played := team.games.filter(it.date <= today)
	played.sort(a.date > b.date)
	mut upcoming := team.games.filter(it.date > today)
	upcoming.sort(a.date < b.date)
	if team.games.len == 0 {
		return app.paragraph(x, y, w, 'No games for this team.', true)
	}
	for group in [played, upcoming] {
		if group.len == 0 {
			continue
		}
		label := if group == played { 'Played' } else { 'Upcoming' }
		ui.text(x, y, label, gui.TextStyle{
			size:  14
			color: t.muted
		})
		y += 22
		sel_ := if app.settings.resync_game > 0 { app.settings.resync_game.str() } else { '' }
		y2, sel := app.choice_buttons(x, y, w, group.map('${it.date}${if it.opponent != '' {
			' vs ' + it.opponent
		} else {
			''
		}}'), group.map(it.id.str()), sel_)
		y = y2
		app.settings.resync_game = sel.int()
	}
	game := team.game(app.settings.resync_game) or { return y }
	qw := ui.button_width('Queue for resync')
	if ui.button(gui.Rect{x, y, qw, bh}, 'Queue for resync', .primary) {
		n := app.store.game_requeue(team.id, game.id) or {
			app.show_error(err.msg())
			return y
		}
		app.show_toast('Queued ${n} record(s) for game ${game.id} to resync.')
	}
	return y + bh
}

// choice_buttons lays out a wrapping row of buttons; the one whose value is
// `selected` is highlighted, and clicking one selects it.
fn (mut app App) choice_buttons(x f32, y0 f32, w f32, labels []string, values []string, selected_ string) (f32, string) {
	mut selected := selected_
	mut ui := app.ui
	bh := ui.button_height()
	mut cx := x
	mut y := y0
	for i, label in labels {
		bw := ui.button_width(label)
		if cx > x && cx + bw > x + w {
			cx = x
			y += bh + 6
		}
		style := if values[i] == selected {
			gui.ButtonStyle.primary
		} else {
			gui.ButtonStyle.outline
		}
		if ui.button(gui.Rect{cx, y, if bw > w { w } else { bw }, bh}, label, style) {
			selected = values[i]
		}
		cx += bw + 6
	}
	return y + bh + 12, selected
}

fn (mut app App) set_server(url string) {
	mut clean := url.trim_space().trim_right('/')
	if clean == '' {
		clean = core.default_server_url
	}
	if !clean.starts_with('http://') && !clean.starts_with('https://') {
		app.show_error('The server must start with https://')
		app.settings.server = gui.input(app.store.settings.server_url)
		return
	}
	if clean == app.store.settings.server_url {
		return
	}
	mut st := app.store.settings
	st.server_url = clean
	// A different server has a different change history.
	st.last_synced_id = 0
	app.store.set_settings(st) or { app.show_error(err.msg()) }
	app.settings.server = gui.input(clean)
	app.show_toast('Server changed. Log in to sync with it.')
}

fn (mut app App) save_export(name string, text string) {
	mut dir := os.join_path(os.home_dir(), 'Downloads')
	if !os.is_dir(dir) {
		dir = app.store.dir
	}
	path := os.join_path(dir, '${name}-${core.today_str()}.json')
	os.write_file(path, text) or {
		app.show_error('Could not save ${path}: ${err}')
		return
	}
	app.show_toast('Saved ${path}')
}

fn format_time(ms i64) string {
	return time.unix_milli(ms).local().format()
}

// ---- login, register, forgot password ----

struct LoginForm {
mut:
	email    gui.Input
	password gui.Input
	error    string
}

fn (mut app App) load_login() {
	if app.login.email.text == '' {
		app.login.email = gui.input(app.store.auth.email)
	}
	if !app.ui.has_focus() {
		app.ui.focus_field(if app.login.email.text == '' { 'login-email' } else { 'login-password' })
	}
}

// auth_page draws the shared top of the account screens and returns the
// form's x, width and y.
fn (mut app App) auth_page(x f32, y0 f32, w f32, title string) (f32, f32, f32) {
	fw := if w > 420 { f32(420) } else { w }
	fx := x + (w - fw) / 2
	mut y := app.heading(fx, y0 + 10, title)
	y = app.paragraph(fx, y, fw, 'Server: ${app.store.settings.server_url}', true)
	return fx, fw, y + 6
}

fn (mut app App) draw_login(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	lh := ui.line_height(0)
	fx, fw, mut y := app.auth_page(x, y0, w, 'Login')
	if app.store.auth.logged_in() {
		y = app.paragraph(fx, y, fw, "You're logged in as ${app.store.auth.email}.", false)
		return y
	}
	if app.login.error != '' {
		y = app.message_box(fx, y, fw, app.login.error, true)
	}
	_, y1 := app.labeled_field('login-email', 'Email', fx, y, fw, mut app.login.email, .email,
		'')
	ev, y2 := app.labeled_field('login-password', 'Password', fx, y1, fw, mut app.login.password,
		.password, '')
	y = y2
	busy := app.is_busy(.login)
	if ui.button(gui.Rect{fx, y, fw, bh}, if busy { 'Logging in…' } else { 'Login' }, .primary)
		|| ev == .submitted {
		app.login.error = ''
		app.start_login(app.login.email.text.trim_space(), app.login.password.text)
	}
	y += bh + 20
	ui.text(fx, y, 'First time user?', gui.TextStyle{})
	if ui.link(fx + ui.text_width('First time user? ', gui.TextStyle{}), y, 'Register here.',
		gui.TextStyle{})
	{
		app.register.email = gui.input(app.login.email.text)
		app.go(Route{
			screen: .register
		})
	}
	y += lh + 10
	ui.text(fx, y, 'Forgot password?', gui.TextStyle{})
	if ui.link(fx + ui.text_width('Forgot password? ', gui.TextStyle{}), y, 'Reset password here.',
		gui.TextStyle{})
	{
		app.forgot.email = gui.input(app.login.email.text)
		app.go(Route{
			screen: .forgot
		})
	}
	return y + lh
}

// message_box shows a result or error above a form.
fn (mut app App) message_box(x f32, y f32, w f32, msg string, error bool) f32 {
	mut ui := app.ui
	t := ui.theme
	lines := ui.wrap(msg, w - 24, gui.TextStyle{})
	lh := ui.line_height(0)
	h := lines.len * lh + 20
	r := gui.Rect{x, y, w, h}
	color := if error { t.danger } else { t.on }
	ui.rounded(r, 6, gui.mix(t.bg, color, 0.12))
	ui.rounded_border(r, 6, color)
	for i, l in lines {
		ui.text(x + 12, y + 10 + i * lh, l, gui.TextStyle{})
	}
	return y + h + 14
}

struct RegisterForm {
mut:
	email    gui.Input
	password gui.Input
	repeat   gui.Input
	message  string
	error    bool
}

fn (mut app App) draw_register(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	lh := ui.line_height(0)
	fx, fw, mut y := app.auth_page(x, y0, w, 'Register')
	if app.register.message != '' {
		y = app.message_box(fx, y, fw, app.register.message, app.register.error)
	}
	_, y1 := app.labeled_field('reg-email', 'Email', fx, y, fw, mut app.register.email, .email,
		'')
	_, y2 := app.labeled_field('reg-password', 'Password', fx, y1, fw, mut app.register.password,
		.password, '')
	ev, y3 := app.labeled_field('reg-repeat', 'Confirm Password', fx, y2, fw, mut app.register.repeat,
		.password, '')
	y = y3
	if app.register.repeat.text != '' && app.register.repeat.text != app.register.password.text {
		ui.text(fx, y - 8, 'Passwords do not match.', gui.TextStyle{
			size:  14
			color: ui.theme.danger
		})
		y += lh
	}
	busy := app.is_busy(.register)
	if ui.button(gui.Rect{fx, y, fw, bh}, if busy { 'Registering…' } else { 'Register' },
		.primary) || ev == .submitted {
		app.register.message = ''
		app.start_register(app.register.email.text.trim_space(), app.register.password.text,
			app.register.repeat.text)
	}
	y += bh + 20
	ui.text(fx, y, 'Already registered?', gui.TextStyle{})
	if ui.link(fx + ui.text_width('Already registered? ', gui.TextStyle{}), y, 'Login here.',
		gui.TextStyle{})
	{
		if app.register.email.text != '' {
			app.login.email = gui.input(app.register.email.text)
		}
		app.go(Route{
			screen: .login
		})
	}
	return y + lh
}

struct ForgotForm {
mut:
	email   gui.Input
	message string
	error   bool
}

fn (mut app App) draw_forgot(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	fx, fw, mut y := app.auth_page(x, y0, w, 'Reset Password')
	if app.forgot.message != '' {
		y = app.message_box(fx, y, fw, app.forgot.message, app.forgot.error)
	}
	y = app.paragraph(fx, y, fw, "Enter your account's email and we'll send you a link to set a new password.",
		true)
	ev, y1 := app.labeled_field('forgot-email', 'Email', fx, y, fw, mut app.forgot.email,
		.email, '')
	y = y1
	busy := app.is_busy(.forgot)
	if ui.button(gui.Rect{fx, y, fw, bh}, if busy { 'Sending…' } else { 'Send reset link' },
		.primary) || ev == .submitted {
		app.forgot.message = ''
		app.start_forgot(app.forgot.email.text.trim_space())
	}
	return y + bh
}
