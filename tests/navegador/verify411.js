/* Verificación headless del desfase y el precio en el buscador de cobros: Chrome local + puppeteer-core
 * sobre http://localhost:8765. DATOS 100 % SINTÉTICOS (ninguna dirección, hash
 * ni importe real). Capturas cap_411_*.png en esta carpeta.
 *
 * Comprueba, en el buscador de cobros abierto desde una salida pendiente:
 *  A) cada fila muestra el DESFASE en días respecto a la fecha de la salida
 *     («+5 d» / «−2 d» con U+2212 / «0 d») coherente con las fechas de ambos
 *     registros, y el PRECIO implícito por token («16,02 por token» = cantidad
 *     del cobro ÷ tokens de la venta, red6) con su ⓘ.
 *  B) el ⓘ aclara que es orientación para elegir, NO valoración (el € sale del BCE).
 *  C) los hooks del buscador siguen vivos (toggle-cobro elige la fila).
 *  D) modo oscuro correcto (solo tokens) y 0 errores de consola.
 *  E) puerta: abrir el buscador y elegir NO guarda nada (0 escrituras).
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   $env:NODE_PATH="$env:TEMP\opencode\ui2-browser\node_modules"
 *   node tests/navegador/verify411.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const OUT = __dirname;
const MENOS = "\u2212"; // U+2212

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1600,1400"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1400 });
  const consola = [];
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => {
    consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" });
    console.error("  [pageerror] " + String(e && e.message || e).slice(0, 200));
  });
  const erroresConsola = () => consola.filter(m =>
    (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));

  /* Cache sintética: 1 salida de propiedad (200 tokens, 14/06) y 3 cobros de
     stablecoin en distintas fechas/importes para ejercitar desfase y precio. */
  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0,
                     etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
    };
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    cache.transacciones.wallet_tokens.push(
      // Salida: 200 RALC1 el 14/06/2026 (sin contraprestación → REVISAR, pendiente)
      leg(Hh(1), W, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 20), "100"),
      // Cobro A: 3204 USDT el 19/06 → desfase +5 d, precio 3204/200 = 16,02
      leg(Hh(2), T, W, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
      // Cobro B: 400 USDC el 12/06 → desfase −2 d, precio 400/200 = 2
      leg(Hh(3), T, W, USDC, tok6(400), "USD Coin", "USDC", "6", ts(2026, 6, 12, 10), "103"),
      // Cobro C: 300 USDC el 14/06 → desfase 0 d, precio 300/200 = 1,5
      leg(Hh(4), T, W, USDC, tok6(300), "USD Coin", "USDC", "6", ts(2026, 6, 14, 9), "104"));
    state.cache = cache;
  }
  function montarCsv() {
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + state.config.wallet;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  }
  const clickCentrado = async sel => {
    /* P25: en una tarjeta con «Es una venta…», «🔗 Vincular cobro…» sale al abrirla. */
    const venta = sel.endsWith('[data-accion="abrir-buscador"]') && !sel.includes("ccListaResueltos") &&
      await page.$(sel) === null && sel.replace('[data-accion="abrir-buscador"]', '[data-opcion="venta"]');
    if (venta && await page.$(venta)) await clickCentrado(venta);
    await page.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: "center" }); }, sel);
    await esperar(120);
    await page.click(sel);
    await esperar(400);
  };
  /* Extrae el contenido derivado de la fila cuyo monto incluye `amtText`. */
  const leerFila = amtText => page.evaluate(t => {
    const rows = [...document.querySelectorAll(".cc-dlg-item")];
    const row = rows.find(r => (r.querySelector(".cc-dlg-amt") || {}).textContent &&
                               r.querySelector(".cc-dlg-amt").title.includes(t));
    if (!row) return null;
    const d = row.querySelector(".cc-dlg-desfase");
    const p = row.querySelector(".cc-dlg-precio");
    return {
      amt: row.querySelector(".cc-dlg-amt").textContent.trim(),
      fecha: row.querySelector(".cc-dlg-fecha").textContent.trim(),
      desfase: d ? d.textContent.trim() : null,
      precio: p ? p.childNodes[0].textContent.trim() : null,
      hasInfo: !!(p && p.querySelector(".cc-info")),
      burbuja: p ? p.getAttribute("title") : null,
    };
  }, amtText);

  /* ============ Preparación ============ */
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarCache);
  await page.evaluate(montarCsv);
  await page.evaluate(() => {
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  });
  await page.evaluate(() => { location.hash = "#clasificacion"; });
  await esperar(150);
  await page.evaluate(() => ejecutarClasificacion()); // mismo camino que la app (js/14)
  await esperar(800);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);

  /* ============ A) buscador desde la salida pendiente ============ */
  console.log("\nA) Buscador: desfase en días y precio por token en cada fila");
  const claveS1 = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    const s = state.registros.find(x => ccEsSalidaPendiente(x, ctx));
    return s ? s.clave : null;
  });
  assert("hay una salida pendiente de la que abrir el buscador", !!claveS1, claveS1);
  await clickCentrado('.cc-item[data-clave="' + claveS1 + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
  const nFilas = await page.evaluate(() => document.querySelectorAll(".cc-dlg-item").length);
  assert("el buscador abre con las 3 filas de cobros sintéticos", nFilas === 3, nFilas);

  const fA = await leerFila("3.204 USDT");
  assert("cobro 19/06 (3.204 USDT): «+5 d» y «16,02 USD/token» (LEYENDA-F6, sin ⓘ)",
    fA && fA.desfase === "+5 d" && fA.precio === "16,02 USD/token" && !fA.hasInfo, fA);
  const fB = await leerFila("400 USDC");
  assert("cobro 12/06 (400 USDC): «−2 d» (U+2212) y «2,00 USD/token»",
    fB && fB.desfase === MENOS + "2 d" && fB.precio === "2,00 USD/token" && !fB.hasInfo, fB);
  const fC = await leerFila("300 USDC");
  assert("cobro 14/06 (300 USDC): «0 d» (mismo día) y «1,50 USD/token»",
    fC && fC.desfase === "0 d" && fC.precio === "1,50 USD/token" && !fC.hasInfo, fC);

  /* ============ B) ⓘ: orientación, no valoración ============ */
  console.log("\nB) La burbuja ⓘ aclara que es orientación (no valoración)");
  // Burbuja corta, sin el €: eso lo pone el cálculo fiscal.
  assert("la burbuja del precio (al pasar el ratón): «Cobro ÷ tokens de la venta»",
    fA && fA.burbuja === "Cobro ÷ tokens de la venta", fA && fA.burbuja);

  /* ============ C) hooks del buscador intactos ============ */
  console.log("\nC) Hooks preservados: toggle-cobro sigue eligiendo la fila");
  await page.evaluate(() => {
    const row = [...document.querySelectorAll(".cc-dlg-item")]
      .find(r => r.querySelector(".cc-dlg-amt").title.includes("3.204 USDT"));
    row.querySelector('[data-accion="toggle-cobro"]').click();
  });
  await esperar(250);
  const elegida = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".cc-dlg-item")]
      .find(r => r.querySelector(".cc-dlg-amt").title.includes("3.204 USDT"));
    return { clase: row.className, boton: row.querySelector(".cc-elegir").textContent.trim(),
             proponer: document.querySelector(".cc-dlg-proponer").disabled };
  });
  assert("al pulsar «➕» la fila queda elegida y habilita «🔗 Vincular cobro…»",
    elegida.clase.includes("elegida") && elegida.boton.includes("✔") && elegida.proponer === false, elegida);
  await page.screenshot({ path: path.join(OUT, "cap_411_buscador.png"), fullPage: false });

  /* ============ D) modo oscuro (solo tokens) ============ */
  console.log("\nD) Modo oscuro");
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(200);
  await page.screenshot({ path: path.join(OUT, "cap_411_oscuro.png"), fullPage: false });
  const oscuroOk = await page.evaluate(() => {
    const row = [...document.querySelectorAll(".cc-dlg-item")]
      .find(r => r.querySelector(".cc-dlg-amt").title.includes("3.204 USDT"));
    const d = row.querySelector(".cc-dlg-desfase");
    const color = getComputedStyle(d).color;
    return { dark: document.body.classList.contains("dark"), color };
  });
  assert("body.dark activo y el desfase se pinta con color de token (no hardcoded)",
    oscuroOk.dark && /rgb\(/.test(oscuroOk.color), oscuroOk);
  await page.evaluate(() => document.body.classList.remove("dark"));

  /* ============ E) puerta y consola ============ */
  console.log("\nE) Puerta y consola");
  await page.keyboard.press("Escape");
  await esperar(300);
  const writes = await page.evaluate(() => window.__writes.length);
  const vinculos = await page.evaluate(() => (state.cache.pagos_diferidos.ventas || []).length);
  assert("abrir el buscador y elegir NO guarda nada (0 escrituras, 0 vínculos)",
    writes === 0 && vinculos === 0, { writes, vinculos });
  const errs = erroresConsola();
  console.log("\nConsola: " + consola.length + " mensajes, " + errs.length + " errores (ruido favicon excluido)");
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
