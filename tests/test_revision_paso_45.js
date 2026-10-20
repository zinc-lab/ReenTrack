/* Test de 🔍 Revisión: botones de decisión con «Sugerida» en cada tarjeta
 * a revisar; solo los que encajan.
 *
 * Bajo prueba (Reental-SPA/js/15-correcciones.js):
 * - ccOpcionesDecision: «✔ Dejar como …» (Sugerida) y solo las alternativas
 *   que encajan con el movimiento.
 * - ccAjustesConDecision / ccAjusteDecision: el ajuste de cada decisión
 *   (la compra externa con via_compra BANCARIA y sin precio, que se pone en 💶;
 *   fiscal use su coste en €), que sustituye un ajuste que solo pedía
 *   revisión y nunca pisa uno ajeno.
 * - ccAjustesSinDecision: deshacer devuelve los ajustes de antes (también
 *   el «Mandado a revisar» o el «Sacado del spam» que sustituyó).
 * - aplicarAjustesUsuario (js/14): con la decisión, el registro deja de
 *   estar a revisar; deshecha, vuelve exactamente a lo de antes.
 * - «🚫 Es spam» es el mismo ajuste que el 🚫 de 📒 Transacciones (su ↩
 *   lo deshace allí).
 * - ccDecisionesTomadas / ccResumenDecision / ccEurOrientativo /
 *   ccHtmlDecisiones.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_revision_paso_45.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "07-bce.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}
S.log = () => {};

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const W = "0x" + "11".repeat(20), T = "0x" + "77".repeat(20), INM = "0x" + "a1".repeat(20);
const USDT = vm.runInContext("USDT", S), RNT_ = vm.runInContext("RNT", S);
const ctx = { propias: new Set([W]), inmuebles: new Set([INM]) };
function reg(clave, categoria, extra = {}) {
  return Object.assign({ clave, fecha: "2026-06-14 10:00:00", hash: "0x" + "ab".repeat(32), contrato: USDT, token: "USDT0",
    simbolo: "USDT0", cantidad: 18.54, categoria, subcategoria: "X", inmueble: null, importe_usdt: 18.54, coste_eur: null,
    origen: T, destino: W, fuente: "ONCHAIN", nota: "nota del motor", revisar: true }, extra);
}
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id + (o.sugerida ? "*" : ""));
const FECHA = "2026-10-01T10:00:00.000Z";

console.log("== 1. Solo los que encajan ==");
assert("depósito de USDT: ✔ (Sugerida), Neutro y Spam",
  JSON.stringify(ids(reg("d", "DEPOSITO"))) === JSON.stringify(["dejar*", "neutro", "spam"]), ids(reg("d", "DEPOSITO")));
const etiquetaDejar = r => S.ccOpcionesDecision(r, ctx)[0].etiqueta;
assert("la etiqueta: «✔» y el nombre de 📒 («✔ Ingreso de dinero», «✔ Salida de dinero»)",
  etiquetaDejar(reg("d", "DEPOSITO", { subcategoria: "COSTE_BASE" })) === "✔ Ingreso de dinero" &&
  etiquetaDejar(reg("w", "RETIRADA", { subcategoria: "GPP_RETIRADA", origen: W, destino: T })) === "✔ Salida de dinero",
  [etiquetaDejar(reg("d", "DEPOSITO", { subcategoria: "COSTE_BASE" })), etiquetaDejar(reg("w", "RETIRADA", { subcategoria: "GPP_RETIRADA", origen: W, destino: T }))]);
assert("subcategoría que 📒 no conoce: el nombre de la categoría («✔ Depósito»)", etiquetaDejar(reg("d", "DEPOSITO")) === "✔ Depósito");
assert("«Ingreso de dinero…» (antes «Dinero que recibí…»)",
  S.ccOpcionesDecision(reg("r", "REVISAR"), ctx).find(o => o.id === "dinero").etiqueta === "Ingreso de dinero…");
const rarUsdt = reg("r", "REVISAR");
assert("USDT que entra sin regla (REVISAR): Ingreso de dinero, Neutro y Spam (sin Sugerida)",
  JSON.stringify(ids(rarUsdt)) === JSON.stringify(["dinero", "neutro", "spam"]), ids(rarUsdt));
const salidaInm = reg("s", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", simbolo: "RCAC8", origen: W, destino: T, importe_usdt: null });
assert("salida de un inmueble: Es una venta y Neutro (D9: sin spam en una salida tuya)",
  JSON.stringify(ids(salidaInm)) === JSON.stringify(["venta", "neutro"]), ids(salidaInm));
const ventaSinPrecio = Object.assign({}, salidaInm, { categoria: "VENTA" });
assert("venta sin precio: no se ofrece «Dejar»; «Es una venta…» es la Sugerida",
  JSON.stringify(ids(ventaSinPrecio)) === JSON.stringify(["venta*", "neutro"]), ids(ventaSinPrecio));
const entradaInm = reg("e", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", simbolo: "RCAC8", importe_usdt: null });
assert("entrada de un inmueble: Compra externa, Neutro y Spam",
  JSON.stringify(ids(entradaInm)) === JSON.stringify(["compra", "neutro", "spam"]), ids(entradaInm));
console.log("== 1b. «🚫 Es spam» con un token conocido (D9) ==");
const DEFI = "0x" + "de".repeat(20), DIST = "0x" + "d1".repeat(20), DESC = "0x" + "99".repeat(20), RARO = "0x" + "c3".repeat(20);
S.state.config = { wallet: W, vault: "" };
const cacheD9 = { contratos_aprendidos: { DEFI_STAKING: { [DEFI]: {} }, DISTRIBUIDOR: { [DIST]: {} } }, catalogo_propiedades: {} };
const ctxD9 = Object.assign({}, ctx, { direcciones: S.construirContexto(cacheD9) });
const tieneSpam = r => S.ccOpcionesDecision(r, ctxD9).some(o => o.id === "spam");
assert("salida de USDT: sin spam", !tieneSpam(reg("su", "RETIRADA", { origen: W, destino: DESC })));
assert("USDT de un comprador P2P (dirección desconocida): con spam", tieneSpam(reg("p2p", "REVISAR", { origen: DESC })));
assert("RNT de un contrato DeFi: sin spam", !tieneSpam(reg("df", "REVISAR", { contrato: RNT_, simbolo: "RNT", origen: DEFI })));
assert("RNT de una dirección desconocida (polvo): con spam", tieneSpam(reg("pv", "REVISAR", { contrato: RNT_, simbolo: "RNT", origen: DESC })));
assert("inmueble que llega de Reental (dirección conocida): sin spam", !tieneSpam(reg("ic", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", origen: DIST })));
assert("inmueble de una dirección desconocida: con spam", tieneSpam(reg("id", "REVISAR", { contrato: INM, inmueble: "Cáceres 8", origen: DESC })));
assert("POL de una dirección desconocida: con spam", tieneSpam(reg("pol", "REVISAR", { contrato: "pol", simbolo: "POL", origen: DESC })));
assert("token desconocido: con spam, también en una salida (como hoy)",
  tieneSpam(reg("rr", "REVISAR", { contrato: RARO, origen: DEFI })) && tieneSpam(reg("rs", "REVISAR", { contrato: RARO, origen: W, destino: DESC })));
const rend = reg("rd", "RENDIMIENTO", { fuente: "CSV_REENTAL" });
assert("rendimiento del archivo: Dejar como Rendimiento y Neutro (sin spam: no es de la blockchain)",
  JSON.stringify(ids(rend)) === JSON.stringify(["dejar*", "neutro"]), ids(rend));
assert("movimiento neutro: no repite «Movimiento neutro»", !ids(reg("m", "MOVIMIENTO")).includes("neutro"));

console.log("== 2. Los ajustes de cada decisión ==");
const aj = (r, id, v, previos) => S.ccAjustesConDecision(previos || {}, r, id, v, FECHA)[r.clave];
assert("dejar: solo revisar:false y la marca", JSON.stringify(aj(reg("d", "DEPOSITO"), "dejar")) ===
  JSON.stringify({ revisar: false, nota: "Decidido por ti en Revisión (2026-10-01): se deja como depósito" }), aj(reg("d", "DEPOSITO"), "dejar"));
const venta = aj(salidaInm, "venta", "1.234,5");
assert("venta: VENTA/GPP_INMUEBLE con el importe (escrito a la española)",
  venta.categoria === "VENTA" && venta.subcategoria === "GPP_INMUEBLE" && venta.importe_usdt === 1234.5 && venta.revisar === false, venta);
let errPunto = "";
try { aj(salidaInm, "venta", "1234.5"); } catch (e) { errPunto = e.message; }
assert("«1234.5» no vale: pide la coma para los decimales (P11)", errPunto === "Usa la coma para los decimales (1.234,56).", errPunto);
const compra = aj(entradaInm, "compra");
assert("compra externa: COMPRA/COSTE_BASE, via_compra BANCARIA y sin precio (se pone en 💶)",
  compra.categoria === "COMPRA" && compra.via_compra === "BANCARIA" && !("coste_eur" in compra) &&
  compra.nota === "Decidido por ti en Revisión (2026-10-01): compra externa", compra);
{
  // Clasificado: el inmueble sin tu precio lleva el de por defecto (D1); el RNT, ninguno; el tuyo se queda.
  const regs = [Object.assign({}, entradaInm, { cantidad: 3 }), reg("rn", "REVISAR", { contrato: RNT_, cantidad: 500 }),
    Object.assign({}, entradaInm, { clave: "e2", cantidad: 3 })];
  S.aplicarAjustesUsuario(regs, { ajustes_usuario: { e: compra, rn: aj(regs[1], "compra"), e2: Object.assign({}, compra, { coste_eur: 240 }) } }, true);
  S.costeDefectoComprasExternas(regs, { compra_bancaria_coste_eur_por_token: 100 });
  // COMPRA-EXTERNA A6: un coste escrito a mano en los ajustes (0 o que no vale) no se cambia por el de por defecto.
  const aMano = [Object.assign({}, entradaInm, { clave: "e3", cantidad: 3, categoria: "COMPRA", via_compra: "BANCARIA", coste_eur: 0 })];
  S.costeDefectoComprasExternas(aMano, { compra_bancaria_coste_eur_por_token: 100 }, { E3: { coste_eur: 0 } });
  assert("A6: con coste_eur escrito a mano (0), no se pone el de por defecto", aMano[0].coste_eur === 0, aMano[0].coste_eur);
  assert("D1: inmueble sin precio a 100 €/token (300 €); RNT sin precio, sin coste; con tu precio, el tuyo",
    regs[0].coste_eur === 300 && regs[0].via_compra === "BANCARIA" && !regs[0].revisar && regs[1].coste_eur === null && regs[2].coste_eur === 240,
    regs.map(r => r.coste_eur));
}
const conCoste = aj(entradaInm, "compra", null, { e: { revisar: true, nota: "Mandado a revisar por ti (2026-09-01)", coste_eur: 950 } });
assert("compra externa sobre un «Mandado a revisar» con coste: el coste sigue", conCoste.coste_eur === 950, conCoste);
assert("dinero recibido: DEPOSITO/COSTE_BASE con importe_usdt", aj(rarUsdt, "dinero", "18,54").importe_usdt === 18.54);
assert("neutro: MOVIMIENTO/NEUTRO", aj(rarUsdt, "neutro").categoria === "MOVIMIENTO");
let lanzo = false;
try { aj(salidaInm, "venta", ""); } catch (e) { lanzo = /importe/.test(e.message); }
assert("sin importe no se guarda", lanzo);
const spam = aj(rarUsdt, "spam");
assert("🚫 Es spam: el ajuste del 🚫 de Transacciones (js/18 lo reconoce y su ↩ lo quita)",
  spam.categoria === "SPAM" && S.txEsAjusteMandarSpam(spam) &&
  S.txEstadoSpam(Object.assign({}, rarUsdt, { categoria: "SPAM" }), { r: spam }) === "quitar", spam);

console.log("== 3. Sustituir y deshacer ==");
const mandado = { r: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): comprobar" } };
const conDec = S.ccAjustesConDecision(mandado, rarUsdt, "neutro", null, FECHA);
assert("sustituye el «Mandado a revisar» y lo recuerda en la nota", Object.keys(conDec).length === 1 &&
  conDec.r.nota.includes("[antes: mandado a revisar (2026-09-30): comprobar]"), conDec); // con fecha y motivo
const vuelta = S.ccAjustesSinDecision(conDec, "r", FECHA);
assert("deshacer lo devuelve a revisar (con la marca de js/18, que lo reconoce)",
  vuelta.r.revisar === true && S.txEsAjusteMandarRevisar(vuelta.r), vuelta);
const sacado = { r: { categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: "Sacado del spam por ti (2026-09-30)" } };
const vuelta2 = S.ccAjustesSinDecision(S.ccAjustesConDecision(sacado, rarUsdt, "dinero", "5", FECHA), "r", FECHA);
assert("deshacer una decisión sobre algo sacado del spam: vuelve a «sacado del spam»", S.txEsAjusteSacarSpam(vuelta2.r), vuelta2);
const otra = { x: { coste_eur: 1 } };
assert("deshacer sin nada previo: los ajustes como antes",
  JSON.stringify(S.ccAjustesSinDecision(S.ccAjustesConDecision(otra, rarUsdt, "neutro", null, FECHA), "r", FECHA)) === JSON.stringify(otra));
lanzo = false;
try { S.ccAjustesConDecision({ r: { coste_eur: 5, nota: "desde el panel" } }, rarUsdt, "neutro", null, FECHA); } catch (e) { lanzo = true; }
assert("nunca pisa un ajuste ajeno", lanzo);
assert("con un ajuste ajeno, la tarjeta no ofrece botones",
  S.ccEstadoDecision(rarUsdt, { r: { coste_eur: 5 } }) === "ajeno" &&
  /Ajustes en JSON/.test(S.ccHtmlDecisiones(rarUsdt, { estado: "ajeno", opciones: [] })));
lanzo = false;
try { S.ccAjustesSinDecision({ r: { coste_eur: 5 } }, "r", FECHA); } catch (e) { lanzo = true; }
assert("deshacer nunca borra un ajuste ajeno", lanzo);

console.log("== 3b. Marcas antiguas («desde la SPA», hasta el 01/10/2026) ==");
const viejoMandado = { r: { revisar: true, nota: "Mandado a revisar desde la SPA (2026-10-01)" } };
assert("un «Mandado a revisar desde la SPA» se sigue sustituyendo y devolviendo",
  S.ccEstadoDecision(rarUsdt, viejoMandado) === "propio" &&
  S.ccAjustesConDecision(viejoMandado, rarUsdt, "neutro", null, FECHA).r.nota.includes("[antes: mandado a revisar (2026-10-01)]"));
const viejaDecision = { r: { revisar: false, nota: "Decidido en Revision desde la SPA (2026-10-01): movimiento neutro" } };
assert("una decisión antigua sale en Resueltos y se puede deshacer",
  S.ccEsAjusteDecision(viejaDecision.r) && JSON.stringify(S.ccAjustesSinDecision(viejaDecision, "r", FECHA)) === "{}");
const viejoSpam = { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: "Mandado al spam desde la SPA (2026-10-01) en Revision" };
assert("un «Es spam» antiguo de Revisión también", S.ccEsAjusteDecision(viejoSpam) && S.txEsAjusteMandarSpam(viejoSpam));
assert("las marcas nuevas no dicen «SPA»", !/la SPA/.test(JSON.stringify(S.ccAjustesConDecision({}, rarUsdt, "spam", null, FECHA))));

console.log("== 4. Los motores lo aplican ==");
const original = JSON.stringify([rarUsdt]);
const aplicar = a => { const c = JSON.parse(original); S.aplicarAjustesUsuario(c, { ajustes_usuario: a }); return c[0]; };
const dec = S.ccAjustesConDecision({}, rarUsdt, "dinero", "18,54", FECHA);
const r1 = aplicar(dec);
assert("con la decisión: DEPOSITO y ya no a revisar", r1.categoria === "DEPOSITO" && r1.revisar === false, r1);
assert("deshecha: exactamente lo de antes", JSON.stringify([aplicar(S.ccAjustesSinDecision(dec, "r", FECHA))]) === original);

console.log("== 5. Resueltos, resumen, ≈ € y HTML ==");
const tomadas = S.ccDecisionesTomadas(Object.assign({}, dec, otra, { s: spam }), [rarUsdt, Object.assign({}, rarUsdt, { clave: "s" })]);
assert("Resueltos: las decisiones con registro (también el spam de Revisión), no los ajustes ajenos",
  tomadas.length === 2 && tomadas.every(t => t.reg), tomadas.map(t => t.clave));
/* A13 (B21): por el día de la decisión, la más nueva arriba (el mismo día,
   la última decidida); el spam no va siempre antes. */
