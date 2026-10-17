/* P13 (a): compras de inmuebles que llegan sin pago en la blockchain, con
 * datos inventados. Lo que contó el probador:
 * - Varios inmuebles que llegan el MISMO día (un reparto masivo), sin USDT
 *   que salga: se pagaron en dólares → en 💶, «En USD…» con lo pagado en USD
 *   y el día del pago (€ con el BCE de ese día).
 * - Los que llegan sueltos, sin USDT que salga: compras por transferencia en
 *   € → en 💶, lo pagado en €.
 * Las pagadas en USD guardan además lo pagado (solo para la pantalla): 💶 las
 * enseña en $ con sus € al lado y 📊 las cuenta en $. Luego una venta: el
 * cálculo usa los costes en € (FIFO) y el informe ya no marca nada como coste
 * supuesto («**»).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_compras_banco_usd_paso_p13.js
 */
"use strict";
const vm = require("vm");
const { sandbox } = require("./paridad_motor_fiscal_paso_51f.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra).slice(0, 400) : "")); }
}
const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js",
  "20-coste-compras.js", "21-fiscal.js", "22-informe-renta.js"]);
const ev = x => vm.runInContext(x, sb);
const STATE = ev("state");
const W = "0x" + "1e".repeat(20), V = "0x" + "2f".repeat(20);
const REPARTO = "0x" + "4d".repeat(20), REENTAL = "0x" + "77".repeat(20), COMPRADOR = "0x" + "88".repeat(20);
const [P1, P2, P3, P4] = ["b1", "b2", "b3", "b4"].map(x => "0x" + x.repeat(20));
const NOMBRES = { [P1]: "Prueba Alcazaba 1", [P2]: "Prueba Bahía 2", [P3]: "Prueba Cumbre 3", [P4]: "Prueba Dársena 4" };
const SIM = { [P1]: "RALC1", [P2]: "RBAH2", [P3]: "RCUM3", [P4]: "RDAR4" };
const FECHA = "2026-10-15T10:00:00.000Z";

let n = 0;
const ts = f => String(Date.parse(f + "T09:00:00Z") / 1000);
const tok = (c, de, a, q, f) => ({ blockNumber: String(100 + ++n), timeStamp: ts(f), hash: "0x" + String(n).padStart(4, "0") + "ef".repeat(30),
  from: de, to: a, contractAddress: c, value: (BigInt(q) * 10n ** 18n).toString(), tokenName: "Reental " + NOMBRES[c], tokenSymbol: SIM[c], tokenDecimal: "18" });
const cache = sb.asegurarEstructuraCache(sb.cacheVacia());
cache.catalogo_propiedades = Object.fromEntries([P1, P2, P3, P4].map(c => [c, { estado: "CONFIRMADA", nombre_reental: NOMBRES[c], simbolo: SIM[c] }]));
const MASIVO = "2023-07-11";
cache.transacciones.wallet_tokens.push(
  tok(P1, REPARTO, W, 5, MASIVO), tok(P2, REPARTO, W, 3, MASIVO), tok(P3, REPARTO, W, 8, MASIVO),  // reparto masivo: pagado en USD
  tok(P4, REENTAL, W, 2, "2023-09-20"), tok(P1, REENTAL, W, 4, "2024-01-15"),                      // sueltas: pagadas en €
  tok(P1, W, COMPRADOR, 6, "2024-06-03"));                                                         // una venta
cache.tipos_bce = {};
for (let d = Date.parse("2023-01-01"); d <= Date.parse("2024-12-31"); d += 864e5) cache.tipos_bce[new Date(d).toISOString().slice(0, 10)] = 1.1;
cache.tipos_bce["2023-07-03"] = 1.09;   // el día del pago en USD
const csv = sb.cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet",
  "\"Prueba Alcazaba 1#2024-T1\",2024-04-10,40,0,40,0,\"['0x" + "99".repeat(32) + "']\"," + W].join("\n"));
if (csv.error) throw new Error(csv.error);
STATE.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100 };
STATE.cache = cache;
const clasificar = () => {
  sb.descubrimientoDinamico(cache, csv.filas, csv.indicePorHash, W, V);
  return (STATE.registros = sb.clasificarTransacciones(cache, csv.filas, csv.indicePorHash, STATE.config, {}));
};

console.log("== 1. Lo que dice la app sin hacer nada ==");
let regs = clasificar();
const bancarias = () => sb.cbComprasBancarias(STATE.registros);
assert("las 5 llegadas sin pago: compras por transferencia", bancarias().length === 5, regs.map(r => [r.inmueble, r.categoria, r.via_compra]));
assert("todas a 100 €/token por defecto (sin coste tuyo)", sb.cbFilas(regs, {}, 100).every(f => f.supuesto && f.coste === 100 * f.reg.cantidad));
const delDia = bancarias().filter(r => r.fecha.startsWith(MASIVO));
const sueltas = bancarias().filter(r => !r.fecha.startsWith(MASIVO));
assert("el reparto masivo: 3 inmuebles el mismo día; sueltas, 2", delDia.length === 3 && sueltas.length === 2);

