import { cache, get, Message, Team } from "./db"
import html from "./html-template-tag"
import { RoutePostArgsWithType } from "./route"
import { findTeamSingle, messageView, saveTeam, splitTeamName, when } from "./shared"
import { assert, required, requiredAsync, validateObject } from "./validation"
import { dataPlayerNameValidator, queryTeamValidator } from "./validators"

const formId = "add-player"

interface AddPlayerViewArgs {
    name: string | undefined
    posted: string | undefined
    playersExist: boolean
    action?: string
    message: Message
}

export function addPlayerForm({name, posted, playersExist, action, message}: AddPlayerViewArgs) {
    let action_ = action ? html`action="${action}"` : null
    let playerAdded = posted === formId
    return html`
${when(playerAdded && !!message, messageView(message))}
<form class=form method=post ${action_} onchange="this.submit()">
    <div>
        <label for=name>Player Name</label>
        <input id=name name=name type=text value="${name}" $${when(playerAdded || !playersExist, "autofocus")} required>
    </div>
    <button>Save</button>
</form>`
}

export async function addPlayer({ data, query }: RoutePostArgsWithType<{name: string}, {team: string}>) {
    let { team: queryTeam } = await validateObject(query, queryTeamValidator)
    let team = await get<Team>(queryTeam)

    let { name } = await validateObject(data, dataPlayerNameValidator)

    if (!team) {
        let teams = await requiredAsync(get("teams"))
        let team_ = await required(findTeamSingle(teams, splitTeamName(queryTeam)), "Could not find team.")
        team = {
            name: team_.name,
            year: team_.year,
            players: []
        }
    }

    await assert.isFalse(!!team.players.find(x => x.name === name), "Player names must be unique!")
        ?.catch(x => Promise.reject({...x, players: { name }, posted: formId}))

    team.players.push({
        active: true,
        name,
    })

    await Promise.all([saveTeam(team), cache.push({ posted: formId })])

    return
}
