import html from "../server/html.js"
import layout from "./_layout.html.js"
import { Activity, Team } from "../server/db.js"
import { searchParams } from "../server/utils.js"
import { PostHandlers, Route } from "../server/route.js"
import { teamGet } from "../server/repo-team.js"
import { createIdNumber, createString25, validate, validateObject } from "../server/validation.js"
import { queryTeamIdValidator } from "../server/validators.js"
import { activitiesSave, activityGetAll, activitySaveNew } from "../server/repo-player-game.js"

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

<form class=form method=post>
    <div id=activities>
    ${activities.map(x => activityView(x, team.id))}
    </div>
    <button>Save</button>
</form>

<h3>Add Activity</h3>
<form class=form method=post action="/web/activities?handler=addActivity&teamId=${team.id}">
    <input type=text name=activity placeholder="E.g., Goal, Block, etc.">
    <button>Save</button>
</form>

<script>
    document.addEventListener("onchange", e => {
        let target = e.target
        if (target instanceof HTMLInputElement) {
            target.form.submit()
        }
    })
</script>
    `
}

function activityView(activity: Activity, teamId: number) {
    return html`
    <div id="_${activity.id}">
        <button formaction="/web/activities?handler=deleteActivity&activityId=${activity.id}&teamId=${teamId}">X</button>
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

async function renderMain(req: Request) {
    return render(await start(req))
}

const postHandlers : PostHandlers = {
    async addActivity ({ data, query }) {
        let [{ teamId }, { activity }] =
            await validate([
                validateObject(query, queryTeamIdValidator),
                validateObject(data, dataActivityValidator)])
        let newActivity = await activitySaveNew(teamId, activity)
        return activityView(newActivity, teamId)
    },

    async deleteActivity({ query }) {
        let { activityId, teamId } = await validateObject(query, queryTeamIdActivityIdValidator)
        let o = await activityGetAll(teamId)
        o.activities = o.activities.filter(x => x.id !== activityId)
        await activitiesSave(teamId, o)
        return html``
    },

    async post({ req, query, data }) {
        let { teamId } = await validateObject(query, queryTeamIdValidator)
        let editedActivities : Activity[] = await
            validate(
                Object.entries(data)
                .filter(x => x[1])
                .map(x => validateObject({id: +x[0], name: ""+x[1]}, activityValidator)))
        let o = await activityGetAll(teamId)
        o.activities = editedActivities
        await activitiesSave(teamId, o)

        return renderMain(req)
    }
}

const route : Route = {
    route: /\/activities\/$/,
    async get(req: Request) {
        const result = await start(req)
        return layout(req, {
            main: render(result),
            title: `Activities - ${result.team.name}`,
        })
    },
    post: postHandlers,
}
export default route


