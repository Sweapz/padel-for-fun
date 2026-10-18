export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      groups: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      match_confirmations: {
        Row: {
          group_id: string;
          match_id: string;
          next_match_id: string;
          request_id: string;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          match_id: string;
          next_match_id: string;
          request_id: string;
          session_id: string;
        };
        Update: {
          group_id?: string;
          match_id?: string;
          next_match_id?: string;
          request_id?: string;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_confirmations_group_id_request_id_fkey';
            columns: ['group_id', 'request_id'];
            isOneToOne: false;
            referencedRelation: 'operation_receipts';
            referencedColumns: ['group_id', 'request_id'];
          },
          {
            foreignKeyName: 'match_confirmations_group_id_session_id_match_id_fkey';
            columns: ['group_id', 'session_id', 'match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['group_id', 'session_id', 'id'];
          },
          {
            foreignKeyName: 'match_confirmations_group_id_session_id_next_match_id_fkey';
            columns: ['group_id', 'session_id', 'next_match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['group_id', 'session_id', 'id'];
          },
        ];
      };
      match_participants: {
        Row: {
          group_id: string;
          match_id: string;
          player_id: string;
          session_id: string;
          slot: string;
        };
        ComputedFields: never;
        Insert: {
          group_id: string;
          match_id: string;
          player_id: string;
          session_id: string;
          slot: string;
        };
        Update: {
          group_id?: string;
          match_id?: string;
          player_id?: string;
          session_id?: string;
          slot?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_participants_group_id_session_id_match_id_fkey';
            columns: ['group_id', 'session_id', 'match_id'];
            isOneToOne: false;
            referencedRelation: 'matches';
            referencedColumns: ['group_id', 'session_id', 'id'];
          },
          {
            foreignKeyName: 'match_participants_group_id_session_id_player_id_fkey';
            columns: ['group_id', 'session_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'session_players';
            referencedColumns: ['group_id', 'session_id', 'player_id'];
          },
        ];
      };
      matches: {
        Row: {
          cancelled_at: string | null;
          confirmed_at: string | null;
          confirmed_by: string | null;
          group_id: string;
          id: string;
          match_points: number;
          published_at: string;
          scheduler_version: string;
          score_a: number | null;
          score_b: number | null;
          sequence: number;
          session_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          cancelled_at?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          group_id: string;
          id?: string;
          match_points?: number;
          published_at?: string;
          scheduler_version?: string;
          score_a?: number | null;
          score_b?: number | null;
          sequence: number;
          session_id: string;
          status?: string;
        };
        Update: {
          cancelled_at?: string | null;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          group_id?: string;
          id?: string;
          match_points?: number;
          published_at?: string;
          scheduler_version?: string;
          score_a?: number | null;
          score_b?: number | null;
          sequence?: number;
          session_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'matches_group_id_session_id_match_points_fkey';
            columns: ['group_id', 'session_id', 'match_points'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['group_id', 'id', 'match_points'];
          },
        ];
      };
      memberships: {
        Row: {
          created_at: string;
          group_id: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          group_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      operation_receipts: {
        Row: {
          actor_id: string;
          created_at: string;
          group_id: string;
          kind: string;
          payload: NonNullable<Json>;
          request_id: string;
          response: NonNullable<Json>;
        };
        ComputedFields: never;
        Insert: {
          actor_id: string;
          created_at?: string;
          group_id: string;
          kind: string;
          payload: NonNullable<Json>;
          request_id: string;
          response: NonNullable<Json>;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          group_id?: string;
          kind?: string;
          payload?: NonNullable<Json>;
          request_id?: string;
          response?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: 'operation_receipts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      players: {
        Row: {
          archived_at: string | null;
          created_at: string;
          group_id: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          name: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'players_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
      session_players: {
        Row: {
          display_name_snapshot: string;
          group_id: string;
          is_active: boolean;
          player_id: string;
          roster_order: number;
          session_id: string;
        };
        ComputedFields: never;
        Insert: {
          display_name_snapshot: string;
          group_id: string;
          is_active?: boolean;
          player_id: string;
          roster_order: number;
          session_id: string;
        };
        Update: {
          display_name_snapshot?: string;
          group_id?: string;
          is_active?: boolean;
          player_id?: string;
          roster_order?: number;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'session_players_group_id_player_id_fkey';
            columns: ['group_id', 'player_id'];
            isOneToOne: false;
            referencedRelation: 'players';
            referencedColumns: ['group_id', 'id'];
          },
          {
            foreignKeyName: 'session_players_group_id_session_id_fkey';
            columns: ['group_id', 'session_id'];
            isOneToOne: false;
            referencedRelation: 'sessions';
            referencedColumns: ['group_id', 'id'];
          },
        ];
      };
      sessions: {
        Row: {
          court_count: number;
          created_at: string;
          ended_at: string | null;
          group_id: string;
          id: string;
          match_points: number;
          revision: number;
          rules_version: string;
          scheduler_version: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          court_count?: number;
          created_at?: string;
          ended_at?: string | null;
          group_id: string;
          id?: string;
          match_points?: number;
          revision?: number;
          rules_version?: string;
          scheduler_version?: string;
          status?: string;
        };
        Update: {
          court_count?: number;
          created_at?: string;
          ended_at?: string | null;
          group_id?: string;
          id?: string;
          match_points?: number;
          revision?: number;
          rules_version?: string;
          scheduler_version?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'groups';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      commit_match_result: {
        Args: {
          p_actor_id: string;
          p_assignment: Json;
          p_expected_revision: number;
          p_match_id: string;
          p_request_id: string;
          p_scheduler_version?: string;
          p_score_a: number;
          p_score_b: number;
          p_session_id: string;
        };
        Returns: Json;
      };
      create_player: {
        Args: { p_group_id: string; p_name: string };
        Returns: {
          archived_at: string | null;
          created_at: string;
          group_id: string;
          id: string;
          name: string;
        };
        SetofOptions: {
          from: '*';
          to: 'players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_session: {
        Args: {
          p_actor_id: string;
          p_assignment: Json;
          p_group_id: string;
          p_player_ids: string[];
          p_request_id: string;
          p_scheduler_version?: string;
        };
        Returns: Json;
      };
      end_session: { Args: { p_request_id: string; p_session_id: string }; Returns: Json };
      get_session_snapshot: { Args: { p_session_id: string }; Returns: Json };
      update_player: {
        Args: { p_archive?: boolean; p_name: string; p_player_id: string };
        Returns: {
          archived_at: string | null;
          created_at: string;
          group_id: string;
          id: string;
          name: string;
        };
        SetofOptions: {
          from: '*';
          to: 'players';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
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
    Enums: {},
  },
} as const;
