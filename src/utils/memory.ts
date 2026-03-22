type Memory = {
  text: string;
  timestamp: number;
};

const KEY = "osone_memory";

export const saveMemory = (text: string) => {
  const memories: Memory[] = JSON.parse(localStorage.getItem(KEY) || "[]");

  memories.push({
    text,
    timestamp: Date.now()
  });

  localStorage.setItem(KEY, JSON.stringify(memories));
};

export const getMemories = (): Memory[] => {
  return JSON.parse(localStorage.getItem(KEY) || "[]");
};

// 🧠 busca simples por relevância
export const findRelevantMemories = (query: string, limit = 3) => {
  const memories = getMemories();

  const words = query.toLowerCase().split(" ");

  const scored = memories.map(m => {
    let score = 0;

    for (const word of words) {
      if (m.text.toLowerCase().includes(word)) {
        score++;
      }
    }

    return { ...m, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.text);
};
    return { ...m, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(m => m.text);
};
