# Guía de uso de Nihao Negocios

Guía operativa del MVP para el equipo Nihao y los viajeros. Los nombres de las
pantallas y acciones corresponden a la aplicación actual. Las capturas de
pantalla se incorporarán después de aprobar el UAT final.

## 1. Equipo Nihao

### Crear y abrir un viaje

1. Iniciá sesión y entrá en **Mis viajes**.
2. Seleccioná **Nuevo viaje**.
3. Completá **Nombre**, **Inicio** y **Fin**.
4. Seleccioná **Crear y entrar**.

El viaje se abre en **Administración del viaje**. Desde **Mis viajes** también
podés abrir **Administrar empresas** y **Administrar viajeros**.

### Gestionar empresas

1. En **Mis viajes**, abrí **Administrar empresas**.
2. Escribí el nombre y seleccioná **Crear** para agregarla al catálogo.
3. Para usarla en un viaje, abrí el viaje y entrá en **Administración**.
4. En **Empresas del viaje**, buscala y seleccioná **Asignar al viaje**.

**Quitar del viaje** conserva la empresa y su información histórica en el
catálogo. **Renombrar** cambia el nombre del catálogo en todos los viajes.

### Invitar y asignar viajeros

Para una persona sin cuenta:

1. Abrí **Administrar viajeros**.
2. En **Invitar viajero nuevo**, elegí el viaje y la empresa.
3. Completá email y WhatsApp con código de país. El nombre es opcional.
4. Seleccioná **Enviar invitación**.
5. Si la entrega por email no está disponible, usá **Copiar enlace** y
   compartilo por un canal seguro.

Una invitación pendiente o vencida permite **Regenerar enlace**. El enlace
anterior queda invalidado.

Para una persona que ya tiene cuenta:

1. Abrí el viaje y entrá en **Administración**.
2. En **Asignar viajero existente**, elegí viajero y empresa.
3. Seleccioná **Asignar al viaje**.

Para retirar el acceso, abrí **Administrar viajeros** y usá **Quitar del
viaje**. La cuenta y el historial se conservan. Desde esa misma pantalla se
pueden editar nombre, WhatsApp y pasaporte por viaje.

### Organizar agendas

1. Abrí el viaje.
2. En la pestaña **Viajeros**, elegí **Administrar agenda**.
3. Usá **Agregar actividad** para cargar fecha, hora, lugar, dirección y notas.
4. Editá o eliminá una actividad desde su ficha. Las actividades seleccionadas
   también pueden copiarse a otros viajeros del mismo viaje.

### Seguir el avance y revisar información

En el viaje, el equipo Nihao dispone de estas pestañas:

- **Resumen**: métricas, categorías, ciudades y pendientes.
- **Viajeros**: empresas asignadas, avance y acceso a agendas.
- **Proveedores** y **Productos**: datos confirmados y registros pendientes.
- **Administración**: participantes, empresas y asignaciones.

Los registros con la etiqueta **Pendiente de revisión** requieren intervención
del viajero. La vista administrativa permite consultarlos, pero la confirmación
de los datos corresponde al viajero que los capturó.

### Consultar y descargar informes

En **Reportes** se puede abrir el informe del viaje y descargarlo en PDF o
Excel. Los productos pendientes aparecen separados de los confirmados. En
**Proveedores y comparación** se pueden buscar, ordenar y comparar hasta cuatro
proveedores confirmados.

Antes de compartir un informe, revisá los pendientes y comprobá que los datos
comerciales importantes estén confirmados.

## 2. Viajero

### Activar la cuenta

1. Abrí el enlace de invitación.
2. Elegí **Iniciar sesión** si ya tenés cuenta o **Crear cuenta** si es la
   primera vez.
3. Con la sesión iniciada, seleccioná **Activar mi acceso**.
4. Completá las tres pantallas de bienvenida y seleccioná **Empezar**.

Un enlace vencido o ya reemplazado debe regenerarlo el equipo Nihao. La cuenta
sólo accede a los viajes y empresas que le fueron asignados.

### Capturar por WhatsApp

Podés enviar texto, fotos de tarjetas o productos y notas de voz sin esperar
una respuesta entre mensajes. Para ayudar a la asociación:

- enviá una foto principal legible de la tarjeta de cada proveedor;
- podés enviar el reverso y otras evidencias: Nihao conserva cada mensaje;
- nombrá al proveedor y al producto en el texto o audio cuando sea posible;
- indicá moneda y unidad para FOB, cantidad y unidad para MOQ, y días o semanas
  para el plazo de entrega;
