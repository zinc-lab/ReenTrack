/* =====================================================================
   REENTAL SPA · js/15-correcciones.js
   Centro de Correcciones (vista #view-revision): lista de los registros
   que necesitan una decisión del usuario y vínculos de pagos diferidos
   (ventas de tokens cuyo cobro llegó en otra transacción).

   Qué hace:
   - Lista EN VIVO en #ccLista (se repinta tras cada clasificación) SOLO
     con lo que necesita una decisión: los registros a revisar y las salidas
     de tokens por vincular. Lo ya clasificado (también los depósitos, que
     por sí solos no piden nada) no sale aquí: vive en 📒 Transacciones
     (js/18). Sin filtros (son pocos), con su recuento.
   - Marca lo PENDIENTE DE VINCULAR (vinculable y todavía sin vínculo):
     · salida: tokens de un inmueble CONFIRMADO del catálogo que salen de
       la wallet o el vault, que el motor aceptaría vincular (ni VENTA
       correlacionada en su hash ni contraprestación propia) y sin venta
       CONFIRMADA guardada;
     · cobro: USDT/USDC que entra a la wallet o el vault desde un tercero,
       sin contraparte explicada (DEPOSITO o REVISAR) y con dinero
       disponible sin asignar.
     Cada movimiento es una fila (por registro, nunca por hash). Nada se
     vincula automáticamente.
   - Buscador de cobros («🔗 Vincular cobro…» en una salida): filtra por
     activo, rango de importe, fechas y dirección; permite elegir varios
     cobros y abre el formulario. Si no encuentra nada, ofrece mostrar
     también los entrantes ya explicados (rendimientos, recompensas…).
   - Formulario del vínculo: la venta y cada pago por separado, la parte de
     cada cobro que corresponde a la venta (editable) y una nota. Los
     efectos se SIMULAN con el propio motor de js/14
     (aplicarPagosDiferidos sobre copias) y se muestran como avisos cortos
     y un plegable con los cambios detallados. La liquidación se guarda
     siempre COMPLETA; si falta dinero, será otra asignación («➕»).
   - «Movimientos ya decididos» (n): los vínculos CONFIRMADOS, con añadir otro cobro,
     editar y anular (botón «↩ Deshacer»), y un salto a cada movimiento del vínculo en
     📒 Transacciones. Anular no deja rastro a la vista: el vínculo sale de
     «Movimientos ya decididos», la venta vuelve a la lista y, si se vuelve a vincular, se
     reutiliza el mismo vínculo (lo anterior queda en su «historial»
     interno, que ningún motor lee). Un registro con
     vínculo confirmado lleva el distintivo «🔗 Venta vinculada» o «🔗 Pago
     de una venta», que lleva a su vínculo.
   - Decisiones: cada tarjeta a revisar lleva «✔ Dejar como
     …» (Sugerida) y solo las alternativas que encajan con el movimiento
     (venta, compra externa, dinero recibido, neutro, spam). Cada una es un
     ajuste en ajustes_usuario con su marca; «Movimientos ya decididos» las enseña con
     «↩ Deshacer».

   Reglas:
   - Guardado: escribe en cache.pagos_diferidos (reemplazando el bloque) y
     en ajustes_usuario solo en ccGuardarAjustesDecision; siempre
     con marcarCacheDirty + autoGuardarCache (el patrón de los ajustes de
     js/13: se guarda en el navegador), y después reclasifica. Sin
     descargas. Un ajuste de otro origen nunca se pisa ni se borra.
   - Estados honestos: nunca se inventan candidatos, importes ni hashes;
     sin fecha válida un registro queda fuera de los rangos de fecha; las
     referencias ambiguas no se resuelven (no se elige una al azar).
   - Los importes de los vínculos son USD nominales (1 USDT = 1 USD): el
     valor en € lo pone el cálculo fiscal con el tipo del BCE de cada fecha.
   - Se engancha sin tocar otros módulos: envoltorios que repintan detrás
     de renderPanel / actualizarChipEstado / ejecutarClasificacion, más
     hashchange al volver a #revision. index.html solo aporta el esqueleto.
   - Las funciones puras (sin DOM ni state) van primero: los tests
     tests/test_correcciones_paso_*.js las cargan en Node con vm. Algunas
     solo las usan los tests (formato de un solo cobro, ccCandidatura…).
   - js/18 (📒 Transacciones) reutiliza ccEsc, ccCantidad, ccInfo,
     ccInyectarEstilos, ccContextoCandidatos, ccPendienteDeVincular,
     ccVinculoDeRegistro, ccTextoVinculada, ccFechaDiaNorm, ccAbrirBuscador
     y ccIrAVinculo; este módulo usa de js/18 txMostrarMovimiento.
   ===================================================================== */

/* ----------------------------- Utilidades puras ----------------------------- */

/* Escapa HTML en una sola pasada (se llama unas 12 veces por card). */
const CC_ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function ccEsc(s) {
  return String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => CC_ESC[c]);
}

/* Cantidad con formato fijo (igual en todos los navegadores, sin
   toLocaleString): punto de miles, coma decimal y hasta 6 decimales sin
   ceros sobrantes. "?" si no es un número. */
function ccAgruparMiles(ent) {
  return String(ent).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function ccCantidad(x) {
  if (!Number.isFinite(x)) return "?";
  const v = red6(x);
  const partes = Math.abs(v).toFixed(6).split(".");
  const fra = partes[1].replace(/0+$/, "");
  return (v < 0 ? "-" : "") + ccAgruparMiles(partes[0]) + (fra ? "," + fra : "");
}

/* Hash corto: los 10 primeros caracteres (0x + 8) … los 6 últimos. */
function ccHashCorto(h) {
  const s = String(h || "");
  return s ? s.slice(0, 10) + "…" + s.slice(-6) : "";
}
function ccAddrCorta(a) {
  const s = normalizarDireccion(a);
  return s ? s.slice(0, 8) + "…" : "—";
}

/* Día "AAAA-MM-DD" de una fecha, o null si no es válida. Acepta la fecha en
   crudo ("AAAA-MM-DD HH:MM:SS" o null) o un registro (usa su .fecha): el
   buscador y el desfase en días comparan por día. */
function ccFechaDiaNorm(v) {
  const s = v && typeof v === "object" ? v.fecha : v;
  if (!s) return null;
  const d = String(s).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

/* Día del registro (mismo resultado que ccFechaDiaNorm). */
function ccFechaCorta(reg) {
  return ccFechaDiaNorm(reg && reg.fecha);
}
/* El día del registro como se enseña (01/03/2026), o null. Las
   comparaciones siguen con ccFechaCorta ("AAAA-MM-DD"). */
function ccFechaVer(reg) {
  const d = ccFechaCorta(reg);
  return d ? fechaEs(d) : null;
}

/* Datos de contexto de cada fila del buscador de cobros, calculados solo con
   campos existentes (null si falta algo: nunca se inventan).
   - ccDiasEntreFechas: días entre el cobro y la salida (cobro − salida, en
     días UTC): > 0 si el cobro va después («+5 d»), < 0 si va antes
     («−2 d»). null si alguna de las dos fechas no es válida. Acepta
     registros o cadenas de fecha.
   - ccPrecioPorTokenImplicito: cantidad del cobro ÷ tokens de la venta (USD
     nominal, 1 USDT = 1 USD), redondeado a 6 decimales. null si faltan los
     tokens o son 0, o si la cantidad del cobro no es un número. Es una
     ORIENTACIÓN para elegir, NO una valoración: el valor en € lo pone el
     cálculo fiscal con el tipo del BCE de cada fecha. */
function ccDiasEntreFechas(fechaCobro, fechaSalida) {
  const a = ccFechaDiaNorm(fechaCobro);
  const b = ccFechaDiaNorm(fechaSalida);
  if (!a || !b) return null;
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((da - db) / 86400000);
}
function ccPrecioPorTokenImplicito(cantidadCobro, cantidadTokens) {
  if (!Number.isFinite(cantidadCobro)) return null;
  if (!Number.isFinite(cantidadTokens) || cantidadTokens === 0) return null;
  return red6(cantidadCobro / cantidadTokens);
}

/* Sugerencias del buscador de pagos diferidos (nada se vincula
   solo). Se abre con las fechas de CC_SUG_DIAS días antes a CC_SUG_DIAS
   después de la venta y cada cobro lleva un icono por señal que cumple
   (ccSenalesCobro; 📍 y 💲):
   - "direccion": viene de la dirección a la que fueron los tokens;
   - "precio": su precio por token está a ±CC_SUG_MARGEN de lo que pagaste
     por token en USD (moneda en la que se venden los tokens). */
const CC_SUG_DIAS = 60;
const CC_SUG_MARGEN = 0.35;

/* "AAAA-MM-DD" + n días, o "" si el día no vale. */
function ccSumarDias(dia, n) {
  const d = ccFechaDiaNorm(dia);
  if (!d) return "";
  return new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + n)).toISOString().slice(0, 10);
}

/* Lo que pagaste por token en USD del token de la salida (su contrato):
   media de sus COMPRA hasta el día de la salida. Cada compra cuenta con:
   - on-chain: su importe en USD;
   - por banco: su coste en € por el tipo del BCE de su día (o del anterior
     más cercano, con el tope de ccEurOrientativo); sin tipo, no cuenta;
   - canje: lo que costaron los tokens quemados en su hash (misma función
     con el contrato viejo), repartido entre los recibidos.
   null si no hay ninguna. */
function ccPrecioCompraUsd(registros, salida, tiposBce, prof = 0) {
  const dia = ccFechaCorta(salida);
  const contrato = normalizarDireccion(salida && salida.contrato);
  if (!dia || !contrato || prof > 5) return null;
  let usd = 0, tokens = 0;
  for (const r of registros) {
    if (r.categoria !== "COMPRA" || normalizarDireccion(r.contrato) !== contrato) continue;
    const d = ccFechaCorta(r);
    if (!d || d > dia || !ccEsNumeroPositivo(r.cantidad)) continue;
    let importe = null;
    if (r.via_compra === "BANCARIA") {
      const bce = ccEsNumeroPositivo(r.coste_eur) ? ccEurOrientativo(1, d, tiposBce) : null;
      if (bce) importe = r.coste_eur / bce.eur;
    } else if (r.via_compra === "CANJE") {
      const burns = registros.filter(b => b.hash === r.hash && b.categoria === "VENTA" &&
        normalizarDireccion(b.destino) === BURN && ccEsNumeroPositivo(b.cantidad));
      const burn = burns.find(b => b.cantidad === r.cantidad) || burns[0];
      const previo = burn ? ccPrecioCompraUsd(registros, burn, tiposBce, prof + 1) : null;
      if (previo !== null) importe = previo * burn.cantidad;
    } else if (ccEsNumeroPositivo(r.importe_usdt)) {
      importe = r.importe_usdt;
    }
    if (importe === null) continue;
    usd += importe;
    tokens += r.cantidad;
  }
  return tokens > 0 ? red6(usd / tokens) : null;
}

/* Señales de que un cobro paga la salida: lista con "direccion" y/o
   "precio". importe = los USD que se comparan con lo pagado (por defecto, el
   cobro entero; ccOrdenarSugerencias le suma lo ya cobrado de la venta y le
   quita lo que el cobro ya pagó de otras). */
function ccSenalesCobro(cobro, salida, precioCompra, importe) {
  const out = [];
  const dest = normalizarDireccion(salida && salida.destino);
  if (dest && normalizarDireccion(cobro.origen) === dest) out.push("direccion");
  const p = ccPrecioPorTokenImplicito(importe === undefined ? cobro.cantidad : importe, salida && salida.cantidad);
  if (p !== null && precioCompra > 0 && Math.abs(p / precioCompra - 1) <= CC_SUG_MARGEN + 1e-9) out.push("precio");
  return out;
}

/* Filas del buscador con sus señales, en orden: más ⭐ arriba y, a igualdad,
   la más cercana a la venta (el orden de llegada desempata). En una
   venta ya cobrada en parte, el precio cuenta lo ya cobrado más este cobro,
   y de un cobro que ya pagó otra venta solo cuenta lo que le queda. Ese
   importe va en la fila (importe), para que el % que se ve sea el mismo que
   decide el 💲. Con algo ya cobrado, el 💲 pide además que este cobro deje
   la venta más cerca de lo que costó que sin él (si no, cualquier cobro
   pequeño lo llevaría, y el que completa una venta muy por debajo no). */
function ccOrdenarSugerencias(cobros, salida, precioCompra, ctx, cache) {
  const ventaIds = (salida && ctx && ctx.salidasVinculadas && ctx.salidasVinculadas.get(salida.clave)) || [];
  const ventas = ((cache && cache.pagos_diferidos) || {}).ventas;
  let yaCobrado = 0;
  for (const v of Array.isArray(ventas) ? ventas : []) {
    if (!v || !ventaIds.includes(v.id)) continue;
    for (const a of ccAsignacionesValidas(v)) {
      const c = Number(a.cantidad_asignada);
      if (Number.isFinite(c) && c > 0) yaCobrado += c; // como el motor: una asignación de 0 o negativa no vale
    }
  }
  const pYa = yaCobrado > 0 ? ccPrecioPorTokenImplicito(yaCobrado, salida && salida.cantidad) : null;
  const lejania = p => Math.abs(p / precioCompra - 1);
  const filas = cobros.map((c, orden) => {
    const info = ctx && ctx.cobrosAsignados ? ctx.cobrosAsignados.get(c.clave) : null;
    // Sin cantidad legible no hay precio que enseñar (ni el de lo ya cobrado).
    const legible = ccEsNumeroPositivo(c.cantidad);
    const resto = legible ? Math.max(0, c.cantidad - (info && Number.isFinite(info.asignado) ? info.asignado : 0)) : null;
    const dias = ccDiasEntreFechas(c, salida);
    const importe = legible ? yaCobrado + resto : null;
    const pTotal = legible ? ccPrecioPorTokenImplicito(importe, salida && salida.cantidad) : null;
    const acerca = pYa === null || !(precioCompra > 0) || (pTotal !== null && lejania(pTotal) < lejania(pYa));
    const sen = ccSenalesCobro(c, salida, precioCompra, importe).filter(x => acerca || x !== "precio");
    // como: qué suma el precio de la fila, para su burbuja.
    // Sin importe aparte solo si es el cobro entero y nada ya cobrado (no
    // si la suma da lo mismo por casualidad).
    const entero = yaCobrado === 0 && resto === c.cantidad;
    return { c, orden, sen, importe: !legible || entero ? undefined : importe,
      como: { ya: yaCobrado > 0, parte: legible && resto !== c.cantidad },
      dist: dias === null ? Infinity : Math.abs(dias) };
  });
  return filas.sort((a, b) => b.sen.length - a.sen.length || a.dist - b.dist || a.orden - b.orden);
}

/* ----------------------------- Candidatos (puro) -----------------------------
   Qué movimientos se pueden vincular («vinculables»), sin suposiciones:
   - SALIDA: contrato de un inmueble CONFIRMADO del catálogo (fuera
     CANDIDATA y DESCARTADA, como inmueblesConfirmadosCache de js/14) y
     origen = wallet o vault de la Config. La categoría actual no decide, y
     el destino no se exige (no se aprende ni se marca quién recibe).
   - COBRO: USDT o USDC que entra a la wallet o el vault desde un tercero.
     Sin origen no se puede confirmar «desde tercero» → no es candidato.
     Por defecto solo cuentan los entrantes SIN contraparte explicada
     (categoría DEPOSITO o REVISAR); verTodos=true admite todos (el buscador
     lo usa cuando el usuario pide ver también los ya explicados).
   «Vinculable» no es lo mismo que «PENDIENTE de vincular» (vinculable Y sin
   vínculo, sección siguiente). El contexto recibe cache, config y registros
   (función pura); los registros sirven para resolver los vínculos
   CONFIRMADOS de cache.pagos_diferidos contra la clasificación de la sesión. */
function ccContextoCandidatos(cache, config, registros) {
  const propias = new Set();
  const w = normalizarDireccion(config && config.wallet);
  const v = normalizarDireccion(config && config.vault);
  if (w) propias.add(w);
  if (v) propias.add(v);
  const inmuebles = new Set(
    cache ? Object.keys(inmueblesConfirmadosCache(cache)).map(normalizarDireccion) : []);
  const dudas = cache ? dudasCatalogoCache(cache) : new Set(); // para «Es un inmueble»
  const vinculos = ccVinculosDeContexto(cache, registros);
  /* Lo que tú dijiste que es un movimiento neutro (en
     Revisión o en tus ajustes) ya no es una salida por vincular. También
     «✔ Dejar como movimiento neutro», que no lleva categoría
     (deja la del motor). Por eso `decididas` guarda toda decisión de
     Revisión además de los neutros de tus ajustes, y ccEsSalidaPendiente
     solo la mira si el movimiento es neutro. */
  const decididas = new Set();
  const ajustes = cache && cache.ajustes_usuario;
  if (pdEsObjeto(ajustes)) {
    for (const [k, a] of Object.entries(ajustes)) {
      if (pdEsObjeto(a) && (a.categoria === "MOVIMIENTO" || ccEsAjusteDecision(a))) decididas.add(ccClaveAjuste(k));
    }
  }
  // Para «🚫 Es spam» (ccPuedeSerSpam): roles, inmuebles y contratos conocidos.
  const direcciones = cache ? construirContexto(cache) : null;
  return { propias, inmuebles, dudas, direcciones, hayCache: !!cache, hayPropias: propias.size > 0,
           salidasVinculadas: vinculos.salidasVinculadas,
           cobrosAsignados: vinculos.cobrosAsignados,
           noAplicadas: vinculos.noAplicadas, decididas };
}

/* Vínculos CONFIRMADOS del bloque pagos_diferidos resueltos contra la
   clasificación de la sesión (resolverReferenciaMovimiento de js/14 nunca
   elige si hay ambigüedad; si un movimiento no está, su vínculo no marca
   ningún registro). Los ANULADOS no cuentan: anular devuelve los registros a
   pendientes. Solo cuenta lo que el motor APLICÓ (la marca
   pago_diferido de ese vínculo en el registro, como js/18): uno
   guardado que el motor rechaza no se enseña como vinculado.
   Devuelve dos Mapas por clave de registro y un Set:
   - salidasVinculadas: clave → [ids de venta CONFIRMADA];
   - cobrosAsignados: clave → { asignado (Σ confirmada, red6), ventaIds };
   - noAplicadas: ids de las ventas CONFIRMADAS que el motor no aplicó. */
function ccMarcaDeVenta(reg, rol, ventaId) {
  const pd = reg && reg.pago_diferido;
  return pdEsObjeto(pd) && pd.rol === rol && [].concat(pd.venta_id).includes(ventaId);
}
function ccVinculosDeContexto(cache, registros) {
  const salidasVinculadas = new Map();
  const cobrosAsignados = new Map();
  const noAplicadas = new Set();
  const ventas = ((cache && cache.pagos_diferidos) || {}).ventas;
  if (!Array.isArray(ventas) || !Array.isArray(registros) || !registros.length) {
    return { salidasVinculadas, cobrosAsignados, noAplicadas };
  }
  for (const v of ventas) {
    if (!v || v.estado !== "CONFIRMADO") continue;
    const regSalida = resolverReferenciaMovimiento(v.salida, registros);
    if (!regSalida || !ccMarcaDeVenta(regSalida, "salida", v.id)) {
      noAplicadas.add(v.id);
      continue;
    }
    if (!salidasVinculadas.has(regSalida.clave)) salidasVinculadas.set(regSalida.clave, []);
    salidasVinculadas.get(regSalida.clave).push(v.id);
    for (const a of ccAsignacionesValidas(v)) {
      if (!a.pago) continue;
      const regPago = resolverReferenciaMovimiento(a.pago, registros);
      if (!regPago || !ccMarcaDeVenta(regPago, "pago", v.id)) continue;
      const previo = cobrosAsignados.get(regPago.clave) || { asignado: 0, ventaIds: [] };
      const c = Number(a.cantidad_asignada);
      if (Number.isFinite(c)) previo.asignado = red6(previo.asignado + c);
      if (!previo.ventaIds.includes(v.id)) previo.ventaIds.push(v.id);
      cobrosAsignados.set(regPago.clave, previo);
    }
  }
  return { salidasVinculadas, cobrosAsignados, noAplicadas };
}
function ccEsSalidaCandidata(reg, ctx) {
  if (!reg || !ctx) return false;
  const contrato = normalizarDireccion(reg.contrato);
  const origen = normalizarDireccion(reg.origen);
  /* Lo que va a otra cuenta tuya (de la wallet al vault) no
     es una venta. */
  return !!contrato && ctx.inmuebles.has(contrato) &&
         !!origen && ctx.propias.has(origen) &&
         !ctx.propias.has(normalizarDireccion(reg.destino));
}
/* Stablecoin que entra a la wallet o el vault desde un tercero. */
function ccEsCobroEntrante(reg, ctx) {
  if (!reg || !ctx) return false;
  const contrato = normalizarDireccion(reg.contrato);
  const origen = normalizarDireccion(reg.origen);
  const destino = normalizarDireccion(reg.destino);
  return STABLECOINS.has(contrato) &&
         !!destino && ctx.propias.has(destino) &&
         !!origen && !ctx.propias.has(origen);
}
/* Categorías de entrante SIN contraparte explicada: DEPOSITO («verificar
   origen») y REVISAR. Las demás (REWARD, RENDIMIENTO casado por CSV,
   MOVIMIENTO…) ya tienen su origen explicado y solo entran con verTodos. */
const CC_CATEGORIAS_COBRO_ACOTADO = ["DEPOSITO", "REVISAR"];
function ccEsCobroCandidato(reg, ctx, verTodos) {
  if (!ccEsCobroEntrante(reg, ctx)) return false;
  if (verTodos) return true;
  return CC_CATEGORIAS_COBRO_ACOTADO.includes(reg && reg.categoria);
}
/* Solo la usan los tests. */
function ccCandidatura(reg, ctx, verTodos) {
  if (ccEsSalidaCandidata(reg, ctx)) return "salida";
  if (ccEsCobroCandidato(reg, ctx, verTodos)) return "cobro";
  return null;
}

/* ----------------------------- Pendientes de vincular (puro) -----------------------------
   «PENDIENTE de vincular» = VINCULABLE Y SIN VÍNCULO. Se usa en las marcas,
   los contadores de la cabecera y el buscador.
   - SALIDA pendiente: vinculable y que el motor aceptaría vincular (ni
     registro VENTA correlacionado en su hash, con o sin importe_usdt —quema,
     liquidación o P2P: el motor los rechaza— ni contraprestación propia
     asignada por ajustes), y SIN venta CONFIRMADA en pagos_diferidos.
   - COBRO pendiente: cobro vinculable SIN asignación CONFIRMADA, o con resto
     disponible > 0 (uno asignado del todo ya no se propone). Si tiene
     asignación y su cantidad no es un número, no se puede comprobar el
     resto → fuera (no se supone).
   Los vínculos ANULADOS no cuentan: anular devuelve el registro a
   pendiente. */
function ccSalidaConContraprestacionPropia(reg) {
  if (!reg || reg.importe_usdt === null || reg.importe_usdt === undefined) return false;
  return Number.isFinite(Number(reg.importe_usdt));
}
function ccEsSalidaPendiente(reg, ctx) {
  if (!ccEsSalidaCandidata(reg, ctx)) return false;
  /* El motor rechaza vincular cualquier registro VENTA correlacionado en su
     hash: no es vinculable de hecho, así que tampoco está pendiente. */
  /* Tampoco el spam, ni lo que marcaste como neutro. */
  if (reg.categoria === "VENTA" || reg.categoria === "SPAM") return false;
  if (reg.categoria === "MOVIMIENTO" && ctx.decididas && ctx.decididas.has(ccClaveAjuste(reg.clave))) return false;
  if (ccSalidaConContraprestacionPropia(reg)) return false;
  return !(ctx && ctx.salidasVinculadas && ctx.salidasVinculadas.has(reg.clave));
}
function ccEsCobroPendiente(reg, ctx, verTodos) {
  if (!ccEsCobroCandidato(reg, ctx, verTodos)) return false;
  const info = ctx && ctx.cobrosAsignados ? ctx.cobrosAsignados.get(reg.clave) : null;
  if (!info || !(info.asignado > 0)) return true; // sin asignación CONFIRMADA
  if (!Number.isFinite(reg.cantidad)) return false;
  return red6(reg.cantidad - info.asignado) > 1e-9; // resto disponible > 0
}
function ccPendienteDeVincular(reg, ctx, verTodos) {
  if (ccEsSalidaPendiente(reg, ctx)) return "salida";
  if (ccEsCobroPendiente(reg, ctx, verTodos)) return "cobro";
  return null;
}
/* Vínculo CONFIRMADO del registro, para la marca «🔗 vinculada» y el botón
   de la card: null si no lo tiene. Devuelve
   { rol: "salida" | "pago", ventaIds: [...], asignado: Σ|null }. */
