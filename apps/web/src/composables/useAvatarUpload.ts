/**
 * Avatar upload pipeline — PRD §11.9.
 *
 * Client-side:
 *   1. Pre-decode 10 MB size guard      → "fileTooLarge"
 *   2. MIME allow-list (jpeg/png/webp)  → "unsupportedFormat"
 *   3. Image + ObjectURL decode         → "decodeFailed"
 *   4. Center-crop to square, resize to 256×256 via canvas
 *   5. Encode as JPEG at quality 0.85
 *   6. Post-encode 100 KB guard         → "resultTooLarge"
 *
 * Returns a JPEG data URL on success. The server stores it verbatim in the
 * users.avatar_url column — no server-side decoding.
 */

const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
type AcceptedMime = (typeof ACCEPTED_MIME)[number];

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DATA_URL_LENGTH = 100_000;
export const OUTPUT_SIZE = 256;
export const JPEG_QUALITY = 0.85;
export const AVATAR_ACCEPT_ATTR = ACCEPTED_MIME.join(",");

export type AvatarErrorKey =
  | "avatar.errors.fileTooLarge"
  | "avatar.errors.unsupportedFormat"
  | "avatar.errors.decodeFailed"
  | "avatar.errors.resultTooLarge";

export type PickResult = { dataUrl: string } | { error: AvatarErrorKey };

function isAcceptedMime(value: string): value is AcceptedMime {
  return (ACCEPTED_MIME as readonly string[]).includes(value);
}

function decodeImage(objectUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode failed"));
    img.src = objectUrl;
  });
}

export function useAvatarUpload(): {
  pickAndProcess: (file: File) => Promise<PickResult>;
} {
  async function pickAndProcess(file: File): Promise<PickResult> {
    // 1. Pre-decode size guard — bails before we even instantiate an Image,
    //    so a 50 MB raw camera photo can't OOM the tab on mobile.
    if (file.size > MAX_FILE_BYTES) {
      return { error: "avatar.errors.fileTooLarge" };
    }

    // 2. MIME allow-list — the File `type` is browser-set from extension +
    //    sniffing, so it's a reasonable first gate. Defense, not security.
    if (!isAcceptedMime(file.type)) {
      return { error: "avatar.errors.unsupportedFormat" };
    }

    // 3. Decode via Image + object URL (works on every browser, including
    //    Safari which doesn't ship `createImageBitmap` for File on every
    //    version we care about).
    const objectUrl = URL.createObjectURL(file);
    let img: HTMLImageElement;
    try {
      img = await decodeImage(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      return { error: "avatar.errors.decodeFailed" };
    }

    // 4. Center-crop to a square, resize to 256×256.
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      URL.revokeObjectURL(objectUrl);
      return { error: "avatar.errors.decodeFailed" };
    }
    const sourceSize = Math.min(img.width, img.height);
    const sx = (img.width - sourceSize) / 2;
    const sy = (img.height - sourceSize) / 2;
    ctx.drawImage(
      img,
      sx,
      sy,
      sourceSize,
      sourceSize,
      0,
      0,
      OUTPUT_SIZE,
      OUTPUT_SIZE
    );
    URL.revokeObjectURL(objectUrl);

    // 5. Encode as JPEG at q=0.85. JPEG is the right format for photographic
    //    avatars — PNG explodes to 200KB+, WebP has rocky Safari history.
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);

    // 6. Post-encode size guard. Most photos land at 8–25 KB; >100 KB is
    //    pathological (extremely noisy texture, etc.).
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      return { error: "avatar.errors.resultTooLarge" };
    }

    return { dataUrl };
  }

  return { pickAndProcess };
}
