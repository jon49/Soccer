module main

import gg
import os
import core

// Network calls other than sync. Each runs on a worker thread with a copy
// of what it needs, and reports back on app.job_ch; the store is only
// touched on the UI thread, in on_job_done.

enum JobKind {
	login
	register
	forgot
	share_create
	invite
	members
	remove_member
	leave
	publish
	invite_preview
	invite_accept
}

struct JobDone {
	kind    JobKind
	team_id string
	res     core.ApiResult
	tokens  core.AuthTokens
	error   string
	// publish: the page's guid; remove_member: the coach removed.
	extra string
	// publish: show a message when done (not after ending a game).
	quiet bool
}

// What to do once the sync in flight finishes.
enum AfterSyncKind {
	shared_team // a team was just shared: republish, invite, open it
	joined_team
}

struct AfterSync {
	kind         AfterSyncKind
	team_id      string
	had_schedule bool
}

fn (app &App) is_busy(kind JobKind) bool {
	return app.busy[int(kind)] or { false }
}

fn (mut app App) set_busy(kind JobKind, busy bool) {
	app.busy[int(kind)] = busy
}

fn send_job(ch chan JobDone, done JobDone, ctx &gg.Context) {
	ch <- done
	if ctx != unsafe { nil } {
		mut c := unsafe { ctx }
		c.refresh_ui()
	}
}

// ---- starting jobs ----

fn (mut app App) start_login(email string, password string) {
	if app.is_busy(.login) {
		return
	}
	if email == '' || password == '' {
		app.show_error('Enter your email and password.')
		return
	}
	app.set_busy(.login, true)
	spawn fn (ch chan JobDone, server string, email string, password string, ctx &gg.Context) {
		tokens := core.login(server, email, password) or {
			send_job(ch, JobDone{
				kind:  .login
				error: err.msg()
			}, ctx)
			return
		}
		send_job(ch, JobDone{
			kind:   .login
			tokens: tokens
		}, ctx)
	}(app.job_ch, app.store.settings.server_url, email, password, app.gg)
}

fn (mut app App) start_register(email string, password string, repeat string) {
	if app.is_busy(.register) {
		return
	}
	if email == '' || password == '' {
		app.show_error('Enter your email and a password.')
		return
	}
	if password != repeat {
		app.show_error('Passwords do not match.')
		return
	}
	app.set_busy(.register, true)
	spawn fn (ch chan JobDone, server string, email string, password string, repeat string, ctx &gg.Context) {
		core.register(server, email, password, repeat) or {
			send_job(ch, JobDone{
				kind:  .register
				error: err.msg()
			}, ctx)
			return
		}
		send_job(ch, JobDone{
			kind: .register
		}, ctx)
	}(app.job_ch, app.store.settings.server_url, email, password, repeat, app.gg)
}

fn (mut app App) start_forgot(email string) {
	if app.is_busy(.forgot) {
		return
	}
	if email == '' {
		app.show_error('Enter your email.')
		return
	}
	app.set_busy(.forgot, true)
	spawn fn (ch chan JobDone, server string, email string, ctx &gg.Context) {
		core.request_password_reset(server, email) or {
			send_job(ch, JobDone{
				kind:  .forgot
				error: err.msg()
			}, ctx)
			return
		}
		send_job(ch, JobDone{
			kind: .forgot
		}, ctx)
	}(app.job_ch, app.store.settings.server_url, email, app.gg)
}

// start_api runs one of the authenticated API calls.
fn (mut app App) start_api(kind JobKind, team_id string, arg string) {
	if app.is_busy(kind) {
		return
	}
	app.set_busy(kind, true)
	spawn api_worker(app.job_ch, kind, app.store.settings.server_url, app.store.auth, team_id,
		arg, app.gg)
}

