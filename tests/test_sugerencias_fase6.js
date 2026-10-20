/* Test de los pagos diferidos (sugerencias del buscador de cobros,
 * Reental-SPA/js/15-correcciones.js):
 * - ccSumarDias: la ventana de la venta a 60 días.
 * - ccPrecioCompraUsd: lo pagado por token en USD (media de las COMPRA del
 *   contrato hasta el día de la salida; también canje y compras por banco).
 * - ccSenalesCobro: una señal por «misma dirección» y otra por «precio a
 *   ±35 % de lo pagado».
 * - ccHtmlFilaCobro: un icono por señal (📍 dirección, 💲 precio),
 *   con el motivo en su título; ccHtmlLeyenda: «Pagos sugeridos».
 *
 * DATOS 100% SINTETICOS. Ejecución: node tests/test_sugerencias_fase6.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const sandbox = { console, state: {} };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sandbox, { filename: f });
}
const { ccSumarDias, ccPrecioCompraUsd, ccSenalesCobro, ccHtmlFilaCobro, ccOrdenarSugerencias } = sandbox;

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const W = "0x" + "11".repeat(20);       // tu wallet
const COMPRADOR = "0x" + "aa".repeat(20);
const OTRO = "0x" + "bb".repeat(20);
const TOKEN = "0x" + "c1".repeat(20), VIEJO = "0x" + "c0".repeat(20), BURN0 = "0x" + "00".repeat(20);
const compra = (fecha, cantidad, usd, contrato = TOKEN) =>
  ({ categoria: "COMPRA", inmueble: "Casa 1", contrato, fecha, cantidad, importe_usdt: usd });
const salida = { clave: "s", categoria: "REVISAR", inmueble: "Casa 1", contrato: TOKEN, fecha: "2026-05-12 09:45:46",
  cantidad: 4, origen: W, destino: COMPRADOR.toUpperCase().replace("0X", "0x") };
const cobro = (origen, cantidad) => ({ clave: "c", fecha: "2026-05-20 11:00:00", origen, destino: W,
  cantidad, simbolo: "USDC", hash: "0x" + "cd".repeat(32) });

console.log("== ccSumarDias ==");
assert("12/05 + 60 = 11/07", ccSumarDias("2026-05-12 09:45:46", 60) === "2026-07-11");
assert("cambio de año", ccSumarDias("2026-12-20", 60) === "2027-02-18");
assert("sin fecha → vacío", ccSumarDias(null, 60) === "");

console.log("== ccPrecioCompraUsd ==");
const regs = [compra("2024-07-21 10:00:00", 2, 200), compra("2025-01-10", 2, 240),
  compra("2026-08-01", 10, 9999),               // después de la venta: no cuenta
  compra("2024-01-01", 1, 50, VIEJO),            // otro contrato: no cuenta
  compra("2024-02-01", 1, null)];                // sin importe: no cuenta
assert("media de lo pagado = 110", ccPrecioCompraUsd(regs, salida) === 110, ccPrecioCompraUsd(regs, salida));
assert("sin compras → null", ccPrecioCompraUsd([], salida) === null);
assert("salida sin contrato → null", ccPrecioCompraUsd(regs, { ...salida, contrato: null }) === null);
assert("A9: el nombre del inmueble no cuenta (otro nombre, mismo contrato)",
  ccPrecioCompraUsd(regs.map(r => ({ ...r, inmueble: "casa 1" })), salida) === 110);
/* Canje 1:10 (1 token viejo comprado a 100 USD → 10 nuevos): 10 USD por token nuevo. */
const H = "0x" + "ee".repeat(32);
const canje = [compra("2024-01-01", 1, 100, VIEJO),
  { categoria: "VENTA", subcategoria: "GPP_INMUEBLE", contrato: VIEJO, hash: H, fecha: "2024-05-01", cantidad: 1, destino: BURN0 },
  { categoria: "COMPRA", via_compra: "CANJE", contrato: TOKEN, hash: H, fecha: "2024-05-01", cantidad: 10, importe_usdt: null }];
