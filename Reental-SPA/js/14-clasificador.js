/* =====================================================================
   REENTAL SPA · js/14-clasificador.js
   Pipeline de clasificacion de los movimientos.
   La verificacion de canjes se muestra en la tarjeta de resultados.
   Las stablecoins conocidas (USDT/USDC) se tratan de forma identica en
   todas las reglas de clasificacion.
   Resolucion, validacion y aplicacion del bloque pagos_diferidos.
   aplicarPagosDiferidos va en el pipeline tras la ordenacion y antes de
   aplicarAjustesUsuario; con el bloque vacio no cambia nada.
   Notas con el formato de las cifras de referencia: floats con pyStr
   ("100.0"), texto «en stablecoin» del pago conjunto ambiguo y sin
   espacios sobrantes en «compra on-chain».
   Modo SILENCIOSO de ejecutarClasificacion/descubrimientoAntesDeClasificar
   para la clasificacion automatica de la Puesta en marcha (js/19): sin
   avisos flotantes (salvo errores; lo demas va al resumen unico) y, con
   `detalle: false`, una sola linea en el registro. Deja en
   state.ultimaClasificacion el resultado para ese resumen y devuelve true
   si clasifico. Sin opciones se comporta igual que siempre.
   Los rendimientos salen del CSV con o sin vault: reclamos (hashes de
   `claims`), integro_usdt / retencion_usdt / fecha_cobro en cada RENDIMIENTO,
   filas del CSV sin transferencia descargada y filas sin hash.
   Bloque spam_usuario de la cache, con las direcciones y los tokens que
   el usuario manda al spam desde Transacciones; lo que llega de esas
   direcciones y todo lo de esos tokens es spam (nunca una direccion o un
   token conocidos).
===================================================================== */

function walletConfig() {
  return normalizarDireccion((state.config && state.config.wallet) || "");
}
function vaultConfig() {
  return normalizarDireccion((state.config && state.config.vault) || "");
}
// La direccion del vault es OPCIONAL. Sin ella,
// vaultConfig() devuelve "" y NINGUNA direccion debe darse por suya: sin esta
// guarda, una direccion vacia (p. ej. el `to` de una creacion de contrato)
// coincidiria con "" y se tomaria por el vault. Con vault puesto equivale a
// la comparacion directa.
function esDelVault(addr) {
  const v = vaultConfig();
  return !!v && normalizarDireccion(addr) === v;
}
/* Envenenamiento de direcciones. true si addr no es la wallet ni el vault
   pero comparte con una de ellas los 3 primeros y los 3 ultimos caracteres
   hexadecimales (1 entre 16^6 por casualidad; pilla tambien los que copian
   4+3, 4+4, 5+5...). */
/* Nota de la regla 7 en un deposito de stablecoin sin explicar; los
   vinculos de pagos diferidos la quitan del cobro. */
const NOTA_VERIFICAR_ORIGEN = "verificar origen (venta P2P, bridge o exchange)";
const NOTA_SEMILLA_QUITADA = "dirección de la app que quitaste: comprobar";
/* Nota del resto que devuelve quien cobro una compra; js/18 la usa
   para nombrar la operacion. */
const NOTA_RESTO_DEVUELTO = "resto devuelto de la compra (ya descontado de su coste)";
/* Nota de los tokens de un inmueble que pasan entre tu wallet y tu vault. */
const NOTA_TRASPASO_INMUEBLE = "traspaso de tokens entre tus cuentas (siguen siendo tuyos)";
/* Nota del spam por una direccion que imita la tuya y de lo que
   mandaste al spam con «Toda la direccion» o «Todo el token»;
   js/18 las usa para decir el motivo del spam. */
const NOTA_IMITA_DIRECCION = "dirección que imita la tuya (envenenamiento de direcciones)";
const NOTA_SPAM_DIRECCION = "dirección mandada al spam por ti";
const NOTA_SPAM_TOKEN = "token mandado al spam por ti";
function imitaDireccionPropia(addr) {
  addr = normalizarDireccion(addr || "");
  const propias = [walletConfig(), vaultConfig()];
  if (addr.length !== 42 || propias.includes(addr)) return false;
  for (const propia of propias) {
    if (propia.length === 42 &&
        addr.slice(2, 5) === propia.slice(2, 5) && addr.slice(-3) === propia.slice(-3)) return true;
  }
  return false;
}

/* Un valor escrito dentro de una nota, con el formato fijo de las notas
   (las cifras de referencia lo comparan): los numeros siempre con parte
   decimal ("100.0", "15.0"; JS los concatenaria como enteros "100", "15"),
   null -> "None" y true/false -> "True"/"False". Limite: JSON.parse no
   distingue int de float, asi que un entero "100" del JSON sale "100.0".
   (Los nombres py* de este archivo y de js/21-22 vienen de cuando la app
   copiaba a un programa en Python; se dejan.) */
function pyStr(x) {
  if (x === null || x === undefined) return "None";
  if (typeof x === "boolean") return x ? "True" : "False";
  if (typeof x === "number" && Number.isFinite(x) && Number.isInteger(x) &&
      Math.abs(x) < 1e21) {
    return x.toFixed(1);
  }
  return String(x);
}
/* Cantidad de una nota, a la espanola y sin ceros de relleno
   ("100", "1.234,5"); lo que no es un numero sale con pyStr ("None"). */
function cantidadNota(x) {
  return (typeof x === "number" && Number.isFinite(x)) ? cantidadEs(x) : pyStr(x);
}

// En hora de España (el timestamp de la blockchain o la fecha con Z
// del archivo de Reental). La clave del reparto sigue en UTC: la llevan tus ajustes.
function fechaHoraRegistro(valor) {
  if (!valor) return null;
  const d = enHoraEspanola((valor instanceof Date) ? valor : aUtcNaive(valor));
  return d ? fmtFechaHora(d) : null;
}
function fechaHoraDeTx(tx) {
  return fechaHoraRegistro(tx.timeStamp);
}
/* Cada registro de la blockchain lleva su instante
   en UTC ('instante'), para ordenar bien la hora repetida de octubre
   (fechaParaOrdenar, js/02). Solo en hora española: en UTC (las pruebas
   de cifras de referencia) la fecha ya lo es. */
function anotarInstantes(cache, registros) {
  if (ZONA_FECHAS === "UTC") return;
  const instantes = new Map();
  for (const serie of Object.values((cache && cache.transacciones) || {})) {
    for (const tx of Array.isArray(serie) ? serie : []) {
      if (tx && tx.hash) instantes.set(normalizarDireccion(tx.hash), tx.timeStamp);
    }
  }
  for (const r of registros) {
    const d = aUtcNaive(instantes.get(normalizarDireccion(r.hash || "")));
    if (d && fmtFechaHora(enHoraEspanola(d)) === r.fecha) r.instante = fmtFechaHora(d);
  }
}

function inmueblesConfirmadosCache(cache) {
  const confirmadas = {};
  for (const [addr, entrada] of Object.entries(cache.catalogo_propiedades || {})) {
    if (estadoCatalogo(entrada) !== "CONFIRMADA") continue;
    confirmadas[normalizarDireccion(addr)] = entrada;
  }
  return confirmadas;
}

/* Los tokens con dudas (CANDIDATA), normalizados, sin los que mandaste
   enteros al spam («Todo el token» en 📒 o «Descartar» en el catálogo):
   esos ya son spam y no cuentan como duda. Salvo si además es un
   contrato que la app reconoce: la regla del spam no le alcanza (sigue
   a la vista, con dudas). */
function dudasCatalogoCache(cache) {
  const spam = apartadosCache(cache, "tokens");
  const aprendidos = new Set(Object.values(cache.contratos_aprendidos || {}).flatMap(b => Object.keys(b || {})).map(normalizarDireccion));
  return new Set(Object.entries(cache.catalogo_propiedades || {})
    .filter(([, e]) => estadoCatalogo(e) === "CANDIDATA").map(([a]) => normalizarDireccion(a))
    .filter(a => !spam.has(a) || aprendidos.has(a)));
}

/* STABLECOINS (USDT+USDC) cuentan como conocidos. */
function contratosConocidosCache(cache, inmuebles) {
  const conocidos = new Set([walletConfig(), USDT, RNT, BURN, ...STABLECOINS]);
  if (vaultConfig()) conocidos.add(vaultConfig()); // vault opcional (nunca "")
  for (const bloque of Object.values(cache.contratos_aprendidos || {})) {
    for (const addr of Object.keys(bloque || {})) {
      conocidos.add(normalizarDireccion(addr));
    }
  }
  for (const addr of Object.keys(inmuebles || {})) conocidos.add(addr);
  return conocidos;
}

function construirContexto(cache) {
  const roles = {};
  for (const [rol, bloque] of Object.entries(cache.contratos_aprendidos || {})) {
    for (const addr of Object.keys(bloque || {})) {
      roles[normalizarDireccion(addr)] = rol;
    }
  }
  const inmuebles = inmueblesConfirmadosCache(cache);
  // Un Map, no un objeto: un inmueble «constructor» chocaria con lo que
  // hereda un objeto normal.
  const nombreAContrato = new Map();
  for (const [addr, entrada] of Object.entries(inmuebles)) {
    const nombre = (entrada && (entrada.nombre_reental || entrada.nombre_etherscan)) || "";
    const clave = normalizarNombreInmueble(nombre);
    if (clave) {
      nombreAContrato.set(clave, nombreAContrato.has(clave) ? null : addr);
    }
  }
  const descartadas = new Set();
  for (const [addr, e] of Object.entries(cache.catalogo_propiedades || {})) {
    if (estadoCatalogo(e) === "DESCARTADA") {
      descartadas.add(addr);
    }
  }
  return {
    roles,
    inmuebles,
    nombreAContrato,
    descartadas,
    conocidos: contratosConocidosCache(cache, inmuebles),
    spamDirecciones: apartadosCache(cache, "direcciones"),
    spamTokens: apartadosCache(cache, "tokens"),
  };
}

/* Las direcciones o los tokens
   que el usuario mando al spam desde Transacciones («Toda la direccion»,
   «Todo el token»), normalizados. Viven en su propio bloque de la cache,
   spam_usuario = { direcciones: { dir: {...} }, tokens: { contrato: {...} } };
   sin bloque (o mal formado), ninguno. */
function apartadosCache(cache, tipo) {
  const parte = pdEsObjeto(cache.spam_usuario) ? cache.spam_usuario[tipo] : null;
  if (!pdEsObjeto(parte)) return new Set();
  return new Set(Object.keys(parte).map(a => normalizarDireccion(a)));
}

function clasificarDireccion(addr, contexto) {
  addr = normalizarDireccion(addr);
  if (addr && (addr === walletConfig() || esDelVault(addr))) return "PROPIA";
  if (addr === BURN) return "BURN";
  const rol = contexto.roles[addr];
  if (rol === "DISTRIBUIDOR") return "DISTRIBUIDOR";
  if (rol === "SETTLEMENT") return "SETTLEMENT";
  if (addr in contexto.inmuebles) return "INMUEBLE";
  if (contexto.conocidos.has(addr)) return "CONOCIDA";
  return "DESCONOCIDA";
}

function nombreInmueble(contrato, contexto) {
  const entrada = contexto.inmuebles[normalizarDireccion(contrato || "")] || {};
  return entrada.nombre_reental || entrada.nombre_etherscan || null;
}

function transfersUnificadosClasificacion(cache) {
  const vistos = new Set();
  const transfers = [];
  for (const serie of ["wallet_tokens", "vault_tokens"]) {
    for (const tx of ((cache.transacciones || {})[serie] || [])) {
      const clave = [
        normalizarDireccion(tx.hash || ""),
        normalizarDireccion(tx.contractAddress || ""),
        normalizarDireccion(tx.from || ""),
        normalizarDireccion(tx.to || ""),
        String(tx.value !== undefined && tx.value !== null ? tx.value : ""),
      ].join("|");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      transfers.push(tx);
    }
  }
  transfers.sort((a, b) =>
    (parseInt(a.timeStamp, 10) || 0) - (parseInt(b.timeStamp, 10) || 0) ||
    cmpTexto(String(a.hash || ""), String(b.hash || "")));
  return transfers;
}

function movimientosPol(cache) {
  const wallet = walletConfig();
  const legs = new Map();
  const vistos = new Set();
  for (const serie of ["wallet_normales", "wallet_internas"]) {
    for (const tx of ((cache.transacciones || {})[serie] || [])) {
      const valor = enteroAUnidades(tx.value, 18);
      if (!valor || valor <= 0 || tx.isError === "1") continue;
      const origen = normalizarDireccion(tx.from || "");
      const destino = normalizarDireccion(tx.to || "");
      if (origen !== wallet && destino !== wallet) continue;
      const h = normalizarDireccion(tx.hash || "");
      const clave = [h, serie, origen, destino,
        String(tx.value !== undefined && tx.value !== null ? tx.value : "")].join("|");
      if (vistos.has(clave)) continue;
      vistos.add(clave);
      if (!legs.has(h)) legs.set(h, []);
      legs.get(h).push(tx);
    }
  }
  return legs;
}

class Diario {
  constructor() {
    this.registros = [];
    this._contador = {};
  }
  // Un rendimiento del CSV trae la clave de su fila (campos.clave_base,
  // csv::...), tenga hash o no.
  emitir(hash_, contrato, categoria, subcategoria, campos = {}) {
    const base = campos.clave_base || claveCompuesta(hash_, contrato || "");
    const n = (this._contador[base] || 0) + 1;
    this._contador[base] = n;
    const registro = {
      clave: n === 1 ? base : base + "::" + n,
      fecha: campos.fecha !== undefined ? campos.fecha : null,
      hash: normalizarDireccion(hash_),
      contrato: normalizarDireccion(contrato || ""),
      token: campos.token !== undefined ? campos.token : null,
      simbolo: campos.simbolo !== undefined ? campos.simbolo : null,
      cantidad: campos.cantidad !== undefined ? campos.cantidad : null,
      categoria: categoria,
      subcategoria: subcategoria,
      inmueble: campos.inmueble !== undefined ? campos.inmueble : null,
      periodo_fiscal: campos.periodo_fiscal !== undefined ? campos.periodo_fiscal : null,
      importe_usdt: campos.importe_usdt !== undefined ? campos.importe_usdt : null,
      coste_eur: campos.coste_eur !== undefined ? campos.coste_eur : null,
      via_compra: campos.via_compra !== undefined ? campos.via_compra : null,
      origen: normalizarDireccion(campos.origen || ""),
      destino: normalizarDireccion(campos.destino || ""),
      fuente: campos.fuente || "ONCHAIN",
      nota: campos.nota || "",
      // Una compra o una venta sin cantidad (decimales que
      // no se pueden leer) siempre queda a revisar.
      revisar: !!campos.revisar || ((campos.cantidad === undefined || campos.cantidad === null) &&
        (categoria === "COMPRA" || categoria === "VENTA")),
    };
    this.registros.push(registro);
    return registro;
  }
}

/* Stablecoins conocidas (USDT/USDC).
   Regla 2: el CSV manda. Un registro RENDIMIENTO por cada fila del CSV del
   hash (reinversion o reclamo), con el importe del CSV. Los transfers de
   stablecoin cuyo importe casa con una fila quedan consumidos (ninguna
   otra regla los toca).
   Una fila da un solo registro aunque traiga varios hashes (reinvertida o
   reclamada en varias veces): se emite en el primero y queda a revisar,
   porque su importe no casa con ninguna transferencia suelta.
   filasEmitidas: lineas del CSV ya emitidas en hashes anteriores. */
