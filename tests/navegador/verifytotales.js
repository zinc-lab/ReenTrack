/* Verificación headless de «📄 Solo totales (CSV)» (📤) y del país de cada
 * inmueble (🚀), js/30: Chrome local + puppeteer-core. DATOS 100 %
 * SINTÉTICOS: los de verifyfiscal1 (fiscal1_comun.js). Capturas
 * cap_totales_paises.png y cap_totales_exportar.png.
 *
 *  S1) 🚀: sin datos, sin el apartado del país; con ellos, «🌍 País del token»
 *      con cada inmueble y su botón «Elegir país», todos del mismo ancho.
 *  S2) el menú: con el buscador («us», «españa», «Es» + flechas), con el
 *      ratón, «Quitar el país», Esc, abrir y cerrar; los usados arriba con
 *      una línea, unas 6 filas; el resumen y los botones del mismo ancho.
 *  S3) 🧾: el historial dice «Prueba Cáceres 8 (US)».
 *  S4) 📤: el botón junto al Excel; si 🧾 no puede calcular, dice por qué y
 *      no guarda nada.
 *  S5) el archivo: diálogo con su nombre (reentrack-totales_AAAA-MM-DD.csv)
 *      y su tipo, UTF-8 sin BOM, la cabecera exacta y el mismo texto que
 *      totCsv(totFilas(…)); si el diálogo no se puede abrir, se descarga.
 *  S6) 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytotales.js
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

/* En la página: los avisos y lo que se guarda o descarga. */
function espiar() {
  window.__vistos = { toasts: [], guardados: [], descargas: [], dialogos: 0 };
  const v = window.__vistos;
  const toastDe = window.toast;
  window.toast = function (msg, tipo) { v.toasts.push([tipo, msg]); return toastDe.apply(this, arguments); };
  window.descargarBlob = (nombre, blob) => v.descargas.push({ nombre, tamano: blob.size });
  window.__picker = "guardar";
  window.showSaveFilePicker = async opciones => {
    v.dialogos++;
    if (window.__picker === "caducado") throw new DOMException("Must be handling a user gesture", "SecurityError");
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

  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  /* ============ S1) 🚀 ============ */
  const sinDatos = await page.evaluate(() => document.getElementById("arrPaises").hidden);
  await page.evaluate(montarFiscal1);
  await page.evaluate(espiar);
  await page.evaluate(() => {
    ejecutarClasificacion({ silencioso: true });
    apuntarSincronizacion(state.cache, true, new Date("2026-05-20T12:00:00Z"));
    renderPanel();
    arrPintar();
  });
  await esperar(300);
  const s1 = await page.evaluate(() => {
    const caja = document.getElementById("arrPaises");
    return { visible: !caja.hidden, titulo: caja.querySelector("summary").textContent,
      campos: [...caja.querySelectorAll("button.arr-pais")].map(b => [b.previousElementSibling.textContent, b.textContent, b.getAttribute("aria-haspopup")]),
      resumen: document.getElementById("arrPaisesResumen").textContent };
  });
  assert("S1 -> sin datos, sin el apartado del país", sinDatos);
  assert("S1 -> con datos, «🌍 País del token (opcional)» con cada inmueble, su botón «Elegir país» y «3 sin país»",
    s1.visible && /País del token/.test(s1.titulo) && /opcional/.test(s1.titulo) && s1.resumen === "3 sin país" &&
    JSON.stringify(s1.campos) === JSON.stringify([["Prueba Cáceres 8", "Elegir país", "listbox"], ["Prueba Fondo 1", "Elegir país", "listbox"],
      ["Prueba Sevilla 2", "Elegir país", "listbox"]]), s1);

  /* ============ S2) el menú ============ */
  await page.evaluate(() => { document.getElementById("arrPaises").open = true; });
  const menu = () => page.evaluate(() => {
    const m = document.getElementById("arrPaisesMenu"), ul = document.getElementById("arrPaisesOpciones"), li = ul.querySelector("li");
    const nombre = l => l.textContent.slice(2);
    return { abierto: !m.hidden, bajo: m.previousElementSibling && m.previousElementSibling.id, foco: document.activeElement.id,
      n: ul.querySelectorAll("li[data-pais]").length, primeros: [...ul.querySelectorAll("li")].slice(0, 3).map(nombre),
      linea: (l => l && nombre(l))(ul.querySelector(".arr-pais-linea")), filas: li ? Math.round(ul.clientHeight / li.offsetHeight) : 0,
      marcado: (l => l && nombre(l))(ul.querySelector('[aria-selected="true"]')), conMarca: [...ul.querySelectorAll("li svg")].map(s => s.parentElement.dataset.pais),
      quitar: !document.getElementById("arrPaisQuitar").hidden, nada: !!ul.querySelector(".arr-pais-nada") };
  });
  const botones = () => page.evaluate(() => ({ textos: [...document.querySelectorAll("button.arr-pais")].map(b => b.textContent),
    anchos: [...document.querySelectorAll("button.arr-pais")].map(b => b.offsetWidth), resumen: document.getElementById("arrPaisesResumen").textContent,
    guardado: JSON.parse(JSON.stringify(state.cache.paises_inmuebles || {})), foco: document.activeElement.id,
    abiertos: [...document.querySelectorAll("button.arr-pais")].filter(b => b.getAttribute("aria-expanded") === "true").length }));
  await page.click("#arrPais0");
  let m = await menu();
  assert("S2 -> pulsar «Elegir país»: el menú bajo ese botón, el foco en el buscador, los 249 sin línea ni marca y sin «Quitar el país»",
    m.abierto && m.bajo === "arrPais0" && m.foco === "arrPaisBusca" && m.n === 249 && !m.linea && !m.marcado && !m.quitar, m);
  await page.keyboard.type("us");
  m = await menu();
  assert("S2 -> «us»: marcado Estados Unidos (su código)", m.marcado === "Estados Unidos", m);
  await page.keyboard.press("Enter");
  await esperar(200);
  let b = await botones();
  assert("S2 -> Intro: «US Estados Unidos» en el botón y en tu archivo; el menú cerrado y el foco en el botón; el resumen",
    b.textos[0] === "USEstados Unidos" && b.guardado["Prueba Cáceres 8"] === "US" && b.foco === "arrPais0" && b.abiertos === 0 &&
    b.resumen === "1 Estados Unidos · 2 sin país" && (await menu()).abierto === false, b);
  await page.click("#arrPais2");
  await page.keyboard.type("españa");
  await page.keyboard.press("Enter");
  await esperar(200);
  await page.click("#arrPais1");
  m = await menu();
  assert("S2 -> al abrir otro: España y Estados Unidos arriba, la línea antes de Afganistán, 6 filas a la vista",
    JSON.stringify(m.primeros) === JSON.stringify(["España", "Estados Unidos", "Afganistán"]) && m.linea === "Afganistán" && m.filas === 6, m);
  await page.keyboard.type("Es");
  m = await menu();
  assert("S2 -> «Es»: solo los que empiezan así, los usados primero y España marcada", m.n > 2 && m.n < 10 &&
    JSON.stringify(m.primeros.slice(0, 2)) === JSON.stringify(["España", "Estados Unidos"]) && m.marcado === "España", m);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await esperar(200);
  b = await botones();
  assert("S2 -> flecha abajo e Intro: Estados Unidos", b.guardado["Prueba Fondo 1"] === "US" && b.textos[1] === "USEstados Unidos", b);
  await page.click("#arrPais1");
  m = await menu();
  assert("S2 -> al volver a abrirlo: marcado y con la marca el que tiene, y «Quitar el país»",
    m.marcado === "Estados Unidos" && JSON.stringify(m.conMarca) === '["US"]' && m.quitar, m);
  await page.keyboard.type("Alem");
  await page.click("#arrPaisesOpciones li[data-pais='DE']");
  await esperar(200);
  b = await botones();
  assert("S2 -> con el ratón: Alemania", b.guardado["Prueba Fondo 1"] === "DE" && b.textos[1] === "DEAlemania" && b.abiertos === 0, b);
  await page.click("#arrPais1");
  await page.keyboard.type("Narnia");
  m = await menu();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await esperar(200);
  b = await botones();
  assert("S2 -> «Narnia»: «Ningún país», Intro no cambia nada y Esc cierra y vuelve al botón",
    m.nada && m.n === 0 && b.guardado["Prueba Fondo 1"] === "DE" && b.foco === "arrPais1" && b.abiertos === 0 && !(await menu()).abierto, [m, b]);
  await page.click("#arrPais1");
  await page.click("#arrPaisQuitar");
  await esperar(200);
  b = await botones();
  assert("S2 -> «Quitar el país»: «Elegir país» y fuera de tu archivo", !("Prueba Fondo 1" in b.guardado) && b.textos[1] === "Elegir país", b);
  await page.click("#arrPais1");
  await page.click("#arrPais1");
  const dos = await menu();
  await page.click("#arrPais1");
  await page.click("#arrPaises > p.help");
  assert("S2 -> pulsar dos veces el botón lo abre y lo cierra; pulsar fuera lo cierra", !dos.abierto && !(await menu()).abierto && (await botones()).abiertos === 0, dos);
  await page.click("#arrPais2");
  await page.keyboard.type("república dom");
  await page.keyboard.press("Enter");
  await esperar(200);
  b = await botones();
  assert("S2 -> todos los botones del mismo ancho, también con un nombre largo", b.guardado["Prueba Sevilla 2"] === "DO" &&
    new Set(b.anchos).size === 1 && b.anchos[0] > 150, b);
  await page.evaluate(() => { for (const n of ["Prueba Fondo 1", "Prueba Sevilla 2"]) totPonerPais(state.cache, n, ""); arrPintar(); });
  const caja = await page.$("#arrPaises");
  await caja.screenshot({ path: path.join(OUT, "cap_totales_paises.png") });

  /* ============ S3) 🧾 ============ */
  await page.evaluate(() => { location.hash = "#fiscal"; });
  await esperar(500);
  const s3 = await page.evaluate(() => document.getElementById("view-fiscal").textContent);
  assert("S3 -> 🧾: el historial dice «Prueba Cáceres 8 (US)» (y los demás, sin país)", /Prueba Cáceres 8 \(US\)/.test(s3) && !/Prueba Fondo 1 \(/.test(s3));

  /* ============ S4) 📤 sin cálculo ============ */
  await page.evaluate(() => { location.hash = "#exportar"; });
  await esperar(400);
  const s4 = await page.evaluate(() => {
    const b = document.getElementById("btnTotales"), e = document.getElementById("btnExcel");
    return { boton: b && b.textContent, junto: !!b && b.parentElement === e.parentElement,
      ayuda: document.querySelector('section[aria-labelledby="exTitInformes"] .help').textContent };
  });
  assert("S4 -> «📄 Solo totales (CSV)» junto al Excel, con su línea de ayuda", s4.boton === "📄 Solo totales (CSV)" && s4.junto && /Solo totales/.test(s4.ayuda), s4);
  const wallet = await page.evaluate(() => state.config.wallet);
  await page.evaluate(() => { window.__vistos.toasts = []; document.getElementById("cfgWallet").value = "0x" + "22".repeat(20); });
  await page.evaluate(() => document.getElementById("btnTotales").click());
  await esperar(200);
  let v = await page.evaluate(() => JSON.parse(JSON.stringify(window.__vistos)));
  assert("S4 -> si 🧾 no puede calcular (otra wallet), dice por qué y no guarda nada",
    v.toasts.length === 1 && v.toasts[0][0] === "warn" && /Revisa tus datos en 🚀/.test(v.toasts[0][1]) && v.dialogos === 0 && !v.descargas.length, v.toasts);
  await page.evaluate(w => { document.getElementById("cfgWallet").value = w; leerConfigDesdeFormulario(); }, wallet);

  /* ============ S5) el archivo ============ */
  await page.evaluate(() => { window.__vistos.toasts = []; });
  const s5 = await page.evaluate(async () => {
    document.getElementById("btnTotales").click();
    await new Promise(r => setTimeout(r, 500));
    const g = window.__vistos.guardados[0];
    const receta = totCsv(totFilas(fiResultado(), state.registros, state.cache));
    return { g: g && { nombre: g.opciones.suggestedName, tipos: g.opciones.types }, bytes: g && g.bytes, receta, toasts: window.__vistos.toasts.slice() };
  });
  const texto = Buffer.from(s5.bytes || []).toString("utf8");
  const hoy = new Date(), p = n => String(n).padStart(2, "0");
  const nombre = "reentrack-totales_" + hoy.getFullYear() + "-" + p(hoy.getMonth() + 1) + "-" + p(hoy.getDate()) + ".csv";
  assert("S5 -> el diálogo con su nombre y su tipo (CSV)", s5.g && s5.g.nombre === nombre && JSON.stringify(s5.g.tipos).includes("text/csv"), s5.g);
  assert("S5 -> UTF-8 sin BOM, con la cabecera exacta", s5.bytes && s5.bytes[0] !== 0xEF &&
    texto.split("\n")[0] === "fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo");
  assert("S5 -> el mismo texto que totCsv(totFilas(…)), con el país apuntado", texto === s5.receta && /,Prueba Cáceres 8,US,/.test(texto), texto.slice(0, 300));
  assert("S5 -> dice dónde se guardó", s5.toasts.some(([t, m]) => t === "ok" && m.includes("CSV guardado en " + nombre)), s5.toasts);
  await page.evaluate(() => { window.__picker = "caducado"; window.__vistos.descargas = []; });
  await page.evaluate(() => document.getElementById("btnTotales").click());
  await esperar(400);
  v = await page.evaluate(() => JSON.parse(JSON.stringify(window.__vistos)));
  assert("S5 -> si el diálogo no se puede abrir, se descarga", v.descargas.length === 1 && v.descargas[0].nombre === nombre, v.descargas);
  const seccion = await page.$('section[aria-labelledby="exTitInformes"]');
  await seccion.screenshot({ path: path.join(OUT, "cap_totales_exportar.png") });

  /* ============ S6) ============ */
  assert("S6 -> 0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("FALLO del arnés:", e); process.exit(1); });
