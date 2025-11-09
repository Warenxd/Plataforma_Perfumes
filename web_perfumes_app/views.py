from django.shortcuts import render
from django.http import HttpResponse, JsonResponse
from .models import *
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# Create your views here.

# RENDER DE VISTAS
def home(request):
    return render(request, 'menu.html')

def estadisticas(request):
    return render(request, 'estadistica.html')
