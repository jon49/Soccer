module core

import os
import json2
import time

const data_file = 'soccer-data.json'
const auth_file = 'auth.json'
pub const default_server_url = 'https://soccer.jnyman.com'

// Store holds every record under its canonical key (see keys.v), like the
// web client's IndexedDB, and persists them as one JSON file. Records with a
// `_rev` sync; changing one through `put` queues it for upload.
@[heap]
pub struct Store {
pub mut:
	dir     string
	records map[string]json2.Any
	// Keys edited locally and not yet uploaded, mapped to the edit sequence
	// number of their latest change.
	pending  map[string]int
	edit_seq int
	settings Settings
	auth     AuthTokens
	sync_log []SyncLogEntry
	// version is bumped on every change so views can cache derived data.
	version int
	// While above 0, changes are not written to disk; see begin_batch.
	batching int
}

// Settings stay on this device and never sync.
pub struct Settings {
pub mut:
	last_synced_id i64
	// Space uuid -> sync cursor for every shared team we're in.
	spaces                        map[string]i64
	last_synced                   i64
	theme                         string // 'light', 'dark' or '' for the system
	disable_auto_sync_during_game bool
	zoom                          f64    = 1.0
	server_url                    string = default_server_url
	bench_hidden                  bool
}

pub struct AuthTokens {
pub mut:
	email         string
	auth_token    string
	refresh_token string
	csrf_token    string
}

pub fn (a AuthTokens) logged_in() bool {
	return a.auth_token != ''
}

pub struct SyncLogEntry {
pub:
	ts      i64
	level   string
	message string
	data    string // JSON
}

pub fn now_ms() i64 {
	return time.now().unix_milli()
}

// default_data_dir picks the per-user application data folder.
pub fn default_data_dir() string {
	if dir := os.getenv_opt('SOCCER_DATA_DIR') {
		return dir
	}
	$if ios {
		return os.join_path(os.home_dir(), 'Documents')
	} $else $if android {
		return os.getenv_opt('ANDROID_DATA_DIR') or { '.' }
	} $else $if windows || macos {
		b := os.config_dir() or { os.home_dir() }
		return os.join_path(b, 'Soccer')
	} $else {
		return os.join_path(os.data_dir(), 'soccer')
	}
}

pub fn open_store(dir string) !&Store {
	os.mkdir_all(dir)!
	mut s := &Store{
		dir: dir
	}
	s.load()!
	return s
}

// memory_store is a store that is never written to disk (for tests).
pub fn memory_store() &Store {
	return &Store{}
}

pub fn (s &Store) data_path() string {
	return os.join_path(s.dir, data_file)
}

fn (mut s Store) load() ! {
	path := s.data_path()
	if os.exists(path) {
		root := as_map(json2.decode[json2.Any](os.read_file(path)!)!)
		for k, v in as_map(field(root, 'records')) {
			s.records[k] = v
		}
		for k, v in as_map(field(root, 'pending')) {
			s.pending[k] = any_int(v)
			if s.pending[k] > s.edit_seq {
				s.edit_seq = s.pending[k]
			}
		}
		st := as_map(field(root, 'settings'))
		s.settings.last_synced_id = any_i64(field(st, 'lastSyncedId'))
		for k, v in as_map(field(st, 'spaces')) {
			s.settings.spaces[k] = any_i64(v)
		}
		s.settings.last_synced = any_i64(field(st, 'lastSynced'))
		s.settings.theme = any_str(field(st, 'theme'))
		s.settings.disable_auto_sync_during_game = any_bool(field(st, 'disableAutoSyncDuringGame'))
		zoom := any_num(field(st, 'zoom'))
		if zoom > 0 {
			s.settings.zoom = zoom
		}
		url := any_str(field(st, 'serverUrl'))
		if url != '' {
			s.settings.server_url = url
		}
		s.settings.bench_hidden = any_bool(field(st, 'benchHidden'))
		for e in any_arr(field(root, 'syncLog')) {
			m := as_map(e)
			s.sync_log << SyncLogEntry{
				ts:      any_i64(field(m, 'ts'))
				level:   any_str(field(m, 'level'))
				message: any_str(field(m, 'message'))
				data:    any_str(field(m, 'data'))
			}
		}
	}
	apath := os.join_path(s.dir, auth_file)
	if os.exists(apath) {
		a := as_map(json2.decode[json2.Any](os.read_file(apath)!)!)
		s.auth = AuthTokens{
			email:         any_str(field(a, 'email'))
			auth_token:    any_str(field(a, 'auth_token'))
			refresh_token: any_str(field(a, 'refresh_token'))
			csrf_token:    any_str(field(a, 'csrf_token'))
		}
	}
}

