/* Verificación headless de «📄 Solo totales (CSV)» (📤) y del país de cada
 * inmueble (🚀), js/30: Chrome local + puppeteer-core. DATOS 100 %
 * SINTÉTICOS: los de verifyfiscal1 (fiscal1_comun.js). Capturas
 * cap_totales_paises.png y cap_totales_exportar.png.
 *
 *  S1) 🚀: sin datos, sin el apartado del país; con ellos, «🌍 País del token»
 *      con cada inmueble y su campo.
 *  S2) el desplegable con buscador: «us» o «españa» valen (en el campo,
 *      el nombre; en tu archivo, el código); «Narnia» no (aviso y vuelve
 *      a lo de antes); vacío lo borra; los usados, arriba de la lista.
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
      campos: [...caja.querySelectorAll("input.arr-pais")].map(i => [i.labels[0].textContent, i.value, i.getAttribute("list")]),
      opciones: document.getElementById("arrPaisesOpciones").options.length };
  });
  assert("S1 -> sin datos, sin el apartado del país", sinDatos);
  assert("S1 -> con datos, «🌍 País del token (opcional)» con cada inmueble y su desplegable de 249 países",
    s1.visible && /País del token/.test(s1.titulo) && /opcional/.test(s1.titulo) && s1.opciones === 249 &&
    JSON.stringify(s1.campos) === JSON.stringify([["Prueba Cáceres 8", "", "arrPaisesOpciones"], ["Prueba Fondo 1", "", "arrPaisesOpciones"],
      ["Prueba Sevilla 2", "", "arrPaisesOpciones"]]), s1);

  /* ============ S2) escribir el país ============ */
  const escribir = async (i, texto) => {
    await page.evaluate((i, texto) => {
      const el = document.querySelectorAll("input.arr-pais")[i];
      el.value = texto;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, i, texto);
    await esperar(150);
    return page.evaluate(i => ({ campo: document.querySelectorAll("input.arr-pais")[i].value,
      guardado: JSON.parse(JSON.stringify(state.cache.paises_inmuebles || {})), toasts: window.__vistos.toasts.slice() }), i);
  };
  let s2 = await escribir(0, "us");
  assert("S2 -> «us»: en el campo «Estados Unidos», en tu archivo «US»", s2.campo === "Estados Unidos" && s2.guardado["Prueba Cáceres 8"] === "US", s2);
  s2 = await escribir(1, "Narnia");
  assert("S2 -> «Narnia» no es un país: aviso y el campo vuelve a lo de antes", s2.campo === "" && !("Prueba Fondo 1" in s2.guardado) &&
    s2.toasts.some(([t, m]) => t === "warn" && /Elige un país de la lista/.test(m)), s2);
  s2 = await escribir(2, "españa");
  const arriba = await page.evaluate(() => [...document.getElementById("arrPaisesOpciones").options].slice(0, 3).map(o => o.value));
  assert("S2 -> «españa» por su nombre: «España» y «ES»; en la lista, los usados arriba", s2.campo === "España" && s2.guardado["Prueba Sevilla 2"] === "ES" &&
    JSON.stringify(arriba) === JSON.stringify(["España", "Estados Unidos", "Afganistán"]), [s2.campo, arriba]);
  s2 = await escribir(2, "");
  assert("S2 -> vacío lo borra", !("Prueba Sevilla 2" in s2.guardado) && s2.guardado["Prueba Cáceres 8"] === "US", s2);
  await page.evaluate(() => { document.getElementById("arrPaises").open = true; });
  // Con el teclado de verdad: escribir y pasar al siguiente con Tab no
  // pierde el foco (la lista no se rehace) y lo de los dos se guarda.
  await page.focus("#arrPais1");
  await page.keyboard.type("Francia");
  await page.keyboard.press("Tab");
  await esperar(300);
  await page.keyboard.type("pt");   // también por su código
  await page.keyboard.press("Tab");
  await esperar(300);
  const tab = await page.evaluate(() => ({ foco: document.activeElement && document.activeElement.id,
    guardado: JSON.parse(JSON.stringify(state.cache.paises_inmuebles || {})) }));
  assert("S2 -> con el teclado: «Francia», Tab, «pt», Tab: los dos guardados y el foco no se pierde",
    tab.guardado["Prueba Fondo 1"] === "FR" && tab.guardado["Prueba Sevilla 2"] === "PT" && tab.foco !== null && tab.foco !== "" &&
    !/^arrPais[01]$/.test(tab.foco), tab);
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
