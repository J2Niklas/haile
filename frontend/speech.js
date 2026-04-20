/**
 * HAILE — Speech & Avatar
 *
 * Speech token management, Avatar WebRTC, TTS queue, and audio control.
 */

import { API_BASE, SPEECH_TOKEN_LIFETIME_MS } from './config.js';
import { state } from './state.js';
import {
    avatarPlaceholder,
    avatarVideo,
    setStatus,
    setSpeakingIndicator,
    appendToAssistantBubble,
    authHeaders,
} from './dom.js';
import { getSelectedLanguage, SUPPORTED_LANGUAGES } from './language.js';

// ── Voice map (per language) ──

const VOICE_MAP = {
    'en-US': 'en-US-EmmaMultilingualNeural',
    'da-DK': 'da-DK-ChristelNeural',
    'de-DE': 'de-DE-SeraphinaMultilingualNeural',
    'fr-FR': 'fr-FR-VivienneMultilingualNeural',
    'es-ES': 'es-ES-ElviraNeural',
    'it-IT': 'it-IT-ElsaNeural',
    'pt-PT': 'pt-PT-RaquelNeural',
    'nl-NL': 'nl-NL-ColetteNeural',
    'sv-SE': 'sv-SE-SofieNeural',
    'nb-NO': 'nb-NO-PernilleNeural',
};

function getVoice() {
    return VOICE_MAP[getSelectedLanguage()] || VOICE_MAP['en-US'];
}

// ── Filler phrases (A) ──