const regsA13 = ["a", "b", "c", "d"].map(c => Object.assign({}, rarUsdt, { clave: c }));
const ordenA13 = S.ccDecisionesTomadas({
  a: S.ccAjustesConDecision({}, regsA13[0], "spam", null, "2026-10-01T10:00:00.000Z").a,
  b: S.ccAjustesConDecision({}, regsA13[1], "dinero", "1", "2026-10-05T10:00:00.000Z").b,
  c: S.ccAjustesConDecision({}, regsA13[2], "dinero", "1", "2026-10-03T10:00:00.000Z").c,
  d: S.ccAjustesConDecision({}, regsA13[3], "spam", null, "2026-10-05T12:00:00.000Z").d,
}, regsA13).map(t => t.clave).join("");
assert("A13: «Ya decididos» por el día de la decisión, no por el texto (spam incluido)", ordenA13 === "dbca", ordenA13);
assert("el 🚫 de Transacciones no sale en Resueltos de Revisión",
  S.ccDecisionesTomadas({ r: S.txAjustesConSpam({}, "r", "spam", FECHA).r }, [rarUsdt]).length === 0);
assert("resumen: «Venta · 1.234,50 USD»", S.ccResumenDecision(venta) === "Venta · 1.234,50 USD", S.ccResumenDecision(venta));
assert("resumen: «Compra externa · 3.000,00 €» (con tu precio)",
  S.ccResumenDecision(Object.assign({}, compra, { coste_eur: 3000 })) === "Compra externa · 3.000,00 €");
