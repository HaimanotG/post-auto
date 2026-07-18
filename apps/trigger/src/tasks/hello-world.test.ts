import { describe, expect, it } from "vitest";
import { buildGreeting } from "./hello-world.js";

describe("buildGreeting", () => {
  it("greets the given name", () => {
    expect(buildGreeting({ name: "PostAuto" })).toEqual({ greeting: "Hello, PostAuto!" });
  });

  it("defaults to 'world' when no name is given", () => {
    expect(buildGreeting({})).toEqual({ greeting: "Hello, world!" });
  });
});
