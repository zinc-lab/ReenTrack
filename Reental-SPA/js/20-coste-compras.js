/* =====================================================================
   REENTAL SPA · js/20-coste-compras.js
   Coste de las compras externas: plegable «💶 Coste de las compras externas
   (n)» en 🔍 Revisión, cerrado por defecto.

   Qué hace:
   - Lista las compras bancarias del libro (COMPRA con via_compra
     BANCARIA), una por fila y las más recientes primero, como en
     📒 Transacciones: fecha, inmueble,
     tx, tokens, lo pagado en € y el € por token.
   - Lo pagado se ve como texto, con «✏️ Editar» (nada
     editable a la vista hasta que lo pides). Al pulsarlo se abre la
     casilla, con «Guardar» y «Cancelar»; el € por token se recalcula al
     escribir. Intro guarda y Esc cancela.
   - «Guardar» guarda la compra de su fila: el coste se corrige POR
     COMPRA, no por inmueble. Cada
     coste es un ajuste en ajustes_usuario { coste_eur, nota } con la marca
     «Coste puesto por ti (fecha)», que el motor ya aplica: sin
     reglas nuevas. Guardar el valor por defecto (100 € por
     token) también lo guarda: lo confirma como tuyo y el informe deja de
     marcarlo con «**». Sin coste
     tuyo, la fila dice «por defecto».
   - Una compra con una decisión de Revisión («Compra externa…» o «Dejar
     como Compra») también se edita aquí: solo se le pone coste_eur y sigue
     deshaciéndose en «Movimientos ya decididos». Lo mismo una mandada a
     revisar por ti.
   - Un ajuste de otro origen (p. ej. uno escrito a mano) nunca
     se pisa: su coste se enseña sin «Editar», con una ⓘ.
   - «En USD…» (P15), con la casilla abierta: lo pagado en USD y el día
     del pago (una compra pagada en USDT a Reental y entregada después);
     al escribir, la casilla de € se rellena con el BCE de ese día. Al
     guardar, el ajuste lleva también pagado_usd y fecha_pago_usd: la fila
     dice «500,00 $» con los € al lado, y 📊 la cuenta en $. Guardar solo €
     los quita. El motor solo usa el coste en €.

   Reglas:
   - Guardado con ccGuardarAjustesDecision de js/15 (marcarCacheDirty +
     autoGuardarCache y reclasificación). Nada de almacenamiento del
     navegador. Nunca se inventan costes: solo se escribe lo que pone el
     usuario.
   - Lo escrito y sin guardar se recuerda entre repintados (cbBorrador):
     una compra está abierta mientras tiene algo en el borrador.
   - Reutiliza utilidades de js/02, js/04, js/14, js/15 (ajustes, formatos,
     guardado) y js/18 (txEsCompraBancaria). Se engancha detrás de
     renderCorrecciones (js/15), sin tocar otros módulos; index.html solo
     aporta el esqueleto.
   - Las funciones puras van primero: tests/test_coste_compras_paso_du2i.js
     las carga en Node con vm.
   ===================================================================== */

/* ----------------------------- Utilidades puras ----------------------------- */

/* Sin emojis: la nota se guarda en la cache y otras herramientas la leen. */
const CB_MARCA_COSTE = CC_MARCA_COSTE; // en js/15: deshacer una decisión la usa
const CB_AYUDA_AJENO = "Ajuste manual: se cambia en «✏️ Ajustes en JSON».";
/* Dos costes son el mismo si difieren en menos de medio céntimo. */
const CB_TOLERANCIA = 0.005;

function cbMismoImporte(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < CB_TOLERANCIA;
}
function cbRedondearCentimos(v) {
  return Math.round(v * 100) / 100;
}

const CB_ORDEN = new Intl.Collator("es");

/* ¿Hay algo escrito para esa compra? */
function cbEscrito(borrador, clave) {
  return !!borrador && Object.prototype.hasOwnProperty.call(borrador, clave);
}

/* Las compras bancarias del libro, las más recientes primero (como
   📒 Transacciones). */
function cbComprasBancarias(registros) {
  return (registros || []).filter(txEsCompraBancaria).sort((a, b) =>
    String(b.fecha || "").localeCompare(String(a.fecha || "")) ||
    CB_ORDEN.compare(String(a.inmueble || ""), String(b.inmueble || "")) ||
    String(a.clave).localeCompare(String(b.clave)));
}