assert("resumen: inmueble sin tu precio, el de por defecto (el del registro)",
  S.ccResumenDecision(compra, Object.assign({}, entradaInm, { coste_eur: 1000 })) === "Compra externa · 1.000,00 € (por defecto)",
  S.ccResumenDecision(compra, Object.assign({}, entradaInm, { coste_eur: 1000 })));
assert("resumen: RNT sin precio, «falta el precio»",
  S.ccResumenDecision(compra, reg("x", "COMPRA", { contrato: RNT_, coste_eur: null })) === "Compra externa · falta el precio");
// «Dejar como…» nombra la categoría del movimiento (sin ella, el texto genérico).
assert("resumen: «Se deja como Compra»", S.ccResumenDecision({ revisar: false }, { categoria: "COMPRA" }) === "Se deja como Compra" &&
  S.ccResumenDecision({ revisar: false }) === "Se deja como lo dice la app");
/* Auditoría de la tanda P (A5, A6, A8): el mismo nombre en el botón, en «Ya decididos» y en 📒. */
const cobroV = { clave: "cv", categoria: "DEPOSITO", subcategoria: "COSTE_BASE", pago_diferido: { rol: "pago", venta_id: "pd_1" } };
const dejarCobro = S.ccOpcionesDecision(cobroV, ctx);
assert("el cobro asignado en parte: «✔ Ingreso de dinero» (lo que queda es tuyo) y lo mismo en «Ya decididos»",
  dejarCobro.length === 1 && dejarCobro[0].etiqueta === "✔ Ingreso de dinero" &&
  S.ccResumenDecision({ revisar: false }, cobroV) === "Se deja como Ingreso de dinero", dejarCobro);
