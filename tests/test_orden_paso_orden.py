# -*- coding: utf-8 -*-
"""Prueba de orden: el proyecto sigue ordenado (README, «Dónde va cada cosa»).

Falla en cuanto el desorden aparece, para arreglarlo en el momento:
  - un enlace de un documento que no lleva a nada;
  - el README con 300 líneas o más; el CHANGELOG o el ROADMAP de más de ~50 KB;
  - la lista de módulos del README sin el último módulo de la app;
  - el ROADMAP sin un único paso marcado con ➡️;
  - algo tuyo de privado/datos_reales/ (wallet, vault, nombre, NIF, API keys,
    direcciones, hashes, importes, notas, otras_palabras.txt; ver tus_datos())
    en un archivo que iría a Git (solo si esos datos existen; el aviso dice
    el archivo, la línea y qué es, nunca el valor);
  - un PDF o un Excel dentro del proyecto que Git no ignore (el informe para
    la Renta lleva nombre, NIF e importes).

«Lo que iría a Git» son los archivos versionados y los nuevos no ignorados,
así que también vale antes del primer commit. Lo que no puede juzgar una
máquina (pendientes escondidos, documentos que se contradicen) lo repasa la
skill /orden.

Sin datos del usuario en la salida. Ejecución:
python -m pytest tests/test_orden_paso_orden.py -q
"""
import gzip
import json
import os
import re
import subprocess
import unittest
import urllib.parse

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOPE_KB = 50
TOPE_LINEAS_README = 300


def a_git(*patrones):
    salida = subprocess.run(["git", "ls-files", "--cached", "--others", "--exclude-standard", *patrones],
                            cwd=RAIZ, capture_output=True, text=True, encoding="utf-8", check=True)
    return [a for a in salida.stdout.splitlines() if os.path.isfile(os.path.join(RAIZ, a))]


def leer(ruta):
    with open(os.path.join(RAIZ, ruta), encoding="utf-8", errors="replace") as f:
        return f.read()


