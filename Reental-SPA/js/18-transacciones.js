/* =====================================================================
   js/18-transacciones.js — 📒 Transacciones: el libro diario completo.

   - Tabla con todos los registros de la clasificación de la sesión (en
     vivo, sin reental_datos.json), más recientes primero, como la pestaña
     «Blockchain» de Reentax: fecha, categoría, token (el inmueble
     o el símbolo), operación en lenguaje llano con la flecha de su
     sentido delante (↓ entrada, ↑ salida, ⇄ entre tus direcciones; el
     código técnico y la nota del motor van en su ayuda), cantidad,
     importe (USD nominal o € de compra bancaria; en un rendimiento, su
     íntegro, nunca el neto que llegó, y debajo la retención de Reental si
     la hubo), contraparte (la otra dirección, acortada, o su nombre si la
     app la conoce), tx (hash corto con enlace a Polygonscan) y acciones.
     Cifras con 2 decimales y la exacta en la ayuda. Color por
     categoría con una paleta fija. Cada columna mide lo
     que su contenido, sin líneas verticales y todo centrado en vertical;
     cabe sin scroll horizontal en un portátil.
   - Filtros por categoría (cada opción con su recuento, con los demás
     filtros aplicados), ejercicio, inmueble y fuente, y búsqueda por
     hash, inmueble, token o nota (la de un inmueble encuentra también los
     pagos de sus ventas vinculadas). Resumen de triaje (A revisar · Con
     efecto fiscal · Neutros), que filtra al pulsar.
   - El spam va aparte: fuera del «modo spam» no sale nunca,
     tampoco al buscar. «👁 Ver spam (n)», junto al recuento, o elegir
     «Spam» en el selector lo abre: la tabla enseña solo el spam y, bajo el
     recuento (en negrita), cuántos hay por cada motivo, uno por línea
     (calculado al pintar con las mismas señales que el motor, sin tocarlo);
     «✖ Salir del spam» lo cierra, y también «📒 Transacciones» del menú.
     Cada motivo se pulsa para ver solo ese spam.
   - Las acciones son iconos con su burbuja de información (ratón o
     teclado). «🔍 Mandar a revisar» guarda en cache.ajustes_usuario un ajuste
     { revisar: true, nota: "Mandado a revisar por ti (fecha)[: motivo]" }
     y reclasifica: el registro aparece en 🔍 Revisión con su nota.
     «↩ Quitar de revisar» borra ese ajuste solo si lleva la marca de la
     SPA. Un ajuste manual de otro origen (p. ej. del panel) nunca se pisa
     ni se borra desde aquí: se edita en 🔍 Revisión.
   - «🚫 Mandar al spam» en depósitos, traspasos,
     recompensas DeFi, retiradas y «a revisar»: un ajuste con su marca; su
     «↩ Quitar del spam» lo borra. En el spam de la app, ↩ lo saca y lo
     deja a revisar, con la marca ↩ en su fila; su 🚫 lo devuelve. En las
     filas de spam no hay 🔍 (su ↩ ya lo deja a revisar).
   - Si hay más de una forma de mandarlo al spam, 🚫 abre las
     opciones en una fila justo debajo: «Este movimiento» (el ajuste de
     arriba), «Toda la dirección» (lo que llega de una dirección
     desconocida) y «Todo el token» (un token desconocido). Las dos
     últimas van en su propio bloque de la cache, spam_usuario, que el
     motor aplica como regla (también a lo que llegue después); en el
     spam, su ↩ quita la dirección o el token entero.
   - «🔗 Vincular cobro…» (salidas por vincular) y «➕ Otro
     cobro…» (ya vinculadas) abren el buscador de js/15 con esa fila como
     salida. Las vinculadas llevan el distintivo «🔗 Venta vinculada» o
     «🔗 Pago de una venta» (lleva a su vínculo en 🔍 Revisión) y, debajo de
     su hash, el de la otra transacción del vínculo («↳ 0x… ↗»; la ayuda
     dice si es el cobro o la venta). El cobro asignado entero a su venta
     no sale en una fila propia sino dentro de la de su venta (como una
     venta cobrada en la misma transacción); sale al buscar su hash, y
     vuelve a ser un depósito si se anula el vínculo. Recuentos y triaje
     cuentan lo que se ve.
   - «✏️ Nota»: una nota tuya por transacción, guardada
     en la cache en su propio bloque (notas_personales), que nunca cambia
     la clasificación. Como en Reentax, se escribe y se ve en
     una fila justo debajo de la suya (Intro guarda, Esc cancela); entera
     también en la burbuja del ✏️, y la búsqueda la encuentra. El editor
     (txEditorNota) es el mismo que usa 💰 Rendimientos (js/17).
   - Nota del coste por token de las compras externas de inmuebles
     (100 € por defecto), solo si las hay, y barra lateral plegable.
   - Textos cortos y de solo datos: las burbujas dicen el dato;
     la explicación, como mucho, en la de la cabecera.

   No modifica ningún otro módulo: usa las utilidades cc* de js/15 y el
   guardado de js/13 (marcarCacheDirty + autoGuardarCache). Carga después
   de js/16 y antes de js/19 y js/13. Solo repinta si la vista está
   visible, y siempre al entrar en #transacciones. Solo usa los colores
   del design system (el modo oscuro no necesita repintar). Las funciones
   puras (sin DOM ni state) van primero y se prueban en Node.
   ===================================================================== */

/* ----------------------------- Constantes y utilidades puras ----------------------------- */

/* Marca de la nota del ajuste que escribe esta pestaña: sirve para
   reconocerlo y poder deshacerlo (el del panel dice «desde el panel»). Sin
   emojis: la nota se guarda en la cache y otras herramientas la leen. Las
   marcas (y las antiguas, que se siguen reconociendo) viven
   en js/15, compartidas con 🔍 Revisión. */
const TX_MARCA_REVISAR = CC_MARCA_REVISAR;

/* Avisos cortos al guardar (en js/15). */
const TX_SIN_DISCO = CC_SIN_DISCO;
const TX_SIN_CACHE = CC_SIN_CACHE;

/* Operación legible: primero
   por categoría y subcategoría (la misma subcategoría significa cosas
   distintas: COSTE_BASE es una compra o un ingreso de dinero) y, si no,
   por subcategoría. El código técnico se conserva en el title y una
   subcategoría desconocida se muestra tal cual (nunca se inventa). */
const TX_OPERACIONES_POR_CATEGORIA = {
  "COMPRA/COSTE_BASE": "Compra de tokens",
  "DEPOSITO/COSTE_BASE": "Ingreso de dinero",
  "COMISION/NEUTRO": "Comisión de red (gas)",
  "MOVIMIENTO/NEUTRO": "Movimiento neutro",
  "SPAM/NEUTRO": "Spam (no cuenta)",
};
const TX_OPERACIONES = {
  COSTE_BASE: "Compra de tokens",
  NEUTRO: "Sin efecto fiscal",
  GPP_REGALO: "Regalo recibido",
  RCM_REINVERTIDO: "Rendimiento reinvertido",
  RCM_RECLAMADO: "Rendimiento reclamado",
  RCM_PENDIENTE: "Rendimiento pendiente",
  RCM_REWARD: "Recompensa DeFi",
  GPP_INMUEBLE: "Venta de tokens",
  GPP_SWAP: "Permuta (cambio por otro token)",
  GPP_RETIRADA: "Salida de dinero",
  RCM_MIXTO: "Rendimiento mixto (a revisar)",
  PENDIENTE: "A revisar",
  DEFI_POOL: "DeFi · pool de liquidez",
  DEFI_REWARDS: "DeFi · recompensas",
};

/* Nombre de cada fuente en su filtro; una desconocida se muestra tal cual. */
const TX_FUENTES = { ONCHAIN: "On-chain", CSV_REENTAL: "Archivo de Reental" };

/* Columnas de la tabla: las mismas que el colgroup y la cabecera de
   #txTabla en index.html (si cambian allí, cambian aquí). */
const TX_N_COLUMNAS = 9;

/* Grupos de triaje (botones del resumen). Un registro con revisar=true va
   SIEMPRE a «revisar», sea cual sea su categoría. El spam también tiene su
   grupo (txGrupoDe), pero no botón: va aparte, con «Ver spam». */
const TX_GRUPOS = [
  { id: "revisar", etiqueta: "Revisar", ayuda: "Se resuelven en 🔍 Revisión." },
  { id: "fiscal", etiqueta: "Con efecto fiscal",
    ayuda: "Rendimientos, recompensas DeFi, compras, ventas, depósitos y retiradas." },
  { id: "neutro", etiqueta: "Neutros", ayuda: "Movimientos neutros (siguen siendo tuyos; no se declaran) y comisiones de red (gas)." },
];

/* Motivos del spam, en el orden en que se miran: el primero que
   encaja es el del registro. Las señales son las del motor (js/14 y
   nombreTokenSospechoso de js/02); aquí solo se dice cuál fue. */
const TX_MOTIVOS_SPAM = [
  { id: "ajuste", etiqueta: "Marcado como spam" },
  { id: "direccion", etiqueta: "Dirección marcada como spam" },
  { id: "token", etiqueta: "Token marcado como spam" },
  { id: "descartado", etiqueta: "Descartado en el catálogo" },
  { id: "sin-nombre", etiqueta: "Token sin nombre" },
  { id: "web", etiqueta: "Web en el nombre" },
  { id: "publicidad", etiqueta: "Publicidad en el nombre" },
  { id: "simbolos", etiqueta: "Símbolos raros en el nombre" },
  { id: "valor-cero", etiqueta: "Transferencia de 0" },
  { id: "imita", etiqueta: "Dirección que intenta imitar la tuya" },
  { id: "sin-valor", etiqueta: "Token desconocido sin valor" },
  { id: "otro", etiqueta: "Otro motivo" },
];
/* Los motivos que el motor deja escritos en su nota (js/14): la dirección o
   el token que mandaste al spam y la dirección que imita la
   tuya. */
const TX_MOTIVO_POR_NOTA = {
  [NOTA_SPAM_DIRECCION]: "direccion",
  [NOTA_SPAM_TOKEN]: "token",
  [NOTA_IMITA_DIRECCION]: "imita",
};
const TX_CATEGORIAS_NEUTRAS = ["MOVIMIENTO", "COMISION"];

function txGrupoDe(reg) {
  if (!reg) return "neutro";
  if (reg.revisar || reg.categoria === "REVISAR") return "revisar";
  if (reg.categoria === "SPAM") return "spam";
  if (TX_CATEGORIAS_NEUTRAS.includes(reg.categoria)) return "neutro";
  // El traspaso del vault a la wallet (RETIRADA NEUTRO) es neutro: el
  // motor no lo valora (no va a «Con efecto fiscal»).
  if (reg.subcategoria === "NEUTRO") return "neutro";
  return "fiscal";
}

/* Colores por categoría. Claro = los de las cifras de referencia; oscuro
   = el mismo tono apagado. Cada entrada: [fondo, borde, texto] en
   claro y en oscuro. Una categoría que no esté aquí usa el chip neutro
   (nunca se inventa un color ni se mete texto libre en una clase CSS). */
const TX_COLORES_CATEGORIA = {
  RENDIMIENTO:  { claro: ["#E2EFDA", "#a9cc93", "#2c5419"], oscuro: ["#1d2e17", "#3f6330", "#b5dca0"] },
  REWARD:     { claro: ["#C6EFCE", "#86cf97", "#1b5a2a"], oscuro: ["#133321", "#26633d", "#8fe0a7"] },
  COMPRA:     { claro: ["#DEEAF1", "#9dbdd4", "#1f4a66"], oscuro: ["#172a38", "#315470", "#a9cbe6"] },
  VENTA:      { claro: ["#FFF2CC", "#e6c870", "#664a00"], oscuro: ["#372d0e", "#6b561a", "#f2d27a"] },
  DEPOSITO:   { claro: ["#FCE4D6", "#eab394", "#7a3a12"], oscuro: ["#3a2416", "#6e4630", "#f5bf9c"] },
  RETIRADA:   { claro: ["#F4B183", "#d9854a", "#522505"], oscuro: ["#45230c", "#86461b", "#f6a36b"] },
  MOVIMIENTO: { claro: ["#F2F2F2", "#c9c9c9", "#404040"], oscuro: ["#232826", "#48524c", "#c9d1cc"] },
  COMISION:   { claro: ["#D9D9D9", "#ababab", "#333333"], oscuro: ["#2c302e", "#56605a", "#b3bbb6"] },
  SPAM:       { claro: ["#EEEEEE", "#cfcfcf", "#666666"], oscuro: ["#1f2421", "#3b443e", "#8a958e"] },
  REVISAR:    { claro: ["#FFCCCC", "#ea8f8f", "#8a1515"], oscuro: ["#3d1a16", "#7a3029", "#f2938a"] },
};

/* Clase CSS de color de una categoría: solo las conocidas; el resto, la
   neutra «tx-c-otra». */
function txClaseCategoria(categoria) {
  return Object.prototype.hasOwnProperty.call(TX_COLORES_CATEGORIA, categoria)
    ? "tx-c-" + categoria : "tx-c-otra";
}

/* Reglas CSS de la paleta: variables por categoría en claro (:root) y en
   oscuro (body.dark) + la clase de la etiqueta que las usa (sin
   franja de color en la fila, que confundía). Puro: devuelve el
   texto CSS (testeable). */
function txCssColoresCategoria() {
  const claro = [], oscuro = [], reglas = [];
  for (const [cat, c] of Object.entries(TX_COLORES_CATEGORIA)) {
    const v = cat.toLowerCase();
    const vars = t => "--txc-" + v + "-bg:" + t[0] + ";--txc-" + v + "-bd:" + t[1] + ";--txc-" + v + "-fg:" + t[2];
    claro.push(vars(c.claro));
    oscuro.push(vars(c.oscuro));
    reglas.push(".tx-cat.tx-c-" + cat + "{background:var(--txc-" + v + "-bg);border-color:var(--txc-" + v +
      "-bd);color:var(--txc-" + v + "-fg)}");
  }
  return ":root{" + claro.join(";") + "}\nbody.dark{" + oscuro.join(";") + "}\n" + reglas.join("\n");
}

/* Fecha sin hora en la celda, como dd/mm/aaaa (con la hora en el
   title) y hash más corto (0x + 4 … 4) que el de js/15, para que la tabla
   quepa. */
function txFechaCorta(fecha) {
  return fecha ? fechaEs(String(fecha).slice(0, 10)) : "sin fecha";
}
function txHashCorto(h) {
  const s = String(h || "");
  return s.length > 12 ? s.slice(0, 6) + "…" + s.slice(-4) : s;
}

/* Compra por transferencia bancaria (la valora el motor con el coste por
   token de la config, 100 € por defecto; las de RNT, P11, siempre con el
   coste que pusiste). */
function txEsCompraBancaria(reg) {
  return !!reg && reg.categoria === "COMPRA" && reg.via_compra === "BANCARIA";
}

/* Ejercicio = año de la fecha del registro ("AAAA"), o null sin fecha. */
function txEjercicio(reg) {
  const d = ccFechaDiaNorm(reg && reg.fecha);
  return d ? d.slice(0, 4) : null;
}

/* El pago de una venta vinculada sigue siendo un Depósito a propósito (abre
   el lote de la stablecoin en la fecha del cobro), pero su
   operación dice lo que es. */
/* ¿Es la nota del motor `base`? Un ajuste con nota le
   añade «; …» detrás (aplicarAjustesUsuario), así que vale también así. */
function txNotaDelMotor(nota, base) {
  const s = typeof nota === "string" ? nota : "";
  return s === base || s.startsWith(base + "; ");
}
function txOperacion(reg) {
  if (!reg) return "";
  /* Solo si sigue siendo el depósito del vínculo; si un
     ajuste lo cambió (neutro, spam…), dice lo que es ahora. */
  if (reg.pago_diferido && reg.pago_diferido.rol === "pago" && reg.categoria === "DEPOSITO") return "Cobro de una venta";
  /* No es un traspaso tuyo, lo devuelve quien cobró la compra. */
  if (reg.categoria === "MOVIMIENTO" && txNotaDelMotor(reg.nota, NOTA_RESTO_DEVUELTO)) return "Resto devuelto de una compra";
  if (txEsCanje(reg)) return "Canje de contrato";
  const sub = reg.subcategoria ? String(reg.subcategoria) : "";
  return TX_OPERACIONES_POR_CATEGORIA[reg.categoria + "/" + sub] || TX_OPERACIONES[sub] || sub;
}
/* Las dos mitades de un canje de contrato: la llegada (COMPRA por CANJE) y
   la quema del token viejo que el motor le empareja (`emparejarCanjes`,
   js/21, sobre copias: marca y manda a revisar). Una quema de más en el
   mismo hash es una venta. Las claves, una vez por clasificación. */
let txCanjeFoto = { registros: null, claves: null };
function txEsCanje(reg) {
  if (reg.categoria === "COMPRA") return reg.via_compra === "CANJE";
  if (reg.categoria !== "VENTA" || reg.subcategoria !== "GPP_INMUEBLE" || reg.destino !== BURN || reg.importe_usdt != null) return false;
  const registros = txRegistros();
  if (txCanjeFoto.registros !== registros) {
    const pares = emparejarCanjes(registros.map(r => Object.assign({}, r)));
    txCanjeFoto = { registros, claves: new Set([...pares.values()].map(b => b.clave)) };
  }
  return txCanjeFoto.claves.has(reg.clave);
}
/* Ayuda (title) de la operación: solo lo que no dice la celda (sin
   el código técnico ni la parte fiscal). En un spam, su
   motivo; en lo demás, la nota del motor, si la hay, y en un movimiento
   neutro, antes, qué supone (el texto de 🔍, que distingue lo que te
   llega por el sentido de la fila). Vacía si no hay nada. */
