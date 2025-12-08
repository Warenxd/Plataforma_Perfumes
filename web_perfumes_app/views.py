import requests
import re
import urllib.parse
from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib import messages
from django.urls import reverse
from django.views.decorators.http import require_POST
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Q
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.text import slugify
from .models import *
from django.shortcuts import render, redirect, get_object_or_404   # ← AÑADE get_object_or_404
from django.contrib import messages
import time
import random
import unicodedata
import threading
import atexit
from botasaurus.browser import Driver, Wait
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Create your views here.
def _parsear_clp(texto):
    dig = re.sub(r'[^\d]', '', texto or '')
    if not dig:
        return 0
    valor = int(dig)
    # Evita valores fuera de rango (p.ej. parseos incorrectos)
    if valor > 2_000_000_000:
        print(f"[Precio] Valor sospechosamente alto, se descarta: {valor} (texto: {texto})")
        return 0
    return valor

def _normalizar_texto(valor):
    if not valor:
        return ""
    texto = unicodedata.normalize("NFKD", valor)
    texto = texto.encode("ascii", "ignore").decode("ascii")
    return texto.strip().lower()

MARCA_EQUIVALENCIAS = {
    "armani": "Giorgio Armani",
    "giorgio armani": "Giorgio Armani",
    "dolce & gabbana.": "Dolce & Gabbana",
    "dolce & gabbana": "Dolce & Gabbana",
    "halloween,jesus del pozo": "Jesus del Pozo",
    "halloween jesus del pozo": "Jesus del Pozo",
    "jesus del pozo": "Jesus del Pozo",
    "jesus delpozo": "Jesus del Pozo",
    "jesusdelpozo": "Jesus del Pozo",
    "jesusdel pozo": "Jesus del Pozo",
    "jesus pozo": "Jesus del Pozo",
    "jesus delpozzo": "Jesus del Pozo",
    "halloween": "Jesus del Pozo",
}

_marcas_cache = None

def _normalizar_marca_nombre(nombre):
    base = (nombre or "").strip()
    if not base:
        return "Desconocida"
    clave = _normalizar_texto(base)
    canonical = MARCA_EQUIVALENCIAS.get(clave)
    if canonical:
        return canonical
    return base

def _obtener_marca_normalizada(nombre):
    """
    Devuelve/crea la marca usando equivalencias conocidas y
    fusiona marcas duplicadas que coincidan en la equivalencia.
    """
    canon = _normalizar_marca_nombre(nombre)
    marca_obj, _ = Marca.objects.get_or_create(marca=canon)

    variantes = [k for k, v in MARCA_EQUIVALENCIAS.items() if v == canon]
    for variante in variantes:
        for dup in Marca.objects.filter(marca__iexact=variante).exclude(id=marca_obj.id):
            Perfume.objects.filter(marca=dup).update(marca=marca_obj)
            if not dup.perfumes.exists():
                dup.delete()

    global _marcas_cache
    _marcas_cache = None  # refrescar en siguiente consulta

    return marca_obj

def _refrescar_cache_marcas():
    global _marcas_cache
    _marcas_cache = []
    for m in Marca.objects.all():
        norm = _normalizar_texto(m.marca)
        _marcas_cache.append((norm, m))

def _inferir_marca_por_nombre(nombre):
    """
    Intenta deducir la marca a partir del nombre del perfume.
    Busca coincidencias con equivalencias y marcas existentes; si no, usa la primera palabra.
    """
    if not nombre:
        return None
    nombre_norm = _normalizar_texto(nombre)
    if not nombre_norm:
        return None

    for clave, canon in MARCA_EQUIVALENCIAS.items():
        if clave in nombre_norm:
            return _obtener_marca_normalizada(canon)

    if _marcas_cache is None:
        _refrescar_cache_marcas()

    best = None
    best_len = 0
    best_idx = None
    for norm, marca in _marcas_cache:
        if not norm:
            continue
        idx = nombre_norm.find(norm)
        if idx == -1:
            continue
        if len(norm) > best_len or (len(norm) == best_len and (best_idx is None or idx < best_idx)):
            best = marca
            best_len = len(norm)
            best_idx = idx

    if best:
        return best

    # Fallback: primera palabra como marca
    primera = (nombre.split() or [""])[0]
    if primera:
        return _obtener_marca_normalizada(primera)
    return None

ESTACIONES_VALIDAS = {"invierno", "primavera", "verano", "otono"}
ESTACION_MIN_PORCENTAJE = 60

REFRESH_STATUS = {
    "scraping": {"state": "idle", "updated_at": None},
    "urls": {"state": "idle", "updated_at": None},
}

_driver_lock = threading.Lock()
_shared_driver = None
_driver_instances_created = 0
_driver_use_lock = threading.Lock()
_driver_idle_timer = None


def _get_shared_driver():
    """
    Devuelve un único navegador compartido. Registra en consola si
    se reutiliza o si se tuvo que crear uno nuevo.
    """
    global _shared_driver, _driver_instances_created
    with _driver_lock:
        driver_cerrado = False
        if _shared_driver:
            try:
                driver_cerrado = _shared_driver.is_closed()
            except Exception:
                driver_cerrado = False

        if _shared_driver is None or driver_cerrado:
            _shared_driver = Driver(headless=True, block_images=True)
            _driver_instances_created += 1
            if _driver_instances_created == 1:
                print("[Botasaurus] Se creó la instancia de navegador compartido #1.")
            else:
                print(f"[Botasaurus] Se creó una NUEVA instancia de navegador #{_driver_instances_created} (la previa no estaba disponible).")
        else:
            print(f"[Botasaurus] Reutilizando navegador compartido existente (instancia #{_driver_instances_created}).")

        return _shared_driver

def _close_shared_driver():
    """Cierra el navegador compartido al terminar el proceso."""
    global _shared_driver
    with _driver_lock:
        if _shared_driver:
            try:
                print("[Botasaurus] Cerrando navegador compartido al finalizar el proceso.")
                _shared_driver.close()
            except Exception as e:
                print(f"[Botasaurus] Error al cerrar navegador compartido: {e}")
            finally:
                _shared_driver = None

atexit.register(_close_shared_driver)


def _schedule_driver_close(delay_seconds=30):
    """
    Programa el cierre del navegador tras un periodo de inactividad.
    Si delay_seconds es 0, solo cancela un cierre previo.
    """
    global _driver_idle_timer
    with _driver_lock:
        if _driver_idle_timer:
            _driver_idle_timer.cancel()
            _driver_idle_timer = None

        if delay_seconds and delay_seconds > 0:
            def _close_if_idle():
                _close_shared_driver()

            _driver_idle_timer = threading.Timer(delay_seconds, _close_if_idle)
            _driver_idle_timer.daemon = True
            _driver_idle_timer.start()

def _set_refresh_status(stage, **kwargs):
    stage = stage or "scraping"
    data = REFRESH_STATUS.setdefault(stage, {})
    data.update(kwargs)
    data["updated_at"] = timezone.now().isoformat()
    REFRESH_STATUS[stage] = data


def _reset_refresh_status(stage):
    REFRESH_STATUS[stage] = {"state": "idle", "updated_at": timezone.now().isoformat()}

