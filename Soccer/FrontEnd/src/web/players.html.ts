import html from "./server/html-template-tag"
import layout from "./_layout.html"
import { cache, Message, Team } from "./server/db"
import { searchParams } from "./server/utils"
import { handlePost, PostHandlers, Route } from "./server/route"
import { when } from "./server/shared"
import { addPlayer, addPlayerForm } from "./server/_AddPlayer.html"
import { teamGet } from "./server/repo-team"
import { validateObject } from "./server/validation"
import { queryAllValidator, queryTeamIdValidator } from "./server/validators"

interface PlayersView {
    team: Team
    name?: string
    posted?: string
    wasFiltered: boolean
    message: Message
}

let queryTeamAllValidator = {
    ...queryTeamIdValidator,
    ...queryAllValidator,
}

async function start(req: Request) : Promise<PlayersView> {
    let { all, teamId } = await validateObject(searchParams(req), queryTeamAllValidator)
    let team = await teamGet(teamId)
    let [cached, posted, message] = await Promise.all([
        cache.pop("players"),
        cache.pop("posted"),
        cache.pop("message")])
    let wasFiltered = false
    if (all === null) {
        let filtered = team.players.filter(x => x.active)
        wasFiltered = filtered.length !== team.players.length
        team.players = filtered
    }
    return {
        team,
        name: cached?.name,
        posted,
        wasFiltered,
        message,
    }
}

function render({ team, message, wasFiltered, name, posted }: PlayersView) {
    let playersExist = team.players.length > 0

    return html`
    <h2>Team ${team.name}</h2>
    ${ playersExist
        ? html`
    <ul class=list>
        ${team.players.map(x =>
            html`
            <li>
                <a href="?playerId=${x.id}&teamId=${team.id}">${x.name}</a>
                <a href="/web/players/edit?teamId=${team.id}#_${x.id}">Edit</a>
            </li>`
        )}
    </ul>`
       : html`<p>No players found. Please add one!</p>` }

    ${when(wasFiltered,
        html`<p><a href="?all&teamId=${team.id}">Show all players.</a></p>`)}
    ${when(playersExist && team.players.find(x => !x.active),
        () => html`<p><a href="?teamId=${team.id}">Hide archived players.</a></p>`)}

    <h3>Add a player</h3>

    ${addPlayerForm({name, posted, playersExist, message})}
    `
}

const postHandlers : PostHandlers = {
    post: addPlayer,
}

const route : Route = {
    route: /\/players\/$/,
    async get(req: Request) {
        const result = await start(req)
        const template = await layout(req)
        return template({
            main: render(result),
            nav: [{name: "Edit", url: `/web/players/edit?teamId=${result.team.id}#team`}] })
    },
    post: handlePost(postHandlers),
}
export default route
