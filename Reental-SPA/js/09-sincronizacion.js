/* =====================================================================
   REENTAL SPA · js/09-sincronizacion.js
   Orquestador de sincronización: pasos Etherscan / BCE / RNT / vault,
   serie de saldo del vault y verificación on-chain.
   `sincronizar(modo, { silencioso })` para el arranque automático de js/19:
   sin avisos flotantes que no sean errores (el resumen único los recoge) y
   devolviendo qué pasó. La verificación del vault no sale en verde cuando
   el saldo NO cuadra o no se pudo leer (indicador en ámbar) y su resultado
   queda en state.sync.vault; las fechas sin precio de RNT, en
   state.sync.fechasSinPrecio.
   El paso de precios trae también los de POL de los últimos
   365 días (las fechas que faltan y el motor necesita se ven en 🔍 Revisión).
   ===================================================================== */

/* ----------------------------- Verificación vault ----------------------------- */
function transfersUnificados(cache) {
  const vistos = new Set(), out = [];
  for (const serie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of (cache.transacciones[serie] || [])) {
      const clave = [normalizarDireccion(tx.hash), normalizarDireccion(tx.contractAddress),
        normalizarDireccion(tx.from), normalizarDireccion(tx.to), String(tx.value)].join("::");
      if (vistos.has(clave)) continue;
      vistos.add(clave); out.push(tx);
    }
  }
  out.sort((a, b) => (parseInt(a.timeStamp, 10) || 0) - (parseInt(b.timeStamp, 10) || 0));
  return out;
}
function serieSaldoVault(cache, vault) {
  const movimientos = [];
  let ignorados = 0;
  for (const tx of transfersUnificados(cache)) {
    if (normalizarDireccion(tx.contractAddress) !== USDT) continue;
    const origen = normalizarDireccion(tx.from), destino = normalizarDireccion(tx.to);
    if (origen !== vault && destino !== vault) continue;
    const cantidad = cantidadTx(tx);
    if (cantidad === null) { ignorados++; continue; }
    let delta = 0;
    if (destino === vault) delta += cantidad;
    if (origen === vault) delta -= cantidad;
    // La fecha, en hora de España.
    movimientos.push({ fecha: fmtFechaHora(enHoraEspanola(aUtcNaive(tx.timeStamp))), hash: normalizarDireccion(tx.hash), entrada_usdt: red6(delta) });
  }
  let saldo = 0;
  for (const m of movimientos) { saldo += m.entrada_usdt; m.saldo_usdt = red6(saldo); }
  return { movimientos, ignorados };
}
async function verificarSaldoVaultOnchain(cache, apiKey, vault) {
  const { movimientos } = serieSaldoVault(cache, vault);
  const calculado = movimientos.length ? movimientos[movimientos.length - 1].saldo_usdt : 0;
  const onchain = await saldoTokenOnchain(vault, USDT, apiKey, DECIMALES[USDT]);
  if (onchain === null) return { saldo_calculado_usdt: red6(calculado), saldo_onchain_usdt: null, diferencia_usdt: null, coincide: null };
  const dif = calculado - onchain;
  return { saldo_calculado_usdt: red6(calculado), saldo_onchain_usdt: red6(onchain), diferencia_usdt: red6(dif), coincide: Math.abs(dif) <= 0.01 };
}

/* ----------------------------- Pasos de sincronización ----------------------------- */
async function pasoEtherscan() {
  const wallet = normalizarDireccion(state.config.wallet);
  const vault = normalizarDireccion(state.config.vault);
  try { await actualizarTransacciones(state.cache, state.config.etherscan_api_key.trim(), wallet, vault); }
  catch (e) { apuntarSincronizacion(state.cache, false); throw e; }
  apuntarSincronizacion(state.cache, true);
}
/* Apunta en la cache el día (en España) de la última descarga de
   Etherscan que llegó entera y si la última falló, para que 🧾 Fiscal sepa
   hasta qué día llegan los datos aunque se abra la cache sin sincronizar. */
