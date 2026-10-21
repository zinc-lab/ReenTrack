/* Test de 📊 Dashboard.
 *
 * Bajo prueba (Reental-SPA/js/16-dashboard.js):
 * - dashRendimientosResumen: también por mes del reparto y por inmueble,
 *   con las mismas partes (las filas que tus decisiones sacan no suman).
 * - dashColumnasRendimientos: por mes, todos los meses entre el primero y
 *   el último (a 0 los que no tienen repartos); por año; sin «sin fecha».
 * - dashEjeRedondo: escalones redondos con el tope justo por encima.
 * - dashSvgApiladas / dashHtmlBocadillo: la pila suma el íntegro (la
 *   retención va dentro de lo reclamado y se dice en el bocadillo).
 * - dashCarteraTokens: tokens de cada inmueble confirmado en tu wallet y tu
 *   vault (compras − ventas; entre ellas no cambia nada), sin los que ya no
 *   tienes, con los negativos y lo ilegible aparte.
 * - dashTarjetaInmuebles / dashTarjetaCartera: los 5 primeros y «Ver
 *   todos»; estados «No disponible».
 * - index.html: la pestaña se llama «Dashboard».
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_dashboard_paso_ui4.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", S);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const W = "0x" + "e1".repeat(20), V = "0x" + "e2".repeat(20), X = "0x" + "88".repeat(20);
const fecha = s => new Date(s + "T10:00:00Z");
const fila = (inmueble, f, distributed, reinvested, claimed, retained, linea) =>
  ({ inmueble, fecha_reparto: f ? fecha(f) : null, distributed, reinvested, claimed, retained, linea_csv: linea });

console.log("== 1. Rendimientos por mes y por inmueble ==");
const filas = [
  fila("Cáceres 8", "2025-11-10", 10, 10, 0, 0, 2),
  fila("Cáceres 8", "2026-01-10", 12, 12, 0, 0, 3),
  fila("Fondo 1", "2026-01-12", 10, 0, 8.1, 1.9, 4),   // reclamado con retención
  fila("Fondo 1", "2026-02-10", 5, 0, 0, 0, 5),        // pendiente
  fila("", "2026-02-11", 3, 3, 0, 0, 6),               // sin inmueble
  fila("Cáceres 8", null, 4, 4, 0, 0, 7),               // sin fecha
];
const r = S.dashRendimientosResumen(filas);
assert("por mes: nov-2025, ene-2026 y feb-2026 (el sin fecha no)", json(r.porMes.map(m => m.periodo)) === json(["2025-11", "2026-01", "2026-02"]), r.porMes);
const ene = r.porMes[1];
assert("ene-2026: 22 de íntegro, 10 reclamado (con su retención), 1,9 de retención, 2 repartos",
  ene.total === 22 && ene.reclamado === 10 && ene.retained === 1.9 && ene.reinvested === 12 && ene.filas === 2, ene);
assert("por inmueble, de más a menos: Cáceres 8 (26, con el sin fecha), Fondo 1 (15), sin inmueble (3)",
  json(r.porInmueble.map(e => [e.periodo, e.total])) === json([["Cáceres 8", 26], ["Fondo 1", 15], ["(sin inmueble)", 3]]), r.porInmueble);
assert("y los totales de siempre", r.total === 44 && r.sinFecha === 1 && r.pendiente === 5, r);

console.log("== 2. Columnas por mes y por año ==");
const cm = S.dashColumnasRendimientos(r, "mes");
assert("por mes: nov, dic (a 0), ene y feb", json(cm.map(c => [c.periodo, c.total, c.filas])) ===
  json([["2025-11", 10, 1], ["2025-12", 0, 0], ["2026-01", 22, 2], ["2026-02", 8, 2]]), cm);
const ca = S.dashColumnasRendimientos(r, "año");
assert("por año: 2025 y 2026, sin «sin fecha»", json(ca.map(c => [c.periodo, c.total])) === json([["2025", 10], ["2026", 30]]), ca);
assert("sin repartos con fecha: ninguna columna", S.dashColumnasRendimientos(S.dashRendimientosResumen([fila("A", null, 1, 1, 0, 0, 2)]), "mes").length === 0);
const largo = S.dashColumnasRendimientos(S.dashRendimientosResumen([fila("A", "2024-03-01", 1, 1, 0, 0, 2), fila("A", "2026-08-31", 1, 1, 0, 0, 3)]), "mes");
assert("de mar-2024 a ago-2026: 30 columnas, sin saltos de año", largo.length === 30 && largo[9].periodo === "2024-12" && largo[10].periodo === "2025-01", largo.length);

console.log("== 3. Eje y gráfico ==");
for (const [m, top, tramos] of [[42, 50, 5], [9, 10, 5], [0, 4, 4], [1.2, 1.25, 5], [798, 1000, 5]]) {
  const e = S.dashEjeRedondo(m);
  assert("eje de " + m + ": hasta " + top + " en " + tramos + " tramos", e.top === top && e.tramos === tramos && e.top >= m, e);
}
const svg = S.dashSvgApiladas(cm);
assert("una columna por mes, con su zona para el bocadillo", (svg.match(/class="dash-col"/g) || []).length === 4 && (svg.match(/dash-col-zona/g) || []).length === 4);
assert("dic-2025 (0): una línea gris de 1 px, sin partes", /data-i="1"><rect class="dash-col-zona"[^>]*\/><rect class="dash-cero"[^>]*height="1"\/><\/g>/.test(svg));
assert("el eje nombra los meses (son pocos)", /nov 25<\/text>/.test(svg) && /feb 26<\/text>/.test(svg));
// Sin la etiqueta del navegador (<title>): repetiría el bocadillo o lo taparía.
assert("las partes, sin <title> (lo dice el bocadillo)", !svg.includes("<title>") && (svg.match(/class="dash-bar-[abc]"/g) || []).length > 0, svg.slice(0, 300));
const b = S.dashHtmlBocadillo(ene);
assert("bocadillo: mes, reclamado con «de ello, retención», reinvertido, repartido y 2 repartos",
  b.includes("<b>ene 2026</b>") && b.includes("10,00 USD") && b.includes("de ello, retención") && b.includes("1,90 USD") &&
  b.includes("Reinvertido") && /Repartido<\/span><b>22,00 USD/.test(b) && b.includes("2 repartos") && !b.includes("Pendiente"), b);
assert("un mes vacío: «0 repartos» y repartido 0", S.dashHtmlBocadillo(cm[1]).includes("0 repartos") && S.dashHtmlBocadillo(cm[1]).includes("0,00 USD"));
assert("un solo reparto: «1 reparto»", S.dashHtmlBocadillo(cm[0]).includes("1 reparto<"));

console.log("== 4. Tarjeta de rendimientos ==");
const tm = S.dashTarjetaRendimientos(r, "mes"), ta = S.dashTarjetaRendimientos(r, "año");
assert("«💰 Rendimientos», «Por mes» pulsado y su máximo por mes", tm.includes("💰 Rendimientos") &&
  /data-vista="mes" aria-pressed="true"/.test(tm) && tm.includes("máx. 22,00 USD/mes"), tm.slice(0, 200));
assert("por año: «Por año» pulsado y máximo por año", /data-vista="año" aria-pressed="true"/.test(ta) && ta.includes("máx. 30,00 USD/año"));
assert("la nota de los repartos sin fecha (A24: en singular)", tm.includes("1 reparto sin fecha: fuera del gráfico (sí en el total)."));
assert("sin columnas (todo sin fecha): sin gráfico, sin error",
  !S.dashTarjetaRendimientos(S.dashRendimientosResumen([fila("A", null, 1, 1, 0, 0, 2)]), "mes").includes("dash-apiladas"));

console.log("== 5. Ranking de inmuebles ==");
const muchos = S.dashRendimientosResumen(["A", "B", "C", "D", "E", "F", "G"].map((n, i) => fila(n, "2026-01-10", 10 + i, 10 + i, 0, 0, i + 2))
  .concat([fila("Cero", "2026-01-10", 0, 0, 0, 0, 20)]));
S.dashVerTodos = false;
vm.runInContext("dashVerTodos = false", S);
let ti = S.dashTarjetaInmuebles(muchos);
assert("los 5 primeros (G a C) y «Ver todos (7)»; el que no repartió nada no cuenta",
  (ti.match(/class="dash-rank"/g) || []).length === 5 && ti.indexOf(">G<") < ti.indexOf(">F<") && ti.includes("Ver todos (7)") && !ti.includes(">Cero<"), ti.slice(0, 300));
vm.runInContext("dashVerTodos = true", S);
ti = S.dashTarjetaInmuebles(muchos);
assert("«Ver todos»: los 7 y «Ver menos»", (ti.match(/class="dash-rank"/g) || []).length === 7 && ti.includes("Ver menos"));
vm.runInContext("dashVerTodos = false", S);
assert("con 5 o menos, sin botón", !S.dashTarjetaInmuebles(r).includes("dash-ver-todos"));
assert("sin archivo: «No disponible» con su enlace", S.dashTarjetaInmuebles(null).includes("No disponible") && S.dashTarjetaInmuebles(null).includes("#inicio"));

console.log("== 6. Tu cartera por tokens ==");
const A = "0x" + "a1".repeat(20), B = "0x" + "a2".repeat(20), C = "0x" + "a3".repeat(20), D = "0x" + "a4".repeat(20), Z = "0x" + "a9".repeat(20);
let n = 0;
const tx = (c, from, to, u, dec) => ({ hash: "0x" + String(++n).padStart(64, "0"), contractAddress: c, from, to, timeStamp: String(1700000000 + n),
  value: typeof u === "string" ? u : (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString(), tokenDecimal: dec || "18" });
const alVault = tx(A, W, V, 4);
const cache = { transacciones: {
  wallet_tokens: [tx(A, X, W, 7), alVault, tx(B, X, W.toUpperCase().replace("0X", "0x"), 5), tx(B, W, X, 5), tx(C, W, X, 3), tx(D, X, W, 1),
    tx(A, X, W, "abc"), tx(Z, X, W, 99)],
  vault_tokens: [alVault, tx(A, X, V, 2.5)] },
  catalogo_propiedades: {
    [A]: { estado: "CONFIRMADA", nombre_reental: "Cáceres 8" }, [B]: { estado: "CONFIRMADA", nombre_reental: "Vendido" },
    [C]: { estado: "CONFIRMADA", nombre_etherscan: "Negativo" }, [D]: { estado: "CONFIRMADA", simbolo: "RFON" },
    [Z]: { estado: "CANDIDATA", nombre_etherscan: "Con dudas" } } };
vm.runInContext(`state.config = { wallet: "${W}", vault: "${V}" }`, S);
S.__c = cache;
const ct = vm.runInContext("dashCarteraTokens(__c)", S);
assert("Cáceres 8: 7 + 2,5 del vault (los 4 a tu vault no cambian nada); RFON por su símbolo",
  json(ct.items) === json([{ nombre: "Cáceres 8", n: 9.5, contrato: A }, { nombre: "RFON", n: 1, contrato: D }]), ct.items);
assert("el vendido no sale, el negativo y lo ilegible se cuentan aparte, el «con dudas» no entra",
  ct.total === 10.5 && ct.negativos === 1 && ct.ignorados === 1 && ct.conDudas === 1, ct);
vm.runInContext(`state.config = { wallet: "${W}", vault: "" }`, S);
const sinVault = vm.runInContext("dashCarteraTokens(__c)", S);
assert("sin vault: lo que mandaste al vault ya no es tuyo", sinVault.items[0].n === 3, sinVault.items);
vm.runInContext(`state.config = { wallet: "${W}", vault: "${V}" }`, S);
assert("sin cache o sin transacciones: null", S.dashCarteraTokens(null) === null && S.dashCarteraTokens({}) === null);
const tc = S.dashTarjetaCartera(ct);
assert("tarjeta: anillo con 10,50 tokens (A13: sin redondear) y la leyenda con los tokens",
  tc.includes(">10,50</text>") && tc.includes(">tokens</text>") && tc.includes("9,50") && tc.includes("⚠ Sin dibujar: 1 inmueble con saldo negativo · 1 movimiento ilegible."), tc.slice(0, 200));
assert("sin tokens: «No disponible» con el enlace al catálogo", S.dashTarjetaCartera({ total: 0, items: [], negativos: 0, ignorados: 0 }).includes("#revision"));
assert("sin cache: «No disponible» con el enlace a Puesta en marcha", S.dashTarjetaCartera(null).includes("#inicio"));

console.log("== 7. Nombre de la pestaña ==");
const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
assert("menú y título: «📊 Dashboard»", /title="Dashboard">📊 <span class="label">Dashboard<\/span>/.test(html) && /<h2>📊 Dashboard<\/h2>/.test(html));

console.log("== 8. Auditoría de UI-4 ==");
{
  // «Movimientos», como 📒 Transacciones: sin el spam.
  const regs = [{ clave: "a", categoria: "COMPRA" }, { clave: "b", categoria: "RENDIMIENTO" }, { clave: "c", categoria: "SPAM" },
    { clave: "d", categoria: "SPAM" }, { clave: "e", categoria: "MOVIMIENTO", revisar: true }];
  S.__regsA1 = regs;
  vm.runInContext("state.cache = { pagos_diferidos: { ventas: [] } }", S);
  const cat = vm.runInContext("dashCategoriasResumen(__regsA1)", S);
  assert("A1: «Movimientos» sin el spam (3, no 5), como Transacciones", cat.total === 3 && cat.revisar === 1, cat);
}
{
  // «A revisar», el mismo número que el menú de 🔍 Revisión.
  S.__regsA17 = [{ clave: "x", categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false }];
  vm.runInContext("__ccOrig = ccColaRevision; ccColaRevision = (regs) => regs.slice(); state.cache = { pagos_diferidos: { ventas: [] } }", S);
  const c = vm.runInContext("dashCategoriasResumen(__regsA17)", S);
  vm.runInContext("ccColaRevision = __ccOrig", S);
  assert("A17: «A revisar» es la cola de Revisión (1), no solo lo marcado (0)", c.revisar === 1, c);
}
{
  // La fecha y el inmueble que dice tu ajuste (los del registro).
  S.__fA3 = [fila("Casa A", "2025-12-31", 10, 10, 0, 0, 2), fila("Casa C", null, 5, 5, 0, 0, 3)];
  const claves = vm.runInContext("clavesRendimientosCsv(__fA3)", S);
  S.__rA3 = [{ clave: claves[2], categoria: "RENDIMIENTO", fecha: "2026-01-02 10:00:00", inmueble: "Casa B", integro_usdt: 10 },
             { clave: claves[3], categoria: "RENDIMIENTO", fecha: "2026-03-01 10:00:00", inmueble: "Casa C", integro_usdt: 5 }];
  const rA3 = vm.runInContext("dashRendimientosResumen(__fA3, __rA3)", S);
  assert("A3: el ajuste de fecha e inmueble manda (2026, Casa B; la fila sin fecha ya tiene la suya)",
    json(rA3.porPeriodo.map(p => p.periodo)) === json(["2026"]) && rA3.sinFecha === 0 &&
    json(rA3.porMes.map(m => m.periodo)) === json(["2026-01", "2026-03"]) && rA3.porInmueble[0].periodo === "Casa B", rA3);
}
{
  // Un inmueble escrito de varias formas, una sola fila.
  const rA6 = S.dashRendimientosResumen([fila("Cáceres 8", "2026-01-10", 10, 10, 0, 0, 2), fila("Caceres 8", "2026-01-10", 10, 10, 0, 0, 3),
    fila("CÁCERES  8", "2026-01-10", 10, 10, 0, 0, 4), fila("Cáceres 8".normalize("NFD"), "2026-01-10", 10, 10, 0, 0, 5), fila("Fondo 1", "2026-01-10", 5, 5, 0, 0, 6)]);
  assert("A6: «Cáceres 8» de cuatro formas es una fila de 40, con el primer nombre",
    json(rA6.porInmueble.map(e => [e.periodo, e.total, e.filas])) === json([["Cáceres 8", 40, 4], ["Fondo 1", 5, 1]]), rA6.porInmueble);
}
{
  // Una fila con todo a 0 no cuenta como reparto.
  const rA7 = S.dashRendimientosResumen([fila("A", "2026-01-10", 10, 10, 0, 0, 2), fila("B", "2026-01-12", 0, 0, 0, 0, 3)]);
  assert("A7: «1 reparto», no 2 (la fila a 0 no cuenta)", rA7.filas === 1 && rA7.porMes[0].filas === 1 &&
    S.dashHtmlBocadillo(rA7.porMes[0]).includes("1 reparto<"), [rA7.filas, rA7.porMes]);
}
{
  // Una fila que suma más que su íntegro: la barra cabe y se avisa.
  const rA4 = S.dashRendimientosResumen([fila("A", "2026-01-10", 10, 10, 8, 0, 2)]);
  const svgA4 = S.dashSvgApiladas(S.dashColumnasRendimientos(rA4, "mes"));
  const ys = [...svgA4.matchAll(/<rect class="dash-bar-[ab]"[^>]* y="(-?[\d.]+)"/g)].map(m => +m[1]);
  assert("A4: la pila de 18 cabe en el gráfico (ninguna parte por encima de su borde)", ys.length === 2 && ys.every(y => y >= 14), ys);
  assert("A4: y la tarjeta lo avisa", rA4.excedidas === 1 && S.dashTarjetaRendimientos(rA4, "mes").includes("⚠ 1 reparto suma más que su íntegro."));
}
{
  // Con el archivo cargado nunca «Sin archivo»; si tus decisiones lo dejan todo fuera, se dice.
  const fA5 = [fila("A", "2026-01-10", 10, 10, 0, 0, 2), fila("B", "2026-01-12", 5, 5, 0, 0, 3)];
  S.__fA5 = fA5;
  const cl = vm.runInContext("clavesRendimientosCsv(__fA5)", S);
  S.__rA5 = [{ clave: cl[2], categoria: "MOVIMIENTO" }, { clave: cl[3], categoria: "MOVIMIENTO" }];
  const rA5 = vm.runInContext("dashRendimientosResumen(__fA5, __rA5)", S);
  const tR = S.dashTarjetaRendimientos(rA5, "mes"), tI = S.dashTarjetaInmuebles(rA5);
  assert("A5: todo fuera por tus decisiones: lo dicen las dos tarjetas, sin «Sin archivo»",
    tR.includes("Los 2 repartos quedan fuera por tus decisiones.") && tI.includes("Los 2 repartos quedan fuera por tus decisiones.") &&
    !tI.includes("Sin archivo"), tI);
  const cero = S.dashRendimientosResumen([fila("A", "2026-01-10", 0, 0, 0, 0, 2)]);
  assert("A5: archivo sin nada repartido: Inmuebles dice lo mismo que Rendimientos",
    S.dashTarjetaInmuebles(cero).includes("El archivo no trae nada repartido.") && !S.dashTarjetaInmuebles(cero).includes("Sin archivo"));
}
{
  // Un rendimiento del libro sin fila en el archivo: la tarjeta lo dice.
  S.__fA8 = [fila("A", "2026-01-10", 10, 10, 0, 0, 2)];
  const cl = vm.runInContext("clavesRendimientosCsv(__fA8)", S);
  S.__rA8 = [{ clave: cl[2], categoria: "RENDIMIENTO", integro_usdt: 10 },
             { clave: "0xabc::0xusdt", categoria: "RENDIMIENTO", integro_usdt: 7 }, { clave: "0xdef::x", categoria: "COMPRA", importe_usdt: 99 }];
  const rA8 = vm.runInContext("dashRendimientosResumen(__fA8, __rA8)", S);
  assert("A8: 1 rendimiento fuera del archivo (7 USD), contado aparte y dicho en la tarjeta",
    rA8.total === 10 && json(rA8.fueraArchivo) === json({ n: 1, total: 7 }) &&
    S.dashTarjetaRendimientos(rA8, "mes").includes("⚠ 1 rendimiento que no está en el archivo de Reental (7,00 USD) no sale aquí."), rA8.fueraArchivo);
  assert("A8: sin clasificación, nada fuera", json(S.dashRendimientosResumen(S.__fA8).fueraArchivo) === json({ n: 0, total: 0 }));
}
{
  // Sin clasificar todavía, se avisa de que faltan tus decisiones.
  assert("A2: sin cache abierta, o con ajustes y sin clasificar: faltan; con clasificación o sin ajustes: no",
    S.dashFaltanDecisiones(null, null) === true && S.dashFaltanDecisiones({ ajustes_usuario: { k: {} } }, null) === true &&
    S.dashFaltanDecisiones({ ajustes_usuario: {} }, null) === false && S.dashFaltanDecisiones({ ajustes_usuario: { k: {} } }, [{}]) === false &&
    S.dashFaltanDecisiones({ ajustes_usuario: "roto" }, null) === false);
  assert("A2: la tarjeta lo dice", S.dashTarjetaRendimientos(r, "mes", true).includes("⚠ Aún sin tus decisiones de Revisión: completa 🚀 Puesta en marcha.") &&
    !S.dashTarjetaRendimientos(r, "mes", false).includes("Aún sin tus decisiones"));
}
{
  // Por año, los años sin repartos también, a 0.
  const rA9 = S.dashRendimientosResumen([fila("A", "2021-03-10", 5, 5, 0, 0, 2), fila("A", "2025-03-10", 7, 7, 0, 0, 3)]);
  assert("A9: por año, de 2021 a 2025 con 2022-2024 a 0",
    json(S.dashColumnasRendimientos(rA9, "año").map(c => [c.periodo, c.total])) === json([["2021", 5], ["2022", 0], ["2023", 0], ["2024", 0], ["2025", 7]]));
}
{
  // Fechas raras: el año de 4 cifras y «Por mes» que no cabe.
  assert("A11: los meses de un año de menos de 4 cifras casan", json(S.dashMesesEntre("0025-11", "0026-01")) === json(["0025-11", "0025-12", "0026-01"]));
  const rA11 = S.dashRendimientosResumen([fila("A", "0025-08-10", 5, 5, 0, 0, 2), fila("A", "2026-01-10", 7, 7, 0, 0, 3)]);
  const tA11 = S.dashTarjetaRendimientos(rA11, "mes");
  const nCols = (tA11.match(/class="dash-col"/g) || []).length;
  assert("A11: con 24.006 meses va por año, con su aviso, y no dibuja miles de barras",
    nCols === 2 && /data-vista="año" aria-pressed="true"/.test(tA11) && tA11.includes("⚠ 24.006 meses entre el primer y el último reparto: van por año"), [nCols, tA11.length]);
}
{
  // Un nombre de inmueble que no es texto (cache escrita a mano) y un empate.
  const A0 = "0x" + "b1".repeat(20), B0 = "0x" + "b2".repeat(20);
  S.__cA10 = { transacciones: { wallet_tokens: [tx(A0, X, W, 1), tx(B0, X, W, 1)], vault_tokens: [] },
    catalogo_propiedades: { [A0]: { estado: "CONFIRMADA", nombre_reental: 101 }, [B0]: { estado: "CONFIRMADA", nombre_reental: "Casa" } } };
  let error = null, cA10 = null;
  try { cA10 = vm.runInContext("dashCarteraTokens(__cA10)", S); } catch (e) { error = e.message; }
  assert("A10: el nombre 101 sale como «101», sin romper el orden", error === null && json(cA10.items.map(i => i.nombre)) === json(["101", "Casa"]), error || cA10);
}
{
  // El eje con importes de céntimos o de menos.
  const eje = m => { const e = S.dashEjeRedondo(m); return Array.from({ length: e.tramos + 1 }, (_, k) => S.dashNum(e.top * k / e.tramos, e.dec)); };
  assert("A12: con un máximo de 0,004, el eje se lee (0,000 0,001…)", json(eje(0.004)) === json(["0,000", "0,001", "0,002", "0,003", "0,004", "0,005"]), eje(0.004));
  assert("A12: con 0,11, escalones de 0,025 sin redondeos desiguales", json(eje(0.11)) === json(["0,000", "0,025", "0,050", "0,075", "0,100", "0,125"]), eje(0.11));
}
{
  // El centro del anillo, como la leyenda.
  const centro = t => (S.dashSvgDonut([{ nombre: "A", n: t }], t, "tokens").match(/>([^<]+)<\/text><text[^>]*>tokens/) || [])[1];
  assert("A13: 42,77 tokens no es «43», 0,4 no es «0» y 12 sigue siendo «12»",
    centro(42.774614) === "42,77" && centro(0.4) === "0,40" && centro(12) === "12", [centro(42.774614), centro(0.4), centro(12)]);
}
{
  // Direcciones raras de una cache escrita a mano no son inmuebles.
  S.__cA14 = { transacciones: { wallet_tokens: [tx("constructor", X, W, 3), tx("__proto__", X, W, 2), tx("toString", X, W, 1)], vault_tokens: [] },
    catalogo_propiedades: {} };
  const cA14 = vm.runInContext("dashCarteraTokens(__cA14)", S);
  assert("A14: «constructor», «__proto__» y «toString» no salen en la cartera", cA14.items.length === 0, cA14.items);
}
{
  // Los «con dudas» y los negativos se avisan, también con la tarjeta vacía.
  const D1 = "0x" + "c7".repeat(20);
  S.__cA15 = { transacciones: { wallet_tokens: [tx(D1, X, W, 7)], vault_tokens: [] },
    catalogo_propiedades: { [D1]: { estado: "CANDIDATA", nombre_etherscan: "Dudoso" } } };
  const cA15 = vm.runInContext("dashCarteraTokens(__cA15)", S);
  const tA15 = S.dashTarjetaCartera(cA15);
  assert("A15: solo uno «con dudas»: «Sin inmuebles confirmados con tokens» y el aviso de decidirlo",
    cA15.conDudas === 1 && tA15.includes("Sin inmuebles confirmados con tokens.") && tA15.includes("1 inmueble con dudas sin contar: decídelo en 🔍 Revisión."), tA15);
  const tNeg = S.dashTarjetaCartera({ total: 0, items: [], negativos: 2, ignorados: 0, conDudas: 0 });
  assert("A15: todo negativo: lo dice (antes «Sin tokens…» a secas)", tNeg.includes("Sin dibujar: 2 inmuebles con saldo negativo."), tNeg);
}
{
  // Un «con dudas» que mandaste entero al spam no se avisa.
  const D2 = "0x" + "c8".repeat(20);
  S.__cA15b = { transacciones: { wallet_tokens: [tx(D2, X, W, 7)], vault_tokens: [] },
    catalogo_propiedades: { [D2]: { estado: "CANDIDATA", nombre_etherscan: "FDR" } }, spam_usuario: { tokens: { [D2]: { nota: "x" } } } };
  assert("A15: el token mandado al spam no cuenta como «con dudas»", vm.runInContext("dashCarteraTokens(__cA15b)", S).conDudas === 0);
}
{
  // Sin vault, la cartera no nombra el vault.
  const sinV = S.dashTarjetaCartera({ total: 0, items: [], negativos: 0, ignorados: 0, conDudas: 0 }, false);
  assert("A16: sin vault, «en tu wallet», sin «vault»", sinV.includes("Tokens de cada inmueble en tu wallet.") &&
    sinV.includes("Sin tokens de inmuebles en tu wallet.") && !sinV.includes("vault"), sinV);
}
{
  // Plurales.
  assert("A24: «1 inmueble», «2 inmuebles»", S.dashCuantos(1, "inmueble", "inmuebles") === "1 inmueble" && S.dashCuantos(2, "inmueble", "inmuebles") === "2 inmuebles");
}
{
  // El texto para el lector de pantalla dice lo mismo que el bocadillo.
  const t = S.dashTextoBocadillo(ene);
  assert("A23: «ene 2026: Reclamado 10,00 USD (retención 1,90), Reinvertido 12,00 USD; repartido 22,00 USD; 2 repartos.»",
    t === "ene 2026: Reclamado 10,00 USD (retención 1,90), Reinvertido 12,00 USD; repartido 22,00 USD; 2 repartos.", t);
  assert("A23: la zona que lee el lector está fuera del role=img", /<\/div><\/div><div class="solo-lector" aria-live="polite"><\/div>/.test(S.dashTarjetaRendimientos(r, "mes")));
}
{
  // Lo que tus decisiones sacan no está en barras ni ranking.
  S.__fH = [fila("Casa A", "2026-01-10", 10, 10, 0, 0, 2), fila("Casa B", "2026-02-10", 6, 6, 0, 0, 3)];
  const cl = vm.runInContext("clavesRendimientosCsv(__fH)", S);
  S.__rH = [{ clave: cl[2], categoria: "MOVIMIENTO" }, { clave: cl[3], categoria: "RENDIMIENTO", integro_usdt: 6 }];
  const rH = vm.runInContext("dashRendimientosResumen(__fH, __rH)", S);
  assert("hueco: la fila decidida como neutra no está ni en los meses, ni en los años, ni en el ranking",
    json(rH.porMes.map(m => m.periodo)) === json(["2026-02"]) && rH.porPeriodo.length === 1 && rH.porPeriodo[0].total === 6 &&
    json(rH.porInmueble.map(e => e.periodo)) === json(["Casa B"]), rH);
  // La retención que ajustaste manda (también en lo reclamado).
  S.__fH2 = [fila("Casa A", "2026-01-10", 10, 0, 8.1, 1.9, 2)];
  const cl2 = vm.runInContext("clavesRendimientosCsv(__fH2)", S);
  S.__rH2 = [{ clave: cl2[2], categoria: "RENDIMIENTO", integro_usdt: 10, retencion_usdt: 1.5 }];
  const rH2 = vm.runInContext("dashRendimientosResumen(__fH2, __rH2)", S);
  assert("hueco: la retención ajustada (1,5) es la del resumen, del mes y de lo reclamado (8,1 + 1,5)",
    rH2.retained === 1.5 && rH2.porMes[0].retained === 1.5 && rH2.reclamado === 9.6, rH2);
  // «Repartido» de un mes con pendiente: el íntegro entero.
  const cPend = S.dashColumnasRendimientos(S.dashRendimientosResumen([fila("A", "2026-08-10", 10, 4, 0, 0, 2)]), "mes")[0];
  const bPend = S.dashHtmlBocadillo(cPend);
  assert("hueco: el bocadillo de un mes con pendiente: Reinvertido 4, Pendiente 6, Repartido 10",
    /Reinvertido<\/span><b>4,00 USD/.test(bPend) && /Pendiente<\/span><b>6,00 USD/.test(bPend) && /Repartido<\/span><b>10,00 USD/.test(bPend), bPend);
  // El mes del reparto en hora de España (como el motor): el 31/12 a las 23:30Z es ya enero.
  const rUtc = S.dashRendimientosResumen([{ inmueble: "A", fecha_reparto: new Date("2025-12-31T23:30:00Z"), distributed: 5, reinvested: 5, claimed: 0, retained: 0, linea_csv: 2 }]);
  assert("hueco: un reparto del 31/12 a las 23:30 UTC cae en enero de 2026 (hora española)", rUtc.porMes[0].periodo === "2026-01" && rUtc.porPeriodo[0].periodo === "2026", rUtc.porMes);
}

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
