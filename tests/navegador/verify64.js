/* Verificación headless de los botones del Excel y del informe para la
 * Renta en 📤 Exportar, js/24: Chrome local + puppeteer-core sobre
 * http://localhost:8765. DATOS 100 % SINTÉTICOS: los de verifyfiscal1
 * (fiscal1_comun.js). Captura cap_64_exportar.png.
 *
 *  S1) 📤 Exportar: sin el aviso de «Todavía no» y con los dos botones.
 *  S2) sin la clasificación al día (antes de clasificar, u otra
 *      wallet recién escrita en la config) los dos dicen el motivo de 🧾 y
 *      no hacen nada.
 *  S3) el Excel: el diálogo de guardar con su nombre y su tipo, el libro de
 *      la receta de js/26 byte a byte, los registros de la app sin tocar,
 *      un doble clic abre un diálogo, cancelar no dice nada y, si el
 *      diálogo ya no se puede abrir, se descarga.
 *  S4) el informe: un desplegable con los años de 🧾, que sale solo al
 *      terminar de clasificar, con el último terminado elegido; sale el
 *      informe del año elegido y con el titular recién escrito en la
 *      config. Otra cache vuelve al último terminado.
 *  S5) sin fecha de sincronización, o si la última falló, el
 *      informe lo dice, como 🧾; y 📤 debajo del desplegable.
 *  S6) 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verify64.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const montarFiscal1 = require("./fiscal1_comun");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

/* En la página: apunta los avisos (toast), el informe que se imprimiría
   (Chrome sin ventana no abre el diálogo: el print() del marco apunta su
   página) y lo que se guarda o descarga. */
