/* =====================================================================
   REENTAL SPA · js/16-dashboard.js
   La pestaña «📊 Dashboard» (#view-dashboard), pintada dentro de
   #tarjetaMetricas: franja de métricas y gráficos SVG hechos a mano (sin
   librerías).

   Cada bloque con su fuente y su «No disponible» cuando falta (nunca se
   inventa una cifra):
   1. Métricas: saldo del vault, último tipo BCE, rendimientos (íntegro),
      «Movimientos» (la cifra de 📒 Transacciones) y «A revisar» (el número
      del menú de 🔍 Revisión).
   2. 💰 Rendimientos — del archivo de Reental (state.filasCsv) con tus
      decisiones de Revisión (state.registros): por mes o por año, en
      barras apiladas (reclamado con su retención dentro, reinvertido y
      pendiente: la pila es el íntegro repartido) con un bocadillo de
      cifras exactas. La retención se ve aparte y nunca se resta.
   3. 🏠 Inmuebles — los que más te han repartido, con «Ver todos».
   4. 🧱 Tu cartera — tokens de cada inmueble confirmado en tu wallet y tu
      vault, de las transferencias descargadas (por número de tokens).
   5. 💼 Dinero invertido — lo pagado por los tokens de inmuebles que
      tienes (cada venta resta lo que costó lo vendido, FIFO), acumulado
      mes a mes, de la
      clasificación (state.registros). El saldo del vault sigue en las
      métricas (serie on-chain con la semántica de serieSaldoVault() de
      js/09; el motor no se toca).

   Cómo se pinta:
   - Repintado no invasivo: se envuelven las funciones globales que ya
     avisan de cambios de datos (renderPanel, actualizarChipEstado,
     ejecutarClasificacion) y se escucha hashchange al volver a
     #dashboard. Los envoltorios solo AÑADEN el repintado detrás de la
     función original (si la original lanza, el error se propaga igual).
     Un bloque que falla sale «No disponible» sin tirar los demás.
   - El CSS se inyecta desde este módulo con espacio de nombres dash-*
     y usa los tokens del design system 1.1 (var(--accent), var(--ok)…):
     el modo oscuro (body.dark) funciona sin repintar.
   - Las funciones de cálculo son puras (sin DOM) y van al principio,
     testeables en Node con sandbox VM como el resto de la SPA.
   ===================================================================== */

/* ----------------------------- Utilidades puras ----------------------------- */
const DASH_MESES = ["ene", "feb", "mar", "abr", "may", "jun",
                    "jul", "ago", "sep", "oct", "nov", "dic"];
/* Paleta de categorías: tonos medios legibles sobre panel claro y oscuro. */
const DASH_PALETA = ["#177a52", "#2563eb", "#c2701e", "#7c3aed", "#0e7490",
                     "#b0453a", "#5d6b7a", "#2f9e6e", "#9d3b6e", "#8a6d1f",
                     "#4a5aa8", "#6b8f2e"];

/* Formato numérico es-ES determinista (punto de miles, coma decimal), sin
   depender de ICU/toLocaleString: idéntico en navegador y Node (las
   pruebas comparan cifras exactas). */
