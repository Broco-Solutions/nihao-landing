# Captura resiliente y sincronización local

## Alcance

Nihao no es offline-first. El objetivo de esta capa es conservar capturas y evidencias mientras la conectividad es inestable. OCR, transcripción, extracción, confirmación, dashboards y reportes siguen requiriendo servidor.

## Almacenamiento local

Las capturas pendientes viven en IndexedDB (`nihao-offline-captures`), con un object store versionado. Se guardan `userId`, `tripId`, un `localId` estable, texto, estado y blobs de evidencias. No se guardan cookies, tokens, signed URLs, credenciales R2 ni claves de Mistral. El namespace se filtra siempre por `userId` y `tripId`; IndexedDB no está cifrado y ese es un riesgo residual del dispositivo.

Al sincronizar correctamente, el registro local se elimina. Si el usuario cierra sesión, los pendientes se conservan y se muestra una advertencia; sólo la misma cuenta puede recuperarlos.

## Idempotencia

`SupplierCapture.id` puede recibir el `clientCaptureId` UUID generado localmente. El endpoint de creación usa `upsert` y verifica ownership, por lo que un retry no crea otra captura. Cada evidencia usa su `clientEvidenceId` como parte de la storage key determinística. `SupplierAttachment.storageKey` ya es único; el servidor reutiliza metadata existente del mismo capture/trip/usuario si el upload se repite.

## Sincronización

El coordinador procesa una captura por vez: crea la captura remota, sube evidencias, procesa business cards/audio/texto y elimina el estado local al finalizar. Se dispara al abrir la captura, volver a la pestaña, detectar `online` y mediante `Sincronizar ahora`. Hay fallback foreground; no se depende de Background Sync ni se incorporó service worker para evitar cachear APIs autenticadas o signed URLs.

Una evidencia subida no significa que esté analizada. Si extracción falla, el archivo no se vuelve a subir; queda pendiente para reintentar procesamiento. 401 conserva la queue y pide volver a ingresar; 403 no reintenta infinitamente; 4xx de validación queda como error; 5xx y red quedan pendientes para retry controlado/manual.

## Limitaciones conocidas

- La confirmación siempre requiere red y sesión válida.
- No hay OCR, audio ni extracción offline.
- No hay Background Sync ni service worker.
- El límite de almacenamiento depende del navegador; un error de cuota se informa como fallo de guardado y no como éxito.
- La validación física de cámara/micrófono en mobile requiere el runbook manual del milestone.
