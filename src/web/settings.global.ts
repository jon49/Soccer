import { Route } from "@jon49/sw/routes.middleware.js"

self.app = self.app || {}

const routes : Route[] = [
    { route: /\/match\/$/,
      file: "/web/pages/match/match.page.js" },
    { route: /\/api\/sync\/$/,
      file: "/web/api/sync.page.js" },
    { route: /\/api\/settings\/$/,
      file: "/web/api/settings.page.js" },
    { route: /\/stats\/$/,
      file: "/web/pages/stats/stats.page.js" },
    { route: /\/stats\/edit\/$/,
      file: "/web/pages/stats/edit/stats-edit.page.js" },
    { route: /\/games\/$/,
      file: "/web/pages/games.page.js" },
    { route: /\/teams\/$/,
      file: "/web/pages/teams.page.js" },
    { route: /\/positions\/$/,
      file: "/web/pages/positions.page.js" },
    { route: /\/players\/$/,
      file: "/web/pages/players.page.js" },
    { route: /\/web\/$/,
      file: "/web/pages/index.page.js" },
]

let app = {
    routes,
}

export type SettingsApp = typeof app

Object.assign(self.app, app)

