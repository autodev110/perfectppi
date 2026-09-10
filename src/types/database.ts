// ============================================================================
// Supabase generated types
// Regenerate after every migration:
//   supabase gen types typescript --local --schema public > src/types/database.ts
// Do not edit by hand.
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at: string
          id: string
          metadata: Json
          target_id: string
          target_type: string
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id: string
          target_type: string
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_acceptances: {
        Row: {
          accepted_at: string
          document_hash: string
          document_type: string
          document_version: string
          evidence: Json
          id: string
          profile_id: string
          source: string
        }
        Insert: {
          accepted_at?: string
          document_hash: string
          document_type: string
          document_version: string
          evidence?: Json
          id?: string
          profile_id: string
          source: string
        }
        Update: {
          accepted_at?: string
          document_hash?: string
          document_type?: string
          document_version?: string
          evidence?: Json
          id?: string
          profile_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_acceptances_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      privacy_requests: {
        Row: {
          account_deleted_at: string | null
          acknowledged_at: string | null
          auth_user_id: string | null
          completed_at: string | null
          details: string | null
          id: string
          last_error: string | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          next_attempt_at: string
          processing_attempts: number
          profile_id: string | null
          request_type: string
          result_metadata: Json
          resolution_summary: string | null
          retention_expires_at: string | null
          source: string
          status: string
          subject_reference_hash: string
          submitted_at: string
          updated_at: string
        }
        Insert: {
          account_deleted_at?: string | null
          acknowledged_at?: string | null
          auth_user_id?: string | null
          completed_at?: string | null
          details?: string | null
          id?: string
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          processing_attempts?: number
          profile_id?: string | null
          request_type: string
          result_metadata?: Json
          resolution_summary?: string | null
          retention_expires_at?: string | null
          source: string
          status?: string
          subject_reference_hash: string
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          account_deleted_at?: string | null
          acknowledged_at?: string | null
          auth_user_id?: string | null
          completed_at?: string | null
          details?: string | null
          id?: string
          last_error?: string | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          next_attempt_at?: string
          processing_attempts?: number
          profile_id?: string | null
          request_type?: string
          result_metadata?: Json
          resolution_summary?: string | null
          retention_expires_at?: string | null
          source?: string
          status?: string
          subject_reference_hash?: string
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "privacy_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          active_revision_id: string
          author_id: string
          content: string
          created_at: string
          id: string
          moderation_checked_at: string | null
          moderation_reason: string | null
          moderation_status: string
          moderation_version: string | null
          post_id: string
          status: Database["public"]["Enums"]["community_content_status"]
          updated_at: string
        }
        Insert: {
          active_revision_id?: string
          author_id: string
          content: string
          created_at?: string
          id?: string
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          post_id: string
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
        }
        Update: {
          active_revision_id?: string
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          post_id?: string
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comment_revisions: {
        Row: {
          author_id: string | null
          comment_id: string
          content: string
          created_at: string
          id: string
          revision_number: number
        }
        Insert: {
          author_id?: string | null
          comment_id: string
          content: string
          created_at?: string
          id: string
          revision_number: number
        }
        Update: {
          author_id?: string | null
          comment_id?: string
          content?: string
          created_at?: string
          id?: string
          revision_number?: number
        }
        Relationships: []
      }
      community_posts: {
        Row: {
          active_revision_id: string
          audience: Database["public"]["Enums"]["community_post_audience"]
          author_id: string
          content: string
          created_at: string
          id: string
          marketplace_listing_id: string | null
          moderation_checked_at: string | null
          moderation_reason: string | null
          moderation_status: string
          moderation_version: string | null
          status: Database["public"]["Enums"]["community_content_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          active_revision_id?: string
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id: string
          content: string
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          active_revision_id?: string
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_revisions: {
        Row: {
          audience: Database["public"]["Enums"]["community_post_audience"]
          author_id: string | null
          content: string
          created_at: string
          id: string
          marketplace_listing_id: string | null
          post_id: string
          revision_number: number
          vehicle_id: string | null
        }
        Insert: {
          audience: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string | null
          content: string
          created_at?: string
          id: string
          marketplace_listing_id?: string | null
          post_id: string
          revision_number: number
          vehicle_id?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
          post_id?: string
          revision_number?: number
          vehicle_id?: string | null
        }
        Relationships: []
      }
      community_post_media: {
        Row: {
          content_type: string
          created_at: string
          id: string
          media_type: Database["public"]["Enums"]["community_media_type"]
          moderation_checked_at: string | null
          moderation_reason: string | null
          moderation_status: string
          moderation_version: string | null
          post_id: string
          sort_order: number
          uploader_id: string
          url: string
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          media_type: Database["public"]["Enums"]["community_media_type"]
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          post_id: string
          sort_order: number
          uploader_id: string
          url: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          media_type?: Database["public"]["Enums"]["community_media_type"]
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          post_id?: string
          sort_order?: number
          uploader_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_media_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_media_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_upload_reservations: {
        Row: {
          attached_at: string | null
          content_type: string
          created_at: string
          expected_size: number
          expires_at: string
          id: string
          post_id: string | null
          profile_id: string | null
          status: string
          storage_reference: string
          vehicle_id: string | null
        }
        Insert: {
          attached_at?: string | null
          content_type: string
          created_at?: string
          expected_size: number
          expires_at?: string
          id?: string
          post_id?: string | null
          profile_id?: string | null
          status?: string
          storage_reference: string
          vehicle_id?: string | null
        }
        Update: {
          attached_at?: string | null
          content_type?: string
          created_at?: string
          expected_size?: number
          expires_at?: string
          id?: string
          post_id?: string | null
          profile_id?: string | null
          status?: string
          storage_reference?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_upload_reservations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_upload_reservations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_upload_reservations_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_appeals: {
        Row: {
          appellant_id: string | null
          case_id: string | null
          created_at: string
          id: string
          moderation_item_id: string
          revision_id: string | null
          resolution_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          statement: string
          status: string
        }
        Insert: {
          appellant_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          moderation_item_id: string
          revision_id?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement: string
          status?: string
        }
        Update: {
          appellant_id?: string | null
          case_id?: string | null
          created_at?: string
          id?: string
          moderation_item_id?: string
          revision_id?: string | null
          resolution_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          statement?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_appeals_appellant_id_fkey"
            columns: ["appellant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_moderation_item_id_fkey"
            columns: ["moderation_item_id"]
            isOneToOne: false
            referencedRelation: "moderation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_appeals_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          case_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          moderation_item_id: string
          next_status: string
          notes: string | null
          previous_status: string | null
          revision_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type: string
          case_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          moderation_item_id: string
          next_status: string
          notes?: string | null
          previous_status?: string | null
          revision_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          case_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          moderation_item_id?: string
          next_status?: string
          notes?: string | null
          previous_status?: string | null
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_events_moderation_item_id_fkey"
            columns: ["moderation_item_id"]
            isOneToOne: false
            referencedRelation: "moderation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_hashes: {
        Row: {
          created_at: string
          duration_seconds: number | null
          entity_id: string
          entity_type: string
          file_size: number
          height: number | null
          id: string
          mime_type: string
          perceptual_hash: string | null
          scan_status: string
          sha256: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number | null
          entity_id: string
          entity_type: string
          file_size: number
          height?: number | null
          id?: string
          mime_type: string
          perceptual_hash?: string | null
          scan_status: string
          sha256: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number | null
          entity_id?: string
          entity_type?: string
          file_size?: number
          height?: number | null
          id?: string
          mime_type?: string
          perceptual_hash?: string | null
          scan_status?: string
          sha256?: string
          width?: number | null
        }
        Relationships: []
      }
      moderation_cases: {
        Row: {
          assigned_moderator_id: string | null
          claim_expires_at: string | null
          claimed_at: string | null
          closed_at: string | null
          created_at: string
          decision_version: number
          disposition_state: string
          entity_id: string
          entity_type: string
          first_reported_at: string | null
          id: string
          last_reported_at: string | null
          legal_hold: boolean
          moderation_item_id: string
          priority: string
          resolution: string | null
          retention_basis: string
          retention_expires_at: string | null
          revision_id: string
          sla_due_at: string
          state: string
          updated_at: string
        }
        Insert: {
          assigned_moderator_id?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          decision_version?: number
          disposition_state?: string
          entity_id: string
          entity_type: string
          first_reported_at?: string | null
          id?: string
          last_reported_at?: string | null
          legal_hold?: boolean
          moderation_item_id: string
          priority?: string
          resolution?: string | null
          retention_basis?: string
          retention_expires_at?: string | null
          revision_id: string
          sla_due_at: string
          state: string
          updated_at?: string
        }
        Update: {
          assigned_moderator_id?: string | null
          claim_expires_at?: string | null
          claimed_at?: string | null
          closed_at?: string | null
          created_at?: string
          decision_version?: number
          disposition_state?: string
          entity_id?: string
          entity_type?: string
          first_reported_at?: string | null
          id?: string
          last_reported_at?: string | null
          legal_hold?: boolean
          moderation_item_id?: string
          priority?: string
          resolution?: string | null
          retention_basis?: string
          retention_expires_at?: string | null
          revision_id?: string
          sla_due_at?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      moderation_evidence: {
        Row: {
          captured_at: string
          case_id: string
          content_sha256: string
          content_snapshot: Json
          id: string
          media_references: Json
          revision_id: string
        }
        Insert: {
          captured_at?: string
          case_id: string
          content_sha256: string
          content_snapshot: Json
          id?: string
          media_references?: Json
          revision_id: string
        }
        Update: {
          captured_at?: string
          case_id?: string
          content_sha256?: string
          content_snapshot?: Json
          id?: string
          media_references?: Json
          revision_id?: string
        }
        Relationships: []
      }
      moderation_items: {
        Row: {
          author_id: string | null
          content_preview: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: string
          evidence_reference: string | null
          entity_id: string
          entity_type: string
          id: string
          model_name: string | null
          model_provider: string
          model_version: string
          raw_result: Json
          reason_codes: string[]
          report_count: number
          risk_level: string
          status: string
          updated_at: string
        }
        Insert: {
          author_id: string | null
          content_preview?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision: string
          evidence_reference?: string | null
          entity_id: string
          entity_type: string
          id?: string
          model_name?: string | null
          model_provider: string
          model_version: string
          raw_result?: Json
          reason_codes?: string[]
          report_count?: number
          risk_level: string
          status: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content_preview?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: string
          evidence_reference?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          model_name?: string | null
          model_provider?: string
          model_version?: string
          raw_result?: Json
          reason_codes?: string[]
          report_count?: number
          risk_level?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_items_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_items_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_legal_hold_reviewers: {
        Row: {
          created_at: string
          granted_by: string | null
          profile_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          profile_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_legal_hold_reviewers_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_legal_hold_reviewers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_outbox: {
        Row: {
          attempt_count: number
          case_id: string
          completed_at: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          status: string
        }
        Insert: {
          attempt_count?: number
          case_id: string
          completed_at?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
        }
        Update: {
          attempt_count?: number
          case_id?: string
          completed_at?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          status?: string
        }
        Relationships: []
      }
      moderation_reports: {
        Row: {
          case_id: string
          created_at: string
          details: string | null
          entity_id: string
          entity_type: string
          id: string
          idempotency_key: string
          reason_code: string
          reporter_id: string | null
          revision_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          details?: string | null
          entity_id: string
          entity_type: string
          id?: string
          idempotency_key: string
          reason_code: string
          reporter_id?: string | null
          revision_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          details?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          idempotency_key?: string
          reason_code?: string
          reporter_id?: string | null
          revision_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      storage_cleanup_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          next_attempt_at: string
          reason: string
          status: string
          storage_reference: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          reason: string
          status?: string
          storage_reference: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          reason?: string
          status?: string
          storage_reference?: string
        }
        Relationships: []
      }
      user_enforcement_actions: {
        Row: {
          action_type: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          profile_id: string
          reason_code: string
          related_moderation_item_id: string | null
          starts_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          profile_id: string
          reason_code: string
          related_moderation_item_id?: string | null
          starts_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          profile_id?: string
          reason_code?: string
          related_moderation_item_id?: string | null
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_enforcement_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_enforcement_actions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_enforcement_actions_related_moderation_item_id_fkey"
            columns: ["related_moderation_item_id"]
            isOneToOne: false
            referencedRelation: "moderation_items"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          created_at: string
          document_url: string | null
          docuseal_id: string | null
          docuseal_submitter_slug: string | null
          id: string
          presented_at: string
          signed_at: string | null
          signer_id: string
          warranty_order_id: string
        }
        Insert: {
          created_at?: string
          document_url?: string | null
          docuseal_id?: string | null
          docuseal_submitter_slug?: string | null
          id?: string
          presented_at?: string
          signed_at?: string | null
          signer_id: string
          warranty_order_id: string
        }
        Update: {
          created_at?: string
          document_url?: string | null
          docuseal_id?: string | null
          docuseal_submitter_slug?: string | null
          id?: string
          presented_at?: string
          signed_at?: string | null
          signer_id?: string
          warranty_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_signer_id_fkey"
            columns: ["signer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_warranty_order_id_fkey"
            columns: ["warranty_order_id"]
            isOneToOne: true
            referencedRelation: "warranty_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          profile_id: string
        }
        Insert: {
          conversation_id: string
          profile_id: string
        }
        Update: {
          conversation_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          id: string
          marketplace_listing_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      device_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          env: Database["public"]["Enums"]["device_env"]
          id: string
          last_seen_at: string
          platform: Database["public"]["Enums"]["device_platform"]
          profile_id: string
          token: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          env?: Database["public"]["Enums"]["device_env"]
          id?: string
          last_seen_at?: string
          platform: Database["public"]["Enums"]["device_platform"]
          profile_id: string
          token: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          env?: Database["public"]["Enums"]["device_env"]
          id?: string
          last_seen_at?: string
          platform?: Database["public"]["Enums"]["device_platform"]
          profile_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      external_inspection_refs: {
        Row: {
          created_at: string
          current_submission_id: string | null
          delivered_output_version: number | null
          delivered_submission_id: string | null
          delivery_status: string
          delivery_version: number
          external_actor_id: string | null
          external_inspection_phase_id: string | null
          external_organization_id: string
          external_recon_case_id: string | null
          external_vehicle_id: string | null
          id: string
          idempotency_key: string
          integration_status: string
          last_delivered_at: string | null
          last_delivery_requested_at: string | null
          last_error: Json | null
          partner_connection_id: string
          ppi_request_id: string
          request_fingerprint: string
          source_label: string | null
          source_system: string
          updated_at: string
          vehicle_snapshot: Json
        }
        Insert: {
          created_at?: string
          current_submission_id?: string | null
          delivered_output_version?: number | null
          delivered_submission_id?: string | null
          delivery_status?: string
          delivery_version?: number
          external_actor_id?: string | null
          external_inspection_phase_id?: string | null
          external_organization_id: string
          external_recon_case_id?: string | null
          external_vehicle_id?: string | null
          id?: string
          idempotency_key: string
          integration_status?: string
          last_delivered_at?: string | null
          last_delivery_requested_at?: string | null
          last_error?: Json | null
          partner_connection_id: string
          ppi_request_id: string
          request_fingerprint: string
          source_label?: string | null
          source_system?: string
          updated_at?: string
          vehicle_snapshot: Json
        }
        Update: {
          created_at?: string
          current_submission_id?: string | null
          delivered_output_version?: number | null
          delivered_submission_id?: string | null
          delivery_status?: string
          delivery_version?: number
          external_actor_id?: string | null
          external_inspection_phase_id?: string | null
          external_organization_id?: string
          external_recon_case_id?: string | null
          external_vehicle_id?: string | null
          id?: string
          idempotency_key?: string
          integration_status?: string
          last_delivered_at?: string | null
          last_delivery_requested_at?: string | null
          last_error?: Json | null
          partner_connection_id?: string
          ppi_request_id?: string
          request_fingerprint?: string
          source_label?: string | null
          source_system?: string
          updated_at?: string
          vehicle_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "external_inspection_refs_current_submission_id_fkey"
            columns: ["current_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_inspection_refs_delivered_submission_id_fkey"
            columns: ["delivered_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_inspection_refs_partner_connection_id_fkey"
            columns: ["partner_connection_id"]
            isOneToOne: false
            referencedRelation: "partner_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_inspection_refs_ppi_request_id_fkey"
            columns: ["ppi_request_id"]
            isOneToOne: true
            referencedRelation: "ppi_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_artifacts: {
        Row: {
          artifact_type: string
          content_type: string
          created_at: string
          external_inspection_ref_id: string | null
          generated_at: string
          id: string
          output_version: number
          ppi_submission_id: string
          sha256: string
          size_bytes: number
          storage_key: string
        }
        Insert: {
          artifact_type: string
          content_type: string
          created_at?: string
          external_inspection_ref_id?: string | null
          generated_at?: string
          id?: string
          output_version: number
          ppi_submission_id: string
          sha256: string
          size_bytes: number
          storage_key: string
        }
        Update: {
          artifact_type?: string
          content_type?: string
          created_at?: string
          external_inspection_ref_id?: string | null
          generated_at?: string
          id?: string
          output_version?: number
          ppi_submission_id?: string
          sha256?: string
          size_bytes?: number
          storage_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_artifacts_external_inspection_ref_id_fkey"
            columns: ["external_inspection_ref_id"]
            isOneToOne: false
            referencedRelation: "external_inspection_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_artifacts_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          asking_price_cents: number
          created_at: string
          description: string | null
          id: string
          location: string | null
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          asking_price_cents: number
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          asking_price_cents?: number
          created_at?: string
          description?: string | null
          id?: string
          location?: string | null
          seller_id?: string
          status?: Database["public"]["Enums"]["listing_status"]
          title?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      media_packages: {
        Row: {
          created_at: string
          creator_id: string
          description: string | null
          id: string
          items: Json
          ppi_submission_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          description?: string | null
          id?: string
          items?: Json
          ppi_submission_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          description?: string | null
          id?: string
          items?: Json
          ppi_submission_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_packages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_packages_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          content: string
          conversation_id: string
          created_at: string
          has_attachment: boolean
          id: string
          sender_id: string
          status: Database["public"]["Enums"]["message_status"]
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          conversation_id: string
          created_at?: string
          has_attachment?: boolean
          id?: string
          sender_id: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          has_attachment?: boolean
          id?: string
          sender_id?: string
          status?: Database["public"]["Enums"]["message_status"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      obd_snapshots: {
        Row: {
          adapter_name: string | null
          captured_by: string
          completed_at: string | null
          created_at: string
          id: string
          incomplete_monitor_count: number
          is_current: boolean
          live_readings: Json
          mil_on: boolean | null
          monitor_status: Json | null
          pending_dtcs: string[]
          permanent_dtcs: string[]
          ppi_submission_id: string
          raw_payload: Json
          raw_permanent_dtcs_response: string | null
          raw_transcript: Json
          readiness_monitors: Json
          started_at: string | null
          stored_dtc_count: number | null
          stored_dtcs: string[]
          supported_pids: string[]
          vin: string | null
        }
        Insert: {
          adapter_name?: string | null
          captured_by: string
          completed_at?: string | null
          created_at?: string
          id?: string
          incomplete_monitor_count?: number
          is_current?: boolean
          live_readings?: Json
          mil_on?: boolean | null
          monitor_status?: Json | null
          pending_dtcs?: string[]
          permanent_dtcs?: string[]
          ppi_submission_id: string
          raw_payload: Json
          raw_permanent_dtcs_response?: string | null
          raw_transcript?: Json
          readiness_monitors?: Json
          started_at?: string | null
          stored_dtc_count?: number | null
          stored_dtcs?: string[]
          supported_pids?: string[]
          vin?: string | null
        }
        Update: {
          adapter_name?: string | null
          captured_by?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          incomplete_monitor_count?: number
          is_current?: boolean
          live_readings?: Json
          mil_on?: boolean | null
          monitor_status?: Json | null
          pending_dtcs?: string[]
          permanent_dtcs?: string[]
          ppi_submission_id?: string
          raw_payload?: Json
          raw_permanent_dtcs_response?: string | null
          raw_transcript?: Json
          readiness_monitors?: Json
          started_at?: string | null
          stored_dtc_count?: number | null
          stored_dtcs?: string[]
          supported_pids?: string[]
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "obd_snapshots_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obd_snapshots_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          id: string
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["org_member_role"]
          technician_profile_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          organization_id: string
          role?: Database["public"]["Enums"]["org_member_role"]
          technician_profile_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["org_member_role"]
          technician_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_technician_profile_id_fkey"
            columns: ["technician_profile_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      outbound_events: {
        Row: {
          attempt_count: number
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          event_type: string
          external_inspection_ref_id: string | null
          id: string
          last_error: Json | null
          last_response_status: number | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          partner_connection_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          dedupe_key: string
          delivered_at?: string | null
          event_type: string
          external_inspection_ref_id?: string | null
          id?: string
          last_error?: Json | null
          last_response_status?: number | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          partner_connection_id: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          dedupe_key?: string
          delivered_at?: string | null
          event_type?: string
          external_inspection_ref_id?: string | null
          id?: string
          last_error?: Json | null
          last_response_status?: number | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          partner_connection_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_events_external_inspection_ref_id_fkey"
            columns: ["external_inspection_ref_id"]
            isOneToOne: false
            referencedRelation: "external_inspection_refs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_events_partner_connection_id_fkey"
            columns: ["partner_connection_id"]
            isOneToOne: false
            referencedRelation: "partner_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      output_generation_jobs: {
        Row: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: Json | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          output_version: number
          ppi_submission_id: string
          requested_by: string | null
          started_at: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: Json | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          output_version: number
          ppi_submission_id: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: Json | null
          lock_expires_at?: string | null
          locked_at?: string | null
          locked_by?: string | null
          max_attempts?: number
          next_attempt_at?: string
          output_version?: number
          ppi_submission_id?: string
          requested_by?: string | null
          started_at?: string | null
          status?: string
          trigger_reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "output_generation_jobs_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "output_generation_jobs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_connections: {
        Row: {
          connected_at: string
          connected_by: string | null
          created_at: string
          credentials_rotated_at: string | null
          display_name: string | null
          external_organization_id: string
          id: string
          installation_code_id: string | null
          last_used_at: string | null
          last_verified_at: string | null
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          source_system: string
          status: string
          token_hash: string
          token_last_four: string
          token_prefix: string
          updated_at: string
          user_link_redirect_uri: string | null
          webhook_secret_ciphertext: string
          webhook_secret_key_version: number
          webhook_url: string | null
        }
        Insert: {
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          credentials_rotated_at?: string | null
          display_name?: string | null
          external_organization_id: string
          id?: string
          installation_code_id?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes: string[]
          source_system?: string
          status?: string
          token_hash: string
          token_last_four: string
          token_prefix: string
          updated_at?: string
          user_link_redirect_uri?: string | null
          webhook_secret_ciphertext: string
          webhook_secret_key_version?: number
          webhook_url?: string | null
        }
        Update: {
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          credentials_rotated_at?: string | null
          display_name?: string | null
          external_organization_id?: string
          id?: string
          installation_code_id?: string | null
          last_used_at?: string | null
          last_verified_at?: string | null
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          source_system?: string
          status?: string
          token_hash?: string
          token_last_four?: string
          token_prefix?: string
          updated_at?: string
          user_link_redirect_uri?: string | null
          webhook_secret_ciphertext?: string
          webhook_secret_key_version?: number
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_connections_installation_code_id_fkey"
            columns: ["installation_code_id"]
            isOneToOne: false
            referencedRelation: "partner_installation_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_connections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_connections_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_installation_codes: {
        Row: {
          code_hash: string
          code_prefix: string
          consumed_at: string | null
          consumed_connection_id: string | null
          created_at: string
          created_by: string
          expires_at: string
          id: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
          scopes: string[]
          source_system: string
          status: string
          updated_at: string
        }
        Insert: {
          code_hash: string
          code_prefix: string
          consumed_at?: string | null
          consumed_connection_id?: string | null
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          source_system?: string
          status?: string
          updated_at?: string
        }
        Update: {
          code_hash?: string
          code_prefix?: string
          consumed_at?: string | null
          consumed_connection_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scopes?: string[]
          source_system?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_installation_codes_consumed_connection_id_fkey"
            columns: ["consumed_connection_id"]
            isOneToOne: false
            referencedRelation: "partner_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_installation_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_installation_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_installation_codes_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_rate_limit_buckets: {
        Row: {
          bucket_key: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          request_count?: number
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      partner_user_link_transactions: {
        Row: {
          authorization_code_hash: string | null
          authorized_at: string | null
          authorized_profile_id: string | null
          code_expires_at: string | null
          consumed_at: string | null
          created_at: string
          expires_at: string
          external_user_id: string
          id: string
          partner_connection_id: string
          redirect_uri: string
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          authorization_code_hash?: string | null
          authorized_at?: string | null
          authorized_profile_id?: string | null
          code_expires_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          external_user_id: string
          id?: string
          partner_connection_id: string
          redirect_uri: string
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          authorization_code_hash?: string | null
          authorized_at?: string | null
          authorized_profile_id?: string | null
          code_expires_at?: string | null
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          external_user_id?: string
          id?: string
          partner_connection_id?: string
          redirect_uri?: string
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_user_link_transactions_authorized_profile_id_fkey"
            columns: ["authorized_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_user_link_transactions_partner_connection_id_fkey"
            columns: ["partner_connection_id"]
            isOneToOne: false
            referencedRelation: "partner_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_user_links: {
        Row: {
          created_at: string
          external_user_id: string
          id: string
          last_verified_at: string | null
          linked_at: string
          partner_connection_id: string
          profile_id: string
          revoked_at: string | null
          revoked_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          external_user_id: string
          id?: string
          last_verified_at?: string | null
          linked_at?: string
          partner_connection_id: string
          profile_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          external_user_id?: string
          id?: string
          last_verified_at?: string | null
          linked_at?: string
          partner_connection_id?: string
          profile_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_user_links_partner_connection_id_fkey"
            columns: ["partner_connection_id"]
            isOneToOne: false
            referencedRelation: "partner_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_user_links_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_user_links_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          contract_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          receipt_url: string | null
          status: Database["public"]["Enums"]["payment_status"]
          stripe_payment_id: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          contract_id: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_id?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          contract_id?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          receipt_url?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          stripe_payment_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: true
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ppi_answers: {
        Row: {
          answer_type: Database["public"]["Enums"]["answer_type"]
          answer_value: string | null
          created_at: string
          deferred_at: string | null
          id: string
          is_required: boolean
          options: Json | null
          photo_prompt: string | null
          ppi_section_id: string
          prompt: string
          requires_photo: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer_type?: Database["public"]["Enums"]["answer_type"]
          answer_value?: string | null
          created_at?: string
          deferred_at?: string | null
          id?: string
          is_required?: boolean
          options?: Json | null
          photo_prompt?: string | null
          ppi_section_id: string
          prompt: string
          requires_photo?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer_type?: Database["public"]["Enums"]["answer_type"]
          answer_value?: string | null
          created_at?: string
          deferred_at?: string | null
          id?: string
          is_required?: boolean
          options?: Json | null
          photo_prompt?: string | null
          ppi_section_id?: string
          prompt?: string
          requires_photo?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppi_answers_ppi_section_id_fkey"
            columns: ["ppi_section_id"]
            isOneToOne: false
            referencedRelation: "ppi_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      ppi_media: {
        Row: {
          caption: string | null
          captured_at: string | null
          id: string
          media_type: string
          metadata: Json | null
          ppi_answer_id: string | null
          ppi_section_id: string
          uploaded_at: string
          url: string
        }
        Insert: {
          caption?: string | null
          captured_at?: string | null
          id?: string
          media_type: string
          metadata?: Json | null
          ppi_answer_id?: string | null
          ppi_section_id: string
          uploaded_at?: string
          url: string
        }
        Update: {
          caption?: string | null
          captured_at?: string | null
          id?: string
          media_type?: string
          metadata?: Json | null
          ppi_answer_id?: string | null
          ppi_section_id?: string
          uploaded_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppi_media_ppi_answer_id_fkey"
            columns: ["ppi_answer_id"]
            isOneToOne: false
            referencedRelation: "ppi_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppi_media_ppi_section_id_fkey"
            columns: ["ppi_section_id"]
            isOneToOne: false
            referencedRelation: "ppi_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      ppi_requests: {
        Row: {
          assigned_tech_id: string | null
          created_at: string
          id: string
          inspection_scope: Database["public"]["Enums"]["inspection_scope"]
          performer_type: Database["public"]["Enums"]["performer_type"]
          ppi_type: Database["public"]["Enums"]["ppi_type"]
          requester_id: string | null
          requester_role: Database["public"]["Enums"]["requester_role"]
          requesting_organization_id: string | null
          source_system: string
          status: Database["public"]["Enums"]["ppi_request_status"]
          updated_at: string
          vehicle_id: string
          whose_car: Database["public"]["Enums"]["whose_car"]
        }
        Insert: {
          assigned_tech_id?: string | null
          created_at?: string
          id?: string
          inspection_scope?: Database["public"]["Enums"]["inspection_scope"]
          performer_type: Database["public"]["Enums"]["performer_type"]
          ppi_type?: Database["public"]["Enums"]["ppi_type"]
          requester_id?: string | null
          requester_role: Database["public"]["Enums"]["requester_role"]
          requesting_organization_id?: string | null
          source_system?: string
          status?: Database["public"]["Enums"]["ppi_request_status"]
          updated_at?: string
          vehicle_id: string
          whose_car: Database["public"]["Enums"]["whose_car"]
        }
        Update: {
          assigned_tech_id?: string | null
          created_at?: string
          id?: string
          inspection_scope?: Database["public"]["Enums"]["inspection_scope"]
          performer_type?: Database["public"]["Enums"]["performer_type"]
          ppi_type?: Database["public"]["Enums"]["ppi_type"]
          requester_id?: string | null
          requester_role?: Database["public"]["Enums"]["requester_role"]
          requesting_organization_id?: string | null
          source_system?: string
          status?: Database["public"]["Enums"]["ppi_request_status"]
          updated_at?: string
          vehicle_id?: string
          whose_car?: Database["public"]["Enums"]["whose_car"]
        }
        Relationships: [
          {
            foreignKeyName: "ppi_requests_assigned_tech_id_fkey"
            columns: ["assigned_tech_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppi_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppi_requests_requesting_organization_id_fkey"
            columns: ["requesting_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppi_requests_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      ppi_sections: {
        Row: {
          completion_state: Database["public"]["Enums"]["completion_state"]
          created_at: string
          id: string
          notes: string | null
          ppi_submission_id: string
          section_type: Database["public"]["Enums"]["section_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          completion_state?: Database["public"]["Enums"]["completion_state"]
          created_at?: string
          id?: string
          notes?: string | null
          ppi_submission_id: string
          section_type: Database["public"]["Enums"]["section_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          completion_state?: Database["public"]["Enums"]["completion_state"]
          created_at?: string
          id?: string
          notes?: string | null
          ppi_submission_id?: string
          section_type?: Database["public"]["Enums"]["section_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppi_sections_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      ppi_submissions: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          is_current: boolean
          performer_id: string
          ppi_request_id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_at: string | null
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          performer_id: string
          ppi_request_id: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          is_current?: boolean
          performer_id?: string
          ppi_request_id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ppi_submissions_performer_id_fkey"
            columns: ["performer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppi_submissions_ppi_request_id_fkey"
            columns: ["ppi_request_id"]
            isOneToOne: false
            referencedRelation: "ppi_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_relationships: {
        Row: {
          created_at: string
          profile_high_id: string
          profile_low_id: string
          requested_by: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          profile_high_id: string
          profile_low_id: string
          requested_by: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          profile_high_id?: string
          profile_low_id?: string
          requested_by?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profile_blocks: {
        Row: { blocked_id: string; blocker_id: string; created_at: string }
        Insert: { blocked_id: string; blocker_id: string; created_at?: string }
        Update: { blocked_id?: string; blocker_id?: string; created_at?: string }
        Relationships: []
      }
      profile_mutes: {
        Row: {
          created_at: string
          mute_notifications: boolean
          muted_id: string
          muter_id: string
        }
        Insert: {
          created_at?: string
          mute_notifications?: boolean
          muted_id: string
          muter_id: string
        }
        Update: {
          created_at?: string
          mute_notifications?: boolean
          muted_id?: string
          muter_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          allow_exact_username_lookup: boolean
          auth_user_id: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_post_audience: Database["public"]["Enums"]["community_post_audience"]
          display_name: string | null
          discoverable: boolean
          id: string
          is_developer: boolean
          is_public: boolean
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_normalized: string | null
          username_state: string
        }
        Insert: {
          allow_exact_username_lookup?: boolean
          auth_user_id: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_post_audience?: Database["public"]["Enums"]["community_post_audience"]
          display_name?: string | null
          discoverable?: boolean
          id?: string
          is_developer?: boolean
          is_public?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
          username_normalized?: string | null
          username_state?: string
        }
        Update: {
          allow_exact_username_lookup?: boolean
          auth_user_id?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_post_audience?: Database["public"]["Enums"]["community_post_audience"]
          display_name?: string | null
          discoverable?: boolean
          id?: string
          is_developer?: boolean
          is_public?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
          username_normalized?: string | null
          username_state?: string
        }
        Relationships: []
      }
      username_correction_events: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          new_username: string
          previous_username: string
          profile_id: string | null
          reason: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_username: string
          previous_username: string
          profile_id?: string | null
          reason: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          new_username?: string
          previous_username?: string
          profile_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "username_correction_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "username_correction_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      username_reservations: {
        Row: {
          created_at: string
          display_username: string
          normalized_username: string
          profile_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          display_username: string
          normalized_username: string
          profile_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          display_username?: string
          normalized_username?: string
          profile_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "username_reservations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          media_package_id: string | null
          ppi_submission_id: string | null
          standardized_output_id: string | null
          target_type: Database["public"]["Enums"]["share_target_type"]
          token: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          media_package_id?: string | null
          ppi_submission_id?: string | null
          standardized_output_id?: string | null
          target_type: Database["public"]["Enums"]["share_target_type"]
          token?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          media_package_id?: string | null
          ppi_submission_id?: string | null
          standardized_output_id?: string | null
          target_type?: Database["public"]["Enums"]["share_target_type"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_media_package_id_fkey"
            columns: ["media_package_id"]
            isOneToOne: false
            referencedRelation: "media_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "share_links_standardized_output_id_fkey"
            columns: ["standardized_output_id"]
            isOneToOne: false
            referencedRelation: "standardized_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      standardized_outputs: {
        Row: {
          document_url: string | null
          generated_at: string
          id: string
          ppi_submission_id: string
          structured_content: Json
          version: number
        }
        Insert: {
          document_url?: string | null
          generated_at?: string
          id?: string
          ppi_submission_id: string
          structured_content?: Json
          version?: number
        }
        Update: {
          document_url?: string | null
          generated_at?: string
          id?: string
          ppi_submission_id?: string
          structured_content?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "standardized_outputs_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_profiles: {
        Row: {
          avg_rating: number
          certification_level: Database["public"]["Enums"]["certification_level"]
          created_at: string
          id: string
          is_available: boolean
          is_featured: boolean
          is_independent: boolean
          is_verified: boolean
          organization_id: string | null
          profile_id: string
          reputation_score: number
          service_area: string | null
          specialties: string[] | null
          total_inspections: number
          total_reviews: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number
          certification_level?: Database["public"]["Enums"]["certification_level"]
          created_at?: string
          id?: string
          is_available?: boolean
          is_featured?: boolean
          is_independent?: boolean
          is_verified?: boolean
          organization_id?: string | null
          profile_id: string
          reputation_score?: number
          service_area?: string | null
          specialties?: string[] | null
          total_inspections?: number
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number
          certification_level?: Database["public"]["Enums"]["certification_level"]
          created_at?: string
          id?: string
          is_available?: boolean
          is_featured?: boolean
          is_independent?: boolean
          is_verified?: boolean
          organization_id?: string | null
          profile_id?: string
          reputation_score?: number
          service_area?: string | null
          specialties?: string[] | null
          total_inspections?: number
          total_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_reviews: {
        Row: {
          content: string | null
          created_at: string
          id: string
          ppi_request_id: string
          rating: number
          reviewer_id: string
          status: Database["public"]["Enums"]["review_status"]
          technician_profile_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          id?: string
          ppi_request_id: string
          rating: number
          reviewer_id: string
          status?: Database["public"]["Enums"]["review_status"]
          technician_profile_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          id?: string
          ppi_request_id?: string
          rating?: number
          reviewer_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          technician_profile_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "technician_reviews_ppi_request_id_fkey"
            columns: ["ppi_request_id"]
            isOneToOne: true
            referencedRelation: "ppi_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_reviews_technician_profile_id_fkey"
            columns: ["technician_profile_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_media: {
        Row: {
          content_type: string | null
          id: string
          is_primary: boolean
          media_type: Database["public"]["Enums"]["media_type"]
          moderation_checked_at: string | null
          moderation_reason: string | null
          moderation_status: string
          moderation_version: string | null
          sort_order: number
          uploaded_at: string
          url: string
          vehicle_id: string
        }
        Insert: {
          content_type?: string | null
          id?: string
          is_primary?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          sort_order?: number
          uploaded_at?: string
          url: string
          vehicle_id: string
        }
        Update: {
          content_type?: string | null
          id?: string
          is_primary?: boolean
          media_type?: Database["public"]["Enums"]["media_type"]
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          sort_order?: number
          uploaded_at?: string
          url?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_media_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_notes: {
        Row: {
          notes: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          notes: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          notes?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_notes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: true
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          created_at: string
          id: string
          make: string | null
          mileage: number | null
          model: string | null
          organization_id: string | null
          owner_id: string | null
          trim: string | null
          updated_at: string
          vin: string | null
          visibility: Database["public"]["Enums"]["vehicle_visibility"]
          year: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          make?: string | null
          mileage?: number | null
          model?: string | null
          organization_id?: string | null
          owner_id?: string | null
          trim?: string | null
          updated_at?: string
          vin?: string | null
          visibility?: Database["public"]["Enums"]["vehicle_visibility"]
          year?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          make?: string | null
          mileage?: number | null
          model?: string | null
          organization_id?: string | null
          owner_id?: string | null
          trim?: string | null
          updated_at?: string
          vin?: string | null
          visibility?: Database["public"]["Enums"]["vehicle_visibility"]
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vsc_outputs: {
        Row: {
          coverage_data: Json
          document_url: string | null
          generated_at: string
          id: string
          ppi_submission_id: string
          standardized_output_id: string
          version: number
        }
        Insert: {
          coverage_data?: Json
          document_url?: string | null
          generated_at?: string
          id?: string
          ppi_submission_id: string
          standardized_output_id: string
          version?: number
        }
        Update: {
          coverage_data?: Json
          document_url?: string | null
          generated_at?: string
          id?: string
          ppi_submission_id?: string
          standardized_output_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "vsc_outputs_ppi_submission_id_fkey"
            columns: ["ppi_submission_id"]
            isOneToOne: false
            referencedRelation: "ppi_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vsc_outputs_standardized_output_id_fkey"
            columns: ["standardized_output_id"]
            isOneToOne: false
            referencedRelation: "standardized_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_options: {
        Row: {
          created_at: string
          id: string
          offered_at: string | null
          plans: Json
          status: Database["public"]["Enums"]["warranty_status"]
          updated_at: string
          user_id: string
          vehicle_id: string
          viewed_at: string | null
          vsc_output_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          offered_at?: string | null
          plans?: Json
          status?: Database["public"]["Enums"]["warranty_status"]
          updated_at?: string
          user_id: string
          vehicle_id: string
          viewed_at?: string | null
          vsc_output_id: string
        }
        Update: {
          created_at?: string
          id?: string
          offered_at?: string | null
          plans?: Json
          status?: Database["public"]["Enums"]["warranty_status"]
          updated_at?: string
          user_id?: string
          vehicle_id?: string
          viewed_at?: string | null
          vsc_output_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_options_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_options_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warranty_options_vsc_output_id_fkey"
            columns: ["vsc_output_id"]
            isOneToOne: false
            referencedRelation: "vsc_outputs"
            referencedColumns: ["id"]
          },
        ]
      }
      warranty_orders: {
        Row: {
          id: string
          plan_name: string
          price_cents: number
          selected_at: string
          status: Database["public"]["Enums"]["warranty_status"]
          term_miles: number | null
          term_years: number
          updated_at: string
          warranty_option_id: string
        }
        Insert: {
          id?: string
          plan_name: string
          price_cents: number
          selected_at?: string
          status?: Database["public"]["Enums"]["warranty_status"]
          term_miles?: number | null
          term_years: number
          updated_at?: string
          warranty_option_id: string
        }
        Update: {
          id?: string
          plan_name?: string
          price_cents?: number
          selected_at?: string
          status?: Database["public"]["Enums"]["warranty_status"]
          term_miles?: number | null
          term_years?: number
          updated_at?: string
          warranty_option_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warranty_orders_warranty_option_id_fkey"
            columns: ["warranty_option_id"]
            isOneToOne: false
            referencedRelation: "warranty_options"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_delivery_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          duration_ms: number | null
          error_category: string | null
          error_message: string | null
          id: string
          outbound_event_id: string
          request_url: string
          response_status: number | null
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          duration_ms?: number | null
          error_category?: string | null
          error_message?: string | null
          id?: string
          outbound_event_id: string
          request_url: string
          response_status?: number | null
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          duration_ms?: number | null
          error_category?: string | null
          error_message?: string | null
          id?: string
          outbound_event_id?: string
          request_url?: string
          response_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_attempts_outbound_event_id_fkey"
            columns: ["outbound_event_id"]
            isOneToOne: false
            referencedRelation: "outbound_events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_correct_username: {
        Args: { p_profile_id: string; p_reason: string; p_username: string }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      apply_moderation_review: {
        Args: {
          p_enforcement: string
          p_item_id: string
          p_media_url: string | null
          p_next_decision: string
          p_next_status: string
          p_notes: string | null
          p_reviewer_id: string
        }
        Returns: undefined
      }
      am_i_in_conversation: { Args: { conv_id: string }; Returns: boolean }
      can_access_submission: {
        Args: { submission_id: string }
        Returns: boolean
      }
      can_manage_share_target: {
        Args: {
          media_package_id_in: string
          ppi_submission_id_in: string
          standardized_output_id_in: string
          target_type_in: Database["public"]["Enums"]["share_target_type"]
        }
        Returns: boolean
      }
      claim_privacy_deletion_requests: {
        Args: { p_limit: number; p_worker_id: string }
        Returns: Database["public"]["Tables"]["privacy_requests"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "privacy_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_own_username: {
        Args: { p_username: string }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      claim_outbound_events: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          created_at: string
          dedupe_key: string
          delivered_at: string | null
          event_type: string
          external_inspection_ref_id: string | null
          id: string
          last_error: Json | null
          last_response_status: number | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          partner_connection_id: string
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "outbound_events"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_output_generation_jobs: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: Json | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          output_version: number
          ppi_submission_id: string
          requested_by: string | null
          started_at: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "output_generation_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      enqueue_output_generation_job: {
        Args: {
          p_force_new_version?: boolean
          p_requested_by?: string
          p_submission_id: string
          p_trigger_reason?: string
        }
        Returns: {
          attempt_count: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: Json | null
          lock_expires_at: string | null
          locked_at: string | null
          locked_by: string | null
          max_attempts: number
          next_attempt_at: string
          output_version: number
          ppi_submission_id: string
          requested_by: string | null
          started_at: string | null
          status: string
          trigger_reason: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "output_generation_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      open_moderation_appeal: {
        Args: {
          p_appellant_id: string
          p_item_id: string
          p_statement: string
        }
        Returns: undefined
      }
      apply_vehicle_media_review: {
        Args: {
          p_enforcement: string
          p_item_id: string
          p_media_url: string | null
          p_next_decision: string
          p_next_status: string
          p_notes: string | null
          p_reviewer_id: string
        }
        Returns: undefined
      }
      complete_warranty_payment: {
        Args: {
          p_contract_id: string
          p_order_id: string
          p_paid_at: string
          p_payment_id: string
          p_receipt_url: string | null
          p_stripe_payment_id: string | null
        }
        Returns: undefined
      }
      complete_warranty_signature: {
        Args: {
          p_contract_id: string
          p_document_url: string
          p_order_id: string
          p_signed_at: string
        }
        Returns: undefined
      }
      fail_warranty_payment: {
        Args: {
          p_contract_id: string
          p_order_id: string
          p_payment_id: string
          p_stripe_payment_id: string
        }
        Returns: undefined
      }
      submit_moderation_report: {
        Args: {
          p_details: string | null
          p_entity_id: string
          p_entity_type: string
          p_idempotency_key: string
          p_reason_code: string
          p_reporter_id: string
          p_revision_id: string
        }
        Returns: Json
      }
      submit_ppi_atomic: {
        Args: { p_submission_id: string; p_submitted_at: string }
        Returns: string
      }
      dev_switch_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      set_own_role: {
        Args: { p_role: Database["public"]["Enums"]["user_role"] }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      set_own_profile_block: {
        Args: { p_blocked: boolean; p_target_profile_id: string }
        Returns: boolean
      }
      set_own_profile_mute: {
        Args: { p_muted: boolean; p_target_profile_id: string }
        Returns: boolean
      }
      set_own_social_privacy: {
        Args: {
          p_allow_exact_username_lookup?: boolean
          p_default_post_audience: Database["public"]["Enums"]["community_post_audience"]
          p_discoverable?: boolean
          p_is_public: boolean
        }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      social_can_view_community_post: {
        Args: { p_include_muted?: boolean; p_post_id: string; p_viewer_id: string }
        Returns: boolean
      }
      social_can_current_user_view_community_post: {
        Args: { p_include_muted?: boolean; p_post_id: string }
        Returns: boolean
      }
      social_current_user_is_blocked_with: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      social_current_user_can_view_profile: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      social_can_view_profile: {
        Args: { p_profile_id: string; p_viewer_id: string }
        Returns: boolean
      }
      social_profile_is_available: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      social_profiles_are_blocked: {
        Args: { p_first_id: string; p_second_id: string }
        Returns: boolean
      }
      social_profiles_are_friends: {
        Args: { p_first_id: string; p_second_id: string }
        Returns: boolean
      }
      social_visible_community_post_ids: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_vehicle_id?: string | null
          p_viewer_id: string
        }
        Returns: { post_id: string }[]
      }
      get_my_is_developer: { Args: never; Returns: boolean }
      get_my_org_id: { Args: never; Returns: string }
      get_my_profile_id: { Args: never; Returns: string }
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_warranty_option_user_id: {
        Args: { option_id: string }
        Returns: string
      }
      is_my_organization: { Args: { target_org_id: string }; Returns: boolean }
      is_org_manager_of: { Args: { target_org_id: string }; Returns: boolean }
      my_org_tech_profile_ids: {
        Args: never
        Returns: {
          profile_id: string
        }[]
      }
      partner_create_inspection: {
        Args: {
          p_assigned_profile_id: string
          p_connection_id: string
          p_external_actor_id: string
          p_external_inspection_phase_id?: string
          p_external_organization_id: string
          p_external_recon_case_id?: string
          p_external_vehicle_id?: string
          p_idempotency_key: string
          p_make?: string
          p_mileage?: number
          p_model?: string
          p_organization_id: string
          p_ppi_type: Database["public"]["Enums"]["ppi_type"]
          p_request_fingerprint: string
          p_source_label?: string
          p_trim?: string
          p_vehicle_snapshot: Json
          p_vin: string
          p_year?: number
        }
        Returns: {
          ref_id: string
          request_id: string
          vehicle_id: string
          was_created: boolean
        }[]
      }
      partner_exchange_user_link: {
        Args: {
          p_authorization_code_hash: string
          p_connection_id: string
          p_transaction_id: string
        }
        Returns: {
          external_user_id: string
          linked_at: string
          profile_id: string
          status: string
        }[]
      }
      partner_rate_limit_hit: {
        Args: { p_bucket_key: string; p_window_start: string }
        Returns: number
      }
      partner_request_delivery:
        | {
            Args: {
              p_event_id: string
              p_occurred_at: string
              p_output_version: number
              p_ref_id: string
            }
            Returns: {
              attempt_count: number
              created_at: string
              dedupe_key: string
              delivered_at: string | null
              event_type: string
              external_inspection_ref_id: string | null
              id: string
              last_error: Json | null
              last_response_status: number | null
              lock_expires_at: string | null
              locked_at: string | null
              locked_by: string | null
              max_attempts: number
              next_attempt_at: string
              partner_connection_id: string
              payload: Json
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "outbound_events"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_event_id: string
              p_occurred_at: string
              p_output_version: number
              p_ref_id: string
              p_submission_id: string
            }
            Returns: {
              attempt_count: number
              created_at: string
              dedupe_key: string
              delivered_at: string | null
              event_type: string
              external_inspection_ref_id: string | null
              id: string
              last_error: Json | null
              last_response_status: number | null
              lock_expires_at: string | null
              locked_at: string | null
              locked_by: string | null
              max_attempts: number
              next_attempt_at: string
              partner_connection_id: string
              payload: Json
              status: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "outbound_events"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      partner_update_inspection_vehicle: {
        Args: {
          p_make?: string
          p_mileage?: number
          p_model?: string
          p_ref_id: string
          p_snapshot: Json
          p_trim?: string
          p_vin?: string
          p_year?: number
        }
        Returns: {
          created_at: string
          current_submission_id: string | null
          delivered_output_version: number | null
          delivered_submission_id: string | null
          delivery_status: string
          delivery_version: number
          external_actor_id: string | null
          external_inspection_phase_id: string | null
          external_organization_id: string
          external_recon_case_id: string | null
          external_vehicle_id: string | null
          id: string
          idempotency_key: string
          integration_status: string
          last_delivered_at: string | null
          last_delivery_requested_at: string | null
          last_error: Json | null
          partner_connection_id: string
          ppi_request_id: string
          request_fingerprint: string
          source_label: string | null
          source_system: string
          updated_at: string
          vehicle_snapshot: Json
        }
        SetofOptions: {
          from: "*"
          to: "external_inspection_refs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ready_output_version: {
        Args: { p_submission_id: string }
        Returns: number
      }
      reconcile_output_generation_jobs: {
        Args: { p_limit?: number }
        Returns: number
      }
      refresh_tech_review_aggregates: {
        Args: { p_tech_profile_id: string }
        Returns: undefined
      }
    }
    Enums: {
      answer_type: "text" | "yes_no" | "select" | "number"
      audit_action:
        | "inspection_edited"
        | "output_regenerated"
        | "contract_state_changed"
        | "payment_state_changed"
        | "submission_resubmitted"
      certification_level: "none" | "ase" | "master" | "oem_qualified"
      community_content_status: "active" | "hidden" | "archived"
      community_post_audience: "public" | "friends"
      community_media_type: "image" | "video"
      completion_state: "not_started" | "in_progress" | "completed"
      device_env: "prod" | "sandbox"
      device_platform: "ios" | "android"
      listing_status: "active" | "sold" | "archived"
      media_type: "image" | "video"
      message_status: "unread" | "read" | "archived"
      notification_type:
        | "tech_request_new"
        | "tech_request_accepted"
        | "inspection_submitted"
        | "inspection_updated"
        | "warranty_available"
        | "payment_completed"
        | "message_received"
      org_member_role: "technician" | "manager"
      payment_method: "card" | "bank_transfer" | "financing"
      payment_status: "pending" | "completed" | "failed" | "refunded"
      performer_type: "self" | "technician"
      ppi_request_status:
        | "draft"
        | "pending_assignment"
        | "assigned"
        | "accepted"
        | "in_progress"
        | "submitted"
        | "needs_revision"
        | "completed"
        | "archived"
      inspection_scope: "complete" | "dents_tires"
      ppi_type: "personal" | "general_tech" | "certified_tech"
      requester_role: "buying" | "selling" | "documenting"
      review_status: "active" | "hidden"
      section_type:
        | "vehicle_basics"
        | "dashboard_warnings"
        | "exterior"
        | "interior"
        | "engine_bay"
        | "tires_brakes"
        | "suspension_steering"
        | "fluids"
        | "electrical_controls"
        | "underbody"
        | "road_test"
        | "modifications"
        | "wheels_tires"
        | "body_damage"
      share_target_type:
        | "media_package"
        | "inspection_result"
        | "standardized_output"
      submission_status: "draft" | "in_progress" | "submitted" | "completed"
      user_role:
        | "consumer"
        | "technician"
        | "org_manager"
        | "admin"
        | "developer"
      vehicle_visibility: "public" | "private"
      warranty_status:
        | "not_offered"
        | "offered"
        | "viewed"
        | "selected"
        | "contract_pending"
        | "signed"
        | "payment_pending"
        | "paid"
        | "failed"
        | "cancelled"
      whose_car: "own" | "other"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      answer_type: ["text", "yes_no", "select", "number"],
      audit_action: [
        "inspection_edited",
        "output_regenerated",
        "contract_state_changed",
        "payment_state_changed",
        "submission_resubmitted",
      ],
      certification_level: ["none", "ase", "master", "oem_qualified"],
      community_content_status: ["active", "hidden", "archived"],
      community_post_audience: ["public", "friends"],
      community_media_type: ["image", "video"],
      completion_state: ["not_started", "in_progress", "completed"],
      device_env: ["prod", "sandbox"],
      device_platform: ["ios", "android"],
      listing_status: ["active", "sold", "archived"],
      media_type: ["image", "video"],
      message_status: ["unread", "read", "archived"],
      notification_type: [
        "tech_request_new",
        "tech_request_accepted",
        "inspection_submitted",
        "inspection_updated",
        "warranty_available",
        "payment_completed",
        "message_received",
      ],
      org_member_role: ["technician", "manager"],
      payment_method: ["card", "bank_transfer", "financing"],
      payment_status: ["pending", "completed", "failed", "refunded"],
      performer_type: ["self", "technician"],
      ppi_request_status: [
        "draft",
        "pending_assignment",
        "assigned",
        "accepted",
        "in_progress",
        "submitted",
        "needs_revision",
        "completed",
        "archived",
      ],
      inspection_scope: ["complete", "dents_tires"],
      ppi_type: ["personal", "general_tech", "certified_tech"],
      requester_role: ["buying", "selling", "documenting"],
      review_status: ["active", "hidden"],
      section_type: [
        "vehicle_basics",
        "dashboard_warnings",
        "exterior",
        "interior",
        "engine_bay",
        "tires_brakes",
        "suspension_steering",
        "fluids",
        "electrical_controls",
        "underbody",
        "road_test",
        "modifications",
        "wheels_tires",
        "body_damage",
      ],
      share_target_type: [
        "media_package",
        "inspection_result",
        "standardized_output",
      ],
      submission_status: ["draft", "in_progress", "submitted", "completed"],
      user_role: [
        "consumer",
        "technician",
        "org_manager",
        "admin",
        "developer",
      ],
      vehicle_visibility: ["public", "private"],
      warranty_status: [
        "not_offered",
        "offered",
        "viewed",
        "selected",
        "contract_pending",
        "signed",
        "payment_pending",
        "paid",
        "failed",
        "cancelled",
      ],
      whose_car: ["own", "other"],
    },
  },
} as const
