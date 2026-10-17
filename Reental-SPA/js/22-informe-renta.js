/* =====================================================================
   REENTAL SPA · js/22-informe-renta.js
   El informe para la Renta de la app: informesRentaAnuales e
   informeRentaAnio (las cifras de referencia las comprueba
   tests/paridad_informe_renta_paso_52f.js). Sin pantalla: lo llama la
   pestaña Fiscal.

   Como llamarlo: con lo que deja UNA pasada de motorFiscal (js/21) sobre
   una copia nueva de los registros clasificados (ver su cabecera):

     const regs = structuredClone(state.registros);
     const op = { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {}, cierres_supuestos: {} };
     motorFiscal(regs, state.cache, state.config, op);
     const informes = informesRentaAnuales(regs, resumenFiscalAnual(regs),
       state.config, { ...op, cache: state.cache, hoy, descarga_incompleta });

   Devuelve {ano: informe} con la forma del «informe_renta» de
   reental_datos.json. Solo lee: no cambia nada.

   Como en js/21, para que las cifras salgan iguales hasta el centimo: las
   sumas de listas van por pySuma (compensada) y las de un bucle con +=,
   sin compensar; el redondeo es pyRedondeo (los empates al par) y los
   {contrato: nombre} son Map (un contrato «__proto__» o
   «toString» es una clave mas).
   ===================================================================== */

/* Textos del informe: sin consejos de casillas ni de países, y con un
   descargo genérico. Las paridades los comparan con las cifras de
   referencia de la app (tests/cifras_referencia/). */
const VERSION_INFORME_RENTA = 2;
const TIPO_RENDIMIENTO = {
  RCM_REINVERTIDO: "Rendimiento reinvertido",
  RCM_RECLAMADO: "Rendimiento reclamado",
  RCM_PENDIENTE: "Rendimiento pendiente",
  RCM_MIXTO: "Rendimiento mixto",
};
const ALCANCE_RENTA = "Operaciones de la wallet indicada con Reental en la red Polygon: rendimientos de inmuebles tokenizados, recompensas DeFi, compras y ventas de tokens y cambios entre monedas virtuales. No incluye otras wallets ni otras plataformas.";
const NOTA_PATRIMONIO = "Tokens de inmuebles valorados a su coste de compra (no cotizan). Los canjes de contrato no se computan: no suponen entrada ni salida de dinero.";
const NOTA_DESINVERTIDO = "Coste de compra de los tokens vendidos. El importe cobrado y la ganancia o pérdida figuran en el punto 3.";
const NOTA_NETO = "Íntegro menos retenciones.";
const NOTA_GAS = "El de cada compra va en su coste y el de cada venta se resta de lo cobrado (DGT V0648-24): no lo restes otra vez.";
const NOTA_SIN_TRANSMISION = "Airdrops, regalos y referidos. Se integran en la base general.";
const NOTA_EJERCICIO_EN_CURSO = "Ejercicio en curso: posición a la fecha de los últimos datos disponibles.";
const NOTA_CENTIMOS = "Cada total se suma con todos los decimales y se redondea al final. El neto (íntegro − retención), la ganancia o pérdida (transmisión − adquisición) y el desinvertido (capital inicial + invertido − capital final) se obtienen de importes ya redondeados, para que cada cuenta salga al céntimo. La suma a mano de una columna larga puede diferir unos céntimos del total.";
const NOTA_INVERSIONES_ACTIVAS = "Activos valorados a su coste de compra, no a su valor de mercado (los tokens de inmuebles no cotizan). El coste figura en dólares cuando la compra se pagó en dólares, y en euros al tipo de cambio del día de cada compra. Las compras externas y los costes puestos a mano en euros no tienen importe en dólares (—).";
const NOTA_USD_PARCIAL = "* Importe de la parte comprada en dólares; el resto tiene su coste en euros (compra externa o coste puesto a mano). El coste en euros corresponde al total.";
const DIVISA_INFORME_EUR = "Euro (EUR). En el detalle, también en dólares (USD).";
// La hora de las fechas, tras el periodo del informe (PDF y Excel).
const HORA_INFORME = ", en hora peninsular española";
const NOTA_RESUMEN_INFORME = "Importes en euros. El detalle figura en el apartado III.";
const NOTA_DETALLE_INFORME = "Importes en dólares (USD) y en euros (EUR).";
const NOTA_CANJE_INFORME = "* Token recibido en un canje de contrato: se indica la fecha de la compra original.";
// Compra externa de un inmueble sin coste tuyo. «Incluye»: la fila puede juntar otras
// compras con su coste.
const NOTA_COSTE_SUPUESTO = "** Incluye compras externas de inmuebles sin coste indicado, a 100 € por token.";
// Genérico, sin casillas ni países: la app facilita, no es una guía fiscal.
const DESCARGO_RENTA = "Este informe es una ayuda para preparar la declaración: lo genera un programa con las operaciones de la wallet, el archivo de rendimientos de Reental y los tipos de cambio del Banco Central Europeo. No es un documento oficial ni lo emite Reental. Antes de presentar la declaración, confírmalo con un asesor.";
const GLOSARIO_RENTA = [
  ["Token", "Representación digital de un activo registrada en una blockchain."],
  ["Tokenización", "Convertir los derechos sobre un activo en tokens. Permite dividirlo en partes pequeñas (unos 100 euros o dólares por token) y transmitirlas con rapidez y a bajo coste."],
  ["Inmueble tokenizado", "Inmueble cuya explotación se reparte en tokens. El token da derecho a los rendimientos y a la plusvalía de su venta, no a la propiedad directa."],
  ["Security token", "Token que representa un contrato de inversión y está sujeto a la regulación de valores. Los tokens de los inmuebles de Reental lo son."],
  ["Utility token", "Token de utilidad: da ventajas y acceso a funciones de una plataforma, no una participación en un inmueble. El RNT es el de Reental."],
  ["Préstamo participativo", "Préstamo cuya retribución depende de cómo vaya la sociedad que lo recibe: aquí, de la explotación del inmueble."],
  ["Rendimiento", "Lo que reparte cada inmueble por su explotación (el alquiler), en proporción a tus tokens. Se paga en USDT, normalmente cada mes. Es un rendimiento del capital mobiliario."],
  ["Rendimiento reinvertido", "Pasa al vault para comprar tokens de otro inmueble. No lleva retención."],
  ["Rendimiento reclamado", "Lo pides y llega a tu wallet en USDT. Puede llevar retención."],
  ["Rendimiento pendiente", "Reparto que Reental ya puso a tu disposición y aún no has reclamado ni reinvertido. Cuenta en el año del reparto."],
  ["Plusvalía", "Aumento del valor de un activo con el tiempo; se cobra al venderse el inmueble o el token."],
  ["Vault", "Contrato de Reental donde quedan los rendimientos reinvertidos, en USDT, listos para comprar tokens de otro inmueble."],
  ["Wallet", "Cartera digital desde la que guardas, envías y recibes tokens y monedas virtuales (por ejemplo, MetaMask)."],
  ["Blockchain y Polygon", "Registro compartido donde quedan anotadas las operaciones sin un intermediario central. Reental usa la red Polygon."],
  ["Stablecoin", "Moneda virtual pensada para mantener un valor estable. USDT y USDC siguen al dólar: 1 equivale a 1 dólar."],
  ["POL y comisiones de red (gas)", "POL (antes MATIC) es la moneda de la red Polygon. Con ella se paga la comisión de cada operación, llamada gas."],
  ["Staking, pools y farming", "Programas en los que dejas tokens o monedas virtuales a cambio de un premio."],
  ["Recompensas DeFi", "Lo que recibes por dejar RNT o tokens en staking, pools o farming del entorno de Reental."],
  ["Mercado secundario (P2P)", "Venta directa de tokens a otro inversor acreditado en la plataforma."],
  ["Airdrops, regalos y referidos", "Tokens que llegan sin pagar por ellos ni tener nada en staking o pools."],
  ["Canje de contrato", "Cambio de un token por el de un contrato nuevo del mismo inmueble. No es una venta."],
  ["Permuta", "Cambiar una moneda virtual por otra cosa (otra moneda o un token). Cuenta como una venta de lo que entregas."],
  ["Íntegro", "Todo el rendimiento repartido, antes de impuestos."],
  ["Retención", "Impuesto que Reental ya ingresó en Hacienda a tu nombre al reclamar un rendimiento."],
  ["Neto", "Íntegro menos retención."],
  ["Inversiones activas", "Lo que conservas al final del año, valorado por lo que te costó."],
  ["Coste de compra", "Lo que pagaste por un activo, gas incluido, en euros del día de la compra."],
  ["FIFO", "Al vender, salen primero las unidades que compraste antes."],
  ["Valor de adquisición", "Coste de compra de lo que se vende."],
  ["Valor de transmisión", "Lo cobrado por lo vendido, o lo que vale lo entregado el día de la operación, menos el gas."],
  ["Ganancia o pérdida patrimonial", "Valor de transmisión menos valor de adquisición."],
  ["Tipo de cambio", "Dólares por euro del Banco Central Europeo del día de cada operación."],
];
const NOTA_METODOLOGICA_RENTA = [
  ["Fuentes", "Las operaciones salen de la blockchain (red Polygon, vía Etherscan); los rendimientos, del archivo (.csv) que Reental deja descargar en «Rendimientos»; los tipos de cambio, del Banco Central Europeo; el precio de RNT y POL, de CoinGecko o, si falta, del dato que aportaste."],
  ["Fechas", "La blockchain y el archivo de Reental dan la hora en UTC. El informe la pasa a hora peninsular española, que decide el día y el año de cada operación y su tipo de cambio."],
  ["Año de cada rendimiento", "El de la fecha en que Reental lo pone a tu disposición (la fecha de su archivo), lo reinviertas, lo reclames o lo dejes pendiente. Cada rendimiento cuenta una sola vez."],
  ["Íntegro y retención", "Se toman del archivo de Reental y nunca se calculan ni se suponen. El íntegro y la retención se declaran por separado, sin restar; el neto es solo informativo. Retirar después dinero del vault a la wallet no es un ingreso nuevo."],
  ["Tipo de cambio", "Cada importe en dólares se pasa a euros con el tipo del BCE de su día (serie EXR/D.USD.EUR.SP00.A); en fines de semana y festivos, el último publicado."],
  ["Coste y método FIFO", "El valor de adquisición es el coste de compra en euros del día de la compra. Al vender, salen primero las unidades más antiguas; una venta puede salir de varias compras y se enseña una fila por cada fecha de compra. La ganancia o pérdida se calcula en euros. Una compra externa o un coste puesto a mano en euros no tiene importe en dólares (—). Una compra externa de un inmueble lleva el coste en euros que indicaste o, si no, 100 € por token."],
  ["Canjes de contrato", "Cuando Reental cambia un token por el de un contrato nuevo no entra ni sale dinero: no se trata como venta y el token nuevo conserva el coste y la fecha de cada compra original (si vino de varias, uno por cada compra)."],
  ["Ventas con cobro aparte", "Una venta cobrada en otra transacción, antes o después y en uno o varios cobros, se valora por la suma de los cobros vinculados, al tipo de cambio del día de la venta, y cuenta en el año de la venta. Mientras no esté cobrada entera, figura en el apartado IV."],
  ["Permutas", "Pagar un inmueble con USDT, cambiar una moneda virtual por otra o enviarla fuera se trata como una transmisión de lo entregado, con su ganancia o pérdida por la diferencia de cambio."],
  ["Recompensas", "Se valoran al precio del día en que llegan; ese valor es también su coste de compra. Mandar tokens a staking, pools o farming no es una venta, y lo que vuelve no es una recompensa: si vuelve más de lo mandado, figura en el apartado IV y no se declara. Una recompensa sin nada en staking ni en pools figura como regalo."],
  ["Pools de liquidez", "Aportar a un pool no es una venta. La ganancia o pérdida se calcula al retirar."],
  ["Monedas que llegan", "Los USDT y USDC que llegan a la wallet tienen como coste su valor en euros del día de llegada."],
  ["Inversiones activas", "A coste de compra, porque los tokens de inmuebles no cotizan. El vault, por su saldo en USDT al tipo de cambio del día de cierre."],
  ["Comisiones de red", "El gas de una compra se suma a su coste y el de una venta se resta de lo cobrado (DGT V0648-24). El total del apartado 4 es informativo."],
  ["Céntimos", NOTA_CENTIMOS],
];
const APARTADO_FISCAL = {
  RCM_RENDIMIENTO: "Rendimientos del capital mobiliario (base del ahorro)",
  RCM_STAKING: "Rendimientos del capital mobiliario (base del ahorro)",
  GP_CRIPTO: "Ganancias y pérdidas patrimoniales por transmisión de monedas virtuales (base del ahorro)",
  GP_OTROS_ELEM: "Ganancias y pérdidas patrimoniales por transmisión de otros elementos patrimoniales (base del ahorro)",
  GP_BASE_GRAL: "Ganancia patrimonial que no deriva de transmisión (base general)",
};
const APARTADO_VENTA_INMUEBLE = "Ganancias y pérdidas patrimoniales por transmisión de otros elementos patrimoniales (base del ahorro).";