pub fn (mut s Store) save() ! {
	if s.batching > 0 || s.dir == '' {
		return
	}
	mut records := map[string]json2.Any{}
	mut keys := s.records.keys()
	keys.sort()
	for k in keys {
		records[k] = s.records[k] or { continue }
	}
	mut pending := map[string]json2.Any{}
	for k, v in s.pending {
		pending[k] = v
	}
	mut spaces := map[string]json2.Any{}
	for k, v in s.settings.spaces {
		spaces[k] = v
	}
	st := s.settings
	root := json2.Any({
		'version':  json2.Any(1)
		'records':  records
		'pending':  pending
		'settings': json2.Any({
			'lastSyncedId':              json2.Any(st.last_synced_id)
			'spaces':                    spaces
			'lastSynced':                st.last_synced
			'theme':                     st.theme
			'disableAutoSyncDuringGame': st.disable_auto_sync_during_game
			'zoom':                      st.zoom
			'serverUrl':                 st.server_url
			'benchHidden':               st.bench_hidden
		})
		'syncLog':  s.sync_log.map(json2.Any({
			'ts':      json2.Any(it.ts)
			'level':   it.level
			'message': it.message
			'data':    it.data
		}))
	})
	write_atomic(s.data_path(), root.json_str())!
}

pub fn (mut s Store) save_auth() ! {
	if s.dir == '' {
		return
	}
	path := os.join_path(s.dir, auth_file)
	if !s.auth.logged_in() && s.auth.email == '' {
		if os.exists(path) {
			os.rm(path)!
		}
		return
	}
	a := json2.Any({
		'email':         json2.Any(s.auth.email)
		'auth_token':    s.auth.auth_token
		'refresh_token': s.auth.refresh_token
		'csrf_token':    s.auth.csrf_token
	})
	write_atomic(path, a.json_str())!
	$if !windows {
		os.chmod(path, 0o600) or {}
	}
}

fn write_atomic(path string, text string) ! {
	tmp := path + '.tmp'
	os.write_file(tmp, text)!
	os.mv(tmp, path)!
}

// wipe forgets everything on this device once the account is deleted: the
// records, what was waiting to sync, the sync log and the login. Only the
// device's own preferences stay: theme, text size, bench and server.
pub fn (mut s Store) wipe() ! {
	old := s.settings
	s.records.clear()
	s.pending.clear()
	s.sync_log.clear()
	s.settings = Settings{
		theme:        old.theme
		zoom:         old.zoom
		server_url:   old.server_url
		bench_hidden: old.bench_hidden
	}
	s.auth = AuthTokens{}
	s.version++
	s.save()!
	s.save_auth()!
}

// begin_batch and end_batch wrap several changes so the file is written
// once, at the end.
pub fn (mut s Store) begin_batch() {
	s.batching++
}

pub fn (mut s Store) end_batch() ! {
	if s.batching > 0 {
		s.batching--
	}
	s.save()!
}

// ---- records ----

pub fn (s &Store) get(key string) ?json2.Any {
	return s.records[key] or { return none }
}

// put stores a record. A record with `_rev` is queued for upload unless
// sync is false.
pub fn (mut s Store) put(key string, data json2.Any, sync bool) ! {
	s.records[key] = data
	s.version++
	if sync && has_rev(data) {
		s.queue(key)
	}
	s.save()!
}

