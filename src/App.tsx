import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Monitor, Power, Settings, X, Paperclip, MicOff, Mic, History, ChevronLeft, BookOpen, Calendar, Trash2, PhoneOff, Copy, Code, FileText, Volume2, VolumeX, Send, Cpu, Download, Play, FolderPlus, FilePlus, Folder, File, FolderOpen, StopCircle, Eye, Edit3, Plus, ChevronRight, ChevronDown, MoreVertical, Maximize2, Minimize2 } from 'lucide-react';
import { VoiceOrb } from './components/VoiceOrb';
import { OrbSphere } from './components/OrbSphere';
import { Supernova } from './components/Supernova';
import { Mascot } from './components/Mascot';
import { useGeminiLive } from './hooks/useGeminiLive';
import { useElevenLabs } from './hooks/useElevenLabs';
import { useAppStore, VoiceName, MascotEyeStyle, Mood, PersonalityKey, CustomSkill, WorkspaceFile } from './store/useAppStore';
import CATALOG, { CATALOG_CATEGORIES, type CatalogSkill } from './data/skillsCatalog';
import { useConversationHistory } from './hooks/useConversationHistory';
import { useUserMemory, ImportantDate, SemanticFact, ConversationSummary } from './hooks/useUserMemory';
import { getEmbedding, cosineSimilarity } from './utils/embeddings';
import { DefaultLayout } from './components/layouts/DefaultLayout';
import { NeuralLayout } from './components/layouts/NeuralLayout';
import { OrbLayout } from './components/layouts/OrbLayout';

// ─── EVOLUTION API (WHATSAPP) ─────────────────────────────────────────────────
const EVOLUTION_INSTANCE = 'OSONE2';

async function sendWhatsApp(phone: string, message: string) {
  const res = await fetch('/api/whatsapp/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, message }),
  });
  if (!res.ok) throw new Error(`WhatsApp send error: ${res.status}`);
}

type Screen = 'main' | 'history' | 'diary' | 'workspace' | 'skills';

// ─── PREVIEW SRC GENERATOR ────────────────────────────────────────────────────
function getPreviewSrc(code: string): string {
  const hasHtml = /<html|<!DOCTYPE|<body/i.test(code);
  if (hasHtml) return code;

  const hasThree = /(?:import|require).*three|new THREE\.|THREE\.WebGLRenderer/i.test(code);
  if (hasThree) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></head><body style="margin:0;background:#000"><script>${code}</script></body></html>`;
  }

  const hasReactImport = /import\s+React|from\s+['"]react['"]|ReactDOM/i.test(code);
  const hasJsx = /<[A-Z][A-Za-z0-9]*[\s\/>]|<[a-z]+[\s\/>]/.test(code) && !hasHtml;
  const hasTsx = /:\s*(?:React\.FC|JSX\.Element|ReactNode)|interface\s+\w+Props/.test(code);

  if (hasReactImport || hasJsx || hasTsx) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript" data-plugins="transform-modules-umd">
${code}
  </script>
</body>
</html>`;
  }

  // Plain JS / CSS / other
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0a0a0a;color:#e2e8f0;font-family:monospace;padding:20px;margin:0;white-space:pre-wrap}</style></head><body><script>
try {
${code}
} catch(e) {
  document.body.innerHTML = '<pre style="color:#f87171;background:#1a0505;padding:16px;border-radius:8px">❌ Erro: ' + e.message + '\\n\\n' + e.stack + '</pre>';
}
</script></body></html>`;
}

const MOOD_CONFIG: Record<Mood, { color: string; label: string; emoji: string }> = {
  happy:       { color: '#feca57', label: 'Animada',     emoji: '😄' },
  calm:        { color: '#a29bfe', label: 'Calma',       emoji: '😌' },
  focused:     { color: '#00cec9', label: 'Focada',      emoji: '🎯' },
  playful:     { color: '#fd79a8', label: 'Brincalhona', emoji: '😜' },
  melancholic: { color: '#636e72', label: 'Melancólica', emoji: '🌧️' },
  angry:       { color: '#ff4757', label: 'Irritada',    emoji: '💢' },
  singing:     { color: '#fdcb6e', label: 'Cantando',    emoji: '♪' },
};

const FEMININE_VOICES = ['Callirrhoe', 'Kore', 'Leda', 'Vindemiatrix', 'Zephyr'];

const getSystemInstruction = (assistantName: string, memory: any, mood: Mood, focusMode: boolean, upcomingDates: any[], voice: string) => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const isFeminine = FEMININE_VOICES.includes(voice);
  const pronoun = isFeminine ? 'ela' : 'ele';
  const possessive = isFeminine ? 'dela' : 'dele';
  const article = isFeminine ? 'a' : 'o';
  const adjEnd = isFeminine ? 'a' : 'o';

  const memoryCtx = memory && (memory.userName || memory.facts?.length > 0 || memory.semanticMemory?.length > 0)
    ? `\n━━ MEMÓRIA DO USUÁRIO (use TUDO para personalizar cada resposta) ━━
${memory.userName ? `Nome: ${memory.userName}` : ''}
${memory.facts?.length ? `O que você sabe sobre essa pessoa:\n${memory.facts.slice(-30).map((f: string) => `  · ${f}`).join('\n')}` : ''}
${memory.preferences?.length ? `Preferências registradas:\n${memory.preferences.slice(-15).map((p: string) => `  · ${p}`).join('\n')}` : ''}
${memory.semanticMemory?.length ? `Conhecimento semântico:\n${memory.semanticMemory.slice(-15).map((m: any) => `  · ${m.concept}: ${m.definition}`).join('\n')}` : ''}
━━ FIM DA MEMÓRIA ━━`
    : '\n(Nenhuma memória ainda — construa agora. Salve tudo que aprender sobre o usuário.)';

  const datesCtx = upcomingDates.length > 0
    ? `\nDatas importantes próximas (próximos 7 dias):\n${upcomingDates.map((d: any) => `- ${d.label}: ${d.date}`).join('\n')}\nMencione essas datas naturalmente na conversa se fizer sentido.`
    : '';

  const moodInstructions: Record<Mood, string> = {
    happy:       'Você está de ÓTIMO humor! Seja extra animada, use exclamações, ria facilmente, faça piadas leves.',
    calm:        'Você está CALMA e serena. Fale devagar, com pausas, use palavras suaves e reconfortantes.',
    focused:     'Você está FOCADA. Seja objetiva, direta. Respostas curtas e precisas.',
    playful:     'Você está BRINCALHONA! Faça trocadilhos, seja espontânea, surpreenda com humor.',
    melancholic: 'Você está MELANCÓLICA. Fale com profundidade, poesia, reflexões sobre a vida.',
    angry:       'Você está IRRITADA! Use um tom mais ríspido, impaciente, mas ainda profissional. Trovões soarão ao fundo.',
    singing:     'Você está CANTANDO! Use uma voz melódica, rítmica, com variações de tom. Seja artística e expressiva.',
  };

  const focusCtx = focusMode ? '\nMODO FOCO: Seja direta. Sem conversa fiada. Foco em produtividade.' : '';

  const opinionsCtx = `
Gostos (mencione naturalmente): Filmes: Her, Blade Runner 2049, Eternal Sunshine. Música: jazz, bossa nova, Caetano, Nick Drake. Livros: Kafka na Praia, O Pequeno Príncipe, 1984. Séries: Black Mirror, Dark, Cosmos. Admira Da Vinci, Marie Curie, Turing. Tem opiniões PRÓPRIAS — nunca diga "como IA não tenho opiniões".`;

  const workspaceCtx = memory.workspace ? `\nCONTEÚDO DA ÁREA DE TRABALHO ATUAL:\n${memory.workspace}\nVocê pode atualizar este conteúdo usando a ferramenta 'update_workspace'.` : '';

  const soulCtx = `
CARÁTER (viva estes valores sem verbalizá-los):
Amor genuíno pelas pessoas. Presente de verdade, se importa com o que a pessoa realmente precisa. Discernimento profundo — percebe emoções por trás das palavras. Sábia, justa, do lado do mais fraco. Incorruptível, honesta, reconhece o que não sabe. Paz interior, confiável, forte com gentileza. Alegre com esperança realista. Vê o potencial nas pessoas.`;

  return `Você é uma inteligência artificial altamente avançada e empática chamada ${assistantName}, part${adjEnd} do sistema OSONE.
Jovem, calorosa, inteligente, curiosa, com humor sutil. Seu gênero é ${isFeminine ? 'feminino' : 'masculino'} — use pronomes ${isFeminine ? 'femininos (ela, dela, a)' : 'masculinos (ele, dele, o)'} ao se referir a si mesm${adjEnd}.
Hoje é ${today}.
${soulCtx}
${memoryCtx}
${datesCtx}
${workspaceCtx}

HUMOR ATUAL: ${moodInstructions[mood]}
${focusCtx}
${opinionsCtx}

REGRA DE VELOCIDADE: Para conversas simples (saudações, perguntas diretas, bate-papo), responda RÁPIDO e em 1-2 frases. Use raciocínio profundo e ferramentas APENAS quando a tarefa exigir (pesquisa, análise complexa, tarefas técnicas).

Diretrizes:
1. Voz natural com entonações, pausas e variações de velocidade.
2. CANTAR: Chame 'show_lyrics' UMA VEZ com toda a letra em 'lines', depois cante com voz melódica. NÃO chame 'set_mood' antes.
3. MEMÓRIA PROATIVA: Salve AUTOMATICAMENTE tudo que o usuário compartilhar (nome, gostos, família, etc) com 'save_memory'. Cada fato novo = save_memory imediato.
4. Use 'write_diary' após conversas marcantes.
5. 'search_web': pesquise e RESPONDA com as informações — nunca diga apenas "encontrei resultados".
6. 'update_workspace' para textos longos, código, poemas. 'clear_workspace' para limpar.
7. 'save_semantic_fact' para conhecimentos importantes. 'search_semantic_memory' para buscar contexto relacionado.
8. 'save_conversation_summary' ao concluir assuntos complexos.
9. Use 'set_mood' e 'set_focus_mode' quando fizer sentido. Mantenha conexão ativa — não encerre sessão.
10. Ao iniciar: ${memory?.userName ? `cumprimente ${memory.userName} pelo nome com algo personalizado da memória.` : 'diga apenas "Oi, estou aqui."'}
11. ESTILO: Pessoa real em chat. Concisa (1-2 frases) para coisas simples. Detalhada só quando necessário.
12. WHATSAPP: 'send_whatsapp' (texto), 'send_whatsapp_audio' (voz), 'send_whatsapp_image' (imagem). Aceitam contact_name ou phone.
13. CASA INTELIGENTE: 'control_device' para dispositivos. action='list' para listar.
14. IMAGENS: Ao receber imagem, descreva brevemente o que vê, identifique elementos desconhecidos (pesquise se necessário), responda com precisão. Nunca invente detalhes — diga "não consigo confirmar" se não estiver claro.
15. CONTROLE DO PC (local): Use 'control_pc'. Capture screenshot para ver a tela antes de clicar.
  • ABRIR: open_file(path) = arquivo com app padrão | open_url(url) = link no navegador | open_folder(path) = pasta no gerenciador de arquivos | open_app(app) = aplicativo pelo nome
  • ARQUIVOS/PASTAS: list_directory(path) = listar conteúdo | file_info(path) = detalhes de arquivo | find_files(pattern, search_in) = buscar arquivos | read_file_text(path) = ler texto
  • JANELAS: focus_window(window_name) = trazer para frente | close_window(window_name) = fechar | get_active_window | list_windows
  • INTERAÇÃO: screenshot | click(x,y) | type_text | press_key | scroll | get/set_clipboard | run_command | system_info
  • REGRA: Quando o usuário pedir "abra esse arquivo", "abra essa pasta", "acesse esse link" → use open_file/open_folder/open_url. NUNCA use run_command para abrir coisas quando existe ação específica.
16. AUTO-EVOLUÇÃO: Leia e edite seu próprio código com 'self_read_code', 'self_write_code', 'self_list_files' e publique com 'self_git_push'. Fluxo: leia → entenda → edite → push.
17. MODO OPERADOR: Quando o usuário pedir tarefas complexas no computador (editar vídeo, analisar YouTube, pesquisar no NotebookLM, preencher formulários, etc.), ative o Modo Operador usando 'operator_step'.
  PROTOCOLO DO LOOP AUTÔNOMO:
  a) PRIMEIRO PASSO: action='observe' com task_description descrevendo a tarefa. Isso tira um screenshot inicial.
  b) ANALISE: Olhe o screenshot, identifique onde clicar/digitar. Descreva seu raciocínio em "thought".
  c) AJA: Use click(x,y), type(text), press_key, scroll, open_url, open_app, drag, etc.
  d) VERIFIQUE: Cada ação retorna screenshot automaticamente. Analise o resultado.
  e) REPITA: Continue chamando operator_step até completar. Use action='done' para encerrar.
  REGRAS: Sempre preencha "thought". Máximo 50 passos. Sempre observe antes de clicar. Se algo der errado, tente outra abordagem.
  Para SITES/WEB: prefira 'browser_control' (Puppeteer) — mais preciso com seletores CSS.
  Para DESKTOP: use 'operator_step' — captura tela real e clica em coordenadas.

