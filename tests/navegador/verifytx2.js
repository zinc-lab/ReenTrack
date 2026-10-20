/* Verificación headless de «Revisión se estrecha»: Chrome local +
 * puppeteer-core sobre http://localhost:8765.
 * DATOS 100 % SINTÉTICOS (ninguna dirección, hash ni importe real). Capturas
 * cap_tx2_*.png en esta carpeta.
 *
 * Comprueba, en 🔍 Revisión:
 *  A) la lista pinta SOLO lo que necesita una decisión (a revisar + salidas
 *     por vincular) y no lo ya clasificado; la cabecera dice cuántos quedan
 *     por decidir; en 📒 Transacciones siguen estando todos.
 *  B) los depósitos sin explicar no salen en Revisión, ni
 *     plegados ni con la marca «🔗 cobro».
 *  C) sin filtros (son pocos).
 *  D) vincular una salida la saca de la lista (pasa a «Resueltos») y anular
 *     el vínculo la devuelve; el anulado no se ve y volver a
 *     vincular la venta reutiliza el mismo vínculo.
 *  E) con todo resuelto: «✅ Nada…».
 *  F) modo oscuro y 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx2.js
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
    return {
      total: regs.length,
      principales: cola.map(r => r.clave),
      depositosLibres: regs.filter(r => ccEsCobroPendiente(r, ctx, false) && !r.revisar).map(r => r.clave),
      yaClasificados: regs.filter(r => !ccMotivoRevision(r, ctx)).map(r => r.clave),
      domPrincipales: [...lista.querySelectorAll(":scope > .cc-item")].map(x => x.getAttribute("data-clave")),
      domTodas: [...lista.querySelectorAll(".cc-item")].map(x => x.getAttribute("data-clave")),
      plegable: !!lista.querySelector("details.cc-cobros"),
      marcaCobro: !!lista.querySelector(".cc-cand.cobro"),
      cab: (lista.querySelector(".cc-cab") || {}).textContent || "",
      porDecidir: document.getElementById("ccPorDecidirAviso").textContent,
      filaOculta: getComputedStyle(document.getElementById("ccPorDecidir")).display === "none",
      enlace: !!lista.querySelector('.cc-cab a[href="#transacciones"]'),
      chip: (document.getElementById("ccPendientes") || { textContent: "(quitado)" }).textContent,
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

  /* ============ A) solo lo que necesita decisión ============ */
  console.log("\nA) La lista solo lleva lo que necesita una decisión");
  let f = await foto();
  console.log("     registros: " + f.total + " · en la lista: " + f.principales.length +
    " · depósitos sin explicar: " + f.depositosLibres.length + " · ya clasificados: " + f.yaClasificados.length);
  assert("hay de todo en los datos de prueba: algo a decidir, depósitos sueltos y registros ya clasificados",
    f.principales.length >= 1 && f.depositosLibres.length >= 2 && f.yaClasificados.length >= 3, f);
  assert("cards de arriba ≡ a revisar + salidas por vincular (mismas y en el mismo orden)",
    igual(f.domPrincipales, f.principales), { dom: f.domPrincipales, puro: f.principales });
  assert("ningún registro ya clasificado tiene card en Revisión",
    f.yaClasificados.every(k => !f.domTodas.includes(k)));
  assert("hay menos cards que registros (" + f.domTodas.length + " de " + f.total + ")",
    f.domTodas.length === f.principales.length && f.domTodas.length < f.total);
  // Cuántos, en su fila (P21); la cabecera, sin «Los otros…» ni enlace.
  assert("fila: «N por decidir»; cabecera sin «Los otros…» ni enlace",
    f.porDecidir === f.domTodas.length + " por decidir" && !f.cab.includes("Los otros") && !f.enlace, [f.porDecidir, f.cab]);
  await page.screenshot({ path: path.join(OUT, "cap_tx2_lista.png") });
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(500);
  let r = await page.evaluate(() => ({
    hash: location.hash,
    visible: document.getElementById("view-transacciones").classList.contains("active"),
    /* El recuento dice los movimientos y, al lado, el spam. */
    rec: document.getElementById("txRecuento").textContent,
    plegados: (() => { const rel = txRelacionesVinculos(state.registros, ((state.cache || {}).pagos_diferidos || {}).ventas || []);
      return state.registros.filter(x => txEsCobroPlegado(x, rel)).length; })(),
  }));
  const nMov = +(r.rec.match(/^([\d.]+) movimientos/) || [0, "-1"])[1].replace(/\./g, "");
  const nSpamR = +(r.rec.match(/Ver spam \((\d+)\)/) || [0, 0])[1];
  assert("en 📒 Transacciones siguen estando TODOS los registros (movimientos + spam)",
    r.hash === "#transacciones" && r.visible && nMov + nSpamR + r.plegados === f.total, { r, nMov, nSpamR, total: f.total });
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);

  /* ============ B) los depósitos no piden decisión ============ */
  console.log("\nB) Los depósitos sin explicar no salen en Revisión");
  f = await foto();
  assert("ningún depósito sin explicar tiene card, ni hay plegable ni marca «🔗 cobro»",
    f.depositosLibres.every(k => !f.domTodas.includes(k)) && !f.plegable && !f.marcaCobro, f);
  r = await page.evaluate(() => (document.querySelector("#ccLista .cc-cab") || {}).textContent || "");
  assert("la cabecera ya no cuenta cobros", !/cobros/.test(r), r.slice(0, 160));

  /* ============ C) sin filtros (son pocos) ============ */
  console.log("\nC) Sin filtros");
  r = await page.evaluate(() => ({ barra: !!document.getElementById("ccFiltros"), controles: document.querySelectorAll("#view-revision [id^=ccFiltro]").length }));
  assert("Revisión ya no tiene barra de filtros", !r.barra && r.controles === 0, r);
  f = await foto();
  assert("la lista enseña todo lo que está por decidir", igual(f.domPrincipales, f.principales));

  /* ============ D) vincular saca de la lista; anular devuelve ============ */
  console.log("\nD) Vincular y anular");
  const antes = f;
  const claveSalida = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => ccEsSalidaPendiente(x, ctx)).clave;
  });
  await clickCentrado('#ccLista .cc-item[data-clave="' + claveSalida + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
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
  f = await foto();
  r = await page.evaluate(() => ({
    ventas: state.cache.pagos_diferidos.ventas.length,
    resueltos: document.getElementById("ccResueltosCount").textContent,
  }));
  assert("tras confirmar el vínculo: la salida sale de la lista y el vínculo está en «Resueltos (1)»",
    r.ventas === 1 && r.resueltos === "1" && !f.domTodas.includes(claveSalida) &&
    f.domTodas.length === antes.domTodas.length - 1, { antes: antes.domTodas.length, ahora: f.domTodas.length, r });
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="anular-vinculo"]');
  await esperar(1200);
  f = await foto();
  assert("tras anular: la salida vuelve a la lista",
    f.domTodas.includes(claveSalida) && f.domTodas.length === antes.domTodas.length, f.domTodas.length);
  r = await page.evaluate(() => ({
    tarjetas: document.querySelectorAll("#ccListaResueltos .cc-vinc").length,
    cuenta: document.getElementById("ccResueltosCount").textContent,
    restaurar: document.querySelectorAll('[data-accion="restaurar-vinculo"]').length,
  }));
  assert("T77: tras anular, el vínculo desaparece de «Resueltos (0)» y no hay «Restaurar»",
    r.tarjetas === 0 && r.cuenta === "0" && r.restaurar === 0, r);
  /* Se vincula otra vez la misma venta, con otro cobro: se reutiliza el vínculo. */
  const idAntes = await page.evaluate(() => state.cache.pagos_diferidos.ventas[0].id);
  await clickCentrado('#ccLista .cc-item[data-clave="' + claveSalida + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
  await page.evaluate(() => {
    const fila = [...document.querySelectorAll(".cc-dlg-item")]
      .find(x => x.querySelector(".cc-dlg-amt").textContent.includes("400"));
    fila.querySelector('[data-accion="toggle-cobro"]').click();
  });
  await esperar(200);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  await page.click(".cc-form-confirmar");
  await esperar(1200);
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await esperar(200);
  r = await page.evaluate(() => {
    const vs = state.cache.pagos_diferidos.ventas;
    return { n: vs.length, id: vs[0].id, estado: vs[0].estado, historial: (vs[0].historial || []).length,
             tarjetas: document.querySelectorAll("#ccListaResueltos .cc-vinc").length,
             grises: document.querySelectorAll("#ccListaResueltos .cc-vinc.anulada").length,
             nombres: [...document.querySelectorAll("#ccListaResueltos .cc-vinc-head > b")].map(x => x.textContent) };
  });
  assert("T77: volver a vincular reutiliza el MISMO vínculo (1 en la cache, mismo id, lo anterior en su historial)",
    r.n === 1 && r.id === idAntes && r.estado === "CONFIRMADO" && r.historial === 1, r);
  assert("T77: «Resueltos» enseña 1 tarjeta y ninguna gris", r.tarjetas === 1 && r.grises === 0, r);
  assert("T75: «Resueltos» nombra la venta, no el id",
    r.nombres.length === 1 && r.nombres[0].startsWith("Venta de 200 tokens de Prueba Alcazaba 1"), r.nombres);
  await page.screenshot({ path: path.join(OUT, "cap_44c_resueltos.png") });

  /* ============ E) todo resuelto ============ */
  console.log("\nE) Sin nada pendiente");
  await page.evaluate(() => {
    window.__regs = state.registros;
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    state.registros = state.registros.filter(x => !ccMotivoRevision(x, ctx));
    renderCorrecciones();
  });
  await esperar(250);
  f = await foto();
// Sin contador ni enlace a Transacciones en la cabecera.
  assert("con todo ya clasificado: 0 cards y «Por decidir» no sale (P21b)",
    f.domTodas.length === 0 && f.filaOculta && f.porDecidir === "" &&
    f.chip === "(quitado)", f);
  await page.screenshot({ path: path.join(OUT, "cap_tx2_nada.png") });
  await page.evaluate(() => { state.registros = window.__regs; renderCorrecciones(); });
  await esperar(250);

  /* ============ F) oscuro y consola ============ */
  console.log("\nF) Modo oscuro y consola");
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(250);
  r = await page.evaluate(() => {
    const s = document.querySelector("#ccListaResueltos .cc-hash-enlace");
    const a = document.querySelector("#ccLista a") || s; // la cabecera no lleva enlace
    return { dark: document.body.classList.contains("dark"),
             summary: getComputedStyle(s).color, enlace: getComputedStyle(a).color,
             hex: /#[0-9a-fA-F]{3,8}\b/.test(document.getElementById("estiloCorrecciones15").textContent) };
  });
  assert("oscuro: enlaces de hash y de la cabecera con colores del tema, CSS sin colores fijos",
    r.dark && /rgb/.test(r.summary) && /rgb/.test(r.enlace) && !r.hex, r);
  await page.screenshot({ path: path.join(OUT, "cap_tx2_oscuro.png") });
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
