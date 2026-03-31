import { Type, FunctionDeclaration } from "@google/genai";
import type { CustomSkill } from '../store/useAppStore';

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "toggle_screen_sharing",
    description: "Ativa ou desativa o compartilhamento de tela.",
    parameters: {
      type: Type.OBJECT,
      properties: { enabled: { type: Type.BOOLEAN, description: "True para ativar, False para desativar." } },
      required: ["enabled"]
    }
  },
  {
    name: "change_voice",
    description: "Altera a voz do sistema operacional (IA).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        voice_name: {
          type: Type.STRING,
          description: "O nome da nova voz.",
          enum: ["Charon", "Kore", "Puck", "Zephyr", "Fenrir"]
        }
      },
      required: ["voice_name"]
    }
  },
  {
    name: "open_url",
    description: "Abre uma URL em uma nova aba.",
    parameters: {
      type: Type.OBJECT,
      properties: { url: { type: Type.STRING, description: "A URL completa para abrir." } },
      required: ["url"]
    }
  },
  {
    name: "generate_image",
    description: "Gera uma imagem a partir de uma descrição textual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: { type: Type.STRING, description: "Descrição detalhada da imagem." },
        aspect_ratio: {
          type: Type.STRING,
          description: "Formato da imagem. Padrão: 1:1",
          enum: ["1:1", "16:9", "9:16"]
        }
      },
      required: ["prompt"]
    }
  },
  {
    name: "interact_with_screen",
    description: "Simula interação na tela (clique, scroll, digitar).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, description: "Ação: 'click', 'type', 'scroll_up', 'scroll_down'." },
        text: { type: Type.STRING, description: "Texto a ser digitado (se action for 'type')." },
        x: { type: Type.NUMBER, description: "Coordenada X (0-1920)." },
        y: { type: Type.NUMBER, description: "Coordenada Y (0-1080)." }
      },
      required: ["action"]
    }
  },
  {
    name: "mascot_control",
    description: "Controla as ações do mascote visualmente.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['point', 'click'] },
        target: { type: Type.STRING, description: "ID do elemento ou coordenadas." }
      },
      required: ["action", "target"]
    }
  },
  {
    name: "save_profile_info",
    description: "Salva informações do perfil do usuário durante o onboarding.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          enum: ['hobbies', 'relationships', 'lifestyle', 'gender_preference', 'personality', 'assistant_name', 'social_level', 'mother_relationship']
        },
        value: { type: Type.STRING }
      },
      required: ["field", "value"]
    }
  },
  {
    name: "complete_onboarding",
    description: "Finaliza o processo de onboarding e inicia a animação de nascimento."
  },
  {
    name: "show_lyrics",
    description: "Exibe a letra de uma música na tela enquanto você canta. IMPORTANTE: chame esta ferramenta UMA ÚNICA VEZ antes de começar a cantar. Passe TODAS as linhas de uma só vez no array. Depois de chamar, INICIE a performance vocal imediatamente e cante toda a música sem pausas ou novas chamadas de ferramenta.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        lines: { type: Type.ARRAY, items: { type: Type.STRING }, description: "As linhas da letra." },
        tempo: { type: Type.NUMBER, description: "Tempo em ms entre cada linha." }
      },
      required: ["lines"]
    }
  },
  {
    name: "set_mood",
    description: "Altera o humor atual da IA.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        mood: { type: Type.STRING, enum: ["happy", "calm", "focused", "playful", "melancholic", "angry"] }
      },
      required: ["mood"]
    }
  },
  {
    name: "set_focus_mode",
    description: "Ativa ou desativa o modo foco.",
    parameters: {
      type: Type.OBJECT,
      properties: { enabled: { type: Type.BOOLEAN } },
      required: ["enabled"]
    }
  },
  {
    name: "save_memory",
    description: "Salva informações sobre o usuário para memória permanente. Use PROATIVAMENTE sempre que o usuário compartilhar qualquer dado pessoal: nome, profissão, família, hobby, sonho, medo, hábito, opinião, evento importante, conquista, problema. Não espere ser pedida — salve imediatamente. Quanto mais você salvar, melhor poderá servir.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userName: { type: Type.STRING, description: "Nome ou apelido do usuário." },
        fact: { type: Type.STRING, description: "Fato, evento, característica ou informação sobre o usuário." },
        preference: { type: Type.STRING, description: "Preferência, gosto ou desgosto do usuário (comida, música, estilo, etc.)." },
        note: { type: Type.STRING, description: "Anotação livre — use para capturar insights, padrões de comportamento, contexto emocional." }
      },
      required: []
    }
  },
  {
    name: "add_important_date",
    description: "Salva uma data importante do usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        label: { type: Type.STRING },
        date: { type: Type.STRING },
        year: { type: Type.STRING }
      },
      required: ["label", "date"]
    }
  },
  {
    name: "write_diary",
    description: "Escreve uma reflexão no diário.",
    parameters: {
      type: Type.OBJECT,
      properties: { content: { type: Type.STRING } },
      required: ["content"]
    }
  },
  {
    name: "search_web",
    description: "Pesquisa algo na web. Use para notícias, informações atuais, dados online.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "Termo de pesquisa." },
        num_results: { type: Type.NUMBER, description: "Número máximo de resultados (1-10)." }
      },
      required: ["query"]
    }
  },
  {
    name: "read_url_content",
    description: "Lê e extrai o conteúdo textual de uma página web.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "A URL completa da página (ex: https://exemplo.com)." }
      },
      required: ["url"]
    }
  },
  {
    name: "update_workspace",
    description: "Escreve ou atualiza conteúdo na Área de Trabalho.",
    parameters: {
      type: Type.OBJECT,
      properties: { content: { type: Type.STRING } },
      required: ["content"]
    }
  },
  {
    name: "clear_workspace",
    description: "Limpa todo o conteúdo da Área de Trabalho."
  },
  {
    name: "save_semantic_fact",
    description: "Salva um fato semântico estruturado.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        concept: { type: Type.STRING },
        definition: { type: Type.STRING },
        category: { type: Type.STRING }
      },
      required: ["concept", "definition", "category"]
    }
  },
  {
    name: "search_semantic_memory",
    description: "Pesquisa na memória semântica por contexto.",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"]
    }
  },
  {
    name: "search_gmail",
    description: "Pesquisa nos e-mails do usuário (Gmail).",
    parameters: {
      type: Type.OBJECT,
      properties: { query: { type: Type.STRING } },
      required: ["query"]
    }
  },
  {
    name: "save_conversation_summary",
    description: "Salva um resumo da conversa atual.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        summary: { type: Type.STRING },
        topics: { type: Type.ARRAY, items: { type: Type.STRING } }
      },
      required: ["summary", "topics"]
    }
  },
  {
    name: "control_device",
    description: "Controla dispositivos inteligentes da casa (lâmpadas, tomadas, switches). Use para ligar, desligar ou ajustar brilho. Também pode listar os dispositivos disponíveis.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        device_name: {
          type: Type.STRING,
          description: 'Nome do dispositivo ou cômodo. Ex: "sala", "quarto", "ventilador", "lâmpada da cozinha". Deixe vazio para action=list.',
        },
        action: {
          type: Type.STRING,
          enum: ['on', 'off', 'brightness', 'color_temp', 'list'],
          description: 'on=ligar, off=desligar, brightness=ajustar brilho (0-100), color_temp=temperatura de cor (0-1000), list=listar dispositivos',
        },
        value: {
          type: Type.NUMBER,
          description: 'Valor para brightness (0-100) ou color_temp (0-1000). Não necessário para on/off/list.',
        },
      },
      required: ['action'],
    },
  },
  {
    name: "send_whatsapp",
    description: "Envia uma mensagem de texto via WhatsApp. Pode enviar para um contato da lista (pelo nome) ou para um número específico. Use 'contact_name' quando o usuário mencionar o nome de alguém da lista de contatos.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        message:      { type: Type.STRING, description: "Texto da mensagem a ser enviada." },
        contact_name: { type: Type.STRING, description: "Nome do contato na lista (ex: 'João', 'Minha mãe'). A IA buscará o número automaticamente." },
        phone:        { type: Type.STRING, description: "Número direto no formato internacional (ex: 5511999999999). Usar quando não tiver o contato na lista." },
      },
      required: ["message"]
    }
  },
  {
    name: "send_whatsapp_audio",
    description: "Envia uma mensagem de VOZ (áudio) via WhatsApp. Use quando o usuário pedir para mandar um áudio, uma mensagem de voz, ou quando o conteúdo for mais natural como áudio. O texto é convertido em voz em português antes de enviar.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        text:         { type: Type.STRING, description: "Texto que será convertido em áudio e enviado como mensagem de voz." },
        contact_name: { type: Type.STRING, description: "Nome do contato na lista de contatos." },
        phone:        { type: Type.STRING, description: "Número direto no formato internacional (ex: 5511999999999)." },
      },
      required: ["text"]
    }
  },

  {
    name: "send_whatsapp_image",
    description: "Envia uma IMAGEM via WhatsApp. Use quando o usuário pedir para mandar uma foto, imagem ou quando acabar de gerar uma imagem e quiser enviá-la por WhatsApp.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        imageUrl:     { type: Type.STRING, description: "URL pública da imagem a ser enviada." },
        caption:      { type: Type.STRING, description: "Legenda opcional para a imagem." },
        contact_name: { type: Type.STRING, description: "Nome do contato na lista de contatos." },
        phone:        { type: Type.STRING, description: "Número direto no formato internacional (ex: 5511999999999)." },
      },
      required: ["imageUrl"]
    }
  },

  {
    name: "alexa_control",
    description: "Controla dispositivos Amazon Alexa (Echo). Use para tocar música, pausar, ajustar volume, ligar/desligar dispositivos smart home vinculados à Alexa, ou dar qualquer comando de voz à Alexa.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description: "Comando em português. Ex: 'tocar música', 'pausar', 'volume 50', 'ligar a luz da sala', 'que horas são'."
        },
        device: {
          type: Type.STRING,
          description: "Nome do dispositivo Echo alvo. Deixe vazio para usar o primeiro encontrado. Ex: 'Echo da sala', 'Echo do quarto'."
        }
      },
      required: ["command"]
    }
  },

  // ── CONTROLE DO PC (local only) ────────────────────────────────────────────
  {
    name: "control_pc",
    description: `Controla o computador localmente via servidor. Disponível APENAS quando o app está rodando em localhost.
Fluxo recomendado: 1) capture screenshot para ver a tela atual, 2) analise o que está visível, 3) execute a ação adequada.

ABRIR COISAS:
- open_file: abre qualquer arquivo com o app padrão (documento, imagem, vídeo, PDF, etc.)
- open_url: abre uma URL no navegador padrão
- open_folder: abre uma pasta no gerenciador de arquivos (Nautilus/Nemo/Finder)
- open_app: abre um aplicativo pelo nome (firefox, code, spotify, etc.)

ARQUIVOS E PASTAS:
- list_directory: lista arquivos e pastas com detalhes (tamanho, data, tipo)
- file_info: informações completas de um arquivo (tamanho, permissões, data)
- find_files: busca arquivos por nome ou extensão
- read_file_text: lê o conteúdo de um arquivo de texto

JANELAS:
- focus_window: traz uma janela para frente pelo nome do app
- close_window: fecha uma janela pelo nome do app
- get_active_window / list_windows: janela ativa / todas abertas

TELA E INTERAÇÃO:
- screenshot, click(x,y), move_mouse, scroll, type_text, press_key
- get_clipboard / set_clipboard

SISTEMA:
- run_command: executa qualquer comando shell
- system_info: CPU, RAM, disco, uptime`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "Ação a executar.",
          enum: [
            "screenshot",
            "open_file",
            "open_url",
            "open_folder",
            "open_app",
            "list_directory",
            "file_info",
            "find_files",
            "read_file_text",
            "focus_window",
            "close_window",
            "run_command",
            "type_text",
            "press_key",
            "click",
            "move_mouse",
            "scroll",
            "get_clipboard",
            "set_clipboard",
            "get_active_window",
            "list_windows",
            "system_info"
          ]
        },
        // Parâmetros de arquivo/URL
        path:      { type: Type.STRING, description: "Caminho absoluto do arquivo ou pasta. Ex: '/home/user/Documentos/relatorio.pdf', '/home/user/Downloads'" },
        url:       { type: Type.STRING, description: "URL para abrir no navegador. Ex: 'https://google.com'" },
        pattern:   { type: Type.STRING, description: "Padrão de busca para find_files. Ex: '*.pdf', 'relatorio*', '*.mp4'" },
        search_in: { type: Type.STRING, description: "Pasta onde buscar para find_files (padrão: home do usuário)." },
        // Janelas
        window_name: { type: Type.STRING, description: "Nome do app/janela para focus_window ou close_window. Ex: 'Firefox', 'Code', 'Nautilus'" },
        // Linha de comando
        command:   { type: Type.STRING, description: "Comando shell para run_command. Ex: 'ls -la', 'cat arquivo.txt'" },
        app:       { type: Type.STRING, description: "Nome do app para open_app. Ex: 'firefox', 'nautilus', 'code', 'spotify'" },
        text:      { type: Type.STRING, description: "Texto para type_text." },
        key:       { type: Type.STRING, description: "Tecla/combinação para press_key. Ex: 'ctrl+c', 'ctrl+v', 'super', 'Return', 'ctrl+alt+t'" },
        x:         { type: Type.NUMBER, description: "Coordenada X para click/move_mouse." },
        y:         { type: Type.NUMBER, description: "Coordenada Y para click/move_mouse." },
        button:    { type: Type.NUMBER, description: "Botão do mouse: 1=esquerdo (padrão), 2=meio, 3=direito." },
        direction: { type: Type.STRING, description: "Direção do scroll: 'up' ou 'down'." },
        amount:    { type: Type.NUMBER, description: "Quantidade para scroll (padrão: 3)." },
        content:   { type: Type.STRING, description: "Conteúdo para set_clipboard." }
      },
      required: ["action"]
    }
  },
  // ── MODO OPERADOR — Loop autônomo observe→pense→aja→verifique ──────────────
  {
    name: "operator_step",
    description: `[MODO OPERADOR] Executa UM passo do loop autônomo: realiza uma ação no computador e SEMPRE tira screenshot depois para verificar o resultado.
Use este tool em loop para completar tarefas complexas como editar vídeo no CapCut, analisar YouTube, pesquisar no NotebookLM, etc.

FLUXO OBRIGATÓRIO para cada passo:
1. Preencha "thought" explicando seu raciocínio (o que vê, o que pretende fazer, por quê)
2. Escolha a action adequada
3. O sistema executa a ação + tira screenshot automaticamente
4. Analise o screenshot retornado e decida o próximo passo
5. Repita até completar ou atingir o limite de passos

Ações disponíveis:
- observe: apenas tira screenshot (sem ação) — use como primeiro passo
- click: clica nas coordenadas x,y
- double_click: clique duplo nas coordenadas x,y
- right_click: clique com botão direito
- type: digita texto no campo ativo
- press_key: pressiona tecla (Enter, Tab, ctrl+c, etc.)
- scroll: rola a tela (up/down)
- drag: arrasta de (x,y) até (drag_to_x, drag_to_y)
- open_url: abre URL no navegador
- open_app: abre aplicativo
- wait: espera N segundos (para carregar)
- done: tarefa concluída — encerra modo operador`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        thought: { type: Type.STRING, description: "OBRIGATÓRIO. Seu raciocínio: o que você vê na tela, o que pretende fazer e por quê. Pense em voz alta." },
        action: {
          type: Type.STRING,
          description: "Ação a executar neste passo.",
          enum: ["observe", "click", "double_click", "right_click", "type", "press_key", "scroll", "drag", "open_url", "open_app", "wait", "done"]
        },
        x: { type: Type.NUMBER, description: "Coordenada X para click/double_click/right_click/drag." },
        y: { type: Type.NUMBER, description: "Coordenada Y para click/double_click/right_click/drag." },
        drag_to_x: { type: Type.NUMBER, description: "Coordenada X destino para drag." },
        drag_to_y: { type: Type.NUMBER, description: "Coordenada Y destino para drag." },
        text: { type: Type.STRING, description: "Texto para type." },
        key: { type: Type.STRING, description: "Tecla para press_key (Enter, Tab, Escape, ctrl+a, ctrl+c, ctrl+v, etc.)" },
        direction: { type: Type.STRING, description: "Direção do scroll: 'up' ou 'down'." },
        scroll_amount: { type: Type.NUMBER, description: "Quantidade de scroll (padrão: 3)." },
        url: { type: Type.STRING, description: "URL para open_url." },
        app: { type: Type.STRING, description: "Nome do app para open_app." },
        wait_seconds: { type: Type.NUMBER, description: "Segundos para wait (padrão: 2)." },
        task_description: { type: Type.STRING, description: "Descrição da tarefa (preencha no PRIMEIRO passo)." },
      },
      required: ["thought", "action"]
    }
  },
  // ── BROWSER CONTROL — Automação web via Puppeteer ─────────────────────────
  {
    name: "browser_control",
    description: `[MODO OPERADOR - WEB] Controla um navegador headless via Puppeteer para tarefas web.
Mais preciso que clicar em screenshots para sites como YouTube, NotebookLM, CapCut web, etc.

Ações:
- open: abre URL no navegador controlado (retorna screenshot)
- screenshot: tira screenshot da página atual
- click_selector: clica em elemento por seletor CSS (ex: 'button.submit', '#search-input')
- click_xy: clica em coordenadas x,y na página
- type: digita texto em um campo (seletor CSS + texto)
- scroll: rola a página
- read_text: extrai todo o texto visível da página
- read_element: extrai texto de um elemento específico (seletor CSS)
- go_back: volta página anterior
- evaluate: executa JavaScript na página (ex: document.title)
- close: fecha o navegador`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "Ação no navegador.",
          enum: ["open", "screenshot", "click_selector", "click_xy", "type", "scroll", "read_text", "read_element", "go_back", "evaluate", "close"]
        },
        url: { type: Type.STRING, description: "URL para open." },
        selector: { type: Type.STRING, description: "Seletor CSS para click_selector, type, read_element." },
        text: { type: Type.STRING, description: "Texto para type." },
        x: { type: Type.NUMBER, description: "Coordenada X para click_xy." },
        y: { type: Type.NUMBER, description: "Coordenada Y para click_xy." },
        direction: { type: Type.STRING, description: "Direção do scroll: 'up' ou 'down'." },
        script: { type: Type.STRING, description: "Código JavaScript para evaluate." },
      },
      required: ["action"]
    }
  },
  // ── AUTO-EVOLUÇÃO — Ler/Editar código e atualizar GitHub ─────────────────────
  {
    name: "self_read_code",
    description: `Lê o conteúdo de um arquivo do projeto OSONE. Use para inspecionar código antes de modificar.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: { type: Type.STRING, description: "Caminho relativo do arquivo (ex: src/App.tsx, server.ts, src/hooks/useGeminiLive.ts)" },
        startLine: { type: Type.NUMBER, description: "Linha inicial (opcional, padrão 1)" },
        endLine: { type: Type.NUMBER, description: "Linha final (opcional, padrão até o fim)" },
      },
      required: ["filePath"]
    }
  },
  {
    name: "self_write_code",
    description: `Edita um arquivo do projeto OSONE. Pode substituir trecho específico ou reescrever arquivo inteiro. Use com cuidado — sempre leia o arquivo antes.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        filePath: { type: Type.STRING, description: "Caminho relativo do arquivo (ex: src/App.tsx)" },
        search: { type: Type.STRING, description: "Texto exato a encontrar e substituir (se vazio, sobrescreve o arquivo inteiro)" },
        replace: { type: Type.STRING, description: "Texto de substituição" },
        createIfMissing: { type: Type.BOOLEAN, description: "Se true, cria o arquivo caso não exista" },
      },
      required: ["filePath", "replace"]
    }
  },
  {
    name: "self_list_files",
    description: `Lista arquivos e pastas do projeto OSONE. Use para explorar a estrutura antes de editar.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        directory: { type: Type.STRING, description: "Caminho relativo da pasta (ex: src, src/hooks, api). Vazio = raiz do projeto." },
        recursive: { type: Type.BOOLEAN, description: "Se true, lista recursivamente (padrão false)" },
      },
      required: []
    }
  },
  {
    name: "self_git_push",
    description: `Faz commit e push das alterações do projeto OSONE para o GitHub. Use após editar código para salvar e publicar as mudanças.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        commitMessage: { type: Type.STRING, description: "Mensagem descritiva do commit (ex: 'Adicionada função de busca por voz')" },
        files: { type: Type.STRING, description: "Arquivos a incluir no commit, separados por vírgula (ex: 'src/App.tsx,server.ts'). Vazio = todos os modificados." },
      },
      required: ["commitMessage"]
    }
  },
];

