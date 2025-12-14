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

import { db } from "./db";
import { eq, and, or, desc, asc, sql, ne, isNull } from "drizzle-orm";

/**
 * Wichtig:
 * - deleteExpiredMessages() MUSS number zurückgeben (für deine Logs/Scheduler)
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
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>>;
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
   DATABASE STORAGE (Postgres/Drizzle)
========================================================= */
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
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    await db.update(users).set({ isOnline, lastSeen: new Date() }).where(eq(users.id, id));
  }

  async deleteUser(_id: number): Promise<void> {
    // Wickr-style: nicht löschen
    console.log(`🚫 User deletion blocked`);
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message as any).returning();
    return newMessage;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = new Date();
    const result: any = await db.delete(messages).where(sql`${messages.expiresAt} < ${now}`);
    return (result?.rowCount ?? result?.changes ?? 0) as number;
  }

  async deleteMessage(id: number): Promise<void> {
    await db.delete(messages).where(eq(messages.id, id));
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db.update(messages).set({ isRead: true }).where(eq(messages.id, messageId));
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    if (!chat) return;

    if (chat.participant1Id === userId) {
      await db.update(chats).set({ unreadCount1: 0 }).where(eq(chats.id, chatId));
    } else if (chat.participant2Id === userId) {
      await db.update(chats).set({ unreadCount2: 0 }).where(eq(chats.id, chatId));
    }
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const [newChat] = await db.insert(chats).values(chat as any).returning();
    return newChat;
  }

  /**
   * ✅ Filtert Chats raus, die für diesen User gelöscht wurden (deletedChats)
   */
  async getChatsByUserId(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const rows = await db
      .select({
        chat: chats,
        otherUser: users,
        lastMessage: messages,
        deleted: deletedChats,
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
          isNull(deletedChats.id)
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
        lastMessageTimestamp: new Date(),
      } as any);
    }
    return chat;
  }

  async updateChatLastMessage(chatId: number, messageId: number): Promise<void> {
    await db
      .update(chats)
      .set({ lastMessageId: messageId, lastMessageTimestamp: new Date() })
      .where(eq(chats.id, chatId));
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    if (!chat) return;

    if (chat.participant1Id === userId) {
      await db
        .update(chats)
        .set({ unreadCount1: sql`${chats.unreadCount1} + 1` })
        .where(eq(chats.id, chatId));
    } else if (chat.participant2Id === userId) {
      await db
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
    return this.getChatsByUserId(userId);
  }

  async markChatAsActive(chatId: number): Promise<void> {
    await db.update(chats).set({ lastMessageTimestamp: new Date() }).where(eq(chats.id, chatId));
  }

  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const validExcludeId = Number.isFinite(excludeId) ? excludeId : 0;
    return await db
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
    await db.insert(blockedUsers).values({ blockerId, blockedId } as any).onConflictDoNothing();
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    await db
      .delete(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const blocked = await db
      .select({ user: users })
      .from(blockedUsers)
      .innerJoin(users, eq(users.id, blockedUsers.blockedId))
      .where(eq(blockedUsers.blockerId, userId));
    return blocked.map((row) => row.user);
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    const [blocked] = await db
      .select()
      .from(blockedUsers)
      .where(and(eq(blockedUsers.blockerId, blockerId), eq(blockedUsers.blockedId, blockedId)));
    return !!blocked;
  }

  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    await db.insert(deletedChats).values({ userId, chatId } as any).onConflictDoNothing();
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    const [deleted] = await db
      .select()
      .from(deletedChats)
      .where(and(eq(deletedChats.userId, userId), eq(deletedChats.chatId, chatId)));
    return !!deleted;
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    await db
      .delete(deletedChats)
      .where(and(eq(deletedChats.userId, userId), eq(deletedChats.chatId, chatId)));
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    await db.delete(messages).where(eq(messages.chatId, chatId));
    await db.delete(deletedChats).where(eq(deletedChats.chatId, chatId));
    await db.delete(chats).where(eq(chats.id, chatId));
  }
}

/* =========================================================
   MEMORY STORAGE (optional fallback)
========================================================= */
export class MemStorage implements IStorage {
  public usersMap = new Map<number, User>();
  public messagesMap = new Map<number, Message>();
  public chatsMap = new Map<number, Chat>();
  public blockedMap = new Map<number, BlockedUser>();
  public deletedMap = new Map<number, DeletedChat>();

