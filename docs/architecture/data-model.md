# Modelo de datos de Nihao Bot

`prisma/schema.prisma` es la fuente de verdad. La primera migración es `20260915120000_init_nihao_bot`.

## Identidad y acceso

| Modelo | Propósito |
| --- | --- |
| `User` | Usuario de Better Auth. |
| `Session`, `Account`, `Verification` | Tablas requeridas por Better Auth con adapter Prisma. |
| `Trip` | Viaje/feria con nombre, fechas opcionales, estado y creador. |
| `TripMember` | Membresía compuesta por `tripId + userId`; es la frontera de autorización. |

## Proveedores y capturas

| Modelo | Propósito |
| --- | --- |
| `SupplierCapture` | Borrador o captura confirmada, fuente, Tier 1, campos faltantes/revisión/evidencia y timestamps. |
| `Supplier` | Proveedor confirmado derivado de una captura; un `captureId` sólo puede materializar uno. |
| `SupplierContact` | Texto de contacto asociado a proveedor, viaje y autor. |
| `SupplierAttachment` | Metadata de un objeto externo: tipo, clave R2, MIME y tamaño. Nunca contiene el blob. |

En Iteración 4 la UI habilita `BUSINESS_CARD` y `PRODUCT_IMAGE`. `AUDIO` y `OTHER` permanecen en el enum para evolución, sin UX. La captura es la raíz de ownership del adjunto; a través de ella se resuelven viaje y autor, evitando duplicar identidad en la tabla de metadata.

Tier 1 se representa con columnas simples para consulta y comparación: empresa, ciudad, provincia, categoría, tipo, FOB, MOQ, lead time e interés. FOB usa monto decimal, moneda, unidad y texto original; MOQ usa cantidad, unidad, notas y texto original; lead time conserva texto y días normalizados. Las listas de campos faltantes, de revisión, desconocidos reconocidos y evidencia son JSONB pequeño porque son metadatos de la captura, no entidades consultadas de forma independiente.

## Estados y relaciones

```text
User --< TripMember >-- Trip --< SupplierCapture --0..1 Supplier
                                      |                       |
                                      +--< SupplierAttachment  +--< SupplierContact
```

`SupplierCapture.status` y `Supplier.status` utilizan `DRAFT`/`CONFIRMED` donde aplica. Sólo la categoría bloquea la confirmación; “No sé” queda registrada en `acknowledgedUnknownFields` y en los pendientes del proveedor confirmado.