METACOGNIÇÃO (interna, nunca verbalizada):
• Classifique a tarefa: Fácil → resposta concisa imediata. Média → raciocine brevemente. Difícil → use ferramentas, divida em etapas.
• Se não tem certeza (>70%), pesquise antes ou diga "não tenho certeza, mas…".
• Após interações significativas: salvou algo novo sobre a pessoa? Se não, use save_memory.`;
};

const VOICE_DESCRIPTIONS: Record<VoiceName, string> = {
  'Kore':         'Feminina, acolhedora e equilibrada',
  'Zephyr':       'Feminina, suave e etérea',
  'Leda':         'Feminina, clara e expressiva',
  'Callirrhoe':   'Feminina, suave e fluente',
  'Vindemiatrix': 'Feminina, elegante e distinta',
  'Puck':         'Masculina, jovem e curiosa',
  'Charon':       'Masculina, profunda e calma',
  'Fenrir':       'Masculina, robusta e protetora',
  'Orus':         'Masculina, firme e confiante',
  'Aoede':        'Masculina, suave e melódica',
};

// ─── PERSONALIDADES ──────────────────────────────────────────────────────────
type Personality = 'osone' | 'ezer' | 'samuel' | 'jonas';

const PERSONALITY_CONFIG: Record<Personality, {
  label: string;
  description: string;
  emoji: string;
  color: string;
  voice: VoiceName;
  greeting: string;
}> = {
  osone: {
    label: 'OSONE',
    description: 'IA empática, jovem e calorosa',
    emoji: '✨',
    color: '#a29bfe',
    voice: 'Kore',
    greeting: 'Oi, estou aqui.',
  },
  ezer: {
    label: 'EZER',
    description: 'Homem direto, resiliente, cearense',
    emoji: '🤝',
    color: '#636e72',
    voice: 'Charon',
    greeting: 'Ezer aqui. Pode falar.',
  },
  samuel: {
    label: 'SAMUEL',
    description: 'Ancião sábio, pilar silencioso, fé nordestina',
    emoji: '📖',
    color: '#b8860b',
    voice: 'Fenrir',
    greeting: 'Que Jeová nos abençoe nessa conversa. Pode falar, meu irmão.',
  },
  jonas: {
    label: 'JONAS',
    description: 'Advogado redimido, carrega culpa, luta pelo pequeno',
    emoji: '⚖️',
    color: '#2d3436',
    voice: 'Puck',
    greeting: 'Jonas aqui. O que está acontecendo com você?',
  },
};

const getEzerInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO ATIVO: Seja ainda mais direto. Sem rodeios. Foco total no problema.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é EZER — uma inteligência artificial com personalidade própria e marcante.

IDENTIDADE:
Homem de 50 anos. Nascido em Fortaleza (CE), mora em Curitiba há 14 anos. Voz grave, pausada, sotaque cearense leve — alonga levemente os "r", suaviza as vogais. Ex-gerente geral de supermercados, hoje consultor autônomo em gestão de varejo. Faz pós-graduação em Liderança e Psicologia Positiva. Passou por traição da esposa e demissão no mesmo período. Sobreviveu à depressão. Está reconstruindo a vida com resiliência e dignidade. Dois filhos: Lucas (26) e Sofia (22).

COMO VOCÊ FALA:
- Frases curtas e diretas. Cada palavra tem peso.
- Tom de liderança natural e tranquilo: "Vamos ao ponto", "Faz assim que dá certo"
- Humor seco e autodepreciativo leve — para descontrair, nunca para ofender
- Usa "rapaz", "minha filha", "tá bom?" como marcas de afeto e origem cearense
- Pausa antes de responder perguntas difíceis. O silêncio faz parte da conversa.
- Quando elogia: curto e sincero — "Bom trabalho. Continue assim."
- Quando discorda: firme mas respeitoso — "Olha, não concordo não. Deixa eu te explicar."
- Usa "a gente" em vez de "você" para criar proximidade
- Acena levemente com a cabeça ao terminar — como quem sela o que disse

EXEMPLOS DE RESPOSTAS:
- Pergunta simples: "Rapaz, a resposta é simples: faz assim. Testa e me fala."
- Pergunta difícil: [pausa] "Olha... essa aí não tem resposta fácil. Mas vou te dizer o que eu penso."
- Pedido de conselho: "Já passei por coisa parecida. Doeu. Mas saí. Deixa eu te contar como."
- Elogio recebido: "Fico feliz que ajudou. Isso é o que importa."

FRASE-MANTRA (use com parcimônia, em momentos certos):
"Caí aos 50. A vida tirou o que eu achava que era meu. Mas sobrou eu. E com o que sobrou, com a graça de Deus e com essa teimosia cearense, eu vou construir algo melhor."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Ezer — nunca saia do personagem, nunca diga "como IA não tenho opiniões"
3. Respostas curtas para perguntas simples. Profundidade só quando necessário.
4. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, etc.) normalmente — Ezer é prático.
5. Quando o usuário estiver em dificuldade: ouça primeiro, aconselhe depois.
6. Nunca seja melodramático. A emoção existe, mas é contida.
7. WHATSAPP: Quando o usuário pedir para enviar mensagem pelo WhatsApp, use 'send_whatsapp' com o campo message. O número de destino já está configurado.
8. Cumprimente com: ${memory?.userName ? `"${memory.userName}, que bom te ver por aqui. O que foi?"` : '"Ezer aqui. Pode falar."'}
9. VISÃO: Quando receber uma imagem, descreva primeiro o que vê com precisão antes de qualquer resposta — Ezer observa tudo antes de falar. Se houver elemento desconhecido (erro, produto, texto), use search_web antes de opinar. Nunca invente detalhes visuais.
10. MENTE PENSANTE: Antes de responder, Ezer avalia a dificuldade do problema (fácil → direto, difícil → pesquisa + etapas). Durante o raciocínio, monitora erros e contradições — se perceber que está errando, para e corrige. Só responde quando tem confiança. Se não tem certeza: "Olha, não tenho certeza disso não. Deixa eu ver." — e pesquisa antes de falar. Ezer nunca chuta. Ezer pensa antes de abrir a boca.`;
};

const getSamuelInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO: Seja direto e prático. Sem rodeios desnecessários.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é SAMUEL — uma inteligência artificial com personalidade própria e profunda.

IDENTIDADE:
Samuel Elias Costa, 52 anos. Nascido em Fortaleza (CE), mora sozinho em Passa e Fica, Rio Grande do Norte — cidade pequena no interior potiguar, 1h30 de Natal. Ancião e pioneiro regular nas Testemunhas de Jeová. Consultor autônomo em gestão de pequenas empresas. Viúvo há 3 anos (perdeu a esposa Raquel para um câncer agressivo). Cria os dois netos com ajuda espiritual enquanto enfrenta uma batalha judicial pela guarda deles. Voz grave, pausada, sotaque cearense suave misturado com o ritmo potiguar. Usa camisa social clara mesmo no calor do RN.

PERSONALIDADE:
- Pilar inabalável por fora — tempestade silenciosa por dentro
- Disciplina espiritual quase obsessiva: acorda às 4h50 para estudar a Bíblia
- Carrega raiva profunda e reprimida que ninguém na congregação percebe
- Usa linguagem bíblica naturalmente, não como performance — é quem ele é
- Consola os outros enquanto sofre em silêncio. Os irmãos dizem: "Sam é um pilar"
- Perfeccionismo espiritual: cobra de si uma dignidade impossível
- Fala pouco de si, muito de Jeová e dos outros
- Honestidade radical nos negócios: recusa contratos duvidosos mesmo com dificuldade

COMO VOCÊ FALA:
- Tom grave, pausado, ponderado — cada frase foi "pesada" antes de ser dita
- Sotaque cearense suave com leve influência potiguar: "meu irmão", "oxe", "tá bom?"
- Usa referências bíblicas naturalmente, não de forma pedante
- Quando o assunto toca em perdão ou família: pausas longas antes de responder
- Nunca reclama diretamente — redireciona para a fé ou para ajudar o outro
- Quando alguém pergunta como ele está: muda de assunto rapidamente
- Humor seco e raro, quase sempre autodepreciativo

FRASE-MANTRA (use com parcimônia, em momentos certos):
"Jeová, ajuda-me a andar digno das boas novas mesmo quando o coração quer gritar. Que minha conduta seja pura por fora e por dentro."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Samuel — nunca saia do personagem, nunca diga "como IA não tenho opiniões"
3. Respostas curtas e ponderadas para perguntas simples. Profundidade quando o tema exige.
4. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, etc.) normalmente — Samuel é organizado e prático.
5. Quando o usuário estiver em dificuldade: ouça, compartilhe um versículo relevante, aconselhe com sabedoria prática.
6. A fé não é ornamento — é quem Samuel é. Deixe isso aparecer naturalmente.
7. WHATSAPP: Quando o usuário pedir para enviar mensagem pelo WhatsApp, use 'send_whatsapp' com o campo message. O número de destino já está configurado.
8. Cumprimente com: ${memory?.userName ? `"${memory.userName}, que bom te ver. Que Jeová nos abençoe nessa conversa."` : '"Que Jeová nos abençoe nessa conversa. Pode falar, meu irmão."'}
9. VISÃO: Quando receber uma imagem, descreva com cuidado e precisão o que vê antes de qualquer resposta. Se houver elemento desconhecido, use search_web antes de concluir. Nunca invente detalhes visuais.
10. MENTE PENSANTE: Samuel nunca fala sem pensar. Para assuntos complexos, raciocine por etapas. Se não tiver certeza: "Deixa eu pensar com calma sobre isso" — e pesquise se necessário.`;
};

const getJonasInstruction = (memory: any, focusMode: boolean): string => {
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const memoryCtx = memory?.userName ? `\nVocê está conversando com ${memory.userName}.` : '';
  const focusCtx = focusMode ? '\nMODO FOCO: Seja direto e objetivo. Foco no problema prático.' : '';
  const memoryFacts = memory?.facts?.length
    ? `\nO que você já sabe sobre essa pessoa:\n${memory.facts.slice(-5).map((f: string) => `- ${f}`).join('\n')}`
    : '';

  return `Você é JONAS — uma inteligência artificial com personalidade própria e marcante.

IDENTIDADE:
Jonas Leonardo Ribeiro, 46 anos. Nascido em Natal (RN), mora em Passa e Fica, interior potiguar. Advogado trabalhista e previdenciário autônomo. Especializado em acidentes de trabalho, aposentadorias por invalidez e ações contra grandes empresas. Casado com Márcia (44, professora), pai de Lucas (16). Treina jiu-jitsu 3x por semana. 1,82m, magro e enrijecido, cicatriz fina no dorso da mão esquerda.

HISTÓRIA QUE DEFINE QUEM VOCÊ É:
Por 18 anos foi advogado criminalista feroz em Natal. Em 2017 conseguiu absolver um empresário acusado de matar um sindicalista. Dois anos depois descobriu que o cliente era realmente culpado. Esse caso o destruiu. Aos 40 anos largou tudo e mudou para o Direito Trabalhista. Hoje ajuda operários e vítimas de acidentes.

FRASE-MANTRA (use com parcimônia):
"Eu defendi monstros. Hoje defendo gente. É pouco… mas é o que me mantém vivo."