def _normalizar_nombre_perfume_base(nombre, marca=None):
    """
    Normaliza el nombre para detectar variantes del mismo perfume
    (quita ml/oz, concentraciones, tester/set y género).
    """
    texto = _normalizar_texto(nombre)
    if not texto:
        return ""

    marca_norm = _normalizar_texto(marca) if marca else ""
    if marca_norm:
        # Elimina la marca si viene al inicio o repetida
        if texto.startswith(marca_norm + " "):
            texto = texto[len(marca_norm):].strip()
        texto = re.sub(rf"\b{re.escape(marca_norm)}\b", " ", texto, flags=re.IGNORECASE)

    patrones = [
        r"\b\d+[.,]?\d*\s*(ml|ounce|oz|onzas)\b",
        r"\btester\b",
        r"\b(set|gift\s*set)\b",
        r"\b(edp|edt|edc|parfum|eau\s+de\s+parfum|eau\s+de\s+toilette|eau\s+de\s+cologne|intense|extreme)\b",
        r"\b(homme|hombre|mujer|femme|unisex)\b",
    ]
    for patron in patrones:
        texto = re.sub(patron, " ", texto, flags=re.IGNORECASE)

    texto = re.sub(r"\s+", " ", texto).strip()
    return texto

def _extraer_concentracion(nombre):
    """
    Devuelve una etiqueta canónica de concentración si está presente (edt/edp/edc/parfum/intense/extreme).
    """
    txt = _normalizar_texto(nombre)
    if not txt:
        return None
    patrones = [
        (r"\bedt\b|\beau\s+de\s+toilette\b", "edt"),
        (r"\bedp\b|\beau\s+de\s+parfum\b", "edp"),
        (r"\bedc\b|\beau\s+de\s+cologne\b", "edc"),
        (r"\bparfum\b|\bextrait\b|\bparfum\s+intense\b", "parfum"),
        (r"\babsolu\b|\babsolut\b|\babsolue\b", "absolu"),
        (r"\binfinite\b", "infinite"),
        (r"\bintense\b", "intense"),
        (r"\bextreme\b", "extreme"),
    ]
    for patron, etiqueta in patrones:
        if re.search(patron, txt, flags=re.IGNORECASE):
            return etiqueta
    return None

def _compartir_detalles_perfume(perfume):
    """
    Copia acordes, notas y estaciones a perfumes equivalentes
    (mismo nombre base y misma marca) que no tengan datos.
    """
    if not perfume or not perfume.nombre:
        return []

    clave = _normalizar_nombre_perfume_base(perfume.nombre, perfume.marca.marca if perfume.marca else None)
    if not clave:
        return []

    qs = Perfume.objects.exclude(id=perfume.id)
    if perfume.marca_id:
        qs = qs.filter(marca_id=perfume.marca_id)

    conc_base = _extraer_concentracion(perfume.nombre)
    similares = []
    for p in qs:
        clave_otro = _normalizar_nombre_perfume_base(p.nombre, p.marca.marca if p.marca else None)
        if clave_otro != clave:
            continue
        conc_otro = _extraer_concentracion(p.nombre)
        # No compartir si las concentraciones difieren (ej. EDT vs Parfum)
        if conc_base != conc_otro and (conc_base or conc_otro):
            continue
        similares.append(p)

    if not similares:
        return []

    acordes_src = list(perfume.acordes.all()) if perfume.acordes.exists() else []
    notas_salida_src = list(perfume.notas_salida.all()) if perfume.notas_salida.exists() else []
    notas_corazon_src = list(perfume.notas_corazon.all()) if perfume.notas_corazon.exists() else []
    notas_base_src = list(perfume.notas_base.all()) if perfume.notas_base.exists() else []
    estaciones_src = list(perfume.estaciones.all()) if perfume.estaciones.exists() else []

    propagados = []
    for otro in similares:
        cambios = False
        if acordes_src and not otro.acordes.exists():
            otro.acordes.set(acordes_src)
            cambios = True
        if notas_salida_src and not otro.notas_salida.exists():
            otro.notas_salida.set(notas_salida_src)
            cambios = True
        if notas_corazon_src and not otro.notas_corazon.exists():
            otro.notas_corazon.set(notas_corazon_src)
            cambios = True
        if notas_base_src and not otro.notas_base.exists():
            otro.notas_base.set(notas_base_src)
            cambios = True
        if estaciones_src and not otro.estaciones.exists():
            otro.estaciones.set(estaciones_src)
            cambios = True
        if cambios:
            print(f"[Compartir] Datos copiados de '{perfume.nombre}' a '{otro.nombre}'")
            propagados.append(otro)

    return propagados

