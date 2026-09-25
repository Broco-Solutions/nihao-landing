# Nihao Negocios — Documentación

Este directorio reúne la documentación funcional, de producto, arquitectura y desarrollo de Nihao Negocios.

El framework de evaluación del MVP está documentado en [`development/evals.md`](development/evals.md). Sus evals de IA no sustituyen tests determinísticos ni UAT físico.

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
