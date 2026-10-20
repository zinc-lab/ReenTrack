# Fallos típicos de este proyecto

Sacados de las auditorías que encontraron fallos. Cada vez que una auditoría
encuentre un fallo de un tipo que no está aquí, se añade (una línea, con su
ejemplo y sin datos reales).

Casi todos salían **con otros datos que los de quien desarrolla**: que la
paridad con los datos reales esté en verde no prueba nada.

## 1. Dos cálculos del mismo dato no dicen lo mismo

- Redondeo: `toFixed` redondea los empates hacia arriba; el motor fiscal e
  informe redondean al par (`pyRedondeo`). Un caso como 12,0078125 da
  otra cifra según quién lo redondee.
- La última cifra: `Number(BigInt)/10^d` redondea dos veces; una paridad
  con tolerancia no lo ve.
- Lectura distinta del mismo texto en dos sitios: expresiones regulares,
  palabras con tilde, orden con tildes, punto de miles («1.800»), `null`
  frente a `undefined`, filas vacías que cambian el nº de fila.
- Un objeto normal de JavaScript usado como diccionario: un nombre
  «constructor» o «__proto__» casa con lo que hereda todo objeto (un token
  se confirmaba solo; un ajuste escribía en `Object.prototype`). Usar `Map`.
- Un dato ilegible que para el cálculo entero (un depósito sin cantidad
  legible) en vez de dejarlo a revisar. Y lo que para el cálculo no llega
  a las cifras de referencia, así que la paridad no lo ve.
- Un cociente cuyas dos partes no cubren lo mismo: lo que se queda fuera
  de abajo (una compra sin importe o sin tipo del BCE) sigue sumando
  arriba (sus rendimientos) y el % se dispara sin aviso. Y un dato aún
  provisional (un cobro a medias, a revisar) contado como el final.

**Mirar:** cada regla tocada, ¿está igual en todos los sitios que la
calculan? ¿Lo comprueba una paridad con un caso que la ejercite?

## 2. Datos mal escritos o inesperados

- `null` o algo que no es un objeto dentro de una lista.
- Un bloque de la cache mal escrito deja una pestaña en blanco
  (`pagos_diferidos`).
- Un campo que es un objeto donde se esperaba una lista, o al revés
  (`asignaciones`).
- Un archivo del tipo equivocado aceptado como otro: un `config.json` como
  cache; una lista, un número o la cache como config.
- Listas de hashes mal escritas, campos que faltan.
- Una operación con una pata de más: el pool devolvía unos céntimos del
  USDT pagado y esa devolución se tomaba como lo recibido, así que la
  compra de RNT quedaba como movimiento neutro. Un mismo protocolo con dos
  direcciones (el recibo SLP y la del pool).
- Un texto de los datos metido en un formato con marcas: un «<» en el
  motivo de «Mandar a revisar» paraba el PDF del informe.
- Un archivo que el motor no entiende se lee como vacío o 0 en vez de
  pararse: separado por «;», cabecera en mayúsculas, una columna que
  falta. Y un dato que se guarda y no se mira nunca: la wallet de cada fila
  del archivo.
- Fiarse de algo que cualquiera puede copiar: el prefijo «Reental-» o el
  nombre de un inmueble en un token que te manda un desconocido lo
  confirmaba como inmueble. En la blockchain, el nombre, el símbolo y hasta
  el remitente de un token los elige quien lo crea.
- Una operación con varias patas donde el código toma la primera: una
  venta cobrada en dos pagos, un pago para dos inmuebles.
- La cache guarda datos de otra configuración: las transacciones de la
  wallet o el vault de antes.
- Comparar dos archivos de formatos distintos: el antiguo sin una columna
  opcional (la wallet, los cobros) hacía que todo saliera «nuevo» y
  «desaparecido», o «actualizado» sin cambios.

**Mirar:** cada dato que viene de la cache, de la configuración, del
archivo de Reental o de «Ajustes en JSON»: ¿qué pasa si falta, es `null`,
tiene otro tipo o está vacío?

## 3. Deshacer, editar o volver pierde algo

