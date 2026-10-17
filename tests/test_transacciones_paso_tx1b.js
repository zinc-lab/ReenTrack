/* Test unitario: colores por categoría, tabla compacta y nota del coste de compra bancaria
 * en 📒 Transacciones (Reental-SPA/js/18-transacciones.js).
 *
 * Funciones bajo prueba (sección pura del módulo):
 * - TX_COLORES_CATEGORIA: la paleta clara es EXACTAMENTE la del Excel de
 *   la app (EXCEL_COLOR_CATEGORIA de js/26, leída del propio archivo) +
 *   SPAM (#EEEEEE); cada color tiene su versión
 *   oscura y el texto se lee sobre su fondo (contraste WCAG AA ≥ 4,5).
 * - txClaseCategoria: clase solo para categorías conocidas (nada de texto
 *   libre en una clase CSS).
 * - txCssColoresCategoria: variables en :root y body.dark y reglas de
 *   etiqueta, chip y franja de fila para las 10 categorías.
 * - txHtmlFila / txHtmlChips: la fila y el chip llevan la clase de su
 *   categoría (no la del grupo de triaje); fecha sin hora con la hora en
 *   el title; hash corto con el completo en el title.
 * - txHtmlTriaje: el resumen de triaje conserva sus colores de grupo.
 * - txHtmlNotaCoste / txEsCompraBancaria: la nota de 100 € por token solo
 *   aparece si hay compras por transferencia bancaria.
 *
 * DATOS 100% SINTÉTICOS: ninguna dirección, hash ni importe real.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_tx1b.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const BASE = path.join(RAIZ, "Reental-SPA", "js");
const sandbox = { console, state: {}, log: () => {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const S = sandbox;
const PALETA = vm.runInContext("TX_COLORES_CATEGORIA", sandbox);

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* Contraste WCAG 2.1 entre dos colores #rrggbb. */
function luminancia(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contraste(a, b) {
  const la = luminancia(a), lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
function reg(o) {
  return Object.assign({
    clave: "k", fecha: "2026-01-01 10:00:00", hash: H(1), contrato: "0x" + "cc".repeat(20),
    token: null, simbolo: null, cantidad: 1, categoria: "RENDIMIENTO", subcategoria: "RCM_REINVERTIDO",
    inmueble: null, importe_usdt: null, coste_eur: null, via_compra: null, origen: "", destino: "",
    fuente: "ONCHAIN", nota: "", revisar: false,
  }, o);
}

console.log("== 1. Paleta = la del Excel de la app ==");
const js26 = fs.readFileSync(path.join(BASE, "26-excel.js"), "utf8");
const bloque = (js26.match(/EXCEL_COLOR_CATEGORIA\s*=\s*\{([\s\S]*?)\}/) || [])[1] || "";
const excel = {};
for (const m of bloque.matchAll(/([A-Z]+):\s*"([0-9A-F]{6})"/g)) excel[m[1]] = "#" + m[2];
assert("se lee la paleta del Excel de la app (9 categorías)", Object.keys(excel).length === 9, excel);
for (const [cat, hex] of Object.entries(excel)) {
  assert("claro de " + cat + " = " + hex + " (Excel)", PALETA[cat] && PALETA[cat].claro[0].toUpperCase() === hex, PALETA[cat]);
}
assert("claro de SPAM = #EEEEEE (el del visor de antes)", PALETA.SPAM && PALETA.SPAM.claro[0] === "#EEEEEE");
const categorias = Object.keys(PALETA);
assert("10 categorías: las 9 del Excel + SPAM", categorias.length === 10 &&
  Object.keys(excel).every(c => categorias.includes(c)) && categorias.includes("SPAM"), categorias);
const hexOk = v => /^#[0-9A-Fa-f]{6}$/.test(v);
assert("cada categoría tiene fondo, borde y texto en claro y en oscuro",
  categorias.every(c => ["claro", "oscuro"].every(t => PALETA[c][t].length === 3 && PALETA[c][t].every(hexOk))));
const flojos = [];
for (const c of categorias) for (const t of ["claro", "oscuro"]) {
  const r = contraste(PALETA[c][t][0], PALETA[c][t][2]);
  if (r < 4.5) flojos.push(c + "/" + t + ": " + r.toFixed(2));
}
assert("texto legible sobre su fondo en claro y oscuro (contraste ≥ 4,5 en las 20)", flojos.length === 0, flojos);
const fondosOscuros = categorias.map(c => PALETA[c].oscuro[0]);
assert("los fondos oscuros son oscuros (luminancia < 0,05) y los claros, claros (> 0,4)",
  fondosOscuros.every(f => luminancia(f) < 0.05) && categorias.every(c => luminancia(PALETA[c].claro[0]) > 0.4));

console.log("== 2. Clases y CSS ==");
assert("categoría conocida → tx-c-CATEGORIA", S.txClaseCategoria("VENTA") === "tx-c-VENTA");
assert("categoría desconocida → tx-c-otra", S.txClaseCategoria("RARA") === "tx-c-otra");
assert("texto libre nunca llega a la clase", S.txClaseCategoria('X" onmouseover="a') === "tx-c-otra" &&
  S.txClaseCategoria("toString") === "tx-c-otra" && S.txClaseCategoria(undefined) === "tx-c-otra");
const css = S.txCssColoresCategoria();
assert("CSS: variables en :root y en body.dark", /^:root\{--txc-/.test(css) && /\nbody\.dark\{--txc-/.test(css));
assert("CSS: etiqueta para las 10, sin chips (TX-1g) ni franja de fila (TX-1h)",
  categorias.every(c => css.includes(".tx-cat.tx-c-" + c + "{")) && !css.includes("box-shadow"));
assert("CSS: el oscuro de RENDIMIENTO es el de la paleta",
  css.includes("body.dark{") && css.split("body.dark{")[1].includes("--txc-rendimiento-bg:" + PALETA.RENDIMIENTO.oscuro[0]));
assert("CSS: equilibrado de llaves", (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length);

console.log("== 3. Fila compacta y coloreada ==");
const f1 = S.txHtmlFila(reg({ clave: "a", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", fecha: "2026-06-19 18:05:00",
  hash: H(7), inmueble: "Prueba Alcazaba 1", cantidad: 12.5, nota: "venta por settlement" }), { estadoRevisar: "libre" });
assert("la fila lleva la clase de su categoría", /<tr class="tx-fila tx-c-VENTA"/.test(f1));
assert("la etiqueta lleva la clase de su categoría (ya no la del grupo)", /<span class="tx-cat tx-c-VENTA">VENTA<\/span>/.test(f1) && !/tx-cat tx-g-/.test(f1));
assert("fecha sin hora en la celda y con hora en el title", /<td class="tx-fecha" title="19\/06\/2026 18:05, hora española · 19\/06\/2026 16:05 UTC">19\/06\/2026<\/td>/.test(f1));
assert("hash corto (0x + 4 … 4) y el completo en el title",
  f1.includes(">" + H(7).slice(0, 6) + "…" + H(7).slice(-4) + " ↗</a>") && f1.includes('title="' + H(7) + " · ver en Polygonscan"));
/* Sin columnas de retención ni de nota; la nota va en la ayuda de la operación. */
/* Sin elipsis (anchos según el contenido; token y operación pasan a dos líneas). */
assert("token, operación, cantidad e importe con su title; la nota, en la ayuda de la operación",
  /class="tx-token" title=/.test(f1) && /class="tx-op" title=/.test(f1) && /class="num tx-cant" title=/.test(f1) &&
  /class="num tx-importe" title=/.test(f1) && !/tx-nota/.test(f1) &&
  f1.includes('title="Prueba Alcazaba 1"') && f1.includes('title="Nota del motor: venta por settlement"'));
/* La ayuda de la operación solo dice lo que no se ve: sin el código ni la parte fiscal. */
assert("la operación en llano; en el title, solo la nota del motor",
  f1.includes('<td class="tx-op" title="Nota del motor: venta por settlement">') && !/GPP_INMUEBLE|patrimonial/.test(f1) &&
  f1.includes('<span class="tx-op-texto">Venta de tokens</span>')); // nombres de las operaciones
assert("las 9 celdas de TX-1f y el botón de TX-1 como icono con su burbuja", (f1.match(/<td/g) || []).length === 9 &&
  f1.includes('<span aria-hidden="true">🔍</span><span class="tx-burbuja" aria-hidden="true"><b>Mandar a revisar</b>'));
const fRev = S.txHtmlFila(reg({ clave: "b", categoria: "COMPRA", revisar: true }), { estadoRevisar: "motor" });
assert("registro a revisar: color de su categoría + fondo de revisar + 🔍",
  /<tr class="tx-fila tx-c-COMPRA tx-revisar"/.test(fRev) && fRev.includes('class="tx-marca-rev"'));
const fRara = S.txHtmlFila(reg({ clave: "c", categoria: "NUEVA" }), {});
assert("categoría desconocida: chip neutro, sin inventar color", /tx-fila tx-c-otra"/.test(fRara) && /tx-cat tx-c-otra">NUEVA</.test(fRara));
const fSin = S.txHtmlFila(reg({ clave: "d", fecha: null, hash: "" }), {});
assert("sin fecha ni hash: honesto", fSin.includes(">sin fecha</td>") && fSin.includes("sin hash"));
assert("txFechaCorta / txHashCorto", S.txFechaCorta("2025-01-02 03:04:05") === "02/01/2025" &&
  S.txFechaCorta(null) === "sin fecha" && S.txHashCorto("0xabc") === "0xabc" && S.txHashCorto("") === "");

console.log("== 4. Chips y triaje ==");
/* No hay chips de categoría ni botón de spam en el triaje. */
const triaje = S.txHtmlTriaje({ total: 4, revisar: 1, fiscal: 1, neutro: 1, spam: 1 }, "");
assert("el triaje conserva sus colores de grupo", ["revisar", "fiscal", "neutro"].every(g => triaje.includes("tx-kpi tx-g-" + g)));

console.log("== 5. Nota del coste de compra bancaria (T46) ==");
const banc = reg({ clave: "e", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 200 });
const onch = reg({ clave: "f", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "ONCHAIN", importe_usdt: 50 });
assert("txEsCompraBancaria: solo COMPRA con vía BANCARIA",
  S.txEsCompraBancaria(banc) && !S.txEsCompraBancaria(onch) && !S.txEsCompraBancaria(null) &&
  !S.txEsCompraBancaria(reg({ categoria: "VENTA", via_compra: "BANCARIA" })));
assert("sin compras bancarias no hay nota", S.txHtmlNotaCoste([onch, reg({})], 100) === "");
/* La nota es corta y neutra, sin número ni ⓘ. */
const n1 = S.txHtmlNotaCoste([banc, onch], 100);
assert("con compras bancarias: la nota con 100 € por token y sin ⓘ",
  n1 === "💶 Compras externas de inmuebles: 100 € por token por defecto (se edita en 🔍 Revisión)." && !n1.includes('class="cc-info"'));
assert("usa el precio de la config si es válido", S.txHtmlNotaCoste([banc], 120).includes("120 € por token"));
assert("precio inválido o ausente → 100 € (el valor fijo)",
  S.txHtmlNotaCoste([banc], undefined).includes("100 € por token") && S.txHtmlNotaCoste([banc], "x").includes("100 € por token") &&
  S.txHtmlNotaCoste([banc], 0).includes("100 € por token"));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
