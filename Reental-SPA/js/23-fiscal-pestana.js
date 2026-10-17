/* =====================================================================
   REENTAL SPA · js/23-fiscal-pestana.js
   La pestaña 🧾 Fiscal. Pinta lo que dan el motor fiscal (js/21) y el
   informe para la Renta (js/22): aquí no se calcula ninguna cifra fiscal.

   Qué se ve: (1) el resumen
   del ejercicio, con selector de año y «A declarar en»; (2) las ventas del
   año, cada una desplegable con los lotes que gastó; (3) los lotes de cada
   inmueble (los gastados, aparte); (4) los avisos que afectan a la Renta,
   con enlace a 🔍 Revisión solo si allí están.

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
  const lotes = [];
  const original = globalThis.crearLote;
  globalThis.crearLote = function (colas, activo, cantidad) {
    const lote = original.apply(this, arguments);
    if (lote) {
      lotes.push({ activo, inicial: cantidad, lote,
        procedencia: lote.procedencia ? lote.procedencia.map(p => ({ ...p })) : null });
    }
    return lote;
  };
  let colas;
  try {
    colas = motorFiscal(regs, cache, config, op);
  } finally {
    globalThis.crearLote = original;
  }
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
  return { informes, avisosRevisar, operaciones, lotes, nombres: rentaNombresInmuebles(regs, cache), hasta,
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
      fiEur(op.gp, true) + "</span></summary>" + explica + fiTabla(cabeceras, lotes) + canje + "</details>";
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

/* ----------------------------- (3) Lotes de cada inmueble ----------------------------- */
const FI_ORIGEN_LOTE = {
  COMPRA: "Compra", COMPRA_BANCO: "Compra externa", CANJE: "Canje de contrato",
  DEPOSITO: "Depósito", REWARD: "Recompensa", SWAP: "Cambio", POOL: "Pool", RENDIMIENTO: "Rendimiento",
};

/* Lotes de los tokens de inmuebles, por inmueble y en orden FIFO:
   [{ nombre, lotes: [{fecha, origen, inicial, queda, unitario, canjeado,
   porCanje, supuesto}] }] (supuesto: coste de por defecto, «**»). Por
   nombre: el contrato viejo y el nuevo de un canje son
   el mismo inmueble. El lote de un canje lleva la fecha de la compra de la
   que viene (porCanje) y esa compra no cuenta como gastada (canjeado).
   Queda lo de los lotes vivos en las colas del motor. Los que aún
   tienes primero; los vendidos del todo, al final. */
function fiLotesPorInmueble(lotes, nombres) {
  const porNombre = fiAgrupar(lotes.filter(x => nombres.has(x.activo)), x => nombres.get(x.activo));
  const vacio = i => i.lotes.every(l => l.queda === 0) ? 1 : 0;
  return [...porNombre].map(([nombre, xs]) => {
    const deCanje = new Set(xs.flatMap(x => x.procedencia || []).map(p => p.fecha + "\u0000" + p.origen));
    return { nombre, lotes: xs.map(x => {
      const p = (x.procedencia || [])[0];
      return {
        fecha: p ? p.fecha : x.lote.fecha, porCanje: !!p, origen: p ? p.origen : x.lote.origen,
        canjeado: !x.vivo && deCanje.has(x.lote.fecha + "\u0000" + x.lote.origen),
        inicial: x.inicial, queda: x.vivo ? x.lote.cantidad : 0, unitario: x.lote.coste_unitario_eur,
        supuesto: x.lote.coste_supuesto === true,
      };
    }) };
  }).sort((a, b) => vacio(a) - vacio(b) || cmpTexto(String(a.nombre).toLowerCase(), String(b.nombre).toLowerCase()));
}

/* Los lotes vivos llevan «Quedan»; los gastados, no. */
function fiTablaLotes(lotes, conQueda) {
  const cabeceras = [["Fecha"], ["Origen"], ["Tokens", 1], ...(conQueda ? [["Quedan", 1]] : []), ["Coste del lote", 1], ["€ por token", 1]];
  return fiTabla(cabeceras, lotes.map(l => "<tr>" + fiCelda(ccEsc(fechaEs(l.fecha)) + (l.porCanje ? " *" : "")) +
    fiCelda(ccEsc((FI_ORIGEN_LOTE[l.origen] || l.origen) + (l.canjeado ? " (canjeada)" : ""))) + fiCelda(cantidadEs(l.inicial), 1) +
    (conQueda ? fiCelda(cantidadEs(l.queda), 1) : "") +
    fiCelda(fiEur(l.inicial * l.unitario) + (l.supuesto ? " **" : ""), 1) + fiCelda(fiEur(l.unitario), 1) + "</tr>").join(""));
}

/* Lo que queda de cada inmueble frente a las inversiones activas del
   último informe: si no cuadra (una fecha mal escrita o sin fecha deja
   lotes fuera del informe), se dice. */