def obtener_acordes(url):
    driver = _get_shared_driver()
    # Cancela cierre programado si se va a reutilizar el driver
    _schedule_driver_close(delay_seconds=0)
    print("[Botasaurus] Solicitando uso del navegador compartido...")
    acquired = _driver_use_lock.acquire(timeout=120)
    if not acquired:
        print("[Botasaurus] No se pudo obtener el lock del navegador en 120s.")
        return None
    print("[Botasaurus] Navegador bloqueado para esta descarga.")
    try:
        driver.get(url)
        time.sleep(random.uniform(1,2))
        
        # === ACORDES ===
        acordes = []
        try:
            driver.wait_for_element("div.accord-box", wait=Wait.SHORT)
            bars = driver.select_all("div.accord-bar")
            for bar in bars:
                texto = bar.text.strip()
                if not texto:
                    continue
                style = bar.get_attribute("style") or ""
                bg_match = re.search(r'background:\s*rgb\(([^\)]+)\)', style)
                text_match = re.search(r'color:\s*rgb\(([^\)]+)\)', style)
                bg_color = tuple(map(int, bg_match.group(1).split(','))) if bg_match else None
                text_color = tuple(map(int, text_match.group(1).split(','))) if text_match else None

                acordes.append({
                    'acorde': texto,
                    'background_rgb': bg_color,
                    'text_rgb': text_color
                })
        except:
            acordes = []

        # === ESTACIONES ===
        estaciones = []
        try:
            driver.wait_for_element("span.vote-button-legend", wait=Wait.SHORT)
            spans = driver.select_all("span.vote-button-legend") or []
            vistos = set()
            for span in spans:
                nombre = (span.text or "").strip()
                if not nombre:
                    continue
                clave = _normalizar_texto(nombre)
                if clave not in ESTACIONES_VALIDAS or clave in vistos:
                    continue
                vistos.add(clave)

                contenedor = span.parent
                if contenedor:
                    contenedor = contenedor.parent

                porcentaje = None
                if contenedor:
                    barra = contenedor.select("div.voting-small-chart-size div div")
                    if barra:
                        style = barra.get_attribute("style") or ""
                        match = re.search(r'width:\s*([\d.,]+)%', style, re.IGNORECASE)
                        if match:
                            valor = match.group(1).replace(',', '.')
                            try:
                                porcentaje = float(valor)
                            except ValueError:
                                porcentaje = None

                estaciones.append({
                    'nombre': nombre,
                    'porcentaje': porcentaje
                })
                print(f"[Estaciones] {nombre}: {porcentaje}")
        except Exception as e:
            print(f"[Estaciones] Error obteniendo estaciones en {url}: {e}")

        # === NOTAS PIRÁMIDE (solo texto) ===
        notas = {'salida': [], 'corazon': [], 'base': []}
        try:
            secciones = {
                "Notas de Salida": "salida",
                "Corazón": "corazon",
                "Base": "base"
            }

            for titulo, clave in secciones.items():
                print(f"[Notas] Buscando sección '{titulo}' en {url}")
                encabezado = None
                for candidato in driver.select_all("h4"):
                    texto_candidato = (candidato.text or "").strip().lower()
                    if not texto_candidato:
                        continue
                    if titulo.lower() in texto_candidato:
                        encabezado = candidato
                        break

                if not encabezado:
                    print(f"[Notas] No se encontró encabezado '{titulo}'")
                    continue

                print(f"[Notas] Encabezado '{titulo}' encontrado")

                contenedor = None
                parent = encabezado.parent
                if parent:
                    hijos = parent.children
                    indice_encabezado = None
                    for i, hijo in enumerate(hijos):
                        if getattr(hijo, "_elem", None) and getattr(encabezado, "_elem", None) and hijo._elem.node_id == encabezado._elem.node_id:
                            indice_encabezado = i
                            break

                    if indice_encabezado is not None:
                        for hermano in hijos[indice_encabezado + 1:]:
                            if hermano.tag_name != "div":
                                continue
                            contenedor = hermano
                            break

                if not contenedor:
                    print(f"[Notas] No se encontró contenedor principal para '{titulo}'. Probando búsqueda global.")
                    candidatos = driver.select_all("div[style*='flex'][style*='wrap']")
                    if candidatos:
                        contenedor = candidatos[0]

                if not contenedor:
                    print(f"[Notas] No se encontró contenedor para '{titulo}'")
                    continue

                tarjetas = contenedor.select_all("div[style*='flex-direction: column']")
                if not tarjetas:
                    tarjetas = contenedor.select_all("div")

                print(f"[Notas] Se encontraron {len(tarjetas)} tarjetas potenciales para '{titulo}'")

                for tarjeta in tarjetas:
                    try:
                        texto_div = tarjeta.select("div:nth-of-type(2)")
                        if texto_div:
                            txt = texto_div.text.strip()
                        else:
                            txt = tarjeta.text.strip()
                    except Exception as e:
                        print(f"[Notas] Error obteniendo texto de tarjeta: {e}")
                        continue

                    txt = re.sub(r'\s+', ' ', txt)
                    if txt:
                        notas[clave].append(txt)
                        print(f"[Notas] Añadida nota '{txt}' a la sección '{clave}'")
                    else:
                        print(f"[Notas] Tarjeta vacía ignorada en sección '{clave}'")
            # Fallback: notas sin pirámide (lista plana)
            total_notas = len(notas["salida"]) + len(notas["corazon"]) + len(notas["base"])
            if total_notas == 0:
                try:
                    print(f"[Notas] Intentando fallback notas planas en {url}")
                    contenedores = driver.select_all("div.notes-box") or []
                    vistos = set()
                    notas_planas = []
                    for box in contenedores:
                        parent = box.parent
                        if not parent:
                            continue
                        # Busca items en el contenedor siguiente (flex wrap)
                        items = parent.select_all("div[style*='flex'][style*='wrap'] div a") or []
                        if not items:
                            items = parent.select_all("div[style*='flex'][style*='wrap'] div") or []
                        for item in items:
                            texto = (item.text or "").strip()
                            texto = re.sub(r'\s+', ' ', texto)
                            if not texto:
                                continue
                            clave_txt = texto.lower()
                            if clave_txt in vistos:
                                continue
                            vistos.add(clave_txt)
                            notas_planas.append(texto)
                    if notas_planas:
                        notas["base"].extend(notas_planas)
                        print(f"[Notas] Fallback plano: {len(notas_planas)} notas agregadas")
                except Exception as e:
                    print(f"[Notas] Error en fallback plano en {url}: {e}")
        except Exception as e:
            print(f"[Notas] Error general obteniendo pirámide en {url}: {e}")
            import traceback
            traceback.print_exc()

        return {
            'acordes': acordes,
            'notas': notas,
            'estaciones': estaciones
        }
    finally:
        _driver_use_lock.release()
        print("[Botasaurus] Navegador liberado para otras descargas.")
        # Programa cierre si no hay más usos en breve
        _schedule_driver_close(delay_seconds=30)

def _guardar_estaciones_perfume(perfume, estaciones_data):
    estaciones_data = estaciones_data or []
    limpias = []
    vistos = set()

    for item in estaciones_data:
        nombre = (item.get('nombre') or '').strip()
        if not nombre:
            continue
        clave = _normalizar_texto(nombre)
        if clave in vistos:
            continue
        vistos.add(clave)
        porcentaje = item.get('porcentaje')
        limpias.append((clave, nombre, porcentaje))

    existentes = {_normalizar_texto(est.nombre): est for est in perfume.estaciones.all()}
    nuevos = []

    for clave, nombre, porcentaje in limpias:
        estacion = existentes.pop(clave, None)
        if estacion:
            if estacion.porcentaje != porcentaje:
                estacion.porcentaje = porcentaje
                estacion.save(update_fields=["porcentaje"])
        else:
            estacion = Estacion.objects.create(nombre=nombre, porcentaje=porcentaje)
        nuevos.append(estacion)

    perfume.estaciones.set(nuevos)

    for estacion_sobrante in existentes.values():
        if not estacion_sobrante.perfumes.exists():
            estacion_sobrante.delete()

    return bool(nuevos)

# En actualizar_acordes_todos(), cambia a:
def actualizar_acordes_todos():
    perfumes = Perfume.objects.filter(fragrantica_url__isnull=False).exclude(fragrantica_url="").order_by('id')
    print(f"[Acordes + Notas] Perfumes con URL: {perfumes.count()}")
    total = 0

    for perfume in perfumes:
        try:
            print(f"→ {perfume.nombre}")
            url_normalizada = convertir_a_fragrantica_es(perfume.fragrantica_url)
            if url_normalizada != perfume.fragrantica_url:
                perfume.fragrantica_url = url_normalizada
                perfume.save(update_fields=["fragrantica_url"])

            # Una sola llamada: trae acordes, notas y estaciones
            data = obtener_acordes(url_normalizada) or {}
            acordes_data = data.get('acordes', [])
            notas = data.get('notas', {})
            estaciones_data = data.get('estaciones', [])

            time.sleep(random.uniform(1.5, 3.5))

            # === GUARDAR ACORDES ===
            if acordes_data:
                acorde_objs = []
                for item in acordes_data:
                    acorde_obj, _ = Acorde.objects.get_or_create(nombre=item['acorde'])

                    if item['background_rgb']:
                        r, g, b = item['background_rgb']
                        nuevo_color = f"{r},{g},{b}"
                        if acorde_obj.background_rgb != nuevo_color:
                            acorde_obj.background_rgb = nuevo_color
                            acorde_obj.save(update_fields=["background_rgb"])

                    acorde_objs.append(acorde_obj)

                perfume.acordes.set(acorde_objs)

            # === GUARDAR NOTAS (salida, corazón, base) ===
            for seccion, nombres in notas.items():
                if not nombres:
                    continue

                nota_objs = []
                for nombre in nombres:
                    nota_obj, _ = Nota.objects.get_or_create(nombre=nombre.strip())
                    nota_objs.append(nota_obj)

                if seccion == "salida":
                    perfume.notas_salida.set(nota_objs)
                elif seccion == "corazon":
                    perfume.notas_corazon.set(nota_objs)
                elif seccion == "base":
                    perfume.notas_base.set(nota_objs)

            # === GUARDAR ESTACIONES ===
            _guardar_estaciones_perfume(perfume, estaciones_data)

            perfume.save()
            total += 1
            print(f"   ✓ {len(acordes_data)} acordes | "
                  f"Salida: {len(notas['salida'])} | "
                  f"Corazón: {len(notas['corazon'])} | "
                  f"Base: {len(notas['base'])} | "
                  f"Estaciones: {len(estaciones_data)}")
            _compartir_detalles_perfume(perfume)

        except Exception as e:
            print(f"   Error con {perfume.nombre}: {e}")

    print(f"¡Terminado! {total} perfumes actualizados con acordes y notas olfativas.")
    return total

