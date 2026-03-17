import {
  DemoCard,
  DemoCodeBlock,
  DemoIntro,
  DemoLinkCard,
  DemoPageShell,
  DemoSection,
} from "../shared/primitives";
import { useOverviewDemoSession } from "../shared/session";

export function OverviewDemoPage() {
  useOverviewDemoSession();

  return (
    <DemoPageShell>
      <DemoCard>
        <DemoIntro
          eyebrow="OpenAI Voice Control React"
          title="Register your tools. Let voice drive the UI."
          body="A lightweight voice runtime for React apps built around app-owned tools."
          emphasis={
            <>
              Define your tools with <code>defineVoiceTool()</code>, create a
              reusable controller, then render the widget with{" "}
              <code>controller=&#123;controller&#125;</code>.
            </>
          }
        />

        <DemoSection
          heading="Install"
          description="Install the package from a local checkout along with zod."
        >
          <DemoCodeBlock language="bash">
            {`npm add ../path/to/realtime-voice-component zod`}
          </DemoCodeBlock>
        </DemoSection>

        <DemoSection
          heading="App Code"
          description="Define the tool, create a reusable controller, and render the widget with it."
        >
          <DemoCodeBlock language="tsx">{`import {
  VoiceControlWidget,
  createVoiceControlController,
  defineVoiceTool
} from "realtime-voice-component";
import "realtime-voice-component/styles.css";
import { z } from "zod";

const setTheme = defineVoiceTool({
  name: "set_theme",
  description: "Set the page theme.",
  parameters: z.object({
    theme: z.enum(["light", "dark"])
  }),
  execute: ({ theme }) => {
    document.documentElement.dataset.theme = theme;
    return { ok: true, theme };
  }
});

const controller = createVoiceControlController({
  auth: { sessionEndpoint: "/session" },
  instructions: "Use only the provided tools.",
  outputMode: "tool-only",
  tools: [setTheme]
});

export function Example() {
  return <VoiceControlWidget controller={controller} snapToCorners />;
}`}</DemoCodeBlock>
        </DemoSection>

        <DemoSection
          heading="Server Code"
          description="Proxy the browser SDP offer and session config to OpenAI."
        >
          <DemoCodeBlock language="javascript">{`app.post("/session", async (request, response) => {
  const contentType = request.header("content-type");

  const realtimeResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${process.env.OPENAI_API_KEY}\`,
      ...(contentType ? { "Content-Type": contentType } : {})
    },
    body: request,
    duplex: "half"
  });

  response
    .status(realtimeResponse.status)
    .type(realtimeResponse.headers.get("content-type") ?? "application/sdp")
    .send(await realtimeResponse.text());
});`}</DemoCodeBlock>
        </DemoSection>

        <DemoSection
          heading="Demos"
          description="Try the theme, form, and chess examples."
        >
          <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            <DemoLinkCard
              to="/demo/theme"
              eyebrow="Theme Demo"
              title="Theme Switching"
              body="Flip the page theme and jump to the form demo."
            />
            <DemoLinkCard
              to="/demo/form"
              eyebrow="Form Demo"
              title="Form Filling"
              body="Fill one field at a time and jump back to the theme demo."
            />
            <DemoLinkCard
              to="/demo/chess"
              eyebrow="Chess Demo"
              title="Shared Board State"
              body="Play moves, ask for hints, and get engine suggestions on one board."
            />
          </div>
        </DemoSection>
      </DemoCard>
    </DemoPageShell>
  );
}
