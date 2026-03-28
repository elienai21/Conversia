import { useState } from "react";
import { HelpCircle, BookOpen, MessageCircle, Mail, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import "./SupportPage.css";

const FAQ_ITEMS = [
  {
    q: "Como conecto meu número do WhatsApp Business?",
    a: "Acesse Configurações > Integrações e clique em 'Conectar WhatsApp'. Você precisará informar suas credenciais da API do WhatsApp Business (ID do número de telefone e Token de acesso) obtidas no Meta Business Manager.",
  },
  {
    q: "Como funciona a resposta automática da IA?",
    a: "Quando uma nova mensagem do cliente chega, nossa IA analisa o contexto da conversa e sua base de conhecimento para gerar uma resposta sugerida. Você pode configurar o comportamento da IA (envio automático ou apenas sugestão) em Configurações > Configuração de IA.",
  },
  {
    q: "Como adiciono entradas à Base de Conhecimento?",
    a: "Acesse Configurações > Base de Conhecimento. Clique em 'Adicionar Entrada' e forneça um par de pergunta e resposta. A IA usa essas entradas para gerar respostas mais precisas para seus clientes.",
  },
  {
    q: "Posso atribuir conversas a agentes específicos?",
    a: "Sim. Administradores podem atribuir conversas a qualquer agente diretamente na Caixa de Entrada. Clique em uma conversa e use o menu de atribuição para selecionar um agente. Você também pode configurar regras de atribuição automática em Configurações.",
  },
  {
    q: "Quais idiomas são suportados?",
    a: "O Conversia detecta e responde automaticamente no idioma do cliente. A IA suporta todos os principais idiomas, incluindo português, inglês, espanhol, francês, alemão, italiano, japonês, chinês, coreano, árabe e muitos outros.",
  },
];

export function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="support-page animate-fade-in scrollable-content">
      <div className="support-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Suporte</h1>
          <p className="text-muted">Obtenha ajuda com o Conversia ou entre em contato com nossa equipe.</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="support-links-grid">
        <a href="https://docs.conversia.ai" target="_blank" rel="noopener noreferrer" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(14,165,233,0.1)" }}>
            <BookOpen size={22} color="#0ea5e9" />
          </div>
          <div className="support-link-content">
            <h3>Documentação</h3>
            <p>Guias, tutoriais e referência de API.</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>

        <a href="mailto:suporte@conversia.ai" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(16,185,129,0.1)" }}>
            <Mail size={22} color="#10b981" />
          </div>
          <div className="support-link-content">
            <h3>Suporte por E-mail</h3>
            <p>Fale com nossa equipe em suporte@conversia.ai</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>

        <a href="https://community.conversia.ai" target="_blank" rel="noopener noreferrer" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(168,85,247,0.1)" }}>
            <MessageCircle size={22} color="#a855f7" />
          </div>
          <div className="support-link-content">
            <h3>Comunidade</h3>
            <p>Participe de discussões e compartilhe boas práticas.</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>
      </div>

      {/* FAQ */}
      <div className="faq-section glass-panel">
        <h2 className="faq-title">
          <HelpCircle size={20} className="text-brand-primary" />
          Perguntas Frequentes
        </h2>

        <div className="faq-list">
          {FAQ_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className={`faq-item ${openFaq === idx ? "open" : ""}`}
              onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
            >
              <div className="faq-question">
                <span>{item.q}</span>
                {openFaq === idx ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </div>
              {openFaq === idx && (
                <div className="faq-answer">{item.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
