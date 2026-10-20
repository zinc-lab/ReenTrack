/* Test unitario de 📒 Transacciones menos densa.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txCifra: 2 decimales; «<0,01» para lo que no es 0 pero no llega;
 *   las cantidades sin ceros de relleno.
 * - txImporteCorto / txRetencionCorta: el importe con 2 decimales y su
 *   unidad; «(ret. 1,60)» solo si Reental retuvo algo.
 * - La cabecera «Importe (retención)» y el importe de un rendimiento
 *   llevan su burbuja de información.
 * - txHtmlFila: 8 celdas; la cifra exacta en la ayuda; la nota del motor
 *   en la ayuda de la operación; las acciones, iconos con su burbuja.
 *
 * DATOS 100% SINTETICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1e.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const H = n => "0x" + String(n).padStart(4, "0") + "ef".repeat(30);
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: H(clave.length), contrato: "0x" + "a1".repeat(20), token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: "0x" + "11".repeat(20), destino: "0x" + "77".repeat(20), fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}
const celdas = html => [...html.matchAll(/<td class="([^"]*)"(?: title="([^"]*)")?>([\s\S]*?)<\/td>/g)]
  .map(m => ({ clase: m[1], title: m[2] || "", texto: m[3] }));

// =========================================================================
console.log("== 1. Cifras con 2 decimales ==");
// =========================================================================
const casos = [
  [[8.413729], "8,41"], [[3204.5], "3.204,50"], [[0.119756, true], "0,12"], [[200, true], "200"],
  [[3.5, true], "3,5"], [[0.000011, true], "<0,01"], [[0.0099], "<0,01"], [[0.01], "0,01"],
  [[0], "0,00"], [[0, true], "0"], [[-0.004], "-<0,01"], [[null], ""], [[undefined], ""], [["x"], ""],
];
for (const [args, esperado] of casos) {
  const r = S.txCifra(...args);
  assert("txCifra(" + args.map(String).join(", ") + ") -> «" + esperado + "»", r === esperado, r);
}

assert("cifra exacta de la ayuda: 6 decimales como siempre",
  S.txCifraExacta(0.119756) === "0,119756" && S.txCifraExacta(3204.5) === "3.204,5" && S.txCifraExacta(0) === "0");
assert("un resto de menos de una millonésima no dice 0 en la ayuda (la tabla dice «<0,01»)",
  S.txCifraExacta(1e-12) === "0,000000000001" && S.txCifraExacta(3e-7) === "0,0000003" && S.txCifra(1e-12, true) === "<0,01",
  [S.txCifraExacta(1e-12), S.txCifraExacta(3e-7)]);

// =========================================================================
console.log("== 2. Importe y retención ==");
// =========================================================================
const recl = reg("rc", "RENDIMIENTO", "RCM_RECLAMADO", { inmueble: "Prueba Mar 1", cantidad: null,
  importe_usdt: 6.815118, integro_usdt: 8.413729, retencion_usdt: 1.598611 });
const reinv = reg("ri", "RENDIMIENTO", "RCM_REINVERTIDO", { inmueble: "Prueba Mar 1", cantidad: null,
  importe_usdt: 0.38417, integro_usdt: 0.38417, retencion_usdt: 0 });
const banc = reg("bc", "COMPRA", "COSTE_BASE", { coste_eur: 30000, cantidad: 300 });
assert("importe de un rendimiento: su íntegro con 2 decimales", S.txImporteCorto(recl) === "8,41 USD", S.txImporteCorto(recl));
assert("importe en €: «30.000,00 €»", S.txImporteCorto(banc) === "30.000,00 €", S.txImporteCorto(banc));
assert("con retención: «(ret. 1,60)», entre paréntesis como en la cabecera", S.txRetencionCorta(recl) === "(ret. 1,60)", S.txRetencionCorta(recl));
assert("sin retención: nada (el 0 va en la ayuda)", S.txRetencionCorta(reinv) === "" && S.txAyudaImporte(reinv).includes("Retención: 0 USD"));
assert("lo que no es un rendimiento: nada", S.txRetencionCorta(banc) === "");
assert("la ayuda sigue con las cifras exactas", S.txAyudaImporte(recl).includes("Rendimiento íntegro: 8,413729 USD") &&
  S.txAyudaImporte(recl).includes("Retención: 1,598611 USD"), S.txAyudaImporte(recl));

// =========================================================================
console.log("== 3. La fila ==");
// =========================================================================
const gas = reg("gas", "COMISION", "NEUTRO", { simbolo: "POL", cantidad: 0.000011, nota: "gas" });
const fGas = S.txHtmlFila(gas, { estadoRevisar: "libre" });
const cG = celdas(fGas);
assert("9 celdas = TX_N_COLUMNAS (TX-1f)", cG.length === 9 && vm.runInContext("TX_N_COLUMNAS", S) === 9, cG.length);
assert("cantidad «<0,01» y la exacta en la ayuda", cG[4].texto === "&lt;0,01" && cG[4].title === "0,000011", cG[4]);
assert("la nota del motor, en la ayuda de la operación (sin columna propia)",
  cG[3].title === "Nota del motor: gas" && !/tx-nota/.test(fGas), cG[3]);
const cR = celdas(S.txHtmlFila(recl, { estadoRevisar: "libre" }));
/* Importe visible de la celda (sin la burbuja ni su envoltorio .tx-ayuda). */
const visible = t => t.replace(/<span class="tx-burbuja"[\s\S]*?<\/span>/g, "").replace(/^<span class="tx-ayuda"[^>]*>/, "").replace(/<\/span>$/, "");
assert("importe del reclamado: «8,41 USD» y debajo «(ret. 1,60)»",
  visible(cR[5].texto) === '8,41 USD<span class="tx-ret">(ret. 1,60)</span>', cR[5].texto);
