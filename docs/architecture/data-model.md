# Modelo de datos de Nihao Bot

`prisma/schema.prisma` es la fuente de verdad. La primera migración es `20260915120000_init_nihao_bot`.

## Identidad y acceso

| Modelo | Propósito |
| --- | --- |
| `User` | Usuario de Better Auth con rol global `ADMIN` o `TRAVELER`. |
| `Session`, `Account`, `Verification` | Tablas requeridas por Better Auth con adapter Prisma. |
| `Trip` | Viaje/feria con nombre, fechas opcionales, estado y creador. |
| `TripMember` | Membresía de acceso al viaje y rol contextual `ADMIN` o `TRAVELER`, con `onboardingCompletedAt` por viaje. |
| `Company` | Empresa del catálogo global; puede existir sin pertenecer a un viaje y conserva una identidad propia aunque haya nombres repetidos. |
| `TripCompany` | Asignación de una empresa del catálogo a un viaje, con estado activo; conserva su ID para capturas e invitaciones históricas. |
| `TripCompanyMember` | Relación empresa-usuario; permite varias empresas por viajero en el mismo viaje. |
| `TripInvitation` | Invitación a una empresa del viaje con email normalizado, `tokenHash`, estado y vencimiento. |
| `WhatsAppConversation`, `WhatsAppMessageReply` | Selección persistente de viaje/empresa por proveedor e idempotencia de mensajes entrantes. |

Sólo un `User` con rol global `ADMIN` puede crear viajes. Para invitar viajeros se exige el rol global `ADMIN` y la membresía `ADMIN` en ese viaje. Las cuentas nuevas comienzan como `TRAVELER`; la migración de roles conserva como administradores globales a quienes ya crean o administran viajes existentes. Los nuevos administradores requieren una asignación explícita de `User.role` por operación administrativa.

## Proveedores y capturas

| Modelo | Propósito |
| --- | --- |
| `SupplierCapture` | Borrador o captura confirmada, Tier 1, campos faltantes/revisión, evidencia, correcciones humanas y estado de reanálisis. |
| `Supplier` | Proveedor confirmado derivado de una captura; un `captureId` sólo puede materializar uno. |
| `SupplierContact` | Medio de contacto asociado a proveedor, viaje y autor; admite email, teléfono, fax, WeChat o texto histórico sin clasificar. |
| `SupplierProduct` | Producto de una captura, vinculado al proveedor al confirmar; contiene nombre, FOB, MOQ y lead time. |
| `SupplierAttachment` | Metadata de un objeto externo: tipo, clave R2, MIME y tamaño. Nunca contiene el blob. |

Cada captura y proveedor pertenece a una sola asignación `TripCompany` y conserva el autor de la captura. Una `Company` puede estar asignada a varios viajes. Los miembros de esa asignación pueden consultar y modificar sus borradores y proveedores confirmados; ADMIN ve todas las empresas del viaje. `SupplierAttachment` es una colección 1:N: una captura DRAFT puede conservar múltiples `BUSINESS_CARD`, `PRODUCT_IMAGE` y `AUDIO`. Una imagen de producto puede vincularse a un `SupplierProduct`; las imágenes históricas quedan sin asignar hasta revisión. La captura determina el acceso al adjunto.

Tier 1 conserva columnas simples en la captura para extracción y revisión. Al confirmar, las condiciones comerciales se materializan en `SupplierProduct`; las columnas antiguas del proveedor permanecen para compatibilidad histórica. El proveedor guarda además sitio web opcional, interés de 1 a 10 y múltiples contactos. FOB usa monto decimal, moneda, unidad y texto original; MOQ usa cantidad, unidad, notas y texto original; lead time conserva texto y días normalizados. Las listas de campos faltantes, de revisión, desconocidos reconocidos, correcciones humanas, adjuntos analizados y evidencia son JSONB pequeño porque son metadatos de la captura, no entidades consultadas de forma independiente. `needsReanalysis` evita confirmar una propuesta que incluía una tarjeta o audio eliminados.

## Estados y relaciones

```text
User --< TripMember >-- Trip --< TripCompany >-- Company
  |                                   |
  +--< TripCompanyMember >------------+--< SupplierCapture --0..1 Supplier
                                        |
                                        +--< SupplierAttachment
```

`SupplierCapture.status` y `Supplier.status` utilizan `DRAFT`/`CONFIRMED` donde aplica. Sólo la categoría bloquea la confirmación; “No sé” queda registrada en `acknowledgedUnknownFields` y en los pendientes del proveedor confirmado.

`TripInvitation` pertenece a un `Trip` y una `TripCompany`; puede estar `PENDING`, `ACCEPTED` o `EXPIRED`. El índice parcial único por `companyId + email` en estado `PENDING` evita invitaciones pendientes duplicadas y permite volver a invitar a alguien después de quitarlo. `tokenHash` es único. Los enlaces contienen un token de 32 bytes que se compara server-side mediante SHA-256 y vence a los 7 días.

`TripMember.onboardingCompletedAt` es nullable y pertenece a la membresía, porque una misma persona puede necesitar una introducción distinta en cada viaje. La migración backfillea miembros existentes para no bloquearlos; una membresía nueva de TRAVELER creada por invitación comienza con `NULL`. ADMIN tiene bypass de la experiencia de onboarding.

## Roles y autorización

`TripMemberRole` es un enum Prisma con valores `ADMIN` y `TRAVELER`. El rol pertenece a la relación con el viaje, no a `User`, por lo que una persona puede ser ADMIN en un viaje y TRAVELER en otro.

La creación de `Trip` y la membresía ADMIN del creador se ejecutan en una única transacción. En la migración inicial de roles, el creador de cada viaje existente se promueve a ADMIN y las demás membresías quedan como TRAVELER.

Sólo un ADMIN global puede crear y renombrar empresas del catálogo. Un ADMIN global que también administre el viaje puede asignarlas o desactivarlas en ese viaje e invitar viajeros. Aceptar requiere una sesión cuyo email normalizado coincida con la invitación y, dentro de una transacción, crea `TripMember(TRAVELER)` si hace falta, crea `TripCompanyMember` y marca `acceptedAt`.

Server-side, `requireTripMember` valida pertenencia al viaje y `requireTripAdmin` valida administración. Para capturas, proveedores y adjuntos se valida además la empresa. ADMIN puede consultar todas las empresas; TRAVELER sólo las empresas a las que pertenece. `User.whatsappPhone` almacena un único número global y único por usuario.

La migración `20260928120000_trip_companies` creó «Empresa del viaje» para cada viaje existente y reasignó sus miembros TRAVELER, capturas, proveedores e invitaciones. La migración `20260929020000_global_companies` crea una `Company` por cada asignación existente y mantiene todos los IDs de `TripCompany`, por lo que las referencias históricas siguen siendo válidas. No fusiona registros con el mismo nombre: podrían representar entidades distintas. Los viajes nuevos comienzan sin empresas; el ADMIN las asigna desde el catálogo. Desactivar una asignación la oculta para nuevas capturas e invitaciones, pero conserva el historial y la empresa global. Antes de mover WhatsApp al usuario, la migración comprobó que una persona no tuviera dos números distintos y que un número no perteneciera a dos personas; los conflictos habrían abortado esa migración.
