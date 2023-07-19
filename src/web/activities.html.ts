import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { Activity, Team } from "./server/db"
import { searchParams } from "./server/utils"
import { PostHandlers, Route } from "./server/route"
import { teamGet } from "./server/repo-team"
import { createIdNumber, createString25, validate, validateObject } from "./server/validation"
import { queryTeamIdValidator } from "./server/validators"
import { activitiesSave, activityGetAll, activitySaveNew } from "./server/repo-player-game"

interface ActivityView {
    activities: Activity[]
    team: Team
}

async function start(req: Request) : Promise<ActivityView> {
    let { teamId } = await validateObject(searchParams(req), queryTeamIdValidator)
    let [activities, team] = await Promise.all([activityGetAll(teamId), teamGet(teamId)])
    return { activities: activities.activities, team }
}

function render({ team, activities }: ActivityView) {
    return html`
<h2>${team.name} - Activities</h2>

<form class=form method=post target=#activities>
    <div id=activities>
    ${activities.map(x => activityView(x, team.id))}
    </div>
    <button>Save</button>
</form>

<h3>Add Activity</h3>
<form class=form method=post action="?handler=addActivity&teamId=${team.id}" target=#activities hf-swap="append">
    <input type=text name=activity placeholder="E.g., Goal, Block, etc.">
    <button>Save</button>
</form>

<script>
    document.addEventListener("onchange", e => {
        let target = e.target
        if (target instanceof HTMLInputElement) {
            target.form.requestSubmit()
        }
    })
</script>
    `
}

function activityView(activity: Activity, teamId: number) {
    return html`
    <div id="_${activity.id}">
        <button formaction="?handler=deleteActivity&activityId=${activity.id}&teamId=${teamId}" target="#_${activity.id}">X</button>
        <input class=inline name="${activity.id}" value="${activity.name}">
    </div>`
}

const dataActivityValidator = {
    activity: createString25("Activity Name")
}

const activityValidator = {
    id: createIdNumber("Activity ID"),
    name: createString25("Activity Name")
}

const queryTeamIdActivityIdValidator = {
    ...queryTeamIdValidator,
    activityId: createIdNumber("Activity ID")
}

const postHandlers : PostHandlers = {
    addActivity: async ({ data, query }) => {
        let [{ teamId }, { activity }] =
            await validate([
                validateObject(query, queryTeamIdValidator),
                validateObject(data, dataActivityValidator)])
        let newActivity = await activitySaveNew(teamId, activity)
        return activityView(newActivity, teamId)
    },
    deleteActivity: async ({ query }) => {
        let { activityId, teamId } = await validateObject(query, queryTeamIdActivityIdValidator)
        let o = await activityGetAll(teamId)
        o.activities = o.activities.filter(x => x.id !== activityId)
        await activitiesSave(teamId, o)
        return html``
    },
    post: async ({ query, data }) => {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let editedActivities : Activity[] = await
            validate(
                Object.entries(data)
                .filter(x => x[1])
                .map(x => validateObject({id: +x[0], name: ""+x[1]}, activityValidator)))
        let o = await activityGetAll(teamId)
        o.activities = editedActivities
        await activitiesSave(teamId, o)
        return html`${editedActivities.map(x => activityView(x, teamId))}`
    }
}

const route : Route = {
    route: /\/activities\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({ main: render(result) })
    },
    post: postHandlers,
}
export default route