console.log("== 2. 💶: las del reparto, «En USD…»; las sueltas, en € ==");
const USD = { [P1]: "500", [P2]: "300", [P3]: "800" };   // lo pagado en USD el 03/07/2023 (BCE 1,09)
const EUR = { [P4]: "210", [P1]: "420" };
const borrador = {};
for (const r of delDia) {
  const calc = sb.cbEurDeUsd(USD[r.contrato], "2023-07-03", cache.tipos_bce, cache);
  assert("«En USD…» " + r.inmueble + ": " + USD[r.contrato] + " USD el 03/07/2023 → " + sb.cbTextoEurDeUsd(calc), calc.eur > 0 && calc.fecha === "2023-07-03", calc);
  borrador[r.clave] = sb.numEs(calc.eur, 2);   // lo que escribe en la casilla de €
}
for (const r of sueltas) borrador[r.clave] = EUR[r.contrato];
for (const r of bancarias()) {
  const cambios = sb.cbCambios(STATE.registros, cache.ajustes_usuario, borrador, r.clave, 100);
  // Las del reparto, guardadas con «En USD…» abierto: van con lo pagado en USD (como cbGuardar).
  if (USD[r.contrato] && r.fecha.startsWith(MASIVO)) for (const c of cambios) c.usd = { importe: Number(USD[r.contrato]), fecha: "2023-07-03" };
  cache.ajustes_usuario = sb.cbAjustesConCostes(cache.ajustes_usuario, cambios, STATE.registros, 100, FECHA);
}
regs = clasificar();
const coste = c => regs.filter(r => r.via_compra === "BANCARIA" && r.contrato === c).map(r => r.coste_eur);
assert("las del reparto, a lo pagado en USD con el BCE del día del pago (458,72 · 275,23 · 733,94 €)",
  JSON.stringify([coste(P2)[0], coste(P3)[0]]) === "[275.23,733.94]" && coste(P1).includes(458.72), [coste(P1), coste(P2), coste(P3)]);
assert("las sueltas, a lo pagado en € (210 y 420 €)", coste(P4)[0] === 210 && coste(P1).includes(420), [coste(P4), coste(P1)]);
assert("ninguna queda «por defecto»", sb.cbFilas(regs, cache.ajustes_usuario, 100).every(f => !f.supuesto));

console.log("== 2b. Las pagadas en USD: en $ en 💶 y en 📊 (solo pantalla) ==");
{
  const aj = Object.values(cache.ajustes_usuario).filter(a => a.pagado_usd);
  assert("3 ajustes con lo pagado en USD y el día del pago, reconocidos como «Coste puesto por ti»",
    aj.length === 3 && aj.every(a => a.fecha_pago_usd === "2023-07-03" && sb.ccEsAjusteCoste(a)), aj);
  assert("el registro no lo lleva (el motor solo ve el coste en €)", regs.every(r => !("pagado_usd" in r) && !("fecha_pago_usd" in r)));
  const filas = sb.cbFilas(regs, cache.ajustes_usuario, 100);
  const masivo = filas.filter(f => f.reg.fecha.startsWith(MASIVO));
  const html = masivo.map(f => sb.cbHtmlFila(f, {})).join("");
  assert("💶: las del reparto en $ con sus € al lado («500,00 $» y «458,72 €»)",
    masivo.every(f => f.usd) && html.includes("500,00 $") && html.includes('<span class="cb-en-eur">458,72 €</span>'), html.slice(0, 300));
  assert("💶: las sueltas, solo en €", filas.filter(f => !f.reg.fecha.startsWith(MASIVO)).every(f => !f.usd));
  const inv = sb.dashDineroInvertido(regs, cache.tipos_bce, cache.ajustes_usuario);
  assert("📊: € 630 (sueltas) / $ 1.600 (reparto), y la cifra 1.600 + 630 × 1,1 = 2.293 USD", inv.eurBanco === 630 && inv.usdStable === 1600 &&
    Math.abs(inv.movimientos[inv.movimientos.length - 1].invertido - 2293) < 1e-6, [inv.eurBanco, inv.usdStable]);
  // Guardar solo € quita lo pagado en USD.
  const r3 = regs.find(r => r.contrato === P3 && r.via_compra === "BANCARIA");
  const soloEur = sb.cbAjustesConCostes(cache.ajustes_usuario, [{ clave: r3.clave, valor: 700 }], regs, 100, FECHA);
  const a3 = sb.ccBuscarAjuste(soloEur, r3.clave).ajuste;
  assert("corregida en € sin «En USD…»: ya no lleva lo pagado en USD", a3.coste_eur === 700 && !("pagado_usd" in a3) && !("fecha_pago_usd" in a3), a3);
  // En una decisión de 🔍 (o un «mandado a revisar») también vale y sigue siendo suya.
  const dec = { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 10, revisar: false,
    nota: "Decidido por ti en Revisión (2026-10-15): compra bancaria con su coste real", pagado_usd: 11, fecha_pago_usd: "2023-07-03" };
  assert("una decisión con lo pagado en USD sigue siendo una decisión (se deshace en «Ya decididos»)", sb.ccEsAjusteDecision(dec));
  const rev = { revisar: true, nota: "Mandado a revisar por ti (2026-10-15)", coste_eur: 10, pagado_usd: 11, fecha_pago_usd: "2023-07-03" };
  assert("un «mandado a revisar» con coste en USD sigue siendo tuyo", sb.ccAjusteQuePideRevision(rev) === "revisar");
  // Auditoría: lo pagado en USD no se pierde al pasar por 📒 ni por «✔ Dejar», y solo vale si cuadra con el €.
  const r1 = regs.find(r => r.contrato === P2 && r.via_compra === "BANCARIA");
  const conUsd = cache.ajustes_usuario;
  const mandado = sb.txAjustesConRevisar(conUsd, r1.clave, "mirar", FECHA);
  const am = sb.ccBuscarAjuste(mandado, r1.clave).ajuste;
  assert("A1: «Mandar a revisar» en 📒 conserva lo pagado en USD y se puede quitar", am.pagado_usd === 300 &&
    sb.txEstadoRevisar(Object.assign({}, r1, { revisar: true }), mandado) === "spa", am);
  const quitado = sb.ccBuscarAjuste(sb.txAjustesSinRevisar(mandado, r1.clave, FECHA), r1.clave).ajuste;
  assert("A2: «Quitar de revisar» lo devuelve con lo pagado en USD", quitado.pagado_usd === 300 && quitado.fecha_pago_usd === "2023-07-03" &&
    sb.ccEsAjusteCoste(quitado), quitado);
  const dejado = sb.ccBuscarAjuste(sb.ccAjustesConDecision(mandado, Object.assign({}, r1, { revisar: true }), "dejar", null, FECHA), r1.clave).ajuste;
  assert("A3: «✔ Dejar como compra» lo conserva", dejado.pagado_usd === 300 && dejado.coste_eur === 275.23 && sb.ccEsAjusteDecision(dejado), dejado);
  const aMano = Object.assign({}, sb.ccBuscarAjuste(conUsd, r1.clave).ajuste, { coste_eur: 5000 });
  assert("A5: con el € cambiado a mano en el JSON, lo pagado en USD ya no vale (💶 y 📊 enseñan el €)",
    sb.ccPagadoUsd(aMano, cache.tipos_bce) === null && sb.ccPagadoUsd(sb.ccBuscarAjuste(conUsd, r1.clave).ajuste, cache.tipos_bce).importe === 300);
}

