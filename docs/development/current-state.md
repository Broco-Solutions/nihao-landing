# Nihao Bot — Estado actual de desarrollo

**Fecha de referencia:** Septiembre 2026

## Repositorio

- Repo: `Broco-Solutions/nihao-landing`
- Checkout: `/home/rcoirini/proyectos-bs/nihao-landing`
- Rama activa: `feat/nihao-bot-mvp`

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
- Tests: 27 PASS
- Next build: PASS
- Prisma generate: PASS
- Prisma validate: PASS
## Última migración relevante
`20260915180000_add_audio_transcription`
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
Antes de agregar más IA:
1. roles administrativos por viaje;
2. invitaciones;
3. onboarding;
4. rediseño mobile de captura;
5. múltiples business cards y evidencias;
6. dashboard viajero;
7. dashboard administrador;
8. reportes;
9. robustez offline;
10. Evolution API / WhatsApp.
Documento principal de producto:
`docs/product/nihao-bot-product-experience.md`
## Git
El trabajo actual está en:
`feat/nihao-bot-mvp`
No asumir que main tiene estas funcionalidades hasta verificar el merge.
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
