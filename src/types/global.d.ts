import type { SharedApp } from "../web/server/shared.global.ts";
import type { SettingsApp } from "../web/settings.global.ts";

declare global {
  interface Window {
    htmz: (frame: HTMLIFrameElement) => void;
    // Swaps a response document into the page (@jon49/web/htmz-morph.js).
    htmzSwap: (doc: Document, detail?: unknown) => void;
    // Renders a page for htmz-nav without the service worker, or null to
    // leave it to fetch (js/routes.bundle.ts).
    htmzFetch?: (url: string) => Promise<Response> | null;
    // Set once js/routes.bundle.ts handles taps in the page.
    routesInPage?: boolean;
    dataAction: (event: Event) => void;
    sw: App; // Add the sw property with proper typing
    // `app` is declared by @jon49/web/app-actions.js (Record<string, AppAction>).
    defineTrait: (name: string, trait: (el: HTMLElement) => void) => void;
  }

  interface Element {
    app?: any;
  }

  // Ensure self also has the sw property
  var self: Window & typeof globalThis;
}

interface App extends SharedApp, SettingsApp {}

// This empty export makes this file a module, allowing declare global to work
export {};