def tus_datos():
    """Lo tuyo de privado/datos_reales/ que nunca debe ir a Git, como dos
    diccionarios {valor en minúsculas: etiqueta}:
      - textos (se buscan tal cual): wallet y vault (enteros y sus 8 primeras
        y últimas cifras), nombre completo, NIF, API keys, el principio de tus
        notas y una palabra por línea de privado/datos_reales/otras_palabras.txt
        (partes de tu nombre, tu usuario de antes, tu correo…);
      - piezas (se comparan con las direcciones, hashes y números de cada
        archivo): direcciones con las que has operado (no los contratos
        públicos), el principio de los hashes de tus movimientos y tus
        importes con 3+ decimales.
    Vacíos si no hay datos."""
    carpeta = os.path.join(RAIZ, "privado", "datos_reales")
    if not os.path.isfile(os.path.join(carpeta, "config.json")):
        return {}, {}
    agujas, piezas = {}, {}

    def poner(v, etiqueta, minimo=6):
        if isinstance(v, str) and len(v.strip()) >= minimo:
            agujas[v.strip().lower()] = etiqueta

    config = json.loads(leer("privado/datos_reales/config.json"))
    caches = [json.loads(leer("privado/datos_reales/" + f)) for f in ("reental_cache.json", "reental_cache_prueba.json")
              if os.path.isfile(os.path.join(carpeta, f))]
    for datos in [config] + [c.get("configuracion") or {} for c in caches]:
        for k in ("wallet", "vault"):
            v = datos.get(k)
            if isinstance(v, str) and len(v) >= 42:
                poner(v, k); poner(v[2:10], k + " (principio)"); poner(v[-8:], k + " (final)")
        for k, v in datos.items():
            if "api_key" in k:
                poner(v, "API key")
        inversor = datos.get("inversor") or {}
        poner(inversor.get("nif"), "NIF", 5)
        partes = (inversor.get("nombre") or "").lower().split()
        poner(" ".join(partes), "nombre")
        for a, b in zip(partes, partes[1:]):
            poner(a + b, "nombre")
    otras = os.path.join(carpeta, "otras_palabras.txt")
    if os.path.isfile(otras):
        for linea in leer("privado/datos_reales/otras_palabras.txt").splitlines():
            poner(linea, "otras_palabras.txt", 4)

    crudo = " ".join(json.dumps(c).lower() for c in caches)
    publicas = set(re.findall(r"0x[0-9a-f]{40}", json.dumps([[c.get("catalogo_propiedades"), c.get("contratos_aprendidos")]
                                                              for c in caches]).lower()))
    publicas |= set(re.findall(r"0x[0-9a-f]{40}", leer("Reental-SPA/js/01-constantes.js").lower()))
    for d in set(re.findall(r"0x[0-9a-f]{40}", crudo)) - publicas:
        piezas[d] = "dirección con la que has operado"
    for h in set(re.findall(r"0x[0-9a-f]{64}", crudo)):
        piezas[h[:12]] = "hash de un movimiento tuyo"

    def importe(s):
        if re.fullmatch(r"\d+\.\d{3,}", s) and float(s) >= 1:
            piezas[s] = piezas[s.replace(".", ",")] = "importe"
    for c in caches:
        tx = c.get("transacciones") or {}
        for t in (sum(tx.values(), []) if isinstance(tx, dict) else tx):
            v, dec = str(t.get("value") or ""), str(t.get("tokenDecimal") or "18")
            if v.isdigit() and len(v.rstrip("0")) >= 5 and dec.isdigit():
                importe(f"{int(v) / 10 ** int(dec):.6f}".rstrip("0"))
            # El instante exacto lleva a la transacción (y a la wallet) en Polygonscan.
            ts = str(t.get("timeStamp") or "")
            if re.fullmatch(r"\d{10}", ts):
                piezas[ts] = "instante de un movimiento tuyo"
    csv_ruta = os.path.join(carpeta, "reental_rendimientos.csv")
    if os.path.isfile(csv_ruta):
        for celda in re.split(r'[,\s"]+', leer("privado/datos_reales/reental_rendimientos.csv")):
            importe(celda.strip())

    def notas(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and re.search(r"nota|comentario|motivo", k) and len(v) >= 15:
                    poner(v[:40], "una nota tuya")
                else:
                    notas(v)
        elif isinstance(o, list):
            for v in o:
                notas(v)
    for c in caches:
        notas([c.get(k) for k in ("notas_personales", "ajustes_usuario", "ajustes_movimiento", "pagos_diferidos")])
    return agujas, piezas


def piezas_de(texto):
    """Direcciones, principios de hash (0x + 10 cifras), números con 3+
    decimales e instantes (10 cifras) que no son trozo de un número más largo."""
    return (set(re.findall(r"0x[0-9a-f]{40}", texto)) | set(re.findall(r"0x[0-9a-f]{10}", texto))
            | set(re.findall(r"(?<![\d.,])\d+[.,]\d{3,}(?![\d])", texto))
            | set(re.findall(r"(?<![\d.,])\d{10}(?![\d.,])", texto)))


class TestOrden(unittest.TestCase):

    def test_enlaces_de_los_documentos(self):
        rotos = []
        for doc in a_git("*.md"):
            carpeta = os.path.dirname(doc)
            for n, linea in enumerate(leer(doc).splitlines(), 1):
                for destino in re.findall(r"\]\(([^)\s]+)\)", linea):
                    if destino.startswith(("http:", "https:", "#", "mailto:")):
                        continue
                    ruta = urllib.parse.unquote(destino.split("#")[0])
                    ruta = re.sub(r":\d+$", "", ruta)
                    if ruta and not os.path.exists(os.path.normpath(os.path.join(RAIZ, carpeta, ruta))):
                        rotos.append(f"{doc}:{n} -> {destino}")
        self.assertEqual(rotos, [])

    def test_tamanos(self):
        lineas = len(leer("README.md").splitlines())
        self.assertLess(lineas, TOPE_LINEAS_README, "README.md: recortar")
        grandes = []
        for doc in ("docs/CHANGELOG.md", "docs/ROADMAP.md"):
            kb = os.path.getsize(os.path.join(RAIZ, doc)) / 1024
            if kb > TOPE_KB:
                grandes.append(f"{doc}: {kb:.0f} KB (rehacer corto)")
        self.assertEqual(grandes, [])

    def test_un_solo_paso_actual(self):
        filas = re.findall(r"^\|.*➡️", leer("docs/ROADMAP.md"), re.M)
        self.assertEqual(len(filas), 1, "docs/ROADMAP.md: un solo ➡️ en la tabla «Siguiente»")

    def test_readme_con_todos_los_modulos(self):
        numeros = [int(f[:2]) for f in os.listdir(os.path.join(RAIZ, "Reental-SPA", "js"))
                   if re.match(r"^\d{2}-.*\.js$", f)]
        m = re.search(r"Módulos 00–(\d{2})", leer("README.md"))
        self.assertTrue(m, "README: falta la línea «Módulos 00–NN»")
        self.assertEqual(int(m.group(1)), max(numeros),
                         "README: «Módulos 00–NN» no llega al último módulo de js/")

    def test_sin_tus_datos_en_git(self):
        # Nada de privado/datos_reales/ en lo que iría a Git (ver tus_datos());
        # los .gz (casos y cifras de referencia de las paridades), descomprimidos.
        agujas, piezas = tus_datos()
        if not agujas:
            self.skipTest("sin tus datos en privado/datos_reales/")
        con_datos = []
        for doc in a_git():
            if doc.lower().endswith((".png", ".jpg", ".zip", ".xlsx", ".pdf")):
                continue
            if doc.endswith(".gz"):
                with gzip.open(os.path.join(RAIZ, doc), "rt", encoding="utf-8", errors="replace") as f:
                    texto = f.read().lower()
            else:
                texto = leer(doc).lower()
            halladas = [a for a in agujas if a in texto] + sorted(piezas.keys() & piezas_de(texto))
            for a in halladas:
                linea = texto.count("\n", 0, texto.find(a)) + 1
                con_datos.append(f"{doc}:{linea} ({agujas.get(a) or piezas[a]})")
        self.assertEqual(con_datos, [], "lo que iría a Git lleva datos tuyos (se dice dónde, nunca el valor)")

    def test_privado_y_archivo_de_rendimientos_ignorados(self):
        # Git no sube privado/ ni tu archivo de Reental con ninguno de sus dos
        # nombres, y ningún archivo se llama como antes («dividendo»).
        lineas = leer(".gitignore").split()
        for nombre in ("privado/", "reental_rendimientos.csv", "reental_dividendos.csv"):
            self.assertIn(nombre, lineas)
        viejos = [f"{c}/{n}" for c in ("tests", "tests/navegador", "docs/especificaciones",
                                        "Reental-SPA", "Reental-SPA/js")
                  for n in os.listdir(os.path.join(RAIZ, c)) if re.search(r"(?i)dividendo", n)]
        self.assertEqual(viejos, [])

    def test_pdf_y_excel_ignorados(self):
        # Con cualquier nombre y en cualquier carpeta.
        rutas = ["Informe fiscal 2025.pdf", "Renta 2025.pdf", "Reental-SPA/Renta 2025.PDF",
                 "docs/x.pdf", "Reental contabilidad.xlsx"]
        vistos = [r for r in rutas if subprocess.run(["git", "check-ignore", "-q", r], cwd=RAIZ).returncode != 0]
        self.assertEqual(vistos, [], "PDF o Excel que Git no ignora")


if __name__ == "__main__":
    unittest.main()
