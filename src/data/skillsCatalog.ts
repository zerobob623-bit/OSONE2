// src/data/skillsCatalog.ts — Catálogo de agentes prontos para instalar
import type { CustomSkill } from '../store/useAppStore';

export interface CatalogSkill extends Omit<CustomSkill, 'id' | 'active'> {
  catalogId: string;       // ID fixo do catálogo (não muda)
  category: string;        // "utilidade" | "finanças" | "brasil" | "diversão" | "dev"
  author: string;          // quem criou
  popular?: boolean;       // destaque
}

const CATALOG: CatalogSkill[] = [
  // ── FINANÇAS ──────────────────────────────────────────────
  {
    catalogId: 'exchange-rates',
    displayName: 'Cotação de Moedas',
    icon: '💱',
    description: 'Consulta cotação em tempo real de qualquer moeda (USD, EUR, BRL, BTC). Use quando o usuário perguntar sobre câmbio, dólar, euro, etc.',
    webhookUrl: 'https://api.exchangerate-api.com/v4/latest/{currency}',
    method: 'GET',
    parameters: [
      { name: 'currency', description: 'Código da moeda base (ex: USD, BRL, EUR)', required: true, type: 'string' }
    ],
    category: 'finanças',
    author: 'OSONE',
    popular: true,
  },

  // ── BRASIL ────────────────────────────────────────────────
  {
    catalogId: 'cep-brasil',
    displayName: 'Busca CEP',
    icon: '📮',
    description: 'Busca endereço completo pelo CEP brasileiro. Use quando o usuário perguntar sobre CEP, endereço ou localização.',
    webhookUrl: 'https://viacep.com.br/ws/{cep}/json/',
    method: 'GET',
    parameters: [
      { name: 'cep', description: 'CEP com 8 dígitos (ex: 01001000)', required: true, type: 'string' }
    ],
    category: 'brasil',
    author: 'OSONE',
    popular: true,
  },
  {
    catalogId: 'ddd-brasil',
    displayName: 'Consulta DDD',
    icon: '📞',
    description: 'Descobre quais cidades pertencem a um DDD brasileiro. Use quando perguntar sobre DDD ou código de área.',
    webhookUrl: 'https://brasilapi.com.br/api/ddd/v1/{ddd}',
    method: 'GET',
    parameters: [
      { name: 'ddd', description: 'Código DDD (ex: 11, 21, 47)', required: true, type: 'string' }
    ],
    category: 'brasil',
    author: 'OSONE',
  },
  {
    catalogId: 'cnpj-brasil',
    displayName: 'Consulta CNPJ',
    icon: '🏢',
    description: 'Busca dados de empresa pelo CNPJ (razão social, endereço, situação). Use quando perguntar sobre CNPJ ou empresa.',
    webhookUrl: 'https://brasilapi.com.br/api/cnpj/v1/{cnpj}',
    method: 'GET',
    parameters: [
      { name: 'cnpj', description: 'CNPJ com 14 dígitos (sem pontuação)', required: true, type: 'string' }
    ],
    category: 'brasil',
    author: 'OSONE',
  },
  {
    catalogId: 'feriados-brasil',
    displayName: 'Feriados Nacionais',
    icon: '🎉',
    description: 'Lista todos os feriados nacionais de um ano. Use quando perguntar sobre feriados ou datas comemorativas.',
    webhookUrl: 'https://brasilapi.com.br/api/feriados/v3/{ano}',
    method: 'GET',
    parameters: [
      { name: 'ano', description: 'Ano (ex: 2025, 2026)', required: true, type: 'string' }
    ],
    category: 'brasil',
    author: 'OSONE',
  },
  {
    catalogId: 'banco-brasil',
    displayName: 'Info Banco',
    icon: '🏦',
    description: 'Busca informações de um banco pelo código. Use quando perguntar sobre código de banco ou transferência.',
    webhookUrl: 'https://brasilapi.com.br/api/banks/v1/{code}',
    method: 'GET',
    parameters: [
      { name: 'code', description: 'Código do banco (ex: 1 para BB, 341 para Itaú, 33 para Santander)', required: true, type: 'string' }
    ],
    category: 'brasil',
    author: 'OSONE',
  },

  // ── UTILIDADE ─────────────────────────────────────────────
  {
    catalogId: 'weather',
    displayName: 'Clima / Tempo',
    icon: '🌤️',
    description: 'Consulta clima e previsão do tempo de qualquer cidade. Use quando perguntar sobre tempo, clima, temperatura, chuva.',
    webhookUrl: 'https://wttr.in/{city}?format=j1',
    method: 'GET',
    parameters: [
      { name: 'city', description: 'Nome da cidade (ex: São Paulo, New York, Tokyo)', required: true, type: 'string' }
    ],
    category: 'utilidade',
    author: 'OSONE',
    popular: true,
  },
  {
    catalogId: 'wikipedia',
    displayName: 'Wikipedia',
    icon: '📚',
    description: 'Busca resumo de artigos da Wikipedia em português. Use para consultar conceitos, pessoas, lugares, eventos históricos.',
    webhookUrl: 'https://pt.wikipedia.org/api/rest_v1/page/summary/{title}',
    method: 'GET',
    parameters: [
      { name: 'title', description: 'Título do artigo (ex: Albert_Einstein, Brasil, Inteligência_artificial)', required: true, type: 'string' }
    ],
    category: 'utilidade',
    author: 'OSONE',
    popular: true,
  },
  {
    catalogId: 'ip-geolocation',
    displayName: 'Geolocalização IP',
    icon: '🌍',
    description: 'Descobre localização geográfica de um endereço IP. Use quando perguntar sobre IP, localização de servidor.',
    webhookUrl: 'https://ipapi.co/{ip}/json/',
    method: 'GET',
    parameters: [
      { name: 'ip', description: 'Endereço IP (ex: 8.8.8.8)', required: true, type: 'string' }
    ],
    category: 'utilidade',
    author: 'OSONE',
  },
  {
    catalogId: 'dicionario',
    displayName: 'Dicionário PT-BR',
    icon: '📖',
    description: 'Busca definição de palavras em português. Use quando perguntar significado, definição, sinônimos de palavras.',
    webhookUrl: 'https://api.dicionario-aberto.net/word/{word}',
    method: 'GET',
    parameters: [
      { name: 'word', description: 'Palavra em português (ex: resiliência, amor, efêmero)', required: true, type: 'string' }
    ],
    category: 'utilidade',
    author: 'OSONE',
  },

  // ── DIVERSÃO ──────────────────────────────────────────────
  {
    catalogId: 'random-joke',
    displayName: 'Piadas',
    icon: '😂',
    description: 'Busca piadas aleatórias. Use quando o usuário pedir piada, humor ou quiser rir.',
    webhookUrl: 'https://v2.jokeapi.dev/joke/Any?lang=pt&type=single',
    method: 'GET',
    parameters: [],
    category: 'diversão',
    author: 'OSONE',
  },
  {
    catalogId: 'random-fact',
    displayName: 'Fatos Curiosos',
    icon: '🧠',
    description: 'Retorna fatos curiosos e aleatórios. Use quando o usuário quiser curiosidades ou "sabia que...".',
    webhookUrl: 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
    method: 'GET',
    parameters: [],
    category: 'diversão',
    author: 'OSONE',
  },
  {
    catalogId: 'cat-fact',
    displayName: 'Fatos sobre Gatos',
    icon: '🐱',
    description: 'Fatos aleatórios sobre gatos. Use quando falar sobre gatos ou animais.',
    webhookUrl: 'https://catfact.ninja/fact',
    method: 'GET',
    parameters: [],
    category: 'diversão',
    author: 'OSONE',
  },

  // ── DEV / TÉCNICO ─────────────────────────────────────────
  {
    catalogId: 'github-user',
    displayName: 'Perfil GitHub',
    icon: '🐙',
    description: 'Busca informações de perfil de um usuário do GitHub. Use quando perguntar sobre perfil, repos, contribuições.',
    webhookUrl: 'https://api.github.com/users/{username}',
    method: 'GET',
    parameters: [
      { name: 'username', description: 'Nome de usuário do GitHub (ex: torvalds, zerobob623-bit)', required: true, type: 'string' }
    ],
    category: 'dev',
    author: 'OSONE',
  },
  {
    catalogId: 'github-repos',
    displayName: 'Repos GitHub',
    icon: '📦',
    description: 'Lista repositórios públicos de um usuário do GitHub. Use quando quiser ver projetos ou repos.',
    webhookUrl: 'https://api.github.com/users/{username}/repos?sort=updated&per_page=10',
    method: 'GET',
    parameters: [
      { name: 'username', description: 'Nome de usuário do GitHub (ex: torvalds)', required: true, type: 'string' }
    ],
    category: 'dev',
    author: 'OSONE',
  },
  {
    catalogId: 'public-apis',
    displayName: 'APIs Públicas',
    icon: '🔌',
    description: 'Busca APIs públicas disponíveis por categoria. Use quando procurar integrações ou APIs.',
    webhookUrl: 'https://api.publicapis.org/entries?category={category}&https=true',
    method: 'GET',
    parameters: [
      { name: 'category', description: 'Categoria (ex: Finance, Weather, Animals, Science, Music)', required: true, type: 'string' }
    ],
    category: 'dev',
    author: 'OSONE',
  },
];

export default CATALOG;

export const CATALOG_CATEGORIES: Record<string, { label: string; icon: string }> = {
  popular: { label: 'Populares', icon: '🔥' },
  finanças: { label: 'Finanças', icon: '💰' },
  brasil: { label: 'Brasil', icon: '🇧🇷' },
  utilidade: { label: 'Utilidade', icon: '🛠️' },
  diversão: { label: 'Diversão', icon: '🎮' },
  dev: { label: 'Desenvolvimento', icon: '💻' },
};
