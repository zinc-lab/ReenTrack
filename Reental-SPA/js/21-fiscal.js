/* =====================================================================
   REENTAL SPA · js/21-fiscal.js
   Motor fiscal de la app: motorFiscal, resumenFiscalAnual, posicionAbierta
   y costeUsdAbierto (las cifras de referencia, registro a registro, las
   comprueba tests/paridad_motor_fiscal_paso_51f.js).

   Valora el libro diario en EUR siempre por el mismo camino: unidades del
   token -> importe en USD -> tipo BCE del dia -> EUR -> FIFO. Con eso
   calcula bases imponibles, retenciones y ganancias/perdidas
   patrimoniales. Si falta el tipo BCE, el precio historico o el coste
   FIFO, el registro queda REVISAR: prohibido inventar valores.

   USDT y USDC se valoran igual (1 = 1 USD), pero cada una tiene su propia
   cola FIFO (son activos distintos en la blockchain).

   Rendimientos: cada fila del CSV cuenta una
   vez, en el ano de su reparto. Ingresos integros (base) = el integro
   repartido (distributed) y retencion = la que diga el CSV (retained, 0 si
   no la hay), los dos en EUR con el tipo BCE de la fecha del reparto.
   Ninguna se calcula ni se supone, y nunca se resta la retencion del
   integro: Renta Web ya la descuenta.

   Cifras exactas: las sumas de listas van por pySuma (suma compensada),
   min/max por pyMin/pyMax (con NaN no son Math.min/max) y «si tiene
   valor» por pyVerdad (un NaN cuenta como valor y un {} vacio no). Los
   nombres py* vienen de cuando la app copiaba a un programa en Python.
   Sin pantalla: lo llama la pestaña Fiscal.
   ===================================================================== */

/* Suma compensada (Neumaier): no pierde los decimales que una suma
   normal va perdiendo, y las cifras salen iguales hasta el ultimo. */