function dashNum(x, dec = 2) {
  if (!Number.isFinite(x)) return "—";
  const [ent, fra] = Math.abs(x).toFixed(dec).split(".");
  const agrupado = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  // Sin «-0,00» cuando un negativo pequeño redondea a cero.
  return (x < 0 && /[1-9]/.test(ent + (fra || "")) ? "-" : "") + agrupado + (fra ? "," + fra : "");
}
function dashPct(parte, total, dec = 1) {
  if (!(total > 0)) return dashNum(0, dec);
  return dashNum(100 * parte / total, dec);
}
/* «1 inmueble» / «2 inmuebles». */
function dashCuantos(n, singular, plural) {
  return n + " " + (n === 1 ? singular : plural);
}
function dashEsc(s) {
  return String(s === null || s === undefined ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ----------------------------- Cálculo (puro) ----------------------------- */

/* Saldo USDT del vault desde la cache, para la métrica (como
   serieSaldoVault() de js/09): transfers unificados
   (deduplicados y ordenados por timeStamp, js/14), solo contrato USDT que
   toca el vault, delta +entrada/−salida redondeado a 6 decimales. Los
   movimientos con importe no parseable se omiten (nunca se inventa un
   saldo). Devuelve { n movimientos, saldo }, o null si faltan requisitos
   (cache o dirección del vault). */
function dashSaldoVault(cache, vaultAddr) {
  if (!cache || !cache.transacciones) return null;
  const vault = normalizarDireccion(vaultAddr || "");
  if (!vault) return null;
  let n = 0, saldo = 0;
  for (const tx of transfersUnificadosClasificacion(cache)) {
    if (normalizarDireccion(tx.contractAddress || "") !== USDT) continue;
    const origen = normalizarDireccion(tx.from || "");
    const destino = normalizarDireccion(tx.to || "");
    if (origen !== vault && destino !== vault) continue;
    const cantidad = cantidadTx(tx);
    if (cantidad === null) continue;
    let delta = 0;
    if (destino === vault) delta += cantidad;
    if (origen === vault) delta -= cantidad;
    saldo += red6(delta);
    n++;
  }
  return { n, saldo: red6(saldo) };
}

/* Los meses "AAAA-MM" de primero a ultimo, ambos incluidos, sin saltar
   ninguno (lo usan el dinero invertido y los rendimientos por mes). */
function dashMesesEntre(primero, ultimo) {
  const [y0, m0] = primero.split("-").map(Number);
  const [y1, m1] = ultimo.split("-").map(Number);
  const meses = [];
  for (let k = 0; k <= (y1 - y0) * 12 + (m1 - m0); k++) {
    meses.push(String(y0 + Math.floor((m0 - 1 + k) / 12)).padStart(4, "0") + "-" + String((m0 - 1 + k) % 12 + 1).padStart(2, "0"));
  }
  return meses;
}

/* Etiqueta corta de un mes para los ejes: "ago 25". */
function dashMesCorto(clave) {
  const [a, m] = clave.split("-");
  return DASH_MESES[+m - 1] + " " + a.slice(2);
}

/* El dinero invertido a fin de cada mes («AAAA-MM»), de los movimientos de
   dashDineroInvertido (todos con fecha y en orden): el valor tras el último
   movimiento del mes; un mes sin movimientos repite el anterior (sin
   movimiento no cambia: no se inventa nada). */
function dashSerieMensual(movimientos) {
  const porMes = new Map();
  for (const m of movimientos) porMes.set(m.fecha.slice(0, 7), m.invertido); // gana el último del mes
  const serie = [];
  if (porMes.size) {
    const meses = [...porMes.keys()];
    let valor = 0;
    for (const clave of dashMesesEntre(meses[0], meses[meses.length - 1])) {
      if (porMes.has(clave)) valor = porMes.get(clave);
      serie.push({ etiqueta: clave, valor });
    }
  }
  return serie;
}

/* El dinero invertido, de la clasificación (registros).
   Sube con cada compra de tokens de un inmueble, se pague como se pague
   (desde la wallet, desde el vault —así entran los rendimientos
   reinvertidos, al gastarse— o por transferencia bancaria, en € pasados a
   USD con el tipo del BCE de ese día o el anterior más cercano) y baja con
   lo que costaron los tokens de cada venta de un inmueble (sus compras más
   antiguas primero), no con lo cobrado: así es lo pagado por lo que tienes
   y la cifra cuadra con el desglose de debajo. Como el motor fiscal: una
   compra por transferencia vale su coste en € y las demás, su importe en
   USD; solo cuenta la compra de un inmueble, no un pago en stablecoin
   sin token (el motor no le abre lote). Los canjes de un token por
   otro (compra «CANJE» y su venta sin importe en el mismo hash) no
   cambian nada: lo que costaron pasa al token nuevo. Una compra o venta sin importe (p. ej. un pago conjunto por
   repartir), una compra en € sin tipo del BCE o una fecha que no existe o
   es imposible no se inventa: queda fuera y se cuenta. Devuelve
   { movimientos: [{ fecha, delta, invertido }] (con fecha, en orden),
   compras, ventas, sinImporte, sinCambio, sinFecha, ventasSinCambio (cobradas
   en € sin tipo del BCE: en el gráfico, sin su ganancia) } y lo que queda, en la
   moneda en que se pagó: eurBanco (por transferencia, en €) y usdStable (en USDT o USDC,
   también desde el vault, y las de transferencia pagadas en USD: el
   pagado_usd de su ajuste, «En USD…» de 💶, que cuenta tal cual).
   Para el valor nominal, también lo que queda de cada compra: colas
   (Map contrato → lotes { cant, usd, eur, moneda, ajuste }) y sinCantidad
   (los lotes sin cantidad, con su contrato); moneda es lo que dice la
   compra de la moneda del proyecto (dashVotoMoneda) y ajuste, que su coste
   lo pusiste tú y no casa con 100 por token. */
const DASH_VIAS_COMPRA = ["BANCARIA", "ONCHAIN", "VAULT"];
/* Antes de esto o más de un año en el futuro, la fecha es una
   errata (un ajuste a mano, un timeStamp 0) y alargaría el gráfico sin fin. */
const DASH_FECHA_MIN = "2015-01-01";
/* Tipo USD/EUR del BCE de una fecha o, si ese día no lo hay, del anterior
   más cercano (la búsqueda de ccEurOrientativo, js/15) si no tiene más de
   4 días (el tope lo pone ccEurOrientativo); null si no hay ninguno. */
function dashTipoBce(tiposBce, fecha, cache) {
  const bce = ccEurOrientativo(1, fecha, tiposBce, cache);
  return bce ? Number(tiposBce[bce.fecha]) : null;
}

/* ¿Fecha de un movimiento que se puede dibujar? */
function dashFechaDibujable(fecha) {
  if (!dashFechaValida(fecha)) return false;
  const tope = (new Date().getUTCFullYear() + 1) + "-12-31";
  return fecha.slice(0, 10) >= DASH_FECHA_MIN && fecha.slice(0, 10) <= tope;
}

function dashDineroInvertido(registros, tiposBce, ajustes, cache) {
  const positivo = ccEsNumeroPositivo;
  // En orden de fecha (a igual hora, las compras antes): cada venta saca
  // los tokens de las compras más antiguas de su inmueble (FIFO).
  const esCompra = r => r.categoria === "COMPRA" ? 0 : 1;
  const lista = ordenarPorFecha((registros || []).filter(Boolean).slice(), (a, b) => esCompra(a) - esCompra(b));
  /* Los canjes de cada hash (compra «CANJE», los tokens nuevos): su venta
     sin importe (el burn) pasa lo que costaron al token nuevo. */
  const canjes = new Map();
  for (const r of lista) if (r.categoria === "COMPRA" && r.via_compra === "CANJE") canjes.set(r.hash, (canjes.get(r.hash) || []).concat(r));
  const res = { movimientos: [], compras: 0, ventas: 0, sinImporte: 0, sinCambio: 0, sinFecha: 0, eurBanco: 0, usdStable: 0,
    sinCalcular: new Map(), gananciaVentas: 0, ventasSinCobro: 0, ventasSinCambio: 0 };
  // Con dos claves iguales tras normalizar, la primera (como ccBuscarAjuste).
  const porClave = new Map();
  for (const [c, a] of Object.entries(ajustes || {})) if (!porClave.has(ccClaveAjuste(c))) porClave.set(ccClaveAjuste(c), a);
  const enUsd = new Map([...porClave].map(([c, a]) => [c, ccPagadoUsd(a, tiposBce, cache)]) // con la cache, como 💶
    .filter(([, u]) => u));
  const tipos = new Map(); // el tipo del BCE de cada día, buscado una vez
  const tipoDia = (dia, conCache) => {
    const k = dia + (conCache ? "+" : "");
    if (!tipos.has(k)) tipos.set(k, dashTipoBce(tiposBce, dia, conCache ? cache : undefined));
    return tipos.get(k);
  };
  // Lo que queda de cada compra por inmueble: { cant, usd, eur } (eur: lo
  // pagado en € por transferencia; si no, null). Sin cantidad, aparte.
  const colas = new Map(), sinCantidad = [];
  const cola = c => { const k = normalizarDireccion(c || ""); if (!colas.has(k)) colas.set(k, []); return colas.get(k); };
  const sacar = (q, cantidad) => {
    const trozos = [];
    let falta = cantidad;
    while (falta > 1e-12 && q.length) {
      const l = q[0], todo = falta >= l.cant - 1e-12, f = todo ? 1 : falta / l.cant;
      const t = Object.assign({}, l, { cant: l.cant * f, usd: l.usd * f, eur: l.eur === null ? null : l.eur * f });
      if (todo) q.shift();
      else { l.cant -= t.cant; l.usd -= t.usd; if (l.eur !== null) l.eur -= t.eur; }
      trozos.push(t);
      falta -= t.cant;
    }
    return trozos;
  };
  /* Una compra que queda fuera (sin fecha, sin tipo del BCE o sin importe)
     sigue diciendo la moneda en que se pagó, para el valor nominal. */
  const omitir = (r, contador, motivo) => {
    res[contador]++;
    const k = normalizarDireccion(r.contrato || "");
    if (!res.sinCalcular.has(k)) res.sinCalcular.set(k, { motivo,
      moneda: r.via_compra === "BANCARIA" && !enUsd.has(ccClaveAjuste(r.clave)) ? "EUR" : "USD" });
  };
  for (const r of lista) {
    const compra = r.categoria === "COMPRA" && DASH_VIAS_COMPRA.includes(r.via_compra) &&
      !!String(r.inmueble || "").trim() && !STABLECOINS.has(normalizarDireccion(r.contrato || ""));
    const venta = r.categoria === "VENTA" && r.subcategoria === "GPP_INMUEBLE";
    if (!compra && !venta) continue;
    if (venta && !positivo(r.importe_usdt) && !positivo(r.cobrado_eur) && (canjes.get(r.hash) || []).length) {
      const nuevo = canjes.get(r.hash).shift();
      const viejoK = normalizarDireccion(r.contrato || ""), nuevoK = normalizarDireccion(nuevo.contrato || "");
      for (const l of sinCantidad) if (l.contrato === viejoK) l.contrato = nuevoK;
      if (res.sinCalcular.has(viejoK) && !res.sinCalcular.has(nuevoK)) res.sinCalcular.set(nuevoK, res.sinCalcular.get(viejoK));
      if (positivo(r.cantidad) && positivo(nuevo.cantidad)) {
        const escala = nuevo.cantidad / r.cantidad;
        for (const t of sacar(cola(r.contrato), r.cantidad)) cola(nuevo.contrato).push(Object.assign(t, { cant: t.cant * escala }));
      }
      continue;
    }
    if (!dashFechaDibujable(r.fecha)) { if (compra) omitir(r, "sinFecha", "sin fecha"); else res.sinFecha++; continue; }
    if (venta) {
      // Baja lo que costaron los tokens vendidos, no lo cobrado.
      if (!positivo(r.cantidad)) { res.sinImporte++; continue; }
      const trozos = sacar(cola(r.contrato), r.cantidad);
      if (!trozos.length) continue; // su compra ya quedó fuera (y se dice)
      res.ventas++;
      const coste = trozos.reduce((s, t) => s + t.usd, 0), vendidos = trozos.reduce((s, t) => s + t.cant, 0);
      res.movimientos.push({ fecha: r.fecha, instante: r.instante, delta: -coste });
      // Lo ganado: lo cobrado (por los tokens con compra contada) menos lo
      // que costaron. Sin lo cobrado, o a revisar (un pago diferido cobrado
      // a medias), no se sabe: no suma y se cuenta. Cobrada en € (P25), en
      // USD con el BCE del día, como una compra en €.
      let cobrado = positivo(r.importe_usdt) ? r.importe_usdt : null;
      if (cobrado === null && positivo(r.cobrado_eur)) {
        const tipo = tipoDia(r.fecha.slice(0, 10));
        if (tipo === null) { res.ventasSinCambio++; continue; } // su coste ya salió del gráfico; falta su ganancia
        cobrado = r.cobrado_eur * tipo;
      }
      if (cobrado !== null && r.revisar !== true) res.gananciaVentas += cobrado * vendidos / r.cantidad - coste;
      else res.ventasSinCobro++;
      continue;
    }
    let importe = null, tipo = null;
    const banco = r.via_compra === "BANCARIA";
    const usdBanco = banco ? enUsd.get(ccClaveAjuste(r.clave)) : undefined;
    const enEur = banco && !usdBanco;
    if (usdBanco) { importe = usdBanco.importe; tipo = tipoDia(usdBanco.fecha, true); } // pagada en USD: lo pagado
    else if (enEur) { // en €, como el motor
      if (positivo(r.coste_eur)) {
        tipo = tipoDia(r.fecha.slice(0, 10));
        if (tipo === null) { omitir(r, "sinCambio", "sin tipo del BCE"); continue; }
        importe = r.coste_eur * tipo;
      }
    } else if (positivo(r.importe_usdt)) { importe = r.importe_usdt; tipo = tipoDia(r.fecha.slice(0, 10)); }
    if (importe === null) { omitir(r, "sinImporte", "sin importe"); continue; }
    res.compras++;
    // El coste por defecto de una transferencia (100 €/token por
    // configuración) no dice nada de la moneda: solo el que pusiste tú
    // (la regla de cbSupuesto, js/20).
    const aj = banco ? porClave.get(ccClaveAjuste(r.clave)) : null;
    const puesto = !banco || (pdEsObjeto(aj) && "coste_eur" in aj);
    const moneda = puesto && positivo(r.cantidad) ? dashVotoMoneda(importe / r.cantidad, tipo) : null;
    const lote = { cant: r.cantidad, usd: importe, eur: enEur ? r.coste_eur : null, moneda,
      ajuste: banco && puesto && tipo !== null && !moneda };
    if (positivo(r.cantidad)) cola(r.contrato).push(lote);
    else sinCantidad.push(Object.assign(lote, { contrato: normalizarDireccion(r.contrato || "") }));
    res.movimientos.push({ fecha: r.fecha, instante: r.instante, delta: importe });
  }
  // Lo que queda, en la moneda en que se pagó.
  for (const l of [].concat(...colas.values(), sinCantidad)) {
    if (l.eur !== null) res.eurBanco += l.eur; else res.usdStable += l.usd;
  }
  res.colas = colas;
  res.sinCantidad = sinCantidad;
  ordenarPorFecha(res.movimientos);  // por el instante real
  let total = 0;
  for (const m of res.movimientos) { total += m.delta; m.invertido = red6(total); }
  return res;
}

/* Valor nominal: lo que Reental llama «Invertido» de cada proyecto, los
   tokens que tienes × 100 en la moneda del proyecto (€ o $). La moneda no
   viene en ningún dato: la dice el precio de cada compra frente a 100 $ y a
   100 € con el BCE de su día. */
const DASH_NOMINAL = 100;
const DASH_CASA = 0.02; // ±2 %: lo que se aleja más no vota

/* La moneda del proyecto que dice una compra, por su precio por token en
   USD y el tipo del BCE de su día: "USD", "EUR" (la más cercana) o null
   (ninguna casa, o sin tipo). */
function dashVotoMoneda(precioUsd, tipo) {
  if (!(precioUsd > 0) || !(tipo > 0)) return null;
  const dUsd = Math.abs(precioUsd / DASH_NOMINAL - 1), dEur = Math.abs(precioUsd / (DASH_NOMINAL * tipo) - 1);
  const [moneda, d] = dUsd <= dEur ? ["USD", dUsd] : ["EUR", dEur];
  return d <= DASH_CASA ? moneda : null;
}

/* Los tokens se enseñan con 2 decimales: menos de 0,01 no se marca. */
const DASH_TOKENS_MIN = 0.005;
/* Lo que vale cada céntimo que se enseña. */
const dashCent = x => Math.round(x * 100) / 100;

/* El valor nominal de lo que tienes, de los saldos de «🧱 Tu cartera»
   (dashCarteraTokens) y lo que queda de cada compra (dashDineroInvertido).
   Moneda del proyecto: la de la mayoría (por tokens) de sus compras que
   casan; si ninguna casa, la moneda en que lo pagaste. Un proyecto sin
   ninguna compra queda fuera de los totales (moneda null), salvo si la
   compra quedó fuera de lo pagado (sin fecha, sin tipo del BCE o sin
   importe): entonces, la moneda en que se pagó y el motivo. Cada fila:
   { nombre, contrato, tokens, moneda, nominal, costeEur, costeUsd, ajuste,
   sinPrecio, motivo, sinCompra (tokens de más frente a las compras),
   sinSaldo (tokens comprados que ya no están) }. Devuelve { filas, eur,
   usd, bce (el último tipo del BCE, solo si hay €), aprox (≈ USD con él,
   o null) y fuera (lo pagado de inmuebles que no están en «🧱 Tu
   cartera»: { n, costeEur, costeUsd }, o null) }; las filas y fuera suman
   lo pagado de la tarjeta. */
function dashValorNominal(invertido, cartera, bce) {
  if (!invertido || !invertido.colas || !cartera || !Array.isArray(cartera.items)) return null;
  const filas = cartera.items.map(it => {
    const lotes = invertido.colas.get(it.contrato) || [];
    const sinPrecio = invertido.sinCantidad.filter(l => l.contrato === it.contrato);
    const todos = lotes.concat(sinPrecio);
    const votos = { EUR: 0, USD: 0 };
    for (const l of lotes) if (l.moneda) votos[l.moneda] += l.cant;
    const omitida = invertido.sinCalcular && invertido.sinCalcular.get(it.contrato);
    const moneda = !todos.length ? (omitida ? omitida.moneda : null)
      : votos.EUR || votos.USD ? (votos.EUR >= votos.USD ? "EUR" : "USD")
      : todos.some(l => l.eur !== null) ? "EUR" : "USD";
    const dif = red6(it.n - lotes.reduce((t, l) => t + l.cant, 0));
    // Lo que no llega a 0,01 tokens no se marca (se ve con 2 decimales).
    const cuenta = x => x >= DASH_TOKENS_MIN ? x : 0;
    // Con una compra sin cantidad o fuera de lo pagado no se sabe cuántos faltan.
    const seSabe = moneda && !sinPrecio.length && !omitida;
    return { nombre: it.nombre, contrato: it.contrato, tokens: it.n, moneda,
      nominal: moneda ? dashCent(it.n * DASH_NOMINAL) : null,
      costeEur: todos.reduce((t, l) => t + (l.eur || 0), 0),
      costeUsd: todos.reduce((t, l) => t + (l.eur === null ? l.usd : 0), 0),
      ajuste: todos.some(l => l.ajuste), sinPrecio: sinPrecio.length > 0, motivo: omitida ? omitida.motivo : "",
      sinCompra: seSabe ? cuenta(dif) : 0, sinSaldo: seSabe ? cuenta(-dif) : 0 };
  });
  // Lo pagado de los inmuebles que no están en la cartera (enviados a
  // otra wallet, con dudas, con saldo negativo…).
  const enCartera = new Set(filas.map(f => f.contrato));
  const otros = [...invertido.colas].filter(([c, q]) => q.length && !enCartera.has(c)).concat(invertido.sinCantidad.filter(l => !enCartera.has(l.contrato)).map(l => [l.contrato, [l]]));
  const lotesFuera = [].concat(...otros.map(([, q]) => q));
  const fuera = otros.length ? { n: new Set(otros.map(([c]) => c)).size,
    costeEur: lotesFuera.reduce((t, l) => t + (l.eur || 0), 0),
    costeUsd: lotesFuera.reduce((t, l) => t + (l.eur === null ? l.usd : 0), 0) } : null;
  const suma = m => dashCent(filas.reduce((t, f) => t + (f.moneda === m ? f.nominal : 0), 0));
  const eur = suma("EUR"), usd = suma("USD");
  const conBce = eur > 0 && bce ? bce : null;
  return { filas, eur, usd, bce: conBce, aprox: conBce ? eur * conBce.valor + usd : null, fuera };
}

/* Rentabilidad media anual, desde la primera compra hasta hoy: lo repartido
   (íntegro, del archivo de Reental) más lo ganado en las ventas (USD, el
   FIFO de dashDineroInvertido, no el de 🧾 Fiscal en €), sobre el dinero
   invertido medio (la media de cada mes, de la serie mensual, hasta este
   mes), por años. Una cifra que saldría mal no se enseña: sin archivo de
   rendimientos, sin compras, con algo fuera del dinero invertido (sus
   rendimientos sumarían sin su coste), con una venta sin cobrar del todo,
   con fechas después de hoy o antes de 3 meses: { motivo }. Si no,
   { pct, rend, ventas, medio, anios, primera }. */
function dashRentabilidadMedia(invertido, mensual, rendimientos, hoy = hoyEspana()) {
  if (!rendimientos) return { motivo: "Sin archivo de rendimientos." };
  if (!invertido || !mensual || !mensual.length) return { motivo: "Sin compras de inmuebles con importe." };
  const fuera = invertido.sinImporte + invertido.sinCambio + invertido.sinFecha;
  if (fuera) return { motivo: dashCuantos(fuera, "compra o venta", "compras o ventas") + " fuera del dinero invertido (ver 💼)." };
  if (invertido.ventasSinCobro) return { motivo: dashCuantos(invertido.ventasSinCobro, "venta", "ventas") + " sin cobrar del todo (ver 🔍 Revisión)." };
  if (invertido.ventasSinCambio) return { motivo: dashCuantos(invertido.ventasSinCambio, "venta", "ventas") + " en € sin tipo del BCE." };
  if (mensual[mensual.length - 1].etiqueta > hoy.slice(0, 7)) return { motivo: "Un movimiento con fecha después de hoy." };
  const primera = invertido.movimientos[0].fecha.slice(0, 10);
  const [a, m, d] = primera.split("-").map(Number);
  if (hoy < fmtFecha(new Date(Date.UTC(a, m + 2, d)))) return { motivo: "Menos de 3 meses desde la primera compra." };
  // ponytail: un mes cuenta entero aunque la compra llegue a mitad; con años de historia apenas pesa.
  // La serie ya trae todos los meses seguidos; hasta hoy se repite el último.
  const meses = dashMesesEntre(mensual[0].etiqueta, hoy.slice(0, 7)).length;
  const medio = (mensual.reduce((t, p) => t + p.valor, 0) + (meses - mensual.length) * mensual[mensual.length - 1].valor) / meses;
  if (!(medio > 0)) return { motivo: "Sin dinero invertido de media." };
  const anios = ccDiasEntreFechas(hoy, primera) / 365.25;
  const rend = rendimientos.total, ventas = invertido.gananciaVentas;
  return { pct: 100 * (rend + ventas) / medio / anios, rend, ventas, medio, anios, primera };
}
function dashTituloRentabilidad(r) {
  return "Rendimientos " + dashNum(r.rend, 2) + " USD y " + (r.ventas < 0 ? "pérdida" : "ganancia") + " de ventas " +
    dashNum(Math.abs(r.ventas), 2) + " USD (en USD; 🧾 Fiscal va en €), sobre " + dashNum(r.medio, 2) +
    " USD invertidos de media, desde " + fechaEs(r.primera) + " (" + dashNum(r.anios, 1) + " años)";
}

/* Resumen del archivo de rendimientos (state.filasCsv, parser de js/10), en
   USD (USDT y USDC, 1 a 1) y por año del reparto. Todo son importes íntegros:
   - total = el íntegro repartido (columna distributed), nunca el neto;
   - reclamado = lo reclamado con su retención dentro (claimed + retained);
   - reinvested = lo reinvertido (no lleva retención);
   - pendiente = lo que falta hasta el íntegro (ni reclamado ni
     reinvertido); 0 si la fila suma más que su íntegro (no se corrige);
   - retained = la retención de Reental, aparte: se enseña, nunca se resta;
   - claimed = lo reclamado neto (lo que llegó), solo como dato.
   Las filas sin fecha válida forman el grupo "sin fecha" (se ven, no se
   ocultan ni se reparten).
   Con `registros` (la clasificación), cuenta lo que dicen
   tus decisiones: una fila cuyo registro ya no es un rendimiento (p. ej.
   «Movimiento neutro» en 🔍 Revisión) no suma (sinContar), y el íntegro y
   la retención son los del registro, por si los ajustaste. */
/* Una fecha "AAAA-MM-DD" (con o sin hora detrás) que existe. */
function dashFechaValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return false;
  const d = new Date(valor.slice(0, 10) + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === valor.slice(0, 10);
}

const DASH_CAMPOS_REND = ["total", "reclamado", "reinvested", "pendiente", "retained", "claimed"];
const dashRendCero = () => Object.fromEntries(DASH_CAMPOS_REND.map(k => [k, 0]));
/* Lo que no llega a medio céntimo no está pendiente, y una fila no «suma
   más que su íntegro» por menos. */
const DASH_TOLERANCIA = 0.005;

/* Cada fila del archivo con tus decisiones, con las reglas que
   comparten este Dashboard y 💰 Rendimientos (js/17), para que sus cifras no
   puedan dejar de cuadrar. Una fila cuyo registro ya no es un rendimiento
   no sale (sinContar); en las demás mandan el íntegro, la retención, la
   fecha y el inmueble del registro si los hay (un inmueble en blanco no
   borra el del archivo). Cada reparto:
   { clave, fila, reg, integro, retencion, reclamado (neto), reinvertido,
   pendiente, fecha, inmueble, reparto (una fila con todo a 0 no lo es),
   excedida (suma más que su íntegro) }. Devuelve { repartos,
   sinContar, claves }. */
function dashRepartos(filas, registros) {
  const lista = (filas || []).filter(Boolean);
  const claves = clavesRendimientosCsv(lista);
  const porClave = new Map((registros || []).filter(Boolean).map(x => [x.clave, x]));
  const num = (v, defecto) => (typeof v === "number" && Number.isFinite(v)) ? v : (Number(defecto) || 0);
  const repartos = [];
  let sinContar = 0;
  for (const f of lista) {
    const clave = claves[f.linea_csv];
    const reg = porClave.get(clave);
    if (reg && reg.categoria !== "RENDIMIENTO") { sinContar++; continue; }
    const reclamado = num(f.claimed), reinvertido = num(f.reinvested);
    const retencion = num(reg && reg.retencion_usdt, f.retained);
    const integro = num(reg && reg.integro_usdt, f.distributed);
    // Sin redondear la fila; un resto de hasta medio céntimo no es pendiente.
    const resto = integro - reinvertido - reclamado - retencion;
    const fechaReg = reg && dashFechaValida(reg.fecha) ? reg.fecha.slice(0, 10) : null;
    repartos.push({
      clave, fila: f, reg, integro, retencion, reclamado, reinvertido,
      pendiente: resto > DASH_TOLERANCIA ? resto : 0,
      fecha: fechaReg || (f.fecha_reparto ? fmtFecha(enHoraEspanola(f.fecha_reparto)) : null),
      // Con la hora, para las dos horas al pasar el ratón en 💰.
      fechaHora: fechaReg ? reg.fecha : (f.fecha_reparto ? fmtFechaHora(enHoraEspanola(f.fecha_reparto)) : null),
      inmueble: String(reg && reg.inmueble || "").trim() || String(f.inmueble || "").trim(),
      reparto: integro > 0 || reinvertido > 0 || reclamado > 0 || retencion > 0,
      excedida: reinvertido + reclamado + retencion > integro + DASH_TOLERANCIA,
    });
  }
  return { repartos, sinContar, claves };
}

/* Los rendimientos del libro que no vienen de una fila del archivo
   (los que diste por buenos en 🔍 Revisión) están en el informe pero no en
   estas cifras: se cuentan para decirlo. { n, total }. */
function dashFueraArchivo(registros, claves) {
  const deFilas = new Set(Object.values(claves));
  const fuera = (registros || []).filter(x => x && x.categoria === "RENDIMIENTO" && !deFilas.has(x.clave));
  return { n: fuera.length, total: red6(fuera.reduce((t, x) => {
    const v = [x.integro_usdt, x.importe_usdt].find(n => typeof n === "number" && Number.isFinite(n));
    return t + (v || 0);
  }, 0)) };
}

function dashRendimientosResumen(filas, registros = null) {
  const CAMPOS = DASH_CAMPOS_REND, cero = dashRendCero;
  const redondear = o => Object.fromEntries(Object.entries(o)
    .map(([k, v]) => [k, CAMPOS.includes(k) ? red6(v) : v]));
  const suma = cero();
  let sinFecha = 0, contadas = 0, excedidas = 0;
  const porPeriodo = new Map(), porMes = new Map(), porInmueble = new Map();
  const { repartos, sinContar, claves } = dashRepartos(filas, registros);
  for (const x of repartos) {
    const reparto = x.reparto ? 1 : 0;
    contadas += reparto;
    if (x.excedida) excedidas++;
    const v = { total: x.integro, reclamado: x.reclamado + x.retencion, reinvested: x.reinvertido,
                pendiente: x.pendiente, retained: x.retencion, claimed: x.reclamado };
    const fecha = x.fecha;
    const periodo = fecha ? fecha.slice(0, 4) : "sin fecha";
    if (!fecha) sinFecha++;
    // También por mes del reparto y por inmueble (las mismas partes).
    const inmueble = x.inmueble || "(sin inmueble)";
    // El mismo inmueble escrito distinto («Cáceres», «Caceres») es
    // una sola fila del ranking, con el primer nombre visto.
    const grupos = [[porPeriodo, periodo], [porInmueble, normalizarNombreInmueble(inmueble) || inmueble, inmueble]];
    if (fecha) grupos.push([porMes, fecha.slice(0, 7)]);
    for (const [mapa, clave, nombre] of grupos) {
      const e = mapa.get(clave) || Object.assign({ periodo: nombre || clave, filas: 0 }, cero());
      for (const k of CAMPOS) e[k] += v[k];
      e.filas += reparto;
      mapa.set(clave, e);
    }
    for (const k of CAMPOS) suma[k] += v[k];
  }
  const grupos = [...porPeriodo.values()]
    .filter(p => p.periodo !== "sin fecha")
    .sort((a, b) => a.periodo.localeCompare(b.periodo));
  const sin = porPeriodo.get("sin fecha");
  if (sin) grupos.push(sin);
  const fueraArchivo = dashFueraArchivo(registros, claves);
  const meses = [...porMes.values()].sort((a, b) => a.periodo.localeCompare(b.periodo));
  const inmuebles = [...porInmueble.values()]
    .sort((a, b) => b.total - a.total || a.periodo.localeCompare(b.periodo));
  return Object.assign({ filas: contadas, sinFecha, sinContar, excedidas, fueraArchivo, porPeriodo: grupos.map(redondear),
    porMes: meses.map(redondear), porInmueble: inmuebles.map(redondear) }, redondear(suma));
}

/* Las columnas del gráfico de rendimientos: todos los meses (o los
   años) entre el primero y el último; uno sin repartos es una columna a
   0, no se salta. Lo que no tiene fecha no entra (lo dice la nota de la
   tarjeta). */
const DASH_MAX_AÑOS = 50; // más años seguidos no se rellenan (fechas raras)
const DASH_MAX_MESES = 120; // con más, «Por mes» no cabe y va por año

/* Meses entre el primer y el último reparto con fecha (0 si ninguno). */
function dashMesesDeLosRepartos(rendimientos) {
  const meses = rendimientos.porMes || [];
  if (!meses.length) return 0;
  const [y0, m0] = meses[0].periodo.split("-").map(Number);
  const [y1, m1] = meses[meses.length - 1].periodo.split("-").map(Number);
  return (y1 - y0) * 12 + (m1 - m0) + 1;
}
function dashColumnasRendimientos(rendimientos, vista) {
  if (vista !== "mes") {
    const anios = rendimientos.porPeriodo.filter(p => p.periodo !== "sin fecha");
    if (!anios.length) return [];
    const a0 = +anios[0].periodo, a1 = +anios[anios.length - 1].periodo;
    if (!(a1 - a0 < DASH_MAX_AÑOS)) return anios;
    const porClave = new Map(anios.map(p => [p.periodo, p]));
    return Array.from({ length: a1 - a0 + 1 }, (_, k) => String(a0 + k).padStart(4, "0"))
      .map(clave => porClave.get(clave) || Object.assign({ periodo: clave, filas: 0 }, dashRendCero()));
  }
  const meses = rendimientos.porMes || [];
  if (!meses.length) return [];
  const porClave = new Map(meses.map(m => [m.periodo, m]));
  return dashMesesEntre(meses[0].periodo, meses[meses.length - 1].periodo)
    .map(clave => porClave.get(clave) || Object.assign({ periodo: clave, filas: 0 }, dashRendCero()));
}

/* Por número de tokens: lo que tienes de cada inmueble del catálogo (confirmado) en tu wallet y tu
   vault, según las transferencias descargadas: lo que entra menos lo que
   sale (entre tu wallet y tu vault no cambia nada). Un saldo negativo (falta
   historia en la descarga) no se dibuja: se cuenta aparte. */
/* Los tokens que tienes de cada token del catálogo (confirmado o con
   dudas) en tu wallet y tu vault: { saldos: Map contrato → saldo (sin
   redondear), ignorados, ilegibles (Set de los contratos con algún
   movimiento que no se pudo leer: su saldo no es seguro), inmuebles }. También lo usa el catálogo de 🔍
   (js/11, «Ver todos»). */
function dashSaldosCatalogo(cache) {
  const inmuebles = inmueblesConfirmadosCache(cache);
  // Los que mandaste enteros al spam no (como el catálogo de 🔍 Revisión).
  const dudas = dudasCatalogoCache(cache); // js/14
  const wallet = walletConfig();
  const tuya = a => { const d = normalizarDireccion(a || ""); return (!!wallet && d === wallet) || esDelVault(d); };
  const saldos = new Map();
  let ignorados = 0;
  const ilegibles = new Set();
  for (const tx of transfersUnificadosClasificacion(cache)) {
    const contrato = normalizarDireccion(tx.contractAddress || "");
    // Solo las del catálogo (con `in`, «constructor» o «__proto__» de
    // una cache escrita a mano pasarían por inmuebles).
    if (!Object.prototype.hasOwnProperty.call(inmuebles, contrato) && !dudas.has(contrato)) continue;
    const q = cantidadTx(tx);
    if (q === null || !Number.isFinite(q)) { ignorados++; ilegibles.add(contrato); continue; }
    saldos.set(contrato, (saldos.get(contrato) || 0) + (tuya(tx.to) ? q : 0) - (tuya(tx.from) ? q : 0));
  }
  return { saldos, ignorados, ilegibles, inmuebles };
}
function dashCarteraTokens(cache) {
  if (!cache || !cache.transacciones) return null;
  // Los «con dudas» no cuentan (solo los confirmados), pero se dice
  // cuántos tienen tokens, para que no desaparezcan sin aviso.
  const { saldos, ignorados, inmuebles } = dashSaldosCatalogo(cache);
  const items = [];
  let negativos = 0, conDudas = 0;
  for (const [contrato, n] of saldos) {
    const tokens = red6(n);
    if (!Object.prototype.hasOwnProperty.call(inmuebles, contrato)) { if (tokens > 0) conDudas++; continue; }
    if (tokens < 0) { negativos++; continue; }
    if (tokens === 0) continue;
    // Siempre un texto (un nombre escrito a mano como número rompería el orden).
    items.push({ nombre: String(nombreInmueble(contrato, { inmuebles }) || inmuebles[contrato].simbolo || txHashCorto(contrato)), n: tokens, contrato });
  }
  items.sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
  return { total: red6(items.reduce((t, it) => t + it.n, 0)), items, negativos, ignorados, conDudas };
}

/* Recuentos de la clasificación (state.registros) para las métricas:
   movimientos y a revisar (resumenDiario() de js/14).
   «Movimientos» es la misma cifra que 📒 Transacciones (sin el spam ni
   los cobros que van dentro de su venta, txTotalRecuento de js/18), no
   todos los registros. «A revisar»
   es el número del menú de 🔍 Revisión (ccColaRevision de js/15: también
   las salidas por vincular), no solo lo marcado a revisar. */
function dashCategoriasResumen(registros) {
  let total = registros.length;
  if (typeof txTotalRecuento === "function" && typeof txRelacionesVinculos === "function") {
    const ventas = typeof ccVentasGuardadas === "function" ? ccVentasGuardadas() : [];
    total = txTotalRecuento(registros, { q: "", ocultarSpam: true, plegarCobros: true },
      txRelacionesVinculos(registros, ventas), false);
  }
  const revisar = typeof ccColaRevision === "function" && typeof ccContextoSesion === "function"
    ? ccColaRevision(registros, ccContextoSesion(registros)).length
    : resumenDiario(registros).revisar.length;
  return { total, revisar };
}

/* Último tipo de cambio BCE de la cache (USD por EUR), por fecha; uno
   que no es un número mayor que 0 (escrito a mano) no cuenta. */
function dashUltimoTipoBce(cache) {
  const tipos = (cache && cache.tipos_bce) || {};
  const fechas = Object.keys(tipos).filter(f => Number(tipos[f]) > 0).sort();
  if (!fechas.length) return null;
  const fecha = fechas[fechas.length - 1];
  return { fecha, valor: Number(tipos[fecha]) };
}

/* ----------------------------- Gráficos SVG (a mano) ----------------------------- */

/* Escalas comunes: rango con 0 anclado cuando los datos lo permiten y 8 %
   de aire superior; etiquetas de eje redondeadas. */
function dashRango(valores) {
  let minV = Math.min(0, ...valores);
  let maxV = Math.max(0, ...valores);
  if (minV === maxV) maxV = minV + 1;
  const rango = maxV - minV;
  return { top: maxV + rango * 0.08, bot: minV === 0 ? 0 : minV - rango * 0.08 };
}
function dashEjesY(bot, top, W, L, R, H, T, B, tramos = 4, dec = 0) {
  const Y = v => T + (H - T - B) * (1 - (v - bot) / (top - bot));
  let svg = "";
  for (let k = 0; k <= tramos; k++) {
    const v = bot + (top - bot) * k / tramos;
    const y = Y(v);
    svg += '<line class="dash-grid-l" x1="' + L + '" y1="' + y.toFixed(1) +
           '" x2="' + (W - R) + '" y2="' + y.toFixed(1) + '"/>' +
           '<text class="dash-ax" x="' + (L - 8) + '" y="' + (y + 4).toFixed(1) +
           '" text-anchor="end">' + dashEsc(dashNum(v, dec)) + "</text>";
  }
  return { svg, Y };
}

/* Gráfico de línea + área del dinero invertido (serie mensual): rejilla,
   etiquetas de mes cada ~6 puntos, punto final y extremos destacados. Con
   un solo mes se dibuja únicamente el punto (una línea implicaría historia
   que no existe). Cada mes lleva encima una zona transparente con su punto
   escondido, para el bocadillo (como las barras de los rendimientos). */
function dashSvgLinea(serie) {
  const W = 760, H = 250, L = 64, R = 16, T = 16, B = 30;
  const n = serie.length;
  const valores = serie.map(p => p.valor);
  // Escalones redondos como el de los rendimientos.
  const eje = dashEjeRedondoRango(Math.min(...valores), Math.max(...valores));
  const { top, bot } = eje;
  const X = i => n === 1 ? L + (W - L - R) / 2 : L + (W - L - R) * i / (n - 1);
  const { svg: rejilla, Y } = dashEjesY(bot, top, W, L, R, H, T, B, eje.tramos, eje.dec);
  const pasoX = Math.max(1, Math.ceil(n / 6));
  let etiquetas = "";
  serie.forEach((p, i) => {
    if (i % pasoX !== 0 && i !== n - 1) return;
    etiquetas += '<text class="dash-ax" x="' + X(i).toFixed(1) + '" y="' + (H - 9) +
                 '" text-anchor="middle">' + dashMesCorto(p.etiqueta) + "</text>";
  });
  const puntos = serie.map((p, i) => X(i).toFixed(1) + "," + Y(p.valor).toFixed(1));
  const camino = "M" + puntos.join(" L");
  let cuerpo = "";
  if (n > 1) {
    const area = camino + " L" + X(n - 1).toFixed(1) + "," + Y(bot).toFixed(1) +
                 " L" + X(0).toFixed(1) + "," + Y(bot).toFixed(1) + " Z";
    cuerpo = '<path class="dash-area" d="' + area + '"/>' +
             '<path class="dash-linea" d="' + camino + '"/>';
  }
  const maxIdx = valores.indexOf(Math.max(...valores));
  const minIdx = valores.indexOf(Math.min(...valores));
  const pasoP = Math.max(1, Math.ceil(n / 20));
  let circulos = "";
  serie.forEach((p, i) => {
    if (i % pasoP !== 0 && i !== n - 1 && i !== maxIdx && i !== minIdx) return;
    circulos += '<circle class="dash-punto" cx="' + X(i).toFixed(1) + '" cy="' + Y(p.valor).toFixed(1) + '" r="3.4"/>';
  });
  const hueco = n === 1 ? W - L - R : (W - L - R) / (n - 1);
  const zonas = serie.map((p, i) => {
    const x0 = Math.max(L, X(i) - hueco / 2), x1 = Math.min(W - R, X(i) + hueco / 2);
    return '<g class="dash-col" data-i="' + i + '"><rect class="dash-col-zona" x="' + x0.toFixed(1) + '" y="' + T +
      '" width="' + (x1 - x0).toFixed(1) + '" height="' + (H - T - B) + '"/><circle class="dash-punto dash-punto-sel" cx="' +
      X(i).toFixed(1) + '" cy="' + Y(p.valor).toFixed(1) + '" r="4.6"/></g>';
  }).join("");
  return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" aria-hidden="true">' +
         rejilla + etiquetas + cuerpo + circulos + zonas + "</svg>";
}

/* Las partes de cada columna, de abajo arriba; su suma es el íntegro
   (la retención va dentro de lo reclamado: no se resta). */
const DASH_PARTES = [["Reclamado", "reclamado", "dash-bar-a"],
                     ["Reinvertido", "reinvested", "dash-bar-b"],
                     ["Pendiente", "pendiente", "dash-bar-c"]];

/* Etiqueta de una columna: «ago 2025» (mes) o «2025» (año). */
function dashNombrePeriodo(periodo) {
  const m = /^(\d{4})-(\d{2})$/.exec(periodo);
  return m ? DASH_MESES[+m[2] - 1] + " " + m[1] : periodo;
}

/* El eje con escalones redondos (1, 2, 2,5 o 5 por una potencia de
   10), de 3 a 5 tramos, con el tope justo por encima de la barra más alta:
   42 → 0, 10… 50. */
/* El eje de dashEjeRedondo para valores de min a max, también
   por debajo de 0: escalones redondos, con el 0 en una línea. */
function dashEjeRedondoRango(min, max) {
  if (min >= 0) return Object.assign({ bot: 0 }, dashEjeRedondo(max));
  const e = dashEjeRedondo(Math.max(0, max) - min);
  const paso = e.top / e.tramos;
  const bot = Math.floor(min / paso) * paso, top = Math.max(paso, Math.ceil(Math.max(0, max) * 1.04 / paso) * paso);
  return { bot, top, tramos: Math.round((top - bot) / paso), dec: e.dec };
}
function dashEjeRedondo(maximo) {
  if (!(maximo > 0)) return { top: 4, tramos: 4, dec: 0 };
  const alto = maximo * 1.04;
  const p = Math.pow(10, Math.floor(Math.log10(alto / 5)));
  const paso = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => alto / k <= 5);
  const tramos = Math.max(3, Math.ceil(alto / paso));
  // Los decimales del escalón: 2,5 → 1; 0,25 → 2; hasta 0,000001.
  const dec = [0, 1, 2, 3, 4, 5, 6].find(d => Math.abs(paso * 10 ** d - Math.round(paso * 10 ** d)) < 1e-6) ?? 6;
  return { top: paso * tramos, tramos, dec };
}

/* Barras apiladas, una por mes o por año; el alto de la pila es
   el íntegro repartido. Cada columna lleva una zona transparente de todo el
   alto (para el bocadillo, js abajo); sin <title> en las partes: la
   etiqueta del navegador repetiría el bocadillo o lo taparía. Un 0 se
   dibuja como línea de 1 px en la base. Por mes, el
   eje solo nombra enero (o el primero y el último, si son pocos). */
function dashSvgApiladas(columnas) {
  const W = 760, H = 240, L = 52, R = 10, T = 14, B = 30;
  const n = columnas.length;
  // El eje alcanza toda la pila aunque una fila sume más que su íntegro.
  const alto = c => Math.max(c.total, DASH_PARTES.reduce((t, [, campo]) => t + (c[campo] > 0 ? c[campo] : 0), 0));
  const { top, tramos, dec } = dashEjeRedondo(Math.max(0, ...columnas.map(alto))), bot = 0;
  const { svg: rejilla, Y } = dashEjesY(bot, top, W, L, R, H, T, B, tramos, dec);
  const hueco = (W - L - R) / n;
  const ancho = Math.max(2, Math.min(40, hueco * 0.62));
  const y0 = Y(0);
  const porMes = /^\d{4}-\d{2}$/.test((columnas[0] || {}).periodo || "");
  let barras = "", ejes = "";
  columnas.forEach((c, i) => {
    const cx = L + hueco * i + hueco / 2;
    const x = (cx - ancho / 2).toFixed(1);
    let base = y0, partes = "";
    for (const [, campo, clase] of DASH_PARTES) {
      const v = c[campo];
      if (!(v > 0)) continue;
      const alto = y0 - Y(v);
      base -= alto;
      partes += '<rect class="' + clase + '" x="' + x + '" y="' + base.toFixed(1) + '" width="' + ancho.toFixed(1) +
        '" height="' + alto.toFixed(1) + '"/>';
    }
    if (!partes) partes = '<rect class="dash-cero" x="' + x + '" y="' + (y0 - 0.5).toFixed(1) + '" width="' + ancho.toFixed(1) + '" height="1"/>';
    barras += '<g class="dash-col" data-i="' + i + '"><rect class="dash-col-zona" x="' + (L + hueco * i).toFixed(1) + '" y="' + T +
      '" width="' + hueco.toFixed(1) + '" height="' + (H - T - B) + '"/>' + partes + "</g>";
    const nombra = !porMes || n <= 12 || c.periodo.endsWith("-01") || i === 0 || i === n - 1;
    if (nombra) {
      ejes += '<text class="dash-ax" x="' + cx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle">' +
        dashEsc(porMes ? dashMesCorto(c.periodo) : c.periodo) + "</text>";
    }
  });
  return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" aria-hidden="true">' + rejilla + barras + ejes + "</svg>";
}

/* Lo mismo que el bocadillo, en una frase para un lector de pantalla. */
function dashTextoBocadillo(c) {
  const partes = DASH_PARTES.filter(([, campo]) => c[campo] > 0).map(([nombre, campo]) =>
    nombre + " " + dashNum(c[campo], 2) + " USD" + (campo === "reclamado" && c.retained > 0 ? " (retención " + dashNum(c.retained, 2) + ")" : ""));
  return dashNombrePeriodo(c.periodo) + ": " + (partes.length ? partes.join(", ") + "; " : "") +
    "repartido " + dashNum(c.total, 2) + " USD; " + c.filas + (c.filas === 1 ? " reparto." : " repartos.");
}

/* El bocadillo de un mes del dinero invertido: el mes y lo invertido. */
function dashTextoBocadilloInvertido(p) {
  return dashNombrePeriodo(p.etiqueta) + ": invertido " + dashNum(p.valor, 2) + " USD.";
}
function dashHtmlBocadilloInvertido(p) {
  return "<b>" + dashEsc(dashNombrePeriodo(p.etiqueta)) + '</b><div class="dash-tip-f"><span>Invertido</span><b>' +
    dashEsc(dashNum(p.valor, 2)) + " USD</b></div>";
}

/* Lo que dice el bocadillo de una columna (HTML). */
function dashHtmlBocadillo(c) {
  let filas = "";
  for (const [nombre, campo, clase] of DASH_PARTES) {
    if (!(c[campo] > 0)) continue;
    filas += '<div class="dash-tip-f"><span class="dash-dot ' + clase + '"></span><span>' + nombre + "</span><b>" +
      dashEsc(dashNum(c[campo], 2)) + " USD</b></div>";
    if (campo === "reclamado" && c.retained > 0) {
      filas += '<div class="dash-tip-f sub"><span></span><span>de ello, retención</span><span>' +
        dashEsc(dashNum(c.retained, 2)) + " USD</span></div>";
    }
  }
  return "<b>" + dashEsc(dashNombrePeriodo(c.periodo)) + "</b>" + filas +
    '<div class="dash-tip-f total"><span></span><span>Repartido</span><b>' + dashEsc(dashNum(c.total, 2)) + " USD</b></div>" +
    '<div class="dash-hint">' + c.filas + (c.filas === 1 ? " reparto" : " repartos") + "</div>";
}

/* Anillo (donut: dasharray/dashoffset sobre círculos, centro con el
   total). Colores de DASH_PALETA (hex fijos legibles en ambos temas). De
   la cartera por tokens (items {nombre, n}). */
function dashSvgDonut(items, total, unidad) {
  const S = 186, r = 68, sw = 27, C = 2 * Math.PI * r;
  let acc = 0, segmentos = "";
  items.forEach((it, i) => {
    const color = DASH_PALETA[i % DASH_PALETA.length];
    const len = total > 0 ? C * it.n / total : 0;
    segmentos += '<circle cx="' + S / 2 + '" cy="' + S / 2 + '" r="' + r +
                 '" fill="none" stroke="' + color + '" stroke-width="' + sw +
                 '" stroke-dasharray="' + len.toFixed(2) + " " + (C - len).toFixed(2) +
                 '" stroke-dashoffset="' + (-acc).toFixed(2) +
                 '" transform="rotate(-90 ' + S / 2 + " " + S / 2 + ')"><title>' +
                 dashEsc(it.nombre) + ": " + dashEsc(dashNum(it.n, 2)) + " (" + dashEsc(dashPct(it.n, total)) +
                 " %)</title></circle>";
    acc += len;
  });
  return '<svg viewBox="0 0 ' + S + " " + S + '" width="' + S + '" aria-hidden="true">' +
         segmentos +
         '<text x="' + S / 2 + '" y="' + (S / 2 - 2) + '" text-anchor="middle" style="font-size:26px;font-weight:700;fill:var(--text)">' +
         // Con decimales si no es entero (si no, 42,77 saldría «43» y 0,4, «0»).
         dashEsc(dashNum(total, Number.isInteger(red6(total)) ? 0 : 2)) + "</text>" +
         '<text x="' + S / 2 + '" y="' + (S / 2 + 18) + '" text-anchor="middle" style="font-size:12px;font-weight:600;fill:var(--muted)">' + dashEsc(unidad) + "</text></svg>";
}

/* ----------------------------- Piezas de HTML ----------------------------- */

function dashMetrica(k, v, opts = {}) {
  const na = v === null || v === undefined;
  const color = opts.color ? ' style="color:' + opts.color + '"' : "";
  const titulo = opts.title ? ' title="' + dashEsc(opts.title) + '"' : "";
  const apertura = opts.href
    ? '<a class="dash-metric" href="' + opts.href + '"' + titulo + ">"
    : '<div class="dash-metric"' + titulo + ">";
  const cierre = opts.href ? "</a>" : "</div>";
  return apertura + '<div class="k">' + dashEsc(k) + "</div>" +
    (na ? '<div class="v dash-na">No disponible</div>'
        : '<div class="v"' + color + ">" + dashEsc(v) + "</div>") + cierre;
}

function dashTarjeta(titulo, hint, cuerpo, wide) {
  return '<div class="dash-card' + (wide ? " wide" : "") + '">' +
    '<div class="dash-head"><div><h3>' + titulo + "</h3>" +
    (hint ? '<div class="dash-hint">' + hint + "</div>" : "") + "</div></div>" +
    cuerpo + "</div>";
}

function dashNoDisponible(motivo, enlace) {
  return '<div class="dash-na-box"><b>No disponible</b>' +
    '<div class="dash-hint">' + motivo + "</div>" +
    (enlace ? '<a class="btn-link dash-na-link" href="' + enlace.href + '">' +
              enlace.texto + "</a>" : "") + "</div>";
}

function dashLeyenda(filas) {
  return '<div class="dash-legend">' + filas.map(f =>
    '<div class="dash-leg"><span class="dash-dot" style="background:' + f.color + '"></span>' +
    '<span class="nm">' + dashEsc(f.nombre) + "</span>" +
    '<span class="vv">' + dashEsc(f.valor) + "</span>" +
    '<span class="pc">' + dashEsc(f.pct) + " %</span></div>").join("") + "</div>";
}

/* ----------------------------- Tarjetas de cada bloque ----------------------------- */

function dashTarjetaInvertido(invertido, mensual, nominal) {
  const titulo = "💼 Dinero invertido";
  let cuerpo;
  dashNominal = dashNominal && !!invertido && mensual.length > 0;
  if (!invertido) {
    cuerpo = dashNoDisponible("Sin datos todavía.", { href: "#inicio", texto: "🚀 Ir a Puesta en marcha" });
  } else if (!mensual.length) {
    // Si algo quedó fuera, se dice qué (no «sin compras»).
    const hayFuera = invertido.sinImporte || invertido.sinCambio || invertido.sinFecha;
    cuerpo = dashNoDisponible(hayFuera ? "Ninguna compra en el gráfico." : "Sin compras de inmuebles con importe.") +
      dashAvisosInvertido(invertido);
  } else {
    dashSerieInvertido = mensual;
    const s = mensual, ultimo = s[s.length - 1].valor;
    const hayNominal = !!nominal && (nominal.eur > 0 || nominal.usd > 0);
    dashDatosNominal = hayNominal ? { nominal, invertido, ultimo } : null;
    // Si vuelve a salir, apagado (no encendido sin que lo veas).
    if (!hayNominal) dashNominal = false;
    if (hayNominal && dashNominal) return dashTarjeta(titulo, "", dashCuerpoNominal(nominal), true);
    // Los meses como en el bocadillo («mar 2024»), no «03/2024».
    const hint = dashEsc(dashNombrePeriodo(s[0].etiqueta)) + " – " + dashEsc(dashNombrePeriodo(s[s.length - 1].etiqueta)) +
      " · " + dashCuantos(invertido.compras, "compra", "compras") + " y " + dashCuantos(invertido.ventas, "venta", "ventas");
    const aria = "Gráfico de línea: dinero invertido de " + dashNombrePeriodo(s[0].etiqueta) + " (" + dashNum(s[0].valor, 2) +
      " USD) a " + dashNombrePeriodo(s[s.length - 1].etiqueta) + " (" + dashNum(ultimo, 2) + " USD).";
    cuerpo = '<div class="dash-value-lg">' + dashEsc(dashNum(ultimo, 2)) + "&nbsp;USD</div>" +
      dashDesgloseInvertido(invertido) +
      (hayNominal ? dashFilaNominal(nominal, false) : "") +
      '<div class="dash-hint">' + hint + "</div>" +
      '<div class="dash-chart dash-tipcaja dash-invertido" role="img" tabindex="0" aria-label="' + dashEsc(aria) + '">' +
      dashSvgLinea(s) + '<div class="dash-tip" hidden></div></div><div class="solo-lector" aria-live="polite"></div>' +
      dashAvisosInvertido(invertido);
  }
  return dashTarjeta(titulo, "", cuerpo, true);
}

/* «2.450,80 € · 1.012,25 $»: lo que es 0 no sale. */
function dashEurUsd(eur, usd, sep = " · ") {
  const hay = x => Math.round(x * 100) > 0;
  return [hay(eur) ? dashNum(eur, 2) + " €" : "", hay(usd) ? dashNum(usd, 2) + " $" : ""].filter(Boolean).map(dashEsc).join(sep);
}
/* «≈ 3.760,24 USD» si hay € y tipo del BCE; si no, € y $ tal cual. */
function dashAproxNominal(n) {
  return n.bce ? "≈ " + dashEsc(dashNum(n.aprox, 2)) + " USD" : dashEurUsd(n.eur, n.usd);
}

/* El interruptor «Valor nominal»: apagado, con el total al lado;
   encendido, con «Ver el detalle». */
function dashFilaNominal(n, encendido) {
  return '<div class="dash-nominal-fila"><label class="rv-interruptor dash-nominal-sw"><input type="checkbox" role="switch"' +
    (encendido ? " checked" : "") + '><span class="rv-interruptor-pista" aria-hidden="true"></span><span>Valor nominal</span></label>' +
    (encendido ? '<button type="button" class="dash-ver-detalle">Ver el detalle</button>'
      : '<span class="dash-nominal-k">' + dashAproxNominal(n) + "</span>") + "</div>";
}

/* La tarjeta con el interruptor encendido: el valor nominal (sin gráfico:
   no hay serie del nominal mes a mes). */
function dashCuerpoNominal(n) {
  const sinCompra = n.filas.filter(f => !f.moneda).length;
  const linea = n.bce
    ? '<div class="dash-desglose">' + dashAproxNominal(n) + ' <span class="dash-bce">(€ al BCE del ' +
      dashEsc(fechaEs(n.bce.fecha)) + ", " + dashEsc(dashNum(n.bce.valor, 4)) + ")</span></div>"
    : "";
  return '<div class="dash-value-lg">' + dashEurUsd(n.eur, n.usd, '<span class="dash-nominal-sep">·</span>') + "</div>" + linea +
    dashFilaNominal(n, true) +
    (sinCompra ? '<div class="dash-note">⚠ ' + dashCuantos(sinCompra, "inmueble sin compra", "inmuebles sin compra") + ", fuera del total.</div>" : "");
}

/* La ventana «Ver el detalle»: las dos cifras y cada inmueble. */
function dashHtmlDetalleNominal(d) {
  const { nominal: n, invertido: inv, ultimo } = d;
  // La línea bajo el título, también vacía: las dos cifras, a la misma altura.
  const caja = (titulo, sub, cifra, debajo) => '<div class="dash-dlg-caja"><div class="dash-dlg-t">' + titulo + "</div>" +
    '<div class="dash-dlg-k">' + (sub || "&nbsp;") + "</div><b>" + cifra + "</b>" +
    (debajo ? '<div class="dash-dlg-k">' + debajo + "</div>" : "") + "</div>";
  const fila = f => {
    const marcas = [f.ajuste ? "tu ajuste" : "", f.sinPrecio ? "sin precio por token" : "", f.motivo ? "compra " + f.motivo : "",
      f.sinCompra ? dashNum(f.sinCompra, 2) + " tokens sin compra" : "",
      f.sinSaldo ? dashNum(f.sinSaldo, 2) + " tokens que ya no tienes" : ""].filter(Boolean);
    return "<tr><td>" + dashEsc(f.nombre) + '</td><td class="n">' + dashEsc(dashNum(f.tokens, 2)) + '</td><td class="n">' +
      (f.moneda ? dashEurUsd(f.moneda === "EUR" ? f.nominal : 0, f.moneda === "USD" ? f.nominal : 0) : "—") + '</td><td class="n">' +
      (f.moneda ? dashEurUsd(f.costeEur, f.costeUsd) || "—" : "—") +
      marcas.map(m => ' <span class="dash-dlg-k">(' + dashEsc(m) + ")</span>").join("") + "</td></tr>";
  };
  const grupos = [["EUR", "Proyectos en €"], ["USD", "Proyectos en $"], [null, "Sin compra"]].map(([m, nombre]) => {
    const filas = n.filas.filter(f => f.moneda === m);
    return filas.length ? '<tr class="dash-dlg-grupo"><td colspan="4">' + nombre + "</td></tr>" + filas.map(fila).join("") : "";
  }).join("") + (n.fuera && dashEurUsd(n.fuera.costeEur, n.fuera.costeUsd)
    ? '<tr class="dash-dlg-grupo"><td colspan="4">Fuera de tu cartera</td></tr><tr><td>' +
      dashCuantos(n.fuera.n, "inmueble", "inmuebles") + '</td><td class="n">—</td><td class="n">—</td><td class="n">' +
      dashEurUsd(n.fuera.costeEur, n.fuera.costeUsd) + "</td></tr>"
    : "");
  return '<div class="dash-dlg-cab"><h3 id="dashDlgNominalTit">💼 Valor nominal y coste real</h3>' +
    '<button type="button" class="dash-dlg-x" aria-label="Cerrar">✕</button></div>' +
    "<p><b>Valor nominal</b> (lo que muestra la web de Reental como «Invertido»): 100 por token, en € o en $ según el proyecto, no lo que pagaste.</p>" +
    "<p><b>Coste real</b> es lo que cuenta en 🧾 Fiscal. La diferencia sale del cambio € / $ de cada compra y de tus ajustes de coste.</p>" +
    '<div class="dash-dlg-cajas">' +
    // El * del ≈ USD lleva a la nota de encima de la tabla.
    caja("Valor nominal", "(Lo que muestra la web de Reental)", dashEurUsd(n.eur, n.usd), n.bce ? dashAproxNominal(n) + "*" : "") +
    caja("Coste real", "", dashEurUsd(inv.eurBanco, inv.usdStable), dashEsc(dashNum(ultimo, 2)) + " USD") + "</div>" +
    '<p class="dash-dlg-pie">' + (n.bce ? "* " : "") + "Puede diferir de la web de Reental por el tipo de cambio (el ≈ USD usa el del BCE) y/o porque la moneda de cada proyecto (€ o $) la deduce la app de tus compras.</p>" +
    '<table><thead><tr><th>Inmueble</th><th class="n">Tokens</th><th class="n">Nominal</th><th class="n">Coste real</th></tr></thead><tbody>' +
    grupos + "</tbody></table>";
}

/* Abre la ventana con los datos del momento, en el <body> (un repintado de
   📊 no la borra); al cerrarla, el foco vuelve a «Ver el detalle». */
function dashAbrirDetalle() {
  if (!dashDatosNominal) return;
  const dlg = document.createElement("dialog");
  dlg.className = "arr-dlg dash-dlg";
  dlg.setAttribute("aria-labelledby", "dashDlgNominalTit");
  dlg.innerHTML = dashHtmlDetalleNominal(dashDatosNominal);
  document.body.appendChild(dlg);
  dlg.querySelector(".dash-dlg-x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("close", () => {
    dlg.remove();
    const boton = document.querySelector("#tarjetaMetricas .dash-ver-detalle") ||
      document.querySelector("#tarjetaMetricas .dash-nominal-sw input");
    if (boton) boton.focus();
  });
  dlg.showModal();
}