function apuntarSincronizacion(cache, etherscanOk, ahora = new Date()) {
  const previa = esObjetoCache(cache.ultima_sincronizacion) ? cache.ultima_sincronizacion : {};
  cache.ultima_sincronizacion = {
    fecha: etherscanOk ? hoyEspana(ahora)
      : (typeof previa.fecha === "string" ? previa.fecha : null),
    etherscan_fallo: !etherscanOk,
  };
}
async function pasoBce() {
  // Tambien el 31/12 de cada ano y ayer, para el informe (js/22).
  const fechas = fechasBceNecesarias(state.cache, state.filasCsv);
  const nuevos = await actualizarTiposBce(state.cache, fechas);
  log("Tipos BCE: " + nuevos + " nuevos (" + Object.keys(state.cache.tipos_bce).length + " en cache) para " + fechas.length + " fechas.");
}
async function pasoRnt() {
  const hoy = hoyEspana(new Date(coingeckoRitmo.ahora()));
  podarPrecioCorteRnt(state.cache, hoy);
  const fechasRnt = fechasConMovimientoRnt(state.cache);
  const noDisp = state.cache.precios_rnt_no_disponibles || {};
  const sinPedir = f => !precioValido(state.cache.precios_rnt[f]) && !(f in noDisp);
  const hoyUtc = fechasRnt.filter(f => sinPedir(f) && diaUtcSinEmpezar(f, coingeckoRitmo.ahora()));
  if (hoyUtc.length) log("Precio RNT de " + hoyUtc.map(f => fechaEs(f)).join(", ") + ": CoinGecko aún no lo tiene; se pedirá en la próxima sincronización.");
  const pendientes = fechasRnt.filter(f => sinPedir(f) && !hoyUtc.includes(f)).sort();
  if (pendientes.length) log("Descargando " + pendientes.length + " precios históricos de RNT (CoinGecko)...");
  const sinPrecio = [];
  for (const fecha of pendientes) {
    const p = await precioRntHistorico(fecha, state.cache);
    if (p === null) sinPrecio.push(fecha);
    marcarCacheDirty();
    await autoGuardarCache();
  }
  // El de cada fecha de corte del CSV de totales (js/30). Sin marcarla
  // para 🔍: si no hay precio, esa fila sale vacía y con «no».
  const dias = diasConMovimientoRnt(state.cache);
  const cortes = fechasCortePrecioRnt([...dias.keys()], coingeckoRitmo.ahora());
  for (const fecha of cortes.filter(sinPedir)) {
    await precioRntHistorico(fecha, state.cache, 4, 30000, false);
    marcarCacheDirty();
  }
  if (cortes.includes(hoy) && !dias.has(hoy) && !hoy.endsWith("-12-31")) state.cache.precio_rnt_dia_corte = hoy;
  log("Precios RNT: " + Object.keys(state.cache.precios_rnt).length + " en cache para " + fechasRnt.length + " fechas con movimiento de RNT.");
  const faltan = [...new Set([...sinPrecio, ...Object.keys(noDisp)])].filter(f => fechasRnt.includes(f)).sort();
  state.sync.fechasSinPrecio = faltan.length;
  if (faltan.length) {
    // Un solo aviso. Esas fechas no acaban marcadas para revisar (el
    // clasificador no usa precios: los necesita el motor fiscal para valorar
    // en euros).
    log("ATENCIÓN: " + faltan.length + " fechas sin precio histórico de RNT (el plan gratuito de CoinGecko solo " +
        "cubre los últimos 365 días). No afectan a la clasificación; las necesitará el motor fiscal para valorar " +
        "en euros. Puedes ponerlas a mano en 🔍 Revisión → «Precios de RNT (USD)» → «Fechas sin precio»: " + faltan.map(f => fechaEs(f)).join(", "), "warn");
    // El botón lleva DIRECTO a esa tabla, no solo a la pestaña.
    // En modo silencioso lo cuenta el resumen único de js/19.
    if (!state.sync.silencioso) toast("Hay " + faltan.length + " fechas sin precio de RNT: ponlas a mano en 🔍 Revisión.", "warn",
      { texto: "Ir a las fechas sin precio", fn: irAFechasSinPrecio }, 9000);
  }
  await pasoPol();
  renderPanel();
}
/* Precios de POL de las fechas con movimiento de POL. Sin aviso: casi nunca hacen falta (el gas sale de lo que
   costó el POL y los swaps se valoran por la stablecoin); las que el motor
   necesita y faltan se ven en 🔍 Revisión. Casi todo sale de una sola
   llamada: se guarda al terminar el paso (sincronizar), no fecha a fecha. */
