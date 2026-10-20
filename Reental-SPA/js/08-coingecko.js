/* =====================================================================
   REENTAL SPA · js/08-coingecko.js
   Precios históricos de RNT (USD) vía CoinGecko: manejo de HTTP 429,
   error 10012 (límite 365 días) y espera entre llamadas.
   En el navegador el 429 de CoinGecko llega SIN cabecera CORS, así que
   fetch lanza un error de red en vez de devolver el 429. Un error de red tras una llamada se trata como límite
   probable: espera larga y ritmo más lento. Las fechas de más de 365 días
   se marcan «no disponible» sin llamar (mismo motivo y mismo bloque que el
   10012). Si una fecha agota los intentos, las siguientes no se piden
   durante unos minutos (sin reintentos inútiles).
   En vez de una llamada por fecha, UNA sola llamada a market_chart
   (days=365, interval=daily) trae el precio de las 00:00 UTC de cada día
   del último año; coincide al decimal con /history. Si esa llamada falla
   o la fecha no está en la serie, se sigue con /history fecha a fecha.
   Lo mismo para POL (antes MATIC), en precios_pol. Sus fechas
   de más de 365 días no se piden ni se apuntan: se ponen a mano en
   🔍 Revisión solo si el motor las necesita (js/11).
   ===================================================================== */

const MOTIVO_RNT_FUERA_365 = "más de 365 días: CoinGecko no lo da";
const CG_DIAS_MAX_PLAN_GRATUITO = 365;
// Estado del ritmo de llamadas (vive mientras la página está abierta).
// ahora/dormir son inyectables para los tests.
const coingeckoRitmo = {
  pausaMs: 6000,          // pausa tras cada llamada correcta (~10/minuto)
  pausaLentaMs: 15000,    // pausa tras haber chocado con el límite
  circuitoMs: 180000,     // tras agotar intentos: 3 min sin llamar
  circuitoHasta: 0,
  serieMs: 600000,        // la serie diaria vale 10 min (una sync)
  serie: null,            // { hasta, precios: { "YYYY-MM-DD": usd } } de RNT
  seriePol: null,         // la misma, de POL
  ahora: () => Date.now(),
  dormir: ms => sleep(ms),
};

function fechasConMovimientoRnt(cache) {
  return [...diasConMovimientoRnt(cache)].filter(([, cubierto]) => !cubierto).map(([f]) => f);
}
/* Los días (hora española) con movimiento de RNT: Map día -> true si a
   todos sus movimientos ya les vale el precio guardado de su día UTC (de
   antes de la hora española; js/21 lo usa): ese día no hace falta. Solo
   los de más de 365 días: los otros CoinGecko los da (el de su día manda).
   Una cache a medio escribir (sin alguna serie) cuenta esa serie vacía. */
function diasConMovimientoRnt(cache) {
  const txs = [];
  for (const nombreSerie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of (cache.transacciones || {})[nombreSerie] || []) if (normalizarDireccion(tx.contractAddress) === RNT) txs.push(tx);
  }
  return diasConMovimiento(txs, preciosLeidos(cache, "precios_rnt"));
}
function diasConMovimiento(txs, precios) {
  const dias = new Map();
  for (const tx of txs) {
    const f = fechaDeTx(tx);
    if (!f) continue;
    const utc = diaUtcSiOtro(fmtFechaHora(enHoraEspanola(aUtcNaive(tx.timeStamp))));
    const viejo = diasDesdeFechaRnt(f, coingeckoRitmo.ahora()) > CG_DIAS_MAX_PLAN_GRATUITO;
    dias.set(f, (dias.has(f) ? dias.get(f) : true) && viejo && !!utc && precioValido(precios[utc]));
  }
  return dias;
}
/* Fechas con entrada o salida de POL nativo de la wallet (las de
   movimientosPol de js/14, sin el gas ni los traspasos con tu vault): las
   que pueden necesitar precio de POL. */
function fechasConMovimientoPol(cache) {
  const txs = [];
  for (const deHash of movimientosPol(cache).values()) {
    for (const tx of deHash) if (!esDelVault(tx.from) && !esDelVault(tx.to)) txs.push(tx);
  }
  return [...diasConMovimiento(txs, preciosLeidos(cache, "precios_pol"))].filter(([, cubierto]) => !cubierto).map(([f]) => f);
}
/* Un precio que el motor fiscal acepta: un número de verdad mayor que 0,
   no un texto ni true. */
function precioValido(p) {
  return typeof p === "number" && Number.isFinite(p) && p > 0;
}
/* El bloque de precios de la cache para escribir en él. Sin él o con
   null, uno vacío; si no es un objeto (una cache escrita a mano), se
   aparta tal cual en «<campo>_no_leidos» (no se pierde nada) y se empieza
   vacío, con aviso. */