function espiar() {
  window.__vistos = { toasts: [], informes: [], guardados: [], descargas: [], dialogos: 0 };
  const v = window.__vistos;
  const toastDe = window.toast;
  window.toast = function (msg, tipo) { v.toasts.push([tipo, msg]); return toastDe.apply(this, arguments); };
  const meter = document.body.appendChild;
  document.body.appendChild = function (n) {
    const x = meter.call(this, n);
    if (n.tagName === "IFRAME") n.contentWindow.print = () => v.informes.push(n.contentDocument.documentElement.outerHTML);
    return x;
  };
  window.descargarBlob = (nombre, blob) => v.descargas.push({ nombre, tamano: blob.size });
  window.__picker = "guardar";
  window.showSaveFilePicker = async opciones => {
    v.dialogos++;
    if (window.__picker === "cancelar") throw new DOMException("cancelado", "AbortError");
    if (window.__picker === "caducado") throw new DOMException("Must be handling a user gesture", "SecurityError");
    if (window.__picker === "denegado") throw new DOMException("not allowed", "NotAllowedError");
    await new Promise(r => setTimeout(r, 100));   // el diálogo abierto un rato
    const g = { opciones, bytes: null };
    v.guardados.push(g);
    return { name: opciones.suggestedName, createWritable: async () => ({
      write: async blob => { g.bytes = Array.from(new Uint8Array(await blob.arrayBuffer())); },
      close: async () => {} }) };
  };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });

  await page.goto(BASE + "index.html#exportar", { waitUntil: "networkidle0" });
  await page.evaluate(montarFiscal1);
  await page.evaluate(() => {
    state.config.inversor = { nombre: "Persona de Prueba", nif: "00000000T" };
    volcarConfigAFormulario();
    renderPanel();
  });
  await page.evaluate(espiar);
  await esperar(200);
  const pulsar = id => page.evaluate(id => { document.getElementById(id).click(); }, id);
  const vistos = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__vistos)));
  // Sin la guarda del doble clic del informe, que se prueba aparte.
  const limpiar = () => page.evaluate(() => { for (const k of ["toasts", "informes", "guardados", "descargas"]) window.__vistos[k] = []; window.__vistos.dialogos = 0; exEstado.imprimiendoInforme = false; });

  /* ============ S1) la sección ============ */
  const s1 = await page.evaluate(() => {
    const s = document.querySelector('section[aria-labelledby="exTitInformes"]');
    return { texto: s ? s.textContent : "", excel: !!document.getElementById("btnExcel"), informe: !!document.getElementById("btnInforme") };
  });
  assert("S1 -> sin «Todavía no» y con los botones del Excel y del informe",
    !/Todavía no/.test(s1.texto) && s1.excel && s1.informe && /Guardar como PDF/.test(s1.texto), s1);

  /* ============ S2) sin la clasificación al día ============ */
  await pulsar("btnExcel"); await pulsar("btnInforme");
  await esperar(150);
  let v = await vistos();
  const motivo = await page.evaluate(() => fiMotivoSinCalculo());
  assert("S2 -> sin clasificar: los dos dicen lo que dice 🧾 y no hacen nada",
    motivo && v.toasts.length === 2 && v.toasts.every(([t, m]) => t === "warn" && m === motivo) &&
    v.dialogos === 0 && v.informes.length === 0, v.toasts);

  const sinDesplegable = await page.evaluate(() => !document.getElementById("exAnio"));
  // La foto de los registros, antes de que 📤 calcule al repintarse (si no,
  // un motor que los cambiara ya los habría cambiado y no se vería).
  await page.evaluate(() => { ejecutarClasificacion({ silencioso: true }); window.__registros = JSON.stringify(state.registros); });
  await esperar(300);
  // Sin nada más: el repintado de 📤 va al terminar de clasificar.
  const desplegable = await page.evaluate(() => {
    const s = document.getElementById("exAnio");
    return s && { opciones: [...s.options].map(o => o.textContent), elegido: s.value, nombre: s.getAttribute("aria-label") };
  });
  await page.evaluate(() => { apuntarSincronizacion(state.cache, true, new Date("2026-05-20T12:00:00Z")); renderPanel(); });
  await esperar(200);

  await limpiar();
  const wallet = await page.evaluate(() => state.config.wallet);
  await page.evaluate(() => { document.getElementById("cfgWallet").value = "0x" + "22".repeat(20); });
  await pulsar("btnInforme"); await pulsar("btnExcel");
  await esperar(150);
  v = await vistos();
  assert("S2 -> A1: con otra wallet recién escrita, tampoco (no sale su nombre con los movimientos de la otra)",
    v.toasts.length === 2 && v.toasts.every(([t, m]) => t === "warn" && /Revisa tus datos en 🚀/.test(m)) &&
    v.dialogos === 0 && v.informes.length === 0, v.toasts);
  // Y al repintar, sin desplegable: no se enseñan los años de la clasificación vieja.
  await page.evaluate(() => actualizarChipEstado());
  await esperar(150);
  assert("S2 -> con la clasificación vieja (otra wallet), 📤 no enseña el desplegable de años",
    await page.evaluate(() => !document.getElementById("exAnio")));
  // Como la copia, el botón deja en la config lo escrito: se vuelve a la de antes.
  await page.evaluate(w => { document.getElementById("cfgWallet").value = w; leerConfigDesdeFormulario(); }, wallet);

  /* ============ S3) el Excel ============ */
  await limpiar();
  const s3 = await page.evaluate(async () => {
    const registrosAntes = window.__registros;
    // La hora del libro, para hacer el de la receta con la misma.
    const blobDe = window.xlsxBlob;
    let ahora = null;
    window.xlsxBlob = function (libro, a) { ahora = a; return blobDe.apply(this, arguments); };
    document.getElementById("btnExcel").click();
    document.getElementById("btnExcel").click();   // doble clic
    const deshabilitado = document.getElementById("btnExcel").disabled;
    await new Promise(r => setTimeout(r, 600));
    window.xlsxBlob = blobDe;
    // La receta de la cabecera de js/26.
    const r = fiCalcular(state.registros, state.cache, state.config, fiHastaCuando(state.cache));
    const receta = Array.from(xlsxBytes(excelLibro(r.registros, r.colas, r.resumen, state.cache, state.config, r.informes,
      ahora, r.hasta, r.cuadre, r), ahora));
    return { receta, registrosIguales: JSON.stringify(state.registros) === registrosAntes, deshabilitado,
      habilitadoDespues: !document.getElementById("btnExcel").disabled };
  });
  v = await vistos();
  const g = v.guardados[0] || {};
  const tipos = g.opciones && g.opciones.types && g.opciones.types[0];
  assert("S3 -> un doble clic abre un solo diálogo, con el botón apagado mientras",
    v.dialogos === 1 && s3.deshabilitado && s3.habilitadoDespues, [v.dialogos, s3.deshabilitado, s3.habilitadoDespues]);
  assert("S3 -> el diálogo propone reental_contabilidad_AAAA-MM-DD_HHMM.xlsx, de tipo Excel",
    g.opciones && /^reental_contabilidad_\d{4}-\d\d-\d\d_\d{4}\.xlsx$/.test(g.opciones.suggestedName) &&
    tipos && JSON.stringify(Object.values(tipos.accept)) === '[[".xlsx"]]', g.opciones);
  assert("S3 -> el archivo es el libro de la receta de js/26, byte a byte",
    g.bytes && g.bytes.length > 1000 && g.bytes.length === s3.receta.length && g.bytes.every((b, i) => b === s3.receta[i]),
    [g.bytes && g.bytes.length, s3.receta.length]);
  assert("S3 -> los registros de la app no cambian", s3.registrosIguales);
  assert("S3 -> dice dónde se guardó", v.toasts.some(([t, m]) => t === "ok" && /^Excel guardado en reental_contabilidad_/.test(m)), v.toasts);

  await limpiar();
  await page.evaluate(() => { window.__picker = "cancelar"; });
  await pulsar("btnExcel");
  await esperar(300);
  v = await vistos();
  assert("S3 -> cancelar el diálogo no dice nada", v.dialogos === 1 && v.toasts.length === 0 && v.descargas.length === 0, v.toasts);

  await limpiar();
  await page.evaluate(() => { window.__picker = "caducado"; });
  await pulsar("btnExcel");
  await esperar(300);
  v = await vistos();
  assert("S3 -> si el diálogo ya no se puede abrir (el cálculo tardó), se descarga y lo dice",
    v.descargas.length === 1 && /^reental_contabilidad_.*\.xlsx$/.test(v.descargas[0].nombre) && v.descargas[0].tamano > 1000 &&
    v.toasts.some(([t, m]) => t === "ok" && /^Excel descargado/.test(m)), v);
  await limpiar();
  await page.evaluate(() => { window.__picker = "denegado"; });
  await pulsar("btnExcel");
  await esperar(300);
  v = await vistos();
  assert("S3 -> con NotAllowedError (el clic «caducó» en otros Chrome), también se descarga",
    v.descargas.length === 1 && v.toasts.some(([t, m]) => t === "ok" && /^Excel descargado/.test(m)), v);
  await page.evaluate(() => { window.__picker = "guardar"; });

  // Con el teclado, el foco vuelve al botón (no a la página).
  const foco = [];
  // («💾 Guardar una copia» está en 🚀, sin repintado: no se mira aquí.)
  for (const id of ["btnExcel"]) {
    await page.focus("#" + id);
    await page.keyboard.press("Enter");
    await esperar(400);
    foco.push(await page.evaluate(() => document.activeElement && document.activeElement.id));
  }
  assert("S3 -> A6: tras «📊 Excel» con el teclado, el foco sigue en su botón", foco[0] === "btnExcel", foco);

  // La copia siempre se descarga, también si el clic «caducó».
  await limpiar();
  await page.evaluate(() => { window.__picker = "caducado"; });
  await page.evaluate(() => exHacerCopia());   // el botón está en 🚀
  await esperar(300);
  v = await vistos();
  assert("S3 -> A8: la copia se descarga y lo dice (ALMACEN-1: reental_cache_…)",
    v.descargas.length === 1 && /^reental_cache_.*\.json$/.test(v.descargas[0].nombre) &&
    v.toasts.some(([t, m]) => t === "ok" && /^Copia descargada/.test(m)), v);
  await page.evaluate(() => { window.__picker = "guardar"; });

  // Si el cálculo falla, 📤 lo dice y no lo repite en cada repintado.
  const a8 = await page.evaluate(async () => {
    const original = window.fiCalcular;
    let veces = 0;
    window.fiCalcular = () => { veces++; throw new Error("fallo de prueba"); };
    fiEstado.memo = null;
    exRenderSeguro(); exRenderSeguro(); exRenderSeguro();
    const texto = (document.querySelector("#exCuerpo .ex-aviso") || {}).textContent || "";
    window.fiCalcular = original;
    fiEstado.memo = null;
    exRenderSeguro();
    return { veces, texto, desplegable: !!document.getElementById("exAnio") };
  });
  assert("S3 -> A8: si el cálculo fiscal falla, 📤 lo dice, lo intenta una vez y luego vuelve",
    a8.veces === 1 && a8.texto === "No se pudo hacer el cálculo fiscal: fallo de prueba" && a8.desplegable, a8);

  /* ============ S4) el informe ============ */
  assert("S4 -> sin clasificar no hay desplegable; al terminar de clasificar sale solo, con los años y el último terminado elegido",
    sinDesplegable && desplegable && JSON.stringify(desplegable.opciones) === '["2024","2025","2026 (en curso)"]' &&
    desplegable.elegido === "2025" && desplegable.nombre === "Año del informe", desplegable);
  const titulo = h => (/<title>([^<]*)<\/title>/.exec(h || "") || [])[1];
  await limpiar();
  await pulsar("btnInforme");
  await esperar(150);
  v = await vistos();
  assert("S4 -> sin tocarlo, el informe del último terminado (2025)", v.informes.length === 1 && titulo(v.informes[0]) === "Informe fiscal 2025",
    v.informes.map(titulo));
  // Se elige 2024 en el desplegable.
  await page.select("#exAnio", "2024");
  await limpiar();
  await pulsar("btnInforme");
  await esperar(150);
  v = await vistos();
  assert("S4 -> el informe es el del año elegido en el desplegable (2024)",
    v.informes.length === 1 && titulo(v.informes[0]) === "Informe fiscal 2024", v.informes.map(titulo));
  // actualizarChipEstado repinta 📤 (renderPanel no: la prueba no probaba nada).
  await page.evaluate(() => actualizarChipEstado());
  await esperar(150);
  assert("S4 -> al repintar, el desplegable sigue en 2024", (await page.evaluate(() => document.getElementById("exAnio").value)) === "2024");
  assert("S4 -> con el titular de la config", (v.informes[0] || "").includes("Persona de Prueba"));
  await page.screenshot({ path: path.join(OUT, "cap_64_exportar.png") });

  await limpiar();
  await page.evaluate(() => { document.getElementById("cfgNombre").value = "Otra Persona"; });
  await pulsar("btnInforme");
  await esperar(150);
  v = await vistos();
  assert("S4 -> A2: con el titular recién escrito (sin guardar), no el de antes",
    v.informes.length === 1 && v.informes[0].includes("Otra Persona") && !v.informes[0].includes("Persona de Prueba"));

  // Un doble clic de verdad imprime una vez (Chrome sin ventana no se para en print()).
  await limpiar();
  await page.click("#btnInforme", { count: 2 });
  await esperar(150);
  v = await vistos();
  assert("S4 -> A7: un doble clic en el informe lo imprime una sola vez", v.informes.length === 1, v.informes.length);
  await esperar(1100);
  await page.click("#btnInforme");
  await esperar(150);
  v = await vistos();
  assert("S4 -> A7: pasado un segundo, se puede volver a imprimir", v.informes.length === 2, v.informes.length);

  /* ============ S5) la sincronización ============ */
  const informeCon = async ultima => {
    await limpiar();
    await page.evaluate(u => { if (u) state.cache.ultima_sincronizacion = u; else delete state.cache.ultima_sincronizacion; }, ultima);
    await pulsar("btnInforme");
    await esperar(150);
    const informe = (await vistos()).informes[0] || "";
    // 📤, al repintar, avisa igual debajo del desplegable.
    await page.evaluate(() => actualizarChipEstado());
    await esperar(150);
    const enExportar = await page.evaluate(() => { const p = document.querySelector("#exCuerpo .ex-aviso"); return p ? p.textContent : ""; });
    return Object.assign(new String(informe), { enExportar });
  };
  const conFecha = await informeCon({ fecha: "2026-05-20", etherscan_fallo: false });
  const sinFecha = await informeCon(null);
  const conFallo = await informeCon({ fecha: "2026-05-20", etherscan_fallo: true });
  assert("S5 -> sincronizada: sin aviso", conFecha && !conFecha.includes('class="pdf-aviso"'));
  assert("S5 -> sin fecha de sincronización: lo dice", sinFecha.includes('<p class="pdf-aviso">Sin fecha de la última sincronización'));
  assert("S5 -> la última falló: hasta qué día están completos",
    conFallo.includes("El último intento de sincronizar falló: datos completos hasta el 20/05/2026."));
  assert("S5 -> Fase 6 A3: 📤 dice lo mismo debajo del desplegable (y nada si está sincronizada)",
    conFecha.enExportar === "" && /^Sin fecha de la última sincronización/.test(sinFecha.enExportar) &&
    conFallo.enExportar === "El último intento de sincronizar falló: datos completos hasta el 20/05/2026.",
    [conFecha.enExportar, sinFecha.enExportar, conFallo.enExportar]);

  /* ============ S5b) otra cache ============ */
  const otra = await page.evaluate(async () => {
    state.cache = structuredClone(state.cache);
    ejecutarClasificacion({ silencioso: true });
    await new Promise(r => setTimeout(r, 300));
    const s = document.getElementById("exAnio");
    return s && s.value;
  });
  assert("S5b -> con otra cache, el desplegable vuelve al último terminado", otra === "2025", otra);

  /* ============ S5c) imprimir 📤 ============ */
  await page.evaluate(() => { location.hash = "#exportar"; actualizarChipEstado(); });
  await esperar(200);
  await page.emulateMediaType("print");
  const impreso = await page.evaluate(() => ["exAnio", "btnInforme"].map(id => {
    const el = document.getElementById(id);
    return el ? getComputedStyle(el.closest(".ex-casilla") || el).display : "falta";
  }));
  await page.emulateMediaType(null);
  // La casilla de la copia no está en 📤 (está en «Tus datos», 🚀).
  assert("S5c -> A10: al imprimir 📤 no sale el desplegable (como los botones)",
    impreso.every(d => d === "none"), impreso);

  /* ============ S6) errores ============ */
  assert("S6 -> 0 errores en la consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
