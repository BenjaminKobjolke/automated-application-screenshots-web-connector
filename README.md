# Automated Screenshot Web Connector

An embedded JavaScript and TypeScript library that lets a web app run registered demos when the automated screenshot tool opens it. The connector is inactive during ordinary visits and communicates with the tool over a loopback WebSocket.

## Requirements

- Node.js and npm for building this checkout (the package itself has no runtime dependencies).
- A modern browser in the app that embeds the connector.
- The automated screenshot tool with web-target support for taking screenshots or recording demos.

## Build and test

```sh
npm install
npm run build
npm run typecheck
npm test
```

The build creates `dist/index.js` and `dist/automated-screenshot-web-connector.js`, plus TypeScript declarations. `dist/` is generated and ignored by Git.

## Use with a bundler

Build this package, then install it from its directory in the web application:

```sh
npm install ../automated-application-screenshots-web-connector
```

Register a script and initialize the connector on every page that a demo may visit:

```ts
import { DemoRegistry, startAutomationDemo } from "automated-screenshot-web-connector";

const demos = new DemoRegistry();
demos.add({
  id: 1,
  name: "welcome-tour",
  steps: [
    { type: "wait_for", selector: "#welcome" },
    { type: "screenshot", name: "welcome" },
  ],
});

void startAutomationDemo({ registry: demos });
```

For localized text or demo-specific setup, pass an `onPrepare` callback. See the [integration guide](docs/INTEGRATION.md) for all step types, navigation, safety, and tool configuration.

## Use from a plain script tag

Copy the generated IIFE bundle to the web app's public assets and load it before your demo registration script:

```html
<script src="/assets/automated-screenshot-web-connector.js"></script>
<script>
  const { DemoRegistry, startAutomationDemo } = AutomatedScreenshotConnector;
  const demos = new DemoRegistry();
  demos.add({ id: 1, name: "welcome-tour", steps: [{ type: "screenshot", name: "welcome" }] });
  void startAutomationDemo({ registry: demos });
</script>
```

## Local sample

Build the bundles and run the two-page sample server with `npm run build` and `npm run serve:example`. The sample tool configuration is `example/screenshot-tool.example.json`. See the integration guide for running it alongside the screenshot tool.