function regla2Rendimientos(h, filas, txs, consumidos, diario, contexto,
                          filasEmitidas) {
  const legs = [];
  txs.forEach((tx, i) => {
    if (consumidos.has(i)) return;
    // Stablecoin (USDT o USDC) que entra en la wallet o el vault.
    if (STABLECOINS.has(normalizarDireccion(tx.contractAddress || "")) &&
        clasificarDireccion(tx.to || "", contexto) === "PROPIA") {
      legs.push([i, tx]);
    }
  });
  for (const fila of filas) {
    if (filasEmitidas.has(fila.linea_csv)) continue;
    filasEmitidas.add(fila.linea_csv);
    /* pdRedondear6 y no red6, para redondear como las cifras de
       referencia (4629,9248275 -> 4629,924827). */
    const objetivo = pdRedondear6(fila.importe);
    // `|| -1`: un transfer de valor 0 no casa.
    const k = legs.findIndex(par => pdRedondear6(cantidadTx(par[1]) || -1) === objetivo);
    if (k >= 0) {
      const leg = legs.splice(k, 1)[0];
      consumidos.add(leg[0]);
      emitirRendimientoCsv(h, fila, leg[1], "", false, diario, contexto);
    } else {
      emitirRendimientoCsv(h, fila, null,
        "importe del archivo de Reental no localizado en los transfers del hash",
        true, diario, contexto);
    }
  }
}

/* Filas del CSV con hash que no han dado registro porque ninguna
   transferencia de token de su hash esta descargada. Es lo normal sin
   vault: el hash de cada reinversion solo esta en la transaccion normal de
   la wallet que la lanzo, sin transferencia de token. Se emiten desde el
   CSV con su hash real (el primero de la fila), en el orden del CSV, igual
   que las emitiria la regla 2. Las filas sin ningun hash las emite
   rendimientosSinHash.
   El vault es el contraste: con vault, lo descargado
   deberia traer la transferencia, asi que su falta es una discrepancia y
   el registro queda a revisar; sin vault no hay con que contrastarlo y
   solo lleva la nota. */
/* Trozos de las notas de los descuadres entre el archivo de Reental y la
   blockchain: el aviso de 🚀 Puesta en marcha (js/19) los busca
   en los registros. Las notas se escriben enteras más abajo (las pruebas
   las comprueban letra a letra): si cambian, cambiar también esto. */
const NOTA_CSV_MAS_NUEVO = "puede que el archivo de Reental sea más nuevo que la cache";
const NOTA_RENDIMIENTO_HUERFANO = "rendimiento huérfano no cubierto por el archivo de Reental";
function rendimientosSinTransferencia(filasCsv, filasEmitidas, diario, contexto) {
  const hayVault = !!vaultConfig();
  let nota = "sin transferencia descargada para este hash: importe tomado del " +
             "archivo de Reental";
  if (hayVault) {
    nota += "; con el vault configurado la transferencia debería estar " +
            "descargada: comprobar el hash en Polygonscan o volver a " +
            "descargar (puede que el archivo de Reental sea más nuevo que la cache)";
  } else {
    nota += " (sin vault no hay con qué contrastarlo)";
  }
  for (const fila of filasCsv) {
    if (filasEmitidas.has(fila.linea_csv) || !fila.hashes.length) continue;
    filasEmitidas.add(fila.linea_csv);
    emitirRendimientoCsv(fila.hashes[0], fila, null, nota, hayVault, diario, contexto);
  }
}

/* Clave base del registro de una fila del CSV:
   csv::<inmueble y periodo (columna dividend)>::<fecha del reparto>, en
   minusculas. Sale solo de la fila: no usar hash::contrato::n, que cambia
   si Reental anota tarde el hash, cambia el orden de las filas o el
   inmueble de contrato, y el ajuste o la nota del usuario se perderian o
   caerian en otro rendimiento.
   No se inventa ningun hash: el campo hash es el de la fila (o vacio). */
function claveRendimientoCsv(fila) {
  return "csv::" + String(fila.periodo_fiscal || "").trim().toLowerCase() +
         "::" + (fmtFecha(fila.fecha_reparto) || "sin-fecha");
}
/* Clave de cada fila del CSV ({linea_csv: clave}): la de claveRendimientoCsv
   y, si dos filas la repiten (una fila repetida, o dos wallets), ::2, ::3...
   en el orden del archivo. */
function clavesRendimientosCsv(filasCsv) {
  const vistas = {}, claves = {};
  for (const fila of filasCsv || []) {
    const base = claveRendimientoCsv(fila);
    vistas[base] = (vistas[base] || 0) + 1;
    claves[fila.linea_csv] = vistas[base] === 1 ? base : base + "::" + vistas[base];
  }
  return claves;
}

/* Filas del CSV sin ningun hash (ni en reinvests ni en claims), en el
   orden del CSV. Lo normal es un reparto pendiente: Reental lo repartio
   pero aun no se ha reclamado ni reinvertido. Se declara en el ano del
   reparto con su integro y retencion 0 (subcategoria RCM_PENDIENTE). Una
   fila sin hash pero con algo reinvertido, reclamado o retenido no deberia
   existir: sale igual, a revisar. Una fila sin nada repartido no da
   registro. */
function rendimientosSinHash(filasCsv, filasEmitidas, diario, contexto) {
  for (const fila of filasCsv) {
    if (filasEmitidas.has(fila.linea_csv) || fila.hashes.length) continue;
    const movido = fila.importe > 0 || fila.retained > 0;
    if (!movido && fila.distributed <= 0) continue;
    filasEmitidas.add(fila.linea_csv);
    const nota = movido
      ? "fila del archivo de Reental con importe y sin ningún " +
        "hash: comprobar en Reental donde fue ese dinero"
      : "rendimiento pendiente (ni reclamado ni reinvertido): " +
        "sin hash, datos tomados del archivo de Reental";
    emitirRendimientoCsv("", fila, null, nota, movido, diario, contexto);
  }
}

/* Emite el registro RENDIMIENTO de una fila del CSV en el hash h (vacio si
   la fila no trae ninguno), con la clave de su fila (contexto.clavesCsv).
   txCobro: la transferencia casada con la fila (o null); de ella salen
   origen, destino y fecha_cobro.
   Subcategoria: RCM_REINVERTIDO = reinvertido; RCM_RECLAMADO = reclamado;
   RCM_PENDIENTE = ni reinvertido ni reclamado (se declara igual);
   RCM_MIXTO = mixto (parte y parte), a revisar y sin declarar.
   Cada registro guarda tambien, fuera de la huella, el integro de su fila
   (integro_usdt = distributed), la retencion de Reental (retencion_usdt =
   retained) y la fecha de la transferencia casada (fecha_cobro): la
   retencion se lee del CSV, nunca se calcula. */
function emitirRendimientoCsv(h, fila, txCobro, nota, revisar, diario, contexto) {
  let origen = null, destino = null, fechaCobro = null;
  if (txCobro) {
    origen = txCobro.from;
    destino = txCobro.to;
    fechaCobro = fechaHoraDeTx(txCobro);
  }
  if (fila.hashes.length > 1) {
    nota = (nota ? nota + "; " : "") +
      "la fila " + fila.linea_csv + " del archivo de Reental trae " + fila.hashes.length +
      " hashes (reinvertida o reclamada en varias veces): un solo " +
      "registro, comprobar las transferencias de los demás hashes";
    revisar = true;
  }
  if (walletConfig() && fila.wallet && fila.wallet !== walletConfig() && fila.wallet !== vaultConfig()) {
    // El archivo trae una fila por reparto y wallet; una que
    // no es la tuya no se contrasta con tu blockchain.
    nota = (nota ? nota + "; " : "") + "fila de otra wallet (" + fila.wallet +
      "): comprobar que es tuya; no se contrasta con la blockchain de tu wallet";
    revisar = true;
  }
  if (!fila.fecha_reparto) {
    // Sin fecha no se sabe en qué año se declara.
    nota = (nota ? nota + "; " : "") +
      "la fila no trae la fecha del reparto: no se sabe en qué año se declara";
    revisar = true;
  }
  const reinvested = Number(fila.reinvested);
  const claimed = Number(fila.claimed);
  let subcategoria;
  if (reinvested > 0 && claimed === 0) {
    subcategoria = "RCM_REINVERTIDO";
  } else if (claimed > 0 && reinvested === 0) {
    subcategoria = "RCM_RECLAMADO";
  } else if (claimed === 0 && reinvested === 0) {
    subcategoria = "RCM_PENDIENTE";
  } else {
    subcategoria = "RCM_MIXTO";
    nota = (nota ? nota + "; " : "") + "rendimiento mixto reinvertido/reclamado";
    revisar = true;
  }
  const contratoProp = contexto.nombreAContrato.get(normalizarNombreInmueble(fila.inmueble));
  const registro = diario.emitir(h, contratoProp || USDT, "RENDIMIENTO", subcategoria, {
    fecha: fechaHoraRegistro(fila.fecha_reparto),
    token: fila.inmueble,
    cantidad: null,
    inmueble: fila.inmueble,
    periodo_fiscal: fila.periodo_fiscal,
    importe_usdt: fila.importe,
    origen: origen,
    destino: destino,
    fuente: "CSV_REENTAL",
    nota: nota,
    revisar: revisar,
    clave_base: contexto.clavesCsv[fila.linea_csv],
  });
  registro.integro_usdt = fila.distributed;
  registro.retencion_usdt = fila.retained;
  registro.fecha_cobro = fechaCobro;
}

/* Un cobro (el rendimiento huerfano de la regla 3 o 3b) de un
   reparto que el archivo de Reental aun trae como pendiente. El aviso de
   🚀 Puesta en marcha (js/19) busca este trozo. */
const NOTA_PENDIENTE_COBRADO = "que el archivo de Reental trae como pendiente";
/* Un archivo de Reental bajado antes de que Reental anote una reinversion
   o un reclamo trae la fila como pendiente y su cobro llega como
   rendimiento huerfano: contaria dos veces. Cada huerfano (por fecha) se
   cruza con un pendiente anterior o del mismo dia cuyo integro es lo que
   llego: ese cobro pasa a REVISAR (ya se declara con la fila) y el
   pendiente lo dice en su nota. Si ninguno casa por importe, los dos
   quedan a revisar con una nota. */
function pendientesYaCobrados(registros) {
  const orden = (a, b) => cmpTexto(a.fecha || "", b.fecha || "") || cmpTexto(a.clave, b.clave);
  const pendientes = registros.filter(r => r.categoria === "RENDIMIENTO" &&
    r.fuente === "CSV_REENTAL" && r.subcategoria === "RCM_PENDIENTE").sort(orden);
  const huerfanos = registros.filter(r => r.categoria === "RENDIMIENTO" &&
    r.fuente !== "CSV_REENTAL").sort(orden);
  const anadir = (r, texto) => { r.nota = (r.nota ? r.nota + "; " : "") + texto; };
  for (const hu of huerfanos) {
    const anteriores = pendientes.filter(p => p.fecha && hu.fecha && p.fecha <= hu.fecha);
    if (!anteriores.length) continue;
    const objetivo = pdRedondear6(hu.importe_usdt || -1);
    const igual = anteriores.find(p => pdRedondear6(p.integro_usdt || 0) === objetivo);
    if (igual) {
      pendientes.splice(pendientes.indexOf(igual), 1);
      hu.categoria = "REVISAR";
      hu.subcategoria = "PENDIENTE";
      hu.revisar = true;
      hu.nota = "cobro del rendimiento " + igual.periodo_fiscal + " " + NOTA_PENDIENTE_COBRADO +
        ": ya se declara con la fila; carga un archivo de Reental más nuevo";
      anadir(igual, "ya cobrado el " + hu.fecha.slice(0, 10) + " (hash " + hu.hash +
        "): carga un archivo de Reental más nuevo");
      continue;
    }
    anadir(hu, "puede ser un rendimiento " + NOTA_PENDIENTE_COBRADO + " (" +
      anteriores.map(p => p.periodo_fiscal).join(", ") + "): comprobarlo para no declararlo dos veces");
    for (const p of anteriores) {
      if (!p.revisar) {
        p.revisar = true;
        anadir(p, "puede que ya esté cobrado: el " + hu.fecha.slice(0, 10) +
          " llegó un rendimiento que no está en el archivo de Reental; carga uno más nuevo");
      }
    }
  }
}

/* Lo que llega de una
   direccion que imita la tuya, o un movimiento de valor cero con ella, no
   entra en las correlaciones (venta, compra...): lo trata
   clasificarIndividual como spam. Asi un transferFrom de 0 de un
   inmueble tuyo hacia la imitadora no sale como una venta por decidir. */
function esSenuelo(tx, contexto) {
  const origen = tx.from || "", destino = tx.to || "";
  if (clasificarDireccion(destino, contexto) === "PROPIA" && imitaDireccionPropia(origen)) return true;
  return cantidadTx(tx) === 0 && (imitaDireccionPropia(origen) || imitaDireccionPropia(destino));
}

/* Lo cobrado por una
   venta en todas las patas de stablecoin del hash (USD nominal) y si queda
   a revisar (alguna pata no se puede leer). */
function importePatas(patas) {
  const cantidades = patas.map(([, tx]) => cantidadTx(tx));
  const revisar = cantidades.some(c => c === null || c === undefined);
  return { importe: cantidades.reduce((s, c) => s + (c || 0), 0), revisar };
}
function notaPatas(patas, revisar) {
  if (revisar) return "; algún pago del hash no se puede leer: comprobar el importe";
  if (patas.length > 1) return "; cobrada en " + patas.length + " pagos en el hash";
  return "";
}
/* Varios inmuebles salen en un hash con un pago conjunto (el primero no
   se queda todo el pago). Nada se reparte solo: todas a revisar,
   sin importe; el pago queda dentro de ellas. */
function ventasPagoConjunto(h, salidas, patas, consumidos, diario, contexto) {
  const { importe } = importePatas(patas);
  for (const [i] of patas) consumidos.add(i);
  for (const [iOut, txOut] of salidas) {
    consumidos.add(iOut);
    diario.emitir(h, txOut.contractAddress, "VENTA", "GPP_INMUEBLE", {
      fecha: fechaHoraDeTx(txOut), token: txOut.tokenName, simbolo: txOut.tokenSymbol,
      cantidad: cantidadTx(txOut), inmueble: nombreInmueble(txOut.contractAddress, contexto),
      origen: txOut.from, destino: txOut.to,
      nota: "varios inmuebles con pago conjunto de " + cantidadNota(importe) +
        " en stablecoin en el hash: repartir el importe manualmente",
      revisar: true,
    });
  }
}