/* Estado de una compra frente a los ajustes: "libre" (sin ajuste),
   "propio" (de este editor), "decision" (decidida en Revisión o mandada a
   revisar por ti: solo se le pone coste_eur) o "ajeno"
   (otro ajuste: no se toca). */
function cbEstadoCoste(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  if (!h) return "libre";
  if (ccEsAjusteCoste(h.ajuste)) return "propio";
  if (ccEsAjusteDecision(h.ajuste) || ccAjusteQuePideRevision(h.ajuste) === "revisar") return "decision";
  return "ajeno";
}

/* ¿Lleva el coste de por defecto (sin coste_eur en su ajuste)? Es lo
   que el informe marca con «**» (la misma regla que js/21). */
function cbSupuesto(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  return !h || !pdEsObjeto(h.ajuste) || !("coste_eur" in h.ajuste);
}

/* El coste que se enseña: el del ajuste si lo tiene; si no, el que pone
   el motor (tokens × precio, el € por token por defecto) o, en una de otro
   origen o sin precio, el del registro. Si guardar no pudo
   reclasificar, el registro aún tiene el viejo. */
function cbCosteVisto(reg, ajustes, precio) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  const c = h && pdEsObjeto(h.ajuste) ? Number(h.ajuste.coste_eur) : NaN;
  if (ccEsNumeroPositivo(c)) return c;
  const defecto = Number(reg.cantidad) * Number(precio);
  return ccEsNumeroPositivo(defecto) && cbEstadoCoste(reg, ajustes) !== "ajeno" ? defecto : Number(reg.coste_eur);
}

/* Lo pagado en USD de una compra («En USD…»): { importe, fecha } o null. */
function cbPagadoUsd(reg, ajustes) {
  const h = ccBuscarAjuste(ajustes, reg && reg.clave);
  return h ? ccPagadoUsd(h.ajuste, (state.cache && state.cache.tipos_bce) || {}, state.cache) : null;
}
/* Las filas del editor: [{ reg, estado, coste, supuesto, usd }]. */
function cbFilas(registros, ajustes, precio) {
  return cbComprasBancarias(registros).map(reg => ({ reg, estado: cbEstadoCoste(reg, ajustes),
    coste: cbCosteVisto(reg, ajustes, precio), supuesto: cbSupuesto(reg, ajustes), usd: cbPagadoUsd(reg, ajustes) }));
}

/* Lo escrito, leído como número (NaN si está vacío o no se entiende). */
function cbValorEscrito(texto) {
  const t = String(texto).trim();
  return t === "" ? NaN : ccLeerImporte(t);
}

/* Lo escrito que cambia el coste de una compra editable:
   [{ clave, valor }] (valor = número leído, NaN si no se entiende). Con
   soloClave, solo el de esa compra (la pantalla siempre lo pasa; sin él,
   todas: lo usan los tests). */
function cbCambios(registros, ajustes, borrador, soloClave, precio) {
  const cambios = [];
  for (const reg of cbComprasBancarias(registros)) {
    if (soloClave !== undefined && reg.clave !== soloClave) continue;
    if (!cbEscrito(borrador, reg.clave)) continue;
    if (cbEstadoCoste(reg, ajustes) === "ajeno") continue;
    const valor = cbValorEscrito(borrador[reg.clave]);
    // Guardar el de por defecto lo confirma como tuyo (el informe deja de
    // marcarlo con «**»).
    if (cbSupuesto(reg, ajustes) || !cbMismoImporte(valor, cbCosteVisto(reg, ajustes, precio))) cambios.push({ clave: reg.clave, valor });
  }
  return cambios;
}

/* Ajustes NUEVOS con los costes (no muta los recibidos; lanza si un
   importe no es válido o si la compra ya tiene un ajuste de otro origen).
   precio = € por token por defecto (config). */
