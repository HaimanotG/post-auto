import { useState, type FormEvent } from "react";
import { DEFAULT_API_BASE_URL } from "../../app/api-config";
import { useAuth } from "../../app/AuthGate";
import { ChevronDownIcon, ChevronUpIcon, RemoveIcon } from "../../app/icons";
import { Toast } from "../../app/Toast";
import { TemplatePicker, type SlideTemplateId } from "./TemplatePicker";

export interface PostComposerProps {
  apiBaseUrl?: string;
}

interface AssetDraft {
  id: string;
  rawUrl: string;
  productName: string;
  price: string;
  description: string;
}

let assetSeq = 0;
function emptyAsset(): AssetDraft {
  assetSeq += 1;
  return { id: `asset-${assetSeq}`, rawUrl: "", productName: "", price: "", description: "" };
}

interface CreatedPost {
  id: string;
  status: string;
  captionMaster: string | null;
  sourceAssets: Array<{ id: string; rawUrl: string }>;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved"; post: CreatedPost };

function moveItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const to = index + direction;
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved!);
  return next;
}

/**
 * Draft post creation form per PLAN.md's M1 composer scope: caption plus one
 * or more source images (entered by URL — there's no upload/object-storage
 * pipeline until M2's render package), each optionally carrying a product
 * name/price/description that post_source_assets reserves room for. Submits
 * to POST /posts (m1-09's route), which persists a `draft` post; rendering,
 * platform adaptation, and publishing happen in later milestones. The slide
 * template only drives local labeling/reordering here — POST /posts has no
 * template field yet.
 */
