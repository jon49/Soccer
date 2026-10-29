import type { Team, TeamId } from "../server/db.js";
import type { RoutePostHandler, RoutePage, RouteGetHandler } from "@jon49/sw/routes.middleware.js";

const {
  html,
  layout,
  repo: { teamGet, positionGetAll, positionsSave },
  validation: {
    createArrayOf,
    createPositiveWholeNumber,
    createString25,
    createNumber,
    maybe,
    required,
    queryTeamIdValidator,
    validateObject,
  },
  views: { teamNav },
  utils: { when },
} = self.sw;

interface PositionView {
  positions: string[][];
  team: Team;
}

async function start(query: any): Promise<PositionView> {
  let { teamId } = await validateObject(query, queryTeamIdValidator);
  let [positions, team] = await Promise.all([positionGetAll(teamId), teamGet(teamId)]);
  return { positions: positions.positions, team };
}

function render({ team, positions }: PositionView) {
  return html`
<h2>${team.name} — Formation</h2>

<p>
  <a href="?handler=showTemplates&teamId=${team.id}" role="button" class="nc-button">Use a template.</a>
</p>

<div class=formation-editor>
  ${formationPreview(positions)}
  <div>
    <h3>Grid</h3>
    ${positionsNameView(positions, team.id)}
  </div>
</div>`;
}

// The formation as it stands, on a small pitch. Rebuilt with the grid
// whenever a row changes size.
function formationPreview(positions: string[][]) {
  let grid = positions.map((x) => x.length).filter((x) => x);
  let name = formationName(grid);
  return html`<figure id=formationPreview class=formation-preview>
    <div class=pitch>${getTemplate(grid, { preview: true })}</div>
    <figcaption>${name ? `Formation: ${name}` : "No positions yet"}</figcaption>
  </figure>`;
}

function positionsNameView(positions: string[][], teamId: TeamId) {
  return html`<form
  id=positionsForm
  class=form
  method=post
  action="?teamId=${teamId}&handler=editPositions"
  _change=submit>
  ${function* positionViews() {
    let count = 0;
    let row = 0;
    yield html`<div class="names-row empty-row">
<button id="inc--1" formaction="?teamId=${teamId}&handler=gridSize&action=inc&row=-1" class="inc add-row" aria-label="Add a row at the top">+ Row</button>
</div>`;

    for (let xs of positions) {
      yield html`<div class="names-row">
<button id="dec-${row}" formaction="?teamId=${teamId}&handler=gridSize&action=dec&row=${row}" class=inc aria-label="Remove a position from row ${row + 1}">&minus;</button>
            <fieldset class="names nc-join">`;
      yield xs.map((x) => html`<input id="position${count++}" name="names[]" value="${x}">`);
      yield html`</fieldset>
<button id="inc-${row}" formaction="?teamId=${teamId}&handler=gridSize&action=inc&row=${row}" class=inc aria-label="Add a position to row ${row + 1}">+</button>
    </div>`;
      row++;
    }

    yield html`<div class="names-row empty-row">
<button id="inc-${row}" formaction="?teamId=${teamId}&handler=gridSize&action=inc&row=${row}" class="inc add-row" aria-label="Add a row at the bottom">+ Row</button>
</div>`;
  }}
</form>`;
}

const templates = {
  "4": [
    [1, 2, 1],
    [1, 1, 2],
  ],
  "7": [
    [1, 3, 2, 1],
    [1, 2, 3, 1],
    [2, 2, 2, 1],
  ],
  "9": [
    [2, 3, 3, 1],
    [3, 3, 2, 1],
    [2, 4, 2, 1],
    [3, 2, 3, 1],
  ],
  "11": [
    [2, 4, 4, 1],
    [3, 3, 4, 1],
    [2, 5, 3, 1],
    [1, 3, 2, 4, 1],
    [3, 4, 3, 1],
  ],
};

type PossibleTemplatePlayerCounts = keyof typeof templates;

function getNumberOfPlayers(numberOfPlayers: number): PossibleTemplatePlayerCounts {
  if (["4", "7", "9", "11"].includes("" + numberOfPlayers)) {
    // @ts-ignore
    return "" + numberOfPlayers;
  }
  return "4";
}

// Rows run down from the top. A template keeps the top clear for its name;
// the preview spreads them over the whole pitch.
function getCircles({
  count,
  y,
  total,
  spread,
}: {
  count: number;
  y: number;
  total: number;
  spread?: boolean;
}) {
  let x = Math.round(1e4 / (count + 1)) / 100;
  let cy = spread ? (100 * (y - 0.5)) / total : 90 * (y / total);
  let circles = "";
  for (let i = 0; i < count; i++) {
    circles += `<circle cx="${x * (i + 1)}%" cy="${cy}%" r="3%" fill="currentColor" />`;
  }
  return circles;
}

// Defenders first, as formations are named: "1-2-1". With four or more rows
// the last is the goalkeeper, who isn't counted.
function formationName(positions: number[]) {
  return positions.length === 3
    ? [...positions].reverse().join("-")
    : [...positions].reverse().slice(1).join(" - ");
}

function getTemplate(positions: number[], { preview = false } = {}) {
  let name = formationName(positions);
  return html`
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  $${preview ? "" : `<text x="1%" y="10%" fill="currentColor" font-weight="bold" font-size="20">${name}</text>`}
  $${function* rows() {
    let total = positions.length;
    let y = 1;
    for (let count of positions) {
      yield getCircles({ count, y, total, spread: preview });
      y++;
    }
  }}
</svg>
`;
}