assert("A9: canje 1:10 → 10 USD por token", ccPrecioCompraUsd(canje, salida) === 10, ccPrecioCompraUsd(canje, salida));
assert("A9: canje 1:1 como el caso real → lo pagado por el viejo",
  ccPrecioCompraUsd([canje[0], canje[1], { ...canje[2], cantidad: 1 }], salida) === 100);
/* Compra por banco, 2 tokens a 100 €/token con el BCE a 1,1 (un sábado: vale el viernes). */
const banco = { categoria: "COMPRA", via_compra: "BANCARIA", contrato: TOKEN, fecha: "2024-03-16", cantidad: 2, coste_eur: 200 };
const tipos = { "2024-03-15": 1.1 };
assert("A10: banco → 110 USD por token", ccPrecioCompraUsd([banco], salida, tipos) === 110, ccPrecioCompraUsd([banco], salida, tipos));
assert("A10: banco + on-chain se promedian", ccPrecioCompraUsd([banco, compra("2025-01-10", 2, 240)], salida, tipos) === 115);
assert("A10: banco sin tipo del BCE no cuenta", ccPrecioCompraUsd([banco], salida, {}) === null);

console.log("== ccSenalesCobro (precio de compra 110, 4 tokens) ==");
const s = (o, c) => ccSenalesCobro(cobro(o, c), salida, 110).join(",");
assert("misma dirección (sin importar mayúsculas) y precio → 2", s(COMPRADOR, 4 * 136.5) === "direccion,precio");
assert("solo dirección (precio +50 %)", s(COMPRADOR, 4 * 165) === "direccion");
assert("solo precio (otra dirección)", s(OTRO, 4 * 100) === "precio");
assert("borde +35 % entra", s(OTRO, 4 * 148.5) === "precio");
assert("−36 % no entra", s(OTRO, 4 * 70.4) === "");
// B21 A9: la fila redondea el % y el 💲 también («−35 %» siempre con 💲).
assert("B21 A9: −35,4 % (la fila dice «−35 %») entra", s(OTRO, 4 * 71.06) === "precio" &&
  ccHtmlFilaCobro(cobro(OTRO, 4 * 71.06), false, salida, [], 110).includes("(−35 %)"));
assert("B21 A9: −35,6 % (la fila dice «−36 %») no entra", s(OTRO, 4 * 70.84) === "");
assert("sin precio de compra: solo la dirección cuenta",
  ccSenalesCobro(cobro(COMPRADOR, 400), salida, null).join(",") === "direccion");
assert("salida sin destino: no hay señal de dirección",
  ccSenalesCobro(cobro(COMPRADOR, 9999), { ...salida, destino: null }, 110).length === 0);

console.log("== ccOrdenarSugerencias (A6: orden; A8: ventas cobradas en varios pagos) ==");
const cob = (clave, origen, cantidad, fecha) => ({ ...cobro(origen, cantidad), clave, fecha });
const lista = [cob("lejos2", COMPRADOR, 4 * 110, "2026-06-28"), cob("nada", OTRO, 1, "2026-05-13"),
  cob("cerca1", OTRO, 4 * 110, "2026-05-14"), cob("cerca2", COMPRADOR, 4 * 110, "2026-05-18"),
  cob("antes1", OTRO, 4 * 110, "2026-05-11")];
const orden = ccOrdenarSugerencias(lista, salida, 110, null, null);
assert("⭐⭐ primero y luego ⭐, cada grupo del más cercano a la venta al más lejano; sin ⭐ al final",
  orden.map(f => f.c.clave).join(",") === "cerca2,lejos2,antes1,cerca1,nada", orden.map(f => f.c.clave));
