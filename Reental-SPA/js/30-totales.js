/* =====================================================================
   REENTAL SPA · js/30-totales.js
   (1) «📄 Solo totales (CSV)» de 📤 Exportar: los totales a cada 31/12 y
       a la fecha hasta la que llegan tus datos, para llevarlos a otra
       hoja o app. Formato en docs/especificaciones/totales-csv.md. Todo
       sale del cálculo de 🧾 (fiResultado, js/23): el apartado II de cada
       informe (js/22) y resumenFiscalAnual (js/21). Lo nuevo: el valor
       nominal (la moneda de cada proyecto, como 📊: dashMonedaProyecto de
       js/16) y el valor del RNT (precios_rnt del día del corte, que pide
       js/09 con fechasCortePrecioRnt de js/08).
   (2) «🌍 País del token» en 🚀 (donde se emite, no donde está el edificio): lo elige quien usa la app de una
       lista con buscador, se guarda (su código de dos letras) en tu archivo (paises_inmuebles, por nombre) y
       solo es un dato: sale en el CSV y junto al nombre en 🧾, el informe
       y el Excel (nombreConPais de js/22). No cambia ninguna cifra.
   ===================================================================== */

const TOT_CABECERA = "fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo,cantidad";

/* ----------------------------- Funciones puras ----------------------------- */

const totOrden = (a, b) => cmpTexto(String(a).toLowerCase(), String(b).toLowerCase());   // los inmuebles, por nombre

/* Map nombre del inmueble -> "EUR" | "USD" | null: la moneda de cada proyecto
   por sus compras, como el valor nominal de 📊, pero con todas las
   compras (no solo lo que queda hoy) y por nombre (los dos contratos de un
   canje, juntos). registros: los de la clasificación (state.registros). */
function totMonedas(registros, cache, nombres) {
  const c = pyO(cache, {});
  const inv = dashDineroInvertido((registros || []).filter(r => r && r.categoria === "COMPRA"), c.tipos_bce, c.ajustes_usuario, c);
  const grupos = new Map();
  const grupo = contrato => {
    const nombre = String(pyO(nombres.get(contrato), contrato));
    if (!grupos.has(nombre)) grupos.set(nombre, { lotes: [], sinPrecio: [], omitida: null });
    return grupos.get(nombre);
  };
  for (const [contrato, lotes] of inv.colas) grupo(contrato).lotes.push(...lotes);
  for (const l of inv.sinCantidad) grupo(l.contrato).sinPrecio.push(l);
  for (const [contrato, o] of inv.sinCalcular) { const g = grupo(contrato); if (!g.omitida) g.omitida = o; }
  return new Map([...grupos].map(([nombre, g]) => [nombre, dashMonedaProyecto(g.lotes, g.sinPrecio, g.omitida)]));
}

/* Las filas del CSV: [{ fecha_corte, concepto, inmueble, pais, eur, usd,
   completo }] (eur y usd: número o null). resultado: el de fiResultado;
   registros: los de la clasificación (para la moneda de cada proyecto). */
