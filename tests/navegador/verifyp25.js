/* Arnés de P25: la tarjeta de una venta por vincular en 🔍 Revisión y la
 * venta cobrada en €. Chrome local + puppeteer-core sobre
 * http://localhost:8765. DATOS 100 % SINTÉTICOS. Capturas cap_p25_*.png.
 *
 * Comprueba:
 *  A) cerrada, la tarjeta lleva «Es una venta…» y «Movimiento neutro», sin
 *     el botón suelto de vincular; «🔗 Por vincular» a la derecha, debajo de
 *     «A revisar».
 *  B) «Es una venta…» abre «Cobrado [ ] USD», Guardar, Cancelar, «En euros
 *     (€)» y «🔗 Elegir el cobro recibido…» en una línea, y el ≈ € con su
 *     BCE debajo de la casilla; al escribir, los botones no se mueven.
 *  C) «En euros (€)»: la casilla en €, sin ≈ €, lo escrito se queda (con
 *     el cursor al final) y «En dólares (USD)» vuelve.
 *  D) guardada en €: el ajuste lleva cobrado_eur (sin importe_usdt), la
 *     tarjeta se va, «Ya decididos» dice «Venta · 410,50 €» y 📒 enseña
 *     «410,50 €».
 *  E) «🔗 Elegir el cobro recibido…» abre la ventana de vincular de siempre.
 *  F) oscuro y consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyp25.js
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
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1500,1100"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1100 });
  const consola = [];
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
  const erroresConsola = () => consola.filter(m =>
    (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));

  /* Cache sintética: 5 tokens comprados y dos salidas a una dirección de
     Reental el mismo día (por vincular), y un cobro en USDC una semana después. */
  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20), R = "0x" + "ce".repeat(20), C = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const t18 = u => BigInt(Math.round(u * 1e6)).toString() + "000000000000";
    const t6 = u => BigInt(Math.round(u * 1e6)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Costa Prueba 1", simbolo: "Reental-CPR-1" } };
    const leg = (h, from, to, c, value, name, sym, dec, t, blk) => ({ blockNumber: blk, timeStamp: t, hash: h, from, to,
      contractAddress: c, value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(5), C, W, P1, t18(5), "Reental Costa Prueba 1", "Reental-CPR-1", "18", ts(2026, 1, 10, 9), "50"),
      leg(Hh(1), W, R, P1, t18(0.25), "Reental Costa Prueba 1", "Reental-CPR-1", "18", ts(2026, 6, 18, 10), "100"),
      leg(Hh(2), W, R, P1, t18(1.75), "Reental Costa Prueba 1", "Reental-CPR-1", "18", ts(2026, 6, 18, 11), "101"),
      leg(Hh(3), R, W, USDC, t6(410.5), "USD Coin", "USDC", "6", ts(2026, 6, 25, 10), "103"));
    cache.tipos_bce = {};
    for (let d = Date.UTC(2026, 0, 1); d <= Date.UTC(2026, 8, 30); d += 864e5) cache.tipos_bce[new Date(d).toISOString().slice(0, 10)] = 1.16;
    cache.tipos_bce["2026-06-18"] = 1.25;
    state.cache = cache;
    const csv = cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet",
      "\"Costa Prueba 1#2026-T1\",2026-04-10,10,0,10,0,\"['0x" + "99".repeat(32) + "']\"," + W].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  }
  const clickCentrado = async sel => {
    await page.evaluate(s => { document.querySelectorAll("#toasts .toast").forEach(t => t.remove());
      const el = document.querySelector(s); if (el) el.scrollIntoView({ block: "center", behavior: "instant" }); }, sel);
    await esperar(120);
    await page.click(sel);
    await esperar(400);
  };
  const tarjeta = k => '#ccLista .cc-item[data-clave="' + k + '"]';

  /* ============ Preparación ============ */
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarCache);
  await page.evaluate(() => {
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  });
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(800);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(600);
  const [k1, k2] = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.filter(x => ccEsSalidaPendiente(x, ctx)).map(x => x.clave);
  });

  /* ============ A) cerrada ============ */
  console.log("A) Cerrada");
  let r = await page.evaluate(sel => {
    const c = document.querySelector(sel);
    const chip = c.querySelector(".cc-cand.salida"), cat = c.querySelector(".cc-cat"), cr = c.getBoundingClientRect();
    return { botones: [...c.querySelectorAll(".cc-dec")].map(b => b.textContent.trim()),
      buscador: c.querySelectorAll('[data-accion="abrir-buscador"]').length,
      enMeta: !!chip && !!chip.closest(".cc-meta"),
      derecha: chip ? cr.right - chip.getBoundingClientRect().right : null,
      debajo: chip && cat ? chip.getBoundingClientRect().top - cat.getBoundingClientRect().bottom : null };
  }, tarjeta(k1));
  assert("«Es una venta…» y «Movimiento neutro», sin el botón suelto de vincular",
    JSON.stringify(r.botones) === JSON.stringify(["Es una venta…", "Movimiento neutro"]) && r.buscador === 0, r);
  assert("«🔗 Por vincular» a la derecha, debajo de «A revisar»", r.enMeta && r.derecha < 30 && r.debajo >= 0, r);
  await (await page.$("#ccLista")).screenshot({ path: path.join(OUT, "cap_p25_cerrada.png") });

  /* ============ B) «Es una venta…» abierta ============ */
  console.log("\nB) «Es una venta…»");
  await clickCentrado(tarjeta(k1) + ' [data-opcion="venta"]');
  const forma = () => page.evaluate(sel => {
    const f = document.querySelector(sel + " .cc-dec-form");
    if (!f) return null;
    const input = f.querySelector(".cc-dec-valor"), eur = f.querySelector(".cc-dec-eur");
    const ir = input.getBoundingClientRect(), er = eur.getBoundingClientRect();
    return { botones: [...f.querySelectorAll("button")].map(b => b.textContent.trim()),
      xs: [...f.querySelectorAll("button")].map(b => Math.round(b.getBoundingClientRect().left)),
      tops: [...f.querySelectorAll("button")].map(b => Math.round(b.getBoundingClientRect().top)),
      unidad: f.querySelector("label").textContent.trim().replace(/^Cobrado\s*/, ""),
      valor: input.value, foco: document.activeElement === input,
      eur: eur.textContent, eurVisible: getComputedStyle(eur).display !== "none",
      eurDebajo: er.top - ir.bottom, eurIzq: er.left + parseFloat(getComputedStyle(eur).paddingLeft) - ir.left };
  }, tarjeta(k1));
  r = await forma();
  assert("en una línea: Guardar, Cancelar, «En euros (€)» y «🔗 Elegir el cobro recibido…»",
    r && JSON.stringify(r.botones) === JSON.stringify(["Guardar", "Cancelar", "En euros (€)", "🔗 Elegir el cobro recibido…"]) &&
    new Set(r.tops).size === 1 && r.unidad === "USD" && r.foco, r);
  const xsAntes = r.xs;
  await page.type(tarjeta(k1) + " .cc-dec-valor", "410,5");
  await esperar(300);
  r = await forma();
  assert("el ≈ € con su BCE: «≈ 328,40 € (BCE del 18/06/2026)»", r.eur === "≈ 328,40 € (BCE del 18/06/2026)", r.eur);
  assert("debajo de la casilla, empezando con ella", r.eurVisible && r.eurDebajo >= 0 && Math.abs(r.eurIzq) < 12, r);
  assert("al escribir, los botones no se mueven", JSON.stringify(r.xs) === JSON.stringify(xsAntes), [xsAntes, r.xs]);
  await (await page.$(tarjeta(k1))).screenshot({ path: path.join(OUT, "cap_p25_usd.png") });

  /* ============ C) «En euros (€)» ============ */
  console.log("\nC) «En euros (€)»");
  await clickCentrado(tarjeta(k1) + ' [data-accion="decidir-moneda"]');
  r = await forma();
  assert("en €: la casilla en €, lo escrito se queda, sin ≈ € y con el foco",
    r.unidad === "€" && r.valor === "410,5" && !r.eurVisible && r.foco && r.botones[2] === "En dólares (USD)", r);
  await (await page.$(tarjeta(k1))).screenshot({ path: path.join(OUT, "cap_p25_eur.png") });
  r = await page.$eval(tarjeta(k1) + " .cc-dec-valor", i => [i.selectionStart, i.selectionEnd, i.value.length]);
  assert("tras cambiar de moneda, el cursor al final (seguir escribiendo no borra lo escrito)", r[0] === r[2] && r[1] === r[2], r);
  await clickCentrado(tarjeta(k1) + ' [data-accion="decidir-moneda"]');
  r = await forma();
  assert("«En dólares (USD)» vuelve, con su ≈ €", r.unidad === "USD" && r.valor === "410,5" && r.eurVisible && r.botones[2] === "En euros (€)", r);
  await clickCentrado(tarjeta(k1) + ' [data-accion="decidir-moneda"]');

  /* ============ D) guardada en € ============ */
  console.log("\nD) Guardada en €");
  const writesAntes = await page.evaluate(() => window.__writes.length);
  await page.focus(tarjeta(k1) + " .cc-dec-valor");
  await page.keyboard.press("Enter");
  await esperar(900);
  r = await page.evaluate(k => {
    const h = ccBuscarAjuste(state.cache.ajustes_usuario, k);
    const reg = state.registros.find(x => x.clave === k);
    return { ajuste: h && h.ajuste, cat: reg.categoria, revisar: reg.revisar, writes: window.__writes.length,
      tarjeta: !!document.querySelector('#ccLista .cc-item[data-clave="' + k + '"]'),
      decididos: (document.getElementById("ccListaResueltos") || {}).textContent || "" };
  }, k1);
  assert("el ajuste: cobrado_eur 410,5, sin importe_usdt, y guardado", r.ajuste && r.ajuste.cobrado_eur === 410.5 &&
    !("importe_usdt" in r.ajuste) && r.ajuste.categoria === "VENTA" && r.writes > writesAntes, r);
  assert("la venta deja «Por decidir»", r.cat === "VENTA" && r.revisar === false && !r.tarjeta, r);
  assert("«Ya decididos»: «Venta · 410,50 €»", r.decididos.includes("Venta · 410,50 €"), r.decididos.slice(0, 300));
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(700);
  r = await page.evaluate(k => {
    const tr = document.querySelector('#txCuerpo tr.tx-fila[data-clave="' + k + '"]');
    return tr ? tr.textContent : null;
  }, k1);
  assert("📒: la venta con «410,50 €»", !!r && r.includes("410,50 €") && !r.includes("410,50 USD"), r);

  /* ============ E) el buscador de cobros ============ */
  console.log("\nE) «🔗 Elegir el cobro recibido…»");
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(700);
  await clickCentrado(tarjeta(k2) + ' [data-opcion="venta"]');
  await clickCentrado(tarjeta(k2) + ' [data-accion="abrir-buscador"]');
  r = await page.evaluate(() => {
    const dlg = document.querySelector(".cc-dlg");
    return dlg ? { titulo: dlg.querySelector(".cc-dlg-head h3").textContent, texto: dlg.textContent } : null;
  });
  assert("abre la ventana de vincular de siempre, con la venta de 1,75", r && r.titulo === "🔗 Vincular cobro" &&
    r.texto.includes("1,75"), r && r.titulo);
  await page.keyboard.press("Escape");
  await esperar(300);

  /* ============ F) oscuro y consola ============ */
  console.log("\nF) Oscuro y consola");
  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(250);
  r = await page.evaluate(sel => {
    const f = document.querySelector(sel + " .cc-dec-form");
    return f ? { fondo: getComputedStyle(f).backgroundColor, texto: getComputedStyle(f.querySelector(".cc-dec-eur")).color } : null;
  }, tarjeta(k2));
  assert("oscuro: el formulario con los colores del tema", r && r.fondo !== "rgb(255, 255, 255)", r);
  await (await page.$(tarjeta(k2))).screenshot({ path: path.join(OUT, "cap_p25_oscuro.png") });
  await page.evaluate(() => document.body.classList.remove("dark"));
  const errs = erroresConsola();
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("0 errores de consola", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
