// useConversationHistory.ts — localStorage puro (sem Firebase)

import { useState, useCallback } from 'react';

const MSG_KEY = 'osone_conversation_v2';
const MAX_MSGS = 100;

export interface Message {
  id?: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  createdAt?: string; // ISO date string
  userId: string;
}

export function useConversationHistory() {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(MSG_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const addMessage = useCallback((msg: { role: 'user' | 'model'; text: string; imageUrl?: string }) => {
    setMessages(prev => {
      const next: Message[] = [
        { ...msg, id: crypto.randomUUID(), userId: 'local', createdAt: new Date().toISOString() },
        ...prev,
      ].slice(0, MAX_MSGS);
      localStorage.setItem(MSG_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteAll = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(MSG_KEY);
  }, []);

  return { messages, addMessage, deleteAll };
}