function bloquePrecios(cache, campo) {
  const b = cache[campo];
  if (b && typeof b === "object" && !Array.isArray(b)) return b;
  if (b !== null && b !== undefined) {
    const k = campo + "_no_leidos";
    if (!Array.isArray(cache[k])) cache[k] = cache[k] === null || cache[k] === undefined ? [] : [cache[k]];
    cache[k].push(b);
    log("Los precios de la cache («" + campo + "») estaban mal escritos: se apartan en «" + k + "» y se empieza de cero.", "warn");
  }
  return (cache[campo] = {});
}
/* El bloque para leerlo: {} si no es un objeto (no cambia la cache). */
function preciosLeidos(cache, campo) {
  const b = cache ? cache[campo] : null;
  return b && typeof b === "object" && !Array.isArray(b) ? b : {};
}
/* Una fecha AAAA-MM-DD (con o sin hora detrás) que existe. */
function fechaIsoValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return false;
  const d = new Date(valor.slice(0, 10) + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === valor.slice(0, 10);
}
// Días completos entre una fecha "YYYY-MM-DD" y hoy (en España).
function diasDesdeFechaRnt(fecha, ahoraMs) {
  const p = fecha.split("-").map(Number);
  const f = Date.UTC(p[0], p[1] - 1, p[2]);
  const h = enHoraEspanola(new Date(ahoraMs));
  const hoy = Date.UTC(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate());
  return Math.floor((hoy - f) / 86400000);
}
/* S1: su día UTC aún no ha empezado (un movimiento de las 00:00 a las
   01:00, o 02:00 en verano, españolas): CoinGecko todavía no lo tiene
   (responde el error 10014). No se pide ni se avisa: lo coge la siguiente
   sincronización. */
function diaUtcSinEmpezar(fecha, ahoraMs) {
  return fecha > new Date(ahoraMs).toISOString().slice(0, 10);
}
function marcarRntNoDisponible(cache, fecha, motivo) {
  cache.precios_rnt_no_disponibles = cache.precios_rnt_no_disponibles || {};
  cache.precios_rnt_no_disponibles[fecha] = motivo;
  // Las fechas sin precio viven en 🔍 Revisión → «Precios de RNT (USD)» →
  // «Fechas sin precio».
  log("Precio RNT de " + fechaEs(fecha) + " no disponible (" + motivo + "). Puedes añadirlo a mano en 🔍 Revisión → «Precios de RNT (USD)» → «Fechas sin precio».", "warn");
}
/* Lo que cambia de un token a otro. marcarFuera: qué hacer con
   una fecha de más de 365 días (RNT la apunta en noDisp; POL no). sufijo:
   el de los ids de su bloque de 🔍 Revisión (js/11); webId: su página en
   coingecko.com (la de POL, «polygon», lleva también MATIC). */
const CG_RNT = { nombre: "RNT", url: COINGECKO_HISTORY_URL, campo: "precios_rnt", serie: "serie",
                 marcarFuera: marcarRntNoDisponible, noDisp: "precios_rnt_no_disponibles",
                 sufijo: "Rnt", webId: () => "reental" };
const CG_POL = { nombre: "POL", url: COINGECKO_HISTORY_URL.replace("/reental/", "/polygon-ecosystem-token/"),
                 campo: "precios_pol", serie: "seriePol", marcarFuera: null, noDisp: null,
                 sufijo: "Pol", webId: () => "polygon" };   // la web de MATIC y POL (las otras dos redirigen y pierden la fecha)