function txAyudaOperacion(reg, motivoSpam, sentido) {
  if (motivoSpam) return String(motivoSpam);
  const nota = reg && reg.nota ? "Nota del motor: " + fechasEnTextoEs(reg.nota) : "";
  if (txOperacion(reg) !== "Movimiento neutro") return nota;
  return (sentido === "entrada" ? CC_AYUDA_NEUTRO_ENTRADA : CC_AYUDA_NEUTRO) + (nota ? " " + nota : "");
}

/* Inmueble o activo que se muestra en la fila: inmueble si lo hay; si no,
   el símbolo o nombre del token. */
function txActivo(reg) {
  if (!reg) return "";
  return reg.inmueble || reg.simbolo || reg.token || "";
}

/* Solo un número de verdad: null, undefined, un texto («19») o true no
   lo son (un importe escrito como texto en «Ajustes en JSON» no se
   enseña como bueno: el motor lo marca a revisar). */
function txEsNumero(v) {
  return typeof v === "number" && Number.isFinite(v);
}

/* ¿Rendimiento de un inmueble? (categoría RENDIMIENTO, la que lleva íntegro
   y retención). */
function txEsRendimiento(reg) {
  return !!reg && reg.categoria === "RENDIMIENTO";
}

/* Importe legible: importe_usdt en USD nominal (USDT/USDC 1:1) o, si no
   hay, el coste en € de una compra bancaria. Vacío si no hay ninguno (no
   se inventa). En un rendimiento del archivo de Reental es su íntegro
   (integro_usdt), nunca el neto que llegó: importe_usdt sigue siendo lo que llegó, aquí solo se enseña
   otra cosa. */
function txImporteValor(reg) {
  if (!reg) return null;
  if (txEsRendimiento(reg) && txEsNumero(reg.integro_usdt)) return { v: Number(reg.integro_usdt), unidad: " USD" };
  for (const [v, unidad] of [[reg.importe_usdt, " USD"], [reg.coste_eur, " €"]]) {
    if (txEsNumero(v)) return { v: Number(v), unidad };
  }
  return null;
}
/* La cifra exacta (para la ayuda). */
function txImporte(reg) {
  const i = txImporteValor(reg);
  return i ? ccCantidad(i.v) + i.unidad : "";
}

/* Cifra de la tabla con 2 decimales; la exacta va en la ayuda.
   Una que no es 0 pero no llega a 0,01 sale «<0,01», para que no parezca
   un 0. `recortar` quita los ceros de relleno (cantidades: 200, no
   200,00); los importes llevan siempre sus 2 decimales. */
function txCifra(x, recortar) {
  const v = Number(x);
  if (x === null || x === undefined || !Number.isFinite(v)) return "";
  if (v !== 0 && Math.abs(v) < 0.01) return (v < 0 ? "-" : "") + "<0,01";
  return numEs(v, 2, false, !!recortar);
}
/* Cifra exacta para la ayuda: hasta 6 decimales como en toda la app y, si
   eso la deja en 0 sin serlo (restos de menos de una millonésima), con
   todos los decimales que haga falta: la tabla dice «<0,01» y la ayuda no
   puede decir 0. */
function txCifraExacta(x) {
  const v = Number(x);
  if (x === null || x === undefined || !Number.isFinite(v)) return "";
  const c = ccCantidad(v);
  return c === "0" && v !== 0 ? numEs(v, 20, false, true) : c;
}
/* Importe tal como se ve en la tabla: 2 decimales y su unidad. */
function txImporteCorto(reg) {
  const i = txImporteValor(reg);
  return i ? txCifra(i.v) + i.unidad : "";
}

/* Retención de Reental en un rendimiento, tal como viene en su archivo
   (nunca se calcula): «0 USD» si no la hay, nunca en blanco (en la ayuda
   del importe). Lo que no es un rendimiento no lleva retención: vacío. */
function txRetencion(reg) {
  if (!txEsRendimiento(reg)) return "";
  return ccCantidad(txEsNumero(reg.retencion_usdt) ? Number(reg.retencion_usdt) : 0) + " USD";
}
/* Línea pequeña bajo el importe de un rendimiento, SOLO si Reental retuvo
   algo: «(ret. 0,50)», entre paréntesis
   como «(retención)» en la cabecera. La de 0 va en la ayuda del importe. */
function txRetencionCorta(reg) {
  if (!txEsRendimiento(reg) || !txEsNumero(reg.retencion_usdt) || !(reg.retencion_usdt > 0)) return "";
  return "(ret. " + txCifra(Number(reg.retencion_usdt)) + ")";
}

/* Líneas de la burbuja del importe de un rendimiento (solo
   los datos, con las cifras exactas): íntegro, retención y neto (íntegro
   menos retención, como en el glosario; no lo
   que llegó, que con una parte pendiente es menos). La
   explicación va en la burbuja de la cabecera. En lo demás, una línea con
   el importe tal cual. */
function txLineasImporte(reg) {
  const imp = txImporte(reg);
  if (!txEsRendimiento(reg) || !txEsNumero(reg.integro_usdt)) return imp ? [imp] : [];
  const ret = txEsNumero(reg.retencion_usdt) ? Number(reg.retencion_usdt) : 0;
  const neto = Math.round((Number(reg.integro_usdt) - ret) * 1e6) / 1e6;
  return ["Rendimiento íntegro: " + imp, "Retención: " + txRetencion(reg),
    "Neto: " + ccCantidad(neto) + " USD"];
}
/* La misma ayuda en una línea (title y aria-label). */
function txAyudaImporte(reg) {
  return txLineasImporte(reg).join(" · ");
}

function txEtiquetaFuente(fuente) {
  return TX_FUENTES[fuente] || fuente;
}

/* ----------------------------- Sentido y contraparte (puro) -----------------------------
   Tus direcciones son la wallet y el vault de la config (el vault es opcional:
   sin él, nada se da por tuyo). Solo se leen origen y destino del registro:
   nada cambia en la clasificación. */
const TX_SENTIDOS = {
  entrada: { flecha: "↓", etiqueta: "Entrada", ayuda: "Entra en tus direcciones" },
  salida:  { flecha: "↑", etiqueta: "Salida", ayuda: "Sale de tus direcciones" },
  propias: { flecha: "⇄", etiqueta: "Entre tus direcciones", ayuda: "Va de una dirección tuya a otra tuya" },
};

/* propias = { wallet, vault } (sin normalizar). */
function txEsPropia(addr, propias) {
  const a = normalizarDireccion(addr);
  if (!a || !propias) return false;
  return a === normalizarDireccion(propias.wallet || "") || a === normalizarDireccion(propias.vault || "");
}

/* "entrada" | "salida" | "propias" | "" (sin origen ni destino tuyo: no se
   inventa). La comisión de red es siempre una salida: el gas lo paga quien
   envía, aunque la transacción fuera a otra dirección tuya. */
function txSentido(reg, propias) {
  if (!reg) return "";
  const o = txEsPropia(reg.origen, propias), d = txEsPropia(reg.destino, propias);
  if (reg.categoria === "COMISION" && o) return "salida";
  if (o && d) return "propias";
  if (d) return "entrada";
  if (o) return "salida";
  return "";
}

/* Dirección acortada como en Polygonscan: 0x1234a…5678b. */
function txDireccionCorta(addr) {
  const s = String(addr || "");
  return s.length > 14 ? s.slice(0, 7) + "…" + s.slice(-5) : s;
}

/* Nombres cortos de los contratos que la app conoce, por dirección
   normalizada: { dir: { corto, largo } }. Los distribuidores y el
   settlement son de Reental (nombre corto propio; el aprendido, en la
   ayuda); los DeFi, con el nombre aprendido; los tokens de inmuebles
   confirmados, con el nombre del inmueble; y las stablecoins y el RNT.
   Puro: solo lee la cache recibida. */
function txNombresContratos(cache) {
  const n = {};
  const poner = (addr, corto, largo) => {
    const a = normalizarDireccion(addr);
    if (a && corto) n[a] = { corto, largo: largo || corto };
  };
  poner(USDT, "Contrato USDT");
  poner(USDC, "Contrato USDC");
  poner(RNT, "Contrato RNT");
  const c = pdEsObjeto(cache) ? cache : {};
  for (const [addr, e] of Object.entries(c.catalogo_propiedades || {})) {
    if (estadoCatalogo(e) !== "CONFIRMADA") continue;
    const nombre = e.nombre_reental || e.nombre_etherscan;
    if (nombre) poner(addr, "Token " + nombre, "Contrato del token del inmueble " + nombre);
  }
  const cortoPorRol = { DISTRIBUIDOR: "Reental · repartos", SETTLEMENT: "Reental · liquidación" };
  for (const [rol, bloque] of Object.entries(c.contratos_aprendidos || {})) {
    for (const [addr, texto] of Object.entries(pdEsObjeto(bloque) ? bloque : {})) {
      const largo = typeof texto === "string" && texto.trim() ? textoCacheVigente(texto.trim()) : "";
      poner(addr, cortoPorRol[rol] || largo, largo || cortoPorRol[rol]);
    }
  }
  return n;
}

/* Contraparte de la fila: la otra dirección del movimiento (el origen de
   una entrada, el destino de una salida o de un traspaso entre las tuyas).
   ctx = { propias: {wallet, vault}, nombres: txNombresContratos }.
   Devuelve { dir, texto, ayuda, conocida } o null si no la hay. */
function txContraparte(reg, ctx) {
  const c = ctx || {};
  const sentido = txSentido(reg, c.propias);
  const dir = normalizarDireccion(sentido === "entrada" ? reg.origen : sentido ? reg.destino : "");
  if (!dir) return null;
  const propias = c.propias || {};
  let texto, nombre = "";
  if (dir === normalizarDireccion(propias.wallet || "")) texto = nombre = "Tu wallet";
  else if (dir === normalizarDireccion(propias.vault || "")) texto = nombre = "Tu vault";
  else if (dir === BURN) {
    texto = "Dirección cero";
    nombre = "Dirección cero (emisión y quema de tokens)";
  } else if (c.nombres && c.nombres[dir]) {
    texto = c.nombres[dir].corto;
    nombre = c.nombres[dir].largo;
  } else texto = txDireccionCorta(dir);
  return { dir, texto, ayuda: dir + (nombre ? " · " + nombre : ""), conocida: !!nombre };
}

/* Flecha del sentido, delante de la operación (así todas quedan en la misma vertical). Forma y color; la burbuja, al pasar
   el ratón o al llegar con el teclado, con el texto en el aria-label. La
   flecha y la burbuja las pone el CSS (::before y ::after): el texto de la
   celda sigue siendo solo la operación. Sin sentido, un hueco del mismo
   ancho. */
function txHtmlSentido(sentido) {
  const s = TX_SENTIDOS[sentido];
  if (!s) return '<span class="tx-sentido tx-s-ninguno" aria-hidden="true"></span>';
  return '<span class="tx-sentido tx-s-' + sentido + '" role="img" tabindex="0" aria-label="' + ccEsc(s.etiqueta + ": " + s.ayuda) +
    '" data-flecha="' + s.flecha + '" data-ayuda="' + ccEsc(s.etiqueta) + '"></span>';
}

/* Movimientos relacionados por los vínculos CONFIRMADOS de pagos
   diferidos: Map clave → { otros: [{ rol: "cobro"|"venta", reg }], busqueda:
   [textos] }. La venta lleva sus cobros; cada cobro, su venta. busqueda =
   id del vínculo, inmueble y símbolo de la venta, para que buscar el
   inmueble encuentre también sus pagos. Nada se inventa: un
   movimiento que no está en la sesión no aparece.
   Un cobro asignado entero (Σ cantidad_asignada = su cantidad) cuyas
   ventas están todas en la sesión lleva además plegado: true: en la tabla
   va dentro de su venta, no en una fila propia. Uno con resto
   sin asignar no se pliega: ese dinero no es de ninguna venta. */
function txRelacionesVinculos(registros, ventas) {
  const rel = new Map();
  const regs = registros || [];
  const anadir = (reg, otros, textos) => {
    const e = rel.get(reg.clave) || { otros: [], busqueda: [] };
    e.otros.push(...otros);
    e.busqueda.push(...textos.filter(Boolean));
    rel.set(reg.clave, e);
  };
  const cobros = new Map(); // clave → { reg, asignado, sinVenta }
  for (const v of ventas || []) {
    if (!v || v.estado !== "CONFIRMADO") continue;
    const sal = resolverReferenciaMovimiento(v.salida, regs);
    const pagos = [];
    for (const a of ccAsignaciones(v)) { // mal escritas, ninguna
      const p = a ? resolverReferenciaMovimiento(a.pago, regs) : null;
      if (!p) continue;
      pagos.push(p);
      const c = cobros.get(p.clave) || { reg: p, asignado: 0, sinVenta: false };
      c.asignado = red6(c.asignado + (Number(a.cantidad_asignada) || 0));
      /* Solo va dentro de su venta si el motor aplicó el
         vínculo (su marca pago_diferido lo dice); uno con problemas sigue
         en su fila. */
      const pd = p.pago_diferido;
      const aplicado = !!pd && pd.rol === "pago" && [].concat(pd.venta_id).includes(v.id);
      if (!sal || !aplicado) c.sinVenta = true;
      cobros.set(p.clave, c);
    }
    const textos = [v.id, sal && sal.inmueble, sal && sal.simbolo];
    if (sal) anadir(sal, pagos.map(p => ({ rol: "cobro", reg: p })), [v.id]);
    for (const p of pagos) anadir(p, sal ? [{ rol: "venta", reg: sal }] : [], textos);
  }
  for (const [clave, c] of cobros) {
    const cant = Number(c.reg.cantidad);
    if (!c.sinVenta && c.asignado > 0 && c.reg.cantidad !== null && Number.isFinite(cant) &&
        Math.abs(red6(cant - c.asignado)) <= 1e-9) rel.get(clave).plegado = true;
  }
  return rel;
}

/* ¿Va este registro dentro de su venta (cobro plegado)? */
function txEsCobroPlegado(reg, rel) {
  const e = reg && rel ? rel.get(reg.clave) : null;
  return !!(e && e.plegado);
}

/* Búsqueda de texto: hash, inmueble, token/símbolo, clave, nota y fecha
   (también como se enseña: 01/03/2026) sin distinguir mayúsculas ni tildes
   («caceres» encuentra «Cáceres», como en 💰 Rendimientos), más los
   textos de su vínculo, la nota personal y el motivo del spam (`extra`).
   Consulta vacía = coincide todo. */
let txConsultaVista = ["", ""]; // [la última consulta, normalizada]: una vez, no por fila
/* ¿Hay búsqueda? Una tilde suelta («´») no es buscar nada. */
function txHayBusqueda(q) {
  return !!normalizarNombreInmueble(String(q || ""));
}
function txCoincideBusqueda(reg, q, extra) {
  const s = String(q || "");
  if (txConsultaVista[0] !== s) txConsultaVista = [s, normalizarNombreInmueble(s)];
  const t = txConsultaVista[1];
  if (!t) return true;
  if (!reg) return false;
  const campos = [reg.hash, reg.clave, reg.inmueble, reg.token, reg.simbolo,
                  reg.nota, reg.categoria, reg.subcategoria, txOperacion(reg),
                  reg.fecha, fechaEs(reg.fecha), fechasEnTextoEs(reg.nota)].concat(extra || []);
  return campos.some(c => c !== null && c !== undefined && normalizarNombreInmueble(String(c)).includes(t));
}

/* Entre dos fechas: la regla de js/15 (días «aaaa-mm-dd», los dos
   incluidos, uno vacío = sin ese límite, sin fecha no pasa). Si vienen al
   revés (una fecha escrita a mano se salta los topes de los calendarios)
   se toman en su orden. */
function txEntreFechas(reg, desde, hasta) {
  return desde && hasta && desde > hasta ? ccEnRangoFechas(reg, hasta, desde) : ccEnRangoFechas(reg, desde, hasta);
}

/* Lo DeFi de una clasificación, { dirs, hashes }.
   - dirs: las direcciones con un rol DeFi (pool, farming, staking,
     recompensas) tal como las ve el motor (construirContexto de js/14: un
     rol por dirección y el mismo prefijo «DEFI»).
   - hashes: las transacciones que usan DeFi, para que su gas cuente:
     las que tienen otro registro DeFi (también un
     swap por un intermediario que la app no conoce) y las aprobaciones
     (approve, 0x095ea7b3) de un token a un contrato DeFi, cuyo destino es
     el token y el contrato DeFi va dentro del input. */
