/* PARIDAD del Excel de la app · con los datos del
 * usuario: la cadena entera de la app.
 *
 * Por cada escenario de los casos (6, con su «hoy»):
 * clasificar (como ejecutarClasificacion de js/14, sin pantalla ni red),
 * el cálculo de 🧾 (fiCalcular de js/23: el motor sobre una copia y los
 * informes, como el botón de 📤) y el Excel (js/26), lo lee con openpyxl
 * y lo compara celda a celda con las cifras de referencia de la app.
 * Comprueba ademas que la hoja Historial dice lo mismo que la pantalla de
 * 🧾, fila a fila (compararConPantalla), y que la cadena no cambia la
 * cache.
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_excel_real_paso_62.js
 *
 * DATOS: lee reental_cache.json, config.json y el archivo de rendimientos
 * de privado/datos_reales/ solo en memoria; el Excel de cada escenario va a una carpeta
 * temporal que se borra al terminar.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { leerCasos, referencia } = require("./cifras_referencia.js");
const { cadenaEntera } = require("./paridad_motor_fiscal_paso_51f.js");
const { volcarConPython, guardarExcel, generado } = require("./paridad_excel_paso_62.js");
const { compararConPantalla, compararConMotor, MODULOS_HISTORIAL } = require("./test_excel_paso_historial1.js");

const datos = leerCasos("paridad_excel_real_62.json");
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "excel62r-"));
process.on("exit", () => fs.rmSync(carpeta, { recursive: true, force: true }));
cadenaEntera(datos.reales, MODULOS_HISTORIAL, "6.2", (sb, caso) => {
  const cacheAntes = JSON.stringify(sb.__c);
  // Como el botón de 📤 Exportar (exExcel de js/24): el cálculo de 🧾.
  sb.structuredClone = structuredClone;
  sb.__hoy = caso.hoy;
  const calculo = vm.runInContext("state.cache = __c; state.config = __config; " +
    "fiCalcular(__regs, __c, __config, { hoy: __hoy, diaReal: null, descargaIncompleta: false })", sb);
  const ruta = path.join(carpeta, caso.nombre.replace(/\W/g, "_") + ".xlsx");
  const cambio = guardarExcel(sb, { registros: calculo.registros, colas: calculo.colas, resumen: calculo.resumen, cache: sb.__c,
    config: sb.__config, informes: calculo.informes, calculo }, ruta, generado(caso));
  const [volcado] = volcarConPython([ruta]);
  const difs = referencia(caso, "salida", volcado);
  // La hoja Historial, fila a fila como la pantalla de 🧾 (el último año, con todos los activos).
  sb.__calculo = calculo;
  const html = vm.runInContext("fiEstado.verTodos = true; (a => fiHtmlHistorial(__calculo, a, __calculo.informes[a], __calculo.informes[a]))" +
    "(fiAnios(__calculo.informes).at(-1))", sb);
  const pantalla = compararConPantalla(sb, html, volcado.hojas.Historial || {});
  difs.push(...pantalla.difs.slice(0, 10));
  if (!pantalla.comparadas) difs.push("la hoja Historial no tiene filas");
  // Y frente al motor: lo que queda y su coste, y la ganancia o pérdida del Resumen.
  const posicion = Object.entries(sb.posicionAbierta(calculo.colas)).map(([a, p]) => [calculo.nombres.get(a) || a, p[0], p[1]]);
  difs.push(...compararConMotor(volcado.hojas.Historial || {}, posicion, Object.values(calculo.resumen).map(b => b.gp_neta_eur)).difs);
  if (cambio) difs.push(cambio);
  if (JSON.stringify(sb.__c) !== cacheAntes) difs.push("la cadena cambio la cache");
  const celdas = Object.values(volcado.hojas).reduce((n, h) => n + Object.keys(h).length, 0);
  console.log("  " + caso.nombre + ": " + volcado.orden.length + " hojas, " + celdas + " celdas, " + pantalla.comparadas + " filas del historial como en 🧾");
  return difs;
}, "clasificar, calcular, el informe y el Excel dan lo grabado");