fn api_worker(ch chan JobDone, kind JobKind, server string, auth core.AuthTokens, team_id string, arg string, ctx &gg.Context) {
	res := match kind {
		.share_create { core.space_create(server, auth) }
		.invite { core.space_invite_create(server, auth, team_id) }
		.members { core.space_members(server, auth, team_id) }
		.remove_member { core.space_member_remove(server, auth, team_id, arg) }
		.leave { core.space_member_remove(server, auth, team_id, 'me') }
		.invite_preview { core.invite_preview(server, auth, arg) }
		.invite_accept { core.invite_accept(server, auth, arg) }
		else { core.ApiResult{} }
	}
	send_job(ch, JobDone{
		kind:    kind
		team_id: team_id
		res:     res
		extra:   arg
	}, ctx)
}

// publish_schedule renders the team's schedule page here and uploads it on
// a worker. quiet: only report failures.
fn (mut app App) publish_schedule(team_id string, quiet bool) {
	if app.is_busy(.publish) {
		return
	}
	team := app.store.team_get(team_id) or {
		app.show_error(err.msg())
		return
	}
	states := app.store.game_states_get(team.id, team.games)
	html := core.render_schedule_html(team, states, app.store.schedule_goals(team, states))
	guid := if team.schedule_file_id != '' { team.schedule_file_id } else { core.new_uuid() }
	app.set_busy(.publish, true)
	spawn fn (ch chan JobDone, server string, auth core.AuthTokens, team_id string, guid string, html string, quiet bool, ctx &gg.Context) {
		res := core.publish_schedule(server, auth, guid, team_id, html)
		send_job(ch, JobDone{
			kind:    .publish
			team_id: team_id
			res:     res
			extra:   guid
			quiet:   quiet
		}, ctx)
	}(app.job_ch, app.store.settings.server_url, app.store.auth, team_id, guid, html, quiet,
		app.gg)
}

// ---- results ----

fn (mut app App) on_job_done(job JobDone) {
	app.set_busy(job.kind, false)
	if job.res.new_auth_token != '' {
		app.store.auth.auth_token = job.res.new_auth_token
		app.store.save_auth() or {}
	}
	if job.res.status == 401 && job.kind !in [.login, .register, .forgot] {
		app.store.auth = core.AuthTokens{
			email: app.store.auth.email
		}
		app.store.save_auth() or {}
	}
	match job.kind {
		.login {
			if job.error != '' {
				app.login.error = job.error
				app.show_error(job.error)
				return
			}
			app.store.auth = job.tokens
			app.store.save_auth() or { app.show_error('Could not save the login: ${err}') }
			app.login.password.text = ''
			app.login.error = ''
			app.show_toast('Logged in as ${job.tokens.email}')
			app.start_sync(false)
			if app.route.screen == .login {
				app.back()
			}
		}
		.register {
			if job.error != '' {
				app.register.message = job.error
				app.register.error = true
				return
			}
			app.register.message = 'Registration received. Check your email for a verification link, then log in.'
			app.register.error = false
			app.login.email.text = app.register.email.text
			app.register.password.text = ''
			app.register.repeat.text = ''
		}
		.forgot {
			if job.error != '' {
				app.forgot.message = job.error
				app.forgot.error = true
				return
			}
			app.forgot.message = 'If that email is registered, a reset link will be sent.'
			app.forgot.error = false
		}
		.share_create {
			app.on_space_created(job)
		}
		.invite {
			if !job.res.ok {
				app.show_error('Could not create an invite link. ${job.res.message}')
				return
			}
			code := core.any_str(core.as_map(job.res.json)['code'] or { '' })
			app.share.invite_url = core.invite_url(app.store.settings.server_url, code)
			app.share.copied = false
		}
		.members {
			if app.share.team_id != job.team_id {
				return
			}
			app.share.loading = false
			if !job.res.ok {
				app.share.members_error = job.res.message
				return
			}
			app.share.members_error = ''
			app.share.members = core.members_from(job.res)
		}
		.remove_member {
			if !job.res.ok && job.res.status != 404 {
				app.show_error('Could not remove the coach. ${job.res.message}')
				return
			}
			app.show_toast('Coach removed.')
			app.load_members(job.team_id)
		}
		.leave {
			// 404: we were already removed, or the team is gone. Either way,
			// forget it.
			if !job.res.ok && job.res.status != 404 {
				app.show_error('Could not leave the team. ${job.res.message}')
				return
			}
			app.store.spaces_forget([job.team_id]) or { app.show_error(err.msg()) }
			app.history.clear()
			app.replace(Route{
				screen: .teams
			})
		}
		.publish {
			if !job.res.ok {
				if job.quiet && app.share.team_id == job.team_id {
					// Republishing after sharing: the share screen explains.
					app.share.schedule_error = true
				} else if job.quiet {
					app.show_error('Game ended, but the schedule was not republished: ${job.res.message}')
				} else {
					app.show_error(job.res.message)
				}
				return
			}
			mut team := app.store.team_get(job.team_id) or { return }
			if team.schedule_file_id != job.extra {
				team.schedule_file_id = job.extra
				app.store.team_save(team) or { app.show_error(err.msg()) }
				app.changed()
			}
			if !job.quiet {
				app.show_toast('Schedule published.')
			}
		}
		.invite_preview {
			app.on_invite_preview(job)
		}
		.invite_accept {
			app.on_invite_accepted(job)
		}
	}
}

