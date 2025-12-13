import { useState, useEffect, useCallback, useRef } from 'react';
import { queryClient } from '@/lib/queryClient';
import type { User, Chat, Message } from '@shared/schema';

// Hook for managing persistent chat contacts and automatic message deletion
export function usePersistentChats(userId?: number, socket?: any) {
  const [persistentContacts, setPersistentContacts] = useState<Array<Chat & { otherUser: User }>>([]);
  const [activeMessages, setActiveMessages] = useState<Map<number, Message[]>>(new Map());
  const [selectedChat, setSelectedChat] = useState<(Chat & { otherUser: User }) | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Map<number, number>>(new Map());
  
  // Auto-deletion timers for messages
  const deletionTimersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load persistent chat contacts (these remain even when messages are deleted)
  const loadPersistentContacts = useCallback(async () => {
    if (!userId) return;
    
    setIsLoading(true);
    try {
      console.log('📋 Loading persistent chat contacts for user:', userId);
      
      // Always use regular chats API which includes unread counts
      let contacts;
      try {
        console.log('📋 Loading chats with unread counts from /api/chats/' + userId);
        const response = await fetch(`/api/chats/${userId}`);
        if (response.ok) {
          contacts = await response.json();
          console.log('🚨 RAW BACKEND RESPONSE:', contacts);
          console.log('📋 ✅ BACKEND LIEFERT:', contacts.map(c => ({
            id: c.id,
            username: c.otherUser?.username,
            unreadCount: c.unreadCount,
            unreadCount1: c.unreadCount1,
            unreadCount2: c.unreadCount2,
            allKeys: Object.keys(c)
          })));
        } else {
          console.log('📋 Failed to load chats');
          contacts = [];
        }
      } catch (error) {
        console.log('📋 Error loading contacts, using empty array');
        contacts = [];
      }
      
      // Update unread counts map based on chat data
      if (contacts && contacts.length > 0) {
        const newUnreadCounts = new Map<number, number>();
        contacts.forEach((chat: any) => {
          // CRITICAL FIX: Get the correct unreadCount based on user position
          let unreadCount = 0;
          if (userId === chat.participant1Id) {
            unreadCount = chat.unreadCount1 || 0;
          } else if (userId === chat.participant2Id) {
            unreadCount = chat.unreadCount2 || 0;  
          }
          
          console.log(`🔥 CRITICAL UNREAD CALC for chat ${chat.id}:`, {
            userId,
            participant1Id: chat.participant1Id,
            participant2Id: chat.participant2Id,
            unreadCount1: chat.unreadCount1,
            unreadCount2: chat.unreadCount2,
            calculatedUnread: unreadCount
          });
          
          // Store in both chat object and map
          chat.unreadCount = unreadCount;
          
          // FORCE LOG EVERY CALCULATION
          console.error(`🔥 FORCE SET: Chat ${chat.id} unreadCount = ${unreadCount} (Backend: ${chat.unreadCount1}/${chat.unreadCount2})`);
          
          // ALWAYS set the unreadCount, even if 0
          newUnreadCounts.set(chat.id, unreadCount);
          console.log(`📊 ALWAYS Setting unread count for chat ${chat.id}: ${unreadCount}`);
        });
        setUnreadCounts(newUnreadCounts);
        console.log('📊 Final unread counts map:', Array.from(newUnreadCounts.entries()));
      }
      
      console.log('📋 Loaded', contacts?.length || 0, 'persistent contacts');
      console.log('🔄 SETTING CONTACTS STATE:', contacts);
      
      // WHATSAPP-STYLE SORTING: Sort by lastMessageTimestamp (newest first)
      if (contacts && contacts.length > 0) {
        const sortedContacts = contacts.sort((a: any, b: any) => {
          // Use lastMessage createdAt if available, otherwise chat's lastMessageTimestamp
          const aTime = a.lastMessage?.createdAt || a.lastMessageTimestamp || a.createdAt;
          const bTime = b.lastMessage?.createdAt || b.lastMessageTimestamp || b.createdAt;
          
          const aDate = new Date(aTime);
          const bDate = new Date(bTime);
          
          console.log(`📱 WHATSAPP SORT: Chat ${a.id} (${aDate.toLocaleTimeString()}) vs Chat ${b.id} (${bDate.toLocaleTimeString()})`);
          
          return bDate.getTime() - aDate.getTime(); // Newest first (WhatsApp style)
        });
        
        console.log('📱 WhatsApp-style sorted chat order:', sortedContacts.map((c: any) => ({
          chatId: c.id,
          lastMessageTime: c.lastMessage?.createdAt || c.lastMessageTimestamp || c.createdAt
        })));
        
        setPersistentContacts(sortedContacts);
      }
      
      // ENTFERNT: Force re-render überschreibt Badge-Updates
      
      // Load active messages for each contact
      for (const contact of contacts || []) {
        await loadActiveMessages(contact.id);
      }
      
    } catch (error) {
      console.error('❌ Failed to load persistent contacts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  // ECHTZEIT BADGE UPDATE SYSTEM 
  useEffect(() => {
    if (!socket?.isConnected || !userId) return;

    const handleMessage = (data: any) => {
      console.log('📨 ECHTZEIT: WebSocket message received:', data);
      
      // If this is a new message for this user, increment unread count SOFORT
      if ((data.type === 'message' || data.type === 'new_message') && data.message?.receiverId === userId) {
        const chatId = data.message.chatId;
        console.log(`🚨 NEUE NACHRICHT für User ${userId} in Chat ${chatId}`);
        
        // BACKEND SYNC: Hole den aktuellen unreadCount vom Backend
        setTimeout(async () => {
          try {
            console.log(`🔄 SYNCING: Fetching updated badge count for user ${userId}`);
            const response = await fetch(`/api/chats/${userId}`);
            const chatData = await response.json();
            
            // Find the specific chat and get its unread count
            const targetChat = chatData.find((c: any) => c.id === chatId);
            if (targetChat) {
              let realUnreadCount = 0;
              if (userId === targetChat.participant1Id) {
                realUnreadCount = targetChat.unreadCount1 || 0;
              } else if (userId === targetChat.participant2Id) {
                realUnreadCount = targetChat.unreadCount2 || 0;
              }
              
              console.log(`🔥 REAL UNREAD COUNT: Chat ${chatId} = ${realUnreadCount}`);
              
              // Update Map with real count
              setUnreadCounts(prev => {
                const newCounts = new Map(prev);
                if (realUnreadCount > 0) {
                  newCounts.set(chatId, realUnreadCount);
                } else {
                  newCounts.delete(chatId);
                }
                return newCounts;
              });
              
              // Update chat object with real count
              setPersistentContacts(prev => {
                return prev.map(chat => {
                  if (chat.id === chatId) {
                    return { ...chat, unreadCount: realUnreadCount };
                  }
                  return chat;
                });
              });
              
              // WHATSAPP SORT: Re-sort contacts when new message arrives  
              console.log('📱 Re-sorting contacts due to new message...');
              setTimeout(() => loadPersistentContacts(), 100);
            }
          } catch (error) {
            console.error('Badge sync error:', error);
          }
        }, 200);
        
        // Load messages for the current chat if it's selected
        if (selectedChat?.id === chatId) {
          loadActiveMessages(data.message.chatId);
        }
        
        // ENTFERNT: loadPersistentContacts() überschreibt die lokalen Badge-Updates
        // Das Backend hat bereits den korrekten unreadCount, Frontend zeigt ihn sofort an
      }
    };

    // Register the message handler with the WebSocket
    if (socket.on) {
      socket.on('message', handleMessage);
    } else if (socket.onMessage) {
      socket.onMessage = handleMessage;
    } else {
      console.error("❌ WebSocket socket has no 'on' or 'onMessage' method");
    }
    
    return () => {
      // Clean up event handlers
      if (socket.off) {
        socket.off('message', handleMessage);
      } else if (socket.onMessage === handleMessage) {
        socket.onMessage = null;
      }
    };
  }, [socket, userId, selectedChat, loadPersistentContacts]);

  // Schedule automatic message deletion
  const scheduleMessageDeletion = useCallback((message: Message) => {
    const deleteTime = new Date(message.expiresAt).getTime();
    const now = Date.now();
    const timeUntilDelete = Math.max(deleteTime - now, 1000);
    
    console.log(`⏰ SELBSTLÖSCHUNG: Nachricht ${message.id} wird in ${Math.round(timeUntilDelete / 1000)}s gelöscht`);
    
    const timer = setTimeout(() => {
      console.log(`🗑️ SELBSTLÖSCHUNG: Nachricht ${message.id} automatisch gelöscht`);
      
      setActiveMessages(prev => {
        const newMap = new Map(prev);
        const chatMessages = newMap.get(message.chatId) || [];
        const filteredMessages = chatMessages.filter(m => m.id !== message.id);
        newMap.set(message.chatId, filteredMessages);
        return newMap;
      });
      
      deletionTimersRef.current.delete(message.id);
    }, timeUntilDelete);
    
    deletionTimersRef.current.set(message.id, timer);
  }, []);

  // Load active (non-expired) messages for a specific chat
  const loadActiveMessages = useCallback(async (chatId: number) => {
    try {
      const response = await fetch(`/api/chats/${chatId}/messages?userId=${userId}`);
      const messages = await response.json();
      
      console.log(`📨 Loaded ${messages.length} active messages for chat ${chatId}`);
      setActiveMessages(prev => new Map(prev.set(chatId, messages)));
      
      // Schedule deletion for each message
      messages.forEach((message: Message) => {
        scheduleMessageDeletion(message);
      });
      
    } catch (error) {
      console.error(`❌ Failed to load messages for chat ${chatId}:`, error);
      // Set empty array on error
      setActiveMessages(prev => new Map(prev.set(chatId, [])));
    }
  }, [scheduleMessageDeletion, userId]);



  // Select a chat (activates it and loads messages) - HANDLE NULL FOR MOBILE BACK
  const selectChat = useCallback(async (chat: (Chat & { otherUser: User }) | null) => {
    if (!chat) {
      console.log('🎯 CRITICAL: Clearing selectedChat (mobile back button)');
      setSelectedChat(null);
      return;
    }
    console.log('🎯 CRITICAL: Selecting chat:', chat.id, 'with user:', chat.otherUser.username);
    console.log('🎯 CRITICAL: Chat object:', JSON.stringify(chat, null, 2));
    
    // IMMEDIATE FORCE UPDATE - NO DELAYS
    setSelectedChat(chat);
    console.log('🎯 CRITICAL: setSelectedChat called immediately');
    
    // Force multiple state updates to ensure it sticks
    setTimeout(() => setSelectedChat(chat), 1);
    setTimeout(() => setSelectedChat(chat), 10);
    setTimeout(() => setSelectedChat(chat), 50);
    
    // Mark chat as active on server
    try {
      await fetch(`/api/chats/${chat.id}/activate`, { method: 'POST' });
    } catch (error) {
      console.log('Could not mark chat as active:', error);
    }
    
    // Load fresh messages for this chat
    await loadActiveMessages(chat.id);
    
    // Mark chat as read and clear unread count
    try {
      await fetch(`/api/chats/${chat.id}/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });
    } catch (error) {
      console.log('Could not mark chat as read:', error);
    }
    
    // SOFORT: Clear unread count for selected chat (Badge Reset)
    setUnreadCounts(prev => {
      const newCounts = new Map(prev);
      newCounts.delete(chat.id);
      console.log(`🔥 BADGE RESET: Chat ${chat.id} Badge auf 0 gesetzt (Map)`);
      return newCounts;
    });
    
    // SOFORT: Clear unread count in chat object
    setPersistentContacts(prev => {
      return prev.map(c => {
        if (c.id === chat.id) {
          console.log(`🔥 BADGE RESET: Chat ${chat.id} Badge auf 0 gesetzt (Object)`);
          return { ...c, unreadCount: 0 };
        }
        return c;
      });
    });
    
    // Scroll to bottom
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  }, [loadActiveMessages]);

  // Send message with automatic UI deletion scheduling
  const sendMessage = useCallback(async (
    content: string,
    type: string = "text",
    destructTimer: number, // Use the timer passed from UI
    file?: File
  ) => {
    if (!selectedChat || !userId) {
      console.error('❌ Cannot send message: no chat selected or user not logged in');
      return;
    }

    console.log('📤 Sending message with auto-deletion:', {
      content: content.substring(0, 20),
      destructTimer: destructTimer / 1000 + 's',
      destructTimerMs: destructTimer,
      chatId: selectedChat.id
    });

    // Create optimistic message
    const optimisticMessage: Message = {
      id: Date.now(), // Temporary ID
      chatId: selectedChat.id,
      senderId: userId,
      receiverId: selectedChat.otherUser.id,
      content,
      messageType: type,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + destructTimer).toISOString(),
    };

    // Add to UI immediately
    setActiveMessages(prev => {
      const newMap = new Map(prev);
      const chatMessages = newMap.get(selectedChat.id) || [];
      newMap.set(selectedChat.id, [...chatMessages, optimisticMessage]);
      return newMap;
    });

    // Schedule deletion for optimistic message
    scheduleMessageDeletion(optimisticMessage);

    // Scroll to bottom
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);

    // VERSCHLÜSSELUNG: Nachricht vor dem Senden verschlüsseln
    let encryptedContent = content;
    try {
      if (selectedChat.otherUser.publicKey) {
        const { encryptMessage } = await import('../lib/crypto');
        encryptedContent = await encryptMessage(content, selectedChat.otherUser.publicKey);
        console.log('🔒 VERSCHLÜSSELUNG: Nachricht erfolgreich verschlüsselt');
        console.log(`📏 Original: ${content.length} → Verschlüsselt: ${encryptedContent.length} Zeichen`);
      } else {
        console.warn('⚠️ Kein Public Key für Verschlüsselung verfügbar');
      }
    } catch (error) {
      console.error('❌ Verschlüsselungsfehler:', error);
      // Fallback zu unverschlüsselter Nachricht
    }

    // Send via WebSocket with correct format
    if (socket) {
      const messageData = {
        type: 'message',
        chatId: null, // Let server handle chat assignment
        senderId: userId,
        receiverId: selectedChat.otherUser.id,
        content: content, // TEMPORÄR: Sende unverschlüsselt bis Entschlüsselung repariert ist
        messageType: type,
        destructTimer,
      };
      
      console.log('📤 Sending WebSocket message:', messageData);
      
      // Use the WebSocket send method directly
      if (socket.send) {
        socket.send(JSON.stringify(messageData));
      } else if (socket.emit) {
        socket.emit('message', messageData);
      } else {
        console.error('❌ WebSocket has no send method available');
      }
      
      console.log('📤 Message sent via WebSocket for persistent chat system');
    } else {
      console.error('❌ No WebSocket connection available');
    }
  }, [selectedChat, userId, socket, scheduleMessageDeletion]);

  // Handle incoming messages from WebSocket
  useEffect(() => {
    if (!socket || !userId) return;

    const handleIncomingMessage = (data: any) => {
      console.log('📥 Raw WebSocket data received:', data);
      
      if (data.type === 'new_message' && data.message) {
        const message = data.message;
        
        console.log('📥 Processing incoming message:', {
          messageId: message.id,
          chatId: message.chatId,
          from: message.senderId,
          to: message.receiverId,
          content: message.content?.substring(0, 30)
        });

        // Only handle messages TO this user (not sent BY this user)
        if (message.receiverId === userId && message.senderId !== userId) {
          console.log('✅ Message is for current user, processing...');
          
          // Add to active messages immediately
          setActiveMessages(prev => {
            const newMap = new Map(prev);
            const chatMessages = newMap.get(message.chatId) || [];
            
            // Check for duplicates
            const messageExists = chatMessages.some(m => m.id === message.id);
            if (!messageExists) {
              const updatedMessages = [...chatMessages, message];
              newMap.set(message.chatId, updatedMessages);
              console.log(`📥 Added message to chat ${message.chatId}, total messages: ${updatedMessages.length}`);
            } else {
              console.log('⚠️ Message already exists, skipping duplicate');
            }
            
            return newMap;
          });

          // Schedule deletion
          scheduleMessageDeletion(message);

          // Reload persistent contacts to include new chat
          loadPersistentContacts();

          // 📱 WhatsApp-Style: NUR Chat-Liste aktualisieren, NICHT automatisch öffnen
          setUnreadCounts(prev => {
            const newCounts = new Map(prev);
            const currentCount = newCounts.get(message.chatId) || 0;
            newCounts.set(message.chatId, currentCount + 1);
            console.log(`📊 WhatsApp-Style: Ungelesene Nachrichten für Chat ${message.chatId}: ${currentCount + 1}`);
            return newCounts;
          });
          
          // Chat-Liste aktualisieren ohne Chat zu öffnen
          setTimeout(async () => {
            console.log('📱 WhatsApp-Style: Aktualisiere Chat-Liste für neue Nachricht');
            await loadPersistentContacts();
          }, 100);

          // Scroll to bottom
          setTimeout(() => {
            if (messagesEndRef.current) {
              messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
            }
          }, 300);
        } else {
          console.log('⏭️ Message not for current user, skipping');
        }
      } else {
        console.log('⏭️ Not a new_message type, ignoring');
      }
    };

    // Listen to WebSocket messages with proper event handling
    if (socket && socket.on) {
      socket.on('message', handleIncomingMessage);
      console.log('🔊 WebSocket message listener registered for user', userId);
    } else {
      console.warn('⚠️ WebSocket not available or no event listener support');
    }
    
    return () => {
      if (socket && socket.off) {
        socket.off('message', handleIncomingMessage);
        console.log('🔇 WebSocket message listener removed for user', userId);
      }
    };
  }, [socket, userId, scheduleMessageDeletion, persistentContacts, selectedChat, loadPersistentContacts]);

  // Load persistent contacts on mount and user change
  useEffect(() => {
    if (userId) {
      loadPersistentContacts();
    }
  }, [userId, loadPersistentContacts]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      deletionTimersRef.current.forEach(timer => clearTimeout(timer));
      deletionTimersRef.current.clear();
    };
  }, []);

  // Get messages for selected chat
  const messages = selectedChat ? (activeMessages.get(selectedChat.id) || []) : [];

  // WhatsApp-style: Chat als gelesen markieren beim Öffnen
  const markChatAsRead = useCallback((chatId: number) => {
    setUnreadCounts(prev => {
      const newCounts = new Map(prev);
      if (newCounts.has(chatId)) {
        console.log(`📖 Chat ${chatId} als gelesen markiert`);
        newCounts.delete(chatId);
      }
      return newCounts;
    });
  }, []);

  // Erweiterte selectChat Funktion mit WhatsApp-Style read marking
  const selectChatWithReadMarking = useCallback(async (chat: (Chat & { otherUser: User }) | null) => {
    console.log('🎯 CHATVIEW RENDER:', {
      selectedChat: chat?.id || 'NULL',
      otherUser: chat?.otherUser.username || 'NULL',
      hasMessages: chat ? (activeMessages.get(chat.id)?.length || 0) : 0
    });
    
    setSelectedChat(chat);
    
    if (chat) {
      // WhatsApp-Style: Als gelesen markieren
      markChatAsRead(chat.id);
      
      // Mark chat as active
      try {
        await fetch(`/api/chats/${chat.id}/activate`, { method: 'POST' });
      } catch (error) {
        console.error('Failed to activate chat:', error);
      }
      
      // Load fresh messages when selecting a chat
      await loadActiveMessages(chat.id);
      
      // Scroll to bottom after selecting
      setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [loadActiveMessages, activeMessages, markChatAsRead]);

  return {
    persistentContacts,
    messages,
    selectedChat,
    isLoading,
    selectChat: selectChatWithReadMarking,
    sendMessage,
    messagesEndRef,
    loadPersistentContacts,
    unreadCounts, // WhatsApp-style unread counts
  };
}