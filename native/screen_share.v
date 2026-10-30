module main

import core
import gui

// Sharing a team with other coaches (pages/share.page.ts).

struct ShareForm {
mut:
	team_id       string
	members       []core.SpaceMember
	members_error string
	loading       bool
	invite_url    string
	copied        bool
	// The schedule could not be republished for the shared team.
	schedule_error bool
}

fn (mut app App) load_share() {
	tid := app.route.team_id
	if app.share.team_id != tid {
		app.share = ShareForm{
			team_id: tid
		}
	}
	if core.is_shared_team(tid) {
		app.load_members(tid)
	}
}

fn (mut app App) load_members(team_id string) {
	if !app.store.auth.logged_in() {
		app.share.members_error = 'You need to log in first.'
		return
	}
	app.share.loading = true
	app.start_api(.members, team_id, '')
}

fn (mut app App) draw_share(x f32, y0 f32, w f32) f32 {
	mut ui := app.ui
	t := ui.theme
	team := app.store.team_get(app.route.team_id) or { return y0 }
	bh := ui.button_height()
	lh := ui.line_height(0)
	mut y := app.heading(x, y0, 'Share ${team.name} (${team.year})')
	if !team.is_shared() {
		y = app.paragraph(x, y, w, 'Sharing gives another coach full access to this team: players, games, matches, and stats. Every coach on a shared team can edit it, invite others, and remove anyone. Only one coach should run a given match.',
			false)
		y = app.paragraph(x, y, w, 'You need to be online and logged in to share.', true)
		label := if app.is_busy(.share_create) { 'Sharing…' } else { 'Share this team' }
		sw := ui.button_width('Share this team')
		if ui.button(gui.Rect{x, y, sw, bh}, label, .primary) {
			app.share_team(team.id)
		}
		return y + bh
	}

	if app.share.schedule_error {
		y = app.paragraph(x, y, w, "The published schedule could not be moved to the shared team. Other coaches can't republish it until you republish it from the Games page.",
			false)
	}
	invite_label := if app.share.invite_url != '' {
		'Create another invite link'
	} else {
		'Invite another coach'
	}
	iw := ui.button_width(invite_label)
	if ui.button(gui.Rect{x, y, iw, bh}, invite_label, .primary) {
		app.start_api(.invite, team.id, '')
	}
	y += bh + 12
	if app.share.invite_url != '' {
		y = app.paragraph(x, y, w, 'Send this link to the coach you want to add. It works for one person and expires in 7 days.',
			false)
		box := gui.Rect{x, y, w, ui.field_height()}
		ui.rounded(box, 6, t.input_bg)
		ui.rounded_border(box, 6, t.border)
		ui.push_clip(box.inset(10, 0))
		ui.text(x + 10, y + box.h / 2, app.share.invite_url, gui.TextStyle{ valign: .middle })
		ui.pop_clip()
		y += box.h + 8
		copy_label := if app.share.copied { 'Copied!' } else { 'Copy' }
		cw := ui.button_width('Copied!')
		if ui.button(gui.Rect{x, y, cw, bh}, copy_label, .outline) {
			if copy_text(app.share.invite_url) {
				app.share.copied = true
			} else {
				app.show_error('Could not copy. Install wl-clipboard or xclip, or copy the link by hand.')
			}
		}
		ow := ui.button_width('Open')
		if ui.button(gui.Rect{x + cw + 8, y, ow, bh}, 'Open', .outline) {
			open_in_browser(app.share.invite_url)
		}
		y += bh + 12
	}

	y += 10
	y = app.subheading(x, y, 'Coaches on this team')
	if app.share.loading && app.share.members.len == 0 {
		return app.paragraph(x, y, w, 'Loading…', true)
	}
	if app.share.members_error != '' {
		return app.paragraph(x, y, w, 'Could not load who this team is shared with. ${app.share.members_error}',
			false)
	}
	last := app.share.members.len <= 1
	for m in app.share.members {
		row := gui.Rect{x, y, w, bh + 12}
		ui.hline(x, row.bottom(), w, t.border)
		label := if m.me { '${m.email} (you)' } else { m.email }
		btn := if m.me { 'Leave team' } else { 'Remove' }
		bw := ui.button_width(btn)
		ui.text(x, y + row.h / 2, ui.fit(label, w - bw - 16, gui.TextStyle{}), gui.TextStyle{
			valign: .middle
		})
		if ui.button(gui.Rect{x + w - bw, y + 6, bw, bh}, btn, .outline) {
			if m.me {
				app.ask(Confirm{
					message: if last {
						"You're the only coach on this team. Leaving deletes the team and all its games for good. Leave anyway?"
					} else {
						'Leave this team? It will be removed from this device.'
					}
					yes:     'Leave team'
					action:  .leave_team
					team_id: team.id
				})
			} else {
				app.ask(Confirm{
					message: 'Remove ${m.email} from this team? They lose access the next time they sync.'
					yes:     'Remove'
					action:  .remove_coach
					team_id: team.id
					user:    m.user
				})
			}
		}
		y += row.h + 1
	}
	_ = lh
	return y
}

// share_team: create a space, move the team into it, sync, then republish
// the schedule (so every coach can update it) and make an invite.
fn (mut app App) share_team(team_id string) {
	if !app.store.auth.logged_in() {
		app.show_error('Log in to share a team.')
		app.go(Route{
			screen: .login
		})
		return
	}
	app.start_api(.share_create, team_id, '')
}

fn (mut app App) on_space_created(job JobDone) {
	if !job.res.ok {
		app.show_error('Could not share the team. ${job.res.message}')
		return
	}
	space := core.any_str(core.as_map(job.res.json)['space'] or { '' }).to_lower()
	team := app.store.team_get(job.team_id) or {
		app.show_error(err.msg())
		return
	}
	app.store.team_move(job.team_id, space, none) or {
		app.show_error(err.msg())
		return
	}
	app.after_sync << AfterSync{
		kind:         .shared_team
		team_id:      space
		had_schedule: team.schedule_file_id != ''
	}
	// The old team's screens are gone; show the shared one.
	app.history = app.history.filter(it.team_id != job.team_id)
	app.share = ShareForm{
		team_id: space
	}
	app.replace(Route{
		screen:  .share
		team_id: space
	})
	if app.syncing {
		app.sync_due = now_ms()
	} else {
		app.start_sync(false)
	}
}

fn (mut app App) after_share_synced(a AfterSync) {
	if a.had_schedule {
		app.publish_schedule(a.team_id, true)
	}
	app.start_api(.invite, a.team_id, '')
	if app.route.screen == .share && app.route.team_id == a.team_id {
		app.load_members(a.team_id)
	}
}

fn (mut app App) share_leave(team_id string) {
	app.start_api(.leave, team_id, '')
}

fn (mut app App) share_remove(team_id string, user string) {
	app.start_api(.remove_member, team_id, user)
}
