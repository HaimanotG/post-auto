import type { SatoriTree } from "../render.js";

type Style = Record<string, string | number>;

/**
 * Templates build satori element trees as plain objects (no JSX/React
 * runtime, matching render.ts's approach in m2-04). Satori's default
 * `display` is `flex`, not block, so every container defaults to it here
 * unless a template opts out explicitly.
 */
export function box(style: Style, children: SatoriTree | SatoriTree[] = []): SatoriTree {
  return {
    type: "div",
    props: { style: { display: "flex", ...style }, children },
  } as unknown as SatoriTree;
}

/** A leaf div whose only child is a text string. */
export function text(value: string, style: Style = {}): SatoriTree {
  return {
    type: "div",
    props: { style: { display: "flex", ...style }, children: value },
  } as unknown as SatoriTree;
}

export function image(src: string, style: Style): SatoriTree {
  return { type: "img", props: { src, style } } as unknown as SatoriTree;
}
