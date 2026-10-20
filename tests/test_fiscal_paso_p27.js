/* P27: el historial de cada activo en 🧾 Fiscal (js/23 fiHistorial y
 * fiHtmlHistorial), por el camino de la app: el motor de verdad (js/21,
 * con fiscEnCurso) y fiCalcular, que apunta cada lote que nace o se gasta.
 *
 * Bajo prueba: una fila por operación con su registro (el gas, del suyo,
 * no de la compra), rendimientos por mes, el canje en una fila ±0, la
 * venta con su desglose por compra (la de antes del canje), «Quedan x de
 * y» a 31/12 (también lo que pasa por un canje), «Tienes» que acaba en lo
 * que queda, la entrada a revisar que no cuenta, el subtotal de cada grupo
 * igual al del Resumen, el interruptor de los que ya no tienes y que
 * fiCalcular deja el motor como estaba.
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_fiscal_paso_p27.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");
const { MODULOS_PDF } = require("./paridad_informe_pdf_paso_63.js");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const sb = sandbox(MODULOS_PDF.concat(["18-transacciones.js"]), HORA_APP);
sb.structuredClone = structuredClone;
const USDT = vm.runInContext("USDT", sb), BURN = vm.runInContext("BURN", sb);
const { WALLET, registrosP27 } = require("./navegador/p27_comun.js");
const regs = registrosP27(USDT, BURN), tipos = {};
for (const r of regs) tipos[r.fecha.slice(0, 10)] = 1.25;
sb.__regs = regs;
sb.__cache = { tipos_bce: tipos, precios_rnt: {}, precios_pol: {}, ajustes_usuario: { c2: { coste_eur: 500 } }, contratos_aprendidos: {} };
const R = JSON.parse(vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" }; state.cache = __cache;
  (() => {
    const antes = [crearLote, consumirFifo, fiscAbrirLote];
    const res = fiCalcular(__regs, __cache, state.config, { hoy: "2025-12-31", diaReal: "2026-10-20", descargaIncompleta: false });
    const vuelven = [crearLote, consumirFifo, fiscAbrirLote].every((f, i) => f === antes[i]) && fiscEnCurso === null;
    const ver = anio => fiHistorial(res, anio, __cache).map(a => ({ nombre: a.nombre, quedan: a.quedan, coste: a.costeQueda, gp: a.gp, gpAnio: a.gpAnio,
      avisos: a.avisos, abierto: a.abierto,
      filas: a.filas.map(f => ({ tipo: f.tipo, op: fiOperacion(f, a.nombre, res.nombres), tienes: f.tienes, regs: [...f.registros].map(r => r.clave),
        c: f.cifras && { tokens: f.cifras.tokens, total: f.cifras.total, comision: f.cifras.comision, coste: f.cifras.coste, gp: f.cifras.gp,
          quedan: f.cifras.quedan, usd: f.cifras.usd, piezas: f.cifras.piezas } })) }));
    const resumen = anio => Object.fromEntries(res.informes[anio].resumen.filter(f => /^gp_(inmuebles|permutas)$/.test(f.clave)).map(f => [f.clave, f.importe]));
    const grupos = anio => { const h = fiHistorial(res, anio, __cache); return [fiGpDelGrupo(h.filter(a => !a.moneda), anio), fiGpDelGrupo(h.filter(a => a.moneda), anio)]; };
    fiEstado.verTodos = false;
    const html = fiHtmlHistorial(res, 2025, res.informes[2025], res.informes[2025]);
    fiEstado.verTodos = true;
    const htmlTodos = fiHtmlHistorial(res, 2025, res.informes[2025], res.informes[2025]);
    return JSON.stringify({ vuelven, h24: ver(2024), h25: ver(2025), r24: resumen(2024), r25: resumen(2025), g24: grupos(2024), g25: grupos(2025),
      html, htmlTodos, cuadran: fiLotesCuadran(res.lotes, res.nombres, res.informes[2025]) });
  })();`, sb));
const de = (h, nombre) => h.find(a => a.nombre === nombre);
const r2 = x => Math.round(x * 100) / 100;

/* Un caso suelto por el mismo camino (VM nueva): el historial de anio,
   el Resumen, los subtotales, el HTML y la cartera del motor a 31/12
   (cierres: [cantidad, coste] por cola) por nombre de activo. */
