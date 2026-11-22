/* =====================================================================
   REENTAL SPA · js/11-panel.js
   Parte de abajo de 🔍 Revisión: catálogo de inmuebles, precios de RNT y
   de POL, contratos conocidos y ajustes en JSON (con los precios RNT
   faltantes protegidos).
   Cada bloque es una tarjeta plegable,
   cerrada por defecto; el catálogo se abre solo si hay tokens con dudas y
   los precios de RNT si falta alguna fecha. El catálogo se decide con
   botones (sin desplegable de estado) y los contratos se pueden añadir y
   quitar. Lo que cambia la clasificación (catálogo y contratos) reclasifica
   al momento, como los ajustes.
   Los precios de POL, como los de RNT: sin formulario
   libre, solo las fechas que el motor necesita y CoinGecko no dio, y el
   bloque se abre solo si falta alguna.
   ===================================================================== */

/* ----------------------------- Catálogo (puro) ----------------------------- */

/* El estado de cada entrada en llano. Una CANDIDATA cuyo token mandaste al
   spam entero («Todo el token» en 📒 o «Descartar» aquí) no sale en el
   catálogo: para el motor ya es spam, y confirmarla lo desharía; se
   recupera con su ↩ en 📒 Transacciones (salvo si la app reconoce la
   dirección: ahí el spam no le alcanza, dudasCatalogoCache de js/14). Una
   DESCARTADA (formato viejo) ya no llega: js/05 la pasa al spam al abrir. */
const PN_ESTADOS = { CONFIRMADA: "Inmueble", CANDIDATA: "Con dudas" };
/* Botones de cada estado: [estado nuevo, texto, burbuja]. «Descartar» no es
   un estado: manda todo el token al spam (pnDescartarToken). */
const PN_BOTON = {
  CONFIRMADA: ["CONFIRMADA", "✔ Confirmar", "Es un inmueble."],
  DESCARTADA: ["DESCARTADA", "🚫 Descartar", "No es un inmueble: todo el token pasa a spam. Se deshace con ↩ en 📒."],
};
const PN_BOTONES_CATALOGO = {
  CONFIRMADA: [PN_BOTON.DESCARTADA],
  CANDIDATA: [PN_BOTON.CONFIRMADA, PN_BOTON.DESCARTADA],
};

/* Filas del catálogo, por fecha de primera aparición (sin fecha, al final). */
function pnFilasCatalogo(cache) {
  const catalogo = (cache && cache.catalogo_propiedades) || {};
  const dudas = cache ? dudasCatalogoCache(cache) : new Set(); // js/14
  return Object.entries(catalogo)
    .filter(([, e]) => e && typeof e === "object")
    .sort((a, b) => String(a[1].primera_aparicion || "9999").localeCompare(String(b[1].primera_aparicion || "9999"))) // un número escrito a mano no rompe 🔍
    .map(([addr, e]) => {
      const estado = estadoCatalogo(e); // una errata sale con dudas
      return { addr, entrada: e, estado: estado === "CANDIDATA" && !dudas.has(normalizarDireccion(addr)) ? "SPAM" : estado };
    });
}

/* Enlace corto a un contrato en Polygonscan (como el hash en el resto de la app). */
function pnEnlaceContrato(addr) {
  const a = String(addr || "");
  return '<a class="mono" href="https://polygonscan.com/address/' + encodeURIComponent(a) +
    '" target="_blank" rel="noopener" title="' + ccEsc(a) + ' · ver en Polygonscan">' + ccEsc(txHashCorto(a)) + " ↗</a>";
}

function pnHtmlFilaCatalogo(f, sinTokens) {
  const e = f.entrada;
  const nombre = e.nombre_reental || e.nombre_etherscan || "(sin nombre)";
  const botones = PN_BOTONES_CATALOGO[f.estado].map(([nuevo, texto, ayuda]) =>
    '<button type="button" class="rv-boton" data-addr="' + ccEsc(f.addr) + '" data-estado="' + nuevo +
    '" aria-label="' + ccEsc(texto.replace(/^\S+ /, "") + ": " + ayuda) + '">' + texto +
    '<span class="rv-burbuja" aria-hidden="true">' + ccEsc(ayuda) + "</span></button>").join("");
  return '<tr data-addr="' + ccEsc(f.addr) + '"' + (sinTokens ? ' class="rv-sin-tokens"' : "") + ">" +
    "<td>" + ccEsc(nombre) + "</td>" +
    "<td>" + ccEsc(String(e.simbolo || "").replace(/^reental-(?=\S)/i, "")) + "</td>" +
    "<td>" + ccEsc(e.primera_aparicion ? fechaEs(e.primera_aparicion) : "—") + "</td>" +
    "<td>" + pnEnlaceContrato(f.addr) + "</td>" +
    '<td><span class="badge ' + f.estado + '">' + ccEsc(PN_ESTADOS[f.estado]) + "</span></td>" +
    '<td class="rv-acciones">' + botones + "</td></tr>";
}

