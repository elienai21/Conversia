// src/pages/PrivacyPage.tsx
import "./LegalPage.css";

export function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-container">
        <header className="legal-header">
          <div className="legal-logo">
            <span className="legal-brand">Conversia</span>
          </div>
          <h1>Política de Privacidade</h1>
          <p className="legal-updated">Última atualização: 27 de março de 2026</p>
        </header>

        <article className="legal-content">
          <section>
            <h2>1. Quem somos</h2>
            <p>
              A Conversia é a controladora dos dados pessoais coletados por meio de nossa plataforma.
              Este documento explica quais dados coletamos, como os usamos, com quem os compartilhamos
              e quais são seus direitos, em conformidade com a Lei Geral de Proteção de Dados
              (Lei nº 13.709/2018 — LGPD).
            </p>
          </section>

          <section>
            <h2>2. Dados que coletamos</h2>
            <h3>2.1 Dados fornecidos por você</h3>
            <ul>
              <li>Nome completo e e-mail (cadastro e autenticação)</li>
              <li>Nome da empresa e informações de contato</li>
              <li>Dados de pagamento (processados pelo Stripe — não armazenamos dados de cartão)</li>
              <li>Conteúdo de mensagens e conversas gerenciadas na plataforma</li>
            </ul>
            <h3>2.2 Dados coletados automaticamente</h3>
            <ul>
              <li>Endereço IP e localização aproximada</li>
              <li>Tipo de dispositivo e navegador (User-Agent)</li>
              <li>Logs de acesso e ações na plataforma (auditoria)</li>
              <li>Cookies de sessão (necessários para autenticação)</li>
            </ul>
          </section>

          <section>
            <h2>3. Finalidade do tratamento</h2>
            <p>Tratamos seus dados para as seguintes finalidades:</p>
            <ul>
              <li><strong>Prestação do serviço:</strong> fornecer, manter e melhorar a plataforma;</li>
              <li><strong>Autenticação:</strong> verificar sua identidade e controlar o acesso;</li>
              <li><strong>Cobrança:</strong> processar pagamentos e emitir notas fiscais;</li>
              <li><strong>Comunicações:</strong> enviar notificações de segurança, atualizações e suporte;</li>
              <li><strong>Conformidade legal:</strong> cumprir obrigações legais, incluindo a LGPD;</li>
              <li><strong>Melhoria do produto:</strong> análise agregada de uso para desenvolvimento de features.</li>
            </ul>
          </section>

          <section>
            <h2>4. Base legal para o tratamento</h2>
            <p>Tratamos seus dados com base nas seguintes hipóteses legais da LGPD (art. 7º):</p>
            <ul>
              <li><strong>Execução de contrato</strong> — para fornecer o Serviço contratado;</li>
              <li><strong>Consentimento</strong> — para envio de comunicações de marketing (revogável a qualquer momento);</li>
              <li><strong>Cumprimento de obrigação legal</strong> — para atender à legislação aplicável;</li>
              <li><strong>Legítimo interesse</strong> — para segurança da plataforma e prevenção a fraudes.</li>
            </ul>
          </section>

          <section>
            <h2>5. Compartilhamento de dados</h2>
            <p>Compartilhamos seus dados apenas com:</p>
            <ul>
              <li><strong>Stripe:</strong> processamento de pagamentos;</li>
              <li><strong>Resend:</strong> envio de e-mails transacionais;</li>
              <li><strong>OpenAI:</strong> processamento de IA (apenas conteúdo de mensagens, sem PII desnecessária);</li>
              <li><strong>Railway / Render:</strong> infraestrutura de hospedagem em nuvem;</li>
              <li><strong>Autoridades competentes:</strong> quando exigido por lei ou ordem judicial.</li>
            </ul>
            <p>Não vendemos seus dados pessoais a terceiros.</p>
          </section>

          <section>
            <h2>6. Retenção de dados</h2>
            <p>
              Mantemos seus dados pelo período necessário para a prestação do Serviço e cumprimento de
              obrigações legais. Após o cancelamento da conta, os dados são mantidos por 90 (noventa) dias
              para recuperação, após os quais são excluídos permanentemente — exceto quando a retenção
              for exigida por lei (por exemplo, dados fiscais, que podem ser mantidos por até 5 anos).
            </p>
          </section>

          <section>
            <h2>7. Seus direitos (LGPD, art. 18)</h2>
            <p>Você tem os seguintes direitos em relação aos seus dados pessoais:</p>
            <ul>
              <li><strong>Acesso:</strong> confirmar a existência e acessar seus dados;</li>
              <li><strong>Correção:</strong> corrigir dados incompletos, inexatos ou desatualizados;</li>
              <li><strong>Anonimização ou eliminação:</strong> quando desnecessários ou tratados com seu consentimento;</li>
              <li><strong>Portabilidade:</strong> receber seus dados em formato estruturado;</li>
              <li><strong>Informação:</strong> sobre com quem compartilhamos seus dados;</li>
              <li><strong>Revogação do consentimento:</strong> a qualquer momento;</li>
              <li><strong>Oposição:</strong> ao tratamento realizado com base em legítimo interesse.</li>
            </ul>
            <p>
              Para exercer esses direitos, entre em contato pelo e-mail{" "}
              <a href="mailto:privacidade@conversia.ai">privacidade@conversia.ai</a>. Responderemos em
              até 15 (quinze) dias.
            </p>
          </section>

          <section>
            <h2>8. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo:
              criptografia em trânsito (TLS 1.3), criptografia em repouso para dados sensíveis
              (AES-256), controle de acesso por função (RBAC) e logs de auditoria. Em caso de
              incidente de segurança que afete seus dados, notificaremos a ANPD e os titulares
              afetados conforme exigido pela LGPD.
            </p>
          </section>

          <section>
            <h2>9. Cookies</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para autenticação e manutenção de
              sessão. Não utilizamos cookies de rastreamento de terceiros ou publicidade.
            </p>
          </section>

          <section>
            <h2>10. Transferência internacional</h2>
            <p>
              Alguns de nossos fornecedores (OpenAI, Stripe) processam dados fora do Brasil. Garantimos
              que tais transferências ocorrem com salvaguardas adequadas, incluindo cláusulas contratuais
              padrão, em conformidade com o art. 33 da LGPD.
            </p>
          </section>

          <section>
            <h2>11. Encarregado de Dados (DPO)</h2>
            <p>
              Nosso Encarregado de Proteção de Dados pode ser contactado pelo e-mail{" "}
              <a href="mailto:privacidade@conversia.ai">privacidade@conversia.ai</a>.
            </p>
          </section>

          <section>
            <h2>12. Alterações nesta Política</h2>
            <p>
              Podemos atualizar esta Política periodicamente. Alterações materiais serão comunicadas
              com antecedência mínima de 30 (trinta) dias por e-mail.
            </p>
          </section>

          <section>
            <h2>13. Autoridade supervisora</h2>
            <p>
              Você tem o direito de registrar uma reclamação junto à Autoridade Nacional de Proteção
              de Dados (ANPD): <a href="https://www.gov.br/anpd" target="_blank" rel="noreferrer">www.gov.br/anpd</a>.
            </p>
          </section>
        </article>

        <footer className="legal-footer">
          <a href="/login" className="legal-back-link">← Voltar para o login</a>
          <a href="/terms" className="legal-link">Termos de Uso</a>
        </footer>
      </div>
    </div>
  );
}