const ACTIVOS_NO_INMUEBLE = ["RNT", "USDT", "USDC", "POL"];
const OTROS_CRIPTOACTIVOS = [["USDT", "USDT (wallet)"], ["USDC", "USDC (wallet)"],
  ["RNT", "RNT"], ["POL", "POL"]];

/* x a n decimales: redondea el numero guardado tal cual es, con los
   empates exactos al par (toFixedPython); sin importe, lo mismo. */
function pyRedondeo(x, n) {
  if (typeof x !== "number") return x;
  const r = parseFloat(toFixedPython(Math.abs(x), n));
  return x < 0 || Object.is(x, -0) ? -r : r;
}
function pyGet(obj, clave, defecto) { return fiscTiene(obj, clave) ? obj[clave] : defecto; }
/* La primera en mayuscula y el resto en minusculas. */
function pyCapitalizar(t) { return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase(); }
/* Un {contrato: nombre} como Map (la pestaña Fiscal puede pasar un objeto). */
function rentaComoMap(x) {
  if (Object.prototype.toString.call(x) === "[object Map]") return x;
  return new Map(Object.entries(x));
}
/* Por fecha y clave, como «sorted(..., key=lambda x: (x["fecha"], x["clave"]))». */
// La fecha, por el instante real (la hora repetida de octubre).
function rentaPorFechaYClave(a, b) { return cmpTexto(fechaParaOrdenar(a), fechaParaOrdenar(b)) || cmpTexto(a.clave, b.clave); }

/* Importe redondeado al centimo (sin -0.0); null si no hay importe. */
function rentaEur2(x) {
  if (!fiscHay(x)) return null;
  const v = pyRedondeo(x, 2);
  return v !== 0 ? v : 0;
}

/* Cola FIFO de un token de inmueble (su clave es la direccion). Con
   nombres (los inmuebles conocidos: catalogo y compras o ventas), solo
   esos: otro token (un deposito con su coste puesto a mano) va a otros
   criptoactivos, no al capital de Patrimonio. Con nombres vacio,
   ninguno. */
function rentaEsInmueble(activo, nombres) {
  if (ACTIVOS_NO_INMUEBLE.includes(activo)) return false;
  return fiscHay(nombres) ? nombres.has(activo) : true;
}

/* Periodo sin el nombre del inmueble delante ('#8/2026'). */
function rentaPeriodoCorto(registro) {
  const inmueble = pyO(registro.inmueble, "");
  let periodo = pyO(registro.periodo_fiscal, "");
  if (inmueble && periodo.startsWith(inmueble)) periodo = periodo.slice(inmueble.length).trim();
  return periodo;
}

/* Burn de un canje de contrato (no es una venta: sin G/P). Lo marca el
   motor fiscal (emparejarCanjes), no el texto de la nota. */
function rentaEsCanje(registro) { return pyVerdad(registro.canje); }

/* EUR -> USD con el tipo BCE del registro (el camino inverso al del
   motor); null si falta algo. */
function rentaAUsd(registro, importeEur) {
  const tipo = registro.tipo_bce;
  if (!fiscHay(importeEur) || !pyVerdad(tipo)) return null;
  return importeEur * tipo;
}

/* Rendimientos con base imponible (los del resumen fiscal), por fecha. */
function rentaRendimientosDeclarables(registrosAnio) {
  return registrosAnio.filter(r => r.categoria === "RENDIMIENTO" && fiscHay(r.base_imponible_eur))
    .sort(rentaPorFechaYClave);
}

/* Resultado de un pool de liquidez: otros elementos patrimoniales que
   no son la venta de un token de inmueble (que lleva el mismo codigo). */
function rentaEsResultadoPool(r) {
  return r.codigo_concepto === "GP_OTROS_ELEM" &&
    !(r.categoria === "VENTA" && r.subcategoria === "GPP_INMUEBLE");
}

/* Nombre del inmueble de una compra o una venta ('' si no es de un
   inmueble). Una venta o una compra bancaria dada por buena en Revision
   (o en los ajustes) no lleva el nombre: sale del catalogo y, si tampoco
   esta, la subcategoria de la venta dice que es de un inmueble (no va a
   las permutas de monedas virtuales). */
function rentaInmuebleDe(r, nombres) {
  if (r.categoria !== "COMPRA" && r.categoria !== "VENTA") return "";
  let nombre = pyVerdad(r.inmueble) ? r.inmueble : nombres.get(r.contrato);
  if (!pyVerdad(nombre) && r.categoria === "VENTA" && r.subcategoria === "GPP_INMUEBLE") {
    nombre = pyO(r.token, pyO(r.contrato, "Inmueble"));
  }
  return pyO(nombre, "");
}

/* Registros con G/P patrimonial del ahorro, separados en ventas de
   tokens inmobiliarios (VENTA de un inmueble) y permutas de criptomonedas
   (swaps, permuta de USDT en compras, retiradas valoradas y pools). */
