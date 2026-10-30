module core

// Typed reads and writes of the records, following the web client's
// repo-team.ts and repo-player-game.ts. Errors carry a message for the user.

// equals compares names the way the web app does: ignoring case.
pub fn equals(a string, b string) bool {
	return a.to_lower() == b.to_lower()
}

pub fn new_id(ids []int) int {
	mut m := 0
	for id in ids {
		if id > m {
			m = id
		}
	}
	return m + 1
}

// ---- teams ----

pub fn (s &Store) teams_doc() Teams {
	return teams_from_any(s.get(teams_key) or { return Teams{} })
}

pub fn (s &Store) team_get(team_id string) !Team {
	data := s.get(team_key(team_id)) or {
		return error('Could not find team with id: "${team_id}".')
	}
	if is_moved_team(data) {
		return error('This team is now a shared team. Open it from the teams list.')
	}
	return team_from_any(data)
}

pub enum TeamFilter {
	all
	active
	inactive
}

// teams_all lists personal teams (from the teams doc) and shared teams
// (every space we're in), newest year first, then by name. It also returns
// how many teams there are before filtering.
pub fn (s &Store) teams_all(filter TeamFilter) ([]Team, int) {
	mut ids := s.teams_doc().teams.map(it.id)
	for space, _ in s.settings.spaces {
		ids << space
	}
	mut all := []Team{}
	for id in ids {
		data := s.get(team_key(id)) or { continue }
		if is_moved_team(data) {
			continue
		}
		all << team_from_any(data)
	}
	mut teams := all.filter(match filter {
		.all { true }
		.active { it.active }
		.inactive { !it.active }
	})
	teams.sort_with_compare(fn (a &Team, b &Team) int {
		if a.year != b.year {
			return if a.year > b.year { -1 } else { 1 }
		}
		an := a.name.to_lower()
		bn := b.name.to_lower()
		return if an < bn {
			-1
		} else if an > bn {
			1
		} else {
			0
		}
	})
	return teams, all.len
}

pub fn (mut s Store) team_save(team Team) ! {
	all, _ := s.teams_all(.all)
	mut renamed := true
	for t in all {
		if t.id == team.id {
			renamed = !equals(t.name, team.name) || !equals(t.year, team.year)
		}
	}
	// Only a rename can create a duplicate. Joining a shared team can bring
	// in one with the same name as a personal team, and that mustn't block
	// saving either of them.
	if renamed {
		for t in all {
			if t.id != team.id && equals(t.name, team.name) && equals(t.year, team.year) {
				return error('The team "${team.name} - ${team.year}" already exists.')
			}
		}
	}
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	s.put(team_key(team.id), team.to_any(), true)!
	if team.is_shared() {
		return
	}
	mut doc := s.teams_doc()
	mut found := false
	for mut t in doc.teams {
		if t.id == team.id {
			t.name = team.name
			t.year = team.year
			t.active = team.active
			found = true
		}
	}
	if !found {
		return error('Could not find team with id: ${team.id}.')
	}
	s.put(teams_key, doc.to_any(), true)!
}

// new_team_id skips shared (uuid) ids and any id retired by moving that
// team into a shared one.
fn new_team_id(doc Teams) int {
	mut ids := doc.teams.filter(!is_shared_team(it.id)).map(it.id.int())
	ids << doc.retired_ids
	return new_id(ids)
}

pub fn (mut s Store) team_create(name string, year string) !Team {
	n := check_text('Team Name', name, 25)!
	y := check_text('Team Year', year, 25)!
	all, _ := s.teams_all(.all)
	for t in all {
		if equals(t.name, n) && equals(t.year, y) {
			return error('The team "${n} - ${y}" already exists.')
		}
	}
	mut doc := s.teams_doc()
	id := new_team_id(doc).str()
	team := Team{
		id:     id
		name:   n
		year:   y
		active: true
	}
	doc.teams << TeamSingle{id, n, y, true}
	s.begin_batch()
	defer {
		s.end_batch() or {}
	}
	s.put(teams_key, doc.to_any(), true)!
	s.put(team_key(id), team.to_any(), true)!
	return team
}

pub fn (mut s Store) player_create(team_id string, name string) !TeamPlayer {
	n := check_text('Player Name', name, 25)!
	mut team := s.team_get(team_id)!
	for p in team.players {
		if equals(p.name, n) {
			return error('The player name "${p.name}" has already been chosen.')
		}
	}
	player := TeamPlayer{
		id:     new_id(team.players.map(it.id))
		active: true
		name:   n
	}
	team.players << player
	s.team_save(team)!
	return player
}

