# Modelo de datos de Nihao Bot

`prisma/schema.prisma` es la fuente de verdad. La primera migración es `20260915120000_init_nihao_bot`.

## Identidad y acceso

| Modelo | Propósito |
| --- | --- |
| `User` | Usuario de Better Auth. |
| `Session`, `Account`, `Verification` | Tablas requeridas por Better Auth con adapter Prisma. |
| `Trip` | Viaje/feria con nombre, fechas opcionales, estado y creador. |
| `TripMember` | Membresía compuesta por `tripId + userId`, con rol contextual `ADMIN` o `TRAVELER` y `onboardingCompletedAt` por viaje; es la frontera de autorización y experiencia. |
| `TripInvitation` | Invitación por viaje con email normalizado, `tokenHash`, estado, vencimiento y timestamps; nunca almacena el token original. |

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

`TripInvitation` pertenece a un `Trip` y puede estar `PENDING`, `ACCEPTED` o `EXPIRED`. El índice único por `tripId + email + status` evita invitaciones pendientes duplicadas; `tokenHash` es único. Los enlaces contienen un token de 32 bytes que se compara server-side mediante SHA-256 y vence a los 7 días. Regenerar reemplaza el hash y el vencimiento, invalidando el enlace anterior.

`TripMember.onboardingCompletedAt` es nullable y pertenece a la membresía, porque una misma persona puede necesitar una introducción distinta en cada viaje. La migración backfillea miembros existentes para no bloquearlos; una membresía nueva de TRAVELER creada por invitación comienza con `NULL`. ADMIN tiene bypass de la experiencia de onboarding.

## Roles y autorización

`TripMemberRole` es un enum Prisma con valores `ADMIN` y `TRAVELER`. El rol pertenece a la relación con el viaje, no a `User`, por lo que una persona puede ser ADMIN en un viaje y TRAVELER en otro.

La creación de `Trip` y la membresía ADMIN del creador se ejecutan en una única transacción. En la migración inicial de roles, el creador de cada viaje existente se promueve a ADMIN y las demás membresías quedan como TRAVELER.

Sólo un ADMIN puede crear, listar o regenerar invitaciones. Aceptar requiere una sesión cuyo email normalizado coincida con la invitación y, dentro de una transacción, crea `TripMember(TRAVELER)` y marca `acceptedAt`. El próximo milestone es el onboarding del viajero.

Server-side, `requireTripMember` valida pertenencia y `requireTripAdmin` valida administración. ADMIN puede consultar la administración y la actividad completa de su viaje; TRAVELER queda limitado a sus capturas/proveedores y a las acciones de captura propias. La UI sólo refleja estas reglas: no es el mecanismo de seguridad.
