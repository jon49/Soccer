module main

import time
import core
import gui

// Teams (pages/teams.page.ts) and joining a shared team (join.page.ts).

struct TeamsForm {
mut:
	name     gui.Input
	year     gui.Input
	show_all bool
}

fn (mut app App) load_teams() {
	if app.teams.year.text == '' {
		app.teams.year = gui.input(time.now().year.str())
	}
}

// next_game is a team's soonest game today or later.
fn next_game(team core.Team) ?core.Game {
	today := core.today_str()
	mut best := ?core.Game(none)
	for g in team.games {
		if g.date < today {
			continue
		}
		if b := best {
			if g.date + ' ' + g.time < b.date + ' ' + b.time {
				best = g
			}
		} else {
			best = g
		}
	}
	return best
}

fn (mut app App) draw_teams(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	mut y := app.heading(x, y0, 'Teams')
	filter := if app.teams.show_all { core.TeamFilter.all } else { core.TeamFilter.active }
	teams, total := app.store.teams_all(filter)
	lh := ui.line_height(0)
	bh := ui.button_height()
	for team in teams {
		next := next_game(team)
		h := 16 + lh + 8 + lh + 8 + bh + 12
		card := gui.Rect{x, y, w, h}
		ui.rounded(card, 8, t.surface)
		ui.rounded_border(card, 8, t.border)
		name_style := gui.TextStyle{
			size: 18
			bold: true
		}
		title := team.title()
		if ui.link(x + 16, y + 14, ui.fit(title, w - 120, name_style), name_style) {
			app.go(Route{
				screen:  .team
				team_id: team.id
			})
		}
		bx := x + 16 + ui.text_width(ui.fit(title, w - 120, name_style), name_style) + 10
		if team.is_shared() {
			badge(ui, bx, y + 16, 'Shared')
		}
		ny := y + 16 + lh + 12
		if g := next {
			label := 'Next: ${core.format_game_date(g.date)}${if g.time != '' {
				' · ' + core.format_game_time(g.time)
			} else {
				''
			}} vs ${g.opponent}'
			if ui.link(x + 16, ny, ui.fit(label, w - 32, gui.TextStyle{}), gui.TextStyle{}) {
				app.go(Route{
					screen:  .game
					team_id: team.id
					game_id: g.id
				})
			}
		} else {
			ui.text(x + 16, ny, 'No upcoming games', gui.TextStyle{ color: t.muted })
		}
		gw := ui.button_width('Games')
		if ui.button(gui.Rect{x + 16, ny + lh + 8, gw, bh}, 'Games', .outline) {
			app.go(Route{
				screen:  .games
				team_id: team.id
			})
		}
		y += h + 10
	}
	if teams.len == 0 {
		y = app.paragraph(x, y, w, if total > 0 {
			'No active teams.'
		} else {
			'No teams yet. Add one below.'
		}, true)
	}
	if !app.teams.show_all && total > teams.len {
		if ui.link(x, y, 'Show all teams.', gui.TextStyle{}) {
			app.teams.show_all = true
		}
		y += lh + 16
	}

	y += 10
	y = app.subheading(x, y, 'Add a team')
	fw := if w > 420 { f32(420) } else { w }
	ev1, y1 := app.labeled_field('team-name', 'Team Name', x, y, fw, mut app.teams.name,
		.text, '')
	ev2, y2 := app.labeled_field('team-year', 'Year', x, y1, fw, mut app.teams.year, .text,
		'')
	y = y2
	sw := ui.button_width('Save')
	if ui.button(gui.Rect{x, y, sw, bh}, 'Save', .primary) || ev1 == .submitted
		|| ev2 == .submitted {
		app.create_team()
	}
	y += bh + 30
	y = app.subheading(x, y, 'Shared teams')
	y = app.paragraph(x, y, w, 'Another coach can share a team with you. Open the invite link they sent you here.',
		true)
	jw := ui.button_width('Join a shared team')
	if ui.button(gui.Rect{x, y, jw, bh}, 'Join a shared team', .outline) {
		app.go(Route{
			screen: .join
		})
	}
	return y + bh
}

fn (mut app App) create_team() {
	team := app.store.team_create(app.teams.name.text, app.teams.year.text) or {
		app.show_error(err.msg())
		return
	}
	app.teams.name = gui.Input{}
	app.changed()
	app.show_toast('Added ${team.title()}.')
}

