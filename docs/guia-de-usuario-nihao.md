# Guía de uso de Nihao Negocios

Guía operativa del MVP para el equipo Nihao y los viajeros. Los nombres de las
pantallas y acciones corresponden a la aplicación actual. Las capturas de
pantalla se incorporarán después de aprobar el UAT final.

## Evidencias enviadas por WhatsApp

Podés enviar una foto del producto y escribir el nombre del proveedor. Si el mensaje no alcanza para identificarlo, Nihao te preguntará a qué proveedor corresponde o conservará la imagen para revisión en la Web. Una foto de un producto no crea un proveedor. Si recibís una pregunta, respondé con el nombre literal o elegí una de las opciones mostradas; si hay nombres parecidos, Nihao pide que selecciones el correcto.

Nihao sólo ofrece **REINTENTAR** cuando detecta que el procesamiento puede recuperarse. Si un aviso indica que la información quedó guardada para revisión, abrí las evidencias del viaje en la Web y completá la asociación allí; volver a escribir `REINTENTAR` no corrige una clasificación o asociación dudosa.

Si el bot detecta que no puede avanzar o agota los intentos, conserva la información y te dirige a **Nihao → tu viaje → Pendientes**. No hace falta reenviar la foto ni insistir con `REINTENTAR`: la Web permite revisar el original, elegir proveedor y producto, corregir los datos y guardar una sola vez. En una negociación, completá FOB sólo cuando la fuente indique explícitamente esa condición; **Precio cotizado** se guarda por separado.

Al guardar una negociación, la confirmación indica si se vinculó un proveedor existente o se creó uno como borrador, y si los datos se aplicaron a un producto existente o se creó uno como borrador. La acción **Ver proveedor y producto** abre el registro que acabás de guardar.

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
3. Para usarla en un viaje, expandí su ficha y elegí el viaje en
   **Incorporar a otro viaje**. La relación se crea sólo cuando confirmás.
4. Dentro de cada viaje de la empresa podés buscar viajeros existentes,
   asignarlos o quitar únicamente esa asociación.

**Quitar del viaje** conserva la empresa y su información histórica en el
catálogo. **Renombrar** cambia el nombre del catálogo en todos los viajes.

### Invitar y asignar viajeros

Para una persona sin cuenta:

1. Abrí **Administrar viajeros**.
2. En **Invitar viajero nuevo**, elegí el viaje y la empresa.
3. Completá el email. El nombre y el WhatsApp son opcionales: podés vincular el
   teléfono ahora o más adelante desde la ficha del viajero.
4. Seleccioná **Enviar invitación**.
5. Si la entrega por email no está disponible, usá **Copiar enlace** y
   compartilo por un canal seguro.

Para cargar un WhatsApp, elegí el país y escribí el número nacional. El selector
admite números de cualquier país, detecta un prefijo internacional pegado y
muestra el formato legible antes de guardar. El número queda reservado para esa
persona y una variante equivalente no puede pertenecer a otra cuenta. Si
necesitás corregirlo o agregarlo después, hacelo desde **Administrar viajeros**;
el viajero no lo modifica desde su cuenta. Vincular un teléfono no implica por
sí solo autorizar mensajes iniciados por Nihao.

Una invitación pendiente no vence automáticamente. Permanece disponible hasta
que la persona la acepta o el administrador selecciona **Regenerar enlace**;
en ese caso, el enlace anterior queda invalidado. También podés seleccionar
**Revocar** para invalidarla sin eliminar una cuenta. Al quitar una empresa de
un viaje, Nihao pide confirmación explícita para revocar sus invitaciones
pendientes y conserva las aceptadas.

La lista **Invitaciones pendientes** muestra sólo enlaces todavía utilizables.
Al revocar, Nihao pide confirmación y retira la invitación de esa lista cuando
el servidor confirma la operación. Para volver a invitar a esa persona, usá el
formulario y generá un enlace nuevo.

Para una persona que ya tiene cuenta:

1. Abrí el viaje y seleccioná **Gestionar viaje**.
2. En **Invitaciones y asignaciones**, abrí **Buscar viajero** y escribí su
   nombre o email.
3. Elegí la empresa y seleccioná **Asignar**. La lista indica si la persona
   todavía no pertenece al viaje, está sin empresa o ya tiene otra asignación.

