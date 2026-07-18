`inter-regular.woff` is the Inter typeface (SIL Open Font License 1.1, https://openfontlicense.org),
bundled here so `loadDefaultFonts()` (`../../src/fonts.ts`) has a real font to hand satori for any
text-bearing slide template at runtime -- render-slides.ts (m2-06) is the first consumer.

Same file as `../../test/fixtures/inter-regular.woff` (copied from Prisma Studio's bundled build
assets, `prisma/build/public/assets/inter-all-400-normal.*.woff`, since this environment had no
outbound network access to fetch the font from Google Fonts directly). Kept as a separate copy
under `assets/` (rather than pointed at `test/`) so it ships as part of this package's runtime
output, not just its test fixtures.
