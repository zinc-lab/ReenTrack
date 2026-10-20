/* =====================================================================
   REENTAL SPA · js/05-cache.js
   reental_cache.json: plantilla vacía, semillas DeFi, validación de
   estructura y guardado (automático, en el navegador).
   cacheVacia() siembra las semillas DeFi e incluye el bloque
   pagos_diferidos vacío; asegurarEstructuraCache() garantiza sus subclaves.
   ===================================================================== */

function cacheVacia() {
  const cache = {
    ultimo_bloque: { wallet: 0, vault: 0, wallet_internas: 0 },
    transacciones: { wallet_normales: [], wallet_tokens: [], wallet_internas: [], vault_normales: [], vault_tokens: [] },
    tipos_bce: {},
    bce_cobertura: { inicio: null, fin: null },
    precios_rnt: {},
    precios_rnt_no_disponibles: {},
    catalogo_propiedades: {},
    contratos_aprendidos: Object.fromEntries(ROLES_CONTRATOS.map(r => [r, {}])),
    ajustes_usuario: {},
    // Pagos diferidos de ventas / cierres de proyecto: vinculos
    // salida<->cobro en hashes DISTINTOS, confirmados explicitamente por el
    // usuario (nunca automaticos). Bloque vacio = sin vinculos: el pipeline
    // se comporta exactamente igual que sin el bloque.
    pagos_diferidos: { version: 1, ventas: [] },
    precios_pol: {},
    // Dentro de la cache los nombres son los de siempre (RCM_DIVIDENDO);
    // ver CODIGOS_ANTIGUOS en js/02.
    leyenda_casillas: {
      RCM_DIVIDENDO: { "2025": { casilla: "0033", nombre_oficial: "Rendimientos procedentes de rentas que tengan por causa la imposición de capitales y otros rendimientos del capital mobiliario a integrar en la base imponible del ahorro" } },
      RCM_STAKING:   { "2025": { casilla: "0033", nombre_oficial: "Rendimientos procedentes de rentas que tengan por causa la imposición de capitales y otros rendimientos del capital mobiliario a integrar en la base imponible del ahorro" } },
      GP_CRIPTO:     { "2025": { casilla: "1800", nombre_oficial: "Ganancias y pérdidas patrimoniales derivadas de la transmisión o permuta de monedas virtuales por particulares" } },
      GP_OTROS_ELEM: { "2025": { casilla: "1626", clave_elemento: "4", nombre_oficial: "Ganancias y pérdidas patrimoniales derivadas de transmisiones de otros elementos patrimoniales (clave 4)" } },
      GP_BASE_GRAL:  { "2025": { casilla: "0304", nombre_oficial: "Otras ganancias y pérdidas patrimoniales que no derivan de la transmisión de elementos patrimoniales, a integrar en la base imponible general" } }
    }
  };
  // Toda cache nueva nace con las semillas DeFi.
  sembrarContratosDefi(cache);
  return cache;
}
/* Las direcciones que trae la app y el usuario quitó en 🔍 Revisión: la
   lista «semillas_quitadas» de la cache. No se vuelven a sembrar y, si
   alguien las volvió a poner, se quitan otra vez. Fuera de la plantilla: solo existe
   si se quitó alguna. Mal escrita (no es una lista), no se usa ni se borra;
   avisa asegurarEstructuraCache. */
function semillasQuitadas(cache) {
  const lista = cache && cache.semillas_quitadas;
  return new Set(Array.isArray(lista) ? lista.map(normalizarDireccion).filter(Boolean) : []);
}
/* Los vaults que la app te propuso y dijiste «No es» (js/19): la lista
   «vaults_rechazados», fuera de la plantilla como «semillas_quitadas». */
