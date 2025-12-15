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
} from "@shared/schema";

import { db } from "./db";
import {
  eq,
  and,
  or,
  desc,
  asc,
  sql,
  ne,
  isNull,
} from "drizzle-orm";

/* =========================================================
   STORAGE INTERFACE
========================================================= */
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  createMessage(message: InsertMessage & { expiresAt: Date }): Promise<Message>;
  getMessagesByChat(chatId: number): Promise<Message[]>;

  createChat(chat: InsertChat): Promise<Chat>;
  getChatsByUserId(
    userId: number
  ): Promise<Array<Chat & { otherUser: User; lastMessage?: Message; unreadCount: number }>>;

  searchUsers(query: string, excludeId: number): Promise<User[]>;
}

/* =========================================================
   DATABASE STORAGE (Render / Postgres)
========================================================= */
class DatabaseStorage implements IStorage {
  async getUser(id: number) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async createMessage(message: InsertMessage & { expiresAt: Date }) {
    const [msg] = await db.insert(messages).values(message).returning();
    return msg;
  }

  async getMessagesByChat(chatId: number) {
    return db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chatId))
      .orderBy(asc(messages.createdAt));
  }

  async createChat(chat: InsertChat) {
    const [created] = await db.insert(chats).values(chat).returning();
    return created;
  }

  async getChatsByUserId(userId: number) {
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
        and(eq(deletedChats.chatId, chats.id), eq(deletedChats.userId, userId))
      )
      .where(
        and(
          or(eq(chats.participant1Id, userId), eq(chats.participant2Id, userId)),
          isNull(deletedChats.id)
        )
      )
      .orderBy(desc(chats.lastMessageTimestamp));

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

  async searchUsers(query: string, excludeId: number) {
    return db
      .select()
      .from(users)
      .where(
        and(
          sql`${users.username} ILIKE ${"%" + query + "%"}`,
          ne(users.id, excludeId)
        )
      )
      .limit(10);
  }
}

/* =========================================================
   SINGLE EXPORT (WICHTIG)
========================================================= */
export const storage: IStorage = new DatabaseStorage();
