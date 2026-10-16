import { useCallback, useEffect, useRef, useState } from 'react';
import { AppWindow, Camera, CameraOff, Check, ChevronDown, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Settings2, Signal, VolumeX, Waves, X } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import { api } from '../api';
import type { User } from '../types';
import ScreenPicker from './ScreenPicker';

type Peer = { socketId: string; user: User; cameraOn?: boolean; sharing?: boolean };
type Props = { channelId: string; channelName: string; socket: Socket | null; user: User; onLeave: () => void };
type PeerMedia = { audio?: MediaStream; camera?: MediaStream; screen?: MediaStream };
type PeerLink = { pc: RTCPeerConnection; peer: Peer; audio: RTCRtpTransceiver; camera: RTCRtpTransceiver; screen: RTCRtpTransceiver; pendingIce: RTCIceCandidateInit[] };
type Device = { deviceId: string; label: string };
type Quality = '720' | '1080';
const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function getMediaError(error: unknown, kind: 'microphone' | 'camera') {
  const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    const deviceName = kind === 'camera' ? 'Camera' : 'Microphone';
    return { title: `${deviceName} permission is off`, detail: `In Windows, open Settings → Privacy & security → ${deviceName}, turn on device access and “Let desktop apps access your ${kind}”, then return to CORE and try again. Close other apps using the device.`, privacy: true };
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return { title: `No ${kind} found`, detail: `Connect a ${kind}, then choose it from Device settings. You can still join and listen without a microphone.`, privacy: false };
  }
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') {
    return { title: `${kind === 'camera' ? 'Camera' : 'Microphone'} is busy`, detail: `Another app may be using your ${kind}. Close that app or select another device, then try again.`, privacy: false };
  }
  if (name === 'OverconstrainedError') {
    return { title: 'That device setting isn’t available', detail: 'Choose another device or select System default, then try again.', privacy: false };
  }
  return { title: `Couldn’t start your ${kind}`, detail: `Check that a ${kind} is connected, choose System default under Devices, and confirm Windows lets desktop apps use it. You can open Windows settings below and retry.`, privacy: true };
}

function useVideoSource(stream?: MediaStream) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (ref.current) { ref.current.srcObject = stream || null; void ref.current.play().catch(() => {}); } }, [stream]);
  return ref;
}

function VideoTile({ name, avatar, media, local = false, muted = false, deafened = false, sharing = false, cameraOn = false, outputDeviceId = '' }: { name: string; avatar: string | null; media?: PeerMedia; local?: boolean; muted?: boolean; deafened?: boolean; sharing?: boolean; cameraOn?: boolean; outputDeviceId?: string }) {
  const cameraVideo = useVideoSource(media?.camera);
  const screenVideo = useVideoSource(media?.screen);
  const audioRef = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.srcObject = media?.audio || null;
    audioRef.current.muted = local || deafened;
    const sinkable = audioRef.current as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> };
    if (outputDeviceId && sinkable.setSinkId) void sinkable.setSinkId(outputDeviceId).catch(() => {});
  }, [media?.audio, local, deafened, outputDeviceId]);
  const hasVideo = Boolean(media?.camera || media?.screen);
  return <div className={`video-tile ${hasVideo ? 'has-video' : ''} ${local ? 'local-tile' : ''} ${sharing ? 'sharing-tile' : ''}`}>
    {media?.screen && <video ref={screenVideo} autoPlay playsInline muted className="video-screen-share" aria-label={`${name} screen share`} />}
    {media?.camera && <video ref={cameraVideo} autoPlay playsInline muted className={media.screen ? 'video-camera-inset' : 'video-camera'} aria-label={`${name} camera`} />}
    {!hasVideo && <div className="voice-person"><span className="avatar avatar-xl">{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1).toUpperCase()}</span><span className="voice-wave"><i /><i /><i /><i /><i /></span></div>}
    <audio ref={audioRef} autoPlay />
    {(sharing || cameraOn) && <span className="video-state">{sharing ? <><MonitorUp size={13} /> Sharing screen</> : <><Camera size={13} /> Camera on</>}</span>}
    <div className="video-name"><span className="audio-presence" />{name}{local ? ' · you' : ''}{muted && <MicOff size={12} />}</div>
  </div>;
}

