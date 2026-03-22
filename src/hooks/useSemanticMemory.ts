import { useState, useEffect, useCallback, useRef } from 'react';
import { pipeline, env } from '@xenova/transformers';

// Desativa cache local se quiser forçar download toda vez (útil em dev)
env.cacheDir = '/.cache/transformers/'; // ou deixe padrão

// Tipo simples para documentos indexados
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

  // Cache de embeddings (para não recalcular toda vez)
  const embeddingCache = useRef<Map<string, Float32Array>>(new Map());

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        setIsLoading(true);
        // Carrega o modelo de embedding (só uma vez)
        const pipe = await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
          { quantized: true } // mais leve e rápido
        );
        if (mounted) {
          setEmbedder(pipe);
          setIsLoading(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Falha ao carregar modelo de embedding');
          setIsLoading(false);
        }
      }
    })();

    return () => { mounted = false; };
  }, []);

  // Função que calcula embedding (com cache)
  const getEmbedding = useCallback(async (text: string): Promise<Float32Array> => {
    if (!embedder) throw new Error('Embedder não carregado');

    const cached = embeddingCache.current.get(text);
    if (cached) return cached;

    const output = await embedder(text, { pooling: 'mean', normalize: true });
    const emb = output.data as Float32Array;
    embeddingCache.current.set(text, emb);
    return emb;
  }, [embedder]);

  // Índice simples em memória (pode vir de useUserMemory + useConversationHistory)
  const buildIndex = useCallback(async (docs: MemoryDoc[]) => {
    if (!embedder || docs.length === 0) return [];

    const vectors = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        vector: await getEmbedding(doc.text)
      }))
    );

    return vectors;
  }, [embedder, getEmbedding]);

  // Busca os top-k mais relevantes para uma query
  const retrieve = useCallback(async (
    query: string,
    docs: MemoryDoc[],
    topK = 4
  ): Promise<string[]> => {
    if (!embedder || docs.length === 0) return [];

    const queryVec = await getEmbedding(query);
    const indexed = await buildIndex(docs); // ou cacheie isso se possível

    const scored = indexed.map(item => {
      let similarity = 0;
      for (let i = 0; i < queryVec.length; i++) {
        similarity += queryVec[i] * item.vector[i];
      }
      return { ...item, score: similarity };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(item => `[${item.source.toUpperCase()}] ${item.text}`);
  }, [embedder, getEmbedding, buildIndex]);

  return {
    isLoading,
    error,
    retrieve,           // <- função principal que você vai usar
  };
}