function vaultsRechazados(cache) {
  const lista = cache && cache.vaults_rechazados;
  return new Set(Array.isArray(lista) ? lista.map(normalizarDireccion).filter(Boolean) : []);
}
function rechazarVault(cache, direccion) {
  cache.vaults_rechazados = [...new Set([...vaultsRechazados(cache), normalizarDireccion(direccion)])];
}
function sembrarContratosDefi(cache) {
  const aprendidos = cache.contratos_aprendidos;
  const quitadas = semillasQuitadas(cache);
  let nuevos = 0;
  for (const [rol, direcciones] of Object.entries(SEMILLAS_DEFI)) {
    const bloque = aprendidos[rol] = aprendidos[rol] || {};
    for (const [addr, nombre] of Object.entries(direcciones)) {
      const a = normalizarDireccion(addr);
      // También con la clave escrita en mayúsculas a mano.
      if (quitadas.has(a)) Object.keys(bloque).filter(k => normalizarDireccion(k) === a).forEach(k => delete bloque[k]);
      else if (!(a in bloque)) { bloque[a] = nombre; nuevos++; }
    }
  }
  return nuevos;
}
/* El catálogo o un rol que no son un objeto se empiezan vacíos; una
   entrada del catálogo que no es un objeto («CONFIRMADA» en vez de
   {estado: …}) se aparta en catalogo_no_leido (no se pierde) y se avisa. */
