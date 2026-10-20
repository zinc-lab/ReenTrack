/* Coste supuesto: una compra por
 * transferencia bancaria sin coste tuyo lleva el de por defecto (100 € por
 * token) y el informe para la Renta lo marca con «**» en el coste de
 * compra (II. Inversiones activas) y en el valor de adquisición (III.3
 * Ventas), con la nota NOTA_COSTE_SUPUESTO debajo. Una con tu coste
 * (ajuste coste_eur), sin marca. El token de un canje hereda la marca.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_coste_supuesto_paso_supuesto1.js
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
const WALLET = "0x" + "1".repeat(40), CASA = "0x" + "a".repeat(40), NUEVO = "0x" + "b".repeat(40);
const COMPRADOR = "0x" + "c".repeat(40), BURN = "0x" + "0".repeat(40);

function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave, contrato, token: null, simbolo: null, cantidad,
    categoria, subcategoria, inmueble: "Casa", periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: "", destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
const banco = (clave, fecha, n, contrato = CASA) =>
  reg(clave, fecha, "COMPRA", "COSTE_BASE", contrato, n, { via_compra: "BANCARIA", coste_eur: 100 * n });

/* Motor e informe de 2025 (y su PDF y su Excel) con esos registros y
   ajustes. */
const MODULOS = MODULOS_PDF.concat(["18-transacciones.js", "20-coste-compras.js"]);
function correr(regs, ajustes = {}) {
  const sb = sandbox(MODULOS, HORA_APP);
  const tipos = {};
  for (const r of regs) tipos[r.fecha.slice(0, 10)] = 1;
  sb.__regs = regs;
  sb.__cache = { tipos_bce: tipos, precios_rnt: {}, ajustes_usuario: ajustes, contratos_aprendidos: {} };
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
      return { op, inf, pdf: JSON.stringify(pdfBloques(inf)), excel: JSON.stringify(libro, (k, v) => (v instanceof Map ? [...v] : v)) };
    })();`, sb);
}

console.log("== Sin coste tuyo: «**» en II y en III.3, con su nota ==");
{
  // 3 por banco sin coste tuyo y 2 con 260 € tuyos; se venden 4: 3 de la
  // primera (marcadas) y 1 de la segunda (sin marca); queda 1 sin marca.
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3), banco("c1", "2025-01-11 10:00:00", 2),
    reg("v", "2025-03-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 4, { importe_usdt: 600, origen: WALLET, destino: COMPRADOR })],
  { c1: { coste_eur: 260 } });
  const ventas = r.inf.detalle.ventas_inmuebles.filas;
  assert("dos filas de venta: la de la compra sin coste tuyo, marcada; la otra, no",
    ventas.length === 2 && ventas[0].coste_supuesto === true && !("coste_supuesto" in ventas[1]), ventas);
  assert("al 31/12 queda 1 token con tu coste: II sin marca",
    r.inf.inversiones_activas.inmuebles.filas.every(f => !("coste_supuesto" in f)), r.inf.inversiones_activas.inmuebles.filas);
  assert("el PDF pone «300,00 **» y la nota", r.pdf.includes('"300,00 **"') && r.pdf.includes("sin coste indicado, a 100 € por token"));
  assert("el Excel, el formato con «**» y la nota", r.excel.includes('#,##0.00\\" **\\"') && r.excel.includes("sin coste indicado, a 100 € por token"));
}
console.log("== Sin vender: la marca en II ==");
{
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3)]);
  const filas = r.inf.inversiones_activas.inmuebles.filas;
  assert("cierres_supuestos de 2025 = [la casa]", JSON.stringify(r.op.cierres_supuestos[2025]) === JSON.stringify([CASA]), r.op.cierres_supuestos);
  assert("II la marca", filas.length === 1 && filas[0].coste_supuesto === true, filas);
  assert("el PDF pone «300,00 **»", r.pdf.includes('"300,00 **"'));
  assert("el Excel de II, con el formato «**» y la nota", r.excel.includes('#,##0.00\\" **\\"') && r.excel.includes("sin coste indicado"));
}
console.log("== Un año sin movimientos hereda la marca ==");
{
  // Compra en 2024; 2025 sin movimientos: su informe sigue marcándola.
  const r = correr([banco("c0", "2024-05-10 10:00:00", 3)]);
  const filas = r.inf.inversiones_activas.inmuebles.filas;
  assert("II de 2025 (heredada de 2024) la marca", filas.length === 1 && filas[0].coste_supuesto === true, filas);
}
console.log("== A6: en el PDF el «**» no hace la letra pequeña ==");
{
  const sb = sandbox(MODULOS, HORA_APP);
  const [corta, larga] = vm.runInContext('[pdfHtmlCelda("1.500,00 **", true), pdfHtmlCelda("1.234.567,89", true)]', sb);
  assert("«1.500,00 **» en letra normal; una cifra larga de verdad, en pequeña",
    corta === "1.500,00 **" && larga.includes("pdf-larga"), [corta, larga]);
}
console.log("== Con tu coste: sin marca en ningún sitio ==");
{
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3)], { c0: { coste_eur: 290 } });
  assert("ni en II ni en el PDF ni en el Excel",
    !("coste_supuesto" in r.inf.inversiones_activas.inmuebles.filas[0]) && !r.pdf.includes("**") &&
    !r.excel.includes("sin coste indicado"), r.inf.inversiones_activas.inmuebles.filas);
}
console.log("== Canje: el token nuevo hereda la marca ==");
{
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3),
    reg("canje", "2025-02-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 3, { origen: WALLET, destino: BURN }),
    Object.assign(reg("canje", "2025-02-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO, 3, { via_compra: "CANJE" }), { clave: "canje::1" })]);
  const filas = r.inf.inversiones_activas.inmuebles.filas;
  assert("II marca el token nuevo", filas.length === 1 && filas[0].activo === NUEVO && filas[0].coste_supuesto === true, filas);
}

console.log("== A3 y A4: compras del mismo día, una fila con «**» si alguna parte lo es ==");
{
  // El mismo día: 3 sin coste tuyo y 2 con 260 € tuyos; se venden las 5.
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3), banco("c1", "2025-01-10 11:00:00", 2),
    reg("v", "2025-03-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 5, { importe_usdt: 700, origen: WALLET, destino: COMPRADOR })],
  { c1: { coste_eur: 260 } });
  const ventas = r.inf.detalle.ventas_inmuebles.filas;
  assert("A4: una sola fila, 5 tokens a 560 €, marcada",
    ventas.length === 1 && ventas[0].cantidad === 5 && ventas[0].valor_adquisicion_eur === 560 && ventas[0].coste_supuesto === true, ventas);
  assert("A3: la nota dice «Incluye…»", r.pdf.includes('"560,00 **"') && r.pdf.includes("** Incluye compras externas de inmuebles"));
}
{
  // II con las dos sin vender: la fila marcada y la nota con «Incluye».
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3), banco("c1", "2025-01-11 10:00:00", 2)], { c1: { coste_eur: 1000 } });
  const filas = r.inf.inversiones_activas.inmuebles.filas;
  assert("A3: II, 1.300 € con «**» y la nota «Incluye…»", filas.length === 1 && filas[0].coste_eur === 1300 &&
    filas[0].coste_supuesto === true && r.pdf.includes('"1.300,00 **"') && r.pdf.includes("Incluye compras"), filas);
}

console.log("== A5: 🧾 Fiscal, por el camino de la app (fiCalcular, como 📤) ==");
{
  // 3 sin coste tuyo; se venden 2: la venta y el lote que queda, marcados.
  const sb = sandbox(MODULOS, HORA_APP);
  sb.structuredClone = structuredClone;
  const regs = [banco("c0", "2025-01-10 10:00:00", 3),
    reg("v", "2025-03-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 2, { importe_usdt: 300, origen: WALLET, destino: COMPRADOR })];
  sb.__regs = regs;
  sb.__cache = { tipos_bce: { "2025-01-10": 1, "2025-03-01": 1 }, precios_rnt: {}, ajustes_usuario: {}, contratos_aprendidos: {} };
  const r = vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" };
    (() => {
      const res = fiCalcular(__regs, __cache, state.config, { hoy: "2025-12-31", diaReal: null, descargaIncompleta: false });
      const inf = res.informes[2025];
      return { ii: inf.inversiones_activas.inmuebles.filas,
        ventas: fiHtmlOperaciones(inf.detalle.ventas_inmuebles, "Ventas", "tokens", res.operaciones),
        lotes: fiHtmlHistorial(res, 2025, inf, inf) };
    })();`, sb);
  assert("II marcada también por fiCalcular (cierres_supuestos en su op)", r.ii.length === 1 && r.ii[0].coste_supuesto === true, r.ii);
  assert("Ventas de 🧾: «200,00 € **» y la nota", r.ventas.includes("200,00 € **") && r.ventas.includes("** Incluye compras"));
  assert("Historial de 🧾: el total de la compra externa con «**» y la nota", r.lotes.includes("300,00 € **") && r.lotes.includes("** Incluye compras"));
}

