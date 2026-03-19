import type { ChatCompletionTool } from "openai/resources/index.mjs";

export const crmTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_available_listings",
      description: "Pesquisa disponibilidade de propriedades para o CRM configurado do hotel. Use sempre que o cliente perguntar se tem vaga para certas datas.",
      parameters: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Data de check-in no formato YYYY-MM-DD",
          },
          to: {
            type: "string",
            description: "Data de check-out no formato YYYY-MM-DD",
          },
          guests: {
            type: "integer",
            description: "Número de hóspedes (opcional). Assuma 2 se não informado.",
          },
        },
        required: ["from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_price",
      description: "Calcula o preço total de uma estadia em uma propriedade específica. Use sempre que o cliente perguntar o valor para a data solicitada.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: {
              type: "string",
            },
            description: "Lista de IDs das propriedades que serão verificadas (obrigatório, derivado da busca de listings ou do conhecimento do Agente).",
          },
          from: {
            type: "string",
            description: "Data de check-in no formato YYYY-MM-DD",
          },
          to: {
            type: "string",
            description: "Data de check-out no formato YYYY-MM-DD",
          },
          guests: {
            type: "integer",
            description: "Número de hóspedes (opcional). Assuma 2 se não informado.",
          },
        },
        required: ["listingIds", "from", "to"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reservation_details",
      description: "Consulta os detalhes de uma reserva específica usando o código ou ID da reserva. Use sempre que o hóspede pedir informações sobre a reserva dele (datas, status, valores) e informar o código.",
      parameters: {
        type: "object",
        properties: {
          reservationCode: {
            type: "string",
            description: "O código identificador da reserva informado pelo cliente (ex: RE-12345).",
          },
        },
        required: ["reservationCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_properties",
      description: "Lista todas as propriedades cadastradas no CRM com seus respectivos IDs. Útil para descobrir o ID de um imóvel antes de buscar os detalhes ou regras dele.",
      parameters: {
        type: "object",
        properties: {}, // No params needed
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_listing_details",
      description: "Consulta os detalhes completos de um imóvel/apartamento (comodidades, descrição, etc) a partir do seu ID.",
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "O ID do anúncio/propriedade (descubra usando get_all_properties se necessário).",
          },
        },
        required: ["listingId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_house_rules",
      description: "Consulta as regras da casa e horários de um imóvel específico a partir do seu ID.",
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "O ID do anúncio/propriedade (descubra usando get_all_properties se necessário).",
          },
        },
        required: ["listingId"],
      },
    },
  },
];