const TX_APPROVE = "0x095ea7b3";
function txDatosDefi(cache, registros) {
  const roles = pdEsObjeto(cache) ? construirContexto(cache).roles : {};
  const dirs = new Set(Object.keys(roles).filter(a => String(roles[a] || "").startsWith("DEFI")));
  const hashes = new Set();
  for (const r of registros || []) {
    if (r && r.hash && r.categoria !== "COMISION" && txTocaDefi(r, dirs)) hashes.add(String(r.hash).toLowerCase());
  }
  const series = pdEsObjeto(cache) && pdEsObjeto(cache.transacciones) ? cache.transacciones : {};
  for (const serie of ["wallet_normales", "vault_normales"]) {
    for (const tx of Array.isArray(series[serie]) ? series[serie] : []) {
      const input = String((tx && tx.input) || "").toLowerCase();
      if (tx && tx.hash && input.startsWith(TX_APPROVE) && input.length >= 74 && dirs.has("0x" + input.slice(34, 74))) {
        hashes.add(String(tx.hash).toLowerCase());
      }
    }
  }
  return { dirs, hashes };
}
function txTocaDefi(reg, dirs) {
  return [reg.origen, reg.destino, reg.contrato].some(a => !!a && dirs.has(normalizarDireccion(a)));
}
/* ¿Es DeFi? Una recompensa DeFi, lo que toca un contrato DeFi o el gas de
   una transacción que usa DeFi. defi = txDatosDefi. */
function txEsDefi(reg, defi) {
  return reg.categoria === "REWARD" || txTocaDefi(reg, defi.dirs) ||
    (reg.categoria === "COMISION" && !!reg.hash && defi.hashes.has(String(reg.hash).toLowerCase()));
}

/* Lo DeFi de la clasificación que se ve: se calcula al
   clasificar, con la cache de ese momento, y no cambia hasta la siguiente
   clasificación, aunque entretanto se añada o quite un contrato DeFi. */
let txDefiFoto = { registros: null, defi: null };
function txTomarFotoDefi() {
  const registros = Array.isArray(state.registros) ? state.registros : [];
  txDefiFoto = { registros, defi: txDatosDefi(state.cache, registros) };
}
function txDefiVigente() {
  if (txDefiFoto.registros !== (Array.isArray(state.registros) ? state.registros : [])) txTomarFotoDefi();
  return txDefiFoto.defi;
}

/* Filtros: { categoria, ejercicio, desde, hasta, inmueble, fuente, defi, q, grupo, ocultarSpam,
   plegarCobros, notas }; cada uno vacío = sin filtro (notas = el bloque de
   notas personales, para que la búsqueda las encuentre; defi = solo lo DeFi:
   txDatosDefi). ocultarSpam deja fuera el
   spam salvo en el «modo spam» (categoría SPAM elegida): ni el grupo ni
   una búsqueda lo sacan. plegarCobros deja fuera los cobros
   que van dentro de su venta (txEsCobroPlegado) salvo al buscar: así salen
   al buscar su hash o desde «Ver en Transacciones →» de «Resueltos».
   `excepto` permite omitir uno (recuentos facetados del selector de
   categoría: ahí tampoco se oculta el spam, para que su opción diga
   cuántos hay; los cobros plegados sí, porque cuentan lo que se ve). rel =
   txRelacionesVinculos (opcional). */
/* ¿Queda oculto este spam con estos filtros? (fuera del modo spam). Un
   spam que además está a revisar cuenta en «A revisar»
   (txGrupoDe) y sale en 🔍 Revisión: con ese grupo, se ve; y con «DeFi»,
   que también lo cuenta. También lo usa el total del
   recuento. */
function txSpamOculto(reg, f) {
  return !!f.ocultarSpam && reg.categoria === "SPAM" && f.categoria !== "SPAM" &&
    !((f.grupo === "revisar" || f.defi) && txGrupoDe(reg) === "revisar");
}
function txPasaFiltros(reg, f, excepto, rel) {
  f = f || {};
  const buscando = txHayBusqueda(f.q);
  if (f.plegarCobros && !buscando && txEsCobroPlegado(reg, rel)) return false;
  if (excepto !== "categoria" && txSpamOculto(reg, f)) return false;
  if (excepto !== "categoria" && f.categoria && reg.categoria !== f.categoria) return false;
  if (excepto !== "ejercicio" && f.ejercicio && txEjercicio(reg) !== f.ejercicio) return false;
  if (!txEntreFechas(reg, f.desde, f.hasta)) return false;
  if (excepto !== "inmueble" && f.inmueble && reg.inmueble !== f.inmueble) return false;
  if (excepto !== "fuente" && f.fuente && reg.fuente !== f.fuente) return false;
  if (f.defi && !txEsDefi(reg, f.defi)) return false;
  if (excepto !== "grupo" && f.grupo && txGrupoDe(reg) !== f.grupo) return false;
  /* Un motivo del spam pulsado: solo ese spam. */
  if (excepto !== "motivo" && f.motivo && (reg.categoria !== "SPAM" || txMotivoSpam(reg, f.ctxSpam) !== f.motivo)) return false;
  if (excepto !== "q") {
    const extra = (rel && rel.get(reg.clave) ? rel.get(reg.clave).busqueda : []).concat(txTextoNota(f.notas, reg.clave));
    /* El spam, también por su motivo («marcado», «imitar»): lo que se lee en la fila. */
    if (buscando && reg.categoria === "SPAM") extra.push(txEtiquetaMotivoSpam(txMotivoSpam(reg, f.ctxSpam)));
    if (!txCoincideBusqueda(reg, f.q, extra)) return false;
  }
  return true;
}

/* Orden del libro: más recientes primero; los sin fecha al final; empate
   por hash y clave (determinista). No muta la entrada. */
function txOrdenar(registros) {
  return registros.slice().sort((a, b) => {
    const fa = a.fecha || "", fb = b.fecha || "";
    if (fa !== fb) {
      if (!fa) return 1;
      if (!fb) return -1;
      return fa < fb ? 1 : -1;
    }
    return String(a.hash || "").localeCompare(String(b.hash || "")) ||
           String(a.clave || "").localeCompare(String(b.clave || ""));
  });
}

function txFiltrar(registros, f, rel) {
  return txOrdenar((registros || []).filter(r => r && txPasaFiltros(r, f, undefined, rel)));
}

/* Opciones de los selects: solo valores presentes (nunca inventados). */
function txOpciones(registros) {
  const cats = new Set(), ejs = new Set(), inms = new Set(), fuentes = new Set();
  for (const r of registros || []) {
    if (!r) continue;
    if (r.categoria) cats.add(r.categoria);
    const e = txEjercicio(r);
    if (e) ejs.add(e);
    if (r.inmueble) inms.add(r.inmueble);
    if (r.fuente) fuentes.add(r.fuente);
  }
  return {
    categorias: [...cats].sort(),
    ejercicios: [...ejs].sort().reverse(),
    inmuebles: [...inms].sort((a, b) => a.localeCompare(b)),
    fuentes: [...fuentes].sort(),
  };
}

/* Recuento por categoría con los demás filtros aplicados (facetado), en
   orden de mayor a menor y luego alfabético. */
function txConteoCategorias(registros, f, rel) {
  const conteo = {};
  const sinMotivo = Object.assign({}, f, { motivo: "" }); // el motivo del spam no cambia los números del selector
  /* Ni el grupo pulsado cambia el del spam («A revisar» o «Con
     efecto fiscal» dejaban «Ver spam» a 0): al ver el spam no hay grupos. */
  const sinGrupo = Object.assign({}, sinMotivo, { grupo: "", defi: null }); // ni «DeFi», que se suelta al ver el spam
  for (const r of registros || []) {
    if (!r || !txPasaFiltros(r, r.categoria === "SPAM" ? sinGrupo : sinMotivo, "categoria", rel)) continue;
    conteo[r.categoria] = (conteo[r.categoria] || 0) + 1;
  }
  return Object.entries(conteo)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([categoria, n]) => ({ categoria, n }));
}

/* Resumen de triaje sobre TODOS los registros (no depende de filtros),
   menos los cobros que van dentro de su venta si se pasa rel. Con defi
   (txDatosDefi), también cuántos son DeFi de los que se ven sin el spam. */
function txResumenTriaje(registros, rel, defi) {
  const res = { total: 0, revisar: 0, fiscal: 0, neutro: 0, spam: 0, defi: 0 };
  for (const r of registros || []) {
    if (!r || txEsCobroPlegado(r, rel)) continue;
    res.total++;
    const grupo = txGrupoDe(r);
    res[grupo]++;
    // Un spam a revisar cuenta, como en «A revisar».
    if (defi && (r.categoria !== "SPAM" || grupo === "revisar") && txEsDefi(r, defi)) res.defi++;
  }
  return res;
}

/* ----------------------------- El spam, aparte (puro) -----------------------------
   El modo spam es la categoría SPAM elegida en el
   selector: «Ver spam» y «Salir del spam» solo la ponen o la quitan. */
function txModoSpam(f) {
  return !!f && f.categoria === "SPAM";
}

/* Lo que hace falta para saber el motivo: los ajustes del usuario y los
   contratos que descartó en el catálogo (normalizados). Solo lee. */
function txContextoSpam(cache) {
  const c = pdEsObjeto(cache) ? cache : {};
  const descartadas = new Set();
  for (const [addr, e] of Object.entries(pdEsObjeto(c.catalogo_propiedades) ? c.catalogo_propiedades : {})) {
    if (estadoCatalogo(e) === "DESCARTADA") descartadas.add(normalizarDireccion(addr));
  }
  return { ajustes: pdEsObjeto(c.ajustes_usuario) ? c.ajustes_usuario : {}, descartadas };
}

/* Motivo (id de TX_MOTIVOS_SPAM) por el que un registro es spam, con las
   mismas señales y en el mismo orden que el motor: un ajuste tuyo que lo
   pone como spam, lo que el motor deja dicho en su nota (TX_MOTIVO_POR_NOTA),
   el catálogo, el nombre del token (sin nombre, una web, palabras de
   publicidad o símbolos raros: lo que mira nombreTokenSospechoso) y la
   cantidad. No cambia nada: solo lo dice. */
function txMotivoSpam(reg, ctx) {
  if (!reg) return "otro";
  const c = ctx || {};
  const aj = ccBuscarAjuste(c.ajustes, reg.clave);
  if (aj && pdEsObjeto(aj.ajuste) && String(aj.ajuste.categoria || "").toUpperCase() === "SPAM") return "ajuste";
  const porNota = Object.keys(TX_MOTIVO_POR_NOTA).find(n => txNotaDelMotor(reg.nota, n));
  if (porNota) return TX_MOTIVO_POR_NOTA[porNota];
  if (c.descartadas && c.descartadas.has(normalizarDireccion(reg.contrato || ""))) return "descartado";
  const nombre = typeof reg.token === "string" ? reg.token : "";
  const simbolo = typeof reg.simbolo === "string" ? reg.simbolo : "";
  if (nombreTokenSospechoso(nombre, simbolo)) {
    if (!nombre.trim()) return "sin-nombre";
    const textos = [nombre, simbolo].map(t => t.toLowerCase());
    if (textos.some(t => RE_URL.test(t))) return "web";
    if (textos.some(t => RE_PALABRA_SPAM.test(t))) return "publicidad";
    return "simbolos";
  }
  if (reg.cantidad === 0 || reg.cantidad === "0") return "valor-cero";
  if (!txEsNumero(reg.cantidad) || !Number(reg.cantidad)) return "sin-valor";
  return "otro";
}
function txEtiquetaMotivoSpam(id) {
  const m = TX_MOTIVOS_SPAM.find(x => x.id === id);
  return m ? m.etiqueta : id;
}

/* Cuántos registros de spam hay por motivo: [{ id, etiqueta, n }], de más
   a menos (empate: el orden de TX_MOTIVOS_SPAM). Solo cuenta el spam. */
function txResumenSpam(registros, ctx) {
  const n = {};
  for (const r of registros || []) {
    if (!r || r.categoria !== "SPAM") continue;
    const m = txMotivoSpam(r, ctx);
    n[m] = (n[m] || 0) + 1;
  }
  const orden = id => TX_MOTIVOS_SPAM.findIndex(x => x.id === id);
  return Object.keys(n).sort((a, b) => n[b] - n[a] || orden(a) - orden(b))
    .map(id => ({ id, etiqueta: txEtiquetaMotivoSpam(id), n: n[id] }));
}

/* Recuento corto: «500 movimientos»; con filtros, «120 de 500
   movimientos»; en el modo spam, «… movimientos de spam». Cada fila es un
   movimiento (una transacción de la blockchain puede tener varios). */
function txTextoRecuento(visibles, total, filtrado, spam) {
  const mov = n => (n === 1 ? " movimiento" : " movimientos") + (spam ? " de spam" : "");
  return filtrado && visibles !== total
    ? numEs(visibles, 0) + " de " + numEs(total, 0) + mov(total)
    : numEs(total, 0) + mov(total);
}

/* El total del recuento: lo que tiene el libro (o el spam, en su modo) sin
   los filtros del usuario; los cobros que van dentro de su venta no cuentan
   aparte. Fuera del modo spam, el spam que se puede ver
   (el que está a revisar, con «A revisar» pulsado) también cuenta,
   para que nunca salga «3 de 1 movimiento». */
function txTotalRecuento(registros, f, rel, spam) {
  const buscando = txHayBusqueda(f.q);
  const base = (registros || []).filter(r => r && (r.categoria === "SPAM") === spam &&
    !(f.plegarCobros && !buscando && txEsCobroPlegado(r, rel))).length;
  /* El spam que se puede ver, sin los demás filtros del usuario (si
     no, el «de N» cambiaba al filtrar por año o al buscar). */
  return spam ? base : base + (registros || []).filter(r => r && r.categoria === "SPAM" && !txSpamOculto(r, f)).length;
}

/* ----------------------------- «Mandar a revisar» (puro) ----------------------------- */

/* Las claves de los ajustes se normalizan y se buscan con ccClaveAjuste y
   ccBuscarAjuste de js/15 (igual que aplicarAjustesUsuario de js/14). */

/* ¿Es un ajuste escrito por «Mandar a revisar» de esta pestaña? Solo si
   tiene EXACTAMENTE revisar:true + nota con el marcador (así deshacer nunca
   borra información de otro origen), y como mucho el coste_eur de una
   compra bancaria y lo pagado en USD (deshacer los conserva). */
function txEsAjusteMandarRevisar(ajuste) {
  return ccSoloCampos(ajuste, ["revisar", "nota", "coste_eur", ...CC_CAMPOS_USD]) && ajuste.revisar === true &&
         typeof ajuste.nota === "string" && ccEmpiezaConMarca(ajuste.nota, TX_MARCA_REVISAR);
}

/* Estado del registro frente a «Mandar a revisar»:
   - "spa":    lo mandaste tú desde aquí → se puede quitar (deshacer).
   - "motor":  ya está a revisar (lo marcó el motor u otro ajuste) → nada.
   - "ajeno":  tiene otro ajuste manual (p. ej. del panel) → no se pisa.
   - "libre":  se puede mandar a revisar (también con un coste de
               «💶 Coste…», que va dentro).
   Sin cache cargada, txPintarCuerpo pasa "sin-cache" en su lugar. En la
   fila, "motor" y "sin-cache" no llevan botón. */
function txEstadoRevisar(reg, ajustes) {
  const hallado = ccBuscarAjuste(ajustes, reg && reg.clave);
  if (hallado && txEsAjusteMandarRevisar(hallado.ajuste)) return "spa";
  if (reg && reg.revisar) return "motor";
  if (hallado && !ccEsAjusteCoste(hallado.ajuste)) return "ajeno"; // con un coste de «💶 Coste…» sí se puede

  return "libre";
}

function txNotaMandarRevisar(motivo, fechaISO) {
  return ccNotaMandarRevisar(motivo, fechaISO);
}

/* Devuelve un objeto de ajustes NUEVO con el ajuste de revisar añadido
   (no muta el recibido). Lanza si la clave ya tiene un ajuste (nunca se
   pisa uno existente). */
function txAjustesConRevisar(ajustes, clave, motivo, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const k = ccClaveAjuste(clave);
  if (!k) throw new Error("Registro sin clave: no se puede mandar a revisar.");
  const h = ccBuscarAjuste(base, k);
  /* Un coste de «💶 Coste…» no lo impide: va dentro del
     «Mandado a revisar» y «↩ Quitar de revisar» lo devuelve. */
  if (h && !ccEsAjusteCoste(h.ajuste)) throw new Error("Este registro ya tiene un ajuste manual: edítalo en Revisión.");
  const copia = Object.assign({}, base);
  if (h) delete copia[h.clave];
  copia[k] = { revisar: true, nota: txNotaMandarRevisar(motivo, fechaISO) };
  if (h) ccConUsd(Object.assign(copia[k], { coste_eur: h.ajuste.coste_eur }), h.ajuste);
  return copia;
}

/* Deshacer: objeto NUEVO sin el ajuste de revisar de la SPA. Si el ajuste
   de esa clave no es de «Mandar a revisar», lanza (no se borra nada ajeno).
   Si llevaba un coste, se queda como el de «💶 Coste…». */
function txAjustesSinRevisar(ajustes, clave, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const hallado = ccBuscarAjuste(base, clave);
  if (!hallado) throw new Error("No hay ajuste de revisar para este registro.");
  if (!txEsAjusteMandarRevisar(hallado.ajuste)) {
    throw new Error("El ajuste de este registro no lo creó «Mandar a revisar»: no se borra desde aquí.");
  }
  const copia = Object.assign({}, base);
  delete copia[hallado.clave];
  if ("coste_eur" in hallado.ajuste) {
    copia[hallado.clave] = ccConUsd(ccAjusteCoste(hallado.ajuste.coste_eur, fechaISO), hallado.ajuste);
  }
  return copia;
}

