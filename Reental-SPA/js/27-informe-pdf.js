/* =====================================================================
   REENTAL SPA · js/27-informe-pdf.js
   El informe para la Renta de un año, listo para imprimir o guardar como
   PDF (una página limpia y el diálogo de imprimir del navegador, sin
   librerías).

   Lleva, en este orden: cabecera, I. Resumen, II. Inversiones activas,
   III. Detalle, IV. Avisos y V. Descargo, glosario y nota metodológica.
   Las cifras son las del informe (js/22); aquí no se calcula nada
   fiscal. Los textos del motor y del informe pasan por excelTexto
   (js/26). Prueba: tests/paridad_informe_pdf_paso_63 (las cifras de cada
   tabla, celda a celda, con las de referencia) y test_informe_pdf_paso_63.

   Cómo llamarlo (lo hace el botón de 📤 Exportar, exInforme de js/24):
   solo si 🧾 Fiscal enseña el cálculo (fiMotivoSinCalculo() de js/23
   vacío; si no, se dice ese motivo) y con un año de ese cálculo:

     const r = fiResultado();
     pdfImprimir(r.informes[anio], new Date(), r.hasta);

   hasta (lo que da fiHastaCuando): sin fecha de sincronización o si la
   última falló, el informe lo dice debajo de la cabecera, como 🧾 (el
   texto, fiAvisoSincronizacion de js/23, el mismo que el del Excel).
   pdfBloques(informe, ahora, hasta) da el informe como una lista de
   bloques (títulos, notas y tablas con sus celdas ya escritas) y
   pdfHtml(informe, ahora, hasta) la página entera; las dos solo leen.
   Usa ccEsc (js/15), FI_CON_SIGNO y fiEur (js/23) y excelTexto y excelFrase (js/26),
   que cargan antes.
   ===================================================================== */

const PDF_PIE = "Este documento no sustituye al asesoramiento fiscal profesional.";

/* Texto para una cadena de CSS (el pie de página), que va dentro de
   <style>: un «<» se escribe \3c para que no lo cierre. */
