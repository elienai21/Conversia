import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import "./AudioRecorder.css";

type AudioRecorderProps = {
  onTranscription: (text: string) => void;
  onUpload: (audioBlob: Blob) => Promise<string>;
  disabled?: boolean;
};

export function AudioRecorder({ onTranscription, onUpload, disabled }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        setIsProcessing(true);
        const audioBlob = new Blob(chunksRef.current, { type: "audio/webm" });
        
        // Stop all tracks to release the microphone completely
        stream.getTracks().forEach(track => track.stop());

        try {
          const text = await onUpload(audioBlob);
          if (text) {
            onTranscription(text);
          }
        } catch (error) {
          console.error("Failed to transcribe audio:", error);
          alert("Failed to process audio. Please try again.");
        } finally {
          setIsProcessing(false);
          setIsRecording(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
      alert("Microphone access is required to use this feature.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  if (isProcessing) {
    return (
      <button className="audio-recorder-btn processing" disabled title="Processing audio...">
        <Loader2 size={20} className="animate-spin" />
      </button>
    );
  }

  if (isRecording) {
    return (
      <button className="audio-recorder-btn recording" onClick={stopRecording} title="Stop recording">
        <Square size={16} fill="currentColor" />
        <span className="recording-pulse"></span>
      </button>
    );
  }

  return (
    <button
      className="audio-recorder-btn idle"
      onClick={startRecording}
      disabled={disabled}
      title="Voice typing"
    >
      <Mic size={20} />
    </button>
  );
}
