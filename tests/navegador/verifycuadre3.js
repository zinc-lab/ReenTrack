/* Verificación headless del cuadre con la blockchain en la app (js/28):
 * Chrome local + puppeteer-core sobre http://localhost:8765.
 * DATOS 100 % SINTÉTICOS: los de verifyfiscal1 (fiscal1_comun.js); la red
 * NO se usa: los pasos de sincronizar (js/09) y saldoTokenOnchain (js/06)
 * se sustituyen en la página por dobles, así corre el «🔄 Actualizar» real
 * (arrFlujo de js/19). Capturas en la carpeta CAPTURAS, si existe.
 *
 *  C1) «🔄 Actualizar» lee, al terminar, el saldo de cada token (una vez
 *      por token sin vault) y un token que no cuadra sale en el resumen de
 *      🚀 con «ver los avisos».
 *  C2) «ver los avisos» lleva a 🧾 Fiscal en el año del aviso, con el
 *      aviso «Cuadre con la blockchain»; el Excel de 📤 lleva su hoja.
 *  C3) Con la blockchain igual que la app: «Tu cartera cuadra con la
 *      blockchain.» y ningún aviso.
 *  C4) Con la descarga de Etherscan fallida: no se lee nada y no hay
 *      cuadre (ni el de antes).
 *  C5) Otra wallet escrita: el cuadre de antes no vale.
 *  C5b) Durante la lectura: irse a 🧾 Fiscal, que
 *      al terminar se pinta (no se queda en «Actualizando»); cambiar la
 *      wallet o cargar el archivo de Reental, que se clasifica otra vez.
 *  C6) 0 errores.
 *
 * Ejecución (desde la raíz, con NODE_PATH al node_modules del arnés):
 *   node tests/navegador/verifycuadre3.js
 */
