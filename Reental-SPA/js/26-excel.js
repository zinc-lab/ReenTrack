/* =====================================================================
   REENTAL SPA · js/26-excel.js
   Las hojas del Excel de la app: Resumen, Transacciones, Ingresos,
   Historial (la tabla de cada activo de 🧾; solo con el último
   argumento, calculo: lo que da fiCalcular de js/23), una «Fiscal AAAA»
   por año, Tipos de cambio BCE, la del cuadre con la blockchain si se
   leyeron los saldos al actualizar (js/28) y, si hay algo por revisar,
   Revisión.
   Prueba: tests/paridad_excel_paso_62 (las cifras de referencia, celda a
   celda, con los casos de los tests) y paridad_excel_real_paso_62 (con
   los datos de privado/datos_reales/).

   Aquí no se calcula nada fiscal: las cifras son las que dejan el motor
   (js/21) y el informe para la Renta (js/22); este módulo solo las pone
   en su celda (el libro lo escribe js/25). Los textos son de la app.

   Cómo llamarlo: con el cálculo de 🧾 Fiscal (fiCalcular de js/23: UNA
   pasada de motorFiscal sobre una copia nueva de los registros y los
   informes, con hasta qué día llegan los datos y si la descarga falló),
   para que el Excel diga lo mismo que ella; el último argumento es ese
   cálculo entero (sin él no sale la hoja Historial):

     const r = fiCalcular(state.registros, state.cache, state.config, fiHastaCuando(state.cache));
     const blob = xlsxBlob(excelLibro(r.registros, r.colas, r.resumen, state.cache, state.config, r.informes,
       new Date(), r.hasta, r.cuadre, r));

   En la app es fiResultado() de js/23 (el mismo cálculo, guardado), con
   el cuadre con la blockchain si se leyeron los saldos al actualizar
   (r.cuadre, con sus avisos ya en los informes): el botón de 📤
   Exportar, exExcel de js/24.

   Sin informes los monta aquí, sin la cartera a 31/12 (el
   apartado II sale «No disponible») ni el día de los datos: eso solo
   sirve a las pruebas; la app siempre los pasa. Solo lee: no cambia nada
   de lo que recibe.

   Sumas: las de una lista van por pySuma (compensada) y las de un bucle
   con +=, sin compensar, para que salgan iguales hasta el último decimal.
   ===================================================================== */

// Formatos de número. Las cantidades, hasta 6
// decimales sin ceros de relleno; una cantidad entera, con el de entero
// (con el de tokens, Excel enseñaría «10,»).
const EXCEL_FMT = {
  EUR: "#,##0.00 €", USD: "#,##0.00 $", TIPO_CAMBIO: "0.0000",
  TOKENS: "#,##0.######", ENTERO: "#,##0", FECHA: "DD/MM/YYYY", FECHA_HORA: "DD/MM/YYYY HH:MM",
  // Hojas «Fiscal AAAA»: la moneda va en el título de la columna.
  NUM: "#,##0.00", NUM_SIGNO: "+#,##0.00;-#,##0.00;+0.00", NUM_PARCIAL: '#,##0.00" *"', NUM_SUPUESTO: '#,##0.00" **"',
  PRECIO: "#,##0.0000", POL: '#,##0.0000" POL"',
};
const EXCEL_COLOR = { CABECERA: "D9E1F2", SECCION: "BDD7EE", GRUPO: "DDEBF7", ROJO: "C00000" };
// Relleno de cada categoría (el fondo claro de 📒 Transacciones).
const EXCEL_COLOR_CATEGORIA = {
  RENDIMIENTO: "E2EFDA", REWARD: "C6EFCE", COMPRA: "DEEAF1", VENTA: "FFF2CC", DEPOSITO: "FCE4D6",
  RETIRADA: "F4B183", MOVIMIENTO: "F2F2F2", COMISION: "D9D9D9", REVISAR: "FFCCCC",
};
// Columnas de las hojas «Fiscal AAAA» (la tabla más ancha, la de los
// rendimientos, tiene 11).
const EXCEL_RENTA_ANCHOS = [46, 30, 16, 20, 16, 16, 16, 16, 16, 16, 16];
const EXCEL_RENTA_COLUMNAS = EXCEL_RENTA_ANCHOS.length;
const EXCEL_NOMBRE_RENDIMIENTO = { ...TIPO_RENDIMIENTO, RCM_MIXTO: "Rendimiento mixto (a revisar)" };
const EXCEL_NO_COTIZA = "No disponible: los tokens no cotizan; cartera valorada a su coste de compra";
const EXCEL_FALTA_PRECIO = "No disponible (falta el precio de una compra)";
const EXCEL_COMO_DECLARAR = "El íntegro y la retención se declaran por separado, sin restar una del otro.";

function excelColorCategoria(categoria) {
  return fiscTiene(EXCEL_COLOR_CATEGORIA, categoria) ? EXCEL_COLOR_CATEGORIA[categoria] : null;
}

/* Fecha de un registro («AAAA-MM-DD…») para su celda, sin la hora; null si
   no hay o no es una fecha. */
function excelFecha(fecha) {
  return pyVerdad(fecha) && typeof fecha === "string" ? xlsxFecha(fecha.slice(0, 10)) : null;
}

/* Escribe una celda (Calibri 11; mono, Consolas). Una cantidad entera con
   el formato de tokens pasa al de entero. extra: alineación. */
function excelCelda(hoja, fila, columna, valor, { formato = null, negrita = false, mono = false,
  relleno = null, color = null, ...extra } = {}) {
  if (formato === EXCEL_FMT.TOKENS && typeof valor === "number" && Number.isFinite(valor) &&
      pyRedondeo(valor, 6) === pyRedondeo(valor, 0)) {
    formato = EXCEL_FMT.ENTERO;
  }
  const estilo = { ...extra };
  if (formato) estilo.formato = formato;
  if (negrita) estilo.negrita = true;
  if (mono) estilo.mono = true;
  if (relleno) estilo.relleno = relleno;
  if (color) estilo.color = color;
  xlsxCelda(hoja, fila, columna, valor === undefined ? null : valor, estilo);
}

/* Fila de títulos en negrita, desde la columna A. */
function excelCabecera(hoja, fila, titulos, relleno = EXCEL_COLOR.CABECERA, color = null) {
  titulos.forEach((t, i) => excelCelda(hoja, fila, i + 1, t, { negrita: true, relleno, color }));
}

/* Filtro sobre la tabla y cabecera congelada. */
function excelTablaFiltrable(hoja, ultimaFila, nColumnas, filaCabecera = 1) {
  xlsxCongelar(hoja, filaCabecera + 1, 1);
  xlsxFiltro(hoja, filaCabecera, 1, Math.max(ultimaFila, filaCabecera), nColumnas);
}

/* Nombre de un activo FIFO: RNT, USDT, USDC y POL tal cual; un inmueble,
   por su nombre en el catálogo (o su dirección si no lo tiene). */