/* Stablecoins conocidas en settlement_legs y usdtEntrante. */
function correlacionarVentas(h, txs, consumidos, diario, contexto) {
  const pendientes = filtro => {
    const out = [];
    txs.forEach((tx, i) => {
      if (!consumidos.has(i) && filtro(tx)) out.push([i, tx]);
    });
    return out;
  };
  const esInmueble = tx =>
    normalizarDireccion(tx.contractAddress || "") in contexto.inmuebles;
  let burns = pendientes(tx =>
    esInmueble(tx) &&
    normalizarDireccion(tx.to || "") === BURN &&
    clasificarDireccion(tx.from || "", contexto) === "PROPIA");
  // Lo que viene de otra cuenta tuya no es una recepcion.
  let recepciones = pendientes(tx =>
    esInmueble(tx) &&
    clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
    clasificarDireccion(tx.from || "", contexto) !== "PROPIA");

  for (const [iBurn, txBurn] of [...burns]) {
    if (!recepciones.length) break;
    const cantidadBurn = cantidadTx(txBurn);
    const par = recepciones.find(p => cantidadTx(p[1]) === cantidadBurn) || recepciones[0];
    const [iRec, txRec] = par;
    recepciones = recepciones.filter(p => p !== par);
    burns = burns.filter(b => b[0] !== iBurn);
    consumidos.add(iBurn);
    consumidos.add(iRec);
    const propBurn = nombreInmueble(txBurn.contractAddress, contexto);
    const propRec = nombreInmueble(txRec.contractAddress, contexto);
    diario.emitir(h, txBurn.contractAddress, "VENTA", "GPP_INMUEBLE", {
      fecha: fechaHoraDeTx(txBurn), token: txBurn.tokenName, simbolo: txBurn.tokenSymbol,
      cantidad: cantidadBurn, inmueble: propBurn, origen: txBurn.from, destino: BURN,
      nota: "reembolso de capital sin rendimiento (canje por " + propRec + ")",
    });
    diario.emitir(h, txRec.contractAddress, "COMPRA", "COSTE_BASE", {
      fecha: fechaHoraDeTx(txRec), token: txRec.tokenName, simbolo: txRec.tokenSymbol,
      cantidad: cantidadTx(txRec), inmueble: propRec, via_compra: "CANJE",
      origen: txRec.from, destino: txRec.to,
      nota: "recibido en canje por el burn de " + propBurn,
    });
  }

  // Una dirección solo tiene un rol; si la que reparte los
  // rendimientos paga también una liquidación, en un hash con burn y fuera
  // del archivo de Reental su stablecoin es el precio (no un rendimiento
  // huérfano con la venta sin contraprestación).
  const pagadores = (!burns.length || (contexto.hashesCsv && contexto.hashesCsv[h]))
    ? ["SETTLEMENT"] : ["SETTLEMENT", "DISTRIBUIDOR"];
  let settlementLegs = pendientes(tx =>
    STABLECOINS.has(normalizarDireccion(tx.contractAddress || "")) &&
    clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
    pagadores.includes(clasificarDireccion(tx.from || "", contexto)));
  // Con un solo inmueble, todos los pagos del hash son su precio; con
  // varios y un pago conjunto, nada se reparte solo: todas a revisar,
  // como las compras.
  if (settlementLegs.length && burns.length > 1) {
    ventasPagoConjunto(h, burns, settlementLegs, consumidos, diario, contexto);
    burns = [];
  }
  for (const [iBurn, txBurn] of [...burns]) {
    const inmueble = nombreInmueble(txBurn.contractAddress, contexto);
    if (settlementLegs.length) {
      const { importe, revisar } = importePatas(settlementLegs);
      consumidos.add(iBurn);
      for (const [i] of settlementLegs) consumidos.add(i);
      const txLeg = settlementLegs[0][1];
      diario.emitir(h, txBurn.contractAddress, "VENTA", "GPP_INMUEBLE", {
        fecha: fechaHoraDeTx(txBurn), token: txBurn.tokenName, simbolo: txBurn.tokenSymbol,
        cantidad: cantidadTx(txBurn), inmueble: inmueble, importe_usdt: importe,
        origen: txBurn.from, destino: BURN,
        nota: "liquidación vía settlement " + normalizarDireccion(txLeg.from) +
          notaPatas(settlementLegs, revisar),
        revisar: revisar,
      });
      settlementLegs.length = 0;
    } else {
      consumidos.add(iBurn);
      diario.emitir(h, txBurn.contractAddress, "VENTA", "GPP_INMUEBLE", {
        fecha: fechaHoraDeTx(txBurn), token: txBurn.tokenName, simbolo: txBurn.tokenSymbol,
        cantidad: cantidadTx(txBurn), inmueble: inmueble, origen: txBurn.from, destino: BURN,
        nota: "burn sin contraprestación localizada en el hash",
        revisar: true,
      });
    }
    burns = burns.filter(b => b[0] !== iBurn);
  }

  let salidas = pendientes(tx =>
    esInmueble(tx) &&
    clasificarDireccion(tx.from || "", contexto) === "PROPIA" &&
    clasificarDireccion(tx.to || "", contexto) === "DESCONOCIDA");
  const usdtEntrante = pendientes(tx =>
    STABLECOINS.has(normalizarDireccion(tx.contractAddress || "")) &&
    clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
    clasificarDireccion(tx.from || "", contexto) === "DESCONOCIDA");
  if (usdtEntrante.length && salidas.length > 1) {
    ventasPagoConjunto(h, salidas, usdtEntrante, consumidos, diario, contexto);
    salidas = [];
  }
  for (const [iOut, txOut] of salidas) {
    const inmueble = nombreInmueble(txOut.contractAddress, contexto);
    if (usdtEntrante.length) {
      const { importe, revisar } = importePatas(usdtEntrante);
      consumidos.add(iOut);
      for (const [i] of usdtEntrante) consumidos.add(i);
      diario.emitir(h, txOut.contractAddress, "VENTA", "GPP_INMUEBLE", {
        fecha: fechaHoraDeTx(txOut), token: txOut.tokenName, simbolo: txOut.tokenSymbol,
        cantidad: cantidadTx(txOut), inmueble: inmueble, importe_usdt: importe,
        origen: txOut.from, destino: txOut.to,
        nota: "venta P2P a " + normalizarDireccion(txOut.to) + " (verificar contraparte)" +
          notaPatas(usdtEntrante, revisar),
        revisar: revisar,
      });
      usdtEntrante.length = 0;
    } else {
      consumidos.add(iOut);
      diario.emitir(h, txOut.contractAddress, "REVISAR", "PENDIENTE", {
        fecha: fechaHoraDeTx(txOut), token: txOut.tokenName, simbolo: txOut.tokenSymbol,
        cantidad: cantidadTx(txOut), inmueble: inmueble, origen: txOut.from, destino: txOut.to,
        nota: "envío de tokens de un inmueble sin contraprestación en el hash",
        revisar: true,
      });
    }
  }
}

/* stableOut acepta cualquier stablecoin conocida. */
function correlacionarCompras(h, txs, consumidos, diario, contexto, config) {
  const recepciones = [];
  txs.forEach((tx, i) => {
    if (!consumidos.has(i) &&
        normalizarDireccion(tx.contractAddress || "") in contexto.inmuebles &&
        clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
        // De tu wallet a tu vault no es una compra bancaria.
        clasificarDireccion(tx.from || "", contexto) !== "PROPIA") {
      recepciones.push([i, tx]);
    }
  });
  if (!recepciones.length) return;
  const stableOut = [];
  txs.forEach((tx, i) => {
    if (!consumidos.has(i) &&
        STABLECOINS.has(normalizarDireccion(tx.contractAddress || "")) &&
        clasificarDireccion(tx.from || "", contexto) === "PROPIA" &&
        clasificarDireccion(tx.to || "", contexto) !== "PROPIA" &&
        !((contexto.roles[normalizarDireccion(tx.to || "")] || "").startsWith("DEFI"))) {
      stableOut.push([i, tx]);
    }
  });
  let importeTotal = null;
  if (stableOut.length) {
    let suma = 0;
    for (const [, tx] of stableOut) suma += cantidadTx(tx) || 0;
    importeTotal = suma || null;
  }
  const desdeVault = stableOut.some(([, tx]) =>
    esDelVault(tx.from || ""));
  const ambiguo = recepciones.length > 1 && stableOut.length > 0;
  /* El resto de la misma stablecoin que devuelve quien
     cobro la compra, en el mismo hash, rebaja su coste (pagaste la
     diferencia) y no es un deposito. */
  let devueltos = [];
  if (importeTotal && !ambiguo) {
    const destinos = new Set(stableOut.map(([, tx]) => normalizarDireccion(tx.to || "")));
    const contratos = new Set(stableOut.map(([, tx]) => normalizarDireccion(tx.contractAddress || "")));
    txs.forEach((tx, i) => {
      if (!consumidos.has(i) &&
          contratos.has(normalizarDireccion(tx.contractAddress || "")) &&
          destinos.has(normalizarDireccion(tx.from || "")) &&
          clasificarDireccion(tx.to || "", contexto) === "PROPIA") {
        devueltos.push([i, tx]);
      }
    });
    let devuelto = 0;
    for (const [, tx] of devueltos) devuelto += cantidadTx(tx) || 0;
    if (devuelto > 0 && devuelto < importeTotal) importeTotal = pdRedondear6(importeTotal - devuelto);
    else devueltos = [];
  }
  for (const [iRec, txRec] of recepciones) {
    consumidos.add(iRec);
    const inmueble = nombreInmueble(txRec.contractAddress, contexto);
    const cantidad = cantidadTx(txRec);
    const comunes = {
      fecha: fechaHoraDeTx(txRec), token: txRec.tokenName, simbolo: txRec.tokenSymbol,
      cantidad: cantidad, inmueble: inmueble, origen: txRec.from, destino: txRec.to,
    };
    if (!stableOut.length) {
      const precio = Number(config.compra_bancaria_coste_eur_por_token);
      diario.emitir(h, txRec.contractAddress, "COMPRA", "COSTE_BASE", Object.assign({}, comunes, {
        via_compra: "BANCARIA",
        coste_eur: (cantidad !== null && cantidad !== undefined) ? cantidad * precio : null,
        /* El precio a la espanola ("100"). */
        nota: "compra externa detectada (sin stablecoin en el hash): " +
              cantidadNota(config.compra_bancaria_coste_eur_por_token) + " EUR/token, verificar",
      }));
    } else if (ambiguo) {
      diario.emitir(h, txRec.contractAddress, "COMPRA", "COSTE_BASE", Object.assign({}, comunes, {
        via_compra: desdeVault ? "VAULT" : "ONCHAIN",
        /* Texto fijo ("en stablecoin"); importe a la espanola. */
        nota: "varios inmuebles con pago conjunto de " + cantidadNota(importeTotal) +
              " en stablecoin en el hash: repartir el coste manualmente",
        revisar: true,
      }));
    } else {
      diario.emitir(h, txRec.contractAddress, "COMPRA", "COSTE_BASE", Object.assign({}, comunes, {
        via_compra: desdeVault ? "VAULT" : "ONCHAIN",
        importe_usdt: importeTotal,
        /* Sin espacio final ni doble. */
        nota: "compra on-chain" + (desdeVault ? " financiada con saldo del vault" : "") +
              (devueltos.length ? ", descontado el resto devuelto" : ""),
      }));
    }
  }
  for (const [iLeg] of stableOut) consumidos.add(iLeg);
  for (const [iDev, tx] of devueltos) {
    consumidos.add(iDev);
    diario.emitir(h, tx.contractAddress, "MOVIMIENTO", "NEUTRO", {
      fecha: fechaHoraDeTx(tx), token: tx.tokenName, simbolo: tx.tokenSymbol,
      cantidad: cantidadTx(tx), origen: tx.from, destino: tx.to,
      nota: NOTA_RESTO_DEVUELTO,
    });
  }
}

/* Permuta en un hash: lo entregado (sale) es VENTA GPP_SWAP y lo recibido
   (entra) COMPRA COSTE_BASE, los dos por `importe` (USD). `cantidadSale`:
   lo entregado sin el resto devuelto, si lo hubo. */
function emitirPermuta(h, diario, sale, entra, importe, etiqueta, cantidadSale = null) {
  for (const [tx, cat, sub, papel] of [[sale, "VENTA", "GPP_SWAP", "entregado"],
                                       [entra, "COMPRA", "COSTE_BASE", "recibido"]]) {
    diario.emitir(h, normalizarDireccion(tx.contractAddress || ""), cat, sub, {
      fecha: fechaHoraDeTx(tx), token: tx.tokenName, simbolo: tx.tokenSymbol,
      cantidad: tx === sale && cantidadSale !== null ? cantidadSale : cantidadTx(tx),
      importe_usdt: importe, origen: tx.from, destino: tx.to,
      nota: etiqueta + " (activo " + papel + ")",
    });
  }
}

function correlacionarDefi(h, txs, consumidos, diario, contexto) {
  const rolDe = (tx, campo) =>
    contexto.roles[normalizarDireccion(tx[campo] || "")] || "";
  const contraPool = tx =>
    rolDe(tx, "from") === "DEFI_POOL" || rolDe(tx, "to") === "DEFI_POOL";
  const pendientes = [];
  txs.forEach((tx, i) => { if (!consumidos.has(i)) pendientes.push([i, tx]); });

  const slpPool = pendientes.filter(([, tx]) =>
    contexto.roles[normalizarDireccion(tx.contractAddress || "")] === "DEFI_POOL" &&
    contraPool(tx));
  if (slpPool.length) {
    const entraSlp = slpPool.some(([, tx]) =>
      clasificarDireccion(tx.to || "", contexto) === "PROPIA");
    const nota = entraSlp
      ? "aportación de liquidez al pool"
      : "retirada de liquidez del pool";
    const slpIdx = new Set(slpPool.map(p => p[0]));
    const legs = pendientes.filter(([i, tx]) => {
      const c = normalizarDireccion(tx.contractAddress || "");
      return slpIdx.has(i) || ((c === RNT || STABLECOINS.has(c)) && contraPool(tx));
    });
    for (const [i, tx] of legs) {
      consumidos.add(i);
      diario.emitir(h, tx.contractAddress, "MOVIMIENTO", "NEUTRO", {
        fecha: fechaHoraDeTx(tx), token: tx.tokenName, simbolo: tx.tokenSymbol,
        cantidad: cantidadTx(tx), origen: tx.from, destino: tx.to, nota: nota,
      });
    }
    return;
  }

  const sale = pendientes.find(([, tx]) => {
    const c = normalizarDireccion(tx.contractAddress || "");
    return (c === RNT || STABLECOINS.has(c)) &&
           clasificarDireccion(tx.from || "", contexto) === "PROPIA" &&
           rolDe(tx, "to") === "DEFI_POOL";
  }) || null;
  if (!sale) return;
  const contratoSale = normalizarDireccion(sale[1].contractAddress || "");
  /* Lo recibido es de otro token; lo que vuelve del mismo token que se
     entregó es un resto devuelto (el pool puede devolver unos céntimos del
     USDT pagado: sin esto el swap entero quedaria como movimiento neutro,
     sin compra de RNT). */
  const vuelve = pendientes.filter(([, tx]) => {
    const c = normalizarDireccion(tx.contractAddress || "");
    return (c === RNT || STABLECOINS.has(c)) &&
           clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
           rolDe(tx, "from") === "DEFI_POOL";
  });
  const entra = vuelve.find(([, tx]) =>
    normalizarDireccion(tx.contractAddress || "") !== contratoSale) || null;
  if (!entra) return;
  let entregado = cantidadTx(sale[1]) || 0;
  let devueltos = vuelve.filter(([, tx]) =>
    normalizarDireccion(tx.contractAddress || "") === contratoSale);
  const devuelto = devueltos.reduce((s, [, tx]) => s + (cantidadTx(tx) || 0), 0);
  if (devuelto > 0 && devuelto < entregado) entregado = pdRedondear6(entregado - devuelto);
  else devueltos = [];
  /* La pata que sea stablecoin (USDT o USDC): la entregada si
     lo es; si no, la recibida. */
  const contravalor = STABLECOINS.has(contratoSale) ? entregado : cantidadTx(entra[1]);
  consumidos.add(sale[0]);
  consumidos.add(entra[0]);
  emitirPermuta(h, diario, sale[1], entra[1], contravalor,
                "swap " + pyStr(sale[1].tokenSymbol) + " -> " + pyStr(entra[1].tokenSymbol) + " contra el pool",
                devueltos.length ? entregado : null);
  for (const [iDev, tx] of devueltos) {
    consumidos.add(iDev);
    diario.emitir(h, tx.contractAddress, "MOVIMIENTO", "NEUTRO", {
      fecha: fechaHoraDeTx(tx), token: tx.tokenName, simbolo: tx.tokenSymbol,
      cantidad: cantidadTx(tx), origen: tx.from, destino: tx.to,
      nota: NOTA_RESTO_DEVUELTO,
    });
  }
}

/* Cambio
   de una stablecoin por otra en el mismo hash (p. ej. USDC -> USDT en
   Uniswap). Sale una de una direccion propia hacia X y de esa misma X
   vuelve otra distinta: permuta, como los swaps de POL y RNT (lo entregado,
   VENTA GPP_SWAP; lo recibido, COMPRA que abre lote). Valor de los dos: el
   mayor entre lo entregado y lo recibido (art. 37.1.h LIRPF). Solo con una
   pata de cada lado y nunca contra un contrato DeFi (una recompensa no es
   una permuta). */