- Deshacer una decisión no devuelve el estado de antes con todos sus datos
  (la fecha y el motivo, el coste, el ajuste anterior, el coste de un
  «Mandado a revisar»).
- Editar conserva solo una parte (importe esperado y liquidación).
- Cargar algo nuevo borra lo que ya había (API key, nombre o NIF).
- La clave de un registro sacada de algo que cambia solo (el hash que
  Reental anota tarde, el orden de las filas, el contrato del catálogo):
  el ajuste del usuario se perdía o caía en otro registro. Una decisión del
  usuario se guarda por clave: la clave tiene que salir solo del dato.
- Una decisión del usuario sobre algo que maneja otro mecanismo: «Dejar
  como venta» en una venta vinculada seguía valiendo al anular el vínculo,
  y «neutro» sobre un cobro dejaba sin lote lo cobrado por la venta.
- Un editor que enseña el dato de ahora pero, al guardar, lo compara con el
  que había al abrirlo: tras cambiarlo en otra pestaña, lo que añades sale
  como «cambió mientras escribías» y se pierde. Lo que se compara tiene que
  ser lo que se ve.
- Una acción que se deshace desde otro sitio (el ↩ de una fila de otra
  pestaña): si no alcanza a ninguna fila (todas ya decididas por el
  usuario), no queda ningún ↩ y lo hecho es invisible; y lo que la acción
  cambió de paso (un token confirmado que pasa a «con dudas») el ↩ no lo
  devuelve.

**Mirar:** para cada acción nueva, hacer → deshacer → ¿queda exactamente
como antes? Hacer → editar → ¿se conservan los campos que no se editaron?
¿Y si el estado de partida no era el normal (venía de otra decisión)?

## 4. Estado de la pantalla y repintados

- Lo escrito a medias se borra al repintar.
- Algo cambia mientras el usuario escribe y al aplicar se pisa sin aviso.
- Un diálogo con una lista congelada al abrirlo: se abre otro encima (Tab
  + Intro en un botón de debajo) o se deshace algo por debajo, y al
  guardar el viejo decide sobre lo que ya cambió (unas compras pasaban a
  regalo).
- Dos pestañas que editan lo mismo (la nota personal en 📒 y 💰): un
  borrador abierto en una pisa lo guardado en la otra, y pasa de una cache
  a otra.
- Menús u opciones abiertas sobre una fila que ya no se ve.
- Algo fijo arriba (una fila de botones que no se mueve al bajar) tapa lo
  que otro salto lleva a la vista si ese salto no cuenta con su alto; y al
  imprimir queda como una franja vacía.
- Un filtro que se aplica a cada tecla descarta lo elegido: al teclear el
  año de una fecha, el campo pasa por «0002-…» y el cobro elegido dejaba de
  estarlo.
- Se pierde el foco; se pinta dos veces; un aviso viejo actúa sobre otra
  cache.
- Una función que cambia lo que recibe y no da lo mismo al repetirla: el
  motor fiscal escribe notas y «revisar» en los registros; pasado dos veces
  sobre `state.registros`, repite notas y deja avisos viejos en otras
  pestañas. Llamarlo con una copia nueva cada vez.
- Una parte de la pantalla que pasa a depender de la clasificación
  (`state.registros`) se pinta antes de que termine, y se queda con la de
  antes; o se vacía mientras se reclasifica (el bloque de precios de POL
  salía vacío al abrir la app). Un arnés que repinta a mano después de
  clasificar lo tapa.
- Un aviso llega antes de que esté apuntado lo que se lee: al recargar,
  js/12 avisa al chip antes de que js/19 apunte el archivo recordado, y
  📤 decía que faltaba.
- Lo impreso no es lo que se ve: una tabla en una caja con scroll de lado
  sale cortada en el papel, y lo que va en botones desaparece (recuentos,
  «Ver todos»).
- Al cambiar de cache queda en memoria algo de la anterior y se usa con la
  nueva: `state.registrosSinVinculos` sellaba las decisiones de la cache
  recuperada con los movimientos de la de antes (una decisión fiscal caía
  en otro movimiento). Mirar todo lo que se borra al abrir otra cache, no
  solo `state.registros`.
