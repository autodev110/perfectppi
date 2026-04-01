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
    };
    Enums: {
      user_role: "consumer" | "technician" | "org_manager" | "admin";
      vehicle_visibility: "public" | "private";
      media_type: "image" | "video";
      certification_level: "none" | "ase" | "master" | "oem_qualified";
      org_member_role: "technician" | "manager";
    };
  };
}
