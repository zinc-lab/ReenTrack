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

const TOT_CABECERA = "fecha_corte,concepto,inmueble,pais,importe_eur,importe_usd,completo";

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
    const fila = (concepto, eur, usd, completo, inmueble = "") => filas.push({ fecha_corte: corte, concepto, inmueble,
      pais: inmueble ? paisInmueble(inmueble, c) : "", eur, usd, completo: completo && eur !== null && !revisar });
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
    totImporte(f.eur), totImporte(f.usd), f.completo ? "si" : "no"].join(","))].join("\n") + "\n";
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

/* Lo escrito en el campo del país: su nombre («España», «espana») o su
   código («es»). Da el código, "" si está vacío y null si no es un país. */
function totLeerPais(texto) {
  const t = String(texto ?? "").trim();
  if (t === "") return "";
  if (/^[A-Za-z]{2}$/.test(t)) return TOT_PAISES.includes(t.toUpperCase()) ? t.toUpperCase() : null;
  const buscado = totSinTildes(t);
  return TOT_PAISES.find(c => totSinTildes(totNombrePais(c)) === buscado) || null;
}

/* Los países del desplegable, por nombre: primero los que ya usas. */
// ¿Sale el país al escribir «texto»? Su código exacto o una palabra de su
// nombre que empiece así («es» → España, Estados Unidos…; «unido» → Reino Unido).
function totPaisCoincide(codigo, texto) {
  const t = totSinTildes(texto);
  return !t || codigo.toLowerCase() === t || totSinTildes(totNombrePais(codigo)).split(/[\s-]+/).some(p => p.startsWith(t));
}
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

function totPintarPaises() {
  const caja = $("arrPaises"), lista = $("arrPaisesLista"), opciones = $("arrPaisesOpciones");
  if (!caja || !lista || !opciones) return;
  const nombres = state.cache && Array.isArray(state.registros) ? totNombresInmuebles(state.registros, state.cache) : [];
  caja.hidden = !nombres.length;
  const texto = n => (paisInmueble(n) ? totNombrePais(paisInmueble(n)) : "");
  const campos = [...lista.querySelectorAll("input.arr-pais")];
  const foco = campos.find(i => i === document.activeElement);
  // Los mismos inmuebles: solo los valores, sin tocar el campo en el que
  // escribes (rehacer la lista quitaría el foco al pasar de uno a otro).
  if (JSON.stringify(campos.map(i => i.dataset.inmueble)) === JSON.stringify(nombres)) {
    for (const i of campos) if (i !== foco) { i.value = texto(i.dataset.inmueble); totBloquearPais(i); }
    return;
  }
  totCerrarPaises();
  caja.appendChild(opciones);   // la lista de países se pone bajo un campo: que no se borre con ellos
  lista.innerHTML = nombres.map((n, i) => '<div class="field"><label for="arrPais' + i + '">' + ccEsc(n) + "</label>" +
    '<div class="arr-pais-fila"><input id="arrPais' + i + '" class="arr-pais" role="combobox" aria-autocomplete="list" aria-expanded="false" ' +
    'aria-controls="arrPaisesOpciones" autocomplete="off" placeholder="Busca un país" data-inmueble="' +
    ccEsc(n) + '" value="' + ccEsc(texto(n)) + '">' + '<button type="button" class="arr-pais-editar" title="Cambiar" aria-label="Cambiar el país de ' +
    ccEsc(n) + '" hidden>' + TOT_LAPIZ + "</button></div></div>").join("");
  for (const i of lista.querySelectorAll("input.arr-pais")) totBloquearPais(i);
  // Si cambian los inmuebles mientras escribes, lo escrito y el foco se quedan.
  const otra = foco && [...lista.querySelectorAll("input.arr-pais")].find(i => i.dataset.inmueble === foco.dataset.inmueble);
  if (otra) { otra.value = foco.value; otra.focus(); }
}

async function totCambioPais(input) {
  const pais = totLeerPais(input.value), nombre = input.dataset.inmueble;
  const anterior = paisInmueble(nombre);
  if (pais === null || !state.cache) {
    toast("Elige un país de la lista.", "warn");
    input.value = anterior ? totNombrePais(anterior) : "";
    return;
  }
  input.value = pais ? totNombrePais(pais) : "";
  if (pais !== anterior) { totPonerPais(state.cache, nombre, pais); marcarCacheDirty(); }
  if (document.activeElement !== input) totBloquearPais(input);
  if (pais !== anterior) await autoGuardarCache();
}

/* Un país elegido queda fijo (solo lectura); el lápiz de al lado lo
   vuelve a abrir. Sin país, el campo se puede escribir. */
const TOT_LAPIZ = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
function totBloquearPais(input) {
  const fijo = !!paisInmueble(input.dataset.inmueble);
  input.readOnly = fijo;
  input.nextElementSibling.hidden = !fijo;
}