/* «Ver todos» del catálogo: apagado, solo los inmuebles que tienes. Se
   esconden los confirmados sin ningún token en tu wallet ni en tu vault
   (vendidos, canjeados o pasados a otra wallet); nunca uno con dudas ni uno
   con saldo negativo (falta historia en la descarga: en la duda, se ve),
   ni uno con un movimiento que no se pudo leer, ni uno que acabas de
   confirmar (se iría al pulsar). Sin vault en tus datos no se esconde nada:
   lo que pasaste al vault parecería vendido. s = dashSaldosCatalogo (js/16).
   No se recuerda al abrir. */
let pnVerTodos = false;
const pnConfirmadosAhora = new Set();
function pnSinTokens(f, s) {
  const a = normalizarDireccion(f.addr);
  return f.estado === "CONFIRMADA" && red6(s.saldos.get(a) || 0) === 0 && !(s.ilegibles && s.ilegibles.has(a)) &&
    !pnConfirmadosAhora.has(a);
}

/* Lo que sale en el catálogo: inmuebles y con dudas (sin lo mandado al spam). */
function pnFilasVisibles(filas) {
  return filas.filter(f => f.estado in PN_BOTONES_CATALOGO);
}

function pnHtmlCatalogo(filas, sinTokens = new Set()) {
  return filas.length
    ? filas.map(f => pnHtmlFilaCatalogo(f, sinTokens.has(f.addr))).join("")
    : '<tr><td colspan="6" class="rv-vacio">Sin inmuebles todavía.</td></tr>';
}

/* ----------------------------- Contratos conocidos (puro) -----------------------------
   Se añaden y se quitan. Solo los tipos DeFi e infraestructura: los
   distribuidores y la liquidación de Reental salen del archivo de Reental.
   Lo aprendido del archivo no se quita (se vuelve a poner al abrir la
   cache). Las semillas DeFi sí, con un aviso: quedan en
   «semillas_quitadas» para no sembrarlas otra vez (js/05). */
const PN_TIPOS_CONTRATO = {
  DISTRIBUIDOR: "Distribuidor de Reental",
  SETTLEMENT: "Liquidación de Reental",
  DEFI_POOL: "Pool",
  DEFI_STAKING: "Staking",
  DEFI_FARMING: "Farming",
  DEFI_REWARDS: "Recompensas",
  INFRAESTRUCTURA: "Infraestructura",
};
const PN_TIPOS_EDITABLES = ["DEFI_POOL", "DEFI_STAKING", "DEFI_FARMING", "DEFI_REWARDS", "INFRAESTRUCTURA"];
/* Los que se eligen al añadir. «Infraestructura» ya no: solo mandaba a 🔍
   el dinero que llega de ella (sin marcar es «Ingreso de dinero») y
   confundía; las que ya hay se siguen viendo y se quitan con ✕. */
const PN_TIPOS_ELEGIBLES = PN_TIPOS_EDITABLES.filter(r => r !== "INFRAESTRUCTURA");

function pnEsSemillaDefi(rol, addr) {
  const semillas = SEMILLAS_DEFI[rol] || {};
  const a = normalizarDireccion(addr);
  return Object.keys(semillas).some(s => normalizarDireccion(s) === a);
}
function pnContratoQuitable(rol) {
  return PN_TIPOS_EDITABLES.includes(rol);
}
/* El tipo y el nombre de serie de una semilla, o null. */
function pnSemilla(addr) {
  const a = normalizarDireccion(addr);
  for (const [rol, dirs] of Object.entries(SEMILLAS_DEFI)) {
    for (const [s, nombre] of Object.entries(dirs)) if (normalizarDireccion(s) === a) return { rol, addr: a, nombre };
  }
  return null;
}
/* Las quitadas que no se volvieron a añadir con otro tipo, para
   enseñarlas con su «↩ Volver a poner». */
function pnFilasSemillasQuitadas(cache) {
  if (!cache || typeof semillasQuitadas !== "function") return [];
  const conRol = new Set();
  for (const bloque of Object.values(cache.contratos_aprendidos || {})) {
    Object.keys(bloque || {}).forEach(a => conRol.add(normalizarDireccion(a)));
  }
  return [...semillasQuitadas(cache)].filter(a => !conRol.has(a)).map(pnSemilla).filter(Boolean);
}
function pnHtmlSemillasQuitadas(filas) {
  return filas.map(f => '<tr data-addr="' + ccEsc(f.addr) + '">' +
    "<td>" + ccEsc(f.nombre) + "</td>" +
    "<td>" + ccEsc(PN_TIPOS_CONTRATO[f.rol] || f.rol) + "</td>" +
    "<td>" + pnEnlaceContrato(f.addr) + "</td>" +
    '<td class="rv-acciones"><button type="button" data-volver="' + ccEsc(f.addr) + '">↩ Volver a poner</button></td></tr>').join("");
}
/* Cuántas decisiones tuyas («Ajustes») hay en movimientos de
   esa dirección: siguen mandando al añadirla. */
