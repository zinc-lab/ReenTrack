/* Comprobaciones de 💶 Coste de las compras bancarias, en 🔍 Revisión,
 * comunes al arnés sintético (verifydu2i.js) y al de tus
 * datos (verifydu2i_real.js). Escriben y pulsan de verdad, como el usuario,
 * sobre una página con la clasificación ya hecha.
 *
 *  C1) el plegable está cerrado y su número es el de compras bancarias;
 *      abierto, una fila por compra con su inmueble (sin cabeceras de
 *      grupo), las más recientes primero, ninguna casilla abierta (lo
 *      pagado como texto con «✏️ Editar») y las de un
 *      ajuste manual de otro origen sin «Editar» y con su ⓘ.
 *  C2) a 1366 px la tabla cabe en la tarjeta.
 *  C2b) «✏️ Editar» abre la casilla con lo guardado y el cursor dentro;
 *      «Cancelar» y Esc la cierran sin escribir nada.
 *  C3) al escribir, el € por token se recalcula y el «Guardar» de la fila
 *      se activa; si se vuelve a lo de antes, se desactiva.
 *  C4) «Guardar»: se guarda una vez, el ajuste lleva la marca, la
 *      clasificación toma el coste y la fila se cierra con el valor
 *      guardado como texto.
 *  C5) un 0 no se guarda (aviso de error, sin escribir nada; sigue abierta).
 *  C6) volver a 100 € por token con Intro lo guarda como tuyo: el
 *      ajuste y la clasificación lo llevan.
 *
 * opts = { ajenas: nº de compras con ajuste ajeno, cap: ruta de captura }.
 */
"use strict";
const esperar = ms => new Promise(s => setTimeout(s, ms));

