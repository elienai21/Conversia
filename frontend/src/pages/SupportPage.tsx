import { useState } from "react";
import { HelpCircle, BookOpen, MessageCircle, Mail, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import "./SupportPage.css";

const FAQ_ITEMS = [
  {
    q: "How do I connect my WhatsApp Business number?",
    a: "Go to Settings > Integrations and click 'Connect WhatsApp'. You'll need to enter your WhatsApp Business API credentials (Phone Number ID and Access Token) from Meta's Business Manager.",
  },
  {
    q: "How does the AI auto-response work?",
    a: "When a new customer message arrives, our AI analyzes the conversation context and your knowledge base to generate a suggested response. You can configure the AI behavior (auto-send or suggest-only) in Settings > AI Configuration.",
  },
  {
    q: "How do I add entries to the Knowledge Base?",
    a: "Navigate to Settings > Knowledge Base. Click 'Add Entry' and provide a question-answer pair. The AI uses these entries to generate more accurate responses for your customers.",
  },
  {
    q: "Can I assign conversations to specific agents?",
    a: "Yes. Admins can assign conversations to any agent from the Inbox view. Click on a conversation and use the assignment dropdown to select an agent. You can also configure auto-assignment rules in Settings.",
  },
  {
    q: "What languages are supported?",
    a: "Conversia automatically detects and responds in the customer's language. The AI supports all major languages including English, Spanish, Portuguese, French, German, Italian, Japanese, Chinese, Korean, Arabic, and more.",
  },
];

export function SupportPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="support-page animate-fade-in scrollable-content">
      <div className="support-header">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Support</h1>
          <p className="text-muted">Get help with Conversia or reach out to our team.</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="support-links-grid">
        <a href="https://docs.conversia.ai" target="_blank" rel="noopener noreferrer" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(14,165,233,0.1)" }}>
            <BookOpen size={22} color="#0ea5e9" />
          </div>
          <div className="support-link-content">
            <h3>Documentation</h3>
            <p>Guides, tutorials, and API reference.</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>

        <a href="mailto:support@conversia.ai" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(16,185,129,0.1)" }}>
            <Mail size={22} color="#10b981" />
          </div>
          <div className="support-link-content">
            <h3>Email Support</h3>
            <p>Reach our team at support@conversia.ai</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>

        <a href="https://community.conversia.ai" target="_blank" rel="noopener noreferrer" className="support-link-card glass-panel">
          <div className="support-link-icon" style={{ background: "rgba(168,85,247,0.1)" }}>
            <MessageCircle size={22} color="#a855f7" />
          </div>
          <div className="support-link-content">
            <h3>Community</h3>
            <p>Join discussions and share best practices.</p>
          </div>
          <ExternalLink size={16} className="text-muted" />
        </a>
      </div>

      {/* FAQ */}
      <div className="faq-section glass-panel">
        <h2 className="faq-title">
          <HelpCircle size={20} className="text-brand-primary" />
          Frequently Asked Questions
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