"use strict";
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");
const montarFiscal1 = require("./fiscal1_comun");

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = (process.env.REENTAL_BASE || "http://localhost:8765/").replace(/\/?$/, "/");
const CAPTURAS = path.join(__dirname, "..", "..", "privado", "evidencias", "CUADRE-3");

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* En la página: sincronizar sin red y una blockchain de mentira. */
function dobles() {
  window.__falla = null;
  window.__lecturas = [];
  window.__blockchain = {};   // contrato -> saldo (lo que no esté: 0)
  for (const p of ["Etherscan", "Bce", "Rnt", "Vault"]) {
    window["paso" + p] = async () => { if (window.__falla === p) throw new Error("fallo simulado"); };
  }
  window.__alLeer = null;   // se llama una vez, en la primera lectura
  window.saldoTokenOnchain = async (direccion, contrato) => {
    if (window.__alLeer) { const f = window.__alLeer; window.__alLeer = null; await f(); }
    window.__lecturas.push([direccion, contrato]);
    return window.__blockchain[contrato] ?? 0;
  };
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run", "--no-default-browser-check"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  page.on("console", m => {
    const url = (m.location() || {}).url || "";
    if (m.type() === "error" && !/favicon/i.test(url + " " + m.text())) errores.push(m.text());
  });
  const captura = async nombre => {
    if (fs.existsSync(CAPTURAS)) await page.screenshot({ path: path.join(CAPTURAS, nombre), fullPage: false });
  };

  await page.goto(BASE + "index.html#inicio", { waitUntil: "networkidle0" });
  await page.evaluate(montarFiscal1);
  await page.evaluate(() => { volcarConfigAFormulario(); renderPanel(); });
  await page.evaluate(dobles);
  // La cartera que da la app, para que la blockchain de mentira la copie.
  const cartera = await page.evaluate(() => {
    ejecutarClasificacion({ silencioso: true });
    const pos = posicionAbierta(fiResultado().colas);
    return Object.fromEntries(Object.entries(pos).map(([a, v]) => [a, v[0]]));
  });
  const FONDO = "0x" + "a1".repeat(20);
  const actualizar = () => page.evaluate(async () => { await arrFlujo({ sincronizar: true }); });
  const lineas = () => page.evaluate(() => [...document.querySelectorAll("#arrFin .arr-linea")].map(l => l.textContent.trim()));

  console.log("C1) «🔄 Actualizar» lee los saldos y avisa del que no cuadra");
  await page.evaluate((cartera, index) => {
    for (const [a, n] of Object.entries(cartera)) window.__blockchain[a.startsWith("0x") ? a : { USDT, USDC, RNT, POL: "pol" }[a]] = n;
    window.__blockchain[index] = cartera[index] + 1;   // un token de más en la blockchain
  }, cartera, FONDO);
  await actualizar();
  const c1 = await page.evaluate(() => ({ lecturas: window.__lecturas.length, tokens: Object.keys(cuadreActivos(fiResultado().colas, state.cache)).length,
    soloWallet: window.__lecturas.every(([d]) => d === state.config.wallet.toLowerCase()), cuadre: fiResultado().cuadre }));
  assert("una lectura por token, solo en la wallet (sin vault)", c1.lecturas === c1.tokens && c1.soloWallet, c1);
  assert("el inmueble con uno de más no cuadra (+1)", c1.cuadre && c1.cuadre.diferencias.length === 1 &&
    c1.cuadre.diferencias[0].activo === FONDO && c1.cuadre.diferencias[0].diferencia === 1, c1.cuadre && c1.cuadre.diferencias);
  const l1 = await lineas();
  assert("el resumen de 🚀 lo dice, con el nombre y «ver los avisos»",
    l1.some(t => /1 token no cuadra con la blockchain: Prueba Fondo 1\. ver los avisos/.test(t)), l1);
  assert("el título, «con avisos»", /con avisos/.test(await page.$eval("#arrFin .arr-fin-t", e => e.textContent)));
  assert("la barra vuelve a lo que decía la sincronización", !/Cuadre/.test(await page.$eval("#textoProgreso", e => e.textContent)));
  await captura("cap_cuadre3_resumen.png");

  console.log("C2) «ver los avisos» y el Excel");
  await page.click('#arrFin [data-accion="cuadre"]');
  await page.waitForFunction(() => location.hash === "#fiscal" && document.querySelector("#fiAvisos"), { timeout: 5000 });
  await new Promise(r => setTimeout(r, 400));
  const c2 = await page.evaluate(() => ({
    anio: (document.querySelector('.fi-anio[aria-pressed="true"]') || {}).textContent,
    avisos: [...document.querySelectorAll("#fiAvisos .fi-aviso")].map(a => a.textContent),
  }));
  const anioHoy = String(new Date().getUTCFullYear());
  assert("🧾 Fiscal en el año de la lectura", c2.anio === "2026" || c2.anio === anioHoy, c2.anio);
  assert("con el aviso del cuadre, a revisar", c2.avisos.some(a => /⚠️.*Cuadre con la blockchain.*Prueba Fondo 1: según la app tendrías 6 en la wallet y la blockchain dice 7/.test(a)), c2.avisos);
  await page.evaluate(() => document.getElementById("fiAvisos").scrollIntoView());
  await captura("cap_cuadre3_avisos.png");
  const hojas = await page.evaluate(() => {
    const r = fiResultado();
    return excelLibro(r.registros, r.colas, r.resumen, state.cache, state.config, r.informes, new Date(), r.hasta, r.cuadre).hojas.map(h => h.nombre);
  });
  assert("el Excel lleva la hoja «Cuadre con la blockchain», antes de Revisión si la hay", hojas.includes("Cuadre con la blockchain") &&
    hojas.indexOf("Cuadre con la blockchain") === hojas.indexOf("Tipos de cambio BCE") + 1, hojas);
  const exporta = fs.readFileSync(path.join(__dirname, "..", "..", "Reental-SPA", "js", "24-exportar.js"), "utf8");
  assert("📤 le pasa el cuadre al Excel", /r\.hasta, r\.cuadre, r\)/.test(exporta));

  console.log("C3) Todo cuadra");
  await page.evaluate(i => { location.hash = "#inicio"; window.__blockchain[i] -= 1; }, FONDO);
  await new Promise(r => setTimeout(r, 300));
  assert("al volver a 🚀, su resumen sigue con el cuadre (se repinta al entrar)", (await lineas()).some(t => /no cuadra/.test(t)));
  await actualizar();
  const l3 = await lineas();
  assert("«Tu cartera cuadra con la blockchain.»", l3.some(t => /Tu cartera cuadra con la blockchain\./.test(t)) &&
    !l3.some(t => /no cuadra/.test(t)), l3);
  assert("sin aviso del cuadre en el informe", await page.evaluate(() =>
    !Object.values(fiResultado().informes).some(i => i.avisos.some(a => a.concepto === "Cuadre con la blockchain"))));

  console.log("C4) Descarga de Etherscan fallida");
  await page.evaluate(() => { window.__falla = "Etherscan"; window.__lecturas = []; });
  await actualizar();
  const c4 = await page.evaluate(() => ({ lecturas: window.__lecturas.length, cuadre: state.cuadre, linea: document.querySelector("#arrFin").textContent }));
  assert("no lee nada ni deja el cuadre de antes", c4.lecturas === 0 && c4.cuadre === null && !/blockchain/.test(c4.linea), c4);

  console.log("C5) Otra wallet");
  await page.evaluate(() => { window.__falla = null; });
  await actualizar();
  const c5 = await page.evaluate(() => {
    const antes = !!cuadreVigente();
    state.config = Object.assign({}, state.config, { wallet: "0x" + "44".repeat(20) });
    return { antes, despues: cuadreVigente() };
  });
  assert("con otra wallet el cuadre leído ya no vale", c5.antes && c5.despues === null, c5);

  console.log("C5b) Durante la lectura");
  await page.evaluate(w => { state.config = Object.assign({}, state.config, { wallet: w }); volcarConfigAFormulario(); }, "0x" + "11".repeat(20));
  await page.evaluate(() => { location.hash = "#inicio"; window.__alLeer = async () => { location.hash = "#fiscal"; await new Promise(r => setTimeout(r, 300)); }; });
  await actualizar();
  await new Promise(r => setTimeout(r, 400));
  const a2 = await page.evaluate(() => ({ hash: location.hash, cuerpo: document.getElementById("fiCuerpo").textContent.slice(0, 80),
    anios: document.querySelectorAll(".fi-anio").length }));
  assert("A2: en 🧾 durante la lectura, al terminar se pinta (no «Actualizando»)", a2.hash === "#fiscal" && a2.anios > 0 &&
    !/Actualizando/.test(a2.cuerpo), a2);
  const W2 = "0x" + "55".repeat(20);
  await page.evaluate(w2 => { location.hash = "#inicio"; window.__alLeer = async () => {
    document.getElementById("cfgWallet").value = w2;
    document.getElementById("cfgWallet").dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 200)); }; }, W2);
  await actualizar();
  const a4 = await page.evaluate(() => ({ motivo: fiMotivoSinCalculo(), wallet: state.config.wallet, regs: (state.registros || []).length,
    cuadre: cuadreVigente() }));
  assert("A4: cambiar la wallet durante la lectura: se clasifica otra vez con ella (y ese cuadre no vale)",
    a4.wallet === W2 && a4.regs > 0 && a4.motivo === "" && a4.cuadre === null, a4);
  await page.evaluate(w => { document.getElementById("cfgWallet").value = w;
    document.getElementById("cfgWallet").dispatchEvent(new Event("change", { bubbles: true })); }, "0x" + "11".repeat(20));
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => { window.__alLeer = async () => { arrLimpiarClasificacion(); }; });   // lo que hace cargar el CSV (arrTrasCargarCsv)
  await actualizar();
  const a5 = await page.evaluate(() => ({ regs: Array.isArray(state.registros) ? state.registros.length : null, motivo: fiMotivoSinCalculo() }));
  assert("A5: el archivo de Reental cargado durante la lectura: se clasifica otra vez", a5.regs > 0 && a5.motivo === "", a5);

  console.log("C6) Errores");
  assert("0 errores en la consola", !errores.length, errores);

  await browser.close();
  console.log("\n" + ok + " OK, " + fallos + " fallos");
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
