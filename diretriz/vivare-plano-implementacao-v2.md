**GRUPO VIVARE**

**Plano de Implementação**

*Novo Site Institucional e Comercial*

Versão 2.0 · Estratégia Consolidada · 2025

*Documento confidencial --- uso interno*

**Índice do Documento**

**1.** Visão Geral e Diagnóstico Estratégico

**2.** Princípios de Arquitetura

**3.** Mapa Completo de Páginas e Rotas

**4.** Especificação das Páginas Principais

**5.** Funis de Conversão por Público

**6.** Estratégia de Captação de Leads --- Proprietários

**7.** Sistema de Prova Social Segmentada

**8.** Estratégia de SEO e Performance

**9.** Integração Técnica com stays.net

**10.** Plano de Fases e Cronograma

**11.** Matriz de Prioridades

**12.** KPIs e Métricas de Sucesso

**13.** Checklist de Lançamento

**1. Visão Geral e Diagnóstico Estratégico**

**1.1 Objetivo do Projeto**

Substituir o site atual do Grupo Vivare por uma plataforma comercial de alta performance, com dois funis independentes e visíveis: reserva para hóspedes e captação de proprietários. O site deve parecer e funcionar como marca premium, não como catálogo de imóveis.

**1.2 Problemas Críticos do Site Atual**

-   Ausência de hierarquia clara entre os dois públicos --- hóspede e proprietário --- gerando confusão e abandono

-   Motor de busca e CTA de reserva não aparecem na primeira dobra da home

-   Prova social genérica, não segmentada por público --- não converte proprietários

-   Nenhum mecanismo de captura para visitantes que não convertem na primeira sessão

-   Página de Contato como item de primeiro nível no menu --- dilui cliques de conversão

-   Ausência de oferta de entrada para proprietários (ex: simulação de rentabilidade)

-   Blog subutilizado --- sem conteúdo de intenção transacional para SEO local

-   Integração com stays.net no primeiro render compromete LCP e Core Web Vitals

**1.3 Dois Públicos, Dois Funis**

O site precisa resolver dois objetivos comerciais sem que um prejudique o outro. A home funciona como hub de decisão com dois caminhos claros desde o primeiro scroll.

+-----------------------------------------------------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+
| **HÓSPEDE**                                                                                                           | **PROPRIETÁRIO**                                                                                                |
|                                                                                                                       |                                                                                                                 |
| Intenção: encontrar e reservar um apartamento de qualidade em SP, Santos ou Guarujá com praticidade e sem burocracia. | Intenção: entender como a Vivare pode rentabilizar o imóvel, confiar na operação e iniciar contato qualificado. |
|                                                                                                                       |                                                                                                                 |
| Fluxo: Home → Unidades → Página da Unidade → Checkout → Confirmação                                                   | Fluxo: Home → Para Proprietários → Simulação/Formulário → Qualificação → Reunião                                |
+-----------------------------------------------------------------------------------------------------------------------+-----------------------------------------------------------------------------------------------------------------+

**2. Princípios de Arquitetura**

**Performance como prioridade de build, não de otimização posterior**

-   Meta obrigatória: LCP abaixo de 2,5 segundos em mobile

-   Imagens em formato WebP com lazy load nativo

-   Nenhum widget externo (stays.net, chat, mapas) no primeiro render

-   Core Web Vitals como critério de aprovação antes do lançamento

**Mobile-first como padrão de desenvolvimento**

-   Todo layout nasce do breakpoint de 375px e expande para desktop

-   Botão flutuante de WhatsApp fixo em todas as páginas em mobile

-   Formulários com campos grandes, sem zoom automático em iOS

**Separação de públicos sem duplicação de conteúdo**

-   Prova social segmentada: depoimentos de hóspedes e depoimentos de proprietários em blocos distintos

-   Linguagem emocional e visual para hóspedes; linguagem executiva e orientada a resultado para proprietários

-   CTAs nunca misturados no mesmo bloco

**SEO técnico como fundação, não como adição**

-   URLs descritivas e hierárquicas desde o primeiro deploy

-   Structured data JSON-LD para VacationRental em cada página de unidade

-   Marcação LocalBusiness para a empresa

-   Títulos e meta descriptions únicos por página

-   Sitemap.xml e robots.txt configurados antes de indexação

