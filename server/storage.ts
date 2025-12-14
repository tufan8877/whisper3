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
  type DeletedChat,
} from "@shared/schema";

import { getDb } from "./db";
import { eq, and, or, desc, asc, sql, ne, isNull } from "drizzle-orm";

/**
 * Wichtig:
 * - deleteExpiredMessages() muss eine Zahl zurückgeben, weil dein Server-Code deletedCount loggt.
 */
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
  deleteExpiredMessages(): Promise<number>;
  deleteMessage(id: number): Promise<void>;
  markMessageAsRead(messageId: number): Promise<void>;
  markChatAsRead(chatId: number, userId: number): Promise<void>;

  // Chat operations
  createChat(chat: InsertChat): Promise<Chat>;
  getChatsByUserId(
    userId: number
  ): Promise<
    Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>
  >;
  getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined>;
  getOrCreateChatByParticipants(user1Id: number, user2Id: number): Promise<Chat>;
  updateChatLastMessage(chatId: number, messageId: number): Promise<void>;
  incrementUnreadCount(chatId: number, userId: number): Promise<void>;
  resetUnreadCount(chatId: number, userId: number): Promise<void>;

  // Persistent chat contacts
  getPersistentChatContacts(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>>;
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

/* =========================================================
   DATABASE STORAGE (Postgres/Drizzle)  ✅ LAZY DB
========================================================= */
export class DatabaseStorage implements IStorage {
  private db() {
    return getDb();
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await this.db().select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this.db()
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await this.db().insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    await this.db()
      .update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, id));
  }

  async deleteUser(id: number): Promise<void> {
    // Wickr-style: niemals löschen
    console.log(`🚫 User deletion blocked for ID ${id}`);
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const [newMessage] = await this.db().insert(messages).values(message).returning();
    return newMessage;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    return await this.db()
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = new Date();
    const result: any = await this.db()
      .delete(messages)
      .where(sql`${messages.expiresAt} < ${now}`);
    // drizzle liefert je nach driver rowCount / changes
    return (result?.rowCount ?? result?.changes ?? 0) as number;
  }

  async deleteMessage(id: number): Promise<void> {
    await this.db().delete(messages).where(eq(messages.id, id));
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await this.db()
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId));
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const [chat] = await this.db().select().from(chats).where(eq(chats.id, chatId));
    if (!chat) return;

    if (chat.participant1Id === userId) {
      await this.db().update(chats).set({ unreadCount1: 0 }).where(eq(chats.id, chatId));
    } else if (chat.participant2Id === userId) {
      await this.db().update(chats).set({ unreadCount2: 0 }).where(eq(chats.id, chatId));
    }
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await this.db().insert(chats).values(chat).returning();
    return newChat;
  }

  /**
   * ✅ Filtert Chats raus, die für diesen User gelöscht wurden (deletedChats Tabelle)
   */
  async getChatsByUserId(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const rows = await this.db()
      .select({
        chat: chats,
        otherUser: users,
        lastMessage: messages,
        deleted: deletedChats, // nur zum filtern
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
      .leftJoin(
        deletedChats,
        and(eq(deletedChats.userId, userId), eq(deletedChats.chatId, chats.id))
      )
      .where(
        and(
          or(eq(chats.participant1Id, userId), eq(chats.participant2Id, userId)),
          isNull(deletedChats.id) // ✅ rausfiltern
        )
      )
      .orderBy(desc(chats.lastMessageTimestamp), desc(chats.createdAt));

    return rows.map((row) => {
      const unreadCount =
        row.chat.participant1Id === userId ? row.chat.unreadCount1 : row.chat.unreadCount2;

      return {
        ...row.chat,
        otherUser: row.otherUser!,
        lastMessage: row.lastMessage || undefined,
        unreadCount,
      };
    });
  }

  async getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined> {
    const [chat] = await this.db()
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
        lastMessageTimestamp: new Date(),
      });
    }
    return chat;
  }

  async updateChatLastMessage(chatId: number, messageId: number): Promise<void> {
    await this.db()
      .update(chats)
      .set({
        lastMessageId: messageId,
        lastMessageTimestamp: new Date(),
      })
      .where(eq(chats.id, chatId));
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    const [chat] = await this.db().select().from(chats).where(eq(chats.id, chatId));
    if (!chat) return;

    if (chat.participant1Id === userId) {
      await this.db()
        .update(chats)
        .set({ unreadCount1: sql`${chats.unreadCount1} + 1` })
        .where(eq(chats.id, chatId));
    } else if (chat.participant2Id === userId) {
      await this.db()
        .update(chats)
        .set({ unreadCount2: sql`${chats.unreadCount2} + 1` })
        .where(eq(chats.id, chatId));
    }
  }

  async resetUnreadCount(chatId: number, userId: number): Promise<void> {
    await this.markChatAsRead(chatId, userId);
  }

  async getPersistentChatContacts(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    // identisch wie getChatsByUserId
    return this.getChatsByUserId(userId);
  }

  async markChatAsActive(chatId: number): Promise<void> {
    await this.db()
      .update(chats)
      .set({ lastMessageTimestamp: new Date() })
      .where(eq(chats.id, chatId));
  }

  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const validExcludeId = Number.isFinite(excludeId) ? excludeId : 0;

    return await this.db()
      .select()
      .from(users)
      .where(
        and(
          sql`${users.username} ILIKE ${"%" + query + "%"}`,
          ne(users.id, validExcludeId)
        )
      )
      .limit(10);
  }

  async blockUser(blockerId: number, blockedId: number): Promise<void> {
    await this.db()
      .insert(blockedUsers)
      .values({ blockerId, blockedId } as any)
      .onConflictDoNothing();
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    await this.db()
      .delete(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const blocked = await this.db()
      .select({ user: users })
      .from(blockedUsers)
      .innerJoin(users, eq(users.id, blockedUsers.blockedId))
      .where(eq(blockedUsers.blockerId, userId));

    return blocked.map((row) => row.user);
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const [blocked] = await this.db()
      .select()
      .from(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
    return !!blocked;
  }

  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    await this.db()
      .insert(deletedChats)
      .values({ userId, chatId } as any)
      .onConflictDoNothing();
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    const [deleted] = await this.db()
      .select()
      .from(deletedChats)
      .where(and(eq(deletedChats.userId, userId), eq(deletedChats.chatId, chatId)));
    return !!deleted;
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    await this.db()
      .delete(deletedChats)
      .where(and(eq(deletedChats.userId, userId), eq(deletedChats.chatId, chatId)));
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    await this.db().delete(messages).where(eq(messages.chatId, chatId));
    await this.db().delete(deletedChats).where(eq(deletedChats.chatId, chatId));
    await this.db().delete(chats).where(eq(chats.id, chatId));
  }
}

