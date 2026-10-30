export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      lookup_items: {
        Row: {
          id: number
          kind: string
          name: string
          code: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          kind: string
          name: string
          code?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          kind?: string
          name?: string
          code?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transport_plans: {
        Row: {
          id: number
          tk_number: string
          tk_year: number
          tk_month: number
          tk_seq: number
          export_date: string | null
          transport_order_no: string | null
          transport_type_id: number | null
          vehicle_id: number | null
          driver_id: number | null
          fg_exporter_id: number | null
          note: string | null
          updated_by: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          tk_number: string
          tk_year: number
          tk_month: number
          tk_seq: number
          export_date?: string | null
          transport_order_no?: string | null
          transport_type_id?: number | null
          vehicle_id?: number | null
          driver_id?: number | null
          fg_exporter_id?: number | null
          note?: string | null
          updated_by?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          tk_number?: string
          tk_year?: number
          tk_month?: number
          tk_seq?: number
          export_date?: string | null
          transport_order_no?: string | null
          transport_type_id?: number | null
          vehicle_id?: number | null
          driver_id?: number | null
          fg_exporter_id?: number | null
          note?: string | null
          updated_by?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transport_plans_transport_type_id_fkey'
            columns: ['transport_type_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transport_plans_vehicle_id_fkey'
            columns: ['vehicle_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transport_plans_driver_id_fkey'
            columns: ['driver_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transport_plans_fg_exporter_id_fkey'
            columns: ['fg_exporter_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
        ]
      }
      transport_plan_material_exporters: {
        Row: {
          plan_id: number
          lookup_id: number
          sort_order: number
          created_at: string
        }
        Insert: {
          plan_id: number
          lookup_id: number
          sort_order?: number
          created_at?: string
        }
        Update: {
          plan_id?: number
          lookup_id?: number
          sort_order?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'tpme_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'transport_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tpme_lookup_id_fkey'
            columns: ['lookup_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
        ]
      }
      tk_reservations: {
        Row: {
          id: number
          tk_year: number
          tk_month: number
          tk_seq: number
          user_id: string
          expires_at: string
          created_at: string
          updated_at: string
        }
        // Chỉ select/delete dòng của mình; thêm/sửa qua RPC reserve_tk_number.
        Insert: {
          id?: number
          tk_year: number
          tk_month: number
          tk_seq: number
          user_id?: string
          expires_at: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          tk_year?: number
          tk_month?: number
          tk_seq?: number
          user_id?: string
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // D-019: chỉ select (của mình / admin); ghi qua RPC request_plan_edit, decide_edit_request.
      edit_requests: {
        Row: {
          id: number
          plan_id: number | null
          detail_id: number | null
          requested_by: string
          reason: string
          status: 'pending' | 'approved' | 'rejected'
          decided_by: string | null
          decided_at: string | null
          decision_note: string | null
          unlock_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: never
          plan_id?: number | null // đúng một trong plan_id / detail_id (check edit_requests_target_check)
          detail_id?: number | null
          requested_by: string
          reason: string
          status?: 'pending' | 'approved' | 'rejected'
          decided_by?: string | null
          decided_at?: string | null
          decision_note?: string | null
          unlock_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: never
          plan_id?: number | null
          detail_id?: number | null
          requested_by?: string
          reason?: string
          status?: 'pending' | 'approved' | 'rejected'
          decided_by?: string | null
          decided_at?: string | null
          decision_note?: string | null
          unlock_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'edit_requests_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'transport_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'edit_requests_detail_id_fkey'
            columns: ['detail_id']
            isOneToOne: false
            referencedRelation: 'inspection_details'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'edit_requests_requested_by_fkey'
            columns: ['requested_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'edit_requests_decided_by_fkey'
            columns: ['decided_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      inspection_details: {
        Row: {
          id: number
          plan_id: number | null
          tk_number: string | null
          import_ref: string | null
          export_date: string | null
          warehouse_slip_no: string | null
          construction_id: number | null
          delivery_unit_id: number | null
          receiving_unit_id: number | null
          export_type_id: number | null
          product_id: number | null
          unit_id: number | null
          carrier_id: number | null
          shipper_id: number | null
          work_item: string | null
          quantity: number | null
          total_weight_kg: number | null
          note: string | null
          updated_by: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          plan_id?: number | null
          tk_number?: string | null
          import_ref?: string | null
          export_date?: string | null
          warehouse_slip_no?: string | null
          construction_id?: number | null
          delivery_unit_id?: number | null
          receiving_unit_id?: number | null
          export_type_id?: number | null
          product_id?: number | null
          unit_id?: number | null
          carrier_id?: number | null
          shipper_id?: number | null
          work_item?: string | null
          quantity?: number | null
          total_weight_kg?: number | null
          note?: string | null
          updated_by?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          plan_id?: number | null
          tk_number?: string | null
          import_ref?: string | null
          export_date?: string | null
          warehouse_slip_no?: string | null
          construction_id?: number | null
          delivery_unit_id?: number | null
          receiving_unit_id?: number | null
          export_type_id?: number | null
          product_id?: number | null
          unit_id?: number | null
          carrier_id?: number | null
          shipper_id?: number | null
          work_item?: string | null
          quantity?: number | null
          total_weight_kg?: number | null
          note?: string | null
          updated_by?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'inspection_details_plan_id_fkey'
            columns: ['plan_id']
            isOneToOne: false
            referencedRelation: 'transport_plans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_construction_id_fkey'
            columns: ['construction_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_delivery_unit_id_fkey'
            columns: ['delivery_unit_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_receiving_unit_id_fkey'
            columns: ['receiving_unit_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_export_type_id_fkey'
            columns: ['export_type_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_unit_id_fkey'
            columns: ['unit_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_carrier_id_fkey'
            columns: ['carrier_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'inspection_details_shipper_id_fkey'
            columns: ['shipper_id']
            isOneToOne: false
            referencedRelation: 'lookup_items'
            referencedColumns: ['id']
          },
        ]
      }
      inspection_daily_stats: {
        Row: {
          id: number
          export_date: string | null
          export_type_id: number | null
          product_id: number | null
          row_count: number
          quantity_sum: number
          weight_kg_sum: number
          created_at: string
          updated_at: string
        }
        // Chỉ trigger ghi được (authenticated chỉ có quyền select).
        Insert: {
          id?: number
          export_date?: string | null
          export_type_id?: number | null
          product_id?: number | null
          row_count?: number
          quantity_sum?: number
          weight_kg_sum?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          export_date?: string | null
          export_type_id?: number | null
          product_id?: number | null
          row_count?: number
          quantity_sum?: number
          weight_kg_sum?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      // D-013: chỉ đọc từ FE; ghi qua Edge Function admin-users.
      profiles: {
        Row: {
          id: string
          username: string
          full_name: string
          role: 'admin' | 'user' | 'root'
          is_active: boolean
          is_pending: boolean
          created_by: string | null
          approved_by: string | null
          approved_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          username: string
          full_name: string
          role?: 'admin' | 'user' | 'root'
          is_active?: boolean
          is_pending?: boolean
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          username?: string
          full_name?: string
          role?: 'admin' | 'user' | 'root'
          is_active?: boolean
          is_pending?: boolean
          created_by?: string | null
          approved_by?: string | null
          approved_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      inspection_details_view: {
        Row: {
          id: number | null
          plan_id: number | null
          tk_number: string | null
          transport_order_no: string | null
          export_date: string | null
          warehouse_slip_no: string | null
          construction_id: number | null
          construction_code: string | null
          construction_name: string | null
          work_item: string | null
          delivery_unit_id: number | null
          delivery_unit_name: string | null
          receiving_unit_id: number | null
          receiving_unit_name: string | null
          export_type_id: number | null
          export_type_name: string | null
          product_id: number | null
          product_name: string | null
          unit_id: number | null
          unit_name: string | null
          quantity: number | null
          total_weight_kg: number | null
          shipper_name: string | null
          vehicle_name: string | null
          driver_name: string | null
          carrier_id: number | null
          carrier_name: string | null
          note: string | null
          created_at: string | null
          updated_at: string | null
          shipper_id: number | null
          plan_shipper_name: string | null
          created_by: string | null
          updated_by: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_transport_plan: {
        Args: {
          p_export_date: string | null
          p_transport_order_no: string | null
          p_transport_type_id: number | null
          p_vehicle_id: number | null
          p_driver_id: number | null
          p_fg_exporter_id: number | null
          p_material_exporter_ids: number[]
          p_note: string | null
        }
        Returns: Database['public']['Tables']['transport_plans']['Row']
      }
      list_inspection_details: {
        Args: {
          p_q?: string | null
          p_from?: string | null
          p_to?: string | null
          p_export_type_id?: number | null
          p_product_id?: number | null
          p_construction_id?: number | null
          p_receiving_unit_id?: number | null
          p_sort?: string
          p_desc?: boolean
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: number
          plan_id: number | null
          tk_number: string | null
          transport_order_no: string | null
          export_date: string | null
          warehouse_slip_no: string | null
          construction_id: number | null
          construction_code: string | null
          construction_name: string | null
          work_item: string | null
          delivery_unit_id: number | null
          delivery_unit_name: string | null
          receiving_unit_id: number | null
          receiving_unit_name: string | null
          export_type_id: number | null
          export_type_name: string | null
          product_id: number | null
          product_name: string | null
          unit_id: number | null
          unit_name: string | null
          quantity: number | null
          total_weight_kg: number | null
          shipper_name: string | null
          vehicle_name: string | null
          driver_name: string | null
          carrier_id: number | null
          carrier_name: string | null
          note: string | null
          created_at: string
          updated_at: string
          shipper_id: number | null
          plan_shipper_name: string | null
          created_by: string | null
          updated_by: string | null
          created_by_name: string | null
          created_by_username: string | null
          updated_by_name: string | null
          updated_by_username: string | null
        }[]
      }
      list_transport_plans: {
        Args: {
          p_q?: string | null
          p_from?: string | null
          p_to?: string | null
          p_sort?: string
          p_desc?: boolean
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          id: number
          tk_number: string
          tk_year: number
          tk_month: number
          tk_seq: number
          export_date: string | null
          transport_order_no: string | null
          transport_type_id: number | null
          transport_type_name: string | null
          vehicle_id: number | null
          vehicle_name: string | null
          driver_id: number | null
          driver_name: string | null
          fg_exporter_id: number | null
          fg_exporter_name: string | null
          material_exporters: { id: number; name: string; sort_order: number }[]
          note: string | null
          created_by: string | null
          created_by_name: string | null
          created_by_username: string | null
          created_at: string
          updated_by: string | null
          updated_by_name: string | null
          updated_by_username: string | null
          updated_at: string
        }[]
      }
      count_inspection_details: {
        Args: {
          p_q?: string | null
          p_from?: string | null
          p_to?: string | null
          p_export_type_id?: number | null
          p_product_id?: number | null
        }
        Returns: number
      }
      count_transport_plans: {
        Args: {
          p_q?: string | null
          p_from?: string | null
          p_to?: string | null
        }
        Returns: number
      }
      get_user_names: {
        Args: { p_ids: string[] }
        Returns: { id: string; full_name: string; username: string }[]
      }
      get_lookup_items: {
        Args: { p_ids: number[] }
        Returns: Database['public']['Tables']['lookup_items']['Row'][]
      }
      can_edit_row: {
        Args: { p_created_by: string | null; p_created_at: string | null }
        Returns: boolean
      }
      can_edit_plan: {
        Args: { p_plan_id: number }
        Returns: boolean
      }
      can_update_row: {
        Args: { p_created_by: string | null; p_created_at: string | null; p_plan_id: number | null; p_detail_id?: number | null }
        Returns: boolean
      }
      request_plan_edit: {
        Args: { p_plan_id: number; p_reason: string }
        Returns: number
      }
      request_detail_edit: {
        Args: { p_detail_id: number; p_reason: string }
        Returns: number
      }
      decide_edit_request: {
        Args: { p_id: number; p_approve: boolean; p_note?: string | null }
        Returns: undefined
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_root: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_active_user: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      inspection_stats: {
        Args: { p_from: string | null; p_to: string | null; p_group: 'export_type' | 'product' | 'month' }
        Returns: {
          key_id: number | null
          key_name: string | null
          row_count: number
          quantity_sum: number
          weight_kg_sum: number
        }[]
      }
      inspection_weight_total: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      search_lookup_items: {
        Args: { p_kind: string; p_q: string; p_limit?: number }
        Returns: Database['public']['Tables']['lookup_items']['Row'][]
      }
      search_plan_numbers: {
        Args: { p_q: string; p_limit?: number }
        Returns: { id: number; tk_number: string; export_date: string | null }[]
      }
      next_tk_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      reserve_tk_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      release_tk_reservation: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      tk_format: {
        Args: { p_year: number; p_month: number; p_seq: number }
        Returns: string
      }
      tk_next_seq: {
        Args: { p_year: number; p_month: number }
        Returns: number
      }
      update_transport_plan: {
        Args: {
          p_id: number
          p_export_date: string | null
          p_transport_order_no: string | null
          p_transport_type_id: number | null
          p_vehicle_id: number | null
          p_driver_id: number | null
          p_fg_exporter_id: number | null
          p_material_exporter_ids: number[]
          p_note: string | null
        }
        Returns: Database['public']['Tables']['transport_plans']['Row']
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']