async function pasoPol() {
  // También las que el motor necesita y no salen de un movimiento (la
  // de un depósito cuya fecha cambió un ajuste).
  const necesita = typeof pnFechasSinPrecioPol === "function"
    ? pnFechasSinPrecioPol(state.cache, state.registros, Date.now()).map(x => x[0]) : [];
  const fechasPol = [...new Set([...fechasConMovimientoPol(state.cache), ...necesita])];
  const precios = bloquePrecios(state.cache, "precios_pol");
  for (const fecha of fechasPol.filter(f => !precioValido(precios[f]) && !diaUtcSinEmpezar(f, coingeckoRitmo.ahora())).sort()) {
    await precioPolHistorico(fecha, state.cache);
  }
  if (fechasPol.length) log("Precios POL: " + Object.keys(precios).length + " en cache para " + fechasPol.length + " fechas con movimiento de POL.");
}
async function pasoVault() {
  const vault = normalizarDireccion(state.config.vault);
  if (!vault) {
    // Sin dirección del vault no hay saldo que comprobar.
    log("Sin dirección del vault: se omite su verificación de saldo (es opcional).");
    return null;
  }
  const v = await verificarSaldoVaultOnchain(state.cache, state.config.etherscan_api_key.trim(), vault);
  state.sync.vault = v;
  if (v.coincide === null) log("No se pudo leer el saldo on-chain (API sin respuesta); se omite la verificación.", "warn");
  else if (v.coincide) log("OK: saldo calculado " + cantidadEs(v.saldo_calculado_usdt) + " USDT = on-chain " + cantidadEs(v.saldo_onchain_usdt) + " USDT.", "ok");
  else log("DIFERENCIA: calculado " + cantidadEs(v.saldo_calculado_usdt) + " vs on-chain " + cantidadEs(v.saldo_onchain_usdt) + " USDT (dif " + numEs(v.diferencia_usdt, 6, true, true) + "). Puede haber movimientos posteriores a la última descarga.", "warn");
  return v;
}

/* Lleva a 🔍 Revisión y baja hasta la tabla de fechas sin precio de RNT. */
function irAFechasSinPrecio() {
  location.hash = "#revision";
  setTimeout(() => {
    const det = $("rvPreciosRnt"); // el bloque es plegable
    if (det) det.open = true;
    const el = $("tablaPreciosRntFaltantes");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 150);
}

/* ----------------------------- Orquestador ----------------------------- */
/* Devuelve { errores: [pasos que fallaron], vault } o null si no arrancó.
   `opciones.silencioso` quita los avisos que no son errores. */
async function sincronizar(modo, opciones) {
  if (state.sync.running) return null;
  leerConfigDesdeFormulario();
  guardarConfigLocalSilencioso();
  const problemas = configValidaParaSincronizar();
  if (problemas.length) { toast("Falta en la configuración: " + problemas.join(", "), "error"); return null; }
  if (!state.cache) return null;   // solo un instante al abrir la página (js/19)

  state.sync.running = true;
  state.sync.silencioso = !!(opciones && opciones.silencioso);
  state.sync.vault = null;
  state.sync.fechasSinPrecio = null;
  setBotonesSync(false);
  const pasos = { todo: ["etherscan", "bce", "rnt", "vault"], etherscan: ["etherscan"], bce: ["bce"], rnt: ["rnt"] }[modo]
    // Sin vault, su verificación no se ejecuta ni se pinta en curso.
    .filter(p => p !== "vault" || normalizarDireccion(state.config.vault));
  const fns = { etherscan: pasoEtherscan, bce: pasoBce, rnt: pasoRnt, vault: pasoVault };
  ["etherscan", "bce", "rnt", "vault"].forEach(p => setDot(p, ""));
  setProgreso(0, "Preparando");
  let hechos = 0, errores = 0;
  const conError = [];
  for (const paso of pasos) {
    setDot(paso, "run");
    setProgreso(Math.round(hechos / pasos.length * 100), "Paso: " + paso);
    try {
      const r = await fns[paso]();
      // El vault solo sale en verde si su saldo CUADRA; si no cuadra o
      // no se pudo leer, en ámbar (no es un fallo de la descarga).
      setDot(paso, paso === "vault" && r && r.coincide !== true ? "warn" : "ok");
    }
    catch (e) { setDot(paso, "err"); errores++; conError.push(paso); log("ERROR en el paso " + paso + ": " + e.message, "error"); }
    hechos++;
    marcarCacheDirty();
    await autoGuardarCache();
    setProgreso(Math.round(hechos / pasos.length * 100));
  }
  // Con algún paso fallido, la barra no dice «Sincronización completa».
  if (conError.length) setProgreso(100, "Terminada con errores en: " + conError.join(", "));
  state.sync.running = false;
  setBotonesSync(true);
  renderPanel();
  actualizarChipEstado();
  // Se guarda solo en cada paso (js/05); no se pide guardar.
  state.sync.silencioso = false;
  return { errores: conError, vault: state.sync.vault };
}