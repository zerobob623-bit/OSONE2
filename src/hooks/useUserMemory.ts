import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, onSnapshot, setDoc, collection, query, orderBy, limit, addDoc, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAppStore } from '../store/useAppStore';

export interface ImportantDate {
  label: string;
  date: string;
  year?: string;
}

export interface DiaryEntry {
  id?: string;
  content: string;
  mood?: string;
  createdAt: Timestamp;
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
  createdAt: Timestamp;
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
}

export function useUserMemory() {
  const [memory, setMemory] = useState<UserMemory>({
    facts: [],
    preferences: [],
    importantDates: [],
    semanticMemory: [],
    summaries: []
  });
  const [diary, setDiary] = useState<DiaryEntry[]>([]);
  const { userId } = useAppStore();
  const memoryUnsubscribeRef = useRef<(() => void) | null>(null);
  const diaryUnsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!userId) {
      setMemory({ facts: [], preferences: [], importantDates: [], semanticMemory: [], summaries: [] });
      setDiary([]);
      if (memoryUnsubscribeRef.current) memoryUnsubscribeRef.current();
      if (diaryUnsubscribeRef.current) diaryUnsubscribeRef.current();
      return;
    }

    // Memory listener
    const memoryPath = `users/${userId}/memory/main`;
    const memoryUnsubscribe = onSnapshot(doc(db, memoryPath), (snapshot) => {
      if (snapshot.exists()) {
        setMemory(snapshot.data() as UserMemory);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, memoryPath);
    });
    memoryUnsubscribeRef.current = memoryUnsubscribe;

    // Diary listener
    const diaryPath = `users/${userId}/diary`;
    const q = query(
      collection(db, diaryPath),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const diaryUnsubscribe = onSnapshot(q, (snapshot) => {
      const entries = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as DiaryEntry[];
      setDiary(entries);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, diaryPath);
    });
    diaryUnsubscribeRef.current = diaryUnsubscribe;

    return () => {
      if (memoryUnsubscribeRef.current) memoryUnsubscribeRef.current();
      if (diaryUnsubscribeRef.current) diaryUnsubscribeRef.current();
    };
  }, [userId]);

  const saveMemory = useCallback(async (partial: Partial<UserMemory>) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      // Filter out undefined values to prevent Firestore error
      const cleanPartial = Object.fromEntries(
        Object.entries(partial).filter(([_, v]) => v !== undefined)
      );
      await setDoc(doc(db, path), { ...memory, ...cleanPartial }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const addFact = useCallback(async (fact: string) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      await setDoc(doc(db, path), { 
        ...memory, 
        facts: [...(memory.facts || []), fact] 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const addImportantDate = useCallback(async (date: ImportantDate) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      const newDate: any = { label: date.label, date: date.date };
      if (date.year) newDate.year = date.year;
      await setDoc(doc(db, path), { 
        ...memory, 
        importantDates: [...(memory.importantDates || []), newDate] 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const addDiaryEntry = useCallback(async (content: string, mood?: string) => {
    if (!userId) return;
    const path = `users/${userId}/diary`;
    try {
      await addDoc(collection(db, path), {
        content,
        mood: mood || 'neutral',
        createdAt: Timestamp.now(),
        userId
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  }, [userId]);

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

  const updateWorkspace = useCallback(async (content: string) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      await setDoc(doc(db, path), { 
        ...memory, 
        workspace: content 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const clearWorkspace = useCallback(async () => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      const { workspace, ...rest } = memory;
      await setDoc(doc(db, path), rest);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const addSemanticFact = useCallback(async (concept: string, definition: string, category: string, embedding?: number[]) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      const newFact: any = { concept, definition, category };
      if (embedding) newFact.embedding = embedding;
      await setDoc(doc(db, path), { 
        ...memory, 
        semanticMemory: [...(memory.semanticMemory || []), newFact] 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

  const addSummary = useCallback(async (summary: string, topics: string[], embedding?: number[]) => {
    if (!userId) return;
    const path = `users/${userId}/memory/main`;
    try {
      const newSummary: any = { summary, topics, createdAt: Timestamp.now() };
      if (embedding) newSummary.embedding = embedding;
      await setDoc(doc(db, path), { 
        ...memory, 
        summaries: [...(memory.summaries || []), newSummary] 
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, path);
    }
  }, [userId, memory]);

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
    getUpcomingDates
  };
}
