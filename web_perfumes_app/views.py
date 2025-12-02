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
from .models import *
from django.shortcuts import render, redirect, get_object_or_404   # ← AÑADE get_object_or_404
from django.contrib import messages
import time
import random
import unicodedata
from botasaurus.browser import browser, Driver, Wait
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Create your views here.
def _parsear_clp(texto):
    dig = re.sub(r'[^\d]', '', texto or '')
    return int(dig) if dig else 0

def _normalizar_texto(valor):
    if not valor:
        return ""
    texto = unicodedata.normalize("NFKD", valor)
    texto = texto.encode("ascii", "ignore").decode("ascii")
    return texto.strip().lower()

ESTACIONES_VALIDAS = {"invierno", "primavera", "verano", "otono"}

@browser(
        headless=True, 
        reuse_driver=True,
        block_images=True,
        )
def obtener_acordes(driver: Driver, url):
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
    except Exception as e:
        print(f"[Notas] Error general obteniendo pirámide en {url}: {e}")
        import traceback
        traceback.print_exc()

    return {
        'acordes': acordes,
        'notas': notas,
        'estaciones': estaciones
    }

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

        if datos_guardados:
            messages.success(request, f"¡Acordes y notas cargados para {perfume.nombre}!")
        else:
            messages.info(request, f"No se encontraron acordes ni notas para {perfume.nombre}")

    except Exception as e:
        messages.error(request, f"Error al cargar acordes: {e}")
    
    return redirect('home')  # o a la página del perfume si tienes detalle


# FUNCIONES SCRAPPING
def scrapping_silk_perfumes():

    creados, actualizados, errores = 0, 0, 0
    page = 1

    while True:
        url = f"https://silkperfumes.cl/collections/perfumes-de-hombre?page={page}"
        print(f"Scrapeando página {page}: {url}")

        response = requests.get(url)
        if response.status_code != 200:
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        name_perfume = soup.find_all('p', class_='card__title')

        # Si ya no hay perfumes no hay más páginas
        if not name_perfume:
            break

        for n in name_perfume:
            nombre = n.get_text(strip=True)
            card = n.find_parent(class_="card")

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

            # MARCA (como objeto relacionado)
            marca_obj = None
            if card:
                marca_el = card.find("p", class_="card__vendor")
                marca_nombre = marca_el.get_text(strip=True) if marca_el else "Desconocida"
                from .models import Marca
                marca_obj, _ = Marca.objects.get_or_create(marca=marca_nombre)

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
                    url_prod = "https://silkperfumes.cl" + a["href"]

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

        page += 1  # ir a la siguiente página

    return {"creados": creados, "actualizados": actualizados, "errores": errores}

def buscar_google_lucky(nombre_perfume):
    texto_busqueda = f"{nombre_perfume} fragrantica"
    query = urllib.parse.quote_plus(texto_busqueda)

    url = (
        "https://www.google.com/search"
        "?hl=en"
        "&num=1"
        "&btnI=I%27m+Feeling+Lucky"
        f"&q={query}"
    )

    headers = {"User-Agent": "Mozilla/5.0"}

    print(f"[Fragrantica] Buscando en Google: '{nombre_perfume}'")
    print(f"[Fragrantica] URL de búsqueda: {url}")


    r = requests.get(url, headers=headers, allow_redirects=False)

    location = r.headers.get("Location")

    if not location:
        print(f"[Fragrantica] NO se recibió redirección para '{nombre_perfume}'")
        return None

    if "google.com/url?q=" in location:
        parsed = urllib.parse.urlparse(location)
        params = urllib.parse.parse_qs(parsed.query)

        if "q" in params:
            resultado = convertir_a_fragrantica_es(params["q"][0])  # la URL pura de Fragrantica
            print(f"[Fragrantica] Resultado para '{nombre_perfume}': {resultado}")
            return resultado

    return convertir_a_fragrantica_es(location)  # si ya es una URL directa


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

    print(f"[Fragrantica] Buscando y guardando solo fragrantica.es para {perfumes.count()} perfumes...")

    for perfume in perfumes:
        print(f"→ {perfume.nombre}", end="")

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

    print(f"¡TERMINADO! {encontrados} perfumes ahora tienen URL en fragrantica.es")
    return encontrados

def refrescar_perfumes(request):
    try:
        
        actualizar_urls_fragrantica()
        total = actualizar_acordes_todos()
        messages.success(request, f"Acordes actualizados para {total} perfumes.")
    except Exception as e:
        messages.error(request, f"Ocurrió un problema al actualizar los acordes: {e}")
    return redirect(reverse("home"))

# RENDER DE VISTAS
def home(request):
    search_query = (request.GET.get("q") or "").strip()
    perfumes_list = Perfume.objects.order_by("nombre").prefetch_related("estaciones")
    if search_query:
        perfumes_list = perfumes_list.filter(
            Q(nombre__icontains=search_query) | Q(marca__marca__icontains=search_query)
        )
    paginator = Paginator(perfumes_list, 15)
    page_number = request.GET.get("page")
    perfumes = paginator.get_page(page_number)

    for perfume in perfumes:
        estaciones_info = list(perfume.estaciones.values_list("nombre", "porcentaje"))
        print(f"[Home] {perfume.nombre}: {estaciones_info}")

    total_perfumes = perfumes_list.count()

    if request.headers.get("x-requested-with") == "XMLHttpRequest":
        grid_html = render_to_string(
            "components/perfumes_grid.html",
            {"perfumes": perfumes, "search_query": search_query},
            request=request,
        )
        return JsonResponse(
            {
                "html": grid_html,
                "page": perfumes.number,
                "total_pages": perfumes.paginator.num_pages,
                "query": search_query,
            }
        )

    return render(
        request,
        "menu.html",
        {"perfumes": perfumes, "total_perfumes": total_perfumes, "search_query": search_query},
    )

def estadisticas(request):
    return render(request, 'estadistica.html')
