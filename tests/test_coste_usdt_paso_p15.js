/* P15 (A): «En USD…» en 💶 Coste de las compras bancarias. Una compra
 * pagada en USDT a una wallet de Reental y entregada después sale como
 * compra bancaria: lo pagado en USD y el día del pago se pasan a € con el
 * BCE de ese día y quedan como su coste.
 *
 * Bajo prueba (js/20):
 * - cbEurDeUsd / cbTextoEurDeUsd: USD ÷ tipo del BCE del día (o el último
 *   anterior, como el motor), a céntimos; los errores (coma, sin día, sin
 *   tipo) y nada mientras no hay nada escrito.
 * - cbHtmlFila / cbHtmlUsdt: «En USD…» solo con la casilla abierta; la
 *   subfila con lo pagado, el día y el resultado.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_coste_usdt_paso_p15.js
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

console.log("== 1. El cálculo ==");
const tipos = { "2024-03-01": 1.1, "2024-03-04": 1.08 };
const C = (usd, fecha) => S.cbEurDeUsd(usd, fecha, tipos, null);
let r = C("1.000", "2024-03-01");
assert("1.000 USD el 01/03 con el BCE a 1,1 → 909,09 €", r.eur === 909.09 && r.fecha === "2024-03-01", r);
assert("el texto: «= 909,09 € (BCE del 01/03/2024)»", S.cbTextoEurDeUsd(r) === "= 909,09 € (BCE del 01/03/2024)", S.cbTextoEurDeUsd(r));
r = C("1.000", "2024-03-03");
assert("un domingo: el último tipo anterior (viernes 01/03)", r.eur === 909.09 && r.fecha === "2024-03-01", r);
r = C("540,5", "2024-03-04");
assert("con decimales y otro día: 540,5 / 1,08 = 500,46 €", r.eur === 500.46, r);
assert("vacío: nada que decir", JSON.stringify(C("  ", "2024-03-01")) === JSON.stringify({ error: "" }) && S.cbTextoEurDeUsd(C("", "2024-03-01")) === "");
assert("«1000.5»: pide la coma", C("1000.5", "2024-03-01").error === "Usa la coma para los decimales (1.234,56).", C("1000.5", "2024-03-01"));
assert("0: «Escribe un importe mayor que 0.»", C("0", "2024-03-01").error === "Escribe un importe mayor que 0.");
assert("sin día: «Pon el día del pago.»", C("1.000", "").error === "Pon el día del pago.");
assert("sin tipo del BCE para ese día (antes de todos)", C("1.000", "2023-01-01").error === "Sin tipo del BCE para ese día.");
assert("sin ningún tipo", S.cbEurDeUsd("1.000", "2024-03-01", {}, null).error === "Sin tipo del BCE para ese día.");
assert("auditoría F1: 0,004 USD (0,00 €) es un error, no un 0", C("0,004", "2024-03-01").error === "Escribe un importe mayor que 0." &&
  !("eur" in C("0,004", "2024-03-01")), C("0,004", "2024-03-01"));

console.log("== 2. La pantalla ==");
const INM = "0x" + "a1".repeat(20), W = "0x" + "11".repeat(20);
const reg = { clave: "c1", fecha: "2024-03-05 10:00:00", hash: "0x" + "ab".repeat(32), contrato: INM, simbolo: "RALC1", inmueble: "Prueba Alcazaba 1",
  cantidad: 9, categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", coste_eur: 900, origen: "0x" + "77".repeat(20), destino: W };
const [f] = S.cbFilas([reg], {}, 100);
assert("cerrada: sin «En USD…»", !S.cbHtmlFila(f, {}).includes('data-cb="usdt"'));
const abierta = S.cbHtmlFila(f, { c1: "900,00" });
assert("abierta: «En USD…» junto a Guardar y Cancelar, sin subfila", abierta.includes('data-cb="usdt"') && abierta.includes("En USD…") && abierta.includes('title="Pagado en USD, USDT o USDC."') &&
  !abierta.includes("cb-usdt"), abierta);
const conUsdt = S.cbHtmlFila(Object.assign({}, f, { usdt: { usd: "1.000", fecha: "2024-03-01", calc: C("1.000", "2024-03-01") } }), { c1: "909,09" });
assert("con «En USD…» abierto: la subfila con lo pagado, el día y el resultado",
  conUsdt.includes('class="cb-usdt"') && conUsdt.includes('class="cb-usd" data-clave="c1" value="1.000"') &&
  conUsdt.includes('type="date" class="cb-usd-fecha" data-clave="c1" value="2024-03-01"') &&
  conUsdt.includes("= 909,09 € (BCE del 01/03/2024)") && conUsdt.includes('colspan="7"'), conUsdt);
assert("la subfila no sale si la casilla está cerrada", !S.cbHtmlFila(Object.assign({}, f, { usdt: { usd: "", fecha: "" } }), {}).includes("cb-usdt"));

console.log("== 2b. Auditoría de la 1.2 ==");
{
  // O3: con los mismos €, añadir lo pagado en USD (o quitarlo) activa «Guardar».
  const aj = { c1: Object.assign(S.ccAjusteCoste(909.09, "2026-10-16T10:00:00"), {}) };
  const [g] = S.cbFilas([reg], aj, 100);
  const calc = S.cbEurDeUsd("1.000", "2024-03-01", tipos, null);
  const boton = html => (/<button[^>]*data-cb="guardar"[^>]*>/.exec(html) || [""])[0];
  assert("O3: mismos € (909,09) y ahora en USD: «Guardar» activo",
    !boton(S.cbHtmlFila(Object.assign({}, g, { usdt: { usd: "1.000", fecha: "2024-03-01", calc } }), { c1: "909,09" })).includes("disabled"));
  assert("O3: sin tocar nada: «Guardar» desactivado", boton(S.cbHtmlFila(g, { c1: "909,09" })).includes("disabled"));
  const conUsd = Object.assign({}, g, { usd: { importe: 1000, fecha: "2024-03-01" } });
  assert("O3: guardada en USD y cerrado «En USD…» (se quita el USD): «Guardar» activo",
    !boton(S.cbHtmlFila(conUsd, { c1: "909,09" })).includes("disabled"));
  assert("O3: guardada en USD y abierto con lo mismo: «Guardar» desactivado",
    boton(S.cbHtmlFila(Object.assign({}, conUsd, { usdt: { usd: "1.000,00", fecha: "2024-03-01", calc } }), { c1: "909,09" })).includes("disabled"));

  // O2: deshacer una decisión devuelve también lo pagado en USD.
  const mandado = { c1: { revisar: true, nota: S.ccNotaMandarRevisar("revisar", "2026-10-01"), coste_eur: 909.09, pagado_usd: 1000, fecha_pago_usd: "2024-03-01" } };
  const decidido = S.ccAjustesConDecision(mandado, reg, "neutro", null, "2026-10-16T10:00:00");
  const deshecho = S.ccAjustesSinDecision(decidido, "c1", "2026-10-16T10:00:00").c1;
  assert("O2: decidir «neutro» y deshacer: vuelven el coste y lo pagado en USD", deshecho.revisar === true && deshecho.coste_eur === 909.09 &&
    deshecho.pagado_usd === 1000 && deshecho.fecha_pago_usd === "2024-03-01", deshecho);

  // O1: un día anterior a lo descargado se baja hasta el inicio de lo descargado (sin hueco).
  const pedidos = [];
  S.descargarTiposBce = async (a, b) => { pedidos.push([a, b]); return { "2020-03-10": 1.1 }; };
  const ponerCache = c => vm.runInContext("state.cache = " + JSON.stringify(c), S); // `state` es de la app, no S.state
  ponerCache({ tipos_bce: {}, bce_cobertura: { inicio: "2024-01-01", fin: "2026-10-14" } });
  S.cbBajarTipoBce("2020-03-10").then(trajo => {
    assert("O1: pide del 03/03/2020 al 01/01/2024 (hasta lo ya descargado)", trajo && JSON.stringify(pedidos) === '[["2020-03-03","2024-01-01"]]', pedidos);
    ponerCache({ tipos_bce: {} });
    pedidos.length = 0;
    return S.cbBajarTipoBce("2020-03-11");
  }).then(() => {
    assert("O1: sin nada descargado, solo los 7 días de antes", JSON.stringify(pedidos) === '[["2020-03-04","2020-03-11"]]', pedidos);
    // S2: un pago después de lo descargado pide desde el final de lo descargado y lo amplía.
    ponerCache({ tipos_bce: { "2024-02-20": 1.07 }, bce_cobertura: { inicio: "2024-01-01", fin: "2024-02-20" } });
    pedidos.length = 0;
    return S.cbBajarTipoBce("2024-03-06");
  }).then(() => {
    const cob = vm.runInContext("state.cache.bce_cobertura", S);
    assert("S2: pago del 06/03 con lo descargado hasta el 20/02: pide del 20/02 al 06/03 y queda descargado hasta el 06/03",
      JSON.stringify(pedidos) === '[["2024-02-20","2024-03-06"]]' && cob.inicio === "2024-01-01" && cob.fin === "2024-03-06", [pedidos, cob]);
    // S3: si la descarga falla (sin red), se puede volver a pedir.
    let falla = true;
    S.descargarTiposBce = async (a, b) => { pedidos.push([a, b]); if (falla) throw new Error("sin red"); return { "2019-05-10": 1.12 }; };
    ponerCache({ tipos_bce: {} });
    pedidos.length = 0;
    return S.cbBajarTipoBce("2019-05-10").then(r1 => { falla = false; return S.cbBajarTipoBce("2019-05-10").then(r2 => [r1, r2]); });
  }).then(([r1, r2]) => {
    assert("S3: sin red no trae nada, y al volver la red se pide otra vez y lo trae", r1 === false && r2 === true && pedidos.length === 2, pedidos);
    // S1: un segundo «Guardar» de una fila ya guardada no hace nada (ni avisa de un error).
    // Como justo después de guardar: la compra con su USD en la cache y la fila ya sin borrador.
    S.__reg = reg;
    vm.runInContext(`state.registros = [__reg]; state.cache = { tipos_bce: { "2024-03-01": 1.1 }, ajustes_usuario: { c1: {
      coste_eur: 909.09, nota: "Coste puesto por ti (2026-10-16)", pagado_usd: 1000, fecha_pago_usd: "2024-03-01" } } };
      var __avisos = []; toast = m => __avisos.push(m);`, S);
    return vm.runInContext("cbGuardar('c1')", S);
  }).then(() => {
    const avisos = vm.runInContext("__avisos", S);
    assert("S1: un segundo «Guardar» de una compra recién guardada en USD no avisa de ningún error", avisos.length === 0, avisos);
  }, e => assert("S1: un segundo «Guardar» de una compra recién guardada en USD no avisa de ningún error", false, String(e)));
  // S2: pasado lo descargado, el último tipo guardado no vale (el del día aún no se ha pedido).
  const cacheS2 = { bce_cobertura: { inicio: "2024-01-01", fin: "2024-03-04" } };
  assert("S2: pago del 05/03 con lo descargado hasta el 04/03: «Sin tipo» (no el del 04/03)",
    S.cbEurDeUsd("1.000", "2024-03-05", tipos, cacheS2).error === "Sin tipo del BCE para ese día.");
  assert("S2: dentro de lo descargado, el último tipo anterior sigue valiendo (domingo 03/03 → viernes 01/03)",
    S.cbEurDeUsd("1.000", "2024-03-03", tipos, cacheS2).eur === 909.09);
  assert("S2: con el tipo de ese mismo día, vale aunque pase de lo descargado",
    S.cbEurDeUsd("1.080", "2024-03-04", tipos, { bce_cobertura: { inicio: "2024-01-01", fin: "2024-03-01" } }).eur === 1000);
}

console.log("== 3. «Actualizar» también baja el día de cada pago en USD ==");
vm.runInContext(fs.readFileSync(path.join(BASE, "22-informe-renta.js"), "utf8"), S, { filename: "22-informe-renta.js" });
const nec = S.fechasBceNecesarias({ transacciones: { wallet_tokens: [] }, ajustes_usuario: {
  a: { coste_eur: 1000, pagado_usd: 1080, fecha_pago_usd: "2023-06-15" }, b: { coste_eur: 5 }, c: { pagado_usd: 1, fecha_pago_usd: "2026-07-01" },
  d: { pagado_usd: 1, fecha_pago_usd: "15/06/2023" } } }, [], "2026-06-10");
assert("el día del pago entra (no los de hoy en adelante ni los mal escritos)", nec.includes("2023-06-15") && !nec.includes("2026-07-01") &&
  !nec.includes("15/06/2023") && nec.includes("2026-06-09"), nec);

// Después de las comprobaciones asíncronas (descarga simulada, sin red).
setImmediate(() => {
  console.log("\n" + ok + " OK, " + fallos + " FALLOS");
  process.exit(fallos ? 1 : 0);
});