- Un cálculo guardado cuya clave es un objeto que se cambia por dentro: el
  de 🧾 Fiscal mira `state.config`, y escribir el nombre o el NIF lo cambia
  sin crear otro, así que el informe seguía con el titular de antes.
- Una espera larga (`await`) metida en mitad de un flujo que antes iba de
  un tirón: lo que el usuario hace mientras (cambiar de pestaña, cargar un
  archivo, cambiar la wallet) llega con el flujo «en marcha» y se pierde;
  🧾 se quedaba en «Actualizando» y la app sin clasificar. Repintar y
  comprobar lo cambiado al terminar.
- Una pieza que había una vez y ahora hay dos (dos gráficos con bocadillo):
  los dos bocadillos abiertos a la vez, y al repintar el bocadillo volvía a
  la misma posición, que con otra serie era otro mes. Guardar «qué» estaba
  elegido (el mes), no «dónde».
- Un estado de pantalla del mismo color que el de al lado: el ✏️ con nota y
  la fila con el ratón, el mismo gris; no se distinguían.
- Mover la página antes de cambiar de pestaña: el navegador guardaba esa
  posición y «Atrás» volvía arriba.
- Una espera nueva al final de un flujo (preguntar a internet tras
  clasificar): lo que llegó mientras tanto («ya clasificará al terminar»)
  se quedó sin hacer, y una ventana que se abre sola al acabar lo propuso
  aunque el usuario ya lo había escrito.
- Una ventana modal puesta en el `<body>` (para que un repintado no la
  borre) no sigue a su pestaña: se quedaba encima de otra al cambiar de
  pestaña, y al imprimir salía ella y no la tarjeta. Cerrarla al salir y
  al imprimir. Y un interruptor que se oculta sin datos volvía encendido
  sin verlo al volver los datos: apagarlo al ocultarlo.
- Borrar una marca compartida («ya se abrió solo») para que un plegable se
  reabra reabre también los demás que la usan, y más tarde, en el
  siguiente repintado (a mitad de una decisión). Borrarla solo en el que
  toca. Y una pista de qué hacer sin datos (o un aviso de que falta la
  wallet) dentro de un plegable cerrado u oculto no la ve nadie.
- Un enlace que lleva a un bloque lejano (scroll y abrir) sin llevar el
  foco: con el teclado, Tab vuelve a donde estaba.
- Lo que hace falta mientras algo se anima, puesto para siempre: el
  recorte (`overflow:clip`) de una fila que se despliega seguía con la fila
  abierta y cortaba las burbujas ⓘ que se abren hacia arriba. Recortar solo
  mientras se anima. Y una ⓘ dentro de un `<label>`: el campo se llama como
  todo su texto.

- Un botón que repinta un formulario a medias (cambiar la moneda) y le
  devuelve el foco como al abrirlo, con todo seleccionado: la siguiente
  tecla borraba lo escrito. Al volver, el cursor al final.

**Mirar:** ¿qué pasa si se repinta, se reclasifica o se cambia de pestaña a
mitad de la acción? ¿Y si se pulsa dos veces? ¿Y en el papel?

## 5. Arreglos a medias: la misma regla en dos sitios

- Arreglar la cifra en una pestaña y no en las demás crea una tercera:
  📊 y 💰 dejaron de sumar un negativo, 📒 lo seguía enseñando y 🧾 no lo
  declaraba. Antes de tocar cómo se lee un dato, mirar todas las pestañas
  que lo enseñan.
- Una regla escrita en dos sitios que no coinciden: la validación de wallet
  y vault en `js/14` y en `js/19`.
- Un arreglo que solo mira un caso (solo la categoría del ajuste).
- Un texto que copia lo que hay en otro sitio: la lista de pestañas de
  📖 Ayuda se quedó en el orden viejo al reordenar el menú, y decía
  «imprimir cualquier pestaña» con solo cuatro.
