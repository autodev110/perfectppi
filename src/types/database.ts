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
      apple_sign_in_tokens: {
        Row: {
          apple_user_id: string
          last_error: string | null
          linked_at: string
          profile_id: string
          refresh_token_ciphertext: string
          revoke_attempted_at: string | null
          revoke_outcome: string | null
          updated_at: string
        }
        Insert: {
          apple_user_id: string
          last_error?: string | null
          linked_at?: string
          profile_id: string
          refresh_token_ciphertext: string
          revoke_attempted_at?: string | null
          revoke_outcome?: string | null
          updated_at?: string
        }
        Update: {
          apple_user_id?: string
          last_error?: string | null
          linked_at?: string
          profile_id?: string
          refresh_token_ciphertext?: string
          revoke_attempted_at?: string | null
          revoke_outcome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      community_mentions: {
        Row: {
          author_id: string
          comment_id: string | null
          created_at: string
          id: string
          mentioned_profile_id: string
          post_id: string | null
          rendered_username: string
        }
        Insert: {
          author_id: string
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_profile_id: string
          post_id?: string | null
          rendered_username: string
        }
        Update: {
          author_id?: string
          comment_id?: string | null
          created_at?: string
          id?: string
          mentioned_profile_id?: string
          post_id?: string | null
          rendered_username?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_mentions_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_mentions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_mentions_mentioned_profile_id_fkey"
            columns: ["mentioned_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_mentions_post_id_fkey"
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
      community_answer_selection_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          post_id: string
          previous_comment_id: string | null
          selected_comment_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          post_id: string
          previous_comment_id?: string | null
          selected_comment_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          post_id?: string
          previous_comment_id?: string | null
          selected_comment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_answer_selection_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_answer_selection_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comment_helpful_reactions: {
        Row: {
          comment_id: string
          created_at: string
          profile_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          profile_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comment_helpful_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comment_helpful_reactions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_question_outcome_events: {
        Row: {
          actor_id: string | null
          answer_comment_id: string | null
          created_at: string
          id: string
          outcome: Database["public"]["Enums"]["community_question_outcome"] | null
          post_id: string
          previous_outcome: Database["public"]["Enums"]["community_question_outcome"] | null
        }
        Insert: {
          actor_id?: string | null
          answer_comment_id?: string | null
          created_at?: string
          id?: string
          outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
          post_id: string
          previous_outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
        }
        Update: {
          actor_id?: string | null
          answer_comment_id?: string | null
          created_at?: string
          id?: string
          outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
          post_id?: string
          previous_outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
        }
        Relationships: [
          {
            foreignKeyName: "community_question_outcome_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_question_outcome_events_answer_comment_id_fkey"
            columns: ["answer_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_question_outcome_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_feed_mutes: {
        Row: {
          created_at: string
          group_id: string | null
          id: string
          post_type: Database["public"]["Enums"]["community_post_type"] | null
          profile_id: string
          scope: Database["public"]["Enums"]["community_feed_mute_scope"]
          target_key: string
          vehicle_make: string | null
          vehicle_model: string | null
        }
        Insert: {
          created_at?: string
          group_id?: string | null
          id?: string
          post_type?: Database["public"]["Enums"]["community_post_type"] | null
          profile_id: string
          scope: Database["public"]["Enums"]["community_feed_mute_scope"]
          target_key: string
          vehicle_make?: string | null
          vehicle_model?: string | null
        }
        Update: {
          created_at?: string
          group_id?: string | null
          id?: string
          post_type?: Database["public"]["Enums"]["community_post_type"] | null
          profile_id?: string
          scope?: Database["public"]["Enums"]["community_feed_mute_scope"]
          target_key?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_feed_mutes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_feed_mutes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_assemblies: {
        Row: {
          created_at: string
          creation_token: string
          expected_media_count: number
          expires_at: string
          finalized_at: string | null
          owner_id: string
          post_id: string
          state: Database["public"]["Enums"]["community_post_assembly_state"]
          submitted_at: string | null
        }
        Insert: {
          created_at?: string
          creation_token: string
          expected_media_count: number
          expires_at?: string
          finalized_at?: string | null
          owner_id: string
          post_id: string
          state?: Database["public"]["Enums"]["community_post_assembly_state"]
          submitted_at?: string | null
        }
        Update: {
          created_at?: string
          creation_token?: string
          expected_media_count?: number
          expires_at?: string
          finalized_at?: string | null
          owner_id?: string
          post_id?: string
          state?: Database["public"]["Enums"]["community_post_assembly_state"]
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_post_assemblies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_assemblies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_likes: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_post_likes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_photo_posts: {
        Row: {
          contributor_id: string
          created_at: string
          event_id: string
          post_id: string
        }
        Insert: {
          contributor_id: string
          created_at?: string
          event_id: string
          post_id: string
        }
        Update: {
          contributor_id?: string
          created_at?: string
          event_id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_photo_posts_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_photo_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_photo_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          profile_id: string
          status: Database["public"]["Enums"]["community_event_rsvp_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_id: string
          profile_id: string
          status: Database["public"]["Enums"]["community_event_rsvp_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          profile_id?: string
          status?: Database["public"]["Enums"]["community_event_rsvp_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_rsvps_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_event_updates: {
        Row: {
          comment_id: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_event_updates_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: true
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_event_updates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          announcement_post_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          capacity: number | null
          client_request_id: string
          cost_cents: number
          created_at: string
          ends_at: string
          event_type: Database["public"]["Enums"]["community_event_type"]
          exact_location: string
          general_location: string
          group_id: string | null
          id: string
          organizer_id: string
          requirements: string | null
          starts_at: string
          status: Database["public"]["Enums"]["community_event_status"]
          title: string
          updated_at: string
        }
        Insert: {
          announcement_post_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          client_request_id: string
          cost_cents?: number
          created_at?: string
          ends_at: string
          event_type: Database["public"]["Enums"]["community_event_type"]
          exact_location: string
          general_location: string
          group_id?: string | null
          id?: string
          organizer_id: string
          requirements?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["community_event_status"]
          title: string
          updated_at?: string
        }
        Update: {
          announcement_post_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          capacity?: number | null
          client_request_id?: string
          cost_cents?: number
          created_at?: string
          ends_at?: string
          event_type?: Database["public"]["Enums"]["community_event_type"]
          exact_location?: string
          general_location?: string
          group_id?: string | null
          id?: string
          organizer_id?: string
          requirements?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["community_event_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_announcement_post_id_fkey"
            columns: ["announcement_post_id"]
            isOneToOne: true
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_group_faq_entries: {
        Row: {
          answer: string
          created_at: string
          created_by: string | null
          group_id: string
          id: string
          question: string
          source_comment_id: string | null
          source_post_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          answer: string
          created_at?: string
          created_by?: string | null
          group_id: string
          id?: string
          question: string
          source_comment_id?: string | null
          source_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          answer?: string
          created_at?: string
          created_by?: string | null
          group_id?: string
          id?: string
          question?: string
          source_comment_id?: string | null
          source_post_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_group_faq_entries_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_group_faq_entries_source_comment_id_fkey"
            columns: ["source_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_group_faq_entries_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_group_memberships: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          group_id: string
          invited_by: string | null
          joined_at: string
          profile_id: string
          posting_restricted_until: string | null
          posting_restriction_reason: string | null
          request_message: string | null
          requested_at: string | null
          role: Database["public"]["Enums"]["community_group_role"]
          rules_acknowledged_at: string | null
          rules_acknowledged_version: number
          status: Database["public"]["Enums"]["community_group_membership_status"]
          updated_at: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          group_id: string
          invited_by?: string | null
          joined_at?: string
          profile_id: string
          posting_restricted_until?: string | null
          posting_restriction_reason?: string | null
          request_message?: string | null
          requested_at?: string | null
          role?: Database["public"]["Enums"]["community_group_role"]
          rules_acknowledged_at?: string | null
          rules_acknowledged_version?: number
          status?: Database["public"]["Enums"]["community_group_membership_status"]
          updated_at?: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          group_id?: string
          invited_by?: string | null
          joined_at?: string
          profile_id?: string
          posting_restricted_until?: string | null
          posting_restriction_reason?: string | null
          request_message?: string | null
          requested_at?: string | null
          role?: Database["public"]["Enums"]["community_group_role"]
          rules_acknowledged_at?: string | null
          rules_acknowledged_version?: number
          status?: Database["public"]["Enums"]["community_group_membership_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_group_memberships_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_groups: {
        Row: {
          avatar_url: string | null
          category: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          is_staff_curated: boolean
          join_policy: Database["public"]["Enums"]["community_group_join_policy"]
          location_region: string | null
          posting_policy: string
          rules_version: number
          slow_mode_seconds: number
          name: string
          rules: string[]
          slug: string
          status: Database["public"]["Enums"]["community_group_status"]
          updated_at: string
          vehicle_make: string | null
          vehicle_model: string | null
          visibility: Database["public"]["Enums"]["community_group_visibility"]
          year_end: number | null
          year_start: number | null
        }
        Insert: {
          avatar_url?: string | null
          category: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          is_staff_curated?: boolean
          join_policy?: Database["public"]["Enums"]["community_group_join_policy"]
          location_region?: string | null
          posting_policy?: string
          rules_version?: number
          slow_mode_seconds?: number
          name: string
          rules?: string[]
          slug: string
          status?: Database["public"]["Enums"]["community_group_status"]
          updated_at?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          visibility?: Database["public"]["Enums"]["community_group_visibility"]
          year_end?: number | null
          year_start?: number | null
        }
        Update: {
          avatar_url?: string | null
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          is_staff_curated?: boolean
          join_policy?: Database["public"]["Enums"]["community_group_join_policy"]
          location_region?: string | null
          posting_policy?: string
          rules_version?: number
          slow_mode_seconds?: number
          name?: string
          rules?: string[]
          slug?: string
          status?: Database["public"]["Enums"]["community_group_status"]
          updated_at?: string
          vehicle_make?: string | null
          vehicle_model?: string | null
          visibility?: Database["public"]["Enums"]["community_group_visibility"]
          year_end?: number | null
          year_start?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          accepted_answer_comment_id: string | null
          active_revision_id: string
          audience: Database["public"]["Enums"]["community_post_audience"]
          author_id: string
          content: string
          created_at: string
          details: Json
          feed_fingerprint: string
          group_id: string | null
          group_pinned_at: string | null
          group_pinned_by: string | null
          group_status: Database["public"]["Enums"]["community_group_post_status"]
          id: string
          marketplace_listing_id: string | null
          moderation_checked_at: string | null
          moderation_reason: string | null
          moderation_status: string
          moderation_version: string | null
          poll_closes_at: string | null
          post_type: Database["public"]["Enums"]["community_post_type"]
          question_outcome: Database["public"]["Enums"]["community_question_outcome"] | null
          question_outcome_updated_at: string | null
          status: Database["public"]["Enums"]["community_content_status"]
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          accepted_answer_comment_id?: string | null
          active_revision_id?: string
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id: string
          content: string
          created_at?: string
          details?: Json
          feed_fingerprint?: string
          group_id?: string | null
          group_pinned_at?: string | null
          group_pinned_by?: string | null
          group_status?: Database["public"]["Enums"]["community_group_post_status"]
          id?: string
          marketplace_listing_id?: string | null
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          poll_closes_at?: string | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          question_outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
          question_outcome_updated_at?: string | null
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          accepted_answer_comment_id?: string | null
          active_revision_id?: string
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string
          content?: string
          created_at?: string
          details?: Json
          feed_fingerprint?: string
          group_id?: string | null
          group_pinned_at?: string | null
          group_pinned_by?: string | null
          group_status?: Database["public"]["Enums"]["community_group_post_status"]
          id?: string
          marketplace_listing_id?: string | null
          moderation_checked_at?: string | null
          moderation_reason?: string | null
          moderation_status?: string
          moderation_version?: string | null
          poll_closes_at?: string | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          question_outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
          question_outcome_updated_at?: string | null
          status?: Database["public"]["Enums"]["community_content_status"]
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_accepted_answer_comment_id_fkey"
            columns: ["accepted_answer_comment_id"]
            isOneToOne: true
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
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
          details: Json
          group_id: string | null
          group_status: Database["public"]["Enums"]["community_group_post_status"]
          id: string
          marketplace_listing_id: string | null
          post_type: Database["public"]["Enums"]["community_post_type"]
          post_id: string
          revision_number: number
          vehicle_id: string | null
        }
        Insert: {
          audience: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string | null
          content: string
          created_at?: string
          details?: Json
          group_id?: string | null
          group_status?: Database["public"]["Enums"]["community_group_post_status"]
          id: string
          marketplace_listing_id?: string | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          post_id: string
          revision_number: number
          vehicle_id?: string | null
        }
        Update: {
          audience?: Database["public"]["Enums"]["community_post_audience"]
          author_id?: string | null
          content?: string
          created_at?: string
          details?: Json
          group_id?: string | null
          group_status?: Database["public"]["Enums"]["community_group_post_status"]
          id?: string
          marketplace_listing_id?: string | null
          post_type?: Database["public"]["Enums"]["community_post_type"]
          post_id?: string
          revision_number?: number
          vehicle_id?: string | null
        }
        Relationships: []
      }
      community_post_media: {
        Row: {
          content_sha256: string | null
          display_reference: string | null
          legacy_public_url: string | null
          storage_migrated_at: string | null
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
          content_sha256?: string | null
          display_reference?: string | null
          legacy_public_url?: string | null
          storage_migrated_at?: string | null
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
          content_sha256?: string | null
          display_reference?: string | null
          legacy_public_url?: string | null
          storage_migrated_at?: string | null
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
          group_id: string | null
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
          group_id?: string | null
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
          group_id?: string | null
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
      moderation_case_notes: {
        Row: {
          author_id: string | null
          case_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          author_id?: string | null
          case_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          author_id?: string | null
          case_id?: string
          created_at?: string
          id?: string
          note?: string
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
        Relationships: [
          {
            foreignKeyName: "moderation_cases_moderation_item_id_fkey"
            columns: ["moderation_item_id"]
            isOneToOne: false
            referencedRelation: "moderation_items"
            referencedColumns: ["id"]
          },
        ]
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
          dead_lettered_at: string | null
          locked_by: string | null
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
          dead_lettered_at?: string | null
          locked_by?: string | null
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
          dead_lettered_at?: string | null
          locked_by?: string | null
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
      moderation_retention_policies: {
        Row: {
          approval_reference: string
          approved_at: string
          approved_by: string | null
          basis: string
          retention_days: number
          updated_at: string
        }
        Insert: {
          approval_reference: string
          approved_at?: string
          approved_by?: string | null
          basis: string
          retention_days: number
          updated_at?: string
        }
        Update: {
          approval_reference?: string
          approved_at?: string
          approved_by?: string | null
          basis?: string
          retention_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      moderation_retention_policy_events: {
        Row: {
          action: string
          actor_id: string | null
          approval_reference: string
          basis: string
          created_at: string
          id: string
          retention_days: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          approval_reference: string
          basis: string
          created_at?: string
          id?: string
          retention_days?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          approval_reference?: string
          basis?: string
          created_at?: string
          id?: string
          retention_days?: number | null
        }
        Relationships: []
      }
      moderation_role_grant_events: {
        Row: {
          action: string
          actor_id: string | null
          capability: string
          created_at: string
          id: string
          profile_id: string | null
          reason: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          capability: string
          created_at?: string
          id?: string
          profile_id?: string | null
          reason: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          capability?: string
          created_at?: string
          id?: string
          profile_id?: string | null
          reason?: string
        }
        Relationships: []
      }
      moderation_role_grants: {
        Row: {
          capability: string
          granted_at: string
          granted_by: string | null
          id: string
          profile_id: string
          reason: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          capability: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          profile_id: string
          reason: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          capability?: string
          granted_at?: string
          granted_by?: string | null
          id?: string
          profile_id?: string
          reason?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
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
      retention_purge_events: {
        Row: {
          basis: string
          case_id: string | null
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          summary: Json
        }
        Insert: {
          basis: string
          case_id?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          summary?: Json
        }
        Update: {
          basis?: string
          case_id?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          summary?: Json
        }
        Relationships: []
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
          contact_kind: string
          created_at: string
          id: string
          marketplace_listing_id: string | null
          participant_high_id: string | null
          participant_low_id: string | null
          request_context_group_id: string | null
          request_resolved_at: string | null
          request_status: string
          requested_by: string | null
        }
        Insert: {
          contact_kind?: string
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
          participant_high_id?: string | null
          participant_low_id?: string | null
          request_context_group_id?: string | null
          request_resolved_at?: string | null
          request_status?: string
          requested_by?: string | null
        }
        Update: {
          contact_kind?: string
          created_at?: string
          id?: string
          marketplace_listing_id?: string | null
          participant_high_id?: string | null
          participant_low_id?: string | null
          request_context_group_id?: string | null
          request_resolved_at?: string | null
          request_status?: string
          requested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_high_id_fkey"
            columns: ["participant_high_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_low_id_fkey"
            columns: ["participant_low_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_context_group_id_fkey"
            columns: ["request_context_group_id"]
            isOneToOne: false
            referencedRelation: "community_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          attached_inspection_id: string | null
          created_at: string
          description: string | null
          id: string
          inspection_shared_at: string | null
          location: string | null
          removed_at: string | null
          seller_id: string
          status: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          asking_price_cents: number
          attached_inspection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          inspection_shared_at?: string | null
          location?: string | null
          removed_at?: string | null
          seller_id: string
          status?: Database["public"]["Enums"]["listing_status"]
          title: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          asking_price_cents?: number
          attached_inspection_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          inspection_shared_at?: string | null
          location?: string | null
          removed_at?: string | null
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
      operational_worker_runs: {
        Row: {
          completed_at: string | null
          duration_ms: number | null
          error_code: string | null
          id: string
          started_at: string
          status: string
          worker_code: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          started_at?: string
          status?: string
          worker_code: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number | null
          error_code?: string | null
          id?: string
          started_at?: string
          status?: string
          worker_code?: string
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
          marketplace_listing_id: string | null
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
          marketplace_listing_id?: string | null
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
          marketplace_listing_id?: string | null
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
            foreignKeyName: "ppi_requests_marketplace_listing_id_fkey"
            columns: ["marketplace_listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
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
      notification_preferences: {
        Row: {
          category: string
          in_app: boolean
          profile_id: string
          push: boolean
          updated_at: string
        }
        Insert: {
          category: string
          in_app?: boolean
          profile_id: string
          push?: boolean
          updated_at?: string
        }
        Update: {
          category?: string
          in_app?: boolean
          profile_id?: string
          push?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      community_group_creation_events: {
        Row: {
          actor_id: string
          created_at: string
          group_id: string | null
          id: number
        }
        Insert: {
          actor_id: string
          created_at?: string
          group_id?: string | null
          id?: never
        }
        Update: {
          actor_id?: string
          created_at?: string
          group_id?: string | null
          id?: never
        }
        Relationships: []
      }
      community_group_moderation_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          group_id: string
          id: number
          metadata: Json
          post_id: string | null
          reason: string | null
          target_profile_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          group_id: string
          id?: never
          metadata?: Json
          post_id?: string | null
          reason?: string | null
          target_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          group_id?: string
          id?: never
          metadata?: Json
          post_id?: string | null
          reason?: string | null
          target_profile_id?: string | null
        }
        Relationships: []
      }
      marketplace_saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          last_matched_at: string
          name: string
          notify: boolean
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          last_matched_at?: string
          name: string
          notify?: boolean
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          last_matched_at?: string
          name?: string
          notify?: boolean
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_saved_searches_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listing_saves: {
        Row: {
          created_at: string
          listing_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          profile_id?: string
        }
        Relationships: []
      }
      community_poll_votes: {
        Row: {
          created_at: string
          option_key: string
          post_id: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          option_key: string
          post_id: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          option_key?: string
          post_id?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_post_saves: {
        Row: {
          created_at: string
          post_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          profile_id?: string
        }
        Relationships: []
      }
      saved_collections: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_collections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["saved_collection_entity_type"]
          id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["saved_collection_entity_type"]
          id?: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["saved_collection_entity_type"]
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_collection_items_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "saved_collections"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_build_subscriptions: {
        Row: {
          created_at: string
          profile_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          profile_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          profile_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_build_subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_build_subscriptions_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      friend_request_events: {
        Row: {
          actor_id: string
          created_at: string
          event: string
          id: number
          target_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event: string
          id?: never
          target_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event?: string
          id?: never
          target_id?: string
        }
        Relationships: []
      }
      product_feature_flag_changes: {
        Row: {
          actor_id: string | null
          created_at: string
          environment: string
          flag_code: string
          id: string
          next_enabled: boolean
          previous_enabled: boolean | null
          reason: string
          version: number
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          environment: string
          flag_code: string
          id?: string
          next_enabled: boolean
          previous_enabled?: boolean | null
          reason: string
          version: number
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          environment?: string
          flag_code?: string
          id?: string
          next_enabled?: boolean
          previous_enabled?: boolean | null
          reason?: string
          version?: number
        }
        Relationships: []
      }
      product_feature_flags: {
        Row: {
          enabled: boolean
          environment: string
          flag_code: string
          reason: string
          rollout_scope: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          enabled: boolean
          environment: string
          flag_code: string
          reason: string
          rollout_scope?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          enabled?: boolean
          environment?: string
          flag_code?: string
          reason?: string
          rollout_scope?: Json
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      profile_blocks: {
        Row: { blocked_id: string; blocker_id: string; created_at: string }
        Insert: { blocked_id: string; blocker_id: string; created_at?: string }
        Update: { blocked_id?: string; blocker_id?: string; created_at?: string }
        Relationships: []
      }
      profile_contact_identifiers: {
        Row: {
          created_at: string
          identifier_digest: string
          kind: Database["public"]["Enums"]["contact_identifier_kind"]
          profile_id: string
        }
        Insert: {
          created_at?: string
          identifier_digest: string
          kind: Database["public"]["Enums"]["contact_identifier_kind"]
          profile_id: string
        }
        Update: {
          created_at?: string
          identifier_digest?: string
          kind?: Database["public"]["Enums"]["contact_identifier_kind"]
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_contact_identifiers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          allow_friend_messages: boolean
          allow_group_message_requests: boolean
          allow_exact_username_lookup: boolean
          auth_user_id: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_post_audience: Database["public"]["Enums"]["community_post_audience"]
          display_name: string | null
          discoverable: boolean
          friend_request_policy: string
          id: string
          is_developer: boolean
          is_public: boolean
          mention_policy: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          username: string | null
          username_normalized: string | null
          username_state: string
        }
        Insert: {
          allow_friend_messages?: boolean
          allow_group_message_requests?: boolean
          allow_exact_username_lookup?: boolean
          auth_user_id: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_post_audience?: Database["public"]["Enums"]["community_post_audience"]
          display_name?: string | null
          discoverable?: boolean
          friend_request_policy?: string
          id?: string
          is_developer?: boolean
          is_public?: boolean
          mention_policy?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          username?: string | null
          username_normalized?: string | null
          username_state?: string
        }
        Update: {
          allow_friend_messages?: boolean
          allow_group_message_requests?: boolean
          allow_exact_username_lookup?: boolean
          auth_user_id?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_post_audience?: Database["public"]["Enums"]["community_post_audience"]
          display_name?: string | null
          discoverable?: boolean
          friend_request_policy?: string
          id?: string
          is_developer?: boolean
          is_public?: boolean
          mention_policy?: string
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
      technician_credential_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          credential_id: string | null
          id: string
          reason: string
          technician_profile_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          reason: string
          technician_profile_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          credential_id?: string | null
          id?: string
          reason?: string
          technician_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_credential_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credential_events_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "technician_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credential_events_technician_profile_id_fkey"
            columns: ["technician_profile_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_credentials: {
        Row: {
          created_at: string
          credential_identifier_last4: string | null
          credential_name: string
          credential_type: string
          evidence_reference: string
          expires_on: string | null
          id: string
          issued_on: string | null
          issuer: string
          review_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          scope: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          supersedes_credential_id: string | null
          technician_profile_id: string
          updated_at: string
          verification_method: string | null
        }
        Insert: {
          created_at?: string
          credential_identifier_last4?: string | null
          credential_name: string
          credential_type: string
          evidence_reference: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          supersedes_credential_id?: string | null
          technician_profile_id: string
          updated_at?: string
          verification_method?: string | null
        }
        Update: {
          created_at?: string
          credential_identifier_last4?: string | null
          credential_name?: string
          credential_type?: string
          evidence_reference?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string
          review_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          supersedes_credential_id?: string | null
          technician_profile_id?: string
          updated_at?: string
          verification_method?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technician_credentials_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credentials_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credentials_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credentials_supersedes_credential_id_fkey"
            columns: ["supersedes_credential_id"]
            isOneToOne: false
            referencedRelation: "technician_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "technician_credentials_technician_profile_id_fkey"
            columns: ["technician_profile_id"]
            isOneToOne: false
            referencedRelation: "technician_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technician_profiles: {
        Row: {
          avg_rating: number
          certification_level: Database["public"]["Enums"]["certification_level"]
          claimed_certification_level: Database["public"]["Enums"]["certification_level"]
          created_at: string
          id: string
          is_available: boolean
          is_featured: boolean
          is_independent: boolean
          is_verified: boolean
          offers_mobile_service: boolean
          offers_shop_service: boolean
          organization_id: string | null
          profile_id: string
          reputation_score: number
          service_area: string | null
          specialties: string[] | null
          supported_makes: string[]
          total_inspections: number
          total_reviews: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number
          certification_level?: Database["public"]["Enums"]["certification_level"]
          claimed_certification_level?: Database["public"]["Enums"]["certification_level"]
          created_at?: string
          id?: string
          is_available?: boolean
          is_featured?: boolean
          is_independent?: boolean
          is_verified?: boolean
          offers_mobile_service?: boolean
          offers_shop_service?: boolean
          organization_id?: string | null
          profile_id: string
          reputation_score?: number
          service_area?: string | null
          specialties?: string[] | null
          supported_makes?: string[]
          total_inspections?: number
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number
          certification_level?: Database["public"]["Enums"]["certification_level"]
          claimed_certification_level?: Database["public"]["Enums"]["certification_level"]
          created_at?: string
          id?: string
          is_available?: boolean
          is_featured?: boolean
          is_independent?: boolean
          is_verified?: boolean
          offers_mobile_service?: boolean
          offers_shop_service?: boolean
          organization_id?: string | null
          profile_id?: string
          reputation_score?: number
          service_area?: string | null
          specialties?: string[] | null
          supported_makes?: string[]
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
      vehicle_make_aliases: {
        Row: { alias: string; canonical: string }
        Insert: { alias: string; canonical: string }
        Update: { alias?: string; canonical?: string }
        Relationships: []
      }
      vehicle_build_entries: {
        Row: {
          category: string
          cost_cents: number | null
          created_at: string
          fitment_confidence: Database["public"]["Enums"]["vehicle_fitment_confidence"]
          id: string
          installation_kind: Database["public"]["Enums"]["vehicle_installation_kind"]
          installed_on: string | null
          is_public: boolean
          manufacturer: string | null
          mileage: number | null
          owner_id: string
          part_number: string | null
          private_notes: string | null
          public_notes: string | null
          related_post_id: string | null
          shop_name: string | null
          status: Database["public"]["Enums"]["vehicle_build_status"]
          suspension_drop: string | null
          tire_size: string | null
          title: string
          updated_at: string
          vehicle_configuration: string | null
          vehicle_id: string
          wheel_offset_mm: number | null
          wheel_size: string | null
          wheel_width: number | null
        }
        Insert: {
          category: string
          cost_cents?: number | null
          created_at?: string
          fitment_confidence?: Database["public"]["Enums"]["vehicle_fitment_confidence"]
          id?: string
          installation_kind?: Database["public"]["Enums"]["vehicle_installation_kind"]
          installed_on?: string | null
          is_public?: boolean
          manufacturer?: string | null
          mileage?: number | null
          owner_id: string
          part_number?: string | null
          private_notes?: string | null
          public_notes?: string | null
          related_post_id?: string | null
          shop_name?: string | null
          status?: Database["public"]["Enums"]["vehicle_build_status"]
          suspension_drop?: string | null
          tire_size?: string | null
          title: string
          updated_at?: string
          vehicle_configuration?: string | null
          vehicle_id: string
          wheel_offset_mm?: number | null
          wheel_size?: string | null
          wheel_width?: number | null
        }
        Update: {
          category?: string
          cost_cents?: number | null
          created_at?: string
          fitment_confidence?: Database["public"]["Enums"]["vehicle_fitment_confidence"]
          id?: string
          installation_kind?: Database["public"]["Enums"]["vehicle_installation_kind"]
          installed_on?: string | null
          is_public?: boolean
          manufacturer?: string | null
          mileage?: number | null
          owner_id?: string
          part_number?: string | null
          private_notes?: string | null
          public_notes?: string | null
          related_post_id?: string | null
          shop_name?: string | null
          status?: Database["public"]["Enums"]["vehicle_build_status"]
          suspension_drop?: string | null
          tire_size?: string | null
          title?: string
          updated_at?: string
          vehicle_configuration?: string | null
          vehicle_id?: string
          wheel_offset_mm?: number | null
          wheel_size?: string | null
          wheel_width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_build_entries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_build_entries_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_build_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_events: {
        Row: {
          cost_cents: number | null
          created_at: string
          id: string
          is_public: boolean
          mileage: number | null
          next_due_mileage: number | null
          next_due_on: string | null
          owner_id: string
          parts_fluids: string | null
          private_notes: string | null
          provider: string | null
          public_notes: string | null
          related_post_id: string | null
          service_type: string
          serviced_on: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          is_public?: boolean
          mileage?: number | null
          next_due_mileage?: number | null
          next_due_on?: string | null
          owner_id: string
          parts_fluids?: string | null
          private_notes?: string | null
          provider?: string | null
          public_notes?: string | null
          related_post_id?: string | null
          service_type: string
          serviced_on: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          cost_cents?: number | null
          created_at?: string
          id?: string
          is_public?: boolean
          mileage?: number | null
          next_due_mileage?: number | null
          next_due_on?: string | null
          owner_id?: string
          parts_fluids?: string | null
          private_notes?: string | null
          provider?: string | null
          public_notes?: string | null
          related_post_id?: string | null
          service_type?: string
          serviced_on?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_events_related_post_id_fkey"
            columns: ["related_post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
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
      vehicle_ownership_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          kept_public_history: boolean
          profile_id: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          kept_public_history: boolean
          profile_id: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          kept_public_history?: boolean
          profile_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_ownership_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ownership_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_handoff_claim_attempts: {
        Row: {
          attempted_at: string
          id: number
          profile_id: string
        }
        Insert: {
          attempted_at?: string
          id?: never
          profile_id: string
        }
        Update: {
          attempted_at?: string
          id?: never
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_handoff_claim_attempts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_handoff_claims: {
        Row: {
          claim_code_hash: string | null
          claimed_at: string | null
          claimed_by_profile_id: string | null
          claimed_vehicle_id: string | null
          created_at: string
          expires_at: string
          id: string
          revoked_at: string | null
          seller_profile_id: string
          source_vehicle_id: string
        }
        Insert: {
          claim_code_hash?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          claimed_vehicle_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          seller_profile_id: string
          source_vehicle_id: string
        }
        Update: {
          claim_code_hash?: string | null
          claimed_at?: string | null
          claimed_by_profile_id?: string | null
          claimed_vehicle_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          seller_profile_id?: string
          source_vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_handoff_claims_claimed_by_profile_id_fkey"
            columns: ["claimed_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_handoff_claims_claimed_vehicle_id_fkey"
            columns: ["claimed_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_handoff_claims_seller_profile_id_fkey"
            columns: ["seller_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_handoff_claims_source_vehicle_id_fkey"
            columns: ["source_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          body_style: string | null
          configuration_type: Database["public"]["Enums"]["vehicle_configuration_type"]
          created_at: string
          drivetrain: string | null
          drivetrain_original: boolean
          engine: string | null
          engine_original: boolean
          id: string
          make: string | null
          mileage: number | null
          mileage_status: Database["public"]["Enums"]["vehicle_mileage_status"]
          mileage_updated_at: string | null
          model: string | null
          nickname: string | null
          organization_id: string | null
          ownership_state: Database["public"]["Enums"]["vehicle_ownership_state"]
          owner_id: string | null
          sold_at: string | null
          transmission: string | null
          transmission_original: boolean
          trim: string | null
          updated_at: string
          vin: string | null
          visibility: Database["public"]["Enums"]["vehicle_visibility"]
          year: number | null
        }
        Insert: {
          body_style?: string | null
          configuration_type?: Database["public"]["Enums"]["vehicle_configuration_type"]
          created_at?: string
          drivetrain?: string | null
          drivetrain_original?: boolean
          engine?: string | null
          engine_original?: boolean
          id?: string
          make?: string | null
          mileage?: number | null
          mileage_status?: Database["public"]["Enums"]["vehicle_mileage_status"]
          mileage_updated_at?: string | null
          model?: string | null
          nickname?: string | null
          organization_id?: string | null
          ownership_state?: Database["public"]["Enums"]["vehicle_ownership_state"]
          owner_id?: string | null
          sold_at?: string | null
          transmission?: string | null
          transmission_original?: boolean
          trim?: string | null
          updated_at?: string
          vin?: string | null
          visibility?: Database["public"]["Enums"]["vehicle_visibility"]
          year?: number | null
        }
        Update: {
          body_style?: string | null
          configuration_type?: Database["public"]["Enums"]["vehicle_configuration_type"]
          created_at?: string
          drivetrain?: string | null
          drivetrain_original?: boolean
          engine?: string | null
          engine_original?: boolean
          id?: string
          make?: string | null
          mileage?: number | null
          mileage_status?: Database["public"]["Enums"]["vehicle_mileage_status"]
          mileage_updated_at?: string | null
          model?: string | null
          nickname?: string | null
          organization_id?: string | null
          ownership_state?: Database["public"]["Enums"]["vehicle_ownership_state"]
          owner_id?: string | null
          sold_at?: string | null
          transmission?: string | null
          transmission_original?: boolean
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
      member_contribution_summary: {
        Args: { p_target_profile_id: string; p_viewer_profile_id: string }
        Returns: Json
      }
      marketplace_visible_listing_ids: {
        Args: { p_listing_ids: string[]; p_viewer_id: string | null }
        Returns: { listing_id: string }[]
      }
      marketplace_listing_is_public: {
        Args: { p_status: Database["public"]["Enums"]["listing_status"] }
        Returns: boolean
      }
      marketplace_listing_has_obligations: {
        Args: { p_listing_id: string }
        Returns: boolean
      }
      marketplace_seller_history: {
        Args: { p_seller_id: string }
        Returns: { active_count: number; sold_count: number; first_listed_at: string | null }[]
      }
      list_attachable_listing_inspections: {
        Args: { p_actor_profile_id: string; p_listing_id: string }
        Returns: {
          request_id: string
          scope: Database["public"]["Enums"]["inspection_scope"]
          inspected_at: string
          performer_type: Database["public"]["Enums"]["performer_type"]
          performed_by: string
          request_status: Database["public"]["Enums"]["ppi_request_status"]
          attached: boolean
        }[]
      }
      attach_listing_inspection: {
        Args: { p_actor_profile_id: string; p_listing_id: string; p_request_id: string | null }
        Returns: Database["public"]["Tables"]["marketplace_listings"]["Row"]
      }
      marketplace_inspection_report: {
        Args: { p_viewer_id: string | null; p_request_id: string }
        Returns: Json
      }
      set_marketplace_listing_status: {
        Args: { p_actor_profile_id: string; p_listing_id: string; p_status: Database["public"]["Enums"]["listing_status"] }
        Returns: Database["public"]["Tables"]["marketplace_listings"]["Row"]
      }
      remove_marketplace_listing: {
        Args: { p_actor_profile_id: string; p_listing_id: string }
        Returns: string
      }
      mark_vehicle_previously_owned: {
        Args: {
          p_keep_public_history: boolean
          p_vehicle_id: string
        }
        Returns: Database["public"]["Tables"]["vehicles"]["Row"]
      }
      issue_vehicle_handoff_claim: {
        Args: {
          p_claim_code_hash: string
          p_seller_profile_id: string
          p_vehicle_id: string
        }
        Returns: {
          claim_expires_at: string
          claim_id: string
        }[]
      }
      claim_vehicle_handoff: {
        Args: {
          p_buyer_profile_id: string
          p_claim_code_hash: string
          p_vin: string
        }
        Returns: {
          outcome: string
          vehicle_id: string | null
        }[]
      }
      request_marketplace_inspection: {
        Args: {
          p_listing_id: string
          p_requester_id: string
          p_scope?: Database["public"]["Enums"]["inspection_scope"]
        }
        Returns: {
          created: boolean
          request_id: string
          request_status: Database["public"]["Enums"]["ppi_request_status"]
        }[]
      }
      create_community_post_assembly: {
        Args: {
          p_audience: Database["public"]["Enums"]["community_post_audience"]
          p_author_id: string
          p_content: string
          p_creation_token: string
          p_expected_media_count: number
          p_group_id: string | null
          p_marketplace_listing_id: string | null
          p_moderation_checked_at: string | null
          p_moderation_reason: string | null
          p_moderation_status: string
          p_moderation_version: string | null
          p_details?: Json
          p_post_type: Database["public"]["Enums"]["community_post_type"]
          p_vehicle_id: string | null
        }
        Returns: string
      }
      add_community_event_update: {
        Args: { p_actor_profile_id: string; p_comment_id: string; p_event_id: string }
        Returns: string
      }
      attach_community_event_photo_post: {
        Args: { p_actor_profile_id: string; p_event_id: string; p_post_id: string }
        Returns: boolean
      }
      can_contribute_community_event_photos: {
        Args: { p_event_id: string; p_viewer_id: string }
        Returns: boolean
      }
      cancel_community_event: {
        Args: { p_actor_profile_id: string; p_event_id: string; p_reason: string }
        Returns: boolean
      }
      community_event_exact_location: {
        Args: { p_event_id: string; p_viewer_id: string }
        Returns: string | null
      }
      community_event_rsvp_summaries: {
        Args: { p_event_ids: string[]; p_viewer_id: string }
        Returns: {
          event_id: string
          going_count: number
          interested_count: number
          viewer_status: Database["public"]["Enums"]["community_event_rsvp_status"] | null
        }[]
      }
      search_community_events: {
        Args: { p_limit?: number; p_offset?: number; p_query: string; p_viewer_id: string }
        Returns: { event_id: string }[]
      }
      create_community_event: {
        Args: {
          p_actor_profile_id: string
          p_announcement_post_id: string
          p_capacity: number | null
          p_client_request_id: string
          p_ends_at: string
          p_event_type: Database["public"]["Enums"]["community_event_type"]
          p_exact_location: string
          p_general_location: string
          p_group_id: string | null
          p_requirements: string | null
          p_starts_at: string
          p_title: string
        }
        Returns: Database["public"]["Tables"]["community_events"]["Row"]
      }
      list_visible_community_event_ids: {
        Args: { p_group_id?: string | null; p_include_past?: boolean; p_viewer_id: string }
        Returns: { event_id: string }[]
      }
      list_community_event_photo_post_ids: {
        Args: { p_event_id: string; p_viewer_id: string }
        Returns: { post_id: string }[]
      }
      set_community_event_rsvp: {
        Args: {
          p_actor_profile_id: string
          p_event_id: string
          p_status: Database["public"]["Enums"]["community_event_rsvp_status"]
        }
        Returns: Json
      }
      social_can_view_community_event: {
        Args: { p_event_id: string; p_include_cancelled?: boolean; p_viewer_id: string }
        Returns: boolean
      }
      expire_community_post_assemblies: {
        Args: { p_limit?: number }
        Returns: number
      }
      finalize_community_post_assembly: {
        Args: { p_actor_profile_id: string; p_post_id: string }
        Returns: Json
      }
      set_community_post_like: {
        Args: {
          p_actor_profile_id: string
          p_liked: boolean
          p_post_id: string
        }
        Returns: Json
      }
      set_community_comment_helpful: {
        Args: {
          p_actor_profile_id: string
          p_comment_id: string
          p_helpful: boolean
        }
        Returns: Json
      }
      community_comment_helpful_summaries: {
        Args: {
          p_comment_ids: string[]
          p_viewer_id: string
        }
        Returns: {
          comment_id: string
          helpful_by_viewer: boolean
          helpful_count: number
        }[]
      }
      set_community_question_outcome: {
        Args: {
          p_actor_profile_id: string
          p_outcome?: Database["public"]["Enums"]["community_question_outcome"] | null
          p_post_id: string
        }
        Returns: Json
      }
      community_post_like_summaries: {
        Args: {
          p_post_ids: string[]
          p_viewer_id: string
        }
        Returns: {
          like_count: number
          liked_by_viewer: boolean
          post_id: string
        }[]
      }
      create_curated_community_group: {
        Args: {
          p_actor_profile_id: string
          p_category: string
          p_description: string
          p_name: string
          p_rules?: string[]
          p_slug: string
          p_vehicle_make?: string | null
          p_vehicle_model?: string | null
          p_year_end?: number | null
          p_year_start?: number | null
        }
        Returns: Database["public"]["Tables"]["community_groups"]["Row"]
      }
      set_accepted_community_answer: {
        Args: {
          p_actor_profile_id: string
          p_comment_id?: string | null
          p_post_id: string
        }
        Returns: Json
      }
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
      claim_moderation_outbox: {
        Args: { p_limit: number; p_worker: string }
        Returns: Database["public"]["Tables"]["moderation_outbox"]["Row"][]
      }
      clear_moderation_retention_policy: {
        Args: { p_basis: string; p_reason: string }
        Returns: boolean
      }
      purge_archived_community_post: {
        Args: { p_post_id: string }
        Returns: Json
      }
      purge_moderation_case: {
        Args: { p_case_id: string }
        Returns: Json
      }
      retained_evidence_references_for_profile: {
        Args: { p_profile_id: string }
        Returns: string[]
      }
      retention_purge_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      set_moderation_retention_policy: {
        Args: { p_approval_reference: string; p_basis: string; p_retention_days: number }
        Returns: Database["public"]["Tables"]["moderation_retention_policies"]["Row"]
      }
      create_direct_conversation_internal: {
        Args: {
          p_actor_id: string
          p_marketplace_listing_id: string | null
          p_request_context_group_id: string | null
          p_request_status: string
          p_target_id: string
        }
        Returns: { conversation_id: string; was_created: boolean }[]
      }
      set_own_profile_block: {
        Args: { p_blocked: boolean; p_target_profile_id: string }
        Returns: boolean
      }
      add_moderation_case_note: {
        Args: { p_case_id: string; p_note: string }
        Returns: Database["public"]["Tables"]["moderation_case_notes"]["Row"]
      }
      claim_moderation_case: {
        Args: { p_case_id: string }
        Returns: Database["public"]["Tables"]["moderation_cases"]["Row"]
      }
      complete_moderation_outbox: {
        Args: { p_error?: string | null; p_id: string; p_success: boolean }
        Returns: Database["public"]["Tables"]["moderation_outbox"]["Row"]
      }
      community_media_storage_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      decide_moderation_case: {
        Args: {
          p_case_id: string
          p_decision: string
          p_enforcement?: string
          p_enforcement_days?: number
          p_expected_version: number
          p_policy_category: string | null
          p_rationale: string | null
        }
        Returns: Database["public"]["Tables"]["moderation_cases"]["Row"]
      }
      enqueue_moderation_sla_alerts: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      grant_moderation_capability: {
        Args: { p_capability: string; p_profile_id: string; p_reason: string }
        Returns: Database["public"]["Tables"]["moderation_role_grants"]["Row"]
      }
      moderation_current_user_has_capability: {
        Args: { p_capability: string }
        Returns: boolean
      }
      moderation_operations_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      moderation_visibility_integrity_status: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      moderation_has_capability: {
        Args: { p_capability: string; p_profile_id: string }
        Returns: boolean
      }
      release_moderation_case: {
        Args: { p_case_id: string }
        Returns: Database["public"]["Tables"]["moderation_cases"]["Row"]
      }
      revoke_moderation_capability: {
        Args: { p_capability: string; p_profile_id: string; p_reason: string }
        Returns: boolean
      }
      set_product_feature_flag: {
        Args: {
          p_enabled: boolean
          p_environment: string
          p_flag_code: string
          p_reason: string
        }
        Returns: {
          enabled: boolean
          environment: string
          flag_code: string
          reason: string
          rollout_scope: Json
          updated_at: string
          updated_by: string | null
          version: number
        }
      }
      set_own_profile_mute: {
        Args: { p_muted: boolean; p_target_profile_id: string }
        Returns: boolean
      }
      set_own_social_privacy: {
        Args: {
          p_allow_friend_messages?: boolean | null
          p_allow_group_message_requests?: boolean | null
          p_allow_exact_username_lookup?: boolean
          p_default_post_audience: Database["public"]["Enums"]["community_post_audience"]
          p_discoverable?: boolean
          p_friend_request_policy?: string | null
          p_is_public: boolean
          p_mention_policy?: string | null
        }
        Returns: Database["public"]["Tables"]["profiles"]["Row"]
      }
      notification_allowed: {
        Args: { p_profile_id: string; p_type: Database["public"]["Enums"]["notification_type"]; p_channel: string }
        Returns: boolean
      }
      set_notification_preference: {
        Args: { p_actor_profile_id: string; p_category: string; p_in_app: boolean; p_push: boolean }
        Returns: Database["public"]["Tables"]["notification_preferences"]["Row"]
      }
      list_notification_preferences: {
        Args: { p_actor_profile_id: string }
        Returns: { category: string; in_app: boolean; push: boolean; locked: boolean }[]
      }
      mark_all_notifications_read: {
        Args: { p_actor_profile_id: string }
        Returns: number
      }
      set_marketplace_listing_save: {
        Args: { p_actor_profile_id: string; p_listing_id: string; p_saved: boolean }
        Returns: Json
      }
      marketplace_listing_save_states: {
        Args: { p_viewer_id: string; p_listing_ids: string[] }
        Returns: { listing_id: string; saved: boolean }[]
      }
      list_saved_marketplace_listing_ids: {
        Args: { p_viewer_id: string; p_limit?: number; p_offset?: number }
        Returns: { listing_id: string; saved_at: string; listing_status: Database["public"]["Enums"]["listing_status"] }[]
      }
      set_community_post_save: {
        Args: { p_actor_profile_id: string; p_post_id: string; p_saved: boolean }
        Returns: Json
      }
      community_post_save_states: {
        Args: { p_viewer_id: string; p_post_ids: string[] }
        Returns: { post_id: string; saved: boolean }[]
      }
      list_saved_community_post_ids: {
        Args: { p_viewer_id: string; p_limit?: number; p_offset?: number }
        Returns: { post_id: string; saved_at: string }[]
      }
      upsert_saved_collection: {
        Args: { p_actor_profile_id: string; p_collection_id: string | null; p_name: string }
        Returns: Database["public"]["Tables"]["saved_collections"]["Row"]
      }
      delete_saved_collection: {
        Args: { p_actor_profile_id: string; p_collection_id: string }
        Returns: boolean
      }
      set_saved_collection_item: {
        Args: {
          p_actor_profile_id: string
          p_collection_id: string
          p_entity_type: Database["public"]["Enums"]["saved_collection_entity_type"]
          p_entity_id: string
          p_saved: boolean
        }
        Returns: boolean
      }
      set_vehicle_build_subscription: {
        Args: { p_actor_profile_id: string; p_vehicle_id: string; p_subscribed: boolean }
        Returns: boolean
      }
      member_activity_badges: {
        Args: { p_profile_id: string }
        Returns: Json
      }
      friend_mutual_ids: {
        Args: { p_first_id: string; p_second_id: string }
        Returns: string[]
      }
      friend_relationship_state: {
        Args: { p_viewer_id: string; p_target_id: string }
        Returns: string
      }
      send_friend_request: {
        Args: { p_actor_profile_id: string; p_target_profile_id: string }
        Returns: Json
      }
      respond_friend_request: {
        Args: { p_actor_profile_id: string; p_requester_profile_id: string; p_accept: boolean }
        Returns: Json
      }
      cancel_friend_request: {
        Args: { p_actor_profile_id: string; p_target_profile_id: string }
        Returns: Json
      }
      remove_friend: {
        Args: { p_actor_profile_id: string; p_target_profile_id: string }
        Returns: Json
      }
      list_friend_requests: {
        Args: { p_actor_profile_id: string }
        Returns: {
          direction: string
          profile_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          created_at: string
        }[]
      }
      list_my_friends: {
        Args: { p_actor_profile_id: string }
        Returns: {
          profile_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          is_public: boolean
          friends_since: string
        }[]
      }
      search_profiles: {
        Args: { p_viewer_profile_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: {
          profile_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          is_public: boolean
          exact_match: boolean
          relationship_state: string
          mutual_friend_count: number
        }[]
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
      social_service_contact_allowed: {
        Args: { p_actor_id: string; p_target_id: string }
        Returns: boolean
      }
      social_can_view_vehicle: {
        Args: { p_vehicle_id: string; p_viewer_id: string | null }
        Returns: boolean
      }
      social_can_current_user_view_vehicle: {
        Args: { p_vehicle_id: string }
        Returns: boolean
      }
      social_profile_is_available: {
        Args: { p_profile_id: string }
        Returns: boolean
      }
      social_current_user_is_available: {
        Args: Record<PropertyKey, never>
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
          p_include_group_posts?: boolean
          p_limit?: number
          p_offset?: number
          p_vehicle_id?: string | null
          p_viewer_id: string
        }
        Returns: { post_id: string }[]
      }
      social_filtered_community_post_ids: {
        Args: {
          p_filter?: Database["public"]["Enums"]["community_feed_filter"]
          p_limit?: number
          p_offset?: number
          p_viewer_id: string
          p_include_group_posts?: boolean
        }
        Returns: { post_id: string }[]
      }
      social_quality_filtered_community_post_ids: {
        Args: {
          p_filter?: Database["public"]["Enums"]["community_feed_filter"]
          p_include_group_posts?: boolean
          p_limit?: number
          p_offset?: number
          p_viewer_id: string
        }
        Returns: { collapsed_repost_count: number; post_id: string }[]
      }
      social_visible_community_group_post_ids: {
        Args: { p_viewer_id: string; p_group_id: string; p_limit?: number; p_offset?: number; p_exclude_pinned?: boolean }
        Returns: { post_id: string }[]
      }
      social_visible_community_group_pinned_post_ids: {
        Args: { p_viewer_id: string; p_group_id: string }
        Returns: { post_id: string }[]
      }
      search_group_posts: {
        Args: { p_viewer_id: string; p_group_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { post_id: string }[]
      }
      list_group_members: {
        Args: { p_viewer_id: string; p_group_id: string; p_limit?: number; p_offset?: number }
        Returns: {
          profile_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          role: Database["public"]["Enums"]["community_group_role"]
          joined_at: string
          posting_restricted_until: string | null
        }[]
      }
      acknowledge_community_group_rules: {
        Args: { p_actor_profile_id: string; p_group_id: string }
        Returns: Json
      }
      set_community_group_slow_mode: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_seconds: number }
        Returns: Json
      }
      set_group_member_posting_restriction: {
        Args: {
          p_actor_profile_id: string
          p_group_id: string
          p_target_profile_id: string
          p_restricted_until: string | null
          p_reason?: string | null
        }
        Returns: Json
      }
      list_community_group_faq: {
        Args: { p_viewer_id: string; p_group_id: string; p_query?: string | null; p_limit?: number; p_offset?: number }
        Returns: Database["public"]["Tables"]["community_group_faq_entries"]["Row"][]
      }
      upsert_community_group_faq: {
        Args: {
          p_actor_profile_id: string
          p_group_id: string
          p_entry_id?: string | null
          p_question?: string | null
          p_answer?: string | null
          p_source_post_id?: string | null
        }
        Returns: Database["public"]["Tables"]["community_group_faq_entries"]["Row"]
      }
      delete_community_group_faq: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_entry_id: string }
        Returns: boolean
      }
      community_group_is_live: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      create_community_group: {
        Args: {
          p_actor_profile_id: string
          p_slug: string
          p_name: string
          p_description: string
          p_category: string
          p_rules?: string[]
          p_vehicle_make?: string | null
          p_vehicle_model?: string | null
          p_year_start?: number | null
          p_year_end?: number | null
          p_location_region?: string | null
          p_posting_policy?: string
          p_visibility?: Database["public"]["Enums"]["community_group_visibility"]
          p_join_policy?: Database["public"]["Enums"]["community_group_join_policy"]
        }
        Returns: Database["public"]["Tables"]["community_groups"]["Row"]
      }
      update_community_group_settings: {
        Args: {
          p_actor_profile_id: string
          p_group_id: string
          p_name: string
          p_description: string
          p_category: string
          p_rules: string[]
          p_vehicle_make: string | null
          p_vehicle_model: string | null
          p_year_start: number | null
          p_year_end: number | null
          p_location_region: string | null
          p_posting_policy: string
          p_visibility?: Database["public"]["Enums"]["community_group_visibility"] | null
          p_join_policy?: Database["public"]["Enums"]["community_group_join_policy"] | null
        }
        Returns: Database["public"]["Tables"]["community_groups"]["Row"]
      }
      community_group_content_visible: {
        Args: { p_viewer_id: string; p_group_id: string }
        Returns: boolean
      }
      community_post_share_preview: {
        Args: { p_post_id: string }
        Returns: {
          post_id: string
          author_label: string
          author_username: string | null
          post_type: Database["public"]["Enums"]["community_post_type"]
          excerpt: string
          media_count: number
          vehicle_label: string | null
          created_at: string
        }[]
      }
      community_group_share_preview: {
        Args: { p_slug: string }
        Returns: {
          group_id: string
          slug: string
          name: string
          description: string
          visibility: Database["public"]["Enums"]["community_group_visibility"]
          member_count: number
        }[]
      }
      profile_share_preview: {
        Args: { p_username: string }
        Returns: {
          profile_id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          bio: string | null
          is_technician: boolean
        }[]
      }
      set_community_group_image: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_kind: string; p_url: string | null }
        Returns: Database["public"]["Tables"]["community_groups"]["Row"]
      }
      community_poll_results: {
        Args: { p_viewer_id: string; p_post_ids: string[] }
        Returns: {
          post_id: string
          closes_at: string
          closed: boolean
          total_votes: number
          viewer_option_key: string | null
          options: Json
        }[]
      }
      cast_community_poll_vote: {
        Args: { p_actor_profile_id: string; p_post_id: string; p_option_key: string }
        Returns: Json
      }
      community_search_terms: {
        Args: { p_query: string }
        Returns: { terms: string[]; makes: string[]; years: number[]; codes: string[] }[]
      }
      search_community_posts: {
        Args: { p_viewer_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { post_id: string; rank: number }[]
      }
      search_community_groups: {
        Args: { p_viewer_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { group_id: string; rank: number }[]
      }
      search_vehicles: {
        Args: { p_viewer_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { vehicle_id: string; rank: number }[]
      }
      search_marketplace_listings: {
        Args: { p_viewer_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { listing_id: string; rank: number }[]
      }
      search_technicians: {
        Args: { p_viewer_id: string; p_query: string; p_limit?: number; p_offset?: number }
        Returns: { technician_id: string; profile_id: string; rank: number }[]
      }
      search_make_suggestions: {
        Args: { p_query: string }
        Returns: { suggestion: string }[]
      }
      list_marketplace_saved_searches: {
        Args: { p_actor_profile_id: string }
        Returns: Database["public"]["Tables"]["marketplace_saved_searches"]["Row"][]
      }
      upsert_marketplace_saved_search: {
        Args: { p_actor_profile_id: string; p_search_id: string | null; p_name: string; p_filters: Json; p_notify?: boolean }
        Returns: Database["public"]["Tables"]["marketplace_saved_searches"]["Row"]
      }
      delete_marketplace_saved_search: {
        Args: { p_actor_profile_id: string; p_search_id: string }
        Returns: boolean
      }
      notify_marketplace_saved_search_matches: {
        Args: { p_limit?: number }
        Returns: number
      }
      marketplace_listing_matches_filters: {
        Args: { p_listing_id: string; p_filters: Json }
        Returns: boolean
      }
      community_group_owner_available: {
        Args: { p_group_id: string }
        Returns: boolean
      }
      list_groups_needing_platform_review: {
        Args: Record<string, never>
        Returns: { group_id: string; slug: string; name: string; reason: string; active_member_count: number }[]
      }
      platform_assign_group_owner: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_new_owner_profile_id: string; p_reason: string }
        Returns: Json
      }
      platform_archive_group: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_reason: string }
        Returns: Json
      }
      list_owned_active_groups: {
        Args: { p_profile_id: string }
        Returns: { group_id: string; slug: string; name: string }[]
      }
      community_group_shell_visible: {
        Args: { p_viewer_id: string; p_group_id: string }
        Returns: boolean
      }
      request_group_membership: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_message?: string | null }
        Returns: Json
      }
      decide_group_join_request: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_target_profile_id: string; p_approve: boolean }
        Returns: Json
      }
      invite_to_group: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_target_profile_id: string }
        Returns: Json
      }
      list_group_join_requests: {
        Args: { p_actor_profile_id: string; p_group_id: string }
        Returns: {
          profile_id: string
          username: string | null
          display_name: string | null
          avatar_url: string | null
          requested_at: string
          request_message: string | null
        }[]
      }
      list_my_group_invitations: {
        Args: { p_actor_profile_id: string }
        Returns: {
          group_id: string
          slug: string
          name: string
          description: string
          visibility: Database["public"]["Enums"]["community_group_visibility"]
          invited_by_label: string | null
          invited_at: string
        }[]
      }
      list_visible_group_ids: {
        Args: { p_viewer_id: string }
        Returns: { group_id: string }[]
      }
      community_group_role_of: {
        Args: { p_profile_id: string; p_group_id: string }
        Returns: Database["public"]["Enums"]["community_group_role"] | null
      }
      set_group_post_pinned: {
        Args: { p_actor_profile_id: string; p_post_id: string; p_pinned: boolean }
        Returns: Json
      }
      set_group_post_destination: {
        Args: { p_actor_profile_id: string; p_post_id: string; p_state: Database["public"]["Enums"]["community_group_post_status"]; p_reason?: string | null }
        Returns: Json
      }
      set_group_member_status: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_target_profile_id: string; p_status: Database["public"]["Enums"]["community_group_membership_status"]; p_reason?: string | null }
        Returns: Json
      }
      set_group_member_role: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_target_profile_id: string; p_role: Database["public"]["Enums"]["community_group_role"] }
        Returns: Json
      }
      transfer_group_ownership: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_new_owner_profile_id: string }
        Returns: Json
      }
      archive_group: {
        Args: { p_actor_profile_id: string; p_group_id: string; p_reason?: string | null }
        Returns: Json
      }
      join_curated_community_group: {
        Args: { p_actor_profile_id: string; p_group_id: string }
        Returns: boolean
      }
      leave_curated_community_group: {
        Args: { p_actor_profile_id: string; p_group_id: string }
        Returns: boolean
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
      read_technician_credential_evidence: {
        Args: {
          p_actor_profile_id: string
          p_credential_id: string
        }
        Returns: string
      }
      submit_technician_credential: {
        Args: {
          p_actor_profile_id: string
          p_credential_type: string
          p_credential_name: string
          p_issuer: string
          p_scope: string
          p_identifier_last4: string
          p_issued_on: string | null
          p_expires_on: string | null
          p_evidence_reference: string
          p_supersedes_id?: string | null
        }
        Returns: Database["public"]["Tables"]["technician_credentials"]["Row"]
      }
      review_technician_credential: {
        Args: {
          p_actor_profile_id: string
          p_credential_id: string
          p_decision: string
          p_verification_method: string
          p_reason: string
        }
        Returns: Database["public"]["Tables"]["technician_credentials"]["Row"]
      }
      revoke_technician_credential: {
        Args: {
          p_actor_profile_id: string
          p_credential_id: string
          p_reason: string
        }
        Returns: Database["public"]["Tables"]["technician_credentials"]["Row"]
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
      set_community_feed_mute: {
        Args: {
          p_actor_profile_id: string
          p_group_id?: string | null
          p_muted: boolean
          p_post_type?: Database["public"]["Enums"]["community_post_type"] | null
          p_scope: Database["public"]["Enums"]["community_feed_mute_scope"]
          p_vehicle_make?: string | null
          p_vehicle_model?: string | null
        }
        Returns: boolean
      }
      refresh_tech_review_aggregates: {
        Args: { p_tech_profile_id: string }
        Returns: undefined
      }
      discover_contact_profiles: {
        Args: { p_identifier_digests: string[]; p_viewer_profile_id: string }
        Returns: {
          avatar_url: string | null
          display_name: string | null
          is_public: boolean
          matched_digest: string
          mutual_friend_count: number
          profile_id: string
          relationship_state: string
          username: string | null
        }[]
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
      contact_identifier_kind: "email" | "phone"
      community_content_status: "active" | "hidden" | "archived"
      community_event_rsvp_status: "going" | "interested" | "not_going"
      community_event_status: "scheduled" | "cancelled" | "completed" | "removed"
      community_event_type: "car_meet" | "track_day" | "car_show" | "shop_event" | "group_drive"
      community_feed_filter: "all" | "friends" | "my_cars"
      community_feed_mute_scope: "group" | "post_type" | "vehicle_topic"
      community_group_join_policy: "open" | "request_approval" | "invite_only"
      community_group_membership_status: "active" | "left" | "removed" | "banned" | "requested" | "invited"
      community_group_post_status: "active" | "group_removed"
      community_group_role: "owner" | "admin" | "moderator" | "member"
      community_group_status: "active" | "archived"
      community_group_visibility: "public" | "private" | "unlisted"
      community_post_audience: "public" | "friends"
      community_post_assembly_state: "assembling" | "submitted" | "finalized"
      community_post_type: "general" | "question" | "build_update" | "maintenance" | "before_after" | "inspection_discussion" | "buying_advice" | "poll"
      community_question_outcome: "fixed" | "helped" | "not_fixed" | "still_diagnosing"
      community_media_type: "image" | "video"
      completion_state: "not_started" | "in_progress" | "completed"
      device_env: "prod" | "sandbox"
      device_platform: "ios" | "android"
      listing_status: "active" | "sold" | "archived" | "pending" | "paused" | "removed"
      media_type: "image" | "video"
      message_status: "unread" | "read" | "archived"
      notification_type:
        | "friend_request"
        | "friend_request_accepted"
        | "listing_inspection_requested"
        | "post_comment"
        | "post_likes"
        | "post_mention"
        | "group_post_removed"
        | "group_role_changed"
        | "group_invitation"
        | "group_join_request"
        | "group_join_decision"
        | "saved_listing_updated"
        | "saved_search_match"
        | "moderation_decision"
        | "moderation_case"
        | "report_received"
        | "answer_accepted"
        | "accepted_answer_unavailable"
        | "answer_helpful"
        | "tech_request_new"
        | "tech_request_accepted"
        | "inspection_submitted"
        | "inspection_updated"
        | "warranty_available"
        | "payment_completed"
        | "message_received"
        | "build_update"
        | "event_cancelled"
        | "event_update"
      saved_collection_entity_type: "post" | "listing" | "vehicle" | "build"
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
      vehicle_visibility: "public" | "friends" | "private"
      vehicle_configuration_type: "stock" | "modified" | "custom_build"
      vehicle_mileage_status: "actual" | "not_actual" | "unknown"
      vehicle_ownership_state: "owned" | "previously_owned" | "considering" | "project"
      vehicle_build_status: "planned" | "installed" | "removed" | "sold"
      vehicle_installation_kind: "unknown" | "self_installed" | "shop_installed"
      vehicle_fitment_confidence: "owner_reported" | "community_confirmed" | "manufacturer_verified"
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
      contact_identifier_kind: ["email", "phone"],
      community_content_status: ["active", "hidden", "archived"],
      community_event_rsvp_status: ["going", "interested", "not_going"],
      community_event_status: ["scheduled", "cancelled", "completed", "removed"],
      community_event_type: ["car_meet", "track_day", "car_show", "shop_event", "group_drive"],
      community_feed_filter: ["all", "friends", "my_cars"],
      community_feed_mute_scope: ["group", "post_type", "vehicle_topic"],
      community_post_audience: ["public", "friends"],
      community_post_assembly_state: ["assembling", "submitted", "finalized"],
      community_post_type: ["general", "question", "build_update", "maintenance", "before_after", "inspection_discussion", "buying_advice", "poll"],
      community_question_outcome: ["fixed", "helped", "not_fixed", "still_diagnosing"],
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
        "friend_request",
        "friend_request_accepted",
        "moderation_decision",
        "moderation_case",
        "report_received",
        "answer_accepted",
        "accepted_answer_unavailable",
        "answer_helpful",
        "post_comment",
        "post_likes",
        "post_mention",
        "group_post_removed",
        "group_role_changed",
        "group_invitation",
        "group_join_request",
        "group_join_decision",
        "saved_listing_updated",
        "build_update",
        "event_cancelled",
        "event_update",
      ],
      saved_collection_entity_type: ["post", "listing", "vehicle", "build"],
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
      vehicle_visibility: ["public", "friends", "private"],
      vehicle_configuration_type: ["stock", "modified", "custom_build"],
      vehicle_mileage_status: ["actual", "not_actual", "unknown"],
      vehicle_ownership_state: ["owned", "previously_owned", "considering", "project"],
      vehicle_build_status: ["planned", "installed", "removed", "sold"],
      vehicle_installation_kind: ["unknown", "self_installed", "shop_installed"],
      vehicle_fitment_confidence: ["owner_reported", "community_confirmed", "manufacturer_verified"],
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
