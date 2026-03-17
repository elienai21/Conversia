import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      "Dashboard": "Dashboard",
      "Inbox": "Inbox",
      "Customers": "Customers",
      "Settings": "Settings",
      "General Settings": "General Settings",
      "Manage company info": "Manage your company's basic information and preferences.",
      "Company Name": "Company Name",
      "URL Slug": "URL Slug (Read-only)",
      "Default Language": "Default Language",
      "Save Changes": "Save Changes",
      "Saving": "Saving...",
      "Settings Saved": "Settings saved successfully!",
      "Save Failed": "Failed to save settings"
    }
  },
  pt: {
    translation: {
      "Dashboard": "Painel de Controle",
      "Inbox": "Caixa de Entrada",
      "Customers": "Clientes",
      "Settings": "Configurações",
      "General Settings": "Configurações Gerais",
      "Manage company info": "Gerencie as informações básicas e preferências da sua empresa.",
      "Company Name": "Nome da Empresa",
      "URL Slug": "URL (Apenas leitura)",
      "Default Language": "Idioma Padrão",
      "Save Changes": "Salvar Alterações",
      "Saving": "Salvando...",
      "Settings Saved": "Configurações salvas com sucesso!",
      "Save Failed": "Falha ao salvar configurações"
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // react already safes from xss
    }
  });

export default i18n;
