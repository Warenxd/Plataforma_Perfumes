from django.db import models
from django.db.utils import DataError
from django.utils import timezone

# Create your models here.
# Un modelo es una representación de una tabla de base de datos.

# TABLA DE ACORDES PRINCIPALES DE LOS PERFUMES
class Acorde(models.Model):
    nombre = models.CharField(max_length=250, unique=True)
    background_rgb = models.CharField(max_length=250, null=True, blank=True)

    def __str__(self):
        return self.nombre


# TABLA DE NOTAS DE LOS PERFUMES
class Nota(models.Model):
    nombre = models.CharField(max_length=250, unique=True) #Con unique no existirán o crearán dos registros con el mismo nombre

    def __str__(self):
        return self.nombre

# TABLA DE ESTACIONES DEL AÑO DE PERFUMES
class Estacion(models.Model):
    nombre = models.CharField(max_length=250)
    porcentaje = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.nombre
    
# TABLA DE MARCA DE PERFUMES
class Marca(models.Model):
    marca = models.CharField(max_length=250, unique=True)

    def __str__(self):
        return self.nombre
    
class Genero(models.Model):
    nombre = models.CharField(max_length=250, unique=True, blank=True, null=True)

    def __str__(self):
        return self.nombre

# TABLA DE PERFUMES
class Perfume(models.Model):
    TIENDA_CHOICES = [
        ('SILK', 'Silk Perfumes'),
        ('YAURAS', 'Yauras Perfumes'),
        ('JOY', 'Joy Perfumes'),
    ]

    nombre = models.TextField(blank=True, null=False) #Blank permite que el campo esté vacio, se usa cuando son campos opcionales
    precio = models.IntegerField(null=False, blank=False)
    precio_ant = models.IntegerField(null=True, blank=True)
    imagen = models.ImageField(upload_to= 'perfumes/', null=True, blank=True)
    marca = models.ForeignKey('Marca', on_delete=models.SET_NULL, null=True, blank=True, related_name='perfumes') #Autor del perfume
    generos = models.ManyToManyField(Genero, related_name="perfumes", blank=True, null=True)
    tienda = models.CharField(max_length=250, choices=TIENDA_CHOICES, default='SILK')
    tienda_personalizada = models.CharField(max_length=250, blank=True, null=True)
    es_custom = models.BooleanField(default=False)
    url_producto = models.URLField(blank=True, null=True)
    # --------------------------------------------------------------------------
    # Mis relaciones (Los ManyToMany siempre sus campos se escriben en plural, no en singular por buenas prácticas)
    acordes = models.ManyToManyField(Acorde, related_name='perfumes', blank=True)
    notas_salida = models.ManyToManyField(Nota, related_name='perfumes_salida', blank=True) #si no se le asigna valor al campo, por defecto es una lista vacía.
    notas_corazon = models.ManyToManyField(Nota, related_name='perfumes_corazon', blank=True)
    notas_base = models.ManyToManyField(Nota, related_name='perfumes_base', blank=True)
    notas_general = models.ManyToManyField(Nota, related_name='perfumes_general', blank=True, null=True)
    estaciones = models.ManyToManyField(Estacion, related_name='perfumes', blank=True) #related_name sirve para hacer consultas inversas, para hacer consultas desde la tabla relacionada hacia la original
    fragrantica_url = models.URLField(blank=True, null=True)

    def save(self, *args, **kwargs):
        try:
            return super().save(*args, **kwargs)
        except DataError as e:
            nombre = self.nombre or ""
            max_len = self._meta.get_field("nombre").max_length
            print(f"[Perfume Save] DataError: {e} | nombre_len={len(nombre)} | max_len={max_len} | nombre='{nombre[:200]}'")
            raise

    @property
    def descuento(self):
        if self.precio_ant and self.precio_ant > 0 and self.precio < self.precio_ant:
            return round(100 * (self.precio_ant - self.precio) / self.precio_ant)
        return 0

    def __str__(self):
        return self.nombre


class VentaRegistro(models.Model):
    TIPO_PERFUME = "PERFUME"
    TIPO_DECANT = "DECANT"
    TIPO_CHOICES = [
        (TIPO_PERFUME, "Perfume"),
        (TIPO_DECANT, "Decant"),
    ]

    nombre = models.CharField(max_length=250)
    tipo = models.CharField(max_length=250, choices=TIPO_CHOICES, default=TIPO_PERFUME)
    tienda = models.CharField(max_length=250, choices=Perfume.TIENDA_CHOICES)
    unidades = models.PositiveIntegerField(default=1)
    precio_unitario = models.PositiveIntegerField(help_text="Precio de venta del ítem.")
    fecha_venta = models.DateField(default=timezone.now)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-fecha_venta", "-creado_en"]

    @property
    def total(self):
        return (self.precio_unitario or 0) * (self.unidades or 0)

    def __str__(self):
        return f"{self.nombre} ({self.get_tipo_display()})"