module.exports = async function comprobarDu2i(page, assert, opts = {}) {
  const ajustes = () => page.evaluate(() => JSON.stringify(state.cache.ajustes_usuario || {}));
  const escrituras = () => page.evaluate(() => window.__writes.length);
  const limpiarAvisos = () => page.evaluate(() => document.querySelectorAll("#toasts .toast").forEach(t => t.remove()));
  const ultimoAviso = () => page.evaluate(() => { const t = [...document.querySelectorAll("#toasts .toast")].pop(); return t ? t.textContent : ""; });
  const vista = () => page.evaluate(() => {
    const det = document.getElementById("cbCoste");
    const b = state.registros.filter(r => r.categoria === "COMPRA" && r.via_compra === "BANCARIA");
    return {
      abierto: det.open,
      n: Number(document.getElementById("cbCount").textContent),
      bancarias: b.length,
      filas: document.querySelectorAll("#cbCuerpo tr.cb-fila").length,
      grupos: document.querySelectorAll("#cbCuerpo tr.cb-grupo").length,
      cabecera: [...document.querySelectorAll("#cbCuerpo thead th")].map(th => th.textContent),
      fechas: [...document.querySelectorAll("#cbCuerpo tr.cb-fila")].map(f => f.getAttribute("data-clave"))
        .map(c => state.registros.find(r => r.clave === c).fecha),
      casillas: document.querySelectorAll("#cbCuerpo .cb-valor").length,
      editar: document.querySelectorAll('#cbCuerpo [data-cb="editar"]').length,
      info: document.querySelectorAll("#cbCuerpo tr.cb-fila .cc-info").length,
      guardarGeneral: !!document.getElementById("cbGuardar"),
    };
  });
  const fila = clave => page.evaluate(c => {
    const f = [...document.querySelectorAll("#cbCuerpo tr.cb-fila")].find(x => x.getAttribute("data-clave") === c);
    const g = f && f.querySelector('[data-cb="guardar"]'), inp = f && f.querySelector(".cb-valor");
    return f ? {
      valor: inp ? inp.value : null, foco: !!inp && document.activeElement === inp,
      texto: (f.querySelector(".cb-fijo") || {}).textContent || null,
      porToken: f.querySelector(".cb-por-token").textContent,
      guardar: g ? g.disabled : null, editar: !!f.querySelector('[data-cb="editar"]'),
    } : null;
  }, clave);
  const boton = (clave, accion) => page.click('#cbCuerpo [data-cb="' + accion + '"][data-clave="' + clave + '"]');
  const escribir = async (clave, texto) => {
    const sel = '#cbCuerpo .cb-valor[data-clave="' + clave + '"]';
    if (!(await page.$(sel))) { await boton(clave, "editar"); await esperar(100); }
    await page.focus(sel);
    await page.$eval(sel, el => el.select());
    await page.keyboard.press("Backspace");
    await page.type(sel, texto);
    await esperar(100);
  };

  const ajenas = opts.ajenas || 0;

  /* ============ C1) cerrado, número y filas ============ */
  const v0 = await vista();
  assert("C1 -> cerrado por defecto y su número = compras bancarias (" + v0.bancarias + ")",
    !v0.abierto && v0.n === v0.bancarias && v0.bancarias >= 2, v0);
  await page.evaluate(() => { const d = document.getElementById("cbCoste"); d.open = true; d.scrollIntoView({ block: "start" }); });
  await esperar(150);
  const v1 = await vista();
  assert("C1 -> abierto: una fila por compra, sin cabeceras de grupo y con la columna «Inmueble»",
    v1.filas === v1.bancarias && v1.grupos === 0 && v1.cabecera[1] === "Inmueble / Token", v1);
  assert("C1 -> las más recientes primero", v1.fechas.every((f, i) => i === 0 || v1.fechas[i - 1] >= f), v1.fechas);
  assert("C1 -> ninguna casilla abierta: «✏️ Editar» en las editables y " + ajenas + " con ajuste manual sin él, con su ⓘ",
    v1.casillas === 0 && v1.editar === v1.filas - ajenas && v1.info === ajenas && !v1.guardarGeneral, v1);

  /* ============ C2) cabe ============ */
  const cabe = await page.evaluate(() => {
    const t = document.querySelector("#cbCuerpo .cb-tabla"), c = document.getElementById("cbCoste");
    return t.getBoundingClientRect().right <= c.getBoundingClientRect().right + 1;
  });
  assert("C2 -> a 1366 px la tabla cabe en el plegable", cabe);

  /* La primera compra sin ajuste. */
  const libre = await page.evaluate(() => {
    const r = cbComprasBancarias(state.registros).find(x => cbEstadoCoste(x, state.cache.ajustes_usuario) === "libre");
    return r && { clave: r.clave, cantidad: r.cantidad, coste: r.coste_eur };
  });
  assert("C3 -> hay una compra sin ajuste para probar", !!libre, libre);
  const aj0 = await ajustes(), w0 = await escrituras();

  /* ============ C2b) abrir, cancelar y Esc ============ */
  await boton(libre.clave, "editar");
  await esperar(100);
  const f2 = await fila(libre.clave);
  // Sin coste tuyo, «Guardar» ya está activo (confirma el de por defecto).
  assert("C2b -> «✏️ Editar» abre la casilla con lo guardado, el cursor dentro y «Guardar» activo (lo confirma)",
    f2.valor !== null && Math.abs((await page.evaluate(v => ccLeerImporte(v), f2.valor)) - libre.coste) < 0.005 &&
    f2.foco && f2.guardar === false && !f2.editar, f2);
  await boton(libre.clave, "cancelar");
  await esperar(100);
  const f2c = await fila(libre.clave);
  assert("C2b -> «Cancelar» la cierra (otra vez texto y «Editar»)", f2c.valor === null && f2c.editar && !!f2c.texto, f2c);
  await escribir(libre.clave, "123");
  await page.keyboard.press("Escape");
  await esperar(100);
  const f2e = await fila(libre.clave);
  assert("C2b -> Esc la cierra sin guardar lo escrito", f2e.valor === null && f2e.porToken !== "30,75 €" &&
    (await escrituras()) === w0 && (await ajustes()) === aj0, f2e);

  /* ============ C3) escribir ============ */
  const nuevo = libre.cantidad * 50;
  const textoNuevo = String(nuevo).replace(".", ",");
  await escribir(libre.clave, textoNuevo);
  const f3 = await fila(libre.clave);
  assert("C3 -> el € por token se recalcula al escribir (50,00 €)", f3.porToken === "50,00 €", f3);
  assert("C3 -> su «Guardar» se activa", f3.guardar === false, f3);
  if (opts.cap) await page.screenshot({ path: opts.cap });
  await escribir(libre.clave, String(libre.coste).replace(".", ","));
  assert("C3 -> vuelto a lo de antes, «Guardar» sigue activo (sin coste tuyo, lo confirma)", (await fila(libre.clave)).guardar === false);

  /* ============ C4) guardar ============ */
  await escribir(libre.clave, textoNuevo);
  await limpiarAvisos();
  await boton(libre.clave, "guardar");
  await esperar(opts.espera || 900);
  const aj4 = await page.evaluate(c => (state.cache.ajustes_usuario || {})[c], libre.clave);
  assert("C4 -> el ajuste: { coste_eur, nota «Coste puesto por ti (fecha)» }",
    aj4 && aj4.coste_eur === nuevo && /^Coste puesto por ti \(\d{4}-\d\d-\d\d\)$/.test(aj4.nota) && Object.keys(aj4).length === 2, aj4);
  assert("C4 -> se guarda una vez", (await escrituras()) === w0 + 1);
  const r4 = await page.evaluate(c => state.registros.find(r => r.clave === c), libre.clave);
  assert("C4 -> la clasificación toma el coste y la marca", r4.coste_eur === nuevo && /Coste puesto por ti/.test(r4.nota), r4);
  const f4 = await fila(libre.clave), v4 = await vista();
  assert("C4 -> repintado: la fila cerrada con lo guardado como texto y el plegable sigue abierto",
    f4.porToken === "50,00 €" && f4.valor === null && f4.editar && f4.texto === (await page.evaluate(v => numEs(v, 2), nuevo)) + " €" &&
    v4.abierto, [f4, v4]);
  assert("C4 -> aviso «Coste guardado.»", /Coste guardado\./.test(await ultimoAviso()));

  /* ============ C5) un 0 no se guarda ============ */
  await escribir(libre.clave, "0");
  await limpiarAvisos();
  await boton(libre.clave, "guardar");
  await esperar(300);
  assert("C5 -> un 0: aviso de error, nada escrito y la casilla sigue abierta",
    /mayor que 0/.test(await ultimoAviso()) && (await escrituras()) === w0 + 1 && (await fila(libre.clave)).valor === "0");

  /* ============ C6) volver a 100 € por token con Intro: se guarda como
     tuyo ============ */
  await escribir(libre.clave, String(libre.cantidad * 100).replace(".", ","));
  await limpiarAvisos();
  await page.keyboard.press("Enter");
  await esperar(opts.espera || 900);
  assert("C6 -> Intro guarda (otra escritura)", (await escrituras()) === w0 + 2);
  const aj6 = await page.evaluate(c => (state.cache.ajustes_usuario || {})[c], libre.clave);
  assert("C6 -> vuelto a 100 € por token: el ajuste lo guarda como tuyo", aj6 && aj6.coste_eur === libre.cantidad * 100, aj6);
  const r6 = await page.evaluate(c => state.registros.find(r => r.clave === c), libre.clave);
  assert("C6 -> y la clasificación, el mismo coste con la marca de tuyo",
    Math.abs(r6.coste_eur - libre.coste) < 0.005 && /Coste puesto por ti/.test(r6.nota), r6);
  return libre;
};
