/** A catalogue statement is a load request even without an imperative verb. */
export function productDeclaration(text: string): { name: string | null } | null {
  if (/[?¿]/u.test(text)) return null;
  const match = text.trim().match(/^(?:(?:también|tambien|además|ademas)\s+)?(?:(?:este|ese|el|mismo)\s+proveedor\s+)?(?:tienen?|fabrican?|producen?|venden?|ofrecen?|distribuyen?)\s+(.+)$/iu);
  if (!match) return null;
  const body = match[1].trim();
  // Supplier attributes and continuations of an existing product are not new products.
  if (/^(?:fabricaci[oó]n|descuentos?|bonificaciones?|fob|moq|plazo|precio|lead\s*time|stock|disponibilidad|colores?|logo|contacto|tel[eé]fono|email|experiencia|capacidad)\b/iu.test(body.replace(/^(?:un|una)\s+/iu, ""))) return null;
  const item = body.replace(/^(?:un|una|unos|unas)\s+/iu, "");
  const separator = /[,;\n]|\s+(?:(?:esos?|esas?|estos?|estas?)\b|(?:y\s+)?(?:con\s+)?(?:un(?:a)?\s+)?(?:fob|moq|precio|plazo|lead\s*time)\b)/iu.exec(item);
  const name = (separator ? item.slice(0, separator.index) : item).replace(/[.!]+$/u, "").trim();
  const suffix = separator ? item.slice(separator.index).replace(/^[,;\s]+/u, "") : "";
  // A comma can introduce another product; only a commercial continuation is safe.
  if (suffix && (!/^(?:(?:esos?|esas?|estos?|estas?)\s+(?:tienen?|con|cuestan?|tardan?)\s+|(?:y\s+)?(?:con\s+)?(?:un(?:a)?\s+)?(?:fob|moq|precio|plazo|lead\s*time)\b)/iu.test(suffix) || !/\b(?:fob|moq|precio|plazo|lead\s*time|d[ií]as)\b/iu.test(suffix) || /\b(?:adem[aá]s|tambi[eé]n)\s+(?:tienen?|fabrican?|venden?)\b/iu.test(suffix))) return { name: null };
  // Multiple items and vague names must stay with the semantic tools and clarification.
  if (!name || name.length > 120 || /\by\b|[;/]|\b(?:productos?|cosas|para|proveedor)\b/iu.test(name)) return { name: null };
  return { name };
}
