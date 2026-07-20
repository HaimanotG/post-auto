/**
 * Formats a post's master caption + product data into Facebook Marketplace
 * listing text. No Meta API call — Marketplace has no listing-creation API
 * (see PLAN.md's Facebook Marketplace assist section), so this only prepares
 * text for the mini app's "copy listing text" / Web Share handoff.
 */

/** Marketplace product titles are capped around 100 chars in Meta's own UI. */
const MAX_TITLE_LENGTH = 100;
const DEFAULT_CURRENCY = "ETB";
const TITLE_TRUNCATION_SUFFIX = "…";

export interface MarketplaceListingInput {
  captionMaster: string;
  productName?: string | null;
  price?: number | string | null;
  currency?: string;
  description?: string | null;
}

export interface MarketplaceListing {
  title: string;
  /** Formatted price string (e.g. "1,200 ETB"), or null when no price is known. */
  priceText: string | null;
  description: string;
  /** Single copy-paste block combining title, price, and description. */
  listingText: string;
}

function firstNonEmptyLine(text: string): string {
  const line = text.split("\n").find((candidate) => candidate.trim().length > 0);
  return (line ?? text).trim();
}

function truncateTitle(title: string): string {
  if (title.length <= MAX_TITLE_LENGTH) return title;
  return title.slice(0, MAX_TITLE_LENGTH - TITLE_TRUNCATION_SUFFIX.length).trimEnd() + TITLE_TRUNCATION_SUFFIX;
}

function deriveTitle(input: MarketplaceListingInput): string {
  const productName = input.productName?.trim();
  const raw = productName && productName.length > 0 ? productName : firstNonEmptyLine(input.captionMaster);
  return truncateTitle(raw);
}

function formatPrice(price: number | string | null | undefined, currency: string): string | null {
  if (price === null || price === undefined) return null;
  const amount = typeof price === "string" ? Number(price) : price;
  if (!Number.isFinite(amount)) return null;
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

function deriveDescription(input: MarketplaceListingInput): string {
  const description = input.description?.trim();
  if (description && description.length > 0) return description;
  return input.captionMaster.trim();
}

function buildListingText(title: string, priceText: string | null, description: string): string {
  const lines = [title];
  if (priceText) lines.push(priceText);
  return `${lines.join("\n")}\n\n${description}`.trim();
}

export function formatMarketplaceListing(input: MarketplaceListingInput): MarketplaceListing {
  const title = deriveTitle(input);
  const priceText = formatPrice(input.price, input.currency ?? DEFAULT_CURRENCY);
  const description = deriveDescription(input);

  return {
    title,
    priceText,
    description,
    listingText: buildListingText(title, priceText, description),
  };
}
