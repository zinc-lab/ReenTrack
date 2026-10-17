/* P11 de punta a punta, como el caso real que lo motivó pero con datos
 * inventados: una preventa de RNT pagada en € y entregada poco a poco por un
 * contrato de reparto (la wallet hizo la reclamación, que dice la
 * asignación), un airdrop y casi todo el RNT metido en el staking.
 *
 * Recorre lo que hace el usuario: descarga (la cache), clasificación con el
 * archivo de Reental, «Compra externa…» y «Regalo (airdrop)» en 🔍, otra
 * entrega que llega después con el precio guardado, y comprueba el motor
 * fiscal, 💶, 📊 y el informe para la Renta.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_rnt_caso_completo_paso_p11.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { sandbox } = require("./paridad_motor_fiscal_paso_51f.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra).slice(0, 400) : "")); }
}
const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js",
  "20-coste-compras.js", "21-fiscal.js", "22-informe-renta.js", "28-cuadre.js"]);
const ev = x => vm.runInContext(x, sb);
const STATE = ev("state"), RNT = ev("RNT");
const STAKING = Object.keys(ev("SEMILLAS_DEFI").DEFI_STAKING)[0];
const W = "0x" + "1c".repeat(20), V = "0x" + "2d".repeat(20), REP = "0x" + "5a".repeat(20), AIR = "0x" + "6b".repeat(20);
const P1 = "0x" + "a1".repeat(20), T = "0x" + "77".repeat(20);
const FECHA = "2026-10-15T10:00:00.000Z";

/* La cache, como la dejaría la descarga. */
let n = 0;
const ts = f => String(Date.parse(f + "T09:00:00Z") / 1000);
const wei = q => (BigInt(Math.round(q * 1e6)) * 10n ** 12n).toString();
const hash = () => "0x" + String(++n).padStart(4, "0") + "cd".repeat(30);
const tok = (contrato, de, a, q, f, h = hash(), sim = "RNT") => ({ blockNumber: String(100 + n), timeStamp: ts(f), hash: h, from: de, to: a,
  contractAddress: contrato, value: wei(q), tokenName: sim === "RNT" ? "Reental Utility Token" : "Reental Prueba", tokenSymbol: sim, tokenDecimal: "18" });
const pal = h => h.padStart(64, "0");
const ENTREGAS = [["2024-02-10", 4000], ["2024-04-12", 3500], ["2024-06-14", 2500], ["2024-08-16", 2000], ["2024-10-18", 1500], ["2024-12-20", 1000]];
const cache = sb.asegurarEstructuraCache(sb.cacheVacia());
cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
for (const [f, q] of ENTREGAS) {
  const h = hash();
  cache.transacciones.wallet_tokens.push(tok(RNT, REP, W, q, f, h));
  // Cada entrega es una reclamación de la wallet: claim(index, cuenta, asignación 25.000, prueba).
  cache.transacciones.wallet_normales.push({ blockNumber: "1", timeStamp: ts(f), hash: h, from: W, to: REP, value: "0",
    gasUsed: "0", gasPrice: "0", isError: "0", input: "0x2e7ba6ef" + pal("3") + pal(W.slice(2)) + pal(BigInt(wei(25000)).toString(16)) + pal("80") + pal("0") });
}
cache.transacciones.wallet_tokens.push(tok(RNT, AIR, W, 10, "2024-09-03"));             // airdrop
cache.transacciones.wallet_tokens.push(tok(RNT, W, STAKING, 14000, "2025-01-15"));       // al staking
cache.transacciones.wallet_tokens.push(tok(P1, T, W, 4, "2024-03-01", hash(), "RALC1"));  // un inmueble, para el archivo de Reental
cache.tipos_bce = {};
for (let d = Date.parse("2024-01-01"); d <= Date.parse("2025-12-31"); d += 864e5) cache.tipos_bce[new Date(d).toISOString().slice(0, 10)] = 1.1;
cache.precios_rnt = { "2024-09-03": 0.25 };   // puesto a mano en 🔍 «🪙 Precios de RNT»
const csv = sb.cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet",
  "\"Prueba Alcazaba 1#2026-T1\",2026-06-10,40,0,40,0,\"['0x" + "99".repeat(32) + "']\"," + W].join("\n"));