function cbAjustesConCostes(ajustes, cambios, registros, precio, fechaISO) {
  const copia = Object.assign({}, pdEsObjeto(ajustes) ? ajustes : {});
  const porClave = new Map((registros || []).map(r => [ccClaveAjuste(r.clave), r]));
  for (const { clave, valor, usd } of cambios || []) {
    const k = ccClaveAjuste(clave);
    const reg = porClave.get(k);
    if (!reg || !txEsCompraBancaria(reg)) throw new Error("Compra no encontrada.");
    // Se mira ya redondeado a céntimos (si no, 0,004 € se guardaría como 0).
    const v = ccEsNumeroPositivo(valor) ? cbRedondearCentimos(valor) : NaN;
    if (!ccEsNumeroPositivo(v)) throw new Error("Escribe un importe mayor que 0.");
    const h = ccBuscarAjuste(copia, clave);
    const estado = cbEstadoCoste(reg, copia);
    if (estado === "ajeno") throw new Error("Ya tiene un ajuste manual: se cambia en «✏️ Ajustes en JSON».");
    // Lo pagado en USD va con él («En USD…»); guardar solo € lo quita.
    const conUsd = a => {
      for (const c of CC_CAMPOS_USD) delete a[c];
      if (usd && ccEsNumeroPositivo(usd.importe)) Object.assign(a, { pagado_usd: usd.importe, fecha_pago_usd: usd.fecha });
      return a;
    };
    if (estado === "decision") {
      // El importe se guarda aunque sea el de por defecto (así el informe
      // deja de marcarlo con «**»).
      copia[h.clave] = conUsd(Object.assign({}, h.ajuste, { coste_eur: v }));
      continue;
    }
    if (h) delete copia[h.clave];
    copia[k] = conUsd(ccAjusteCoste(v, fechaISO));
  }
  return copia;
}

/* «En USD…»: lo pagado en USD el día del pago, en € con el tipo del BCE
   de ese día (o el último anterior, como el motor): { eur, fecha } (la del
   tipo usado) o { error } (vacío mientras no hay nada escrito). */
const CB_SIN_TIPO = "Sin tipo del BCE para ese día.";
let cbEsperaBce = null;
function cbEurDeUsd(texto, fecha, tiposBce, cache) {
  const t = String(texto || "").trim();
  if (!t) return { error: "" };
  const usd = cbRedondearCentimos(ccLeerImporte(t)); // a céntimos: lo mismo que se guarda
  if (!ccEsNumeroPositivo(usd)) return { error: ccAvisoImporte(t) };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ""))) return { error: "Pon el día del pago." };
  // Pasado lo descargado (un pago de ayer o de hoy), el último tipo
  // guardado no vale: el del día aún no se ha pedido (o no está publicado).
  const cob = cache && cache.bce_cobertura;
  if (cob && esFechaBce(cob.fin) && fecha > cob.fin && !ccEsNumeroPositivo(Number((tiposBce || {})[fecha]))) return { error: CB_SIN_TIPO };
  const r = ccEurOrientativo(usd, fecha, tiposBce, cache);
  if (!r) return { error: CB_SIN_TIPO };
  const eur = cbRedondearCentimos(r.eur);
  return eur > 0 ? { eur, fecha: r.fecha } : { error: "Escribe un importe mayor que 0." };
}
/* Un día sin tipo guardado (fuera de lo descargado): se pide al BCE en el
   momento, una vez por día y cache (si falla la red, otra vez al volver a
   escribirlo); desde el 04/01/1999 (el primer tipo) y hasta ayer. Los 7
   días de antes por si ese día no hubo tipo, y hasta lo ya descargado
   (bce_cobertura), sin hueco, que pasa a contar como descargado: si no,
   otro pago de esos días tomaría el tipo de este (y «Actualizar» lo
   cambiaría después). Al guardar la compra se guardan con la cache. true
   si trajo alguno. */
const cbBceIntentado = new Set();
async function cbBajarTipoBce(fecha) {
  const cache = state.cache;
  if (cbBceIntentado.cache !== cache) { cbBceIntentado.clear(); cbBceIntentado.cache = cache; }
  if (!esFechaBce(fecha) || fecha < "1999-01-04" || fecha >= hoyEspana() || cbBceIntentado.has(fecha) || !cache) return false;
  cbBceIntentado.add(fecha);
  const cob = cache.bce_cobertura, hayCob = !!cob && esFechaBce(cob.inicio) && esFechaBce(cob.fin);
  let desde = sumarDias(fecha, -7), hasta = fecha;
  if (hayCob && cob.inicio > hasta) hasta = cob.inicio;
  if (hayCob && cob.fin < desde) desde = cob.fin;
  let nuevos;
  try { nuevos = await descargarTiposBce(desde, hasta); }
  catch (e) { cbBceIntentado.delete(fecha); log("Tipo del BCE del " + fechaEs(fecha) + ": " + e.message, "warn"); return false; }
  if (!Object.keys(nuevos).length) return false;
  cache.tipos_bce = Object.assign(cache.tipos_bce || {}, nuevos);
  if (hayCob) cache.bce_cobertura = { inicio: desde < cob.inicio ? desde : cob.inicio, fin: hasta > cob.fin ? hasta : cob.fin };
  return cache === state.cache; // otra cache abierta mientras llegaba: nada que recalcular
}
/* Lo pagado en USD que se guardaría con lo escrito ({ importe, fecha }):
   con «En USD…» abierto (u), su cuenta (calc) bien y la casilla de € con
   esos €; si no, null. Lo usan «Guardar» y si se activa su botón. */
