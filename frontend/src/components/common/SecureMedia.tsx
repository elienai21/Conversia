import { useEffect, useState } from "react";
import { ApiService, API_URL } from "../../services/api";

type SecureMediaProps = {
  src: string;
  type: "image" | "video" | "audio";
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function SecureMedia({ src, type, alt, className, style }: SecureMediaProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    // If it's an external absolute URL (different origin) or data URI, use it directly.
    // However, if it's an absolute URL pointing to our own API, we MUST still use the secure loader.
    const isInternalAbsolute = src.startsWith(API_URL);
    if ((src.startsWith("http") && !isInternalAbsolute) || src.startsWith("data:")) {
      setObjectUrl(src);
      setLoading(false);
      return;
    }

    let isMounted = true;
    let urlToRevoke: string | null = null;

    async function loadMedia() {
      try {
        setLoading(true);
        setError(false);
        
        // Determinar endpoint relativo à API_URL
        let endpoint = src;
        
        // Se for URL absoluta que aponta para nossa API, extraímos o path
        if (src.startsWith(API_URL)) {
          endpoint = src.substring(API_URL.length);
        } else if (src.startsWith("/api/v1")) {
          endpoint = src.substring(7);
        }
        
        // Garantir que comece com barra
        if (!endpoint.startsWith("/")) {
          endpoint = "/" + endpoint;
        }

        const blob = await ApiService.getBlob(endpoint);
        
        if (isMounted) {
          urlToRevoke = URL.createObjectURL(blob);
          setObjectUrl(urlToRevoke);
        }
      } catch (err) {
        if (isMounted) {
          console.error("Failed to load secure media:", err);
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadMedia();

    return () => {
      isMounted = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [src]);

  if (loading) {
    return (
      <div 
        className={`media-loading-placeholder ${className || ''}`}
        style={{ 
          ...style, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          background: "var(--surface-color)",
          color: "var(--text-secondary)" 
        }}
      >
        <span>Carregando...</span>
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div 
        className={`media-error-placeholder ${className || ''}`}
        style={{ 
          ...style, 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          background: "var(--error-surface)",
          color: "var(--text-error)" 
        }}
      >
        <span>Falha ao carregar</span>
      </div>
    );
  }

  if (type === "video") {
    return (
      <video
        controls
        src={objectUrl}
        className={className}
        style={style}
      />
    );
  }

  if (type === "audio") {
    return (
      <audio
        controls
        src={objectUrl}
        className={className}
        style={{ ...style, width: "100%" }}
      />
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt || "Media attachment"}
      className={className}
      style={style}
    />
  );
}