assert("cada fila lleva sus señales", orden[0].sen.join(",") === "direccion,precio" && orden[4].sen.length === 0);
/* Venta de 4 tokens con 220 USD ya cobrados (vínculo confirmado): un segundo pago de 220 encaja. */
const ctx = { salidasVinculadas: new Map([["s", ["v1"]]]), cobrosAsignados: new Map() };
const cache = { pagos_diferidos: { ventas: [{ id: "v1", estado: "CONFIRMADO", asignaciones: [{ cantidad_asignada: 220 }] }] } };
const segundo = ccOrdenarSugerencias([cob("p2", OTRO, 220, "2026-08-01")], salida, 110, ctx, cache);
assert("A8: segundo pago de 220 con 220 ya cobrados → ⭐ de precio", segundo[0].sen.join(",") === "precio", segundo[0].sen);
assert("A8: sin lo ya cobrado no la llevaría", ccOrdenarSugerencias([cob("p2", OTRO, 220, "2026-08-01")], salida, 110, null, null)[0].sen.length === 0);
/* Un cobro de 880 que ya pagó 440 de otra venta: cuenta lo que le queda (440 = 110 por token). */
const ctx2 = { salidasVinculadas: new Map(), cobrosAsignados: new Map([["p3", { asignado: 440, ventaIds: ["otra"] }]]) };
assert("A8: cobro con 440 de 880 ya asignados → ⭐ de precio",
  ccOrdenarSugerencias([cob("p3", OTRO, 880, "2026-08-01")], salida, 110, ctx2, null)[0].sen.join(",") === "precio");
/* Venta de 4 tokens a 110 con 480 USD ya
   cobrados (+9 %): un cobro de 10 no lleva 💲 aunque el total siga en el
   margen, y el % de la fila es el del total (el mismo que decide el 💲). */
const cacheLlena = { pagos_diferidos: { ventas: [{ id: "v1", estado: "CONFIRMADO", asignaciones: [{ cantidad_asignada: 480 }] }] } };
const lleno = ccOrdenarSugerencias([cob("p4", OTRO, 10, "2026-08-01")], salida, 110, ctx, cacheLlena)[0];
assert("BOTONES-1: venta que ya llega al margen → un cobro pequeño no lleva 💲", lleno.sen.length === 0, lleno.sen);
assert("BOTONES-1: la fila lleva el importe del total (480 + 10)", lleno.importe === 490, lleno);
/* Con 300 ya cobrados (−32 %), el
   cobro que la acerca al coste lleva 💲 (140 → 0 %; 10 → −30 %); lo que
   cobran otras ventas no cuenta. */
const cache300 = { pagos_diferidos: { ventas: [{ id: "v1", estado: "CONFIRMADO", asignaciones: [{ cantidad_asignada: 300 }] },
  { id: "v2", estado: "CONFIRMADO", asignaciones: [{ cantidad_asignada: 5000 }] }] } };
const s300 = c => ccOrdenarSugerencias([cob("p5", OTRO, c, "2026-08-01")], salida, 110, ctx, cache300)[0];
assert("A2: 300 ya cobrados + 140 (0 %) → 💲", s300(140).sen.join(",") === "precio", s300(140));
assert("A2: 300 ya cobrados + 10 (−30 %, más cerca) → 💲", s300(10).sen.join(",") === "precio", s300(10));
assert("A2: 300 ya cobrados + 200 (+14 %, más cerca que −32 %) → 💲", s300(200).sen.join(",") === "precio");
assert("A2: 300 ya cobrados + 300 (+36 %, fuera) → sin 💲", s300(300).sen.length === 0);
assert("A2: solo cuenta lo cobrado de ESTA venta (v2 es de otra salida)", s300(140).importe === 440, s300(140));
const hLleno = ccHtmlFilaCobro(lleno.c, false, salida, lleno.sen, 110, lleno.importe);
assert("BOTONES-1: el % de la fila es el del total (122,50 USD/token, +11 %), con su burbuja",
  hLleno.includes("122,50 USD/token") && hLleno.includes("(+11 %)") && hLleno.includes("(Ya cobrado + este cobro)"), hLleno);
assert("A8 sigue: con 220 ya cobrados (corta), la fila enseña el total (110,00 USD/token, 0 %)",
  ccHtmlFilaCobro(segundo[0].c, false, salida, segundo[0].sen, 110, segundo[0].importe).includes("110,00 USD/token"));
assert("cobro entero sin nada cobrado: sin importe aparte", orden[0].importe === undefined);

