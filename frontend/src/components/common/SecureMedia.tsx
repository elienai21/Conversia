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
    // If it's an absolute URL (external) or data URI, use it directly
    if (src.startsWith("http") || src.startsWith("data:")) {
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
        // Ensure path is relative for ApiService (which adds API_URL)
        let endpoint = src;
        if (src.startsWith(API_URL)) {
          endpoint = src.replace(API_URL, "");
        } else if (src.startsWith("/api/v1")) {
          endpoint = src.replace("/api/v1", "");
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
