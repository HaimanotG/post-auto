/**
 * Falls back to the deployed Render API when VITE_API_BASE_URL isn't set at
 * build time (e.g. the Vercel project is missing the env var), so a
 * misconfigured deploy hits the real API instead of an unreachable
 * localhost:3000 and failing every request with "Failed to fetch".
 */
const PROD_FALLBACK_API_BASE_URL = "https://postauto-api.onrender.com";

export const DEFAULT_API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  (import.meta.env.PROD ? PROD_FALLBACK_API_BASE_URL : "http://localhost:3000");