function excelEtiquetaActivo(activo, cache) {
  if (ACTIVOS_NO_INMUEBLE.includes(activo)) return activo;
  const catalogo = pyO(cache, {}).catalogo_propiedades;
  const entrada = pdEsObjeto(catalogo) && fiscTiene(catalogo, activo) ? catalogo[activo] : null;
  if (pdEsObjeto(entrada)) {
    const nombre = pyO(entrada.nombre_reental, entrada.nombre_etherscan);
    if (pyVerdad(nombre)) return nombre;
  }
  return activo;
}

/* Copia de los registros por fecha y clave (sin fecha, al final): las
   hojas que van por fecha la reciben ya ordenada (ordenados). */
function excelOrdenados(registros) {
  const clave = r => pyO(r.fecha, "9999");
  return [...registros].sort((a, b) => cmpTexto(clave(a), clave(b)) || cmpTexto(a.clave, b.clave));
}

function excelNombreRendimiento(r) {
  return fiscTiene(EXCEL_NOMBRE_RENDIMIENTO, r.subcategoria) ? EXCEL_NOMBRE_RENDIMIENTO[r.subcategoria] : "Rendimiento";
}

/* [importe USD, importe EUR] que se enseñan: en un rendimiento del
   archivo, el íntegro (nunca el neto que llegó); en lo demás, lo del
   registro. */
function excelImportes(r) {
  if (r.categoria === "RENDIMIENTO" && fiscHay(r.integro_usdt)) return [r.integro_usdt, r.base_imponible_eur];
  return [r.importe_usdt, r.importe_eur];
}

/* Un texto del motor o del informe como lo dice la app (lo mismo que
   fiTextoInforme de 🧾 Fiscal, js/23, salvo lo de remitir a apartados,
   que el Excel sí tiene): fechas dd/mm/aaaa, «sincronizar», USD como
   moneda y sin la cifra de «pendiente: …», que no es una cifra que
   enseñar. */
function excelTexto(t) {
  return fechasEnTextoEs(String(t ?? ""))
    .replace(/vuelve a ejecutar el programa/g, "vuelve a sincronizar")
    .replace(/\) USDT\b/g, ") USD")
    .replace(/(^|; )pendiente: [^;]*; se declaran igual en el ano del reparto(; )?/g,
      (m, antes, despues) => (antes && despues ? "; " : ""));
}
/* Un aviso del motor como frase: con los textos de la app y en
   mayúscula, como en 🧾 Fiscal y en el informe imprimible. */