function ccVinculoDeRegistro(reg, ctx) {
  if (!reg || !ctx) return null;
  const s = ctx.salidasVinculadas ? ctx.salidasVinculadas.get(reg.clave) : null;
  if (s && s.length) return { rol: "salida", ventaIds: s.slice(), asignado: null };
  const c = ctx.cobrosAsignados ? ctx.cobrosAsignados.get(reg.clave) : null;
  if (c && c.ventaIds.length) return { rol: "pago", ventaIds: c.ventaIds.slice(), asignado: c.asignado };
  return null;
}

/* Texto del distintivo de un registro con vínculo CONFIRMADO (lo usan las
   cards de Revisión y las filas de 📒 Transacciones): dice qué papel tiene
   el registro —la venta o uno de sus pagos— y, detrás, vinc.detalle
   (ccDetalleVinculo) o, si no lo hay, el id del vínculo. sinId = solo el
   papel, para la tabla. */
function ccTextoVinculada(vinc, sinId) {
  const papel = vinc.rol === "salida" ? "🔗 Venta vinculada" : "🔗 Cobro de una venta";
  return sinId ? papel : papel + " · " + (vinc.detalle || vinc.ventaIds.join(" · "));
}

/* Nombres que se entienden en lugar del id del vínculo (pd_…), sacados de
   los registros de la sesión (si falta el registro, el id: no se inventa).
   - ccNombreVenta: «Venta de 2 tokens de Inmueble X · 01/03/2026».
   - ccDetalleVinculo: lo que va detrás del distintivo. En una salida, cuándo
     se cobró («cobrada el 15/03/2026»); en un pago, de qué venta es
     («Inmueble X, 01/03/2026»). */
function ccNombreVenta(venta, registros) {
  const sal = venta ? resolverReferenciaMovimiento(venta.salida, registros || []) : null;
  if (!sal) return venta ? String(venta.id) : "";
  const que = sal.inmueble || sal.simbolo || sal.token || "";
  return "Venta de " + ccCantidad(sal.cantidad) + " tokens" + (que ? " de " + que : "") +
    " · " + (ccFechaVer(sal) || "sin fecha");
}
function ccDetalleVinculo(vinc, ventas, registros) {
  if (!vinc) return "";
  const suyas = (ventas || []).filter(v => v && vinc.ventaIds.includes(v.id));
  const trozos = [];
  for (const v of suyas) {
    if (vinc.rol === "salida") {
      for (const a of ccAsignaciones(v)) {
        const pago = a ? resolverReferenciaMovimiento(a.pago, registros || []) : null;
        const f = pago ? ccFechaVer(pago) : null;
        if (f && !trozos.includes(f)) trozos.push(f);
      }
    } else {
      const sal = resolverReferenciaMovimiento(v.salida, registros || []);
      if (sal) trozos.push((sal.inmueble || sal.simbolo || "?") + ", " + (ccFechaVer(sal) || "sin fecha"));
    }
  }
  if (!trozos.length) return "";
  return vinc.rol === "salida" ? "cobrada el " + trozos.join(" y ") : trozos.join(" · ");
}

/* ----------------------------- Lo que necesita una decisión (puro) -----------------------------
   La lista de 🔍 Revisión solo lleva lo que el usuario tiene que mirar; lo
   que la clasificación ya resolvió sola (gas, spam, depósitos, compras,
   ventas con su cobro, rendimientos…) vive en 📒 Transacciones.
   - ccMotivoRevision: "revisar" (registro marcado a revisar, también los
     que el usuario manda desde Transacciones), "salida" (salida de tokens
     por vincular) o null si no necesita nada. Los cobros por vincular NO
     cuentan: son depósitos ya clasificados que no piden nada por sí solos;
     el buscador de «🔗 Vincular cobro…» los ofrece al vincular una venta.
     «A revisar» manda sobre lo demás.
   - ccColaRevision: los registros de la lista, en el orden de la
     clasificación. */
function ccMotivoRevision(reg, ctx) {
  if (!reg) return null;
  if (reg.revisar) return "revisar";
  return ccEsSalidaPendiente(reg, ctx) ? "salida" : null;
}
function ccColaRevision(registros, ctx) {
  return (registros || []).filter(r => ccMotivoRevision(r, ctx));
}

/* ----------------------------- Decisiones de la cola -----------------------------
   Cada tarjeta a revisar ofrece primero «✔ …» (lo que dice la app, con su
   nombre de 📒 y la etiqueta «Sugerida») y después solo las alternativas que
   tienen sentido para ese movimiento:
   - «Es una venta…» (importe cobrado en USD): salidas de un inmueble.
   - «Compra externa…» (sin precio: lo pagado se pone en 💶): entradas de
     un inmueble, y RNT que te llega.
   - «Regalo (airdrop)» y «Recompensa DeFi»: RNT que te llega.
   - «Ingreso de dinero…» (USDT o USDC recibido): entradas de una stablecoin.
   - «Movimiento neutro»: siempre.
   - «🚫 Es spam»: movimientos de la blockchain (el mismo ajuste que el 🚫
     de 📒 Transacciones, así su ↩ lo deshace también allí).
   Cada decisión es un ajuste en ajustes_usuario, que el motor ya
   aplica, con revisar:false y su marca en la nota; se deshace en
   «Movimientos ya decididos». Puede sustituir un ajuste que solo pedía revisión
   («Mandado a revisar» o «Sacado del spam», de js/18): la nota lo recuerda
   y deshacer lo devuelve. Un ajuste de otro origen nunca se pisa. Las
   marcas, sin emojis (texto plano en la cache). */
const CC_MARCA_DECISION = "Decidido por ti en Revisión";
/* Las de 📒 Transacciones: un solo sitio para las dos pestañas (js/18 las
   usa con sus nombres TX_MARCA_*). */
const CC_MARCA_REVISAR = "Mandado a revisar por ti";
const CC_MARCA_SACADO = "Sacado del spam por ti";
const CC_MARCA_SPAM = "Mandado al spam por ti";
const CC_SUFIJO_SPAM_REVISION = " en Revisión";
/* La del coste de las compras bancarias (js/20 la usa como CB_MARCA_COSTE). */
const CC_MARCA_COSTE = "Coste puesto por ti";
/* Marcas antiguas («desde la SPA», y «Revision» sin tilde): se siguen
   reconociendo en caches viejas, pero ya no se escriben. */
const CC_MARCAS_ANTIGUAS = {
  [CC_MARCA_DECISION]: "Decidido en Revision desde la SPA",
  [CC_MARCA_REVISAR]: "Mandado a revisar desde la SPA",
  [CC_MARCA_SACADO]: "Sacado del spam desde la SPA",
  [CC_MARCA_SPAM]: "Mandado al spam desde la SPA",
  [CC_SUFIJO_SPAM_REVISION]: " en Revision",
};
/* ¿Empieza la nota por la marca, o por su forma antigua? */
function ccEmpiezaConMarca(nota, marca) {
  const s = String(nota || "");
  return s.startsWith(marca) || (!!CC_MARCAS_ANTIGUAS[marca] && s.startsWith(CC_MARCAS_ANTIGUAS[marca]));
}
/* Lo mismo con un trozo en medio de la nota. */
function ccContieneMarca(nota, marca) {
  const s = String(nota || "");
  return s.includes(marca) || (!!CC_MARCAS_ANTIGUAS[marca] && s.includes(CC_MARCAS_ANTIGUAS[marca]));
}
/* « (AAAA-MM-DD)» detrás de la marca de una nota. */
function ccDiaNota(fechaISO) {
  return " (" + String(fechaISO || "").slice(0, 10) + ")";
}
/* Los ajustes que solo piden revisión (los escribe js/18 y los devuelve
   deshacer una decisión): un solo sitio para su forma. */
function ccNotaMandarRevisar(motivo, fechaISO) {
  const m = String(motivo || "").replace(/\s+/g, " ").trim();
  return CC_MARCA_REVISAR + ccDiaNota(fechaISO) + (m ? ": " + m : "");
}
/* El ajuste de «💶 Coste…» (también lo dejan deshacer una decisión y
   «↩ Quitar de revisar»): un solo sitio para su forma. */
function ccAjusteCoste(coste, fechaISO) {
  return { coste_eur: coste, nota: CC_MARCA_COSTE + ccDiaNota(fechaISO) };
}
/* Lo pagado en USD de una compra externa («En USD…» de 💶):
   puede ir con su coste_eur en cualquier ajuste que lo lleve. */
const CC_CAMPOS_USD = ["pagado_usd", "fecha_pago_usd"];
/* Lo pagado en USD va con su coste: quien copia el coste de un ajuste a
   otro (mandar o quitar de revisar, «✔ Dejar», deshacer) lo copia también. */
function ccConUsd(destino, origen) {
  for (const c of CC_CAMPOS_USD) if (origen && c in origen) destino[c] = origen[c];
  return destino;
}
/* Lo pagado en USD de un ajuste, { importe, fecha } o null: solo si sus €
   con el BCE de ese día son su coste_eur (si alguien cambió el € a mano en
   el JSON, ya no vale). Lo usan 💶 y 📊. */
function ccPagadoUsd(ajuste, tiposBce, cache) {
  if (!pdEsObjeto(ajuste) || !ccEsNumeroPositivo(ajuste.pagado_usd)) return null;
  const fecha = String(ajuste.fecha_pago_usd || "");
  const r = ccEurOrientativo(ajuste.pagado_usd, fecha, tiposBce || {}, cache);
  const eur = r ? Math.round(r.eur * 100) / 100 : NaN;
  return Number.isFinite(eur) && Math.abs(eur - Number(ajuste.coste_eur)) < 0.005 ? { importe: ajuste.pagado_usd, fecha } : null;
}
/* ¿Es un ajuste de «💶 Coste…»? Solo coste_eur (y lo pagado en USD) y la
   nota con su marca (js/20 y «Mandar a revisar» de js/18). */
function ccEsAjusteCoste(ajuste) {
  return ccSoloCampos(ajuste, ["coste_eur", "nota", ...CC_CAMPOS_USD]) && typeof ajuste.nota === "string" &&
    ajuste.nota.startsWith(CC_MARCA_COSTE);
}
function ccAjusteSacadoSpam(fechaISO) {
  return { categoria: "REVISAR", subcategoria: "PENDIENTE", revisar: true, nota: CC_MARCA_SACADO + ccDiaNota(fechaISO) };
}
/* Avisos cortos al guardar (también los usa js/18). */
// El navegador no dejó guardar (lleno o bloqueado).
const CC_SIN_DISCO = "No se pudo guardar en este navegador: guarda una copia en 🚀 Puesta en marcha.";
const CC_SIN_CACHE = "Sin datos todavía.";
/* Guardado, pero sin reclasificar (falta la cache, el
   archivo de rendimientos o la wallet: ejecutarClasificacion ya dice qué),
   así que la tarjeta no se mueve todavía. */
const CC_AL_CLASIFICAR = "Apuntado: se verá cuando esté todo en 🚀 Puesta en marcha.";
/* Marca la cache, la autoguarda y reclasifica (que repinta todo). Devuelve
   si quedó guardado (en este navegador), o null si no se pudo reclasificar (ya avisado). */
async function ccGuardarYReclasificar() {
  marcarCacheDirty();
  await autoGuardarCache();
  const enDisco = !state.cacheDirty;
  // Sin los avisos de la clasificación (ya sale el de la acción).
  if (ejecutarClasificacion({ avisos: false, detalle: false })) return enDisco;
  toast(CC_AL_CLASIFICAR + (enDisco ? "" : " " + CC_SIN_DISCO), "warn");
  return null;
}
const CC_ANTES = { revisar: "antes: mandado a revisar", sacado: "antes: sacado del spam" };
const CC_NOMBRE_CATEGORIA = {
  REVISAR: "A revisar", DEPOSITO: "Depósito", VENTA: "Venta", COMPRA: "Compra", MOVIMIENTO: "Movimiento neutro",
  RENDIMIENTO: "Rendimiento", REWARD: "Recompensa DeFi", RETIRADA: "Retirada",
  COMISION: "Comisión de red", SPAM: "Spam",
};
const CC_CAMPOS_DECISION = ["categoria", "subcategoria", "revisar", "nota", "importe_usdt", "coste_eur", "via_compra", ...CC_CAMPOS_USD];

function ccNombreCategoria(cat) {
  return CC_NOMBRE_CATEGORIA[cat] || categoriaAMostrar(cat);
}
/* Los ajustes se indexan por clave normalizada (trim + minúsculas), igual
   que aplicarAjustesUsuario de js/14 (también lo usa js/18). */
function ccClaveAjuste(clave) {
  return String(clave || "").trim().toLowerCase();
}
function ccBuscarAjuste(ajustes, clave) {
  if (!pdEsObjeto(ajustes)) return null;
  const k = ccClaveAjuste(clave);
  for (const [c, v] of Object.entries(ajustes)) if (ccClaveAjuste(c) === k) return { clave: c, ajuste: v };
  return null;
}
/* ¿Lleva el ajuste solo esos campos? (así deshacer nunca borra información
   de otro origen; también lo usa js/18). */
function ccSoloCampos(ajuste, permitidos) {
  return pdEsObjeto(ajuste) && Object.keys(ajuste).every(k => permitidos.includes(k));
}
/* ¿Es un ajuste de js/18 que solo pide revisión? "revisar" | "sacado" | null.
   El «Mandado a revisar» puede llevar el coste_eur de una
   compra externa (lo devuelve deshacer un «✔ Dejar como compra» con coste,
   o lo pone «💶 Coste…»); sigue siendo tuyo y la decisión siguiente lo
   conserva. */
function ccAjusteQuePideRevision(ajuste) {
  if (!ccSoloCampos(ajuste, ["categoria", "subcategoria", "revisar", "nota", "coste_eur", ...CC_CAMPOS_USD]) || ajuste.revisar !== true ||
      typeof ajuste.nota !== "string") return null;
  if (ccEmpiezaConMarca(ajuste.nota, CC_MARCA_REVISAR) && !("categoria" in ajuste)) return "revisar";
  if (ccEmpiezaConMarca(ajuste.nota, CC_MARCA_SACADO) && ajuste.categoria === "REVISAR" && !("coste_eur" in ajuste)) return "sacado";
  return null;
}
/* ¿Es una decisión tomada aquí? (también el «Es spam» de Revisión). */
function ccEsAjusteDecision(ajuste) {
  if (!ccSoloCampos(ajuste, CC_CAMPOS_DECISION) || ajuste.revisar !== false || typeof ajuste.nota !== "string") return false;
  return ccEmpiezaConMarca(ajuste.nota, CC_MARCA_DECISION) ||
    (ccEmpiezaConMarca(ajuste.nota, CC_MARCA_SPAM) && ccContieneMarca(ajuste.nota, CC_SUFIJO_SPAM_REVISION));
}
/* Estado de un registro de la cola frente a las decisiones:
   "libre" (sin ajuste), "propio" (un ajuste que solo pedía revisión),
   "ajeno" (otro ajuste manual: se cambia en «✏️ Ajustes en JSON»). */
function ccEstadoDecision(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  if (!h) return "libre";
  return ccAjusteQuePideRevision(h.ajuste) ? "propio" : "ajeno";
}

/* Sentido del movimiento frente a tus direcciones: "entrada", "salida",
   "interno" o "" (sin origen ni destino propio). */
function ccSentidoBasico(reg, ctx) {
  const p = (ctx && ctx.propias) || new Set();
  const o = p.has(normalizarDireccion(reg.origen || "")), d = p.has(normalizarDireccion(reg.destino || ""));
  if (o && d) return "interno";
  if (d) return "entrada";
  if (o) return "salida";
  return "";
}
function ccEsNumeroPositivo(x) {
  return typeof x === "number" && Number.isFinite(x) && x > 0;
}

/* Lo que dicen «Movimiento neutro» y «🚫 Es spam» al pasar el ratón (también 📒). */
const CC_MAS_QUE_ES = " Más en ⓘ Qué es cada cosa.";
const CC_AYUDA_NEUTRO = "Sigue siendo tuyo (otra wallet, un exchange, staking o pool). Sin efecto fiscal." + CC_MAS_QUE_ES;
const CC_AYUDA_NEUTRO_ENTRADA = "Ya era tuyo: vuelve de otra wallet, un exchange, staking o pool. Sin efecto fiscal. " +
  "Si llega por primera vez, lo compraste o te lo regalaron, no es esto." + CC_MAS_QUE_ES;
const CC_AYUDA_SPAM = "Falso o sin valor: la app no lo cuenta.";
const CC_AYUDA_INMUEBLE = "Lo confirma en el catálogo: cambia todos sus movimientos.";
const CC_AYUDA_REGALO = "Te llega gratis (p. ej. un reparto gratis o airdrop). Tiene efecto fiscal." + CC_MAS_QUE_ES;
const CC_AYUDA_RECOMPENSA = "Premio del staking o farming de RNT." + CC_MAS_QUE_ES;
const CC_AYUDA_COMPRA = "La app no encuentra el pago: por banco, en un exchange, desde otra wallet, " +
  "o pagado antes y enviado después. Lo pagado se edita en «💶 Coste de las compras externas», justo debajo." + CC_MAS_QUE_ES;

/* «ⓘ Qué es cada cosa», arriba en 🔍 y 📒 (en su hueco [data-que-es]): al
   pulsarlo, una ventana con una línea por tipo de movimiento, de lo que hace
   la app, para quien sabe poco de impuestos y de cripto. */
const CC_QUE_ES_CADA_COSA = [
  ["Compra / Venta", "tokens de inmuebles que compras o vendes, y RNT que compras. La venta tiene efecto fiscal."],
  ["Permuta", "el token que das al cambiarlo por otro (p. ej. das USDT y recibes RNT). Cuenta como una venta."],
  ["Compra externa", "tokens que compraste y cuyo pago la app no encuentra: por banco, en un exchange, desde otra wallet, o pagados antes y enviados después (p. ej. una preventa). Lo pagado se edita en «💶 Coste de las compras externas». Si pagaste con USDT o USDC de esta wallet, deja esa salida como «Salida de dinero»."],
  ["Canje de contrato", "Reental cambia el token de un inmueble por otro nuevo del mismo inmueble. No es una venta: sin efecto fiscal."],
  ["Rendimiento", "lo que te reparte Reental de los inmuebles (alquileres u otros beneficios). Tiene efecto fiscal."],
  ["Recompensa DeFi", "tokens extra por tener tus RNT en staking o farming (como los intereses de una cuenta de ahorro). Tiene efecto fiscal."],
  ["Movimiento neutro", "movimientos entre tus propias cuentas (otra wallet o un exchange) y lo que metes o sacas del staking, el farming o un pool. Siguen siendo tuyos: sin efecto fiscal. El dinero que llega por primera vez de otra wallet tuya es «Ingreso de dinero»."],
  ["Ingreso / Salida de dinero", "dólares digitales (USDT o USDC) que entran a tu wallet o salen de ella. La salida tiene efecto fiscal."],
  ["Regalo recibido", "tokens que te llegan sin pagarlos, p. ej. un reparto gratis (airdrop) o una promoción. Tiene efecto fiscal."],
  ["Comisión de red (gas)", "lo que pagas en POL (la moneda de la red Polygon) por cada operación que haces tú; lo que te llega no paga. En una compra o una venta, cuenta en su coste."],
  ["Spam", "tokens falsos o sin valor que te envían para engañarte (p. ej. imitan a uno real o a tu dirección). La app no los cuenta: sin efecto fiscal."],
];
function ccHtmlQueEs() {
  return '<button type="button" class="cc-que-es"><span class="cc-info" aria-hidden="true">ⓘ</span>Qué es cada cosa</button>';
}
/* La ventana, en el <body> con el aspecto de la de 📊 (`dash-dlg`, que
   js/16 cierra al cambiar de pestaña); al cerrarla, el foco vuelve al botón. */
