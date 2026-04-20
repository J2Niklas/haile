/**
 * HAILE — Speech-to-Text (SSE mode fallback)
 *
 * Uses Azure Speech SDK for continuous recognition.
 */

import { STT_SILENCE_MS, BARGEIN_MIN_WORDS } from './config.js';
import { state } from './state.js';
import { chatInput, setListeningBadge, addBubble, btnMic } from './dom.js';
import { ensureSpeechToken, getMicStream, stopSpeaking } from './speech.js';
import { getInputLanguage } from './language.js';

async function initSttRecognizer() {
    if (state.sttRecognizer) return;
    await ensureSpeechToken();
    if (!state.speechToken || typeof SpeechSDK === 'undefined') return;

    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
            state.speechToken.token,
            state.speechToken.region,
        );
        // (D) Shorter segmentation silence for faster turn-taking
        speechConfig.setProperty('Speech_SegmentationSilenceTimeoutMs', '800');
        speechConfig.setProperty('SpeechServiceConnection_InitialSilenceTimeoutMs', '30000');
        speechConfig.speechRecognitionLanguage = getInputLanguage();

        const stream = await getMicStream();
        const audioConfig = stream
            ? SpeechSDK.AudioConfig.fromStreamInput(stream)
            : SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

        state.sttRecognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

        state.sttRecognizer.recognizing = (s, e) => {
            if (e.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
                chatInput.value =
                    state.finalizedText + (state.finalizedText ? ' ' : '') + e.result.text;
                if (state.sttDebounceTimer) clearTimeout(state.sttDebounceTimer);
            }
        };

        state.sttRecognizer.recognized = (s, e) => {
            if (
                e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech &&
                e.result.text.trim()
            ) {
                const segment = e.result.text.trim();

                // Barge-in
                if (state.isSpeaking && segment.split(/\s+/).length >= BARGEIN_MIN_WORDS) {
                    console.log('Barge-in:', segment);
                    stopSpeaking();
                }

                state.finalizedText = state.finalizedText
                    ? state.finalizedText + ' ' + segment
                    : segment;
                chatInput.value = state.finalizedText;

                if (state.sttDebounceTimer) clearTimeout(state.sttDebounceTimer);
                state.sttDebounceTimer = setTimeout(() => {
                    state.sttDebounceTimer = null;
                    if (chatInput.value.trim()) state.onSendMessage();
                }, STT_SILENCE_MS);
            }
        };

        state.sttRecognizer.canceled = (s, e) => {
            console.warn('STT canceled:', e.errorDetails);
            // Destroy recognizer so a fresh one is created on next start
            try { state.sttRecognizer.close(); } catch (_) { /* */ }
            state.sttRecognizer = null;
            const wasListening = state.isListening;
            state.isListening = false;
            btnMic.classList.remove('listening');
            setListeningBadge(false);
            // Auto-restart if user still wants mic on and nothing is playing
            if (state.micEnabled && wasListening && !state.isSpeaking) {
                setTimeout(() => {
                    if (state.micEnabled && !state.isListening && !state.isSpeaking) {
                        startListening();
                    }
                }, 500);
            }
        };
        // Intentional stops already set isListening=false before this fires.
        // Do NOT call stopListening() here — it races with session restarts.
        state.sttRecognizer.sessionStopped = () => {};

        console.log('STT recognizer initialized');
    } catch (err) {
        console.error('STT init failed:', err);
        state.sttRecognizer = null;
    }
}

export async function startListening() {
    if (state.isListening || state.realtimeMode) return;

    await initSttRecognizer();
    if (!state.sttRecognizer) {
        addBubble('system', 'Microphone not available — check browser permissions.');
        return;
    }

    state.micEnabled = true;
    state.isListening = true;
    btnMic.classList.add('listening');
    chatInput.value = '';
    chatInput.placeholder = 'Listening...';
    state.finalizedText = '';
    setListeningBadge(true);

    try {
        state.sttRecognizer.startContinuousRecognitionAsync(
            () => console.log('STT started'),
            (err) => {
                console.error('STT start error:', err);
                stopListening();
            },
        );
    } catch (err) {
        console.error('STT error:', err);
        stopListening();
    }
}

export function resetSttText() {
    if (state.sttDebounceTimer) {
        clearTimeout(state.sttDebounceTimer);
        state.sttDebounceTimer = null;
    }
    state.finalizedText = '';
    chatInput.value = '';
}

export function stopListening() {
    if (!state.isListening) return;
    state.isListening = false;
    state.micEnabled = false;
    btnMic.classList.remove('listening');
    chatInput.placeholder = 'Type a message...';
    setListeningBadge(false);

    if (state.sttDebounceTimer) {
        clearTimeout(state.sttDebounceTimer);
        state.sttDebounceTimer = null;
        if (chatInput.value.trim()) state.onSendMessage();
    }

    if (state.sttRecognizer) {
        try {
            state.sttRecognizer.stopContinuousRecognitionAsync(
                () => {},
                () => {},
            );
        } catch (e) {
            /* ignore */
        }
    }
}