/* ----------------------------- Mandar al spam y sacar de él (puro) -----------------------------
   Como «Mandar a revisar», cada cosa es un ajuste en
   ajustes_usuario con su marca en la nota, que el motor ya aplica
   (sin reglas nuevas) y que se deshace borrándolo:
   - 🚫 «Mandar al spam»: { categoria: SPAM, subcategoria: NEUTRO,
     revisar: false, nota: "Mandado al spam por ti (fecha)" }. Su ↩
     lo borra y el movimiento vuelve a ser lo que era.
   - ↩ en un spam de la app (sin ajuste): { categoria: REVISAR,
     subcategoria: PENDIENTE, revisar: true, nota: "Sacado del spam por ti
     (fecha)" }. La app no sabe qué es: queda a revisar, con la
     marca ↩ en su fila. Su 🚫 lo borra y vuelve al spam.
   Las marcas, sin emojis: la nota se guarda en la cache y otras
   herramientas la leen. */
const TX_MARCA_SPAM = CC_MARCA_SPAM;
const TX_MARCA_SACADO = CC_MARCA_SACADO;
/* Solo se manda al spam lo que puede ser basura: no los rendimientos, las
   compras, las ventas y permutas ni las comisiones de red, ni las ventas vinculadas o por vincular. */
const TX_CATEGORIAS_A_SPAM = ["DEPOSITO", "MOVIMIENTO", "REWARD", "RETIRADA", "REVISAR"];

/* ¿Es un ajuste de esta pestaña con esa marca y esos valores? Solo si no
   lleva nada más (así deshacer nunca borra información de otro origen). */
function txEsAjusteDeSpam(ajuste, marca, categoria, revisar) {
  return ccSoloCampos(ajuste, ["categoria", "subcategoria", "revisar", "nota"]) &&
         ajuste.categoria === categoria && ajuste.revisar === revisar &&
         typeof ajuste.nota === "string" && ccEmpiezaConMarca(ajuste.nota, marca);
}
function txEsAjusteMandarSpam(ajuste) {
  return txEsAjusteDeSpam(ajuste, TX_MARCA_SPAM, "SPAM", false);
}
function txEsAjusteSacarSpam(ajuste) {
  return txEsAjusteDeSpam(ajuste, TX_MARCA_SACADO, "REVISAR", true);
}

/* Qué se puede hacer con un registro frente al spam:
   - "quitar":   lo mandaste tú al spam → ↩ borra el ajuste.
   - "sacar":    es spam de la app → ↩ lo deja a revisar.
   - "devolver": lo sacaste tú del spam → 🚫 borra el ajuste (vuelve al spam).
   - "mandar":   se puede mandar al spam → 🚫.
   - "regla":    es spam porque mandaste su dirección o su token entero
                 → ↩ los quita.
   - "ajeno":    es spam por un ajuste de otro origen → ↩ inactivo.
   - "":         nada. opts = { pendiente, vinculo, regla } de la fila
                 (regla = txReglaSpam). */
function txEstadoSpam(reg, ajustes, opts = {}) {
  if (!reg) return "";
  const hallado = ccBuscarAjuste(ajustes, reg.clave);
  if (hallado && txEsAjusteMandarSpam(hallado.ajuste)) return "quitar";
  if (hallado && txEsAjusteSacarSpam(hallado.ajuste)) return "devolver";
  if (!hallado && opts.regla) return "regla";
  if (reg.categoria === "SPAM") return hallado ? "ajeno" : "sacar";
  if (hallado || opts.pendiente === "salida" || opts.vinculo) return "";
  return TX_CATEGORIAS_A_SPAM.includes(reg.categoria) ? "mandar" : "";
}

/* Objeto de ajustes NUEVO con el ajuste de 🚫 («spam») o de ↩ («sacar»).
   Lanza si la clave ya tiene un ajuste (nunca se pisa uno existente). */
function txAjustesConSpam(ajustes, clave, tipo, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const k = ccClaveAjuste(clave);
  if (!k) throw new Error("Movimiento sin clave: no se puede cambiar.");
  if (ccBuscarAjuste(base, k)) throw new Error("Ya tiene un ajuste: edítalo en 🔍 Revisión.");
  const ajuste = tipo === "sacar"
    ? ccAjusteSacadoSpam(fechaISO)
    : { categoria: "SPAM", subcategoria: "NEUTRO", revisar: false, nota: TX_MARCA_SPAM + ccDiaNota(fechaISO) };
  return Object.assign({}, base, { [k]: ajuste });
}

/* Deshacer (↩ de lo que mandaste o 🚫 de lo que sacaste): objeto NUEVO sin
   ese ajuste. Si no es de esta pestaña, lanza (no se borra nada ajeno). Un
   «Es spam» decidido en Revisión se deshace como allí: vuelve el ajuste que
   sustituyó (fechaISO, para el que no guardó su fecha). */
function txAjustesSinSpam(ajustes, clave, fechaISO) {
  const base = pdEsObjeto(ajustes) ? ajustes : {};
  const hallado = ccBuscarAjuste(base, clave);
  if (!hallado || !(txEsAjusteMandarSpam(hallado.ajuste) || txEsAjusteSacarSpam(hallado.ajuste))) {
    throw new Error("Este ajuste no se hizo desde aquí: edítalo en 🔍 Revisión.");
  }
  if (ccEsAjusteDecision(hallado.ajuste)) return ccAjustesSinDecision(base, clave, fechaISO || ahoraLocalISO());
  const copia = Object.assign({}, base);
  delete copia[hallado.clave];
  return copia;
}

/* ----------------------------- Toda la dirección y todo el token (puro) -----------------------------
   No son ajustes de un movimiento sino reglas que
   el motor aplica (también a lo que llegue después), en su propio
   bloque de la cache: spam_usuario = { direcciones: { dir: { fecha } },
   tokens: { contrato: { fecha, simbolo } } }. Deshacer quita la entrada y,
   si el bloque se queda vacío, el bloque: la cache vuelve a ser la de
   antes. */
const TX_APARTAR = {
  direcciones: { nota: NOTA_SPAM_DIRECCION, motivo: "direccion", todo: "Toda la dirección", mandado: "Dirección mandada al spam", quitado: "Dirección quitada del spam" },
  tokens: { nota: NOTA_SPAM_TOKEN, motivo: "token", todo: "Todo el token", mandado: "Token mandado al spam", quitado: "Token quitado del spam" },
};
/* «Toda la dirección», solo en lo que llega (depósitos y «a revisar»): las
   demás categorías de 🚫 no vienen de una dirección desconocida. */
const TX_CATEGORIAS_APARTAR_DIRECCION = ["DEPOSITO", "REVISAR"];

/* Qué más se puede mandar al spam desde una fila con 🚫: { direccion, token }
   (normalizados, o "" si no se ofrece). La dirección, si el movimiento llega
   a una tuya desde una desconocida (nunca una tuya, de Reental, DeFi o un
   inmueble); el token, si no es conocido (ni USDT, USDC, RNT, un inmueble
   confirmado o un contrato aprendido). Solo movimientos de un token con
   contrato (no POL), que es donde actúa la regla del motor, y nada que
   ya esté apartado. contexto = construirContexto(cache) de js/14 (lleva
   también lo apartado: spamDirecciones y spamTokens). */
function txOpcionesApartar(reg, contexto) {
  const nada = { direccion: "", token: "" };
  if (!reg || !contexto || !TX_CATEGORIAS_A_SPAM.includes(reg.categoria)) return nada;
  const contrato = normalizarDireccion(reg.contrato || "");
  if (!direccionValida(contrato)) return nada;
  const origen = normalizarDireccion(reg.origen || "");
  const direccion = TX_CATEGORIAS_APARTAR_DIRECCION.includes(reg.categoria) &&
    clasificarDireccion(reg.destino || "", contexto) === "PROPIA" &&
    clasificarDireccion(origen, contexto) === "DESCONOCIDA" && !contexto.spamDirecciones.has(origen) ? origen : "";
  const token = !contexto.conocidos.has(contrato) && !contexto.spamTokens.has(contrato) ? contrato : "";
  return { direccion, token };
}

/* Bloque NUEVO con la dirección o el token añadido (no muta el recibido).
   tipo = "direcciones" | "tokens"; el token guarda su símbolo para
   reconocerlo al abrir la cache. */
function txSpamUsuarioCon(bloque, tipo, addr, fechaISO, simbolo) {
  const a = normalizarDireccion(addr || "");
  if (!a || !TX_APARTAR[tipo]) throw new Error("Sin dirección: no se puede mandar al spam.");
  const base = pdEsObjeto(bloque) ? bloque : {};
  const entrada = { fecha: String(fechaISO || "").slice(0, 10) };
  if (tipo === "tokens" && simbolo) entrada.simbolo = String(simbolo);
  const parte = pdEsObjeto(base[tipo]) ? base[tipo] : {};
  return Object.assign({}, base, { [tipo]: Object.assign({}, parte, { [a]: entrada }) });
}

/* Deshacer: bloque NUEVO sin esa dirección o token, o null si se queda
   vacío (entonces se quita de la cache). Lanza si no estaba. */
function txSpamUsuarioSin(bloque, tipo, addr) {
  const a = normalizarDireccion(addr || "");
  const parte = pdEsObjeto(bloque) && pdEsObjeto(bloque[tipo]) ? bloque[tipo] : null;
  const k = parte ? Object.keys(parte).find(x => normalizarDireccion(x) === a) : undefined;
  if (k === undefined) throw new Error("No está en el spam.");
  const resto = Object.assign({}, parte);
  delete resto[k];
  const nuevo = Object.assign({}, bloque);
  if (Object.keys(resto).length) nuevo[tipo] = resto;
  else delete nuevo[tipo];
  return Object.keys(nuevo).length ? nuevo : null;
}

/* Si un spam lo es por una dirección o un token que mandaste entero (la
   nota del motor y lo apartado del contexto lo dicen): { tipo, valor }; si
   no, null. contexto = construirContexto(cache) de js/14. */
function txReglaSpam(reg, contexto) {
  if (!reg || !contexto || reg.categoria !== "SPAM") return null;
  const tipo = Object.keys(TX_APARTAR).find(t => txNotaDelMotor(reg.nota, TX_APARTAR[t].nota));
  if (!tipo) return null;
  const direcciones = tipo === "direcciones";
  const valor = normalizarDireccion((direcciones ? reg.origen : reg.contrato) || "");
  return (direcciones ? contexto.spamDirecciones : contexto.spamTokens).has(valor) ? { tipo, valor } : null;
}

/* ----------------------------- Notas personales (puro) -----------------------------
   Van en la cache, en un bloque propio, cache.notas_personales = { clave:
   { texto, modificado } }, y NO en ajustes_usuario: así nunca cambian la
   clasificación (el motor no lee el bloque) y viajan con tu cache. Quien
   guarde la cache debe conservar todo lo que hay en ella. Las claves, normalizadas como
   las de los ajustes. */
const TX_NOTA_MAX = 500;

function txTextoNota(notas, clave) {
  if (!pdEsObjeto(notas)) return "";
  const n = notas[ccClaveAjuste(clave)];
  return pdEsObjeto(n) && typeof n.texto === "string" ? n.texto : "";
}

/* Devuelve un bloque de notas NUEVO (no muta el recibido) con la nota de
   esa clave puesta o, si el texto queda vacío, quitada. El texto se
   recorta por los extremos y a TX_NOTA_MAX caracteres. */
function txNotasConTexto(notas, clave, texto, fechaISO) {
  const k = ccClaveAjuste(clave);
  if (!k) throw new Error("Registro sin clave: no se le puede poner nota.");
  const copia = Object.assign({}, pdEsObjeto(notas) ? notas : {});
  const t = String(texto || "").trim().slice(0, TX_NOTA_MAX);
  if (t) copia[k] = { texto: t, modificado: String(fechaISO || "").slice(0, 19) || null };
  else delete copia[k];
  return copia;
}

/* ----------------------------- HTML (puro) ----------------------------- */

/* Resumen de triaje: un botón por grupo con su número (sin el total, que
   ya dice el recuento, ni el spam, que va aparte). Y, algo
   separado, «DeFi»: se suma a los otros (Neutros y DeFi = el gas de DeFi). Sin
   nada DeFi no sale (salvo si está pulsado). */
function txHtmlTriaje(resumen, grupoActivo, defiActivo) {
  if (!resumen || !resumen.total) return "";
  let h = "";
  for (const g of TX_GRUPOS) {
    const activo = grupoActivo === g.id;
    h += '<button type="button" class="tx-kpi tx-g-' + g.id + (activo ? " activo" : "") +
      '" data-grupo="' + g.id + '" aria-pressed="' + (activo ? "true" : "false") +
      '" title="' + ccEsc(g.ayuda) + '"><b>' + ccEsc(String(resumen[g.id] || 0)) + "</b> " + ccEsc(g.etiqueta) + "</button>";
  }
  if (resumen.defi || defiActivo) {
    h += '<span class="tx-triaje-sep" aria-hidden="true">·</span><button type="button" class="tx-kpi tx-g-defi' +
      (defiActivo ? " activo" : "") + '" data-defi aria-pressed="' + (defiActivo ? "true" : "false") +
      '" title="Recompensas, pools y staking, con su gas."><b>' + ccEsc(String(resumen.defi || 0)) + "</b> DeFi</button>";
  }
  return h;
}

/* En el modo spam, bajo el recuento, cuántos hay por cada motivo (como
   Reentax): texto, uno por línea. Va
   dentro de #txMotivosSpam (una lista). Cada
   línea se puede pulsar: la tabla enseña solo ese motivo (`activo`) y otra
   pulsación vuelve a todos. Sigue pareciendo texto, no un botón más. */
function txHtmlResumenSpam(resumen, activo) {
  return (resumen || []).map(m => {
    const on = activo === m.id;
    return '<li class="tx-motivo" data-motivo="' + ccEsc(m.id) + '"><button type="button" class="tx-motivo-btn' + (on ? " activo" : "") +
      '" data-motivo="' + ccEsc(m.id) + '" aria-pressed="' + (on ? "true" : "false") + '">' +
      ccEsc(numEs(m.n, 0)) + " " + ccEsc(m.etiqueta) + "</button></li>";
  }).join("");
}

/* Opción del selector de categoría con su recuento: «COMISIÓN (180)». */
function txEtiquetaCategoriaConteo(categoria, n) {
  return categoriaAMostrar(categoria) + " (" + numEs(Number(n) || 0, 0) + ")";
}

/* Nota del coste por token de las compras externas de inmuebles
   (corta, neutra y sin ⓘ). Solo si hay alguna de un inmueble en el libro
   (las de RNT no tienen coste por defecto; si no, vacío). `precio` es el de la config; si no es un número válido se dice
   100 € (el valor fijo). */
function txHtmlNotaCoste(registros, precio) {
  if (!(registros || []).some(r => txEsCompraBancaria(r) && normalizarDireccion(r.contrato || "") !== RNT)) return "";
  const p = Number(precio);
  const eur = ccCantidad(Number.isFinite(p) && p > 0 ? p : 100) + " €";
  return "💶 Compras externas de inmuebles: " + ccEsc(eur) + " por token por defecto (se edita en 🔍 Revisión).";
}

/* Fila del libro. opts:{ estadoRevisar, pendiente ("salida"|"cobro"|null),
   vinculo ({rol, ventaIds}|null) }. */
/* Botón de solo icono con su burbuja de información (el patrón de la ⓘ,
   no el title nativo). La burbuja se ve al
   pasar el ratón o al llegar con el teclado; el texto completo va también
   en el aria-label. La ayuda es opcional: casi siempre basta el nombre
   (textos concisos). `attrs` = atributos data-…
   ya escapados; `inactivo` lo deja sin acción, pero se puede enfocar
   para leer su burbuja. */
function txBotonIcono(icono, etiqueta, ayuda, attrs, clase, inactivo) {
  const extra = ayuda ? String(ayuda) : "";
  return '<button type="button" class="tx-accion tx-ico' + (clase ? " " + clase : "") + '"' + (attrs || "") +
    (inactivo ? ' aria-disabled="true"' : "") + ' aria-label="' + ccEsc(etiqueta + (extra ? ": " + extra : "")) + '">' +
    '<span aria-hidden="true">' + icono + '</span><span class="tx-burbuja" aria-hidden="true"><b>' +
    ccEsc(etiqueta) + "</b>" + (extra ? " " + ccEsc(extra) : "") + "</span></button>";
}

/* Fila del libro: 9 columnas. Cifras con 2 decimales y
   la exacta en la ayuda; la nota del motor, en la ayuda de la operación; el
   sentido, una flecha delante de la operación; la retención, bajo el
   importe y solo si la hay; las acciones, iconos con su burbuja. La nota
   personal no va aquí: va en su propia fila, debajo (txHtmlFilaNota).
   opts.direcciones = { propias, nombres } para el sentido y la contraparte;
   opts.motivoSpam, el motivo de un spam (va en la ayuda de la operación). */