function saneaCatalogoYRoles(cache) {
  const esObj = esObjetoCache;
  if (!esObj(cache.catalogo_propiedades)) cache.catalogo_propiedades = {};
  const catalogo = cache.catalogo_propiedades;
  const raros = Object.keys(catalogo).filter(a => !esObj(catalogo[a]));
  if (raros.length) {
    if (!esObj(cache.catalogo_no_leido)) cache.catalogo_no_leido = {};
    for (const a of raros) { cache.catalogo_no_leido[a] = catalogo[a]; delete catalogo[a]; }
    if (typeof log === "function") {
      log("  AVISO: " + raros.length + " entrada(s) del catalogo mal escrita(s) se apartan en «catalogo_no_leido»: " + raros.join(", "), "warn");
    }
  }
  // El spam de todo un token o una dirección (spam_usuario, js/18): si el
  // bloque o sus tokens están mal escritos, no se usan; se apartan en
  // «spam_usuario_no_leido» (no se pierden) y se avisa.
  const apartarSpam = v => {
    const previo = cache.spam_usuario_no_leido;
    cache.spam_usuario_no_leido = previo === undefined ? v : [].concat(previo, [v]);
    if (typeof log === "function") log("  AVISO: el spam de tokens o direcciones de la cache estaba mal escrito: se aparta en «spam_usuario_no_leido».", "warn");
  };
  const spam = cache.spam_usuario;
  if (spam !== undefined && spam !== null && !esObj(spam)) { apartarSpam(spam); delete cache.spam_usuario; }
  else if (esObj(spam) && spam.tokens !== undefined && spam.tokens !== null && !esObj(spam.tokens)) { apartarSpam({ tokens: spam.tokens }); delete spam.tokens; }
  // Formato viejo: «Descartar» era un estado (DESCARTADA); ahora es el spam
  // de todo el token, como en 📒 (se recupera con su ↩). Queda con dudas
  // debajo.
  const descartadas = Object.keys(catalogo).filter(a => estadoCatalogo(catalogo[a]) === "DESCARTADA");
  if (descartadas.length) {
    if (!esObj(cache.spam_usuario)) cache.spam_usuario = {};
    if (!esObj(cache.spam_usuario.tokens)) cache.spam_usuario.tokens = {};
    const tokens = cache.spam_usuario.tokens;
    const ya = new Set(Object.keys(tokens).map(normalizarDireccion));
    for (const a of descartadas) {
      const e = catalogo[a], clave = normalizarDireccion(a);
      if (!ya.has(clave)) tokens[clave] = e.simbolo ? { fecha: "", simbolo: String(e.simbolo) } : { fecha: "" };
      e.estado = "CANDIDATA";
    }
  }
  if (!esObj(cache.contratos_aprendidos)) cache.contratos_aprendidos = {};
  for (const rol of new Set([...ROLES_CONTRATOS, ...Object.keys(cache.contratos_aprendidos)])) {
    if (!esObj(cache.contratos_aprendidos[rol])) cache.contratos_aprendidos[rol] = {};
  }
  // Un rol que se empezó vacío recupera sus semillas DeFi.
  sembrarContratosDefi(cache);
}
function asegurarEstructuraCache(cache) {
  const plantilla = cacheVacia();
  for (const [clave, valor] of Object.entries(plantilla)) {
    if (cache[clave] === undefined) cache[clave] = valor;
  }
  for (const serie of Object.keys(plantilla.transacciones)) {
    if (!Array.isArray(cache.transacciones[serie])) cache.transacciones[serie] = [];
  }
  for (const clave of Object.keys(plantilla.ultimo_bloque)) {
    if (typeof cache.ultimo_bloque[clave] !== "number") cache.ultimo_bloque[clave] = 0;
  }
  saneaCatalogoYRoles(cache);
  if (typeof cache.precios_rnt_no_disponibles !== "object" || cache.precios_rnt_no_disponibles === null)
    cache.precios_rnt_no_disponibles = {};
  // Pagos diferidos: una cache antigua sin el bloque lo recibe vacio de la
  // plantilla (bucle anterior); aqui se garantizan las subclaves por si el
  // bloque existia incompleto o invalido. Sin vinculos confirmados el
  // comportamiento es identico a no tener el bloque.
  // Con null, un bloque vacio; si no es un objeto o «ventas» no es una
  // lista, se aparta tal cual en «pagos_diferidos_no_leidos» (una lista: no
  // se pierde nada) y se empieza vacio, con aviso. No cambiar unas «ventas»
  // mal escritas por []: el siguiente guardado las borraria.
  const bloquePd = cache.pagos_diferidos;
  if (bloquePd === null) {
    cache.pagos_diferidos = { version: 1, ventas: [] };
  } else if (typeof bloquePd !== "object" || Array.isArray(bloquePd) ||
             !(bloquePd.ventas === undefined || bloquePd.ventas === null || Array.isArray(bloquePd.ventas))) {
    const apartados = cache.pagos_diferidos_no_leidos;
    cache.pagos_diferidos_no_leidos = Array.isArray(apartados) ? apartados
      : (apartados === undefined || apartados === null ? [] : [apartados]);
    cache.pagos_diferidos_no_leidos.push(bloquePd);
    cache.pagos_diferidos = { version: 1, ventas: [] };
    if (typeof log === "function") {
      log("  AVISO: los vinculos de pagos diferidos de la cache estaban mal escritos: " +
          "se apartan en «pagos_diferidos_no_leidos» y no se aplican.", "warn");
    }
  }
  for (const [clavePd, valorPd] of Object.entries(plantilla.pagos_diferidos)) {
    const actual = cache.pagos_diferidos[clavePd];
    if (actual === undefined || actual === null) cache.pagos_diferidos[clavePd] = valorPd;
  }
  const quitadas = cache.semillas_quitadas;
  if (quitadas !== undefined && quitadas !== null && !Array.isArray(quitadas) && typeof log === "function") {
    log("  AVISO: «semillas_quitadas» de la cache está mal escrita: las direcciones que trae la app se usan todas.", "warn");
  }
  // Los dos bloques de «un solo archivo», si vienen mal escritos, no
  // se usan ni se borran (los sustituye el siguiente bueno).
  for (const [bloque, leer, queEs] of [["configuracion", leerConfiguracionCache, "tus datos"],
                                       ["archivo_rendimientos", leerArchivoRendimientosCache, "el archivo de rendimientos"]]) {
    if (cache[bloque] !== undefined && cache[bloque] !== null && !leer(cache) && typeof log === "function") {
      log("  AVISO: «" + bloque + "» de la cache está mal escrito: no se usa " + queEs + " que trae.", "warn");
    }
  }
  // Unos precios de POL mal escritos se apartan ya al abrir, no al usarlos.
  if (typeof bloquePrecios === "function") bloquePrecios(cache, "precios_pol");
  sembrarContratosDefi(cache);
  return cache;
}