@require_POST
def descargar_acordes_individual(request, perfume_id):
    perfume = get_object_or_404(Perfume, id=perfume_id)
    
    if not perfume.fragrantica_url:
        messages.error(request, f"No hay URL de Fragrantica para {perfume.nombre}")
        return redirect('home')
    
    try:
        data = obtener_acordes(perfume.fragrantica_url)
        acordes_data = (data or {}).get('acordes', [])
        notas_data = (data or {}).get('notas', {})
        estaciones_data = (data or {}).get('estaciones', [])

        datos_guardados = False

        if acordes_data:
            acorde_objs = []
            for item in acordes_data:
                acorde, _ = Acorde.objects.get_or_create(nombre=item['acorde'])

                bg_tuple = item.get('background_rgb')
                if bg_tuple:
                    r, g, b = bg_tuple
                    new_color = f"{r},{g},{b}"
                    if acorde.background_rgb != new_color:
                        acorde.background_rgb = new_color
                        acorde.save(update_fields=["background_rgb"])

                acorde_objs.append(acorde)

            if acorde_objs:
                perfume.acordes.add(*acorde_objs)
                datos_guardados = True

        secciones_notas = {
            "salida": perfume.notas_salida,
            "corazon": perfume.notas_corazon,
            "base": perfume.notas_base,
        }

        for seccion, manager in secciones_notas.items():
            nombres = (notas_data or {}).get(seccion, [])
            if not nombres:
                continue

            nota_objs = []
            for nombre in nombres:
                nota, _ = Nota.objects.get_or_create(nombre=nombre.strip())
                nota_objs.append(nota)

            if nota_objs:
                manager.add(*nota_objs)
                datos_guardados = True

        estaciones_guardadas = _guardar_estaciones_perfume(perfume, estaciones_data)
        datos_guardados = datos_guardados or estaciones_guardadas

        propagados = _compartir_detalles_perfume(perfume)

        if datos_guardados:
            success_msg = f"¡Acordes y notas cargados para {perfume.nombre}!"
            messages.success(request, success_msg)
        else:
            success_msg = f"No se encontraron acordes ni notas para {perfume.nombre}"
            messages.info(request, success_msg)

        # Refrescar instancia para devolver HTML actualizado
        perfume.refresh_from_db()

        if request.headers.get("x-requested-with") == "XMLHttpRequest" or "application/json" in (request.headers.get("accept") or ""):
            card_html = render_to_string("components/perfume_card.html", {"p": perfume}, request=request)
            updated_cards = []
            for otro in propagados:
                try:
                    otro.refresh_from_db()
                    card = render_to_string("components/perfume_card.html", {"p": otro}, request=request)
                    updated_cards.append({"id": otro.id, "html": card})
                except Exception as e:
                    print(f"[Compartir] No se pudo renderizar tarjeta para {otro.nombre}: {e}")
            return JsonResponse({
                "ok": True,
                "message": success_msg,
                "nombre": perfume.nombre,
                "html": card_html,
                "id": perfume.id,
                "updated_cards": updated_cards,
            })

    except Exception as e:
        error_msg = f"Error al cargar acordes: {e}"
        messages.error(request, error_msg)
        if request.headers.get("x-requested-with") == "XMLHttpRequest" or "application/json" in (request.headers.get("accept") or ""):
            return JsonResponse({"ok": False, "message": error_msg, "nombre": perfume.nombre}, status=400)
        return redirect('home')

    return redirect('home')  # o a la página del perfume si tienes detalle


# FUNCIONES SCRAPPING
def scrapping_silk_perfumes():

    categorias = [
        ("perfumes-de-hombre", "https://silkperfumes.cl/collections/perfumes-de-hombre?page={page}"),
        ("perfumes-arabes-hombre", "https://silkperfumes.cl/collections/perfumes-arabes-hombre?page={page}"),
        ("perfumes-unisex", "https://silkperfumes.cl/collections/perfumes-unisex?page={page}"),
        ("perfumes-arabes-unisex", "https://silkperfumes.cl/collections/perfumes-arabes-unisex?page={page}"),
    ]
    categoria_labels = {
        "perfumes-de-hombre": "Perfumes de hombre",
        "perfumes-arabes-hombre": "Perfumes árabes hombre",
        "perfumes-unisex": "Perfumes unisex",
        "perfumes-arabes-unisex": "Perfumes árabes unisex",
    }
    generos_por_categoria = {
        "perfumes-de-hombre": {"Hombre"},
        "perfumes-arabes-hombre": {"Hombre"},
        "perfumes-unisex": {"Unisex"},
        "perfumes-arabes-unisex": {"Unisex"},
    }
    genero_cache = {}

    def obtener_genero(nombre_genero):
        clave = (nombre_genero or "").strip().lower()
        if not clave:
            return None
        if clave not in genero_cache:
            normalizado = nombre_genero.strip().title()
            genero_cache[clave], _ = Genero.objects.get_or_create(nombre=normalizado)
        return genero_cache[clave]

    creados, actualizados, errores = 0, 0, 0
    _set_refresh_status(
        "scraping",
        state="running",
        category=None,
        category_label=None,
        page=0,
        url=None,
    )

    for nombre_categoria, url_template in categorias:
        categoria_es_unisex = "unisex" in url_template.lower()
        page = 1

        while True:
            url = url_template.format(page=page)
            _set_refresh_status(
                "scraping",
                state="running",
                category=nombre_categoria,
                category_label=categoria_labels.get(
                    nombre_categoria,
                    nombre_categoria.replace("-", " " ).title(),
                ),
                page=page,
                url=url,
            )
            print(f"Scrapeando {nombre_categoria} página {page}: {url}")

            response = requests.get(url)
            if response.status_code != 200:
                break

            soup = BeautifulSoup(response.text, 'html.parser')
            name_perfume = soup.find_all('p', class_='card__title')

            # Si ya no hay perfumes no hay más páginas
            if not name_perfume:
                break

            page_con_stock = False
            for n in name_perfume:
                nombre = n.get_text(strip=True)
                card = n.find_parent(class_="card")
                generos_a_asignar = set(generos_por_categoria.get(nombre_categoria, set()))
                if "hombre" in url.lower() or "hombre" in nombre_categoria.lower():
                    generos_a_asignar.add("Hombre")
                if categoria_es_unisex or "unisex" in url.lower() or "unisex" in nombre_categoria.lower():
                    generos_a_asignar.add("Unisex")

                # ELIMINAR PERFUMES AGOTADOS DE LA BD (Y SU IMAGEN)
                if card:
                    agotado_span = card.find("span", class_="product-label--sold-out")
                    if agotado_span and "agotado" in agotado_span.get_text(strip=True).lower():
                        perfumes_agotados = Perfume.objects.filter(nombre=nombre, tienda="SILK")
                        for perfume_agotado in perfumes_agotados:
                            if perfume_agotado.imagen and default_storage.exists(perfume_agotado.imagen.name):
                                default_storage.delete(perfume_agotado.imagen.name)
                            perfume_agotado.delete()
                        continue
                    else:
                        page_con_stock = True
                else:
                    page_con_stock = True

                # MARCA (como objeto relacionado)
                marca_obj = None
                if card:
                    marca_el = card.find("p", class_="card__vendor")
                    marca_nombre = marca_el.get_text(strip=True) if marca_el else "Desconocida"
                    marca_obj = _obtener_marca_normalizada(marca_nombre)

                # PRECIO
                price_el = card.find("strong", class_="price__current") if card else None
                precio = _parsear_clp(price_el.get_text(strip=True)) if price_el else 0

                # PRECIO ANTERIOR (Si es que hay oferta o algo)
                price_bef = card.find("s", class_="price__was") if card else None
                if price_bef:
                    precio_ant = _parsear_clp(price_bef.get_text(strip=True))
                else:
                    precio_ant = precio

                # URL PRODUCTO
                url_prod = None
                if card:
                    a = card.find("a", class_="js-prod-link")
                    if a and a.get("href"):
                        href = a["href"]
                        if href.startswith("http"):
                            url_prod = href
                        else:
                            url_prod = "https://silkperfumes.cl" + href
                        if "unisex" in href.lower():
                            generos_a_asignar.add("Unisex")

                # IMAGEN
                img_url = None
                if card:
                    img = card.find("img")
                    if img:
                        candidates = [
                            img.get("data-src"),
                            img.get("data-srcset", "").split(",")[0].split()[0] if img.get("data-srcset") else None,
                            img.get("src"),
                        ]

                        for u in candidates:
                            if not u:
                                continue
                            u = u.strip()

                            # ignorar svg falso
                            if u.startswith("data:"):
                                continue

                            # si empieza con //' agregar https:
                            if u.startswith("//"):
                                u = "https:" + u
                            # si empieza con / ' hacerla absoluta
                            elif u.startswith("/"):
                                u = "https://silkperfumes.cl" + u

                            img_url = u
                            break

                # GUARDAR O ACTUALIZAR
                perfume, creado = Perfume.objects.get_or_create(
                    nombre=nombre,
                    tienda="SILK",
                    defaults={
                        "marca": marca_obj,
                        "precio": precio,
                        "precio_ant": precio_ant,
                        "tienda": "SILK",
                        "url_producto": url_prod
                    }
                )

                if creado:
                    creados += 1
                else:
                    if (
                        perfume.precio != precio
                        or perfume.marca != marca_obj
                        or perfume.precio_ant != precio_ant
                    ):
                        perfume.precio = precio
                        perfume.marca = marca_obj
                        perfume.precio_ant = precio_ant
                        perfume.save()
                        actualizados += 1

                # GUARDAR IMAGEN
                if img_url and (not perfume.imagen or not default_storage.exists(perfume.imagen.name)):
                    try:
                        img_bytes = requests.get(img_url, timeout=10).content
                        perfume.imagen.save(f"{nombre}.jpg", ContentFile(img_bytes), save=False)
                    except:
                        errores += 1

                if url_prod and not perfume.url_producto:
                    perfume.url_producto = url_prod

                perfume.save()

                if generos_a_asignar:
                    genero_objs = [
                        obtener_genero(nombre_genero)
                        for nombre_genero in generos_a_asignar
                    ]
                    genero_objs = [genero for genero in genero_objs if genero]
                    if genero_objs:
                        perfume.generos.add(*genero_objs)

            if not page_con_stock:
                # Página completa agotada; pasar a siguiente categoría
                break
            page += 1

    _set_refresh_status(
        "scraping",
        state="done",
        category=None,
        category_label=None,
        page=0,
        url=None,
    )
    return {"creados": creados, "actualizados": actualizados, "errores": errores}