function pnDecisionesConDireccion(cache, addr) {
  if (!cache || typeof transfersUnificadosClasificacion !== "function") return 0;
  const a = normalizarDireccion(addr);
  const toca = tx => [tx.from, tx.to, tx.contractAddress].some(x => normalizarDireccion(x || "") === a);
  const hashes = new Set(transfersUnificadosClasificacion(cache).filter(toca).map(tx => normalizarDireccion(tx.hash || "")));
  for (const legs of movimientosPol(cache).values()) legs.filter(toca).forEach(tx => hashes.add(normalizarDireccion(tx.hash || "")));
  return Object.keys(cache.ajustes_usuario || {}).filter(k => hashes.has(normalizarDireccion(k.split("::")[0]))).length;
}
function pnAvisoAñadida(cache, nombre, addr) {
  const n = pnDecisionesConDireccion(cache, addr);
  return "Dirección añadida: " + nombre + (!n ? "" : n === 1 ? " · sigue 1 decisión tuya en sus movimientos"
    : " · siguen tus " + n + " decisiones en sus movimientos");
}

/* Filas de contratos, por tipo (en el orden de ROLES_CONTRATOS) y nombre. */
function pnFilasContratos(cache) {
  const filas = [];
  const aprendidos = (cache && cache.contratos_aprendidos) || {};
  for (const rol of ROLES_CONTRATOS) {
    const bloque = aprendidos[rol] || {};
    const nombres = Object.entries(bloque).map(([addr, nombre]) => ({ rol, addr, nombre: textoCacheVigente(nombre) }));
    nombres.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
    filas.push(...nombres);
  }
  return filas;
}

function pnHtmlContratos(filas) {
  if (!filas.length) return '<tr><td colspan="4" class="rv-vacio">Sin direcciones.</td></tr>';
  return filas.map(f => '<tr data-addr="' + ccEsc(f.addr) + '">' +
    "<td>" + ccEsc(f.nombre) + "</td>" +
    "<td>" + ccEsc(PN_TIPOS_CONTRATO[f.rol] || f.rol) + "</td>" +
    "<td>" + pnEnlaceContrato(f.addr) + "</td>" +
    '<td class="rv-acciones">' + (pnContratoQuitable(f.rol)
      ? '<button type="button" class="danger" data-rol="' + ccEsc(f.rol) + '" data-addr="' + ccEsc(f.addr) +
        '" title="Quitar" aria-label="Quitar ' + ccEsc(f.nombre) + '">✕</button>'
      : "") + "</td></tr>").join("");
}

/* Valida un contrato nuevo. Devuelve { addr, nombre, rol } o { error }. */
function pnValidarContrato(cache, dir, nombre, rol) {
  const addr = normalizarDireccion(String(dir || "").trim());
  const n = String(nombre || "").trim();
  if (!direccionValida(addr)) return { error: "La dirección debe ser 0x y 40 caracteres." };
  if (!n) return { error: "Ponle un nombre." };
  if (!PN_TIPOS_ELEGIBLES.includes(rol)) return { error: "Elige un tipo." };
  const propias = typeof walletConfig === "function" ? [walletConfig(), vaultConfig()] : [];
  if (propias.includes(addr)) return { error: "Esa dirección es tuya (wallet o vault)." };
  for (const [r, bloque] of Object.entries((cache && cache.contratos_aprendidos) || {})) {
    if (Object.keys(bloque || {}).some(a => normalizarDireccion(a) === addr)) {
      return { error: "Esa dirección ya está como «" + (PN_TIPOS_CONTRATO[r] || r) + "»." };
    }
  }
  /* Un token «con dudas» o descartado sí se puede añadir (p. ej. el
     recibo de un pool, cuyo contrato es el del pool): sale del catálogo.
     Con «Descartar», la aportación saldría como una retirada con ganancia
     o pérdida. Un inmueble confirmado, no. */
  const enCatalogo = Object.keys((cache && cache.catalogo_propiedades) || {})
    .filter(a => normalizarDireccion(a) === addr);
  if (enCatalogo.some(a => estadoCatalogo(cache.catalogo_propiedades[a]) === "CONFIRMADA")) {
    return { error: "Esa dirección es de un inmueble del catálogo." };
  }
  return enCatalogo.length ? { addr, nombre: n, rol, quitarDelCatalogo: enCatalogo } : { addr, nombre: n, rol };
}

/* Las semillas quitadas (js/05): se apuntan al quitarlas y se olvidan si
   el usuario vuelve a añadir la dirección con su mismo tipo (con otro, se
   siguen sin sembrar: si no, saldría con dos tipos). Una lista mal escrita
   se sustituye por una buena al apuntar. */
function pnApuntarSemillaQuitada(cache, addr) {
  const a = normalizarDireccion(addr);
  if (!Array.isArray(cache.semillas_quitadas)) cache.semillas_quitadas = [];
  if (!cache.semillas_quitadas.some(x => normalizarDireccion(x) === a)) cache.semillas_quitadas.push(a);
}
function pnOlvidarSemillaQuitada(cache, addr) {
  if (!Array.isArray(cache.semillas_quitadas)) return;
  const a = normalizarDireccion(addr);
  cache.semillas_quitadas = cache.semillas_quitadas.filter(x => normalizarDireccion(x) !== a);
  if (!cache.semillas_quitadas.length) delete cache.semillas_quitadas;
}

