/** The subset of `businesses` a slide template needs to brand itself. */
export interface SlideBusiness {
  name: string;
  /** business.brand_colors' primary color, e.g. "#1a73e8". */
  primaryColor: string;
  logoUrl?: string;
}