**3. Mapa Completo de Páginas e Rotas**

Estrutura definitiva de URLs para o novo site:

  ----------------------------------------------------------------------------------------
  **URL**                             **Página**                      **Funil**
  ----------------------------------- ------------------------------- --------------------
  **/**                               Home --- Hub de decisão         Ambos

  **/unidades**                       Vitrine de acomodações          Hóspede

  **/unidades/\[slug\]**              Página individual da unidade    Hóspede

  **/reserva**                        Checkout --- Fluxo de reserva   Hóspede

  **/reserva/confirmacao**            Confirmação de reserva          Hóspede

  **/para-proprietarios**             Landing page de captação        Proprietário

  **/para-proprietarios/simulacao**   Simulação de rentabilidade      Proprietário

  **/sobre**                          Sobre a Vivare                  Institucional

  **/faq**                            Perguntas frequentes (duplo)    Ambos

  **/blog**                           Blog / Guias locais             Aquisição orgânica

  **/blog/\[slug\]**                  Artigo individual               Aquisição orgânica

  **/politica-de-privacidade**        Política de Privacidade         Legal

  **/termos**                         Termos e Condições              Legal

  **/politica-de-cancelamento**       Política de Cancelamento        Legal
  ----------------------------------------------------------------------------------------

**4. Especificação das Páginas Principais**

**4.1 Home --- Hub de Decisão**

A home não é institucional. É uma página comercial que responde em 5 segundos: o que a Vivare faz, para quem, onde e como dar o próximo passo.

**Bloco 1 --- Hero Principal**

-   Headline: \"Hospedagens de alto padrão em São Paulo, Santos e Guarujá\"

-   Subheadline curto: variante para hóspede e proprietário em linha separada

-   Formulário de busca nativo (HTML puro, sem widget externo): bairro/cidade, check-in, check-out, hóspedes + botão Buscar

-   Dois CTAs abaixo do formulário: \"Reservar uma unidade\" (primário) e \"Quero anunciar meu imóvel\" (secundário, visual distinto)

*⚠ O formulário de busca deve ser HTML nativo com redirect para /unidades --- jamais um iframe do stays.net no hero. O LCP seria destruído.*

**Bloco 2 --- Unidades em Destaque**

-   Grid de 3 a 4 cards com: foto grande, nome, bairro, capacidade, preço a partir de e botão Ver detalhes

-   Link Ver todas as unidades ao final do bloco

**Bloco 3 --- Por que reservar com a Vivare (Hóspedes)**

-   5 diferenciais em ícones: Curadoria de imóveis · Limpeza profissional · Check-in digital · Zero burocracia · Suporte 24h

**Bloco 4 --- Para Proprietários (visual executivo, separado)**

-   Background diferenciado (tom mais escuro ou texturizado) para sinalizar mudança de público

-   Headline: \"Seu imóvel pode render mais com gestão profissional de curta temporada\"

-   3 resultados concretos em números: ex. até 40% mais rentabilidade, 90%+ taxa de ocupação, 0 preocupação operacional

-   CTA único: \"Solicitar simulação gratuita\" → /para-proprietarios

**Bloco 5 --- Prova Social Segmentada**

-   Sub-bloco A (Hóspedes): 3 depoimentos com nota, foto e destaque de bairro visitado

-   Sub-bloco B (Proprietários): 2 depoimentos de donos de imóvel com resultado financeiro mencionado

*⚠ Esta separação é crítica. Misturar os dois públicos na mesma seção de depoimentos não converte proprietário.*

**Bloco 6 --- Captura Passiva de Leads**

-   Banner discreto ou inline: \"Receba unidades disponíveis na sua data por e-mail\" + campo de e-mail + data desejada

-   Para proprietários: \"Baixe o guia gratuito: como rentabilizar imóvel em São Paulo\" + campo de e-mail

-   Modal de saída (exit-intent) para visitantes que não interagiram com nenhum CTA

**Bloco 7 --- FAQ Mínimo (máximo 3 perguntas)**

-   \"Preciso de fiador ou caução?\" → Não, zero burocracia

-   \"Como funciona o check-in?\" → 100% digital, sem necessidade de chave física

-   \"Posso reservar por mensalidade?\" → Sim, aceitamos estadias curtas e mensais

**Bloco 8 --- CTA Final Duplo**