/* ----------------------------- Guardar y reclasificar ----------------------------- */
async function pnGuardarYClasificar() {
  marcarCacheDirty();
  await autoGuardarCache();
  // Lo que cambia la clasificación se ve al momento. Al
  // clasificar ya se repinta este panel (js/14); si no se pudo, se repinta aquí.
  if (!(typeof arrClasificarAhora === "function" && arrClasificarAhora())) renderPanel();
}

async function pnCambiarEstadoCatalogo(addr, nuevo) {
  const e = state.cache && state.cache.catalogo_propiedades && state.cache.catalogo_propiedades[addr];
  if (!e) return;
  if (nuevo === "DESCARTADA") return pnDescartarToken(addr, e);
  if (nuevo === "CONFIRMADA") pnConfirmadosAhora.add(normalizarDireccion(addr));
  e.estado = nuevo;
  await pnGuardarYClasificar();
  // El estado final: el descubrimiento vuelve a confirmar una «con dudas»
  // que tenga pruebas de ser inmueble (p. ej. su nombre en el archivo).
  toast((e.nombre_reental || e.nombre_etherscan || addr) + " → " + (PN_ESTADOS[e.estado || "CONFIRMADA"] || PN_ESTADOS[nuevo]), "ok");
}

/* «Descartar» = el spam de todo el token de 📒 (js/18): sale del catálogo y
   se recupera con su ↩ en 📒. Queda con dudas debajo: un inmueble
   confirmado es un token conocido y la regla del spam no le alcanzaría; el
   ↩ lo vuelve a confirmar (estado_antes). Como en 📒, solo si algún
   movimiento suyo pasa a spam (si no, no habría ↩ con que deshacerlo). */
const PN_NO_DESCARTADO = "No se ha descartado: ";
async function pnDescartarToken(addr, e) {
  if (!txPuedeClasificar()) {
    toast(PN_NO_DESCARTADO.slice(0, -2) + ".", "warn");
    return ejecutarClasificacion(); // dice qué falta
  }
  const a = normalizarDireccion(addr);
  const bloque = txSpamUsuarioCon(state.cache.spam_usuario, "tokens", addr, ahoraLocalISO(), e.simbolo);
  if (estadoCatalogo(e) === "CONFIRMADA") bloque.tokens[a].estado_antes = "CONFIRMADA";
  const cambios = { spam_usuario: bloque,
    catalogo_propiedades: Object.assign({}, state.cache.catalogo_propiedades, { [addr]: Object.assign({}, e, { estado: "CANDIDATA" }) }) };
  const ctx = construirContexto(Object.assign({}, state.cache, cambios)); // js/14
  if (!(txSimular(cambios) || []).some(r => normalizarDireccion(r.contrato || "") === a && txReglaSpam(r, ctx))) {
    return toast(PN_NO_DESCARTADO + "ningún movimiento suyo pasaría a spam (ya los decidiste tú o los explica otra regla).", "warn");
  }
  e.estado = "CANDIDATA";
  await txGuardarSpamUsuario(bloque, "tokens", true);
}

async function pnAñadirContrato() {
  if (!state.cache) return toast("No hay archivo abierto.", "warn");
  const v = pnValidarContrato(state.cache, $("inpContratoDir").value, $("inpContratoNombre").value, $("selContratoTipo").value);
  if (v.error) return toast(v.error, "warn");
  state.cache.contratos_aprendidos[v.rol] = state.cache.contratos_aprendidos[v.rol] || {};
  state.cache.contratos_aprendidos[v.rol][v.addr] = v.nombre;
  for (const a of v.quitarDelCatalogo || []) delete state.cache.catalogo_propiedades[a];
  if (pnEsSemillaDefi(v.rol, v.addr)) pnOlvidarSemillaQuitada(state.cache, v.addr);
  $("inpContratoDir").value = ""; $("inpContratoNombre").value = "";
  await pnGuardarYClasificar();
  toast(pnAvisoAñadida(state.cache, v.nombre, v.addr), "ok");
}

/* «↩ Volver a poner» una semilla quitada, con su tipo y su
   nombre de serie (las mismas comprobaciones que «Añadir»). */
async function pnVolverAPonerSemilla(addr) {
  const s = pnSemilla(addr);
  if (!state.cache || !s) return;
  const v = pnValidarContrato(state.cache, s.addr, s.nombre, s.rol);
  if (v.error) return toast(v.error, "warn");
  state.cache.contratos_aprendidos[v.rol] = state.cache.contratos_aprendidos[v.rol] || {};
  state.cache.contratos_aprendidos[v.rol][v.addr] = v.nombre;
  for (const a of v.quitarDelCatalogo || []) delete state.cache.catalogo_propiedades[a];
  pnOlvidarSemillaQuitada(state.cache, v.addr);
  await pnGuardarYClasificar();
  toast(pnAvisoAñadida(state.cache, v.nombre, v.addr), "ok");
}

