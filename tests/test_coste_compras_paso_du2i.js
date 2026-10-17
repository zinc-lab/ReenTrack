/* Test del coste de las compras externas, por compra
 * (🔍 Revisión).
 *
 * Bajo prueba (Reental-SPA/js/20-coste-compras.js):
 * - cbComprasBancarias / cbFilas: solo las compras bancarias, una por fila
 *   y las más recientes primero (como 📒 Transacciones).
 * - cbEstadoCoste: libre, propio (de este editor), decision (Revisión) y
 *   ajeno (otro ajuste: nunca se pisa).
 * - cbCambios: solo lo escrito que cambia un coste editable (o el de una compra).
 * - cbAjustesConCostes: el ajuste { coste_eur, nota con su marca }; volver
 *   a 100 €/token lo borra; en una decisión solo cambia coste_eur; lanza
 *   con un importe no válido o un ajuste ajeno.
 * - aplicarAjustesUsuario (js/14): la clasificación toma el coste nuevo y,
 *   borrado el ajuste, vuelve exactamente a lo de antes.
 * - cbHtmlEditor: lo pagado como texto con «✏️ Editar»; abierta (algo en el
 *   borrador), la casilla con «Guardar» y «Cancelar»; el
 *   € por token y la ⓘ del ajuste ajeno, sin «Editar».
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_coste_compras_paso_du2i.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js",
                 "18-transacciones.js", "20-coste-compras.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const FECHA = "2026-10-02T10:00:00.000Z";
const NOTA_MOTOR = "compra externa detectada (sin stablecoin en el hash): 100 EUR/token, verificar";
function compra(clave, inmueble, fecha, cantidad, extra = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave.padEnd(64, "0"), contrato: "0x" + "a1".repeat(20),
    simbolo: "RTK", cantidad, categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA",
    inmueble, coste_eur: cantidad * 100, importe_usdt: null, nota: NOTA_MOTOR, revisar: false }, extra);
}
const A = compra("a", "Cáceres 8", "2024-09-17 09:14:52", 4);
const B = compra("b", "Cáceres 8", "2024-09-17 09:47:36", 4);
const C = compra("c", "Fondo 1", "2025-06-03 18:05:27", 12);
const D = compra("d", "Toledo 1", "2024-02-26 11:42:08", 6);
const onchain = compra("e", "Toledo 1", "2024-04-01 10:00:00", 3, { via_compra: "ONCHAIN", coste_eur: null, importe_usdt: 300 });
const deposito = compra("f", null, "2024-04-02 10:00:00", 3, { categoria: "DEPOSITO", via_compra: null });
const registros = [C, onchain, B, A, D, deposito];
const json = x => JSON.stringify(x);

console.log("== 1. Solo las compras bancarias, las más recientes primero ==");
const lista = S.cbComprasBancarias(registros).map(r => r.clave);
assert("las 4 bancarias (ni la on-chain ni el depósito), las más recientes primero",
  json(lista) === json(["c", "b", "a", "d"]), lista);
const filas = S.cbFilas(registros, { A: { nota: "x" } });
assert("una fila por compra, con su estado",
  json(filas.map(f => [f.reg.clave, f.estado])) === json([["c", "libre"], ["b", "libre"], ["a", "ajeno"], ["d", "libre"]]),
  filas.map(f => [f.reg.clave, f.estado]));
assert("sin registros: ninguna fila", S.cbFilas([], {}).length === 0 && S.cbFilas(null, {}).length === 0);

console.log("== 2. Estado de cada compra ==");
const ajusteManual = { coste_eur: 320, nota: "ajuste del usuario (2026-02-19): 320 EUR por 4 tokens" };
const decision = { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 900, revisar: false,
  nota: "Decidido por ti en Revisión (2026-03-04): compra bancaria con su coste real" };
const propio = { coste_eur: 450, nota: "Coste puesto por ti (2026-03-04)" };
const aj = { A: ajusteManual, c: decision, D: propio };
assert("sin ajuste: libre", S.cbEstadoCoste(B, aj) === "libre");
assert("ajuste escrito a mano (clave en mayúsculas): ajeno", S.cbEstadoCoste(A, aj) === "ajeno");
assert("decidida en Revisión como compra bancaria: decision", S.cbEstadoCoste(C, aj) === "decision");
assert("de este editor: propio", S.cbEstadoCoste(D, aj) === "propio");
assert("un «Dejar» de Revisión sobre una compra: decision (y se le pone el coste)",
  S.cbEstadoCoste(B, { b: { revisar: false, nota: "Decidido por ti en Revisión (2026-10-01): se deja como compra" } }) === "decision" &&
  S.cbAjustesConCostes({ b: { revisar: false, nota: "Decidido por ti en Revisión (2026-10-01): se deja como compra" } },
    [{ clave: "b", valor: 300 }], [B], 100, FECHA).b.coste_eur === 300);
assert("con la marca pero con otro campo: ajeno (no se toca)",
  S.cbEstadoCoste(B, { b: { coste_eur: 1, revisar: false, nota: "Coste puesto por ti (2026-10-01)" } }) === "ajeno");
assert("«Mandado a revisar» por ti: como una decisión, solo se le pone el coste (ARREGLOS-1b, R2)",
  S.cbEstadoCoste(B, { b: { revisar: true, nota: "Mandado a revisar por ti (2026-10-01)" } }) === "decision");

console.log("== 3. Lo que cambia ==");
const regsAj = [A, B, C, Object.assign({}, D, { coste_eur: 450 })];
let cambios = S.cbCambios(regsAj, aj, { b: "250", a: "100", d: "450,00", c: "1.000,5", zz: "3" });
assert("solo los editables que cambian (b y c; no a, que es ajena, ni d, igual, ni una clave que no existe)",
  json(cambios) === json([{ clave: "c", valor: 1000.5 }, { clave: "b", valor: 250 }]), cambios);
assert("vacío o ilegible cuenta como cambio (para avisar al guardar)",
  S.cbCambios([B], {}, { b: "" }).length === 1 && Number.isNaN(S.cbCambios([B], {}, { b: "abc" })[0].valor));
assert("con soloClave, solo el de esa compra",
  JSON.stringify(S.cbCambios([B, C], {}, { b: "250", c: "300" }, "c")) === JSON.stringify([{ clave: "c", valor: 300 }]));
assert("sin borrador, nada", S.cbCambios(regsAj, aj, {}).length === 0 && S.cbCambios(regsAj, aj, null).length === 0);
assert("escribir lo mismo con otro formato no es un cambio («450» = 450,00 tuyos)", S.cbCambios([D], { d: propio }, { d: "450" }).length === 0);
// En una sin coste tuyo, guardar el de por defecto lo confirma.
assert("sin coste tuyo, el de por defecto sí es un cambio (lo confirma)", S.cbCambios([B], {}, { b: "400" }).length === 1);

console.log("== 4. Los ajustes nuevos ==");
const previos = { A: ajusteManual, c: decision, d: propio, x: { nota: "otro" } };
const copiaPrevios = json(previos);
const nuevos = S.cbAjustesConCostes(previos, [{ clave: "b", valor: 250 }, { clave: "c", valor: 1000.5 }],
  [A, B, C, D], 100, FECHA);
assert("libre -> { coste_eur, nota con la marca y el día }",
  json(nuevos.b) === json({ coste_eur: 250, nota: "Coste puesto por ti (2026-10-02)" }), nuevos.b);
assert("decisión de Revisión: solo cambia coste_eur (sigue siendo una decisión)",
  json(nuevos.c) === json(Object.assign({}, decision, { coste_eur: 1000.5 })) && S.ccEsAjusteDecision(nuevos.c), nuevos.c);
assert("lo demás, intacto (el ajeno, el propio y otro ajuste)",
  json(nuevos.A) === json(ajusteManual) && json(nuevos.d) === json(propio) && json(nuevos.x) === json({ nota: "otro" }));
assert("no muta los ajustes recibidos", json(previos) === copiaPrevios);
const otraVez = S.cbAjustesConCostes(nuevos, [{ clave: "b", valor: 300 }], [A, B, C, D], 100, "2026-10-03T00:00:00Z");
assert("propio -> se reescribe con el día nuevo",
  json(otraVez.b) === json({ coste_eur: 300, nota: "Coste puesto por ti (2026-10-03)" }), otraVez.b);
const vuelta = S.cbAjustesConCostes(previos, [{ clave: "d", valor: 600 }], [A, B, C, D], 100, FECHA);
assert("propio vuelto a 100 €/token (6 × 100 = 600): se guarda como tuyo (SUPUESTO-1 A1)", vuelta.d.coste_eur === 600, vuelta.d);
const igual = S.cbAjustesConCostes({}, [{ clave: "b", valor: 400.001 }], [B], 100, FECHA);
assert("libre con lo de por defecto: se guarda como tuyo (SUPUESTO-1 A1)", igual.b.coste_eur === 400, igual);
assert("se redondea a céntimos", S.cbAjustesConCostes({}, [{ clave: "b", valor: 123.456 }], [B], 100, FECHA).b.coste_eur === 123.46);
const lanza = (cambio, ajustes) => { try { S.cbAjustesConCostes(ajustes || {}, [cambio], [A, B, C, D], 100, FECHA); return null; } catch (e) { return e.message; } };
assert("0, negativo, vacío o ilegible: «Escribe un importe mayor que 0.»",
  [0, -5, NaN].every(v => lanza({ clave: "b", valor: v }) === "Escribe un importe mayor que 0."));
assert("ajeno: lanza y no lo pisa", lanza({ clave: "a", valor: 300 }, previos) === "Ya tiene un ajuste manual: se cambia en «✏️ Ajustes en JSON».");
assert("una compra que no es bancaria: lanza", lanza({ clave: "e", valor: 300 }) === "Compra no encontrada.");

console.log("== 5. La clasificación toma el coste (aplicarAjustesUsuario de js/14) ==");
const libro = () => [compra("b", "Cáceres 8", "2024-09-17 09:47:36", 4)];
const conAjuste = libro();
S.aplicarAjustesUsuario(conAjuste, { ajustes_usuario: S.cbAjustesConCostes({}, [{ clave: "b", valor: 250 }], libro(), 100, FECHA) });
assert("coste_eur = 250 y la marca detrás de la nota del motor",
  conAjuste[0].coste_eur === 250 && conAjuste[0].nota === NOTA_MOTOR + "; Coste puesto por ti (2026-10-02)", conAjuste[0]);
const sinAjuste = libro();
S.aplicarAjustesUsuario(sinAjuste, { ajustes_usuario: S.cbAjustesConCostes({ b: propio }, [{ clave: "b", valor: 400 }], libro(), 100, FECHA) });
assert("vuelto a 100 €/token: 400 y la marca de tuyo (SUPUESTO-1 A1)",
  sinAjuste[0].coste_eur === 400 && sinAjuste[0].nota.endsWith("Coste puesto por ti (2026-10-02)"), sinAjuste[0]);

console.log("== 6. HTML ==");
const cerrado = S.cbHtmlEditor(S.cbFilas([A, B, C], { A: ajusteManual }), {}, 100);
assert("cerrado: ninguna casilla; lo pagado como texto y «✏️ Editar» en las 2 editables",
  !cerrado.includes("cb-valor") && (cerrado.match(/data-cb="editar"/g) || []).length === 2 &&
  cerrado.includes('<span class="cb-fijo">400,00 €</span>') && !cerrado.includes('data-cb="guardar"'));
assert("el ajeno, sin «Editar» y con su ⓘ",
  cerrado.includes("Ajuste manual: se cambia en «✏️ Ajustes en JSON».") &&
  !/data-cb="editar" data-clave="a"/.test(cerrado));
const html = S.cbHtmlEditor(S.cbFilas([A, B, C], { A: ajusteManual }), { b: "300", a: "1" }, 100);
assert("abierta (algo en el borrador): su casilla con «Guardar» y «Cancelar»; el ajeno no se abre",
  (html.match(/class="cb-valor"/g) || []).length === 1 && /class="cb-valor" data-clave="b"/.test(html) &&
  /data-cb="guardar" data-clave="b">Guardar</.test(html) && /data-cb="cancelar" data-clave="b">Cancelar</.test(html) &&
  (html.match(/data-cb="editar"/g) || []).length === 1);
assert("lo escrito se conserva y su € por token, en su casilla (300 / 4 = 75,00)",
  html.includes('value="300"') && html.includes('class="cb-precio" data-clave="b" value="75,00"'));
assert("todo en una fila: el inmueble en su columna, sin cabeceras de grupo",
  html.includes("<th>Inmueble / <br>Token</th>") && html.includes("<td>Fondo 1</td>") && !html.includes("cb-grupo") &&
  (html.match(/<tr class="cb-fila/g) || []).length === 3 && html.includes('<tr class="cb-fila abierta" data-clave="b">'));
// «100 €/token por defecto» lo dice la explicación del apartado (index.html), no se repite aquí.
assert("sin «Por defecto…» repetido, sin «Guardar» general", !html.includes("Por defecto") &&
  !html.includes("cbGuardar"));
assert("abierta y sin cambio, su «Guardar» desactivado",
  /data-cb="guardar" data-clave="d" disabled>/.test(S.cbHtmlEditor(S.cbFilas([D], { d: propio }), { d: "450,00" }, 100)));
assert("SUPUESTO-1 A1: sin coste tuyo, «Guardar» activo aunque no cambie (lo confirma)",
  /data-cb="guardar" data-clave="b">/.test(S.cbHtmlEditor(S.cbFilas([B], {}), { b: "400,00" }, 100)));
// Desde el retoque de UI (15/10/2026) la fila no dice «por defecto»: lo dice la explicación del apartado.
assert("SUPUESTO-1 A2: la fila solo con el importe (sin «por defecto»); la marca sigue en la fila (supuesto)",
  cerrado.includes('400,00 €</span>') && !cerrado.includes("por defecto") && S.cbFilas([B], {}, 100)[0].supuesto === true &&
  !S.cbHtmlEditor(S.cbFilas([D], { d: propio }), {}, 100).includes("por defecto"));
assert("sin compras: «Sin compras externas.»",
  S.cbHtmlEditor([], {}, 100) === '<p class="help">Sin compras externas.</p>');
assert("€ por token sin tokens o sin coste: «—»", S.cbTextoPorToken(100, 0) === "—" && S.cbTextoPorToken(NaN, 5) === "—");
assert("escapa el nombre del inmueble", S.cbHtmlEditor(S.cbFilas([compra("z", "<b>x</b>", "2024-01-01", 1)], {}), {}, 100).includes("&lt;b&gt;x&lt;/b&gt;"));

console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
process.exit(fallos ? 1 : 0);
