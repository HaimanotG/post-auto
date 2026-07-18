import { useState, type FormEvent } from "react";
import { useAuth } from "../../app/AuthGate";

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface PostComposerProps {
  apiBaseUrl?: string;
}

interface AssetDraft {
  rawUrl: string;
  productName: string;
  price: string;
  description: string;
}

function emptyAsset(): AssetDraft {
  return { rawUrl: "", productName: "", price: "", description: "" };
}

interface CreatedPost {
  id: string;
  status: string;
  captionMaster: string | null;
  sourceAssets: Array<{ id: string; rawUrl: string }>;
}

type Status = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved"; post: CreatedPost };

/**
 * Draft post creation form per PLAN.md's M1 composer scope: caption plus one
 * or more source images (entered by URL — there's no upload/object-storage
 * pipeline until M2's render package), each optionally carrying a product
 * name/price/description that post_source_assets reserves room for. Submits
 * to POST /posts (m1-09's route), which persists a `draft` post; rendering,
 * platform adaptation, and publishing happen in later milestones.
 */
export function PostComposer({ apiBaseUrl = DEFAULT_API_BASE_URL }: PostComposerProps) {
  const { token } = useAuth();
  const [captionMaster, setCaptionMaster] = useState("");
  const [assets, setAssets] = useState<AssetDraft[]>([emptyAsset()]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function updateAsset(index: number, patch: Partial<AssetDraft>) {
    setAssets((current) => current.map((asset, i) => (i === index ? { ...asset, ...patch } : asset)));
  }

  function addAsset() {
    setAssets((current) => [...current, emptyAsset()]);
  }

  function removeAsset(index: number) {
    setAssets((current) => current.filter((_, i) => i !== index));
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
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save draft";
      setStatus({ kind: "error", message });
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor="post-composer-caption">Caption</label>
      <textarea
        id="post-composer-caption"
        value={captionMaster}
        onChange={(event) => setCaptionMaster(event.target.value)}
      />

      {assets.map((asset, index) => (
        <fieldset key={index}>
          <legend>Image {index + 1}</legend>
          <label htmlFor={`post-composer-asset-${index}-url`}>Image URL</label>
          <input
            id={`post-composer-asset-${index}-url`}
            type="url"
            value={asset.rawUrl}
            onChange={(event) => updateAsset(index, { rawUrl: event.target.value })}
          />

          <label htmlFor={`post-composer-asset-${index}-product`}>Product name</label>
          <input
            id={`post-composer-asset-${index}-product`}
            type="text"
            value={asset.productName}
            onChange={(event) => updateAsset(index, { productName: event.target.value })}
          />

          <label htmlFor={`post-composer-asset-${index}-price`}>Price</label>
          <input
            id={`post-composer-asset-${index}-price`}
            type="number"
            min="0"
            value={asset.price}
            onChange={(event) => updateAsset(index, { price: event.target.value })}
          />

          <label htmlFor={`post-composer-asset-${index}-description`}>Description</label>
          <input
            id={`post-composer-asset-${index}-description`}
            type="text"
            value={asset.description}
            onChange={(event) => updateAsset(index, { description: event.target.value })}
          />

          {assets.length > 1 && (
            <button type="button" onClick={() => removeAsset(index)}>
              Remove image
            </button>
          )}
        </fieldset>
      ))}

      <button type="button" onClick={addAsset}>
        Add another image
      </button>

      <button type="submit" disabled={status.kind === "saving"}>
        {status.kind === "saving" ? "Saving…" : "Save draft"}
      </button>

      {status.kind === "error" && <p role="alert">{status.message}</p>}
      {status.kind === "saved" && <p role="status">Draft saved.</p>}
    </form>
  );
}
