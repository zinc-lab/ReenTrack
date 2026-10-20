# Cambios

Lo más reciente, arriba. Una fila por versión o paso.

## La venta por vincular y la venta cobrada en € (20/10/2026)

- **🔍 Revisión:** la tarjeta de una venta por vincular lleva solo «Es una
  venta…» y «Movimiento neutro», con «🔗 Por vincular» a la derecha, debajo
  de «A revisar». «Es una venta…» abre lo cobrado (en USD) con Guardar,
  Cancelar, «En euros (€)» y «🔗 Elegir el cobro recibido…», que abre la
  ventana de vincular de siempre. El «≈ … € (BCE del …)» va debajo de la
  casilla.
- **Venta cobrada en €:** con «En euros (€)», lo cobrado es el valor de
  transmisión tal cual, sin tipo del BCE. El informe y el Excel la llevan en
  € y con «—» en USD (fila y total); 📒 enseña «… €» y 📊 la suma en USD con
  el BCE del día, como una compra en €.
- **Cálculo:** no cambia lo ya guardado (las ventas en USD, igual).

## Compra externa (18/10/2026)

- **Palabras:** «compra bancaria» pasa a **«compra externa»** en toda la app:
  tokens que compraste y cuyo pago la app no encuentra (banco, exchange, otra
  wallet, o pagados antes y enviados después). El botón de pagar en dólares de
  💶 es «En USD…».
- **🔍 Revisión:** «Compra externa…» (de un inmueble o de RNT) se guarda al
  momento, solo ese movimiento y sin precio, y abre su fila en 💶. Sin la
  ventana del RNT: «Regalo (airdrop)» y «Recompensa DeFi» deciden solo ese
  movimiento. «🚫 Es spam» con un token conocido (RNT, USDT, USDC, POL o un
  inmueble) solo en lo que llega de una dirección desconocida.
- **💶 Coste de las compras externas:** lo pagado y el precio por token van
  enlazados (en € y en USD), con «Calcular el precio por token» para una
  compra que llega en varias entregas. Un RNT sin precio dice «Falta el
  precio» (no lleva los 100 €/token de los inmuebles) y 🚀 lo avisa.
- **Cálculo:** una compra de RNT sin precio no tiene coste: la venta que la
  gaste sale «sin coste registrado» y a revisar. Lo ya guardado no cambia.

## 🔍 Revisión como lista de tareas (16/10/2026)

- **🔍 Revisión:** una sola caja centrada con una fila por bloque, en el
  orden en que conviene resolver (Inmuebles, Direcciones, Por decidir,
  Coste, RNT y POL), y su estado a la derecha: «Al día» en verde y los
  avisos en ámbar. «Por decidir» solo sale si hay algo: en rojo y abierta,
  con «⚠ Todavía hay N movimientos por decidir» encima de la caja, que
  lleva a ella. Cerrada, la caja es estrecha; al abrir una fila, ancha.
  «Ya decididos» y «Ajustes en JSON», como enlaces debajo. Sin la fila de
  botones fija de arriba.
- **Cálculo:** no cambia.

## Rentabilidad media en 📊 (16/10/2026)

- **📊 Dashboard:** en la franja de arriba, «Rentabilidad media» en % anual,
  desde la primera compra: lo repartido (íntegro) más lo ganado en las ventas,
  sobre el dinero invertido medio. Al pasar el ratón, de qué sale cada parte.
- **Cálculo:** no cambia; lo ganado en las ventas es en USD, así que no
  coincide con 🧾 Fiscal (en €).

## Valor nominal en 📊 (16/10/2026)

- **📊 Dashboard:** el dinero invertido es lo pagado por los tokens que
  tienes (cada venta resta lo que costó lo vendido). Debajo, el interruptor
  «Valor nominal»: esos tokens a 100 € o 100 $ cada uno según el proyecto,
  la cifra que enseña la web de Reental, con su total aproximado en USD.
  «Ver el detalle» abre una ventana con las dos cifras por inmueble.
- **Cálculo:** no cambia; al imprimir sale siempre lo pagado.

## 1.2 — compras pagadas en dólares (15/10/2026)

- **💶 Coste de las compras:** una compra por transferencia guardada con «En
  USDT…» (pagada en dólares) se ve en $, con sus € al lado; al editarla,
  «En USDT…» viene con lo que pusiste.
- **📊 Dashboard:** esas compras cuentan en la parte en $ del dinero invertido.
- **Cálculo:** no cambia; el coste de compra sigue en € (con el BCE del día del
  pago).
- **Pruebas:** dos casos completos con datos inventados (una preventa de RNT
  entregada poco a poco y un reparto de inmuebles pagado en dólares).

## 1.1 — lo que salió de las primeras pruebas (15/10/2026)

- **🚀 Puesta en marcha:** la primera descarga empieza sola al poner la
  wallet y la API key; si falta el vault, la app propone el que creó tu
  wallet (también con «🔍 Buscar mi vault», junto a su campo).
- **🔍 Revisión:**
  - Un índice fijo arriba para saltar a cada bloque, en el orden en que
    conviene resolverlos.
  - «ⓘ Qué es cada cosa» y una explicación al pasar el ratón por cada botón.
  - «🏠 Es un inmueble» en la tarjeta de un token con dudas; «Descartar» del
    catálogo manda todo el token al spam (se deshace en 📒).
  - El RNT que te llega: «Regalo (airdrop)», «Recompensa DeFi» o «Compra
    bancaria…» (RNT pagado en €, p. ej. una preventa entregada poco a poco),
    con «¿también los otros?» para lo llegado desde esa dirección.
  - 💶 Coste: «En USDT…» para una compra pagada en USDT a Reental y
    entregada después (lo pagado en € con el BCE del día del pago).
  - Catálogo: interruptor «Ver todos»; apagado, solo los inmuebles que
    tienes.
- **📒 Transacciones:** el canje de un contrato se llama así (no venta y
  compra); «Movimiento neutro», el mismo nombre que en 🔍.
- **📊 Dashboard:** debajo del dinero invertido, lo comprado en € y en $.
- **Cálculo:** la compra de RNT pagada en € entra en la cola del RNT (una
  venta posterior encuentra su coste); un premio que dejas como «Recompensa
  DeFi» se queda como tal.
- **Importes escritos:** el punto solo separa miles («1.500»); «1500.25»
  pide la coma.

## 1.0 — primera versión pública (10/10/2026)

- La app completa: descarga de Etherscan, BCE y CoinGecko; archivo de
  rendimientos de Reental; clasificación y 🔍 Revisión; 📒 Transacciones,
  📊 Dashboard, 💰 Rendimientos, 🧾 Fiscal, 📤 Exportar (Excel, informe para la
  Renta en PDF e impresión) y 📖 Ayuda; cuadre con la blockchain.
- Todo se guarda en el navegador, con copia de seguridad.
- En la web y como archivo único para descargar (`ReenTrack.zip`), los dos
  puestos al día solos con cada cambio.
- Pruebas puras, paridades con cifras de referencia (datos inventados) y
  arneses de navegador; las que usan datos reales leen `privado/datos_reales/`.
