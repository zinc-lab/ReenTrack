/* =====================================================================
   REENTAL SPA · js/04-config.js
   Configuración del usuario: lectura/escritura del formulario (tarjeta 1
   de 🚀 Puesta en marcha), config.json y localStorage como respaldo.
   No hay apartado de «Parámetros fiscales» en la interfaz. El coste de las
   compras externas de inmuebles es una REGLA FIJA de 100 € por
   token, que se aplica en los TRES caminos por los que entra la config
   (formulario, config.json del disco y copia del navegador al arrancar,
   js/13) y se escribe al exportar config.json.
   La retención (se lee del archivo de Reental, nunca se supone), la fecha
   de adquisición y la key de CoinGecko no se editan: se conserva lo que
   traiga la config para no perder nada al volver a guardarla.
   Tus datos (wallet, vault, nombre y NIF) van también DENTRO de la cache
   («configuracion», js/05) cada vez que se guardan; al abrir el archivo,
   mandan los suyos (`configDesdeCache`). localStorage sigue sirviendo
   mientras no hay archivo.
   La casilla «en tus copias» de «Tus datos» decide si tu archivo lleva
   también las API keys, el nombre y el NIF (marcada de entrada; su estado
   se recuerda en este navegador). Desmarcada, solo la wallet y el vault:
   lo demás se queda en tus datos del navegador (reental_config).
   ===================================================================== */

const CONFIG_DATOS_EN_ARCHIVO = "reental_datos_en_archivo";   // clave de localStorage
function datosEnArchivo() {
  try { return localStorage.getItem(CONFIG_DATOS_EN_ARCHIVO) !== "no"; } catch (e) { return true; }
}
// La casilla (index.html, id cfgDatosEnArchivo; la escucha js/19 con los
// demás campos): recuerda su estado y lo aplica ya a tu archivo abierto (se
// guarda al momento).
function alCambiarDatosEnArchivo(casilla) {
  try { localStorage.setItem(CONFIG_DATOS_EN_ARCHIVO, casilla.checked ? "si" : "no"); } catch (e) { /* bloqueado */ }
  guardarConfigEnCache();
}

const COSTE_BANCARIA_EUR_POR_TOKEN = 100;

/* Aplica las reglas fijas sobre un objeto de configuración y lo devuelve.
   Si tu config.json traía otro valor por token, se sustituye por 100; los
   valores por compra se editan aparte (coste de adquisición, en 🔍). */
function aplicarReglasFijasConfig(cfg) {
  const c = cfg || {};
  c.compra_bancaria_coste_eur_por_token = COSTE_BANCARIA_EUR_POR_TOKEN;
  if (c.retencion_irpf_pct === undefined || c.retencion_irpf_pct === null) c.retencion_irpf_pct = 19;
  if (c.fecha_adquisicion_token === undefined) c.fecha_adquisicion_token = null;
  if (c.coingecko_api_key === undefined) c.coingecko_api_key = "";
  return c;
}

/* «inversor» siempre un objeto (una lista o un texto, escritos a mano,
   perderían el nombre y el NIF que escribías). */
function inversorComoObjeto(cfg) {
  const i = cfg.inversor;
  if (!i || typeof i !== "object" || Array.isArray(i)) cfg.inversor = {};
  return cfg.inversor;
}

/* Un config.json sin API key, nombre o NIF no borra los que ya tenías
   escritos. */
function conservarDatosConfig(nueva, previa) {
  const vacio = v => !String(v ?? "").trim();
  const p = previa || {};
  if (vacio(nueva.etherscan_api_key) && !vacio(p.etherscan_api_key)) nueva.etherscan_api_key = p.etherscan_api_key;
  inversorComoObjeto(nueva);
  for (const k of ["nombre", "nif"]) {
    const antes = (p.inversor || {})[k];
    if (vacio(nueva.inversor[k]) && !vacio(antes)) nueva.inversor[k] = antes;
  }
  return nueva;
}

