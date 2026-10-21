/* =====================================================================
   REENTAL SPA · js/24-exportar.js
   La pestaña 📤 Exportar. (1) y (2) se ven en 🚀 Puesta en marcha
   (#btnCopia y #exUltima de index.html; js/19 los enseña con datos).

   Qué hay:
   (1) Copia de seguridad: un duplicado de tu archivo, con lo que hay en
       la app y la marca copia_de_seguridad con su fecha. Con la casilla
       de «Tus datos» marcada (de entrada; js/04, datosEnArchivo), lleva
       tus API keys y tu nombre y NIF; sin ella, ninguno. Se abre con
       «📂 Abrir copia» (js/19, arrAbrirArchivo); su formato está en
       exArmarCopia.
   (2) Última copia: la última hecha en este navegador (fecha, archivo y
       qué llevaba; nunca los datos), en localStorage. Solo la última.
   (3) Imprimir: un botón por pestaña. Al imprimir (con el botón o con
       Ctrl+P en cualquier pestaña) sale solo la pestaña abierta, en claro y
       con sus desplegables abiertos; al terminar todo vuelve a como estaba.
   (4) Excel y PDF: el Excel con todos los años (js/26) y el informe para
       la Renta del año del desplegable (js/27, sin pasar por 🧾 Fiscal).
       Los dos con el cálculo de 🧾 (fiResultado de js/23) y solo si 🧾 lo
       enseñaría; si no, dicen por qué.

   El archivo de rendimientos y tus datos van dentro de tu archivo.
   Tu archivo vive en el
   navegador; «🗂️ Guardar copia» lo descarga siempre, en cualquier
   navegador, como reental_cache_AAAA-MM-DD_HHMM.json, y «Última copia»
   dice hace cuántos días (js/19 avisa en el resumen si hace mucho).
   Usa ccEsc (js/15), arrNumTx (js/19) y el cálculo de 🧾 (js/23),
   que cargan antes, y al pulsar (4), js/25, js/26 y js/27.
   ===================================================================== */

const EX_HISTORIAL = "reental_copias";   // clave de localStorage
const EX_CLAVES = CLAVES_API;   // js/05
const EX_IMPRIMIR = [["dashboard", "📊 Dashboard"], ["transacciones", "📒 Transacciones"],
  ["rendimientos", "💰 Rendimientos"], ["fiscal", "🧾 Fiscal"]];

const exEstado = {
  guardando: false,   // una copia o un Excel en marcha
  imprimiendo: null,  // { oscuro, abiertos: [details], volverA } mientras se imprime
  anio: null,         // { cache, valor }: el año del informe elegido con esa cache (sin él, el último terminado)
  pintar: false,      // un repintado ya pedido
  foco: null,         // id del botón que tenía el foco mientras está apagado
  imprimiendoInforme: false,   // el informe acaba de abrir su diálogo (doble clic)
  copiaHecha: 0,      // cuándo se descargó la última copia (doble clic)
  sinAlmacen: null,   // la última copia, si este navegador no deja apuntarla
};

/* ----------------------------- Funciones puras ----------------------------- */

// «2026-01-15» y «20:15» con la hora de este ordenador.
function exFechaLocal(d) {
  const p = n => String(n).padStart(2, "0");
  return { dia: d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()),
    hora: p(d.getHours()) + ":" + p(d.getMinutes()) };
}
// Con la hora, para que dos copias del mismo día no se pisen.
function exNombreConHora(prefijo, extension, ahora) {
  const f = exFechaLocal(ahora);
  return prefijo + "_" + f.dia + "_" + f.hora.replace(":", "") + extension;
}
function exNombreArchivo(ahora) { return exNombreConHora("reental_cache", ".json", ahora); }
function exNombreExcel(ahora) { return exNombreConHora("reental_contabilidad", ".xlsx", ahora); }

/* La copia: un duplicado de tu archivo, con tus datos de ahora y
   la marca con su fecha, que hace que «📂 Abrir copia» avise al abrirla
   (js/19): { …tu archivo…, copia_de_seguridad: { creada: ISO } }.
   Con incluirDatos (la casilla), «configuracion» lleva también las API keys,
   el nombre y el NIF, como tu archivo (js/04, guardarConfigEnCache); sin
   él, solo la wallet y el vault. Las copias antiguas con las claves en la
   marca se siguen leyendo (js/19, exClavesDeCopia). Nunca toca lo que recibe; la
   cache va copiada para que no cambie mientras eliges dónde guardarla (una
   sincronización en marcha). */
