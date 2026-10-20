/* Verificación headless de 📒 Transacciones menos densa:
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS
 * 100 % SINTÉTICOS. Capturas cap_tx1e_*.png.
 *
 * Tras vincular una venta con su cobro, comprueba:
 *  A) 8 columnas, cifras con 2 decimales, acciones como iconos y la tabla
 *     sin scroll horizontal a 1366 px; la retención, solo si la hay.
 *  B) cada icono tiene su burbuja: al pasar el ratón y con el teclado,
 *     dentro de la tabla y de la ventana; el texto entero en aria-label.
 *  C) los iconos hacen lo mismo que los botones de antes.
 *  D) oscuro y consola sin errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1e.js
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

  const corto = h => h.slice(0, 6) + "…" + h.slice(-4);
  const claveVenta = await page.evaluate(() => state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "salida").clave);
  /* Texto que se ve en una celda (sin la burbuja). */
  await page.evaluate(() => { window.__visible = td => { const c = td.cloneNode(true);
    c.querySelectorAll(".tx-burbuja").forEach(x => x.remove()); return c.textContent; }; });
  /* Burbuja de un icono: ¿se ve?, ¿cabe en la tabla y en la ventana? */
  const burbuja = sel => page.evaluate(s => {
    const b = document.querySelector(s);
    const bb = b ? b.querySelector(".tx-burbuja") : null;
    if (!bb) return null;
    const r = bb.getBoundingClientRect(), w = document.querySelector(".tx-tablawrap").getBoundingClientRect();
    return { visible: getComputedStyle(bb).display !== "none", texto: bb.textContent,
             enVentana: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight,
             enTabla: r.left >= w.left - 1 && r.right <= w.right + 1 && r.top >= w.top - 1 && r.bottom <= w.bottom + 1,
             fondo: getComputedStyle(bb).backgroundColor };
  }, sel);

  /* ============ A) la tabla, más ligera ============ */
  console.log("\nA) Ocho columnas, 2 decimales y sin scroll");
  await page.setViewport({ width: 1366, height: 900 });
  await esperar(300);
  let r = await page.evaluate(() => {
    const w = document.querySelector(".tx-tablawrap");
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")];
    return { ths: [...document.querySelectorAll("#txTabla thead th")].map(th => th.textContent),
             celdas: [...new Set(filas.map(tr => tr.children.length))],
             cabe: w.scrollWidth <= w.clientWidth + 1,
             muchosDecimales: filas.filter(tr => [4, 5].some(i => /,\d{3,}/.test(window.__visible(tr.children[i])))).length,
             botonesConTexto: [...document.querySelectorAll("#txCuerpo .tx-acciones button")].filter(b => !b.classList.contains("tx-ico")).length };
  });
  assert("9 columnas (TX-1f: + Contraparte), sin «Retención» ni «Nota del motor»", r.ths.length === 9 && r.celdas.length === 1 && r.celdas[0] === 9 &&
    !r.ths.includes("Retención") && !r.ths.includes("Nota del motor"), r);
  assert("a 1366 px la tabla cabe sin scroll horizontal", r.cabe, r);
  assert("ninguna cantidad ni importe con más de 2 decimales", r.muchosDecimales === 0, r.muchosDecimales);
  assert("todas las acciones son iconos", r.botonesConTexto === 0, r.botonesConTexto);
  const fv = await page.evaluate(k => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.getAttribute("data-clave") === k);
    return { cant: tr.children[4].textContent, cantAyuda: tr.children[4].title, imp: tr.children[5].textContent,
             hashes: [...tr.querySelectorAll(".tx-hash a")].map(a => a.textContent),
             iconos: [...tr.querySelectorAll(".tx-ico")].map(b => b.firstChild.textContent) };
  }, claveVenta);
  assert("venta vinculada: «200» tokens, «3.204,00 USD», los dos hashes y los iconos ✏️ 🔍 🔗 ➕ (el ✏️ desde NOTA-1)",
    fv.cant === "200" && fv.imp === "3.204,00 USD" && fv.hashes.length === 2 &&
    JSON.stringify(fv.iconos) === JSON.stringify(["✏️", "🔍", "🔗", "➕"]), fv);
  const rend = await page.evaluate(() => {
    const tr = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].find(x => x.children[3].textContent === "Rendimiento reinvertido");
    const a = tr.children[5].querySelector(".tx-ayuda");
    return { imp: window.__visible(tr.children[5]), ayuda: a ? a.getAttribute("aria-label") : "",
             burbuja: a ? a.querySelector(".tx-burbuja").textContent : "" };
  });
  assert("rendimiento sin retención: sin línea «(ret. …)», el 0 en su burbuja",
    rend.imp === "400,00 USD" && rend.ayuda.includes("Retención: 0 USD") && rend.burbuja.startsWith("Rendimiento íntegro: 400 USDRetención: 0 USD"), rend);
  await page.hover("#txTabla thead .tx-ayuda");
  await esperar(150);
  const cab = await page.evaluate(() => {
    const a = document.querySelector("#txTabla thead .tx-ayuda"), bb = a.querySelector(".tx-burbuja");
    const r = bb.getBoundingClientRect(), w = document.querySelector(".tx-tablawrap").getBoundingClientRect();
    const c = a.cloneNode(true); c.querySelector(".tx-burbuja").remove();
    return { nombre: c.textContent, visible: getComputedStyle(bb).display !== "none", texto: bb.textContent,
             mayusculas: getComputedStyle(bb).textTransform, retMayus: getComputedStyle(a.querySelector(".tx-ret")).textTransform,
             enTabla: r.left >= w.left - 1 && r.right <= w.right + 1 && r.top >= w.top - 1 && r.bottom <= w.bottom + 1 };
  });
  assert("cabecera «Importe (retención)» con su burbuja al pasar el ratón, dentro de la tabla y sin mayúsculas",
    cab.nombre === "Importe(retención)" && cab.visible && cab.enTabla && cab.mayusculas === "none" && cab.retMayus === "none" &&
    cab.texto.startsWith("Importe (retención) Importes en USD"), cab);
  await page.screenshot({ path: path.join(OUT, "cap_tx1e_cabecera.png") });
  await page.mouse.move(5, 5);
  await page.screenshot({ path: path.join(OUT, "cap_tx1e_libro.png") });

  /* ============ B) burbujas ============ */
  console.log("\nB) Burbujas de información");
  const selMandar = '#txCuerpo tr.tx-fila[data-clave="' + claveVenta + '"] [data-accion="mandar-revisar"]';
  const selVinc = '#txCuerpo tr.tx-fila[data-clave="' + claveVenta + '"] .tx-vinculada';
  r = await burbuja(selMandar);
  assert("sin pasar el ratón, la burbuja no se ve", r && !r.visible, r);
  await page.hover(selMandar);
  await esperar(150);
  r = await burbuja(selMandar);
  assert("al pasar el ratón: «Mandar a revisar» (solo el nombre, desde TX-1g), dentro de la tabla y de la ventana",
    r.visible && r.texto === "Mandar a revisar" && r.enTabla && r.enVentana, r);
  await page.screenshot({ path: path.join(OUT, "cap_tx1e_burbuja.png") });
  await page.mouse.move(5, 5);
  await page.keyboard.press("Tab");
  await page.evaluate(s => document.querySelector(s).focus(), selVinc);
  await esperar(150);
  r = await burbuja(selVinc);
  assert("con el teclado (foco): la burbuja del distintivo dice la venta y cuándo se cobró",
    r.visible && /^Venta vinculada cobrada el \d{2}\/\d{2}\/\d{4}$/.test(r.texto), r);
  const etiqueta = await page.evaluate(s => document.querySelector(s).getAttribute("aria-label"), selVinc);
  assert("el lector de pantalla oye el texto entero (aria-label)", /^Venta vinculada: cobrada el /.test(etiqueta), etiqueta);
  await page.evaluate(() => document.activeElement.blur());

  /* ============ C) los iconos siguen haciendo lo mismo ============ */
  console.log("\nC) Los iconos hacen lo mismo que los botones de antes");
  await page.hover(selMandar);
  await page.click(selMandar);
  await esperar(300);
  r = await page.evaluate(() => !!document.querySelector(".tx-dlg"));
  assert("🔍 abre el diálogo «Mandar a revisar» (también pulsando encima de su burbuja)", r, r);
  await page.click('.tx-dlg [data-accion="cancelar"]');
  await esperar(200);
  await page.click(selVinc);
  await esperar(500);
  r = await page.evaluate(() => ({ hash: location.hash, abierto: document.getElementById("ccResueltos").open }));
  assert("🔗 lleva al vínculo en «Resueltos» de 🔍 Revisión", r.hash === "#revision" && r.abierto, r);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(400);
  r = await page.evaluate(() => window.__writes.length);
  assert("nada se ha guardado", r === base.writes, r);

  /* ============ D) oscuro y consola ============ */
  console.log("\nD) Oscuro y consola");
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(200);
  await page.hover(selMandar);
  await esperar(150);
  r = await burbuja(selMandar);
  const panel2 = await page.evaluate(() => {
    const p = document.createElement("div"); p.style.background = "var(--panel2)"; document.body.appendChild(p);
    const c = getComputedStyle(p).backgroundColor; p.remove(); return c;
  });
  assert("oscuro: la burbuja con el fondo del tema", r.visible && r.fondo === panel2, [r.fondo, panel2]);
  await page.screenshot({ path: path.join(OUT, "cap_tx1e_oscuro.png") });
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