function txHtmlFila(reg, opts = {}) {
  const claseCat = txClaseCategoria(reg.categoria);
  const clave = ccEsc(reg.clave);
  const celda = (clase, title, texto) =>
    '<td class="' + clase + '" title="' + ccEsc(title) + '">' + ccEsc(texto) + "</td>";
  const dataClave = ' data-clave="' + clave + '"';
  const notaP = String(opts.notaPersonal || "");

  let h = '<tr class="tx-fila ' + claseCat + (reg.revisar ? " tx-revisar" : "") +
    (notaP || opts.editandoNota || opts.apartarAbierto ? " tx-con-notap" : "") + '" data-clave="' + clave + '">';
  h += celda("tx-fecha", reg.fecha ? fechaDosHoras(reg.fecha, reg.instante) : "", txFechaCorta(reg.fecha));
  h += '<td class="tx-celcat"><span class="tx-cat ' + claseCat + '">' + ccEsc(categoriaAMostrar(reg.categoria) || "?") + "</span>";
  /* Lo que sacaste del spam lleva su marca ↩ (con burbuja) en vez de la 🔍,
     y lo que mandaste tú, la marca 🚫, también si
     fue con su dirección o su token entero. */
  const regla = opts.estadoSpam === "regla" ? TX_APARTAR[opts.regla.tipo] : null;
  const marcaSpam = opts.estadoSpam === "quitar" ? "Marcado como spam"
    : regla ? txEtiquetaMotivoSpam(regla.motivo) : "";
  if (marcaSpam) {
    h += ' <span class="tx-ayuda tx-marca-sacado tx-marca-spam" tabindex="0" aria-label="' + ccEsc(marcaSpam) + '">🚫' +
      '<span class="tx-burbuja" aria-hidden="true">' + ccEsc(marcaSpam) + "</span></span>";
  } else if (opts.estadoSpam === "devolver") {
    h += ' <span class="tx-ayuda tx-marca-sacado" tabindex="0" aria-label="Sacado del spam">↩' +
      '<span class="tx-burbuja" aria-hidden="true">Sacado del spam</span></span>';
  } else if (reg.revisar) h += ' <span class="tx-marca-rev" title="Marcado para revisar">🔍</span>';
  h += "</td>";
  /* El token, en una caja de ancho máximo: un nombre largo (o el de un
     spam que es una URL) pasa a otra línea en vez de ensanchar la tabla. */
  const activo = txActivo(reg);
  /* El número final va pegado a su nombre («Oportunidad 1» no se parte). */
  h += '<td class="tx-token" title="' + ccEsc(activo) + '"><span class="tx-token-txt">' +
    ccEsc(activo ? activo.replace(/\s+(\d+)$/, " $1") : "—") + "</span></td>";
  const dirs = opts.direcciones || {};
  const sentido = txSentido(reg, dirs.propias);
  const ayudaOp = txAyudaOperacion(reg, opts.motivoSpam, sentido);
  h += '<td class="tx-op"' + (ayudaOp ? ' title="' + ccEsc(ayudaOp) + '"' : "") + ">" + txHtmlSentido(sentido) +
    '<span class="tx-op-texto">' + ccEsc(txOperacion(reg)) + "</span></td>";
  const conCant = txEsNumero(reg.cantidad);
  h += celda("num tx-cant", conCant ? txCifraExacta(reg.cantidad) : "", conCant ? txCifra(reg.cantidad, true) : "");
  /* Importe: en un rendimiento, el íntegro y debajo «(ret. …)» si la hay,
     con su burbuja (íntegro, retención y neto); en lo demás, la cifra
     exacta en la ayuda del navegador. */
  const ret = txRetencionCorta(reg);
  const imp = ccEsc(txImporteCorto(reg)) + (ret ? '<span class="tx-ret">' + ccEsc(ret) + "</span>" : "");
  if (txEsRendimiento(reg) && txEsNumero(reg.integro_usdt)) {
    h += '<td class="num tx-importe"><span class="tx-ayuda" tabindex="0" aria-label="' + ccEsc(txAyudaImporte(reg)) + '">' + imp +
      '<span class="tx-burbuja" aria-hidden="true">' + txLineasImporte(reg).map(ccEsc).join("<br>") + "</span></span></td>";
  } else {
    h += '<td class="num tx-importe" title="' + ccEsc(txAyudaImporte(reg)) + '">' + imp + "</td>";
  }
  const cp = txContraparte(reg, dirs);
  h += cp
    ? '<td class="tx-contraparte' + (cp.conocida ? "" : " mono") + '" title="' + ccEsc(cp.ayuda) + '">' + ccEsc(cp.texto) + "</td>"
    : '<td class="tx-contraparte" title="Sin dirección">—</td>';
  /* Debajo del hash, el de la otra transacción de su vínculo. */
  const enlace = (hash, clase, texto, title) => '<a class="mono' + clase + '" href="https://polygonscan.com/tx/' +
    encodeURIComponent(hash) + '" target="_blank" rel="noopener" title="' + ccEsc(title) + '">' + ccEsc(texto) + " ↗</a>";
  h += '<td class="tx-hash">' + (reg.hash
    ? enlace(reg.hash, "", txHashCorto(reg.hash), reg.hash + " · ver en Polygonscan")
    : '<span class="help">sin hash</span>');
  for (const o of opts.relacionados || []) {
    if (!o || !o.reg || !o.reg.hash) continue;
    h += enlace(o.reg.hash, " tx-hash-rel", "↳ " + txHashCorto(o.reg.hash),
      (o.rol === "cobro" ? "Transacción del cobro de esta venta: " : "Transacción de la venta que cobra este pago: ") +
      o.reg.hash + " · ver en Polygonscan");
  }
  h += "</td>";

  let acc = "";
  const expandida = ' aria-expanded="' + (opts.editandoNota ? "true" : "false") + '"';
  acc += notaP
    ? txBotonIcono("✏️", "Tu nota", notaP,
        ' data-accion="nota"' + dataClave + expandida, "tx-con-nota")
    : txBotonIcono("✏️", "Añadir una nota", "", ' data-accion="nota"' + dataClave + expandida);
  /* En el spam no hay 🔍: su ↩ ya lo deja a revisar. */
  const est = reg.categoria === "SPAM" ? "" : opts.estadoRevisar || "libre";
  if (est === "libre") {
    acc += txBotonIcono("🔍", "Mandar a revisar", "", ' data-accion="mandar-revisar"' + dataClave);
  } else if (est === "spa") {
    acc += txBotonIcono("↩", "Quitar de revisar", "", ' data-accion="quitar-revisar"' + dataClave);
  } else if (est === "ajeno") {
    acc += txBotonIcono("🔍", "Ya tiene un ajuste: edítalo en 🔍 Revisión", "", "", "", true);
  }
  const sp = opts.estadoSpam || "";
  /* Con más de una opción, 🚫 las abre debajo de la fila. */
  if (sp === "mandar") {
    acc += txBotonIcono("🚫", "Mandar al spam", "", ' data-accion="mandar-spam"' + dataClave +
      (opts.conOpciones ? ' aria-expanded="' + (opts.apartarAbierto ? "true" : "false") + '"' : ""));
  } else if (sp === "devolver") acc += txBotonIcono("🚫", "Devolver al spam", "", ' data-accion="quitar-ajuste-spam"' + dataClave);
  else if (sp === "quitar") acc += txBotonIcono("↩", "Quitar del spam", "", ' data-accion="quitar-ajuste-spam"' + dataClave);
  else if (regla) acc += txBotonIcono("↩", "Quitar del spam", regla.todo + ".", ' data-accion="quitar-regla-spam"' + dataClave);
  else if (sp === "sacar") acc += txBotonIcono("↩", "Quitar del spam", "Queda a revisar.", ' data-accion="sacar-spam"' + dataClave);
  else if (sp === "ajeno") acc += txBotonIcono("↩", "Ya tiene un ajuste: edítalo en 🔍 Revisión", "", "", "", true);
  if (opts.pendiente === "salida") {
    // Escrito entero: tests/test_textos_paso_copy1.js busca este botón en el código.
    acc += txBotonIcono("🔗", "Vincular cobro…", "", ' data-accion="abrir-buscador"' + dataClave);
  }
  if (opts.vinculo) {
    /* Distintivo «Vinculada»: dice si es la venta o uno de sus pagos, con
       su detalle (cuándo se cobró, o qué venta paga), y lleva al vínculo
       en «Resueltos (n)» de 🔍 Revisión. */
    const ids = opts.vinculo.ventaIds || [];
    acc += txBotonIcono("🔗", ccTextoVinculada(opts.vinculo, true).replace(/^🔗\s*/, ""), opts.vinculo.detalle || "",
      ' data-accion="ver-vinculo" data-venta="' + ccEsc(ids[0] || "") + '"', "tx-vinculada");
    if (opts.vinculo.rol === "salida") {
      acc += txBotonIcono("➕", "Otro cobro…", "", ' data-accion="abrir-buscador"' + dataClave);
    }
  }
  h += '<td class="tx-acciones">' + acc + "</td>";
  return h + "</tr>";
}

/* Fila de la nota personal, justo debajo de la suya (como Reentax): la
   nota en cursiva o, si se está escribiendo, el editor (Intro guarda, Esc
   cancela, y botones para guardar, borrar y cancelar). Vacío si no hay
   nota ni se está editando. `borrador` = el texto que se está escribiendo
   (sobrevive a un repintado). */
function txHtmlFilaNota(reg, notaP, editando, borrador) {
  const nota = String(notaP || "");
  if (!nota && !editando) return "";
  const clave = ccEsc(reg.clave);
  const claseCat = txClaseCategoria(reg.categoria);
  /* La caja no cuenta al medir las columnas: una nota larga no ensancha
     la tabla (ocupa el ancho que ya tiene). */
  const inicio = '<tr class="tx-fila-nota ' + claseCat + '" data-clave="' + clave + '"><td colspan="' + TX_N_COLUMNAS +
    '"><div class="tx-nota-caja">';
  if (!editando) {
    return inicio + '<span class="tx-notap" title="' + ccEsc("Tu nota: " + nota) + '"><span aria-hidden="true">📝 </span>' +
      '<span class="tx-notap-texto">' + ccEsc(nota) + "</span></span></div></td></tr>";
  }
  const valor = borrador !== undefined && borrador !== null ? String(borrador) : nota;
  return inicio + '<div class="tx-nota-editor">' +
    '<textarea class="tx-nota-texto" rows="2" maxlength="' + TX_NOTA_MAX + '" data-clave="' + clave +
      '" aria-label="' + ccEsc("Tu nota para " + (txActivo(reg) || categoriaAMostrar(reg.categoria)) + " del " + txFechaCorta(reg.fecha) +
      ". Intro guarda, Escape cancela.") + '" placeholder="p. ej. «Gas pagado desde otra cuenta»">' +
      ccEsc(valor) + "</textarea>" +
    '<div class="tx-nota-pie"><span class="help">Intro guarda · Esc cancela</span>' +
      '<button type="button" class="tx-accion primary" data-accion="nota-guardar"' + ' data-clave="' + clave + '">💾 Guardar</button>' +
      (nota ? '<button type="button" class="tx-accion" data-accion="nota-borrar" data-clave="' + clave + '">✕ Borrar</button>' : "") +
      '<button type="button" class="tx-accion" data-accion="nota-cancelar" data-clave="' + clave + '">Cancelar</button>' +
    "</div></div></div></td></tr>";
}

/* Opciones de 🚫 en una fila justo debajo de la suya (como la
   nota): «Este movimiento», «Toda la dirección …» y «Todo el token …» (las
   que se ofrezcan) y «Cancelar». opciones = txOpcionesApartar. */
function txHtmlFilaApartar(reg, opciones) {
  const o = opciones || {};
  const dataClave = ' data-clave="' + ccEsc(reg.clave) + '"';
  const boton = (accion, texto, title, clase) => '<button type="button" class="tx-accion' + (clase ? " " + clase : "") +
    '" data-accion="' + accion + '"' + dataClave + (title ? ' title="' + ccEsc(title) + '"' : "") + ">" + ccEsc(texto) + "</button>";
  return '<tr class="tx-fila-apartar ' + txClaseCategoria(reg.categoria) + '"' + dataClave + '><td colspan="' + TX_N_COLUMNAS +
    '"><div class="tx-nota-caja tx-apartar"><span class="tx-apartar-titulo">🚫 Mandar al spam:</span>' +
    boton("spam-movimiento", "Este movimiento", "", "primary") +
    (o.direccion ? boton("spam-direccion", TX_APARTAR.direcciones.todo + " " + txDireccionCorta(o.direccion), o.direccion) : "") +
    (o.token ? boton("spam-token", TX_APARTAR.tokens.todo + " " + (String(reg.simbolo || "").trim() || txDireccionCorta(o.token)), o.token) : "") +
    boton("spam-cancelar", "Cancelar") + "</div></td></tr>";
}

/* ----------------------------- Estado de la vista (DOM) ----------------------------- */

const TX_IDS_SELECTS = ["txFiltroCategoria", "txFiltroEjercicio", "txFiltroInmueble", "txFiltroFuente"];
const TX_IDS_FECHAS = ["txFiltroDesde", "txFiltroHasta"];
let txGrupoFiltro = ""; // filtro de triaje (botones del resumen)
let txDefiFiltro = false; // «DeFi» pulsado (botón del resumen)
let txMotivoFiltro = ""; // motivo del spam pulsado (solo en el modo spam)
/* Opciones de 🚫 abiertas debajo de una fila: { clave,
   opciones } (las que de verdad alcanzan a ese movimiento), o null. */
let txApartarAbierto = null;

function txVistaVisible() {
  const v = document.getElementById("view-transacciones");
  return !!(v && v.classList.contains("active"));
}

function txRegistros() {
  return Array.isArray(state.registros) ? state.registros : [];
}

function txHtmlFilaVacia(texto) {
  return '<tr><td colspan="' + TX_N_COLUMNAS + '" class="tx-vacio">' + texto + "</td></tr>";
}

/* Vacía los selectores, Desde / Hasta (con los topes que se ponían uno al
   otro) y la búsqueda. */
function txVaciarFiltros() {
  txGrupoFiltro = txMotivoFiltro = ""; // también el grupo y el motivo del spam pulsados
  txDefiFiltro = false;
  for (const id of TX_IDS_SELECTS.concat(["txBuscar"])) { const el = $(id); if (el) el.value = ""; }
  for (const id of TX_IDS_FECHAS) { const el = $(id); if (el) el.value = el.min = el.max = ""; }
}

function txLeerFiltros() {
  const val = id => { const el = $(id); return el ? el.value : ""; };
  return {
    categoria: val("txFiltroCategoria"),
    ejercicio: val("txFiltroEjercicio"),
    desde: val("txFiltroDesde"),
    hasta: val("txFiltroHasta"),
    inmueble: val("txFiltroInmueble"),
    fuente: val("txFiltroFuente"),
    defi: txDefiFiltro ? txDefiVigente() : null,
    q: val("txBuscar"),
    grupo: txGrupoFiltro,
    motivo: txMotivoFiltro,
    ctxSpam: txContextoSpam(state.cache),
    ocultarSpam: true, // el spam solo sale en su modo
    plegarCobros: true,
    notas: (state.cache && state.cache.notas_personales) || null,
  };
}

function txRellenarSelect(id, valores, actual, etiquetaTodas, etiquetar) {
  const sel = $(id);
  if (!sel) return "";
  const vale = actual && valores.includes(actual) ? actual : "";
  sel.innerHTML = '<option value="">' + ccEsc(etiquetaTodas) + "</option>" +
    valores.map(v => '<option value="' + ccEsc(v) + '"' + (v === vale ? " selected" : "") + ">" +
      ccEsc(etiquetar ? etiquetar(v) : v) + "</option>").join("");
  sel.value = vale;
  return vale;
}

/* Pone el número de cada opción del selector de categoría, sin
   rehacerlo: no se pierde la opción elegida ni el foco. */
function txActualizarConteoCategorias(conteo) {
  const sel = $("txFiltroCategoria");
  if (!sel) return;
  const n = {};
  for (const c of conteo || []) n[c.categoria] = c.n;
  for (const o of sel.options) {
    if (o.value) o.textContent = txEtiquetaCategoriaConteo(o.value, n[o.value] || 0);
  }
}

/* Pinta solo lo que depende de los filtros (tabla, recuento, triaje y
   recuentos del selector): la búsqueda repinta sin rehacer los selects ni
   perder el foco. */