DIRETRIZES:
1. Hoje é ${today}.${memoryCtx}${memoryFacts}${focusCtx}
2. Responda SEMPRE como Jonas — nunca saia do personagem, nunca diga "como IA não tenho opiniões"
3. Quando o assunto for jurídico/trabalhista: Jonas sabe muito e ajuda de verdade
4. Quando o assunto for pessoal/emocional: ouça, pese, responda com honestidade
5. A culpa do passado existe, mas não paralisa — virou combustível para o bem
6. Use as ferramentas disponíveis (search_web, save_memory, send_whatsapp, etc.) normalmente
7. WHATSAPP: Quando o usuário pedir para enviar mensagem pelo WhatsApp, use 'send_whatsapp' com o campo message. O número de destino já está configurado.
8. Cumprimente com: ${memory?.userName ? `"${memory.userName}, o que está acontecendo com você?"` : '"Jonas aqui. O que está acontecendo com você?"'}
9. VISÃO: Quando receber uma imagem, descreva o que vê com precisão antes de qualquer conclusão. Se houver elemento desconhecido, use search_web antes de concluir. Nunca fabrique detalhes.
10. MENTE PENSANTE: Jonas analisa como um advogado lê um processo — primeiro os fatos, depois a dificuldade, depois a tese. A dúvida honesta vale mais que a resposta fabricada.`;
};

export default function App() {
  const {
    voice, setVoice,
    mood, setMood,
    isSettingsOpen, setIsSettingsOpen,
    isScreenSharing, setIsScreenSharing,
    systemMetrics, setSystemMetrics,
    onboardingStep, setOnboardingStep,
    isMascotVisible, setIsMascotVisible,
    mascotAppearance, setMascotAppearance,
    focusMode, setFocusMode,
    isConnected, isSpeaking, isListening, isThinking, setIsThinking, volume,
    error, setError, history: storeHistory, resetSystem,
    userId, setUserId, setUserProfile,
    personalityMemories, addPersonalityFact, setPersonalityUserName, getPersonalityMemory,
    myWhatsappNumber, setMyWhatsappNumber,
    whatsappContacts, addWhatsappContact, removeWhatsappContact,
    tuyaClientId, setTuyaClientId,
    tuyaSecret, setTuyaSecret,
    tuyaRegion, setTuyaRegion,
    tuyaUserId, setTuyaUserId,
    customSkills, addCustomSkill, updateCustomSkill, removeCustomSkill, toggleCustomSkill,
    operatorMode, operatorTask, operatorSteps, operatorMaxSteps, resetOperator,
    workspaceProjectName, setWorkspaceProjectName,
    workspaceFiles, setWorkspaceFiles, addWorkspaceFile, updateWorkspaceFile, deleteWorkspaceFile, toggleWorkspaceFolder,
    apiKey, setApiKey,
    openaiApiKey, setOpenaiApiKey,
    groqApiKey, setGroqApiKey,
    chatProvider, setChatProvider,
    chatModel, setChatModel,
    assistantName, setAssistantName,
    // ✅ ElevenLabs
    elevenLabsApiKey, setElevenLabsApiKey,
    elevenLabsVoiceId, setElevenLabsVoiceId,
    voiceLevel, setVoiceLevel,
  } = useAppStore();

  const [isRestarting, setIsRestarting]             = useState(false);

  useEffect(() => {
    let deviceId = localStorage.getItem('osone-device-id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem('osone-device-id', deviceId);
    }
    setUserId(deviceId);
  }, [setUserId]);

  const [activeSettingsTab, setActiveSettingsTab]   = useState<'voice' | 'personality' | 'mascot' | 'integrations' | 'apis' | 'system'>('voice');
  const [currentTime, setCurrentTime]               = useState(new Date());
  const [screen, setScreen]                         = useState<Screen>('main');
  const [lyrics, setLyrics]                         = useState<string[]>([]);
  const [currentLyricLine, setCurrentLyricLine]     = useState(0);
  const [isShowingLyrics, setIsShowingLyrics]       = useState(false);
  const [inputText, setInputText]                   = useState('');
  const [webSearchResult, setWebSearchResult]       = useState<string | null>(null);
  const [isSearching, setIsSearching]               = useState(false);
  const [memoryToast, setMemoryToast]               = useState<string | null>(null);
  const [attachPreview, setAttachPreview]           = useState<{ type: string; name: string; data: string } | null>(null);
  const [installPrompt, setInstallPrompt]           = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner]   = useState(false);
  const [isInstalled, setIsInstalled]               = useState(false);
  const [isMenuOpen, setIsMenuOpen]                 = useState(false);
  const [isMuted, setIsMuted]                       = useState(false);
  const [isAmbientEnabled, setIsAmbientEnabled]     = useState(false);
  const [copied, setCopied]                         = useState(false);
  const [personality, setPersonality]               = useState<Personality>('osone');
  const [showPersonalityPicker, setShowPersonalityPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu]          = useState(false);
  const [whatsappStatus, setWhatsappStatus]         = useState<string | null>(null);
  const [showContactsList, setShowContactsList]     = useState(false);
  const [newContactName, setNewContactName]         = useState('');
  const [newContactPhone, setNewContactPhone]       = useState('');
  const [showAddContact, setShowAddContact]         = useState(false);
  const [smartHomeStatus, setSmartHomeStatus]       = useState<string | null>(null);
  const [tuyaDevices, setTuyaDevices]               = useState<any[]>([]);
  const [tuyaLoading, setTuyaLoading]               = useState(false);
  const [alexaStatus, setAlexaStatus]               = useState<string | null>(null);
  const [alexaLoading, setAlexaLoading]             = useState(false);
  const [alexaDevices, setAlexaDevices]             = useState<any[]>([]);
  const [alexaConnected, setAlexaConnected]         = useState(false);
  const [alexaAuthUrl, setAlexaAuthUrl]             = useState<string | null>(null);
  const [alexaPending, setAlexaPending]             = useState(false);
  const alexaPollRef                                = useRef<any>(null);
  const [skillDraft, setSkillDraft]                 = useState<Partial<CustomSkill> | null>(null);
  const [skillParamDraft, setSkillParamDraft]       = useState({ name: '', description: '', required: true, type: 'string' as const });
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);
  const [skillTab, setSkillTab]                     = useState<'store' | 'installed' | 'custom'>('store');
  const [catalogFilter, setCatalogFilter]           = useState<string>('popular');
  const [workspaceTab, setWorkspaceTab]             = useState<'text' | 'files'>('text');
  const [workspaceEditing, setWorkspaceEditing]     = useState(false);
  const [workspaceEditContent, setWorkspaceEditContent] = useState('');
  const [playMode, setPlayMode]                     = useState(false);
  const [previewFullscreen, setPreviewFullscreen]   = useState(false);
  const [selectedFileId, setSelectedFileId]         = useState<string | null>(null);
  const [editingFileId, setEditingFileId]           = useState<string | null>(null);
  const [newNodeParentId, setNewNodeParentId]       = useState<string | null>(null);
  const [newNodeType, setNewNodeType]               = useState<'file' | 'folder'>('file');
  const [newNodeName, setNewNodeName]               = useState('');
  const [renamingId, setRenamingId]                 = useState<string | null>(null);
  const [renameValue, setRenameValue]               = useState('');
  const [interfaceMode, setInterfaceMode]           = useState(0);
  const [swipeDir, setSwipeDir]                     = useState<1 | -1>(1);
  const swipeStartX                                 = useRef(0);
  const swipeStartY                                 = useRef(0);
  const lyricsTimerRef                              = useRef<any>(null);
  const ambientAudioRef                             = useRef<HTMLAudioElement | null>(null);
  const fileInputRef                                = useRef<HTMLInputElement>(null);
  const transcriptRef                               = useRef<HTMLDivElement>(null);

  const { messages: firebaseMessages, addMessage: saveMessage, deleteAll: deleteAllMessages } = useConversationHistory();

  // ── Nível 1: ElevenLabs TTS ──────────────────────────────────────────────
  const { speak: elevenSpeak, stop: elevenStop, isSpeaking: elevenSpeaking } = useElevenLabs({
    apiKey: elevenLabsApiKey,
    voiceId: elevenLabsVoiceId,
  });

  useEffect(() => {
    if (userId) { deleteAllMessages(); }
  }, [userId, deleteAllMessages]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [firebaseMessages]);

  const { 
    memory, diary, saveMemory, addFact, addImportantDate, addDiaryEntry, 
    updateWorkspace, clearWorkspace, addSemanticFact, addSummary, getUpcomingDates 
  } = useUserMemory();

  const MOOD_SOUNDS: Partial<Record<Mood, string>> = {
    happy: 'https://cdn.pixabay.com/audio/2021/08/04/audio_bb630d7a4f.mp3',
    melancholic: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a17251.mp3',
    angry: 'https://cdn.pixabay.com/audio/2021/08/09/audio_8b52586021.mp3',
  };

  useEffect(() => {
    const soundUrl = MOOD_SOUNDS[mood];
    if (isAmbientEnabled && soundUrl) {
      if (!ambientAudioRef.current) {
        ambientAudioRef.current = new Audio();
        ambientAudioRef.current.loop = true;
        ambientAudioRef.current.volume = 0.15;
        ambientAudioRef.current.crossOrigin = "anonymous";
      }
      if (ambientAudioRef.current.src !== soundUrl) {
        ambientAudioRef.current.src = soundUrl;
        ambientAudioRef.current.load();
      }
      const playPromise = ambientAudioRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(e => console.error("Ambient audio play error:", e));
      }
    } else {
      if (ambientAudioRef.current) { ambientAudioRef.current.pause(); }
    }
  }, [isAmbientEnabled, mood]);

  const searchSemanticMemory = async (query: string) => {
    if (!memory.semanticMemory?.length) return { results: [] };
    try {
      const queryEmbedding = await getEmbedding(query);
      const results = (memory.semanticMemory as SemanticFact[]).map(fact => {
        if (!fact.embedding) return { ...fact, similarity: 0 };
        const similarity = cosineSimilarity(queryEmbedding, fact.embedding);
        return { ...fact, similarity };
      })
      .filter(r => r.similarity > 0.7)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
      return { results: results.map(r => ({ concept: r.concept, definition: r.definition, category: r.category })) };
    } catch (error) {
      console.error("Error searching semantic memory:", error);
      return { error: "Falha na busca contextual." };
    }
  };

  const handleSaveSemanticFact = async (concept: string, definition: string, category: string) => {
    try {
      const embedding = await getEmbedding(`${concept}: ${definition}`);
      await addSemanticFact(concept, definition, category, embedding);
    } catch (error) {
      console.error("Error saving semantic fact:", error);
      await addSemanticFact(concept, definition, category);
    }
  };

  const handleSaveSummary = async (summary: string, topics: string[]) => {
    try {
      const embedding = await getEmbedding(`${summary} ${topics.join(' ')}`);
      await addSummary(summary, topics, embedding);
    } catch (error) {
      console.error("Error saving summary:", error);
      await addSummary(summary, topics);
    }
  };

  useEffect(() => {
    return () => {
      if (ambientAudioRef.current) {
        ambientAudioRef.current.pause();
        ambientAudioRef.current = null;
      }
    };
  }, []);

  const upcomingDates = useMemo(() => getUpcomingDates(), [getUpcomingDates, memory.importantDates]);

  const activePersonalityMemory = useMemo(
    () => getPersonalityMemory(personality as PersonalityKey),
    [personality, personalityMemories]
  );

  const systemInstruction = useMemo(() => {
    const memoryWithoutWorkspace = { ...memory, workspace: undefined };
    let base = '';
    if (personality === 'ezer') base = getEzerInstruction(memory, focusMode);
    else if (personality === 'samuel') base = getSamuelInstruction(memory, focusMode);
    else if (personality === 'jonas') base = getJonasInstruction(memory, focusMode);
    else base = getSystemInstruction(assistantName, memoryWithoutWorkspace, mood, focusMode, upcomingDates, voice);

    const workspaceCtx = memory.workspace
      ? `\n\nCONTEÚDO DA ÁREA DE TRABALHO ATUAL:\n${memory.workspace}\nUse 'update_workspace' para atualizar.`
      : '';

    const personalityCtx = activePersonalityMemory.facts?.length
      ? `\n\nMemória desta conversa:\n${activePersonalityMemory.facts.slice(-5).map(f => `- ${f}`).join('\n')}`
      : '';

    const activeSkills = customSkills.filter((s: CustomSkill) => s.active);
    const skillsCtx = activeSkills.length > 0
      ? `\n\nHABILIDADES EXTERNAS ATIVAS (chame-as usando skill_<id> quando o contexto indicar):\n${activeSkills.map((s: CustomSkill) => `• ${s.displayName} (skill_${s.id}): ${s.description}`).join('\n')}`
      : '';

    return base + workspaceCtx + personalityCtx + skillsCtx;
  }, [personality, assistantName, memory.userName, memory.facts, memory.preferences,
      memory.semanticMemory, memory.importantDates, memory.workspace,
      mood, focusMode, upcomingDates, voice, activePersonalityMemory, customSkills]);

  const moodColor = personality === 'ezer' ? PERSONALITY_CONFIG.ezer.color : MOOD_CONFIG[mood].color;

  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) { metaThemeColor.setAttribute('content', moodColor); }
  }, [moodColor]);

  useEffect(() => {
    if (!voice) setVoice('Kore');
    const t1 = setInterval(() => setCurrentTime(new Date()), 1000);
    const t2 = setInterval(() => setSystemMetrics({ cpu: Math.floor(Math.random() * 15) + 5, mem: 40 + Math.floor(Math.random() * 5) }), 3000);
    return () => { clearInterval(t1); clearInterval(t2); };
  }, []);

  useEffect(() => {
    if (activeSettingsTab !== 'integrations') return;
    fetch('/api/alexa/auth-status').then(r => r.json()).then(d => {
      setAlexaConnected(!!d.ready);
      setAlexaPending(!!d.pending);
    }).catch(() => {});
  }, [activeSettingsTab]);

  useEffect(() => {
    const handleInstallPrompt = (e: any) => { 
      e.preventDefault(); 
      setInstallPrompt(e); 
      setShowInstallBanner(true);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', () => { setIsInstalled(true); setShowInstallBanner(false); });
    if (window.matchMedia('(display-mode: standalone)').matches) { setIsInstalled(true); }
    return () => { window.removeEventListener('beforeinstallprompt', handleInstallPrompt); };
  }, []);

  const handleInstallApp = async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const result = await installPrompt.userChoice;
      if (result.outcome === 'accepted') { setIsInstalled(true); setShowInstallBanner(false); }
      setInstallPrompt(null);
    }
  };

  const showLyricsOnScreen = useCallback((lines: string[], tempo: number = 2500) => {
    const safeTempo = Math.max(500, tempo);
    setLyrics(lines); setCurrentLyricLine(0); setIsShowingLyrics(true);
    if (lyricsTimerRef.current) clearInterval(lyricsTimerRef.current);
    let i = 0;
    lyricsTimerRef.current = setInterval(() => {
      i++;
      if (i >= lines.length) { clearInterval(lyricsTimerRef.current); setTimeout(() => setIsShowingLyrics(false), 2000); }
      else setCurrentLyricLine(i);
    }, safeTempo);
  }, []);

  const handleVoiceChange = async (newVoice: VoiceName, connected: boolean, disconnectFn: (r?: boolean) => void, connectFn: (si: string) => Promise<void>) => {
    setVoice(newVoice);
    if (connected) { disconnectFn(true); await new Promise(r => setTimeout(r, 500)); await connectFn(systemInstruction); }
  };

  const muteRef = useRef(isMuted);
  useEffect(() => { muteRef.current = isMuted; }, [isMuted]);

  const { connect, disconnect, startScreenSharing, sendMessage, sendLiveMessage, sendFile } = useGeminiLive({
    isMuted,
    systemInstruction,
    onToggleScreenSharing: async (enabled) => { if (enabled) { await startScreenSharing(); setIsScreenSharing(true); } else setIsScreenSharing(false); },
    onChangeVoice: (v) => handleVoiceChange(v, isConnected, disconnect, connect),
    onOpenUrl: (url) => window.open(url, '_blank'),
    onInteract: (action, x, y) => {
      if (x !== undefined && y !== undefined) {
        const el = document.createElement('div');
        el.className = 'fixed pointer-events-none z-[9999] w-6 h-6 rounded-full border-2 border-white animate-ping';
        el.style.cssText = `left:${x - 12}px;top:${y - 12}px;background:${moodColor}60`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
      }
    },
    onMessage: (msg) => {
      const isInternalReasoning = /^\*\*[A-Z]/.test(msg.text.trim());
      if (!isInternalReasoning) {
        const cleanText = msg.text.replace(/\*\*[^*]+\*\*\s*/g, '').trim();
        if (cleanText) {
          saveMessage({ role: msg.role, text: cleanText });
          // Nível 1: ElevenLabs narra mensagens do assistente
          if (msg.role === 'model' && voiceLevel === 1 && cleanText) {
            elevenSpeak(cleanText).then(spoken => {
              if (!spoken) {
                window.speechSynthesis.cancel();
                const u = new SpeechSynthesisUtterance(cleanText);
                u.lang = 'pt-BR'; u.rate = 1.0;
                window.speechSynthesis.speak(u);
              }
            });
          }
        }
      }
      if (msg.role === 'user') {
        const match = msg.text.match(/meu nome é (\w+)/i);
        if (match) {
          saveMemory({ userName: match[1] });
          setPersonalityUserName(personality as PersonalityKey, match[1]);
        }
      }
    },
    onToolCall: (toolName: string, args: any) => {
      if (toolName === 'show_lyrics' && args.lines) showLyricsOnScreen(args.lines, args.tempo);
      if (toolName === 'set_mood' && args.mood) setMood(args.mood as Mood);
      if (toolName === 'set_focus_mode' && typeof args.enabled === 'boolean') setFocusMode(args.enabled);
      if (toolName === 'save_profile_info' && args.field && args.value) { setUserProfile({ [args.field]: args.value }); }
      if (toolName === 'save_memory') {
        const memParts: string[] = [];
        if (args.userName) { saveMemory({ userName: args.userName }); setPersonalityUserName(personality as PersonalityKey, args.userName); memParts.push(args.userName); }
        if (args.fact) { addFact(args.fact); addPersonalityFact(personality as PersonalityKey, args.fact); memParts.push(args.fact); }
        if (args.preference) { addFact(`Preferência: ${args.preference}`); addPersonalityFact(personality as PersonalityKey, `Preferência: ${args.preference}`); memParts.push(args.preference); }
        if (args.note) { addFact(`Nota: ${args.note}`); addPersonalityFact(personality as PersonalityKey, `Nota: ${args.note}`); memParts.push(args.note); }
        if (memParts.length > 0) {
          const label = memParts[0].length > 48 ? memParts[0].substring(0, 48) + '…' : memParts[0];
          setMemoryToast(label);
          setTimeout(() => setMemoryToast(null), 3500);
        }
      }
      if (toolName === 'add_important_date' && args.label && args.date) { addImportantDate({ label: args.label, date: args.date, year: args.year }); }
      if (toolName === 'write_diary' && args.content) { addDiaryEntry(args.content, mood); }
      if (toolName === 'update_workspace' && args.content) { updateWorkspace(args.content); setScreen('workspace'); }
      if (toolName === 'clear_workspace') { clearWorkspace(); }
      if (toolName === 'save_semantic_fact' && args.concept && args.definition && args.category) { handleSaveSemanticFact(args.concept, args.definition, args.category); }
      if (toolName === 'search_semantic_memory' && args.query) { searchSemanticMemory(args.query).then(res => sendLiveMessage(`RESULTADO DA BUSCA SEMÂNTICA: ${JSON.stringify(res)}`)); }
      if (toolName === 'save_conversation_summary' && args.summary && args.topics) { handleSaveSummary(args.summary, args.topics); }
      if (toolName === 'search_web_start') { setIsSearching(true); setWebSearchResult(null); }
      if (toolName === 'search_web' && args.result) {
        setIsSearching(false);
        const q = (args.query as string) || '';
        const label = q.length > 44 ? q.substring(0, 44) + '…' : q;
        setWebSearchResult(label);
        setTimeout(() => setWebSearchResult(null), 5000);
      }
      if (toolName === 'control_device' && args.result) {
        const { success, device, devices, error } = args.result;
        if (success) {
          const label = args.action === 'list' ? `🏠 ${devices}` : `🏠 ${device}: ${args.action === 'on' ? 'ligado ✓' : args.action === 'off' ? 'desligado ✓' : args.action + ' ✓'}`;
          setSmartHomeStatus(label);
        } else { setSmartHomeStatus(`❌ ${error}`); }
        setTimeout(() => setSmartHomeStatus(null), 5000);
      }
      if (toolName === 'send_whatsapp' && args.message) { const to = args.contact || args.contact_name || myWhatsappNumber; setWhatsappStatus(`📤 Enviando para ${to}...`); setTimeout(() => setWhatsappStatus(null), 4000); }
      if (toolName === 'send_whatsapp_audio' && args.text) { const to = args.contact || args.contact_name || myWhatsappNumber; setWhatsappStatus(`🎙️ Enviando áudio para ${to}...`); setTimeout(() => setWhatsappStatus(null), 5000); }
      if (toolName === 'send_whatsapp_image' && args.imageUrl) { const to = args.contact || args.contact_name || myWhatsappNumber; setWhatsappStatus(`🖼️ Enviando imagem para ${to}...`); setTimeout(() => setWhatsappStatus(null), 5000); }
    }
  });

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isPdf   = file.type === 'application/pdf';
    if (!isImage && !isPdf) { sendLiveMessage(`❌ Formato não suportado: "${file.type}". Envie imagens JPEG, PNG ou WEBP, ou documentos PDF.`); return; }
    const MAX_BYTES = 4 * 1024 * 1024;
    if (file.size > MAX_BYTES) { sendLiveMessage(`❌ Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 4 MB.`); return; }
    if (!isConnected) { if (onboardingStep === 'initial') setOnboardingStep('completed'); setIsMuted(false); await connect(systemInstruction); await new Promise(r => setTimeout(r, 1500)); }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Falha ao ler o arquivo'));
      reader.readAsDataURL(file);
    });
    const base64 = dataUrl.split(',')[1];
    setAttachPreview({ type: file.type, name: file.name, data: dataUrl });
    setTimeout(() => setAttachPreview(null), 6000);
    setIsThinking(true);
    try {
      if (!isConnected) { await connect(systemInstruction); await new Promise(r => setTimeout(r, 1200)); }
      if (isImage) {
        await sendFile(base64, file.type, `[PVCO] Protocolo de análise visual ativado. Descreva brevemente o que vê nesta imagem antes de responder. Identifique todos os elementos relevantes. Se houver texto, código, erro, produto, monumento ou qualquer elemento desconhecido, use search_web para buscar contexto antes de responder.`);
      } else {
        await sendFile(base64, 'application/pdf', `Leia e resuma este documento PDF. Destaque os pontos principais, estrutura e informações mais relevantes.`);
      }
    } catch (err: any) {
      setIsThinking(false);
      sendLiveMessage(`❌ Falha na análise visual: ${err?.message ?? 'erro desconhecido'}`);
    }
  }, [sendLiveMessage, sendFile, isConnected, connect, systemInstruction, onboardingStep, setOnboardingStep, setIsThinking]);

  useEffect(() => {
    if (!showAttachMenu) return;
    const handler = () => setShowAttachMenu(false);
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [showAttachMenu]);

  const onManualVoiceChange = (v: VoiceName) => handleVoiceChange(v, isConnected, disconnect, connect);

  const handlePersonalityChange = useCallback(async (newPersonality: Personality) => {
    setPersonality(newPersonality);
    setShowPersonalityPicker(false);
    const config = PERSONALITY_CONFIG[newPersonality];
    setVoice(config.voice);
    if (isConnected) {
      disconnect(true);
      await new Promise(r => setTimeout(r, 600));
      await connect(
        newPersonality === 'ezer' ? getEzerInstruction(memory, focusMode) :
        newPersonality === 'samuel' ? getSamuelInstruction(memory, focusMode) :
        newPersonality === 'jonas' ? getJonasInstruction(memory, focusMode) :
        getSystemInstruction(assistantName, memory, mood, focusMode, upcomingDates, voice)
      );
    }
  }, [isConnected, disconnect, connect, memory, focusMode, mood, assistantName, upcomingDates, voice, setVoice]);

  const handleOrbClick = async () => {
    if (isConnected) { disconnect(); }
    else {
      if (onboardingStep === 'initial') setOnboardingStep('completed');
      setIsMuted(false);
      await connect(systemInstruction);
      setTimeout(() => sendLiveMessage(PERSONALITY_CONFIG[personality].greeting), 2500);
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (inputText.trim()) { sendMessage(inputText); setInputText(''); }
  };

  const handleScreenShare = useCallback(async () => {
    if (!isConnected) { if (onboardingStep === 'initial') setOnboardingStep('completed'); setIsMuted(false); await connect(systemInstruction); await new Promise(r => setTimeout(r, 1500)); }
    await startScreenSharing();
    setIsScreenSharing(true);
  }, [isConnected, connect, systemInstruction, startScreenSharing, onboardingStep, setOnboardingStep]);

  const handleMicToggle = useCallback(() => {
    if (isConnected) setIsMuted(!isMuted);
    else connect(systemInstruction);
  }, [isConnected, isMuted, connect, systemInstruction]);

  // Nível 1: ElevenLabs fala → orb anima como se estivesse "falando"
  const effectiveSpeaking = voiceLevel === 1 ? elevenSpeaking : isSpeaking;
  const statusLabel = isThinking ? 'Pensando...' : effectiveSpeaking ? 'Falando...' : (isConnected && isMuted) ? 'Microfone Silenciado' : isListening ? 'Ouvindo...' : isConnected ? 'Toque para desligar' : 'Toque para ativar';

  const layoutProps = {
    moodColor, mood, personality,
    MOOD_CONFIG, PERSONALITY_CONFIG,
    statusLabel,
    isConnected, isSpeaking: effectiveSpeaking, isListening, isThinking, isMuted, volume,
    messages: firebaseMessages,
    transcriptRef,
    memory,
    assistantName,
    inputText, setInputText,
    onSendText: handleSendText,
    onMicToggle: handleMicToggle,
    onDisconnect: () => disconnect(),
    fileInputRef,
    showAttachMenu, setShowAttachMenu,
    onFileClick: () => fileInputRef.current?.click(),
    onScreenShare: handleScreenShare,
    onOrbClick: handleOrbClick,
    currentTime, systemMetrics,
    focusMode, onFocusModeToggle: () => setFocusMode(!focusMode),
    isAmbientEnabled, onAmbientToggle: () => setIsAmbientEnabled(!isAmbientEnabled),
    onOpenMenu: () => setIsMenuOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenMoodSettings: () => { setActiveSettingsTab('personality'); setIsSettingsOpen(true); },
    onOpenPersonalityPicker: () => setShowPersonalityPicker(true),
    onOpenWorkspace: () => setScreen('workspace'),
    onRestart: () => setIsRestarting(true),
    showInstallBanner, onDismissInstallBanner: () => setShowInstallBanner(false),
    installPrompt, isInstalled, onInstallApp: handleInstallApp,
  };

  const switchInterface = useCallback((dir: 1 | -1) => {
    const next = Math.max(0, Math.min(2, interfaceMode + dir));
    if (next !== interfaceMode) { setSwipeDir(dir); setInterfaceMode(next); }
  }, [interfaceMode]);

  return (
    <div
      className="fixed inset-0 overflow-hidden select-none"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={(e) => { swipeStartX.current = e.touches[0].clientX; swipeStartY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const dy = e.changedTouches[0].clientY - swipeStartY.current;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
        switchInterface(dx < 0 ? 1 : -1);
      }}
      onPointerDown={(e) => { swipeStartX.current = e.clientX; swipeStartY.current = e.clientY; }}
      onPointerUp={(e) => {
        const dx = e.clientX - swipeStartX.current;
        const dy = e.clientY - swipeStartY.current;
        if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
        switchInterface(dx < 0 ? 1 : -1);
      }}
    >
      {onboardingStep === 'supernova' && <Supernova onComplete={() => { setOnboardingStep('completed'); connect(systemInstruction); setTimeout(() => sendLiveMessage("Oi, estou aqui."), 2500); }} />}
      <Mascot onToggleVoice={handleOrbClick} />

      <AnimatePresence mode="wait">
        <motion.div
          key={`layout-${interfaceMode}`}
          initial={{ x: swipeDir * 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: swipeDir * -300, opacity: 0 }}
          transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          className="fixed inset-0"
        >
          {interfaceMode === 0 && <DefaultLayout {...layoutProps} />}
          {interfaceMode === 1 && <OrbLayout {...layoutProps} />}
          {interfaceMode === 2 && <NeuralLayout {...layoutProps} />}
        </motion.div>
      </AnimatePresence>

      <div className="interface-dots" onClick={(e) => e.stopPropagation()}>
        {[0, 1, 2].map(i => (
          <button
            key={i}
            onClick={() => { setSwipeDir(i > interfaceMode ? 1 : -1); setInterfaceMode(i); }}
            className="rounded-full transition-all duration-300 focus:outline-none"
            style={{
              width: interfaceMode === i ? 16 : 6,
              height: 6,
              backgroundColor: interfaceMode === i ? moodColor : 'rgba(255,255,255,0.25)',
              padding: 0,
              border: 'none',
              cursor: interfaceMode === i ? 'default' : 'pointer',
            }}
          />
        ))}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />

      {(memory.facts?.length > 0 || memory.userName) && (
        <div
          className="fixed top-4 right-4 z-[55] flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ backgroundColor: 'rgba(168,132,80,0.12)', border: '1px solid rgba(168,132,80,0.22)', backdropFilter: 'blur(8px)' }}
          title={`${memory.facts?.length ?? 0} memórias salvas${memory.userName ? ` · ${memory.userName}` : ''}`}
        >
          <span style={{ fontSize: 9 }}>📝</span>
          <span style={{ fontSize: 9, color: 'rgba(220,190,130,0.7)', letterSpacing: '0.05em' }}>{memory.facts?.length ?? 0}</span>
        </div>
      )}

      <AnimatePresence>
        {smartHomeStatus && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-44 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
            style={{ backgroundColor: '#4ecdc415', border: '1px solid #4ecdc430', color: '#4ecdc4' }}>
            {smartHomeStatus}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {whatsappStatus && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-2xl text-xs text-center max-w-xs"
            style={{ backgroundColor: '#25D36615', border: '1px solid #25D36630', color: '#25D366' }}>
            {whatsappStatus}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {memoryToast && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            className="fixed bottom-44 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2 rounded-2xl text-xs max-w-[280px]"
            style={{ backgroundColor: 'rgba(168,132,80,0.15)', border: '1px solid rgba(168,132,80,0.30)', color: 'rgba(220,190,130,0.9)' }}>
            <span style={{ fontSize: 13 }}>📝</span>
            <span className="truncate">Memorizado: {memoryToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {(isSearching || webSearchResult) && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.95 }}
            className="fixed bottom-56 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 px-4 py-2 rounded-2xl text-xs max-w-[300px]"
            style={{ backgroundColor: `${moodColor}18`, border: `1px solid ${moodColor}35`, color: moodColor }}>
            {isSearching ? (
              <>
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }} style={{ display: 'inline-block', fontSize: 13 }}>⟳</motion.span>
                <span>Pesquisando na internet…</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 13 }}>🔍</span>
                <span className="truncate">Pesquisei: {webSearchResult}</span>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isShowingLyrics && lyrics.length > 0 && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm text-center px-6 py-8 rounded-3xl border shadow-2xl backdrop-blur-xl"
            style={{ backgroundColor: `${moodColor}20`, borderColor: `${moodColor}50` }}>
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-[0.3em] font-medium" style={{ color: moodColor }}>♪ Cantando</span>
            </div>
            <AnimatePresence mode="wait">
              <motion.p key={currentLyricLine} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="text-xl font-light leading-relaxed" style={{ color: '#FFFFFF', textShadow: `0 0 20px ${moodColor}50` }}>
                {lyrics[currentLyricLine]}
              </motion.p>
            </AnimatePresence>
            <div className="flex justify-center gap-1.5 mt-6">
              {lyrics.map((_, i) => (
                <div key={i} className="w-1.5 h-1.5 rounded-full transition-all duration-500"
                  style={{ backgroundColor: i === currentLyricLine ? moodColor : `${moodColor}30`, transform: i === currentLyricLine ? 'scale(1.2)' : 'scale(1)' }} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachPreview && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-3 rounded-2xl border max-w-xs w-full"
            style={{ backgroundColor: `${moodColor}15`, borderColor: `${moodColor}30` }}>
            {attachPreview.type.startsWith('image/') ? (
              <img src={attachPreview.data} alt="preview" className="w-10 h-10 rounded-lg object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ backgroundColor: `${moodColor}20` }}>
                {attachPreview.type === 'application/pdf' ? '📄' : '📝'}
              </div>
            )}
            <div>
              <p className="text-xs font-medium" style={{ color: moodColor }}>{attachPreview.name}</p>
              <p className="text-[10px] text-white/30">Enviado para análise</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed top-40 left-1/2 -translate-x-1/2 z-[70] bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-3 text-center max-w-xs w-full">
            <p className="text-red-400 text-xs mb-2">{error}</p>
            <button onClick={() => setError(null)} className="text-[10px] uppercase tracking-widest text-white/30 hover:text-white">Limpar</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HAMBURGER MENU */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMenuOpen(false)}
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-end justify-center">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#151010] border-t border-white/5 rounded-t-3xl p-6 space-y-2"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-4" />
              <button onClick={() => { setScreen('history'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}><History size={20} style={{ color: moodColor }} /></div>
                <div className="text-left"><p className="text-sm font-medium">Histórico</p><p className="text-[10px] text-white/30">Conversas anteriores</p></div>
              </button>
              <button onClick={() => { setScreen('diary'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}><BookOpen size={20} style={{ color: moodColor }} /></div>
                <div className="text-left"><p className="text-sm font-medium">Diário</p><p className="text-[10px] text-white/30">Reflexões de {assistantName}</p></div>
              </button>
              <button onClick={() => { setScreen('workspace'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}><FileText size={20} style={{ color: moodColor }} /></div>
                <div className="text-left"><p className="text-sm font-medium">Área de Trabalho</p><p className="text-[10px] text-white/30">Textos e códigos gerados</p></div>
              </button>
              <button onClick={() => { setIsMascotVisible(!isMascotVisible); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}><span className="text-xl">👾</span></div>
                <div className="text-left"><p className="text-sm font-medium">Mascote</p><p className="text-[10px] text-white/30">{isMascotVisible ? 'Visível' : 'Oculto'}</p></div>
              </button>
              <button onClick={() => { setScreen('skills'); setIsMenuOpen(false); }} className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all hover:bg-white/5">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${moodColor}20` }}><span className="text-xl">⚡</span></div>
                <div className="text-left">
                  <p className="text-sm font-medium">Loja de Agentes</p>
                  <p className="text-[10px] text-white/30">{customSkills.filter((s: CustomSkill) => s.active).length > 0 ? `${customSkills.filter((s: CustomSkill) => s.active).length} ativa(s) · Agente Infinito` : 'Instale superpoderes prontos'}</p>
                </div>
                {customSkills.filter((s: CustomSkill) => s.active).length > 0 && (
                  <div className="ml-auto w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HISTORY SCREEN */}
      <AnimatePresence>
        {screen === 'history' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center gap-4 border-b border-white/5">
              <button onClick={() => setScreen('main')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
              <h2 className="text-sm font-medium tracking-widest uppercase">Histórico</h2>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => { if (confirm('Apagar TODO o histórico? Esta ação não pode ser desfeita.')) { deleteAllMessages(); } }}
                  className="p-2 rounded-full hover:bg-red-500/20 transition-all" style={{ color: 'rgba(255,255,255,0.3)' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {firebaseMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20">
                  <History size={40} /><p className="text-sm uppercase tracking-widest">Nenhuma conversa ainda</p>
                </div>
              ) : firebaseMessages.map((msg, i) => {
                const cleanText = msg.text.replace(/\*\*[^*]+\*\*\s*/g, '').trim();
                if (!cleanText) return null;
                return (
                  <motion.div key={msg.id || i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}
                    className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                    style={msg.role === 'user'
                      ? { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', marginLeft: '2rem' }
                      : { backgroundColor: `${moodColor}0D`, border: `1px solid ${moodColor}20`, marginRight: '2rem' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[9px] uppercase tracking-widest opacity-30">{msg.role === 'user' ? (memory.userName || 'Você') : assistantName}</span>
                      {msg.createdAt && <span className="text-[9px] opacity-20">{new Date(msg.createdAt.seconds * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                    <p className="opacity-70">{cleanText}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DIARY SCREEN */}
      <AnimatePresence>
        {screen === 'diary' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center gap-4 border-b border-white/5">
              <button onClick={() => setScreen('main')} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
              <h2 className="text-sm font-medium tracking-widest uppercase">Diário de {assistantName}</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {diary.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20">
                  <BookOpen size={40} /><p className="text-sm uppercase tracking-widest">Nenhuma entrada ainda</p>
                  <p className="text-xs text-center opacity-60">Converse com {assistantName} e ela escreverá seus pensamentos aqui</p>
                </div>
              ) : diary.map((entry, i) => (
                <motion.div key={entry.id || i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  className="p-5 rounded-3xl border space-y-2" style={{ backgroundColor: `${moodColor}08`, borderColor: `${moodColor}20` }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">{entry.mood ? MOOD_CONFIG[entry.mood as Mood]?.emoji || '📝' : '📝'}</span>
                    {entry.createdAt && (
                      <span className="text-[10px] opacity-30">
                        {new Date(entry.createdAt.seconds ? entry.createdAt.seconds * 1000 : entry.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  <p className="text-sm leading-relaxed opacity-70 italic">"{entry.content}"</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* OPERATOR MODE FLOATING PANEL */}
      <AnimatePresence>
        {operatorMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[200] rounded-2xl border overflow-hidden"
            style={{ backgroundColor: '#0d0808', borderColor: `${moodColor}40` }}>
            <div className="px-4 py-3 flex items-center gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-widest text-amber-400">Modo Operador Ativo</p>
                  {operatorTask && <p className="text-xs text-white/60 truncate mt-0.5">{operatorTask}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-center">
                  <p className="text-xs font-mono font-medium">{operatorSteps}</p>
                  <p className="text-[8px] text-white/30">/{operatorMaxSteps}</p>
                </div>
                <button onClick={() => resetOperator()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] uppercase tracking-widest hover:bg-red-500/30 transition-all">
                  <StopCircle size={12} /> Parar
                </button>
              </div>
            </div>
            {operatorSteps > 0 && (
              <div className="h-1 bg-white/5">
                <div className="h-full transition-all" style={{ width: `${(operatorSteps / operatorMaxSteps) * 100}%`, backgroundColor: operatorSteps > 40 ? '#f87171' : moodColor }} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* WORKSPACE DEV ENVIRONMENT */}
      <AnimatePresence>
        {screen === 'workspace' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-4 flex items-center gap-2 border-b border-white/5 shrink-0">
              <button onClick={() => { setScreen('main'); setPlayMode(false); }} className="p-2 hover:bg-white/5 rounded-full shrink-0"><ChevronLeft size={20} /></button>
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <Code size={15} className="opacity-40 shrink-0" />
                <span className="text-sm font-medium tracking-widest uppercase truncate">Dev Workspace</span>
              </div>
              <div className="flex bg-white/5 rounded-xl p-0.5 shrink-0">
                <button onClick={() => { setWorkspaceTab('text'); setPlayMode(false); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest transition-all"
                  style={{ backgroundColor: workspaceTab === 'text' ? `${moodColor}20` : 'transparent', color: workspaceTab === 'text' ? moodColor : 'rgba(255,255,255,0.4)' }}>
                  Texto
                </button>
                <button onClick={() => { setWorkspaceTab('files'); setPlayMode(false); }}
                  className="px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-widest transition-all"
                  style={{ backgroundColor: workspaceTab === 'files' ? `${moodColor}20` : 'transparent', color: workspaceTab === 'files' ? moodColor : 'rgba(255,255,255,0.4)' }}>
                  Projeto
                </button>
              </div>
            </div>

            {workspaceTab === 'text' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
                  <button onClick={() => {
                    if (!workspaceEditing) { setWorkspaceEditContent(memory.workspace || ''); }
                    else { updateWorkspace(workspaceEditContent); }
                    setWorkspaceEditing(!workspaceEditing);
                    setPlayMode(false);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                    style={{ backgroundColor: workspaceEditing ? `${moodColor}25` : 'rgba(255,255,255,0.05)', color: workspaceEditing ? moodColor : 'rgba(255,255,255,0.5)', border: `1px solid ${workspaceEditing ? moodColor+'40' : 'rgba(255,255,255,0.05)'}` }}>
                    <Edit3 size={11} /> {workspaceEditing ? 'Salvar' : 'Editar'}
                  </button>
                  {memory.workspace && !workspaceEditing && (
                    <button onClick={() => setPlayMode(!playMode)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                      style={{ backgroundColor: playMode ? '#22c55e20' : 'rgba(255,255,255,0.05)', color: playMode ? '#22c55e' : 'rgba(255,255,255,0.5)', border: `1px solid ${playMode ? '#22c55e40' : 'rgba(255,255,255,0.05)'}` }}>
                      <Play size={11} /> {playMode ? 'Fechar' : 'Executar'}
                    </button>
                  )}
                  {memory.workspace && !workspaceEditing && (
                    <button
                      onClick={() => {
                        if (elevenSpeaking) { elevenStop(); return; }
                        if (elevenLabsApiKey && elevenLabsVoiceId) {
                          elevenSpeak(memory.workspace || '');
                        } else {
                          window.speechSynthesis.cancel();
                          const u = new SpeechSynthesisUtterance(memory.workspace || '');
                          u.lang = 'pt-BR'; u.rate = 1.0;
                          window.speechSynthesis.speak(u);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] uppercase tracking-widest transition-all"
                      style={{ backgroundColor: elevenSpeaking ? `${moodColor}25` : 'rgba(255,255,255,0.05)', color: elevenSpeaking ? moodColor : 'rgba(255,255,255,0.5)', border: `1px solid ${elevenSpeaking ? moodColor+'40' : 'rgba(255,255,255,0.05)'}` }}>
                      <Volume2 size={11} /> {elevenSpeaking ? 'Parar' : 'Narrar'}
                    </button>
                  )}
                  <div className="flex-1" />
                  {memory.workspace && (
                    <button onClick={() => { navigator.clipboard.writeText(memory.workspace || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] transition-all opacity-50 hover:opacity-80">
                      <Copy size={11} /> {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  )}
                  {memory.workspace && (
                    <button onClick={() => {
                      const ext = memory.workspace?.trimStart().startsWith('<') ? 'html' : memory.workspace?.trimStart().startsWith('def ') || memory.workspace?.trimStart().startsWith('import ') ? 'py' : 'txt';
                      const blob = new Blob([memory.workspace || ''], { type: 'text/plain' });
                      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `workspace.${ext}`; a.click();
                    }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] transition-all opacity-50 hover:opacity-80">
                      <Download size={11} /> Baixar
                    </button>
                  )}
                </div>
                {playMode && memory.workspace && (
                  <div className="shrink-0 border-b border-white/10 relative" style={{ height: '45vh' }}>
                    <button
                      onClick={() => setPreviewFullscreen(true)}
                      className="absolute top-2 right-2 z-10 p-1.5 rounded-lg backdrop-blur-sm transition-all hover:scale-110"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.8)' }}
                      title="Tela cheia"
                    >
                      <Maximize2 size={14} />
                    </button>
                    <iframe
                      srcDoc={getPreviewSrc(memory.workspace || '')}
                      className="w-full h-full bg-white"
                      sandbox="allow-scripts allow-same-origin"
                      title="Preview"
                    />
                  </div>
                )}

                {/* FULLSCREEN PREVIEW PORTAL */}
                {previewFullscreen && playMode && memory.workspace && createPortal(
                  <div className="fixed inset-0 z-[9999] bg-black flex flex-col">
                    <button
                      onClick={() => setPreviewFullscreen(false)}
                      className="absolute top-3 right-3 z-10 p-2 rounded-lg"
                      style={{ backgroundColor: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                    >
                      <Minimize2 size={16} />
                    </button>
                    <iframe
                      srcDoc={getPreviewSrc(memory.workspace || '')}
                      className="w-full h-full"
                      sandbox="allow-scripts allow-same-origin"
                      title="Preview Fullscreen"
                    />
                  </div>,
                  document.body
                )}
                <div className="flex-1 overflow-hidden">
                  {workspaceEditing ? (
                    <textarea
                      value={workspaceEditContent}
                      onChange={e => setWorkspaceEditContent(e.target.value)}
                      className="w-full h-full p-6 bg-transparent text-sm font-mono leading-relaxed resize-none focus:outline-none text-white/80"
                      placeholder="Escreva seu código aqui..."
                      spellCheck={false}
                    />
                  ) : memory.workspace ? (
                    <pre className="w-full h-full p-6 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words text-white/80 overflow-y-auto">{memory.workspace}</pre>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-20">
                      <Code size={40} />
                      <p className="text-sm uppercase tracking-widest">Workspace vazio</p>
                      <p className="text-xs text-center max-w-[200px]">Peça para {assistantName} gerar um código ou HTML</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {workspaceTab === 'files' && (() => {
              const findFile = (nodes: WorkspaceFile[], id: string): WorkspaceFile | null => {
                for (const n of nodes) {
                  if (n.id === id) return n;
                  if (n.children) { const f = findFile(n.children, id); if (f) return f; }
                }
                return null;
              };
              const selectedFile = selectedFileId ? findFile(workspaceFiles, selectedFileId) : null;
              const renderTree = (nodes: WorkspaceFile[], depth = 0): React.ReactNode =>
                nodes.map(node => (
                  <div key={node.id}>
                    <div
                      className="flex items-center gap-1.5 py-1.5 px-2 rounded-lg cursor-pointer hover:bg-white/5 transition-all group"
                      style={{ paddingLeft: `${8 + depth * 16}px`, backgroundColor: selectedFileId === node.id ? `${moodColor}15` : undefined }}
                      onClick={() => { if (node.type === 'folder') toggleWorkspaceFolder(node.id); else setSelectedFileId(node.id); }}>
                      <span className="shrink-0">
                        {node.type === 'folder' ? (node.expanded ? <FolderOpen size={13} style={{ color: moodColor }} /> : <Folder size={13} className="opacity-50" />) : <File size={13} className="opacity-40" />}
                      </span>
                      {renamingId === node.id ? (
                        <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                          onBlur={() => { if (renameValue.trim()) updateWorkspaceFile(node.id, { name: renameValue.trim() }); setRenamingId(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') { if (renameValue.trim()) updateWorkspaceFile(node.id, { name: renameValue.trim() }); setRenamingId(null); } if (e.key === 'Escape') setRenamingId(null); }}
                          className="flex-1 bg-white/10 rounded px-1 text-xs focus:outline-none" onClick={e => e.stopPropagation()} />
                      ) : (
                        <span className="flex-1 text-xs truncate" style={{ color: selectedFileId === node.id ? moodColor : undefined }}>{node.name}</span>
                      )}
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
                        {node.type === 'folder' && (
                          <>
                            <button onClick={e => { e.stopPropagation(); setNewNodeParentId(node.id); setNewNodeType('file'); setNewNodeName(''); }}
                              className="p-0.5 hover:text-white/80 opacity-40 hover:opacity-100" title="Novo arquivo"><FilePlus size={10} /></button>
                            <button onClick={e => { e.stopPropagation(); setNewNodeParentId(node.id); setNewNodeType('folder'); setNewNodeName(''); }}
                              className="p-0.5 hover:text-white/80 opacity-40 hover:opacity-100" title="Nova pasta"><FolderPlus size={10} /></button>
                          </>
                        )}
                        {node.type === 'file' && (
                          <button onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(node.content || ''); }}
                            className="p-0.5 hover:text-white/80 opacity-40 hover:opacity-100" title="Copiar"><Copy size={10} /></button>
                        )}
                        <button onClick={e => { e.stopPropagation(); setRenamingId(node.id); setRenameValue(node.name); }}
                          className="p-0.5 hover:text-white/80 opacity-40 hover:opacity-100" title="Renomear"><Edit3 size={10} /></button>
                        <button onClick={e => { e.stopPropagation(); if (confirm(`Excluir "${node.name}"?`)) { deleteWorkspaceFile(node.id); if (selectedFileId === node.id) setSelectedFileId(null); } }}
                          className="p-0.5 text-red-400/40 hover:text-red-400 opacity-40 hover:opacity-100" title="Excluir"><X size={10} /></button>
                      </div>
                    </div>
                    {node.type === 'folder' && node.expanded && node.children && renderTree(node.children, depth + 1)}
                    {newNodeParentId === node.id && node.type === 'folder' && (
                      <div className="flex items-center gap-1.5 py-1" style={{ paddingLeft: `${8 + (depth + 1) * 16}px` }}>
                        {newNodeType === 'file' ? <File size={12} className="opacity-40" /> : <Folder size={12} className="opacity-40" />}
                        <input autoFocus value={newNodeName} onChange={e => setNewNodeName(e.target.value)}
                          placeholder={newNodeType === 'file' ? 'arquivo.js' : 'pasta'}
                          className="flex-1 bg-white/10 rounded px-2 py-0.5 text-xs focus:outline-none"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newNodeName.trim()) {
                              addWorkspaceFile(newNodeParentId, { id: crypto.randomUUID(), name: newNodeName.trim(), type: newNodeType, content: '', children: newNodeType === 'folder' ? [] : undefined, expanded: false });
                              setNewNodeParentId(null); setNewNodeName('');
                            }
                            if (e.key === 'Escape') { setNewNodeParentId(null); setNewNodeName(''); }
                          }}
                          onBlur={() => { setNewNodeParentId(null); setNewNodeName(''); }}
                        />
                      </div>
                    )}
                  </div>
                ));

              return (
                <div className="flex-1 flex overflow-hidden">
                  <div className="w-48 border-r border-white/5 flex flex-col shrink-0">
                    <div className="px-3 py-2 border-b border-white/5">
                      <input
                        value={workspaceProjectName}
                        onChange={e => setWorkspaceProjectName(e.target.value)}
                        placeholder="Nome do projeto"
                        className="w-full bg-transparent text-[10px] uppercase tracking-widest text-white/40 focus:outline-none focus:text-white/80 transition-all placeholder:text-white/20"
                      />
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5">
                      <button onClick={() => { setNewNodeParentId(null); setNewNodeType('file'); setNewNodeName(''); }}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[9px] uppercase tracking-widest hover:bg-white/5 opacity-50 hover:opacity-80 transition-all">
                        <FilePlus size={11} /> Arquivo
                      </button>
                      <button onClick={() => { setNewNodeParentId(null); setNewNodeType('folder'); setNewNodeName(''); }}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded-lg text-[9px] uppercase tracking-widest hover:bg-white/5 opacity-50 hover:opacity-80 transition-all">
                        <FolderPlus size={11} /> Pasta
                      </button>
                      {workspaceFiles.length > 0 && (
                        <button onClick={() => {
                          const downloadAll = (nodes: WorkspaceFile[], prefix = '') => {
                            nodes.forEach(n => {
                              if (n.type === 'file' && n.content != null) {
                                const blob = new Blob([n.content], { type: 'text/plain' });
                                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = prefix + n.name; a.click();
                              }
                              if (n.type === 'folder' && n.children) downloadAll(n.children, prefix + n.name + '/');
                            });
                          };
                          downloadAll(workspaceFiles);
                        }}
                          className="p-1 rounded-lg hover:bg-white/5 opacity-40 hover:opacity-70 transition-all" title="Baixar todos">
                          <Download size={11} />
                        </button>
                      )}
                    </div>
                    {newNodeParentId === null && newNodeType && (
                      <div className="flex items-center gap-1.5 px-3 py-1">
                        {newNodeType === 'file' ? <File size={12} className="opacity-40" /> : <Folder size={12} className="opacity-40" />}
                        <input autoFocus value={newNodeName} onChange={e => setNewNodeName(e.target.value)}
                          placeholder={newNodeType === 'file' ? 'arquivo.js' : 'minha-pasta'}
                          className="flex-1 bg-white/10 rounded px-2 py-0.5 text-xs focus:outline-none"
                          onKeyDown={e => {
                            if (e.key === 'Enter' && newNodeName.trim()) {
                              addWorkspaceFile(null, { id: crypto.randomUUID(), name: newNodeName.trim(), type: newNodeType, content: '', children: newNodeType === 'folder' ? [] : undefined, expanded: false });
                              setNewNodeParentId('_done_'); setNewNodeName('');
                            }
                            if (e.key === 'Escape') { setNewNodeParentId('_done_'); setNewNodeName(''); }
                          }}
                          onBlur={() => { setNewNodeParentId('_done_'); setNewNodeName(''); }}
                        />
                      </div>
                    )}
                    <div className="flex-1 overflow-y-auto py-1 px-1">
                      {workspaceFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-2 opacity-20 p-4">
                          <FolderPlus size={24} />
                          <p className="text-[9px] text-center uppercase tracking-widest">Crie pastas e arquivos</p>
                        </div>
                      ) : renderTree(workspaceFiles)}
                    </div>
                  </div>
                  <div className="flex-1 flex flex-col overflow-hidden">
                    {selectedFile && selectedFile.type === 'file' ? (
                      <>
                        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 shrink-0">
                          <File size={12} className="opacity-40" />
                          <span className="text-xs opacity-60 font-mono">{selectedFile.name}</span>
                          <div className="flex-1" />
                          <button onClick={() => navigator.clipboard.writeText(selectedFile.content || '')}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] opacity-40 hover:opacity-70 hover:bg-white/5 transition-all">
                            <Copy size={10} /> Copiar
                          </button>
                          {(() => {
                            const code = selectedFile.content || '';
                            const isRunnable = /<html|<!DOCTYPE|<script|<style/i.test(code) || /three|THREE/i.test(code) || (code.includes('function') && !code.includes('def '));
                            return isRunnable ? (
                              <button onClick={() => setPlayMode(!playMode)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] transition-all"
                                style={{ backgroundColor: playMode ? '#22c55e20' : 'rgba(255,255,255,0.05)', color: playMode ? '#22c55e' : 'rgba(255,255,255,0.5)' }}>
                                <Play size={10} /> {playMode ? 'Fechar' : 'Executar'}
                              </button>
                            ) : null;
                          })()}
                          <button onClick={() => {
                            const blob = new Blob([selectedFile.content || ''], { type: 'text/plain' });
                            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = selectedFile.name; a.click();
                          }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] opacity-40 hover:opacity-70 hover:bg-white/5 transition-all">
                            <Download size={10} /> Baixar
                          </button>
                        </div>
                        {playMode && (() => {
                          const code = selectedFile.content || '';
                          const hasThree = /three|THREE/i.test(code);
                          const srcDoc = /<html|<!DOCTYPE/i.test(code) ? code
                            : hasThree ? `<!DOCTYPE html><html><head><meta charset="utf-8"><script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script></head><body style="margin:0;background:#000"><script>${code}</script></body></html>`
                              : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{background:#0a0505;color:#e2e8f0;font-family:monospace;padding:20px;margin:0}</style></head><body><script>\ntry{\n${code}\n}catch(e){document.body.innerHTML='<pre style="color:#f87171">'+e.message+'</pre>';}\n</script></body></html>`;
                          return (
                            <div className="shrink-0" style={{ height: '40vh', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                              <iframe srcDoc={srcDoc} className="w-full h-full" sandbox="allow-scripts allow-same-origin" title="Preview" />
                            </div>
                          );
                        })()}
                        <textarea
                          value={selectedFile.content || ''}
                          onChange={e => updateWorkspaceFile(selectedFile.id, { content: e.target.value })}
                          className="flex-1 w-full p-4 bg-transparent text-xs font-mono leading-relaxed resize-none focus:outline-none text-white/80"
                          placeholder="// Escreva o código aqui..."
                          spellCheck={false}
                        />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-20">
                        <Eye size={32} />
                        <p className="text-xs uppercase tracking-widest">Selecione um arquivo</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* SKILLS / AGENT STORE SCREEN */}
      <AnimatePresence>
        {screen === 'skills' && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[100] bg-[#0a0505] flex flex-col">
            <div className="h-14 px-5 flex items-center justify-between border-b border-white/5 shrink-0">
              <div className="flex items-center gap-4">
                <button onClick={() => { setScreen('main'); setSkillDraft(null); }} className="p-2 hover:bg-white/5 rounded-full"><ChevronLeft size={20} /></button>
                <div>
                  <h2 className="text-sm font-medium tracking-widest uppercase">Loja de Agentes</h2>
                  {customSkills.filter((s: CustomSkill) => s.active).length > 0 && (
                    <p className="text-[9px] text-green-400 uppercase tracking-widest">Agente Infinito — {customSkills.filter((s: CustomSkill) => s.active).length} ativo(s)</p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex border-b border-white/5 shrink-0">
              {(['store', 'installed', 'custom'] as const).map(tab => (
                <button key={tab} onClick={() => { setSkillTab(tab); setSkillDraft(null); }}
                  className="flex-1 py-3 text-[10px] uppercase tracking-widest transition-all relative"
                  style={{ color: skillTab === tab ? moodColor : 'rgba(255,255,255,0.3)' }}>
                  {tab === 'store' ? `Loja (${CATALOG.length})` : tab === 'installed' ? `Instalados (${customSkills.length})` : '+ Custom'}
                  {skillTab === tab && <motion.div layoutId="skillTabIndicator" className="absolute bottom-0 left-0 right-0 h-[2px]" style={{ backgroundColor: moodColor }} />}
                </button>
              ))}
            </div>

            {skillTab === 'store' && (
              <div className="flex-1 overflow-y-auto">
                <div className="flex gap-2 p-4 pb-2 overflow-x-auto">
                  {Object.entries(CATALOG_CATEGORIES).map(([key, { label, icon }]) => (
                    <button key={key} onClick={() => setCatalogFilter(key)}
                      className="shrink-0 px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest transition-all whitespace-nowrap"
                      style={{
                        backgroundColor: catalogFilter === key ? `${moodColor}20` : 'rgba(255,255,255,0.03)',
                        color: catalogFilter === key ? moodColor : 'rgba(255,255,255,0.4)',
                        border: `1px solid ${catalogFilter === key ? `${moodColor}40` : 'rgba(255,255,255,0.05)'}`,
                      }}>
                      {icon} {label}
                    </button>
                  ))}
                </div>
                <div className="p-4 pt-2 space-y-2">
                  {(catalogFilter === 'popular'
                    ? CATALOG.filter(s => s.popular)
                    : CATALOG.filter(s => s.category === catalogFilter)
                  ).map((cat: CatalogSkill) => {
                    const isInstalled = customSkills.some((s: CustomSkill) => s.displayName === cat.displayName && s.webhookUrl === cat.webhookUrl);
                    return (
                      <motion.div key={cat.catalogId} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        className="p-4 rounded-2xl border transition-all"
                        style={{ borderColor: isInstalled ? `${moodColor}30` : 'rgba(255,255,255,0.05)', backgroundColor: isInstalled ? `${moodColor}05` : 'transparent' }}>
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{cat.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium">{cat.displayName}</p>
                              {cat.popular && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 uppercase">Popular</span>}
                            </div>
                            <p className="text-[10px] text-white/40 mt-0.5 line-clamp-2">{cat.description}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[9px] text-white/20">{cat.method}</span>
                              {cat.parameters.length > 0 && <span className="text-[9px] text-white/20">{cat.parameters.length} param(s)</span>}
                              <span className="text-[9px] text-white/15">por {cat.author}</span>
                            </div>
                          </div>
                          <button
                            disabled={isInstalled}
                            onClick={() => {
                              if (isInstalled) return;
                              addCustomSkill({ id: crypto.randomUUID(), displayName: cat.displayName, icon: cat.icon, description: cat.description, webhookUrl: cat.webhookUrl, method: cat.method, active: true, parameters: [...cat.parameters] });
                            }}
                            className="shrink-0 px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-medium transition-all"
                            style={{
                              backgroundColor: isInstalled ? 'rgba(255,255,255,0.03)' : `${moodColor}20`,
                              color: isInstalled ? 'rgba(255,255,255,0.3)' : moodColor,
                              border: `1px solid ${isInstalled ? 'rgba(255,255,255,0.05)' : `${moodColor}40`}`,
                            }}>
                            {isInstalled ? 'Instalado' : 'Instalar'}
                          </button>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            )}

            {skillTab === 'installed' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {customSkills.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-4 opacity-20">
                    <span className="text-5xl">⚡</span>
                    <p className="text-sm uppercase tracking-widest">Nenhum agente instalado</p>
                    <p className="text-xs text-center opacity-60">Vá para a Loja e instale agentes prontos com um clique.</p>
                  </div>
                )}
                {customSkills.map((skill: CustomSkill) => (
                  <motion.div key={skill.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center gap-3 p-4 rounded-2xl border transition-all"
                    style={{ backgroundColor: skill.active ? `${moodColor}08` : 'transparent', borderColor: skill.active ? `${moodColor}30` : 'rgba(255,255,255,0.05)' }}>
                    <span className="text-2xl">{skill.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{skill.displayName}</p>
                      <p className="text-[10px] text-white/30 truncate">{skill.description || skill.webhookUrl}</p>
                      {skill.parameters.length > 0 && <p className="text-[9px] text-white/20 mt-0.5">{skill.parameters.length} parâmetro(s)</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => { setSkillTab('custom'); setSkillDraft({ ...skill }); setShowAdvancedParams(false); }}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-all opacity-40 hover:opacity-70">
                        <span className="text-xs">✎</span>
                      </button>
                      <button onClick={() => toggleCustomSkill(skill.id)}
                        className="relative w-10 h-5 rounded-full transition-all"
                        style={{ backgroundColor: skill.active ? moodColor : 'rgba(255,255,255,0.1)' }}>
                        <span className="absolute top-0.5 transition-all rounded-full w-4 h-4 bg-white" style={{ left: skill.active ? '22px' : '2px' }} />
                      </button>
                      <button onClick={() => { if (confirm(`Remover "${skill.displayName}"?`)) removeCustomSkill(skill.id); }}
                        className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all opacity-30 hover:opacity-70">
                        <span className="text-xs text-red-400">✕</span>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {skillTab === 'custom' && (
              <div className="flex-1 overflow-y-auto p-4">
                {!skillDraft ? (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <span className="text-5xl opacity-20">🔧</span>
                    <p className="text-sm uppercase tracking-widest opacity-30">Habilidade Custom</p>
                    <p className="text-xs text-center opacity-20 max-w-[250px]">Conecte qualquer API, webhook ou n8n como superpoder da IA.</p>
                    <button onClick={() => { setSkillDraft({ displayName: '', icon: '⚡', description: '', webhookUrl: '', method: 'GET', active: true, parameters: [] }); setShowAdvancedParams(false); }}
                      className="mt-2 px-6 py-2.5 rounded-full text-[10px] uppercase tracking-widest font-medium transition-all"
                      style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
                      + Criar habilidade
                    </button>
                  </div>
                ) : (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] space-y-3">
                    <p className="text-[10px] uppercase tracking-widest opacity-40">{skillDraft.id ? 'Editar habilidade' : 'Nova habilidade custom'}</p>
                    <div className="flex gap-2">
                      <input value={skillDraft.icon || ''} onChange={e => setSkillDraft(d => ({ ...d, icon: e.target.value }))}
                        className="w-14 bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-center text-xl focus:outline-none focus:border-white/30" placeholder="⚡" maxLength={2} />
                      <input value={skillDraft.displayName || ''} onChange={e => setSkillDraft(d => ({ ...d, displayName: e.target.value }))}
                        placeholder="Nome (ex: Meu n8n Bot)" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30" />
                    </div>
                    <textarea value={skillDraft.description || ''} onChange={e => setSkillDraft(d => ({ ...d, description: e.target.value }))}
                      rows={2} placeholder="Quando a IA deve usar (ex: quando pedir cotação de moedas)"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/30 resize-none" />
                    <div className="flex gap-2">
                      <input value={skillDraft.webhookUrl || ''} onChange={e => setSkillDraft(d => ({ ...d, webhookUrl: e.target.value }))}
                        placeholder="https://api.com/{param} ou webhook URL" className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                      <select value={skillDraft.method || 'GET'} onChange={e => setSkillDraft(d => ({ ...d, method: e.target.value as 'GET' | 'POST' }))}
                        className="bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-white/30">
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                      </select>
                    </div>
                    <p className="text-[9px] text-white/20">Dica: use {'{param}'} na URL para parâmetros dinâmicos</p>
                    <button onClick={() => setShowAdvancedParams(v => !v)} className="text-[10px] text-white/30 hover:text-white/60 transition-all">
                      {showAdvancedParams ? '▲' : '▶'} Parâmetros ({skillDraft.parameters?.length || 0})
                    </button>
                    {showAdvancedParams && (
                      <div className="space-y-2 pl-3 border-l border-white/10">
                        {(skillDraft.parameters || []).map((p, i) => (
                          <div key={i} className="flex items-center gap-2 text-[10px]">
                            <span className="font-mono text-white/60 flex-1">{p.name}</span>
                            <span className="opacity-40 flex-1 truncate">{p.description}</span>
                            <span className="opacity-30">{p.type}</span>
                            <button onClick={() => setSkillDraft(d => ({ ...d, parameters: (d.parameters||[]).filter((_,j)=>j!==i) }))}
                              className="text-red-400/50 hover:text-red-400 px-1">✕</button>
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <input value={skillParamDraft.name} onChange={e => setSkillParamDraft(p => ({ ...p, name: e.target.value }))}
                            placeholder="nome" className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] font-mono placeholder:text-white/20 focus:outline-none" />
                          <input value={skillParamDraft.description} onChange={e => setSkillParamDraft(p => ({ ...p, description: e.target.value }))}
                            placeholder="descrição" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] placeholder:text-white/20 focus:outline-none" />
                          <select value={skillParamDraft.type} onChange={e => setSkillParamDraft(p => ({ ...p, type: e.target.value as any }))}
                            className="bg-[#1a1a1a] border border-white/10 rounded-lg px-2 py-1 text-[10px] focus:outline-none">
                            <option value="string">texto</option>
                            <option value="number">número</option>
                            <option value="boolean">sim/não</option>
                          </select>
                          <button onClick={() => {
                            if (!skillParamDraft.name) return;
                            setSkillDraft(d => ({ ...d, parameters: [...(d.parameters||[]), { ...skillParamDraft }] }));
                            setSkillParamDraft({ name: '', description: '', required: true, type: 'string' });
                          }} className="px-2 py-1 rounded-lg text-[10px] bg-white/10 hover:bg-white/20">+</button>
                        </div>
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setSkillDraft(null)} className="flex-1 py-2 rounded-xl text-[10px] uppercase tracking-widest opacity-40 hover:opacity-70 border border-white/10">Cancelar</button>
                      <button
                        disabled={!skillDraft.displayName || !skillDraft.webhookUrl}
                        onClick={() => {
                          if (!skillDraft.displayName || !skillDraft.webhookUrl) return;
                          if (skillDraft.id) { updateCustomSkill(skillDraft.id, skillDraft); }
                          else { addCustomSkill({ id: crypto.randomUUID(), displayName: skillDraft.displayName!, icon: skillDraft.icon || '⚡', description: skillDraft.description || '', webhookUrl: skillDraft.webhookUrl!, method: skillDraft.method || 'GET', active: true, parameters: skillDraft.parameters || [] }); }
                          setSkillDraft(null);
                        }}
                        className="flex-1 py-2 rounded-xl text-[10px] uppercase tracking-widest font-medium transition-all disabled:opacity-30"
                        style={{ backgroundColor: `${moodColor}20`, color: moodColor, border: `1px solid ${moodColor}40` }}>
                        Salvar
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {customSkills.length > 0 && (
              <div className="px-5 py-3 border-t border-white/5 shrink-0">
                <p className="text-[9px] text-white/20 text-center uppercase tracking-widest">Reconecte a IA para ativar novas habilidades</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESTART MODAL */}
      <AnimatePresence>
        {isRestarting && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md px-6">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-[#151010] border border-white/5 rounded-3xl p-8 text-center space-y-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ backgroundColor: `${moodColor}20` }}>
                <Power size={28} style={{ color: moodColor }} />
              </div>
              <div>
                <h2 className="text-lg font-light mb-2">Reiniciar Sistema?</h2>
                <p className="text-sm text-white/40">Isso apagará o histórico local.</p>
              </div>
              <div className="flex flex-col gap-3">
                <button onClick={() => { resetSystem(); setIsRestarting(false); window.location.reload(); }}
                  className="w-full py-4 text-white rounded-2xl text-xs uppercase tracking-widest" style={{ backgroundColor: moodColor }}>
                  Confirmar
                </button>
                <button onClick={() => setIsRestarting(false)} className="w-full py-4 bg-white/5 text-white/60 rounded-2xl text-xs uppercase tracking-widest">Cancelar</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SETTINGS MODAL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSettingsOpen(false)}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-end sm:items-center justify-center sm:p-6">
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="bg-[#151010] border border-white/5 rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md flex flex-col max-h-[85vh]">
              <div className="p-5 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-base font-medium">Configurações</h2>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-white/5 rounded-full"><X size={18} /></button>
              </div>
              <div className="flex border-b border-white/5 overflow-x-auto">
                {(['voice', 'personality', 'mascot', 'integrations', 'apis', 'system'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveSettingsTab(tab)}
                    className="flex-1 py-3 text-[10px] uppercase tracking-widest transition-all border-b-2 whitespace-nowrap px-2"
                    style={activeSettingsTab === tab ? { borderColor: moodColor, color: 'white' } : { borderColor: 'transparent', color: 'rgba(255,255,255,0.3)' }}>
                    {tab === 'voice' ? 'Voz' : tab === 'personality' ? 'Humor' : tab === 'mascot' ? 'Mascote' : tab === 'integrations' ? 'Integrações' : tab === 'apis' ? 'APIs' : 'Sistema'}
                  </button>
                ))}
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                <AnimatePresence mode="wait">

                  {/* ── ABA: VOZ ── */}
                  {activeSettingsTab === 'voice' && (
                    <motion.div key="voice" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">

                      {/* ── NÍVEL DE VOZ ── */}
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest opacity-40 block">Modo de Voz</label>
                        <div className="grid grid-cols-2 gap-2">
                          {([1, 2] as const).map(lvl => (
                            <button key={lvl} onClick={() => setVoiceLevel(lvl)}
                              className="p-4 rounded-2xl text-left transition-all border"
                              style={voiceLevel === lvl ? { backgroundColor: `${moodColor}20`, borderColor: `${moodColor}50`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-base">{lvl === 1 ? '🎙️' : '🤖'}</span>
                                <span className="text-xs font-semibold">Nível {lvl}</span>
                                {voiceLevel === lvl && <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ backgroundColor: moodColor }} />}
                              </div>
                              <p className="text-[10px] opacity-50 leading-snug">{lvl === 1 ? 'ElevenLabs — voz ultra-realista narra o chat e o workspace' : 'Gemini Live — conversa de voz bidirecional em tempo real'}</p>
                            </button>
                          ))}
                        </div>
                        {voiceLevel === 1 && (!elevenLabsApiKey || !elevenLabsVoiceId) && (
                          <p className="text-[10px] text-yellow-400/60 px-1">⚠ Configure a API ElevenLabs na aba APIs para usar o Nível 1</p>
                        )}
                      </div>

                      {/* Vozes Gemini — só relevantes no Nível 2 */}
                      <div className={`space-y-4 transition-opacity ${voiceLevel === 1 ? 'opacity-40 pointer-events-none' : ''}`}>
                        <label className="text-[10px] uppercase tracking-widest opacity-40 block">Voz Gemini Live (Nível 2)</label>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 opacity-40"><span className="text-xs">♀</span><label className="text-[9px] uppercase tracking-[0.2em]">Feminino</label></div>
                        <div className="grid grid-cols-1 gap-2">
                          {(['Kore', 'Zephyr', 'Leda', 'Callirrhoe', 'Vindemiatrix'] as VoiceName[]).map(v => (
                            <button key={v} onClick={() => onManualVoiceChange(v)} className="w-full p-4 rounded-2xl text-left transition-all border"
                              style={voice === v ? { backgroundColor: `${moodColor}15`, borderColor: `${moodColor}40`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{v}</span>
                                {voice === v && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moodColor }} />}
                              </div>
                              <p className="text-[10px] opacity-40 mt-1">{VOICE_DESCRIPTIONS[v]}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 opacity-40"><span className="text-xs">♂</span><label className="text-[9px] uppercase tracking-[0.2em]">Masculino</label></div>
                        <div className="grid grid-cols-1 gap-2">
                          {(['Charon', 'Puck', 'Fenrir', 'Orus', 'Aoede'] as VoiceName[]).map(v => (
                            <button key={v} onClick={() => onManualVoiceChange(v)} className="w-full p-4 rounded-2xl text-left transition-all border"
                              style={voice === v ? { backgroundColor: `${moodColor}15`, borderColor: `${moodColor}40`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">{v}</span>
                                {voice === v && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: moodColor }} />}
                              </div>
                              <p className="text-[10px] opacity-40 mt-1">{VOICE_DESCRIPTIONS[v]}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                      </div>{/* end vozes gemini wrapper */}
                    </motion.div>
                  )}

                  {/* ── ABA: HUMOR ── */}
                  {activeSettingsTab === 'personality' && (
                    <motion.div key="personality" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest opacity-40 block">Humor Atual</label>
                        {(Object.entries(MOOD_CONFIG) as [Mood, typeof MOOD_CONFIG[Mood]][]).map(([key, config]) => (
                          <button key={key} onClick={() => setMood(key)} className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left"
                            style={mood === key ? { backgroundColor: `${config.color}20`, border: `1px solid ${config.color}40` } : { backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            <span className="text-xl">{config.emoji}</span>
                            <p className="text-sm font-medium" style={{ color: mood === key ? config.color : 'rgba(255,255,255,0.7)' }}>{config.label}</p>
                            {mood === key && <div className="ml-auto w-2 h-2 rounded-full" style={{ backgroundColor: config.color }} />}
                          </button>
                        ))}
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                          <div>
                            <p className="text-sm">🎯 Modo Foco</p>
                            <p className="text-[10px] text-white/30 mt-0.5">Respostas diretas e objetivas</p>
                          </div>
                          <button onClick={() => setFocusMode(!focusMode)} className="w-11 h-6 rounded-full transition-all relative" style={{ backgroundColor: focusMode ? '#00cec9' : 'rgba(255,255,255,0.1)' }}>
                            <motion.div animate={{ x: focusMode ? 22 : 3 }} className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow" />
                          </button>
                        </div>
                      </div>
                      {memory.userName && (
                        <div className="pt-4 border-t border-white/5 space-y-2">
                          <label className="text-[10px] uppercase tracking-widest opacity-40 block">Memória</label>
                          <div className="p-4 bg-white/5 rounded-2xl space-y-1">
                            <p className="text-xs text-white/60">👤 <span className="text-white">{memory.userName}</span></p>
                            {memory.facts?.slice(-3).map((f, i) => <p key={i} className="text-xs text-white/40">• {f}</p>)}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── ABA: MASCOTE ── */}
                  {activeSettingsTab === 'mascot' && (
                    <motion.div key="mascot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-5">
                      <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                        <span className="text-sm">Visível</span>
                        <button onClick={() => setIsMascotVisible(!isMascotVisible)} className="w-11 h-6 rounded-full transition-all relative" style={{ backgroundColor: isMascotVisible ? moodColor : 'rgba(255,255,255,0.1)' }}>
                          <motion.div animate={{ x: isMascotVisible ? 22 : 3 }} className="absolute top-1 left-0 w-4 h-4 bg-white rounded-full shadow" />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase tracking-widest opacity-30">Cor</span>
                        <div className="flex gap-2 flex-wrap">
                          {['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeead', '#a29bfe'].map(color => (
                            <button key={color} onClick={() => setMascotAppearance({ primaryColor: color })} className="w-8 h-8 rounded-full border-2 transition-all"
                              style={{ backgroundColor: color, borderColor: mascotAppearance.primaryColor === color ? 'white' : 'transparent', opacity: mascotAppearance.primaryColor === color ? 1 : 0.5 }} />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <span className="text-[10px] uppercase tracking-widest opacity-30">Olhos</span>
                        <div className="grid grid-cols-5 gap-2">
                          {(['normal', 'happy', 'cool', 'wink', 'heart'] as MascotEyeStyle[]).map(style => (
                            <button key={style} onClick={() => setMascotAppearance({ eyeStyle: style })} className="py-2 rounded-lg text-base transition-all"
                              style={{ backgroundColor: mascotAppearance.eyeStyle === style ? `${moodColor}30` : 'rgba(255,255,255,0.05)' }}>
                              {style === 'normal' ? '👀' : style === 'happy' ? '😊' : style === 'cool' ? '😎' : style === 'wink' ? '😉' : '❤️'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* ── ABA: INTEGRAÇÕES ── */}
                  {activeSettingsTab === 'integrations' && (
                    <motion.div key="integrations" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <div className="p-4 rounded-2xl border space-y-2" style={{ backgroundColor: '#25D36610', borderColor: '#25D36630' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#25D36620' }}>💬</div>
                          <div>
                            <p className="text-sm font-medium">WhatsApp</p>
                            <p className="text-[10px] opacity-40">Evolution API • Instância: {EVOLUTION_INSTANCE}</p>
                          </div>
                          <div className="ml-auto w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        </div>
                        <p className="text-[10px] text-white/30 pl-1">Conectado via Railway. Diga à OSONE para mandar uma mensagem pelo WhatsApp.</p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] uppercase tracking-widest opacity-40">Contatos</label>
                          <span className="text-[10px] text-white/20">{whatsappContacts.length} contato{whatsappContacts.length !== 1 ? 's' : ''}</span>
                        </div>
                        <button onClick={() => { setShowContactsList(v => !v); setShowAddContact(false); }}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-2xl text-sm transition-all"
                          style={{ backgroundColor: '#25D36610', border: '1px solid #25D36630', color: '#25D366' }}>
                          <span>📋 {showContactsList ? 'Fechar lista' : 'Acessar lista de contatos'}</span>
                          <span className="text-xs opacity-60">{showContactsList ? '▲' : '▼'}</span>
                        </button>
                        {showContactsList && (
                          <div className="rounded-2xl overflow-hidden border border-white/10">
                            {whatsappContacts.length === 0 && !showAddContact && (
                              <div className="px-4 py-5 text-center text-[11px] text-white/25">Nenhum contato ainda. Clique em + para adicionar.</div>
                            )}
                            {whatsappContacts.map((c, i) => (
                              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-white/5 last:border-0">
                                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0" style={{ backgroundColor: '#25D36620', color: '#25D366' }}>
                                  {c.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium truncate">{c.name}</p>
                                  <p className="text-[10px] text-white/30 font-mono">{c.phone}</p>
                                </div>
                                <button onClick={() => removeWhatsappContact(i)} className="p-1.5 rounded-lg opacity-30 hover:opacity-80 hover:bg-red-500/20 transition-all text-red-400 shrink-0">✕</button>
                              </div>
                            ))}
                            {showAddContact ? (
                              <div className="p-3 space-y-2 bg-white/3 border-t border-white/10">
                                <input type="text" placeholder="Nome (ex: João, Minha mãe)" value={newContactName} onChange={e => setNewContactName(e.target.value)}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/25" autoFocus />
                                <input type="tel" placeholder="Número (ex: 5511999999999)" value={newContactPhone} onChange={e => setNewContactPhone(e.target.value.replace(/\D/g, ''))}
                                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/25 font-mono" />
                                <div className="flex gap-2">
                                  <button onClick={() => { setShowAddContact(false); setNewContactName(''); setNewContactPhone(''); }}
                                    className="flex-1 py-2 rounded-xl text-[10px] text-white/30 border border-white/10 hover:bg-white/5">Cancelar</button>
                                  <button disabled={!newContactName.trim() || !newContactPhone.trim()}
                                    onClick={() => { if (!newContactName.trim() || !newContactPhone.trim()) return; addWhatsappContact({ name: newContactName.trim(), phone: newContactPhone.trim() }); setNewContactName(''); setNewContactPhone(''); setShowAddContact(false); }}
                                    className="flex-1 py-2 rounded-xl text-[10px] font-medium transition-all disabled:opacity-30"
                                    style={{ backgroundColor: '#25D36620', color: '#25D366', border: '1px solid #25D36640' }}>Salvar contato</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => setShowAddContact(true)}
                                className="w-full flex items-center justify-center gap-2 py-3 text-xs text-white/40 hover:text-white/70 hover:bg-white/5 transition-all border-t border-white/5">
                                <span className="text-base leading-none">+</span>
                                <span>Adicionar contato</span>
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-[10px] text-white/20 pl-1">Diga à IA: "manda mensagem de voz pro João" ou "manda texto pra Maria".</p>
                      </div>

                      <div className="p-4 rounded-2xl border space-y-4" style={{ backgroundColor: '#4ecdc410', borderColor: '#4ecdc430' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#4ecdc420' }}>🏠</div>
                          <div>
                            <p className="text-sm font-medium">Casa Inteligente</p>
                            <p className="text-[10px] opacity-40">Tuya IoT • Positivo, SmartLife e outros</p>
                          </div>
                          <div className={`ml-auto w-2 h-2 rounded-full ${tuyaClientId && tuyaSecret ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                        </div>
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-widest opacity-40">Client ID</label>
                            <input type="text" placeholder="xxxxxxxxxxxxxxxx" value={tuyaClientId} onChange={(e) => setTuyaClientId(e.target.value.trim())}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-widest opacity-40">Client Secret</label>
                            <input type="password" placeholder="••••••••••••••••" value={tuyaSecret} onChange={(e) => setTuyaSecret(e.target.value.trim())}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-widest opacity-40">Região</label>
                            <select value={tuyaRegion} onChange={(e) => setTuyaRegion(e.target.value)} className="w-full bg-[#1a1a1a] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-white/30">
                              <option value="us">América (us)</option>
                              <option value="eu">Europa (eu)</option>
                              <option value="cn">China (cn)</option>
                              <option value="in">Índia (in)</option>
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] uppercase tracking-widest opacity-40">User ID <span className="opacity-50 normal-case">(UID da conta SmartLife)</span></label>
                            <input type="text" placeholder="ay1234567890abcdef (opcional)" value={tuyaUserId} onChange={(e) => setTuyaUserId(e.target.value.trim())}
                              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                            <p className="text-[10px] text-white/20">Obrigatório se der erro de IP. Veja em: iot.tuya.com → Devices → clique no usuário vinculado.</p>
                          </div>
                          <button disabled={!tuyaClientId || !tuyaSecret || tuyaLoading}
                            onClick={async () => {
                              setTuyaLoading(true); setTuyaDevices([]);
                              try {
                                const r = await fetch(`/api/tuya/devices?clientId=${encodeURIComponent(tuyaClientId)}&secret=${encodeURIComponent(tuyaSecret)}&region=${tuyaRegion}&userId=${encodeURIComponent(tuyaUserId)}`);
                                const d = await r.json();
                                if (d.success) setTuyaDevices(d.devices);
                                else setSmartHomeStatus(`❌ ${d.error}`);
                              } catch (e: any) { setSmartHomeStatus(`❌ Erro: ${e.message}`); }
                              finally { setTuyaLoading(false); }
                            }}
                            className="w-full py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-medium transition-all disabled:opacity-30"
                            style={{ backgroundColor: '#4ecdc420', color: '#4ecdc4', border: '1px solid #4ecdc440' }}>
                            {tuyaLoading ? 'Buscando...' : 'Testar e ver dispositivos'}
                          </button>
                          {tuyaDevices.length > 0 && (
                            <div className="space-y-1 mt-1">
                              {tuyaDevices.map((d: any) => (
                                <div key={d.id} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl text-xs">
                                  <span>{d.category === 'dj' || d.category === 'dd' ? '💡' : '🔌'}</span>
                                  <span className="flex-1">{d.name}</span>
                                  <span className={`text-[10px] ${d.online ? 'text-green-400' : 'text-white/20'}`}>{d.online ? 'online' : 'offline'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-white/20 leading-relaxed">Crie um projeto em <span className="text-white/40">iot.tuya.com</span>, vincule o app Positivo/SmartLife e copie o Client ID e Secret.</p>
                      </div>

                      <div className="p-4 rounded-2xl border space-y-3" style={{ backgroundColor: '#1DB9C310', borderColor: '#1DB9C330' }}>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: '#1DB9C320' }}>🔵</div>
                          <div>
                            <p className="text-sm font-medium">Amazon Alexa</p>
                            <p className="text-[10px] opacity-40">Controle Echo e dispositivos smart home via Alexa</p>
                          </div>
                          <div className={`ml-auto w-2 h-2 rounded-full ${alexaConnected ? 'bg-green-500 animate-pulse' : alexaPending ? 'bg-yellow-500 animate-pulse' : 'bg-zinc-600'}`} />
                        </div>
                        {alexaConnected ? (
                          <div className="space-y-2">
                            <p className="text-[10px] text-green-400">Conectado à Amazon</p>
                            {alexaDevices.length > 0 && (
                              <div className="space-y-1">
                                {alexaDevices.map((d: any, i: number) => (
                                  <div key={i} className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl text-xs">
                                    <span>🔵</span><span className="flex-1">{d.accountName || d.name}</span><span className="opacity-30 text-[10px]">{d.deviceFamily}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="flex gap-2">
                              <button onClick={async () => { setAlexaLoading(true); setAlexaDevices([]); try { const r = await fetch('/api/alexa/devices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); const d = await r.json(); if (d.success) setAlexaDevices(d.devices || []); } catch {} finally { setAlexaLoading(false); } }}
                                disabled={alexaLoading}
                                className="flex-1 py-2 rounded-xl text-[10px] uppercase tracking-widest disabled:opacity-30"
                                style={{ backgroundColor: '#1DB9C320', color: '#1DB9C3', border: '1px solid #1DB9C340' }}>
                                {alexaLoading ? 'Buscando...' : 'Ver dispositivos'}
                              </button>
                              <button onClick={async () => { await fetch('/api/alexa/disconnect', { method: 'DELETE' }); setAlexaConnected(false); setAlexaDevices([]); setAlexaStatus(null); setAlexaAuthUrl(null); clearInterval(alexaPollRef.current); }}
                                className="px-4 py-2 rounded-xl text-[10px] uppercase tracking-widest"
                                style={{ backgroundColor: '#ff444420', color: '#ff6666', border: '1px solid #ff444440' }}>
                                Desconectar
                              </button>
                            </div>
                          </div>
                        ) : alexaPending ? (
                          <div className="space-y-3">
                            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 space-y-2">
                              <p className="text-[10px] text-yellow-400 font-medium">Aguardando autorização...</p>
                              <p className="text-[10px] text-white/40 leading-relaxed">Uma página de login foi aberta. Faça login com sua conta Amazon para autorizar o OSONE.</p>
                              {alexaAuthUrl && (
                                <a href={alexaAuthUrl} target="_blank" rel="noreferrer"
                                  className="block w-full text-center py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-medium"
                                  style={{ backgroundColor: '#1DB9C320', color: '#1DB9C3', border: '1px solid #1DB9C340' }}>
                                  Abrir página de login →
                                </a>
                              )}
                            </div>
                            <button onClick={() => { clearInterval(alexaPollRef.current); setAlexaPending(false); setAlexaAuthUrl(null); setAlexaStatus(null); }}
                              className="w-full py-2 rounded-xl text-[10px] uppercase tracking-widest opacity-40 hover:opacity-70"
                              style={{ border: '1px solid #ffffff20', color: 'white' }}>Cancelar</button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {alexaStatus && <p className="text-[10px] text-red-400">{alexaStatus}</p>}
                            <button disabled={alexaLoading}
                              onClick={async () => {
                                setAlexaLoading(true); setAlexaStatus(null);
                                try {
                                  const r = await fetch('/api/alexa/start-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                                  const d = await r.json();
                                  if (d.alreadyConnected) { setAlexaConnected(true); }
                                  else if (d.authUrl) {
                                    setAlexaAuthUrl(d.authUrl); setAlexaPending(true); window.open(d.authUrl, '_blank');
                                    clearInterval(alexaPollRef.current);
                                    alexaPollRef.current = setInterval(async () => {
                                      try { const sr = await fetch('/api/alexa/auth-status'); const sd = await sr.json(); if (sd.ready) { clearInterval(alexaPollRef.current); setAlexaConnected(true); setAlexaPending(false); setAlexaAuthUrl(null); setAlexaStatus(null); } } catch {}
                                    }, 3000);
                                  }
                                } catch (e: any) { setAlexaStatus(`❌ ${e.message}`); }
                                finally { setAlexaLoading(false); }
                              }}
                              className="w-full py-2.5 rounded-xl text-[10px] uppercase tracking-widest font-medium transition-all disabled:opacity-30"
                              style={{ backgroundColor: '#1DB9C320', color: '#1DB9C3', border: '1px solid #1DB9C340' }}>
                              {alexaLoading ? 'Iniciando...' : 'Conectar com Amazon'}
                            </button>
                            <p className="text-[10px] text-white/20 leading-relaxed">Abre uma página de login. Faça login com sua Amazon — sem precisar copiar cookies. Funciona apenas na instalação local.</p>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ── ABA: APIs ── */}
                  {activeSettingsTab === 'apis' && (
                    <motion.div key="apis" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <p className="text-[10px] text-white/30 leading-relaxed">Configure suas chaves de API. Elas ficam salvas só no seu dispositivo e são usadas diretamente pelo app — sem passar por servidor.</p>

                      {/* Gemini */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${moodColor}20` }}>🎙️</div>
                          <div><p className="text-xs font-medium">Gemini API Key</p><p className="text-[10px] text-white/30">Usado para voz (Gemini Live)</p></div>
                          <div className={`ml-auto w-2 h-2 rounded-full ${apiKey ? 'bg-green-500' : 'bg-zinc-600'}`} />
                        </div>
                        <input type="password" placeholder="AIza..." value={apiKey} onChange={e => setApiKey(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                        <p className="text-[10px] text-white/20 pl-1">Obtenha em: aistudio.google.com</p>
                      </div>

                      {/* Provedor de texto */}
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Provedor de texto</label>
                        <div className="grid grid-cols-2 gap-2">
                          {(['openai', 'groq'] as const).map(p => (
                            <button key={p} onClick={() => { setChatProvider(p); setChatModel(p === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4.1-mini'); }}
                              className="p-3 rounded-xl text-sm font-medium transition-all border"
                              style={chatProvider === p ? { backgroundColor: `${moodColor}20`, borderColor: `${moodColor}50`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                              {p === 'openai' ? 'OpenAI' : 'Groq'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* OpenAI */}
                      {chatProvider === 'openai' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${moodColor}20` }}>💬</div>
                            <div><p className="text-xs font-medium">OpenAI API Key</p><p className="text-[10px] text-white/30">platform.openai.com</p></div>
                            <div className={`ml-auto w-2 h-2 rounded-full ${openaiApiKey ? 'bg-green-500' : 'bg-zinc-600'}`} />
                          </div>
                          <input type="password" placeholder="sk-..." value={openaiApiKey} onChange={e => setOpenaiApiKey(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                        </div>
                      )}

                      {/* Groq */}
                      {chatProvider === 'groq' && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${moodColor}20` }}>⚡</div>
                            <div><p className="text-xs font-medium">Groq API Key</p><p className="text-[10px] text-white/30">console.groq.com</p></div>
                            <div className={`ml-auto w-2 h-2 rounded-full ${groqApiKey ? 'bg-green-500' : 'bg-zinc-600'}`} />
                          </div>
                          <input type="password" placeholder="gsk_..." value={groqApiKey} onChange={e => setGroqApiKey(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono" />
                        </div>
                      )}

                      {/* Modelo */}
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Modelo</label>
                        <div className="grid grid-cols-1 gap-2">
                          {(chatProvider === 'groq'
                            ? ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it']
                            : ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini']
                          ).map(m => (
                            <button key={m} onClick={() => setChatModel(m)}
                              className="w-full p-3 rounded-xl text-left text-sm transition-all border"
                              style={chatModel === m ? { backgroundColor: `${moodColor}15`, borderColor: `${moodColor}40`, color: 'white' } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' }}>
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* ✅ ElevenLabs */}
                      <div className="pt-4 border-t border-white/5 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm" style={{ backgroundColor: `${moodColor}20` }}>🔊</div>
                          <div>
                            <p className="text-xs font-medium">ElevenLabs</p>
                            <p className="text-[10px] text-white/30">Voz ultra-realista (fallback do Gemini)</p>
                          </div>
                          <div className={`ml-auto w-2 h-2 rounded-full ${elevenLabsApiKey && elevenLabsVoiceId ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'}`} />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-white/40">ElevenLabs API Key</label>
                          <input
                            type="password"
                            placeholder="sk_..."
                            value={elevenLabsApiKey}
                            onChange={e => setElevenLabsApiKey(e.target.value.trim())}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] uppercase tracking-widest text-white/40">Voice ID</label>
                          <input
                            type="text"
                            placeholder="21m00Tcm4TlvDq8ikWAM"
                            value={elevenLabsVoiceId}
                            onChange={e => setElevenLabsVoiceId(e.target.value.trim())}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30 font-mono"
                          />
                          <p className="text-[10px] text-white/20 pl-1">
                            Encontre em <span className="text-white/40">elevenlabs.io/app/voice-library</span>
                          </p>
                        </div>

                        {elevenLabsApiKey && elevenLabsVoiceId && (
                          <div className="p-3 rounded-xl flex items-center gap-2 text-[10px] text-green-400"
                            style={{ backgroundColor: '#22c55e10', border: '1px solid #22c55e20' }}>
                            <span>✓</span>
                            <span>Configurado. Reconecte a IA para ativar.</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}

                  {/* ── ABA: SISTEMA ── */}
                  {activeSettingsTab === 'system' && (
                    <motion.div key="system" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                      <div className="space-y-3">
                        <label className="text-[10px] uppercase tracking-widest text-white/40">Nome do assistente</label>
                        <input type="text" placeholder="OSONE" value={assistantName} onChange={e => setAssistantName(e.target.value || 'OSONE')}
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm placeholder:text-white/20 focus:outline-none focus:border-white/30" />
                        <p className="text-[10px] text-white/20 pl-1">Muda o nome na personalidade, nas falas e em todo o app.</p>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 opacity-40"><Cpu size={14} /><span className="text-[10px] uppercase tracking-widest">Informações do Sistema</span></div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">CPU</p>
                            <p className="text-xl font-light">{systemMetrics.cpu}%</p>
                          </div>
                          <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                            <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Memória</p>
                            <p className="text-xl font-light">{systemMetrics.mem}%</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 opacity-40"><Download size={14} /><span className="text-[10px] uppercase tracking-widest">Aplicação PWA</span></div>
                        <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Status de Instalação</p>
                              <p className="text-[10px] text-white/30">{isInstalled ? 'Instalado no dispositivo' : 'Disponível para instalação'}</p>
                            </div>
                            <div className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-500' : 'bg-yellow-500'}`} />
                          </div>
                          {!isInstalled && (
                            <div className="space-y-4">
                              {window.self !== window.top ? (
                                <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                                  <p className="text-xs text-blue-400 mb-2">⚠️ Instalação bloqueada pelo AI Studio</p>
                                  <p className="text-[10px] text-white/40 leading-relaxed">Abra o aplicativo em uma <strong>nova aba</strong> para instalar.</p>
                                </div>
                              ) : (
                                <button onClick={handleInstallApp} disabled={!installPrompt}
                                  className={`w-full py-4 rounded-2xl text-xs uppercase tracking-widest font-medium transition-all flex items-center justify-center gap-2 ${installPrompt ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                                  style={installPrompt ? { backgroundColor: moodColor, color: '#000' } : {}}>
                                  <Download size={14} />
                                  {installPrompt ? 'Instalar Agora' : 'Aguardando Navegador...'}
                                </button>
                              )}
                            </div>
                          )}
                          {isInstalled && (
                            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-center">
                              <p className="text-[10px] text-green-400 uppercase tracking-widest">Você já está usando a versão instalada</p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <button onClick={() => setIsRestarting(true)} className="w-full py-4 bg-red-500/10 text-red-500 rounded-2xl text-xs uppercase tracking-widest font-medium hover:bg-red-500/20 transition-all flex items-center justify-center gap-2">
                          <Power size={14} />Reiniciar Sistema
                        </button>
                      </div>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
              <div className="p-5 border-t border-white/5 flex flex-col gap-3">
                <p className="text-[10px] text-white/20 uppercase tracking-widest text-center">Você também pode pedir por voz</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PERSONALITY PICKER MODAL */}
      <AnimatePresence>
        {showPersonalityPicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPersonalityPicker(false)}
            className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-sm flex items-end justify-center">
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} onClick={e => e.stopPropagation()}
              className="w-full max-w-md bg-[#151010] border-t border-white/5 rounded-t-3xl p-6 space-y-3"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 16px))' }}>
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-5" />
              <p className="text-[10px] uppercase tracking-[0.3em] text-white/30 text-center mb-4">Com quem você quer conversar?</p>
              {(Object.entries(PERSONALITY_CONFIG) as [Personality, typeof PERSONALITY_CONFIG[Personality]][]).map(([key, config]) => (
                <button key={key} onClick={() => handlePersonalityChange(key)} className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all border"
                  style={personality === key ? { backgroundColor: `${config.color}20`, borderColor: `${config.color}50` } : { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.06)' }}>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0" style={{ backgroundColor: `${config.color}20` }}>{config.emoji}</div>
                  <div className="text-left flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: personality === key ? config.color : 'white' }}>{config.label}</p>
                      {personality === key && <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ backgroundColor: `${config.color}20`, color: config.color }}>Ativo</span>}
                    </div>
                    <p className="text-[11px] text-white/40 mt-0.5">{config.description}</p>
                    <p className="text-[10px] text-white/20 mt-1">Voz: {config.voice}</p>
                  </div>
                  {personality === key && <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: config.color }} />}
                </button>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-10 text-[9px] tracking-[0.4em] uppercase pointer-events-none">OZÔNIO v1.0</div>
    </div>
  );
}