function rentaGpDelEjercicio(registrosAnio, nombres) {
  const ventas = [], permutas = [];
  for (const r of registrosAnio) {
    if (!fiscHay(r.gp_eur) || r.codigo_concepto === "GP_BASE_GRAL") continue;
    if (r.categoria === "RENDIMIENTO" || r.categoria === "REWARD") continue;
    if (r.categoria === "VENTA" && pyVerdad(rentaInmuebleDe(r, nombres || new Map()))) ventas.push(r);
    else permutas.push(r);
  }
  return [ventas, permutas];
}

/* Integro, retencion y neto de una fila o un total, en USD y en euros,
   redondeados al centimo; el neto, restando los dos ya redondeados. El %
   de retencion (calculado, nunca supuesto), solo si la hay. */
function rentaImportesRendimiento(integroUsd, integroEur, retUsd, retEur) {
  const iUsd = rentaEur2(integroUsd), iEur = rentaEur2(integroEur);
  const rUsd = rentaEur2(retUsd), rEur = rentaEur2(retEur);
  return {
    integro_usd: iUsd, integro_eur: iEur,
    retencion_usd: rUsd, retencion_eur: rEur,
    pct_retencion: retEur > 0 && pyVerdad(integroEur) ? pyRedondeo(retEur / integroEur * 100, 2) : null,
    neto_usd: iUsd !== null ? rentaEur2(iUsd - rUsd) : null,
    neto_eur: rentaEur2(iEur - rEur),
  };
}

/* III.1: una sola tabla de rendimientos, con los subtotales con y sin
   retencion y el total. */
function rentaTablaRendimientos(declarables) {
  const filas = [];
  const acum = { con: [0, 0, 0, 0, 0], sin: [0, 0, 0, 0, 0], total: [0, 0, 0, 0, 0] };
  for (const r of declarables) {
    const integroUsd = pyO(fiscHay(r.integro_usdt) ? r.integro_usdt : r.importe_usdt, 0);
    const integroEur = r.base_imponible_eur;
    const retUsd = pyO(r.retencion_usdt, 0);
    const retEur = pyO(r.retencion_eur, 0);
    for (const clave of [retEur > 0 ? "con" : "sin", "total"]) {
      const a = acum[clave];
      a[0] += 1;
      a[1] += integroUsd;
      a[2] += integroEur;
      a[3] += retUsd;
      a[4] += retEur;
    }
    const fila = { clave: r.clave, fecha: r.fecha.slice(0, 10),
      inmueble: pyO(r.inmueble, ""),
      periodo: rentaPeriodoCorto(r),
      tipo: pyGet(TIPO_RENDIMIENTO, r.subcategoria, "Rendimiento") };
    Object.assign(fila, rentaImportesRendimiento(integroUsd, integroEur, retUsd, retEur));
    filas.push(fila);
  }

  function total(clave) {
    const [n, iUsd, iEur, rUsd, rEur] = acum[clave];
    const t = { repartos: n };
    Object.assign(t, rentaImportesRendimiento(iUsd, iEur, rUsd, rEur));
    if (clave === "total") t.pct_retencion = null;   // mezcla filas con y sin retencion: sin %
    return t;
  }

  return {
    a_declarar_en: APARTADO_FISCAL.RCM_RENDIMIENTO,
    filas,
    subtotal_con_retencion: total("con"),
    subtotal_sin_retencion: total("sin"),
    total: total("total"),
  };
}

/* Nombre de una direccion en los contratos aprendidos de la cache (p. ej.
   el origen de un reward); si no esta, la propia direccion. */
function rentaNombreContratoAprendido(addr, cache) {
  addr = normalizarDireccion(addr);
  for (const bloque of Object.values(pyGet(cache, "contratos_aprendidos", {}))) {
    if (fiscTiene(bloque, addr)) return bloque[addr];
  }
  return addr;
}

/* III.2: recompensas DeFi que son rendimiento (RCM_STAKING). */
function rentaTablaRecompensas(registrosAnio, cache) {
  const filas = [];
  let totalUsd = 0, totalEur = 0;
  const lista = registrosAnio.filter(x => x.codigo_concepto === "RCM_STAKING" && fiscHay(x.base_imponible_eur))
    .sort(rentaPorFechaYClave);
  for (const r of lista) {
    const eur = r.base_imponible_eur;
    const usd = pyO(rentaAUsd(r, eur), 0);
    const cantidad = pyO(r.cantidad, 0);
    totalUsd += usd;
    totalEur += eur;
    let origen = pyO(r.origen, "");
    if (pyVerdad(origen) && fiscHay(cache)) origen = rentaNombreContratoAprendido(origen, cache);
    filas.push({
      clave: r.clave, fecha: r.fecha.slice(0, 10), origen,
      token: pyO(r.simbolo, pyO(r.token, "")),
      cantidad: pyRedondeo(cantidad, 6),
      precio_usd: pyVerdad(cantidad) ? pyRedondeo(usd / cantidad, 6) : null,
      precio_eur: pyVerdad(cantidad) ? pyRedondeo(eur / cantidad, 6) : null,
      importe_usd: rentaEur2(usd), importe_eur: rentaEur2(eur) });
  }
  return { a_declarar_en: APARTADO_FISCAL.RCM_STAKING, filas,
    total: { recompensas: filas.length, importe_usd: rentaEur2(totalUsd),
      importe_eur: rentaEur2(totalEur) } };
}

/* Security token / stablecoin / utility token / criptomoneda. */
function rentaTipoDeActivo(registro, esVentaInmueble) {
  if (esVentaInmueble) return "Security token";
  if (registro.categoria === "COMPRA" || STABLECOINS.has(registro.contrato)) {
    return "Stablecoin";   // en una compra on-chain se entrega USDT
  }
  if (registro.contrato === RNT) return "Utility token";
  return "Criptomoneda";
}

/* III.3 y III.4: ventas de tokens de inmuebles o permutas de monedas
   virtuales, con una fila por cada compra (lote FIFO) de la que sale la
   operacion (lotes_consumidos del motor). En un lote llegado por canje,
   la fecha de adquisicion es la de la compra original (su procedencia). */
function rentaTablaTransmisiones(registros, esVentaInmueble, nombres) {
  const filas = [];
  let tAdq = 0, tTransm = 0, tTransmUsd = 0;
  let tAdqUsd = 0;
  for (const r of [...registros].sort(rentaPorFechaYClave)) {
    const esPago = r.categoria === "COMPRA";
    const cantidadTotal = pyO(esPago ? r.importe_usdt : r.cantidad, 0);
    const transmEur = pyO(r.importe_eur, 0);
    let transmUsd = fiscHay(r.importe_usdt) ? r.importe_usdt : rentaAUsd(r, transmEur);
    if (!esPago && pyVerdad(r.gas_eur) && fiscHay(transmUsd) && fiscHay(r.importe_usdt)) {
      // El gas de la venta, restado tambien en USD.
      // Sin importe en USD (una retirada de POL), el USD sale del
      // importe en euros, que ya va sin el gas (no restarlo dos veces).
      transmUsd -= pyO(rentaAUsd(r, r.gas_eur), 0);
    }
    const coste = pyO(r.coste_fifo_eur, 0);
    tAdq += coste;
    tTransm += transmEur;
    let activo, operacion;
    if (esVentaInmueble) {
      activo = rentaInmuebleDe(r, nombres || new Map());
      operacion = "Venta";
    } else if (esPago) {
      activo = pyO(r.colas_stable, ["USDT"]).join("/");
      // Sin inmueble (un pago desde el vault sin el token en el hash),
      // «Pago» a secas: el token es la propia stablecoin y saldria
      // «Pago de USDT0».
      const inmueble = rentaInmuebleDe(r, nombres || new Map());
      operacion = inmueble ? "Pago de " + inmueble : "Pago";
    } else {
      activo = pyVerdad(r.colas_stable) ? r.colas_stable.join("/") : pyO(r.simbolo, pyO(r.token, ""));
      operacion = r.categoria === "RETIRADA" ? "Retirada" : "Cambio por otra moneda";
    }
    // Una fila por fecha de compra: los lotes del mismo dia (p. ej.
    // varias recompensas pequenas) van juntos, si son de la misma
    // moneda (un pago con USDT y USDC a la vez da una fila por moneda,
    // con su activo).
    let piezas = [];
    for (const t of pyO(r.lotes_consumidos, [])) {
      for (const p of pyO(t.procedencia, [t])) {
        const parte = pyVerdad(t.cantidad) ? p.cantidad / t.cantidad : 0;
        const pieza = {
          fecha: p.fecha, cantidad: p.cantidad,
          coste_eur: t.coste_eur * parte,
          coste_usd: fiscHay(t.coste_usd) ? t.coste_usd * parte : null,
          por_canje: p !== t, cola: t.cola ?? null, supuesto: t.coste_supuesto === true };
        const anterior = piezas.length ? piezas[piezas.length - 1] : null;
        if (anterior && pyVerdad(pieza.fecha) && pyVerdad(anterior.fecha) &&
            anterior.fecha.slice(0, 10) === pieza.fecha.slice(0, 10) &&
            anterior.por_canje === pieza.por_canje && anterior.cola === pieza.cola) {
          // La fila no se parte; lleva «**» si alguna parte lo es.
          anterior.supuesto = anterior.supuesto || pieza.supuesto;
          anterior.cantidad += pieza.cantidad;
          anterior.coste_eur += pieza.coste_eur;
          anterior.coste_usd = !fiscHay(anterior.coste_usd) || !fiscHay(pieza.coste_usd)
            ? null : anterior.coste_usd + pieza.coste_usd;
        } else {
          piezas.push(pieza);
        }
      }
    }
    if (!piezas.length) {   // sin trozos guardados: una fila con lo que hay
      piezas = [{ fecha: null, cantidad: cantidadTotal, coste_eur: coste, coste_usd: null,
        por_canje: false, cola: null }];
    }
    for (const p of piezas) {
      const parte = pyVerdad(cantidadTotal) ? p.cantidad / cantidadTotal : 0;
      const filaUsd = fiscHay(transmUsd) ? transmUsd * parte : null;
      const filaEur = transmEur * parte;
      if (filaUsd !== null) tTransmUsd += filaUsd;
      if (!fiscHay(p.coste_usd)) tAdqUsd = null;
      else if (tAdqUsd !== null) tAdqUsd += p.coste_usd;
      filas.push({
        clave: r.clave, activo: pyO(p.cola, activo),
        operacion,
        tipo_activo: rentaTipoDeActivo(r, esVentaInmueble),
        fecha_adquisicion: pyVerdad(p.fecha) ? p.fecha.slice(0, 10) : null,
        adquirido_por_canje: p.por_canje,
        fecha_transmision: r.fecha.slice(0, 10),
        cantidad: pyRedondeo(p.cantidad, 6),
        valor_adquisicion_usd: rentaEur2(p.coste_usd),
        valor_adquisicion_eur: rentaEur2(p.coste_eur),
        valor_transmision_usd: rentaEur2(filaUsd),
        valor_transmision_eur: rentaEur2(filaEur),
        gp_eur: rentaEur2(rentaEur2(filaEur) - rentaEur2(p.coste_eur)),
        ...(p.supuesto ? { coste_supuesto: true } : {}) });
    }
  }
  return {
    a_declarar_en: esVentaInmueble ? APARTADO_VENTA_INMUEBLE : APARTADO_FISCAL.GP_CRIPTO,
    filas,
    total: { operaciones: registros.length,
      valor_adquisicion_usd: rentaEur2(tAdqUsd),
      valor_adquisicion_eur: rentaEur2(tAdq),
      valor_transmision_usd: rentaEur2(tTransmUsd),
      valor_transmision_eur: rentaEur2(tTransm),
      gp_eur: rentaEur2(rentaEur2(tTransm) - rentaEur2(tAdq)) },
  };
}