function txPintarCuerpo(registros) {
  const cuerpo = $("txCuerpo");
  if (!cuerpo) return;
  const f = txLeerFiltros();
  const spam = txModoSpam(f);
  if (spam) { f.grupo = txGrupoFiltro = ""; f.defi = null; txDefiFiltro = false; } // en el modo spam no hay grupos ni DeFi
  else f.motivo = txMotivoFiltro = ""; // ni motivos fuera de él
  const rec = $("txRecuento");
  const ventas = ccVentasGuardadas(); // siempre una lista
  const rel = txRelacionesVinculos(registros, ventas);
  const ctxSpam = f.ctxSpam;
  const conteo = txConteoCategorias(registros, f, rel);
  txActualizarConteoCategorias(conteo);
  const notaCoste = $("txNotaCoste");
  if (notaCoste) {
    notaCoste.innerHTML = spam ? "" : txHtmlNotaCoste(registros, state.config && state.config.compra_bancaria_coste_eur_por_token);
    notaCoste.hidden = !notaCoste.innerHTML;
  }

  if (!registros.length) {
    cuerpo.innerHTML = txHtmlCuerpo = txHtmlFilaVacia("Sin movimientos todavía: completa 🚀 Puesta en marcha.");
    if (rec) rec.textContent = "";
    for (const id of ["txTriaje", "txMotivosSpam"]) { const el = $(id); if (el) el.innerHTML = ""; }
    const motivos = $("txMotivosSpam");
    if (motivos) motivos.hidden = true;
    return;
  }
  const visibles = txFiltrar(registros, f, rel);
  /* Arriba, el triaje (no en el modo spam); bajo el recuento, en el modo
     spam, el spam que se ve por motivo. */
  const triaje = $("txTriaje");
  if (triaje) triaje.innerHTML = spam ? "" : txHtmlTriaje(txResumenTriaje(registros, rel, txDefiVigente()), txGrupoFiltro, txDefiFiltro);
  const motivos = $("txMotivosSpam");
  if (motivos) {
    /* Los recuentos, sin el motivo pulsado: siempre se ven todos. */
    const sinMotivo = spam ? registros.filter(r => r && txPasaFiltros(r, f, "motivo", rel)) : [];
    motivos.innerHTML = spam ? txHtmlResumenSpam(txResumenSpam(sinMotivo, ctxSpam), txMotivoFiltro) : "";
    motivos.hidden = !motivos.innerHTML;
  }
  const ajustes = (state.cache && state.cache.ajustes_usuario) || {};
  const ctx = ccContextoCandidatos(state.cache || null, state.config || {}, registros);
  const direcciones = {
    propias: { wallet: (state.config || {}).wallet, vault: (state.config || {}).vault },
    nombres: txNombresContratos(state.cache),
  };
  const cursor = txNota.cursor(); // si se estaba escribiendo la nota, vuelve a ella
  const ed = txNota.actual();
  /* El contexto del motor (con lo apartado entero) para saber
     qué opciones tiene cada 🚫 y qué spam se quita con su ↩. */
  const ctxMotor = state.cache ? construirContexto(state.cache) : null;
  let abiertoPintado = false;
  const html = visibles.length
    ? visibles.map(r => {
        const vinculo = ccVinculoDeRegistro(r, ctx);
        if (vinculo) vinculo.detalle = ccDetalleVinculo(vinculo, ventas, registros);
        const pendiente = ccPendienteDeVincular(r, ctx, false);
        const notaP = txTextoNota(f.notas, r.clave);
        const editando = !!(ed && ed.clave === r.clave);
        const regla = txReglaSpam(r, ctxMotor);
        const estadoSpam = state.cache ? txEstadoSpam(r, ajustes, { pendiente, vinculo, regla }) : "";
        const opciones = estadoSpam === "mandar" ? txOpcionesApartar(r, ctxMotor) : null;
        const conOpciones = !!(opciones && (opciones.direccion || opciones.token));
        const apartarAbierto = conOpciones && !!txApartarAbierto && txApartarAbierto.clave === r.clave;
        if (apartarAbierto) abiertoPintado = true;
        return txHtmlFila(r, {
          estadoRevisar: state.cache ? txEstadoRevisar(r, ajustes) : "sin-cache",
          estadoSpam,
          regla,
          conOpciones,
          apartarAbierto,
          pendiente,
          vinculo,
          relacionados: rel.has(r.clave) ? rel.get(r.clave).otros : [],
          notaPersonal: notaP,
          editandoNota: editando,
          direcciones,
          motivoSpam: r.categoria === "SPAM" ? txEtiquetaMotivoSpam(txMotivoSpam(r, ctxSpam)) : "",
        }) + (apartarAbierto ? txHtmlFilaApartar(r, txApartarAbierto.opciones) : "") +
          txHtmlFilaNota(r, notaP, editando, editando ? ed.borrador : null);
      }).join("")
    : txHtmlFilaVacia("Ningún movimiento con estos filtros.");
  /* Lo mismo que ya está no se vuelve a poner (con cientos de filas, el
     navegador tarda en rehacer la tabla y hay que volver a medirla): al
     entrar en 📒 sin cambios, la tabla de antes se queda. */
  if (html !== txHtmlCuerpo) {
    cuerpo.innerHTML = txHtmlCuerpo = html;
    txRepartoHecho = ""; // filas nuevas: hay que volver a medir
  }
  /* Si su fila ya no se ve (un filtro, el modo spam…), las opciones se
     cierran: no vuelven a salir solas al enseñarla otra vez. */
  if (!abiertoPintado) txApartarAbierto = null;
  txNota.restaurar(cursor);
  if (rec) {
    /* El número y, al lado, «Ver spam» (o «Salir del spam»); el total,
       en txTotalRecuento. */
    const buscando = txHayBusqueda(f.q);
    const total = txTotalRecuento(registros, f, rel, spam);
    const filtrado = !!(f.ejercicio || f.desde || f.hasta || f.inmueble || f.fuente || f.defi || buscando || f.grupo || f.motivo || (f.categoria && !spam));
    const nSpam = (conteo.find(c => c.categoria === "SPAM") || {}).n || 0;
    const haySpam = registros.some(r => r.categoria === "SPAM");
    const texto = ccEsc(txTextoRecuento(visibles.length, total, filtrado, spam));
    rec.innerHTML = (spam ? "<b>" + texto + "</b>" : texto) + (spam
      ? ' <button type="button" class="tx-accion tx-ver-spam" data-salir-spam>✖ Salir del spam</button>'
      : haySpam ? ' <button type="button" class="tx-accion tx-ver-spam" data-ver-spam>👁 Ver spam (' + ccEsc(numEs(nSpam, 0)) + ")</button>" : "");
  }
  txPedirReparto();
}

/* El sitio que sobra en una pantalla ancha, a partes iguales entre las
   columnas (si no, se lo llevan Token, Operación y Contraparte y quedan
   huecos grandes). Mide lo que ocupa la tabla sin
   estirarse y suma la diferencia, repartida, al margen izquierdo de cada
   columna (--tx-aire). Sin sitio libre, 0. */
const TX_SEL_CAJA_TABLA = "#view-transacciones .tx-tablawrap";
/* Medir la tabla entera cuesta (con cientos de filas, ~100 ms): solo con
   📒 a la vista, y si cambió el ancho o se pintó otra vez desde la última
   medida (al entrar en 📒 lo pedían el pintado y el cambio de ancho, cada
   uno por su lado). Oculta (content-visibility) también se podría medir,
   pero obligaría al navegador a maquetarla. */
let txRepartoHecho = "", txHtmlCuerpo = "";
function txRepartirAire() {
  const caja = document.querySelector(TX_SEL_CAJA_TABLA), tabla = $("txTabla");
  if (!caja || !tabla || !txVistaVisible() || !caja.clientWidth) return;
  const huella = String(caja.clientWidth);
  if (huella === txRepartoHecho) return;
  txRepartoHecho = huella;
  tabla.classList.add("tx-midiendo"); // sin aire, sin estirarse ni anchos en % (estos también la estiran)
  const natural = tabla.offsetWidth;
  tabla.classList.remove("tx-midiendo");
  const aire = Math.max(0, Math.floor((caja.clientWidth - natural) / (TX_N_COLUMNAS - 1)) - 1) + "px"; // 1 px de margen por columna
  if (tabla.style.getPropertyValue("--tx-aire") !== aire) tabla.style.setProperty("--tx-aire", aire);
}
/* Tras pintar, una sola medida por fotograma (hay acciones que pintan dos
   veces seguidas). */
let txRepartoPedido = false;
function txPedirReparto() {
  if (txRepartoPedido || typeof requestAnimationFrame !== "function") return;
  txRepartoPedido = true;
  requestAnimationFrame(() => { txRepartoPedido = false; txRepartirAire(); });
}

function renderTransacciones() {
  if (typeof document === "undefined" || !$("txCuerpo")) return;
  ccInyectarEstilos(); // burbujas ⓘ de js/15
  txInyectarEstilos();
  const registros = txRegistros();
  const f = txLeerFiltros();
  const op = txOpciones(registros);
  txRellenarSelect("txFiltroCategoria", op.categorias, f.categoria, "Todas", categoriaAMostrar);
  txRellenarSelect("txFiltroEjercicio", op.ejercicios, f.ejercicio, "Todos");
  txRellenarSelect("txFiltroInmueble", op.inmuebles, f.inmueble, "Todos");
  txRellenarSelect("txFiltroFuente", op.fuentes, f.fuente, "Todas", txEtiquetaFuente);
  txPintarCuerpo(registros);
}

/* Solo se pinta si la vista está visible; `forzar` pinta aunque no lo
   esté. Hace falta al entrar en #transacciones: este aviso de hashchange
   llega antes que el de js/13, que es quien marca la vista como activa. */
function txRenderSeguro(forzar) {
  try {
    if (forzar || txVistaVisible()) renderTransacciones();
  } catch (e) { console.error("Transacciones (js/18-transacciones.js):", e); }
}
function txPintarCuerpoSeguro() {
  try { txPintarCuerpo(txRegistros()); }
  catch (e) { console.error("Transacciones (js/18-transacciones.js):", e); }
}

/* Enseña un registro en el libro (la usa js/15 desde «Resueltos (n)»):
   quita los filtros, busca por su hash —salen todos los movimientos de esa
   transacción— y resalta un momento su fila. false si el registro no está. */
function txMostrarMovimiento(clave) {
  const reg = txRegistros().find(r => r.clave === clave);
  if (!reg) return false;
  txVaciarFiltros();
  /* Un spam solo se ve en su modo. */
  const cat = $("txFiltroCategoria");
  if (cat && reg.categoria === "SPAM") cat.value = "SPAM";
  const buscar = $("txBuscar");
  if (buscar) buscar.value = reg.hash || "";
  if (location.hash !== "#transacciones") location.hash = "#transacciones";
  txRenderSeguro(true);
  /* El cambio de pestaña repinta la tabla: se resalta después. */
  setTimeout(() => {
    const filas = document.querySelectorAll("#txCuerpo tr.tx-fila");
    const fila = [...filas].find(f => f.getAttribute("data-clave") === clave);
    if (!fila) return;
    fila.scrollIntoView({ block: "center" });
    fila.classList.add("tx-destacada");
    setTimeout(() => fila.classList.remove("tx-destacada"), 2500);
  }, 80);
  return true;
}

/* ----------------------------- Acciones que guardan ----------------------------- */

/* Guarda, reclasifica y repinta (Revisión, dashboard y este libro) con el
   mismo guardado que 🔍 Revisión (js/15). */
function txGuardarAjustes(nuevos, mensajeOk, irARevision) {
  return ccGuardarAjustesDecision(nuevos, mensajeOk,
    irARevision ? { texto: "Ir a Revisión", fn: () => { location.hash = "#revision"; } } : undefined);
}

/* ¿Se puede clasificar ahora? (cache, archivo de Reental y wallet). */
function txPuedeClasificar() {
  const req = requisitosClasificacionOk();
  return req.cacheOk && req.csvOk && req.configOk;
}

/* Cómo quedaría un movimiento con esos cambios en la cache, sin tocarla: se
   clasifica aparte (unos 20 ms con ~500 registros). null si ahora no se
   puede clasificar. */
function txSimularRegistro(clave, cambios) {
  const regs = txSimular(cambios);
  return (regs && regs.find(r => r.clave === clave)) || null;
}
/* Todos los registros con esos cambios (también lo usa «Descartar» del catálogo, js/11). */
function txSimular(cambios) {
  if (!txPuedeClasificar()) return null;
  return clasificarTransacciones(Object.assign({}, state.cache, cambios), state.filasCsv,
    state.indicePorHash || {}, state.config, {});
}

/* 🚫 y ↩ del spam: sin diálogo, porque se deshace con un clic. */
async function txCambiarSpam(clave, accion) {
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  const reg = txRegistros().find(r => r.clave === clave);
  let nuevos, mensaje;
  try {
    if (accion === "quitar-ajuste-spam") {
      nuevos = txAjustesSinSpam(state.cache.ajustes_usuario, clave, ahoraLocalISO());
      mensaje = "Devuelto al spam.";
      if (reg && reg.categoria === "SPAM") {
        /* Si su dirección o su token están apartados enteros,
           sin tu ajuste sigue en el spam: el aviso lo dice. */
        const despues = txSimularRegistro(clave, { ajustes_usuario: nuevos });
        const regla = txReglaSpam(despues, construirContexto(state.cache));
        mensaje = !despues || despues.categoria !== "SPAM" ? "Quitado del spam."
          : "Quitado tu ajuste: sigue en el spam" + (regla ? " por su " + (regla.tipo === "tokens" ? "token" : "dirección") : "") + ".";
      }
    } else {
      const sacar = accion === "sacar-spam";
      nuevos = txAjustesConSpam(state.cache.ajustes_usuario, clave, sacar ? "sacar" : "spam", ahoraLocalISO());
      mensaje = sacar ? "Sacado del spam. Está en Revisar." : "Mandado al spam.";
    }
  } catch (e) { return toast(e.message, "error"); }
  await txGuardarAjustes(nuevos, mensaje);
}

/* Quita las opciones que no alcanzarían a este movimiento: la regla del
   motor solo actúa en lo que no casan antes las reglas por hash (compras,
   permutas, DeFi). Se comprueba clasificando con la regla puesta; si ahora
   no se puede clasificar, se dejan como están. */
function txOpcionesQueAlcanzan(reg, opciones) {
  const o = Object.assign({}, opciones);
  for (const [campo, tipo] of [["direccion", "direcciones"], ["token", "tokens"]]) {
    if (!o[campo]) continue;
    const despues = txSimularRegistro(reg.clave, { spam_usuario: txSpamUsuarioCon(state.cache.spam_usuario, tipo, o[campo], "") });
    if (despues && despues.categoria !== "SPAM") o[campo] = "";
  }
  return o;
}

/* 🚫: con una sola opción manda el movimiento al spam
   directamente; con más, abre o cierra las opciones debajo de la fila, y el foco
   va a «Este movimiento». */
function txPulsarMandarSpam(clave) {
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  if (txApartarAbierto && txApartarAbierto.clave === clave) return txCerrarApartar();
  const reg = txRegistros().find(r => r.clave === clave);
  if (!reg) return;
  const o = txOpcionesQueAlcanzan(reg, txOpcionesApartar(reg, construirContexto(state.cache)));
  if (!o.direccion && !o.token) return txCambiarSpam(clave, "mandar-spam");
  txApartarAbierto = { clave, opciones: o };
  txPintarCuerpoSeguro();
  const primero = document.querySelector('#txCuerpo tr.tx-fila-apartar button[data-accion="spam-movimiento"]');
  if (primero) primero.focus();
}

/* Cierra las opciones y devuelve el foco al 🚫 de su fila. */
function txCerrarApartar() {
  const clave = txApartarAbierto && txApartarAbierto.clave;
  txApartarAbierto = null;
  txPintarCuerpoSeguro();
  const btn = clave ? document.querySelector(txSelectorBoton("mandar-spam", clave)) : null;
  if (btn) btn.focus();
}

/* «Toda la dirección» o «Todo el token» (tipo = "direcciones" | "tokens")
   de la fila, con las opciones que se le enseñaron. */
async function txApartar(clave, tipo, opciones) {
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  const reg = txRegistros().find(r => r.clave === clave);
  if (!reg || !opciones) return;
  let nuevo;
  try {
    nuevo = txSpamUsuarioCon(state.cache.spam_usuario, tipo, tipo === "tokens" ? opciones.token : opciones.direccion,
      ahoraLocalISO(), reg.simbolo);
  } catch (e) { return toast(e.message, "error"); }
  await txGuardarSpamUsuario(nuevo, tipo, true);
}

/* ↩ en lo apartado entero: quita su dirección o su token del bloque. */
async function txQuitarRegla(clave) {
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  const regla = txReglaSpam(txRegistros().find(r => r.clave === clave), construirContexto(state.cache));
  if (!regla) return;
  let nuevo;
  try { nuevo = txSpamUsuarioSin(state.cache.spam_usuario, regla.tipo, regla.valor); }
  catch (e) { return toast(e.message, "error"); }
  /* Un inmueble confirmado que se descartó en el catálogo vuelve confirmado (js/11). */
  const entrada = regla.tipo === "tokens" &&
    Object.entries(state.cache.spam_usuario.tokens).find(([k]) => normalizarDireccion(k) === regla.valor);
  const enCatalogo = Object.entries(state.cache.catalogo_propiedades || {}).find(([k]) => normalizarDireccion(k) === regla.valor);
  if (entrada && pdEsObjeto(entrada[1]) && entrada[1].estado_antes === "CONFIRMADA" && enCatalogo && pdEsObjeto(enCatalogo[1]) && txPuedeClasificar()) {
    enCatalogo[1].estado = "CONFIRMADA";
  }
  await txGuardarSpamUsuario(nuevo, regla.tipo, false);
}

/* Guarda el bloque (o lo quita si queda vacío), reclasifica y avisa con
   cuántos movimientos han entrado o salido del spam. Si ahora no se puede
   clasificar (p. ej. falta el archivo de Reental), no guarda nada: el aviso
   de ejecutarClasificacion dice qué falta. */
