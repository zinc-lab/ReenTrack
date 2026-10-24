/* =====================================================================
   REENTAL SPA · js/29-tour.js
   El ejemplo: un recorrido por la app con datos inventados (driver.js,
   js/00). Se ofrece la primera vez (js/19, sin nada guardado) y desde
   📖 Ayuda. Mientras dura no se guarda nada ni sale nada a internet; al
   terminar, la página se recarga y queda como estaba.
===================================================================== */

const TOUR_VISTO = "reental_tour_visto";   // ya se ofreció: no vuelve a salir solo

/* La primera vez, sin nada guardado ni tu wallet: «Ver un ejemplo» o
   «Empezar con mis datos». Un navegador manejado por un programa (las
   pruebas) no la ve: taparía la página a los arneses de siempre. */
function tourOfrecer() {
  const dlg = $("tourDlg");
  if (navigator.webdriver || state.config.wallet) return;
  try { if (localStorage.getItem(TOUR_VISTO)) return; localStorage.setItem(TOUR_VISTO, "1"); } catch (e) { return; }
  // El botón pulsado al enviarse (como #arrDlgOlvidar, js/19): «close» no llega en una pestaña sin pintar.
  dlg.querySelector("form").onsubmit = e => { if (e.submitter && e.submitter.value === "ejemplo") tourEmpezar(); };
  dlg.showModal();
}

/* Desde aquí nada se guarda ni se borra (IndexedDB y localStorage; también
   «🧹 Olvidar todo») ni sale a internet: lo deshace la recarga del final. */
function tourSinGuardar() {
  const idb = idbOperar;
  idbOperar = (modo, operacion) => modo === "readwrite" ? Promise.resolve() : idb(modo, operacion);
  Storage.prototype.setItem = Storage.prototype.removeItem = Storage.prototype.clear = () => {};
  window.fetch = () => Promise.reject(new Error("Ejemplo: sin internet"));
}

/* La cartera inventada: tres inmuebles comprados en 2024 y 2025 (compras
   externas a 100 €/token), sus repartos, y para 🔍 un RNT de una preventa,
   una venta por vincular y un token con dudas. */
function tourMontarEjemplo() {
  const W = "0x" + "e1".repeat(20), REENTAL = "0x" + "e7".repeat(20), COMPRADOR = "0x" + "ec".repeat(20),
    PREVENTA = "0x" + "e5".repeat(20), OTRO = "0x" + "e9".repeat(20);
  const ts = (y, m, d) => String(Math.floor(Date.UTC(y, m - 1, d, 10) / 1000));
  const t18 = u => (BigInt(Math.round(u * 1e6)) * 10n ** 12n).toString();
  const pal = h => h.padStart(64, "0");
  const INMUEBLES = [["Ejemplo Málaga 1", "EJM1"], ["Ejemplo Valencia 2", "EJV2"], ["Ejemplo Madrid 3", "EJD3"]];
  const contrato = i => "0x" + ("d" + i).repeat(20);
  let n = 0;
  const mov = (from, to, c, value, nombre, simbolo, dec, t) => ({ blockNumber: String(100 + ++n), timeStamp: t,
    hash: "0x" + String(n).padStart(4, "0") + "e0".repeat(30), from, to, contractAddress: c, value, tokenName: nombre, tokenSymbol: simbolo, tokenDecimal: dec });
  const movInmueble = (from, to, i, unidades, t) => mov(from, to, contrato(i), t18(unidades), "Reental " + INMUEBLES[i][0], INMUEBLES[i][1], "18", t);
  state.config = { wallet: W, vault: "", compra_bancaria_coste_eur_por_token: 100.0, etherscan_api_key: "EJEMPLO" };
  const cache = cacheVacia(), tokens = cache.transacciones.wallet_tokens;
  INMUEBLES.forEach(([nombre, simbolo], i) => {
    cache.catalogo_propiedades[contrato(i)] = { estado: "CONFIRMADA", nombre_reental: nombre, simbolo, primera_aparicion: "2024-03-01", refuerzos: ["nombre_csv"] };
    tokens.push(movInmueble(REENTAL, W, i, 10 + 5 * i, ts(2024, 3, 1 + i)));
  });
  tokens.push(movInmueble(REENTAL, W, 0, 5, ts(2025, 2, 3)));
  // La venta: los tokens salen y el cobro en USDC llega una semana después.
  tokens.push(movInmueble(W, COMPRADOR, 1, 4, ts(2026, 6, 18)));
  tokens.push(mov(COMPRADOR, W, USDC, (452.3e6).toString(), "USD Coin", "USDC", "6", ts(2026, 6, 25)));
  // El RNT de la preventa, reclamado por la wallet: claim(index, cuenta, cantidad, prueba).
  const rnt = mov(PREVENTA, W, RNT, t18(3000), "Reental", "RNT", "18", ts(2025, 5, 12));
  tokens.push(rnt);
  cache.transacciones.wallet_normales.push({ blockNumber: rnt.blockNumber, timeStamp: rnt.timeStamp, hash: rnt.hash, from: W, to: PREVENTA,
    value: "0", gasUsed: "0", gasPrice: "0", isError: "0", txreceipt_status: "1",
    input: "0x2e7ba6ef" + pal("7") + pal(W.slice(2)) + pal(BigInt(t18(3000)).toString(16)) + pal("80") + pal("0") });
  cache.precios_rnt["2025-05-12"] = 0.06;
  cache.catalogo_propiedades[contrato(9)] = { estado: "CANDIDATA", nombre_reental: "", simbolo: "RXYZ" };
  tokens.push(mov(OTRO, W, contrato(9), t18(1), "Reental XYZ", "RXYZ", "18", ts(2026, 8, 2)));
  for (let f = "2024-01-01", hoy = hoyEspana(); f <= hoy; f = sumarDias(f, 1)) cache.tipos_bce[f] = 1.1;
  state.cache = cache;
  const filas = ["dividend,date,reinvested,claimed,distributed,retained,reinvests,claims,wallet"];
  let h = 0;
  for (const [y, m] of [[2024, 6], [2024, 12], [2025, 6], [2025, 12], [2026, 6]]) {
    INMUEBLES.forEach(([nombre], i) => filas.push("\"" + nombre + "#" + y + "-" + m + "\"," + y + "-" + String(m).padStart(2, "0") + "-10," +
      (4 + i) + ",0," + (4 + i) + ",0,\"['0x" + String(++h).padStart(64, "0") + "']\",\"[]\"," + W));
  }
  const csv = cargarCsvRendimientos(filas.join("\n"));
  state.filasCsv = csv.filas; state.indicePorHash = csv.indicePorHash; state.csvCargado = true;
}