console.log("== A1 y A2: «💶 Coste…» confirma el de por defecto como tuyo ==");
{
  const sb = sandbox(MODULOS, HORA_APP);
  sb.__c = banco("c0", "2025-01-10 10:00:00", 3);
  const [filaAntes, cambios, ajustes] = vm.runInContext(`(() => {
    const filaAntes = cbHtmlEditor(cbFilas([__c], {}, 100), {});
    const cambios = cbCambios([__c], {}, { c0: "300,00" }, "c0", 100);
    return [filaAntes, cambios, cbAjustesConCostes({}, cambios, [__c], 100, "2026-10-10T10:00:00")];
  })()`, sb);
  assert("A2: la fila, solo el importe (el «por defecto» lo dice la explicación de 💶)", filaAntes.includes("300,00 €") && !filaAntes.includes("por defecto"));
  assert("A1: guardar 300 € (los mismos 3 × 100) es un cambio y se guarda", cambios.length === 1 && ajustes.c0.coste_eur === 300, ajustes);
  const r = correr([banco("c0", "2025-01-10 10:00:00", 3)], JSON.parse(JSON.stringify(ajustes)));
  assert("A1: y el informe ya no lo marca", !("coste_supuesto" in r.inf.inversiones_activas.inmuebles.filas[0]) && !r.pdf.includes("**"),
    r.inf.inversiones_activas.inmuebles.filas);
}

console.log("\n" + ok + " OK, " + fallos + " fallos");
if (fallos) process.exit(1);
