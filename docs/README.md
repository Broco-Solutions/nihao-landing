# Nihao Negocios — Documentación

Este directorio reúne la documentación funcional, de producto, arquitectura y desarrollo de Nihao Negocios.

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

### 2. Estado actual de desarrollo

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

Este archivo debe consultarse antes de comenzar una nueva iteración.

### 3. Arquitectura

Documentación en `architecture/`:

- `architecture/nihao-bot.md`
- `architecture/data-model.md`
- `architecture/infrastructure.md`
- `architecture/extraction-providers.md`

Describe la arquitectura actual, persistencia, infraestructura y providers de IA.

### 4. Plan del MVP

`bot-mvp-plan.md`

Contiene el plan histórico/evolutivo del MVP.

No asumir que representa siempre el estado más reciente. Para las decisiones actuales, priorizar:

1. `product/nihao-bot-product-experience.md`
2. `development/current-state.md`
3. documentación de arquitectura
4. `bot-mvp-plan.md`

### 5. Desarrollo local

`development/local-setup.md`

Consultar para configuración y ejecución local.

## Distinción importante

**IMPLEMENTADO**
Existe actualmente en código.

**VALIDADO**
Además fue verificado mediante tests o smoke real.

**PROPUESTO / PRÓXIMO**
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

## Estado de rama

El milestone actual de múltiples business cards / evidencias fue implementado sobre `main` local. Introduce una migración de metadata de draft para preservar correcciones y exigir reanálisis tras borrar evidencia analizada. Verificar siempre Git antes de comenzar.

Verificar siempre Git antes de comenzar:

    git status --short --branch
    git log --oneline -10
    git fetch origin