/* Tabla simple de G/P sin lotes: ganancias sin transmision (III.5) y
   resultados de pools de liquidez (importe = la G/P).

   conValores (pools): cada fila lleva ademas el valor de transmision (lo
   que vuelve) y el de adquisicion (el coste de lo aportado), que pide la
   casilla de otros elementos patrimoniales. Si todas las
   filas los tienen, la G/P sale de restarlos ya redondeados, como en las
   ventas; un resultado puesto a mano no los tiene (null). */
function rentaTablaImportesGp(registros, codigo, conceptoDe, conValores = false) {
  const filas = [];
  let total = 0, totalUsd = 0;
  let tTransm = 0, tAdq = 0;
  let completos = conValores;
  for (const r of [...registros].sort(rentaPorFechaYClave)) {
    const usd = rentaAUsd(r, r.gp_eur);
    total += r.gp_eur;
    totalUsd = !fiscHay(usd) || totalUsd === null ? null : totalUsd + usd;
    const fila = { clave: r.clave, fecha: r.fecha.slice(0, 10),
      concepto: conceptoDe(r),
      token: pyO(r.simbolo, pyO(r.token, "")),
      cantidad: pyRedondeo(pyO(r.cantidad, 0), 6),
      importe_usd: rentaEur2(usd), importe_eur: rentaEur2(r.gp_eur) };
    if (conValores) {
      let transm = r.importe_eur ?? null, adq = r.coste_fifo_eur ?? null;
      if (transm === null || adq === null) {
        completos = false;
        transm = adq = null;
      } else {
        tTransm += transm;
        tAdq += adq;
        fila.importe_eur = rentaEur2(rentaEur2(transm) - rentaEur2(adq));
      }
      fila.valor_transmision_eur = rentaEur2(transm);
      fila.valor_adquisicion_eur = rentaEur2(adq);
    }
    filas.push(fila);
  }
  const t = { importe_usd: rentaEur2(totalUsd), importe_eur: rentaEur2(total) };
  if (conValores) {
    t.valor_transmision_eur = completos ? rentaEur2(tTransm) : null;
    t.valor_adquisicion_eur = completos ? rentaEur2(tAdq) : null;
    if (completos) t.importe_eur = rentaEur2(rentaEur2(tTransm) - rentaEur2(tAdq));
  }
  return { a_declarar_en: APARTADO_FISCAL[codigo], filas, total: t };
}

/* Coste de compra de los tokens de inmuebles de una cartera. */
function rentaCosteInmuebles(cierre, nombres) {
  return pySuma(Object.entries(cierre).filter(([activo]) => rentaEsInmueble(activo, nombres))
    .map(([, [, coste]]) => coste));
}

/* Dias entre dos fechas 'AAAA-MM-DD' (hasta - desde). */
function rentaDiasEntre(desde, hasta) {
  return Math.round((Date.parse(hasta + "T00:00:00Z") - Date.parse(desde + "T00:00:00Z")) / 86400000);
}

/* II: lo que se conserva a la fecha de corte, por lo que costo: tokens
   de inmuebles y demas criptoactivos (coste de compra en USD, si se
   pagaron en dolares, y en euros) y el vault (saldo en USDT al tipo BCE
   de ese dia). enPools: unidades aportadas a pools de liquidez
   ({activo: unidades}), que van en su propia fila, como lo que esta en
   otras cuentas tuyas (enOtras; no como «USDT (wallet)»). nombresTokens: {contrato: simbolo} de los demas tokens. */