def scrapping_yauras_perfumes():
    base_url = "https://yauras.cl"
    categorias = [
        ("perfumes-hombre", f"{base_url}/collections/perfumes-hombre?page={{page}}&grid_list=grid-view", {"Hombre"}),
        ("unisex", f"{base_url}/collections/unisex?page={{page}}&grid_list=grid-view", {"Unisex"}),
        ("perfumes-arabes", f"{base_url}/collections/perfumes-arabes?page={{page}}&grid_list=grid-view", {"Hombre"}),
    ]
    categoria_labels = {
        "perfumes-hombre": "Perfumes hombre",
        "unisex": "Perfumes unisex",
        "perfumes-arabes": "Perfumes árabes",
    }
    genero_cache = {}

    def obtener_genero(nombre_genero):
        clave = (nombre_genero or "").strip().lower()
        if not clave:
            return None
        if clave not in genero_cache:
            normalizado = nombre_genero.strip().title()
            genero_cache[clave], _ = Genero.objects.get_or_create(nombre=normalizado)
        return genero_cache[clave]

    creados, actualizados, errores = 0, 0, 0
    _set_refresh_status(
        "scraping",
        state="running",
        category=None,
        category_label=None,
        page=0,
        url=None,
    )

    for nombre_categoria, url_template, generos_categoria in categorias:
        page = 1
        while True:
            url = url_template.format(page=page)
            _set_refresh_status(
                "scraping",
                state="running",
                category=nombre_categoria,
                category_label=categoria_labels.get(
                    nombre_categoria, nombre_categoria.replace("-", " ").title()
                ),
                page=page,
                url=url,
            )

            try:
                response = requests.get(url, timeout=12)
            except Exception:
                errores += 1
                break

            if response.status_code != 200:
                break

            soup = BeautifulSoup(response.text, "html.parser")
            cards = soup.select("div.productitem__container")

            # Fin de páginas
            if not cards:
                break

            page_con_stock = False
            for card in cards:
                link_el = card.select_one("h2.productitem--title a") or card.select_one(
                    "a.productitem--image-link"
                )
                if not link_el:
                    continue

                nombre = link_el.get_text(strip=True)
                if not nombre:
                    continue

                generos_a_asignar = set(generos_categoria)
                if "hombre" in url.lower() or "hombre" in nombre_categoria.lower():
                    generos_a_asignar.add("Hombre")
                if "unisex" in url.lower() or "unisex" in nombre_categoria.lower() or "unisex" in nombre.lower():
                    generos_a_asignar.add("Unisex")

                soldout_badge = card.select_one(".productitem__badge--soldout")
                stock_el = card.select_one(".product-stock-level__badge-text")
                atc_button = card.select_one(".productitem--action-atc")
                agotado = False
                if soldout_badge and "agot" in soldout_badge.get_text(strip=True).lower():
                    agotado = True
                elif stock_el and "agot" in stock_el.get_text(strip=True).lower():
                    agotado = True
                elif atc_button and "agot" in (atc_button.text or "").strip().lower():
                    agotado = True

                if agotado:
                    perfumes_agotados = Perfume.objects.filter(nombre=nombre, tienda="YAURAS")
                    for perfume_agotado in perfumes_agotados:
                        if perfume_agotado.imagen and default_storage.exists(perfume_agotado.imagen.name):
                            default_storage.delete(perfume_agotado.imagen.name)
                        perfume_agotado.delete()
                    continue
                else:
                    page_con_stock = True

                marca_el = card.select_one(".productitem--vendor a")
                marca_nombre = marca_el.get_text(strip=True) if marca_el else "Desconocida"
                marca_obj = _obtener_marca_normalizada(marca_nombre)

                price_el = card.select_one(".price__current .money") or card.select_one(
                    ".price__current--min"
                )
                precio = _parsear_clp(price_el.get_text(strip=True)) if price_el else 0

                compare_el = (
                    card.select_one(".price__compare-at .money")
                    or card.select_one(".price__compare-at--single")
                    or card.select_one("[data-price-compare]")
                )
                precio_ant = _parsear_clp(compare_el.get_text(strip=True)) if compare_el else precio

                href = link_el.get("href")
                url_prod = urllib.parse.urljoin(base_url, href) if href else None

                img_url = None
                # Preferimos la imagen principal si está disponible
                imagenes = []
                primary_img = card.select_one("img.productitem--image-primary")
                if primary_img:
                    imagenes.append(primary_img)
                imagenes.extend([img for img in card.select("img") if img is not primary_img])

                for img in imagenes:
                    raw_candidates = [
                        img.get("data-src"),
                        img.get("data-rimg"),
                        img.get("data-srcset"),
                        img.get("data-rimg-template"),
                        img.get("src"),
                    ]

                    def _normalizar_imagen(raw):
                        if not raw:
                            return None
                        raw = raw.strip()
                        if raw.lower() == "noscript":
                            return None
                        if not raw or raw.startswith("data:"):
                            return None
                        if "," in raw and " " in raw:
                            partes = raw.split(",")
                            for parte in partes:
                                url_posible = (parte or "").strip().split()[0]
                                url_limpia = _normalizar_imagen(url_posible)
                                if url_limpia:
                                    return url_limpia
                            return None
                        if "{size}" in raw:
                            raw = raw.replace("{size}", "800x800")
                        if raw.startswith("//"):
                            raw = "https:" + raw
                        elif raw.startswith("/"):
                            raw = urllib.parse.urljoin(base_url, raw)
                        return raw

                    for candidato in raw_candidates:
                        url_limpia = _normalizar_imagen(candidato)
                        if url_limpia:
                            img_url = url_limpia
                            break
                    if img_url:
                        break

                if not img_url:
                    print(f"[Yauras IMG] No se encontró imagen para '{nombre}' (cat {nombre_categoria}, url {url})")

                perfume, creado = Perfume.objects.get_or_create(
                    nombre=nombre,
                    tienda="YAURAS",
                    defaults={
                        "marca": marca_obj,
                        "precio": precio,
                        "precio_ant": precio_ant,
                        "tienda": "YAURAS",
                        "url_producto": url_prod,
                    },
                )

                if creado:
                    creados += 1
                else:
                    cambios = False
                    if perfume.precio != precio:
                        perfume.precio = precio
                        cambios = True
                    if perfume.precio_ant != precio_ant:
                        perfume.precio_ant = precio_ant
                        cambios = True
                    if perfume.marca != marca_obj:
                        perfume.marca = marca_obj
                        cambios = True
                    if url_prod and perfume.url_producto != url_prod:
                        perfume.url_producto = url_prod
                        cambios = True
                    if perfume.tienda != "YAURAS":
                        perfume.tienda = "YAURAS"
                        cambios = True
                    if cambios:
                        perfume.save()
                        actualizados += 1

                if img_url and (not perfume.imagen or not default_storage.exists(perfume.imagen.name)):
                    try:
                        print(f"[Yauras IMG] Descargando imagen de '{nombre}': {img_url}")
                        img_bytes = requests.get(img_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}).content
                        perfume.imagen.save(f"{nombre}.jpg", ContentFile(img_bytes), save=False)
                    except Exception as e:
                        print(f"[Yauras IMG] Error al descargar imagen de '{nombre}' ({img_url}): {e}")
                        errores += 1

                if url_prod and not perfume.url_producto:
                    perfume.url_producto = url_prod

                perfume.save()

                if generos_a_asignar:
                    genero_objs = [obtener_genero(nombre_genero) for nombre_genero in generos_a_asignar]
                    genero_objs = [genero for genero in genero_objs if genero]
                    if genero_objs:
                        perfume.generos.add(*genero_objs)

            if not page_con_stock:
                # Página completa agotada; pasar a siguiente categoría
                break
            page += 1

    _set_refresh_status(
        "scraping",
        state="done",
        category=None,
        category_label=None,
        page=0,
        url=None,
    )
    return {"creados": creados, "actualizados": actualizados, "errores": errores}