function cbUsdEscrito(u, calc, valor) {
  return u && calc && calc.eur && cbMismoImporte(valor, calc.eur) ? { importe: cbRedondearCentimos(ccLeerImporte(u.usd)), fecha: u.fecha } : null;
}
const cbMismoUsd = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
/* Lo que dice al lado: «= 909,09 € (BCE del 01/03/2024)» o el error. */
function cbTextoEurDeUsd(calc) {
  return calc && ccEsNumeroPositivo(calc.eur) ? "= " + numEs(calc.eur, 2) + " € (BCE del " + fechaEs(calc.fecha) + ")" : (calc && calc.error) || "";
}

/* € por token de un coste y unos tokens («50,00 €»; por debajo de 1 €,
   con 4 decimales, como el RNT: «0,0300 €»), o «—». */
function cbTextoPorToken(coste, tokens) {
  const c = Number(coste), t = Number(tokens);
  return ccEsNumeroPositivo(c) && ccEsNumeroPositivo(t) ? numEs(c / t, ccDecimalesPrecio(c / t)) + " €" : "—";
}

/* ----------------------------- HTML (puro) ----------------------------- */

/* Un botón de la fila: data-cb = editar, guardar o cancelar. */
function cbBoton(accion, clave, texto, desactivado, ayuda) {
  return '<button type="button" class="cb-accion' + (accion === "guardar" ? " primary" : "") + '" data-cb="' + accion +
    '" data-clave="' + ccEsc(clave) + '"' + (desactivado ? " disabled" : "") + (ayuda ? ' title="' + ccEsc(ayuda) + '"' : "") +
    ">" + texto + "</button>";
}

function cbHtmlFila(f, borrador) {
  const r = f.reg;
  const abierta = f.estado !== "ajeno" && cbEscrito(borrador, r.clave);
  const coste = f.coste;
  const guardado = numEs(coste, 2), fecha = ccFechaVer(r);
  // El inmueble o, en el RNT (P11), su símbolo (sin rellenar `inmueble`:
  // 📊 lo contaría como uno).
  const nombre = txActivo(r);
  const texto = abierta ? String(borrador[r.clave]) : guardado;
  const valor = abierta ? cbValorEscrito(texto) : coste;
  let pagado, acciones = "";
  // Pagada en USD: «500,00 $» y, al lado y más pequeño, sus €.
  const fijo = f.usd ? '<span class="cb-fijo">' + ccEsc(numEs(f.usd.importe, 2)) + ' $</span> <span class="cb-en-eur">' + ccEsc(guardado) + " €</span>"
    : '<span class="cb-fijo">' + ccEsc(guardado) + " €</span>";
  if (f.estado === "ajeno") {
    pagado = fijo + " " + ccInfo(CB_AYUDA_AJENO);
  } else if (abierta) {
    // También cambia si solo cambia lo pagado en USD (mismos €).
    const cambia = !cbMismoImporte(valor, coste) || !cbMismoUsd(cbUsdEscrito(f.usdt, f.usdt && f.usdt.calc, valor), f.usd);
    pagado = '<input type="text" inputmode="decimal" class="cb-valor" data-clave="' + ccEsc(r.clave) + '" value="' +
      ccEsc(texto) + '" aria-label="' + ccEsc("Pagado en € · " + nombre + " · " + (fecha || "")) + '"> €';
    acciones = cbBoton("guardar", r.clave, "Guardar", !cambia && !f.supuesto) + cbBoton("cancelar", r.clave, "Cancelar") +
      cbBoton("usdt", r.clave, "En USD…", false, "Pagado en USD, USDT o USDC.");
  } else {
    // El de por defecto ya no lo dice la fila (lo dice la explicación de arriba; en el informe lleva «**»).
    pagado = fijo;
    acciones = cbBoton("editar", r.clave, "✏️ Editar");
  }
  return '<tr class="cb-fila' + (abierta ? " abierta" : "") + '" data-clave="' + ccEsc(r.clave) + '">' +
    "<td>" + ccEsc(fecha || "sin fecha") + "</td>" +
    "<td>" + ccEsc(nombre || "—") + "</td>" +
    "<td>" + ccEnlaceHash(r.hash) + "</td>" +
    '<td class="num">' + ccEsc(ccCantidad(Number(r.cantidad))) + "</td>" +
    '<td class="num">' + pagado + "</td>" +
    '<td class="num cb-por-token">' + ccEsc(cbTextoPorToken(valor, r.cantidad)) + "</td>" +
    '<td class="cb-acciones">' + acciones + "</td></tr>" +
    (abierta && f.usdt ? cbHtmlUsdt(r, f.usdt) : "");
}
/* Debajo de la fila abierta: «Pagado [ ] USD el [día]  = … € (BCE del …)».
   u = { usd, fecha, calc }. */
