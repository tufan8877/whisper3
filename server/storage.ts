import { 
  users, 
  messages, 
  chats,
  blockedUsers,
  deletedChats,
  type User, 
  type InsertUser,
  type Message,
  type InsertMessage,
  type Chat,
  type InsertChat,
  type BlockedUser,
  type InsertBlockedUser,
  type DeletedChat,
  type InsertDeletedChat
} from "@shared/schema";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  deleteUser(id: number): Promise<void>;
  
  // Message operations
  createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message>;
  getMessagesByChat(chatId: number): Promise<Message[]>;
  deleteExpiredMessages(): Promise<void>;
  deleteMessage(id: number): Promise<void>;
  markMessageAsRead(messageId: number): Promise<void>;
  markChatAsRead(chatId: number, userId: number): Promise<void>;
  
  // Chat operations
  createChat(chat: InsertChat): Promise<Chat>;
  getChatsByUserId(userId: number): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>>;
  getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined>;
  getOrCreateChatByParticipants(user1Id: number, user2Id: number): Promise<Chat>;
  updateChatLastMessage(chatId: number, messageId: number): Promise<void>;
  incrementUnreadCount(chatId: number, userId: number): Promise<void>;
  resetUnreadCount(chatId: number, userId: number): Promise<void>;
  
  // Persistent chat contacts (contacts remain even when messages are deleted)
  getPersistentChatContacts(userId: number): Promise<Array<Chat & { otherUser: User }>>;
  markChatAsActive(chatId: number): Promise<void>;
  
  // Search operations
  searchUsers(query: string, excludeId: number): Promise<User[]>;
  
  // Block/unblock operations
  blockUser(blockerId: number, blockedId: number): Promise<void>;
  unblockUser(blockerId: number, blockedId: number): Promise<void>;
  getBlockedUsers(userId: number): Promise<User[]>;
  isUserBlocked(blockerId: number, blockedId: number): Promise<boolean>;
  
  // Chat deletion operations (user-specific)
  deleteChatForUser(userId: number, chatId: number): Promise<void>;
  isChatDeletedForUser(userId: number, chatId: number): Promise<boolean>;
  reactivateChatForUser(userId: number, chatId: number): Promise<void>;
  permanentlyDeleteChat(chatId: number): Promise<void>;
}

