# 1. Imagen
FROM python:3.12-slim

# 2. Configuracion basica
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV CHROME_BIN=/usr/bin/google-chrome

# 3. Dependencias del sistema (Chrome + Node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget gnupg ca-certificates \
    fonts-liberation \
    libnss3 libatk-bridge2.0-0 libatk1.0-0 \
    libx11-6 libxcomposite1 libxdamage1 libxrandr2 \
    libasound2 libgbm1 libgtk-3-0 libdrm2 libxshmfence1 \
    libxcb1 libxext6 libxfixes3 libxkbcommon0 \
    libpangocairo-1.0-0 libcups2 libatspi2.0-0 \
    nodejs npm \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor > /usr/share/keyrings/google-linux.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# 4. Carpeta de trabajo dentro del contenedor
WORKDIR /app

# 5. Dependencias Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 6. Dependencias frontend (Tailwind)
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# 7. Copiamos TODO tu proyecto
COPY . .

# 8. Build de CSS y static
RUN npx @tailwindcss/cli -i web_perfumes_app/assets/input.css -o web_perfumes_app/static/src/output.css
RUN python manage.py collectstatic --noinput

EXPOSE 8000

# 9. Ejecutar migraciones y levantar Gunicorn
CMD ["sh", "-c", "python manage.py migrate && gunicorn site_perfumes.wsgi:application --bind 0.0.0.0:${PORT:-8000} --timeout 180"]
