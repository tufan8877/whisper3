import type { Express } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertUserSchema, insertMessageSchema, wsMessageSchema, loginUserSchema, type WSMessage } from "@shared/schema";
import { z } from "zod";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// Configure multer for file uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

interface ConnectedClient {
  ws: WebSocket;
  userId: number;
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const connectedClients = new Map<number, ConnectedClient>();

  // Add API routes BEFORE WebSocket setup
  
  // User registration
  app.post("/api/register", async (req, res) => {
    try {
      console.log("📝 Registration request:", req.body);
      
      // Don't use insertUserSchema directly - it expects passwordHash, we get password
      const { username, password, publicKey } = req.body;
      
      if (!username || !password || !publicKey) {
        return res.status(400).json({ message: "Username, password, and publicKey are required" });
      }
      
      // Check if user exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Create new user
      const user = await storage.createUser({
        username,
        passwordHash: hashPassword(password),
        publicKey
      });

      console.log("✅ User created:", user.id, username);
      res.json({ user: { id: user.id, username: user.username, publicKey: user.publicKey } });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).json({ message: "Registration failed" });
    }
  });

  // User login
  app.post("/api/login", async (req, res) => {
    try {
      console.log("🔑 Login request:", { username: req.body.username });
      
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      
      const user = await storage.getUserByUsername(username);
      if (!user) {
        console.log("❌ User not found:", username);
        return res.status(401).json({ message: "Invalid username or password" });
      }
      
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Update online status
      await storage.updateUserOnlineStatus(user.id, true);

      console.log("✅ User logged in:", user.id, username);
      res.json({ user: { id: user.id, username: user.username, publicKey: user.publicKey } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(400).json({ message: "Login failed" });
    }
  });

  // Get user chats (with unread counts)
  app.get("/api/chats/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const chats = await storage.getChatsByUserId(userId);
      res.json(chats);
    } catch (error) {
      console.error("Get chats error:", error);
      res.status(500).json({ message: "Failed to fetch chats" });
    }
  });

  // Get chat messages (WITHOUT marking as read - only mark-read API should do that)
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const messages = await storage.getMessagesByChat(chatId);
      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });



  // Get persistent chat contacts (contacts remain even when messages are deleted)
  app.get("/api/chat-contacts/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const contacts = await storage.getPersistentChatContacts ? 
        await storage.getPersistentChatContacts(userId) : 
        await storage.getChatsByUserId(userId);
      res.json(contacts);
    } catch (error) {
      console.error("Failed to get chat contacts:", error);
      res.status(500).json({ error: "Failed to get chat contacts" });
    }
  });

  // Mark chat as active (updates timestamp for recent activity)
  app.post("/api/chats/:chatId/activate", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      if (storage.markChatAsActive) {
        await storage.markChatAsActive(chatId);
      }
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to activate chat:", error);
      res.status(500).json({ error: "Failed to activate chat" });
    }
  });

  // Mark chat as read for a specific user
  app.post("/api/chats/:chatId/mark-read", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const { userId } = req.body;
      
      if (!userId) {
        return res.status(400).json({ error: "User ID is required" });
      }
      
      await storage.resetUnreadCount(chatId, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to mark chat as read:", error);
      res.status(500).json({ error: "Failed to mark chat as read" });
    }
  });

  // Update user profile
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { username, publicKey } = req.body;
      
      // Get existing user
      const existingUser = await storage.getUser(userId);
      if (!existingUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if username is taken by another user
      if (username && username !== existingUser.username) {
        const userWithSameName = await storage.getUserByUsername(username);
        if (userWithSameName && userWithSameName.id !== userId) {
          return res.status(400).json({ message: "Username already taken" });
        }
      }

      // Update user (this would need implementation in storage)
      res.json({ message: "User updated successfully" });
    } catch (error) {
      console.error("Update user error:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // WICKR-ME-STYLE: Account deletion disabled - usernames are permanent
  // Users must remember their password to access their permanent profile
  app.delete("/api/users/:id", async (req, res) => {
    res.status(403).json({ 
      message: "Account deletion not allowed - usernames are permanent like Wickr Me. Please logout instead." 
    });
  });

  // Delete chat for specific user (WhatsApp-style)
  app.post('/api/chats/:chatId/delete', async (req, res) => {
    const chatId = parseInt(req.params.chatId);
    const { userId } = req.body;
    
    try {
      await storage.deleteChatForUser(userId, chatId);
      console.log(`✅ Chat ${chatId} deleted for user ${userId}`);
      res.json({ success: true });
    } catch (error) {
      console.error(`❌ Error deleting chat ${chatId} for user ${userId}:`, error);
      res.status(500).json({ error: 'Failed to delete chat' });
    }
  });

  // Block user (WhatsApp-style)
  app.post('/api/users/:userId/block', async (req, res) => {
    const blockedUserId = parseInt(req.params.userId);
    const { blockerId } = req.body;
    
    try {
      await storage.blockUser(blockerId, blockedUserId);
      console.log(`✅ User ${blockedUserId} blocked by user ${blockerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error(`❌ Error blocking user ${blockedUserId}:`, error);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });



  // WebSocket server with no restrictions for Replit compatibility
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    // Remove all client verification to bypass 400/403 errors
    verifyClient: () => true,
    // Allow all origins and protocols
    handleProtocols: () => false,
    // Bypass browser CORS restrictions
    skipUTF8Validation: true
  });

  // Start message cleanup interval - delete expired messages every 5 minutes
  const cleanupInterval = setInterval(async () => {
    try {
      const deletedCount = await storage.deleteExpiredMessages();
      if (deletedCount > 0) {
        console.log(`🧹 Cleaned up ${deletedCount} expired messages`);
      }
    } catch (error) {
      console.error("❌ Error during message cleanup:", error);
    }
  }, 300000); // Every 5 minutes (300,000 milliseconds)
  
  console.log("🧹 Message cleanup scheduler started (every 5 minutes)");

  wss.on('connection', (ws) => {
    console.log('🔗 NEW WEBSOCKET CONNECTION ESTABLISHED');
    let userId: number | null = null;

    // Send immediate connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      message: 'WebSocket connected successfully'
    }));

    ws.on('message', async (data) => {
      try {
        const rawMessage = data.toString();
        console.log('📥 RAW MESSAGE RECEIVED:', rawMessage);
        
        const parsedData = JSON.parse(rawMessage);
        console.log('📥 PARSED RAW DATA:', parsedData);
        
        // BYPASS VALIDATION FOR MESSAGES - Direct processing
        if (parsedData.type === 'message') {
          console.log('💬 MESSAGE TYPE DETECTED - Processing directly');
          
          // Extract message data from nested structure or direct structure
          const msgData = parsedData.message || parsedData;
          const message = {
            type: 'message',
            chatId: msgData.chatId || null,
            senderId: msgData.senderId,
            receiverId: msgData.receiverId,
            content: msgData.content,
            messageType: msgData.messageType || 'text',
            fileName: msgData.fileName,
            fileSize: msgData.fileSize,
            destructTimer: msgData.destructTimer || 86400,
          };
          console.log('📥 PROCESSED MESSAGE:', message);
          var validatedMessage = message;
        } else {
          // For non-message types, use validation
          var validatedMessage: WSMessage = wsMessageSchema.parse(parsedData);
        }
        console.log('📥 FINAL MESSAGE:', validatedMessage.type, validatedMessage);

        switch (validatedMessage.type) {
          case 'join':
            userId = validatedMessage.userId;
            connectedClients.set(userId, { ws, userId });
            await storage.updateUserOnlineStatus(userId, true);
            console.log('👤 USER JOINED:', userId, 'Total connected:', connectedClients.size);
            
            // Send join confirmation to user
            ws.send(JSON.stringify({
              type: 'join_confirmed',
              userId: userId,
              message: `User ${userId} joined successfully`
            }));
            
            // Broadcast user online status to others
            broadcast({
              type: 'user_status',
              userId,
              isOnline: true,
            }, userId);
            break;

          case 'message':
            console.log('💬 MESSAGE RECEIVED from userId:', userId);
            console.log('💬 Message content:', validatedMessage.content);
            console.log('💬 Full message data:', validatedMessage);
            
            if (userId) {
              // CRITICAL: Ensure proper 1:1 chat separation
              console.log('🔍 Ensuring proper chat separation between users:', validatedMessage.senderId, 'and', validatedMessage.receiverId);
              
              // Get or create the specific chat for these two users
              const chat = await storage.getOrCreateChatByParticipants(validatedMessage.senderId, validatedMessage.receiverId);
              console.log('💬 Using chat ID:', chat.id, 'for communication between users', validatedMessage.senderId, 'and', validatedMessage.receiverId);
              
              const expiresAt = new Date(Date.now() + validatedMessage.destructTimer * 1000);
              
              // Detect if message is encrypted (RSA encrypted content is base64 and much longer than original)
              const isEncrypted = validatedMessage.messageType === "text" && validatedMessage.content && validatedMessage.content.length > 100 && /^[A-Za-z0-9+/=]+$/.test(validatedMessage.content);
              
              console.log('🔒 Message encryption detected:', isEncrypted, 'Content length:', validatedMessage.content?.length);

              // Create message in the CORRECT chat (not the one from client, but the verified one)
              const newMessage = await storage.createMessage({
                chatId: chat.id, // Use the verified chat ID, not validatedMessage.chatId
                senderId: validatedMessage.senderId,
                receiverId: validatedMessage.receiverId,
                content: validatedMessage.content,
                messageType: validatedMessage.messageType,
                fileName: validatedMessage.fileName,
                fileSize: validatedMessage.fileSize,
                isEncrypted,
                expiresAt,
              });

              console.log('✅ MESSAGE SAVED to storage with ID:', newMessage.id);

              // AUTO-REACTIVATE: If receiver has deleted this chat, reactivate it when new message arrives
              if (storage.reactivateChatForUser && storage.isChatDeletedForUser) {
                const isDeleted = await storage.isChatDeletedForUser(validatedMessage.receiverId, chat.id);
                if (isDeleted) {
                  await storage.reactivateChatForUser(validatedMessage.receiverId, chat.id);
                }
              }

              // CRITICAL: Increment unread count for RECEIVER
              await storage.incrementUnreadCount(chat.id, validatedMessage.receiverId);
              console.log('📊 ✅ INCREMENTED unread count for receiver:', validatedMessage.receiverId, 'in chat:', chat.id);

              // Update chat last message
              await storage.updateChatLastMessage(chat.id, newMessage.id);

              // IMMEDIATE: Send confirmation to sender
              ws.send(JSON.stringify({
                type: 'message_sent',
                messageId: newMessage.id,
                chatId: newMessage.chatId,
                success: true,
                message: 'Message sent successfully'
              }));

              // BROADCAST: Send to SPECIFIC recipient + sender for real-time chat
              const broadcastPayload = {
                type: 'new_message',
                message: newMessage,
              };

              console.log('📡 BROADCASTING message to specific recipients');
              console.log('🎯 Target recipients: Sender:', validatedMessage.senderId, 'Receiver:', validatedMessage.receiverId);
              
              let successCount = 0;
              let failCount = 0;
              
              // Send to sender (for confirmation display)
              const senderClient = connectedClients.get(validatedMessage.senderId);
              if (senderClient && senderClient.ws.readyState === WebSocket.OPEN) {
                try {
                  senderClient.ws.send(JSON.stringify(broadcastPayload));
                  console.log('📤 SUCCESS: Sent to SENDER', validatedMessage.senderId);
                  successCount++;
                } catch (error) {
                  console.log('❌ FAILED: Send to sender', validatedMessage.senderId, 'Error:', error);
                  failCount++;
                }
              } else {
                console.log('⚠️ SENDER not connected:', validatedMessage.senderId);
              }
              
              // Send to receiver (the important one!)
              const receiverClient = connectedClients.get(validatedMessage.receiverId);
              if (receiverClient && receiverClient.ws.readyState === WebSocket.OPEN) {
                try {
                  receiverClient.ws.send(JSON.stringify(broadcastPayload));
                  console.log('📤 SUCCESS: Sent to RECEIVER', validatedMessage.receiverId);
                  successCount++;
                } catch (error) {
                  console.log('❌ FAILED: Send to receiver', validatedMessage.receiverId, 'Error:', error);
                  failCount++;
                }
              } else {
                console.log('⚠️ RECEIVER not connected:', validatedMessage.receiverId);
              }

              console.log('✅ TARGETED BROADCAST: Success:', successCount, 'Failed:', failCount, 'Sender online:', !!senderClient, 'Receiver online:', !!receiverClient);
            } else {
              console.log('❌ CRITICAL: No userId set for message - join event missing?');
              ws.send(JSON.stringify({
                type: 'error',
                message: 'User not joined - send join event first'
              }));
            }
            break;

          case 'typing':
            // Forward typing indicator to recipient
            const typingRecipient = validatedMessage.chatId && connectedClients.get(
              await getOtherParticipant(validatedMessage.chatId, userId!)
            );
            if (typingRecipient && typingRecipient.ws.readyState === WebSocket.OPEN) {
              typingRecipient.ws.send(JSON.stringify(validatedMessage));
            }
            break;

          case 'read_receipt':
            // Handle read receipts (could be implemented for future features)
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', async () => {
      if (userId) {
        console.log('🔌 DISCONNECT: User', userId, 'WebSocket closed');
        connectedClients.delete(userId);
        await storage.updateUserOnlineStatus(userId, false);
        console.log('👥 REMAINING CONNECTIONS:', connectedClients.size);
        
        // Broadcast user offline status
        broadcast({
          type: 'user_status',
          userId,
          isOnline: false,
        }, userId);
      } else {
        console.log('🔌 DISCONNECT: Anonymous connection closed');
      }
    });

    ws.on('error', (error) => {
      console.error('❌ WEBSOCKET ERROR for user', userId, ':', error);
    });
  });

  function broadcast(message: any, excludeUserId?: number) {
    Array.from(connectedClients.values()).forEach(client => {
      if (client.userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  async function getOtherParticipant(chatId: number, userId: number): Promise<number> {
    const chat = await storage.getChatByParticipants(userId, 0); // Get chat data
    if (!chat) return 0;
    
    // Return the other participant's ID
    return chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
  }

  // Helper function to hash passwords
  function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  function verifyPassword(password: string, hash: string): boolean {
    return crypto.createHash('sha256').update(password).digest('hex') === hash;
  }

  // Test routes for WebSocket debugging
  app.get('/test-websocket.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'test-websocket.html'));
  });
  
  app.get('/live-test.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'live-test.html'));
  });
  
  app.get('/simple-test.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(process.cwd(), 'simple-test.js'));
  });
  
  app.get('/debug-browser-test.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(process.cwd(), 'debug-browser-test.js'));
  });
  
  app.get('/browser-websocket-test.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'browser-websocket-test.html'));
  });
  
  app.get('/live-test.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'live-test.html'));
  });
  
  app.get('/websocket-fix.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(process.cwd(), 'websocket-fix.js'));
  });
  
  app.get('/timer-test-simple.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'timer-test-simple.html'));
  });
  
  app.get('/browser-user-persistence-test.html', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'browser-user-persistence-test.html'));
  });

  // HTTP fallback endpoint for messages (if WebSocket fails)
  app.post("/api/messages", async (req, res) => {
    try {
      let { chatId, senderId, receiverId, content, messageType, destructTimer } = req.body;
      
      console.log("📤 HTTP message received:", {
        chatId,
        senderId,
        receiverId,
        content: content?.substring(0, 30) + "...",
        destructTimer: destructTimer || 300
      });

      // Auto-determine receiverId if missing
      if (!receiverId && chatId) {
        const chat = await storage.getChat(chatId);
        if (chat) {
          receiverId = chat.participant1Id === senderId ? chat.participant2Id : chat.participant1Id;
          console.log("🎯 Auto-determined receiverId:", receiverId);
        }
      }

      // Create message in storage (destructTimer is in seconds, convert to milliseconds)
      const timerInMs = (destructTimer || 300) * 1000; // Default 5 minutes in seconds
      const expiresAt = new Date(Date.now() + timerInMs);
      const message = await storage.createMessage({
        chatId,
        senderId,
        receiverId,
        content,
        messageType: messageType || "text",
        fileName: undefined,
        fileSize: undefined,
        isEncrypted: false, // Fix the circular reference issue
        expiresAt
      });

      console.log("✅ Message saved via HTTP with ID:", message.id);

      // Increment unread count for receiver
      if (receiverId && chatId) {
        await storage.incrementUnreadCount(chatId, receiverId);
        console.log("📊 Incremented unread count for user", receiverId);
      }

      // Update chat's last message
      await storage.updateChatLastMessage(chatId, message.id);

      // Broadcast to connected WebSocket clients
      console.log("📡 Broadcasting message to WebSocket clients...");
      
      if (typeof wss !== 'undefined' && wss.clients) {
        let clientCount = 0;
        wss.clients.forEach((client) => {
          if (client.readyState === 1) { // WebSocket.OPEN
            client.send(JSON.stringify({
              type: "new_message",
              message
            }));
            clientCount++;
          }
        });
        console.log(`📡 Broadcast sent to ${clientCount} connected clients`);
      } else {
        console.log("⚠️ No WebSocket server available for broadcast");
      }

      res.json(message);
    } catch (error) {
      console.error("Failed to create message via HTTP:", error);
      res.status(500).json({ error: "Failed to create message" });
    }
  });

  // Block user endpoint
  app.post("/api/users/:userId/block", async (req, res) => {
    try {
      const blockerId = parseInt(req.params.userId);
      const { blockedId } = req.body;
      
      console.log(`🚫 Block request: ${blockerId} wants to block ${blockedId}`);
      
      await storage.blockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to block user:", error);
      res.status(500).json({ error: "Failed to block user" });
    }
  });

  // Unblock user endpoint
  app.post("/api/users/:userId/unblock", async (req, res) => {
    try {
      const blockerId = parseInt(req.params.userId);
      const { blockedId } = req.body;
      
      console.log(`✅ Unblock request: ${blockerId} wants to unblock ${blockedId}`);
      
      await storage.unblockUser(blockerId, blockedId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to unblock user:", error);
      res.status(500).json({ error: "Failed to unblock user" });
    }
  });

  // Get blocked users
  app.get("/api/users/:userId/blocked", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const blockedUsers = await storage.getBlockedUsers(userId);
      res.json(blockedUsers);
    } catch (error) {
      console.error("Failed to get blocked users:", error);
      res.status(500).json({ error: "Failed to get blocked users" });
    }
  });

  // Delete chat for user
  app.delete("/api/users/:userId/chats/:chatId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const chatId = parseInt(req.params.chatId);
      
      console.log(`🗑️ Delete chat request: User ${userId} wants to delete chat ${chatId}`);
      
      await storage.deleteChatForUser(userId, chatId);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to delete chat:", error);
      res.status(500).json({ error: "Failed to delete chat" });
    }
  });

  // Get messages since a specific ID (for polling)
  app.get("/api/users/:userId/messages/since/:lastId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const lastId = parseInt(req.params.lastId);
      
      // Get all messages for user's chats that are newer than lastId
      const userChats = await storage.getChatsByUserId(userId);
      const allMessages: any[] = [];
      
      for (const chat of userChats) {
        const chatMessages = await storage.getMessagesByChat(chat.id);
        const newMessages = chatMessages.filter(m => m.id > lastId);
        allMessages.push(...newMessages);
      }
      
      // Sort by creation time
      allMessages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      
      res.json(allMessages);
    } catch (error) {
      console.error("Failed to get messages since:", error);
      res.json([]);
    }
  });

  // REST API endpoints

  // Create user (Register)
  app.post("/api/users", async (req, res) => {
    try {
      const { username, password, publicKey } = req.body;
      
      console.log("📝 Registration attempt:", {
        username,
        hasPassword: !!password,
        hasPublicKey: !!publicKey
      });
      
      // Validate input
      if (!username || !password || !publicKey) {
        console.log("❌ Missing required fields");
        return res.status(400).json({ message: "Username, password, and publicKey are required" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        console.log("❌ Username already taken:", username);
        return res.status(409).json({ message: "Username already taken" });
      }

      // Hash password and create user
      const passwordHash = hashPassword(password);
      const userData = { username, passwordHash, publicKey };
      const user = await storage.createUser(userData);
      
      console.log("✅ User registration successful:", user.id, username);
      
      // Return user without password hash
      const { passwordHash: _, ...userResponse } = user;
      res.json(userResponse);
    } catch (error) {
      console.error("❌ Registration error:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Login user
  app.post("/api/login", async (req, res) => {
    try {
      const { username, password } = loginUserSchema.parse(req.body);
      
      // Find user by username
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Verify password
      if (!verifyPassword(password, user.passwordHash)) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Return user without password hash
      const { passwordHash: _, ...userResponse } = user;
      res.json(userResponse);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Search users
  app.get("/api/search-users", async (req, res) => {
    try {
      const query = req.query.q as string || "";
      // Support both 'exclude' (frontend) and 'excludeId' (backup) parameters
      const excludeParam = req.query.exclude as string || req.query.excludeId as string || "0";
      const excludeId = parseInt(excludeParam) || 0;
      
      console.log("🔍 User search request:", { query, excludeParam, excludeId });
      
      if (!query.trim()) {
        return res.json([]);
      }
      
      const users = await storage.searchUsers(query, excludeId);
      console.log(`✅ Found ${users.length} users matching "${query}":`, users.map(u => u.username));
      res.json(users);
    } catch (error) {
      console.error("❌ Search error:", error);
      res.status(500).json({ message: "Failed to search users" });
    }
  });

  // Get user by ID
  app.get("/api/users/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const user = await storage.getUser(id);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Get user's chats
  app.get("/api/chats/:userId", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const chats = await storage.getChatsByUserId(userId);
      res.json(chats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get chats" });
    }
  });

  // Create or get chat between two users
  app.post("/api/chats", async (req, res) => {
    try {
      const { participant1Id, participant2Id } = req.body;
      
      // Check if chat already exists
      let chat = await storage.getChatByParticipants(participant1Id, participant2Id);
      
      if (!chat) {
        chat = await storage.createChat({ participant1Id, participant2Id });
      }
      
      res.json(chat);
    } catch (error) {
      res.status(500).json({ message: "Failed to create chat" });
    }
  });

  // Get messages for a chat
  app.get("/api/chats/:chatId/messages", async (req, res) => {
    try {
      const chatId = parseInt(req.params.chatId);
      const messages = await storage.getMessagesByChat(chatId);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  // File upload
  app.post("/api/upload", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const fileInfo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      };

      res.json(fileInfo);
    } catch (error) {
      res.status(500).json({ message: "Failed to upload file" });
    }
  });

  // Debug endpoint to check all users (for testing)
  app.get("/api/debug/users", async (req, res) => {
    try {
      const allUsers = Array.from(storage.users.values()).map(user => ({
        id: user.id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen
      }));
      
      res.json({
        totalUsers: allUsers.length,
        users: allUsers,
        nextUserId: storage.userIdCounter
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get debug info" });
    }
  });

  // Update user profile (username)
  app.patch("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { username } = req.body;
      
      console.log("📝 Profile update request:", { userId, username });
      
      if (!username?.trim()) {
        return res.status(400).json({ message: "Username is required" });
      }

      // Check if username is already taken by another user
      const existingUser = await storage.getUserByUsername(username.trim());
      if (existingUser && existingUser.id !== userId) {
        console.log("❌ Username already taken by another user");
        return res.status(409).json({ message: "Username already taken" });
      }

      // Get current user
      const currentUser = await storage.getUser(userId);
      if (!currentUser) {
        return res.status(404).json({ message: "User not found" });
      }

      // Update username
      const updatedUser = { ...currentUser, username: username.trim() };
      storage.users.set(userId, updatedUser);
      
      console.log("✅ Username updated successfully:", userId, username.trim());
      
      // Return updated user without password hash
      const { passwordHash: _, ...userResponse } = updatedUser;
      res.json(userResponse);
    } catch (error) {
      console.error("❌ Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Serve uploaded files
  app.use("/uploads", express.static(uploadDir));

  // Debug endpoint to clear all data for encryption testing
  app.post("/api/debug/clear-all", (req, res) => {
    console.log("🧹 Clearing all storage data...");
    storage.users.clear();
    (storage as any).messages?.clear();
    (storage as any).chats?.clear();
    (storage as any).userIdCounter = 1;
    (storage as any).messageIdCounter = 1;
    (storage as any).chatIdCounter = 1;
    console.log("✅ All data cleared");
    res.json({ success: true, message: "All data cleared" });
  });

  return httpServer;
}
