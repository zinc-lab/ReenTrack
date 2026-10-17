/* NOMINAL-1: 📊 «💼 Dinero invertido» con el interruptor «Valor nominal»
 * (los tokens que tienes × 100 en la moneda de cada proyecto, el
 * «Invertido» de la web de Reental) y la ventana «Ver el detalle».
 *
 * Bajo prueba (js/16): dashVotoMoneda, la moneda y las marcas de cada lote
 * de dashDineroInvertido, dashValorNominal y las piezas de HTML.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_valor_nominal_paso_nominal1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {}, log: () => {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const cerca = (a, b) => Math.abs(a - b) < 1e-6;
const C = k => "0x" + k.repeat(40).slice(0, 40);
let n = 0;
const compra = (contrato, fecha, via, cantidad, campos) => Object.assign({ clave: "k" + (++n), fecha: fecha + " 10:00:00",
  categoria: "COMPRA", subcategoria: "COSTE_BASE", hash: "0x" + String(n).padStart(64, "0"), inmueble: "Prueba " + contrato.slice(2, 4),
  contrato, via_compra: via, cantidad }, campos);
const tipos = { "2024-03-01": 1.08, "2024-06-03": 1.1, "2022-09-01": 1.0 };
const fila = (nom, c) => nom.filas.find(f => f.contrato === c);

console.log("== 1. Lo que dice cada compra de la moneda ==");
assert("108 $ por token con el BCE a 1,08: €", S.dashVotoMoneda(108, 1.08) === "EUR");
assert("100,50 $ por token: $", S.dashVotoMoneda(100.5, 1.08) === "USD");
assert("a un 2 % todavía casa; a un 3 %, no vota", S.dashVotoMoneda(101.9, 1.3) === "USD" && S.dashVotoMoneda(103, 1.3) === null);
assert("P2P a 85 $: no vota", S.dashVotoMoneda(85, 1.08) === null);
assert("sin tipo del BCE: no vota", S.dashVotoMoneda(108, null) === null);
assert("con el € a 1 $ las dos casan igual: gana $ (límite aceptado)", S.dashVotoMoneda(100, 1.0) === "USD");

console.log("== 2. El valor nominal de cada proyecto ==");
const EUR_USDT = C("a1"), USD = C("b2"), BANCO = C("c3"), AJUSTE = C("d4"), EN_USDT = C("e5"),
      VIEJO = C("f6"), NUEVO = C("a7"), FALTAN = C("b8"), NADA = C("c9"), SIN_CANT = C("d0"), SIN_BCE = C("e1");
const regs = [
  compra(EUR_USDT, "2024-03-01", "ONCHAIN", 1, { importe_usdt: 108 }),     // proyecto en € pagado en USDT
  compra(USD, "2024-03-01", "ONCHAIN", 4, { importe_usdt: 400 }),          // proyecto en $
  compra(BANCO, "2024-03-01", "BANCARIA", 10, { coste_eur: 1000 }),       // transferencia, coste por defecto
  compra(AJUSTE, "2024-03-01", "BANCARIA", 10, { coste_eur: 500 }),       // tu ajuste: 50 €/token
  compra(EN_USDT, "2024-06-03", "BANCARIA", 2, { coste_eur: 200 }),       // «En USD…»: 216 $ el 01/03 (1,08 → 200 €)
  compra(VIEJO, "2024-03-01", "VAULT", 3, { importe_usdt: 300 }),         // canjeado después
  compra(FALTAN, "2024-03-01", "ONCHAIN", 2, { importe_usdt: 216 }),      // tiene 3: 1 sin compra
  compra(SIN_CANT, "2024-03-01", "ONCHAIN", null, { importe_usdt: 50 }),  // pago conjunto sin cantidad
  compra(SIN_BCE, "2023-01-02", "ONCHAIN", 1, { importe_usdt: 108 }),     // sin tipo del BCE: no vota
];
// Venta de la mitad del proyecto en $ y canje de VIEJO por NUEVO.
const venta = { clave: "kv", fecha: "2024-06-03 10:00:00", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", hash: "0x" + "9".repeat(64),
  inmueble: "Prueba b2", contrato: USD, cantidad: 2, importe_usdt: 230 };
const hashCanje = "0x" + "8".repeat(64);
const burn = { clave: "kb", fecha: "2024-06-03 11:00:00", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", hash: hashCanje,
  inmueble: "Prueba f6", contrato: VIEJO, cantidad: 3 };
const canje = { clave: "kc", fecha: "2024-06-03 11:00:00", categoria: "COMPRA", subcategoria: "COSTE_BASE", hash: hashCanje,
  inmueble: "Prueba a7", contrato: NUEVO, via_compra: "CANJE", cantidad: 3 };
const enUsdt = regs[4];
const ajustes = {
  [regs[3].clave]: { coste_eur: 500, nota: "Coste puesto por ti (2024-03-02)" },
  [enUsdt.clave]: { coste_eur: 200, nota: "Coste puesto por ti (2024-06-03)", pagado_usd: 216, fecha_pago_usd: "2024-03-01" },
};
const inv = S.dashDineroInvertido(regs.concat(venta, burn, canje), tipos, ajustes, { tipos_bce: tipos });
const cartera = { items: [EUR_USDT, USD, BANCO, AJUSTE, EN_USDT, NUEVO, FALTAN, NADA, SIN_CANT, SIN_BCE].map(c => ({
  nombre: "Prueba " + c.slice(2, 4), contrato: c,
  n: { [USD]: 2, [FALTAN]: 3, [BANCO]: 10, [AJUSTE]: 10, [EN_USDT]: 2, [NUEVO]: 3, [NADA]: 5 }[c] || 1 })) };
const bce = { fecha: "2024-06-03", valor: 1.1 };
const nom = S.dashValorNominal(inv, cartera, bce);
assert("en € pagado en USDT (108 $/token, BCE 1,08): proyecto en €, 100,00 €; coste real en $",
  fila(nom, EUR_USDT).moneda === "EUR" && fila(nom, EUR_USDT).nominal === 100 && cerca(fila(nom, EUR_USDT).costeUsd, 108), fila(nom, EUR_USDT));
assert("en $: 2 tokens tras vender 2, 200,00 $; coste real 200 $", fila(nom, USD).moneda === "USD" && fila(nom, USD).nominal === 200 &&
  cerca(fila(nom, USD).costeUsd, 200), fila(nom, USD));
assert("transferencia con el coste por defecto: no vota, € por pagarla en €, sin marca",
  fila(nom, BANCO).moneda === "EUR" && !fila(nom, BANCO).ajuste && cerca(fila(nom, BANCO).costeEur, 1000), fila(nom, BANCO));
assert("tu ajuste a 50 €/token: €, 1.000,00 € nominal, 500 € de coste y «tu ajuste»",
  fila(nom, AJUSTE).moneda === "EUR" && fila(nom, AJUSTE).nominal === 1000 && fila(nom, AJUSTE).ajuste && cerca(fila(nom, AJUSTE).costeEur, 500), fila(nom, AJUSTE));
assert("«En USD…» (108 $/token): vota € con el BCE de su fecha de pago, sin marca; coste en $",
  fila(nom, EN_USDT).moneda === "EUR" && !fila(nom, EN_USDT).ajuste && cerca(fila(nom, EN_USDT).costeUsd, 216), fila(nom, EN_USDT));
assert("canje: el token nuevo hereda la moneda del viejo ($) y su coste", fila(nom, NUEVO).moneda === "USD" && cerca(fila(nom, NUEVO).costeUsd, 300), fila(nom, NUEVO));
assert("3 tokens y compras de 2: cuenta los 3 en el nominal y marca 1 sin compra",
  fila(nom, FALTAN).nominal === 300 && fila(nom, FALTAN).sinCompra === 1 && fila(nom, FALTAN).moneda === "EUR", fila(nom, FALTAN));
assert("sin ninguna compra: fuera de los totales («sin compra»)", fila(nom, NADA).moneda === null && fila(nom, NADA).nominal === null);
assert("compra sin cantidad: «sin precio por token», en la moneda pagada, sin «tokens sin compra»",
  fila(nom, SIN_CANT).sinPrecio && fila(nom, SIN_CANT).moneda === "USD" && fila(nom, SIN_CANT).sinCompra === 0 && cerca(fila(nom, SIN_CANT).costeUsd, 50), fila(nom, SIN_CANT));
assert("sin tipo del BCE: no vota, la moneda pagada ($)", fila(nom, SIN_BCE).moneda === "USD", fila(nom, SIN_BCE));
// € : EUR_USDT 100 + BANCO 1000 + AJUSTE 1000 + EN_USDT 200 + FALTAN 300 = 2600; $ : USD 200 + NUEVO 300 + SIN_CANT 100 + SIN_BCE 100 = 700
assert("totales: 2.600,00 € y 700,00 $; ≈ 2.600 × 1,1 + 700 = 3.560 USD",
  nom.eur === 2600 && nom.usd === 700 && cerca(nom.aprox, 3560) && nom.bce === bce, { eur: nom.eur, usd: nom.usd, aprox: nom.aprox });

console.log("== 3. Mayoría, sin BCE y solo $ ==");
{
  const P = C("aa");
  const mix = [compra(P, "2024-03-01", "ONCHAIN", 3, { importe_usdt: 324 }), compra(P, "2024-03-01", "ONCHAIN", 1, { importe_usdt: 100 })];
  const r = S.dashValorNominal(S.dashDineroInvertido(mix, tipos), { items: [{ nombre: "P", contrato: P, n: 4 }] }, bce);
  assert("una compra dice € (3 tokens) y otra $ (1): gana € por tokens", r.filas[0].moneda === "EUR", r.filas[0]);
  const sinBce = S.dashValorNominal(S.dashDineroInvertido(mix, tipos), { items: [{ nombre: "P", contrato: P, n: 4 }] }, null);
  assert("con € y sin ningún tipo del BCE: sin ≈ USD", sinBce.aprox === null && sinBce.bce === null);
  const soloUsd = S.dashValorNominal(S.dashDineroInvertido([compra(P, "2024-03-01", "ONCHAIN", 2, { importe_usdt: 200 })], tipos),
    { items: [{ nombre: "P", contrato: P, n: 2 }] }, bce);
  assert("solo $: el total en USD es la cifra tal cual, sin BCE", soloUsd.aprox === null && soloUsd.bce === null && soloUsd.usd === 200);
  assert("sin cartera o sin clasificación: null", S.dashValorNominal(null, { items: [] }, bce) === null && S.dashValorNominal(inv, null, bce) === null);
}

console.log("== 4. La tarjeta ==");
const serie = S.dashSerieMensual(inv.movimientos);
const apagado = S.dashTarjetaInvertido(inv, serie, nom);
assert("apagado: cifra, desglose, interruptor con «≈ 3.560,00 USD» y el gráfico; sin subtítulo",
  /dash-desglose">.*<div class="dash-nominal-fila"><label class="rv-interruptor dash-nominal-sw"><input type="checkbox" role="switch">/.test(apagado) &&
  apagado.includes('<span class="dash-nominal-k">≈ 3.560,00 USD</span>') && apagado.includes("dash-invertido") &&
  !apagado.includes("Lo pagado por los tokens"), apagado.slice(0, 900));
assert("sin cartera: sin interruptor", !S.dashTarjetaInvertido(inv, serie, null).includes("dash-nominal"));
vm.runInContext("dashNominal = true", S);
const encendido = S.dashTarjetaInvertido(inv, serie, nom);
assert("encendido: «2.600,00 € · 700,00 $», ≈ USD con el BCE y «Ver el detalle»; sin gráfico",
  encendido.includes('<div class="dash-value-lg">2.600,00 €<span class="dash-nominal-sep">·</span>700,00 $</div>') &&
  encendido.includes("≈ 3.560,00 USD <span class=\"dash-bce\">(€ al BCE del 03/06/2024, 1,1000)</span>") &&
  encendido.includes(" checked>") && encendido.includes("Ver el detalle") && !encendido.includes("dash-invertido") &&
  encendido.includes("⚠ 1 inmueble sin compra, fuera del total."), encendido);
vm.runInContext("dashNominal = false", S);

console.log("== 5. La ventana del detalle ==");
const det = S.dashHtmlDetalleNominal({ nominal: nom, invertido: inv, ultimo: 1234.5 });
assert("tres grupos: en €, en $ y sin compra, sin fila «Total»",
  det.indexOf("Proyectos en €") < det.indexOf("Proyectos en $") && det.indexOf("Proyectos en $") < det.indexOf("Sin compra") && !/>Total</.test(det));
assert("marcas solo en lo raro: «tu ajuste», «sin precio por token», «1,00 tokens sin compra»",
  det.includes("(tu ajuste)") && det.includes("(sin precio por token)") && det.includes("(1,00 tokens sin compra)") &&
  (det.match(/\(tu ajuste\)/g) || []).length === 1);
assert("las dos cajas: nominal con ≈ USD y coste real con la cifra de la tarjeta",
  det.includes("<div class=\"dash-dlg-t\">Valor nominal</div><div class=\"dash-dlg-k\">(Lo que muestra la web de Reental)</div><b>2.600,00 € · 700,00 $</b><div class=\"dash-dlg-k\">≈ 3.560,00 USD*</div>") && det.includes("1.234,50 USD"));
assert("textos del plan (valor nominal, coste real y pie)", det.includes("<b>Valor nominal</b> (lo que muestra la web de Reental como «Invertido»)") &&
  det.includes("<b>Coste real</b> es lo que cuenta en 🧾 Fiscal") && det.includes("* Puede diferir de la web de Reental") &&
  det.indexOf("dash-dlg-pie") < det.indexOf("<table>"));

console.log("== 6. Auditoría ==");
{
  const A = C("1a"), B = C("2b"), V = C("3c"), N = C("4d"), T = C("5e");
  const una = (items, regs, aj, t) => {
    const i = S.dashDineroInvertido(regs, t || tipos, aj);
    return { inv: i, nom: S.dashValorNominal(i, { items: items.map(([c, n]) => ({ nombre: "P" + c.slice(2, 4), contrato: c, n })) }, bce) };
  };
  // F2: lo pagado de un inmueble que ya no está en la cartera, y tokens comprados que ya no tienes.
  const f2 = una([[A, 1], [T, 6]], [compra(A, "2024-03-01", "ONCHAIN", 1, { importe_usdt: 108 }),
    compra(B, "2024-03-01", "ONCHAIN", 2, { importe_usdt: 200 }), compra(T, "2024-03-01", "ONCHAIN", 10, { importe_usdt: 1000 })]);
  const detF2 = S.dashHtmlDetalleNominal({ nominal: f2.nom, invertido: f2.inv, ultimo: 1308 });
  assert("F2: «Fuera de tu cartera» con lo pagado de B (200 $): filas + fuera = la caja",
    f2.nom.fuera && f2.nom.fuera.n === 1 && cerca(f2.nom.fuera.costeUsd, 200) &&
    cerca(f2.nom.filas.reduce((t, f) => t + f.costeUsd, 0) + f2.nom.fuera.costeUsd, f2.inv.usdStable) &&
    detF2.includes("Fuera de tu cartera</td></tr><tr><td>1 inmueble</td>"), f2.nom.fuera);
  assert("F2: 10 comprados y 6 en la cartera: «(4,00 tokens que ya no tienes)»",
    fila(f2.nom, T).sinSaldo === 4 && detF2.includes("(4,00 tokens que ya no tienes)"), fila(f2.nom, T));
  assert("F2: sin nada fuera, sin esa fila", nom.fuera === null || !det.includes("Fuera de tu cartera"));
  // F4: un tipo del BCE a 0 (escrito a mano) no cuenta.
  const t0 = S.dashUltimoTipoBce({ tipos_bce: { "2024-03-01": 1.08, "2024-03-02": 0, "2024-03-03": "x" } });
  assert("F4: el último tipo con valor (1,08), no el 0", t0 && t0.valor === 1.08 && t0.fecha === "2024-03-01", t0);
  assert("F4: sin ningún tipo con valor: null", S.dashUltimoTipoBce({ tipos_bce: { "2024-03-02": 0 } }) === null);
  // F5: transferencia sin tipo del BCE de su día: proyecto en €, en el total, con el motivo.
  const f5 = una([[A, 10]], [compra(A, "2025-09-10", "BANCARIA", 10, { coste_eur: 1000 })]);
  assert("F5: compra fuera de lo pagado (sin tipo del BCE): €, 1.000,00 € en el total y «compra sin tipo del BCE»",
    f5.inv.sinCambio === 1 && fila(f5.nom, A).moneda === "EUR" && f5.nom.eur === 1000 && fila(f5.nom, A).motivo === "sin tipo del BCE" &&
    fila(f5.nom, A).sinCompra === 0 &&
    S.dashHtmlDetalleNominal({ nominal: f5.nom, invertido: f5.inv, ultimo: 0 }).includes("(compra sin tipo del BCE)"), fila(f5.nom, A));
  // F7: polvo de tokens.
  const f7 = una([[A, 0.00004]], [compra(A, "2024-03-01", "ONCHAIN", 1, { importe_usdt: 108 })]);
  vm.runInContext("dashNominal = true", S);
  const tarjF7 = S.dashTarjetaInvertido(f7.inv, S.dashSerieMensual(f7.inv.movimientos), f7.nom);
  assert("F7: nominal 0,00: sin interruptor y apagado (no una cifra vacía)",
    !tarjF7.includes("dash-nominal") && !tarjF7.includes('<div class="dash-value-lg"></div>') && vm.runInContext("dashNominal", S) === false);
  const f7b = una([[A, 1.004]], [compra(A, "2024-03-01", "ONCHAIN", 1, { importe_usdt: 108 })]);
  assert("F7: 0,004 tokens de más no se marcan («0,00 tokens sin compra»)", fila(f7b.nom, A).sinCompra === 0 && fila(f7b.nom, A).sinSaldo === 0);
  // F10: el interruptor no vuelve encendido sin verlo.
  vm.runInContext("dashNominal = true", S);
  S.dashTarjetaInvertido(inv, serie, null);
  assert("F10: sin cartera, el interruptor se apaga", vm.runInContext("dashNominal", S) === false);
  vm.runInContext("dashNominal = true", S);
  S.dashTarjetaInvertido(null, null, null);
  assert("F10: sin clasificación, también", vm.runInContext("dashNominal", S) === false);
  // F8: con dos claves iguales tras normalizar, la primera (como 💶).
  const r8 = compra(A, "2024-03-01", "BANCARIA", 10, { coste_eur: 1000, clave: "K8" });
  const f8 = una([[A, 10]], [r8], { "K8": { coste_eur: 1000, nota: "Coste puesto por ti" }, "k8": { nota: "otra" } });
  const f8b = una([[A, 10]], [r8], { "k8": { nota: "otra" }, "K8": { coste_eur: 1000, nota: "Coste puesto por ti" } });
  assert("F8: con «K8» primero (coste puesto por ti) vota €; con «k8» primero, no vota (como cbSupuesto)",
    f8.inv.colas.get(A)[0].moneda === "EUR" && f8b.inv.colas.get(A)[0].moneda === null,
    [f8.inv.colas.get(A)[0], f8b.inv.colas.get(A)[0]]);
  // F9: canje de una compra sin cantidad: el token nuevo lleva su marca.
  const hash9 = "0x" + "7".repeat(64);
  const f9 = una([[N, 1]], [compra(V, "2024-03-01", "ONCHAIN", null, { importe_usdt: 108 }),
    { clave: "kb9", fecha: "2024-06-03 11:00:00", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", hash: hash9, inmueble: "V", contrato: V, cantidad: 1 },
    { clave: "kc9", fecha: "2024-06-03 11:00:00", categoria: "COMPRA", subcategoria: "COSTE_BASE", hash: hash9, inmueble: "N", contrato: N, via_compra: "CANJE", cantidad: 1 }]);
  assert("F9: el token nuevo sale con «sin precio por token» y su coste, no como «sin compra»",
    fila(f9.nom, N).sinPrecio && fila(f9.nom, N).moneda === "USD" && cerca(fila(f9.nom, N).costeUsd, 108) && f9.nom.fuera === null, fila(f9.nom, N));
}

console.log("\n" + ok + " OK, " + fallos + " FALLOS");
process.exit(fallos ? 1 : 0);
