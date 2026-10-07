export function pendingCaptureHref(tripId: string, captureId: string, productId?: string) {
  return `/app/viajes/${encodeURIComponent(tripId)}/proveedores/nuevo?captureId=${encodeURIComponent(captureId)}${productId ? `&productId=${encodeURIComponent(productId)}` : ""}`;
}
