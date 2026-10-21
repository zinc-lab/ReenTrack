/* La hoja «Historial» del Excel (js/26 excelHojaHistorial), que sustituye
 * a «Cartera»: la tabla de cada activo de 🧾 (js/23), de todos los años y
 * con los lotes de cada venta a la vista.
 *
 * Bajo prueba, con el Excel guardado y leído con openpyxl (como lo leería
 * otro programa) y, si hay Excel en el ordenador, abierto sin repararlo:
 * - las hojas: «Historial» después de «Ingresos», sin «Cartera»; sin el
 *   cálculo de 🧾, no sale;
 * - fila a fila igual que la pantalla (compararConPantalla): las mismas
 *   filas en el mismo orden, fecha, operación, importe, comisión, coste,
 *   ganancia o pérdida, la nota y los lotes de cada venta; «A revisar»
 *   donde la pantalla pone ⚠️; y las líneas de arriba (Total, grupos y
 *   activos: quedan, coste, ganancia o pérdida y nota);
 * - frente al motor, sin pasar por js/23: lo que queda de cada activo y
 *   su coste (posicionAbierta), y la ganancia o pérdida de todos los años
 *   (más los pools) igual que la suma de la del Resumen de cada año;
 * - números como números y fechas como fechas, con sus formatos (también
 *   las escritas a mano con «Z» o sin hora), y los € ya redondeados.
 *
 * DATOS 100% SINTÉTICOS (los de P27). Ejecución (desde la raíz):
 *     node tests/test_excel_paso_historial1.js
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF } = require("./paridad_informe_pdf_paso_63.js");
const { volcarConPython, abrirConExcel } = require("./paridad_excel_paso_62.js");

/* Las filas de una hoja volcada (volcar_celdas): Map fila -> { columna: [tipo, valor, formato] }. */
function filasDe(celdas) {
  const filas = new Map();
  for (const [ref, c] of Object.entries(celdas)) {
    const [, col, n] = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!filas.has(Number(n))) filas.set(Number(n), {});
    filas.get(Number(n))[col] = c;
  }
  return filas;
}

/* El texto de una celda de la pantalla, sin etiquetas. */
const sinEtiquetas = h => h.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/* Compara la hoja Historial (volcada) con la pantalla de 🧾 (el HTML de
   fiHtmlHistorial del último año, con todos los activos): da la lista de
   diferencias (vacía si todo cuadra) y cuántas filas comparó. sb: la VM
   de la app (para dar a cada cifra el formato de la pantalla). */