/* Las paradas, en el orden en que se usa la app. `pestana` se abre antes de
   señalar; sin `element`, la burbuja va en el centro. */
const TOUR_COMPRA = '#ccLista [data-opcion="compra"]';
// Al cambiar de pestaña, primero su botón del menú; después, lo de dentro.
const tourMenu = (pestana, title, description) => ({ pestana, element: '#navPrincipal a[href="#' + pestana + '"]', popover: { title, description, side: "right" } });
const TOUR_PASOS = [
  { popover: { title: "Ejemplo", description: "Datos inventados para ver cómo funciona. Al terminar, la app queda como estaba." } },
  tourMenu("inicio", "🚀 Puesta en marcha", "Aquí se empieza: tus datos, el archivo de Reental y tus copias."),
  { pestana: "inicio", element: "#arrDatos", popover: { title: "Tus datos", description: "Tu wallet y tu API key de Etherscan. Con las dos, la descarga empieza sola." } },
  { pestana: "inicio", element: "#dzCsv", popover: { title: "Archivo de Reental", description: "El archivo de rendimientos que descargas de la web de Reental." } },
  { pestana: "inicio", element: "#arrPreparar", popover: { title: "🔄 Actualizar", description: "Para tenerla al día, pulsa aquí y añade el último archivo de Reental." } },
  tourMenu("revision", "🔍 Revisión", "Lo que la app no puede decidir sola. Hay que dejarla sin nada pendiente."),
  { pestana: "revision", element: ".rv-tareas", popover: { title: "Las tareas", description: "Una fila por tarea. Verde: al día; ámbar: falta algo." } },
  { pestana: "revision", element: () => [...document.querySelectorAll("#rvCatalogo[open] tr")].find(tr => tr.textContent.includes(PN_ESTADOS.CANDIDATA)),
    popover: { title: "Catálogo de inmuebles", description: "Empieza por aquí: es lo que más limpia. Un token con dudas: «✔ Confirmar» si es un inmueble, «🚫 Descartar» si no." } },
  // Pulsarlo avanza (tourEmpezar); «Siguiente» lo pulsa por ti si sigue ahí.
  { pestana: "revision", element: TOUR_COMPRA,
    popover: { title: "Compra externa", description: "Compraste tokens fuera de tu wallet (transferencia, exchange…) y la app no ve el pago. Pulsa «Compra externa…».",
      onNextClick: (el, paso, o) => { const b = document.querySelector(TOUR_COMPRA); if (b) b.click(); else o.driver.moveNext(); } } },
  { pestana: "revision", element: () => [...document.querySelectorAll("#cbCoste[open] tr.cb-fila")].find(f => [...f.cells].some(td => td.textContent.trim() === "RNT")),
    waitForElement: 3000, skipMissingElement: true,
    popover: { title: "💶 Coste", description: "Pon lo que pagaste y pulsa Intro. Si llegó en varias entregas, «Calcular el precio por token»." } },
  { pestana: "revision", element: () => document.querySelector('#ccLista [data-opcion="venta"]')?.closest(".cc-item"), popover: { title: "Venta", description: "«Es una venta…» y pones lo cobrado, en USD o en €, o eliges el cobro recibido." } },
  { pestana: "revision", element: "#ccResueltos", popover: { title: "Ya decididos", description: "Todo lo que decides aquí se puede cambiar o deshacer." } },
  tourMenu("dashboard", "📊 Dashboard", "Tu cartera de un vistazo."),
  { pestana: "dashboard", element: "#tarjetaMetricas .dash-metrics", popover: { title: "Las cifras", description: "Lo principal arriba; debajo, lo invertido, lo cobrado y los gráficos." } },
  { pestana: "dashboard", element: "#tarjetaMetricas .dash-nominal-fila", popover: { title: "Valor nominal",
    description: "Enciéndelo para ver tus tokens a 100 € o 100 $ cada uno, como los cuenta la web de Reental." } },
  tourMenu("transacciones", "📒 Transacciones", "Todos tus movimientos."),
  { pestana: "transacciones", element: "#txFiltros", popover: { title: "Filtros", description: "Busca por tipo, año, inmueble o texto. En cada movimiento puedes escribir una nota." } },
  tourMenu("rendimientos", "💰 Rendimientos", "Cada reparto de Reental: lo cobrado, lo retenido y lo pendiente."),
  tourMenu("fiscal", "🧾 Fiscal", "Lo que hay que declarar, por ejercicio."),
  { pestana: "fiscal", element: "#fiCuerpo .fi-cabecera", popover: { title: "El año", description: "Elige aquí el ejercicio." } },
  tourMenu("exportar", "📤 Exportar", "El Excel con todos tus años, el informe en PDF e imprimir."),
  { element: '#navPrincipal a[href="#ayuda"]', popover: { title: "📖 Ayuda", description: "La ayuda de la app. Desde aquí puedes volver a ver este ejemplo.", side: "right" } },
  { popover: { title: "Fin del ejemplo", description: "Ahora, en 🚀 Puesta en marcha, con tus datos.", doneBtnText: "Empezar" } },
];

