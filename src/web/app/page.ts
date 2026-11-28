// What a page module (pages/*.page.ts) exports: how to draw the page from the
// URL, and the actions its markup names (`_click=x`, `_submit=x`, ...). The
// router (@jon49/web/app/router.js, started in main.ts) imports the module
// the first time its page is opened and renders it into <main id=main>.
import type { Page as BasePage, PageView as BasePageView } from "@jon49/web/app/page.js";

export type { Action, ActionContext, Actions, Html, Query } from "@jon49/web/app/page.js";

export interface Nav {
  name: string;
  url: string;
}

export interface PageView extends BasePageView {
  // The team's tabs, below the header.
  nav?: Nav[];
  // Just `main`, without the header: the match play view, which fills the
  // screen.
  bare?: boolean;
}

export type Page = BasePage<PageView>;
