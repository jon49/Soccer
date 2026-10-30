module core

import json2
import strconv

// JSON helpers. Records come from the web client, other devices and older
// versions, so values are read leniently: a missing or mistyped field reads
// as its zero value rather than failing the whole record.

pub fn as_map(a json2.Any) map[string]json2.Any {
	return match a {
		map[string]json2.Any { a }
		else { map[string]json2.Any{} }
	}
}

pub fn any_arr(a json2.Any) []json2.Any {
	return match a {
		[]json2.Any { a }
		else { []json2.Any{} }
	}
}

pub fn any_str(a json2.Any) string {
	return match a {
		string { a }
		json2.Null { '' }
		f64 { fmt_num(a) }
		f32, i64, int, i32, i16, i8, u64, u32, u16, u8 { a.str() }
		else { '' }
	}
}

pub fn any_num(a json2.Any) f64 {
	return match a {
		f64 { a }
		f32 { f64(a) }
		i64 { f64(a) }
		int { f64(a) }
		i32 { f64(a) }
		i16 { f64(a) }
		i8 { f64(a) }
		u64 { f64(a) }
		u32 { f64(a) }
		u16 { f64(a) }
		u8 { f64(a) }
		bool {
			if a { 1 } else { 0 }
		}
		string { strconv.atof64(a.trim_space()) or { 0 } }
		else { 0 }
	}
}

pub fn any_int(a json2.Any) int {
	return int(any_num(a))
}

pub fn any_i64(a json2.Any) i64 {
	return i64(any_num(a))
}

// any_bool reads a flag the way JavaScript tests it.
pub fn any_bool(a json2.Any) bool {
	return match a {
		bool { a }
		string { a != '' }
		json2.Null { false }
		else { any_num(a) != 0 }
	}
}

pub fn is_null(a json2.Any) bool {
	return a is json2.Null
}

fn field(m map[string]json2.Any, name string) json2.Any {
	return m[name] or { json2.null }
}

fn has_field(m map[string]json2.Any, name string) bool {
	if v := m[name] {
		return v !is json2.Null
	}
	return false
}

// fmt_num writes whole numbers without a decimal point, as JSON.stringify does.
pub fn fmt_num(f f64) string {
	if f == f64(i64(f)) {
		return i64(f).str()
	}
	return f.str()
}

// parse_json_text: the server stores keys and data as JSON text and echoes
// them back as strings.
pub fn parse_json_text(a json2.Any) json2.Any {
	if a is string {
		if a.len > 0 && a[0] in [`{`, `[`, `"`] {
			return json2.decode[json2.Any](a) or { a }
		}
	}
	return a
}

pub fn decode_json(s string) json2.Any {
	return json2.decode[json2.Any](s) or { json2.null }
}

// canon is the compact JSON encoding of a key, the same text
// JSON.stringify and the server's serde_json produce.
pub fn canon(a json2.Any) string {
	return match a {
		string {
			json2.Any(a).json_str()
		}
		[]json2.Any {
			'[' + a.map(canon(it)).join(',') + ']'
		}
		json2.Null {
			'null'
		}
		bool {
			a.str()
		}
		map[string]json2.Any {
			a.json_str()
		}
		else {
			fmt_num(any_num(a))
		}
	}
}

// with_rev returns a copy of a record with its revision set.
pub fn with_rev(a json2.Any, rev i64) json2.Any {
	mut m := as_map(a).clone()
	m['_rev'] = rev
	return m
}

pub fn rev_of(a json2.Any) i64 {
	return any_i64(field(as_map(a), '_rev'))
}

pub fn has_rev(a json2.Any) bool {
	return '_rev' in as_map(a)
}