/* La lista de países: propia y no un <datalist>, que no deja fijar su alto
   ni separar los que usas. Una sola para todos los campos: se pone bajo el
   que se está escribiendo. Al entrar, todos; al escribir, los que coinciden. */
let totCampoAbierto = null;
function totAbrirPaises(input, filtrar) {
  if (input.readOnly) return;
  const ul = $("arrPaisesOpciones");
  const usados = new Set([...document.querySelectorAll("input.arr-pais")].map(i => paisInmueble(i.dataset.inmueble)).filter(Boolean));
  const t = filtrar ? input.value : "";
  const codigos = totOpcionesPaises(usados).filter(c => totPaisCoincide(c, t));
  const n = codigos.filter(c => usados.has(c)).length;
  ul.innerHTML = codigos.map((c, i) => '<li role="option" id="arrPaisOp' + c + '" data-pais="' + c + '"' +
    (i === n && n ? ' class="arr-pais-linea"' : "") + ">" + ccEsc(totNombrePais(c)) + "</li>").join("");
  input.closest(".field").appendChild(ul);
  totCampoAbierto = input;
  ul.hidden = !codigos.length;
  input.setAttribute("aria-expanded", String(!ul.hidden));
  // Al escribir, marcado el primero (o el del código exacto: «pt» → Portugal).
  const exacto = codigos.find(c => c.toLowerCase() === totSinTildes(t));
  totMarcarPais(input, filtrar && codigos.length ? (exacto || codigos[0]) : null);
}
function totMarcarPais(input, codigo) {
  const ul = $("arrPaisesOpciones");
  for (const li of ul.querySelectorAll('[aria-selected="true"]')) li.removeAttribute("aria-selected");
  const li = codigo && $("arrPaisOp" + codigo);
  if (li) { li.setAttribute("aria-selected", "true"); li.scrollIntoView({ block: "nearest" }); input.setAttribute("aria-activedescendant", li.id); }
  else input.removeAttribute("aria-activedescendant");
}
function totCerrarPaises() {
  const ul = $("arrPaisesOpciones"), input = totCampoAbierto;
  totCampoAbierto = null;
  if (ul) ul.hidden = true;
  if (input) { input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
}
function totElegirPais(input, codigo) {
  input.value = totNombrePais(codigo);
  totCerrarPaises();
  totCambioPais(input);   // lo guarda ya (sin esperar a la copia): queda fijo enseguida
  totBloquearPais(input);
}

if (typeof document !== "undefined") {
  const campoPais = ev => ev.target && ev.target.closest && ev.target.closest("input.arr-pais");
  document.addEventListener("change", ev => { const input = campoPais(ev); if (input) totCambioPais(input); });
  document.addEventListener("focusin", ev => { const input = campoPais(ev); if (input) totAbrirPaises(input, false); });
  document.addEventListener("input", ev => { const input = campoPais(ev); if (input) totAbrirPaises(input, true); });
  // Al salir del campo: se cierra la lista y, si tiene país, vuelve a quedar fijo.
  document.addEventListener("focusout", ev => { const input = campoPais(ev); if (input) { totCerrarPaises(); totBloquearPais(input); } });
  document.addEventListener("click", ev => {
    const lapiz = ev.target.closest && ev.target.closest("button.arr-pais-editar");
    if (!lapiz) return;
    const input = lapiz.previousElementSibling;
    input.readOnly = false;
    lapiz.hidden = true;
    input.focus();
    input.select();
  });
  // Con el ratón en la lista: sin quitar el foco al campo.
  document.addEventListener("mousedown", ev => {
    const li = ev.target.closest && ev.target.closest("#arrPaisesOpciones li[data-pais]");
    if (!li || !totCampoAbierto) return;
    ev.preventDefault();
    totElegirPais(totCampoAbierto, li.dataset.pais);
  });
  // Con el teclado: flechas para moverse, Intro o Tab para elegir, Esc para cerrar.
  document.addEventListener("keydown", ev => {
    const input = campoPais(ev);
    if (!input || input.readOnly) return;
    const ul = $("arrPaisesOpciones"), abierta = totCampoAbierto === input && !ul.hidden;
    const marcado = abierta && ul.querySelector('[aria-selected="true"]');
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      if (!abierta) return totAbrirPaises(input, false);
      const items = [...ul.querySelectorAll("li[data-pais]")];
      const i = marcado ? items.indexOf(marcado) + (ev.key === "ArrowDown" ? 1 : -1) : 0;
      const otro = items[Math.max(0, Math.min(items.length - 1, i))];
      if (otro) totMarcarPais(input, otro.dataset.pais);
    } else if ((ev.key === "Enter" || ev.key === "Tab") && marcado) {
      if (ev.key === "Enter") ev.preventDefault();
      totElegirPais(input, marcado.dataset.pais);
    } else if (ev.key === "Escape" && abierta) {
      ev.preventDefault();
      totCerrarPaises();
    }
  });
}
