export const MAX_IMAGE_INPUT_BYTES = 5_000_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export type ImageInputErrorCode =
  | "unsupported_type"
  | "file_too_large"
  | "read_failed"
  | "invalid_data";

export class ImageInputError extends Error {
  constructor(
    public readonly code: ImageInputErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ImageInputError";
  }
}

export const readImageFile = async (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const extensionType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
  const mimeType = (file.type || extensionType) === "image/jpg"
    ? "image/jpeg"
    : file.type || extensionType;
  if (!SUPPORTED_IMAGE_TYPES.has(mimeType))
    throw new ImageInputError(
      "unsupported_type",
      "Choose a PNG, JPEG, WebP, or GIF image."
    );
  if (!file.size || file.size > MAX_IMAGE_INPUT_BYTES)
    throw new ImageInputError(
      "file_too_large",
      "Images must be between 1 byte and 5 MB."
    );
  if (typeof FileReader === "undefined")
    throw new ImageInputError(
      "read_failed",
      "Image file input is not supported in this environment."
    );
  return new Promise<{ dataUrl: string; mimeType: string; byteLength: number }>(
    (resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () =>
        reject(new ImageInputError("read_failed", "The image could not be read."));
      reader.onload = () => {
        const dataUrl = typeof reader.result === "string" ? reader.result : "";
        if (!dataUrl.startsWith(`data:${mimeType};base64,`)) {
          reject(new ImageInputError("invalid_data", "The image data is malformed."));
          return;
        }
        resolve({ dataUrl, mimeType, byteLength: file.size });
      };
      reader.readAsDataURL(file);
    }
  );
};