async function tourEmpezar() {
  await autoGuardarCache();   // lo tuyo, guardado antes de apartarlo
  const volver = location.hash || "#dashboard";
  // Salir (✕, Esc o «Empezar»): la recarga trae lo guardado, tal como estaba.
  const salir = destino => { location.hash = destino; location.reload(); };
  tourSinGuardar();
  tourMontarEjemplo();
  volcarConfigAFormulario();
  arrClasificarAhora();
  actualizarChipEstado();
  document.querySelectorAll("#toasts .toast").forEach(t => t.remove());
  const ir = (drv, d) => {
    const i = drv.getActiveIndex() + d, paso = TOUR_PASOS[i];
    if (!paso) { salir("#inicio"); return; }
    if (!paso.pestana || location.hash === "#" + paso.pestana) { drv.moveTo(i); return; }
    // Con la pestaña ya pintada: los oyentes de la app se registraron antes que este.
    addEventListener("hashchange", () => drv.moveTo(i), { once: true });
    location.hash = "#" + paso.pestana;
  };
  const drv = window.driver.js.driver({
    steps: TOUR_PASOS,
    animate: !document.documentElement.classList.contains("sin-animaciones"),
    showProgress: true, progressText: "{{current}} de {{total}}",
    nextBtnText: "Siguiente", prevBtnText: "Anterior", closeBtnLabel: "Salir del ejemplo",
    overlayClickBehavior: "none", popoverClass: "tour-pop", stageRadius: 10,
    onNextClick: (el, paso, o) => ir(o.driver, 1),
    onPrevClick: (el, paso, o) => ir(o.driver, -1),
    onDestroyStarted: () => salir(volver),
  });
  // «Compra externa…» pulsado (ratón, teclado o «Siguiente»): a su fila de 💶. En
  // la página entera, porque la app puede repintar el botón mientras se señala.
  document.addEventListener("click", e => {
    if (drv.getActiveStep() && drv.getActiveStep().element === TOUR_COMPRA && e.target.closest(TOUR_COMPRA)) setTimeout(() => drv.moveNext(), 300);
  }, true);
  drv.drive();
}