function cbHtmlUsdt(r, u) {
  const c = ccEsc(r.clave);
  return '<tr class="cb-usdt" data-clave="' + c + '"><td colspan="7">' +
    '<label>Pagado <input type="text" inputmode="decimal" class="cb-usd" data-clave="' + c + '" value="' + ccEsc(u.usd || "") +
    '" aria-label="Pagado en USD"> USD</label> <label>el <input type="date" class="cb-usd-fecha" data-clave="' + c + '" value="' +
    ccEsc(u.fecha || "") + '" aria-label="Día del pago"></label> <span class="cb-usd-eur" aria-live="polite">' +
    ccEsc(cbTextoEurDeUsd(u.calc)) + "</span></td></tr>";
}

/* El contenido del plegable. Lo de «100 €/token por defecto» lo dice la
   explicación del apartado, en index.html (aquí no se repite). */
function cbHtmlEditor(filas, borrador) {
  if (!filas.length) return '<p class="help">Sin compras externas.</p>';
  return '<div class="cb-caja"><table class="cb-tabla"><thead><tr><th>Fecha</th><th>Inmueble / <br>Token</th><th>Tx</th><th class="num">Tokens</th>' +
    '<th class="num">Pagado</th><th class="num">€ por token</th><th></th></tr></thead><tbody>' +
    filas.map(f => cbHtmlFila(f, borrador)).join("") +
    "</tbody></table></div>";
}

/* ----------------------------- Sesión y DOM ----------------------------- */

/* Lo escrito y sin guardar: { clave: texto }. */
let cbBorrador = {};
/* «En USD…» abierto: { clave: { usd, fecha, antes } } (antes = la
   casilla de € al abrirlo). */
let cbUsdt = {};

function cbAjustesSesion() {
  return (state.cache && state.cache.ajustes_usuario) || {};
}
/* € por token por defecto: el de la config o, si no es válido, el fijo de
   js/04 (el mismo número en la cabecera y al ver si se vuelve a él). */
function cbPrecioSesion() {
  const p = Number(state.config && state.config.compra_bancaria_coste_eur_por_token);
  return ccEsNumeroPositivo(p) ? p : COSTE_BANCARIA_EUR_POR_TOKEN;
}

function renderCosteCompras() {
  if (typeof document === "undefined") return;
  const cont = $("cbCuerpo");
  if (!cont) return;
  cbInyectarEstilos();
  const registros = ccRegistrosSesion();
  const ajustes = cbAjustesSesion();
  const filas = cbFilas(registros, ajustes, cbPrecioSesion());
  /* Lo escrito de una compra que ya no está (otra cache) se olvida. */
  const vivas = new Set(filas.map(f => f.reg.clave));
  for (const c of Object.keys(cbBorrador)) if (!vivas.has(c)) delete cbBorrador[c];
  for (const c of Object.keys(cbUsdt)) if (!cbEscrito(cbBorrador, c)) delete cbUsdt[c];
  for (const f of filas) {
    const u = cbUsdt[f.reg.clave];
    if (u) f.usdt = Object.assign({ calc: cbEurDeUsd(u.usd, u.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache) }, u);
  }
  const n = $("cbCount");
  if (n) n.textContent = String(vivas.size);
  // Su estado en la lista de tareas de 🔍 (P21): las que aún llevan el de
  // por defecto (las que el informe marca con «**», también las de un ajuste ajeno).
  const sin = filas.filter(f => f.supuesto).length;
  const aviso = $("cbCosteAviso");
  if (aviso) aviso.textContent = sin ? "⚠ " + sin + " sin coste" : "";
  cont.innerHTML = cbHtmlEditor(filas, cbBorrador);
}
function cbRenderSeguro() {
  try { renderCosteCompras(); }
  catch (e) { console.error("Coste de las compras (js/20-coste-compras.js):", e); }
}

