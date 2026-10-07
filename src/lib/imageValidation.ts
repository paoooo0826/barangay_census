export const RESIDENT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const RESIDENT_IMAGE_TYPES = new Set(RESIDENT_IMAGE_ACCEPT.split(","));
export function validateResidentImage(file: File) {
  if (!RESIDENT_IMAGE_TYPES.has(file.type))
    throw new Error(
      "Choose a JPEG, PNG, or WebP image. Other formats are not supported.",
    );
  if (file.size === 0)
    throw new Error("The selected image is empty. Choose or capture it again.");
  if (file.size > 8 * 1024 * 1024)
    throw new Error("Each image must be 8 MB or smaller.");
}