def scrapping_joy_perfumes():
    base_url = "https://joyperfumes.cl"
    url_template = f"{base_url}/all?gad_campaignid=23318127065&page={{page}}"

    creados, actualizados, errores = 0, 0, 0
    _set_refresh_status(
        "scraping",
        state="running",
        category="joy",
        category_label="Joy Perfumes",
        page=0,
        url=None,
    )

    page = 1
    while True:
        url = url_template.format(page=page)
        _set_refresh_status(
            "scraping",
            state="running",
            category="joy",
            category_label="Joy Perfumes",
            page=page,
            url=url,
        )
        try:
            response = requests.get(url, timeout=12)
        except Exception:
            errores += 1
            break

        if response.status_code != 200:
            break

        soup = BeautifulSoup(response.text, "html.parser")
        cards = soup.select("article.product-block")
        if not cards:
            break

        for card in cards:
            status_label = card.select_one(".product-block__label--status")
            if status_label and "no disponible" in status_label.get_text(strip=True).lower():
                continue

            title_el = card.select_one(".product-block__name")
            if not title_el:
                continue
            nombre = title_el.get_text(strip=True)
            if not nombre:
                continue

            generos_a_asignar = set()
            lower_name = nombre.lower()
            if "hombre" in lower_name:
                generos_a_asignar.add("Hombre")
            if "mujer" in lower_name:
                generos_a_asignar.add("Mujer")
            if "unisex" in lower_name:
                generos_a_asignar.add("Unisex")

            href = title_el.get("href")
            url_prod = urllib.parse.urljoin(base_url, href) if href else None

            marca_el = card.select_one(".product-block__brand")
            marca_nombre_raw = marca_el.get_text(strip=True) if marca_el else ""
            marca_obj = None
            if marca_nombre_raw and _normalizar_texto(marca_nombre_raw) not in {"joyperfumes"}:
                marca_obj = _obtener_marca_normalizada(marca_nombre_raw)
            if not marca_obj:
                marca_obj = _inferir_marca_por_nombre(nombre) or _obtener_marca_normalizada(marca_nombre_raw or "Desconocida")

            price_el = card.select_one(".product-block__price")
            precio = _parsear_clp(price_el.get_text(strip=True)) if price_el else 0
            precio_ant = precio

            img_url = None
            img_el = card.select_one("img.product-block__image")
            sources = card.select("picture source")
            candidates = []
            if sources:
                for src_el in sources:
                    val = src_el.get("srcset")
                    if val:
                        val = val.split(",")[0].split()[0]
                        candidates.append(val)
            if img_el and img_el.get("src"):
                candidates.insert(0, img_el.get("src"))

            for u in candidates:
                if not u:
                    continue
                u = u.strip()
                if u.startswith("//"):
                    u = "https:" + u
                elif u.startswith("/"):
                    u = urllib.parse.urljoin(base_url, u)
                img_url = u
                break

            perfume, creado = Perfume.objects.get_or_create(
                nombre=nombre,
                tienda="JOY",
                defaults={
                    "marca": marca_obj,
                    "precio": precio,
                    "precio_ant": precio_ant,
                    "tienda": "JOY",
                    "url_producto": url_prod,
                },
            )

            if creado:
                creados += 1
            else:
                cambios = False
                if perfume.precio != precio:
                    perfume.precio = precio
                    cambios = True
                if perfume.precio_ant != precio_ant:
                    perfume.precio_ant = precio_ant
                    cambios = True
                if perfume.marca != marca_obj:
                    perfume.marca = marca_obj
                    cambios = True
                if url_prod and perfume.url_producto != url_prod:
                    perfume.url_producto = url_prod
                    cambios = True
                if perfume.tienda != "JOY":
                    perfume.tienda = "JOY"
                    cambios = True
                if cambios:
                    perfume.save()
                    actualizados += 1

            if img_url and (not perfume.imagen or not default_storage.exists(perfume.imagen.name)):
                try:
                    img_bytes = requests.get(img_url, timeout=10, headers={"User-Agent": "Mozilla/5.0"}).content
                    perfume.imagen.save(f"{nombre}.jpg", ContentFile(img_bytes), save=False)
                except Exception:
                    errores += 1

            if url_prod and not perfume.url_producto:
                perfume.url_producto = url_prod

            perfume.save()

            if generos_a_asignar:
                genero_objs = [Genero.objects.get_or_create(nombre=gen.strip().title())[0] for gen in generos_a_asignar]
                genero_objs = [g for g in genero_objs if g]
                if genero_objs:
                    perfume.generos.add(*genero_objs)

        page += 1

    _set_refresh_status(
        "scraping",
        state="done",
        category=None,
        category_label=None,
        page=0,
        url=None,
    )
    return {"creados": creados, "actualizados": actualizados, "errores": errores}

