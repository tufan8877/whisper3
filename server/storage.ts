import {
  users,
  messages,
  chats,
  deletedChats,
  type User,
  type InsertUser,
  type Message,
  type InsertMessage,
  type Chat,
  type InsertChat,
} from "@shared/schema";

import { db } from "./db";
import { eq, and, or, desc, asc, sql, ne, isNull } from "drizzle-orm";

/* =========================================================
   STORAGE INTERFACE
========================================================= */
export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Messages
  createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message>;
  getMessagesByChat(chatId: number): Promise<Message[]>;
  deleteExpiredMessages(): Promise<number>;
  markMessageAsRead(messageId: number): Promise<void>;
  markChatAsRead(chatId: number, userId: number): Promise<void>;

  // Chats
  createChat(chat: InsertChat): Promise<Chat>;
  getChatsByUserId(
    userId: number
  ): Promise<
    Array<
      Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }
    >
  >;

  // Search
  searchUsers(query: string, excludeId: number): Promise<User[]>;
}

/* =========================================================
   DATABASE STORAGE (Render / Postgres)
========================================================= */
class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  // Messages
  async createMessage(
    message: InsertMessage & { expiresAt: Date }
  ): Promise<Message> {
    const [msg] = await db.insert(messages).values(message).returning();
    return msg;
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

    // Drizzle liefert je nach Driver unterschiedliche Result-Objekte.
    const result: any = await db
      .delete(messages)
      .where(sql`${messages.expiresAt} < ${now}`);

    return (result?.rowCount ?? result?.changes ?? 0) as number;
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db
      .update(messages)
      .set({ isRead: true })
      .where(eq(messages.id, messageId));
  }

  async markChatAsRead(chatId: number, userId: number): Promise<void> {
    const [chat] = await db.select().from(chats).where(eq(chats.id, chatId));
    if (!chat) return;

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

  // Chats
  async createChat(chat: InsertChat): Promise<Chat> {
    const [created] = await db.insert(chats).values(chat).returning();
    return created;
  }

  async getChatsByUserId(
    userId: number
  ): Promise<
    Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>
  > {
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
          and(
            eq(chats.participant1Id, userId),
            eq(users.id, chats.participant2Id)
          ),
          and(
            eq(chats.participant2Id, userId),
            eq(users.id, chats.participant1Id)
          )
        )
      )
      .leftJoin(messages, eq(messages.id, chats.lastMessageId))
      .leftJoin(
        deletedChats,
        and(eq(deletedChats.chatId, chats.id), eq(deletedChats.userId, userId))
      )
      .where(
        and(
          or(eq(chats.participant1Id, userId), eq(chats.participant2Id, userId)),
          isNull(deletedChats.id)
        )
      )
      .orderBy(desc(chats.lastMessageTimestamp), desc(chats.createdAt));

    return rows.map((r) => ({
      ...r.chat,
      otherUser: r.otherUser!,
      lastMessage: r.lastMessage ?? undefined,
      unreadCount:
        r.chat.participant1Id === userId
          ? r.chat.unreadCount1
          : r.chat.unreadCount2,
    }));
  }

  // Search
  async searchUsers(query: string, excludeId: number): Promise<User[]> {
    const safeExclude = Number.isFinite(excludeId) ? excludeId : 0;

    return await db
      .select()
      .from(users)
      .where(
        and(
          sql`${users.username} ILIKE ${"%" + query + "%"}`,
          ne(users.id, safeExclude)
        )
      )
      .limit(10);
  }
}

/* =========================================================
   SINGLE EXPORT (WICHTIG)
========================================================= */
export const storage: IStorage = new DatabaseStorage();
export default storage;