function compararConPantalla(sb, html, celdas) {
  const difs = [];
  let comparadas = 0;
  const eur = (c, signo, conAsteriscos = true) => {
    if (!c) return "";
    if (c[0] === "t") return c[1] === "A revisar" ? "⚠️" : c[1];
    return sb.fiEur(c[1], signo) + (conAsteriscos && /\*\*/.test(c[2] || "") ? " **" : "");
  };
  const fecha = c => (!c ? "" : c[0] === "d" ? c[1].slice(8, 10) + "/" + c[1].slice(5, 7) + "/" + c[1].slice(0, 4) : c[1]);
  const titulo = h => { const m = /title="([^"]*)"/.exec(h || ""); return m ? sinEtiquetas(m[1]) : ""; };
  // La pantalla: cada activo y sus filas (celdas en texto; la operación, la de su etiqueta).
  const pantalla = new Map();
  for (const [, nombre, cuerpo] of html.matchAll(/data-abierto="historial:([^"]*)">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/g)) {
    pantalla.set(sinEtiquetas(nombre), [...cuerpo.matchAll(/<tr ([^>]*)>([\s\S]*?)<\/tr>/g)].map(([, attrs, tr]) => {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
      const et = /class="fi-et[^"]*"[^>]*>([\s\S]*?)<\/span>/.exec(tds[1]);
      const f = sinEtiquetas(tds[0]).slice(0, 10);
      // La nota, la de las burbujas: la de la operación, el aviso (con su año) y lo que salió sin compra.
      const nota = [et ? titulo(/<span class="fi-et[^>]*>/.exec(tds[1])[0]) : "",
        /⚠️/.test(tds[1]) ? "A revisar: aviso en «Fiscal " + (/\d{4}/.exec(f) || [""])[0] + "»" : "",
        /fi-info/.test(tds[2] || "") ? titulo(/<span class="fi-info[^>]*>/.exec(tds[2])[0]) : ""].filter(Boolean).join(". ");
      return { clase: /class="([^"]*)"/.exec(attrs)[1], fecha: f,
        operacion: et ? sinEtiquetas(et[1]).replace(/ ⓘ$/, "") : sinEtiquetas(tds[1]),
        importe: sinEtiquetas(tds[5]), comision: sinEtiquetas(tds[6]), coste: sinEtiquetas(tds[7]), gp: sinEtiquetas(tds[8]), nota };
    }));
  }
  // Las líneas de arriba de la pantalla, en orden: el Total, cada grupo
  // (su título y su línea) y cada activo (sin los pools: en la pantalla,
  // los de ese año; en el Excel, los de todos).
  const lineas = [];
  let grupo = null, cerrado = false;
  for (const m of html.matchAll(/<div class="fi-subgrupo">([\s\S]*?)<\/div>|<details class="fi-h-activo( fi-h-cerrado)?"|<div class="fi-h-linea ([^"]*)">([\s\S]*?)<\/span><\/div>/g)) {
    if (m[1] !== undefined) { grupo = sinEtiquetas(m[1]); continue; }
    if (m[3] === undefined) { cerrado = !!m[2]; continue; }
    const celdas = m[4].split("<span>").slice(1).map(c => c.replace(/<\/span>$/, ""));
    const [nombre, quedan, coste, gp] = celdas;
    if (m[3] === "fi-h-total") lineas.push({ etiqueta: "Total", coste: sinEtiquetas(coste), gp: sinEtiquetas(gp) });
    else if (m[3] === "fi-h-subtotal") lineas.push({ etiqueta: grupo, coste: sinEtiquetas(coste), gp: sinEtiquetas(gp) });
    else if (m[3] === "") {
      const avisos = /fi-h-avisos">⚠️ (\d+)/.exec(nombre);
      lineas.push({ etiqueta: sinEtiquetas(nombre.replace(/ <span class="fi-h-avisos">[\s\S]*$/, "")),
        quedan: titulo(quedan) || sinEtiquetas(quedan), coste: sinEtiquetas(coste), gp: sinEtiquetas(gp),
        nota: [avisos ? "A revisar (" + avisos[1] + ")" : "", cerrado ? "Ya no lo tienes" : ""].filter(Boolean).join(". ") });
    }
  }
  // El Excel: cada tabla empieza en el nombre del activo, sigue con la cabecera «Fecha» y acaba en «Total».
  const filas = filasDe(celdas);
  const numeros = [...filas.keys()].sort((a, b) => a - b);
  // Arriba, las líneas tras la cabecera «Activo» hasta la fila vacía (sin
  // las que no llevan coste: los pools y los regalos).
  const deArriba = [];
  const cab = numeros.find(n => filas.get(n).A && filas.get(n).A[1] === "Activo");
  for (let n = cab + 1; cab !== undefined && filas.has(n); n++) if (filas.get(n).C) deArriba.push(filas.get(n));
  if (deArriba.length !== lineas.length) difs.push("líneas de arriba: " + deArriba.length + " en el Excel, " + lineas.length + " en la pantalla");
  else {
    lineas.forEach((p, i) => {
      const x = deArriba[i];
      const esperado = { etiqueta: x.A[1], coste: eur(x.C, false), gp: eur(x.D, true) };
      if ("quedan" in p) Object.assign(esperado, { quedan: x.B ? sb.cantidadEs(x.B[1]) : "", nota: x.E ? x.E[1] : "" });
      for (const k of Object.keys(p)) {
        if (p[k] !== esperado[k]) difs.push("línea de arriba " + (i + 1) + " " + k + ": Excel «" + esperado[k] + "», pantalla «" + p[k] + "»");
      }
      comparadas++;
    });
  }
  const excel = new Map();
  for (let i = 0; i < numeros.length; i++) {
    const f = filas.get(numeros[i]), sig = filas.get(numeros[i] + 1);
    if (!(f.A && !f.B && sig && sig.A && sig.A[1] === "Fecha")) continue;
    const lista = [];
    for (let n = numeros[i] + 2; filas.has(n); n++) {
      const x = filas.get(n);
      lista.push(x);
      if (x.B && x.B[1] === "Total") break;
    }
    excel.set(f.A[1], lista);
  }
  if (JSON.stringify([...excel.keys()]) !== JSON.stringify([...pantalla.keys()])) {
    difs.push("activos: Excel " + JSON.stringify([...excel.keys()]) + ", pantalla " + JSON.stringify([...pantalla.keys()]));
  }
  for (const [nombre, deLaPantalla] of pantalla) {
    const delExcel = excel.get(nombre) || [];
    if (delExcel.length !== deLaPantalla.length) { difs.push(nombre + ": " + delExcel.length + " filas en el Excel, " + deLaPantalla.length + " en la pantalla"); continue; }
    let deUnCanje = false;   // la fila de la que cuelgan los lotes que vienen
    deLaPantalla.forEach((p, i) => {
      const x = delExcel[i], b = x.B ? x.B[1] : "";
      const lote = p.clase === "fi-h-lote", total = p.clase === "fi-h-suma", canje = p.clase.includes("canje");
      const esperado = {
        fecha: lote || total ? "" : fecha(x.A),
        operacion: b,
        importe: total ? "" : eur(x.F, false),
        comision: total ? "" : eur(x.G, false),
        // El coste: con signo, salvo el Total y el de cada compra que pasa por un canje.
        coste: eur(x.H, !(total || (lote && deUnCanje))),
        gp: eur(x.I, true),
        nota: x.K ? x.K[1] : "",
      };
      if (!lote) deUnCanje = canje;
      const visto = { fecha: lote || total ? "" : p.fecha, operacion: p.operacion, importe: p.importe, comision: p.comision, coste: p.coste, gp: p.gp,
        nota: p.nota };
      for (const k of Object.keys(visto)) {
        if (visto[k] !== esperado[k]) difs.push(nombre + " fila " + (i + 1) + " " + k + ": Excel «" + esperado[k] + "», pantalla «" + visto[k] + "»");
      }
      comparadas++;
    });
  }
  return { difs, comparadas };
}

