module main

import gg
import os
import time
import sokol.sapp
import core

// A scripted driver for checking the app by eye without a person at the
// keyboard: `soccer --script steps.txt` runs one step per frame. Steps:
//
//   click X Y | rclick X Y | down X Y | up X Y   pointer, in layout units
//   type TEXT                                  typed characters
//   key NAME [ctrl|alt|shift]                  enter, tab, escape, a-z, ...
//   wait N | sleep MS                          frames / milliseconds
//   shot FILE.png                              screenshot
//   go SCREEN [TEAM [GAME]]                    open a screen directly
//   quit
//
// `--demo` fills an empty data folder with a team, players, a formation
// and a game in progress, for screenshots.

struct Autopilot {
mut:
	steps []string
	next  int
	wait  int
	up_at ?Point
}

struct Point {
	x f32
	y f32
}

fn load_script(path string) !Autopilot {
	lines := os.read_lines(path)!
	return Autopilot{
		steps: lines.map(it.trim_space()).filter(it != '' && !it.starts_with('#'))
	}
}

fn mouse(typ sapp.EventType, button gg.MouseButton, x f32, y f32) gg.Event {
	return gg.Event{
		typ:          typ
		mouse_button: button
		mouse_x:      x
		mouse_y:      y
	}
}

// step runs the next step after a frame is drawn.
fn (mut app App) autopilot_step() {
	mut ap := app.autopilot or { return }
	defer {
		app.autopilot = ap
		app.gg.refresh_ui()
	}
	if p := ap.up_at {
		app.ui.handle_event(mouse(.mouse_up, .left, p.x, p.y))
		ap.up_at = none
		return
	}
	if ap.wait > 0 {
		ap.wait--
		return
	}
	if ap.next >= ap.steps.len {
		exit(0)
	}
	line := ap.steps[ap.next]
	ap.next++
	parts := line.split(' ')
	cmd := parts[0]
	x := if parts.len > 1 { parts[1].f32() } else { f32(0) }
	y := if parts.len > 2 { parts[2].f32() } else { f32(0) }
	match cmd {
		'click' {
			app.ui.handle_event(mouse(.mouse_move, .invalid, x, y))
			app.ui.handle_event(mouse(.mouse_down, .left, x, y))
			ap.up_at = Point{x, y}
		}
		'rclick' {
			app.ui.handle_event(mouse(.mouse_down, .right, x, y))
			app.ui.handle_event(mouse(.mouse_up, .right, x, y))
		}
		'down' {
			app.ui.handle_event(mouse(.mouse_move, .invalid, x, y))
			app.ui.handle_event(mouse(.mouse_down, .left, x, y))
		}
		'up' {
			app.ui.handle_event(mouse(.mouse_up, .left, x, y))
		}
		'type' {
			for r in line.all_after('type ').runes() {
				app.ui.handle_event(gg.Event{
					typ:       .char
					char_code: u32(r)
				})
			}
		}
		'key' {
			code := match parts[1] or { '' } {
				'enter' { gg.KeyCode.enter }
				'tab' { gg.KeyCode.tab }
				'escape' { gg.KeyCode.escape }
				'backspace' { gg.KeyCode.backspace }
				'down' { gg.KeyCode.down }
				'left' { gg.KeyCode.left }
				'right' { gg.KeyCode.right }
				'up' { gg.KeyCode.up }
				'page_down' { gg.KeyCode.page_down }
				'space' { gg.KeyCode.space }
				else { letter_key(parts[1] or { '' }) }
			}
			mods := match parts[2] or { '' } {
				'ctrl' { u32(2) }
				'alt' { u32(4) }
				'shift' { u32(1) }
				else { u32(0) }
			}
			app.ui.handle_event(gg.Event{
				typ:       .key_down
				key_code:  code
				modifiers: mods
			})
		}
		'wait' {
			ap.wait = int(x)
		}
		'sleep' {
			time.sleep(int(x) * time.millisecond)
		}
		'shot' {
			sapp.screenshot_png(parts[1] or { 'shot.png' }) or { eprintln('screenshot: ${err}') }
		}
		'go' {
			screen := screen_named(parts[1] or { '' })
			app.go(Route{
				screen:  screen
				team_id: parts[2] or { '' }
				game_id: (parts[3] or { '0' }).int()
			})
		}
		'quit' {
			exit(0)
		}
		else {
			eprintln('autopilot: unknown step "${line}"')
		}
	}
}

fn screen_named(name string) Screen {
	$for v in Screen.values {
		if v.name == name || v.name == name + '_' {
			return v.value
		}
	}
	return .teams
}

// seed_demo fills an empty store with a team mid-game.
fn seed_demo(mut s core.Store) ! {
	if s.records.len > 0 {
		return
	}
	team := s.team_create('Hawks', '2026')!
	for name in ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivan', 'June'] {
		s.player_create(team.id, name)!
	}
	mut t := s.team_get(team.id)!
	for i, mut p in t.players {
		p.number = i * 3 + 2
	}
	today := core.today().days()
	t.games << core.Game{
		id:       1
		date:     core.from_days(today - 7).str()
		time:     '09:00'
		home:     true
		opponent: 'Owls'
		location: 'North Field 2'
	}
	t.games << core.Game{
		id:       2
		date:     core.from_days(today).str()
		time:     '10:30'
		opponent: 'Falcons'
		location: 'Riverside Park'
	}
	t.games << core.Game{
		id:       3
		date:     core.from_days(today + 7).str()
		time:     '13:00'
		home:     true
		opponent: 'Bears'
	}
	s.team_save(t)!
	s.positions_save(team.id, core.Positions{
		positions: core.template_positions([1, 2, 3, 1])
	})!
	now := core.now_ms()
	// Last week's game: played and ended.
	start := now - 7 * 24 * 3600_000
	for i in 0 .. 7 {
		s.move_to_position(team.id, 1, i + 1, i, start)!
	}
	s.swap(team.id, 1, 0, start)!
	s.game_clock(team.id, 1, .start, start)!
	s.score_point(team.id, 1, 1, 1)!
	s.score_point(team.id, 1, 3, 1)!
	s.game_points_change(team.id, 1, true, 1)!
	s.move_to_position(team.id, 1, 8, 2, start + 600_000)!
	s.swap(team.id, 1, 0, start + 600_000)!
	s.game_clock(team.id, 1, .end, start + 2400_000)!
	// Today's game: 14 minutes in.
	kick := now - 14 * 60_000
	for i in 0 .. 7 {
		s.move_to_position(team.id, 2, i + 1, i, kick)!
	}
	s.swap(team.id, 2, 0, kick)!
	s.game_clock(team.id, 2, .start, kick)!
	s.move_to_position(team.id, 2, 8, 1, kick + 300_000)!
	s.swap(team.id, 2, 0, kick + 300_000)!
	s.move_to_position(team.id, 2, 9, 4, kick + 600_000)!
	s.player_off(team.id, 2, 10, true, kick)!
	s.score_point(team.id, 2, 2, 1)!
	s.game_points_change(team.id, 2, true, 1)!
	s.game_notes_save(team.id, 2, 'Windy. Press high in the second half.')!
	s.pending.clear()
	s.save()!
}

// letter_key is the key for a single lowercase letter, else invalid.
fn letter_key(name string) gg.KeyCode {
	if name.len == 1 && name[0] >= `a` && name[0] <= `z` {
		return unsafe { gg.KeyCode(int(name[0]) - 32) }
	}
	return .invalid
}
