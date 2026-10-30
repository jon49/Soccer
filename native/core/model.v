module core

import json2

// The record shapes match what the web client stores and syncs (see
// src/web/server/db.ts), so both clients share the same TrailBase data.
// Every record keeps the JSON it was read from (`raw`), and writing it back
// starts from that, so fields this client does not know about survive.

fn base(raw map[string]json2.Any) map[string]json2.Any {
	return raw.clone()
}

fn set_or_delete(mut m map[string]json2.Any, name string, keep bool, value json2.Any) {
	if keep {
		m[name] = value
	} else {
		m.delete(name)
	}
}

// ---- teams ----

pub struct TeamPlayer {
pub mut:
	id     int
	active bool
	name   string
	number int // 0: no number
	raw    map[string]json2.Any
}

fn player_from_any(a json2.Any) TeamPlayer {
	m := as_map(a)
	return TeamPlayer{
		id:     any_int(field(m, 'id'))
		active: any_bool(field(m, 'active'))
		name:   any_str(field(m, 'name'))
		number: any_int(field(m, 'number'))
		raw:    m
	}
}

fn (p TeamPlayer) to_any() json2.Any {
	mut m := base(p.raw)
	m['id'] = p.id
	m['active'] = p.active
	m['name'] = p.name
	set_or_delete(mut m, 'number', p.number > 0, p.number)
	return m
}

pub struct Game {
pub mut:
	id       int
	date     string // YYYY-MM-DD
	time     string // HH:MM, or '' for TBD
	home     bool
	opponent string
	location string
	raw      map[string]json2.Any
}

fn game_from_any(a json2.Any) Game {
	m := as_map(a)
	return Game{
		id:       any_int(field(m, 'id'))
		date:     any_str(field(m, 'date'))
		time:     any_str(field(m, 'time'))
		home:     any_bool(field(m, 'home'))
		opponent: any_str(field(m, 'opponent'))
		location: any_str(field(m, 'location'))
		raw:      m
	}
}

fn (g Game) to_any() json2.Any {
	mut m := base(g.raw)
	m['id'] = g.id
	m['date'] = g.date
	set_or_delete(mut m, 'time', g.time != '', g.time)
	m['home'] = g.home
	set_or_delete(mut m, 'opponent', g.opponent != '', g.opponent)
	set_or_delete(mut m, 'location', g.location != '', g.location)
	return m
}

pub struct Team {
pub mut:
	id                  string
	name                string
	active              bool
	year                string
	players             []TeamPlayer
	games               []Game
	basketball_mode     bool
	schedule_file_id    string
	stale_after_minutes int = -1 // -1: not set (the default applies)
	rev                 i64
	raw                 map[string]json2.Any
}

pub fn team_from_any(a json2.Any) Team {
	m := as_map(a)
	return Team{
		id:                  team_id_from_any(field(m, 'id'))
		name:                any_str(field(m, 'name'))
		active:              any_bool(field(m, 'active'))
		year:                any_str(field(m, 'year'))
		players:             any_arr(field(m, 'players')).map(player_from_any(it))
		games:               any_arr(field(m, 'games')).map(game_from_any(it))
		basketball_mode:     any_bool(field(m, 'basketballMode'))
		schedule_file_id:    any_str(field(m, 'scheduleFileId'))
		stale_after_minutes: if has_field(m, 'staleAfterMinutes') {
			any_int(field(m, 'staleAfterMinutes'))
		} else {
			-1
		}
		rev:                 rev_of(a)
		raw:                 m
	}
}

pub fn (t Team) to_any() json2.Any {
	mut m := base(t.raw)
	m['id'] = team_id_any(t.id)
	m['name'] = t.name
	m['active'] = t.active
	m['year'] = t.year
	m['players'] = t.players.map(it.to_any())
	m['games'] = t.games.map(it.to_any())
	if 'positions' !in m {
		m['positions'] = []json2.Any{}
	}
	if '_v' !in m {
		m['_v'] = 0
	}
	set_or_delete(mut m, 'basketballMode', t.basketball_mode || 'basketballMode' in m,
		t.basketball_mode)
	set_or_delete(mut m, 'scheduleFileId', t.schedule_file_id != '', t.schedule_file_id)
	set_or_delete(mut m, 'staleAfterMinutes', t.stale_after_minutes >= 0, t.stale_after_minutes)
	m['_rev'] = t.rev
	return m
}

