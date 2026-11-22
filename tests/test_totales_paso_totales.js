/* «📄 Solo totales (CSV)» de 📤 y el país de cada inmueble (js/30, TOTALES).
 *
 * Bajo prueba:
 * A. Con el motor y el informe de verdad (fiCalcular) sobre un caso
 *    inventado: la cabecera, las fechas de corte (cada 31/12 y el día de los
 *    datos), todos los conceptos en cada fecha y una fila por (fecha,
 *    concepto, inmueble); cada total igual que el informe y 🧾 (capital,
 *    los seis del ejercicio, la wallet y el RNT); el valor nominal en la
 *    moneda del proyecto; el coste supuesto, «A revisar» y el RNT sin
 *    precio con «no»; las filas de inmueble suman su total; el país.
 * B. Con un cálculo escrito a mano: tokens sin compras, un canje (dos
 *    contratos, un nombre), el vault con USDT sin coste o negativo, sin tipo
 *    del BCE en 4 días, la compra de RNT sin precio, el formato del texto.
 * C. El país: dos letras, se guarda en tu archivo y en la copia, junto al
 *    nombre en el PDF, el Excel y 🧾, y sin él nada cambia.
 * D. Las fechas de corte que necesitan precio de RNT (js/08).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz):
 *     node tests/test_totales_paso_totales.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF } = require("./paridad_informe_pdf_paso_63.js");

const MODULOS = MODULOS_PDF.concat(["08-coingecko.js", "16-dashboard.js", "24-exportar.js", "30-totales.js"]);
let ok = 0, fallos = 0;
const assert = (nombre, cond, extra) => {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
};
const sb = sandbox(MODULOS, HORA_APP);
sb.structuredClone = structuredClone;
const USDT = vm.runInContext("USDT", sb), RNT = vm.runInContext("RNT", sb);
const WALLET = "0x" + "1".repeat(40), OTRO = "0x" + "c".repeat(40);
const CASA = "0x" + "a".repeat(40), CALLE = "0x" + "e".repeat(40), NUEVO7 = "0x" + "f".repeat(40);

function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave, contrato, token: null, simbolo: null, cantidad,
    categoria, subcategoria, inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: OTRO, destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
const porClave = filas => new Map(filas.map(f => [f.fecha_corte + "|" + f.concepto + "|" + f.inmueble, f]));
const CONCEPTOS = ["coste_compra", "valor_nominal", "saldo_vault", "saldo_wallet", "rnt_valor", "rnt_coste_compra",
  "rendimientos_integros", "retenciones", "recompensas_defi", "ganancias_ventas", "perdidas_ventas", "ganancias_base_general"];

/* ---------------------------------------------------------------- A */
console.log("== A. Con el motor y el informe ==");
const regs = [
  reg("d1", "2024-01-05 10:00:00", "DEPOSITO", "COSTE_BASE", USDT, 1000, { importe_usdt: 1000 }),
  reg("dr", "2024-01-10 10:00:00", "DEPOSITO", "COSTE_BASE", RNT, 500, { coste_eur: 25 }),
  // Casa, proyecto en $: 100 $ por token.
  reg("c1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 5, { inmueble: "Casa", via_compra: "ONCHAIN", importe_usdt: 500 }),
  // Calle Mayor, en €: compra externa con tu coste (100 € por token).
  reg("c2", "2024-03-01 10:00:00", "COMPRA", "COSTE_BASE", CALLE, 3, { inmueble: "Calle Mayor, 1", via_compra: "BANCARIA", coste_eur: 300 }),
  reg("r1", "2024-03-10 10:00:00", "RENDIMIENTO", "RCM_RECLAMADO", USDT, 10, { importe_usdt: 10 }),
  // Nuevo 7: compra externa sin tu precio (coste supuesto).
  reg("c3", "2025-03-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO7, 3, { inmueble: "Nuevo 7", via_compra: "BANCARIA", coste_eur: 300 }),
  reg("v1", "2025-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 2, { inmueble: "Casa", importe_usdt: 260, origen: WALLET, destino: OTRO }),
  // Una compra sin importe en 2026: a revisar.
  reg("c4", "2026-05-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 1, { inmueble: "Casa", via_compra: "ONCHAIN" }),
];
const tipos = {};
for (const r of regs) tipos[r.fecha.slice(0, 10)] = 1.25;
Object.assign(tipos, { "2024-12-31": 1.25, "2025-12-31": 1.2, "2026-11-20": 1.15 });
const cache = { tipos_bce: tipos, precios_rnt: { "2024-12-31": 0.04, "2026-11-21": 0.05 }, precios_pol: {},
  ajustes_usuario: { c2: { coste_eur: 300 } }, contratos_aprendidos: {}, paises_inmuebles: { Casa: "US" } };
sb.__regs = regs;
sb.__cache = cache;
const A = vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" }; state.cache = __cache; state.registros = __regs;
  (() => {
    const res = fiCalcular(__regs, __cache, state.config, { hoy: "2026-11-21", diaReal: "2026-11-22", descargaIncompleta: false });
    const filas = totFilas(res, __regs, __cache);
    return { filas, csv: totCsv(filas), informes: res.informes, resumen: res.resumen };
  })()`, sb);
const filas = A.filas, k = porClave(filas);
const lineas = A.csv.split("\n");
assert("cabecera exacta y una línea por fila, acabado en salto", lineas[0] === "fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo" &&
  lineas.length === filas.length + 2 && lineas.at(-1) === "", lineas.slice(0, 2));
const fechas = [...new Set(filas.map(f => f.fecha_corte))];
assert("fechas de corte: cada 31/12 y el día de los datos", JSON.stringify(fechas) === JSON.stringify(["2024-12-31", "2025-12-31", "2026-11-21"]), fechas);
assert("todos los conceptos en cada fecha", fechas.every(d => CONCEPTOS.every(c => k.has(d + "|" + c + "|"))));
assert("una sola fila por (fecha, concepto, inmueble)", k.size === filas.length);
const inmueblesDe = d => filas.filter(f => f.fecha_corte === d && f.concepto === "inmueble_coste_compra").map(f => f.inmueble);
assert("los de inmueble, solo los que tienen tokens a esa fecha", JSON.stringify(inmueblesDe("2024-12-31")) === JSON.stringify(["Calle Mayor, 1", "Casa"]) &&
  JSON.stringify(inmueblesDe("2025-12-31")) === JSON.stringify(["Calle Mayor, 1", "Casa", "Nuevo 7"]), [inmueblesDe("2024-12-31"), inmueblesDe("2025-12-31")]);
const v = (d, c, i = "") => k.get(d + "|" + c + "|" + i);
const r2 = x => Math.round(x * 100) / 100;
for (const anio of [2024, 2025, 2026]) {
  const inf = A.informes[anio], d = inf.inversiones_activas.fecha_corte;
  const capital = inf.resumen.find(f => f.clave === "capital_final").importe;
  assert(anio + ": coste_compra = «Capital» del informe (" + capital + ")", v(d, "coste_compra").eur === capital, v(d, "coste_compra"));
  const b = A.resumen[anio];
  for (const [c, campo] of [["rendimientos_integros", "base_rendimientos_eur"], ["retenciones", "retenciones_eur"], ["recompensas_defi", "base_rewards_eur"],
    ["ganancias_ventas", "gp_positiva_eur"], ["perdidas_ventas", "gp_negativa_eur"], ["ganancias_base_general", "gp_base_general_eur"]]) {
    if (r2(v(d, c).eur) !== r2(b[campo] || 0)) assert(anio + ": " + c + " = 🧾", false, [v(d, c).eur, b[campo]]);
  }
  ok++;
  const otros = inf.inversiones_activas.otros.filas;
  const wallet = otros.filter(f => f.nombre === "USDT (wallet)" || f.nombre === "USDC").reduce((t, f) => t + f.cantidad, 0);
  assert(anio + ": saldo_wallet = filas del apartado II (" + wallet + " USD)", v(d, "saldo_wallet").usd === wallet);
  const rnt = otros.find(f => f.nombre === "RNT");
  assert(anio + ": rnt_coste_compra = la fila RNT del apartado II", v(d, "rnt_coste_compra").eur === rnt.coste_eur && rnt.coste_eur === 25);
}
assert("2025: ganancia de la venta de Casa (2 tokens: 260 $ a 1,25 menos su coste)", v("2025-12-31", "ganancias_ventas").eur > 0);
// La moneda de cada proyecto y el valor nominal.
const casa25 = v("2025-12-31", "inmueble_valor_nominal", "Casa");
assert("Casa (en $): 3 tokens = 300 $, a € con el BCE del 31/12/2025 (1,2)", casa25.usd === 300 && r2(casa25.eur) === 250 && casa25.completo, casa25);
assert("Casa: su coste en $ (todo pagado en USDT)", v("2025-12-31", "inmueble_coste_compra", "Casa").usd === 300);
const calle25 = v("2025-12-31", "inmueble_valor_nominal", "Calle Mayor, 1");
assert("Calle Mayor (en €): 300 €, sin importe en $", calle25.eur === 300 && calle25.usd === null && calle25.completo, calle25);
assert("Calle Mayor: su coste sin importe en $ (proyecto en €)", v("2025-12-31", "inmueble_coste_compra", "Calle Mayor, 1").usd === null);
const n7 = v("2025-12-31", "inmueble_valor_nominal", "Nuevo 7"), n7c = v("2025-12-31", "inmueble_coste_compra", "Nuevo 7");
assert("Nuevo 7 (coste supuesto): cifra (la moneda en que se pagó, €) y «no»", n7.eur === 300 && !n7.completo && n7c.eur === 300 && !n7c.completo, [n7, n7c]);
assert("2025: los dos totales que incluyen Nuevo 7, con cifra y «no»", !v("2025-12-31", "coste_compra").completo && !v("2025-12-31", "valor_nominal").completo &&
  r2(v("2025-12-31", "valor_nominal").eur) === 850);
// Las filas de inmueble suman su total donde todo va con «si».
const suman = (d, c, ci) => r2(filas.filter(f => f.fecha_corte === d && f.concepto === ci).reduce((t, f) => t + r2(f.eur), 0)) === r2(v(d, c).eur);
assert("2024 (todo «si»): las filas de inmueble suman coste y valor nominal", v("2024-12-31", "coste_compra").completo && v("2024-12-31", "valor_nominal").completo &&
  suman("2024-12-31", "coste_compra", "inmueble_coste_compra") && suman("2024-12-31", "valor_nominal", "inmueble_valor_nominal"));
// RNT: con precio del día, su valor; sin él, vacío y «no».
const rnt24 = v("2024-12-31", "rnt_valor"), rnt25 = v("2025-12-31", "rnt_valor");
assert("RNT a 31/12/2024: 500 × 0,04 $ = 20 $, 16 € (BCE 1,25), «si»", r2(rnt24.usd) === 20 && r2(rnt24.eur) === 16 && rnt24.completo, rnt24);
assert("RNT a 31/12/2025 sin precio de ese día: vacío y «no»", rnt25.eur === null && rnt25.usd === null && !rnt25.completo, rnt25);
// Sin vault configurado: no se sabe.
assert("sin vault configurado: saldo_vault vacío y «no»", v("2024-12-31", "saldo_vault").eur === null && !v("2024-12-31", "saldo_vault").completo);
// «A revisar» en 2026: todas las filas de esa fecha con «no»; las de antes, no.
assert("con algo «A revisar» hasta el 21/11/2026: todas sus filas con «no»", filas.filter(f => f.fecha_corte === "2026-11-21").every(f => !f.completo));
assert("y las de 2024 (antes de esa compra), con «si» las que se saben", v("2024-12-31", "retenciones").completo && v("2024-12-31", "saldo_wallet").completo);
// El país.
assert("país: «US» en las filas de Casa, vacío en las demás y en los totales", filas.every(f => f.pais === (f.inmueble === "Casa" ? "US" : "")));
assert("el nombre con coma va entre comillas en el texto", A.csv.includes('2024-12-31,inmueble_coste_compra,"Calle Mayor, 1",,300.00,,si'));
assert("un 0 va como 0.00", A.csv.includes("2024-12-31,recompensas_defi,,,0.00,,si"));

/* ---------------------------------------------------------------- B */
console.log("== B. Con un cálculo escrito a mano ==");
function calculo({ filasInm, vault, otros, tiposB, preciosB = {}, registrosB = [], revisar = false }) {
  sb.__r = {
    informes: { 2025: { inversiones_activas: { fecha_corte: "2025-12-31", inmuebles: { filas: filasInm, subtotal_eur: filasInm.reduce((t, f) => t + (f.coste_eur || 0), 0) },
      vault, otros: { filas: otros } } } },
    registros: revisar ? [{ revisar: true, fecha: "2025-11-01 10:00:00" }] : [],
    resumen: { 2025: {} },
    nombres: new Map(filasInm.map(f => [f.activo, f.nombre])),
  };
  sb.__c = { tipos_bce: tiposB, precios_rnt: preciosB, ajustes_usuario: {} };
  sb.__regsB = registrosB;
  return porClave(vm.runInContext("totFilas(__r, __regsB, __c)", sb));
}
const fila = (activo, nombre, cantidad, coste_eur, extra = {}) => Object.assign({ activo, nombre, cantidad, coste_eur, coste_usd: null }, extra);
const compraCasa = (contrato, cantidad) => reg("b" + contrato.slice(2, 4) + cantidad, "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", contrato, cantidad,
  { inmueble: "Casa", via_compra: "ONCHAIN", importe_usdt: 100 * cantidad });
const vaultOk = { saldo_usd: 12, saldo_eur: 10 };
const B1 = calculo({
  filasInm: [fila("0xviejo", "Casa", 2, 160, { coste_usd: 200 }), fila("0xnuevo", "Casa", 3, 240, { coste_usd: 300 }), fila("0xraro", "Raro", 4, 400)],
  vault: vaultOk, otros: [fila("USDT", "USDT (wallet)", 60, 50), fila("USDC", "USDC", 12, 10), fila("USDT", "USDT (aportado a pools de liquidez)", 999, 1),
    fila("RNT", "RNT", 100, null)],
  tiposB: { "2024-02-01": 1.25, "2025-12-30": 1.2 }, registrosB: [compraCasa("0xviejo", 5)],
});
const casaB = [...B1.values()].filter(f => f.inmueble === "Casa");
assert("canje: los dos contratos de Casa en una fila por concepto (5 tokens)", casaB.length === 2 && B1.get("2025-12-31|inmueble_valor_nominal|Casa").usd === 500 &&
  B1.get("2025-12-31|inmueble_coste_compra|Casa").eur === 400 && B1.get("2025-12-31|inmueble_coste_compra|Casa").usd === 500, casaB);
const raro = B1.get("2025-12-31|inmueble_valor_nominal|Raro");
assert("tokens sin ninguna compra: valor nominal vacío y «no»", raro.eur === null && !raro.completo && B1.get("2025-12-31|inmueble_coste_compra|Raro").completo, raro);
assert("y el valor nominal total, vacío y «no»", B1.get("2025-12-31|valor_nominal|").eur === null && !B1.get("2025-12-31|valor_nominal|").completo);
assert("tipo del BCE del día anterior (dentro de 4 días): 500 $ / 1,2", r2(B1.get("2025-12-31|inmueble_valor_nominal|Casa").eur) === 416.67);
assert("wallet: USDT de la wallet + USDC, sin lo de los pools (72 $)", B1.get("2025-12-31|saldo_wallet|").usd === 72 && r2(B1.get("2025-12-31|saldo_wallet|").eur) === 60);
assert("vault: del apartado II", B1.get("2025-12-31|saldo_vault|").usd === 12 && B1.get("2025-12-31|saldo_vault|").eur === 10 && B1.get("2025-12-31|saldo_vault|").completo);
assert("RNT con tokens y sin precio del día: vacío y «no»", B1.get("2025-12-31|rnt_valor|").eur === null && !B1.get("2025-12-31|rnt_valor|").completo);
assert("compra de RNT sin precio (coste null): rnt_coste_compra vacío y «no»", B1.get("2025-12-31|rnt_coste_compra|").eur === null &&
  !B1.get("2025-12-31|rnt_coste_compra|").completo);
const B2 = calculo({ filasInm: [fila("0xviejo", "Casa", 5, 400, { coste_usd: 500, coste_usd_parcial: true })],
  vault: { saldo_usd: -3, saldo_eur: -2.5, usdt_sin_coste: 4 }, otros: [fila("USDT", "USDT (wallet)", 60, 50)],
  tiposB: { "2024-02-01": 1.25, "2025-12-26": 1.2 }, registrosB: [compraCasa("0xviejo", 5)] });
assert("sin tipo del BCE en los 4 días: lo que nace en $ vacío y «no»", B2.get("2025-12-31|inmueble_valor_nominal|Casa").eur === null &&
  B2.get("2025-12-31|inmueble_valor_nominal|Casa").usd === 500 && !B2.get("2025-12-31|inmueble_valor_nominal|Casa").completo &&
  B2.get("2025-12-31|saldo_wallet|").eur === null && !B2.get("2025-12-31|saldo_wallet|").completo);
assert("coste en $ parcial: el coste en $ vacío", B2.get("2025-12-31|inmueble_coste_compra|Casa").usd === null);
assert("vault negativo: «no»", !B2.get("2025-12-31|saldo_vault|").completo);
const B3 = calculo({ filasInm: [], vault: vaultOk, otros: [fila("USDT", "USDT (wallet)", 60, 50)], tiposB: { "2025-12-31": 1.2 } });
assert("sin inmuebles ni RNT: totales a 0 con «si»", B3.get("2025-12-31|coste_compra|").eur === 0 && B3.get("2025-12-31|coste_compra|").completo &&
  B3.get("2025-12-31|rnt_valor|").eur === 0 && B3.get("2025-12-31|rnt_valor|").completo);
const B4 = calculo({ filasInm: [], vault: { ...vaultOk, usdt_sin_coste: 4 }, otros: [fila("USDT", "USDT (wallet)", 60, 50)], tiposB: { "2025-12-31": 1.2 } });
assert("USDT del vault sin coste (vault.usdt_sin_coste): saldo_wallet con «no»", !B4.get("2025-12-31|saldo_wallet|").completo && B4.get("2025-12-31|saldo_vault|").completo);
const B5 = calculo({ filasInm: [], vault: vaultOk, otros: [], tiposB: { "2025-12-31": 1.2 }, revisar: true });
assert("«A revisar» antes del corte: todas las filas con «no»", [...B5.values()].every(f => !f.completo));
assert("importes: dos decimales, -0 como 0.00, vacío si no se sabe", vm.runInContext("[totImporte(-0.001), totImporte(-3.456), totImporte(null), totImporte(1234.5)].join('|')", sb) ===
  "0.00|-3.46||1234.50");
assert("nombre del archivo: reentrack-totales_AAAA-MM-DD.csv", vm.runInContext("totNombreArchivo(new Date(2026, 10, 22, 10))", sb) === "reentrack-totales_2026-11-22.csv");

/* ---------------------------------------------------------------- C */
console.log("== C. El país ==");
assert("dos letras, en mayúsculas; vacío vale; lo demás no", JSON.stringify(vm.runInContext("['us', ' ES ', '', 'USA', 'U1', 'é'].map(totLeerPais)", sb)) ===
  JSON.stringify(["US", "ES", "", null, null, null]));
assert("mal escrito a mano en tu archivo: no vale", vm.runInContext(`[paisInmueble("A", { paises_inmuebles: { A: "usa" } }), paisInmueble("A", { paises_inmuebles: "US" }),
  paisInmueble("toString", { paises_inmuebles: {} }), paisInmueble("A", null)].join("|")`, sb) === "|||");
const C = vm.runInContext(`(() => {
  const c = { paises_inmuebles: { Casa: "US" } };
  totPonerPais(c, "Piso", "ES"); totPonerPais(c, "Casa", "");
  const copia = exArmarCopia({ cache: c, config: {}, incluirDatos: false, ahora: new Date() });
  const conTodo = Object.assign(cacheVacia(), { paises_inmuebles: { Piso: "ES" } });
  asegurarEstructuraCache(conTodo);
  return { c: c.paises_inmuebles, copia: copia.paises_inmuebles, tras: conTodo.paises_inmuebles, con: nombreConPais("Piso", c), sin: nombreConPais("Casa", c) };
})()`, sb);
assert("se apunta y se borra en tu archivo (paises_inmuebles)", JSON.stringify(C.c) === '{"Piso":"ES"}', C.c);
assert("va en la copia (también sin «Tus datos») y se conserva al abrirla", JSON.stringify(C.copia) === '{"Piso":"ES"}' && JSON.stringify(C.tras) === '{"Piso":"ES"}', C);
assert("junto al nombre: «Piso (ES)»; sin país, el nombre tal cual", C.con === "Piso (ES)" && C.sin === "Casa");
const nombres = vm.runInContext("totNombresInmuebles(__regs, __cache)", sb);
assert("la lista de 🚀: los inmuebles de tus datos, también los vendidos", JSON.stringify(nombres) === JSON.stringify(["Calle Mayor, 1", "Casa", "Nuevo 7"]), nombres);
// En el PDF, el Excel y 🧾, junto al nombre; sin país, todo igual.
const salidas = conPais => vm.runInContext(`(() => {
  __cache.paises_inmuebles = ${conPais ? '{ Casa: "US" }' : "{}"};
  const res = fiCalcular(__regs, __cache, state.config, { hoy: "2026-11-21", diaReal: "2026-11-22", descargaIncompleta: false });
  const ahora = new Date("2026-11-22T10:00:00Z");
  fiEstado.verTodos = true;
  return { pdf: JSON.stringify(pdfInversiones(res.informes[2025])),
    excel: (() => { const libro = excelLibro(res.registros, res.colas, res.resumen, __cache, state.config, res.informes, ahora, res.hasta, null, res);
      return JSON.stringify(libro.hojas.map(h => [h.nombre, [...h.filas].map(([n, cs]) => [n, [...cs]])])); })(),
    pantalla: fiHtmlHistorial(res, 2025, res.informes[2025], res.informes[2025]) };
})()`, sb);
const con = salidas(true), sin = salidas(false);
assert("PDF: «Casa (US)» en «Inversiones activas»", con.pdf.includes("Casa (US)"));
assert("Excel: «Casa (US)» (Renta, resumen del Historial y título de su tabla)", (con.excel.match(/Casa \(US\)/g) || []).length >= 3, (con.excel.match(/Casa \(US\)/g) || []).length);
assert("🧾: «Casa (US)» en el historial", con.pantalla.includes("Casa (US)"));
assert("sin país, el PDF, el Excel y 🧾 no cambian en nada más", con.pdf.replace(/ \(US\)/g, "") === sin.pdf &&
  con.excel.replace(/ \(US\)/g, "") === sin.excel && con.pantalla.replace(/ \(US\)/g, "") === sin.pantalla);

/* ---------------------------------------------------------------- D */
console.log("== D. Precio del RNT de cada fecha de corte ==");
const corte = (fechas, iso) => JSON.stringify(vm.runInContext(`fechasCortePrecioRnt(${JSON.stringify(fechas)}, Date.parse("${iso}"))`, sb));
assert("con RNT desde 2024: el 31/12/2025 y hoy (el 31/12/2024, de hace más de un año, no)", corte(["2024-05-01"], "2026-11-22T12:00:00Z") === '["2025-12-31","2026-11-22"]');
assert("sin RNT nunca, ninguna", corte([], "2026-11-22T12:00:00Z") === "[]");
assert("hoy en España aún sin empezar en UTC (00:30): no se pide", corte(["2025-01-05"], "2026-11-21T23:30:00Z") === '["2025-12-31"]',
  corte(["2025-01-05"], "2026-11-21T23:30:00Z"));

/* ---------------------------------------------------------------- E */
console.log("== E. Arreglos de la auditoría ==");
// Un cálculo a mano con varios años, avisos y resumen (como B, más libre).
function calculoE({ anios = { 2025: "2025-12-31" }, filasInm = [], otros = [], vault = vaultOk, tiposE = { "2025-12-31": 1.2 }, avisos = {},
  registrosMotor = [], resumen = {}, preciosE = {}, registrosE = [], nombres }) {
  const informes = {};
  for (const [a, corte] of Object.entries(anios)) {
    informes[a] = { avisos: avisos[a] || [], inversiones_activas: { fecha_corte: corte, vault, otros: { filas: otros },
      inmuebles: { filas: filasInm, subtotal_eur: filasInm.reduce((t, f) => t + (f.coste_eur || 0), 0) } } };
  }
  sb.__r = { informes, registros: registrosMotor, resumen, nombres: nombres || new Map(filasInm.map(f => [f.activo, f.nombre])) };
  sb.__c = { tipos_bce: tiposE, precios_rnt: preciosE, ajustes_usuario: {} };
  sb.__regsB = registrosE;
  return vm.runInContext("totFilas(__r, __regsB, __c)", sb);
}
const de = filasE => porClave(filasE);
// A2: coste en $ parcial en un proyecto en $ → «no»; en uno en €, el € está entero → «si».
const parcialUsd = de(calculoE({ filasInm: [fila("0xviejo", "Casa", 5, 400, { coste_usd: 500, coste_usd_parcial: true })], registrosE: [compraCasa("0xviejo", 5)] }));
assert("A2: coste en $ incompleto (proyecto en $): su fila y los totales de coste y valor nominal con «no»",
  !parcialUsd.get("2025-12-31|inmueble_coste_compra|Casa").completo && !parcialUsd.get("2025-12-31|inmueble_valor_nominal|Casa").completo &&
  !parcialUsd.get("2025-12-31|coste_compra|").completo && !parcialUsd.get("2025-12-31|valor_nominal|").completo &&
  parcialUsd.get("2025-12-31|coste_compra|").eur === 400);
const compraEur = reg("be1", "2024-03-01 10:00:00", "COMPRA", "COSTE_BASE", CALLE, 5, { inmueble: "Calle", via_compra: "BANCARIA", coste_eur: 500 });
const parcialEur = de(calculoE({ filasInm: [fila(CALLE, "Calle", 5, 500, { coste_usd: 100, coste_usd_parcial: true })], registrosE: [compraEur] }));
assert("A2: en un proyecto en € el coste en € está entero: «si»", parcialEur.get("2025-12-31|inmueble_coste_compra|Calle").completo &&
  parcialEur.get("2025-12-31|coste_compra|").completo);
// A3: un aviso «A revisar» del ejercicio (sin registro marcado) → todas las filas de esa fecha con «no»; los de otro año, no.
const conAviso = calculoE({ anios: { 2024: "2024-12-31", 2025: "2025-12-31" }, tiposE: { "2024-12-31": 1.25, "2025-12-31": 1.2 },
  avisos: { 2025: [{ fecha: null, tipo: "revisar", concepto: "Descarga de Etherscan", detalle: "" }, { fecha: null, tipo: "nota", concepto: "x" }] } });
assert("A3: un aviso «A revisar» del ejercicio: todas sus filas con «no», las del año anterior no",
  conAviso.filter(f => f.fecha_corte === "2025-12-31").every(f => !f.completo) &&
  conAviso.find(f => f.fecha_corte === "2024-12-31" && f.concepto === "retenciones").completo);
const soloNota = calculoE({ avisos: { 2025: [{ fecha: null, tipo: "nota", concepto: "Comisiones de red" }] } });
assert("A3: una nota (ℹ️) no cambia el «si»", soloNota.find(f => f.concepto === "retenciones").completo);
// A3 con el motor de verdad: la descarga a medias pone el aviso y el CSV lo sigue.
// Sin la compra «A revisar» de 2026: solo el aviso de la descarga.
sb.__regsOk = regs.filter(r => r.clave !== "c4");
const incompleta = vm.runInContext(`(() => { const __regs = __regsOk; const res = fiCalcular(__regs, __cache, state.config, { hoy: "2026-11-21", diaReal: "2026-11-22", descargaIncompleta: true });
  const ultimo = res.informes[fiAnios(res.informes).at(-1)];
  return { filas: totFilas(res, __regs, __cache), corte: ultimo.inversiones_activas.fecha_corte, sinMarcados: !res.registros.some(r => r.revisar),
    aviso: ultimo.avisos.some(a => a.tipo === "revisar" && /Etherscan/.test(a.concepto)) }; })()`, sb);
assert("A3 con el motor: sin nada «A revisar», la descarga de Etherscan a medias → el último ejercicio entero con «no»",
  incompleta.aviso && incompleta.sinMarcados && incompleta.filas.filter(f => f.fecha_corte === incompleta.corte).every(f => !f.completo),
  [incompleta.corte, incompleta.aviso, incompleta.sinMarcados]);
// A4: un ejercicio posterior a tus datos (fecha mal escrita): una sola vez cada fecha.
const futuro = calculoE({ anios: { 2025: "2025-12-31", 2062: "2025-12-31" }, resumen: { 2025: { retenciones_eur: 3 }, 2062: {} } });
const clavesF = futuro.map(f => f.fecha_corte + "|" + f.concepto + "|" + f.inmueble);
assert("A4: con un ejercicio 2062 del mismo corte, cada (fecha, concepto, inmueble) una vez, la del año de verdad",
  new Set(clavesF).size === clavesF.length && futuro.find(f => f.concepto === "retenciones").eur === 3);
// A4 con el motor: un rendimiento fechado en 2062.
const conFuturo = vm.runInContext(`(() => { const r = __regs.concat([Object.assign({}, __regs[4], { clave: "fut", fecha: "2062-03-10 10:00:00" })]);
  const res = fiCalcular(r, __cache, state.config, { hoy: "2026-11-21", diaReal: "2026-11-22", descargaIncompleta: false });
  return { anios: fiAnios(res.informes), filas: totFilas(res, r, __cache) }; })()`, sb);
const clavesM = conFuturo.filas.map(f => f.fecha_corte + "|" + f.concepto + "|" + f.inmueble);
assert("A4 con el motor: el informe 2062 no repite filas", conFuturo.anios.includes(2062) && new Set(clavesM).size === clavesM.length, conFuturo.anios);
// A5: un nombre que no es texto (cache a mano) no para el CSV.
const numerico = calculoE({ filasInm: [fila("0xa", 1234, 1, 100), fila("0xb", "Casa", 1, 100)] });
assert("A5: un inmueble de nombre 1234 junto a otro: el CSV sale", numerico.some(f => f.inmueble === 1234) && numerico.some(f => f.inmueble === "Casa"));
assert("A5: y la lista de 🚀 también", JSON.stringify(vm.runInContext("[5, 'b', 'A'].sort(totOrden)", sb)) === '[5,"A","b"]', vm.runInContext("[5, 'b', 'A'].sort(totOrden)", sb));
// A13: el mismo tipo del BCE que el vault del informe (uno mal escrito a mano no se salta).
const tipoRoto = de(calculoE({ filasInm: [fila("0xviejo", "Casa", 3, 240, { coste_usd: 300 })], registrosE: [compraCasa("0xviejo", 3)],
  otros: [fila("USDT", "USDT (wallet)", 12, 10)], tiposE: { "2025-12-30": 1.25, "2025-12-31": "1,2" } }));
assert("A13: con el tipo del 31/12 mal escrito, lo que nace en $ vacío, como el vault (no con el del 30/12)",
  tipoRoto.get("2025-12-31|inmueble_valor_nominal|Casa").eur === null && tipoRoto.get("2025-12-31|saldo_wallet|").eur === null);
assert("A13: la fecha del tipo es la del vault (rentaFechaTipoBce)", vm.runInContext(`[rentaFechaTipoBce({ tipos_bce: { "2025-12-27": 1.2 } }, "2025-12-31"),
  rentaFechaTipoBce({ tipos_bce: { "2025-12-26": 1.2 } }, "2025-12-31"), rentaFechaTipoBce({ tipos_bce: { "2025-12-31": 1.2, "x": 1 } }, "2025-12-31")].join("|")`, sb) ===
  "2025-12-27||2025-12-31");
// A14: «__proto__» como nombre: su moneda y su país.
const proto = de(calculoE({ filasInm: [fila("0xviejo", "__proto__", 2, 160, { coste_usd: 200 })],
  registrosE: [Object.assign(compraCasa("0xviejo", 2), { inmueble: "__proto__" })], nombres: new Map([["0xviejo", "__proto__"]]) }));
assert("A14: un inmueble «__proto__» tiene su moneda (valor nominal 200 $)", proto.get("2025-12-31|inmueble_valor_nominal|__proto__").usd === 200);
const protoPais = vm.runInContext(`(() => { const c = {}; totPonerPais(c, "__proto__", "US"); const a = paisInmueble("__proto__", c);
  const copia = JSON.parse(JSON.stringify(c)); totPonerPais(c, "__proto__", ""); return [a, paisInmueble("__proto__", copia), Object.keys(c.paises_inmuebles).length]; })()`, sb);
assert("A14: y guarda su país (también en la copia) y se borra", JSON.stringify(protoPais) === '["US","US",0]', protoPais);
// A11: solo letras de la A a la Z.
assert("A11: «ß», «ﬁ» o «ſs» no valen como país", JSON.stringify(vm.runInContext("['ß', 'ﬁ', 'ſs', 'Us'].map(totLeerPais)", sb)) === '[null,null,null,"US"]');
// A12: un nombre que una hoja de cálculo tomaría por fórmula.
sb.__celdas = ['=HYPERLINK("x","y")', "+1", "-2", "@a", 'Casa "Sol"', "Casa"];
assert("A12: =, +, -, @ al principio llevan ' delante; con comillas, dobladas",
  JSON.stringify(vm.runInContext("__celdas.map(totCelda)", sb)) ===
  JSON.stringify(['"\'=HYPERLINK(""x"",""y"")"', "'+1", "'-2", "'@a", '"Casa ""Sol"""', "Casa"]), vm.runInContext("__celdas.map(totCelda)", sb));
// A7 y A8: el precio pedido solo para el CSV.
const W8 = "0x" + "11".repeat(20);
const txRnt = iso => ({ timeStamp: String(Date.parse(iso) / 1000), contractAddress: RNT, from: "0x" + "77".repeat(20), to: W8, value: "1", hash: "0x" + "ab".repeat(32) });
const c8 = { transacciones: { wallet_tokens: [txRnt("2026-03-01T12:00:00Z")], vault_tokens: [] },
  precios_rnt: { "2026-03-01": 0.05, "2025-12-31": 0.04, "2026-11-20": 0.06, "2026-11-21": 0.07 }, precio_rnt_dia_corte: "2026-11-21" };
sb.__c8 = c8;
const solo = vm.runInContext(`["2026-03-01", "2025-12-31", "2026-11-21", "2026-11-20"].map(f => precioRntSoloCorte(__c8, f))`, sb);
assert("A7: solo para el CSV: un 31/12 o el día de tus datos sin movimiento; un día con movimiento o cualquier otro, no",
  JSON.stringify(solo) === "[false,true,true,false]", solo);
vm.runInContext(`podarPrecioCorteRnt(__c8, "2026-11-21")`, sb);
assert("A8: si el día de tus datos sigue siendo hoy, su precio se queda", "2026-11-21" in c8.precios_rnt);
c8.precio_rnt_dia_corte = "2026-11-21";
vm.runInContext(`podarPrecioCorteRnt(__c8, "2026-11-22")`, sb);
assert("A8: al día siguiente, el del día anterior se borra; los demás se quedan",
  !("2026-11-21" in c8.precios_rnt) && JSON.stringify(Object.keys(c8.precios_rnt).sort()) === '["2025-12-31","2026-03-01","2026-11-20"]' && !("precio_rnt_dia_corte" in c8));
c8.precio_rnt_dia_corte = "2026-03-01";
vm.runInContext(`podarPrecioCorteRnt(__c8, "2026-11-22")`, sb);
assert("A8: un día con movimiento de RNT nunca se borra", "2026-03-01" in c8.precios_rnt);

/* ---------------------------------------------------- F (huecos en los tests) */
console.log("== F. Más casos límite ==");
// «A revisar» el mismo día del corte cuenta; uno sin fecha, en todas; uno después, no.
const rev = fecha => calculoE({ registrosMotor: [{ revisar: true, fecha }] }).every(f => !f.completo);
assert("«A revisar» el mismo 31/12: todas con «no»; sin fecha: también; el 01/01 siguiente: no",
  rev("2025-12-31 23:00:00") && rev(null) && rev("") && !rev("2026-01-01 10:00:00"));
// El valor nominal total es la suma de las filas ya en céntimos.
const tercios = de(calculoE({ filasInm: ["0xa1", "0xa2", "0xa3"].map((a, i) => fila(a, "P" + i, 1, 80, { coste_usd: 100 })),
  registrosE: ["0xa1", "0xa2", "0xa3"].map((a, i) => Object.assign(compraCasa(a, 1), { clave: "t" + i, inmueble: "P" + i })), tiposE: { "2025-12-31": 3 } }));
assert("valor nominal: 3 × 33,33 € = 99,99 € (la suma de las filas, no 100)", r2(tercios.get("2025-12-31|valor_nominal|").eur) === 99.99,
  tercios.get("2025-12-31|valor_nominal|"));
// La moneda del proyecto con una compra sin importe o sin tipo del BCE.
const sinImporte = de(calculoE({ filasInm: [fila(CASA, "Casa", 2, 160)], registrosE: [reg("si1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 2,
  { inmueble: "Casa", via_compra: "ONCHAIN" })] }));
const sinTipo = de(calculoE({ filasInm: [fila(CASA, "Casa", 2, 160)], registrosE: [reg("st1", "2019-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 2,
  { inmueble: "Casa", via_compra: "ONCHAIN", importe_usdt: 200 })] }));
assert("moneda con una compra sin importe en USDT: en $ (valor nominal 200 $)", sinImporte.get("2025-12-31|inmueble_valor_nominal|Casa").usd === 200,
  sinImporte.get("2025-12-31|inmueble_valor_nominal|Casa"));
assert("moneda con una compra sin tipo del BCE: en $ (valor nominal 200 $)", sinTipo.get("2025-12-31|inmueble_valor_nominal|Casa").usd === 200,
  sinTipo.get("2025-12-31|inmueble_valor_nominal|Casa"));
// Un precio del RNT que no es un número no vale; la base general, su campo.
const raros = de(calculoE({ otros: [fila("RNT", "RNT", 100, 5)], preciosE: { "2025-12-31": "x" }, resumen: { 2025: { gp_base_general_eur: 7, gp_positiva_eur: 1 } } }));
assert("precio del RNT que no es un número: vacío y «no»", raros.get("2025-12-31|rnt_valor|").eur === null && !raros.get("2025-12-31|rnt_valor|").completo);
assert("ganancias_base_general y ganancias_ventas, cada una de su campo", raros.get("2025-12-31|ganancias_base_general|").eur === 7 &&
  raros.get("2025-12-31|ganancias_ventas|").eur === 1);
sb.__r = { informes: { 2025: { avisos: [], inversiones_activas: { fecha_corte: "2025-12-31", inmuebles: null, vault: null, otros: null } } }, registros: [], resumen: {}, nombres: new Map() };
const sinCierre = porClave(vm.runInContext("totFilas(__r, [], { tipos_bce: { '2025-12-31': 1.2 } })", sb));
assert("sin el apartado II del informe: coste, valor nominal, vault, wallet y RNT vacíos y «no»",
  ["coste_compra", "valor_nominal", "saldo_wallet", "rnt_valor", "rnt_coste_compra", "saldo_vault"].every(c => sinCierre.get("2025-12-31|" + c + "|").eur === null &&
    !sinCierre.get("2025-12-31|" + c + "|").completo));
// El tope del BCE: 4 días antes vale, 5 no; uno más si el corte es posterior a lo cubierto (como el vault).
const tope = tipos => de(calculoE({ otros: [fila("USDT", "USDT (wallet)", 12, 10)], tiposE: tipos })).get("2025-12-31|saldo_wallet|").eur;
assert("BCE: 4 días antes vale, 5 no", r2(tope({ "2025-12-27": 1.2 })) === 10 && tope({ "2025-12-26": 1.2 }) === null);
sb.__cob = { tipos_bce: { "2025-12-26": 1.2 }, bce_cobertura: { inicio: "2020-01-01", fin: "2025-12-26" } };
assert("BCE: con el corte después de lo descargado, el mismo tope que el vault",
  vm.runInContext(`rentaFechaTipoBce(__cob, "2025-12-31")`, sb) === (vm.runInContext(`diasMaxSinTipoBce("2025-12-31", __cob)`, sb) >= 5 ? "2025-12-26" : null));
// Las fechas de corte del RNT: desde el primer año con RNT, solo el último año.
assert("fechas de corte del RNT: con RNT desde 2023 y hoy el 10/01/2027, solo el 31/12/2026 y hoy",
  corte(["2024-06-01", "2023-05-01"], "2027-01-10T12:00:00Z") === '["2026-12-31","2027-01-10"]');

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
