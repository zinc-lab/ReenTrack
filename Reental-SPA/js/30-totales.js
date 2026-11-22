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
   (2) «🌍 País de cada inmueble» en 🚀: lo apunta quien usa la app (dos
       letras), se guarda en tu archivo (paises_inmuebles, por nombre) y
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

/* Dos letras de la A a la Z, en mayúsculas («us» vale «US»); "" vacío;
   null si no vale. */
function totLeerPais(texto) {
  const t = String(texto ?? "").trim();
  return t === "" ? "" : /^[A-Za-z]{2}$/.test(t) ? t.toUpperCase() : null;
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

/* ----------------------------- 🚀 País de cada inmueble ----------------------------- */

function totPintarPaises() {
  const caja = $("arrPaises"), lista = $("arrPaisesLista");
  if (!caja || !lista) return;
  const nombres = state.cache && Array.isArray(state.registros) ? totNombresInmuebles(state.registros, state.cache) : [];
  caja.hidden = !nombres.length;
  const campos = [...lista.querySelectorAll("input.arr-pais")];
  const foco = campos.find(i => i === document.activeElement);
  // Los mismos inmuebles: solo los valores, sin tocar el campo en el que
  // escribes (rehacer la lista quitaría el foco al pasar de uno a otro).
  if (JSON.stringify(campos.map(i => i.dataset.inmueble)) === JSON.stringify(nombres)) {
    for (const i of campos) if (i !== foco) i.value = paisInmueble(i.dataset.inmueble);
    return;
  }
  lista.innerHTML = nombres.map((n, i) => '<div class="field"><label for="arrPais' + i + '">' + ccEsc(n) + "</label>" +
    '<input id="arrPais' + i + '" class="arr-pais" maxlength="2" autocomplete="off" placeholder="—" data-inmueble="' +
    ccEsc(n) + '" value="' + ccEsc(paisInmueble(n)) + '"></div>').join("");
  // Si cambian los inmuebles mientras escribes, lo escrito y el foco se quedan.
  const otra = foco && [...lista.querySelectorAll("input.arr-pais")].find(i => i.dataset.inmueble === foco.dataset.inmueble);
  if (otra) { otra.value = foco.value; otra.focus(); }
}

async function totCambioPais(input) {
  const pais = totLeerPais(input.value), nombre = input.dataset.inmueble;
  if (pais === null || !state.cache) {
    toast("El país, con dos letras (ES, US…).", "warn");
    input.value = paisInmueble(nombre);
    return;
  }
  input.value = pais;
  if (pais === paisInmueble(nombre)) return;
  totPonerPais(state.cache, nombre, pais);
  marcarCacheDirty();
  await autoGuardarCache();
}

if (typeof document !== "undefined") {
  document.addEventListener("change", ev => {
    const input = ev.target && ev.target.closest && ev.target.closest("input.arr-pais");
    if (input) totCambioPais(input);
  });
}
