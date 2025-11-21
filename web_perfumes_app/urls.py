from django.urls import path
from . import views

# Clase para registrar las rutas (direcciones url).
# URLs relacionadas con la plataforma.
urlpatterns = [
    path('', views.home, name="home"),
    path('estadisticas/', views.estadisticas),
    path('perfumes/refresh/', views.refrescar_perfumes, name="refrescar_perfumes"),
    path('descargar-acordes/<int:perfume_id>/', views.descargar_acordes_individual, name='descargar_acordes_individual'),
]