def scrapping_tiendas_perfumes():
    resultados_silk = scrapping_silk_perfumes()
    resultados_yauras = scrapping_yauras_perfumes()
    resultados_joy = scrapping_joy_perfumes()
    return {
        "creados": resultados_silk.get("creados", 0) + resultados_yauras.get("creados", 0) + resultados_joy.get("creados", 0),
        "actualizados": resultados_silk.get("actualizados", 0) + resultados_yauras.get("actualizados", 0) + resultados_joy.get("actualizados", 0),
        "errores": resultados_silk.get("errores", 0) + resultados_yauras.get("errores", 0) + resultados_joy.get("errores", 0),
        "detalle": {"silk": resultados_silk, "yauras": resultados_yauras, "joy": resultados_joy},
    }

def buscar_google_lucky(nombre_perfume):
    headers = {"User-Agent": "Mozilla/5.0", "Accept-Language": "es-ES,es;q=0.9,en;q=0.8"}

    def _extraer_fragrantica_de_html(html):
        if not html:
            return None
        soup = BeautifulSoup(html, "html.parser")
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "fragrantica" in href.lower():
                return convertir_a_fragrantica_es(href)
        return None

    def _buscar(query_texto, with_site=False):
        query = urllib.parse.quote_plus(query_texto)
        url = (
            "https://www.google.com/search"
            "?hl=en"
            "&num=1"
            "&btnI=I%27m+Feeling+Lucky"
            f"&q={query}"
        )

        if with_site:
            url = (
                "https://www.google.com/search"
                "?hl=en"
                "&num=1"
                f"&q={query}+site%3Afragrantica.es"
            )

        print(f"[Fragrantica] Buscando en Google: '{query_texto}'{' (site:fragrantica.es)' if with_site else ''}")
        print(f"[Fragrantica] URL de búsqueda: {url}")

        r = requests.get(url, headers=headers, allow_redirects=False)
        location = r.headers.get("Location")

        if location:
            if "google.com/url?q=" in location:
                parsed = urllib.parse.urlparse(location)
                params = urllib.parse.parse_qs(parsed.query)

                if "q" in params:
                    resultado = convertir_a_fragrantica_es(params["q"][0])
                    print(f"[Fragrantica] Resultado para '{query_texto}': {resultado}")
                    return resultado

            return convertir_a_fragrantica_es(location)

        # Fallback: Google muestra página de aviso (200) con enlace a fragrantica
        try:
            r_follow = requests.get(url, headers=headers, allow_redirects=True, timeout=10)
            if r_follow.history and "fragrantica" in r_follow.url.lower():
                resultado = convertir_a_fragrantica_es(r_follow.url)
                print(f"[Fragrantica] Resultado (follow) para '{query_texto}': {resultado}")
                return resultado
            if r_follow.text:
                resultado_html = _extraer_fragrantica_de_html(r_follow.text)
                if resultado_html:
                    print(f"[Fragrantica] Resultado (html) para '{query_texto}': {resultado_html}")
                    return resultado_html
        except Exception as e:
            print(f"[Fragrantica] Error en fallback para '{query_texto}': {e}")

        return None

    # Intento 1: texto completo
    resultado = _buscar(f"{nombre_perfume} fragrantica")
    if resultado:
        return resultado

    # Intento 2: nombre base (sin ml, concentración, género) + marca
    nombre_base = _normalizar_nombre_perfume_base(nombre_perfume)
    if nombre_base and nombre_base.lower() != (nombre_perfume or "").strip().lower():
        resultado = _buscar(f"{nombre_base} fragrantica")
        if resultado:
            return resultado

    # Intento 3: con site:fragrantica.es
    resultado = _buscar(f"{nombre_perfume}", with_site=True)
    if resultado:
        return resultado

    if nombre_base:
        resultado = _buscar(f"{nombre_base}", with_site=True)
        if resultado:
            return resultado

    print(f"[Fragrantica] NO se recibió redirección para '{nombre_perfume}'")
    return None


def convertir_a_fragrantica_es(url):
    """Normaliza cualquier URL de Fragrantica para usar el dominio fragrantica.es."""
    if not url:
        return url

    url = url.strip()
    if not url or "fragrantica" not in url.lower():
        return url

    parsed = urllib.parse.urlparse(url)
    if not parsed.netloc:
        parsed = urllib.parse.urlparse(f"https://{url.lstrip('/')}")

    netloc = parsed.netloc.lower()
    if "fragrantica" not in netloc:
        return url

    normalizado = parsed._replace(scheme="https", netloc="www.fragrantica.es")
    return urllib.parse.urlunparse(normalizado)


def normalizar_urls_fragrantica_existentes():
    """
    Convierte todas las URLs almacenadas en la base de datos al dominio fragrantica.es.
    Devuelve la cantidad de registros actualizados.
    """
    perfumes = Perfume.objects.filter(fragrantica_url__icontains="fragrantica")
    actualizados = 0

    for perfume in perfumes:
        url_normalizada = convertir_a_fragrantica_es(perfume.fragrantica_url)
        if url_normalizada and url_normalizada != perfume.fragrantica_url:
            perfume.fragrantica_url = url_normalizada
            perfume.save(update_fields=["fragrantica_url"])
            actualizados += 1

    if actualizados:
        print(f"[Fragrantica] {actualizados} URLs normalizadas a .es en la base de datos")
    return actualizados


@transaction.atomic
def actualizar_urls_fragrantica():
    normalizar_urls_fragrantica_existentes()
    perfumes = Perfume.objects.filter(Q(fragrantica_url__isnull=True) | Q(fragrantica_url="")).order_by("id")
    encontrados = 0
    total = perfumes.count()
    _set_refresh_status(
        "urls",
        state="running",
        total=total,
        current=0,
        perfume=None,
    )


    print(f"[Fragrantica] Buscando y guardando solo fragrantica.es para {total} perfumes...")

    for indice, perfume in enumerate(perfumes, start=1):
        print(f"→ {perfume.nombre}", end="")
        _set_refresh_status(
            "urls",
            state="running",
            total=total,
            current=indice,
            perfume=perfume.nombre,
        )

        url_raw = buscar_google_lucky(perfume.nombre)

        if url_raw and "fragrantica." in url_raw:
            # Forzamos fragrantica.es (aunque Google devuelva .com o .fr o lo que sea)
            url_es = convertir_a_fragrantica_es(url_raw)

            perfume.fragrantica_url = url_es
            perfume.save(update_fields=["fragrantica_url"])
            encontrados += 1
            print(f" → {url_es}")
        else:
            print(" → No encontrado")

    _set_refresh_status(
        "urls",
        state="done",
        total=total,
        current=total,
        perfume=None,
    )
    print(f"¡TERMINADO! {encontrados} perfumes ahora tienen URL en fragrantica.es")
    return encontrados

