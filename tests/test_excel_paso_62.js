/* Test unitario del Excel de la app (js/26): lo que la paridad de cifras
 * no ve (paridad_excel_paso_62 compara numeros, fechas y formatos con las
 * cifras de referencia).
 *
 * - Un importe sin dato en el informe sale «—», a la derecha.
 * - Una cantidad entera lleva el formato de entero (si no, Excel enseña
 *   «10,»); una con decimales, NaN o un texto, no.
 * - Sin datos: las hojas fijas, sin «Fiscal AAAA» ni Revisión, y el libro
 *   se escribe.
 * - Un texto de los datos que empieza por «=» no es una formula.
 * - El Excel no cambia lo que recibe (tampoco las colas, un Map) y dos
 *   veces dan el mismo libro; «Generado el» es la hora de aquí.
 * - Lo que ningún caso grabado recorre: la venta de un token canjeado,
 *   dos tipos del BCE el mismo día y el del vault, una recompensa en USDC
 *   sin símbolo y un ingreso sin fecha.
 * - Los textos como los dice la app.
 * - La receta de la cabecera de js/26 pide los informes como 🧾 Fiscal
 *   (js/23, fiCalcular): con el día de los datos y si la descarga falló.
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/test_excel_paso_62.js
 */
"use strict";
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_EXCEL } = require("./paridad_excel_paso_62.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const vm = require("vm");
const sb = sandbox(MODULOS_EXCEL, HORA_APP);
sb.EXCEL_FMT = vm.runInContext("EXCEL_FMT", sb);   // las const no cuelgan del global
const celda = (hoja, f, c) => (hoja.filas.get(f) || new Map()).get(c);

// ---------- «—» y formatos ----------
let hoja = sb.xlsxHoja(sb.xlsxLibro(), "X");
sb.excelFilaRenta(hoja, 1, ["Total", null, 5], [null, sb.EXCEL_FMT.NUM, sb.EXCEL_FMT.NUM]);
assert("un importe sin dato sale «—», a la derecha y sin formato",
  celda(hoja, 1, 2).valor === "—" && celda(hoja, 1, 2).estilo.horizontal === "right" &&
  !celda(hoja, 1, 2).estilo.formato, celda(hoja, 1, 2));
assert("un importe con dato lleva su formato", celda(hoja, 1, 3).valor === 5 &&
  celda(hoja, 1, 3).estilo.formato === sb.EXCEL_FMT.NUM && !celda(hoja, 1, 3).estilo.horizontal);
sb.excelFilaRenta(hoja, 2, ["A", null, "B"]);
assert("un valor sin dato y sin formato deja la celda vacía", !celda(hoja, 2, 2));
sb.excelFilaRenta(hoja, 3, ["Grupo", null], [], { relleno: "DDEBF7" });
assert("con relleno, la celda sin dato lleva el relleno", celda(hoja, 3, 2) &&
  celda(hoja, 3, 2).valor === null && celda(hoja, 3, 2).estilo.relleno === "DDEBF7");
const formatoDe = v => { sb.excelCelda(hoja, 9, 1, v, { formato: sb.EXCEL_FMT.TOKENS }); return celda(hoja, 9, 1).estilo.formato; };
assert("10 tokens: formato de entero", formatoDe(10) === sb.EXCEL_FMT.ENTERO);
assert("10,0000001 tokens: de entero (se ve con 6 decimales)", formatoDe(10.0000001) === sb.EXCEL_FMT.ENTERO);
assert("2,5 tokens: formato de tokens", formatoDe(2.5) === sb.EXCEL_FMT.TOKENS);
assert("NaN y un texto: formato de tokens", formatoDe(NaN) === sb.EXCEL_FMT.TOKENS && formatoDe("10") === sb.EXCEL_FMT.TOKENS);
assert("un formato de euros no cambia con un entero",
  (sb.excelCelda(hoja, 9, 2, 10, { formato: sb.EXCEL_FMT.EUR }), celda(hoja, 9, 2).estilo.formato === sb.EXCEL_FMT.EUR));

// ---------- Sin datos ----------
let libro = sb.excelLibro([], {}, {}, {}, {});
assert("sin datos: las hojas fijas, sin Renta ni Revisión",
  JSON.stringify(libro.hojas.map(h => h.nombre)) ===
  JSON.stringify(["Resumen", "Transacciones", "Ingresos", "Tipos de cambio BCE"]),
  libro.hojas.map(h => h.nombre));
let bytes = null;
try { bytes = sb.xlsxBytes(libro); } catch (e) { bytes = e.message; }
assert("sin datos: el libro se escribe", bytes instanceof Uint8Array || (bytes && bytes.length > 0), bytes);
const resumen = libro.hojas[0];
assert("sin datos: el dinero invertido es 0", [...resumen.filas.values()].some(f =>
  [...f.values()].some(c => c.valor === 0 && c.estilo.formato === sb.EXCEL_FMT.EUR)));

// ---------- Un registro raro y que no cambia lo que recibe ----------
const registros = [{
  clave: "a", fecha: "2025-03-01 00:30:00", categoria: "MOVIMIENTO", subcategoria: null, revisar: true,
  inmueble: null, token: "=SUMA(A1)", simbolo: null, contrato: "0xabc", periodo_fiscal: null,
  cantidad: 3, importe_usdt: null, importe_eur: null, hash: "0x1", nota: "=1+1", origen: null,
}];
const antes = JSON.stringify(registros);
libro = sb.excelLibro(registros, {}, sb.resumenFiscalAnual(structuredClone(registros)), {}, {});
assert("el Excel no cambia los registros", JSON.stringify(registros) === antes);
const tx = libro.hojas.find(h => h.nombre === "Transacciones");
assert("la fecha del registro, sin la hora y sin pasar al día de antes",
  celda(tx, 2, 1).valor.toISOString() === "2025-03-01T00:00:00.000Z", celda(tx, 2, 1).valor);
assert("un token «=SUMA(A1)» se guarda como texto", celda(tx, 2, 4).valor === "=SUMA(A1)");
const rev = libro.hojas.find(h => h.nombre === "Revisión");
assert("con algo por revisar sale la hoja Revisión, con la cantidad si no hay importe",
  rev && celda(rev, 2, 4).valor === 3 && celda(rev, 2, 4).estilo.formato === sb.EXCEL_FMT.ENTERO);
assert("la categoría de un registro por revisar va en rojo claro", celda(tx, 2, 2).estilo.relleno === "FFCCCC");
try { bytes = sb.xlsxBytes(libro); } catch (e) { bytes = e.message; }
assert("con textos que empiezan por «=» el libro se escribe", bytes && bytes.length > 0, bytes);

// ---------- Los textos del motor y del informe, como los dice la app ----------
const nota = "pendiente: 4,00 USDT del reparto de X; se declaran igual en el ano del reparto; " +
  "cobrado el 2026-07-08 (12,00) USDT";
const rendimiento = { clave: "r", fecha: "2026-07-08 10:00:00", categoria: "RENDIMIENTO",
  subcategoria: "RCM_RECLAMADO", revisar: true, inmueble: "Casa", contrato: "0xc", hash: "0x2",
  periodo_fiscal: "Casa #7/2026", cantidad: 12, importe_usdt: 12, integro_usdt: 10, retencion_usdt: 1.9,
  base_imponible_eur: 9, retencion_eur: 1.7, nota };
libro = sb.excelLibro([rendimiento], {}, {}, {}, {}, {});
const notaTx = celda(libro.hojas.find(h => h.nombre === "Transacciones"), 2, 15).valor;
assert("A3: la nota sin la cifra de «pendiente», con fechas dd/mm/aaaa y USD como moneda",
  !/pendiente|ano del|USDT/.test(notaTx) && /08\/07\/2026/.test(notaTx) && /\(12,00\) USD/.test(notaTx) &&
  /8,10 USD netos/.test(notaTx), notaTx);
assert("A3: la hoja Revisión dice lo mismo",
  celda(libro.hojas.find(h => h.nombre === "Revisión"), 2, 5).valor === notaTx);
hoja = sb.xlsxHoja(sb.xlsxLibro(), "R");
sb.excelTextoRenta(hoja, 1, "Datos hasta el 2025-12-31; vuelve a ejecutar el programa");
assert("A3: los textos largos del informe, también",
  celda(hoja, 1, 1).valor === "Datos hasta el 31/12/2025; vuelve a sincronizar", celda(hoja, 1, 1).valor);

// ---------- Las palabras de la app, y sin la columna para rellenar ----------
const fuente = require("fs").readFileSync(require("path").join(__dirname, "..", "Reental-SPA", "js", "26-excel.js"), "utf8");
for (const [que, prohibido] of [["A4: «Fecha de transmisión»", "Fecha de transmisión"],
  ["A4: «Ganancias sin venta» (la Renta dice «sin transmisión»)", "Ganancias sin venta"],
  ["A5: «Dinero invertido» (el 💼 del 📊 es otra cifra)", "Dinero invertido"],
  ["A6: la columna «Categoría que le darías»", "Categoría que le darías"]]) {
  assert(que + " no sale en el Excel", !fuente.includes('"' + prohibido) && !fuente.includes("«" + prohibido));
}
assert("A6: la hoja Revisión tiene 5 columnas y su filtro también",
  !celda(rev, 1, 6) && rev.filtro && rev.filtro.col2 === 5, rev.filtro);

// ---------- Una venta de un token canjeado (ningún caso grabado la tiene) ----------
const vacia = { a_declarar_en: "X", filas: [], total: {} };
const detalle = { rendimientos: vacia, recompensas: vacia, permutas: vacia, ventas_inmuebles: {
  a_declarar_en: "X", total: { valor_adquisicion_usd: 100, valor_adquisicion_eur: 90, valor_transmision_usd: 120,
    valor_transmision_eur: 110, gp_eur: 20 },
  filas: [{ activo: "Casa", tipo_activo: "Inmueble", fecha_adquisicion: "2024-03-15", adquirido_por_canje: true,
    fecha_transmision: "2025-06-01", cantidad: 1, valor_adquisicion_usd: 100, valor_adquisicion_eur: 90,
    valor_transmision_usd: 120, valor_transmision_eur: 110, gp_eur: 20 }] } };
hoja = sb.xlsxHoja(sb.xlsxLibro(), "R");
const finDetalle = sb.excelRentaDetalle(hoja, 1, { detalle });
const textos = [...hoja.filas.values()].flatMap(f => [...f.values()].map(c => c.valor)).filter(v => typeof v === "string");
const filaCanje = [...hoja.filas.entries()].find(([, f]) => f.get(1) && f.get(1).valor === "Casa");
assert("canje: la fecha de la compra original como texto con «*»",
  filaCanje && filaCanje[1].get(3).valor === "15/03/2024 *", filaCanje && filaCanje[1].get(3));
assert("canje: la venta, como fecha", filaCanje && filaCanje[1].get(4).valor.toISOString().startsWith("2025-06-01"));
assert("canje: con la nota que explica el «*»", textos.includes(vm.runInContext("NOTA_CANJE_INFORME", sb)) &&
  finDetalle > filaCanje[0]);

// ---------- «Generado el»: la hora de este ordenador ----------
const ahora = new Date(2026, 0, 1, 0, 30);   // a las 00:30, la hora de aquí (en UTC, aún el 31/12)
libro = sb.excelLibro([], {}, {}, {}, {}, {}, ahora);
const generado = celda(libro.hojas[0], 3, 2);
assert("«Generado el» es la hora local (xlsxAhora), no la UTC",
  generado.valor.getTime() === sb.xlsxAhora(ahora).getTime() && generado.valor.getUTCHours() === 0 &&
  generado.valor.getUTCMinutes() === 30 && generado.estilo.formato === sb.EXCEL_FMT.FECHA_HORA, generado);

// ---------- Llamarlo dos veces da lo mismo y no cambia las colas ----------
const colas = new Map([["RNT", [{ cantidad: 5, coste_unitario_eur: 0.1, fecha: "2025-01-01", origen: "x" }]]]);
const huellaColas = () => JSON.stringify([...colas]);
const antesColas = huellaColas();
const uno = sb.xlsxBytes(sb.excelLibro([], colas, {}, {}, {}, {}, ahora), ahora);
const dos = sb.xlsxBytes(sb.excelLibro([], colas, {}, {}, {}, {}, ahora), ahora);
assert("dos veces seguidas, el mismo libro", Buffer.compare(Buffer.from(uno), Buffer.from(dos)) === 0);
assert("las colas (Map) no cambian", huellaColas() === antesColas);

// ---------- Ramas que ningún caso grabado recorre ----------
const tipos = sb.excelTiposBceUsados(
  [{ fecha: "2025-03-03 10:00:00", tipo_bce: 1.08 }, { fecha: "2025-03-03 18:00:00", tipo_bce: 1.09 },
    { fecha: "2025-03-03 19:00:00", tipo_bce: 1.08 }],
  { 2025: { inversiones_activas: { vault: { fecha_tipo_bce: "2025-12-31" } } } }, { tipos_bce: { "2025-12-31": 1.04 } });
assert("Tipos BCE: dos tipos el mismo día, dos filas (sin repetir) y el del vault",
  JSON.stringify(tipos) === JSON.stringify([["2025-03-03", 1.08], ["2025-03-03", 1.09], ["2025-12-31", 1.04]]), tipos);
const usdc = vm.runInContext("USDC", sb);
libro = sb.excelLibro([
  { clave: "a", fecha: "2025-02-01 10:00:00", categoria: "REWARD", subcategoria: "RCM_STAKING", contrato: usdc,
    simbolo: null, origen: "0xo", base_imponible_eur: 5, retencion_eur: null, hash: "0x1" },
  { clave: "b", fecha: null, categoria: "REWARD", subcategoria: "RCM_STAKING", contrato: usdc,
    simbolo: "USDC", origen: "0xo", base_imponible_eur: 7, retencion_eur: 1, hash: "0x2" }], {}, {}, {}, {}, {});
const ing = libro.hojas.find(h => h.nombre === "Ingresos");
const valores = [...ing.filas.entries()].map(([f, m]) => [f, [...m.values()].map(c => c.valor)]);
const porTexto = t => (valores.find(([, v]) => v[0] === t) || [, []])[1];
assert("Ingresos: una recompensa en USDC sin símbolo es USDC (la sin fecha va al final)",
  celda(ing, 2, 5).valor === "USDC" && celda(ing, 2, 6).valor === 5, celda(ing, 2, 5));
assert("Ingresos: lo que no tiene fecha no tiene fila de año, pero suma en el total",
  !valores.some(([, v]) => v[0] === null && typeof v[1] === "number" && v.length === 5) &&
  porTexto("Recompensas DeFi")[1] === 12 && porTexto("Retenciones (aparte, sin restar)")[1] === 1, valores);

// ---------- La receta de la cabecera, como la de 🧾 Fiscal ----------
const fs = require("fs");
const path = require("path");
const leer = f => fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "js", f), "utf8");
// Los argumentos de excelLibro: los de la receta y los del botón de 📤.
const argumentosDe = texto => {
  const m = /excelLibro\(([^;]*?\br)\)/.exec(texto);
  return m ? m[1].replace("new Date()", "ahora").replace(/\s+/g, " ").trim() : null;
};
const cabecera = leer("26-excel.js").split("*/")[0];
const receta = argumentosDe(cabecera), boton = argumentosDe(leer("24-exportar.js"));
assert("A2: la receta y el botón de 📤 pasan el cálculo de 🧾 (fiCalcular) entero",
  /= fiCalcular\(/.test(cabecera) && /fiResultado\(\)/.test(leer("24-exportar.js")) &&
  receta && receta === boton, { receta, boton });

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