function exArmarCopia({ cache, config, incluirDatos, ahora }) {
  const copia = structuredClone(cache);
  ponerConfiguracionSegunCasilla(copia, config, incluirDatos);
  copia.copia_de_seguridad = { creada: ahora.toISOString() };
  return copia;
}
/* Las API keys escritas (texto con algo) de una config o de la marca de una
   copia; las vacías o mal escritas no van (al abrir, no borran las tuyas). */
function exClavesDeCopia(origen) {
  const claves = {};
  if (!origen || typeof origen !== "object") return claves;
  for (const k of EX_CLAVES) if (typeof origen[k] === "string" && origen[k].trim()) claves[k] = origen[k].trim();
  return claves;
}

// ¿Hay algo escrito en alguno de esos campos? (Un número escrito a mano
// en el config.json cuenta como escrito, no rompe la pestaña)
function exAlgunCampo(config, campos) {
  return !!config && typeof config === "object" && campos.some(k => String(config[k] ?? "").trim() !== "");
}
/* ¿La config tiene algo que guardar? Wallet, vault, nombre o NIF escritos,
   o las API keys si van en la copia. */
function exConfigConDatos(config, conClaves) {
  return exAlgunCampo(config, ["wallet", "vault"]) ||
    !!(config && exAlgunCampo(config.inversor, ["nombre", "nif"])) ||
    (!!conClaves && exAlgunCampo(config, EX_CLAVES));
}
function exTieneClaves(config) { return exAlgunCampo(config, EX_CLAVES); }

/* Lo que lleva (o llevará) una copia, en una línea de solo datos.
   r = { movimientos: n | null, repartos: n | null, config: bool, claves: bool } */
function exTextoLleva(r) {
  const partes = [];
  // «1 reparto», no «1 repartos».
  const cuantos = (n, una, varias) => numEs(n, 0) + " " + (n === 1 ? una : varias);
  if (r.movimientos != null) partes.push(cuantos(r.movimientos, "transacción", "transacciones"));
  if (r.repartos != null) partes.push(cuantos(r.repartos, "reparto", "repartos"));
  if (r.config) partes.push(r.claves ? "tus datos y API keys" : "tus datos");
  return partes.join(" · ");
}

/* ----------------------------- Historial ----------------------------- */

/* Solo la última, en una lista de una: así se leen también las listas
   antiguas. Cada dato, solo si es del tipo que escribe la app (con lo
   escrito a mano saldría «[object Object]» o «? movimientos»). */
function exUltimaCopia() {
  let lista;
  try { lista = JSON.parse(localStorage.getItem(EX_HISTORIAL) || "[]"); } catch (e) { lista = null; }
  if (exEstado.sinAlmacen) lista = [exEstado.sinAlmacen];
  const e = Array.isArray(lista) && lista.find(x => x && typeof x.fecha === "string" && !isNaN(new Date(x.fecha).getTime()));
  if (!e) return null;
  const numero = x => (typeof x === "number" && Number.isFinite(x) ? x : null);
  return { fecha: e.fecha, archivo: typeof e.archivo === "string" ? e.archivo : "", descargada: e.descargada === true,
    movimientos: numero(e.movimientos), repartos: numero(e.repartos), config: e.config === true, claves: e.claves === true };
}
/* Días desde la última copia (por fecha de este ordenador: hoy, 0), o null sin
   ninguna. Una fecha futura (el reloj iba adelantado) no cuenta como «hoy» para siempre: null. */
function exDiasUltimaCopia(ahora) {
  const e = exUltimaCopia();
  if (!e) return null;
  const dia = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const n = Math.round((dia(ahora) - dia(new Date(e.fecha))) / 864e5);
  return n < 0 ? null : n;
}
// Si el navegador no deja apuntarla, se recuerda en esta sesión (si no, «ninguna» tras cada copia).
function exApuntarCopia(entrada) {
  try { localStorage.setItem(EX_HISTORIAL, JSON.stringify([entrada])); exEstado.sinAlmacen = null; }
  catch (e) { exEstado.sinAlmacen = entrada; }
}

/* ----------------------------- Qué hay para copiar ----------------------------- */