/* Debajo de la cifra, como lo pone Reental: lo comprado en € (por
   transferencia) y en $ (USDT o USDC), «€ 2.450,80  /  $ 1.012,25»; lo que
   es 0 no sale. */
function dashDesgloseInvertido(inv) {
  const partes = [];
  const hay = x => Math.round(x * 100) > 0; // «0,00» no sale
  if (hay(inv.eurBanco)) partes.push("€ " + dashNum(inv.eurBanco, 2));
  if (hay(inv.usdStable)) partes.push("$ " + dashNum(inv.usdStable, 2));
  return partes.length ? '<div class="dash-desglose">' + partes.map(dashEsc).join('<span class="dash-desglose-sep">/</span>') + "</div>" : "";
}

/* Lo que quedó fuera del dinero invertido, una línea por motivo. */
function dashAvisosInvertido(invertido) {
  const fuera = [[invertido.sinImporte, "compra o venta sin importe", "compras o ventas sin importe"],
                 [invertido.sinCambio, "compra en € sin tipo del BCE", "compras en € sin tipo del BCE"],
                 [invertido.sinFecha, "compra o venta sin fecha", "compras o ventas sin fecha"]];
  return fuera.filter(([n]) => n).map(([n, uno, varios]) =>
    '<div class="dash-note">⚠ ' + dashCuantos(n, uno, varios) + ": fuera del gráfico.</div>").join("");
}

