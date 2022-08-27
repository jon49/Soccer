import html from "./js/html-template-tag"
import layout from "./_layout.html"
import { cache, Message, TeamView } from "./js/db"
import { cleanHtmlId, searchParams } from "./js/utils"
import { handlePost, PostHandlers, Route } from "./js/route"
import { when, whenF } from "./js/shared"
import { addPlayer, addPlayerForm } from "./js/_AddPlayer.html"
import { teamGet } from "./js/repo-team"
import { validateObject } from "./js/validation"
import { queryAllValidator, queryTeamValidator } from "./js/validators"

interface PlayersView {
    team: TeamView
    name?: string
    posted?: string
    wasFiltered: boolean
    message: Message
}

let queryTeamAllValidator = {
    ...queryTeamValidator,
    ...queryAllValidator,
}

async function start(req: Request) : Promise<PlayersView> {
    let query = await validateObject(searchParams(req), queryTeamAllValidator)
    let team = await teamGet(query.team)
    let [cached, posted, message] = await Promise.all([
        cache.pop("players"),
        cache.pop("posted"),
        cache.pop("message")])
    let wasFiltered = false
    if (query.all === null) {
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
                <a href="?player=${x.id}&team=${team.id}">${x.name}</a>
                <a href="/web/players/edit?team=${team.id}#${cleanHtmlId(x.name)}">Edit</a>
            </li>`
        )}
    </ul>`
       : html`<p>No players found. Please add one!</p>` }

    ${when(wasFiltered,
        html`<p><a href="?all&team=${team.id}">Show all players.</a></p>`)}
    ${whenF(playersExist && team.players.find(x => !x.active),
        () => html`<p><a href="?team=${team.id}">Hide archived players.</a></p>`)}

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
            nav: [{name: "Edit", url: `/web/players/edit?team=${result.team.id}#team`}] })
    },
    post: handlePost(postHandlers),
}
export default route
