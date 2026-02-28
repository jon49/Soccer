import layout, { syncCountView, themeView } from "../pages/_layout.html.js"
import * as globalDb from "./global-model.js"
import * as utils from "@jon49/sw/utils.js"
import html from "html-template-tag-stream"
import * as db from "./db.js"
import * as validation from "promise-validation"
import * as validators from "@jon49/sw/validation.js"
import * as v from "./validators.js"
import * as repo from "./repo-team.js"
import * as repoPlayerGame from "./repo-player-game.js"
import * as sharedViews from "../pages/_shared-views.js"
import * as serverUtils from "./utils.js"

self.app = self.app || {}

let app = {
    db,
    globalDb,
    html,
    layout,
    repo: { ...repo, ...repoPlayerGame },
    utils: { ...utils, ...serverUtils },
    validation: { ...validation, ...validators, ...v },
    views: { ...sharedViews, themeView, syncCountView },
}

export type SharedApp = typeof app

Object.assign(self.app, app)