import { db } from "./db";
import { eq, and, or, desc, asc, sql, ne, notInArray } from "drizzle-orm";

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    await db
      .update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    // WICKR-ME-STYLE: Never delete users - they are permanent
    console.log(`🚫 WICKR-ME-PROTECTION: User deletion blocked for ID ${id}`);
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const [newMessage] = await db
      .insert(messages)
      .values(message)
      .returning();
    return newMessage;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
  }

  async deleteExpiredMessages(): Promise<void> {
    const now = new Date();
    await db
      .delete(messages)
      .where(sql`${messages.expiresAt} < ${now}`);
  }

  async deleteMessage(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId));
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const [chat] = await db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId));

    if (!chat) return;

    // Reset unread count for the user
    if (chat.participant1Id === userId) {
      await db
        .update(chats)
        .set({ unreadCount1: 0 })
        .where(eq(chats.id, chatId));
    } else if (chat.participant2Id === userId) {
      await db
        .update(chats)
        .set({ unreadCount2: 0 })
        .where(eq(chats.id, chatId));
    }
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db
      .insert(chats)
      .values(chat)
      .returning();
    return newChat;
  }

  async getChatsByUserId(userId: number): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const userChats = await db
      .select({
        chat: chats,
        otherUser: users,
        lastMessage: messages
      })
      .from(chats)
      .leftJoin(
        users,
        or(
          and(eq(chats.participant1Id, userId), eq(users.id, chats.participant2Id)),
          and(eq(chats.participant2Id, userId), eq(users.id, chats.participant1Id))
        )
      )
      .leftJoin(messages, eq(messages.id, chats.lastMessageId))
      .where(or(eq(chats.participant1Id, userId), eq(chats.participant2Id, userId)))
      .orderBy(desc(chats.createdAt));

    return userChats.map(row => {
      // User sees THEIR OWN unread count (messages they haven't read)
      const unreadCount = row.chat.participant1Id === userId ? row.chat.unreadCount1 : row.chat.unreadCount2;
      console.log(`📊 UNREAD COUNT for user ${userId} in chat ${row.chat.id}: ${unreadCount} (p1=${row.chat.unreadCount1}, p2=${row.chat.unreadCount2})`);
      
      return {
        ...row.chat,
        otherUser: row.otherUser!,
        lastMessage: row.lastMessage || undefined,
        unreadCount
      };
    });
  }

  async getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined> {
    const [chat] = await db
      .select()
      .from(chats)
      .where(
        or(
          and(eq(chats.participant1Id, user1Id), eq(chats.participant2Id, user2Id)),
          and(eq(chats.participant1Id, user2Id), eq(chats.participant2Id, user1Id))
        )
      );
    return chat || undefined;
  }

  async getOrCreateChatByParticipants(user1Id: number, user2Id: number): Promise<Chat> {
    let chat = await this.getChatByParticipants(user1Id, user2Id);
    if (!chat) {
      chat = await this.createChat({
        participant1Id: user1Id,
        participant2Id: user2Id,
        unreadCount1: 0,
        unreadCount2: 0,
        lastMessageTimestamp: new Date() // Initialize with current time
      });
    }
    return chat;
  }

  async updateChatLastMessage(chatId: number, messageId: number): Promise<void> {
    // Update both lastMessageId and lastMessageTimestamp for WhatsApp-style sorting
    await db
      .update(chats)
      .set({ 
        lastMessageId: messageId,
        lastMessageTimestamp: new Date() // Set current timestamp for sorting
      })
      .where(eq(chats.id, chatId));
    
    console.log(`📅 Updated chat ${chatId} lastMessageTimestamp for WhatsApp-style sorting`);
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    console.log(`📊 INCREMENT DEBUG: Starting increment for chat ${chatId}, user ${userId}`);
    
    const [chat] = await db
      .select()
      .from(chats)
      .where(eq(chats.id, chatId));

    if (!chat) {
      console.log(`❌ INCREMENT ERROR: Chat ${chatId} not found`);
      return;
    }

    console.log(`📊 CHAT STATE BEFORE: p1=${chat.participant1Id}, p2=${chat.participant2Id}, unread1=${chat.unreadCount1}, unread2=${chat.unreadCount2}`);

    // Increment unread count for the RECEIVER (not the sender)
    if (chat.participant1Id === userId) {
      // Receiver is participant1, increment unreadCount1
      await db
        .update(chats)
        .set({ unreadCount1: sql`${chats.unreadCount1} + 1` })
        .where(eq(chats.id, chatId));
      console.log(`📊 ✅ INCREMENTED unreadCount1 for receiver (userId: ${userId})`);
    } else if (chat.participant2Id === userId) {
      // Receiver is participant2, increment unreadCount2  
      await db
        .update(chats)
        .set({ unreadCount2: sql`${chats.unreadCount2} + 1` })
        .where(eq(chats.id, chatId));
      console.log(`📊 ✅ INCREMENTED unreadCount2 for receiver (userId: ${userId})`);
    } else {
      console.log(`❌ INCREMENT ERROR: User ${userId} is not a participant in chat ${chatId} (p1=${chat.participant1Id}, p2=${chat.participant2Id})`);
    }
    
    // Verify the increment worked
    const [updatedChat] = await db.select().from(chats).where(eq(chats.id, chatId));
    console.log(`📊 CHAT STATE AFTER: unread1=${updatedChat?.unreadCount1}, unread2=${updatedChat?.unreadCount2}`);
  }

  async resetUnreadCount(chatId: number, userId: number): Promise<void> {
    await this.markChatAsRead(chatId, userId);
  }

  async getPersistentChatContacts(userId: number): Promise<Array<Chat & { otherUser: User, lastMessage?: Message }>> {
    // Get chats with last message for WhatsApp-style sorting
    const contacts = await db
      .select({
        chat: chats,
        otherUser: users,
        lastMessage: messages
      })
      .from(chats)
      .leftJoin(
        users,
        or(
          and(eq(chats.participant1Id, userId), eq(users.id, chats.participant2Id)),
          and(eq(chats.participant2Id, userId), eq(users.id, chats.participant1Id))
        )
      )
      .leftJoin(
        messages,
        eq(messages.id, chats.lastMessageId)
      )
      .where(or(eq(chats.participant1Id, userId), eq(chats.participant2Id, userId)))
      .orderBy(desc(chats.lastMessageTimestamp), desc(chats.createdAt)); // WhatsApp-style: newest message first

    console.log(`📱 WhatsApp-style sorting: Found ${contacts.length} chats for user ${userId}`);

    return contacts.map(row => ({
      ...row.chat,
      otherUser: row.otherUser!,
      lastMessage: row.lastMessage || undefined
    }));
  }

  async markChatAsActive(chatId: number): Promise<void> {
    // This is a no-op for database storage as chats are always active
  }

  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    console.log("🔍 DatabaseStorage.searchUsers called with:", { query, excludeId, type: typeof excludeId });
    
    // Ensure excludeId is a valid number
    const validExcludeId = isNaN(excludeId) ? 0 : excludeId;
    
    return await db
      .select()
      .from(users)
      .where(
        and(
          sql`${users.username} ILIKE ${'%' + query + '%'}`,
          ne(users.id, validExcludeId)
        )
      )
      .limit(10);
  }

  async blockUser(blockerId: number, blockedId: number): Promise<void> {
    await db
      .insert(blockedUsers)
      .values({ blockerId, blockedId })
      .onConflictDoNothing();
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    await db
      .delete(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const blocked = await db
      .select({ user: users })
      .from(blockedUsers)
      .innerJoin(users, eq(users.id, blockedUsers.blockedId))
      .where(eq(blockedUsers.blockerId, userId));

    return blocked.map(row => row.user);
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const [blocked] = await db
      .select()
      .from(blockedUsers)
      .where(
        and(
          eq(blockedUsers.blockerId, blockerId),
          eq(blockedUsers.blockedId, blockedId)
        )
      );
    return !!blocked;
  }

  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    await db
      .insert(deletedChats)
      .values({ userId, chatId })
      .onConflictDoNothing();
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    const [deleted] = await db
      .select()
      .from(deletedChats)
      .where(
        and(
          eq(deletedChats.userId, userId),
          eq(deletedChats.chatId, chatId)
        )
      );
    return !!deleted;
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    await db
      .delete(deletedChats)
      .where(
        and(
          eq(deletedChats.userId, userId),
          eq(deletedChats.chatId, chatId)
        )
      );
    console.log(`♻️ Chat ${chatId} reactivated for user ${userId}`);
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    // Delete all messages in the chat
    await db.delete(messages).where(eq(messages.chatId, chatId));
    
    // Delete the chat itself
    await db.delete(chats).where(eq(chats.id, chatId));
    
    // Delete associated deleted_chats records
    await db.delete(deletedChats).where(eq(deletedChats.chatId, chatId));
  }
}

