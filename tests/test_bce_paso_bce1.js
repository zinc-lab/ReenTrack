/* Los tipos del BCE: qué se pide y qué se guarda.
 *
 * A7  Con lo de antes ya cubierto, solo se pide lo que falta por el final,
 *     con 7 días de antes (no toda la serie cada día); si falta algo de
 *     antes, el tramo entero.
 * A1  Un día que el BCE publicó tarde, o tipos borrados, se recogen en la
 *     siguiente sincronización.
 * A2/A3 Una cobertura mal escrita o en el futuro no bloquea ni estira nada.
 * A6  Si el BCE falla (no responde, 503, «null», texto roto, vacío con días
 *     que ya tenían que tener tipo) es un error y la cache queda igual.
 * A5/A4 El día de la sincronización (después de lo cubierto) admite un día
 *     más, en el vault del informe y en el motor; el resto, el de siempre.
 *
 * El BCE falso publica de lunes a viernes salvo festivos y devuelve solo el
 * tramo pedido, como el de verdad (200 sin nada si no hay tipos).
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_bce_paso_bce1.js
 */
"use strict";
const vm = require("vm");
const { sandbox, HORA_APP } = require("./paridad_motor_fiscal_paso_51f.js");

let fallos = 0, oks = 0;
function assert(nombre, cond, extra) {
  if (cond) { oks++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

const FESTIVOS = new Set(["2025-04-18", "2025-04-21", "2026-04-03", "2026-04-06"]);
const dia = (f, n) => { const d = new Date(f + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const tipoDe = f => 1 + Number(f.slice(5, 7)) / 100 + Number(f.slice(8)) / 10000;
/* Los tipos publicados del tramo, hasta `publicadoHasta` (incluido). */
function serie(inicio, fin, publicadoHasta) {
  const fechas = [];
  for (let f = inicio; f <= fin && f <= publicadoHasta; f = dia(f, 1)) {
    const sem = new Date(f + "T00:00:00Z").getUTCDay();
    if (sem !== 0 && sem !== 6 && !FESTIVOS.has(f)) fechas.push(f);
  }
  if (!fechas.length) return "";
  return JSON.stringify({ structure: { dimensions: { observation: [{ values: fechas.map(id => ({ id })) }] } },
    dataSets: [{ series: { "0": { observations: Object.fromEntries(fechas.map((f, i) => [String(i), [tipoDe(f)]])) } } }] });
}

/* Un BCE falso: `responder(start, end)` da {status, texto} o lanza; por
   defecto, el calendario de arriba publicado hasta `estado.publicado`. */
function bce(responder) {
  const sb = sandbox(["01-constantes.js", "02-utilidades.js", "07-bce.js"], HORA_APP);
  sb.URLSearchParams = URLSearchParams;
  sb.pedidos = [];
  sb.estado = { publicado: "9999-12-31" };
  responder = responder || ((a, b) => ({ status: 200, texto: serie(a, b, sb.estado.publicado) }));
  sb.fetch = async url => {
    const u = new URL(url), p = [u.searchParams.get("startPeriod"), u.searchParams.get("endPeriod")];
    sb.pedidos.push(p);
    const r = responder(...p);
    return { ok: r.status === 200, status: r.status, text: async () => r.texto };
  };
  return sb;
}
const conTipos = (inicio, fin) => Object.fromEntries(JSON.parse(serie(inicio, fin, fin)).structure.dimensions.observation[0].values
  .map(v => [v.id, tipoDe(v.id)]));

async function main() {
  console.log("== A7. Solo se pide lo que falta, con 7 días de antes ==");
  {
    const sb = bce();
    const cache = { tipos_bce: conTipos("2025-01-01", "2025-03-10"), bce_cobertura: { inicio: "2025-01-01", fin: "2025-03-10" } };
    const n = await sb.actualizarTiposBce(cache, ["2025-02-01", "2025-03-12"], "2025-03-13");
    assert("pide de 7 días antes del fin de lo cubierto hasta lo necesario", JSON.stringify(sb.pedidos) === '[["2025-03-03","2025-03-12"]]', sb.pedidos);
    assert("guarda los nuevos", n === 2 && cache.tipos_bce["2025-03-12"] === tipoDe("2025-03-12"), n);
    assert("la cobertura conserva su inicio y llega hasta ayer",
      cache.bce_cobertura.inicio === "2025-01-01" && cache.bce_cobertura.fin === "2025-03-12", cache.bce_cobertura);
    await sb.actualizarTiposBce(cache, ["2025-02-01", "2025-03-12"], "2025-03-14");
    assert("lo ya cubierto no se vuelve a pedir", sb.pedidos.length === 1, sb.pedidos);
  }
  {
    const sb = bce();
    const cache = { tipos_bce: conTipos("2025-03-01", "2025-03-10"), bce_cobertura: { inicio: "2025-03-01", fin: "2025-03-10" } };
    await sb.actualizarTiposBce(cache, ["2025-02-10", "2025-03-12"], "2025-03-13");
    assert("si falta algo de antes, el tramo entero", JSON.stringify(sb.pedidos) === '[["2025-02-03","2025-03-12"]]', sb.pedidos);
    assert("y la cobertura empieza ahí", cache.bce_cobertura.inicio === "2025-02-03", cache.bce_cobertura);
  }
  {
    const sb = bce();
    const cache = { tipos_bce: {}, bce_cobertura: {} };
    await sb.actualizarTiposBce(cache, ["2025-03-12"], "2025-03-13");
    assert("sin cobertura, lo necesario con 7 días de margen", JSON.stringify(sb.pedidos) === '[["2025-03-05","2025-03-12"]]', sb.pedidos);
  }

  console.log("== A1. Lo que el BCE publicó tarde o se borró vuelve a pedirse ==");
  {
    // Sincronizas el 12/03 de madrugada y el BCE aún no ha publicado el 11/03.
    const sb = bce();
    const cache = { tipos_bce: conTipos("2025-01-01", "2025-03-07"), bce_cobertura: { inicio: "2025-01-01", fin: "2025-03-07" } };
    sb.estado.publicado = "2025-03-10";
    await sb.actualizarTiposBce(cache, ["2025-02-01", "2025-03-11"], "2025-03-12");
    assert("sin el 11/03 al pedirlo", !("2025-03-11" in cache.tipos_bce) && cache.bce_cobertura.fin === "2025-03-11", cache.bce_cobertura);
    sb.estado.publicado = "9999-12-31";
    await sb.actualizarTiposBce(cache, ["2025-02-01", "2025-03-12"], "2025-03-13");
    assert("la sincronización siguiente lo recoge", cache.tipos_bce["2025-03-11"] === tipoDe("2025-03-11"), sb.pedidos);
  }
  {
    // Los tipos se borraron (cache editada a mano) y la cobertura sigue.
    const sb = bce();
    const cache = { tipos_bce: {}, bce_cobertura: { inicio: "2025-01-01", fin: "2025-03-10" } };
    await sb.actualizarTiposBce(cache, ["2025-02-03", "2025-03-12"], "2025-03-13");
    assert("sin tipos en lo cubierto, se pide todo lo necesario", JSON.stringify(sb.pedidos) === '[["2025-01-27","2025-03-12"]]', sb.pedidos);
    assert("y vuelven los de febrero", cache.tipos_bce["2025-02-03"] === tipoDe("2025-02-03"), Object.keys(cache.tipos_bce).length);
  }

  console.log("== A2/A3. Cobertura mal escrita o en el futuro ==");
  for (const fin of ["2025-03-00", "2025-02-30", "15/03/2025", 20250310, "2025-03-10T00:00:00", true, "ayer"]) {
    const sb = bce();
    const cache = { tipos_bce: conTipos("2025-01-01", "2025-03-10"), bce_cobertura: { inicio: "2025-01-01", fin } };
    let error = null;
    try { await sb.actualizarTiposBce(cache, ["2025-03-03", "2025-03-12"], "2025-03-13"); } catch (e) { error = e.message; }
    assert("fin " + JSON.stringify(fin) + ": sin error, pide lo necesario y la cobertura queda bien",
      !error && JSON.stringify(sb.pedidos) === '[["2025-02-24","2025-03-12"]]' && cache.bce_cobertura.fin === "2025-03-12",
      { error, pedidos: sb.pedidos, cobertura: cache.bce_cobertura });
  }
  {
    // Un reloj adelantado dejó la cobertura en el 20/03: hoy es el 13/03.
    const sb = bce();
    const cache = { tipos_bce: conTipos("2025-01-01", "2025-03-07"), bce_cobertura: { inicio: "2025-01-01", fin: "2025-03-20" } };
    await sb.actualizarTiposBce(cache, ["2025-02-01", "2025-03-12"], "2025-03-13");
    assert("un fin en el futuro se recorta a ayer y se pide lo que falta",
      JSON.stringify(sb.pedidos) === '[["2025-03-04","2025-03-12"]]' && cache.tipos_bce["2025-03-12"] === tipoDe("2025-03-12"), sb.pedidos);
  }

  console.log("== A6. Si el BCE falla, error y la cache igual ==");
  const casos = [
    ["no responde", () => { throw new TypeError("Failed to fetch"); }],
    ["503", () => ({ status: 503, texto: "" })],
    ["200 con «null» (§B17 F5)", () => ({ status: 200, texto: "null" })],
    ["200 con texto roto", () => ({ status: 200, texto: "<html>" })],
    ["200 vacío con días que ya tenían que tener tipo", () => ({ status: 200, texto: "" })],
  ];
  for (const [nombre, responder] of casos) {
    const sb = bce(responder);
    const cache = { tipos_bce: conTipos("2025-01-01", "2025-03-07"), bce_cobertura: { inicio: "2025-01-01", fin: "2025-03-07" } };
    const antes = JSON.stringify(cache);
    let error = null;
    try { await sb.actualizarTiposBce(cache, ["2025-03-11"], "2025-03-12"); } catch (e) { error = e; }
    assert(nombre + ": error", !!error, error && error.message);
    assert(nombre + ": la cache queda igual", JSON.stringify(cache) === antes, cache.bce_cobertura);
  }
  {
    // Solo hoy, que aún no está publicado: 200 vacío y no es un error.
    const sb = bce(() => ({ status: 200, texto: "" }));
    let error = null, n;
    try { n = await sb.descargarTiposBce("2025-03-13", "2025-03-13"); } catch (e) { error = e; }
    assert("200 vacío de un día sin publicar: sin error", !error && Object.keys(n).length === 0, error && error.message);
  }
  {
    // De principio a fin: la sincronización del paso «bce» con el BCE caído.
    const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "09-sincronizacion.js",
      "10-csv-descubrimiento.js", "14-clasificador.js", "21-fiscal.js", "22-informe-renta.js"], HORA_APP);
    sb.URLSearchParams = URLSearchParams;
    sb.fetch = async () => ({ ok: false, status: 503, text: async () => "" });
    vm.runInContext(`
      __puntos = {}; __barra = []; __avisos = [];
      leerConfigDesdeFormulario = () => {}; guardarConfigLocalSilencioso = () => {};
      configValidaParaSincronizar = () => []; setBotonesSync = () => {}; renderPanel = () => {};
      actualizarChipEstado = () => {}; marcarCacheDirty = () => { state.cacheDirty = true; }; autoGuardarCache = async () => {};
      setDot = (p, e) => { __puntos[p] = e; }; setProgreso = (n, t) => { if (t) __barra.push(t); };
      toast = t => { __avisos.push(t); };
      state.config = { wallet: "0x1", vault: "" };
      state.cache = asegurarEstructuraCache(cacheVacia());
      state.cache.transacciones.wallet_normales = [{ timeStamp: "1741600000", hash: "0xa" }];
      state.filasCsv = [];
    `, sb);
    const r = await vm.runInContext(`sincronizar("bce")`, sb);
    assert("el paso «bce» sale en rojo", sb.__puntos.bce === "err" && r && JSON.stringify(r.errores) === '["bce"]', { puntos: sb.__puntos, r });
    assert("la barra dice «Terminada con errores en: bce» y nadie dice «completa»",
      sb.__barra.includes("Terminada con errores en: bce") && !sb.__avisos.some(t => /completa/.test(t)), { barra: sb.__barra, avisos: sb.__avisos });
  }

  console.log("== A5/A4. El día de la sincronización admite un día más ==");
  {
    const sb = sandbox(["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "14-clasificador.js", "21-fiscal.js", "22-informe-renta.js"], HORA_APP);
    sb.vaultConfig = () => "0xvault";
    sb.serieSaldoVault = () => ({ movimientos: [{ fecha: "2026-01-10", saldo_usdt: 1000 }] });
    // Pascua de 2026: viernes 3 y lunes 6 de abril sin tipo; el último, el
    // jueves 2. Sincronizas el martes 7: lo cubierto llega hasta el lunes.
    const cache = { tipos_bce: { "2026-04-02": 1.1 }, bce_cobertura: { inicio: "2026-01-01", fin: "2026-04-06" } };
    const cierre = { "0xinmueble": [1, 50] };
    const vault = (corte, c = cache) => sb.rentaInversionesActivas(cierre, corte, false, new Map(), c).vault;
    const v = vault("2026-04-07");
    assert("vault, martes de Pascua: pasa a euros", v.saldo_eur === 909.09 && v.fecha_tipo_bce === "2026-04-02", v);
    const v2 = vault("2026-04-08");
    assert("vault, un día más tarde: sin tipo y con su aviso", v2.saldo_eur === null && /ni de los 5 días antes/.test(v2.aviso), v2);
    const cubierto = { tipos_bce: cache.tipos_bce, bce_cobertura: { inicio: "2026-01-01", fin: "2026-04-07" } };
    const v3 = vault("2026-04-07", cubierto);
    assert("vault, mismo corte ya cubierto (su tipo se pidió): el margen de siempre", v3.saldo_eur === null && /ni de los 4 días antes/.test(v3.aviso), v3);
    const t = sb.reindexarForwardFill(cache.tipos_bce, "2026-04-02", "2026-04-07", cache);
    assert("motor, movimiento del martes de Pascua: tiene el tipo del jueves", t["2026-04-07"] === 1.1, t);
    const t2 = sb.reindexarForwardFill(cache.tipos_bce, "2026-04-02", "2026-04-07", cubierto);
    assert("motor, el mismo día ya cubierto: sin tipo", !("2026-04-07" in t2), t2);
    const t3 = sb.reindexarForwardFill(cache.tipos_bce, "2026-04-02", "2026-04-07");
    assert("motor sin cache: como siempre (4 días)", !("2026-04-07" in t3), t3);

    // El vault solo se lleva en USDT: se resta del USDT de la cola («USDT
    // (wallet)»); el USDC (esté donde esté) sale entero y a secas.
    const otros = sb.rentaInversionesActivas({ USDT: [1200, 1100], USDC: [30, 27] }, "2026-04-07", false, new Map(), cache)
      .otros.filas.map(f => [f.nombre, f.cantidad]);
    assert("con vault: «USDT (wallet)» sin el del vault y «USDC» entero, sin «(wallet)»",
      JSON.stringify(otros) === JSON.stringify([["USDT (wallet)", 200], ["USDC", 30]]), otros);
  }

  console.log("\n" + oks + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
}
main();
