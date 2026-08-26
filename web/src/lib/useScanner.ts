import { useCallback, useEffect, useRef, useState } from 'react';

export type ScanState = 'idle' | 'starting' | 'scanning' | 'denied' | 'unsupported' | 'error';
export type ScanResult = { text: string; format: string };

// EAN/UPC pour l'alimentaire, DataMatrix pour les boîtes de médicaments.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'data_matrix', 'qr_code'];

/**
 * Caméra + lecture de code. On préfère BarcodeDetector (natif, économe) quand
 * il existe, et on retombe sur ZXing — le cas d'iOS Safari, notre cible.
 */
export function useScanner(onResult: (r: ScanResult) => void, active: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const stopFnRef = useRef<(() => void) | null>(null);
  // Le callback change à chaque rendu ; la boucle de scan lit toujours le dernier.
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const doneRef = useRef(false);

  const stop = useCallback(() => {
    stopFnRef.current?.();
    stopFnRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }, [torchOn]);

  useEffect(() => {
    if (!active) {
      stop();
      setState('idle');
      return;
    }

    let cancelled = false;
    doneRef.current = false;
    setState('starting');
    setMessage(null);

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('unsupported');
        setMessage(
          window.isSecureContext
            ? "Ce navigateur n'expose pas la caméra."
            : "La caméra exige une connexion sécurisée (HTTPS).",
        );
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (cancelled) return;
        const name = (err as DOMException).name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error');
        setMessage(name === 'NotFoundError' ? "Aucune caméra détectée sur cet appareil." : null);
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      setTorchAvailable(Boolean(track?.getCapabilities?.()?.torch));

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      try { await video.play(); } catch { /* iOS rejoue tout seul au premier geste */ }
      if (cancelled) return;
      setState('scanning');

      const emit = (text: string, format: string) => {
        if (doneRef.current || !text) return;
        doneRef.current = true;
        // Retour haptique quand l'appareil le permet.
        navigator.vibrate?.(30);
        resultRef.current({ text, format });
      };

      const Detector = (window as any).BarcodeDetector;
      if (Detector) {
        const supported: string[] = (await Detector.getSupportedFormats?.().catch(() => [])) ?? [];
        const formats = NATIVE_FORMATS.filter((f) => !supported.length || supported.includes(f));
        const detector = new Detector({ formats });
        let raf = 0;
        const tick = async () => {
          if (cancelled || doneRef.current) return;
          try {
            const found = await detector.detect(video);
            if (found?.length) emit(found[0].rawValue, found[0].format);
          } catch { /* image non prête : on réessaie à la frame suivante */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        stopFnRef.current = () => cancelAnimationFrame(raf);
        return;
      }

      // Repli ZXing (iOS Safari) : chargé seulement quand il sert.
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      if (cancelled) return;
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [
        BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E,
        BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.DATA_MATRIX, BarcodeFormat.QR_CODE,
      ]);
      hints.set(DecodeHintType.TRY_HARDER, true);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) emit(result.getText(), String(result.getBarcodeFormat()));
      });
      stopFnRef.current = () => controls.stop();
    })().catch(() => {
      if (!cancelled) setState('error');
    });

    return () => {
      cancelled = true;
      stop();
    };
  }, [active, stop]);

  /** Réarme le lecteur après une lecture (retour sur l'écran de scan). */
  const rearm = useCallback(() => { doneRef.current = false; }, []);

  return { videoRef, state, message, torchAvailable, torchOn, toggleTorch, rearm };
}