function totFilas(resultado, registros, cache) {
  const c = pyO(cache, {});
  const monedas = totMonedas(registros, c, resultado.nombres);
  const precios = pdEsObjeto(c.precios_rnt) ? c.precios_rnt : {};
  const filas = [], cortes = new Set();
  for (const anio of fiAnios(resultado.informes)) {
    const informe = resultado.informes[anio], inv = informe.inversiones_activas;
    const corte = inv.fecha_corte;
    // Un ejercicio posterior a tus datos (una fecha mal escrita) tiene el
    // mismo corte que el año en curso: una sola vez.
    if (cortes.has(corte)) continue;
    cortes.add(corte);
    // El tipo del BCE del corte, el mismo que el del vault del informe.
    const fechaBce = rentaFechaTipoBce(c, corte), t = fechaBce ? Number(c.tipos_bce[fechaBce]) : NaN;
    const tipo = Number.isFinite(t) && t > 0 ? t : null;
    // Con algo «A revisar» hasta el corte (o sin fecha), o un aviso «A
    // revisar» del ejercicio (los que 🧾 dice que pueden cambiar sus
    // cifras), todas las filas de esa fecha van con «no».
    const revisar = resultado.registros.some(r => pyVerdad(r.revisar) &&
      (!fiscFechaValida(r.fecha) || r.fecha.slice(0, 10) <= corte)) ||
      (informe.avisos || []).some(a => a && a.tipo === "revisar");
    // cantidad: solo en rnt_unidades (sin importes; se sabe si se sabe la cantidad).
    const fila = (concepto, eur, usd, completo, inmueble = "", cantidad = null) => filas.push({ fecha_corte: corte, concepto, inmueble,
      pais: inmueble ? paisInmueble(inmueble, c) : "", eur, usd, cantidad, completo: completo && (eur !== null || cantidad !== null) && !revisar });
    const aEur = usd => (Math.abs(usd) <= 0.005 ? 0 : usdAEur(usd, tipo));

    // Los inmuebles del apartado II, por nombre.
    const porNombre = new Map();
    for (const f of (inv.inmuebles || { filas: [] }).filas) {
      const x = porNombre.get(f.nombre) || { tokens: 0, eur: 0, usd: 0, usdEntero: true, parcial: false, supuesto: false };
      x.tokens += f.cantidad;
      x.eur = x.eur === null || f.coste_eur === null ? null : x.eur + f.coste_eur;
      x.usdEntero = x.usdEntero && f.coste_usd !== null && !pyVerdad(f.coste_usd_parcial);
      if (f.coste_usd !== null) x.usd += f.coste_usd;
      x.parcial = x.parcial || pyVerdad(f.coste_usd_parcial);
      x.supuesto = x.supuesto || f.coste_supuesto === true;
      porNombre.set(f.nombre, x);
    }
    const deInmueble = [];
    for (const nombre of [...porNombre.keys()].sort(totOrden)) {
      const x = porNombre.get(nombre), moneda = monedas.get(nombre) || null;
      const nominal = dashCent(x.tokens * DASH_NOMINAL);
      const nEur = moneda === "EUR" ? nominal : moneda === "USD" ? aEur(nominal) : null;
      // Completo: sin coste supuesto ni, en un proyecto en $, un coste en $
      // incompleto (el «*» del informe).
      deInmueble.push({ nombre, entero: !x.supuesto && !(moneda === "USD" && x.parcial), coste: x.eur, costeUsd: moneda === "USD" && x.usdEntero ? x.usd : null,
        nominal: nEur, nominalUsd: moneda === "USD" ? nominal : null });
    }
    // Un total: vacío si falta alguna fila o no hay cierre; completo si lo
    // están todas. El coste, el subtotal del informe (su «Capital»: puede
    // diferir un céntimo de la suma de filas, como en el PDF); el valor
    // nominal, la suma de sus filas ya en céntimos.
    const sinCierre = !fiscHay(inv.inmuebles);
    const falta = clave => sinCierre || deInmueble.some(i => i[clave] === null);
    const enteros = deInmueble.every(i => i.entero);
    fila("coste_compra", falta("coste") ? null : inv.inmuebles.subtotal_eur, null, enteros);
    fila("valor_nominal", falta("nominal") ? null : deInmueble.reduce((t, i) => t + rentaEur2(i.nominal), 0), null, enteros);

    // El vault: sin vault (o sin cache) no se sabe; con saldo negativo, tampoco es seguro.
    const vault = pyO(inv.vault, {});
    const hayVault = fiscHay(vault.saldo_usd);
    fila("saldo_vault", hayVault ? vault.saldo_eur : null, hayVault ? vault.saldo_usd : null, vault.saldo_usd > -0.005);

    // La wallet y el RNT: las filas de «Otros criptoactivos» (sin pools ni otras cuentas).
    const otros = sinCierre ? null : pyO(inv.otros, { filas: [] }).filas;
    const de = (activo, nombre) => (otros || []).find(f => f.activo === activo && f.nombre === nombre);
    const usdWallet = otros === null ? null : (de("USDT", "USDT (wallet)")?.cantidad || 0) + (de("USDC", "USDC")?.cantidad || 0);
    fila("saldo_wallet", usdWallet === null ? null : aEur(usdWallet), usdWallet, !pyVerdad(vault.usdt_sin_coste));
    const rnt = de("RNT", "RNT");
    const tokensRnt = otros === null ? null : (rnt ? rnt.cantidad : 0);
    const precio = precioValido(precios[corte]) ? precios[corte] : null;
    const usdRnt = tokensRnt === null ? null : tokensRnt <= 1e-9 ? 0 : precio === null ? null : tokensRnt * precio;
    fila("rnt_valor", usdRnt === null ? null : aEur(usdRnt), usdRnt, true);
    fila("rnt_unidades", null, null, true, "", tokensRnt);
    fila("rnt_coste_compra", otros === null ? null : rnt ? rnt.coste_eur : 0, null, true);

    for (const i of deInmueble) {
      fila("inmueble_coste_compra", i.coste, i.costeUsd, i.entero, i.nombre);
      fila("inmueble_valor_nominal", i.nominal, i.nominalUsd, i.entero, i.nombre);
    }

    // Los seis del ejercicio (a la fecha del año en curso, lo que va de año).
    const b = pyO(pyGet(resultado.resumen, anio, null), {});
    for (const [concepto, campo] of [["rendimientos_integros", "base_rendimientos_eur"], ["retenciones", "retenciones_eur"],
      ["recompensas_defi", "base_rewards_eur"], ["ganancias_ventas", "gp_positiva_eur"], ["perdidas_ventas", "gp_negativa_eur"],
      ["ganancias_base_general", "gp_base_general_eur"]]) {
      fila(concepto, pyO(b[campo], 0), null, true);
    }
  }
  return filas;
}

