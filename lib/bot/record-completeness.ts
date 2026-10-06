export type ResourceStatus = "DRAFT" | "CONFIRMED";
export type ContactValue = { type?: string | null; rawText: string };

/** Supported contact channels only; a person's name, location or URL is not a channel. */
export function isValidSupplierContact(contact: ContactValue): boolean {
  const text = typeof contact?.rawText === "string" ? contact.rawText.trim() : "";
  if (!text) return false;
  if (contact.type === "WECHAT") return /^[\p{L}\p{N}_-]{3,}$/u.test(text);
  const withoutUrls = text.replace(/(?:https?:\/\/|www\.)\S+/giu, "");
  const email = /\b[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+\b/u.test(withoutUrls);
  if (contact.type === "EMAIL") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(text);
  if (!contact.type && email) return true;
  if (contact.type && !["PHONE", "FAX"].includes(contact.type)) return false;
  const number = withoutUrls.match(/(?:\+|\b)\d[\d\s().-]*\d/gu)?.some((value) => { const digits = value.replace(/\D/gu, ""); return digits.length >= 6 && digits.length <= 15; });
  return Boolean(number || !contact.type && /\bwechat\s*:\s*[\p{L}\p{N}_-]{3,}/iu.test(withoutUrls));
}
export function isSupplierConfirmable(input: { name?: string | null; contact?: string | null; contacts?: ContactValue[] }) {
  return Boolean(input.name?.trim() && [...(input.contacts ?? []), ...(input.contact ? [{ rawText: input.contact }] : [])].some(isValidSupplierContact));
}
export type ProductImage = { productId?: string | null; type: string; storageKey: string; mimeType: string; size: number; verified?: boolean };
export function isValidProductImage(image: ProductImage, productId: string): boolean {
  return image.verified === true && image.productId === productId && image.type === "PRODUCT_IMAGE" && Boolean(image.storageKey.trim()) && ["image/jpeg", "image/png", "image/webp"].includes(image.mimeType) && Number.isInteger(image.size) && image.size > 0 && image.size <= 8 * 1024 * 1024;
}
export function isProductConfirmable(input: { id: string; name?: string | null; images: ProductImage[] }) {
  return Boolean(input.name?.trim() && input.name !== "Producto sin nombre" && input.images.some((image) => isValidProductImage(image, input.id)));
}
// Existing confirmations (including manual/legacy ones) are preserved, never duplicated or demoted.
export const deriveSupplierStatus = (input: Parameters<typeof isSupplierConfirmable>[0] & { status: ResourceStatus }): ResourceStatus => input.status === "CONFIRMED" || isSupplierConfirmable(input) ? "CONFIRMED" : "DRAFT";
export const deriveProductStatus = (input: Parameters<typeof isProductConfirmable>[0] & { status: ResourceStatus }): ResourceStatus => input.status === "CONFIRMED" || isProductConfirmable(input) ? "CONFIRMED" : "DRAFT";
