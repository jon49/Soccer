import { cache, Message } from "./db"
import html from "./html-template-tag"
import { reject } from "./repo"
import { playerCreate, teamGet } from "./repo-team"
import { RoutePostArgsWithQuery } from "./route"
import { messageView, when } from "./shared"
import { equals } from "./utils"
import { assert, validate, validateObject } from "./validation"
import { dataPlayerNameValidator, queryTeamIdValidator } from "./validators"

const formId = "add-player"

interface AddPlayerViewArgs {
    name: string | undefined
    posted: string | undefined
    playersExist: boolean
    action?: string
    message: Message
    target?: string
}

export function addPlayerForm({name, posted, playersExist, action, message, target}: AddPlayerViewArgs) {
    let action_ = action ? html`action="${action}"` : null
    let playerAdded = posted === formId
    return html`
${when(!!message, messageView(message))}
<form class=form method=post ${action_} $${target}>
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

    let existingPlayer = team.players.find(x => equals(x.name, name))
    await assert.isFalse(!!existingPlayer, `The player name "${existingPlayer?.name}" has already been chosen.`)
        ?.catch(() => reject({ players: { name } }))

    await Promise.all([playerCreate(teamId, name), cache.push({ posted: formId })])

    return
}
