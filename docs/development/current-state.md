# Nihao Bot — Estado actual de desarrollo

**Fecha de referencia:** Septiembre 2026

## Repositorio

- Repo: `Broco-Solutions/nihao-landing`
- Repo local: `/Users/franc/Broco/Nihao/nihao-landing`
- Rama de trabajo de esta iteración: `main`

## Commits principales del MVP

- `83cb645` feat: reconstruir captura Tier 1 del bot
- `3ee65f2` feat: implementar núcleo server-side de Nihao Bot
- `302dde2` feat: preparar persistencia y auth de Nihao Bot
- `98bff9b` test: validate Nihao bot production infrastructure
- `2dcd3c4` feat: construir experiencia productiva de Nihao Bot
- `e49cb3b` feat: preparar providers de extracción multimodal
- `9b8016f` feat: agregar provider de extracción Mistral
- `53c1b88` feat: conectar extracción Mistral al flujo productivo
- `7293b27` feat: add private audio transcription flow

## Stack

- Next.js 16
- TypeScript
- Prisma
- PostgreSQL / Railway
- Better Auth
- Cloudflare R2
- Mistral AI

## Variables server-side principales

Consultar `.env.example`.

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `MISTRAL_API_KEY`

Nunca versionar valores reales.

## Arquitectura actual

```text
User
↓
Trip / TripMember
↓
SupplierCapture
↓
Text / SupplierAttachment
↓
Extraction / Transcription
↓
Merge
↓
Tier 1
↓
Human review
↓
Confirmation
```

## IA actualmente integrada
### Texto
`mistral-small-2603`
### Business cards
`mistral-ocr-4-1`
### Audio
`voxtral-mini-latest` → transcript → `mistral-small-2603`
## Principios funcionales ya aplicados
- la IA propone y el usuario confirma;
- nunca auto-confirmar;
- estados DETECTED / REVIEW / MISSING;
- conflicto entre fuentes → REVIEW;
- dato incorrecto es peor que dato faltante;
- attachments autorizados antes de acceder a R2;
- no procesar URLs arbitrarias enviadas por cliente;
- secrets únicamente server-side;
- blobs en R2;
- metadata y datos estructurados en PostgreSQL.
## Smokes reales
### Texto — PASS
Se validó extracción real de:
- empresa;
- tipo de proveedor;
- FOB;
- MOQ;
- lead time.
### Business card — PASS
Se validó OCR real con tarjeta ficticia:
- empresa;
- contacto;
- email;
- teléfono;
- WeChat;
- ciudad;
- provincia.
### Audio — PASS
Flujo real validado:
audio
→ Voxtral
→ transcript
→ Mistral Small
→ Tier 1
También se validó:
- persistencia del transcript;
- reutilización del transcript;
- ausencia de segunda llamada a Voxtral cuando ya existe transcripción válida.
## Último estado de calidad conocido
- ESLint: PASS
- TypeScript: PASS
- Tests: 32 PASS
- Next build: PASS
- Prisma generate: PASS
- Prisma validate: PASS
## Última migración relevante
`20260917120000_add_trip_member_roles` (aplicada en la base Railway configurada localmente)

Migraciones anteriores relevantes:

- `20260915180000_add_audio_transcription`

Verificar prisma migrate status antes de asumir que está aplicada en cada entorno.
## Importante: no reconstruir
Ya existe infraestructura para:
- autenticación;
- usuarios;
- viajes;
- membresías;
- capturas;
- proveedores;
- contactos;
- attachments;
- PostgreSQL;
- R2;
- OCR;
- extracción de texto;
- transcripción;
- merge;
- autorización;
- structured output.

## Milestone: roles por viaje y base de administración

### IMPLEMENTADO

- `TripMember.role` con enum Prisma `ADMIN` / `TRAVELER`.
- La creación de un viaje crea atómicamente la membresía ADMIN del creador.
- La migración `20260917120000_add_trip_member_roles` conserva membresías existentes, asigna ADMIN al creador de cada viaje y TRAVELER al resto.
- `requireTripMember` y `requireTripAdmin` centralizan la autorización server-side.
- ADMIN puede consultar miembros, roles, capturas y proveedores de todo su viaje mediante `GET /api/bot/trips/:tripId/admin`.
- TRAVELER sólo lista y consulta sus propias capturas/proveedores; no accede a la administración ni puede modificar datos ajenos.
- La pantalla `/app/viajes/:tripId/admin` muestra miembros, roles, capturas por miembro y métricas básicas.
- El dashboard del viaje muestra el acceso administrativo únicamente a ADMIN; la API vuelve a validar el rol.

### VALIDADO

- Tests de roles, creación atómica, autorización ADMIN/TRAVELER y visibilidad por ownership.
- Regresión del flujo de attachments y captura productiva.
- TypeScript, ESLint, build y Prisma generate/validate ejecutados para este milestone.