fn (mut app App) finish_after_sync(ok bool) {
	actions := app.after_sync.clone()
	app.after_sync.clear()
	for a in actions {
		match a.kind {
			.shared_team {
				app.after_share_synced(a)
			}
			.joined_team {
				team := app.store.team_get(a.team_id) or { core.Team{} }
				msg := if team.name != '' {
					'You joined ${team.name} (${team.year}).'
				} else {
					'You joined the team. It will show up after the next sync.'
				}
				app.join.message = msg
				app.show_toast(msg)
			}
		}
	}
	_ = ok
}

// ---- clipboard ----

// The clipboard goes through the platform's tools: gg does not expose
// sokol's clipboard switch.
fn copy_text(text string) bool {
	$if macos {
		return pipe_to('pbcopy', text)
	} $else $if windows {
		return pipe_to('clip', text)
	} $else $if linux {
		if os.getenv('WAYLAND_DISPLAY') != '' && pipe_to('wl-copy', text) {
			return true
		}
		return pipe_to('xclip -selection clipboard', text) || pipe_to('xsel --clipboard --input', text)
	}
	return false
}

fn paste_text() string {
	mut cmds := [][]string{}
	$if macos {
		cmds << ['pbpaste']
	} $else $if windows {
		cmds << ['powershell', '-NoProfile', '-Command', 'Get-Clipboard']
	} $else $if linux {
		if os.getenv('WAYLAND_DISPLAY') != '' {
			cmds << ['wl-paste', '--no-newline']
		}
		cmds << ['xclip', '-selection', 'clipboard', '-o']
		cmds << ['xsel', '--clipboard', '--output']
	}
	for c in cmds {
		os.find_abs_path_of_executable(c[0]) or { continue }
		res := os.exec(c)
		if res.exit_code == 0 {
			return res.output.trim_right('\r\n')
		}
	}
	return ''
}

fn pipe_to(cmd string, text string) bool {
	parts := cmd.split(' ')
	path := os.find_abs_path_of_executable(parts[0]) or { return false }
	mut p := os.new_process(path)
	p.set_args(parts[1..])
	p.set_redirect_stdio()
	p.run()
	p.stdin_write(text)
	// Closing stdin tells the tool the text is complete.
	$if !windows {
		os.fd_close(p.stdio_fd[0])
		p.stdio_fd[0] = -1
	}
	p.wait()
	ok := p.code == 0
	p.close()
	return ok
}
