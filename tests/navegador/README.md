# Arneses de navegador

Comprueban la SPA en un Chrome real y sin ventana (puppeteer-core), igual que
lo haría una persona: abren `index.html`, pulsan botones y miden lo que sale.

| Arnés | Qué comprueba | Datos |
|---|---|---|
| `verifyui7d.js` | 🚀 Puesta en marcha: arranque automático, «primera vez», resumen único, clasificación automática, archivos recordados, móvil y oscuro | Sintéticos |
| `verifytx1.js` | 📒 Transacciones: libro diario, filtros, «Mandar a revisar» | Sintéticos |
| `verifytx1b.js` | 📒 Transacciones: colores por categoría (claro/oscuro), tabla compacta sin scroll en portátil, menú lateral plegable y nota de 100 €/token | Sintéticos |
| `verifytx2.js` | 🔍 Revisión estrecha: solo lo que necesita una decisión, sin depósitos, enlace a Transacciones, filtros, vincular, anular y «Restaurar» bloqueado si choca | Sintéticos |
| `verifytx1c.js` | 📒 Transacciones: spam oculto con «Ver spam», nombres de operación en llano, búsqueda que encuentra los pagos de una venta y los dos hashes de un vínculo | Sintéticos |
| `verifytx1d.js` | 📒 Transacciones: el cobro asignado entero va dentro de su venta (sin fila propia), sale al buscar su hash o desde «Resueltos» y vuelve si se anula el vínculo; recuentos con lo que se ve | Sintéticos |
| `verifytx1e.js` | 📒 Transacciones: 8 columnas, cifras con 2 decimales, retención bajo el importe solo si la hay, acciones como iconos con su burbuja (ratón y teclado) y sin scroll a 1366 px | Sintéticos |
| `verifytx1f.js` (+ `tx1f_comun.js`) | 📒 Transacciones: 9 columnas, alineaciones medidas, sin líneas verticales, sin scroll a 1366 px, flecha del sentido con su burbuja, contraparte y la nota que se escribe debajo de la fila (Intro, Esc, borrar); misma huella y solo se escriben las notas | Sintéticos |
| `verifytx1g.js` (+ `tx1g_comun.js`) | 📒 Transacciones: sin chips ni botón «Spam», selector de categoría con su número, recuento «N movimientos», el spam solo en su modo (ni al buscar) con sus motivos uno por línea, burbujas de solo datos y nota de compras corta; misma huella y 0 escrituras | Sintéticos |
| `verifytx1h.js` (+ `tx1h_comun.js`) | 📒 Transacciones: sin franja de color, más separación entre Categoría y Token, con el menú plegado el sitio libre repartido entre todas las columnas sin partir filas, «Desde / Hasta» bajo los filtros (tramo con los extremos, recuento «X de N», topes entre calendarios, «Limpiar»), sin scroll a 1366 px; misma huella y 0 escrituras | Sintéticos |
| `verifyapartar1.js` (+ `apartar1_comun.js`) | 📒 Transacciones: 🚫 «Mandar al spam» un movimiento y ↩ sacarlo, con su marca y su motivo; deshacer devuelve la huella exacta | Sintéticos |
| `verifyapartar2.js` (+ `apartar2_comun.js`) | 📒 Transacciones: 🚫 abre debajo «Este movimiento», «Toda la dirección» y «Todo el token» (Esc y «Cancelar» cierran); lo apartado sale con su motivo y su ↩, y deshacer deja la cache como estaba | Sintéticos |
| `verifydu2i.js` (+ `du2i_comun.js`) | 🔍 Revisión: plegable «💶 Coste de las compras externas» cerrado, una fila por compra con su inmueble (las más recientes primero), el ajuste ajeno sin casilla, € por token al escribir, «Guardar» solo con cambios, un 0 no se guarda y volver a 100 €/token deja la cache como estaba | Sintéticos |
| `verifyui3.js` | 🔍 Revisión: bloques plegables (se abren solos con algo pendiente), catálogo con botones y su burbuja, sin los tokens del spam ni «Descartados», «Descartar» = spam de todo el token y vuelta con su ↩ de 📒, «🏠 Es un inmueble» en la tarjeta (P4), direcciones añadir/quitar, fechas de RNT con su enlace a CoinGecko, sin filtros, contador del menú, móvil y oscuro | Sintéticos |
| `verifyui6.js` | 💰 Rendimientos: sin archivo lo dice; una fila por reparto con las cifras de su fila del archivo, estados, total y lo pendiente de reclamar; filtros con su recuento y «Limpiar»; la nota debajo (Intro, Esc, borrar) con la clave del rendimiento; las reglas visuales de 📒 y sin scroll a 1366 px; móvil y oscuro | Sintéticos |
| `verifyui4.js` | 📊 Dashboard: rendimientos por mes o por año con bocadillo, ranking de inmuebles, tu cartera por tokens y el orden de las tarjetas | Sintéticos |
| `verifyui6b.js` | 💰 Rendimientos y 📊 Dashboard: la tarjeta del total arriba, «USD» en las cabeceras, búsqueda sin tildes en 📒 y el editor de notas compartido | Sintéticos |
| `verifyui5.js` | 📤 Exportar: imprimir solo la pestaña abierta, en claro y con lo plegado abierto, y al terminar como estaba (la copia de seguridad está en `verifypm5.js`) | Sintéticos |
| `verifyui7b.js` | 🚀 Puesta en marcha: «📂 Abrir copia» con una copia de formato antiguo: ida y vuelta en un navegador vacío, preguntar si ya hay algo, archivos que no son una copia | Sintéticos |
| `verifyalmacen1.js` | 🚀: tu archivo en el navegador. Primera vez sin botones viejos; «📂 Abrir copia» la pasa al navegador sin su marca; F5 la trae; «🗂️ Guardar copia» descarga `reental_cache_…` y «Última copia: hoy»; lo que guarda una pestaña lo relee la otra; «🧹 Olvidar todo» con su diálogo (cancelar, guardar copia y olvidar, la otra pestaña se recarga); lo guardado con el formato anterior pasa al nuevo | Sintéticos |
| `verifyfiscal1.js` (+ `fiscal1_comun.js`) | 🧾 Fiscal: sin datos o con la clasificación de otra wallet lo dice; un botón por año y el último terminado; cada cifra del resumen es la del informe; el historial, por inmueble; móvil y oscuro | Sintéticos |
| `verifyp27.js` (+ `p27_comun.js`) | 🧾 Fiscal, el historial de cada activo: los dos grupos del Resumen; los que ya no tienes, ocultos hasta el interruptor (atenuados); «▸ n lotes» de una venta (aria-expanded) sin repintar; un repintado conserva el interruptor, lo desplegado y el foco; a 1366 px sin desplazarse de lado; la fecha con las dos horas también con el teclado; oscuro | Sintéticos |
| `verify63.js` (+ `fiscal1_comun.js`) | Informe para la Renta imprimible (js/27): marco oculto con el informe del año, el título de la ventana y el foco como antes, el marco se quita; el PDF de Chrome en A4 vertical con II, III y IV en hoja nueva, pie con la página, las cifras de 🧾, nada se sale de la hoja ni se parte. Lee los PDF con **PyMuPDF** (`pip install pymupdf`) | Sintéticos |
| `verify64.js` (+ `fiscal1_comun.js`) | 📤 Exportar: los botones del Excel y del informe solo con el cálculo de 🧾 (si no, su motivo), el Excel byte a byte el de la receta de `js/26` (diálogo, doble clic, cancelar, descarga), el desplegable de años (sale al clasificar, último terminado, vuelve con otra cache), el titular recién escrito y el aviso de sincronización en el informe | Sintéticos |
| `verifytareas1.js` | 🔍 Revisión como lista de tareas: una fila por bloque en su orden, sin números, con su estado («Al día», avisos en ámbar); «Por decidir» solo con algo, en rojo y abierta (igual que el menú), con un aviso encima que lleva a ella (y el foco); sin datos o sin wallet, una línea gris encima que lo dice; estrecha cerrada y ancha al abrir; «Ya decididos» y «Ajustes» como enlaces; sin datos, todo cerrado; el aviso de tokens con dudas arriba y lleva al catálogo; al salir se pliega y al volver solo se reabre «Por decidir» | Sintéticos |
| `verifyrnt1.js` | 🔍 Revisión: el RNT que te llega. «Regalo (airdrop)», «Recompensa DeFi» y «Compra externa…» sin ventana ni sugerida, cada uno solo ese movimiento; la compra, sin precio, abre 💶 en su fila («Falta el precio», «⚠ 1 sin precio», «Ya decididos» y 🚀 lo dicen; «↩ Deshacer…» lleva a «Ya decididos», que brilla); lo pagado y el precio por token enlazados, «Calcular el precio por token» (la coma, «Usar»), en € y en USD; deshacer se lleva el precio; oscuro | Sintéticos |
| `verifyvault1.js` | 🚀 Puesta en marcha: «🔍 Buscar mi vault» bajo el campo del vault (con datos y el vault vacío); busca, abre la ventana del vault probable, la vuelve a abrir tras «No es», «Ponerlo» lo escribe y el botón se va; sin nada o con Etherscan caído lo dice | Sintéticos |
| `verifyusdt1.js` | 🔍 Revisión, 💶: «En USD…» al editar una compra externa; lo pagado en USD y el día del pago rellenan la casilla de € con el BCE de ese día (y la vacían si no vale), recalcula el € por token, Intro guarda; guardada así, la fila sale en $ con sus € al lado y al editarla «En USD…» viene con lo que pusiste; Esc y otra pulsación cierran; oscuro | Sintéticos |
| `verifyp25.js` | 🔍 Revisión, la venta por vincular: cerrada, «Es una venta…» y «Movimiento neutro» sin el botón suelto de vincular y «🔗 Por vincular» a la derecha; abierta, Guardar, Cancelar, «En euros (€)» y «🔗 Elegir el cobro recibido…» en una línea con el ≈ € debajo de la casilla (no se mueven al escribir); en €, sin ≈ € y lo escrito se queda; guardada en €, `cobrado_eur`, «Venta · 372,50 €» en «Ya decididos» y en 📒; el botón abre la ventana de vincular; oscuro | Sintéticos |
| `verifycatalogo1.js` | 🔍 Revisión: interruptor «Ver todos» del catálogo de inmuebles, al lado de la explicación; apagado solo los que tienes (el título los cuenta), encendido también los que ya no tienes, atenuados; con el teclado; sin ninguno sin tokens no sale; oscuro | Sintéticos |
| `verifypol1.js` | 🔍 Revisión: precios de POL como los de RNT (solo las fechas que el motor necesita, con su enlace), guardar con coma y quitar | Sintéticos |
| `verifyarreglos1.js`, `verifyarreglos1b.js` | Arreglos que se ven en pantalla (lo escrito en «Ajustes en JSON» no se pierde, vínculos mal escritos, otro cobro…) | Sintéticos |
| `verify44.js` | Distintivo «Vinculada»: botón en Transacciones que lleva al vínculo, y «Ver en Transacciones →» desde «Resueltos» | Sintéticos |
| `verify48.js`, `verify49.js`, `verify411.js` | Centro de Correcciones: buscador, formulario y multi-cobro | Sintéticos |
| `verifyf6.js` | Pagos diferidos: el buscador abre con las fechas de la venta, ⭐ arriba con su leyenda, «ver N más fuera de las fechas», el elegido no se pierde al teclear una fecha y «➕ Añadir otro» conserva tus filtros | Sintéticos |
| `verifyarriba1.js` | El menú y cualquier enlace a una pestaña la abren arriba del todo; un salto a una fila o un bloque no; «Atrás», Ctrl+clic y «Saltar al contenido» | Sin datos |
| `verifycabecera1.js` | En 📒 Transacciones y 💰 Rendimientos los títulos de las columnas se quedan debajo de la barra de arriba al bajar si la tabla cabe; con la ventana estrecha no se fijan; nunca desplaza de lado la página | Sin datos |
| `verifypm4.js` | 🚀: todo en una tarjeta y tu archivo guardado solo en este navegador (se cuentan las escrituras) | Sintéticos |
| `verifypm5.js` | 🚀: «🗂️ Guardar copia», la casilla de tus datos y «Última copia» | Sintéticos |
| `verifyfase7.js` | Menú de 8 vistas sin Vault ni DeFi RNT; el botón «DeFi» de 📒 y su recuento | Sintéticos |
| `verifycuadre3.js` | Cuadre con la blockchain (js/28): «🔄 Actualizar» lee el saldo de cada token y avisa si no cuadra | Sintéticos |
| `verifysueltos1.js` | 💼 Dinero invertido arriba con su bocadillo, notas sobre amarillo, tarjetas de 🧾, barra de 💰 y el botón «DeFi» | Sintéticos |
| `verifymenores1.js` | Arranque con el almacenamiento bloqueado, foco en 💶, 📒 pintado una vez, «1 reparto» | Sintéticos |
| `verifytour1.js` | El ejemplo: «¿Es tu primera vez?» solo la primera vez; todas las paradas desde 📖, cada una en su pestaña y señalando algo; «Compra externa…» sin «Siguiente» y lo pagado en 💶; al salir («Empezar» o ✕) nada del ejemplo en memoria ni guardado y nada a internet | Sintéticos (en la app) |
| `verifyayuda1.js` | 📖 Ayuda: en el menú, la última; sus enlaces a las 7 pestañas en el orden del menú; cada botón que cita existe | Sin datos |
| `verifybocadillo1.js` | El bocadillo de los gráficos de 📊 sigue al ratón (línea y barras); con teclado, arriba de su columna | Sintéticos |
| `verifymenu1.js` | La barra en dos grupos y su pie que lleva a 🚀; los iconos de 📒 y 💰 sin caja; «🔄 Actualizar» centrado y más abajo | Sin datos |
| `verifycg1_ui.js` | Sincronización de CoinGecko sin reintentos inútiles | Sintéticos |
| `verifynominal1.js` | 📊 «Valor nominal»: interruptor (repintado, volver a 📊, imprimir), «Ver el detalle» (Esc, foco, al imprimir y al cambiar de pestaña se cierra) | Sintéticos |
| `privado/navegador/verify*_real.js` | Lo mismo con tu cache, config y CSV y la cache de prueba (solo en memoria; sin alguno, la regresión los omite). Están en `privado/` porque comprueban tus cifras; la regresión los busca allí | Copia fija de `privado/datos_reales/` |
| `privado/navegador/verifydesc1_ui_real.js` | Descubrimiento automático con el catálogo vacío | `reental_cache_prueba.json` |