/* Lo que lleva la copia, para «Última copia» (en el formato de exTextoLleva). */
function exResumenAhora(incluirDatos) {
  // Sin la casilla no se dice «tus datos» (no lleva ni nombre ni NIF).
  const conConfig = !!incluirDatos && exConfigConDatos(state.config, true);
  return {
    movimientos: arrNumTx(state.cache),
    repartos: leerArchivoRendimientosCache(state.cache) ? (state.filasCsv || []).length : null,
    config: conConfig,
    claves: conConfig && exTieneClaves(state.config),
  };
}

/* ----------------------------- Pintar ----------------------------- */

// «Última copia: hace N días», con la fecha, el archivo y lo que llevaba en su burbuja.
function exHtmlHistorial() {
  const e = exUltimaCopia();
  if (!e) return '<p class="help">Última copia: ninguna.</p>';
  const f = exFechaLocal(new Date(e.fecha)), n = exDiasUltimaCopia(new Date());
  const lleva = exTextoLleva(e);
  const burbuja = fechaEs(f.dia) + " " + f.hora + (e.archivo ? " · " + e.archivo : "") + (lleva ? " · " + lleva : "");
  // Con una fecha futura, la fecha (no «hoy»).
  const cuando = n === null ? fechaEs(f.dia) : n === 0 ? "hoy" : n === 1 ? "ayer" : "hace " + n + " días";
  return '<p class="ex-ultima" title="' + ccEsc(burbuja) + '">Última copia: <b>' + cuando + "</b></p>";
}

/* El año del informe: el elegido si lo hay; si no, el último terminado.
   Otra cache vuelve al último terminado (como 🧾). */
function exAnioInforme(informes, anios) {
  const elegido = exEstado.anio && exEstado.anio.cache === state.cache ? exEstado.anio.valor : null;
  return fiAnioElegido(informes, anios, elegido);
}
/* El desplegable de años, si 🧾 tiene el cálculo (sin él, nada: el botón
   dice por qué al pulsarlo), y debajo lo que 🧾 avisa de la sincronización
   (sin fecha, propondría el año anterior sin decir por qué). */
function exHtmlAnios() {
  const nada = { select: "", aviso: "" };
  if (fiMotivoSinCalculo()) return nada;
  let r;
  try {
    r = fiResultado();
  } catch (e) {
    // Lo que diría 🧾 (el desplegable no desaparece sin más).
    return { select: "", aviso: '<p class="ex-aviso mt">No se pudo hacer el cálculo fiscal: ' + ccEsc(e && e.message) + "</p>" };
  }
  const anios = fiAnios(r.informes);
  if (!anios.length) return nada;
  const anio = exAnioInforme(r.informes, anios);
  const aviso = fiAvisoSincronizacion(r.hasta);
  return { select: '<select id="exAnio" aria-label="Año del informe">' + anios.map(a => '<option value="' + a + '"' +
    (a === anio ? " selected" : "") + ">" + a + (r.informes[a].cabecera.anio_terminado ? "" : " (en curso)") + "</option>").join("") +
    "</select>", aviso: aviso ? '<p class="ex-aviso mt">' + ccEsc(aviso) + "</p>" : "" };
}

function exRender() {
  const cuerpo = $("exCuerpo");
  if (!cuerpo) return;
  const informe = exHtmlAnios();
  cuerpo.innerHTML =
    '<section class="ex-bloque" aria-labelledby="exTitImprimir">' +
      '<h3 id="exTitImprimir">🖨️ Imprimir</h3>' +
      '<p class="help">Sale la pestaña tal como se ve, en claro y con lo plegado abierto. También con Ctrl+P en cualquier pestaña.</p>' +
      '<div class="row mt">' + EX_IMPRIMIR.map(([id, texto]) =>
        '<button type="button" class="ex-imprimir" data-vista="' + id + '">' + texto + "</button>").join("") + "</div>" +
    "</section>" +
    '<section class="ex-bloque" aria-labelledby="exTitInformes">' +
      '<h3 id="exTitInformes">📊 Excel y PDF</h3>' +
      '<p class="help">El Excel, con todos los años. El informe, del año que elijas: al imprimir, «Guardar como PDF».</p>' +
      '<div class="row mt"><button type="button" id="btnExcel"' + (exEstado.guardando ? " disabled" : "") + ">📊 Excel</button>" +
        '<span class="ex-informe">' + informe.select + '<button type="button" id="btnInforme">📄 Informe fiscal</button></span></div>' +
      informe.aviso +
    "</section>";
}
/* Al entrar en la pestaña o cambiar lo cargado. Repinta sin perder el foco
   (si no, tras «📊 Excel» queda en la página). Si el botón está
   apagado mientras guarda, se le devuelve en el repintado del final. */