function correlacionarCambioStable(h, txs, consumidos, diario, contexto) {
  const contratoDe = tx => normalizarDireccion(tx.contractAddress || "");
  const pendientes = [];
  txs.forEach((tx, i) => {
    if (!consumidos.has(i) && STABLECOINS.has(contratoDe(tx))) pendientes.push([i, tx]);
  });
  if (pendientes.length < 2) return;
  const salen = pendientes.filter(([, tx]) =>
    clasificarDireccion(tx.from || "", contexto) === "PROPIA" &&
    clasificarDireccion(tx.to || "", contexto) !== "PROPIA");
  const entran = pendientes.filter(([, tx]) =>
    clasificarDireccion(tx.to || "", contexto) === "PROPIA" &&
    clasificarDireccion(tx.from || "", contexto) !== "PROPIA");
  if (salen.length !== 1 || entran.length !== 1) return;
  const [iSale, sale] = salen[0];
  const [iEntra, entra] = entran[0];
  const contraparte = normalizarDireccion(sale.to || "");
  if (contratoDe(sale) === contratoDe(entra) ||
      contraparte !== normalizarDireccion(entra.from || "") ||
      (contexto.roles[contraparte] || "").startsWith("DEFI")) return;
  const cantSale = cantidadTx(sale);
  const cantEntra = cantidadTx(entra);
  if (!cantSale || !cantEntra) return;
  consumidos.add(iSale);
  consumidos.add(iEntra);
  emitirPermuta(h, diario, sale, entra, Math.max(cantSale, cantEntra),
                "swap " + pyStr(sale.tokenSymbol) + " -> " + pyStr(entra.tokenSymbol) + ": cambio de moneda (permuta)");
}

function correlacionarPol(h, legsPol, txs, consumidos, diario, contexto) {
  if (!legsPol.length) return;
  const wallet = walletConfig();
  // El POL entre tu wallet y tu vault sigue siendo tuyo:
  // traspaso neutro (no una venta con ganancia o pérdida y además una
  // entrada a revisar en el vault).
  const vault = vaultConfig();
  const internos = legsPol.filter(t => vault &&
    (normalizarDireccion(t.from || "") === vault || normalizarDireccion(t.to || "") === vault));
  for (const t of internos) {
    const alVault = esDelVault(t.to || "");
    diario.emitir(h, "pol", "MOVIMIENTO", "NEUTRO", {
      cantidad: enteroAUnidades(t.value, 18), fecha: fechaHoraDeTx(t), token: "POL", simbolo: "POL",
      origen: t.from, destino: t.to,
      nota: alVault ? "traspaso interno" : "traspaso interno vault -> wallet",
    });
  }
  legsPol = legsPol.filter(t => !internos.includes(t));
  const entradas = legsPol.filter(t => normalizarDireccion(t.to || "") === wallet);
  const salidas = legsPol.filter(t => normalizarDireccion(t.from || "") === wallet);
  let polIn = 0;
  let polOut = 0;
  for (const t of entradas) polIn += enteroAUnidades(t.value, 18) || 0;
  for (const t of salidas) polOut += enteroAUnidades(t.value, 18) || 0;
  /* Stablecoins conocidas (USDT/USDC) entrantes/salientes. */
  const stableIn = [];
  const stableOut = [];
  txs.forEach((tx, i) => {
    if (consumidos.has(i)) return;
    if (!STABLECOINS.has(normalizarDireccion(tx.contractAddress || ""))) return;
    const tipoTo = clasificarDireccion(tx.to || "", contexto);
    const tipoFrom = clasificarDireccion(tx.from || "", contexto);
    if (tipoTo === "PROPIA") stableIn.push([i, tx]);
    if (tipoFrom === "PROPIA" && tipoTo !== "PROPIA") stableOut.push([i, tx]);
  });
  // El POL que devuelve el router en el mismo hash rebaja lo entregado
  // (si no, la venta llevaria de más y lo devuelto saldria como un
  // depósito que pide coste), como el resto devuelto de una compra.
  let descontadoPol = "";
  if (polOut > 0 && stableIn.length && polIn > 0 && polIn < polOut) {
    polOut -= polIn;
    polIn = 0;
    descontadoPol = ", descontado el POL devuelto";
  }
  if (polOut > 0 && stableIn.length) {
    const importe = stableIn.reduce((a, [, tx]) => a + (cantidadTx(tx) || 0), 0);
    const txRef = salidas[0];
    const comunes = {
      fecha: fechaHoraDeTx(txRef), token: "POL", simbolo: "POL",
      origen: txRef.from, destino: txRef.to,
    };
    diario.emitir(h, "pol", "VENTA", "GPP_SWAP", Object.assign({}, comunes, {
      cantidad: polOut, importe_usdt: importe,
      nota: "swap POL -> stablecoin (activo entregado" + descontadoPol + ")",
    }));
    /* Esta pata va SIN origen/destino (quedan ""): la identidad 5-tupla
       del registro no debe cambiar, o los vinculos de pagos diferidos que
       la citan dejarian de resolverse. */
    diario.emitir(h, USDT, "COMPRA", "COSTE_BASE", {
      fecha: fechaHoraDeTx(txRef),
      cantidad: importe, importe_usdt: importe,
      token: "USDT", simbolo: "USDT",
      nota: "swap POL -> stablecoin (activo recibido)",
    });
    for (const [i] of stableIn) consumidos.add(i);
    polOut = 0;
  }
  if (polIn > 0 && stableOut.length) {
    let importe = stableOut.reduce((a, [, tx]) => a + (cantidadTx(tx) || 0), 0);
    // La misma stablecoin que devuelve quien la cobró, también.
    const destinos = new Set(stableOut.map(([, tx]) => normalizarDireccion(tx.to || "")));
    const contratos = new Set(stableOut.map(([, tx]) => normalizarDireccion(tx.contractAddress || "")));
    const devueltos = stableIn.filter(([, tx]) => destinos.has(normalizarDireccion(tx.from || "")) &&
      contratos.has(normalizarDireccion(tx.contractAddress || "")));
    const devuelto = devueltos.reduce((a, [, tx]) => a + (cantidadTx(tx) || 0), 0);
    let descontado = "";
    if (devuelto > 0 && devuelto < importe) {
      importe = pdRedondear6(importe - devuelto);
      descontado = ", descontado el resto devuelto";
      for (const [i] of devueltos) consumidos.add(i);
    }
    const txRef = entradas[0];
    diario.emitir(h, USDT, "VENTA", "GPP_SWAP", {
      fecha: fechaHoraDeTx(txRef), token: "USDT", simbolo: "USDT",
      cantidad: importe, importe_usdt: importe,
      nota: "swap stablecoin -> POL (activo entregado" + descontado + ")",
    });
    diario.emitir(h, "pol", "COMPRA", "COSTE_BASE", {
      fecha: fechaHoraDeTx(txRef), token: "POL", simbolo: "POL",
      cantidad: polIn, importe_usdt: importe,
      origen: txRef.from, destino: txRef.to,
      nota: "swap stablecoin -> POL (activo recibido)",
    });
    for (const [i] of stableOut) consumidos.add(i);
    polIn = 0;
  }
  if (polIn > 0) {
    const txRef = entradas[0];
    diario.emitir(h, "pol", "DEPOSITO", "COSTE_BASE", {
      cantidad: polIn, fecha: fechaHoraDeTx(txRef), token: "POL", simbolo: "POL",
      origen: txRef.from, destino: txRef.to,
      nota: "depósito de POL para gas: coste puesto a mano " +
            "o, si no, al precio de POL del día",
    });
  }
  if (polOut > 0) {
    const txRef = salidas[0];
    diario.emitir(h, "pol", "RETIRADA", "GPP_RETIRADA", {
      cantidad: polOut, fecha: fechaHoraDeTx(txRef), token: "POL", simbolo: "POL",
      origen: txRef.from, destino: txRef.to,
      nota: "salida de POL sin contrapartida en el hash: verificar destino",
      revisar: true,
    });
  }
}

/* Las reglas 3, 4, 6 y 7 usan STABLECOINS.has(). */
function clasificarIndividual(tx, diario, contexto) {
  const h = tx.hash || "";
  const contrato = normalizarDireccion(tx.contractAddress || "");
  const nombre = (tx.tokenName || "").trim();
  const simbolo = (tx.tokenSymbol || "").trim();
  const cantidad = cantidadTx(tx);
  const origen = tx.from || "";
  const destino = tx.to || "";
  const tipoOrigen = clasificarDireccion(origen, contexto);
  const tipoDestino = clasificarDireccion(destino, contexto);
  const comunes = {
    fecha: fechaHoraDeTx(tx), token: nombre, simbolo: simbolo,
    cantidad: cantidad, origen: origen, destino: destino,
  };

  const esConocido = contexto.conocidos.has(contrato);
  if (!esConocido) {
    /* Un token que mandaste al spam («Todo el token»), con todos
       sus movimientos, mientras no sea un token conocido. */
    if (contexto.spamTokens.has(contrato)) {
      diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
        nota: NOTA_SPAM_TOKEN,
      }));
      return;
    }
    if (contexto.descartadas.has(contrato)) {
      diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
        nota: "token descartado por el usuario en el catálogo",
      }));
      return;
    }
    if (nombreTokenSospechoso(nombre, simbolo)) {
      diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
        nota: "señales de spam en el nombre del token",
      }));
      return;
    }
    if (!cantidad) {
      diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
        nota: "token desconocido sin valor",
      }));
      return;
    }
  }
  /* Lo que llega de una direccion que mandaste al spam («Toda la
     direccion»), sea el token que sea. Lo que le envias no (si le mandaste
     dinero, es real), y solo mientras siga siendo desconocida: nunca una
     tuya, de Reental, DeFi o un inmueble. */
  if (tipoDestino === "PROPIA" && tipoOrigen === "DESCONOCIDA" &&
      contexto.spamDirecciones.has(normalizarDireccion(origen))) {
    diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
      nota: NOTA_SPAM_DIRECCION,
    }));
    return;
  }
  if (cantidad === 0) {
    diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
      nota: "transferencia de valor cero (posible address poisoning)",
    }));
    return;
  }
  /* Lo que llega de una direccion que imita la tuya es spam
     aunque el token sea real (USDT de verdad): se marca el movimiento, no
     el token. */
  if (tipoDestino === "PROPIA" && imitaDireccionPropia(origen)) {
    diario.emitir(h, contrato, "SPAM", "NEUTRO", Object.assign({}, comunes, {
      nota: NOTA_IMITA_DIRECCION,
    }));
    return;
  }
  if (cantidad === null || cantidad === undefined) {
    diario.emitir(h, contrato, "REVISAR", "PENDIENTE", Object.assign({}, comunes, {
      nota: "valor del transfer no parseable", revisar: true,
    }));
    return;
  }

  /* Tokens de un inmueble entre tu wallet y tu vault: siguen
     siendo tuyos (no es una compra bancaria). */
  if (contrato in contexto.inmuebles && tipoOrigen === "PROPIA" && tipoDestino === "PROPIA") {
    diario.emitir(h, contrato, "MOVIMIENTO", "NEUTRO", Object.assign({}, comunes, {
      inmueble: nombreInmueble(contrato, contexto), nota: NOTA_TRASPASO_INMUEBLE,
    }));
    return;
  }

  if (STABLECOINS.has(contrato)) {
    /* Un distribuidor que paga a la wallet o al vault con un hash
       que SI esta en el archivo de Reental, pero que su fila no ha casado
       (p. ej. una fila reinvertida o reclamada en dos veces): ya se declara
       con la fila, asi que no es otro rendimiento (contaria dos veces).
       A revisar, sin sumar. */
    if (tipoOrigen === "DISTRIBUIDOR" && tipoDestino === "PROPIA" &&
        contexto.hashesCsv && contexto.hashesCsv[normalizarDireccion(h)]) {
      diario.emitir(h, contrato, "REVISAR", "PENDIENTE", Object.assign({}, comunes, {
        importe_usdt: cantidad,
        nota: "transferencia de un reparto que está en el archivo de " +
              "Reental pero no cuadra con su fila: ya se declara con " +
              "la fila; comprobar",
        revisar: true,
      }));
      return;
    }
    if (tipoDestino === "PROPIA" && esDelVault(destino)) {
      if (tipoOrigen === "DISTRIBUIDOR") {
        diario.emitir(h, contrato, "RENDIMIENTO", "RCM_REINVERTIDO", Object.assign({}, comunes, {
          importe_usdt: cantidad,
          nota: "rendimiento huérfano no cubierto por el archivo de " +
                "Reental: verificar (el archivo debería haberlo incluido)",
          revisar: true,
        }));
        return;
      }
      if (tipoOrigen === "SETTLEMENT") {
        diario.emitir(h, contrato, "REVISAR", "PENDIENTE", Object.assign({}, comunes, {
          importe_usdt: cantidad,
          nota: "stablecoin de settlement sin burn correlacionado en el hash",
          revisar: true,
        }));
        return;
      }
      if (tipoOrigen !== "PROPIA") {
        diario.emitir(h, contrato, "REVISAR", "PENDIENTE", Object.assign({}, comunes, {
          importe_usdt: cantidad,
          nota: "stablecoin al vault desde origen no reconocido " + normalizarDireccion(origen),
          revisar: true,
        }));
        return;
      }
    }
    /* Regla 3b: stablecoin de un distribuidor de Reental que
       entra en la wallet sin fila en el archivo de Reental. Como el del
       vault, un rendimiento huerfano (aqui, reclamado) a revisar; lo
       normal es que el archivo sea mas viejo que la descarga (si su hash
       esta en el archivo, lo ha tratado el caso de arriba). */
    if (tipoOrigen === "DISTRIBUIDOR" && normalizarDireccion(destino) === walletConfig()) {
      diario.emitir(h, contrato, "RENDIMIENTO", "RCM_RECLAMADO", Object.assign({}, comunes, {
        importe_usdt: cantidad,
        nota: "rendimiento huérfano no cubierto por el archivo de " +
              "Reental: verificar (el archivo debería haberlo incluido)",
        revisar: true,
      }));
      return;
    }
    if (esDelVault(origen)) {
      if (normalizarDireccion(destino) === walletConfig()) {
        diario.emitir(h, contrato, "RETIRADA", "NEUTRO", Object.assign({}, comunes, {
          importe_usdt: cantidad,
          nota: "traspaso interno vault -> wallet",
        }));
        return;
      }
      diario.emitir(h, contrato, "COMPRA", "COSTE_BASE", Object.assign({}, comunes, {
        importe_usdt: cantidad,
        via_compra: "VAULT",
        nota: "compra financiada con saldo del vault sin token " +
              "correlacionado en este hash: verificar",
        revisar: true,
      }));
      return;
    }
  }

  const rolOrigen = contexto.roles[normalizarDireccion(origen)] || "";
  const rolDestino = contexto.roles[normalizarDireccion(destino)] || "";
  const rolContrato = contexto.roles[contrato] || "";
  if (rolOrigen === "DEFI_REWARDS" && tipoDestino === "PROPIA" &&
      (contrato === RNT || STABLECOINS.has(contrato))) {
    diario.emitir(h, contrato, "REWARD", "RCM_REWARD", Object.assign({}, comunes, {
      importe_usdt: STABLECOINS.has(contrato) ? cantidad : null,
      nota: "recompensa DeFi recibida de su contrato",
    }));
    return;
  }
  if ([rolOrigen, rolDestino, rolContrato].some(r => r.startsWith("DEFI"))) {
    const rol = rolDestino || rolOrigen || rolContrato;
    diario.emitir(h, contrato, "MOVIMIENTO", "NEUTRO", Object.assign({}, comunes, {
      nota: "movimiento DeFi (" + rol.toLowerCase() + ")",
    }));
    return;
  }

  if (STABLECOINS.has(contrato)) {
    if (tipoOrigen === "PROPIA" && tipoDestino === "PROPIA") {
      diario.emitir(h, contrato, "MOVIMIENTO", "NEUTRO", Object.assign({}, comunes, {
        nota: "traspaso interno",
      }));
      return;
    }
    if (tipoDestino === "PROPIA" && tipoOrigen === "DESCONOCIDA") {
      diario.emitir(h, contrato, "DEPOSITO", "COSTE_BASE", Object.assign({}, comunes, {
        importe_usdt: cantidad,
        nota: NOTA_VERIFICAR_ORIGEN,
      }));
      return;
    }
    if (tipoOrigen === "PROPIA" && tipoDestino === "DESCONOCIDA") {
      // A revisar, porque si es otra cuenta tuya (un
      // exchange) no es una venta sino un movimiento neutro.
      diario.emitir(h, contrato, "RETIRADA", "GPP_RETIRADA", Object.assign({}, comunes, {
        importe_usdt: cantidad,
        nota: "verificar destino",
        revisar: true,
      }));
      return;
    }
  }

  diario.emitir(h, contrato, "REVISAR", "PENDIENTE", Object.assign({}, comunes, {
    /* La cantidad a la espanola ("15"). */
    nota: "sin regla aplicable: " + (nombre || simbolo || contrato) + " " +
          normalizarDireccion(origen) + " -> " + normalizarDireccion(destino) +
          " cantidad " + cantidadNota(cantidad),
    revisar: true,
  }));
}

