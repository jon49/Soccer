module main

import os
import sokol.sapp

// platform_data_dir is the app's private files folder, which only the
// native activity knows.
fn platform_data_dir() ?string {
	activity := unsafe { &os.NativeActivity(sapp.android_get_native_activity()) }
	if activity == unsafe { nil } || activity.internalDataPath == unsafe { nil } {
		return none
	}
	return unsafe { cstring_to_vstring(activity.internalDataPath) }
}

// back_instead_of_quit: the back button asks to quit. Close the dialog or go
// back a screen instead, until there is nowhere left to go.
fn back_instead_of_quit(mut app App) bool {
	if app.confirm.action != .none_ {
		sapp.cancel_quit()
		app.confirm = Confirm{}
		return true
	}
	if app.history.len > 0 {
		sapp.cancel_quit()
		app.back()
		return true
	}
	return false
}
