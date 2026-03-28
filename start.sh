#!/usr/bin/env bash
# ─── OSONE2 — Inicialização Local ──────────────────────────────────────────────
# Uso: ./start.sh
# Instala dependências automaticamente na primeira execução.

set -e
cd "$(dirname "$0")"

BOLD="\033[1m"
CYAN="\033[0;36m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
RED="\033[0;31m"
RESET="\033[0m"

echo -e "${CYAN}${BOLD}"
echo "  ██████╗ ███████╗ ██████╗ ███╗   ██╗███████╗"
echo "  ██╔═══██╗██╔════╝██╔═══██╗████╗  ██║██╔════╝"
echo "  ██║   ██║███████╗██║   ██║██╔██╗ ██║█████╗"
echo "  ██║   ██║╚════██║██║   ██║██║╚██╗██║██╔══╝"
echo "  ╚██████╔╝███████║╚██████╔╝██║ ╚████║███████╗"
echo "   ╚═════╝ ╚══════╝ ╚═════╝ ╚═╝  ╚═══╝╚══════╝"
echo -e "${RESET}"
echo -e "${CYAN}Iniciando OSONE localmente...${RESET}\n"

# ── Verificar Node.js ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}✗ Node.js não encontrado.${RESET}"
  echo -e "Instale em: https://nodejs.org  (versão 18+)"
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 18 ]; then
  echo -e "${YELLOW}⚠ Node.js v${NODE_VER} detectado. Recomendado: v18+${RESET}"
fi
echo -e "${GREEN}✓ Node.js $(node --version)${RESET}"

# ── Instalar dependências npm ─────────────────────────────────────────────────
if [ ! -d "node_modules" ] || [ "package.json" -nt "node_modules/.package-lock.json" ]; then
  echo -e "\n${CYAN}Instalando dependências npm...${RESET}"
  npm install
fi
echo -e "${GREEN}✓ Dependências instaladas${RESET}"

# ── Verificar dependências do sistema (PC control) ────────────────────────────
echo -e "\n${CYAN}Verificando dependências para controle do PC...${RESET}"
MISSING=()
for tool in xdotool xclip scrot wmctrl; do
  if command -v "$tool" &>/dev/null; then
    echo -e "  ${GREEN}✓ ${tool}${RESET}"
  else
    echo -e "  ${YELLOW}✗ ${tool} (não encontrado)${RESET}"
    MISSING+=("$tool")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo -e "\n${YELLOW}Para habilitar controle do PC, instale as dependências faltantes:${RESET}"
  echo -e "  ${BOLD}sudo apt install ${MISSING[*]}${RESET}"
  echo -e "${YELLOW}O app funciona normalmente sem elas — o controle do PC ficará indisponível.${RESET}\n"
fi

# ── Verificar/criar .env ──────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo -e "${YELLOW}Arquivo .env não encontrado. Criando .env a partir do exemplo...${RESET}"
  if [ -f ".env.example" ]; then
    cp .env.example .env
  else
    cat > .env << 'ENVEOF'
# Chave da API Gemini (obrigatória para voz)
GEMINI_API_KEY=

# Chave OpenAI (opcional — para chat de texto)
VITE_OPENAI_API_KEY=

# Groq API (opcional)
VITE_GROQ_API_KEY=
ENVEOF
  fi
  echo -e "${YELLOW}Edite o arquivo .env e adicione sua GEMINI_API_KEY antes de continuar.${RESET}"
  echo -e "  ${BOLD}nano .env${RESET}"
fi

# ── Checar se GEMINI_API_KEY está configurada ─────────────────────────────────
if grep -q "^GEMINI_API_KEY=$" .env 2>/dev/null || ! grep -q "GEMINI_API_KEY" .env 2>/dev/null; then
  echo -e "\n${YELLOW}⚠ GEMINI_API_KEY não configurada no .env${RESET}"
  echo -e "  Você pode configurar a chave dentro do app nas Configurações."
fi

# ── Iniciar servidor ──────────────────────────────────────────────────────────
PORT=${PORT:-3000}
echo -e "\n${GREEN}${BOLD}Iniciando OSONE em http://localhost:${PORT}${RESET}\n"

# Abre o navegador após 2 segundos
(sleep 2 && (xdg-open "http://localhost:${PORT}" 2>/dev/null || open "http://localhost:${PORT}" 2>/dev/null || start "http://localhost:${PORT}" 2>/dev/null)) &

npm run dev
