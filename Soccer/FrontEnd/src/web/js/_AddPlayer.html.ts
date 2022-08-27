import { cache, Message } from "./db"
import html from "./html-template-tag"
import { reject } from "./repo"
import { playerCreate, teamGet } from "./repo-team"
import { RoutePostArgsWithQuery } from "./route"
import { messageView, when } from "./shared"
import { assert, validate, validateObject } from "./validation"
import { dataPlayerNameValidator, queryTeamIdValidator } from "./validators"

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
${when(!!message, messageView(message))}
<form class=form method=post ${action_} onchange="this.submit()">
    <div>
        <label for=name>Player Name</label>
        <input id=name name=name type=text value="${name}" $${when(playerAdded || !playersExist, "autofocus")} required>
    </div>
    <button>Save</button>
</form>`
}

export async function addPlayer({ data, query }: RoutePostArgsWithQuery) {
    await cache.push({posted: formId})
    let [{ teamId }, { name }] = await validate([
        validateObject(query, queryTeamIdValidator),
        validateObject(data, dataPlayerNameValidator)
    ])

    let team = await teamGet(teamId)

    await assert.isFalse(!!team.players.find(x => x.name === name), "Player names must be unique!")
        ?.catch(_ => reject({ players: { name } }))

    await Promise.all([playerCreate(teamId, name), cache.push({ posted: formId })])

    return
}