/* Por qué no hay nada que dibujar, con el archivo cargado: todo
   quedó fuera por tus decisiones o el archivo no trae nada repartido. */
function dashSinRepartos(rendimientos) {
  return rendimientos.sinContar && !rendimientos.filas
    ? (rendimientos.sinContar === 1 ? "El reparto queda fuera por tus decisiones."
      : "Los " + rendimientos.sinContar + " repartos quedan fuera por tus decisiones.")
    : "El archivo no trae nada repartido.";
}

/* Las cifras del archivo aún no llevan tus decisiones de 🔍
   Revisión: no hay clasificación (al arrancar, mientras se descarga, o con
   la config mal escrita) y o no hay cache abierta o la cache tiene ajustes. */
function dashFaltanDecisiones(cache, registros) {
  if (registros) return false;
  if (!cache) return true;
  const ajustes = cache.ajustes_usuario;
  return !!ajustes && typeof ajustes === "object" && Object.keys(ajustes).length > 0;
}

/* «Por mes» o «Por año» (vive mientras la página está abierta). */
let dashVistaRend = "mes";
let dashColumnasRend = []; // las del gráfico pintado (las lee el bocadillo)
let dashSerieInvertido = []; // los meses del dinero invertido pintados (ídem)
/* «Valor nominal» encendido: apagado al entrar a 📊 (hashchange); se
   mantiene si 📊 se repinta sola estando en ella. */
