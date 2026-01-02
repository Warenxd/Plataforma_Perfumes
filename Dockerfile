# 1. Imagen
FROM python:3.12-slim

# 2. Configuración básica
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# 3. Carpeta de trabajo dentro del contenedor
WORKDIR /app

# 4. Copiamos requirements.txt
COPY requirements.txt .

# 5. Instalamos dependencias (AQUÍ Docker trabaja)
RUN pip install --no-cache-dir -r requirements.txt

# 6. Copiamos TODO tu proyecto
COPY . .

EXPOSE 8000

# 7. Qué se ejecuta cuando el contenedor arranca
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