/* Frente al motor, sin pasar por js/23: lo que queda de cada activo y su
   coste (posicion: [nombre, cantidad, coste] de posicionAbierta, sumado
   por nombre; el coste, al céntimo) en las líneas de arriba, y la ganancia o pérdida de todos
   los años más los pools igual a la suma de la del Resumen de cada año
   (gpAnios; con cada año redondeado, medio céntimo por año). Da las
   diferencias y lo que comparó. */
function compararConMotor(celdas, posicion, gpAnios) {
  const difs = [], filas = [...filasDe(celdas).values()];
  const lineas = new Map(filas.filter(f => f.A && f.A[0] === "t" && f.B && f.B[0] === "n").map(f => [f.A[1], f]));
  const porNombre = new Map();
  for (const [nombre, cantidad, coste] of posicion) {
    const antes = porNombre.get(nombre) || [0, 0];
    porNombre.set(nombre, [antes[0] + cantidad, antes[1] === null || coste === null ? null : antes[1] + coste]);
  }
  const cerca = (a, b) => Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b));
  // El coste, en el Excel ya redondeado al céntimo.
  const alCentimo = (a, b) => Math.abs(a - b) <= 0.005 + 1e-9 * Math.max(1, Math.abs(b));
  for (const [nombre, [cantidad, coste]] of porNombre) {
    if (cantidad < 1e-9) continue;   // lo que ya no tienes no sale en la cartera del motor
    const l = lineas.get(nombre);
    const bien = l && cerca(l.B[1], cantidad) && (coste === null ? l.C && l.C[1] === "A revisar" : l.C && alCentimo(l.C[1], coste));
    if (!bien) difs.push(nombre + ": Excel " + JSON.stringify(l ? [l.B[1], l.C && l.C[1]] : null) + ", motor " + JSON.stringify([cantidad, coste]));
  }
  const total = filas.find(f => f.A && f.A[1] === "Total" && f.D);
  const pools = filas.find(f => f.A && /pools/i.test(f.A[1]) && f.D);
  const suma = gpAnios.reduce((x, y) => x + y, 0);
  if (!total || Math.abs(total.D[1] + (pools ? pools.D[1] : 0) - suma) >= 0.005 * Math.max(1, gpAnios.length)) {
    difs.push("ganancia o pérdida de todos los años: Excel " + (total && total.D[1]) + " + pools " + (pools ? pools.D[1] : 0) + ", Resumen " + suma);
  }
  return { difs, comparados: porNombre.size };
}

// Los módulos de la app que hacen la hoja (el Excel, 🧾 y los nombres de 📒).
const MODULOS_HISTORIAL = MODULOS_PDF.concat(["18-transacciones.js"]);

module.exports = { compararConPantalla, compararConMotor, filasDe, MODULOS_HISTORIAL };

