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
      description: `Gera o link de reserva/pagamento para o cliente. Use SEMPRE após search_available_listings para cada imóvel disponível. NUNCA escreva URLs manualmente — use SOMENTE esta ferramenta.

O link gerado segue o padrão:
https://{dominio}/customer/pt/booking?id={ID_PROPRIEDADE}&from={AAAA-MM-DD}&to={AAAA-MM-DD}&persons={HOSPEDES}

Exemplo:
https://vivare.stays.net/customer/pt/booking?id=UV02I&from=2026-04-02&to=2026-04-05&persons=4`,
      parameters: {
        type: "object",
        properties: {
          listingId: {
            type: "string",
            description: "O CÓDIGO ALFANUMÉRICO da propriedade (ex: UV02I, XG01I). É o campo 'listingId' ou 'listing._id' retornado pelo search_available_listings — código CURTO alfanumérico. NUNCA use o _id MongoDB de 24 chars hex (ex: 6802943f0cfadbf62ce671d1).",
          },
          from: {
            type: "string",
            description: "Data de check-in no formato AAAA-MM-DD (ex: 2026-04-02). Converta datas no formato DD/MM/AAAA antes de usar.",
          },
          to: {
            type: "string",
            description: "Data de checkout no formato AAAA-MM-DD (ex: 2026-04-05). Converta datas no formato DD/MM/AAAA antes de usar.",
          },
          guests: {
            type: "integer",
            description: "Número total de hóspedes (parâmetro 'persons' na URL). Ex: 4",
          },
        },
        required: ["listingId", "from", "to", "guests"],
      },
    },
  },
];