/* La casilla de una compra en la pantalla. */
function cbCasilla(clave) {
  return document.querySelector('#cbCuerpo .cb-valor[data-clave="' + CSS.escape(clave) + '"]');
}

/* «✏️ Editar»: abre la casilla con lo guardado, con el cursor dentro. */
function cbAbrir(clave) {
  const reg = ccRegistrosSesion().find(r => r.clave === clave);
  if (!reg) return;
  cbBorrador[clave] = numEs(cbCosteVisto(reg, cbAjustesSesion(), cbPrecioSesion()), 2);
  // Pagada en USD: «En USD…» abierto con lo que pusiste.
  const usd = cbPagadoUsd(reg, cbAjustesSesion());
  if (usd) cbUsdt[clave] = { usd: numEs(usd.importe, 2), fecha: usd.fecha, antes: cbBorrador[clave] };
  renderCosteCompras();
  const input = cbCasilla(clave);
  if (input) { input.focus(); input.select(); }
}
/* El foco, al «✏️ Editar» de esa fila (si no, al repintar se va al
   principio de la página). Solo si no estás ya en otro sitio (guardar
   tarda y entretanto puedes escribir en otra parte). */
function cbFocoEditar(clave) {
  const a = document.activeElement;
  if (a && a !== document.body && !a.closest("#cbCuerpo")) return;
  const btn = document.querySelector('#cbCuerpo [data-cb="editar"][data-clave="' + CSS.escape(clave) + '"]');
  if (btn) btn.focus();
}
/* «En USD…»: abre debajo lo pagado en USD y el día (de entrada, el de la
   compra), con el cursor en el importe; otra pulsación lo cierra. */
function cbAbrirUsdt(clave) {
  if (cbUsdt[clave]) { delete cbUsdt[clave]; renderCosteCompras(); return; }
  const reg = ccRegistrosSesion().find(r => r.clave === clave);
  cbUsdt[clave] = { usd: "", fecha: (reg && ccFechaDiaNorm(reg.fecha)) || "", antes: cbEscrito(cbBorrador, clave) ? String(cbBorrador[clave]) : "" };
  renderCosteCompras();
  const input = document.querySelector('#cbCuerpo .cb-usd[data-clave="' + CSS.escape(clave) + '"]');
  if (input) input.focus();
}
/* «Cancelar» o Esc: se cierra sin guardar. */
function cbCerrar(clave) {
  delete cbBorrador[clave];
  delete cbUsdt[clave];
  renderCosteCompras();
  cbFocoEditar(clave);
}

/* «Guardar» o Intro: guarda la compra de esa fila y la cierra. Sin cambio,
   solo la cierra. */
async function cbGuardar(clave) {
  if (!state.cache) return toast(CC_SIN_CACHE, "warn");
  // Ya guardada (un segundo Intro o clic mientras se guarda): nada que hacer.
  if (!Object.prototype.hasOwnProperty.call(cbBorrador, clave)) return;
  const registros = ccRegistrosSesion();
  const ajustes = cbAjustesSesion();
  const cambios = cbCambios(registros, ajustes, cbBorrador, clave, cbPrecioSesion());
  // Con «En USD…» abierto y la casilla en sus €: se guarda también lo pagado en USD.
  const u = cbUsdt[clave], calc = u && cbEurDeUsd(u.usd, u.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache);
  const usd = cbUsdEscrito(u, calc, cbValorEscrito(cbBorrador[clave]));
  const reg = registros.find(r => r.clave === clave), antes = reg && cbPagadoUsd(reg, ajustes);
  if (!cambios.length && !cbMismoUsd(usd, antes)) cambios.push({ clave, valor: cbValorEscrito(cbBorrador[clave]) });
  for (const c of cambios) c.usd = usd;
  if (!cambios.length) return cbCerrar(clave);
  let nuevos;
  try { nuevos = cbAjustesConCostes(ajustes, cambios, registros, cbPrecioSesion(), ahoraLocalISO()); }
  catch (e) {
    // Con «En USD…» abierto y algo mal allí (sin tipo del BCE, sin día…), ese es el aviso.
    const u = cbUsdt[clave], deUsd = u && cbEurDeUsd(u.usd, u.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache).error;
    return toast(deUsd || (Number.isNaN(cambios[0].valor) ? ccAvisoImporte(String(cbBorrador[clave])) : e.message), "error");
  }
  delete cbBorrador[clave];
  delete cbUsdt[clave];
  await ccGuardarAjustesDecision(nuevos, "Coste guardado.");
  cbFocoEditar(clave);
}

