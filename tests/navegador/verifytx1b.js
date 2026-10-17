/* Verificación headless de los colores por categoría, la tabla compacta,
 * la barra lateral plegable y la nota de 100 € por token en 📒 Transacciones:
 * Chrome local + puppeteer-core sobre http://localhost:8765. DATOS 100 %
 * SINTÉTICOS. Capturas cap_tx1b_*.png en esta carpeta.
 *
 *  A) Sin clasificar: la nota del coste no aparece (nada que explicar).
 *  B) Colores: cada etiqueta (sin franja de fila) con el color de SU
 *     categoría (paleta del Excel en claro); el triaje conserva sus colores
 *     de grupo; en modo oscuro, la versión oscura de la misma paleta.
 *  C) Tabla compacta: a 1366×768 y 1280×720 (portátil) con el menú
 *     desplegado, la tabla cabe sin scroll horizontal; a 390 px la página no
 *     desborda (la tabla scrollea en su caja).
 *  D) Menú plegable: «« Plegar menú» → rail de iconos, aria-expanded,
 *     la tabla gana ancho, se recuerda al recargar y se deshace; en rail
 *     automático (≤ 1150 px) y en móvil el botón no aparece.
 *  E) Nota del coste: con una compra externa de un inmueble dice
 *     «100 € por token» y que se edita en 🔍 Revisión (corta).
 *  G) Íntegro y retención: un rendimiento reclamado con
 *     retención enseña su íntegro en «Importe (retención)» y
 *     la retención debajo y solo si la hay (nunca el neto); el panel da el
 *     total íntegro y la retención aparte.
 *  F) Routing de las 8 vistas intacto y 0 errores de consola.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifytx1b.js
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
const rgb = hex => "rgb(" + [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(", ") + ")";

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--no-first-run", "--no-default-browser-check", "--window-size=1600,1200"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1200 });
  const consola = [];
  page.on("console", m => consola.push({ tipo: m.type(), texto: m.text(), url: (m.location() || {}).url || "" }));
  page.on("pageerror", e => consola.push({ tipo: "pageerror", texto: String(e && e.message || e), url: "" }));
  const errores = () => consola.filter(m =>
    (m.tipo === "error" || m.tipo === "pageerror") && !/favicon/i.test(m.url + " " + m.texto));

  /* Cache sintética con categorías variadas: venta, depósitos, spam, una
     COMPRA por transferencia bancaria (token de propiedad que entra sin
     stablecoin en el hash) y un rendimiento del CSV. */
  function montarDatos() {
    const W = "0x" + "11".repeat(20), V = "0x" + "22".repeat(20);
    const T = "0x" + "77".repeat(20);
    const P1 = "0x" + "a1".repeat(20), P2 = "0x" + "a2".repeat(20);
    const Hh = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
    const ts = (y, m, d, hh) => String(Math.floor(Date.UTC(y, m - 1, d, hh) / 1000));
    const tok18 = u => BigInt(Math.trunc(u * 1e18)).toString();
    const tok6 = u => BigInt(Math.trunc(u * 1e6)).toString();
    state.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100.0,
                     etherscan_api_key: "TEST_SINTETICA" };
    const cache = cacheVacia();
    cache.catalogo_propiedades = {
      [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" },
      [P2]: { estado: "CONFIRMADA", nombre_reental: "Prueba Residencial Con Un Nombre Muy Largo 2", simbolo: "RLAR2" },
    };
    const leg = (h, from, to, contrato, value, name, sym, dec, t, blk) => ({
      blockNumber: blk, timeStamp: t, hash: h, from, to, contractAddress: contrato,
      value, tokenName: name, tokenSymbol: sym, tokenDecimal: dec,
    });
    cache.transacciones.wallet_tokens.push(
      leg(Hh(1), W, T, P1, tok18(200), "Reental Prueba Alcazaba 1", "RALC1", "18", ts(2026, 6, 14, 22), "100"),
      leg(Hh(2), T, W, USDT, tok6(3204), "Tether USD", "USDT", "6", ts(2026, 6, 19, 18), "102"),
      leg(Hh(3), T, W, USDC, tok6(400), "USD Coin", "USDC", "6", ts(2026, 6, 12, 10), "103"),
      leg(Hh(4), T, W, USDC, tok6(300), "USD Coin", "USDC", "6", ts(2025, 11, 14, 9), "104"),
      leg(Hh(5), T, W, "0x" + "5a".repeat(20), tok18(1000000), "Visit claim-reward.xyz", "SCAM", "18", ts(2026, 2, 1, 9), "105"),
      leg(Hh(6), T, W, P2, tok18(12), "Reental Prueba Residencial 2", "RLAR2", "18", ts(2025, 3, 3, 11), "106"));
    state.cache = cache;
    const cab = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
    const fila = "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,400,0,400,0,\"['0x" + "99".repeat(32) + "']\",[]," + W;
    // Reclamado con retención: íntegro 100, retención 19, llegan 81.
    const fila2 = "\"Prueba Alcazaba 1#2026-T2\",2026-07-10,0,81,100,19,[],\"['0x" + "98".repeat(32) + "']\"," + W;
    const csv = cargarCsvRendimientos([cab, fila, fila2].join("\n"));
    if (csv.error) throw new Error("CSV sintético inválido: " + csv.error);
    state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
    window.escribirArchivoNavegador = async () => {};
    ejecutarClasificacion();
  }
  const cabeEnSuCaja = () => page.evaluate(() => {
    const w = document.querySelector(".tx-tablawrap");
    return { scroll: w.scrollWidth, caja: w.clientWidth, cabe: w.scrollWidth <= w.clientWidth + 1 };
  });

  /* ============ A) sin clasificar ============ */
  console.log("A) Sin clasificar");
  await page.goto(BASE + "index.html#transacciones", { waitUntil: "networkidle0" });
  await page.evaluate(() => { localStorage.removeItem("reental_dark"); localStorage.removeItem("reental_nav_plegada"); });
  await page.reload({ waitUntil: "networkidle0" });
  assert("sin registros, la nota del coste está oculta", await page.evaluate(() => document.getElementById("txNotaCoste").hidden));
  assert("el menú empieza desplegado", await page.evaluate(() =>
    !document.body.classList.contains("nav-plegada") && document.getElementById("btnPlegarNav").getAttribute("aria-expanded") === "true"));

  /* ============ B) colores por categoría ============ */
  console.log("\nB) Colores por categoría");
  await page.evaluate(montarDatos);
  await esperar(500);
  const paleta = await page.evaluate(() => TX_COLORES_CATEGORIA);
  const leerColores = () => page.evaluate(() => [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => {
    const cat = tr.querySelector(".tx-cat");
    const cs = getComputedStyle(cat);
    // El código de la categoría sale de la clase (tx-c-RENDIMIENTO): el
    // texto de la etiqueta es el de pantalla («RENDIMIENTO»).
    const codigo = [...cat.classList].find(c => c.startsWith("tx-c-")).slice(5);
    return { categoria: codigo, bg: cs.backgroundColor, fg: cs.color,
             franja: getComputedStyle(tr.querySelector("td")).boxShadow };
  }));
  const claros = await leerColores();
  const cats = [...new Set(claros.map(c => c.categoria))];
  console.log("     categorías en el libro sintético: " + cats.join(", "));
  assert("el libro sintético tiene al menos 4 categorías distintas", cats.length >= 4, cats);
  const malClaro = claros.filter(c => c.bg !== rgb(paleta[c.categoria].claro[0]) || c.fg !== rgb(paleta[c.categoria].claro[2]) ||
    c.franja !== "none");
  assert("cada fila: etiqueta (fondo y texto) con el color de SU categoría y sin franja (TX-1h)", malClaro.length === 0, malClaro.slice(0, 3));
  const distintos = new Set(claros.map(c => c.bg));
  assert("ya no sale todo verde: un color por categoría (" + distintos.size + ")", distintos.size === cats.length);
  /* Sin chips de categoría (filtra el selector). */
  assert("sin chips de categoría", await page.evaluate(() => !document.querySelector(".tx-chip, #txChips")));
  const kpis = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement);
    return { fiscal: getComputedStyle(document.querySelector('.tx-kpi[data-grupo="fiscal"]')).backgroundColor,
             revisar: getComputedStyle(document.querySelector('.tx-kpi[data-grupo="revisar"]')).backgroundColor,
             okBg: css.getPropertyValue("--ok-bg").trim(), errBg: css.getPropertyValue("--err-bg").trim() };
  });
  assert("el triaje conserva sus colores de grupo (verde fiscal, rojo revisar)",
    kpis.fiscal === rgb(kpis.okBg) && kpis.revisar === rgb(kpis.errBg), kpis);
  await page.screenshot({ path: path.join(OUT, "cap_tx1b_colores.png"), fullPage: false });

  await page.evaluate(() => document.body.classList.add("dark"));
  await esperar(250);
  const oscuros = await leerColores();
  const malOscuro = oscuros.filter(c => c.bg !== rgb(paleta[c.categoria].oscuro[0]) || c.fg !== rgb(paleta[c.categoria].oscuro[2]));
  assert("modo oscuro: la versión oscura de la misma paleta, sin repintar", malOscuro.length === 0, malOscuro.slice(0, 3));
  await page.screenshot({ path: path.join(OUT, "cap_tx1b_oscuro.png"), fullPage: false });
  await page.evaluate(() => document.body.classList.remove("dark"));

  /* ============ C) tabla compacta ============ */
  console.log("\nC) Tabla compacta");
  for (const [w, h] of [[1366, 768], [1280, 720], [1920, 1080]]) {
    await page.setViewport({ width: w, height: h });
    await esperar(300);
    const r = await cabeEnSuCaja();
    assert("a " + w + "×" + h + " con el menú desplegado la tabla cabe sin scroll horizontal", r.cabe, r);
  }
  await page.setViewport({ width: 1366, height: 768 });
  await esperar(300);
  const celdas = await page.evaluate(() => {
    /* Sin elipsis; un nombre largo pasa a dos líneas antes que recortarse. */
    const largo = [...document.querySelectorAll("#txCuerpo td.tx-token")].find(td => /Muy Largo/.test(td.textContent));
    const cs = largo ? getComputedStyle(largo) : null;
    return { hay: !!largo, elipsis: cs && cs.textOverflow === "ellipsis", recortada: largo && largo.scrollWidth > largo.clientWidth,
             title: largo && largo.title, fecha: document.querySelector("#txCuerpo .tx-fecha").textContent,
             fechaTitle: document.querySelector("#txCuerpo .tx-fecha").title,
             hash: document.querySelector("#txCuerpo .tx-hash a").textContent };
  });
  assert("un inmueble de nombre largo se lee entero (TX-1f: pasa a dos líneas, sin «…») y también en el title",
    celdas.hay && !celdas.elipsis && !celdas.recortada && /Muy Largo 2$/.test(celdas.title), celdas);
  assert("fecha corta (dd/mm/aaaa desde FECHA-1) con la hora en el title", /^\d{2}\/\d{2}\/\d{4}$/.test(celdas.fecha) &&
    celdas.fechaTitle.startsWith(celdas.fecha + " "), celdas);
  assert("hash corto «0x0001…abab ↗»", /^0x\w{4}…\w{4} ↗$/.test(celdas.hash), celdas.hash);
  await page.screenshot({ path: path.join(OUT, "cap_tx1b_portatil.png"), fullPage: false });

  /* ============ D) menú plegable ============ */
  console.log("\nD) Menú plegable");
  const anchoAntes = await page.evaluate(() => document.querySelector(".tx-tablawrap").clientWidth);
  assert("a 1366 px el botón «« Plegar menú» se ve", await page.evaluate(() =>
    getComputedStyle(document.getElementById("btnPlegarNav")).display !== "none"));
  await page.click("#btnPlegarNav");
  await esperar(300);
  const plegado = await page.evaluate(() => ({
    clase: document.body.classList.contains("nav-plegada"),
    ancho: document.querySelector(".sidebar").getBoundingClientRect().width,
    etiquetas: [...document.querySelectorAll("#navPrincipal a .label")].every(s => getComputedStyle(s).display === "none"),
    aria: document.getElementById("btnPlegarNav").getAttribute("aria-expanded"),
    ico: document.querySelector("#btnPlegarNav .nav-plegar-ico").textContent,
    guardado: localStorage.getItem("reental_nav_plegada"),
    titulo: getComputedStyle(document.querySelector(".topbar .title-block")).display !== "none",
    tabla: document.querySelector(".tx-tablawrap").clientWidth,
    titles: [...document.querySelectorAll("#navPrincipal a")].every(a => a.title.length > 0),
  }));
  assert("plegado: rail de iconos de 84 px sin etiquetas", plegado.clase && Math.round(plegado.ancho) === 84 && plegado.etiquetas, plegado);
  assert("plegado: aria-expanded=false e icono «»»", plegado.aria === "false" && plegado.ico === "»", plegado);
  assert("plegado: cada icono del menú tiene su nombre en el title", plegado.titles);
  assert("plegado: la topbar recupera el título de la app", plegado.titulo);
  assert("plegado: la tabla gana ancho (" + anchoAntes + " → " + plegado.tabla + " px)", plegado.tabla > anchoAntes + 100, plegado.tabla);
  assert("plegado: la preferencia se guarda en el navegador", plegado.guardado === "1");
  await page.screenshot({ path: path.join(OUT, "cap_tx1b_plegado.png"), fullPage: false });
  await page.reload({ waitUntil: "networkidle0" });
  assert("al recargar sigue plegado", await page.evaluate(() =>
    document.body.classList.contains("nav-plegada") && document.getElementById("btnPlegarNav").getAttribute("aria-expanded") === "false"));
  await page.click("#btnPlegarNav");
  await esperar(200);
  assert("se despliega de nuevo y se recuerda", await page.evaluate(() =>
    !document.body.classList.contains("nav-plegada") && localStorage.getItem("reental_nav_plegada") === "0" &&
    Math.round(document.querySelector(".sidebar").getBoundingClientRect().width) === 262));
  await page.setViewport({ width: 1000, height: 800 });
  await esperar(200);
  assert("a 1000 px (rail automático) el botón no aparece", await page.evaluate(() =>
    getComputedStyle(document.getElementById("btnPlegarNav")).display === "none"));
  await page.setViewport({ width: 390, height: 900 });
  await esperar(300);
  assert("a 390 px el botón no aparece y la página no desborda", await page.evaluate(() =>
    getComputedStyle(document.getElementById("btnPlegarNav")).display === "none" &&
    document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewport({ width: 1366, height: 768 });

  /* ============ E) nota del coste ============ */
  console.log("\nE) Nota del coste de compra bancaria");
  await page.evaluate(montarDatos);
  await esperar(400);
  const nota = await page.evaluate(() => {
    const el = document.getElementById("txNotaCoste");
    return { visible: !el.hidden && el.offsetHeight > 0, texto: el.textContent,
             nBanc: state.registros.filter(r => r.categoria === "COMPRA" && r.via_compra === "BANCARIA").length };
  });
  assert("hay una compra por transferencia bancaria en el libro sintético", nota.nBanc === 1, nota.nBanc);
  assert("la nota se ve y dice «100 € por token» y dónde se edita",
    nota.visible && /100 € por token/.test(nota.texto) && /se edita en 🔍 Revisión/.test(nota.texto), nota);

  /* ============ G) íntegro y retención ============ */
  console.log("\nG) Íntegro y retención");
  const ir = await page.evaluate(() => {
    const ths = [...document.querySelectorAll("#txTabla thead th")].map(th => {
      const c = th.cloneNode(true); c.querySelectorAll(".tx-burbuja").forEach(x => x.remove()); return c.textContent; });
    /* 8 columnas; la retención, bajo el importe (.tx-ret) y solo si la hay. */
    const filas = [...document.querySelectorAll("#txCuerpo tr.tx-fila")].map(tr => {
      const leerImporte = td => { const c = td.cloneNode(true); c.querySelectorAll(".tx-burbuja,.tx-ret").forEach(x => x.remove());
        const r = td.querySelector(".tx-ret"), a = td.querySelector(".tx-ayuda");
        return { imp: c.textContent, ret: r ? r.textContent : "", ayuda: td.title || (a ? a.getAttribute("aria-label") : "") }; };
      return Object.assign({ celdas: tr.children.length, op: tr.children[3].textContent }, leerImporte(tr.children[5]));
    });
    return { ths, recl: filas.find(f => f.op === "Rendimiento reclamado"), reinv: filas.find(f => f.op === "Rendimiento reinvertido"),
             otras: filas.filter(f => !/^Rendimiento/.test(f.op)).map(f => f.ret),
             nCeldas: [...new Set(filas.map(f => f.celdas))] };
  });
  assert("cabecera: «Importe (retención)», sin columna «Retención» ni «Nota del motor», 9 columnas (TX-1f)",
    ir.ths.length === 9 && ir.ths[5] === "Importe(retención)" && !ir.ths.includes("Retención") && !ir.ths.includes("Nota del motor"), ir.ths);
  assert("todas las filas tienen 9 celdas (TX-1f)", ir.nCeldas.length === 1 && ir.nCeldas[0] === 9, ir.nCeldas);
  assert("reclamado con retención: íntegro «100,00 USD» y debajo «(ret. 19,00)» (no el neto, 81)",
    ir.recl && ir.recl.imp === "100,00 USD" && ir.recl.ret === "(ret. 19,00)" && !ir.recl.imp.includes("81"), ir.recl);
  assert("reinvertido: íntegro «400,00 USD», sin línea de retención (el 0, en la ayuda)",
    ir.reinv && ir.reinv.imp === "400,00 USD" && ir.reinv.ret === "" && ir.reinv.ayuda.includes("Retención: 0 USD"), ir.reinv);
  assert("lo que no es un rendimiento no lleva retención", ir.otras.length > 0 && ir.otras.every(t => t === ""), ir.otras);
  const cabecera = await page.evaluate(() => [...document.querySelectorAll("#txTabla thead th")].slice(5, 6)
    .map(th => ({ texto: th.textContent, entera: th.scrollWidth <= th.clientWidth })));
  assert("a 1366 px las dos cabeceras se leen enteras (sin «…»)", cabecera.every(c => c.entera), cabecera);
  await page.screenshot({ path: path.join(OUT, "cap_div19b_libro.png"), fullPage: false });
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(300);
  const panel = await page.evaluate(() => {
    const t = [...document.querySelectorAll("#tarjetaMetricas .dash-card")].find(c => /💰 Rendimientos/.test(c.querySelector("h3").textContent));
    return { total: t.querySelector(".dash-value-lg").textContent, aparte: t.querySelector(".dash-aparte").textContent,
             leyenda: [...t.querySelectorAll(".dash-leg")].map(l => l.textContent),
             metrica: [...document.querySelectorAll("#tarjetaMetricas .dash-metric")].find(m => /Rendimientos/.test(m.textContent)).textContent };
  });
  assert("panel: el total es el íntegro (500,00 USD), no lo que llegó (481,00)",
    /500,00\sUSD(?!T)/.test(panel.total) && /500,00 USD/.test(panel.metrica), panel);
  assert("panel: la retención aparte (19,00 USD), sin restar",
    /Retención de Reental\s*19,00 USD/.test(panel.aparte) && /llegaron 81,00 USD netos\./.test(panel.aparte) &&
    !/no se resta|Renta Web/.test(panel.aparte), panel.aparte);
  assert("panel: reclamado 100,00 (íntegro) y reinvertido 400,00", panel.leyenda.length === 2 &&
    /Reclamado\s*100,00 USD/.test(panel.leyenda[0]) && /Reinvertido\s*400,00 USD/.test(panel.leyenda[1]), panel.leyenda);
  await page.screenshot({ path: path.join(OUT, "cap_div19b_panel.png"), fullPage: true });
  await page.evaluate(() => { location.hash = "#transacciones"; });
  await esperar(200);

  /* ============ F) routing y consola ============ */
  console.log("\nF) Routing y consola");
  const vistas = await page.evaluate(() => [...document.querySelectorAll("#navPrincipal a")].map(a => a.getAttribute("href")));
  let rutas = 0;
  for (const v of vistas) {
    await page.evaluate(h => { location.hash = h; }, v);
    await esperar(120);
    if (await page.evaluate(h => document.getElementById("view-" + h.slice(1)).classList.contains("active"), v)) rutas++;
  }
  assert("routing de las " + vistas.length + " vistas intacto", vistas.length === 8 && rutas === 8, { vistas, rutas });
  /* Volver a 📒 sin cambios no rehace la tabla (con cientos de filas, tarda);
     con un cambio, sí. */
  const rehecha = await page.evaluate(async () => {
    const espera = ms => new Promise(r => setTimeout(r, ms));
    location.hash = "#transacciones"; await espera(150);
    const fila = document.querySelector("#txCuerpo tr");
    location.hash = "#dashboard"; await espera(150);
    location.hash = "#transacciones"; await espera(150);
    const igual = document.querySelector("#txCuerpo tr") === fila;
    state.registros = state.registros.slice(1); renderTransacciones();
    return { igual, cambia: document.querySelector("#txCuerpo tr") !== fila };
  });
  assert("al volver a 📒 sin cambios, la misma tabla; con un cambio, otra", rehecha.igual && rehecha.cambia, rehecha);
  /* Fuera de 📒, su tabla se guarda dibujada (content-visibility) pero no
     ocupa sitio ni se puede llegar a ella. */
  const oculta = await page.evaluate(async () => {
    location.hash = "#dashboard"; await new Promise(r => setTimeout(r, 150));
    const v = document.getElementById("view-transacciones"), b = document.getElementById("txBuscar");
    b.focus();
    return { alto: v.offsetHeight, foco: document.activeElement === b, guardada: getComputedStyle(v).contentVisibility };
  });
  assert("fuera de 📒: 0 de alto, sin foco dentro y la tabla guardada", oculta.alto === 0 && !oculta.foco && oculta.guardada === "hidden", oculta);
  /* Auditoría del 16/10 A2: solo con @supports (sin content-visibility,
     display:block la enseñaría en las demás pestañas). */
  const regla = await page.evaluate(() => {
    for (const h of document.styleSheets) for (const r of h.cssRules)
      if (r.cssRules) for (const d of r.cssRules) if (d.selectorText === "#view-transacciones.view:not(.active)")
        return { tipo: r.constructor.name, cond: r.conditionText };
    return null;
  });
  assert("A2: la tabla guardada fuera de 📒, solo con @supports (content-visibility)", !!regla && regla.tipo === "CSSSupportsRule" && /content-visibility/.test(regla.cond), regla);
  /* Auditoría del 16/10, hueco: cambiar el ancho estando fuera de 📒 y
     volver deja el reparto de sitio como medido de cero. */
  await page.setViewport({ width: 1900, height: 900 }); await esperar(200);
  const aire = await page.evaluate(async () => {
    location.hash = "#transacciones"; await new Promise(r => setTimeout(r, 300));
    const t = document.getElementById("txTabla"), alVolver = t.style.getPropertyValue("--tx-aire");
    txRepartoHecho = ""; txRepartirAire();
    return { alVolver, deCero: t.style.getPropertyValue("--tx-aire") };
  });
  await page.setViewport({ width: 1366, height: 768 }); await esperar(200);
  assert("ancho cambiado fuera de 📒: al volver, el reparto como medido de cero", !!aire.alVolver && aire.alVolver === aire.deCero && aire.deCero !== "0px", aire);
  const errs = errores();
  assert("0 errores de consola", errs.length === 0, errs);

  await page.evaluate(() => localStorage.removeItem("reental_nav_plegada"));
  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
