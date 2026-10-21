/* Test: la app enseña el íntegro y la retención de cada rendimiento por separado, sin restarlos.
 *
 * Bajo prueba:
 * - 📒 Transacciones (Reental-SPA/js/18-transacciones.js): txImporte de un
 *   rendimiento = su íntegro (integro_usdt), nunca el neto que llegó;
 *   txRetencion = la retención del archivo de Reental («0 USD» si no la
 *   hay; vacío en lo que no es un rendimiento); txAyudaImporte; la fila
 *   tiene una celda más y la tabla de index.html, su columna «Retención».
 * - 📊 Panel (Reental-SPA/js/16-dashboard.js): dashRendimientosResumen (el
 *   total es el íntegro repartido; reclamado con su retención dentro;
 *   pendiente; la retención, aparte) y dashTarjetaRendimientos /
 *   dashSvgBarras (ningún total resta la retención).
 *
 * Casos: un reinvertido, un reclamado con retención (19 %), un reclamado
 * sin ella y un pendiente.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_integro_retencion_paso_div19b.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const sandbox = { console, state: {}, log: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), sandbox, { filename: f });
}
vm.runInContext("log = function () {}; toast = function () {};", sandbox);
const S = sandbox;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(o) {
  return Object.assign({
    clave: "k", fecha: "2026-08-01 10:00:00", hash: H(1), contrato: "0x" + "cc".repeat(20),
    token: null, simbolo: null, cantidad: null, categoria: "RENDIMIENTO", subcategoria: "RCM_REINVERTIDO",
    inmueble: "Prueba Uno", importe_usdt: null, coste_eur: null, via_compra: null, origen: "", destino: "",
    fuente: "CSV_REENTAL", nota: "", revisar: false,
  }, o);
}
/* Celdas (texto y title) de una fila del libro. */
function celdas(html) {
  return [...html.matchAll(/<td class="([^"]*)"(?: title="([^"]*)")?>([\s\S]*?)<\/td>/g)]
    .map(m => ({ clase: m[1], title: m[2] || "", texto: m[3] }));
}
/* La retención no tiene columna: va bajo el importe
   («(ret. 19,00)»), solo si la hay, y la tabla tiene 8 columnas con cifras de
   2 decimales (la exacta, en la ayuda). */
const COL_IMPORTE = 5;

