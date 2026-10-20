/* Test: precios de POL desde CoinGecko en la app.
 *
 * Bajo prueba:
 * - js/08 · fechasConMovimientoPol: las fechas con POL nativo que entra o
 *   sale de la wallet; no el gas, ni los traspasos con tu vault, ni lo fallido.
 * - js/08 · precioPolHistorico: serie diaria de polygon-ecosystem-token en
 *   una llamada (aparte de la de RNT), /history si la fecha no está; más de
 *   365 días no se pide ni se apunta; lo que no da no se guarda.
 * - js/09 · pasoPol: pide solo lo que falta y guarda.
 * - js/11 · pnFechasSinPrecioPol: solo las fechas que el motor necesita
 *   (depósito de POL sin coste puesto a mano, retirada de POL); no el gas,
 *   ni los swaps, ni lo que ya tiene precio. pnUrlCoingeckoDia: POL o MATIC
 *   según la fecha. renderPanel: el bloque de POL se abre solo si falta una.
 * - index.html y js/13: sin el formulario libre de precios de POL.
 *
 * DATOS 100% SINTÉTICOS, sin red. Ejecución: node tests/test_precios_pol_paso_pol1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const AHORA = Date.UTC(2026, 9, 3, 12, 0, 0); // 03/10/2026 12:00 UTC
const dia = iso => Date.parse(iso + "T00:00:00Z");
const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20);
const EXCHANGE = "0x" + "c1".repeat(20), ROUTER = "0x" + "c2".repeat(20);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);

/* --- DOM mínimo: lo que usan renderPanel y sus tablas --- */
function nodo(tag, id) {
  const n = {
    tagName: tag, id, children: [], dataset: {}, attrs: {}, className: "", hidden: false, open: false,
    value: "", textContent: "", disabled: false, style: {},
    appendChild(c) { this.children.push(c); return c; },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {}, focus() {},
    querySelectorAll() { return []; },
  };
  Object.defineProperty(n, "innerHTML", {
    get() { return this._html || ""; },
    set(v) { this._html = v; this.children = []; },
  });
  return n;
}
function nuevoSandbox(fetchFn) {
  const elementos = {};
  const sb = {
    console: Object.assign({}, console, { error: () => {} }), URLSearchParams,
    document: {
      getElementById: id => (elementos[id] = elementos[id] || nodo("div", id)),
      createElement: t => nodo(t), activeElement: null,
    },
    __logs: [], __esperas: [], __t: AHORA, __llamadas: [], __el: elementos,
  };
  sb.globalThis = sb;
  sb.fetch = async url => { sb.__llamadas.push(url); return fetchFn(url); };
  vm.createContext(sb);
  for (const f of ["01-constantes.js", "02-utilidades.js", "08-coingecko.js", "09-sincronizacion.js",
    "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
    vm.runInContext(fs.readFileSync(path.join(BASE, "js", f), "utf8"), sb, { filename: f });
  }
  vm.runInContext(`
    log = function (m, t) { __logs.push({ m: String(m), t: t }); };
    coingeckoRitmo.ahora = () => __t;
    coingeckoRitmo.dormir = async ms => { __esperas.push(ms); __t += ms; };
    state.config = { wallet: "${W}", vault: "${V}" };
    marcarCacheDirty = () => {}; autoGuardarCache = async () => {}; renderPanel = renderPanel;
  `, sb);
  return sb;
}
const R = (sb, code) => vm.runInContext(code, sb);
const ts = iso => String(Math.floor(Date.parse(iso.replace(" ", "T") + "Z") / 1000));
const pol = (h, from, to, cantidad, fecha, isError = "0") => ({
  hash: "0x" + Buffer.from(h).toString("hex"), from, to,
  value: (BigInt(Math.round(cantidad * 1e6)) * 10n ** 12n).toString(), timeStamp: ts(fecha), isError,
  blockNumber: "150", gasUsed: "21000", gasPrice: "30000000000",
});
function cacheCon(normales, internas) {
  return { transacciones: { wallet_normales: normales, wallet_internas: internas || [], wallet_tokens: [], vault_tokens: [], vault_normales: [] },
           precios_rnt: {}, precios_rnt_no_disponibles: {}, precios_pol: {} };
}

(async () => {
  console.log("== 1. Fechas con movimiento de POL (como fechas_con_movimiento_pol) ==");
  {
    const sb = nuevoSandbox(() => { throw new Error("sin red"); });
    // Casos de fechasConMovimientoPol.
    sb.__c = cacheCon([
      pol("a", EXCHANGE, W, 50, "2026-03-01 10:00:00"),
      pol("b", W, ROUTER, 20, "2026-03-02 10:00:00"),
      pol("c", W, V, 5, "2026-03-03 10:00:00"),
      pol("d", EXCHANGE, W, 9, "2026-03-04 10:00:00", "1"),
      pol("e", W, ROUTER, 0, "2026-02-11 10:00:00"),
      pol("f", EXCHANGE, ROUTER, 7, "2026-03-06 10:00:00"),
    ], [pol("g", ROUTER, W, 3, "2026-03-07 10:00:00")]);
    const f = R(sb, "fechasConMovimientoPol(__c)").slice().sort();
    assert("las tres fechas esperadas", json(f) === json(["2026-03-01", "2026-03-02", "2026-03-07"]), f);
    R(sb, "state.config.vault = ''");
    assert("sin vault, el traspaso cuenta", R(sb, "fechasConMovimientoPol(__c)").includes("2026-03-03"));
    sb.__c2 = { transacciones: {} };
    assert("cache sin series: ninguna fecha, sin romper", R(sb, "fechasConMovimientoPol(__c2)").length === 0);
  }

  console.log("== 2. precioPolHistorico ==");
  const SERIE_POL = [[dia("2026-04-23"), 0.0777], [dia("2026-02-11"), 0.11], [AHORA, 0.9]];
  {
    const sb = nuevoSandbox(url => {
      if (url.includes("/market_chart")) return { status: 200, json: async () => ({ prices: url.includes("polygon-ecosystem-token") ? SERIE_POL : [[dia("2026-04-23"), 0.29]] }) };
      return { status: 200, json: async () => ({ market_data: { current_price: { usd: 0.2 } } }) };
    });
    sb.__c = cacheCon([]);
    assert("de la serie de POL", await R(sb, "precioPolHistorico('2026-04-23', __c)") === 0.0777);
    assert("guardado en precios_pol", json(sb.__c.precios_pol) === json({ "2026-04-23": 0.0777 }));
    assert("una sola llamada, a la serie de polygon-ecosystem-token (días 365, diario, USD)",
      sb.__llamadas.length === 1 && /coins\/polygon-ecosystem-token\/market_chart\?vs_currency=usd&days=365&interval=daily/.test(sb.__llamadas[0]), sb.__llamadas);
    assert("la segunda fecha sale de la misma serie, sin esperas", await R(sb, "precioPolHistorico('2026-02-11', __c)") === 0.11 &&
      sb.__llamadas.length === 1 && sb.__esperas.length === 0);
    assert("el precio de «ahora» no cuenta: /history de POL", await R(sb, "precioPolHistorico('2026-10-02', __c)") === 0.2 &&
      /coins\/polygon-ecosystem-token\/history\?date=02-10-2026/.test(sb.__llamadas[1]), sb.__llamadas);
    // RNT no se lleva la serie de POL ni al revés.
    sb.__c.precios_rnt = {};
    assert("RNT pide su propia serie", await R(sb, "precioRntHistorico('2026-04-23', __c)") === 0.29 &&
      sb.__llamadas.some(u => /coins\/reental\/market_chart/.test(u)));
    assert("y no toca precios_pol", sb.__c.precios_pol["2026-04-23"] === 0.0777);
  }
  {
    const sb = nuevoSandbox(() => { throw new Error("no debía llamar"); });
    sb.__c = cacheCon([]);
    assert("más de 365 días: null sin llamar", await R(sb, "precioPolHistorico('2025-10-02', __c)") === null && sb.__llamadas.length === 0);
    assert("y no se apunta en ningún sitio", json(sb.__c.precios_pol) === "{}" && json(sb.__c.precios_rnt_no_disponibles) === "{}");
    sb.__c.precios_pol["2024-01-01"] = 0.5;
    assert("lo que ya está se respeta (aunque sea viejo)", await R(sb, "precioPolHistorico('2024-01-01', __c)") === 0.5);
    sb.__c3 = { precios_rnt: {} };
    assert("cache vieja sin precios_pol: no rompe", await R(sb, "precioPolHistorico('2023-01-01', __c3)") === null && json(sb.__c3.precios_pol) === "{}");
  }
  {
    const sb = nuevoSandbox(url => {
      if (url.includes("/market_chart")) return { status: 429, json: async () => ({}) };
      return { status: 200, json: async () => ({ error: { status: { error_code: 10012 } } }) };
    });
    sb.__c = cacheCon([]);
    assert("serie limitada y 10012: null", await R(sb, "precioPolHistorico('2026-04-23', __c)") === null);
    assert("el 10012 de POL no se apunta como no disponible", json(sb.__c.precios_rnt_no_disponibles) === "{}" && json(sb.__c.precios_pol) === "{}");
    assert("aviso de la serie con el nombre del token", sb.__logs.some(l => /serie diaria de POL/.test(l.m)), sb.__logs);
  }
  {
    const sb = nuevoSandbox(url => {
      if (url.includes("/market_chart")) return { status: 200, json: async () => ({ prices: [] }) };
      return { status: 200, json: async () => ({ market_data: {} }) };
    });
    sb.__c = cacheCon([]);
    assert("sin dato: null y nada guardado", await R(sb, "precioPolHistorico('2026-04-23', __c)") === null && json(sb.__c.precios_pol) === "{}");
    assert("el aviso dice POL", sb.__logs.some(l => /Sin precio histórico de POL/.test(l.m)));
  }

  {
    // Un 0 de la serie no se guarda; un 0 (o un texto) guardado se vuelve a pedir.
    const sb = nuevoSandbox(url => {
      if (url.includes("/market_chart")) return { status: 200, json: async () => ({ prices: [[dia("2026-04-23"), 0], [dia("2026-04-24"), -1]] }) };
      return { status: 200, json: async () => ({ market_data: { current_price: { usd: 0.0777 } } }) };
    });
    sb.__c = cacheCon([]);
    sb.__c.precios_pol = { "2026-04-23": 0, "2026-04-24": "0.5" };
    assert("A7: un 0 guardado se vuelve a pedir (y el 0 de la serie no vale)", await R(sb, "precioPolHistorico('2026-04-23', __c)") === 0.0777 &&
      sb.__c.precios_pol["2026-04-23"] === 0.0777, sb.__c.precios_pol);
    assert("A7: un texto guardado, también", await R(sb, "precioPolHistorico('2026-04-24', __c)") === 0.0777);
    const sb2 = nuevoSandbox(url => url.includes("/market_chart")
      ? { status: 200, json: async () => ({ prices: [] }) }
      : { status: 200, json: async () => ({ market_data: { current_price: { usd: 0 } } }) });
    sb2.__c = cacheCon([]);
    assert("A7: un 0 de /history no se guarda", await R(sb2, "precioPolHistorico('2026-04-23', __c)") === null && json(sb2.__c.precios_pol) === "{}");
  }

  for (const cuerpo of [null, "x", [], { error: "coin not found" }]) {
    // Una respuesta rara de /history es «sin dato», no un error.
    const sb = nuevoSandbox(url => url.includes("/market_chart")
      ? { status: 200, json: async () => ({ prices: [] }) }
      : { status: 200, json: async () => cuerpo });
    sb.__c = cacheCon([]);
    let error = null;
    try { await R(sb, "precioPolHistorico('2026-04-23', __c)"); } catch (e) { error = e.message; }
    assert("A8: /history responde " + json(cuerpo) + ": sin dato, sin error", error === null && json(sb.__c.precios_pol) === "{}", error);
  }

  {
    // El precio puesto a mano mientras /history espera (un 429) no se pisa.
    let n = 0;
    const sb = nuevoSandbox(url => {
      if (url.includes("/market_chart")) return { status: 200, json: async () => ({ prices: [] }) };
      n++;
      return n === 1 ? { status: 429, json: async () => ({}) } : { status: 200, json: async () => ({ market_data: { current_price: { usd: 0.2 } } }) };
    });
    sb.__c = cacheCon([]);
    R(sb, "coingeckoRitmo.dormir = async ms => { __esperas.push(ms); __t += ms; __c.precios_pol['2026-04-23'] = 0.0777; }");
    assert("A9: manda el precio que pusiste mientras esperaba", await R(sb, "precioPolHistorico('2026-04-23', __c)") === 0.0777 &&
      sb.__c.precios_pol["2026-04-23"] === 0.0777, sb.__c.precios_pol);
  }

  console.log("== 3. pasoPol (js/09) ==");
  {
    const sb = nuevoSandbox(url => ({ status: 200, json: async () => ({ prices: SERIE_POL }) }));
    sb.__c = cacheCon([
      pol("a", EXCHANGE, W, 50, "2026-04-23 10:00:00"),
      pol("b", W, ROUTER, 20, "2026-02-11 10:00:00"),
      pol("v", EXCHANGE, W, 1, "2024-02-07 10:00:00"),
    ]);
    sb.__c.precios_pol["2026-02-11"] = 0.5;
    R(sb, "state.cache = __c");
    await R(sb, "pasoPol()");
    assert("pide solo lo que falta (y lo viejo, no)", json(sb.__c.precios_pol) === json({ "2026-02-11": 0.5, "2026-04-23": 0.0777 }), sb.__c.precios_pol);
    assert("una llamada", sb.__llamadas.length === 1);
    assert("su línea en el registro", sb.__logs.some(l => /Precios POL: 2 en cache para 3 fechas/.test(l.m)), sb.__logs);
    // También la fecha que necesita el motor aunque no sea de un
    // movimiento (un ajuste cambió la fecha del depósito).
    sb.__c5 = cacheCon([]);
    R(sb, "state.cache = __c5; state.registros = [{ contrato: 'pol', fecha: '2026-04-23 10:00:00', categoria: 'DEPOSITO', subcategoria: 'COSTE_BASE', coste_eur: null }]");
    await R(sb, "pasoPol()");
    assert("A6: pide la fecha que necesita el motor", sb.__c5.precios_pol["2026-04-23"] === 0.0777, sb.__c5.precios_pol);
    R(sb, "state.registros = null");
    // El paso de precios de la sincronización
    // (pasoRnt) trae también los de POL.
    sb.__c7 = cacheCon([pol("s", EXCHANGE, W, 5, "2026-02-11 10:00:00")]);
    Object.assign(sb.__c7, { tipos_bce: {}, catalogo_propiedades: {}, contratos_aprendidos: {}, ajustes_usuario: {} });
    R(sb, "state.cache = __c7; state.sync = state.sync || {}; toast = () => {}");
    await R(sb, "pasoRnt()");
    assert("la sincronización (paso de precios) trae los de POL", sb.__c7.precios_pol["2026-02-11"] === 0.11, sb.__c7.precios_pol);
    sb.__c4 = cacheCon([]);
    R(sb, "state.cache = __c4");
    await R(sb, "pasoPol()");
    assert("sin POL: ni llamadas ni línea", sb.__llamadas.length === 1 && !sb.__logs.some(l => /Precios POL: 0/.test(l.m)));
  }

  for (const malo of ["abc", 5, [], [0.3]]) {
    // Un bloque precios_pol mal escrito se aparta y se empieza vacío.
    const sb = nuevoSandbox(url => ({ status: 200, json: async () => ({ prices: SERIE_POL }) }));
    sb.__c = cacheCon([pol("a", EXCHANGE, W, 50, "2026-04-23 10:00:00")]);
    sb.__c.precios_pol = malo;
    R(sb, "state.cache = __c");
    let error = null;
    try { await R(sb, "pasoPol()"); } catch (e) { error = e.message; }
    assert("A5: precios_pol = " + json(malo) + ": el paso no falla y guarda el precio", error === null &&
      json(sb.__c.precios_pol) === json({ "2026-04-23": 0.0777 }), [error, sb.__c.precios_pol]);
    assert("A5: y lo que había se aparta, no se pierde", json(sb.__c.precios_pol_no_leidos) === json([malo]));
  }

  console.log("== 4. Fechas de POL sin precio que el motor necesita ==");
  {
    const sb = nuevoSandbox(() => { throw new Error("sin red"); });
    const r = (fecha, categoria, subcategoria, extra) => Object.assign(
      { contrato: "pol", fecha: fecha + " 10:00:00", categoria, subcategoria, coste_eur: null }, extra || {});
    sb.__regs = [
      r("2026-04-23", "DEPOSITO", "COSTE_BASE"),                     // necesita
      r("2024-02-07", "DEPOSITO", "COSTE_BASE", { coste_eur: 50 }),  // coste puesto a mano
      r("2026-04-24", "DEPOSITO", "COSTE_BASE", { coste_eur: 0 }),   // 0 también es un coste
      r("2025-01-10", "RETIRADA", "GPP_RETIRADA"),                    // necesita (más de 365)
      r("2026-02-11", "COMPRA", "COSTE_BASE"),                        // swap
      r("2026-03-06", "VENTA", "GPP_SWAP"),                           // swap
      r("2026-03-07", "COMISION", "NEUTRO"),                          // gas
      r("2026-03-08", "MOVIMIENTO", "NEUTRO"),                        // con tu vault
      r("2026-04-01", "DEPOSITO", "COSTE_BASE"),                      // ya tiene precio
      r("2026-04-02", "DEPOSITO", "COSTE_BASE"),                      // precio 0
      r("2026-04-03", "RETIRADA", "GPP_RETIRADA"),                    // precio escrito mal
      r("2026-04-03", "DEPOSITO", "COSTE_BASE"),                      // misma fecha: una fila
      Object.assign(r("2026-05-01", "DEPOSITO", "COSTE_BASE"), { contrato: "0x" + "ab".repeat(20) }), // no es POL
      null, { contrato: "pol" },
    ];
    sb.__c = cacheCon([]);
    sb.__c.precios_pol = { "2026-04-01": 0.3, "2026-04-02": 0, "2026-04-03": "abc" };
    const f = R(sb, `pnFechasSinPrecioPol(__c, __regs, ${AHORA})`);
    assert("solo las que necesita el motor, una por fecha y en orden", json(f.map(x => x[0])) ===
      json(["2025-01-10", "2026-04-02", "2026-04-03", "2026-04-23"]), f);
    assert("la de más de 365 días, con el motivo de RNT", f[0][1] === R(sb, "MOTIVO_RNT_FUERA_365"));
    assert("las demás: «se pedirá a CoinGecko al actualizar»", f.slice(1).every(x => x[1] === "se pedirá a CoinGecko al actualizar"), f);
    // Las mismas reglas que el motor fiscal.
    sb.__regs2 = [
      r("2026-05-02", "DEPOSITO", "COSTE_BASE", { coste_eur: "12,5" }),  // texto: el motor lo anula
      r("2026-05-03", "DEPOSITO", "COSTE_BASE", { coste_eur: -5 }),      // negativo: también
      r("2026-05-04", "DEPOSITO", "COSTE_BASE", { coste_eur: true }),
      r("2026-05-05", "DEPOSITO", "COSTE_BASE", { coste_eur: 0 }),       // 0 sí es un coste
      r("2026-05-06", "DEPOSITO", "COSTE_BASE"),                         // precio escrito como texto
      r("2026-05-07", "DEPOSITO", "COSTE_BASE"),                         // precio true
      Object.assign(r("2026-05-08", "DEPOSITO", "COSTE_BASE"), { fecha: "2026-13-40 10:00:00" }), // fecha que no existe
      Object.assign(r("2026-05-09", "DEPOSITO", "COSTE_BASE"), { fecha: 20260509 }),
    ];
    sb.__c6 = { precios_pol: { "2026-05-06": "0.52", "2026-05-07": true } };
    const f2 = R(sb, `pnFechasSinPrecioPol(__c6, __regs2, ${AHORA})`).map(x => x[0]);
    assert("A2: coste en texto, negativo o true y precio en texto o true: faltan, como en el motor",
      json(f2) === json(["2026-05-02", "2026-05-03", "2026-05-04", "2026-05-06", "2026-05-07"]), f2);
    assert("sin registros (sin clasificar): ninguna", R(sb, `pnFechasSinPrecioPol(__c, null, ${AHORA})`).length === 0);
    assert("sin cache: ninguna", R(sb, `pnFechasSinPrecioPol(null, __regs, ${AHORA})`).length === 0);
    sb.__c5 = { transacciones: {} };
    assert("cache vieja sin precios_pol: no rompe", R(sb, `pnFechasSinPrecioPol(__c5, __regs, ${AHORA})`).length === 5);

    console.log("== 5. Enlaces a CoinGecko ==");
    // La página «polygon» lleva MATIC y POL (matic-network y polygon-ecosystem-token redirigen y pierden la fecha).
    assert("POL desde el 04/09/2024: polygon", R(sb, "pnUrlCoingeckoDia('2024-09-04', CG_POL)") ===
      "https://www.coingecko.com/en/coins/polygon/historical_data?start=2024-09-04&end=2024-09-04");
    assert("POL antes (MATIC): polygon", /coins\/polygon\/historical_data\?start=2024-09-03&end=2024-09-03$/.test(R(sb, "pnUrlCoingeckoDia('2024-09-03', CG_POL)")));
    const indexPol = require("fs").readFileSync(require("path").join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
    assert("RETOQUES R5: el enlace general de la ayuda de POL también va a «polygon»",
      indexPol.includes('href="https://www.coingecko.com/en/coins/polygon"') && !indexPol.includes("polygon-ecosystem-token"));
    assert("RNT como siempre (también sin token)", /coins\/reental\/historical_data/.test(R(sb, "pnUrlCoingeckoDia('2024-09-03')")) &&
      /coins\/reental\//.test(R(sb, "pnUrlCoingeckoDia('2026-01-01', CG_RNT)")));

    console.log("== 6. Bloque de POL en 🔍 Revisión ==");
    sb.__c.catalogo_propiedades = {}; sb.__c.contratos_aprendidos = {}; sb.__c.tipos_bce = {}; sb.__c.ajustes_usuario = {};
    R(sb, "state.cache = __c; state.registros = __regs; renderPanel()");
    const el = sb.__el;
    assert("se abre solo y avisa", el.rvPreciosPol.open === true && el.rvPreciosPolAviso.textContent === "⚠ 4 sin precio", el.rvPreciosPolAviso.textContent);
    assert("la tabla de fechas sin precio se ve, con 4 filas", el.rvPolFaltantes.hidden === false &&
      el.tablaPreciosPolFaltantes.children.length === 4 && el.nPreciosPolFaltantes.textContent === 4);
    const fila = el.tablaPreciosPolFaltantes.children[3];
    assert("cada fila enlaza a su día en CoinGecko", /coins\/polygon\/historical_data\?start=2026-04-23/.test(fila.children[0].innerHTML), fila.children[0].innerHTML);
    assert("los precios guardados, aparte", el.nPreciosPol.textContent === 3 && el.tablaPreciosPol.children.length === 3);
    assert("RNT, sin fechas: cerrado y sin aviso", el.rvPreciosRnt.open === false && el.rvPreciosRntAviso.textContent === "");
    // Guardar el que falta: sale de la lista; el bloque no se vuelve a abrir solo.
    const input = fila.children[2].children[0];
    input.value = "0,0777";
    R(sb, "toast = () => {}; actualizarChipEstado = () => {}");
    await R(sb, "guardarPrecioFaltante(CG_POL, '2026-04-23', " + "{ value: '0,0777', focus() {} })");
    assert("guardado con coma, en precios_pol", sb.__c.precios_pol["2026-04-23"] === 0.0777);
    assert("ya no falta", el.tablaPreciosPolFaltantes.children.length === 3 && el.rvPreciosPolAviso.textContent === "⚠ 3 sin precio");
    assert("no toca los de RNT", json(sb.__c.precios_rnt) === "{}");
    await R(sb, "guardarPrecioFaltante(CG_POL, '2026-04-02', { value: '-1', focus() {} })");
    // Con un bloque que no es un objeto, se guarda en uno nuevo (no se pierde).
    const antes = sb.__c.precios_pol;
    sb.__c.precios_pol = [];
    R(sb, "renderPanel()");
    await R(sb, "guardarPrecioFaltante(CG_POL, '2026-04-23', { value: '0.08', focus() {} })");
    assert("A5: con [] el precio se guarda de verdad", json(sb.__c.precios_pol) === json({ "2026-04-23": 0.08 }) &&
      JSON.parse(JSON.stringify(sb.__c)).precios_pol["2026-04-23"] === 0.08, sb.__c.precios_pol);
    sb.__c.precios_pol = "abc";
    R(sb, "renderPanel()");
    assert("A5: «abc» no se pinta como tres precios", el.nPreciosPol.textContent === 0, el.nPreciosPol.textContent);
    sb.__c.precios_pol = antes;
    R(sb, "renderPanel()");
    assert("un precio negativo no se guarda", sb.__c.precios_pol["2026-04-02"] === 0);
    // Con todo decidido, el aviso se va y el bloque deja de estar «avisado».
    sb.__c.precios_pol = { "2025-01-10": 1, "2026-04-01": 0.3, "2026-04-02": 1, "2026-04-03": 1, "2026-04-23": 1 };
    R(sb, "renderPanel()");
    assert("sin fechas que falten: sin aviso ni tabla", el.rvPreciosPolAviso.textContent === "" && el.rvPolFaltantes.hidden === true &&
      el.rvPreciosPol.dataset.avisado === undefined);
  }

  console.log("== 7. Sin formulario libre ==");
  {
    const html = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
    const js13 = fs.readFileSync(path.join(BASE, "js", "13-inicio.js"), "utf8");
    const js11 = fs.readFileSync(path.join(BASE, "js", "11-panel.js"), "utf8");
    assert("index.html sin el formulario de POL", !/btnAddPrecioPol|inpPrecioPolFecha|inpPrecioPolValor/.test(html));
    assert("js/13 y js/11 sin él", !/btnAddPrecioPol|añadirPrecio/.test(js13 + js11));
    assert("el bloque de POL tiene su tabla de fechas sin precio y su aviso",
      /id="tablaPreciosPolFaltantes"/.test(html) && /id="rvPreciosPolAviso"/.test(html) && /id="rvPolFaltantes" hidden/.test(html));
    assert("el paso de la sincronización dice RNT y POL", /id="dot-rnt"><i><\/i>Precios de RNT y POL</.test(html));
  }

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