// check_text validates a required text field of at most `max` characters.
pub fn check_text(label string, value string, max int) !string {
	v := value.trim_space()
	if v == '' {
		return error('"${label}" is required.')
	}
	if v.runes().len > max {
		return error('"${label}" must be ${max} characters or fewer.')
	}
	return v
}

pub fn check_optional_text(label string, value string, max int) !string {
	v := value.trim_space()
	if v.runes().len > max {
		return error('"${label}" must be ${max} characters or fewer.')
	}
	return v
}

// ---- game notes and state ----

pub fn (s &Store) game_notes_get(team_id string, game_id int) GameNotes {
	data := s.get(game_notes_key(team_id, game_id)) or { return GameNotes{} }
	m := as_map(data)
	return GameNotes{
		notes: any_str(field(m, 'notes'))
		rev:   rev_of(data)
		raw:   m
	}
}

pub fn (mut s Store) game_notes_save(team_id string, game_id int, notes string) ! {
	mut n := s.game_notes_get(team_id, game_id)
	if n.notes == notes && n.raw.len > 0 {
		return
	}
	n.notes = notes
	s.put(game_notes_key(team_id, game_id), n.to_any(), true)!
}

// game_state_get returns the game's own state record, or reads the legacy
// fields still embedded in the team's game.
pub fn (s &Store) game_state_get(team_id string, game_id int, game ?Game) GameState {
	if data := s.get(game_state_key(team_id, game_id)) {
		return game_state_from_any(data)
	}
	if g := game {
		return game_state_from_legacy(game_id, g)
	}
	team := s.team_get(team_id) or { return game_state_from_legacy(game_id, none) }
	return game_state_from_legacy(game_id, team.game(game_id))
}

pub fn (mut s Store) game_state_save(team_id string, state GameState) ! {
	s.put(game_state_key(team_id, state.game_id), state.to_any(), true)!
}

pub fn (s &Store) game_states_get(team_id string, games []Game) []GameState {
	return games.map(s.game_state_get(team_id, it.id, it))
}

// ---- players in a game ----

pub fn (mut s Store) player_game_save(team_id string, pg PlayerGame) ! {
	s.put(player_game_key(team_id, pg.player_id, pg.game_id), pg.to_any(), true)!
}

pub fn (s &Store) player_game_get(team_id string, game_id int, player_id int) PlayerGame {
	data := s.get(player_game_key(team_id, player_id, game_id)) or {
		return PlayerGame{
			player_id: player_id
			game_id:   game_id
		}
	}
	return player_game_from_any(data)
}

// player_games_get returns a record for each player, empty for players with
// none yet.
pub fn (s &Store) player_games_get(team_id string, game_id int, player_ids []int) []PlayerGame {
	return player_ids.map(s.player_game_get(team_id, game_id, it))
}

pub fn (s &Store) player_game_exists(team_id string, game_id int, player_id int) bool {
	return player_game_key(team_id, player_id, game_id) in s.records
}

// ---- formation ----

pub fn (s &Store) positions_get(team_id string) Positions {
	return positions_from_any(s.get(positions_key(team_id)) or { return Positions{} })
}

pub fn (mut s Store) positions_save(team_id string, p Positions) ! {
	mut names := []string{}
	for x in p.flat() {
		if x != '' {
			names << x
		}
	}
	check_unique(names)!
	s.put(positions_key(team_id), p.to_any(), true)!
}

fn check_unique(xs []string) ! {
	mut seen := map[string]string{}
	for x in xs {
		k := x.to_lower()
		if prev := seen[k] {
			return error("'${x}' and '${prev}' are the same. Values must be unique!")
		}
		seen[k] = x
	}
}

// ---- stats ----

pub fn (s &Store) stats_get(team_id string) Stats {
	return stats_from_any(s.get(stats_key(team_id)) or { return default_stats() })
}

pub fn (mut s Store) stat_save(team_id string, stat Stat) ! {
	mut stats := s.stats_get(team_id)
	mut found := false
	for mut x in stats.stats {
		if x.id == stat.id {
			x.name = stat.name
			x.active = stat.active
			found = true
		}
	}
	if !found {
		return error('Stat not found.')
	}
	check_unique(stats.stats.map(it.name))!
	s.put(stats_key(team_id), stats.to_any(), true)!
}

// requeue marks a record as needing sync without changing it.
pub fn (mut s Store) requeue(key string) ! {
	data := s.get(key) or { return }
	s.put(key, data, true)!
}

pub fn (s &Store) pending_count() int {
	return s.pending.len
}
