module main

// Desktop and iOS: the data folder comes from core.default_data_dir, and
// closing the window quits.

fn platform_data_dir() ?string {
	return none
}

fn back_instead_of_quit(mut _ App) bool {
	return false
}
