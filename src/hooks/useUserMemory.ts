// useUserMemory.ts — localStorage puro (sem Firebase)
// Memória persiste localmente, sem dependência de rede ou autenticação.

import { useState, useCallback } from 'react';

export interface ImportantDate {
  label: string;
  date: string;
  year?: string;
}

export interface DiaryEntry {
  id?: string;
  content: string;
  mood?: string;
  createdAt: string; // ISO date string
  userId: string;
}

export interface SemanticFact {
  concept: string;
  definition: string;
  category: string;
  embedding?: number[];
}

export interface ConversationSummary {
  id?: string;
  summary: string;
  topics: string[];
  createdAt: string; // ISO date string
  embedding?: number[];
}

export interface UserMemory {
  userName?: string;
  facts: string[];
  preferences: string[];
  importantDates: ImportantDate[];
  workspace?: string;
  semanticMemory?: SemanticFact[];
  summaries?: ConversationSummary[];
  lastSessionAt?: string;     // ISO — quando a última sessão terminou
  lastSessionNote?: string;   // resumo do último assunto
}

// ─── Chaves localStorage ──────────────────────────────────────────────────────
const MEMORY_KEY = 'osone_memory_v2';
const DIARY_KEY  = 'osone_diary_v2';

const EMPTY_MEMORY: UserMemory = {
  facts: [],
  preferences: [],
  importantDates: [],
  semanticMemory: [],
  summaries: [],
};

function readMemory(): UserMemory {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    return raw ? { ...EMPTY_MEMORY, ...JSON.parse(raw) } : { ...EMPTY_MEMORY };
  } catch {
    return { ...EMPTY_MEMORY };
  }
}

function writeMemory(mem: UserMemory) {
  localStorage.setItem(MEMORY_KEY, JSON.stringify(mem));
}

function readDiary(): DiaryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(DIARY_KEY) || '[]');
  } catch {
    return [];
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useUserMemory() {
  const [memory, setMemory] = useState<UserMemory>(readMemory);
  const [diary,  setDiary]  = useState<DiaryEntry[]>(readDiary);

  // Atualiza estado + persiste
  const mutate = useCallback((updater: (prev: UserMemory) => UserMemory) => {
    setMemory(prev => {
      const next = updater(prev);
      writeMemory(next);
      return next;
    });
  }, []);

  const saveMemory = useCallback((partial: Partial<UserMemory>) => {
    mutate(prev => ({ ...prev, ...partial }));
  }, [mutate]);

  const addFact = useCallback((fact: string) => {
    mutate(prev => ({
      ...prev,
      facts: [...(prev.facts || []), fact].slice(-150),
    }));
  }, [mutate]);

  const addImportantDate = useCallback((date: ImportantDate) => {
    mutate(prev => ({
      ...prev,
      importantDates: [...(prev.importantDates || []), date],
    }));
  }, [mutate]);

  const addDiaryEntry = useCallback((content: string, mood?: string) => {
    const entry: DiaryEntry = {
      id: crypto.randomUUID(),
      content,
      mood: mood || 'neutral',
      createdAt: new Date().toISOString(),
      userId: 'local',
    };
    setDiary(prev => {
      const next = [entry, ...prev].slice(0, 200);
      localStorage.setItem(DIARY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const getUpcomingDates = useCallback(() => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);
    return (memory.importantDates || []).filter(d => {
      const [day, month] = d.date.split('/').map(Number);
      const dateThisYear = new Date(today.getFullYear(), month - 1, day);
      return dateThisYear >= today && dateThisYear <= nextWeek;
    });
  }, [memory.importantDates]);

  const updateWorkspace = useCallback((content: string) => {
    mutate(prev => ({ ...prev, workspace: content }));
  }, [mutate]);

  const clearWorkspace = useCallback(() => {
    mutate(prev => {
      const { workspace: _, ...rest } = prev;
      return rest as UserMemory;
    });
  }, [mutate]);

  const addSemanticFact = useCallback(
    (concept: string, definition: string, category: string, _embedding?: number[]) => {
      mutate(prev => ({
        ...prev,
        semanticMemory: [
          ...(prev.semanticMemory || []),
          { concept, definition, category },
        ].slice(-300),
      }));
    },
    [mutate],
  );

  const addSummary = useCallback(
    (summary: string, topics: string[], _embedding?: number[]) => {
      mutate(prev => ({
        ...prev,
        summaries: [
          ...(prev.summaries || []),
          { id: crypto.randomUUID(), summary, topics, createdAt: new Date().toISOString() },
        ].slice(-100),
      }));
    },
    [mutate],
  );

  /** Salva o momento do fim da sessão e um resumo breve do último assunto. */
  const saveSessionEnd = useCallback((note?: string) => {
    mutate(prev => ({
      ...prev,
      lastSessionAt: new Date().toISOString(),
      ...(note ? { lastSessionNote: note } : {}),
    }));
  }, [mutate]);

  /**
   * Gera um parágrafo de contexto de retomada para incluir no system instruction.
   * Retorna string vazia se é a primeira sessão.
   */
  const getSessionContext = useCallback((): string => {
    const mem = readMemory();
    if (!mem.lastSessionAt) return '';

    const now  = new Date();
    const last = new Date(mem.lastSessionAt);
    const diffMs   = now.getTime() - last.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays  = Math.floor(diffHours / 24);

    let elapsed = '';
    if (diffMins < 2)        elapsed = 'há poucos minutos';
    else if (diffMins < 60)  elapsed = `há ${diffMins} minutos`;
    else if (diffHours < 24) elapsed = `há ${diffHours} hora${diffHours > 1 ? 's' : ''}`;
    else if (diffDays === 1) elapsed = 'ontem';
    else if (diffDays < 7)   elapsed = `há ${diffDays} dias`;
    else if (diffDays < 30)  elapsed = `há ${Math.floor(diffDays / 7)} semana${Math.floor(diffDays / 7) > 1 ? 's' : ''}`;
    else                     elapsed = `há ${Math.floor(diffDays / 30)} mese${Math.floor(diffDays / 30) > 1 ? 's' : ''}`;

    const lastNote = mem.lastSessionNote
      ? `O último assunto foi: "${mem.lastSessionNote}".`
      : '';

    const recentFact = mem.facts?.slice(-1)[0]
      ? `A última coisa que você aprendeu sobre o usuário: "${mem.facts.slice(-1)[0]}".`
      : '';

    return `\n━━ RETOMADA DE SESSÃO ━━
O usuário está voltando após ${elapsed} (última sessão: ${last.toLocaleString('pt-BR')}).
${lastNote}
${recentFact}
INSTRUÇÃO: Cumprimente referenciando o tempo que passou e, se houver nota do último assunto, retome naturalmente. Seja espontânea, não mecânica.
━━ FIM DA RETOMADA ━━`;
  }, []);

  return {
    memory,
    diary,
    saveMemory,
    addFact,
    addImportantDate,
    addDiaryEntry,
    updateWorkspace,
    clearWorkspace,
    addSemanticFact,
    addSummary,
    getUpcomingDates,
    saveSessionEnd,
    getSessionContext,
  };
}