// ── Custom Skills (Agente Infinito) ──────────────────────────────────────────
const SKILL_TYPE_MAP: Record<string, any> = {
  string: Type.STRING,
  number: Type.NUMBER,
  boolean: Type.BOOLEAN,
};

export function buildCustomToolDeclarations(skills: CustomSkill[]): FunctionDeclaration[] {
  return skills.filter(s => s.active).map(s => {
    const hasParams = s.parameters.length > 0;
    const properties = hasParams
      ? Object.fromEntries(s.parameters.map(p => [p.name, { type: SKILL_TYPE_MAP[p.type] ?? Type.STRING, description: p.description }]))
      : { input: { type: Type.STRING, description: 'Entrada ou pergunta para esta habilidade' } };
    const required = hasParams
      ? s.parameters.filter(p => p.required).map(p => p.name)
      : ['input'];
    return {
      name: `skill_${s.id}`,
      description: `[HABILIDADE EXTERNA: ${s.displayName}] ${s.description}`,
      parameters: { type: Type.OBJECT, properties, required },
    };
  });
}

// Tools tratadas externamente (via onToolCall callback)
export const DELEGATED_TOOLS = new Set([
  'set_mood', 'set_focus_mode', 'save_memory',
  'add_important_date', 'write_diary', 'update_workspace', 'clear_workspace',
  'save_semantic_fact', 'search_semantic_memory', 'search_gmail',
  'save_conversation_summary', 'save_profile_info'
]);
