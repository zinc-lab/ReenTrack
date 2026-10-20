/* Test unitario de 📒 Transacciones: el importe de las recompensas DeFi (P24).
 *
 * Funciones bajo prueba (Reental-SPA/js/18-transacciones.js):
 * - txImporteValor / txImporteCorto / txImporte / txLineasImporte: una
 *   recompensa sin importe sale al precio de RNT del día (el mismo que usa
 *   el motor, js/21), con «≈» y la ayuda; en USDT, 1 = 1 USD; sin precio,
 *   vacía; lo demás, como antes.
 * - Y que es la misma cifra que da el motor (en euros, con el tipo del BCE).
 *
 * DATOS 100% SINTETICOS.
 *
 * Ejecución (desde la raíz del repo):
 *     node tests/test_transacciones_paso_p24.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const BASE = path.join(__dirname, "..", "Reental-SPA", "js");
const S = { console };
S.globalThis = S;
vm.createContext(S);
for (const f of ["01-constantes.js", "02-utilidades.js", "05-cache.js", "07-bce.js", "10-csv-descubrimiento.js", "14-clasificador.js",
                 "15-correcciones.js", "18-transacciones.js", "21-fiscal.js"]) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), "utf8"), S, { filename: f });
}

let ok = 0, fallos = 0;
function assert(nombre, cond, extra) {
  if (cond) { ok++; console.log("  OK   " + nombre); }
  else { fallos++; console.error("  FALLO " + nombre + (extra !== undefined ? " -> " + JSON.stringify(extra) : "")); }
}
const RNT = "0xrnt";
// El state de la app (js/01), no una propiedad del sandbox.
const ponerCache = c => { S.__c = c; vm.runInContext("state.cache = __c", S); };
const reg = (clave, fecha, categoria, extra = {}) => Object.assign({ clave, fecha, hash: "0x" + clave, contrato: RNT, simbolo: "RNT",
  cantidad: 10, categoria, subcategoria: "", importe_usdt: null, coste_eur: null, origen: "", destino: "", nota: "", revisar: false }, extra);
ponerCache({ precios_rnt: { "2025-03-01": 0.25 } });

console.log("== 1. Recompensas ==");
const rew = reg("r1", "2025-03-01 10:00:00", "REWARD", { subcategoria: "RCM_REWARD" });
const v = S.txImporteValor(rew);
assert("RNT: cantidad × precio del día, estimado", v && Math.abs(v.v - 2.5) < 1e-12 && v.unidad === " USD" && v.estimado === true, v);
assert("en la tabla, «≈ 2,50 USD»", S.txImporteCorto(rew) === "≈ 2,50 USD", S.txImporteCorto(rew));
assert("la ayuda dice de dónde sale", JSON.stringify(S.txLineasImporte(rew)) === JSON.stringify(["≈ 2,5 USD", "Al precio de RNT del día"]),
  S.txLineasImporte(rew));
const regalo = reg("r2", "2025-03-01 10:00:00", "REWARD", { subcategoria: "GPP_REGALO" });
assert("un regalo, igual", S.txImporteCorto(regalo) === "≈ 2,50 USD");
assert("sin precio ese día: vacío (como antes)", S.txImporteCorto(reg("r3", "2025-03-02 10:00:00", "REWARD")) === "");
assert("sin cantidad: vacío", S.txImporteCorto(reg("r4", "2025-03-01 10:00:00", "REWARD", { cantidad: null })) === "");
const usdt = reg("r5", "2025-03-02 10:00:00", "REWARD", { contrato: vm.runInContext("USDT", S), simbolo: "USDT", cantidad: 3 });
assert("en USDT, 1 = 1 USD y sin «≈»", S.txImporteCorto(usdt) === "3,00 USD" && !S.txImporteValor(usdt).estimado, S.txImporteCorto(usdt));
assert("con importe propio manda el suyo", S.txImporteCorto(reg("r6", "2025-03-01 10:00:00", "REWARD", { importe_usdt: 7 })) === "7,00 USD");

console.log("== 2. Lo demás, como antes ==");
assert("un movimiento neutro de RNT sigue vacío", S.txImporteCorto(reg("m1", "2025-03-01 10:00:00", "MOVIMIENTO", { subcategoria: "NEUTRO" })) === "");
assert("una compra con su importe, sin «≈»", S.txImporteCorto(reg("c1", "2025-03-01 10:00:00", "COMPRA", { importe_usdt: 100 })) === "100,00 USD");
ponerCache(null);
assert("sin cache: vacío, sin error", S.txImporteCorto(rew) === "");

console.log("== 3. La misma cifra que el motor ==");
const cache = { precios_rnt: { "2025-03-01": 0.25 }, precios_pol: {}, tipos_bce: { "2025-03-01": 1.25 } };
const enMotor = [Object.assign(structuredClone(rew), { tipo_bce: 1.25 })];
S.motorFiscal(enMotor, cache, { wallet: "", vault: "" }, { cierres: {}, cierres_usd: {}, cierres_pools: {}, cierres_otras: {} });
ponerCache(cache);
assert("📒 en USD × tipo = 🧾 en €", Math.abs(S.txImporteValor(rew).v / 1.25 - enMotor[0].importe_eur) < 1e-9, [S.txImporteValor(rew), enMotor[0].importe_eur]);

console.log("\nRESULTADO: " + ok + "/" + (ok + fallos) + (fallos ? " — HAY FALLOS" : " — todo en verde"));
process.exit(fallos ? 1 : 0);