// =========================================================================
console.log("== 1. Libro diario: íntegro y retención de cada rendimiento ==");
// =========================================================================
const reinv = reg({ clave: "a", subcategoria: "RCM_REINVERTIDO", importe_usdt: 10, integro_usdt: 10, retencion_usdt: 0 });
const reclRet = reg({ clave: "b", subcategoria: "RCM_RECLAMADO", importe_usdt: 81, integro_usdt: 100, retencion_usdt: 19 });
const reclSin = reg({ clave: "c", subcategoria: "RCM_RECLAMADO", importe_usdt: 50, integro_usdt: 50, retencion_usdt: 0 });
const pend = reg({ clave: "d", subcategoria: "RCM_PENDIENTE", hash: "", importe_usdt: 0, integro_usdt: 7, retencion_usdt: 0 });
const huerfano = reg({ clave: "e", importe_usdt: 3.5, revisar: true, fuente: "ONCHAIN" });
const venta = reg({ clave: "f", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", importe_usdt: 3204.5, cantidad: 12 });
const compra = reg({ clave: "g", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 1000 });

assert("reinvertido: íntegro 10 USD y retención 0 USD (nunca en blanco)",
  S.txImporte(reinv) === "10 USD" && S.txRetencion(reinv) === "0 USD", [S.txImporte(reinv), S.txRetencion(reinv)]);
assert("reclamado con retención: el importe es el íntegro (100), no el neto que llegó (81)",
  S.txImporte(reclRet) === "100 USD", S.txImporte(reclRet));
assert("reclamado con retención: la retención del archivo (19 USD), aparte",
  S.txRetencion(reclRet) === "19 USD", S.txRetencion(reclRet));
assert("reclamado sin retención: íntegro 50 USD y retención 0 USD",
  S.txImporte(reclSin) === "50 USD" && S.txRetencion(reclSin) === "0 USD");
assert("pendiente: su íntegro (7 USD), aunque no haya llegado nada, y retención 0 USD",
  S.txImporte(pend) === "7 USD" && S.txRetencion(pend) === "0 USD", [S.txImporte(pend), S.txRetencion(pend)]);
assert("rendimiento sin fila en el archivo (sin íntegro): lo que llegó y retención 0 USD; no se inventa nada",
  S.txImporte(huerfano) === "3,5 USD" && S.txRetencion(huerfano) === "0 USD");
assert("lo que no es un rendimiento no lleva retención (vacío) y su importe no cambia",
  S.txRetencion(venta) === "" && S.txImporte(venta) === "3.204,5 USD" &&
  S.txRetencion(compra) === "" && S.txImporte(compra) === "1.000 €" && S.txRetencion(null) === "");
assert("una venta con un campo integro_usdt suelto sigue enseñando su importe",
  S.txImporte(Object.assign({}, venta, { integro_usdt: 999 })) === "3.204,5 USD");
assert("el registro no se toca: importe_usdt sigue siendo lo que llegó", reclRet.importe_usdt === 81 && reclRet.integro_usdt === 100);

const ayuda = S.txAyudaImporte(reclRet);
/* Solo los datos: íntegro, retención y neto, sin explicar. */
assert("ayuda del importe: íntegro, retención y neto por separado, solo los datos",
  ayuda === "Rendimiento íntegro: 100 USD · Retención: 19 USD · Neto: 81 USD", ayuda);
assert("ayuda sin retención: «Retención: 0 USD»", S.txAyudaImporte(reinv).includes("Retención: 0 USD"));
assert("ayuda de lo que no es un rendimiento: el importe tal cual", S.txAyudaImporte(venta) === "3.204,5 USD");

const fRet = celdas(S.txHtmlFila(reclRet, { estadoRevisar: "libre" }));
assert("la fila tiene 9 celdas = TX_N_COLUMNAS (TX-1f: + Contraparte)", fRet.length === 9 && vm.runInContext("TX_N_COLUMNAS", sandbox) === 9, fRet.length);
/* Importe visible de la celda (sin la burbuja ni su envoltorio .tx-ayuda). */
const visible = t => t.replace(/<span class="tx-burbuja"[\s\S]*?<\/span>/g, "").replace(/^<span class="tx-ayuda"[^>]*>/, "").replace(/<\/span>$/, "");
assert("fila del reclamado: importe «100,00 USD» y, debajo, «(ret. 19,00)» (TX-1e)",
  visible(fRet[COL_IMPORTE].texto) === '100,00 USD<span class="tx-ret">(ret. 19,00)</span>', fRet.map(c => c.texto));
assert("ninguna celda enseña el neto (81 USD) como importe", !fRet.some(c => c.texto === "81 USD"), fRet.map(c => c.texto));
/* La flecha del sentido va delante, fuera del texto de la operación. */
assert("la operación sigue siendo «Rendimiento reclamado»", fRet[3].texto.replace(/<[^>]+>/g, "") === "Rendimiento reclamado", fRet[3].texto);
const fVenta = celdas(S.txHtmlFila(venta, { estadoRevisar: "libre" }));
assert("fila de una venta: 9 celdas, sin línea de retención; 2 decimales y la cifra exacta en la ayuda", fVenta.length === 9 &&
  fVenta[COL_IMPORTE].texto === "3.204,50 USD" && fVenta[COL_IMPORTE].title === "3.204,5 USD");
const fReinv = celdas(S.txHtmlFila(reinv, { estadoRevisar: "libre" }));
assert("rendimiento sin retención: sin línea «ret.» (el 0 va en su burbuja)",
  !visible(fReinv[COL_IMPORTE].texto).includes("ret.") && fReinv[COL_IMPORTE].texto.includes("Retención: 0 USD"), fReinv[COL_IMPORTE]);

const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
const tabla = (html.match(/<table id="txTabla"[\s\S]*?<\/table>/) || [""])[0];
const nombreTh = h => h.replace(/<span class="tx-burbuja"[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ths = [...tabla.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => nombreTh(m[1]));
assert("index.html: 9 columnas, sin colgroup (TX-1f: anchos según el contenido; cabecera y fila vacía)",
  (tabla.match(/<col[ >]/g) || []).length === 0 && ths.length === 9 && tabla.includes('colspan="9"'), ths);
assert("index.html: «Importe (retención)», sin columna «Retención» ni «Nota del motor»",
  ths[COL_IMPORTE] === "Importe (retención)" && !ths.includes("Retención") && !ths.includes("Nota del motor"), ths);

// =========================================================================
console.log("== 2. Panel: el total es el íntegro y la retención va aparte ==");
// =========================================================================
const W = "0x" + "e1".repeat(20);
const CAB = "dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet";
const hh = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const fila = (div, fecha, reinvested, claimed, distributed, retained, reinvests, claims) =>
  [`"${div}"`, fecha, reinvested, claimed, distributed, retained, `"${reinvests}"`, `"${claims}"`, W].join(",");
const csv = S.cargarCsvRendimientos([CAB,
  fila("Prueba Uno#2025-12", "2025-12-10", 10, 0, 10, 0, "['" + hh(1) + "']", "[]"),
  fila("Prueba ES#2026-08", "2026-08-10", 0, 81, 100, 19, "[]", "['" + hh(2) + "']"),
  fila("Prueba US#2026-08", "2026-08-10", 0, 50, 50, 0, "[]", "['" + hh(3) + "']"),
  fila("Prueba Uno#2026-09", "2026-09-10", 0, 0, 7, 0, "[]", "[]"),
].join("\n"));
assert("el archivo sintético se lee (4 filas)", !csv.error && csv.filas.length === 4, csv.error);
const r = S.dashRendimientosResumen(csv.filas);
assert("total = íntegro repartido (167), no reclamado + reinvertido netos (141)", r.total === 167, r.total);
assert("reclamado = con su retención dentro (81 + 19 + 50 = 150)", r.reclamado === 150, r.reclamado);
assert("reinvertido 10 y pendiente 7", r.reinvested === 10 && r.pendiente === 7, r);
assert("retención aparte (19) y neto reclamado como dato (131)", r.retained === 19 && r.claimed === 131, r);
assert("las partes suman el íntegro; la retención no se resta de nada",
  r.reclamado + r.reinvested + r.pendiente === r.total);
assert("por ejercicio: 2025 (10 reinvertido) y 2026 (157 íntegro, 19 de retención)",
  r.porPeriodo.length === 2 && r.porPeriodo[0].periodo === "2025" && r.porPeriodo[0].total === 10 &&
  r.porPeriodo[0].retained === 0 && r.porPeriodo[1].periodo === "2026" && r.porPeriodo[1].total === 157 &&
  r.porPeriodo[1].reclamado === 150 && r.porPeriodo[1].pendiente === 7 && r.porPeriodo[1].retained === 19, r.porPeriodo);
const excede = S.dashRendimientosResumen([{ fecha_reparto: csv.filas[0].fecha_reparto, reinvested: 6, claimed: 6, retained: 0, distributed: 10 }]);
assert("fila que suma más que su íntegro: no se corrige sola (total 10, pendiente 0)",
  excede.total === 10 && excede.pendiente === 0, excede);
const soloReinv = S.dashRendimientosResumen([csv.filas[0]]);
assert("solo reinvertidos: los importes de siempre (total = reinvertido) y retención 0",
  soloReinv.total === 10 && soloReinv.reinvested === 10 && soloReinv.reclamado === 0 && soloReinv.retained === 0 && soloReinv.pendiente === 0);

const tarjeta = S.dashTarjetaRendimientos(r, "año");
assert("tarjeta: el importe grande es el íntegro (167,00 USD)", tarjeta.includes("167,00&nbsp;USD") && tarjeta.includes(">íntegro</span>"));
assert("tarjeta: «Retención de Reental» aparte, con 19,00 USD (sin explicaciones fiscales: simplificar-textos de UI-4)",
  /Retención de Reental<\/span><span class="vv">19,00 USD<\/span>/.test(tarjeta) && !tarjeta.includes("no se resta") &&
  !tarjeta.includes("Renta Web"));
assert("tarjeta: ningún total con la retención restada (148,00 = 167 − 19; 141,00 = neto)",
  !tarjeta.includes("148,00") && !tarjeta.includes("141,00"));
assert("tarjeta: leyenda Reclamado 150,00 · Reinvertido 10,00 · Pendiente 7,00",
  tarjeta.includes(">150,00 USD<") && tarjeta.includes(">10,00 USD<") && tarjeta.includes(">7,00 USD<") &&
  tarjeta.includes(">Pendiente<"));
assert("tarjeta: el neto reclamado solo como dato que no se declara", tarjeta.includes("131,00 USD netos."));
// Lo de cada barra, en su bocadillo (las barras no llevan <title>).
const bocadillo = Object.fromEntries(S.dashColumnasRendimientos(r, "año").map(c => [c.periodo, S.dashTextoBocadillo(c)]));
assert("barras por ejercicio: reclamado íntegro, reinvertido y pendiente",
  /Reclamado 150,00 USD/.test(bocadillo["2026"]) && /Pendiente 7,00 USD/.test(bocadillo["2026"]) &&
  /Reinvertido 10,00 USD/.test(bocadillo["2025"]), bocadillo);
const tarjetaSolo = S.dashTarjetaRendimientos(soloReinv);
assert("sin retención ni pendientes: retención 0,00 USD a la vista, sin «Pendiente» ni frase de neto",
  /Retención de Reental<\/span><span class="vv">0,00 USD<\/span>/.test(tarjetaSolo) &&
  !tarjetaSolo.includes("Pendiente") && !tarjetaSolo.includes("netos"));
assert("archivo sin nada repartido: «No disponible», sin inventar",
  S.dashTarjetaRendimientos(S.dashRendimientosResumen([{ reinvested: 0, claimed: 0, distributed: 0, retained: 0 }])).includes("No disponible"));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