function ccHtmlDialogoQueEs() {
  return '<div class="dash-dlg-cab"><h3 id="ccDlgQueEsTit">ⓘ Qué es cada cosa</h3>' +
    '<button type="button" class="dash-dlg-x" aria-label="Cerrar">✕</button></div>' +
    CC_QUE_ES_CADA_COSA.map(([n, t]) => "<p><b>" + ccEsc(n) + "</b>: " + ccEsc(t) + "</p>").join("");
}
function ccAbrirQueEs(boton) {
  const dlg = document.createElement("dialog");
  dlg.className = "arr-dlg dash-dlg cc-que-es-dlg";
  dlg.setAttribute("aria-labelledby", "ccDlgQueEsTit");
  dlg.innerHTML = ccHtmlDialogoQueEs();
  document.body.appendChild(dlg);
  dlg.querySelector(".dash-dlg-x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => { dlg.remove(); boton.focus(); });
  dlg.showModal();
}

/* Lo que dice «✔ …» (dejarlo como está): el nombre de la operación en 📒
   (txOperacion, js/18, cargado después), sin su «(a revisar)»: el botón lo
   quita de revisar; sin él, o con una subcategoría que 📒 no conoce, el de
   la categoría. En un cobro asignado en parte (el único con vínculo que se
   deja), lo que queda es dinero tuyo: «Ingreso de dinero», aunque 📒 diga
   «Cobro de una venta». También en «Ya decididos». */
function ccNombreDejar(reg) {
  if (pdEsObjeto(reg.pago_diferido)) return "Ingreso de dinero";
  const op = typeof txOperacion === "function" ? txOperacion(reg) : "";
  return op && op !== String(reg.subcategoria || "") ? op.replace(/ \(a revisar\)$/, "") : ccNombreCategoria(reg.categoria);
}

/* Opciones de la tarjeta: [{ id, etiqueta, sugerida, pide, ayuda? }] con pide =
   "usd" | null (lo que hay que escribir antes de guardar). */
function ccOpcionesDecision(reg, ctx) {
  if (!reg) return [];
  /* Lo que tiene un vínculo aplicado se cambia desde el vínculo (editar o
     anular): «neutro» o «spam» en un cobro dejaría sin lote lo cobrado por
     la venta, y «Dejar como venta» seguiría valiendo al anular. Solo un cobro asignado
     en parte puede quedarse como depósito: el resto es dinero tuyo. */
  const pd = reg.pago_diferido;
  if (pdEsObjeto(pd)) {
    return pd.rol === "pago" && reg.categoria === "DEPOSITO"
      ? [{ id: "dejar", etiqueta: "✔ " + ccNombreDejar(reg), sugerida: true, pide: null }]
      : [];
  }
  const sentido = ccSentidoBasico(reg, ctx);
  const contrato = normalizarDireccion(reg.contrato || "");
  const esInmueble = !!reg.inmueble || !!(ctx && ctx.inmuebles && ctx.inmuebles.has(contrato));
  const esEstable = STABLECOINS.has(contrato);
  /* Un registro sacado del archivo de Reental (sin movimiento propio en la
     blockchain) solo se deja o se marca neutro. */
  const onchain = reg.fuente !== "CSV_REENTAL";
  const cat = reg.categoria;
  const sinImporte = cat === "VENTA" && !ccEsNumeroPositivo(reg.importe_usdt);
  const ops = [];
  /* Un token con dudas del catálogo: confirmarlo aquí, como en el catálogo. */
  if (onchain && direccionValida(contrato) && ctx && ctx.dudas && ctx.dudas.has(contrato)) {
    ops.push({ id: "inmueble", etiqueta: "🏠 Es un inmueble", sugerida: false, pide: null, ayuda: CC_AYUDA_INMUEBLE });
  }
  const dejar = cat && cat !== "REVISAR" && cat !== "SPAM" && !sinImporte;
  if (dejar) ops.push({ id: "dejar", etiqueta: "✔ " + ccNombreDejar(reg), sugerida: true, pide: null });
  if (onchain && sentido === "salida" && esInmueble && !(dejar && cat === "VENTA")) {
    ops.push({ id: "venta", etiqueta: "Es una venta…", sugerida: cat === "VENTA", pide: "usd" });
  }
  if (onchain && sentido === "entrada" && esInmueble && !(dejar && cat === "COMPRA")) {
    ops.push({ id: "compra", etiqueta: "Compra externa…", sugerida: false, pide: null, ayuda: CC_AYUDA_COMPRA });
  }
  if (onchain && sentido === "entrada" && esEstable && !(dejar && cat === "DEPOSITO")) {
    ops.push({ id: "dinero", etiqueta: "Ingreso de dinero…", sugerida: false, pide: "usd" });
  }
  /* RNT que te llega, venga de donde venga: cada movimiento se decide
     solo (ninguna sugerida: la app no sabe qué es). La compra va sin
     precio: se pone en 💶. */
  if (ccEsEntradaRnt(reg, ctx)) {
    const yaEs = sub => dejar && cat === "REWARD" && reg.subcategoria === sub;
    if (!yaEs("GPP_REGALO")) ops.push({ id: "regalo", etiqueta: "Regalo (airdrop)", sugerida: false, pide: null, ayuda: CC_AYUDA_REGALO });
    if (!yaEs("RCM_REWARD")) ops.push({ id: "recompensa", etiqueta: "Recompensa DeFi", sugerida: false, pide: null, ayuda: CC_AYUDA_RECOMPENSA });
    if (cat === "REVISAR" || cat === "MOVIMIENTO") ops.push({ id: "compra", etiqueta: "Compra externa…", sugerida: false, pide: null,
      ayuda: CC_AYUDA_COMPRA });
  }
  if (!(dejar && cat === "MOVIMIENTO")) ops.push({ id: "neutro", etiqueta: "Movimiento neutro", sugerida: false, pide: null,
    ayuda: sentido === "entrada" ? CC_AYUDA_NEUTRO_ENTRADA : CC_AYUDA_NEUTRO });
  if (reg.hash && reg.fuente !== "CSV_REENTAL" && ccPuedeSerSpam(reg, ctx, sentido, contrato, esInmueble)) {
    ops.push({ id: "spam", etiqueta: "🚫 Es spam", sugerida: false, pide: null, ayuda: CC_AYUDA_SPAM });
  }
  return ops;
}
/* «🚫 Es spam» con un token conocido (RNT, USDT, USDC, POL o un inmueble
   confirmado): solo lo que te llega de una dirección desconocida (el
   polvo de un spammer); nunca una salida tuya ni lo que llega de Reental,
   de un contrato DeFi, de tus direcciones o de un inmueble. Un token
   desconocido o con dudas del catálogo, siempre. */
function ccPuedeSerSpam(reg, ctx, sentido, contrato, esInmueble) {
  const conocido = contrato === RNT || contrato === "pol" || STABLECOINS.has(contrato) ||
    (esInmueble && !(ctx && ctx.dudas && ctx.dudas.has(contrato)));
  if (!conocido) return true;
  if (sentido !== "entrada") return false;
  return !(ctx && ctx.direcciones) || clasificarDireccion(reg.origen || "", ctx.direcciones) === "DESCONOCIDA";
}

/* El ajuste de una decisión (lanza si falta el importe). `antes` =
   "revisar" | "sacado" | null: el ajuste que sustituye. */
/* Importe escrito a la española («1.234,5», «1234,5», «1.250»). El punto
   solo vale para los miles, en grupos de tres: en cualquier otro sitio
   («1250.75», «1.5») es NaN, con el aviso de CC_AVISO_COMA. */
const CC_RE_IMPORTE = /^-?(?:[1-9]\d{0,2}(?:\.\d{3})+|\d+)(?:,\d+)?$/;
const CC_AVISO_COMA = "Usa la coma para los decimales (1.234,56).";
function ccLeerImporte(valor) {
  if (typeof valor !== "string") return Number(valor);
  const t = valor.trim();
  if (!t.includes(".")) return Number(t.replace(",", "."));
  return CC_RE_IMPORTE.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : NaN;
}
/* El aviso de un importe que no vale: el de la coma si lleva un punto. */
function ccAvisoImporte(valor) {
  return typeof valor === "string" && valor.includes(".") && !Number.isFinite(ccLeerImporte(valor))
    ? CC_AVISO_COMA : "Escribe un importe mayor que 0.";
}
/* La cola « [antes: …]» lleva la fecha y el motivo del
   ajuste sustituido, para devolverlo tal cual al deshacer:
   « [antes: mandado a revisar (2026-03-01): motivo]». */
const CC_RE_DIA_MOTIVO = /\((\d{4}-\d{2}-\d{2})\)(?:: ([\s\S]*))?$/; // « (fecha): motivo» de ccDiaNota
/* Si el ajuste sustituido llevaba el coste de una compra
   bancaria, la cola lo guarda también, para devolverlo al deshacer
   cualquier decisión: « [antes: mandado a revisar (2026-03-01), coste
   123,45 EUR: motivo]» (sin emojis ni €: texto plano en la cache). */
function ccColaAntes(antes, previo) {
  if (!CC_ANTES[antes]) return "";
  const m = CC_RE_DIA_MOTIVO.exec(String((previo && previo.nota) || ""));
  const coste = previo && ccEsNumeroPositivo(previo.coste_eur) ? ", coste " + numEs(previo.coste_eur, 2) + " EUR" : "";
  return " [" + CC_ANTES[antes] + (m ? " (" + m[1] + ")" : "") + coste + (m && m[2] ? ": " + m[2] : "") + "]";
}
/* Lo contrario: { fecha, motivo, coste } de la cola (vacíos o null si es
   una cola antigua o no lo traía). */
const CC_RE_COLA = /^(?: \((\d{4}-\d{2}-\d{2})\))?(?:, coste (\d{1,3}(?:\.\d{3})*,\d{2}) EUR)?(?:: ([\s\S]*))?$/;
function ccLeerColaAntes(nota, antes) {
  const s = String(nota || "");
  const i = s.indexOf("[" + CC_ANTES[antes]);
  const resto = i < 0 ? "" : s.slice(i + 1 + CC_ANTES[antes].length, s.lastIndexOf("]"));
  const m = CC_RE_COLA.exec(resto);
  return { fecha: m && m[1] ? m[1] : "", motivo: m && m[3] ? m[3] : "", coste: m && m[2] ? ccLeerImporte(m[2]) : null };
}
function ccAjusteDecision(reg, id, valor, fechaISO, antes, previo) {
  const dia = ccDiaNota(fechaISO);
  const cola = ccColaAntes(antes, previo);
  const nota = que => CC_MARCA_DECISION + dia + ": " + que + cola;
  const v = ccLeerImporte(valor);
  const pideValor = () => { if (!ccEsNumeroPositivo(v)) throw new Error(ccAvisoImporte(valor)); return v; };
  switch (id) {
    case "dejar": {
      const aj = { revisar: false, nota: nota("se deja como " + ccNombreCategoria(reg.categoria).toLowerCase()) };
      // Un premio fija lo que es (regalo o recompensa): si no, el motor lo
      // vuelve regalo cuando no ve una posición DeFi que lo respalde.
      return reg.categoria === "REWARD" && reg.subcategoria ? Object.assign({ subcategoria: reg.subcategoria }, aj) : aj;
    }
    case "venta":
      return { categoria: "VENTA", subcategoria: "GPP_INMUEBLE", importe_usdt: pideValor(), revisar: false,
               nota: nota("venta cobrada aparte") };
    case "compra": // sin precio: se pone en 💶 (un inmueble lleva el de por defecto)
      return { categoria: "COMPRA", subcategoria: "COSTE_BASE", via_compra: "BANCARIA", revisar: false,
               nota: nota("compra externa") };
    case "dinero":
      return { categoria: "DEPOSITO", subcategoria: "COSTE_BASE", importe_usdt: pideValor(), revisar: false,
               nota: nota("dinero recibido, valorado al cambio del día") };
    case "neutro":
      return { categoria: "MOVIMIENTO", subcategoria: "NEUTRO", revisar: false, nota: nota("movimiento neutro") };
    case "regalo":
      return { categoria: "REWARD", subcategoria: "GPP_REGALO", revisar: false, nota: nota("regalo (airdrop)") };
    case "recompensa":
      return { categoria: "REWARD", subcategoria: "RCM_REWARD", revisar: false, nota: nota("recompensa DeFi") };
    case "spam":
      return { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false,
               nota: CC_MARCA_SPAM + dia + CC_SUFIJO_SPAM_REVISION + cola };
    default:
      throw new Error("Decisión desconocida: " + id);
  }
}

/* Ajustes NUEVOS con la decisión (no muta los recibidos). Sustituye un
   ajuste que solo pedía revisión; lanza si hay otro. Si ese ajuste llevaba
   un coste y la decisión es «✔ Dejar como …» o «Compra externa…», el
   coste sigue (las demás decisiones cambian la categoría). */
function ccAjustesConDecision(ajustes, reg, id, valor, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const k = ccClaveAjuste(reg && reg.clave);
  if (!k) throw new Error("Registro sin clave.");
  const h = ccBuscarAjuste(base, k);
  const antes = h ? ccAjusteQuePideRevision(h.ajuste) : null;
  if (h && !antes) throw new Error("Ya tiene un ajuste manual: se cambia en «✏️ Ajustes en JSON».");
  const copia = Object.assign({}, base);
  if (h) delete copia[h.clave];
  copia[k] = ccAjusteDecision(reg, id, valor, fechaISO, antes, h && h.ajuste);
  if (h && "coste_eur" in h.ajuste) {
    if (id === "dejar" || id === "compra") copia[k].coste_eur = h.ajuste.coste_eur;
    // Lo pagado en USD va con la decisión, para devolverlo al deshacer (con
    // otro coste, ccPagadoUsd no lo da por bueno).
    ccConUsd(copia[k], h.ajuste);
  }
  return copia;
}

/* Deshacer: ajustes NUEVOS sin la decisión; si sustituyó un ajuste
   que pedía revisión, lo devuelve con su fecha y su motivo (con la fecha
   de hoy si la decisión es antigua y no los guardó). El
   coste puesto en «💶 Coste…» sobre un «✔ Dejar como compra» se queda:
   no lo puso la decisión. */
function ccAjustesSinDecision(ajustes, clave, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const h = ccBuscarAjuste(base, clave);
  if (!h || !ccEsAjusteDecision(h.ajuste)) throw new Error("Esta decisión no se tomó aquí: se cambia en «✏️ Ajustes en JSON».");
  const copia = Object.assign({}, base);
  delete copia[h.clave];
  if (h.ajuste.nota.includes(CC_ANTES.revisar)) {
    const a = ccLeerColaAntes(h.ajuste.nota, "revisar");
    copia[h.clave] = { revisar: true, nota: ccNotaMandarRevisar(a.motivo, a.fecha || fechaISO) };
    if (a.coste !== null) ccConUsd(Object.assign(copia[h.clave], { coste_eur: a.coste }), h.ajuste); // el coste que tenía (y su USD), sea cual sea la decisión
  } else if (h.ajuste.nota.includes(CC_ANTES.sacado)) {
    copia[h.clave] = ccAjusteSacadoSpam(ccLeerColaAntes(h.ajuste.nota, "sacado").fecha || fechaISO);
  }
  if (!("categoria" in h.ajuste) && "coste_eur" in h.ajuste) {
    copia[h.clave] = copia[h.clave]
      ? Object.assign(copia[h.clave], { coste_eur: h.ajuste.coste_eur })
      : ccAjusteCoste(h.ajuste.coste_eur, fechaISO);
    ccConUsd(copia[h.clave], h.ajuste);
  }
  return copia;
}

/* ¿Es RNT que te llega (no del archivo de Reental ni de un vínculo)? */
function ccEsEntradaRnt(reg, ctx) {
  return !!reg && reg.fuente !== "CSV_REENTAL" && !pdEsObjeto(reg.pago_diferido) && ccEsNumeroPositivo(reg.cantidad) &&
    normalizarDireccion(reg.contrato || "") === RNT && ccSentidoBasico(reg, ctx) === "entrada";
}
/* Decimales de un precio por token: 2 desde 1; por debajo, 4 (0,0300); y 8
   si con 4 saldría 0 (los usa 💶, js/20). */
function ccDecimalesPrecio(v) {
  return v >= 1 ? 2 : v >= 1e-4 ? 4 : 8;
}

/* Resumen corto de una decisión, para «Movimientos ya decididos». reg (opcional):
   su movimiento, para nombrar la categoría que se deja. */
function ccResumenDecision(ajuste, reg) {
  if (!pdEsObjeto(ajuste)) return "";
  if (ajuste.categoria === "VENTA") return "Venta · " + numEs(ajuste.importe_usdt, 2) + " USD";
  if (ajuste.categoria === "COMPRA") {
    // Sin tu precio: un inmueble, el de por defecto (el del registro, como en 💶); el RNT no tiene.
    if (ccEsNumeroPositivo(ajuste.coste_eur)) return "Compra externa · " + numEs(ajuste.coste_eur, 2) + " €";
    return reg && ccEsNumeroPositivo(reg.coste_eur)
      ? "Compra externa · " + numEs(reg.coste_eur, 2) + " € (por defecto)" : "Compra externa · falta el precio";
  }
  if (ajuste.categoria === "DEPOSITO") return "Ingreso de dinero · " + numEs(ajuste.importe_usdt, 2) + " USD";
  if (ajuste.categoria === "MOVIMIENTO") return "Movimiento neutro";
  // Con el nombre de 📒 (txOperacion).
  if (ajuste.categoria === "REWARD") return ajuste.subcategoria === "GPP_REGALO" ? "Regalo recibido" : "Recompensa DeFi";
  if (ajuste.categoria === "SPAM") return "Spam";
  return reg && reg.categoria ? "Se deja como " + ccNombreDejar(reg) : "Se deja como lo dice la app";
}

/* ≈ € orientativo de un importe en USD con el tipo BCE de la fecha del
   registro (o el último anterior que haya en la cache, como mucho los días
   de diasMaxSinTipoBce, como el motor; con `cache`, también el
   día de más tras lo cubierto). null si no hay. */
function ccEurOrientativo(usd, fecha, tiposBce, cache) {
  const v = Number(usd);
  const dia = ccFechaDiaNorm(fecha);
  if (!ccEsNumeroPositivo(v) || !dia || !pdEsObjeto(tiposBce)) return null;
  let mejor = null;
  for (const [f, valor] of Object.entries(tiposBce)) {
    const t = Number(valor);
    if (f <= dia && (mejor === null || f > mejor) && Number.isFinite(t) && t > 0) mejor = f;
  }
  const dias = mejor === null ? null : ccDiasEntreFechas(dia, mejor);
  if (dias === null || dias > diasMaxSinTipoBce(dia, cache)) return null;
  return { eur: v / Number(tiposBce[mejor]), fecha: mejor };
}
/* «≈ 123,45 € (BCE del 01/03/2026)» del formulario de una decisión. */
function ccTextoEurOrientativo(eur) {
  return eur ? "≈ " + numEs(eur.eur, 2) + " € (BCE del " + fechaEs(eur.fecha) + ")" : "";
}

/* Burbuja de información ⓘ con el detalle completo (también la usa js/18).
   Alcanzable con teclado (tabindex + :focus) y correcta en modo oscuro (solo
   variables de color del tema). El detalle va en la burbuja y en el
   aria-label. */
function ccInfo(detalle) {
  return '<span class="cc-info" tabindex="0" aria-label="Información: ' + ccEsc(detalle) +
    '">ⓘ<span class="cc-burbuja" role="tooltip">' + ccEsc(detalle) + "</span></span>";
}

/* ----------------------------- Fechas (puro) ----------------------------- */

/* ¿Cae el registro en el rango de fechas desde/hasta ("AAAA-MM-DD", vacíos
   = sin límite)? Se compara por día; sin fecha válida y con el rango activo
   queda FUERA (no se supone que esté dentro). */
function ccEnRangoFechas(reg, desde, hasta) {
  if (!desde && !hasta) return true;
  const fecha = ccFechaCorta(reg);
  if (!fecha) return false;
  if (desde && fecha < desde) return false;
  if (hasta && fecha > hasta) return false;
  return true;
}

/* Contadores de la cabecera: registros, pendientes de revisar, y salidas y
   cobros por vincular. cobrosAcotados cuenta los cobros
   pendientes sin contraparte explicada y cobrosExtras los que solo aparecen
   al ver también los ya explicados (la cabecera muestra cobrosExtras).
   enLista = los que necesitan una decisión (los que pinta la lista). */
function ccResumen(registros, ctx, verTodos) {
  let pendientes = 0, salidas = 0, cobros = 0, cobrosAcotados = 0, cobrosExtras = 0, enLista = 0;
  for (const r of registros) {
    if (r.revisar) pendientes++;
    const pend = ccPendienteDeVincular(r, ctx, verTodos);
    if (pend === "salida") salidas++;
    else if (pend === "cobro") cobros++;
    const acotado = ccEsCobroPendiente(r, ctx, false);
    if (acotado) cobrosAcotados++;
    else if (ccEsCobroPendiente(r, ctx, true)) cobrosExtras++;
    if (ccMotivoRevision(r, ctx)) enLista++;
  }
  return { total: registros.length, pendientes, salidas, cobros, cobrosAcotados, cobrosExtras, enLista };
}

/* ----------------------------- Buscador de cobros (puro) -----------------------------
   Cobros PENDIENTES de vincular que casan con la consulta = {activo,
   importeMin, importeMax, desde, hasta, direccion, verTodos}:
   - activo: "" | "USDT" | "USDC" (por contrato de stablecoin conocida);
   - importeMin/importeMax: rango de importe, inclusivo, comparado a 6
     decimales con margen 1e-9. Vacío o no numérico = sin límite en ese
     extremo; con el rango activo, un cobro sin cantidad numérica nunca casa;
   - desde/hasta: por día;
   - direccion: trozo de dirección (con o sin 0x, da igual mayúsculas) que
     debe aparecer en el origen O en el destino;
   - verTodos: true = también los entrantes ya explicados.
   Ordenados por fecha, hash y clave. */
function ccCobrosCoincidentes(registros, ctx, consulta) {
  const q = consulta || {};
  const dir = normalizarDireccion(q.direccion).replace(/^0x/, "");
  const parsear = v => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? red6(n) : null;
  };
  const importeMin = parsear(q.importeMin);
  const importeMax = parsear(q.importeMax);
  const rangoImporte = importeMin !== null || importeMax !== null;
  const objetivo = q.activo === "USDT" ? USDT : q.activo === "USDC" ? USDC : null;
  const out = [];
  for (const r of registros) {
    if (!ccEsCobroPendiente(r, ctx, !!q.verTodos)) continue;
    /* Un activo que no es una stablecoin conocida no tiene cobros (no se
       interpreta como «todos»). */
    if (q.activo && normalizarDireccion(r.contrato) !== objetivo) continue;
    if (rangoImporte) {
      if (!Number.isFinite(r.cantidad)) continue;
      const cr = red6(r.cantidad);
      if (importeMin !== null && cr < importeMin - 1e-9) continue;
      if (importeMax !== null && cr > importeMax + 1e-9) continue;
    }
    if (!ccEnRangoFechas(r, q.desde, q.hasta)) continue;
    if (dir) {
      const o = normalizarDireccion(r.origen).replace(/^0x/, "");
      const d = normalizarDireccion(r.destino).replace(/^0x/, "");
      if (!o.includes(dir) && !d.includes(dir)) continue;
    }
    out.push(r);
  }
  out.sort((a, b) =>
    String(a.fecha || "9999-12-31 23:59:59").localeCompare(String(b.fecha || "9999-12-31 23:59:59")) ||
    String(a.hash || "").localeCompare(String(b.hash || "")) ||
    String(a.clave || "").localeCompare(String(b.clave || "")));
  return out;
}

/* Resumen corto de un registro (buscador y «Movimientos ya decididos»): cantidad +
   símbolo · fecha · hash corto. */
function ccTextoRegCorto(reg) {
  return ccCantidad(reg.cantidad) + (reg.simbolo ? " " + reg.simbolo : "") +
    " · " + (ccFechaVer(reg) || "sin fecha") + " · " + ccHashCorto(reg.hash);
}

/* ----------------------------- Formulario de vínculo (puro) -----------------------------
   Referencia de un movimiento (hash, contrato, origen, destino y valor sin
   transformar, como lo guarda pagos_diferidos) reconstruida desde un registro
   clasificado. Con cache se busca el transfer original y se usa su
   valor_raw EXACTO (el entero sin transformar es la verdad); sin cache o sin
   coincidencia se reconstruye desde la cantidad con 6 decimales, como
   aproximación. */
function ccDecimalesDe(contrato) {
  return (contrato in DECIMALES) ? DECIMALES[contrato] : DECIMALES_DEFECTO;
}
function ccReferenciaDeRegistro(reg, cache) {
  if (!reg || !reg.hash) return null;
  if (!Number.isFinite(reg.cantidad)) return null;
  const hash = normalizarDireccion(reg.hash);
  const contrato = normalizarDireccion(reg.contrato);
  const origen = normalizarDireccion(reg.origen);
  const destino = normalizarDireccion(reg.destino);
  if (cache && cache.transacciones) {
    for (const tx of transfersUnificadosClasificacion(cache)) {
      if (normalizarDireccion(tx.hash) !== hash) continue;
      if (normalizarDireccion(tx.contractAddress) !== contrato) continue;
      if (normalizarDireccion(tx.from) !== origen) continue;
      if (normalizarDireccion(tx.to) !== destino) continue;
      const c = cantidadTx(tx);
      if (c === null || red6(c) !== red6(reg.cantidad)) continue;
      const decTx = parseInt(tx.tokenDecimal, 10);
      const dec = Number.isFinite(decTx) ? decTx : ccDecimalesDe(contrato);
      return { cadena: ETHERSCAN_CHAINID, hash, contrato, origen, destino,
               valor_raw: String(tx.value), decimales: dec };
    }
  }
  const dec = ccDecimalesDe(contrato);
  const raw = BigInt(Math.round(red6(reg.cantidad) * Math.pow(10, dec))).toString();
  return { cadena: ETHERSCAN_CHAINID, hash, contrato, origen, destino,
           valor_raw: raw, decimales: dec };
}

/* Clave de identidad de una referencia de movimiento (la de js/14). */
function ccClaveRef(ref) {
  return pdClaveIdentidad(pdIdentidadReferencia(ref));
}

/* Suma asignada a un cobro por los vínculos CONFIRMADOS ya guardados (los
   ANULADOS no cuentan). */
function ccAsignadoACobro(refCobro, ventas) {
  if (!refCobro) return 0;
  const clave = ccClaveRef(refCobro);
  let suma = 0;
  for (const v of ventas || []) {
    if (!v || v.estado !== "CONFIRMADO" || !Array.isArray(v.asignaciones)) continue;
    for (const a of v.asignaciones) {
      if (!a || !a.pago) continue;
      if (ccClaveRef(a.pago) !== clave) continue;
      const c = Number(a.cantidad_asignada);
      if (Number.isFinite(c)) suma += c;
    }
  }
  return red6(suma);
}

/* Disponible de un cobro = cantidad recibida − lo ya asignado en vínculos
   confirmados. null si la cantidad no es un número (no se inventa). */
function ccDisponibleCobro(regCobro, ventas, cache) {
  if (!regCobro || !Number.isFinite(regCobro.cantidad)) return null;
  const ref = ccReferenciaDeRegistro(regCobro, cache);
  return red6(red6(regCobro.cantidad) - ccAsignadoACobro(ref, ventas));
}

/* Borrador de la venta (id provisional; estado CONFIRMADO para que el motor
   espejo lo simule) con una asignación por cobro: o.cobros = [{reg, ref,
   cantidad}]. El formato de un solo cobro (o.cobro/o.refCobro/
   o.cantidadAsignada) solo lo usan los tests. importe_esperado_usd solo si
   es un número > 0 (la pantalla lo deja siempre null); la liquidación la
   fija quien llama (la pantalla: COMPLETA). */