async function pnQuitarContrato(rol, addr) {
  const bloque = state.cache && state.cache.contratos_aprendidos && state.cache.contratos_aprendidos[rol];
  if (!bloque || !(addr in bloque) || !pnContratoQuitable(rol)) return;
  const nombre = textoCacheVigente(bloque[addr]);
  const semilla = pnEsSemillaDefi(rol, addr);
  if (!confirm(semilla ? "«" + pnSemilla(addr).nombre + "» viene con la app. ¿Seguro que quieres quitarla?" : "¿Quitar «" + nombre + "»?")) return;
  delete bloque[addr];
  if (semilla) pnApuntarSemillaQuitada(state.cache, addr);
  await pnGuardarYClasificar();
  toast("Dirección quitada: " + nombre, "ok");
}

/* ----------------------------- Precios RNT -----------------------------
   Sin formulario libre. Solo se piden
   las fechas que la app necesita y CoinGecko no puede dar: las marcadas sin
   precio al sincronizar y las de un movimiento de RNT de hace más de 365
   días que aún no tienen precio. Cada una enlaza a su página de CoinGecko. */
function pnFechasSinPrecioRnt(cache, ahoraMs) {
  if (!cache) return [];
  const precios = cache.precios_rnt || {};
  const motivos = Object.assign({}, cache.precios_rnt_no_disponibles || {});
  if (typeof diasConMovimientoRnt === "function" && cache.transacciones) {
    for (const [f, cubierto] of diasConMovimientoRnt(cache)) {
      // Con el precio de su día UTC (de antes de la hora española) no se pide.
      if (cubierto) delete motivos[f];
      else if (!(f in motivos) && diasDesdeFechaRnt(f, ahoraMs) > CG_DIAS_MAX_PLAN_GRATUITO) motivos[f] = MOTIVO_RNT_FUERA_365;
    }
  }
  return Object.entries(motivos).filter(([f]) => !(f in precios)).sort((a, b) => a[0].localeCompare(b[0]));
}

/* El precio de ese día en la web de CoinGecko (m: CG_RNT, por defecto, o
   CG_POL). */
function pnUrlCoingeckoDia(fecha, m) {
  return "https://www.coingecko.com/en/coins/" + (m || CG_RNT).webId(fecha) + "/historical_data?start=" + encodeURIComponent(fecha) +
    "&end=" + encodeURIComponent(fecha);
}

/* Las fechas de POL sin precio que el motor necesita: POL que entra
   sin coste puesto a mano (depósito) o que sale de la wallet (retirada).
   El gas no: sale de lo que costó el POL; los swaps, tampoco: se valoran por
   la stablecoin. Como los «sin coste» del motor fiscal.
   Con sus mismas reglas: un coste que no es un número de verdad mayor
   o igual que 0 (un texto como "12,5" o un negativo, escritos en «Ajustes
   en JSON») no cuenta, y un precio solo vale si es un número mayor que 0. */
function pnFechasSinPrecioPol(cache, registros, ahoraMs) {
  if (!cache || !Array.isArray(registros)) return [];
  const precios = preciosLeidos(cache, "precios_pol");
  const motivos = {};
  for (const r of registros) {
    if (!r || r.contrato !== "pol" || !fechaIsoValida(r.fecha)) continue;
    const c = r.coste_eur;
    const conCoste = typeof c === "number" && Number.isFinite(c) && c >= 0;
    const necesita = (r.categoria === "DEPOSITO" && !conCoste) ||
      (r.categoria === "RETIRADA" && r.subcategoria === "GPP_RETIRADA");
    const f = r.fecha.slice(0, 10);
    if (!necesita || precioValido(precios[f]) || precioValido(precios[diaUtcSiOtro(r.fecha)])) continue;
    motivos[f] = diasDesdeFechaRnt(f, ahoraMs) > CG_DIAS_MAX_PLAN_GRATUITO ? MOTIVO_RNT_FUERA_365 : "se pedirá a CoinGecko al actualizar";
  }
  return Object.entries(motivos).sort((a, b) => a[0].localeCompare(b[0]));
}

function renderPreciosRnt(cache, faltantes) {
  // --- Bloque 1: fechas sin precio (solo se ve si hay alguna) ---
  pnPintarFaltantes(CG_RNT, faltantes);

  // --- Bloque 2: precios guardados (borrado protegido) ---
  const precios = cache ? (cache.precios_rnt || {}) : {};
  renderTablaPrecios("tablaPreciosRnt", precios, "precios_rnt", borrarPrecioRntConConfirmacion);
  $("nPreciosRnt").textContent = Object.keys(precios).length;
}

/* Las fechas de POL que faltan dependen de la clasificación
   (state.registros), así que js/14 llama a esto al terminar de clasificar
   (si no, el bloque se quedaría con la clasificación anterior). Con la
   misma cache y sin clasificar todavía (al cambiar la wallet, el vault o el
   archivo de Reental se borran los registros y se reclasifica), las fechas
   se dejan como estaban: no se vacían, no se pierde lo escrito y el bloque
   no se vuelve a abrir solo si lo habías cerrado. */
let pnPolPintadoCon = null; // la cache de las fechas que se ven
function pnPintarPreciosPol() {
  const cache = state.cache;
  const esperar = !!cache && cache === pnPolPintadoCon && !Array.isArray(state.registros);
  pnPolPintadoCon = cache;
  renderPreciosPol(cache, esperar ? null : pnFechasSinPrecioPol(cache, state.registros, Date.now()));
}

