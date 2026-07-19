/**
 * Matches apps/trigger/src/tasks/render-slides.ts's `SlideTemplateId` union
 * (single-product/price-highlight/carousel) -- kept as a local literal type
 * rather than importing across apps, since the mini app has no build
 * dependency on apps/trigger or packages/render.
 */
export type SlideTemplateId = "single-product" | "price-highlight" | "carousel";

export interface TemplateOption {
  id: SlideTemplateId;
  label: string;
  description: string;
}

export const DEFAULT_TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: "single-product",
    label: "Single product",
    description: "One clean photo with your product name and price.",
  },
  {
    id: "price-highlight",
    label: "Price highlight",
    description: "Bold price callout over your product photo.",
  },
  {
    id: "carousel",
    label: "Carousel",
    description: "Multiple photos as a swipeable cover + detail slides.",
  },
];

export interface TemplatePickerProps {
  value: SlideTemplateId;
  onChange: (templateId: SlideTemplateId) => void;
  templates?: TemplateOption[];
}

/** Composer UI for choosing which slide template renders the post's images. */
export function TemplatePicker({ value, onChange, templates = DEFAULT_TEMPLATE_OPTIONS }: TemplatePickerProps) {
  return (
    <fieldset>
      <legend>Slide template</legend>
      {templates.map((template) => (
        <label key={template.id} htmlFor={`template-picker-${template.id}`}>
          <input
            id={`template-picker-${template.id}`}
            type="radio"
            name="slide-template"
            value={template.id}
            checked={value === template.id}
            onChange={() => onChange(template.id)}
          />
          {template.label}
          <p>{template.description}</p>
        </label>
      ))}
    </fieldset>
  );
}
