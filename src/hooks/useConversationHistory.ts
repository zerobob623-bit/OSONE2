import { useState, useEffect, useCallback, useRef } from 'react';
import { collection, query, orderBy, limit, onSnapshot, addDoc, deleteDoc, doc, Timestamp, where, getDocs, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAppStore } from '../store/useAppStore';

export interface Message {
  id?: string;
  role: 'user' | 'model';
  text: string;
  imageUrl?: string;
  createdAt?: Timestamp;
  userId: string;
}

export function useConversationHistory() {
  const [messages, setMessages] = useState<Message[]>([]);
  const { userId } = useAppStore();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userId) {
      setMessages([]);
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
      return;
    }

    const path = `users/${userId}/messages`;
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    unsubscribeRef.current = unsubscribe;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [userId]);

  const addMessage = useCallback(async (msg: { role: 'user' | 'model'; text: string; imageUrl?: string }) => {
    if (!userId) return;

    const path = `users/${userId}/messages`;
    try {
      await addDoc(collection(db, path), {
        ...msg,
        userId,
        createdAt: Timestamp.now()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }, [userId]);

  const deleteAll = useCallback(async () => {
    if (!userId) return;

    const path = `users/${userId}/messages`;
    try {
      const q = query(collection(db, path));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  }, [userId]);

  return {
    messages,
    addMessage,
    deleteAll
  };
}
