module core

import json2

// Sync with the same TrailBase endpoint as the web client (sync.ts):
// POST /api/data/soccer with the pending records, our personal cursor and a
// cursor per shared team (space). The server saves every upload (the latest
// write wins), returns what other devices changed since our cursors, and
// lists the spaces we're in. Records of shared teams name their space.
//
// begin_sync and finish_sync run on the UI thread; perform_sync does the
// network part and is safe to call from a worker thread.

const sync_path = '/api/data/soccer'

pub struct SyncRequest {
pub:
	server string
	auth   AuthTokens
	body   string
	// The edit sequence number of every key sent, so a record edited while
	// the request is in flight stays queued.
	sent   map[string]int
	spaces map[string]i64
}

pub struct SyncResponse {
pub:
	status         int
	body           string
	new_auth_token string
	error          string
}

pub struct SyncOutcome {
pub:
	// 200: something changed locally; 204: nothing new; 403: some record
	// names a space we're no longer in (see App's sync rounds).
	status   int
	received int
	messages []string
}

// space_of: a key belongs to a space when its team id is one we're in.
pub fn space_of(key string, spaces map[string]i64) ?string {
	k := parse_team_key(key) or { return none }
	if k.team_id in spaces {
		return k.team_id
	}
	return none
}

// begin_sync builds the request. With with_data false it only asks for
// changes and membership (used to learn the current spaces after a 403).
pub fn (s &Store) begin_sync(with_data bool) SyncRequest {
	mut items := []json2.Any{}
	mut sent := map[string]int{}
	if with_data {
		mut keys := s.pending.keys()
		keys.sort()
		for key in keys {
			data := s.get(key) or { continue }
			mut item := {
				'key':  key_any(key)
				'data': data
				'id':   json2.Any(rev_of(data))
			}
			if space := space_of(key, s.settings.spaces) {
				item['space'] = space
			}
			items << json2.Any(item)
			sent[key] = s.pending[key]
		}
	}
	mut spaces := map[string]json2.Any{}
	for k, v in s.settings.spaces {
		spaces[k] = v
	}
	body := json2.Any({
		'lastSyncedId': json2.Any(s.settings.last_synced_id)
		'spaces':       spaces
		'data':         items
	})
	return SyncRequest{
		server: s.settings.server_url
		auth:   s.auth
		body:   body.json_str()
		sent:   sent
		spaces: s.settings.spaces.clone()
	}
}

pub fn perform_sync(req SyncRequest) SyncResponse {
	res := auth_request(.post, req.server, sync_path, req.body, req.auth)
	if res.status == 0 {
		return SyncResponse{
			error:          res.message
			new_auth_token: res.new_auth_token
		}
	}
	return SyncResponse{
		status:         res.status
		body:           if res.ok { res.json.json_str() } else { '' }
		new_auth_token: res.new_auth_token
	}
}

