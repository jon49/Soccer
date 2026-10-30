module core

import os
import rand

// Sync and sharing against a real, throwaway TrailBase (the e2e suite's
// backend). Skipped unless SOCCER_TEST_SERVER and SOCCER_TEST_DB are set:
//
//   E2E_API_PORT=4011 ../e2e/backend.sh &
//   SOCCER_TEST_SERVER=http://localhost:4011 \
//   SOCCER_TEST_DB=../e2e/.depot/data/main.db v test core

const test_password = 'E2eTest!12345'

fn live_server() ?string {
	server := os.getenv('SOCCER_TEST_SERVER')
	return if server == '' || os.getenv('SOCCER_TEST_DB') == '' { none } else { server }
}

fn sql(query string) string {
	res := os.exec(['sqlite3', os.getenv('SOCCER_TEST_DB'), query])
	assert res.exit_code == 0, res.output
	return res.output.trim_space()
}

// new_coach registers a verified user and logs a fresh device in.
fn new_coach(server string) !&Store {
	email := 'native-${rand.ulid().to_lower()}@example.com'
	register(server, email, test_password, test_password)!
	sql("PRAGMA ignore_check_constraints = ON; UPDATE _user SET email = unverified_email, unverified_email = NULL WHERE unverified_email = '${email}';")
	return device(server, email)
}

fn device(server string, email string) !&Store {
	mut s := memory_store()
	s.settings.server_url = server
	s.auth = login(server, email, test_password)!
	return s
}

fn sync_now(mut s Store) !SyncOutcome {
	req := s.begin_sync(true)
	out := s.finish_sync(req, perform_sync(req))!
	if out.status == 403 {
		probe := s.begin_sync(false)
		s.finish_sync(probe, perform_sync(probe))!
		retry := s.begin_sync(true)
		return s.finish_sync(retry, perform_sync(retry))!
	}
	return out
}

fn test_sync_between_devices_and_coaches() {
	server := live_server() or {
		println('skipped: set SOCCER_TEST_SERVER and SOCCER_TEST_DB')
		return
	}
	mut a := new_coach(server)!
	if _ := login(server, a.auth.email, 'wrong-password') {
		assert false, 'a wrong password must fail'
	}

	// Coach A builds a team and plays a game on their first device.
	team := a.team_create('Hawks', '2026')!
	a.player_create(team.id, 'Ava')!
	a.player_create(team.id, 'Ben')!
	mut t := a.team_get(team.id)!
	t.games << Game{
		id:       1
		date:     '2026-11-01'
		time:     '10:00'
		opponent: 'Owls'
	}
	a.team_save(t)!
	a.positions_save(team.id, Positions{
		positions: [['GK']]
	})!
	a.move_to_position(team.id, 1, 1, 0, 1000)!
	a.swap(team.id, 1, 0, 1000)!
	a.game_clock(team.id, 1, .start, 2000)!
	a.score_point(team.id, 1, 1, 1)!
	a.game_clock(team.id, 1, .end, 62_000)!
	a.game_notes_save(team.id, 1, 'Good game')!
	assert a.pending.len > 0
	sync_now(mut a)!
	assert a.pending.len == 0, 'everything uploaded: ${a.pending.keys()}'
	assert a.team_get(team.id)!.rev > 0

	// The server stores keys exactly as the web client sends them.
	keys := sql("SELECT key FROM user_data WHERE app = 'soccer' AND user = (SELECT id FROM _user WHERE email = '${a.auth.email}') ORDER BY key;")
	assert keys.contains('"teams"')
	assert keys.contains('["team",1]')
	assert keys.contains('["player-game",1,1,1]')
	assert keys.contains('["game-state",1,1]')

	// A second device of coach A gets it all.
	mut a2 := device(server, a.auth.email)!
	out := sync_now(mut a2)!
	assert out.status == 200
	m := a2.match_get(team.id, 1)!
	assert m.state.points == 1 && m.state.is_ended()
	assert m.players[0].total() == 60_000
	assert a2.game_notes_get(team.id, 1).notes == 'Good game'
	assert sync_now(mut a2)!.status == 204

	// An edit on one device reaches the other; the last write wins.
	a2.game_points_change(team.id, 1, true, 2)!
	sync_now(mut a2)!
	sync_now(mut a)!
	assert a.game_state_get(team.id, 1, none).opponent_points == 2

	// Coach A shares the team.
	created := space_create(server, a.auth)
	assert created.ok, created.message
	space := any_str(as_map(created.json)['space'] or { '' }).to_lower()
	a.team_move(team.id, space, none)!
	sync_now(mut a)!
	assert a.pending.len == 0, 'shared rows uploaded: ${a.pending.keys()}'
	shared, _ := a.teams_all(.all)
	assert shared.map(it.id) == [space]
	members := members_from(space_members(server, a.auth, space))
	assert members.len == 1 && members[0].me

	// A's other device learns about the move.
	sync_now(mut a2)!
	assert is_moved_team(a2.get(team_key(team.id))?)
	moved, _ := a2.teams_all(.all)
	assert moved.map(it.id) == [space]
	assert a2.match_get(space, 1)!.state.points == 1

	// Coach B joins with an invite and sees the team.
	mut b := new_coach(server)!
	invite := space_invite_create(server, a.auth, space)
	assert invite.ok, invite.message
	code := any_str(as_map(invite.json)['code'] or { '' })
	preview := invite_preview(server, b.auth, code)
	assert preview.ok
	assert any_str(as_map(preview.json)['invitedBy'] or { '' }) == a.auth.email
	accepted := invite_accept(server, b.auth, code)
	assert accepted.ok, accepted.message
	sync_now(mut b)!
	assert space in b.settings.spaces
	bt := b.team_get(space)!
	assert bt.name == 'Hawks' && bt.players.len == 2

	// B edits the shared team; A sees it.
	b.player_create(space, 'Cleo')!
	sync_now(mut b)!
	sync_now(mut a)!
	assert a.team_get(space)!.players.len == 3

	// Either coach can publish the shared team's schedule.
	states := b.game_states_get(space, bt.games)
	html := render_schedule_html(b.team_get(space)!, states, b.schedule_goals(bt, states))
	guid := new_uuid()
	published := publish_schedule(server, b.auth, guid, space, html)
	assert published.ok, published.message

	// A removes B; B's next sync drops the team.
	b_user := members_from(space_members(server, a.auth, space)).filter(!it.me)[0].user
	assert space_member_remove(server, a.auth, space, b_user).ok
	gone := sync_now(mut b)!
	assert gone.messages == ['You no longer have access to "Hawks".']
	assert b.get(team_key(space)) == none
	assert space !in b.settings.spaces

	// An edit to a team we've lost is refused (403), dropped, and the
	// next round goes through.
	b.put(team_key(space), bt.to_any(), true)!
	b.settings.spaces[space] = 0
	b.player_create('1', 'x') or {}
	sync_now(mut b)!
	assert b.get(team_key(space)) == none
	assert b.pending.len == 0

	// Logging out ends the session.
	logout(server, a.auth.refresh_token)
}