export function PostComposer({ apiBaseUrl = DEFAULT_API_BASE_URL }: PostComposerProps) {
  const { token } = useAuth();
  const [template, setTemplate] = useState<SlideTemplateId>("single-product");
  const [captionMaster, setCaptionMaster] = useState("");
  const [assets, setAssets] = useState<AssetDraft[]>(() => [emptyAsset()]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const carouselMode = template === "carousel";

  function updateAsset(index: number, patch: Partial<AssetDraft>) {
    setAssets((current) => current.map((asset, i) => (i === index ? { ...asset, ...patch } : asset)));
  }

  function addAsset() {
    setAssets((current) => [...current, emptyAsset()]);
  }

  function removeAsset(index: number) {
    setAssets((current) => current.filter((_, i) => i !== index));
  }

  function moveAsset(index: number, direction: -1 | 1) {
    setAssets((current) => moveItem(current, index, direction));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "saving" });

    const nonEmptyAssets = assets.filter((asset) => asset.rawUrl.trim().length > 0);
    if (nonEmptyAssets.length === 0) {
      setStatus({ kind: "error", message: "At least one image URL is required" });
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/posts`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          captionMaster: captionMaster.trim().length > 0 ? captionMaster.trim() : undefined,
          assets: nonEmptyAssets.map((asset) => ({
            rawUrl: asset.rawUrl.trim(),
            productName: asset.productName.trim().length > 0 ? asset.productName.trim() : undefined,
            price: asset.price.trim().length > 0 ? Number(asset.price) : undefined,
            description: asset.description.trim().length > 0 ? asset.description.trim() : undefined,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to save draft with status ${response.status}`);
      }

      const post = (await response.json()) as CreatedPost;
      setStatus({ kind: "saved", post });
      setCaptionMaster("");
      setAssets([emptyAsset()]);
      setTemplate("single-product");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft";
      setStatus({ kind: "error", message });
    }
  }

  const fieldClassName =
    "w-full rounded-[10px] border-none bg-pa-bg px-3 py-2.5 text-[14.5px] text-pa-text placeholder:text-pa-hint";

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="px-4 pt-4 pb-[100px]">
      <TemplatePicker value={template} onChange={setTemplate} />

      <label
        htmlFor="post-composer-caption"
        className="block px-1 pt-5 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase"
      >
        Caption
      </label>
      <textarea
        id="post-composer-caption"
        value={captionMaster}
        onChange={(event) => setCaptionMaster(event.target.value)}
        placeholder="Write a caption for all platforms…"
        rows={3}
        className="mb-5 w-full resize-none rounded-[14px] border-none bg-pa-secondary-bg px-3.5 py-3 text-[15px] text-pa-text placeholder:text-pa-hint"
      />

      <div className="px-1 pb-2 text-[13px] font-semibold tracking-[0.4px] text-pa-hint uppercase">
        {carouselMode ? "Carousel slides" : "Images"}
      </div>

      {assets.map((asset, index) => (
        <fieldset key={asset.id} className="mb-3 flex flex-col gap-2.5 rounded-[14px] bg-pa-secondary-bg p-3.5">
          <div className="flex items-center justify-between">
            <legend className="text-[13px] font-semibold text-pa-hint">
              {carouselMode ? (index === 0 ? "Cover slide" : `Slide ${index + 1}`) : `Image ${index + 1}`}
            </legend>
            <div className="flex gap-1">
              {carouselMode && (
                <>
                  <button
                    type="button"
                    aria-label="Move up"
                    onClick={() => moveAsset(index, -1)}
                    disabled={index === 0}
                    className="flex h-[26px] w-[26px] items-center justify-center text-pa-link disabled:opacity-35"
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    aria-label="Move down"
                    onClick={() => moveAsset(index, 1)}
                    disabled={index === assets.length - 1}
                    className="flex h-[26px] w-[26px] items-center justify-center text-pa-link disabled:opacity-35"
                  >
                    <ChevronDownIcon />
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => removeAsset(index)}
                disabled={assets.length <= 1}
                className="flex h-[26px] w-[26px] items-center justify-center text-pa-destructive disabled:opacity-35"
              >
                <RemoveIcon />
                <span className="sr-only">Remove image</span>
              </button>
            </div>
          </div>

          {asset.rawUrl.trim().length > 0 ? (
            <img src={asset.rawUrl} alt="" className="h-[150px] w-full rounded-[10px] object-cover" />
          ) : (
            <div className="flex h-[150px] w-full items-center justify-center rounded-[10px] border border-dashed border-pa-hint text-[13px] text-pa-hint opacity-70">
              Drop product photo
            </div>
          )}

          <label htmlFor={`post-composer-asset-${index}-url`} className="sr-only">
            Image URL
          </label>
          <input
            id={`post-composer-asset-${index}-url`}
            type="url"
            placeholder="Image URL"
            value={asset.rawUrl}
            onChange={(event) => updateAsset(index, { rawUrl: event.target.value })}
            className={fieldClassName}
          />

          <label htmlFor={`post-composer-asset-${index}-product`} className="sr-only">
            Product name
          </label>
          <input
            id={`post-composer-asset-${index}-product`}
            type="text"
            placeholder="Product name"
            value={asset.productName}
            onChange={(event) => updateAsset(index, { productName: event.target.value })}
            className={fieldClassName}
          />

          <div className="flex gap-2">
            <div className="w-[90px] flex-none">
              <label htmlFor={`post-composer-asset-${index}-price`} className="sr-only">
                Price
              </label>
              <input
                id={`post-composer-asset-${index}-price`}
                type="number"
                min="0"
                placeholder="Price"
                value={asset.price}
                onChange={(event) => updateAsset(index, { price: event.target.value })}
                className={fieldClassName}
              />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor={`post-composer-asset-${index}-description`} className="sr-only">
                Description
              </label>
              <input
                id={`post-composer-asset-${index}-description`}
                type="text"
                placeholder="Short description"
                value={asset.description}
                onChange={(event) => updateAsset(index, { description: event.target.value })}
                className={fieldClassName}
              />
            </div>
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={addAsset}
        className="mb-5 w-full rounded-xl border-[1.4px] border-dashed border-pa-hint py-3.5 text-[14.5px] font-semibold text-pa-link"
      >
        <span aria-hidden="true">+ </span>Add another image
      </button>

      <button
        type="submit"
        disabled={status.kind === "saving"}
        className="w-full rounded-xl bg-pa-button py-4 text-base font-semibold text-pa-button-text disabled:opacity-60"
      >
        {status.kind === "saving" ? "Saving…" : "Save draft"}
      </button>

      {status.kind === "error" && <Toast kind="alert">{status.message}</Toast>}
      {status.kind === "saved" && <Toast kind="status">Draft saved.</Toast>}
    </form>
  );
}