pub fn (mut s Store) queue(key string) {
	s.edit_seq++
	s.pending[key] = s.edit_seq
}

pub fn (mut s Store) delete(key string) ! {
	s.records.delete(key)
	s.pending.delete(key)
	s.version++
	s.save()!
}

pub fn (mut s Store) set_settings(st Settings) ! {
	s.settings = st
	s.version++
	s.save()!
}

// ---- sync log (local only, pruned to a week) ----

const sync_log_max_age_ms = i64(7 * 24 * 60 * 60 * 1000)
const sync_log_max = 200

pub fn (mut s Store) log_sync(level string, message string, data string) {
	cutoff := now_ms() - sync_log_max_age_ms
	mut log := s.sync_log.filter(it.ts >= cutoff)
	log << SyncLogEntry{now_ms(), level, message, data}
	if log.len > sync_log_max {
		log = log[log.len - sync_log_max..].clone()
	}
	s.sync_log = log
}

pub fn (s &Store) sync_log_json() string {
	cutoff := now_ms() - sync_log_max_age_ms
	entries := s.sync_log.filter(it.ts >= cutoff).map(json2.Any({
		'ts':      json2.Any(it.ts)
		'time':    time.unix_milli(it.ts).format_rfc3339()
		'level':   it.level
		'message': it.message
		'data':    decode_json(it.data)
	}))
	return json2.encode(json2.Any(entries), prettify: true)
}

// export_json is every synced record keyed by its key, like the web app's
// "Download data as JSON".
pub fn (s &Store) export_json() string {
	mut data := map[string]json2.Any{}
	mut keys := s.records.keys()
	keys.sort()
	for k in keys {
		v := s.records[k] or { continue }
		if !has_rev(v) {
			continue
		}
		name := if k.starts_with('"') { any_str(decode_json(k)) } else { k }
		data[name] = v
	}
	return json2.encode(json2.Any(data), prettify: true)
}

// ---- shared teams: local data ----

// team_move moves personal team `from` into shared team `to` (see
// plan_team_move). With `carry` set, only those keys of `from` carry over;
// with none, all of them do.
pub fn (mut s Store) team_move(from string, to string, carry ?map[string]bool) ! {
	mut entries := []MoveEntry{}
	for k, v in s.records {
		if is_team_key(k, from) {
			entries << MoveEntry{k, v}
		}
	}
	plan := plan_team_move(from, to, entries, carry, s.get(teams_key))
	for k in plan.deletes {
		s.records.delete(k)
	}
	for p in plan.puts {
		s.records[p.key] = p.data
	}
	if t := plan.teams {
		s.records[teams_key] = t
	}
	for k in plan.unqueue {
		s.pending.delete(k)
	}
	for k in plan.queue {
		s.queue(k)
	}
	if to !in s.settings.spaces {
		s.settings.spaces[to] = 0
	}
	s.version++
	s.save()!
}

// spaces_forget: we left these spaces or lost access to them. Deletes every
// local key of those teams and stops tracking them. Returns the teams'
// names, read before they're gone.
pub fn (mut s Store) spaces_forget(removed []string) ![]string {
	if removed.len == 0 {
		return []string{}
	}
	mut names := []string{}
	for space in removed {
		team := s.get(team_key(space)) or { json2.null }
		name := any_str(field(as_map(team), 'name'))
		names << if name == '' { 'a shared team' } else { name }
	}
	for k in s.records.keys() {
		tk := parse_team_key(k) or { continue }
		if tk.team_id in removed {
			s.records.delete(k)
			s.pending.delete(k)
		}
	}
	for k in s.pending.keys() {
		tk := parse_team_key(k) or { continue }
		if tk.team_id in removed {
			s.pending.delete(k)
		}
	}
	for space in removed {
		s.settings.spaces.delete(space)
	}
	s.version++
	s.save()!
	return names
}