function leerConfigDesdeFormulario() {
  state.config.etherscan_api_key = $("cfgEthKey").value.trim();
  state.config.wallet = normalizarDireccion($("cfgWallet").value);
  state.config.vault = normalizarDireccion($("cfgVault").value);
  inversorComoObjeto(state.config).nombre = $("cfgNombre").value.trim();
  state.config.inversor.nif = $("cfgNif").value.trim();
  aplicarReglasFijasConfig(state.config);
}
function volcarConfigAFormulario() {
  const c = state.config || {};
  $("cfgEthKey").value = c.etherscan_api_key || "";
  $("cfgWallet").value = c.wallet || "";
  $("cfgVault").value = c.vault || "";
  $("cfgNombre").value = (c.inversor || {}).nombre || "";
  $("cfgNif").value = (c.inversor || {}).nif || "";
  if ($("cfgDatosEnArchivo")) $("cfgDatosEnArchivo").checked = datosEnArchivo();
}
function configValidaParaSincronizar() {
  const problemas = [];
  if (!(state.config.etherscan_api_key || "").trim()) problemas.push("API key de Etherscan");
  // La misma regla que el paso 1 y la clasificación
  // (js/02): nada se descarga con una dirección a medio escribir.
  const wallet = state.config.wallet;
  if (!direccionValida(wallet)) problemas.push(normalizarDireccion(wallet) ? "wallet bien escrita (0x y 40 caracteres)" : "dirección de wallet");
  // La dirección del vault es OPCIONAL. Si está, se
  // descargan también sus movimientos; si no, se sincroniza solo la wallet.
  if (vaultMalEscrito(state.config)) problemas.push(vaultIgualWallet(state.config) ? "vault distinto de tu wallet, o vacío" : "vault bien escrito (0x y 40 caracteres) o vacío");
  return problemas;
}
function guardarConfigSoloNavegador() {
  try { localStorage.setItem("reental_config", JSON.stringify(state.config)); } catch (e) { /* lleno */ }
}
function guardarConfigLocalSilencioso() {
  guardarConfigSoloNavegador();
  guardarConfigEnCache();
}
/* Tus datos, también dentro de la cache abierta; solo si cambian,
   para no guardarla sin motivo. Devuelve true si cambiaron. Con
   la casilla, también las API keys; sin ella, ni las claves ni el nombre
   y el NIF. */
function guardarConfigEnCache() {
  if (!state.cache) return false;
  const antes = JSON.stringify(state.cache.configuracion);
  ponerConfiguracionSegunCasilla(state.cache, state.config, datosEnArchivo());
  if (JSON.stringify(state.cache.configuracion) === antes) return false;
  marcarCacheDirty();
  autoGuardarCache();
  return true;
}
/* Al abrir el archivo, mandan sus datos (wallet, vault, nombre y NIF; y
   las API keys, si las lleva); uno vacío en el archivo no borra lo que
   tenías. Devuelve true si cambió algo de la config. */
function configDesdeCache(cache) {
  const datos = leerConfiguracionCache(cache);
  if (!datos) return false;
  const antes = JSON.stringify(state.config);
  const c = state.config;
  // Uno con solo espacios cuenta como vacío (no borra el tuyo).
  const t = v => v.trim();
  // Si lo del navegador es de otra wallet (un ordenador
  // compartido que no se olvidó): su vault, nombre, NIF y API keys no
  // completan los de tu archivo; se quedan los de tu archivo, aunque vacíos.
  if (t(datos.wallet) && normalizarDireccion(c.wallet) && normalizarDireccion(c.wallet) !== normalizarDireccion(datos.wallet)) {
    c.vault = "";
    c.inversor = {};
    for (const k of CLAVES_API) c[k] = "";
  }
  if (t(datos.wallet)) c.wallet = t(datos.wallet);
  if (t(datos.vault)) c.vault = t(datos.vault);
  const inv = inversorComoObjeto(c);
  if (t(datos.inversor.nombre)) inv.nombre = t(datos.inversor.nombre);
  if (t(datos.inversor.nif)) inv.nif = t(datos.inversor.nif);
  for (const k of CLAVES_API) if (t(datos[k] || "")) c[k] = t(datos[k]);
  aplicarReglasFijasConfig(c);
  volcarConfigAFormulario();
  return JSON.stringify(state.config) !== antes;
}
/* ¿Es de verdad un config.json? Devuelve el motivo si no lo es, o null.
   Sin esto, una lista, un número o tu cache pasarían por config y la que
   tenías se perdería. */
const CONFIG_CLAVES = ["wallet", "vault", "etherscan_api_key", "coingecko_api_key", "inversor",
  "compra_bancaria_coste_eur_por_token", "retencion_irpf_pct", "fecha_adquisicion_token"];
function motivoConfigNoValida(obj) {
  if (!pdEsObjeto(obj)) return "Ese archivo no es un config.json.";
  if ("transacciones" in obj || "catalogo_propiedades" in obj) {
    return "Ese es tu archivo de la app, no un config.json: ábrelo con «📂 Abrir copia».";
  }
  if (!CONFIG_CLAVES.some(k => k in obj)) return "Ese archivo no es un config.json: no trae wallet, vault ni API key.";
  for (const k of ["wallet", "vault", "etherscan_api_key"]) {
    if (obj[k] !== undefined && obj[k] !== null && typeof obj[k] !== "string") return "Ese config.json está mal escrito: «" + k + "» no es un texto.";
  }
  return null;
}

/* Un config.json ya leído y comprobado (también desde «📂 Abrir mi
   archivo», js/19): sus datos sustituyen a los tuyos, sin borrar lo escrito
   que él no trae, y entran en tu archivo si está abierto. */
function usarConfigAbierta(obj) {
  leerConfigDesdeFormulario(); // lo escrito, para conservarlo
  state.config = aplicarReglasFijasConfig(conservarDatosConfig(obj, state.config)); // 100 €/token
  volcarConfigAFormulario();
  guardarConfigLocalSilencioso();
  toast("config.json cargado ✔", "ok");
}