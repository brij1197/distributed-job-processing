FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc libpq-dev libffi-dev libjpeg-dev zlib1g-dev \
    libreoffice ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && update-ca-certificates

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000