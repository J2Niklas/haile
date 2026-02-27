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

// ── Filler phrases (A) ──

const FILLER_SSML_POOL = [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AndrewMultilingualNeural"><prosody rate="+20%">Hmm,</prosody></voice></speak>',
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AndrewMultilingualNeural"><prosody rate="+20%">Well,</prosody></voice></speak>',
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AndrewMultilingualNeural"><prosody rate="+20%">So,</prosody></voice></speak>',
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AndrewMultilingualNeural"><prosody rate="+20%">Right,</prosody></voice></speak>',
];
let lastFillerIdx = -1;

export function queueFillerPhrase() {
    if (!state.avatarReady || !state.avatarSynthesizer) return;
    let idx;
    do {
        idx = Math.floor(Math.random() * FILLER_SSML_POOL.length);
    } while (idx === lastFillerIdx && FILLER_SSML_POOL.length > 1);
    lastFillerIdx = idx;
    queueAvatarSentence(FILLER_SSML_POOL[idx]);
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
        const avatarConfig = new SpeechSDK.AvatarConfig('harry', 'casual', videoFormat);
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

function _reattachAvatarAudio() {
    if (state.peerConnection) {
        state.peerConnection.getReceivers().forEach((r) => {
            if (r.track && r.track.kind === 'audio') r.track.enabled = true;
        });
    }
    const avatarAudio = document.getElementById('avatar-audio');
    if (avatarAudio) {
        avatarAudio.muted = false;
        if (state.peerConnection) {
            const audioReceiver = state.peerConnection
                .getReceivers()
                .find((r) => r.track?.kind === 'audio');
            if (audioReceiver) {
                avatarAudio.srcObject = new MediaStream([audioReceiver.track]);
                avatarAudio.play().catch((e) => console.warn('Audio play blocked:', e));
            }
        }
    }
    avatarVideo.muted = false;
}

function _muteAllAudio() {
    const avatarAudio = document.getElementById('avatar-audio');
    if (avatarAudio) {
        avatarAudio.pause();
        avatarAudio.muted = true;
        avatarAudio.srcObject = null;
    }
    avatarVideo.muted = true;
    if (state.peerConnection) {
        state.peerConnection.getReceivers().forEach((r) => {
            if (r.track?.kind === 'audio') r.track.enabled = false;
        });
    }
}

export function stopSpeaking() {
    state.speakingAborted = true;
    state.speechGeneration++;
    state.audioAttachedForResponse = false;
    state.deferredTextQueue = [];
    _muteAllAudio();

    if (state.avatarSynthesizer && state.avatarReady) {
        state.avatarSynthesizer.stopSpeakingAsync(
            () => {},
            () => {},
        );
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

export function queueAvatarSentence(ssml, deferredText) {
    if (!ssml) return;

    if (state.avatarReady && state.avatarSynthesizer && state.speechToken?.iceServers) {
        if (!state.audioAttachedForResponse) {
            _reattachAvatarAudio();
            state.audioAttachedForResponse = true;
        }
        state.isSpeaking = true;
        setSpeakingIndicator(true);
        state.pendingSpeechCount++;
        const gen = state.speechGeneration;

        if (deferredText) {
            appendToAssistantBubble(deferredText);
        }

        state.avatarSynthesizer.speakSsmlAsync(
            ssml,
            (result) => {
                if (gen !== state.speechGeneration) return;
                state.pendingSpeechCount--;
                if (result.reason === SpeechSDK.ResultReason.Canceled) {
                    console.warn('Avatar TTS phrase canceled');
                }
                if (state.pendingSpeechCount <= 0) {
                    state.pendingSpeechCount = 0;
                    state.isSpeaking = false;
                    setSpeakingIndicator(false);
                    state.audioAttachedForResponse = false;
                    state.onSpeakComplete();
                }
            },
            (err) => {
                if (gen !== state.speechGeneration) return;
                console.warn('Avatar speakSsml error:', err);
                state.pendingSpeechCount--;
                if (state.pendingSpeechCount <= 0) {
                    state.pendingSpeechCount = 0;
                    state.isSpeaking = false;
                    setSpeakingIndicator(false);
                    state.audioAttachedForResponse = false;
                    state.onSpeakComplete();
                }
            },
        );
        return;
    }

    // Fallback: audio-only TTS
    if (deferredText) appendToAssistantBubble(deferredText);
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
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><voice name="en-US-AndrewMultilingualNeural"><prosody rate="+10%">${text}</prosody></voice></speak>`;
}
