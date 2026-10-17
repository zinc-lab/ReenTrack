/* =====================================================================
   js/19-arranque.js — 🚀 Puesta en marcha: el arranque en una sola pestaña.

   - Tu archivo (transacciones descargadas, tus decisiones, tus datos y el
     archivo de Reental) vive en este navegador (IndexedDB, js/03) y se
     guarda solo (js/05), sin permisos ni «💾 Guardar». Sale al abrir la
     página, sin descargar hasta «🔄 Actualizar». Solo una pestaña de la app
     a la vez: la segunda no lee ni guarda.
   - En la pestaña: tu archivo (cuántas transacciones), «🗂️ Guardar copia»
     (js/24) con su «Última copia», «📂 Abrir copia» (una copia, un
     reental_cache.json, una copia vieja o un config.json), tus datos
     (wallet, vault opcional, API key de Etherscan y, plegados, nombre y
     NIF), el archivo de rendimientos de Reental, lo que falta y
     «🔄 Actualizar».
   - «🔄 Actualizar» sincroniza (Etherscan, BCE, CoinGecko y verificación
     del vault, con `sincronizar("todo")` de js/09) y clasifica
     (`ejecutarClasificacion` de js/14, que ya lanza el Descubrimiento
     antes). Si algún paso de la sincronización falla se clasifica
     igualmente con lo que ya hay en la cache y se avisa: nunca se inventa
     un dato. Sin CSV se sincroniza y se espera a que lo cargues.
   - Clasificación automática y silenciosa (modo silencioso de js/14) al
     abrir tu archivo o una copia, al cargar el CSV, al sincronizar y al
     cambiar la config, esto último SOLO si la wallet (y el vault, si se
     pone) tienen formato 0x + 40. Abrir otra cache o cargar otro CSV borra
     la clasificación anterior de Transacciones, Revisión y Panel.
   - Resumen único (#arrFin): clasificación, transacciones nuevas, vault
     ✓/⚠, descuadres entre el archivo de Reental y la blockchain con su
     remedio («🔄 Actualizar» o cargar un archivo más nuevo), el cuadre de
     la cartera (js/28), fechas sin precio, tokens con dudas, guardado y
     copia. Los avisos flotantes de esos pasos se callan: todo se lee aquí.
   - Registro técnico plegado (log() de js/02 lo abre si hay error).
   - Protecciones: almacenamiento persistente, «Última copia: hace N días»
     y su aviso en el resumen; «🧹 Olvidar todo» ofrece una copia antes.
   - Las direcciones antiguas (#sync, #clasificacion, #config, #panel,
     #defi, #vault) llevan a su vista actual.

   Reglas de construcción:
   - Se REUTILIZAN leer/volcar config (js/04), sincronizar (js/09), cargar
     cache/CSV (js/12, js/13), requisitosClasificacionOk y
     ejecutarClasificacion (js/14). Carga después de js/18 y antes de js/13
     (que sigue siendo el último).
   - Repintado no invasivo (patrón js/15/16/18): envoltorios que AÑADEN el
     repintado del asistente detrás de las funciones globales que avisan de
     cambios. Si la función original lanza, el error se propaga igual.
   - El único botón del arranque es «🔄 Actualizar». Para clasificar sin
     interfaz (tests y arneses) se llama a `ejecutarClasificacion()`, el
     mismo camino de js/14.
   - La config se guarda con el mecanismo de js/13 (evento change de los
     campos `cfg*` → localStorage). CSS solo con tokens del design system.
   ===================================================================== */

/* ----------------------------- Sección pura ----------------------------- */
const ARR_PASOS = ["config", "cache", "sync", "csv", "clasificar"];
// Lo que el usuario PREPARA son tres cosas; sincronizar y clasificar los
// hace «🔄 Actualizar» (la evaluación de sus estados se conserva para la
// tarjeta de sincronización y el cuadro de resultado).
const ARR_TITULOS = {
  config: "Configuración", cache: "Cache de trabajo", sync: "Sincronizar",
  csv: "Archivo de rendimientos", clasificar: "Clasificar",
};
// Direcciones antiguas → vista actual (+ tarjeta a la que bajar). #config:
// la pestaña ⚙️ Config ya no existe, su sitio es «Tus datos».
const ARR_ALIAS = {
  sync: { vista: "inicio", ancla: "arrPasoSync" },
  // No hay tarjeta de clasificación: su resultado vive en la de
  // sincronización, así que las direcciones antiguas llevan allí.
  clasificacion: { vista: "inicio", ancla: "arrPasoSync" },
  config: { vista: "inicio", ancla: "arrDatos" },
  panel: { vista: "revision", ancla: null },
  // Lo DeFi va en un filtro de 📒 y el saldo del vault, en 📊.
  defi: { vista: "transacciones", ancla: null },
  vault: { vista: "dashboard", ancla: null },
};

