/* Arnés del buscador de «🔗 Vincular cobro…» de pagos diferidos, en la app
 * real, con datos sintéticos.
 *  A) Se abre de 60 días antes a 60 después de la venta;
 *     arriba los cobros con 📍; «Pagos sugeridos»; «Ver N más fuera de las
 *     fechas»; importes con 2 decimales y el exacto en su burbuja.
 *  B) un elegido no se pierde a mitad de teclear una fecha.
 *  C) «ver N más fuera de las fechas» borra las fechas; orden por ⭐ y
 *     luego por cercanía a la venta.
 *  D) «➕ Añadir otro» reabre con tus filtros (sin fechas); abrirlo de
 *     nuevo desde la tarjeta vuelve a las de la venta.
 *
 * DATOS 100% SINTETICOS. Ejecución (servidor en 8765 y NODE_PATH a puppeteer-core):
 *   node tests/navegador/verifyf6.js
 */
"use strict";
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");

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
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    if (m.type() === "error" && !/favicon/i.test(((m.location() || {}).url || "") + " " + m.text())) errores.push(m.text());
  });

  /* Venta de 4 tokens el 14/06/2026 al comprador T; cobros: A de T (+5 d),
     B de otro (+2 d), C de T (−2 d) y D de otro (+98 d, fuera de las fechas). */
  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20), Z = "0x" + "88".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "cd".repeat(30);
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
      leg(Hh(1), W, T, P1, tok18(4), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 20), "100"),
      leg(Hh(2), T, W, USDC, tok6(440), "USD Coin", "USDC", "6", ts(2026, 6, 19, 18), "102"),
      leg(Hh(3), Z, W, USDT, tok6(300), "Tether USD", "USDT", "6", ts(2026, 6, 16, 10), "103"),
      leg(Hh(4), T, W, USDC, tok6(100), "USD Coin", "USDC", "6", ts(2026, 6, 12, 9), "104"),
      leg(Hh(5), Z, W, USDC, tok6(50), "USD Coin", "USDC", "6", ts(2026, 9, 20, 9), "105"));
    state.cache = cache;
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
  const leer = () => page.evaluate(() => {
    const dlg = document.querySelector(".cc-dlg");
    if (!dlg) return null;
    return {
      desde: dlg.querySelector('[name="desde"]').value,
      hasta: dlg.querySelector('[name="hasta"]').value,
      nota: dlg.querySelector(".cc-dlg-nota").textContent,
      leyenda: (dlg.querySelector(".cc-dlg-leyenda") || {}).textContent || "",
      salida: dlg.querySelector(".cc-dlg-salida").textContent,
      filas: [...dlg.querySelectorAll(".cc-dlg-item")].map(x => ({
        amt: x.querySelector(".cc-dlg-amt").title,
        visto: x.querySelector(".cc-dlg-amt").textContent.trim(),
        estrellas: (x.querySelector(".cc-dlg-encaja") || {}).textContent || "",
        motivo: (x.querySelector(".cc-dlg-encaja") || { getAttribute: () => "" }).getAttribute("aria-label") || "",
        elegida: x.classList.contains("elegida"),
      })),
      elegidos: ccDlg ? ccDlg.elegidos.length : -1,
    };
  });
  const elegir = amt => page.evaluate(t => {
    const fila = [...document.querySelectorAll(".cc-dlg-item")]
      .find(x => x.querySelector(".cc-dlg-amt").title === t);
    fila.querySelector('[data-accion="toggle-cobro"]').click();
  }, amt);

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarCache);
  await page.evaluate(() => { // archivo de rendimientos mínimo (la clasificación lo pide)
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,1,0,1,0,\"['0x" + "99".repeat(32) + "']\"," + state.config.wallet;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error(csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  });
  await page.evaluate(() => {
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  });
  await page.evaluate(() => { location.hash = "#clasificacion"; });
  await esperar(150);
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(800);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  const claveS = await page.evaluate(() => state.registros.find(r => r.simbolo === "RALC1").clave);

  console.log("\nA) Al abrir: de 60 días antes a 60 después, 📍 arriba, leyenda y lo que queda fuera");
  await clickCentrado('.cc-item[data-clave="' + claveS + '"] [data-accion="abrir-buscador"]');
  let r = await leer();
  assert("A -> fechas del 15/04 al 13/08 (60 días antes y después)", r.desde === "2026-04-15" && r.hasta === "2026-08-13", r);
  assert("A -> la salida en su bloque, con su etiqueta", r.salida.startsWith("Venta") && r.salida.includes("4 RALC1"), r.salida);
  assert("A -> los cobros del comprador (📍) arriba por cercanía (−2 d, +5 d) y el otro debajo",
    r.filas.map(f => f.amt + f.estrellas).join("|") === "100 USDC📍|440 USDC📍|300 USDT", r.filas);
  assert("A -> importe con 2 decimales y el exacto en su burbuja", r.filas[1].visto === "440,00 USDC" && r.filas[1].amt === "440 USDC", r.filas[1]);
  // La burbuja del icono es su nombre; la frase larga, en la leyenda.
  assert("A5 -> el 📍 dice su motivo", r.filas[0].motivo === "Misma dirección", r.filas[0]);
  assert("A5 -> «Cobros sugeridos (revísalo)» con el 📍 (sin lo que te costó, sin la línea del 💲)",
    r.leyenda === "Cobros sugeridos (revísalo):📍 Coincide con la dirección a la que enviaste los tokens.", r.leyenda);
  assert("A3 -> la nota avisa del que queda fuera de las fechas", r.nota.includes("Ver 1 más fuera de las fechas"), r.nota);
  assert("A -> «Cobros posibles (3)» e «Instrucciones»",
    r.nota.startsWith("Cobros posibles (3)") && r.nota.includes("Instrucciones: pulsa ➕"), r.nota);

  console.log("\nB) A1: el elegido sigue elegido a mitad de teclear una fecha");
  await elegir("300 USDT");
  await page.evaluate(() => {
    const h = document.querySelector('.cc-dlg [name="hasta"]');
    h.value = "0002-08-13";
    h.dispatchEvent(new Event("input", { bubbles: true }));
  });
  r = await leer();
  assert("B -> con «hasta» a medias, el elegido sigue elegido y se ve",
    r.elegidos === 1 && r.filas.length === 1 && r.filas[0].amt === "300 USDT" && r.filas[0].elegida, r);

  console.log("\nC) A3: ver los de fuera de las fechas; orden por ⭐ y cercanía");
  await page.evaluate(() => document.querySelector('.cc-dlg-nota [data-accion="sin-fechas"]').click());
  await esperar(200);
  r = await leer();
  assert("C -> sin fechas, los 4 cobros", r.desde === "" && r.hasta === "" && r.filas.length === 4, r);
  assert("C -> orden: 📍 por cercanía (−2 d, +5 d) y luego sin pistas (+2 d, +98 d)",
    r.filas.map(f => f.amt).join("|") === "100 USDC|440 USDC|300 USDT|50 USDC", r.filas.map(f => f.amt));
  assert("C -> el elegido sigue elegido", r.elegidos === 1 && r.filas.find(f => f.amt === "300 USDT").elegida, r);

  console.log("\nD) A4: «➕ Añadir otro» reabre con tus filtros");
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  await page.click(".cc-form-confirmar-otro");
  await esperar(1200);
  r = await leer();
  assert("D -> reabre sin fechas (como lo dejaste) y sin el cobro ya vinculado",
    r && r.desde === "" && r.hasta === "" && r.filas.map(f => f.amt).join("|") === "100 USDC|440 USDC|50 USDC", r);
  await page.keyboard.press("Escape");
  await esperar(300);
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="abrir-buscador"][data-clave="' + claveS + '"]');
  r = await leer();
  assert("D -> abierto de nuevo desde la tarjeta, vuelve a las fechas de la venta",
    r && r.desde === "2026-04-15" && r.hasta === "2026-08-13", r);
  await page.keyboard.press("Escape");

  assert("0 errores de consola", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