Las cifras que esperan los arneses con datos reales (registros, «a revisar»,
vínculos y cobros pendientes) están en **`linea_base.js`**, no en cada
arnés: si actualizas la cache o el CSV y las cifras cambian solo por los
datos nuevos, se cambian allí.

## Cómo se ejecutan

Desde la raíz del proyecto:
```
node tests/navegador/regresion.js          (completa, con Chrome: al cerrar un paso o una fase)
node tests/navegador/regresion.js corta    (sin Chrome: tests puros, paridades y pytest; tras un cambio)
```
(`sh tests/navegador/regresion.sh [corta]` hace lo mismo), o un arnés
suelto: `node tests/navegador/verifyui7d.js` (este, sí, con el servidor
`python -m http.server 8765 --directory Reental-SPA` abierto y `NODE_PATH`
apuntando a puppeteer-core).

La regresión (`regresion.js`):
- encuentra los tests por su nombre (`tests/test_*.js` y `.py`, las
  paridades `tests/paridad_*.js` y `tests/navegador/verify*.js`): un arnés
  nuevo entra solo; uno que se saca de esta carpeta deja de correr;
- los corre en paralelo (los de navegador de 4 en 4; con más se ahogan los
  de datos reales) y los más lentos primero;
- sirve la SPA ella misma en un puerto libre (los arneses lo leen de
  `REENTAL_BASE`; sin ella, el 8765) y busca puppeteer-core en
  `%TEMP%\opencode\ui2-browser\node_modules` si `NODE_PATH` no lo lleva;
  necesita Chrome en `C:\Program Files\Google\Chrome\Application\chrome.exe`
  (y PyMuPDF en Python para `verify63.js`);
- enseña una línea por grupo y, de lo que falla, sus últimas líneas; la
  salida entera queda en `%TEMP%\opencode\regresion\` y termina con
  código 1 si algo falla;
- precarga `cierre_rapido.js` en los arneses: si Chrome no sale 5 s
  después de `browser.close()`, lo mata (dos Chrome que se cierran a la
  vez tardaban ~120 s en salir).

Las paridades comparan la app con sus cifras de referencia, en
`tests/cifras_referencia/` y, lo de tus datos, en
`privado/datos_reales/cifras_referencia/` (README, «Cómo se trabaja»).
La completa tarda unos 3 minutos.

Las capturas `cap_*.png` se guardan en esta carpeta y **no se suben a Git**
(las de los `*_real.js` se guardan en `privado/navegador/`).