function ccBorradorVenta(o) {
  const importe = Number(o.importeEsperado);
  const pares = Array.isArray(o.cobros) && o.cobros.length
    ? o.cobros
    : [{ reg: o.cobro, ref: o.refCobro, cantidad: o.cantidadAsignada }];
  const asignaciones = pares.map((par, i) => {
    const reg = par.reg || {};
    const contratoCobro = normalizarDireccion(reg.contrato);
    const activo = reg.simbolo ||
      (contratoCobro === USDT ? "USDT" : contratoCobro === USDC ? "USDC" : null) || "USD";
    return {
      id: pares.length === 1 ? "as_borrador" : "as_borrador_" + (i + 1),
      pago: par.ref,
      activo: activo,
      cantidad_asignada: Number(par.cantidad),
      nota: "", creado: null, modificado: null,
    };
  });
  return {
    id: "BORRADOR_4_1",
    salida: o.refSalida,
    cantidad_tokens: (o.salida && Number.isFinite(o.salida.cantidad)) ? o.salida.cantidad : null,
    // En la cache el vinculo guarda «propiedad» (nombre del campo en el formato guardado).
    propiedad: (o.salida && o.salida.inmueble) || null,
    importe_esperado_usd: Number.isFinite(importe) && importe > 0 ? importe : null,
    moneda_esperada: o.monedaEsperada || "USD",
    estado_liquidacion: o.estadoLiquidacion || "DESCONOCIDA",
    estado: "CONFIRMADO",
    nota: o.nota || "",
    creado: null, modificado: null, anulado: null,
    asignaciones: asignaciones,
  };
}

/* Simulación de los efectos con el PROPIO motor de js/14: aplica un
   bloque completo de ventas sobre COPIAS de los registros y de la cache (las
   originales quedan intactas) y devuelve los cambios campo a campo más el
   informe del motor (aplicados, problemas de validación y conflictos con
   ajustes_usuario). Con `base` (los registros de antes
   de aplicar vínculos y ajustes, state.registrosSinVinculos) simula como el
   motor: vínculos y después tus ajustes, que tienen la última palabra, y
   compara con lo que se ve ahora. No aplicar los vínculos encima de los
   ajustes: diría «sale de revisión» aunque un «Mandado a revisar» lo
   mantenga, y al editar sin cambios saldrían cambios que no lo son. */
const CC_CAMPOS_VINCULO = ["categoria", "subcategoria", "importe_usdt",
                           "revisar", "nota", "pago_diferido"];
function ccSimularBloque(registros, cache, ventasBloque, base) {
  const origen = Array.isArray(registros) ? registros : [];
  const conBase = Array.isArray(base);
  const copia = (conBase ? base : origen).map(r => Object.assign({}, r));
  const cacheSim = Object.assign({}, cache || {}, {
    pagos_diferidos: { version: 1, ventas: Array.isArray(ventasBloque) ? ventasBloque : [] },
  });
  const info = aplicarPagosDiferidos(copia, cacheSim);
  if (conBase) aplicarAjustesUsuario(copia, cacheSim, true);
  const porClave = conBase ? new Map(origen.map(r => [r.clave, r])) : null;
  const diff = [];
  for (let i = 0; i < copia.length; i++) {
    const b = copia[i], a = conBase ? (porClave.get(b.clave) || {}) : origen[i];
    const cambios = [];
    for (const campo of CC_CAMPOS_VINCULO) {
      const va = a[campo] === undefined ? null : a[campo];
      const vb = b[campo] === undefined ? null : b[campo];
      if (JSON.stringify(va) !== JSON.stringify(vb)) {
        cambios.push({ campo, antes: va, despues: vb });
      }
    }
    if (cambios.length) diff.push({ clave: a.clave, cambios });
  }
  return { diff, info, resultado: copia };
}
/* ¿Habla el problema del motor de esa venta? («venta <id>: …», «venta <id>,
   asignacion <as>: …» o «… (ventas: <id>, …)», los formatos de js/14). */
function ccProblemaDeVenta(mensaje, ventaId) {
  if (ventaId === undefined || ventaId === null) return false;
  const id = String(ventaId), m = String(mensaje);
  if (m.startsWith("venta " + id + ":") || m.startsWith("venta " + id + ", asignacion ")) return true;
  const lista = /\(ventas: ([^)]*)\)$/.exec(m);
  return !!lista && lista[1].split(", ").includes(id);
}
/* Un problema del motor con un vínculo, en llano para la pantalla: sin «venta pd_…:» ni «(ventas: …)»; los que se
   pueden dar desde la app, con su frase. Para casarlo con su venta se sigue
   usando el texto del motor (ccProblemaDeVenta). */
const CC_PROBLEMAS_EN_LLANO = [
  [/la salida ya esta vinculada|salida duplicada/, "Esta venta ya está en otro vínculo."],
  [/la salida ya es una VENTA sin importe/, "Esta venta no tiene importe: ponlo con «Es una venta…»."],
  [/la salida ya tiene contraprestacion/, "Esta venta ya tiene su cobro en la misma transacción."],
  [/salida no encontrada/, "La venta ya no está entre tus movimientos."],
  [/pago no encontrado/, "Un cobro ya no está entre tus movimientos."],
  [/duplicado venta\+pago/, "Este cobro ya está en esta venta."],
  [/^sobreasignacion/, "A un cobro se le asigna más de lo que llegó."],
  [/asignado en parte/, "Un cobro asignado en parte tiene que ser «Ingreso de dinero…»: asígnalo entero o márcalo así antes."],
  [/sin cantidad util/, "Un cobro no tiene cantidad."],
  [/^conflicto: el ajuste de usuario/, "Un ajuste tuyo también cambia este movimiento: cuenta el ajuste."],
  [/cantidad_asignada .* invalida/, "Escribe una cantidad mayor que 0."],
];
function ccProblemaEnLlano(mensaje) {
  const m = String(mensaje);
  const llano = CC_PROBLEMAS_EN_LLANO.find(([re]) => re.test(m));
  if (llano) return llano[1];
  const t = m.replace(/^venta [^:]*: /, "").replace(/ \(ventas: [^)]*\)$/, "");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/* La simulación con el borrador sin los problemas ni los
   conflictos que ya daba el bloque guardado (cada mensaje se resta una vez
   por cada vez que ya salía). Los problemas del vínculo
   que estás guardando (ventaId) no se restan aunque ya salieran: al ampliar
   un vínculo con un problema, el formulario dice por qué no se guarda. */
function ccSoloLoNuevo(sim, simBase, ventaId) {
  const restar = (lista, base) => {
    const quedan = base.slice();
    return lista.filter(m => {
      if (ccProblemaDeVenta(m, ventaId)) return true;
      const i = quedan.indexOf(m);
      if (i < 0) return true;
      quedan.splice(i, 1);
      return false;
    });
  };
  return { diff: sim.diff, resultado: sim.resultado, info: Object.assign({}, sim.info, {
    problemas: restar(sim.info.problemas, simBase.info.problemas),
    conflictos: restar(sim.info.conflictos, simBase.info.conflictos),
  }) };
}
/* Solo la usan los tests: simula las ventas guardadas más un borrador. */
function ccSimularVinculo(registros, cache, ventaBorrador) {
  const ventasPrevias = ((cache && cache.pagos_diferidos &&
                          Array.isArray(cache.pagos_diferidos.ventas))
                         ? cache.pagos_diferidos.ventas : []);
  return ccSimularBloque(registros, cache, ventasPrevias.concat([ventaBorrador]));
}

/* Avisos cortos del borrador, de una línea: cruce de ejercicio, resto no asignado de un
   cobro y conflictos con ajustes_usuario. Los problemas de validación van
   aparte como errores (el motor NO aplicaría el vínculo tal cual).
   pares = [{reg, disponible, asignado}]; venta no se usa. */
function ccAvisosBorradorMulti(regSalida, pares, venta, sim) {
  const avisos = [], errores = [];
  for (const p of sim.info.problemas) errores.push(ccProblemaEnLlano(p));
  for (const c of sim.info.conflictos) avisos.push(ccProblemaEnLlano(c));
  for (const par of pares || []) {
    const regCobro = par.reg;
    if (!regCobro) continue;
    const fS = ccFechaCorta(regSalida), fC = ccFechaCorta(regCobro);
    if (fS && fC && fS.slice(0, 4) !== fC.slice(0, 4)) {
      avisos.push("Venta de " + fS.slice(0, 4) + " y cobro de " + fC.slice(0, 4) + ".");
    }
    const disponible = par.disponible;
    const asignado = par.asignado;
    if (disponible !== null && disponible !== undefined &&
        asignado !== null && asignado !== undefined && asignado < disponible - 1e-9) {
      avisos.push("Quedan " + ccCantidad(red6(disponible - asignado)) +
        " " + (regCobro.simbolo || "") + " de este cobro sin asignar.");
    }
  }
  // Dos cobros con el mismo problema, una línea.
  return { avisos: [...new Set(avisos)], errores: [...new Set(errores)] };
}
/* Solo la usan los tests (formato de un solo cobro). */
function ccAvisosBorrador(regSalida, regCobro, venta, disponible, sim) {
  const asignado = (venta && venta.asignaciones && venta.asignaciones.length === 1)
    ? red6(Number(venta.asignaciones[0].cantidad_asignada)) : null;
  return ccAvisosBorradorMulti(regSalida, [{ reg: regCobro, disponible, asignado }], venta, sim);
}

/* Solo la usan los tests: precarga de un cobro (cantidad = disponible). */
function ccPrecargaFormulario(regCobro, ventas, cache) {
  return {
    cantidadAsignada: ccDisponibleCobro(regCobro, ventas, cache),
    nota: "",
  };
}

/* ----------------------------- Gestión de vínculos (puro) -----------------------------
   Editar y ANULAR (estado + fecha; el motor lo ignora y la pantalla no lo
   enseña). ccRestaurarVenta ya no tiene botón (volver a vincular la venta
   reutiliza el vínculo anulado, ccAplicarBorradorABloque); se conserva
   porque describe el formato y la usan los tests. Todas devuelven un
   bloque NUEVO: la cache se reemplaza desde la pantalla, nunca aquí. */
function ccAnularVenta(ventas, id) {
  const ahora = ahoraLocalISO();
  return (ventas || []).map(v => (v && v.id === id && v.estado === "CONFIRMADO")
    ? Object.assign({}, v, { estado: "ANULADO", anulado: ahora, modificado: ahora })
    : v);
}
function ccRestaurarVenta(ventas, id) {
  const ahora = ahoraLocalISO();
  return (ventas || []).map(v => (v && v.id === id && v.estado === "ANULADO")
    ? Object.assign({}, v, { estado: "CONFIRMADO", anulado: null, modificado: ahora })
    : v);
}
/* Edición de una venta: campos editables y, si se indican, las cantidades
   asignadas: o.asignaciones = [{asignacionId, indice, cantidadAsignada,
   quitar}] (la pantalla edita el vínculo completo) u o.asignacionId +
   o.cantidadAsignada (una sola; solo los tests). Los ids de asignación se
   conservan. Una asignación sin id se busca por su sitio entre
   las válidas, y con quitar sale del vínculo y queda en su «historial»
   (así no hay que anularlo todo para quitar un cobro equivocado). */
function ccEditarVenta(ventas, o) {
  const ahora = ahoraLocalISO();
  const cambios = Array.isArray(o.asignaciones) && o.asignaciones.length
    ? o.asignaciones
    : (o.asignacionId ? [{ asignacionId: o.asignacionId, cantidadAsignada: o.cantidadAsignada }] : []);
  return (ventas || []).map(v => {
    if (!v || v.id !== o.ventaId) return v;
    const nv = Object.assign({}, v, {
      /* Sin importeEsperado (undefined) se conserva el de la venta; con
         null se quita. */
      importe_esperado_usd: o.importeEsperado !== undefined ? o.importeEsperado : (v.importe_esperado_usd ?? null),
      moneda_esperada: o.monedaEsperada || v.moneda_esperada || "USD",
      estado_liquidacion: o.estadoLiquidacion || v.estado_liquidacion,
      nota: o.nota === undefined ? v.nota : (o.nota || ""),
      modificado: ahora,
      asignaciones: ccCopiarAsignaciones(ccAsignaciones(v)),
    });
    const validas = nv.asignaciones.filter(pdEsObjeto);
    const quitadas = [];
    for (const c of cambios) {
      if (!c) continue;
      const as = c.asignacionId ? validas.find(a => a.id === c.asignacionId)
        : (Number.isInteger(c.indice) ? validas[c.indice] : null);
      if (!as) continue;
      if (c.quitar) { quitadas.push(as); continue; }
      if (!Number.isFinite(Number(c.cantidadAsignada))) continue;
      as.cantidad_asignada = Number(c.cantidadAsignada);
      as.modificado = ahora;
    }
    if (quitadas.length) {
      nv.asignaciones = nv.asignaciones.filter(a => !quitadas.includes(a));
      nv.historial = (Array.isArray(v.historial) ? v.historial.slice() : [])
        .concat(quitadas.map(a => ({ quitada: ahora, asignacion: a })));
    }
    return nv;
  });
}
/* Resumen de una venta con sus referencias resueltas contra la
   clasificación de la sesión. faltaRegistro avisa cuando algún movimiento no
   está en esta sesión (el vínculo sigue en la cache). */
function ccResumenVenta(venta, registros) {
  const regs = registros || [];
  const salida = resolverReferenciaMovimiento(venta.salida, regs);
  const pagos = ccAsignacionesValidas(venta).map(a => ({
    asignacion: a,
    reg: resolverReferenciaMovimiento(a.pago, regs),
  }));
  let suma = 0;
  for (const p of pagos) {
    const c = Number(p.asignacion.cantidad_asignada);
    if (Number.isFinite(c)) suma += c;
  }
  return {
    salida, pagos, suma: red6(suma),
    liquidacion: pdLiquidacion(venta, red6(suma))[0],
    faltaRegistro: !salida || pagos.some(p => !p.reg),
  };
}
/* Disponible de un cobro sin contar una asignación concreta (al editar, la
   propia asignación no compite consigo misma). */
function ccDisponibleCobroExcluyendo(regCobro, ventas, cache, excluir) {
  if (!regCobro || !Number.isFinite(regCobro.cantidad)) return null;
  const ref = ccReferenciaDeRegistro(regCobro, cache);
  if (!ref) return null;
  const clave = ccClaveRef(ref);
  let suma = 0;
  for (const v of ventas || []) {
    if (!v || v.estado !== "CONFIRMADO") continue;
    ccAsignacionesValidas(v).forEach((a, i) => {
      if (!a.pago) return;
      if (excluir && v.id === excluir.ventaId &&
          (excluir.asignacionId ? a.id === excluir.asignacionId : i === excluir.indice)) return;
      if (ccClaveRef(a.pago) !== clave) return;
      const c = Number(a.cantidad_asignada);
      if (Number.isFinite(c)) suma += c;
    });
  }
  return red6(red6(regCobro.cantidad) - suma);
}

/* ----------------------------- Guardado del vínculo (puro) -----------------------------
   Ids estables: pd_AAAAMMDD_NNN para ventas y as_NNN para asignaciones, sin
   repetir los que ya hay en el bloque. */
function ccGenerarIdVenta(ventas) {
  const f = new Date();
  const base = "pd_" + f.getFullYear() +
    String(f.getMonth() + 1).padStart(2, "0") + String(f.getDate()).padStart(2, "0");
  const usados = new Set((ventas || []).map(v => v && v.id));
  let n = (ventas || []).length + 1, id;
  do { id = base + "_" + String(n).padStart(3, "0"); n++; } while (usados.has(id));
  return id;
}
function ccGenerarIdAsignacion(ventas) {
  const usados = new Set();
  for (const v of ventas || []) {
    for (const a of ccAsignaciones(v)) usados.add(a && a.id); // mal escritas, sin ids
  }
  let n = usados.size + 1, id;
  do { id = "as_" + String(n).padStart(3, "0"); n++; } while (usados.has(id));
  return id;
}

/* Venta CONFIRMADA cuya salida es el mismo movimiento. Las ANULADAS no
   cuentan: al volver a vincular se reutilizan (ccAplicarBorradorABloque). */
function ccVentaExistenteParaSalida(ventas, refSalida) {
  if (!refSalida) return null;
  const clave = ccClaveRef(refSalida);
  for (const v of ventas || []) {
    if (!v || v.estado !== "CONFIRMADO" || !v.salida) continue;
    if (ccClaveRef(v.salida) === clave) return v;
  }
  return null;
}

/* ¿Está ya este cobro asignado en esa venta? (no se vincula dos veces). */
function ccCobroYaAsignado(venta, refCobro) {
  if (!venta || !refCobro) return false;
  const clave = ccClaveRef(refCobro);
  return ccAsignaciones(venta).some(a =>
    a && a.pago && ccClaveRef(a.pago) === clave);
}

/* Cobros con una decisión tuya de Revisión que les cambia la
   categoría a otra que no es depósito («Movimiento neutro», «Es spam»).
   Vincularlos dejaría el cobro con esa categoría y sin su lote (lo mismo
   que ccOpcionesDecision evita en el otro orden). «Dinero que recibí…»
   (depósito) y «Dejar como…» (sin categoría) sí valen: un cobro que se
   asigna en parte se marca así antes. */
function ccCobrosConDecision(regs, ajustes) {
  return (regs || []).filter(r => {
    const h = r && ccBuscarAjuste(ajustes, r.clave);
    return !!h && ccEsAjusteDecision(h.ajuste) && "categoria" in h.ajuste &&
      !PD_CATEGORIAS_PAGO_PARCIAL.includes(codigoVigente(h.ajuste.categoria));
  });
}

/* Validaciones de la pantalla, además de las del motor (que llegan en
   sim.info.problemas): par presente, cantidad > 0, sin cobro repetido en la
   venta, sin cobros con una decisión tuya y que el motor vaya a aplicar el
   vínculo. */
function ccValidacionBorrador(v) {
  const motivos = [];
  if (!v.regSalida || !v.regCobro) {
    motivos.push("La venta o el cobro ya no están entre tus movimientos.");
  }
  if (!v.cantidadOk) motivos.push("Escribe una cantidad mayor que 0.");
  if (v.todosQuitados) motivos.push("Para quitar todos los cobros, usa «↩ Deshacer».");
  if (v.dupCobro) motivos.push("Este cobro ya está en esta venta.");
  if (v.cobroDecidido) motivos.push("Este cobro tiene una decisión tuya: deshazla antes en «Movimientos ya decididos».");
  for (const p of (v.sim && v.sim.info.problemas) || []) motivos.push(ccProblemaEnLlano(p));
  /* Con ventaId, el que tiene que aplicarse es ESE vínculo (que se
     apliquen otros ya guardados no basta). */
  const aplicado = v.sim && v.sim.info.aplicados.some(a => v.ventaId === undefined || a.venta_id === v.ventaId);
  if (!motivos.length && !aplicado) {
    motivos.push("Este vínculo no se puede aplicar: revisa los datos.");
  }
  return { ok: motivos.length === 0, motivos: [...new Set(motivos)] };
}

/* Escribe el borrador en el bloque pagos_diferidos (una venta por salida).
   Devuelve un bloque nuevo (ventas copiadas), nunca modifica el recibido. Si
   la salida ya tiene venta CONFIRMADA, las asignaciones del borrador (una por
   cobro elegido) se le añaden y se actualizan sus campos editables; si no,
   se crea la venta con id nuevo. */
/* Vínculos ANULADOS de una salida, en el orden del bloque. */
function ccVentasAnuladasDeSalida(ventas, refSalida) {
  if (!refSalida) return [];
  const clave = ccClaveRef(refSalida);
  return (ventas || []).filter(v => v && v.estado === "ANULADO" && v.salida && ccClaveRef(v.salida) === clave);
}
/* Lo que se guarda de un vínculo anulado al reutilizarlo (sin su propio
   historial: ese se junta aparte). */
function ccFotoHistorial(v) {
  return {
    anulado: v.anulado || null, creado: v.creado || null, id: v.id,
    estado_liquidacion: v.estado_liquidacion || null, nota: v.nota || "",
    importe_esperado_usd: v.importe_esperado_usd === undefined ? null : v.importe_esperado_usd,
    asignaciones: ccCopiarAsignaciones(ccAsignaciones(v)),
  };
}
/* Guarda el borrador en el bloque. Tres casos:
   - la salida ya tiene un vínculo CONFIRMADO: se le añaden los cobros;
   - la salida tiene vínculos ANULADOS: se REUTILIZA el último (mismo id) y
     los demás anulados de esa salida se juntan en su «historial»; así, por
     muchas veces que se anule y se vuelva a vincular, cada venta tiene un
     solo vínculo;
   - si no, un vínculo nuevo.
   Con conservarVenta (el formulario, que no tiene esos campos), añadir cobros no cambia el importe esperado ni la liquidación. */
function ccAplicarBorradorABloque(ventas, o) {
  const ahora = ahoraLocalISO();
  /* Las de otras ventas, si están mal escritas (también un null en la
     lista), se guardan como estaban. */
  let nuevas = (Array.isArray(ventas) ? ventas : []).map(v => !pdEsObjeto(v) ? v : Object.assign({}, v, {
    asignaciones: Array.isArray(v.asignaciones) ? ccCopiarAsignaciones(v.asignaciones) : v.asignaciones }));
  const previa = ccVentaExistenteParaSalida(nuevas, o.refSalida);
  const anuladas = previa ? [] : ccVentasAnuladasDeSalida(nuevas, o.refSalida);
  let venta, reutilizada = false;
  if (!previa && anuladas.length) {
    venta = anuladas[anuladas.length - 1];
    let historial = [];
    for (const a of anuladas) historial = historial.concat(a.historial || [], [ccFotoHistorial(a)]);
    const quitar = new Set(anuladas.filter(a => a !== venta).map(a => a.id));
    nuevas = nuevas.filter(v => !(v && quitar.has(v.id)));
    const asigs = [];
    const temporal = { asignaciones: asigs };
    venta.asignaciones = [];
    for (const as of o.borrador.asignaciones) {
      asigs.push(Object.assign({}, as, {
        id: ccGenerarIdAsignacion(nuevas.concat([temporal])), creado: ahora, modificado: null,
      }));
    }
    Object.assign(venta, {
      estado: "CONFIRMADO", anulado: null, modificado: ahora, asignaciones: asigs,
      importe_esperado_usd: o.borrador.importe_esperado_usd,
      moneda_esperada: o.borrador.moneda_esperada,
      estado_liquidacion: o.borrador.estado_liquidacion,
      nota: o.borrador.nota, historial: historial,
    });
    reutilizada = true;
  } else if (previa) {
    venta = nuevas.find(v => v && v.id === previa.id);
    /* Sin asignaciones (o mal escritas, que el motor no lee), el cobro
       nuevo empieza la lista. */
    if (!Array.isArray(venta.asignaciones)) venta.asignaciones = [];
    for (const as of o.borrador.asignaciones) {
      venta.asignaciones.push(Object.assign({}, as, {
        id: ccGenerarIdAsignacion(nuevas), nota: "", creado: ahora, modificado: null,
      }));
    }
    if (!o.conservarVenta) {
      venta.importe_esperado_usd = o.borrador.importe_esperado_usd;
      venta.moneda_esperada = o.borrador.moneda_esperada;
      venta.estado_liquidacion = o.borrador.estado_liquidacion;
    }
    venta.nota = o.borrador.nota;
    venta.modificado = ahora;
  } else {
    /* Venta nueva: los ids as_NNN cuentan también las asignaciones ya
       añadidas en este mismo borrador (sin repetir). */
    const asigs = [];
    const temporal = { asignaciones: asigs };
    for (const as of o.borrador.asignaciones) {
      asigs.push(Object.assign({}, as, {
        id: ccGenerarIdAsignacion(nuevas.concat([temporal])),
        creado: ahora, modificado: null,
      }));
    }
    venta = Object.assign({}, o.borrador, {
      id: ccGenerarIdVenta(nuevas),
      estado: "CONFIRMADO",
      creado: ahora, modificado: null, anulado: null,
      asignaciones: asigs,
    });
    nuevas.push(venta);
  }
  return { ventas: nuevas, ventaId: venta.id, editada: !!previa, reutilizada };
}

