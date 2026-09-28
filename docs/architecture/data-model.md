# Modelo de datos de Nihao Bot

`prisma/schema.prisma` es la fuente de verdad. La primera migración es `20260915120000_init_nihao_bot`.

## Identidad y acceso

| Modelo | Propósito |
| --- | --- |
| `User` | Usuario de Better Auth con rol global `ADMIN` o `TRAVELER`. |
| `Session`, `Account`, `Verification` | Tablas requeridas por Better Auth con adapter Prisma. |
| `Trip` | Viaje/feria con nombre, fechas opcionales, estado y creador. |
| `TripMember` | Membresía de acceso al viaje y rol contextual `ADMIN` o `TRAVELER`, con `onboardingCompletedAt` por viaje. |
| `TripCompany` | Empresa participante de un viaje; su nombre es editable por ADMIN. |
| `TripCompanyMember` | Relación empresa-usuario; permite varias empresas por viajero en el mismo viaje. |
| `TripInvitation` | Invitación a una empresa del viaje con email normalizado, `tokenHash`, estado y vencimiento. |
| `WhatsAppConversation`, `WhatsAppMessageReply` | Selección persistente de viaje/empresa por proveedor e idempotencia de mensajes entrantes. |

Sólo un `User` con rol global `ADMIN` puede crear viajes. Para invitar viajeros se exige el rol global `ADMIN` y la membresía `ADMIN` en ese viaje. Las cuentas nuevas comienzan como `TRAVELER`; la migración de roles conserva como administradores globales a quienes ya crean o administran viajes existentes. Los nuevos administradores requieren una asignación explícita de `User.role` por operación administrativa.

## Proveedores y capturas

| Modelo | Propósito |
| --- | --- |
| `SupplierCapture` | Borrador o captura confirmada, Tier 1, campos faltantes/revisión, evidencia, correcciones humanas y estado de reanálisis. |
| `Supplier` | Proveedor confirmado derivado de una captura; un `captureId` sólo puede materializar uno. |
| `SupplierContact` | Texto de contacto asociado a proveedor, viaje y autor. |
| `SupplierAttachment` | Metadata de un objeto externo: tipo, clave R2, MIME y tamaño. Nunca contiene el blob. |

Cada captura y proveedor pertenece a una sola `TripCompany` y conserva el autor de la captura. Los miembros de esa empresa pueden consultar y modificar sus borradores; ADMIN ve todas las empresas del viaje. `SupplierAttachment` es una colección 1:N: una captura DRAFT puede conservar múltiples `BUSINESS_CARD`, `PRODUCT_IMAGE` y `AUDIO`. La captura determina el acceso al adjunto.

Tier 1 se representa con columnas simples para consulta y comparación: empresa, ciudad, provincia, categoría, tipo, FOB, MOQ, lead time e interés. FOB usa monto decimal, moneda, unidad y texto original; MOQ usa cantidad, unidad, notas y texto original; lead time conserva texto y días normalizados. Las listas de campos faltantes, de revisión, desconocidos reconocidos, correcciones humanas, adjuntos analizados y evidencia son JSONB pequeño porque son metadatos de la captura, no entidades consultadas de forma independiente. `needsReanalysis` evita confirmar una propuesta que incluía una tarjeta o audio eliminados.

## Estados y relaciones

```text
User --< TripMember >-- Trip --< TripCompany --< SupplierCapture --0..1 Supplier
  |                                   |                         |
  +--< TripCompanyMember >------------+                         +--< SupplierAttachment
```

`SupplierCapture.status` y `Supplier.status` utilizan `DRAFT`/`CONFIRMED` donde aplica. Sólo la categoría bloquea la confirmación; “No sé” queda registrada en `acknowledgedUnknownFields` y en los pendientes del proveedor confirmado.

`TripInvitation` pertenece a un `Trip` y una `TripCompany`; puede estar `PENDING`, `ACCEPTED` o `EXPIRED`. El índice parcial único por `companyId + email` en estado `PENDING` evita invitaciones pendientes duplicadas y permite volver a invitar a alguien después de quitarlo. `tokenHash` es único. Los enlaces contienen un token de 32 bytes que se compara server-side mediante SHA-256 y vence a los 7 días.

`TripMember.onboardingCompletedAt` es nullable y pertenece a la membresía, porque una misma persona puede necesitar una introducción distinta en cada viaje. La migración backfillea miembros existentes para no bloquearlos; una membresía nueva de TRAVELER creada por invitación comienza con `NULL`. ADMIN tiene bypass de la experiencia de onboarding.

## Roles y autorización

`TripMemberRole` es un enum Prisma con valores `ADMIN` y `TRAVELER`. El rol pertenece a la relación con el viaje, no a `User`, por lo que una persona puede ser ADMIN en un viaje y TRAVELER en otro.

La creación de `Trip` y la membresía ADMIN del creador se ejecutan en una única transacción. En la migración inicial de roles, el creador de cada viaje existente se promueve a ADMIN y las demás membresías quedan como TRAVELER.

Sólo un ADMIN puede crear empresas e invitaciones. Aceptar requiere una sesión cuyo email normalizado coincida con la invitación y, dentro de una transacción, crea `TripMember(TRAVELER)` si hace falta, crea `TripCompanyMember` y marca `acceptedAt`.

Server-side, `requireTripMember` valida pertenencia al viaje y `requireTripAdmin` valida administración. Para capturas, proveedores y adjuntos se valida además la empresa. ADMIN puede consultar todas las empresas; TRAVELER sólo las empresas a las que pertenece. `User.whatsappPhone` almacena un único número global y único por usuario.

La migración `20260928120000_trip_companies` crea «Empresa del viaje» para cada viaje existente y reasigna sus miembros TRAVELER, capturas, proveedores e invitaciones. Los viajes nuevos también se crean con esa empresa inicial, que ADMIN puede renombrar. Antes de mover WhatsApp al usuario, la migración comprueba que una persona no tenga dos números distintos y que un número no pertenezca a dos personas. Si encuentra conflictos, aborta sin aplicar cambios; hay que corregir esas asignaciones en `TripMember` y volver a ejecutar la migración.
