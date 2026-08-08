@echo off
setlocal
docker compose -f docker-compose.hub.yml --env-file .env.docker down
pause
