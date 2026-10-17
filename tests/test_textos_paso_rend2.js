/* Test: lo que se ve en la app usa las palabras del glosario
 * (docs/especificaciones/glosario.md) y no dice que sin vault no se ven los
 * rendimientos.
 *
 * A) Ninguna palabra de la columna «Fuera» del glosario en los textos de
 *    index.html ni de los módulos js/ (mismo método que
 *    test_textos_paso_copy1.js: se extraen los literales de texto, sin
 *    comentarios).
 * B) Lo que sí debe decir: etiquetas de categoría y de tipo de rendimiento,
 *    los textos del vault y los nombres del Panel.
 *
 * Ejecución (desde la raíz del repo): node tests/test_textos_paso_rend2.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA");
const MODULOS = fs.readdirSync(path.join(BASE, "js")).filter(f => f.endsWith(".js")).sort();

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}

/* Literales de texto de un fuente JS, sin comentarios (como en test_textos_paso_copy1.js). */
function literales(fuente) {
  const out = [];
  let i = 0;
  const n = fuente.length;
  while (i < n) {
    const c = fuente[i], d = fuente[i + 1];
    if (c === "/" && d === "/") { while (i < n && fuente[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const f = fuente.indexOf("*/", i + 2); i = f < 0 ? n : f + 2; continue; }
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1, txt = "";
      while (j < n && fuente[j] !== c) {
        if (fuente[j] === "\\") { txt += fuente[j + 1]; j += 2; continue; }
        if (c !== "`" && fuente[j] === "\n") break;
        txt += fuente[j]; j++;
      }
      out.push({ txt, linea: fuente.slice(0, i).split("\n").length });
      i = j + 1;
      continue;
    }
    i++;
  }
  return out;
}

/* Las palabras de la columna «Fuera» del glosario. */
const FUERA = [
  [/dividendo/i, "«rendimiento», no «dividendo»"],
  [/\bbrut[oa]s?\b/i, "«íntegro», no «bruto»"],
  [/\brewards?\b/i, "«recompensa DeFi», no «reward»"],
  [/propiedad(es)?\b/i, "«inmueble», no «propiedad»"],
  [/deveng/i, "«reparto», no «devengo»"],
  [/distribuci[oó]n|distribuciones/i, "«reparto», no «distribución»"],
  [/año fiscal/i, "«ejercicio», no «año fiscal»"],
  [/período/i, "«periodo», sin tilde"],
  [/coste FIFO|coste base/i, "«coste de compra»"],
  [/\bCSV de\b/, "«archivo de rendimientos de Reental»"],
  [/(?<!\bA )\bREVISAR\b/, "«a revisar», no el código REVISAR"],
  [/pendientes? de (revis|vincular)|cobros? pendientes?/i, "«a revisar» / «por vincular»: «pendiente» es solo para rendimientos"],
  [/compras? bancarias?|compras? por (banco|transferencia)/i, "«compra externa», no «compra bancaria / por banco / por transferencia»"],
];
/* Solo los textos para personas: con algún espacio y alguna palabra. */
const esProsa = t => /\s/.test(t) && /[a-záéíóúñ]{3}/i.test(t);
/* También las notas de los registros (todo js/14) y
   los textos que se guardan en la cache al aprender un contrato usan las
   palabras del glosario. */
const PERMITIDO = [
  // Única excepción: los textos de antes que pueden estar guardados en la
  // cache. Solo se usan para reconocerlos y traducirlos al enseñarlos
  // (TEXTOS_CACHE_ANTIGUOS, js/02); nunca se escriben ni se ven.
  /^Distribuidor de dividendos \(cruce CSV\)$/,
  /^Settlement \(burn de propiedad \+ (stablecoin|USDT) al vault\)$/,
];

console.log("A) Ninguna palabra retirada en lo que se ve");
let total = 0;
for (const m of MODULOS) {
  const fuente = fs.readFileSync(path.join(BASE, "js", m), "utf8");
  const lits = literales(fuente).filter(l => esProsa(l.txt) && !PERMITIDO.some(re => re.test(l.txt)));
  total += lits.length;
  const hallazgos = [];
  for (const l of lits) {
    // «propiedad directa», en el glosario del informe (js/22), es ser
    // dueño, no un inmueble.
    const txt = l.txt.replace(/propiedad directa/g, "");
    for (const [re, motivo] of FUERA) {
      if (re.test(txt)) hallazgos.push(m + ":" + l.linea + " «" + l.txt.slice(0, 80) + "» — " + motivo);
    }
  }
  assert("js/" + m + ": " + lits.length + " textos con las palabras del glosario", hallazgos.length === 0, hallazgos);
}
assert("se han mirado textos de verdad (control)", total > 400, total);

const html = fs.readFileSync(path.join(BASE, "index.html"), "utf8");
const sinCodigo = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<script[\s\S]*?<\/script>/g, "");
// Texto visible + los title/aria-label/placeholder (también se leen).
const atributos = [...sinCodigo.matchAll(/(?:title|aria-label|placeholder)="([^"]*)"/g)].map(x => x[1]).join(" \n ");
const visible = sinCodigo.replace(/<[^>]+>/g, " ") + " \n " + atributos;
const enHtml = FUERA.map(([re, motivo]) => {
  const x = visible.match(re);
  return x ? "«" + visible.slice(Math.max(0, x.index - 30), x.index + 40).replace(/\s+/g, " ") + "» — " + motivo : null;
}).filter(Boolean);
assert("index.html: texto visible, títulos y ayudas con las palabras del glosario", enHtml.length === 0, enHtml);
assert("index.html: «Pendiente», a secas, ya no es el estado de un paso (es «Por hacer»; PM-4: queda la tarjeta de sincronización)",
  !/class="arr-tag">Pendiente</.test(html) && (html.match(/class="arr-tag">Por hacer</g) || []).length === 1);

