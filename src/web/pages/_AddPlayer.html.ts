import { cache, Message } from "../server/db.js"
import html from "../server/html.js"
import { reject } from "../server/repo.js"
import { playerCreate, teamGet } from "../server/repo-team.js"
import { RoutePostArgsWithQuery } from "../server/route.js"
import { messageView, when } from "../server/shared.js"
import { equals } from "../server/utils.js"
import { assert, validate, validateObject } from "../server/validation.js"
import { dataPlayerNameValidator, queryTeamIdValidator } from "../server/validators.js"

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
}
