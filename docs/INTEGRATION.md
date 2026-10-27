# Web app integration

The web connector is a small JavaScript or TypeScript library embedded in the app being captured. The screenshot tool opens a configured page, adds demo query parameters, and serves the demo through a local WebSocket. The app must load the connector on every page a demo can visit.

## Install and initialize

Build this checkout with `npm run build`. For an app with a bundler, install the checkout directory with npm and import its package entry. For a plain script app, copy `dist/automated-screenshot-web-connector.js` into the app's public assets and load it before the app's registration script.

Create a registry once for each page load and register the demos that page can run. It is fine for each page to register the same complete set: the connector selects the requested id, and the navigation state resumes at the saved step on the destination page.

```ts
import { DemoRegistry, startAutomationDemo } from "automated-screenshot-web-connector";

const registry = new DemoRegistry();
registry.add({
  id: 1,
  name: "overview",
  steps: [
    { type: "wait_for", selector: "#overview" },
    { type: "type_text", selector: "#search", text: "{search_term}" },
    { type: "screenshot", name: "search-results" },
  ],
});

void startAutomationDemo({
  registry,
  onPrepare: ({ language, settings }) => {
    // Read these values when preparing app-specific page state.
  },
});
```

`onPrepare` runs after the tool authorizes a fresh demo and before the first step. The tool can supply localized `texts`; `{search_term}` in `type_text` is replaced from that map. Missing placeholders are reported to the tool as a demo error.

## Demo steps

Steps are objects. The same shapes can be provided in a page-owned `DemoScript` or in the screenshot tool's demo configuration. Selectors use `document.querySelector`; stable ids such as `#save-button` are preferable to styling classes or fragile positional selectors.

| Type | Fields | Behavior |
| --- | --- | --- |
| `click` | `selector` (string), optional `navigates` (boolean) | Waits for the element, scrolls it into view, then clicks. Set `navigates: true` only for a full-page navigation. |
| `type_text` | `text` (string), optional `selector`, optional `char_delay_ms` (number) | Types into the selected input or the active input. Each character emits an input event; a change event follows. `{key}` placeholders use the tool's `texts` map. |
| `scroll` | `selector` (string), or `x`/`y` (non-negative numbers) | Scrolls an element into view or scrolls the page to coordinates. |
| `wait_for` | `selector` (string), optional `timeout_ms` (positive number) | Waits for a matching element, for up to 10 seconds by default. |
| `pause` | `seconds` (non-negative number) | Waits for the requested duration. |
| `screenshot` | `name` (string) | Waits for the page to settle and asks the tool to capture a still. The name must match `[A-Za-z0-9][A-Za-z0-9_-]{0,127}`. The step waits for the tool's acknowledgement before continuing. |
| `custom` | `name` (string) | Calls the matching callback in `registry.customActions`. Unknown names fail the demo. |

Example of a multi-page tour:

```ts
registry.add({
  id: 2,
  name: "account-tour",
  steps: [
    { type: "click", selector: "#account-link", navigates: true },
    { type: "wait_for", selector: "#account-heading" },
    { type: "screenshot", name: "account-page" },
  ],
});
```

The connector saves the next step before a navigating click and resumes from `sessionStorage` after the new page loads. The destination must initialize the connector too. A click without `navigates: true` is treated as an in-page action, such as a single-page-app route change.

## Safety and normal page loads

Query parameters alone never run a demo. The connector starts only after a WebSocket connection to `127.0.0.1` receives a matching `start` message from the screenshot tool. If the page has no demo parameters, no saved navigation state, or cannot connect to the local tool, the connector stays inactive and leaves the host app alone. The tool accepts only the configured app origin.

The tool opens the page with these query parameters:

- `automation-demo=<positive demo id>`
- `automation-demo-port=<local WebSocket port>`
- optional `automation-demo-language=<language>`

Existing query parameters are preserved. The connector connects to `ws://127.0.0.1:<port>/` and uses the WebSocket contract documented in [the screenshot tool's automation interface](https://github.com/BenjaminKobjolke/automated-application-screenshots/blob/main/docs/AUTOMATION_INTERFACE.md#websocket-contract).

## Configure and run the sample

The `example/` folder contains a form page, a second page for navigation-resume coverage, two registered demos, a loopback-only static server, and a ready-to-use tool config. The first demo fills and submits the form, requests a still, scrolls, navigates, and requests another still. The second demo stays on one page.

1. In this repository run `npm install`, `npm run build`, and `npm run serve:example`.
2. In the automated screenshot tool repository, run the configured sample:

   ```sh
   uv run screenshot-tool --config <path-to-this-repository>/example/screenshot-tool.example.json --demo all --compose
   ```

The tool config uses Microsoft Edge in headless mode on `http://127.0.0.1:8080/example`. The sample server binds only to loopback. The first demo is configured for GIF and MP4 output, while the in-page demo requests PNG output.
