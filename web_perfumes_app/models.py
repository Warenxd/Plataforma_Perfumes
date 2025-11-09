from django.db import models

# Create your models here.
# Un modelo es una representación de una tabla de base de datos.

# TABLA DE ACORDES PRINCIPALES DE LOS PERFUMES
class Acorde(models.Model):
    nombre = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.nombre

# TABLA DE NOTAS DE LOS PERFUMES
class Nota(models.Model):
    nombre = models.CharField(max_length=50, unique=True) #Con unique no existirán o crearán dos registros con el mismo nombre

    def __str__(self):
        return self.nombre

# TABLA DE ESTACIONES DEL AÑO DE PERFUMES
class Estacion(models.Model):
    nombre = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.nombre

# TABLA DE PERFUMES
class Perfume(models.Model):
    nombre = models.CharField(max_length=50, blank=True, null=False) #Blank permite que el campo esté vacio, se usa cuando son campos opcionales
    precio = models.IntegerField(null=False, blank=False)
    # --------------------------------------------------------------------------
    # Mis relaciones (Los ManyToMany siempre sus campos se escriben en plural, no en singular por buenas prácticas)
    acordes = models.ManyToManyField(Acorde, related_name='perfumes', blank=True)
    notas_salida = models.ManyToManyField(Nota, related_name='perfumes_salida', blank=True) #si no se le asigna valor al campo, por defecto es una lista vacía.
    notas_corazon = models.ManyToManyField(Nota, related_name='perfumes_corazon', blank=True)
    notas_base = models.ManyToManyField(Nota, related_name='perfumes_base', blank=True)
    estaciones = models.ManyToManyField(Estacion, related_name='perfumes', blank=True) #related_name sirve para hacer consultas inversas, para hacer consultas desde la tabla relacionada hacia la original

    def __str__(self):
        return self.nombre