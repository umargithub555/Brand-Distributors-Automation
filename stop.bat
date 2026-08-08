@echo off
setlocal
docker compose --env-file .env.docker down
pause