/* Un importe del CSV: punto decimal, dos decimales, sin miles; vacío si
   no se sabe. */
function totImporte(x) {
  const r = rentaEur2(x);
  return r === null ? "" : r.toFixed(2);
}
/* Un texto del CSV, entre comillas si lleva coma, comillas o salto. Si
   empieza por = + - @ (o tabulador o retorno), con ' delante: una hoja de
   cálculo lo tomaría por una fórmula. */
function totCelda(texto) {
  const t = /^[=+\-@\t\r]/.test(texto) ? "'" + texto : texto;
  return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

/* El texto del archivo (UTF-8 sin BOM, una línea por fila). */
function totCsv(filas) {
  return [TOT_CABECERA, ...filas.map(f => [f.fecha_corte, f.concepto, totCelda(f.inmueble), f.pais,
    totImporte(f.eur), totImporte(f.usd), f.completo ? "si" : "no", totImporte(f.cantidad)].join(","))].join("\n") + "\n";
}

const totNombreArchivo = ahora => "reentrack-totales_" + exFechaLocal(ahora).dia + ".csv";

/* Los países: sus códigos de dos letras (ISO 3166-1); el nombre en
   español lo da el navegador. */
const TOT_PAISES = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
  "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF " +
  "GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW " +
  "KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL " +
  "NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST " +
  "SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");
let totNombres = null;   // código -> nombre en español (se hace una vez)
function totNombrePais(codigo) {
  if (!totNombres) {
    let nombre = c => c;
    try { const n = new Intl.DisplayNames(["es"], { type: "region" }); nombre = c => n.of(c) || c; } catch (e) { /* sin Intl: el código */ }
    totNombres = new Map(TOT_PAISES.map(c => [c, nombre(c)]));
  }
  return totNombres.get(codigo) || codigo;
}
const totSinTildes = t => String(t).normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

// ¿Sale el país al escribir «texto»? Su código exacto, o su nombre o una de
// sus palabras que empiece así («es» → España, Estados Unidos…; «unido» →
// Reino Unido; «república dom» → República Dominicana).
function totPaisCoincide(codigo, texto) {
  const t = totSinTildes(texto), nombre = totSinTildes(totNombrePais(codigo));
  return !t || codigo.toLowerCase() === t || nombre.startsWith(t) || nombre.split(/[\s-]+/).some(p => p.startsWith(t));
}
/* Los países del menú, por nombre: primero los que ya usas. */
function totOpcionesPaises(usados) {
  const porNombre = lista => lista.sort((a, b) => cmpTexto(totNombrePais(a), totNombrePais(b)));
  const arriba = porNombre(TOT_PAISES.filter(c => usados.has(c)));
  return arriba.concat(porNombre(TOT_PAISES.filter(c => !usados.has(c))));
}

/* Apunta (o borra, con "") el país de un inmueble en la cache. */
function totPonerPais(cache, nombre, pais) {
  if (!pdEsObjeto(cache.paises_inmuebles)) cache.paises_inmuebles = {};
  // Como propiedad propia (un nombre como «__proto__» también se guarda).
  if (pais) Object.defineProperty(cache.paises_inmuebles, nombre, { value: pais, enumerable: true, writable: true, configurable: true });
  else delete cache.paises_inmuebles[nombre];
}