### PENDIENTE

- No se implementaron onboarding, emails ni WhatsApp.
- El rol no tiene todavía una UI de edición: las membresías siguen siendo las existentes o las creadas por el flujo actual.

## Milestone: invitaciones de viajeros

### IMPLEMENTADO

- `TripInvitation` relaciona un viaje con un email normalizado, nombre opcional, estado `PENDING`/`ACCEPTED`/`EXPIRED`, vencimiento y timestamps.
- Los tokens se generan con 32 bytes criptográficamente seguros y sólo se persiste `tokenHash` SHA-256. La vigencia es de 7 días.
- ADMIN puede crear/listar invitaciones y regenerar explícitamente su enlace desde `/api/bot/trips/:tripId/invitations`.
- La aceptación valida sesión, email coincidente, estado, vencimiento y membresía dentro de una transacción; crea `TRAVELER` y marca la invitación como aceptada.
- La ruta pública `/invitacion/:token` permite continuar a registro/login o activar el acceso; los tokens inválidos no revelan datos.
- Como no existe provider de email en el repositorio, la entrega actual es copiar el enlace desde la administración. La abstracción de delivery queda pendiente de decisión de proveedor.

### VALIDADO

- 7 tests específicos de dominio de invitaciones pasan con Node 26 usando `--experimental-strip-types`.
- TypeScript, ESLint (sin errores), build de Next.js, `prisma:validate` y `prisma:generate` pasan.
- `prisma:migrate:status` detecta correctamente la migración pendiente `20260917150000_add_trip_invitations`.
- El gate exacto `--experimental-transform-types` no pudo ejecutarse porque la máquina tiene Node 26; esa flag corresponde al entorno Node 24 documentado.

### PENDIENTE

- Onboarding del viajero.
- Delivery automático por email y posterior WhatsApp.

La migración no fue aplicada contra la base configurada localmente: el comando identifica una base Railway provisionada y se evita aplicar cambios reales sin confirmar explícitamente el entorno autorizado.

Commit del milestone: `feat: add traveler invitations` (SHA informado en el handoff).

## Milestone: onboarding del viajero

### IMPLEMENTADO

- `TripMember.onboardingCompletedAt` guarda el estado por viaje y no en `User`.
- La migración `20260917170000_add_trip_member_onboarding` marca como completos los miembros existentes; las nuevas membresías creadas por invitación quedan pendientes. ADMIN no requiere onboarding.
- `GET/POST /api/bot/trips/:tripId/onboarding` valida sesión y membresía server-side; completar es idempotente.
- La aceptación de una invitación devuelve `onboardingRequired` y dirige al viajero nuevo al onboarding.
- El dashboard consulta el estado antes de cargar el viaje y redirige al onboarding sólo para TRAVELER pendiente, sin loops.
- `/app/viajes/:tripId/onboarding` ofrece tres pasos mobile-first: contexto del viaje, formas de captura disponibles y revisión humana de la información organizada.

### VALIDADO

- Tests de política ADMIN/TRAVELER y de aceptación con onboarding pendiente.
- TypeScript, ESLint, build de Next.js, Prisma validate/generate y tests específicos ejecutados.

### PENDIENTE

- Aplicar la migración al entorno Railway autorizado.
- Rediseño UX mobile de captura.

Próximo milestone: **REDISEÑO UX MOBILE DE CAPTURA**.
Commit del milestone: `feat: add traveler onboarding` (SHA informado en el handoff).
Revisar lo existente antes de reemplazar cualquiera de estas capas.
## Distinción obligatoria al leer documentación
### IMPLEMENTADO
Existe en código.
### VALIDADO
Además fue probado mediante tests o smoke real.
### PROPUESTO
Es visión/producto pendiente de implementación.
No confundir la visión futura documentada con funcionalidad ya disponible.
## Próximo milestone de producto

**REDISEÑO UX MOBILE DE CAPTURA**

Antes de agregar más IA:
1. invitaciones;
2. onboarding;
3. rediseño mobile de captura;
4. múltiples business cards y evidencias;
5. dashboard viajero;
6. dashboard administrador;
7. reportes;
8. robustez offline;
9. Evolution API / WhatsApp.
Documento principal de producto:
`docs/product/nihao-bot-product-experience.md`
## Git
El milestone actual fue implementado sobre `main` local. Verificar siempre el branch y el commit antes de continuar.
Antes de trabajar:
git status --short --branch
git log --oneline -10
git fetch origin
## Antes de commit
Según el cambio:
- git diff --check
- ESLint
- TypeScript
- tests relevantes
- Next build
- Prisma validate/generate/status si corresponde
## Filosofía de trabajo
Priorizar calidad de producto sobre cantidad de cambios.
No resolver silenciosamente ambigüedades funcionales importantes.
La experiencia primaria debe diseñarse para una persona usando el celular mientras recorre una feria comercial.