function buildFillerSsml(word) {
    const lang = getSelectedLanguage();
    const voice = getVoice();
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="+30%">${word}</prosody></voice></speak>`;
}

const FILLER_WORDS = ['Hmm,', 'Well,', 'So,', 'Right,'];
let lastFillerIdx = -1;

export function queueFillerPhrase() {
    if (!state.avatarReady || !state.avatarSynthesizer) return;
    let idx;
    do {
        idx = Math.floor(Math.random() * FILLER_WORDS.length);
    } while (idx === lastFillerIdx && FILLER_WORDS.length > 1);
    lastFillerIdx = idx;
    queueAvatarSentence(buildFillerSsml(FILLER_WORDS[idx]));
}

// ── Speech token ──

export async function fetchSpeechToken() {
    try {
        const resp = await fetch(`${API_BASE}/speech_token`, { headers: authHeaders() });
        if (resp.status === 401) {
            sessionStorage.removeItem('haile-auth-token');
            state.authToken = '';
            document.getElementById('auth-gate').classList.remove('hidden');
            return;
        }
        if (!resp.ok) {
            console.warn('Speech service not available');
            return;
        }
        state.speechToken = await resp.json();
        state.speechTokenAcquiredAt = Date.now();
        console.log('Speech token acquired', state.speechToken.iceServers ? '(+ICE)' : '(no ICE)');
    } catch (err) {
        console.warn('Speech token fetch failed:', err.message);
    }
}

export async function ensureSpeechToken() {
    if (!state.speechToken || Date.now() - state.speechTokenAcquiredAt > SPEECH_TOKEN_LIFETIME_MS) {
        await fetchSpeechToken();
    }
}

// ── Mic access (shared by STT & Realtime) ──

export async function getMicStream() {
    if (state.sttAudioStream?.active) return state.sttAudioStream;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const jabra = devices.find(
            (d) => d.kind === 'audioinput' && d.label.toLowerCase().includes('jabra'),
        );
        if (jabra) console.log('Mic: Using Jabra:', jabra.label);
        state.sttAudioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: jabra ? { exact: jabra.deviceId } : undefined,
                noiseSuppression: true,
                echoCancellation: true,
                autoGainControl: true,
            },
        });
    } catch (err) {
        console.warn('Mic access failed:', err);
        state.sttAudioStream = null;
    }
    return state.sttAudioStream;
}

// ── Avatar (WebRTC) ──

export async function initAvatar() {
    if (state.avatarReady) return true;
    if (state.avatarInitPromise) return state.avatarInitPromise;
    state.avatarInitPromise = _connectAvatar();
    try {
        return await state.avatarInitPromise;
    } finally {
        state.avatarInitPromise = null;
    }
}

async function _connectAvatar() {
    if (!state.speechToken || !state.speechToken.iceServers || typeof SpeechSDK === 'undefined')
        return false;

    try {
        setStatus('Connecting avatar...');

        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
            state.speechToken.token,
            state.speechToken.region,
        );
        const videoFormat = new SpeechSDK.AvatarVideoFormat('H264', 2000000, 1920, 1080);
        const avatarConfig = new SpeechSDK.AvatarConfig('meg', 'business', videoFormat);
        avatarConfig.customized = false;
        avatarConfig.backgroundColor = '#FFFFFFFF';

        const iceServers = state.speechToken.iceServers;
        if (iceServers && iceServers.Urls) {
            avatarConfig.remoteIceServers = [
                {
                    urls: Array.isArray(iceServers.Urls) ? iceServers.Urls : [iceServers.Urls],
                    username: iceServers.Username || '',
                    credential: iceServers.Password || '',
                },
            ];
        }

        state.avatarSynthesizer = new SpeechSDK.AvatarSynthesizer(speechConfig, avatarConfig);
        state.avatarSynthesizer.avatarEventReceived = (s, e) =>
            console.log('Avatar event:', e.description);

        const iceServerList = [];
        if (iceServers && iceServers.Urls) {
            iceServerList.push({
                urls: Array.isArray(iceServers.Urls) ? iceServers.Urls : [iceServers.Urls],
                username: iceServers.Username || '',
                credential: iceServers.Password || '',
            });
        }

        state.peerConnection = new RTCPeerConnection({
            iceServers: iceServerList,
            iceTransportPolicy: 'relay',
        });

        state.peerConnection.ontrack = (event) => {
            if (event.track.kind === 'video') {
                state.avatarVideoStream = event.streams[0];
                avatarVideo.srcObject = state.avatarVideoStream;
                // Permanently mute the video element — audio output comes
                // exclusively from the dedicated <audio> element to avoid
                // dual-playback interference and mute/unmute clipping.
                avatarVideo.muted = true;
                avatarVideo.classList.remove('hidden');
                avatarPlaceholder.classList.add('hidden');
                if (state.avatarVideoReadyResolve) {
                    state.avatarVideoReadyResolve();
                    state.avatarVideoReadyResolve = null;
                }
            }
            if (event.track.kind === 'audio') {
                let audioPlayer = document.getElementById('avatar-audio');
                if (!audioPlayer) {
                    audioPlayer = document.createElement('audio');
                    audioPlayer.id = 'avatar-audio';
                    audioPlayer.autoplay = true;
                    document.body.appendChild(audioPlayer);
                }
                audioPlayer.srcObject = event.streams[0];
            }
        };

        state.peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE state:', state.peerConnection.iceConnectionState);
            if (
                state.peerConnection.iceConnectionState === 'disconnected' ||
                state.peerConnection.iceConnectionState === 'failed'
            ) {
                state.avatarReady = false;
            }
        };

        state.peerConnection.addTransceiver('video', { direction: 'sendrecv' });
        state.peerConnection.addTransceiver('audio', { direction: 'sendrecv' });

        const result = await state.avatarSynthesizer.startAvatarAsync(state.peerConnection);
        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
            state.avatarReady = true;
            if (!state.avatarVideoStream) {
                state.avatarVideoReady = new Promise((resolve) => {
                    state.avatarVideoReadyResolve = resolve;
                });
            }
            console.log('Avatar started successfully');
            setStatus('Avatar connected!');
            return true;
        } else {
            console.warn('Avatar start failed:', result.reason);
            if (result.reason === SpeechSDK.ResultReason.Canceled) {
                const details = SpeechSDK.CancellationDetails.fromResult(result);
                console.warn('Canceled:', details.errorDetails);
            }
            state.avatarSynthesizer = null;
            state.avatarReady = false;
            setStatus('Avatar unavailable — using audio only');
            return false;
        }
    } catch (err) {
        console.warn('Avatar init failed:', err);
        state.avatarSynthesizer = null;
        state.avatarReady = false;
        if (state.peerConnection) {
            try {
                state.peerConnection.close();
            } catch (e) {
                /* ignore */
            }
            state.peerConnection = null;
        }
        setStatus('Avatar unavailable — using audio only');
        return false;
    }
}

// ── Audio management ──

// Ensure the <audio> element has a srcObject and is playing.
// Called once per response. The element is never muted — the WebRTC
// stream is silent when idle so there's nothing to hear.
function _ensureAudioReady() {
    const avatarAudio = document.getElementById('avatar-audio');
    if (avatarAudio) {
        if (!avatarAudio.srcObject && state.peerConnection) {
            const audioReceiver = state.peerConnection
                .getReceivers()
                .find((r) => r.track?.kind === 'audio');
            if (audioReceiver) {
                avatarAudio.srcObject = new MediaStream([audioReceiver.track]);
            }
        }
        avatarAudio.play().catch((e) => console.warn('Audio play blocked:', e));
    }
}

// Promise that resolves when a pending stopSpeakingAsync() completes.
// speakSsmlAsync must NEVER be called while a stop is in flight — the SDK
// will immediately cancel the new synthesis, causing all queued phrases to
// burn through with ResultReason.Canceled and nothing actually spoken.
let _stopPromise = Promise.resolve();

export function stopSpeaking() {
    state.speakingAborted = true;
    state.speechGeneration++;
    state.audioAttachedForResponse = false;
    state.responseStreamComplete = false;
    state.deferredTextQueue = [];
    _speechQueue = [];

    if (state.avatarSynthesizer && state.avatarReady) {
        _stopPromise = new Promise((resolve) => {
            state.avatarSynthesizer.stopSpeakingAsync(resolve, resolve);
            // Safety: resolve after 500ms even if the SDK never calls back
            setTimeout(resolve, 500);
        });
    }
    state.pendingSpeechCount = 0;

    if (state.speechSynthesizerInstance) {
        try {
            state.speechSynthesizerInstance.close();
        } catch (e) {
            /* ignore */
        }
        state.speechSynthesizerInstance = null;
    }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    state.isSpeaking = false;
    setSpeakingIndicator(false);
}

// ── Avatar TTS queue ──

// Phrases are dispatched to the SDK immediately via speakSsmlAsync.
// The SDK queues them internally and plays back-to-back with no gap.
// We only hold phrases in _speechQueue while a stopSpeakingAsync is
// in flight (to avoid the SDK cancelling them).
let _speechQueue = [];

function _tryFinalComplete() {
    if (state.pendingSpeechCount <= 0 && _speechQueue.length === 0 && state.responseStreamComplete) {
        state.pendingSpeechCount = 0;
        state.isSpeaking = false;
        setSpeakingIndicator(false);
        state.audioAttachedForResponse = false;
        state.onSpeakComplete();
    }
}

/**
 * Flush all pending phrases to the SDK. The Avatar SDK queues
 * multiple speakSsmlAsync calls internally, playing them
 * sequentially with no inter-phrase gap.
 */
function _drainSpeechQueue() {
    if (_speechQueue.length === 0) return;

    // Wait for any in-flight stopSpeakingAsync before dispatching.
    _stopPromise.then(() => {
        while (_speechQueue.length > 0) {
            const item = _speechQueue.shift();
            if (item.gen !== state.speechGeneration) continue;
            _speakSinglePhrase(item);
        }
    });
}

function _speakSinglePhrase({ ssml, gen, _retryCount = 0 }) {
    state.pendingSpeechCount++;
    state.isSpeaking = true;
    setSpeakingIndicator(true);

    let callbackFired = false;
    const safetyTimer = setTimeout(() => {
        if (callbackFired) return;
        callbackFired = true;
        if (gen !== state.speechGeneration) return;
        console.warn('Avatar TTS: speakSsmlAsync timed out after 15s — skipping phrase');
        state.pendingSpeechCount--;
        _tryFinalComplete();
    }, 15000);

    try {
        state.avatarSynthesizer.speakSsmlAsync(
            ssml,
            (result) => {
                if (callbackFired) return;
                callbackFired = true;
                clearTimeout(safetyTimer);
                if (gen !== state.speechGeneration) return;
                state.pendingSpeechCount--;
                if (result.reason === SpeechSDK.ResultReason.Canceled) {
                    console.warn('Avatar TTS phrase canceled, retry:', _retryCount);
                    if (_retryCount < 1) {
                        _speechQueue.push({ ssml, gen, _retryCount: _retryCount + 1 });
                        _drainSpeechQueue();
                    }
                }
                _tryFinalComplete();
            },
            (err) => {
                if (callbackFired) return;
                callbackFired = true;
                clearTimeout(safetyTimer);
                if (gen !== state.speechGeneration) return;
                console.warn('Avatar speakSsml error:', err);
                state.pendingSpeechCount--;
                _tryFinalComplete();
            },
        );
    } catch (e) {
        if (callbackFired) return;
        callbackFired = true;
        clearTimeout(safetyTimer);
        console.warn('Avatar speakSsmlAsync threw:', e);
        state.pendingSpeechCount--;
        _tryFinalComplete();
    }
}

/**
 * Signal that the response stream (SSE or Realtime) has finished sending
 * phrases. The TTS queue may still be draining; onSpeakComplete will fire
 * only after both the queue is empty AND this has been called.
 */
export function markResponseStreamComplete() {
    state.responseStreamComplete = true;
    _tryFinalComplete();
}

export function queueAvatarSentence(ssml, deferredText, meta) {
    if (!ssml) return;

    // Always append text to the bubble immediately so it lands in the
    // current assistant bubble before the stream finishes and clears it.
    if (deferredText || (meta && (meta.productId || meta.compareIds))) {
        appendToAssistantBubble(deferredText || '', meta);
    }

    if (state.avatarReady && state.avatarSynthesizer && state.speechToken?.iceServers) {
        const gen = state.speechGeneration;
        state.isSpeaking = true;
        setSpeakingIndicator(true);

        if (!state.audioAttachedForResponse) {
            _ensureAudioReady();
            state.audioAttachedForResponse = true;
        }

        _speechQueue.push({ ssml, gen });
        _drainSpeechQueue();
        return;
    }

    // Fallback: audio-only TTS
    _speakAudioOnly(ssml);
}

function _speakAudioOnly(ssml) {
    if (!state.speechToken || typeof SpeechSDK === 'undefined') {
        _fallbackSpeak(ssml);
        return;
    }
    try {
        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
            state.speechToken.token,
            state.speechToken.region,
        );
        const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
        state.speechSynthesizerInstance = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);
        state.isSpeaking = true;
        setSpeakingIndicator(true);
        state.speechSynthesizerInstance.speakSsmlAsync(
            ssml,
            (result) => {
                state.isSpeaking = false;
                setSpeakingIndicator(false);
                try {
                    state.speechSynthesizerInstance?.close();
                } catch (e) {
                    /* ignore */
                }
                state.speechSynthesizerInstance = null;
                if (result.reason === SpeechSDK.ResultReason.Canceled) _fallbackSpeak(ssml);
                else state.onSpeakComplete();
            },
            () => {
                state.isSpeaking = false;
                setSpeakingIndicator(false);
                try {
                    state.speechSynthesizerInstance?.close();
                } catch (e) {
                    /* ignore */
                }
                state.speechSynthesizerInstance = null;
                _fallbackSpeak(ssml);
            },
        );
    } catch (err) {
        _fallbackSpeak(ssml);
    }
}

function _fallbackSpeak(ssml) {
    const text = ssml.replace(/<[^>]+>/g, '').trim();
    if (!text || !('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.1;
    utterance.lang = 'en-US';
    state.isSpeaking = true;
    setSpeakingIndicator(true);
    utterance.onend = () => {
        state.isSpeaking = false;
        setSpeakingIndicator(false);
        state.onSpeakComplete();
    };
    utterance.onerror = () => {
        state.isSpeaking = false;
        setSpeakingIndicator(false);
    };
    speechSynthesis.speak(utterance);
}

// ── SSML builder ──

export function buildSsml(text) {
    const lang = getSelectedLanguage();
    const voice = getVoice();
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}"><voice name="${voice}"><prosody rate="+10%">${text}</prosody></voice></speak>`;
}
