import type { ChatCompletionTool } from "openai/resources/index.mjs";

export const crmTools: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_available_listings",
      description: "Pesquisa disponibilidade de propriedades no CRM. Use sempre que o cliente perguntar se tem vaga ou quais estao disponiveis. Retorna apenas as propriedades DISPONÍVEIS para a data. IMPORTANTE: Após obter os resultados, para cada imóvel disponível, chame generate_checkout_link para gerar o link de reserva e inclua-o na sua resposta ao atendente.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Data de check-in no formato YYYY-MM-DD" },
          to: { type: "string", description: "Data de check-out no formato YYYY-MM-DD" },
          guests: {
            type: "integer",
            description: "Obrigatório para precisão: Número de hóspedes. IMPORTANTE: Se o cliente não informou a quantidade, pergunte primeiro antes de usar a ferramenta, pois afeta a disponibilidade.",
          },
        },
        required: ["from", "to", "guests"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_price",
      description: "Calcula o preço total de uma estadia. ATENÇÃO: Se o retorno disser 'Indisponível', avise o cliente. Nunca invente o ID do imóvel, se não tiver o ID Alfanumérico, chame search_available_listings primeiro.",
      parameters: {
        type: "object",
        properties: {
          listingIds: {
            type: "array",
            items: { type: "string" },
            description: "Lista de IDs internos obrigatórios (ex: XG01I). Não use o nome do apartamento aqui.",
          },
          from: { type: "string", description: "Data de check-in no formato YYYY-MM-DD" },
          to: { type: "string", description: "Data de check-out no formato YYYY-MM-DD" },
          guests: {
            type: "integer",
            description: "Obrigatório sondar. Se o cliente não informou a quantidade, pergunte antes de passar valor.",
          },
        },
        required: ["listingIds", "from", "to", "guests"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_reservation_details",
      description: "Consulta datas, valores e status de uma reserva. Use APENAS para responder a status da reserva ou datas quando informarem o código.",
      parameters: {
        type: "object",
        properties: {
          reservationCode: {
            type: "string",
            description: "O código identificador da reserva (ex: RE-12345).",
          },
        },
        required: ["reservationCode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fetch_checkin_details",
      description: "Traz TUDO para o check-in: o Edereço COMPLETO da propriedade, senha da porta, Wifi e Regras. EXCLUSIVO para hóspedes. Acione SEMPRE que o hóspede perguntar do endereço, chaves ou senhas e tiver o código da reserva informado no chat.",
      parameters: {
        type: "object",
        properties: {
          reservationCode: {
            type: "string",
            description: "O código da reserva do hóspede (ex: HV03J, RE-12345). Obrigatório para acessar dados sigilosos.",
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
  {
    type: "function",
    function: {
      name: "generate_checkout_link",
      description: "Gera o link de reserva/checkout direto de um imóvel no site do cliente (Stays.net). Use SEMPRE após search_available_listings ou calculate_price para fornecer o link de pagamento ao cliente. O link gerado deve ser incluído na sugestão de resposta para que o atendente possa enviá-lo ao cliente.",
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "O ID do imóvel/anúncio (campo '_id' ou 'id' retornado pelo search_available_listings ou get_all_properties).",
          },
          from: { type: "string", description: "Data de check-in no formato YYYY-MM-DD" },
          to: { type: "string", description: "Data de check-out no formato YYYY-MM-DD" },
          guests: {
            type: "integer",
            description: "Número de hóspedes adultos.",
          },
        },
        required: ["listingId", "from", "to", "guests"],
      },
    },
  },
];
