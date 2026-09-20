export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auditoria: {
        Row: {
          accion: string
          actor: string
          clinica_id: string
          creado_en: string
          datos: Json | null
          fila_id: string | null
          id: number
          tabla: string
        }
        Insert: {
          accion: string
          actor: string
          clinica_id: string
          creado_en?: string
          datos?: Json | null
          fila_id?: string | null
          id?: never
          tabla: string
        }
        Update: {
          accion?: string
          actor?: string
          clinica_id?: string
          creado_en?: string
          datos?: Json | null
          fila_id?: string | null
          id?: never
          tabla?: string
        }
        Relationships: [
          {
            foreignKeyName: "auditoria_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      bloques_prompt: {
        Row: {
          activo: boolean
          actualizado_en: string
          clinica_id: string
          contenido: string
          id: string
          orden: number
          titulo: string
          version: number
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          clinica_id: string
          contenido: string
          id?: string
          orden: number
          titulo: string
          version?: number
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          clinica_id?: string
          contenido?: string
          id?: string
          orden?: number
          titulo?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bloques_prompt_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      citas: {
        Row: {
          actualizada_en: string
          clinica_id: string
          conversacion_id: string | null
          creada_en: string
          estado: Database["public"]["Enums"]["estado_cita"]
          expira_en: string | null
          fin: string
          gabinete_id: string
          id: string
          inicio: string
          motivo_cerrado: Database["public"]["Enums"]["motivo_visita"]
          paciente_id: string
          quien_reserva: Database["public"]["Enums"]["quien_reserva"]
          tratamiento_id: string
        }
        Insert: {
          actualizada_en?: string
          clinica_id: string
          conversacion_id?: string | null
          creada_en?: string
          estado?: Database["public"]["Enums"]["estado_cita"]
          expira_en?: string | null
          fin: string
          gabinete_id: string
          id?: string
          inicio: string
          motivo_cerrado?: Database["public"]["Enums"]["motivo_visita"]
          paciente_id: string
          quien_reserva?: Database["public"]["Enums"]["quien_reserva"]
          tratamiento_id: string
        }
        Update: {
          actualizada_en?: string
          clinica_id?: string
          conversacion_id?: string | null
          creada_en?: string
          estado?: Database["public"]["Enums"]["estado_cita"]
          expira_en?: string | null
          fin?: string
          gabinete_id?: string
          id?: string
          inicio?: string
          motivo_cerrado?: Database["public"]["Enums"]["motivo_visita"]
          paciente_id?: string
          quien_reserva?: Database["public"]["Enums"]["quien_reserva"]
          tratamiento_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "citas_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "citas_conversacion_id_clinica_fkey"
            columns: ["conversacion_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id", "clinica_id"]
          },
          {
            foreignKeyName: "citas_gabinete_id_clinica_fkey"
            columns: ["gabinete_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "gabinetes"
            referencedColumns: ["id", "clinica_id"]
          },
          {
            foreignKeyName: "citas_paciente_id_clinica_fkey"
            columns: ["paciente_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id", "clinica_id"]
          },
          {
            foreignKeyName: "citas_tratamiento_id_clinica_fkey"
            columns: ["tratamiento_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "tratamientos"
            referencedColumns: ["id", "clinica_id"]
          },
        ]
      }
      clinicas: {
        Row: {
          activa: boolean
          creada_en: string
          dias_maximos_antelacion: number
          email_avisos: string
          id: string
          nombre: string
          nombre_bot: string
          paso_minutos: number
          slug: string
          telefono_recepcion: string
          trato: Database["public"]["Enums"]["trato"]
          wa_phone_number_id: string | null
          wa_waba_id: string | null
          zona_horaria: string
        }
        Insert: {
          activa?: boolean
          creada_en?: string
          dias_maximos_antelacion?: number
          email_avisos: string
          id?: string
          nombre: string
          nombre_bot?: string
          paso_minutos?: number
          slug: string
          telefono_recepcion: string
          trato?: Database["public"]["Enums"]["trato"]
          wa_phone_number_id?: string | null
          wa_waba_id?: string | null
          zona_horaria?: string
        }
        Update: {
          activa?: boolean
          creada_en?: string
          dias_maximos_antelacion?: number
          email_avisos?: string
          id?: string
          nombre?: string
          nombre_bot?: string
          paso_minutos?: number
          slug?: string
          telefono_recepcion?: string
          trato?: Database["public"]["Enums"]["trato"]
          wa_phone_number_id?: string | null
          wa_waba_id?: string | null
          zona_horaria?: string
        }
        Relationships: []
      }
      config: {
        Row: {
          actualizado_en: string
          clave: string
          clinica_id: string
          comentario: string | null
          id: string
          publico: boolean
          valor: string
        }
        Insert: {
          actualizado_en?: string
          clave: string
          clinica_id: string
          comentario?: string | null
          id?: string
          publico?: boolean
          valor: string
        }
        Update: {
          actualizado_en?: string
          clave?: string
          clinica_id?: string
          comentario?: string | null
          id?: string
          publico?: boolean
          valor?: string
        }
        Relationships: [
          {
            foreignKeyName: "config_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversaciones: {
        Row: {
          clinica_id: string
          estado: Database["public"]["Enums"]["estado_conversacion"]
          id: string
          iniciada_en: string
          paciente_id: string | null
          requiere_humano: boolean
          telefono_e164: string
          ultima_actividad: string
          ventana_24h_expira: string | null
        }
        Insert: {
          clinica_id: string
          estado?: Database["public"]["Enums"]["estado_conversacion"]
          id?: string
          iniciada_en?: string
          paciente_id?: string | null
          requiere_humano?: boolean
          telefono_e164: string
          ultima_actividad?: string
          ventana_24h_expira?: string | null
        }
        Update: {
          clinica_id?: string
          estado?: Database["public"]["Enums"]["estado_conversacion"]
          id?: string
          iniciada_en?: string
          paciente_id?: string | null
          requiere_humano?: boolean
          telefono_e164?: string
          ultima_actividad?: string
          ventana_24h_expira?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversaciones_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversaciones_paciente_id_clinica_fkey"
            columns: ["paciente_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "pacientes"
            referencedColumns: ["id", "clinica_id"]
          },
        ]
      }
      escalados: {
        Row: {
          asunto: Database["public"]["Enums"]["motivo_visita"]
          clinica_id: string
          conversacion_id: string | null
          creado_en: string
          estado: Database["public"]["Enums"]["estado_escalado"]
          id: string
          mensaje_id: number | null
          motivo: Database["public"]["Enums"]["motivo_escalado"]
          resuelto_en: string | null
          resuelto_por: string | null
        }
        Insert: {
          asunto?: Database["public"]["Enums"]["motivo_visita"]
          clinica_id: string
          conversacion_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_escalado"]
          id?: string
          mensaje_id?: number | null
          motivo: Database["public"]["Enums"]["motivo_escalado"]
          resuelto_en?: string | null
          resuelto_por?: string | null
        }
        Update: {
          asunto?: Database["public"]["Enums"]["motivo_visita"]
          clinica_id?: string
          conversacion_id?: string | null
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_escalado"]
          id?: string
          mensaje_id?: number | null
          motivo?: Database["public"]["Enums"]["motivo_escalado"]
          resuelto_en?: string | null
          resuelto_por?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalados_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalados_conversacion_id_clinica_fkey"
            columns: ["conversacion_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id", "clinica_id"]
          },
          {
            foreignKeyName: "escalados_mensaje_id_clinica_fkey"
            columns: ["mensaje_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "mensajes"
            referencedColumns: ["id", "clinica_id"]
          },
        ]
      }
      eventos: {
        Row: {
          clinica_id: string
          creado_en: string
          datos: Json
          id: number
          tipo: string
        }
        Insert: {
          clinica_id: string
          creado_en?: string
          datos?: Json
          id?: never
          tipo: string
        }
        Update: {
          clinica_id?: string
          creado_en?: string
          datos?: Json
          id?: never
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      eventos_webhook: {
        Row: {
          carga: Json | null
          clinica_id: string
          id: number
          procesado_en: string | null
          recibido_en: string
          wa_event_id: string
        }
        Insert: {
          carga?: Json | null
          clinica_id: string
          id?: never
          procesado_en?: string | null
          recibido_en?: string
          wa_event_id: string
        }
        Update: {
          carga?: Json | null
          clinica_id?: string
          id?: never
          procesado_en?: string | null
          recibido_en?: string
          wa_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_webhook_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      faq: {
        Row: {
          actualizada_en: string
          categoria: string | null
          clinica_id: string
          embedding: string | null
          id: string
          pregunta: string
          publico: boolean
          respuesta_aprobada: string
        }
        Insert: {
          actualizada_en?: string
          categoria?: string | null
          clinica_id: string
          embedding?: string | null
          id?: string
          pregunta: string
          publico?: boolean
          respuesta_aprobada: string
        }
        Update: {
          actualizada_en?: string
          categoria?: string | null
          clinica_id?: string
          embedding?: string | null
          id?: string
          pregunta?: string
          publico?: boolean
          respuesta_aprobada?: string
        }
        Relationships: [
          {
            foreignKeyName: "faq_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      gabinetes: {
        Row: {
          activo: boolean
          clinica_id: string
          creado_en: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          clinica_id: string
          creado_en?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          clinica_id?: string
          creado_en?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "gabinetes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      horarios: {
        Row: {
          clinica_id: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
        }
        Insert: {
          clinica_id: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
        }
        Update: {
          clinica_id?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horarios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      mensajes: {
        Row: {
          clinica_id: string
          conversacion_id: string
          coste_eur: number | null
          creado_en: string
          estado_entrega: Database["public"]["Enums"]["estado_entrega"]
          id: number
          origen: Json | null
          rol: Database["public"]["Enums"]["rol_mensaje"]
          texto: string
          tokens_in: number | null
          tokens_out: number | null
          wa_message_id: string | null
        }
        Insert: {
          clinica_id: string
          conversacion_id: string
          coste_eur?: number | null
          creado_en?: string
          estado_entrega?: Database["public"]["Enums"]["estado_entrega"]
          id?: never
          origen?: Json | null
          rol: Database["public"]["Enums"]["rol_mensaje"]
          texto: string
          tokens_in?: number | null
          tokens_out?: number | null
          wa_message_id?: string | null
        }
        Update: {
          clinica_id?: string
          conversacion_id?: string
          coste_eur?: number | null
          creado_en?: string
          estado_entrega?: Database["public"]["Enums"]["estado_entrega"]
          id?: never
          origen?: Json | null
          rol?: Database["public"]["Enums"]["rol_mensaje"]
          texto?: string
          tokens_in?: number | null
          tokens_out?: number | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_conversacion_id_clinica_fkey"
            columns: ["conversacion_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "conversaciones"
            referencedColumns: ["id", "clinica_id"]
          },
        ]
      }
      pacientes: {
        Row: {
          actualizado_en: string
          apellidos: string | null
          clinica_id: string
          consentimiento_en: string | null
          creado_en: string
          email: string | null
          id: string
          nombre: string
          origen: Database["public"]["Enums"]["origen_paciente"]
          telefono_e164: string
        }
        Insert: {
          actualizado_en?: string
          apellidos?: string | null
          clinica_id: string
          consentimiento_en?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre: string
          origen?: Database["public"]["Enums"]["origen_paciente"]
          telefono_e164: string
        }
        Update: {
          actualizado_en?: string
          apellidos?: string | null
          clinica_id?: string
          consentimiento_en?: string | null
          creado_en?: string
          email?: string | null
          id?: string
          nombre?: string
          origen?: Database["public"]["Enums"]["origen_paciente"]
          telefono_e164?: string
        }
        Relationships: [
          {
            foreignKeyName: "pacientes_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      recordatorios: {
        Row: {
          cita_id: string
          clinica_id: string
          enviado_en: string
          id: number
        }
        Insert: {
          cita_id: string
          clinica_id: string
          enviado_en?: string
          id?: never
        }
        Update: {
          cita_id?: string
          clinica_id?: string
          enviado_en?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "recordatorios_cita_clinica_fkey"
            columns: ["cita_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "citas"
            referencedColumns: ["id", "clinica_id"]
          },
          {
            foreignKeyName: "recordatorios_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
        ]
      }
      tratamientos: {
        Row: {
          activo: boolean
          actualizado_en: string
          clinica_id: string
          codigo: string
          duracion_min: number
          frase_bot: string | null
          gabinete_id: string | null
          id: string
          nombre: string
          publico: boolean
        }
        Insert: {
          activo?: boolean
          actualizado_en?: string
          clinica_id: string
          codigo: string
          duracion_min: number
          frase_bot?: string | null
          gabinete_id?: string | null
          id?: string
          nombre: string
          publico?: boolean
        }
        Update: {
          activo?: boolean
          actualizado_en?: string
          clinica_id?: string
          codigo?: string
          duracion_min?: number
          frase_bot?: string | null
          gabinete_id?: string | null
          id?: string
          nombre?: string
          publico?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tratamientos_clinica_id_fkey"
            columns: ["clinica_id"]
            isOneToOne: false
            referencedRelation: "clinicas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tratamientos_gabinete_id_clinica_fkey"
            columns: ["gabinete_id", "clinica_id"]
            isOneToOne: false
            referencedRelation: "gabinetes"
            referencedColumns: ["id", "clinica_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      consultar_huecos: {
        Args: {
          p_clinica: string
          p_desde: string
          p_hasta: string
          p_limite?: number
          p_tratamiento: string
        }
        Returns: Database["public"]["CompositeTypes"]["hueco"][]
        SetofOptions: {
          from: "*"
          to: "hueco"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      crear_cita: {
        Args: {
          p_clinica: string
          p_conversacion?: string
          p_gabinete?: string
          p_inicio: string
          p_minutos_reserva?: number
          p_motivo?: Database["public"]["Enums"]["motivo_visita"]
          p_paciente: string
          p_provisional?: boolean
          p_tratamiento: string
        }
        Returns: Database["public"]["CompositeTypes"]["resultado_cita"]
        SetofOptions: {
          from: "*"
          to: "resultado_cita"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      estado_cita:
        | "provisional"
        | "confirmada"
        | "cancelada"
        | "completada"
        | "no_presentada"
      estado_conversacion: "abierta" | "cerrada" | "escalada"
      estado_entrega:
        | "pendiente"
        | "enviado"
        | "entregado"
        | "leido"
        | "fallido"
      estado_escalado: "pendiente" | "en_curso" | "resuelto"
      motivo_escalado:
        | "pregunta_fuera_de_faq"
        | "pidio_persona"
        | "datos_incompletos"
        | "urgencia_grave"
        | "no_entendido"
      motivo_visita:
        | "revision"
        | "urgencia"
        | "estetica"
        | "ortodoncia"
        | "otro"
      origen_paciente: "whatsapp" | "recepcion" | "importacion"
      quien_reserva: "bot" | "recepcion" | "paciente"
      rol_mensaje: "paciente" | "bot" | "sistema"
      trato: "usted" | "tu"
    }
    CompositeTypes: {
      hueco: {
        inicio: string | null
        fin: string | null
        gabinete_id: string | null
      }
      resultado_cita: {
        ok: boolean | null
        motivo: string | null
        cita_id: string | null
        inicio: string | null
        fin: string | null
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      estado_cita: [
        "provisional",
        "confirmada",
        "cancelada",
        "completada",
        "no_presentada",
      ],
      estado_conversacion: ["abierta", "cerrada", "escalada"],
      estado_entrega: ["pendiente", "enviado", "entregado", "leido", "fallido"],
      estado_escalado: ["pendiente", "en_curso", "resuelto"],
      motivo_escalado: [
        "pregunta_fuera_de_faq",
        "pidio_persona",
        "datos_incompletos",
        "urgencia_grave",
        "no_entendido",
      ],
      motivo_visita: ["revision", "urgencia", "estetica", "ortodoncia", "otro"],
      origen_paciente: ["whatsapp", "recepcion", "importacion"],
      quien_reserva: ["bot", "recepcion", "paciente"],
      rol_mensaje: ["paciente", "bot", "sistema"],
      trato: ["usted", "tu"],
    },
  },
} as const