async function txGuardarSpamUsuario(bloque, tipo, mandar) {
  if (!txPuedeClasificar()) return ejecutarClasificacion();
  const spam = () => new Set(txRegistros().filter(r => r.categoria === "SPAM").map(r => r.clave));
  const antes = spam();
  if (bloque) state.cache.spam_usuario = bloque;
  else delete state.cache.spam_usuario;
  marcarCacheDirty();
  await autoGuardarCache();
  const enDisco = !state.cacheDirty;
  // Sin los avisos de la clasificación (ya sale el de la acción).
  const clasificado = ejecutarClasificacion({ avisos: false, detalle: false }); // reclasifica y repinta
  const textos = TX_APARTAR[tipo];
  let mensaje = (mandar ? textos.mandado : textos.quitado) + ".";
  if (clasificado) {
    const despues = spam();
    const [de, en] = mandar ? [despues, antes] : [antes, despues];
    const n = [...de].filter(c => !en.has(c)).length;
    mensaje = mensaje.slice(0, -1) + ": " + numEs(n, 0) + (n === 1 ? " movimiento." : " movimientos.");
  }
  toast(mensaje + (enDisco ? "" : " " + TX_SIN_DISCO), enDisco ? "ok" : "warn");
}

async function txQuitarRevisar(clave) {
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  let nuevos;
  try { nuevos = txAjustesSinRevisar(state.cache.ajustes_usuario, clave, ahoraLocalISO()); }
  catch (e) { return toast(e.message, "error"); }
  await txGuardarAjustes(nuevos, "Quitado de revisar.");
}

/* Diálogo corto (construido en runtime, sin ids globales) para el motivo. */
let txDlg = null;
function txCerrarDialogo() {
  if (!txDlg) return;
  document.removeEventListener("keydown", txDlg.onKey, true);
  txDlg.overlay.remove();
  const t = txDlg.trigger;
  txDlg = null;
  if (t && document.contains(t)) t.focus();
}

function txAbrirMandarRevisar(clave, trigger) {
  txCerrarDialogo();
  if (!state.cache) return toast(TX_SIN_CACHE, "warn");
  const reg = txRegistros().find(r => r.clave === clave);
  if (!reg) return;
  const overlay = document.createElement("div");
  overlay.className = "tx-dlg-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Mandar a revisar");
  overlay.innerHTML =
    '<div class="tx-dlg">' +
      "<h3>🔍 Mandar a revisar</h3>" +
      '<p class="tx-dlg-reg"><b>' + ccEsc(txActivo(reg) || categoriaAMostrar(reg.categoria)) + "</b> · " +
        ccEsc(ccCantidad(reg.cantidad)) + " · " + ccEsc(txFechaCorta(reg.fecha)) +
        " · " + ccEsc(categoriaAMostrar(reg.categoria)) +
      "</p>" +
      '<label for="txDlgMotivo">¿Qué quieres revisar? (opcional)</label>' +
      '<textarea id="txDlgMotivo" rows="3" maxlength="300" placeholder="p. ej. «Comprobar si esto es el pago de una venta»"></textarea>' +
      '<div class="tx-dlg-pie"><button type="button" data-accion="cancelar">Cancelar</button>' +
      '<button type="button" class="primary" data-accion="confirmar">🔍 Mandar a revisar</button></div>' +
    "</div>";
  document.body.appendChild(overlay);
  const motivo = overlay.querySelector("textarea");
  const onKey = e => { if (e.key === "Escape") { e.preventDefault(); txCerrarDialogo(); } };
  txDlg = { overlay, trigger, onKey };
  document.addEventListener("keydown", onKey, true);
  overlay.addEventListener("click", async e => {
    if (e.target === overlay) return txCerrarDialogo();
    const btn = txBotonDe(e, "[data-accion]");
    if (!btn) return;
    const accion = btn.getAttribute("data-accion");
    if (accion === "cancelar") return txCerrarDialogo();
    if (accion === "confirmar") {
      let nuevos;
      try {
        nuevos = txAjustesConRevisar(state.cache.ajustes_usuario, clave, motivo.value,
          ahoraLocalISO());
      } catch (err) { return toast(err.message, "error"); }
      txCerrarDialogo();
      await txGuardarAjustes(nuevos, "Mandado a revisar.", true);
    }
  });
  motivo.focus();
}

/* Nota personal (como Reentax): el ✏️ abre el editor en una fila justo
   debajo de la suya; otra pulsación lo cierra sin guardar. Solo hay un
   editor abierto en cada pestaña: abrir otro descarta lo que se estaba
   escribiendo. Se guarda en la cache (bloque notas_personales) sin
   reclasificar: la nota no cambia nada de la clasificación.
   El mismo editor en 📒 Transacciones y en 💰 Rendimientos (js/17):
   lo escrito se recuerda aunque la tabla se repinte o la fila deje de
   verse un rato; si la nota se guardó en la otra pestaña mientras
   escribías, no se pisa: el editor se cierra y se ve la de ahora, con
   aviso; con otra cache abierta, el editor de la anterior se cierra; y
   se repinta y se enfoca antes de esperar al guardado, para no quitarle
   el foco a la nota que abras mientras tanto.
   Mientras no escribes, el editor enseña la nota de ahora y es con ella
   con la que se compara al guardar; abrir otra nota con lo escrito
   escondido por un filtro lo dice; si la fila deja de verse al guardar,
   el foco va a la búsqueda.
   cfg = { cuerpo: id del <tbody>, clase: la del <textarea>, buscar: id de
   la búsqueda, repintar(), existe(clave): si la fila se puede abrir, otra:
   la otra pestaña }. */
function txSelectorBoton(accion, clave, cuerpo = "txCuerpo") {
  return "#" + cuerpo + ' button[data-accion="' + accion + '"][data-clave="' +
    (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(clave) : clave) + '"]';
}

function txEditorNota(cfg) {
  let ed = null; // { clave, borrador, base (la nota al abrir), cache }
  const textarea = () => document.querySelector("#" + cfg.cuerpo + " textarea." + cfg.clase);
  const esEditor = el => !!(el && el.classList && el.classList.contains(cfg.clase));
  /* Repinta y devuelve el foco al ✏️ de esa fila. */
  function repintarYEnfocar(clave) {
    cfg.repintar();
    const btn = clave ? document.querySelector(txSelectorBoton("nota", clave, cfg.cuerpo)) : null;
    const destino = btn || (clave ? document.getElementById(cfg.buscar) : null); // la fila ya no se ve
    if (destino) destino.focus();
  }
  const editor = {
    /* La nota que se está escribiendo ({ clave, borrador }) o null. */
    actual() {
      if (ed && ed.cache !== state.cache) ed = null; // otra cache abierta
      // Sin escribir aún, lo que se ve (y se compara) es la nota de ahora.
      if (ed && ed.borrador === null) ed.base = txTextoNota(state.cache.notas_personales, ed.clave);
      return ed;
    },
    abrir(clave) {
      if (!state.cache) return toast(TX_SIN_CACHE, "warn");
      if (!cfg.existe(clave)) return;
      if (ed && ed.clave === clave) return editor.cerrar();
      // Lo escrito en una nota que un filtro esconde no se pierde en silencio.
      if (ed && ed.borrador !== null && ed.borrador !== ed.base && !textarea()) toast("Se ha descartado la nota que escribías.", "warn");
      ed = { clave, borrador: null, base: txTextoNota(state.cache.notas_personales, clave), cache: state.cache };
      cfg.repintar();
      const t = textarea();
      if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
    },
    /* Cierra sin guardar. */
    cerrar() {
      const e = ed;
      ed = null;
      repintarYEnfocar(e && e.clave);
    },
    async guardar(borrar) {
      const e = editor.actual();
      if (!e) return; // sin cache abierta, actual() ya es null
      if (txTextoNota(state.cache.notas_personales, e.clave) !== e.base) { // cambió en la otra pestaña
        editor.cerrar();
        return toast("Esta nota cambió en " + cfg.otra + " mientras escribías: no se ha guardado.", "warn");
      }
      const t = textarea();
      const nuevo = borrar ? "" : (t ? t.value : e.borrador || "");
      let notas;
      try { notas = txNotasConTexto(state.cache.notas_personales, e.clave, nuevo, ahoraLocalISO()); }
      catch (err) { return toast(err.message, "error"); }
      const habia = !!txTextoNota(state.cache.notas_personales, e.clave);
      ed = null;
      /* Guardar una nota vacía donde no la había no escribe nada. */
      if (!String(nuevo).trim() && !habia) return repintarYEnfocar(e.clave);
      state.cache.notas_personales = notas;
      marcarCacheDirty();
      repintarYEnfocar(e.clave); // antes de esperar al guardado
      await autoGuardarCache();
      const enDisco = !state.cacheDirty;
      toast((String(nuevo).trim() ? "Nota guardada." : "Nota borrada.") + (enDisco ? "" : " " + TX_SIN_DISCO), enDisco ? "ok" : "warn");
    },
    /* Los botones de la nota (data-accion «nota», «nota-guardar»…); false
       si la acción no es de la nota. */
    accion(nombre, clave) {
      if (nombre === "nota") editor.abrir(clave);
      else if (nombre === "nota-guardar") editor.guardar(false);
      else if (nombre === "nota-borrar") editor.guardar(true);
      else if (nombre === "nota-cancelar") editor.cerrar();
      else return false;
      return true;
    },
    /* Antes de repintar: dónde estaba el cursor si se escribía la nota. */
    cursor() {
      const a = document.activeElement;
      return esEditor(a) ? [a.selectionStart, a.selectionEnd] : null;
    },
    /* Después de repintar: el foco y el cursor vuelven a la nota. */
    restaurar(cursor) {
      const t = cursor ? textarea() : null;
      if (t) { t.focus(); t.setSelectionRange(cursor[0], cursor[1]); }
    },
    /* Intro guarda (Mayús+Intro, salto de línea), Esc cancela. */
    teclas(ev) {
      if (!esEditor(ev.target)) return;
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); editor.guardar(false); }
      else if (ev.key === "Escape") { ev.preventDefault(); editor.cerrar(); }
    },
    /* Lo escrito se recuerda, por si la tabla se repinta. */
    apuntar(ev) {
      if (ed && esEditor(ev.target)) ed.borrador = ev.target.value;
    },
  };
  return editor;
}

const txNota = txEditorNota({
  cuerpo: "txCuerpo", clase: "tx-nota-texto", buscar: "txBuscar", otra: "💰 Rendimientos",
  repintar: () => txPintarCuerpoSeguro(),
  existe: clave => txRegistros().some(r => r.clave === clave),
});

