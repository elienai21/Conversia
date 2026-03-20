import { useState, useEffect } from "react";
import { ApiService } from "@/services/api";
import { Loader2, Zap } from "lucide-react";

type AISettingsInfo = {
  openai_model: string;
  ai_temperature: number;
  ai_system_prompt: string;
  ai_max_tokens: number;
  enable_auto_response: boolean;
  auto_response_intents: string[];
};

const AVAILABLE_INTENTS = [
  { value: "greeting", label: "Greeting", description: "Hello, hi, good morning..." },
  { value: "reservation", label: "Reservation", description: "Booking inquiries and modifications" },
  { value: "inquiry", label: "General Inquiry", description: "Questions about services, amenities..." },
  { value: "complaint", label: "Complaint", description: "Issues and complaints" },
  { value: "checkout", label: "Checkout", description: "Check-out related questions" },
  { value: "room_service", label: "Room Service", description: "Room service requests and info" },
  { value: "feedback", label: "Feedback", description: "Reviews and feedback" },
];

export function AISettingsTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [model, setModel] = useState("gpt-4.1-mini");
  const [temperature, setTemperature] = useState(0.7);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [maxTokens, setMaxTokens] = useState(200);
  const [enableAutoResponse, setEnableAutoResponse] = useState(false);
  const [autoResponseIntents, setAutoResponseIntents] = useState<string[]>([]);

  useEffect(() => {
    ApiService.get<AISettingsInfo>("/tenants/me/ai-settings")
      .then((res) => {
        setModel(res.openai_model);
        setTemperature(res.ai_temperature);
        setSystemPrompt(res.ai_system_prompt || "");
        setMaxTokens(res.ai_max_tokens);
        setEnableAutoResponse(res.enable_auto_response);
        setAutoResponseIntents(res.auto_response_intents || []);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await ApiService.patch("/tenants/me/ai-settings", {
        openai_model: model,
        ai_temperature: temperature,
        ai_system_prompt: systemPrompt,
        ai_max_tokens: maxTokens,
        enable_auto_response: enableAutoResponse,
        auto_response_intents: autoResponseIntents,
      });
      alert("AI Settings saved successfully!");
    } catch (error) {
      console.error(error);
      alert("Failed to save AI Settings");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex-center p-8"><Loader2 className="animate-spin text-brand" size={32} /></div>;
  }

  return (
    <div className="tab-container ai-settings-tab">
      <div className="tab-header">
        <h1>AI Settings</h1>
        <p>Configure how your AI Copilot responds and behaves.</p>
      </div>

      <form className="settings-form" onSubmit={handleSave}>
        <div className="form-group">
          <label>OpenAI Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="gpt-4.1-mini">GPT-4.1 Mini (Fast, Cheap)</option>
            <option value="gpt-4.1">GPT-4.1 (Standard, Default)</option>
            <option value="gpt-4o">GPT-4o (Premium)</option>
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Legacy)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Temperature ({temperature})</label>
          <div className="flex items-center gap-4">
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.1" 
              value={temperature} 
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              className="w-full h-2 bg-[var(--bg-tertiary)] rounded-full appearance-none cursor-pointer"
            />
            <span className="text-sm font-medium w-8 text-center">{temperature}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">Lower values are more deterministic. Higher values are more creative.</p>
        </div>

        <div className="form-group">
          <label>Max Tokens</label>
          <input 
            type="number" 
            min="50" 
            max="2000" 
            value={maxTokens} 
            onChange={(e) => setMaxTokens(parseInt(e.target.value))}
          />
        </div>

        <div className="form-group">
          <label>System Prompt (Persona & Instructions)</label>
          <textarea 
            rows={8}
            value={systemPrompt} 
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful customer service assistant for our hotel..."
          />
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Note: This prompt will be combined automatically with active Knowledge Base entries.
          </p>
        </div>

        {/* FAQ Auto-Response Section */}
        <div className="form-section-divider" style={{ borderTop: '1px solid var(--glass-border)', margin: '2rem 0', paddingTop: '2rem' }}>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={18} className="text-brand-primary" />
            <h2 className="text-lg font-medium">FAQ Auto-Response</h2>
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-6">
            Automatically respond to common questions using your Knowledge Base entries. When enabled, matching intents get an instant AI-generated answer without waiting for an agent.
          </p>

          <div className="form-group">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className="toggle-switch"
                style={{
                  width: 44, height: 24, borderRadius: 12,
                  background: enableAutoResponse ? 'var(--brand-primary)' : 'var(--bg-tertiary)',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                }}
                onClick={() => setEnableAutoResponse(!enableAutoResponse)}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: 3,
                  left: enableAutoResponse ? 23 : 3,
                  transition: 'left 0.2s',
                }} />
              </div>
              <span>Enable FAQ Auto-Response</span>
            </label>
          </div>

          {enableAutoResponse && (
            <div className="form-group">
              <label>Auto-Response Intents</label>
              <p className="text-xs text-[var(--text-muted)] mb-3">
                Select which detected intents should trigger an automatic FAQ response.
              </p>
              <div className="flex flex-col gap-2">
                {AVAILABLE_INTENTS.map((intent) => (
                  <label key={intent.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors">
                    <input
                      type="checkbox"
                      checked={autoResponseIntents.includes(intent.value)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setAutoResponseIntents([...autoResponseIntents, intent.value]);
                        } else {
                          setAutoResponseIntents(autoResponseIntents.filter((i) => i !== intent.value));
                        }
                      }}
                      style={{ accentColor: 'var(--brand-primary)', width: 16, height: 16 }}
                    />
                    <div>
                      <span className="text-sm font-medium">{intent.label}</span>
                      <span className="text-xs text-[var(--text-muted)] ml-2">{intent.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : "Save AI Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