/* El bloque de POL, como el de RNT; se abre solo si falta alguna
   fecha. Un precio borrado con ✕ se vuelve a pedir al actualizar o,
   si el motor lo necesita, sale entre las fechas sin precio. */
function renderPreciosPol(cache, faltantes) {
  if (faltantes) pnPintarFaltantes(CG_POL, faltantes); // null: se dejan
  const precios = preciosLeidos(cache, "precios_pol"); // «abc» no son tres precios
  renderTablaPrecios("tablaPreciosPol", precios, "precios_pol", borrarPrecioPolConConfirmacion);
  $("nPreciosPol").textContent = Object.keys(precios).length;
}

/* La tabla de fechas sin precio de un token (m: CG_RNT o CG_POL; ids:
   tablaPrecios<T>Faltantes, rv<T>Faltantes, nPrecios<T>Faltantes,
   rvPrecios<T>Aviso y rvPrecios<T>, con <T> = m.sufijo). */
function pnPintarFaltantes(m, faltantes) {
  const T = m.sufijo;
  const tbodyF = $("tablaPrecios" + T + "Faltantes");
  // Lo que estabas escribiendo (y dónde) sobrevive al
  // repintado que hace cada actualización o clasificación.
  const escritos = {};
  let conFoco = null;
  for (const i of tbodyF.querySelectorAll("input[data-fecha]")) {
    if (i.value) escritos[i.dataset.fecha] = i.value;
    if (i === document.activeElement) conFoco = i.dataset.fecha;
  }
  tbodyF.innerHTML = "";
  for (const [fecha, motivo] of faltantes) {
    const tr = document.createElement("tr");
    const tdF = document.createElement("td");
    tdF.innerHTML = '<a href="' + pnUrlCoingeckoDia(fecha, m) + '" target="_blank" rel="noopener" title="Precio de ese día en CoinGecko">' +
      ccEsc(fechaEs(fecha)) + " ↗</a>";
    tr.appendChild(tdF);
    const tdM = document.createElement("td");
    tdM.textContent = motivo || "—";
    tdM.className = "help";
    tr.appendChild(tdM);
    const tdV = document.createElement("td");
    const inp = document.createElement("input");
    inp.type = "number"; inp.step = "any"; inp.min = "0";
    inp.className = "inp-mini";
    inp.dataset.fecha = fecha;
    inp.value = escritos[fecha] || "";
    inp.setAttribute("aria-label", "Precio USD del " + fechaEs(fecha));
    inp.addEventListener("keydown", ev => { if (ev.key === "Enter") guardarPrecioFaltante(m, fecha, inp); });
    tdV.appendChild(inp);
    tr.appendChild(tdV);
    const tdB = document.createElement("td");
    const b = document.createElement("button");
    b.textContent = "💾 Guardar";
    b.className = "primary";
    b.onclick = () => guardarPrecioFaltante(m, fecha, inp);
    tdB.appendChild(b);
    tr.appendChild(tdB);
    tbodyF.appendChild(tr);
    if (conFoco === fecha) inp.focus();
  }
  $("rv" + T + "Faltantes").hidden = !faltantes.length;
  $("nPrecios" + T + "Faltantes").textContent = faltantes.length;
  $("rvPrecios" + T + "Aviso").textContent = faltantes.length ? "⚠ " + faltantes.length + " sin precio" : "";
  pnAbrirSiHace("rvPrecios" + T, faltantes.length > 0);
}

/* Abre un plegable cuando algo pide atención, una sola vez: si lo cierras
   no se vuelve a abrir hasta que el aviso desaparezca y vuelva. */
function pnAbrirSiHace(id, hace) {
  const el = $(id);
  if (!el) return;
  if (hace && !el.dataset.avisado) el.open = true;
  if (hace) el.dataset.avisado = "1";
  else delete el.dataset.avisado;
}
/* Para que el próximo aviso lo vuelva a abrir aunque siga el mismo. */
function pnOlvidarAviso(id) {
  const el = $(id);
  if (el) delete el.dataset.avisado;
}

/* El precio de una fecha que falta, de RNT o de POL (m: CG_RNT o
   CG_POL de js/08). */
async function guardarPrecioFaltante(m, fecha, input) {
  if (!state.cache) return toast("No hay archivo abierto.", "warn");
  const valor = parseFloat(String(input.value).replace(",", "."));
  if (isNaN(valor) || valor <= 0) {
    input.focus();
    return toast("El precio de " + fechaEs(fecha) + " debe ser un número mayor que 0.", "warn");
  }
  bloquePrecios(state.cache, m.campo)[fecha] = valor; // con [] se perdería al guardar
  if (m.noDisp && state.cache[m.noDisp]) delete state.cache[m.noDisp][fecha];
  marcarCacheDirty();
  await autoGuardarCache();
  renderPanel();
  actualizarChipEstado();
  log("Precio " + m.nombre + " manual guardado: " + fechaEs(fecha) + " → " + valor + " USD.", "ok");
  // El precio a la española, como en la tabla.
  toast("Precio guardado: " + fechaEs(fecha) + " → " + numEs(valor, 6, false, true) + " USD", "ok");
}