-   Botão primário: \"Encontrar minha hospedagem\" → /unidades

-   Botão secundário: \"Quero avaliar meu imóvel\" → /para-proprietarios

**4.2 Página de Unidades --- Vitrine Comercial**

-   Filtros: bairro/cidade · número de hóspedes · faixa de preço · tipo de imóvel · comodidades

-   Ordenação: destaque · menor preço · mais recentes

-   Card por unidade: foto, nome, bairro, capacidade, diferenciais rápidos (ícones), preço inicial, botão Ver detalhes

-   Paginação ou infinite scroll --- definir conforme volume de unidades

-   Barra de busca no topo da página, sempre visível

*⚠ Esta página é intenção de compra. Nenhum conteúdo institucional deve aparecer aqui. Layout limpo, foco no produto.*

**4.3 Página Individual da Unidade --- Conversão**

Esta é a página mais importante para conversão de hóspede. Cada elemento existe para levar ao clique em Reservar.

-   Topo: galeria fullwidth, nome da unidade, bairro, capacidade (hóspedes / quartos / camas / banheiros)

-   Box lateral fixo (sticky em desktop, botão fixo em mobile): preço por noite · seletor de datas · número de hóspedes · botão Reservar agora · botão WhatsApp secundário

-   Seções abaixo: Descrição da experiência · Lista de comodidades · Regras da casa · Política de cancelamento em destaque · Mapa aproximado · Avaliações · Unidades semelhantes

-   URL descritiva: /unidades/studio-moema-metro-ibirapuera

-   Structured data JSON-LD: VacationRental com nome, descrição, fotos, preço, localização

*⚠ A Política de Cancelamento deve aparecer na página da unidade e no checkout --- não apenas no FAQ. É o principal bloqueador de reserva direta versus OTAs.*

**4.4 Para Proprietários --- Landing Page de Captação**

Esta página deve ser tratada como landing page B2B independente dentro do site. Tom executivo. Foco em resultado e confiança operacional.

**Estrutura obrigatória**

-   Hero: headline orientada a resultado + CTA Solicitar simulação gratuita

-   Bloco Como funciona: 4 etapas da gestão Vivare (captação → anúncio → operação → repasse)

-   Bloco O que a Vivare cuida: anúncio nas plataformas · precificação dinâmica · atendimento ao hóspede · limpeza e manutenção · acompanhamento financeiro

-   Bloco Resultados: números reais de operação (se disponíveis) --- % de ocupação, tempo médio de resposta, rentabilidade média

-   Bloco Prova social exclusiva de proprietários: depoimentos com resultado financeiro, não apenas satisfação

-   Bloco Perfil do imóvel ideal: quais tipos e regiões a Vivare prioriza

-   FAQ de proprietários

-   Formulário de captação + CTA de WhatsApp

**Formulário de Captação --- Campos**

-   Nome completo

-   Telefone (WhatsApp preferencial)

-   E-mail

-   Bairro e cidade do imóvel

-   Tipo do imóvel (studio, 1 quarto, 2 quartos, cobertura, casa)

-   O imóvel já está anunciado? (Sim em plataforma · Sim em gestora · Não)

-   Link do anúncio atual (opcional)

-   Como prefere ser contactado? (WhatsApp · E-mail · Ligação)

**Oferta de Entrada --- Simulação de Rentabilidade**

Esta é a diferença entre um formulário genérico e uma ferramenta de captação. O visitante informa tipo de imóvel, bairro e metragem e recebe uma estimativa de rentabilidade mensal com e sem gestão profissional.

-   Funciona como lead magnet: captura e-mail e telefone em troca do resultado

-   Aumenta significativamente a taxa de envio do formulário vs. formulário de contato simples

-   Pode ser uma calculadora simples com faixas de valor por m² e bairro

*⚠ Sem uma oferta de entrada, a página Para Proprietários é apenas mais um formulário. A simulação é o diferencial de conversão.*

**5. Funis de Conversão por Público**

**5.1 Funil do Hóspede**

  ------------ ---------------- ------------------- -------------------- ------------- -------------
  **Topo**     **Descoberta**   **Consideração**    **Decisão**          **Reserva**   **Pós**

  Blog / SEO   Home             Página da Unidade   Preço e Avaliações   Checkout      Confirmação
  ------------ ---------------- ------------------- -------------------- ------------- -------------