const RNT = vm.runInContext("RNT", sb), CASA = "0x" + "a".repeat(40), NUEVO = "0x" + "b".repeat(40), OTRO = "0x" + "c".repeat(40);
function reg(clave, fecha, categoria, subcategoria, contrato, cantidad, campos = {}) {
  return Object.assign({ clave, fecha, hash: "0x" + clave, contrato, token: null, simbolo: null, cantidad,
    categoria, subcategoria, inmueble: null, periodo_fiscal: null, importe_usdt: null, coste_eur: null,
    via_compra: null, origen: OTRO, destino: WALLET, fuente: "PRUEBA", nota: "", revisar: false }, campos);
}
function pasada(regsCaso, anio, extra = {}) {
  const s = sandbox(MODULOS_PDF.concat(["18-transacciones.js"]), HORA_APP);
  s.structuredClone = structuredClone;
  const tiposCaso = {};
  for (const r of regsCaso) if (/^\d{4}-\d{2}-\d{2}/.test(r.fecha)) tiposCaso[r.fecha.slice(0, 10)] = 1.25;
  s.__regs = regsCaso;
  s.__cache = Object.assign({ tipos_bce: tiposCaso, precios_rnt: {}, precios_pol: {}, ajustes_usuario: {}, contratos_aprendidos: {} }, extra);
  s.__anio = anio;
  return JSON.parse(vm.runInContext(`state.config = { wallet: "${WALLET}", vault: "" }; state.cache = __cache;
    (() => {
      const res = fiCalcular(__regs, __cache, state.config, { hoy: __anio + "-12-31", diaReal: "2026-10-20", descargaIncompleta: false });
      const h = fiHistorial(res, __anio, __cache);
      const op = { cierres: {} };
      motorFiscal(structuredClone(__regs), __cache, state.config, op);
      const motor = {};
      for (const [activo, [n, coste]] of Object.entries(op.cierres[__anio] || {})) {
        const nombre = res.nombres.get(activo) || activo, antes = motor[nombre] || [0, 0];
        motor[nombre] = [antes[0] + n, coste === null || antes[1] === null ? null : antes[1] + coste];
      }
      const resumen = Object.fromEntries(res.informes[__anio].resumen.filter(f => /^gp_/.test(f.clave)).map(f => [f.clave, f.importe]));
      fiEstado.verTodos = false;
      return JSON.stringify({ motor, resumen, grupos: [fiGpDelGrupo(h.filter(a => !a.moneda), __anio), fiGpDelGrupo(h.filter(a => a.moneda), __anio)],
        html: fiHtmlHistorial(res, __anio, res.informes[__anio], res.informes[__anio]),
        h: h.map(a => ({ nombre: a.nombre, moneda: a.moneda, quedan: a.quedan, coste: a.costeQueda, gp: a.gp, abierto: a.abierto,
          filas: a.filas.map(f => ({ tipo: f.tipo, op: fiOperacion(f, a.nombre, res.nombres), tienes: f.tienes,
            c: f.cifras && { tokens: f.cifras.tokens, total: f.cifras.total, coste: f.cifras.coste, quedan: f.cifras.quedan, sinLote: f.cifras.sinLote } })) })) });
    })();`, s));
}
/* Lo que queda de cada activo del historial = la cartera del motor a 31/12 (cantidad y coste). */
const cuadraConMotor = R => R.h.every(a => {
  const m = R.motor[a.nombre] || [0, 0];
  return Math.abs(a.quedan - m[0]) < 1e-9 && (a.coste === undefined ? m[1] === null : Math.abs(a.coste - m[1]) < 1e-6);
}) && Object.keys(R.motor).every(n => R.h.some(a => a.nombre === n));
const base = [reg("d1", "2024-01-05 10:00:00", "DEPOSITO", "COSTE_BASE", USDT, 1000, { importe_usdt: 1000 })];