/* El ✕ de un precio de POL pregunta antes, como el de RNT (uno
   de hace más de 365 días ya no lo da CoinGecko). */
async function borrarPrecioPolConConfirmacion(fecha) {
  if (!state.cache) return;
  const viejo = diasDesdeFechaRnt(fecha, Date.now()) > CG_DIAS_MAX_PLAN_GRATUITO;
  const seguro = confirm(
    "¿Borrar el precio de POL del " + fechaEs(fecha) + " (" + numEs(state.cache.precios_pol[fecha], 6, false, true) + " USD)?\n\n" +
    (viejo ? "CoinGecko ya no lo da: si hace falta, tendrás que escribirlo otra vez."
           : "Si hace falta, se volverá a pedir a CoinGecko al actualizar.")
  );
  if (!seguro) return;
  delete state.cache.precios_pol[fecha];
  marcarCacheDirty();
  await autoGuardarCache();
  renderPanel();
  toast("Precio borrado: " + fechaEs(fecha) + ".", "warn");
}

async function borrarPrecioRntConConfirmacion(fecha) {
  if (!state.cache) return;
  const precio = state.cache.precios_rnt[fecha];
  // Uno pedido solo para el CSV de totales: se vuelve a pedir al sincronizar.
  const soloCorte = precioRntSoloCorte(state.cache, fecha);
  const seguro = confirm(
    "¿Borrar el precio de RNT del " + fechaEs(fecha) + " (" + numEs(precio, 6, false, true) + " USD)?\n\n" +
    (soloCorte ? "Se volverá a pedir al sincronizar." : "La fecha pasará a «Fechas sin precio».")
  );
  if (!seguro) return;
  delete state.cache.precios_rnt[fecha];
  if (!soloCorte) {
    state.cache.precios_rnt_no_disponibles = state.cache.precios_rnt_no_disponibles || {};
    state.cache.precios_rnt_no_disponibles[fecha] = "borrado por ti";
  }
  marcarCacheDirty();
  await autoGuardarCache();
  renderPanel();
  actualizarChipEstado();
  log("Precio RNT borrado (" + fechaEs(fecha) + ")" + (soloCorte ? "." : "; la fecha vuelve a la lista de fechas sin precio."), "warn");
  toast("Precio borrado: " + fechaEs(fecha) + ".", "warn");
}

/* ----------------------------- Render ----------------------------- */
let pnCacheAjustes = null; // la cache cuyos ajustes enseña el editor
function renderPanel() {
  const cache = state.cache;
  const faltantes = pnFechasSinPrecioRnt(cache, Date.now());
  const estado = $("panelEstadoCache");
  if (!cache) {
    estado.textContent = "Sin datos.";
    estado.className = "chip";
  } else {
    const n = Object.values(cache.transacciones).reduce((a, s) => a + s.length, 0);
    const nFaltan = faltantes.length;
    estado.textContent = n + " transacciones · " +
      Object.keys(cache.tipos_bce).length + " tipos BCE · " +
      Object.keys(cache.precios_rnt).length + " precios RNT" +
      (nFaltan ? " (" + nFaltan + " sin precio)" : "");
    estado.className = "chip ok";
  }
  pnMontarEventos();

  // Contratos conocidos
  const contratos = pnFilasContratos(cache);
  $("tablaContratos").innerHTML = pnHtmlContratos(contratos);
  $("nContratosDefi").textContent = contratos.length;
  const quitadas = pnFilasSemillasQuitadas(cache);
  $("tablaSemillasQuitadas").innerHTML = pnHtmlSemillasQuitadas(quitadas);
  $("nSemillasQuitadas").textContent = quitadas.length;
  $("rvSemillasQuitadas").hidden = !quitadas.length;

  // Catálogo de inmuebles
  const todas = pnFilasVisibles(pnFilasCatalogo(cache));
  const conVault = !!normalizarDireccion((state.config && state.config.vault) || "");
  const saldos = conVault && cache && cache.transacciones && typeof dashSaldosCatalogo === "function" ? dashSaldosCatalogo(cache) : null;
  const sinTokens = new Set(saldos ? todas.filter(f => pnSinTokens(f, saldos)).map(f => f.addr) : []);
  if (!sinTokens.size) pnVerTodos = false; // al volver a haber alguno, sale apagado
  const lista = pnVerTodos ? todas : todas.filter(f => !sinTokens.has(f.addr));
  $("tablaCatalogo").innerHTML = lista.length || !todas.length ? pnHtmlCatalogo(lista, sinTokens)
    : '<tr><td colspan="6" class="rv-vacio">Ninguno con tokens.</td></tr>';
  $("nCatalogo").textContent = lista.length;
  $("rvCatalogoTodosCaja").hidden = !sinTokens.size;
  $("rvCatalogoTodos").checked = pnVerTodos;
  // Apagado, el título dice «activos» y el interruptor cuenta los inactivos.
  $("rvCatalogoActivos").hidden = !sinTokens.size || pnVerTodos;
  $("rvCatalogoTodosN").textContent = sinTokens.size;
  const dudas = lista.filter(f => f.estado === "CANDIDATA").length;
  $("rvCatalogoAviso").textContent = dudas ? "⚠ " + dudas + " con dudas" : "";
  pnAbrirSiHace("rvCatalogo", dudas > 0);

  // Precios RNT y POL
  renderPreciosRnt(cache, faltantes);
  pnPintarPreciosPol();

  // Ajustes en JSON. Lo que estás escribiendo no se pisa;
  // se repinta si no lo has cambiado, si ya es lo guardado o si cambia la cache.
  // data-base guarda los ajustes de los que partiste, para
  // avisar en «Aplicar» si cambiaron mientras escribías.
  const txt = $("txtAjustes");
  const nuevo = cache ? pnTextoAjustes(cache) : "";
  if (cache !== pnCacheAjustes || txt.value === (txt.dataset.pintado || "") || pnMismoJson(txt.value, nuevo)) {
    txt.value = nuevo;
    txt.dataset.base = nuevo;
  }
  txt.dataset.pintado = nuevo;
  pnCacheAjustes = cache;
}
/* Los ajustes como los enseña el editor (también los compara «Aplicar», js/13). */
function pnTextoAjustes(cache) {
  return JSON.stringify(cache.ajustes_usuario || {}, null, 2);
}
/* Mismo JSON sin mirar el orden de las claves (decidir y deshacer cambia
   el orden y «Aplicar» preguntaría sin motivo). */