if (csv.error) throw new Error(csv.error);
STATE.config = { wallet: W, vault: V, compra_bancaria_coste_eur_por_token: 100 };
STATE.cache = cache;
const clasificar = () => {
  sb.descubrimientoDinamico(cache, csv.filas, csv.indicePorHash, W, V);
  return (STATE.registros = sb.clasificarTransacciones(cache, csv.filas, csv.indicePorHash, STATE.config, {}));
};
const ctx = () => sb.ccContextoCandidatos(cache, STATE.config, STATE.registros);
const desde = (regs, de) => regs.filter(r => r.contrato === RNT && sb.normalizarDireccion(r.origen) === de && sb.ccEsEntradaRnt(r, ctx()));

console.log("== 1. Lo que llega, antes de decidir ==");
let regs = clasificar();
const entregas = desde(regs, REP);
assert("6 entregas del contrato de reparto, a revisar", entregas.length === 6 && entregas.every(r => r.categoria === "REVISAR" && r.revisar),
  entregas.map(r => r.categoria));
const alStaking = regs.find(r => r.contrato === RNT && sb.normalizarDireccion(r.destino) === STAKING);
assert("lo que va al staking: movimiento neutro (sigue siendo tuyo)", alStaking && alStaking.categoria === "MOVIMIENTO" && !alStaking.revisar, alStaking);
assert("la tarjeta ofrece «Compra externa…», «Regalo» y «Recompensa DeFi»",
  ["compra-rnt", "regalo", "recompensa"].every(i => sb.ccOpcionesDecision(entregas[0], ctx()).some(o => o.id === i)));

console.log("== 2. «Compra externa…»: 1.000 € por la asignación de 25.000 RNT ==");
let lista = sb.ccRntDesde(regs, entregas[0], cache.ajustes_usuario || {}, ctx());
const prop = sb.ccPropuestaCompraRnt(lista, cache, ctx().propias);
assert("el total viene de la reclamación (25.000) y lo llegado queda en la lista (6)",
  prop.de === "reclamacion" && prop.total === 25000 && lista.length === 6 && prop.fecha.startsWith("2024-02-10"), prop);
assert("el precio a la vista: 0,0400 €/RNT", sb.ccTextoPrecioRnt(1000, 25000) === "1.000,00 € ÷ 25.000 RNT = 0,0400 €/RNT");
const costes = sb.ccRepartoCompraRnt(lista, 1000, prop.total);
assert("cada entrega, su parte (160 + 140 + 100 + 80 + 60 + 40 = 580 €; falta por llegar, sin resto)",
  JSON.stringify(costes.map(([, c]) => c)) === "[160,140,100,80,60,40]", costes.map(([, c]) => c));
cache.ajustes_usuario = sb.ccAjustesConDecisiones(cache.ajustes_usuario || {},
  costes.map(([r, c]) => [r, "compra-rnt", { coste: c, pagado: 1000, total: prop.total }]), FECHA);

console.log("== 3. «Regalo (airdrop)» ==");
regs = clasificar();
const air = desde(regs, AIR);
assert("el airdrop, solo uno desde su dirección: se guarda sin preguntar", air.length === 1 &&
  sb.ccRntDesde(regs, air[0], cache.ajustes_usuario, ctx()).filter(x => x.estado === "libre").length === 1);
cache.ajustes_usuario = sb.ccAjustesConDecision(cache.ajustes_usuario, air[0], "regalo", null, FECHA);