function registrosGas(cache, diario) {
  const wallet = walletConfig();
  const vault = vaultConfig();
  const series = [["wallet_normales", wallet], ["vault_normales", vault]];
  for (const [serie, titular] of series) {
    for (const tx of ((cache.transacciones || {})[serie] || [])) {
      const origen = normalizarDireccion(tx.from || "");
      const destino = normalizarDireccion(tx.to || "");
      const valor = enteroAUnidades(tx.value, 18);
      if (origen === titular) {
        // Solo cifras: no usar BigInt (BigInt("") da 0 y «0x…» se lee
        // en hexadecimal, sin revisar).
        const usado = enteroDeTexto(tx.gasUsed);
        const precio = enteroDeTexto(tx.gasPrice);
        const gas = (usado !== null && precio !== null) ? enteroAUnidades(usado * precio, 18) : null;
        const fallida = tx.isError === "1";
        diario.emitir(tx.hash || "", "gas", "COMISION", "NEUTRO", {
          fecha: fechaHoraDeTx(tx), token: "POL", simbolo: "POL",
          cantidad: gas, origen: origen, destino: destino,
          nota: fallida ? "gas de transacción fallida" : "gas",
          revisar: gas === null,
        });
      }
      /* Fuera del if anterior, para que también salga el POL que un
         tercero manda al vault. */
      // El POL entre la wallet y el vault ya lo anota la
      // wallet (correlacionarPol) como traspaso.
      if (valor && valor > 0 && vault && titular === vault &&
          (origen === titular || destino === titular) &&
          origen !== wallet && destino !== wallet) {
        const sentido = destino === titular ? "entrada" : "salida";
        diario.emitir(tx.hash || "", "pol", "REVISAR", "PENDIENTE", {
          fecha: fechaHoraDeTx(tx), token: "POL", simbolo: "POL",
          cantidad: valor, origen: origen, destino: destino,
          nota: sentido + " de POL nativo en el vault sin regla definida: verificar",
          revisar: true,
        });
      }
    }
  }
}

/* =====================================================================
   PAGOS DIFERIDOS - resolucion y validacion
   =====================================================================
   Funciones PURAS de resolucion y validacion (sin efectos de lado, no
   imprimen, no modifican nada). aplicarPagosDiferidos va en el pipeline
   entre la ordenacion y aplicarAjustesUsuario (los ajustes del usuario
   conservan la ultima palabra). Regla de oro: el destino y la proximidad
   temporal NUNCA determinan que haya venta; solo el vinculo CONFIRMADO
   por el usuario, y nada aqui deduce vinculos.

   Identidad de un movimiento = 5-tupla (hash, contrato, origen, destino,
   valor_raw), la misma clave de deduplicacion de
   transfersUnificadosClasificacion. Las claves de registro
   'hash::contrato::n' tienen sufijo posicional fragil y NO se usan como
   referencia de los vinculos. 'cadena' y 'decimales'
   de la referencia son metadatos: no forman parte de la identidad.

   Los mensajes son literales (las pruebas los comparan con las cifras de
   referencia); el redondeo a 6 decimales es pdRedondear6, que va al par
   en los empates exactos, como numEs con 2 decimales; pdRepr/pdStr
   escriben los valores con el formato fijo de los mensajes (textos entre
   comillas, listas, objetos y números con exponente). No se aceptan version === true
   ni enteros con guion bajo ("1_000"); ninguno aparece en datos validos
   del modelo.
   ===================================================================== */

const PD_ESTADOS_VINCULO = ["CONFIRMADO", "ANULADO"];
const PD_ESTADOS_LIQUIDACION = ["PARCIAL", "COMPLETA", "DESCONOCIDA"];
// Principio de los fragmentos de nota anadidos por el mecanismo: al reaplicar
// se eliminan y reconstruyen (idempotencia). En llano y sin el id del
// vinculo: la busqueda lo encuentra por el vinculo.
const PD_COBRADA = "Cobrada aparte", PD_PAGO = "Pago de la", PD_RESTO = "el resto (";
const PD_SIN_COBRAR = "Sin cobrar todavía";
const PD_NOTA_PREFIJOS = [PD_COBRADA, PD_PAGO, PD_RESTO, PD_SIN_COBRAR];
// Un cobro solo se asigna en parte si es un deposito o esta a revisar (el
// resto nunca cuenta dos veces); lo demas, entero o, antes, «Dinero que
// recibi...».
const PD_CATEGORIAS_PAGO_PARCIAL = ["DEPOSITO", "REVISAR"];

function pdEsObjeto(v) { // objeto plano: ni null ni lista
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function pdStr(v) { // un valor dentro de un mensaje
  // Los valores del bloque vienen tal cual del JSON: un literal sin punto
  // ('2', '800') es un entero, asi que un numero entero se escribe sin
  // decimales ('2', no '2.0' como haria pyStr). Limitacion: tras
  // JSON.parse un literal '2.0' es indistinguible de '2'.
  if (typeof v === "number" && Number.isInteger(v) && Math.abs(v) < 1e21) {
    return String(v);
  }
  if (typeof v === "number") return pdFloatPython(v);
  return pyStr(v);
}
/* Un número con decimales en los mensajes: las mismas cifras que
   JavaScript, pero siempre con «.0» si es entero y con exponente por debajo
   de 1e-4 o desde 1e16, de dos cifras como mínimo (1e-07, no 1e-7). */
function pdFloatPython(x) {
  if (!Number.isFinite(x)) return Number.isNaN(x) ? "nan" : (x > 0 ? "inf" : "-inf");
  const [mantisa, e] = x.toExponential().split("e");
  const exp = Number(e);
  if (exp < -4 || exp >= 16) {
    return mantisa + "e" + (exp < 0 ? "-" : "+") + String(Math.abs(exp)).padStart(2, "0");
  }
  const s = x.toFixed(Math.max(0, mantisa.replace(/^-?\d\.?/, "").length - exp));
  return s.includes(".") ? s : s + ".0";
}
function pdRepr(v) { // un valor citado en un mensaje: los textos, entre comillas
  if (typeof v === "string") {
    let q = "'";
    if (v.includes("'") && !v.includes('"')) q = '"';
    const s = v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n")
               .replace(/\r/g, "\\r").replace(/\t/g, "\\t")
               .replace(new RegExp(q, "g"), "\\" + q);
    return q + s + q;
  }
  // Listas y objetos: [] y {'a': 1}.
  if (Array.isArray(v)) return "[" + v.map(pdRepr).join(", ") + "]";
  if (pdEsObjeto(v)) return "{" + Object.entries(v).map(([k, x]) => pdRepr(k) + ": " + pdRepr(x)).join(", ") + "}";
  return pdStr(v);
}
/* x si es un numero finito; null si no. */
function pdNumero(x) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}
function pdRedondear6(x) { // a 6 decimales, al par en los empates
  if (typeof x !== "number" || !Number.isFinite(x)) return x;
  if (Math.abs(x) >= 1e21) return x;
  /* En un empate exacto (el número guardado acaba
     justo en un 5 en el 7.º decimal, p. ej. 12,0078125 = 12 + 1/128),
     toFixed sube y aquí se va al par: 12,007812. Un empate así es
     siempre un múltiplo impar de 1/128 (multiplicar por 128 es exacto), y
     solo entonces se miran sus decimales exactos con toFixed(30). */
  if ((Math.abs(x) * 128) % 2 === 1) {
    const exacto = Math.abs(x).toFixed(30);
    const coma = exacto.indexOf(".");
    if (Number(exacto[coma + 6]) % 2 === 0) return Math.sign(x) * Number(exacto.slice(0, coma + 7));
  }
  return Number(x.toFixed(6));
}
function pdFormatear6(x) { // a la espanola y sin ceros de relleno
  return cantidadNota(pdRedondear6(x));
}
/* Un solo signo («+-800» no vale). */
function pdIntDeTexto(s) {
  const t = s.trim();
  if (!/^[+-]?\d+$/.test(t)) return null;
  try { return BigInt(t.replace(/^\+/, "")); } catch (e) { return null; }
}
function pdIntDirecto(valor) { // entero (BigInt) del valor; null si no parseable
  if (typeof valor === "boolean") return BigInt(valor ? 1 : 0);
  if (typeof valor === "number") return Number.isFinite(valor) ? BigInt(Math.trunc(valor)) : null;
  if (typeof valor !== "string") return null;
  return pdIntDeTexto(valor);
}
function pdIntViaStr(valor) { // entero del valor pasado a texto; null si no parseable
  return pdIntDeTexto(pdStr(valor));
}
function pdClaveIdentidad(identidad) { // clave estable de Map para la 5-tupla
  return identidad.join("\u0000");
}

function pdIdentidadReferencia(referencia) {
  // 5-tupla identitaria normalizada de una referencia de movimiento del
  // bloque pagos_diferidos. null si la referencia no es un objeto. El
  // valor_raw se canonicaliza como entero decimal ('0800' == '800') para que
  // dos referencias al mismo movimiento no esquiven la validacion.
  if (!pdEsObjeto(referencia)) return null;
  const crudo = referencia.valor_raw === undefined ? "" : referencia.valor_raw;
  const entero = pdIntViaStr(crudo);
  const valor = entero !== null ? entero.toString() : pdStr(crudo);
  return [
    normalizarDireccion(referencia.hash),
    normalizarDireccion(referencia.contrato),
    normalizarDireccion(referencia.origen),
    normalizarDireccion(referencia.destino),
    valor,
  ];
}

function pdEnteroAUnidades(valor, decimales) {
  // La misma conversion que los transfers. null si no es parseable: nunca
  // 0.0 silencioso.
  return enteroAUnidades(valor, decimales);
}

function pdUnidadesReferencia(referencia) {
  // Unidades del token derivadas de valor_raw/decimales (el entero raw es la
  // verdad; los cantidad_* del modelo son derivados a 6 decimales). null si
  // no es parseable: nunca 0.0 silencioso.
  if (!pdEsObjeto(referencia)) return null;
  return pdEnteroAUnidades(referencia.valor_raw, referencia.decimales);
}

function pdCoincidenciasReferencia(referencia, registros) {
  // Registros cuya identidad coincide con la referencia (lista; vacia = no
  // encontrado). Los campos del registro ya estan normalizados por
  // Diario.emitir; la cantidad (float, sin raw) se compara con la derivada
  // del valor_raw redondeando ambas a 6 decimales.
  const identidad = pdIdentidadReferencia(referencia);
  const unidades = pdUnidadesReferencia(referencia);
  if (identidad === null || unidades === null) return [];
  const [h, contrato, origen, destino] = identidad;
  const cantidadRef = pdRedondear6(unidades);
  return (registros || []).filter(r =>
    !!r && r.hash === h && r.contrato === contrato &&
    r.origen === origen && r.destino === destino &&
    typeof r.cantidad === "number" &&
    pdRedondear6(r.cantidad) === cantidadRef);
}

function resolverReferenciaMovimiento(referencia, registros) {
  // Resuelve una referencia de movimiento (5-tupla) al registro clasificado
  // que la representa. Devuelve el registro si la coincidencia es UNICA, y
  // null si no existe o si hay mas de una (ambiguedad: el llamador debe
  // avisar, nunca elegir arbitrariamente). Funcion pura.
  const coincidencias = pdCoincidenciasReferencia(referencia, registros);
  return coincidencias.length === 1 ? coincidencias[0] : null;
}