function pdfEscCss(t) {
  return String(t ?? "").replace(/[\\"]/g, "\\$&").replace(/[\r\n]+/g, " ").replace(/</g, "\\3c ");
}

/* Números de las tablas: «—» sin dato. */
const pdfSi = (x, escribir) => (typeof x === "number" && Number.isFinite(x) ? escribir(x) : "—");
const pdfNum = (x, dec = 2) => pdfSi(x, v => numEs(v, dec));
const pdfCantidad = x => pdfSi(x, cantidadEs);
// Ganancia o pérdida: con su signo, salvo un cero (la regla de fiEur, sin «€»).
const pdfGp = x => fiEur(x, true).replace(/ €$/, "");


/* «15/01/2026 14:03» con la hora de este ordenador. */
function pdfAhora(ahora) {
  const dos = n => String(n).padStart(2, "0");
  return dos(ahora.getDate()) + "/" + dos(ahora.getMonth() + 1) + "/" + ahora.getFullYear() + " " +
    dos(ahora.getHours()) + ":" + dos(ahora.getMinutes());
}

/* Una tabla: columnas [título, esCifra, ancho en cm] (cifras desde la
   columna «desde»; los anchos suman 18 cm,
   el ancho de la hoja sin márgenes) y filas { celdas, tipo, span }. tipo:
   "grupo" (franja de un bloque), "subtotal" o "total" (en negrita). span:
   cuántas columnas ocupa la primera celda (las que tapa van vacías). Una
   celda es un texto o { texto, nota, aviso }. */
const pdfTabla = (clase, titulos, desde, anchos, filas) => ({ tipo: "tabla", clase,
  columnas: titulos.map((t, i) => [t, i >= desde, anchos[i]]), filas });
const pdfFila = (celdas, tipo = null, span = 1) => ({ celdas, tipo, span });

/* ---------- Cabecera ---------- */

function pdfCabecera(informe, ahora) {
  const c = informe.cabecera;
  let periodo = "del " + pdFechaEs(c.periodo_desde) + " al " + pdFechaEs(c.periodo_hasta) + HORA_INFORME;
  if (!c.anio_terminado) periodo += " (ejercicio en curso: datos hasta el " + pdFechaEs(c.datos_hasta) + ")";
  return pdfTabla("pdf-cabecera", ["", ""], 2, [4, 14], [
    ["Titular", pyO(c.titular, "")], ["NIF", pyO(c.nif, "")], ["Wallet", pyO(c.wallet, "")],
    ["Periodo", periodo], ["Generado el", pdfAhora(ahora)],
    ["Moneda", c.divisa === "EUR" ? DIVISA_INFORME_EUR : c.divisa], ["Qué incluye", c.alcance],
  ].map(celdas => pdfFila(celdas)));
}

/* ---------- I. Resumen del ejercicio ---------- */

function pdfResumen(informe) {
  const filas = [];
  let grupo;
  for (const f of informe.resumen) {
    if (f.grupo !== grupo) {
      grupo = f.grupo;
      filas.push(pdfFila([grupo, ""], "grupo", 2));
    }
    const concepto = { texto: f.concepto, nota: pyVerdad(f.nota) ? excelTexto(f.nota) : null };
    const importe = f.unidad === "EUR" ? fiEur(f.importe, FI_CON_SIGNO.has(f.clave))
      : f.unidad === "POL" ? pdfNum(f.importe, 4) + " POL" : pdfNum(f.importe) + " " + f.unidad;
    filas.push(pdfFila([concepto, importe], pyVerdad(f.total) ? "total" : null));
  }
  return pdfTabla("pdf-resumen", ["Concepto", "Importe"], 1, [14.5, 3.5], filas);
}

/* ---------- II. Inversiones activas ---------- */

function pdfInversiones(informe) {
  const inv = informe.inversiones_activas;
  const bloques = [{ tipo: "seccion", texto: "II. Inversiones activas a " + pdFechaEs(inv.fecha_corte), pagina: true }];
  if (!inv.anio_terminado) bloques.push({ tipo: "nota", texto: NOTA_EJERCICIO_EN_CURSO });
  bloques.push({ tipo: "nota", texto: excelTexto(inv.nota) });
  if (!fiscHay(inv.inmuebles)) {
    bloques.push({ tipo: "parrafo", texto: "No disponible." });
    return bloques;
  }
  const filas = [];
  let hayParcial = false, haySupuesto = false;
  const bloque = titulo => filas.push(pdfFila([titulo, "", "", ""], "grupo", 4));
  const subtotal = (texto, importe) => filas.push(pdfFila([texto, "", "", pdfNum(importe)], "subtotal"));
  const activos = lista => {
    for (const f of lista) {
      let usd = pdfNum(f.coste_usd);
      if (pyVerdad(f.coste_usd_parcial)) { usd += " *"; hayParcial = true; }
      let eur = pdfNum(f.coste_eur);
      if (f.coste_supuesto === true) { eur += " **"; haySupuesto = true; }
      filas.push(pdfFila([f.nombre, pdfCantidad(f.cantidad), usd, eur]));
    }
    if (!lista.length) filas.push(pdfFila(["Ninguno", "", "", ""]));
  };
  bloque("Tokens de inmuebles (a coste de compra)");
  activos(inv.inmuebles.filas);
  subtotal("Subtotal tokens de inmuebles", inv.inmuebles.subtotal_eur);

  const vault = inv.vault;
  bloque("Vault de Reental: saldo en USDT");
  if (fiscHay(vault.saldo_usd)) {
    filas.push(pdfFila([{ texto: "Saldo a la fecha",
      nota: pyVerdad(vault.fecha_tipo_bce) ? "En euros, al tipo de cambio del BCE del " + pdFechaEs(vault.fecha_tipo_bce) : null,
      aviso: pyVerdad(vault.aviso) ? excelFrase(vault.aviso) : null }, "", pdfNum(vault.saldo_usd), pdfNum(vault.saldo_eur)]));
  } else {
    filas.push(pdfFila([excelTexto(vault.nota), "", "", ""]));
  }
  subtotal("Subtotal vault", vault.saldo_eur);

  bloque("Otros criptoactivos (a coste de compra)");
  activos(inv.otros.filas);
  subtotal("Subtotal otros criptoactivos", inv.otros.subtotal_eur);
  filas.push(pdfFila(["Total inversiones activas", "", "", pdfNum(inv.total_eur)], "total"));
  bloques.push(pdfTabla("pdf-inversiones", ["Activo", "Cantidad", "Coste de compra USD", "Coste de compra EUR"], 1,
    [7.5, 3, 3.75, 3.75], filas));
  if (hayParcial) bloques.push({ tipo: "nota", texto: NOTA_USD_PARCIAL });
  if (haySupuesto) bloques.push({ tipo: "nota", texto: NOTA_COSTE_SUPUESTO });
  return bloques;
}

/* ---------- III. Detalle ---------- */

/* Título de una tabla del detalle, su «A declarar en» y, si no tiene
   filas, el «Ninguno». */
function pdfTituloTabla(bloques, titulo, tabla, vacio) {
  bloques.push({ tipo: "subtitulo", texto: titulo },
    { tipo: "nota", texto: "A declarar en: " + excelTexto(tabla.a_declarar_en) });
  if (!tabla.filas.length && vacio) bloques.push({ tipo: "parrafo", texto: vacio });
  return tabla.filas.length > 0;
}

function pdfDetalle(informe) {
  const detalle = informe.detalle;
  const bloques = [{ tipo: "seccion", texto: "III. Detalle", pagina: true },
    { tipo: "nota", texto: NOTA_DETALLE_INFORME }];

  // 1. Rendimientos de inmuebles tokenizados.
  const rend = detalle.rendimientos;
  if (pdfTituloTabla(bloques, "1. Rendimientos de inmuebles tokenizados", rend, "Ninguno en este ejercicio.")) {
    const importes = f => [pdfNum(f.integro_usd), pdfNum(f.integro_eur), pdfNum(f.retencion_usd),
      pdfNum(f.retencion_eur), fiscHay(f.pct_retencion) ? pdfNum(f.pct_retencion) : "",
      pdfNum(f.neto_usd), pdfNum(f.neto_eur)];
    const filas = rend.filas.map(f => pdfFila([pdFechaEs(f.fecha), f.inmueble, f.periodo,
      pyCapitalizar(f.tipo.replaceAll("Rendimiento ", ""))].concat(importes(f))));
    for (const [texto, clave, tipo] of [["Subtotal con retención", "subtotal_con_retencion", "subtotal"],
      ["Subtotal sin retención", "subtotal_sin_retencion", "subtotal"], ["Total", "total", "total"]]) {
      filas.push(pdfFila([texto, "", "", ""].concat(importes(rend[clave])), tipo, 4));
    }
    bloques.push(pdfTabla("pdf-rendimientos", ["Fecha", "Inmueble", "Periodo", "Tipo", "Íntegro USD",
      "Íntegro EUR", "Retención USD", "Retención EUR", "%", "Neto USD", "Neto EUR"], 4,
    [1.5, 3, 1.55, 1.5, 1.3, 1.3, 1.45, 1.45, 0.85, 1.3, 1.3], filas));
  }

  // 2. Recompensas DeFi.
  const rec = detalle.recompensas;
  if (pdfTituloTabla(bloques, "2. Recompensas DeFi", rec, "Ninguna en este ejercicio.")) {
    const filas = rec.filas.map(f => pdfFila([pdFechaEs(f.fecha), f.origen, f.token, pdfCantidad(f.cantidad),
      pdfNum(f.precio_usd, 4), pdfNum(f.precio_eur, 4), pdfNum(f.importe_usd), pdfNum(f.importe_eur)]));
    filas.push(pdfFila(["Total", "", "", "", "", "", pdfNum(rec.total.importe_usd), pdfNum(rec.total.importe_eur)], "total"));
    bloques.push(pdfTabla("pdf-recompensas", ["Fecha", "Origen", "Token", "Cantidad", "Precio unitario USD",
      "Precio unitario EUR", "Importe USD", "Importe EUR"], 3, [1.6, 3.6, 1.5, 2.4, 2, 2, 1.9, 1.9], filas));
  }

  // 3 y 4. Ventas de tokens de inmuebles y permutas de monedas virtuales.
  for (const [titulo, clave] of [["3. Ventas de tokens de inmuebles", "ventas_inmuebles"],
    ["4. Permutas de monedas virtuales", "permutas"]]) {
    const tabla = detalle[clave];
    if (!pdfTituloTabla(bloques, titulo, tabla, "Ninguna en este ejercicio.")) continue;
    // En las permutas, qué se hizo (pago, cambio, retirada) va en su columna.
    const permuta = clave === "permutas";
    const conOp = valor => (permuta ? [valor] : []);
    let hayCanje = false, haySupuesto = false;
    const filas = tabla.filas.map(f => {
      let adquirido = pdFechaEs(f.fecha_adquisicion) || "—";
      if (pyVerdad(f.adquirido_por_canje)) { adquirido += " *"; hayCanje = true; }
      let adqEur = pdfNum(f.valor_adquisicion_eur);
      if (f.coste_supuesto === true) { adqEur += " **"; haySupuesto = true; }
      return pdfFila([f.activo, ...conOp(f.operacion), f.tipo_activo, adquirido, pdFechaEs(f.fecha_transmision),
        pdfCantidad(f.cantidad), pdfNum(f.valor_adquisicion_usd), adqEur,
        pdfNum(f.valor_transmision_usd), pdfNum(f.valor_transmision_eur), pdfGp(f.gp_eur)]);
    });
    const t = tabla.total;
    filas.push(pdfFila(["Total", ...conOp(""), "", "", "", "", pdfNum(t.valor_adquisicion_usd),
      pdfNum(t.valor_adquisicion_eur), pdfNum(t.valor_transmision_usd), pdfNum(t.valor_transmision_eur),
      pdfGp(t.gp_eur)], "total"));
    // Las fechas, con las mismas palabras que el Excel.
    bloques.push(pdfTabla("pdf-transmisiones", ["Activo", ...conOp("Operación"), "Tipo",
      permuta ? "Recibido el" : "Comprado el", permuta ? "Entregado el" : "Vendido el", "Cantidad",
      "Valor de adquisición USD", "Valor de adquisición EUR", "Valor de transmisión USD", "Valor de transmisión EUR",
      "Ganancia o pérdida EUR"], permuta ? 5 : 4,
    // Con sitio para «Ganancia o pérdida» y para la cantidad
    // («123.456,123456» tiene que caber).
    [...(permuta ? [1.1, 1.6] : [2.7]), 1.8, 1.65, 1.65, 2, 1.65, 1.65, 1.65, 1.65, 1.55], filas));
    if (hayCanje) bloques.push({ tipo: "nota", texto: NOTA_CANJE_INFORME });
    if (haySupuesto) bloques.push({ tipo: "nota", texto: NOTA_COSTE_SUPUESTO });
  }

  // Pools de liquidez y ganancias sin transmisión, solo si las hay.
  let n = 5;
  for (const [clave, titulo] of [["otros_elementos", "Pools de liquidez"],
    ["ganancias_sin_transmision", "Ganancias sin transmisión (airdrops, regalos, referidos)"]]) {
    const tabla = pyGet(detalle, clave, null);
    if (!pyVerdad(tabla)) continue;
    pdfTituloTabla(bloques, n++ + ". " + titulo, tabla, null);
    // Los pools llevan también los dos valores de la casilla.
    const valores = fiscTiene(tabla.total, "valor_transmision_eur");
    const fila = (inicio, f, tipo = null) => pdfFila(inicio.concat(
      valores ? [pdfNum(f.valor_transmision_eur), pdfNum(f.valor_adquisicion_eur)] : [],
      [pdfGp(f.importe_usd), pdfGp(f.importe_eur)]), tipo);
    const filas = tabla.filas.map(f => fila([pdFechaEs(f.fecha), f.concepto, f.token, pdfCantidad(f.cantidad)], f));
    filas.push(fila(["Total", "", "", ""], tabla.total, "total"));
    bloques.push(pdfTabla("pdf-otras", ["Fecha", "Concepto", "Token", "Cantidad"].concat(valores
      ? ["Valor de transmisión EUR", "Valor de adquisición EUR", "Ganancia o pérdida USD", "Ganancia o pérdida EUR"]
      : ["Importe USD", "Importe EUR"]), 3,
    valores ? [1.8, 3.6, 1.6, 2.2, 2.2, 2.2, 2.2, 2.2] : [1.8, 5.2, 2, 3, 2.5, 2.5], filas));
  }
  return bloques;
}

/* ---------- IV. Avisos y V. Textos ---------- */

function pdfAvisos(informe) {
  const bloques = [{ tipo: "seccion", texto: "IV. Avisos y datos a revisar", pagina: true }];
  if (!informe.avisos.length) {
    bloques.push({ tipo: "parrafo", texto: "Ninguno." });
    return bloques;
  }
  bloques.push(pdfTabla("pdf-avisos", ["Fecha", "Tipo", "Concepto", "Detalle"], 4, [1.9, 1.7, 3.6, 9.8],
    informe.avisos.map(a => pdfFila([pdFechaEs(a.fecha), a.tipo === "revisar" ? "A revisar" : "Nota",
      excelTexto(a.concepto), excelFrase(a.detalle)]))));
  return bloques;
}

function pdfTextos(informe) {
  return [{ tipo: "seccion", texto: "V. Descargo de responsabilidad, glosario y nota metodológica" },
    { tipo: "subtitulo", texto: "Descargo de responsabilidad" },
    { tipo: "parrafo", texto: informe.descargo },
    { tipo: "subtitulo", texto: "Glosario" },
    ...informe.glosario.map(t => ({ tipo: "definicion", termino: t.termino, texto: t.definicion })),
    { tipo: "subtitulo", texto: "Nota metodológica" },
    ...informe.nota_metodologica.map(p => ({ tipo: "definicion", termino: p.titulo, texto: excelTexto(p.texto) }))];
}

/* ---------- El informe entero ---------- */

/* El informe de un año como lista de bloques: { tipo: "titulo" |
   "seccion" (pagina: empieza hoja nueva) | "subtitulo" | "nota" |
   "parrafo" | "definicion" | "aviso" | "tabla", ... }. ahora: la hora de
   «Generado el»; hasta: el de fiHastaCuando (sin él, no se avisa de la
   sincronización). Solo lee. */
function pdfBloques(informe, ahora = new Date(), hasta = null) {
  const aviso = fiAvisoSincronizacion(hasta);
  return [{ tipo: "titulo", texto: "Informe fiscal · Ejercicio " + informe.ejercicio },
    pdfCabecera(informe, ahora),
    ...(aviso ? [{ tipo: "aviso", texto: aviso }] : []),
    { tipo: "seccion", texto: "I. Resumen del ejercicio" },
    { tipo: "nota", texto: NOTA_RESUMEN_INFORME },
    pdfResumen(informe),
    ...pdfInversiones(informe),
    ...pdfDetalle(informe),
    ...pdfAvisos(informe),
    ...pdfTextos(informe)];
}

/* Una celda: texto y, debajo, su nota y su aviso. Una
   cifra nunca se parte («1.» y «000,000001» en dos líneas parecerían dos
   cifras); si es larga, va en letra más pequeña. */
function pdfHtmlCelda(c, cifra) {
  if (c === null || typeof c !== "object") {
    // El « **» no cuenta (con él, 1.500,00 saldría en pequeño).
    return cifra && String(c).replace(/ \*\*$/, "").length > 10 ? '<span class="pdf-larga">' + ccEsc(c) + "</span>" : ccEsc(c);
  }
  let html = ccEsc(c.texto);
  if (c.nota) html += '<span class="pdf-nota-celda">' + ccEsc(c.nota) + "</span>";
  if (c.aviso) html += '<span class="pdf-aviso-celda">' + ccEsc(c.aviso) + "</span>";
  return html;
}

function pdfHtmlTabla(b) {
  const num = i => (b.columnas[i][1] ? ' class="num"' : "");
  const cabecera = b.columnas.some(([t]) => t)
    ? "<thead><tr>" + b.columnas.map(([t], i) => "<th" + num(i) + ">" + ccEsc(t) + "</th>").join("") + "</tr></thead>" : "";
  const filas = b.filas.map(f => {
    const celdas = [];
    for (let i = 0; i < f.celdas.length; i += i === 0 ? f.span : 1) {
      const span = i === 0 && f.span > 1 ? ' colspan="' + f.span + '"' : "";
      celdas.push("<td" + num(i) + span + ">" + pdfHtmlCelda(f.celdas[i], b.columnas[i][1]) + "</td>");
    }
    return "<tr" + (f.tipo ? ' class="' + f.tipo + '"' : "") + ">" + celdas.join("") + "</tr>";
  }).join("");
  const total = b.columnas.reduce((s, c) => s + c[2], 0);
  const anchos = "<colgroup>" + b.columnas.map(c => '<col style="width:' + (100 * c[2] / total).toFixed(2) + '%">').join("") + "</colgroup>";
  return '<table class="' + b.clase + '">' + anchos + cabecera + "<tbody>" + filas + "</tbody></table>";
}

function pdfHtmlBloque(b) {
  switch (b.tipo) {
    case "titulo": return "<h1>" + ccEsc(b.texto) + "</h1>";
    case "seccion": return "<h2" + (b.pagina ? ' class="pagina"' : "") + ">" + ccEsc(b.texto) + "</h2>";
    case "subtitulo": return "<h3>" + ccEsc(b.texto) + "</h3>";
    case "nota": return '<p class="pdf-nota">' + ccEsc(b.texto) + "</p>";
    case "aviso": return '<p class="pdf-aviso">' + ccEsc(b.texto) + "</p>";
    case "definicion": return '<p class="pdf-def"><b>' + ccEsc(b.termino) + ":</b> " + ccEsc(b.texto) + "</p>";
    case "tabla": return pdfHtmlTabla(b);
    default: return "<p>" + ccEsc(b.texto) + "</p>";
  }
}

/* Estilos de la hoja: A4 vertical, en claro, y en el pie la wallet, la
   fuente de los tipos de cambio, la hora y el número de página. */
function pdfEstilos(informe, ahora) {
  // Dos líneas: «\A» es el salto de línea de CSS. Sin wallet, sin «Wallet ·».
  const wallet = pyO(informe.cabecera.wallet, "");
  const pie = pdfEscCss((wallet ? "Wallet " + wallet + " · " : "") + "Tipos de cambio: BCE, serie EXR/D.USD.EUR.SP00.A · Generado el " +
    pdfAhora(ahora)) + "\\A " + pdfEscCss(PDF_PIE);
  return [
    // Las cajas de arriba, vacías: si no, con «Encabezado y pie de página»
    // marcado (viene así), Chrome pone la fecha y el título en cada hoja.
    '@page{size:A4 portrait;margin:16mm 14mm 20mm;' +
      '@top-left{content:""}@top-center{content:""}@top-right{content:""}' +
      '@bottom-left{content:"' + pie + '";white-space:pre;font:6.5pt Arial,Helvetica,sans-serif;color:#777}' +
      '@bottom-right{content:"Página " counter(page) " de " counter(pages);font:6.5pt Arial,Helvetica,sans-serif;color:#777}}',
    "*{box-sizing:border-box}",
    "html{-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    "body{margin:0;background:#fff;color:#111;font:8.5pt/1.35 Arial,Helvetica,sans-serif}",
    "h1{font-size:14pt;text-align:center;margin:0 0 10px}",
    "h2{font-size:11pt;margin:16px 0 6px;break-after:avoid}",
    "h2.pagina{break-before:page;margin-top:0}",
    "h3{font-size:9.5pt;margin:14px 0 2px;break-after:avoid}",
    "p{margin:0 0 6px}",
    ".pdf-nota{font-size:7pt;color:#444;margin-bottom:5px;break-after:avoid}",
    ".pdf-def{margin-bottom:4px}",
    ".pdf-aviso{color:#b00020;font-weight:bold}",
    "table{width:100%;table-layout:fixed;border-collapse:collapse;margin:4px 0 10px;font-size:7pt}",
    "th,td{border:0.5pt solid #999;padding:2px 3px;vertical-align:top;text-align:left;overflow-wrap:anywhere}",
    "thead th{background:#e3e3e3;font-weight:bold;overflow-wrap:normal}",
    "tr{break-inside:avoid}",
    ".num{text-align:right}td.num{white-space:nowrap;overflow-wrap:normal}.pdf-larga{font-size:6pt}",
    "tr.grupo td{background:#dbe7f4;font-weight:bold}",
    "tr.subtotal td,tr.total td{font-weight:bold;background:#f3f3f3}",
    ".pdf-nota-celda,.pdf-aviso-celda{display:block;font-size:6.5pt;color:#555}",
    ".pdf-aviso-celda{color:#b00020}",
    "table.pdf-cabecera,table.pdf-resumen,table.pdf-inversiones{font-size:8pt}",
    "table.pdf-cabecera td:first-child{background:#f3f3f3;font-weight:bold}",
  ].join("\n");
}

/* La página entera del informe (con su <title>: el nombre que propone
   «Guardar como PDF»). Solo lee. */
function pdfHtml(informe, ahora = new Date(), hasta = null) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' +
    ccEsc(pdfTitulo(informe)) + "</title><style>" + pdfEstilos(informe, ahora) + "</style></head><body>" +
    pdfBloques(informe, ahora, hasta).map(pdfHtmlBloque).join("\n") + "</body></html>";
}
function pdfTitulo(informe) { return "Informe fiscal " + informe.ejercicio; }

/* Imprime el informe (el navegador ofrece «Guardar como PDF»): lo pinta
   en un marco oculto y abre el diálogo de imprimir de ese marco. La
   pestaña abierta no cambia; solo el título de la ventana mientras el
   diálogo está abierto, porque Chrome propone ese nombre para el PDF.
   Chrome se para en print() hasta cerrar el diálogo: al volver, el título
   es el de antes y el foco vuelve a donde estaba (no en la página ni
   dentro del marco). El marco se quita al terminar
   de imprimir (afterprint) o, si el navegador no lo avisa, en la
   siguiente impresión. */
function pdfImprimir(informe, ahora = new Date(), hasta = null) {
  const viejo = document.getElementById("pdfMarco");
  if (viejo) viejo.remove();
  const marco = document.createElement("iframe");
  marco.id = "pdfMarco";
  const nombre = pdfTitulo(informe);
  marco.title = nombre;
  marco.setAttribute("aria-hidden", "true");
  marco.tabIndex = -1;
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(marco);
  const doc = marco.contentDocument;
  doc.open();
  doc.write(pdfHtml(informe, ahora, hasta));
  doc.close();
  // Después de que el navegador termine con el marco.
  marco.contentWindow.addEventListener("afterprint", () => setTimeout(() => marco.remove(), 0), { once: true });
  const titulo = document.title, foco = document.activeElement;
  document.title = nombre;
  try {
    marco.contentWindow.focus();
    marco.contentWindow.print();
  } catch (e) {
    marco.remove();
    throw e;
  } finally {
    document.title = titulo;
    if (foco && foco !== document.body && typeof foco.focus === "function") foco.focus({ preventScroll: true });
    else window.focus();
  }
}
