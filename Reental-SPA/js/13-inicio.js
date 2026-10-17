/* =====================================================================
   REENTAL SPA · js/13-inicio.js
   Arranque de la aplicación: routing hash-based, montaje de todos los
   eventos e inicialización. Este archivo SIEMPRE debe cargarse el último.
   La config se guarda sola al escribirla. El coste de compra externa es
   fijo: se aplica también a la copia del navegador al arrancar.
   Abrir la cache y «✨ Es mi primera vez» viven en js/19, que tras abrir
   la cache descarga lo nuevo y clasifica en el mismo clic; aplicar los
   ajustes y cargar config.json reclasifican solos; al arrancar se
   recuperan la cache y el CSV que el navegador recuerda.
===================================================================== */

// Un clic en un enlace a otra pestaña la sube
// aquí, al cambiar, para que «Atrás» vuelva donde estabas.
let rutaSubir = false;

function routing() {
  const hash = (location.hash || "#dashboard").slice(1);
  // Un hash que no es una pestaña («Saltar al contenido»)
  // no cambia la que se ve.
  const vista = $("view-" + hash) || document.querySelector(".view.active") || $("view-dashboard");
  // Al salir de 🔍 Revisión se pliega todo: al volver (o al recargar) se ve
  // plegada, salvo «Por decidir» con algo (js/15 la vuelve a abrir al entrar;
  // el resto no se reabre solo a mitad de trabajo). Al salir y no al entrar: los enlaces que llevan a un bloque
  // (irAFechasSinPrecio, ccIrAVinculo…) lo abren después de cambiar.
  const rev = $("view-revision");
  if (rev && rev.classList.contains("active") && vista !== rev) {
    rev.querySelectorAll("details[open]").forEach(d => { d.open = false; });
    pnOlvidarAviso("ccPorDecidir");
  }
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v === vista));
  if (rutaSubir) { rutaSubir = false; window.scrollTo({ top: 0, behavior: "instant" }); }
  document.querySelectorAll("#navPrincipal a").forEach(a =>
    a.classList.toggle("active", a.getAttribute("href") === "#" + vista.id.replace("view-", "")));
}

