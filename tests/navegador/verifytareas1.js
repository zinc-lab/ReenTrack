/* Arnés de 🔍 Revisión como lista de tareas (P21 y P21b; antes, el índice
 * fijo de P1). Una caja con una fila por bloque, en el orden en que
 * conviene resolver (inmuebles, direcciones, por decidir, coste, RNT y
 * POL), sin números, cada una con su estado a la derecha: «Al día» en
 * verde y el aviso en ámbar. «Por decidir» solo sale si hay algo: en rojo,
 * abierta y con un aviso encima de la caja que lleva a ella. Cerrada, la
 * caja es estrecha; con una fila abierta, ancha. «Ya decididos» y «Ajustes
 * en JSON», enlaces debajo. El aviso de tokens con dudas va arriba del
 * todo de «Por decidir». Al salir de 🔍 (y al recargar) todo queda
 * plegado; al volver solo se reabre «Por decidir» (el catálogo, no).
 *
 * Sin datos (relleno solo en pantalla). Ejecución (servidor en 8765 y
 * NODE_PATH a puppeteer-core):  node tests/navegador/verifytareas1.js
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
  await page.goto(BASE + "index.html#revision", { waitUntil: "networkidle0" });
  await esperar(300);

  /* El estado que se ve de cada fila: el texto de su aviso o, vacío y a la
     vista, «Al día» (lo pone el CSS). */
  const filas = () => page.evaluate(() => [...document.querySelectorAll(".rv-tareas>details")].map(d => {
    const a = d.querySelector(":scope>summary>.rv-aviso");
    const visto = a && getComputedStyle(a).display !== "none";
    return { id: d.id, oculta: getComputedStyle(d).display === "none", estado: !visto ? "" : a.textContent || getComputedStyle(a, "::before").content.replace(/"/g, ""),
      abierta: d.open };
  }));
  /* El aviso de encima de la caja: su texto si se ve. */
  const visto = id => page.evaluate(id => { const e = document.getElementById(id); return getComputedStyle(e).display === "none" ? "" : e.textContent; }, id);
  const arriba = () => visto("ccPorDecidirArriba");

  const f0 = await filas();
  assert("6 filas en orden: inmuebles, direcciones, por decidir, coste, RNT y POL, sin números",
    f0.map(f => f.id).join() === "rvCatalogo,rvContratos,ccPorDecidir,cbCoste,rvPreciosRnt,rvPreciosPol", f0);
  assert("sin movimientos: ninguna fila dice «Al día»; «Por decidir» y su aviso no salen",
    f0.every(f => f.estado === "") && f0.find(f => f.id === "ccPorDecidir").oculta && (await arriba()) === "", f0);
  assert("sin datos: encima de la caja, en gris, «completa 🚀 Puesta en marcha»",
    (await visto("ccContexto")) === "Sin datos todavía: completa 🚀 Puesta en marcha.", await visto("ccContexto"));
  const forma = await page.evaluate(() => {
    const caja = document.querySelector(".rv-tareas"), cs = getComputedStyle(caja);
    const v = n => { const e = document.createElement("i"); e.style.color = "var(" + n + ")"; document.body.appendChild(e); const r = getComputedStyle(e).color; e.remove(); return r; };
    return { centrada: cs.marginLeft === cs.marginRight && parseFloat(cs.marginLeft) > 50,
      raya: getComputedStyle(document.getElementById("rvContratos")).borderTopColor === v("--border2") };
  });
  assert("la caja centrada y las rayas entre filas en --border2", forma.centrada && forma.raya, forma);
  const margenes = await page.evaluate(() => [...document.querySelectorAll(".rv-tarea")].map(d => getComputedStyle(d).marginTop));
  assert("A3: las filas sin margen de más arriba", margenes.every(m => m === "0px"), margenes);
  const enlaces = await page.evaluate(() => [...document.querySelectorAll(".rv-enlaces>details")].map(d => d.id).join());
  assert("«Ya decididos» y «Ajustes en JSON», debajo, como enlaces", enlaces === "ccResueltos,rvAjustes", enlaces);
  assert("sin el índice fijo de antes", await page.evaluate(() => !document.getElementById("ccIndice")));

  /* Con un movimiento por decidir, una compra bancaria sin coste y tokens con
     dudas (como al pintarlos js/11, 15 y 20). */
  const sembrar = (dudas, porDecidir, ajustes) => page.evaluate(async (dudas, porDecidir, ajustes) => {
    const cat = {};
    for (let i = 0; i < 3; i++) cat["0x" + String(i + 1).repeat(40)] = { estado: i < dudas ? "CANDIDATA" : "CONFIRMADA" };
    state.config = Object.assign({}, state.config, { wallet: "0x" + "9".repeat(40) });
    state.cache = { catalogo_propiedades: cat, transacciones: {}, ajustes_usuario: ajustes || {} };
    state.registros = [{ clave: "0x" + "ef".repeat(32) + "::0x" + "11".repeat(20), hash: "0x" + "ef".repeat(32), contrato: "0x" + "11".repeat(20),
      fecha: "2026-03-01 10:00:00", categoria: "COMPRA", via_compra: "BANCARIA", cantidad: 2, simbolo: "AAA", inmueble: "Uno", fuente: "ONCHAIN" }];
    if (porDecidir) state.registros.push({ clave: "0x" + "ab".repeat(32) + "::0x" + "cd".repeat(20), hash: "0x" + "ab".repeat(32), contrato: "0x" + "cd".repeat(20),
      fecha: "2026-05-12 09:45:46", categoria: "REVISAR", subcategoria: "", revisar: true, cantidad: 1, simbolo: "XYZ", fuente: "ONCHAIN" });
    document.getElementById("rvCatalogoAviso").textContent = dudas ? "⚠ " + dudas + " con dudas" : "";
    renderCosteCompras();
    renderCorrecciones();
    await new Promise(r => setTimeout(r, 50));
  }, dudas, porDecidir, ajustes);

  await sembrar(2, true);
  const f1 = await filas();
  const por = f1.find(f => f.id === "ccPorDecidir");
  assert("«Por decidir»: sale, «1 por decidir» y abierta", !por.oculta && por.estado === "1 por decidir" && por.abierta, por);
  assert("encima de la caja: «⚠ Todavía hay 1 movimiento por decidir.»", (await arriba()) === "⚠ Todavía hay 1 movimiento por decidir.", await arriba());
  assert("con datos y tu wallet, sin la línea gris de encima", (await visto("ccContexto")) === "");
  const rojos = await page.evaluate(() => {
    const v = n => { const e = document.createElement("i"); e.style.color = "var(" + n + ")"; document.body.appendChild(e); const r = getComputedStyle(e).color; e.remove(); return r; };
    const fondo = id => getComputedStyle(document.getElementById(id)).backgroundColor;
    return { fila: fondo("ccPorDecidir") === v("--err-bg"), arriba: fondo("ccPorDecidirArriba") === v("--err-bg") };
  });
  assert("la fila y el aviso de arriba, con fondo rojo", rojos.fila && rojos.arriba, rojos);
  const plural = await page.evaluate(() => {
    const r0 = state.registros.find(r => r.revisar);
    state.registros.push(Object.assign({}, r0, { clave: r0.clave + "b" }), Object.assign({}, r0, { clave: r0.clave + "c" }));
    renderCorrecciones();
    const t = document.getElementById("ccPorDecidirArriba").textContent;
    state.registros = state.registros.filter(r => !/[bc]$/.test(r.clave));
    renderCorrecciones();
    return t;
  });
  assert("con 3: «⚠ Todavía hay 3 movimientos por decidir.»", plural === "⚠ Todavía hay 3 movimientos por decidir.", plural);
  /* FOCO-DECIDIR: al repintar, el foco no cae al principio de la página:
     sigue en su botón, pasa a la tarjeta que ocupa el sitio de la decidida
     y, sin ninguna, al título de la fila siguiente. */
  const foco = await page.evaluate(() => {
    const r0 = state.registros.find(r => r.revisar), regs = state.registros;
    state.registros = regs.concat([Object.assign({}, r0, { clave: r0.clave + "b" }), Object.assign({}, r0, { clave: r0.clave + "c" })]);
    renderCorrecciones();
    const enfocado = () => { const e = document.activeElement, t = e.closest("[data-hash]"); return (t ? t.getAttribute("data-clave").slice(-1) + ":" : "") + (e.getAttribute("data-opcion") || e.id || e.parentElement.id); };
    const botones = c => document.querySelectorAll('#ccLista [data-hash][data-clave="' + r0.clave + c + '"] [data-accion="decidir"]');
    const opcion = botones("b")[1].getAttribute("data-opcion");
    botones("b")[1].focus();
    renderCorrecciones();
    const mismo = enfocado();
    state.registros = state.registros.filter(r => r.clave !== r0.clave + "b");
    renderCorrecciones();
    const siguiente = enfocado();
    state.registros = state.registros.filter(r => r.clave !== r0.clave + "c");
    renderCorrecciones();
    const ultimaAntes = enfocado();
    state.registros = regs.filter(r => !r.revisar);
    renderCorrecciones();
    const fuera = enfocado();
    state.registros = regs;
    renderCorrecciones();
    return { mismo, siguiente, ultimaAntes, fuera, opcion };
  });
  assert("FOCO-DECIDIR: repintar deja el foco en su botón; decidida la tarjeta, el primer botón de la que ocupa su sitio; " +
    "la última, la de antes; sin ninguna, el título de «Coste»",
    foco.mismo === "b:" + foco.opcion && /^c:/.test(foco.siguiente) && /^d:/.test(foco.ultimaAntes) && foco.fuera === "cbCoste", foco);
  /* Sin wallet, la línea gris lo dice (la fila no sale: nada por vincular). */
  const sinWallet = await page.evaluate(() => {
    const antes = state.config;
    state.config = Object.assign({}, antes, { wallet: "" });
    const regs = state.registros;
    state.registros = regs.filter(r => !r.revisar);
    renderCorrecciones();
    const t = getComputedStyle(document.getElementById("ccContexto")).display === "none" ? "" : document.getElementById("ccContexto").textContent;
    state.config = antes; state.registros = regs;
    renderCorrecciones();
    return t;
  });
  assert("sin wallet: «⚠ Falta tu wallet…» encima de la caja", sinWallet === "⚠ Falta tu wallet (tus datos de 🚀 Puesta en marcha).", sinWallet);
  assert("el número del menú es el mismo", await page.evaluate(() => document.getElementById("ccNavRevision").textContent) === "1");
  assert("inmuebles: el aviso en ámbar; direcciones, RNT y POL: «Al día»; coste: «⚠ 1 sin coste»",
    f1[0].estado === "⚠ 2 con dudas" && ["rvContratos", "rvPreciosRnt", "rvPreciosPol"].every(id => f1.find(f => f.id === id).estado === "Al día") &&
    f1.find(f => f.id === "cbCoste").estado === "⚠ 1 sin coste", f1);
  /* A4: una compra con otro ajuste (una nota en el JSON) y sin coste también
     cuenta: el informe la marca igual con «**». */
  await sembrar(2, true, { ["0x" + "ef".repeat(32) + "::0x" + "11".repeat(20)]: { nota: "a mano" } });
  const conNota = (await filas()).find(f => f.id === "cbCoste").estado;
  assert("A4: con una nota a mano y sin coste, sigue «⚠ 1 sin coste»", conNota === "⚠ 1 sin coste", conNota);
  await sembrar(2, true);
  const colores = await page.evaluate(() => {
    const c = id => getComputedStyle(document.querySelector("#" + id + ">summary>.rv-aviso")).backgroundColor;
    const v = n => { const e = document.createElement("i"); e.style.color = "var(" + n + ")"; document.body.appendChild(e); const r = getComputedStyle(e).color; e.remove(); return r; };
    return { amb: c("rvCatalogo") === v("--warn-bg"), verde: c("rvContratos") === v("--ok-bg"), rojo: c("ccPorDecidir") === v("--err") };
  });
  assert("colores: ámbar, verde y rojo", colores.amb && colores.verde && colores.rojo, colores);

  /* Auditoría del 16/10 A1: abierta, la fila no recorta; la burbuja ⓘ de la
     primera tarjeta (hacia arriba) se ve entera. */
  const ip = await page.evaluate(() => {
    const d = document.querySelector("#ccLista .cc-dudas"); if (d) d.style.display = "none";
    document.getElementById("ccPorDecidir").scrollIntoView({ block: "center" });
    const tarjeta = document.querySelector("#ccLista .cc-item");
    if (!tarjeta) return null;
    tarjeta.insertAdjacentHTML("afterbegin", ccInfo("Una explicación larga. ".repeat(12))); // como la del motivo
    const i = tarjeta.querySelector(".cc-info");
    const r = i.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (ip) await page.mouse.move(ip.x, ip.y);
  await esperar(150);
  const recorte = await page.evaluate(() => {
    const bu = document.querySelector("#ccLista .cc-info .cc-burbuja");
    if (!bu) return { sinBurbuja: true };
    const r = bu.getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + 4);
    const d = document.querySelector("#ccLista .cc-dudas"); if (d) d.style.display = "";
    return { overflow: getComputedStyle(document.getElementById("ccPorDecidir"), "::details-content").overflow, arribaSeVe: !!(e && bu.contains(e)) };
  });
  await page.mouse.move(0, 0);
  assert("A1: abierta, sin recorte: la burbuja ⓘ de la primera tarjeta se ve entera", recorte.overflow === "visible" && recorte.arribaSeVe, recorte);

  /* El aviso de tokens con dudas, arriba del todo de «Por decidir», y lleva al catálogo. */
  const primero = await page.evaluate(() => (document.querySelector("#ccLista>*") || {}).className);
  assert("el aviso de tokens con dudas, lo primero de «Por decidir»", primero === "cc-cab cc-dudas", primero);
  const aviso = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    document.querySelector(".cc-dudas a").click();
    await new Promise(r => setTimeout(r, 500));
    return { abierto: document.getElementById("rvCatalogo").open, hash: location.hash };
  });
  assert("su enlace abre el catálogo sin cambiar de pestaña", aviso.abierto && aviso.hash === "#revision", aviso);

  /* Ancho: estrecha cerrada, ancha con una fila abierta; el aviso de
     arriba, siempre como la caja cerrada. */
  const ancho = await page.evaluate(() => {
    const caja = document.querySelector(".rv-tareas"), avisoArriba = document.getElementById("ccPorDecidirArriba");
    document.querySelectorAll(".rv-tareas>details").forEach(d => { d.open = false; });
    const cerrada = caja.offsetWidth, arribaCerrada = avisoArriba.offsetWidth;
    document.getElementById("rvPreciosPol").open = true;
    const abierta = caja.offsetWidth, arribaAbierta = avisoArriba.offsetWidth;
    document.getElementById("rvPreciosPol").open = false;
    return { cerrada, abierta, arribaCerrada, arribaAbierta };
  });
  assert("cerrada, ≤ 780 px; con una fila abierta, todo el ancho; el aviso de arriba, como la caja cerrada",
    ancho.cerrada <= 780 && ancho.abierta > 900 && ancho.arribaCerrada === ancho.cerrada && ancho.arribaAbierta === ancho.cerrada, ancho);

  /* El aviso de arriba lleva a «Por decidir» y la abre, aunque otra fila
     abierta la deje fuera de la vista. */
  const salto = await page.evaluate(async () => {
    const $ = id => document.getElementById(id);
    $("rvCatalogo").open = true;
    $("tablaCatalogo").insertAdjacentHTML("beforeend", '<tr id="relleno"><td style="height:2000px"></td></tr>');
    window.scrollTo({ top: 0, behavior: "instant" });
    $("ccPorDecidir").open = false;
    const antes = $("ccPorDecidir").getBoundingClientRect().top > innerHeight;
    $("ccPorDecidirArriba").querySelector("a").click();
    await new Promise(r => setTimeout(r, 900));
    const top = $("ccPorDecidir").getBoundingClientRect().top;
    const foco = document.activeElement === $("ccPorDecidir").querySelector("summary");
    $("relleno").remove();
    const abierta = $("ccPorDecidir").open;
    $("ccPorDecidir").open = $("rvCatalogo").open = false;
    return { antes, abierta, foco, aLaVista: top >= 0 && top < innerHeight / 2, hash: location.hash };
  });
  assert("el aviso de arriba baja a «Por decidir» (fuera de la vista bajo el catálogo abierto), la abre y le pasa el foco",
    salto.antes && salto.abierta && salto.foco && salto.aLaVista && salto.hash === "#revision", salto);

  /* Si lo cierras no se vuelve a abrir solo; sin nada por decidir, ni la fila ni su aviso. */
  await sembrar(0, true);
  assert("cerrada a mano, no se abre sola al repintar", !(await filas()).find(f => f.id === "ccPorDecidir").abierta);
  await page.evaluate(() => { document.getElementById("ccPorDecidir").open = true; });
  await sembrar(0, false);
  const f2 = (await filas()).find(f => f.id === "ccPorDecidir");
  const cab = await page.evaluate(() => [...document.querySelectorAll("#ccLista .cc-cab")].map(e => e.textContent));
  const anchoLimpio = await page.evaluate(() => document.querySelector(".rv-tareas").offsetWidth);
  assert("sin nada por decidir: ni «Por decidir» ni su aviso, sin una cabecera vacía, y la caja estrecha aunque la fila quedara abierta",
    f2.oculta && (await arriba()) === "" && cab.length === 0 && anchoLimpio <= 780, { f2, cab, anchoLimpio });
  await sembrar(0, true);
  assert("al volver a haber algo, se abre otra vez", (await filas()).find(f => f.id === "ccPorDecidir").abierta);

  /* «Ir al catálogo» de 🚀 lo abre. */
  const desde19 = await page.evaluate(async () => {
    document.getElementById("rvCatalogo").open = false;
    arrIrAlCatalogo();
    await new Promise(r => setTimeout(r, 600));
    return document.getElementById("rvCatalogo").open;
  });
  assert("«Ir al catálogo» de 🚀 lo abre", desde19);

  /* Al imprimir no sale «ⓘ Qué es cada cosa» (🔍 y 📒). */
  await page.emulateMediaType("print");
  // Va en la barra de arriba, que no se imprime.
  const impreso = await page.evaluate(() => { const b = document.querySelector(".top-right .cc-que-es"); return b && b.offsetParent === null; });
  await page.emulateMediaType(null);
  assert("al imprimir, sin «ⓘ Qué es cada cosa» (en 🔍 y en 📒)", impreso === true, impreso);

  /* Al salir de 🔍 se pliega todo menos «Por decidir», que con algo se
     vuelve a abrir; un enlace a un bloque lo abre igual. */
  const abiertas = () => page.evaluate(() => [...document.querySelectorAll("#view-revision details[open]")].map(d => d.id));
  await page.evaluate(() => ["rvCatalogo", "cbCoste", "rvPreciosRnt", "ccResueltos"].forEach(id => { document.getElementById(id).open = true; }));
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(200);
  await page.evaluate(() => { location.hash = "#revision"; });
  await esperar(200);
  const alVolver = await abiertas();
  await page.evaluate(() => { location.hash = "#dashboard"; });
  await esperar(200);
  await page.evaluate(() => irAFechasSinPrecio());
  await esperar(400);
  const conEnlace = await abiertas();
  assert("al volver a 🔍, todo plegado menos «Por decidir»; «fechas sin precio» abre su bloque",
    JSON.stringify(alVolver) === '["ccPorDecidir"]' && JSON.stringify(conEnlace) === '["ccPorDecidir","rvPreciosRnt"]', { alVolver, conEnlace });
  /* A1: el catálogo con dudas, cerrado a mano, no se abre solo al volver a
     🔍 y repintar (como al decidir un movimiento); «Por decidir», sí. */
  const a1 = await page.evaluate(async () => {
    const $ = id => document.getElementById(id), espera = ms => new Promise(r => setTimeout(r, ms));
    state.cache = Object.assign(cacheVacia(), { catalogo_propiedades: { ["0x" + "7".repeat(40)]: { estado: "CANDIDATA" } } });
    renderPanel();
    const alPintar = $("rvCatalogo").open, aviso = $("rvCatalogoAviso").textContent;
    $("rvCatalogo").open = false;
    $("ccPorDecidir").open = false;
    location.hash = "#dashboard"; await espera(150);
    location.hash = "#revision"; await espera(150);
    renderPanel();
    return { alPintar, aviso, catalogo: $("rvCatalogo").open, porDecidir: $("ccPorDecidir").open };
  });
  assert("A1: al volver y repintar, el catálogo cerrado a mano sigue cerrado y «Por decidir» se abre",
    a1.alPintar && a1.aviso === "⚠ 1 con dudas" && !a1.catalogo && a1.porDecidir, a1);
  await page.reload({ waitUntil: "networkidle0" });
  await esperar(300);
  const alRecargar = await abiertas();
  assert("al recargar (sin datos), todo plegado", alRecargar.length === 0, alRecargar);

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
