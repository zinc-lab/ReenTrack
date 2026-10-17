/* Arnés de «En USD…» en 💶 Coste de las compras bancarias (P15, A), con
 * datos inventados: una compra bancaria de un inmueble pagada en USDT a
 * Reental antes de que llegaran los tokens.
 *
 *  U1) «En USD…» solo sale con la casilla abierta; abre debajo lo pagado
 *      y el día (de entrada, el de la compra), con el cursor en el importe.
 *  U2) al escribir 1.000 USD y el día del pago, la casilla de € dice
 *      909,09 (BCE 1,1), el € por token se recalcula y «Guardar» se activa;
 *      «1000.5» pide la coma y vacía la casilla.
 *  U3) «Guardar» guarda 909,09 € como su coste (una escritura) y cierra.
 *  U4) Esc en el importe cierra sin guardar; otra pulsación de «En USD…»
 *      cierra la subfila; oscuro y 0 errores.
 *  U7) un día sin tipo guardado: lo pide al BCE en el momento (simulado,
 *      sin red), lo calcula y lo guarda con la cache; una vez por día.
 *      «Guardar» antes de que llegue: aviso y no guarda; al llegar, se rellena.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifyusdt1.js
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
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });

  await page.evaluate(() => {
    const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20);
    state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
    cache.transacciones.wallet_tokens.push({ blockNumber: "50", timeStamp: String(Math.floor(Date.UTC(2024, 2, 5, 9) / 1000)),
      hash: "0x0001" + "ab".repeat(30), from: T, to: W, contractAddress: P1, value: (9n * 10n ** 18n).toString(),
      tokenName: "Reental Prueba Alcazaba 1", tokenSymbol: "RALC1", tokenDecimal: "18" });
    cache.tipos_bce = { "2024-03-01": 1.1, "2024-03-04": 1.08, "2024-03-05": 1.09 };
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila].join("\n"));
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.__writes = [];
    // El BCE simulado (sin red): tiene el 15/06/2023 y el 10/02/2022.
    window.__bce = [];
    window.descargarTiposBce = async (a, b) => { window.__bce.push([a, b]);
      return Object.fromEntries([["2023-06-15", 1.08], ["2022-02-10", 1.14]].filter(([d]) => a <= d && d <= b)); };
    window.escribirArchivoNavegador = async c => { window.__writes.push(JSON.stringify(c)); };
    ejecutarClasificacion();
  });
  await esperar(500);
  const clave = await page.evaluate(() => state.registros.find(r => r.via_compra === "BANCARIA").clave);
  const sel = s => s + '[data-clave="' + clave + '"]';
  const vista = () => page.evaluate(c => {
    const fila = [...document.querySelectorAll("#cbCuerpo tr.cb-fila")].find(f => f.getAttribute("data-clave") === c);
    // La subfila de «En USD…» (debajo de la fila abierta siempre está la de «Calcular…»).
    const u = document.querySelector("#cbCuerpo .cb-usd"), sub = u && u.closest("tr");
    const celda = fila.querySelector(".cb-por-token"), precio = celda.querySelector("input");
    return { usdt: !!fila.querySelector('[data-cb="usdt"]'), sub: !!sub, casilla: (fila.querySelector(".cb-valor") || {}).value ?? null,
      porToken: precio ? precio.value + " €" : celda.textContent, guardar: (fila.querySelector('[data-cb="guardar"]') || {}).disabled ?? null,
      usd: sub ? sub.querySelector(".cb-usd").value : null, fecha: sub ? sub.querySelector(".cb-usd-fecha").value : null,
      texto: sub ? sub.querySelector(".cb-usd-eur").textContent : null,
      foco: document.activeElement && document.activeElement.className };
  }, clave);
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const escribirUsd = async t => {
    await page.$eval("#cbCuerpo .cb-usd", el => { el.value = ""; el.focus(); });
    await page.type("#cbCuerpo .cb-usd", t);
    await esperar(100);
  };
  const ponerDia = async d => {
    await page.$eval("#cbCuerpo .cb-usd-fecha", (el, d) => { el.value = d; el.dispatchEvent(new Event("input", { bubbles: true })); }, d);
    await esperar(100);
  };

  /* U1 */
  await page.evaluate(() => { const d = document.getElementById("cbCoste"); d.open = true; d.scrollIntoView({ block: "start" }); });
  await esperar(150);
  assert("U1 -> cerrada, sin «En USD…»", !(await vista()).usdt);
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(100);
  assert("U1 -> abierta, con «En USD…»", (await vista()).usdt);
  await page.click(sel('#cbCuerpo [data-cb="usdt"]'));
  await esperar(150);
  const u1 = await vista();
  assert("U1 -> abre debajo lo pagado y el día de la compra, con el cursor en el importe",
    u1.sub && u1.usd === "" && u1.fecha === "2024-03-05" && /cb-usd/.test(u1.foco), u1);

  /* U2 */
  await escribirUsd("1000.5");
  assert("U2 -> «1000.5» pide la coma y vacía la casilla (no se queda lo de «1000»)", (await vista()).texto === "Usa la coma para los decimales (1.234,56)." &&
    (await vista()).casilla === "", await vista());
  await escribirUsd("1.000");
  await ponerDia("2024-03-01");
  const u2 = await vista();
  assert("U2 -> 1.000 USD el 01/03/2024 → la casilla dice 909,09 y lo explica",
    u2.casilla === "909,09" && u2.texto === "= 909,09 € (BCE del 01/03/2024)", u2);
  assert("U2 -> € por token recalculado (101,01 €) y «Guardar» activo", u2.porToken === "101,01 €" && u2.guardar === false, u2);
  const cabe = await page.evaluate(() => { const c = document.querySelector("#cbCuerpo .cb-caja"); return [c.scrollWidth, c.clientWidth]; });
  assert("U2 -> editando con «En USD…» abierto, la tabla cabe sin barra de desplazamiento (1366 px)", cabe[0] <= cabe[1], cabe);
  await page.screenshot({ path: path.join(OUT, "cap_usdt1_editor.png") });

  /* U3 */
  const w0 = await escrituras();
  await page.focus("#cbCuerpo .cb-usd");
  await page.keyboard.press("Enter");
  await esperar(700);
  const aj = await page.evaluate(c => state.cache.ajustes_usuario[c], clave);
  const coste = await page.evaluate(c => state.registros.find(r => r.clave === c).coste_eur, clave);
  assert("U3 -> Intro guarda 909,09 € como su coste, una escritura", aj && aj.coste_eur === 909.09 && coste === 909.09 &&
    (await escrituras()) === w0 + 1, [aj, coste]);
  const u3 = await vista();
  assert("U3 -> la fila se cierra y la subfila se va", u3.casilla === null && !u3.sub, u3);
  const pagado3 = await page.evaluate(c => [...document.querySelectorAll("#cbCuerpo tr.cb-fila")].find(f => f.getAttribute("data-clave") === c)
    .cells[4].textContent.replace(/\s+/g, " ").trim(), clave);
  assert("U3 -> guardada en USD: la fila dice «1.000,00 $» y sus € al lado (909,09 €)", pagado3 === "1.000,00 $ 909,09 €" &&
    aj.pagado_usd === 1000 && aj.fecha_pago_usd === "2024-03-01", [pagado3, aj]);

  /* U4 */
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);
  const u4o = await vista();
  assert("U4 -> al editarla, «En USD…» se abre con lo que pusiste (1.000,00 USD el 01/03/2024)",
    u4o.sub && u4o.usd === "1.000,00" && u4o.fecha === "2024-03-01" && u4o.casilla === "909,09", u4o);
  await page.click(sel('#cbCuerpo [data-cb="usdt"]'));
  await esperar(150);
  const u4a = await vista();
  assert("U4 -> otra pulsación de «En USD…» cierra la subfila (la casilla sigue abierta)", !u4a.sub && u4a.casilla !== null, u4a);
  await page.click(sel('#cbCuerpo [data-cb="usdt"]'));
  await esperar(150);
  await escribirUsd("2.000");
  const w1 = await escrituras();
  await page.keyboard.press("Escape");
  await esperar(200);
  const u4b = await vista();
  assert("U4 -> Esc cierra sin guardar", u4b.casilla === null && !u4b.sub && (await escrituras()) === w1 &&
    (await page.evaluate(c => state.cache.ajustes_usuario[c].coste_eur, clave)) === 909.09, u4b);
  /* U5) auditoría: borrar los USD, escribir los € a mano y el aviso sin tipo del BCE. */
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));   // pagada en USD: «En USD…» ya abierto
  await esperar(150);
  await escribirUsd("1");
  await page.focus("#cbCuerpo .cb-usd");
  await page.keyboard.press("Backspace");
  await esperar(100);
  const u5a = await vista();
  assert("U5 -> borrar los USD devuelve la casilla a lo que tenía (909,09), no lo de la última tecla", u5a.casilla === "909,09", u5a);
  await escribirUsd("1.000");
  await page.$eval("#cbCuerpo .cb-valor", el => { el.value = ""; el.focus(); });
  await page.type("#cbCuerpo .cb-valor", "500");
  await esperar(100);
  assert("U5 -> escrita la casilla a mano, la cuenta de abajo se borra", (await vista()).texto === "", await vista());
  await ponerDia("2020-01-01");
  await page.focus("#cbCuerpo .cb-usd");
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const w5 = await escrituras();
  await page.keyboard.press("Enter");
  await esperar(300);
  const aviso5 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | "));
  assert("U5 -> Intro sin tipo del BCE ese día: ese es el aviso, y no guarda", aviso5.includes("Sin tipo del BCE para ese día.") &&
    (await escrituras()) === w5, aviso5);

  /* U6) auditoría: lo pagado en USD se guarda a céntimos, y abrir y guardar sin tocar nada no lo cambia. */
  await page.keyboard.press("Escape");
  await esperar(150);
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);
  await escribirUsd("1000,125");
  await ponerDia("2024-03-01");
  await page.focus("#cbCuerpo .cb-usd");
  await page.keyboard.press("Enter");
  await esperar(700);
  const aj6 = await page.evaluate(c => state.cache.ajustes_usuario[c], clave);
  assert("U6 -> «1000,125» USD se guarda a céntimos (1.000,13)", aj6.pagado_usd === 1000.13, aj6);
  const w6 = await escrituras();
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);
  await page.focus("#cbCuerpo .cb-usd");
  await page.keyboard.press("Enter");
  await esperar(500);
  assert("U6 -> abrir y guardar sin tocar nada no escribe ni quita lo pagado en USD", (await escrituras()) === w6 &&
    (await page.evaluate(c => state.cache.ajustes_usuario[c].pagado_usd, clave)) === 1000.13);

  /* U7) un día anterior a lo descargado: se pide al BCE en el momento. */
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);
  await escribirUsd("1.080");
  await ponerDia("2023-06-15");
  const u7a = await vista();
  // «Guardar» antes de que llegue el tipo: el aviso, no guarda y la fila sigue abierta.
  await page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const w7 = await escrituras();
  await page.click(sel('#cbCuerpo [data-cb="guardar"]'));
  await esperar(100);
  const aviso7 = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join(" | "));
  assert("U7 -> «Guardar» antes de que llegue el tipo: el aviso, no guarda y la fila sigue abierta",
    aviso7.includes("Sin tipo del BCE para ese día.") && (await escrituras()) === w7 && (await vista()).sub, aviso7);
  await esperar(700);
  const u7 = await vista();
  assert("U7 -> sin tipo guardado, primero lo dice y luego lo trae del BCE: 1.080 USD → 1.000,00 €",
    u7a.texto === "Sin tipo del BCE para ese día." && u7.texto === "= 1.000,00 € (BCE del 15/06/2023)" && u7.casilla === "1.000,00", [u7a, u7]);
  assert("U7 -> pide los 7 días de antes hasta ese día", JSON.stringify(await page.evaluate(() => window.__bce.at(-1))) === '["2023-06-08","2023-06-15"]',
    await page.evaluate(() => window.__bce));
  const n7 = await page.evaluate(() => window.__bce.length);
  await ponerDia("2020-01-01");
  await esperar(600);
  await ponerDia("2020-01-01");
  await esperar(600);
  // El 01/01/2020 ya se pidió (vacío) en U5.
  assert("U7 -> un día que el BCE no tiene: sigue el aviso y no lo vuelve a pedir", (await vista()).texto === "Sin tipo del BCE para ese día." &&
    (await page.evaluate(() => window.__bce.length)) === n7, await page.evaluate(() => window.__bce));
  await ponerDia("2023-06-15");
  await page.focus("#cbCuerpo .cb-usd");
  await page.keyboard.press("Enter");
  await esperar(700);
  const aj7 = await page.evaluate(c => [state.cache.ajustes_usuario[c], JSON.parse(window.__writes.at(-1)).tipos_bce["2023-06-15"]], clave);
  assert("U7 -> guardado: 1.000 € de coste, 1.080 USD el 15/06/2023 y el tipo en la cache guardada",
    aj7[0].coste_eur === 1000 && aj7[0].pagado_usd === 1080 && aj7[0].fecha_pago_usd === "2023-06-15" && aj7[1] === 1.08, aj7);

  /* U8) auditoría O4: los € escritos a mano mientras llega el tipo del BCE no se pisan. */
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);
  await ponerDia("2022-02-10");
  await page.$eval("#cbCuerpo .cb-valor", el => { el.value = ""; el.focus(); });
  await page.type("#cbCuerpo .cb-valor", "700");
  await esperar(900);
  const u8 = await vista();
  assert("U8 -> el tipo del 10/02/2022 se pidió, pero los 700 € escritos a mano se quedan",
    JSON.stringify(await page.evaluate(() => window.__bce.at(-1))) === '["2022-02-03","2022-02-10"]' && u8.casilla === "700" && u8.texto === "", u8);
  await page.keyboard.press("Escape");
  await esperar(150);
  await page.click(sel('#cbCuerpo [data-cb="editar"]'));
  await esperar(150);

  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(150);
  const fondo = await page.evaluate(() => getComputedStyle(document.querySelector("#cbCuerpo .cb-usd")).backgroundColor);
  assert("U4 -> en oscuro, la casilla con el color del tema", fondo !== "rgb(255, 255, 255)", fondo);
  await page.screenshot({ path: path.join(OUT, "cap_usdt1_oscuro.png") });
  assert("U4 -> 0 errores de consola", errores.length === 0, errores.slice(0, 3));

  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
