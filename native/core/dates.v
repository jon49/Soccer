module core

import time

// Games are stored with a date ("2026-11-01") and an optional start time
// ("10:00"), with no time zone, like the web client.

pub struct Date {
pub:
	year  int
	month int
	day   int
}

pub fn today() Date {
	t := time.now()
	return Date{t.year, t.month, t.day}
}

pub fn today_str() string {
	return today().str()
}

pub fn parse_date(s string) ?Date {
	parts := s.trim_space().split('-')
	if parts.len != 3 || parts[0].len != 4 {
		return none
	}
	for p in parts {
		if p.len == 0 || !p.bytes().all(it.is_digit()) {
			return none
		}
	}
	d := Date{parts[0].int(), parts[1].int(), parts[2].int()}
	if d.month < 1 || d.month > 12 || d.day < 1 || d.day > 31 {
		return none
	}
	if from_days(d.days()) != d {
		return none
	}
	return d
}

pub fn (d Date) str() string {
	return '${d.year:04}-${d.month:02}-${d.day:02}'
}

// days since 1970-01-01 (Howard Hinnant's days_from_civil).
pub fn (d Date) days() int {
	y := if d.month <= 2 { d.year - 1 } else { d.year }
	era := (if y >= 0 { y } else { y - 399 }) / 400
	yoe := y - era * 400
	mp := (d.month + 9) % 12
	doy := (153 * mp + 2) / 5 + d.day - 1
	doe := yoe * 365 + yoe / 4 - yoe / 100 + doy
	return era * 146097 + doe - 719468
}

pub fn from_days(n int) Date {
	z := n + 719468
	era := (if z >= 0 { z } else { z - 146096 }) / 146097
	doe := z - era * 146097
	yoe := (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
	y := yoe + era * 400
	doy := doe - (365 * yoe + yoe / 4 - yoe / 100)
	mp := (5 * doy + 2) / 153
	d := doy - (153 * mp + 2) / 5 + 1
	m := if mp < 10 { mp + 3 } else { mp - 9 }
	return Date{if m <= 2 { y + 1 } else { y }, m, d}
}

// weekday: 0 for Sunday through 6 for Saturday.
pub fn (d Date) weekday() int {
	w := (d.days() + 4) % 7
	return if w < 0 { w + 7 } else { w }
}

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// format_game_date: "Sun, Nov 1, 2026".
pub fn format_game_date(date string) string {
	d := parse_date(date) or { return date }
	return '${weekdays[d.weekday()]}, ${months[d.month - 1]} ${d.day}, ${d.year}'
}

// format_short_date: "Nov 1".
pub fn format_short_date(date string) string {
	d := parse_date(date) or { return date }
	return '${months[d.month - 1]} ${d.day}'
}

// parse_time reads "10:00", "9:05", "10:00 am" or "3pm" as "HH:MM".
pub fn parse_time(s string) ?string {
	mut t := s.trim_space().to_lower().replace(' ', '')
	if t == '' {
		return none
	}
	mut pm := false
	mut am := false
	if t.ends_with('pm') || t.ends_with('p') {
		pm = true
		t = t.trim_right('pm')
	} else if t.ends_with('am') || t.ends_with('a') {
		am = true
		t = t.trim_right('am')
	}
	parts := t.split(':')
	if parts.len > 2 || parts[0] == '' {
		return none
	}
	for p in parts {
		if p == '' || !p.bytes().all(it.is_digit()) {
			return none
		}
	}
	mut h := parts[0].int()
	m := if parts.len == 2 { parts[1].int() } else { 0 }
	if m > 59 || (parts.len == 2 && parts[1].len != 2) {
		return none
	}
	if am || pm {
		if h < 1 || h > 12 {
			return none
		}
		if pm && h != 12 {
			h += 12
		} else if am && h == 12 {
			h = 0
		}
	}
	if h > 23 {
		return none
	}
	return '${h:02}:${m:02}'
}

// format_game_time: "10:00 AM", or "TBD" when unset.
pub fn format_game_time(t string) string {
	if t == '' {
		return 'TBD'
	}
	parts := t.split(':')
	if parts.len < 2 {
		return t
	}
	h := parts[0].int()
	m := parts[1].int()
	suffix := if h >= 12 { 'PM' } else { 'AM' }
	h12 := if h % 12 == 0 { 12 } else { h % 12 }
	return '${h12}:${m:02} ${suffix}'
}