pub fn (t Team) is_shared() bool {
	return is_shared_team(t.id)
}

pub fn (t Team) title() string {
	return '${t.name} - ${t.year}'
}

pub fn (t Team) player(id int) ?TeamPlayer {
	for p in t.players {
		if p.id == id {
			return p
		}
	}
	return none
}

pub fn (t Team) game(id int) ?Game {
	for g in t.games {
		if g.id == id {
			return g
		}
	}
	return none
}

pub fn (t Team) player_name(id int) string {
	p := t.player(id) or { return '' }
	return p.name
}

// is_moved_team: what's left under ["team", t] after a personal team was
// moved into a shared team.
pub fn is_moved_team(a json2.Any) bool {
	return field(as_map(a), 'movedTo') is string
}

pub fn moved_to(a json2.Any) string {
	return any_str(field(as_map(a), 'movedTo'))
}

pub struct TeamSingle {
pub mut:
	id     string
	name   string
	year   string
	active bool
}

pub struct Teams {
pub mut:
	teams       []TeamSingle
	retired_ids []int
	rev         i64
	raw         map[string]json2.Any
}

pub fn teams_from_any(a json2.Any) Teams {
	m := as_map(a)
	return Teams{
		teams:       any_arr(field(m, 'teams')).map(fn (x json2.Any) TeamSingle {
			t := as_map(x)
			return TeamSingle{
				id:     team_id_from_any(field(t, 'id'))
				name:   any_str(field(t, 'name'))
				year:   any_str(field(t, 'year'))
				active: any_bool(field(t, 'active'))
			}
		})
		retired_ids: any_arr(field(m, 'retiredIds')).map(any_int(it))
		rev:         rev_of(a)
		raw:         m
	}
}

pub fn (t Teams) to_any() json2.Any {
	mut m := base(t.raw)
	m['teams'] = t.teams.map(json2.Any({
		'id':     team_id_any(it.id)
		'name':   json2.Any(it.name)
		'year':   json2.Any(it.year)
		'active': json2.Any(it.active)
	}))
	set_or_delete(mut m, 'retiredIds', t.retired_ids.len > 0, t.retired_ids.map(json2.Any(it)))
	m['_rev'] = t.rev
	return m
}

// ---- games ----

pub struct GameTime {
pub mut:
	start i64 // ms since the epoch; 0: not set
	end   i64
}

fn game_time_from_any(a json2.Any) GameTime {
	m := as_map(a)
	return GameTime{any_i64(field(m, 'start')), any_i64(field(m, 'end'))}
}

fn (t GameTime) to_any() json2.Any {
	mut m := map[string]json2.Any{}
	if t.start != 0 {
		m['start'] = t.start
	}
	if t.end != 0 {
		m['end'] = t.end
	}
	return m
}

// GameState is the frequently-changing slice of a game: its score and clock.
pub struct GameState {
pub mut:
	game_id         int
	status          string // '', 'play', 'paused' or 'ended'
	points          int
	opponent_points int
	game_time       []GameTime
	rev             i64
	raw             map[string]json2.Any
}

pub fn game_state_from_any(a json2.Any) GameState {
	m := as_map(a)
	return GameState{
		game_id:         any_int(field(m, 'gameId'))
		status:          any_str(field(m, 'status'))
		points:          any_int(field(m, 'points'))
		opponent_points: any_int(field(m, 'opponentPoints'))
		game_time:       any_arr(field(m, 'gameTime')).map(game_time_from_any(it))
		rev:             rev_of(a)
		raw:             m
	}
}