**5.2 Funil do Proprietário**

  ----------------- ----------------------------- -------------------- ---------------------------- ----------------------- -----------------------
  **Consciência**   **Interesse**                 **Avaliação**        **Intenção**                 **Contato**             **Qualificação**

  Blog e SEO        Home --- bloco proprietário   Para Proprietários   Simulação de rentabilidade   Formulário e WhatsApp   Confirmação e reunião
  ----------------- ----------------------------- -------------------- ---------------------------- ----------------------- -----------------------

**6. Estratégia de Captação de Leads --- Proprietários**

Leads de proprietário têm alta intenção e alta fricção. A decisão de entregar a gestão de um imóvel é longa. O site precisa agir em três camadas:

**6.1 Camada 1 --- Captura Imediata**

-   Formulário de captação na página Para Proprietários

-   CTA de WhatsApp com mensagem pré-preenchida: \"Olá, tenho interesse em saber mais sobre a gestão da Vivare para o meu imóvel em \[bairro\]\"

-   Simulação de rentabilidade como isca de conversão --- o lead precisa preencher dados antes de ver o resultado

**6.2 Camada 2 --- Captura Passiva**

-   Lead magnet: PDF \"Como rentabilizar seu imóvel com locação de curta temporada em São Paulo\" --- disponível em troca de e-mail

-   Exit-intent modal para visitantes da página Para Proprietários que tentam sair sem converter

-   Bloco de captura na home (visual executivo, não misturado com bloco de hóspedes)

**6.3 Camada 3 --- Nutrição Pós-Captura**

-   E-mail automático de confirmação em até 5 minutos após envio do formulário --- com nome, prazo de retorno e próximo passo

-   Sequência de 3 e-mails nos primeiros 7 dias: (1) Boas-vindas + o que esperar, (2) Resultados reais de proprietários semelhantes, (3) CTA para agendar reunião

-   WhatsApp de retorno em até 24 horas úteis --- com mensagem personalizada baseada nos dados do formulário

*⚠ Sem fluxo de nutrição, o lead some. Um proprietário que não recebe retorno em 24h procura outra gestora. A velocidade de resposta é diferencial competitivo direto.*

**6.4 Gatilhos de Urgência e Confiança para Proprietários**

