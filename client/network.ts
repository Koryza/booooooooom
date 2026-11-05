import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameState, Result, Session } from '../shared/types';
export function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem('bunker:cards:session:v2') || 'null');
    return s?.token && s?.code && s?.playerId ? s : null;
  } catch {
    return null;
  }
}
export function useGame() {
  const [state, setState] = useState<GameState | null>(null);
  const [session, setSession] = useState<Session | null>(readSession);
  const sessionRef = useRef(session);
  const [connected, setConnected] = useState(false);
  const [recovering, setRecovering] = useState(!!session);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const socketRef = useRef<Socket | null>(null);
  function remember(value: Session | null) {
    sessionRef.current = value;
    setSession(value);
    try {
      if (value) localStorage.setItem('bunker:cards:session:v2', JSON.stringify(value));
      else localStorage.removeItem('bunker:cards:session:v2');
    } catch {
      setNotice('Хранилище браузера недоступно. Сохраните ключ сессии в настройках.');
    }
  }
  function send<T = undefined>(event: string, data: unknown = null): Promise<T> {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected)
        return reject(new Error('Нет связи с сервером. Ждём переподключения.'));
      socket.timeout(8000).emit(event, data, (timeout: Error | null, result: Result<T>) => {
        if (timeout)
          return reject(
            new Error('Сервер не ответил. Состояние синхронизируется при подключении.'),
          );
        if (!result?.ok) return reject(new Error(result?.error || 'Ошибка протокола'));
        resolve(result.data);
      });
    });
  }
  useEffect(() => {
    const socket = io({ autoConnect: false, reconnection: true });
    socketRef.current = socket;
    socket.on('state', (s: GameState) => setState(s));
    socket.on('connect', () => {
      setConnected(true);
      setError('');
      if (sessionRef.current)
        void send<Session>('resume', sessionRef.current)
          .catch((e) => {
            setError(e.message);
            if (e.message.includes('недействительна')) {
              remember(null);
              setState(null);
            }
          })
          .finally(() => setRecovering(false));
      else setRecovering(false);
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
      setError('Сервер недоступен. Проверьте подключение.');
    });
    socket.on('replaced', () =>
      setError('Сессия открыта в другой вкладке. Обновите страницу, чтобы вернуться сюда.'),
    );
    socket.on('kicked', () => {
      remember(null);
      setState(null);
      setError('Лидер исключил вас из лобби');
    });
    socket.connect();
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  async function enter(event: 'create' | 'join', data: unknown) {
    const value = await send<Session>(event, data);
    remember(value);
    setError('');
  }
  async function leave() {
    await send('leave');
    remember(null);
    setState(null);
    history.replaceState(null, '', location.pathname);
  }
  async function act(event: string, data?: unknown) {
    try {
      return await send(event, data);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return {
    state,
    session,
    connected,
    recovering,
    error,
    notice,
    setError,
    setNotice,
    enter,
    leave,
    act,
    send,
    remember,
  };
}
export type GameConnection = ReturnType<typeof useGame>;
