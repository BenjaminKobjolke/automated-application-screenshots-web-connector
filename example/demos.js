const { DemoRegistry, startAutomationDemo } = AutomatedScreenshotConnector;
const registry = new DemoRegistry();

registry.add(
  {
    id: 1,
    name: "sample-tour",
    steps: [
      { type: "wait_for", selector: "#visitor-name" },
      { type: "type_text", selector: "#visitor-name", text: "Ada Lovelace" },
      { type: "click", selector: "#show-result" },
      { type: "wait_for", selector: "#greeting:not([hidden])" },
      { type: "screenshot", name: "form-filled" },
      { type: "scroll", selector: "#details" },
      { type: "click", selector: "#continue", navigates: true },
      { type: "wait_for", selector: "#second-page-ready" },
      { type: "screenshot", name: "second-page" },
    ],
  },
  {
    id: 2,
    name: "in-page",
    steps: [
      { type: "wait_for", selector: "#sample-form" },
      { type: "click", selector: "#show-result" },
      { type: "screenshot", name: "in-page" },
    ],
  },
);

void startAutomationDemo({ registry });