-   Número de imóveis gerenciados atualmente (ex: \"mais de 30 unidades em SP\")

-   Taxa média de ocupação da carteira

-   Tempo médio de resposta ao hóspede

-   Avaliação média nas plataformas

-   Logos das plataformas parceiras: Airbnb · Booking · Decolar

-   Selos de operação: CNPJ · Contrato de gestão · Prestação de contas mensal

**7. Sistema de Prova Social Segmentada**

Este é o ponto mais subutilizado do site atual. Todos os depoimentos são de hóspedes, misturados em um único bloco. Proprietários não se identificam com a experiência de hospedagem.

**7.1 Depoimentos de Hóspedes**

-   Formato: foto, nome, cidade de origem, nota 1--5, texto com destaque da unidade visitada

-   Posição: bloco de prova social na home e nas páginas de unidade

-   Conteúdo atual aproveitável: Karina Santos, Erika Lima, Luíz Castro, Adryele Yoshikawa

-   Acrescentar: avaliações importadas do Google e/ou Airbnb com link verificável

**7.2 Depoimentos de Proprietários --- Criar com Urgência**

-   Formato: foto ou logo, nome e tipo de imóvel, resultado financeiro mencionado (ex: \"Meu studio em Moema passou de R\$ 1.800/mês para R\$ 4.200/mês gerenciado pela Vivare\")

-   Posição: exclusivamente na página Para Proprietários e no bloco executivo da home

-   Meta: coletar ao menos 3 depoimentos de proprietários com resultado concreto antes do lançamento

*⚠ Se não houver depoimentos de proprietários disponíveis no lançamento, usar um case anônimo com dados reais: \"Proprietário · Studio · Vila Mariana · rentabilidade 2,3× maior com gestão Vivare\"*

**7.3 Números de Operação**

Números concretos constroem mais confiança do que adjetivos. Definir quais métricas reais podem ser divulgadas e exibi-las em destaque nas duas páginas de conversão.

-   Imóveis sob gestão

-   Avaliação média nas plataformas

-   Taxa média de ocupação

-   Tempo médio de resposta ao hóspede

-   Anos de operação

**8. Estratégia de SEO e Performance**

**8.1 SEO Técnico --- Obrigatório antes do lançamento**

-   URLs limpas e descritivas conforme mapa de rotas definido neste documento

-   Title tags únicas por página --- padrão: \[Nome da Unidade\] · Apartamento de temporada em \[Bairro\] · Vivare

-   Meta descriptions com intenção de busca e CTA implícito

-   Structured data JSON-LD: VacationRental em páginas de unidade · LocalBusiness na home e sobre

-   Sitemap.xml enviado ao Google Search Console antes de indexação

-   Canonical tags para evitar duplicação entre /unidades e páginas de listagem filtradas

-   Imagens com alt text descritivo: \"apartamento de temporada em Moema São Paulo --- Vivare Stay\"

**8.2 Conteúdo de Aquisição --- Blog Fundacional**

Lançar com ao menos 4 artigos já publicados e indexáveis. Conteúdo de bairro e intenção transacional têm baixa concorrência editorial e alta conversão orgânica.

  --------------------------------------------------------------------------------------------
  **Título do Artigo**                                         **Intenção**    **Público**
  ------------------------------------------------------------ --------------- ---------------
  Apartamento por temporada em Moema: o guia completo          Transacional    Hóspede

  Aluguel de curta temporada em Vila Mariana --- o que saber   Transacional    Hóspede

  Hospedagem sem fiador em São Paulo: como funciona            Informacional   Hóspede

  Como rentabilizar imóvel com Airbnb em São Paulo em 2025     Transacional    Proprietário

  Diferença entre hotel e apartamento de temporada em SP       Informacional   Hóspede
  --------------------------------------------------------------------------------------------

**8.3 Performance --- Metas de Core Web Vitals**

-   LCP (Largest Contentful Paint): \< 2,5 segundos em mobile

-   CLS (Cumulative Layout Shift): \< 0,1

-   INP (Interaction to Next Paint): \< 200ms

-   Ferramentas de validação: Google PageSpeed Insights + Lighthouse + Search Console

*⚠ Esses critérios devem ser validados em ambiente de staging antes do lançamento. Reprovar em Core Web Vitals é motivo de adiamento do go-live.*

**9. Integração Técnica com stays.net**

A integração com stays.net é o núcleo operacional do site. A estratégia de integração define diretamente a performance e a experiência do usuário.

**9.1 O que NÃO fazer**

-   Carregar iframe do stays.net no hero ou no primeiro render da home

-   Usar widget externo de busca na primeira dobra --- compromete LCP imediatamente

-   Depender do stays.net para renderizar a listagem de unidades em /unidades (latência impacta conversão)

**9.2 Arquitetura Recomendada**

-   Formulário de busca na home: HTML nativo → redirect com parâmetros para /unidades

-   Página /unidades: busca e listagem via API do stays.net com cache intermediário

-   Página /unidades/\[slug\]: dados carregados via API com structured data gerado no servidor (SSR ou SSG)

-   Widget de checkout (stays.net): carregado apenas na página /reserva --- não afeta LCP das páginas anteriores

-   Disponibilidade em tempo real: consulta via API do stays.net apenas quando o usuário seleciona datas

**9.3 Integrações Adicionais Recomendadas**

-   Google Tag Manager: controle centralizado de pixels e eventos sem deploys

-   Meta Pixel (Facebook/Instagram): remarketing para hóspedes e proprietários com audiências separadas

-   Google Analytics 4: eventos customizados --- busca realizada · unidade visualizada · checkout iniciado · lead proprietário enviado

-   Hotjar ou Microsoft Clarity: gravação de sessão para identificar abandono no checkout e no formulário de proprietários

-   CRM ou planilha de leads: integração do formulário Para Proprietários com notificação automática por e-mail

**10. Plano de Fases e Cronograma**

+------------------------------------------------------------------------------------+
| **FASE 1 · Fundação Comercial** · Semanas 1--4                                     |
+------------------------------------------------------------------------------------+
| -   Definição da identidade visual do novo site (paleta, tipografia, tom de voz)   |
|                                                                                    |
| -   Aprovação do wireframe da home, página de unidades e página para proprietários |
|                                                                                    |
| -   Configuração do ambiente técnico (domínio, hospedagem, CMS ou stack escolhida) |
|                                                                                    |
| -   Produção das fotos profissionais de todas as unidades (prioridade máxima)      |
|                                                                                    |
| -   Coleta de depoimentos de proprietários para a página Para Proprietários        |
|                                                                                    |
| -   Definição dos números de operação que serão publicados                         |
|                                                                                    |
| -   Estruturação do formulário de captação e fluxo de resposta automática          |
+------------------------------------------------------------------------------------+

+------------------------------------------------------------------------------------+
| **FASE 2 · Desenvolvimento Core** · Semanas 5--9                                   |
+------------------------------------------------------------------------------------+
| -   Desenvolvimento da home com todos os 8 blocos especificados                    |
|                                                                                    |
| -   Desenvolvimento de /unidades com filtros e cards                               |
|                                                                                    |
| -   Desenvolvimento das páginas individuais de unidade com structured data         |
|                                                                                    |
| -   Desenvolvimento completo de /para-proprietarios com simulação de rentabilidade |
|                                                                                    |
| -   Integração com stays.net via API (busca, disponibilidade, checkout)            |
|                                                                                    |
| -   Configuração do formulário com notificação automática e sequência de e-mails   |
|                                                                                    |
| -   Implementação do botão WhatsApp flutuante e links contextuais                  |
|                                                                                    |
| -   Otimização mobile-first e Core Web Vitals em todas as páginas core             |
+------------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------+
| **FASE 3 · Conteúdo e SEO** · Semanas 8--11 (paralelo)                         |
+--------------------------------------------------------------------------------+
| -   Redação dos títulos, meta descriptions e textos de todas as páginas        |
|                                                                                |
| -   Produção dos 4 artigos fundacionais do blog                                |
|                                                                                |
| -   Configuração do structured data JSON-LD em todas as páginas de unidade     |
|                                                                                |
| -   Envio do sitemap ao Google Search Console                                  |
|                                                                                |
| -   Configuração do Google Analytics 4, Meta Pixel e Google Tag Manager        |
|                                                                                |
| -   Criação das audiências de remarketing separadas (hóspedes × proprietários) |
|                                                                                |
| -   Produção do lead magnet PDF para proprietários                             |
+--------------------------------------------------------------------------------+

+--------------------------------------------------------------------------------------------+
| **FASE 4 · QA e Lançamento** · Semanas 12--13                                              |
+--------------------------------------------------------------------------------------------+
| -   Validação de Core Web Vitals em staging (reprovar = adiar go-live)                     |
|                                                                                            |
| -   Testes de formulário --- envio → confirmação → e-mail automático → notificação interna |
|                                                                                            |
| -   Teste completo do fluxo de checkout com stays.net                                      |
|                                                                                            |
| -   Revisão de todos os links, CTAs e redirects                                            |
|                                                                                            |
| -   Auditoria de SEO técnico (Screaming Frog ou equivalente)                               |
|                                                                                            |
| -   Soft launch para validação com usuários reais antes de divulgação ampla                |
|                                                                                            |
| -   Go-live + monitoramento intensivo nos primeiros 7 dias                                 |
+--------------------------------------------------------------------------------------------+

**11. Matriz de Prioridades**

  -------------------------------------------------------------------------------------------------------------------------
  **Prioridade**   **Ação**                                                              **Responsável**   **Fase**
  ---------------- --------------------------------------------------------------------- ----------------- ----------------
  **Crítica**      Formulário com oferta de entrada (simulação de rentabilidade)         Dev + Produto     Fase 2

  **Crítica**      Separação de prova social por público (hóspede × proprietário)        Conteúdo          Fase 1

  **Crítica**      Formulário de busca HTML nativo no hero (sem iframe stays.net)        Dev               Fase 2

  **Crítica**      Fluxo de resposta automática pós-formulário de proprietário           Dev + CRM         Fase 2

  **Alta**         Camada de captura passiva (exit-intent + lead magnet PDF)             Dev + Conteúdo    Fase 2

  **Alta**         Remover Contato do menu principal → WhatsApp flutuante fixo           Dev               Fase 2

  **Alta**         Política de Cancelamento visível na página da unidade e no checkout   Conteúdo + Dev    Fase 2

  **Alta**         4 artigos fundacionais do blog com intenção transacional              Conteúdo + SEO    Fase 3

  **Alta**         Audiências de remarketing separadas no Meta e Google Ads              Marketing         Fase 3

  **Alta**         Coleta de 3 depoimentos de proprietários com resultado financeiro     Comercial         Fase 1

  **Média**        Simulação de rentabilidade interativa na página Para Proprietários    Dev + Produto     Fase 2

  **Média**        Structured data JSON-LD VacationRental em todas as unidades           Dev + SEO         Fase 3

  **Média**        Hotjar/Clarity para análise de abandono em checkout e formulários     Dev + Marketing   Fase 3

  **Média**        Validação de Core Web Vitals antes do go-live (LCP \< 2,5s)           Dev               Fase 4

  **Baixa**        Posicionamento do FAQ fora do fluxo de venda principal da home        Dev               Fase 2

  **Baixa**        Multi-idiomas (PT/EN) --- manter apenas se houver demanda real        Dev               Pós-lançamento
  -------------------------------------------------------------------------------------------------------------------------

**12. KPIs e Métricas de Sucesso**

**12.1 Hóspedes**

-   Taxa de conversão de visitante para reserva: meta \> 2% (benchmark setor: 1--3%)

-   Bounce rate na home: meta \< 50%

-   Tempo médio na página de unidade: meta \> 2 minutos

-   Taxa de abandono no checkout: meta \< 60%

-   Leads capturados por e-mail (visitantes que não converteram): meta \> 5% dos visitantes

**12.2 Proprietários**

-   Leads de proprietário enviados por mês: meta definida conforme capacidade de absorção da operação

-   Taxa de conversão do formulário Para Proprietários: meta \> 8%

-   Taxa de abertura do e-mail automático de confirmação: meta \> 50%

-   Taxa de agendamento de reunião após contato: meta \> 30% dos leads qualificados

-   Downloads do lead magnet PDF: métrica de validação do interesse orgânico

**12.3 SEO e Performance**

-   LCP em mobile: \< 2,5 segundos (obrigatório no lançamento)

-   Posicionamento no Google para termos de bairro em 90 dias: top 10 para ao menos 2 termos

-   Impressões orgânicas no Search Console: crescimento mês a mês

-   Taxa de clique (CTR) orgânica: meta \> 4% para páginas de unidade

**13. Checklist de Lançamento**

**Conteúdo e Produto**

-   Fotos profissionais de todas as unidades finalizadas

-   Depoimentos de proprietários coletados (mínimo 3 com resultado financeiro)

-   Números de operação definidos e aprovados para publicação

-   Textos de todas as páginas revisados e aprovados

-   Lead magnet PDF (guia para proprietários) produzido

-   4 artigos fundacionais do blog escritos, revisados e publicados

-   Política de cancelamento redigida e posicionada nas páginas corretas

**Técnico e Performance**

-   Core Web Vitals validados em staging: LCP \< 2,5s, CLS \< 0,1, INP \< 200ms

-   Formulário de busca da home é HTML nativo --- sem iframe de stays.net

-   Structured data JSON-LD implementado em todas as páginas de unidade

-   Sitemap.xml enviado ao Google Search Console

-   Canonical tags configuradas

-   Redirects 301 de URLs antigas para novas configurados

-   SSL ativo e www/non-www padronizados

**Conversão e Marketing**

-   Formulário Para Proprietários dispara e-mail automático em \< 5 minutos

-   Notificação interna de novo lead chegando ao responsável comercial

-   WhatsApp flutuante ativo em todas as páginas

-   Exit-intent modal configurado e testado

-   Google Analytics 4 com eventos customizados rastreando os 4 eventos core

-   Meta Pixel instalado com audiências separadas configuradas

-   Google Tag Manager ativo

**QA Final**

-   Fluxo completo de reserva testado de ponta a ponta

-   Fluxo completo de formulário de proprietário testado --- envio → confirmação → notificação

-   Todos os CTAs e links verificados em mobile e desktop

-   Formulários testados com dados reais em mobile

-   Botão WhatsApp testado com mensagem pré-preenchida correta

-   Site testado nos navegadores: Chrome, Safari, Firefox, Samsung Internet

**GRUPO VIVARE · Plano de Implementação v2.0**

*Documento confidencial · uso interno · 2025*
