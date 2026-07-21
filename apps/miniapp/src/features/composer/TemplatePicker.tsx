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

import { CheckCircleIcon } from "../../app/icons";

export interface TemplatePickerProps {
  value: SlideTemplateId;
  onChange: (templateId: SlideTemplateId) => void;
  templates?: TemplateOption[];
}

/** Composer UI for choosing which slide template renders the post's images. */
export function TemplatePicker({ value, onChange, templates = DEFAULT_TEMPLATE_OPTIONS }: TemplatePickerProps) {
  return (
    <fieldset>
      <legend className="px-1 pt-1.5 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
        Slide template
      </legend>
      <div className="overflow-hidden rounded-[14px] bg-pa-secondary-bg">
        {templates.map((template, index) => {
          const checked = value === template.id;
          return (
            <label
              key={template.id}
              htmlFor={`template-picker-${template.id}`}
              className={`flex items-center gap-3 px-3.5 py-3.5 ${
                index < templates.length - 1 ? "border-b border-pa-separator" : ""
              }`}
            >
              <input
                id={`template-picker-${template.id}`}
                type="radio"
                name="slide-template"
                value={template.id}
                checked={checked}
                onChange={() => onChange(template.id)}
                className="sr-only"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-pa-text">{template.label}</span>
                <span className="mt-px block text-[12.5px] text-pa-hint">{template.description}</span>
              </span>
              {checked ? (
                <CheckCircleIcon className="flex-none text-pa-link" />
              ) : (
                <span className="h-5 w-5 flex-none rounded-full border-[1.6px] border-pa-hint" aria-hidden="true" />
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