/* ----------------------------- Un solo archivo -----------------------------
   La cache lleva también tus datos («configuracion»: wallet, vault, nombre
   y NIF) y el archivo de rendimientos de Reental («archivo_rendimientos»).
   Fuera de la plantilla (cacheVacia): solo están si hay algo que guardar,
   así las caches nuevas siguen iguales. Leer devuelve null si el bloque
   falta o está mal escrito; poner escribe solo esos campos.
   Con la casilla de «Tus datos» marcada (js/04),
   «configuracion» lleva también las API keys (`conClaves`). Leer las da
   solo si son texto: una mal escrita no invalida tus datos ni borra la tuya. */
const CLAVES_API = ["etherscan_api_key", "coingecko_api_key"];
const textoONada = v => (typeof v === "string" ? v : v === undefined || v === null ? "" : null);
function leerConfiguracionCache(cache) {
  const b = cache && cache.configuracion;
  if (!esObjetoCache(b)) return null;
  const inv = b.inversor === undefined || b.inversor === null ? {} : b.inversor;
  if (!esObjetoCache(inv)) return null;
  const datos = { wallet: textoONada(b.wallet), vault: textoONada(b.vault),
                  inversor: { nombre: textoONada(inv.nombre), nif: textoONada(inv.nif) } };
  if ([datos.wallet, datos.vault, datos.inversor.nombre, datos.inversor.nif].includes(null)) return null;
  for (const k of CLAVES_API) if (typeof b[k] === "string") datos[k] = b[k];
  return datos;
}
function ponerConfiguracionCache(cache, cfg, conClaves) {
  const c = cfg || {}, inv = esObjetoCache(c.inversor) ? c.inversor : {};
  const texto = v => (typeof v === "string" ? v.trim() : "");
  cache.configuracion = { wallet: normalizarDireccion(texto(c.wallet)), vault: normalizarDireccion(texto(c.vault)),
                          inversor: { nombre: texto(inv.nombre), nif: texto(inv.nif) } };
  if (conClaves) for (const k of CLAVES_API) cache.configuracion[k] = texto(c[k]);
  return cache.configuracion;
}
// Tus datos según la casilla (js/04, datosEnArchivo): con ella,
// también las API keys; sin ella, solo la wallet y el vault. Tu archivo
// (js/04) y sus copias (js/24) los ponen igual.
function ponerConfiguracionSegunCasilla(cache, cfg, conDatos) {
  const c = cfg || {};
  return ponerConfiguracionCache(cache, conDatos ? c : { wallet: c.wallet, vault: c.vault }, conDatos);
}
function leerArchivoRendimientosCache(cache) {
  const b = cache && cache.archivo_rendimientos;
  if (!esObjetoCache(b) || typeof b.texto !== "string" || !b.texto.trim()) return null;
  const nombre = textoONada(b.nombre), cargado = textoONada(b.cargado);
  if (nombre === null || cargado === null) return null;
  return { nombre, texto: b.texto, cargado };
}
function ponerArchivoRendimientosCache(cache, nombre, texto, ahora) {
  cache.archivo_rendimientos = { nombre: typeof nombre === "string" ? nombre.trim() : "", texto: String(texto),
                                 cargado: (ahora || new Date()).toISOString() };
  return cache.archivo_rendimientos;
}
/* ¿Es una reental_cache.json? Tiene que traer su bloque
   «transacciones», y «ultimo_bloque» y «contratos_aprendidos», si vienen,
   tienen que ser objetos (asegurarEstructuraCache no puede rellenarlos;
   pdEsObjeto es de js/14, que ya está cargado cuando se usan).
   Así un config.json u otro .json no se convierte en cache ni se
   sobrescribe. Devuelve el motivo, o "" si vale. */