- Un arreglo que rompe otra cosa: quitaba también el mensaje que el usuario
  necesitaba, o dejaba «3 de 1 movimiento».
- Un camino de entrada que se queda sin la comprobación nueva: sincronizar
  seguía con su regla de direcciones; la config guardada en el navegador no
  pasaba la de cargar la config.
- Algo que se aprende por un solo camino: el distribuidor de Reental solo
  por lo que paga al vault, nunca por lo que paga a la wallet.
- La pantalla da por hecho lo que el motor no hizo: un vínculo guardado
  salía como aplicado aunque el motor lo rechazaba; 📒 ya miraba la marca
  del motor y 🔍 no.
- Un segundo lector busca por la clave lo que el primero ya lleva por otro
  camino: el ajuste seguía a su movimiento por el sello, pero el motor lo
  leía en la clave del registro.
- Quitar algo de lo que dependían otras reglas: al quitar una dirección
  que trae la app, lo que movía se clasificaba por otra regla (una venta,
  un depósito) sin quedar a revisar, y su token entraba en el catálogo
  como inmueble.
- Una regla que se cierra en un orden y no en el otro: tras vincular un
  cobro ya no se podía decidir «neutro», pero decidir «neutro» y luego
  vincularlo sí, y quedaba sin lote.
- Dos pantallas del mismo flujo que cuentan cosas distintas: el buscador
  miraba los vínculos que el motor aplicó y el formulario todos los
  guardados; el buscador ofrecía un cobro que el formulario bloqueaba. Y en
  una misma fila, el % se calculaba con el cobro solo y el 💲 con lo ya
  cobrado: «💲» junto a «−97 %».
- Una pantalla que vuelve a calcular lo que el motor ya sabe, sin su
  tolerancia ni sus marcas: un resto de 0,000001 salía «pendiente» (el
  motor usa 0,005) y un pendiente que el motor sabía cobrado pedía
  reclamarse.
- La app decide «qué falta» con una regla propia más floja que la del
  motor fiscal: un coste o un precio escrito como texto vale en la pantalla
  y no en el motor, y la pantalla dice que no falta nada.
- La receta de un comentario («cómo llamarlo») distinta de la llamada de
  verdad: la del Excel no pasaba la descarga fallida que sí pasa 🧾 Fiscal,
  y quien la copiara daría un año por cerrado. O se salta la guarda de la
  pantalla: pedir el informe a `fiResultado` imprime aunque 🧾 Fiscal se
  niegue («la clasificación no está al día»).
- Un filtro que decide «qué es X» con su propia regla: el gas de un
  approve va al token y el contrato DeFi solo está en el input; leer los
  bloques de la cache en vez de los roles del motor (un rol por dirección)
  da otra respuesta, y lo trajo un `/simplify`; y leer la cache de ahora
  con la clasificación de antes.

**Mirar:** buscar (`grep`) todos los sitios donde vive la misma regla o se
llama a la función cambiada. Cada arreglo: ¿qué otra cosa usaba lo que
cambió?

- Un dato nuevo que va con otro (lo pagado en USD con su coste en €): las
  funciones que copian el viejo de un ajuste a otro (mandar o quitar de
  revisar, «✔ Dejar», deshacer) lo pierden si no se tocan todas.

## 6. Filtros y recuentos que no cuadran

- Con un filtro pulsado, otro filtro o el selector cuentan otra cosa.
- El mismo dato contado distinto en dos pantallas (fechas sin precio).
- Una pantalla que suma cifras ya redondeadas da otra cifra que el informe:
  la ganancia de cada venta desplegada salía 69,99 € y el resumen 70,00 €.
  Sacarla del registro con las mismas cuentas que el total.
- Las cifras de referencia pueden haberse grabado con el fallo dentro: el
  total de la hoja Cartera sumaba dos veces el resultado de un pool puesto
  a mano; solo se vio comparando con otra hoja del mismo libro.
- Una caja de totales y una tabla de filas que salen de sitios distintos
  (el total de lo pagado frente a las filas de lo que queda en la cartera):
  con tokens enviados a otra wallet no sumaban lo mismo y nada lo decía.
  Una fila con «el resto».