function exRenderSeguro() {
  const cuerpo = $("exCuerpo"), activo = document.activeElement;
  const foco = cuerpo && activo && activo.id && cuerpo.contains(activo) ? activo.id : exEstado.foco;
  try { exRender(); } catch (e) { log("No se pudo pintar 📤 Exportar: " + e.message, "warn"); }
  const el = foco && location.hash === "#exportar" ? $(foco) : null;
  exEstado.foco = el && el.disabled ? foco : null;
  if (el && !el.disabled) el.focus({ preventScroll: true });
}

// 🚀: el botón y «Última copia»; js/19 enseña el bloque con tu archivo abierto.
// Apagado mientras se guarda una o mientras se descarga.
const exCopiaApagada = () => exEstado.guardando || !!arr.preparando || !!(state.sync && state.sync.running);
function exPintarCopia() {
  const btn = $("btnCopia"), ultima = $("exUltima");
  if (btn) btn.disabled = exCopiaApagada();
  if (ultima) ultima.innerHTML = exHtmlHistorial();
}
/* Al cambiar lo cargado, al terminar lo que se está haciendo (como js/23):
   la clasificación avisa al chip antes de que 🧾 apunte que terminó, y los
   años del informe saldrían con «no está al día». */
function exPedirRepintado() {
  if (exEstado.pintar) return;
  exEstado.pintar = true;
  setTimeout(() => { exEstado.pintar = false; if (location.hash === "#exportar") exRenderSeguro(); }, 0);
}

/* ----------------------------- Hacer la copia ----------------------------- */

/* Si el cálculo tardó, Chrome ya no abre el diálogo de guardar (el clic
   «caducó»): el Excel se descarga. */
const exClicCaducado = e => !!e && (e.name === "SecurityError" || e.name === "NotAllowedError");

/* La guarda va lo primero y todo dentro del try. Siempre se
   descarga. Devuelve si se hizo (js/19, «🧹 Olvidar todo» con copia antes).
   Como no espera a ningún diálogo, un doble clic (dos en menos de
   2 s) no descarga dos. */
async function exHacerCopia() {
  if (exCopiaApagada() || Date.now() - exEstado.copiaHecha < 2000) return false;
  exEstado.guardando = true;
  try {
    if (!state.cache) { toast("Nada que copiar todavía.", "warn"); return false; }
    if ($("cfgWallet")) leerConfigDesdeFormulario();
    const incluirDatos = datosEnArchivo();
    const r = exResumenAhora(incluirDatos);
    const ahora = new Date();
    const copia = exArmarCopia({ cache: state.cache, config: state.config, incluirDatos, ahora });
    const nombre = exNombreArchivo(ahora);
    // El navegador la descarga y la app no sabe si llegó: se dice «descargada».
    descargarJson(nombre, copia);
    exEstado.copiaHecha = Date.now();
    exApuntarCopia({ fecha: ahora.toISOString(), archivo: nombre, descargada: true, ...r });
    toast("Copia descargada: " + nombre + ". Mira tu carpeta de descargas.", "ok");
    return true;
  } catch (e) {
    toast("No se pudo guardar la copia: " + (e && e.message), "error");
    return false;
  } finally {
    exEstado.guardando = false;
    exPintarCopia();
  }
}

/* ----------------------------- Excel y PDF ----------------------------- */

/* El cálculo de 🧾 Fiscal, con lo escrito en el formulario de la config
   (el titular y el NIF salen en los dos). Solo si 🧾 lo enseñaría: con
   otra wallet recién escrita saldría su nombre con los movimientos de la
   anterior. Si no, se dice por qué y da null. */
function exCalculoFiscal() {
  if ($("cfgWallet")) leerConfigDesdeFormulario();
  const motivo = fiMotivoSinCalculo();
  if (motivo) { toast(motivo, "warn"); return null; }
  return fiResultado();
}