console.log("== ccHtmlFilaCobro y ccHtmlLeyenda (LEYENDA-F6) ==");
const h2 = ccHtmlFilaCobro(cobro(COMPRADOR, 546), false, salida, ["direccion", "precio"], 105.2);
assert("los dos iconos, 📍 y 💲", h2.includes(">📍💲</span>"), h2);
// La burbuja de los iconos es su nombre (la frase larga, en la leyenda).
assert("motivos en el título, cortos",
  h2.includes('title="Misma dirección · Precio a ±35 %"'), h2);
assert("precio en verde (ok) solo con la pista 💲",
  h2.includes('class="cc-dlg-precio ok"') &&
  !ccHtmlFilaCobro(cobro(COMPRADOR, 546), false, salida, ["direccion"], 105.2).includes("cc-dlg-precio ok"));
assert("sin señales no hay iconos", !/📍|💲/.test(ccHtmlFilaCobro(cobro(OTRO, 1), false, salida, [])));
assert("sin el 4.º argumento sigue funcionando", !/📍|💲/.test(ccHtmlFilaCobro(cobro(OTRO, 1), false, salida)));
const ley = sandbox.ccHtmlLeyenda(110);
// «Cobros» y sin la cifra (ya sale en «Te costó X USD por token»).
assert("leyenda: «Cobros sugeridos (revísalo):» con 📍 y 💲 en su línea cada uno",
  ley.includes("<b>Cobros sugeridos (revísalo):</b>") &&
  ley.includes("<span>📍 Coincide con la dirección a la que enviaste los tokens.</span>") &&
  ley.includes("<span>💲 Precio a ±35 % de lo que te costó cada token.</span>"), ley);
assert("sin lo que te costó, la leyenda no habla del precio", !sandbox.ccHtmlLeyenda(null).includes("💲"));
assert("la leyenda con lo ya cobrado sigue igual", sandbox.ccHtmlLeyenda(110, 220, 4).includes("Ya cobrado: 220,00 USD (−50 %)."));

console.log("== ccHtmlElegidosJuntos (B21 A11: el precio de los elegidos juntos) ==");
const juntos = sandbox.ccHtmlElegidosJuntos;
const cob2 = (clave, cantidad) => ({ ...cobro(OTRO, cantidad), clave });
const sinAsig = new Map();
// Venta de 4 tokens que te costaron 110 USD cada uno, cobrada en dos pagos de 220.
const dos = juntos([cob2("a", 220), cob2("b", 220)], salida, 110, 0, sinAsig);
assert("dos de 220: 110,00 USD/token (0 %) con 💲", dos.includes("110,00 USD/token (0 %) 💲") && dos.includes('title="Elegidos ÷ tokens de la venta"'), dos);
assert("cada fila sigue con el suyo (55 USD/token, −50 %)", ccHtmlFilaCobro(cob2("a", 220), true, salida, [], 110).includes("55,00 USD/token<b> (−50 %)</b>"));
assert("con uno solo, nada (ya lo dice su fila)", juntos([cob2("a", 220)], salida, 110, 0, sinAsig) === "");
assert("lejos del precio: sin 💲", !juntos([cob2("a", 20), cob2("b", 20)], salida, 110, 0, sinAsig).includes("💲"));
const conYa = juntos([cob2("a", 100), cob2("b", 200)], salida, 110, 240, sinAsig);
assert("suma lo ya cobrado y lo dice en la burbuja", conYa.includes("135,00 USD/token (+23 %) 💲") && conYa.includes("(Ya cobrado + elegidos)"), conYa);
const parte = new Map([["a", { asignado: 120, enEstaVenta: false }]]);
assert("de un cobro que pagó otra venta, solo lo que le queda", juntos([cob2("a", 340), cob2("b", 220)], salida, 110, 0, parte).includes("110,00 USD/token"));
assert("un elegido sin cantidad legible: nada", juntos([cob2("a", 220), cob2("b", "x")], salida, 110, 0, sinAsig) === "");
assert("sin lo que te costó: el precio, sin % ni 💲", juntos([cob2("a", 220), cob2("b", 220)], salida, null, 0, sinAsig).includes(">110,00 USD/token</span>"));
assert("venta sin tokens: nada", juntos([cob2("a", 220), cob2("b", 220)], { ...salida, cantidad: 0 }, 110, 0, sinAsig) === "");

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