function arrAlias(hash) {
  const h = String(hash || "").replace(/^#/, "");
  return Object.prototype.hasOwnProperty.call(ARR_ALIAS, h) ? ARR_ALIAS[h] : null;
}

function arrNumTx(cache) {
  if (!cache || !cache.transacciones) return 0;
  return Object.values(cache.transacciones).reduce((a, s) => a + (Array.isArray(s) ? s.length : 0), 0);
}

/* Evalúa el estado del asistente a partir de una foto del estado de la app.
   Entrada: { config, cache, csvCargado, nCsv, registros, syncCorriendo,
   syncErrores: [paso…], preparando }. Salida: estado de cada paso
   ("ok" | "warn" | "run" | "pendiente"), lista de lo que falta para
   «Iniciar», paso activo y qué botones se pueden usar.
   Los requisitos de clasificar son EXACTAMENTE los de js/14 (wallet, vault
   y coste > 0); sincronizar pide además la API key de Etherscan (js/04). */
function arrEvaluar(e) {
  const cfg = e.config || {};
  const dir = x => (typeof x === "string" ? x.trim() : "");
  const tiene = {
    // Con formato válido, como pide la clasificación automática
    // (direccionesConfigOk).
    wallet: direccionValida(cfg.wallet),
    // La dirección del vault es OPCIONAL. Sin ella se
    // clasifica igual; lo que se pierde (los movimientos del vault sin
    // explicar) se cuenta en la burbuja ⓘ de su campo.
    vault: !!dir(cfg.vault),
    key: !!dir(cfg.etherscan_api_key),
    coste: Number(cfg.compra_bancaria_coste_eur_por_token) > 0,
  };
  const vaultMal = vaultMalEscrito(cfg);
  const configClasificar = direccionesConfigOk(cfg) && tiene.coste;
  const configSync = configClasificar && tiene.key;
  const nTx = arrNumTx(e.cache);
  const cacheOk = !!e.cache;
  const csvOk = !!e.csvCargado && (e.nCsv || 0) > 0;
  const registros = Array.isArray(e.registros) ? e.registros : null;
  const nRevisar = registros ? registros.filter(r => r && r.revisar).length : 0;
  const errores = Array.isArray(e.syncErrores) ? e.syncErrores : [];

  const pasos = {};
  const faltanConfig = [];
  if (!tiene.wallet) faltanConfig.push(dir(cfg.wallet) ? "wallet bien escrita (0x y 40 caracteres)" : "dirección de wallet");
  if (vaultMal) faltanConfig.push(vaultIgualWallet(cfg) ? "vault distinto de tu wallet, o vacío" : "vault bien escrito (0x y 40 caracteres) o vacío");
  if (!tiene.key) faltanConfig.push("API key de Etherscan");
  // El coste de compra externa no es un campo: js/04 lo fija en 100 € por
  // token. Se conserva la comprobación para no divergir de
  // requisitosClasificacionOk (js/14); en la práctica nunca falta.
  if (!tiene.coste) faltanConfig.push("el precio fijo de 100 € por token de las compras externas de inmuebles");
  pasos.config = {
    estado: configSync ? "ok" : (configClasificar ? "warn" : "pendiente"),
    texto: configSync ? "Completa" : (configClasificar ? "Falta la API key (solo para sincronizar)" : "Falta: " + faltanConfig.join(", ")),
  };
  pasos.cache = {
    estado: cacheOk ? "ok" : "pendiente",
    texto: cacheOk ? nTx + " transacciones" : "Sin cargar",
  };
  if (e.syncCorriendo) pasos.sync = { estado: "run", texto: "Sincronizando…" };
  else if (errores.length) pasos.sync = { estado: "warn", texto: "Con errores en: " + errores.join(", ") };
  else if (nTx > 0) pasos.sync = { estado: "ok", texto: nTx + " transacciones en tu archivo" };
  else pasos.sync = { estado: "pendiente", texto: "Sin transacciones" };
  pasos.csv = {
    estado: csvOk ? "ok" : "pendiente",
    texto: csvOk ? e.nCsv + " repartos" : "Sin cargar",
  };
  pasos.clasificar = registros
    ? { estado: nRevisar ? "warn" : "ok", texto: registros.length + " registros · " + nRevisar + " a revisar" }
    : { estado: "pendiente", texto: "Sin clasificar en esta sesión" };

  // Lo que falta, sin «paso 1, 2, 3». Tu archivo siempre está (en este
  // navegador), así que no falta.
  const faltan = [];
  if (faltanConfig.length) faltan.push({ paso: "config", texto: "Tus datos: " + faltanConfig.join(", ") });
  if (!csvOk) faltan.push({ paso: "csv", texto: "Carga el archivo de rendimientos de Reental" });

  const activo = ARR_PASOS.find(p => pasos[p].estado !== "ok") || null;
  const ocupado = !!e.syncCorriendo || !!e.preparando;
  return {
    pasos, faltan, activo, nTx, nRevisar, conArchivo: cacheOk, faltaConfig: faltanConfig.length > 0,
    nRegistros: registros ? registros.length : 0,
    // «🔄 Actualizar» no necesita el CSV (sin él se sincroniza y se
    // espera a que lo cargues para clasificar).
    puedeActualizar: configSync && cacheOk && !ocupado,
    puedeSincronizar: configSync && cacheOk && !ocupado,
    puedeClasificar: configClasificar && cacheOk && csvOk,
  };
}

// Lo que de la config cambia el resultado de clasificar (el NIF o la key, no).
function arrHuellaConfig(cfg) {
  const c = cfg || {};
  return normalizarDireccion(c.wallet || "") + "|" + normalizarDireccion(c.vault || "");
}

/* Descuadres entre el archivo de Reental y la blockchain. Función pura:
   cuenta los registros a revisar que el motor marca así:
   - csvMasNuevo: un reparto del archivo cuya transferencia no está
     descargada (solo con vault; sin vault no hay con qué contrastarlo).
     Remedio: «🔄 Actualizar».
   - sinArchivo: un rendimiento que llegó a la wallet o al vault y el
     archivo no trae, o trae aún como pendiente. Remedio:
     cargar un archivo de Reental más nuevo.
   Los trozos de nota que busca son los que escribe js/14. */
const ARR_NOTA_CSV_MAS_NUEVO = NOTA_CSV_MAS_NUEVO;
const ARR_NOTA_SIN_ARCHIVO = NOTA_RENDIMIENTO_HUERFANO;
function arrDescuadres(registros) {
  const res = { csvMasNuevo: 0, sinArchivo: 0 };
  for (const r of registros || []) {
    if (!r || !r.revisar || typeof r.nota !== "string") continue;
    if (r.nota.includes(ARR_NOTA_CSV_MAS_NUEVO)) res.csvMasNuevo++;
    else if (r.categoria === "RENDIMIENTO" && r.nota.includes(ARR_NOTA_SIN_ARCHIVO)) res.sinArchivo++;
    else if (r.categoria === "REVISAR" && r.nota.includes(NOTA_PENDIENTE_COBRADO)) res.sinArchivo++;
  }
  return res;
}

/* Resumen único de la Puesta en marcha. Función pura: de
   una foto de lo ocurrido saca las líneas del cuadro final. Entrada:
   { clasificacion: {inmuebles} | null, csvOk, configOk,
     walletMal, vaultMal,
     prep: {sincronizado, erroresSync, nuevas, total} | null, keyOk,
     vaultConfigurado, vaultEnCache, vault: {coincide, saldo_calculado_usdt,
     saldo_onchain_usdt, diferencia_usdt} | null, fechasSinPrecio,
     candidatas, cacheOk, errorGuardar, hayDatos, copiaDias (null: ninguna),
     descuadres: {csvMasNuevo, sinArchivo} | null, csvFueraMasNuevo,
     cuadre: {filas, diferencias, sin_leer} | null (js/28) }.
   Salida: { titulo, lineas: [{ tipo: "ok"|"warn"|"info", texto, accion? }] }
   con `accion` = { texto, ir } (ancla de esta pestaña) o { texto, fn,
   href? } (href: adónde lleva abierto aparte; si no, #revision). */
const ARR_DIAS_COPIA = 30;   // a partir de aquí, el aviso de la copia
function arrResumen(d) {
  const lineas = [];
  const usdt = (x, signo) => numEs(x, 2, signo) + " USDT";
  let titulo = null;
  if (d.clasificacion) {
    // Lo que hay por revisar ya sale en «🔍 Ir a Revisión (N)»; con
    // avisos debajo, no «Todo listo».
    titulo = "✅ Todo listo.";
  } else if (d.cacheOk && !d.configOk) {
    // Si la que está mal es el vault, se dice; y si lo están las dos, las
    // dos.
    titulo = d.vaultMal && d.walletMal ? "⏳ Revisa tus direcciones de wallet y vault (tus datos)."
      : d.vaultMal ? "⏳ Revisa la dirección del vault (tus datos)."
      : "⏳ Completa tu dirección de wallet (tus datos).";
  } else if (d.cacheOk && !d.csvOk) {
    titulo = "⏳ Carga el archivo de rendimientos de Reental.";
  }

  const p = d.prep;
  if (p && p.sincronizado) {
    if (p.erroresSync && p.erroresSync.length) {
      lineas.push({ tipo: "warn", texto: "La descarga falló en: " + p.erroresSync.join(", ") +
        ". Se usó lo que ya había; mira el registro técnico y vuelve a pulsar «🔄 Actualizar»." });
    } else {
      lineas.push({ tipo: "ok", texto: p.nuevas > 0
        ? "Transacciones: <b>" + p.nuevas + "</b> " + (p.nuevas === 1 ? "nueva" : "nuevas") + " (" + p.total + " en total)."
        : "Transacciones: nada nuevo (" + p.total + " en total)." });
    }
  } else if (d.cacheOk && !d.keyOk) {
    lineas.push({ tipo: "info", texto: "Sin descargar: falta la API key de Etherscan (tus datos).",
      accion: { texto: "ir a tus datos", ir: "arrDatos" } });
  }

  // Al abrir tu archivo, el archivo de Reental que tenías cargado era más nuevo.
  if (d.csvFueraMasNuevo) lineas.push({ tipo: "info", texto: "Archivo de Reental: se usa el que cargaste, más nuevo que el de la copia." });

  /* El archivo de Reental y la blockchain no cuadran. Textos
     cortos, con el dato y el remedio. */
  const dc = d.descuadres;
  if (dc && dc.csvMasNuevo > 0) {
    lineas.push({ tipo: "warn", texto: "<b>" + numEs(dc.csvMasNuevo, 0) + "</b> " + (dc.csvMasNuevo === 1
      ? "rendimiento del archivo de Reental aún no está descargado" : "rendimientos del archivo de Reental aún no están descargados") +
      ". Pulsa «🔄 Actualizar».", accion: { texto: "ver en Revisión", fn: "revision" } });
  }
  if (dc && dc.sinArchivo > 0) {
    lineas.push({ tipo: "warn", texto: "<b>" + numEs(dc.sinArchivo, 0) + "</b> " + (dc.sinArchivo === 1
      ? "rendimiento recibido no está" : "rendimientos recibidos no están") +
      " en el archivo de Reental. Carga uno más nuevo.", accion: { texto: "cambiar el archivo", ir: "dzCsv" } });
  }

  if (d.direccionesCambiadas && d.direccionesCambiadas.length) {
    lineas.push({ tipo: "warn", texto: "Las transacciones guardadas son de otra " +
      d.direccionesCambiadas.join(" y otro ") + ": pulsa «🔄 Actualizar» para descargarlas otra vez." });
  }
  if (!d.vaultConfigurado) {
    // Los rendimientos salen del archivo de Reental con o sin vault; sin
    // vault solo falta el contraste y el saldo.
    // Si la cache trae movimientos de un vault que se quitó de
    // la configuración: sus reinversiones salen a revisar sin explicarlo.
    if (d.cacheOk && d.vaultEnCache) lineas.push({ tipo: "warn", texto: "Hay movimientos de un vault que ya no está en tus datos: salen a revisar. Vuelve a ponerlo.",
      accion: { texto: "ir a tus datos", ir: "arrDatos" } });
    else if (d.cacheOk) lineas.push({ tipo: "info", texto: "Sin vault (es opcional): no se contrastan los rendimientos ni su saldo." });
  } else if (p && p.sincronizado && d.vault) {
    if (d.vault.coincide === true) {
      lineas.push({ tipo: "ok", texto: "Vault: el saldo cuadra (" + usdt(d.vault.saldo_onchain_usdt) + ")." });
    } else if (d.vault.coincide === false) {
      const dif = d.vault.diferencia_usdt;
      lineas.push({ tipo: "warn", texto: "Vault: el saldo NO cuadra. Calculado " + usdt(d.vault.saldo_calculado_usdt) +
        ", en la red " + usdt(d.vault.saldo_onchain_usdt) + " (diferencia " + usdt(dif, true) +
        "). Puede haber movimientos posteriores a la última descarga." });
    } else {
      lineas.push({ tipo: "warn", texto: "Vault: no se pudo leer su saldo en la red; se comprobará en la próxima actualización." });
    }
  }

  /* La cartera de la app contra la blockchain (js/28). */
  const cu = d.cuadre;
  if (cu) {
    const n = cu.diferencias.length;
    if (n) {
      lineas.push({ tipo: "warn", texto: "<b>" + n + "</b> " + (n === 1 ? "token no cuadra" : "tokens no cuadran") +
        " con la blockchain: " + arrEsc(cu.diferencias.map(f => f.nombre).join(", ")) + ".",
        accion: { texto: "ver los avisos", fn: "cuadre", href: "#fiscal" } });
    }
    if (cu.sin_leer.length) {
      lineas.push({ tipo: "warn", texto: "No se pudo leer en la blockchain el saldo de " + arrEsc(cu.sin_leer.map(f => f.nombre).join(", ")) +
        ". Pulsa «🔄 Actualizar»." });
    }
    // No si falta algo por leer.
    if (!n && !cu.sin_leer.length && cu.filas.length) lineas.push({ tipo: "ok", texto: "Tu cartera cuadra con la blockchain." });
  }

  if (d.fechasSinPrecio > 0) {
    lineas.push({ tipo: "warn", texto: d.fechasSinPrecio + (d.fechasSinPrecio === 1 ? " fecha" : " fechas") +
      " sin precio de RNT: ponlas a mano en 🔍 Revisión.",
      accion: { texto: "ir a las fechas", fn: "fechas" } });
  }
  if (d.clasificacion && d.clasificacion.inmuebles === 0) {
    lineas.push({ tipo: "warn", texto: "Ningún inmueble reconocido: casi todo queda a revisar. ¿Se descargaron tus transacciones?" });
  }
  if (d.candidatas > 0) {
    lineas.push({ tipo: "warn", texto: d.candidatas + (d.candidatas === 1 ? " token con dudas: no cuenta" : " tokens con dudas: no cuentan") +
      " como inmueble hasta que lo confirmes o descartes.", accion: { texto: "ir al catálogo", fn: "catalogo" } });
  }
  // El navegador no dejó guardar (lleno o bloqueado): una copia lo salva.
  if (d.cacheOk && d.errorGuardar) {
    lineas.push({ tipo: "warn", texto: "No se pudo guardar en este navegador.", accion: { texto: "guardar una copia", ir: "arrTarjeta" } });
  }
  // El aviso suave de la copia, tras descargar, si hace tiempo.
  if (p && p.sincronizado && d.hayDatos && (d.copiaDias === null || d.copiaDias >= ARR_DIAS_COPIA)) {
    lineas.push({ tipo: "info", texto: d.copiaDias === null ? "Aún no tienes ninguna copia." : "Tu última copia es de hace " + d.copiaDias + " días.",
      accion: { texto: "guardar una copia", ir: "arrTarjeta" } });
  }
  if (d.clasificacion && lineas.some(l => l.tipo === "warn")) titulo = "⚠ Listo, con avisos.";
  return { titulo, lineas };
}

/* ----------------------------- Estado del asistente ----------------------------- */
// ultimaPreparacion: lo que hizo el último flujo automático (sincronizado,
// erroresSync, nuevas, total, cuadrePendiente); se reinicia al abrir otra cache.
// descargaSola: la huella de la última descarga que empezó sola (P6).
// vaultsHallados: { wallet, lista } de la última búsqueda del vault en Etherscan.
// csvFueraMasNuevo: para el resumen. olvidando: «🧹 Olvidar todo» en marcha.
// soloLectura: la app ya está abierta en otra pestaña; esta no lee ni guarda.
// sinLeer: no se pudo leer lo guardado; no se guarda encima hasta recargar o abrir una copia.
const arr = { preparando: false, ultimaPreparacion: null, configClasificada: null,
  csvFueraMasNuevo: false, olvidando: false, soloLectura: false, sinLeer: false, descargaSola: null,
  vaultsHallados: null };

function arrEsc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function arrErroresSync() {
  if (typeof document === "undefined") return [];
  return ["etherscan", "bce", "rnt", "vault"].filter(p => {
    const el = $("dot-" + p);
    return el && el.classList.contains("err");
  });
}

function arrFoto() {
  return {
    config: state.config, cache: state.cache, csvCargado: state.csvCargado,
    nCsv: (state.filasCsv || []).length, registros: state.registros,
    syncCorriendo: !!(state.sync && state.sync.running),
    syncErrores: arrErroresSync(), preparando: arr.preparando,
  };
}

// ¿Hay algo guardado que copiar? Transacciones o el archivo de Reental.
function arrHayDatos() {
  return !!state.cache && (arrNumTx(state.cache) > 0 || !!leerArchivoRendimientosCache(state.cache));
}

// Lo que «🗂️ Guardar copia» puede salvar: tus datos o tus datos escritos.
function arrHayAlgoQueCopiar() {
  return arrHayDatos() || (typeof exConfigConDatos === "function" && exConfigConDatos(state.config, true));   // js/24 carga después
}

// Foto para el resumen único: todo en vivo salvo lo que solo sabe el flujo.
function arrDatosResumen() {
  const cache = state.cache;
  const cfg = state.config || {};
  let fechasSinPrecio = 0, candidatas = 0;
  if (cache) {
    try {
      // Las mismas fechas que pide 🔍 Revisión (las que CoinGecko no
      // puede dar), si js/11 está cargado.
      const precios = cache.precios_rnt || {};
      fechasSinPrecio = typeof pnFechasSinPrecioRnt === "function"
        ? pnFechasSinPrecioRnt(cache, Date.now()).length
        : fechasConMovimientoRnt(cache).filter(f => !(f in precios)).length;
    } catch (e) { fechasSinPrecio = 0; }
    candidatas = dudasCatalogoCache(cache).size; // js/14
  }
  const hayRegistros = Array.isArray(state.registros) && state.registros.length > 0;
  const uc = state.ultimaClasificacion;
  return {
    clasificacion: hayRegistros ? { inmuebles: uc ? uc.inmuebles : null } : null,
    cacheOk: !!cache, csvOk: !!(state.csvCargado && (state.filasCsv || []).length),
    configOk: direccionesConfigOk(cfg), keyOk: !!(cfg.etherscan_api_key || "").trim(),
    vaultMal: vaultMalEscrito(cfg), walletMal: !direccionValida(cfg.wallet),
    prep: arr.ultimaPreparacion,
    vaultConfigurado: !!normalizarDireccion(cfg.vault || ""),
    vaultEnCache: !!(cache && cache.transacciones && ((cache.transacciones.vault_tokens || []).length ||
      (cache.transacciones.vault_normales || []).length)),
    // La wallet o el vault cambiaron desde la última descarga.
    direccionesCambiadas: cache ? direccionesCambiadas(cache, cfg.wallet, cfg.vault) : [],
    vault: (state.sync && state.sync.vault) || null,
    fechasSinPrecio, candidatas,
    errorGuardar: !!state.errorGuardar,
    hayDatos: arrHayDatos(),
    copiaDias: typeof exDiasUltimaCopia === "function" ? exDiasUltimaCopia(new Date()) : null,
    descuadres: hayRegistros ? arrDescuadres(state.registros) : null,
    csvFueraMasNuevo: arr.csvFueraMasNuevo,
    cuadre: typeof cuadreParaResumen === "function" ? cuadreParaResumen() : null,
  };
}

/* ----------------------------- Pintado ----------------------------- */
// «✔ N repartos, hasta DD/MM/AAAA · cambiar».
function arrTextoCsv(filas) {
  if (!filas || !filas.length) return "";
  const hasta = typeof csvUltimaFecha === "function" ? csvUltimaFecha(filas) : "";
  return "✔ <b>" + numEs(filas.length, 0) + "</b> " + (filas.length === 1 ? "reparto" : "repartos") +
    (hasta ? ", hasta " + fechaEs(hasta) : "") + ' · <span class="arr-cambiar">cambiar</span>';
}
function arrPintar() {
  if (typeof document === "undefined" || !$("arrTarjeta")) return;
  const ev = arrEvaluar(arrFoto());
  const idDe = { config: "arrDatos", cache: "arrTarjeta", sync: "arrPasoSync", csv: "dzCsv" };

  // Con datos, cuántas transacciones y que se guarda solo aquí;
  // sin ellos, la explicación. «🗂️ Guardar copia» (js/24) y su «Última
  // copia», solo con algo que copiar.
  const hayDatos = arrHayDatos();
  $("arrExplica").hidden = hayDatos;
  $("arrArchivo").hidden = !hayDatos;
  if (hayDatos) {
    $("arrNombreArchivo").innerHTML = "📄 <b>" + numEs(ev.nTx, 0) + "</b> " + (ev.nTx === 1 ? "transacción" : "transacciones") + " · " +
      (state.errorGuardar ? "⚠ no se pudo guardar en este navegador" : "se guarda solo en este navegador");
  }
  // También con solo tus datos escritos (la copia los lleva, según la casilla).
  const copiable = arrHayAlgoQueCopiar();
  if ($("btnCopia")) $("btnCopia").hidden = !copiable;
  if ($("exUltima")) $("exUltima").hidden = !copiable;
  // Ni mientras se descarga (saldría a medias).
  if ($("btnCopia") && typeof exCopiaApagada === "function") $("btnCopia").disabled = exCopiaApagada();
  // Tus datos: abiertos de entrada (no se pliegan solos); si los pliegas y falta algo, se vuelven a abrir.
  const datos = $("arrDatos");
  if (datos && (!hayDatos || ev.faltaConfig)) datos.open = true;
  // El archivo de Reental: cargado, cuántos repartos y hasta cuándo; si no,
  // el texto de la página (que se guarda la primera vez).
  const dz = $("dzCsv"), dzTexto = $("dzTexto");
  if (dz && dzTexto) {
    if (arr.dzTextoInicial === undefined) arr.dzTextoInicial = dzTexto.innerHTML;
    const linea = state.csvCargado ? arrTextoCsv(state.filasCsv) : "";
    dz.classList.toggle("cargado", !!linea);
    dzTexto.innerHTML = linea || arr.dzTextoInicial;
  }

  const abrir = $("btnAbrirArchivo");
  if (abrir) abrir.disabled = arr.preparando;
  const buscar = $("arrBuscarVaultCaja");
  if (buscar) {
    buscar.hidden = !arrPuedeBuscarVault(state.config, ev.nTx, arr.preparando, state.cache);
    $("btnBuscarVault").disabled = !!arr.buscandoVault;
    // La nota, solo para la wallet y la key con que se buscó, y con el botón a la vista.
    const n = arr.notaVault;
    $("arrBuscarVaultNota").textContent = !buscar.hidden && n && n.huella === arrHuellaVault(state.config) ? n.texto : "";
  }

  // Lo que falta + botón «🔄 Actualizar»
  const faltan = $("arrFaltan");
  faltan.innerHTML = ev.faltan.length
    ? ev.faltan.map(f => '<div class="arr-falta"><span aria-hidden="true">✖</span> ' + arrEsc(f.texto) +
        ' <a href="#inicio" data-ir="' + idDe[f.paso] + '">ir</a></div>').join("")
    : '<div class="arr-falta ok"><span aria-hidden="true">✔</span> Todo listo. «🔄 Actualizar» descarga lo nuevo.</div>';
  const btn = $("arrPreparar");
  btn.disabled = !ev.puedeActualizar;
  btn.textContent = arr.preparando ? "⏳ Trabajando…" : "🔄 Actualizar";

  // Tarjeta de sincronización y resumen: aparece con el primer flujo
  // automático (abrir la cache, cargar el CSV o «Actualizar») y se queda.
  const cardSync = $("arrPasoSync");
  if (cardSync) {
    cardSync.setAttribute("data-state", ev.pasos.sync.estado);
    const tag = cardSync.querySelector(".arr-tag");
    if (tag) {
      tag.className = "arr-tag " + ev.pasos.sync.estado;
      tag.textContent = { ok: "✔ Listo", warn: "⚠ Revisa", run: "⏳ En curso", pendiente: "Por hacer" }[ev.pasos.sync.estado] + " · " + ev.pasos.sync.texto;
    }
    cardSync.hidden = !(arr.preparando || (state.sync && state.sync.running) ||
                        arr.ultimaPreparacion || ev.nRegistros > 0);
  }

  const pista = $("arrSyncPista");
  if (pista) {
    pista.textContent = ev.puedeSincronizar || arr.preparando || (state.sync && state.sync.running) ? ""
      : "Completa tus datos (dirección de wallet y API key de Etherscan).";
  }

  // Resumen único
  const fin = $("arrFin");
  if (!arr.preparando && (ev.nRegistros || arr.ultimaPreparacion)) {
    const r = arrResumen(arrDatosResumen());
    let html = r.titulo ? '<div class="arr-fin-t">' + r.titulo + "</div>" : "";
    const icono = { ok: "✔", warn: "⚠", info: "ℹ" };
    html += r.lineas.map(l => {
      let acc = "";
      if (l.accion && l.accion.ir) acc = ' <a href="#inicio" data-ir="' + l.accion.ir + '">' + arrEsc(l.accion.texto) + "</a>";
      else if (l.accion && l.accion.fn) acc = ' <a href="' + (l.accion.href || "#revision") + '" data-accion="' + l.accion.fn + '">' + arrEsc(l.accion.texto) + "</a>";
      return '<div class="arr-linea ' + l.tipo + '"><span aria-hidden="true">' + icono[l.tipo] + "</span> " + l.texto + acc + "</div>";
    }).join("");
    if (ev.nRegistros) {
      // El mismo número que el menú de 🔍 (lo que está por
      // decidir, también las ventas por vincular), no solo lo marcado.
      const nDecidir = typeof ccColaRevision === "function"
        ? ccColaRevision(state.registros, ccContextoSesion(state.registros)).length : ev.nRevisar;
      html += '<div class="row mt"><a class="btn-link" href="#transacciones">📒 Ver transacciones</a>' +
        '<a class="btn-link" href="#revision">🔍 Ir a Revisión' + (nDecidir ? " (" + numEs(nDecidir, 0) + ")" : "") + "</a>" +
        "</div>";
    }
    fin.innerHTML = html;
    fin.hidden = false;
  } else {
    fin.innerHTML = "";
    fin.hidden = true;
  }
}

function arrPintarSeguro() {
  try { arrPintar(); } catch (e) { console.error("Asistente de arranque:", e); }
}

/* ----------------------------- Campos de la config ----------------------------- */
// Los campos `cfg*` viven en «Tus datos» y los guarda js/13 con su evento
// «change»; aquí se actúa DETRÁS de ese oyente (se registra en
// DOMContentLoaded, después que este): repintar y reclasificar si hace falta.
const ARR_CAMPOS_CONFIG = ["cfgWallet", "cfgVault", "cfgEthKey", "cfgNombre", "cfgNif"];

function arrMontarCamposConfig() {
  for (const id of ARR_CAMPOS_CONFIG) {
    const el = $(id);
    if (!el || el.__arrEvento) continue;
    el.__arrEvento = true;
    el.addEventListener("change", () => setTimeout(arrTrasCambioConfig, 0));
  }
  // La casilla de «Tus datos» (js/04).
  const casilla = $("cfgDatosEnArchivo");
  if (casilla && !casilla.__arrEvento) {
    casilla.__arrEvento = true;
    casilla.addEventListener("change", () => alCambiarDatosEnArchivo(casilla));
  }
}

/* ----------------------------- Clasificación automática ----------------------------- */
/* Clasifica en silencio si hay con qué: cache, CSV y una config con formato
   válido. Devuelve true si clasificó. `detalle` deja el registro completo
   (el flujo de abrir/actualizar); sin él, una sola línea. */
function arrClasificarAhora(opciones) {
  if (!state.cache || !state.csvCargado || !direccionesConfigOk(state.config)) return false;
  const ok = ejecutarClasificacion({ silencioso: true, detalle: !!(opciones && opciones.detalle) });
  if (ok) arr.configClasificada = arrHuellaConfig(state.config);
  return !!ok;
}

// La clasificación en pantalla era de otra cache u otro CSV.
function arrLimpiarClasificacion() {
  state.registros = null;
  // Con los registros de antes, marcarCacheDirty sellaría las
  // decisiones de la cache nueva con los movimientos de la anterior.
  state.registrosSinVinculos = null;
  state.informePagos = null;
  state.ultimaClasificacion = null;
  arr.configClasificada = null;
  // Los envoltorios de js/15, 16, 18 y 19 repintan Revisión, Panel y
  // Transacciones detrás de esta llamada.
  actualizarChipEstado();
}

function arrReiniciarSync() {
  arr.ultimaPreparacion = null;
  state.sync.vault = null;
  state.sync.fechasSinPrecio = null;
  ["etherscan", "bce", "rnt", "vault"].forEach(p => setDot(p, ""));
  setProgreso(0, "Listo para sincronizar");
}

function arrTrasCambioConfig() {
  arrPintarSeguro();
  if (arr.preparando || !state.cache || arrPrimeraDescarga() || !state.csvCargado) return;
  if (!direccionesConfigOk(state.config)) return;                      // a medio escribir
  if (arr.configClasificada === arrHuellaConfig(state.config)) return; // nada que cambie el resultado
  arrLimpiarClasificacion();
  arrFlujo({ sincronizar: false });
}

/* La primera descarga empieza sola en cuanto tus datos valen y no hay nada
   descargado. Una vez por wallet, vault y key: con la key mal no se repite
   sola al tocar el nombre; «🔄 Actualizar» reintenta. */
function arrPrimeraDescarga() {
  const ev = arrEvaluar(arrFoto()), cfg = state.config || {};
  const huella = arrHuellaConfig(cfg) + "|" + String(cfg.etherscan_api_key || "").trim();
  if (!ev.puedeActualizar || ev.nTx > 0 || arr.descargaSola === huella) return false;
  arr.descargaSola = huella;
  arrFlujo({ sincronizar: true });
  return true;
}

// El archivo de Reental va dentro de tu archivo (js/12).
async function arrTrasCargarCsv(nombre, texto) {
  arrLimpiarClasificacion();
  // Si hay un flujo en curso, clasificará con este CSV al terminar de descargar.
  if (arr.preparando || !state.cache) { arrPintarSeguro(); return; }
  await arrFlujo({ sincronizar: false });
}

/* ----------------------------- Flujo: (sincronizar →) descubrir → clasificar ----------------------------- */
async function arrFlujo(opciones) {
  if (arr.preparando) return;
  const conSync = !!(opciones && opciones.sincronizar);
  arr.preparando = true;
  arrPintarSeguro();
  let buscarVault = false;
  const previo = arr.ultimaPreparacion || {};
  // cuadrePendiente: se descargó sin el archivo de Reental; el cuadre, al
  // cargarlo, si la wallet y el vault son los de esa descarga (su huella).
  const res = { sincronizado: !!previo.sincronizado, erroresSync: previo.erroresSync || [],
    nuevas: previo.nuevas || 0, total: arrNumTx(state.cache), fecha: new Date().toISOString(),
    cuadrePendiente: previo.cuadrePendiente || null };
  try {
    leerConfigDesdeFormulario();
    let cuadrar = !conSync && res.cuadrePendiente === arrHuellaConfig(state.config);
    if (conSync && state.cache && !configValidaParaSincronizar().length) {
      log("=== Actualizar: sincronizar → descubrir → clasificar ===", "ok");
      const antes = arrNumTx(state.cache);
      state.cuadre = null;   // los saldos de antes no valen con lo nuevo
      const r = await sincronizar("todo", { silencioso: true });
      if (r) {
        res.sincronizado = true;
        res.erroresSync = r.errores;
        res.nuevas = arrNumTx(state.cache) - antes;
        // Con la descarga de Etherscan a medias saldría una diferencia falsa.
        cuadrar = !r.errores.includes("etherscan");
        if (r.errores.length) log("AVISO: la sincronización falló en " + r.errores.join(", ") +
          "; se clasifica con lo que ya hay en la cache.", "warn");
      }
    }
    res.total = arrNumTx(state.cache);
    res.clasificado = arrClasificarAhora({ detalle: true });
    res.cuadrePendiente = cuadrar && !res.clasificado ? arrHuellaConfig(state.config) : null;
    // El cuadre con la blockchain, con lo recién clasificado (js/28).
    if (cuadrar && res.clasificado && typeof cuadreLeer === "function") {
      // Mientras lee, la barra lo dice; luego vuelve a lo de la sincronización.
      const texto = $("textoProgreso"), antes = texto.textContent;
      setProgreso(100, "Cuadre con la blockchain");
      try { await cuadreLeer(); } finally { texto.textContent = antes; }
      // El archivo de Reental, tu wallet o tu vault cambiaron
      // mientras leía (su propio flujo no arranca con este en marcha).
      if (arr.configClasificada !== arrHuellaConfig(state.config)) res.clasificado = arrClasificarAhora({ detalle: true });
    }
    buscarVault = conSync && cuadrar && !normalizarDireccion(state.config.vault);
    if (!res.clasificado && state.cache && !state.csvCargado) log("Esperando el archivo de rendimientos para clasificar.");
  } catch (e) {
    console.error(e);
    log("Error en la puesta en marcha: " + e.message, "error");
    toast("Error en la puesta en marcha: " + e.message, "error");
  } finally {
    arr.ultimaPreparacion = res;
    arr.preparando = false;
    // Lo que dijo esta descarga, guardado (al recargar sale ese, no el de
    // la anterior); también el cuadre pendiente ya hecho (si no, se repetiría al abrir).
    if ((conSync || (previo.cuadrePendiente || null) !== res.cuadrePendiente) && state.cache) autoGuardarCache();
    arrPintarSeguro();
    // 🧾 y 📤 se repintan al cambiar el estado; lo que
    // pidió la clasificación llegó con el flujo aún en marcha.
    actualizarChipEstado();
    const fin = $("arrFin");
    const enInicio = (location.hash || "").slice(1) === "inicio";
    if (fin && !fin.hidden && enInicio) fin.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  // Con el flujo ya terminado: el CSV o un cambio de tus datos mientras busca siguen su curso.
  if (buscarVault) await arrBuscarVault();
}

/* Con el vault vacío, el que creó tu wallet: una ayuda, no una certeza. Se
   pregunta a Etherscan una vez por wallet y sesión (cada «🔄 Actualizar»
   vuelve a enseñar lo hallado). Un fallo deja una línea en el registro y
   nada más. `pedido` (el botón «🔍 Buscar mi vault»): pregunta otra vez y
   enseña también los que dijiste «No es» (lo pides tú). Devuelve cuántos
   enseña, o null si no se pudo buscar. */
async function arrBuscarVault(pedido = false) {
  if (arr.buscandoVault) return null; // ya hay una en marcha (el botón está apagado mientras)
  arr.buscandoVault = true;
  arrPintarSeguro();
  try {
    const cfg = state.config, wallet = normalizarDireccion(cfg.wallet);
    if (pedido || !arr.vaultsHallados || arr.vaultsHallados.wallet !== wallet) {
      const candidatos = vaultCandidatos(state.cache, wallet, pedido);
      const r = candidatos.length ? await vaultsCreadosPor(candidatos, wallet, String(cfg.etherscan_api_key || "").trim()) : [];
      if (r === null) { log("No se pudo buscar tu vault en Etherscan.", "warn"); return null; }
      arr.vaultsHallados = { wallet, lista: r };
    }
    // Mientras buscaba pudiste escribir tu vault, cambiar la wallet o decir «No es».
    leerConfigDesdeFormulario();
    const rechazados = pedido ? new Set() : vaultsRechazados(state.cache);
    const lista = arr.vaultsHallados.lista.filter(v => !rechazados.has(v.direccion));
    if (normalizarDireccion(state.config.wallet) !== wallet || normalizarDireccion(state.config.vault)) return undefined;
    if (lista.length) arrProponerVault(lista);
    return lista.length;
  } catch (e) { log("No se pudo buscar tu vault: " + e.message, "warn"); return null; }
  finally { arr.buscandoVault = false; arrPintarSeguro(); }
}
/* «🔍 Buscar mi vault», junto al campo: con el vault vacío, la wallet y la
   API key escritas y algo ya descargado de esa wallet (busca entre sus
   transacciones; con la de otra wallet, no hasta descargar); no mientras
   se descarga. */
function arrPuedeBuscarVault(cfg, nTx, preparando, cache) {
  return !preparando && nTx > 0 && direccionValida(normalizarDireccion((cfg && cfg.wallet) || "")) &&
    !!String((cfg && cfg.etherscan_api_key) || "").trim() && !String((cfg && cfg.vault) || "").trim() &&
    !direccionesCambiadas(cache, cfg.wallet, "").includes("wallet");
}
/* La huella de lo que se buscó: la nota del botón solo vale para ella. */
function arrHuellaVault(cfg) {
  return normalizarDireccion((cfg && cfg.wallet) || "") + "|" + String((cfg && cfg.etherscan_api_key) || "").trim();
}
async function arrPulsarBuscarVault() {
  if (arr.buscandoVault) return;
  const btn = $("btnBuscarVault");
  leerConfigDesdeFormulario();
  const huella = arrHuellaVault(state.config);
  arr.notaVault = null;
  btn.textContent = "⏳ Buscando…";
  const n = await arrBuscarVault(true);
  btn.textContent = "🔍 Buscar mi vault";
  const texto = n === null ? "No se pudo buscar en Etherscan." : n === 0 ? "Ningún vault creado por tu wallet." : "";
  arr.notaVault = texto ? { texto, huella } : null;
  arrPintarSeguro();
}
// La mini ventana: «Ponerlo» lo escribe en tus datos y descarga; «No es» no vuelve a salir.
function arrProponerVault(lista) {
  const dlg = $("arrDlgVault");
  if (!dlg || dlg.open) return;
  const pintar = () => {
    $("arrDlgVaultTit").textContent = lista.length === 1 ? "Vault probable" : "Vaults probables";
    $("arrDlgVaultLista").innerHTML = lista.map(v => '<div class="arr-vault"><code>' + v.direccion + "</code> creado por tu wallet" +
      (v.fecha ? " el " + fechaEs(enHoraEspanola(v.fecha)) : "") + '<div class="row"><button type="button" class="primary" data-poner="' + v.direccion + '">Ponerlo</button>' +
      '<button type="button" data-no-es="' + v.direccion + '">No es</button></div></div>').join("");
  };
  dlg.onclick = e => {
    const poner = e.target.closest("[data-poner]"), noEs = e.target.closest("[data-no-es]");
    if (poner) {
      dlg.close();
      $("cfgVault").value = poner.dataset.poner;
      $("cfgVault").dispatchEvent(new Event("change"));
      arrActualizar();
    } else if (noEs) {
      rechazarVault(state.cache, noEs.dataset.noEs);
      marcarCacheDirty();
      lista = lista.filter(v => v.direccion !== noEs.dataset.noEs);
      if (lista.length) pintar(); else dlg.close();
    }
  };
  pintar();
  dlg.showModal();
}

// «🔄 Actualizar»: volver a descargar lo nuevo y clasificar.
async function arrActualizar() {
  const ev = arrEvaluar(arrFoto());
  if (!ev.puedeActualizar) {
    arrPintarSeguro();
    if (ev.faltan.length) toast("Antes de empezar: " + ev.faltan.map(f => f.texto).join(" · "), "warn", null, 9000);
    return;
  }
  await arrFlujo({ sincronizar: true });
}

/* ----------------------------- Abrir ----------------------------- */
// Deja lista una cache (la de este navegador al abrir la página, una copia
// o la vacía de la primera vez) y lanza el flujo; se guarda sola (js/05).
// Con `leido` (lo guardado en este navegador) sigue como estaba, sin
// descargar: { prep, vault } de la última descarga. Sin él (una copia),
// descarga lo nuevo.
async function arrUsarCache(obj, leido) {
  if (!leido) arr.sinLeer = false;   // una copia abierta sustituye a lo guardado, se pudiera leer o no
  state.cache = asegurarEstructuraCache(obj);
  // Sus decisiones sin sello siguen por su clave (js/05), también
  // si se marca por guardar o se descarga algo antes de clasificar.
  recordarAjustesSinSello(state.cache);
  state.cacheDirty = false;
  arrReiniciarSync();
  if (leido && leido.prep) { arr.ultimaPreparacion = leido.prep; state.sync.vault = leido.vault || null; }
  arrLimpiarClasificacion();
  // Mandan tus datos y el archivo de Reental de dentro (si el que
  // tenías cargado es más nuevo, gana y entra). Un solo guardado al final.
  configDesdeCache(state.cache);
  // Tus datos de dentro mal escritos (a mano) no se pisan al abrir con los
  // del navegador: se quedan hasta que los cambies.
  const datosMal = state.cache.configuracion != null && !leerConfiguracionCache(state.cache);
  // Con la casilla desmarcada en este navegador, abrir
  // no le quita lo que ya lleva (se quita si cambias tus datos o la
  // casilla); uno sin tus datos dentro los recibe (la wallet y el vault).
  const sinRecortar = state.cache.configuracion != null && !datosEnArchivo();
  if (datosMal || sinRecortar) guardarConfigSoloNavegador();
  else guardarConfigLocalSilencioso();
  const csv = cargarCsvDeLaCache(state.cache);
  arr.csvFueraMasNuevo = csv === "fuera_mas_nuevo";
  if (!leido || csv === "fuera" || csv === "fuera_mas_nuevo") marcarCacheDirty();
  if (state.cacheDirty) await autoGuardarCache();
  renderPanel();
  await arrFlujo({ sincronizar: !leido });
}

/* Qué es el archivo elegido. Función pura: "cache" (tu archivo),
   "copia" (una copia nueva: tu archivo con la marca copia_de_seguridad),
   "copia_vieja" (el formato antiguo), "config" (un config.json), "rara" (tu
   archivo o una copia con un bloque que rompería la pantalla, como rechaza
   la copia vieja) u "otro". */
function arrTipoArchivo(obj) {
  if (pdEsObjeto(obj) && obj.tipo === "copia_de_seguridad") return "copia_vieja";
  if (!errorCache(obj)) return arrCacheRara(obj) ? "rara" : "copia_de_seguridad" in obj ? "copia" : "cache";
  if (!motivoConfigNoValida(obj)) return "config";
  return "otro";
}
const ARR_NO_ES_TUYO = "Ese archivo no es de esta app. No ha cambiado nada.";
const ARR_RARO = "Ese archivo está mal escrito y no se puede abrir. No ha cambiado nada.";

/* «📂 Abrir copia»: una copia, un reental_cache.json, una copia vieja o
   un config.json. Lo que trae sustituye a lo de este navegador; con
   datos, se pregunta antes. Una copia nueva lleva la marca con su fecha
   (se dice al abrirla y se quita) y, a veces, sus API keys en la marca
   (pasan a tus datos). */
async function arrAbrirArchivo() {
  if (arr.preparando) return;
  const archivo = await elegirArchivo(".json,application/json");
  if (!archivo) return;
  let obj;
  try { obj = JSON.parse(await archivo.text()); }
  catch (e) { toast(e && e.name === "SyntaxError" ? ARR_NO_ES_TUYO : "No se pudo abrir el archivo: " + (e && e.message), "error"); return; }
  // Mientras elegías el archivo pudo empezar otro flujo (cargar el CSV).
  if (arr.preparando) { toast("Espera a que termine lo que está en marcha y vuelve a intentarlo.", "warn"); return; }
  const tipo = arrTipoArchivo(obj);
  if (tipo === "otro") { toast(ARR_NO_ES_TUYO, "error"); return; }
  if (tipo === "rara") { toast(ARR_RARO, "error"); return; }
  if (tipo === "config") {
    // Elegido por error (config.ejemplo.json está en la misma carpeta)
    // pisaría tus datos y tu API key. Una wallet escrita y mal
    // (la del ejemplo) no vale; con tus datos escritos, se pregunta.
    const wallet = typeof obj.wallet === "string" ? obj.wallet.trim() : "";
    if (wallet && !direccionValida(wallet)) { toast("Ese config.json no trae una wallet válida. No ha cambiado nada.", "error"); return; }
    leerConfigDesdeFormulario();
    if ((arrHayDatos() || exConfigConDatos(state.config, true)) &&
        !confirm("¿Usar los datos de este config.json?\n\nSustituyen a los tuyos (wallet, vault, API key, nombre y NIF).")) return;
    usarConfigAbierta(obj);
    arrTrasCambioConfig();
    return;
  }
  if (tipo === "copia_vieja") { await arrAbrirCopiaVieja(obj); return; }
  const fecha = tipo === "copia" ? arrFechaCopia(obj.copia_de_seguridad?.creada) : "";
  // También lo escrito en tus datos, como la copia vieja.
  leerConfigDesdeFormulario();
  if ((arrHayDatos() || exConfigConDatos(state.config)) &&
      !confirm((fecha ? "¿Abrir la copia del " + fecha + "?" : "¿Abrir esta copia?") + "\n\nSustituye a lo que hay en este navegador.")) return;
  if (tipo === "copia") {
    // La copia abierta cuenta como tu última copia (tras «Olvidar todo» no dice «ninguna»).
    const creada = obj.copia_de_seguridad?.creada, ultima = exUltimaCopia();
    if (fecha && (!ultima || new Date(creada) > new Date(ultima.fecha))) {
      exApuntarCopia({ fecha: creada, archivo: archivo.name || "", descargada: true, movimientos: arrNumTx(obj) });
    }
    // Sus datos primero, así las claves de la marca no
    // se toman después por las de otra wallet (arrUsarCache los vuelve a leer).
    configDesdeCache(obj);
    Object.assign(state.config, exClavesDeCopia(obj.copia_de_seguridad));
    volcarConfigAFormulario();
    delete obj.copia_de_seguridad;
  }
  toast(fecha ? "Copia del " + fecha + " abierta." : "Copia abierta.", "ok");
  await arrUsarCache(obj);
}

/* ----------------------------- Recuperar una copia de seguridad (formato antiguo) -----------------------------
   La copia de formato antiguo (tipo «copia_de_seguridad»). Solo
   reemplaza: cada parte que trae sustituye a la abierta y la que no trae
   se queda como está. Si alguna parte está mal no se aplica nada. La
   cache recuperada pasa a ser la de este navegador. Unas API keys vacías
   en la copia no borran las tuyas. */
const ARR_COPIA_VERSION = 1;
// La copia de formato antiguo se sigue abriendo con «📂 Abrir copia»
// y queda en el formato nuevo: su config y su archivo de Reental entran en la
// cache al usarla (arrUsarCache).

/* Función pura: comprueba la copia. Devuelve { error } o { creada, config,
   cache, rendimientos, lleva }, con `lleva` en el formato de exTextoLleva. */
function arrLeerCopia(obj) {
  if (!pdEsObjeto(obj) || obj.tipo !== "copia_de_seguridad") {
    if (pdEsObjeto(obj)) {
      if (!errorCache(obj)) return { error: "Ese es tu archivo, no una copia: ábrelo con «📂 Abrir copia»." };
      if (!motivoConfigNoValida(obj)) return { error: "Ese archivo es tu config.json, no una copia: ábrelo con «📂 Abrir copia»." };
    }
    return { error: "Ese archivo no es una copia de seguridad." };
  }
  if (typeof obj.version === "number" && obj.version > ARR_COPIA_VERSION) return { error: "Esa copia es de una versión más nueva de la app." };
  const c = obj.contenido;
  if (obj.version !== ARR_COPIA_VERSION || !pdEsObjeto(c)) return { error: "Esa copia está mal escrita." };
  const config = c.config ?? null, cache = c.cache ?? null, rendimientos = c.rendimientos ?? null;
  if (config === null && cache === null && rendimientos === null) return { error: "Esa copia está vacía." };
  // Todas las partes que están mal, y por qué el archivo de rendimientos.
  const mal = [];
  if (config !== null && motivoConfigNoValida(config)) mal.push("su config no vale");
  if (cache !== null && (errorCache(cache) || arrCacheRara(cache))) mal.push("su archivo de la app no vale");
  let repartos = null;
  if (rendimientos !== null) {
    const csv = pdEsObjeto(rendimientos) && typeof rendimientos.texto === "string" ? cargarCsvRendimientos(rendimientos.texto) : null;
    if (!csv || csv.error || !csv.filas.length) {
      mal.push("su archivo de rendimientos no vale" + (csv && csv.error ? " (" + csv.error.replace(/\.$/, "") + ")" : ""));
    } else repartos = csv.filas.length;
  }
  if (mal.length) return { error: "Esa copia está mal escrita: " + mal.join("; ") + "." };
  return {
    creada: obj.creada, config, cache, rendimientos,
    lleva: {
      movimientos: cache !== null ? arrNumTx(cache) : null,
      repartos,
      config: config !== null,
      claves: config !== null && exTieneClaves(config),
    },
  };
}

/* Lo que `errorCache` deja pasar pero rompe al pintarla: un bloque
   que debe ser un objeto ({…}) y no lo es (tipos_bce: null), o una
   transacción que no es un objeto. Vale lo que asegurarEstructuraCache
   (js/05) arregla solo: null en nullVale y, en seAparta, cualquier cosa,
   que se aparta en «*_no_leidos» sin perder nada (se abre, no se da por
   «mal escrito»). */
function arrCacheRara(cache) {
  const plantilla = cacheVacia();
  const nullVale = ["precios_rnt_no_disponibles"], seAparta = ["pagos_diferidos", "precios_pol"];
  const bloqueMal = Object.keys(plantilla).some(k => pdEsObjeto(plantilla[k]) && cache[k] !== undefined &&
    !pdEsObjeto(cache[k]) && !(cache[k] === null && nullVale.includes(k)) && !seAparta.includes(k));
  const txMal = Object.values(cache.transacciones).some(serie => Array.isArray(serie) && serie.some(t => !pdEsObjeto(t)));
  return bloqueMal || txMal;
}

/* «15/01/2026 22:21» con la hora de este ordenador; "" si no es una fecha
   con su hora como la escribe exArmarCopia (sin hora, o con un día que
   no existe, no se inventa ninguna). */
function arrFechaCopia(creada) {
  const d = new Date(creada);
  if (typeof creada !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/.test(creada) ||
      isNaN(d.getTime()) || d.toISOString().slice(0, 16) !== creada.slice(0, 16)) return "";
  const f = exFechaLocal(d);
  return fechaEs(f.dia) + " " + f.hora;
}

async function arrAbrirCopiaVieja(obj) {
  const copia = arrLeerCopia(obj);
  if (copia.error) { toast(copia.error + " No ha cambiado nada.", "error"); return; }

  leerConfigDesdeFormulario();
  // También lo escrito en tus datos (nombre, NIF, vault…).
  const hayAbierto = arrHayDatos() || !!state.csvCargado || exConfigConDatos(state.config);
  const fecha = arrFechaCopia(copia.creada);
  // Sin cache en la copia, la de este navegador se queda.
  if (hayAbierto && !confirm((fecha ? "¿Recuperar la copia del " + fecha + "?" : "¿Recuperar esta copia?") + "\n\n" +
      "Trae: " + exTextoLleva(copia.lleva) + ".\n\n" +
      "Sustituye a lo que hay en este navegador.")) return;

  if (copia.config) {
    const antes = state.config;
    state.config = aplicarReglasFijasConfig(conservarDatosConfig(copia.config, antes));
    // La de CoinGecko vacía tampoco borra la tuya (conservarDatosConfig, js/04, solo mira la de Etherscan).
    if (!String(state.config.coingecko_api_key ?? "").trim() && String(antes.coingecko_api_key ?? "").trim()) {
      state.config.coingecko_api_key = antes.coingecko_api_key;
    }
    volcarConfigAFormulario();
    // Con su cache, sus datos entran en ella al usarla (arrUsarCache); sin
    // ella, en la abierta.
    if (!copia.cache) guardarConfigLocalSilencioso();
  }
  // Un nombre que no es un texto con algo escrito no se guarda tal cual.
  const nombreCsv = copia.rendimientos && typeof copia.rendimientos.nombre === "string" ? copia.rendimientos.nombre.trim() : "";
  if (copia.rendimientos && aplicarCsvTexto(copia.rendimientos.texto, copia.cache ? "copia" : false, nombreCsv) && !copia.cache) await csvALaCache();
  toast("Copia recuperada.", "ok");
  // Una marca de copia dentro de su cache la haría salir «mal escrita» al recargar.
  if (copia.cache) { delete copia.cache.copia_de_seguridad; await arrUsarCache(copia.cache); return; }
  arrLimpiarClasificacion();
  if (state.cache) await arrFlujo({ sincronizar: false });
}

/* ----------------------------- Lo guardado en este navegador -----------------------------
   IndexedDB de ESTE navegador (js/03; nunca sale del equipo). Tu
   archivo vive aquí (registro «archivo», lo escribe js/05) y
   sale solo al abrir la página, sin descargar hasta «🔄 Actualizar». Todo
   tolera que IndexedDB no exista o falle. */

/* Lo guardado: { texto, cuando, prep, vault }, null si no hay nada o
   { error } si no se pudo leer (no es lo mismo). Si solo hay registros
   del formato antiguo («archivo:…», uno por pestaña), el más reciente
   pasa a ser lo guardado y se borra el resto. */
async function arrLeerDelNavegador() {
  try {
    const g = await idbOperar("readonly", s => s.get(ALMACEN_ARCHIVO));
    if (g) return g;
    const claves = await idbOperar("readonly", s => s.getAllKeys());
    if (!claves.length) return null;
    const valores = await idbOperar("readonly", s => s.getAll());
    // El más reciente que sea tu archivo (uno roto no deja fuera a uno bueno más antiguo).
    const ultimo = valores.filter((v, i) => String(claves[i]).startsWith("archivo:") && arrCacheGuardada(v))
      .sort((a, b) => (b.cuando || 0) - (a.cuando || 0))[0];
    const g2 = ultimo ? { texto: ultimo.texto, cuando: ultimo.cuando || null, prep: ultimo.prep || null, vault: ultimo.vault || null } : null;
    await idbOperar("readwrite", s => {
      if (g2) s.put(g2, ALMACEN_ARCHIVO);
      for (const k of claves) s.delete(k);
    });
    return g2;
  } catch (e) { return { error: e }; }
}
// El texto guardado, si es tu archivo; si no, null.
function arrCacheGuardada(g) {
  let obj = null;
  try { obj = g && JSON.parse(g.texto); } catch (e) { /* mal escrito */ }
  return obj && arrTipoArchivo(obj) === "cache" ? obj : null;
}

/* Una sola pestaña (releer lo de la otra hace que se pisen). Se pide el bloqueo del
   navegador (Web Locks) sin esperar; la primera lo retiene mientras viva y la
   segunda no lee ni guarda nada: enseña #arrOtraPestana y se abre sola
   (recarga) cuando la otra se cierra. El navegador lo suelta solo si la
   pestaña se cierra o se cuelga. Sin Web Locks, no se bloquea. El nombre,
   propio: con doble clic, todo file:// comparte el origen. */
const ARR_BLOQUEO = "reentrack:archivo";
function arrPedirBloqueo() {
  if (typeof navigator === "undefined" || !navigator.locks) return Promise.resolve(true);
  return new Promise(ok => {
    navigator.locks.request(ARR_BLOQUEO, { ifAvailable: true }, lock => {
      ok(!!lock);
      return lock ? new Promise(() => {}) : undefined;   // se retiene mientras viva la pestaña
    }).catch(() => ok(true));
  });
}
function arrBloquearPestana() {
  arr.soloLectura = true;
  if ($("arrOtraPestana")) $("arrOtraPestana").hidden = false;
  // Cuando la otra se cierre, esta se recarga y lo pide de nuevo.
  navigator.locks.request(ARR_BLOQUEO, () => { location.reload(); }).catch(() => {});   // lo suelta al momento: la recargada lo pide
}

/* Al abrir la página: lo guardado y, si no hay nada, uno vacío (la primera
   vez: tus datos y «🔄 Actualizar»). Lo guardado mal escrito no se borra:
   se aparta en «archivo_no_leido» antes de que el siguiente guardado lo pise. */
async function arrRestaurarRecordados() {
  if (!(await arrPedirBloqueo())) { arrBloquearPestana(); return; }
  let g = await arrLeerDelNavegador();
  // Un fallo al leer no es «no hay nada»: sin esto, el siguiente guardado
  // escribiría una cache vacía encima de lo tuyo. Se avisa y no se guarda nada.
  if (g && g.error) {
    arr.sinLeer = true;
    toast("No se pudo leer lo guardado en este navegador. Recarga la página; hasta entonces no se guarda nada.", "error", null, 0);
    g = null;
  }
  const obj = arrCacheGuardada(g);
  if (g && !obj) {
    try { await idbOperar("readwrite", s => s.put(g, "archivo_no_leido")); } catch (e) { /* sin IndexedDB */ }
    toast("Lo guardado en este navegador está mal escrito. Abre tu última copia con «📂 Abrir copia».", "error", null, 0);
  }
  if (!state.cache) {
    if (obj) await arrUsarCache(obj, g);   // g lleva prep y vault
    else {
      state.cache = asegurarEstructuraCache(cacheVacia());
      recordarAjustesSinSello(state.cache);
      renderPanel();
      actualizarChipEstado();
    }
  }
  arrPintarSeguro();
}

/* Tras el primer guardado se pide al navegador almacenamiento
   persistente (que no lo borre solo si le falta sitio). */
let arrPersistentePedido = false;
function arrTrasGuardar() {
  if (!arrPersistentePedido && typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    arrPersistentePedido = true;
    navigator.storage.persist().catch(() => {});
  }
  arrPintarSeguro();
}

/* «🧹 Olvidar todo», para un ordenador público. Borra todo lo que la app
   guarda en este navegador (IndexedDB y sus claves de localStorage: API
   keys, tus datos, la casilla, la última copia, el tema y el menú) y
   recarga la página limpia. Tu archivo también está aquí, así que el
   aviso es serio y ofrece guardar una copia antes (el diálogo
   #arrDlgOlvidar). Solo las claves de la app, no todas las «reental_»:
   abiertas con doble clic, otras páginas file:// comparten el almacén. */
const ARR_SENAL_OLVIDAR = "reental_olvidar";   // aviso a las otras pestañas
const ARR_CLAVES_NAVEGADOR = ["reental_config", "reental_copias", "reental_dark", "reental_nav_plegada", "reental_datos_en_archivo",
  ARR_SENAL_OLVIDAR];
async function arrOlvidarTodo() {
  const dlg = $("arrDlgOlvidar");
  if (!dlg || dlg.open) return;
  leerConfigDesdeFormulario();
  $("arrDlgCopia").hidden = !arrHayAlgoQueCopiar();
  // El botón pulsado al enviarse el formulario y Esc al momento: «close» va
  // con el pintado de la página y en una pestaña sin pintar no llega.
  const que = await new Promise(ok => {
    dlg.querySelector("form").onsubmit = e => ok(e.submitter ? e.submitter.value : "");
    dlg.oncancel = () => ok("");
    dlg.onclose = () => ok(dlg.returnValue);
    dlg.showModal();
  });
  if (que !== "copia" && que !== "olvidar") return;
  if (que === "copia") {
    // Con una descarga en marcha la copia no se puede hacer: se dice.
    if (exCopiaApagada()) { toast("Espera a que termine lo que está en marcha y vuelve a intentarlo.", "warn"); return; }
    if (!(await exHacerCopia())) return;
    // La app no sabe si la descarga llegó (el navegador puede
    // preguntar dónde guardarla): no se borra nada hasta que lo confirmes.
    const nombre = (exUltimaCopia() || {}).archivo;
    if (!confirm("Copia descargada" + (nombre ? ": " + nombre : "") + ".\n\nComprueba que está en tus descargas. ¿Olvidar todo ya?")) return;
  }
  arr.olvidando = true;   // que nada vuelva a guardar tu archivo
  try {
    for (const k of ARR_CLAVES_NAVEGADOR) localStorage.removeItem(k);
    // Las otras pestañas de la app lo ven (evento «storage») y se recargan.
    localStorage.setItem(ARR_SENAL_OLVIDAR, String(Date.now()));
    localStorage.removeItem(ARR_SENAL_OLVIDAR);
  } catch (e) { /* bloqueado: nada que borrar */ }
  try { await idbOperar("readwrite", s => s.clear()); } catch (e) { /* nada que olvidar */ }
  location.reload();
}

/* Lo que otra pestaña de la app cambia en el navegador.
   «Olvidar todo» allí recarga también esta (si no, volvería a guardar al
   tocar algo); la casilla sale como la dejó. */
function arrAlCambiarAlmacen(e) {
  if (e.key === ARR_SENAL_OLVIDAR && e.newValue) { arr.olvidando = true; location.reload(); }
  else if (e.key === CONFIG_DATOS_EN_ARCHIVO && $("cfgDatosEnArchivo")) $("cfgDatosEnArchivo").checked = datosEnArchivo();
}

/* ----------------------------- Rutas antiguas ----------------------------- */
function arrBajarA(ancla) {
  if (!ancla) return;
  setTimeout(() => { const el = $(ancla); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
}

// Sustituye #sync / #clasificacion / #panel por su destino ANTES de que
// routing() (js/13) lea el hash: replaceState no lanza otro hashchange.
function arrNormalizarHash() {
  const a = arrAlias(location.hash);
  if (!a) return null;
  history.replaceState(null, "", "#" + a.vista);
  return a;
}

// Acciones del resumen que llevan a 🔍 Revisión.
function arrIrAlCatalogo() {
  location.hash = "#revision";
  setTimeout(() => ccIrABloque("rvCatalogo"), 150); // js/15: lo abre
}

/* ----------------------------- Estilos (inyectados una vez) ----------------------------- */
function arrInyectarEstilos() {
  if (typeof document === "undefined" || $("estiloArranque19")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloArranque19";
  estilo.textContent = [
    "#view-inicio [hidden]{display:none!important}",
    ".arr-archivo{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:4px 0 2px;font-size:14px}",
    ".arr-datos{margin-top:16px;border:1px solid var(--border);border-radius:12px;background:var(--tarjeta);padding:10px 14px}",
    ".arr-datos summary{font-weight:700;cursor:pointer}",
    ".arr-reental{margin-top:14px}",
    ".arr-dz{padding:20px 22px;text-align:left;font-size:15px;color:var(--text)}",
    ".arr-dz-t{font-size:17px;font-weight:700;margin-bottom:6px}",
    ".arr-dz.cargado{border-style:solid;border-color:var(--ok-bd);background:var(--ok-bg)}",
    ".arr-dz .arr-cambiar{color:var(--accent);font-weight:600;text-decoration:underline}",
    /* «🔄 Actualizar» más abajo, centrado
       y más grande, separado del archivo de Reental para que no parezca suyo. */
    ".arr-cta{display:flex;flex-direction:column;align-items:center;gap:12px;margin-top:26px;padding-top:22px;border-top:1px solid var(--border)}",
    "#arrPreparar{font-size:17px;padding:14px 36px;min-height:52px}",
    ".arr-info{display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;border:1px solid var(--border2);color:var(--muted);font-size:12px;font-weight:700;cursor:help;vertical-align:middle}",
    ".arr-info:hover,.arr-info:focus{border-color:var(--accent);color:var(--accent)}",
    ".arr-opcional{font-weight:600;color:var(--faint);text-transform:none;letter-spacing:0}",
    ".arr-faltan{display:flex;flex-direction:column;align-items:center;gap:6px}",
    ".arr-falta{font-size:13px;padding:7px 11px;border-radius:10px;background:var(--err-bg);border:1px solid var(--err-bd);color:var(--text)}",
    ".arr-falta span{color:var(--err);font-weight:700}",
    ".arr-falta.ok{background:var(--ok-bg);border-color:var(--ok-bd)}",
    ".arr-falta.ok span{color:var(--ok)}",
    ".arr-falta a{margin-left:4px;font-weight:600}",
    ".arr-fin{margin-top:14px;padding:12px 14px;border-radius:12px;background:var(--tarjeta);border:1px solid var(--border);display:flex;flex-direction:column;gap:6px}",
    ".arr-fin-t{font-size:14px}",
    ".arr-linea{font-size:13px;line-height:1.45}",
    ".arr-linea span{display:inline-block;width:16px;font-weight:700}",
    ".arr-linea.ok span{color:var(--ok)}",
    ".arr-linea.warn span{color:var(--warn)}",
    ".arr-linea.info span{color:var(--info)}",
    ".arr-linea a{margin-left:4px;font-weight:600}",
    ".arr-registro{margin-top:14px}",
    "#exUltima{margin-top:6px}",
    /* El diálogo de «🧹 Olvidar todo» (#arrDlgOlvidar de index.html). */
    ".arr-dlg{margin:auto;max-width:520px;border:1px solid var(--border);border-radius:14px;background:var(--tarjeta);color:var(--text);padding:18px 20px}",
    ".arr-dlg::backdrop{background:rgba(0,0,0,.45)}",
    ".arr-dlg h3{margin:0 0 8px}",
    ".arr-vault{margin:8px 0}.arr-vault code{word-break:break-all}",
    /* La app ya abierta en otra pestaña (#arrOtraPestana de index.html), por encima de todo. */
    ".arr-otra{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:var(--bg);padding:16px}",
    ".arr-otra[hidden]{display:none}",
    ".arr-otra .card{max-width:480px}",
    ".arr-olvidar{margin:16px 0 0;text-align:right}",
    /* Rojo pálido, como «Cancelar» del buscador: borra lo guardado. */
    ".arr-olvidar-todo,.arr-dlg-olvidar{font-size:13px;background:var(--err-bg);border:1.5px solid var(--err-bd);color:var(--err);font-weight:700}",
    ".arr-cabecera{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}",
    ".dot.warn i{background:var(--warn)}",
    ".step-card{border-left:5px solid var(--border2)}",
    ".step-card[data-state=\"ok\"]{border-left-color:var(--ok)}",
    ".step-card[data-state=\"warn\"]{border-left-color:var(--warn)}",
    ".step-card[data-state=\"run\"]{border-left-color:var(--info)}",
    ".step-top{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:4px}",
    ".step-top h2{margin:0}",
    ".arr-tag{margin-left:auto;font-size:13px;font-weight:700;border-radius:999px;padding:4px 11px;background:var(--chip);border:1px solid var(--border);color:var(--muted)}",
    ".arr-tag.ok{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok)}",
    ".arr-tag.warn{background:var(--warn-bg);border-color:var(--warn-bd);color:var(--warn)}",
    ".arr-tag.run{background:var(--info-bg);border-color:var(--info-bd);color:var(--info)}",
    "#arrSyncPista{color:var(--warn);font-weight:600}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Eventos ----------------------------- */
function arrMontarEventos() {
  const btn = $("arrPreparar");
  if (btn && !btn.__arrEvento) { btn.__arrEvento = true; btn.addEventListener("click", arrActualizar); }
  const abrir = $("btnAbrirArchivo");
  if (abrir && !abrir.__arrEvento) { abrir.__arrEvento = true; abrir.addEventListener("click", arrAbrirArchivo); }
  const buscar = $("btnBuscarVault");
  if (buscar && !buscar.__arrEvento) { buscar.__arrEvento = true; buscar.addEventListener("click", arrPulsarBuscarVault); }
  const vista = $("view-inicio");
  if (vista && !vista.__arrEvento) {
    vista.__arrEvento = true;
    vista.addEventListener("click", e => {
      if (e.target.closest(".arr-olvidar-todo")) { e.preventDefault(); arrOlvidarTodo(); return; }
      const acc = e.target.closest("[data-accion]");
      if (acc) {
        e.preventDefault();
        const que = acc.getAttribute("data-accion");
        if (que === "fechas" && typeof irAFechasSinPrecio === "function") irAFechasSinPrecio();
        else if (que === "catalogo") arrIrAlCatalogo();
        else if (que === "revision") location.hash = "#revision";
        else if (que === "cuadre") cuadreIrAAvisos();
        return;
      }
      const a = e.target.closest("[data-ir]");
      if (!a) return;
      e.preventDefault();
      arrBajarA(a.getAttribute("data-ir"));
    });
  }
  arrMontarCamposConfig();
}

/* ----------------------------- Hooks no invasivos ----------------------------- */
(function montarHooksArranque() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // Antes que nada: la dirección con la que se abre la página (p. ej. un
  // marcador antiguo a #clasificacion) ya apunta a la vista correcta cuando
  // js/13 enrute en DOMContentLoaded.
  const inicial = arrNormalizarHash();
  if (inicial) document.addEventListener("DOMContentLoaded", () => arrBajarA(inicial.ancla));
  // Este oyente se registra antes que el de js/13 (que lo hace en
  // DOMContentLoaded), así que corre primero y routing() ya lee el destino.
  window.addEventListener("hashchange", () => {
    const a = arrNormalizarHash();
    if (a) arrBajarA(a.ancla);
    if ((location.hash || "").slice(1) === "inicio") arrPintarSeguro();
  });

  // `despues`: lo que hace falta además de repintar cuando una asíncrona termina.
  function envolver(nombre, despues) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__arrEnvuelta) return;
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      arrPintarSeguro();
      // Las asíncronas (autoGuardarCache) se repintan también al terminar.
      if (resultado && typeof resultado.then === "function") resultado.then(() => {
        if (despues) despues();
        arrPintarSeguro();
      }, () => {});
      else if (despues) despues();
      return resultado;
    };
    envoltura.__arrEnvuelta = true;
    window[nombre] = envoltura;
  }
  ["renderPanel", "actualizarChipEstado", "ejecutarClasificacion", "pintarRequisitosClasificacion",
   "volcarConfigAFormulario", "setBotonesSync", "setDot"].forEach(n => envolver(n));
  // Cada cambio de tu archivo se guarda en este navegador (js/05).
  envolver("marcarCacheDirty", () => autoGuardarCache());

  window.addEventListener("storage", arrAlCambiarAlmacen);
  arrInyectarEstilos();
  arrMontarEventos();
  arrPintarSeguro(); // el DOM ya existe: los scripts van al final del <body>
})();
