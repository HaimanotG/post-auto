/**
 * One post_source_assets row's editable fields, in carousel slide order. The
 * first slide becomes CarouselCoverSlide, the rest CarouselDetailSlide (see
 * apps/trigger's render-slides.ts buildSlides) -- reordering this list is
 * reordering `orderIndex` before the post is submitted/re-rendered.
 */
export interface CarouselSlideDraft {
  id: string;
  rawUrl: string;
  productName: string;
  description: string;
}

export interface CarouselEditorProps {
  slides: CarouselSlideDraft[];
  onChange: (slides: CarouselSlideDraft[]) => void;
}

function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Composer UI for reordering carousel slides and editing each slide's caption. */
export function CarouselEditor({ slides, onChange }: CarouselEditorProps) {
  function updateSlide(index: number, patch: Partial<CarouselSlideDraft>) {
    onChange(slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    onChange(moveItem(slides, index, index - 1));
  }

  function moveDown(index: number) {
    if (index === slides.length - 1) return;
    onChange(moveItem(slides, index, index + 1));
  }

  function removeSlide(index: number) {
    onChange(slides.filter((_, i) => i !== index));
  }

  return (
    <ol>
      {slides.map((slide, index) => (
        <li key={slide.id}>
          <span>{index === 0 ? "Cover slide" : `Slide ${index + 1}`}</span>
          <img src={slide.rawUrl} alt="" />

          <label htmlFor={`carousel-slide-${slide.id}-product`}>Product name</label>
          <input
            id={`carousel-slide-${slide.id}-product`}
            type="text"
            value={slide.productName}
            onChange={(event) => updateSlide(index, { productName: event.target.value })}
          />

          <label htmlFor={`carousel-slide-${slide.id}-caption`}>Caption</label>
          <input
            id={`carousel-slide-${slide.id}-caption`}
            type="text"
            value={slide.description}
            onChange={(event) => updateSlide(index, { description: event.target.value })}
          />

          <button type="button" onClick={() => moveUp(index)} disabled={index === 0}>
            Move up
          </button>
          <button type="button" onClick={() => moveDown(index)} disabled={index === slides.length - 1}>
            Move down
          </button>
          <button type="button" onClick={() => removeSlide(index)} disabled={slides.length <= 1}>
            Remove slide
          </button>
        </li>
      ))}
    </ol>
  );
}