/* ----------------------------- HTML (puro) ----------------------------- */

/* Title con las dos direcciones completas, y el texto
   visible con las direcciones cortas. */
function ccTituloRuta(reg) {
  return ccEsc(reg.origen || "—") + " → " + ccEsc(reg.destino || "—");
}
function ccTextoRuta(reg) {
  return ccEsc(ccAddrCorta(reg.origen)) + " → " + ccEsc(ccAddrCorta(reg.destino));
}
function ccUrlTx(hash) {
  return "https://polygonscan.com/tx/" + encodeURIComponent(hash);
}
/* El hash corto ES el enlace a Polygonscan, igual en toda la app (como en
   📒 Transacciones: «0x1234…abcd ↗»). Sin hash, lo dice. clase = clase
   extra del sitio donde va (la tarjeta del formulario). */
function ccEnlaceHash(hash, clase) {
  const h = String(hash || "");
  const extra = clase ? " " + clase : "";
  if (!h) return '<span class="cc-sin-hash' + extra + (clase ? " sin" : "") + '">sin hash</span>';
  const corto = h.length > 12 ? h.slice(0, 6) + "…" + h.slice(-4) : h;
  return '<a class="cc-hash-enlace mono' + extra + '" href="' + ccUrlTx(h) + '" target="_blank" rel="noopener" title="' +
    ccEsc(h) + ' · ver en Polygonscan">' + ccEsc(corto) + " ↗</a>";
}
/* Resumen de un registro con el hash como enlace («Movimientos ya decididos», buscador). */
function ccHtmlRegCorto(reg) {
  return ccEsc(ccCantidad(reg.cantidad) + (reg.simbolo ? " " + reg.simbolo : "") +
    " · " + (ccFechaVer(reg) || "sin fecha")) + " · " + ccEnlaceHash(reg.hash);
}

/* Botones de decisión de una tarjeta y, si hay una abierta que pide
   importe, su formulario corto debajo. d = { estado, opciones, abierta:
   {id, valor}|null, eur: {eur, fecha}|null }. */
function ccHtmlDecisiones(reg, d) {
  if (!d) return "";
  if (d.estado === "ajeno") {
    return '<div class="cc-decision help">Ajuste manual: se cambia en «✏️ Ajustes en JSON».</div>';
  }
  if (!(d.opciones || []).length) {
    // Con vínculo y mandado a revisar por ti: se quita con su ↩ de 📒 (A16).
    return '<div class="cc-decision help">' + (d.estado === "propio" ? "Mandado a revisar por ti: se quita con ↩ en 📒 Transacciones." :
      "Se cambia desde su vínculo.") + "</div>";
  }
  const clave = ccEsc(reg.clave);
  const ab = d.abierta || null;
  let html = '<div class="cc-decision" role="group" aria-label="Decidir">';
  for (const o of d.opciones || []) {
    const abierta = ab && ab.id === o.id;
    html += '<button type="button" class="cc-accion cc-dec' + (o.sugerida ? " sugerida" : "") + (abierta ? " abierta" : "") +
      '" data-accion="decidir" data-clave="' + clave + '" data-opcion="' + ccEsc(o.id) + '"' +
      (o.pide ? ' aria-expanded="' + (abierta ? "true" : "false") + '"' : "") +
      (o.ayuda ? ' title="' + ccEsc(o.ayuda) + '"' : "") + ">" + ccEsc(o.etiqueta) +
      (o.sugerida ? ' <span class="cc-sugerida">Sugerida</span>' : "") + "</button>";
  }
  html += "</div>";
  const op = ab && (d.opciones || []).find(o => o.id === ab.id && o.pide);
  if (op) {
    const unidad = op.id === "dinero" ? (reg.simbolo || "USD") : "USD";
    const etiqueta = op.id === "venta" ? "Cobrado" : "Recibido";
    html += '<div class="cc-dec-form" data-clave="' + clave + '">' +
      '<label>' + etiqueta + ' <input type="text" inputmode="decimal" class="cc-dec-valor" data-clave="' + clave +
      '" value="' + ccEsc(ab.valor ?? "") + '" aria-label="' + ccEsc(etiqueta + " en " + unidad) + '"> ' + ccEsc(unidad) + "</label>" +
      '<button type="button" class="cc-accion primary" data-accion="decidir-aplicar" data-clave="' + clave + '">Guardar</button>' +
      '<button type="button" class="cc-accion" data-accion="decidir-cerrar" data-clave="' + clave + '">Cancelar</button>' +
      '<span class="cc-dec-eur help">' + ccEsc(ccTextoEurOrientativo(d.eur)) + "</span></div>";
  }
  return html;
}

/* Card de un registro: cantidad y símbolo, marca de PENDIENTE de
   vincular (opts.candidatura), marca «🔗 vinculada» con el id de la venta
   si tiene vínculo CONFIRMADO (opts.vinculada), categoría con la nota del
   motor en su ⓘ, fecha, inmueble, ruta y hash. Botón según el estado: «🔗 Vincular cobro…» en las salidas
   pendientes y «➕ Añadir otro cobro» en las ya vinculadas
   (un pago que llega en varias transferencias). */
function ccHtmlTarjeta(reg, opts = {}) {
  const cand = opts.candidatura === "salida" ? "salida" : null; // salida PENDIENTE de vincular
  const vinc = opts.vinculada || null;   // { rol, ventaIds, asignado } de vínculo CONFIRMADO
  const clases = ["cc-item"];
  if (reg.revisar) clases.push("pend");
  if (cand) clases.push("cand-" + cand);
  if (vinc) clases.push("vinc");
  const sim = reg.simbolo || reg.token || ccHashCorto(reg.contrato) || "?";
  const cant = ccCantidad(reg.cantidad);
  const fecha = ccFechaVer(reg);
  /* La cantidad con su
     símbolo una sola vez y sin la etiqueta «a revisar» / «clasificado»
     (todo lo de la lista está por decidir). */
  let top = '<div class="cc-item-top">';
  top += '<span class="cc-sym">' + (Number.isFinite(reg.cantidad) ? ccEsc(cant) + " " : "") + '<span class="cc-tok">' + ccEsc(sim) + "</span></span>";
  if (cand === "salida") {
    top += '<span class="cc-cand salida" title="Venta sin su cobro vinculado.">🔗 Por vincular</span>';
  }
  if (vinc) {
    const detalle = vinc.rol === "salida"
      ? "Ver el vínculo."
      : "Asignado " + ccCantidad(vinc.asignado) +
        (Number.isFinite(reg.cantidad) ? " de " + ccCantidad(reg.cantidad) : "") +
        (reg.simbolo ? " " + reg.simbolo : "") + ".";
    top += '<button type="button" class="cc-vinculada" data-accion="ver-vinculo" data-venta="' +
      ccEsc(vinc.ventaIds[0]) + '" title="' + ccEsc(detalle) + '">' +
      ccEsc(ccTextoVinculada(vinc)) + "</button>";
  }
  /* La categoría en llano y, en su ⓘ, la nota del motor (texto literal,
     nunca reescrito), como en 📒 Transacciones. */
  top += '<span class="cc-cat">' + ccEsc(ccNombreCategoria(reg.categoria)) +
    (reg.nota ? ccInfo(fechasEnTextoEs(reg.nota)) : "") + "</span>";
  top += "</div>";

  let meta = '<div class="cc-meta">';
  meta += "<span>📅 " + (fecha ? ccEsc(fecha) : "sin fecha") + "</span>";
  if (reg.inmueble) meta += "<span>🏠 " + ccEsc(reg.inmueble) + "</span>";
  if (reg.origen || reg.destino) {
    meta += '<span title="' + ccTituloRuta(reg) + '">' + ccTextoRuta(reg) + "</span>";
  }
  meta += "</div>";

  const hash = '<div class="cc-hash">' + ccEnlaceHash(reg.hash) + "</div>";

  /* Una salida con contraprestación en su propio hash no lleva botón: el
     motor rechaza vincularla. */
  const botonBuscador = texto => '<div class="cc-acciones"><button type="button" class="cc-accion" ' +
    'data-accion="abrir-buscador" data-clave="' + ccEsc(reg.clave) + '">' + texto + "</button></div>";
  let acciones = "";
  if (cand === "salida") {
    acciones = botonBuscador("🔗 Vincular cobro…");
  } else if (vinc && vinc.rol === "salida") {
    acciones = botonBuscador("➕ Añadir otro cobro");
  }
  return '<div class="' + clases.join(" ") + '" data-clave="' + ccEsc(reg.clave) +
         '" data-hash="' + ccEsc(reg.hash || "") + '" data-categoria="' + ccEsc(reg.categoria) +
         '" data-cand="' + (cand || "") + '"' +
         ' data-vinc="' + (vinc ? ccEsc(vinc.ventaIds.join(",")) : "") + '">' +
         top + meta + hash + acciones + ccHtmlDecisiones(reg, opts.decision) + "</div>";
}

/* Cabecera de la lista: las ventas por vincular (cuántos hay por decidir
   lo dice la fila, P21; los avisos de contexto, ccAvisoContexto). Sin
   ninguna, no se pinta. */
function ccHtmlCabecera(registros, ctx) {
  const salidas = registros.filter(r => ccEsSalidaPendiente(r, ctx)).length;
  return salidas ? '<div class="cc-cab"><b>' + numEs(salidas, 0) + "</b> " + (salidas === 1 ? "venta" : "ventas") + " por vincular</div>" : "";
}
/* Encima de la caja de 🔍, en gris: lo que falta para que la revisión
   sea completa ("" si nada). Fuera de «Por decidir», que sin nada que
   decidir no sale (P21b). */
function ccAvisoContexto(registros, ctx) {
  if (!registros.length) return "Sin datos todavía: completa 🚀 Puesta en marcha.";
  if (!ctx.hayCache) return "⚠ Sin datos: no se marcan ventas por vincular.";
  if (!ctx.hayPropias) return "⚠ Falta tu wallet (tus datos de 🚀 Puesta en marcha).";
  return "";
}

/* Lista de lo que necesita una decisión. «visibles» = ccColaRevision
   (sin filtros: son pocos); ventas = vínculos
   guardados (para el nombre de cada vínculo). */
function ccHtmlLista(registros, visibles, ctx, ventas, dec) {
  if (!visibles.length) return ""; // sin nada, «Por decidir» no sale (P21b)
  /* Los tokens con dudas del catálogo, arriba del todo: confirmarlos
     reclasifica muchos de estos movimientos. */
  let html = "";
  const dudas = (dec && dec.dudas) || 0;
  if (dudas) html += '<div class="cc-cab cc-dudas">Primero <a href="#revision" data-ir="rvCatalogo">confirma ' +
    (dudas === 1 ? "el token con dudas</a>: cambia" : "los " + numEs(dudas, 0) + " tokens con dudas</a>: cambian") +
    " muchos de estos movimientos.</div>";
  html += ccHtmlCabecera(registros, ctx);
  for (const r of visibles) {
    const vinc = ccVinculoDeRegistro(r, ctx);
    if (vinc) vinc.detalle = ccDetalleVinculo(vinc, ventas, registros);
    /* Decisiones solo en lo marcado a revisar (una salida por
       vincular sin más se resuelve con «🔗 Vincular cobro…»). */
    let decision = null;
    if (dec && r.revisar) {
      const abierta = dec.abierta && dec.abierta.clave === r.clave ? dec.abierta : null;
      decision = { estado: ccEstadoDecision(r, dec.ajustes), opciones: ccOpcionesDecision(r, ctx), abierta,
        eur: abierta ? ccEurOrientativo(abierta.valor, r.fecha, dec.tiposBce, dec.cache) : null };
    }
    html += ccHtmlTarjeta(r, {
      candidatura: ccPendienteDeVincular(r, ctx, false),
      vinculada: vinc,
      decision,
    });
  }
  return html;
}

/* ----------------------------- Estado del módulo (solo memoria) -----------------------------
   Nada de esto se guarda en ningún sitio. */
/* Decisión con importe abierta en una tarjeta: { clave, id, valor }. */
let ccDecisionAbierta = null;

/* Datos de la sesión: registros clasificados, ventas guardadas y contexto
   de candidatos. */
function ccRegistrosSesion() {
  return Array.isArray(state.registros) ? state.registros : [];
}
/* Las asignaciones de una venta, siempre una lista (así un bloque mal
   escrito no deja las pestañas en blanco). */
function ccAsignaciones(venta) {
  return venta && Array.isArray(venta.asignaciones) ? venta.asignaciones : [];
}
/* Solo las que son un objeto (un null escrito a mano dejaría en blanco
   «Movimientos ya decididos» y rompería «✏️ Editar»). */
function ccAsignacionesValidas(venta) {
  return ccAsignaciones(venta).filter(pdEsObjeto);
}
/* Copia de una lista de asignaciones: cada objeto, copiado; lo que no es
   un objeto (un null o un texto escrito a mano), tal cual, para que el
   motor siga diciendo lo mismo de él. */
function ccCopiarAsignaciones(lista) {
  return lista.map(a => pdEsObjeto(a) ? Object.assign({}, a) : a);
}
function ccVentasGuardadas() {
  const ventas = ((state.cache || {}).pagos_diferidos || {}).ventas;
  return Array.isArray(ventas) ? ventas : []; // mal escrito, sin vínculos
}
function ccContextoSesion(registros) {
  return ccContextoCandidatos(state.cache || null, state.config || {}, registros);
}

/* ----------------------------- DOM ----------------------------- */


/* Pintado principal, siempre con los datos EN VIVO de la sesión
   (state.registros / state.cache / state.config), sin leer el disco. */
function renderCorrecciones() {
  if (typeof document === "undefined") return;
  const lista = $("ccLista");
  if (!lista) return;
  ccInyectarEstilos();

  const registros = ccRegistrosSesion();
  const ctx = ccContextoSesion(registros);

  /* Solo lo que necesita una decisión (lo ya clasificado se busca en
     📒 Transacciones). */
  const cola = ccColaRevision(registros, ctx);

  /* El número de «🔍 Revisión» en el menú (solo si hay algo). */
  const n = cola.length ? numEs(cola.length, 0) : "";
  const frase = n && n + (cola.length === 1 ? " movimiento por decidir" : " movimientos por decidir");
  const nav = $("ccNavRevision");
  if (nav) {
    nav.textContent = n;
    nav.hidden = !cola.length;
    nav.title = frase;
  }
  /* Su fila en la lista de tareas (P21): solo si hay algo, abierta (también
     al volver a 🔍: js/13 la pliega al salir), con el aviso de arriba que
     lleva a ella; sin movimientos, sin «Al día» en ninguna fila. */
  const fila = $("ccPorDecidir");
  if (fila) {
    const arriba = $("ccPorDecidirArriba"), contexto = $("ccContexto");
    contexto.textContent = ccAvisoContexto(registros, ctx);
    contexto.hidden = !contexto.textContent;
    $("ccPorDecidirAviso").textContent = n && n + " por decidir";
    arriba.querySelector("a").textContent = frase;
    fila.hidden = arriba.hidden = !cola.length;
    fila.closest(".rv-tareas").classList.toggle("rv-sin-datos", !registros.length);
    pnAbrirSiHace("ccPorDecidir", cola.length > 0);
  }

  if (ccDecisionAbierta && !cola.some(r => r.clave === ccDecisionAbierta.clave)) ccDecisionAbierta = null;
  const foco = ccFocoAntes(lista);
  lista.innerHTML = ccHtmlLista(registros, cola, ctx, ccVentasGuardadas(), {
      ajustes: (state.cache && state.cache.ajustes_usuario) || {},
      tiposBce: (state.cache && state.cache.tipos_bce) || {},
      cache: state.cache,
      abierta: ccDecisionAbierta,
      dudas: ctx.dudas.size,
    });
  ccFocoDespues(lista, foco);
  renderCcResueltos();
}

/* FOCO-DECIDIR: la lista se rehace entera y el botón con el foco
   desaparece. Se apunta cuál era (y en qué tarjeta) y, al repintar, vuelve
   a él; si su tarjeta ya no está (decidida), al primer botón de la que
   ocupa su lugar (o la última); sin tarjetas, al título de la fila
   siguiente (Coste). */
function ccFocoAntes(lista) {
  const el = document.activeElement;
  if (!el || el === lista || !lista.contains(el)) return null;
  const tarjeta = el.closest("[data-hash]");
  const tarjetas = [...lista.querySelectorAll("[data-hash]")];
  return {
    sel: ["data-accion", "data-clave", "data-opcion"].filter(a => el.hasAttribute(a))
      .map(a => "[" + a + '="' + CSS.escape(el.getAttribute(a)) + '"]').join("") || null,
    clase: el.classList.contains("cc-dec-valor") ? ".cc-dec-valor" : "",
    i: tarjeta ? tarjetas.indexOf(tarjeta) : -1,
  };
}
function ccFocoDespues(lista, foco) {
  if (!foco) return;
  let el = foco.sel && lista.querySelector(foco.clase + foco.sel);
  if (!el && foco.i >= 0) {
    const tarjetas = lista.querySelectorAll("[data-hash]");
    const t = tarjetas[Math.min(foco.i, tarjetas.length - 1)];
    el = t && t.querySelector("button, input");
  }
  const fila = lista.closest("details");
  if (!el && fila) el = (fila.hidden ? fila.nextElementSibling : fila)?.querySelector("summary");
  if (el) el.focus();
}

function ccRenderSeguro() {
  try { renderCorrecciones(); }
  catch (e) { console.error("Centro de Correcciones (js/15-correcciones.js):", e); }
}

/* ----------------------------- Diálogos modales -----------------------------
   El buscador y el formulario son diálogos construidos al abrirlos, sin ids
   globales fijos. Se cierran con ✖, «Cancelar», Escape o un clic en el
   fondo, y al cerrar el foco vuelve al botón que los abrió. */
function ccCrearModal(ariaLabel, html, cerrar, trigger) {
  const overlay = document.createElement("div");
  overlay.className = "cc-dlg-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", ariaLabel);
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  const onKey = e => { if (e.key === "Escape") cerrar(); };
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("mousedown", e => { if (e.target === overlay) cerrar(); });
  overlay.querySelector(".cc-dlg-cerrar").addEventListener("click", cerrar);
  overlay.querySelector(".cc-dlg-cancelar").addEventListener("click", cerrar);
  return { overlay, onKey, trigger: trigger || null };
}
function ccQuitarModal(m) {
  document.removeEventListener("keydown", m.onKey, true);
  m.overlay.remove();
  if (m.trigger && document.contains(m.trigger)) m.trigger.focus();
}

/* ----------------------------- Buscador de cobros -----------------------------
   Se abre desde una salida pendiente o ya vinculada («➕ Añadir otro
   cobro…»), en la lista, en «Movimientos ya decididos» o en 📒 Transacciones. Busca cobros
   pendientes por activo, rango de importe, fechas y dirección; «➕» en cada
   fila elige uno o varios, y «🔗 Vincular pago…» abre el formulario con
   todos. Si no encuentra cobros sin contraparte explicada, la nota ofrece
   mostrar también los ya explicados (solo dentro de este diálogo). */
let ccDlg = null; // { overlay, onKey, trigger, salida, elegidos, extra, refs }

function ccCerrarBuscador() {
  if (!ccDlg) return;
  const m = ccDlg;
  ccDlg = null;
  ccQuitarModal(m);
}

/* HTML del buscador. info = {ventaIds} si la salida ya tiene
   vínculos CONFIRMADOS: el diálogo avisa de que el cobro se añadirá como
   otra asignación de la misma venta; info.precioCompra, el de
   ccPrecioCompraUsd. La salida va en un
   bloque destacado con lo que te costó cada token. */
function ccHtmlDialogoEstructura(salida, info) {
  const inf = info || {};
  const yaVinculada = !!(inf.ventaIds && inf.ventaIds.length);
  const titulo = yaVinculada
    ? "➕ Añadir otro cobro"
    : "🔗 Vincular cobro";
  return '<div class="cc-dlg cc-dlg-buscador">' +
    '<div class="cc-dlg-head"><h3>' + ccEsc(titulo) + "</h3>" +
    '<button type="button" class="cc-dlg-cerrar" aria-label="Cerrar el buscador de cobros">✖</button></div>' +
    '<div class="cc-dlg-salida"><span class="cc-dlg-salida-lbl">Venta</span>' +
    "<b>" + ccEsc(ccCantidad(salida.cantidad) + (salida.simbolo ? " " + salida.simbolo : "")) + "</b>" +
    (salida.inmueble ? "<span>🏠 " + ccEsc(salida.inmueble) + "</span>" : "") +
    "<span>📅 " + (ccFechaVer(salida) || "sin fecha") + "</span>" + ccEnlaceHash(salida.hash) +
    (inf.precioCompra > 0
      ? '<span class="cc-dlg-coste">Te costó ' + numEs(inf.precioCompra, 2) + " USD por token</span>" : "") +
    "</div>" +
    '<div class="cc-dlg-busqueda">' +
    '<div><label for="ccDlgActivo">Activo</label><select id="ccDlgActivo" name="activo">' +
    '<option value="">Todos</option><option value="USDT">USDT</option><option value="USDC">USDC</option></select></div>' +
    '<div><label for="ccDlgImporteMin">Importe desde</label><input type="number" step="any" min="0" id="ccDlgImporteMin" name="importeMin" placeholder="mínimo"></div>' +
    '<div><label for="ccDlgImporteMax">Importe hasta</label><input type="number" step="any" min="0" id="ccDlgImporteMax" name="importeMax" placeholder="máximo"></div>' +
    '<div><label for="ccDlgDesde">Fecha desde</label><input type="date" id="ccDlgDesde" name="desde"></div>' +
    '<div><label for="ccDlgHasta">Fecha hasta</label><input type="date" id="ccDlgHasta" name="hasta"></div>' +
    '<div class="wide"><label for="ccDlgDireccion">Dirección (vale un trozo)</label>' +
    '<input type="text" id="ccDlgDireccion" name="direccion" placeholder="0x…"></div>' +
    "</div>" +
    '<div class="cc-dlg-nota" aria-live="polite"></div>' +
    '<div class="cc-dlg-resultados" role="radiogroup" aria-label="Cobros por vincular coincidentes"></div>' +
    '<div class="cc-dlg-foot"><span class="help"></span>' +
    '<div class="row"><button type="button" class="cc-dlg-cancelar">Cancelar</button>' +
    '<button type="button" class="primary cc-dlg-proponer" disabled>🔗 Vincular cobro…</button></div></div>' +
    "</div>";
}

/* El texto de cada pista (📍 dirección, 💲 precio), para su
   línea de «Pagos sugeridos»; corto = la burbuja del icono de cada fila
   (sin la cifra, que ya sale en «Te costó…»). */
const CC_ICONO_SENAL = { direccion: "📍", precio: "💲" };
function ccTextoSenal(s, corto) {
  const pct = "Precio a ±" + Math.round(CC_SUG_MARGEN * 100) + " %";
  if (corto) return s === "direccion" ? "Misma dirección" : pct;
  return s === "direccion"
    ? "Coincide con la dirección a la que enviaste los tokens."
    : pct + " de lo que te costó cada token.";
}
/* «Pagos sugeridos (revísalo):» con una línea por pista; la del precio solo
   si se sabe lo que te costó. Si la venta ya tiene cobros (solo el dato), «Ya cobrado: X USD (+N %)»,
   que explica por qué un cobro que la aleja no lleva 💲. yaCobrado y
   tokens, los de la venta (opcionales). */