pub fn (g GameState) to_any() json2.Any {
	mut m := base(g.raw)
	m['gameId'] = g.game_id
	set_or_delete(mut m, 'status', g.status != '', g.status)
	m['points'] = g.points
	m['opponentPoints'] = g.opponent_points
	m['gameTime'] = g.game_time.map(it.to_any())
	m['_rev'] = g.rev
	return m
}

// game_state_from_legacy reads the score and clock still embedded in games
// created before GameState was split out.
pub fn game_state_from_legacy(game_id int, game ?Game) GameState {
	g := game or {
		return GameState{
			game_id: game_id
		}
	}
	return GameState{
		game_id:         game_id
		status:          any_str(field(g.raw, 'status'))
		points:          any_int(field(g.raw, 'points'))
		opponent_points: any_int(field(g.raw, 'opponentPoints'))
		game_time:       any_arr(field(g.raw, 'gameTime')).map(game_time_from_any(it))
	}
}

pub struct GameNotes {
pub mut:
	notes string
	rev   i64
	raw   map[string]json2.Any
}

pub fn (n GameNotes) to_any() json2.Any {
	mut m := base(n.raw)
	m['notes'] = n.notes
	m['_rev'] = n.rev
	return m
}

// ---- players in a game ----

pub enum StatusKind {
	none_ // no status yet: on the bench
	in_play
	on_deck
	out
	not_playing
}

pub struct PlayerStatus {
pub mut:
	kind     StatusKind
	position int // in_play: the position index
	target   int = -1 // on_deck: the position index it is queued for, or -1
}

pub fn in_play(position int) PlayerStatus {
	return PlayerStatus{
		kind:     .in_play
		position: position
	}
}

pub fn on_deck(target int) PlayerStatus {
	return PlayerStatus{
		kind:   .on_deck
		target: target
	}
}

pub fn status_out() PlayerStatus {
	return PlayerStatus{
		kind: .out
	}
}

pub fn status_not_playing() PlayerStatus {
	return PlayerStatus{
		kind: .not_playing
	}
}

fn status_from_any(a json2.Any) PlayerStatus {
	m := as_map(a)
	return match any_str(field(m, '_')) {
		'inPlay' {
			in_play(any_int(field(m, 'position')))
		}
		'onDeck' {
			t := field(m, 'targetPosition')
			on_deck(if is_null(t) { -1 } else { any_int(t) })
		}
		'out' {
			status_out()
		}
		'notPlaying' {
			status_not_playing()
		}
		else {
			PlayerStatus{}
		}
	}
}

fn (s PlayerStatus) to_any() json2.Any {
	return match s.kind {
		.in_play {
			json2.Any({
				'_':        json2.Any('inPlay')
				'position': s.position
			})
		}
		.on_deck {
			json2.Any({
				'_':              json2.Any('onDeck')
				'targetPosition': if s.target < 0 { json2.null } else { json2.Any(s.target) }
			})
		}
		.out {
			json2.Any({
				'_': json2.Any('out')
			})
		}
		.not_playing {
			json2.Any({
				'_': json2.Any('notPlaying')
			})
		}
		.none_ {
			json2.null
		}
	}
}

pub struct PlayerGameTime {
pub mut:
	start    i64
	end      i64
	position string
}

pub struct StatCount {
pub mut:
	stat_id int
	count   int
}

pub struct PlayerGame {
pub mut:
	player_id int
	game_id   int
	stats     []StatCount
	game_time []PlayerGameTime
	status    PlayerStatus
	rev       i64
}

pub fn player_game_from_any(a json2.Any) PlayerGame {
	m := as_map(a)
	return PlayerGame{
		player_id: any_int(field(m, 'playerId'))
		game_id:   any_int(field(m, 'gameId'))
		stats:     any_arr(field(m, 'stats')).map(fn (x json2.Any) StatCount {
			s := as_map(x)
			return StatCount{any_int(field(s, 'statId')), any_int(field(s, 'count'))}
		})
		game_time: any_arr(field(m, 'gameTime')).map(fn (x json2.Any) PlayerGameTime {
			t := as_map(x)
			return PlayerGameTime{any_i64(field(t, 'start')), any_i64(field(t, 'end')), any_str(field(t,
				'position'))}
		})
		status:    status_from_any(field(m, 'status'))
		rev:       rev_of(a)
	}
}

