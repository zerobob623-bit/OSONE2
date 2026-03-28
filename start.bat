@echo off
chcp 65001 >nul
title OSONE2 - Iniciando...

echo.
echo   ██████╗ ███████╗ ██████╗ ███╗   ██╗███████╗
echo   ██╔═══██╗██╔════╝██╔═══██╗████╗  ██║██╔════╝
echo   ██║   ██║███████╗██║   ██║██╔██╗ ██║█████╗
echo   ██║   ██║╚════██║██║   ██║██║╚██╗██║██╔══╝
echo   ╚██████╔╝███████║╚██████╔╝██║ ╚████║███████╗
echo    ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝
echo.
echo  Iniciando OSONE localmente...
echo.

:: ── Verificar Node.js ─────────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Node.js nao encontrado.
    echo.
    echo Instale o Node.js em: https://nodejs.org
    echo Baixe a versao LTS e reinicie o terminal apos instalar.
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%a in ('node --version') do set NODE_MAJOR=%%a
node --version > temp_ver.txt
set /p NODE_VER=<temp_ver.txt
del temp_ver.txt
echo [OK] Node.js %NODE_VER%

:: ── Instalar dependências npm ─────────────────────────────────────────────────
if not exist "node_modules" (
    echo.
    echo Instalando dependencias npm (so na primeira vez)...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao instalar dependencias.
        pause
        exit /b 1
    )
)
echo [OK] Dependencias instaladas

:: ── Verificar/criar .env ──────────────────────────────────────────────────────
if not exist ".env" (
    echo.
    echo Arquivo .env nao encontrado. Criando...
    (
        echo # Chave da API Gemini - obtenha em https://aistudio.google.com/apikey
        echo GEMINI_API_KEY=
        echo.
        echo # Opcional - OpenAI para chat de texto
        echo VITE_OPENAI_API_KEY=
        echo.
        echo # Opcional - Groq
        echo VITE_GROQ_API_KEY=
    ) > .env
    echo.
    echo [AVISO] Arquivo .env criado. Edite-o com seu GEMINI_API_KEY.
    echo Voce pode configurar a chave tambem dentro do app nas Configuracoes.
    echo.
)

:: ── Abrir navegador após 3 segundos ──────────────────────────────────────────
echo.
echo [OK] Iniciando servidor em http://localhost:3000
echo      Abrindo navegador automaticamente...
echo      Para encerrar: feche esta janela ou pressione Ctrl+C
echo.

:: Inicia o navegador em background após 3s
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Inicia o servidor
call npm run dev
pause
