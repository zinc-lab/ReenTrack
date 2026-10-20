/* =====================================================================
   REENTAL SPA · js/23-fiscal-pestana.js
   La pestaña 🧾 Fiscal. Pinta lo que dan el motor fiscal (js/21) y el
   informe para la Renta (js/22): aquí no se calcula ninguna cifra fiscal.

   Qué se ve: (1) el resumen
   del ejercicio, con selector de año y «A declarar en»; (2) las ventas del
   año, cada una desplegable con los lotes que gastó; (3) el historial de
   cada activo hasta el 31/12 de ese año; (4) los avisos que afectan a la
   Renta, con enlace a 🔍 Revisión solo si allí están.

   Cómo se llama al motor (cabecera de motorFiscal, js/21): una sola pasada
   sobre una copia nueva de los registros clasificados, con objetos de
   opciones nuevos, y solo si esa clasificación terminó bien con la
   wallet y el vault de ahora (si no, «clasifica primero»).

   Hasta qué día llegan los datos: la fecha que apunta js/09 al
   sincronizar o, si es más tarde, la de la última transacción descargada
   (la cache pudo sincronizarse después por otra vía). Sin fecha apuntada,
   el informe toma el último movimiento y se pide sincronizar. Un intento
   fallido después de uno bueno no la cambia.

   Usa ccEsc (js/15), arrHuellaConfig y arr (js/19), que cargan antes.
   ===================================================================== */

// Lo que la pestaña recuerda entre repintados.
const fiEstado = {
  anio: null,        // ejercicio elegido (null: el último terminado)
  cache: null,       // la cache del año elegido (otra cache: vuelve al último terminado)
  vista: null,       // { registros, huella }: la última clasificación que terminó bien
  errorClasificacion: false,   // la última clasificación dio un error
  memo: null,        // { clave, resultado }: el último cálculo
  pintar: false,     // un repintado ya pedido para cuando acabe lo que se está haciendo
  verTodos: false,   // el historial, también con los activos que ya no tienes
  desgloses: new Set(),   // las filas del historial con sus lotes a la vista
};

/* Importe en euros a la española; «—» si no hay importe. Con signo, un
   cero sale sin él («0,00 €», no «+0,00 €»). */
function fiEur(x, signo = false) {
  if (typeof x !== "number" || !Number.isFinite(x)) return "—";
  return numEs(x, 2, signo && /[1-9]/.test(toFixedPython(Math.abs(x), 2))) + " €";
}

/* Map clave -> [elementos], en el orden en que aparecen. */
function fiAgrupar(lista, claveDe) {
  const grupos = new Map();
  for (const x of lista) {
    const k = claveDe(x);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(x);
  }
  return grupos;
}

/* Tabla de la pestaña: cabeceras [texto, esCifra] y las filas ya hechas;
   en una caja con su propio scroll de lado (en el móvil no cabe). */
function fiTabla(cabeceras, filas) {
  return '<div class="fi-tablawrap"><table class="tabla-libro fi-tabla"><thead><tr>' +
    cabeceras.map(([t, num]) => "<th" + (num ? ' class="num"' : "") + ">" + t + "</th>").join("") +
    "</tr></thead><tbody>" + filas + "</tbody></table></div>";
}
const fiCelda = (v, num) => "<td" + (num ? ' class="num"' : "") + ">" + v + "</td>";
const fiInfo = texto => ' <span class="fi-info" tabindex="0" role="note" title="' + ccEsc(texto) + '">ⓘ</span>';

/* ----------------------------- Hasta dónde llegan los datos ----------------------------- */
/* { hoy, descargaIncompleta, sincronizada, ultimoFallo, diaReal }.
   sincronizada: la fecha que apuntó js/09 (null si no la hay o es
   posterior al día de hoy: una cache escrita a mano o un reloj mal).
   hoy: la más tardía entre esa fecha y la última transacción descargada
   (las del archivo de Reental no: no dicen nada de la blockchain);
   null sin fecha apuntada. ultimoFallo: el último intento de sincronizar
   falló; con una buena antes, los datos siguen completos hasta ella.
   diaReal: 'AAAA-MM-DD' de hoy (en España); va también en lo que devuelve: sin
   fecha apuntada, el informe no deja que una fecha posterior lo mueva. */
function fiHastaCuando(cache, diaReal = hoyEspana()) {
  const s = esObjetoCache(cache && cache.ultima_sincronizacion) ? cache.ultima_sincronizacion : {};
  const fecha = fiscFechaValida(s.fecha) ? s.fecha.slice(0, 10) : null;
  const sincronizada = fecha && fecha <= diaReal ? fecha : null;
  const ultimoFallo = s.etherscan_fallo === true;
  if (!sincronizada) return { hoy: null, descargaIncompleta: ultimoFallo, sincronizada, ultimoFallo, diaReal };
  let hoy = sincronizada;
  const transacciones = esObjetoCache(cache.transacciones) ? cache.transacciones : {};
  for (const serie of Object.values(transacciones)) {
    for (const tx of Array.isArray(serie) ? serie : []) {
      const f = tx && fechaDeTx(tx);
      if (f && f > hoy && f <= diaReal) hoy = f;
    }
  }
  return { hoy, descargaIncompleta: false, sincronizada, ultimoFallo, diaReal };
}

/* Un intento de sincronizar fallido después de uno bueno: lo dicen
   esta pestaña y el informe imprimible (js/27). */
function fiTextoFalloSincronizacion(hasta) {
  return "El último intento de sincronizar falló: datos completos hasta el " + fechaEs(hasta.sincronizada) + ".";
}
/* Lo mismo para el papel (el informe imprimible, js/27, y las hojas
   «Fiscal AAAA» del Excel, js/26), o "". hasta: el de
   fiHastaCuando; sin él, nada. */
function fiAvisoSincronizacion(hasta) {
  if (!hasta) return "";
  if (!hasta.sincronizada) return "Sin fecha de la última sincronización: puede que falten los movimientos más recientes.";
  return hasta.ultimoFallo ? fiTextoFalloSincronizacion(hasta) : "";
}

/* ----------------------------- Cálculo ----------------------------- */
/* Por qué no se puede calcular ahora (texto para la pantalla), o "". */
function fiMotivoSinCalculo() {
  if ((state.sync && state.sync.running) || (typeof arr !== "undefined" && arr.preparando)) {
    return "Actualizando: un momento.";
  }
  if (!state.cache || !Array.isArray(state.registros) || !state.registros.length) {
    return "Sin datos todavía: completa 🚀 Puesta en marcha.";
  }
  if (fiEstado.errorClasificacion) {
    return "Algo falló al preparar tus datos: míralo en el registro técnico de 🚀 Puesta en marcha.";
  }
  const v = fiEstado.vista;
  if (!v || v.registros !== state.registros || v.huella !== arrHuellaConfig(state.config)) {
    return "Revisa tus datos en 🚀 Puesta en marcha.";
  }
  const cfg = state.config || {};
  if (direccionesCambiadas(state.cache, cfg.wallet, cfg.vault).length) {
    return "Las transacciones guardadas son de otra dirección: pulsa 🔄 Actualizar en 🚀 Puesta en marcha.";
  }
  return "";
}

/* La clave con que el informe pone el aviso de un registro a revisar
   (rentaAvisos de js/22: fecha, concepto y nota). */
function fiClaveAviso(fecha, concepto, detalle) { return [fecha, concepto, detalle].join("\u0000"); }

/* Una pasada del motor y el informe, con los lotes que se abrieron
   (crearLote de js/21 se envuelve solo durante la pasada, sin cambiar lo
   que hace: cada lote con la cantidad con que nació y, si es de un canje,
   las compras de las que viene; sigue vivo si está en las colas del
   final). Si un lote de las colas no se vio nacer, se para: mejor un
   error que una tabla de lotes incompleta.
   eventos: cada lote que nace (los de lotes, entra: true) y cada salida
   de una cola (consumirFifo, también envuelta: lo pedido, los trozos y lo
   que sacó de cada lote, agotado si salió de la cola), en el orden del
   motor y con el registro que lo movió (fiscEnCurso; el de un cobro que
   llega días después, el que le pasa fiscAbrirLote).
   avisosRevisar: clave del aviso -> claves de los registros que lo dan.
   operaciones: clave del registro -> lo que vale la operación entera,
   con las mismas cuentas que el total del informe.
   registros, colas y resumen: los de la pasada, para el Excel
   (excelLibro de js/26 solo los lee); apartado y cuadre, para el cuadre
   con la blockchain (js/28: con los saldos de lectura, la de
   cuadreVigente; sin ella, cuadre null). */