(function montarTour() {
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    const btn = $("tourVer");
    if (btn) btn.addEventListener("click", tourEmpezar);
    const estilo = document.createElement("style");
    estilo.textContent = [
      /* driver.css 1.9.0, tal cual */
      '.driver-popover{all:unset;font-family:var(--driver-popover-font-family,"Helvetica Neue", Inter, ui-sans-serif, "Apple Color Emoji", Helvetica, Arial, sans-serif);box-sizing:border-box;color:#2d2d2d;z-index:1000000000;background-color:#fff;border-radius:5px;min-width:250px;max-width:300px;margin:0;padding:15px;position:fixed;top:0;right:0;box-shadow:0 1px 10px #0006}.driver-popover-title{zoom:1;margin:0;font-size:19px;font-weight:700;line-height:1.5;display:block;position:relative}.driver-popover-close-btn{all:unset;cursor:pointer;color:#d2d2d2;z-index:1;text-align:center;width:32px;height:28px;font-size:18px;font-weight:500;transition:color .2s;position:absolute;top:0;right:0}.driver-popover-close-btn:hover,.driver-popover-close-btn:focus{color:#2d2d2d}.driver-popover-title[style*=block]+.driver-popover-description{margin-top:5px}.driver-popover-description{zoom:1;margin-bottom:0;font-size:14px;font-weight:400;line-height:1.5}.driver-popover-footer{text-align:right;zoom:1;justify-content:space-between;align-items:center;margin-top:15px;display:flex}.driver-popover-progress-text{color:#727272;zoom:1;font-size:13px;font-weight:400}.driver-popover-footer-btn{all:unset;box-sizing:border-box;color:#2d2d2d;cursor:pointer;zoom:1;background-color:#fff;border:1px solid #ccc;border-radius:3px;outline:0;padding:3px 7px;font-size:12px;line-height:1.3;text-decoration:none;display:inline-block}.driver-popover-footer .driver-popover-btn-disabled{opacity:.5;pointer-events:none}.driver-popover-footer-btn:hover,.driver-popover-footer-btn:focus{background-color:#f7f7f7}.driver-popover-navigation-btns{flex-grow:1;justify-content:flex-end;display:flex}.driver-popover-navigation-btns button+button{margin-left:4px}.driver-popover-arrow{content:"";border:5px solid #fff;position:absolute}.driver-popover-arrow-side-over{display:none}.driver-popover-arrow-side-left{border-top-color:#0000;border-bottom-color:#0000;border-right-color:#0000;left:100%}.driver-popover-arrow-side-right{border-top-color:#0000;border-bottom-color:#0000;border-left-color:#0000;right:100%}.driver-popover-arrow-side-top{border-bottom-color:#0000;border-left-color:#0000;border-right-color:#0000;top:100%}.driver-popover-arrow-side-bottom{border-top-color:#0000;border-left-color:#0000;border-right-color:#0000;bottom:100%}.driver-popover-arrow-side-center,.driver-popover-arrow-none{display:none}.driver-active .driver-overlay{pointer-events:none}.driver-active.driver-no-scroll{overflow:hidden}.driver-active *{pointer-events:none}.driver-active .driver-active-element,.driver-active .driver-active-element *,.driver-popover,.driver-popover *{pointer-events:auto}@keyframes animate-fade-in{0%{opacity:0}to{opacity:1}}.driver-fade .driver-overlay{animation:animate-fade-in var(--driver-animation-duration,.4s) ease-in-out}.driver-fade .driver-popover{animation:animate-fade-in var(--driver-animation-duration,.4s)}.driver-active-element-parent-no-scroll{overflow:hidden!important}.driver-no-interaction,.driver-no-interaction *{pointer-events:none!important}',
      /* La burbuja con los colores y los botones de la app (claro y oscuro). */
      ".driver-popover.tour-pop{font-family:inherit;background:var(--tarjeta);color:var(--text);border:1px solid var(--border);border-radius:12px;max-width:340px;padding:16px 18px}",
      ".tour-pop .driver-popover-title{font-size:16px}",
      ".tour-pop .driver-popover-progress-text{color:var(--muted)}",
      ".tour-pop .driver-popover-close-btn{color:var(--muted)}",
      ".tour-pop .driver-popover-footer button{font-size:13px;font-weight:600;border:1px solid var(--btn-bd);background:var(--panel);color:var(--text);border-radius:10px;padding:6px 12px;cursor:pointer}",
      ".tour-pop .driver-popover-footer .driver-popover-next-btn{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}",
      ".tour-pop .driver-popover-arrow-side-left{border-left-color:var(--tarjeta)}",
      ".tour-pop .driver-popover-arrow-side-right{border-right-color:var(--tarjeta)}",
      ".tour-pop .driver-popover-arrow-side-top{border-top-color:var(--tarjeta)}",
      ".tour-pop .driver-popover-arrow-side-bottom{border-bottom-color:var(--tarjeta)}",
    ].join("\n");
    document.head.appendChild(estilo);
  });
})();
