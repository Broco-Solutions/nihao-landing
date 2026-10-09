# Nihao Negocios — Documentación

Este directorio reúne la documentación funcional, de producto, arquitectura y desarrollo de Nihao Negocios.

El framework de evaluación del MVP está documentado en [`development/evals.md`](development/evals.md). Sus evals de IA no sustituyen tests determinísticos ni UAT físico.

## Estado al 4 de octubre de 2026

Producción usa el [agente WhatsApp con tools](architecture/whatsapp-agent-tools.md) y memoria de las últimas cinco conversaciones terminadas durante 24 horas. Las conversaciones v2 persistidas siguen con su procesador. Frontend y backend se publican desde `main` en Vercel y Railway.

La corrección de continuidad recupera lotes v1 sin contexto ni procesamiento previo y permite responder empresas por nombre. El detalle y las conversaciones de evaluación están en [el reporte de aclaraciones](development/whatsapp-legacy-clarification-evals-20261004.md). Las evals reales y los tests locales se distinguen del UAT físico de WhatsApp.

Para productos sin proveedor identificado, Nihao ofrece un botón **Elegir proveedor** con una lista de nombres, empresa y ciudad. También acepta escribir el nombre. Las conversaciones y resultados están en [evals del selector](development/whatsapp-supplier-picker-evals-20261004.md). La entrega del menú en el teléfono requiere UAT físico.

El historial de releases está en [current-state.md](development/current-state.md) y los casos del piloto en [mvp-uat-plan.md](uat/mvp-uat-plan.md).

## Por dónde empezar

Para incorporarse al desarrollo de Nihao Bot, leer en este orden:

### 1. Producto y experiencia

`product/nihao-bot-product-experience.md`

Define la visión actual del producto:

- modelo de viajes;
- roles;
- viajeros;
- invitaciones;
- onboarding;
- experiencia mobile;
- captura de proveedores;
- múltiples evidencias;
- business cards;
- audio;
- dashboards;
- próximos pasos.

Incluye funcionalidad existente y decisiones de producto propuestas.

### 2. Estado operativo y UAT del MVP

[`uat/mvp-uat-plan.md`](uat/mvp-uat-plan.md)

Fuente operativa del estado actual, resultados de UAT, pruebas pendientes y
gates para MVP Demo, MVP Pilot y producción. Debe usarse para seguir la
estabilización antes de ampliar alcance.

### 3. Estado técnico e historial de desarrollo

`development/current-state.md`

Handoff técnico del estado actual:

- rama;
- commits relevantes;
- stack;
- infraestructura;
- modelos de IA;
- funcionalidades implementadas;
- smokes reales;
- validaciones;
- próximo milestone.

Este archivo es el handoff técnico e histórico. Para el estado operativo de
UAT, consultar primero `uat/mvp-uat-plan.md`.

### 4. Arquitectura

Documentación en `architecture/`:

- `architecture/nihao-bot.md`
- `architecture/data-model.md`
- `architecture/infrastructure.md`
- `architecture/extraction-providers.md`

Describe la arquitectura actual, persistencia, infraestructura y providers de IA.

Plan de referencia: [separación entre agente y operaciones de Nihao](architecture/nihao-operations-separation-plan.md). Define una capa interna compartida por web y WhatsApp, transición por casos de uso y criterios de validación. La implementación local del alcance está completada; aceptación física y publicación siguen pendientes.

Avance local: [primera sección de operaciones compartidas, creación de productos](development/nihao-operations-first-slice-20261008.md). Incluye alcance migrado, caminos pendientes y validación; la separación completa sigue en desarrollo.

Continuación local: [actualización compartida de productos](development/nihao-operations-product-updates-20261008.md), con permisos, patches parciales, control de versiones y concurrencia. Validación determinística, sin evals de IA.

Tercera sección local: [archivos y finalización de productos](development/nihao-operations-product-files-20261008.md), con asociación común y cierre transaccional de enlaces, trazabilidad, estado y recibos v3.

Cuarta sección local: [proveedores y borradores](development/nihao-operations-suppliers-20261008.md), con actualización común, promoción automática autorizada y preservación de condiciones comerciales al corregir borradores. Validación determinística, sin evals de IA.

Quinta sección local: [corrección y confirmación manual de capturas](development/nihao-operations-capture-review-20261008.md), con autorización en operaciones, confirmación dentro de la transacción del llamador y conservación de condiciones comerciales en correcciones humanas.

Cierre del alcance local: [creación/extracción, consultas, borrados e inventario final](development/nihao-operations-local-completion-20261008.md). Incluye validación determinística, límites operativos y procedimiento de rollback, sin evals de IA.

Validación posterior: [suite amplia y smoke HTTP autenticado](development/nihao-operations-expanded-validation-20261008.md). 661 tests aprobados, sin fallos; una prueba con IA real omitida. Incluye compatibilidad legacy corregida y límites del UAT físico pendiente.

### 5. Plan del MVP

`bot-mvp-plan.md`

Contiene el plan histórico/evolutivo del MVP.

No asumir que representa siempre el estado más reciente. Para las decisiones actuales, priorizar:

1. `product/nihao-bot-product-experience.md`
2. `uat/mvp-uat-plan.md`
3. `development/current-state.md`
4. documentación de arquitectura
5. `bot-mvp-plan.md`

### 6. Desarrollo local

`development/local-setup.md`

Consultar para configuración y ejecución local.

## Distinción importante

**IMPLEMENTADO**
Existe actualmente en código.

**VALIDADO**
Además fue verificado mediante tests o smoke real.

**PENDING UAT**
La capacidad debe validarse en el contexto operativo indicado; una prueba
física/mobile sólo cuenta cuando fue realizada realmente.

**BLOCKED**
No puede avanzar hasta resolver una dependencia o defecto.

**FUTURE / POST-MVP**
Forma parte de la visión de producto pero todavía requiere desarrollo.

No interpretar automáticamente una decisión de producto como funcionalidad ya existente.

## Principios actuales del producto

- mobile first;
- capturar antes que completar formularios;
- IA asistente, no autoridad;
- información faltante es preferible a información incorrecta;
- múltiples evidencias por proveedor;
- revisión humana antes de confirmar;
- web utilizable independientemente de WhatsApp.

## Estado de rama y UAT

El estado operativo está documentado en
[`uat/mvp-uat-plan.md`](uat/mvp-uat-plan.md). Antes de desplegar, abrir un PR o
continuar UAT, confirmar branch, commit y worktree, y ejecutar los gates
indicados allí. Producción requiere autorización explícita.

La arquitectura de captura resiliente está documentada en [offline-sync.md](architecture/offline-sync.md). El alcance es durabilidad local y sincronización foreground; no es offline-first.

Verificar siempre Git antes de comenzar:

    git status --short --branch
    git log --oneline -10
    git fetch origin

- [Agente WhatsApp con tools (v3, local)](architecture/whatsapp-agent-tools.md)
