# Nihao Negocios — Bot de Captura de Proveedores
## Definición de Producto y Experiencia

**Estado:** Documento vivo de producto
**Fecha de referencia:** Septiembre 2026
**Proyecto:** Nihao Negocios
**Piloto inicial:** Feria de Cantón — Octubre/Noviembre 2026

---

## 1. Propósito de este documento

Este documento complementa la especificación funcional original del Bot de Captura de Proveedores de Nihao Negocios.

La especificación funcional original continúa siendo una fuente funcional de referencia. Este documento incorpora las decisiones de producto, experiencia de usuario y arquitectura funcional definidas durante la construcción del MVP.

Su objetivo es permitir que producto, desarrollo y futuras personas del equipo entiendan:

- qué problema resuelve Nihao;
- cómo se organiza el producto alrededor de viajes;
- qué tipos de usuarios existen;
- cómo se incorpora un viajero;
- cómo se captura un proveedor en una feria;
- cómo se utiliza IA;
- qué experiencia buscamos;
- qué está implementado;
- qué falta construir.

---

## 2. Visión del producto

Nihao no debe ser solamente un chatbot ni un formulario digital.

El producto debe convertir información desordenada obtenida durante una feria internacional en una base estructurada y útil de proveedores.

El viajero debe poder capturar evidencia de la forma más natural posible:

- fotografías;
- business cards;
- notas de voz;
- texto;
- información adicional del proveedor.

Nihao procesa esas evidencias, propone información estructurada y permite al viajero revisar, completar y confirmar.

Principio central:

> Capturar primero. Estructurar después.

La experiencia debe minimizar el tiempo que el viajero dedica a completar formularios mientras se encuentra frente a un proveedor.

---

## 3. Modelo conceptual

El producto se organiza alrededor de:

