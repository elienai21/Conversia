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
];