function init() {
  // Modo oscuro
  // Con el almacenamiento del navegador bloqueado, leerlo lanza y la app
  // no arrancaría.
  try { if (localStorage.getItem("reental_dark") === "1") document.body.classList.add("dark"); } catch (e) { /* bloqueado */ }
  // Un navegador manejado por un programa (las pruebas): sin animaciones,
  // que pulsa antes de que acaben y fallaría sin motivo.
  if (navigator.webdriver) document.documentElement.classList.add("sin-animaciones");
  $("btnDark").textContent = document.body.classList.contains("dark") ? "☀️" : "🌙";
  $("btnDark").onclick = () => {
    document.body.classList.toggle("dark");
    const oscuro = document.body.classList.contains("dark");
    try { localStorage.setItem("reental_dark", oscuro ? "1" : "0"); } catch (e) { /* bloqueado */ }
    $("btnDark").textContent = oscuro ? "☀️" : "🌙";
  };

  // Routing
  window.addEventListener("hashchange", routing);
  // Alto de la barra de arriba (fija), para fijar debajo los
  // títulos de las columnas de 📒 Transacciones.
  const topbar = document.querySelector(".topbar");
  if (topbar && typeof ResizeObserver === "function") {
    new ResizeObserver(() => document.documentElement.style.setProperty("--alto-topbar", topbar.offsetHeight + "px")).observe(topbar);
    // Solo si la tabla cabe en su caja: si no, la caja se desplaza de lado y
    // así los títulos no se pueden fijar (en 📒 y en 💰).
    for (const [caja, tabla] of [[".tx-tablawrap", "txTabla"], [".rd-tablawrap", "rdTabla"]]) {
      const c = document.querySelector(caja), t = $(tabla);
      if (!c || !t) continue;
      const ver = () => c.classList.toggle("cabecera-fija", t.scrollWidth <= c.clientWidth + 1);
      const o = new ResizeObserver(ver);
      o.observe(c); o.observe(t);
    }
  }
  // Desde el menú lateral la pestaña se abre arriba del todo (sin
  // animación). Los botones que llevan a una fila o un bloque no pasan por aquí
  // (cambian el hash por código o anulan el enlace, como los «ir» de 🚀).
  // También el enlace del pie («Datos solo en este navegador» → 🚀) y
  // cualquier enlace a una pestaña (los de 📖 Ayuda y los de las pestañas
  // vacías). Ctrl o Mayús+clic, que abre otra pestaña del navegador, no
  // mueve esta; si cambia de pestaña, se sube en routing().
  document.addEventListener("click", e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey ||
        !$("view-" + a.getAttribute("href").slice(1))) return;
    if (a.getAttribute("href") === location.hash) window.scrollTo({ top: 0, behavior: "instant" });
    else rutaSubir = true;
  });
  routing();

  // Config desde localStorage (tercer camino de entrada de la config: se le
  // aplican también las reglas fijas, js/04).
  // Con la misma comprobación que un config.json: lo que no es una config
  // (una lista o la cache) se olvida.
  try {
    const guardada = localStorage.getItem("reental_config");
    if (guardada) {
      const obj = JSON.parse(guardada);
      if (motivoConfigNoValida(obj)) localStorage.removeItem("reental_config");
      else state.config = obj;
    }
  } catch (e) { /* corrupto */ }
  aplicarReglasFijasConfig(state.config);
  volcarConfigAFormulario();

  ["cfgNombre", "cfgNif", "cfgWallet", "cfgVault", "cfgEthKey"]
    .forEach(id => $(id).addEventListener("change", () => { leerConfigDesdeFormulario(); guardarConfigLocalSilencioso(); }));

  // Los requisitos de clasificación se repintan al cambiar
  // wallet o vault en el formulario (el coste es fijo).
  ["cfgWallet", "cfgVault"].forEach(id => $(id).addEventListener("change", () => {
    if (typeof pintarRequisitosClasificacion === "function") pintarRequisitosClasificacion();
  }));

  // Sin botones de config.json; un config.json se abre con
  // «📂 Abrir copia» (js/19).

  // Drop zones
  montarDropZone("dzCsv", "fileCsv", cargarCsv);

  $("btnLimpiarLog").onclick = () => { $("consola").innerHTML = ""; $("consola").dataset.vacio = "1"; };

  // Cache de trabajo: abrir una copia vive en js/19 y se guarda sola (js/05).
  $("btnAplicarAjustes").onclick = async () => {
    if (!state.cache) return toast("Sin datos todavía.", "warn");
    const txt = $("txtAjustes");
    try {
      const obj = JSON.parse(txt.value || "{}");
      const motivo = errorAjustesUsuario(obj);
      if (motivo) throw new Error(motivo);
      // Si los ajustes cambiaron mientras escribías (una decisión en
      // Revisión, un coste…), se pregunta antes de pisarlos; y solo con un
      // texto que vale.
      if (pnAjustesCambiaronAlEscribir(txt.dataset.base, pnTextoAjustes(state.cache), txt.value) &&
          !confirm("Los ajustes cambiaron mientras escribías.\n\nSi aplicas tu texto, esos cambios se pierden. ¿Aplicar igualmente?")) return;
      state.cache.ajustes_usuario = obj;
      marcarCacheDirty();
      await autoGuardarCache();
      // Los ajustes se ven al momento, sin botón de clasificar.
      const reclasificado = typeof arrClasificarAhora === "function" && arrClasificarAhora();
      // El editor pasa a enseñar lo guardado (clasificar ya repinta el panel).
      if (!reclasificado) renderPanel();
      toast("Ajustes aplicados: " + Object.keys(obj).length + "." +
            (reclasificado ? "" : " Se verán cuando esté todo en 🚀 Puesta en marcha."), "ok");
    } catch (e) {
      // «JSON inválido» solo si lo es.
      // Sin el mensaje del navegador (en inglés) si no es un JSON.
      toast(e instanceof SyntaxError ? "Los ajustes no son un JSON válido." : "No se aplican los ajustes: " + e.message, "error");
    }
  };

  // El descubrimiento y la clasificación no tienen botón propio: los
  // lanza js/19 al abrir la cache, al cargar el CSV o con «🔄 Actualizar»,
  // y el descubrimiento va dentro de ejecutarClasificacion.

  renderPanel();
  actualizarChipEstado();
  if (typeof pintarRequisitosClasificacion === "function") pintarRequisitosClasificacion();
  // La cache y el CSV de tu última visita.
  if (typeof arrRestaurarRecordados === "function") arrRestaurarRecordados();
}

document.addEventListener("DOMContentLoaded", init);