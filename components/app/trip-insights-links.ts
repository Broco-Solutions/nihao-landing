export function pendingCaptureHref(tripId: string, captureId: string) {
  return `/app/viajes/${encodeURIComponent(tripId)}/proveedores/nuevo?captureId=${encodeURIComponent(captureId)}`;
}
