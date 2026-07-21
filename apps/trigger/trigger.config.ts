import { defineConfig } from "@trigger.dev/sdk";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_placeholder",
  runtime: "node",
  logLevel: "log",
  maxDuration: 300,
  dirs: ["./src/tasks"],
  build: {
    external: ["@resvg/resvg-js"],
    extensions: [
      prismaExtension({
        mode: "legacy",
        schema: "../../packages/db/prisma/schema.prisma",
      }),
    ],
  },
});
