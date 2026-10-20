/* Test de 🧾 Fiscal. Las cifras son las del informe
 * (js/22), que ya prueban sus paridades; aquí, lo que pone la pestaña.
 *
 * Bajo prueba:
 * - js/09 apuntarSincronizacion y pasoEtherscan: la fecha (UTC) de la última
 *   descarga entera y si la última falló.
 * - js/23 fiHastaCuando: hasta qué día llegan los datos.
 * - fiMotivoSinCalculo: solo con la clasificación al día y que terminó bien.
 * - fiCalcular: una pasada sobre una copia y crearLote vuelve a ser el de
 *   js/21 aunque el motor falle.
 * - fiAnioElegido, fiOperaciones, fiLotesCuadran, fiTextoAviso,
 *   fiAvisos (enlace a Revisión solo si allí está) y el HTML del resumen.
 * - index.html: la sección y js/23 después de js/22 y antes de js/13.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_fiscal_paso_fiscal1.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SPA = path.join(__dirname, "..", "Reental-SPA");
const S = { console, log: () => {}, toast: () => {}, structuredClone };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
  "10-csv-descubrimiento.js", "14-clasificador.js", "15-correcciones.js", "19-arranque.js", "21-fiscal.js", "22-informe-renta.js",
  "23-fiscal-pestana.js"]) {
  vm.runInContext(fs.readFileSync(path.join(SPA, "js", f), "utf8"), S, { filename: f });
}
vm.runInContext("log = () => {}; toast = () => {};", S);
const ST = vm.runInContext("state", S);   // el state de js/01 (const: no es S.state)
const FE = vm.runInContext("fiEstado", S);
const fechaVm = t => vm.runInContext("new Date(" + JSON.stringify(t) + ")", S);   // un Date del navegador, no de Node

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ts = f => String(Date.parse(f + "T10:00:00Z") / 1000);

console.log("== 1. js/09: la última sincronización en la cache ==");
{
  const c = {};
  S.apuntarSincronizacion(c, true, new Date("2026-03-05T23:30:00Z"));
  assert("bien: la fecha en España (23:30 UTC del 05/03 = 06/03, HORA-1) y sin fallo", igual(c.ultima_sincronizacion, { fecha: "2026-03-06", etherscan_fallo: false }));
  S.apuntarSincronizacion(c, false, new Date("2026-03-09T10:00:00Z"));
  assert("falla: se queda la fecha de la última entera y se apunta el fallo",
    igual(c.ultima_sincronizacion, { fecha: "2026-03-06", etherscan_fallo: true }));
  for (const raro of [null, "x", [], { fecha: 20260305 }]) {
    const d = { ultima_sincronizacion: raro };
    S.apuntarSincronizacion(d, false);
    assert("falla con lo de antes mal escrito (" + JSON.stringify(raro) + "): sin fecha", igual(d.ultima_sincronizacion, { fecha: null, etherscan_fallo: true }));
  }
}
(async () => {
  vm.runInContext(`state.config = { wallet: "0x${"1".repeat(40)}", vault: "", etherscan_api_key: " k " };
    state.cache = {};`, S);
  S.actualizarTransacciones = async () => { throw new Error("no se pudo descargar de Etherscan: wallet_tokens"); };
  let error = null;
  try { await S.pasoEtherscan(); } catch (e) { error = e.message; }
  assert("pasoEtherscan que falla: sigue lanzando el error y apunta el fallo",
    /no se pudo descargar/.test(error) && ST.cache.ultima_sincronizacion.etherscan_fallo === true && ST.cache.ultima_sincronizacion.fecha === null);
  S.actualizarTransacciones = async () => ({});
  await S.pasoEtherscan();
  const u = ST.cache.ultima_sincronizacion;
  // El día en España, como la app (entre las 00:00 y las 02:00 no es el de UTC).
  assert("pasoEtherscan que va bien: la fecha de hoy (en España) y sin fallo", u.fecha === vm.runInContext("hoyEspana()", S) && u.etherscan_fallo === false, u);

  console.log("== 2. Hasta qué día llegan los datos ==");
  const cache = (sinc, ...fechas) => ({ ultima_sincronizacion: sinc, transacciones: { wallet_tokens: fechas.map(f => ({ timeStamp: ts(f) })), vault_tokens: [] } });
  const HOY = "2026-10-04";
  const hasta = (c) => S.fiHastaCuando(c, HOY);
  assert("sin fecha apuntada: hoy null (el informe toma el último movimiento)",
    igual(hasta(cache(undefined, "2026-01-02")), { hoy: null, descargaIncompleta: false, sincronizada: null, ultimoFallo: false, diaReal: HOY }));
  assert("con fecha mal escrita: igual que sin ella", hasta(cache({ fecha: "2026-02-30" })).hoy === null);
  assert("con fecha: hoy es esa fecha", hasta(cache({ fecha: "2026-03-05", etherscan_fallo: false }, "2026-01-02")).hoy === "2026-03-05");
  assert("una transacción posterior (se sincronizó después): hoy es la suya",
    hasta(cache({ fecha: "2026-03-05" }, "2026-04-01")).hoy === "2026-04-01");
  assert("A1: el archivo de Reental no cuenta (fiHastaCuando no lo lee)", S.fiHastaCuando.length === 1 &&
    !/filasCsv|fecha_reparto/.test(S.fiHastaCuando.toString()));
  const fallida = hasta(cache({ fecha: "2026-01-03", etherscan_fallo: true }, "2025-06-10"));
  assert("A2: un intento fallido tras uno bueno: datos completos hasta el bueno, sin descarga incompleta y con su nota",
    fallida.hoy === "2026-01-03" && fallida.descargaIncompleta === false && fallida.ultimoFallo === true);
  assert("A3: fallo y luego un movimiento posterior: hoy es el del movimiento",
    hasta(cache({ fecha: "2026-01-03", etherscan_fallo: true }, "2026-02-15")).hoy === "2026-02-15");
  assert("sin ninguna sincronización buena y la última falló: descarga incompleta",
    hasta(cache({ fecha: null, etherscan_fallo: true })).descargaIncompleta === true);
  assert("A5: una fecha apuntada posterior al día de hoy no vale", hasta(cache({ fecha: "2027-03-05" })).sincronizada === null &&
    hasta(cache({ fecha: "9999-12-31" })).hoy === null);
  assert("A5: una transacción posterior al día de hoy no mueve hoy", hasta(cache({ fecha: "2026-03-05" }, "2030-01-01")).hoy === "2026-03-05");
  assert("sin cache, o con series raras: no se rompe", S.fiHastaCuando(null).hoy === null &&
    hasta({ ultima_sincronizacion: { fecha: "2026-03-05" }, transacciones: { x: null, y: [null, {}], z: {} } }).hoy === "2026-03-05" &&
    hasta({ ultima_sincronizacion: { fecha: "2026-03-05" } }).hoy === "2026-03-05");

  console.log("== 3. Solo con la clasificación al día ==");
  ST.config = { wallet: "0x" + "1".repeat(40), vault: "" };
  ST.cache = {}; ST.registros = null;
  assert("sin registros: pide abrir los archivos", /Sin datos todavía/.test(S.fiMotivoSinCalculo()));
  ST.registros = [{ clave: "a" }];
  assert("registros que la pestaña no vio clasificar: pide actualizar", /Revisa tus datos en 🚀/.test(S.fiMotivoSinCalculo()));
  FE.vista = { registros: ST.registros, huella: S.arrHuellaConfig(ST.config) };
  assert("los de la última clasificación con esta wallet: se calcula", S.fiMotivoSinCalculo() === "");
  ST.config = { wallet: "0x" + "2".repeat(40), vault: "" };
  assert("la wallet cambió después: pide actualizar", /Revisa tus datos en 🚀/.test(S.fiMotivoSinCalculo()));
  ST.config = { wallet: "0X" + "1".repeat(40), vault: " " };
  assert("la misma wallet en mayúsculas o el vault con espacios: sigue al día", S.fiMotivoSinCalculo() === "");
  FE.vista = { registros: [{ clave: "a" }], huella: S.arrHuellaConfig(ST.config) };
  assert("otros registros (no los de esa clasificación): pide actualizar", /Revisa tus datos en 🚀/.test(S.fiMotivoSinCalculo()));
  FE.vista = { registros: ST.registros, huella: S.arrHuellaConfig(ST.config) };
  ST.cache = { direcciones_descargadas: { wallet: "0x" + "9".repeat(40) } };
  assert("A4: movimientos descargados para otra wallet: pide actualizar", /otra dirección/.test(S.fiMotivoSinCalculo()));
  ST.cache = {};
  ST.sync = { running: true };
  assert("A6: mientras se sincroniza: «Actualizando»", /Actualizando/.test(S.fiMotivoSinCalculo()));
  ST.sync = { running: false };
  vm.runInContext("arr.preparando = true", S);
  assert("A6: mientras se prepara (otra cache u otro archivo): «Actualizando»", /Actualizando/.test(S.fiMotivoSinCalculo()));
  vm.runInContext("arr.preparando = false", S);
  FE.errorClasificacion = true;
  assert("A7: la clasificación dio un error: lo dice y dónde mirarlo", /Algo falló/.test(S.fiMotivoSinCalculo()));
  FE.errorClasificacion = false;

  console.log("== 4. Una pasada sobre una copia; crearLote se devuelve ==");
  const crearLoteOriginal = S.crearLote, consumirOriginal = S.consumirFifo, abrirOriginal = S.fiscAbrirLote;
  const motorOriginal = S.motorFiscal, informesOriginal = S.informesRentaAnuales;
  const regs = [{ clave: "r1", fecha: "2025-01-01", contrato: "0xa", categoria: "COMPRA" }];
  let recibidos = null;
  S.motorFiscal = function (rs, cache, config, op) {
    recibidos = rs;
    rs[0].revisar = true;   // el motor cambia lo que recibe
    S.crearLote(new Map(), "0xa", 3, 300, "2025-01-01", "COMPRA");
    S.crearLote(new Map(), "0xa", 0, 300, "2025-01-01", "COMPRA");   // no nace: no se apunta
    return new Map();
  };
  S.informesRentaAnuales = (rs, resumen, config, op) => ({ 2025: { hoy: op.hoy, incompleta: op.descarga_incompleta, nuevas: [op.cierres, op.cierres_usd, op.cierres_pools, op.cierres_otras].every(x => x && !Object.keys(x).length) } });
  // Con un movimiento posterior a la fecha apuntada: al informe va el del movimiento, no la fecha apuntada.
  const cacheSinc = { ultima_sincronizacion: { fecha: "2026-01-10", etherscan_fallo: true },
    transacciones: { wallet_tokens: [{ timeStamp: ts("2026-02-01") }] } };
  const res = S.fiCalcular(regs, cacheSinc, {}, S.fiHastaCuando(cacheSinc, "2026-10-04"));
  assert("el motor recibe una copia: los registros clasificados no cambian", recibidos !== regs && !regs[0].revisar && recibidos[0].revisar === true);
  assert("el registro que marcó el motor, con la clave de su aviso", igual([...res.avisosRevisar.values()], [["r1"]]));
  assert("los lotes que nacen, con su cantidad de nacimiento", res.lotes.length === 1 && res.lotes[0].activo === "0xa" && res.lotes[0].inicial === 3);
  assert("al informe, el hoy de los datos (el movimiento posterior), sin descarga incompleta y opciones nuevas",
    igual(res.informes[2025], { hoy: "2026-02-01", incompleta: false, nuevas: true }));
  assert("A14: un lote que no queda en las colas no está vivo", res.lotes[0].vivo === false);
  assert("crearLote, consumirFifo y fiscAbrirLote vuelven a ser los de js/21",
    S.crearLote === crearLoteOriginal && S.consumirFifo === consumirOriginal && S.fiscAbrirLote === abrirOriginal);
  S.motorFiscal = () => { throw new Error("roto"); };
  let lanzo = false;
  try { S.fiCalcular(regs, {}, {}, { hoy: null }); } catch (e) { lanzo = e.message === "roto"; }
  assert("con el motor roto: lanza y crearLote y consumirFifo vuelven igual", lanzo && S.crearLote === crearLoteOriginal && S.consumirFifo === consumirOriginal);
  S.motorFiscal = () => new Map([["0xa", [{ cantidad: 1, coste_unitario_eur: 100 }]]]);   // un lote que no nació por crearLote
  let parado = false;
  try { S.fiCalcular(regs, {}, {}, { hoy: null }); } catch (e) { parado = /lotes del motor/.test(e.message); }
  assert("un lote en las colas que no se vio nacer: error, no una tabla incompleta", parado && S.crearLote === crearLoteOriginal);
  S.motorFiscal = rs => { rs.push({ clave: "v9", importe_eur: 100.004, coste_fifo_eur: 30.004 }, { clave: "x", importe_eur: 5 }); return new Map(); };
  const conOps = S.fiCalcular(regs, {}, {}, { hoy: null });
  assert("A10: lo que vale cada operación sale de su registro, con las cuentas del total del informe",
    igual(conOps.operaciones.get("v9"), { transmision: 100, adquisicion: 30, gp: 70 }) && !conOps.operaciones.has("x"));
  /* El aviso «revisar» que escribe js/22 (rentaAvisos) casa con la clave que
     apunta fiCalcular: si uno cambia su fecha, concepto o nota y el otro no,
     el enlace a 🔍 se perdería sin que nada fallara. */
  const aRevisar = { clave: "r2", fecha: "2025-03-04 10:00:00", contrato: "0xb", categoria: "DEPOSITO", inmueble: "Casa Uno",
    revisar: true, nota: "Mandado a revisar por ti (2025-03-05)" };
  S.motorFiscal = () => new Map();
  S.informesRentaAnuales = rs => ({ 2025: { avisos: S.rentaAvisos(rs, []) } });
  const conAviso = S.fiCalcular([aRevisar], {}, {}, { hoy: null });
  const avisoEnlazado = S.fiAvisos(conAviso.informes[2025], conAviso, [aRevisar]);
  assert("el aviso «revisar» de js/22 lleva el enlace a 🔍 con la clave de fiCalcular",
    avisoEnlazado.length === 1 && avisoEnlazado[0].revisar && avisoEnlazado[0].enRevision, avisoEnlazado);
  S.motorFiscal = motorOriginal; S.informesRentaAnuales = informesOriginal;

  console.log("== 5. Año, ventas, lotes y avisos ==");
  const inf = t => ({ cabecera: { anio_terminado: t } });
  const elegido = (informes, anio) => S.fiAnioElegido(informes, S.fiAnios(informes), anio);
  assert("sale el último terminado", elegido({ 2026: inf(false), 2024: inf(true), 2025: inf(true) }, null) === 2025);
  assert("el elegido, si existe", elegido({ 2024: inf(true), 2025: inf(true) }, 2024) === 2024);
  assert("uno que ya no existe: el último terminado", elegido({ 2024: inf(true), 2025: inf(true) }, 2030) === 2025);
  assert("ninguno terminado: el último; sin años, null", elegido({ 2026: inf(false) }, null) === 2026 && elegido({}, null) === null);

  const fila = (clave, fecha, cant, adq, tra, gp, canje) => ({ clave, activo: "Toledo 1", operacion: "Venta", fecha_transmision: "2025-05-01",
    fecha_adquisicion: fecha, adquirido_por_canje: !!canje, cantidad: cant, valor_adquisicion_eur: adq, valor_transmision_eur: tra, gp_eur: gp });
  const ops = S.fiOperaciones({ filas: [fila("v1", "2024-01-01", 2, 200, 220, 20), fila("v1", "2024-02-01", 1, 110, 110, 0, true), fila("v2", null, 1, 100, 90, -10)] });
  assert("una operación por clave, con sus lotes y sus sumas",
    ops.length === 2 && ops[0].lotes.length === 2 && ops[0].cantidad === 3 && ops[0].gp === 20 && ops[1].gp === -10, ops.map(o => [o.clave, o.cantidad, o.gp]));
  const delRegistro = S.fiOperaciones({ filas: [fila("v1", "2024-01-01", 1, 10, 33.33, 23.33), fila("v1", "2024-02-01", 1, 10, 33.33, 23.33),
    fila("v1", "2024-03-01", 1, 10, 33.33, 23.33)] }, new Map([["v1", { transmision: 100, adquisicion: 30, gp: 70 }]]));
  assert("A10: con el registro, la ganancia de la venta es la suya (70,00), no la suma de filas redondeadas (69,99)",
    delRegistro[0].gp === 70 && delRegistro[0].transmision === 100 && delRegistro[0].adquisicion === 30);
  const dosMonedas = S.fiOperaciones({ filas: [Object.assign(fila("p1", "2024-01-01", 60, 55, 54, -1), { activo: "USDT" }),
    Object.assign(fila("p1", "2024-01-01", 40, 37, 36, -1), { activo: "USDC" })] });
  assert("A11: un pago con dos monedas: las dos en el nombre y sin sumar sus cantidades", dosMonedas[0].activo === "USDT/USDC" && dosMonedas[0].cantidad === null);
  const htmlDos = S.fiHtmlOperaciones({ filas: dosMonedas[0].lotes.map(l => Object.assign({}, l, { operacion: "Pago de X" })) }, "Permutas", true);
  assert("A11: con dos monedas, cada fila con la suya y la operación sin cantidad", htmlDos.includes(">60 USDT<") && htmlDos.includes(">40 USDC<") &&
    htmlDos.includes("01/05/2025 · Pago de X</td><td class=\"num\"></td>"), htmlDos);
  const sinImporte = S.fiOperaciones({ filas: [fila("v3", "2024-01-01", 1, null, 50, null)] });
  assert("un lote sin importe: la suma queda sin dar (—), no en 0", sinImporte[0].adquisicion === null && sinImporte[0].gp === null);
  const tot = (adq, tra, gp) => ({ valor_adquisicion_eur: adq, valor_transmision_eur: tra, gp_eur: gp });
  const htmlOps = S.fiHtmlOperaciones({ filas: [fila("v1", "2024-01-01", 2, 200, 220, 20), fila("v1", "2024-02-01", 1, 110, 110, 0, true)],
    total: tot(310, 330, 20) }, "Tokens", false);
  const cuerpo = htmlOps.match(/<tbody>[\s\S]*?<\/tbody>/)[0];
  assert("P29: un bloque cerrado con su nº de operaciones y su G/P", (htmlOps.match(/<details/g) || []).length === 1 && !/<details[^>]* open/.test(htmlOps) &&
    /<summary>.*Tokens.*1 operación.*\+20,00 €.*<\/summary>/.test(htmlOps), htmlOps);
  assert("P29: la operación y debajo una fila por fecha de adquisición, con el * del canje y su nota",
    (cuerpo.match(/fi-v-op/g) || []).length === 1 && (cuerpo.match(/fi-v-lote/g) || []).length === 2 &&
    cuerpo.includes("01/05/2025 · Toledo 1") && cuerpo.includes("01/02/2024 *") && htmlOps.includes("canje de contrato"), cuerpo);
  assert("P29: las fechas, «Adquirido el», sin «Comprado el» ni «Recibido el»", htmlOps.includes(">Operación · Adquirido el<") &&
    !/Comprado el|Recibido el|Cada fila/.test(htmlOps));
  assert("P29: la fila Total, la del informe (no la suma de filas)", /fi-h-suma.*Total.*310,00 €.*330,00 €.*\+20,00 €/.test(cuerpo), cuerpo);
  assert("A12: cabeceras con las palabras del glosario", htmlOps.includes(">Valor de adquisición<") && htmlOps.includes(">Valor de transmisión<") &&
    !htmlOps.includes(">Coste<") && !htmlOps.includes("Valor de venta"));
  const unaFecha = S.fiHtmlOperaciones({ filas: [Object.assign(fila("p1", "2024-01-01", 108, 100, 99, -1), { activo: "USDT", operacion: "Pago de Rentas 3" })],
    total: tot(100, 99, -1) }, "Permutas", true);
  assert("P29: una operación de una sola fecha, en una línea, con «adquirido el» debajo y la moneda en la cantidad",
    !unaFecha.includes("fi-v-lote") && unaFecha.includes("01/05/2025 · Pago de Rentas 3<span class=\"fi-h-debajo\">adquirido el 01/01/2024</span>") &&
    unaFecha.includes(">108 USDT<"), unaFecha);
  const fifoCorto = S.fiHtmlOperaciones({ filas: [Object.assign(fila("p2", "2024-01-01", 60, 55, 59.4, 4.4), { activo: "USDT", operacion: "Pago de Z" })],
    total: tot(55, 99, 44) }, "Permutas", true, new Map([["p2", { adquisicion: 55, transmision: 99, gp: 44 }]]));
  assert("P29: en una línea, las cifras de su fila del informe, no las del registro (FIFO a medias)",
    /fi-v-op.*>55,00 €<.*>59,40 €<.*\+4,40 €.*fi-h-suma/.test(fifoCorto) && /fi-h-suma.*>99,00 €<.*\+44,00 €/.test(fifoCorto), fifoCorto);
  const supDebajo = S.fiHtmlOperaciones({ filas: [Object.assign(fila("v4", "2024-01-01", 1, 100, 110, 10), { coste_supuesto: true }),
    fila("v4", "2024-02-01", 1, 100, 110, 10)], total: tot(200, 220, 20) }, "Tokens", false);
  assert("P29: el «**» en la fila de debajo y su nota", supDebajo.includes(">100,00 € **<") && supDebajo.includes("** Incluye compras"), supDebajo);
  const htmlVentas = S.fiHtmlVentas({ detalle: { ventas_inmuebles: { filas: [fila("v1", "2024-01-01", 2, 200, 220, 20)], total: tot(200, 220, 20) },
    permutas: { filas: [Object.assign(fila("p1", "2024-01-01", 60, 55, 54, -1), { activo: "USDT", operacion: "Pago de Y" })], total: tot(55, 54, -1) } } }, new Map());
  assert("ventas y permutas, cada una en su bloque, y la nota de los céntimos en el Total", htmlVentas.includes(">Tokens de inmuebles<") &&
    htmlVentas.includes(">Permutas: pagos con monedas virtuales y cambios entre ellas<") && htmlVentas.includes("· Pago de Y") &&
    htmlVentas.includes('data-abierto="ventas:inmuebles"') && htmlVentas.includes('data-abierto="ventas:permutas"') &&
    htmlVentas.includes("Cada total se suma con todos los decimales"));
  assert("sin ventas ni permutas: lo dice", /Sin ventas/.test(S.fiHtmlVentas({ detalle: { ventas_inmuebles: { filas: [] }, permutas: { filas: [] } } })));

  const lote = (cantidad, unitario, fecha, origen) => ({ cantidad, coste_unitario_eur: unitario, fecha, origen });
  const nombres = new Map([["0xa", "Toledo 1"], ["0xb", "Toledo 1"], ["0xc", "Bilbao 2"], ["0xd", "Zamora 1"]]);
  const lotes = [
    { activo: "0xa", inicial: 2, vivo: false, lote: lote(0, 100, "2024-01-01 10:00:00", "COMPRA") },
    { activo: "0xb", inicial: 2, vivo: true, lote: lote(1.5, 100, "2024-06-01 10:00:00", "CANJE"),
      procedencia: [{ fecha: "2024-01-01 10:00:00", origen: "COMPRA", cantidad: 2 }] },
    { activo: "0xc", inicial: 1, vivo: true, lote: lote(1e-12, 90, "2024-02-01", "COMPRA") },
    { activo: "0xd", inicial: 4, vivo: false, lote: lote(4e-11, 95, "2025-02-01", "COMPRA_BANCO") },
    { activo: "RNT", inicial: 10, vivo: true, lote: lote(10, 0.2, "2024-01-01", "REWARD") },
  ];
  // El historial (P27) lo prueba test_fiscal_paso_p27.js; aquí, el aviso de que los lotes no cuadran.
  const cartera = filas => ({ ejercicio: 2026, inversiones_activas: { inmuebles: { filas } } });
  assert("A14/A15: si lo que queda en los lotes vivos cuadra con la cartera del informe (sin umbral propio), cuadra",
    S.fiLotesCuadran(lotes, nombres, cartera([{ nombre: "Toledo 1", cantidad: 1.5 }, { nombre: "Bilbao 2", cantidad: 1e-12 }])));
  assert("A15: si no cuadra (una fecha mal escrita deja lotes fuera del informe), no cuadra",
    !S.fiLotesCuadran(lotes, nombres, cartera([{ nombre: "Toledo 1", cantidad: 3 }])));

  assert("textos antiguos: sincronizar, USD y la mayúscula", S.fiTextoInforme("saldo; vuelve a ejecutar el programa con internet") === "Saldo; vuelve a sincronizar con internet" &&
    S.fiTextoInforme("da mas que lo repartido (10) USDT") === "Da mas que lo repartido (10) USD" &&
    S.fiTextoInforme("saldo del vault (12 USDT); el 2026-01-02") === "Saldo del vault (12 USDT); el 02/01/2026");
  assert("A18: sin la cifra de «pendiente: …» (sola, delante, en medio o detrás)",
    S.fiTextoInforme("pendiente: 3,5 USDT del reparto sin reclamar ni reinvertir; se declaran igual en el ano del reparto") === "" &&
    S.fiTextoInforme("a; pendiente: 3 USDT del reparto x; se declaran igual en el ano del reparto; fila b") === "A; fila b" &&
    S.fiTextoInforme("pendiente: 3 USDT del reparto x; se declaran igual en el ano del reparto; fila b") === "Fila b" &&
    S.fiTextoInforme("a; pendiente: 3 USDT del reparto x; se declaran igual en el ano del reparto") === "A");
  const conApartados = [vm.runInContext("NOTA_DESINVERTIDO", S), "Movimientos a revisar: véase el apartado IV.",
    "x USDT del vault no tienen coste de compra: la línea de USDT de la wallet del apartado II no es fiable hasta resolverlas"];
  assert("A19: sin remitir a apartados del PDF (punto 3, apartado IV, apartado II)",
    conApartados.every(t => !/punto 3|apartado I/.test(S.fiTextoInforme(t))), conApartados.map(t => S.fiTextoInforme(t)));

  // Con los textos de verdad de js/21 y js/22, no copiados a mano.
  const fuente22 = fs.readFileSync(path.join(SPA, "js", "22-informe-renta.js"), "utf8");
  const conPrograma = fuente22.match(/"[^"\n]*ejecutar el programa[^"\n]*"/g) || [];
  assert("los " + conPrograma.length + " textos de js/22 con «ejecutar el programa» salen con «sincronizar»", conPrograma.length >= 3 &&
    conPrograma.every(t => !/ejecutar el programa/.test(S.fiTextoInforme(JSON.parse(t))) && /sincronizar/.test(S.fiTextoInforme(JSON.parse(t)))));
  const notaDe = (movido, retenido, integro) => {
    const r = { importe_usdt: movido, nota: "" };
    S.avisosRendimientoCsv(r, "RCM_REINVERTIDO", integro, retenido, 2025, new Map());
    return r.nota;
  };
  const a3 = notaDe(10, 1, 5), a5 = notaDe(2, 0, 10);
  assert("las notas A3 y A5 de js/21: la A3 en USD y la A5 (pendiente) fuera", /USDT/.test(a3) && /pendiente/.test(a5) &&
    !/USDT/.test(S.fiTextoInforme(a3)) && /\) USD/.test(S.fiTextoInforme(a3)) && S.fiTextoInforme(a5) === "", [a3, a5]);

  const rC = { clave: "c1", fecha: "2025-03-01 10:00:00", categoria: "VENTA", inmueble: "Toledo 1", revisar: true, nota: "venta sin importe" };
  const rM = { clave: "m1", fecha: "2025-04-01 10:00:00", categoria: "VENTA", inmueble: "Toledo 1", revisar: true, nota: "sin tipo BCE" };
  const avisosInforme = [
    { fecha: null, tipo: "nota", concepto: "Comisiones de red", detalle: "x" },
    { fecha: "2025-03-01", tipo: "revisar", concepto: S.rentaConceptoAviso(rC), detalle: "venta sin importe" },
    { fecha: "2025-04-01", tipo: "revisar", concepto: S.rentaConceptoAviso(rM), detalle: "sin tipo BCE" },
  ];
  const clasificados = [{ clave: "c1", revisar: true }, { clave: "m1", revisar: false }];
  const avisosRevisar = new Map([rC, rM].map(r => [S.fiClaveAviso(r.fecha.slice(0, 10), S.rentaConceptoAviso(r), r.nota), [r.clave]]));
  const av = S.fiAvisos({ avisos: avisosInforme }, { avisosRevisar }, clasificados);
  assert("los de revisar primero; enlace solo al que marcó la clasificación (el del motor no está en Revisión)",
    igual(av.map(a => [a.tipo, a.enRevision]), [["revisar", true], ["revisar", false], ["nota", false]]));
  const dos = new Map([[S.fiClaveAviso("2025-03-01", S.rentaConceptoAviso(rC), "venta sin importe"), ["c1", "m1"]]]);
  assert("el mismo aviso de dos registros, uno solo del motor: sin enlace",
    S.fiAvisos({ avisos: [avisosInforme[1]] }, { avisosRevisar: dos }, clasificados)[0].enRevision === false);
  const htmlAv = S.fiHtmlAvisos(av);
  assert("HTML de avisos: un enlace a Revisión", (htmlAv.match(/href="#revision"/g) || []).length === 1 && htmlAv.includes("01/03/2025 · "));
  assert("sin avisos: lo dice", /Ningún aviso/.test(S.fiHtmlAvisos([])));

  console.log("== 6. Resumen ==");
  const informe = {
    cabecera: { anio_terminado: true },
    inversiones_activas: { fecha_corte: "2025-12-31" },
    resumen: [
      { grupo: "1. Inversiones activas", clave: "capital_final", concepto: "Capital al 31 de diciembre", importe: 1000, unidad: "EUR", nota: null, total: true },
      { grupo: "2. Rendimientos del capital mobiliario", clave: "rend_inmuebles", concepto: "Rendimientos de inmuebles tokenizados", importe: 50.5, unidad: "EUR", nota: null },
      { grupo: "2. Rendimientos del capital mobiliario", clave: "rend_integro", concepto: "Total íntegro", importe: 50.5, unidad: "EUR", nota: null, total: true },
      { grupo: "2. Rendimientos del capital mobiliario", clave: "rend_neto", concepto: "Neto", importe: 50.5, unidad: "EUR", nota: "Íntegro <menos> retenciones.", total: false },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_inmuebles_transmision", concepto: "Transmisión de tokens de inmuebles: valor de transmisión", importe: 210, unidad: "EUR" },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_inmuebles", concepto: "Transmisión de tokens de inmuebles: ganancia o pérdida", importe: -2, unidad: "EUR" },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_permutas", concepto: "Permutas de monedas virtuales: ganancia o pérdida", importe: 3, unidad: "EUR" },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_otros_elementos", concepto: "Pools de liquidez: ganancia o pérdida", importe: 4, unidad: "EUR" },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_sin_transmision", concepto: "Ganancias sin transmisión", importe: 5, unidad: "EUR", nota: "Airdrops." },
      { grupo: "3. Ganancias y pérdidas patrimoniales", clave: "gp_total", concepto: "Total ganancias y pérdidas patrimoniales", importe: null, unidad: "EUR", total: true },
      { grupo: "4. Gastos", clave: "gas_pol", concepto: "Pagadas en POL", importe: 1.5, unidad: "POL" },
    ],
    detalle: { rendimientos: { a_declarar_en: "Base del ahorro (RCM)" }, ventas_inmuebles: { a_declarar_en: "Otros elementos" },
      permutas: { a_declarar_en: "Monedas virtuales" }, otros_elementos: { a_declarar_en: "Pools" }, ganancias_sin_transmision: { a_declarar_en: "Base general" } },
  };
  const htmlRes = S.fiHtmlResumen(informe);
  const posicion = t => htmlRes.indexOf(t);
  // Dos columnas que crecen por separado: a la izquierda rendimientos y
  // Patrimonio, a la derecha ganancias y gas; en el móvil, por su «order».
  const orden = t => Number((new RegExp('style="order:(\\d)"><h3>' + t).exec(htmlRes) || [])[1]);
  const columnas = htmlRes.split('<div class="fi-col">').slice(1);
  assert("rendimientos y ganancias antes que Patrimonio y gas, en dos columnas",
    orden("Rendimientos del capital") === 0 && orden("Ganancias y pérdidas patrimoniales<") === 1 &&
    orden("Inversiones activas") === 2 && orden("Gastos") === 3 && columnas.length === 2 &&
    /Rendimientos del capital[^]*Inversiones activas/.test(columnas[0]) && /Ganancias y pérdidas patrimoniales<[^]*Gastos/.test(columnas[1]));
  assert("«A declarar en» debajo del neto y de la ganancia de cada subgrupo",
    ["Base del ahorro (RCM)", "Otros elementos", "Monedas virtuales", "Pools", "Base general"].every(t => htmlRes.includes("A declarar en: " + t)) &&
    (htmlRes.match(/A declarar en/g) || []).length === 5);
  assert("signo en las ganancias de permutas y pools; no en las ganancias sin transmisión", htmlRes.includes("+3,00 €") && htmlRes.includes("+4,00 €") &&
    htmlRes.includes(">5,00 €"));
  assert("el subgrupo una vez y la fila con su nombre corto", (htmlRes.match(/Transmisión de tokens de inmuebles/g) || []).length === 1 && htmlRes.includes(">Valor de transmisión"));
  assert("signo en la ganancia o pérdida, no en el valor; sin importe, «—»", htmlRes.includes("-2,00 €") && htmlRes.includes("210,00 €") && !htmlRes.includes("+210") &&
    /data-clave="gp_total"[^]*?—/.test(htmlRes));
  assert("sin «qué tipo de rendimiento son» ni el enlace a Hacienda",
    !/Cesión a terceros|25\.2|sede\.agenciatributaria/.test(htmlRes));
  assert("sin casillas ni consejos del asesor en el resumen",
    !/casilla|asesor|LLC|España/.test(htmlRes));
  assert("cantidad de POL y la nota escapada en su ⓘ", htmlRes.includes("1,5 POL") && htmlRes.includes("Íntegro &lt;menos&gt; retenciones."));
  assert("métricas: íntegro, retenciones (—), ganancias y capital al 31/12", htmlRes.includes("Capital al 31/12") && htmlRes.includes("50,50 €") && htmlRes.includes("1.000,00 €"));
  const enCurso = S.fiHtmlResumen(Object.assign({}, informe, { cabecera: { anio_terminado: false }, inversiones_activas: { fecha_corte: "2026-05-20" } }));
  assert("A17: en un año en curso, «Capital a» la fecha de los datos (no «hoy»)", enCurso.includes("Capital a 20/05/2026") && !enCurso.includes("Capital hoy"));
  assert("A19: la ⓘ de una fila pasa por los textos de la app", S.fiFilaResumen({ clave: "desinvertido", concepto: "Desinvertido", importe: 1,
    unidad: "EUR", nota: vm.runInContext("NOTA_DESINVERTIDO", S) }, "Desinvertido", informe).includes("Ganancias y pérdidas patrimoniales"));

  assert("un cero con signo sale sin él; con importe, con el suyo", S.fiEur(0, true) === "0,00 €" && S.fiEur(-0.001, true) === "0,00 €" &&
    S.fiEur(0.006, true) === "+0,01 €" && S.fiEur(-3, true) === "-3,00 €" && S.fiEur(null) === "—" && S.fiEur(NaN) === "—");

  console.log("== 7. index.html ==");
  const html = fs.readFileSync(path.join(SPA, "index.html"), "utf8");
  const pos = f => html.indexOf('<script src="js/' + f + '"></script>');
  assert("la sección con #fiCuerpo y sin «Próximamente»", /<section id="view-fiscal"[^]*?id="fiCuerpo"[^]*?<\/section>/.test(html) &&
    !/view-fiscal[^]*?Próximamente[^]*?<\/section>[^]*?view-rendimientos/.test(html));
  assert("js/23 después de js/22 y antes de js/13", pos("22-informe-renta.js") > 0 && pos("22-informe-renta.js") < pos("23-fiscal-pestana.js") && pos("23-fiscal-pestana.js") < pos("13-inicio.js"));

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
