/* Verificación headless de varios cobros por venta: Chrome local +
 * puppeteer-core sobre http://localhost:8765. Datos 100 % sintéticos.
 *  A) formulario con «✅ Confirmar vínculo» y «➕ Añadir otro»,
 *     ambos gobernados por la misma validación
 *  B) MULTI-COBRO: en el buscador, «➕» por fila para elegir VARIOS
 *     pagos a la vez (contador en la nota y botón «🔗 Vincular N pagos…»); el
 *     formulario muestra la VENTA a la izquierda y CADA PAGO por separado
 *     (monto, fecha, hash y cantidad editable, sin sumas); confirmar guarda
 *     UNA venta con N asignaciones
 *  C) «➕ Añadir otro» guarda y REABRE el buscador con la misma
 *     salida (sin los cobros ya asignados del todo); encadenar un 3er cobro y confirmar normal cierra con toast recordatorio
 *  D) edición: «✏️ Editar» por venta abre el vínculo COMPLETO
 *     (todos sus cobros con cantidad editable); anular devuelve la huella
 *  E) puerta: escrituras solo vía handle; localStorage/ajustes intactos;
 *     0 errores de consola
 * Capturas cap_49_*.png
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   $env:NODE_PATH="$env:TEMP\opencode\ui2-browser\node_modules"
 *   node tests/navegador/verify49.js
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

  function montarCache() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
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
      leg(Hh(1), W, T, P1, tok18(250), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 5, 12, 10), "100"),
      leg(Hh(2), T, W, USDC, "300000000", "USD Coin", "USDC", "6", ts(2026, 5, 20, 18), "102"),
      leg(Hh(3), T, W, USDC, "179432100", "USD Coin", "USDC", "6", ts(2026, 5, 20, 18), "103"),
      leg(Hh(4), T, W, USDC, "60000000", "USD Coin", "USDC", "6", ts(2026, 5, 21, 9), "104"));
    state.cache = cache;
  }
  function montarCsv() {
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + state.config.wallet;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
  }
  async function clasificarYVer() {
    await page.evaluate(() => { location.hash = "#clasificacion"; });
    await esperar(150);
    await page.evaluate(() => ejecutarClasificacion()); // mismo camino que la app (js/14)
    await esperar(700);
    await page.evaluate(() => { location.hash = "#revision"; });
    await esperar(300);
  }
  const clickCentrado = async sel => {
    /* P25: en una tarjeta con «Es una venta…», «🔗 Vincular cobro…» sale al abrirla. */
    const venta = sel.endsWith('[data-accion="abrir-buscador"]') && !sel.includes("ccListaResueltos") &&
      await page.$(sel) === null && sel.replace('[data-accion="abrir-buscador"]', '[data-opcion="venta"]');
    if (venta && await page.$(venta)) await clickCentrado(venta);
    await page.evaluate(s => { const el = document.querySelector(s); if (el) el.scrollIntoView({ block: "center" }); }, sel);
    await esperar(120);
    await page.click(sel);
    await esperar(350);
  };
  const huella = () => page.evaluate(() => JSON.stringify(state.registros.map(r =>
    [r.clave, r.categoria, r.subcategoria, r.importe_usdt, r.revisar, r.nota, r.pago_diferido || null])));
  const setNum = async (sel, v) => {
    await page.$eval(sel, (el, val) => { el.value = val; el.dispatchEvent(new Event("input", { bubbles: true })); }, v);
    await esperar(250);
  };
  const elegirCobro = txt => page.evaluate(t => {
    const filas = [...document.querySelectorAll(".cc-dlg-item")];
    filas.find(f => (f.querySelector(".cc-dlg-amt").title + " " + f.textContent).includes(t)).querySelector('[data-accion="toggle-cobro"]').click();
  }, txt);

  /* ============ A) formulario con los dos botones ============ */
  console.log("\nA) Formulario: «✅ Confirmar vínculo» + «➕ Añadir otro»");
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montarCache);
  await page.evaluate(montarCsv);
  await page.evaluate(() => {
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
  });
  await clasificarYVer();
  const huellaBase = await huella();
  const claveS1 = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => ccEsSalidaPendiente(x, ctx)).clave;
  });
  await clickCentrado('.cc-item[data-clave="' + claveS1 + '"] [data-accion="abrir-buscador"]');
  await elegirCobro("300 USDC");
  await esperar(200);
  let r = await page.evaluate(() => ({
    boton: document.querySelector(".cc-dlg-proponer").textContent.trim(),
    nota: document.querySelector(".cc-dlg-nota").textContent,
  }));
  assert("A -> buscador con ➕ por fila: 1 cobro elegido y botón «🔗 Vincular cobro…»",
    r.boton === "🔗 Vincular cobro…" && r.nota.includes("1 elegido"), r); // sin punto final
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    const otro = f.querySelector(".cc-form-confirmar-otro");
    return { otroTxt: otro.textContent.trim(),
             habilitados: !otro.disabled && !f.querySelector(".cc-form-confirmar").disabled };
  });
  assert("A -> el botón de encadenar se llama «➕ Añadir otro cobro» y nace habilitado",
    r.otroTxt === "➕ Añadir otro cobro" && r.habilitados, r);
  await setNum('.cc-form [name="cantidad"]', "0");
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return { otroDis: f.querySelector(".cc-form-confirmar-otro").disabled,
             primDis: f.querySelector(".cc-form-confirmar").disabled };
  });
  assert("A -> con cantidad inválida AMBOS botones se deshabilitan (misma validación)",
    r.otroDis && r.primDis, r);
  await page.keyboard.press("Escape");
  await esperar(300);

  /* ============ B) multi-cobro: dos pagos elegidos a la vez ============ */
  console.log("\nB) 4.10: varios pagos elegidos con ➕ en el buscador");
  await clickCentrado('.cc-item[data-clave="' + claveS1 + '"] [data-accion="abrir-buscador"]');
  const ordenFilas = () => page.evaluate(() => [...document.querySelectorAll(".cc-dlg-item .cc-dlg-amt")].map(e => e.title).join("|"));
  const ordenAntes = await ordenFilas();
  await elegirCobro("300 USDC");
  await esperar(200);
  await elegirCobro("179,4321 USDC");
  await esperar(250);
  r = await page.evaluate(() => ({
    boton: document.querySelector(".cc-dlg-proponer").textContent.trim(),
    elegidas: document.querySelectorAll(".cc-dlg-item.elegida").length,
    nota: document.querySelector(".cc-dlg-nota").textContent,
  }));
  assert("B -> dos filas elegidas y botón «🔗 Vincular 2 cobros…»",
    r.boton === "🔗 Vincular 2 cobros…" && r.elegidas === 2, r);
  // B21 A11: (300 + 179,4321) ÷ 250 tokens; sin compras, sin % ni 💲.
  assert("B -> «2 elegidos: 1,92 USD/token» (el precio de los dos juntos) y las filas no cambian de sitio",
    r.nota.includes("2 elegidos: 1,92 USD/token") && !r.nota.includes("💲") && (await ordenFilas()) === ordenAntes, { nota: r.nota, ordenAntes });
  await page.screenshot({ path: path.join(OUT, "cap_49_buscador_multi.png"), fullPage: false });
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return {
      pagos: f.querySelectorAll(".cc-par-pago").length,
      previos: f.querySelectorAll(".cc-par-pago.previo").length,
      montos: [...f.querySelectorAll(".cc-par-pago .cc-par-amt")].map(x => x.textContent.trim()),
      fechas: [...f.querySelectorAll(".cc-par-pago .cc-par-fecha")].map(x => x.textContent.trim()),
      hashes: f.querySelectorAll(".cc-par-pago .cc-par-hash").length,
      inputs: [...f.querySelectorAll('.cc-par [name="cantidad"]')].map(x => x.value),
      venta: f.querySelectorAll(".cc-par-col").length,
    };
  });
  assert("B -> tarjeta-par: VENTA a la izquierda y CADA PAGO por separado (monto, fecha, hash y cantidad editable, sin sumas)",
    r.venta === 1 && r.pagos === 2 && r.previos === 0 &&
    JSON.stringify(r.montos) === JSON.stringify(["300 USDC", "179,4321 USDC"]) &&
    r.fechas.every(x => x === "📅 20/05/2026") && r.hashes === 2 &&
    JSON.stringify(r.inputs) === JSON.stringify(["300", "179.4321"]), r);
  await page.screenshot({ path: path.join(OUT, "cap_49_form_multi.png"), fullPage: false });
  await page.evaluate(() => {
    const inputs = [...document.querySelectorAll('.cc-par [name="cantidad"]')];
    inputs[1].value = "100";
    inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
  });
  await esperar(300);
  await page.click(".cc-form-confirmar");
  await esperar(900);
  r = await page.evaluate(() => ({
    ventas: state.cache.pagos_diferidos.ventas.length,
    asigs: state.cache.pagos_diferidos.ventas[0].asignaciones.map(a => a.cantidad_asignada),
    importe: state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "salida").importe_usdt,
    writes: window.__writes.length,
  }));
  assert("B -> confirmar guarda UNA venta con 2 asignaciones (300 + 100) y Σ 400 en la salida",
    r.ventas === 1 && JSON.stringify(r.asigs) === JSON.stringify([300, 100]) &&
    r.importe === 400 && r.writes === 1, r);

  /* ============ C) «➕ Añadir otro» reabre el buscador y encadena ============ */
  console.log("\nC) 4.9: «➕ Añadir otro» reabre el buscador con la misma salida");
  /* Una salida ya vinculada no sale en la lista de Revisión; su «➕»
     vive en «Resueltos (n)». */
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="abrir-buscador"][data-clave="' + claveS1 + '"]');
  await elegirCobro("60 USDC");
  await esperar(150);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return {
      previos: f.querySelectorAll(".cc-par-pago.previo").length,
      previa: (f.querySelector(".cc-form-previa") || {}).textContent || "",
      nuevos: f.querySelectorAll(".cc-par-pago:not(.previo)").length,
    };
  });
  assert("C -> al añadir un 3er cobro a la venta vinculada: los 2 pagos ya vinculados se ven por separado en lectura + el nuevo editable",
    r.previos === 2 && r.nuevos === 1 && r.previa === "", r); // sin el aviso «ya tiene el vínculo pd_…»
  await page.click(".cc-form-confirmar-otro");
  await esperar(900);
  r = await page.evaluate(() => {
    const dlg = document.querySelector(".cc-dlg");
    return {
      abierto: !!dlg,
      previa: (dlg.querySelector(".cc-form-previa") || {}).textContent || "",
      titulo: dlg.querySelector(".cc-dlg-head h3").textContent,
      filas: [...dlg.querySelectorAll(".cc-dlg-item")].map(x => x.querySelector(".cc-dlg-amt").title + " " + x.textContent),
      writes: window.__writes.length,
      asigs: state.cache.pagos_diferidos.ventas[0].asignaciones.length,
    };
  });
  // Sin aviso previo: repetiría el título.
  assert("C -> «➕ Añadir otro cobro» guarda el 3er cobro y REABRE el buscador (3 asignaciones, título «➕ Añadir otro cobro»)",
    r.abierto && r.writes === 2 && r.asigs === 3 && r.titulo === "➕ Añadir otro cobro" && r.previa === "", r);
  // Tampoco el parcial, que ya está en esta venta (se cambia con «✏️ Editar»).
  assert("C -> el buscador reabierto excluye los cobros ya asignados del todo y los que ya están en esta venta",
    r.filas.length === 0, r.filas);
  await page.keyboard.press("Escape");
  await esperar(300);

  /* ============ D) edición del vínculo COMPLETO + anular ============ */
  console.log("\nD) 4.10: «✏️ Editar» por venta abre el vínculo completo");
  await page.evaluate(() => { const d = document.getElementById("ccResueltos"); if (!d.open) d.open = true; });
  await esperar(250);
  r = await page.evaluate(() => ({
    editarPorVenta: document.querySelectorAll('#ccListaResueltos [data-accion="editar-vinculo"]').length,
    ventas: document.querySelectorAll("#ccListaResueltos .cc-vinc").length,
  }));
  assert("D -> un único «✏️ Editar» por venta (no por asignación)",
    r.editarPorVenta === 1 && r.ventas === 1, r);
  await clickCentrado('#ccListaResueltos [data-accion="editar-vinculo"]');
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return {
      pagos: f.querySelectorAll(".cc-par-pago").length,
      inputs: [...f.querySelectorAll('.cc-par [name="cantidad"]')].map(x => x.value),
      titulo: f.querySelector(".cc-dlg-head h3").textContent,
    };
  });
  assert("D -> editar abre los 3 cobros del vínculo con sus cantidades editables",
    r.pagos === 3 && JSON.stringify(r.inputs) === JSON.stringify(["300", "100", "60"]) &&
    r.titulo.includes("Editar vínculo"), r);
  await page.keyboard.press("Escape");
  await esperar(250);
  await page.evaluate(() => {
    document.querySelector('#ccListaResueltos [data-accion="anular-vinculo"]').click();
  });
  await esperar(900);
  assert("D -> anular devuelve la huella EXACTA a la base", (await huella()) === huellaBase);

  /* ============ E) puerta y consola ============ */
  console.log("\nE) Puerta y consola");
  r = await page.evaluate(() => ({
    writes: window.__writes.length,
    ls: Object.keys(localStorage).filter(k => k !== "reental_dark"),
    ajustes: Object.keys(state.cache.ajustes_usuario).length,
  }));
  assert("E -> 3 escrituras vía handle (2 confirmaciones + 1 anular); localStorage y ajustes intactos",
    r.writes === 3 && r.ls.length === 0 && r.ajustes === 0, r);
  const errs = erroresConsola();
  console.log("\nConsola: " + consola.length + " mensajes, " + errs.length + " errores (ruido favicon excluido)");
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("E -> 0 errores de consola en todos los escenarios", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  /* ============ F) B21-A11: «N elegidos» con la venta ya cobrada en parte ============ */
  console.log("\nF) B21-A11: el precio de los elegidos juntos cuenta lo ya cobrado");
  await clickCentrado('.cc-item[data-clave="' + claveS1 + '"] [data-accion="abrir-buscador"]');
  await elegirCobro("300 USDC");
  await esperar(150);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  await page.click(".cc-form-confirmar");
  await esperar(900);
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await clickCentrado('#ccListaResueltos [data-accion="abrir-buscador"][data-clave="' + claveS1 + '"]');
  await elegirCobro("179,4321 USDC");
  await esperar(150);
  await elegirCobro("60 USDC");
  await esperar(250);
  r = await page.evaluate(() => {
    const instr = [...document.querySelectorAll(".cc-dlg-nota .cc-dlg-instr")].find(x => x.textContent.includes("elegidos"));
    const span = instr && instr.querySelector("span[title]");
    return { texto: instr ? instr.textContent : "", burbuja: span ? span.title : "" };
  });
  // (300 ya cobrados + 179,4321 + 60) ÷ 250 tokens = 2,16.
  assert("F -> «2 elegidos: 2,16 USD/token» con lo ya cobrado, y la burbuja lo dice",
    r.texto.includes("2 elegidos: 2,16 USD/token") && r.burbuja === "(Ya cobrado + elegidos) ÷ tokens de la venta", r);
  await page.keyboard.press("Escape");
  await esperar(250);

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