/* Al escribir: se recuerda, se recalcula el € por token de la fila y se
   activa su «Guardar» sin repintar (no se pierde el foco). */
function cbMontarEventos() {
  const cont = $("cbCuerpo");
  if (!cont || cont.__cbEventos) return;
  cont.__cbEventos = true;
  // Lo escrito en la casilla de €: el € por token y el «Guardar» de la fila.
  const alEscribir = input => {
    const clave = input.getAttribute("data-clave");
    cbBorrador[clave] = input.value;
    const registros = ccRegistrosSesion();
    const reg = registros.find(r => r.clave === clave);
    const fila = input.closest("tr");
    const celda = fila && fila.querySelector(".cb-por-token");
    if (reg && celda) celda.textContent = cbTextoPorToken(cbValorEscrito(input.value), reg.cantidad);
    const btn = fila && fila.querySelector('[data-cb="guardar"]');
    if (btn) {
      const u = cbUsdt[clave], calc = u && cbEurDeUsd(u.usd, u.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache);
      btn.disabled = cbCambios(registros, cbAjustesSesion(), cbBorrador, clave, cbPrecioSesion()).length === 0 &&
        cbMismoUsd(cbUsdEscrito(u, calc, cbValorEscrito(input.value)), reg && cbPagadoUsd(reg, cbAjustesSesion()));
    }
  };
  // «En USD…»: lo pagado y el día → la casilla de €.
  const alEscribirUsd = input => {
    const clave = input.getAttribute("data-clave");
    const sub = input.closest("tr");
    const u = cbUsdt[clave] = Object.assign(cbUsdt[clave] || { antes: "" }, { usd: sub.querySelector(".cb-usd").value,
      fecha: sub.querySelector(".cb-usd-fecha").value });
    const calc = cbEurDeUsd(u.usd, u.fecha, (state.cache && state.cache.tipos_bce) || {}, state.cache);
    sub.querySelector(".cb-usd-eur").textContent = cbTextoEurDeUsd(calc);
    // La casilla sigue a los USD: con un importe, sus €; con uno que no
    // vale, vacía (si no, se quedaría lo de una tecla antes: «1000» de
    // «1000.5»); sin nada escrito, lo que tenía al abrir «En USD…».
    const casilla = cbCasilla(clave);
    if (!casilla) return;
    casilla.value = calc.eur ? numEs(calc.eur, 2) : calc.error ? "" : u.antes;
    alEscribir(casilla);
    // Sin tipo ese día: se pide al BCE (con una pausa: la fecha cambia
    // con cada número que se escribe) y se recalcula si sigue ese día.
    if (calc.error === CB_SIN_TIPO) {
      clearTimeout(cbEsperaBce);
      const dia = u.fecha;
      cbEsperaBce = setTimeout(async () => {
        // Si mientras tanto cambió el día o escribiste los € a mano (eso
        // borra el aviso), no se toca lo tuyo.
        if (!(await cbBajarTipoBce(dia)) || !sub.isConnected || sub.querySelector(".cb-usd-fecha").value !== dia ||
            sub.querySelector(".cb-usd-eur").textContent !== CB_SIN_TIPO) return;
        alEscribirUsd(input);
      }, 400);
    }
  };
  const esDe = (el, ...clases) => !!el.classList && clases.some(c => el.classList.contains(c));
  cont.addEventListener("input", e => {
    if (esDe(e.target, "cb-valor")) {
      alEscribir(e.target);
      // Escrita a mano: la cuenta de «En USD…» ya no es lo que se guarda.
      const sub = e.target.closest("tr").nextElementSibling;
      if (sub && sub.classList.contains("cb-usdt")) sub.querySelector(".cb-usd-eur").textContent = "";
    }
    else if (esDe(e.target, "cb-usd", "cb-usd-fecha")) alEscribirUsd(e.target);
  });
  cont.addEventListener("keydown", e => {
    const input = e.target;
    if (!esDe(input, "cb-valor", "cb-usd", "cb-usd-fecha")) return;
    const clave = input.getAttribute("data-clave");
    if (e.key === "Enter") { e.preventDefault(); cbGuardar(clave); }
    else if (e.key === "Escape") { e.preventDefault(); cbCerrar(clave); }
  });
  cont.addEventListener("click", e => {
    const btn = ccBotonDe(e, "[data-cb]");
    if (!btn || btn.disabled) return;
    const clave = btn.getAttribute("data-clave");
    const accion = btn.getAttribute("data-cb");
    if (accion === "editar") cbAbrir(clave);
    else if (accion === "cancelar") cbCerrar(clave);
    else if (accion === "guardar") cbGuardar(clave);
    else if (accion === "usdt") cbAbrirUsdt(clave);
  });
}

