import type { RoutePage } from "@jon49/sw/routes.middleware.js";

const {
  globalDb,
  html,
  layout,
  utils: { when },
} = self.sw;

const render = async () => {
  let { disableAutoSyncDuringGame } = await globalDb.settings();
  return html`
<h2>Settings</h2>

<form class=form method=post action="/web/api/settings?handler=autoSync">
  <div>
    <label>
      <input
          type=checkbox
          name=disableAutoSyncDuringGame
          $${when(disableAutoSyncDuringGame, "checked")}>
      Disable auto-sync during games
    </label>
    <p class=muted>
      When on, the app will not auto-sync while you are on a match page. You
      can still tap the sync button to sync manually.
    </p>
  </div>
  <button>Save</button>
</form>`;
};

const route: RoutePage = {
  get: {
    async get() {
      return layout({
        main: await render(),
        title: "Settings",
      });
    },
  },
};

export default route;