/* El Excel, con los registros, colas y resumen de la pasada de 🧾 (una
   copia: excelLibro solo lee). Como la copia: la guarda va lo primero
   (doble clic) y sin el diálogo de guardar se dice «descargado». */
async function exExcel() {
  if (exEstado.guardando) return;
  exEstado.guardando = true;
  try {
    const r = exCalculoFiscal();
    if (!r) return;
    const ahora = new Date();
    const blob = xlsxBlob(excelLibro(r.registros, r.colas, r.resumen, state.cache, state.config, r.informes, ahora, r.hasta, r.cuadre, r), ahora);
    const nombre = exNombreExcel(ahora);
    exRenderSeguro();
    let archivo = nombre, descargado = !soportaFSA;
    if (!descargado) {
      try {
        const handle = await guardarBlobComo(nombre, blob, { description: "Excel", accept: { [XLSX_TIPO]: [".xlsx"] } });
        if (handle && handle.name) archivo = handle.name;
      } catch (e) {
        if (!exClicCaducado(e)) throw e;
        descargado = true;
      }
    }
    if (descargado) descargarBlob(nombre, blob);
    toast(descargado ? "Excel descargado: " + nombre + ". Mira tu carpeta de descargas." : "Excel guardado en " + archivo + " ✔", "ok");
  } catch (e) {
    if (!e || e.name !== "AbortError") toast("No se pudo hacer el Excel: " + (e && e.message), "error");
  } finally {
    exEstado.guardando = false;
    exRenderSeguro();
  }
}

/* El informe para la Renta del año del desplegable, con lo que 🧾 sabe de
   la sincronización. Un segundo clic en el segundo siguiente no
   hace nada: Chrome lo deja en cola mientras el diálogo está
   abierto y abriría otro al cerrarlo; donde print() no espera, quitaría el
   marco que se estaba imprimiendo. */
function exInforme() {
  if (exEstado.imprimiendoInforme) return;
  exEstado.imprimiendoInforme = true;
  setTimeout(() => { exEstado.imprimiendoInforme = false; }, 1000);
  try {
    const r = exCalculoFiscal();
    if (!r) return;
    const anio = exAnioInforme(r.informes, fiAnios(r.informes));
    if (anio === null) { toast("Sin movimientos que declarar.", "warn"); return; }
    pdfImprimir(r.informes[anio], new Date(), r.hasta);
  } catch (e) {
    toast("No se pudo hacer el informe: " + (e && e.message), "error");
  }
}

/* ----------------------------- Imprimir ----------------------------- */

/* Antes de imprimir (el navegador lo avisa con el botón y con Ctrl+P): tema
   claro y los desplegables de la pestaña abierta, abiertos; después, todo
   como estaba. */
function exAntesDeImprimir() {
  // Un segundo aviso antes del «después» no vuelve a apuntar (perdería el oscuro).
  if (exEstado.imprimiendo && exEstado.imprimiendo.preparado) return;
  const vista = document.querySelector(".view.active");
  // Los marcados data-privado (nombre y NIF) se quedan como están.
  const abiertos = vista ? [...vista.querySelectorAll("details:not([open]):not([data-privado])")] : [];
  abiertos.forEach(d => { d.open = true; });
  // Con estas claves js/23 los vuelve a abrir si repinta en medio; se cierran por ellas.
  const claves = abiertos.map(d => d.dataset.abierto).filter(Boolean);
  // La lista entera de inmuebles del Dashboard también en el papel.
  const verTodos = vista ? vista.querySelector('.dash-ver-todos[aria-expanded="false"]') : null;
  if (verTodos) verTodos.click();
  // Y siempre lo pagado, no el valor nominal (ni su ventana).
  document.querySelectorAll("dialog.dash-dlg[open]").forEach(d => d.close());
  const nominal = vista ? vista.querySelector(".dash-nominal-sw input:checked") : null;
  if (nominal) nominal.click();
  const oscuro = document.body.classList.contains("dark");
  document.body.classList.remove("dark");
  exEstado.imprimiendo = { ...exEstado.imprimiendo, preparado: true, oscuro, vista, abiertos, claves, verTodos: !!verTodos, nominal: !!nominal };
}
function exDespuesDeImprimir() {
  const imp = exEstado.imprimiendo;
  if (!imp) return;
  exEstado.imprimiendo = null;
  (imp.abiertos || []).forEach(d => { d.open = false; });
  if (imp.vista) {
    for (const d of imp.vista.querySelectorAll("details[open][data-abierto]")) if (imp.claves.includes(d.dataset.abierto)) d.open = false;
    const verMenos = imp.verTodos && imp.vista.querySelector('.dash-ver-todos[aria-expanded="true"]');
    if (verMenos) verMenos.click();
    const nominal = imp.nominal && imp.vista.querySelector(".dash-nominal-sw input:not(:checked)");
    if (nominal) nominal.click();
  }
  if (imp.oscuro) document.body.classList.add("dark");
  if (imp.volverA && location.hash !== imp.volverA) location.replace(imp.volverA);
}
/* Botón «Imprimir» de una pestaña: la abre, imprime y vuelve a 📤 Exportar.
   Se imprime en el hashchange de esa pestaña: este oyente va detrás de los
   que la cambian y la repintan (todos síncronos). Los saltos, con
   location.replace: «Atrás» sigue llevando a donde estabas. Lo deshace
   afterprint, también en los navegadores que no se paran en print(); solo
   si print() falla se deshace aquí. */
