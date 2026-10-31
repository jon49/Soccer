module main

#postinclude "@VMODROOT/x11_linux.h"

fn C.soccer_x11_respect_keymap()
fn C.soccer_x11_set_class(name &char)

// x11_setup fills in what sokol leaves out on X11 (see x11_linux.h): keys
// report what the keymap makes them (Caps Lock and Escape swapped, say), not
// what is printed on them, and the window's class names it `soccer`, so the
// desktop matches it to soccer.desktop for its icon. Android builds use
// x11_default.c.v instead.
fn x11_setup() {
	C.soccer_x11_respect_keymap()
	C.soccer_x11_set_class(c'soccer')
}