/* La burbuja dice solo los datos, en tres líneas. */
assert("el importe de un rendimiento lleva su burbuja (íntegro, retención y neto, exactos), sin title",
  cR[5].title === "" && cR[5].texto.includes('<span class="tx-burbuja" aria-hidden="true">Rendimiento íntegro: 8,413729 USD<br>') &&
  cR[5].texto.includes("Neto: 6,815118 USD") && /^<span class="tx-ayuda" tabindex="0" aria-label="Rendimiento íntegro: /.test(cR[5].texto));
assert("sin cantidad: celda vacía", cR[4].texto === "" && cR[4].title === "");

const bMandar = fGas.match(/<button[^>]*data-accion="mandar-revisar"[\s\S]*?<\/button>/)[0]; // el ✏️ va delante
/* La burbuja de un icono es solo su nombre (textos concisos). */
assert("«Mandar a revisar»: icono 🔍 con su burbuja (solo el nombre) y el mismo texto en aria-label",
  /data-accion="mandar-revisar"/.test(bMandar) && bMandar.includes('<span aria-hidden="true">🔍</span>') &&
  bMandar.includes('<span class="tx-burbuja" aria-hidden="true"><b>Mandar a revisar</b></span>') &&
  /aria-label="Mandar a revisar"/.test(bMandar) && !/ title=/.test(bMandar), bMandar);
const fAjeno = S.txHtmlFila(gas, { estadoRevisar: "ajeno" });
assert("ajeno: icono inactivo (se puede enfocar para leer la burbuja) y sin acción",
  /aria-disabled="true"/.test(fAjeno) && !/data-accion="(?!nota")/.test(fAjeno) && !/ disabled/.test(fAjeno));
const sal = reg("sal", "VENTA", "GPP_INMUEBLE", { inmueble: "Prueba Mar 1", importe_usdt: 455.8375, cantidad: 2.500004 });
const fSal = S.txHtmlFila(sal, { estadoRevisar: "libre", vinculo: { rol: "salida", ventaIds: ["pd_1"], detalle: "cobrada el 2026-05-20" } });
const iconos = [...fSal.matchAll(/<span aria-hidden="true">([^<]+)<\/span><span class="tx-burbuja" aria-hidden="true"><b>([^<]+)<\/b>/g)].map(m => m[1] + " " + m[2]);
assert("venta vinculada: 🔍, 🔗 «Venta vinculada» y ➕ «Otro cobro…», cada uno con su burbuja",
  JSON.stringify(iconos) === JSON.stringify(["✏️ Añadir una nota", "🔍 Mandar a revisar", "🔗 Venta vinculada", "➕ Otro cobro…"]), iconos);
assert("el distintivo explica la venta en su burbuja", fSal.includes("<b>Venta vinculada</b> cobrada el 2026-05-20"));
const fPend = S.txHtmlFila(sal, { estadoRevisar: "motor", pendiente: "salida" });
assert("salida por vincular: 🔗 «Vincular cobro…»",
  /data-accion="abrir-buscador"[^>]*><span aria-hidden="true">🔗<\/span><span class="tx-burbuja" aria-hidden="true"><b>Vincular cobro…<\/b>/.test(fPend));
const cS = celdas(fSal);
assert("cantidad 2,500004 -> «2,5» e importe «455,84 USD», exactos en la ayuda",
  cS[4].texto === "2,5" && cS[4].title === "2,500004" && cS[5].texto === "455,84 USD" && cS[5].title === "455,8375 USD", [cS[4], cS[5]]);

// =========================================================================
console.log("== 4. index.html ==");
// =========================================================================
const html = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
const tabla = (html.match(/<table id="txTabla"[\s\S]*?<\/table>/) || [""])[0];
const nombreTh = h => h.replace(/<span class="tx-burbuja"[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const ths = [...tabla.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m => nombreTh(m[1]));
assert("9 columnas (TX-1f, D1): fecha, categoría, token, operación, cantidad, importe, contraparte, tx y acciones",
  JSON.stringify(ths) === JSON.stringify(["Fecha", "Categoría", "Inmueble / Token", "Operación", "Cantidad", "Importe (retención)", "Contraparte", "Tx", "Acciones"]) &&
  (tabla.match(/<col[ >]/g) || []).length === 0 && tabla.includes('colspan="9"'), ths);
assert("la cabecera del importe lleva su burbuja corta: la unidad y la retención entre paréntesis",
  /<span class="tx-ayuda" tabindex="0" aria-label="Importe \(retención\): [^"]+">Importe<span class="tx-ret">\(retención\)<\/span><span class="tx-burbuja" aria-hidden="true">/.test(tabla) &&
  /<b>Importe \(retención\)<\/b> Importes en USD \(USDT y USDC, 1 a 1\) o en € en una compra externa o una venta cobrada en €. Entre paréntesis \(\) si se aplicó retención\.<\/span>/.test(tabla) && !/declara/.test(tabla) && !/title="/.test(tabla.match(/<th class="num tx-th-partida[^"]*"[^>]*>/)[0]));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
