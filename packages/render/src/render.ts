import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";
import satori, { type Font as SatoriFont } from "satori";
import type { ReactNode } from "react";
import type { ObjectStorage, UploadResult } from "./storage.js";

export type { SatoriFont };

export interface RenderDimensions {
  width: number;
  height: number;
}

export interface RenderTreeOptions extends RenderDimensions {
  /** Fonts satori needs to lay out any text nodes in the tree. */
  fonts: SatoriFont[];
}

/**
 * Slide templates (packages/render/templates/*.tsx, added in m2-05) return
 * plain satori element trees. This module only knows how to turn a tree
 * into pixels — it has no opinion on what a template looks like.
 */
export type SatoriTree = ReactNode;

/** Lays out a satori tree and returns its SVG markup. */
export async function renderTreeToSvg(tree: SatoriTree, options: RenderTreeOptions): Promise<string> {
  return satori(tree, {
    width: options.width,
    height: options.height,
    fonts: options.fonts,
  });
}

/** Rasterizes SVG markup to a PNG buffer at the given target width. */
export function svgToPng(svg: string, width: number, resvgOptions: ResvgRenderOptions = {}): Buffer {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    ...resvgOptions,
  });
  return resvg.render().asPng();
}

/** Lays out a satori tree and rasterizes it straight to a PNG buffer. */
export async function renderTreeToPng(tree: SatoriTree, options: RenderTreeOptions): Promise<Buffer> {
  const svg = await renderTreeToSvg(tree, options);
  return svgToPng(svg, options.width);
}

export interface RenderSlideParams {
  tree: SatoriTree;
  dimensions: RenderDimensions;
  fonts: SatoriFont[];
  storage: ObjectStorage;
  /** Storage key (e.g. object path) the rendered PNG is uploaded under. */
  key: string;
}

export interface RenderedSlide extends UploadResult, RenderDimensions {}

/** Renders a satori tree to PNG and uploads it, ready to be persisted as a `rendered_slides` row. */
export async function renderSlide(params: RenderSlideParams): Promise<RenderedSlide> {
  const png = await renderTreeToPng(params.tree, {
    width: params.dimensions.width,
    height: params.dimensions.height,
    fonts: params.fonts,
  });
  const uploaded = await params.storage.upload(params.key, png, "image/png");
  return { ...uploaded, width: params.dimensions.width, height: params.dimensions.height };
}
