from django.urls import path
from . import views

# Clase para registrar las rutas (direcciones url).
# URLs relacionadas con la plataforma.
urlpatterns = [
    path('', views.home, name="home"),
    path('estadisticas/', views.estadisticas, name="estadisticas"),
    path('perfumes/refresh/', views.refrescar_perfumes, name="refrescar_perfumes"),
    path('perfumes/refresh/status/', views.estado_refresco, name="estado_refresco"),
    path('descargar-acordes/<int:perfume_id>/', views.descargar_acordes_individual, name='descargar_acordes_individual'),
    path('analisis/', views.analizar, name='analizar'),
    path('comparar/', views.comparar_compras, name='comparar'),
    path('proyeccion/', views.proyeccion, name='proyeccion'),
    path('reportes/', views.reportes, name='reportes'),
]