function pySuma(valores) {
  let total = 0, c = 0, alguno = false;
  for (const x of valores) {
    alguno = true;
    const t = total + x;
    if (Math.abs(total) >= Math.abs(x)) c += (total - t) + x;
    else c += (x - t) + total;
    total = t;
  }
  if (alguno && c && Number.isFinite(c)) total += c;
  return total;
}
function pyMin(a, b) { return b < a ? b : a; }   // el menor (con un NaN, a)
function pyMax(a, b) { return b > a ? b : a; }   // el mayor (con un NaN, a)
/* ¿Tiene valor? null, undefined, 0, "", false, [] y {} no; un NaN si. */
function pyVerdad(v) {
  if (!fiscHay(v) || v === false || v === 0 || v === "") return false;
  if (typeof v !== "object") return true;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map || v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
function pyO(v, defecto) { return pyVerdad(v) ? v : defecto; }   // v, o defecto si no tiene valor
function fiscHay(v) { return v !== null && v !== undefined; }   // ni null ni undefined
/* lista de m[clave], creandola si no esta. */
function fiscListaDe(m, clave) {
  if (!m.has(clave)) m.set(clave, []);
  return m.get(clave);
}
function fiscEsNumero(v) { return typeof v === "number"; }   // numero (NaN tambien)
function fiscTiene(obj, clave) {
  return obj !== null && typeof obj === "object" && Object.prototype.hasOwnProperty.call(obj, clave);
}
/* Claves de un bloque de la cache (un objeto de direcciones) o sus
   elementos si es una lista. */
function fiscClavesBloque(bloque) {
  if (Array.isArray(bloque)) return bloque;
  return bloque && typeof bloque === "object" ? Object.keys(bloque) : [];
}

// Tolerancia para los cuadres de una fila del CSV (medio centimo de USDT).
const TOLERANCIA_CUADRE_CSV = 0.005;

/* Nombre de la cola FIFO de un contrato: RNT, USDT, USDC, POL o, en los
   inmuebles, la propia direccion del contrato. */
function nombreActivoFifo(contrato) {
  if (contrato === RNT) return "RNT";
  if (contrato === USDT) return "USDT";
  if (contrato === USDC) return "USDC";
  if (contrato === "pol") return "POL";
  return contrato;   // inmuebles: la direccion es la clave
}

/* EUR = USD / tasa (la serie del BCE es USD por EUR). Sin tasa valida
   devuelve null: quien lo use marcara REVISAR. */
function usdAEur(importeUsd, tasa) {
  if (typeof tasa === "boolean") tasa = Number(tasa);   // true cuenta como 1
  if (typeof tasa !== "number" || tasa <= 0) return null;
  return importeUsd / tasa;
}

/* Anade un lote (cantidad, coste unitario en EUR, fecha y origen) a la
   cola FIFO del activo. No crea nada si falta la cantidad o el coste.

   costeUsd: lo que costo en USD, si se sabe (en una compra por banco o con
   un coste puesto a mano en euros, no). Solo se ensena en el informe
   anual; ninguna valoracion sale de el.

   procedencia (solo el lote de un canje): las compras de las que viene
   ([{fecha, origen, cantidad}], en orden FIFO), llevadas a la cantidad del
   lote. No cambia su coste: sirve para dar, al venderlo, la fecha de la
   compra (el canje solo cambia de contrato y el token hereda coste y
   fecha). */
function crearLote(colas, activo, cantidad, costeTotalEur, fecha, origen,
                   procedencia = null, costeUsd = null) {
  if (!pyVerdad(cantidad) || cantidad <= 0 || !fiscHay(costeTotalEur)) return null;
  const lote = {
    cantidad,
    coste_unitario_eur: costeTotalEur / cantidad,
    fecha,
    origen,
    coste_unitario_usd: fiscHay(costeUsd) ? costeUsd / cantidad : null,
  };
  if (pyVerdad(procedencia)) {
    const escala = cantidad / pySuma(procedencia.map(p => p.cantidad));
    lote.procedencia = procedencia.map(p => ({ fecha: p.fecha, origen: p.origen, cantidad: p.cantidad * escala }));
  }
  fiscListaDe(colas, activo).push(lote);
  return lote;
}

/* Saca 'cantidad' de la procedencia de un lote de canje, en orden FIFO, y
   devuelve las piezas ({fecha, origen, cantidad}). */
function sacarProcedencia(procedencia, cantidad) {
  const piezas = [];
  let pendiente = cantidad;
  while (pendiente > 1e-12 && procedencia.length) {
    const p = procedencia[0];
    const usado = pyMin(p.cantidad, pendiente);
    piezas.push({ fecha: p.fecha, origen: p.origen, cantidad: usado });
    p.cantidad -= usado;
    pendiente -= usado;
    if (p.cantidad <= 1e-12) procedencia.shift();
  }
  return piezas;
}

/* Saca 'cantidad' de la cola FIFO empezando por el lote mas antiguo.
   Devuelve [costeEur, faltante, trozos]: faltante son las unidades que no
   tenian lote (0 si no falta nada) y trozos, lo sacado de cada lote, en
   orden (fecha y origen del lote, cantidad, coste en EUR y, si el lote lo
   sabe, en USD). Los costes en EUR de los trozos, sumados en ese orden,
   dan costeEur. Un trozo de un lote de canje lleva ademas su procedencia
   (las compras de las que viene). */
function consumirFifo(colas, activo, cantidad) {
  let pendiente = cantidad;
  let coste = 0;
  let sinCoste = 0;
  const trozos = [];
  const cola = colas.get(activo) || [];
  // Lo que queda por debajo de esto es el error de sumar decimales, no
  // unidades que faltan (con miles de USDT, vaciar justo la cola daria
  // «faltan 0 USDT» y la operacion quedaria sin G/P).
  const polvo = pyMax(1e-12, Math.abs(cantidad) * 1e-10);
  while (pendiente > polvo && cola.length) {
    const lote = cola[0];
    const usado = pyMin(lote.cantidad, pendiente);
    if (lote.sin_coste) {
      // Una compra sin precio (RNT a la espera del suyo, en 💶): sus
      // unidades salen de la cola, pero cuentan como sin coste registrado.
      sinCoste += usado;
      lote.cantidad -= usado;
      pendiente -= usado;
      if (lote.cantidad <= polvo) cola.shift();
      continue;
    }
    const costeTrozo = usado * lote.coste_unitario_eur;
    coste += costeTrozo;
    const unitarioUsd = lote.coste_unitario_usd;
    const trozo = {
      fecha: lote.fecha, origen: lote.origen, cantidad: usado, coste_eur: costeTrozo,
      coste_usd: fiscHay(unitarioUsd) ? usado * unitarioUsd : null,
    };
    if ("procedencia" in lote) trozo.procedencia = sacarProcedencia(lote.procedencia, usado);
    if (lote.coste_supuesto) trozo.coste_supuesto = true;
    trozos.push(trozo);
    lote.cantidad -= usado;
    pendiente -= usado;
    if (lote.cantidad <= polvo) cola.shift();
  }
  const faltante = (pendiente > polvo ? pendiente : 0) + sinCoste;
  return [coste, faltante > polvo ? faltante : 0, trozos];
}

/* Compras de las que vienen unos trozos de lote: la procedencia del trozo
   si es de un canje (canje de un canje) y, si no, el propio lote. */
function procedenciaDeTrozos(trozos) {
  const procedencia = [];
  for (const t of trozos) {
    procedencia.push(...(pyVerdad(t.procedencia) ? t.procedencia
      : [{ fecha: t.fecha, origen: t.origen, cantidad: t.cantidad }]));
  }
  return procedencia;
}

/* Anade un texto a la nota del registro («; » entre medias). */
function fiscAnadirNota(registro, texto) {
  registro.nota = (registro.nota ? registro.nota + "; " : "") + texto;
}
/* Marca el registro para revisar y anade el motivo a su nota. */
function fiscMarcarRevisar(registro, motivo) {
  registro.revisar = true;
  fiscAnadirNota(registro, motivo);
}

/* Convierte USD a EUR con el tipo BCE ya anotado en el registro. */
function fiscAEur(registro, importeUsd) {
  if (!fiscHay(importeUsd)) return null;
  return usdAEur(importeUsd, registro.tipo_bce);
}

// Campos que pone el motor fiscal para el informe y el Excel y que no van
// al libro diario del JSON: trozos de lote, canje emparejado, colas de
// stablecoin movidas, gas sumado o restado y POL de gas sin coste.
const CAMPOS_SOLO_MOTOR = ["lotes_consumidos", "canje", "colas_stable",
  "partes_stable", "coste_por_cola", "gas_eur", "gas_sin_coste_pol"];
// Campos numericos de un registro que un ajuste del usuario puede escribir.
const CAMPOS_NUMERICOS = ["cantidad", "importe_usdt", "coste_eur", "gp_eur",
  "integro_usdt", "retencion_usdt"];
// Los importes que no pueden ser negativos, CAMPOS_NO_NEGATIVOS: en js/05
// (también los rechaza «Ajustes en JSON»).
// Campos que calcula el motor: si un ajuste los escribe, no se usan (si no,
// el resumen sumaria la cifra del usuario sin que el motor la calcule).
// gp_eur va aparte: el usuario si la pone en el resultado de un pool.
const CAMPOS_CALCULADOS = ["tipo_bce", "importe_eur", "base_imponible_eur",
  "retencion_eur", "coste_fifo_eur", "codigo_concepto"];
// Categorias que el motor valora y, en las que dependen de ella, las
// subcategorias que entiende. Otra cualquiera queda a revisar: si no, el
// registro desapareceria de la declaracion sin aviso.
const SUBCATEGORIAS_MOTOR = {
  RENDIMIENTO: ["RCM_REINVERTIDO", "RCM_RECLAMADO", "RCM_PENDIENTE", "RCM_MIXTO"],
  VENTA: ["GPP_INMUEBLE", "GPP_SWAP", "GPP_POOL"],
  RETIRADA: ["GPP_RETIRADA", "NEUTRO"],
  REWARD: ["RCM_REWARD", "RCM_STAKING", "GPP_REGALO"],
  COMPRA: null, DEPOSITO: null, MOVIMIENTO: null, COMISION: null,
  SPAM: null, REVISAR: null,
};
function fiscCategoriaDelMotor(cat) {
  return typeof cat === "string" && fiscTiene(SUBCATEGORIAS_MOTOR, cat);
}

/* Si valor es una fecha AAAA-MM-DD (con o sin hora detras) que existe. */
function fiscFechaValida(valor) {
  if (!(typeof valor === "string" && /^\d{4}-\d{2}-\d{2}/.test(valor))) return false;
  const [a, m, d] = valor.slice(0, 10).split("-").map(Number);
  const f = new Date(0);
  f.setUTCFullYear(a, m - 1, d);   // Date.UTC tomaria los anos 0-99 como 1900-1999
  return a >= 1 && f.getUTCFullYear() === a && f.getUTCMonth() === m - 1 && f.getUTCDate() === d;
}

/* Antes de valorar: un campo numerico que no es un numero (p. ej. "1000" o
   "12,5" escritos en «Ajustes en JSON») o un importe negativo y una fecha
   (o fecha de cobro) que no existe se quitan; una categoria o subcategoria
   que el motor no entiende se deja. En todos los casos el registro queda a
   revisar con el motivo: nada se calcula con un texto, nada desaparece sin
   aviso y el programa no se para. */
function fiscValidarRegistro(registro) {
  for (const campo of CAMPOS_NUMERICOS) {
    const valor = registro[campo];
    if (fiscHay(valor) && !fiscEsNumero(valor)) {
      registro[campo] = null;
      fiscMarcarRevisar(registro, campo + " no es un número (" + pdRepr(valor) + "): corregirlo en los ajustes");
    } else if (CAMPOS_NO_NEGATIVOS.includes(campo) && fiscHay(valor) && valor < 0) {
      registro[campo] = null;
      fiscMarcarRevisar(registro, campo + " negativo (" + numEs(valor) + "): corregirlo en los ajustes");
    }
  }
  for (const campo of ["fecha", "fecha_cobro"]) {
    const fecha = registro[campo];
    if (fiscHay(fecha) && !fiscFechaValida(fecha)) {
      registro[campo] = null;
      fiscMarcarRevisar(registro, campo + " no válida (" + pdRepr(fecha) + "): corregirla en los ajustes");
    } else if (fiscHay(fecha) && fecha[10] === "T") {
      // «2024-12-31T12:00:00» (escrita a mano) como «2024-12-31 12:00:00»:
      // con la «T» quedaria despues del cierre del 31/12 («23:59:59») y la
      // cartera de ese ano no la veria.
      registro[campo] = fecha.slice(0, 10) + " " + fecha.slice(11);
    }
  }
  // Una cantidad negativa (escrita a mano) en un premio, un gas o un
  // movimiento restaria de la base o del gas sin aviso (en las salidas ya
  // la para fiscCantidadValida).
  if (["REWARD", "COMISION", "MOVIMIENTO"].includes(registro.categoria) &&
      fiscEsNumero(registro.cantidad) && registro.cantidad < 0) {
    fiscMarcarRevisar(registro, "cantidad negativa (" + numEs(registro.cantidad) + "): corregirla en los ajustes");
    registro.cantidad = null;
  }
  const cat = registro.categoria, sub = registro.subcategoria;
  if (!fiscCategoriaDelMotor(cat)) {
    fiscMarcarRevisar(registro, "categoría desconocida (" + pdRepr(cat) + "): no se valora; corregirla en los ajustes");
  } else if (SUBCATEGORIAS_MOTOR[cat] && !SUBCATEGORIAS_MOTOR[cat].includes(sub)) {
    fiscMarcarRevisar(registro, "subcategoría desconocida para " + cat + " (" + pdRepr(sub) +
      "): no se valora; corregirla en los ajustes");
  }
}

/* Precio en USD de un dia (precios_rnt o precios_pol de la cache), o null
   si no esta o no es un numero mayor que 0. */
function fiscPrecioDelDia(precios, fecha) {
  const ok = pyVerdad(fecha) && pdEsObjeto(precios);
  const delDia = dia => { const p = ok && dia && fiscTiene(precios, dia) ? precios[dia] : null; return fiscEsNumero(p) && p > 0 ? p : null; };
  // Sin el de su día, el de su día UTC (guardado antes de la hora española).
  return delDia(ok && fecha.slice(0, 10)) || delDia(ok && diaUtcSiOtro(fecha));
}

/* Una salida (venta o retirada) necesita una cantidad mayor que 0: con 0,
   nada o un negativo saldria con coste 0 y todo el precio como ganancia.
   Si no la tiene, queda a revisar sin valorar. aMano: la cantidad la
   escribio un ajuste (en la nota sale como entero, «0»); si no, la da la
   blockchain y sale como decimal («0.0»). */
function fiscCantidadValida(r, aMano) {
  if (fiscEsNumero(r.cantidad) && r.cantidad > 0) return true;
  const texto = fiscEsNumero(r.cantidad) && !aMano ? pdFloatPython(r.cantidad) : pdRepr(r.cantidad);
  fiscMarcarRevisar(r, "cantidad no válida (" + texto + "): no se valora la salida");
  return false;
}

/* crearLote con la fecha del registro (o 'fecha'); si no se puede abrir
   (falta la cantidad o el coste), el registro queda a revisar: si no, el
   fallo solo se veria despues, en la venta («FIFO incompleto»). */
function fiscAbrirLote(r, colas, activo, cantidad, costeEur, origen,
                       { fecha = null, procedencia = null, coste_usd = null } = {}) {
  const lote = crearLote(colas, activo, cantidad, costeEur, pyO(fecha, r.fecha), origen, procedencia, coste_usd);
  if (lote === null) fiscMarcarRevisar(r, "lote FIFO no creado: falta la cantidad o el coste");
  return lote;
}

/* Stablecoins (USDT o USDC) que entran en lo tuyo (wallet o vault) o salen
   de ello en cada hash: Map hash -> {entra: [[contrato, cantidad]], sale:
   [...]}. Dicen en que cola FIFO va un cobro o de cual sale un pago: el
   registro no siempre lo guarda (un pago o un swap de POL se anotan como
   USDT aunque fueran USDC). Un hash descargado que no mueve stablecoin
   tiene las dos listas vacias; uno que no esta, no sale. */
function stablesPorHash(cache) {
  const porHash = new Map();
  const tr = cache && cache.transacciones;
  // Sin las dos series (o con una que no es una lista), nada.
  if (!tr || typeof tr !== "object" || !Array.isArray(tr.wallet_tokens) || !Array.isArray(tr.vault_tokens)) {
    return porHash;
  }
  let transfers;
  try {
    transfers = transfersUnificadosClasificacion(cache);
  } catch (e) {
    return porHash;
  }
  const wallet = walletConfig();
  for (const tx of transfers) {
    // Cada hash descargado tiene su entrada, aunque no mueva stablecoin:
    // asi se distingue «no entro nada» de «no esta descargado».
    const h = normalizarDireccion(tx.hash !== undefined ? tx.hash : "");
    if (!porHash.has(h)) porHash.set(h, { entra: [], sale: [] });
    const lados = porHash.get(h);
    const contrato = normalizarDireccion(tx.contractAddress !== undefined ? tx.contractAddress : "");
    if (!STABLECOINS.has(contrato)) continue;
    const origen = normalizarDireccion(tx.from !== undefined ? tx.from : "");
    const destino = normalizarDireccion(tx.to !== undefined ? tx.to : "");
    const deLoTuyo = origen === wallet || esDelVault(origen);
    const aLoTuyo = destino === wallet || esDelVault(destino);
    const cantidad = cantidadTx(tx);
    if (deLoTuyo === aLoTuyo || !pyVerdad(cantidad)) continue;
    lados[aLoTuyo ? "entra" : "sale"].push([contrato, cantidad]);
  }
  return porHash;
}

/* En que colas de stablecoin va un importe: [[cola, cantidad]].
   movimientos: los de su hash y su lado (stablesPorHash). Con una sola
   stablecoin, toda en ella; con varias, la que mueve justo ese importe o,
   si no, a partes como se movieron. Sin movimientos (no descargados), la
   del registro. */
function repartirEnColas(movimientos, importe, contratoRegistro = USDT) {
  const contratos = [];
  for (const [contrato] of movimientos) {
    if (!contratos.includes(contrato)) contratos.push(contrato);
  }
  if (!contratos.length) return [[nombreActivoFifo(contratoRegistro), importe]];
  if (contratos.length === 1) return [[nombreActivoFifo(contratos[0]), importe]];
  const exacto = movimientos.find(([, n]) => pdRedondear6(n) === pdRedondear6(importe));
  if (exacto !== undefined) return [[nombreActivoFifo(exacto[0]), importe]];
  const total = pySuma(movimientos.map(([, n]) => n));
  return contratos.map(c => [nombreActivoFifo(c),
    importe * pySuma(movimientos.filter(([c2]) => c2 === c).map(([, n]) => n)) / total]);
}

/* Cada llegada de un canje (COMPRA via CANJE) con el burn del que hereda
   el coste: una VENTA del mismo hash que va al burn sin cobrar nada (como
   las emite la clasificacion). Se reconocen por como son, no por el texto
   de la nota, que el usuario puede cambiar. Primero las de la misma
   cantidad y despues, en orden, las que queden. Marca cada burn emparejado
   (canje=true) y devuelve Map clave de la llegada -> burn.

   Solo se hereda sin preguntar si es el mismo inmueble con la misma
   cantidad (el canje solo cambia de contrato). Si no, los dos quedan a revisar: con
   otro inmueble o con otra cantidad es una permuta y tendria G/P. */
function emparejarCanjes(registros) {
  const llegadas = new Map(), burns = new Map();
  for (const r of registros) {
    if (r.categoria === "COMPRA" && r.via_compra === "CANJE") {
      fiscListaDe(llegadas, r.hash).push(r);
    } else if (r.categoria === "VENTA" && r.subcategoria === "GPP_INMUEBLE" &&
               r.destino === BURN && !fiscHay(r.importe_usdt) &&
               !pyVerdad(r.pago_diferido)) {
      fiscListaDe(burns, r.hash).push(r);
    }
  }
  const pares = new Map();
  for (const [h, delHash] of llegadas) {
    const libres = [...(burns.get(h) || [])];
    for (const llegada of [...delHash].sort((a, b) => cmpTexto(a.clave, b.clave))) {
      let burn = libres.find(b => b.cantidad === llegada.cantidad);
      if (burn === undefined) burn = libres.length ? libres[0] : null;
      if (burn === null) continue;
      libres.splice(libres.indexOf(burn), 1);
      burn.canje = true;
      pares.set(llegada.clave, burn);
      const mismo = normalizarNombreInmueble(burn.inmueble || "") ===
        normalizarNombreInmueble(llegada.inmueble || "");
      if (!mismo || burn.cantidad !== llegada.cantidad) {
        const motivo = "canje de " + pyStr(burn.inmueble) + " (" + cantidadNota(burn.cantidad) + ") por " +
          pyStr(llegada.inmueble) + " (" + cantidadNota(llegada.cantidad) + "): solo se hereda el coste si " +
          "es el mismo inmueble con la misma cantidad; si no, es una permuta con G/P";
        fiscMarcarRevisar(burn, motivo);
        fiscMarcarRevisar(llegada, motivo);
      }
    }
  }
  return pares;
}

/* Si valorar el registro pasa algun importe de USD a EUR. No lo pasan la
   compra por banco (coste en EUR), el canje (hereda coste), el resultado
   del pool (lo pone el usuario) ni el deposito de POL con su coste en EUR:
   sin tipo BCE se valoran igual. */
function necesitaTipoBce(registro) {
  const cat = registro.categoria;
  if (cat === "COMPRA" && ["BANCARIA", "CANJE"].includes(registro.via_compra)) return false;
  if (cat === "VENTA" && (registro.subcategoria === "GPP_POOL" || pyVerdad(registro.canje))) return false;
  if (cat === "DEPOSITO" && registro.contrato === "pol" &&
      fiscHay(registro.coste_eur)) return false;
  // Un traspaso (vault -> wallet) no se valora (si no, quedaria a revisar
  // «sin tipo BCE» sin pasar nada a euros).
  if (cat === "RETIRADA" && registro.subcategoria !== "GPP_RETIRADA") return false;
  return fiscCategoriaDelMotor(cat);
}

/* Si un registro es la stablecoin que un distribuidor de Reental manda a
   la wallet o al vault (el cobro de un reparto). */
function cobroDeReparto(registro, distribuidores, propias) {
  return STABLECOINS.has(registro.contrato) &&
    distribuidores.has(normalizarDireccion(registro.origen || "")) &&
    propias.has(normalizarDireccion(registro.destino || "")) &&
    fiscEsNumero(registro.importe_usdt) && registro.importe_usdt > 0;
}

/* Lo que identifica una fila del CSV en su registro RENDIMIENTO (para el
   aviso de filas repetidas), o null si el registro no sale del CSV. */
function firmaRendimientoCsv(registro) {
  if (registro.categoria !== "RENDIMIENTO" || registro.integro_usdt === null ||
      registro.integro_usdt === undefined) return null;
  return JSON.stringify([registro.hash, registro.inmueble, registro.periodo_fiscal,
    registro.fecha, registro.subcategoria,
    pdRedondear6(pyO(registro.importe_usdt, 0)),
    pdRedondear6(registro.integro_usdt),
    pdRedondear6(pyO(registro.retencion_usdt, 0))]);
}

/* Avisos sobre un rendimiento del CSV. Solo
   anaden notas (y a revisar, cuando hay que comprobar algo): nunca cambian
   importes. */
function avisosRendimientoCsv(r, sub, integro, retenido, anio, repeticionesCsv) {
  const movido = pyO(r.importe_usdt, 0);   // reinvertido + reclamado (neto)
  // Reclamado sin retencion: sin nota (la app no aconseja).
  if (movido + retenido > integro + TOLERANCIA_CUADRE_CSV) {
    // La fila no cuadra. No se corrige sola.
    fiscMarcarRevisar(r, "la fila del archivo de Reental no cuadra: reinvertido + reclamado (" +
      numEs(movido) + ") + retenido (" + numEs(retenido) + ") da más que lo repartido (" +
      numEs(integro) + ") USDT");
  } else if (integro > movido + retenido + TOLERANCIA_CUADRE_CSV) {
    // Parte pendiente; se declara igual en el ano del reparto.
    fiscAnadirNota(r, "pendiente: " + numEs(integro - movido - retenido) + " USDT del reparto " +
      "sin reclamar ni reinvertir; se declaran igual en el ano del reparto");
  }
  if ((repeticionesCsv.get(firmaRendimientoCsv(r)) || 0) > 1) {
    // Posible fila duplicada en el CSV.
    fiscMarcarRevisar(r, "fila repetida en el archivo de Reental (mismo inmueble, periodo, " +
      "fecha, importes y hash): posible duplicado");
  }
  const fechaCobro = r.fecha_cobro;
  if (sub === "RCM_RECLAMADO" && pyVerdad(fechaCobro) && anio !== null &&
      parseInt(fechaCobro.slice(0, 4), 10) !== anio) {
    // El ingreso es del ano del reparto, pero Reental retuvo en el del
    // reclamo. No se decide solo.
    fiscMarcarRevisar(r, "reclamo de otro año: reparto en " + anio + " y reclamo en " +
      fechaCobro.slice(0, 4) + "; comprobar en qué año va la retención");
  }
}

/* El ajuste que se aplico a cada registro (clave del registro -> campos),
   con la regla de aplicarAjustesUsuario: con sello, el del registro de su
   movimiento aunque su clave haya cambiado, y ninguno si ya no esta; sin
   sello, el de su clave. No leerlo solo por la clave del registro: uno
   que se quedo sin su movimiento se leeria en el que ahora ocupa su clave
   (una subcategoria «fijada» que nadie fijo). Los registros ya
   llevan el ajuste: si cambio el origen, el destino o la cantidad, el
   sello se compara con lo escrito. Dos ajustes del mismo registro se
   juntan en orden, como al aplicarlos. */
function fiscAjustesPorRegistro(registros, cache) {
  const porRegistro = new Map();
  if (!pdEsObjeto(cache.ajustes_usuario)) return porRegistro;
  const porClave = new Map();
  const porBase = new Map();
  for (const r of registros) {
    porClave.set(r.clave, r);
    fiscListaDe(porBase, baseClave(r.clave)).push(r);
  }
  const sellos = sellosAjustes(cache);
  for (const [clave, campos] of Object.entries(cache.ajustes_usuario)) {
    const k = String(clave).trim().toLowerCase();
    let registro = porClave.get(k);
    const sello = sellos.get(k);
    if (sello && !k.startsWith("csv::")) {
      const escrito = { ...sello };
      if (pdEsObjeto(campos)) {
        for (const c of ["origen", "destino", "cantidad"]) {
          if (fiscTiene(campos, c)) escrito[c] = campos[c];
        }
      }
      if (!(registro && selloCasa(registro, escrito))) {
        registro = (porBase.get(baseClave(k)) || []).find(r => selloCasa(r, escrito));
      }
    }
    if (!registro || !pdEsObjeto(campos)) continue;
    porRegistro.set(registro.clave, { ...(porRegistro.get(registro.clave) || {}), ...campos });
  }
  return porRegistro;
}

/* Anade a cada registro su valoracion fiscal (importe_eur, base imponible,
   retencion, coste FIFO, G/P y codigo de concepto), en el orden del
   diario, y devuelve las colas FIFO (Map activo -> lotes) con lo que queda
   en cartera.

   opciones (todas opcionales; si se pasan, se rellenan, sin cambiar
   ninguna valoracion):
   - cierres: lo que queda en cartera al terminar cada ano con actividad
     ({ano: posicionAbierta}), para el informe anual de Renta Web.
   - cierres_usd: igual, con lo que costo en USD esa cartera ({ano:
     costeUsdAbierto}), solo para ensenarlo en el informe.
   - cierres_supuestos: igual, con los activos que tienen algún lote de
     una compra bancaria con el coste de por defecto ({ano: [activo]}),
     para marcarlos en el informe.
   - cierres_pools: igual, con las unidades de cada activo aportadas a
     pools de liquidez ({ano: {activo: unidades}}): siguen en la cartera
     (criterio de AFCripto), pero no en la wallet.
   - cierres_otras: igual, con lo que crees tener en otras cuentas tuyas a
     31/12 ({ano: {activo: unidades}}): sigue en la cartera, pero no en la
     wallet.
   - apartado: lo que al terminar sigue en la cartera pero no esta en la
     wallet ni en el vault ({activo: {pools, defi, otras_cuentas}}): lo
     aportado a pools, lo mandado a staking o farming y lo mandado como
     movimiento neutro a otra cuenta tuya (cualquier token, a una direccion
     que no es de Reental ni DeFi, menos lo que vuelve). Para el cuadre con
     la blockchain.

   La VENTA, la permuta del USDT de una compra on-chain y la RETIRADA
   valorada guardan ademas de que compras salen (lotes_consumidos: los
   trozos de consumirFifo), para la fecha de adquisicion del informe anual;
   solo si su coste FIFO esta completo. Fuera de la huella y del libro
   diario del JSON. El gas no los guarda. El lote de un canje hereda de que
   compras viene el token quemado (su procedencia).

   config no se usa: la wallet y el vault salen de state.config, como al
   clasificar.

   Como llamarlo: el motor CAMBIA los registros que recibe (notas,
   «revisar», la subcategoria de un REWARD sin respaldo...) y no es
   idempotente: una segunda pasada repite notas y deja avisos viejos. Se
   pasa una sola vez sobre lo recien clasificado. Por eso: (1) siempre con una copia nueva de los registros
   clasificados (structuredClone(state.registros)), nunca con
   state.registros, que usan Revision, Transacciones, Dashboard e Inicio;
   (2) con objetos de opciones nuevos en cada llamada (cierres no se vacia);
   (3) solo si state.config es la de la ultima clasificacion (con la wallet
   a medio escribir saldrian «FIFO incompleto» falsos). */
function motorFiscal(registros, cache, config, opciones = {}) {
  const { cierres = null, cierres_usd = null, cierres_pools = null,
          apartado = null, cierres_otras = null, cierres_supuestos = null } = opciones;
  const ajustes = fiscAjustesPorRegistro(registros, cache);
  const ajusteDe = clave => ajustes.get(clave) ?? {};
  // La fila del archivo con un integro que no vale (escrito a mano): la
  // validacion lo quita y el rendimiento se declararia como si no tuviera
  // fila (lo cobrado, sin la retencion del archivo).
  const integroRoto = new Set(registros.filter(
    r => fiscHay(r.integro_usdt) && !(fiscEsNumero(r.integro_usdt) && r.integro_usdt >= 0)));
  const cantidadValida = r => {
    return fiscCantidadValida(r, "cantidad" in ajusteDe(r.clave));
  };
  for (const r of registros) {
    fiscValidarRegistro(r);
    // gp_eur solo lo pone el usuario en el resultado de un pool: en lo
    // demas lo calcula el motor (si no, el resumen sumaria el del usuario
    // y el informe de Renta, valor menos coste: dos cifras).
    const ajuste = ajusteDe(r.clave);
    const poolManual = r.categoria === "VENTA" && r.subcategoria === "GPP_POOL";
    if (fiscHay(ajuste.gp_eur) && !poolManual) {
      fiscMarcarRevisar(r, "gp_eur puesto a mano (" + pdStr(ajuste.gp_eur) +
        ") no se usa: solo vale en el resultado de un pool");
    }
    if (!poolManual) r.gp_eur = null;
    else if (!("gp_eur" in r)) r.gp_eur = null;   // sin el, a revisar
    // Lo demas que calcula el motor empieza vacio: lo escrito en un ajuste
    // no se usa (se sumaria al resumen o lo pararia).
    for (const campo of CAMPOS_CALCULADOS) {
      if (fiscHay(ajuste[campo])) {
        fiscMarcarRevisar(r, campo + " lo calcula el programa: el puesto a mano (" +
          pdRepr(ajuste[campo]) + ") no se usa");
      }
      r[campo] = null;
    }
  }
  const fechas = registros.filter(r => pyVerdad(r.fecha)).map(r => r.fecha.slice(0, 10));
  let tipos = {};
  if (fechas.length && pyVerdad(cache.tipos_bce)) {
    // Desde el primer tipo de la cache si es anterior al diario: un primer
    // dia en fin de semana o festivo toma el ultimo publicado antes
    // (actualizarTiposBce ya baja 7 dias de margen).
    // Solo las fechas que existen; una «2023-11-00» o «2024-02-30» escrita
    // a mano en la cache pararia el motor o correria los dias.
    const tiposBce = Object.fromEntries(Object.entries(cache.tipos_bce).filter(
      ([f]) => /^\d{4}-\d{2}-\d{2}$/.test(f) && fiscFechaValida(f)));
    const publicados = Object.keys(tiposBce);
    // Con la cache, el día de la sincronización admite uno más.
    tipos = reindexarForwardFill(tiposBce, publicados.reduce(pyMin, fechas.reduce(pyMin)),
      fechas.reduce(pyMax), cache);
  }
  const preciosRnt = pyO(cache.precios_rnt, {});
  const preciosPol = pyO(cache.precios_pol, {});

  const colas = new Map();
  const procesados = new Set();

  // Dos filas del CSV iguales (mismo hash, inmueble, periodo, fecha e
  // importes) son un posible duplicado del CSV. No se avisa solo por
  // repetir el periodo: un periodo puede tener dos repartos.
  const repeticionesCsv = new Map();
  for (const r of registros) {
    const firma = firmaRendimientoCsv(r);
    if (firma !== null) repeticionesCsv.set(firma, (repeticionesCsv.get(firma) || 0) + 1);
  }

  const aprendidos = cache.contratos_aprendidos;
  const bloqueRol = rol => (aprendidos && typeof aprendidos === "object" ? aprendidos[rol] : undefined);
  // Direcciones DeFi (pool, staking, farming). Lo que la wallet les envia
  // es una posicion delegada: un reward solo es rendimiento (RCM_STAKING)
  // si hay posicion delegada que lo respalde; si no, es un regalo. La
  // posicion se lleva por programa y token y nunca baja de 0: al retirar
  // vuelve el capital mas el premio, y ese premio no puede dejar en
  // negativo lo que se delegue despues.
  const defiDelegacion = new Set();
  for (const rol of ["DEFI_POOL", "DEFI_STAKING", "DEFI_FARMING"]) {
    for (const a of fiscClavesBloque(pyO(bloqueRol(rol), {}))) defiDelegacion.add(normalizarDireccion(a));
  }
  const walletPropia = walletConfig();
  // Clave de dos partes (direccion, contrato o cola): JSON de [a, b].
  const clave2 = (a, b) => JSON.stringify([a, b]);
  const posicionDelegada = new Map();
  // Lo mandado y lo vuelto en total por programa y token, y el
  // sobrante ya avisado.
  const idaYVuelta = new Map();

  // Pools de liquidez (criterio de AFCripto): aportar no es una venta (el recibo SLP es un
  // resguardo) y el resultado se calcula al retirar. Cada hash en el que un
  // recibo (token de un contrato DEFI_POOL) va o viene de una direccion del
  // pool: el recibo y las patas de RNT o stablecoin contra el pool. Lo que
  // va al farming o llega de sus recompensas no es del pool.
  const pools = new Set(fiscClavesBloque(pyO(bloqueRol("DEFI_POOL"), {})).map(normalizarDireccion));
  const contraPool = r => pools.has(normalizarDireccion(r.origen || "")) ||
    pools.has(normalizarDireccion(r.destino || ""));
  const poolsPorHash = new Map();
  for (const r of registros) {
    if (r.categoria === "MOVIMIENTO" && pyVerdad(r.hash) && contraPool(r) &&
        pools.has(normalizarDireccion(r.contrato || ""))) {
      if (!poolsPorHash.has(r.hash)) poolsPorHash.set(r.hash, { recibo: r });
    }
  }
  for (const [h, info] of poolsPorHash) {
    info.patas = registros.filter(r => r.hash === h && r.categoria === "MOVIMIENTO" &&
      (r.contrato === RNT || STABLECOINS.has(r.contrato)) && contraPool(r));
    info.manual = registros.some(r => r.hash === h && r.categoria === "VENTA" && r.subcategoria === "GPP_POOL");
  }
  // {recibo: {recibo: unidades, aportado: {contrato: unidades}}}
  const posicionPool = new Map();
  // Stablecoin o POL mandados como movimiento neutro (a otra cuenta tuya)
  // a cada direccion: (direccion, cola) -> unidades. Lo que vuelve de ella
  // es el mismo dinero y no abre otro lote (si no, la vuelta contaria como
  // dinero nuevo y la cartera, doble).
  const enviadoNeutro = new Map();
  // Lo que crees que tienes en otras cuentas tuyas, por activo (para el
  // cuadre): cualquier token mandado como movimiento
  // neutro a una direccion que no es de Reental ni DeFi, menos lo que
  // vuelve de una de ellas (como deposito o como movimiento neutro, desde
  // la misma direccion o desde otra). No cambia ningun lote.
  const enOtras = new Map();
  const conocidas = new Set([BURN]);
  for (const bloque of Object.values(pyO(aprendidos, {}))) {
    if (pdEsObjeto(bloque)) {
      for (const a of Object.keys(bloque)) conocidas.add(normalizarDireccion(a));
    }
  }
  const walletYVault = new Set([walletConfig(), vaultConfig()].filter(x => x !== ""));
  const otraCuenta = direccion => pyVerdad(direccion) && !walletYVault.has(direccion) && !conocidas.has(direccion);
  const vuelveDeOtraCuenta = (activo, cantidad) => {
    const vuelve = pyMin((enOtras.get(activo) ?? 0), cantidad);
    if (vuelve > 0) enOtras.set(activo, enOtras.get(activo) - vuelve);
  };

  for (const r of registros) {
    for (const campo of CAMPOS_SOLO_MOTOR) delete r[campo];
    r.tipo_bce = pyVerdad(r.fecha) && fiscTiene(tipos, r.fecha.slice(0, 10)) ? tipos[r.fecha.slice(0, 10)] : null;
  }
  const paresCanje = emparejarCanjes(registros);
  const stables = stablesPorHash(cache);
  // Gas de cada hash (DGT V0648-24): el de una compra se suma a su coste
  // y, si en el hash no hay compra, el de una venta se resta de lo
  // cobrado. El resto (aprobar, traspasos) se queda solo.
  const gasPorHash = new Map(), hashesConCompra = new Set();
  for (const r of registros) {
    if (r.categoria === "COMISION" && pyVerdad(r.hash)) {
      fiscListaDe(gasPorHash, r.hash).push(r);
    } else if (r.categoria === "COMPRA" && pyVerdad(r.hash)) {
      hashesConCompra.add(r.hash);
    }
  }
  const gasUsado = new Set();

  /* EUR del gas del hash de r que aun no se ha llevado otra operacion (lo
     valora antes si hace falta); lo anota en r (gas_eur) y en el gas (a
     donde fue). */
  function gasDe(r, destino) {
    let total = 0;
    for (const g of gasPorHash.get(r.hash) || []) {
      if (gasUsado.has(g.clave)) continue;
      procesar(g);
      if (pyVerdad(g.importe_eur)) {
        gasUsado.add(g.clave);
        total += g.importe_eur;
        fiscAnadirNota(g, destino);
      }
    }
    if (pyVerdad(total)) {
      r.gas_eur = total;
      fiscAnadirNota(r, "incluye " + numEs(total) + " EUR de gas");
    }
    return total;
  }
  const distribuidores = new Set(fiscClavesBloque(pyO(bloqueRol("DISTRIBUIDOR"), {})).map(normalizarDireccion));

  /* En que colas de stablecoin entra o sale 'importe' de r, segun lo que
     se movio en su hash; las guarda en r.colas_stable. */
  function colasDe(r, lado, importe) {
    const movs = stables.has(r.hash) ? stables.get(r.hash)[lado] : [];
    const partes = repartirEnColas(movs, importe, STABLECOINS.has(r.contrato) ? r.contrato : USDT);
    r.colas_stable = partes.map(([cola]) => cola);
    // Parte de cada cola (para repartir la G/P en la hoja Cartera).
    r.partes_stable = {};
    for (const [cola, n] of partes) r.partes_stable[cola] = pyVerdad(importe) ? n / importe : 0;
    return partes;
  }

  // Lotes de cobros que llegan despues de la fecha de su registro (un
  // rendimiento se reclama o llega al vault dias despues del reparto): se
  // abren en su dia, para que la cartera a 31/12 no cuente lo que aun no
  // habia llegado. [[fecha, abrir]]
  const cobrosPendientes = [];
  /* Abre los lotes pendientes con fecha <= hasta (null: todos). */
  function soltarCobros(hasta = null) {
    cobrosPendientes.sort((a, b) => cmpTexto(a[0], b[0]));
    while (cobrosPendientes.length && (hasta === null || cobrosPendientes[0][0] <= hasta)) {
      cobrosPendientes.shift()[1]();
    }
  }

  /* La stablecoin que llega (un cobro) abre lote por lo que vale en EUR:
     es su coste para cuando se gaste (art. 37.1.h). fecha: la de la
     llegada, si es posterior a la del registro. */
  function abrirCobro(r, importe, eur, origen, fecha = null) {
    if (!fiscEsNumero(importe) || importe <= 0) {
      // Cobro de 0 (p. ej. un token regalado o perdido, escrito a mano): no
      // hay stablecoin que abrir (dividiria por 0 y el programa se pararia).
      return;
    }
    const partes = colasDe(r, "entra", importe);
    const abrir = () => {
      for (const [cola, cantidad] of partes) {
        fiscAbrirLote(r, colas, cola, cantidad, eur * cantidad / importe, origen, { fecha, coste_usd: cantidad });
      }
    };
    if (pyVerdad(fecha) && pyVerdad(r.fecha) && fecha > r.fecha) cobrosPendientes.push([fecha, abrir]);
    else abrir();
  }

  /* Saca de su cola (o colas) la stablecoin que se entrega. Devuelve
     [costeEur, [[cola, faltante]], trozos]. Cada trozo dice de que cola
     sale, para que el informe de un pago con USDT y USDC a la vez de una
     fila por moneda. */
  function sacarStable(r, importe) {
    let coste = 0;
    const faltantes = [], trozos = [];
    r.coste_por_cola = {};
    for (const [cola, cantidad] of colasDe(r, "sale", importe)) {
      const [c, faltante, t] = consumirFifo(colas, cola, cantidad);
      coste += c;
      r.coste_por_cola[cola] = c;
      for (const trozo of t) trozo.cola = cola;
      trozos.push(...t);
      if (pyVerdad(faltante)) faltantes.push([cola, faltante]);
    }
    return [coste, faltantes, trozos];
  }

  /* Pago con stablecoin (desde la wallet o desde el vault): es una permuta
     y la stablecoin entregada da G/P sobre su coste FIFO (valor: lo que
     vale en EUR). Sale de la cola de la que se pago de verdad (USDT o
     USDC, mirando el hash). */
  function permutaStable(r, valor) {
    const [costeStable, faltantes, trozos] = sacarStable(r, r.importe_usdt);
    if (faltantes.length) {
      fiscMarcarRevisar(r, "FIFO incompleto en el pago: faltan " +
        faltantes.map(([cola, f]) => cantidadEs(f) + " " + cola).join(", ") + " sin coste registrado");
      return;
    }
    r.coste_fifo_eur = costeStable;
    r.lotes_consumidos = trozos;
    r.gp_eur = valor - costeStable;
    r.codigo_concepto = "GP_CRIPTO";
    fiscAnadirNota(r, "permuta del " + r.colas_stable.join("/") +
      " entregado: G/P cambiaría sobre su coste de compra");
  }

  /* Una salida que no se puede valorar (sin tipo BCE) sale igual de la
     cartera: si no, la siguiente operacion de ese activo se llevaria un
     lote que ya no esta. */
  function sacarSinValorar(r) {
    const cat = r.categoria, sub = r.subcategoria;
    if (cat === "VENTA" && sub !== "GPP_POOL" && cantidadValida(r)) {
      if (sub === "GPP_SWAP" && STABLECOINS.has(r.contrato)) sacarStable(r, r.cantidad);
      else consumirFifo(colas, sub === "GPP_SWAP" ? nombreActivoFifo(r.contrato) : r.contrato, r.cantidad);
    } else if (cat === "RETIRADA" && sub === "GPP_RETIRADA" && cantidadValida(r)) {
      consumirFifo(colas, nombreActivoFifo(r.contrato), r.cantidad);
    } else if (cat === "COMPRA" && ["ONCHAIN", "VAULT"].includes(r.via_compra) &&
               fiscEsNumero(r.importe_usdt) && r.importe_usdt > 0) {
      sacarStable(r, r.importe_usdt);
    }
  }

  /* Lote de un deposito, sin la parte que vuelve de una direccion a la que
     se mando como movimiento neutro (ya estaba en la cartera). */
  function abrirDeposito(r, activo, eur, usd) {
    const cantidad = r.cantidad;
    const dir = normalizarDireccion(r.origen || "");
    const clave = clave2(dir, activo);
    const enviado = (enviadoNeutro.get(clave) ?? 0);
    const vuelve = fiscEsNumero(cantidad) && cantidad > 0 ? pyMin(enviado, cantidad) : 0;
    if (vuelve > 0) {
      enviadoNeutro.set(clave, enviadoNeutro.get(clave) - vuelve);
      vuelveDeOtraCuenta(activo, vuelve);
    }
    // Lo que llega de otra direccion mientras crees tener algo en otras
    // cuentas tuyas puede ser eso mismo que vuelve (un exchange devuelve
    // desde otra direccion): abriria otro lote y la cartera lo contaria dos
    // veces, sin que el cuadre lo viera. Se pregunta.
    const resto = fiscEsNumero(cantidad) ? cantidad - vuelve : 0;
    if (resto > pyMax(1e-12, Math.abs(cantidad) * 1e-10) &&
        ((enOtras.get(activo) ?? 0)) > 1e-9 && otraCuenta(dir)) {
      fiscMarcarRevisar(r, "llegan " + cantidadEs(resto) + " " + activo + " de otra dirección " +
        "mientras el programa cree que tienes " + cantidadEs(enOtras.get(activo)) + " en otras " +
        "cuentas tuyas: si es eso que vuelve, decídelo como movimiento neutro (si no, la cartera " +
        "lo cuenta dos veces)");
    }
    if (vuelve > 0) {
      fiscAnadirNota(r, "vuelven " + cantidadEs(vuelve) + " " + activo + " que mandaste a esta " +
        "dirección como movimiento neutro: ya estaban en tu cartera y no abren otro lote");
      if (cantidad - vuelve <= pyMax(1e-12, cantidad * 1e-10)) return;
      const parte = (cantidad - vuelve) / cantidad;
      fiscAbrirLote(r, colas, activo, cantidad - vuelve, eur * parte, "DEPOSITO",
        { coste_usd: fiscHay(usd) ? usd * parte : null });
      return;
    }
    fiscAbrirLote(r, colas, activo, cantidad, eur, "DEPOSITO", { coste_usd: usd });
  }

  /* [USD, EUR] de unas unidades de RNT o stablecoin el dia de r, o [null,
     null] si falta el precio o el tipo BCE. */
  function valorPool(r, contrato, cantidad) {
    let usd;
    if (STABLECOINS.has(contrato)) usd = cantidad;
    else {
      const precio = fiscPrecioDelDia(preciosRnt, r.fecha);
      usd = precio !== null ? cantidad * precio : null;
    }
    const eur = usd !== null ? fiscAEur(r, usd) : null;
    return eur !== null ? [usd, eur] : [null, null];
  }

  /* Aportacion o retirada de un pool (criterio de AFCripto). Aportar: nada
     sale de la cartera; se apuntan las unidades aportadas y el recibo.
     Retirar: se compara lo que vuelve con lo que toca en proporcion al
     recibo devuelto. Si es la retirada total, o de algun token vuelve mas
     de lo que toca, se calcula el resultado del tramo: sale de la cartera
     (a su coste FIFO) lo aportado y entra lo que vuelve a su valor de ese
     dia; la diferencia es G/P de otros elementos patrimoniales (casilla
     1626). Si no, es una retirada parcial sin resultado: se espera a la
     siguiente. */
  function liquidarPool(info) {
    const recibo = info.recibo;
    const pool = normalizarDireccion(recibo.contrato);
    if (!fiscEsNumero(recibo.cantidad)) return;
    const aporta = walletYVault.has(normalizarDireccion(recibo.destino || ""));
    if (info.manual) {
      // Resultado puesto a mano: lo da el ajuste. Al retirar, lo aportado
      // baja igual, en proporcion al recibo devuelto (si no, seguiria
      // «aportado a pools» para siempre).
      const pos = posicionPool.get(pool);
      if (!aporta && pyVerdad(pos) && pos.recibo > 0) {
        const queda = pyMax(1 - recibo.cantidad / pos.recibo, 0);
        if (queda <= 1e-9) {
          pos.recibo = 0;
          pos.aportado = {};
        } else {
          pos.recibo -= recibo.cantidad;
          const aportado = {};
          for (const [c, n] of Object.entries(pos.aportado)) aportado[c] = n * queda;
          pos.aportado = aportado;
        }
      }
      return;
    }
    const movido = {};   // contrato -> unidades hacia el pool (+) o de vuelta (-)
    for (const r of info.patas) {
      if (!fiscEsNumero(r.cantidad)) continue;
      const hacia = pools.has(normalizarDireccion(r.destino || ""));
      movido[r.contrato] = ((movido[r.contrato] ?? 0)) +
        (hacia ? r.cantidad : -r.cantidad);
    }
    if (!posicionPool.has(pool)) posicionPool.set(pool, { recibo: 0, aportado: {} });
    const pos = posicionPool.get(pool);
    if (aporta) {
      pos.recibo += recibo.cantidad;
      for (const [contrato, n] of Object.entries(movido)) {
        pos.aportado[contrato] = ((pos.aportado[contrato] ?? 0)) + n;
      }
      return;
    }
    const devuelto = recibo.cantidad;
    if (pos.recibo <= 0) {
      fiscMarcarRevisar(recibo, "retirada de un pool sin aportación registrada: no se puede " +
        "calcular su resultado");
      return;
    }
    const parte = pyMin(devuelto / pos.recibo, 1);
    const total = parte >= 1 - 1e-9;
    const vuelve = {}, toca = {};
    for (const [c, n] of Object.entries(movido)) if (n < 0) vuelve[c] = -n;
    for (const [c, n] of Object.entries(pos.aportado)) if (n > 0) toca[c] = n * parte;
    const exceso = Object.entries(vuelve).some(([c, n]) =>
      n > ((toca[c] ?? 0)) * (1 + 1e-9) + 1e-12);
    pos.recibo = total ? 0 : pos.recibo - devuelto;
    if (!(total || exceso)) {
      for (const [c, n] of Object.entries(vuelve)) {
        pos.aportado[c] = ((pos.aportado[c] ?? 0)) - n;
      }
      fiscAnadirNota(recibo, "retirada parcial sin resultado: no vuelve más de lo aportado; " +
        "se calcula al retirar el resto (criterio AFCripto)");
      return;
    }
    for (const [c, n] of Object.entries(toca)) pos.aportado[c] -= n;
    if (total) pos.aportado = {};
    // Lo que vuelve, a su valor de hoy; lo aportado, a su coste FIFO.
    const valores = {};
    for (const [c, n] of Object.entries(vuelve)) valores[c] = valorPool(recibo, c, n);
    if (Object.values(valores).some(([, eur]) => eur === null)) {
      fiscMarcarRevisar(recibo, "resultado del pool sin valorar: falta el precio de RNT o el " +
        "tipo BCE del día");
      return;
    }
    let coste = 0;
    const faltan = [];
    for (const [c, n] of Object.entries(toca)) {
      const activo = nombreActivoFifo(c);
      const [parcial, faltante] = consumirFifo(colas, activo, n);
      coste += parcial;
      if (pyVerdad(faltante)) faltan.push(cantidadEs(faltante) + " " + activo);
    }
    for (const [c, n] of Object.entries(vuelve)) {
      const [usd, eur] = valores[c];
      crearLote(colas, nombreActivoFifo(c), n, eur, recibo.fecha, "POOL", null, usd);
    }
    const valor = pySuma(Object.values(valores).map(([, eur]) => eur));
    recibo.importe_eur = valor;
    recibo.codigo_concepto = "GP_OTROS_ELEM";
    if (faltan.length) {
      fiscMarcarRevisar(recibo, "resultado del pool sin coste completo de lo aportado: faltan " +
        faltan.join(", "));
      return;
    }
    recibo.coste_fifo_eur = coste;
    recibo.gp_eur = valor - coste;
    fiscAnadirNota(recibo, "resultado del pool: lo que vuelve vale " + numEs(valor) + " EUR y lo " +
      "aportado costo " + numEs(coste) + " EUR (criterio AFCripto)");
  }

  // Valora un registro una sola vez (un canje procesa antes su venta).
  function procesar(r) {
    if (procesados.has(r.clave)) return;
    procesados.add(r.clave);
    const cat = r.categoria, sub = r.subcategoria;
    const anio = pyVerdad(r.fecha) ? parseInt(r.fecha.slice(0, 4), 10) : null;

    if (cat === "MOVIMIENTO") {
      const info = poolsPorHash.get(r.hash);
      if (info !== undefined && !info.hecho) {
        info.hecho = true;
        liquidarPool(info);
      }
      if (pyVerdad(r.cantidad)) {
        const origen = normalizarDireccion(r.origen || "");
        const destino = normalizarDireccion(r.destino || "");
        if ((STABLECOINS.has(r.contrato) || r.contrato === "pol") &&
            fiscEsNumero(r.cantidad) && r.cantidad > 0 && walletYVault.has(origen) &&
            pyVerdad(destino) && !walletYVault.has(destino) && !defiDelegacion.has(destino)) {
          const clave = clave2(destino, nombreActivoFifo(r.contrato));
          enviadoNeutro.set(clave, ((enviadoNeutro.get(clave) ?? 0)) + r.cantidad);
        }
        if (fiscEsNumero(r.cantidad) && r.cantidad > 0) {
          const activo = nombreActivoFifo(r.contrato);
          if (walletYVault.has(origen) && otraCuenta(destino)) {
            enOtras.set(activo, ((enOtras.get(activo) ?? 0)) + r.cantidad);
          } else if (walletYVault.has(destino) && otraCuenta(origen)) {
            // La vuelta decidida como movimiento neutro: ni abre lote ni
            // sigue en la otra cuenta.
            vuelveDeOtraCuenta(activo, r.cantidad);
            const clave = clave2(origen, activo);
            if (pyVerdad(enviadoNeutro.get(clave))) {
              enviadoNeutro.set(clave, pyMax(enviadoNeutro.get(clave) - r.cantidad, 0));
            }
          }
        }
        if (origen === walletPropia && defiDelegacion.has(destino)) {
          const clave = clave2(destino, r.contrato);
          posicionDelegada.set(clave, (posicionDelegada.get(clave) ?? 0) + r.cantidad);
          const t = idaYVuelta.get(clave) || { ida: 0, vuelta: 0, avisado: 0 };
          idaYVuelta.set(clave, Object.assign(t, { ida: t.ida + r.cantidad }));
        } else if (defiDelegacion.has(origen) && destino === walletPropia) {
          const clave = clave2(origen, r.contrato);
          posicionDelegada.set(clave, pyMax((posicionDelegada.get(clave) ?? 0) - r.cantidad, 0));
          // Se avisa, no se declara: si, con esta, ha vuelto en total más
          // de lo que se mandó en total, lo de más puede ser el premio.
          // Cada sobrante se avisa una vez, y no si ya lo
          // decidiste en 🔍 Revisión («dejar como movimiento»). Los pools no:
          // su resultado se calcula al retirar (liquidarPool).
          const t = idaYVuelta.get(clave);
          if (t && !pools.has(origen)) {
            t.vuelta += r.cantidad;
            const deMas = t.vuelta - t.ida;
            if (t.ida > 1e-9 && deMas - t.avisado > 1e-6) {
              t.avisado = deMas;
              if (ajusteDe(r.clave).revisar !== false) {
                fiscMarcarRevisar(r, "han vuelto " + cantidadEs(t.vuelta) + " y se mandaron " + cantidadEs(t.ida) + ": " +
                  cantidadEs(deMas) + " de más, que pueden ser el premio; la app no lo declara");
              }
            }
          }
        }
      }
      return;
    }

    if (cat === "REVISAR" && cobroDeReparto(r, distribuidores, walletYVault)) {
      // El cobro de un reparto que ya se declara con su fila (no cuadra con
      // ella, o la fila sigue pendiente) no es otro ingreso, pero la
      // stablecoin si llego: abre su lote, con lo que vale el dia que llego.
      // Si no, lo que se pagara despues con ella quedaria «FIFO incompleto».
      const eur = fiscAEur(r, r.importe_usdt);
      if (eur !== null) abrirCobro(r, r.importe_usdt, eur, "RENDIMIENTO");
      return;
    }
    if (cat === "SPAM" || cat === "REVISAR") return;

    if (cat === "COMISION") {
      // Gas: se paga en POL y sale de su cola FIFO. Si solo hay coste para
      // una parte, se valora esa parte y se anota lo que falta.
      if (pyVerdad(r.cantidad)) {
        const [coste, faltante] = consumirFifo(colas, "POL", r.cantidad);
        if (!pyVerdad(faltante) || coste > 0) {
          r.coste_fifo_eur = coste;
          r.importe_eur = coste;
        }
        if (pyVerdad(faltante)) {
          // Siempre se dice (si no, sin nada de coste, el total en euros
          // del gas saldria parcial sin avisar).
          r.gas_sin_coste_pol = faltante;
          fiscAnadirNota(r, cantidadEs(faltante) + " POL de gas sin coste de compra registrado");
        }
      }
      return;
    }

    if (pyVerdad(r.fecha) && r.tipo_bce === null && necesitaTipoBce(r)) {
      fiscMarcarRevisar(r, "sin tipo BCE para la fecha");
      sacarSinValorar(r);
      return;
    }

    if (cat === "RENDIMIENTO") {
      const eur = fiscAEur(r, r.importe_usdt);
      if (eur === null) {
        fiscMarcarRevisar(r, "importe del rendimiento sin valorar");
        return;
      }
      r.importe_eur = eur;
      r.codigo_concepto = "RCM_RENDIMIENTO";
      if (!["RCM_REINVERTIDO", "RCM_RECLAMADO", "RCM_PENDIENTE", "RCM_MIXTO"].includes(sub)) return;
      // Lo que llego a la wallet o al vault (reinvertido o reclamado) abre
      // lote de su stablecoin, con lo que vale en EUR el dia del reparto: es
      // su coste cuando se gaste (el USDT del vault como el de la wallet).
      if (pyVerdad(r.importe_usdt) && walletYVault.has(r.destino) && sub !== "RCM_PENDIENTE") {
        abrirCobro(r, r.importe_usdt, eur, "RENDIMIENTO", r.fecha_cobro ?? null);
      }
      if (integroRoto.has(r)) {
        fiscMarcarRevisar(r, "rendimiento sin declarar hasta corregir su íntegro");
        return;
      }
      if (!fiscHay(r.integro_usdt)) {
        // Sin fila del CSV (el rendimiento huerfano del vault o de la
        // wallet): se declara lo que llego, sin retencion.
        r.base_imponible_eur = eur;
        r.retencion_eur = 0;
        return;
      }
      // RCM_REINVERTIDO = reinvertido; RCM_RECLAMADO = reclamado (a la
      // wallet o al vault); RCM_PENDIENTE = repartido pero sin reclamar ni
      // reinvertir; RCM_MIXTO = parte y parte (la clasificacion lo deja a
      // revisar). Todos se declaran igual: el integro de la fila y la
      // retencion del CSV (0 en un pendiente); el mixto tambien, para que no
      // desaparezca sin aviso si se da por bueno en Revision. Lo que se haga
      // despues con ese dinero (del vault a la wallet = RETIRADA) no es otro
      // ingreso.
      const integro = r.integro_usdt;
      const retenido = pyO(r.retencion_usdt, 0);
      r.base_imponible_eur = fiscAEur(r, integro);
      r.retencion_eur = fiscAEur(r, retenido);
      avisosRendimientoCsv(r, sub, integro, retenido, anio, repeticionesCsv);
      return;
    }

    if (cat === "REWARD") {
      const contrato = r.contrato;
      let usd;
      // USDT y USDC: 1 = 1 USD.
      if (STABLECOINS.has(contrato)) usd = r.cantidad;
      else {   // RNT: precio historico de CoinGecko o aportado a mano
        const precio = fiscPrecioDelDia(preciosRnt, r.fecha);
        if (precio === null) {
          fiscMarcarRevisar(r, "sin precio histórico de RNT para la fecha");
          return;
        }
        usd = pyO(r.cantidad, 0) * precio;
      }
      const eur = fiscAEur(r, usd);
      if (eur === null) {
        fiscMarcarRevisar(r, "recompensa DeFi sin valorar");
        return;
      }
      r.importe_eur = eur;
      let respaldado = [...posicionDelegada.values()].some(v => v > 1e-9);
      // Si el usuario fijo la subcategoria en sus ajustes, manda la suya.
      const fijada = "subcategoria" in ajusteDe(r.clave);
      if (fijada) respaldado = sub !== "GPP_REGALO";
      if (sub === "GPP_REGALO" || !respaldado) {
        if (sub !== "GPP_REGALO") {
          r.subcategoria = "GPP_REGALO";
          fiscAnadirNota(r, "sin posición delegada que lo respalde: regalo, ganancia patrimonial " +
            "de la base general");
          if (posicionDelegada.size) {
            // Delegaste antes, pero hoy no queda nada: puede ser el premio
            // de lo que acabas de retirar. Duda del respaldo -> a revisar.
            fiscMarcarRevisar(r, "había una posición DeFi que ya se retiró: si la recompensa es " +
              "de ella, es rendimiento (fija la subcategoría RCM_REWARD en los ajustes)");
          }
        }
        r.codigo_concepto = "GP_BASE_GRAL";
        r.gp_eur = eur;
      } else {
        r.codigo_concepto = "RCM_STAKING";
        r.base_imponible_eur = eur;
        r.retencion_eur = 0;
      }
      // El reward abre lote en su cola FIFO (RNT, USDT o USDC).
      fiscAbrirLote(r, colas, nombreActivoFifo(contrato), r.cantidad, eur, "REWARD", { coste_usd: usd });
      return;
    }

    if (cat === "COMPRA") {
      // El gas se suma al coste solo cuando el lote se abre de verdad: no
      // darlo por usado si la compra no se puede valorar.
      const gas = () => gasDe(r, "gas de la compra: sumado a su coste");
      /* [EUR, USD] del lote con el gas sumado, en las dos monedas (sin el
         USD, el informe daria un cambio que no es el del BCE). */
      const conGas = (eur, usd) => {
        const g = gas();
        const tipo = r.tipo_bce;
        // Solo un tipo que sea un numero (puede haber uno en texto, escrito
        // a mano en la cache).
        return [eur + g, fiscHay(usd) && fiscEsNumero(tipo) && tipo > 0 ? usd + g * tipo : usd];
      };
      if (r.via_compra === "BANCARIA") {
        r.importe_eur = r.coste_eur;
        if (!fiscHay(r.coste_eur) && cantidadValida(r) && nombreActivoFifo(r.contrato) === "RNT") {
          // Un RNT sin precio (aún no lo has puesto en Revisión; un inmueble
          // siempre lleva el de por defecto):
          // entra en la cola sin coste, para que lo que se venda de ella
          // salga sin coste registrado y no se lleve otro lote.
          fiscListaDe(colas, nombreActivoFifo(r.contrato)).push({ cantidad: r.cantidad, coste_unitario_eur: 0, fecha: r.fecha,
            origen: "COMPRA_BANCO", coste_unitario_usd: null, sin_coste: true });
          fiscMarcarRevisar(r, "compra sin precio: se pone en Revisión, en Coste de las compras externas");
          return;
        }
        // La cola por nombre: una compra de RNT pagada en € (P11) va a la
        // del RNT; en los inmuebles, la dirección del contrato.
        const lote = fiscAbrirLote(r, colas, nombreActivoFifo(r.contrato), r.cantidad,
          !fiscHay(r.coste_eur) ? null : r.coste_eur + gas(), "COMPRA_BANCO");
        // Sin coste tuyo, el de por defecto (100 € por token): el informe
        // lo marca con «**».
        if (lote && !("coste_eur" in ajusteDe(r.clave))) lote.coste_supuesto = true;
        return;
      }
      if (r.via_compra === "CANJE") {
        // El token recibido hereda el coste FIFO de su burn (ver
        // emparejarCanjes), que se valora antes si aun no lo esta.
        const venta = paresCanje.get(r.clave);
        let coste = null, procedencia = null, costeUsd = null;
        if (venta !== undefined) {
          procesar(venta);
          coste = venta.coste_fifo_eur;
          const trozos = pyO(venta.lotes_consumidos, []);
          procedencia = procedenciaDeTrozos(trozos);
          if (trozos.length && trozos.every(t => fiscHay(t.coste_usd))) {
            costeUsd = pySuma(trozos.map(t => t.coste_usd));
          }
        }
        if (!fiscHay(coste)) {
          fiscMarcarRevisar(r, "canje sin coste de compra heredable del burn");
          return;
        }
        r.importe_eur = coste;
        // Tambien hereda de que compras viene (fecha de adquisicion).
        const [eur, usdLote] = conGas(coste, costeUsd);
        const trozos = venta !== undefined ? pyO(venta.lotes_consumidos, []) : [];
        // Sin cantidad recibida no se abre ningún lote: un solo aviso, no uno por trozo.
        if (!trozos.length || !(fiscEsNumero(r.cantidad) && r.cantidad > 0)) {
          fiscAbrirLote(r, colas, r.contrato, r.cantidad, eur, "CANJE", { procedencia, coste_usd: usdLote });
          return;
        }
        // FIFO real: un lote por cada trozo del burn, con su coste, no uno con la media de todos.
        // El gas se reparte por cantidad. Cada trozo conserva su coste en USD
        // aunque otro no lo tenga (una compra en USDT y otra por banco).
        const total = pySuma(trozos.map(t => t.cantidad));
        const tipo = r.tipo_bce;
        const gasUsd = fiscEsNumero(tipo) && tipo > 0 ? (eur - coste) * tipo : 0; // como conGas
        for (const t of trozos) {
          const parte = t.cantidad / total;
          const lote = fiscAbrirLote(r, colas, r.contrato, r.cantidad * parte, t.coste_eur + (eur - coste) * parte, "CANJE", {
            procedencia: procedenciaDeTrozos([t]),
            coste_usd: fiscHay(t.coste_usd) ? t.coste_usd + gasUsd * parte : null,
          });
          if (lote && t.coste_supuesto) lote.coste_supuesto = true;
        }
        return;
      }
      const coste = fiscAEur(r, r.importe_usdt);
      if (coste === null) {
        fiscMarcarRevisar(r, "compra sin coste valorable: lote FIFO no creado");
        return;
      }
      r.importe_eur = coste;
      const usd = r.importe_usdt;
      if (r.contrato === RNT || r.contrato === "pol") {
        const [eur, usdLote] = conGas(coste, usd);
        fiscAbrirLote(r, colas, nombreActivoFifo(r.contrato), r.cantidad, eur, "SWAP", { coste_usd: usdLote });
      } else if (STABLECOINS.has(r.contrato) && !fiscHay(r.via_compra)) {
        // Stablecoin recibida en un swap (de POL, de RNT o de otra
        // stablecoin): abre lote en la que llego de verdad.
        if (cantidadValida(r)) {
          const [total, totalUsd] = conGas(coste, usd);
          for (const [cola, cantidad] of colasDe(r, "entra", r.cantidad)) {
            fiscAbrirLote(r, colas, cola, cantidad, total * cantidad / r.cantidad, "SWAP",
              { coste_usd: totalUsd * cantidad / r.cantidad });
          }
        }
      } else if (STABLECOINS.has(r.contrato)) {
        // Pago con stablecoin sin el token en el hash (la compra del vault
        // de la regla 4, dada por buena): la stablecoin sale de la cartera y
        // es una permuta, como el pago de un inmueble (no se queda en la
        // cola sin G/P).
        permutaStable(r, coste);
      } else {
        const [eur, usdLote] = conGas(coste, usd);
        fiscAbrirLote(r, colas, r.contrato, r.cantidad, eur, "COMPRA", { coste_usd: usdLote });
        if (["ONCHAIN", "VAULT"].includes(r.via_compra)) {
          // Inmueble pagado con stablecoin, desde la wallet o desde el
          // vault: es una permuta.
          permutaStable(r, coste);
        }
      }
      return;
    }

    if (cat === "VENTA") {
      if (sub === "GPP_POOL") {
        r.codigo_concepto = "GP_OTROS_ELEM";
        if (!fiscHay(r.gp_eur)) {
          fiscMarcarRevisar(r, "resultado del pool sin ajuste del usuario (gp_eur en ajustes_usuario)");
        }
        return;
      }
      if (!cantidadValida(r)) return;
      const esCanje = pyVerdad(r.canje);
      let coste, faltante, trozos;
      if (sub === "GPP_SWAP" && STABLECOINS.has(r.contrato)) {
        // Stablecoin entregada en un swap: de la que salio de verdad.
        let faltantes;
        [coste, faltantes, trozos] = sacarStable(r, r.cantidad);
        faltante = pySuma(faltantes.map(([, f]) => f));
      } else {
        // Swap de RNT o POL: la cola va por nombre; en los inmuebles, por
        // la direccion del contrato.
        const activo = sub === "GPP_SWAP" ? nombreActivoFifo(r.contrato) : r.contrato;
        [coste, faltante, trozos] = consumirFifo(colas, activo, r.cantidad);
      }
      if (pyVerdad(faltante)) {
        // Sin G/P, pero lo cobrado si llego: abre su lote igual (si no, la
        // compra siguiente con ese dinero quedaria tambien a revisar o se
        // llevaria otro lote).
        fiscMarcarRevisar(r, "FIFO incompleto: faltan " + cantidadEs(faltante) +
          " unidades sin coste registrado");
        if (esCanje) return;
      } else {
        r.coste_fifo_eur = coste;
        r.lotes_consumidos = trozos;
        // Un token de inmueble no es una moneda virtual: otros elementos
        // patrimoniales, como en el informe (no monedas virtuales, casilla
        // 1800).
        r.codigo_concepto = sub === "GPP_INMUEBLE" ? "GP_OTROS_ELEM" : "GP_CRIPTO";
        if (esCanje) {
          // Canje (reembolso de capital): sale a su coste, sin G/P.
          r.importe_eur = coste;
          r.gp_eur = 0;
          return;
        }
      }
      const precio = fiscAEur(r, r.importe_usdt);
      if (precio === null) {
        fiscMarcarRevisar(r, "venta sin precio valorable");
        return;
      }
      if (!pyVerdad(faltante)) {
        const gas = hashesConCompra.has(r.hash) ? 0 : gasDe(r, "gas de la venta: restado de lo cobrado");
        r.importe_eur = precio - gas;
        r.gp_eur = precio - gas - coste;
      }
      if (pyVerdad(r.pago_diferido)) {
        // Venta con pago diferido: NO abre lote de stablecoin. Lo abre el
        // registro del cobro (DEPOSITO), con la stablecoin real y la fecha
        // del cobro. Se decide por el marcador pago_diferido, NUNCA por el
        // texto de la nota: la rama "venta P2P" de abajo abriria un lote de
        // USDT fijo.
      } else if (sub === "GPP_INMUEBLE" && (!stables.has(r.hash) || stables.get(r.hash).entra.length)) {
        // Venta P2P o liquidacion por settlement: la stablecoin cobrada (la
        // que llego de verdad) abre lote por el precio. Sin la transaccion
        // descargada, la del registro.
        abrirCobro(r, r.importe_usdt, precio, r.destino === BURN ? "LIQUIDACION" : "VENTA_P2P");
      } else if (sub === "GPP_INMUEBLE") {
        // Cobrada fuera de esta transaccion («Es una venta…» de Revision):
        // no entra stablecoin, asi que no hay lote que abrir; si el cobro
        // llega en otra, la abre ese deposito (no abrir un lote de USDT que
        // no esta).
        fiscAnadirNota(r, "cobro fuera de esta transacción: no abre lote de stablecoin");
      }
      return;
    }

    if (cat === "DEPOSITO") {
      // POL: coste del ajuste del usuario (coste_eur) o, si no, con el
      // precio en USD de precios_pol.
      if (r.contrato === "pol") {
        let coste = r.coste_eur ?? null;
        let usd = null;
        if (coste === null) {
          const precio = fiscPrecioDelDia(preciosPol, r.fecha);
          if (precio !== null) {
            usd = pyO(r.cantidad, 0) * precio;
            coste = fiscAEur(r, usd);
          }
        }
        if (coste === null) {
          // Donde se pone, en llano (sin nombrar campos de la cache).
          fiscMarcarRevisar(r, "depósito de POL sin coste: falta el precio de POL de ese día; " +
            "ponlo en la app (Revisión, Precios de POL)");
          return;
        }
        r.importe_eur = coste;
        abrirDeposito(r, "POL", coste, usd);
        return;
      }
      // Un coste puesto a mano (coste_eur) manda, como en el POL.
      const aMano = fiscHay(r.coste_eur);
      const eur = aMano ? r.coste_eur : fiscAEur(r, r.importe_usdt);
      if (eur === null) {
        fiscMarcarRevisar(r, "depósito sin valorar: lote FIFO no creado");
        return;
      }
      r.importe_eur = eur;
      // Abre lote en la cola FIFO de su token (USDT, USDC...).
      abrirDeposito(r, nombreActivoFifo(r.contrato), eur, aMano ? null : r.importe_usdt);
      return;
    }

    if (cat === "RETIRADA") {
      // Solo las retiradas GPP_RETIRADA dan G/P (valor - coste FIFO).
      if (sub !== "GPP_RETIRADA" || !cantidadValida(r)) return;
      let activo, valor;
      if (r.contrato === "pol") {
        activo = "POL";
        const precio = fiscPrecioDelDia(preciosPol, r.fecha);
        valor = precio !== null ? fiscAEur(r, pyO(r.cantidad, 0) * precio) : null;
      } else {
        // Resto de tokens: su cola FIFO por nombre y el valor en USD del
        // registro.
        activo = nombreActivoFifo(r.contrato);
        valor = fiscAEur(r, r.importe_usdt);
      }
      // Lo que sale, sale de la cartera aunque no se pueda valorar: si no,
      // la siguiente operacion de ese activo se llevaria un lote que ya no
      // esta.
      const [coste, faltante, trozos] = consumirFifo(colas, activo, r.cantidad);
      if (valor === null) {
        fiscMarcarRevisar(r, "retirada sin valorar" + (activo === "POL"
          ? ": falta el precio de POL de ese día; ponlo en la app (Revisión, Precios de POL)" : ""));
        return;
      }
      if (pyVerdad(faltante)) {
        fiscMarcarRevisar(r, "FIFO incompleto: faltan " + cantidadEs(faltante) + " " + activo +
          " sin coste registrado");
        return;
      }
      const gas = hashesConCompra.has(r.hash) ? 0 : gasDe(r, "gas de la retirada: restado de su valor");
      r.importe_eur = valor - gas;
      r.coste_fifo_eur = coste;
      r.lotes_consumidos = trozos;
      r.gp_eur = valor - gas - coste;
      r.codigo_concepto = "GP_CRIPTO";
    }
  }

  /* Unidades de cada activo aportadas ahora a pools. */
  function enPools() {
    const total = Object.create(null);   // un contrato «__proto__» es una clave mas
    for (const pos of posicionPool.values()) {
      for (const [contrato, n] of Object.entries(pos.aportado)) {
        if (n > 1e-9) {
          const activo = nombreActivoFifo(contrato);
          total[activo] = ((total[activo] ?? 0)) + n;
        }
      }
    }
    return total;
  }
  // Por fecha (un ajuste puede haber cambiado alguna despues de ordenar el
  // diario; con la misma fecha, el orden del diario): al cambiar de ano, lo
  // que queda en las colas es la cartera a 31/12 del anterior.
  /* Cartera a 31/12 de un ano (con los cobros llegados hasta ese dia). */
  function cerrar(anio) {
    soltarCobros(anio + "-12-31 23:59:59");
    cierres[anio] = posicionAbierta(colas);
    if (cierres_usd !== null) cierres_usd[anio] = costeUsdAbierto(colas);
    if (cierres_supuestos !== null) cierres_supuestos[anio] = conCosteSupuesto(colas);
    if (cierres_pools !== null) cierres_pools[anio] = enPools();
    if (cierres_otras !== null) {
      const otras = Object.create(null);
      for (const [a, n] of enOtras) if (n > 1e-9) otras[a] = n;
      cierres_otras[anio] = otras;
    }
  }

  let anioEnCurso = null;
  // Por el instante real (la hora repetida de octubre).
  const enOrden = ordenarPorFecha(registros.filter(r => pyVerdad(r.fecha)));
  for (const r of enOrden) {
    const anio = pyVerdad(r.fecha) ? parseInt(r.fecha.slice(0, 4), 10) : null;
    if (cierres !== null && anio !== null && anioEnCurso !== null && anio !== anioEnCurso) {
      // Tambien los anos sin movimientos de en medio: un cobro puede llegar
      // en uno de ellos (si no, ese ano tomaria la cartera del anterior y
      // le faltaria el cobro).
      for (let vacio = anioEnCurso; vacio < anio; vacio++) cerrar(vacio);
    }
    if (anio !== null) anioEnCurso = anio;
    if (pyVerdad(r.fecha)) soltarCobros(r.fecha);
    procesar(r);
  }
  if (cierres !== null && anioEnCurso !== null) {
    cerrar(anioEnCurso);
    // Y los anos siguientes en que aun llega un cobro (el reparto de
    // diciembre cobrado en enero, sin mas movimientos ese ano): si no, a la
    // cartera de ese ano le faltaria el cobro.
    while (cobrosPendientes.length) cerrar(++anioEnCurso);
  }
  // Los que no tienen fecha valida, despues de cerrar los anos: no se sabe
  // de que ano son, asi que no entran en la cartera a 31/12 de ninguno.
  for (const r of registros) if (!pyVerdad(r.fecha)) procesar(r);
  soltarCobros();
  if (apartado !== null) {
    for (const k of Object.keys(apartado)) delete apartado[k];
    const apartar = (activo, donde, n) => {
      if (n > 1e-9) {
        if (!fiscTiene(apartado, activo)) {
          // El objeto lo da quien llama; asi, «__proto__» es una clave mas.
          Object.defineProperty(apartado, activo, { value: { pools: 0, defi: 0, otras_cuentas: 0 },
            enumerable: true, writable: true, configurable: true });
        }
        apartado[activo][donde] += n;
      }
    };
    for (const [activo, n] of Object.entries(enPools())) apartar(activo, "pools", n);
    // Lo que va al pool ya esta en lo aportado: aqui solo staking y
    // farming.
    for (const [clave, n] of posicionDelegada) {
      const [destino, contrato] = JSON.parse(clave);
      if (!pools.has(destino)) apartar(nombreActivoFifo(contrato), "defi", n);
    }
    for (const [activo, n] of enOtras) apartar(activo, "otras_cuentas", n);
  }
  return colas;
}

/* Totales por ano: bases de rendimientos y rewards, retenciones, G/P
   (positiva, negativa, neta, otros elementos y base general) y gas.

   Los rendimientos (integro) se reparten ademas en los que llevan
   retencion y los que no: la suma de los dos es
   base_rendimientos_eur. Ningun total resta la retencion del integro.

   Solo sobre la copia que ya paso por motorFiscal: sobre los registros
   clasificados sumaria lo escrito a mano en los ajustes (base imponible,
   G/P) o daria 0. */
function resumenFiscalAnual(registros) {
  const anios = {};
  const bloque = anio => {
    if (!fiscTiene(anios, anio)) {
      anios[anio] = {
        base_rendimientos_eur: 0, base_rendimientos_con_retencion_eur: 0,
        base_rendimientos_sin_retencion_eur: 0, base_rewards_eur: 0, retenciones_eur: 0,
        gp_positiva_eur: 0, gp_negativa_eur: 0, gp_neta_eur: 0, gp_otros_elem_eur: 0,
        gp_base_general_eur: 0, comisiones_gas_pol: 0, comisiones_gas_eur: null,
      };
    }
    return anios[anio];
  };
  for (const r of registros) {
    if (!pyVerdad(r.fecha)) continue;
    const b = bloque(parseInt(r.fecha.slice(0, 4), 10));
    const codigo = r.codigo_concepto;
    if (codigo === "GP_BASE_GRAL") {
      b.gp_base_general_eur += pyO(r.gp_eur, 0);
    } else if (r.categoria === "RENDIMIENTO" && fiscHay(r.base_imponible_eur)) {
      b.base_rendimientos_eur += r.base_imponible_eur;
      b.retenciones_eur += pyO(r.retencion_eur, 0);
      if (pyO(r.retencion_eur, 0) > 0) b.base_rendimientos_con_retencion_eur += r.base_imponible_eur;
      else b.base_rendimientos_sin_retencion_eur += r.base_imponible_eur;
    } else if (r.categoria === "REWARD" && fiscHay(r.base_imponible_eur)) {
      b.base_rewards_eur += r.base_imponible_eur;
    } else if (fiscHay(r.gp_eur)) {
      if (r.gp_eur >= 0) b.gp_positiva_eur += r.gp_eur;
      else b.gp_negativa_eur += r.gp_eur;
      b.gp_neta_eur += r.gp_eur;
      if (codigo === "GP_OTROS_ELEM") b.gp_otros_elem_eur += r.gp_eur;
    }
    if (r.categoria === "COMISION") {
      b.comisiones_gas_pol += pyO(r.cantidad, 0);
      if (fiscHay(r.importe_eur)) b.comisiones_gas_eur = pyO(b.comisiones_gas_eur, 0) + r.importe_eur;
    }
  }
  return anios;   // claves de ano: JavaScript ya las recorre en orden
}

/* Lotes FIFO no consumidos: {activo: [cantidad, coste_eur_total]}. */
function posicionAbierta(colas) {
  const posicion = Object.create(null);   // un contrato «__proto__» es una clave mas
  for (const [activo, lotes] of colas) {
    const cantidad = pySuma(lotes.map(l => l.cantidad));
    const coste = pySuma(lotes.map(l => l.cantidad * l.coste_unitario_eur));
    if (cantidad > 1e-9) posicion[activo] = [cantidad, coste];
  }
  return posicion;
}

/* Activos con algún lote abierto de coste supuesto (compra bancaria sin
   coste tuyo). */
function conCosteSupuesto(colas) {
  return [...colas].filter(([, lotes]) => lotes.some(l => l.cantidad > 1e-9 && l.coste_supuesto)).map(([a]) => a);
}

/* Lo que costaron en USD los lotes no consumidos: {activo: [usd,
   completo]}. usd suma los lotes que lo saben (null si ninguno) y completo
   dice si lo saben todos (una compra por banco no tiene USD). */
function costeUsdAbierto(colas) {
  const costes = Object.create(null);
  for (const [activo, lotes] of colas) {
    const abiertos = lotes.filter(l => l.cantidad > 1e-9);
    const conUsd = abiertos.filter(l => fiscHay(l.coste_unitario_usd));
    if (abiertos.length) {
      costes[activo] = [conUsd.length ? pySuma(conUsd.map(l => l.cantidad * l.coste_unitario_usd)) : null,
        conUsd.length === abiertos.length];
    }
  }
  return costes;
}