/* Los inmuebles de tus datos, por nombre (también los vendidos). */
function totNombresInmuebles(registros, cache) {
  return [...new Set(rentaNombresInmuebles(registros || [], cache).values())].map(String)
    .sort(totOrden);
}

/* ----------------------------- 🚀 País del token ----------------------------- */
/* Cada inmueble con un botón que enseña su país (o «Elegir país»), todos
   del mismo ancho. Al pulsarlo, un menú con buscador: los que usas arriba,
   una línea y el resto. Hay un solo menú: se pone bajo el botón pulsado. */

const TOT_FLECHA = '<svg class="arr-pais-flecha" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
const TOT_MARCA = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
const totCodigo = c => '<span class="arr-pais-cod">' + c + "</span>";

function totPintarPaises() {
  const caja = $("arrPaises"), lista = $("arrPaisesLista"), menu = $("arrPaisesMenu");
  if (!caja || !lista || !menu) return;
  const nombres = state.cache && Array.isArray(state.registros) ? totNombresInmuebles(state.registros, state.cache) : [];
  caja.hidden = !nombres.length;
  // El resumen: «5 Estados Unidos · 1 España · 2 sin país».
  const cuenta = new Map();
  let sin = 0;
  for (const n of nombres) { const p = paisInmueble(n); if (p) cuenta.set(p, (cuenta.get(p) || 0) + 1); else sin++; }
  $("arrPaisesResumen").textContent = [...cuenta].sort((a, b) => b[1] - a[1] || cmpTexto(totNombrePais(a[0]), totNombrePais(b[0])))
    .map(([p, k]) => k + " " + totNombrePais(p)).concat(sin ? [sin + " sin país"] : []).join(" · ");
  // Los mismos inmuebles: solo cambia lo que dice cada botón (rehacerlos
  // quitaría el foco y cerraría el menú).
  const botones = [...lista.querySelectorAll("button.arr-pais")];
  if (JSON.stringify(botones.map(b => b.dataset.inmueble)) === JSON.stringify(nombres)) {
    for (const b of botones) totPintarBoton(b);
    return;
  }
  totCerrarPaises(false);
  caja.appendChild(menu);   // el menú se pone bajo un botón: que no se borre con ellos
  lista.innerHTML = nombres.map((n, i) => '<div class="arr-pais-fila"><span class="arr-pais-inmueble" id="arrPaisInm' + i + '">' + ccEsc(n) +
    '</span><button type="button" id="arrPais' + i + '" class="arr-pais" aria-haspopup="listbox" aria-expanded="false" ' +
    'aria-labelledby="arrPaisInm' + i + " arrPais" + i + '" data-inmueble="' + ccEsc(n) + '"></button></div>').join("");
  for (const b of lista.querySelectorAll("button.arr-pais")) totPintarBoton(b);
}
function totPintarBoton(boton) {
  const p = paisInmueble(boton.dataset.inmueble);
  boton.classList.toggle("vacio", !p);
  boton.innerHTML = (p ? totCodigo(p) : "") + '<span class="arr-pais-nombre">' + (p ? ccEsc(totNombrePais(p)) : "Elegir país") + "</span>" + TOT_FLECHA;
  boton.title = p ? totNombrePais(p) : "";   // un nombre largo se corta con «…»
}

