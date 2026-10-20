/* Verificación headless del flujo de vincular: Chrome local +
 * puppeteer-core sobre http://localhost:8765. Datos 100 % sintéticos.
 *  A) fixture con un entrante de cada familia + VENTA con pago en su hash;
 *     la card de salida pendiente abre el buscador SIN casilla «ver todos»
 *  B) al elegir cobro y pulsar «🔗 Vincular pago…» el FORMULARIO se abre
 *     DIRECTO (sin propuesta intermedia ni botón «📝 Crear vínculo…»); al
 *     confirmar guarda y reclasifica
 *  C) formulario mínimo — tarjeta-par VENTA ↔ PAGO DIFERIDO (cantidad,
 *     propiedad/activo, fecha, hash), sin «Hoy: …», sin pregunta de
 *     liquidación, sin importe pactado, sin moneda, sin plegable técnico;
 *     cantidad precargada = disponible; ⓘ del reparto; nota
 *  D) zona de avisos con resumen + aplicados, avisos cortos y sin el
 *     plegable «Ver cambios»
 *  E) escape contextual — búsqueda sin resultados ofrece «mostrar
 *     también esos (N)» y, una vez ampliada, «ver solo los sin explicar»
 *  F) vínculo parcial: marcas de pendiente + vinculada; Resueltos con
 *     «Total asignado:» y edición mínima (cantidad + nota) en su sitio
 *  G) modo oscuro + 0 errores de consola + puerta (writes vía handle)
 * Capturas cap_48_*.png
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   $env:NODE_PATH="$env:TEMP\opencode\ui2-browser\node_modules"
 *   node tests/navegador/verify48.js
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
    const D = "0x" + "d1".repeat(20), T = "0x" + "77".repeat(20);
    const RW = "0x" + "e5".repeat(20);
    const DS = "0x" + "b7".repeat(20);
    const XX = "0x" + "f9".repeat(20);
    const P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20), P3 = "0x" + "a3".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0,
                     etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
      [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Brezo 2", simbolo: "RBRE2" },
      [P3]: { estado: "CANDIDATA", nombre_reental: "Prueba Cedro 3", simbolo: "RCED3" },
    };
    cache.contratos_aprendidos = {
      DEFI_REWARDS: { [RW]: { nota: "contrato sintético de rewards" } },
      DISTRIBUIDOR: { [DS]: { nota: "distribuidor sintético" } },
    };
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), W, T, P1, tok18(250), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 5, 12, 8), "100"),
      leg(Hh(2), W, T, P2, tok18(100), "Reental Prueba Brezo 2", "RBRE2", "18", ts(2026, 5, 13, 8), "101"),
      leg(Hh(3), T, W, USDC, "300000000", "USD Coin", "USDC", "6", ts(2026, 5, 20, 18), "102"),
      leg(Hh(3), T, W, USDC, "179432100", "USD Coin", "USDC", "6", ts(2026, 5, 20, 18), "102"),
      leg(Hh(4), W, BURN, P1, tok18(40), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 5, 31, 12), "103"),
      leg(Hh(6), W, T, P3, tok18(10), "Prueba Cedro 3", "RCED3", "18", ts(2026, 3, 1, 10), "104"),
      leg(Hh(7), W, T, USDT, "50000000", "Tether USD", "USDT", "6", ts(2026, 5, 23, 9), "105"),
      leg(Hh(8), W, T, P2, tok18(60), "Reental Prueba Brezo 2", "RBRE2", "18", ts(2025, 12, 15, 10), "106"),
      leg(Hh(9), T, W, USDC, "60000000", "USD Coin", "USDC", "6", ts(2026, 1, 10, 12), "107"),
      leg(Hh(10), RW, W, USDT, "12000000", "Tether USD", "USDT", "6", ts(2026, 4, 13, 10), "108"),
      leg(Hh(13), W, T, P1, tok18(30), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 3, 10), "112"),
      leg(Hh(13), T, W, USDT, "250000000", "Tether USD", "USDT", "6", ts(2026, 6, 3, 10), "112"));
    cache.transacciones.vault_tokens.push(
      leg(Hh(5), D, V, USDT, "400000000", "Tether USD", "USDT", "6", ts(2026, 4, 8, 12), "109"),
      leg(Hh(11), DS, V, USDT, "25000000", "Tether USD", "USDT", "6", ts(2026, 4, 18, 12), "110"),
      leg(Hh(12), XX, V, USDT, "33000000", "Tether USD", "USDT", "6", ts(2026, 4, 23, 12), "111"));
    // Igual que al abrir una cache real (js/19): completa los roles que el
    // bloque sintético de contratos_aprendidos no trae (SETTLEMENT, DEFI_*...);
    // sin esto el Descubrimiento previo a clasificar falla en consola.
    state.cache = asegurarEstructuraCache(cache);
  }
  function montarCsv() {
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-04-08,400,0,400,0,\"['" + Hh(5) + "']\"," + state.config.wallet;
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
    /* Sin avisos: «Ya decididos» va al final de 🔍 y el de abajo a la derecha taparía sus botones. */
    await page.evaluate(s => { document.querySelectorAll("#toasts .toast").forEach(t => t.remove());
      const el = document.querySelector(s); if (el) el.scrollIntoView({ block: "center", behavior: "instant" }); }, sel);
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

  /* ============ A) buscador sin casilla y con botón «Vincular pago…» ============ */
  console.log("\nA) Buscador: sin casilla «ver todos», botón «🔗 Vincular pago…»");
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
  // El Descubrimiento previo aprende el distribuidor sintético (cruce CSV) y
  // autoguarda una vez; las cuentas de escrituras de B/F/G miden solo vínculos.
  await page.evaluate(() => { window.__writes = []; });
  const huellaBase = await huella();
  const claveS1 = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => x.inmueble === "Prueba Alcazaba 1" &&
      x.categoria === "REVISAR" && ccEsSalidaPendiente(x, ctx)).clave;
  });
  assert("A -> la cabecera de la lista ya no tiene casilla «ver todos»",
    await page.evaluate(() => !document.querySelector("#ccLista .cc-ver-todos-box")));
  await clickCentrado('.cc-item[data-clave="' + claveS1 + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
  let r = await page.evaluate(() => {
    const dlg = document.querySelector(".cc-dlg");
    return {
      sinCasilla: !dlg.querySelector('[name="verTodos"]'),
      boton: dlg.querySelector(".cc-dlg-proponer").textContent.trim(),
      filas: dlg.querySelectorAll(".cc-dlg-item").length,
    };
  });
  assert("A -> diálogo sin casilla y con botón primario «🔗 Vincular cobro…»",
    r.sinCasilla && r.boton === "🔗 Vincular cobro…" && r.filas === 4, r);
  await page.screenshot({ path: path.join(OUT, "cap_48_buscador.png"), fullPage: false });

  /* ============ B) el botón abre DIRECTO el formulario ============ */
  console.log("\nB) T17: elegir cobro y continuar abre directo el formulario");
  await page.evaluate(() => {
    const filas = [...document.querySelectorAll(".cc-dlg-item")];
    filas.find(f => (f.querySelector(".cc-dlg-amt").title + " " + f.textContent).includes("300 USDC")).querySelector('[data-accion="toggle-cobro"]').click();
  });
  await esperar(150);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  r = await page.evaluate(() => ({
    buscadorCerrado: !document.querySelector(".cc-dlg-busqueda"),
    formAbierto: !!document.querySelector(".cc-form"),
    sinPropuestas: document.querySelectorAll("#ccLista .cc-prop").length === 0,
    cantidad: (document.querySelector('.cc-form [name="cantidad"]') || {}).value,
  }));
  assert("B -> el buscador se cierra y el formulario se abre DIRECTO con la cantidad precargada (300)",
    r.buscadorCerrado && r.formAbierto && r.sinPropuestas && r.cantidad === "300", r);

  /* ============ C) formulario mínimo con tarjeta-par ============ */
  console.log("\nC) T19: formulario mínimo (tarjeta-par, cantidad, nota)");
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return {
      par: f.querySelectorAll(".cc-par-col").length,
      pagos: f.querySelectorAll(".cc-par-pago").length,
      labels: [...f.querySelectorAll(".cc-par-label")].map(x => x.textContent),
      amounts: [...f.querySelectorAll(".cc-par-amt")].map(x => x.textContent.trim()),
      fechas: [...f.querySelectorAll(".cc-par-fecha")].map(x => x.textContent.trim()),
      hashes: f.querySelectorAll(".cc-par-hash").length,
      hoy: f.textContent.includes("Hoy:"),
      pregunta: f.textContent.includes("¿Está cobrada del todo"),
      importe: !!f.querySelector('[name="importe"]'),
      moneda: !!f.querySelector('[name="moneda"]'),
      tecnico: !!f.querySelector('[name="estado_tecnico"]'),
      estado: !!f.querySelector('[name="estado"]'),
      ayudaVisible: f.querySelectorAll(".cc-form-ayuda").length,
      info: f.querySelectorAll(".cc-info").length,
      nota: !!f.querySelector('[name="nota"]'),
      titulo: f.querySelector(".cc-dlg-head h3").textContent,
    };
  });
  assert("C -> tarjeta-par con VENTA y COBRO: cantidades, fechas y hashes con enlace",
    r.par === 1 && r.pagos === 1 && r.labels[0] === "VENTA" && r.labels[1].startsWith("COBRO") &&
    r.amounts[0] === "250 RALC1" && r.amounts[1] === "300 USDC" &&
    r.fechas[0] === "📅 12/05/2026" && r.fechas[1] === "📅 20/05/2026" && r.hashes === 2, r);
  assert("C -> SIN «Hoy: …», sin pregunta, sin importe, sin moneda, sin select técnico, sin ayudas visibles",
    !r.hoy && !r.pregunta && !r.importe && !r.moneda && !r.tecnico && !r.estado && r.ayudaVisible === 0, r);
  assert("C -> cantidad con su ⓘ y nota documental conservada; título «🔗 Vincular cobro»",
    r.info === 1 && r.nota && r.titulo === "🔗 Vincular cobro", r);
  await page.screenshot({ path: path.join(OUT, "cap_48_form_par.png"), fullPage: false });

  /* ============ D) avisos cortos, sin plegable ============ */
  console.log("\nD) T20: resumen + avisos cortos + «Ver cambios detallados» plegado");
  r = await page.evaluate(() => {
    const z = document.querySelector(".cc-form-efectos");
    const det = z.querySelector("details");
    return {
      resumen: z.textContent.includes("la venta queda cobrada y sale de la lista"),
      aplicado: z.textContent.includes("Cobrado: 300 USD (300)."),
      // El plegable «Ver cambios» (campos en crudo) no sale.
      sinPlegable: !det && !z.textContent.includes("Ver cambios") && !z.textContent.includes("pago_diferido"),
      avisosLargos: z.textContent.includes("Efectos previstos si se confirma"),
    };
  });
  assert("D -> zona de avisos con resumen y aplicado; sin el plegable «Ver cambios»",
    r.resumen && r.aplicado && r.sinPlegable && !r.avisosLargos, r);
  await page.screenshot({ path: path.join(OUT, "cap_48_form_detalle.png"), fullPage: false });

  /* Confirmar. */
  await page.click(".cc-form-confirmar");
  await esperar(900);
  const huellaV1 = await huella();
  r = await page.evaluate(() => ({
    nVentas: state.cache.pagos_diferidos.ventas.length,
    liq: state.cache.pagos_diferidos.ventas[0].estado_liquidacion,
    importe: state.cache.pagos_diferidos.ventas[0].importe_esperado_usd,
    writes: window.__writes.length,
    dirty: state.cacheDirty,
    salidaMarcada: !!state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "salida"),
    count: document.getElementById("ccResueltosCount").textContent,
  }));
  assert("B/D -> confirmar guarda (4.2): venta COMPLETA sin importe esperado, vía handle, y reclasifica",
    r.nVentas === 1 && r.liq === "COMPLETA" && r.importe === null && r.writes === 1 &&
    r.dirty === false && r.salidaMarcada && r.count === "1", r);
  assert("B -> la huella cambia tras confirmar", huellaV1 !== huellaBase);

  /* ============ E) escape contextual en el vacío del buscador ============ */
  console.log("\nE) T18: escape «mostrar también esos (N)» solo en el vacío");
  const claveS4 = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => ccEsSalidaPendiente(x, ctx) && x.categoria === "REVISAR" &&
      x.inmueble === "Prueba Brezo 2" && (x.fecha || "").startsWith("2025")) ?
      state.registros.find(x => ccEsSalidaPendiente(x, ctx) && (x.fecha || "").startsWith("2025-12-15")).clave :
      state.registros.find(x => ccEsSalidaPendiente(x, ctx)).clave;
  });
  await clickCentrado('.cc-item[data-clave="' + claveS4 + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
  await setNum('.cc-dlg [name="importeMin"]', "20");
  await setNum('.cc-dlg [name="importeMax"]', "30");
  r = await page.evaluate(() => ({
    filas: document.querySelectorAll(".cc-dlg-item").length,
    nota: document.querySelector(".cc-dlg-nota").textContent,
    escape: !!document.querySelector('.cc-dlg-nota [data-accion="ver-explicados"]'),
  }));
  assert("E -> rango que solo casa con el RENDIMIENTO huérfano (25 USDT): 0 filas y escape «mostrar también esos (1)»",
    r.filas === 0 && r.escape && r.nota.includes("Ver también los ya explicados (1)"), r);
  await page.screenshot({ path: path.join(OUT, "cap_48_escape.png"), fullPage: false });
  await page.click('.cc-dlg-nota [data-accion="ver-explicados"]');
  await esperar(350);
  r = await page.evaluate(() => ({
    filas: [...document.querySelectorAll(".cc-dlg-item")].map(x => x.querySelector(".cc-dlg-amt").title + " " + x.textContent),
    vuelta: !!document.querySelector('.cc-dlg-nota [data-accion="solo-acotados"]'),
  }));
  assert("E -> tras el escape aparece el RENDIMIENTO de 25 USDT y oferta de vuelta a la vista acotada",
    r.filas.length === 1 && r.filas[0].includes("25 USDT") && r.vuelta, r);
  await page.click('.cc-dlg-nota [data-accion="solo-acotados"]');
  await esperar(350);
  r = await page.evaluate(() => ({
    filas: document.querySelectorAll(".cc-dlg-item").length,
    escape: !!document.querySelector('.cc-dlg-nota [data-accion="ver-explicados"]'),
  }));
  assert("E -> «ver solo los sin explicar» vuelve al vacío con escape (estado local del diálogo)",
    r.filas === 0 && r.escape, r);
  await page.keyboard.press("Escape");
  await esperar(250);

  /* ============ F) vínculo parcial + Resueltos + edición mínima ============ */
  console.log("\nF) Vínculo parcial, marcas y edición mínima en Resueltos");
  const claveS2 = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    return state.registros.find(x => x.inmueble === "Prueba Brezo 2" &&
      x.categoria === "REVISAR" && ccEsSalidaPendiente(x, ctx)).clave;
  });
  await clickCentrado('.cc-item[data-clave="' + claveS2 + '"] [data-accion="abrir-buscador"]');
  await page.evaluate(() => { /* El buscador se abre con fechas; esta prueba cuenta con verlos todos. */ const f = document.querySelector(".cc-dlg-busqueda"); if (!f) throw new Error("el buscador de cobros no está abierto"); for (const n of ["desde", "hasta"]) f.querySelector('[name="' + n + '"]').value = ""; ccDlgActualizar(); });
  await page.evaluate(() => {
    const filas = [...document.querySelectorAll(".cc-dlg-item")];
    filas.find(f => (f.querySelector(".cc-dlg-amt").title + " " + f.textContent).includes("179,4321 USDC")).querySelector('[data-accion="toggle-cobro"]').click();
  });
  await esperar(150);
  await page.click(".cc-dlg-proponer");
  await esperar(500);
  await setNum('.cc-form [name="cantidad"]', "50");
  await page.click(".cc-form-confirmar");
  await esperar(900);
  r = await page.evaluate(() => {
    const ctx = ccContextoCandidatos(state.cache, state.config, state.registros);
    const par = state.registros.find(x => x.pago_diferido && x.pago_diferido.rol === "pago" &&
      ccEsCobroPendiente(x, ctx, false));
    const dom = par ? document.querySelector('#ccLista .cc-item[data-clave="' + par.clave + '"]') : null;
    return {
      hayParcial: !!par,
      cand: dom ? dom.getAttribute("data-cand") : "?",
      vinc: dom ? dom.getAttribute("data-vinc") : "?",
      marca: dom ? dom.textContent.includes("🔗 Cobro de una venta") : false,
      avisoResto: true,
    };
  });
  assert("F -> cobro parcial: «🔗 Cobro de una venta» (4.4b: los cobros ya no llevan marca de pendiente)",
    r.hayParcial && r.cand === "" && r.vinc !== "" && r.marca, r);
  await page.click("#ccResueltos summary");
  await esperar(300);
  r = await page.evaluate(() => ({
    botones: document.querySelectorAll('#ccListaResueltos [data-accion="abrir-buscador"]').length,
  }));
  assert("F -> T21: «➕ Añadir otro cobro…» en las 2 ventas CONFIRMADAS de Resueltos", r.botones === 2, r);
  r = await page.evaluate(() => {
    const cont = document.getElementById("ccListaResueltos");
    return { count: document.getElementById("ccResueltosCount").textContent,
             total: cont.textContent.includes("Cobrado: 300 USD") &&
                    cont.textContent.includes("Cobrado: 50 USD"),
             sigma: cont.textContent.includes("Σ") };
  });
  assert("F -> Resueltos (2) con «Cobrado:» y sin «Σ»", r.count === "2" && r.total && !r.sigma, r);
  const idVenta2 = await page.evaluate(() => state.cache.pagos_diferidos.ventas[1].id);
  await clickCentrado('#ccListaResueltos [data-venta="' + idVenta2 + '"][data-accion="editar-vinculo"]');
  r = await page.evaluate(() => {
    const f = document.querySelector(".cc-form");
    return { titulo: f.querySelector(".cc-dlg-head h3").textContent,
             cantidad: f.querySelector('[name="cantidad"]').value,
             campos: [...f.querySelectorAll(".cc-form-campos [name]")].map(x => x.name),
             pagos: f.querySelectorAll(".cc-par-pago").length,
             cantPar: f.querySelectorAll('.cc-par [name="cantidad"]').length };
  });
  assert("F -> edición mínima: título «Editar vínculo», cantidad de la asignación y solo cantidad+nota",
    r.titulo.includes("Editar vínculo") && r.cantidad === "50" &&
    JSON.stringify(r.campos) === JSON.stringify(["nota"]) && r.pagos === 1 && r.cantPar === 1, r);
  await setNum('.cc-form [name="cantidad"]', "60");
  await page.click(".cc-form-confirmar");
  await esperar(900);
  r = await page.evaluate(() => ({
    cant: state.cache.pagos_diferidos.ventas[1].asignaciones[0].cantidad_asignada,
    id: state.cache.pagos_diferidos.ventas[1].asignaciones[0].id,
    writes: window.__writes.length,
  }));
  assert("F -> editar guarda en su sitio (as_002 → 60) sin crear venta nueva",
    r.cant === 60 && r.id === "as_002" && r.writes === 3, r);

  /* ============ G) oscuro + puerta + consola ============ */
  console.log("\nG) Modo oscuro, puerta y consola");
  await page.evaluate(() => { document.body.classList.add("dark"); localStorage.setItem("reental_dark", "1"); });
  await esperar(250);
  r = await page.evaluate(() => {
    const par = document.querySelector("#ccListaResueltos .cc-vinc");
    const estilo = document.getElementById("estiloCorrecciones15");
    return { hex: /#[0-9a-fA-F]{3,8}\b/.test(estilo.textContent), resueltos: !!par };
  });
  assert("G -> modo oscuro correcto y CSS cc-* sin hex hardcodeados", r.resueltos && !r.hex, r);
  await page.screenshot({ path: path.join(OUT, "cap_48_oscuro.png"), fullPage: false });
  r = await page.evaluate(() => ({
    writes: window.__writes.length,
    ls: Object.keys(localStorage).filter(k => k !== "reental_dark"),
    ajustes: Object.keys(state.cache.ajustes_usuario).length,
  }));
  assert("G -> 3 escrituras vía handle; localStorage y ajustes_usuario intactos",
    r.writes === 3 && r.ls.length === 0 && r.ajustes === 0, r);
  const errs = erroresConsola();
  console.log("\nConsola: " + consola.length + " mensajes, " + errs.length + " errores (ruido favicon excluido)");
  for (const m of errs) console.error("  [" + m.tipo + "] " + m.texto.slice(0, 160));
  assert("G -> 0 errores de consola en todos los escenarios", errs.length === 0, errs.map(x => x.texto.slice(0, 120)));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
