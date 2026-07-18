import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { SatoriFont } from "./render.js";

const DEFAULT_FONT_PATH = fileURLToPath(new URL("../assets/fonts/inter-regular.woff", import.meta.url));

/**
 * Loads the bundled Inter font (SIL OFL 1.1, see assets/fonts/README.md) that
 * satori needs to lay out any text node in the slide templates. This is the
 * only font the templates currently use, so a single default weight/style is
 * enough; callers that need more (bold, italic, other typefaces) can build
 * their own SatoriFont[] instead of calling this.
 */
export async function loadDefaultFonts(): Promise<SatoriFont[]> {
  const data = await readFile(DEFAULT_FONT_PATH);
  return [{ name: "Inter", data, weight: 400, style: "normal" }];
}