function fiCalcular(registros, cache, config, hasta, lectura = null) {
  const regs = structuredClone(registros);
  const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {}, apartado: {} };
  const eventos = [];
  const originales = { crearLote, consumirFifo, fiscAbrirLote };
  let abriendo = null;
  globalThis.fiscAbrirLote = function (r) {
    const antes = abriendo;
    abriendo = r;
    try { return originales.fiscAbrirLote.apply(this, arguments); } finally { abriendo = antes; }
  };
  globalThis.crearLote = function (colas, activo, cantidad) {
    const lote = originales.crearLote.apply(this, arguments);
    if (lote) {
      eventos.push({ entra: true, activo, inicial: cantidad, lote, registro: abriendo || fiscEnCurso,
        procedencia: lote.procedencia ? lote.procedencia.map(p => ({ ...p })) : null });
    }
    return lote;
  };
  globalThis.consumirFifo = function (colas, activo, cantidad) {
    // FIFO: solo se gasta la cabeza de la cola (hasta reunir lo pedido, y uno más
    // por los decimales); los que salen de ella son los primeros.
    const cola = colas.get(activo) || [];
    let k = 0;
    for (let suma = 0; k < cola.length && suma < cantidad; k++) suma += cola[k].cantidad;
    const antes = cola.slice(0, k + 1).map(l => [l, l.cantidad]), largo = cola.length;
    const res = originales.consumirFifo.apply(this, arguments);
    const fuera = largo - (colas.get(activo) || []).length;
    eventos.push({ entra: false, activo, pedido: cantidad, trozos: res[2], registro: fiscEnCurso,
      sacado: antes.map(([l, n], i) => ({ lote: l, n: n - l.cantidad, agotado: i < fuera })).filter(s => s.n || s.agotado) });
    return res;
  };
  let colas;
  try {
    colas = motorFiscal(regs, cache, config, op);
  } finally {
    Object.assign(globalThis, originales);
  }
  const lotes = eventos.filter(e => e.entra);
  const vivos = new Set([...(colas || new Map()).values()].flat());
  const vistos = new Set(lotes.map(x => x.lote));
  if ([...vivos].some(l => !vistos.has(l))) throw new Error("no se pudieron leer los lotes del motor");
  for (const x of lotes) x.vivo = vivos.has(x.lote);
  const resumen = resumenFiscalAnual(regs);
  const informes = informesRentaAnuales(regs, resumen, config,
    { ...op, cache, hoy: hasta.hoy, dia_real: hasta.diaReal, descarga_incompleta: hasta.descargaIncompleta });
  // Con los saldos leídos al actualizar (js/28), sus avisos.
  const cuadre = lectura ? cuadreDeLaPasada(colas, op.apartado, cache, lectura) : null;
  if (cuadre) cuadreAvisar(informes, cuadre, cuadre.fecha, regs.filter(r => pyVerdad(r.revisar)).length);
  const avisosRevisar = new Map([...fiAgrupar(regs.filter(r => r.revisar && r.fecha),
    r => fiClaveAviso(r.fecha.slice(0, 10), rentaConceptoAviso(r), pyO(r.nota, "")))]
    .map(([k, rs]) => [k, rs.map(r => r.clave)]));
  const operaciones = new Map(regs.filter(r => fiscHay(r.coste_fifo_eur)).map(r => {
    const transmision = rentaEur2(pyO(r.importe_eur, 0)), adquisicion = rentaEur2(r.coste_fifo_eur);
    return [r.clave, { transmision, adquisicion, gp: rentaEur2(transmision - adquisicion) }];
  }));
  return { informes, avisosRevisar, operaciones, lotes, eventos, nombres: rentaNombresInmuebles(regs, cache), hasta,
    registros: regs, colas, resumen, apartado: op.apartado, cuadre };
}

/* El cálculo de ahora, reutilizado mientras no cambie nada de lo que lee
   (los envoltorios de abajo lo borran cuando la cache pudo cambiar). La
   config va por su contenido: el formulario la cambia por dentro y el
   informe saldría con el titular o el NIF de antes. Un cálculo que
   falla también se guarda: se vuelve a lanzar su error sin repetirlo en
   cada repintado de 📤 Exportar. */
function fiResultado() {
  const hasta = fiHastaCuando(state.cache);
  const lectura = typeof cuadreVigente === "function" ? cuadreVigente() : null;
  const clave = [state.registros, state.cache, JSON.stringify(state.config ?? null), JSON.stringify(hasta), lectura];
  const m = fiEstado.memo;
  if (m && m.clave.every((x, i) => x === clave[i])) {
    if (m.error) throw m.error;
    return m.resultado;
  }
  let resultado;
  try {
    resultado = fiCalcular(state.registros, state.cache, state.config, hasta, lectura);
  } catch (e) {
    fiEstado.memo = { clave, error: e };
    throw e;
  }
  fiEstado.memo = { clave, resultado };
  return resultado;
}

/* Elige el ejercicio a enseñar con la cache de ahora (si no, al entrar
   con otra cache vuelve al último terminado). */
function fiElegirAnio(anio) { fiEstado.anio = anio; fiEstado.cache = state.cache; }

/* Años de los informes, en orden. */
function fiAnios(informes) { return Object.keys(informes).map(Number).sort((a, b) => a - b); }

/* Ejercicio a enseñar: el elegido si existe; si no, el último terminado
   (el que se declara) o, si ninguno lo está, el último. */
function fiAnioElegido(informes, anios, elegido) {
  if (!anios.length) return null;
  if (anios.includes(elegido)) return elegido;
  const terminados = anios.filter(a => informes[a].cabecera.anio_terminado);
  return (terminados.length ? terminados : anios).at(-1);
}

/* ----------------------------- Textos del informe ----------------------------- */
/* Textos del informe que en esta pestaña se dicen de otra forma:
   «sincronizar», USD como moneda, sin la cifra de «pendiente: …» (no es
   una cifra que enseñar) y sin remitir a apartados del PDF que esta
   pestaña no tiene. */
function fiTextoInforme(t) {
  const s = fechasEnTextoEs(String(t || ""))
    .replace(/vuelve a ejecutar el programa/g, "vuelve a sincronizar")
    .replace(/\) USDT\b/g, ") USD")
    .replace(/(^|; )pendiente: [^;]*; se declaran igual en el ano del reparto(; )?/g, (m, antes, despues) => antes && despues ? "; " : "")
    .replace(/figuran en el punto 3/g, "están en «Ganancias y pérdidas patrimoniales»")
    .replace(/véase el apartado IV/g, "mira los avisos")
    .replace(/ del apartado II/g, " del informe");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ----------------------------- (1) Resumen ----------------------------- */
/* «A declarar en» de cada fila que lo lleva (los grupos de Patrimonio y gas
   son informativos: no llevan). */
function fiDeclararEn(informe, clave) {
  const d = informe.detalle;
  const tabla = {
    rend_neto: d.rendimientos, gp_inmuebles: d.ventas_inmuebles, gp_permutas: d.permutas,
    gp_otros_elementos: d.otros_elementos, gp_sin_transmision: d.ganancias_sin_transmision,
  }[clave];
  return tabla?.a_declarar_en || "";
}
// Las ganancias o pérdidas llevan su signo; los valores, no.
const FI_CON_SIGNO = new Set(["gp_inmuebles", "gp_permutas", "gp_otros_elementos", "gp_total"]);

/* Sin «qué tipo de rendimiento son» (la app facilita, no hace de guía
   fiscal; rendimientos del capital mobiliario, base del ahorro, y basta). */

function fiFilaResumen(f, etiqueta, informe) {
  const importe = f.unidad === "EUR" ? fiEur(f.importe, FI_CON_SIGNO.has(f.clave))
    : (typeof f.importe === "number" ? cantidadEs(f.importe) + " " + ccEsc(f.unidad) : "—");
  const declarar = fiDeclararEn(informe, f.clave);
  return '<div class="fi-fila' + (f.total ? " total" : "") + '" data-clave="' + ccEsc(f.clave) + '"><span class="k">' +
    ccEsc(etiqueta) + (f.nota ? fiInfo(fiTextoInforme(f.nota)) : "") + '</span><span class="v">' + importe + "</span></div>" +
    (declarar ? '<div class="fi-declarar">A declarar en: ' + ccEsc(declarar) + "</div>" : "");
}

