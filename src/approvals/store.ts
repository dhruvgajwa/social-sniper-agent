/**
 * Approval Store
 *
 * Manages draft approval lifecycle using LibSQL database.
 * Stores drafts pending approval, tracks status, and enables webhook handlers
 * to retrieve and update drafts based on notification IDs.
 */

import { createClient, type Client } from "@libsql/client";
import crypto from "crypto";

export interface DraftApproval {
  id: string;
  notificationId: string; // Unique ID sent in notification for tracking
  platform: "reddit" | "twitter";
  postId: string;
  postUrl: string;
  postAuthor: string;
  postContent: string;
  draftResponse: string;
  recommendedEvents: string[]; // Event names
  status: "pending" | "approved" | "rejected" | "edited";
  createdAt: number;
  updatedAt: number;
  approvedBy?: string; // Username who approved
  editedResponse?: string; // Modified response if edited
}

export class ApprovalStore {
  private client: Client;
  private tableName = "draft_approvals";

  constructor(dbUrl: string = ":memory:") {
    this.client = createClient({ url: dbUrl });
  }

  /**
   * Initialize database table
   */
  async init(): Promise<void> {
    // Create table if not exists
    await this.client.execute(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        notification_id TEXT UNIQUE NOT NULL,
        platform TEXT NOT NULL,
        post_id TEXT NOT NULL,
        post_url TEXT NOT NULL,
        post_author TEXT NOT NULL,
        post_content TEXT NOT NULL,
        draft_response TEXT NOT NULL,
        recommended_events TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        approved_by TEXT,
        edited_response TEXT
      )
    `);

    // Create index on notification_id for fast lookups
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_notification_id
      ON ${this.tableName}(notification_id)
    `);

    // Create index on status for filtering
    await this.client.execute(`
      CREATE INDEX IF NOT EXISTS idx_status
      ON ${this.tableName}(status)
    `);
  }

  /**
   * Save a new draft for approval
   */
  async saveDraft(
    draft: Omit<DraftApproval, "id" | "notificationId" | "createdAt" | "updatedAt">
  ): Promise<DraftApproval> {
    const now = Date.now();

    const draftApproval: DraftApproval = {
      id: crypto.randomUUID(),
      notificationId: crypto.randomBytes(16).toString("hex"), // Unique 32-char hex string
      createdAt: now,
      updatedAt: now,
      ...draft,
    };

    await this.client.execute({
      sql: `
        INSERT INTO ${this.tableName} (
          id, notification_id, platform, post_id, post_url, post_author,
          post_content, draft_response, recommended_events, status,
          created_at, updated_at, approved_by, edited_response
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        draftApproval.id,
        draftApproval.notificationId,
        draftApproval.platform,
        draftApproval.postId,
        draftApproval.postUrl,
        draftApproval.postAuthor,
        draftApproval.postContent,
        draftApproval.draftResponse,
        JSON.stringify(draftApproval.recommendedEvents),
        draftApproval.status,
        draftApproval.createdAt,
        draftApproval.updatedAt,
        draftApproval.approvedBy || null,
        draftApproval.editedResponse || null,
      ],
    });

    return draftApproval;
  }

  /**
   * Get draft by notification ID (used by webhooks)
   */
  async getDraftByNotificationId(notificationId: string): Promise<DraftApproval | null> {
    const result = await this.client.execute({
      sql: `SELECT * FROM ${this.tableName} WHERE notification_id = ?`,
      args: [notificationId],
    });

    if (!result.rows || result.rows.length === 0) {
      return null;
    }

    return this.rowToDraft(result.rows[0]);
  }

  /**
   * Get all pending drafts
   */
  async getPendingDrafts(): Promise<DraftApproval[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM ${this.tableName} WHERE status = ? ORDER BY created_at DESC`,
      args: ["pending"],
    });

    if (!result.rows) {
      return [];
    }

    return result.rows.map((row: any) => this.rowToDraft(row));
  }

  /**
   * Approve a draft
   */
  async approveDraft(notificationId: string, approvedBy: string): Promise<DraftApproval | null> {
    const now = Date.now();

    await this.client.execute({
      sql: `
        UPDATE ${this.tableName}
        SET status = ?, approved_by = ?, updated_at = ?
        WHERE notification_id = ?
      `,
      args: ["approved", approvedBy, now, notificationId],
    });

    return this.getDraftByNotificationId(notificationId);
  }

  /**
   * Reject a draft
   */
  async rejectDraft(notificationId: string, rejectedBy: string): Promise<DraftApproval | null> {
    const now = Date.now();

    await this.client.execute({
      sql: `
        UPDATE ${this.tableName}
        SET status = ?, approved_by = ?, updated_at = ?
        WHERE notification_id = ?
      `,
      args: ["rejected", rejectedBy, now, notificationId],
    });

    return this.getDraftByNotificationId(notificationId);
  }

  /**
   * Edit a draft response
   */
  async editDraft(
    notificationId: string,
    editedResponse: string,
    editedBy: string
  ): Promise<DraftApproval | null> {
    const now = Date.now();

    await this.client.execute({
      sql: `
        UPDATE ${this.tableName}
        SET status = ?, edited_response = ?, approved_by = ?, updated_at = ?
        WHERE notification_id = ?
      `,
      args: ["edited", editedResponse, editedBy, now, notificationId],
    });

    return this.getDraftByNotificationId(notificationId);
  }

  /**
   * Get all approved drafts ready to post
   */
  async getApprovedDrafts(): Promise<DraftApproval[]> {
    const result = await this.client.execute({
      sql: `SELECT * FROM ${this.tableName} WHERE status IN (?, ?) ORDER BY updated_at ASC`,
      args: ["approved", "edited"],
    });

    if (!result.rows) {
      return [];
    }

    return result.rows.map((row: any) => this.rowToDraft(row));
  }

  /**
   * Delete old drafts (cleanup)
   */
  async deleteOldDrafts(olderThanDays: number = 7): Promise<number> {
    const cutoffTime = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;

    const result = await this.client.execute({
      sql: `DELETE FROM ${this.tableName} WHERE created_at < ?`,
      args: [cutoffTime],
    });

    return Number(result.rowsAffected || 0);
  }

  /**
   * Convert database row to DraftApproval object
   */
  private rowToDraft(row: any): DraftApproval {
    return {
      id: String(row.id),
      notificationId: String(row.notification_id),
      platform: String(row.platform) as "reddit" | "twitter",
      postId: String(row.post_id),
      postUrl: String(row.post_url),
      postAuthor: String(row.post_author),
      postContent: String(row.post_content),
      draftResponse: String(row.draft_response),
      recommendedEvents: JSON.parse(String(row.recommended_events)),
      status: String(row.status) as "pending" | "approved" | "rejected" | "edited",
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      approvedBy: row.approved_by ? String(row.approved_by) : undefined,
      editedResponse: row.edited_response ? String(row.edited_response) : undefined,
    };
  }
}