let dashNominal = false;
let dashDatosNominal = null; // lo que enseña «Ver el detalle»

function dashTarjetaRendimientos(rendimientos, vista, faltanDecisiones) {
  vista = vista || dashVistaRend;
  // Una fecha rara (año 25, 1970) daría miles de meses: va por año.
  const sinMeses = !!rendimientos && vista === "mes" && dashMesesDeLosRepartos(rendimientos) > DASH_MAX_MESES;
  if (sinMeses) vista = "año";
  const titulo = "💰 Rendimientos";
  let cuerpo;
  if (!rendimientos) {
    cuerpo = dashNoDisponible("Sin archivo de rendimientos.",
      { href: "#inicio", texto: "📄 Cargar el archivo de rendimientos" });
  } else if (!(rendimientos.total > 0)) {
    cuerpo = dashNoDisponible(dashSinRepartos(rendimientos));
  } else {
    // Partes del íntegro: reclamado (con su retención dentro), reinvertido
    // y, solo si lo hay, pendiente. La retención va aparte, sin restarla.
    const partes = DASH_PARTES
      .filter(([, campo]) => campo !== "pendiente" || rendimientos.pendiente > 0)
      .map(([nombre, campo, clase]) => ({ color: "var(--" + clase.replace("bar-", "") + ")", nombre, v: rendimientos[campo] }));
    const hint = rendimientos.filas + " repartos del archivo de Reental" +
      (rendimientos.sinContar ? " (" + rendimientos.sinContar + " sin contar por tus decisiones)" : "") + " · USD";
    cuerpo = '<div class="dash-hint">' + hint + "</div>" +
      (faltanDecisiones ? '<div class="dash-note">⚠ Aún sin tus decisiones de Revisión: completa 🚀 Puesta en marcha.</div>' : "") +
      '<div class="dash-value-lg" style="margin-top:6px">' + dashEsc(dashNum(rendimientos.total, 2)) + "&nbsp;USD" +
      ' <span class="dash-value-k">íntegro</span></div>' +
      dashLeyenda(partes.map(p => ({ color: p.color, nombre: p.nombre,
        valor: dashNum(p.v, 2) + " USD", pct: dashPct(p.v, rendimientos.total) }))) +
      '<div class="dash-aparte"><span class="nm">Retención de Reental</span>' +
      '<span class="vv">' + dashEsc(dashNum(rendimientos.retained, 2)) + " USD</span>" +
      (rendimientos.retained > 0
        ? '<div class="dash-hint">De lo reclamado llegaron ' + dashEsc(dashNum(rendimientos.claimed, 2)) + " USD netos.</div>"
        : "") + "</div>";
    const columnas = dashColumnasRend = dashColumnasRendimientos(rendimientos, vista);
    const maximo = Math.max(0, ...columnas.map(c => c.total));
    const aria = "Gráfico de barras apiladas: íntegro repartido en USD por " + (vista === "mes" ? "mes" : "año") +
      ", de " + dashNombrePeriodo((columnas[0] || {}).periodo || "") + " a " +
      dashNombrePeriodo((columnas[columnas.length - 1] || {}).periodo || "") + "; máximo " + dashNum(maximo, 2) + " USD.";
    const boton = (v, texto) => '<button type="button" class="dash-vista" data-vista="' + v + '" aria-pressed="' +
      (vista === v) + '">' + texto + "</button>";
    cuerpo += '<div class="dash-subhead dash-subhead-fila"><span>Repartido cada ' + (vista === "mes" ? "mes" : "año") +
      '</span><span class="dash-vistas" role="group" aria-label="Agrupar por">' + boton("mes", "Por mes") + boton("año", "Por año") + "</span></div>";
    if (columnas.length) {
      cuerpo += '<div class="dash-hint">máx. ' + dashEsc(dashNum(maximo, 2)) + " USD/" + (vista === "mes" ? "mes" : "año") + "</div>" +
        '<div class="dash-chart dash-tipcaja dash-apiladas" role="img" tabindex="0" aria-label="' + dashEsc(aria) + '">' + dashSvgApiladas(columnas) +
        '<div class="dash-tip" hidden></div></div>' +
        // Lo que dice el bocadillo, para un lector de pantalla (fuera
        // del role="img", que no lee lo de dentro).
        '<div class="solo-lector" aria-live="polite"></div>';
    }
    if (rendimientos.sinFecha) {
      cuerpo += '<div class="dash-note">⚠ ' + dashCuantos(rendimientos.sinFecha, "reparto", "repartos") + " sin fecha: fuera del gráfico (sí en el total).</div>";
    }
    if (sinMeses) {
      cuerpo += '<div class="dash-note">⚠ ' + dashEsc(dashNum(dashMesesDeLosRepartos(rendimientos), 0)) +
        " meses entre el primer y el último reparto: van por año (revisa las fechas del archivo).</div>";
    }
    const fuera = rendimientos.fueraArchivo || { n: 0 };
    if (fuera.n) {
      cuerpo += '<div class="dash-note">⚠ ' + (fuera.n === 1 ? "1 rendimiento que no está" : fuera.n + " rendimientos que no están") +
        " en el archivo de Reental (" + dashEsc(dashNum(fuera.total, 2)) + " USD) no " + (fuera.n === 1 ? "sale" : "salen") + " aquí.</div>";
    }
    if (rendimientos.excedidas) {
      cuerpo += '<div class="dash-note">⚠ ' + rendimientos.excedidas + (rendimientos.excedidas === 1
        ? " reparto suma más que su íntegro." : " repartos suman más que su íntegro.") + "</div>";
    }
  }
  return dashTarjeta(titulo, "", cuerpo, true);
}