  public userIdCounter = 1;
  public messageIdCounter = 1;
  public chatIdCounter = 1;
  public blockedIdCounter = 1;
  public deletedIdCounter = 1;

  async getUser(id: number): Promise<User | undefined> {
    return this.usersMap.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.usersMap.values()).find((u) => u.username === username);
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
      isOnline: true as any,
      lastSeen: new Date() as any,
    } as any;

    this.usersMap.set(id, user);
    return user;
  }

  async updateUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    const u = this.usersMap.get(id);
    if (!u) return;
    (u as any).isOnline = isOnline;
    (u as any).lastSeen = new Date();
    this.usersMap.set(id, u);
  }

  async deleteUser(): Promise<void> {
    console.log("🚫 User deletion blocked");
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message> {
    const id = this.messageIdCounter++;
    const m: Message = {
      id,
      chatId: message.chatId,
      senderId: message.senderId,
      receiverId: message.receiverId,
      content: message.content,
      messageType: (message as any).messageType || "text",
      fileName: (message as any).fileName ?? null,
      fileSize: (message as any).fileSize ?? null,
      destructTimer: (message as any).destructTimer ?? 86400,
      isRead: false as any,
      createdAt: new Date() as any,
      expiresAt: message.expiresAt as any,
    } as any;

    this.messagesMap.set(id, m);
    await this.updateChatLastMessage(message.chatId, id);
    await this.incrementUnreadCount(message.chatId, message.receiverId);
    return m;
  }

  async getMessagesByChat(chatId: number): Promise<Message[]> {
    const now = Date.now();
    return Array.from(this.messagesMap.values())
      .filter((m) => m.chatId === chatId)
      .filter((m) => new Date(m.expiresAt as any).getTime() > now)
      .sort((a, b) => new Date(a.createdAt as any).getTime() - new Date(b.createdAt as any).getTime());
  }

  async deleteExpiredMessages(): Promise<number> {
    const now = Date.now();
    const expired = Array.from(this.messagesMap.values())
      .filter((m) => new Date(m.expiresAt as any).getTime() <= now)
      .map((m) => m.id);
    expired.forEach((id) => this.messagesMap.delete(id));
    return expired.length;
  }

  async deleteMessage(id: number): Promise<void> {
    this.messagesMap.delete(id);
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    const m = this.messagesMap.get(messageId);
    if (!m) return;
    (m as any).isRead = true;
    this.messagesMap.set(messageId, m);
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const c = this.chatsMap.get(chatId);
    if (!c) return;

    if (c.participant1Id === userId) (c as any).unreadCount1 = 0;
    if (c.participant2Id === userId) (c as any).unreadCount2 = 0;

    this.chatsMap.set(chatId, c);
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const id = this.chatIdCounter++;
    const c: Chat = {
      id,
      participant1Id: chat.participant1Id,
      participant2Id: chat.participant2Id,
      unreadCount1: (chat as any).unreadCount1 ?? 0,
      unreadCount2: (chat as any).unreadCount2 ?? 0,
      lastMessageId: null as any,
      lastMessageTimestamp: new Date() as any,
      createdAt: new Date() as any,
    } as any;

    this.chatsMap.set(id, c);
    return c;
  }

  async getChatsByUserId(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    const deletedChatIds = new Set(
      Array.from(this.deletedMap.values()).filter((d) => d.userId === userId).map((d) => d.chatId)
    );

    const userChats = Array.from(this.chatsMap.values()).filter(
      (c) => (c.participant1Id === userId || c.participant2Id === userId) && !deletedChatIds.has(c.id)
    );

    const out: Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }> = [];

    for (const c of userChats) {
      const otherId = c.participant1Id === userId ? c.participant2Id : c.participant1Id;
      const otherUser = this.usersMap.get(otherId);
      if (!otherUser) continue;

      const lastMessage = c.lastMessageId ? this.messagesMap.get(c.lastMessageId as any) : undefined;
      const unreadCount = c.participant1Id === userId ? (c as any).unreadCount1 : (c as any).unreadCount2;

      out.push({ ...(c as any), otherUser, lastMessage, unreadCount });
    }

    return out.sort((a, b) => {
      const at = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt as any).getTime() : new Date(a.lastMessageTimestamp as any).getTime();
      const bt = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt as any).getTime() : new Date(b.lastMessageTimestamp as any).getTime();
      return bt - at;
    });
  }

  async getChatByParticipants(user1Id: number, user2Id: number): Promise<Chat | undefined> {
    return Array.from(this.chatsMap.values()).find(
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
    const c = this.chatsMap.get(chatId);
    if (!c) return;
    (c as any).lastMessageId = messageId;
    (c as any).lastMessageTimestamp = new Date();
    this.chatsMap.set(chatId, c);
  }

  async incrementUnreadCount(chatId: number, userId: number): Promise<void> {
    const c = this.chatsMap.get(chatId);
    if (!c) return;

    if (c.participant1Id === userId) (c as any).unreadCount1 = ((c as any).unreadCount1 ?? 0) + 1;
    if (c.participant2Id === userId) (c as any).unreadCount2 = ((c as any).unreadCount2 ?? 0) + 1;

    this.chatsMap.set(chatId, c);
  }

  async resetUnreadCount(chatId: number, userId: number): Promise<void> {
    await this.markChatAsRead(chatId, userId);
  }

  async getPersistentChatContacts(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>> {
    return this.getChatsByUserId(userId);
  }

  async markChatAsActive(chatId: number): Promise<void> {
    const c = this.chatsMap.get(chatId);
    if (!c) return;
    (c as any).lastMessageTimestamp = new Date();
    this.chatsMap.set(chatId, c);
  }

  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const q = query.toLowerCase();
    return Array.from(this.usersMap.values())
      .filter((u) => u.id !== excludeId && u.username.toLowerCase().includes(q))
      .slice(0, 10);
  }

  async blockUser(blockerId: number, blockedId: number): Promise<void> {
    const exists = Array.from(this.blockedMap.values()).some(
      (b) => b.blockerId === blockerId && b.blockedId === blockedId
    );
    if (exists) return;

    const id = this.blockedIdCounter++;
    this.blockedMap.set(id, { id, blockerId, blockedId, createdAt: new Date() as any } as any);
  }

  async unblockUser(blockerId: number, blockedId: number): Promise<void> {
    const found = Array.from(this.blockedMap.entries()).find(
      ([, b]) => b.blockerId === blockerId && b.blockedId === blockedId
    );
    if (found) this.blockedMap.delete(found[0]);
  }

  async getBlockedUsers(userId: number): Promise<User[]> {
    const ids = Array.from(this.blockedMap.values()).filter((b) => b.blockerId === userId).map((b) => b.blockedId);
    return ids.map((id) => this.usersMap.get(id)).filter(Boolean) as User[];
  }

  async isUserBlocked(blockerId: number, blockedId: number): Promise<boolean> {
    return Array.from(this.blockedMap.values()).some((b) => b.blockerId === blockerId && b.blockedId === blockedId);
  }

  async deleteChatForUser(userId: number, chatId: number): Promise<void> {
    const exists = Array.from(this.deletedMap.values()).some((d) => d.userId === userId && d.chatId === chatId);
    if (exists) return;

    const id = this.deletedIdCounter++;
    this.deletedMap.set(id, { id, userId, chatId, deletedAt: new Date() as any } as any);
  }

  async isChatDeletedForUser(userId: number, chatId: number): Promise<boolean> {
    return Array.from(this.deletedMap.values()).some((d) => d.userId === userId && d.chatId === chatId);
  }

  async reactivateChatForUser(userId: number, chatId: number): Promise<void> {
    const found = Array.from(this.deletedMap.entries()).find(([, d]) => d.userId === userId && d.chatId === chatId);
    if (found) this.deletedMap.delete(found[0]);
  }

  async permanentlyDeleteChat(chatId: number): Promise<void> {
    this.chatsMap.delete(chatId);

    for (const [id, m] of Array.from(this.messagesMap.entries())) {
      if (m.chatId === chatId) this.messagesMap.delete(id);
    }
    for (const [id, d] of Array.from(this.deletedMap.entries())) {
      if (d.chatId === chatId) this.deletedMap.delete(id);
    }
  }
}

/**
 * ✅ WICHTIG FÜR RENDER:
 * Export muss exakt so heißen: `export const storage`
 * (sonst kommt: "No matching export ... for import storage")
 */
const hasDb = !!process.env.DATABASE_URL;

export const storage: IStorage = hasDb ? new DatabaseStorage() : new MemStorage();