assert("A5: «Ya decididos» con el nombre del botón: «Se deja como Compra de tokens», «Ingreso de dinero · …»",
  S.ccResumenDecision({ revisar: false }, { categoria: "COMPRA", subcategoria: "COSTE_BASE" }) === "Se deja como Compra de tokens" &&
  S.ccResumenDecision({ categoria: "DEPOSITO", importe_usdt: 18.54 }) === "Ingreso de dinero · 18,54 USD");
const mixto = { clave: "mx", categoria: "RENDIMIENTO", subcategoria: "RCM_MIXTO", revisar: true, fuente: "CSV_REENTAL" };
assert("A8: el rendimiento mixto: «✔ Rendimiento mixto», sin «(a revisar)» en el botón",
  S.ccOpcionesDecision(mixto, ctx)[0].etiqueta === "✔ Rendimiento mixto" && S.txOperacion(mixto) === "Rendimiento mixto (a revisar)",
  S.ccOpcionesDecision(mixto, ctx)[0]);
const eur = S.ccEurOrientativo(115, "2026-06-14 10:00:00", { "2026-06-12": 1.15, "2026-06-15": 1.2 });
assert("≈ €: con el tipo BCE del día o el último anterior", eur && Math.abs(eur.eur - 100) < 1e-9 && eur.fecha === "2026-06-12", eur);
assert("≈ €: sin tipos, nada", S.ccEurOrientativo(115, "2026-06-14", {}) === null);
const html = S.ccHtmlDecisiones(salidaInm, { estado: "libre", opciones: S.ccOpcionesDecision(ventaSinPrecio, ctx),
  abierta: { id: "venta", valor: "1.150" }, eur: { eur: 1000, fecha: "2026-06-12" } });
