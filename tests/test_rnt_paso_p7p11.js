/* Test de P7 y P11: el RNT que te llega (regalo, recompensa DeFi o compra
 * bancaria pagada en €) y los importes con punto solo para los miles.
 *
 * Bajo prueba:
 * - ccLeerImporte / ccAvisoImporte (js/15): «1.250» = 1250, «1.250,75»;
 *   un punto que no es de miles («1250.75», «1.5») no vale y pide la coma.
 *
 * - 💶 (js/20) y 📒 (js/18) con una compra bancaria de RNT: «RNT» en la
 *   columna del inmueble (sin rellenar `inmueble`), € por token con 4
 *   decimales, sin «por defecto»; la nota de 100 €/token de 📒 solo si hay
 *   compras bancarias de inmuebles.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_rnt_paso_p7p11.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "20-coste-compras.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

console.log("== 1. Importes: el punto solo para los miles ==");
const L = S.ccLeerImporte;
const buenos = [["1.250", 1250], ["1.250,75", 1250.75], ["1250,75", 1250.75], ["1250", 1250], ["0,037", 0.037],
  ["1.234.567,8", 1234567.8], [" 1.800 ", 1800], ["9,5", 9.5], [12.5, 12.5]];
for (const [t, v] of buenos) assert("«" + t + "» = " + v, L(t) === v, L(t));
const malos = ["1250.75", "1.5", "0.037", "1.50", "1.5000", "12.345.6", "1,250.75", ".5", "1234.567", "1250.250", "0.500"];
const COMA = vm.runInContext("CC_AVISO_COMA", S);
for (const t of malos) assert("«" + t + "» no vale y pide la coma", Number.isNaN(L(t)) && S.ccAvisoImporte(t) === COMA, [L(t), S.ccAvisoImporte(t)]);
assert("sin punto, el aviso de siempre", S.ccAvisoImporte("abc") === "Escribe un importe mayor que 0." &&
  S.ccAvisoImporte("") === "Escribe un importe mayor que 0.");
assert("la cola de una decisión antigua («coste 1.234,56 EUR») se sigue leyendo",
  S.ccLeerColaAntes("x [antes: mandado a revisar (2026-03-01), coste 1.234,56 EUR: m]", "revisar").coste === 1234.56);

console.log("== 2. 💶 y 📒 con una compra bancaria de RNT ==");
const RNT = vm.runInContext("RNT", S);
const W = "0x" + "11".repeat(20), REPARTO = "0x" + "cd".repeat(20), INM = "0x" + "a1".repeat(20);
function reg(clave, extra = {}) {
  return Object.assign({ clave, fecha: "2025-01-10 10:00:00", hash: "0x" + "ab".repeat(32), contrato: RNT, token: "RNT",
    simbolo: "RNT", cantidad: 1000, categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", inmueble: null,
    importe_usdt: null, coste_eur: 37, origen: REPARTO, destino: W, fuente: "ONCHAIN", nota: "", revisar: false }, extra);
}
const rnt = reg("r1");
const casa = reg("c1", { contrato: INM, inmueble: "Casa", cantidad: 3, coste_eur: 300 });
const ajR = { r1: { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 37, revisar: false,
  nota: "Decidido por ti en Revisión (2025-12-01): compra de RNT" } };
const [fila] = S.cbFilas([rnt], ajR, 100);
const html = S.cbHtmlFila(fila, {});
assert("💶: «RNT» en la columna del inmueble y 0,0370 € por token", html.includes("<td>RNT</td>") && html.includes("0,0370 €"), html);
assert("💶: sin «por defecto» y con su coste", !fila.supuesto && fila.coste === 37 && !html.includes("por defecto"), fila);
assert("💶: la de un inmueble, como siempre (2 decimales)", S.cbHtmlFila(S.cbFilas([casa], {}, 100)[0], {}).includes("100,00 €"));
assert("📒: sin la nota de 100 €/token si solo hay compras de RNT", S.txHtmlNotaCoste([rnt], 100) === "");
assert("📒: con una de un inmueble, la nota sigue", S.txHtmlNotaCoste([rnt, casa], 100).includes("100 €"));
assert("el registro no se rellena con un inmueble", rnt.inmueble === null);

console.log("== 3. P7: botones en el RNT que te llega y «¿también los otros?» ==");
const OTRA = "0x" + "ee".repeat(20);
const ctx = { propias: new Set([W]), inmuebles: new Set([INM]) };
const FECHA = "2026-10-14T10:00:00.000Z";
function ent(clave, fecha, cantidad, extra = {}) {
  return reg(clave, Object.assign({ fecha, cantidad, categoria: "REVISAR", subcategoria: "PENDIENTE", via_compra: null,
    coste_eur: null, revisar: true, hash: "0x" + clave.padEnd(64, "0") }, extra));
}
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id);
const e1 = ent("e1", "2024-02-12 10:00:00", 5000), e2 = ent("e2", "2024-03-05 10:00:00", 2000);
assert("RNT a revisar: regalo, recompensa, compra bancaria, neutro y spam",
  JSON.stringify(ids(e1)) === JSON.stringify(["regalo", "recompensa", "compra-rnt", "neutro", "spam"]), ids(e1));
assert("los tres abren diálogo y explican qué son (title)",
  S.ccOpcionesDecision(e1, ctx).filter(o => o.dialogo).every(o => o.ayuda && !o.pide));
const neutroStaking = ent("n1", "2024-04-01 10:00:00", 30, { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" });
assert("neutro mandado a revisar desde 📒: ✔, regalo, recompensa y compra",
  JSON.stringify(ids(neutroStaking)) === JSON.stringify(["dejar", "regalo", "recompensa", "compra-rnt", "spam"]), ids(neutroStaking));
const premioConocido = ent("p1", "2024-04-01 10:00:00", 3, { categoria: "REWARD", subcategoria: "RCM_REWARD" });
assert("un premio de un contrato conocido: sin «Recompensa DeFi» repetida ni compra",
  !ids(premioConocido).includes("recompensa") && !ids(premioConocido).includes("compra-rnt") && ids(premioConocido).includes("regalo"), ids(premioConocido));
assert("RNT que sale: nada de esto", !ids(ent("s1", "2024-01-01 10:00:00", 5, { origen: W, destino: OTRA })).some(i => ["regalo", "compra-rnt"].includes(i)));
assert("USDT que llega: nada de esto", !ids(ent("u1", "2024-01-01 10:00:00", 5, { contrato: vm.runInContext("USDT", S) })).includes("regalo"));
const decidir = (r, id) => S.ccAjustesConDecision({}, r, id, null, FECHA)[r.clave];
assert("regalo: REWARD/GPP_REGALO", JSON.stringify(decidir(e1, "regalo")) === JSON.stringify({ categoria: "REWARD", subcategoria: "GPP_REGALO",
  revisar: false, nota: "Decidido por ti en Revisión (2026-10-14): regalo (airdrop)" }), decidir(e1, "regalo"));
assert("recompensa: REWARD/RCM_REWARD", decidir(e1, "recompensa").subcategoria === "RCM_REWARD" && S.ccEsAjusteDecision(decidir(e1, "recompensa")));
assert("A12: «Ya decididos» los nombra como 📒", S.ccResumenDecision(decidir(e1, "regalo")) === S.txOperacion({ categoria: "REWARD", subcategoria: "GPP_REGALO" }) &&
  S.ccResumenDecision(decidir(e1, "recompensa")) === "Recompensa DeFi");

// La lista desde esa dirección: e1 libre, e2 decidido neutro (con un «mandado a revisar» antes),
// e3 con un ajuste ajeno, e4 de otra dirección, e5 mandado a revisar.
const e3 = ent("e3", "2024-05-05 10:00:00", 1000), e4 = ent("e4", "2024-02-01 10:00:00", 12, { origen: OTRA });
const e5 = ent("e5", "2024-06-05 10:00:00", 500, { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" });
const revisarAntes = { revisar: true, nota: "Mandado a revisar por ti (2026-01-02): mirar" };
let aj = S.ccAjustesConDecision({ e2: revisarAntes }, e2, "neutro", null, FECHA);
aj.e3 = { categoria: "MOVIMIENTO", nota: "a mano" };
aj.e5 = { revisar: true, nota: "Mandado a revisar por ti (2026-01-03)" };
const regs = [e5, e4, e3, e2, e1];
const lista = S.ccRntDesde(regs, e1, aj, ctx);
assert("la lista: solo desde esa dirección, por fecha y con su estado",
  JSON.stringify(lista.map(x => x.reg.clave + ":" + x.estado)) === JSON.stringify(["e1:libre", "e2:decidido", "e3:ajeno", "e5:propio"]),
  lista.map(x => x.reg.clave + ":" + x.estado));
const todos = S.ccAjustesConDecisiones(aj, lista.filter(x => ["libre", "propio", "decidido"].includes(x.estado)).map(x => [x.reg, "regalo", null]), FECHA);
assert("todos: regalo en e1, e2 y e5; el ajeno no se toca",
  ["e1", "e2", "e5"].every(k => todos[k].subcategoria === "GPP_REGALO") && JSON.stringify(todos.e3) === JSON.stringify(aj.e3), todos);
assert("e2 sustituye su neutro y guarda el «mandado a revisar» de antes",
  todos.e2.nota.includes("[antes: mandado a revisar (2026-01-02): mirar]"), todos.e2.nota);
const deshecho = S.ccAjustesSinDecision(todos, "e2", FECHA);
assert("deshacer e2 lo devuelve a revisar con su motivo", JSON.stringify(deshecho.e2) === JSON.stringify(revisarAntes), deshecho.e2);
assert("e5 lleva su «mandado a revisar» en la cola", todos.e5.nota.includes("[antes: mandado a revisar (2026-01-03)]"), todos.e5.nota);
assert("ninguna dirección se guarda (ni roles ni otros campos)", Object.values(todos).every(a => !JSON.stringify(a).includes(REPARTO)));
let errAjeno = "";
try { S.ccAjustesConDecisiones(aj, [[e3, "regalo", null]], FECHA); } catch (e) { errAjeno = e.message; }
assert("un ajeno a la fuerza: lanza", errAjeno.includes("Ajustes en JSON"), errAjeno);
const html7 = S.ccHtmlDialogoRnt(e1, "regalo", lista, null);
assert("diálogo P7: título con los otros 2, «Solo este» y «Todos (3)»",
  html7.includes("¿También los otros 2 movimientos de RNT de esta dirección?") && html7.includes("Solo este") && html7.includes("Todos (3)"), html7);
assert("diálogo P7: el ajeno, tachado; el neutro decidido, con su nombre",
  /cc-rnt-fuera"[^>]*><td>05\/05\/2024/.test(html7) && html7.includes("Movimiento neutro"), html7);
// Aplicado por el clasificador: el regalo deja de estar a revisar.
const copia = regs.map(r => Object.assign({}, r));
S.aplicarAjustesUsuario(copia, { ajustes_usuario: todos }, true);
const c1 = copia.find(r => r.clave === "e1");
assert("clasificado: e1 REWARD/GPP_REGALO y sin revisar", c1.categoria === "REWARD" && c1.subcategoria === "GPP_REGALO" && !c1.revisar, c1);

console.log("== 4. P11: compra bancaria de RNT ==");
const T = S.ccRepartoCompraRnt;
const L1 = [{ reg: ent("a", "2024-01-01 10:00:00", 1000), estado: "libre" }];
assert("entrega única de todo: el coste es lo pagado", JSON.stringify(T(L1, 29, 1000).map(([r, c]) => c)) === "[29]");
const L3 = [ent("a", "2024-01-01 10:00:00", 1), ent("b", "2024-02-01 10:00:00", 1), ent("c", "2024-03-01 10:00:00", 1)]
  .map(r => ({ reg: r, estado: "libre" }));
const c3 = T(L3, 100, 3).map(([, c]) => c);
assert("tres entregas completas: 33,33 + 33,33 + 33,34 (la última, el resto)", JSON.stringify(c3) === "[33.33,33.33,33.34]", c3);
const cMitad = T(L3.slice(0, 2), 100, 3).map(([, c]) => c);
assert("vesting a medias: cada una su parte, sin resto", JSON.stringify(cMitad) === "[33.33,33.33]", cMitad);
let errTotal = "";
try { T(L3, 100, 2); } catch (e) { errTotal = e.message; }
assert("el total no puede ser menos de lo llegado", errTotal.includes("Ya te han llegado 3 RNT"), errTotal);
const conAjeno = T([...L3.slice(0, 2), { reg: L3[2].reg, estado: "ajeno" }], 100, 2).map(([, c]) => c);
assert("el ajeno no cuenta ni para lo llegado", JSON.stringify(conAjeno) === "[50,50]", conAjeno);
// La ya comprada se queda; la nueva, con su parte y el resto.
const prev = { reg: Object.assign(ent("a", "2024-01-01 10:00:00", 2), { coste_eur: 66.67 }), estado: "compra" };
const cNueva = T([prev, { reg: L3[2].reg, estado: "libre" }], 100, 3);
assert("entrega posterior: solo la nueva, con el resto (33,33)", cNueva.length === 1 && cNueva[0][1] === 33.33 && cNueva[0][0].clave === "c", cNueva);
assert("una parte que redondea a 0 no se queda en 0", T([{ reg: ent("t", "2024-01-01 10:00:00", 0.0001), estado: "libre" }], 1, 1000)[0][1] > 0);
const dec = S.ccAjustesConDecision({}, e1, "compra-rnt", { coste: 150, pagado: 1200, total: 40000 }, FECHA).e1;
assert("el ajuste: COMPRA BANCARIA con su coste y la nota con lo pagado y el total",
  dec.categoria === "COMPRA" && dec.via_compra === "BANCARIA" && dec.coste_eur === 150 &&
  dec.nota === "Decidido por ti en Revisión (2026-10-14): compra de RNT: 1.200,00 EUR por 40.000 RNT" && S.ccEsAjusteDecision(dec), dec);
assert("la nota se vuelve a leer", JSON.stringify(S.ccLeerCompraRnt(dec.nota)) === JSON.stringify({ pagado: 1200, total: 40000 }));
assert("con decimales («27.431,58 RNT»)", S.ccLeerCompraRnt(S.ccTextoCompraRnt(1200, 27431.58)).total === 27431.58);
assert("el precio a la vista", S.ccTextoPrecioRnt(1200, 40000) === "1.200,00 € ÷ 40.000 RNT = 0,0300 €/RNT", S.ccTextoPrecioRnt(1200, 40000));
assert("estado «compra» para la ya comprada (P7 no la toca)", S.ccEstadoRnt(S.ccBuscarAjuste({ e1: dec }, "e1")) === "compra");
assert("«Ya decididos»: Compra externa con su coste", S.ccResumenDecision(dec) === "Compra externa · 150,00 €");

// La reclamación: claim(index, cuenta, asignación, prueba) desde tu wallet al contrato.
const pal = h => h.padStart(64, "0");
const claim = (cuenta, cantidadWei, ts, extra = {}) => Object.assign({ to: REPARTO, from: W, isError: "0", timeStamp: String(ts),
  input: "0x2e7ba6ef" + pal("7") + pal(cuenta.slice(2)) + pal(BigInt(cantidadWei).toString(16)) + pal("80") + pal("0") }, extra);
const wei = n => (BigInt(n) * 10n ** 18n).toString();
const cache = { transacciones: { wallet_normales: [claim(W, wei(40000), 1707730200), claim(W, wei(39000), 1707730300),
  claim(OTRA, wei(99999), 1707730400), claim(W, wei(70000), 1707730500, { isError: "1" }),
  claim(W, wei(80000), 1707730600, { to: OTRA }), { to: REPARTO, input: "0xdeadbeef" }] } };
const leida = S.ccAsignacionReclamada(cache, REPARTO, ctx.propias);
assert("lee la mayor asignación de tus reclamaciones a esa dirección (no de otra cuenta, fallida ni a otro contrato)",
  leida && leida.total === 40000 && leida.fecha === "2024-02-12 10:30:00", leida);
assert("sin reclamaciones, null", S.ccAsignacionReclamada({}, REPARTO, ctx.propias) === null);
const listaP = [{ reg: ent("a", "2024-01-01 10:00:00", 5000), estado: "libre" }, { reg: ent("b", "2024-02-01 10:00:00", 15), estado: "ajeno" }];
const prop = S.ccPropuestaCompraRnt(listaP, cache, ctx.propias);
assert("propuesta: la asignación leída y su fecha", prop.de === "reclamacion" && prop.total === 40000 && prop.pagado === null, prop);
assert("propuesta sin reclamación: lo llegado (sin el ajeno)",
  JSON.stringify(S.ccPropuestaCompraRnt(listaP, {}, ctx.propias)) === JSON.stringify({ pagado: null, total: 5000, de: "llegado" }));
const listaPrev = [{ reg: e1, estado: "compra", ajuste: dec }, { reg: e2, estado: "libre", ajuste: null }];
const propPrev = S.ccPropuestaCompraRnt(listaPrev, Object.assign({ ajustes_usuario: { e1: dec } }, cache), ctx.propias);
assert("con una compra anterior desde ahí: su precio (lo pagado y el total)", propPrev.de === "precio" &&
  propPrev.pagado === 1200 && propPrev.total === 40000, propPrev);
const html11 = S.ccHtmlDialogoRnt(listaP[0].reg, "compra-rnt", listaP, prop);
assert("diálogo P11: las dos casillas, la nota de la reclamación y «Guardar»",
  html11.includes("Pagado en total") && html11.includes("RNT en total (aunque falten por llegar)") &&
  html11.includes('value="40.000"') && html11.includes("leídos de tu reclamación del 12/02/2024") && html11.includes("cc-rnt-guardar"), html11);
assert("diálogo P11: el ajeno, tachado", /cc-rnt-fuera"[^>]*><td>01\/02\/2024/.test(html11), html11);

console.log("== 5. Auditoría (A2…A12) ==");
// A2: lo que la app ya clasificó desde esa dirección (lo que vuelve del staking, un swap) no cambia.
{
  const premio = ent("k1", "2024-03-01 10:00:00", 7);
  const principal = ent("k2", "2024-03-01 10:00:00", 2000, { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false });
  const swap = ent("k3", "2024-04-01 10:00:00", 300, { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "ONCHAIN",
    importe_usdt: 30, revisar: false });
  const l = S.ccRntDesde([premio, principal, swap], premio, {}, ctx);
  assert("A2: lo de la app sale como «app»", JSON.stringify(l.map(x => x.estado)) === JSON.stringify(["libre", "app", "app"]), l.map(x => x.estado));
  const h = S.ccHtmlDialogoRnt(premio, "recompensa", l, null);
  assert("A2: «Recompensa DeFi» se guarda sin preguntar: el principal no es «otro» que cambie",
    !l.some(x => x.reg.clave !== "k1" && vm.runInContext("CC_RNT_CUENTA", S).includes(x.estado)));
  assert("A2: tachados en la lista", (h.match(/cc-rnt-fuera/g) || []).length === 2, h);
  const c = S.ccRepartoCompraRnt(l, 70, 7);
  assert("A2: la compra solo reparte lo que está a revisar (7 RNT, 70 €)", c.length === 1 && c[0][0].clave === "k1" && c[0][1] === 70, c);
  assert("A2: lo llegado no cuenta lo de la app", S.ccRntLlegado(l) === 7);
}

// A5: el total que trae la casilla (6 decimales) se puede guardar tal cual, y cuenta como «ha llegado todo».
{
  for (const n of [15.0000004, 15.1234564, 300.0000004]) {
    const l = [{ reg: ent("q", "2024-01-01 10:00:00", n), estado: "libre", ajuste: null }];
    const total = S.ccLeerImporte(S.cantidadEs(n));
    let c = null, err = "";
    try { c = S.ccRepartoCompraRnt(l, 10, total); } catch (e) { err = e.message; }
    assert("A5: " + n + " RNT con el total de la casilla («" + S.cantidadEs(n) + "»): se guarda con todo lo pagado", c && c[0][1] === 10, err || c);
  }
  let err = "";
  try { S.ccRepartoCompraRnt([{ reg: ent("q", "2024-01-01 10:00:00", 15), estado: "libre", ajuste: null }], 10, 14.99); } catch (e) { err = e.message; }
  assert("A5: un total de verdad menor sigue sin valer", err.startsWith("Ya te han llegado 15 RNT"), err);
}

// A6: una segunda compra desde la misma dirección (otros importes) no arrastra la primera.
{
  const notaDe = (pagado, total) => ({ nota: "Decidido por ti en Revisión (2026-01-01): " + S.ccTextoCompraRnt(pagado, total) });
  const ya = { reg: Object.assign(ent("y1", "2024-01-01 10:00:00", 2000), { coste_eur: 60 }), estado: "compra", ajuste: notaDe(60, 2000) };
  const nueva = { reg: ent("y2", "2024-06-01 10:00:00", 1000), estado: "libre", ajuste: null };
  const c = S.ccRepartoCompraRnt([ya, nueva], 100, 1000);
  assert("A6: otra compra (100 € por 1.000 RNT): la nueva, a su precio y con todo lo pagado", c.length === 1 && c[0][1] === 100, c);
  const misma = S.ccRepartoCompraRnt([ya, { reg: ent("y3", "2024-06-01 10:00:00", 1000), estado: "libre", ajuste: null }], 90, 3000);
  assert("A6: con lo pagado y el total de la nota (90 € por 3.000): la misma compra, la nueva se lleva el resto (30 €)",
    misma.length === 1 && misma[0][1] === 30, misma);
  let err = "";
  try { S.ccRepartoCompraRnt([ya, nueva], 100, 999); } catch (e) { err = e.message; }
  assert("A6: el total de la otra compra no puede ser menos de lo suyo", err.startsWith("Ya te han llegado 1.000 RNT"), err);
}

// A7: una entrada sin cantidad no entra en la lista ni lleva los botones (atascaría la compra).
{
  const sinCant = ent("z0", "2024-01-01 10:00:00", null), buena = ent("z1", "2024-02-01 10:00:00", 1000);
  assert("A7: sin cantidad, ni regalo ni compra", !ids(sinCant).some(i => ["regalo", "recompensa", "compra-rnt"].includes(i)), ids(sinCant));
  const l = S.ccRntDesde([sinCant, buena], buena, {}, ctx);
  assert("A7: fuera de la lista: la compra se guarda", l.length === 1 && S.ccRepartoCompraRnt(l, 30, 1000)[0][1] === 30, l.length);
}
// A8: lo pagado se lee a céntimos (el reparto y la nota dicen lo mismo).
{
  assert("A8: «1.200,255» → 1.200,26 y «0,004» → 0", S.ccLeerPagado("1.200,255") === 1200.26 && S.ccLeerPagado("0,004") === 0 &&
    Number.isNaN(S.ccLeerPagado("1200.5")), [S.ccLeerPagado("1.200,255"), S.ccLeerPagado("0,004")]);
  const p = S.ccLeerPagado("1.200,255"), l = [{ reg: ent("w", "2024-01-01 10:00:00", 1000), estado: "libre", ajuste: null }];
  const c = S.ccRepartoCompraRnt(l, p, 1000)[0][1];
  assert("A8: el coste es lo de la nota", c === 1200.26 && S.ccLeerCompraRnt(S.ccTextoCompraRnt(p, 1000)).pagado === c, c);
}
// A9: un precio diminuto no sale «0,0000».
assert("A9: 1 € por 100.000 RNT → 0,00001000 €/RNT (y 💶 igual)",
  S.ccTextoPrecioRnt(1, 100000) === "1,00 € ÷ 100.000 RNT = 0,00001000 €/RNT" && S.cbTextoPorToken(1, 100000) === "0,00001000 €" &&
  S.cbTextoPorToken(37, 1000) === "0,0370 €" && S.cbTextoPorToken(300, 3) === "100,00 €", [S.ccTextoPrecioRnt(1, 100000), S.cbTextoPorToken(1, 100000)]);

assert("A12: «Qué es cada cosa» cuenta el RNT comprado como compra", S.ccHtmlDialogoQueEs().includes("tokens de inmuebles que compras o vendes, y RNT que compras."));

console.log("== 6. Huecos de la auditoría ==");
{
  // Orden por fecha aunque las claves vayan al revés: el resto cae en la última por fecha.
  const zz = ent("zz", "2024-01-01 10:00:00", 1), aa = ent("aa", "2024-02-01 10:00:00", 1), mm = ent("mm", "2024-03-01 10:00:00", 1);
  const l = S.ccRntDesde([aa, mm, zz], zz, {}, ctx);
  assert("la lista va por fecha, no por clave", l.map(x => x.reg.clave).join() === "zz,aa,mm", l.map(x => x.reg.clave));
  const c = S.ccRepartoCompraRnt(l, 100, 3);
  assert("el resto (33,34) cae en la última por fecha", c[2][0].clave === "mm" && c[2][1] === 33.34, c.map(([r, v]) => r.clave + ":" + v));
  // Redondeo a céntimos (no truncar): 1 de 3 RNT por 2 € → 0,67.
  assert("cada parte se redondea (0,666… → 0,67)", S.ccRepartoCompraRnt([{ reg: zz, estado: "libre", ajuste: null }], 2, 3)[0][1] === 0.67);
  // Solo el RNT que te llega: ni USDC, ni filas del archivo de Reental, ni lo vinculado, desde esa misma dirección.
  const usdc = ent("f1", "2024-01-02 10:00:00", 50, { contrato: vm.runInContext("USDC", S) });
  const csv = ent("f2", "2024-01-03 10:00:00", 50, { fuente: "CSV_REENTAL" });
  const vinc = ent("f3", "2024-01-04 10:00:00", 50, { pago_diferido: { rol: "pago" } });
  const sale = ent("f4", "2024-01-06 10:00:00", 50, { origen: W, destino: REPARTO });
  const l2 = S.ccRntDesde([zz, usdc, csv, vinc, sale], zz, {}, ctx);
  assert("la lista no lleva USDC, archivo, vinculados ni lo que sale", l2.length === 1 && l2[0].reg.clave === "zz", l2.map(x => x.reg.clave));
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