/* Estilos (una vez), solo con variables de color del tema. */
function cbInyectarEstilos() {
  if ($("estiloCoste20")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloCoste20";
  estilo.textContent = [
    /* En un móvil la tabla scrollea en su caja, nunca la página. */
    ".cb-caja{overflow-x:auto}",
    /* Como la tabla de 📒 Transacciones: sin
       cuadrícula, solo una raya fina entre filas, y algo más alta. */
    ".cb-tabla{width:auto;margin:14px auto 0;font-size:13.5px}",
    ".cb-tabla td,.cb-tabla th{padding:11px 14px;border:0;border-bottom:1px solid color-mix(in srgb,var(--border) 80%,var(--border2));vertical-align:middle;white-space:nowrap}",
    ".cb-tabla th,.cb-tabla th.num{border-bottom:1px solid var(--border2);font-size:13.5px;text-align:center}",
    ".cb-tabla tbody td{height:50px;padding-top:6px;padding-bottom:6px}", // la misma altura con casilla o sin ella
    ".cb-tabla tbody tr:hover{background:var(--panel2)}",
    ".cb-tabla .num{text-align:right;font-variant-numeric:tabular-nums}",
    ".cb-defecto{color:var(--muted);font-size:12.5px;font-weight:400}",
    ".cb-en-eur{color:var(--muted);font-size:12px;margin-left:4px}",
    ".cb-valor{width:120px;text-align:right;padding:6px 10px;font-size:13.5px}",
    ".cb-acciones{text-align:left}",
    // Editando caben sus tres botones en una línea (la tabla no se sale a 1366 px).
    ".cb-tabla td.cb-acciones{padding-left:8px;padding-right:8px}",
    ".cb-accion{font-size:13px;padding:5px 10px;border-radius:8px}",
    ".cb-accion+.cb-accion{margin-left:6px}",
    ".cb-tabla tr.cb-usdt td{height:auto;padding:4px 10px 12px;text-align:right;color:var(--muted)}",
    ".cb-usdt label{display:inline-flex;align-items:center;gap:6px;margin-left:10px}",
    ".cb-usdt input.cb-usd{width:110px;text-align:right;padding:5px 8px;font-size:13.5px}",
    ".cb-usdt input.cb-usd-fecha{width:150px;padding:4px 6px;font-size:13.5px}",
    ".cb-usd-eur{display:inline-block;min-width:230px;margin-left:10px;text-align:left;color:var(--text)}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Enganche -----------------------------
   Detrás de renderCorrecciones (js/15), que ya se repinta tras cargar,
   guardar o clasificar y al volver a #revision. */
(function montarCosteCompras() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const original = window.renderCorrecciones;
  if (typeof original === "function" && !original.__cbEnvuelta) {
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      cbRenderSeguro();
      return resultado;
    };
    envoltura.__cbEnvuelta = true;
    window.renderCorrecciones = envoltura;
  }
  cbMontarEventos();
  cbRenderSeguro(); // el DOM ya existe: los scripts van al final del <body>
})();
