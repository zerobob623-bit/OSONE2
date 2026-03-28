import { Type, FunctionDeclaration } from "@google/genai";

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
Ações: screenshot, run_command, open_app, type_text, press_key, click, move_mouse, scroll, get_clipboard, set_clipboard, get_active_window, list_windows, system_info.`,
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "Ação a executar.",
          enum: [
            "screenshot",        // Captura a tela inteira → retorna imagem para análise visual
            "run_command",       // Executa comando shell (terminal)
            "open_app",          // Abre um aplicativo pelo nome ou caminho
            "type_text",         // Digita texto na janela ativa (requer foco)
            "press_key",         // Pressiona tecla ou combinação: ctrl+c, super, Return, ctrl+alt+t
            "click",             // Clica em coordenadas (x,y) na tela
            "move_mouse",        // Move o mouse para (x,y) sem clicar
            "scroll",            // Rola a tela: direction=up|down, amount=número de cliques
            "get_clipboard",     // Retorna conteúdo atual da área de transferência
            "set_clipboard",     // Define conteúdo da área de transferência
            "get_active_window", // Retorna o nome da janela ativa
            "list_windows",      // Lista janelas abertas
            "system_info"        // CPU, RAM, disco, uptime, hostname
          ]
        },
        command:   { type: Type.STRING, description: "Comando shell para run_command. Ex: 'ls -la', 'cat arquivo.txt', 'python script.py'" },
        app:       { type: Type.STRING, description: "Nome do aplicativo para open_app. Ex: 'firefox', 'nautilus', 'code', 'spotify'" },
        text:      { type: Type.STRING, description: "Texto a digitar para type_text." },
        key:       { type: Type.STRING, description: "Tecla/combinação para press_key. Ex: 'ctrl+c', 'ctrl+v', 'super', 'Return', 'ctrl+alt+t', 'alt+F4'" },
        x:         { type: Type.NUMBER, description: "Coordenada X em pixels para click/move_mouse." },
        y:         { type: Type.NUMBER, description: "Coordenada Y em pixels para click/move_mouse." },
        button:    { type: Type.NUMBER, description: "Botão do mouse para click: 1=esquerdo (padrão), 2=meio, 3=direito." },
        direction: { type: Type.STRING, description: "Direção para scroll: 'up' ou 'down'." },
        amount:    { type: Type.NUMBER, description: "Quantidade de cliques de scroll (padrão: 3)." },
        content:   { type: Type.STRING, description: "Conteúdo para set_clipboard." }
      },
      required: ["action"]
    }
  },
];

// Tools tratadas externamente (via onToolCall callback)
export const DELEGATED_TOOLS = new Set([
  'set_mood', 'set_focus_mode', 'save_memory',
  'add_important_date', 'write_diary', 'update_workspace', 'clear_workspace',
  'save_semantic_fact', 'search_semantic_memory', 'search_gmail',
  'save_conversation_summary', 'save_profile_info'
]);
