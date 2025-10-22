import type { SharedApp } from "../web/server/shared.global.ts"
import type { SettingsApp } from "../web/settings.global.ts"

declare global {
  interface Window {
    htmz: (frame: HTMLIFrameElement) => void
    dataAction: (event: Event) => void
    sw: App  // Add the sw property with proper typing
    app?: Record<string, (e: Event, el: HTMLElement, form?: HTMLFormElement) => 1 | void>
  }

  interface Element {
      app?: any
  }

  // Ensure self also has the sw property
  var self: Window & typeof globalThis
}

interface App extends SharedApp, SettingsApp {}

// This empty export makes this file a module, allowing declare global to work
export {}