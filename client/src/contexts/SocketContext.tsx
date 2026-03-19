import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'https://maxcord.fun';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (token) {
      const newSocket = io(SOCKET_URL, {
        auth: { token },
        transports: ['websocket'], // Prefer websocket for performance
        reconnection: true,
        reconnectionAttempts: 5
      });
      newSocket.on('connect', () => {
        console.log('Successfully connected to Socket.io at', SOCKET_URL);
        setConnected(true);
      });
      newSocket.on('disconnect', () => setConnected(false));
      newSocket.on('connect_error', (err) => {
        console.warn('Socket connection error to', SOCKET_URL, err);
        setConnected(false);
      });
      setSocket(newSocket);
      return () => { newSocket.close(); };
    }
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
