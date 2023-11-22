import html from "../server/html.js"
import layout from "./_layout.html.js"
import { PostHandlers, Route } from "../server/route.js"
import { teamGet } from "../server/repo-team.js"
import { createCheckbox, createIdNumber, createString25, maybe, required, validate, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { activitiesSave, activityGetAll, activitySaveNew } from "../server/repo-player-game.js"
import { DbCache, when } from "../server/shared.js"
import { teamNav } from "./_shared-views.js"
import { Activity } from "../server/db.js"

function nameInputView(o: Activity) {
    return html`<input id="name-${o.id}" name="name" value="${o.name}">`
}

async function render(o: ActivityView) {
    let [{ activities }, team] = await Promise.all([o.activities(), o.team()])
    let teamId = o.teamId
    let hasHiddenActivities = activities.some(x => !x.active)
    let showAllActivities = o.query.all === ""

    return html`
<h2>${team.name} - Stats</h2>

<div class=row onchange="this.target.form.requestSubmit()">
    ${activities.filter(x => showAllActivities || x.active).map((x, i) => {
        return html`
        <form
            onchange="this.requestSubmit()"
            class=form
            method=post
            action="/web/activities?teamId=${teamId}"
            hf-target=main>
            <input type=hidden name=id value="${x.id}">
            ${() =>
                i === 0
                    ? html`<format-input data-format="app.noteFormatter">${nameInputView(x)}</format-input>`
                : nameInputView(x)
            }
            ${when(showAllActivities, () => html`
                <div id="active-${x.id}">
                    <label class=toggle>
                        <input name=active type=checkbox $${when(x.active, "checked")}>
                        <span class="off button">Inactive</span>
                        <span class="on button">Active</span>
                    </label>
                </div>`)}
        </form>`
    })}
    <form
        onchange="this.requestSubmit()"
        class=form
        method=post
        action="/web/activities?teamId=${teamId}&handler=addActivity"
        hf-target=main>
        <input id="_activity-new" name=name>
    </form>
</div>

${when(hasHiddenActivities && !showAllActivities, () => html`<a href="/web/activities?teamId=${teamId}&all">Show all activities.</a>`)}
${when(hasHiddenActivities && showAllActivities, () => html`<a href="/web/activities?teamId=${teamId}">Hide inactive activities.</a>`)}
<p>* Always associated with making a goal.</p>

<script id="activities-script">
window.app.scripts.set("activities-script", {
    load() {
        window.app.noteFormatter = {
            format(value) {
                return value + " *"
            },
            isValid(value) {
                return value?.trim().length > 0
                    ? ""
                : "Goal activity is required."
            }
        }
    },
    unload() {
        delete window.app.noteFormatter
    }
})
</script>`
}

const dataActivityValidator = {
    name: createString25("Activity Name")
}

const dataActivityIdValidator = {
    id: createIdNumber("Activity ID")
}

const activityValidator = {
    ...dataActivityIdValidator,
    name: maybe(createString25("Activity Name")),
    active: maybe(createCheckbox),
}

function renderMain(data: ActivityView) {
    return render(data)
}

const postHandlers : PostHandlers = {
    async addActivity ({ data, query }) {
        let [{ teamId }, { name }] =
            await validate([
                validateObject(query, queryTeamIdValidator),
                validateObject(data, dataActivityValidator)])
        await activitySaveNew(teamId, name)

        return renderMain(new ActivityView(teamId, query))
    },

    async post({ query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let editedActivity = await validateObject(data, activityValidator)
        let activityData = await activityGetAll(teamId)
        let { activities } = activityData
        let o = await required(activities.find(x => x.id === editedActivity.id), "Could not find activity.")
        if (!editedActivity.name) {
            o.active = false
        } else {
            o.active = editedActivity.active != null ? editedActivity.active : true
            o.name = editedActivity.name
        }
        await activitiesSave(teamId, activityData)

        return renderMain(new ActivityView(teamId, query))
    }
}

class ActivityView {
    cache: DbCache
    teamId: number
    query: any
    constructor(teamId: number, query: any) {
        this.teamId = teamId
        this.cache = new DbCache()
        this.query = query
    }

    async team() {
        return this.cache.get("team", () => teamGet(this.teamId))
    }

    async activities() {
        return this.cache.get("activities", () => activityGetAll(this.teamId))
    }
}

const route : Route = {
    route: /\/activities\/$/,
    async get({ query }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let data = new ActivityView(teamId, query)
        let team = await data.team()
        return layout({
            main: await render(data),
            nav: teamNav(teamId),
            title: `Stats — ${team.name}`,
            scripts: ["/web/js/input-formatter.js"],
        })
    },
    post: postHandlers,
}

export default route

