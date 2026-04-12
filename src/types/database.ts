// ============================================================================
// Supabase generated types placeholder
// Run: supabase gen types typescript --local > src/types/database.ts
// This file will be overwritten by the generated types.
// ============================================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12 | 13";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          auth_user_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: "consumer" | "technician" | "org_manager" | "admin";
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: "consumer" | "technician" | "org_manager" | "admin";
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_user_id?: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: "consumer" | "technician" | "org_manager" | "admin";
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      vehicles: {
        Row: {
          id: string;
          owner_id: string;
          vin: string | null;
          year: number | null;
          make: string | null;
          model: string | null;
          trim: string | null;
          mileage: number | null;
          visibility: "public" | "private";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          vin?: string | null;
          year?: number | null;
          make?: string | null;
          model?: string | null;
          trim?: string | null;
          mileage?: number | null;
          visibility?: "public" | "private";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          vin?: string | null;
          year?: number | null;
          make?: string | null;
          model?: string | null;
          trim?: string | null;
          mileage?: number | null;
          visibility?: "public" | "private";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicles_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      vehicle_media: {
        Row: {
          id: string;
          vehicle_id: string;
          url: string;
          media_type: "image" | "video";
          is_primary: boolean;
          sort_order: number;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          url: string;
          media_type?: "image" | "video";
          is_primary?: boolean;
          sort_order?: number;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string;
          url?: string;
          media_type?: "image" | "video";
          is_primary?: boolean;
          sort_order?: number;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vehicle_media_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          }
        ];
      };
      marketplace_listings: {
        Row: {
          id: string;
          vehicle_id: string;
          seller_id: string;
          title: string;
          description: string | null;
          asking_price_cents: number;
          location: string | null;
          status: "active" | "sold" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          seller_id: string;
          title: string;
          description?: string | null;
          asking_price_cents: number;
          location?: string | null;
          status?: "active" | "sold" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string;
          seller_id?: string;
          title?: string;
          description?: string | null;
          asking_price_cents?: number;
          location?: string | null;
          status?: "active" | "sold" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "marketplace_listings_seller_id_fkey";
            columns: ["seller_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      community_posts: {
        Row: {
          id: string;
          author_id: string;
          vehicle_id: string | null;
          marketplace_listing_id: string | null;
          content: string;
          status: "active" | "hidden" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          author_id: string;
          vehicle_id?: string | null;
          marketplace_listing_id?: string | null;
          content: string;
          status?: "active" | "hidden" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          author_id?: string;
          vehicle_id?: string | null;
          marketplace_listing_id?: string | null;
          content?: string;
          status?: "active" | "hidden" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_posts_marketplace_listing_id_fkey";
            columns: ["marketplace_listing_id"];
            isOneToOne: false;
            referencedRelation: "marketplace_listings";
            referencedColumns: ["id"];
          }
        ];
      };
      community_comments: {
        Row: {
          id: string;
          post_id: string;
          author_id: string;
          content: string;
          status: "active" | "hidden" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          post_id: string;
          author_id: string;
          content: string;
          status?: "active" | "hidden" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          post_id?: string;
          author_id?: string;
          content?: string;
          status?: "active" | "hidden" | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "community_posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_comments_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      ppi_requests: {
        Row: {
          id: string;
          vehicle_id: string;
          requester_id: string;
          assigned_tech_id: string | null;
          whose_car: "own" | "other";
          requester_role: "buying" | "selling" | "documenting";
          performer_type: "self" | "technician";
          ppi_type: "personal" | "general_tech" | "certified_tech";
          status:
            | "draft"
            | "pending_assignment"
            | "assigned"
            | "accepted"
            | "in_progress"
            | "submitted"
            | "needs_revision"
            | "completed"
            | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vehicle_id: string;
          requester_id: string;
          assigned_tech_id?: string | null;
          whose_car: "own" | "other";
          requester_role: "buying" | "selling" | "documenting";
          performer_type: "self" | "technician";
          ppi_type?: "personal" | "general_tech" | "certified_tech";
          status?:
            | "draft"
            | "pending_assignment"
            | "assigned"
            | "accepted"
            | "in_progress"
            | "submitted"
            | "needs_revision"
            | "completed"
            | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vehicle_id?: string;
          requester_id?: string;
          assigned_tech_id?: string | null;
          whose_car?: "own" | "other";
          requester_role?: "buying" | "selling" | "documenting";
          performer_type?: "self" | "technician";
          ppi_type?: "personal" | "general_tech" | "certified_tech";
          status?:
            | "draft"
            | "pending_assignment"
            | "assigned"
            | "accepted"
            | "in_progress"
            | "submitted"
            | "needs_revision"
            | "completed"
            | "archived";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppi_requests_vehicle_id_fkey";
            columns: ["vehicle_id"];
            isOneToOne: false;
            referencedRelation: "vehicles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ppi_requests_requester_id_fkey";
            columns: ["requester_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ppi_requests_assigned_tech_id_fkey";
            columns: ["assigned_tech_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      technician_profiles: {
        Row: {
          id: string;
          profile_id: string;
          organization_id: string | null;
          certification_level: "none" | "ase" | "master" | "oem_qualified";
          specialties: string[];
          is_independent: boolean;
          total_inspections: number;
          avg_rating: number;
          total_reviews: number;
          reputation_score: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          organization_id?: string | null;
          certification_level?: "none" | "ase" | "master" | "oem_qualified";
          specialties?: string[];
          is_independent?: boolean;
          total_inspections?: number;
          avg_rating?: number;
          total_reviews?: number;
          reputation_score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          profile_id?: string;
          organization_id?: string | null;
          certification_level?: "none" | "ase" | "master" | "oem_qualified";
          specialties?: string[];
          is_independent?: boolean;
          total_inspections?: number;
          avg_rating?: number;
          total_reviews?: number;
          reputation_score?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technician_profiles_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "technician_profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      technician_reviews: {
        Row: {
          id: string;
          technician_profile_id: string;
          reviewer_id: string;
          ppi_request_id: string;
          rating: number;
          title: string | null;
          content: string | null;
          status: "active" | "hidden";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          technician_profile_id: string;
          reviewer_id: string;
          ppi_request_id: string;
          rating: number;
          title?: string | null;
          content?: string | null;
          status?: "active" | "hidden";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          technician_profile_id?: string;
          reviewer_id?: string;
          ppi_request_id?: string;
          rating?: number;
          title?: string | null;
          content?: string | null;
          status?: "active" | "hidden";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "technician_reviews_technician_profile_id_fkey";
            columns: ["technician_profile_id"];
            isOneToOne: false;
            referencedRelation: "technician_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "technician_reviews_reviewer_id_fkey";
            columns: ["reviewer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "technician_reviews_ppi_request_id_fkey";
            columns: ["ppi_request_id"];
            isOneToOne: false;
            referencedRelation: "ppi_requests";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type:
            | "tech_request_new"
            | "tech_request_accepted"
            | "inspection_submitted"
            | "inspection_updated"
            | "warranty_available"
            | "payment_completed"
            | "message_received";
          title: string;
          body: string;
          data: Json;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type:
            | "tech_request_new"
            | "tech_request_accepted"
            | "inspection_submitted"
            | "inspection_updated"
            | "warranty_available"
            | "payment_completed"
            | "message_received";
          title: string;
          body: string;
          data?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?:
            | "tech_request_new"
            | "tech_request_accepted"
            | "inspection_submitted"
            | "inspection_updated"
            | "warranty_available"
            | "payment_completed"
            | "message_received";
          title?: string;
          body?: string;
          data?: Json;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      conversations: {
        Row: {
          id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          profile_id: string;
        };
        Insert: {
          conversation_id: string;
          profile_id: string;
        };
        Update: {
          conversation_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          has_attachment: boolean;
          attachment_url: string | null;
          attachment_type: string | null;
          status: "unread" | "read" | "archived";
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          has_attachment?: boolean;
          attachment_url?: string | null;
          attachment_type?: string | null;
          status?: "unread" | "read" | "archived";
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          content?: string;
          has_attachment?: boolean;
          attachment_url?: string | null;
          attachment_type?: string | null;
          status?: "unread" | "read" | "archived";
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      media_packages: {
        Row: {
          id: string;
          creator_id: string;
          title: string;
          description: string | null;
          ppi_submission_id: string | null;
          items: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          title: string;
          description?: string | null;
          ppi_submission_id?: string | null;
          items?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          title?: string;
          description?: string | null;
          ppi_submission_id?: string | null;
          items?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "media_packages_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "media_packages_ppi_submission_id_fkey";
            columns: ["ppi_submission_id"];
            isOneToOne: false;
            referencedRelation: "ppi_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      share_links: {
        Row: {
          id: string;
          media_package_id: string | null;
          ppi_submission_id: string | null;
          standardized_output_id: string | null;
          token: string;
          target_type: "media_package" | "inspection_result" | "standardized_output";
          expires_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          media_package_id?: string | null;
          ppi_submission_id?: string | null;
          standardized_output_id?: string | null;
          token?: string;
          target_type: "media_package" | "inspection_result" | "standardized_output";
          expires_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          media_package_id?: string | null;
          ppi_submission_id?: string | null;
          standardized_output_id?: string | null;
          token?: string;
          target_type?: "media_package" | "inspection_result" | "standardized_output";
          expires_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "share_links_media_package_id_fkey";
            columns: ["media_package_id"];
            isOneToOne: false;
            referencedRelation: "media_packages";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_links_ppi_submission_id_fkey";
            columns: ["ppi_submission_id"];
            isOneToOne: false;
            referencedRelation: "ppi_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_links_standardized_output_id_fkey";
            columns: ["standardized_output_id"];
            isOneToOne: false;
            referencedRelation: "standardized_outputs";
            referencedColumns: ["id"];
          }
        ];
      };
      organization_memberships: {
        Row: {
          id: string;
          technician_profile_id: string;
          organization_id: string;
          role: "technician" | "manager";
          joined_at: string;
        };
        Insert: {
          id?: string;
          technician_profile_id: string;
          organization_id: string;
          role?: "technician" | "manager";
          joined_at?: string;
        };
        Update: {
          id?: string;
          technician_profile_id?: string;
          organization_id?: string;
          role?: "technician" | "manager";
          joined_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_memberships_technician_profile_id_fkey";
            columns: ["technician_profile_id"];
            isOneToOne: false;
            referencedRelation: "technician_profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_memberships_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      ppi_submissions: {
        Row: {
          id: string;
          ppi_request_id: string;
          performer_id: string;
          version: number;
          is_current: boolean;
          status: "draft" | "in_progress" | "submitted" | "completed";
          submitted_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          ppi_request_id: string;
          performer_id: string;
          version?: number;
          is_current?: boolean;
          status?: "draft" | "in_progress" | "submitted" | "completed";
          submitted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          ppi_request_id?: string;
          performer_id?: string;
          version?: number;
          is_current?: boolean;
          status?: "draft" | "in_progress" | "submitted" | "completed";
          submitted_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppi_submissions_ppi_request_id_fkey";
            columns: ["ppi_request_id"];
            isOneToOne: false;
            referencedRelation: "ppi_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ppi_submissions_performer_id_fkey";
            columns: ["performer_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      ppi_sections: {
        Row: {
          id: string;
          ppi_submission_id: string;
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
            | "modifications";
          completion_state: "not_started" | "in_progress" | "completed";
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ppi_submission_id: string;
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
            | "modifications";
          completion_state?: "not_started" | "in_progress" | "completed";
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ppi_submission_id?: string;
          section_type?:
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
            | "modifications";
          completion_state?: "not_started" | "in_progress" | "completed";
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppi_sections_ppi_submission_id_fkey";
            columns: ["ppi_submission_id"];
            isOneToOne: false;
            referencedRelation: "ppi_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      ppi_answers: {
        Row: {
          id: string;
          ppi_section_id: string;
          prompt: string;
          answer_type: "text" | "yes_no" | "select" | "number";
          answer_value: string | null;
          options: Json | null;
          is_required: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ppi_section_id: string;
          prompt: string;
          answer_type?: "text" | "yes_no" | "select" | "number";
          answer_value?: string | null;
          options?: Json | null;
          is_required?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ppi_section_id?: string;
          prompt?: string;
          answer_type?: "text" | "yes_no" | "select" | "number";
          answer_value?: string | null;
          options?: Json | null;
          is_required?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppi_answers_ppi_section_id_fkey";
            columns: ["ppi_section_id"];
            isOneToOne: false;
            referencedRelation: "ppi_sections";
            referencedColumns: ["id"];
          }
        ];
      };
      standardized_outputs: {
        Row: {
          id: string;
          ppi_submission_id: string;
          version: number;
          document_url: string | null;
          structured_content: Json;
          generated_at: string;
        };
        Insert: {
          id?: string;
          ppi_submission_id: string;
          version?: number;
          document_url?: string | null;
          structured_content?: Json;
          generated_at?: string;
        };
        Update: {
          id?: string;
          ppi_submission_id?: string;
          version?: number;
          document_url?: string | null;
          structured_content?: Json;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "standardized_outputs_ppi_submission_id_fkey";
            columns: ["ppi_submission_id"];
            isOneToOne: false;
            referencedRelation: "ppi_submissions";
            referencedColumns: ["id"];
          }
        ];
      };
      vsc_outputs: {
        Row: {
          id: string;
          ppi_submission_id: string;
          standardized_output_id: string;
          version: number;
          document_url: string | null;
          coverage_data: Json;
          generated_at: string;
        };
        Insert: {
          id?: string;
          ppi_submission_id: string;
          standardized_output_id: string;
          version?: number;
          document_url?: string | null;
          coverage_data?: Json;
          generated_at?: string;
        };
        Update: {
          id?: string;
          ppi_submission_id?: string;
          standardized_output_id?: string;
          version?: number;
          document_url?: string | null;
          coverage_data?: Json;
          generated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "vsc_outputs_ppi_submission_id_fkey";
            columns: ["ppi_submission_id"];
            isOneToOne: false;
            referencedRelation: "ppi_submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "vsc_outputs_standardized_output_id_fkey";
            columns: ["standardized_output_id"];
            isOneToOne: false;
            referencedRelation: "standardized_outputs";
            referencedColumns: ["id"];
          }
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string;
          action:
            | "inspection_edited"
            | "output_regenerated"
            | "contract_state_changed"
            | "payment_state_changed"
            | "submission_resubmitted";
          target_type: string;
          target_id: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id: string;
          action:
            | "inspection_edited"
            | "output_regenerated"
            | "contract_state_changed"
            | "payment_state_changed"
            | "submission_resubmitted";
          target_type: string;
          target_id: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_id?: string;
          action?:
            | "inspection_edited"
            | "output_regenerated"
            | "contract_state_changed"
            | "payment_state_changed"
            | "submission_resubmitted";
          target_type?: string;
          target_id?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      ppi_media: {
        Row: {
          id: string;
          ppi_section_id: string;
          ppi_answer_id: string | null;
          url: string;
          media_type: string;
          caption: string | null;
          captured_at: string | null;
          metadata: Json | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          ppi_section_id: string;
          ppi_answer_id?: string | null;
          url: string;
          media_type: string;
          caption?: string | null;
          captured_at?: string | null;
          metadata?: Json | null;
          uploaded_at?: string;
        };
        Update: {
          id?: string;
          ppi_section_id?: string;
          ppi_answer_id?: string | null;
          url?: string;
          media_type?: string;
          caption?: string | null;
          captured_at?: string | null;
          metadata?: Json | null;
          uploaded_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ppi_media_ppi_section_id_fkey";
            columns: ["ppi_section_id"];
            isOneToOne: false;
            referencedRelation: "ppi_sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ppi_media_ppi_answer_id_fkey";
            columns: ["ppi_answer_id"];
            isOneToOne: false;
            referencedRelation: "ppi_answers";
            referencedColumns: ["id"];
          }
        ];
      };
      warranty_options: {
        Row: {
          id: string;
          vsc_output_id: string;
          vehicle_id: string;
          user_id: string;
          plans: Json;
          status: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          offered_at: string | null;
          viewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vsc_output_id: string;
          vehicle_id: string;
          user_id: string;
          plans?: Json;
          status?: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          offered_at?: string | null;
          viewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          vsc_output_id?: string;
          vehicle_id?: string;
          user_id?: string;
          plans?: Json;
          status?: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          offered_at?: string | null;
          viewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      warranty_orders: {
        Row: {
          id: string;
          warranty_option_id: string;
          plan_name: string;
          term_years: number;
          term_miles: number | null;
          price_cents: number;
          status: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          selected_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          warranty_option_id: string;
          plan_name: string;
          term_years: number;
          term_miles?: number | null;
          price_cents: number;
          status?: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          selected_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          warranty_option_id?: string;
          plan_name?: string;
          term_years?: number;
          term_miles?: number | null;
          price_cents?: number;
          status?: "not_offered" | "offered" | "viewed" | "selected" | "contract_pending" | "signed" | "payment_pending" | "paid" | "failed" | "cancelled";
          selected_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      contracts: {
        Row: {
          id: string;
          warranty_order_id: string;
          document_url: string | null;
          docuseal_id: string | null;
          docuseal_submitter_slug: string | null;
          presented_at: string;
          signed_at: string | null;
          signer_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          warranty_order_id: string;
          document_url?: string | null;
          docuseal_id?: string | null;
          docuseal_submitter_slug?: string | null;
          presented_at?: string;
          signed_at?: string | null;
          signer_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          warranty_order_id?: string;
          document_url?: string | null;
          docuseal_id?: string | null;
          docuseal_submitter_slug?: string | null;
          presented_at?: string;
          signed_at?: string | null;
          signer_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          contract_id: string;
          user_id: string;
          amount_cents: number;
          method: "card" | "bank_transfer" | "financing";
          stripe_payment_id: string | null;
          status: "pending" | "completed" | "failed" | "refunded";
          receipt_url: string | null;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          contract_id: string;
          user_id: string;
          amount_cents: number;
          method?: "card" | "bank_transfer" | "financing";
          stripe_payment_id?: string | null;
          status?: "pending" | "completed" | "failed" | "refunded";
          receipt_url?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          contract_id?: string;
          user_id?: string;
          amount_cents?: number;
          method?: "card" | "bank_transfer" | "financing";
          stripe_payment_id?: string | null;
          status?: "pending" | "completed" | "failed" | "refunded";
          receipt_url?: string | null;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_my_role: {
        Args: Record<string, never>;
        Returns: "consumer" | "technician" | "org_manager" | "admin";
      };
      get_my_profile_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_org_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      can_access_submission: {
        Args: { submission_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: "consumer" | "technician" | "org_manager" | "admin";
      vehicle_visibility: "public" | "private";
      media_type: "image" | "video";
      listing_status: "active" | "sold" | "archived";
      community_content_status: "active" | "hidden" | "archived";
      ppi_request_status:
        | "draft"
        | "pending_assignment"
        | "assigned"
        | "accepted"
        | "in_progress"
        | "submitted"
        | "needs_revision"
        | "completed"
        | "archived";
      ppi_type: "personal" | "general_tech" | "certified_tech";
      performer_type: "self" | "technician";
      whose_car: "own" | "other";
      requester_role: "buying" | "selling" | "documenting";
      certification_level: "none" | "ase" | "master" | "oem_qualified";
      review_status: "active" | "hidden";
      org_member_role: "technician" | "manager";
      submission_status: "draft" | "in_progress" | "submitted" | "completed";
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
        | "modifications";
      completion_state: "not_started" | "in_progress" | "completed";
      answer_type: "text" | "yes_no" | "select" | "number";
      audit_action:
        | "inspection_edited"
        | "output_regenerated"
        | "contract_state_changed"
        | "payment_state_changed"
        | "submission_resubmitted";
      notification_type:
        | "tech_request_new"
        | "tech_request_accepted"
        | "inspection_submitted"
        | "inspection_updated"
        | "warranty_available"
        | "payment_completed"
        | "message_received";
      message_status: "unread" | "read" | "archived";
      share_target_type:
        | "media_package"
        | "inspection_result"
        | "standardized_output";
    };
  };
}