function fiLotesCuadran(inmuebles, informe) {
  const enInforme = new Map();
  for (const f of ((informe.inversiones_activas || {}).inmuebles || {}).filas || []) {
    enInforme.set(f.nombre, (enInforme.get(f.nombre) || 0) + f.cantidad);
  }
  const quedan = new Map(inmuebles.map(i => [i.nombre, pySuma(i.lotes.map(l => l.queda))]));
  return [...new Set([...enInforme.keys(), ...quedan.keys()])]
    .every(n => Math.abs((enInforme.get(n) || 0) - (quedan.get(n) || 0)) < 1e-6);
}

function fiHtmlLotes(resultado, ultimo) {
  const inmuebles = fiLotesPorInmueble(resultado.lotes, resultado.nombres);
  if (!inmuebles.length) return '<p class="help">Sin compras de tokens de inmuebles.</p>';
  const aviso = ultimo && !fiLotesCuadran(inmuebles, ultimo)
    ? '<p class="fi-nota-aviso">No cuadran con la cartera del informe de ' + ultimo.ejercicio + ": revisa las fechas de los avisos.</p>" : "";
  return aviso + inmuebles.map(i => {
    const vivos = i.lotes.filter(l => l.queda > 0), gastados = i.lotes.filter(l => l.queda === 0);
    const quedan = pySuma(vivos.map(l => l.queda));
    const coste = pySuma(vivos.map(l => l.queda * l.unitario));
    const canje = (i.lotes.some(l => l.porCanje) ? '<p class="fi-pie">* ' + ccEsc(NOTA_CANJE_INFORME.replace(/^\*\s*/, "")) + "</p>" : "") +
      fiPieSupuesto(i.lotes);
    return '<details class="fi-op" data-abierto="lotes:' + ccEsc(i.nombre) + '"><summary><span class="fi-op-n">' + ccEsc(i.nombre) +
      '</span><span class="fi-op-c">' + cantidadEs(quedan) + ' tokens</span><span class="fi-op-gp">' + fiEur(coste) + "</span></summary>" +
      (vivos.length ? fiTablaLotes(vivos, true) : '<p class="help">No te queda ningún token.</p>') +
      (gastados.length ? '<details class="fi-gastados" data-abierto="gastados:' + ccEsc(i.nombre) + '"><summary>Gastados (' +
        gastados.length + ")</summary>" + fiTablaLotes(gastados, false) + "</details>" : "") + canje + "</details>";
  }).join("");
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
  const botones = anios.map(a => '<button type="button" class="fi-anio" data-anio="' + a + '" aria-pressed="' +
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
    seccion("fiLotes", "Lotes de cada inmueble", '<p class="help">A la fecha de los datos, en orden FIFO: al vender salen primero los más antiguos.</p>' +
      fiHtmlLotes(resultado, resultado.informes[anios.at(-1)])) +
    seccion("fiAvisos", "Avisos de " + anio, fiHtmlAvisos(avisos)) +
    // Descargo genérico, sin casillas ni países.
    '<p class="fi-pie fi-descargo">Ayuda para preparar la declaración, no un documento oficial: confírmalo con un asesor.</p>';
}

/* Repinta sin cerrar lo que estaba desplegado ni perder el foco de un
   botón de año. */
function fiPintar(cuerpo, html) {
  const abiertos = new Set([...cuerpo.querySelectorAll("details[open][data-abierto]")].map(d => d.dataset.abierto));
  const foco = document.activeElement && cuerpo.contains(document.activeElement) && document.activeElement.dataset
    ? document.activeElement.dataset.anio : undefined;
  cuerpo.innerHTML = html;
  for (const d of cuerpo.querySelectorAll("details[data-abierto]")) if (abiertos.has(d.dataset.abierto)) d.open = true;
  if (foco !== undefined) {
    const b = [...cuerpo.querySelectorAll(".fi-anio")].find(x => x.dataset.anio === foco);
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
    ".fi-op>summary{display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;padding:9px 12px;cursor:pointer;font-size:14px}",
    ".fi-op-f{font-variant-numeric:tabular-nums;color:var(--muted)}",
    ".fi-op-n{font-weight:600;flex:1 1 12em;overflow-wrap:anywhere}",
    ".fi-op-c{color:var(--muted);font-variant-numeric:tabular-nums}",
    ".fi-op-gp{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;margin-left:auto}",
    ".fi-op>.fi-tablawrap,.fi-op>p,.fi-op>details{margin:0 12px 10px}",
    ".fi-tablawrap{overflow-x:auto}",
    ".fi-tabla{width:100%;font-size:14px}",
    ".fi-gastados>summary{font-size:14px;color:var(--muted);cursor:pointer;padding:4px 0}",
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
      const ir = ev.target.closest(".fi-ir-avisos");
      if (ir) { ev.preventDefault(); const s = $("fiAvisos"); if (s) s.scrollIntoView({ behavior: "smooth" }); }
    });
  }
  fiRenderSeguro(false);
})();
