import { task } from "@trigger.dev/sdk/v3";

export type HelloWorldPayload = {
  name?: string;
};

export function buildGreeting(payload: HelloWorldPayload): { greeting: string } {
  return { greeting: `Hello, ${payload.name ?? "world"}!` };
}

export const helloWorldTask = task({
  id: "hello-world",
  run: async (payload: HelloWorldPayload) => buildGreeting(payload),
});
