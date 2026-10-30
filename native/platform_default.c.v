module main

// Desktop and iOS: the data folder comes from core.default_data_dir, and
// closing the window quits.

fn platform_init() {}

// platform_start and platform_poll: the window's own key events are enough.
fn platform_start(mut _ App) {}

fn platform_poll(mut _ App) {}

fn platform_data_dir() ?string {
	return none
}

// platform_scale: gg's own scale for the screen is right here.
fn platform_scale() ?f32 {
	return none
}