let totBotonAbierto = null;
function totAbrirPaises(boton) {
  const menu = $("arrPaisesMenu"), busca = $("arrPaisBusca");
  totBotonAbierto = boton;
  boton.after(menu);
  boton.setAttribute("aria-expanded", "true");
  $("arrPaisQuitar").hidden = !paisInmueble(boton.dataset.inmueble);
  busca.value = "";
  menu.hidden = false;
  totFiltrarPaises();
  busca.focus();
}
// Al abrir, todos (marcado el que tiene); al escribir, los que coinciden
// (marcado el primero, o el del código exacto: «pt» → Portugal).
function totFiltrarPaises() {
  const ul = $("arrPaisesOpciones"), t = $("arrPaisBusca").value, actual = paisInmueble(totBotonAbierto.dataset.inmueble);
  const usados = new Set([...document.querySelectorAll("button.arr-pais")].map(b => paisInmueble(b.dataset.inmueble)).filter(Boolean));
  const codigos = totOpcionesPaises(usados).filter(c => totPaisCoincide(c, t));
  const n = codigos.filter(c => usados.has(c)).length;
  ul.innerHTML = codigos.length ? codigos.map((c, i) => '<li role="option" id="arrPaisOp' + c + '" data-pais="' + c + '"' +
    (i === n && n ? ' class="arr-pais-linea"' : "") + ">" + totCodigo(c) + ccEsc(totNombrePais(c)) + (c === actual ? TOT_MARCA : "") + "</li>").join("")
    : '<li class="arr-pais-nada">Ningún país</li>';
  const exacto = codigos.find(c => c.toLowerCase() === totSinTildes(t));
  totMarcarPais(t.trim() ? (exacto || codigos[0]) : actual);
}
function totMarcarPais(codigo) {
  const ul = $("arrPaisesOpciones"), busca = $("arrPaisBusca");
  for (const li of ul.querySelectorAll('[aria-selected="true"]')) li.removeAttribute("aria-selected");
  const li = codigo && $("arrPaisOp" + codigo);
  if (li) { li.setAttribute("aria-selected", "true"); li.scrollIntoView({ block: "nearest" }); busca.setAttribute("aria-activedescendant", li.id); }
  else busca.removeAttribute("aria-activedescendant");
}
function totCerrarPaises(volverAlBoton) {
  const menu = $("arrPaisesMenu"), boton = totBotonAbierto;
  totBotonAbierto = null;
  if (menu) menu.hidden = true;
  if (boton) { boton.setAttribute("aria-expanded", "false"); if (volverAlBoton) boton.focus(); }
}
async function totElegirPais(pais) {
  const boton = totBotonAbierto;
  totCerrarPaises(true);
  if (!boton || !state.cache || pais === paisInmueble(boton.dataset.inmueble)) return;
  totPonerPais(state.cache, boton.dataset.inmueble, pais);
  marcarCacheDirty();
  totPintarPaises();
  await autoGuardarCache();
}

if (typeof document !== "undefined") {
  const en = (ev, sel) => ev.target && ev.target.closest && ev.target.closest(sel);
  document.addEventListener("click", ev => {
    const boton = en(ev, "button.arr-pais");
    if (boton) {
      const abierto = totBotonAbierto === boton;
      totCerrarPaises(false);
      if (!abierto) totAbrirPaises(boton);
      return;
    }
    if (en(ev, "#arrPaisQuitar")) return totElegirPais("");
    const li = en(ev, "#arrPaisesOpciones li[data-pais]");
    if (li) return totElegirPais(li.dataset.pais);
    if (totBotonAbierto && !en(ev, "#arrPaisesMenu")) totCerrarPaises(false);
  });
  // Pulsar en la lista no quita el foco al buscador (si no, se cerraría antes del clic).
  document.addEventListener("mousedown", ev => { if (en(ev, "#arrPaisesOpciones")) ev.preventDefault(); });
  document.addEventListener("input", ev => { if (ev.target.id === "arrPaisBusca" && totBotonAbierto) totFiltrarPaises(); });
  // Salir del menú con Tab lo cierra (al pulsar su botón, lo cierra el clic).
  document.addEventListener("focusout", ev => {
    if (!totBotonAbierto || !en(ev, "#arrPaisesMenu")) return;
    const a = ev.relatedTarget;
    if (!a || (!a.closest("#arrPaisesMenu") && a !== totBotonAbierto)) totCerrarPaises(false);
  });
  // Flechas para moverse, Intro para elegir, Esc para cerrar.
  document.addEventListener("keydown", ev => {
    if (ev.target.id !== "arrPaisBusca" || !totBotonAbierto) return;
    const ul = $("arrPaisesOpciones"), marcado = ul.querySelector('[aria-selected="true"]');
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const items = [...ul.querySelectorAll("li[data-pais]")];
      const i = marcado ? items.indexOf(marcado) + (ev.key === "ArrowDown" ? 1 : -1) : 0;
      const otro = items[Math.max(0, Math.min(items.length - 1, i))];
      if (otro) totMarcarPais(otro.dataset.pais);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      if (marcado) totElegirPais(marcado.dataset.pais);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      totCerrarPaises(true);
    }
  });
}