function getTemplates(teamId: TeamId, numberOfPlayers: number) {
  let playerCount = getNumberOfPlayers(numberOfPlayers);
  let grid = templates[playerCount];
  return html`
<div id=templates class=grid style="--grid-item-width: 250px;">
    ${grid.map(
      (x, i) => html`
  <form method=post action="?handler=createFormation&teamId=${teamId}" class=inline>
  <button class="outline secondary formation">${getTemplate(x)}</button>
  <input type=hidden name=index value="${i}">
  <input type=hidden name=numberOfPlayers value="${numberOfPlayers}">
  </form>`,
    )}
</div>`;
}

async function getPositionTemplates(teamId: TeamId) {
  let { positions } = await positionGetAll(teamId);
  let positionCount = positions.reduce((acc, xs) => acc + xs.length, 0) || 4;

  return html`
  <main id=main>
    <a href="/web/positions?teamId=${teamId}&hz" >Cancel</a>
    <h2>Formation Templates</h2>

    <form _change=submit>
      <fieldset class=fieldset-outline>
        <legend>Number of players</legend>
        <label class="inline p-1">
          <input type=radio name=numberOfPlayers value=4 ${when(positionCount === 4, "checked")}>
          &nbsp;4
        </label>
        <label class="inline p-1">
          <input type=radio name=numberOfPlayers value=7 ${when(positionCount === 7, "checked")}>
          &nbsp;7
        </label>
        <label class="inline p-1">
          <input type=radio name=numberOfPlayers value=9 ${when(positionCount === 9, "checked")}>
          &nbsp;9
        </label>
        <label class="inline p-1">
          <input type=radio name=numberOfPlayers value=11 ${when(positionCount === 11, "checked")}>
          &nbsp;11
        </label>
      </fieldset>
      <input type=hidden name=teamId value="${teamId}">
      <input type=hidden name=handler value="getTemplates">
    </form>

    ${getTemplates(teamId, positionCount)}

  </main>`;
}

const positionNames = ["Striker", "Forward", "Midfield", "Fullback", "Goalkeeper"];

const positionNameSuffix = {
  "5": ["L", "LC", "C", "RC", "R"],
  "4": ["L", "LC", "RC", "R"],
  "3": ["L", "C", "R"],
  "2": ["L", "R"],
  "1": [""],
};

function setPositions(grid: number[]): string[][] {
  let names = [...positionNames];
  if (grid.length === 4) {
    names.splice(0, 1);
  } else if (grid.length === 3) {
    names.splice(0, 1).splice(3, 1);
  }
  let positions = [];
  for (let i = 0; i < grid.length; i++) {
    let column = grid[i];
    let name = names[i];
    let row = [];
    // @ts-ignore
    for (let suffix of positionNameSuffix["" + column]) {
      row.push(`${name} ${suffix}`);
    }
    positions.push(row);
  }

  return positions;
}

const positionValidator = {
  names: createArrayOf(maybe(createString25("Position Name"))),
};

const gridValidator = {
  ...queryTeamIdValidator,
  action: createString25("Action"),
  row: (num: number) => createNumber("Row", num),
};

const postHandlers: RoutePostHandler = {
  async gridSize({ query }) {
    let { teamId, action, row } = await validateObject(query, gridValidator);

    let o = await positionGetAll(teamId);

    let positions = o.positions;
    for (let i = 0; i < positions.length; i++) {
      if (row !== i) continue;

      let xs = positions[i];
      if (xs) {
        xs.length = action === "inc" ? xs.length + 1 : Math.max(0, xs.length - 1);
        for (let j = 0; j < xs.length; j++) {
          xs[j] ??= "";
        }
      } else {
        positions[i] = [""];
      }
    }

    if (row === -1) {
      positions.unshift([""]);
    }

    if (row > positions.length - 1) {
      positions.push([""]);
    }

    positions = positions.filter((xs) => xs.length);
    await positionsSave(teamId, {
      ...o,
      positions,
    });

    return html`${positionsNameView(positions, teamId)}${formationPreview(positions)}`;
  },

  async editPositions({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { names } = await validateObject(data, positionValidator);
    let o = await positionGetAll(teamId);
    let positions: string[][] = [];
    for (let grid of o.positions) {
      positions.push(names.splice(0, grid.length).map((x) => x || ""));
    }
    o.positions = positions;
    await positionsSave(teamId, o);
    return { status: 200 };
  },

  async createFormation({ query, data }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    let { index, numberOfPlayers } = await validateObject(data, {
      index: createPositiveWholeNumber("Index"),
      numberOfPlayers: createPositiveWholeNumber("Number of Players"),
    });

    let o = await positionGetAll(teamId);
    let playerCount = getNumberOfPlayers(numberOfPlayers);
    let grid = await required(templates[playerCount][index], "Template not found!");
    let positions = setPositions(grid);

    await positionsSave(teamId, {
      ...o,
      positions,
    });

    return html`<main id=main>${render(await start(query))}</main>`;
  },
};

const getHandlers: RouteGetHandler = {
  async get({ query }) {
    const result = await start(query);
    if (query.hz === "") {
      return html`<main id=main>${render(result)}</main>`;
    }
    return layout({
      main: render(result),
      nav: teamNav(result.team.id),
      title: `Formation - ${result.team.name} (${result.team.year})`,
    });
  },

  async showTemplates({ query }) {
    let { teamId } = await validateObject(query, queryTeamIdValidator);
    return getPositionTemplates(teamId);
  },

  async getTemplates({ query }) {
    let { teamId, numberOfPlayers } = await validateObject(query, {
      ...queryTeamIdValidator,
      numberOfPlayers: createPositiveWholeNumber("Number of Players"),
    });

    return html`${getTemplates(teamId, numberOfPlayers)}`;
  },
};

const route: RoutePage = {
  get: getHandlers,
  post: postHandlers,
};

export default route;
