/* Test de arreglos de la app. Una sección por fallo arreglado.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_arreglos_paso_arreglos1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
function nuevoSandbox(archivos) {
  const sb = { console, state: {} };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  vm.runInContext("log = function () {}; toast = function () {};", sb);
  return sb;
}
const MOTOR = ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js", "14-clasificador.js"];
/* Con un DOM falso (los campos, por id) y soportaFSA, para js/04 y js/19. */
function sandboxConDom(archivos, campos = {}, extra = {}) {
  const elementos = {};
  const sb = Object.assign({ console, document: { getElementById: id => (elementos[id] = elementos[id] ||
    { id, value: campos[id] || "", dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } }) } }, extra);
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext("var soportaFSA = true;", sb);
  for (const f of archivos) vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), sb, { filename: f });
  return { sb, elementos };
}

let ok = 0, fallos = 0;
const pendientes = []; // secciones asíncronas: se ejecutan en orden al final
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const WALLET = "0x" + "e1".repeat(20), VAULT = "0x" + "e2".repeat(20);
const TERCERO = "0x" + "e9".repeat(20);
const h = n => "0x" + n.toString(16).padStart(2, "0").repeat(32);
const HOY = "2026-10-02T10:00:00.000Z";
const CABECERA = "id,dividend,hashId,wallet,distributed,retained,reinvested,claimed,claims,reinvests,date";

function clasificar(rellenar, csv) {
  const sb = nuevoSandbox(MOTOR);
  const cache = sb.cacheVacia();
  rellenar(cache);
  Object.assign(sb, { __cache: cache, __csv: csv || CABECERA + "\n",
    __config: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100.0 } });
  vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos(__csv);
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});`, sb);
  return sb.__regs;
}

console.log("== G1. POL que entra en el vault ==");
{
  const regs = clasificar(cache => {
    cache.transacciones.vault_normales = [{ hash: h(1), from: TERCERO, to: VAULT,
      value: "5000000000000000000", gasUsed: "21000", gasPrice: "1", isError: "0", timeStamp: "1780000000" }];
  });
  const pol = regs.filter(r => r.hash === h(1));
  assert("un tercero manda 5 POL al vault: 1 registro REVISAR",
    pol.length === 1 && pol[0].categoria === "REVISAR" && pol[0].cantidad === 5 &&
    pol[0].nota.startsWith("entrada de POL nativo en el vault"), pol);
}

console.log("== G2. Importe del archivo de Reental redondeado a 6 decimales ==");
{
  const DISTRIBUIDOR = "0x" + "d7".repeat(20);
  const USDT = vm.runInContext("USDT", nuevoSandbox(MOTOR));
  const fila = `"1","Prueba #8/2026","id1","${WALLET}","4629,9248275","0","0","4629,9248275",` +
    `"[""${h(2)}""]","[]","2026-08-31T11:00:00.000Z"`;
  const regs = clasificar(cache => {
    cache.contratos_aprendidos.DISTRIBUIDOR[DISTRIBUIDOR] = "Distribuidor";
    cache.transacciones.wallet_tokens = [{ hash: h(2), contractAddress: USDT, from: DISTRIBUIDOR,
      to: WALLET, value: "4629924827", tokenDecimal: "6", tokenName: "USDT0", tokenSymbol: "USDT0",
      timeStamp: "1788000000" }];
  }, CABECERA + "\n" + fila + "\n");
  const rend = regs.filter(r => r.hash === h(2));
  assert("4629,9248275 casa con la transferencia de 4629,924827 (round -> ,924827)",
    rend.length === 1 && rend[0].categoria === "RENDIMIENTO" && !rend[0].revisar, rend);
}

console.log("== G3. «Ajustes en JSON» solo acepta objetos ==");
{
  const sb = nuevoSandbox(MOTOR);
  const err = texto => sb.errorAjustesUsuario(JSON.parse(texto));
  assert("null, una lista o un número: rechazados", err("null") && err("[]") && err("5"));
  assert("una entrada de texto: rechazada y se nombra",
    err('{"0xa::0xb": "texto"}').includes("0xa::0xb"), err('{"0xa::0xb": "texto"}'));
  assert("una entrada null o lista: rechazada", err('{"a": null}') && err('{"a": [1]}'));
  assert("vacío o con objetos: vale", err("{}") === "" && err('{"a": {"categoria": "SPAM"}, "b": {}}') === "");
}

console.log("== G5. Solo una cache de Reental vale como cache ==");
{
  const sb = nuevoSandbox(MOTOR);
  const config = { wallet: WALLET, vault: VAULT, etherscan_api_key: "x", inversor: { nombre: "A" } };
  assert("un config.json no es una cache", !!sb.errorCache(config));
  assert("«transacciones»: null no es una cache (antes se quedaba colgado)",
    !!sb.errorCache({ transacciones: null }) && !!sb.errorCache({ transacciones: [] }));
  assert("«ultimo_bloque» o «contratos_aprendidos» que no son objeto: no vale",
    !!sb.errorCache({ transacciones: {}, ultimo_bloque: null }) &&
    !!sb.errorCache({ transacciones: {}, contratos_aprendidos: 3 }));
  assert("null, una lista o un número: no valen", [null, [], 5, "x"].every(x => !!sb.errorCache(x)));
  assert("una cache nueva o una vieja con solo sus transacciones: valen",
    sb.errorCache(sb.cacheVacia()) === "" && sb.errorCache({ transacciones: { wallet_tokens: [] } }) === "");
}

{
  const campos = { cfgEthKey: "KEY-ESCRITA", cfgWallet: WALLET, cfgVault: "", cfgNombre: "Ana", cfgNif: "123X" };
  const { sb, elementos } = sandboxConDom(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "04-config.js"], campos,
    { localStorage: { setItem() {} } });
  sb.__obj = { wallet: VAULT, vault: "", compra_bancaria_coste_eur_por_token: 100 };
  vm.runInContext(`log = function () {}; toast = function () {}; state.config = {};