Una empresa puede tener varios viajeros y un viajero puede representar más de
una empresa dentro del mismo viaje. Nihao no duplica la membresía ni la
asignación cuando una operación se reintenta.

Para corregir solamente la empresa de una persona:

1. En **Empresas participantes**, buscá a la persona.
2. Seleccioná **Quitar de esta empresa** y confirmá la advertencia.
3. Si corresponde, asignala a otra empresa desde el bloque siguiente.

Esta acción mantiene a la persona dentro del viaje y conserva sus capturas,
proveedores y demás información histórica. Si queda sin empresas, aparece de
forma visible como **Sin empresa**. Quitar una empresa del viaje sigue siendo
una acción diferente y secundaria.

Para retirar el acceso, abrí **Administrar viajeros** y usá **Quitar del
viaje**. La cuenta y el historial se conservan. Desde esa misma pantalla se
pueden editar nombre, WhatsApp y pasaporte por viaje.

En **Administrar viajeros**, cada ficha muestra en el encabezado los datos de
contacto, la cantidad de viajes y las acciones **Editar viajero** y
**Administrar**. Al abrirla, cada viaje reúne pasaporte, empresas y agenda.
Los selectores de **Agregar otra empresa** y **Agregar a otro viaje** aparecen
sólo cuando elegís esas acciones; podés cancelarlos sin modificar ninguna
asignación. **Quitar del viaje** y quitar una empresa siguen siendo operaciones
diferentes y solicitan confirmación.

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
- **Evidencias WhatsApp**: mensajes recibidos, estado del análisis, texto/transcripción y originales multimedia.
- **Reportes**: informe visible dentro del viaje y descargas PDF o Excel.

La acción principal **Gestionar viaje** reúne participantes, empresas,
invitaciones, asignaciones y seguimiento sin agregar una pestaña redundante.

Los registros con la etiqueta **Pendiente de revisión** requieren intervención
del viajero. La vista administrativa permite consultarlos, pero la confirmación
de los datos corresponde al viajero que los capturó.

### Consultar proveedores y productos

Dentro del viaje, **Proveedores** reúne registros confirmados y capturas que
todavía requieren revisión. Podés buscar por nombre, contacto, categoría o
ciudad, filtrar por estado y abrir el detalle sin salir del viaje. Para comparar,
seleccioná entre dos y cuatro proveedores confirmados; la comparación aparece
en la misma sección.

**Productos** permite buscar por producto, modelo o proveedor y filtrar por
estado, empresa y proveedor. Los datos que faltan aparecen como “Sin precio
registrado”, “MOQ sin registrar” o “Plazo sin registrar”.

### Consultar y descargar informes

En **Reportes** el informe se muestra directamente dentro del viaje, organizado
en secciones expandibles. En la cabecera se encuentran las dos acciones
principales: **Descargar PDF** (informe completo) y **Descargar Excel** (libro
completo). El PDF
presenta indicadores, participantes, fichas de proveedores, productos y agenda
según el tipo elegido. Los productos pendientes aparecen en una sección
separada de los confirmados. En
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

Los campos de contraseña empiezan ocultos. El botón con forma de ojo permite
mostrar u ocultar cada contraseña sin cambiar lo escrito ni enviar el formulario.
El número de WhatsApp puede haberse definido al crear la invitación o vincularse
después desde administración. Si falta o no es correcto, contactá al
administrador antes de comenzar la captura.

Si el navegador tiene abierta otra cuenta, Nihao informa que el email no
coincide y permite elegir **Usar otra cuenta**. Un enlace ya reemplazado debe
regenerarlo el equipo Nihao. La cuenta sólo accede a los viajes y empresas que
le fueron asignados.

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

Nihao reconoce MOQ como cantidad mínima de pedido y conserva la composición de
variantes. También distingue FOB de CIF/EXW/CFR y convierte semanas de plazo a
días. Si un audio dice algo ambiguo como «MOC 200», lo deja para revisión y no
inventa un producto ni un MOQ.

También podés enviar documentos; se conservan para revisión manual y los PDF no
tienen extracción automática en este flujo. Los videos todavía no se procesan
por WhatsApp. Si tenés dudas, preguntá por los formatos antes de enviar una
carga comercial.

