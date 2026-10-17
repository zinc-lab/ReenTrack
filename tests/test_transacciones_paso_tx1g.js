/* Test unitario de 📒 Transacciones más despejada.
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txLineasImporte / txAyudaImporte / txHtmlFila: la burbuja del
 *   importe de un rendimiento, solo con los datos (íntegro, retención,
 *   neto); las de las acciones, cortas.
 * - txHtmlTriaje sin «Spam» ni total; sin chips (txHtmlChips no
 *   existe); txEtiquetaCategoriaConteo para el selector.
 * - txPasaFiltros / txModoSpam: el spam solo en su modo, nunca al
 *   buscar ni con un grupo.
 * - txHtmlNotaCoste: corta, neutra y sin ⓘ.
 * - txTextoRecuento: «517 movimientos», «120 de 517 movimientos».
 * - txContextoSpam / txMotivoSpam / txResumenSpam / txHtmlResumenSpam:
 *   el motivo de cada spam, con las señales del motor.
 * - Nada cambia por dentro: las funciones no mutan los registros.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1g.js
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
function reg(clave, categoria, subcategoria, extra = {}) {
  return Object.assign({
    clave, fecha: "2026-08-31 10:00:00", hash: "0x" + "ef".repeat(32), contrato: "0x" + "a1".repeat(20), token: null, simbolo: null,
    cantidad: 1, categoria, subcategoria, inmueble: null, importe_usdt: null, coste_eur: null,
    origen: "", destino: "", fuente: "ONCHAIN", nota: "", revisar: false,
  }, extra);
}

console.log("== 1. D9 · burbujas cortas, solo datos ==");
const rend = reg("r", "RENDIMIENTO", "RCM_RECLAMADO", { integro_usdt: 8.413729, retencion_usdt: 1.598611, importe_usdt: 6.815118 });
const lineas = S.txLineasImporte(rend);
assert("rendimiento: tres líneas, las del usuario (nota T91)",
  JSON.stringify(lineas) === JSON.stringify(["Rendimiento íntegro: 8,413729 USD", "Retención: 1,598611 USD", "Neto: 6,815118 USD"]), lineas);
assert("sin «van por separado», «no se declaran» ni «Llegaron»",
  !/separado|no se declara|Llegaron/i.test(S.txAyudaImporte(rend)), S.txAyudaImporte(rend));
const sinRet = reg("r0", "RENDIMIENTO", "RCM_REINVERTIDO", { integro_usdt: 400, retencion_usdt: 0, importe_usdt: 400 });
assert("sin retención: «Retención: 0 USD» (nunca en blanco)", S.txLineasImporte(sinRet)[1] === "Retención: 0 USD", S.txLineasImporte(sinRet));
const venta = reg("v", "VENTA", "GPP_INMUEBLE", { importe_usdt: 3204.5 });
assert("lo que no es un rendimiento: el importe tal cual", S.txAyudaImporte(venta) === "3.204,5 USD");
const fila = S.txHtmlFila(rend, { estadoRevisar: "libre" });
const burbuja = (fila.match(/<td class="num tx-importe">[\s\S]*?<span class="tx-burbuja" aria-hidden="true">([\s\S]*?)<\/span>/) || [])[1];
assert("la burbuja de la fila: las tres líneas, sin título en negrita",
  burbuja === "Rendimiento íntegro: 8,413729 USD<br>Retención: 1,598611 USD<br>Neto: 6,815118 USD", burbuja);
assert("el aria-label dice lo mismo en una línea",
  fila.includes('aria-label="Rendimiento íntegro: 8,413729 USD · Retención: 1,598611 USD · Neto: 6,815118 USD"'));
const burbujas = [...fila.matchAll(/<button[^>]*><span aria-hidden="true">[^<]*<\/span><span class="tx-burbuja" aria-hidden="true">([\s\S]*?)<\/span><\/button>/g)].map(m => m[1]);
assert("las burbujas de las acciones: solo su nombre, sin explicación", burbujas.length >= 2 && burbujas.every(b => /^<b>[^<]+<\/b>$/.test(b)), burbujas);

console.log("== 2. D10 · sin botón «Spam», sin total y sin chips ==");
const tri = S.txHtmlTriaje({ total: 10, revisar: 1, fiscal: 5, neutro: 2, spam: 2 }, "");
assert("el triaje: A revisar, Con efecto fiscal y Neutros", ["revisar", "fiscal", "neutro"].every(g => tri.includes('data-grupo="' + g + '"')));
assert("sin el botón de spam ni el número total", !tri.includes("spam") && !tri.includes("tx-total") && !/registros/.test(tri), tri);
assert("ya no hay chips de categoría", typeof S.txHtmlChips === "undefined");
assert("la paleta no genera reglas de chips", !S.txCssColoresCategoria().includes("tx-chip"));
assert("el selector enseña el recuento: «COMISION (180)»",
  S.txEtiquetaCategoriaConteo("COMISION", 180) === S.categoriaAMostrar("COMISION") + " (180)" &&
  S.txEtiquetaCategoriaConteo("REWARD", 1200) === "RECOMPENSA (1.200)");

console.log("== 3. D11 · el spam, aparte ==");
const R = [reg("s1", "SPAM", "NEUTRO", { simbolo: "BASURA" }), reg("s2", "SPAM", "NEUTRO"),
  reg("a", "COMPRA", "COSTE_BASE", { simbolo: "BASURA" }), reg("c", "COMISION", "NEUTRO")];
const claves = l => l.map(r => r.clave).sort().join(",");
assert("fuera del modo spam no sale", claves(S.txFiltrar(R, { ocultarSpam: true })) === "a,c");
assert("tampoco al buscar (cambia lo de TX-1c)", claves(S.txFiltrar(R, { ocultarSpam: true, q: "basura" })) === "a");
assert("ni con el grupo spam", claves(S.txFiltrar(R, { ocultarSpam: true, grupo: "spam" })) === "");
assert("en el modo spam, SOLO el spam", claves(S.txFiltrar(R, { ocultarSpam: true, categoria: "SPAM" })) === "s1,s2");
assert("y en el modo spam se puede buscar dentro", claves(S.txFiltrar(R, { ocultarSpam: true, categoria: "SPAM", q: "basura" })) === "s1");
assert("txModoSpam: solo con la categoría SPAM", S.txModoSpam({ categoria: "SPAM" }) && !S.txModoSpam({}) && !S.txModoSpam(null));
assert("el selector sigue contando el spam (para «Ver spam (n)»)",
  S.txConteoCategorias(R, { ocultarSpam: true }).some(c => c.categoria === "SPAM" && c.n === 2));

console.log("== 4. D12 · nota de compras bancarias ==");
const banc = reg("b", "COMPRA", "COSTE_BASE", { via_compra: "BANCARIA", coste_eur: 200 });
assert("el texto del usuario, sin ⓘ ni negritas",
  S.txHtmlNotaCoste([banc], 100) === "💶 Compras externas de inmuebles: 100 € por token por defecto (se edita en 🔍 Revisión).",
  S.txHtmlNotaCoste([banc], 100));
assert("con el precio de la config y, si no vale, 100 €",
  S.txHtmlNotaCoste([banc], 120).includes(": 120 € por token") && S.txHtmlNotaCoste([banc], "x").includes(": 100 € por token"));
assert("sin compras bancarias, nada", S.txHtmlNotaCoste([venta], 100) === "");

console.log("== 5. D13 · recuento ==");
assert("sin filtros: «517 movimientos»", S.txTextoRecuento(517, 517, false, false) === "517 movimientos");
assert("con filtros: «120 de 517 movimientos»", S.txTextoRecuento(120, 517, true, false) === "120 de 517 movimientos");
assert("con filtros que lo dejan todo: el número solo", S.txTextoRecuento(517, 517, true, false) === "517 movimientos");
assert("singular y miles", S.txTextoRecuento(1, 1, false, false) === "1 movimiento" &&
  S.txTextoRecuento(5, 1517, true, false) === "5 de 1.517 movimientos");
assert("en el modo spam: «39 movimientos de spam» y «5 de 39 movimientos de spam»",
  S.txTextoRecuento(39, 39, false, true) === "39 movimientos de spam" && S.txTextoRecuento(5, 39, true, true) === "5 de 39 movimientos de spam");

console.log("== 6. D14 · resumen del spam por motivo ==");
const DESC = "0x" + "dd".repeat(20);
const CACHE = {
  catalogo_propiedades: { [DESC.toUpperCase().replace("0X", "0x")]: { estado: "DESCARTADA" }, ["0x" + "c1".repeat(20)]: { estado: "CONFIRMADA" } },
  ajustes_usuario: { "  AJ  ": { categoria: "SPAM", nota: "esto es spam" }, otro: { revisar: true } },
};
const ctx = S.txContextoSpam(CACHE);
const casos = [
  [reg("aj", "SPAM", "NEUTRO", { token: "Normal", simbolo: "NRM" }), "ajuste"],
  [reg("d", "SPAM", "NEUTRO", { contrato: DESC, token: "Visit x.com", simbolo: "X" }), "descartado"],
  [reg("sn", "SPAM", "NEUTRO", { token: "", simbolo: "Visit www.algo.io" }), "sin-nombre"],
  [reg("w1", "SPAM", "NEUTRO", { token: "# getFREE.us", simbolo: "Visit getFREE.us to claim" }), "web"],
  [reg("w2", "SPAM", "NEUTRO", { token: "PAWS", simbolo: "PAWS | t.me/s/canal" }), "web"],
  [reg("p", "SPAM", "NEUTRO", { token: "Claim your SHIB reward", simbolo: "OPEN ✅ t .me/s/x" }), "publicidad"],
  [reg("h", "SPAM", "NEUTRO", { token: "ՍƧⅮ⊤", simbolo: "υꓢⅮΤ0" }), "simbolos"],
  [reg("z", "SPAM", "NEUTRO", { token: "Tether", simbolo: "USDT", cantidad: 0 }), "valor-cero"],
  [reg("n", "SPAM", "NEUTRO", { token: "Raro", simbolo: "RAR", cantidad: null }), "sin-valor"],
];
for (const [r, esperado] of casos) {
  assert(r.clave + " -> " + esperado, S.txMotivoSpam(r, ctx) === esperado, S.txMotivoSpam(r, ctx));
}
/* Auditoría del 16/10 A4: buscar lo que dice el motivo encuentra ese spam. */
assert("A4: buscar «marcado» o «catalogo» encuentra el spam por su motivo",
  S.txPasaFiltros(casos[0][0], { q: "marcado", ctxSpam: ctx }) && S.txPasaFiltros(casos[1][0], { q: "catalogo", ctxSpam: ctx }) &&
  !S.txPasaFiltros(casos[3][0], { q: "marcado", ctxSpam: ctx }));
