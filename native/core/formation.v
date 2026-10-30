module core

// The formation editor's logic (pages/positions.page.ts).

// formation_templates by number of players: rows of positions from the
// attacking end down to the goalkeeper.
pub const formation_templates = {
	4:  [[1, 2, 1], [1, 1, 2]]
	7:  [[1, 3, 2, 1], [1, 2, 3, 1], [2, 2, 2, 1]]
	9:  [[2, 3, 3, 1], [3, 3, 2, 1], [2, 4, 2, 1], [3, 2, 3, 1]]
	11: [[2, 4, 4, 1], [3, 3, 4, 1], [2, 5, 3, 1], [1, 3, 2, 4, 1], [3, 4, 3, 1]]
}

pub const template_player_counts = [4, 7, 9, 11]

// template_count picks the template set for a number of players (4 when
// there is none for it).
pub fn template_count(players int) int {
	return if players in template_player_counts { players } else { 4 }
}

// formation_name: defenders first, as formations are named ("1-2-1"). With
// four or more rows the last is the goalkeeper, who isn't counted.
pub fn formation_name(rows []int) string {
	mut r := rows.reverse()
	if rows.len == 3 {
		return r.map(it.str()).join('-')
	}
	if r.len > 0 {
		r = r[1..].clone()
	}
	return r.map(it.str()).join(' - ')
}

pub fn row_sizes(positions [][]string) []int {
	return positions.map(it.len).filter(it > 0)
}

const position_names = ['Striker', 'Forward', 'Midfield', 'Fullback', 'Goalkeeper']

const position_suffixes = {
	5: ['L', 'LC', 'C', 'RC', 'R']
	4: ['L', 'LC', 'RC', 'R']
	3: ['L', 'C', 'R']
	2: ['L', 'R']
	1: ['']
}

// template_positions names a template's positions, e.g. "Fullback L".
pub fn template_positions(grid []int) [][]string {
	mut names := position_names.clone()
	if grid.len == 4 || grid.len == 3 {
		names.delete(0)
	}
	mut res := [][]string{}
	for i, n in grid {
		name := if i < names.len { names[i] } else { 'Position' }
		suffixes := position_suffixes[n] or { []string{len: n, init: '${index + 1}'} }
		res << suffixes.map('${name} ${it}')
	}
	return res
}

// resize_row adds (inc) or removes a position in row `row`. Row -1 adds a
// row at the top and row == rows adds one at the bottom. Empty rows go.
pub fn resize_row(positions [][]string, row int, inc bool) [][]string {
	mut res := positions.map(it.clone())
	if row >= 0 && row < res.len {
		if inc {
			res[row] << ''
		} else if res[row].len > 0 {
			res[row].delete_last()
		}
	}
	if row == -1 {
		res.insert(0, [''])
	}
	if row > res.len - 1 {
		res << ['']
	}
	return res.filter(it.len > 0)
}
