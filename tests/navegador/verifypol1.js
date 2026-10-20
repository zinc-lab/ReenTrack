/* Verificación headless de los precios de POL (precios de POL en 🔍 Revisión, como
 * los de RNT: sin formulario libre, solo las fechas que el motor necesita):
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS: dos compras de POL sin coste (una de hace más de 365 días) y
 * una salida de POL a una dirección que no se conoce; CoinGecko simulado.
 * Capturas cap_pol1_*.png.
 *
 *  P1) recién clasificado: el bloque de POL se abre solo, «⚠ 3 sin precio»,
 *      tres filas con su enlace; sin formulario libre.
 *  P2) el paso de precios de la sincronización trae los dos de los últimos
 *      365 días: queda la vieja, con el enlace a MATIC y su motivo.
 *  P3) se escribe su precio (con coma) y Enter: se guarda en la cache, el
 *      aviso se va y la tabla de fechas sin precio se esconde.
 *  P4) ✕ en un precio que el motor necesita: la fecha vuelve a faltar.
 *  P5) la clasificación no cambia; 375 px sin scroll de página, oscuro;
 *      0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifypol1.js
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
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
  const dialogos = [];
  const aceptar = d => { dialogos.push(d.message()); d.accept(); };
  page.on("dialog", aceptar);

  function montar() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), EX = "0x" + "c1".repeat(20), X = "0x" + "88".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "cd".repeat(30);
    const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
    const pol18 = u => (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString();
    const tx = (h, from, to, u, t, blk) => ({ blockNumber: blk, timeStamp: t, hash: h, from, to, value: pol18(u),
      isError: "0", gasUsed: "21000", gasPrice: "30000000000" });
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.transacciones.wallet_normales.push(
      tx(Hh(1), EX, W, 47, ts(2024, 2, 7), "10"),
      tx(Hh(2), EX, W, 230, ts(2026, 4, 23), "20"),
      tx(Hh(3), W, X, 40, ts(2026, 8, 1), "30"));
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
    // CoinGecko simulado: la serie diaria de POL del último año.
    const dia = iso => Date.parse(iso + "T00:00:00Z");
    window.__llamadas = [];
    window.fetch = async url => {
      window.__llamadas.push(String(url));
      return { status: 200, json: async () => ({ prices: [[dia("2026-04-23"), 0.0777], [dia("2026-08-01"), 0.09]] }) };
    };
    coingeckoRitmo.dormir = async () => {};
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  // Sin renderPanel() a mano: el bloque de POL lo pinta la clasificación
  // (si no, saldría vacío al abrir la app).
  await page.evaluate(() => { ejecutarClasificacion(); });
  await esperar(500);

  const huella = () => page.evaluate(() => JSON.stringify(state.registros.map(r =>
    [r.clave, r.categoria, r.subcategoria, r.revisar, r.cantidad, r.nota])));
  const bloque = () => page.evaluate(() => ({
    abierto: document.getElementById("rvPreciosPol").open,
    aviso: document.getElementById("rvPreciosPolAviso").textContent,
    tablaOculta: document.getElementById("rvPolFaltantes").hidden,
    filas: [...document.querySelectorAll("#tablaPreciosPolFaltantes tr")].map(tr => ({
      fecha: tr.children[0].textContent, href: (tr.querySelector("a") || {}).href, motivo: tr.children[1].textContent })),
    guardados: [...document.querySelectorAll("#tablaPreciosPol tr")].map(tr => tr.children[0].textContent),
  }));
  const h0 = await huella();

  /* ============ P1) recién clasificado ============ */
  const b1 = await bloque();
  assert("P1 -> el bloque de POL se abre solo con «⚠ 3 sin precio»", b1.abierto && b1.aviso === "⚠ 3 sin precio" && !b1.tablaOculta, b1);
  assert("P1 -> tres fechas, en orden, cada una con su enlace a CoinGecko",
    JSON.stringify(b1.filas.map(f => f.fecha)) === JSON.stringify(["07/02/2024 ↗", "23/04/2026 ↗", "01/08/2026 ↗"]) &&
    /coins\/polygon\/historical_data\?start=2024-02-07/.test(b1.filas[0].href) &&
    /coins\/polygon\/historical_data\?start=2026-04-23/.test(b1.filas[1].href), b1.filas);
  const sinForm = await page.evaluate(() => !document.getElementById("btnAddPrecioPol") && !document.getElementById("inpPrecioPolFecha"));
  assert("P1 -> sin formulario libre de fecha y precio", sinForm);
  await page.evaluate(() => document.getElementById("rvPreciosPol").scrollIntoView());
  await page.screenshot({ path: path.join(OUT, "cap_pol1_faltan.png") });

  /* ============ P2) el paso de precios trae los de los últimos 365 días ============ */
  await page.evaluate(async () => { await pasoPol(); renderPanel(); });
  const b2 = await bloque();
  const llamadas = await page.evaluate(() => window.__llamadas);
  assert("P2 -> una sola llamada, a la serie de POL", llamadas.length === 1 && /polygon-ecosystem-token\/market_chart/.test(llamadas[0]), llamadas);
  assert("P2 -> queda la de 2024, con el motivo de los 365 días", b2.aviso === "⚠ 1 sin precio" && b2.filas.length === 1 &&
    b2.filas[0].fecha === "07/02/2024 ↗" && /365/.test(b2.filas[0].motivo), b2);
  assert("P2 -> los dos precios traídos salen en la tabla de guardados",
    JSON.stringify(b2.guardados) === JSON.stringify(["01/08/2026", "23/04/2026"]), b2.guardados);

  /* ============ P3) escribir el que falta ============ */
  const w0 = await page.evaluate(() => window.__writes.length);
  await page.click("#tablaPreciosPolFaltantes input");
  await page.keyboard.type("0,52");
  await page.keyboard.press("Enter");
  await esperar(400);
  const b3 = await bloque();
  const p3 = await page.evaluate(() => [state.cache.precios_pol["2024-02-07"], window.__writes.length,
    JSON.parse(window.__writes[window.__writes.length - 1] || "{}").precios_pol]);
  assert("P3 -> guardado (con coma) y escrito en el archivo", p3[0] === 0.52 && p3[1] > w0 && p3[2] && p3[2]["2024-02-07"] === 0.52, p3);
  assert("P3 -> sin aviso y sin tabla de fechas sin precio", b3.aviso === "" && b3.tablaOculta && b3.guardados.length === 3, b3);
  await page.screenshot({ path: path.join(OUT, "cap_pol1_guardado.png") });

  /* ============ P4) ✕ en un precio que el motor necesita ============ */
  // Pregunta antes; con «Cancelar» no borra nada.
  const nDialogos = dialogos.length;
  page.off("dialog", aceptar);
  page.once("dialog", d => { dialogos.push(d.message()); d.dismiss(); });
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("#tablaPreciosPol tr")].find(x => x.children[0].textContent === "07/02/2024");
    tr.querySelector("button").click();
  });
  await esperar(300);
  page.on("dialog", aceptar);
  assert("P4 -> A3: el ✕ pregunta y, si cancelas, el precio sigue",
    dialogos.length === nDialogos + 1 && /CoinGecko ya no lo da/.test(dialogos[nDialogos]) &&
    await page.evaluate(() => state.cache.precios_pol["2024-02-07"] === 0.52), dialogos);
  await page.evaluate(() => {
    const tr = [...document.querySelectorAll("#tablaPreciosPol tr")].find(x => x.children[0].textContent === "23/04/2026");
    tr.querySelector("button").click();
  });
  await esperar(400);
  const b4 = await bloque();
  assert("P4 -> A3: al aceptar se borra (con su aviso de que se volverá a pedir)",
    /se volverá a pedir a CoinGecko/.test(dialogos[dialogos.length - 1]), dialogos);
  assert("P4 -> la fecha borrada vuelve a faltar", b4.aviso === "⚠ 1 sin precio" && b4.filas.length === 1 && b4.filas[0].fecha === "23/04/2026 ↗", b4);
  assert("P4 -> y su motivo es que se pedirá a CoinGecko al actualizar", b4.filas[0].motivo === "se pedirá a CoinGecko al actualizar", b4.filas[0]);

  /* ============ P5) clasificación, móvil y oscuro ============ */
  await page.evaluate(() => { ejecutarClasificacion(); });
  await esperar(300);
  assert("P5 -> la clasificación no cambia (los precios no la tocan)", (await huella()) === h0);
  // Decidir y deshacer en el depósito del 19/06 (el que falta) se ve al momento.
  const claveSalida = await page.evaluate(() => state.registros.find(r => r.contrato === "pol" && r.categoria === "DEPOSITO" && r.fecha.startsWith("2026-04-23")).clave);
  await page.evaluate(k => { state.cache.ajustes_usuario[k] = { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" }; ejecutarClasificacion(); }, claveSalida);
  await esperar(300);
  const a1 = await bloque();
  assert("P5 -> A1: el depósito decidido como neutro ya no pide precio", a1.aviso === "" && a1.tablaOculta, a1);
  await page.evaluate(k => { delete state.cache.ajustes_usuario[k]; ejecutarClasificacion(); }, claveSalida);
  await esperar(300);
  const a1b = await bloque();
  assert("P5 -> A1: al deshacerlo, vuelve a faltar", a1b.aviso === "⚠ 1 sin precio" && a1b.filas.length === 1, a1b);
  // Con algo escrito y el bloque cerrado, cambiar el vault (se borran
  // los registros y se reclasifica) no lo vacía, no borra lo escrito y no lo abre.
  await page.evaluate(() => {
    document.getElementById("rvPreciosPol").open = false;
    document.querySelector("#tablaPreciosPolFaltantes input").value = "0.07";
    document.getElementById("cfgWallet").value = state.config.wallet;
    document.getElementById("cfgEthKey").value = state.config.etherscan_api_key;
    document.getElementById("cfgVault").value = state.config.vault = "0x" + "33".repeat(20);
    arrTrasCambioConfig();
  });
  await esperar(800);
  const a4 = await page.evaluate(() => ({ abierto: document.getElementById("rvPreciosPol").open,
    escrito: (document.querySelector("#tablaPreciosPolFaltantes input") || {}).value,
    aviso: document.getElementById("rvPreciosPolAviso").textContent, registros: Array.isArray(state.registros) }));
  assert("P5 -> A4: al cambiar el vault, lo escrito sigue, el bloque sigue cerrado y con su aviso",
    a4.registros && !a4.abierto && a4.escrito === "0.07" && a4.aviso === "⚠ 1 sin precio", a4);
  await page.setViewport({ width: 375, height: 800 });
  await page.evaluate(() => { document.getElementById("rvPreciosPol").open = true; document.getElementById("rvPreciosPol").scrollIntoView(); });
  await esperar(200);
  const anchoMovil = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  assert("P5 -> 375 px sin scroll horizontal de página", anchoMovil);
  await page.screenshot({ path: path.join(OUT, "cap_pol1_movil.png") });
  await page.setViewport({ width: 1366, height: 900 });
  await page.evaluate(() => { const b = document.getElementById("btnDark") || document.querySelector("[data-accion='oscuro']"); if (b) b.click(); else document.documentElement.dataset.theme = "dark"; });
  await esperar(200);
  await page.evaluate(() => document.getElementById("rvPreciosPol").scrollIntoView());
  await page.screenshot({ path: path.join(OUT, "cap_pol1_oscuro.png") });
  assert("P5 -> 0 errores en la consola", errores.length === 0, errores);

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> HAY FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
