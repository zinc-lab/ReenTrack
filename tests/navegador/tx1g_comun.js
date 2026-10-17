/* Comprobaciones del recuento y el spam de 📒 Transacciones, comunes a verifytx1g.js
 * (datos sintéticos) y verifytx1g_real.js (tus datos, solo en memoria).
 *
 * Con la página ya en #transacciones, clasificada y con escribirArchivoNavegador
 * capturado en window.__writes, comprueba:
 *  G1) sin chips de categoría; el triaje, sin «Spam» ni total; cada
 *      opción del selector de categoría con su número, «X (n)».
 *  G2) el recuento dice «N movimientos» (sin el spam ni los cobros que
 *      van dentro de su venta) y, al lado, «👁 Ver spam (n)»; con un filtro,
 *      «X de N movimientos».
 *  G3) fuera del modo spam, el spam no sale ni al buscarlo.
 *  G4) «Ver spam» enseña SOLO el spam; el recuento, en negrita,
 *      «N movimientos de spam»; debajo, un motivo por línea (texto, sin
 *      botones a la vista, aunque se pulsan) que suman N y coinciden con txResumenSpam; cada fila lleva
 *      su motivo en la ayuda de la operación; ni triaje ni nota de compras.
 *  G5) «✖ Salir del spam» vuelve al libro (el foco, en «Ver spam»); elegir
 *      «Spam» en el selector hace lo mismo que «Ver spam».
 *  G6) la burbuja del importe de un rendimiento, tres líneas de datos;
 *      la de la cabecera, sin explicaciones fiscales.
 *  G7) la nota de compras bancarias, corta y sin ⓘ (si las hay).
 *  G8) nada cambia por dentro: misma huella de registros y 0 escrituras.
 * Devuelve { motivos } (el resumen leído en G4) para el arnés que llama.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarTx1g(page, assert, opts = {}) {
  const pref = opts.prefijo || "";
  const huella = () => page.evaluate(() => JSON.stringify(state.registros));
  const huellaAntes = await huella();
  const escriturasAntes = await page.evaluate(() => window.__writes.length);
  const datos = await page.evaluate(() => {
    const rel = txRelacionesVinculos(state.registros, ((state.cache || {}).pagos_diferidos || {}).ventas || []);
    const spam = state.registros.filter(r => r.categoria === "SPAM");
    return { n: state.registros.length, spam: spam.length,
      plegados: state.registros.filter(r => txEsCobroPlegado(r, rel)).length,
      nombreSpam: (spam.find(r => r.token && r.token.trim().length > 3) || {}).token || "",
      bancarias: state.registros.filter(txEsCompraBancaria).length };
  });
  const N = datos.n - datos.spam - datos.plegados;
  const leer = () => page.evaluate(() => ({
    filas: document.querySelectorAll("#txCuerpo tr.tx-fila").length,
    spamFilas: document.querySelectorAll("#txCuerpo tr.tx-fila.tx-c-SPAM").length,
    rec: document.getElementById("txRecuento").textContent,
    negrita: (document.querySelector("#txRecuento b") || {}).textContent || "",
    cat: document.getElementById("txFiltroCategoria").value,
    kpis: [...document.querySelectorAll("#txTriaje .tx-kpi[data-grupo]")].map(b => b.getAttribute("data-grupo")),
    triaje: document.getElementById("txTriaje").textContent,
    motivos: [...document.querySelectorAll("#txMotivosSpam li")].map(l => l.textContent),
    motivosVisibles: !document.getElementById("txMotivosSpam").hidden,
    /* Cada motivo es un botón que parece texto (filtra ese motivo): sin negritas ni bordes. */
    botonesMotivos: document.querySelectorAll("#txMotivosSpam b").length + [...document.querySelectorAll("#txMotivosSpam button")]
      .filter(b => getComputedStyle(b).borderTopStyle !== "none" || getComputedStyle(b).backgroundColor !== "rgba(0, 0, 0, 0)").length,
    notaCoste: !document.getElementById("txNotaCoste").hidden,
  }));

  /* ============ G1) sin chips; triaje y selector ============ */
  let e = await leer();
  const g1 = await page.evaluate(() => ({
    chips: !!document.querySelector("#txChips, .tx-chip"),
    opciones: [...document.querySelectorAll("#txFiltroCategoria option")].filter(o => o.value)
      .map(o => ({ v: o.value, t: o.textContent, n: +((o.textContent.match(/\((\d+)\)$/) || [0, -1])[1]) })),
  }));
  assert(pref + "G1 -> sin chips de categoría; el triaje: A revisar, Con efecto fiscal y Neutros, sin «Spam» ni total",
    !g1.chips && JSON.stringify(e.kpis) === '["revisar","fiscal","neutro"]' && !/spam|registros|movimientos/i.test(e.triaje), { chips: g1.chips, e });
  assert(pref + "G1 -> cada opción del selector con su número, y suman " + (datos.n - datos.plegados),
    g1.opciones.length > 0 && g1.opciones.every(o => o.n >= 0) &&
    g1.opciones.reduce((a, o) => a + o.n, 0) === datos.n - datos.plegados, g1.opciones);

  /* ============ G2) recuento ============ */
  assert(pref + "G2 -> el recuento: «" + N + " movimientos» y «👁 Ver spam (" + datos.spam + ")»",
    e.filas === N && e.rec === N + " movimientos 👁 Ver spam (" + datos.spam + ")" && !e.negrita, e.rec);
  const fiscal = await page.evaluate(() => +document.querySelector('#txTriaje [data-grupo="fiscal"] b').textContent);
  await page.click('#txTriaje [data-grupo="fiscal"]');
  await esperar(250);
  e = await leer();
  assert(pref + "G2 -> con un filtro: «" + fiscal + " de " + N + " movimientos»", e.filas === fiscal && e.rec.startsWith(fiscal + " de " + N + " movimientos"), e.rec);
  await page.click('#txTriaje [data-grupo="fiscal"]');
  await esperar(250);

  /* ============ G3) el spam no sale al buscar ============ */
  if (datos.nombreSpam) {
    await page.evaluate(q => { const el = document.getElementById("txBuscar"); el.value = q; el.dispatchEvent(new Event("input", { bubbles: true })); },
      datos.nombreSpam);
    await esperar(400);
    e = await leer();
    assert(pref + "G3 -> buscar el nombre de un spam («" + datos.nombreSpam.slice(0, 24) + "») fuera de su modo no lo enseña", e.spamFilas === 0, e);
    await page.click("#txLimpiar");
    await esperar(250);
  }

  /* ============ G4) el modo spam ============ */
  await page.click("#txRecuento [data-ver-spam]");
  await esperar(300);
  e = await leer();
  const g4 = await page.evaluate(() => {
    const ctx = txContextoSpam(state.cache);
    const esperado = txResumenSpam(state.registros.filter(r => r.categoria === "SPAM"), ctx).map(m => m.n + " " + m.etiqueta);
    const porClave = new Map(state.registros.map(r => [r.clave, r]));
    const sinMotivo = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].filter(tr => {
      const r = porClave.get(tr.getAttribute("data-clave"));
      return tr.querySelector(".tx-op").title !== txEtiquetaMotivoSpam(txMotivoSpam(r, ctx));
    }).length;
    return { esperado, sinMotivo, foco: document.activeElement && document.activeElement.hasAttribute("data-salir-spam") };
  });
  assert(pref + "G4 -> «Ver spam»: solo las " + datos.spam + " filas de spam y «Spam» en el selector",
    e.filas === datos.spam && e.spamFilas === datos.spam && e.cat === "SPAM", e);
  assert(pref + "G4 -> el recuento en negrita, «" + datos.spam + " movimientos de spam», con «✖ Salir del spam» (con el foco)",
    e.negrita === datos.spam + " movimientos de spam" && e.rec.includes("✖ Salir del spam") && g4.foco, e);
  assert(pref + "G4 -> debajo, un motivo por línea, solo texto, que suman " + datos.spam + " y son los de txResumenSpam",
    e.motivosVisibles && e.botonesMotivos === 0 && JSON.stringify(e.motivos) === JSON.stringify(g4.esperado) &&
    e.motivos.reduce((a, m) => a + parseInt(m, 10), 0) === datos.spam, { leidos: e.motivos, esperado: g4.esperado });
  assert(pref + "G4 -> cada fila lleva su motivo en la ayuda de la operación", g4.sinMotivo === 0, g4.sinMotivo);
  assert(pref + "G4 -> en el modo spam no hay triaje ni nota de compras", e.kpis.length === 0 && !e.notaCoste, e);
  if (opts.capSpam) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: opts.capSpam });
  }
  const motivos = e.motivos;

  /* ============ G5) salir, y el selector ============ */
  await page.click("#txRecuento [data-salir-spam]");
  await esperar(300);
  e = await leer();
  const foco = await page.evaluate(() => !!document.activeElement && document.activeElement.hasAttribute("data-ver-spam"));
  assert(pref + "G5 -> «✖ Salir del spam» vuelve al libro (" + N + " filas, sin motivos) y el foco va a «Ver spam»",
    e.filas === N && e.spamFilas === 0 && e.cat === "" && !e.motivosVisibles && e.kpis.length === 3 && foco, e);
  await page.select("#txFiltroCategoria", "SPAM");
  await esperar(300);
  e = await leer();
  assert(pref + "G5 -> elegir «Spam» en el selector es lo mismo que «Ver spam»",
    e.filas === datos.spam && e.motivosVisibles && e.negrita === datos.spam + " movimientos de spam", e);
  await page.select("#txFiltroCategoria", "");
  await esperar(300);

  /* ============ G6) burbujas ============ */
  const g6 = await page.evaluate(() => {
    const b = document.querySelector("#txCuerpo td.tx-importe .tx-ayuda .tx-burbuja");
    const cab = document.querySelector("#txTabla thead .tx-burbuja").textContent;
    return { lineas: b ? b.innerHTML.split("<br>") : null, cab };
  });
  assert(pref + "G6 -> la burbuja del importe de un rendimiento: tres líneas de datos (íntegro, retención y neto)",
    !g6.lineas || (g6.lineas.length === 3 && /^Rendimiento íntegro: [\d.,]+ USD$/.test(g6.lineas[0]) &&
      /^Retención: [\d.,]+ USD$/.test(g6.lineas[1]) && /^Neto: [\d.,]+ USD$/.test(g6.lineas[2])), g6.lineas);
  assert(pref + "G6 -> la burbuja de la cabecera dice qué se ve, sin explicaciones fiscales",
    !/declara|no se resta|va aparte/i.test(g6.cab) && /Entre paréntesis \(\) si se aplicó retención\.$/.test(g6.cab), g6.cab);

  /* ============ G7) nota de compras bancarias ============ */
  const g7 = await page.evaluate(() => {
    const el = document.getElementById("txNotaCoste");
    return { visible: !el.hidden, texto: el.textContent, info: !!el.querySelector(".cc-info") };
  });
  assert(pref + "G7 -> la nota de compras bancarias, corta y sin ⓘ" + (datos.bancarias ? "" : " (no hay: oculta)"),
    datos.bancarias ? g7.visible && !g7.info &&
      /^💶 Compras externas de inmuebles: [\d.,]+ € por token por defecto \(se edita en 🔍 Revisión\)\.$/.test(g7.texto)
      : !g7.visible, g7);

  /* ============ G8) nada cambia por dentro ============ */
  const r8 = await page.evaluate(() => window.__writes.length);
  assert(pref + "G8 -> misma huella de registros y 0 escrituras", (await huella()) === huellaAntes && r8 === escriturasAntes, r8);
  return { motivos };
};
