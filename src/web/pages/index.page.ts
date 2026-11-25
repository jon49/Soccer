import html from "html-template-tag-stream";
import type { Page } from "../app/page.js";

// /web/ goes on to the Teams page.
export default {
  async render() {
    return {
      title: "Home",
      main: html`
        <p>Welcome to soccer tracking!</p>
        <i _load="redirect" data-url="/web/teams"></i>
      `,
    };
  },
} satisfies Page;
