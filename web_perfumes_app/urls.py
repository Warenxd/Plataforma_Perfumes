from django.urls import path
from . import views

# Clase para registrar las rutas (direcciones url).
# URLs relacionadas con la plataforma.
urlpatterns = [
    path('', views.home),
    path('estadisticas/', views.estadisticas),
]