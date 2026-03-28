# OSONE2 - Script de inicializacao local (Windows PowerShell)
# Uso: clique com botao direito → "Executar com PowerShell"
# Ou no terminal: powershell -ExecutionPolicy Bypass -File start.ps1

$Host.UI.RawUI.WindowTitle = "OSONE2"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host ""
Write-Host "  ██████╗ ███████╗ ██████╗ ███╗   ██╗███████╗" -ForegroundColor Cyan
Write-Host "  ██╔═══██╗██╔════╝██╔═══██╗████╗  ██║██╔════╝" -ForegroundColor Cyan
Write-Host "  ██║   ██║███████╗██║   ██║██╔██╗ ██║█████╗  " -ForegroundColor Cyan
Write-Host "  ██║   ██║╚════██║██║   ██║██║╚██╗██║██╔══╝  " -ForegroundColor Cyan
Write-Host "  ╚██████╔╝███████║╚██████╔╝██║ ╚████║███████╗" -ForegroundColor Cyan
Write-Host "   ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host " Iniciando OSONE localmente..." -ForegroundColor Cyan
Write-Host ""

# ── Verificar Node.js ─────────────────────────────────────────────────────────
$nodePath = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodePath) {
    Write-Host "[ERRO] Node.js nao encontrado." -ForegroundColor Red
    Write-Host ""
    Write-Host "Instale o Node.js em: https://nodejs.org (versao LTS)"
    Write-Host "Apos instalar, feche e reabra o terminal."
    Read-Host "Pressione Enter para sair"
    exit 1
}
$nodeVersion = node --version
Write-Host "[OK] Node.js $nodeVersion" -ForegroundColor Green

# ── Instalar dependências npm ─────────────────────────────────────────────────
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "Instalando dependencias npm (so na primeira vez)..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERRO] Falha ao instalar dependencias." -ForegroundColor Red
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}
Write-Host "[OK] Dependencias instaladas" -ForegroundColor Green

# ── Verificar .env ────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "Criando arquivo .env..." -ForegroundColor Yellow
    @"
# Chave da API Gemini - obtenha gratuitamente em https://aistudio.google.com/apikey
GEMINI_API_KEY=

# Opcional - OpenAI para chat de texto
VITE_OPENAI_API_KEY=

# Opcional - Groq
VITE_GROQ_API_KEY=
"@ | Set-Content ".env" -Encoding UTF8

    Write-Host "[AVISO] .env criado. Voce pode configurar a chave Gemini dentro do app (Configuracoes)." -ForegroundColor Yellow
}

# ── Verificar dependências para controle do PC (PowerShell nativo) ──────────
Write-Host ""
Write-Host "Controle do PC: usa PowerShell nativo — nenhuma instalacao extra necessaria." -ForegroundColor Green
Write-Host "[OK] Screenshot, teclado, mouse, clipboard: disponiveis" -ForegroundColor Green

# ── Iniciar servidor e abrir navegador ────────────────────────────────────────
Write-Host ""
Write-Host "[OK] Servidor iniciando em http://localhost:3000" -ForegroundColor Green
Write-Host "     Pressione Ctrl+C para encerrar." -ForegroundColor Gray
Write-Host ""

# Abre o navegador após 3 segundos em background
Start-Job -ScriptBlock {
    Start-Sleep 3
    Start-Process "http://localhost:3000"
} | Out-Null

# Inicia o servidor
npm run dev
