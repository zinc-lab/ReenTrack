/* Los datos sintéticos del historial de 🧾 (P27), comunes a
 * test_fiscal_paso_p27.js y verifyp27.js: registros ya clasificados, como
 * los recibe el motor. Casa: compra con USDT y su gas, compra externa con
 * tu coste, canje de las 10 al contrato nuevo, venta de 7 en 2025 y una
 * compra a revisar sin importe; Piso: compra externa con el coste de por
 * defecto, vendida entera en 2025; USDT: ingreso y dos rendimientos de
 * marzo de 2024; POL: ingreso y el gas de la compra. Tipo del BCE 1,25.
 */
"use strict";
const WALLET = "0x" + "1".repeat(40), CASA = "0x" + "a".repeat(40), NUEVO = "0x" + "b".repeat(40), PISO = "0x" + "d".repeat(40);
const OTRO = "0x" + "c".repeat(40);

function registrosP27(USDT, BURN) {
  function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
    return Object.assign({ clave, fecha, hash: "0x" + clave, contrato, token: null, simbolo: null, cantidad,
      categoria, subcategoria, inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
      via_compra: null, origen: OTRO, destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
  }
  return [
    reg("d1", "2024-01-05 10:00:00", "DEPOSITO", "COSTE_BASE", USDT, 1000, { importe_usdt: 1000 }),
    reg("dp", "2024-01-05 11:00:00", "DEPOSITO", "COSTE_BASE", "pol", 10, { coste_eur: 5 }),
    // Compra con USDT y su gas (en el mismo hash): el gas va al coste del lote.
    reg("c1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 5, { inmueble: "Casa", via_compra: "ONCHAIN", importe_usdt: 500 }),
    Object.assign(reg("g1", "2024-02-01 10:00:00", "COMISION", "NEUTRO", "pol", 0.1), { hash: "0xc1" }),
    reg("c2", "2024-03-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 5, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 500 }),
    reg("r1", "2024-03-10 10:00:00", "RENDIMIENTO", "RCM_RECLAMADO", USDT, 10, { importe_usdt: 10 }),
    reg("r2", "2024-03-20 10:00:00", "RENDIMIENTO", "RCM_RECLAMADO", USDT, 10, { importe_usdt: 10 }),
    reg("p1", "2024-04-01 10:00:00", "COMPRA", "COSTE_BASE", PISO, 2, { inmueble: "Piso", via_compra: "BANCARIA", coste_eur: 200 }),
    // Canje de las 10 de Casa al contrato nuevo (el mismo inmueble).
    reg("k", "2024-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 10, { inmueble: "Casa", origen: WALLET, destino: BURN }),
    Object.assign(reg("k", "2024-06-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO, 10, { inmueble: "Casa", via_compra: "CANJE" }), { clave: "k::1" }),
    reg("pv", "2025-05-01 10:00:00", "VENTA", "GPP_INMUEBLE", PISO, 2, { inmueble: "Piso", importe_usdt: 300, origen: WALLET, destino: OTRO }),
    reg("v1", "2025-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", NUEVO, 7, { inmueble: "Casa", importe_usdt: 875, origen: WALLET, destino: OTRO }),
    // Una compra sin importe: a revisar, no abre lote.
    reg("c3", "2025-07-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO, 1, { inmueble: "Casa", via_compra: "ONCHAIN" }),
  ];
}

module.exports = { WALLET, registrosP27 };