function excelFrase(t) {
  const s = excelTexto(t);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* Nota del registro; en un rendimiento con retención, también el neto,
   que no se declara. */
function excelNota(r) {
  let nota = excelTexto(pyO(r.nota, ""));
  const retencion = pyO(r.retencion_usdt, 0);
  if (r.categoria === "RENDIMIENTO" && retencion > 0 && fiscHay(r.integro_usdt)) {
    nota = (nota ? nota + "; " : "") + numEs(r.integro_usdt - retencion) + " USD netos (íntegro menos retención): no se declaran";
  }
  return nota;
}

/* «Inmueble / Token» de una fila. */
function excelQue(r) { return pyO(r.inmueble, pyO(r.token, pyO(r.simbolo, ""))); }

/* ---------- Resumen ---------- */

function excelHojaResumen(libro, registros, colas, resumen, cache, config, ahora) {
  const hoja = xlsxHoja(libro, "Resumen");
  hoja.anchos = [50, 34, 20, 16, 16, 30];
  xlsxCongelar(hoja, 2, 1);
  let fila = 1;
  excelCelda(hoja, fila++, 1, "Contabilidad fiscal de tus inversiones en Reental", { negrita: true });
  const inversor = pyO(pyO(config, {}).inversor, {});
  excelCelda(hoja, fila, 1, "Inversor");
  excelCelda(hoja, fila++, 2, pyO(inversor.nombre, "") + (pyVerdad(inversor.nif) ? " (" + inversor.nif + ")" : ""));
  excelCelda(hoja, fila, 1, "Generado el");
  excelCelda(hoja, fila++, 2, xlsxAhora(ahora), { formato: EXCEL_FMT.FECHA_HORA });
  const fechas = registros.filter(r => pyVerdad(r.fecha)).map(r => r.fecha).sort(cmpTexto);
  excelCelda(hoja, fila, 1, "Datos");
  excelCelda(hoja, fila, 2, fechas.length
    ? "del " + pdFechaEs(fechas[0]) + " al " + pdFechaEs(fechas[fechas.length - 1]) + HORA_INFORME : "sin datos");
  fila += 2;

  const posicion = posicionAbierta(colas);
  excelCelda(hoja, fila++, 1, "Cartera (lo que tienes hoy)", { negrita: true, relleno: EXCEL_COLOR.SECCION });
  excelCelda(hoja, fila, 1, "Coste de compra de lo que tienes");
  // Con el coste de algo sin saber (una compra de RNT sin precio), sin total.
  const costes = Object.values(posicion).map(p => p[1]);
  excelCelda(hoja, fila++, 2, costes.some(c => c === null) ? EXCEL_FALTA_PRECIO : pySuma(costes),
    costes.some(c => c === null) ? {} : { formato: EXCEL_FMT.EUR });
  excelCelda(hoja, fila, 1, "Valor de la cartera hoy");
  excelCelda(hoja, fila++, 2, EXCEL_NO_COTIZA);
  excelCelda(hoja, fila, 1, "Ganancia o pérdida sin vender");
  excelCelda(hoja, fila, 2, "No disponible (sin precio de mercado)");
  fila += 2;

  excelCelda(hoja, fila++, 1, "Lo que tienes de cada activo", { negrita: true, relleno: EXCEL_COLOR.SECCION });
  excelCabecera(hoja, fila++, ["Activo", "Cantidad", "Coste de compra EUR"]);
  const orden = Object.entries(posicion)
    .map(([activo, p]) => [excelEtiquetaActivo(activo, cache), p])
    .sort((a, b) => cmpTexto(a[0], b[0]));   // estable
  for (const [etiqueta, [cantidad, coste]] of orden) {
    excelCelda(hoja, fila, 1, etiqueta);
    excelCelda(hoja, fila, 2, cantidad, { formato: EXCEL_FMT.TOKENS });
    excelCelda(hoja, fila++, 3, coste, { formato: EXCEL_FMT.EUR });
  }
  fila += 1;

  excelCelda(hoja, fila++, 1, "Cada ejercicio", { negrita: true, relleno: EXCEL_COLOR.SECCION });
  excelCabecera(hoja, fila++, ["Ejercicio", "Rendimientos de inmuebles (íntegro)", "Recompensas DeFi",
    "Ganancia o pérdida neta", "Retenciones", "Ganancias sin transmisión (base general)"]);
  for (const [anio, b] of Object.entries(resumen)) {
    excelCelda(hoja, fila, 1, Number(anio));
    [b.base_rendimientos_eur, b.base_rewards_eur, b.gp_neta_eur, b.retenciones_eur, b.gp_base_general_eur]
      .forEach((v, i) => excelCelda(hoja, fila, i + 2, v, { formato: EXCEL_FMT.EUR }));
    fila++;
  }
}

/* ---------- Transacciones: el libro diario, una fila por registro ---------- */

function excelHojaTransacciones(libro, ordenados) {
  const hoja = xlsxHoja(libro, "Transacciones");
  const titulos = ["Fecha", "Categoría", "Tipo", "Inmueble / Token", "Periodo", "Cantidad", "Importe USD",
    "Tipo BCE", "Importe EUR", "Coste de compra EUR", "Ganancia o pérdida EUR", "Íntegro EUR", "Retención EUR",
    "Hash", "Nota"];
  excelCabecera(hoja, 1, titulos);
  hoja.anchos = [11, 14, 28, 24, 10, 15, 13, 9, 13, 19, 12, 13, 13, 26, 60];
  let fila = 2;
  for (const r of ordenados) {
    const [usd, eur] = excelImportes(r);
    excelCelda(hoja, fila, 1, excelFecha(r.fecha), { formato: EXCEL_FMT.FECHA });
    excelCelda(hoja, fila, 2, categoriaAMostrar(r.categoria),
      { relleno: excelColorCategoria(r.revisar ? "REVISAR" : r.categoria) });
    if (r.categoria === "RENDIMIENTO") excelCelda(hoja, fila, 3, excelNombreRendimiento(r));
    excelCelda(hoja, fila, 4, excelQue(r));
    excelCelda(hoja, fila, 5, r.periodo_fiscal);
    if (fiscHay(r.cantidad)) excelCelda(hoja, fila, 6, r.cantidad, { formato: EXCEL_FMT.TOKENS });
    if (fiscHay(usd)) excelCelda(hoja, fila, 7, usd, { formato: EXCEL_FMT.USD });
    if (fiscHay(r.tipo_bce)) excelCelda(hoja, fila, 8, r.tipo_bce, { formato: EXCEL_FMT.TIPO_CAMBIO });
    if (fiscHay(eur)) excelCelda(hoja, fila, 9, eur, { formato: EXCEL_FMT.EUR });
    if (fiscHay(r.coste_fifo_eur)) excelCelda(hoja, fila, 10, r.coste_fifo_eur, { formato: EXCEL_FMT.EUR });
    if (fiscHay(r.gp_eur)) excelCelda(hoja, fila, 11, r.gp_eur, { formato: EXCEL_FMT.EUR });
    if (fiscHay(r.base_imponible_eur)) {
      excelCelda(hoja, fila, 12, r.base_imponible_eur, { formato: EXCEL_FMT.EUR });
      excelCelda(hoja, fila, 13, pyO(r.retencion_eur, 0), { formato: EXCEL_FMT.EUR });
    }
    excelCelda(hoja, fila, 14, r.hash, { mono: true });
    excelCelda(hoja, fila++, 15, excelNota(r));
  }
  excelTablaFiltrable(hoja, fila - 1, titulos.length);
}

/* ---------- Ingresos: rendimientos y recompensas ya valorados ---------- */

function excelHojaIngresos(libro, ordenados, cache) {
  const hoja = xlsxHoja(libro, "Ingresos");
  const titulos = ["Fecha", "Tipo", "Inmueble / Origen", "Periodo", "Token", "Íntegro EUR", "Retención EUR", "Ejercicio"];
  excelCabecera(hoja, 1, titulos);
  hoja.anchos = [12, 30, 26, 10, 9, 17, 14, 11];
  const ingresos = ordenados.filter(r =>
    (r.categoria === "RENDIMIENTO" || r.categoria === "REWARD") && fiscHay(r.base_imponible_eur));
  const porAnio = new Map();   // en el orden en que aparecen
  let fila = 2;
  for (const r of ingresos) {
    const esRendimiento = r.categoria === "RENDIMIENTO";
    const anio = pyVerdad(r.fecha) ? parseInt(r.fecha.slice(0, 4), 10) : null;
    excelCelda(hoja, fila, 1, excelFecha(r.fecha), { formato: EXCEL_FMT.FECHA });
    excelCelda(hoja, fila, 2, esRendimiento ? excelNombreRendimiento(r) : "Recompensa DeFi");
    excelCelda(hoja, fila, 3, esRendimiento ? r.inmueble : rentaNombreContratoAprendido(r.origen, cache));
    excelCelda(hoja, fila, 4, r.periodo_fiscal);
    // Un rendimiento se cobra en USDT; una recompensa, en el token que llegó.
    const token = esRendimiento ? "USDT"
      : pyO(r.simbolo, r.contrato === USDT ? "USDT" : r.contrato === USDC ? "USDC" : "RNT");
    excelCelda(hoja, fila, 5, token);
    excelCelda(hoja, fila, 6, r.base_imponible_eur, { formato: EXCEL_FMT.EUR });
    const retencion = pyO(r.retencion_eur, 0);
    excelCelda(hoja, fila, 7, retencion, { formato: EXCEL_FMT.EUR });
    excelCelda(hoja, fila, 8, anio);
    if (!porAnio.has(anio)) porAnio.set(anio, { rendimientos: 0, rewards: 0, retenciones: 0 });
    const b = porAnio.get(anio);
    b[esRendimiento ? "rendimientos" : "rewards"] += r.base_imponible_eur;
    b.retenciones += retencion;
    fila++;
  }
  excelTablaFiltrable(hoja, fila - 1, titulos.length);

  fila += 1;
  excelCelda(hoja, fila++, 1, "Cada ejercicio", { negrita: true, relleno: EXCEL_COLOR.SECCION });
  excelCabecera(hoja, fila++, ["Ejercicio", "Rendimientos EUR (íntegro)", "Recompensas DeFi EUR",
    "Total EUR (íntegro)", "Retenciones EUR (aparte)"]);
  for (const anio of [...porAnio.keys()].filter(a => a !== null).sort((a, b) => a - b)) {
    const b = porAnio.get(anio);
    excelCelda(hoja, fila, 1, anio);
    [b.rendimientos, b.rewards, b.rendimientos + b.rewards, b.retenciones]
      .forEach((v, i) => excelCelda(hoja, fila, i + 2, v, { formato: EXCEL_FMT.EUR }));
    fila++;
  }
  fila += 1;
  excelCelda(hoja, fila++, 1, "Todos los ejercicios", { negrita: true, relleno: EXCEL_COLOR.SECCION });
  const bloques = [...porAnio.values()];
  const total = clave => pySuma(bloques.map(b => b[clave]));
  const rend = total("rendimientos"), rew = total("rewards");
  for (const [etiqueta, importe, negrita] of [["Rendimientos (íntegro)", rend, false],
    ["Recompensas DeFi", rew, false], ["Total (íntegro)", rend + rew, true],
    ["Retenciones (aparte, sin restar)", total("retenciones"), true]]) {
    excelCelda(hoja, fila, 1, etiqueta, { negrita });
    excelCelda(hoja, fila++, 2, importe, { formato: EXCEL_FMT.EUR });
  }
  excelCelda(hoja, fila + 1, 1, EXCEL_COMO_DECLARAR);
}

/* ---------- Historial: cada activo con sus operaciones, como en 🧾 ---------- */

/* La tabla «Historial de cada activo» de 🧾 Fiscal, de todos los años
   (hasta el último dato) y con los lotes de cada venta a la vista: las
   filas y sus cifras salen de js/23 (fiHistorial y fiFilasHistorial), las
   mismas que la pantalla. calculo: lo que da fiCalcular (js/23). Lo que
   falta (⚠️ en la pantalla) sale «A revisar». */
const EXCEL_HISTORIAL_COLUMNAS = ["Fecha", "Operación", "Tokens", "Precio USD", "Precio EUR", "Importe EUR", "Comisión EUR",
  "Coste EUR", "Ganancia o pérdida EUR", "Quedan", "Nota"];
const EXCEL_A_REVISAR = "A revisar";

/* Una cifra de la tabla: «A revisar» si falta (undefined), nada si no hay.
   Los € ya redondeados al céntimo, como la pantalla (los empates, al par). */
function excelCifraHistorial(hoja, fila, columna, v, formato, estilo = {}) {
  if (v === undefined) excelCelda(hoja, fila, columna, EXCEL_A_REVISAR, { ...estilo, horizontal: "right" });
  else if (typeof v === "number") excelCelda(hoja, fila, columna, formato === EXCEL_FMT.PRECIO ? v : rentaEur2(v), { ...estilo, formato });
}

function excelHojaHistorial(libro, calculo, cache) {
  const hoja = xlsxHoja(libro, "Historial");
  hoja.anchos = [34, 40, 15, 13, 13, 15, 14, 15, 15, 15, 50];
  const anios = fiAnios(calculo.informes);
  const anio = anios.length ? anios[anios.length - 1] : null;
  const activos = anio === null ? [] : fiHistorial(calculo, anio, cache);
  let fila = 1;
  excelCelda(hoja, fila++, 1, "Historial de cada activo", { negrita: true });
  if (!activos.length) {
    excelCelda(hoja, fila, 1, "Sin operaciones.");
    return;
  }
  const informe = calculo.informes[anio];
  excelCelda(hoja, fila++, 1, fiHastaHistorial(informe, anio));
  if (!fiLotesCuadran(calculo.lotes, calculo.nombres, informe)) {
    excelCelda(hoja, fila++, 1, "No cuadran con la cartera del informe de " + anio + ": revisa las fechas de los avisos de «Fiscal " + anio + "».",
      { color: EXCEL_COLOR.ROJO });
  }
  fila++;

  // Arriba, una línea por activo (como las de 🧾), en sus grupos.
  const { titulo, grupos } = fiGruposHistorial(activos, informe);
  const linea = (etiqueta, quedan, costeQueda, ganancia, estilo = {}, nota = null) => {
    excelCelda(hoja, fila, 1, etiqueta, estilo);
    if (quedan !== null) excelCelda(hoja, fila, 2, quedan, { ...estilo, formato: EXCEL_FMT.TOKENS });
    excelCifraHistorial(hoja, fila, 3, costeQueda, EXCEL_FMT.NUM, estilo);
    excelCifraHistorial(hoja, fila, 4, ganancia, EXCEL_FMT.NUM_SIGNO, estilo);
    if (nota) excelCelda(hoja, fila, 5, nota);
    fila++;
  };
  excelCabecera(hoja, fila++, ["Activo", "Quedan", "Coste de lo que queda EUR", "Ganancia o pérdida EUR (desde el principio)"]);
  linea("Total", null, fiCosteQueda(activos), fiGpDesdeElPrincipio(activos), { negrita: true });
  for (const [nombre, as] of grupos) {
    linea(nombre, null, fiCosteQueda(as), fiGpDesdeElPrincipio(as), { negrita: true, relleno: EXCEL_COLOR.GRUPO });
    for (const a of as) {
      linea(a.nombre, a.quedan, a.costeQueda, a.gp, {},
        [a.avisos ? EXCEL_A_REVISAR + " (" + a.avisos + ")" : "", a.abierto ? "" : "Ya no lo tienes"].filter(Boolean).join(". "));
    }
  }
  // Lo que no es de un activo, como en el Resumen: el resultado de los
  // pools de liquidez y los regalos (base general).
  const pools = calculo.registros.filter(r => rentaEsResultadoPool(r) && fiscHay(r.gp_eur));
  if (pools.length) linea(titulo("gp_otros_elementos") || "Pools de liquidez", null, null, pySuma(pools.map(r => r.gp_eur)));
  const regalos = calculo.registros.filter(r => r.codigo_concepto === "GP_BASE_GRAL" && fiscHay(r.gp_eur));
  if (regalos.length) linea("Ganancias sin transmisión (regalos, base general)", null, null, pySuma(regalos.map(r => r.gp_eur)));
  fila++;

  // Debajo, la tabla de cada activo.
  for (const [, as] of grupos) {
    for (const a of as) {
      excelCelda(hoja, fila++, 1, a.nombre, { negrita: true, relleno: EXCEL_COLOR.SECCION });
      excelCabecera(hoja, fila++, EXCEL_HISTORIAL_COLUMNAS);
      let supuesto = false;
      for (const { f, c: x, nota, operacion, tokens, sinLote, lotes, precioUsd, precioEur, sinUsd } of fiFilasHistorial(a, calculo.nombres)) {
        if (fiPorMes(f)) excelCelda(hoja, fila, 1, mesEs(f.fecha.slice(0, 7)));
        else {
          // Escrita a mano puede traer «Z» o milésimas, o no traer hora.
          excelCelda(hoja, fila, 1, xlsxFecha(f.fecha.slice(0, 19)),
            { formato: /\d{2}:\d{2}/.test(f.fecha) ? EXCEL_FMT.FECHA_HORA : EXCEL_FMT.FECHA });
        }
        excelCelda(hoja, fila, 2, operacion);
        excelCelda(hoja, fila, 3, tokens, { formato: EXCEL_FMT.TOKENS });
        const notas = [nota, f.aviso ? "A revisar: aviso en «Fiscal " + f.fecha.slice(0, 4) + "»" : "",
          sinLote ? cantidadEs(sinLote) + " sin compra registrada" : ""];
        if (x) {
          if (sinUsd) excelCelda(hoja, fila, 4, "—", { horizontal: "right" });
          else excelCifraHistorial(hoja, fila, 4, precioUsd, EXCEL_FMT.PRECIO);
          excelCifraHistorial(hoja, fila, 5, precioEur, EXCEL_FMT.PRECIO);
          excelCifraHistorial(hoja, fila, 6, x.total, x.supuesto ? EXCEL_FMT.NUM_SUPUESTO : EXCEL_FMT.NUM);
          excelCifraHistorial(hoja, fila, 7, x.comision, EXCEL_FMT.NUM);
          excelCifraHistorial(hoja, fila, 8, x.costeSigno, EXCEL_FMT.NUM_SIGNO);
          excelCifraHistorial(hoja, fila, 9, x.gp, EXCEL_FMT.NUM_SIGNO);
          if (fiscHay(x.quedan)) excelCelda(hoja, fila, 10, x.quedan, { formato: EXCEL_FMT.TOKENS });
          supuesto = supuesto || !!x.supuesto;
        } else excelCifraHistorial(hoja, fila, 6, undefined);
        if (notas.some(Boolean)) excelCelda(hoja, fila, 11, notas.filter(Boolean).join(". "));
        fila++;
        // Los lotes de una venta, siempre a la vista (en la pantalla, «▸ n lotes»).
        for (const p of lotes) {
          excelCelda(hoja, fila, 2, "↳ " + p.texto);
          excelCelda(hoja, fila, 3, p.n, { formato: EXCEL_FMT.TOKENS });
          excelCifraHistorial(hoja, fila, 6, p.total, EXCEL_FMT.NUM);
          excelCifraHistorial(hoja, fila, 7, p.comision, EXCEL_FMT.NUM);
          excelCifraHistorial(hoja, fila, 8, p.coste, p.conSigno ? EXCEL_FMT.NUM_SIGNO : EXCEL_FMT.NUM);
          excelCifraHistorial(hoja, fila++, 9, p.gp, EXCEL_FMT.NUM_SIGNO);
        }
      }
      const total = { negrita: true };
      excelCelda(hoja, fila, 2, "Total", total);
      excelCelda(hoja, fila, 3, a.quedan, { ...total, formato: EXCEL_FMT.TOKENS });
      excelCifraHistorial(hoja, fila, 8, a.costeQueda, EXCEL_FMT.NUM, total);
      excelCifraHistorial(hoja, fila++, 9, a.gp, EXCEL_FMT.NUM_SIGNO, total);
      if (supuesto) excelCelda(hoja, fila++, 1, NOTA_COSTE_SUPUESTO);
      fila++;
    }
  }
}

/* ---------- Fiscal AAAA: el informe fiscal de cada año ---------- */

/* Una fila del informe desde la columna A; devuelve la siguiente. Un
   valor null sin formato deja la celda vacía; con formato (un importe
   sin dato) se ve «—», a la derecha. Los títulos de una tabla (cabecera)
   parten en dos líneas si no caben. */
function excelFilaRenta(hoja, fila, valores, formatos = [], { negrita = false, relleno = null, cabecera = false } = {}) {
  valores.forEach((valor, i) => {
    let formato = i < formatos.length ? formatos[i] : null;
    if (!fiscHay(valor) && formato) { valor = "—"; formato = null; }
    if (!fiscHay(valor) && !relleno) return;
    const alinear = cabecera ? { ajustar: true, vertical: "top" } : valor === "—" ? { horizontal: "right" } : {};
    excelCelda(hoja, fila, i + 1, valor, { formato, negrita: negrita || cabecera, relleno, ...alinear });
  });
  return fila + 1;
}

/* Texto largo (nota, definición, descargo): desde su columna hasta la
   última del informe, en varias líneas si no cabe (Excel no ajusta solo
   el alto de una fila con celdas unidas). Devuelve la fila siguiente.
   tal: sin pasar por excelTexto (lo que escribió el usuario). */
function excelTextoRenta(hoja, fila, texto, columna = 1, tal = false) {
  if (!tal) texto = excelTexto(texto);
  excelCelda(hoja, fila, columna, texto, { ajustar: true, vertical: "top" });
  xlsxUnir(hoja, fila, columna, fila, EXCEL_RENTA_COLUMNAS);
  const caben = Math.floor(EXCEL_RENTA_ANCHOS.slice(columna - 1).reduce((a, b) => a + b, 0) * 0.9);
  const lineas = Math.ceil([...String(texto ?? "")].length / caben);
  if (lineas > 1) hoja.altos[fila] = 15 * lineas;
  return fila + 1;
}

function excelSeccionRenta(hoja, fila, titulo) {
  return excelFilaRenta(hoja, fila, [titulo, ...Array(EXCEL_RENTA_COLUMNAS - 1).fill(null)], [],
    { negrita: true, relleno: EXCEL_COLOR.SECCION });
}

function excelHojasRenta(libro, informes, ahora, hasta) {
  for (const anio of Object.keys(informes).map(Number).sort((a, b) => a - b)) {
    const informe = informes[anio];
    const hoja = xlsxHoja(libro, "Fiscal " + anio);
    hoja.anchos = [...EXCEL_RENTA_ANCHOS];
    xlsxCongelar(hoja, 2, 1);
    excelCelda(hoja, 1, 1, "Informe fiscal · Ejercicio " + anio, { negrita: true });
    let fila = excelRentaCabecera(hoja, 3, informe, ahora, hasta);
    fila = excelRentaResumen(hoja, fila + 1, informe);
    fila = excelRentaInversiones(hoja, fila + 1, informe);
    fila = excelRentaDetalle(hoja, fila + 1, informe);
    fila = excelRentaAvisos(hoja, fila + 1, informe);
    excelRentaTextos(hoja, fila + 1, informe);
  }
}

function excelRentaCabecera(hoja, fila, informe, ahora, hasta) {
  const c = informe.cabecera;
  let periodo = "del " + pdFechaEs(c.periodo_desde) + " al " + pdFechaEs(c.periodo_hasta) + HORA_INFORME;
  if (!c.anio_terminado) periodo += " (ejercicio en curso: datos hasta el " + pdFechaEs(c.datos_hasta) + ")";
  const dos = n => String(n).padStart(2, "0");
  const generado = dos(ahora.getDate()) + "/" + dos(ahora.getMonth() + 1) + "/" + ahora.getFullYear() + " " +
    dos(ahora.getHours()) + ":" + dos(ahora.getMinutes());
  // El titular, el NIF y la wallet, tal cual («2024-01-05» en un nombre
  // saldría «05/01/2024»).
  for (const [etiqueta, valor, tal] of [["Titular", pyO(c.titular, ""), true], ["NIF", pyO(c.nif, ""), true],
    ["Wallet", pyO(c.wallet, ""), true], ["Periodo", periodo], ["Generado el", generado],
    ["Moneda", c.divisa === "EUR" ? DIVISA_INFORME_EUR : c.divisa], ["Qué incluye", c.alcance]]) {
    excelCelda(hoja, fila, 1, etiqueta, { negrita: true });
    fila = excelTextoRenta(hoja, fila, valor, 2, tal);
  }
  // Lo que 🧾 y el informe imprimible avisan de la sincronización.
  const aviso = hasta ? fiAvisoSincronizacion(hasta) : "";
  if (aviso) {
    excelCelda(hoja, fila, 1, aviso, { negrita: true, color: EXCEL_COLOR.ROJO });
    xlsxUnir(hoja, fila, 1, fila, EXCEL_RENTA_COLUMNAS);
    fila++;
  }
  return fila;
}

function excelRentaResumen(hoja, fila, informe) {
  fila = excelSeccionRenta(hoja, fila, "I. Resumen del ejercicio");
  fila = excelTextoRenta(hoja, fila, NOTA_RESUMEN_INFORME);
  fila = excelFilaRenta(hoja, fila, ["Concepto", "Importe", "Nota"], [], { relleno: EXCEL_COLOR.CABECERA, cabecera: true });
  let grupo;
  for (const f of informe.resumen) {
    if (f.grupo !== grupo) {
      grupo = f.grupo;
      fila = excelFilaRenta(hoja, fila, [grupo, null, null], [], { negrita: true, relleno: EXCEL_COLOR.GRUPO });
    }
    let importe = f.importe, formato = f.unidad === "POL" ? EXCEL_FMT.POL : EXCEL_FMT.EUR;
    if (!fiscHay(importe)) { importe = "no disponible"; formato = null; }
    if (pyVerdad(f.nota)) excelTextoRenta(hoja, fila, f.nota, 3);
    fila = excelFilaRenta(hoja, fila, [f.concepto, importe], [null, formato], { negrita: pyVerdad(f.total) });
  }
  return fila;
}

function excelRentaInversiones(hoja, fila, informe) {
  const inv = informe.inversiones_activas;
  fila = excelSeccionRenta(hoja, fila, "II. Inversiones activas a " + pdFechaEs(inv.fecha_corte));
  if (!inv.anio_terminado) fila = excelTextoRenta(hoja, fila, NOTA_EJERCICIO_EN_CURSO);
  fila = excelTextoRenta(hoja, fila, inv.nota);
  if (!fiscHay(inv.inmuebles)) return excelFilaRenta(hoja, fila, ["No disponible."]);
  fila = excelFilaRenta(hoja, fila, ["Activo", "Cantidad", "Coste de compra USD", "Coste de compra EUR"], [],
    { relleno: EXCEL_COLOR.CABECERA, cabecera: true });
  let hayParcial = false, haySupuesto = false;
  const bloque = (titulo, filas, vacio = "Ninguno") => {
    fila = excelFilaRenta(hoja, fila, [titulo, null, null, null], [], { negrita: true, relleno: EXCEL_COLOR.GRUPO });
    for (const f of filas) {
      hayParcial = hayParcial || pyVerdad(f.coste_usd_parcial);
      haySupuesto = haySupuesto || f.coste_supuesto === true;
      fila = excelFilaRenta(hoja, fila, [f.nombre, f.cantidad, f.coste_usd, f.coste_eur],
        [null, EXCEL_FMT.TOKENS, pyVerdad(f.coste_usd_parcial) ? EXCEL_FMT.NUM_PARCIAL : EXCEL_FMT.NUM,
          f.coste_supuesto === true ? EXCEL_FMT.NUM_SUPUESTO : EXCEL_FMT.NUM]);
    }
    if (!filas.length && vacio) fila = excelFilaRenta(hoja, fila, [vacio]);
  };
  const subtotal = (texto, importe) => {
    fila = excelFilaRenta(hoja, fila, [texto, null, null, importe], [null, null, null, EXCEL_FMT.NUM], { negrita: true });
  };
  bloque("Tokens de inmuebles (a coste de compra)", inv.inmuebles.filas);
  subtotal("Subtotal tokens de inmuebles", inv.inmuebles.subtotal_eur);

  const vault = inv.vault;
  bloque("Vault de Reental: saldo en USDT", [], null);
  if (fiscHay(vault.saldo_usd)) {
    let texto = "Saldo a la fecha";
    if (pyVerdad(vault.fecha_tipo_bce)) {
      texto += " (en euros, al tipo de cambio del BCE del " + pdFechaEs(vault.fecha_tipo_bce) + ")";
    }
    fila = excelFilaRenta(hoja, fila, [texto, null, vault.saldo_usd, vault.saldo_eur],
      [null, null, EXCEL_FMT.NUM, EXCEL_FMT.NUM]);
    if (pyVerdad(vault.aviso)) fila = excelFilaRenta(hoja, fila, [excelFrase(vault.aviso)]);
  } else {
    fila = excelFilaRenta(hoja, fila, [excelTexto(vault.nota)]);
  }
  subtotal("Subtotal vault", vault.saldo_eur);

  bloque("Otros criptoactivos (a coste de compra)", inv.otros.filas);
  subtotal("Subtotal otros criptoactivos", inv.otros.subtotal_eur);
  fila = excelFilaRenta(hoja, fila, ["Total inversiones activas", null, null, inv.total_eur],
    [null, null, null, EXCEL_FMT.NUM], { negrita: true, relleno: EXCEL_COLOR.CABECERA });
  if (hayParcial) fila = excelTextoRenta(hoja, fila, NOTA_USD_PARCIAL);
  if (haySupuesto) fila = excelTextoRenta(hoja, fila, NOTA_COSTE_SUPUESTO);
  return fila;
}

/* Título de una tabla del detalle y su «A declarar en: …». */
function excelRentaTituloTabla(hoja, fila, titulo, tabla) {
  fila = excelFilaRenta(hoja, fila + 1, [titulo], [], { negrita: true });
  return excelTextoRenta(hoja, fila, "A declarar en: " + tabla.a_declarar_en);
}

function excelRentaDetalle(hoja, fila, informe) {
  const detalle = informe.detalle;
  const N = EXCEL_FMT.NUM, S = EXCEL_FMT.NUM_SIGNO;
  fila = excelSeccionRenta(hoja, fila, "III. Detalle");
  fila = excelTextoRenta(hoja, fila, NOTA_DETALLE_INFORME);
  const cabecera = titulos => excelFilaRenta(hoja, fila, titulos, [], { relleno: EXCEL_COLOR.CABECERA, cabecera: true });

  // 1. Rendimientos de inmuebles tokenizados.
  const rend = detalle.rendimientos;
  fila = excelRentaTituloTabla(hoja, fila, "1. Rendimientos de inmuebles tokenizados", rend);
  if (rend.filas.length) {
    fila = cabecera(["Fecha", "Inmueble", "Periodo", "Tipo", "Íntegro USD", "Íntegro EUR", "Retención USD",
      "Retención EUR", "%", "Neto USD", "Neto EUR"]);
    const importes = f => [f.integro_usd, f.integro_eur, f.retencion_usd, f.retencion_eur,
      pyGet(f, "pct_retencion", null), f.neto_usd, f.neto_eur];
    // El % va en blanco donde no hay retención (nunca «—» ni 0).
    const formatos = f => [N, N, N, N, fiscHay(pyGet(f, "pct_retencion", null)) ? N : null, N, N];
    for (const f of rend.filas) {
      fila = excelFilaRenta(hoja, fila,
        [excelFecha(f.fecha), f.inmueble, f.periodo, pyCapitalizar(f.tipo.replaceAll("Rendimiento ", ""))]
          .concat(importes(f)), [EXCEL_FMT.FECHA, null, null, null].concat(formatos(f)));
    }
    for (const [texto, clave] of [["Subtotal con retención", "subtotal_con_retencion"],
      ["Subtotal sin retención", "subtotal_sin_retencion"], ["Total", "total"]]) {
      fila = excelFilaRenta(hoja, fila, [texto, null, null, null].concat(importes(rend[clave])),
        [null, null, null, null].concat(formatos(rend[clave])), { negrita: true });
    }
  } else {
    fila = excelFilaRenta(hoja, fila, ["Ninguno en este ejercicio."]);
  }

  // 2. Recompensas DeFi.
  const rec = detalle.recompensas;
  fila = excelRentaTituloTabla(hoja, fila, "2. Recompensas DeFi", rec);
  if (rec.filas.length) {
    fila = cabecera(["Fecha", "Origen", "Token", "Cantidad", "Precio unitario USD", "Precio unitario EUR",
      "Importe USD", "Importe EUR"]);
    for (const f of rec.filas) {
      fila = excelFilaRenta(hoja, fila, [excelFecha(f.fecha), f.origen, f.token, f.cantidad, f.precio_usd,
        f.precio_eur, f.importe_usd, f.importe_eur],
      [EXCEL_FMT.FECHA, null, null, EXCEL_FMT.TOKENS, EXCEL_FMT.PRECIO, EXCEL_FMT.PRECIO, N, N]);
    }
    fila = excelFilaRenta(hoja, fila, ["Total", null, null, null, null, null, rec.total.importe_usd,
      rec.total.importe_eur], [null, null, null, null, null, null, N, N], { negrita: true });
  } else {
    fila = excelFilaRenta(hoja, fila, ["Ninguna en este ejercicio."]);
  }

  // 3 y 4. Ventas de tokens de inmuebles y permutas de monedas virtuales.
  for (const [titulo, clave] of [["3. Ventas de tokens de inmuebles", "ventas_inmuebles"],
    ["4. Permutas de monedas virtuales", "permutas"]]) {
    const tabla = detalle[clave];
    fila = excelRentaTituloTabla(hoja, fila, titulo, tabla);
    if (!tabla.filas.length) {
      fila = excelFilaRenta(hoja, fila, ["Ninguna en este ejercicio."]);
      continue;
    }
    // En las permutas, qué se hizo (pago, cambio, retirada) va en su columna.
    const conOperacion = clave === "permutas";
    const conOp = valor => (conOperacion ? [valor] : []);
    // Las fechas, con las mismas palabras que el PDF.
    fila = cabecera(["Activo", ...conOp("Operación"), "Tipo", conOperacion ? "Recibido el" : "Comprado el",
      conOperacion ? "Entregado el" : "Vendido el", "Cantidad", "Valor de adquisición USD", "Valor de adquisición EUR",
      "Valor de transmisión USD", "Valor de transmisión EUR", "Ganancia o pérdida EUR"]);
    const fmtImportes = [N, N, N, N, S];
    let hayCanje = false, haySupuesto = false;
    for (const f of tabla.filas) {
      const supuesto = f.coste_supuesto === true;
      haySupuesto = haySupuesto || supuesto;
      // Con la marca del canje la fecha va como texto; sin ella, como fecha.
      let adquirido = excelFecha(f.fecha_adquisicion), fmtAdq = EXCEL_FMT.FECHA;
      if (pyVerdad(f.adquirido_por_canje)) {
        adquirido = pyO(pdFechaEs(f.fecha_adquisicion), "—") + " *";
        fmtAdq = null;
        hayCanje = true;
      }
      fila = excelFilaRenta(hoja, fila,
        [f.activo, ...conOp(f.operacion), f.tipo_activo, adquirido, excelFecha(f.fecha_transmision),
          f.cantidad, f.valor_adquisicion_usd, f.valor_adquisicion_eur, f.valor_transmision_usd,
          f.valor_transmision_eur, f.gp_eur],
        [null, ...conOp(null), null, fmtAdq, EXCEL_FMT.FECHA, EXCEL_FMT.TOKENS,
          N, supuesto ? EXCEL_FMT.NUM_SUPUESTO : N, N, N, S]);
    }
    const t = tabla.total, vacias = [null, null, null, null, ...conOp(null)];
    fila = excelFilaRenta(hoja, fila, ["Total", ...vacias, t.valor_adquisicion_usd, t.valor_adquisicion_eur,
      t.valor_transmision_usd, t.valor_transmision_eur, t.gp_eur], [null, ...vacias, ...fmtImportes], { negrita: true });
    if (hayCanje) fila = excelTextoRenta(hoja, fila, NOTA_CANJE_INFORME);
    if (haySupuesto) fila = excelTextoRenta(hoja, fila, NOTA_COSTE_SUPUESTO);
  }

  // Pools de liquidez y ganancias sin venta, solo si las hay.
  let n = 5;
  for (const [clave, titulo] of [["otros_elementos", "Pools de liquidez"],
    ["ganancias_sin_transmision", "Ganancias sin transmisión (airdrops, regalos, referidos)"]]) {
    const tabla = pyGet(detalle, clave, null);
    if (!pyVerdad(tabla)) continue;
    fila = excelRentaTituloTabla(hoja, fila, n + ". " + titulo, tabla);
    n++;
    // Los pools llevan también los dos valores de la casilla.
    const valores = fiscTiene(tabla.total, "valor_transmision_eur");
    fila = cabecera(["Fecha", "Concepto", "Token", "Cantidad"].concat(valores
      ? ["Valor de transmisión EUR", "Valor de adquisición EUR", "Ganancia o pérdida USD", "Ganancia o pérdida EUR"]
      : ["Importe USD", "Importe EUR"]));
    const fmtValores = valores ? [N, N] : [];
    for (const f of tabla.filas) {
      fila = excelFilaRenta(hoja, fila,
        [excelFecha(f.fecha), f.concepto, f.token, f.cantidad]
          .concat(valores ? [f.valor_transmision_eur, f.valor_adquisicion_eur] : [], [f.importe_usd, f.importe_eur]),
        [EXCEL_FMT.FECHA, null, null, EXCEL_FMT.TOKENS, ...fmtValores, S, S]);
    }
    const t = tabla.total;
    fila = excelFilaRenta(hoja, fila,
      ["Total", null, null, null].concat(valores ? [t.valor_transmision_eur, t.valor_adquisicion_eur] : [],
        [t.importe_usd, t.importe_eur]),
      [null, null, null, null, ...fmtValores, S, S], { negrita: true });
  }
  return fila;
}

function excelRentaAvisos(hoja, fila, informe) {
  fila = excelSeccionRenta(hoja, fila, "IV. Avisos y datos a revisar");
  if (!informe.avisos.length) return excelFilaRenta(hoja, fila, ["Ninguno."]);
  fila = excelFilaRenta(hoja, fila, ["Fecha", "Concepto", "Tipo", "Detalle"], [],
    { relleno: EXCEL_COLOR.CABECERA, cabecera: true });
  for (const a of informe.avisos) {
    excelTextoRenta(hoja, fila, excelFrase(a.detalle), 4, true);
    fila = excelFilaRenta(hoja, fila, [excelFecha(a.fecha), a.concepto, a.tipo === "revisar" ? EXCEL_A_REVISAR : "Nota"],
      [EXCEL_FMT.FECHA]);
  }
  return fila;
}

function excelRentaTextos(hoja, fila, informe) {
  fila = excelSeccionRenta(hoja, fila, "V. Descargo de responsabilidad, glosario y nota metodológica");
  fila = excelFilaRenta(hoja, fila, ["Descargo de responsabilidad"], [], { negrita: true });
  fila = excelTextoRenta(hoja, fila, informe.descargo);
  fila = excelFilaRenta(hoja, fila + 1, ["Glosario"], [], { negrita: true });
  for (const t of informe.glosario) {
    excelCelda(hoja, fila, 1, t.termino, { negrita: true });
    fila = excelTextoRenta(hoja, fila, t.definicion, 2);
  }
  fila = excelFilaRenta(hoja, fila + 1, ["Nota metodológica"], [], { negrita: true });
  for (const p of informe.nota_metodologica) {
    excelCelda(hoja, fila, 1, p.titulo, { negrita: true });
    fila = excelTextoRenta(hoja, fila, p.texto, 2);
  }
  return fila;
}

/* ---------- Tipos de cambio BCE ---------- */

/* [fecha, USD por EUR] usados de verdad: los del diario y el del vault de
   cada informe (el 31/12 o el último día hábil antes, que casi nunca tiene
   movimiento), sin repetir y por fecha. */
function excelTiposBceUsados(registros, informes, cache) {
  const usados = new Map();
  const apuntar = (fecha, tipo) => usados.set(fecha + "\u0000" + tipo, [fecha, tipo]);
  for (const r of registros) if (pyVerdad(r.fecha) && fiscHay(r.tipo_bce)) apuntar(r.fecha.slice(0, 10), r.tipo_bce);
  const tipos = pyO(pyO(cache, {}).tipos_bce, {});
  for (const informe of Object.values(informes || {})) {
    const fecha = pyO(pyO(informe.inversiones_activas, {}).vault, {}).fecha_tipo_bce;
    if (pyVerdad(fecha) && fiscHay(pyGet(tipos, fecha, null))) apuntar(fecha, tipos[fecha]);
  }
  return [...usados.values()].sort((a, b) => cmpTexto(a[0], b[0]) || a[1] - b[1]);
}

function excelHojaTiposBce(libro, registros, informes, cache) {
  const hoja = xlsxHoja(libro, "Tipos de cambio BCE");
  excelCabecera(hoja, 1, ["Fecha", "USD por EUR"]);
  hoja.anchos = [12, 14];
  let fila = 2;
  for (const [fecha, tipo] of excelTiposBceUsados(registros, informes, cache)) {
    excelCelda(hoja, fila, 1, excelFecha(fecha), { formato: EXCEL_FMT.FECHA });
    excelCelda(hoja, fila++, 2, tipo, { formato: EXCEL_FMT.TIPO_CAMBIO });
  }
  excelTablaFiltrable(hoja, fila - 1, 2);
}

/* ---------- Cuadre con la blockchain: solo si hay cuadre ---------- */

/* Por token, lo que la app cree que tienes, lo que está fuera de la
   wallet y el vault, lo que debería haber en ellos y lo que dice la
   blockchain (cuadreCartera de js/28, con la fecha de la lectura). */
function excelHojaCuadre(libro, cuadre) {
  const hoja = xlsxHoja(libro, "Cuadre con la blockchain");
  const columnas = ["Token", "Según la app", "En pools", "En staking o farming", "En otras cuentas tuyas",
    "Debería haber en wallet y vault", "Wallet (blockchain)", "Vault (blockchain)", "Diferencia", "¿Cuadra?"];
  excelCabecera(hoja, 1, columnas);
  hoja.anchos = [26, 18, 14, 18, 20, 26, 20, 18, 14, 10];
  let fila = 2;
  for (const f of cuadre.filas) {
    excelCelda(hoja, fila, 1, f.nombre);
    ["motor", "en_pools", "en_defi", "en_otras_cuentas", "esperado", "wallet", "vault", "diferencia"].forEach((c, i) => {
      if (fiscHay(f[c])) excelCelda(hoja, fila, i + 2, f[c], { formato: EXCEL_FMT.TOKENS });
    });
    excelCelda(hoja, fila++, 10, f.coincide === true ? "Sí" : f.coincide === false ? "No" : "Sin leer",
      { negrita: f.coincide !== true, color: f.coincide ? null : EXCEL_COLOR.ROJO });
  }
  excelTablaFiltrable(hoja, fila - 1, columnas.length);
  excelCelda(hoja, fila + 1, 1, "Saldos de la blockchain leídos" + (cuadre.fecha ? " el " + fechaEs(cuadre.fecha) : "") + ". Lo de los pools, " +
    "el staking, el farming y tus otras cuentas no se lee de la blockchain: se resta lo que la app sabe que mandaste.");
}

/* ---------- Revisión: solo si hay algo pendiente ---------- */

function excelHojaRevision(libro, ordenados) {
  const pendientes = ordenados.filter(r => pyVerdad(r.revisar));
  if (!pendientes.length) return;
  const hoja = xlsxHoja(libro, "Revisión");
  // Sin columna para rellenar: la app no lee el Excel.
  excelCabecera(hoja, 1, ["Fecha", "Hash", "Token", "Importe estimado", "Motivo"], EXCEL_COLOR.ROJO, "FFFFFF");
  hoja.anchos = [11, 68, 22, 16, 70];
  let fila = 2;
  for (const r of pendientes) {
    excelCelda(hoja, fila, 1, excelFecha(r.fecha), { formato: EXCEL_FMT.FECHA });
    excelCelda(hoja, fila, 2, r.hash, { mono: true });
    excelCelda(hoja, fila, 3, excelQue(r));
    const [usd] = excelImportes(r);
    if (fiscHay(usd)) excelCelda(hoja, fila, 4, usd, { formato: EXCEL_FMT.USD });
    else if (fiscHay(r.cantidad)) excelCelda(hoja, fila, 4, r.cantidad, { formato: EXCEL_FMT.TOKENS });
    excelCelda(hoja, fila++, 5, excelNota(r));
  }
  excelTablaFiltrable(hoja, fila - 1, 5);
}

/* ---------- El libro entero ---------- */

/* Libro de js/25 con todas las hojas. registros, colas y resumen: los de
   una pasada de motorFiscal y resumenFiscalAnual; informes, los de
   informesRentaAnuales (sin ellos se montan aquí); ahora: la hora de
   «Generado el»; hasta: el de fiHastaCuando (js/23), para avisar en cada
   «Fiscal AAAA» como el informe imprimible (sin él, nada);
   cuadre: el de fiResultado (js/23; sin él, no hay hoja del cuadre). */
function excelLibro(registros, colas, resumen, cache, config, informes = null, ahora = new Date(), hasta = null, cuadre = null, calculo = null) {
  if (!fiscHay(informes)) informes = informesRentaAnuales(registros, resumen, config, { cache });
  colas = rentaComoMap(colas);
  const libro = xlsxLibro();
  excelHojaResumen(libro, registros, colas, resumen, cache, config, ahora);
  const ordenados = excelOrdenados(registros);
  excelHojaTransacciones(libro, ordenados);
  excelHojaIngresos(libro, ordenados, cache);
  if (calculo) excelHojaHistorial(libro, calculo, cache);
  excelHojasRenta(libro, informes, ahora, hasta);
  excelHojaTiposBce(libro, registros, informes, cache);
  if (cuadre) excelHojaCuadre(libro, cuadre);
  excelHojaRevision(libro, ordenados);
  return libro;
}
