/* Verificación headless de 📒 Transacciones con ventas vinculadas: Chrome
 * local + puppeteer-core sobre http://localhost:8765. DATOS 100 % SINTÉTICOS.
 * Capturas cap_tx1c_*.png.
 *
 * Tras vincular una venta con su cobro, comprueba:
 *  A) el spam está oculto por defecto; «👁 Ver spam» lo enseña (SOLO el
 *     spam) y «✖ Salir del spam» lo vuelve a quitar.
 *  B) la columna «Operación» con los nombres aprobados (compra, ingreso,
 *     cobro de una venta…), sin «abre lote» ni «(ganancia/pérdida)».
 *  C) buscar el inmueble encuentra también el pago de su venta.
 *  D) debajo del hash, el de la otra transacción del vínculo.
 *  E) el distintivo explica la venta sin el id; consola sin errores.
 * El cobro, asignado entero, va dentro de su venta: su fila
 * se mira buscando su hash.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1c.js
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

  /* ============ A) spam oculto ============ */
  console.log("\nA) Spam oculto por defecto");
  let r = await page.evaluate(() => ({
    total: state.registros.length, spam: state.registros.filter(x => x.categoria === "SPAM").length,
    filas: document.querySelectorAll("#txCuerpo tr.tx-fila").length,
    rec: document.getElementById("txRecuento").textContent,
    /* El cobro asignado entero va dentro de su venta (sin fila propia). */
    plegados: (() => { const rel = txRelacionesVinculos(state.registros, state.cache.pagos_diferidos.ventas);
      return state.registros.filter(x => txEsCobroPlegado(x, rel)).length; })(),
  }));
  assert("por defecto: todas las filas menos el spam (y el cobro, dentro de su venta), y el recuento lo dice",
    r.spam >= 2 && r.plegados === 1 && r.filas === r.total - r.spam - r.plegados && r.rec.startsWith(r.filas + " movimientos") &&
    r.rec.includes("👁 Ver spam (" + r.spam + ")"), r);
  await page.click("#txRecuento [data-ver-spam]");
  await esperar(300);
  let r2 = await page.evaluate(() => ({ filas: document.querySelectorAll("#txCuerpo tr.tx-fila").length,
    spam: document.querySelectorAll("#txCuerpo tr.tx-fila.tx-c-SPAM").length,
    rec: document.getElementById("txRecuento").textContent }));
  assert("«👁 Ver spam»: solo el spam (TX-1g) y el botón pasa a «✖ Salir del spam»",
    r2.filas === r.spam && r2.spam === r.spam && r2.rec.startsWith(r.spam + " movimientos de spam") && r2.rec.includes("✖ Salir del spam"), r2);
  await page.click("#txRecuento [data-salir-spam]");
  await esperar(300);
  r2 = await page.evaluate(() => document.querySelectorAll("#txCuerpo tr.tx-fila").length);
  assert("«✖ Salir del spam»: vuelve el libro sin el spam", r2 === r.total - r.spam - r.plegados, r2);
  await page.screenshot({ path: path.join(OUT, "cap_tx1c_libro.png") });

  /* ============ B) nombres ============ */
  console.log("\nB) Nombres de la operación");
  let filas = await tabla();
  /* El pago va dentro de su venta: su fila sale al buscar su hash. */
  await page.type("#txBuscar", base.hashPago);
  await esperar(400);
  const filaPago = (await tabla()).find(f => f.clave === base.clavePago);
  await page.click("#txLimpiar");
  await esperar(300);
  if (filaPago) filas.push(filaPago);
  const op = k => (filas.find(f => f.clave === k) || {}).op;
  const claves = await page.evaluate(() => {
    const por = c => (state.registros.find(x => x.categoria === c) || {}).clave;
    return { compra: por("COMPRA"), pago: state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "pago").clave,
             venta: state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "salida").clave,
             deposito: state.registros.find(x => x.categoria === "DEPOSITO" && !x.pago_diferido).clave };
  });
  assert("compra -> «Compra de tokens»; depósito -> «Ingreso de dinero»; el pago vinculado -> «Cobro de una venta»; la venta -> «Venta de tokens»",
    op(claves.compra) === "Compra de tokens" && op(claves.deposito) === "Ingreso de dinero" &&
    op(claves.pago) === "Cobro de una venta" && op(claves.venta) === "Venta de tokens",
    { compra: op(claves.compra), dep: op(claves.deposito), pago: op(claves.pago), venta: op(claves.venta) });
  assert("ninguna fila dice «abre lote» ni «(ganancia/pérdida)»", filas.every(f => !/abre lote|ganancia\/pérdida/.test(f.op)));
  assert("el pago sigue siendo Depósito (categoría)", (filas.find(f => f.clave === claves.pago) || {}).cat === "DEPOSITO");

  /* ============ C) buscar el inmueble encuentra su pago ============ */
  console.log("\nC) Búsqueda de un inmueble");
  await page.type("#txBuscar", "Alcazaba");
  await esperar(400);
  filas = await tabla();
  assert("buscar «Alcazaba» saca también el pago de su venta (USDC, sin inmueble)",
    filas.some(f => f.clave === claves.pago) && filas.some(f => f.clave === claves.venta), filas.map(f => f.op));
  await page.click("#txLimpiar");
  await esperar(300);

  /* ============ D) los dos hashes ============ */
  console.log("\nD) Los dos hashes");
  filas = await tabla();
  if (filaPago) filas.push(filaPago);
  const hv = await page.evaluate(k => state.registros.find(x => x.clave === k).hash, claves.venta);
  const hp = await page.evaluate(k => state.registros.find(x => x.clave === k).hash, claves.pago);
  const corto = h => h.slice(0, 6) + "…" + h.slice(-4);
  const fv = filas.find(f => f.clave === claves.venta), fp = filas.find(f => f.clave === claves.pago);
  assert("fila de la venta: su hash y debajo «↳ 0x… ↗» con el del cobro",
    fv.hashes.length === 2 && fv.hashes[0] === corto(hv) + " ↗" && fv.hashes[1] === "↳ " + corto(hp) + " ↗", fv.hashes);
  assert("fila del pago: su hash y debajo «↳ 0x… ↗» con el de la venta",
    fp.hashes.length === 2 && fp.hashes[1] === "↳ " + corto(hv) + " ↗", fp.hashes);
  assert("el resto de filas, un solo hash", filas.filter(f => f.clave !== claves.venta && f.clave !== claves.pago).every(f => f.hashes.length <= 1));
  await page.screenshot({ path: path.join(OUT, "cap_tx1c_hashes.png") });

  /* ============ E) distintivo, oscuro y consola ============ */
  console.log("\nE) Distintivo, oscuro y consola");
  assert("el distintivo explica la venta sin el id pd_…",
    fp.vinc.includes("Cobro de una venta: Prueba Alcazaba 1, ") && !/pd_\d/.test(fp.vinc) &&
    fv.vinc.includes("cobrada el ") && !/pd_\d/.test(fv.vinc), { fp: fp.vinc, fv: fv.vinc });
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(200);
  r = await page.evaluate(() => getComputedStyle(document.querySelector(".tx-hash-rel")).color);
  assert("oscuro: el hash de la otra transacción con color del tema", /rgb/.test(r), r);
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