function ccHtmlLeyenda(precioCompra, yaCobrado, tokens) {
  let ya = "";
  if (yaCobrado > 0) {
    const p = precioCompra > 0 ? ccPrecioPorTokenImplicito(yaCobrado, tokens) : null;
    const pct = p === null ? null : Math.round((p / precioCompra - 1) * 100);
    ya = '<span class="cc-dlg-ya">' + ccEsc("Ya cobrado: " + numEs(yaCobrado, 2) + " USD" + (pct === null ? "" :
      " (" + (pct > 0 ? "+" : pct < 0 ? "−" : "") + numEs(Math.abs(pct), 0) + " %)") + ".") + "</span>";
  }
  return '<div class="cc-dlg-leyenda"><b>Cobros sugeridos (revísalo):</b>' +
    ["direccion", "precio"].filter(s => s === "direccion" || precioCompra > 0)
      .map(s => "<span>" + CC_ICONO_SENAL[s] + " " + ccEsc(ccTextoSenal(s)) + "</span>").join("") +
    ya + "</div>";
}
/* Fila de un cobro en el buscador, en columnas: fecha, importe
   con 2 decimales (el exacto en su burbuja; el vínculo guarda el exacto),
   días desde la venta, precio por token con su % sobre lo que te costó
   (verde si da la pista 💲), de → a, hash, iconos de las pistas y el «➕»
   que lo añade o quita de los elegidos. Cada columna lleva su celda aunque
   falte el dato, para que las filas queden alineadas. senales: las de
   ccSenalesCobro; precioCompra, el de ccPrecioCompraUsd; importeTotal, el de
   ccOrdenarSugerencias si no es el cobro entero (lo ya cobrado + lo que
   queda de este cobro), para que el % sea el que decide el 💲; como, su
   { ya, parte } (hay algo ya cobrado / de este cobro solo cuenta lo que le
   queda), para decirlo en la burbuja. */
function ccHtmlFilaCobro(reg, elegida, salida, senales, precioCompra, importeTotal, como = { ya: true }) {
  const dias = ccDiasEntreFechas(reg, salida);
  const total = importeTotal !== undefined;
  // Un cobro sin cantidad legible (0, negativa, un texto) no tiene precio.
  const precio = ccEsNumeroPositivo(reg.cantidad) ? ccPrecioPorTokenImplicito(total ? importeTotal : reg.cantidad, salida && salida.cantidad) : null;
  const sen = senales || [];
  const textoDesfase = dias === null ? ""
    : (dias > 0 ? "+" + dias + " d" : dias < 0 ? "\u2212" + Math.abs(dias) + " d" : "0 d");
  let textoPrecio = "", pct = "";
  if (precio !== null) {
    textoPrecio = numEs(precio, 2) + " USD/token";
    if (precioCompra > 0) {
      const p = Math.round((precio / precioCompra - 1) * 100);
      pct = " (" + (p > 0 ? "+" : p < 0 ? "\u2212" : "") + numEs(Math.abs(p), 0) + " %)";
    }
  }
  const exacto = Number.isFinite(reg.cantidad) ? ccCantidad(reg.cantidad) + (reg.simbolo ? " " + reg.simbolo : "") : "";
  const importe = Number.isFinite(reg.cantidad) ? numEs(reg.cantidad, 2) + (reg.simbolo ? " " + reg.simbolo : "") : "";
  const motivos = sen.map(s => ccTextoSenal(s, true)).join(" · ");
  return '<div class="cc-dlg-item' + (elegida ? " elegida" : "") + '">' +
    '<span class="cc-dlg-fecha">📅 ' + (ccFechaVer(reg) || "sin fecha") + "</span>" +
    '<span class="cc-dlg-amt" title="' + ccEsc(exacto) + '">' + ccEsc(importe) + "</span>" +
    '<span class="cc-dlg-desfase" title="Días entre la venta y el cobro">' + ccEsc(textoDesfase) + "</span>" +
    '<span class="cc-dlg-precio' + (sen.includes("precio") ? " ok" : "") + '"' + (precio === null ? "" : ' title="' + ccTituloPrecioFila(total, como) + '"') + ">" +
      ccEsc(textoPrecio) + (pct ? "<b>" + ccEsc(pct) + "</b>" : "") + "</span>" +
    '<span class="cc-dlg-dir" title="' + ccTituloRuta(reg) + '">' + ccTextoRuta(reg) + "</span>" +
    '<span class="cc-dlg-hash">' + ccEnlaceHash(reg.hash) + "</span>" +
    '<span class="cc-dlg-encaja"' + (sen.length ? ' role="img" aria-label="' + ccEsc(motivos) + '" title="' + ccEsc(motivos) + '"' : "") + ">" +
      sen.map(s => CC_ICONO_SENAL[s]).join("") + "</span>" +
    '<button type="button" class="cc-accion cc-elegir" data-accion="toggle-cobro" data-clave="' + ccEsc(reg.clave) +
    '" aria-label="' + (elegida ? "Quitar este cobro de los elegidos" : "Añadir este cobro a los elegidos") +
    '" title="' + (elegida ? "Quitar" : "Añadir") + '">' +
    (elegida ? "✔" : "➕") + "</button>" +
    "</div>";
}

/* La burbuja del precio de una fila: qué se divide entre los tokens. */
function ccTituloPrecioFila(total, como) {
  if (!total) return "Cobro ÷ tokens de la venta";
  const este = como && como.parte ? "lo que queda de este cobro" : "este cobro";
  return (como && como.ya ? "(Ya cobrado + " + este + ")" : este.charAt(0).toUpperCase() + este.slice(1)) + " ÷ tokens de la venta";
}

function ccLeerConsultaDlg() {
  if (!ccDlg) return {};
  const f = ccDlg.refs.form;
  const val = n => {
    const el = f.querySelector('[name="' + n + '"]');
    return el ? String(el.value || "") : "";
  };
  return {
    activo: val("activo"), importeMin: val("importeMin"), importeMax: val("importeMax"),
    desde: val("desde"), hasta: val("hasta"), direccion: val("direccion"),
  };
}

/* El buscador cuenta los vínculos guardados como el
   formulario (todos los CONFIRMADOS, también uno que el motor no aplica):
   lo ya cobrado de la venta y lo asignado de cada cobro salen de ahí, y no
   ofrece un cobro que ya está en esta venta (se cambia con «✏️ Editar») ni
   uno sin nada libre (el formulario lo bloquearía). Devuelve el contexto
   para ccOrdenarSugerencias, la venta de la salida y el filtro. Solo mira
   los movimientos con el hash de alguna asignación guardada (la clave de
   una referencia lleva el hash): sacar la referencia de cada movimiento en
   cada tecla costaría casi un segundo. */
function ccContextoBuscador(registros, ctx, salida, ventas, cache) {
  const venta = salida ? ccVentaExistenteParaSalida(ventas, ccReferenciaDeRegistro(salida, cache)) : null;
  const hashes = new Set();
  for (const v of ventas || []) {
    if (!v || v.estado !== "CONFIRMADO" || !Array.isArray(v.asignaciones)) continue;
    for (const a of v.asignaciones) if (a && a.pago) hashes.add(normalizarDireccion(a.pago.hash));
  }
  const cobrosAsignados = new Map();
  for (const r of registros) {
    if (!hashes.has(normalizarDireccion(r.hash))) continue;
    const ref = ccReferenciaDeRegistro(r, cache);
    const asignado = ccAsignadoACobro(ref, ventas);
    if (asignado > 0) cobrosAsignados.set(r.clave, { asignado, enEstaVenta: !!venta && ccCobroYaAsignado(venta, ref) });
  }
  // Lo libre, como ccDisponibleCobro (sin cantidad numérica no se descarta).
  const libre = c => {
    const m = cobrosAsignados.get(c.clave);
    return !m || (!m.enEstaVenta && (!Number.isFinite(c.cantidad) || red6(red6(c.cantidad) - m.asignado) > 0));
  };
  return { venta, libre, ctx: Object.assign({}, ctx, { cobrosAsignados,
    salidasVinculadas: venta ? new Map([[salida.clave, [venta.id]]]) : new Map() }) };
}

/* Repinta la nota, el botón principal y los resultados del buscador.
   Un elegido que el filtro deja fuera (p. ej. a mitad de
   teclear una fecha) sigue elegido y se ve; solo se descarta si ya no es un
   cobro por vincular. */
function ccDlgActualizar() {
  if (!ccDlg) return;
  const registros = ccRegistrosSesion();
  const ctx = ccContextoSesion(registros);
  const q = ccLeerConsultaDlg();
  const salidaReg = registros.find(r => r.clave === ccDlg.salida) || null;
  const buscador = ccContextoBuscador(registros, ctx, salidaReg, ccVentasGuardadas(), state.cache);
  const coinciden = o => ccCobrosCoincidentes(registros, ctx, o).filter(buscador.libre);
  const cobros = coinciden(Object.assign({}, q, { verTodos: !!ccDlg.extra }));
  const clavesCobros = new Set(cobros.map(c => c.clave));
  const todos = coinciden({ verTodos: true });
  ccDlg.elegidos = (ccDlg.elegidos || []).filter(k => todos.some(c => c.clave === k));
  const mostrados = cobros.concat(todos.filter(c => ccDlg.elegidos.includes(c.clave) && !clavesCobros.has(c.clave)));
  const nEleg = ccDlg.elegidos.length;
  ccDlg.refs.vincular.disabled = nEleg === 0;
  ccDlg.refs.vincular.textContent = nEleg <= 1 ? "🔗 Vincular cobro…" : "🔗 Vincular " + nEleg + " cobros…";
  /* Cabecera «Cobros posibles (N)» con sus botones a la
     derecha, «Instrucciones» y «Pagos sugeridos», cada uno en su línea. */
  const boton = (accion, texto, clase) => '<button type="button" class="cc-accion' + (clase ? " " + clase : "") +
    '" data-accion="' + accion + '">' + texto + "</button>";
  let titulo, acciones = "", ayuda = "";
  if (cobros.length) {
    titulo = "Cobros posibles (" + cobros.length + ")" + (ccDlg.extra ? ", también los ya explicados" : "");
    if (ccDlg.extra) acciones += boton("solo-acotados", "Ver solo los sin explicar");
  } else if (!ccDlg.extra) {
    const extras = coinciden(Object.assign({}, q, { verTodos: true }));
    titulo = extras.length ? "Ningún cobro sin explicar coincide" : "Ningún cobro coincide";
    if (extras.length) acciones += boton("ver-explicados", "Ver también los ya explicados (" + extras.length + ")");
    else ayuda = "Amplía el importe, las fechas o la dirección.";
  } else {
    titulo = "Ningún cobro coincide";
    ayuda = "Amplía el importe, las fechas o la dirección.";
    acciones += boton("solo-acotados", "Ver solo los sin explicar");
  }
  /* Los que solo deja fuera la ventana de fechas. */
  if (q.desde || q.hasta) {
    const nFuera = coinciden(Object.assign({}, q, { desde: "", hasta: "", verTodos: !!ccDlg.extra })).length - cobros.length;
    if (nFuera > 0) acciones += boton("sin-fechas", "Ver " + nFuera + " más fuera de las fechas", "cc-dlg-btn-info");
  }
  /* Más pistas arriba y, a igualdad, el más cercano a la venta. */
  const precioCompra = ccPrecioCompraUsd(registros, salidaReg, state.cache && state.cache.tipos_bce, 0);
  const filas = ccOrdenarSugerencias(mostrados, salidaReg, precioCompra, buscador.ctx, state.cache);
  ccDlg.refs.nota.innerHTML =
    '<div class="cc-dlg-cab"><h4>' + ccEsc(titulo) + "</h4>" + (acciones ? "<span>" + acciones + "</span>" : "") + "</div>" +
    (ayuda ? '<div class="cc-dlg-instr">' + ccEsc(ayuda) + "</div>" : "") +
    (mostrados.length
      ? '<div class="cc-dlg-instr"><b>Instrucciones:</b> pulsa ➕ en el cobro que corresponde y luego «Vincular cobro…».' +
        (nEleg ? " · <b>" + nEleg + (nEleg === 1 ? " elegido" : " elegidos") + "</b>" : "") + "</div>" +
        ccHtmlLeyenda(precioCompra, buscador.venta ? ccAsignacionesValidas(buscador.venta)
          .reduce((t, a) => t + (Number(a.cantidad_asignada) > 0 && Number.isFinite(Number(a.cantidad_asignada)) ? Number(a.cantidad_asignada) : 0), 0) : 0,
          salidaReg && salidaReg.cantidad)
      : "");
  ccDlg.refs.resultados.innerHTML = mostrados.length
    ? filas.map(f => ccHtmlFilaCobro(f.c, ccDlg.elegidos.includes(f.c.clave), salidaReg, f.sen, precioCompra, f.importe, f.como)).join("")
    : "";
}

/* Botón con data-accion (y el selector dado) sobre el que se hizo clic. */
function ccBotonDe(e, sel) {
  return e.target && e.target.closest ? e.target.closest(sel) : null;
}

/* La consulta del buscador al pasar al formulario
   ({salida, q, extra}), para que «➕ Añadir otro» la recupere. */
let ccDlgPrevia = null;

/* previa: la de ccDlgPrevia, solo desde «➕ Añadir otro»; sin ella, las
   fechas de la venta. */
function ccAbrirBuscador(salidaClave, trigger, previa) {
  ccCerrarBuscador();
  ccDlgPrevia = null;
  const registros = ccRegistrosSesion();
  const salida = registros.find(r => r.clave === salidaClave);
  if (!salida) return;
  /* Si la salida ya tiene un vínculo confirmado (aunque el motor no lo
     aplique), el diálogo lo avisa. */
  const venta = ccVentaExistenteParaSalida(ccVentasGuardadas(), ccReferenciaDeRegistro(salida, state.cache));
  const modal = ccCrearModal("Buscador de cobros",
    ccHtmlDialogoEstructura(salida, {
      ventaIds: venta ? [venta.id] : null,
      precioCompra: ccPrecioCompraUsd(registros, salida, state.cache && state.cache.tipos_bce, 0),
    }), ccCerrarBuscador, trigger);
  const overlay = modal.overlay;
  ccDlg = Object.assign(modal, {
    salida: salidaClave,
    elegidos: [], // cobros elegidos con «➕» (varios a la vez)
    extra: false, // true = mostrar también los entrantes ya explicados
    refs: {
      form: overlay.querySelector(".cc-dlg-busqueda"),
      resultados: overlay.querySelector(".cc-dlg-resultados"),
      nota: overlay.querySelector(".cc-dlg-nota"),
      vincular: overlay.querySelector(".cc-dlg-proponer"),
      cerrar: overlay.querySelector(".cc-dlg-cerrar"),
    },
  });
  /* Se abre con las fechas de CC_SUG_DIAS días antes a CC_SUG_DIAS
     después de la venta (se pueden borrar para ver todos). */
  const diaVenta = ccFechaCorta(salida);
  if (previa && previa.salida === salidaClave) {
    for (const [n, v] of Object.entries(previa.q || {})) {
      const el = ccDlg.refs.form.querySelector('[name="' + n + '"]');
      if (el) el.value = v;
    }
    ccDlg.extra = !!previa.extra;
  } else if (diaVenta) {
    ccDlg.refs.form.querySelector('[name="desde"]').value = ccSumarDias(diaVenta, -CC_SUG_DIAS);
    ccDlg.refs.form.querySelector('[name="hasta"]').value = ccSumarDias(diaVenta, CC_SUG_DIAS);
  }
  ccDlg.refs.form.addEventListener("input", () => ccDlgActualizar());
  ccDlg.refs.form.addEventListener("change", () => ccDlgActualizar());
  /* Los botones de la nota cambian entre ver solo los cobros sin explicar o
     también los ya explicados. */
  ccDlg.refs.nota.addEventListener("click", e => {
    const btn = ccBotonDe(e, "[data-accion]");
    if (!btn || !ccDlg) return;
    const accion = btn.getAttribute("data-accion");
    if (accion === "ver-explicados") ccDlg.extra = true;
    else if (accion === "solo-acotados") ccDlg.extra = false;
    else if (accion === "sin-fechas") {
      for (const n of ["desde", "hasta"]) ccDlg.refs.form.querySelector('[name="' + n + '"]').value = "";
    } else return;
    ccDlgActualizar();
  });
  ccDlg.refs.resultados.addEventListener("click", e => {
    const btn = ccBotonDe(e, '[data-accion="toggle-cobro"]');
    if (!btn || !ccDlg) return;
    const clave = btn.getAttribute("data-clave");
    const i = ccDlg.elegidos.indexOf(clave);
    if (i >= 0) ccDlg.elegidos.splice(i, 1);
    else ccDlg.elegidos.push(clave);
    ccDlgActualizar();
  });
  ccDlg.refs.vincular.addEventListener("click", () => {
    if (!ccDlg || !ccDlg.elegidos.length) return;
    const previa = { salida: ccDlg.salida, q: ccLeerConsultaDlg(), extra: ccDlg.extra };
    const salidaCl = ccDlg.salida;
    const cobrosCl = ccDlg.elegidos.slice();
    const triggerForm = ccDlg.trigger;
    ccCerrarBuscador();
    ccDlgPrevia = previa;
    ccAbrirFormulario(salidaCl, cobrosCl, triggerForm, null);
  });
  ccDlgActualizar();
  ccDlg.refs.cerrar.focus();
}

/* ----------------------------- Formulario de vínculo -----------------------------
   Se abre desde el buscador con los cobros elegidos, o desde «Movimientos ya decididos»
   para editar un vínculo completo. Muestra la venta y cada pago por
   separado, la parte de cada cobro que corresponde a la venta (precargada
   con todo su disponible; al editar, el disponible no cuenta la propia
   asignación), una nota y los avisos de la simulación. */
let ccForm = null; // { overlay, onKey, trigger, salida, cobros, edicion, edicionAsignaciones, refs }

function ccCerrarFormulario() {
  if (!ccForm) return;
  const m = ccForm;
  ccForm = null;
  ccQuitarModal(m);
}

/* Piezas de la tarjeta venta ↔ pagos: cantidad grande y fecha + hash con
   enlace (o aviso si no es on-chain). */
function ccHtmlParCantidad(reg) {
  return '<h2 class="cc-par-amt">' + ccEsc(ccCantidad(reg.cantidad)) +
    (reg.simbolo ? " " + ccEsc(reg.simbolo) : "") + "</h2>";
}
function ccHtmlParFechaHash(reg) {
  const fecha = '<p class="cc-par-fecha">📅 ' + ccEsc(ccFechaVer(reg) || "sin fecha") + "</p>";
  return fecha + ccEnlaceHash(reg.hash, "cc-par-hash");
}

/* Columna de la VENTA (izquierda): cantidad, inmueble (sub), fecha y hash;
   las direcciones van en el title. */
function ccHtmlParColumna(label, reg, sub) {
  return '<section class="cc-par-col" title="' + ccTituloRuta(reg) + '">' +
    '<p class="cc-par-label">' + ccEsc(label) + "</p>" +
    ccHtmlParCantidad(reg) +
    (sub ? '<p class="cc-par-sub">' + ccEsc(sub) + "</p>" : "") +
    ccHtmlParFechaHash(reg) + "</section>";
}

/* Bloque de un pago en la columna derecha. modo "previo" = asignación ya
   guardada de la venta (solo lectura, con lo asignado); "nuevo" = cobro
   elegido en el buscador, con su cantidad editable. */
function ccHtmlPagoBloque(reg, modo, asignado, cantidadPrecargada, conInfo) {
  let html = '<div class="cc-par-pago' + (modo === "previo" ? " previo" : "") +
    '" title="' + ccTituloRuta(reg) + '">';
  if (modo === "previo") {
    html += '<p class="cc-par-label">COBRO YA VINCULADO · asignado ' + ccEsc(ccCantidad(asignado)) + "</p>";
  } else {
    html += '<p class="cc-par-label">COBRO' + (conInfo ? " " + ccInfo("Todo lo libre de este cobro.") : "") + "</p>";
  }
  html += ccHtmlParCantidad(reg) + ccHtmlParFechaHash(reg);
  if (modo === "nuevo") {
    const activo = reg.simbolo || "";
    html += '<label class="cc-par-cant-label" for="ccFormCantidad_' + ccEsc(reg.clave) + '">Para esta venta' +
      (activo ? " (" + ccEsc(activo) + ")" : "") + '</label>' +
      '<input type="number" step="any" min="0" id="ccFormCantidad_' + ccEsc(reg.clave) +
      '" name="cantidad" data-clave="' + ccEsc(reg.clave) + '" value="' +
      (cantidadPrecargada === null || cantidadPrecargada === undefined ? "" : ccEsc(String(cantidadPrecargada))) + '">';
  }
  return html + "</div>";
}

/* HTML del formulario: la venta a la izquierda y cada pago por separado a
   la derecha (los ya vinculados en lectura; los nuevos con su cantidad
   editable, sin sumas), la nota y la zona de avisos. Pie: Cancelar,
   «➕ Añadir otro» (guarda y reabre el buscador) y «✅ Confirmar vínculo».
   Recibe (salida, cobros (o un cobro suelto), precargas {clave: cantidad,
   nota}, pagosPrevios [{reg, asignado}], notaVentaPrevia, titulo). */
function ccHtmlFormEstructura(salida, cobros, precargas, pagosPrevios, notaVentaPrevia, titulo) {
  const listaCobros = Array.isArray(cobros) ? cobros : [cobros];
  const previos = Array.isArray(pagosPrevios) ? pagosPrevios : [];
  const prec = precargas || {};
  let pagos = "";
  for (const p of previos) {
    if (p && p.reg) pagos += ccHtmlPagoBloque(p.reg, "previo", p.asignado, null, false);
  }
  listaCobros.forEach((c, i) => {
    const clave = c.clave;
    const cant = Object.prototype.hasOwnProperty.call(prec, clave) ? prec[clave] : null;
    pagos += ccHtmlPagoBloque(c, "nuevo", null, cant, i === 0 && previos.length === 0);
  });
  return '<div class="cc-dlg cc-form">' +
    '<div class="cc-dlg-head"><h3>' + ccEsc(titulo || "🔗 Vincular cobro") + "</h3>" +
    '<button type="button" class="cc-dlg-cerrar" aria-label="Cerrar el formulario de vínculo">✖</button></div>' +
    (notaVentaPrevia ? '<div class="cc-form-previa">ℹ ' + ccEsc(notaVentaPrevia) + "</div>" : "") +
    '<div class="cc-par">' +
    ccHtmlParColumna("VENTA", salida, salida.inmueble || null) +
    '<div class="cc-par-con" aria-hidden="true">🔗</div>' +
    '<div class="cc-par-pagos">' + pagos + "</div>" +
    "</div>" +
    '<div class="cc-form-campos">' +
    '<div class="wide"><label for="ccFormNota">Nota (opcional)</label>' +
    '<textarea id="ccFormNota" name="nota" rows="2">' +
    ccEsc(prec.nota || "") + "</textarea></div>" +
    "</div>" +
    '<div class="cc-form-efectos" aria-live="polite"></div>' +
    '<div class="cc-dlg-foot"><span class="help"></span>' +
    '<div class="row"><span class="cc-form-estado help"></span>' +
    '<button type="button" class="cc-dlg-cancelar">Cancelar</button>' +
    '<button type="button" class="cc-form-confirmar-otro">➕ Añadir otro cobro</button>' +
    '<button type="button" class="primary cc-form-confirmar">✅ Confirmar vínculo</button></div></div>' +
    "</div>";
}

/* Zona de avisos del formulario: resumen de lo que hará el motor, avisos de
   una línea y errores de validación (bloquean el guardado). Sin plegable
   de cambios (serían campos en crudo). */
function ccHtmlAvisosVinculo(sim, avisos, errores) {
  let html = "";
  if (!sim.diff.length && !sim.info.aplicados.length) {
    html += '<div class="cc-form-aviso">⚠ Este vínculo no cambiaría nada.</div>';
  } else if (!sim.diff.length) {
    /* Edición sin cambios todavía: el vínculo ya está aplicado en la sesión
       (no es que el motor no lo aplicaría). */
    html += '<div class="cc-form-ok">✔ Sin cambios.</div>';
  } else {
    /* Lo que dice la simulación, no siempre «sale de
       revisión» (una venta puede seguir a revisar por otro motivo). */
    const salidas = new Set(sim.info.aplicados.map(a => a.salida));
    const sigue = (sim.resultado || []).some(r => salidas.has(r.clave) && r.revisar);
    html += '<div class="cc-form-ok">✔ Al confirmar, la venta queda cobrada' +
      (sigue ? " (sigue en la lista por otro motivo)." : " y sale de la lista.") + "</div>";
    for (const a of sim.info.aplicados) {
      html += '<div class="cc-form-ok">✔ Cobrado: ' + ccEsc(ccCantidad(a.importe_usd)) + " USD (" +
        a.pagos.map(p => ccEsc(ccCantidad(p.asignado))).join(" + ") + ").</div>";
    }
  }
  for (const a of avisos) html += '<div class="cc-form-aviso">⚠ ' + ccEsc(a) + "</div>";
  for (const e of errores) html += '<div class="cc-form-error">⛔ ' + ccEsc(e) + "</div>";
  return html;
}
/* Lee el formulario (solo lecturas del DOM) y calcula el estado completo:
   pares cobro/cantidad, borrador, lo que se escribiría en el bloque, la
   simulación y la validación. Lo usan el repintado de avisos y la
   confirmación, así que nunca pueden diferir. La liquidación se fija
   COMPLETA y el importe pactado y la moneda quedan null. Al editar, el
   disponible de cada cobro no cuenta su propia asignación. */
