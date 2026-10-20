/* Arreglos de los botones de la pestaña 🔍 Revisión.
 * Datos 100 % sintéticos. Carga los módulos en Node con vm.
 *
 *  A1) un cobro con una decisión tuya de Revisión que le quita el lote
 *      («Movimiento neutro», «Es spam») no se puede vincular: el formulario
 *      lo bloquea con su motivo. «Dinero que recibí…» y «Dejar como…», sí.
 *  A4) un cobro que no es depósito, asignado en parte y marcado antes como
 *      «Dinero que recibí…», deja aplicar el
 *      vínculo: la clasificación cuenta la categoría de tu ajuste.
 *  A5) el buscador cuenta los vínculos guardados como el formulario (también
 *      uno que el motor no aplica) y no ofrece un cobro sin nada libre.
 *  A6) no ofrece un cobro que ya está en esta venta.
 *  A15) las ✕ y los «↩ Deshacer» en rojo pálido cambian al pasar el ratón.
 *  A10) si la venta ya tiene cobros, la leyenda del buscador lo dice
 *      («Ya cobrado: X USD (+N %).»).
 *  A3) en «💶 Coste…», un importe que redondeado a céntimos es 0 (0,004 €)
 *      no se guarda.
 *
 * Ejecución (desde la raíz): node tests/test_botones_paso_botones1.js
 */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const JS = path.join(__dirname, "..", "Reental-SPA", "js");
const sb = { console, state: {}, structuredClone };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js", "21-fiscal.js", "18-transacciones.js", "20-coste-compras.js"])
  vm.runInContext(fs.readFileSync(path.join(JS, f), "utf8"), sb, { filename: f });
vm.runInContext("log = function () {}; toast = function () {};", sb);
const g = n => vm.runInContext(n, sb);
const FUENTE15 = fs.readFileSync(path.join(JS, "15-correcciones.js"), "utf8");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const USDC = g("USDC");
const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), P1 = "0x" + "a1".repeat(20);
const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
const reg = (hash, contrato, origen, destino, cantidad, categoria, o = {}) => Object.assign({
  clave: hash + "::" + contrato, fecha: "2026-05-12 09:45:46", hash, contrato, token: null, simbolo: null, cantidad,
  categoria, subcategoria: "PENDIENTE", inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
  via_compra: null, origen, destino, fuente: "ONCHAIN", nota: "", revisar: false }, o);
const COB = reg(H(2), USDC, T, W, 440, "DEPOSITO", { clave: "c1", simbolo: "USDC", fecha: "2026-05-20 10:00:00", revisar: true });

console.log("== A1: cobro con una decisión tuya de Revisión ==");
for (const decision of ["neutro", "spam"]) {
  const ajustes = g("ccAjustesConDecision")({}, COB, decision, null, "2026-07-25T10:00:00.000Z");
  assert("A1: «" + decision + "» → el cobro sale como decidido", g("ccCobrosConDecision")([COB], ajustes).length === 1);
}
assert("A1: sin decisión → no", g("ccCobrosConDecision")([COB], {}).length === 0);
for (const [decision, valor] of [["dinero", "440"], ["dejar", null]]) {
  const ajustes = g("ccAjustesConDecision")({}, COB, decision, valor, "2026-07-25T10:00:00.000Z");
  assert("A1: «" + decision + "» sí deja vincular (regla del 03/10: «Dinero que recibí…» antes)",
    g("ccCobrosConDecision")([COB], ajustes).length === 0, ajustes);
}
assert("A1: un «Mandado a revisar» no es una decisión",
  g("ccCobrosConDecision")([COB], { c1: { revisar: true, nota: g("ccNotaMandarRevisar")("x", "2026-07-25") } }).length === 0);
const val = g("ccValidacionBorrador")({ regSalida: {}, regCobro: COB, cantidadOk: true, cobroDecidido: true,
  sim: { info: { problemas: [], aplicados: [{ venta_id: "v" }] } } });
assert("A1: el formulario no deja guardar y dice por qué",
  !val.ok && val.motivos.includes("Este cobro tiene una decisión tuya: deshazla antes en «Movimientos ya decididos»."), val);