console.log("== fiCalcular deja el motor como estaba ==");
assert("crearLote, consumirFifo y fiscAbrirLote vuelven a ser los de js/21, y fiscEnCurso a null", R.vuelven);

console.log("== 2024: hasta el 31/12 ==");
{
  const casa = de(R.h24, "Casa"), usdt = de(R.h24, "USDT"), pol = de(R.h24, "POL");
  assert("activos: los inmuebles por nombre (el contrato viejo y el del canje juntos) y después las monedas",
    igual(R.h24.map(a => a.nombre), ["Casa", "Piso", "POL", "USDT"]), R.h24.map(a => a.nombre));
  assert("Casa: compra, compra externa y canje (la venta de 2025 no sale)",
    igual(casa.filas.map(f => f.op), ["Compra", "Compra externa", "Canje"]), casa.filas.map(f => f.op));
  const [c1, c2, k] = casa.filas;
  assert("la compra: +5, su valor sin el gas y el gas en «Comisión» (0,1 POL a 0,50 €)",
    c1.c.tokens === 5 && r2(c1.c.total) === 400 && r2(c1.c.comision) === 0.05, c1.c);
  assert("«Quedan» a 31/12: lo de cada compra pasa por el canje (5 de 5 y 5 de 5)", c1.c.quedan === 5 && c2.c.quedan === 5, [c1.c.quedan, c2.c.quedan]);
  assert("el canje: una fila ±0 con las compras que pasan al contrato nuevo",
    k.c.tokens === 0 && k.tienes === 10 && igual(k.c.piezas.map(p => [p.texto, p.n]), [["Compra del 01/02/2024", 5], ["Compra externa del 01/03/2024", 5]]), k.c);
  assert("Casa: quedan 10 con su coste (400,05 + 500) y sin ventas", casa.quedan === 10 && r2(casa.coste) === 900.05 && casa.gp === null && casa.abierto, casa);
  assert("USDT: ingreso, pago y los rendimientos de marzo en una fila",
    igual(usdt.filas.map(f => f.op), ["Ingreso de dinero", "Pago · Casa", "Rendimientos · 2 cobros"]), usdt.filas.map(f => f.op));
  const [ing, pago, rend] = usdt.filas;
  assert("el pago: −500, su valor y su coste (permuta sin ganancia)", pago.c.tokens === -500 && r2(pago.c.total) === 400 && r2(pago.c.coste) === 400 && r2(pago.c.gp) === 0, pago.c);
  assert("los rendimientos del mes: +20, 16 € y 20 $, quedan 20", rend.c.tokens === 20 && r2(rend.c.total) === 16 && rend.c.usd === 20 && rend.c.quedan === 20, rend.c);
  assert("el ingreso: quedan 500 de 1000 (lo pagado sale de él)", ing.c.quedan === 500, ing.c);
  assert("«Tienes» va sumando y acaba en lo que queda", usdt.filas.map(f => f.tienes).join() === "1000,500,520" && usdt.quedan === 520, usdt.filas.map(f => f.tienes));
  assert("POL: el gas de febrero, en su fila del mes y con el registro del gas (no el de la compra)",
    pol.filas[1].tipo === "gas" && igual(pol.filas[1].regs, ["g1"]) && pol.filas[1].op === "Comisiones de red (gas) · 1" && r2(pol.filas[1].c.coste) === 0.05, pol.filas[1]);
  assert("2024: los subtotales dan lo mismo que el Resumen", igual(R.g24, [R.r24.gp_inmuebles, R.r24.gp_permutas]), [R.g24, R.r24]);
}