// Serie diaria del último año en UNA llamada (memorizada unos minutos).
// Solo se aceptan los puntos de las 00:00:00 UTC (el último es «ahora»).
async function serieDiariaRnt() { return serieDiaria(CG_RNT); }
async function serieDiaria(m) {
  const R = coingeckoRitmo;
  if (R[m.serie] && R.ahora() < R[m.serie].hasta) return R[m.serie].precios;
  const precios = {};
  try {
    const url = m.url.replace(/history$/, "market_chart") + "?" +
      new URLSearchParams({ vs_currency: "usd", days: "365", interval: "daily" });
    const r = await fetch(url);
    if (r.status === 200) {
      const data = await r.json();
      for (const punto of Array.isArray(data && data.prices) ? data.prices : []) {
        // Solo [hora en número, precio].
        if (!Array.isArray(punto) || punto.length !== 2) continue;
        const [t, v] = punto;
        if (typeof t !== "number" || !Number.isFinite(t) || t % 86400000 !== 0 || !precioValido(v)) continue; // ni 0 ni negativos
        precios[new Date(t).toISOString().slice(0, 10)] = v;
      }
      log("CoinGecko: " + Object.keys(precios).length + " precios diarios de " + m.nombre + " del último año en una sola llamada.", "ok");
    } else {
      log("CoinGecko no dio la serie diaria de " + m.nombre + " (HTTP " + r.status + "): se piden las fechas una a una.", "warn");
    }
  } catch (e) {
    log("CoinGecko no dio la serie diaria de " + m.nombre + " (" + e.message + "): se piden las fechas una a una.", "warn");
  }
  R[m.serie] = { hasta: R.ahora() + R.serieMs, precios };
  return precios;
}
async function precioRntHistorico(fecha, cache, reintentos = 4, espera429 = 30000) {
  return precioHistorico(CG_RNT, fecha, cache, reintentos, espera429);
}
/* El de POL, en precios_pol. */
async function precioPolHistorico(fecha, cache, reintentos = 4, espera429 = 30000) {
  bloquePrecios(cache, "precios_pol");
  return precioHistorico(CG_POL, fecha, cache, reintentos, espera429);
}
async function precioHistorico(m, fecha, cache, reintentos, espera429) {
  const precios = cache[m.campo];
  // Lo guardado solo vale si es un precio de verdad (un 0 o un texto se
  // vuelve a pedir; si no, bloquearía la fecha para siempre).
  if (precioValido(precios[fecha])) return precios[fecha];
  const R = coingeckoRitmo;
  // Más de 365 días → CoinGecko respondería 10012; no se llama.
  if (diasDesdeFechaRnt(fecha, R.ahora()) > CG_DIAS_MAX_PLAN_GRATUITO) {
    if (m.marcarFuera) m.marcarFuera(cache, fecha, MOTIVO_RNT_FUERA_365);
    return null;
  }
  // Primero la serie diaria (una llamada para todas las fechas).
  const serie = await serieDiaria(m);
  // Si mientras se esperaba a CoinGecko pusiste el precio a mano, manda el tuyo.
  if (precioValido(precios[fecha])) return precios[fecha];
  if (fecha in serie) { precios[fecha] = serie[fecha]; return serie[fecha]; }
  // CoinGecko acaba de fallar del todo → no se insiste por ahora.
  if (R.ahora() < R.circuitoHasta) {
    log("CoinGecko sigue limitando: " + fechaEs(fecha) + " se pedirá en la próxima sincronización.", "warn");
    return null;
  }
  const partes = fecha.split("-");
  const fechaCg = partes[2] + "-" + partes[1] + "-" + partes[0];
  for (let intento = 1; intento <= reintentos; intento++) {
    let r;
    try {
      r = await fetch(m.url + "?" + new URLSearchParams({ date: fechaCg, localization: "false" }));
    } catch (e) {
      // Sin conexión real no tiene sentido esperar ni reintentar.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        log("Sin conexión a internet: " + fechaEs(fecha) + " se pedirá en la próxima sincronización.", "warn");
        return null;
      }
      // Error de red con conexión = casi siempre el 429 sin cabecera CORS.
      R.pausaMs = Math.max(R.pausaMs, R.pausaLentaMs);
      if (intento < reintentos) {
        log("CoinGecko no responde para " + fechaEs(fecha) + " (probable límite de llamadas), esperando " + (espera429 / 1000) + "s (intento " + intento + "/" + reintentos + ")...", "warn");
        await R.dormir(espera429);
      }
      continue;
    }
    if (r.status === 429) {
      R.pausaMs = Math.max(R.pausaMs, R.pausaLentaMs);
      if (intento < reintentos) {
        log("Rate limit de CoinGecko, esperando " + (espera429 / 1000) + "s (intento " + intento + "/" + reintentos + ")...", "warn");
        await R.dormir(espera429);
      }
      continue;
    }
    let data;
    try { data = await r.json(); }
    catch (e) {
      log("Respuesta no válida de CoinGecko para " + fechaEs(fecha) + " (intento " + intento + "/" + reintentos + "): " + e.message, "warn");
      if (intento < reintentos) await R.dormir(5000);
      continue;
    }
    if (!data || typeof data !== "object") data = {}; // un cuerpo null es «sin dato»
    const codigoError = (((data.error || {}).status) || {}).error_code;
    if (codigoError === 10012) {
      if (m.marcarFuera) m.marcarFuera(cache, fecha, MOTIVO_RNT_FUERA_365);
      await R.dormir(R.pausaMs);
      return null;
    }
    const precio = (((data.market_data || {}).current_price) || {}).usd;
    if (!precioValido(precio)) {
      log("Sin precio histórico de " + m.nombre + " para " + fechaEs(fecha) + ": quedará a revisar.", "warn");
      return null;
    }
    if (precioValido(precios[fecha])) return precios[fecha]; // el puesto a mano manda
    precios[fecha] = precio;
    await R.dormir(R.pausaMs); // plan gratuito: ~10 llamadas/minuto (más lento si ya limitó)
    return precio;
  }
  R.circuitoHasta = R.ahora() + R.circuitoMs;
  log("CoinGecko no respondió para " + fechaEs(fecha) + " tras " + reintentos + " intentos: se reintentará en la próxima sincronización (las fechas restantes se saltan unos minutos).", "warn");
  return null;
}