- aclaraciones posteriores pueden mencionar el proveedor o responder citando el
  mensaje correspondiente;
- al cambiar de proveedor, escribí su nombre o enviá su tarjeta.

No necesitás confirmar cada foto ni terminar una captura antes de comenzar la
siguiente. Nihao guarda las asociaciones seguras y deja las ambiguas pendientes
para revisión. Los productos recibidos por WhatsApp permanecen como borradores
hasta su confirmación en la Web.

Una marca de enviado en el teléfono no demuestra que Nihao ya recibió el
mensaje. La conservación en servidor empieza cuando el webhook lo recibe y,
para un medio, cuando la copia original fue almacenada y verificada. Conservá
los mensajes en WhatsApp hasta poder revisar el resultado.

### Qué ocurre sin conexión

WhatsApp mantiene en el teléfono los mensajes que todavía no pudo entregar. Al
recuperar señal puede enviarlos juntos; podés continuar capturando sin esperar
respuestas del bot.

La Web puede guardar localmente una captura iniciada y sus evidencias en el
navegador, y ofrece **Sincronizar ahora** al recuperar conexión. La IA, la
revisión, la confirmación y los informes necesitan conexión. Este mecanismo es
una cola de captura y sincronización; la aplicación completa no funciona sin
Internet. No cierres sesión ni cambies de usuario con capturas locales
pendientes.

### Capturar desde la Web

1. Abrí el viaje y seleccioná **Capturar proveedor**.
2. Elegí **Tarjeta o foto**, **Contarme** o **Escribir**.
3. En **Evidencias**, podés sumar tarjetas, fotos de producto, notas de voz y
   una nota escrita.
4. Seleccioná hasta tres tarjetas y tres audios por análisis.
5. Elegí **Analizar información**.
6. Revisá los datos detectados y los campos pendientes.

Si agregás o quitás evidencia después del análisis, la captura queda marcada
para volver a analizar. Las correcciones humanas ya guardadas se conservan.

### Corregir una fotografía asociada al proveedor equivocado

1. Abrí el proveedor o la captura pendiente desde la Web.
2. Buscá la tarjeta o fotografía de producto incorrecta y seleccioná **Cambiar proveedor**.
3. Elegí el proveedor destino. La lista muestra únicamente capturas tuyas de la
   misma empresa y el mismo viaje.
4. Seleccioná **Confirmar cambio**.
5. Abrí ambos proveedores y revisá los datos marcados como pendientes. En una
   foto de producto, asignala al producto correcto desde **Imágenes de productos**.

Nihao conserva el archivo original; no lo vuelve a subir ni lo elimina de R2.
Si la fotografía había participado del análisis, los datos derivados pueden
requerir nueva revisión. Los valores y correcciones humanas no se reemplazan en
forma automática. Cada foto se trata individualmente, por lo que un frente y un
reverso pueden quedar pendientes hasta que su relación sea clara.

### Revisar, corregir y confirmar

En el viaje, abrí **Proveedores** o **Productos** y elegí un elemento
**Pendiente de revisión**. Usá **Editar** en cada campo que necesite corrección.
Cuando un dato realmente no esté disponible, marcá la opción correspondiente
en lugar de inventarlo.

Confirmá sólo después de revisar empresa, contacto, producto, FOB, MOQ, plazo y
notas. La confirmación convierte el borrador en información disponible para los
informes. Si se agrega evidencia nueva o aparece un conflicto, el registro
vuelve a revisión.

### Agenda e informes

La pestaña **Agenda** permite crear y editar tus actividades. En **Informes**
podés descargar:

- **Informe PDF**;
- **Excel de proveedores**;
- **Excel de productos**;
- **Resumen del viaje**.

Los borradores y pendientes se muestran separados para evitar tratarlos como
datos comerciales confirmados.

## 3. Ayuda ante un problema

Si un mensaje o evidencia no aparece:

1. comprobá que WhatsApp lo haya entregado y no continúe pendiente en el
   teléfono;
2. abrí el viaje en la Web y revisá **Pendientes**;
3. no vuelvas a crear manualmente el mismo proveedor hasta descartar que la
   captura esté en proceso;
4. informá al equipo Nihao la hora aproximada y el tipo de mensaje, sin reenviar
   datos personales por canales no autorizados.