function rentaInversionesActivas(cierre, corte, anioCerrado, nombres, cache,
  cierreUsd = null, enPools = null, nombresTokens = null, enOtras = null, supuestos = null) {
  const bloque = { fecha_corte: corte, anio_terminado: anioCerrado,
    nota: NOTA_INVERSIONES_ACTIVAS };
  cierreUsd = pyO(cierreUsd, {});

  function enUsd(activo) {
    const [usd, completo] = pyGet(cierreUsd, activo, [null, false]);
    return { coste_usd: rentaEur2(usd),
      coste_usd_parcial: fiscHay(usd) && !completo };
  }
  if (!fiscHay(cierre)) {
    Object.assign(bloque, { inmuebles: null, vault: null, otros: null, total_eur: null });
    return bloque;
  }

  const filas = Object.entries(cierre).filter(([activo]) => rentaEsInmueble(activo, nombres))
    .map(([activo, [cantidad, coste]]) => ({ activo,
      nombre: pyO(nombres.get(activo), activo),
      cantidad: pyRedondeo(cantidad, 6), ...enUsd(activo),
      coste_eur: rentaEur2(coste),
      ...(pyO(supuestos, []).includes(activo) ? { coste_supuesto: true } : {}) }))
    .sort((a, b) => cmpTexto(String(a.nombre).toLowerCase(), String(b.nombre).toLowerCase()));
  const subtotalInm = rentaCosteInmuebles(cierre, nombres);
  bloque.inmuebles = { filas, subtotal_eur: rentaEur2(subtotalInm) };

  const vaultCuenta = vaultConfig();
  let vault;
  if (!vaultCuenta) {
    vault = { configurado: false, saldo_usd: null, saldo_eur: null,
      fecha_tipo_bce: null,
      nota: "Sin vault configurado: su saldo no se incluye.",
      aviso: null };
  } else if (!fiscHay(cache)) {
    vault = { configurado: true, saldo_usd: null, saldo_eur: null,
      fecha_tipo_bce: null, nota: "Saldo no disponible.",
      aviso: null };
  } else {
    const serie = serieSaldoVault(cache, vaultCuenta).movimientos;
    let saldo = 0;
    for (const m of serie) {
      if (pyVerdad(m.fecha) && m.fecha.slice(0, 10) <= corte) saldo = m.saldo_usdt;
    }
    // Tipo BCE del dia de corte o, si no se publico, el ultimo anterior,
    // como mucho DIAS_MAX_SIN_TIPO_BCE dias antes (como en el motor:
    // si la descarga del BCE fallo, un tipo de meses atras no vale).
    // Como en el motor, uno más si el corte es posterior a lo cubierto
    // (diasMaxSinTipoBce, js/07).
    // Solo fechas bien escritas: una clave rota en la cache (escrita a
    // mano) pararia el informe y con el el Excel, los PDF y el JSON. El
    // motor tambien las filtra.
    const fechasBce = Object.keys(pyO(cache.tipos_bce, {}))
      .filter(f => fiscFechaValida(f) && f.length === 10 && f <= corte);
    let fechaBce = fechasBce.length ? fechasBce.reduce(pyMax) : null;
    const tope = diasMaxSinTipoBce(corte, cache);
    if (fechaBce && rentaDiasEntre(fechaBce, corte) > tope) fechaBce = null;
    const eur = fechaBce ? usdAEur(saldo, cache.tipos_bce[fechaBce])
      : Math.abs(saldo) <= 0.005 ? 0 : null;
    vault = { configurado: true, saldo_usd: rentaEur2(saldo),
      saldo_eur: rentaEur2(eur), fecha_tipo_bce: fechaBce,
      nota: eur !== null ? "Saldo en USDT, al tipo de cambio del BCE."
        : "Sin tipo de cambio del BCE para esa fecha.",
      // Lo que hay que ver junto al saldo (el PDF, el Excel y el
      // visor lo pintan debajo; la nota sola no basta: con vault
      // siempre hay saldo).
      aviso: eur !== null ? null
        : "Sin tipo de cambio del BCE del " + rentaFechaEs(corte) + " ni de los " +
          tope + " días antes: el saldo no pasa a euros y el total queda sin dar." };
  }
  bloque.vault = vault;

  // La cola FIFO de USDT lleva el de la wallet y el del vault (el USDT del
  // vault tiene coste, como el de la wallet). El vault ya va
  // arriba con su saldo al tipo BCE: aqui solo lo de la wallet, con la
  // parte que le toca del coste de la cola (coste medio). Lo aportado a
  // un pool sigue en la cola (criterio de AFCripto), pero no esta en la
  // wallet: va en su fila.
  // Un saldo negativo (falta una entrada del vault: una descarga a medias)
  // no se resta de la wallet: la inflaria. Se avisa.
  const enVault = pyMax(pyO(vault.saldo_usd, 0), 0);
  if (pyO(vault.saldo_usd, 0) < -0.005) {
    vault.aviso = [vault.aviso, "El saldo sale negativo: faltan movimientos del vault."]
      .filter(pyVerdad).join(" ");
  }
  enPools = pyO(enPools, {});

  enOtras = pyO(enOtras, {});

  /* Lo aportado a pools (sigue en la cola: va primero). */
  const aportado = (activo, cantidadCola) =>
    pyMin(pyMax(pyO(pyGet(enPools, activo, null), 0), 0), cantidadCola);
  /* Lo que esta en otras cuentas tuyas (despues de los pools). */
  const fuera = (activo, cantidadCola) =>
    pyMin(pyMax(pyO(pyGet(enOtras, activo, null), 0), 0), cantidadCola - aportado(activo, cantidadCola));
  // Mas USDT en el vault que en la cola sin lo del pool: alguna entrada
  // al vault no abrio lote (a revisar). La fila de la wallet sale de
  // restar el vault a la cola, asi que no es fiable: se dice (descontando
  // el pool; si no, no se avisaria y la fila del pool saldria con menos).
  const colaUsdt = pyO(pyGet(cierre, "USDT", null), [0, 0])[0];
  const sinCoste = enVault - (colaUsdt - aportado("USDT", colaUsdt) - fuera("USDT", colaUsdt));
  if (sinCoste > 0.005) {
    vault.usdt_sin_coste = pyRedondeo(sinCoste, 6);
    const texto = numEs(sinCoste) + " USDT del vault no tienen coste de compra (entradas a " +
      "revisar): la línea de USDT de la wallet no es fiable hasta resolverlas.";
    vault.nota += " " + texto;
    vault.aviso = [vault.aviso, texto].filter(pyVerdad).join(" ");
  }
  const otros = [];
  let subtotalOtros = 0;
  for (const [activo, nombre] of OTROS_CRIPTOACTIVOS) {
    if (!fiscTiene(cierre, activo)) continue;
    const [cantidadCola, costeCola] = cierre[activo];
    const usdCola = pyO(pyGet(cierreUsd, activo, null), [null, false])[0];
    const enPool = aportado(activo, cantidadCola);
    const enOtra = fuera(activo, cantidadCola);
    const resto = pyMax(cantidadCola - enPool - enOtra - (activo === "USDT" ? enVault : 0), 0);
    for (const [filaNombre, cantidad] of [
      [nombre, resto],
      [activo + " (aportado a pools de liquidez)", enPool],
      [activo + " (en otras cuentas tuyas)", enOtra]]) {
      if (cantidad <= 1e-9) continue;
      const parte = pyVerdad(cantidadCola) ? cantidad / cantidadCola : 0;
      const usd = enUsd(activo);
      if (usd.coste_usd !== null) usd.coste_usd = rentaEur2(usdCola * parte);
      otros.push({ activo, nombre: filaNombre,
        cantidad: pyRedondeo(cantidad, 6), ...usd,
        coste_eur: rentaEur2(costeCola * parte) });
      subtotalOtros += costeCola * parte;
    }
  }
  // Otros tokens con coste (no son inmuebles ni los de arriba).
  for (const [activo, [cantidad, coste]] of Object.entries(cierre).sort((a, b) => cmpTexto(a[0], b[0]))) {
    if (ACTIVOS_NO_INMUEBLE.includes(activo) || rentaEsInmueble(activo, nombres)) continue;
    otros.push({ activo,
      nombre: nombresTokens ? pyO(nombresTokens.get(activo), activo) : activo,
      cantidad: pyRedondeo(cantidad, 6), ...enUsd(activo),
      coste_eur: rentaEur2(coste) });
    subtotalOtros += coste;
  }
  bloque.otros = { filas: otros, subtotal_eur: rentaEur2(subtotalOtros) };
  // Sin el vault en euros no hay total: uno sin el vault pareceria
  // completo.
  const sinEuros = !fiscHay(vault.saldo_eur) && pyVerdad(vault.saldo_usd);
  bloque.total_eur = sinEuros ? null
    : rentaEur2(subtotalInm + subtotalOtros + pyO(vault.saldo_eur, 0));
  return bloque;
}

/* Concepto de un aviso: «Venta Caceres 8», «Recompensa RNT»... Una
   categoria que no es texto (un ajuste mal escrito) va como texto (si no,
   el informe se pararia). */
function rentaConceptoAviso(r) {
  return (pyCapitalizar(pdStr(categoriaAMostrar(r.categoria))) + " " +
    pyO(r.inmueble, pyO(r.token, ""))).trim();
}

/* IV: registros a revisar (con su motivo) y datos que faltan. */
function rentaAvisos(registrosAnio, declarables) {
  const avisos = [];
  for (const r of registrosAnio) {
    if (pyVerdad(r.revisar)) {
      avisos.push({
        fecha: r.fecha.slice(0, 10), tipo: "revisar",
        concepto: rentaConceptoAviso(r),
        detalle: pyO(r.nota, "") });
    }
  }
  const sinCoste = pySuma(registrosAnio.map(r => pyO(r.gas_sin_coste_pol, 0)));
  if (sinCoste > 0) {
    avisos.push({
      fecha: null, tipo: "nota", concepto: "Comisiones de red",
      detalle: cantidadEs(sinCoste) + " POL de gas sin coste de compra: el total en euros " +
        "del gas no los incluye" });
  }
  for (const r of declarables) {
    if (!fiscHay(r.integro_usdt) && !pyVerdad(r.revisar)) {
      // Sin fila del archivo de Reental y dado por bueno: el integro
      // es lo que llego y la retencion 0, no lo que dice Reental.
      avisos.push({
        fecha: r.fecha.slice(0, 10), tipo: "nota",
        concepto: (pyGet(TIPO_RENDIMIENTO, r.subcategoria, "Rendimiento") + " " +
          pyO(r.inmueble, "")).trim(),
        detalle: "sin fila en el archivo de Reental: se declara el neto como íntegro, con " +
          "retención 0" });
    }
    // Sin aviso de «reclamado sin retención»: la app no aconseja.
  }
  return avisos;
}

/* IV: de donde puede venir lo que el capital de tokens de inmuebles no
   explica con compras ni ventas (un deposito o una venta sin precio, p.
   ej.). La linea «otros movimientos» remite al IV: que no quede vacio. */
function rentaAvisoOtrosMovimientos(importe, registrosAnio, nombres) {
  const sueltos = [];
  for (const r of registrosAnio) {
    const deInmueble = r.categoria === "COMPRA" || r.categoria === "VENTA"
      ? rentaInmuebleDe(r, nombres) : nombres.has(r.contrato);
    if (!pyVerdad(deInmueble)) continue;
    const contado = (r.categoria === "COMPRA" && fiscHay(r.importe_eur)) ||
      (r.categoria === "VENTA" && (fiscHay(r.gp_eur) || rentaEsCanje(r)));
    if (!contado) {
      sueltos.push(rentaFechaEs(r.fecha.slice(0, 10)) + " " + pdStr(categoriaAMostrar(r.categoria)).toLowerCase());
    }
  }
  let detalle = "el capital de tokens de inmuebles cambia " + numEs(importe, 2, true) +
    " EUR sin compra ni venta que lo explique";
  detalle += sueltos.length ? ": " + sueltos.join(", ") : "; compruébalo en el libro diario";
  return { fecha: null, tipo: "revisar",
    concepto: "Capital de tokens de inmuebles", detalle };
}