function errorCache(obj) {
  const mal = !pdEsObjeto(obj) || !pdEsObjeto(obj.transacciones) ||
    ["ultimo_bloque", "contratos_aprendidos"].some(k => k in obj && !pdEsObjeto(obj[k]));
  return mal ? "Ese archivo no es tu archivo de la app (reental_cache.json)." : "";
}

/* Lo que se escribe en «Ajustes en JSON» tiene que ser un objeto
   {clave: {campo: valor}}; null, una lista o una entrada que no sea un
   objeto se rechazan antes de guardar nada. Devuelve el motivo, o "" si vale. */
// Importes que no pueden ser negativos (gp_eur si: un pool puede perder).
// Los usa también el motor (js/21, fiscValidarRegistro).
const CAMPOS_NO_NEGATIVOS = ["importe_usdt", "coste_eur", "cobrado_eur", "integro_usdt", "retencion_usdt"];
function errorAjustesUsuario(obj) {
  if (!pdEsObjeto(obj)) return "Debe ser un objeto JSON {clave: {...}}";
  const mala = Object.keys(obj).find(k => !pdEsObjeto(obj[k]));
  if (mala !== undefined) return "«" + mala + "» debe ser un objeto {campo: valor}";
  // La nota, un texto (el motor no añade otra cosa).
  const sinTexto = Object.keys(obj).find(k => "nota" in obj[k] && typeof obj[k].nota !== "string");
  if (sinTexto !== undefined) return "La nota de «" + sinTexto + "» debe ser un texto entre comillas";
  // Un importe o una cantidad negativos no se aceptan: 📊 Dashboard y
  // 💰 Rendimientos los suman (el motor los manda a revisar); uno guardado
  // de antes se queda así. gp_eur sí puede: un pool puede perder.
  // También con el nombre antiguo del campo (bruto_usdt, que
  // aplicarAjustesUsuario traduce) y sin números imposibles (1e999 se lee
  // como infinito y al guardar se pierde).
  for (const k of Object.keys(obj)) {
    for (const [campo, v] of Object.entries(obj[k])) {
      if (typeof v !== "number") continue;
      if (!Number.isFinite(v)) return "«" + campo + "» de «" + k + "» no es un número válido";
      if (v < 0 && ["cantidad", ...CAMPOS_NO_NEGATIVOS].includes(campoVigente(campo))) return "«" + campo + "» de «" + k + "» no puede ser negativo";
    }
  }
  return "";
}
/* Objeto JSON ({...}): como pdEsObjeto de js/14, que no siempre está cargado
   cuando se usa este módulo (p. ej. en los tests de la descarga). */