def refrescar_perfumes(request):
    es_ajax = request.headers.get("x-requested-with") == "XMLHttpRequest"
    etapa = (request.POST.get("stage") or "").strip().lower()
    if es_ajax:
        try:
            if etapa == "scraping":
                scrapping_resultados = scrapping_tiendas_perfumes()
                return JsonResponse(
                    {
                        "ok": True,
                        "stage": "scraping",
                        "creados": scrapping_resultados.get("creados", 0),
                        "actualizados": scrapping_resultados.get("actualizados", 0),
                        "errores": scrapping_resultados.get("errores", 0),
                    }
                )
            elif etapa == "urls":
                urls_actualizadas = actualizar_urls_fragrantica()
                return JsonResponse(
                    {
                        "ok": True,
                        "stage": "urls",
                        "urls_actualizadas": urls_actualizadas,
                    }
                )
            else:
                return JsonResponse({"ok": False, "error": "Etapa desconocida"}, status=400)
        except Exception as e:
            if etapa:
                _set_refresh_status(etapa, state="error", error=str(e))
            return JsonResponse({"ok": False, "error": str(e)}, status=500)

    try:
        scrapping_resultados = scrapping_tiendas_perfumes()
        urls_actualizadas = actualizar_urls_fragrantica()
        mensajes_extra = (
            f" | Scraping (Silk/Yauras/Joy) - Creados: {scrapping_resultados['creados']}, "
            f"Actualizados: {scrapping_resultados['actualizados']}, "
            f"Errores: {scrapping_resultados['errores']} | URLs Fragrantica actualizadas: {urls_actualizadas}"
        )
        messages.success(request, f"Scraping completado y URLs actualizadas.{mensajes_extra}")
    except Exception as e:
        _set_refresh_status("scraping", state="error", error=str(e))
        _set_refresh_status("urls", state="error", error=str(e))
        messages.error(request, f"Ocurrió un problema al refrescar los perfumes: {e}")
    return redirect(reverse("home"))


def estado_refresco(request):
    etapa = (request.GET.get("stage") or "").strip().lower()
    if etapa:
        data = REFRESH_STATUS.get(etapa, {})
    else:
        data = REFRESH_STATUS
    return JsonResponse({"ok": True, "status": data})


def comparar(request):
    """
    Renderiza la página de comparación; los perfumes se cargan desde localStorage en el front.
    """
    return render(request, "comparar.html")

# RENDER DE VISTAS
def home(request):
    search_query = (request.GET.get("q") or "").strip()
    marca_ids_raw = request.GET.getlist("marca")
    marca_ids = []
    for valor in marca_ids_raw:
        try:
            marca_ids.append(int(valor))
        except (TypeError, ValueError):
            continue

    genero_ids_raw = request.GET.getlist("genero")
    genero_ids = []
    for valor in genero_ids_raw:
        try:
            genero_ids.append(int(valor))
        except (TypeError, ValueError):
            continue

    tienda_codes_raw = request.GET.getlist("tienda")
    tienda_codes = [code.strip().upper() for code in tienda_codes_raw if code.strip()]

    estacion_slugs_raw = request.GET.getlist("estacion")
    selected_estacion_slugs = []
    for valor in estacion_slugs_raw:
        slug = slugify(valor or "")
        if slug:
            selected_estacion_slugs.append(slug)

    estaciones_qs = (
        Estacion.objects.filter(perfumes__isnull=False, porcentaje__gte=ESTACION_MIN_PORCENTAJE)
        .order_by("nombre")
        .distinct()
    )
    estaciones_slug_map = {}
    for estacion in estaciones_qs:
        slug = slugify(estacion.nombre or "")
        if not slug:
            continue
        data = estaciones_slug_map.setdefault(
            slug,
            {"slug": slug, "label": estacion.nombre, "ids": set()},
        )
        data["ids"].add(estacion.id)
        if not data["label"]:
            data["label"] = estacion.nombre

    selected_estacion_slugs = [slug for slug in selected_estacion_slugs if slug in estaciones_slug_map]

    perfumes_list = (
        Perfume.objects.order_by("nombre")
        .prefetch_related("estaciones", "generos")
        .select_related("marca")
    )
    if search_query:
        perfumes_list = perfumes_list.filter(
            Q(nombre__icontains=search_query) | Q(marca__marca__icontains=search_query)
        )
    if tienda_codes:
        perfumes_list = perfumes_list.filter(tienda__in=tienda_codes)
    if marca_ids:
        perfumes_list = perfumes_list.filter(marca_id__in=marca_ids)
    if genero_ids:
        perfumes_list = perfumes_list.filter(generos__id__in=genero_ids)
    for slug in selected_estacion_slugs:
        estacion_ids = estaciones_slug_map.get(slug, {}).get("ids")
        if not estacion_ids:
            continue
        perfumes_list = perfumes_list.filter(
            estaciones__in=estacion_ids,
            estaciones__porcentaje__gte=ESTACION_MIN_PORCENTAJE,
        )
    if selected_estacion_slugs:
        perfumes_list = perfumes_list.distinct()
    paginator = Paginator(perfumes_list, 15)
    page_number = request.GET.get("page")
    perfumes = paginator.get_page(page_number)

    for perfume in perfumes:
        estaciones_info = list(perfume.estaciones.values_list("nombre", "porcentaje"))
        print(f"[Home] {perfume.nombre}: {estaciones_info}")

    total_perfumes = perfumes_list.count()
    marcas = Marca.objects.filter(perfumes__isnull=False).order_by("marca").distinct()
    generos = Genero.objects.filter(perfumes__isnull=False).order_by("nombre").distinct()
    tienda_labels = dict(Perfume.TIENDA_CHOICES)
    tiendas = [
        {"code": code, "label": tienda_labels.get(code, code)}
        for code in Perfume.objects.order_by("tienda").values_list("tienda", flat=True).distinct()
        if code
    ]
    estaciones_filtro = [
        {"slug": data["slug"], "label": data["label"]}
        for data in estaciones_slug_map.values()
    ]
    selected_marca_ids = [str(pk) for pk in marca_ids]
    selected_genero_ids = [str(pk) for pk in genero_ids]
    selected_tienda_codes = [code for code in tienda_codes]

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        grid_html = render_to_string(
            "components/perfumes_grid.html",
            {
                "perfumes": perfumes,
                "search_query": search_query,
                "selected_marca_ids": selected_marca_ids,
                "selected_estacion_slugs": selected_estacion_slugs,
                "selected_genero_ids": selected_genero_ids,
                "selected_tienda_codes": selected_tienda_codes,
                "estacion_min_porcentaje": ESTACION_MIN_PORCENTAJE,
            },
            request=request,
        )
        return JsonResponse(
            {
                "html": grid_html,
                "page": perfumes.number,
                "total_pages": perfumes.paginator.num_pages,
                "query": search_query,
                "total_perfumes": total_perfumes,
            }
        )

    return render(
        request,
        "menu.html",
        {
            "perfumes": perfumes,
            "total_perfumes": total_perfumes,
            "search_query": search_query,
            "marcas": marcas,
            "generos": generos,
            "tiendas": tiendas,
            "selected_marca_ids": selected_marca_ids,
            "selected_genero_ids": selected_genero_ids,
            "selected_tienda_codes": selected_tienda_codes,
            "estaciones_filtro": estaciones_filtro,
            "selected_estacion_slugs": selected_estacion_slugs,
            "estacion_min_porcentaje": ESTACION_MIN_PORCENTAJE,
        },
    )

def estadisticas(request):
    return render(request, 'estadistica.html')