/* =========================================================
   MEMORY STORAGE (persisted JSON)  ✅ DEIN CODE 1:1
========================================================= */
export class MemStorage implements IStorage {
  public users: Map<number, User>;
  protected messages: Map<number, Message>;
  protected chats: Map<number, Chat>;
  protected blockedUsers: Map<number, BlockedUser>;
  protected deletedChats: Map<number, DeletedChat>;

  public userIdCounter: number;
  protected messageIdCounter: number;
  protected chatIdCounter: number;
  protected blockedUserIdCounter: number;
  protected deletedChatIdCounter: number;

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

    this.loadPersistedData().catch(console.error);

    setInterval(() => this.deleteExpiredMessages().catch(console.error), 60000);
    setInterval(() => this.persistData().catch(console.error), 10000);
  }

  private async loadFromFile(filename: string): Promise<any> {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const filepath = path.join(process.cwd(), "data", filename);
      const data = await fs.readFile(filepath, "utf8").catch((err: any) => {
        if (err.code === "ENOENT") return null;
        throw err;
      });
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error(`❌ Failed to load ${filename}:`, error);
      return null;
    }
  }

  private async saveToFile(filename: string, data: any): Promise<void> {
    try {
      const fs = await import("fs/promises");
      const path = await import("path");
      const dataDir = path.join(process.cwd(), "data");
      await fs.mkdir(dataDir, { recursive: true }).catch(() => {});
      const filepath = path.join(dataDir, filename);
      await fs.writeFile(filepath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Failed to save ${filename}:`, error);
    }
  }

  private reviveDate(d: any): Date | null {
    if (!d) return null;
    const dd = new Date(d);
    return isNaN(dd.getTime()) ? null : dd;
  }

  private async loadPersistedData() {
    const usersData = await this.loadFromFile("users.json");
    if (usersData) {
      Object.entries(usersData.users || {}).forEach(([id, user]: any) => {
        if (user?.lastSeen) user.lastSeen = this.reviveDate(user.lastSeen) || new Date();
        this.users.set(Number(id), user as User);
      });
      this.userIdCounter = usersData.userIdCounter || 1;
    }

    const chatsData = await this.loadFromFile("chats.json");
    if (chatsData) {
      Object.entries(chatsData.chats || {}).forEach(([id, chat]: any) => {
        if (chat?.createdAt) chat.createdAt = this.reviveDate(chat.createdAt) || new Date();
        if (chat?.lastMessageTimestamp)
          chat.lastMessageTimestamp = this.reviveDate(chat.lastMessageTimestamp) || new Date();
        this.chats.set(Number(id), chat as Chat);
      });
      this.chatIdCounter = chatsData.chatIdCounter || 1;
    }

    const messagesData = await this.loadFromFile("messages.json");
    if (messagesData) {
      Object.entries(messagesData.messages || {}).forEach(([id, msg]: any) => {
        if (msg?.createdAt) msg.createdAt = this.reviveDate(msg.createdAt) || new Date();
        if (msg?.expiresAt) msg.expiresAt = this.reviveDate(msg.expiresAt) || new Date();
        this.messages.set(Number(id), msg as Message);
      });
      this.messageIdCounter = messagesData.messageIdCounter || 1;
    }

    const blockedData = await this.loadFromFile("blocked.json");
    if (blockedData) {
      Object.entries(blockedData.blockedUsers || {}).forEach(([id, block]: any) => {
        if (block?.createdAt) block.createdAt = this.reviveDate(block.createdAt) || new Date();
        this.blockedUsers.set(Number(id), block as BlockedUser);
      });
      this.blockedUserIdCounter = blockedData.blockedUserIdCounter || 1;
    }

    const deletedData = await this.loadFromFile("deletedChats.json");
    if (deletedData) {
      Object.entries(deletedData.deletedChats || {}).forEach(([id, del]: any) => {
        if (del?.deletedAt) del.deletedAt = this.reviveDate(del.deletedAt) || new Date();
        this.deletedChats.set(Number(id), del as DeletedChat);
      });
      this.deletedChatIdCounter = deletedData.deletedChatIdCounter || 1;
    }

    console.log("✅ MemStorage loaded:", {
      users: this.users.size,
      chats: this.chats.size,
      messages: this.messages.size,
      blocked: this.blockedUsers.size,
      deletedChats: this.deletedChats.size,
    });
  }

  private async persistData() {
    await this.saveToFile("users.json", {
      users: Object.fromEntries(this.users),
      userIdCounter: this.userIdCounter,
    });

    await this.saveToFile("chats.json", {
      chats: Object.fromEntries(this.chats),
      chatIdCounter: this.chatIdCounter,
    });

    await this.saveToFile("messages.json", {
      messages: Object.fromEntries(this.messages),
      messageIdCounter: this.messageIdCounter,
    });

    await this.saveToFile("blocked.json", {
      blockedUsers: Object.fromEntries(this.blockedUsers),
      blockedUserIdCounter: this.blockedUserIdCounter,
    });

    await this.saveToFile("deletedChats.json", {
      deletedChats: Object.fromEntries(this.deletedChats),
      deletedChatIdCounter: this.deletedChatIdCounter,
    });
  }

  // Users
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find((u) => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const exists = await this.getUserByUsername(insertUser.username);
    if (exists) throw new Error("Username already taken");

    const id = this.userIdCounter++;
    const user: User = {
      id,
      username: insertUser.username,
      passwordHash: insertUser.passwordHash,
      publicKey: insertUser.publicKey,
      isOnline: true,
      lastSeen: new Date(),
    } as any;

    this.users.set(id, user);
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    const u = this.users.get(id);
    if (!u) return;
    u.isOnline = isOnline as any;
    u.lastSeen = new Date() as any;
    this.users.set(id, u);
  }

  async deleteUser(_id: number): Promise<void> {
    throw new Error("User deletion not allowed (Wickr-style).");
  }

  // Messages
  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const id = this.messageIdCounter++;

    const m: Message = {
      id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      messageType: message.messageType || "text",
      fileName: message.fileName || null,
      fileSize: message.fileSize || null,
      destructTimer: (message as any).destructTimer || 86400,
      isRead: (message as any).isRead || false,
      createdAt: new Date(),
      expiresAt: message.expiresAt,
    } as any;

    this.messages.set(id, m);

    await this.updateChatLastMessage(message.chatId, id);
    await this.incrementUnreadCount(message.chatId, message.receiverId);

    return m;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    const now = new Date();
    return Array.from(this.messages.values())
      .filter((m) => m.chatId === chatId)
      .filter((m) => new Date(m.expiresAt as any) > now)
      .sort(
        (a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime()
      );
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = new Date();
    const expiredIds = Array.from(this.messages.values())
      .filter((m) => new Date(m.expiresAt as any) <= now)
      .map((m) => m.id);

    expiredIds.forEach((id) => this.messages.delete(id));
    return expiredIds.length;
  }

  async deleteMessage(id: number): Promise<void> {
    this.messages.delete(id);
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    const m = this.messages.get(messageId);
    if (!m) return;
    (m as any).isRead = true;
    this.messages.set(messageId, m);
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    if (chat.participant1Id === userId) (chat as any).unreadCount1 = 0;
    if (chat.participant2Id === userId) (chat as any).unreadCount2 = 0;

    this.chats.set(chatId, chat);
  }

  // Chats
  async createChat(chat: InsertChat): Promise<Chat> {
    const id = this.chatIdCounter++;
    const c: Chat = {
      id,
      participant1Id: chat.participant1Id,
      participant2Id: chat.participant2Id,
      unreadCount1: (chat as any).unreadCount1 ?? 0,
      unreadCount2: (chat as any).unreadCount2 ?? 0,
      lastMessageId: null,
      lastMessageTimestamp: (chat as any).lastMessageTimestamp ?? new Date(),
      createdAt: new Date(),
    } as any;

    this.chats.set(id, c);
    return c;
  }

  async getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined> {
    return Array.from(this.chats.values()).find(
      (c) =>
        (c.participant1Id === user1Id && c.participant2Id === user2Id) ||
        (c.participant1Id === user2Id && c.participant2Id === user1Id)
    );
  }

  async getOrCreateChatByParticipants(user1Id: number, user2Id: number): Promise<Chat> {
    let c = await this.getChatByParticipants(user1Id, user2Id);
    if (!c) {
      c = await this.createChat({
        participant1Id: user1Id,
        participant2Id: user2Id,
        unreadCount1: 0,
        unreadCount2: 0,
        lastMessageTimestamp: new Date(),
      } as any);
    }
    return c;
  }

  async updateChatLastMessage(chatId: number, messageId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    (chat as any).lastMessageId = messageId;
    (chat as any).lastMessageTimestamp = new Date();
    this.chats.set(chatId, chat);
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;

    if (chat.participant1Id === userId)
      (chat as any).unreadCount1 = ((chat as any).unreadCount1 ?? 0) + 1;
    if (chat.participant2Id === userId)
      (chat as any).unreadCount2 = ((chat as any).unreadCount2 ?? 0) + 1;

    this.chats.set(chatId, chat);
  }

  async resetUnreadCount(chatId: number, userId: number): Promise<void> {
    await this.markChatAsRead(chatId, userId);
  }

  /**
   * ✅ Filtert gelöschte Chats raus (Mem)
   */
  async getChatsByUserId(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const deletedChatIds = new Set(
      Array.from(this.deletedChats.values())
        .filter((d) => d.userId === userId)
        .map((d) => d.chatId)
    );

    const userChats = Array.from(this.chats.values()).filter(
      (c) =>
        (c.participant1Id === userId || c.participant2Id === userId) &&
        !deletedChatIds.has(c.id)
    );

    const result: Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }> = [];

    for (const c of userChats) {
      const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
      const otherUser = this.users.get(otherId);
      if (!otherUser) continue;

      const lastMessage = c.lastMessageId ? this.messages.get(c.lastMessageId) : undefined;
      const unreadCount =
        c.participant1Id === userId ? (c as any).unreadCount1 : (c as any).unreadCount2;

      result.push({
        ...(c as any),
        otherUser,
        lastMessage,
        unreadCount,
      });
    }

    return result.sort((a, b) => {
      const at = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt as any).getTime()
        : new Date(a.lastMessageTimestamp as any).getTime();
      const bt = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt as any).getTime()
        : new Date(b.lastMessageTimestamp as any).getTime();
      return bt - at;
    });
  }

  async getPersistentChatContacts(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    return this.getChatsByUserId(userId);
  }

  async markChatAsActive(chatId: number): Promise<void> {
    const chat = this.chats.get(chatId);
    if (!chat) return;
    (chat as any).lastMessageTimestamp = new Date();
    this.chats.set(chatId, chat);
  }

  // Search
  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const q = query.toLowerCase();
    return Array.from(this.users.values())
      .filter((u) => u.id !== excludeId && u.username.toLowerCase().includes(q))
      .slice(0, 10);
  }

  // Blocked
  async blockUser(blockerId: number, blockedId: number): Promise<void> {
    const exists = Array.from(this.blockedUsers.values()).some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );
    if (exists) return;

    const id = this.blockedUserIdCounter++;
    this.blockedUsers.set(id, {
      id,
      blockerId,
      blockedId,
      createdAt: new Date(),
    } as any);
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    const found = Array.from(this.blockedUsers.entries()).find(
      ([, b]) => b.blockerId === blockerId && b.blockedId === blockedId
    );
    if (found) this.blockedUsers.delete(found[0]);
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const ids = Array.from(this.blockedUsers.values())
      .filter((b) => b.blockerId === userId)
      .map((b) => b.blockedId);

    return ids.map((id) => this.users.get(id)).filter(Boolean) as User[];
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    return Array.from(this.blockedUsers.values()).some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );
  }

  // Deleted chats (user specific)
  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    const exists = Array.from(this.deletedChats.values()).some(
      (d) => d.userId === userId && d.chatId === chatId
    );
    if (exists) return;

    const id = this.deletedChatIdCounter++;
    this.deletedChats.set(id, {
      id,
      userId,
      chatId,
      deletedAt: new Date(),
    } as any);
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    return Array.from(this.deletedChats.values()).some(
      (d) => d.userId === userId && d.chatId === chatId
    );
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    const found = Array.from(this.deletedChats.entries()).find(
      ([, d]) => d.userId === userId && d.chatId === chatId
    );
    if (found) this.deletedChats.delete(found[0]);
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    this.chats.delete(chatId);

    for (const [id, m] of Array.from(this.messages.entries())) {
      if (m.chatId === chatId) this.messages.delete(id);
    }

    for (const [id, d] of Array.from(this.deletedChats.entries())) {
      if (d.chatId === chatId) this.deletedChats.delete(id);
    }
  }
}

/**
 * ✅ Storage Auswahl:
 * - Wenn DATABASE_URL vorhanden ist → DatabaseStorage
 * - Sonst → MemStorage (damit App wenigstens startet)
 *
 * Hinweis: Wenn DATABASE_URL falsch ist, crasht DatabaseStorage erst beim ersten DB Zugriff
 * und du siehst die echte Fehlermeldung klar im Render-Log.
 */
const hasDbUrl = !!process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0;

export const storage: IStorage = hasDbUrl ? new DatabaseStorage() : new MemStorage();