/* 'AAAA-MM-DD' -> 'DD/MM/AAAA' ('' si no hay fecha). pdFechaEs esta en
   js/14. */
function rentaFechaEs(fecha) { return pdFechaEs(fecha); }

/* Informe de un ano para rellenar Renta Web (version 2): cabecera, resumen del ejercicio, inversiones activas, detalle,
   avisos y textos del final.

   opciones.cierre / cierre_anterior: posicionAbierta a 31/12 de este ano
   y del anterior (de motorFiscal; cierre_anterior = {} si no hubo
   actividad antes); sin cierre, el capital y las inversiones activas
   salen como no disponibles. nombres: {contrato: nombre del inmueble}
   (Map u objeto). cache: para el saldo del vault, los tipos BCE y el
   nombre de los contratos DeFi. cierre_usd: costeUsdAbierto a 31/12 (sin
   el, el coste en USD de las inversiones activas sale como no
   disponible). en_pools: lo aportado a pools de liquidez a 31/12
   ({activo: unidades}, de motorFiscal), y en_otras, lo que estaba en
   otras cuentas tuyas.
   hoy: el dia de la ejecucion; si los datos llegan hasta hoy y hoy es el
   31/12, el ano aun no ha terminado. */
function informeRentaAnio(anio, registrosAnio, bloqueResumen, config, opciones = {}) {
  let { cierre = null, datos_hasta: datosHasta = null, cierre_anterior: cierreAnterior = null,
    nombres = null, cache = null, cierre_usd: cierreUsd = null, en_pools: enPools = null,
    nombres_tokens: nombresTokens = null, hoy = null, en_otras: enOtras = null,
    supuestos = null } = opciones;
  const inversor = pyO(config.inversor, {});
  if (!fiscHay(nombres)) {
    // Sin la lista (una llamada suelta): todo token que no sea RNT, POL
    // ni una stablecoin es de un inmueble.
    nombres = new Map(Object.keys({ ...pyO(cierreAnterior, {}), ...pyO(cierre, {}) })
      .filter(a => !ACTIVOS_NO_INMUEBLE.includes(a)).map(a => [a, a]));
  }
  nombres = rentaComoMap(nombres);
  if (fiscHay(nombresTokens)) nombresTokens = rentaComoMap(nombresTokens);
  const fin = anio + "-12-31";
  const anioCerrado = !pyVerdad(datosHasta) || datosHasta.slice(0, 10) > fin ||
    (datosHasta.slice(0, 10) === fin && datosHasta.slice(0, 10) !== hoy);
  const corte = anioCerrado ? anio + "-12-31" : datosHasta.slice(0, 10);
  // Un ano que aun no ha empezado (una fecha mal escrita, avisada en el
  // IV): su cartera «a hoy» mezclaria la de hoy con la compra futura.
  // Sin capital ni inversiones activas.
  const posterior = pyVerdad(hoy) && anio > parseInt(hoy.slice(0, 4), 10);
  if (posterior) cierre = null;

  const declarables = rentaRendimientosDeclarables(registrosAnio);
  const rendimientos = rentaTablaRendimientos(declarables);
  const recompensas = rentaTablaRecompensas(registrosAnio, cache);
  let [ventas, permutas] = rentaGpDelEjercicio(registrosAnio, nombres);
  ventas = ventas.filter(r => !rentaEsCanje(r));
  const pools = permutas.filter(rentaEsResultadoPool);
  permutas = permutas.filter(r => !rentaEsResultadoPool(r));
  const regalos = registrosAnio.filter(r => r.codigo_concepto === "GP_BASE_GRAL" && fiscHay(r.gp_eur));
  const tVentas = rentaTablaTransmisiones(ventas, true, nombres);
  const tPermutas = rentaTablaTransmisiones(permutas, false, nombres);

  const fila = (grupo, clave, concepto, importe, unidad = "EUR", nota = null, total = false) =>
    ({ grupo, clave, concepto, importe, unidad, nota, total });

  // 1. Inversiones activas: capital al 1/1 + invertido - desinvertido (a
  // coste) = capital al 31/12. Solo tokens de inmuebles, sin canjes.
  const g1 = "1. Inversiones activas a efectos del Impuesto sobre el Patrimonio";
  // Un canje no es invertir, pero su gas si se suma a su lote: va aqui
  // (si no, saldria como «otros movimientos» a revisar).
  const invertido = pySuma(registrosAnio.filter(r => r.categoria === "COMPRA" &&
      pyVerdad(rentaInmuebleDe(r, nombres)) && fiscHay(r.importe_eur))
    .map(r => (r.via_compra !== "CANJE" ? r.importe_eur : 0) + pyO(r.gas_eur, 0)));
  // Solo las ventas que estan en el punto 3 (con su G/P): una venta sin
  // precio sale de la cartera, pero va a «otros movimientos», a revisar
  // (si no, la nota diria que su G/P esta en el 3).
  const desinvertido = pySuma(registrosAnio.filter(r => r.categoria === "VENTA" &&
      pyVerdad(rentaInmuebleDe(r, nombres)) && !rentaEsCanje(r) &&
      fiscHay(r.coste_fifo_eur) && fiscHay(r.gp_eur))
    .map(r => r.coste_fifo_eur));
  const avisosCapital = [];
  const conceptoFinal = anioCerrado ? "Capital al 31 de diciembre"
    : "Capital a " + rentaFechaEs(corte) + " (ejercicio en curso)";
  const resumen = [fila(g1, "capital_inicio", "Capital al 1 de enero",
    !fiscHay(cierre) ? null : rentaEur2(rentaCosteInmuebles(pyO(cierreAnterior, {}), nombres)),
    "EUR", NOTA_PATRIMONIO),
  fila(g1, "invertido", "Invertido en el año", rentaEur2(invertido))];
  if (!fiscHay(cierre)) {
    resumen.push(fila(g1, "desinvertido", "Desinvertido en el año",
      rentaEur2(desinvertido), "EUR", NOTA_DESINVERTIDO),
    fila(g1, "capital_final", conceptoFinal, null, "EUR", null, true));
  } else {
    const inicio = rentaCosteInmuebles(pyO(cierreAnterior, {}), nombres);
    const final = rentaCosteInmuebles(cierre, nombres);
    // Lo que no explican las compras ni las ventas (p. ej. una venta a
    // revisar sin coste completo): aparte, nunca escondido.
    const otros = final - inicio - invertido + desinvertido;
    const i2 = rentaEur2(inicio), v2 = rentaEur2(invertido), f2 = rentaEur2(final);
    if (Math.abs(otros) <= 0.005) {
      // Cuadra: el desinvertido se da restando los tres ya
      // redondeados, para que la cuenta salga al centimo.
      resumen.push(fila(g1, "desinvertido", "Desinvertido en el año",
        rentaEur2(i2 + v2 - f2), "EUR", NOTA_DESINVERTIDO));
    } else {
      const d2 = rentaEur2(desinvertido);
      resumen.push(fila(g1, "desinvertido", "Desinvertido en el año",
        d2, "EUR", NOTA_DESINVERTIDO));
      const o2 = rentaEur2(f2 - i2 - v2 + d2);
      resumen.push(fila(
        g1, "otros_movimientos", "Otros movimientos sin coste completo",
        o2, "EUR", "Movimientos a revisar: véase el apartado IV."));
      avisosCapital.push(rentaAvisoOtrosMovimientos(o2, registrosAnio, nombres));
    }
    resumen.push(fila(g1, "capital_final", conceptoFinal, f2, "EUR", null, true));
  }

  // 2. Rendimientos del capital mobiliario.
  const g2 = "2. Rendimientos del capital mobiliario";
  const tRend = rendimientos.total;
  const defi = rentaEur2(pyGet(bloqueResumen, "base_rewards_eur", 0));
  const integro = rentaEur2(pyGet(bloqueResumen, "base_rendimientos_eur", 0) +
    pyGet(bloqueResumen, "base_rewards_eur", 0));
  resumen.push(
    fila(g2, "rend_inmuebles", "Rendimientos de inmuebles tokenizados",
      tRend.integro_eur, "EUR",
      "Importe íntegro: reinvertidos, reclamados y pendientes."),
    fila(g2, "rend_defi", "Recompensas DeFi", defi),
    fila(g2, "rend_integro", "Total íntegro", integro, "EUR", null, true),
    fila(g2, "rend_retenciones", "Retenciones", tRend.retencion_eur),
    fila(g2, "rend_neto", "Neto", rentaEur2(integro - tRend.retencion_eur),
      "EUR", NOTA_NETO));

  // 3. Ganancias y perdidas patrimoniales.
  const g3 = "3. Ganancias y pérdidas patrimoniales";
  for (const [prefijo, titulo, tabla] of [
    ["gp_inmuebles", "Transmisión de tokens de inmuebles", tVentas],
    ["gp_permutas", "Permutas de monedas virtuales", tPermutas]]) {
    const t = tabla.total;
    resumen.push(
      fila(g3, prefijo + "_transmision", titulo + ": valor de transmisión",
        t.valor_transmision_eur),
      fila(g3, prefijo + "_adquisicion", titulo + ": valor de adquisición",
        t.valor_adquisicion_eur),
      fila(g3, prefijo, titulo + ": ganancia o pérdida", t.gp_eur));
  }
  const detalle = { rendimientos, recompensas,
    ventas_inmuebles: tVentas, permutas: tPermutas };
  let gpTotal = tVentas.total.gp_eur + tPermutas.total.gp_eur;
  if (pools.length) {
    const tPools = rentaTablaImportesGp(
      pools, "GP_OTROS_ELEM", () => "Resultado de pool de liquidez", true);
    // Criterio de AFCripto: no hay criterio oficial.
    tPools.a_declarar_en = APARTADO_FISCAL.GP_OTROS_ELEM;
    detalle.otros_elementos = tPools;
    gpTotal += tPools.total.importe_eur;
    const t = tPools.total;
    if (t.valor_transmision_eur !== null) {
      resumen.push(
        fila(g3, "gp_otros_elementos_transmision",
          "Pools de liquidez: valor de transmisión",
          t.valor_transmision_eur),
        fila(g3, "gp_otros_elementos_adquisicion",
          "Pools de liquidez: valor de adquisición",
          t.valor_adquisicion_eur));
    }
    resumen.push(fila(g3, "gp_otros_elementos",
      "Pools de liquidez: ganancia o pérdida",
      t.importe_eur));
  }
  // El total es la suma de las lineas de arriba, ya redondeadas.
  resumen.push(fila(
    g3, "gp_total", "Total ganancias y pérdidas patrimoniales",
    rentaEur2(gpTotal), "EUR", null, true));
  if (regalos.length) {
    const tRegalos = rentaTablaImportesGp(
      regalos, "GP_BASE_GRAL", () => "Recibido sin aportación");
    detalle.ganancias_sin_transmision = tRegalos;
    resumen.push(fila(g3, "gp_sin_transmision",
      "Ganancias sin transmisión",
      tRegalos.total.importe_eur, "EUR",
      NOTA_SIN_TRANSMISION));
  }

  // 4. Gastos: comisiones de red.
  const g4 = "4. Gastos: comisiones de red (gas)";
  const gasEur = pyGet(bloqueResumen, "comisiones_gas_eur", null);
  resumen.push(
    fila(g4, "gas_pol", "Pagadas en POL",
      pyRedondeo(pyGet(bloqueResumen, "comisiones_gas_pol", 0), 6),
      "POL"),
    fila(g4, "gas_eur", "Pagadas en euros (coste de compra del POL)",
      rentaEur2(gasEur), "EUR", NOTA_GAS));

  const inversiones = rentaInversionesActivas(
    cierre, corte, anioCerrado, nombres, cache, cierreUsd, enPools,
    nombresTokens, enOtras, supuestos);
  if (posterior) {
    inversiones.nota = "El ejercicio " + anio + " aún no ha empezado (una fecha posterior a " +
      "hoy: véase el apartado IV): no hay inversiones activas que dar.";
  }
  const vault = pyO(inversiones.vault, {});
  if (!fiscHay(vault.saldo_eur) && pyVerdad(vault.saldo_usd)) {
    avisosCapital.push({
      fecha: null, tipo: "revisar", concepto: "Vault de Reental",
      detalle: "sin tipo de cambio del BCE del " + rentaFechaEs(corte) + " ni de los " +
        diasMaxSinTipoBce(corte, cache) + " días antes: el saldo del vault no pasa a euros y el " +
        "total de inversiones activas queda sin dar; vuelve a ejecutar el programa con internet" });
  }
  if (pyO(vault.saldo_usd, 0) < -0.005) {
    avisosCapital.push({
      fecha: null, tipo: "revisar", concepto: "Vault de Reental",
      detalle: "el saldo del vault sale negativo (" + numEs(vault.saldo_usd) + " USDT): " +
        "faltan movimientos del vault; vuelve a ejecutar el programa y, si sigue, revisa " +
        "los del vault" });
  }
  const sinCoste = vault.usdt_sin_coste;
  if (pyVerdad(sinCoste)) {
    avisosCapital.push({
      fecha: null, tipo: "revisar", concepto: "Vault de Reental",
      detalle: numEs(sinCoste) + " USDT del vault no tienen coste de compra (entradas al " +
        "vault a revisar): la línea de USDT de la wallet del apartado II no es fiable " +
        "hasta resolverlas" });
  }

  return {
    version: VERSION_INFORME_RENTA,
    ejercicio: anio,
    cabecera: {
      titular: pyGet(inversor, "nombre", null),
      nif: pyGet(inversor, "nif", null),
      wallet: pyO(config.wallet, walletConfig()),
      periodo_desde: anio + "-01-01",
      periodo_hasta: anio + "-12-31",
      anio_terminado: anioCerrado,
      datos_hasta: pyVerdad(datosHasta) ? datosHasta.slice(0, 10) : null,
      divisa: "EUR",
      alcance: ALCANCE_RENTA,
    },
    resumen,
    inversiones_activas: inversiones,
    detalle,
    avisos: [...rentaAvisos(registrosAnio, declarables), ...avisosCapital],
    descargo: DESCARGO_RENTA,
    glosario: GLOSARIO_RENTA.map(([termino, definicion]) => ({ termino, definicion })),
    nota_metodologica: NOTA_METODOLOGICA_RENTA.map(([titulo, texto]) => ({ titulo, texto })),
    nota_centimos: NOTA_CENTIMOS,
  };
}

