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
    description: "Mostra a letra de uma música na tela linha por linha.",
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
    description: "Salva informações importantes sobre o usuário.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        userName: { type: Type.STRING },
        fact: { type: Type.STRING },
        preference: { type: Type.STRING }
      },
      required: ["fact"]
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
    name: "search_email",
    description: "Pesquisa nos e-mails do usuário usando IMAP.",
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
  }
];

// Tools tratadas externamente (via onToolCall callback)
export const DELEGATED_TOOLS = new Set([
  'show_lyrics', 'set_mood', 'set_focus_mode', 'save_memory',
  'add_important_date', 'write_diary', 'update_workspace', 'clear_workspace',
  'save_semantic_fact', 'search_semantic_memory', 'search_gmail',
  'search_email', 'save_conversation_summary', 'save_profile_info'
]);