assert("HTML: la Sugerida con su etiqueta, el formulario con «Cobrado … USD» y el ≈ €",
  /cc-dec sugerida abierta[^>]*data-opcion="venta"/.test(html) && /<span class="cc-sugerida">Sugerida<\/span>/.test(html) &&
  /Cobrado <input[^>]*value="1\.150"/.test(html) && /≈ 1\.000,00 € \(BCE del 12\/06\/2026\)/.test(html), html);

console.log("== P2. Lo que dicen «Movimiento neutro» y «🚫 Es spam» al pasar el ratón ==");
const ayuda = (r, id) => (S.ccOpcionesDecision(r, ctx).find(o => o.id === id) || {}).ayuda;
const AY = ["CC_AYUDA_NEUTRO", "CC_AYUDA_NEUTRO_ENTRADA", "CC_AYUDA_SPAM"].map(n => vm.runInContext(n, S));
assert("neutro en lo que llega: «Ya era tuyo…»; en lo que sale: «Sigue siendo tuyo…»",
  ayuda(rarUsdt, "neutro") === AY[1] && /^Ya era tuyo/.test(AY[1]) &&
  ayuda(salidaInm, "neutro") === AY[0] && /^Sigue siendo tuyo/.test(AY[0]), [ayuda(rarUsdt, "neutro"), ayuda(salidaInm, "neutro")]);