/* Los inmuebles por lo que te han repartido (íntegro), los 5
   primeros y «Ver todos». */
let dashVerTodos = false;
let dashFilasVistas = null; // el archivo con el que se abrió «Ver todos»
const DASH_TOP_INMUEBLES = 5;

function dashTarjetaInmuebles(rendimientos) {
  const titulo = "🏠 Inmuebles";
  if (!rendimientos) {
    return dashTarjeta(titulo, "", dashNoDisponible("Sin archivo de rendimientos.",
      { href: "#inicio", texto: "📄 Cargar el archivo de rendimientos" }));
  }
  if (!(rendimientos.total > 0)) return dashTarjeta(titulo, "", dashNoDisponible(dashSinRepartos(rendimientos)));
  const lista = rendimientos.porInmueble.filter(e => e.total > 0);
  const vistos = dashVerTodos ? lista : lista.slice(0, DASH_TOP_INMUEBLES);
  const maximo = Math.max(...lista.map(e => e.total));
  const filas = vistos.map(e => '<div class="dash-rank"><div class="dash-rank-c"><span class="nm">' + dashEsc(e.periodo) +
    '</span><span class="vv">' + dashEsc(dashNum(e.total, 2)) + ' <small>USD</small></span></div>' +
    '<div class="dash-rank-b"><span style="width:' + Math.max(1, 100 * e.total / maximo).toFixed(1) + '%"></span></div></div>').join("");
  const ver = lista.length > DASH_TOP_INMUEBLES
    ? '<button type="button" class="dash-ver-todos btn-link" aria-expanded="' + dashVerTodos + '">' +
      (dashVerTodos ? "Ver menos" : "Ver todos (" + lista.length + ")") + "</button>"
    : "";
  return dashTarjeta(titulo, "Ordenados por lo repartido (íntegro).", filas + ver);
}

/* Los avisos de «Tu cartera»: lo que no se dibuja y por qué. */
function dashNotasCartera(cartera) {
  let notas = "";
  if (cartera.conDudas) {
    notas += '<div class="dash-note">⚠ ' + dashCuantos(cartera.conDudas, "inmueble con dudas sin contar: decídelo", "inmuebles con dudas sin contar: decídelos") + " en 🔍 Revisión.</div>";
  }
  if (cartera.negativos || cartera.ignorados) {
    notas += '<div class="dash-note">⚠ Sin dibujar: ' + [cartera.negativos ? dashCuantos(cartera.negativos, "inmueble con saldo negativo", "inmuebles con saldo negativo") : "",
      cartera.ignorados ? dashCuantos(cartera.ignorados, "movimiento ilegible", "movimientos ilegibles") : ""].filter(Boolean).join(" · ") + ".</div>";
  }
  return notas;
}

/* El reparto de tu cartera por número de tokens. */
function dashTarjetaCartera(cartera, conVault = true) {
  const titulo = "🧱 Tu cartera";
  const donde = conVault ? "tu wallet y tu vault" : "tu wallet";
  let cuerpo;
  if (!cartera) {
    cuerpo = dashNoDisponible("Sin datos todavía.",
      { href: "#inicio", texto: "🚀 Ir a Puesta en marcha" });
  } else if (!cartera.items.length) {
    cuerpo = dashNoDisponible(cartera.conDudas || cartera.negativos ? "Sin inmuebles confirmados con tokens."
      : "Sin tokens de inmuebles en " + (conVault ? "tu wallet ni en tu vault." : "tu wallet."),
      { href: "#revision", texto: "🔍 Ver el catálogo de inmuebles" }) + dashNotasCartera(cartera);
  } else {
    const aria = "Gráfico de anillo: " + dashNum(cartera.total, 2) + " tokens repartidos entre " + cartera.items.length +
      " inmuebles (" + cartera.items.slice(0, 5).map(it => it.nombre + " " + dashPct(it.n, cartera.total, 0) + " %").join(", ") + ").";
    cuerpo = '<div class="dash-donut-flex"><div class="dash-chart" role="img" aria-label="' + dashEsc(aria) + '">' +
      dashSvgDonut(cartera.items, cartera.total, "tokens") + "</div>" +
      dashLeyenda(cartera.items.map((it, i) => ({ color: DASH_PALETA[i % DASH_PALETA.length], nombre: it.nombre,
        valor: dashNum(it.n, 2), pct: dashPct(it.n, cartera.total) }))) + "</div>";
    cuerpo += dashNotasCartera(cartera);
  }
  return dashTarjeta(titulo, "Tokens de cada inmueble en " + donde + ".", cuerpo);
}

