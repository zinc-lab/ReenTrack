/* Verificación headless del historial de 🧾 Fiscal (P27): Chrome local +
 * puppeteer-core sobre http://localhost:8765. DATOS 100 % SINTÉTICOS
 * (p27_comun.js, los de test_fiscal_paso_p27.js). Capturas cap_p27_*.png.
 *
 *  H1) 2025: los dos grupos; Piso (vendido entero) oculto y el interruptor
 *      lo cuenta.
 *  H2) el interruptor lo enseña, atenuado; un repintado no lo apaga ni
 *      cierra lo desplegado.
 *  H3) «▸ 2 lotes» enseña las filas de la venta (aria-expanded), sin
 *      repintar; un repintado las deja a la vista y el foco en el botón.
 *  H4) a 1366 px las tablas abiertas no se desplazan de lado.
 *  H5) la fecha con las dos horas también con el teclado; oscuro; 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifyp27.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const path = require("path");
const { WALLET, registrosP27 } = require("./p27_comun");

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
  await page.goto(BASE + "index.html#fiscal", { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await page.reload({ waitUntil: "networkidle0" });

  // Los registros ya clasificados, como los deja la clasificación (fiEstado.vista).
  const [usdt, burn] = await page.evaluate(() => [USDT, BURN]);
  await page.evaluate(d => {
    const regs = d.regs;
    const tipos = {};
    for (const r of regs) tipos[r.fecha.slice(0, 10)] = 1.25;
    state.config = { wallet: d.wallet, vault: "", etherscan_api_key: "TEST_SINTETICA" };
    state.cache = Object.assign(cacheVacia(), { tipos_bce: tipos, ajustes_usuario: { c2: { coste_eur: 500 } },
      ultima_sincronizacion: { fecha: "2026-10-20", etherscan_fallo: false } });
    state.registros = regs;
    fiEstado.vista = { registros: regs, huella: arrHuellaConfig(state.config) };
    fiElegirAnio(2025);
    fiRenderSeguro(true);
  }, { regs: registrosP27(usdt, burn), wallet: WALLET });
  await esperar(200);

  const leer = () => page.evaluate(() => {
    const vis = el => !!el && getComputedStyle(el).display !== "none" && el.getClientRects().length > 0;
    const piso = [...document.querySelectorAll("#fiHistorial details.fi-h-activo")].find(d => d.dataset.abierto === "historial:Piso");
    const sw = document.querySelector("#fiVerTodos");
    return {
      grupos: [...document.querySelectorAll("#fiHistorial .fi-subgrupo")].map(x => x.textContent),
      interruptor: sw && sw.closest("label").textContent, encendido: sw && sw.checked,
      piso: vis(piso), pisoColor: piso && getComputedStyle(piso).color, texto: getComputedStyle(document.body).color,
      casa: [...document.querySelectorAll("#fiHistorial details.fi-h-activo")].find(d => d.dataset.abierto === "historial:Casa").open,
    };
  });

  /* ============ H1 ============ */
  let d = await leer();
  assert("H1 -> los dos grupos, con los nombres del Resumen", JSON.stringify(d.grupos) ===
    JSON.stringify(["Transmisión de tokens de inmuebles", "Permutas de monedas virtuales"]), d.grupos);
  assert("H1 -> Piso, vendido entero, oculto; el interruptor lo cuenta", !d.piso && /Ver también los que ya no tienes \(1\)/.test(d.interruptor) && !d.encendido, d);

  /* ============ H2 ============ */
  await page.click("#fiHistorial label.rv-interruptor");
  await esperar(100);
  d = await leer();
  assert("H2 -> encendido: Piso a la vista y atenuado", d.piso && d.encendido && d.pisoColor !== d.texto, d);
  await page.evaluate(() => { [...document.querySelectorAll("#fiHistorial details.fi-h-activo")].find(x => x.dataset.abierto === "historial:Casa").open = true; renderPanel(); });
  await esperar(150);
  d = await leer();
  assert("H2 -> tras un repintado, el interruptor sigue encendido y Casa abierta", d.piso && d.encendido && d.casa, d);

  /* ============ H3 ============ */
  const lotes = () => page.evaluate(() => {
    const b = document.querySelector("#fiHistorial details[open] .fi-lotes");
    const filas = [...document.querySelectorAll("#fiHistorial tr[data-de]")].filter(tr => tr.dataset.de === b.dataset.desglose);
    return { texto: b.textContent, aria: b.getAttribute("aria-expanded"), visibles: filas.filter(tr => !tr.hidden).length, n: filas.length,
      foco: document.activeElement === b, piezas: filas.map(tr => tr.cells[1].textContent) };
  });
  let l = await lotes();
  assert("H3 -> la venta con «▸ 2 lotes», cerrada", l.texto === "▸ 2 lotes" && l.aria === "false" && l.visibles === 0 && l.n === 2, l);
  await page.click("#fiHistorial details[open] .fi-lotes");
  await esperar(100);
  l = await lotes();
  assert("H3 -> al pulsarlo: «▾», aria-expanded y sus dos lotes (las compras de antes del canje)", l.texto === "▾ 2 lotes" && l.aria === "true" &&
    l.visibles === 2 && JSON.stringify(l.piezas) === JSON.stringify(["↳ Compra del 01/02/2024", "↳ Compra externa del 01/03/2024"]), l);
  await page.focus("#fiHistorial details[open] .fi-lotes");
  await page.evaluate(() => renderPanel());
  await esperar(150);
  l = await lotes();
  assert("H3 -> tras un repintado, siguen a la vista y el foco en el botón", l.visibles === 2 && l.aria === "true" && l.foco, l);

  /* ============ H4 ============ */
  await page.evaluate(() => document.querySelectorAll("#fiHistorial details.fi-h-activo").forEach(x => { x.open = true; }));
  const desborde = await page.evaluate(() => Math.max(...[...document.querySelectorAll("#fiHistorial .fi-tablawrap")].map(w => w.scrollWidth - w.clientWidth)));
  assert("H4 -> a 1366 px ninguna tabla se desplaza de lado", desborde <= 0, desborde);
  await (await page.$("#fiHistorial")).screenshot({ path: path.join(OUT, "cap_p27_historial.png") });

  /* ============ H5 ============ */
  const fecha = await page.evaluate(() => {
    const s = document.querySelector("#fiHistorial td span[title][tabindex='0']");
    return { title: s.title, hora: !!s.querySelector(".fi-h-hora") };
  });
  assert("H5 -> la fecha, con la hora debajo y las dos horas también con el teclado", /hora española · .* UTC/.test(fecha.title) && fecha.hora, fecha);
  await page.click("#btnDark");
  await esperar(300);
  const oscuro = await page.evaluate(() => ({ dark: document.body.classList.contains("dark"),
    venta: getComputedStyle(document.querySelector(".fi-et-sale")).backgroundColor }));
  assert("H5 -> oscuro: las etiquetas con su color oscuro", oscuro.dark && oscuro.venta !== "rgb(232, 239, 252)", oscuro);
  await (await page.$("#fiHistorial")).screenshot({ path: path.join(OUT, "cap_p27_oscuro.png") });
  await page.evaluate(() => localStorage.removeItem("reental_dark"));
  await browser.close();
  assert("H5 -> 0 errores de consola", errores.length === 0, errores);
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