function ccFormLeerEstado() {
  const registros = ccRegistrosSesion();
  const regSalida = registros.find(r => r.clave === ccForm.salida) || null;
  const claves = ccForm.cobros || [];
  const regsCobro = claves.map(k => registros.find(r => r.clave === k) || null);
  if (!regSalida || regsCobro.some(c => !c)) return { regSalida: null, regsCobro: [] };
  const overlay = ccForm.overlay;
  const leerCantidad = clave => {
    const el = overlay.querySelector('[name="cantidad"][data-clave="' + clave + '"]');
    if (!el) return NaN;
    const v = String(el.value || "");
    return v === "" ? NaN : Number(v);
  };
  const leerNota = () => {
    const el = overlay.querySelector('[name="nota"]');
    return el ? String(el.value || "") : "";
  };
  const ventas = ccVentasGuardadas();
  const refSalida = ccReferenciaDeRegistro(regSalida, state.cache);
  const pares = [];
  const cantidadesMalas = [];
  for (let i = 0; i < regsCobro.length; i++) {
    const reg = regsCobro[i];
    const ref = ccReferenciaDeRegistro(reg, state.cache);
    let disponible, asignacionId = null, indice = null;
    if (ccForm.edicion) {
      const asig = (ccForm.edicionAsignaciones || [])[i] || null;
      asignacionId = asig ? asig.asignacionId : null;
      indice = asig ? asig.indice : null;
      disponible = ccDisponibleCobroExcluyendo(reg, ventas, state.cache,
        { ventaId: ccForm.edicion.ventaId, asignacionId: asignacionId, indice: indice });
    } else {
      disponible = ccDisponibleCobro(reg, ventas, state.cache);
    }
    const cantidad = leerCantidad(reg.clave);
    /* Al editar, 0 o vacío quita ese cobro; y una cantidad
       que redondeada a 6 decimales es 0 no vale. */
    const quitar = !!ccForm.edicion && (Number.isNaN(cantidad) || cantidad === 0);
    const cantidadBien = Number.isFinite(cantidad) && red6(cantidad) > 0;
    if (!cantidadBien && !quitar) cantidadesMalas.push(reg.simbolo || ccHashCorto(reg.hash) || reg.clave);
    pares.push({ reg, ref, cantidad, cantidadBien, disponible, asignacionId, indice, quitar });
  }
  const cantidadOk = cantidadesMalas.length === 0;
  const todosQuitados = pares.length > 0 && pares.every(pp => pp.quitar);
  const borrador = ccBorradorVenta({
    salida: regSalida, refSalida: refSalida,
    cobros: pares.map(pp => ({ reg: pp.reg, ref: pp.ref,
                               cantidad: pp.cantidadBien ? pp.cantidad : 0 })),
    estadoLiquidacion: "COMPLETA",
    importeEsperado: null, monedaEsperada: "USD",
    nota: leerNota(),
  });
  const ventaExistente = ccVentaExistenteParaSalida(ventas, refSalida);
  const dups = [];
  if (!ccForm.edicion && ventaExistente) {
    for (const pp of pares) {
      if (ccCobroYaAsignado(ventaExistente, pp.ref)) {
        dups.push(pp.reg.simbolo || ccHashCorto(pp.reg.hash));
      }
    }
  }
  /* Lo que se escribiría al confirmar, y lo que se simula: al crear, el
     borrador fusionado en el bloque (las asignaciones nuevas sobre la venta
     existente si la hay); al editar, el bloque con las asignaciones editadas
     en su sitio. Nunca como venta aparte (daría un falso «salida
     duplicada»). */
  const escritura = ccForm.edicion
    ? {
        ventas: ccEditarVenta(ventas, {
          ventaId: ccForm.edicion.ventaId,
          asignaciones: pares.map(pp => ({ asignacionId: pp.asignacionId, indice: pp.indice, quitar: pp.quitar,
                                           cantidadAsignada: pp.cantidadBien ? pp.cantidad : 0 })),
          // Sin importe esperado ni liquidación, se
          // conservan los que ya tenía la venta.
          nota: borrador.nota,
        }),
        ventaId: ccForm.edicion.ventaId,
        editada: true,
      }
    : ccAplicarBorradorABloque(ventas, { borrador, refSalida, conservarVenta: true });
  /* Solo cuentan los problemas que trae este vínculo; los
     de otro ya guardado (p. ej. le falta su venta) no lo bloquean. */
  const base = ccForm.simBase && ccForm.simBase.registros === registros && ccForm.simBase.ventas === ventas
    ? ccForm.simBase
    : (ccForm.simBase = { registros, ventas, sim: ccSimularBloque(registros, state.cache, ventas, state.registrosSinVinculos) });
  const sim = ccSoloLoNuevo(ccSimularBloque(registros, state.cache, escritura.ventas, state.registrosSinVinculos),
                            base.sim, escritura.ventaId);
  const cobroDecidido = ccCobrosConDecision(pares.filter(pp => !pp.quitar).map(pp => pp.reg),
                                             state.cache && state.cache.ajustes_usuario).length > 0;
  const validacion = ccValidacionBorrador({ regSalida, regCobro: regsCobro[0], cantidadOk, todosQuitados,
                                            dupCobro: dups.length > 0, cobroDecidido, sim, ventaId: escritura.ventaId });
  return { registros, regSalida, regsCobro, pares, ventas, refSalida, borrador,
           dups, cantidadesMalas, cantidadOk, sim, validacion, escritura };
}

function ccFormActualizar() {
  if (!ccForm) return;
  const st = ccFormLeerEstado();
  if (!st.regSalida || !st.regsCobro.length) {
    ccForm.refs.efectos.innerHTML = '<div class="cc-vacio">La venta o el cobro ya no están entre tus movimientos.</div>';
    ccForm.refs.confirmar.disabled = true;
    ccForm.refs.confirmarOtro.disabled = true;
    ccForm.refs.estado.textContent = "";
    return;
  }
  const paresAviso = st.pares.filter(pp => !pp.quitar).map(pp => ({ reg: pp.reg, disponible: pp.disponible,
                                           asignado: pp.cantidadBien ? pp.cantidad : null }));
  const { avisos, errores } = ccAvisosBorradorMulti(st.regSalida, paresAviso, st.borrador, st.sim);
  // Las mismas frases que el motor, una sola vez (Set).
  if (st.cantidadesMalas.length) errores.unshift("Escribe una cantidad mayor que 0.");
  if (st.dups.length) errores.unshift("Este cobro ya está en esta venta.");
  ccForm.refs.efectos.innerHTML = ccHtmlAvisosVinculo(st.sim, avisos, [...new Set(errores)]);
  /* Los dos botones de guardar solo se habilitan si el vínculo es válido y
     el motor lo aplicaría; si no, los motivos van en el title y en la línea
     de estado. */
  ccForm.refs.confirmar.disabled = !st.validacion.ok;
  ccForm.refs.confirmar.title = st.validacion.ok ? "" : st.validacion.motivos.join(" · ");
  ccForm.refs.confirmarOtro.disabled = !st.validacion.ok;
  ccForm.refs.confirmarOtro.title = st.validacion.ok
    ? "Guarda y elige otro cobro."
    : st.validacion.motivos.join(" · ");
  ccForm.refs.estado.textContent = st.validacion.ok ? "" : "⛔ " + st.validacion.motivos[0];
  ccForm.refs.estado.className = "cc-form-estado help " + (st.validacion.ok ? "ok" : "mal");
}

/* Confirmar: escribe el vínculo en cache.pagos_diferidos, marca la cache
   como modificada y la autoguarda (el patrón de los ajustes de js/13), y
   reclasifica para que los efectos se vean al instante. Si el navegador no
   deja guardar, la cache de la sesión ya tiene el vínculo y lo dice el
   aviso (CC_SIN_DISCO). conOtro = «➕ Añadir otro»: tras guardar
   reabre el buscador con la misma salida (al editar no encadena). */
async function ccConfirmarVinculo(conOtro) {
  if (!ccForm || ccForm.refs.confirmar.disabled) return;
  const st = ccFormLeerEstado();
  if (!st.validacion.ok) {
    toast("No se puede confirmar: " + st.validacion.motivos[0], "error");
    return;
  }
  const salidaClave = ccForm.salida;
  const eraEdicion = !!ccForm.edicion;
  const res = st.escritura;
  let mensaje;
  if (eraEdicion) {
    mensaje = "Vínculo actualizado.";
  } else {
    mensaje = res.editada ? "Cobro añadido al vínculo." : "Vínculo guardado.";
  }
  state.cache.pagos_diferidos = Object.assign({}, state.cache.pagos_diferidos, { ventas: res.ventas });
  ccCerrarFormulario();
  const enDisco = await ccGuardarYReclasificar();
  if (enDisco === null) return;
  if (conOtro && !eraEdicion) {
    toast(mensaje + " Elige el siguiente cobro." + (enDisco ? "" : " " + CC_SIN_DISCO), enDisco ? "ok" : "warn");
    ccAbrirBuscador(salidaClave, null, ccDlgPrevia);
    return;
  }
  toast(mensaje + (enDisco ? "" : " " + CC_SIN_DISCO), enDisco ? "ok" : "warn");
}

/* Abre el formulario con la salida y las claves de los cobros elegidos.
   edicion = {ventaId} para editar un vínculo guardado completo: cada cobro
   de la venta con su cantidad asignada editable. */
function ccAbrirFormulario(salidaClave, cobroClaves, trigger, edicion) {
  ccCerrarFormulario();
  const registros = ccRegistrosSesion();
  const salida = registros.find(r => r.clave === salidaClave);
  const claves = cobroClaves.slice();
  const cobros = claves.map(k => registros.find(r => r.clave === k) || null);
  if (!salida || cobros.some(c => !c)) return;
  const ventas = ccVentasGuardadas();
  const precargas = {};
  let notaPrevia = null, titulo = null, pagosPrevios = [];
  let edicionAsignaciones = null;
  if (edicion) {
    const venta = ventas.find(v => v && v.id === edicion.ventaId);
    if (!venta) return;
    edicionAsignaciones = [];
    ccAsignacionesValidas(venta).forEach((a, i) => {
      if (cobros[i]) precargas[cobros[i].clave] = Number(a.cantidad_asignada);
      // Sin id, la asignación se busca por su sitio en la lista.
      edicionAsignaciones.push({ asignacionId: a.id || null, indice: i });
    });
    precargas.nota = venta.nota || "";
    notaPrevia = "Con 0, ese cobro se quita.";
    titulo = "✏️ Editar vínculo";
  } else {
    for (const c of cobros) precargas[c.clave] = ccDisponibleCobro(c, ventas, state.cache);
    /* Si la salida ya tiene venta CONFIRMADA, el formulario lo avisa, muestra
       sus pagos ya vinculados y al confirmar los nuevos se añaden como
       asignaciones de esa venta. */
    const refSalida = ccReferenciaDeRegistro(salida, state.cache);
    const previa = ccVentaExistenteParaSalida(ventas, refSalida);
    /* Al volver a vincular una venta anulada, su nota vuelve
       (se reutiliza el mismo vínculo). */
    const anuladas = previa ? [] : ccVentasAnuladasDeSalida(ventas, refSalida);
    if (anuladas.length) precargas.nota = anuladas[anuladas.length - 1].nota || "";
    if (previa) {
      pagosPrevios = ccAsignaciones(previa).map(a => ({
        reg: resolverReferenciaMovimiento(a.pago, registros),
        asignado: Number(a.cantidad_asignada),
      }));
      precargas.nota = previa.nota || "";
    }
  }
  const modal = ccCrearModal("Formulario del vínculo de pago diferido: al confirmar se guarda en tu archivo",
    ccHtmlFormEstructura(salida, cobros, precargas, pagosPrevios, notaPrevia, titulo),
    ccCerrarFormulario, trigger);
  const overlay = modal.overlay;
  ccForm = Object.assign(modal, {
    salida: salidaClave, cobros: claves,
    edicion: edicion ? { ventaId: edicion.ventaId } : null,
    edicionAsignaciones: edicionAsignaciones,
    refs: {
      efectos: overlay.querySelector(".cc-form-efectos"),
      cerrar: overlay.querySelector(".cc-dlg-cerrar"),
      confirmar: overlay.querySelector(".cc-form-confirmar"),
      confirmarOtro: overlay.querySelector(".cc-form-confirmar-otro"),
      estado: overlay.querySelector(".cc-form-estado"),
    },
  });
  /* Las cantidades están en la tarjeta de la venta y los pagos, fuera de
     .cc-form-campos: el repintado escucha en todo el diálogo. */
  overlay.addEventListener("input", e => { if (e.target.closest && e.target.closest(".cc-form")) ccFormActualizar(); });
  overlay.addEventListener("change", e => { if (e.target.closest && e.target.closest(".cc-form")) ccFormActualizar(); });
  /* Al editar, «➕ Añadir otro» no encadena: no se enseña (su ayuda
     prometería reabrir el buscador). */
  if (edicion) ccForm.refs.confirmarOtro.hidden = true;
  ccForm.refs.confirmar.addEventListener("click", () => { ccConfirmarVinculo(false); });
  ccForm.refs.confirmarOtro.addEventListener("click", () => { ccConfirmarVinculo(true); });
  ccFormActualizar();
  ccForm.refs.cerrar.focus();
}

/* Editar un vínculo guardado completo. La salida y cada cobro se resuelven
   desde las referencias de la venta; si algún movimiento no está en la
   clasificación de la sesión, se avisa en vez de abrir el formulario. */
function ccAbrirFormularioEdicion(ventaId, trigger) {
  const venta = ccVentasGuardadas().find(v => v && v.id === ventaId);
  if (!venta) return;
  const registros = ccRegistrosSesion();
  const regSalida = resolverReferenciaMovimiento(venta.salida, registros);
  const regsCobro = ccAsignacionesValidas(venta).map(a => resolverReferenciaMovimiento(a.pago, registros));
  if (!regSalida || regsCobro.some(r => !r)) {
    toast("No se puede editar: falta algún movimiento del vínculo.", "warn");
    return;
  }
  ccAbrirFormulario(regSalida.clave, regsCobro.map(r => r.clave), trigger, { ventaId: ventaId });
}

/* ----------------------------- Vínculos guardados («Movimientos ya decididos») -----------------------------
   Los vínculos CONFIRMADOS están en el desplegable «Movimientos ya decididos» (n)
   (#ccListaResueltos / #ccResueltosCount), cerrado por defecto. Cada uno
   ofrece añadir otro cobro, editar y anular («↩ Deshacer»), y todo cambio guarda y
   reclasifica. Los anulados no se enseñan: siguen en la cache,
   sin efecto, hasta que la venta se vuelva a vincular. */
function ccHtmlVenta(venta, resumen, opts = {}) {
  const anulado = venta.estado === "ANULADO";
  let html = '<div class="cc-vinc' + (anulado ? " anulada" : "") + '" data-venta="' + ccEsc(venta.id) + '"><div class="cc-vinc-cuerpo">';
  html += '<div class="cc-vinc-head"><b>' + ccEsc(opts.nombre || venta.id) + "</b>" +
    '<span class="cc-amt">Cobrado: ' + ccEsc(ccCantidad(resumen.suma)) + " USD</span></div>";
  if (venta.nota) html += '<div class="cc-motivo">' + ccEsc(venta.nota) + "</div>";
  /* Salto a cada movimiento del vínculo en 📒 Transacciones. */
  const verMov = reg => reg
    ? ' <button type="button" class="cc-accion cc-ver-mov" data-accion="ver-movimiento" data-clave="' +
      ccEsc(reg.clave) + '">Ver en Transacciones →</button>'
    : "";
  html += '<div class="cc-vinc-ref"><b>Venta:</b> ' +
    (resumen.salida
      ? ccHtmlRegCorto(resumen.salida) + (resumen.salida.inmueble ? " · 🏠 " + ccEsc(resumen.salida.inmueble) : "")
      : "falta el movimiento") + verMov(resumen.salida) + "</div>";
  for (const p of resumen.pagos) {
    html += '<div class="cc-vinc-ref pago"><b>Cobro:</b> ' +
      (p.reg ? ccHtmlRegCorto(p.reg) : "falta el movimiento") +
      " · asignado " + ccEsc(ccCantidad(Number(p.asignacion.cantidad_asignada))) +
      verMov(p.reg) + "</div>";
  }
  if (resumen.faltaRegistro) {
    html += '<div class="cc-form-aviso">⚠ Falta algún movimiento: el vínculo no se aplica hasta que vuelva.</div>';
  } else if (opts.noAplicada) {
    /* Guardado pero el motor no lo aplica (p. ej. luego
       llegó dinero en el hash de la venta): la venta no queda cobrada así. */
    html += '<div class="cc-form-aviso">⚠ No se aplica' + (opts.problema ? ": " + ccEsc(ccProblemaEnLlano(opts.problema)) : ".") + "</div>";
  }
  /* «➕ Añadir otro cobro» solo si la salida está en la sesión y el vínculo
     no está anulado. Los botones, en columna a la derecha. */
  html += '</div><div class="cc-vinc-acciones">' +
    (!anulado && resumen.salida
      ? '<button type="button" class="cc-accion" data-accion="abrir-buscador" data-clave="' +
        ccEsc(resumen.salida.clave) + '">➕ Añadir otro cobro</button>'
      : "") +
    (!anulado
      ? '<button type="button" class="cc-accion" data-accion="editar-vinculo" data-venta="' + ccEsc(venta.id) +
        '">✏️ Editar</button>'
      : "") +
    (anulado
      ? ""
      : '<button type="button" class="cc-accion danger" data-accion="anular-vinculo" data-venta="' + ccEsc(venta.id) +
        '">↩ Deshacer</button>') +
    "</div></div>";
  return html;
}

/* Decisiones tomadas en Revisión: las que tienen registro en
   la sesión, más recientes primero. [{ clave, ajuste, reg }] */
function ccDecisionesTomadas(ajustes, registros) {
  const porClave = new Map((registros || []).map(r => [ccClaveAjuste(r.clave), r]));
  return Object.entries(pdEsObjeto(ajustes) ? ajustes : {})
    .filter(([c, a]) => ccEsAjusteDecision(a) && porClave.has(ccClaveAjuste(c)))
    .map(([c, a]) => ({ clave: c, ajuste: a, reg: porClave.get(ccClaveAjuste(c)) }))
    .reverse() // el mismo día, la última decidida arriba (se guardan en orden)
    .sort((x, y) => ccDiaDeNota(y.ajuste.nota).localeCompare(ccDiaDeNota(x.ajuste.nota)));
}
/* El día de la nota «… (AAAA-MM-DD)…» de una decisión o del spam; las
   antiguas sin él, "" (van al final). */
function ccDiaDeNota(nota) {
  const m = /\((\d{4}-\d{2}-\d{2})\)/.exec(nota);
  return m ? m[1] : "";
}
function ccHtmlDecisionTomada(d) {
  return '<div class="cc-vinc cc-decidida" data-clave="' + ccEsc(d.reg.clave) + '"><div class="cc-vinc-cuerpo">' +
    '<div class="cc-vinc-head"><b>' + ccEsc(ccResumenDecision(d.ajuste, d.reg)) + "</b>" +
    "</div>" +
    '<div class="cc-vinc-ref">' + ccHtmlRegCorto(d.reg) + (d.reg.inmueble ? " · 🏠 " + ccEsc(d.reg.inmueble) : "") +
    ' <button type="button" class="cc-accion cc-ver-mov" data-accion="ver-movimiento" data-clave="' + ccEsc(d.reg.clave) +
    '">Ver en Transacciones →</button></div></div>' +
    '<div class="cc-vinc-acciones"><button type="button" class="cc-accion danger" data-accion="deshacer-decision" data-clave="' +
    ccEsc(d.reg.clave) + '">↩ Deshacer</button></div></div>';
}

function renderCcResueltos() {
  const cont = $("ccListaResueltos");
  const count = $("ccResueltosCount");
  if (!cont) return;
  const ventas = ccVentasGuardadas().filter(v => v && v.estado === "CONFIRMADO");
  const registros = ccRegistrosSesion();
  const decisiones = ccDecisionesTomadas(state.cache && state.cache.ajustes_usuario, registros);
  if (count) count.textContent = String(ventas.length + decisiones.length);
  if (!ventas.length && !decisiones.length) {
    cont.innerHTML = '<p class="help">Nada decidido todavía.</p>';
    return;
  }
  const ctx = ccContextoSesion(registros);
  const problemas = (state.informePagos && state.informePagos.problemas) || [];
  cont.innerHTML = decisiones.map(ccHtmlDecisionTomada).join("") +
    ventas.map(v => ccHtmlVenta(v, ccResumenVenta(v, registros), {
      nombre: ccNombreVenta(v, registros),
      noAplicada: ctx.noAplicadas.has(v.id),
      problema: problemas.find(m => ccProblemaDeVenta(m, v.id)) || null,
    })).join("");
}

/* Guardar los ajustes del usuario (una decisión, deshacerla, o los botones
   de js/18): ajuste, guardado, reclasificación y aviso. accionToast es la
   acción opcional del aviso (la usa js/18). */
/* Mientras se guarda, otra pulsación de decidir o deshacer no hace nada
   (un doble clic chocaría con la decisión recién puesta: «Ya tiene un
   ajuste manual»). */
let ccGuardandoAjustes = false;
async function ccGuardarAjustesDecision(nuevos, mensaje, accionToast) {
  state.cache.ajustes_usuario = nuevos;
  ccGuardandoAjustes = true;
  let enDisco;
  try { enDisco = await ccGuardarYReclasificar(); }
  finally { ccGuardandoAjustes = false; }
  if (enDisco === null) return;
  toast(mensaje + (enDisco ? "" : " " + CC_SIN_DISCO), enDisco ? "ok" : "warn", accionToast);
}
async function ccDecidir(clave, id, valor) {
  if (!state.cache) return toast(CC_SIN_CACHE, "warn");
  const reg = ccRegistrosSesion().find(r => r.clave === clave);
  if (!reg) return;
  let nuevos;
  try { nuevos = ccAjustesConDecision(state.cache.ajustes_usuario, reg, id, valor, ahoraLocalISO()); }
  catch (e) { return toast(e.message, "error"); }
  ccDecisionAbierta = null;
  await ccGuardarAjustesDecision(nuevos, "Decidido. Está en «Movimientos ya decididos».");
  // Una compra externa: su fila de 💶, lista para poner lo pagado (js/20).
  if (id === "compra" && typeof cbIrACompra === "function") cbIrACompra(clave);
}
function ccAplicarDecisionAbierta() {
  return ccDecidir(ccDecisionAbierta.clave, ccDecisionAbierta.id, ccDecisionAbierta.valor);
}
function ccCerrarDecisionAbierta() {
  ccDecisionAbierta = null;
  ccRenderSeguro();
}
async function ccDeshacerDecision(clave) {
  if (!state.cache) return toast(CC_SIN_CACHE, "warn");
  if (ccGuardandoAjustes) return;
  let nuevos;
  try { nuevos = ccAjustesSinDecision(state.cache.ajustes_usuario, clave, ahoraLocalISO()); }
  catch (e) { return toast(e.message, "error"); }
  await ccGuardarAjustesDecision(nuevos, "Decisión deshecha.");
}
/* Pulsar una opción: las que piden importe abren su formulario (otra
   pulsación lo cierra); las demás se guardan al momento (se deshacen en
   «Movimientos ya decididos»). */