/* {contrato: nombre} de los inmuebles (Map): los del catalogo que cuentan
   como inmueble (sin los «Sin decidir» ni los descartados, como en el
   resto de la app) y los de las compras y ventas que llevan su
   nombre, que mandan. */
function rentaNombresInmuebles(registros, cache) {
  const nombres = new Map();
  const catalogo = pyO(cache, {}).catalogo_propiedades;
  const confirmados = pdEsObjeto(catalogo) ? inmueblesConfirmados(cache) : {};
  for (const [addr, e] of Object.entries(confirmados)) {
    if (pdEsObjeto(e)) {
      const contrato = normalizarDireccion(addr);
      nombres.set(contrato, pyO(e.nombre_reental, pyO(e.nombre_etherscan, contrato)));
    }
  }
  for (const r of registros) {
    if (pyVerdad(r.inmueble) && (r.categoria === "COMPRA" || r.categoria === "VENTA")) {
      nombres.set(r.contrato, r.inmueble);
    }
  }
  return nombres;
}

/* Informe para Renta Web de cada ano con actividad ({ano: informe}).
   opciones.cierres, cierres_usd y cierres_pools: lo que relleno
   motorFiscal (cartera a 31/12 de cada ano, lo que costo en USD y lo
   aportado a pools); cierres_otras, lo que estaba en otras cuentas tuyas;
   cierres_supuestos, los activos con coste supuesto (se marcan con «**»).
   cache: para el vault, los tipos BCE y los nombres de contratos DeFi.

   hoy ('AAAA-MM-DD', el dia de los datos: la app acaba de sincronizar):
   los datos llegan hasta hoy, asi que un ano ya pasado esta terminado
   aunque su ultimo movimiento sea anterior al 31/12, y una fecha
   posterior a hoy (mal escrita en un ajuste) no mueve el corte y se
   avisa. Sin hoy, los datos llegan hasta el ultimo movimiento
   o cobro.

   dia_real ('AAAA-MM-DD', el dia de hoy de verdad): sin hoy (no se sabe
   cuando se sincronizo) los datos siguen llegando hasta el ultimo
   movimiento, pero una fecha posterior a dia_real tampoco mueve el corte
   ni da por terminado el ano en curso, y se avisa igual (sin el, una
   fecha de 2027 mal escrita cerraria 2026).

   descarga_incompleta: la descarga de Etherscan fallo. Entonces los datos
   no llegan hasta hoy, sino hasta el ultimo movimiento o cobro, y se
   avisa en el apartado IV (no se dice «datos hasta hoy» ni se da por
   terminado un ano al que le falta el final).

   Solo lee: los registros, el resumen y los cierres son los de una
   pasada de motorFiscal (y resumenFiscalAnual) sobre una copia nueva. */