function exImprimirVista(id) {
  if (!$("view-" + id)) return;
  exEstado.imprimiendo = { volverA: location.hash || "#exportar" };
  const imprimir = () => {
    try { window.print(); } catch (e) { exDespuesDeImprimir(); toast("No se pudo imprimir: " + e.message, "error"); }
  };
  if (location.hash === "#" + id) { imprimir(); return; }
  window.addEventListener("hashchange", imprimir, { once: true });
  location.replace("#" + id);
}

/* ----------------------------- Estilos ----------------------------- */

function exInyectarEstilos() {
  if (document.getElementById("exEstilos")) return;
  const st = document.createElement("style");
  st.id = "exEstilos";
  st.textContent = [
    ".ex-bloque{border-top:1px solid var(--border);padding-top:16px;margin-top:16px}",
    ".ex-bloque:first-child{border-top:0;padding-top:0;margin-top:4px}",
    ".ex-bloque h3{font-size:15px;margin-bottom:6px}",
    ".ex-casilla{display:inline-flex;align-items:center;gap:8px;margin-top:10px;font-size:13.5px;cursor:pointer}",
    ".ex-casilla input{width:18px;height:18px;padding:0;margin:0;accent-color:var(--accent);cursor:pointer}",
    ".ex-informe{display:inline-flex;flex-wrap:wrap;align-items:center;gap:8px}",
    ".ex-informe select{width:auto}",
    ".ex-aviso{color:var(--warn);font-weight:600;font-size:13.5px}",
    ".ex-ultima{font-size:13.5px;overflow-wrap:anywhere}",
  ].join("\n");
  document.head.appendChild(st);
}

/* ----------------------------- Montaje ----------------------------- */
(function montarExportar() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const cuerpo = $("exCuerpo");
  if (!cuerpo) return;

  exInyectarEstilos();
  const btnCopia = $("btnCopia");
  if (btnCopia) btnCopia.addEventListener("click", exHacerCopia);
  exPintarCopia();

  cuerpo.addEventListener("click", ev => {
    if (ev.target.closest("#btnExcel")) { exExcel(); return; }
    if (ev.target.closest("#btnInforme")) { exInforme(); return; }
    const imp = ev.target.closest(".ex-imprimir");
    if (imp) exImprimirVista(imp.dataset.vista);
  });
  cuerpo.addEventListener("change", ev => {
    if (ev.target.id === "exAnio") exEstado.anio = { cache: state.cache, valor: Number(ev.target.value) };
  });

  window.addEventListener("beforeprint", exAntesDeImprimir);
  window.addEventListener("afterprint", exDespuesDeImprimir);
  window.addEventListener("hashchange", () => { if (location.hash === "#exportar") exRenderSeguro(); });

  // Como js/16-23: lo cargado cambia cuando se avisa al chip de estado; los
  // años del informe, también al clasificar.
  for (const nombre of ["actualizarChipEstado", "ejecutarClasificacion"]) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__exEnvuelta) continue;
    const envoltura = function () {
      try { return original.apply(this, arguments); } finally { exPedirRepintado(); }
    };
    envoltura.__exEnvuelta = true;
    window[nombre] = envoltura;
  }
  if (location.hash === "#exportar") exRenderSeguro();
})();
