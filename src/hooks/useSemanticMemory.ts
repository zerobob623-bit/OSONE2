import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { pipeline, env } from '@huggingface/transformers';

// Configurações para melhor performance/cache no browser
env.allowRemoteModels = true;
env.cacheDir = '/.cache/transformers/'; // cache no IndexedDB

type MemoryDoc = {
  id: string;
  text: string;
  source: 'fact' | 'diary' | 'history' | 'workspace';
  timestamp: number;
};

export function useSemanticMemory() {
  const [embedder, setEmbedder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cache de embeddings para evitar recalcular o mesmo texto
  const embeddingCache = useRef<Map<string, Float32Array>>(new Map());

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        console.log('Carregando modelo de embeddings...');

        // Modelo leve e bom para similaridade semântica no browser
        const pipe = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
          { quantized: true } // mais rápido e usa menos memória
        );

        if (mounted) {
          setEmbedder(pipe);
          setIsLoading(false);
          console.log('Modelo de embeddings carregado com sucesso!');
        }
      } catch (err: any) {
        console.error('Erro ao carregar embeddings:', err);
        if (mounted) {
          setError(err?.message || 'Falha ao carregar o modelo de memória inteligente');
          setIsLoading(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  const getEmbedding = useCallback(async (text: string): Promise<Float32Array> => {
    if (!embedder) throw new Error('Modelo ainda não carregado');

    const normalizedText = text.trim().toLowerCase();
    const cached = embeddingCache.current.get(normalizedText);
    if (cached) return cached;

    const output = await embedder(normalizedText, { pooling: 'mean', normalize: true });
    const emb = output.data as Float32Array;
    embeddingCache.current.set(normalizedText, emb);
    return emb;
  }, [embedder]);

  // Função principal: recupera os trechos mais relevantes
  const retrieveRelevantContext = useCallback(async (
    query: string,
    docs: MemoryDoc[],
    topK: number = 5
  ): Promise<string> => {
    if (!embedder || isLoading || docs.length === 0) {
      return ''; // fallback silencioso
    }

    try {
      const queryVec = await getEmbedding(query);

      const scored = await Promise.all(
        docs.map(async (doc) => {
          const docVec = await getEmbedding(doc.text);
          let similarity = 0;
          for (let i = 0; i < queryVec.length; i++) {
            similarity += queryVec[i] * docVec[i];
          }
          return { doc, score: similarity };
        })
      );

      const top = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
        .map(({ doc }) => `[${doc.source.toUpperCase()}] ${doc.text.trim()}`);

      return top.length > 0
        ? `\n\nMEMÓRIA RELEVANTE (use naturalmente na resposta):\n${top.join('\n\n')}`
        : '';
    } catch (err) {
      console.error('Erro na busca semântica:', err);
      return '';
    }
  }, [embedder, getEmbedding, isLoading]);

  return {
    isLoading,
    error,
    retrieveRelevantContext,  // <- Essa é a função que você chama
  };
}