if (require.main === module) {
  let ok = 0, fallos = 0;
  const assert = (nombre, cond, extra) => {
    if (cond) { ok++; console.log("  OK   " + nombre); }
    else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
  };
  const sb = sandbox(MODULOS_HISTORIAL, HORA_APP);
  sb.structuredClone = structuredClone;
  const USDT = vm.runInContext("USDT", sb), BURN = vm.runInContext("BURN", sb);
  const { WALLET, registrosP27, cacheP27 } = require("./navegador/p27_comun.js");
  sb.__regs = registrosP27(USDT, BURN);
  sb.__cache = cacheP27(sb.__regs);
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "historial-"));
  // No «con.xlsx»: CON es un nombre reservado de Windows (Excel no lo abre).
  const ruta = path.join(carpeta, "historial.xlsx");
  const R = vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" }; state.cache = __cache;
    (() => {
      const res = fiCalcular(__regs, __cache, state.config, { hoy: "2025-12-31", diaReal: "2026-10-20", descargaIncompleta: false });
      const antes = JSON.stringify(res.registros);
      const ahora = new Date("2026-10-20T10:00:00Z");
      const libro = excelLibro(res.registros, res.colas, res.resumen, __cache, state.config, res.informes, ahora, res.hasta, null, res);
      const sin = excelLibro(res.registros, res.colas, res.resumen, __cache, state.config, res.informes, ahora, res.hasta, null);
      fiEstado.verTodos = true;
      return { libro: xlsxBytes(libro, ahora), hojasSin: sin.hojas.map(h => h.nombre), mismo: JSON.stringify(res.registros) === antes,
        html: fiHtmlHistorial(res, 2025, res.informes[2025], res.informes[2025]),
        posicion: Object.entries(posicionAbierta(res.colas)).map(([a, p]) => [res.nombres.get(a) || a, p[0], p[1]]),
        gpResumen: Object.values(res.resumen).map(b => b.gp_neta_eur) };
    })()`, sb);
  fs.writeFileSync(ruta, Buffer.from(R.libro));
  const [con] = volcarConPython([ruta]);

  console.log("== Las hojas ==");
  assert("«Historial» después de «Ingresos», sin «Cartera»", JSON.stringify(con.orden.slice(0, 4)) === JSON.stringify(["Resumen", "Transacciones", "Ingresos", "Historial"]) &&
    !con.orden.includes("Cartera"), con.orden);
  assert("sin el cálculo de 🧾, no sale (ni «Cartera»)", !R.hojasSin.includes("Historial") && !R.hojasSin.includes("Cartera"), R.hojasSin);
  assert("el Excel no cambia lo que recibe", R.mismo);

  console.log("== Igual que la pantalla, fila a fila ==");
  const h = con.hojas.Historial;
  const { difs, comparadas } = compararConPantalla(sb, R.html, h);
  assert("las " + comparadas + " filas de las tablas de cada activo dicen lo mismo que 🧾", difs.length === 0 && comparadas > 20, difs.slice(0, 10));
  const filas = filasDe(h);
  const textos = Object.values(h).filter(c => c[0] === "t").map(c => c[1]);
  assert("arriba, «Hasta el 31/12/2025» y el orden FIFO", h.A2 && h.A2[1] === "Hasta el 31/12/2025, en orden FIFO: al vender salen primero los más antiguos.", h.A2);
  assert("los grupos con los nombres del Resumen y el que ya no tienes, dicho",
    textos.includes("Transmisión de tokens de inmuebles") && textos.includes("Permutas de monedas virtuales") && textos.includes("Ya no lo tienes"));
  assert("los lotes de la venta, a la vista", textos.includes("↳ Compra del 01/02/2024") && textos.includes("↳ Compra externa del 01/03/2024"));
  assert("la compra a revisar: «A revisar» y su nota, con la hoja de su aviso",
    textos.includes("A revisar") && textos.includes("No cuenta hasta revisarla. A revisar: aviso en «Fiscal 2025»"));
  assert("la línea de arriba del activo con algo a revisar lo dice", textos.some(t => /^A revisar \(\d+\)/.test(t)));
  assert("la compra externa con el coste de por defecto lleva «**» y la nota", Object.values(h).some(c => c[0] === "n" && /\*\*/.test(c[2] || "")) &&
    textos.some(t => t.startsWith("** Incluye compras")));

  console.log("== Frente al motor (sin pasar por js/23) ==");
  const motor = compararConMotor(h, R.posicion, R.gpResumen);
  assert("lo que queda de los " + motor.comparados + " activos y su coste, los del motor; la ganancia o pérdida de todos los años, la del Resumen",
    motor.difs.length === 0 && motor.comparados >= 3, motor.difs);

  console.log("== Números, fechas y formatos ==");
  const enTablas = [...filas.values()].filter(f => f.A && f.A[0] === "d");
  assert("las fechas, fechas con hora", enTablas.length > 5 && enTablas.every(f => f.A[2] === "DD/MM/YYYY HH:MM"));
  assert("los rendimientos del mes, con su mes", textos.includes("03/2024"));
  assert("las cifras, números con su formato", Object.values(h).filter(c => c[0] === "n").every(c => c[2] && c[2] !== "General"),
    Object.entries(h).filter(([, c]) => c[0] === "n" && (!c[2] || c[2] === "General")).slice(0, 3));
  // Fechas escritas a mano (con «Z» y milésimas, y sin hora) y un coste de
  // 200,125 €: Excel redondea los empates hacia fuera y la pantalla al par.
  const raras = vm.runInContext(`(() => {
      const regs = structuredClone(__regs);
      regs.find(r => r.clave === "c2").fecha = "2024-03-01T10:00:00.000Z";
      Object.assign(regs.find(r => r.clave === "p1"), { fecha: "2024-04-01", coste_eur: 200.125 });
      const res = fiCalcular(regs, __cache, state.config, { hoy: "2025-12-31", diaReal: "2026-10-20", descargaIncompleta: false });
      const ahora = new Date("2026-10-20T10:00:00Z");
      return xlsxBytes(excelLibro(res.registros, res.colas, res.resumen, __cache, state.config, res.informes, ahora, res.hasta, null, res), ahora);
    })()`, sb);
  const rutaRaras = path.join(carpeta, "raras.xlsx");
  fs.writeFileSync(rutaRaras, Buffer.from(raras));
  const hRaras = volcarConPython([rutaRaras])[0].hojas.Historial;
  const fechasRaras = Object.values(hRaras).filter(c => c[0] === "d");
  assert("una fecha con «Z» sale con su hora; una sin hora, solo con el día",
    fechasRaras.some(c => c[1].startsWith("2024-03-01T10:00") && c[2] === "DD/MM/YYYY HH:MM") &&
    fechasRaras.some(c => c[1].startsWith("2024-04-01") && c[2] === "DD/MM/YYYY"), fechasRaras.slice(0, 6));
  const euros = Object.values(hRaras).filter(c => c[0] === "n" && /^[+]?#,##0\.00(?!0)/.test(c[2] || ""));
  assert("los € ya redondeados al céntimo, los empates al par (200,125 → 200,12)",
    euros.some(c => c[1] === 200.12) && euros.every(c => Math.abs(c[1] * 100 - Math.round(c[1] * 100)) < 1e-6),
    euros.filter(c => Math.abs(c[1] * 100 - Math.round(c[1] * 100)) >= 1e-6).slice(0, 3));
  // A3: un gas de POL con la fecha mal escrita (o sin fecha) lo gasta el
  // motor y el historial no lo enseña: la pantalla y el Excel lo dicen.
  for (const fecha of ["2025-02-30 10:00:00", null]) {
    sb.__fecha = fecha;
    const g = vm.runInContext(`(() => {
        const regs = structuredClone(__regs);
        regs.push(Object.assign({}, regs[0], { clave: "gm", hash: "0xgm", categoria: "COMISION", subcategoria: "NEUTRO", contrato: "pol",
          cantidad: 4, importe_usdt: null, fecha: __fecha }));
        const res = fiCalcular(regs, __cache, state.config, { hoy: "2025-12-31", diaReal: "2026-10-20", descargaIncompleta: false });
        const libro = excelLibro(res.registros, res.colas, res.resumen, __cache, state.config, res.informes, new Date(), res.hasta, null, res);
        const h = libro.hojas.find(x => x.nombre === "Historial");
        return { pantalla: fiHtmlHistorial(res, 2025, res.informes[2025], res.informes[2025]).includes("No cuadran con la cartera"),
          excel: [...h.filas.values()].some(m => [...m.values()].some(c => String(c.valor).startsWith("No cuadran con la cartera del informe de 2025"))) };
      })()`, sb);
    assert("un gas de POL " + (fecha ? "con la fecha mal escrita" : "sin fecha") + ": «No cuadran» en 🧾 y en el Excel", g.pantalla && g.excel, g);
  }
  assert("sin fechas malas, no sale «No cuadran»", !R.html.includes("No cuadran") && !textos.some(t => t.startsWith("No cuadran")));
  const excel = abrirConExcel([ruta]);
  if (excel === null) console.log("  (sin Excel en este ordenador: no se abre con él)");
  else assert("Excel lo abre sin repararlo", excel.length === 1 && excel[0] === "ok", excel);
  fs.rmSync(carpeta, { recursive: true, force: true });

  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
}