assert("spam: «Falso o sin valor: la app no lo cuenta.»", ayuda(rarUsdt, "spam") === AY[2] && AY[2] === "Falso o sin valor: la app no lo cuenta.");
assert("sin «Renta» y con «Más en ⓘ Qué es cada cosa.» (salvo el spam)",
  AY.every(t => !/Renta/.test(t)) && /Sin efecto fiscal\. Más en ⓘ Qué es cada cosa\.$/.test(AY[0]) &&
  /primera vez/.test(AY[1]) && /Más en ⓘ Qué es cada cosa\.$/.test(AY[1]) && !/Más en/.test(AY[2]));
assert("«Compra externa…» de un inmueble con su burbuja (lo pagado, en 💶)",
  /^La app no encuentra el pago: .*«💶 Coste de las compras externas», justo debajo\./.test(vm.runInContext("CC_AYUDA_COMPRA", S)));
const htmlAy = S.ccHtmlDecisiones(rarUsdt, { estado: "libre", opciones: S.ccOpcionesDecision(rarUsdt, ctx), abierta: null });
assert("HTML: el texto va en el title de su botón, y no en los demás",
  htmlAy.includes('data-opcion="neutro" title="' + AY[1] + '"') && htmlAy.includes('data-opcion="spam" title="' + AY[2] + '"') &&
  !/data-opcion="dinero"[^>]*title=/.test(htmlAy), htmlAy);

