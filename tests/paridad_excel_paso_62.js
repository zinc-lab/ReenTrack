/* PARIDAD del Excel de la app · casos de los tests.
 *
 * Lee los casos (la entrada de cada Excel distinto grabado), hace el Excel de la app con ella (excelLibro,
 * js/26, en una VM de Node), lo guarda en una carpeta temporal, lo lee con
 * openpyxl (tests/volcar_xlsx.py, como lo leeria otro programa) y lo
 * compara celda a celda con las cifras de referencia de la app: las mismas
 * hojas en el mismo orden y, en cada una, las mismas celdas con el mismo
 * valor (numero, fecha, si/no o texto) y el mismo formato, sin tolerancia.
 * El «Generado el» de cada caso es el que lleva grabado. Abre con Excel de
 * verdad los 5 libros mas grandes (si hay Excel). Comprueba ademas que el
 * Excel no cambia lo que recibe. Cada caso lleva el cálculo de 🧾
 * (fiCalcular de js/23, con el día del «Generado el»), así que también sale
 * su hoja Historial, y esa hoja se compara fila a fila con la pantalla de
 * 🧾 (compararConPantalla). Los 6 escenarios con tus datos van aparte
 * (paridad_excel_real_paso_62).
 *
 * Ejecucion (desde la raiz del repo):
 *     node tests/paridad_excel_paso_62.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");
const { leerCasos } = require("./cifras_referencia.js");
const { compararCasos, sandbox, plano } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_INFORME } = require("./paridad_informe_renta_paso_52f.js");

const MODULOS_EXCEL = MODULOS_INFORME.concat(["25-xlsx.js", "26-excel.js"]);

/* Lee con openpyxl los .xlsx de esas rutas (volcar_celdas, tests/volcar_xlsx.py): una
   sola llamada a Python para todos. */
function volcarConPython(rutas) {
  const guion = "import json, sys\nsys.path.insert(0, sys.argv[1])\n" +
    "from volcar_xlsx import volcar_celdas\n" +
    "print(json.dumps([volcar_celdas(r) for r in json.loads(sys.stdin.read())]))";
  return JSON.parse(execFileSync("python", ["-c", guion, __dirname],
    { input: JSON.stringify(rutas), encoding: "utf8", maxBuffer: 1 << 30 }));
}

/* El momento de cada caso («ahora», el «Generado el» con que se grabó):
   la app hace su Excel con él, para que no dependa del día de la prueba. */
const generado = caso => new Date(caso.ahora);

/* El Excel de la app de un caso, guardado en la carpeta; da lo que el
   Excel cambio de lo que recibe (null si nada). */
function guardarExcel(sb, a, ruta, ahora) {
  // plano: también las colas, que son un Map. Con el cálculo de 🧾, lo que
  // ya va dentro de él (registros, colas, resumen, informes) no se repite.
  const vigilado = a.calculo ? { calculo: a.calculo, cache: a.cache, config: a.config } : a;
  const huella = () => JSON.stringify(plano(vigilado));
  const antes = huella();
  const libro = sb.excelLibro(a.registros, a.colas, a.resumen, a.cache, a.config, a.informes, ahora, null, a.cuadre || null, a.calculo || null);
  fs.writeFileSync(ruta, sb.xlsxBytes(libro));
  return huella() !== antes ? "el Excel cambio lo que recibe" : null;
}

/* Abre esos .xlsx con Excel de verdad (por COM, solo en Windows): "ok" o
   "no abre" por cada uno, o null si no hay Excel. openpyxl abre libros que
   Excel tiene que reparar. */
function abrirConExcel(rutas) {
  if (process.platform !== "win32") return null;
  const guion = "$ErrorActionPreference='Stop'; try { $xl = New-Object -ComObject Excel.Application } catch { 'SIN EXCEL'; exit }" +
    "; $xl.DisplayAlerts = $false; try { foreach ($r in $args) { try { $wb = $xl.Workbooks.Open($r); $wb.Close($false); 'ok' }" +
    " catch { 'no abre' } } } finally { $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }";
  try {
    const sale = execFileSync("powershell", ["-NoProfile", "-Command", "& {" + guion + "}", ...rutas],
      { encoding: "utf8", timeout: 120000 }).trim().split(/\r?\n/);
    return sale[0] === "SIN EXCEL" ? null : sale;
  } catch (e) { return null; }
}

