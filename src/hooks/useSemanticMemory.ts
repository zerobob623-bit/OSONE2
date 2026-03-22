import { useState, useEffect, useCallback, useRef } from 'react';

type MemoryDoc = {
  id: string;
  text: string;
  source: 'fact' | 'diary' | 'history' | 'workspace';
  timestamp: number;
};

export function useSemanticMemory() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache simples de palavras
  const wordCache = useRef<Map<string, Set<string>>>(new Map());

  // 🔤 transforma texto em conjunto de palavras
  const textToWordSet = useCallback((text: string): Set<string> => {
    const normalized = text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(Boolean);

    return new Set(normalized);
  }, []);

  // 🧠 "similaridade" baseada em interseção de palavras
  const getSimilarity = useCallback((a: Set<string>, b: Set<string>) => {
    let intersection = 0;

    a.forEach(word => {
      if (b.has(word)) intersection++;
    });

    return intersection / (a.size + b.size - intersection || 1);
  }, []);

  // 🚀 principal função (RAG leve)
  const retrieveRelevantContext = useCallback(async (
    query: string,
    docs: MemoryDoc[],
    topK: number = 5
  ): Promise<string> => {

    if (!docs || docs.length === 0) return '';

    try {
      const queryWords = textToWordSet(query);

      const scored = docs.map(doc => {
        let docWords = wordCache.current.get(doc.id);

        if (!docWords) {
          docWords = textToWordSet(doc.text);
          wordCache.current.set(doc.id, docWords);
        }

        const score = getSimilarity(queryWords, docWords);

        return { doc, score };
      });

      const top = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .filter(item => item.score > 0) // só relevantes
        .map(({ doc }) => `[${doc.source.toUpperCase()}] ${doc.text.trim()}`);

      return top.length > 0
        ? `\n\nMEMÓRIA RELEVANTE:\n${top.join('\n\n')}`
        : '';

    } catch (err) {
      console.error('Erro na memória:', err);
      return '';
    }
  }, [textToWordSet, getSimilarity]);

  return {
    isLoading,
    error,
    retrieveRelevantContext,
  };
}
