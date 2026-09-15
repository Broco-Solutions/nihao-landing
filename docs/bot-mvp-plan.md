# Nihao Bot — plan del MVP

## Alcance funcional

El bot es un flujo de captura estructurada de proveedores para uso mobile durante ferias. Tier 1 comprende empresa, ubicación, contacto, categoría, tipo de proveedor, FOB, MOQ, lead time e interés. La categoría es la única pregunta que debe contestarse explícitamente; “No sé todavía” es una respuesta válida y deja el campo pendiente.

La confirmación muestra todos los datos y la corrección actúa sobre un único campo. Lead time se guarda también normalizado a días; FOB conserva monto, moneda y unidad; MOQ conserva cantidad, unidad y aclaraciones.

## Iteración 1

La ruta `/demo/captura` implementa el flujo mobile-first, confirmación por campo y comparación básica. Los registros se guardan en `localStorage` para validar la experiencia, sin considerarlo persistencia definitiva.

## Evolución prevista

1. Separar contrato, motor Tier 1 y adaptadores de extracción.
2. Incorporar extracción de texto con un adaptador local de desarrollo y un punto explícito para IA futura.
3. Mover la fuente de verdad a persistencia del lado servidor, conservando almacenamiento local sólo como cache/autosave.
4. Agregar imagen/tarjeta y transcripción de audio sobre el mismo contrato.

WhatsApp, geolocalización, Tier 3 e informes sofisticados quedan fuera del MVP actual.