// finish_sync applies the server's response.
pub fn (mut s Store) finish_sync(req SyncRequest, res SyncResponse) !SyncOutcome {
	if res.new_auth_token != '' {
		s.auth.auth_token = res.new_auth_token
		s.save_auth()!
	}
	if res.error != '' {
		s.log_sync('error', 'sync request failed', json2.Any(res.error).json_str())
		s.save()!
		return error('Could not reach the server. ${res.error}')
	}
	match res.status {
		200...299 {}
		401 {
			s.auth = AuthTokens{
				email: s.auth.email
			}
			s.save_auth()!
			return error('You are not logged in!')
		}
		403 {
			s.log_sync('info', 'sync refused (403); refreshing space membership', '')
			s.save()!
			return SyncOutcome{
				status: 403
			}
		}
		502 {
			return error('The server is currently down. Try again later.')
		}
		503 {
			return error('Hold your horses! You are syncing too fast!')
		}
		else {
			s.log_sync('error', 'sync response not ok', '{"status":${res.status}}')
			s.save()!
			return error('Sync failed (HTTP ${res.status}).')
		}
	}
	root := as_map(decode_json(res.body))
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}

	// Rows other devices changed.
	mut incoming := []MoveEntry{}
	for item in any_arr(field(root, 'data')) {
		m := as_map(item)
		key := canon(parse_json_text(field(m, 'key')))
		data := with_rev(parse_json_text(field(m, 'data')), any_i64(field(m, 'id')))
		incoming << MoveEntry{key, data}
	}
	mut conflicted := []MoveEntry{}
	for item in any_arr(field(root, 'conflicted')) {
		m := as_map(item)
		conflicted << MoveEntry{canon(parse_json_text(field(m, 'key'))), parse_json_text(field(m,
			'data'))}
	}

	// A personal team moved into a shared team (by this user on another
	// device) leaves a tombstone on ["team", t]; its old rows are dead.
	mut all_rows := incoming.clone()
	all_rows << conflicted
	moves := moves_in(all_rows)
	mut moved_ids := moves.map(it.from)
	for e in incoming {
		k := parse_team_key(e.key) or { continue }
		if is_shared_team(k.team_id) || k.team_id in moved_ids {
			continue
		}
		if local := s.get(team_key(k.team_id)) {
			if is_moved_team(local) {
				moved_ids << k.team_id
			}
		}
	}
	mut received := 0
	for e in incoming {
		if k := parse_team_key(e.key) {
			if k.team_id in moved_ids {
				continue
			}
		}
		// Keep a local edit that hasn't been uploaded yet; it goes up next.
		if e.key in s.pending {
			continue
		}
		s.records[e.key] = e.data
		received++
	}

	// Stamp the new revisions on what the server saved, and dequeue the
	// records that weren't edited while the request was in flight.
	for item in any_arr(field(root, 'saved')) {
		m := as_map(item)
		key := canon(parse_json_text(field(m, 'key')))
		if data := s.records[key] {
			s.records[key] = with_rev(data, any_i64(field(m, 'id')))
		} else {
			s.log_sync('error', 'could not find key to update revision', json2.Any(key).json_str())
			continue
		}
		if seq := s.pending[key] {
			if req.sent[key] or { -1 } == seq {
				s.pending.delete(key)
			}
		}
	}
	if any_arr(field(root, 'conflicted')).len > 0 {
		s.log_sync('info', "another device also changed these; this device's version was saved over theirs",
			json2.Any(conflicted.map(json2.Any(it.key))).json_str())
	}

	// Spaces: the server's list is the truth. Anything we tracked that it
	// leaves out means we were removed or the space was deleted.
	mut remote := map[string]i64{}
	for k, v in as_map(field(root, 'spaces')) {
		remote[k] = any_i64(v)
	}
	added := remote.keys().filter(it !in req.spaces)
	removed := req.spaces.keys().filter(it !in remote)
	names := s.spaces_forget(removed)!
	messages := names.map('You no longer have access to "${it}".')
	mut spaces := map[string]i64{}
	// Keep a space added locally while this request was in flight (a team
	// shared just now); the server didn't know about it yet.
	for k, v in s.settings.spaces {
		if k !in req.spaces {
			spaces[k] = v
		}
	}
	for k, v in remote {
		spaces[k] = v
	}
	s.settings.spaces = spaces
	last := any_i64(field(root, 'lastSyncedId'))
	if 'lastSyncedId' in root {
		s.settings.last_synced_id = last
	}
	s.settings.last_synced = now_ms()

	// Unsynced edits to a moved team, including the ones just sent as
	// personal rows, carry over into the shared team.
	if moves.len > 0 {
		mut carry := map[string]bool{}
		for k, _ in req.sent {
			carry[k] = true
		}
		for k, _ in s.pending {
			carry[k] = true
		}
		for mv in moves {
			if mv.to in remote {
				s.team_move(mv.from, mv.to, carry)!
			} else {
				s.team_move(mv.from, mv.to, map[string]bool{})!
			}
		}
	}

	s.version++
	s.log_sync('info', 'sync complete', json2.Any({
		'received':      json2.Any(received)
		'saved':         any_arr(field(root, 'saved')).len
		'lastSyncedId':  last
		'spacesAdded':   json2.Any(added.map(json2.Any(it)))
		'spacesRemoved': json2.Any(removed.map(json2.Any(it)))
		'pendingAfter':  s.pending.len
	}).json_str())
	changed := received > 0 || added.len > 0 || removed.len > 0 || moves.len > 0
	return SyncOutcome{
		status:   if changed { 200 } else { 204 }
		received: received
		messages: messages
	}
}