function pnMismoJson(a, b) {
  const ordenado = t => JSON.stringify(JSON.parse(t), (k, v) =>
    v !== null && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(c => [c, v[c]])) : v);
  try { return ordenado(a) === ordenado(b); } catch (e) { return false; }
}
/* ¿Cambiaron los ajustes guardados mientras escribías?
   base = los que enseñaba el editor cuando empezaste; actual = los de
   ahora; escrito = tu texto. Si tu texto ya es lo de ahora, no hay nada
   que perder. */
function pnAjustesCambiaronAlEscribir(base, actual, escrito) {
  return !!base && !pnMismoJson(base, actual) && !pnMismoJson(escrito, actual);
}

/* Eventos de las tablas que se repintan (delegados, una vez) y el
   desplegable de tipos de contrato. */
function pnMontarEventos() {
  const cat = $("rvCatalogo");
  if (cat.__pnEventos) return;
  cat.__pnEventos = true;
  cat.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-estado]");
    if (b) pnCambiarEstadoCatalogo(b.dataset.addr, b.dataset.estado);
  });
  $("rvCatalogoTodos").addEventListener("change", ev => { pnVerTodos = ev.target.checked; renderPanel(); });
  $("tablaContratos").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-rol]");
    if (b) pnQuitarContrato(b.dataset.rol, b.dataset.addr);
  });
  $("tablaSemillasQuitadas").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-volver]");
    if (b) pnVolverAPonerSemilla(b.dataset.volver);
  });
  $("rvTipoInfo").outerHTML = ccInfo("Pool, Staking y Farming: meter o sacar es movimiento neutro. Recompensas: lo que te paga es recompensa DeFi. Las de Reental salen de su archivo. Tus otras wallets no hace falta añadirlas: el dinero que llega de ellas entra como «Ingreso de dinero».");
  $("selContratoTipo").innerHTML = PN_TIPOS_ELEGIBLES.map(r =>
    '<option value="' + r + '">' + ccEsc(PN_TIPOS_CONTRATO[r]) + "</option>").join("");
  $("btnAddContrato").onclick = pnAñadirContrato;
}

/* Tabla de precios guardados, los más recientes primero, con su ✕.
   onBorrar(fecha) sustituye al borrado directo (RNT: con confirmación). */
function renderTablaPrecios(idTbody, precios, campoCache, onBorrar) {
  const tbody = $(idTbody);
  tbody.innerHTML = "";
  for (const fecha of Object.keys(precios).sort().reverse()) {
    const tr = document.createElement("tr");
    const tdF = document.createElement("td"); tdF.textContent = fechaEs(fecha); tr.appendChild(tdF);
    const tdV = document.createElement("td"); tdV.className = "num"; tdV.textContent = numEs(precios[fecha], 6, false, true); tr.appendChild(tdV);
    const tdB = document.createElement("td");
    tdB.className = "rv-acciones";
    const b = document.createElement("button");
    b.textContent = "✕"; b.className = "danger";
    b.title = "Borrar";
    b.setAttribute("aria-label", "Borrar el precio del " + fechaEs(fecha));
    b.onclick = onBorrar ? () => onBorrar(fecha) : async () => {
      delete state.cache[campoCache][fecha];
      marcarCacheDirty();
      await autoGuardarCache();
      renderPanel();
    };
    tdB.appendChild(b); tr.appendChild(tdB);
    tbody.appendChild(tr);
  }
  if (!Object.keys(precios).length) {
    tbody.innerHTML = '<tr><td colspan="3" class="rv-vacio">Sin precios todavía.</td></tr>';
  }
}