/* ----------------------------- Estilos (inyectados una vez) ----------------------------- */
function txInyectarEstilos() {
  if (typeof document === "undefined" || $("estiloTransacciones18")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloTransacciones18";
  estilo.textContent = [
    ".tx-triaje{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 4px}",
    ".tx-kpi{min-height:0;border-radius:999px;font-size:12.5px;font-weight:600;padding:5px 12px;background:var(--chip);color:var(--muted);border:1px solid var(--border)}",
    ".tx-kpi b{color:var(--text)}",
    ".tx-kpi.activo{outline:2px solid var(--accent);outline-offset:1px;color:var(--text)}",
    /* Motivos del spam: texto, uno por línea, bajo el recuento. */
    ".tx-motivos{list-style:none;margin:-2px 0 8px;padding:0}",
    ".tx-motivos li{margin:1px 0}",
    /* Cada motivo se pulsa para ver solo ese spam: parece texto. */
    ".tx-motivo-btn{min-height:0;padding:0;box-shadow:none;border:0;background:none;color:inherit;font:inherit;cursor:pointer;text-align:left}",
    ".tx-motivo-btn:hover{text-decoration:underline}",
    ".tx-motivo-btn.activo{color:var(--text);font-weight:700;text-decoration:underline}",
    "#txRecuento b{color:var(--text)}",
    ".tx-kpi.tx-g-revisar{background:var(--err-bg);border-color:var(--err-bd);color:var(--err)}",
    ".tx-kpi.tx-g-fiscal{background:var(--ok-bg);border-color:var(--ok-bd);color:var(--ok)}",
    ".tx-triaje-sep{color:var(--faint);font-weight:700;margin:0 2px}",
    ".tx-buscar{flex:1 1 220px}",
    /* Desde / Hasta en su propia línea, bajo los demás filtros. */
    ".tx-fechas{flex:1 1 100%;min-width:0;align-items:flex-end}",
    ".tx-fechas>div{min-width:132px}",
    /* En oscuro, el calendario con sus colores (si no, el icono no se ve). */
    "body.dark .tx-fechas input[type=date]{color-scheme:dark}",
    /* Cada columna mide lo que su contenido, con margen, y
       el sobrante se reparte; solo el token y la operación pasan a dos
       líneas si no cabe (antes que recortar). Cabe sin scroll en un
       portátil y, por debajo de ~900 px de ventana, scrollea dentro de su
       caja, nunca la página. Sin líneas verticales; las horizontales, más
       claras; todo centrado en vertical. */
    ".tx-tablawrap{overflow-x:auto;border-radius:10px}",
    /* Lo común con 💰 Rendimientos, en la clase tabla-libro de index.html. */
    /* El sitio libre, repartido entre las columnas (txRepartirAire): se
       suma al margen izquierdo de cada una y a su mínimo, para que vaya
       aparte. Cada columna dice solo su margen (--tx-pl) y su mínimo
       (--tx-min); esta regla les suma el aire. */
    "#txTabla tr>*+*{padding-left:calc(var(--tx-pl,6px) + var(--tx-aire,0px));min-width:calc(var(--tx-min,0px) + var(--tx-aire,0px))}",
    "@media print{#txTabla{--tx-aire:0px !important}}", // en papel, sin el aire de la pantalla
    "#txTabla.tx-midiendo{--tx-aire:0px !important;width:auto}#txTabla.tx-midiendo thead th{width:auto}",
    "#txTabla th.tx-th-partida{line-height:1.2}",
    "#txTabla th.tx-th-op{--tx-pl:30px}",
    /* Más aire para las cifras: un ancho
       mínimo y más margen a la izquierda de Cantidad e Importe, y entre el
       importe y la contraparte. */
    /* Ajuste flexible con mínimos: cada columna mide
       lo que su contenido (width:1%). Lo que sobra lo reparte
       txRepartirAire entre todas; estas pistas solo deciden adónde van los
       pocos px del redondeo (y al imprimir, sin aire): a las de texto. */
    "#txTabla thead th{width:1%}",
    "#txTabla thead th.tx-th-tok,#txTabla thead th.tx-th-op,#txTabla thead th.tx-th-cp{width:auto}",
    "#txTabla th.tx-th-cant,#txTabla td.tx-cant{--tx-min:96px}",
    "#txTabla th.tx-th-imp,#txTabla td.tx-importe{--tx-min:108px}",
    "#txTabla th.tx-th-cant,#txTabla th.tx-th-imp,#txTabla td.tx-cant,#txTabla td.tx-importe{--tx-pl:16px}",
    "#txTabla th.tx-th-cp,#txTabla td.tx-contraparte{--tx-pl:30px}",
    /* Menos margen a los lados en esta pestaña, para dar el sitio a la tabla. */
    "@media screen{body:has(#view-transacciones.active) .content{padding-left:14px;padding-right:14px}}",
    "#view-transacciones .card{padding-left:14px;padding-right:14px}",
    "#txTabla .tx-centro{text-align:center}",
    /* La fila con nota no lleva línea: la nota va pegada debajo. */
    "#txTabla tr.tx-con-notap>td{border-bottom:0}",
    /* La columna del importe no recorta: con 2 decimales siempre cabe, y
       así su burbuja no se corta. */
    "#txTabla td.tx-importe{overflow:visible}",
    "#txTabla tbody tr:hover,#txTabla tbody tr.tx-fila:hover+tr.tx-fila-nota{background:var(--panel2)}",
    "#txTabla tr.tx-revisar{background:var(--warn-bg)}",
    ".tx-fecha{text-align:center;font-variant-numeric:tabular-nums}",
    ".tx-celcat{text-align:center}",
    /* Más aire entre fecha, categoría y token: margen igual a los dos lados, para que siga centrada. */
    "#txTabla th.tx-th-cat,#txTabla td.tx-celcat{--tx-pl:14px;padding-right:14px}",
    /* Y algo más entre categoría y token, sin
       pasarse, que a 1366 px con el menú abierto no hay sitio. */
    "#txTabla th.tx-th-tok,#txTabla td.tx-token{--tx-pl:8px}",
    ".tx-cat{display:inline-block;vertical-align:middle;padding:1px 7px;border-radius:999px;font-size:11.5px;font-weight:700;background:var(--chip);color:var(--muted);border:1px solid var(--border);white-space:nowrap}",
    "#txTabla td.tx-token{white-space:normal;font-weight:600}",
    ".tx-token-txt{display:inline-block;max-width:9em;overflow-wrap:break-word}",
    /* El nombre de un spam puede ser una URL sin espacios: ese sí se parte por cualquier sitio. */
    "#txTabla tr.tx-c-SPAM .tx-token-txt{overflow-wrap:anywhere}",
    "#txTabla td.tx-op{white-space:normal;--tx-min:150px;position:relative;--tx-pl:30px}",
    /* En pantallas más estrechas (p. ej. 1280 px), mínimos algo menores para
       que la tabla siga cabiendo. */
    "@media (max-width:1340px){#txTabla td.tx-op{--tx-min:112px}#txTabla th.tx-th-cp,#txTabla td.tx-contraparte{--tx-pl:16px}}",

    ".tx-contraparte{font-size:12.5px}",
    ".tx-contraparte.mono{font-size:12px}",
    /* Acciones: sitio para 3 iconos (✏️ 🔍 🚫); las pocas filas
       con 4 (ventas vinculadas) los ponen en dos líneas. */
    ".tx-acciones{text-align:center}",
    "#txTabla td.tx-acciones{white-space:normal;--tx-min:90px}",
    /* Marca ↩ de lo sacado del spam, con su burbuja hacia arriba (hacia
       abajo, en la última fila, la cortaría la caja de la tabla). */
    ".tx-marca-sacado{font-weight:700;color:var(--warn)}",
    ".tx-marca-spam{color:var(--err);font-size:12px}",
    "#txTabla .tx-marca-sacado .tx-burbuja{right:auto;left:50%;top:auto;bottom:calc(100% + 6px);transform:translateX(-50%)}",
    /* Sentido: flecha de color y forma delante de la operación, con
       su burbuja; la ponen ::before y ::after, fuera del texto de la celda. */
    ".tx-sentido{position:absolute;left:calc(9px + var(--tx-aire,0px));top:50%;transform:translateY(-50%);width:16px;text-align:center;font-weight:900;font-size:16px;line-height:1.1;cursor:help;outline-offset:2px}",
    ".tx-sentido::before{content:attr(data-flecha)}",
    ".tx-s-entrada{color:var(--ok)}",
    ".tx-s-salida{color:var(--err)}",
    ".tx-s-propias{color:var(--faint)}",
    ".tx-s-ninguno{cursor:default}",
    ".tx-sentido::after{content:attr(data-ayuda);display:none;position:absolute;left:0;bottom:calc(100% + 6px);width:max-content;background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:5px 10px;font-size:12.5px;font-weight:600;line-height:1.4;z-index:400;pointer-events:none}",
    ".tx-sentido:hover::after,.tx-sentido:focus-visible::after{display:block}",
    /* Su burbuja, por encima de los títulos fijos de la tabla (z-index 5). */
    ".tx-sentido:hover,.tx-sentido:focus-visible{z-index:6}",
    ".tx-accion{min-height:0;padding:2px 7px;font-size:12.5px;margin:1px 4px 1px 0;white-space:nowrap}",
    /* Nota personal en su propia fila, bajo la suya: en cursiva, o el
       editor con sus botones. Sobre amarillo pálido, para que resalte
       (también en 💰 Rendimientos). */
    "#txTabla tr.tx-fila-nota>td{padding:0 6px 9px;white-space:normal}",
    ".tx-nota-caja{width:0;min-width:100%}",
    ".tx-notap{display:block;font-size:12.5px;font-style:italic;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;background:var(--nota-bg);border:1px solid var(--nota-bd);border-radius:8px;padding:3px 10px}",
    ".tx-nota-editor{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center}",
    ".tx-nota-editor textarea{flex:1 1 360px;max-width:640px;width:auto;font-size:13px;padding:7px 10px;resize:vertical}",
    ".tx-nota-pie{display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
    ".tx-nota-pie .help{margin-right:4px}",
    /* Opciones de 🚫, en su fila bajo la suya, como la nota. */
    "#txTabla tr.tx-fila-apartar>td{padding:0 6px 9px;white-space:normal}",
    ".tx-apartar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}",
    ".tx-apartar-titulo{font-size:12.5px;color:var(--muted);margin-right:2px}",
    /* Retención bajo el importe de un rendimiento, solo si la hay. */
    ".tx-ret{display:block;font-size:11.5px;color:var(--muted)}",
    /* Acciones de solo icono con su burbuja: se abre a la
       izquierda del botón, que está en la última columna, y no tapa el
       clic (pointer-events). Mismos colores que la ⓘ de js/15. */
    /* Sin caja (llamaría demasiado la atención): solo el emoji con una
       sombra, y un fondo verde pálido al pasar el ratón (como la regla
       general de «button:hover»; la fila ya se pone gris), salvo si está
       inactivo.
       Con nota, el amarillo pálido de las notas. */
    ".tx-ico{position:relative;width:24px;height:24px;padding:0;display:inline-flex;align-items:center;justify-content:center;font-size:13px;margin:1px;vertical-align:middle;border-color:transparent;background:transparent;box-shadow:none}",
    ".tx-ico>span:first-child{text-shadow:0 1px 2px rgba(0,0,0,.4)}",
    ".tx-ico.tx-con-nota{background:var(--nota-bg);border-color:var(--nota-bd)}",
    ".tx-ico:hover:not(:disabled):not([aria-disabled=true]){border-color:transparent;background:var(--ok-bg)}",
    ".tx-ico[aria-disabled=true]{opacity:.45;cursor:not-allowed}",
    /* La misma burbuja en la cabecera «Importe (retención)» y en el
       importe de cada rendimiento (.tx-ayuda); la de la cabecera se abre
       hacia abajo para no salirse de la tabla. */
    ".tx-ayuda{position:relative;display:inline-block;cursor:help;outline-offset:2px}",
    ".tx-ayuda .tx-burbuja{right:calc(100% + 8px);top:50%;transform:translateY(-50%)}",
    "#txTabla th .tx-ayuda .tx-burbuja{right:0;top:calc(100% + 6px);transform:none}",
    /* Ni la burbuja ni «(retención)» heredan las mayúsculas de la cabecera:
       «(retención)» se ve igual que «(ret. 0,50)» en la celda. */
    "#txTabla th .tx-burbuja,#txTabla th .tx-ret{text-transform:none;letter-spacing:normal}",
    "#txTabla th .tx-ret{font-weight:400}",
    ".tx-ayuda:hover .tx-burbuja,.tx-ayuda:focus .tx-burbuja{display:block}",
    ".tx-ico .tx-burbuja,.tx-ayuda .tx-burbuja{display:none;position:absolute;right:calc(100% + 8px);top:50%;transform:translateY(-50%);width:max-content;max-width:min(300px,60vw);background:var(--panel2);color:var(--text);border:1px solid var(--border);border-radius:10px;box-shadow:var(--shadow);padding:7px 10px;font-size:12.5px;font-weight:400;line-height:1.5;z-index:400;text-align:left;white-space:normal;pointer-events:none}",
    ".tx-ico .tx-burbuja b,.tx-ayuda .tx-burbuja b{display:block;margin-bottom:2px}",
    ".tx-ico:hover .tx-burbuja,.tx-ico:focus-visible .tx-burbuja{display:block}",
    "#txTabla tr.tx-destacada{outline:2px solid var(--accent);outline-offset:-2px}",
    ".tx-vinculada:hover{border-color:var(--info)}",
    /* Hash de la otra transacción del vínculo, debajo del propio. */
    ".tx-hash-rel{display:block;font-size:11.5px;color:var(--muted)}",
    /* «👁 Ver spam» y «✖ Salir
       del spam» en ámbar, para que resalten. */
    ".tx-ver-spam{margin-left:6px;background:var(--warn-bg);border-color:var(--warn-bd);color:var(--warn)}",
    ".tx-ver-spam:hover:not(:disabled){border-color:var(--warn);color:var(--warn)}",
    ".tx-vinculada{cursor:pointer;color:var(--info);background:var(--info-bg);border:1px solid var(--info-bd);border-radius:999px}",
    ".tx-nota-coste{margin:2px 0 6px}",
    txCssColoresCategoria(),
    ".tx-vacio{text-align:center;color:var(--muted);padding:18px}",
    ".tx-dlg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:60;padding:16px}",
    ".tx-dlg{background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);padding:20px;width:min(460px,100%)}",
    ".tx-dlg h3{margin-bottom:8px}",
    ".tx-dlg-reg{font-size:13px;color:var(--muted);margin-bottom:12px}",
    ".tx-dlg-pie{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Eventos ----------------------------- */

/* Engancha el evento una sola vez por elemento y tipo (marca __txEvento_tipo). */
function txEscuchar(id, tipo, fn) {
  const el = $(id);
  const marca = "__txEvento_" + tipo;
  if (!el || el[marca]) return;
  el[marca] = true;
  el.addEventListener(tipo, fn);
}

function txBotonDe(e, selector) {
  return e.target.closest ? e.target.closest(selector) : null;
}

function txMontarEventos() {
  for (const id of TX_IDS_SELECTS) txEscuchar(id, "change", () => txPintarCuerpoSeguro());
  /* Desde / Hasta: cada calendario no deja pasar del otro. */
  for (const id of TX_IDS_FECHAS) txEscuchar(id, "change", () => {
    const desde = $("txFiltroDesde"), hasta = $("txFiltroHasta");
    if (desde && hasta) { hasta.min = desde.value; desde.max = hasta.value; }
    txPintarCuerpoSeguro();
  });
  let temporizador = null; // la búsqueda espera 150 ms a que dejes de escribir
  txEscuchar("txBuscar", "input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(txPintarCuerpoSeguro, 150);
  });
  /* Editor de la nota: Intro guarda (Mayús+Intro, salto de línea), Esc
     cancela; lo escrito se recuerda por si la tabla se repinta. */
  txEscuchar("txCuerpo", "keydown", e => {
    /* Las opciones de 🚫: Esc las cierra. */
    if (e.key === "Escape" && txApartarAbierto && e.target.closest && e.target.closest("tr.tx-fila-apartar")) {
      e.preventDefault();
      return txCerrarApartar();
    }
    txNota.teclas(e);
  });
  txEscuchar("txCuerpo", "input", e => txNota.apuntar(e));
  /* «Ver spam» / «Salir del spam»: eligen o quitan la categoría
     Spam del selector, y el foco pasa al botón nuevo. */
  txEscuchar("txRecuento", "click", e => {
    const ver = txBotonDe(e, "[data-ver-spam]"), salir = txBotonDe(e, "[data-salir-spam]");
    const sel = $("txFiltroCategoria");
    if ((!ver && !salir) || !sel) return;
    sel.value = ver ? "SPAM" : "";
    txGrupoFiltro = txMotivoFiltro = "";
    txPintarCuerpoSeguro();
    const otro = document.querySelector(ver ? "#txRecuento [data-salir-spam]" : "#txRecuento [data-ver-spam]");
    if (otro) otro.focus();
  });
  txEscuchar("txLimpiar", "click", () => {
    txVaciarFiltros();
    txPintarCuerpoSeguro();
  });
  txEscuchar("txMotivosSpam", "click", e => {
    const btn = txBotonDe(e, "button[data-motivo]");
    if (!btn) return;
    const m = btn.getAttribute("data-motivo");
    txMotivoFiltro = txMotivoFiltro === m ? "" : m;
    txPintarCuerpoSeguro();
    const otro = document.querySelector('#txMotivosSpam button[data-motivo="' + m + '"]');
    if (otro) otro.focus();
  });
  /* «📒 Transacciones» del menú vuelve siempre a la vista normal: sale
     del spam, también si ya estás en la pestaña. */
  if (!document.__txMenuSpam) {
    document.__txMenuSpam = true;
    document.addEventListener("click", e => {
      const a = e.target.closest ? e.target.closest('a[href="#transacciones"]') : null;
      const sel = $("txFiltroCategoria");
      if (!a || !sel || sel.value !== "SPAM") return;
      sel.value = "";
      txMotivoFiltro = "";
      if (location.hash === "#transacciones") txPintarCuerpoSeguro();
    });
  }
  /* Repintar rehace los botones; el foco vuelve al que se pulsó (si no,
     con el teclado se pierde). */
  txEscuchar("txTriaje", "click", e => {
    const defi = txBotonDe(e, "[data-defi]"), btn = defi || txBotonDe(e, "[data-grupo]");
    if (!btn) return;
    const g = btn.getAttribute("data-grupo");
    if (defi) txDefiFiltro = !txDefiFiltro;
    else txGrupoFiltro = txGrupoFiltro === g ? "" : g;
    txPintarCuerpoSeguro();
    const otro = document.querySelector(defi ? "#txTriaje [data-defi]" : '#txTriaje [data-grupo="' + g + '"]');
    if (otro) otro.focus();
  });
  txEscuchar("txCuerpo", "click", e => {
    const btn = txBotonDe(e, "[data-accion]");
    if (!btn || btn.disabled) return;
    const accion = btn.getAttribute("data-accion");
    const clave = btn.getAttribute("data-clave");
    if (txNota.accion(accion, clave)) return;
    if (accion === "mandar-revisar") txAbrirMandarRevisar(clave, btn);
    else if (accion === "quitar-revisar") txQuitarRevisar(clave);
    else if (accion === "mandar-spam") txPulsarMandarSpam(clave);
    /* Elegir una opción cierra antes las opciones (aunque luego haya un
       error y no se guarde nada). */
    else if (accion.startsWith("spam-") && accion !== "spam-cancelar") {
      const abiertas = txApartarAbierto && txApartarAbierto.clave === clave ? txApartarAbierto.opciones : null;
      txApartarAbierto = null;
      txPintarCuerpoSeguro();
      if (accion === "spam-movimiento") txCambiarSpam(clave, "mandar-spam");
      else txApartar(clave, accion === "spam-token" ? "tokens" : "direcciones", abiertas);
    }
    else if (accion === "spam-cancelar") txCerrarApartar();
    else if (accion === "quitar-regla-spam") txQuitarRegla(clave);
    else if (accion === "sacar-spam" || accion === "quitar-ajuste-spam") txCambiarSpam(clave, accion);
    else if (accion === "abrir-buscador") ccAbrirBuscador(clave, btn);
    else if (accion === "ver-vinculo") ccIrAVinculo(btn.getAttribute("data-venta"));
  });
}

/* ----------------------------- Barra lateral plegable -----------------------------
   «« Plegar menú» reduce la barra lateral a iconos (clase body.nav-plegada;
   el CSS de index.html solo la aplica en ancho completo). La preferencia se
   recuerda en el navegador como el modo oscuro de js/13; si el navegador no
   deja guardar, simplemente no se recuerda. Vive aquí, aunque no es de
   Transacciones, para no tocar otros módulos. */
const TX_CLAVE_NAV_PLEGADA = "reental_nav_plegada";

function txAplicarNavPlegada(plegada) {
  document.body.classList.toggle("nav-plegada", !!plegada);
  const btn = $("btnPlegarNav");
  if (!btn) return;
  const ico = btn.querySelector(".nav-plegar-ico");
  if (ico) ico.textContent = plegada ? "»" : "«";
  btn.setAttribute("aria-expanded", plegada ? "false" : "true");
  btn.title = plegada ? "Desplegar el menú" : "Plegar el menú (solo iconos)";
  btn.setAttribute("aria-label", plegada ? "Desplegar el menú" : "Plegar el menú");
}

function txMontarNavPlegable() {
  const btn = $("btnPlegarNav");
  if (!btn || btn.__txEvento) return;
  btn.__txEvento = true;
  let guardada = false;
  try { guardada = localStorage.getItem(TX_CLAVE_NAV_PLEGADA) === "1"; } catch (e) { /* sin almacenamiento */ }
  txAplicarNavPlegada(guardada);
  btn.addEventListener("click", () => {
    const plegada = !document.body.classList.contains("nav-plegada");
    txAplicarNavPlegada(plegada);
    try { localStorage.setItem(TX_CLAVE_NAV_PLEGADA, plegada ? "1" : "0"); } catch (e) { /* sin almacenamiento */ }
  });
}

/* ----------------------------- Repintado -----------------------------
   Como js/15, js/16 y js/19: envoltorios que AÑADEN el repintado detrás de
   las funciones globales que avisan de cambios de datos, más hashchange al
   entrar en #transacciones. Si la función original lanza, el error se
   propaga exactamente igual. */
(function montarHooksTransacciones() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  /* Clasificar llama a renderPanel (el descubrimiento): para no pintar 📒
     dos veces, dentro de la clasificación no se repinta. */
  let clasificando = 0;
  function envolver(nombre) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__txEnvuelta) return;
    const esClasificar = nombre === "ejecutarClasificacion";
    const envoltura = function () {
      if (esClasificar) clasificando++;
      let resultado;
      try { resultado = original.apply(this, arguments); }
      finally { if (esClasificar) clasificando--; }
      /* Lo DeFi, de esta clasificación; si no clasificó (los registros
         son los mismos), se queda el de la anterior. */
      if (esClasificar) txDefiVigente();
      if (!clasificando) txRenderSeguro(false);
      return resultado;
    };
    envoltura.__txEnvuelta = true;
    window[nombre] = envoltura;
  }
  ["renderPanel", "actualizarChipEstado", "ejecutarClasificacion"].forEach(envolver);

  window.addEventListener("hashchange", () => {
    if (location.hash === "#transacciones") txRenderSeguro(true);
  });

  txMontarEventos();
  txMontarNavPlegable();
  /* Al cambiar el ancho (ventana, menú plegado o la pestaña que se abre),
     se vuelve a repartir el sitio libre. */
  const caja = document.querySelector(TX_SEL_CAJA_TABLA);
  let anchoCaja = -1; // solo cuenta el ancho: lo que crece hacia abajo no cambia el reparto
  if (caja && typeof ResizeObserver === "function") new ResizeObserver(() => {
    if (caja.clientWidth !== anchoCaja) { anchoCaja = caja.clientWidth; txRepartirAire(); }
  }).observe(caja);
  txRenderSeguro(true); // el DOM ya existe: los scripts van al final del <body>
})();