console.log("== 2025: la venta, la entrada a revisar y el que ya no tienes ==");
{
  const casa = de(R.h25, "Casa"), piso = de(R.h25, "Piso");
  const venta = casa.filas.find(f => f.op === "Venta");
  assert("la venta: −7, lo cobrado (875 $ = 700 €), su coste (5 de la compra con su gas + 2 externas) y su ganancia",
    venta.c.tokens === -7 && r2(venta.c.total) === 700 && r2(venta.c.coste) === 600.05 && r2(venta.c.gp) === 99.95 && venta.c.usd === 875, venta.c);
  assert("su desglose: de las compras de antes del canje, cada una con su coste",
    igual(venta.c.piezas.map(p => [p.texto, p.n, r2(p.coste)]), [["Compra del 01/02/2024", 5, 400.05], ["Compra externa del 01/03/2024", 2, 200]]), venta.c.piezas);
  assert("«Quedan» de cada compra: 0 de 5 y 3 de 5", casa.filas[0].c.quedan === 0 && casa.filas[1].c.quedan === 3);
  const rev = casa.filas.at(-1);
  assert("la compra a revisar sin lote: sale, sin cifras y sin sumar en «Tienes»", rev.tipo === "revisar" && rev.c === null && rev.tienes === 3 && casa.avisos === 1, rev);
  assert("Casa: quedan 3, ganancia de 2025 y desde el principio", casa.quedan === 3 && r2(casa.gp) === 99.95 && r2(casa.gpAnio) === 99.95, casa);
  assert("Piso: vendido del todo, ya no lo tienes", piso.quedan === 0 && !piso.abierto && r2(piso.gp) === 40, piso);
  assert("2025: los subtotales dan lo mismo que el Resumen", igual(R.g25, [R.r25.gp_inmuebles, R.r25.gp_permutas]), [R.g25, R.r25]);
  assert("los lotes cuadran con la cartera del informe", R.cuadran);
}

console.log("== La pantalla ==");
{
  assert("el interruptor cuenta los que ya no tienes; apagado, ocultos", R.html.includes("Ver también los que ya no tienes (1)") &&
    R.html.includes('fi-h-activo fi-h-cerrado" data-abierto="historial:Piso"') && !R.html.includes("fi-historial fi-todos"));
  assert("encendido, el historial lo recuerda", R.htmlTodos.includes("fi-historial fi-todos") && R.htmlTodos.includes('id="fiVerTodos" data-foco="verTodos" checked'));
  assert("grupos con los nombres del Resumen", R.html.includes("Transmisión de tokens de inmuebles") && R.html.includes("Permutas de monedas virtuales"));
  assert("la venta con su botón de lotes (aria-expanded) y sus filas ocultas", /aria-expanded="false" data-desglose="[^"]+" data-foco="[^"]+">▸ 2 lotes/.test(R.html) &&
    (R.html.match(/class="fi-h-lote"[^>]* hidden/g) || []).length >= 2);
  assert("el canje ±0, «Quedan x de y» y la entrada que no cuenta", R.html.includes("±0") && R.html.includes("3 de 5") &&
    R.html.includes("No cuenta hasta revisarla") && R.html.includes("fi-h-nocuenta"));
  assert("la hora, debajo de la fecha, y las dos horas al pasar el ratón", R.html.includes('<span class="fi-h-hora">10:00</span>') &&
    R.html.includes("hora española · "));
  assert("la compra externa con el coste de por defecto (Piso) lleva «**» y su nota; con el tuyo (Casa), no",
    R.html.includes("200,00 € **") && R.html.includes("** Incluye compras") && !R.html.includes("500,00 € **"));
  assert("la ganancia con su color", R.html.includes('class="fi-pos">+99,95 €'));
}

console.log("== Lo que queda, frente al motor ==");
{
  const R = pasada(regs, 2025, sb.__cache);
  assert("con los datos comunes, lo que queda de cada activo es la cartera del motor a 31/12 (cantidad y coste)", cuadraConMotor(R),
    [R.motor, R.h.map(a => [a.nombre, a.quedan, a.coste])]);
}

console.log("== A1: una compra de RNT sin precio no vale 0 ==");
{
  const R = pasada([...base,
    reg("b1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", RNT, 100, { via_compra: "BANCARIA" }),
    reg("s1", "2024-05-01 10:00:00", "VENTA", "GPP_SWAP", RNT, 40, { importe_usdt: 50, origen: WALLET, destino: OTRO })], 2024);
  const rnt = de(R.h, "RNT"), compra = rnt.filas[0];
  assert("A1: la compra sin precio, con ⚠️ en el total (no 0,00 €) y lo que queda sin coste conocido, como el motor",
    compra.op === "Compra externa" && compra.c.total === undefined && rnt.quedan === 60 && rnt.coste === undefined && cuadraConMotor(R), [compra, rnt.coste, R.motor]);
  assert("A1: en la línea de RNT, ⚠️ en «Coste de lo que queda»", /data-abierto="historial:RNT"[\s\S]*?<span>60<\/span><span><a href="#fiAvisos"/.test(R.html));
}

