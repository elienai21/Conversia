// src/pages/TermsPage.tsx
import "./LegalPage.css";

export function TermsPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <div className="legal-logo">
            <span className="legal-brand">Conversia</span>
          </div>
          <h1>Termos de Uso</h1>
          <p className="legal-updated">Última atualização: 27 de março de 2026</p>
        </header>

        <article className="legal-content">
          <section>
            <h2>1. Aceitação dos Termos</h2>
            <p>
              Ao criar uma conta ou utilizar a plataforma Conversia ("Serviço"), você concorda com estes
              Termos de Uso. Se você não concordar, não utilize o Serviço.
            </p>
          </section>

          <section>
            <h2>2. Descrição do Serviço</h2>
            <p>
              A Conversia é uma plataforma SaaS de gestão de comunicações e atendimento ao cliente via
              WhatsApp, Instagram e outros canais digitais, com recursos de inteligência artificial para
              automação e sugestão de respostas.
            </p>
          </section>

          <section>
            <h2>3. Cadastro e Conta</h2>
            <p>
              Para usar o Serviço, você deve fornecer informações verdadeiras, precisas e completas durante
              o cadastro. Você é responsável por manter a confidencialidade de suas credenciais de acesso e
              por todas as atividades realizadas em sua conta.
            </p>
            <p>
              Cada conta está vinculada a um único tenant (organização). O administrador da conta é
              responsável por gerenciar os usuários e permissões dentro de sua organização.
            </p>
          </section>

          <section>
            <h2>4. Planos e Pagamento</h2>
            <p>
              O Serviço oferece um período de teste gratuito de 14 (quatorze) dias. Após esse período, é
              necessário a contratação de um dos planos pagos para continuar utilizando o Serviço.
            </p>
            <p>
              Os pagamentos são processados mensalmente via Stripe. Você autoriza a cobrança automática
              no cartão de crédito cadastrado. O cancelamento pode ser feito a qualquer momento pelo
              portal de cobrança, com efeito no fim do período vigente.
            </p>
            <p>
              Não realizamos reembolsos de períodos parcialmente utilizados, exceto nos casos previstos
              pelo Código de Defesa do Consumidor (CDC).
            </p>
          </section>

          <section>
            <h2>5. Uso Aceitável</h2>
            <p>Você concorda em NÃO utilizar o Serviço para:</p>
            <ul>
              <li>Enviar spam, mensagens em massa não solicitadas ou comunicações fraudulentas;</li>
              <li>Violar leis aplicáveis, incluindo leis de proteção de dados e privacidade;</li>
              <li>Coletar dados de terceiros sem o devido consentimento;</li>
              <li>Realizar engenharia reversa, descompilar ou tentar extrair o código-fonte da plataforma;</li>
              <li>Revender, sublicenciar ou transferir o acesso ao Serviço sem autorização prévia.</li>
            </ul>
          </section>

          <section>
            <h2>6. Propriedade Intelectual</h2>
            <p>
              Todo o conteúdo da plataforma Conversia — incluindo software, design, marca, logotipos e
              documentação — é de propriedade exclusiva da Conversia ou de seus licenciadores.
            </p>
            <p>
              Você retém a propriedade de todos os dados e conteúdos inseridos por você na plataforma.
              Ao usar o Serviço, você nos concede uma licença limitada, não exclusiva, para processar esses
              dados com o único objetivo de fornecer o Serviço.
            </p>
          </section>

          <section>
            <h2>7. Dados Pessoais e LGPD</h2>
            <p>
              O tratamento de dados pessoais coletados pela Conversia é regido pela nossa{" "}
              <a href="/privacy">Política de Privacidade</a>, em conformidade com a Lei Geral de Proteção
              de Dados (Lei nº 13.709/2018 — LGPD).
            </p>
            <p>
              Como responsável pelo tratamento de dados de seus clientes finais, você (o contratante) age
              como Controlador de Dados, e a Conversia age como Operadora, conforme definido na LGPD.
              Você é responsável por garantir que a coleta e uso dos dados de seus clientes tenha base
              legal adequada.
            </p>
          </section>

          <section>
            <h2>8. Disponibilidade e SLA</h2>
            <p>
              Buscamos manter o Serviço disponível 24 horas por dia, 7 dias por semana, mas não garantimos
              disponibilidade ininterrupta. Manutenções programadas serão comunicadas com antecedência
              mínima de 24 horas via e-mail.
            </p>
          </section>

          <section>
            <h2>9. Limitação de Responsabilidade</h2>
            <p>
              Na máxima extensão permitida por lei, a Conversia não será responsável por danos indiretos,
              incidentais, especiais ou consequenciais decorrentes do uso ou da impossibilidade de uso do
              Serviço.
            </p>
            <p>
              Nossa responsabilidade total perante você, por quaisquer reclamações decorrentes destes
              Termos, fica limitada ao valor pago por você ao Serviço nos últimos 12 (doze) meses.
            </p>
          </section>

          <section>
            <h2>10. Rescisão</h2>
            <p>
              Você pode cancelar sua conta a qualquer momento. Reservamo-nos o direito de suspender ou
              encerrar contas que violem estes Termos, com ou sem aviso prévio.
            </p>
            <p>
              Após o cancelamento, seus dados serão mantidos por 90 (noventa) dias para fins de
              recuperação, após os quais serão permanentemente excluídos, exceto quando a retenção for
              exigida por lei.
            </p>
          </section>

          <section>
            <h2>11. Alterações nos Termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Notificaremos você sobre alterações
              materiais com pelo menos 30 (trinta) dias de antecedência por e-mail. O uso continuado
              do Serviço após a entrada em vigor das alterações constitui aceitação dos novos Termos.
            </p>
          </section>

          <section>
            <h2>12. Legislação Aplicável</h2>
            <p>
              Estes Termos são regidos pelas leis do Brasil. Qualquer disputa será submetida ao foro
              da comarca de São Paulo — SP, com renúncia expressa a qualquer outro foro.
            </p>
          </section>

          <section>
            <h2>13. Contato</h2>
            <p>
              Para dúvidas sobre estes Termos, entre em contato pelo e-mail{" "}
              <a href="mailto:legal@conversia.ai">legal@conversia.ai</a>.
            </p>
          </section>
        </article>

        <footer className="legal-footer">
          <a href="/login" className="legal-back-link">← Voltar para o login</a>
          <a href="/privacy" className="legal-link">Política de Privacidade</a>
        </footer>
      </div>
    </div>
  );
}
