/* Verificación headless de 🧾 Fiscal: Chrome local +
 * puppeteer-core sobre http://localhost:8765. DATOS 100 % SINTÉTICOS: 3
 * inmuebles comprados por banco en 2024 y 2025 (lotes de 100 €/token),
 * uno de ellos con dos compras, repartos de 2024 a 2026 y tipos del BCE de
 * todos los días. Capturas cap_fiscal1_*.png.
 *
 *  S1) sin clasificar, «Sin datos todavía» con enlace a 🚀; con una
 *      clasificación de otra wallet, «no está al día».
 *  S2) sin sincronización apuntada lo dice; con ella, un botón por año y
 *      sale el último terminado.
 *  S3) cada cifra del resumen es la del informe (js/22) con el mismo «hoy»;
 *      «A declarar en» en rendimientos.
 *  S4) el historial: un desplegable por inmueble con lo que queda.
 *  S5) cambiar de año repinta ese año; «Sin ventas» si no las hay.
 *  S6) 375 px sin scroll de lado, oscuro; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyfiscal1.js
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

  await page.goto(BASE + "index.html#fiscal", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });

  /* ============ S1) sin datos y clasificación vieja ============ */
  const vacio = await page.evaluate(() => document.querySelector("#fiCuerpo").innerHTML);
  assert("S1 -> sin datos: lo dice, con enlace a 🚀 Puesta en marcha", /Sin datos todavía/.test(vacio) && /href="#inicio"/.test(vacio));
  await page.evaluate(montarFiscal1);
  await page.evaluate(() => { ejecutarClasificacion({ silencioso: true }); });
  await esperar(300);
  // El repintado se hace al terminar lo que está en marcha (un solo cálculo).
  await page.evaluate(() => {
    window.__configBuena = state.config;
    state.config = Object.assign({}, state.config, { wallet: "0x" + "33".repeat(20) });
    renderPanel(); actualizarChipEstado();
  });
  await esperar(100);
  const viejo = await page.evaluate(() => document.querySelector("#fiCuerpo").textContent);
  await page.evaluate(() => { state.config = window.__configBuena; renderPanel(); });
  await esperar(100);
  assert("S1 -> con la clasificación de otra wallet: «no está al día»", /Revisa tus datos en 🚀/.test(viejo), viejo);

  /* ============ S2) sincronización apuntada y años ============ */
  const sinFecha = await page.evaluate(() => document.querySelector("#fiCuerpo").textContent);
  assert("S2 -> sin sincronización apuntada: pide sincronizar", /sincroniza para tener el año al día/.test(sinFecha));
  await page.evaluate(() => { apuntarSincronizacion(state.cache, true, new Date("2026-05-20T12:00:00Z")); renderPanel(); });
  await esperar(200);

  const leer = () => page.evaluate(() => {
    const regs = structuredClone(state.registros);
    const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
    motorFiscal(regs, state.cache, state.config, op);
    const h = fiHastaCuando(state.cache);
    const informes = informesRentaAnuales(regs, resumenFiscalAnual(regs), state.config,
      { ...op, cache: state.cache, hoy: h.hoy, descarga_incompleta: h.descargaIncompleta });
    const elegido = Number(document.querySelector(".fi-anio[aria-pressed=true]").dataset.anio);
    const inf = informes[elegido];
    const fmt = f => f.unidad === "EUR" ? fiEur(f.importe, f.clave.startsWith("gp_") && !/_(transmision|adquisicion)$/.test(f.clave))
      : cantidadEs(f.importe) + " " + f.unidad;
    const enPantalla = Object.fromEntries([...document.querySelectorAll("#fiResumen .fi-fila")]
      .map(x => [x.dataset.clave, x.querySelector(".v").textContent]));
    return {
      anios: [...document.querySelectorAll(".fi-anio")].map(b => Number(b.dataset.anio)), elegido,
      estado: document.querySelector(".fi-estado").textContent,
      difs: inf.resumen.filter(f => fmt(f) !== enPantalla[f.clave]).map(f => f.clave),
      nFilas: Object.keys(enPantalla).length, nInforme: inf.resumen.length,
      declarar: document.querySelector("#fiResumen .fi-declarar") ? document.querySelector("#fiResumen .fi-declarar").textContent : "",
      ventas: document.querySelector("#fiVentas").textContent,
      lotes: [...document.querySelectorAll("#fiHistorial details.fi-h-activo")].map(d => d.querySelectorAll(".fi-h-linea>span"))
        .filter(s => s[0].textContent.startsWith("Prueba")).map(s => [s[0].textContent, s[1].textContent,
          s[0].closest("details").querySelectorAll("tbody tr.fi-h-entra").length]),
      texto: document.querySelector("#fiCuerpo").textContent,
    };
  });
  let d = await leer();
  assert("S2 -> un botón por año (2024 a 2026) y sale 2025, el último terminado", JSON.stringify(d.anios) === "[2024,2025,2026]" && d.elegido === 2025 &&
    /Ejercicio terminado · sincronizado el 20\/05\/2026/.test(d.estado), [d.anios, d.elegido, d.estado]);
  assert("S3 -> las " + d.nFilas + " cifras del resumen son las del informe", d.difs.length === 0 && d.nFilas === d.nInforme && d.nFilas > 10, d.difs);
  assert("S3 -> «A declarar en» bajo los rendimientos", /^A declarar en: Rendimientos del capital mobiliario/.test(d.declarar), d.declarar);
  assert("S3 -> sin «qué tipo de rendimiento son»", !/Cesión a terceros/.test(d.texto));
  assert("S3 -> sin casillas ni consejos por país, y al final un descargo genérico",
    !/casilla|LLC|España/.test(d.texto) && (d.texto.match(/asesor/g) || []).length === 1 &&
    /confírmalo con un asesor\.$/.test(d.texto.trim()), d.texto.slice(-200));
  assert("S4 -> el historial: un desplegable por inmueble con lo que queda y sus compras",
    JSON.stringify(d.lotes) === JSON.stringify([["Prueba Cáceres 8", "7", 2], ["Prueba Fondo 1", "6", 1], ["Prueba Sevilla 2", "7", 1]]), d.lotes);
  assert("S5 -> sin ventas ni permutas: lo dice", /Sin ventas ni permutas este año/.test(d.ventas));
  await page.evaluate(() => document.querySelectorAll("#fiCuerpo details").forEach(x => { x.open = true; }));
  await page.screenshot({ path: path.join(OUT, "cap_fiscal1.png"), fullPage: true });

  await page.click('.fi-anio[data-anio="2026"]');
  await esperar(150);
  d = await leer();
  assert("S5 -> al pulsar 2026 se pinta ese año, en curso, con sus cifras", d.elegido === 2026 && d.difs.length === 0 &&
    /En curso, con datos hasta el 20\/05\/2026/.test(d.estado), [d.elegido, d.estado, d.difs]);

  /* ============ S7) arreglos que se ven en pantalla ============ */
  // A8: un repintado no cierra lo desplegado y el año elegido con el teclado conserva el foco.
  await page.evaluate(() => { document.querySelector("#fiHistorial details.fi-h-activo").open = true; renderPanel(); });
  await esperar(150);
  const sigueAbierto = await page.evaluate(() => document.querySelector("#fiHistorial details.fi-h-activo").open);
  await page.focus('.fi-anio[data-anio="2024"]');
  await page.keyboard.press("Enter");
  await esperar(150);
  const foco = await page.evaluate(() => ({ anio: document.activeElement.dataset && document.activeElement.dataset.anio,
    pulsado: document.querySelector(".fi-anio[aria-pressed=true]").dataset.anio }));
  assert("S7 -> A8: tras un repintado sigue desplegado y el foco sigue en el año elegido con el teclado",
    sigueAbierto && foco.anio === "2024" && foco.pulsado === "2024", [sigueAbierto, foco]);
  // A9: con otra cache vuelve al último ejercicio terminado.
  await page.evaluate(() => { state.cache = structuredClone(state.cache); ejecutarClasificacion({ silencioso: true }); });
  await esperar(300);
  const otra = await page.evaluate(() => document.querySelector(".fi-anio[aria-pressed=true]").dataset.anio);
  assert("S7 -> A9: con otra cache sale el último terminado (2025), no el elegido en la anterior", otra === "2025", otra);
  // A7: si la clasificación lanza un error, se dice (no «actualiza»).
  const textoError = await page.evaluate(async () => {
    const original = window.clasificarTransacciones;
    window.clasificarTransacciones = () => { throw new Error("FALLO_SINTETICO"); };
    try { ejecutarClasificacion({ silencioso: true }); } catch (e) { /* lo enseña la pestaña */ }
    window.clasificarTransacciones = original;
    await new Promise(s => setTimeout(s, 100));
    const t = document.querySelector("#fiCuerpo").textContent;
    ejecutarClasificacion({ silencioso: true });
    await new Promise(s => setTimeout(s, 100));
    return [t, document.querySelector("#fiCuerpo").textContent];
  });
  assert("S7 -> A7: con un error al clasificar lo dice; al clasificar bien vuelven las cifras",
    /Algo falló/.test(textoError[0]) && /Resumen del ejercicio/.test(textoError[1]), textoError.map(t => t.slice(0, 80)));

  /* ============ S6) móvil y oscuro ============ */
  await page.setViewport({ width: 375, height: 800 });
  await page.click("#btnDark");
  await esperar(300);
  const movil = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    oscuro: document.body.classList.contains("dark"),
    fondo: getComputedStyle(document.querySelector(".fi-tarjeta")).backgroundColor,
  }));
  assert("S6 -> 375 px sin scroll de lado y oscuro", !movil.scroll && movil.oscuro && movil.fondo !== "rgb(255, 255, 255)", movil);
  await page.screenshot({ path: path.join(OUT, "cap_fiscal1_movil.png"), fullPage: true });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await browser.close();
  // El de S7 (A7) lo provoca la prueba.
  const ajenos = errores.filter(e => !/FALLO_SINTETICO/.test(e));
  assert("S6 -> 0 errores de consola (salvo el que provoca S7)", ajenos.length === 0, ajenos);
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
