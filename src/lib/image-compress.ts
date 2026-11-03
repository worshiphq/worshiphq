/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * Why this exists: member, visitor and account photos used to be read straight off the phone with
 * FileReader and sent as-is. A modern phone photo is 3-8 MB, and base64 inflates it by about a third, so
 * a single upload became a 4-11 MB payload through a serverless function - slow on mobile data, expensive
 * in function CPU and memory, and above the ~4.5 MB request-body ceiling, where it simply fails.
 *
 * A profile photo is only ever shown at avatar or ID-card size, so a long edge of 1024px at 0.85 JPEG
 * quality is indistinguishable to the eye while typically being 20-40x smaller (3 MB -> ~100 KB).
 *
 * Mirrors the approach already used for church logos in branding-form.tsx, just shared and tuned for photos.
 */

export type CompressOptions = {
  /** Longest edge of the result, in pixels. */
  maxDimension?: number;
  /** JPEG quality, 0-1. */
  quality?: number;
};

const DEFAULTS = { maxDimension: 1024, quality: 0.85 };

/** True for formats a canvas can safely redraw. SVG and anything exotic is passed through untouched. */
function isCompressible(type: string): boolean {
  return ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"].includes(type.toLowerCase());
}

/**
 * Read `file` and return a data URL, shrunk when it is worth shrinking. Never rejects for an image we
 * cannot process: it falls back to the original data URL, so an upload never breaks because of this step.
 */
export function compressImageFile(file: File, options: CompressOptions = {}): Promise<string> {
  const { maxDimension, quality } = { ...DEFAULTS, ...options };

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const original = String(reader.result);
      if (!isCompressible(file.type)) return resolve(original);

      const img = new Image();
      // If the image itself won't decode, hand back what we read rather than failing the upload.
      img.onerror = () => resolve(original);
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));

          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(original);

          // White backing: a transparent PNG flattened to JPEG would otherwise go black.
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);

          const shrunk = canvas.toDataURL("image/jpeg", quality);
          // Keep whichever is actually smaller - a tiny PNG avatar can beat its JPEG version.
          resolve(shrunk.length < original.length ? shrunk : original);
        } catch {
          resolve(original);
        }
      };
      img.src = original;
    };
    reader.readAsDataURL(file);
  });
}
