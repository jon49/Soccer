import type { Team, TeamPlayer } from "../server/db.js"
import type { RoutePostHandler, RoutePage } from "@jon49/sw/routes.middleware.js"

const {
    html,
    layout,
    repo: { teamGet, playerCreate, teamSave },
    utils: { equals, when },
    validation: {
        assert, validate, validateObject,
        dataPlayerNameActiveValidator, dataPlayerNameValidator, dataTeamNameYearActiveValidator, queryTeamIdPlayerIdValidator, queryTeamIdValidator 
    },
    views: { teamNav },
} = self.app

interface PlayersEditView {
    team: Team
}

async function start(query: any): Promise<PlayersEditView> {
    let { teamId } = await validateObject(query, queryTeamIdValidator)

    let team = await teamGet(teamId)

    return { team }
}

function render(o: PlayersEditView) {
    let { team } = o

    return html`
<h2 id=subheading>${o?.team.name ?? "Unknown"} (${o?.team.year})</h2>

<nav>
    <ul>
        <li><a href="#team">Team</a></li>
        <li><a href="#players">Players</a></li>
    </ul>
</nav>

<h3 id=team>Team Settings</h3>
<form
    onchange="this.requestSubmit()"
    class=form
    method=post
    action="/web/players?handler=editTeam&teamId=${team.id}"
    hf-target=main>
    <div class=inline>
        <label for=team-input>Team Name:</label><input id=team-input name=name type=text value="${team.name}">
    </div>
    <div class=inline>
        <label for=year-input>Year:</label> <input id=year-input name=year type=text value="${team.year}">
    </div>
    <div id=team-active>
        <label class=toggle>
            <input name=active type=checkbox $${when(team.active, "checked")}>
            <span class="off" role="button">Inactive</span>
            <span class="on" role="button">Active</span>
        </label>
    </div>
</form>

<h3 id=players>Players Settings</h3>
${when(!team.players.length, () => html`<p>No players have been added.</p>`)}

<div id=player-cards  class=grid style="--grid-item-width: 200px;">
    ${team.players.map(x => playerView(x, team.id))}
</div>

<form
    class=form
    method=post
    action="/web/players?handler=addPlayer&teamId=${team.id}"
    hf-target="#player-cards"
    hf-swap=append
    >
    <div>
        <label for=new-player>Add Player Name</label>
        <input id=new-player name=name type=text required ${when(!team.players.length, "autofocus")}>
    </div>
</form>
`
}

function playerView(player: TeamPlayer, teamId: number) {
    let teamPlayerQuery = `teamId=${teamId}&playerId=${player.id}`
    let playerId_: string = `edit-player${player.id}`

    return html`
<article id="active-${playerId_}" class="player-card">
    <form
        onchange="this.requestSubmit()"
        class=form
        method=post
        action="/web/players?handler=editPlayer&$${teamPlayerQuery}"
        >
        <fieldset role=group>
            <input class="basis-175" name=name type=text value="${player.name}" placeholder="Player name">
            <input name=number type=number value="${player.number}" placeholder="#">
        </fieldset>
        <div>
            <label class=toggle>
                <input
                    name=active
                    type=checkbox
                    $${when(player.active, "checked")}>
                <span class="off full-width" role="button">Inactive</span>
                <span class="on full-width" role="button">Active</span>
            </label>
        </div>
    </form>
</article>`
}

const postHandlers: RoutePostHandler = {
    async editPlayer({ data: d, query: q }) {
        let [{ teamId, playerId }, { name: playerName, active, number }] = await validate([
            validateObject(q, queryTeamIdPlayerIdValidator),
            validateObject(d, dataPlayerNameActiveValidator)
        ])
        let team = await teamGet(teamId)

        let playerIndex = team.players.findIndex(x => x.id === playerId)
        await assert.isFalse(playerIndex === -1, `Unknown player "${playerId}"`)
        let player = team.players[playerIndex]

        // Check for duplicates
        let existingPlayer = team.players.find(x => equals(x.name, playerName))
        await assert.isFalse(
            !equals(player.name, playerName) && !!existingPlayer,
            `The player name "${existingPlayer?.name}" has already been chosen.`)

        player.name = playerName
        player.active = active
        player.number = number
        // Player name will also need to be updated for the individual player when implemented!
        await teamSave(team)

        return { status: 204 }
    },

    async addPlayer({ data, query }) {
        let [{ teamId }, { name }] = await validate([
            validateObject(query, queryTeamIdValidator),
            validateObject(data, dataPlayerNameValidator)
        ])

        let team = await teamGet(teamId)

        let existingPlayer = team.players.find(x => equals(x.name, name))
        await assert.isFalse(!!existingPlayer, `The player name "${existingPlayer?.name}" has already been chosen.`)

        let player = await playerCreate(teamId, name)

        return {
            status: 200,
            body: playerView(player, teamId),
            headers: {
                "hf-reset": ""
            }
        }
    },

    async editTeam({ data, query }) {
        let [{ name: newTeamName, year, active }, { teamId }] = await validate([
            validateObject(data, dataTeamNameYearActiveValidator),
            validateObject(query, queryTeamIdValidator),
        ])

        let team = await teamGet(teamId)
        team.active = active
        team.year = year
        team.name = newTeamName
        await teamSave(team)
        return { status: 204 }
    }
}

const route: RoutePage = {
    async get({ query }) {
        let result = await start(query)
        return layout({
            head: `<style>
.player-card {
    min-width: 200px;
}
.basis-175 {
    flex-basis: 175%;
}
</style>`,
            main: render(result),
            nav: teamNav(result.team.id),
            title: `Players - ${result.team.name} (${result.team.year})}`
        })
    },
    post: postHandlers
}

export default route

