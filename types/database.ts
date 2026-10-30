export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: NonNullable<Json>;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: NonNullable<Json>;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          data: NonNullable<Json>;
          entity_id: string | null;
          entity_type: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
        };
        Relationships: [];
      };
      kyc_verifications: {
        Row: {
          created_at: string;
          doc_type: Database['public']['Enums']['kyc_doc_type'];
          id: string;
          id_hash: string;
          id_last4: string;
          provider: string;
          rejection_reason: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: Database['public']['Enums']['kyc_status'];
          storage_path: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          doc_type: Database['public']['Enums']['kyc_doc_type'];
          id?: string;
          id_hash: string;
          id_last4: string;
          provider?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['kyc_status'];
          storage_path: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          doc_type?: Database['public']['Enums']['kyc_doc_type'];
          id?: string;
          id_hash?: string;
          id_last4?: string;
          provider?: string;
          rejection_reason?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: Database['public']['Enums']['kyc_status'];
          storage_path?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'kyc_verifications_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'kyc_verifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      portfolio_items: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          kind: Database['public']['Enums']['portfolio_kind'];
          profile_id: string;
          sort_order: number;
          storage_path: string | null;
          title: string;
          updated_at: string;
          url: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind: Database['public']['Enums']['portfolio_kind'];
          profile_id: string;
          sort_order?: number;
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          url?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          kind?: Database['public']['Enums']['portfolio_kind'];
          profile_id?: string;
          sort_order?: number;
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'portfolio_items_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'portfolio_items_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_skills: {
        Row: {
          created_at: string;
          profile_id: string;
          skill_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          profile_id: string;
          skill_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          skill_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_skills_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_skills_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_skills_skill_id_fkey';
            columns: ['skill_id'];
            isOneToOne: false;
            referencedRelation: 'skills';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          availability: Database['public']['Enums']['availability_status'];
          avatar_path: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          email: string | null;
          email_verified: boolean;
          full_name: string | null;
          headline: string | null;
          hourly_rate_paise: number | null;
          id: string;
          is_flagged: boolean;
          kyc_verified: boolean;
          languages: string[];
          onboarding_completed_at: string | null;
          phone: string | null;
          phone_verified: boolean;
          portfolio_verified: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: Database['public']['Enums']['availability_status'];
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id: string;
          is_flagged?: boolean;
          kyc_verified?: boolean;
          languages?: string[];
          onboarding_completed_at?: string | null;
          phone?: string | null;
          phone_verified?: boolean;
          portfolio_verified?: boolean;
          updated_at?: string;
        };
        Update: {
          availability?: Database['public']['Enums']['availability_status'];
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string;
          email?: string | null;
          email_verified?: boolean;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string;
          is_flagged?: boolean;
          kyc_verified?: boolean;
          languages?: string[];
          onboarding_completed_at?: string | null;
          phone?: string | null;
          phone_verified?: boolean;
          portfolio_verified?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_tokens: {
        Row: {
          created_at: string;
          id: string;
          platform: string;
          token: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          platform: string;
          token: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          platform?: string;
          token?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      skills: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          role: Database['public']['Enums']['app_role'];
          user_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['public']['Enums']['app_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'public_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      public_profiles: {
        Row: {
          availability: Database['public']['Enums']['availability_status'];
          avatar_path: string | null;
          bio: string | null;
          city: string | null;
          created_at: string;
          email_verified: boolean;
          full_name: string | null;
          headline: string | null;
          hourly_rate_paise: number | null;
          id: string;
          kyc_verified: boolean;
          languages: string[];
          onboarding_completed_at: string | null;
          phone_verified: boolean;
          portfolio_verified: boolean;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          availability?: Database['public']['Enums']['availability_status'] | null;
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string | null;
          email_verified?: boolean | null;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string | null;
          kyc_verified?: boolean | null;
          languages?: string[] | null;
          onboarding_completed_at?: string | null;
          phone_verified?: boolean | null;
          portfolio_verified?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          availability?: Database['public']['Enums']['availability_status'] | null;
          avatar_path?: string | null;
          bio?: string | null;
          city?: string | null;
          created_at?: string | null;
          email_verified?: boolean | null;
          full_name?: string | null;
          headline?: string | null;
          hourly_rate_paise?: number | null;
          id?: string | null;
          kyc_verified?: boolean | null;
          languages?: string[] | null;
          onboarding_completed_at?: string | null;
          phone_verified?: boolean | null;
          portfolio_verified?: boolean | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      get_profile_private: {
        Args: { p_user_id?: string };
        Returns: Database['public']['CompositeTypes']['profile_private'][];
        SetofOptions: {
          from: '*';
          to: 'profile_private';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      has_role: { Args: { p_role: Database['public']['Enums']['app_role'] }; Returns: boolean };
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      my_roles: {
        Args: Record<PropertyKey, never>;
        Returns: Database['public']['Enums']['app_role'][];
      };
      rpc_admin_flag_user: {
        Args: { p_flagged: boolean; p_reason: string; p_user_id: string };
        Returns: undefined;
      };
      rpc_admin_review_kyc: {
        Args: { p_approve: boolean; p_kyc_id: string; p_reason?: string };
        Returns: Database['public']['Enums']['kyc_status'];
      };
      rpc_admin_set_role: {
        Args: {
          p_grant: boolean;
          p_role: Database['public']['Enums']['app_role'];
          p_user_id: string;
        };
        Returns: Database['public']['Enums']['app_role'][];
      };
      rpc_complete_onboarding: { Args: Record<PropertyKey, never>; Returns: string };
      rpc_register_push_token: { Args: { p_platform: string; p_token: string }; Returns: string };
      rpc_set_my_roles: {
        Args: { p_roles: Database['public']['Enums']['app_role'][] };
        Returns: Database['public']['Enums']['app_role'][];
      };
      rpc_unregister_push_token: { Args: { p_token: string }; Returns: boolean };
      text_array_items_between: {
        Args: { p_items: string[]; p_max: number; p_min: number };
        Returns: boolean;
      };
      write_audit: {
        Args: { p_action: string; p_data?: Json; p_entity_id: string; p_entity_type: string };
        Returns: string;
      };
    };
    Enums: {
      app_role: 'client' | 'freelancer' | 'admin';
      availability_status: 'available' | 'busy' | 'unavailable';
      kyc_doc_type: 'pan' | 'aadhaar';
      kyc_status: 'pending' | 'approved' | 'rejected';
      portfolio_kind: 'link' | 'file' | 'image';
    };
    CompositeTypes: {
      profile_private: {
        id: string | null;
        phone: string | null;
        email: string | null;
        is_flagged: boolean | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ['client', 'freelancer', 'admin'],
      availability_status: ['available', 'busy', 'unavailable'],
      kyc_doc_type: ['pan', 'aadhaar'],
      kyc_status: ['pending', 'approved', 'rejected'],
      portfolio_kind: ['link', 'file', 'image'],
    },
  },
} as const;
