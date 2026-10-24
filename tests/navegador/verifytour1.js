/* Arnés del ejemplo (js/29, driver.js en js/00): un recorrido con datos
 * inventados que no guarda nada.
 *
 *  T1) la primera vez, sin nada guardado, sale «¿Es tu primera vez?» y
 *      «Ver un ejemplo» empieza el recorrido; al volver, ya no (un navegador manejado por un programa no la ve: se
 *      finge uno normal).
 *  T2) «▶ Ver un ejemplo» de 📖 Ayuda: cada parada abre su pestaña y señala
 *      algo (al cambiar de pestaña, primero su botón del menú), solo para
 *      mirar salvo «Compra externa» y 💶 con su «Calcular…» (A5, A6, A12); los textos
 *      nombran las pestañas; siempre con «Siguiente»; pulsar «Compra externa…» avanza;
 *      en 💶 se escribe lo pagado, y ← →, o Esc, dentro de un campo no mueven ni cierran el recorrido (A4).
 *  T3) «Empezar» lleva a 🚀 sin nada del ejemplo en memoria ni en lo
 *      guardado (IndexedDB y localStorage); nada salió a internet.
 *  T4) solo con «Siguiente», «Compra externa» se decide sola y sigue en 💶;
 *      ✕ a mitad vuelve a donde estabas, igual de limpio.
 *  T5) no empieza (y lo dice) si al salir se perdería algo: el guardado
 *      fallando (A1), una descarga en marcha (A2), «Ajustes en JSON» a medio
 *      escribir (A8).
 *  T6) lo de tu sesión no se cuela en el ejemplo (A3).
 *  T7) «Anterior» hasta 🔍 se salta «Compra externa» y 💶 ya hechas y
 *      señala el catálogo (A7); el historial no crece y «Atrás» del
 *      navegador sale del ejemplo (A13). 0 errores.
 *
 * DATOS 100 % SINTÉTICOS. Ejecución (servidor en 8765 y NODE_PATH a
 * puppeteer-core):  node tests/navegador/verifytour1.js
 */
