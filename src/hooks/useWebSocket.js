import { useState, useEffect, useRef } from 'react';
import { wsUrl } from '../config/deskApi';

const RECONNECT_MS = 4000;

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [lastEventAt, setLastEventAt] = useState(null);
  const timerRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const open = () => {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        if (cancelled) return;
        setConnected(true);
        setReconnecting(false);
      };
      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        setReconnecting(true);
        timerRef.current = window.setTimeout(open, RECONNECT_MS);
      };
      ws.onmessage = (e) => {
        try {
          setLastMessage(JSON.parse(e.data));
        } catch {
          setLastMessage(e.data);
        }
        setLastEventAt(new Date());
      };
    };

    open();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      try {
        wsRef.current?.close();
      } catch {
        /* ignore */
      }
    };
  }, []);

  return { connected, reconnecting, lastMessage, lastEventAt };
}