export default function VoiceCall({ channelId, channelName, socket, user, onLeave }: Props) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [streams, setStreams] = useState<Record<string, PeerMedia>>({});
  const [localMedia, setLocalMedia] = useState<PeerMedia>({});
  const [connected, setConnected] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [ptt, setPtt] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  const [microphones, setMicrophones] = useState<Device[]>([]);
  const [cameras, setCameras] = useState<Device[]>([]);
  const [speakers, setSpeakers] = useState<Device[]>([]);
  const [microphoneId, setMicrophoneId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [speakerId, setSpeakerId] = useState('');
  const [quality, setQuality] = useState<Quality>('720');
  const [error, setError] = useState<{ title: string; detail: string; privacy: boolean } | null>(null);
  const localAudio = useRef<MediaStream | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const screenStream = useRef<MediaStream | null>(null);
  const peerMap = useRef(new Map<string, PeerLink>());
  const peerDirectory = useRef(new Map<string, Peer>());
  const micEnabled = useRef(true);
  const pttEnabled = useRef(false);
  const pttIsHeld = useRef(false);
  const iceRef = useRef(ICE);

  const send = useCallback((target: string, signal: unknown) => socket?.emit('voice:signal', { target, signal }), [socket]);

  const enumerateDevices = useCallback(async () => {
    try {
      const found = await navigator.mediaDevices.enumerateDevices();
      const toDevices = (kind: MediaDeviceKind): Device[] => found.filter((device) => device.kind === kind).map((device, index) => ({ deviceId: device.deviceId, label: device.label || `${kind === 'audioinput' ? 'Microphone' : kind === 'videoinput' ? 'Camera' : 'Speaker'} ${index + 1}` }));
      setMicrophones(toDevices('audioinput')); setCameras(toDevices('videoinput')); setSpeakers(toDevices('audiooutput'));
    } catch { /* Device enumeration is optional in browsers without media access. */ }
  }, []);

  const createPeer = useCallback((peer: Peer) => {
    const existing = peerMap.current.get(peer.socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    const audio = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const camera = pc.addTransceiver('video', { direction: 'sendrecv' });
    const screen = pc.addTransceiver('video', { direction: 'sendrecv' });
    void audio.sender.replaceTrack(localAudio.current?.getAudioTracks()[0] || null);
    void camera.sender.replaceTrack(cameraStream.current?.getVideoTracks()[0] || null);
    void screen.sender.replaceTrack(screenStream.current?.getVideoTracks()[0] || null);
    const link: PeerLink = { pc, peer, audio, camera, screen, pendingIce: [] };
    pc.ontrack = (event) => {
      const kind = event.transceiver === audio ? 'audio' : event.transceiver === camera ? 'camera' : 'screen';
      const nextStream = new MediaStream([event.track]);
      setStreams((current) => ({ ...current, [peer.socketId]: { ...current[peer.socketId], [kind]: nextStream } }));
      event.track.onended = () => setStreams((current) => {
        const currentMedia = current[peer.socketId]; if (!currentMedia) return current;
        const next = { ...current, [peer.socketId]: { ...currentMedia } };
        delete next[peer.socketId][kind]; return next;
      });
      if (kind === 'audio') void enumerateDevices();
    };
    pc.onicecandidate = (event) => { if (event.candidate) send(peer.socketId, { type: 'candidate', candidate: event.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') { setConnected(true); setError(null); }
      if (pc.connectionState === 'failed') setError({ title: 'Couldn’t reach this person', detail: 'This network may need a TURN relay. Check the server setup, then leave and rejoin voice.', privacy: false });
      if (pc.connectionState === 'closed') setConnected([...peerMap.current.values()].some((entry) => entry.pc.connectionState === 'connected'));
    };
    peerMap.current.set(peer.socketId, link);
    peerDirectory.current.set(peer.socketId, peer);
    setPeers((items) => items.some((item) => item.socketId === peer.socketId) ? items : [...items, peer]);
    return link;
  }, [enumerateDevices, send]);

  const createOffer = useCallback(async (link: PeerLink) => {
    if (link.pc.signalingState !== 'stable') return;
    try {
      const offer = await link.pc.createOffer(); await link.pc.setLocalDescription(offer);
      send(link.peer.socketId, { type: 'description', description: link.pc.localDescription });
    } catch { setError({ title: 'Voice connection didn’t start', detail: 'Try leaving and rejoining this voice channel.', privacy: false }); }
  }, [send]);

  const joinRoom = useCallback(async (withMicrophone: boolean) => {
    if (!socket || audioReady) return;
    setError(null);
    let stream: MediaStream | null = null;
    try {
      if (withMicrophone) {
        const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (microphoneId) audio.deviceId = { exact: microphoneId };
        stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        localAudio.current = stream;
        await enumerateDevices();
      } else localAudio.current = new MediaStream();
      for (const device of stream?.getAudioTracks() || []) device.enabled = !muted;
    } catch (cause) {
      const info = getMediaError(cause, 'microphone');
      setError(info); return;
    }
    socket.emit('voice:join', channelId, (result: { error?: string; participants?: Peer[] }) => {
      if (result?.error) {
        localAudio.current?.getTracks().forEach((track) => track.stop()); localAudio.current = null;
        setError({ title: 'Couldn’t join this voice space', detail: result.error || 'Try again in a moment.', privacy: false }); return;
      }
      setAudioReady(true); setError(null);
      const currentId = socket.id || '';
      for (const peer of result.participants || []) {
        peerDirectory.current.set(peer.socketId, peer);
        const link = createPeer(peer);
        if (currentId < peer.socketId) void createOffer(link);
      }
      socket.emit('voice:media-state', { cameraOn: false, sharing: false });
    });
  }, [audioReady, channelId, createOffer, createPeer, enumerateDevices, microphoneId, muted, socket]);

  useEffect(() => {
    if (!socket) { setError({ title: 'Reconnecting to CORE', detail: 'Voice controls will be ready when your connection returns.', privacy: false }); return; }
    void api<{ iceServers: RTCIceServer[] }>('/api/ice-servers').then((config) => { if (config.iceServers?.length) iceRef.current = config.iceServers; }).catch(() => {});

    const joined = (peer: Peer) => {
      peerDirectory.current.set(peer.socketId, peer);
      const link = createPeer(peer);
      if ((socket.id || '') < peer.socketId) void createOffer(link);
    };
    const left = ({ socketId }: { socketId: string }) => {
      peerMap.current.get(socketId)?.pc.close(); peerMap.current.delete(socketId); peerDirectory.current.delete(socketId);
      setPeers((items) => items.filter((item) => item.socketId !== socketId));
      setStreams((current) => { const next = { ...current }; delete next[socketId]; return next; });
      setConnected([...peerMap.current.values()].some((entry) => entry.pc.connectionState === 'connected'));
    };
    const receiveSignal = async ({ from, signal: incoming }: { from: string; signal: any }) => {
      const peer = peerDirectory.current.get(from);
      if (!peer || !incoming) return;
      const link = peerMap.current.get(from) || createPeer(peer);
      try {
        if (incoming.type === 'candidate') {
          if (link.pc.remoteDescription) await link.pc.addIceCandidate(incoming.candidate);
          else link.pendingIce.push(incoming.candidate);
        } else if (incoming.type === 'description') {
          await link.pc.setRemoteDescription(incoming.description);
          while (link.pendingIce.length) await link.pc.addIceCandidate(link.pendingIce.shift()!);
          if (incoming.description.type === 'offer') {
            const answer = await link.pc.createAnswer(); await link.pc.setLocalDescription(answer);
            send(from, { type: 'description', description: link.pc.localDescription });
          }
        }
      } catch {
        setError({ title: 'Voice connection changed', detail: 'The call couldn’t finish negotiating. Leave and rejoin this voice channel.', privacy: false });
      }
    };
    const mediaState = ({ socketId, cameraOn: peerCameraOn, sharing: peerSharing }: { socketId: string; cameraOn: boolean; sharing: boolean }) => {
      setPeers((items) => items.map((peer) => peer.socketId === socketId ? { ...peer, cameraOn: peerCameraOn, sharing: peerSharing } : peer));
    };
    socket.on('voice:peer-joined', joined); socket.on('voice:peer-left', left); socket.on('voice:signal', receiveSignal); socket.on('voice:media-state', mediaState);
    const onDeviceChange = () => { void enumerateDevices(); };
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => {
      socket.off('voice:peer-joined', joined); socket.off('voice:peer-left', left); socket.off('voice:signal', receiveSignal); socket.off('voice:media-state', mediaState);
      navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
      socket.emit('voice:leave');
      peerMap.current.forEach(({ pc }) => pc.close()); peerMap.current.clear(); peerDirectory.current.clear();
      localAudio.current?.getTracks().forEach((track) => track.stop()); localAudio.current = null;
      cameraStream.current?.getTracks().forEach((track) => track.stop()); cameraStream.current = null;
      screenStream.current?.getTracks().forEach((track) => track.stop()); screenStream.current = null;
      setStreams({}); setLocalMedia({});
    };
  }, [createOffer, createPeer, enumerateDevices, send, socket]);

  useEffect(() => { micEnabled.current = !muted; pttEnabled.current = ptt; pttIsHeld.current = pttHeld; }, [muted, ptt, pttHeld]);
  useEffect(() => {
    const syncMic = () => {
      const enabled = micEnabled.current && (!pttEnabled.current || pttIsHeld.current);
      localAudio.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    };
    syncMic();
  }, [muted, ptt, pttHeld, audioReady]);

  useEffect(() => {
    if (!ptt) return;
    const down = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || !audioReady) return;
      event.preventDefault(); setPttHeld(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') setPttHeld(false); };
    const blur = () => setPttHeld(false);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [audioReady, ptt]);

  const replaceTrack = async (kind: 'audio' | 'camera' | 'screen', track: MediaStreamTrack | null) => {
    const transceiverName = kind === 'audio' ? 'audio' : kind;
    await Promise.allSettled([...peerMap.current.values()].map(({ [transceiverName]: transceiver }) => transceiver.sender.replaceTrack(track)));
  };
  const toggleMic = async () => {
    if (!localAudio.current?.getAudioTracks().length) {
      try {
        const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (microphoneId) audio.deviceId = { exact: microphoneId };
        const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        localAudio.current = stream; await replaceTrack('audio', stream.getAudioTracks()[0]);
        setMuted(false); setError(null); await enumerateDevices();
      } catch (cause) {
        const info = getMediaError(cause, 'microphone'); setError(info); setDevicesOpen(true); void enumerateDevices();
      }
      return;
    }
    setMuted((value) => !value);
  };
  const toggleDeafen = () => {
    setDeafened((value) => !value);
  };
  const toggleCamera = async () => {
    if (cameraOn) {
      const stream = cameraStream.current; cameraStream.current = null;
      await replaceTrack('camera', null); stream?.getTracks().forEach((track) => track.stop());
      setLocalMedia((current) => ({ ...current, camera: undefined })); setCameraOn(false);
      socket?.emit('voice:media-state', { cameraOn: false, sharing }); return;
    }
    try {
      const video: MediaTrackConstraints = { width: { ideal: Number(quality) === 1080 ? 1920 : 1280 }, height: { ideal: Number(quality) === 1080 ? 1080 : 720 }, frameRate: { ideal: 30, max: 30 } };
      if (cameraId) video.deviceId = { exact: cameraId };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video });
      const track = stream.getVideoTracks()[0]; cameraStream.current = stream;
      await replaceTrack('camera', track);
      setLocalMedia((current) => ({ ...current, camera: stream })); setCameraOn(true); setError(null);
      socket?.emit('voice:media-state', { cameraOn: true, sharing }); await enumerateDevices();
    } catch (cause) { const info = getMediaError(cause, 'camera'); setError(info); }
  };
  const stopShare = async () => {
    const stream = screenStream.current; screenStream.current = null;
    await replaceTrack('screen', null); stream?.getTracks().forEach((track) => track.stop());
    setLocalMedia((current) => ({ ...current, screen: undefined })); setSharing(false);
    socket?.emit('voice:media-state', { cameraOn, sharing: false });
  };
  const startShare = async (sourceId?: string) => {
    setScreenPickerOpen(false);
    try {
      if (sourceId && window.coreDesktop) {
        const accepted = await window.coreDesktop.selectDisplaySource(sourceId);
        if (!accepted) throw new DOMException('The chosen window is no longer available.', 'NotFoundError');
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 }, width: { ideal: 1920 } }, audio: false });
      const track = stream.getVideoTracks()[0]; screenStream.current = stream;
      await replaceTrack('screen', track);
      setLocalMedia((current) => ({ ...current, screen: stream })); setSharing(true); setError(null);
      socket?.emit('voice:media-state', { cameraOn, sharing: true });
      track.addEventListener('ended', () => { void stopShare(); }, { once: true });
    } catch (cause) {
      if (cause instanceof DOMException && (cause.name === 'NotAllowedError' || cause.name === 'AbortError')) return;
      setError({ title: 'Screen share didn’t start', detail: 'The selected source closed or Windows couldn’t capture it. Choose a different screen or window and try again.', privacy: false });
    }
  };

  const localPeers: PeerMedia = { ...localMedia, audio: localAudio.current || undefined };
  const viewError = error;
  return <section className="call-view" aria-label={`Voice call in ${channelName}`}>
    <div className="call-topline"><div><span className="eyebrow">VOICE SPACE</span><h2>{channelName}</h2><span className="call-subtitle">{audioReady ? `${peers.length + 1} ${peers.length ? 'people' : 'person'} here` : error?.title || 'Ready when you are'}</span></div><div className="call-top-actions"><button className="device-settings-button" onClick={() => { setDevicesOpen((value) => !value); void enumerateDevices(); }} aria-expanded={devicesOpen}><Settings2 size={15} />Devices</button><div className="call-secure"><Signal size={14} /><span>{connected ? 'Connected' : audioReady ? 'Ready to talk' : 'Waiting to join'}</span><span className="call-dot" /></div></div></div>
    {!audioReady && <div className="call-join-card"><div className="call-join-icon"><Waves size={18} /></div><div><b>Join the conversation</b><span>Turn on your microphone when you’re ready. You can adjust your devices any time.</span></div><button className="button primary" onClick={() => void joinRoom(true)}><Mic size={15} />Join voice</button></div>}
    {devicesOpen && <div className="device-panel"><div className="device-panel-heading"><div><b>Voice & video devices</b><span>Changes apply to this call.</span></div><button className="icon-button" aria-label="Close device settings" onClick={() => setDevicesOpen(false)}><X size={16} /></button></div><div className="device-grid">
      <label>Microphone<select value={microphoneId} onChange={(event) => setMicrophoneId(event.target.value)}><option value="">System default</option>{microphones.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select><small>Echo cancellation and noise suppression are on.</small></label>
      <label>Camera<select value={cameraId} onChange={(event) => setCameraId(event.target.value)}><option value="">System default</option>{cameras.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select><small>Camera permission is requested only when you turn it on.</small></label>
      <label>Speaker<select value={speakerId} onChange={(event) => setSpeakerId(event.target.value)}><option value="">System default</option>{speakers.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}</select><small>Output routing uses Windows device selection when available.</small></label>
      <label>Camera quality<select value={quality} onChange={(event) => setQuality(event.target.value as Quality)}><option value="720">720p · balanced</option><option value="1080">1080p · sharper</option></select><small>Actual quality depends on your camera and connection.</small></label>
    </div><div className="device-panel-footer"><button className={`ptt-toggle ${ptt ? 'active' : ''}`} onClick={() => { setPtt((value) => !value); setPttHeld(false); }}><kbd>Space</kbd>{ptt ? 'Push to talk on' : 'Turn on push to talk'}</button><button className="text-button" onClick={() => void enumerateDevices()}>Refresh devices</button></div></div>}
    {viewError && <div className={`call-error ${viewError.privacy ? 'permission-error' : ''}`} role="alert"><div className="call-error-icon">{viewError.privacy ? viewError.title.toLowerCase().includes('camera') ? <CameraOff size={19} /> : <MicOff size={19} /> : <Signal size={18} />}</div><div><strong>{viewError.title}</strong><p>{viewError.detail}</p><div className="call-error-actions">{viewError.privacy && window.coreDesktop && <button className="button subtle small" onClick={() => void window.coreDesktop?.openPrivacySettings(viewError.title.toLowerCase().includes('camera') ? 'camera' : 'microphone')}>Open Windows privacy settings</button>}{!audioReady && <button className="button subtle small" onClick={() => void joinRoom(false)}><Headphones size={14} />Join and listen</button>}{audioReady && <button className="text-button" onClick={() => setError(null)}>Dismiss</button>}</div></div></div>}
    <div className={`call-stage ${peers.length + 1 <= 2 ? 'single-stage' : ''}`}>
      {audioReady && <VideoTile name={user.name} avatar={user.avatar} media={localPeers} muted={muted || (ptt && !pttHeld)} local cameraOn={cameraOn} sharing={sharing} />}
      {peers.map((peer) => <VideoTile key={peer.socketId} name={peer.user.name} avatar={peer.user.avatar} media={streams[peer.socketId]} deafened={deafened} cameraOn={peer.cameraOn} sharing={peer.sharing} outputDeviceId={speakerId} />)}
      {audioReady && peers.length === 0 && <div className="call-invite-hint"><span className="pulse-ring"><Signal size={17} /></span><strong>You’re here. Bring someone in.</strong><span>Share an invite so a friend can drop into this voice space.</span></div>}
    </div>
    {audioReady && <div className="call-controls"><div className="call-control-spacer" /><button className={`call-control ${muted || (ptt && !pttHeld) ? 'is-active' : ''}`} aria-label={muted ? 'Unmute microphone' : ptt ? 'Hold space to talk' : 'Mute microphone'} title={muted ? 'Unmute microphone' : ptt ? 'Hold Space to talk' : 'Mute microphone'} onClick={() => void toggleMic()}><span>{muted || (ptt && !pttHeld) ? <MicOff /> : <Mic />}</span><small>{ptt ? pttHeld ? 'Talking' : 'Hold Space' : muted ? 'Unmute' : 'Mute'}</small></button><button className={`call-control ${deafened ? 'is-active' : ''}`} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'} onClick={toggleDeafen}><span>{deafened ? <VolumeX /> : <Headphones />}</span><small>{deafened ? 'Undeafen' : 'Deafen'}</small></button><button className={`call-control ${cameraOn ? 'is-on' : ''}`} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} title={cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={() => void toggleCamera()}><span>{cameraOn ? <Camera /> : <CameraOff />}</span><small>Camera</small></button><button className={`call-control ${sharing ? 'is-on' : ''}`} aria-label={sharing ? 'Stop sharing screen' : 'Share screen'} title={sharing ? 'Stop sharing screen' : 'Share screen'} onClick={() => sharing ? void stopShare() : setScreenPickerOpen(true)}><span>{sharing ? <Check /> : <MonitorUp />}</span><small>{sharing ? 'Stop share' : 'Share'}</small></button><button className="call-control" aria-label="Voice and video devices" title="Voice and video devices" onClick={() => { setDevicesOpen((value) => !value); void enumerateDevices(); }}><span><Settings2 /></span><small>Devices</small></button><button className="call-control hangup" aria-label="Leave voice channel" title="Leave voice channel" onClick={onLeave}><span><PhoneOff /></span><small>Leave</small></button><div className="call-control-spacer" /></div>}
    {screenPickerOpen && <ScreenPicker onClose={() => setScreenPickerOpen(false)} onShare={(sourceId) => { void startShare(sourceId); }} />}
  </section>;
}