// to_any writes only the known fields, as the web client's
// PlayerGameTimeCalculator.save does.
pub fn (p PlayerGame) to_any() json2.Any {
	mut m := map[string]json2.Any{}
	m['playerId'] = p.player_id
	m['gameId'] = p.game_id
	m['stats'] = p.stats.map(json2.Any({
		'statId': json2.Any(it.stat_id)
		'count':  it.count
	}))
	m['gameTime'] = p.game_time.map(fn (t PlayerGameTime) json2.Any {
		mut x := map[string]json2.Any{}
		if t.start != 0 {
			x['start'] = t.start
		}
		if t.end != 0 {
			x['end'] = t.end
		}
		x['position'] = t.position
		return x
	})
	if p.status.kind != .none_ {
		m['status'] = p.status.to_any()
	}
	m['_rev'] = p.rev
	return m
}

pub fn (p PlayerGame) stat_count(stat_id int) int {
	for s in p.stats {
		if s.stat_id == stat_id {
			return s.count
		}
	}
	return 0
}

// ---- formation ----

pub struct Positions {
pub mut:
	positions [][]string // rows from the attacking end down to the goalkeeper
	rev       i64
}

pub fn positions_from_any(a json2.Any) Positions {
	m := as_map(a)
	rows := any_arr(field(m, 'positions'))
	mut res := Positions{
		rev: rev_of(a)
	}
	if '_v' in m {
		for row in rows {
			res.positions << any_arr(row).map(any_str(it))
		}
		return res
	}
	// The original shape: a flat list of names and the row sizes.
	flat := rows.map(any_str(it))
	mut i := 0
	for n in any_arr(field(m, 'grid')).map(any_int(it)) {
		end := if i + n > flat.len { flat.len } else { i + n }
		res.positions << flat[i..end].clone()
		i = end
	}
	return res
}

pub fn (p Positions) to_any() json2.Any {
	return json2.Any({
		'_rev':      json2.Any(p.rev)
		'_v':        0
		'positions': p.positions.map(json2.Any(it.map(json2.Any(it))))
	})
}

pub fn (p Positions) flat() []string {
	mut res := []string{}
	for row in p.positions {
		res << row
	}
	return res
}

// ---- stats ----

pub const goal_stat_id = 1

pub const stat_descriptions = {
	'Goal': 'The number of times a player scores.'
}

pub struct Stat {
pub mut:
	id     int
	name   string
	active bool
}

pub struct Stats {
pub mut:
	stats []Stat
	rev   i64
}

pub fn default_stats() Stats {
	mut res := Stats{}
	mut i := 1
	for name, _ in stat_descriptions {
		res.stats << Stat{i, name, true}
		i++
	}
	return res
}

pub fn stats_from_any(a json2.Any) Stats {
	m := as_map(a)
	return Stats{
		stats: any_arr(field(m, 'stats')).map(fn (x json2.Any) Stat {
			s := as_map(x)
			return Stat{any_int(field(s, 'id')), any_str(field(s, 'name')), any_bool(field(s, 'active'))}
		})
		rev:   rev_of(a)
	}
}

pub fn (s Stats) to_any() json2.Any {
	return json2.Any({
		'stats': json2.Any(s.stats.map(json2.Any({
			'id':     json2.Any(it.id)
			'name':   json2.Any(it.name)
			'active': json2.Any(it.active)
		})))
		'_rev':  s.rev
	})
}

pub fn (s Stats) is_active(id int) bool {
	for x in s.stats {
		if x.id == id {
			return x.active
		}
	}
	return false
}

pub fn stat_description(id int) string {
	mut i := 1
	for _, d in stat_descriptions {
		if i == id {
			return d
		}
		i++
	}
	return ''
}