function informesRentaAnuales(registros, resumen, config, opciones = {}) {
  let { cierres = null, cache = null, cierres_usd: cierresUsd = null,
    cierres_pools: cierresPools = null, hoy = null, dia_real: diaReal = null,
    descarga_incompleta: descargaIncompleta = false, cierres_otras: cierresOtras = null,
    cierres_supuestos: cierresSupuestos = null } = opciones;
  hoy = pyVerdad(hoy) ? hoy.slice(0, 10) : null;
  // Hasta qué día puede haber datos: hoy o, sin él, el día real.
  const limite = hoy || (pyVerdad(diaReal) ? diaReal.slice(0, 10) : null);
  const fechas = registros.filter(r => pyVerdad(r.fecha)).map(r => r.fecha);
  // Hasta donde llegan los datos: tambien los cobros que llegan despues
  // de su reparto (la cartera del motor ya los tiene). Si no, el corte
  // se quedaria antes de que llegaran al vault y saldrian en la wallet.
  const cobros = registros.filter(r => typeof r.fecha_cobro === "string" && r.fecha_cobro.length >= 10)
    .map(r => r.fecha_cobro);
  // Sin las posteriores a hoy (mal escritas).
  let datosHasta = null;
  if (fechas.length) {
    const hastaHoy = [...fechas, ...cobros].filter(f => !limite || f.slice(0, 10) <= limite);
    datosHasta = (hastaHoy.length ? hastaHoy.reduce(pyMax) : fechas.reduce(pyMin)).slice(0, 10);
  }
  if (hoy && fechas.length && !pyVerdad(descargaIncompleta)) datosHasta = hoy;
  const nombres = rentaNombresInmuebles(registros, cache);
  const nombresTokens = new Map();
  for (const r of registros) {
    if (pyVerdad(r.simbolo) || pyVerdad(r.token)) nombresTokens.set(r.contrato, pyO(r.simbolo, r.token));
  }
  const informes = {};
  let cierreAnterior = {};
  let usdAnterior = null, poolsAnterior = null, otrasAnterior = null, supuestosAnterior = null;
  let anios = aniosDelInforme(fechas, limite);
  // Los anos sin movimientos del final, hasta donde llegan los datos, si
  // al 31/12 del ultimo con movimientos (o de uno siguiente, por un cobro
  // que llega despues) queda cartera: se siguen teniendo los tokens y
  // tienen informe.
  const tope = datosHasta ? parseInt(datosHasta.slice(0, 4), 10) : null;
  const hastaTope = anios.filter(a => pyVerdad(tope) && a <= tope);
  const ultimo = hastaTope.length ? Math.max(...hastaTope) : null;
  const conCartera = a => Object.values(pyO(pyGet(cierres, a, null), {})).some(([c]) => c > 1e-9);
  let hayCartera = false;
  if (pyVerdad(ultimo) && pyVerdad(cierres)) {
    for (let a = ultimo; a <= tope && !hayCartera; a++) hayCartera = conCartera(a);
  }
  if (hayCartera) {
    const todos = new Set(anios);
    for (let a = ultimo + 1; a <= tope; a++) todos.add(a);
    anios = [...todos].sort((a, b) => a - b);
  }
  for (const anio of anios) {
    const registrosAnio = registros.filter(r => pyVerdad(r.fecha) && parseInt(r.fecha.slice(0, 4), 10) === anio);
    let cierre = fiscHay(cierres) ? pyGet(cierres, anio, null) : null;
    let cierreUsd = pyGet(pyO(cierresUsd, {}), anio, null);
    let enPools = pyGet(pyO(cierresPools, {}), anio, null);
    let enOtras = pyGet(pyO(cierresOtras, {}), anio, null);
    let supuestos = pyGet(pyO(cierresSupuestos, {}), anio, null);
    if (fiscHay(cierres) && !registrosAnio.length && !fiscHay(cierre)) {
      // Ano sin movimientos entre dos con movimientos: la cartera
      // es la del 31/12 anterior.
      [cierre, cierreUsd, enPools, enOtras, supuestos] =
        [cierreAnterior, usdAnterior, poolsAnterior, otrasAnterior, supuestosAnterior];
    }
    informes[anio] = informeRentaAnio(anio, registrosAnio, pyGet(resumen, anio, {}), config, {
      cierre, datos_hasta: datosHasta, cierre_anterior: cierreAnterior, nombres, cache,
      cierre_usd: cierreUsd, en_pools: enPools, nombres_tokens: nombresTokens, hoy: limite,
      en_otras: enOtras, supuestos });
    if (fiscHay(cierre)) {
      cierreAnterior = cierre;
      usdAnterior = cierreUsd;
      poolsAnterior = enPools;
      otrasAnterior = enOtras;
      supuestosAnterior = supuestos;
    }
  }
  // Un registro sin fecha (una fecha rota en los ajustes o en el archivo
  // de Reental) no cae en ningun ano: se avisa en todos, para que no
  // desaparezca de la declaracion sin que se vea.
  for (const r of registros) {
    if (pyVerdad(r.fecha)) continue;
    for (const informe of Object.values(informes)) {
      informe.avisos.push({
        fecha: null, tipo: "revisar",
        concepto: rentaConceptoAviso(r),
        detalle: "sin fecha válida: no se sabe de qué año es y no está en ningún total. " +
          pyO(r.nota, "") });
    }
  }
  // Una fecha posterior a hoy (un ajuste mal escrito: 2062 por 2026) se
  // avisa en su ano y en el de hoy, donde se buscaria.
  // Tambien una fecha de cobro: hasta ese dia el cobro no esta en la
  // cartera.
  for (const r of registros) {
    if (!(limite && pyVerdad(r.fecha))) continue;
    const cobro = typeof r.fecha_cobro === "string" ? r.fecha_cobro.slice(0, 10) : "";
    let detalle;
    if (r.fecha.slice(0, 10) > limite) {
      detalle = "fecha posterior a hoy (" + rentaFechaEs(r.fecha.slice(0, 10)) + "): " +
        "compruébala; cuenta en el ejercicio " + r.fecha.slice(0, 4);
    } else if (cobro > limite) {
      detalle = "fecha de cobro posterior a hoy (" + rentaFechaEs(cobro) + "): " +
        "compruébala; hasta ese día el cobro no está en la cartera";
    } else {
      continue;
    }
    const anio = parseInt(r.fecha.slice(0, 4), 10);
    for (const a of [...new Set([anio, parseInt(limite.slice(0, 4), 10)])].sort((x, y) => x - y)) {
      if (fiscTiene(informes, a)) {
        informes[a].avisos.push({
          fecha: r.fecha.slice(0, 10), tipo: "revisar",
          concepto: rentaConceptoAviso(r),
          detalle });
      }
    }
  }
  if (pyVerdad(descargaIncompleta) && datosHasta) {
    for (const [anio, informe] of Object.entries(informes)) {
      if (Number(anio) >= parseInt(datosHasta.slice(0, 4), 10)) {
        informe.avisos.push({
          fecha: null, tipo: "revisar",
          concepto: "Descarga de Etherscan",
          detalle: "no se pudieron descargar los movimientos nuevos: los datos llegan hasta el " +
            rentaFechaEs(datosHasta) + "; vuelve a ejecutar el programa" });
      }
    }
  }
  return informes;
}

/* Anos con informe: los que tienen movimientos y los que quedan entre
   ellos (en uno sin movimientos se siguen teniendo los tokens: inversiones
   activas y Patrimonio), hasta el ano de hoy (una fecha
   futura mal escrita no rellena decadas). hoy: 'AAAA-MM-DD' (si no, el
   ano de hoy). */
function aniosDelInforme(fechas, hoy) {
  const anios = new Set([...fechas].map(f => parseInt(String(f).slice(0, 4), 10)));
  if (!anios.size) return [];
  const tope = parseInt((hoy || hoyEspana()).slice(0, 4), 10);  // en hora de Espana
  const hastaTope = [...anios].filter(a => a <= tope);
  const hasta = Math.max(...(hastaTope.length ? hastaTope : [Math.min(...anios)]));
  for (let a = Math.min(...anios); a <= hasta; a++) anios.add(a);
  return [...anios].sort((a, b) => a - b);
}

/* Las fechas que necesitan tipo del BCE: las de los movimientos y los
   repartos, el 31/12 de cada ano ya pasado y ayer. El informe valora el
   vault al 31/12 de cada ano ya pasado y a hoy en el ano en curso; todos
   los 31/12 hasta el del ano pasado, tambien los de anos sin movimientos
   del final (tienen informe si queda cartera). En hora de Espana, como
   las fechas de los movimientos (no en UTC). Ayer y no hoy: el tipo de
   hoy puede no estar publicado y lo cubierto llega como mucho hasta ayer,
   asi que pedir hoy volveria a descargar toda la serie en cada ejecucion.
   Tambien el dia de cada pago en USD de 💶 (puede ser anterior al primer
   movimiento: una preventa pagada semanas antes de recibir los tokens).
   hoy: 'AAAA-MM-DD' (si no, el de hoy en Espana). */
function fechasBceNecesarias(cache, filasCsv, hoy) {
  hoy = hoy || hoyEspana();
  const fechas = new Set(fechasUnicasTransacciones(cache, filasCsv));
  const anios = aniosDelInforme(fechas, hoy);
  if (anios.length) {
    for (let a = anios[0]; a < parseInt(hoy.slice(0, 4), 10); a++) fechas.add(a + "-12-31");
  }
  for (const a of Object.values(cache.ajustes_usuario || {})) {
    const f = a && a.fecha_pago_usd;
    if (esFechaBce(f) && f < hoy) fechas.add(f);
  }
  if (fechas.size) fechas.add(sumarDias(hoy, -1));
  return [...fechas];
}