**Mirar:** cada recuento nuevo o tocado, con cada filtro pulsado y con el
spam, lo apartado y lo «a revisar» dentro y fuera.

- Una acción «para todos los de esta dirección» se lleva también lo que
  la app ya clasificó bien (el principal que vuelve del staking pasaba a
  premio; un swap, a compra bancaria): el filtro del bloque mira la
  dirección y no si estaba por decidir.

## 7. Avisos vagos, incompletos o falsos

- El aviso habla de un problema cuando hay dos.
- «Revisa los datos» en vez de decir qué falla.
- Dice que se guardó algo que no hizo nada («0 movimientos»).
- No avisa de que algo sigue igual por otra regla (sigue en el spam por su
  dirección).
- Una etiqueta que dice algo falso de dónde está: «USDT (wallet)» con el
  USDT aportado a un pool; «véase el apartado IV» con el IV vacío.
- Un total que deja fuera una parte sin decirlo (el vault sin tipo BCE) y
  una nota que está en el resultado pero no se pinta en ningún sitio.
- Textos copiados de otra salida que remiten a lo que esta pantalla no
  tiene: «figuran en el punto 3», «véase el apartado IV» del PDF en la
  pestaña Fiscal.
- Un aviso que el usuario no puede quitar: el motor lo volvía a poner
  aunque en 🔍 Revisión se decidiera «dejar como movimiento», y el año
  quedaba con «⚠️ 1 aviso» para siempre. Todo aviso nuevo, con su salida.
- Lo que queda fuera de una cifra se enseña como si no existiera en otra:
  una compra sin tipo del BCE salía «sin compra» en el valor nominal.
  Decir el motivo real.

**Mirar:** cada camino de error: ¿el usuario sabe qué falla y qué hacer?
¿El aviso dice la verdad del estado final?

## 8. Reconocer algo por su texto

- Una operación o motivo que se reconoce comparando texto deja de
  reconocerse si se añade una nota detrás.
- «Ver en Transacciones» no encuentra el movimiento por un filtro que queda
  puesto.
- Saber de qué vínculo es un problema por el texto del motor: había dos
  formatos («venta X: …» y «venta X, asignacion …») y solo se miraba uno.
- El motor fiscal decidía canje, venta P2P y swap por la nota: «reembolso
  de capital» en el motivo de «Mandar a revisar» dejaba una venta con
  G/P 0 y fuera del informe.
- Decidir por un campo que una decisión del usuario no rellena: la venta
  de «Es una venta…» no lleva `inmueble` y el informe la mandaba a
  monedas virtuales.

**Mirar:** comparaciones de cadenas (`===`, `startsWith`, regex) sobre
textos que el usuario o un ajuste pueden cambiar.

## 9. Fechas, horas y navegador

- Una ventana de fechas puesta por defecto esconde lo que cae fuera sin
  decirlo: el pago adelantado al día de la venta no salía.
- Fechas en UTC donde el usuario espera la hora local (a las 00:30 sale el
  día anterior); fechas sin zona leídas como locales.
- Algo guardado en el navegador (IndexedDB, localStorage) que ya no vale y
  da el mismo aviso en cada visita; almacenamiento bloqueado.
- Un fallo pasajero tratado como definitivo: un archivo bloqueado o a medio
  escribir hacía olvidar la cache recordada.
- Al revés: un dato viejo rellenado sin límite. Si fallaba la descarga del
  BCE, el último tipo valía para meses; el informe lo repetía con el vault.
- La fecha de corte sacada del último movimiento, no de hoy ni de cuándo
  llega el cobro: un año pasado salía «en curso» y el USDT que llegaba al
  vault después salía en la wallet.
- Un error de red leído como «no hay nada nuevo»: Etherscan sin respuesta
  daba «0 nuevas» y el informe decía «datos hasta hoy»; y dos series que
  comparten el marcador de «descargado hasta aquí»: si una fallaba, la otra
  lo hacía avanzar.