console.log("== 4. La última entrega llega después: viene con el precio ==");
const h7 = hash();
cache.transacciones.wallet_tokens.push(tok(RNT, REP, W, 10500, "2025-03-01", h7));
regs = clasificar();
const nueva = desde(regs, REP).find(r => r.hash === h7);
lista = sb.ccRntDesde(regs, nueva, cache.ajustes_usuario, ctx());
const prop2 = sb.ccPropuestaCompraRnt(lista, cache, ctx().propias);
assert("viene con el precio de las anteriores (1.000 € por 25.000)", prop2.de === "precio" && prop2.pagado === 1000 && prop2.total === 25000, prop2);
const c2 = sb.ccRepartoCompraRnt(lista, prop2.pagado, prop2.total);
assert("solo la nueva, y se lleva el resto (1.000 − 580 = 420 €)", c2.length === 1 && c2[0][0].hash === h7 && c2[0][1] === 420, c2);
const antes = JSON.stringify(cache.ajustes_usuario);
cache.ajustes_usuario = sb.ccAjustesConDecisiones(cache.ajustes_usuario, c2.map(([r, c]) => [r, "compra-rnt", { coste: c, pagado: 1000, total: 25000 }]), FECHA);
assert("las anteriores no cambian", Object.entries(JSON.parse(antes)).every(([k, a]) => JSON.stringify(cache.ajustes_usuario[k]) === JSON.stringify(a)));

console.log("== 5. Reclasificado, motor, 💶, 📊 e informe ==");
regs = clasificar();
const compras = regs.filter(r => r.contrato === RNT && r.categoria === "COMPRA" && r.via_compra === "BANCARIA");
assert("7 compras bancarias de RNT, fuera de revisar y sin inmueble", compras.length === 7 && compras.every(r => !r.revisar && !r.inmueble));
assert("suman lo pagado (1.000 €)", Math.abs(compras.reduce((s, r) => s + r.coste_eur, 0) - 1000) < 1e-9);
const copia = structuredClone(regs);
sb.__regs = copia; sb.__cache = cache;
sb.__op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
const colas = ev("motorFiscal(__regs, __cache, state.config, __op)");
const rnt = copia.filter(r => r.contrato === RNT);
assert("ningún movimiento de RNT a revisar ni con «FIFO incompleto»", rnt.every(r => !r.revisar && !/FIFO incompleto/.test(r.nota || "")),
  rnt.filter(r => r.revisar).map(r => r.nota));
const lotes = colas.get("RNT") || [];
assert("en la cola del RNT: 7 lotes de la compra a 0,04 € y el del regalo", lotes.filter(l => l.origen === "COMPRA_BANCO").length === 7 &&
  lotes.filter(l => l.origen === "COMPRA_BANCO").every(l => Math.abs(l.coste_unitario_eur - 0.04) < 1e-12) && lotes.some(l => l.origen === "REWARD"),
  lotes.map(l => [l.origen, l.cantidad]));
const regalo = copia.find(r => r.contrato === RNT && r.subcategoria === "GPP_REGALO");
assert("el airdrop: ganancia de la base general por su valor ese día (10 × 0,25 USD / 1,1 = 2,27 €)",
  regalo.codigo_concepto === "GP_BASE_GRAL" && Math.abs(regalo.gp_eur - 2.5 / 1.1) < 1e-9, regalo);
const filas = sb.cbFilas(regs, cache.ajustes_usuario, 100).filter(f => f.reg.contrato === RNT);
const html = filas.map(f => sb.cbHtmlFila(f, {})).join("");
assert("💶: 7 filas «RNT» a 0,0400 € por token, sin «por defecto»", filas.length === 7 && (html.match(/<td>RNT<\/td>/g) || []).length === 7 &&
  (html.match(/0,0400 €/g) || []).length === 7 && !html.includes("por defecto"));
const dash = sb.dashDineroInvertido(regs, cache.tipos_bce);
assert("📊: el dinero invertido no cuenta el RNT (solo el inmueble)", dash.eurBanco === 400 && dash.usdStable === 0, [dash.eurBanco, dash.usdStable]);
const informes = sb.informesRentaAnuales(copia, sb.resumenFiscalAnual(copia), STATE.config, Object.assign({}, sb.__op, { cache, hoy: "2026-10-15" }));
assert("informe 2024: el regalo en las ganancias sin transmisión y ninguna compra de RNT como inmueble",
  (informes[2024].detalle.ganancias_sin_transmision.filas || []).some(f => f.clave === regalo.clave) &&
  !JSON.stringify(informes[2024].inversiones_activas.inmuebles).includes("RNT"), JSON.stringify(informes[2024].inversiones_activas.inmuebles).slice(0, 300));

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
