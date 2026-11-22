import type { RoutePage } from "@jon49/sw/routes.middleware.js";
import type { InstallDevice } from "../js/install-device.js";

const {
  html,
  layout,
  views: { teamsNav },
} = self.sw;

type Html = AsyncGenerator<any, void, unknown>;

interface HowTo {
  device: InstallDevice;
  title: string;
  steps: Html;
}

// How to install, for each browser. js/install.ts opens the one for this
// device and puts it first; the rest stay closed for anyone on another.
const howTos = (): HowTo[] => [
  {
    device: "ios-safari",
    title: "iPhone or iPad: Safari",
    steps: html`
      <ol>
        <li>
          Tap the <strong>Share</strong> button, a square with an arrow pointing up. If you don't see it,
          tap <strong>&middot;&middot;&middot;</strong> first.
        </li>
        <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
        <li>Leave <strong>Open as Web App</strong> on if you see it, then tap <strong>Add</strong>.</li>
        <li>Open Soccer from your home screen.</li>
      </ol>
    `,
  },
  {
    device: "ios-other",
    title: "iPhone or iPad: Chrome, Edge or Firefox",
    steps: html`
      <ol>
        <li>
          Tap the <strong>Share</strong> button. In Chrome it's in the address bar; in Edge or Firefox,
          open the menu first.
        </li>
        <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
        <li>Open Soccer from your home screen.</li>
      </ol>
      <p class="muted">Needs iOS 16.4 or later. On an older iPhone, open this page in Safari.</p>
    `,
  },
  {
    device: "android-chrome",
    title: "Android: Chrome or Edge",
    steps: html`
      <ol>
        <li>
          Tap the menu, <strong>&#8942;</strong> at the top right (<strong>&#8801;</strong> at the bottom
          in Edge).
        </li>
        <li>
          Tap <strong>Add to Home screen</strong> or <strong>Install app</strong>, then
          <strong>Install</strong>.
        </li>
        <li>Open Soccer from your home screen or app drawer.</li>
      </ol>
    `,
  },
  {
    device: "android-samsung",
    title: "Android: Samsung Internet",
    steps: html`
      <ol>
        <li>Tap the menu, <strong>&#8801;</strong> at the bottom right.</li>
        <li>
          Tap <strong>Add page to</strong>, then <strong>Home screen</strong>, then <strong>Add</strong>.
        </li>
        <li>Open Soccer from your home screen.</li>
      </ol>
    `,
  },
  {
    device: "android-firefox",
    title: "Android: Firefox",
    steps: html`
      <ol>
        <li>Tap the menu, <strong>&#8942;</strong>.</li>
        <li>
          Tap <strong>Add app to Home screen</strong> (or <strong>Install</strong>), then
          <strong>Add</strong>.
        </li>
        <li>Open Soccer from your home screen.</li>
      </ol>
    `,
  },
  {
    device: "desktop-chrome",
    title: "Computer: Chrome or Edge",
    steps: html`
      <ol>
        <li>
          Click the install icon at the right end of the address bar, or open the menu: in Chrome,
          <strong>&#8942;</strong> &rarr; <strong>Cast, save, and share</strong> &rarr;
          <strong>Install page as app</strong>; in Edge, <strong>&middot;&middot;&middot;</strong> &rarr;
          <strong>Apps</strong> &rarr; <strong>Install this site as an app</strong>.
        </li>
        <li>Click <strong>Install</strong>.</li>
      </ol>
    `,
  },
  {
    device: "mac-safari",
    title: "Mac: Safari",
    steps: html`
      <ol>
        <li>Choose <strong>File</strong> &rarr; <strong>Add to Dock</strong>.</li>
        <li>Click <strong>Add</strong>. Soccer opens from the Dock like any other app.</li>
      </ol>
      <p class="muted">Needs macOS Sonoma (14) or later.</p>
    `,
  },
  {
    device: "desktop-firefox",
    title: "Computer: Firefox",
    steps: html`
      <p>
        Firefox on a computer may not offer to install web apps. Open this page in Chrome, Edge or, on a
        Mac, Safari, and follow the steps for it.
      </p>
    `,
  },
];

const render = () => html`
<h2>Install the app</h2>

<div id=install>
  <p class=installed-note>You're using the installed app. To put it on another phone or
  computer, open this site there and follow its steps below.</p>

  <div>
    <p>Installing puts Soccer on your home screen like any other app. It opens full
    screen, without the browser around it, and works with no signal at the field.</p>

    <p id=installNowBox hidden>
      <button type=button id=installNow>Install Soccer</button>
    </p>

    <p id=installDetected hidden>The steps for this device are open below. The others are there
    if you need them.</p>

    <div id=installSteps class=install-steps>
      ${howTos().map(
        (x) => html`<details data-device="${x.device}">
          <summary>${x.title}</summary>
          ${x.steps}
        </details>`,
      )}
    </div>
  </div>
</div>`;

const route: RoutePage = {
  get: {
    async get() {
      return layout({
        main: render(),
        title: "Install",
        nav: teamsNav(),
      });
    },
  },
};

export default route;
