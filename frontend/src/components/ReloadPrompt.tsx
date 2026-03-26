import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw, X } from 'lucide-react'

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error: Error | unknown) {
      console.log('SW registration error', error)
    },
  })

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-[var(--bg-secondary)] border border-[var(--glass-border)] rounded-xl shadow-xl p-4 flex flex-col gap-3 min-w-[300px] relative">
        <button 
          onClick={close}
          className="absolute top-2 right-2 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <X size={16} />
        </button>
        
        <div className="pr-6">
          <h3 className="font-semibold text-sm">
            {offlineReady ? 'App pronto para uso offline' : 'Nova atualização disponível!'}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            {offlineReady 
              ? 'A Conversia fará cache automático para funcionar sem internet.'
              : 'Clique no botão abaixo para aplicar a nova versão.'}
          </p>
        </div>

        {needRefresh && (
          <button 
            onClick={() => updateServiceWorker(true)}
            className="flex items-center justify-center gap-2 w-full btn-primary text-sm py-2"
          >
            <RefreshCw size={14} />
            Atualizar Agora
          </button>
        )}
      </div>
    </div>
  )
}