No necesitás confirmar cada foto ni terminar una captura antes de comenzar la
siguiente. Nihao guarda las asociaciones seguras y deja las ambiguas pendientes
para revisión. Los productos recibidos por WhatsApp permanecen como borradores
hasta su confirmación en la Web.

Si el bot avisa que una evidencia quedó pendiente o tuvo un error, abrí el viaje
en la Web y elegí **Evidencias WhatsApp**. Allí podés consultar los mensajes,
transcripciones, datos comerciales extraídos y originales que se hayan guardado.
Elegí la empresa y, si corresponde, el proveedor existente para asociar la
evidencia manualmente. Nihao no crea un proveedor, producto o precio al elegir
un destino. Después podés revisar la ficha del proveedor, completar los datos
o agregar el producto desde la pantalla existente y confirmar los cambios.
Si no sabés a qué proveedor corresponde, dejá la evidencia sin asociar hasta
resolverlo; no hace falta reenviar el mensaje. Si todavía no se pudo identificar
el viaje o la empresa, la vas a ver marcada «sin asociación» en tus viajes
accesibles. Elegí el viaje y la empresa sólo después de revisar a qué corresponden
los datos.

Para consultar el estado, escribí «¿Qué evidencia está pendiente?» o citá el
mensaje correspondiente. Una cancelación como «olvidate» detiene la aclaración
actual y conserva la evidencia que ya había llegado para que puedas revisarla
en la Web. Si el bot indica que repetir el procesamiento no puede resolver un
bloqueo, abrí **Evidencias WhatsApp** y corregí o asociá la información allí.
Si Nihao no puede verificar que una operación se completó, la evidencia queda
pendiente de revisión y el bot no confirma el cambio ni te pide repetirlo sin
fin.

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

La pestaña **Agenda** permite crear y editar tus actividades. En **Reportes**
podés consultar el informe dentro del viaje y usar **Descargar PDF** o
**Descargar Excel**. Los formatos parciales siguen disponibles para
compatibilidad de enlaces existentes, pero no ocupan la cabecera principal.

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

## 4. Revisar evidencias de WhatsApp

En un viaje, abrí **Evidencias WhatsApp**. Las tarjetas resumen los datos reconocidos y el contenido disponible; **Revisar / Resolver** abre fuentes y formulario sólo cuando lo necesitás. **Por resolver** muestra mensajes con información comercial que necesitan una decisión; **Resueltas** y **Descartadas** conservan las decisiones, y **Historial** permite consultar los originales autorizados.

La bandeja usa la misma ficha para una evidencia individual o varios mensajes del mismo lote. Elegí un proveedor existente o creá un borrador y, en la misma acción, seleccioná o creá el producto. Corregí los datos y pulsá **Guardar evidencia** o **Guardar negociación** una sola vez. Proveedor, producto, vínculos y decisiones se guardan juntos: si una parte falla, no queda una creación parcial. La fotografía queda vinculada al producto mediante su original privado y cada dato conserva el mensaje que lo respalda. Si el lote mezcla proveedores o categorías, seleccioná sólo los mensajes que correspondan. Los mensajes resueltos salen de Pendientes y siguen en Historial.

Revisá categoría, precio cotizado, FOB explícito, moneda, unidad, cantidad mínima y plazo antes de guardar: los casilleros vacíos indican datos desconocidos. Un precio sin Incoterm no se guarda como FOB. La categoría se guarda por separado y nunca se usa automáticamente como nombre del producto. **Descartar** está disponible cuando la empresa ya consta en el contexto autorizado; no requiere completar datos comerciales. El original permanece en **Historial** y puede recuperarse. Si la evidencia no tiene empresa verificada, el descarte aún no está disponible: el modelo de decisiones exige una empresa y no corresponde asignarla sólo para limpiar la bandeja.

En **Proveedores**, abrí una ficha pendiente para completar nombre, contacto, ciudad, productos y evidencias. Podés marcar el borrador como **revisado** aunque todavía falte contacto; seguirá sin confirmar y sus productos se pueden gestionar. La confirmación exige nombre y un contacto válido. **Archivar borrador** requiere confirmación y conserva fotos e historial. El administrador del viaje puede gestionar las fichas de su ámbito y las evidencias expresamente asociadas a sus empresas; no ve evidencias sin ámbito de otros viajeros. Una evidencia resuelta también se muestra en la ficha comercial vinculada.

