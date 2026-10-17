/* P11: una compra de RNT pagada en € (COMPRA BANCARIA de RNT, con el coste
 * que pusiste) abre su lote en la cola FIFO «RNT», la misma que los premios
 * y los swaps: una venta de RNT después la encuentra. Mezcla en la cola de
 * lotes con coste en USD (premio) y sin él (compra en €): el informe y el
 * Excel lo marcan como USD parcial. Nunca un coste supuesto en RNT y nunca
 * cuenta como inmueble (ni en 📊 ni en «Inversiones activas»).
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_rnt_fiscal_paso_p11.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF } = require("./paridad_informe_pdf_paso_63.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const WALLET = "0x" + "1".repeat(40), REPARTO = "0x" + "d".repeat(40), DEX = "0x" + "e".repeat(40);
const MODULOS = MODULOS_PDF.concat(["16-dashboard.js", "18-transacciones.js", "20-coste-compras.js", "28-cuadre.js"]);
const sb0 = sandbox(MODULOS, HORA_APP);
const RNT = vm.runInContext("RNT", sb0);

function reg(clave, fecha, categoria, subcategoria, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave, contrato: RNT, token: "RNT", simbolo: "RNT", cantidad,
    categoria, subcategoria, inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: REPARTO, destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
/* Una entrega de la preventa: llega como «sin regla» y la decisión de 🔍
   la vuelve compra bancaria con su parte de lo pagado. */
const entrega = (clave, fecha, n) => reg(clave, fecha, "REVISAR", "PENDIENTE", n, { revisar: true });
const compraRnt = coste => ({ categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: coste,
  revisar: false, nota: "Decidido por ti en Revisión (2025-12-01): compra de RNT" });

