/* Arnés del RNT que te llega en 🔍 Revisión y su precio en 💶, con datos
 * inventados: dos llegadas de un airdrop y tres entregas de una preventa.
 *
 *  R1) la tarjeta de un RNT que llega ofrece «Regalo (airdrop)»,
 *      «Recompensa DeFi» y «Compra externa…», con su explicación, sin
 *      ventana y ninguno sugerido.
 *  R2) «Regalo (airdrop)» se guarda al momento, solo ese movimiento.
 *  R3) «Compra externa…»: la compra sin precio, fuera de revisar; 💶 se
 *      despliega con su fila abierta y el cursor en lo pagado; cerrada,
 *      «Falta el precio» y «—»; «Ya decididos» y 🚀 lo dicen.
 *  R4) las casillas enlazadas (lo pagado ↔ el precio por token) y
 *      «Calcular el precio por token» (la coma, «Usar»); Intro guarda.
 *  R5) otra entrega en USD: el precio en USD → lo pagado en USD y en €
 *      (BCE); la calculadora, en USD.
 *  R6) deshacer se lleva el precio; doble clic; oscuro y 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifyrnt1.js
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });

  function montar() {
    const W = "0x" + "11".repeat(20), AIR = "0x" + "a7".repeat(20), REP = "0x" + "c5".repeat(20), SOLO = "0x" + "b3".repeat(20);
    const P1 = "0x" + "a1".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 9) / 1000));
    const wei = n => (BigInt(n) * 10n ** 18n).toString();
    const pal = h => h.padStart(64, "0");
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
    const rnt = (n, de, cantidad, t) => ({ blockNumber: String(100 + n), timeStamp: t, hash: Hh(n), from: de, to: W,
      contractAddress: RNT, value: wei(cantidad), tokenName: "Reental", tokenSymbol: "RNT", tokenDecimal: "18" });
    cache.transacciones.wallet_tokens.push(
      rnt(1, AIR, 11, ts(2024, 9, 17)), rnt(2, AIR, 9, ts(2024, 11, 8)),
      rnt(3, REP, 5000, ts(2024, 2, 12)), rnt(4, REP, 4000, ts(2024, 7, 3)), rnt(5, REP, 2000, ts(2024, 11, 20)),
      rnt(7, SOLO, 5, ts(2024, 8, 8)));
    // La primera entrega la reclamó la wallet: claim(index, cuenta, asignación 20.000, prueba).
    cache.transacciones.wallet_normales.push({ blockNumber: "103", timeStamp: ts(2024, 2, 12), hash: Hh(3), from: W, to: REP,
      value: "0", gasUsed: "0", gasPrice: "0", isError: "0", txreceipt_status: "1",
      input: "0x2e7ba6ef" + pal("7") + pal(W.slice(2)) + pal(BigInt(wei(20000)).toString(16)) + pal("80") + pal("0") });
    cache.tipos_bce = { "2024-07-03": 1.1 };
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    window.escribirArchivoNavegador = async (c) => { window.__writes.push(JSON.stringify(c)); };
    window.__clave = n => (Hh(n) + "::" + RNT).toLowerCase();
  }

  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });
  await page.evaluate(montar);
  await page.evaluate(() => ejecutarClasificacion());
  await esperar(600);

  const clave = n => page.evaluate(n => window.__clave(n), n);
  const reg = n => page.evaluate(n => { const r = state.registros.find(x => x.clave === window.__clave(n)); return r && { cat: r.categoria,
    sub: r.subcategoria, via: r.via_compra, coste: r.coste_eur, revisar: r.revisar }; }, n);
  const ajuste = n => page.evaluate(n => (state.cache.ajustes_usuario || {})[window.__clave(n)] || null, n);
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const pulsar = async (n, opcion) => { await page.click('#ccLista [data-accion="decidir"][data-clave="' + (await clave(n)) + '"][data-opcion="' + opcion + '"]'); await esperar(700); };
  const sinToasts = () => page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  // La fila de 💶 de una compra: celdas, casillas, «Guardar» y lo de debajo.
  const fila = n => page.evaluate(c => {
    const f = document.querySelector('#cbCuerpo tr.cb-fila[data-clave="' + c + '"]');
    if (!f) return null;
    const v = s => (f.querySelector(s) || {}).value ?? null;
    const sub = f.nextElementSibling && f.nextElementSibling.classList.contains("cb-usdt") ? f.nextElementSibling : null;
    return { celdas: [...f.querySelectorAll("td")].map(td => td.textContent), pagado: v(".cb-valor"), precio: v(".cb-precio"),
      usd: sub && (sub.querySelector(".cb-usd") || {}).value, usdPrecio: sub && (sub.querySelector(".cb-usd-precio") || {}).value,
      calcular: !!(sub && sub.querySelector('[data-cb="calcular"]')), foco: document.activeElement && document.activeElement.className,
      abierto: document.getElementById("cbCoste").open, aviso: document.getElementById("cbCosteAviso").textContent };
  }, claves[n]);
  const claves = {};
  for (const n of [1, 2, 3, 4, 5, 7]) claves[n] = await clave(n);
  const escribir = async (sel, texto) => {
    await page.$eval(sel, el => { el.value = ""; el.focus(); });
    await page.type(sel, texto);
    await esperar(100);
  };
  const calc = () => page.evaluate(() => {
    const d = document.querySelector(".cc-dlg-overlay .cb-calc-dlg");
    return d && { titulo: d.querySelector("h3").textContent, res: d.querySelector(".cb-calc-res").textContent,
      usar: !d.querySelector(".cb-calc-usar").disabled, total: d.querySelector(".cb-calc-total").parentElement.textContent.trim(),
      foco: document.activeElement && document.activeElement.className };
  });

  /* ============ R1) botones ============ */
  const r1 = await reg(1);
  assert("R1 -> el RNT del airdrop llega a revisar", r1 && r1.cat === "REVISAR" && r1.revisar, r1);
  const ops = await page.evaluate(c => [...document.querySelectorAll('#ccLista [data-accion="decidir"][data-clave="' + c + '"]')]
    .map(b => [b.getAttribute("data-opcion"), b.title, b.getAttribute("aria-haspopup"), b.classList.contains("sugerida")]), claves[1]);
  assert("R1 -> «Regalo (airdrop)», «Recompensa DeFi» y «Compra externa…», con su explicación, sin ventana y ninguno sugerido",
    ["regalo", "recompensa", "compra"].every(o => ops.some(([id, t, h, s]) => id === o && t && h === null && !s)), ops);

  /* ============ R2) regalo: solo ese movimiento ============ */
  const w0 = await escrituras();
  await pulsar(1, "regalo");
  const [a1, a2] = [await reg(1), await reg(2)];
  assert("R2 -> «Regalo (airdrop)» se guarda al momento y solo ese (el otro de la dirección sigue a revisar), una escritura",
    a1.sub === "GPP_REGALO" && !a1.revisar && a2.cat === "REVISAR" && a2.revisar && (await escrituras()) === w0 + 1 &&
    !(await page.$(".cc-dlg-overlay")), [a1, a2]);

  /* ============ R3) compra externa: sin precio, abre 💶 en su fila ============ */
  await sinToasts();
  const w1 = await escrituras();
  await pulsar(3, "compra");
  const r3 = await reg(3), f3 = await fila(3);
  assert("R3 -> «Compra externa…»: compra sin coste, fuera de revisar, una escritura", r3.cat === "COMPRA" && r3.via === "BANCARIA" &&
    !r3.revisar && r3.coste === null && (await escrituras()) === w1 + 1 && (await reg(4)).revisar, r3);
  assert("R3 -> 💶 desplegado en su fila abierta, la casilla de lo pagado vacía y con el cursor; debajo, «Calcular…»",
    f3 && f3.abierto && f3.pagado === "" && f3.precio === "" && /cb-valor/.test(f3.foco) && f3.calcular && f3.celdas[1] === "RNT" &&
    f3.aviso === "⚠ 1 sin precio", f3);
  await page.keyboard.press("Escape");
  await esperar(100);
  const f3c = await fila(3);
  assert("R3 -> cerrada: «Falta el precio» y «—» (sin 100 €/token)", f3c.celdas[4] === "Falta el precio" && f3c.celdas[5] === "—", f3c);
  const resumen = await page.evaluate(c => { document.getElementById("ccResueltos").open = true;
    const d = document.querySelector('#ccListaResueltos .cc-decidida[data-clave="' + c + '"] b'); return d && d.textContent; }, claves[3]);
  assert("R3 -> «Ya decididos»: «Compra externa · falta el precio»", resumen === "Compra externa · falta el precio", resumen);
  assert("R3 -> 🚀: 1 compra de RNT sin precio", (await page.evaluate(() => arrDatosResumen().rntSinPrecio)) === 1);

  /* ============ R4) la calculadora y las casillas enlazadas ============ */
  await page.click('#cbCuerpo [data-cb="editar"][data-clave="' + claves[3] + '"]');
  await esperar(100);
  await escribir("#cbCuerpo .cb-valor", "300");
  assert("R4 -> lo pagado (300 €) → 0,0600 € por token al momento", (await fila(3)).precio === "0,0600", await fila(3));
  await escribir("#cbCuerpo .cb-precio", "0,05");
  assert("R4 -> el precio (0,05) → lo pagado (250,00 €)", (await fila(3)).pagado === "250,00", await fila(3));
  await page.click('#cbCuerpo [data-cb="calcular"][data-clave="' + claves[3] + '"]');
  await esperar(150);
  const c0 = await calc();
  assert("R4 -> «Calcular el precio por token»: en €, «—», «Usar» desactivado y el cursor en los tokens",
    c0 && c0.titulo === "Calcular el precio por token" && c0.res === "—" && !c0.usar && c0.total.startsWith("Pagaste en total (€)") &&
    /cb-calc-tokens/.test(c0.foco), c0);
  await escribir(".cb-calc-tokens", "20.000");
  await escribir(".cb-calc-total", "1200.5");
  assert("R4 -> «1200.5» pide la coma", (await calc()).res === "Usa la coma para los decimales (1.234,56)." && !(await calc()).usar, await calc());
  await escribir(".cb-calc-total", "1.200");
  assert("R4 -> «20.000» y «1.200»: = 0,0600 € por token", (await calc()).res === "= 0,0600 € por token" && (await calc()).usar, await calc());
  await page.screenshot({ path: path.join(OUT, "cap_rnt1_calcular.png") });
  await page.click(".cb-calc-usar");
  await esperar(150);
  const f4 = await fila(3);
  assert("R4 -> «Usar»: el precio en su casilla y lo pagado recalculado (5.000 × 0,06 = 300,00 €), la ventana cerrada",
    !(await calc()) && f4.precio === "0,0600" && f4.pagado === "300,00" && /cb-precio/.test(f4.foco), f4);
  const w4 = await escrituras();
  await page.keyboard.press("Enter");
  await esperar(700);
  assert("R4 -> Intro guarda: 300 € en la decisión (sigue siendo una decisión de 🔍)",
    (await ajuste(3)).coste_eur === 300 && (await ajuste(3)).categoria === "COMPRA" && (await reg(3)).coste === 300 &&
    (await escrituras()) === w4 + 1, await ajuste(3));
  const f4c = await fila(3);
  assert("R4 -> 💶: 300,00 € y 0,0600 € por token; sin «⚠ sin precio»", f4c.celdas[4] === "300,00 €" && f4c.celdas[5] === "0,0600 €" &&
    f4c.aviso === "", f4c);
  assert("R4 -> 🚀: ninguna compra de RNT sin precio", (await page.evaluate(() => arrDatosResumen().rntSinPrecio)) === 0);
  // Lejos (como con muchos datos): relleno antes de «Ya decididos», cerrado.
  await page.evaluate(() => { const r = document.getElementById("ccResueltos"); r.open = false;
    const d = document.createElement("div"); d.id = "rellenoR4"; d.style.height = "2500px"; r.before(d); });
  await page.click('#cbCuerpo [data-cb="decidida"][data-clave="' + claves[3] + '"]');
  await esperar(1000);
  const ir4 = await page.evaluate(c => ({ abierto: document.getElementById("ccResueltos").open,
    brillo: document.getElementById("ccResueltos").classList.contains("cb-brillo"),
    aLaVista: (r => r.top >= 0 && r.bottom <= innerHeight)(document.querySelector('#ccListaResueltos .cc-decidida[data-clave="' + c + '"]').getBoundingClientRect()),
    foco: !!document.activeElement && document.activeElement.getAttribute("data-accion") === "deshacer-decision" &&
      document.activeElement.getAttribute("data-clave") === c }), claves[3]);
  await page.screenshot({ path: path.join(OUT, "cap_rnt1_brillo.png") });
  // RETOQUES R6: una segunda pulsación a los 3 s alarga el brillo (no lo corta lo de la primera).
  await esperar(2000);
  await page.click('#cbCuerpo [data-cb="decidida"][data-clave="' + claves[3] + '"]');
  await esperar(3500);
  const brillo6 = await page.evaluate(() => document.getElementById("ccResueltos").classList.contains("cb-brillo"));
  assert("R4 -> R6: otra pulsación vuelve a empezar el brillo (a los 6,5 s de la primera sigue)", brillo6, brillo6);
  await page.evaluate(() => document.getElementById("rellenoR4").remove());
  assert("R4 -> «↩ Deshacer…» (con «Ya decididos» cerrado) lo abre y, al primer clic, deja su decisión a la vista con el cursor en «↩ Deshacer»",
    ir4.abierto && ir4.aLaVista && ir4.foco && ir4.brillo, ir4);

  /* Huecos de la auditoría de los retoques: «ⓘ Qué es cada cosa», en la barra de todas las pestañas. */
  const verQueEs = await page.evaluate(async () => {
    const r = {};
    for (const v of ["revision", "transacciones", "dashboard", "fiscal", "inicio"]) {
      location.hash = "#" + v;
      await new Promise(x => setTimeout(x, 500));
      r[v] = document.querySelector(".top-right .cc-que-es").offsetParent !== null;
    }
    location.hash = "#revision";
    await new Promise(x => setTimeout(x, 500));
    return r;
  });
  assert("«ⓘ Qué es cada cosa» se ve en todas las pestañas (🔍, 📒, 📊, 🧾 y 🚀)",
    Object.values(verQueEs).every(Boolean), verQueEs);
  await page.evaluate(() => { document.getElementById("cbCoste").open = true; });
  await esperar(800);

  /* ============ R5) otra entrega, en USD ============ */
  await pulsar(4, "compra");
  await page.click('#cbCuerpo [data-cb="usdt"][data-clave="' + claves[4] + '"]');
  await esperar(150);
  await page.$eval('#cbCuerpo .cb-usd-fecha', el => { el.value = "2024-07-03"; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await escribir("#cbCuerpo .cb-usd-precio", "0,066");
  const f5 = await fila(4);
  assert("R5 -> «En USD…»: 0,066 USD por token → 264,00 USD y los € con el BCE (1,1 → 240,00 €)",
    f5.usd === "264,00" && f5.pagado === "240,00", f5);
  await page.click('#cbCuerpo [data-cb="calcular"][data-clave="' + claves[4] + '"]');
  await esperar(150);
  assert("R5 -> la calculadora, en USD", (await calc()).total.startsWith("Pagaste en total (USD)"), await calc());
  await page.keyboard.press("Escape");
  await esperar(100);
  await page.focus("#cbCuerpo .cb-usd-precio");
  await page.keyboard.press("Enter");
  await esperar(700);
  const aj4 = await ajuste(4);
  assert("R5 -> guardada con lo pagado en USD", aj4.coste_eur === 240 && aj4.pagado_usd === 264 && aj4.fecha_pago_usd === "2024-07-03", aj4);

  /* ============ R6) deshacer, oscuro y errores ============ */
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await page.click('#ccListaResueltos [data-accion="deshacer-decision"][data-clave="' + claves[3] + '"]');
  await esperar(700);
  const r6 = await reg(3);
  assert("R6 -> deshacer la compra: vuelve a revisar y se va su precio", r6.cat === "REVISAR" && r6.revisar && (await ajuste(3)) === null &&
    !(await fila(3)), r6);
  /* Doble clic con un guardado lento: se guarda una vez. */
  await sinToasts();
  await page.evaluate(() => { const antes = window.escribirArchivoNavegador;
    window.escribirArchivoNavegador = async c => { await new Promise(r => setTimeout(r, 250)); return antes(c); }; });
  const w6 = await escrituras();
  await page.evaluate(c => { const b = document.querySelector('#ccLista [data-accion="decidir"][data-clave="' + c + '"][data-opcion="regalo"]'); b.click(); b.click(); }, claves[7]);
  await esperar(900);
  const avisos6 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent));
  assert("R6 -> doble clic: se guarda una vez y sin el aviso rojo falso", (await escrituras()) === w6 + 1 &&
    (await reg(7)).sub === "GPP_REGALO" && !avisos6.some(t => t.includes("Ya tiene un ajuste manual")), avisos6);

  /* ============ R7) auditoría (COMPRA-EXTERNA A2, A3, A7, A8, A9) ============ */
  await sinToasts();
  await page.click('#cbCuerpo [data-cb="editar"][data-clave="' + claves[4] + '"]');
  await esperar(100);
  await escribir("#cbCuerpo .cb-precio", "0.03");
  const w7 = await escrituras();
  await page.keyboard.press("Enter");
  await esperar(300);
  const aviso7 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | "));
  assert("R7 -> A2: «0.03» en el precio por token pide la coma y no guarda", aviso7.includes("Usa la coma para los decimales (1.234,56).") &&
    (await escrituras()) === w7, aviso7);
  await page.click('#cbCuerpo [data-cb="calcular"][data-clave="' + claves[4] + '"]');
  await esperar(150);
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(300);
  const sigue8 = await page.evaluate(() => document.querySelectorAll(".cc-dlg-overlay").length);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  assert("R7 -> A8: la calculadora se cierra al cambiar de pestaña", sigue8 === 0, sigue8);
  const a3 = await page.evaluate(async c => {
    location.hash = "#transacciones";
    await new Promise(r => setTimeout(r, 300));
    cbIrACompra(c);
    const enTx = location.hash;
    location.hash = "#revision";
    await new Promise(r => setTimeout(r, 400));
    const otro = document.createElement("input");
    document.body.appendChild(otro);
    otro.focus();
    cbIrACompra(c);
    const foco = document.activeElement === otro;
    otro.remove();
    return { enTx, foco };
  }, claves[4]);
  assert("R7 -> A3: si te fuiste de 🔍 mientras se guardaba, no te devuelve; A7: no te quita el cursor de otra casilla",
    a3.enTx === "#transacciones" && a3.foco, a3);
  // La fila sigue abierta desde A2 (lo escrito sin guardar).
  await escribir("#cbCuerpo .cb-valor", "123");
  await page.evaluate(() => { state.cache = structuredClone(state.cache); renderCosteCompras(); });
  await esperar(100);
  assert("R7 -> A9: con otra cache, lo escrito sin guardar se olvida (la fila sale cerrada)", (await fila(4)).pagado === null, await fila(4));

  // Volver a 🔍 deja 💶 plegado (como la lista de tareas): se abre otra vez.
  await page.evaluate(() => { document.body.classList.add("dark"); document.getElementById("cbCoste").open = true; });
  await esperar(800); // se despliega en 0,6 s
  await sinToasts();   // el aviso de A2 tapa el enlace de la derecha
  await page.click('#cbCuerpo [data-cb="editar"][data-clave="' + claves[4] + '"]');
  await esperar(100);
  await page.click('#cbCuerpo [data-cb="calcular"][data-clave="' + claves[4] + '"]');
  await esperar(150);
  const oscuro = await page.evaluate(() => getComputedStyle(document.querySelector(".cb-calc-dlg")).backgroundColor);
  assert("R6 -> en oscuro, la calculadora con el color del tema", oscuro !== "rgb(255, 255, 255)", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_rnt1_oscuro.png") });
  assert("R6 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
