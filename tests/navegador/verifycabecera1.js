/* Arnés de la cabecera fija: en 📒 Transacciones, los títulos de las columnas se
 * quedan a la vista al bajar, justo debajo de la barra de arriba, y la
 * página no desplaza de lado a 1366 px.
 *
 * Sin datos (filas de relleno solo en pantalla). Ejecución (servidor en 8765
 * y NODE_PATH a puppeteer-core):  node tests/navegador/verifycabecera1.js
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  const medir = tabla => page.evaluate(id => {
    const t = document.getElementById(id);
    return {
      fija: t.parentElement.classList.contains("cabecera-fija"),
      th: Math.round(t.querySelector("thead th").getBoundingClientRect().top),
      barra: document.querySelector(".topbar").offsetHeight,
      deLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, tabla);
  for (const [hash, tabla] of [["#transacciones", "txTabla"], ["#rendimientos", "rdTabla"]]) {
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluate(h => { location.hash = h; }, hash);
    await esperar(300);
    /* Filas de relleno (solo en pantalla), después de entrar: la pestaña se repinta al abrirla. */
    await page.evaluate(id => {
      const cuerpo = document.getElementById(id).querySelector("tbody");
      const n = document.getElementById(id).querySelectorAll("thead th").length;
      cuerpo.innerHTML = Array.from({ length: 80 }, (_, i) => "<tr><td>fila " + i + "</td>" + "<td></td>".repeat(n - 2) + "<td><button type=\"button\" style=\"padding:0\">·</button></td></tr>").join("");
    }, tabla);
    await esperar(200);
    await page.evaluate(() => window.scrollTo({ top: 1800, behavior: "instant" }));
    await esperar(300);
    let m = await medir(tabla);
    assert(hash + ": al bajar, los títulos se quedan justo debajo de la barra de arriba", m.fija && m.th === m.barra && m.barra > 0, m);
    assert(hash + ": a 1366 px la página no desplaza de lado", !m.deLado, m);
    /* a-A11: con Mayús+Tab, el botón de la fila tapada por los títulos baja a la vista. */
    const preparado = await page.evaluate(id => {
      const t = document.getElementById(id), bs = t.tBodies[0].querySelectorAll("button");
      // El botón 40, justo debajo de la barra de arriba (tapado por los títulos); el foco, en el 41.
      window.scrollBy({ top: bs[40].getBoundingClientRect().top - document.querySelector(".topbar").offsetHeight - 4, behavior: "instant" });
      const tapado = bs[40].getBoundingClientRect().bottom < t.querySelector("thead th").getBoundingClientRect().bottom;
      bs[41].focus({ preventScroll: true });
      return tapado;
    }, tabla);
    await page.keyboard.down("Shift"); await page.keyboard.press("Tab"); await page.keyboard.up("Shift");
    await esperar(800);
    const foco = await page.evaluate(id => {
      const t = document.getElementById(id);
      return { boton: Math.round(document.activeElement.getBoundingClientRect().top), titulos: Math.round(t.querySelector("thead th").getBoundingClientRect().bottom) };
    }, tabla);
    assert(hash + ": a-A11, con Mayús+Tab lo enfocado no queda debajo de los títulos", preparado && foco.boton >= foco.titulos, { preparado, ...foco });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await esperar(300);
    m = await medir(tabla);
    assert(hash + ": arriba del todo, los títulos están en su sitio (debajo de los filtros)", m.th > m.barra, m);
    /* Ventana estrecha: la tabla no cabe, su caja se desplaza de lado y no se fijan. */
    await page.setViewport({ width: 900, height: 768 });
    await esperar(400);
    m = await medir(tabla);
    assert(hash + ": con la ventana estrecha no se fijan y la página no desplaza de lado", !m.fija && !m.deLado, m);
  }

  /* La burbuja de la flecha de sentido, por encima de los títulos fijos. */
  const z = await page.evaluate(() => {
    const css = [...document.styleSheets].flatMap(h => { try { return [...h.cssRules]; } catch (e) { return []; } }).map(r => r.cssText);
    return css.some(t => /.tx-sentido:hover.*z-index: 6/.test(t));
  });
  assert("A10: la flecha con el ratón encima se pone por encima de los títulos fijos (z-index 6 > 5)", z);

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