function correr(regs, ajustes = {}, precios = {}, tipo = 1) {
  const sb = sandbox(MODULOS, HORA_APP);
  const tipos = {};
  for (const r of regs) tipos[r.fecha.slice(0, 10)] = tipo;
  sb.__regs = regs;
  sb.__cache = { tipos_bce: tipos, precios_rnt: precios, ajustes_usuario: ajustes, contratos_aprendidos: {} };
  return vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" };
    (() => {
      const regs = __regs;
      aplicarAjustesUsuario(regs, __cache, true);
      const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
      const colas = motorFiscal(regs, __cache, state.config, op);
      const resumen = resumenFiscalAnual(regs);
      const informes = informesRentaAnuales(regs, resumen, state.config, { ...op, cache: __cache, hoy: "2025-12-31" });
      const inf = informes[2025];
      const libro = excelLibro(regs, colas, resumen, __cache, state.config, informes, new Date(), null, null);
      return { op, inf, regs, colas: [...colas].map(([a, l]) => [a, l.map(x => Object.assign({}, x))]),
        dash: dashDineroInvertido(regs, __cache.tipos_bce), activos: Object.keys(cuadreActivos(colas, __cache)),
        pdf: JSON.stringify(pdfBloques(inf)), excel: JSON.stringify(libro, (k, v) => (v instanceof Map ? [...v] : v)) };
    })();`, sb);
}

console.log("== 1. La compra de RNT en € abre lote en la cola «RNT» ==");
{
  const r = correr([entrega("e1", "2025-01-10 10:00:00", 1000), entrega("e2", "2025-02-10 10:00:00", 500)],
    { e1: compraRnt(37), e2: compraRnt(18.5) });
  const cola = (r.colas.find(([a]) => a === "RNT") || [, []])[1];
  assert("dos lotes en «RNT» (no en la dirección del contrato)", cola.length === 2 && !r.colas.some(([a]) => a === RNT), r.colas.map(([a]) => a));
  assert("a 0,037 €/RNT, de origen COMPRA_BANCO", cola.every(l => Math.abs(l.coste_unitario_eur - 0.037) < 1e-12 && l.origen === "COMPRA_BANCO"), cola);
  assert("sin coste supuesto", cola.every(l => !l.coste_supuesto), cola);
  assert("no van a revisar", r.regs.every(x => !x.revisar), r.regs.map(x => x.nota));
  assert("📊 no las cuenta como inmueble", r.dash.compras === 0, r.dash);
  assert("«Inversiones activas» sin RNT", r.inf.inversiones_activas.inmuebles.filas.length === 0, r.inf.inversiones_activas.inmuebles.filas);
  assert("cierres_supuestos vacíos", !(r.op.cierres_supuestos[2025] || []).length, r.op.cierres_supuestos);
  assert("el cuadre con la blockchain lo mira como «RNT» (no como un activo con la dirección del contrato)",
    r.activos.includes("RNT") && !r.activos.includes(RNT), r.activos);
}

console.log("== 1b. COMPRA-EXTERNA A1: una compra sin precio no deja que la venta se lleve otro lote ==");
{
  const sinPrecio = { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", revisar: false,
    nota: "Decidido por ti en Revisión (2025-12-01): compra externa" };
  const premio = reg("p1", "2025-02-05 10:00:00", "REWARD", "GPP_REGALO", 1000);
  const venta = reg("v1", "2025-03-01 10:00:00", "VENTA", "GPP_SWAP", 1000, { origen: WALLET, destino: DEX, importe_usdt: 100 });
  const r = correr([entrega("e1", "2025-01-10 10:00:00", 1000), premio, venta], { e1: sinPrecio, p1: { subcategoria: "GPP_REGALO" } },
    { "2025-02-05": 0.05 });
  const c = r.regs.find(x => x.clave === "e1"), v = r.regs.find(x => x.clave === "v1");
  assert("la compra sin precio, a revisar y diciendo dónde se pone", c.revisar && /compra sin precio: se pone en Revisión, en Coste de las compras externas/.test(c.nota), c.nota);
  assert("la venta gasta primero la compra (10/01): sin coste registrado y a revisar, sin G/P",
    v.revisar && /faltan 1\.000 unidades sin coste registrado/.test(v.nota) && v.gp_eur == null, [v.nota, v.gp_eur]);
  const cola = (r.colas.find(([a]) => a === "RNT") || [, []])[1];
  assert("el lote del regalo sigue entero en la cola", cola.length === 1 && cola[0].origen === "REWARD" && cola[0].cantidad === 1000, cola);
  const sinVenta = correr([entrega("e1", "2025-01-10 10:00:00", 1000)], { e1: sinPrecio });
  const cola2 = (sinVenta.colas.find(([a]) => a === "RNT") || [, []])[1];
  assert("sin vender, los 1.000 RNT están en la cartera del motor (el cuadre no ve un hueco)",
    cola2.length === 1 && cola2[0].cantidad === 1000 && cola2[0].sin_coste === true, cola2);
}

console.log("== 2. Venta de RNT después: la encuentra, mezcla con un premio ==");
{
  const premio = reg("p1", "2025-01-05 10:00:00", "REWARD", "GPP_REGALO", 100, { nota: "regalo" });
  const venta = reg("v1", "2025-03-01 10:00:00", "VENTA", "GPP_SWAP", 1050,
    { origen: WALLET, destino: DEX, importe_usdt: 105 });
  const r = correr([premio, entrega("e1", "2025-01-10 10:00:00", 1000), venta],
    { e1: compraRnt(37), p1: { subcategoria: "GPP_REGALO" } }, { "2025-01-05": 0.5 });
  const v = r.regs.find(x => x.clave === "v1");
  // 100 del premio a 0,5 € (50 €) + 950 de la compra a 0,037 € (35,15 €).
  assert("sin «FIFO incompleto», coste 85,15 €", !v.revisar && Math.abs(v.coste_fifo_eur - 85.15) < 1e-9, [v.nota, v.coste_fifo_eur]);
  assert("G/P = 105 − 85,15 = 19,85 €", Math.abs(v.gp_eur - 19.85) < 1e-9, v.gp_eur);
  assert("dos trozos: el del premio con USD y el de la compra sin él",
    v.lotes_consumidos.length === 2 && v.lotes_consumidos[0].coste_usd === 50 && v.lotes_consumidos[1].coste_usd === null, v.lotes_consumidos);
  const filas = r.inf.detalle.permutas.filas;
  assert("III.4: una fila por lote; la de la compra, adquirida el día de la entrega y sin USD",
    filas.length === 2 && filas[1].fecha_adquisicion === "2025-01-10" && filas[1].valor_adquisicion_eur === 35.15 &&
    filas[1].valor_adquisicion_usd === null && filas[0].valor_adquisicion_usd === 50, filas);
  assert("III.4: el total en USD queda sin poner (no se inventa)", r.inf.detalle.permutas.total.valor_adquisicion_usd === null &&
    r.inf.detalle.permutas.total.gp_eur === 19.85, r.inf.detalle.permutas.total);
  assert("el Excel lleva las dos filas (del 05/01 y del 10/01)", r.excel.includes('"2025-01-05T00:00:00.000Z"') &&
    r.excel.includes('"2025-01-10T00:00:00.000Z"'));
  assert("quedan 50 RNT de la compra", JSON.stringify(r.colas.find(([a]) => a === "RNT")[1].map(l => l.cantidad)) === "[50]");
}

console.log("== 3. Con los ajustes de 🔍 de verdad y un tipo del BCE distinto de 1 ==");
{
  // La compra, con el ajuste que escribe «Compra externa…» (1.000 RNT por 40 €); el premio, a 0,5 USD con 1,25 USD/EUR.
  const e1 = entrega("e1", "2025-01-10 10:00:00", 1000);
  const aj = sb0.ccAjustesConDecision({}, e1, "compra", null, "2025-12-01T10:00:00.000Z");
  aj.e1.coste_eur = 40; // lo pagado, puesto en 💶
  const premio = reg("p1", "2025-01-05 10:00:00", "REWARD", "GPP_REGALO", 100);
  const venta = reg("v1", "2025-03-01 10:00:00", "VENTA", "GPP_SWAP", 1100, { origen: WALLET, destino: DEX, importe_usdt: 125 });
  aj.p1 = { subcategoria: "GPP_REGALO" };
  const r = correr([premio, e1, venta], aj, { "2025-01-05": 0.5 }, 1.25);
  const v = r.regs.find(x => x.clave === "v1");
  // 100 RNT × 0,5 USD / 1,25 = 40 € del premio + 40 € de la compra = 80 €; vendido por 125 USD = 100 €.
  assert("coste 80 € (40 + 40) y G/P 20 €", Math.abs(v.coste_fifo_eur - 80) < 1e-9 && Math.abs(v.gp_eur - 20) < 1e-9, [v.coste_fifo_eur, v.gp_eur]);
  assert("el trozo del premio lleva su USD (50) y el de la compra no", v.lotes_consumidos[0].coste_usd === 50 &&
    v.lotes_consumidos[1].coste_usd === null, v.lotes_consumidos);
}

console.log("== 4. A4: «✔ Recompensa DeFi» en 🔍 fija la subcategoría (el motor ya no la vuelve regalo) ==");
{
  // Un premio de un contrato conocido sin posición DeFi que lo respalde.
  const premio = () => reg("p1", "2025-02-01 10:00:00", "REWARD", "RCM_REWARD", 10, { revisar: true });
  const sin = correr([premio()], {}, { "2025-02-01": 1 }).regs[0];
  assert("sin decidir: el motor lo vuelve regalo", sin.subcategoria === "GPP_REGALO" && sin.codigo_concepto === "GP_BASE_GRAL", sin);
  const aj = sb0.ccAjustesConDecision({}, premio(), "dejar", null, "2025-12-01T10:00:00.000Z");
  assert("el ajuste de «✔ Recompensa DeFi» lleva su subcategoría", aj.p1.subcategoria === "RCM_REWARD" && sb0.ccEsAjusteDecision(aj.p1), aj.p1);
  const con = correr([premio()], aj, { "2025-02-01": 1 }).regs[0];
  assert("decidido: recompensa (RCM_STAKING) y fuera de revisar", con.subcategoria === "RCM_REWARD" &&
    con.codigo_concepto === "RCM_STAKING" && !con.revisar, con);
  const deshecho = sb0.ccAjustesSinDecision(aj, "p1", "2025-12-02T10:00:00.000Z");
  assert("deshacerlo lo deja sin ajuste", JSON.stringify(deshecho) === "{}", deshecho);
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
