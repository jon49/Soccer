import { cache, get, Team } from "./db"
import html from "./html-template-tag"
import { RoutePostArgsWithType } from "./route"
import { findTeamSingle, saveTeam, splitTeamName } from "./shared"
import { assert, required, requiredAsync, validateObject } from "./validation"
import { dataPlayerNameValidator, queryTeamValidator } from "./validators"

const formId = "add-player"

interface AddPlayerViewArgs {
    name: string | undefined
    posted: string | undefined
    playersExist: boolean
    action?: string
}

export function addPlayerForm({name, posted, playersExist, action}: AddPlayerViewArgs) {
    let action_ = action ? html`action="${action}"` : null
    return html`
<form method=post ${action_} onchange="this.submit()">
    <div>
        <label for=name>Player Name</label>
        <input id=name name=name type=text value="${name}" $${posted === formId || !playersExist ? "autofocus" : null} required>
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
