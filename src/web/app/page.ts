// What a page module (pages/*.page.ts) exports: how to draw the page from the
// URL, and the actions its markup names (`_click=x`, `_submit=x`, ...).
//
// The router (router.ts) imports the module the first time its page is
// opened, renders it into <main id=main> and puts `actions` on <main> for the
// dispatcher (action.ts) to find.

export type Html = AsyncGenerator<any, void, unknown>;

export interface Nav {
  name: string;
  url: string;
}

export interface PageView {
  title: string;
  main: Html | Promise<Html>;
  // The team's tabs, below the header.
  nav?: Nav[];
  // Just `main`, without the header: the match play view, which fills the
  // screen.
  bare?: boolean;
}

// The page's URL search params, plus the dataset of the element that named
// the action and of its form, e.g. `<li data-player-id=2>` gives
// `query.playerId === "2"`. Values are strings, as the validators expect.
export type Query = Record<string, string | undefined>;

export interface ActionContext {
  ev: Event;
  // The element that names the action.
  el: HTMLElement;
  form?: HTMLFormElement;
  // The button that submitted the form, if any.
  submitter?: HTMLElement;
  query: Query;
  // The form's fields (and the submitter's name/value). A name ending in
  // "[]" collects every value under the name without it.
  data: Record<string, any>;
}

// An action may return a message (or several) to show as toasts.
export type Action = (ctx: ActionContext) => unknown;

export type Actions = Record<string, Action>;

export interface Page {
  render(o: { query: Query; url: URL }): Promise<PageView>;
  actions?: Actions;
  // Draws what changed after a sync brought new data, in place of drawing
  // the whole page again (which loses what the coach was doing, like a
  // player selected in a match). False: draw the whole page.
  refresh?(o: { query: Query; url: URL }): Promise<boolean | void>;
}