function pdAuditarBloque(pagosDiferidos, registros, ajustesNorm) {
  // Auditoria estructurada del bloque 'pagos_diferidos'. Funcion pura: no
  // modifica nada ni imprime.
  //
  // Devuelve un objeto con:
  // - problemas: lista plana (mismo contenido y orden que devuelve
  //   validarPagosDiferidos, que es envoltorio).
  // - porVenta: Map {id_venta -> [problemas]} para las ventas con problemas.
  // - ventasOk: [[venta, registroSalida, [[asignacion, identidadPago,
  //   registroPago], ...]], ...] en orden de bloque: ventas CONFIRMADAS sin
  //   ningun problema propio y sin pagos involucrados en sobreasignacion.
  //   Una sobreasignacion (o un recibido no util) descarta TODAS las ventas
  //   que comparten ese pago: contabilidad fiscal = ante la duda, no aplicar
  //   y avisar.
  // - asignadoPorPago: Map {registro del pago -> {suma, recibida, clave,
  //   categoria, ventas}} con las asignaciones de los vinculos CONFIRMADOS
  //   (por registro, no por la referencia escrita).
  //   (Maps en vez de objetos planos: claves con \u0000 seguras y orden de
  //   insercion garantizado.)
  const auditoria = { problemas: [], porVenta: new Map(), ventasOk: [],
                      asignadoPorPago: new Map() };
  const problemas = auditoria.problemas;

  if (pagosDiferidos === null || pagosDiferidos === undefined) {
    return auditoria; // cache antigua sin bloque: nada que validar
  }
  if (!pdEsObjeto(pagosDiferidos)) {
    problemas.push("pagos_diferidos: el bloque no es un objeto JSON");
    return auditoria;
  }

  const version = pagosDiferidos.version === undefined ? 1 : pagosDiferidos.version;
  if (version !== 1) {
    problemas.push(`pagos_diferidos: version ${pdRepr(version)} no soportada (esperada 1)`);
  }
  const ventas = pagosDiferidos.ventas === undefined || pagosDiferidos.ventas === null
    ? [] : pagosDiferidos.ventas;
  if (!Array.isArray(ventas)) {
    problemas.push("pagos_diferidos: 'ventas' no es una lista");
    return auditoria;
  }

  const idsVistos = new Set();
  // Lo repetido y lo asignado se cuentan por el REGISTRO al
  // que llega cada referencia, no por la referencia escrita: el mismo
  // movimiento escrito con otro valor_raw o con otros decimales cae en el
  // mismo registro y no puede colarse dos veces.
  const salidaUsadaPor = new Map(); // registro de salida -> id de venta CONFIRMADA
  const asignadoPorPago = auditoria.asignadoPorPago;
  const candidatas = []; // {venta, vid, registroSalida, resueltas}

  for (const venta of ventas) {
    if (!pdEsObjeto(venta)) {
      problemas.push("pagos_diferidos: entrada de 'ventas' no es un objeto");
      continue;
    }
    const problemasVenta = [];
    const vid = venta.id;
    if (typeof vid !== "string" || !vid.trim()) {
      // Sin un id de texto no se puede guardar ni anular.
      problemas.push("pagos_diferidos: venta sin id de texto; no se aplica");
      continue;
    }
    const vidTxt = vid;
    const emitir = mensaje => { problemas.push(mensaje); problemasVenta.push(mensaje); };

    if (idsVistos.has(vidTxt)) {
      emitir(`venta ${vidTxt}: id duplicado en el bloque`);
      continue;
    }
    idsVistos.add(vidTxt);

    const estado = venta.estado;
    if (!PD_ESTADOS_VINCULO.includes(estado)) {
      emitir(`venta ${vidTxt}: estado ${pdRepr(estado)} invalido (esperado CONFIRMADO o ANULADO)`);
      continue;
    }
    if (estado === "ANULADO") continue; // lo anulado se ignora

    const liquidacion = venta.estado_liquidacion;
    if (!PD_ESTADOS_LIQUIDACION.includes(liquidacion)) {
      emitir(`venta ${vidTxt}: estado_liquidacion ${pdRepr(liquidacion)} invalido (esperado PARCIAL, COMPLETA o DESCONOCIDA)`);
    }

    // --- Salida (referencia obligatoria del grupo) ------------------------
    let registroSalida = null;
    const salidaRef = venta.salida;
    const identidadSalida = pdIdentidadReferencia(salidaRef);
    if (identidadSalida === null || pdUnidadesReferencia(salidaRef) === null) {
      emitir(`venta ${vidTxt}: referencia de salida invalida o no parseable (5-tupla incompleta)`);
    } else {
      const coincidencias = pdCoincidenciasReferencia(salidaRef, registros);
      if (coincidencias.length === 0) {
        emitir(`venta ${vidTxt}: salida no encontrada entre los registros (hash ${identidadSalida[0].slice(0, 18)}...)`);
      } else if (coincidencias.length > 1) {
        emitir(`venta ${vidTxt}: salida ambigua, ${coincidencias.length} registros coinciden con la referencia`);
      } else {
        const salida = coincidencias[0];
        const marcador = salida.pago_diferido;
        const propio = pdEsObjeto(marcador) && marcador.rol === "salida" &&
                       marcador.venta_id === vid;
        if (!propio) {
          // Reaplicacion del mismo vinculo = estado esperado (la VENTA con
          // marcador propio la creo este mecanismo).
          if (pdEsObjeto(marcador) && marcador.venta_id !== undefined &&
              marcador.venta_id !== null) {
            emitir(`venta ${vidTxt}: la salida ya esta vinculada a ${pdRepr(marcador.venta_id)} (marcador pago_diferido en el registro ${pdStr(salida.clave)})`);
          } else if (salida.categoria === "VENTA" && salida.destino === BURN &&
                     (salida.importe_usdt === null || salida.importe_usdt === undefined)) {
            // El burn sin cobro en su hash no tiene contraprestacion;
            // se valora con «Es una venta...», no con un vinculo.
            emitir(`venta ${vidTxt}: la salida ya es una VENTA sin importe (cierre sin cobro en su hash); se valora con 'Es una venta...' en Revision, no con un vinculo (clave ${pdStr(salida.clave)})`);
          } else if (salida.categoria === "VENTA") {
            emitir(`venta ${vidTxt}: la salida ya tiene contraprestacion asignada (registro VENTA correlacionado en su hash; clave ${pdStr(salida.clave)})`);
          }
        }
        const previa = salidaUsadaPor.get(salida);
        if (previa !== undefined) {
          emitir(`venta ${vidTxt}: salida duplicada, ya asignada a la venta ${pdStr(previa)}`);
        } else {
          salidaUsadaPor.set(salida, vid);
        }
        registroSalida = salida;
      }
    }

    // --- Asignaciones (cobro fraccionado: 1 venta -> N pagos) ------------
    // Sin asignaciones (null) es una lista vacia; un {} es un problema.
    let asignaciones = venta.asignaciones === undefined || venta.asignaciones === null
      ? [] : venta.asignaciones;
    if (!Array.isArray(asignaciones)) {
      emitir(`venta ${vidTxt}: 'asignaciones' no es una lista`);
      asignaciones = [];
    }
    const pagosDeEstaVenta = new Map(); // clave identidad de pago -> id de asignacion
    const registrosDeEstaVenta = new Map(); // registro de pago -> id de asignacion
    const resueltas = [];
    for (const asignacion of asignaciones) {
      if (!pdEsObjeto(asignacion)) {
        emitir(`venta ${vidTxt}: asignacion no es un objeto`);
        continue;
      }
      const aid = pdStr(asignacion.id || "(sin id)");
      const pagoRef = asignacion.pago;
      const identidadPago = pdIdentidadReferencia(pagoRef);
      if (identidadPago === null || pdUnidadesReferencia(pagoRef) === null) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: referencia de pago invalida o no parseable`);
        continue;
      }
      const clavePago = pdClaveIdentidad(identidadPago);
      if (pagosDeEstaVenta.has(clavePago)) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: duplicado venta+pago (el pago ${identidadPago[0].slice(0, 18)}... ya esta asignado en ${pdStr(pagosDeEstaVenta.get(clavePago))}; edita la asignacion existente)`);
        continue;
      }
      const cantidad = pdNumero(asignacion.cantidad_asignada);
      // Lo que no es un numero finito o redondeado a 6
      // decimales es 0 no vale.
      if (cantidad === null || pdRedondear6(cantidad) <= 0) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: cantidad_asignada ${pdRepr(asignacion.cantidad_asignada)} invalida (debe ser numerica > 0)`);
        pagosDeEstaVenta.set(clavePago, aid);
        continue;
      }
      const coincidencias = pdCoincidenciasReferencia(pagoRef, registros);
      pagosDeEstaVenta.set(clavePago, aid);
      if (coincidencias.length === 0) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: pago no encontrado entre los registros (hash ${identidadPago[0].slice(0, 18)}...)`);
        continue;
      }
      if (coincidencias.length > 1) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: pago ambiguo, ${coincidencias.length} registros coinciden con la referencia`);
        continue;
      }
      const pago = coincidencias[0];
      if (registrosDeEstaVenta.has(pago)) {
        emitir(`venta ${vidTxt}, asignacion ${aid}: duplicado venta+pago (el pago ${identidadPago[0].slice(0, 18)}... ya esta asignado en ${pdStr(registrosDeEstaVenta.get(pago))}; edita la asignacion existente)`);
        continue;
      }
      registrosDeEstaVenta.set(pago, aid);
      let entrada = asignadoPorPago.get(pago);
      if (entrada === undefined) {
        entrada = { suma: 0.0, recibida: pago.cantidad, clave: pago.clave,
                    categoria: pago.categoria, ventas: [] };
        asignadoPorPago.set(pago, entrada);
      }
      entrada.suma += cantidad;
      entrada.ventas.push(vidTxt);
      resueltas.push([asignacion, identidadPago, pago]);
    }

    if (problemasVenta.length > 0) {
      auditoria.porVenta.set(vidTxt, problemasVenta);
    } else if (registroSalida !== null) {
      candidatas.push({ venta, registroSalida, resueltas });
    }
  }

  // --- Validacion global: sobreasignacion por pago -----------------------
  const pagosDescartados = new Set();
  for (const [pago, entrada] of asignadoPorPago) {
    const recibida = pdNumero(entrada.recibida);
    const ventasTxt = entrada.ventas.join(", ");
    if (recibida === null) {
      problemas.push(`pago ${pdStr(entrada.clave)}: registro recibido sin cantidad util; no se puede validar la asignacion (ventas: ${ventasTxt})`);
      pagosDescartados.add(pago);
      continue;
    }
    const suma = pdRedondear6(entrada.suma), rec = pdRedondear6(recibida);
    if (suma > rec) {
      problemas.push(`sobreasignacion: pago ${pdStr(entrada.clave)} suma asignada ${pdFormatear6(suma)} > cantidad recibida ${pdFormatear6(rec)} (ventas: ${ventasTxt})`);
      pagosDescartados.add(pago);
    } else if (suma < rec && !PD_CATEGORIAS_PAGO_PARCIAL.includes(pdCategoriaConAjuste(entrada, ajustesNorm))) {
      // El resto de un rendimiento (o de otra cosa ya explicada)
      // contaria dos veces: no se aplica y se dice que hacer.
      problemas.push(`pago ${pdStr(entrada.clave)}: asignado en parte (${pdFormatear6(suma)} de ${pdFormatear6(rec)}) y es ${pdStr(entrada.categoria)}, no un deposito; asignalo entero o marcalo antes como 'Ingreso de dinero...' (ventas: ${ventasTxt})`);
      pagosDescartados.add(pago);
    }
  }

  for (const candidata of candidatas) {
    const descartado = candidata.resueltas.some(r => pagosDescartados.has(r[2]));
    if (!descartado) {
      auditoria.ventasOk.push([candidata.venta, candidata.registroSalida, candidata.resueltas]);
    }
  }
  return auditoria;
}

// La categoria con la que cuenta el control del pago asignado
// en parte: la de tu ajuste si lo hace deposito (o «a revisar»), para que
// valga marcar antes el cobro como «Ingreso de dinero...»; si no, la de la
// clasificacion (con un ajuste de otra categoria el vinculo se aplica y el
// ajuste gana con su aviso).
// ajustesNorm: Map {clave normalizada -> ajuste} (el de aplicarPagosDiferidos).
function pdCategoriaConAjuste(entrada, ajustesNorm) {
  const a = ajustesNorm ? ajustesNorm.get(normalizarDireccion(entrada.clave)) : null;
  const cat = pdEsObjeto(a) && typeof a.categoria === "string" ? codigoVigente(a.categoria) : null;
  return cat && PD_CATEGORIAS_PAGO_PARCIAL.includes(cat) ? cat : entrada.categoria;
}

function validarPagosDiferidos(pagosDiferidos, registros) {
  // Valida el bloque 'pagos_diferidos' de la cache. Funcion pura: devuelve
  // la lista de problemas (cadenas legibles); lista vacia = bloque valido.
  // No modifica nada, no imprime y NO aplica ningun vinculo (eso es
  // aplicarPagosDiferidos). Envoltorio de pdAuditarBloque. Reglas validadas:
  // - Estructura: version soportada, 'ventas' lista, ids de venta unicos y
  //   estados dentro de sus dominios (vinculo CONFIRMADO/ANULADO; liquidacion
  //   PARCIAL/COMPLETA/DESCONOCIDA).
  // - Vinculos ANULADOS se ignoran por completo.
  // - Toda referencia (salida y pago) debe resolver a UN registro (5-tupla);
  //   no encontrada o ambigua = problema.
  // - La salida no puede tener contraprestacion ya asignada: se rechaza si su
  //   registro ya es VENTA sin marcador propio (el clasificador correlaciono
  //   venta y contraprestacion dentro de su hash), si ya esta vinculada a otra
  //   venta, o si la misma salida esta usada por otra venta CONFIRMADA.
  // - No duplicados venta+pago: el mismo pago no puede repetirse en las
  //   asignaciones de una misma venta (se edita la existente). El mismo pago
  //   SI puede repartirse entre varias ventas (pago agrupado).
  // - Sobreasignacion: para cada pago, la suma de las cantidades asignadas por
  //   los vinculos CONFIRMADOS no puede superar la cantidad recibida en el
  //   registro (ambas redondeadas a 6 decimales).
  // - cantidad_asignada numerica y > 0.
  return pdAuditarBloque(pagosDiferidos, registros).problemas;
}

function pdLiquidacion(venta, sumaAsignada) {
  // Estado de liquidacion de una venta: si existe
  // 'importe_esperado_usd' numerico > 0 se DERIVA de lo asignado vs esperado
  // (comparacion en USD nominal 1:1, con desglose por activo en la nota);
  // si no, vale el estado fijado por el usuario en el bloque. Devuelve
  // [estado, faltanUsd]; faltan es null cuando no hay importe esperado.
  const esperado = pdNumero(venta.importe_esperado_usd);
  if (esperado !== null && esperado > 0) {
    const faltan = pdRedondear6(esperado - sumaAsignada);
    if (faltan <= 0) return ["COMPLETA", 0.0];
    return ["PARCIAL", faltan];
  }
  return [venta.estado_liquidacion, null];
}

function pdFragmentosNota(nota) {
  // Fragmentos de una nota (el motor une motivos con '; ') excluyendo los
  // de pagos diferidos de una aplicacion anterior: al reaplicar se eliminan y
  // reconstruyen, lo que hace el mecanismo idempotente.
  return (nota || "").split("; ")
    .filter(f => f && !PD_NOTA_PREFIJOS.some(p => f.startsWith(p)));
}
/* Cantidad de una nota de pagos diferidos: 2 decimales ("100,50"); por
   debajo de 0,01, con los que hagan falta ("0,004"). */
function pdCantidadEs(x) {
  return Math.abs(x) >= 0.01 ? numEs(x, 2) : cantidadNota(x);
}
/* '100,50 USDC' o '300,00 USDC + 10,00 USDT' (por activo). */
function pdImportesEs(desglose) {
  return [...desglose.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([a, c]) => pdCantidadEs(c) + " " + a).join(" + ");
}
function pdFechaEs(fecha) { // dd/mm/aaaa
  const f = String(fecha || "").slice(0, 10);
  return f ? f.slice(8, 10) + "/" + f.slice(5, 7) + "/" + f.slice(0, 4) : "";
}
/* 'Inmueble X del 01/03/2026': de que venta es un pago. */
function pdNombreVenta(salida) {
  const que = salida.inmueble || salida.simbolo || salida.token || "?";
  const fecha = pdFechaEs(salida.fecha);
  return fecha ? que + " del " + fecha : que;
}

function pdEfectoSalida(registro, vid, suma, desglose, liquidacion, faltan, fechasPago) {
  // Efectos del vinculo sobre el registro de SALIDA:
  // VENTA / GPP_INMUEBLE, importe_usdt = suma asignada (USD nominal),
  // fecha intacta (fecha de salida) y marcador explicito pago_diferido
  // (el motor lo usa como guarda, nunca el texto de nota). De los motivos de
  // revisar solo se eliminan los que resuelve el vinculo: 'sin
  // contraprestacion' y 'sin regla aplicable'; cualquier
  // otro se conserva, y la venta sigue revisar=true hasta liquidacion
  // COMPLETA y mientras no tenga ningun cobro. La nota dice
  // cuando se cobro y cuanto: «Cobrada aparte el 15/03/2026: 100,50
  // USDC».
  registro.categoria = "VENTA";
  registro.subcategoria = "GPP_INMUEBLE";
  registro.importe_usdt = suma;
  registro.pago_diferido = { venta_id: vid, rol: "salida" };
  const conservar = pdFragmentosNota(registro.nota)
    .filter(f => !/sin contraprestaci[oó]n/.test(f) && !f.startsWith("sin regla aplicable")); // con o sin tilde (notas de antes de la 1.2)
  const motivosRestantes = Boolean(registro.revisar) && conservar.length > 0;
  const cuando = fechasPago && fechasPago.length ? " el " + fechasPago.join(" y ") : "";
  let texto = desglose.size ? PD_COBRADA + cuando + ": " + pdImportesEs(desglose) : PD_SIN_COBRAR;
  if (liquidacion === "COMPLETA") {
    registro.revisar = motivosRestantes || !desglose.size;
  } else {
    registro.revisar = true;
    if (faltan) texto += ", faltan " + pdCantidadEs(faltan) + " USD por cobrar";
    else if (desglose.size) { // sin cobros, «Sin cobrar todavía» ya lo dice
      texto += liquidacion === "PARCIAL" ? ", aún sin cobrar entera" : ", sin saber si está cobrada entera";
    }
  }
  conservar.push(texto);
  registro.nota = conservar.join("; ");
}

function pdEfectoPago(registro, vids, nombres, suma, restante, completo) {
  // Efectos del vinculo sobre el registro de COBRO:
  // el registro original se conserva (nunca se neutraliza ni se fusiona).
  // - Totalmente asignado -> DEPOSITO / COSTE_BASE, revisar=false, nota del
  //   vinculo. (El lote FIFO de la stablecoin lo crea este DEPOSITO con el
  //   activo real y la fecha de cobro.)
  // - Asignacion parcial (solo un deposito o algo a revisar) -> tambien
  //   DEPOSITO (todo el dinero llego y entra en la
  //   cartera), revisar=true y la nota dice que el resto esta por verificar.
  // En los dos casos, un cobro en stablecoin sin importe_usdt lo recibe
  // (1 stablecoin = 1 USD): sin el, el lote no se abriria.
  // La nota dice de que venta es: «Pago de la venta de Inmueble X
  // del 01/03/2026: 100,50 USDC»; el «verificar origen» del motor se quita.
  // El marcador lleva venta_id unico, o la lista de ids cuando el pago esta
  // agrupado entre varias ventas.
  registro.pago_diferido = {
    venta_id: vids.length === 1 ? vids[0] : vids.slice(),
    rol: "pago",
  };
  registro.categoria = "DEPOSITO";
  registro.subcategoria = "COSTE_BASE";
  if ((registro.importe_usdt === null || registro.importe_usdt === undefined) &&
      STABLECOINS.has(normalizarDireccion(registro.contrato))) {
    registro.importe_usdt = registro.cantidad;
  }
  const simbolo = registro.simbolo || "USD";
  const conservar = pdFragmentosNota(registro.nota)
    .filter(f => f !== NOTA_VERIFICAR_ORIGEN);
  const deQue = PD_PAGO + (nombres.length === 1 ? " venta de " : "s ventas de ") + nombres.join(" y de ");
  conservar.push(deQue + ": " + pdCantidadEs(suma) + " " + simbolo);
  if (completo) {
    registro.revisar = false;
  } else {
    registro.revisar = true;
    conservar.push(PD_RESTO + pdCantidadEs(restante) + " " + simbolo + "), verificar origen");
  }
  registro.nota = conservar.join("; ");
}

function pdConflictoAjuste(ajustesNorm, clave, vinculoTxt, camposFijados) {
  // Aviso de conflicto (nunca sobrescritura silenciosa)
  // cuando un ajuste de usuario toca campos que el vinculo fija. Los ajustes
  // se aplican DESPUES y tienen la ultima palabra: aqui solo se detecta y se
  // informa (el log es logPagosDiferidos).
  const campos = ajustesNorm.get(normalizarDireccion(clave || ""));
  if (!pdEsObjeto(campos)) return null;
  const pisados = Object.keys(campos).filter(c => camposFijados.has(c)).sort();
  if (pisados.length === 0) return null;
  return `conflicto: el ajuste de usuario sobre '${pdStr(clave)}' modifica ${pisados.join(", ")}, campo(s) fijado(s) por el vinculo ${vinculoTxt}; el ajuste tiene la ultima palabra`;
}

function aplicarPagosDiferidos(registros, cache) {
  // Aplica los efectos de los vinculos de pagos diferidos CONFIRMADOS por el
  // usuario. Posicion en el pipeline: despues de la
  // ordenacion y ANTES de aplicarAjustesUsuario (precedencia: clasificacion
  // automatica -> pagos_diferidos -> ajustes_usuario, que conserva la ultima
  // palabra con aviso de conflicto).
  //
  // Solo se aplican vinculos CONFIRMADOS y sin problemas de validacion
  // (pdAuditarBloque); los ANULADOS se ignoran y los invalidos se listan
  // sin tocar los registros. Esta funcion NUNCA deduce vinculos: el destino y
  // la proximidad temporal no determinan nada.
  // Es idempotente: los fragmentos de nota propios se reconstruyen y el
  // marcador de un vinculo ya aplicado no se rechaza a si mismo.
  //
  // Devuelve objeto para el log: {aplicados: [{venta_id, salida, importe_usd,
  // liquidacion, pagos: [{clave, asignado}]}], problemas: [cadenas],
  // conflictos: [cadenas]}.
  const info = { aplicados: [], problemas: [], conflictos: [] };
  const bloque = pdEsObjeto(cache) ? cache.pagos_diferidos : null;
  const ajustes = (pdEsObjeto(cache) && cache.ajustes_usuario) || {};
  const ajustesNorm = new Map(Object.entries(pdEsObjeto(ajustes) ? ajustes : {})
    .map(([k, v]) => [normalizarDireccion(k), v]));
  const auditoria = pdAuditarBloque(bloque, registros, ajustesNorm);
  info.problemas = auditoria.problemas;
  if (auditoria.ventasOk.length === 0) return info;

  const camposSalida = new Set(["categoria", "subcategoria", "importe_usdt",
                                "revisar", "pago_diferido"]);
  // El cobro en parte tambien pasa a DEPOSITO, asi que un
  // ajuste que le cambie la categoria se avisa; su revisar si lo decide el
  // usuario («Dejar como deposito»: el resto es dinero suyo).
  const camposPagoTotal = new Set(["categoria", "subcategoria", "importe_usdt",
                                   "revisar", "pago_diferido"]);
  const camposPagoParcial = new Set(["categoria", "subcategoria", "importe_usdt",
                                     "pago_diferido"]);

  // Paso 1: efectos sobre las salidas y acumulacion por pago (la asignacion
  // total de un pago agrupado depende de todas las ventas aplicadas).
  const totalesPago = new Map(); // registro del pago -> {registro, suma, ventas}
  const nombresVenta = new Map(); // venta_id -> «Inmueble X del 01/03/2026»
  for (const [venta, salida, resueltas] of auditoria.ventasOk) {
    const vid = venta.id;
    let suma = 0.0;
    const desglose = new Map();
    for (const [asignacion, , pagoReg] of resueltas) {
      const cantidad = Number(asignacion.cantidad_asignada);
      suma += cantidad;
      // Un activo que no es texto no vale (el desglose se ordena).
      const activo = typeof asignacion.activo === "string" && asignacion.activo
        ? asignacion.activo : (pagoReg.simbolo || "USD");
      desglose.set(activo,
                   pdRedondear6((desglose.get(activo) || 0.0) + cantidad));
      let entrada = totalesPago.get(pagoReg);
      if (entrada === undefined) {
        entrada = { registro: pagoReg, suma: 0.0, ventas: [] };
        totalesPago.set(pagoReg, entrada);
      }
      entrada.suma += cantidad;
      if (!entrada.ventas.includes(vid)) entrada.ventas.push(vid);
    }
    suma = pdRedondear6(suma);
    const [liquidacion, faltan] = pdLiquidacion(venta, suma);
    const fechasPago = [];
    for (const [, , pagoReg] of resueltas) {
      const f = pdFechaEs(pagoReg.fecha);
      if (f && !fechasPago.includes(f)) fechasPago.push(f);
    }
    nombresVenta.set(vid, pdNombreVenta(salida));
    pdEfectoSalida(salida, vid, suma, desglose, liquidacion, faltan, fechasPago);
    const conflicto = pdConflictoAjuste(ajustesNorm, salida.clave,
                                        `${pdStr(vid)} (salida)`, camposSalida);
    if (conflicto) info.conflictos.push(conflicto);
    info.aplicados.push({
      venta_id: vid,
      salida: salida.clave,
      importe_usd: suma,
      liquidacion: liquidacion,
      pagos: resueltas.map(([asignacion, , pago]) => ({
        clave: pago.clave,
        asignado: Number(asignacion.cantidad_asignada),
      })),
    });
  }

  // Paso 2: efectos sobre los cobros (total vs parcial depende de la suma
  // global de todas las ventas aplicadas).
  for (const entrada of totalesPago.values()) {
    const registro = entrada.registro;
    const suma = pdRedondear6(entrada.suma);
    const restante = pdRedondear6(Number(registro.cantidad) - suma);
    const completo = restante <= 0;
    pdEfectoPago(registro, entrada.ventas, entrada.ventas.map(v => nombresVenta.get(v)),
                 suma, restante, completo);
    const vidsTxt = entrada.ventas.map(pdStr).join(", ");
    const conflicto = pdConflictoAjuste(
      ajustesNorm, registro.clave, `${vidsTxt} (pago)`,
      completo ? camposPagoTotal : camposPagoParcial);
    if (conflicto) info.conflictos.push(conflicto);
  }
  return info;
}

function logPagosDiferidos(informe) {
  // Log de vinculos, como el de los ajustes de usuario: vinculos aplicados,
  // avisos (vinculos no aplicados) y conflictos con ajustes_usuario. Con el
  // bloque vacio (sin vinculos ni avisos) no imprime NADA. Lo llama
  // ejecutarClasificacion.
  if (!pdEsObjeto(informe)) return;
  const aplicados = informe.aplicados || [];
  const problemas = informe.problemas || [];
  const conflictos = informe.conflictos || [];
  if (!(aplicados.length || problemas.length || conflictos.length)) return;
  log(`  Pagos diferidos: ${aplicados.length} vinculo(s) aplicado(s), ` +
      `${problemas.length} aviso(s), ${conflictos.length} conflicto(s).`);
  for (const a of aplicados) {
    const pagosTxt = (a.pagos || []).map(
      p => `${pdFormatear6(p.asignado)} (${pdStr(p.clave).slice(0, 24)}...)`
    ).join(" + ") || "sin pagos asignados";
    log(`    venta ${pdStr(a.venta_id)}: importe ${pdFormatear6(a.importe_usd)} USD, liquidacion ${pdStr(a.liquidacion)}, pagos: ${pagosTxt}`);
  }
  for (const p of problemas) log("    AVISO (vinculo no aplicado): " + p, "warn");
  for (const c of conflictos) log("    AVISO: " + c, "warn");
}

/* La clave sin su sufijo ::n; si un registro es el movimiento del
   sello (origen, destino y cantidad del registro al que el usuario puso el
   ajuste, que guarda js/05 en ajustes_movimiento); y los sellos bien
   escritos, con la clave normalizada. */
function baseClave(clave) {
  return clave.replace(/::[0-9]+$/, "");
}
function selloCasa(registro, sello) {
  const nulo = v => (v === undefined ? null : v);
  return normalizarDireccion(registro.origen || "") === normalizarDireccion(sello.origen || "") &&
    normalizarDireccion(registro.destino || "") === normalizarDireccion(sello.destino || "") &&
    nulo(registro.cantidad) === nulo(sello.cantidad);
}
function sellosAjustes(cache) {
  const sellos = new Map();
  if (!pdEsObjeto(cache.ajustes_movimiento)) return sellos;
  for (const [k, v] of Object.entries(cache.ajustes_movimiento)) {
    if (pdEsObjeto(v) && "cantidad" in v && typeof v.origen === "string" && typeof v.destino === "string")
      sellos.set(String(k).trim().toLowerCase(), v);
  }
  return sellos;
}
/* movidos (opcional): se llena con [clave del ajuste, clave del registro]
   de los ajustes que siguieron a su movimiento, para que
   ejecutarClasificacion los cambie de clave en la cache, y con [clave,
   null] los que se quedaron sin él. */
/* Datos de un ajuste que solo usa la pantalla (💶 y 📊: lo pagado en USD de
   una compra por transferencia, P15): no pasan al registro ni al motor. */
const AJUSTE_SOLO_PANTALLA = new Set(["pagado_usd", "fecha_pago_usd"]);
/* Datos que solo trae un ajuste (no salen de la clasificación): se añaden
   sin aviso. Lo cobrado en € de «Es una venta…» (P25). */
const AJUSTE_SOLO_DEL_AJUSTE = new Set(["cobrado_eur"]);
function aplicarAjustesUsuario(registros, cache, silencioso, movidos) {
  // silencioso: sin avisos en el registro (la simulacion del formulario de
  // vinculos lo llama en cada tecla).
  const avisar = silencioso ? () => {} : log;
  const ajustes = cache.ajustes_usuario || {};
  const porClave = new Map();
  const porBase = new Map();
  for (const r of registros) {
    porClave.set(r.clave, r);
    const b = baseClave(r.clave);
    if (!porBase.has(b)) porBase.set(b, []);
    porBase.get(b).push(r);
  }
  const sellos = sellosAjustes(cache);
  const noAplicados = [];
  for (const [clave, campos] of Object.entries(ajustes)) {
    const k = clave.trim().toLowerCase();
    let registro = porClave.get(k);
    const sello = sellos.get(k);
    /* El sufijo ::n sale del orden y cambia si otro
       movimiento del mismo hash y contrato deja de tener registro (p. ej.
       al confirmar un inmueble, la compra se come una retirada): sin sello
       la decisión caería en otro movimiento sin avisar. Con sello, va al
       registro con ese sello; si ya no está, no se aplica. */
    if (sello && !k.startsWith("csv::") && !(registro && selloCasa(registro, sello))) {
      registro = (porBase.get(baseClave(k)) || []).find(r => selloCasa(r, sello));
      if (!registro) {
        noAplicados.push(clave);
        avisar("AVISO: el movimiento del ajuste " + clave + " ya no está: no se aplica", "warn");
        if (Array.isArray(movidos)) movidos.push([clave, null]);
        continue;
      }
      avisar("AVISO: el ajuste " + clave + " sigue a su movimiento, que ahora es " + registro.clave, "warn");
      if (Array.isArray(movidos)) movidos.push([clave, registro.clave]);
    }
    if (!registro) {
      noAplicados.push(clave);
      avisar("AVISO: ajuste de usuario sin registro que ajustar: " + clave, "warn");
      continue;
    }
    for (const [campoGuardado, valor] of Object.entries(campos || {})) {
      // Un campo con su nombre antiguo (propiedad, bruto_usdt) vale como
      // el de hoy.
      const campo = campoVigente(campoGuardado);
      if (campo === "nota") {
        // Solo un texto (null saldría «null» y 5.0 saldría «5»).
        if (typeof valor !== "string") {
          avisar("AVISO: ajuste " + clave + ": la nota no es un texto, no se añade", "warn");
          continue;
        }
        registro.nota = (registro.nota ? registro.nota + "; " : "") + valor;
      } else if (AJUSTE_SOLO_PANTALLA.has(campo)) {
        continue;
      } else if (campo === "__proto__") {
        // Cambiaría el prototipo del registro.
        avisar("AVISO: ajuste " + clave + ": campo '__proto__' no válido, se ignora", "warn");
      } else if (campo !== "clave") {
        if (!(campo in registro) && !AJUSTE_SOLO_DEL_AJUSTE.has(campo)) {
          avisar("AVISO: ajuste " + clave + ": campo '" + campo +
              "' no existía en el registro, se añade", "warn");
        }
        // Un codigo con su nombre antiguo (DIVIDENDO, RCM_VAULT...) vale
        // como el de hoy.
        registro[campo] = (campo === "categoria" || campo === "subcategoria")
          ? codigoVigente(valor) : valor;
      }
    }
    // El PENDIENTE de un rendimiento es su mixto.
    if (registro.categoria === "RENDIMIENTO" && registro.subcategoria === "PENDIENTE") {
      registro.subcategoria = "RCM_MIXTO";
    }
  }
  return noAplicados;
}

/* Una compra externa decidida en Revision sin tu precio: un inmueble
   lleva el de por defecto, como la que detecta la app; el RNT, ninguno
   (se pone en 💶). Un coste escrito en tus ajustes (aunque sea 0 o no
   valga) no se toca: el motor lo trata como hasta ahora. */
function costeDefectoComprasExternas(registros, config, ajustes) {
  const conCoste = new Set(Object.entries(pdEsObjeto(ajustes) ? ajustes : {})
    .filter(([, a]) => pdEsObjeto(a) && "coste_eur" in a).map(([k]) => k.trim().toLowerCase()));
  for (const r of registros) {
    if (r.categoria === "COMPRA" && r.via_compra === "BANCARIA" && !(Number(r.coste_eur) > 0) && !conCoste.has(r.clave) &&
        normalizarDireccion(r.contrato || "") !== RNT && Number(r.cantidad) > 0) {
      r.coste_eur = r.cantidad * Number(config.compra_bancaria_coste_eur_por_token);
    }
  }
}

function clasificarTransacciones(cache, filasCsv, indicePorHash, config,
                                 informePagos) {
  // informePagos: objeto opcional de salida (pagos diferidos). Si
  // se pasa, se rellena con el informe de la aplicacion de los vinculos
  // ({aplicados, problemas, conflictos}) para que ejecutarClasificacion
  // pueda registrar el log, igual que los avisos de los ajustes de usuario.
  const contexto = construirContexto(cache);
  // Hashes del archivo de Reental: la regla 3b solo llama
  // huerfano a lo que el archivo no trae.
  contexto.hashesCsv = indicePorHash || {};
  contexto.clavesCsv = clavesRendimientosCsv(filasCsv);
  const transfers = transfersUnificadosClasificacion(cache);
  const porHash = new Map();
  for (const tx of transfers) {
    const h = normalizarDireccion(tx.hash || "");
    if (!porHash.has(h)) porHash.set(h, []);
    porHash.get(h).push(tx);
  }
  const legsPol = movimientosPol(cache);
  for (const h of legsPol.keys()) {
    if (!porHash.has(h)) porHash.set(h, []);
  }
  const diario = new Diario();
  const filasEmitidas = new Set();
  for (const [h, txs] of porHash) {
    const consumidos = new Set();
    if (indicePorHash[h]) {
      regla2Rendimientos(h, indicePorHash[h], txs, consumidos, diario, contexto,
                       filasEmitidas);
    }
    // Los señuelos se apartan de las correlaciones y vuelven
    // luego a las reglas sueltas, en su orden.
    const senuelos = [];
    txs.forEach((tx, i) => {
      if (!consumidos.has(i) && esSenuelo(tx, contexto)) { senuelos.push(i); consumidos.add(i); }
    });
    correlacionarVentas(h, txs, consumidos, diario, contexto);
    correlacionarCompras(h, txs, consumidos, diario, contexto, config);
    correlacionarDefi(h, txs, consumidos, diario, contexto);
    correlacionarCambioStable(h, txs, consumidos, diario, contexto);
    correlacionarPol(h, legsPol.get(h) || [], txs, consumidos, diario, contexto);
    for (const i of senuelos) consumidos.delete(i);
    txs.forEach((tx, i) => {
      if (!consumidos.has(i)) clasificarIndividual(tx, diario, contexto);
    });
  }
  // Desde el CSV, los rendimientos cuyo hash no tiene transferencias
  // y los que no tienen hash (repartos pendientes).
  rendimientosSinTransferencia(filasCsv || [], filasEmitidas, diario, contexto);
  rendimientosSinHash(filasCsv || [], filasEmitidas, diario, contexto);
  pendientesYaCobrados(diario.registros);
  marcarSemillasQuitadas(diario.registros, porHash, legsPol, cache);
  registrosGas(cache, diario);
  // Letra a letra, no con localeCompare (pondría «cáceres» antes que
  // «carballo» y cambiaría el orden de las cifras de referencia).
  // Por el instante real (en UTC, la fecha de siempre).
  anotarInstantes(cache, diario.registros);
  ordenarPorFecha(diario.registros, (a, b) =>
    cmpTexto(a.hash, b.hash) ||
    cmpTexto(a.clave, b.clave));
  // Pagos diferidos: efectos de los vinculos CONFIRMADOS
  // por el usuario, tras la ordenacion y antes de los ajustes de usuario
  // (que conservan la ultima palabra).
  // El formulario de vinculos simula desde aqui (sin
  // vinculos ni ajustes) y despues aplica los ajustes, como este pipeline;
  // se guarda una copia en el informe, sin que salga al convertirlo a JSON.
  if (pdEsObjeto(informePagos)) {
    Object.defineProperty(informePagos, "registrosSinVinculos", {
      value: diario.registros.map(r => Object.assign({}, r)), enumerable: false,
    });
  }
  const infoPagos = aplicarPagosDiferidos(diario.registros, cache);
  if (pdEsObjeto(informePagos)) Object.assign(informePagos, infoPagos);
  const movidos = [];
  aplicarAjustesUsuario(diario.registros, cache, false, movidos);
  costeDefectoComprasExternas(diario.registros, config, cache.ajustes_usuario);
  // Los ajustes que siguieron a su movimiento (sin que salga
  // al convertir el informe a JSON).
  if (pdEsObjeto(informePagos)) {
    Object.defineProperty(informePagos, "ajustesMovidos", { value: movidos, enumerable: false });
  }
  return diario.registros;
}

/* Lo que pasa en un hash con una dirección que
   trae la app y el usuario quitó (js/05 semillasQuitadas) queda a revisar,
   con su nota: sin ella el motor lo clasifica de otra forma (un depósito,
   una venta…) y ninguna cifra debe cambiar sin que el usuario lo vea. Si la
   volvió a añadir con otro tipo, manda ese tipo y no se marca. Antes del
   gas: la comisión no cambia. */
function marcarSemillasQuitadas(registros, porHash, legsPol, cache) {
  const quitadas = typeof semillasQuitadas === "function" ? semillasQuitadas(cache) : new Set();
  for (const bloque of Object.values((cache && cache.contratos_aprendidos) || {})) {
    Object.keys(bloque || {}).forEach(a => quitadas.delete(normalizarDireccion(a)));
  }
  if (!quitadas.size) return;
  const toca = tx => [tx.from, tx.to, tx.contractAddress].some(a => quitadas.has(normalizarDireccion(a || "")));
  const hashes = new Set();
  for (const [h, txs] of porHash) {
    if (txs.some(toca) || (legsPol.get(h) || []).some(toca)) hashes.add(h);
  }
  for (const r of registros) {
    if (!hashes.has(r.hash)) continue;
    r.revisar = true;
    r.nota = r.nota ? r.nota + "; " + NOTA_SEMILLA_QUITADA : NOTA_SEMILLA_QUITADA;
  }
}

function resumenDiario(registros) {
  const conteo = {};
  for (const r of registros) {
    conteo[r.categoria] = (conteo[r.categoria] || 0) + 1;
  }
  const revisar = registros.filter(r => r.revisar);
  const bancarias = registros.filter(r => r.via_compra === "BANCARIA");
  return { conteo, revisar, bancarias };
}

function requisitosClasificacionOk() {
  const cfg = state.config || {};
  const cacheOk = !!state.cache;
  const csvOk = !!(state.csvCargado && state.filasCsv && state.filasCsv.length);
  const coste = Number(cfg.compra_bancaria_coste_eur_por_token);
  // El vault NO es requisito; sin el se clasifica igual
  // (lo que se pierde se explica en la burbuja de su campo). Pero si está
  // escrito tiene que valer: la misma regla que el paso 1 de 🚀 Puesta en
  // marcha (direccionesConfigOk de js/02).
  const configOk = direccionesConfigOk(cfg) && coste > 0;
  return { cacheOk, csvOk, configOk };
}

/* El descubrimiento dinamico se ejecuta en CADA clasificacion, entre la
   sincronizacion y la clasificacion. Es idempotente: con el
   catalogo ya descubierto no cambia nada (y entonces no marca la cache como
   modificada); nunca toca los inmuebles CONFIRMADOS o DESCARTADOS por el
   usuario (solo sube CANDIDATA -> CONFIRMADA con refuerzo).
   Las dudas (CANDIDATAS sin refuerzo) NO se tratan como inmueble y se
   avisan para decidir a mano en el catalogo. Devuelve el resumen o null.
   Con `silencioso` no lanza avisos flotantes (el resumen unico de la
   Puesta en marcha cuenta los inmuebles y los tokens con dudas). */
function descubrimientoAntesDeClasificar(silencioso) {
  const cache = state.cache;
  if (!cache || typeof descubrimientoDinamico !== "function") return null;
  const huella = () => JSON.stringify([cache.catalogo_propiedades || {},
                                       cache.contratos_aprendidos || {}]);
  const antes = huella();
  let resumen;
  try {
    log("Descubrimiento dinámico de tus inmuebles...");
    resumen = descubrimientoDinamico(cache, state.filasCsv, state.indicePorHash || {},
      normalizarDireccion(state.config.wallet), normalizarDireccion(state.config.vault));
  } catch (e) {
    console.error(e);
    log("AVISO: el descubrimiento automático falló (" + e.message +
        "); se clasifica con el catálogo actual.", "warn");
    if (typeof renderPanel === "function") renderPanel(); // js/11 cuenta con este repintado
    return null;
  }
  if (huella() !== antes) {
    marcarCacheDirty();
    autoGuardarCache(); // asincrono (en este navegador, js/05)
  }
  // El Descubrimiento automatico llena el catalogo, pero la tabla
  // «Catalogo de inmuebles» de 🔍 Revision se pinta en renderPanel: sin
  // repintarla despues de clasificar se quedaria en «(0)» aunque la cache
  // ya tenga inmuebles. Se repinta aqui (barato: js/11 solo redibuja tablas).
  if (typeof renderPanel === "function") renderPanel();
  const nConf = Object.keys(inmueblesConfirmadosCache(cache)).length;
  if (silencioso) return resumen;
  if (!nConf) {
    toast("No se ha reconocido ningún inmueble: ¿has sincronizado las transacciones on-chain? " +
          "Sin inmuebles, casi todo quedará a revisar.", "warn",
          { texto: "Ir a Puesta en marcha", fn: () => { location.hash = "#inicio"; } }, 9000);
  }
  const dudas = dudasCatalogoCache(cache).size;
  if (nConf && dudas) {
    toast(dudas + " token(s) con dudas: no se tratan como inmueble hasta que los " +
          "confirmes o descartes en 🔍 Revisión → Catálogo de inmuebles.", "warn",
          { texto: "Ir al catálogo", fn: () => { location.hash = "#revision"; } }, 9000);
  }
  return resumen;
}

/* Qué le falta a la config para clasificar, en una frase. */
function motivoConfigMal(cfg) {
  const c = cfg || {};
  // Las dos mal, las dos (como el resumen de 🚀 Puesta en marcha).
  if (!direccionValida(c.wallet) && vaultMalEscrito(c)) {
    return "Revisa tus direcciones de wallet y vault en tus datos de 🚀 Puesta en marcha.";
  }
  if (normalizarDireccion(c.wallet) && !direccionValida(c.wallet)) {
    return "La wallet está mal escrita (0x y 40 caracteres): corrígela en tus datos de 🚀 Puesta en marcha.";
  }
  if (direccionValida(c.wallet) && vaultIgualWallet(c)) {
    return "El vault no puede ser tu misma wallet: pon la dirección de tu vault o déjalo vacío en tus datos de 🚀 Puesta en marcha.";
  }
  if (direccionValida(c.wallet) && vaultMalEscrito(c)) {
    return "El vault está mal escrito: corrígelo o déjalo vacío en tus datos de 🚀 Puesta en marcha.";
  }
  return "Falta tu dirección de wallet: escríbela en tus datos de 🚀 Puesta en marcha.";
}

/* Opciones: { silencioso, detalle }. `silencioso` quita los avisos
   flotantes que no son errores; `detalle: false` resume el registro en una
   linea (la clasificacion automatica se lanza a menudo y no debe inundarlo). */
function ejecutarClasificacion(opciones) {
  const silencioso = !!(opciones && opciones.silencioso);
  const detalle = !(opciones && opciones.detalle === false);
  // avisos: false calla los avisos de «Clasificación completada» y de los
  // tokens con dudas (al guardar una decisión saldrían tres apilados), pero
  // no los de lo que falta para clasificar.
  const sinAvisos = silencioso || !!(opciones && opciones.avisos === false);
  const req = requisitosClasificacionOk();
  if (!req.cacheOk) {
    if (!silencioso) toast("Sin datos todavía: completa 🚀 Puesta en marcha.", "warn");
    return false;
  }
  if (!req.csvOk) {
    if (!silencioso) toast("Falta el archivo de rendimientos: cárgalo en 🚀 Puesta en marcha.", "warn");
    return false;
  }
  if (!req.configOk) {
    if (!silencioso) toast(motivoConfigMal(state.config), "error", { texto: "Ir a tus datos", fn: () => { location.hash = "#inicio"; } });
    return false;
  }
  // Las decisiones que ya había sin sello al abrir la cache
  // no se sellan después (js/05).
  recordarAjustesSinSello(state.cache);
  // Descubrimiento automatico antes de clasificar. Sin el, una cache nueva
  // se clasificaria con el catalogo vacio (casi todo a revisar). El boton
  // manual de la tarjeta del CSV sigue existiendo.
  const descubrimiento = descubrimientoAntesDeClasificar(sinAvisos);
  try {
    if (detalle) log("Clasificando transacciones (9 reglas)...");
    const informePagos = {};
    const registros = clasificarTransacciones(
      state.cache, state.filasCsv, state.indicePorHash || {}, state.config,
      informePagos);
    state.registros = registros;
    // Lo que dijo el motor de los vinculos (la pantalla
    // dice por que uno no se aplica) y los registros de antes de aplicarlos.
    state.informePagos = informePagos;
    state.registrosSinVinculos = informePagos.registrosSinVinculos || null;
    // Las fechas de POL sin precio de 🔍 Revisión salen de estos registros;
    // se repintan ya (el repintado del descubrimiento llega antes y pintaría
    // los de antes).
    if (typeof pnPintarPreciosPol === "function") pnPintarPreciosPol();
    // Un ajuste que siguió a su movimiento pasa a la clave
    // nueva en la cache (la pantalla busca la decisión por la clave).
    if (moverAjustes(state.cache, informePagos.ajustesMovidos || [])) {
      marcarCacheDirty();
      autoGuardarCache();
    }
    const resumen = resumenDiario(registros);
    state.ultimaClasificacion = {
      registros: registros.length, revisar: resumen.revisar.length,
      inmuebles: Object.keys(inmueblesConfirmadosCache(state.cache)).length,
      candidatas: descubrimiento ? descubrimiento.candidatas.length : null,
      fecha: new Date().toISOString(),
    };
    if (!detalle) {
      log("Clasificación automática: " + registros.length + " registros · " +
          resumen.revisar.length + " a revisar.", "ok");
      logPagosDiferidos(informePagos);
      return true;
    }
    log("Libro diario: " + registros.length + " registros.", "ok");
    for (const categoria of Object.keys(resumen.conteo).sort()) {
      log("  " + categoriaAMostrar(categoria) + ": " + resumen.conteo[categoria]);
    }
    if (resumen.bancarias.length) {
      log("Compras externas detectadas (" + resumen.bancarias.length + "), verificar:", "warn");
      for (const r of resumen.bancarias) {
        log("  " + fechaEs(r.fecha, true) + " " + (r.inmueble || r.simbolo || r.contrato) + ": " + r.cantidad +
            " tokens -> " + (Number(r.coste_eur) > 0 ? r.coste_eur + " EUR" : "sin precio"), "warn");
      }
    }
    // Log de vinculos de pagos diferidos: aplicados, avisos y conflictos.
    // Con el bloque vacio no imprime nada.
    logPagosDiferidos(informePagos);
    if (resumen.revisar.length) {
      log("REGISTROS A REVISAR (" + resumen.revisar.length + " en total):", "warn");
      for (const r of resumen.revisar) {
        log("  " + fechaEs(r.fecha, true) + " [" + r.categoria + "/" + r.subcategoria + "] " +
            (r.token || r.contrato) + ": " + r.nota +
            " (hash " + r.hash.slice(0, 18) + "...)", "warn");
      }
    }
    if (!sinAvisos) {
      toast("Clasificación completada: " + registros.length + " registros (" +
            resumen.revisar.length + " a revisar).",
            resumen.revisar.length ? "warn" : "ok");
    }
    return true;
  } catch (e) {
    console.error(e);
    log("Error durante la clasificación: " + e.message, "error");
    toast("Error durante la clasificación: " + e.message, "error");
    return false;
  }
}