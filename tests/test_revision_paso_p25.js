/* Test de P25: la tarjeta de una venta por vincular en 🔍 Revisión.
 *
 * Bajo prueba (Reental-SPA/js/15-correcciones.js):
 * - ccHtmlTarjeta: «🔗 Por vincular» en la línea de datos (a la derecha) y,
 *   si la tarjeta ofrece «Es una venta…», sin el botón suelto de
 *   «🔗 Vincular cobro…»: al abrirla, «🔗 Elegir el cobro recibido…» junto a
 *   Guardar, antes del ≈ €.
 * - Sin «Es una venta…» (no está a revisar o tiene un ajuste ajeno), el
 *   botón suelto de siempre; «➕ Añadir otro cobro», igual.
 * - «En euros (€)» / «En dólares (USD)»: la venta cobrada en € (cobrado_eur),
 *   de punta a punta: ajuste, clasificación, motor, informe, Excel, PDF, 📊 y 📒.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_revision_paso_p25.js
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
const W = "0x" + "11".repeat(20), R = "0x" + "77".repeat(20), INM = "0x" + "a1".repeat(20);
const ctx = { propias: new Set([W]), inmuebles: new Set([INM]) };
const salida = Object.assign({ clave: "s1", fecha: "2026-06-18 10:00:00", hash: "0x" + "ab".repeat(32), contrato: INM,
  simbolo: "Reental-X", cantidad: 3.5, categoria: "REVISAR", subcategoria: "PENDIENTE", inmueble: "Casa X",
  origen: W, destino: R, fuente: "ONCHAIN", nota: "", revisar: true });
const decision = (abierta, estado = "libre") => ({ estado, opciones: S.ccOpcionesDecision(salida, ctx), abierta, eur: null });
const tarjeta = (dec, extra = {}) => S.ccHtmlTarjeta(Object.assign({}, salida, extra), { candidatura: "salida", decision: dec });
const nVincular = h => (h.match(/data-accion="abrir-buscador"/g) || []).length;

console.log("== 1. Cerrada ==");
const cerrada = tarjeta(decision(null));
assert("ofrece «Es una venta…» y «Movimiento neutro»", /Es una venta…/.test(cerrada) && /Movimiento neutro/.test(cerrada));
assert("sin el botón suelto de «🔗 Vincular cobro…»", nVincular(cerrada) === 0, cerrada);
const meta = cerrada.slice(cerrada.indexOf('class="cc-meta"'), cerrada.indexOf('class="cc-hash"'));
assert("«🔗 Por vincular» en la línea de datos, después de la ruta",
  /🔗 Por vincular/.test(meta) && meta.indexOf("Por vincular") > meta.indexOf("→"), meta);
const top = cerrada.slice(cerrada.indexOf('class="cc-item-top"'), cerrada.indexOf('class="cc-meta"'));
assert("y no en la de arriba (ahí, la cantidad y «A revisar»)", !/Por vincular/.test(top) && /A revisar/.test(top), top);

console.log("== 2. Con «Es una venta…» abierta ==");
const abierta = tarjeta(decision({ clave: "s1", id: "venta", valor: "" }));
assert("un botón al buscador, una vez", nVincular(abierta) === 1, nVincular(abierta));
const form = abierta.indexOf('class="cc-dec-form"'), boton = abierta.indexOf("🔗 Elegir el cobro recibido…");
const moneda = abierta.indexOf('data-accion="decidir-moneda"'), aprox = abierta.indexOf('class="cc-dec-eur');
assert("«🔗 Elegir el cobro recibido…» en el formulario, tras «En euros (€)» y antes del ≈ €",
  form > 0 && moneda > form && boton > moneda && aprox > boton, [form, moneda, boton, aprox]);
assert("abre el buscador de siempre", /data-accion="abrir-buscador" data-clave="s1">🔗 Elegir el cobro recibido…/.test(abierta));

console.log("== 3. Sin «Es una venta…»: el botón suelto ==");
assert("no está a revisar (sin decisiones)", nVincular(S.ccHtmlTarjeta(salida, { candidatura: "salida", decision: null })) === 1);
const ajena = tarjeta(decision(null, "ajeno"));
assert("con un ajuste ajeno (no salen las decisiones)", nVincular(ajena) === 1 && !/Es una venta…/.test(ajena), ajena);
const otraAbierta = tarjeta(decision({ clave: "s1", id: "neutro", valor: "" }));
assert("con otra decisión abierta, ni suelto ni debajo", nVincular(otraAbierta) === 0);

console.log("== 4. Lo demás, igual ==");
const vinc = S.ccHtmlTarjeta(Object.assign({}, salida, { revisar: false }),
  { vinculada: { rol: "salida", ventaIds: ["pd_1"], asignado: null } });
assert("una venta ya vinculada: «➕ Añadir otro cobro»", /➕ Añadir otro cobro/.test(vinc) && !/Por vincular/.test(vinc));
const noCand = S.ccHtmlTarjeta(salida, { decision: decision({ clave: "s1", id: "venta", valor: "" }) });
assert("no está por vincular: «Es una venta…» sin el botón de vincular", nVincular(noCand) === 0 && /cc-dec-form/.test(noCand));

console.log("== 5. «En euros (€)» en el formulario de la venta ==");
const enEur = tarjeta(decision({ clave: "s1", id: "venta", valor: "950", enEur: true }));
assert("en €: la casilla dice €, sin «≈ … €» y el botón para volver, «En dólares (USD)»",
  /aria-label="Cobrado en €"/.test(enEur) && /> €<\/label>/.test(enEur) && /data-accion="decidir-moneda"[^>]*>En dólares \(USD\)</.test(enEur) &&
  /<span class="cc-dec-eur help"><\/span>/.test(enEur), enEur);
assert("en USD (lo de siempre): «En euros (€)»", /data-accion="decidir-moneda"[^>]*>En euros \(€\)</.test(abierta) && /> USD<\/label>/.test(abierta));
const dinero = S.ccHtmlDecisiones({ clave: "d1", simbolo: "USDT0" }, { estado: "libre", opciones: [{ id: "dinero", etiqueta: "Ingreso de dinero…", pide: "usd" }],
  abierta: { id: "dinero", valor: "" }, eur: null });
assert("«Ingreso de dinero…» sin «En euros (€)» (lo que llega es USDT o USDC)", !/decidir-moneda/.test(dinero), dinero);

console.log("== 6. El ajuste en € ==");
const F = "2026-10-20T10:00:00.000Z";
const conEur = S.ccAjustesConDecision({}, salida, "venta", "1.250,5", F, true).s1;
assert("guarda cobrado_eur (sin importe_usdt) y la venta", conEur.cobrado_eur === 1250.5 && !("importe_usdt" in conEur) &&
  conEur.categoria === "VENTA" && conEur.subcategoria === "GPP_INMUEBLE" && conEur.revisar === false, conEur);
const conUsd = S.ccAjustesConDecision({}, salida, "venta", "720", F).s1;
assert("sin «En €…», en USD como siempre", conUsd.importe_usdt === 720 && !("cobrado_eur" in conUsd), conUsd);
assert("es una decisión de 🔍 (se deshace en «Ya decididos»)", S.ccEsAjusteDecision(conEur) &&
  JSON.stringify(S.ccAjustesSinDecision({ s1: conEur }, "s1", F)) === "{}");
assert("«Ya decididos»: «Venta · 1.250,50 €»", S.ccResumenDecision(conEur) === "Venta · 1.250,50 €", S.ccResumenDecision(conEur));
let lanza = "";
try { S.ccAjustesConDecision({}, salida, "venta", "1250.5", F, true); } catch (e) { lanza = e.message; }
assert("en € también pide la coma («1250.5» no vale)", /coma/i.test(lanza), lanza);
const yaVenta = Object.assign({}, salida, { categoria: "VENTA", subcategoria: "GPP_INMUEBLE", cobrado_eur: 10 });
assert("una venta que ya trae lo cobrado en €: «✔ Venta», no «sin importe»",
  S.ccOpcionesDecision(yaVenta, ctx).some(o => o.id === "dejar"), S.ccOpcionesDecision(yaVenta, ctx).map(o => o.id));

console.log("== 7. De punta a punta: motor, informe, 📊 y 📒 ==");
const { sandbox } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_EXCEL } = require("./paridad_excel_paso_62.js");
const sb = sandbox([...new Set(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js",
  "20-coste-compras.js", "21-fiscal.js", "22-informe-renta.js", ...MODULOS_EXCEL, "23-fiscal-pestana.js", "27-informe-pdf.js"])]);
const ev = x => vm.runInContext(x, sb);
const STATE = ev("state");
const W2 = "0x" + "1e".repeat(20), V2 = "0x" + "2f".repeat(20), REENTAL = "0x" + "77".repeat(20), COMPRADOR = "0x" + "88".repeat(20);
const P1 = "0x" + "b1".repeat(20);
let n = 0;
const ts = f => String(Date.parse(f + "T09:00:00Z") / 1000);
const tok = (de, a, q, f) => ({ blockNumber: String(100 + ++n), timeStamp: ts(f), hash: "0x" + String(n).padStart(4, "0") + "ef".repeat(30),
  from: de, to: a, contractAddress: P1, value: (BigInt(q) * 10n ** 18n).toString(), tokenName: "Reental Prueba Alcazaba 1",
  tokenSymbol: "RALC1", tokenDecimal: "18" });
const cache = sb.asegurarEstructuraCache(sb.cacheVacia());
cache.catalogo_propiedades = { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba Alcazaba 1", simbolo: "RALC1" } };
cache.transacciones.wallet_tokens.push(tok(REENTAL, W2, 4, "2024-01-15"), tok(W2, COMPRADOR, 3, "2024-06-03"));
cache.tipos_bce = {}; // sin un solo tipo: la venta en € no lo necesita
const csv = sb.cargarCsvRendimientos(["dividend,date,reinvested,claimed,distributed,retained,reinvests,wallet",
  "\"Prueba Alcazaba 1#2024-T1\",2024-04-10,40,0,40,0,\"['0x" + "99".repeat(32) + "']\"," + W2].join("\n"));
if (csv.error) throw new Error(csv.error);
STATE.config = { wallet: W2, vault: V2, compra_bancaria_coste_eur_por_token: 100 };
STATE.cache = cache;
const clasificar = () => {
  sb.descubrimientoDinamico(cache, csv.filas, csv.indicePorHash, W2, V2);
  return (STATE.registros = sb.clasificarTransacciones(cache, csv.filas, csv.indicePorHash, STATE.config, {}));
};
let regs = clasificar();
const sal = regs.find(r => sb.normalizarDireccion(r.destino) === COMPRADOR);
const ctx0 = sb.ccContextoCandidatos(cache, STATE.config, regs);
assert("la salida a revisar ofrece «Es una venta…»", sal && sb.ccOpcionesDecision(sal, ctx0).some(o => o.id === "venta"));
// La lista de 🔍 tal como la pinta la app (con sus decisiones).
const lista = abierta => sb.ccHtmlLista(regs, sb.ccColaRevision(regs, ctx0), ctx0, [],
  { abierta, ajustes: cache.ajustes_usuario, tiposBce: {}, cache, dudas: 0 });
const buscador = h => (h.match(/data-accion="abrir-buscador"/g) || []).length;
const listaAbierta = lista({ clave: sal.clave, id: "venta", valor: "", enEur: false });
assert("lista de 🔍: cerrada, sin el botón suelto; con «Es una venta…» abierta, «🔗 Elegir el cobro recibido…» en su formulario",
  buscador(lista(null)) === 0 && buscador(listaAbierta) === 1 &&
  /class="cc-dec-form"[^]*🔗 Elegir el cobro recibido…/.test(listaAbierta), [buscador(lista(null)), buscador(listaAbierta)]);
cache.ajustes_usuario = sb.ccAjustesConDecision(cache.ajustes_usuario, sal, "venta", "450", F, true);
const avisos = [], logAntes = sb.log;
sb.log = (m, ...resto) => { if (/no existía en el registro/.test(String(m))) avisos.push(m); return logAntes && logAntes(m, ...resto); };
regs = clasificar();
sb.log = logAntes;
const rv = regs.find(r => r.clave === sal.clave);
assert("clasificada: venta, fuera de revisar, con lo cobrado en € y sin USD", rv.categoria === "VENTA" && rv.revisar === false &&
  rv.cobrado_eur === 450 && rv.importe_usdt == null, [rv.categoria, rv.revisar, rv.cobrado_eur, rv.importe_usdt]);
assert("sin el aviso de «campo que no existía»", avisos.length === 0, avisos);
assert("📒: «450 €» en Importe y no es un canje", sb.txImporte(rv) === "450 €" && !sb.txEsCanje(rv), sb.txImporte(rv));
const copia = structuredClone(regs);
sb.__regs = copia; sb.__cache = cache;
sb.__op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
ev("motorFiscal(__regs, __cache, state.config, __op)");
const v = copia.find(r => r.clave === sal.clave);
assert("motor: valor de transmisión 450 € tal cual, sin tipo del BCE", v.importe_eur === 450 && v.revisar === false && !v.tipo_bce,
  [v.importe_eur, v.revisar, v.tipo_bce, v.nota]);
assert("motor: coste FIFO de 3 tokens (300 €) y ganancia 150 €", Math.abs(v.coste_fifo_eur - 300) < 0.005 && Math.abs(v.gp_eur - 150) < 0.005,
  [v.coste_fifo_eur, v.gp_eur]);
assert("motor: no abre lote de stablecoin (lo dice la nota)", /cobrado en € fuera de esta transacción/.test(v.nota), v.nota);
const informes = sb.informesRentaAnuales(copia, sb.resumenFiscalAnual(copia), STATE.config, Object.assign({}, sb.__op, { cache, hoy: "2026-10-15" }));
const tabla = informes[2024].detalle.ventas_inmuebles;
assert("informe: transmisión 450 € y en USD «—» (null), fila y total", tabla.filas.length === 1 &&
  tabla.filas[0].valor_transmision_eur === 450 && tabla.filas[0].valor_transmision_usd === null &&
  tabla.total.valor_transmision_usd === null && tabla.total.valor_transmision_eur === 450, tabla);

const bce = {};
for (let d = Date.parse("2024-01-01"); d <= Date.parse("2024-12-31"); d += 864e5) bce[new Date(d).toISOString().slice(0, 10)] = 1.1;
const inv = sb.dashDineroInvertido(regs, bce, cache.ajustes_usuario, cache);
// Compra: 400 € × 1,1 = 440 USD (110 por token); venta: 450 € × 1,1 = 495 USD − 3 × 110 = 165 USD.
assert("📊: la ganancia, en USD con el BCE del día (450 € × 1,1 − 330)", Math.abs(inv.gananciaVentas - 165) < 0.005 && inv.ventasSinCobro === 0,
  [inv.gananciaVentas, inv.ventasSinCobro]);
// Sin tipos de dos meses antes de la venta (la compra sí lo tiene).
const bceSinVenta = Object.fromEntries(Object.entries(bce).filter(([d]) => d < "2024-04-01" || d > "2024-06-03"));
const invSin = sb.dashDineroInvertido(regs, bceSinVenta, cache.ajustes_usuario, cache);
assert("📊: sin el tipo del BCE del día de la venta, en el gráfico sin su ganancia (ni «compra» ni «sin cobrar»)",
  invSin.ventasSinCambio === 1 && invSin.sinCambio === 0 && invSin.ventasSinCobro === 0 && invSin.gananciaVentas === 0 &&
  invSin.movimientos.length === 2 && !/compra/.test(sb.dashAvisosInvertido(invSin)),
  [invSin.ventasSinCambio, invSin.sinCambio, invSin.ventasSinCobro, invSin.movimientos.length, sb.dashAvisosInvertido(invSin)]);
const rentSin = sb.dashRentabilidadMedia(invSin, sb.dashSerieMensual(invSin.movimientos), { total: 10 }, "2026-10-20");
assert("📊: la rentabilidad dice por qué no sale: «1 venta en € sin tipo del BCE.»", rentSin.motivo === "1 venta en € sin tipo del BCE.", rentSin);

// Con el tipo del BCE del día de la venta, el informe tampoco se inventa sus USD.
cache.tipos_bce = bce;
const copia2 = structuredClone(regs);
sb.__regs = copia2;
sb.__op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
const colas2 = ev("motorFiscal(__regs, __cache, state.config, __op)");
const v2 = copia2.find(r => r.clave === sal.clave);
const tabla2 = sb.informesRentaAnuales(copia2, sb.resumenFiscalAnual(copia2), STATE.config,
  Object.assign({}, sb.__op, { cache, hoy: "2026-10-15" }))[2024].detalle.ventas_inmuebles;
assert("con tipo del BCE ese día: 450 € tal cual y en USD «—» (no 450 × 1,1)", v2.tipo_bce === 1.1 && v2.importe_eur === 450 &&
  tabla2.filas[0].valor_transmision_usd === null && tabla2.total.valor_transmision_usd === null, [v2.tipo_bce, v2.importe_eur, tabla2.filas[0]]);

const resumen2 = sb.resumenFiscalAnual(copia2);
const informes2 = sb.informesRentaAnuales(copia2, resumen2, STATE.config, Object.assign({}, sb.__op, { cache, hoy: "2026-10-15" }));
const libro = sb.excelLibro(copia2, colas2, resumen2, cache, STATE.config, informes2, new Date("2026-10-15T10:00:00Z"), "2026-10-15");
const hoja = libro.hojas.find(h => h.nombre === "Fiscal 2024");
const celdas = n => [...(hoja.filas.get(n) || new Map())].map(([c, x]) => [c, x.valor]);
const nCab = [...hoja.filas.keys()].find(n => celdas(n).some(([, v]) => v === "Valor de transmisión USD"));
const colUsd = celdas(nCab).find(([, v]) => v === "Valor de transmisión USD")[0];
const valor = (n, c) => (celdas(n).find(([k]) => k === c) || [])[1];
assert("Excel: la venta con «—» en «Valor de transmisión USD», en su fila y en el total, y 450 en EUR",
  valor(nCab + 1, colUsd) === "—" && valor(nCab + 1, colUsd + 1) === 450 && valor(nCab + 2, 1) === "Total" && valor(nCab + 2, colUsd) === "—",
  [celdas(nCab + 1), celdas(nCab + 2)]);
// «Transacciones»: sin «Tipo BCE» (no se usó) y con lo cobrado en €; a
// revisar, «Revisión» dice lo cobrado en €, no los tokens.
const celdasDe = (l, nombre, n) => [...(l.hojas.find(h => h.nombre === nombre).filas.get(n) || new Map())].map(([c, x]) => [c, x.valor]);
const filaTx = [...libro.hojas.find(h => h.nombre === "Transacciones").filas.keys()]
  .find(n => celdasDe(libro, "Transacciones", n).some(([, v]) => v === v2.hash));
const tx = Object.fromEntries(celdasDe(libro, "Transacciones", filaTx));
assert("Excel «Transacciones»: la venta en €, sin «Tipo BCE» y con 450 en «Importe EUR»", !(8 in tx) && tx[9] === 450, tx);
const aRevisar = copia2.map(r => (r.clave === sal.clave ? Object.assign({}, r, { revisar: true }) : r));
const libroRev = sb.excelLibro(aRevisar, colas2, resumen2, cache, STATE.config, informes2, new Date("2026-10-15T10:00:00Z"), "2026-10-15");
const hojaRev = libroRev.hojas.find(h => h.nombre === "Revisión");
const filaRev = [...hojaRev.filas.keys()].find(n => celdasDe(libroRev, "Revisión", n).some(([, v]) => v === v2.hash));
const rev = Object.fromEntries(celdasDe(libroRev, "Revisión", filaRev));
assert("Excel «Revisión»: la venta en € a revisar, con 450 € en «Importe estimado» (no los tokens)",
  rev[4] === 450 && hojaRev.filas.get(filaRev).get(4).estilo.formato === "#,##0.00 €", rev);
const pdf = sb.pdfHtml(informes2[2024], new Date("2026-10-15T10:00:00Z"));
const trozo = pdf.slice(pdf.indexOf("pdf-transmisiones")).replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
assert("PDF: la venta con «—» en USD y 450,00 en EUR", /\|—\|450,00\|/.test(trozo), trozo.slice(0, 400));

console.log("== 8. Validación y canjes ==");
assert("«Ajustes en JSON»: lo cobrado en € no puede ser negativo", /no puede ser negativo/.test(sb.errorAjustesUsuario({ k: { cobrado_eur: -5 } }) || ""));
const H = "0x" + "cd".repeat(32);
const pares = sb.emparejarCanjes([{ clave: "a", hash: H, categoria: "COMPRA", via_compra: "CANJE", cantidad: 1, inmueble: "X" },
  { clave: "b", hash: H, categoria: "VENTA", subcategoria: "GPP_INMUEBLE", destino: vm.runInContext("BURN", sb), cantidad: 1, inmueble: "X", cobrado_eur: 10 }]);
assert("una quema vendida en € no se toma por canje", pares.size === 0);
const A = "0x" + "c1".repeat(20), B = "0x" + "c2".repeat(20), BURN_ = vm.runInContext("BURN", sb);
const conCanje = [
  { clave: "c", hash: "0x" + "01".repeat(32), fecha: "2024-01-15 09:00:00", categoria: "COMPRA", via_compra: "BANCARIA", inmueble: "X", contrato: A, cantidad: 2, coste_eur: 200 },
  { clave: "v", hash: H, fecha: "2024-06-03 09:00:00", categoria: "VENTA", subcategoria: "GPP_INMUEBLE", inmueble: "X", contrato: A, cantidad: 2, destino: BURN_, cobrado_eur: 300 },
  { clave: "k", hash: H, fecha: "2024-06-03 09:00:00", categoria: "COMPRA", via_compra: "CANJE", inmueble: "X", contrato: B, cantidad: 2 }];
const invCanje = sb.dashDineroInvertido(conCanje, bce, {}, cache);
assert("📊: tampoco (cuenta la venta y su ganancia: 300 € × 1,1 − 220)", invCanje.ventas === 1 && Math.abs(invCanje.gananciaVentas - 110) < 0.005,
  [invCanje.ventas, invCanje.gananciaVentas]);

const texto = JSON.parse(JSON.stringify(cache.ajustes_usuario));
texto[sb.ccBuscarAjuste(texto, sal.clave).clave].cobrado_eur = "450";
const cacheTexto = Object.assign({}, cache, { ajustes_usuario: texto });
STATE.cache = cacheTexto;
sb.descubrimientoDinamico(cacheTexto, csv.filas, csv.indicePorHash, W2, V2);
const copia3 = structuredClone(sb.clasificarTransacciones(cacheTexto, csv.filas, csv.indicePorHash, STATE.config, {}));
sb.__regs = copia3; sb.__cache = cacheTexto;
sb.__op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
ev("motorFiscal(__regs, __cache, state.config, __op)");
const v3 = copia3.find(r => r.clave === sal.clave);
assert("«Ajustes en JSON» con lo cobrado en € escrito como texto («450»): a revisar, sin valorar",
  v3.revisar === true && !(v3.importe_eur > 0), [v3.revisar, v3.importe_eur, v3.nota]);
STATE.cache = cache;

console.log("\n  " + ok + "/" + (ok + fallos) + " comprobaciones OK -> " + (fallos ? "HAY FALLOS" : "TODO VERDE"));
process.exit(fallos ? 1 : 0);
