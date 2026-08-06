@echo off
setlocal
if not exist .env.docker (
  echo Missing .env.docker file.
  echo Copy .env.docker.example to .env.docker and fill in your secrets first.
  pause
  exit /b 1
)

docker compose --env-file .env.docker up -d --build
if errorlevel 1 (
  echo Failed to start the containers.
  pause
  exit /b 1
)

echo.
echo Brand Intelligence is starting.
echo Frontend: http://localhost:8080
if defined FRONTEND_PORT echo Frontend: http://localhost:%FRONTEND_PORT%
echo Backend API: http://localhost:8000
if defined BACKEND_PORT echo Backend API: http://localhost:%BACKEND_PORT%
pause