console.log("== A4: el aviso de una fila de otro año ==");
{
  const R = pasada([...base,
    reg("c3", "2024-07-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 1, { inmueble: "Casa", via_compra: "ONCHAIN" }),
    reg("c4", "2025-03-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 2, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 200 })], 2025);
  const fila = (R.html.match(/<tr class="fi-h-entra fi-h-nocuenta">[\s\S]*?<\/tr>/) || [""])[0];
  assert("A4: en 2025, la fila a revisar de 2024 dice que su aviso está en los de 2024, sin enlace a los de 2025",
    fila.includes("su aviso, en los de 2024") && !fila.includes('href="#fiAvisos"'), fila);
}

console.log("== A5: la hora repetida de octubre ==");
{
  // 02:30 de verano (00:30 UTC) va antes que 02:10 de invierno (01:10 UTC).
  const R = pasada([...base,
    reg("c1", "2024-10-27 02:30:00", "COMPRA", "COSTE_BASE", CASA, 5, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 500, instante: "2024-10-27T00:30:00Z" }),
    reg("v1", "2024-10-27 02:10:00", "VENTA", "GPP_INMUEBLE", CASA, 5, { inmueble: "Casa", importe_usdt: 700, origen: WALLET, destino: OTRO, instante: "2024-10-27T01:10:00Z" })], 2024);
  const casa = de(R.h, "Casa");
  assert("A5: la compra antes que la venta (por el instante, como el motor) y «Tienes» nunca baja de 0",
    igual(casa.filas.map(f => [f.op, f.tienes]), [["Compra externa", 5], ["Venta", 0]]), casa.filas.map(f => [f.op, f.tienes]));
}

console.log("== A6: el canje con decimales, ±0 ==");
{
  const tot = 0.3 + 0.6 + 0.1;   // 0,9999999999999999
  const R = pasada([...base,
    reg("c1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 0.3, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 30 }),
    reg("c2", "2024-02-02 10:00:00", "COMPRA", "COSTE_BASE", CASA, 0.6, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 60 }),
    reg("c5", "2024-02-03 10:00:00", "COMPRA", "COSTE_BASE", CASA, 0.1, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 10 }),
    reg("k", "2024-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, tot, { inmueble: "Casa", origen: WALLET, destino: BURN }),
    Object.assign(reg("k", "2024-06-01 10:00:00", "COMPRA", "COSTE_BASE", NUEVO, tot, { inmueble: "Casa", via_compra: "CANJE" }), { clave: "k::1" })], 2024);
  const canje = (R.html.match(/<tr class="fi-h-canje">[\s\S]*?<\/tr>/) || [""])[0];
  assert("A6: el canje sale «±0» aunque la resta de decimales no dé 0 justo", canje.includes(">±0<"), canje.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
}

console.log("== A7: un grupo con todo vendido ==");
{
  const R = pasada([...base,
    reg("c1", "2024-02-01 10:00:00", "COMPRA", "COSTE_BASE", CASA, 5, { inmueble: "Casa", via_compra: "BANCARIA", coste_eur: 500 }),
    reg("v1", "2024-06-01 10:00:00", "VENTA", "GPP_INMUEBLE", CASA, 5, { inmueble: "Casa", importe_usdt: 700, origen: WALLET, destino: OTRO })], 2024);
  const grupos = R.html.match(/<div class="fi-h-grupo[^"]*"><div class="fi-subgrupo">[^<]*/g) || [];
  assert("A7: el grupo de inmuebles, todo vendido, se oculta con ellos; el de monedas, no",
    igual(grupos.map(g => g.includes("fi-h-cerrado")), [true, false]), grupos);
}

console.log("\n" + ok + " OK, " + fallos + " fallos");
process.exit(fallos ? 1 : 0);
