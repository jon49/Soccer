# Soccer native app (desktop now; iOS and Android next). Requires V
# (https://vlang.io); see README.md for the system packages each platform needs.
V ?= v
BIN ?= soccer
PREFIX ?= $(HOME)/.local

.PHONY: build dev run test fmt check android install uninstall clean

build:
	$(V) -prod -o $(BIN) .

dev:
	$(V) -g -o $(BIN) .

run:
	$(V) run . $(ARGS)

test:
	$(V) test core

fmt:
	$(V) fmt -w .

# Type-checks and generates C for each target without needing its SDK.
check:
	@mkdir -p .check
	$(V) -o .check/linux.c -os linux .
	$(V) -o .check/windows.c -os windows .
	$(V) -o .check/macos.c -os macos .
	@rm -rf .check

# Android APK. Needs the Android SDK and NDK and vab; see README.md.
android:
	vab --name Soccer --package-id com.jnyman.soccer --icon ../src/web/images/soccer.png -o $(BIN).apk .

install: build
	install -Dm755 $(BIN) $(PREFIX)/bin/$(BIN)
	install -Dm644 ../src/web/images/soccer.svg $(PREFIX)/share/icons/hicolor/scalable/apps/soccer.svg
	install -Dm644 soccer.desktop $(PREFIX)/share/applications/soccer.desktop

uninstall:
	rm -f $(PREFIX)/bin/$(BIN) $(PREFIX)/share/icons/hicolor/scalable/apps/soccer.svg \
		$(PREFIX)/share/applications/soccer.desktop

clean:
	rm -rf $(BIN) $(BIN).exe $(BIN).apk .check