- Un valor extremo que la validación acepta y rompe un bucle: con la fecha
  31/12/9999 el día siguiente sale «+010000-01», menor como texto, y la
  app se colgaba.
- El mismo 31/12 tratado como año terminado; años sin movimientos (en
  medio o al final) sin su cierre, también el año al que solo llega un
  cobro.
- Ordenar por fecha con lo vacío primero: lo que no tenía fecha válida
  entraba en la cartera del primer año.
- Un permiso del navegador que solo se puede pedir justo tras un clic,
  pedido más tarde: el diálogo de abrir da solo el de leer, y al autoguardar
  tras la descarga Chrome ya no podía preguntar el de escribir; fallaba en
  silencio y salía «Hay cambios sin guardar». Los dobles de los arneses no
  tienen ese permiso: comprobarlo a mano.
- El navegador no es solo de esta app ni de esta persona: otras páginas
  abiertas con doble clic comparten el almacén, y borrar por el prefijo
  «reental_» se llevaba lo suyo; en un ordenador compartido, el nombre, el
  NIF y la API key de otro completaban tu archivo; y otra pestaña de la app
  volvía a guardar lo que se acababa de olvidar.
- Una fuente que no es la del dato decide hasta dónde llega: las fechas
  del archivo de Reental daban por descargada la blockchain y cerraban un
  año al que le faltaban movimientos.
- Un archivo del disco y su copia en el navegador: «cambió fuera» por la
  fecha falla en los dos sentidos. Una copia pegada encima conserva su
  fecha más vieja y se pisaba; un programa que sincroniza carpetas solo toca
  la fecha; y la copia del navegador, guardada 0,2 s tarde, daba por «de
  fuera» lo que había escrito la misma pestaña. Ante un conflicto, lo que no
  está en el disco se tiraba en vez de apartarlo. Una sola copia para todas
  las pestañas pisaba lo pendiente de otra. Dos escrituras sin cola se veían
  la una a la otra como ajenas.
- Pasar las fechas a otra hora (la española) y seguir ordenando por el
  texto: la hora que se repite en octubre ponía una venta antes que su
  compra; y quedan «hoy» calculados en la hora vieja (el «ayer» del BCE, la
  fecha del cuadre). Ordenar por el instante real y buscar cada
  `toISOString().slice(0, 10)`.
- Varias pestañas sobre un solo almacén del navegador: la que descargaba
  guardaba su copia entera encima de lo que decidías en la otra, y releer lo
  de la otra cerraba la nota a medio escribir o devolvía un NIF borrado.
  Mejor una sola pestaña (Web Locks) que reconciliar. Y un fallo al leer
  tomado por «no hay nada»: arrancaba vacía y el siguiente guardado
  escribía encima de lo tuyo.
- «Hoy» sin mirar qué día de la semana es: el aviso de «el BCE aún no ha
  publicado el tipo de hoy» salía también en sábado y domingo, cuando el
  tipo que vale (el del viernes) ya estaba.

## 10. Reglas del propio proyecto

- Las de «Reglas que no se tocan» del README (`serieSaldoVault`, venta
  automática por destino, fusionar transacciones, repartir entre
  inmuebles, nombres `snake_case` de los registros guardados, la
  clasificación no valora en euros).
- Módulos de `js/` fuera del paso sin confirmarlo antes («Cómo se trabaja»).
- Palabras del glosario (`docs/especificaciones/glosario.md`).
- Al mover o archivar documentos: lo pendiente escondido dentro de una
  sección «hecho ✅» se va con ella; los enlaces a secciones y las rutas de
  `privado/evidencias/` dejan de llevar a nada sin que ninguna comprobación
  lo vea; y al vaciar `privado/evidencias/` se van los guiones de fallos
  que siguen apuntados.
- Datos reales camuflados en un test público: un instante (10 cifras)
  copiado de la cache propia para que «pareciera real»; con una dirección
  pública al lado llevaba a la wallet. La prueba de orden solo miraba
  direcciones, hashes e importes.
