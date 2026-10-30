module gui

import gg

// Theme colors follow the web app's nimble.css palette with its slate-blue
// accent (src/web/css/base.css and app.css, converted from oklch).
pub struct Theme {
pub:
	dark          bool
	bg            gg.Color
	surface       gg.Color // header, cards
	surface_alt   gg.Color // hover, table stripes
	surface_hi    gg.Color // pressed
	text          gg.Color
	muted         gg.Color
	border        gg.Color
	primary       gg.Color // filled buttons
	primary_hover gg.Color
	link          gg.Color // accent text on bg
	on_primary    gg.Color
	secondary     gg.Color
	danger        gg.Color
	input_bg      gg.Color
	focus_ring    gg.Color
	// The toggles' on and off colors, and the text on them.
	on      gg.Color
	off     gg.Color
	on_text gg.Color
	// The pitch behind the field positions.
	pitch      gg.Color
	pitch_line gg.Color
	// A player's stint bar: fresh, then warm at half the limit, then stale.
	fresh gg.Color
	warm  gg.Color
	stale gg.Color
	// Players past their fair share are shaded toward this color.
	shade gg.Color
	flash gg.Color
}

pub fn hex(c u32) gg.Color {
	return gg.Color{u8(c >> 16), u8(c >> 8), u8(c), 255}
}

pub fn hexa(c u32, a u8) gg.Color {
	return gg.Color{u8(c >> 16), u8(c >> 8), u8(c), a}
}

// mix blends b into a by t (0..1).
pub fn mix(a gg.Color, b gg.Color, t f32) gg.Color {
	return gg.Color{u8(f32(a.r) * (1 - t) + f32(b.r) * t), u8(f32(a.g) * (1 - t) + f32(b.g) * t), u8(f32(a.b) * (1 - t) + f32(b.b) * t), 255}
}

pub const light_theme = Theme{
	dark:          false
	bg:            hex(0xf9fafb)
	surface:       hex(0xeff0f1)
	surface_alt:   hex(0xe5e6e7)
	surface_hi:    hex(0xd8d9da)
	text:          hex(0x27292b)
	muted:         hex(0x616366)
	border:        hex(0xc5c8ca)
	primary:       hex(0x506f8d)
	primary_hover: hex(0x34536f)
	link:          hex(0x34536f)
	on_primary:    hex(0xffffff)
	secondary:     hex(0x405870)
	danger:        hex(0xd40924)
	input_bg:      hex(0xffffff)
	focus_ring:    hexa(0x506f8d, 110)
	on:            hex(0x026e5b)
	off:           hex(0xa05000)
	on_text:       hex(0xffffff)
	pitch:         hex(0xdcf2df)
	pitch_line:    hex(0xa9d0b0)
	fresh:         hex(0x57b9a1)
	warm:          hex(0xe8a95c)
	stale:         hex(0xa05000)
	shade:         hex(0x13171f)
	flash:         hex(0xffff00)
}

pub const dark_theme = Theme{
	dark:          true
	bg:            hex(0x0e0f12)
	surface:       hex(0x151618)
	surface_alt:   hex(0x1c1d1f)
	surface_hi:    hex(0x252629)
	text:          hex(0xced1d4)
	muted:         hex(0x8d8f92)
	border:        hex(0x2f3134)
	primary:       hex(0x506f8d)
	primary_hover: hex(0x6c8dac)
	link:          hex(0x90b2d3)
	on_primary:    hex(0xffffff)
	secondary:     hex(0x4d667f)
	danger:        hex(0xf94144)
	input_bg:      hex(0x151618)
	focus_ring:    hexa(0x90b2d3, 120)
	on:            hex(0x57b9a1)
	off:           hex(0xe8a95c)
	on_text:       hex(0x0f171f)
	pitch:         hex(0x152619)
	pitch_line:    hex(0x2c4732)
	fresh:         hex(0x57b9a1)
	warm:          hex(0xe8a95c)
	stale:         hex(0xa05000)
	shade:         hex(0xffffff)
	flash:         hex(0x8a7a00)
}