```text
Nihao
  ↓
Viaje
  ↓
Viajeros
  ↓
Capturas de proveedores
  ↓
Evidencias
  ↓
Datos estructurados
  ↓
Reporte / comparación
### Trip
Representa una tanda o viaje organizado por Nihao.
Ejemplo:
Canton Fair — Octubre 2026

Contiene:
- nombre;
- fechas;
- viajeros;
- capturas;
- proveedores;
- reportes.
### TripMember
Representa la participación de una persona en un viaje.
El rol debe pertenecer preferentemente a la membresía del viaje y no solamente al usuario global.
Esto permite que una misma persona pueda tener diferentes responsabilidades en distintos viajes.
### SupplierCapture
Es la unidad de trabajo mediante la cual un viajero registra un proveedor.
SupplierCapture debe concebirse como un contenedor de evidencias, no simplemente como un formulario.
Puede contener:
### SupplierCapture
│
├── business card frente
├── business card dorso
├── otras business cards
├── foto producto 1
├── foto producto 2
├── audio 1
├── audio 2
├── texto / notas
└── Tier 1 consolidado
## 4. Roles

**Estado de esta iteración:** IMPLEMENTADO para roles por viaje, base de administración, invitaciones seguras y onboarding contextual del viajero.
### SYSTEM_ADMIN / Equipo Nihao
Representa al equipo que administra el producto Nihao.
Puede:
- gestionar viajes;
- gestionar administradores;
- visualizar operación general;
- acceder a información consolidada.
No necesariamente debe exponerse como un rol complejo en el MVP si no es necesario.
### ADMIN del viaje
Administra una tanda concreta.
Puede:
- crear el viaje;
- acceder a la base de administración;
- visualizar capturas de todos los viajeros;
- acceder a proveedores;
- revisar avance básico.

La base administrativa permite ver miembros, roles, capturas/proveedores por miembro y métricas simples. También permite invitar viajeros, regenerar enlaces y copiar el acceso. El envío automático por email y los reportes consolidados quedan pendientes.
### TRAVELER
Participa en uno o más viajes.
Puede:
- acceder a sus viajes;
- capturar proveedores;
- cargar evidencias;
- revisar información detectada;
- completar faltantes;
- corregir;
- confirmar capturas;
- consultar sus proveedores.
Modelo recomendado:
TripMember.role

ADMIN
### TRAVELER
Los permisos administrativos deben evaluarse en contexto del viaje.

La pantalla base está disponible en `/app/viajes/:tripId/admin` y sólo ADMIN puede obtener sus datos. Un TRAVELER recibe denegación server-side y no puede acceder a capturas o proveedores creados por otra persona.

### Estado actual

La robustez offline / conectividad está implementada parcialmente para captura y sincronización foreground.
## 5. Ciclo de vida de un viaje
Flujo objetivo:
Nihao crea viaje
      ↓
Carga viajeros
      ↓
Genera invitaciones
      ↓
Viajeros activan acceso
      ↓
Onboarding
      ↓
Viaje activo
      ↓
Captura de proveedores
      ↓
Revisión
      ↓
Reporte consolidado
      ↓
Post-viaje
## 6. Gestión de viajeros e invitaciones
Nihao debe poder agregar viajeros de manera eficiente.
Opciones deseadas:
- alta individual;
- pegar listado;
- importación desde planilla.
Datos básicos iniciales:
- nombre;
- apellido;
- email;
- teléfono;
- empresa, cuando corresponda.
Estados implementados de invitación:
PENDING
ACCEPTED
EXPIRED
La interfaz administrativa debería mostrar algo similar a:
Viajeros

36 total
32 activos
4 pendientes

Renzo Coirini       Activo
Juan Pérez          Invitado
Ana Gómez           Activo
Acciones:
- agregar;
- reenviar invitación;
- quitar del viaje;
- revisar activación.
## 7. Modelo de invitación
Modelo conceptual recomendado:
TripInvitation

id
tripId
email
name
tokenHash
status
expiresAt
acceptedAt
createdAt
Flujo:
Admin agrega viajero
       ↓
Nihao crea invitación
       ↓
Enlace copiable (email automático pendiente de provider)
       ↓
Activar acceso
       ↓
Registro / login
       ↓
Aceptación autenticada con email coincidente
       ↓
### TripMember
       ↓
Onboarding
       ↓
Home del viaje
En una etapa futura el mismo mecanismo podrá notificarse también mediante WhatsApp / Evolution API.
El modelo de invitación no debe depender de un único canal.
## 8. Onboarding del viajero — IMPLEMENTADO
No debe ser un registro genérico sin contexto.
Ejemplo:
Nihao Negocios te invitó a
Canton Fair — Octubre 2026

Durante la feria vas a poder guardar
tarjetas, fotos, audios y datos de tus
proveedores en pocos segundos.

[ Activar mi acceso ]
Primera entrada:
Bienvenido a Nihao

Durante la feria:

1. Capturá información del proveedor.
2. Nosotros la organizamos.
3. Revisá lo detectado.
4. Guardá.

[ Empezar ]
El onboarding debe ser corto.
Objetivo: 2–3 pantallas como máximo.
El estado se guarda en `TripMember.onboardingCompletedAt`, por lo que se muestra sólo la primera vez que un TRAVELER entra a cada viaje. ADMIN no queda bloqueado.
## 9. Experiencia principal del viajero — IMPLEMENTADO EN CAPTURA
La interfaz del viajero no debe sentirse como software administrativo.
Debe estar optimizada para:
- celular;
- uso con una mano;
- velocidad;
- contexto de feria;
- interacción mínima;
- mala conectividad potencial.
Home conceptual:
Canton Fair
Día 2

12 proveedores guardados

        + CAPTURAR
          PROVEEDOR

Pendientes de completar  3

Últimos proveedores

ABC Lighting       ★★★★
Completo

Xinghua Tools      ★★★
Faltan 2 datos
La acción dominante debe ser:
Capturar proveedor

## 10. Nueva captura — IMPLEMENTADO
La captura productiva comienza sin formulario largo.
Inicio actual:
Nuevo proveedor

¿Cómo querés empezar?

[ 📷 Tarjeta o foto ]
[ 🎙️ Contarme ]
[ ⌨️ Escribir ]
Estas opciones no son mutuamente excluyentes.
El usuario puede combinar fuentes libremente.
Después del análisis, los datos se agrupan como “Detectamos”, “Necesitamos revisar” y “Nos falta”. Sólo categoría —o su respuesta “No sé”— bloquea guardar. Confirmar muestra “Proveedor guardado” y prioriza “Capturar otro proveedor”.
Ejemplo:
Proveedor nuevo

📷 Tarjetas
[ frente ] [ dorso ] [ + ]

🎙️ Nota de voz
▶ 00:21

📝 Nota
MOQ depende del color

────────────────────

Detectamos

ABC Lighting
Shenzhen, Guangdong
FOB USD 7 / unidad
MOQ 300
Entrega 28 días

Nos falta

Categoría
Interés

[ Completar 2 datos ]
## 11. Evidencias múltiples
IMPLEMENTADO: una captura DRAFT acumula múltiples evidencias del mismo tipo y permite seleccionar hasta tres tarjetas y tres audios por análisis.
Las tarjetas y audios eliminados después de un análisis dejan la propuesta marcada para reanálisis; la confirmación permanece bloqueada hasta que la persona vuelva a revisar información vigente. Las correcciones humanas se preservan al incorporar evidencia nueva.

No asumir:
1 captura =
1 tarjeta +
1 audio
Debe soportarse:
- múltiples business cards;
- múltiples fotos de producto;
- múltiples audios;
- texto;
- futuras evidencias.

## Dashboard del viajero

IMPLEMENTADO: `/app/viajes/:tripId` es la pantalla operativa personal durante la feria. Prioriza contexto del viaje, una CTA grande para capturar, pendientes y proveedores recientes; no es un dashboard administrativo.

Los contadores muestran sólo proveedores/capturas del usuario autenticado: guardados, capturas DRAFT pendientes y proveedores guardados hoy. “Hoy” se calcula en UTC porque todavía no existe una timezone por viaje o usuario; la UI lo identifica explícitamente. Un pendiente es siempre una captura DRAFT: al continuarla se conserva evidencia, correcciones y estado de reanálisis. Los proveedores CONFIRMED no aparecen como pendientes sólo por campos opcionales vacíos.

## Dashboard del administrador

IMPLEMENTADO: `/app/viajes/:tripId/admin` resume el estado global autorizado del viaje: miembros, TRAVELER activos, invitaciones pendientes/vencidas, capturas, proveedores confirmados, DRAFT pendientes y actividad del día en UTC. Muestra progreso por viajero con proveedores confirmados y DRAFT pendientes, ordenado alfabéticamente para evitar rankings.

El dashboard administrativo es sólo de lectura sobre actividad ajena: conserva la gestión de miembros/invitaciones existente, pero no habilita corrección, eliminación de evidencia ni confirmación de capturas de otro traveler.

## Reportes y comparación

IMPLEMENTADO: `/app/viajes/:tripId/admin/proveedores` lista sólo `Supplier` confirmados del viaje con búsqueda server-side (empresa, contacto y ubicación), filtros por categoría, tipo, viajero, interés y completitud, orden y paginación. Los DRAFT se muestran como pendientes separados, no como proveedores comparables; los confirmados con `pendingFields` se identifican aparte sin invalidarlos. La comparación es descriptiva y temporal en UI, con hasta cuatro proveedores del mismo Trip; no asigna puntajes ni ganadores.

## Robustez offline / conectividad

IMPLEMENTADO parcialmente: durante una captura, texto y blobs de tarjetas, fotos y audio se persisten en IndexedDB si la red falla. La queue queda aislada por usuario y viaje, se reanuda al volver a la app o la conexión, y ofrece `Sincronizar ahora`. La creación de `SupplierCapture` y `SupplierAttachment` es idempotente para retries. La IA, la revisión y la confirmación siguen requiriendo conexión.

Próximo trabajo: validación manual autenticada con cámara/micrófono y pruebas de cuota/cierre en dispositivos reales.

## 12. Business cards
Debe soportarse más de una imagen de tarjeta.
Casos habituales:
- frente y dorso;
- tarjeta corporativa + personal;
- información complementaria;
- QR / WeChat en una cara;
- dirección en otra.
Experiencia:
Tarjeta del proveedor

[ Frente ]
[ Dorso ]
[ + Agregar ]
No es necesario limitar funcionalmente a exactamente dos imágenes.
El límite operativo actual es de tres tarjetas por análisis, no por almacenamiento; se pueden conservar más y elegir otro conjunto en una operación posterior.
Cada imagen puede procesarse individualmente.
OCR card 1
+
OCR card 2
+
OCR card N
↓
merge conservador
↓
datos propuestos
Ante información contradictoria:
### REVIEW

Nunca elegir silenciosamente un valor dudoso.
## 13. Audio
La interacción debe parecerse más a una nota de voz que a un upload técnico.
UX deseada:
[ 🎙️ Grabar ]

● 00:08

[ Detener ]
Luego:
▶ ━━━━━━━━━ 0:08

[ Usar audio ]
[ Repetir ]
Una vez procesado:
Audio procesado

Detectamos:
FOB USD 7
MOQ 300
Entrega 28 días
El usuario no debe necesitar entender:
- attachment;
- upload;
- transcripción;
- modelo de IA;
- storage.
El sistema debe ocultar esos detalles.
## 14. Tier 1
La información universal estructurada incluye:
- empresa;
- ciudad / provincia;
- contacto;
- categoría;
- tipo de proveedor;
- FOB;
- MOQ;
- lead time;
- interés 1–5.
"No sé" debe ser una respuesta válida.
Los faltantes no deben bloquear innecesariamente la captura.
## 15. Estados de extracción
Toda extracción debe resolver campos como:
### DETECTED
### REVIEW
### MISSING
### DETECTED
Existe evidencia suficiente.
El campo puede precompletarse.
### REVIEW
Existe:
- ambigüedad;
- conflicto;
- baja confianza;
- fuentes contradictorias.
Debe mostrarse al usuario.
### MISSING
No existe evidencia suficiente.
Debe preguntarse posteriormente.
Principio:
Un dato incorrecto es peor que un dato faltante.

## 16. Confirmación humana
La IA propone.
El usuario decide.
Nunca:
IA → confirmación automática
Siempre:
IA
↓
propuesta
↓
usuario revisa
↓
usuario confirma
## 17. Motor de IA actual
Proveedor inicial elegido:
Mistral
### Texto
Modelo actualmente integrado:
mistral-small-2603
texto
→ extracción estructurada
→ Tier 1
### Business cards
Modelo actualmente integrado:
mistral-ocr-4-1
imagen
→ OCR estructurado
→ contacto / empresa / ubicación
### Audio
Provider actualmente integrado mediante Voxtral Mini Transcribe 2.
Alias utilizado actualmente:
voxtral-mini-latest
audio
→ transcripción
→ mistral-small-2603
→ Tier 1
La arquitectura mantiene providers desacoplados para permitir cambios futuros.
No existe actualmente fallback productivo a OpenAI.
## 18. Merge de fuentes
Las fuentes pueden combinarse.
Ejemplo:
business card
+
audio
+
texto
↓
merge
↓
Tier 1
Si dos fuentes coinciden:
- consolidar.
Si se contradicen:
- no elegir silenciosamente;
- marcar REVIEW.
## 19. Experiencia del administrador
El administrador necesita una interfaz diferente a la del viajero.
Home conceptual:
Canton Fair — Octubre 2026

Viajeros
36 total
32 activos
4 pendientes

Proveedores
487 capturados
423 completos
64 pendientes

Hoy
112 nuevas capturas

[ Viajeros ]
[ Proveedores ]
[ Reporte ]
Debe poder acceder al avance individual:
Renzo Coirini
38 proveedores
2 pendientes

Juan Pérez
22 proveedores
0 pendientes
## 20. Dashboard del viajero
Debe priorizar:
- viaje activo;
- nueva captura;
- capturas del día;
- proveedores recientes;
- pendientes;
- acceso rápido al detalle.
No debe sobrecargarse con métricas administrativas.
## 21. Dashboard del administrador
Debe priorizar:
- viajes;
- viajeros;
- activación;
- progreso;
- proveedores capturados;
- pendientes;
- categorías;
- reportes.
## 22. Seguridad y ownership
Principio actual:
session
→ TripMember
→ capture ownership
→ attachment ownership
→ storage
→ IA
Los clientes no deben enviar URLs arbitrarias para que el servidor procese.
Las evidencias deben resolverse desde attachments autorizados.
Secrets:
- exclusivamente server-side.
## 23. Infraestructura actual
Stack principal:
- Next.js 16
- TypeScript
- Prisma
- PostgreSQL
- Railway
- Better Auth
- Cloudflare R2
- Mistral
PostgreSQL vive en Railway.
Los binarios de imágenes y audio viven en R2.
PostgreSQL conserva:
- entidades;
- relaciones;
- metadata;
- datos estructurados;
- transcripciones cuando corresponde.
## 24. Estado de implementación — Septiembre 2026
### Implementado
- autenticación Better Auth;
- usuarios;
- viajes;
- TripMember;
- SupplierCapture;
- Supplier;
- SupplierContact;
- SupplierAttachment;
- PostgreSQL Railway;
- Prisma;
- R2 privado;
- signed URLs;
- autorización server-side;
- captura Tier 1;
- texto;
- imágenes;
- business card;
- audio;
- MediaRecorder;
- fallback file input;
- extracción Mistral;
- OCR Mistral;
- Voxtral;
- transcript persistido;
- dedupe;
- merge conservador;
- DETECTED / REVIEW / MISSING;
- confirmación manual.
### Propuesto / próximo
- mejoras de validación móvil y conectividad real;
- WhatsApp.
## 25. Validaciones reales realizadas
### Texto
Modelo:
mistral-small-2603
Caso validado:
ABC Lighting
Factory
FOB USD 7/unit
MOQ 300
Lead time 28 días
Resultado correcto.
Business card
Modelo:
mistral-ocr-4-1
Se validó con una business card completamente ficticia.
Detectó correctamente:
- empresa;
- contacto;
- email;
- teléfono;
- WeChat;
- ciudad;
- provincia.
### Audio
Se validó un audio ficticio corto.
Flujo real:
audio
→ Voxtral
→ transcript
→ Mistral Small
→ Tier 1
Detectó correctamente:
- empresa;
- factory;
- FOB;
- MOQ;
- lead time.
También se validó reutilización del transcript persistido sin volver a llamar al servicio de transcripción.
## 26. Cambios de producto pendientes
1. Roles administrativos
Estado: IMPLEMENTADO en el milestone anterior para ADMIN/TRAVELER y administración base.
2. Invitaciones
Estado: IMPLEMENTADO para creación, enlace seguro, aceptación, regeneración y estados. La entrega automática de email queda pendiente de provider.
3. Onboarding
Estado: IMPLEMENTADO en tres pasos breves por viaje; repetir el tutorial queda fuera de alcance.
4. UX mobile de captura
Estado: IMPLEMENTADO para la entrada por fuente, revisión resumida, feedback de audio/foto/texto y navegación post-confirmación.
La captura debe sentirse como:
sacar / contar / escribir

y no como completar un formulario técnico.
5. Múltiples business cards
Permitir:
- frente;
- dorso;
- imágenes adicionales.
6. Múltiples evidencias
Profundizar SupplierCapture como contenedor flexible de evidencias.
7. Dashboard viajero
Optimizar para operación durante feria.
8. Dashboard administrador
Agregar administración y seguimiento del viaje.
9. Reportes
Mejorar:
- listado;
- filtros;
- comparación;
- agrupación por categoría;
- proveedores incompletos.
10. Robustez offline
Importante por contexto de China y conectividad.
11. WhatsApp
Integración futura.
Preferencia actual:
Evolution API
ya utilizada por el equipo y hosteada en Railway.
No debe convertirse en dependencia central del producto.
La web debe funcionar independientemente.
## 27. Orden recomendado de próximas iteraciones
1. Roles + administración de viajes.
2. Invitaciones de viajeros.
3. Onboarding.
4. Rediseño UX mobile de captura.
5. Múltiples business cards / evidencias.
6. Dashboard viajero.
7. Dashboard administrador.
8. Reportes / comparación.
9. Robustez offline / conectividad (implementada parcialmente).
10. WhatsApp / Evolution API.
## 28. Fuera de alcance inmediato
No priorizar todavía:
- mapas;
- GPS;
- Tier 3 avanzado;
- billing;
- integraciones complejas;
- WhatsApp como canal principal;
- automatizaciones no esenciales.
## 29. Principios de producto
### Captura antes que formulario
El viajero debe poder guardar evidencia rápidamente.
### Mobile first
La experiencia primaria ocurre en celular.
### IA asistente, no autoridad
La IA propone.
La persona confirma.
### No inventar
Información faltante es preferible a información incorrecta.
### Evidencia múltiple
Un proveedor puede acumular distintas evidencias durante el viaje.
### Web independiente
WhatsApp puede mejorar la experiencia, pero la web debe ser completamente utilizable sin él.
### Producto para una feria real
Toda decisión debe evaluarse pensando en una persona:
- caminando;
- con poco tiempo;
- hablando con un proveedor;
- usando el teléfono;
- con conectividad imperfecta.

## 30. Definición resumida

Nihao Bot es un sistema de captura asistida de proveedores para viajes comerciales.

Convierte fotografías, business cards, audio y texto en información estructurada, proveedores comparables y reportes útiles.

Toda consolidación relevante mantiene revisión humana antes de confirmar la información.

Próximo trabajo: **validación móvil autenticada y robustez operativa de conectividad**.
