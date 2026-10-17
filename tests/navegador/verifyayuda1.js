/* Arnés de 📖 Ayuda: está en el menú, se abre, sus enlaces llevan
 * a las 7 pestañas y la página no desplaza de lado a 1366 px.
 *
 * Sin datos. Ejecución (servidor en 8765 y NODE_PATH a puppeteer-core):
 *   node tests/navegador/verifyayuda1.js
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
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-first-run"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });
  const errores = [];
  page.on("pageerror", e => errores.push(String(e && e.message || e)));
  await page.goto(BASE + "index.html", { waitUntil: "networkidle0" });

  await page.click('#navPrincipal a[href="#ayuda"]');
  await esperar(300);
  const m = await page.evaluate(() => {
    const v = document.getElementById("view-ayuda");
    return {
      activa: v.classList.contains("active") && v.offsetHeight > 0,
      menu: document.querySelector('#navPrincipal a.active').getAttribute("href"),
      ultimo: [...document.querySelectorAll("#navPrincipal a")].pop().getAttribute("href"),
      destinos: [...new Set([...v.querySelectorAll("a")].map(a => a.getAttribute("href")))],
      rotos: [...v.querySelectorAll("a")].map(a => a.getAttribute("href")).filter(h => !document.getElementById("view-" + h.slice(1))),
      deLado: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  assert("al pulsar 📖 Ayuda se abre la pestaña y se marca en el menú", m.activa && m.menu === "#ayuda", m);
  assert("📖 Ayuda es la última del menú", m.ultimo === "#ayuda", m);
  assert("los enlaces llevan a las 7 pestañas, ninguno roto", m.destinos.length === 7 && m.rotos.length === 0, m);
  assert("a 1366 px la página no desplaza de lado", !m.deLado, m);

  /* Lo que dice la Ayuda es verdad. */
  const v = await page.evaluate(() => {
    const ayuda = document.getElementById("view-ayuda");
    const botones = [...document.querySelectorAll("button")].map(b => b.textContent.trim());
    const citados = (ayuda.textContent.match(/«[^»]+»/g) || []).map(c => c.slice(1, -1));
    const lista = [...ayuda.querySelectorAll("ul a")].map(a => a.getAttribute("href"));
    const menu = [...document.querySelectorAll("#navPrincipal a")].map(a => a.getAttribute("href")).filter(h => h !== "#ayuda");
    return { citados, faltan: citados.filter(c => !botones.includes(c)), lista, menu, texto: ayuda.textContent };
  });
  assert("A13: cada botón que cita la Ayuda («…») existe con ese nombre", v.citados.length >= 3 && v.faltan.length === 0, v.faltan);
  assert("A7: «Cada pestaña» va en el orden del menú", JSON.stringify(v.lista) === JSON.stringify(v.menu), v.lista);
  assert("A6, A8, A9: 🔍 con el coste de las compras por banco, «transacciones» para lo descargado e imprimir las 4 de 📤",
    /el coste de las compras externas/.test(v.texto) && /lee tus transacciones de Reental/.test(v.texto) &&
    /trae tus transacciones nuevas/.test(v.texto) && /imprimir 📊, 📒, 💰 o 🧾/.test(v.texto), v.texto.slice(0, 200));

  await page.click('#view-ayuda a[href="#fiscal"]');
  await esperar(300);
  assert("un enlace de la ayuda abre su pestaña", await page.evaluate(() => document.getElementById("view-fiscal").classList.contains("active")));

  assert("0 errores", errores.length === 0, errores);
  await browser.close();
  console.log("\n" + ok + "/" + (ok + fallos) + " comprobaciones OK" + (fallos ? " -> " + fallos + " FALLOS" : " -> TODO VERDE"));
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error("ERROR FATAL:", e); process.exit(2); });
