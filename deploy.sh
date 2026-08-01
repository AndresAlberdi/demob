#!/bin/bash
set -e

# Set mode from first argument, default to production if not specified
MODE=${1:-production}

if [ "$MODE" = "production" ]; then
  ENV_FILE=".env.production"
  ENV_NAME="Producción"
elif [ "$MODE" = "staging" ] || [ "$MODE" = "pruebas" ]; then
  ENV_FILE=".env.staging"
  ENV_NAME="Pruebas/Staging"
  MODE="staging"
else
  echo "Error: Modo '$MODE' no válido. Usa 'production' o 'staging'."
  exit 1
fi

echo "=== MODO DE DESPLIEGUE: $ENV_NAME ==="

PROJECT_ID=""
if [ -f "$ENV_FILE" ]; then
  PROJECT_ID=$(grep -E "^VITE_FIREBASE_PROJECT_ID=" "$ENV_FILE" | cut -d'=' -f2 | tr -d '"' | tr -d "'" | tr -d '\r')
else
  echo "Error: Archivo $ENV_FILE no encontrado."
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "Error: VITE_FIREBASE_PROJECT_ID no está definido en $ENV_FILE"
  exit 1
fi

echo "=== PROYECTO TARGET: $PROJECT_ID ==="

echo "=== [1/4] Ejecutando pruebas unitarias locales ==="
npm run test

echo "=== [2/4] Ejecutando análisis de vulnerabilidades con Snyk ==="
if npx snyk test; then
  echo "✔ Análisis de Snyk completado sin vulnerabilidades críticas."
else
  echo "⚠ Advertencia: Snyk detectó vulnerabilidades."
fi

echo "=== [3/4] Compilando y publicando en Firebase ($PROJECT_ID) ==="
npm run build -- --mode $MODE
npx -y firebase-tools@latest deploy --project "$PROJECT_ID" --only firestore:rules,hosting

echo "=== [4/4] Confirmando y subiendo cambios a GitHub ==="
git add .
if git diff-index --quiet HEAD --; then
  echo "No hay cambios pendientes por commitear."
else
  git commit -m "chore: despliegue ($ENV_NAME) ($PROJECT_ID) y actualizaciones"
fi

echo "Intentando realizar push a GitHub..."
if git push origin main; then
  echo "✔ Cambios publicados con éxito en GitHub."
else
  echo "⚠ No se pudo hacer push a GitHub."
fi

echo "=== ¡Despliegue finalizado con éxito en $PROJECT_ID! ==="
