from django.db import models

# Create your models here.
# Un modelo es una representación de una tabla de base de datos.

# TABLA DE ACORDES PRINCIPALES DE LOS PERFUMES
class Acorde(models.Model):
    nombre = models.CharField(max_length=50, unique=True)
    background_rgb = models.CharField(max_length=20, null=True, blank=True)

    def __str__(self):
        return self.nombre

# TABLA DE NOTAS DE LOS PERFUMES
class Nota(models.Model):
    nombre = models.CharField(max_length=50, unique=True) #Con unique no existirán o crearán dos registros con el mismo nombre

    def __str__(self):
        return self.nombre

# TABLA DE ESTACIONES DEL AÑO DE PERFUMES
class Estacion(models.Model):
    nombre = models.CharField(max_length=50)
    porcentaje = models.FloatField(null=True, blank=True)

    def __str__(self):
        return self.nombre
    
# TABLA DE MARCA DE PERFUMES
class Marca(models.Model):
    marca = models.CharField(max_length=100, unique=True)

    def __str__(self):
        return self.nombre

# TABLA DE PERFUMES
class Perfume(models.Model):

    GENERO_CHOICES = [
        ('H', 'Hombre'),
        ('U', 'Unisex'),
    ]
    TIENDA_CHOICES = [
        ('SILK', 'Silk Perfumes'),
        ('YAURAS', 'Yauras Perfumes'),
        ('JOY', 'Joy Perfumes'),
    ]

    nombre = models.CharField(max_length=150, blank=True, null=False) #Blank permite que el campo esté vacio, se usa cuando son campos opcionales
    precio = models.IntegerField(null=False, blank=False)
    precio_ant = models.IntegerField(null=True, blank=True)
    imagen = models.ImageField(upload_to= 'perfumes/', null=True, blank=True)
    marca = models.ForeignKey('Marca', on_delete=models.SET_NULL, null=True, blank=True, related_name='perfumes') #Autor del perfume
    genero = models.CharField(max_length=1, choices=GENERO_CHOICES, default='H')
    tienda = models.CharField(max_length=20, choices=TIENDA_CHOICES, default='SILK')
    url_producto = models.URLField(blank=True, null=True)
    # --------------------------------------------------------------------------
    # Mis relaciones (Los ManyToMany siempre sus campos se escriben en plural, no en singular por buenas prácticas)
    acordes = models.ManyToManyField(Acorde, related_name='perfumes', blank=True)
    notas_salida = models.ManyToManyField(Nota, related_name='perfumes_salida', blank=True) #si no se le asigna valor al campo, por defecto es una lista vacía.
    notas_corazon = models.ManyToManyField(Nota, related_name='perfumes_corazon', blank=True)
    notas_base = models.ManyToManyField(Nota, related_name='perfumes_base', blank=True)
    estaciones = models.ManyToManyField(Estacion, related_name='perfumes', blank=True) #related_name sirve para hacer consultas inversas, para hacer consultas desde la tabla relacionada hacia la original
    fragrantica_url = models.URLField(blank=True, null=True)

    @property
    def descuento(self):
        if self.precio_ant and self.precio_ant > 0 and self.precio < self.precio_ant:
            return round(100 * (self.precio_ant - self.precio) / self.precio_ant)
        return 0

    def __str__(self):
        return self.nombre