assert("el orden y las señales son las del motor: lo que el motor llama sospechoso tiene un motivo de nombre",
  casos.slice(2, 7).every(([r]) => S.nombreTokenSospechoso(r.token, r.simbolo)));
assert("sin contexto no falla", S.txMotivoSpam(casos[3][0]) === "web" && S.txMotivoSpam(null) === "otro");
const regs = casos.map(c => c[0]).concat([casos[3][0], casos[4][0], reg("x", "COMPRA", "COSTE_BASE")]);
const antes = JSON.stringify(regs);
const res = S.txResumenSpam(regs, ctx);
assert("cuenta por motivo, de más a menos, y solo el spam",
  res[0].id === "web" && res[0].n === 4 && res.reduce((a, m) => a + m.n, 0) === 11 && res.length === 8, res);
assert("cada motivo con su etiqueta", res[0].etiqueta === "Web en el nombre" &&
  res.find(m => m.id === "descartado").etiqueta === "Descartado en el catálogo");
const h = S.txHtmlResumenSpam(res);
/* Cada línea se puede pulsar (filtra ese
   motivo), pero sigue siendo una línea de texto: sin etiquetas. */
assert("el HTML: una línea de texto por motivo (número y texto), sin etiquetas",
  (h.match(/<li class="tx-motivo"/g) || []).length === 8 && h.includes('data-motivo="web" aria-pressed="false">4 Web en el nombre</button></li>') &&
  !h.includes("<b>"), h);
assert("retoque de APARTAR-1: el motivo pulsado sale marcado",
  S.txHtmlResumenSpam(res, "ajuste").includes('class="tx-motivo-btn activo" data-motivo="ajuste" aria-pressed="true"'));
assert("nada cambia por dentro: los registros no se tocan", JSON.stringify(regs) === antes);
assert("la operación de un spam lleva su motivo en la ayuda",
  S.txHtmlFila(casos[3][0], { motivoSpam: "Web en el nombre" }).includes('<td class="tx-op" title="Web en el nombre">'));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