- Datos de otra persona (un probador) como ejemplo en un test o un
  comentario: lo que pagó, su asignación y la fecha de su reclamación,
  copiados del plan. La prueba de orden solo vigila tus datos: lo de un
  probador va a `otras_palabras.txt` en cuanto aparece en un plan.
- Cifras de una captura que pasa el usuario (su cuenta de Reental) como
  ejemplo en un comentario o un test: también son datos reales.

## 11. Tests demasiado optimistas

- El test lee el texto (`textContent`) o el atributo `hidden` de algo que
  ya no se ve: pasa aunque nadie lo vea. Mirar `display` o lo visible.
- El test solo prueba el caso normal o los datos reales de hoy.
- El test comprueba que no da error, pero no el resultado.
- El test reproduce la misma lógica que el código (si el código está mal,
  el test también).
- El test pasa también sin el arreglo: no provoca el caso (el cambio
  «mientras escribías» repetía un ajuste que ya estaba). Comprobar siempre
  que falla sin el arreglo.
- El arnés simula lo que el navegador hace de verdad (imprimir, el diálogo
  de guardar, cargar un archivo) y salta justo el paso que falla: no veía
  las tablas cortadas en el papel ni el aviso al recargar. Medir lo impreso
  con la hoja y cargar por el camino de la app. Igual con los permisos: un
  archivo del navegador (OPFS) siempre deja escribir, y lo normal tras F5
  en Chrome es que no.
- Un arreglo deja sin probar otra regla: al exigir el nombre del archivo,
  el escenario base de la paridad dejó de tener compra on-chain y canje
  (su inmueble quedó con dudas) y todo seguía en verde.
- Una paridad solo ve lo que cambia respecto a lo grabado: un fallo que ya
  estaba al grabar pasa. Hace falta además fijar el resultado esperado de
  cada regla.
- Tipos de cambio iguales todos los días en las caches de prueba: una
  G/P cambiaria sale 0 y nadie ve si está mal (muchas mutaciones del motor
  fiscal sobrevivían).
- Un test con datos reales que pisa lo que ya había en ellos: una paridad que
  sustituye la lista de spam falla en cuanto esos datos traen un token
  mandado al spam.
- La función que lo une todo sin ningún test, y tests que miran el
  resultado pero no lo que pintan el PDF, el Excel o la pantalla: quitar
  el «hoy» o cruzar dos columnas no lo veía nadie.
- Una paridad que elige qué grabar por el texto del archivo deja fuera a
  quien llama por un ayudante, y una que mezcla casos inventados con los
  datos privados no prueba nada en otro ordenador.
- Una comparación que da por igual `null` y «sin el campo», o un mínimo de
  casos tan bajo que se pueden perder decenas sin rojo, o solo del total,
  que deja perder archivos enteros.
- Casos con un 1 donde importa: con lotes de canje de una sola compra,
  multiplicar o dividir por la parte daba lo mismo y la paridad no veía
  el valor de adquisición.
- La propia regresión da por bueno lo que no ve: un test que se queda a
  medias y sale con 0, una paridad sin pareja, o dos regresiones a la vez
  que se leen el resultado la una a la otra (su prueba,
  `tests/test_regresion_paso_tests1.js`).
- Validar un archivo con un lector más permisivo que el programa que lo
  usará: openpyxl abría `.xlsx` que Excel no abre (celdas unidas que se
  pisan, partes del XML fuera de orden, `sheetId` repetido); hay que
  abrirlo con Excel o comprobar sus reglas.
- Comparar solo las celdas con números: una fecha escrita como texto
  («15/03/2024 *» del canje) o un «—» de más no los veía nadie; y una
  grabación sin la cartera a 31/12 dejaba el apartado II en «No
  disponible» en casi todos los casos.
- Una expresión regular con caracteres de control en vez de `\b` o `\3`
  (se colaron al escribir el archivo desde la terminal): las fechas de los
  textos del Excel no se comparaban nunca y todo seguía en verde. Buscar
  bytes < 0x09 en el código.
