/* Verificación headless de 📒 Transacciones: el pago de una venta
 * vinculada, dentro de su venta. Chrome local +
 * puppeteer-core sobre http://localhost:8765. DATOS 100 % SINTÉTICOS.
 * Capturas cap_tx1d_*.png.
 *
 * Tras vincular una venta con su cobro (asignado entero), comprueba:
 *  A) el cobro no tiene fila propia: la venta, sí, con su hash y debajo el
 *     del cobro; recuento, selector de categoría y triaje cuentan lo que
 *     se ve (el recuento no menciona los cobros plegados).
 *  B) buscar el hash del cobro lo enseña, con su distintivo; «Ver en
 *     Transacciones →» desde «Resueltos» también.
 *  C) anular el vínculo lo devuelve a la tabla como «Ingreso de dinero».
 *  D) nada de esto cambia la clasificación; oscuro y consola sin errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1d.js
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

  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(500);
  const tabla = () => page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => ({
    clave: tr.getAttribute("data-clave"),
    cat: tr.querySelector(".tx-cat").textContent,
    op: tr.children[3].textContent,
    hashes: [...tr.querySelectorAll(".tx-hash a")].map(a => a.textContent),
    vinc: (tr.querySelector("button.tx-vinculada") || { getAttribute: () => "" }).getAttribute("aria-label") || "", // la ayuda, en la burbuja
  })));

  const estado = () => page.evaluate(() => ({
    filas: [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => tr.getAttribute("data-clave")),
    rec: document.getElementById("txRecuento").textContent,
    /* El número va en el recuento y en la opción del selector. */
    total: +((document.getElementById("txRecuento").textContent.match(/^(\d+) movimientos/) || [0, -1])[1]),
    dep: +((((document.querySelector('#txFiltroCategoria option[value="DEPOSITO"]') || {}).textContent || "").match(/\((\d+)\)$/) || [0, 0])[1]),
    kpis: [...document.querySelectorAll(".tx-kpi[data-grupo] b")].reduce((s, b) => s + +b.textContent, 0),
    n: state.registros.length,
    spam: state.registros.filter(x => x.categoria === "SPAM").length,
    deps: state.registros.filter(x => x.categoria === "DEPOSITO").length,
  }));
  const huellaAntes = await page.evaluate(huellaJs);
  const claveVenta = await page.evaluate(() => state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "salida").clave);
  const corto = h => h.slice(0, 6) + "…" + h.slice(-4);

  /* ============ A) el cobro, dentro de su venta ============ */
  console.log("\nA) El cobro va dentro de su venta");
  let e = await estado();
  assert("el cobro asignado entero no tiene fila propia; la venta, sí",
    !e.filas.includes(base.clavePago) && e.filas.includes(claveVenta), e.filas);
  assert("filas = registros − spam − 1 cobro", e.filas.length === e.n - e.spam - 1, [e.filas.length, e.n, e.spam]);
  assert("el recuento cuenta lo que se ve y ya no habla de los cobros plegados (TX-1g)",
    e.total === e.n - e.spam - 1 && !e.rec.includes("dentro de su venta"), e.rec);
  assert("la opción Depósito del selector y el triaje cuentan lo que se ve",
    e.dep === e.deps - 1 && e.kpis === e.n - e.spam - 1, e);
  const fv = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    return { hashes: [...tr.querySelectorAll(".tx-hash a")].map(a => a.textContent), importe: tr.children[5].textContent };
  }, claveVenta);
  assert("la fila de la venta lleva el importe cobrado y, debajo de su hash, el del cobro (T78)",
    fv.hashes.length === 2 && fv.hashes[1] === "↳ " + corto(base.hashPago) + " ↗" && /USD/.test(fv.importe), fv);
  await page.screenshot({ path: path.join(OUT, "cap_tx1d_libro.png") });

  /* ============ B) buscar el hash lo enseña ============ */
  console.log("\nB) Buscar su hash y «Ver en Transacciones →»");
  await page.type("#txBuscar", base.hashPago);
  await esperar(400);
  e = await estado();
  const dist = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    const b = tr ? tr.querySelector("button.tx-vinculada") : null;
    return tr ? (b ? (b.firstChild.textContent + " " + b.querySelector(".tx-burbuja b").textContent) : "") : null;
  }, base.clavePago);
  assert("buscar su hash enseña el cobro, con «🔗 Cobro de una venta»",
    e.filas.includes(base.clavePago) && dist === "🔗 Cobro de una venta", { filas: e.filas, dist });
  assert("buscando, el recuento no habla de cobros plegados", !e.rec.includes("dentro de su venta"), e.rec);
  await page.screenshot({ path: path.join(OUT, "cap_tx1d_busqueda.png") });
  await page.click("#txLimpiar");
  await esperar(300);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="ver-movimiento"][data-clave="' + base.clavePago + '"]');
  await esperar(400);
  let r = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    return { hash: location.hash, destacada: !!tr && tr.classList.contains("tx-destacada") };
  }, base.clavePago);
  assert("«Ver en Transacciones →» de «Resueltos» enseña el cobro resaltado", r.hash === "#transacciones" && r.destacada, r);
  r = await page.evaluate(() => ({ writes: window.__writes.length, huella: JSON.stringify(state.registros.map(x => [x.clave, x.categoria, x.importe_usdt, x.revisar])) }));
  assert("plegar no guarda nada ni cambia la clasificación", r.writes === base.writes && r.huella === huellaAntes, r.writes);

  /* ============ C) anular lo devuelve ============ */
  console.log("\nC) Anular el vínculo");
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="anular-vinculo"]');
  await esperar(1200);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(500);
  await page.click("#txLimpiar");
  await esperar(300);
  e = await estado();
  const op = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    return tr ? tr.children[3].textContent : null;
  }, base.clavePago);
  assert("tras anular, el cobro vuelve a la tabla como «Ingreso de dinero»",
    e.filas.includes(base.clavePago) && op === "Ingreso de dinero", { op });
  assert("tras anular, filas = registros − spam y el recuento ya no habla de cobros plegados",
    e.filas.length === e.n - e.spam && !e.rec.includes("dentro de su venta") && e.total === e.n - e.spam, e);

  /* ============ D) oscuro y consola ============ */
  console.log("\nD) Oscuro y consola");
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(200);
  await page.screenshot({ path: path.join(OUT, "cap_tx1d_oscuro.png") });
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