assert("A1: ccFormLeerEstado pasa cobroDecidido a la validación",
  /ccValidacionBorrador\(\{[^}]*cobroDecidido/.test(FUENTE15));

console.log("\n== A4: cobro asignado en parte y marcado antes «Dinero que recibí…» ==");
{
  const SAL = reg(H(1), P1, W, T, 4, "REVISAR", { clave: "s1", simbolo: "RC1", inmueble: "Casa 1", revisar: true });
  const COBR = reg(H(4), USDC, "0x" + "bb".repeat(20), W, 1000, "RENDIMIENTO", { clave: "c4", simbolo: "USDC", fecha: "2026-05-20 10:00:00" });
  const base = [SAL, COBR];
  const cacheDe = (marcado) => ({ catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Casa 1" } },
    contratos_aprendidos: {}, transacciones: {}, ajustes_usuario: marcado
      ? g("ccAjustesConDecision")({}, COBR, "dinero", 1000, "2026-07-25T10:00:00.000Z") : {},
    pagos_diferidos: { version: 1, ventas: [{ id: "v1", estado: "CONFIRMADO", estado_liquidacion: "COMPLETA",
      salida: g("ccReferenciaDeRegistro")(SAL, null), cantidad_tokens: 4,
      asignaciones: [{ id: "a1", pago: g("ccReferenciaDeRegistro")(COBR, null), activo: "USDC", cantidad_asignada: 440 }] }] } });
  const correr = marcado => {
    const cache = cacheDe(marcado);
    const sim = g("ccSimularBloque")(base.map(r => Object.assign({}, r)), cache, cache.pagos_diferidos.ventas, base.map(r => Object.assign({}, r)));
    return { sim, regs: sim.resultado };
  };
  const sin = correr(false), con = correr(true);
  assert("A4: sin marcar, el vínculo no se aplica (sigue el aviso)",
    sin.sim.info.aplicados.length === 0 && sin.sim.info.problemas.some(p => /asignado en parte/.test(p)), sin.sim.info);
  assert("A4: marcado «Dinero que recibí…», el vínculo se aplica", con.sim.info.aplicados.length === 1, con.sim.info);
  const venta = con.regs.find(r => r.clave === "s1"), cobro = con.regs.find(r => r.clave === "c4");
  assert("A4: la venta cobra 440 y el cobro queda como depósito",
    venta.categoria === "VENTA" && venta.importe_usdt === 440 && cobro.categoria === "DEPOSITO", { venta, cobro });
}

console.log("\n== A5 y A6: el buscador cuenta los vínculos guardados como el formulario ==");
{
  const SAL = reg(H(1), P1, W, T, 4, "VENTA", { clave: "s1", simbolo: "RC1", inmueble: "Casa 1" });
  const SAL9 = reg(H(9), P1, W, T, 2, "REVISAR", { clave: "s9", simbolo: "RC1", inmueble: "Casa 1" });
  const CA = reg(H(5), USDC, T, W, 440, "DEPOSITO", { clave: "ca", simbolo: "USDC" }); // 200 ya en la venta de s1
  const CB = reg(H(6), USDC, T, W, 880, "DEPOSITO", { clave: "cb", simbolo: "USDC" }); // entero en v9 (no aplicada)
  const CC = reg(H(7), USDC, T, W, 300, "DEPOSITO", { clave: "cc", simbolo: "USDC" }); // libre
  const ref = r => g("ccReferenciaDeRegistro")(r, null);
  const ventas = [
    { id: "v1", estado: "CONFIRMADO", salida: ref(SAL), asignaciones: [{ id: "a1", pago: ref(CA), cantidad_asignada: 200 }] },
    { id: "v9", estado: "CONFIRMADO", salida: ref(SAL9), asignaciones: [{ id: "a9", pago: ref(CB), cantidad_asignada: 880 }] }];
  const regs = [SAL, SAL9, CA, CB, CC];
  const b = g("ccContextoBuscador")(regs, { salidasVinculadas: new Map(), cobrosAsignados: new Map() }, SAL, ventas, null);
  assert("A6: el cobro que ya está en esta venta no se ofrece", !b.libre(CA));
  assert("A5: el cobro entero en un vínculo guardado (aunque no se aplique) no se ofrece", !b.libre(CB));
  assert("A5/A6: el cobro libre sí", b.libre(CC));
  assert("A5: lo ya cobrado de la venta sale del vínculo guardado", b.venta && b.venta.id === "v1" &&
    JSON.stringify(b.ctx.salidasVinculadas.get("s1")) === '["v1"]' && b.ctx.cobrosAsignados.get("cb").asignado === 880);
  const b9 = g("ccContextoBuscador")(regs, { salidasVinculadas: new Map(), cobrosAsignados: new Map() }, SAL9, ventas, null);
  const fila = g("ccOrdenarSugerencias")([CC], SAL9, 110, b9.ctx, { pagos_diferidos: { ventas } })[0];
  assert("A5: en la venta no aplicada, lo ya cobrado (880) cuenta en el precio", fila.importe === 1180, fila);
  assert("A5: ccDlgActualizar y ccAbrirBuscador usan esa cuenta",
    /ccOrdenarSugerencias\(mostrados, salidaReg, precioCompra, buscador\.ctx/.test(FUENTE15) &&
    /ventaIds: venta \? \[venta\.id\] : null/.test(FUENTE15));
}

console.log("\n== A15: los botones en rojo pálido cambian al pasar el ratón ==");
{
  const INDEX = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
  assert("A15: las ✕ de precios y direcciones y los «↩ Deshacer» (clase danger)", INDEX.includes(
    ".rv-tabla .rv-acciones button.danger:hover:not(:disabled),.cc-vinc-acciones button.danger:hover:not(:disabled){border-color:var(--err)}"));
  assert("A15: los dos «↩ Deshacer» llevan la clase danger",
    FUENTE15.includes('class="cc-accion danger" data-accion="anular-vinculo"') &&
    FUENTE15.includes('class="cc-accion danger" data-accion="deshacer-decision"'));
}

console.log("\n== A10: la leyenda dice lo ya cobrado ==");
{
  const ley = g("ccHtmlLeyenda");
  const conYa = ley(98.6, 305.6631, 2.5000045);
  assert("A10: con cobros, «Ya cobrado: 305,66 USD (+24 %).»",
    conYa.includes('<span class="cc-dlg-ya">Ya cobrado: 305,66 USD (+24 %).</span>'), conYa);
  assert("A10: por debajo, con su signo menos", ley(110, 300, 4).includes("Ya cobrado: 300,00 USD (−32 %)."), ley(110, 300, 4));
  assert("A10: sin lo que te costó, solo el importe", ley(null, 300, 4).includes('<span class="cc-dlg-ya">Ya cobrado: 300,00 USD.</span>'));
  assert("A10: sin nada cobrado, no sale", !ley(110, 0, 4).includes("Ya cobrado") && !ley(110).includes("Ya cobrado"));
  assert("A10: resaltado como rotulador fosforito, con su color en claro y en oscuro",
    FUENTE15.includes(".cc-dlg-leyenda .cc-dlg-ya{") && FUENTE15.includes("background:var(--resalte);color:var(--text);font-weight:700}") &&
    (fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8").match(/--resalte:/g) || []).length === 2);
  assert("A10: ccDlgActualizar le pasa lo cobrado de la venta",
    /const yaCobrado = buscador\.venta \? ccAsignacionesValidas\(buscador\.venta\)/.test(FUENTE15) &&
    FUENTE15.includes("ccHtmlLeyenda(precioCompra, yaCobrado, salidaReg && salidaReg.cantidad)"));
}

console.log("\n== A3: coste por compra que redondeado es 0 ==");
const COMPRA = reg(H(3), P1, "0x" + "00".repeat(20), W, 5, "COMPRA", { clave: "b1", via_compra: "BANCARIA", coste_eur: 500 });
const guardar = valor => { try { return g("cbAjustesConCostes")({}, [{ clave: "b1", valor }], [COMPRA], 100, "2026-10-09"); }
  catch (e) { return e.message; } };
assert("A3: 0,004 € no se guarda (dice que tiene que ser mayor que 0)", guardar(0.004) === "Escribe un importe mayor que 0.", guardar(0.004));
assert("A3: 0,005 € se guarda como 0,01 €", guardar(0.005).b1 && guardar(0.005).b1.coste_eur === 0.01, guardar(0.005));
assert("A3: 450 € se guarda", guardar(450).b1 && guardar(450).b1.coste_eur === 450, guardar(450));

console.log("\n== A7 y A8: precio de las filas del buscador ==");
{
  const SAL = reg(H(1), P1, W, T, 4, "VENTA", { clave: "s1", simbolo: "RC1" });
  const ord = (cobros, ya, asignados) => g("ccOrdenarSugerencias")(cobros, SAL, 110,
    { salidasVinculadas: new Map(ya ? [["s1", ["v1"]]] : []), cobrosAsignados: new Map(asignados || []) },
    { pagos_diferidos: { ventas: ya ? [{ id: "v1", estado: "CONFIRMADO", asignaciones: [{ id: "a1", cantidad_asignada: ya }] }] : [] } });
  const fila = f => g("ccHtmlFilaCobro")(f.c, false, SAL, f.sen, 110, f.importe, f.como);
  const precio = html => (/class="cc-dlg-precio[^"]*"(?: title="([^"]*)")?>([^<]*)/.exec(html) || []).slice(1);
  for (const cant of [null, NaN, "440", 0, -5]) {
    for (const ya of [0, 200]) {
      const f = ord([reg(H(3), USDC, T, W, cant, "DEPOSITO", { clave: "cx", simbolo: "USDC" })], ya)[0];
      const [titulo, texto] = precio(fila(f));
      assert("A7: cobro con cantidad " + JSON.stringify(cant) + (ya ? " y 200 ya cobrados" : "") + ": sin precio, ni 💲 ni burbuja",
        texto === "" && titulo === undefined && !f.sen.includes("precio") && f.importe === undefined, { titulo, texto, f });
    }
  }
  const C = reg(H(4), USDC, T, W, 440, "DEPOSITO", { clave: "c4", simbolo: "USDC" });
  let [titulo, texto] = precio(fila(ord([C], 0, [["c4", { asignado: 40 }]])[0]));
  assert("A8: sin nada cobrado y 40 de este cobro en otra venta: «Lo que queda de este cobro», 100,00 USD/token",
    titulo === "Lo que queda de este cobro ÷ tokens de la venta" && texto === "100,00 USD/token", [titulo, texto]);
  [titulo, texto] = precio(fila(ord([C], 200)[0]));
  assert("A8: con 200 ya cobrados: «(Ya cobrado + este cobro)», 160,00", titulo === "(Ya cobrado + este cobro) ÷ tokens de la venta" &&
    texto === "160,00 USD/token", [titulo, texto]);
  [titulo, texto] = precio(fila(ord([C], 200, [["c4", { asignado: 40 }]])[0]));
  assert("A8: con los dos: «(Ya cobrado + lo que queda de este cobro)», 150,00",
    titulo === "(Ya cobrado + lo que queda de este cobro) ÷ tokens de la venta" && texto === "150,00 USD/token", [titulo, texto]);
  [titulo] = precio(fila(ord([C], 0)[0]));
  assert("A8: el cobro entero y nada cobrado: «Cobro ÷ tokens de la venta»", titulo === "Cobro ÷ tokens de la venta", titulo);
  [titulo, texto] = precio(fila(ord([C], 0, [["c4", { asignado: 500 }]])[0]));
  assert("A8: asignado más de lo que llegó: lo que queda es 0, no negativo", texto === "0,00 USD/token", [titulo, texto]);
  [titulo, texto] = precio(fila(ord([C], 200, [["c4", { asignado: 200 }]])[0]));
  assert("A8 (auditoría O1): 200 ya cobrados + 240 que quedan suman 440 como el cobro, y la burbuja lo dice igual",
    titulo === "(Ya cobrado + lo que queda de este cobro) ÷ tokens de la venta" && texto === "110,00 USD/token", [titulo, texto]);
  [titulo, texto] = precio(fila(ord([C], -100)[0]));
  assert("A8 (auditoría O2): una asignación negativa (escrita a mano) no cuenta como cobrada, como en el motor",
    titulo === "Cobro ÷ tokens de la venta" && texto === "110,00 USD/token", [titulo, texto]);
}

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