console.log("== 3. La venta: 6 tokens de Alcazaba por 720 USD ==");
const salida = regs.find(r => r.contrato === P1 && sb.normalizarDireccion(r.destino) === COMPRADOR);
assert("la salida a revisar ofrece «Es una venta…»", salida && sb.ccOpcionesDecision(salida, sb.ccContextoCandidatos(cache, STATE.config, regs)).some(o => o.id === "venta"),
  salida && [salida.categoria, salida.revisar]);
cache.ajustes_usuario = sb.ccAjustesConDecision(cache.ajustes_usuario, salida, "venta", "720", FECHA);
regs = clasificar();
const copia = structuredClone(regs);
sb.__regs = copia; sb.__cache = cache;
sb.__op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
ev("motorFiscal(__regs, __cache, state.config, __op)");
const v = copia.find(r => r.categoria === "VENTA" && r.contrato === P1);
// FIFO: 5 del reparto (458,72 €) + 1 de la suelta (420 / 4 = 105 €) = 563,72 €; vendida por 720 / 1,1 = 654,55 €.
assert("FIFO: 5 del reparto + 1 de la suelta = 563,72 € de coste", v && Math.abs(v.coste_fifo_eur - 563.72) < 0.005 &&
  v.lotes_consumidos.length === 2 && v.lotes_consumidos[0].fecha.startsWith(MASIVO), v && [v.coste_fifo_eur, v.lotes_consumidos]);
assert("ganancia: 654,55 − 563,72 = 90,83 €", v && Math.abs(v.gp_eur - (720 / 1.1 - 563.72)) < 0.005, v && v.gp_eur);
assert("ningún lote con coste supuesto", !v.lotes_consumidos.some(t => t.coste_supuesto));
const informes = sb.informesRentaAnuales(copia, sb.resumenFiscalAnual(copia), STATE.config, Object.assign({}, sb.__op, { cache, hoy: "2026-10-15" }));
const filas = informes[2024].detalle.ventas_inmuebles.filas;
assert("informe 2024: la venta en dos filas (adquirida el 11/07/2023 y el 15/01/2024), sin «**»",
  filas.length === 2 && filas[0].fecha_adquisicion === MASIVO && filas[1].fecha_adquisicion === "2024-01-15" && filas.every(f => !f.coste_supuesto), filas);
const activas = informes[2024].inversiones_activas.inmuebles.filas;
assert("informe 2024: lo que te queda, sin «**» (ningún coste supuesto)", activas.length >= 3 && activas.every(f => !f.coste_supuesto), activas);
assert("sin cierres con coste supuesto", !(sb.__op.cierres_supuestos[2024] || []).length && !(sb.__op.cierres_supuestos[2023] || []).length, sb.__op.cierres_supuestos);

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