console.log("B) Lo que sí debe decir");
const sb = { console, document: { getElementById: () => null } };
sb.globalThis = sb;
vm.createContext(sb);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "10-csv-descubrimiento.js",
                 "14-clasificador.js", "15-correcciones.js", "16-dashboard.js", "18-transacciones.js",
                 "19-arranque.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, "js", f), "utf8"), sb, { filename: f });
}
const ev = codigo => vm.runInContext(codigo, sb);
assert("la categoría se enseña como RENDIMIENTO y RECOMPENSA; el código no cambia",
  ev('categoriaAMostrar("RENDIMIENTO")') === "RENDIMIENTO" && ev('categoriaAMostrar("REWARD")') === "RECOMPENSA" &&
  ev('categoriaAMostrar("VENTA")') === "VENTA" && ev('categoriaAMostrar("REVISAR")') === "REVISAR");
assert("tipos de rendimiento: reinvertido / reclamado / pendiente (no «al vault / a la wallet»)",
  ev("TX_OPERACIONES.RCM_REINVERTIDO") === "Rendimiento reinvertido" && ev("TX_OPERACIONES.RCM_RECLAMADO") === "Rendimiento reclamado" &&
  ev("TX_OPERACIONES.RCM_PENDIENTE") === "Rendimiento pendiente" && ev("TX_OPERACIONES.RCM_REWARD") === "Recompensa DeFi");
/* Sin chips: lo dice el selector de categoría. */
assert("📒 Transacciones: el selector dice RENDIMIENTO y RECOMPENSA; el color sigue con el código",
  ev('txEtiquetaCategoriaConteo("RENDIMIENTO", 3)') === "RENDIMIENTO (3)" && ev('txEtiquetaCategoriaConteo("REWARD", 1)') === "RECOMPENSA (1)" &&
  ev('txClaseCategoria("RENDIMIENTO")') === "tx-c-RENDIMIENTO");
assert("la fuente del registro se llama «Archivo de Reental»", ev("TX_FUENTES.CSV_REENTAL") === "Archivo de Reental");

// El vault no es condición para ver los rendimientos.
const burbuja = (html.match(/for="cfgVault"[\s\S]*?title="([^"]*)"/) || [])[1] || "";
assert("burbuja ⓘ del vault: opcional, los rendimientos salen del archivo con o sin vault",
  /Es opcional: tus rendimientos salen del archivo de Reental, con o sin vault/.test(burbuja), burbuja.slice(0, 160));
assert("…y explica qué se gana: el contraste con las transferencias y la comprobación del saldo",
  /contrasta cada rendimiento con su transferencia/.test(burbuja) && /comprueba el saldo del vault/.test(burbuja));
assert("…sin prometer de menos: nada de «NO se ven»", !/NO se ven|no se ven/.test(burbuja) && !/no se ven tus/.test(html));
const js19 = fs.readFileSync(path.join(BASE, "js", "19-arranque.js"), "utf8");
assert("resumen único sin vault (PM-6): «Sin vault (es opcional): no se contrastan los rendimientos ni su saldo.»",
  /Sin vault \(es opcional\): no se contrastan los rendimientos ni su saldo\./.test(js19) &&
  !/no se ven tus dividendos/.test(js19));
const js04 = fs.readFileSync(path.join(BASE, "js", "04-config.js"), "utf8");
assert("js/04 no dice «19 % fijo»", !/19 ?% fijo/.test(js04));

const js16 = fs.readFileSync(path.join(BASE, "js", "16-dashboard.js"), "utf8");
assert("Panel: «Rendimientos» y «A revisar» (no «Dividendos (CSV)» ni «Pendientes REVISAR»)",
  js16.includes('dashMetrica("Rendimientos",') && js16.includes('dashMetrica("Revisar",') &&
  !js16.includes("Dividendos (CSV)") && !js16.includes("Pendientes REVISAR"));
assert("menú y pestaña: «Rendimientos»",
  /title="Rendimientos">💰 <span class="label">Rendimientos<\/span>/.test(html) && /<h2>💰 Rendimientos<\/h2>/.test(html));
assert("Puesta en marcha: «el archivo de rendimientos de Reental» (PM-4: sin tarjeta propia)",
  /archivo de rendimientos de Reental/i.test(html));

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