"use strict";
const puppeteer = require("puppeteer-core");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const esperar = ms => new Promise(s => setTimeout(s, ms));

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errores = [], fuera = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("request", r => { if (/^https?:/.test(r.url()) && !r.url().startsWith(BASE)) fuera.push(r.url()); });

  /* T1: con navigator.webdriver a false, como una persona. */
  await page.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem("fingir") === "1") Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  await page.goto(BASE + "index.html", { waitUntil: "networkidle0" });
  await page.evaluate(() => sessionStorage.setItem("fingir", "1"));
  await page.reload({ waitUntil: "networkidle0" });
  await esperar(300);
  const dlg = () => page.evaluate(() => document.getElementById("tourDlg").open);
  assert("T1: la primera vez sale «¿Es tu primera vez?»", await dlg());
  await page.click('#tourDlg button[value="ejemplo"]');
  await page.waitForSelector(".driver-popover", { visible: true });
  assert("T1: «Ver un ejemplo» empieza el recorrido", !(await dlg()));
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".driver-popover-close-btn")]);
  await esperar(300);
  assert("T1: al volver ya no sale", !(await dlg()));
  await page.evaluate(() => sessionStorage.removeItem("fingir"));
  await page.reload({ waitUntil: "networkidle0" });

  const guardado = () => page.evaluate(async () => {
    const a = await idbOperar("readonly", s => s.get("archivo"));
    return JSON.stringify({ archivo: a && a.texto, ls: Object.keys(localStorage).sort().map(k => k + "=" + localStorage.getItem(k)) });
  });
  // Al recargar, la app guarda sola su caja vacía y su config por defecto:
  // se mira que no quede nada del ejemplo (su wallet, su key, sus inmuebles).
  const limpio = async () => !/e1e1e1|EJEMPLO|Ejemplo|EJM1/.test(await guardado());
  assert("antes del ejemplo, nada suyo guardado", await limpio());
  const parada = () => page.evaluate(() => {
    const p = document.querySelector(".driver-popover"), a = document.querySelector(".driver-active-element");
    if (!p) return null;
    const n = p.querySelector(".driver-popover-next-btn");
    return { n: p.querySelector(".driver-popover-progress-text").textContent, titulo: p.querySelector(".driver-popover-title").textContent,
      senala: !!a && a.id !== "driver-dummy-element" && a.getBoundingClientRect().height > 0, vista: document.querySelector(".view.active").id,
      siguiente: !!n && n.style.display !== "none" && !!n.offsetParent, mirar: !!a && a.classList.contains("driver-no-interaction"),
      calcular: !!a && !!a.querySelector('[data-cb="calcular"]') };
  });

  // Tras pulsar, a que cambie de parada (o se vaya la burbuja).
  const otraParada = n => page.waitForFunction(n => {
    const t = document.querySelector(".driver-popover-progress-text");
    return !t || t.textContent !== n;
  }, { timeout: 5000 }, n);

  /* T2: el recorrido entero desde 📖 Ayuda. */
  await page.goto(BASE + "index.html#ayuda", { waitUntil: "networkidle0" });
  await page.click("#tourVer");
  await page.waitForSelector(".driver-popover", { visible: true });
  const vistas = [];
  const total = await page.evaluate(() => TOUR_PASOS.length), fin = total + " de " + total;
  let p = await parada();
  assert("T2: empieza en «Ejemplo», 1 de " + total + ", en el centro", p && p.n === "1 de " + total && p.titulo === "Ejemplo" && !p.senala, p);
  for (let i = 1; i < total && p; i++) {
    assert("T2: " + p.n + " con «Siguiente»", p.siguiente, p);
    if (p.titulo === "Compra externa") await page.click(".driver-active-element");   // pulsar el botón avanza
    else await page.click(".driver-popover-next-btn");
    await otraParada(p.n);
    p = await parada();
    if (!p) break;
    vistas.push(p.vista.replace("view-", "") + ":" + p.titulo);
    if (p.n !== fin) assert("T2: " + p.n + " señala algo en " + p.vista, p.senala, p);
    if (p.senala) assert("T2: " + p.n + " «" + p.titulo + "»: " + (/^(Compra externa|💶 Coste)$/.test(p.titulo) ? "se puede usar" : "solo mirar") + " (A5, A6)",
      p.mirar === !/^(Compra externa|💶 Coste)$/.test(p.titulo), p);
    if (p.titulo === "Tus datos") {
      await page.focus("#cfgWallet");
      await page.keyboard.press("Escape");
      await esperar(300);
      const q = await parada();
      assert("T2: Esc dentro de un campo no cierra el ejemplo (A4)", q && q.titulo === "Tus datos", q);
    }
    if (p.titulo === "💶 Coste") {
      assert("T2: en 💶 se señala también «Calcular el precio por token» (A12)", p.calcular, p);
      await page.type(".driver-active-element .cb-valor", "150");
      // A4: escribiendo, ← y → son del campo: el recorrido se queda en 💶.
      for (const k of ["ArrowLeft", "ArrowRight"]) await page.keyboard.press(k);
      await esperar(300);
      const sigue = await parada();
      assert("T2: ← y → dentro de un campo no mueven el ejemplo (A4)", sigue && sigue.titulo === "💶 Coste", sigue);
      await page.keyboard.press("Enter");
      await esperar(500);
      const c = await page.evaluate(() => [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join());
      assert("T2: en 💶 se guarda lo pagado (en memoria)", /Coste guardado/.test(c), c);
    }
  }
  assert("T2: " + total + " paradas, por cada pestaña", p && p.n === fin && ["inicio", "revision", "dashboard", "transacciones", "rendimientos", "fiscal", "exportar"]
    .every(v => vistas.some(x => x.startsWith(v + ":"))), vistas);
  assert("T2: al cambiar de pestaña, primero su botón del menú", await page.evaluate(() => TOUR_PASOS.every((s, i) =>
    !s.pestana || (i > 0 && TOUR_PASOS[i - 1].pestana === s.pestana) || s.element === '#navPrincipal a[href="#' + s.pestana + '"]')));
  assert("T2: los textos nombran las pestañas, sin su símbolo suelto", await page.evaluate(() => TOUR_PASOS.every(s =>
    !/(en|a) [📊📒💰🧾📤🚀🔍📖]️?(?! [A-ZÁÉÍÓÚ])/u.test(s.popover.description))));

  /* T3: «Empezar» → 🚀, como estaba. */
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".driver-popover-next-btn")]);
  await esperar(300);
  const tras = await page.evaluate(() => ({ hash: location.hash, wallet: state.config.wallet || "", registros: (state.registros || []).length }));
  assert("T3: «Empezar» lleva a 🚀 sin la wallet ni los movimientos del ejemplo", tras.hash === "#inicio" && !tras.wallet && !tras.registros, tras);
  assert("T3: lo guardado, sin nada del ejemplo", await limpio());
  assert("T3: nada salió a internet", fuera.length === 0, fuera);

  /* T4: ✕ a mitad. */
  await page.goto(BASE + "index.html#ayuda", { waitUntil: "networkidle0" });
  await page.evaluate(() => window.scrollTo(0, 0));   // el mismo documento: sigue bajado y la barra de arriba taparía el botón
  await page.click("#tourVer");
  // Solo con «Siguiente», también en «Compra externa»: la pulsa por ti y sigue en 💶.
  for (let i = 0; i < 12; i++) {
    await page.waitForSelector(".driver-popover-next-btn", { visible: true });
    const antes = await parada();
    await page.click(".driver-popover-next-btn");
    await otraParada(antes.n);
    if (antes.titulo === "Compra externa") break;
  }
  const c4 = await parada();
  assert("T4: «Siguiente» en «Compra externa» la decide y lleva a 💶", c4 && c4.titulo === "💶 Coste" && c4.senala, c4);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".driver-popover-close-btn")]);
  await esperar(300);
  const x = await page.evaluate(() => ({ hash: location.hash, wallet: state.config.wallet || "", pop: !!document.querySelector(".driver-popover") }));
  assert("T4: ✕ vuelve a 📖 Ayuda, sin el ejemplo", x.hash === "#ayuda" && !x.wallet && !x.pop, x);
  assert("T4: lo guardado, sin nada del ejemplo", await limpio());
  /* T5 (A1, A2, A8): lo que la recarga del final tiraría → no empieza y lo dice. */
  const abrirAyuda = async () => {
    await page.goto(BASE + "index.html#ayuda", { waitUntil: "networkidle0" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.evaluate(() => window.scrollTo(0, 0));   // la recarga deja la página bajada: la barra de arriba taparía el botón
  };
  const noEmpieza = async (nombre, preparar, texto) => {
    await abrirAyuda();
    await page.evaluate(preparar);
    await page.click("#tourVer");
    await esperar(400);
    const r = await page.evaluate(() => ({ pop: !!document.querySelector(".driver-popover"),
      aviso: [...document.querySelectorAll("#toasts .toast")].map(t => t.textContent).join() }));
    assert("T5: " + nombre + " → no empieza y lo dice", !r.pop && r.aviso.includes("Ahora no: " + texto), r);
  };
  await noEmpieza("con el guardado fallando (A1)", async () => {
    window.escribirArchivoNavegador = async () => { throw new Error("lleno"); };
    marcarCacheDirty();
  }, "lo tuyo no se ha podido guardar");
  await noEmpieza("con una descarga en marcha (A2)", () => { arr.preparando = true; }, "espera a que termine la descarga");
  await noEmpieza("con «Ajustes en JSON» a medio escribir (A8)", () => { document.getElementById("txtAjustes").value = '{"a medias":'; },
    "aplica o borra lo que escribiste");

  /* T6 (A3): lo de tu sesión no se cuela: un filtro de 📒 y una descarga que falló. */
  await abrirAyuda();
  await page.evaluate(() => {
    document.getElementById("txBuscar").value = "zzz";
    document.getElementById("txBuscar").dispatchEvent(new Event("input", { bubbles: true }));
    arr.ultimaPreparacion = { fin: Date.now(), err: ["etherscan"] };
  });
  await page.click("#tourVer");
  await page.waitForSelector(".driver-popover", { visible: true });
  const cuela = await page.evaluate(() => ({ buscar: document.getElementById("txBuscar").value, prep: arr.ultimaPreparacion }));
  assert("T6: en el ejemplo, sin tu búsqueda de 📒 ni tu última descarga", cuela.buscar === "" && cuela.prep === null, cuela);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.click(".driver-popover-close-btn")]);

  /* T7 (A7, A13): «Anterior» hasta 🔍 y «Atrás» del navegador. */
  await abrirAyuda();
  const largo = await page.evaluate(() => history.length);
  await page.click("#tourVer");
  await page.waitForSelector(".driver-popover", { visible: true });
  for (let i = 0; i < 20 && (await parada()).titulo !== "Las cifras"; i++) {
    const n = (await parada()).n;
    await page.click(".driver-popover-next-btn");
    await otraParada(n);
  }
  assert("T7: las pestañas del ejemplo no quedan en el historial (A13)", (await page.evaluate(() => history.length)) === largo);
  const atras = [];
  for (let i = 0; i < 8; i++) {
    const p0 = await parada();
    if (p0.titulo === "Las tareas") break;
    await page.click(".driver-popover-prev-btn");
    await otraParada(p0.n);
    const p1 = await parada();
    atras.push(p1.titulo + (p1.senala ? "" : " (sin señalar)"));
  }
  assert("T7: «Anterior» hasta 🔍 se salta lo ya hecho y señala el catálogo (A7)",
    atras.join(" < ") === "📊 Dashboard < Ya decididos < Venta < Catálogo de inmuebles < Las tareas", atras);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle0" }), page.evaluate(() => history.back())]);
  await esperar(300);
  const tras7 = await page.evaluate(() => ({ pop: !!document.querySelector(".driver-popover"), wallet: state.config.wallet || "" }));
  assert("T7: «Atrás» del navegador sale del ejemplo (A13)", !tras7.pop && !tras7.wallet, tras7);

  assert("0 errores en la página", errores.length === 0, errores);

  await browser.close();
  console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