function esObjetoCache(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
/* El sello de cada ajuste (origen, destino y cantidad del movimiento al
   que se puso), en ajustes_movimiento {clave: sello}. La clave de un
   registro lleva un sufijo ::n que sale del orden y puede cambiar al
   reclasificar; con el sello, el motor lleva la decisión a su movimiento
   (aplicarAjustesUsuario).
   Se sella con los registros de antes de los ajustes (los que vio el
   usuario); un ajuste ya sellado conserva su sello y uno que no está en
   ajustes_usuario lo pierde. Los rendimientos del archivo (csv::) tienen
   clave fija y no se sellan. Solo se sellan las decisiones nuevas: las que
   ya había sin sello al abrir la cache (recordarAjustesSinSello) siguen
   por su clave, como antes; así guardar una nota o deshacer una decisión
   deja la cache exactamente como estaba. */
const AJUSTES_SIN_SELLO_AL_ABRIR = new WeakMap();
function recordarAjustesSinSello(cache) {
  if (!esObjetoCache(cache) || AJUSTES_SIN_SELLO_AL_ABRIR.has(cache)) return;
  const sellados = sellosAjustes(cache);
  const ajustes = esObjetoCache(cache.ajustes_usuario) ? cache.ajustes_usuario : {};
  AJUSTES_SIN_SELLO_AL_ABRIR.set(cache, new Set(Object.keys(ajustes)
    .map(k => k.trim().toLowerCase()).filter(k => !sellados.has(k))));
}
function sellarAjustes(cache, registros) {
  if (!esObjetoCache(cache) || !esObjetoCache(cache.ajustes_usuario) || !Array.isArray(registros)) return;
  const porClave = new Map(registros.map(r => [r.clave, r]));
  const previos = sellosAjustes(cache);
  const antiguos = AJUSTES_SIN_SELLO_AL_ABRIR.get(cache) || new Set();
  const sellos = [];
  for (const clave of Object.keys(cache.ajustes_usuario)) {
    const k = clave.trim().toLowerCase();
    if (k.startsWith("csv::")) continue;
    if (previos.has(k)) { sellos.push([k, previos.get(k)]); continue; }
    if (antiguos.has(k)) continue;
    const r = porClave.get(k);
    if (r) sellos.push([k, { origen: r.origen, destino: r.destino, cantidad: r.cantidad === undefined ? null : r.cantidad }]);
  }
  if (sellos.length) cache.ajustes_movimiento = Object.fromEntries(sellos);
  else delete cache.ajustes_movimiento;
}
/* Los ajustes que siguieron a su movimiento (movidos:
   [clave del ajuste, clave nueva]) pasan a la clave nueva, con su sello.
   Uno que se quedó sin movimiento ([clave, null]) y ocupa la clave que
   necesita otro se aparta a una clave libre del mismo hash (::100,
   ::101...; no se borra, y si su movimiento vuelve, vuelve a él). Si aun
   así dos acabaran en la misma clave no se mueve ninguno (el motor los
   sigue llevando a su movimiento igual). Devuelve si cambió algo. */
function moverAjustes(cache, movidos) {
  if (!movidos.length || !esObjetoCache(cache) || !esObjetoCache(cache.ajustes_usuario)) return false;
  const destino = new Map(movidos.filter(([, nueva]) => nueva));
  if (!destino.size) return false;
  const ocupadas = new Set([...destino.values()].map(k => k.trim().toLowerCase()));
  const usadas = new Set(Object.keys(cache.ajustes_usuario).map(k => k.trim().toLowerCase()));
  for (const [huerfana, nueva] of movidos) {
    if (nueva || !ocupadas.has(huerfana.trim().toLowerCase())) continue;
    const base = baseClave(huerfana.trim().toLowerCase());
    let n = 100;
    while (usadas.has(base + "::" + n)) n++;
    destino.set(huerfana, base + "::" + n);
    usadas.add(base + "::" + n);
  }
  const sellos = sellosAjustes(cache);
  const ajustes = Object.entries(cache.ajustes_usuario).map(([k, v]) => [destino.has(k) ? destino.get(k) : k, v, k]);
  const finales = ajustes.map(([k]) => k.trim().toLowerCase());
  if (new Set(finales).size !== finales.length) return false;
  cache.ajustes_usuario = Object.fromEntries(ajustes.map(([k, v]) => [k, v]));
  const nuevosSellos = ajustes
    .filter(([, , viejo]) => sellos.has(viejo.trim().toLowerCase()))
    .map(([k, , viejo]) => [k.trim().toLowerCase(), sellos.get(viejo.trim().toLowerCase())]);
  if (nuevosSellos.length) cache.ajustes_movimiento = Object.fromEntries(nuevosSellos);
  else delete cache.ajustes_movimiento;
  return true;
}
/* Las series y los últimos bloques de cada dirección, y los grupos
   («wallet», «vault») cuya dirección de la configuración no es para la que
   se descargaron (direcciones_descargadas en la cache). Una cache de antes
   o un vault quitado no cuentan (lo segundo ya se avisa en js/19). */
const GRUPOS_DIRECCION = {
  wallet: [["wallet_normales", "wallet_tokens", "wallet_internas"], ["wallet", "wallet_internas"]],
  vault: [["vault_normales", "vault_tokens"], ["vault"]],
};
function direccionesCambiadas(cache, wallet, vault) {
  const guardadas = esObjetoCache(cache) && esObjetoCache(cache.direcciones_descargadas) ? cache.direcciones_descargadas : null;
  if (!guardadas) return [];
  const actuales = { wallet: normalizarDireccion(wallet || ""), vault: normalizarDireccion(vault || "") };
  return Object.keys(GRUPOS_DIRECCION).filter(g => typeof guardadas[g] === "string" && guardadas[g] &&
    actuales[g] && normalizarDireccion(guardadas[g]) !== actuales[g]);
}
function marcarCacheDirty() {
  if (state.cache && typeof sellosAjustes === "function") sellarAjustes(state.cache, state.registrosSinVinculos || state.registros);
  state.cacheDirty = true;
}
/* Tu archivo se guarda solo en este navegador (IndexedDB, registro
   «archivo»), sin permisos ni botón y en cualquier navegador. Va con lo
   que dijo la última descarga (prep y vault); lo lee al abrir la
   página js/19 (arrRestaurarRecordados). */
const ALMACEN_ARCHIVO = "archivo";
// Lo único que escribe tu archivo (los arneses lo cambian para contar escrituras). Lanza si no se pudo.
async function escribirArchivoNavegador(cache, extra) {
  await idbOperar("readwrite", s => s.put({ ...extra, texto: JSON.stringify(cache) }, ALMACEN_ARCHIVO));
}
// De uno en uno; los que llegan con uno esperando se juntan con él (al empezar, guarda lo último).
let colaGuardado = Promise.resolve(), guardadoEsperando = null;
function autoGuardarCache() {
  if (!state.cache) return Promise.resolve();
  if (guardadoEsperando) return guardadoEsperando;
  guardadoEsperando = colaGuardado = colaGuardado.then(guardarCacheYa);
  return guardadoEsperando;
}
async function guardarCacheYa() {
  guardadoEsperando = null;
  const cache = state.cache;
  // Con «🧹 Olvidar todo» en marcha, nada vuelve a guardarse.
  // Tampoco desde una pestaña bloqueada (la app está abierta en otra),
  // ni si no se pudo leer lo guardado (se escribiría encima).
  if (!cache || (typeof arr !== "undefined" && (arr.olvidando || arr.soloLectura))) return;
  if (typeof arr !== "undefined" && arr.sinLeer) { state.errorGuardar = true; return; }   // la pantalla dice que no se guarda
  try {
    await escribirArchivoNavegador(cache, { cuando: Date.now(), prep: typeof arr !== "undefined" ? arr.ultimaPreparacion : null,
      vault: (state.sync && state.sync.vault) || null });
    state.errorGuardar = false;
    if (state.cache === cache) state.cacheDirty = false;
    if (typeof arrTrasGuardar === "function") arrTrasGuardar();
  } catch (e) {
    state.errorGuardar = true;
    if (state.cache === cache) state.cacheDirty = true;   // un guardado anterior que salió bien ya lo había dado por guardado
    if (typeof log === "function") log("No se pudo guardar en este navegador: " + (e && e.message), "warn");
  }
}
function inmueblesConfirmados(cache) {
  const conf = {};
  for (const [addr, e] of Object.entries(cache.catalogo_propiedades || {})) {
    if (estadoCatalogo(e) !== "CONFIRMADA") continue;
    conf[addr] = e;
  }
  return conf;
}