fn badge(ui &gui.Ui, x f32, y f32, label string) f32 {
	t := ui.theme
	style := gui.TextStyle{
		size:   12
		bold:   true
		color:  t.on_text
		valign: .middle
	}
	w := ui.text_width(label, style) + 14
	h := f32(20)
	ui.rounded(gui.Rect{x, y, w, h}, 10, t.on)
	ui.text(x + 7, y + h / 2, label, style)
	return w
}

// ---- join ----

struct JoinForm {
mut:
	code       gui.Input
	invited_by string
	checked    string // the code previewed
	member     bool
	message    string
	error      bool
}

fn (mut app App) draw_join(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	bh := ui.button_height()
	mut y := app.heading(x, y0, 'Join a team')
	if !app.store.auth.logged_in() {
		y = app.paragraph(x, y, w, 'Log in to join a team.', false)
		lw := ui.button_width('Log in')
		if ui.button(gui.Rect{x, y, lw, bh}, 'Log in', .primary) {
			app.go(Route{
				screen: .login
			})
		}
		return y + bh
	}
	y = app.paragraph(x, y, w, 'Paste the invite link (or its code) another coach sent you.',
		true)
	fw := if w > 560 { f32(560) } else { w }
	ev, y1 := app.labeled_field('join-code', 'Invite link', x, y, fw, mut app.join.code,
		.text, 'https://…/web/join/?code=…')
	y = y1
	code := core.invite_code(app.join.code.text) or { '' }
	if ev == .committed || ev == .changed {
		app.join.message = ''
	}
	if code != '' && code != app.join.checked && !app.is_busy(.invite_preview) {
		app.join.checked = code
		app.join.invited_by = ''
		app.start_api(.invite_preview, '', code)
	}
	if app.join.message != '' {
		y = app.paragraph(x, y, w, app.join.message, app.join.error)
	}
	if code == '' {
		if app.join.code.text.trim_space() != '' {
			y = app.paragraph(x, y, w, 'This invite link is missing its code.', true)
		}
		return y
	}
	if app.is_busy(.invite_preview) {
		return app.paragraph(x, y, w, 'Checking the invite…', true)
	}
	if app.join.member {
		y = app.paragraph(x, y, w, "You're already on this team.", false)
		return y
	}
	if app.join.invited_by != '' {
		y = app.paragraph(x, y, w, 'Join the team shared by ${app.join.invited_by}?', false)
		y = app.paragraph(x, y, w, "You'll both be able to edit everything on it.", true)
		label := if app.is_busy(.invite_accept) { 'Joining…' } else { 'Join' }
		jw := ui.button_width('Joining…')
		if ui.button(gui.Rect{x, y, jw, bh}, label, .primary) {
			app.start_api(.invite_accept, '', code)
		}
		y += bh
	}
	return y
}

fn (mut app App) on_invite_preview(job JobDone) {
	if job.extra != app.join.checked {
		return
	}
	if !job.res.ok {
		app.join.error = true
		app.join.message = if job.res.status == 404 {
			'This invite has expired or was already used. Ask for a new one.'
		} else {
			job.res.message
		}
		return
	}
	m := core.as_map(job.res.json)
	app.join.invited_by = core.any_str(m['invitedBy'] or { '' })
	app.join.member = core.any_bool(m['member'] or { false })
	app.join.message = ''
}

fn (mut app App) on_invite_accepted(job JobDone) {
	if !job.res.ok {
		app.join.error = true
		app.join.message = if job.res.status == 404 {
			'This invite has expired or was already used. Ask for a new one.'
		} else if job.res.status == 401 {
			'Log in to join this team.'
		} else {
			job.res.message
		}
		return
	}
	space := core.any_str(core.as_map(job.res.json)['space'] or { '' })
	app.join.error = false
	app.join.message = 'Joined. Downloading the team…'
	app.join.invited_by = ''
	// The new space shows up in the next sync's membership list, and with
	// no cursor yet it pulls the team's whole history.
	app.after_sync << AfterSync{
		kind:    .joined_team
		team_id: space
	}
	if app.syncing {
		app.sync_due = now_ms()
	} else {
		app.start_sync(false)
	}
}