function ccPulsarDecision(clave, id) {
  if (ccGuardandoAjustes) return;
  const registros = ccRegistrosSesion();
  const reg = registros.find(r => r.clave === clave);
  if (!reg) return;
  const ctx = ccContextoSesion(registros);
  const op = ccOpcionesDecision(reg, ctx).find(o => o.id === id);
  if (!op) return;
  if (id === "inmueble") return pnCambiarEstadoCatalogo(normalizarDireccion(reg.contrato), "CONFIRMADA"); // js/11
  if (!op.pide) return ccDecidir(clave, id, null);
  if (ccDecisionAbierta && ccDecisionAbierta.clave === clave && ccDecisionAbierta.id === id) ccDecisionAbierta = null;
  else {
    const previo = id === "dinero" && ccEsNumeroPositivo(reg.cantidad) ? String(reg.cantidad).replace(".", ",") :
      id === "venta" && ccEsNumeroPositivo(reg.importe_usdt) ? String(reg.importe_usdt).replace(".", ",") : "";
    ccDecisionAbierta = { clave, id, valor: previo };
  }
  ccRenderSeguro();
  const input = document.querySelector('#ccLista .cc-dec-valor[data-clave="' + (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(clave) : clave) + '"]');
  if (input) { input.focus(); input.select(); }
}

/* Saltos entre los movimientos de un vínculo (también los usa js/18).
   - ccIrAVinculo: abre 🔍 Revisión, despliega «Movimientos ya decididos» y resalta un
     momento el vínculo. Devuelve false si el vínculo no está.
   - ccIrAMovimiento: enseña el registro en 📒 Transacciones (lo hace js/18). */
function ccIrAVinculo(ventaId) {
  if (!ccVentasGuardadas().some(v => v && v.id === ventaId && v.estado === "CONFIRMADO")) return false;
  if (location.hash !== "#revision") location.hash = "#revision";
  /* El cambio de pestaña repinta la vista: se resalta después. */
  setTimeout(() => {
    const det = $("ccResueltos");
    if (det) det.open = true;
    const cards = document.querySelectorAll("#ccListaResueltos .cc-vinc");
    const card = [...cards].find(c => c.getAttribute("data-venta") === ventaId);
    if (!card) return;
    card.scrollIntoView({ block: "center" });
    card.classList.add("cc-destacada");
    setTimeout(() => card.classList.remove("cc-destacada"), 2500);
  }, 80);
  return true;
}
function ccIrAMovimiento(clave) {
  return typeof txMostrarMovimiento === "function" ? txMostrarMovimiento(clave) : false;
}

/* Anular, con guardado y reclasificación: el vínculo deja de verse y la
   venta vuelve a la lista de Revisión. */
async function ccAnularVinculo(id) {
  const ventas = ccVentasGuardadas();
  const v = ventas.find(x => x && x.id === id);
  if (!v || v.estado !== "CONFIRMADO") return;
  const nuevas = ccAnularVenta(ventas, id);
  state.cache.pagos_diferidos = Object.assign({}, state.cache.pagos_diferidos, { ventas: nuevas });
  const enDisco = await ccGuardarYReclasificar();
  if (enDisco === null) return;
  toast("Vínculo deshecho." + (enDisco ? "" : " " + CC_SIN_DISCO),
    enDisco ? "ok" : "warn");
}

/* ----------------------------- Estilos (inyectados una vez) -----------------------------
   Completan los estilos cc-* de index.html. Solo variables de color del
   tema: el modo oscuro (body.dark) funciona sin repintar. js/18 también los
   inyecta (burbujas ⓘ). */
function ccInyectarEstilos() {
  if (typeof document === "undefined" || $("estiloCorrecciones15")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloCorrecciones15";
  estilo.textContent = [
    "#ccLista .cc-cab{font-size:14px;color:var(--muted);background:var(--tarjeta);border:1px solid var(--border);border-radius:10px;padding:8px 12px;line-height:1.7}",
    "#ccLista .cc-cab b{color:var(--text)}",
    "#ccLista .cc-cab a{color:var(--accent);font-weight:600;text-decoration:none}",
    "#ccLista .cc-cab a:hover{text-decoration:underline}",
    "#ccLista .cc-dudas{color:var(--warn);font-weight:600;background:var(--warn-bg);border-color:var(--warn-bd)}",
    /* Hash como enlace, igual en toda la app. */
    ".cc-hash-enlace{color:var(--accent);font-size:13.5px;text-decoration:none;white-space:nowrap}",
    ".cc-hash-enlace:hover{text-decoration:underline}",
    ".cc-sin-hash{color:var(--faint);font-size:13.5px}",
    /* Tarjeta venta ↔ pagos del formulario. */
    ".cc-par{display:grid;grid-template-columns:minmax(0,1fr) 56px minmax(0,1fr);gap:0;background:var(--panel2);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-top:12px}",
    ".cc-par-col{min-width:0}",
    ".cc-par-label{margin:0 0 6px;font-size:12.5px;font-weight:800;letter-spacing:.12em;color:var(--muted)}",
    ".cc-par-amt{margin:0;font-size:20px;font-weight:750;letter-spacing:-.4px;font-variant-numeric:tabular-nums;color:var(--text)}",
    ".cc-par-sub{margin:3px 0 0;font-size:14px;color:var(--muted)}",
    ".cc-par-fecha{margin:6px 0 0;font-size:14px;color:var(--muted);font-variant-numeric:tabular-nums}",
    ".cc-par-hash{display:inline-flex;align-items:center;gap:5px;margin-top:6px;color:var(--accent);font:12.5px/1.5 Consolas,monospace;text-decoration:none;border-bottom:1px dotted var(--accent)}",
    ".cc-par-hash:hover{border-bottom-style:solid}",
    ".cc-par-hash.sin{color:var(--faint);border-bottom:none}",
    ".cc-par-con{display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--muted)}",
    /* Columna derecha: cada pago por separado. */
    ".cc-par-pagos{min-width:0;display:flex;flex-direction:column;gap:10px}",
    ".cc-par-pago{border:1px solid var(--border);border-radius:10px;background:var(--panel);padding:10px 12px;display:flex;flex-direction:column;gap:2px}",
    ".cc-par-pago.previo{opacity:.8;border-style:dashed}",
    ".cc-par-pago .cc-par-amt{font-size:16px}",
    ".cc-par-cant-label{display:block;margin-top:8px;font-size:13px;font-weight:700;color:var(--muted)}",
    ".cc-par-pago input{margin-top:4px}",
    "@media(max-width:800px){.cc-par{grid-template-columns:1fr;gap:12px}.cc-par-con{justify-self:start}}",
    "#ccLista .cc-item{border-left-color:var(--border2)}",
    "#ccLista .cc-item.pend{border-left-color:var(--warn)}",
    "#ccLista .cc-sym{font-weight:600;font-size:19px;line-height:1.1}",
    "#ccLista .cc-tok{font-weight:400;font-size:13.5px;color:var(--muted);margin-left:2px}",
    "#ccLista .cc-cand{display:inline-flex;align-items:center;gap:4px;font-size:13px;font-weight:700;padding:2px 9px;border-radius:999px;border:1px solid var(--accent);color:var(--accent)}",
    "#ccLista .cc-cand.cobro{border-color:var(--info);color:var(--info)}",
    /* Marca «🔗 vinculada» con el id de la venta. */
    "#ccLista .cc-vinculada{display:inline-flex;align-items:center;gap:4px;min-height:0;font-size:13px;font-weight:700;padding:2px 9px;border-radius:999px;border:1px solid var(--ok-bd);background:var(--ok-bg);color:var(--ok);cursor:pointer}",
    "#ccLista .cc-vinculada:hover{border-color:var(--ok)}",
    /* Salto a Transacciones y vínculo resaltado al llegar desde allí. */
    "#ccListaResueltos .cc-ver-mov{min-height:0;padding:1px 8px;font-size:13px;margin-left:6px}",
    "#ccListaResueltos .cc-vinc.cc-destacada{outline:2px solid var(--accent);outline-offset:2px}",
    /* Burbuja de información ⓘ: visible al pasar el ratón y con el teclado
       (:focus). */
    ".cc-info{position:relative;display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;flex:0 0 auto;margin-left:5px;border-radius:50%;background:var(--chip);border:1px solid var(--border);color:var(--muted);font-size:11px;line-height:1;font-weight:700;cursor:help;vertical-align:middle}",
    ".cc-info:hover,.cc-info:focus{color:var(--accent);border-color:var(--accent)}",
    ".cc-info:focus{outline:2px solid var(--accent);outline-offset:1px}",
    ".cc-info .cc-burbuja{display:none;position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);width:max-content;max-width:min(340px,72vw);background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:8px 11px;font-size:12.5px;font-weight:400;line-height:1.55;z-index:400;text-align:left;white-space:normal;cursor:auto}",
    ".cc-info:hover .cc-burbuja,.cc-info:focus .cc-burbuja,.cc-info:focus-within .cc-burbuja{display:block}",
    /* «ⓘ Qué es cada cosa»: arriba a la derecha de la tarjeta; abre su ventana. */
    ".card:has(>.cc-que-es){position:relative}",
    ".card>.cc-que-es{position:absolute;top:30px;right:22px;display:inline-flex;align-items:center;gap:5px;font:inherit;font-size:13.5px;font-weight:600;color:var(--muted);background:none;border:0;padding:0;min-height:0;box-shadow:none;cursor:pointer}",
    // En 🔍, pegado arriba al bajar (la página es larga): a la derecha del
    // título y, fijo, con fondo y borde verdes para verse sobre las tarjetas.
    "#view-revision>.card>.cc-que-es{position:sticky;top:calc(var(--alto-topbar,0px) + 10px);float:right;margin:-57px -8px 0 0;z-index:12;padding:5px 12px;border-radius:999px;color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,var(--panel));border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);box-shadow:var(--shadow)}",
    ".cc-que-es .cc-info{margin:0;cursor:pointer}",
    ".cc-que-es:hover,.cc-que-es:focus-visible{color:var(--accent)}",
    ".cc-que-es:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}",
    ".cc-que-es-dlg p{font-size:14px;line-height:1.55;margin:0 0 10px}",
    "@media print{.card>.cc-que-es{display:none}}",
    "#ccLista .cc-cat{margin-left:auto;display:inline-flex;align-items:center;font-size:13.5px;font-weight:700;color:var(--muted)}",
    /* La ⓘ de la nota va en el borde derecho: su burbuja se abre hacia dentro. */
    "#ccLista .cc-cat .cc-burbuja{left:auto;right:-6px;transform:none}",
    "#ccLista .cc-meta{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;color:var(--muted);margin-top:5px}",
    "#ccLista .cc-hash{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:6px;font-size:14px;color:var(--muted)}",
    /* Botón de la card y diálogos (buscador y formulario). */
    "#ccLista .cc-acciones{margin-top:8px}",
    "#ccLista .cc-accion{font-size:13.5px;padding:7px 12px;border-radius:9px}",
    ".cc-dlg-overlay{position:fixed;inset:0;z-index:300;background:color-mix(in srgb, var(--console) 62%, transparent);display:flex;align-items:flex-start;justify-content:center;padding:4vh 16px;overflow:auto}",
    ".cc-dlg{background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);width:min(780px,100%);padding:18px 20px;color:var(--text)}",
    ".cc-dlg-head{display:flex;align-items:center;gap:10px}",
    ".cc-dlg-head h3{font-size:14px;font-weight:800;margin:0}",
    ".cc-dlg-cerrar{margin-left:auto;min-height:34px;padding:4px 11px}",
    /* Cerrar y cancelar en rojo pálido (se entiende que cierran). */
    ".cc-dlg .cc-dlg-cerrar,.cc-dlg .cc-dlg-cancelar{background:var(--err-bg);border:1.5px solid var(--err-bd);color:var(--err);font-weight:700}",
    ".cc-dlg-buscador{width:min(1100px,100%);padding:26px 28px}",
    ".cc-dlg-salida{font-size:14px;color:var(--text);background:var(--chip);border:1px solid var(--accent);border-radius:12px;padding:14px 18px;margin-top:12px;display:flex;flex-wrap:wrap;gap:6px 14px;align-items:baseline}",
    ".cc-dlg-salida-lbl{font-size:18px;font-weight:800;margin-right:4px}",
    ".cc-dlg-coste{color:var(--muted);font-weight:700}",
    ".cc-dlg-busqueda{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px}",
    ".cc-dlg-busqueda .wide{grid-column:1/-1}",
    "@media(max-width:800px){.cc-dlg-busqueda{grid-template-columns:1fr 1fr}}",
    ".cc-dlg-nota{font-size:13.5px;color:var(--text);margin-top:22px}",
    ".cc-dlg-cab{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}",
    ".cc-dlg-cab h4{margin:0;font-size:15px;color:var(--muted)}",
    ".cc-dlg-cab .cc-accion{margin-left:8px}",
    ".cc-dlg-btn-info{background:var(--info-bd);border:1.5px solid var(--info);color:var(--info);font-weight:700;padding:7px 14px;border-radius:8px}",
    ".cc-dlg-instr{margin:4px 0}",
    ".cc-dlg-leyenda{display:grid;grid-template-columns:auto 1fr;gap:2px 8px;margin:6px 0 4px;color:var(--muted)}",
    ".cc-dlg-leyenda b{grid-row:span 2;color:var(--muted)}",
    ".cc-dlg-leyenda span{grid-column:2}",
    ".cc-dlg-leyenda .cc-dlg-ya{justify-self:start;margin-top:3px;padding:2px 9px;border-radius:6px;background:var(--resalte);color:var(--text);font-weight:700}",
    ".cc-dlg-resultados{display:flex;flex-direction:column;gap:10px;margin-top:14px;max-height:46vh;overflow:auto}",
    /* Filas en columnas alineadas (en pantallas estrechas, seguidas). */
    ".cc-dlg-item{display:grid;grid-template-columns:124px 168px 60px 214px minmax(150px,1fr) 118px 52px 50px;align-items:center;gap:10px;border:1px solid var(--border);border-radius:12px;padding:16px;font-size:13.5px;background:var(--panel2);margin:0;color:var(--text)}",
    "@media (max-width:1100px){.cc-dlg-item{display:flex;flex-wrap:wrap}}",
    ".cc-dlg-item.elegida{border-color:var(--accent);background:var(--chip)}",
    ".cc-dlg-item .cc-elegir{margin-left:auto;width:44px;height:38px;padding:0;font-size:20px;line-height:1;border-radius:9px;display:flex;align-items:center;justify-content:center}",
    ".cc-dlg-item.elegida .cc-elegir{border-color:var(--accent);color:var(--accent);font-weight:700}",
    ".cc-dlg-amt{font-weight:700;font-size:15.5px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".cc-dlg-fecha{font-size:14.5px;font-weight:600;white-space:nowrap}",
    ".cc-dlg-dir{color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    /* Desfase en días y precio por token de cada fila del buscador. */
    ".cc-dlg-encaja{white-space:nowrap;cursor:help;font-size:17px}",
    ".cc-dlg-desfase{color:var(--muted);font-weight:600;font-size:13.5px;font-variant-numeric:tabular-nums;white-space:nowrap;text-align:center}",
    ".cc-dlg-desfase:not(:empty){background:var(--chip);border-radius:999px;padding:3px 8px}",
    ".cc-dlg-precio{color:var(--muted);font-size:14.5px;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".cc-dlg-precio.ok{color:var(--accent)}",
    ".cc-dlg-foot{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:14px}",
    ".cc-dlg-foot .row{margin-left:auto}",
    /* Formulario. */
    ".cc-form{width:min(880px,100%)}",
    ".cc-form-campos{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:12px}",
    ".cc-form-campos .wide{grid-column:1/-1}",
    "@media(max-width:800px){.cc-form-campos{grid-template-columns:1fr 1fr}}",
    ".cc-form-efectos{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--panel2);padding:10px 12px;font-size:13.5px;color:var(--text);display:flex;flex-direction:column;gap:8px}",
    ".cc-form-aviso{color:var(--warn)}",
    ".cc-form-error{color:var(--err);font-weight:600}",
    ".cc-form-ok{color:var(--ok)}",
    ".cc-form-estado{font-weight:700}",
    ".cc-form-estado.ok{color:var(--ok)}",
    ".cc-form-estado.mal{color:var(--err)}",
    /* Botón «➕ Añadir otro» del formulario. */
    ".cc-form-confirmar-otro{border-color:var(--accent);color:var(--accent);font-weight:600}",
    ".cc-form-confirmar-otro:hover{background:var(--chip)}",
    ".cc-form-previa{margin-top:10px;font-size:14px;color:var(--info);background:var(--info-bg);border:1px solid var(--info-bd);border-radius:10px;padding:7px 11px}",
    /* Vínculos de «Movimientos ya decididos». */
    "#ccListaResueltos .cc-vinc{background:var(--tarjeta);border:1px solid var(--btn-bd);box-shadow:var(--tarj-sombra);border-left:5px solid var(--ok);border-radius:12px;padding:10px 13px;display:flex;gap:14px;align-items:flex-start}",
    "#ccListaResueltos .cc-decidida{align-items:center}",
    "#ccListaResueltos .cc-vinc-cuerpo{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}",
    "#ccListaResueltos .cc-vinc.anulada{border-left-color:var(--err);opacity:.85}",
    "#ccListaResueltos .cc-vinc-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    "#ccListaResueltos .cc-vinc-head b{font-size:14px}",
    "#ccListaResueltos .cc-tag.anul{background:var(--err-bg);border-color:var(--err-bd);color:var(--err)}",
    "#ccListaResueltos .cc-vinc-ref{font-size:14px;color:var(--muted)}",
    "#ccListaResueltos .cc-vinc-ref b{color:var(--text);font-size:13px;text-transform:uppercase;letter-spacing:.04em}",
    "#ccListaResueltos .cc-vinc-ref.pago{padding-left:14px;border-left:2px solid var(--border2)}",
    "#ccListaResueltos .cc-vinc-acciones{display:flex;flex-direction:column;gap:5px;flex:0 0 auto;padding-left:12px;border-left:1px solid var(--border)}",
    "#ccListaResueltos .cc-vinc-acciones .cc-accion{min-height:28px;font-size:12.5px;padding:3px 10px;border-radius:8px;text-align:left}",
    /* Botones de decisión de cada tarjeta, la etiqueta «Sugerida» y el
       formulario corto del importe. */
    "#ccLista .cc-decision{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}",
    "#ccLista .cc-decision.help{display:block}",
    "#ccLista .cc-dec.sugerida{border-color:var(--accent);color:var(--text);font-weight:600}",
    "#ccLista .cc-dec.abierta{outline:2px solid var(--accent);outline-offset:1px}",
    ".cc-sugerida{display:inline-block;margin-left:6px;padding:0 7px;border-radius:999px;font-size:12px;font-weight:700;background:var(--ok-bg);color:var(--ok);border:1px solid var(--ok-bd)}",
    "#ccLista .cc-dec-form{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px;padding:8px 10px;background:var(--tarjeta);border:1px solid var(--border);border-radius:10px;font-size:14px}",
    "#ccLista .cc-dec-form input{width:130px;margin:0 4px;font-size:14px;padding:5px 8px}",
    "#ccListaResueltos .cc-decidida{border-left-color:var(--info)}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Eventos (una vez) ----------------------------- */

function ccMontarEventos() {
  const lista = $("ccLista");
  if (lista && !lista.__ccEventos) {
    lista.__ccEventos = true;
    /* Botones de la lista y de «Movimientos ya decididos». */
    const alPulsar = e => {
      const btn = ccBotonDe(e, "[data-accion]");
      if (!btn) return;
      const accion = btn.getAttribute("data-accion");
      const id = btn.getAttribute("data-venta");
      if (accion === "abrir-buscador") ccAbrirBuscador(btn.getAttribute("data-clave"), btn);
      else if (accion === "anular-vinculo") ccAnularVinculo(id);
      else if (accion === "editar-vinculo") ccAbrirFormularioEdicion(id, btn);
      else if (accion === "ver-vinculo") ccIrAVinculo(id);
      else if (accion === "ver-movimiento") ccIrAMovimiento(btn.getAttribute("data-clave"));
      else if (accion === "decidir") ccPulsarDecision(btn.getAttribute("data-clave"), btn.getAttribute("data-opcion"));
      else if (accion === "decidir-aplicar" && ccDecisionAbierta) ccAplicarDecisionAbierta();
      else if (accion === "decidir-cerrar") ccCerrarDecisionAbierta();
      else if (accion === "deshacer-decision") ccDeshacerDecision(btn.getAttribute("data-clave"));
    };
    /* El importe que se escribe: se recuerda (sobrevive a un repintado) y
       actualiza el ≈ € sin repintar; Intro guarda y Escape cancela. */
    lista.addEventListener("input", e => {
      if (!ccDecisionAbierta || !e.target.classList || !e.target.classList.contains("cc-dec-valor")) return;
      ccDecisionAbierta.valor = e.target.value;
      const reg = ccRegistrosSesion().find(r => r.clave === ccDecisionAbierta.clave);
      const eur = reg ? ccEurOrientativo(ccLeerImporte(String(e.target.value)),
        reg.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache) : null;
      const caja = e.target.closest(".cc-dec-form");
      const span = caja && caja.querySelector(".cc-dec-eur");
      if (span && ccDecisionAbierta.id !== "compra") span.textContent = ccTextoEurOrientativo(eur);
    });
    lista.addEventListener("keydown", e => {
      if (!ccDecisionAbierta || !e.target.classList || !e.target.classList.contains("cc-dec-valor")) return;
      if (e.key === "Enter") { e.preventDefault(); ccAplicarDecisionAbierta(); }
      else if (e.key === "Escape") { e.preventDefault(); ccCerrarDecisionAbierta(); }
    });
    lista.addEventListener("click", alPulsar);
    const resueltos = $("ccListaResueltos");
    if (resueltos) resueltos.addEventListener("click", alPulsar);
  }
}

/* Baja a un bloque de 🔍 y lo abre: los avisos con [data-ir] (tokens con
   dudas y «Todavía hay N por decidir») y «Ir al catálogo» de 🚀. */
function ccIrABloque(id) {
  const el = $(id);
  if (!el) return;
  if (el.tagName === "DETAILS") el.open = true;
  // El foco va con él: con el teclado, Tab sigue desde el bloque.
  (el.querySelector(":scope>summary") || el).focus({ preventScroll: true });
  el.scrollIntoView();
}
function ccPulsarIrA(e) {
  const b = e.target.closest("[data-ir]");
  if (!b || !$(b.dataset.ir)) return;
  e.preventDefault();
  ccIrABloque(b.dataset.ir);
}

/* ----------------------------- Enganches -----------------------------
   Como js/16: envoltorios que AÑADEN el repintado detrás de las funciones
   globales que avisan de cambios de datos (cargar, crear o guardar la cache
   vía renderPanel y actualizarChipEstado; clasificar vía
   ejecutarClasificacion), más hashchange al volver a #revision (cubre los
   cambios de wallet o vault hechos en ⚙️ Config). Si la función original
   lanza, el error se propaga igual. */
(function montarHooksCorrecciones() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function envolver(nombre) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__ccEnvuelta) return;
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      ccRenderSeguro();
      return resultado;
    };
    envoltura.__ccEnvuelta = true;
    window[nombre] = envoltura;
  }
  ["renderPanel", "actualizarChipEstado", "ejecutarClasificacion"].forEach(envolver);

  window.addEventListener("hashchange", () => {
    const hash = (location.hash || "#dashboard").slice(1);
    if (hash === "revision" || !document.getElementById("view-" + hash)) ccRenderSeguro();
  });

  ccMontarEventos();
  const vista = $("view-revision");
  if (vista) vista.addEventListener("click", ccPulsarIrA);
  document.querySelectorAll("[data-que-es]").forEach(e => { e.outerHTML = ccHtmlQueEs(); });
  document.querySelectorAll(".cc-que-es").forEach(b => b.addEventListener("click", () => ccAbrirQueEs(b)));
  ccRenderSeguro(); // el DOM ya existe: los scripts van al final del <body>
})();
