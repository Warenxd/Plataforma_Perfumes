import requests
import re
from django.shortcuts import render, redirect
from django.http import HttpResponse, JsonResponse
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.contrib import messages
from django.urls import reverse
from django.views.decorators.http import require_POST
from django.core.paginator import Paginator
from .models import *
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# Create your views here.
def _parsear_clp(texto):
    dig = re.sub(r'[^\d]', '', texto or '')
    return int(dig) if dig else 0

# FUNCIONES SCRAPPING
def scrapping_silk_perfumes():

    creados, actualizados, errores = 0, 0, 0
    page = 1

    while True:
        url = f"https://silkperfumes.cl/collections/perfumes-de-hombre?page={page}"
        print(f"Scrapeando pǭgina {page}: {url}")

        response = requests.get(url)
        if response.status_code != 200:
            break

        soup = BeautifulSoup(response.text, 'html.parser')
        name_perfume = soup.find_all('p', class_='card__title')

        # Si ya no hay perfumes ��' no hay mǭs pǭginas
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

            # MARCA
            marca = None
            if card:
                marca_el = card.find("p", class_="card__vendor")
                marca = marca_el.get_text(strip=True) if marca_el else "Desconocida"

            # PRECIO
            price_el = card.find("strong", class_="price__current") if card else None
            precio = _parsear_clp(price_el.get_text(strip=True)) if price_el else 0

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

                        # si empieza con // ��' agregar https:
                        if u.startswith("//"):
                            u = "https:" + u
                        # si empieza con / ��' hacerla absoluta
                        elif u.startswith("/"):
                            u = "https://silkperfumes.cl" + u

                        img_url = u
                        break

            # GUARDAR O ACTUALIZAR
            perfume, creado = Perfume.objects.get_or_create(
                nombre=nombre,
                defaults={
                    "marca": marca or "",
                    "precio": precio,
                    "tienda": "SILK",
                    "url_producto": url_prod
                }
            )

            if creado:
                creados += 1
            else:
                if perfume.precio != precio or perfume.marca != (marca or ""):
                    perfume.precio = precio
                    perfume.marca = marca or ""
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

        page += 1  # ir a la siguiente pǭgina

    return {"creados": creados, "actualizados": actualizados, "errores": errores}
    
def refrescar_perfumes(request):
    try:
        r = scrapping_silk_perfumes()
        messages.sucess(
            f"Scraping OK. Nuevos: {r['creados']}, Actualizados: {r['actualizados']}, Errores: {r['errores']}."
        )
    except Exception as e:
        messages.error(request, f"Ocurri�� un problema al scrapear los datos {e}")
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
