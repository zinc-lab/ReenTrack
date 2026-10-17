/* Test de 🔍 Revisión: catálogo con botones, contratos conocidos
 * editables y bloques plegables.
 *
 * Bajo prueba (Reental-SPA/js/11-panel.js):
 * - pnFilasCatalogo: orden por primera aparición y una CANDIDATA cuyo token
 *   está en spam_usuario.tokens queda como SPAM; CONFIRMADA y DESCARTADA
 *   no cambian. pnFilasVisibles: solo inmuebles y con dudas (P8: sin
 *   «Descartados»).
 * - pnHtmlCatalogo: un botón por cada estado al que se puede pasar, ninguno
 *   para un token en el spam; el contrato enlaza a Polygonscan.
 * - pnFilasContratos / pnContratoQuitable / pnHtmlContratos: lo aprendido
 *   del archivo de Reental no se quita; lo añadido a mano y las semillas
 *   DeFi (test_semillas_quitadas.js), sí.
 * - pnValidarContrato: dirección, nombre, tipo y duplicados.
 * - index.html: los bloques plegables, cerrados por defecto, y el contador
 *   del menú (lo pinta js/15).
 *
 * DATOS 100% SINTÉTICOS. Ejecución (desde la raíz): node tests/test_panel_paso_ui3.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const S = { console, state: {} };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "08-coingecko.js", "14-clasificador.js", "15-correcciones.js", "18-transacciones.js", "11-panel.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, "js", f), "utf8"), S, { filename: f });
}

const SEMILLAS = vm.runInContext("SEMILLAS_DEFI", S); // const: no está en el contexto global
let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const json = x => JSON.stringify(x);
const dir = c => "0x" + c.repeat(40);
const A = dir("a"), B = dir("b"), C = dir("c"), D = dir("d");

const cache = {
  catalogo_propiedades: {
    [A]: { nombre_reental: "Cáceres 8", simbolo: "RCAC8", estado: "CONFIRMADA", primera_aparicion: "2024-07-11" },
    [B]: { nombre_etherscan: "Reental Dudoso", simbolo: "RDUD", estado: "CANDIDATA", primera_aparicion: "2025-01-02" },
    [C]: { nombre_etherscan: "Tether USD", simbolo: "USDT", estado: "CANDIDATA", primera_aparicion: "2025-03-04" },
    [D]: { nombre_etherscan: "Basura", simbolo: "BAS", estado: "DESCARTADA" },
    roto: "no es un objeto",
  },
  spam_usuario: { tokens: { [C.toUpperCase().replace("0X", "0x")]: { nota: "x" } }, direcciones: {} },
  contratos_aprendidos: {
    DISTRIBUIDOR: { [dir("1")]: "Distribuidor de dividendos (cruce CSV)" },
    SETTLEMENT: {},
    DEFI_POOL: { "0x84f1ba6aa1b1b6b4a8a3c0e0b0a6b1b3e1c0f0a1": "Mi pool" },
    DEFI_STAKING: Object.assign({}, SEMILLAS.DEFI_STAKING),
  },
};

console.log("== 1. Filas del catálogo ==");
const filas = S.pnFilasCatalogo(cache);
assert("por primera aparición, sin fecha al final y sin entradas rotas",
  json(filas.map(f => f.addr)) === json([A, B, C, D]), filas.map(f => f.addr));
assert("la CANDIDATA mandada al spam entera sale como SPAM; las demás, su estado",
  json(filas.map(f => f.estado)) === json(["CONFIRMADA", "CANDIDATA", "SPAM", "DESCARTADA"]), filas.map(f => f.estado));
assert("sin bloque spam_usuario: la CANDIDATA sigue con dudas",
  S.pnFilasCatalogo({ catalogo_propiedades: cache.catalogo_propiedades }).find(f => f.addr === C).estado === "CANDIDATA");
const confirmadaEnSpam = { catalogo_propiedades: { [C]: { estado: "CONFIRMADA" } }, spam_usuario: { tokens: { [C]: {} } } };
assert("una CONFIRMADA no cambia aunque su token esté en el spam (gana el inmueble)",
  S.pnFilasCatalogo(confirmadaEnSpam)[0].estado === "CONFIRMADA");
assert("sin cache: ninguna fila", S.pnFilasCatalogo(null).length === 0);
/* Auditoría de la tanda P (A11): una fecha escrita a mano como número no deja 🔍 sin tarjetas. */
let conNumero = null;
try { conNumero = S.pnFilasCatalogo({ catalogo_propiedades: { [A]: { primera_aparicion: "2024-01-01" }, [B]: {}, [C]: { primera_aparicion: 20230101 } } }); } catch (e) { conNumero = String(e); }
assert("A11: con primera_aparicion numérica, las filas salen igual (sin lanzar)", Array.isArray(conNumero) && conNumero.length === 3, conNumero);