/* ----------------------------- Render principal ----------------------------- */

function renderDashboard() {
  if (typeof document === "undefined") return;
  const cont = $("tarjetaMetricas");
  if (!cont) return;
  dashInyectarEstilos();

  // Repintar no saca el foco del Dashboard: vuelve al botón que
  // tenía («Por año», «Ver todos») o al gráfico, con su bocadillo.
  const activo = document.activeElement;
  const foco = activo && cont.contains(activo) ? dashSelectorFoco(activo) : null;
  // El bocadillo vuelve al mismo mes o año, no
  // a la misma posición (con otra serie sería otro mes): se mira antes de
  // pintar, con los datos de antes.
  const clavePrevia = foco && activo.dataset.sel !== undefined ? dashClaveBocadillo(dashDatosBocadillo(activo)[0][+activo.dataset.sel]) : undefined;

  const cache = state.cache || null;
  const vault = (typeof vaultConfig === "function")
    ? vaultConfig()
    : normalizarDireccion((state.config || {}).vault || "");
  const csvOk = !!(state.csvCargado && state.filasCsv && state.filasCsv.length);
  // Con otro archivo de rendimientos, el ranking vuelve a los 5 primeros.
  if (state.filasCsv !== dashFilasVistas) { dashFilasVistas = state.filasCsv; dashVerTodos = false; }
  const registros = (state.registros && state.registros.length) ? state.registros : null;

  // Cálculo puro: cada bloque con su fuente; null = bloque sin datos.
  // Un fallo en un bloque (datos escritos a mano) no deja la pestaña en
  // blanco: ese bloque sale «No disponible» y el resto, normal.
  const seguro = (fn, defecto) => {
    try { return fn(); } catch (e) { console.error("Dashboard (js/16-dashboard.js):", e); return defecto; }
  };
  const FALLO = { fallo: true };
  const vaultSaldo = cache ? seguro(() => dashSaldoVault(cache, vault), null) : null;
  const invertido = registros ? seguro(() => dashDineroInvertido(registros, cache && cache.tipos_bce, cache && cache.ajustes_usuario, cache), null) : null;
  const mensual = invertido ? seguro(() => dashSerieMensual(invertido.movimientos), []) : null;
  const rendimientos = csvOk ? seguro(() => dashRendimientosResumen(state.filasCsv, registros), null) : null;
  const categorias = registros ? seguro(() => dashCategoriasResumen(registros), null) : null;
  const cartera = cache ? seguro(() => dashCarteraTokens(cache), FALLO) : null;
  const bce = cache ? seguro(() => dashUltimoTipoBce(cache), null) : null;
  const saldoVault = vaultSaldo && vaultSaldo.n ? vaultSaldo.saldo : null;
  const nominal = invertido && cartera && cartera !== FALLO ? seguro(() => dashValorNominal(invertido, cartera, bce), null) : null;
  const rentabilidad = seguro(() => dashRentabilidadMedia(invertido, mensual, rendimientos), null);

  // Franja de métricas (con «No disponible» honesto).
  let html = '<div class="dash-metrics" aria-label="Métricas clave">';
  // Solo suma el USDT del vault: dice «USDT».
  html += dashMetrica("Saldo del vault", saldoVault === null ? null : dashNum(saldoVault, 2) + " USDT",
    { title: vaultSaldo && vaultSaldo.n
        ? vaultSaldo.n + " movimientos USDT del vault"
        : "Sin archivo o sin vault" });
  html += dashMetrica("Último tipo BCE", bce ? dashNum(bce.valor, 4) + " USD/EUR" : null,
    { title: bce ? "BCE del " + fechaEs(bce.fecha) : "Sin tipos de cambio descargados" });
  html += dashMetrica("Rendimientos", rendimientos ? dashNum(rendimientos.total, 2) + " USD" : null,
    { title: rendimientos
        ? "Íntegro de " + rendimientos.filas + " repartos · retención " +
          dashNum(rendimientos.retained, 2) + " USD"
        : "Sin archivo de rendimientos" });
  const conPct = rentabilidad && rentabilidad.pct !== undefined;
  html += dashMetrica("Rentabilidad media", conPct ? dashNum(rentabilidad.pct, 1) + " % anual" : null,
    { title: conPct ? dashTituloRentabilidad(rentabilidad) : (rentabilidad || { motivo: "No se pudo calcular." }).motivo });
  html += dashMetrica("Movimientos", categorias ? String(categorias.total) : null,
    { title: categorias ? "" : "Sin datos todavía" });
  html += dashMetrica("Revisar", categorias ? String(categorias.revisar) : null,
    { href: "#revision",
      color: categorias ? (categorias.revisar > 0 ? "var(--warn)" : "var(--ok)") : null,
      title: categorias ? "Ir a 🔍 Revisión" : "Sin datos todavía" });
  html += "</div>";

  // Rejilla (2 columnas): el dinero invertido y los rendimientos a todo el
  // ancho (el dinero invertido, primero), e inmuebles y cartera al lado.
  html += '<div class="dash-grid">';
  const tarjeta = (titulo, fn, ancha) => seguro(fn, dashTarjeta(titulo, "", dashNoDisponible("No se pudo pintar."), ancha));
  html += tarjeta("💼 Dinero invertido", () => dashTarjetaInvertido(invertido, mensual, nominal), true);
  html += tarjeta("💰 Rendimientos", () => dashTarjetaRendimientos(rendimientos, null, dashFaltanDecisiones(cache, registros)), true);
  html += tarjeta("🏠 Inmuebles", () => dashTarjetaInmuebles(rendimientos));
  html += tarjeta("🧱 Tu cartera", () => cartera === FALLO ? dashTarjeta("🧱 Tu cartera", "", dashNoDisponible("No se pudo pintar."))
    : dashTarjetaCartera(cartera, !!vault));
  html += "</div>";

  cont.innerHTML = html;
  dashMontarEventos(cont);
  const nuevo = foco ? cont.querySelector(foco) : null;
  if (nuevo) {
    nuevo.focus();
    const i = clavePrevia === undefined ? -1 : dashDatosBocadillo(nuevo)[0].findIndex(d => dashClaveBocadillo(d) === clavePrevia);
    if (i >= 0) dashMostrarBocadillo(nuevo, i);
  }
}

/* Cómo encontrar, tras repintar, el elemento que tenía el foco. */
function dashSelectorFoco(el) {
  if (el.classList.contains("dash-vista")) return '.dash-vista[data-vista="' + el.dataset.vista + '"]';
  if (el.classList.contains("dash-ver-todos")) return ".dash-ver-todos";
  if (el.classList.contains("dash-apiladas")) return ".dash-apiladas";
  if (el.classList.contains("dash-invertido")) return ".dash-invertido";
  if (el.closest(".dash-nominal-sw")) return ".dash-nominal-sw input";
  if (el.classList.contains("dash-ver-detalle")) return ".dash-ver-detalle";
  return null;
}

/* Botones «Por mes / Por año» y «Ver todos», y el bocadillo de las
   barras y de la línea del dinero invertido (ratón, toque o teclado con
   ← →), delegados una sola vez. */
function dashMontarEventos(cont) {
  if (cont.__dashEventos) return;
  cont.__dashEventos = true;
  cont.addEventListener("click", ev => {
    const vista = ev.target.closest(".dash-vista");
    if (vista) { dashVistaRend = vista.dataset.vista; renderDashboard(); return; }
    if (ev.target.closest(".dash-ver-todos")) { dashVerTodos = !dashVerTodos; renderDashboard(); return; }
    if (ev.target.closest(".dash-ver-detalle")) { dashAbrirDetalle(); return; }
    mostrar(ev);
  });
  // Con el ratón, el bocadillo va con el puntero. También
  // por los ejes y los márgenes del gráfico, con el mes que ya enseña. Un
  // evento sin posición (clientX y clientY a 0, solo los fingidos) va como
  // el teclado: arriba de su columna.
  const mostrar = ev => {
    const col = ev.target.closest(".dash-col"), caja = ev.target.closest(".dash-tipcaja");
    const i = col ? +col.dataset.i : caja && caja.dataset.sel !== undefined ? +caja.dataset.sel : null;
    if (i !== null) dashMostrarBocadillo(caja, i, ev.clientX || ev.clientY ? ev : undefined);
  };
  const quitarAlSalir = ev => {
    const caja = ev.target.closest(".dash-tipcaja");
    if (caja && !caja.contains(ev.relatedTarget)) dashMostrarBocadillo(caja, null);
  };
  cont.addEventListener("change", ev => {
    if (ev.target.closest(".dash-nominal-sw")) { dashNominal = ev.target.checked; renderDashboard(); }
  });
  cont.addEventListener("mouseover", mostrar);
  cont.addEventListener("mousemove", mostrar);
  cont.addEventListener("mouseout", quitarAlSalir);
  cont.addEventListener("focusout", quitarAlSalir);
  cont.addEventListener("keydown", ev => {
    const caja = ev.target.closest(".dash-tipcaja");
    if (!caja || !["ArrowLeft", "ArrowRight", "Home", "End", "Escape"].includes(ev.key)) return;
    ev.preventDefault();
    const n = caja.querySelectorAll(".dash-col").length;
    const actual = caja.dataset.sel === undefined ? n : +caja.dataset.sel;
    const i = { ArrowLeft: Math.max(0, actual - 1), ArrowRight: Math.min(n - 1, actual === n ? n - 1 : actual + 1),
                Home: 0, End: n - 1, Escape: null }[ev.key];
    dashMostrarBocadillo(caja, i);
  });
}

/* Lo que enseña el bocadillo de cada gráfico: [sus datos, su HTML, su frase
   para el lector de pantalla]; y qué mes o año es cada dato. */
function dashDatosBocadillo(caja) {
  return caja.classList.contains("dash-invertido")
    ? [dashSerieInvertido, dashHtmlBocadilloInvertido, dashTextoBocadilloInvertido]
    : [dashColumnasRend, dashHtmlBocadillo, dashTextoBocadillo];
}
function dashClaveBocadillo(d) {
  return d ? d.etiqueta || d.periodo : undefined;
}

/* Enseña (i) o quita (null) el bocadillo de una columna (o de un mes de la
   línea), encima de su barra y sin salirse de la tarjeta; las demás
   columnas se atenúan. Con el ratón o el dedo (puntero, el
   evento con clientX y clientY), centrado sobre él y 12 px por encima (si
   no cabe bajo la barra fija de arriba, 16 px por debajo); sin él (teclado
   o al cambiar la ventana), arriba de su columna. Moverse dentro del mismo
   mes solo lo recoloca: ni rehace el contenido ni lo vuelve a leer el
   lector de pantalla. */
function dashMostrarBocadillo(caja, i, puntero) {
  if (!caja) return;
  const tip = caja.querySelector(".dash-tip");
  const sr = caja.nextElementSibling && caja.nextElementSibling.classList.contains("solo-lector") ? caja.nextElementSibling : null;
  const cols = caja.querySelectorAll(".dash-col");
  cols.forEach((c, k) => c.classList.toggle("apagada", i !== null && k !== i));
  if (i === null || !cols[i]) { tip.hidden = true; delete caja.dataset.sel; if (sr) sr.textContent = ""; return; }
  if (tip.hidden || caja.dataset.sel !== String(i)) {
    // Un solo bocadillo a la vez en el Dashboard.
    document.querySelectorAll("#tarjetaMetricas .dash-tipcaja[data-sel]").forEach(otra => { if (otra !== caja) dashMostrarBocadillo(otra, null); });
    caja.dataset.sel = i;
    const [datos, html, texto] = dashDatosBocadillo(caja);
    tip.innerHTML = html(datos[i]);
    if (sr) sr.textContent = texto(datos[i]);
    tip.hidden = false;
  }
  const marco = caja.getBoundingClientRect();
  let centro, top = "";   // sin puntero, el top del CSS
  if (puntero) {
    centro = puntero.clientX - marco.left;
    // La altura de la barra fija la pone js/13 en el estilo del <html>.
    const arriba = parseFloat(document.documentElement.style.getPropertyValue("--alto-topbar")) || 0;
    const encima = puntero.clientY - tip.offsetHeight - 12;
    top = ((encima < arriba + 6 ? puntero.clientY + 16 : encima) - marco.top).toFixed(0) + "px";
  } else {
    const zona = cols[i].querySelector(".dash-col-zona").getBoundingClientRect();
    centro = zona.left - marco.left + zona.width / 2;
  }
  const x = Math.max(0, Math.min(marco.width - tip.offsetWidth, centro - tip.offsetWidth / 2));
  tip.style.left = x.toFixed(0) + "px";
  tip.style.top = top;
}

/* ----------------------------- Estilos (inyectados una vez) -----------------------------
   Espacio de nombres dash-* dentro de #tarjetaMetricas: no colisiona con el
   CSS del shell ni con los hooks heredados. Los colores usan los tokens del
   design system 1.1, así que body.dark cambia el tema sin repintar. */
