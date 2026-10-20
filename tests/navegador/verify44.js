/* Verificación headless del distintivo «Vinculada» y el salto a los
 * movimientos relacionados: Chrome local + puppeteer-core sobre
 * http://localhost:8765. DATOS 100 % SINTÉTICOS. Capturas cap_44_*.png.
 *
 * Comprueba, tras vincular una salida con su cobro:
 *  A) en 📒 Transacciones, la salida lleva «🔗 Venta vinculada» y el
 *     cobro «🔗 Cobro de una venta» (sigue siendo Depósito), como botones.
 *     El cobro, asignado entero, va dentro de su venta: su
 *     fila sale al buscar su hash.
 *  B) pulsar el distintivo abre 🔍 Revisión, despliega «Resueltos» y resalta
 *     el vínculo.
 *  C) en «Resueltos», «Ver en Transacciones →» de cada movimiento abre el
 *     libro con ese movimiento resaltado (buscado por su hash, sin filtros).
 *  D) nada de esto guarda ni cambia la clasificación; oscuro y consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verify44.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");

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

  /* Cache sintética: 1 salida de inmueble sin cobro (pendiente), 1 venta con
     su cobro en la misma transacción (ya clasificada), 2 cobros sueltos de
     stablecoin y varios envíos de un token desconocido (spam). */
  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20), RARO = "0x" + "f0".repeat(20);
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
      leg(Hh(1), W, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 22), "100"),
      leg(Hh(2), T, W, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
      leg(Hh(3), T, W, USDC, tok6(400), "USD Coin", "USDC", "6", ts(2026, 6, 12, 10), "103"),
      // Venta con el cobro en la misma transacción: ya clasificada
      leg(Hh(4), W, T, P1, tok18(10), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 5, 2, 9), "90"),
      leg(Hh(4), T, W, USDT, tok6(1000), "Tether USD", "USDT", "6", ts(2026, 5, 2, 9), "90"),
      // Compras de tokens del inmueble y envíos de un token desconocido
      leg(Hh(5), T, W, P1, tok18(300), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 1, 10, 9), "50"),
      leg(Hh(6), T, W, RARO, tok18(999), "Visit scam.example", "SCAM", "18", ts(2026, 2, 1, 9), "60"),
      leg(Hh(7), T, W, RARO, tok18(999), "Visit scam.example", "SCAM", "18", ts(2026, 2, 2, 9), "61"));
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
  /* Foto de la lista frente a las funciones puras. */
  const foto = () => page.evaluate(() => {
    const regs = state.registros;
    const ctx = ccContextoCandidatos(state.cache, state.config, regs);
    const cola = ccColaRevision(regs, ctx);
    const lista = document.getElementById("ccLista");
    const det = lista.querySelector("details.cc-cobros");
    return {
      total: regs.length,
      principales: cola.principales.map(r => r.clave),
      cobros: cola.cobros.map(r => r.clave),
      yaClasificados: regs.filter(r => !ccMotivoRevision(r, ctx)).map(r => r.clave),
      domPrincipales: [...lista.querySelectorAll(":scope > .cc-item")].map(x => x.getAttribute("data-clave")),
      domCobros: det ? [...det.querySelectorAll(".cc-item")].map(x => x.getAttribute("data-clave")) : [],
      domTodas: [...lista.querySelectorAll(".cc-item")].map(x => x.getAttribute("data-clave")),
      plegable: det ? { abierto: det.open, titulo: det.querySelector("summary").textContent } : null,
      cab: (lista.querySelector(".cc-cab") || {}).textContent || "",
      enlace: !!lista.querySelector('.cc-cab a[href="#transacciones"]'),
      chip: document.getElementById("ccPendientes").textContent,
    };
  });
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(800);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);

  /* Vincula la salida de prueba con el cobro de 3.204 USDT. */
  const claveSalida = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => ccEsSalidaPendiente(x, ctx)).clave;
  });
  await clickCentrado('#ccLista .cc-item[data-clave="' + claveSalida + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll(".cc-dlg-item")]
      .find(x => x.querySelector(".cc-dlg-amt").textContent.includes("3.204"));
    fila.querySelector('[data-accion="toggle-cobro"]').click();
  });
  await esperar(200);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  await page.click(".cc-form-confirmar");
  await esperar(1200);
  const huellaJs = () => JSON.stringify(state.registros.map(x => [x.clave, x.categoria, x.importe_usdt, x.revisar]));
  const base = await page.evaluate(() => {
    const v = state.cache.pagos_diferidos.ventas[0];
    const pago = state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "pago");
    return { id: v.id, writes: window.__writes.length, clavePago: pago.clave, hashPago: pago.hash,
             catPago: pago.categoria };
  });
  base.huella = await page.evaluate(huellaJs);

  /* ============ A) distintivo en Transacciones ============ */
  console.log("\nA) Distintivo «Vinculada» en 📒 Transacciones");
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(500);
  const fila = clave => page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    const b = tr ? tr.querySelector("button.tx-vinculada") : null;
    return tr ? { texto: b ? (b.firstChild.textContent + " " + b.querySelector(".tx-burbuja b").textContent) : "", venta: b ? b.getAttribute("data-venta") : "",
                  otro: tr.textContent.includes("Otro cobro…") } : null;
  }, clave);
  let a = await fila(claveSalida), b = await fila(base.clavePago);
  assert("la salida lleva el botón «🔗 Venta vinculada» y «➕ Otro cobro…»",
    a && a.texto === "🔗 Venta vinculada" && a.venta === base.id && a.otro, a);
  /* El cobro asignado entero va dentro de su venta; sale al buscar su hash. */
  let r = await page.evaluate(() => document.querySelectorAll("#txCuerpo button.tx-vinculada").length);
  assert("TX-1d: el cobro, asignado entero, no tiene fila propia (va dentro de su venta): 1 distintivo", b === null && r === 1, { b, r });
  await page.screenshot({ path: path.join(OUT, "cap_44_transacciones.png") });
  await page.type("#txBuscar", base.hashPago);
  await esperar(400);
  b = await fila(base.clavePago);
  assert("al buscar su hash, el cobro lleva el botón «🔗 Cobro de una venta» y sigue siendo Depósito",
    b && b.texto === "🔗 Cobro de una venta" && b.venta === base.id && base.catPago === "DEPOSITO" && !b.otro, b);

  /* ============ B) del registro al vínculo ============ */
  console.log("\nB) Pulsar el distintivo lleva al vínculo");
  await page.evaluate(k => {
    [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k)
      .querySelector("button.tx-vinculada").click();
  }, base.clavePago);
  await esperar(500);
  r = await page.evaluate(id => {
    const card = [...document.querySelectorAll("#ccListaResueltos .cc-vinc")].find(c => c.getAttribute("data-venta") === id);
    const rect = card ? card.getBoundingClientRect() : null;
    return { hash: location.hash, abierto: document.getElementById("ccResueltos").open,
             destacada: !!card && card.classList.contains("cc-destacada"),
             enPantalla: !!rect && rect.top >= 0 && rect.bottom <= window.innerHeight,
             visible: getComputedStyle(document.getElementById("view-revision")).display !== "none" };
  }, base.id);
  assert("abre 🔍 Revisión, despliega «Resueltos» y resalta el vínculo, a la vista",
    r.hash === "#revision" && r.visible && r.abierto && r.destacada && r.enPantalla, r);
  await page.screenshot({ path: path.join(OUT, "cap_44_resueltos.png") });
  await esperar(2700);
  r = await page.evaluate(() => document.querySelectorAll(".cc-destacada").length);
  assert("el resalte se quita solo", r === 0, r);

  /* ============ C) del vínculo a sus movimientos ============ */
  console.log("\nC) «Ver en Transacciones →» desde «Resueltos»");
  r = await page.evaluate(() => [...document.querySelectorAll('#ccListaResueltos [data-accion="ver-movimiento"]')]
    .map(x => x.getAttribute("data-clave")));
  assert("un botón por movimiento: la salida y el cobro",
    JSON.stringify(r) === JSON.stringify([claveSalida, base.clavePago]), r);
  /* Con un filtro puesto en Transacciones: el salto lo quita. */
  await page.evaluate(() => { document.getElementById("txFiltroCategoria").value = "SPAM"; });
  await clickCentrado('#ccListaResueltos [data-accion="ver-movimiento"][data-clave="' + base.clavePago + '"]');
  await esperar(300);
  r = await page.evaluate(k => {
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    const tr = filas.find(x => x.getAttribute("data-clave") === k);
    return { hash: location.hash, buscar: document.getElementById("txBuscar").value,
             cat: document.getElementById("txFiltroCategoria").value, filas: filas.length,
             destacada: !!tr && tr.classList.contains("tx-destacada"),
             visible: document.getElementById("view-transacciones").classList.contains("active") };
  }, base.clavePago);
  assert("abre 📒 Transacciones sin filtros, buscando el hash del cobro, con su fila resaltada",
    r.hash === "#transacciones" && r.visible && r.buscar === base.hashPago && r.cat === "" &&
    r.filas === 1 && r.destacada, r);
  await page.screenshot({ path: path.join(OUT, "cap_44_movimiento.png") });
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  // Al volver a 🔍 todo está plegado: se abre «Ya decididos».
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="ver-movimiento"][data-clave="' + claveSalida + '"]');
  await esperar(300);
  r = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    return { hash: location.hash, destacada: !!tr && tr.classList.contains("tx-destacada") };
  }, claveSalida);
  assert("lo mismo con la salida", r.hash === "#transacciones" && r.destacada, r);

  /* ============ D) puerta, oscuro y consola ============ */
  console.log("\nD) Puerta, modo oscuro y consola");
  r = await page.evaluate(() => ({ writes: window.__writes.length, ventas: state.cache.pagos_diferidos.ventas.length }));
  r.huella = await page.evaluate(huellaJs);
  assert("los saltos no guardan nada ni cambian la clasificación",
    r.writes === base.writes && r.ventas === 1 && r.huella === base.huella, { writes: r.writes, antes: base.writes });
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(250);
  r = await page.evaluate(() => {
    const b = document.querySelector("#txCuerpo button.tx-vinculada");
    return { color: getComputedStyle(b).color,
             hex15: /#[0-9a-fA-F]{3,8}\b/.test(document.getElementById("estiloCorrecciones15").textContent) };
  });
  assert("oscuro: distintivo con colores del tema y CSS de Revisión sin colores fijos", /rgb/.test(r.color) && !r.hex15, r);
  await page.screenshot({ path: path.join(OUT, "cap_44_oscuro.png") });
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