module.exports = { MODULOS_EXCEL, abrirConExcel, volcarConPython, guardarExcel, generado };

if (require.main === module) {
  const datos = leerCasos("paridad_excel_62.json");
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "excel62-"));
  // Con 🧾 (js/23) y los nombres de 📒 (js/18), para el cálculo y la hoja Historial.
  const { compararConPantalla, MODULOS_HISTORIAL } = require("./test_excel_paso_historial1.js");
  const sb = sandbox(MODULOS_HISTORIAL);
  sb.structuredClone = structuredClone;
  // Primero todos los Excel de la app; luego una sola lectura con openpyxl.
  const hechos = new Map(datos.sinteticos.map((caso, i) => {
    const ruta = path.join(carpeta, i + ".xlsx");
    sb.__e = caso.entrada;
    sb.__hoy = caso.ahora.slice(0, 10);
    try {
      const calculo = vm.runInContext("state.config = { wallet: __e.wallet, vault: __e.vault }; state.cache = __e.args.cache; " +
        "fiCalcular(__e.args.registros, __e.args.cache, state.config, { hoy: __hoy, diaReal: null, descargaIncompleta: false })", sb);
      sb.__calculo = calculo;
      const html = vm.runInContext("fiEstado.verTodos = true; (a => a === undefined ? '' : " +
        "fiHtmlHistorial(__calculo, a, __calculo.informes[a], __calculo.informes[a]))(fiAnios(__calculo.informes).at(-1))", sb);
      return [caso, { ruta, html, cambio: guardarExcel(sb, { ...caso.entrada.args, calculo }, ruta, generado(caso)) }];
    } catch (err) {
      return [caso, { error: err }];
    }
  }));
  const buenos = [...hechos.values()].filter(h => !h.error);
  const leidos = volcarConPython(buenos.map(h => h.ruta));
  buenos.forEach((h, k) => { h.volcado = leidos[k]; });
  // Los 5 libros más grandes, con Excel de verdad (si lo hay).
  const grandes = buenos.sort((a, b) => fs.statSync(b.ruta).size - fs.statSync(a.ruta).size).slice(0, 5).map(h => h.ruta);
  const excel = abrirConExcel(grandes);
  fs.rmSync(carpeta, { recursive: true, force: true });
  if (excel === null) console.log("(sin Excel en este ordenador: los libros no se abren con él)");
  else if (excel.length !== grandes.length || excel.some(x => x !== "ok")) {
    console.log("FALLO: Excel no abre algún libro de la app sin repararlo: " + excel.join(", "));
    process.exit(1);
  } else console.log("Excel abre sin reparar los " + grandes.length + " libros más grandes de la app");
  // 403 con tus datos en privado/datos_reales/ y 400 sin ellos. Y lo de
  // cada archivo de origen de los casos, para que no se pierda uno sin que
  // se vea (un Excel repetido cuenta solo en el primer archivo que lo hizo).
  compararCasos(datos.sinteticos, "casos de los tests", 400, {
    paso: "6.2",
    ejecutar: caso => {
      const h = hechos.get(caso);
      if (h.error) throw h.error;
      // La hoja Historial, como la pantalla de 🧾.
      const pantalla = compararConPantalla(sb, h.html, h.volcado.hojas.Historial || {});
      return { salida: h.volcado, cambio: [h.cambio, ...pantalla.difs.slice(0, 5)].filter(Boolean).join("; ") || null };
    },
    porArchivo: { "tests/test_informe_excel_paso_div15e.py": 1, "tests/test_cuadre_paso_cuadre2.py": 17,
      "tests/test_sin_vault_paso_div12.py": 1, "tests/test_arreglos_paso_arreglos2.py": 34,
      "tests/test_arreglos_paso_arreglos3.py": 145, "tests/test_arreglos_paso_arreglos4.py": 36,
      "tests/test_arreglos_paso_arreglos5.py": 21, "tests/test_motor_fiscal_paso_51f.py": 23,
      "tests/test_rendimientos_paso_div15b.py": 11, "tests/test_lotes_venta_paso_div15d2.py": 9 },
  });
}
