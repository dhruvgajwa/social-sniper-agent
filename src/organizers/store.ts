/**
 * Organizer Store
 *
 * Persists scraped organizer records in a LibSQL database.
 * Used by the organizer hunting service to build a contact database
 * for product validation outreach.
 */

import { createClient, type Client } from "@libsql/client";
import crypto from "crypto";

export interface SocialLink {
  platform: string;
  url: string;
}

export type OrganizerPlatform =
  | "eventbrite"
  | "meetup"
  | "luma"
  | "allevents"
  | "boomyshow"
  | "unknown";

export type ContactStatus = "new" | "contacted" | "responded";

export interface OrganizerRecord {
  id: string;
  name: string;
  email?: string;
  website?: string;
  phone?: string;
  description?: string;
  socialLinks: SocialLink[];
  eventUrl: string;
  eventName?: string;
  platform: OrganizerPlatform;
  scrapedAt: number;
  contactStatus: ContactStatus;
  notes?: string;
}

export class OrganizerStore {
  private client: Client;
  private readonly tableName = "organizers";

  constructor(dbUrl: string = "file:./organizers.db") {
    this.client = createClient({ url: dbUrl });
  }

  /**
   * Initialize database schema
   */
  async init(): Promise<void> {
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id               TEXT PRIMARY KEY,
        name             TEXT NOT NULL,
        email            TEXT,
        website          TEXT,
        phone            TEXT,
        description      TEXT,
        social_links     TEXT NOT NULL DEFAULT '[]',
        event_url        TEXT NOT NULL,
        event_name       TEXT,
        platform         TEXT NOT NULL,
        scraped_at       INTEGER NOT NULL,
        contact_status   TEXT NOT NULL DEFAULT 'new',
        notes            TEXT
      )
    `);

    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_organizers_platform
      ON ${this.tableName}(platform)
    `);

    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_organizers_contact_status
      ON ${this.tableName}(contact_status)
    `);

    await this.client.execute(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_organizers_event_url
      ON ${this.tableName}(event_url)
    `);
  }

  /**
   * Upsert an organizer record.
   * If a record with the same event_url already exists, it is updated.
   */
  async upsert(
    data: Omit<OrganizerRecord, "id" | "scrapedAt" | "contactStatus">
  ): Promise<OrganizerRecord> {
    const record: OrganizerRecord = {
      id: crypto.randomUUID(),
      scrapedAt: Date.now(),
      contactStatus: "new",
      ...data,
    };

    await this.client.execute({
      sql: `
        INSERT INTO ${this.tableName}
          (id, name, email, website, phone, description, social_links,
           event_url, event_name, platform, scraped_at, contact_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_url) DO UPDATE SET
          name           = excluded.name,
          email          = COALESCE(excluded.email, ${this.tableName}.email),
          website        = COALESCE(excluded.website, ${this.tableName}.website),
          phone          = COALESCE(excluded.phone, ${this.tableName}.phone),
          description    = COALESCE(excluded.description, ${this.tableName}.description),
          social_links   = excluded.social_links,
          event_name     = COALESCE(excluded.event_name, ${this.tableName}.event_name),
          scraped_at     = excluded.scraped_at
      `,
      args: [
        record.id,
        record.name,
        record.email ?? null,
        record.website ?? null,
        record.phone ?? null,
        record.description ?? null,
        JSON.stringify(record.socialLinks),
        record.eventUrl,
        record.eventName ?? null,
        record.platform,
        record.scrapedAt,
        record.contactStatus,
        record.notes ?? null,
      ],
    });

    // Fetch back the real row (id may differ on conflict path)
    const saved = await this.getByEventUrl(record.eventUrl);
    return saved ?? record;
  }

  /** Retrieve a record by its source event URL */
  async getByEventUrl(eventUrl: string): Promise<OrganizerRecord | null> {
    const result = await this.client.execute({
      sql: `SELECT * FROM ${this.tableName} WHERE event_url = ?`,
      args: [eventUrl],
    });
    if (!result.rows?.length) return null;
    return this.rowToRecord(result.rows[0]);
  }

  /** List all organizers, optionally filtered by platform or contact status */
  async list(filter?: {
    platform?: OrganizerPlatform;
    contactStatus?: ContactStatus;
  }): Promise<OrganizerRecord[]> {
    const conditions: string[] = [];
    const args: (string | number)[] = [];

    if (filter?.platform) {
      conditions.push("platform = ?");
      args.push(filter.platform);
    }
    if (filter?.contactStatus) {
      conditions.push("contact_status = ?");
      args.push(filter.contactStatus);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const result = await this.client.execute({
      sql: `SELECT * FROM ${this.tableName} ${where} ORDER BY scraped_at DESC`,
      args,
    });

    return (result.rows ?? []).map((r) => this.rowToRecord(r));
  }

  /** Update the contact status of an organizer */
  async updateContactStatus(
    id: string,
    status: ContactStatus,
    notes?: string
  ): Promise<void> {
    await this.client.execute({
      sql: `UPDATE ${this.tableName} SET contact_status = ?, notes = ? WHERE id = ?`,
      args: [status, notes ?? null, id],
    });
  }

  /** Total count of scraped organizers */
  async count(): Promise<number> {
    const result = await this.client.execute(
      `SELECT COUNT(*) as cnt FROM ${this.tableName}`
    );
    return Number(result.rows?.[0]?.cnt ?? 0);
  }

  private rowToRecord(row: any): OrganizerRecord {
    return {
      id: String(row.id),
      name: String(row.name),
      email: row.email ? String(row.email) : undefined,
      website: row.website ? String(row.website) : undefined,
      phone: row.phone ? String(row.phone) : undefined,
      description: row.description ? String(row.description) : undefined,
      socialLinks: JSON.parse(String(row.social_links ?? "[]")),
      eventUrl: String(row.event_url),
      eventName: row.event_name ? String(row.event_name) : undefined,
      platform: String(row.platform) as OrganizerPlatform,
      scrapedAt: Number(row.scraped_at),
      contactStatus: String(row.contact_status) as ContactStatus,
      notes: row.notes ? String(row.notes) : undefined,
    };
  }
}