function fiHtmlResumen(informe) {
  const porClave = Object.fromEntries(informe.resumen.map(f => [f.clave, f]));
  const valor = clave => porClave[clave] ? porClave[clave].importe : null;
  const c = informe.cabecera;
  const metricas = [
    ["Total íntegro", fiEur(valor("rend_integro"))],
    ["Retenciones", fiEur(valor("rend_retenciones"))],
    ["Ganancias y pérdidas", fiEur(valor("gp_total"), true)],
    [c.anio_terminado ? "Capital al 31/12" : "Capital a " + fechaEs(informe.inversiones_activas.fecha_corte), fiEur(valor("capital_final"))],
  ].map(([k, v]) => '<div class="fi-metrica"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>").join("");
  // Rendimientos y ganancias primero: es lo que va a la Renta.
  const orden = n => ({ 2: 0, 3: 1, 1: 2, 4: 3 })[n.charAt(0)] ?? 4;
  const grupos = [...fiAgrupar(informe.resumen, f => f.grupo)].sort(([a], [b]) => orden(a) - orden(b));
  const tarjetas = grupos.map(([nombre, filas], i) => {
    // Cada fila del grupo 3 es «Subgrupo: fila»: el subgrupo sale una vez.
    let html = "", subgrupo = null;
    for (const f of filas) {
      const partes = f.concepto.split(": ");
      const sub = partes.length > 1 ? partes[0] : null;
      if (sub && sub !== subgrupo) html += '<div class="fi-subgrupo">' + ccEsc(sub) + "</div>";
      subgrupo = sub;
      html += fiFilaResumen(f, sub ? pyCapitalizar(partes.slice(1).join(": ")) : f.concepto, informe);
    }
    return '<div class="fi-tarjeta" style="order:' + i + '"><h3>' + ccEsc(nombre.replace(/^\d+\.\s*/, "")) + "</h3>" + html + "</div>";
  });
  // Dos columnas que crecen por separado (con filas, una tarjeta corta dejaba
  // debajo el hueco de la larga de al lado); en el móvil, una, en su orden.
  const columna = c => '<div class="fi-col">' + tarjetas.filter((_, i) => i % 2 === c).join("") + "</div>";
  return '<div class="fi-metricas">' + metricas + '</div><div class="fi-rejilla">' + columna(0) + columna(1) + "</div>";
}

/* ----------------------------- (2) Ventas del año ----------------------------- */
/* Las filas del detalle (una por fecha de compra y moneda) juntas por
   operación. Lo que vale la operación entera sale de su registro, con las
   cuentas del total del informe (operaciones de fiCalcular), no de sumar
   filas ya redondeadas. Un pago con dos monedas no suma sus
   cantidades. */
function fiOperaciones(tabla, operaciones = new Map()) {
  return [...fiAgrupar((tabla && tabla.filas) || [], f => f.clave)].map(([clave, lotes]) => {
    const activos = [...new Set(lotes.map(l => l.activo))];
    const cantidades = lotes.map(l => l.cantidad);
    const suma = campo => lotes.some(l => typeof l[campo] !== "number") ? null : rentaEur2(pySuma(lotes.map(l => l[campo])));
    const r = operaciones.get(clave);
    return { clave, fecha: lotes[0].fecha_transmision, activo: activos.join("/"), operacion: lotes[0].operacion, lotes,
      cantidad: activos.length === 1 && cantidades.every(fiscEsNumero) ? pySuma(cantidades) : null,
      adquisicion: r ? r.adquisicion : suma("valor_adquisicion_eur"),
      transmision: r ? r.transmision : suma("valor_transmision_eur"),
      gp: r ? r.gp : suma("gp_eur") };
  });
}

/* El pie «** Incluye compras…» (como el PDF), si alguna
   fila lleva el coste de por defecto. */
function fiPieSupuesto(filas) {
  return filas.some(l => l.supuesto) ? '<p class="fi-pie">' + ccEsc(NOTA_COSTE_SUPUESTO) + "</p>" : "";
}

function fiHtmlOperaciones(tabla, titulo, unidad, operaciones) {
  const ops = fiOperaciones(tabla, operaciones);
  if (!ops.length) return "";
  const varias = ops.some(op => op.activo.includes("/"));
  // En las permutas cada fila es una parte de la moneda entregada, por la
  // fecha en que te llegó (no una compra de tokens).
  const permuta = unidad === null;
  const cabeceras = [[permuta ? "Recibido el" : "Comprado el"], ...(varias ? [["Moneda"]] : []), ["Cantidad", 1], ["Valor de adquisición", 1],
    ["Valor de transmisión", 1], ["Ganancia o pérdida", 1]];
  const filas = ops.map(op => {
    const lotes = op.lotes.map(l => "<tr>" + fiCelda(ccEsc(fechaEs(l.fecha_adquisicion)) + (l.adquirido_por_canje ? " *" : "")) +
      (varias ? fiCelda(ccEsc(l.activo)) : "") + fiCelda(cantidadEs(l.cantidad), 1) + fiCelda(fiEur(l.valor_adquisicion_eur) + (l.coste_supuesto === true ? " **" : ""), 1) +
      fiCelda(fiEur(l.valor_transmision_eur), 1) + fiCelda(fiEur(l.gp_eur, true), 1) + "</tr>").join("");
    const canje = (op.lotes.some(l => l.adquirido_por_canje) ? '<p class="fi-pie">* ' + ccEsc(NOTA_CANJE_INFORME.replace(/^\*\s*/, "")) + "</p>" : "") +
      fiPieSupuesto(op.lotes.map(l => ({ supuesto: l.coste_supuesto === true })));
    const nombre = op.operacion === "Venta" ? op.activo : op.operacion + " (" + op.activo + ")";
    const explica = !permuta ? "" : '<p class="fi-pie">' + (op.cantidad === null
      ? "Cada fila, una parte de lo que entregaste por la fecha en que te llegó."
      : (/^Pago/.test(op.operacion) ? "Pagaste " : "Entregaste ") + numEs(op.cantidad, 2) + " " + ccEsc(op.activo) +
        ". Cada fila, una parte de esos " + ccEsc(op.activo) + " por la fecha en que te llegaron.") + "</p>";
    return '<details class="fi-op" data-abierto="op:' + ccEsc(op.clave) + '"><summary><span class="fi-op-f">' + ccEsc(fechaEs(op.fecha)) +
      '</span><span class="fi-op-n">' + ccEsc(nombre) + '</span><span class="fi-op-c">' +
      (op.cantidad === null ? "" : cantidadEs(op.cantidad) + " " + ccEsc(unidad || op.activo)) + '</span><span class="fi-op-gp">' +
      fiCeldaEur(op.gp, true) + "</span></summary>" + explica + fiTabla(cabeceras, lotes) + canje + "</details>";
  }).join("");
  return '<div class="fi-subgrupo">' + ccEsc(titulo) + " (" + ops.length + ")</div>" + filas;
}

function fiHtmlVentas(informe, operaciones) {
  const d = informe.detalle;
  const html = fiHtmlOperaciones(d.ventas_inmuebles, "Tokens de inmuebles", "tokens", operaciones) +
    fiHtmlOperaciones(d.permutas, "Permutas: pagos con monedas virtuales y cambios entre ellas", null, operaciones);
  return html ? '<p class="help">Una fila por fecha de compra.' + fiInfo(NOTA_CENTIMOS) + "</p>" + html
    : '<p class="help">Sin ventas ni permutas este año.</p>';
}

/* ----------------------------- (3) Historial de cada activo ----------------------------- */
/* Como el extracto de un bróker: por activo y en orden, cada compra o
   cobro (abre lote) y cada venta, pago o comisión (gasta lotes), hasta el
   31/12 del ejercicio elegido. Las cifras son las del motor (eventos y
   registros de fiCalcular): aquí solo se reparten y se suman. */
// Las monedas (ACTIVOS_NO_INMUEBLE de js/22), en el orden de la pantalla.
const FI_MONEDAS = ["RNT", "POL", "USDT", "USDC"];
const fiStable = nombre => nombre === "USDT" || nombre === "USDC";
const FI_AVISO = '<a href="#fiAvisos" class="fi-ir-avisos" title="A revisar: mira los avisos">⚠️</a>';
const FI_ENTRADA = { COMPRA: "Compra", COMPRA_BANCO: "Compra externa", CANJE: "Canje", POOL: "Pool (vuelve)",
  VENTA_P2P: "Cobro de venta", LIQUIDACION: "Cobro de venta" };

/* Lo que queda de un lote al corte (sus salidas hasta entonces). */
function fiQueda(x, salidas) {
  const ss = salidas.get(x.lote) || [];
  return ss.some(s => s.agotado) ? 0 : x.inicial - pySuma(ss.map(s => s.n));
}

/* Nombre del lote de procedencia en el desglose de una venta: su compra
   («Compra del 21/03/2024»; las del mismo día y origen, juntas, como en
   el informe) o, los rendimientos y las recompensas, su mes. */
function fiPieza(p, stable) {
  if (p.origen === "RENDIMIENTO") return { clave: "rend:" + String(p.fecha).slice(0, 7), texto: "Rendimientos de " + mesEs(String(p.fecha).slice(0, 7)) };
  if (p.origen === "REWARD") return { clave: "rew:" + String(p.fecha).slice(0, 7), texto: "Recompensas DeFi de " + mesEs(String(p.fecha).slice(0, 7)) };
  const nombre = { DEPOSITO: "Ingreso", SWAP: stable ? "Cambio" : "Compra" }[p.origen] || FI_ENTRADA[p.origen] || p.origen;
  return { clave: String(p.fecha).slice(0, 10) + "\u0000" + p.origen, texto: nombre + " del " + fechaEs(p.fecha) };
}

// Una fila que junta las de un mes.
const fiPorMes = f => f.tipo === "rend" || f.tipo === "rew" || f.tipo === "gas";

/* Qué operación es una fila. */
function fiOperacion(f, nombre, nombres) {
  const r = f.r, n = f.registros.size, stable = fiStable(nombre);
  if (f.tipo === "canje") return "Canje";
  if (f.tipo === "rend") return "Rendimientos · " + n + (n === 1 ? " cobro" : " cobros");
  if (f.tipo === "rew") return "Recompensas DeFi · " + n;
  if (f.tipo === "gas") return "Comisiones de red (gas) · " + n;
  const deQue = () => {
    const inm = rentaInmuebleDe(r, nombres), a = nombreActivoFifo(r.contrato);
    return inm ? " · " + inm : FI_MONEDAS.includes(a) && a !== nombre ? " · " + a : "";
  };
  if (f.sale.length) {
    if (r.categoria === "VENTA") return r.subcategoria === "GPP_INMUEBLE" ? "Venta" : "Permuta";
    if (r.categoria === "COMPRA") return "Pago" + deQue();
    if (r.categoria === "RETIRADA") return stable ? "Salida de dinero" : "Salida";
    return r.categoria === "MOVIMIENTO" ? "Pool (aportado)" : TX_OPERACIONES[r.subcategoria] || r.categoria;
  }
  const origen = f.entra.length ? f.entra[0].lote.origen
    : ["DEPOSITO", "REWARD", "RENDIMIENTO"].includes(r.categoria) ? r.categoria
      : r.via_compra === "BANCARIA" ? "COMPRA_BANCO" : r.via_compra === "CANJE" ? "CANJE" : "COMPRA";
  if (origen === "DEPOSITO") return stable ? "Ingreso de dinero" : "Ingreso";
  if (origen === "REWARD") return r.subcategoria === "GPP_REGALO" ? "Regalo recibido" : "Recompensa DeFi";
  if (origen === "RENDIMIENTO") return "Rendimiento";
  if (origen === "SWAP") return stable ? "Cambio" : "Compra";
  return (FI_ENTRADA[origen] || origen) + (origen === "VENTA_P2P" || origen === "LIQUIDACION" ? deQue() : "");
}

/* USD de lo que vale una fila: lo que dice el registro; el de una compra
   externa, el pagado en USD que pusiste en 💶; sin él, o si el valor se
   puso en € (coste o cobro a mano), null («—»). Si no, el valor en € al
   tipo del BCE del día (con el que se pasó a €). */
function fiUsd(r, eur, parte, cache) {
  if (fiscEsNumero(r.importe_usdt)) return r.importe_usdt * parte;
  if (r.via_compra === "BANCARIA") {
    const a = ccBuscarAjuste(cache && cache.ajustes_usuario, r.clave);
    const u = a && ccPagadoUsd(a.ajuste, (cache && cache.tipos_bce) || {}, cache);
    return u ? u.importe * parte : null;
  }
  return fiscHay(r.cobrado_eur) || fiscHay(r.coste_eur) ? null : rentaAUsd(r, eur);
}

/* Las cifras de una fila: tokens (con signo), total, comisión, coste de
   compra, ganancia o pérdida (null: no hay; undefined: falta, ⚠️), lo que
   queda de sus lotes, precios y el desglose por lotes de una venta. */
function fiCifrasFila(f, nombre, ctx) {
  const r = f.r, falta = v => (fiscHay(v) ? v : r && r.revisar ? undefined : null);
  const entra = pySuma(f.entra.map(x => x.inicial)), sale = pySuma(f.sale.map(e => e.pedido));
  const c = { tokens: entra - sale, total: null, comision: null, coste: null, gp: null, quedan: null, usd: null, piezas: [],
    // Lo que salió sin lote del que salir (el motor lo da sin coste): «Tienes» baja de más.
    sinLote: sale - pySuma(f.sale.flatMap(e => e.sacado.map(s => s.n))) };
  const costeLotes = pySuma(f.entra.map(x => x.inicial * x.lote.coste_unitario_eur));
  const quedaDe = x => ctx.queda.get(x.lote) + (ctx.heredado.get(nombre + "\u0000" + x.lote.fecha + "\u0000" + x.lote.origen) || 0);
  if (f.tipo === "canje") {
    for (const e of f.sale) c.piezas.push(...fiPiezasDe(e.trozos, false));
    return c;
  }
  if (f.tipo === "gas") {
    c.coste = pySuma([...f.registros].map(g => pyO(g.coste_fifo_eur, 0)));
    return c;
  }
  if (f.entra.length) {
    // La comisión de una compra va en el coste de sus lotes: aparte, su parte.
    const parte = r && ctx.entradas.get(r) ? entra / ctx.entradas.get(r) : 1;
    c.comision = r && r.categoria === "COMPRA" && pyVerdad(r.gas_eur) ? r.gas_eur * parte : null;
    // Un lote sin precio (RNT a la espera del suyo, en 💶): su valor no se sabe.
    c.total = f.entra.some(x => x.lote.sin_coste) ? undefined : costeLotes - (c.comision || 0);
    c.quedan = pySuma(f.entra.map(quedaDe));
    // Rendimientos y lo que vuelve de un pool: el USD de sus lotes (sin comisión).
    c.usd = fiPorMes(f) || r.categoria === "MOVIMIENTO"
      ? pySuma(f.entra.map(x => fiscHay(x.lote.coste_unitario_usd) ? x.inicial * x.lote.coste_unitario_usd : NaN))
      : fiUsd(r, c.total, parte, ctx.cache);
    if (!Number.isFinite(c.usd)) c.usd = null;
    c.supuesto = f.entra.some(x => x.lote.coste_supuesto === true);
    return c;
  }
  // Venta, pago, salida: la parte de este activo en lo que movió el
  // registro. Lo aportado a un pool, solo su coste (su resultado va
  // aparte en el Resumen).
  const coste = pySuma(f.sale.flatMap(e => e.trozos.map(t => t.coste_eur)));
  if (r.categoria === "MOVIMIENTO") return Object.assign(c, { coste });
  const parte = ctx.salidasDe.get(r) ? sale / ctx.salidasDe.get(r) : 1;
  const esPago = r.categoria === "COMPRA";
  c.total = !fiscHay(r.importe_eur) ? falta(null) : (r.importe_eur + (esPago ? 0 : pyO(r.gas_eur, 0))) * parte;
  c.comision = !esPago && pyVerdad(r.gas_eur) ? r.gas_eur * parte : null;
  c.coste = fiscHay(r.coste_fifo_eur) ? coste : falta(null);
  c.gp = !fiscHay(r.gp_eur) ? falta(null) : parte === 1 ? r.gp_eur : c.total - (c.comision || 0) - c.coste;
  c.usd = fiscHay(c.total) ? fiUsd(r, c.total, parte, ctx.cache) : null;
  // El desglose, solo si el motor guardó de qué lotes sale.
  if (pyVerdad(r.lotes_consumidos)) c.piezas = fiPiezasDe(f.sale.flatMap(e => e.trozos), fiStable(nombre));
  return c;
}

/* Las compras de las que salen unos trozos de lote, juntas por compra
   (la del canje, la original), en orden. */
function fiPiezasDe(trozos, stable) {
  const piezas = new Map();
  for (const t of trozos) {
    for (const p of pyO(t.procedencia, [t])) {
      const { clave, texto } = fiPieza(p, stable);
      const parte = pyVerdad(t.cantidad) ? p.cantidad / t.cantidad : 0;
      const x = piezas.get(clave) || { texto, n: 0, coste: 0 };
      x.n += p.cantidad;
      x.coste += t.coste_eur * parte;
      piezas.set(clave, x);
    }
  }
  return [...piezas.values()];
}

/* El historial hasta el 31/12 de anio: [{ nombre, moneda, filas, quedan,
   costeQueda, gp, gpAnio, avisos, abierto }], los inmuebles por nombre (el
   contrato viejo y el nuevo de un canje juntos) y después RNT, POL, USDT y
   USDC. Cada fila: { tipo (r, rend, rew, gas, canje, revisar), fecha, r,
   registros, entra, sale, cifras, tienes }. Abierto: le queda algún lote vivo. */
function fiHistorial(resultado, anio, cache = null) {
  const corte = anio + "-12-31 23:59:59", nombres = resultado.nombres;
  const nombreDe = a => nombres.get(a) ?? (FI_MONEDAS.includes(a) ? a : null);
  const fechaDe = e => (e.entra ? e.lote.fecha : e.registro && e.registro.fecha);
  const eventos = (resultado.eventos || []).filter(e => { const f = fechaDe(e); return fiscFechaValida(f) && f <= corte; });
  const ctx = { salidas: new Map(), queda: new Map(), heredado: new Map(), entradas: new Map(), salidasDe: new Map(), cache };
  for (const e of eventos) {
    if (e.entra) {
      if (e.registro && e.lote.origen !== "CANJE") ctx.entradas.set(e.registro, (ctx.entradas.get(e.registro) || 0) + e.inicial);
    } else {
      for (const s of e.sacado) fiscListaDe(ctx.salidas, s.lote).push(s);
      if (e.registro) ctx.salidasDe.set(e.registro, (ctx.salidasDe.get(e.registro) || 0) + e.pedido);
    }
  }
  for (const x of eventos) if (x.entra) ctx.queda.set(x.lote, fiQueda(x, ctx.salidas));
  // Lo que queda de una compra pasada por un canje sigue siendo suyo.
  // ponytail: por fecha y origen de la compra (como el informe); dos del mismo instante y origen se lo repartirían.
  for (const x of eventos) {
    if (!x.entra || !x.procedencia) continue;
    const total = pySuma(x.procedencia.map(p => p.cantidad)), queda = ctx.queda.get(x.lote);
    for (const p of x.procedencia) {
      const k = nombreDe(x.activo) + "\u0000" + p.fecha + "\u0000" + p.origen;
      ctx.heredado.set(k, (ctx.heredado.get(k) || 0) + (total ? queda * p.cantidad / total : 0));
    }
  }
  const activos = new Map();
  const filaDe = (nombre, clave, tipo, fecha, r) => {
    if (!activos.has(nombre)) activos.set(nombre, { nombre, moneda: FI_MONEDAS.includes(nombre), filas: new Map() });
    const a = activos.get(nombre);
    if (!a.filas.has(clave)) a.filas.set(clave, { clave, tipo, fecha, r, registros: new Set(), entra: [], sale: [] });
    return a;
  };
  const esCanje = r => r && ((r.categoria === "COMPRA" && r.via_compra === "CANJE") || (r.categoria === "VENTA" && pyVerdad(r.canje)));
  for (const e of eventos) {
    const nombre = nombreDe(e.activo), r = e.registro;
    if (nombre === null) continue;
    const f = fechaDe(e);
    let clave = "r:" + (r ? r.clave : "?") + (e.entra ? ":+" : ":-"), tipo = "r";
    // Lo pequeño y repetido, por mes: rendimientos, recompensas DeFi (no los regalos) y gas.
    if (e.entra && e.lote.origen === "RENDIMIENTO") [clave, tipo] = ["rend:" + f.slice(0, 7), "rend"];
    else if (e.entra && e.lote.origen === "REWARD" && r && r.subcategoria !== "GPP_REGALO") [clave, tipo] = ["rew:" + f.slice(0, 7), "rew"];
    else if (!e.entra && r && r.categoria === "COMISION") [clave, tipo] = ["gas:" + f.slice(0, 7), "gas"];
    else if (esCanje(r)) [clave, tipo] = ["canje:" + r.hash, "canje"];
    const a = filaDe(nombre, clave, tipo, f, r);
    const fila = a.filas.get(clave);
    if (r) fila.registros.add(r);
    (e.entra ? fila.entra : fila.sale).push(e);
  }
  // Las entradas a revisar que no abrieron lote: salen, pero no cuentan.
  const conEntrada = new Set((resultado.eventos || []).filter(e => e.entra && e.registro).map(e => e.registro));
  for (const r of resultado.registros || []) {
    if (!pyVerdad(r.revisar) || !fiscFechaValida(r.fecha) || r.fecha > corte || conEntrada.has(r)) continue;
    let activo = null;
    if (r.categoria === "RENDIMIENTO") activo = STABLECOINS.has(r.contrato) ? nombreActivoFifo(r.contrato) : "USDT";
    else if (r.categoria === "DEPOSITO" || r.categoria === "REWARD") activo = nombreActivoFifo(r.contrato);
    else if (r.categoria === "COMPRA" && !(STABLECOINS.has(r.contrato) && fiscHay(r.via_compra) && r.via_compra !== "BANCARIA")) {
      activo = r.via_compra === "CANJE" ? r.contrato : nombreActivoFifo(r.contrato);
    }
    const nombre = activo && nombreDe(activo);
    if (nombre) filaDe(nombre, "rev:" + r.clave, "revisar", r.fecha, r).filas.get("rev:" + r.clave).registros.add(r);
  }
  const lista = [...activos.values()].map(a => {
    // En orden de fecha, por el instante como el motor (la hora repetida de
    // octubre); con la misma, el del motor.
    for (const f of a.filas.values()) f.orden = fechaParaOrdenar({ fecha: f.fecha, instante: f.r && f.r.fecha === f.fecha ? f.r.instante : undefined });
    const filas = [...a.filas.values()].sort((x, y) => cmpTexto(x.orden, y.orden));
    let tienes = 0;
    for (const f of filas) {
      f.cifras = f.tipo === "revisar" ? null : fiCifrasFila(f, a.nombre, ctx);
      if (f.cifras) tienes += f.cifras.tokens;
      f.tienes = tienes;
      f.aviso = [...f.registros].some(r => pyVerdad(r.revisar));
    }
    const vivos = filas.flatMap(f => f.entra).filter(x => ctx.queda.get(x.lote) > 0);
    const gps = filas.filter(f => f.cifras && typeof f.cifras.gp === "number");
    // gp y gpAnio, null sin ventas ni permutas (hasta el corte o ese año).
    const suma = fs => (fs.length ? pySuma(fs.map(f => f.cifras.gp)) : null);
    return { nombre: a.nombre, moneda: a.moneda, filas,
      quedan: pySuma(vivos.map(x => ctx.queda.get(x.lote))),
      costeQueda: vivos.some(x => x.lote.sin_coste) ? undefined : pySuma(vivos.map(x => ctx.queda.get(x.lote) * x.lote.coste_unitario_eur)),
      gp: suma(gps), gpAnio: suma(gps.filter(f => f.fecha.slice(0, 4) === String(anio))),
      avisos: filas.filter(f => f.aviso).length, abierto: vivos.length > 0 };
  });
  const orden = a => (a.moneda ? 1 + FI_MONEDAS.indexOf(a.nombre) : 0);
  return lista.sort((a, b) => orden(a) - orden(b) || cmpTexto(String(a.nombre).toLowerCase(), String(b.nombre).toLowerCase()));
}

/* Ganancia o pérdida de anio de los registros de un grupo, con las
   cuentas del Resumen (rentaTablaTransmisiones: sumas redondeadas y
   restadas): sin canjes ni pools, que el Resumen pone aparte. */
function fiGpDelGrupo(activos, anio) {
  const regs = new Set();
  for (const a of activos) {
    for (const f of a.filas) {
      if (f.tipo !== "r" || f.entra.length || !f.sale.length || f.fecha.slice(0, 4) !== String(anio)) continue;
      for (const r of f.registros) if (fiscHay(r.gp_eur) && !rentaEsCanje(r) && !rentaEsResultadoPool(r)) regs.add(r);
    }
  }
  return rentaEur2(rentaEur2(pySuma([...regs].map(r => pyO(r.importe_eur, 0)))) -
    rentaEur2(pySuma([...regs].map(r => pyO(r.coste_fifo_eur, 0)))));
}

/* Lo que queda de cada inmueble frente a las inversiones activas del
   último informe: si no cuadra (una fecha mal escrita o sin fecha deja
   lotes fuera del informe), se dice. Con todos los lotes del motor. */
function fiLotesCuadran(lotes, nombres, informe) {
  const enInforme = new Map(), quedan = new Map();
  for (const f of ((informe.inversiones_activas || {}).inmuebles || {}).filas || []) {
    enInforme.set(f.nombre, (enInforme.get(f.nombre) || 0) + f.cantidad);
  }
  for (const x of lotes) {
    if (nombres.has(x.activo)) quedan.set(nombres.get(x.activo), (quedan.get(nombres.get(x.activo)) || 0) + (x.vivo ? x.lote.cantidad : 0));
  }
  return [...new Set([...enInforme.keys(), ...quedan.keys()])]
    .every(n => Math.abs((enInforme.get(n) || 0) - (quedan.get(n) || 0)) < 1e-6);
}

/* Cifras de una celda: «⚠️» si falta (con enlace a los avisos, o el aviso
   que se le pase), «» si no hay, y la ganancia o pérdida con su color. */
function fiCeldaEur(v, signo = false, aviso = FI_AVISO) {
  if (v === undefined) return aviso;
  if (v === null) return "";
  const t = fiEur(v, signo);
  return signo && /[1-9]/.test(t) ? '<span class="' + (v < 0 ? "fi-neg" : "fi-pos") + '">' + t + "</span>" : t;
}
// Precio por token, con los decimales de los precios de la app (ccDecimalesPrecio).
const fiPrecio = (v, n, unidad) => {
  const x = fiscEsNumero(v) && n ? Math.abs(v / n) : NaN;
  return Number.isFinite(x) ? numEs(x, ccDecimalesPrecio(x)) + " " + unidad : "";
};

const FI_COLUMNAS = [["Fecha"], ["Operación"], ["Tokens", 1], ["Tienes", 1], ["Precio USD", 1], ["Precio EUR", 1],
  ["Total EUR", 1], ["Comisión", 1], ["Coste de compra", 1], ["G/P", 1], ["Quedan", 1]];

/* Una fila de la tabla con solo algunas columnas ({posición en FI_COLUMNAS: contenido}). */
const fiFilaH = (attrs, celdas) => "<tr " + attrs + ">" + FI_COLUMNAS.map(([, num], i) => fiCelda(celdas[i] ?? "", num)).join("") + "</tr>";

/* La tabla de un activo: una fila por operación (rendimientos y gas, por
   mes), el botón «▸ n lotes» en una venta y la fila Total. */
function fiTablaHistorial(a, abiertos, nombres, anio) {
  let html = "";
  for (const f of a.filas) {
    // La clave va en un atributo: sin \u0000 (el navegador lo cambia).
    const c = f.cifras, id = a.nombre + "::" + f.clave, abierto = abiertos.has(id);
    // La hora, debajo de la fecha (ocupa menos de ancho).
    const conHora = fechaEs(f.fecha, true).split(" ");
    const fecha = fiPorMes(f) ? mesEs(f.fecha.slice(0, 7))
      : ccEsc(conHora[0]) + (conHora[1] ? '<span class="fi-h-hora">' + conHora[1] + "</span>" : "");
    const titulo = fiPorMes(f) ? "" : fechaDosHoras(f.fecha, f.r && f.r.instante);
    const otros = f.tipo === "rend" ? [...f.registros].filter(r => String(r.fecha).slice(0, 7) !== f.fecha.slice(0, 7)) : [];
    const nota = f.tipo === "revisar" ? "No cuenta hasta revisarla"
      : otros.length ? "Incluye " + otros.length + (otros.length === 1 ? " reparto del " : " repartos del ") + otros.map(r => fechaEs(r.fecha)).join(", ") : "";
    const clase = f.tipo === "canje" ? "canje" : fiPorMes(f) ? "grupo"
      : f.tipo === "revisar" || (c && c.tokens >= 0) ? "entra" : "sale";
    const n = c ? c.piezas.length : 0;
    // El aviso de una fila de otro año no está en los de este: sin enlace, con su año.
    const deOtro = f.fecha.slice(0, 4) !== String(anio);
    const av = deOtro ? '<span class="fi-info" tabindex="0" title="A revisar: su aviso, en los de ' + f.fecha.slice(0, 4) + '">⚠️</span>' : FI_AVISO;
    const boton = n ? ' <button type="button" class="fi-lotes" aria-expanded="' + abierto + '" data-desglose="' + ccEsc(id) + '" data-foco="' + ccEsc("lotes:" + id) + '">' +
      (abierto ? "▾ " : "▸ ") + n + (n === 1 ? " lote" : " lotes") + "</button>" : "";
    const et = '<span class="fi-et fi-et-' + clase + '"' + (nota ? ' title="' + ccEsc(nota) + '" tabindex="0"' : "") + ">" +
      ccEsc(fiOperacion(f, a.nombre, nombres)) + (nota && f.tipo !== "revisar" ? " ⓘ" : "") + "</span>" +
      (f.aviso ? " " + av : "");
    const n0 = c ? c.tokens : pyO(f.r.cantidad, 0), sinLote = c && c.sinLote > 1e-9 * Math.abs(n0 || 1) ? c.sinLote : 0;
    const conSigno = numEs(n0, 6, true, true);
    const tokens = (/[1-9]/.test(conSigno) ? conSigno : "±0") +
      (sinLote ? ' <span class="fi-info" tabindex="0" title="' + cantidadEs(sinLote) + ' sin compra registrada">ⓘ</span>' : "");
    const quedan = c && fiscHay(c.quedan) ? cantidadEs(c.quedan) + " de " + cantidadEs(c.tokens) : "";
    html += '<tr class="fi-h-' + clase + (f.tipo === "revisar" ? " fi-h-nocuenta" : "") + '">' +
      fiCelda(titulo ? '<span title="' + ccEsc(titulo) + '" tabindex="0">' + fecha + "</span>" : fecha) + fiCelda(et + boton) +
      fiCelda(tokens, 1) + fiCelda(f.tipo === "revisar" ? "" : cantidadEs(f.tienes), 1) +
      fiCelda(c ? fiPrecio(c.usd, c.tokens, "$") || (typeof c.total === "number" ? "—" : "") : "", 1) + fiCelda(c && typeof c.total === "number" ? fiPrecio(c.total, c.tokens, "€") : "", 1) +
      fiCelda(c ? fiCeldaEur(c.total, false, av) + (c.supuesto ? " **" : "") : av, 1) + fiCelda(c ? fiCeldaEur(c.comision, false, av) : "", 1) +
      fiCelda(c ? fiCeldaEur(c.coste, false, av) : "", 1) + fiCelda(c ? fiCeldaEur(c.gp, true, av) : "", 1) + fiCelda(quedan, 1) + "</tr>";
    for (const p of n ? c.piezas : []) {
      // Cada lote, con su parte de lo cobrado y de la comisión.
      const parte = c.tokens ? p.n / Math.abs(c.tokens) : 0;
      const total = typeof c.total === "number" ? c.total * parte : null, comision = c.comision === null ? null : c.comision * parte;
      const gp = typeof c.gp === "number" ? total - (comision || 0) - p.coste : null;
      html += fiFilaH('class="fi-h-lote" data-de="' + ccEsc(id) + '"' + (abierto ? "" : " hidden"), { 1: "↳ " + ccEsc(p.texto),
        2: cantidadEs(p.n), 6: fiCeldaEur(total), 7: fiCeldaEur(comision), 8: fiCeldaEur(p.coste), 9: fiCeldaEur(gp, true) });
    }
  }
  html += fiFilaH('class="fi-h-suma"', { 1: "Total", 3: cantidadEs(a.quedan), 8: fiCeldaEur(a.costeQueda), 9: fiCeldaEur(a.gp, true) });
  return fiTabla(FI_COLUMNAS, html) + fiPieSupuesto(a.filas.map(f => ({ supuesto: !!(f.cifras && f.cifras.supuesto) })));
}

/* Una línea de columnas: activo, quedan, coste de lo que queda, ganancia
   o pérdida desde el principio y del año. */
function fiLineaHistorial(clase, celdas) {
  return '<div class="fi-h-linea ' + clase + '">' + celdas.map(c => "<span>" + c + "</span>").join("") + "</div>";
}

function fiHtmlHistorial(resultado, anio, informe, ultimo) {
  const activos = fiHistorial(resultado, anio, state.cache);
  if (!activos.length) return '<p class="help">Sin operaciones hasta el 31/12/' + anio + ".</p>";
  const cerrados = activos.filter(a => !a.abierto).length;
  const c = informe.cabecera;
  const hasta = c.anio_terminado ? "Hasta el 31/12/" + anio : "Hasta el " + fechaEs(c.datos_hasta);
  const interruptor = cerrados ? '<label class="rv-interruptor"><input type="checkbox" role="switch" id="fiVerTodos" data-foco="verTodos"' +
    (fiEstado.verTodos ? " checked" : "") + '><span class="rv-interruptor-pista" aria-hidden="true"></span><span>Ver también los que ya no tienes (' +
    cerrados + ")</span></label>" : "";
  const aviso = ultimo && !fiLotesCuadran(resultado.lotes, resultado.nombres, ultimo)
    ? '<p class="fi-nota-aviso">No cuadran con la cartera del informe de ' + ultimo.ejercicio + ": revisa las fechas de los avisos.</p>" : "";
  // Los nombres de los grupos, los de su bloque del Resumen.
  const titulo = clave => (informe.resumen.find(f => f.clave === clave) || { concepto: "" }).concepto.split(":")[0];
  const grupos = [[titulo("gp_inmuebles"), "Tokens de cada inmueble.", activos.filter(a => !a.moneda)],
    [titulo("gp_permutas"), "RNT, POL, USDT y USDC.", activos.filter(a => a.moneda)]].filter(g => g[2].length);
  const sub = grupos.map(([, , as]) => fiGpDelGrupo(as, anio));
  const total = as => [fiCeldaEur(as.some(a => a.costeQueda === undefined) ? undefined : pySuma(as.map(a => a.costeQueda))),
    fiCeldaEur(pySuma(as.map(a => a.gp || 0)), true)];
  let html = '<p class="help">' + hasta + ", en orden FIFO: al vender salen primero los más antiguos." + interruptor + "</p>" + aviso +
    '<div class="fi-historial' + (fiEstado.verTodos ? " fi-todos" : "") + '">' +
    fiLineaHistorial("fi-h-cab", ["Activo", "Quedan", "Coste de lo que queda", "Ganancia o pérdida (desde el principio)", "Ganancia o pérdida de " + anio]) +
    fiLineaHistorial("fi-h-total", ["Total", "", ...total(activos), fiCeldaEur(pySuma(sub), true)]);
  grupos.forEach(([titulo, nota, as], i) => {
    // Un grupo sin nada que tengas, oculto con ellos.
    html += '<div class="fi-h-grupo' + (as.some(a => a.abierto) ? "" : " fi-h-cerrado") + '">' +
      '<div class="fi-subgrupo">' + ccEsc(titulo) + '</div><p class="fi-pie">' + nota + "</p>" +
      fiLineaHistorial("fi-h-subtotal", ["Total", "", ...total(as), fiCeldaEur(sub[i], true)]) +
      as.map(a => {
        const etiqueta = a.nombre + ": quedan " + cantidadEs(a.quedan) + ", coste de lo que queda " + fiEur(a.costeQueda) +
          (a.gp === null ? "" : ", ganancia o pérdida desde el principio " + fiEur(a.gp, true)) +
          (a.gpAnio === null ? "" : ", de " + anio + " " + fiEur(a.gpAnio, true));
        return '<details class="fi-h-activo' + (a.abierto ? "" : " fi-h-cerrado") + '" data-abierto="historial:' + ccEsc(a.nombre) + '">' +
          '<summary aria-label="' + ccEsc(etiqueta) + '">' +
          fiLineaHistorial("", [ccEsc(a.nombre) + (a.avisos ? ' <span class="fi-h-avisos">⚠️ ' + a.avisos + "</span>" : ""),
            cantidadEs(a.quedan), fiCeldaEur(a.costeQueda), fiCeldaEur(a.gp, true), fiCeldaEur(a.gpAnio, true)]) +
          "</summary>" + fiTablaHistorial(a, fiEstado.desgloses, resultado.nombres, anio) + "</details>";
      }).join("") + "</div>";
  });
  return html + "</div>";
}

/* ----------------------------- (4) Avisos ----------------------------- */
/* Avisos del ejercicio, los que piden revisar primero. El de un registro
   que 🔍 Revisión enseña (lo marcó la clasificación) lleva el enlace; los
   que pone solo el motor, no (allí no están). Si el mismo aviso sale de
   varios registros, solo si todos están en Revisión. */
function fiAvisos(informe, resultado, clasificados) {
  const marcadoAlClasificar = new Set((clasificados || []).filter(r => r && r.revisar).map(r => r.clave));
  return informe.avisos.map(a => {
    const revisar = a.tipo === "revisar";
    const claves = revisar && resultado.avisosRevisar.get(fiClaveAviso(a.fecha, a.concepto, a.detalle));
    return { ...a, revisar, enRevision: !!claves && claves.every(c => marcadoAlClasificar.has(c)) };
  }).sort((a, b) => b.revisar - a.revisar);
}

function fiHtmlAvisos(avisos) {
  if (!avisos.length) return '<p class="help">Ningún aviso este año.</p>';
  return '<ul class="fi-avisos">' + avisos.map(a =>
    '<li class="fi-aviso ' + (a.revisar ? "revisar" : "nota") + '"><b>' +
    (a.revisar ? "⚠️ " : "ℹ️ ") + (a.fecha ? ccEsc(fechaEs(a.fecha)) + " · " : "") + ccEsc(a.concepto) +
    "</b><br>" + ccEsc(fiTextoInforme(a.detalle)) +
    (a.enRevision ? ' <a href="#revision">Ir a 🔍 Revisión</a>' : "") + "</li>").join("") + "</ul>";
}

/* ----------------------------- Pantalla ----------------------------- */
function fiHtmlCabecera(informe, hasta, anios, anio) {
  const botones = anios.map(a => '<button type="button" class="fi-anio" data-anio="' + a + '" data-foco="anio:' + a + '" aria-pressed="' +
    (a === anio) + '">' + a + "</button>").join("");
  const c = informe.cabecera;
  let estado = c.anio_terminado ? "Ejercicio terminado"
    : "En curso, con datos hasta el " + fechaEs(c.datos_hasta);
  if (hasta.sincronizada) estado += " · sincronizado el " + fechaEs(hasta.sincronizada);
  const aviso = !hasta.sincronizada
    ? '<p class="fi-nota-aviso">No sé cuándo se sincronizó por última vez: sincroniza para tener el año al día.</p>'
    : hasta.ultimoFallo ? '<p class="fi-nota-aviso">' + ccEsc(fiTextoFalloSincronizacion(hasta)) + "</p>" : "";
  return '<div class="fi-cabecera"><div class="fi-anios" role="group" aria-label="Ejercicio">' + botones +
    '</div><span class="fi-estado">' + ccEsc(estado) + "</span></div>" + aviso;
}

function fiHtml(resultado, anios, anio, clasificados) {
  const informe = resultado.informes[anio];
  const avisos = fiAvisos(informe, resultado, clasificados);
  const aRevisar = avisos.filter(a => a.revisar).length;
  const seccion = (id, titulo, cuerpo) => '<section class="fi-seccion" id="' + id + '"><h3 class="fi-titulo">' + titulo + "</h3>" + cuerpo + "</section>";
  return fiHtmlCabecera(informe, resultado.hasta, anios, anio) +
    (aRevisar ? '<p class="fi-nota-aviso"><a href="#fiAvisos" class="fi-ir-avisos">⚠️ ' + aRevisar +
      (aRevisar === 1 ? " aviso puede cambiar" : " avisos pueden cambiar") + " estas cifras</a></p>" : "") +
    seccion("fiResumen", "Resumen del ejercicio " + anio, fiHtmlResumen(informe)) +
    seccion("fiVentas", "Ventas y permutas de " + anio, fiHtmlVentas(informe, resultado.operaciones)) +
    seccion("fiHistorial", "Historial de cada activo", fiHtmlHistorial(resultado, anio, informe, resultado.informes[anios.at(-1)])) +
    seccion("fiAvisos", "Avisos de " + anio, fiHtmlAvisos(avisos)) +
    // Descargo genérico, sin casillas ni países.
    '<p class="fi-pie fi-descargo">Ayuda para preparar la declaración, no un documento oficial: confírmalo con un asesor.</p>';
}

/* Repinta sin cerrar lo que estaba desplegado ni perder el foco de lo que
   lo recupera (data-foco: un botón de año, el interruptor, un botón de lotes). */
function fiPintar(cuerpo, html) {
  const abiertos = new Set([...cuerpo.querySelectorAll("details[open][data-abierto]")].map(d => d.dataset.abierto));
  const a = document.activeElement;
  const foco = a && cuerpo.contains(a) && a.dataset ? a.dataset.foco : undefined;
  cuerpo.innerHTML = html;
  for (const d of cuerpo.querySelectorAll("details[data-abierto]")) if (abiertos.has(d.dataset.abierto)) d.open = true;
  if (foco !== undefined) {
    const b = [...cuerpo.querySelectorAll("[data-foco]")].find(x => x.dataset.foco === foco);
    if (b) b.focus();
  }
}

function fiRender() {
  const cuerpo = $("fiCuerpo");
  if (!cuerpo) return;
  fiInyectarEstilos();
  const motivo = fiMotivoSinCalculo();
  if (motivo) {
    cuerpo.innerHTML = '<p class="fi-vacio">' + ccEsc(motivo).replace("🚀 Puesta en marcha", '<a href="#inicio">🚀 Puesta en marcha</a>') + "</p>";
    return;
  }
  let resultado;
  try {
    resultado = fiResultado();
  } catch (e) {
    cuerpo.innerHTML = '<p class="fi-vacio">No se pudo hacer el cálculo fiscal: ' + ccEsc(e.message) + "</p>";
    log("🧾 Fiscal: " + e.message, "error");
    return;
  }
  // Otra cache: vuelve al último ejercicio terminado.
  if (fiEstado.cache !== state.cache) { fiEstado.cache = state.cache; fiEstado.anio = null; }
  const anios = fiAnios(resultado.informes);
  const anio = fiAnioElegido(resultado.informes, anios, fiEstado.anio);
  if (anio === null) { cuerpo.innerHTML = '<p class="fi-vacio">Sin movimientos que declarar.</p>'; return; }
  fiPintar(cuerpo, fiHtml(resultado, anios, anio, state.registros));
}

/* Solo se calcula con la pestaña a la vista (el motor tarda). */
function fiRenderSeguro(forzar) {
  if (!forzar && location.hash !== "#fiscal") return;
  try { fiRender(); } catch (e) { log("🧾 Fiscal: " + e.message, "error"); }
}

/* ----------------------------- Estilos (inyectados una vez) ----------------------------- */
function fiInyectarEstilos() {
  if ($("estiloFiscal23")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloFiscal23";
  estilo.textContent = [
    "#fiCuerpo{color:var(--text)}",
    ".fi-vacio{color:var(--muted);text-align:center;padding:24px 8px}",
    ".fi-cabecera{display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;margin:4px 0 12px}",
    ".fi-anios{display:inline-flex;border:1px solid var(--btn-bd);box-shadow:var(--btn-sombra);border-radius:999px;overflow:hidden}",
    ".fi-anio{box-shadow:none;border:0;border-radius:0;background:transparent;color:var(--muted);font-weight:700;padding:6px 16px;cursor:pointer}",
    ".fi-anio[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}",
    ".fi-estado{color:var(--muted);font-size:14px}",
    ".fi-nota-aviso{color:var(--warn);font-weight:600;margin:0 0 10px}",
    ".fi-nota-aviso a{color:inherit}",
    ".fi-seccion{margin-top:22px}",
    ".fi-titulo{font-size:16px;font-weight:700;margin-bottom:10px}",
    ".fi-metricas{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}",
    ".fi-metrica{background:var(--tarjeta);border:1px solid var(--border);border-radius:12px;padding:10px 15px;flex:1 1 150px}",
    ".fi-metrica .k{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}",
    ".fi-metrica .v{font-size:18px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".fi-rejilla{display:flex;gap:14px;align-items:flex-start}",
    ".fi-col{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:14px}",
    "@media(max-width:900px){.fi-rejilla{flex-direction:column;align-items:stretch}.fi-col{display:contents}}",
    /* Las tarjetas del resumen resaltan sobre el blanco: borde más marcado
       y el título con una línea verde. */
    ".fi-tarjeta{background:var(--tarjeta);border:1px solid var(--btn-bd);border-radius:14px;padding:14px 16px;min-width:0}",
    ".fi-tarjeta h3{font-size:15px;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid var(--accent)}",
    ".fi-subgrupo{font-size:13.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:12px 0 4px}",
    ".fi-fila{display:flex;justify-content:space-between;gap:10px;padding:7px 0;border-bottom:1px dashed var(--border2);font-size:14px}",
    ".fi-fila .k{color:var(--muted)}",
    ".fi-fila .v{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".fi-fila.total{font-weight:700;border-bottom:0;border-top:2px solid var(--border)}",
    ".fi-fila.total .k{color:var(--text)}",
    ".fi-declarar{font-size:13px;color:var(--faint);margin:3px 0 6px}",
    ".fi-info{cursor:help;color:var(--faint)}",
    ".fi-op{border:1px solid var(--border);border-radius:10px;margin:6px 0;background:var(--tarjeta)}",
    ".fi-op>summary{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;padding:9px 12px;cursor:pointer;font-size:14px;color:var(--text)}",
    ".fi-op-f{font-variant-numeric:tabular-nums;color:var(--muted)}",
    ".fi-op-n{font-weight:600;flex:1 1 12em;overflow-wrap:anywhere}",
    ".fi-op-c{color:var(--muted);font-variant-numeric:tabular-nums}",
    ".fi-op-gp{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:auto}",
    ".fi-op>.fi-tablawrap,.fi-op>p{margin:0 12px 10px}",
    ".fi-tablawrap{overflow-x:auto}",
    ".fi-tabla{width:100%;font-size:14px}",
    /* Historial: las líneas de cada activo, alineadas en columnas como una
       tabla de posiciones; dentro, la tabla del activo. */
    ".fi-historial{overflow-x:auto}",
    ".fi-h-linea{display:grid;grid-template-columns:minmax(150px,1fr) 100px 150px 200px 180px;gap:0 10px;align-items:baseline;padding:7px 12px;font-size:14px}",
    ".fi-h-linea>span:not(:first-child){text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".fi-h-cab{font-weight:700;font-size:13px;color:var(--muted);border-bottom:2px solid var(--border);align-items:end}",
    ".fi-h-cab>span:not(:first-child){white-space:normal}",
    ".fi-h-total{font-weight:700;border-bottom:1px solid var(--border2)}",
    ".fi-h-subtotal{font-weight:700;background:var(--panel2);border-radius:8px}",
    ".fi-historial .fi-subgrupo{margin-top:18px}",
    ".fi-historial .fi-subgrupo+.fi-pie{margin:0 0 4px}",
    ".fi-h-activo{margin:0;border-bottom:1px solid var(--border)}",
    ".fi-h-activo>summary{list-style:none;cursor:pointer;color:var(--text);font-weight:400}",
    ".fi-h-activo>summary::-webkit-details-marker{display:none}",
    ".fi-h-activo>summary .fi-h-linea>span:first-child{font-weight:600}",
    ".fi-h-activo>summary .fi-h-linea>span:first-child::before{content:'▸ ';color:var(--muted)}",
    ".fi-h-activo[open]>summary .fi-h-linea>span:first-child::before{content:'▾ '}",
    ".fi-h-activo>summary:hover{background:var(--panel2)}",
    ".fi-h-activo>.fi-tablawrap,.fi-h-activo>p{margin:0 12px 12px}",
    ".fi-h-cerrado{color:var(--muted)}",
    ".fi-historial:not(.fi-todos) .fi-h-cerrado{display:none}",
    ".fi-h-avisos{color:var(--warn);font-weight:700;font-size:13px}",
    // Once columnas sin desplazarse de lado: letra y márgenes más justos.
    ".fi-historial .fi-tabla{font-size:12.5px;min-width:0}",
    ".fi-historial .fi-tabla td,.fi-historial .fi-tabla th{white-space:nowrap;padding:5px 4px}",
    ".fi-historial .fi-tabla th{font-size:12px;text-transform:none;letter-spacing:0;white-space:normal;vertical-align:bottom}",
    ".fi-et{display:inline-block;border:1px solid var(--border2);border-radius:6px;padding:0 6px;font-size:13px}",
    ".fi-et-entra{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok)}",
    ".fi-et-sale{background:var(--info-bg);border-color:var(--info-bd);color:var(--info);font-weight:700}",
    ".fi-et-canje{border-style:dashed}",
    ".fi-et-grupo{border-style:dotted}",
    ".fi-lotes{font-size:12px;font-weight:600;padding:0 6px;margin-left:4px;min-height:0;line-height:1.5;border-radius:6px;box-shadow:none}",
    ".fi-h-lote td{background:var(--panel2);font-size:13px;color:var(--muted)}",
    ".fi-h-lote td:nth-child(2){padding-left:22px}",
    ".fi-h-suma td{font-weight:700;border-top:2px solid var(--border)}",
    ".fi-h-nocuenta td{color:var(--muted)}",
    ".fi-h-hora{display:block;font-size:11.5px;color:var(--muted);line-height:1.2}",
    ".fi-historial .fi-ir-avisos{text-decoration:none}",
    "@media print{.fi-historial .fi-h-cerrado{display:block!important}.fi-historial tr.fi-h-lote[hidden]{display:table-row!important}}",
    ".fi-pos{color:var(--ok)}",
    ".fi-neg{color:var(--err)}",
    ".fi-pie{font-size:13px;color:var(--faint)}",
    ".fi-avisos{list-style:none;padding:0;margin:0}",
    ".fi-aviso{border:1px solid var(--border);border-radius:10px;padding:9px 12px;margin:6px 0;font-size:14px}",
    // La letra pequeña, medio o un punto más.
    "#view-fiscal .card>.sub{font-size:14px}",
    ".fi-tabla th{font-size:13px}",
    ".fi-aviso.revisar{background:var(--warn-bg);border-color:var(--warn-bd)}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Repintado -----------------------------
   Como js/16, 17 y 18: envoltorios que AÑADEN el repintado detrás de las
   funciones globales que avisan de cambios de datos, más hashchange al
   entrar en #fiscal. El de ejecutarClasificacion apunta además si terminó
   bien y con qué wallet y vault (si no, la pestaña pide clasificar), y si
   dio un error (lanzó, o devolvió false teniendo con qué clasificar).
   Esas funciones se llaman de dos en dos o tres (renderPanel con
   actualizarChipEstado, y dentro de la clasificación): el repintado se
   pide una vez y se hace al terminar, con un solo cálculo. */
(function montarHooksFiscal() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function pedirRepintado() {
    fiEstado.memo = null;   // la cache pudo cambiar por dentro (precios, tipos del BCE)
    if (fiEstado.pintar) return;
    fiEstado.pintar = true;
    setTimeout(() => { fiEstado.pintar = false; fiRenderSeguro(false); }, 0);
  }
  function envolver(nombre, despues) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__fiEnvuelta) return;
    const envoltura = function () {
      let resultado;
      try {
        resultado = original.apply(this, arguments);
      } catch (e) {
        if (despues) despues(false, e);
        pedirRepintado();
        throw e;
      }
      if (despues) despues(resultado);
      pedirRepintado();
      return resultado;
    };
    envoltura.__fiEnvuelta = true;
    window[nombre] = envoltura;
  }
  envolver("ejecutarClasificacion", (bien, error) => {
    fiEstado.vista = bien ? { registros: state.registros, huella: arrHuellaConfig(state.config) } : null;
    const req = requisitosClasificacionOk();
    fiEstado.errorClasificacion = !bien && (!!error || (req.cacheOk && req.csvOk && req.configOk));
  });
  envolver("renderPanel");
  envolver("actualizarChipEstado");

  window.addEventListener("hashchange", () => {
    if (location.hash === "#fiscal") fiRenderSeguro(true);
  });
  const cuerpo = $("fiCuerpo");
  if (cuerpo) {
    cuerpo.addEventListener("click", ev => {
      const boton = ev.target.closest(".fi-anio");
      if (boton) { fiElegirAnio(Number(boton.dataset.anio)); fiRenderSeguro(true); return; }
      const lotes = ev.target.closest(".fi-lotes");
      if (lotes) {
        // Sin repintar: solo se ven u ocultan sus filas.
        const id = lotes.dataset.desglose, abrir = !fiEstado.desgloses.has(id);
        fiEstado.desgloses[abrir ? "add" : "delete"](id);
        for (const tr of cuerpo.querySelectorAll('tr[data-de="' + CSS.escape(id) + '"]')) tr.hidden = !abrir;
        lotes.setAttribute("aria-expanded", abrir);
        lotes.textContent = (abrir ? "▾ " : "▸ ") + lotes.textContent.slice(2);
        return;
      }
      const ir = ev.target.closest(".fi-ir-avisos");
      if (ir) { ev.preventDefault(); const s = $("fiAvisos"); if (s) s.scrollIntoView({ behavior: "smooth" }); }
    });
    cuerpo.addEventListener("change", ev => {
      if (ev.target.id !== "fiVerTodos") return;
      fiEstado.verTodos = ev.target.checked;
      const h = cuerpo.querySelector(".fi-historial");
      if (h) h.classList.toggle("fi-todos", fiEstado.verTodos);
    });
  }
  fiRenderSeguro(false);
})();
