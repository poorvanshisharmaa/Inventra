/**
 * VoiceAssistant — floating microphone button in the top nav.
 *
 * Flow:
 *  1. User clicks mic  → MediaRecorder starts capturing audio
 *  2. User clicks stop  → audio blob POSTed to /api/voice/transcribe (Groq Whisper)
 *  3. Transcript POSTed to /api/voice/execute (Llama 3.3-70B function calling)
 *  4. Natural-language reply spoken aloud via Web Speech API (SpeechSynthesis)
 *  5. Result card shown in the popover panel
 */

import { useState, useRef, useCallback } from 'react';
import { Mic, MicOff, Loader2, Volume2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { voiceApi, VoiceExecuteResult } from '@/services/api';

// ─── TTS helper ───────────────────────────────────────────────────────────────
function speak(text: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt  = new SpeechSynthesisUtterance(text);
  utt.rate   = 1.05;
  utt.pitch  = 1;
  utt.volume = 1;
  // prefer a natural English voice if available
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v =>
    /en[-_](US|GB|AU)/i.test(v.lang) && /google|alex|samantha|natural/i.test(v.name)
  ) ?? voices.find(v => /en/i.test(v.lang));
  if (preferred) utt.voice = preferred;
  window.speechSynthesis.speak(utt);
}

type Phase = 'idle' | 'recording' | 'processing' | 'done' | 'error';

interface HistoryEntry {
  id:     string;
  transcript: string;
  reply:      string;
  toolCalled: string | null;
  toolResult: unknown;
}

export function VoiceAssistant() {
  const [phase,   setPhase]   = useState<Phase>('idle');
  const [open,    setOpen]    = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<HistoryEntry | null>(null);
  const [error,   setError]   = useState<string>('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const mediaRef    = useRef<MediaRecorder | null>(null);
  const chunksRef   = useRef<Blob[]>([]);

  // ── Start recording ──────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    setError('');
    setCurrent(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await processAudio(blob);
      };

      recorder.start();
      mediaRef.current = recorder;
      setPhase('recording');
      setOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied.';
      setError(msg);
      setPhase('error');
      setOpen(true);
    }
  }, []);

  // ── Stop recording ───────────────────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (mediaRef.current?.state === 'recording') {
      mediaRef.current.stop();
      setPhase('processing');
    }
  }, []);

  // ── Send audio → transcribe → execute ────────────────────────────────────
  const processAudio = async (blob: Blob) => {
    try {
      setPhase('processing');

      const fd = new FormData();
      fd.append('audio', blob, 'voice.webm');

      const { data: { transcript } } = await voiceApi.transcribe(fd);
      if (!transcript) {
        setError('No speech detected. Please try again.');
        setPhase('error');
        return;
      }

      const { data } = await voiceApi.execute(transcript) as { data: VoiceExecuteResult };

      const entry: HistoryEntry = {
        id:         Date.now().toString(),
        transcript: data.transcript,
        reply:      data.reply,
        toolCalled: data.toolCalled,
        toolResult: data.toolResult,
      };

      setCurrent(entry);
      setHistory(prev => [entry, ...prev].slice(0, 10));
      setPhase('done');

      // Speak the reply
      speak(data.reply);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message
        ?? (err instanceof Error ? err.message : 'Something went wrong.');
      setError(msg);
      setPhase('error');
    }
  };

  const isRecording  = phase === 'recording';
  const isProcessing = phase === 'processing';

  return (
    <div className="relative">
      {/* ── Mic button ────────────────────────────────────────────────── */}
      <Button
        variant="ghost"
        size="icon"
        className={`relative h-9 w-9 rounded-lg transition-all ${
          isRecording ? 'bg-red-500/20 text-red-400 animate-pulse' :
          isProcessing ? 'bg-primary/20' : ''
        }`}
        onClick={() => {
          if (isRecording)     stopRecording();
          else if (!isProcessing) { setOpen(o => !o); if (!open) setPhase('idle'); }
        }}
        title={isRecording ? 'Stop recording' : 'Voice assistant'}
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4 text-red-400" />
        ) : (
          <Mic className="h-4 w-4 text-muted-foreground" />
        )}
        {isRecording && (
          <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
        )}
      </Button>

      {/* ── Panel ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 w-80 rounded-xl border border-border/50 bg-popover shadow-xl z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-2">
                <Mic className="h-3.5 w-3.5 text-primary" />
                <span className="text-sm font-semibold">Inventra Voice</span>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="p-4 space-y-4">
              {/* Record button */}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isProcessing}
                  className={`relative h-16 w-16 rounded-full flex items-center justify-center transition-all shadow-md
                    ${isRecording
                      ? 'bg-red-500 text-white shadow-red-500/30 scale-110'
                      : isProcessing
                        ? 'bg-muted cursor-not-allowed'
                        : 'bg-primary text-primary-foreground hover:scale-105 hover:shadow-primary/30'
                    }`}
                >
                  {isProcessing ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : isRecording ? (
                    <MicOff className="h-6 w-6" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                  {isRecording && (
                    <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-30" />
                  )}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  {isRecording
                    ? 'Listening… click to stop'
                    : isProcessing
                      ? 'Processing…'
                      : 'Click to speak a command'}
                </p>
              </div>

              {/* Example commands */}
              {phase === 'idle' && (
                <div className="rounded-lg bg-muted/40 p-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Try saying:</p>
                  {[
                    'What products are running low on stock?',
                    'Show me the last 5 orders',
                    'Give me an inventory summary',
                    'How many units of Laptop Pro do we have?',
                  ].map(cmd => (
                    <p key={cmd} className="text-xs text-foreground/80 flex items-start gap-1.5">
                      <span className="text-primary mt-0.5">›</span>{cmd}
                    </p>
                  ))}
                </div>
              )}

              {/* Error */}
              {phase === 'error' && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* Current result */}
              {phase === 'done' && current && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border/50 bg-muted/30 overflow-hidden"
                >
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">You said</p>
                      <p className="text-xs italic text-foreground/80">"{current.transcript}"</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <p className="text-xs leading-relaxed">{current.reply}</p>
                    </div>
                    {current.toolCalled && (
                      <button
                        className="w-full flex items-center justify-between text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
                        onClick={() => setExpanded(expanded === current.id ? null : current.id)}
                      >
                        <span>Raw data ({current.toolCalled.replace(/_/g, ' ')})</span>
                        {expanded === current.id
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />}
                      </button>
                    )}
                  </div>
                  {expanded === current.id && (
                    <div className="border-t border-border/40 p-3 bg-background/40">
                      <pre className="text-[10px] text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap break-words">
                        {JSON.stringify(current.toolResult, null, 2)}
                      </pre>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Re-ask button after result */}
              {(phase === 'done' || phase === 'error') && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-xs h-8"
                  onClick={() => { setPhase('idle'); setCurrent(null); setError(''); }}
                >
                  Ask another question
                </Button>
              )}
            </div>

            {/* History */}
            {history.length > 1 && (
              <div className="border-t border-border/40 px-4 py-3 bg-muted/20">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">Recent</p>
                <div className="space-y-1.5 max-h-28 overflow-y-auto">
                  {history.slice(1).map(h => (
                    <div key={h.id} className="text-xs text-muted-foreground truncate">
                      <span className="text-foreground/60">›</span> {h.transcript}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
