/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioFile, AudioContext, MusicGenerationContext } from '../types/audio';
import { getMusicForContext } from '../services/audioService';

interface UseBackgroundMusicOptions {
  enabled?: boolean;
  volume?: number;
  crossfadeDuration?: number;
  autoPlay?: boolean;
}

interface UseBackgroundMusicReturn {
  isPlaying: boolean;
  isLoading: boolean;
  currentTrack: AudioFile | null;
  mainTheme: AudioFile | null;
  overlayTrack: AudioFile | null;
  error: string | null;
  play: () => void;
  pause: () => void;
  setVolume: (volume: number) => void;
  changeMusic: (context: MusicGenerationContext, audioContext: AudioContext) => Promise<void>;
  loadMainTheme: (context: MusicGenerationContext) => Promise<void>;
  playOverlay: (context: MusicGenerationContext, audioContext: AudioContext) => Promise<void>;
  stopOverlay: () => Promise<void>;
  duckMainTheme: (targetVolume?: number) => Promise<void>;
  restoreMainTheme: () => Promise<void>;
  stopMainTheme: () => Promise<void>;
}

/**
 * React hook for managing background music with smooth transitions
 */
export const useBackgroundMusic = (
  options: UseBackgroundMusicOptions = {}
): UseBackgroundMusicReturn => {
  const {
    enabled = true,
    volume: initialVolume = 0.5,
    crossfadeDuration = 2000,
    autoPlay = true,
  } = options;

  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<AudioFile | null>(null);
  const [mainTheme, setMainTheme] = useState<AudioFile | null>(null);
  const [overlayTrack, setOverlayTrack] = useState<AudioFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Refs for audio elements - dual layer system
  const mainThemeAudioRef = useRef<HTMLAudioElement | null>(null);
  const overlayAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null); // For defeat/victory (legacy)
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const volumeRef = useRef(initialVolume);
  const mainThemeVolumeRef = useRef(initialVolume);

  // Audio context for advanced playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  /**
   * Initialize Web Audio API context
   */
  useEffect(() => {
    if (!enabled) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioContextRef.current = new AudioContextClass();
    gainNodeRef.current = audioContextRef.current.createGain();
    gainNodeRef.current.connect(audioContextRef.current.destination);
    gainNodeRef.current.gain.value = volumeRef.current;

    return () => {
      if (audioContextRef.current?.state !== 'closed') {
        audioContextRef.current?.close();
      }
    };
  }, [enabled]);

  /**
   * Set volume
   */
  const setVolume = useCallback((newVolume: number) => {
    volumeRef.current = Math.max(0, Math.min(1, newVolume));
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volumeRef.current;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.volume = volumeRef.current;
    }
  }, []);

  /**
   * Play/resume audio - prioritizes main theme if available
   */
  const play = useCallback(() => {
    console.log('[useBackgroundMusic] Playing/resuming audio...');

    // Prioritize main theme (the primary audio layer)
    if (mainThemeAudioRef.current) {
      mainThemeAudioRef.current.play().catch((err) => {
        console.error('[useBackgroundMusic] Main theme play failed:', err);
        setError('Failed to play main theme');
      });
      console.log('[useBackgroundMusic] Main theme resumed');
      setIsPlaying(true);
      return;
    }

    // Fallback to legacy single track
    if (currentAudioRef.current) {
      currentAudioRef.current.play().catch((err) => {
        console.error('[useBackgroundMusic] Play failed:', err);
        setError('Failed to play music');
      });
      setIsPlaying(true);
    }
  }, []);

  /**
   * Pause ALL audio (main theme, overlay, and legacy current track)
   */
  const pause = useCallback(() => {
    console.log('[useBackgroundMusic] Pausing all audio...');

    // Pause legacy single track
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
    }

    // Pause main theme
    if (mainThemeAudioRef.current) {
      mainThemeAudioRef.current.pause();
      console.log('[useBackgroundMusic] Main theme paused');
    }

    // Pause overlay (battle music)
    if (overlayAudioRef.current) {
      overlayAudioRef.current.pause();
      console.log('[useBackgroundMusic] Overlay paused');
    }

    setIsPlaying(false);
  }, []);

  /**
   * Crossfade from current track to next track
   */
  const crossfade = useCallback(
    (fromAudio: HTMLAudioElement, toAudio: HTMLAudioElement, duration: number): Promise<void> => {
      return new Promise((resolve) => {
        const steps = 50;
        const stepDuration = duration / steps;
        let step = 0;

        const interval = setInterval(() => {
          step++;
          const progress = step / steps;

          fromAudio.volume = volumeRef.current * (1 - progress);
          toAudio.volume = volumeRef.current * progress;

          if (step >= steps) {
            clearInterval(interval);
            fromAudio.pause();
            fromAudio.volume = volumeRef.current;
            resolve();
          }
        }, stepDuration);
      });
    },
    []
  );

  /**
   * Change music to a new track with crossfade
   */
  const changeMusic = useCallback(
    async (context: MusicGenerationContext, audioContext: AudioContext) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        // Generate or retrieve music
        const audioFile = await getMusicForContext(context, audioContext);
        setCurrentTrack(audioFile);

        console.log(`[useBackgroundMusic] Loading: ${audioFile.url}`);

        // Create new audio element
        const newAudio = new Audio();
        newAudio.crossOrigin = 'anonymous'; // Enable CORS for external audio
        newAudio.src = audioFile.url; // Set source
        newAudio.loop = audioContext === 'room' || audioContext === 'battle'; // Loop room and battle music
        newAudio.preload = 'auto';
        newAudio.load(); // Explicitly start loading

        console.log(`[useBackgroundMusic] Audio element created, loading started...`);

        // Wait for audio to be ready - try multiple events
        try {
          await new Promise((resolve, reject) => {
            let resolved = false;
            const handleResolve = () => {
              if (!resolved) {
                resolved = true;
                resolve(undefined);
              }
            };

            // Multiple events - whichever fires first
            newAudio.addEventListener('canplaythrough', handleResolve, { once: true });
            newAudio.addEventListener('loadeddata', handleResolve, { once: true });
            newAudio.addEventListener('loadedmetadata', handleResolve, { once: true });
            newAudio.addEventListener('error', (e) => {
              if (!resolved) {
                resolved = true;
                reject(e);
              }
            }, { once: true });

            // Short timeout - just try to play, browser will buffer
            setTimeout(() => {
              if (!resolved) {
                resolved = true;
                console.warn('[useBackgroundMusic] Load events did not fire quickly, trying to play anyway...');
                resolve(undefined); // Don't reject, just try to play
              }
            }, 3000); // 3 seconds - much faster
          });

          console.log(`[useBackgroundMusic] Audio loaded, ready to play`);
        } catch (loadError) {
          console.warn('[useBackgroundMusic] Audio load error, attempting to play anyway:', loadError);
          // Continue anyway - sometimes audio works even if load events fail
        }

        // Crossfade if there's a current track
        if (currentAudioRef.current && isPlaying) {
          // Start new track at volume 0 for crossfade
          newAudio.volume = 0;

          try {
            await newAudio.play();
            console.log('[useBackgroundMusic] Starting crossfade...');

            nextAudioRef.current = newAudio;
            await crossfade(currentAudioRef.current, newAudio, crossfadeDuration);
            currentAudioRef.current = newAudio;
            nextAudioRef.current = null;

            console.log(`[useBackgroundMusic] Crossfade complete`);
          } catch (playError: any) {
            console.error('[useBackgroundMusic] Crossfade play failed:', playError);
            // Fall back to direct replacement
            if (currentAudioRef.current) {
              currentAudioRef.current.pause();
            }
            currentAudioRef.current = newAudio;
            newAudio.volume = volumeRef.current;
            await newAudio.play();
            console.log('[useBackgroundMusic] Direct play (crossfade failed)');
          }
        } else {
          // No crossfade, just start playing at full volume
          currentAudioRef.current = newAudio;
          newAudio.volume = volumeRef.current;

          if (autoPlay) {
            try {
              console.log(`[useBackgroundMusic] Attempting to play at volume ${volumeRef.current}...`);
              const playPromise = newAudio.play();

              if (playPromise !== undefined) {
                await playPromise;
                setIsPlaying(true);
                console.log(`[useBackgroundMusic] ✅ Playing successfully!`);
              }
            } catch (playError: any) {
              console.error('[useBackgroundMusic] Autoplay blocked by browser:', playError);
              setError('Click anywhere to enable music (browser autoplay policy)');

              // Attach a one-time click handler to start music
              const handleClick = async () => {
                try {
                  await newAudio.play();
                  setIsPlaying(true);
                  setError(null);
                  console.log('[useBackgroundMusic] ✅ Music started after user interaction');
                  document.removeEventListener('click', handleClick);
                } catch (e) {
                  console.error('[useBackgroundMusic] Failed to play after click:', e);
                }
              };
              document.addEventListener('click', handleClick, { once: true });
            }
          }
        }

        console.log(`[useBackgroundMusic] Now playing: ${audioFile.prompt.slice(0, 50)}...`);
      } catch (err: any) {
        console.error('[useBackgroundMusic] Failed to change music:', err);
        setError(err.message || 'Failed to load music');
      } finally {
        setIsLoading(false);
      }
    },
    [enabled, isPlaying, crossfadeDuration, crossfade, autoPlay]
  );

  /**
   * Load and start playing main theme (persistent background music)
   * Optimized to start playing immediately without waiting for full download
   */
  const loadMainTheme = useCallback(
    async (context: MusicGenerationContext) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        console.log('[useBackgroundMusic] Loading main theme...');
        const audioFile = await getMusicForContext(context, 'room'); // Use room music as main theme
        setMainTheme(audioFile);

        console.log(`[useBackgroundMusic] Main theme generated, starting playback: ${audioFile.url}`);

        const newAudio = new Audio();
        newAudio.crossOrigin = 'anonymous';
        newAudio.src = audioFile.url;
        newAudio.loop = true; // Main theme always loops
        newAudio.preload = 'auto';
        newAudio.volume = volumeRef.current;

        mainThemeAudioRef.current = newAudio;
        mainThemeVolumeRef.current = volumeRef.current;

        if (autoPlay) {
          try {
            // Try to play immediately - browser will buffer automatically
            console.log('[useBackgroundMusic] Attempting to play main theme...');
            await newAudio.play();
            setIsPlaying(true);
            console.log('[useBackgroundMusic] ✅ Main theme playing!');
          } catch (playError: any) {
            console.error('[useBackgroundMusic] Autoplay blocked, waiting for user interaction:', playError);
            setError('Click anywhere to enable music (browser autoplay policy)');

            // Attach one-time click handler
            const handleClick = async () => {
              try {
                await newAudio.play();
                setIsPlaying(true);
                setError(null);
                console.log('[useBackgroundMusic] ✅ Main theme started after user interaction');
              } catch (e) {
                console.error('[useBackgroundMusic] Failed to play after click:', e);
              }
            };
            document.addEventListener('click', handleClick, { once: true });
          }
        }
      } catch (err: any) {
        console.error('[useBackgroundMusic] Failed to load main theme:', err);
        setError(err.message || 'Failed to load main theme');
      } finally {
        setIsLoading(false);
      }
    },
    [enabled, autoPlay]
  );

  /**
   * Play overlay music (battle, story moments) on top of main theme
   * Optimized to start playing immediately without waiting for full download
   */
  const playOverlay = useCallback(
    async (context: MusicGenerationContext, audioContext: AudioContext) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        console.log(`[useBackgroundMusic] Loading overlay: ${audioContext}...`);
        const audioFile = await getMusicForContext(context, audioContext);
        setOverlayTrack(audioFile);

        console.log(`[useBackgroundMusic] Overlay generated, starting playback: ${audioFile.url}`);

        const newAudio = new Audio();
        newAudio.crossOrigin = 'anonymous';
        newAudio.src = audioFile.url;
        newAudio.loop = audioContext === 'battle'; // Battle loops, story moments don't
        newAudio.preload = 'auto';
        newAudio.volume = 0; // Start at 0 for fade in

        overlayAudioRef.current = newAudio;

        // Try to play immediately and fade in
        try {
          console.log('[useBackgroundMusic] Attempting to play overlay...');
          await newAudio.play();

          // Fade in overlay to full volume
          const steps = 30;
          const stepDuration = 1000 / steps; // 1 second fade in
          for (let step = 0; step < steps; step++) {
            newAudio.volume = volumeRef.current * (step / steps);
            await new Promise(resolve => setTimeout(resolve, stepDuration));
          }
          newAudio.volume = volumeRef.current;

          console.log(`[useBackgroundMusic] ✅ Overlay playing: ${audioContext}`);
        } catch (playError: any) {
          console.error('[useBackgroundMusic] Overlay play failed:', playError);
          setError('Failed to play overlay music');
        }
      } catch (err: any) {
        console.error('[useBackgroundMusic] Failed to load overlay:', err);
        setError(err.message || 'Failed to load overlay music');
      } finally {
        setIsLoading(false);
      }
    },
    [enabled]
  );

  /**
   * Stop and fade out overlay music
   */
  const stopOverlay = useCallback(async () => {
    if (!overlayAudioRef.current) return;

    console.log('[useBackgroundMusic] Stopping overlay...');

    const audio = overlayAudioRef.current;
    const steps = 30;
    const stepDuration = 1000 / steps; // 1 second fade out

    for (let step = steps; step > 0; step--) {
      audio.volume = volumeRef.current * (step / steps);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }

    audio.pause();
    overlayAudioRef.current = null;
    setOverlayTrack(null);
    console.log('[useBackgroundMusic] ✅ Overlay stopped');
  }, []);

  /**
   * Duck main theme volume (reduce for overlay)
   */
  const duckMainTheme = useCallback(
    async (targetVolume: number = 0.35) => {
      if (!mainThemeAudioRef.current) return;

      console.log(`[useBackgroundMusic] Ducking main theme to ${targetVolume * 100}%...`);

      const audio = mainThemeAudioRef.current;
      const steps = 30;
      const stepDuration = 1000 / steps; // 1 second transition
      const startVolume = audio.volume;
      const volumeDiff = startVolume - (volumeRef.current * targetVolume);

      for (let step = 0; step < steps; step++) {
        audio.volume = startVolume - (volumeDiff * (step / steps));
        await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      audio.volume = volumeRef.current * targetVolume;
      mainThemeVolumeRef.current = volumeRef.current * targetVolume;
      console.log('[useBackgroundMusic] ✅ Main theme ducked');
    },
    []
  );

  /**
   * Restore main theme volume to full
   */
  const restoreMainTheme = useCallback(async () => {
    if (!mainThemeAudioRef.current) return;

    console.log('[useBackgroundMusic] Restoring main theme to full volume...');

    const audio = mainThemeAudioRef.current;
    const steps = 30;
    const stepDuration = 1000 / steps; // 1 second transition
    const startVolume = audio.volume;
    const volumeDiff = volumeRef.current - startVolume;

    for (let step = 0; step < steps; step++) {
      audio.volume = startVolume + (volumeDiff * (step / steps));
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }

    audio.volume = volumeRef.current;
    mainThemeVolumeRef.current = volumeRef.current;
    console.log('[useBackgroundMusic] ✅ Main theme restored');
  }, []);

  /**
   * Stop main theme (for defeat/victory music replacement)
   */
  const stopMainTheme = useCallback(async () => {
    if (!mainThemeAudioRef.current) return;

    console.log('[useBackgroundMusic] Stopping main theme...');

    const audio = mainThemeAudioRef.current;
    const steps = 30;
    const stepDuration = 1000 / steps; // 1 second fade out

    for (let step = steps; step > 0; step--) {
      audio.volume = volumeRef.current * (step / steps);
      await new Promise(resolve => setTimeout(resolve, stepDuration));
    }

    audio.pause();
    mainThemeAudioRef.current = null;
    setMainTheme(null);
    console.log('[useBackgroundMusic] ✅ Main theme stopped');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
      if (nextAudioRef.current) {
        nextAudioRef.current.pause();
        nextAudioRef.current = null;
      }
      if (mainThemeAudioRef.current) {
        mainThemeAudioRef.current.pause();
        mainThemeAudioRef.current = null;
      }
      if (overlayAudioRef.current) {
        overlayAudioRef.current.pause();
        overlayAudioRef.current = null;
      }
    };
  }, []);

  return {
    isPlaying,
    isLoading,
    currentTrack,
    mainTheme,
    overlayTrack,
    error,
    play,
    pause,
    setVolume,
    changeMusic,
    loadMainTheme,
    playOverlay,
    stopOverlay,
    duckMainTheme,
    restoreMainTheme,
    stopMainTheme,
  };
};