console.log("== P3. «ⓘ Qué es cada cosa» en 🔍 y 📒 ==");
const queEs = S.ccHtmlDialogoQueEs();
const nombresQueEs = (queEs.match(/<p><b>[^<]+<\/b>/g) || []).map(x => x.slice(6, -4));
assert("11 líneas en la ventana, con permuta, compra externa, canje y gas", nombresQueEs.length === 11 &&
  ["Permuta", "Compra externa", "Canje de contrato", "Comisión de red (gas)", "Movimiento neutro", "Spam"].every(n => nombresQueEs.includes(n)), nombresQueEs);
assert("sin «Renta»: dice «efecto fiscal»", !/Renta/.test(queEs) && /Tiene efecto fiscal/.test(queEs) && /sin efecto fiscal/.test(queEs));
assert("un botón (teclado) que abre la ventana, sin burbuja",
  /^<button type="button" class="cc-que-es">/.test(S.ccHtmlQueEs()) && !/cc-burbuja/.test(S.ccHtmlQueEs()));
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "Reental-SPA", "index.html"), "utf8");
assert("un solo hueco, en la barra de arriba (fija), que solo se ve en 🔍 y 📒",
  /<div class="top-right">[\s\S]*?<span data-que-es><\/span>[\s\S]*?<\/div>/.test(indexHtml) &&
  (indexHtml.match(/<span data-que-es>/g) || []).length === 1 &&
  /body:has\(#view-revision\.active,#view-transacciones\.active\) \.top-right \.cc-que-es\{display:inline-flex\}/.test(vm.runInContext("ccInyectarEstilos.toString()", S)));

console.log("== P5. Con tokens con dudas, el aviso encima de las tarjetas ==");
const lista = dudas => S.ccHtmlLista([rarUsdt], [rarUsdt], ctx, [], { ajustes: {}, tiposBce: {}, cache: null, abierta: null, dudas });
const avisoDudas = h => (h.match(/<div class="cc-cab cc-dudas">.*?<\/div>/) || [""])[0];
assert("con 2: «Primero confirma los 2 tokens con dudas: cambian…», con su enlace al catálogo, antes de la tarjeta",
  avisoDudas(lista(2)) === '<div class="cc-cab cc-dudas">Primero <a href="#revision" data-ir="rvCatalogo">confirma los 2 tokens con dudas</a>: cambian muchos de estos movimientos.</div>' &&
  lista(2).indexOf("cc-dudas") < lista(2).indexOf("cc-item"), avisoDudas(lista(2)));
assert("con 1: «el token con dudas: cambia…»", /confirma el token con dudas<\/a>: cambia muchos/.test(lista(1)), avisoDudas(lista(1)));
assert("sin dudas, o sin nada por decidir, sin aviso", !lista(0).includes("cc-dudas") &&
  !S.ccHtmlLista([rarUsdt], [], ctx, [], { dudas: 2 }).includes("cc-dudas"));

console.log("");
console.log(ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? "HAY FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
