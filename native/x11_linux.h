// Fixes for what sokol leaves out on X11. They reach into sokol_app.h's
// private state (_sapp), so this is included after sokol's implementation
// (#postinclude); call them once sokol is running (init_cb).
//
// soccer_x11_respect_keymap: sokol maps X11 keys by their physical position
// (XKB key names), so a key the keymap remaps -- Caps Lock and Escape swapped
// with caps:swapescape, or Caps Lock as another Control -- still reports what
// is printed on it. This fixes sokol's table for the keys that don't type
// text: each key reports what the keymap makes it. Letters, digits and
// punctuation keep sokol's position-based codes.
//
// soccer_x11_set_class: sokol sets no WM_CLASS, so the desktop can't match
// the window to soccer.desktop (StartupWMClass) and shows no icon for it in
// the task switcher.
#include <X11/XKBlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>

void soccer_x11_respect_keymap(void) {
  Display *display = _sapp.x11.display;
  if (display == NULL) {
    return;
  }
  static const struct {
    KeySym sym;
    sapp_keycode key;
  } keys[] = {
      {XK_Escape, SAPP_KEYCODE_ESCAPE},
      {XK_Caps_Lock, SAPP_KEYCODE_CAPS_LOCK},
      {XK_Tab, SAPP_KEYCODE_TAB},
      {XK_BackSpace, SAPP_KEYCODE_BACKSPACE},
      {XK_Return, SAPP_KEYCODE_ENTER},
      {XK_Delete, SAPP_KEYCODE_DELETE},
      {XK_Control_L, SAPP_KEYCODE_LEFT_CONTROL},
      {XK_Control_R, SAPP_KEYCODE_RIGHT_CONTROL},
      {XK_Shift_L, SAPP_KEYCODE_LEFT_SHIFT},
      {XK_Shift_R, SAPP_KEYCODE_RIGHT_SHIFT},
      {XK_Alt_L, SAPP_KEYCODE_LEFT_ALT},
      {XK_Alt_R, SAPP_KEYCODE_RIGHT_ALT},
      {XK_Super_L, SAPP_KEYCODE_LEFT_SUPER},
      {XK_Super_R, SAPP_KEYCODE_RIGHT_SUPER},
  };
  const int n = (int)(sizeof(keys) / sizeof(keys[0]));
  for (int code = 8; code < _SAPP_X11_MAX_X11_KEYCODES; code++) {
    KeySym sym = XkbKeycodeToKeysym(display, (KeyCode)code, 0, 0);
    if (sym == NoSymbol) {
      continue;
    }
    for (int i = 0; i < n; i++) {
      if (keys[i].sym == sym) {
        _sapp.keycodes[code] = keys[i].key;
        break;
      }
    }
  }
}

void soccer_x11_set_class(char *name) {
  Display *display = _sapp.x11.display;
  Window window = _sapp.x11.window;
  if (display == NULL || window == 0) {
    return;
  }
  XClassHint hint = {name, name};
  XSetClassHint(display, window, &hint);
  XFlush(display);
}