- Un resultado fijo grabado un día contra lo que la app hace «hoy»: el
  «Generado el» del Excel salía en rojo desde el día siguiente a la
  grabación. Probar las paridades con el reloj adelantado.
- Regrabar lo esperado sin verlo entero: la orden enseñaba solo unos casos
  y unas diferencias de cada uno (un céntimo de más escondido tras cambios
  de texto), daba por buena una paridad que salía con 0 a medias y grababa
  Git y local por separado. Probar: una diferencia en el caso 20, una
  paridad sin su línea en verde y un sitio que falla.
- Una pantalla medida a un solo ancho: «casillas iguales» en verde a 1366
  px y a 960 px la quinta bajaba sola y ancha; y un arnés que cuenta
  «todos los botones» de una barra se rompe al añadir uno. Medir a 2–3
  anchos y elegir por un atributo propio.
- Comprobar «se ve» por `display`: una regla nueva (`content-visibility`
  con `display:block`, para no rehacer una pestaña) lo deja siempre en
  verdadero. Y una clase que ya no existe, leída «por si acaso», da por
  buena cualquier aserción negativa. Mirar la clase de la pestaña abierta.
- Un servidor falso que da siempre la misma respuesta, pida lo que pida:
  con la descarga del BCE «solo lo que falta», el falso devolvía la serie
  entera y tapaba los días que la app ya no pedía. El falso responde solo
  a lo pedido, como el de verdad.

- Quitar o mover un botón que pulsan los arneses: cada arnés tiene su
  propio `clickCentrado`, se arreglaron seis y tres siguieron rotos sin
  que nadie lo viera, porque la regresión corta no corre arneses. Buscar
  (`grep`) el selector en todos los `tests/navegador/`.

**Mirar:** para cada cambio del paso, ¿qué test fallaría si el cambio
estuviera mal? Si ninguno, es un hueco.

## 12. Cálculo fiscal: la regla no es la de la ley o falta un dato

- Un dato que el registro no guarda se supone: se pagaba con USDC y se
  sacaba de la cola de USDT.
- Lo mismo tratado distinto según por dónde pasa: el USDT del vault sin
  coste y el de la wallet con coste; el cobro de una venta P2P abría lote
  y el de una liquidación no.
- Algo que entra en dos totales: el USDT del vault en «otros» y en la
  línea del vault.
- Una salida que no se puede valorar no sale de la cartera y la
  siguiente operación se lleva un lote que ya no está.
- Un ingreso que desaparece en silencio al darlo por bueno (el
  rendimiento mixto).
- Una entrada o una salida que la blockchain no ve, o al revés: lote de
  USDT por una venta cobrada por banco; un pago del vault que no salía de
  la cola; un pool o un exchange propio de ida y vuelta que dejaba la
  cartera con lo aportado o con el doble.
- Dos fuentes que cuentan lo mismo: la fila pendiente del archivo de
  Reental y su cobro en la blockchain como rendimiento sin fila.
- Una parte que sigue el tratamiento del todo: de un cobro asignado en
  parte, la parte de la venta seguía siendo rendimiento (contaba dos
  veces) o seguía a revisar (no entraba en la cartera). Y una regla que no
  mira de dónde viene: tokens de tu wallet a tu vault como compra bancaria.
- Una comprobación que da por hecho lo que no lee: el cuadre con la
  blockchain restaba lo «mandado a otras cuentas tuyas» sin mirarlo, así
  que un exchange que devolvía desde otra dirección (cartera doble)
  cuadraba igual. Y un contador que sube por un camino y solo baja por
  otro: la vuelta decidida como «neutro» no lo bajaba.
- Un caso raro que pasa a ser normal: una compra sin coste no abría lote y
  la venta siguiente se llevaba en silencio el lote de detrás (un regalo),
  con su coste y su fecha. Cuando un paso hace habitual un dato que falta,
  mirar qué hace el FIFO con él.

**Mirar:** cada regla fiscal contra la ley y los criterios de la DGT (art.
33, 35, 37 de la LIRPF); ¿cuadra la cartera con la blockchain?; ¿suman lo
mismo el resumen, el informe de Renta y el Excel?