function dashInyectarEstilos() {
  if (typeof document === "undefined" || $("estiloDashboard16")) return;
  const estilo = document.createElement("style");
  estilo.id = "estiloDashboard16";
  estilo.textContent = [
    // Reclamado azul, reinvertido verde y pendiente ámbar.
    "#tarjetaMetricas{--dash-a:#2563eb;--dash-b:var(--accent);--dash-c:#c98a0a;color:var(--text)}",
    "body.dark #tarjetaMetricas{--dash-a:#6b9cf5;--dash-c:#e0a93a}",
    "#tarjetaMetricas .dash-metrics{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 16px}",
    "#tarjetaMetricas .dash-metric{background:var(--tarjeta);border:1px solid var(--border);border-radius:12px;padding:10px 15px;min-width:150px;flex:1 1 150px;text-decoration:none;color:inherit;display:flex;flex-direction:column}",
    "#tarjetaMetricas a.dash-metric:hover{border-color:var(--accent)}",
    "#tarjetaMetricas .dash-metric .k{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--faint)}",
    "#tarjetaMetricas .dash-metric .v{font-size:16.5px;font-weight:700;margin-top:auto;padding-top:2px;font-variant-numeric:tabular-nums;color:var(--text)}",
    "#tarjetaMetricas .dash-metric .v.dash-na{color:var(--faint);font-weight:600;font-size:13.5px}",
    "#tarjetaMetricas .dash-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}",
    "@media(max-width:900px){#tarjetaMetricas .dash-grid{grid-template-columns:1fr}}",
    "#tarjetaMetricas .dash-card{background:var(--tarjeta);border:1px solid var(--border);border-radius:14px;padding:16px;min-width:0}",
    "#tarjetaMetricas .dash-card.wide{grid-column:1/-1}",
    "#tarjetaMetricas .dash-head{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px}",
    "#tarjetaMetricas .dash-head h3{font-size:14px;font-weight:700;color:var(--text)}",
    "#tarjetaMetricas .dash-hint{font-size:13px;color:var(--muted);margin-top:3px}",
    "#tarjetaMetricas .dash-value-lg{font-size:36px;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums;color:var(--text)}",
    "#tarjetaMetricas .dash-desglose{font-size:20px;color:var(--muted);margin:8px 0 6px;font-variant-numeric:tabular-nums}",
    "#tarjetaMetricas .dash-bce{font-size:14px}",
    "#tarjetaMetricas .dash-nominal-sep{margin:0 10px;font-size:20px;font-weight:400;color:var(--faint);vertical-align:middle}",
    "#tarjetaMetricas .dash-nominal-fila{display:flex;align-items:center;gap:12px;margin:24px 0 8px}",
    "#tarjetaMetricas .dash-nominal-fila .rv-interruptor{margin:0;font-weight:600}",
    "#tarjetaMetricas .dash-nominal-k{font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}",
    "@media print{#tarjetaMetricas .dash-nominal-fila{display:none}}",
    // La ventana «Ver el detalle» (en el <body>, fuera de #tarjetaMetricas).
    // Más ancha que .arr-dlg; el relleno de arriba lo pone el título, fijo al bajar.
    ".arr-dlg.dash-dlg{max-width:640px;width:calc(100% - 32px);padding-top:0}",
    ".dash-dlg-cab{display:flex;align-items:flex-start;gap:12px;position:sticky;top:0;z-index:1;padding:18px 0 8px;background:var(--tarjeta)}",
    ".dash-dlg-cab h3{flex:1}",
    ".dash-dlg p{font-size:13.5px;margin:0 0 6px}",
    ".dash-dlg-cajas{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}",
    ".dash-dlg-caja{border:1px solid var(--border);border-radius:12px;padding:10px 14px}",
    ".dash-dlg-caja b{display:block;font-size:17px;margin:4px 0 2px;font-variant-numeric:tabular-nums}",
    ".dash-dlg-k{font-size:12.5px;color:var(--muted)}",
    // Gris oscuro (entre el texto y el gris de las notas), en los dos temas.
    ".dash-dlg-t{font-size:14.5px;font-weight:700;color:color-mix(in srgb,var(--text) 75%,var(--muted))}",
    ".dash-dlg table{width:100%;border-collapse:collapse;font-size:13px}",
    ".dash-dlg th,.dash-dlg td{border:1px solid var(--border);padding:6px 8px;text-align:left}",
    ".dash-dlg th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);background:var(--panel2)}",
    ".dash-dlg .n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}",
    ".dash-dlg th,.dash-dlg th.n{text-align:center}",
    ".dash-dlg-grupo td{background:var(--ok-bg);font-weight:600;color:var(--muted)}",
    ".dash-dlg-pie{margin:0 0 12px!important;color:var(--muted)}",
    "#tarjetaMetricas .dash-desglose-sep{margin:0 10px}",
    "#tarjetaMetricas .dash-subhead{font-size:13px;font-weight:700;color:var(--muted);margin:14px 0 2px;text-transform:uppercase;letter-spacing:.05em}",
    "#tarjetaMetricas .dash-value-k{font-size:13px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}",
    "#tarjetaMetricas .dash-aparte{display:flex;flex-wrap:wrap;align-items:center;gap:0 10px;font-size:13px;margin-top:12px;padding-top:10px;border-top:1px dashed var(--border2)}",
    "#tarjetaMetricas .dash-aparte .nm{font-weight:600}",
    "#tarjetaMetricas .dash-aparte .vv{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}",
    "#tarjetaMetricas .dash-aparte .dash-hint{flex:1 1 100%}",
    "#tarjetaMetricas .dash-legend{display:flex;flex-direction:column;gap:9px;margin-top:6px}",
    "#tarjetaMetricas .dash-leg{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text)}",
    "#tarjetaMetricas .dash-dot{width:11px;height:11px;border-radius:3px;flex:0 0 auto}",
    "#tarjetaMetricas .dash-leg .nm{font-weight:600}",
    "#tarjetaMetricas .dash-leg .vv{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums}",
    "#tarjetaMetricas .dash-leg .pc{color:var(--muted);width:56px;text-align:right;font-variant-numeric:tabular-nums}",
    "#tarjetaMetricas .dash-na-box{border:1px dashed var(--border2);border-radius:12px;padding:22px 16px;text-align:center;color:var(--muted);background:var(--tarjeta)}",
    "#tarjetaMetricas .dash-na-box b{color:var(--faint);font-size:14px}",
    "#tarjetaMetricas .dash-na-link{margin-top:10px}",
    "#tarjetaMetricas .dash-note{font-size:13px;color:var(--warn);margin-top:10px}",
    "#tarjetaMetricas .dash-chart{overflow:hidden}",
    "#tarjetaMetricas .dash-donut-flex{display:flex;gap:22px;align-items:center;flex-wrap:wrap}",
    "#tarjetaMetricas .dash-donut-flex .dash-legend{flex:1;min-width:220px}",
    "#tarjetaMetricas svg text{font-family:Fustat,'Segoe UI',system-ui,sans-serif}",
    // La letra de los ejes, algo más pequeña (el SVG se escala al ancho).
    "#tarjetaMetricas .dash-ax{fill:var(--faint);font-size:9.5px;font-weight:600}",
    "#tarjetaMetricas .dash-grid-l{stroke:var(--border);stroke-width:1}",
    "#tarjetaMetricas .dash-linea{fill:none;stroke:var(--accent);stroke-width:2.6;stroke-linejoin:round}",
    "#tarjetaMetricas .dash-area{fill:var(--accent);opacity:.13}",
    "#tarjetaMetricas .dash-punto{fill:var(--accent);stroke:var(--tarjeta);stroke-width:1.6}",
    "#tarjetaMetricas .dash-bar-a{fill:var(--dash-a);background:var(--dash-a)}",
    "#tarjetaMetricas .dash-bar-b{fill:var(--dash-b);background:var(--dash-b)}",
    "#tarjetaMetricas .dash-bar-c{fill:var(--dash-c);background:var(--dash-c)}",
    // Barras apiladas con bocadillo, selector, ranking.
    "#tarjetaMetricas .dash-subhead-fila{display:flex;align-items:center;gap:10px;flex-wrap:wrap;text-transform:none;letter-spacing:0}",
    "#tarjetaMetricas .dash-vistas{margin-left:auto;display:inline-flex;border:1px solid var(--btn-bd);box-shadow:var(--btn-sombra);border-radius:999px;overflow:hidden}",
    "#tarjetaMetricas .dash-vista{box-shadow:none;border:0;border-radius:0;background:transparent;color:var(--muted);font-weight:700;font-size:12.5px;padding:4px 12px;cursor:pointer}",
    "#tarjetaMetricas .dash-vista[aria-pressed=true]{background:var(--accent);color:var(--on-accent)}",
    "#tarjetaMetricas .dash-tipcaja{position:relative;overflow:visible;outline-offset:3px}",
    "#tarjetaMetricas .dash-col{cursor:pointer}",
    "#tarjetaMetricas .dash-cero{fill:var(--border2)}",
    "#tarjetaMetricas .dash-col-zona{fill:transparent}",
    // El velo de la columna, solo en las barras
    // (en la línea va encima y la destiñe; allí se ve el punto del mes).
    "#tarjetaMetricas .dash-apiladas .dash-col:hover .dash-col-zona,#tarjetaMetricas .dash-apiladas[data-sel] .dash-col:not(.apagada) .dash-col-zona{fill:var(--border);opacity:.45}",
    // La línea: el punto del mes elegido sale al pasar por él.
    "#tarjetaMetricas .dash-punto-sel{display:none}",
    "#tarjetaMetricas .dash-invertido .dash-col:hover .dash-punto-sel,#tarjetaMetricas .dash-invertido[data-sel] .dash-col:not(.apagada) .dash-punto-sel{display:inline}",
    "#tarjetaMetricas .dash-col.apagada rect:not(.dash-col-zona){opacity:.4}",
    "#tarjetaMetricas .dash-tip{position:absolute;top:4px;min-width:230px;max-width:290px;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:10px 12px;box-shadow:0 6px 22px rgba(0,0,0,.14);font-size:13px;pointer-events:none;z-index:2}",
    "#tarjetaMetricas .dash-tip-f{display:flex;align-items:center;gap:8px;margin-top:6px}",
    "#tarjetaMetricas .dash-tip-f b,#tarjetaMetricas .dash-tip-f span:last-child{margin-left:auto;font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#tarjetaMetricas .dash-tip-f.sub{color:var(--muted);font-size:12px;margin-top:2px}",
    "#tarjetaMetricas .dash-tip-f.total{border-top:1px solid var(--border);padding-top:6px}",
    "#tarjetaMetricas .dash-rank{margin:10px 0}",
    "#tarjetaMetricas .dash-rank-c{display:flex;align-items:baseline;gap:10px;font-size:13.5px}",
    "#tarjetaMetricas .dash-rank-c .nm{font-weight:600;overflow-wrap:anywhere}",
    "#tarjetaMetricas .dash-rank-c .vv{margin-left:auto;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#tarjetaMetricas .dash-rank-c small{color:var(--muted);font-size:11px}",
    "#tarjetaMetricas .dash-rank-b{height:8px;border-radius:99px;background:var(--border);margin-top:5px;overflow:hidden}",
    "#tarjetaMetricas .dash-rank-b span{display:block;height:100%;border-radius:99px;background:var(--accent)}",
    "#tarjetaMetricas .dash-ver-todos{margin-top:4px}",
  ].join("\n");
  document.head.appendChild(estilo);
}

/* ----------------------------- Hooks no invasivos -----------------------------
   Este módulo no toca js/01-14 ni index.html, así que el repintado se engancha en tiempo de ejecución:
   1. Envoltorios de las funciones globales que ya se llaman tras cada cambio
      de datos (carga/creación/guardado de cache, CSV, datos.json,
      sincronización, descubrimiento y clasificación). El envoltorio ejecuta
      la original intacta y repinta detrás; si la original lanza, el error se
      propaga exactamente igual que antes.
   2. hashchange: al volver a #dashboard se repinta (cubre cambios de config
      —wallet/vault— editados en otra pestaña).
   3. Un fallo de render NUNCA rompe el flujo anfitrión (try/catch propio). */
(function montarHooksDashboard() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  function renderSeguro() {
    try { renderDashboard(); }
    catch (e) { console.error("Dashboard (js/16-dashboard.js):", e); }
  }
  function envolver(nombre) {
    const original = window[nombre];
    if (typeof original !== "function" || original.__dashEnvuelta) return;
    const envoltura = function () {
      const resultado = original.apply(this, arguments);
      renderSeguro();
      return resultado;
    };
    envoltura.__dashEnvuelta = true;
    window[nombre] = envoltura;
  }
  ["renderPanel", "actualizarChipEstado", "ejecutarClasificacion"].forEach(envolver);

  // Al cambiar el tamaño de la ventana (o girar el móvil), el bocadillo
  // abierto se recoloca (si no, se quedaría fuera y daría scroll).
  window.addEventListener("resize", () => {
    document.querySelectorAll("#tarjetaMetricas .dash-tipcaja[data-sel]").forEach(caja => dashMostrarBocadillo(caja, +caja.dataset.sel));
  });

  window.addEventListener("hashchange", () => {
    // La ventana «Ver el detalle» no se queda encima de otra pestaña.
    document.querySelectorAll("dialog.dash-dlg[open]").forEach(d => d.close());
    const hash = (location.hash || "#dashboard").slice(1);
    if (hash === "dashboard" || !document.getElementById("view-" + hash)) { dashNominal = false; renderSeguro(); }
  });

  renderSeguro(); // el DOM ya existe: los scripts van al final del <body>
})();
