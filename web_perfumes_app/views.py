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
from .models import *
import time
import random
from botasaurus.browser import browser, Driver, Wait
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

# Create your views here.
def _parsear_clp(texto):
    dig = re.sub(r'[^\d]', '', texto or '')
    return int(dig) if dig else 0

@browser(
        headless=True, 
        reuse_driver=True,
        )
def obtener_acordes(driver: Driver, url):
    driver.get(url)
    time.sleep(random.uniform(4,9))
    
    try:
        driver.wait_for_element("div.accord-box", wait=Wait.LONG)
        bars = driver.select_all("div.accord-box > div.accord-bar")
        textos = [bar.text.strip() for bar in bars if bar.text.strip()]
        return list(dict.fromkeys(textos))
    except Exception:
        return []  # si falla, sigue con el siguiente

# En actualizar_acordes_todos(), cambia a:
def actualizar_acordes_todos():
    perfumes = Perfume.objects.filter(fragrantica_url__isnull=False).exclude(fragrantica_url="").order_by('id')
    print(f"[Acordes] Perfumes con URL: {perfumes.count()}")
    total = 0

    for perfume in perfumes:
        try:
            print(f"→ {perfume.nombre}")
            url_normalizada = convertir_a_fragrantica_es(perfume.fragrantica_url)
            if url_normalizada != perfume.fragrantica_url:
                perfume.fragrantica_url = url_normalizada
                perfume.save(update_fields=["fragrantica_url"])
            acordes = obtener_acordes(url_normalizada)
            time.sleep(random.uniform(7, 14))
            
            if not acordes:
                continue
            objs = [Acorde.objects.get_or_create(nombre=a)[0] for a in acordes]
            perfume.acordes.set(objs)
            perfume.save()
            total += 1
            print(f"   {len(acordes)} acordes")
        except Exception as e:
            print(f"   Error: {e}")

    print(f"¡Listo! {total} actualizados")
    return total


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
    perfumes_list = Perfume.objects.order_by("nombre")
    paginator = Paginator(perfumes_list, 24)
    page_number = request.GET.get("page")
    perfumes = paginator.get_page(page_number)
    total_perfumes = perfumes_list.count()
    return render(request, "menu.html", {"perfumes": perfumes, "total_perfumes": total_perfumes})

def estadisticas(request):
    return render(request, 'estadistica.html')
