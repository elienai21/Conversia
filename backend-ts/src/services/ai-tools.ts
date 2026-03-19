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
];
