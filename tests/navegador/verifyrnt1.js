/* Arnés del RNT que te llega en 🔍 Revisión (P7 y P11), con datos
 * inventados: dos llegadas de un airdrop y tres entregas de una preventa
 * (con la reclamación de la wallet, que dice la asignación).
 *
 *  R1) la tarjeta de un RNT que llega ofrece «Regalo (airdrop)»,
 *      «Recompensa DeFi» y «Compra externa…», con su explicación.
 *  R2) «Regalo (airdrop)» pregunta por el otro de esa dirección; Esc
 *      cierra sin escribir; «Todos (2)» decide los dos (una escritura).
 *  R3) «Compra externa…»: la lista de las tres entregas, el total leído de
 *      la reclamación, el aviso de la coma, el precio al escribir y el
 *      total que no puede ser menos de lo llegado; «Guardar» las vuelve
 *      compras con su parte, y 💶 las enseña con «RNT» y 4 decimales.
 *  R4) una entrega posterior: viene con el precio puesto, completa el total
 *      con el resto y no cambia las anteriores.
 *  R5) deshacer una en «Ya decididos»; «Solo este» no toca a las demás;
 *      oscuro y 0 errores.
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
  const pulsar = async (n, opcion) => { await page.click('#ccLista [data-accion="decidir"][data-clave="' + (await clave(n)) + '"][data-opcion="' + opcion + '"]'); await esperar(200); };
  const dialogo = () => page.evaluate(() => {
    const d = document.querySelector(".cc-dlg-overlay .cc-dlg-rnt");
    if (!d) return null;
    const v = s => (d.querySelector(s) || {}).value;
    return { titulo: d.querySelector("h3").textContent, filas: d.querySelectorAll(".cc-rnt-tabla tbody tr").length,
      fuera: d.querySelectorAll(".cc-rnt-fuera").length, pagado: v(".cc-rnt-pagado"), total: v(".cc-rnt-total"),
      nota: (d.querySelector(".cc-rnt-nota") || {}).textContent, precio: (d.querySelector(".cc-rnt-precio") || {}).textContent,
      error: d.querySelector(".cc-rnt-error").textContent, foco: document.activeElement && document.activeElement.className,
      botones: [...d.querySelectorAll(".cc-dlg-foot button")].map(b => b.textContent) };
  });
  const escribir = async (sel, texto) => {
    await page.$eval(".cc-dlg-rnt " + sel, el => { el.value = ""; el.focus(); });
    await page.type(".cc-dlg-rnt " + sel, texto);
    await esperar(100);
  };

  /* ============ R1) botones ============ */
  const r1 = await reg(1);
  assert("R1 -> el RNT del airdrop llega a revisar", r1 && r1.cat === "REVISAR" && r1.revisar, r1);
  const ops = await page.evaluate(async c => [...document.querySelectorAll('#ccLista [data-accion="decidir"][data-clave="' + c + '"]')]
    .map(b => [b.getAttribute("data-opcion"), b.title, b.getAttribute("aria-haspopup")]), await clave(1));
  assert("R1 -> «Regalo (airdrop)», «Recompensa DeFi» y «Compra externa…», con su explicación y como diálogo",
    ["regalo", "recompensa", "compra-rnt"].every(o => ops.some(([id, t, h]) => id === o && t && h === "dialog")), ops);

  /* ============ R2) regalo con el otro de esa dirección ============ */
  const w0 = await escrituras();
  await pulsar(1, "regalo");
  const d2 = await dialogo();
  assert("R2 -> pregunta por el otro: la lista de los dos, «Solo este» y «Todos (2)» con el foco",
    d2 && d2.titulo === "¿También el otro movimiento de RNT de esta dirección?" && d2.filas === 2 &&
    d2.botones.join("|") === "Cancelar|Solo este|Todos (2)" && /cc-rnt-todos/.test(d2.foco), d2);
  await page.keyboard.press("Escape");
  await esperar(100);
  assert("R2 -> Esc cierra sin escribir", !(await dialogo()) && (await escrituras()) === w0);
  await pulsar(1, "regalo");
  await page.click(".cc-rnt-todos");
  await esperar(700);
  const [a1, a2] = [await reg(1), await reg(2)];
  assert("R2 -> «Todos (2)»: los dos, regalo y fuera de revisar, con una sola escritura",
    a1.cat === "REWARD" && a1.sub === "GPP_REGALO" && !a1.revisar && a2.sub === "GPP_REGALO" && (await escrituras()) === w0 + 1, [a1, a2]);
  assert("R2 -> el diálogo se cierra", !(await dialogo()));

  /* ============ R3) compra bancaria de la preventa ============ */
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const w1 = await escrituras();
  await pulsar(4, "compra-rnt");
  const d3 = await dialogo();
  assert("R3 -> la lista de las tres entregas y el total leído de la reclamación (20.000)",
    d3 && d3.titulo === "Compra externa de RNT" && d3.filas === 3 && d3.fuera === 0 && d3.total === "20.000" && d3.pagado === "" &&
    d3.nota.includes("leídos de tu reclamación del 12/02/2024") && /cc-rnt-pagado/.test(d3.foco), d3);
  await escribir(".cc-rnt-pagado", "1200.5");
  await page.keyboard.press("Enter");
  await esperar(150);
  const d3b = await dialogo();
  assert("R3 -> «1200.5» no se guarda: pide la coma", d3b && d3b.error === "Usa la coma para los decimales (1.234,56)." &&
    (await escrituras()) === w1, d3b);
  await escribir(".cc-rnt-pagado", "1.200");
  const d3c = await dialogo();
  assert("R3 -> al escribir, el precio: 1.200,00 € ÷ 20.000 RNT = 0,0600 €/RNT (y el error se va)",
    d3c.precio === "1.200,00 € ÷ 20.000 RNT = 0,0600 €/RNT" && d3c.error === "", d3c);
  await escribir(".cc-rnt-total", "10.000");
  await page.click(".cc-rnt-guardar");
  await esperar(150);
  const d3d = await dialogo();
  assert("R3 -> el total no puede ser menos de lo llegado", d3d && d3d.error.startsWith("Ya te han llegado 11.000 RNT") &&
    (await escrituras()) === w1, d3d);
  await page.screenshot({ path: path.join(OUT, "cap_rnt1_compra.png") });
  await escribir(".cc-rnt-total", "20.000");
  await page.click(".cc-rnt-guardar");
  await esperar(700);
  const compras = [await reg(3), await reg(4), await reg(5)];
  assert("R3 -> las tres, compras bancarias con su parte (300, 240 y 120 €), con una escritura",
    compras.every(c => c.cat === "COMPRA" && c.via === "BANCARIA" && !c.revisar) &&
    JSON.stringify(compras.map(c => c.coste)) === "[300,240,120]" && (await escrituras()) === w1 + 1, compras);
  assert("R3 -> la nota guarda lo pagado y el total", (await ajuste(3)).nota.endsWith("compra de RNT: 1.200,00 EUR por 20.000 RNT"),
    await ajuste(3));
  const cb = await page.evaluate(() => {
    document.getElementById("cbCoste").open = true;
    return [...document.querySelectorAll("#cbCuerpo tr.cb-fila")].map(f => [...f.querySelectorAll("td")].map(td => td.textContent));
  });
  assert("R3 -> 💶: las tres con «RNT», 0,0600 € por token y sin «por defecto»",
    cb.length === 3 && cb.every(f => f[1] === "RNT" && f[5] === "0,0600 €" && !f[4].includes("por defecto")), cb);
  /* 💶: un punto que no es de miles pide la coma (y no guarda). */
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const w3 = await escrituras();
  await page.click('#cbCuerpo [data-cb="editar"][data-clave="' + (await clave(3)) + '"]');
  await esperar(100);
  await page.$eval('#cbCuerpo .cb-valor', el => { el.value = ""; el.focus(); });
  await page.type('#cbCuerpo .cb-valor', "300.5");
  await page.keyboard.press("Enter");
  await esperar(300);
  const aviso3 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | "));
  assert("R3 -> 💶: «300.5» pide la coma y no guarda", aviso3.includes("Usa la coma para los decimales (1.234,56).") &&
    (await escrituras()) === w3 && (await ajuste(3)).coste_eur === 300, aviso3);
  await page.keyboard.press("Escape");
  await esperar(100);

  /* ============ R4) una entrega posterior: con el precio puesto ============ */
  await page.evaluate(() => {
    const t = state.cache.transacciones.wallet_tokens[4];
    state.cache.transacciones.wallet_tokens.push(Object.assign({}, t, { hash: "0x0006" + "ab".repeat(30), blockNumber: "106",
      timeStamp: String(Math.floor(Date.UTC(2025, 4, 14, 9) / 1000)), value: (9000n * 10n ** 18n).toString() }));
    ejecutarClasificacion();
  });
  await esperar(500);
  const antes = JSON.stringify([await ajuste(3), await ajuste(4), await ajuste(5)]);
  await pulsar(6, "compra-rnt");
  const d4 = await dialogo();
  assert("R4 -> viene con el precio de las anteriores (1.200,00 € por 20.000 RNT) y las cuatro en la lista",
    d4 && d4.pagado === "1.200,00" && d4.total === "20.000" && d4.nota === "El de tus compras anteriores desde esta dirección." &&
    d4.filas === 4 && d4.precio === "1.200,00 € ÷ 20.000 RNT = 0,0600 €/RNT", d4);
  await page.click(".cc-rnt-guardar");
  await esperar(700);
  const r6 = await reg(6);
  assert("R4 -> la nueva se lleva el resto (1.200 − 660 = 540 €) y las anteriores no cambian",
    r6.cat === "COMPRA" && r6.coste === 540 && JSON.stringify([await ajuste(3), await ajuste(4), await ajuste(5)]) === antes, r6);

  /* ============ R5) deshacer, oscuro y errores ============ */
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await page.click('#ccListaResueltos [data-accion="deshacer-decision"][data-clave="' + (await clave(2)) + '"]');
  await esperar(600);
  const r2b = await reg(2);
  assert("R5 -> deshacer el segundo regalo lo devuelve a revisar (el primero sigue)", r2b.cat === "REVISAR" && r2b.revisar &&
    (await reg(1)).sub === "GPP_REGALO", r2b);
  await pulsar(2, "recompensa");
  const d5 = await dialogo();
  assert("R5 -> el regalo ya decidido cuenta como el otro (se sustituiría)", d5 && d5.filas === 2 && d5.botones.includes("Todos (2)"), d5);
  await page.click(".cc-rnt-solo");
  await esperar(600);
  assert("R5 -> «Solo este»: recompensa en el segundo y el regalo del primero no se toca",
    !(await dialogo()) && (await reg(2)).sub === "RCM_REWARD" && (await reg(1)).sub === "GPP_REGALO", [await reg(1), await reg(2)]);
  /* ============ R6) auditoría: un diálogo a la vez y sin decidir sobre lo cambiado (A3) ============ */
  await page.evaluate(() => { document.getElementById("ccResueltos").open = true; });
  await page.click('#ccListaResueltos [data-accion="deshacer-decision"][data-clave="' + (await clave(2)) + '"]');
  await esperar(600);
  await pulsar(2, "regalo");
  const dos = await page.evaluate(async c => {
    ccPulsarDecision(c, "compra-rnt", null); // como un Intro en otro botón con el diálogo abierto
    await new Promise(r => setTimeout(r, 100));
    return document.querySelectorAll(".cc-dlg-overlay").length;
  }, await clave(2));
  assert("R6 -> A3: con un diálogo abierto no se abre otro", dos === 1, dos);
  await page.evaluate(async c => { await ccDeshacerDecision(c); }, await clave(1)); // cambia algo por debajo
  await esperar(400);
  const w6 = await escrituras();
  await page.click(".cc-rnt-todos");
  await esperar(300);
  const d6 = await dialogo();
  assert("R6 -> A3: si la lista cambió, no guarda y lo dice", d6 && d6.error === "Ha cambiado algo: ciérralo y vuelve a abrirlo." &&
    (await escrituras()) === w6, d6);
  await page.keyboard.press("Escape");
  await esperar(100);
  /* A10: doble clic con un guardado lento, en un RNT que llega solo (se guarda sin diálogo). */
  await page.evaluate(() => { document.querySelectorAll("#toasts .toast").forEach(t => t.remove());
    const antes = window.escribirArchivoNavegador;
    window.escribirArchivoNavegador = async c => { await new Promise(r => setTimeout(r, 250)); return antes(c); }; });
  const w10 = await escrituras();
  await page.evaluate(c => { const b = document.querySelector('#ccLista [data-accion="decidir"][data-clave="' + c + '"][data-opcion="regalo"]'); b.click(); b.click(); }, await clave(7));
  await esperar(900);
  const avisos10 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent));
  assert("R6 -> A10: doble clic: se guarda una vez y sin el aviso rojo falso", (await escrituras()) === w10 + 1 &&
    (await reg(7)).sub === "GPP_REGALO" && !avisos10.some(t => t.includes("Ya tiene un ajuste manual")), avisos10);
  /* A11: cambiar de pestaña cierra el diálogo. */
  await pulsar(1, "regalo");
  const abierto11 = !!(await dialogo());
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(300);
  const tras11 = await page.evaluate(() => document.querySelectorAll(".cc-dlg-overlay").length);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(400);
  assert("R6 -> A11: el diálogo se cierra al cambiar de pestaña", abierto11 && tras11 === 0, [abierto11, tras11]);

  await page.evaluate(() => document.body.classList.add("dark"));
  await page.evaluate(() => { const r = state.registros.find(x => x.clave === window.__clave(5)); ccAbrirDialogoRnt(r, "compra-rnt", null, ccContextoSesion(state.registros)); });
  await esperar(200);
  const oscuro = await page.evaluate(() => getComputedStyle(document.querySelector(".cc-dlg-rnt")).backgroundColor);
  assert("R5 -> en oscuro, el diálogo con el color del tema", oscuro !== "rgb(255, 255, 255)", oscuro);
  await page.screenshot({ path: path.join(OUT, "cap_rnt1_oscuro.png") });
  assert("R5 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