export class MemStorage implements IStorage {
  public users: Map<number, User>; // Made public for debug access
  private messages: Map<number, Message>;
  private chats: Map<number, Chat>;
  private blockedUsers: Map<number, BlockedUser>;
  private deletedChats: Map<number, DeletedChat>;
  public userIdCounter: number; // Made public for debug access
  private messageIdCounter: number;
  private chatIdCounter: number;
  private blockedUserIdCounter: number;
  private deletedChatIdCounter: number;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.chats = new Map();
    this.blockedUsers = new Map();
    this.deletedChats = new Map();
    this.userIdCounter = 1;
    this.messageIdCounter = 1;
    this.chatIdCounter = 1;
    this.blockedUserIdCounter = 1;
    this.deletedChatIdCounter = 1;
    
    // Load persisted data on startup (async but don't await here)
    this.loadPersistedData().catch(console.error);
    
    // Start cleanup interval for expired messages
    setInterval(() => {
      this.deleteExpiredMessages();
    }, 60000); // Check every minute
    
    // Auto-save data every 10 seconds
    setInterval(async () => {
      await this.persistData();
    }, 10000);
  }

  private async loadPersistedData() {
    try {
      // Load users from persistent JSON file
      const usersData = await this.loadFromFile('users.json');
      if (usersData) {
        Object.entries(usersData.users || {}).forEach(([id, user]: [string, any]) => {
          this.users.set(Number(id), user as User);
        });
        this.userIdCounter = usersData.userIdCounter || 1;
        console.log("✅ Loaded users from storage:", {
          totalUsers: this.users.size,
          usernames: Array.from(this.users.values()).map(u => u.username)
        });
      }

      // Load chats from persistent JSON file
      const chatsData = await this.loadFromFile('chats.json');
      if (chatsData) {
        Object.entries(chatsData.chats || {}).forEach(([id, chat]: [string, any]) => {
          this.chats.set(Number(id), chat as Chat);
        });
        this.chatIdCounter = chatsData.chatIdCounter || 1;
      }

      // Load blocked users from persistent JSON file
      const blockedData = await this.loadFromFile('blocked.json');
      if (blockedData) {
        Object.entries(blockedData.blockedUsers || {}).forEach(([id, blocked]: [string, any]) => {
          this.blockedUsers.set(Number(id), blocked as BlockedUser);
        });
        this.blockedUserIdCounter = blockedData.blockedUserIdCounter || 1;
      }

      console.log("🚀 Storage initialized with persistent data:", {
        totalUsers: this.users.size,
        totalChats: this.chats.size,
        nextUserId: this.userIdCounter,
        usernames: Array.from(this.users.values()).map(u => u.username)
      });
      
    } catch (error) {
      console.error("❌ Failed to load persisted data:", error);
      console.log("🚀 Storage initialized - ready for new users:", {
        totalUsers: this.users.size,
        nextUserId: this.userIdCounter
      });
    }
  }

  private async persistData() {
    try {
      // Save users to persistent storage
      const usersData = {
        users: Object.fromEntries(this.users),
        userIdCounter: this.userIdCounter
      };
      await this.saveToFile('users.json', usersData);

      // Save chats to persistent storage  
      const chatsData = {
        chats: Object.fromEntries(this.chats),
        chatIdCounter: this.chatIdCounter
      };
      await this.saveToFile('chats.json', chatsData);

      // Save blocked users to persistent storage
      const blockedData = {
        blockedUsers: Object.fromEntries(this.blockedUsers),
        blockedUserIdCounter: this.blockedUserIdCounter
      };
      await this.saveToFile('blocked.json', blockedData);

      // Only log occasionally to reduce spam
      if (Math.random() < 0.1) {
        console.log("💾 Auto-save completed:", {
          users: this.users.size,
          messages: this.messages.size,
          chats: this.chats.size
        });
      }
    } catch (error) {
      console.error("❌ Failed to persist data:", error);
    }
  }

  private async loadFromFile(filename: string): Promise<any> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const filepath = path.join(process.cwd(), 'data', filename);
      
      try {
        const data = await fs.readFile(filepath, 'utf8');
        return JSON.parse(data);
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          // File doesn't exist yet, that's ok
          return null;
        }
        throw err;
      }
    } catch (error) {
      console.error(`❌ Failed to load ${filename}:`, error);
      return null;
    }
  }

  private async saveToFile(filename: string, data: any): Promise<void> {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const dataDir = path.join(process.cwd(), 'data');
      
      // Ensure data directory exists
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (err) {
        // Directory might already exist, that's ok
      }
      
      const filepath = path.join(dataDir, filename);
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Failed to save ${filename}:`, error);
    }
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const foundUser = Array.from(this.users.values()).find(
      (user) => user.username === username
    );
    
    console.log("🔍 getUserByUsername:", {
      searchUsername: username,
      found: !!foundUser,
      foundUserId: foundUser?.id,
      totalUsers: this.users.size,
      allUsernames: Array.from(this.users.values()).map(u => u.username)
    });
    
    return foundUser;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    // Check if user already exists by username BEFORE creating
    const existingUser = await this.getUserByUsername(insertUser.username);
    if (existingUser) {
      console.error("❌ Username already exists:", insertUser.username);
      throw new Error("Username already taken");
    }

    const id = this.userIdCounter++;
    const user: User = { 
      id,
      username: insertUser.username,
      passwordHash: insertUser.passwordHash,
      publicKey: insertUser.publicKey,
      isOnline: true,
      lastSeen: new Date()
    };
    
    this.users.set(id, user);
    
    console.log("👤 User created successfully:", {
      id,
      username: insertUser.username,
      totalUsers: this.users.size,
      nextUserIdCounter: this.userIdCounter,
      allUserIds: Array.from(this.users.keys())
    });
    
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    const user = this.users.get(id);
    if (user) {
      user.isOnline = isOnline;
      user.lastSeen = new Date();
      this.users.set(id, user);
    }
  }

  async deleteUser(id: number): Promise<void> {
    // WICKR-ME-STYLE: User deletion completely disabled
    // Profiles are permanent and cannot be deleted
    console.log("🚫 WICKR-ME-STYLE: User deletion blocked - profiles are permanent:", id);
    throw new Error("User deletion not allowed - profiles are permanent like Wickr Me. Users must remember their password to access their permanent profile.");
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const id = this.messageIdCounter++;
    const newMessage: Message = {
      id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      messageType: message.messageType || "text",
      fileName: message.fileName || null,
      fileSize: message.fileSize || null,
      destructTimer: message.destructTimer || 86400,
      isRead: message.isRead || false,
      createdAt: new Date(),
      expiresAt: message.expiresAt,
    };
    this.messages.set(id, newMessage);
    
    // Update chat's last message
    this.updateChatLastMessage(message.chatId, id);
    
    // Increment unread count for receiver
    await this.incrementUnreadCount(message.chatId, message.receiverId);
    
    console.log("💾 Message created in storage:", {
      messageId: id,
      chatId: message.chatId,
      from: message.senderId,
      to: message.receiverId,
      content: message.content.substring(0, 30) + "..."
    });
    
    return newMessage;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    const chat = this.chats.get(chatId);
    if (!chat) {
      console.log("⚠️ Chat not found:", chatId);
      return [];
    }

    const messages = Array.from(this.messages.values())
      .filter(msg => msg.chatId === chatId)
      .filter(msg => new Date() < new Date(msg.expiresAt))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    console.log("📨 Retrieved", messages.length, "messages for chat", chatId);
    return messages;
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = new Date();
    const expiredIds: number[] = [];
    
    Array.from(this.messages.values()).forEach(message => {
      if (now >= new Date(message.expiresAt)) {
        expiredIds.push(message.id);
      }
    });
    
    expiredIds.forEach(id => this.messages.delete(id));
    
    if (expiredIds.length > 0) {
      console.log(`🗑️ Deleted ${expiredIds.length} expired messages`);
    }
    
    return expiredIds.length;
  }

  async deleteMessage(id: number): Promise<void> {
    this.messages.delete(id);
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const id = this.chatIdCounter++;
    const newChat: Chat = {
      ...chat,
      id,
      lastMessageId: null,
      unreadCount1: chat.unreadCount1 || 0,
      unreadCount2: chat.unreadCount2 || 0,
      createdAt: new Date(),
    };
    this.chats.set(id, newChat);
    return newChat;
  }

  async getChatsByUserId(userId: number): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const userChats = Array.from(this.chats.values())
      .filter(chat => chat.participant1Id === userId || chat.participant2Id === userId);

    const result = [];
    for (const chat of userChats) {
      const otherUserId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
      const otherUser = this.users.get(otherUserId);
      
      if (otherUser) {
        const lastMessage = chat.lastMessageId ? this.messages.get(chat.lastMessageId) : undefined;
        const unreadCount = chat.participant1Id === userId ? chat.unreadCount1 : chat.unreadCount2;
        
        result.push({
          ...chat,
          otherUser,
          lastMessage,
          unreadCount,
        });
      }
    }

    return result.sort((a, b) => {
      const aTime = a.lastMessage?.createdAt || a.createdAt;
      const bTime = b.lastMessage?.createdAt || b.createdAt;
      return new Date(bTime).getTime() - new Date(aTime).getTime();
    });
  }

  async getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined> {
    const chat = Array.from(this.chats.values()).find(chat =>
      (chat.participant1Id === user1Id && chat.participant2Id === user2Id) ||
      (chat.participant1Id === user2Id && chat.participant2Id === user1Id)
    );
    
    console.log(`🔍 Searching for chat between users ${user1Id} and ${user2Id}:`, chat ? `Found chat ${chat.id}` : 'No chat found');
    return chat;
  }

  // NEW: Get or create chat between two users for proper 1:1 separation
  async getOrCreateChatByParticipants(user1Id: number, user2Id: number): Promise<Chat> {
    // First, try to find existing chat
    let chat = await this.getChatByParticipants(user1Id, user2Id);
    
    if (!chat) {
      console.log(`💬 Creating new chat between users ${user1Id} and ${user2Id}`);
      chat = await this.createChat({
        participant1Id: user1Id,
        participant2Id: user2Id
      });
      console.log(`✅ New chat created with ID: ${chat.id}`);
    } else {
      console.log(`✅ Using existing chat ${chat.id} between users ${user1Id} and ${user2Id}`);
    }
    
    return chat;
  }

  async updateChatLastMessage(chatId: number, messageId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      chat.lastMessageId = messageId;
      this.chats.set(chatId, chat);
    }
  }

  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const results = Array.from(this.users.values())
      .filter(user => 
        user.id !== excludeId && 
        user.username.toLowerCase().includes(query.toLowerCase())
      )
      .slice(0, 10);
    
    console.log("🔍 searchUsers:", {
      query,
      excludeId,
      totalUsers: this.users.size,
      resultsCount: results.length,
      allUsers: Array.from(this.users.values()).map(u => ({ id: u.id, username: u.username }))
    });
    
    return results;
  }
}

// Add the missing methods to MemStorage class
export class MemStorageEnhanced extends MemStorage implements IStorage {
  // Get persistent chat contacts - returns all chats even if messages are deleted
  async getPersistentChatContacts(userId: number): Promise<Array<Chat & { otherUser: User }>> {
    console.log(`📋 Getting persistent chat contacts for user ${userId}`);
    
    const userChats = Array.from(this.chats.values()).filter(chat => 
      chat.participant1Id === userId || chat.participant2Id === userId
    );

    const result = [];
    for (const chat of userChats) {
      const otherUserId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
      const otherUser = this.users.get(otherUserId);
      
      if (otherUser) {
        result.push({
          ...chat,
          otherUser
        });
      }
    }

    console.log(`📋 Found ${result.length} persistent chat contacts for user ${userId}`);
    // Sort by chat creation time (most recent first)
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async markChatAsActive(chatId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      // Update chat timestamp to show recent activity
      chat.createdAt = new Date().toISOString();
      this.persistData();
      console.log(`✅ Marked chat ${chatId} as active`);
    }
  }

  // Block/unblock operations
  async blockUser(blockerId: number, blockedId: number): Promise<void> {
    // Check if already blocked
    const existing = Array.from(this.blockedUsers.values()).find(
      block => block.blockerId === blockerId && block.blockedId === blockedId
    );
    
    if (!existing) {
      const blockRecord: BlockedUser = {
        id: this.blockedUserIdCounter++,
        blockerId,
        blockedId,
        createdAt: new Date().toISOString(),
      };
      this.blockedUsers.set(blockRecord.id, blockRecord);
      console.log(`🚫 User ${blockerId} blocked user ${blockedId}`);
    }
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    const blockToRemove = Array.from(this.blockedUsers.values()).find(
      block => block.blockerId === blockerId && block.blockedId === blockedId
    );
    
    if (blockToRemove) {
      this.blockedUsers.delete(blockToRemove.id);
      console.log(`✅ User ${blockerId} unblocked user ${blockedId}`);
    }
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const blockedUserIds = Array.from(this.blockedUsers.values())
      .filter(block => block.blockerId === userId)
      .map(block => block.blockedId);
    
    return blockedUserIds.map(id => this.users.get(id)).filter(Boolean) as User[];
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    return Array.from(this.blockedUsers.values()).some(
      block => block.blockerId === blockerId && block.blockedId === blockedId
    );
  }

  // Chat deletion operations (user-specific)
  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    // Check if already deleted for this user
    const existing = Array.from(this.deletedChats.values()).find(
      deletion => deletion.userId === userId && deletion.chatId === chatId
    );
    
    if (!existing) {
      const deletionRecord: DeletedChat = {
        id: this.deletedChatIdCounter++,
        userId,
        chatId,
        deletedAt: new Date().toISOString(),
      };
      this.deletedChats.set(deletionRecord.id, deletionRecord);
      console.log(`🗑️ User ${userId} deleted chat ${chatId} (chat still exists for other participant)`);
    }
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    return Array.from(this.deletedChats.values()).some(
      deletion => deletion.userId === userId && deletion.chatId === chatId
    );
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    const deletionToRemove = Array.from(this.deletedChats.values()).find(
      deletion => deletion.userId === userId && deletion.chatId === chatId
    );
    
    if (deletionToRemove) {
      this.deletedChats.delete(deletionToRemove.id);
      console.log(`♻️ Chat ${chatId} reactivated for user ${userId}`);
    }
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    // Delete the chat completely
    this.chats.delete(chatId);
    
    // Delete all messages in the chat
    const messagesToDelete = Array.from(this.messages.values())
      .filter(msg => msg.chatId === chatId);
    messagesToDelete.forEach(msg => this.messages.delete(msg.id));
    
    // Remove deletion records for this chat
    const deletionsToRemove = Array.from(this.deletedChats.values())
      .filter(deletion => deletion.chatId === chatId);
    deletionsToRemove.forEach(deletion => this.deletedChats.delete(deletion.id));
    
    console.log(`🗑️ Chat ${chatId} permanently deleted with ${messagesToDelete.length} messages`);
  }

  // Override getChatsByUserId to filter out deleted chats
  async getChatsByUserId(userId: number): Promise<Array<Chat & { otherUser: User; lastMessage?: Message }>> {
    const allChats = await super.getChatsByUserId(userId);
    
    // Filter out chats that are deleted for this user
    const activeChats = [];
    for (const chat of allChats) {
      const isDeleted = await this.isChatDeletedForUser(userId, chat.id);
      if (!isDeleted) {
        activeChats.push(chat);
      }
    }
    
    return activeChats;
  }

  // Override getPersistentChatContacts to filter out deleted chats
  async getPersistentChatContacts(userId: number): Promise<Array<Chat & { otherUser: User; unreadCount: number }>> {
    console.log(`📋 Getting persistent chat contacts for user ${userId}`);
    
    const userChats = Array.from(this.chats.values()).filter(chat => 
      chat.participant1Id === userId || chat.participant2Id === userId
    );

    const result = [];
    for (const chat of userChats) {
      // Check if chat is deleted for this user
      const isDeleted = await this.isChatDeletedForUser(userId, chat.id);
      if (isDeleted) {
        continue;
      }

      const otherUserId = chat.participant1Id === userId ? chat.participant2Id : chat.participant1Id;
      const otherUser = this.users.get(otherUserId);
      
      if (otherUser) {
        // Calculate the correct unread count for this user
        const unreadCount = userId === chat.participant1Id ? chat.unreadCount1 : chat.unreadCount2;
        
        // Create a new object without the individual unreadCount fields
        const { unreadCount1, unreadCount2, ...chatWithoutUnreadCounts } = chat;
        
        result.push({
          ...chatWithoutUnreadCounts,
          otherUser,
          unreadCount
        });
      }
    }

    console.log(`📋 Found ${result.length} persistent chat contacts for user ${userId}`);
    // Sort by chat creation time (most recent first)
    return result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    const message = this.messages.get(messageId);
    if (message) {
      message.isRead = true;
      this.messages.set(messageId, message);
      console.log("✅ Message marked as read:", messageId);
    }
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      if (chat.participant1Id === userId) {
        chat.unreadCount1 = 0;
      } else if (chat.participant2Id === userId) {
        chat.unreadCount2 = 0;
      }
      this.chats.set(chatId, chat);
      console.log("✅ Chat marked as read for user:", chatId, userId);
    }
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      if (chat.participant1Id === userId) {
        chat.unreadCount1 = (chat.unreadCount1 || 0) + 1;
      } else if (chat.participant2Id === userId) {
        chat.unreadCount2 = (chat.unreadCount2 || 0) + 1;
      }
      this.chats.set(chatId, chat);
      console.log("📊 Incremented unread count for user:", chatId, userId);
    }
  }

  async resetUnreadCount(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (chat) {
      if (chat.participant1Id === userId) {
        chat.unreadCount1 = 0;
      } else if (chat.participant2Id === userId) {
        chat.unreadCount2 = 0;
      }
      this.chats.set(chatId, chat);
      console.log("🔄 Reset unread count for user:", chatId, userId);
    }
  }
}

// Switch to in-memory storage (works immediately, survives restarts via file persistence)
export const storage = new MemStorageEnhanced();