`, sb);
  pendientes.push(async () => {
    console.log("== G6. Cargar un config.json sin key, nombre ni NIF no borra lo escrito ==");
    vm.runInContext("usarConfigAbierta(__obj)", sb);   // desde «📂 Abrir copia» (js/19)
    const c = vm.runInContext("state.config", sb);
    assert("la wallet es la del archivo y la key, el nombre y el NIF los que tenías",
      c.wallet === VAULT && c.etherscan_api_key === "KEY-ESCRITA" && c.inversor.nombre === "Ana" &&
      c.inversor.nif === "123X" && elementos.cfgEthKey.value === "KEY-ESCRITA", c);
    const c2 = sb.conservarDatosConfig({ etherscan_api_key: "OTRA", inversor: { nombre: "Bea", nif: "" } },
      { etherscan_api_key: "KEY", inversor: { nombre: "Ana", nif: "1" } });
    assert("si el archivo trae key o nombre, mandan los del archivo",
      c2.etherscan_api_key === "OTRA" && c2.inversor.nombre === "Bea" && c2.inversor.nif === "1", c2);
  });
}

console.log("== G7. «Movimiento neutro» o «Es spam» sacan de Revisión una salida de un inmueble ==");
{
  const PROP = "0x" + "c1".repeat(20);
  const sb = nuevoSandbox([...MOTOR, "15-correcciones.js"]);
  const cache = sb.cacheVacia();
  cache.catalogo_propiedades[PROP] = { nombre_reental: "Prueba ES", nombre_etherscan: "PRUEBA ES", simbolo: "P", estado: "CONFIRMADA" };
  cache.transacciones.wallet_tokens = [{ hash: h(7), contractAddress: PROP, from: WALLET, to: TERCERO,
    value: "2000000000000000000", tokenDecimal: "18", tokenName: "P", tokenSymbol: "P", timeStamp: "1780000000" }];
  Object.assign(sb, { __cache: cache, __config: { wallet: WALLET, vault: VAULT, compra_bancaria_coste_eur_por_token: 100.0 } });
  const clasificarYa = () => vm.runInContext(`state.config = __config; __r = cargarCsvRendimientos(${JSON.stringify(CABECERA + "\n")});
    __regs = clasificarTransacciones(__cache, __r.filas, __r.indicePorHash, __config, {});
    __ctx = ccContextoCandidatos(__cache, __config, __regs); __regs.find(r => r.hash === "${h(7)}")`, sb);
  const salida = clasificarYa();
  assert("sin decidir: está en Revisión", !!sb.ccMotivoRevision(salida, sb.__ctx), salida);
  for (const id of ["neutro", "spam"]) {
    cache.ajustes_usuario = sb.ccAjustesConDecision({}, salida, id, null, HOY);
    const r = clasificarYa();
    assert("«" + id + "»: sale de Revisión, no queda «por vincular» y no cuenta en el menú",
      sb.ccMotivoRevision(r, sb.__ctx) === null && sb.ccPendienteDeVincular(r, sb.__ctx, false) === null &&
      sb.ccResumen(sb.__regs, sb.__ctx, false).enLista === 0, r);
  }
  cache.ajustes_usuario = {};
  const neutroMotor = Object.assign({}, clasificarYa(), { categoria: "MOVIMIENTO", revisar: false });
  assert("un neutro que no decidiste tú sigue por vincular (como hasta ahora)",
    sb.ccMotivoRevision(neutroMotor, sb.__ctx) === "salida");
}

console.log("== M2. Un vínculo guardado con problemas no impide crear otro ==");
{
  const sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js"]);
  const USDC = vm.runInContext("USDC", sb), P1 = "0x" + "a1".repeat(20);
  const H = n => "0x" + String(n).padStart(4, "0") + "ab".repeat(30);
  const reg = (hash, contrato, origen, destino, cantidad, categoria, clave, simbolo) => ({
    clave, fecha: "2026-05-12 09:45:46", hash, contrato, token: null, simbolo, cantidad, categoria,
    subcategoria: "PENDIENTE", inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen, destino, fuente: "ONCHAIN", nota: "", revisar: categoria === "REVISAR" });
  const tx = (hash, contrato, from, to, value, dec) => ({ hash, contractAddress: contrato, from, to, value,
    tokenDecimal: dec, timeStamp: "1778556800" });
  const cache = { catalogo_propiedades: { [P1]: { estado: "CONFIRMADA", nombre_reental: "Prueba" } },
    contratos_aprendidos: {}, ajustes_usuario: {}, pagos_diferidos: { version: 1, ventas: [] },
    transacciones: { wallet_tokens: [
      tx(H(1), P1, WALLET, TERCERO, "250000000000000000000", "18"), tx(H(2), USDC, TERCERO, WALLET, "300000000", "6"),
      tx(H(3), P1, WALLET, TERCERO, "100000000000000000000", "18"), tx(H(4), USDC, TERCERO, WALLET, "120000000", "6")],
      vault_tokens: [], wallet_normales: [], wallet_internas: [], vault_normales: [] } };
  const SA = reg(H(1), P1, WALLET, TERCERO, 250, "REVISAR", "sa", "P"), CA = reg(H(2), USDC, TERCERO, WALLET, 300, "DEPOSITO", "ca", "USDC");
  const SB = reg(H(3), P1, WALLET, TERCERO, 100, "REVISAR", "sb", "P"), CB = reg(H(4), USDC, TERCERO, WALLET, 120, "DEPOSITO", "cb", "USDC");
  const vincular = (ventas, s, c, cant) => {
    const refSalida = sb.ccReferenciaDeRegistro(s, cache), refCobro = sb.ccReferenciaDeRegistro(c, cache);
    const borrador = sb.ccBorradorVenta({ salida: s, cobro: c, refSalida, refCobro, cantidadAsignada: cant,
      estadoLiquidacion: "COMPLETA", importeEsperado: null, monedaEsperada: "USD", nota: "" });
    return sb.ccAplicarBorradorABloque(ventas, { borrador, refSalida, refCobro });
  };
  const guardadas = vincular([], SA, CA, 300).ventas;
  // La venta guardada se queda sin su salida (p. ej. la cache cambió): el motor da un problema.
  const regs = [CA, SB, CB];
  const base = sb.ccSimularBloque(regs, cache, guardadas);
  const escritura = vincular(guardadas, SB, CB, 120);
  const sim = sb.ccSimularBloque(regs, cache, escritura.ventas);
  const v = sb.ccValidacionBorrador({ regSalida: SB, regCobro: CB, cantidadOk: true, dupCobro: false,
    sim: sb.ccSoloLoNuevo(sim, base), ventaId: escritura.ventaId });
  assert("el bloque guardado ya trae su problema", base.info.problemas.length > 0, base.info.problemas);
  assert("el vínculo nuevo, válido, se puede guardar", v.ok, v.motivos);
  const malo = vincular(guardadas, SB, CB, 999);  // más de lo cobrado
  const vMalo = sb.ccValidacionBorrador({ regSalida: SB, regCobro: CB, cantidadOk: true, dupCobro: false,
    sim: sb.ccSoloLoNuevo(sb.ccSimularBloque(regs, cache, malo.ventas), base), ventaId: malo.ventaId });
  assert("uno nuevo con su propio problema sigue sin poder guardarse", !vMalo.ok, vMalo.motivos);
}

console.log("== M3. Deshacer una decisión devuelve el «Mandado a revisar» con su fecha y su motivo ==");
{
  const sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"]);
  const r = { clave: "r", categoria: "DEPOSITO", origen: TERCERO, destino: WALLET, contrato: "0x" + "c2".repeat(20), hash: h(9), fuente: "ONCHAIN" };
  const mandado = { r: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): comprobar con el banco: 1.200 €" } };
  const vuelta = sb.ccAjustesSinDecision(sb.ccAjustesConDecision(mandado, r, "neutro", null, HOY), "r", HOY);
  assert("vuelve exactamente lo que había (motivo con «:» incluido y su fecha)",
    JSON.stringify(vuelta) === JSON.stringify(mandado) && sb.txEsAjusteMandarRevisar(vuelta.r), vuelta);
  const sinMotivo = { r: { revisar: true, nota: "Mandado a revisar por ti (2026-09-29)" } };
  assert("sin motivo, también con su fecha", JSON.stringify(sb.ccAjustesSinDecision(
    sb.ccAjustesConDecision(sinMotivo, r, "dejar", null, HOY), "r", HOY)) === JSON.stringify(sinMotivo));
  const sacado = { r: { categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: "Sacado del spam por ti (2026-09-28)" } };
  assert("«Sacado del spam» vuelve con su fecha", JSON.stringify(sb.ccAjustesSinDecision(
    sb.ccAjustesConDecision(sacado, r, "neutro", null, HOY), "r", HOY)) === JSON.stringify(sacado));
  const antigua = { r: { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false,
    nota: "Decidido por ti en Revisión (2026-10-01): movimiento neutro [antes: mandado a revisar]" } };
  assert("una decisión de antes de este arreglo se sigue deshaciendo (con la fecha de hoy)",
    sb.ccAjustesSinDecision(antigua, "r", HOY).r.nota === "Mandado a revisar por ti (2026-10-02)");
}

console.log("== M4. Deshacer «✔ Dejar como compra» conserva el coste puesto en «💶 Coste…» ==");
{
  const sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js",
    "18-transacciones.js", "20-coste-compras.js"]);
  const compra = { clave: "c", categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", cantidad: 2,
    coste_eur: 200, origen: TERCERO, destino: WALLET, contrato: "0x" + "c1".repeat(20), hash: h(10), fuente: "ONCHAIN", revisar: true };
  for (const [nombre, previos] of [["sin nada antes", {}],
    ["con un «Mandado a revisar» antes", { c: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): ver" } }]]) {
    let aj = sb.ccAjustesConDecision(previos, compra, "dejar", null, HOY);
    aj = sb.cbAjustesConCostes(aj, [{ clave: "c", valor: 250 }], [compra], 100, HOY);
    const vuelta = sb.ccAjustesSinDecision(aj, "c", HOY);
    assert(nombre + ": el coste de 250 € sigue", vuelta.c && vuelta.c.coste_eur === 250, vuelta);
    if (!Object.keys(previos).length) {
      assert("…y queda como un coste del editor (se puede cambiar allí)",
        sb.cbEstadoCoste(compra, vuelta) === "propio" && vuelta.c.nota === "Coste puesto por ti (2026-10-02)", vuelta);
    } else {
      assert("…y vuelve también el «Mandado a revisar» con su motivo",
        vuelta.c.revisar === true && vuelta.c.nota === previos.c.nota, vuelta);
    }
  }
  const venta = { clave: "v", categoria: "REVISAR", cantidad: 2, origen: WALLET, destino: TERCERO,
    contrato: "0x" + "c1".repeat(20), inmueble: "Prueba", hash: h(11), fuente: "ONCHAIN", revisar: true };
  const aj = sb.ccAjustesConDecision({}, Object.assign({}, venta, { origen: TERCERO, destino: WALLET }), "compra", "300", HOY);
  assert("deshacer «Compra externa…» sí quita su coste (lo puso la decisión)",
    JSON.stringify(sb.ccAjustesSinDecision(aj, "v", HOY)) === "{}");
}

console.log("== M5. Editar un vínculo o añadirle un cobro conserva el importe esperado ==");
{
  const sb = nuevoSandbox(["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js"]);
  const venta = { id: "pd_1", estado: "CONFIRMADO", salida: { hash: h(1) }, importe_esperado_usd: 1000,
    moneda_esperada: "USD", estado_liquidacion: "PARCIAL", nota: "n",
    asignaciones: [{ id: "as_001", pago: { hash: h(2) }, cantidad_asignada: 300 }] };
  // Lo que hace el formulario al editar: cambia la parte del cobro, sin importe ni liquidación.
  const [ed] = sb.ccEditarVenta([venta], { ventaId: "pd_1", asignaciones: [{ asignacionId: "as_001", cantidadAsignada: 250 }], nota: "n" });
  assert("editar: la parte cambia y el importe esperado y la liquidación se quedan",
    ed.asignaciones[0].cantidad_asignada === 250 && ed.importe_esperado_usd === 1000 && ed.estado_liquidacion === "PARCIAL", ed);
  const [quitado] = sb.ccEditarVenta([venta], { ventaId: "pd_1", importeEsperado: null });
  assert("con importeEsperado: null, se quita (como antes)", quitado.importe_esperado_usd === null);
  // Añadir un cobro desde el formulario (borrador sin importe y COMPLETA).
  const borrador = { salida: { hash: h(1) }, importe_esperado_usd: null, moneda_esperada: "USD",
    estado_liquidacion: "COMPLETA", nota: "n", asignaciones: [{ pago: { hash: h(3) }, cantidad_asignada: 100 }] };
  sb.ccClaveRef = r => r.hash; // las referencias sintéticas solo traen el hash
  const r = sb.ccAplicarBorradorABloque([venta], { borrador, refSalida: { hash: h(1) }, conservarVenta: true });
  const v = r.ventas.find(x => x.id === "pd_1");
  assert("añadir un cobro: dos asignaciones y el importe esperado y la liquidación se quedan",
    v.asignaciones.length === 2 && v.importe_esperado_usd === 1000 && v.estado_liquidacion === "PARCIAL", v);
}

{
  const sb = nuevoSandbox([...MOTOR, "15-correcciones.js"]);
  vm.runInContext(`__avisos = []; toast = function (m, t) { __avisos.push([m, t]); };
    marcarCacheDirty = function () { state.cacheDirty = true; }; autoGuardarCache = async function () { state.cacheDirty = false; };
    state.cache = cacheVacia(); state.config = { wallet: "${WALLET}" }; state.csvCargado = false;`, sb);
  pendientes.push(async () => {
    console.log("== M6. Si no se puede reclasificar, el aviso no dice «Decidido» ==");
    await vm.runInContext(`ccGuardarAjustesDecision({ a: { revisar: false } }, "Decidido. Está en «Movimientos ya decididos».")`, sb);
    const ultimo = sb.__avisos[sb.__avisos.length - 1];
    assert("sin el archivo de rendimientos: dice qué falta y que se verá al clasificar",
      sb.__avisos.some(([m]) => m.startsWith("Falta el archivo de rendimientos")) &&
      ultimo[0] === "Apuntado: se verá cuando esté todo en 🚀 Puesta en marcha." && ultimo[1] === "warn" &&
      !sb.__avisos.some(([m]) => m.startsWith("Decidido")), sb.__avisos);
    assert("lo decidido sí queda apuntado en la cache", vm.runInContext("state.cache.ajustes_usuario.a.revisar", sb) === false);
  });
}

const TX = ["01-constantes.js", "02-utilidades.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js"];
console.log("== M7. Con un grupo pulsado, «Ver spam» y el selector cuentan el spam ==");
{
  const sb = nuevoSandbox(TX);
  const r = (clave, categoria, revisar) => ({ clave, categoria, revisar: !!revisar, fecha: "2026-01-01 10:00:00", cantidad: 1 });
  const regs = [r("a", "SPAM"), r("b", "SPAM"), r("c", "REVISAR", true), r("d", "VENTA")];
  const n = (f, cat) => (sb.txConteoCategorias(regs, Object.assign({ ocultarSpam: true }, f)).find(c => c.categoria === cat) || {}).n || 0;
  assert("con «A revisar» o «Con efecto fiscal»: 2 de spam (antes 0)", n({ grupo: "revisar" }, "SPAM") === 2 && n({ grupo: "fiscal" }, "SPAM") === 2);
  assert("las demás categorías siguen contando con el grupo", n({ grupo: "revisar" }, "VENTA") === 0 && n({ grupo: "fiscal" }, "VENTA") === 1);
}

console.log("== M9. ↩ en un «Es spam» de Revisión devuelve lo que había antes ==");
{
  const sb = nuevoSandbox(TX);
  const r = { clave: "k", categoria: "DEPOSITO", origen: TERCERO, destino: WALLET, contrato: "0x" + "c2".repeat(20), hash: h(12), fuente: "ONCHAIN" };
  const mandado = { k: { revisar: true, nota: "Mandado a revisar por ti (2026-09-30): raro" } };
  const conSpam = sb.ccAjustesConDecision(mandado, r, "spam", null, HOY);
  assert("el «Es spam» de Revisión tiene el ↩ de 📒 («quitar»)",
    sb.txEstadoSpam(Object.assign({}, r, { categoria: "SPAM" }), conSpam) === "quitar");
  assert("su ↩ devuelve el «Mandado a revisar» (antes se perdía)",
    JSON.stringify(sb.txAjustesSinSpam(conSpam, "k", HOY)) === JSON.stringify(mandado), sb.txAjustesSinSpam(conSpam, "k", HOY));
  assert("el 🚫 de 📒 se sigue quitando del todo",
    JSON.stringify(sb.txAjustesSinSpam(sb.txAjustesConSpam({}, "k", "spam", HOY), "k", HOY)) === "{}");
}

console.log("== M10. Un spam a revisar se ve en «A revisar», donde cuenta ==");
{
  const sb = nuevoSandbox(TX);
  const r = (clave, categoria, revisar) => ({ clave, categoria, revisar: !!revisar, fecha: "2026-01-01 10:00:00", cantidad: 1 });
  const regs = [r("s", "SPAM", true), r("t", "SPAM"), r("v", "REVISAR", true)];
  const ver = f => sb.txFiltrar(regs, Object.assign({ ocultarSpam: true }, f)).map(x => x.clave).sort().join();
  assert("cuenta en «A revisar»", sb.txResumenTriaje(regs).revisar === 2);
  assert("y al pulsarlo se ve (antes, solo «v»)", ver({ grupo: "revisar" }) === "s,v", ver({ grupo: "revisar" }));
  assert("sin grupo, el spam sigue aparte", ver({}) === "v" && ver({ categoria: "SPAM" }) === "s,t");
}

console.log("== M11. La operación y el motivo del spam valen con una nota tuya detrás ==");
{
  const sb = nuevoSandbox(TX);
  const [RESTO, DIR, TOK] = ["NOTA_RESTO_DEVUELTO", "NOTA_SPAM_DIRECCION", "NOTA_SPAM_TOKEN"].map(n => vm.runInContext(n, sb));
  const conNota = n => n + "; revisado con el banco";
  const mov = { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", nota: conNota(RESTO) };
  assert("«Resto devuelto de una compra» (antes «Traspaso entre tus direcciones»)",
    sb.txOperacion(mov) === "Resto devuelto de una compra", sb.txOperacion(mov));
  const spamDir = { clave: "x", categoria: "SPAM", nota: conNota(DIR), origen: TERCERO, contrato: "0x" + "d3".repeat(20), cantidad: 1, token: "T" };
  const spamTok = Object.assign({}, spamDir, { nota: conNota(TOK) });
  assert("motivo del spam: «direccion» y «token»",
    sb.txMotivoSpam(spamDir, {}) === "direccion" && sb.txMotivoSpam(spamTok, {}) === "token");
  const ctx = { spamDirecciones: new Set([TERCERO]), spamTokens: new Set(["0x" + "d3".repeat(20)]) };
  assert("y su ↩ de «Toda la dirección» / «Todo el token» lo encuentra",
    (sb.txReglaSpam(spamDir, ctx) || {}).tipo === "direcciones" && (sb.txReglaSpam(spamTok, ctx) || {}).tipo === "tokens");
  assert("una nota que solo empieza igual no cuenta",
    sb.txOperacion({ categoria: "MOVIMIENTO", subcategoria: "NEUTRO", nota: RESTO + " y algo más" }) !== "Resto devuelto de una compra");
}

console.log("== M12. El cobro de un vínculo que el motor no aplicó no desaparece del libro ==");
{
  const sb = nuevoSandbox(TX);
  const reg = (clave, extra) => Object.assign({ clave, fecha: "2026-05-12 09:45:46", hash: h(clave.length + 20),
    contrato: "0x" + "a1".repeat(20), cantidad: 100, categoria: "DEPOSITO", origen: TERCERO, destino: WALLET, fuente: "ONCHAIN" }, extra);
  const V = reg("v", { categoria: "VENTA", origen: WALLET, destino: TERCERO }), C = reg("cc", {});
  const ventas = [{ id: "pd_1", estado: "CONFIRMADO", salida: { r: "v" }, asignaciones: [{ id: "as_1", pago: { r: "cc" }, cantidad_asignada: 100 }] }];
  sb.resolverReferenciaMovimiento = (ref, regs) => regs.find(x => x.clave === ref.r) || null;
  assert("sin la marca del motor (vínculo con problemas): el cobro sigue en su fila",
    !sb.txEsCobroPlegado(C, sb.txRelacionesVinculos([V, C], ventas)));
  const Ca = Object.assign({}, C, { pago_diferido: { venta_id: "pd_1", rol: "pago" } });
  assert("aplicado por el motor: va dentro de su venta", sb.txEsCobroPlegado(Ca, sb.txRelacionesVinculos([V, Ca], ventas)));
}

console.log("== M14. Wallet o vault mal escritos: el paso 1 no sale «Completa» y el aviso dice cuál ==");
{
  const { sb } = sandboxConDom([...MOTOR, "04-config.js", "19-arranque.js"]);
  const cfg = o => Object.assign({ wallet: WALLET, vault: VAULT, etherscan_api_key: "K", compra_bancaria_coste_eur_por_token: 100 }, o);
  const ev = c => sb.arrEvaluar({ config: c, cache: { transacciones: {} }, csvCargado: true, nCsv: 1, registros: null });
  const vMal = ev(cfg({ vault: "0x1234" })), wMal = ev(cfg({ wallet: "0xabc" }));
  assert("vault mal escrito: el paso 1 no está «Completa», lo dice y no clasifica",
    vMal.pasos.config.estado !== "ok" && /vault bien escrito/.test(vMal.pasos.config.texto) && !vMal.puedeClasificar, vMal.pasos.config);
  assert("wallet mal escrita: igual", wMal.pasos.config.estado !== "ok" && /wallet bien escrita/.test(wMal.pasos.config.texto), wMal.pasos.config);
  assert("bien escritas, o sin vault: «Completa»",
    ev(cfg({})).pasos.config.texto === "Completa" && ev(cfg({ vault: "" })).pasos.config.texto === "Completa");
  const res = sb.arrResumen({ cacheOk: true, csvOk: true, configOk: false, vaultMal: true });
  assert("el aviso culpa al vault, no a la wallet", /vault/.test(res.titulo) && !/wallet/.test(res.titulo), res.titulo);
}

(async () => {
  for (const p of pendientes) await p();
  console.log(`\n${ok} OK · ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})();
