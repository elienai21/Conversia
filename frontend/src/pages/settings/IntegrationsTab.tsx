import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import "./IntegrationsTab.css";

type IntegrationsInfo = {
  whatsapp: {
    phone_number_id: string | null;
    business_account_id: string | null;
    api_token_set: boolean;
    verify_token: string | null;
  };
  openai: {
    api_key_set: boolean;
    api_key_preview: string | null;
  };
  deepl: {
    api_key_set: boolean;
    api_key_preview: string | null;
  };
  instagram: {
    page_id: string | null;
    page_access_token_set: boolean;
  };
};

export function IntegrationsTab() {
  const [data, setData] = useState<IntegrationsInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [openaiKey, setOpenaiKey] = useState("");
  const [deeplKey, setDeeplKey] = useState("");
  const [whatsappToken, setWhatsappToken] = useState("");
  const [whatsappPhoneId, setWhatsappPhoneId] = useState("");
  const [whatsappBizId, setWhatsappBizId] = useState("");

  const [instagramToken, setInstagramToken] = useState("");
  const [instagramPageId, setInstagramPageId] = useState("");

  const [showOpenai, setShowOpenai] = useState(false);
  const [showDeepl, setShowDeepl] = useState(false);
  const [showWhatsapp, setShowWhatsapp] = useState(false);
  const [showInstagram, setShowInstagram] = useState(false);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      const res = await ApiService.get<IntegrationsInfo>("/tenants/me/integrations");
      setData(res);
      setOpenaiKey(res.openai.api_key_preview || "");
      setDeeplKey(res.deepl.api_key_preview || "");
      setWhatsappToken("");
      setWhatsappPhoneId(res.whatsapp.phone_number_id || "");
      setWhatsappBizId(res.whatsapp.business_account_id || "");
      setInstagramToken("");
      setInstagramPageId(res.instagram.page_id || "");
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const payload: Record<string, string> = {};
      if (openaiKey && !openaiKey.includes("...")) payload.openai_api_key = openaiKey;
      if (deeplKey && !deeplKey.includes("...")) payload.deepl_api_key = deeplKey;
      if (whatsappToken) payload.whatsapp_api_token = whatsappToken;
      if (whatsappPhoneId) payload.whatsapp_phone_number_id = whatsappPhoneId;
      if (whatsappBizId) payload.whatsapp_business_account_id = whatsappBizId;
      if (instagramToken) payload.instagram_page_access_token = instagramToken;
      if (instagramPageId) payload.instagram_page_id = instagramPageId;

      await ApiService.patch("/tenants/me/integrations", payload);
      alert("Integrations saved successfully!");
      await loadIntegrations();
    } catch (error) {
      console.error(error);
      alert("Failed to save integrations");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container integrations-tab">
      <div className="tab-header">
        <h1>Integrations</h1>
        <p>Connect your tenant with external APIs and services.</p>
      </div>

      <form className="settings-form" onSubmit={handleSave}>
        {/* OpenAI Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>OpenAI</h3>
              {data?.openai.api_key_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14}/> Connected</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14}/> Not configured</span>
              )}
            </div>
            <p>Used for Copilot suggestions and AI features.</p>
          </div>
          <div className="form-group relative-input">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                type={showOpenai ? "text" : "password"}
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                placeholder="sk-..."
              />
              <button type="button" className="icon-btn" onClick={() => setShowOpenai(!showOpenai)}>
                {showOpenai ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* DeepL Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>DeepL</h3>
              {data?.deepl.api_key_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14}/> Connected</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14}/> Not configured</span>
              )}
            </div>
            <p>Provides highly accurate auto-translation of messages.</p>
          </div>
          <div className="form-group relative-input">
            <label>API Key</label>
            <div className="input-with-icon">
              <input
                type={showDeepl ? "text" : "password"}
                value={deeplKey}
                onChange={(e) => setDeeplKey(e.target.value)}
                placeholder="DeepL Auth Key"
              />
              <button type="button" className="icon-btn" onClick={() => setShowDeepl(!showDeepl)}>
                {showDeepl ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
        </div>

        {/* WhatsApp Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>WhatsApp Cloud API</h3>
              {data?.whatsapp.api_token_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14}/> Connected</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14}/> Not configured</span>
              )}
            </div>
            <p>Connect your business WhatsApp number.</p>
          </div>
          <div className="form-group relative-input">
            <label>API Token (Permanent)</label>
            <div className="input-with-icon">
              <input
                type={showWhatsapp ? "text" : "password"}
                value={whatsappToken}
                onChange={(e) => setWhatsappToken(e.target.value)}
                placeholder="EAA..."
              />
              <button type="button" className="icon-btn" onClick={() => setShowWhatsapp(!showWhatsapp)}>
                {showWhatsapp ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Phone Number ID</label>
            <input
              type="text"
              value={whatsappPhoneId}
              onChange={(e) => setWhatsappPhoneId(e.target.value)}
              placeholder="e.g. 10123456789"
            />
          </div>
          <div className="form-group">
            <label>Business Account ID</label>
            <input
              type="text"
              value={whatsappBizId}
              onChange={(e) => setWhatsappBizId(e.target.value)}
              placeholder="e.g. 10098765432"
            />
          </div>
        </div>

        {/* Instagram DM Card */}
        <div className="integration-card glass-panel">
          <div className="integration-header">
            <div className="integration-title">
              <h3>Instagram DM</h3>
              {data?.instagram.page_access_token_set ? (
                <span className="status-badge connected"><CheckCircle2 size={14}/> Connected</span>
              ) : (
                <span className="status-badge disconnected"><XCircle size={14}/> Not configured</span>
              )}
            </div>
            <p>Receive and reply to Instagram Direct Messages.</p>
          </div>
          <div className="form-group relative-input">
            <label>Page Access Token</label>
            <div className="input-with-icon">
              <input
                type={showInstagram ? "text" : "password"}
                value={instagramToken}
                onChange={(e) => setInstagramToken(e.target.value)}
                placeholder="EAA..."
              />
              <button type="button" className="icon-btn" onClick={() => setShowInstagram(!showInstagram)}>
                {showInstagram ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Instagram Page ID</label>
            <input
              type="text"
              value={instagramPageId}
              onChange={(e) => setInstagramPageId(e.target.value)}
              placeholder="e.g. 17841400000000000"
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Save Integrations"}
          </button>
        </div>
      </form>
    </div>
  );
}