console.log("== 2. HTML del catálogo ==");
// El token del spam (SPAM) y el DESCARTADA viejo no se pintan nunca (pnFilasVisibles los deja fuera): su hueco queda vacío.
const html = filas.map(f => f.estado === "SPAM" || f.estado === "DESCARTADA" ? "" : S.pnHtmlFilaCatalogo(f));
const estados = h => [...h.matchAll(/data-estado="([A-Z]+)"/g)].map(m => m[1]);
assert("Inmueble: solo «Descartar»", json(estados(html[0])) === json(["DESCARTADA"]) && /🚫 Descartar/.test(html[0]));
assert("Con dudas: «Confirmar» y «Descartar»", json(estados(html[1])) === json(["CONFIRMADA", "DESCARTADA"]));
assert("el del spam no se pinta", html[2] === "");
assert("P8: la lista lleva inmuebles y con dudas; ni el del spam ni un DESCARTADA viejo",
  json(S.pnFilasVisibles(filas).map(f => f.addr)) === json([A, B]));
assert("cada botón con su burbuja (Descartar: todo el token a spam, se deshace en 📒)",
  /class="rv-burbuja"[^>]*>No es un inmueble: todo el token pasa a spam\. Se deshace con ↩ en 📒\./.test(html[0]) &&
  (html[1].match(/rv-burbuja/g) || []).length === 2 && /aria-label="Descartar: No es un inmueble/.test(html[0]));
assert("P8: sin «↩ Con dudas» (ya no hay descartados en el catálogo)", !html.join("").includes('data-estado="CANDIDATA"'));
assert("el contrato enlaza a Polygonscan, corto", html[0].includes("https://polygonscan.com/address/" + A) && html[0].includes("0xaaaa…aaaa ↗"));
assert("fecha a la española y «—» sin fecha", html[0].includes("11/07/2024") &&
  S.pnHtmlFilaCatalogo({ addr: D, estado: "CANDIDATA", entrada: {} }).includes("<td>—</td>"));
assert("sin estado de selección (W13: botones, no desplegable)", !html.join("").includes("<select"));
assert("catálogo vacío: una fila que lo dice", /Sin inmuebles todavía/.test(S.pnHtmlCatalogo([])));
assert("el nombre se escapa", /&lt;b&gt;/.test(S.pnHtmlFilaCatalogo({ addr: A, estado: "CANDIDATA", entrada: { nombre_etherscan: "<b>x" } })));

console.log("== 3. Direcciones que la app reconoce ==");
const contratos = S.pnFilasContratos(cache);
assert("en el orden de los tipos y con el texto de hoy",
  json(contratos.map(c => c.rol)) === json(["DISTRIBUIDOR", "DEFI_POOL", "DEFI_STAKING"]) &&
  contratos[0].nombre === "Distribuidor de rendimientos (cruce con el archivo de Reental)", contratos);
assert("no se escribe en la cache al enseñarlo",
  cache.contratos_aprendidos.DISTRIBUIDOR[dir("1")] === "Distribuidor de dividendos (cruce CSV)");
const semilla = Object.keys(SEMILLAS.DEFI_STAKING)[0];
assert("quitables: lo añadido a mano y las semillas; no lo del archivo de Reental",
  S.pnContratoQuitable("DEFI_POOL") && S.pnContratoQuitable("DEFI_STAKING") &&
  !S.pnContratoQuitable("DISTRIBUIDOR") && !S.pnContratoQuitable("SETTLEMENT"));
const htmlC = S.pnHtmlContratos(contratos);
assert("un ✕ en el añadido a mano y en la semilla; ninguno en lo del archivo",
  (htmlC.match(/data-rol=/g) || []).length === 2 && /data-rol="DEFI_POOL"/.test(htmlC) &&
  htmlC.includes('data-addr="' + semilla + '"') && !/data-rol="DISTRIBUIDOR"/.test(htmlC));
assert("tipos en llano", /Distribuidor de Reental/.test(htmlC) && /<td>Pool<\/td>/.test(htmlC) && /<td>Staking<\/td>/.test(htmlC));

console.log("== 4. Añadir un contrato ==");
const v = S.pnValidarContrato(cache, "  0x" + "E".repeat(40) + " ", " Mi farm ", "DEFI_FARMING");
assert("válido: dirección normalizada y nombre recortado", json(v) === json({ addr: dir("e"), nombre: "Mi farm", rol: "DEFI_FARMING" }), v);
assert("dirección mal escrita", /0x y 40/.test(S.pnValidarContrato(cache, "0x123", "x", "DEFI_POOL").error));
assert("sin nombre", /nombre/.test(S.pnValidarContrato(cache, dir("e"), " ", "DEFI_POOL").error));
assert("tipo no editable (distribuidor)", /tipo/.test(S.pnValidarContrato(cache, dir("e"), "x", "DISTRIBUIDOR").error));
assert("ya conocido (en otro tipo, sin importar mayúsculas)",
  /Distribuidor de Reental/.test(S.pnValidarContrato(cache, dir("1").toUpperCase().replace("0X", "0x"), "x", "DEFI_POOL").error));
assert("ya en el catálogo de inmuebles", /catálogo/.test(S.pnValidarContrato(cache, A, "x", "DEFI_POOL").error));

vm.runInContext("state.config = { wallet: \"" + dir("1") + "\", vault: \"" + dir("2") + "\" }", S); // state es un const de js/01
assert("tu wallet o tu vault no se pueden añadir",
  /tuya/.test(S.pnValidarContrato(cache, dir("2"), "x", "DEFI_POOL").error) &&
  /tuya/.test(S.pnValidarContrato({}, dir("1"), "x", "DEFI_POOL").error));
vm.runInContext("state.config = {}", S);

console.log("== 4b. Precios de RNT: solo las fechas que faltan ==");
const RNT_ = vm.runInContext("RNT", S);
const ts = d => String(Math.floor(Date.parse(d + "T12:00:00Z") / 1000));
const movRnt = d => ({ contractAddress: RNT_, timeStamp: ts(d), value: "1", tokenDecimal: "18" });
const AHORA = Date.parse("2026-10-02T10:00:00Z");
const cRnt = {
  transacciones: { wallet_tokens: [movRnt("2024-03-01"), movRnt("2024-05-05"), movRnt("2026-09-01")], vault_tokens: [movRnt("2024-06-06")] },
  precios_rnt: { "2024-05-05": 0.4 },
  precios_rnt_no_disponibles: { "2024-01-10": "borrado manualmente por el usuario", "2024-05-05": "viejo" },
};
const falt = S.pnFechasSinPrecioRnt(cRnt, AHORA);
assert("fechas sin precio: las marcadas y las de hace más de 365 días sin precio; no las recientes ni las que ya tienen precio",
  json(falt.map(f => f[0])) === json(["2024-01-10", "2024-03-01", "2024-06-06"]), falt);
assert("cada una con su motivo (las de más de 365 días, el de CoinGecko)",
  falt[0][1] === "borrado manualmente por el usuario" && /365/.test(falt[1][1]), falt);
assert("sin cache: ninguna", S.pnFechasSinPrecioRnt(null, AHORA).length === 0);
assert("enlace a la página de CoinGecko de ese día",
  S.pnUrlCoingeckoDia("2024-10-23") === "https://www.coingecko.com/en/coins/reental/historical_data?start=2024-10-23&end=2024-10-23");

console.log("== 5. index.html ==");
const pagina = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
const ids = ["rvCatalogo", "rvPreciosRnt", "rvPreciosPol", "rvContratos", "rvAjustes"];
assert("los cinco bloques son plegables y cerrados por defecto",
  ids.every(id => new RegExp('<details id="' + id + '"( class="[^"]*")?>').test(pagina)), ids);
assert("el editor JSON va dentro de su plegable (T63), con aviso",
  /<details id="rvAjustes"[\s\S]*?id="txtAjustes"[\s\S]*?<\/details>/.test(pagina) && /Un error cambia lo que sale en todas las pestañas/.test(pagina));
// Explicación breve en cada apartado; «Movimientos ya decididos» no la lleva.
assert("ccResueltos sin explicación debajo del título",
  !/<details id="ccResueltos"[^>]*>\s*<summary>(?:(?!<details)[\s\S])*?<\/summary>\s*<p class="help rv-explica">/.test(pagina));
assert("cada apartado de 🔍 Revisión lleva su explicación breve, justo debajo del título",
  ["cbCoste", "rvCatalogo", "rvPreciosRnt", "rvPreciosPol", "rvContratos"].every(id =>
    new RegExp('<details id="' + id + '"[^>]*>\\s*<summary>(?:(?!<details)[\\s\\S])*?</summary>\\s*<p class="help rv-explica">[^<]{20,140}</p>').test(pagina)) &&
  /Correcciones a mano de movimientos concretos\. ⚠ Un error cambia lo que sale en todas las pestañas\./.test(pagina));
assert("las fechas sin precio, ocultas hasta que haya alguna",
  /<div id="rvRntFaltantes" hidden>/.test(pagina));
assert("el título dice de qué token son los precios (T60)",
  /🪙 Precios de RNT \(USD\)/.test(pagina) && /⛽ Precios de POL \(USD\)/.test(pagina));
assert("contador de 🔍 Revisión en el menú, oculto de entrada",
  /href="#revision"[^>]*>🔍 <span class="label">Revisión<\/span><span class="nav-n" id="ccNavRevision" hidden><\/span>/.test(pagina));
assert("precios de RNT sin formulario libre y con el enlace a CoinGecko a la vista",
  !pagina.includes('id="btnAddPrecioRnt"') && !pagina.includes('id="inpPrecioRntFecha"') &&
  /<a href="https:\/\/www\.coingecko\.com\/en\/coins\/reental" target="_blank" rel="noopener">CoinGecko ↗<\/a>/.test(pagina));
assert("Revisión sin filtros", !pagina.includes('id="ccFiltros"') && !pagina.includes("ccFiltroCategoria"));
assert("«💶 Coste de las compras externas»", pagina.includes("💶 Coste de las compras externas ("));
assert("el título de cada pestaña, más grande", /\.view>\.card:first-of-type>h2:first-child[^{]*\{font-size:28px/.test(pagina));
const js15 = fs.readFileSync(path.join(BASE, "js", "15-correcciones.js"), "utf8");
assert("js/15 pinta el contador con la misma lista de «por decidir»",
  /\$\("ccNavRevision"\)[\s\S]{0,200}cola\.length/.test(js15));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
