/* Test del RNT que te llega (regalo, recompensa DeFi o compra externa, cada
 * uno solo ese movimiento; el precio de la compra se pone en 💶) y los
 * importes con punto solo para los miles.
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

console.log("== 2. 💶 y 📒 con una compra externa de RNT ==");
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

console.log("== 3. Botones en el RNT que te llega: cada uno, solo ese movimiento ==");
const OTRA = "0x" + "ee".repeat(20);
const ctx = { propias: new Set([W]), inmuebles: new Set([INM]) };
const FECHA = "2026-10-14T10:00:00.000Z";
function ent(clave, fecha, cantidad, extra = {}) {
  return reg(clave, Object.assign({ fecha, cantidad, categoria: "REVISAR", subcategoria: "PENDIENTE", via_compra: null,
    coste_eur: null, revisar: true, hash: "0x" + clave.padEnd(64, "0") }, extra));
}
const ids = r => S.ccOpcionesDecision(r, ctx).map(o => o.id + (o.sugerida ? "*" : ""));
const e1 = ent("e1", "2024-02-12 10:00:00", 5000);
assert("RNT a revisar: regalo, recompensa, compra externa, neutro y spam, ninguno sugerido (D2)",
  JSON.stringify(ids(e1)) === JSON.stringify(["regalo", "recompensa", "compra", "neutro", "spam"]), ids(e1));
assert("ninguno abre ventana ni pide importe; todos explican qué son (title)",
  S.ccOpcionesDecision(e1, ctx).every(o => !o.dialogo && !o.pide && o.ayuda));
const neutroStaking = ent("n1", "2024-04-01 10:00:00", 30, { categoria: "MOVIMIENTO", subcategoria: "NEUTRO" });
assert("neutro mandado a revisar desde 📒: ✔, regalo, recompensa y compra",
  JSON.stringify(ids(neutroStaking)) === JSON.stringify(["dejar*", "regalo", "recompensa", "compra", "spam"]), ids(neutroStaking));
const premioConocido = ent("p1", "2024-04-01 10:00:00", 3, { categoria: "REWARD", subcategoria: "RCM_REWARD" });
assert("un premio de un contrato conocido: sin «Recompensa DeFi» repetida ni compra",
  !ids(premioConocido).includes("recompensa") && !ids(premioConocido).includes("compra") && ids(premioConocido).includes("regalo"), ids(premioConocido));
assert("RNT que sale: nada de esto", !ids(ent("s1", "2024-01-01 10:00:00", 5, { origen: W, destino: OTRA })).some(i => ["regalo", "compra"].includes(i)));
assert("USDT que llega: nada de esto", !ids(ent("u1", "2024-01-01 10:00:00", 5, { contrato: vm.runInContext("USDT", S) })).includes("regalo"));
assert("sin cantidad: ni regalo ni compra", !ids(ent("z0", "2024-01-01 10:00:00", null)).some(i => ["regalo", "recompensa", "compra"].includes(i)));
const decidir = (r, id) => S.ccAjustesConDecision({}, r, id, null, FECHA)[r.clave];
assert("regalo: REWARD/GPP_REGALO", JSON.stringify(decidir(e1, "regalo")) === JSON.stringify({ categoria: "REWARD", subcategoria: "GPP_REGALO",
  revisar: false, nota: "Decidido por ti en Revisión (2026-10-14): regalo (airdrop)" }), decidir(e1, "regalo"));
assert("recompensa: REWARD/RCM_REWARD", decidir(e1, "recompensa").subcategoria === "RCM_REWARD" && S.ccEsAjusteDecision(decidir(e1, "recompensa")));
assert("A12: «Ya decididos» los nombra como 📒", S.ccResumenDecision(decidir(e1, "regalo")) === S.txOperacion({ categoria: "REWARD", subcategoria: "GPP_REGALO" }) &&
  S.ccResumenDecision(decidir(e1, "recompensa")) === "Recompensa DeFi");
// Solo ese movimiento: el otro RNT de esa dirección sigue igual.
const e2 = ent("e2", "2024-03-05 10:00:00", 2000);
const soloUno = S.ccAjustesConDecision({}, e1, "regalo", null, FECHA);
assert("D3: regalo solo en ese movimiento", Object.keys(soloUno).join() === "e1");
const copia = [e1, e2].map(r => Object.assign({}, r));
S.aplicarAjustesUsuario(copia, { ajustes_usuario: soloUno }, true);
assert("clasificado: e1 regalo sin revisar; e2 sigue a revisar", copia[0].subcategoria === "GPP_REGALO" && !copia[0].revisar && copia[1].revisar, copia);
assert("deshacer el regalo: sin ajuste", JSON.stringify(S.ccAjustesSinDecision(soloUno, "e1", FECHA)) === "{}");

console.log("== 4. Compra externa de RNT: sin precio, el precio en 💶 ==");
const dec = decidir(e1, "compra");
assert("el ajuste: COMPRA BANCARIA sin coste y con la nota «compra externa»",
  JSON.stringify(dec) === JSON.stringify({ categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", revisar: false,
    nota: "Decidido por ti en Revisión (2026-10-14): compra externa" }) && S.ccEsAjusteDecision(dec), dec);
const comprado = Object.assign({}, e1);
S.aplicarAjustesUsuario([comprado], { ajustes_usuario: { e1: dec } }, true);
assert("clasificado: fuera de revisar, COMPRA BANCARIA sin coste", comprado.categoria === "COMPRA" && comprado.via_compra === "BANCARIA" &&
  !comprado.revisar && comprado.coste_eur === null, comprado);
assert("«Ya decididos»: «Compra externa · falta el precio»", S.ccResumenDecision(dec, comprado) === "Compra externa · falta el precio");
const [fSin] = S.cbFilas([comprado], { e1: dec }, 100);
const hSin = S.cbHtmlFila(fSin, {});
assert("💶 (D5): sin 100 €/token; «Falta el precio» y «—», cuenta como sin coste",
  !(fSin.coste > 0) && fSin.supuesto && fSin.estado === "decision" && hSin.includes("Falta el precio") && hSin.includes(">—<"), [fSin, hSin]);
// Con tu precio en 💶: la decisión lleva el coste y «Ya decididos» lo dice.
const conPrecio = S.cbAjustesConCostes({ e1: dec }, [{ clave: "e1", valor: 150 }], [comprado], 100, FECHA);
assert("💶 guarda el coste en la decisión (sigue deshaciéndose en «Ya decididos»)", conPrecio.e1.coste_eur === 150 &&
  S.ccEsAjusteDecision(conPrecio.e1) && S.ccResumenDecision(conPrecio.e1, comprado) === "Compra externa · 150,00 €", conPrecio.e1);
assert("deshacer se lleva también el precio puesto en 💶", JSON.stringify(S.ccAjustesSinDecision(conPrecio, "e1", FECHA)) === "{}");
// La fila abierta: lo pagado y el precio por token, enlazados; debajo, la calculadora.
const abierta = S.cbHtmlFila(fSin, { e1: "" });
assert("abierta: casilla de lo pagado vacía y la del precio por token; debajo, «Calcular el precio por token»",
  abierta.includes('class="cb-valor" data-clave="e1" value=""') && abierta.includes('class="cb-precio" data-clave="e1" value=""') &&
  abierta.includes('data-cb="calcular"') && abierta.includes("Calcular el precio por token"), abierta);
const con150 = S.cbHtmlFila(fSin, { e1: "150" });
assert("abierta con 150 € por 5.000 RNT: 0,0300 € por token en su casilla", con150.includes('class="cb-precio" data-clave="e1" value="0,0300"'), con150);
assert("enlazadas: lo pagado → precio y precio → lo pagado (a céntimos, a la española)",
  S.cbPrecioDeTotal(150, 5000) === "0,0300" && S.cbTotalDePrecio(0.03, 5000) === "150,00" && S.cbTotalDePrecio(1250.5, 10) === "12.505,00" &&
  S.cbPrecioDeTotal(NaN, 5000) === "" && S.cbTotalDePrecio(NaN, 5000) === "");
const conUsd = S.cbHtmlFila(Object.assign({}, fSin, { usdt: { usd: "165", fecha: "2024-02-12", calc: { error: "" } } }), { e1: "" });
assert("con «En USD…»: lo pagado en USD y su precio por token (0,0330), el día y la calculadora",
  conUsd.includes('class="cb-usd" data-clave="e1" value="165"') && conUsd.includes('class="cb-usd-precio" data-clave="e1" value="0,0330"') &&
  conUsd.includes("USD por token") && conUsd.includes("cb-usd-fecha") && conUsd.includes('data-cb="calcular"'), conUsd);

console.log("== 5. «Calcular el precio por token»: puntos y comas ==");
const C = S.cbCalcularPrecio, TC = S.cbTextoCalculado;
assert("«1.500» tokens por 45 € = 0,0300 € por token", TC(C("1.500", "45"), "€") === "= 0,0300 € por token", TC(C("1.500", "45"), "€"));
assert("«1500» igual", C("1500", "45").precio === 0.03);
assert("«0,03» de total con 1 token = 0,0300 USD por token", TC(C("1", "0,03"), "USD") === "= 0,0300 USD por token");
assert("«0.03»: pide la coma", TC(C("1", "0.03"), "€") === COMA && !C("1", "0.03").precio);
assert("«12.345,5» tokens por 370,365 € = 0,0300", Math.abs(C("12.345,5", "370,365").precio - 0.03) < 1e-12);
assert("vacío o 0: «—»", TC(C("", "45"), "€") === "—" && TC(C("0", "45"), "€") === "—");
assert("la ventana: en la moneda de la fila, «Usar» empieza desactivado",
  S.cbHtmlCalculadora("USD").includes("Pagaste en total (USD)") && S.cbHtmlCalculadora("€").includes("Pagaste en total (€)") &&
  S.cbHtmlCalculadora("€").includes("Tokens que compraste") && /cb-calc-usar" disabled/.test(S.cbHtmlCalculadora("€")));

console.log("== 6. «En USD…» con el pago de hoy (D8) ==");
const hoy = vm.runInContext("hoyEspana()", S);
// Entre semana, el aviso de hoy; en sábado o domingo (A5), el de siempre (no hay tipo del viernes en la prueba).
const finde = [0, 6].includes(new Date(hoy + "T12:00:00Z").getUTCDay());
assert("hoy sin tipo: «El BCE aún no ha publicado el cambio de hoy. Vuelve mañana.» (en fin de semana, no)",
  S.cbEurDeUsd("100", hoy, {}, {}).error === (finde ? "Sin tipo del BCE para ese día." : "El BCE aún no ha publicado el cambio de hoy. Vuelve mañana."),
  S.cbEurDeUsd("100", hoy, {}, {}));
assert("hoy con el tipo ya publicado: vale", S.cbEurDeUsd("110", hoy, { [hoy]: 1.1 }, {}).eur === 100);
// COMPRA-EXTERNA A5: un sábado o un domingo, el tipo del viernes (aunque lo descargado acabe el viernes).
const cobV = { bce_cobertura: { inicio: "2024-01-01", fin: "2024-03-01" } };
assert("A5: pago del sábado 02/03/2024 y del domingo 03/03 con el tipo del viernes 01/03",
  S.cbEurDeUsd("110", "2024-03-02", { "2024-03-01": 1.1 }, cobV).eur === 100 && S.cbEurDeUsd("110", "2024-03-03", { "2024-03-01": 1.1 }, cobV).eur === 100,
  [S.cbEurDeUsd("110", "2024-03-02", { "2024-03-01": 1.1 }, cobV), S.cbEurDeUsd("110", "2024-03-03", { "2024-03-01": 1.1 }, cobV)]);
assert("A5: un lunes pasado lo descargado sigue sin tipo", S.cbEurDeUsd("110", "2024-03-04", { "2024-03-01": 1.1 }, cobV).error === "Sin tipo del BCE para ese día.");
assert("otro día sin tipo: el aviso de siempre", S.cbEurDeUsd("100", "2001-01-01", {}, {}).error === "Sin tipo del BCE para ese día.");

console.log("== 7. Precios pequeños ==");
assert("A9: 1 € por 100.000 RNT → 0,00001000 € (y 0,0370 € y 100,00 €)",
  S.cbTextoPorToken(1, 100000) === "0,00001000 €" && S.cbTextoPorToken(37, 1000) === "0,0370 €" && S.cbTextoPorToken(300, 3) === "100,00 €");
assert("A12: «Qué es cada cosa» cuenta el RNT comprado como compra", S.ccHtmlDialogoQueEs().includes("tokens de inmuebles que compras o vendes, y RNT que compras."));

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
