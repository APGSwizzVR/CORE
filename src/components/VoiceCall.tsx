import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Camera, CameraOff, Check, Headphones, Mic, MicOff, MonitorUp, PhoneOff, Signal, VolumeX } from 'lucide-react';
import type { Socket } from 'socket.io-client';
import type { User } from '../types';

type Peer = { socketId: string; user: User };
type Props = { channelId: string; channelName: string; socket: Socket | null; user: User; onLeave: () => void };
type Tile = { peer: Peer; stream: MediaStream };
const ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function VideoTile({ name, avatar, stream, muted = false, local = false }: { name: string; avatar: string | null; stream?: MediaStream; muted?: boolean; local?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => { if (video.current && stream) video.current.srcObject = stream; }, [stream]);
  const hasVideo = stream?.getVideoTracks().some((track) => track.readyState === 'live');
  return <div className={`video-tile ${hasVideo ? 'has-video' : ''} ${local ? 'local-tile' : ''}`}>
    {hasVideo ? <video ref={video} autoPlay playsInline muted={muted} /> : <div className="voice-person"><span className="avatar avatar-xl">{avatar ? <img src={avatar} alt="" /> : name.slice(0, 1).toUpperCase()}</span><span className="voice-wave"><i /><i /><i /><i /><i /></span></div>}
    {!hasVideo && stream && <video ref={video} autoPlay playsInline muted={muted} className="audio-only" />}
    <div className="video-name"><span className="audio-presence" />{name}{local ? ' · you' : ''}</div>
  </div>;
}

export default function VoiceCall({ channelId, channelName, socket, user, onLeave }: Props) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [connected, setConnected] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState('');
  const local = useRef<MediaStream | null>(null);
  const peerMap = useRef(new Map<string, { pc: RTCPeerConnection; peer: Peer }>());
  const deafRef = useRef(false);
  const mounted = useRef(true);
  const iceRef = useRef(ICE);

  const send = useCallback((target: string, signal: unknown) => socket?.emit('voice:signal', { target, signal }), [socket]);
  const createPeer = useCallback((peer: Peer) => {
    const existing = peerMap.current.get(peer.socketId);
    if (existing) return existing.pc;
    const pc = new RTCPeerConnection({ iceServers: iceRef.current });
    local.current?.getTracks().forEach((track) => pc.addTrack(track, local.current!));
    pc.ontrack = (event) => {
      const stream = event.streams[0] || new MediaStream([event.track]);
      setStreams((current) => ({ ...current, [peer.socketId]: stream }));
    };
    pc.onicecandidate = (event) => { if (event.candidate) send(peer.socketId, { type: 'candidate', candidate: event.candidate }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setConnected(true);
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        if (pc.connectionState === 'failed') setError('This connection needs a TURN relay on some networks. See setup notes.');
        pc.close(); peerMap.current.delete(peer.socketId);
        setPeers((items) => items.filter((item) => item.socketId !== peer.socketId));
        setStreams((items) => { const next = { ...items }; delete next[peer.socketId]; return next; });
      }
    };
    pc.onnegotiationneeded = async () => {
      if (pc.signalingState !== 'stable') return;
      try { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); send(peer.socketId, { type: 'description', description: pc.localDescription }); }
      catch { setError('Couldn’t start this audio connection. Try leaving and joining again.'); }
    };
    peerMap.current.set(peer.socketId, { pc, peer });
    setPeers((items) => items.some((item) => item.socketId === peer.socketId) ? items : [...items, peer]);
    return pc;
  }, [send]);

  useEffect(() => {
    mounted.current = true;
    let stream: MediaStream;
    if (!socket) { setError('Connecting to CORE…'); return; }
    const join = async () => {
      try { const config = await api<{ iceServers: RTCIceServer[] }>('/api/ice-servers'); if (config.iceServers?.length) iceRef.current = config.iceServers; } catch { }
      socket.emit('voice:join', channelId, async (result: { error?: string; participants?: Peer[] }) => {
      if (result?.error) { setError(result.error); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
        local.current = stream; setAudioReady(true); setError('');
        const currentId = socket.id || '';
        for (const peer of result.participants || []) {
          if (currentId < peer.socketId) {
            const pc = createPeer(peer);
            const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
            send(peer.socketId, { type: 'description', description: pc.localDescription });
          } else createPeer(peer);
        }
      } catch {
        setError('Microphone access is needed to join voice. Check Windows privacy settings and allow CORE to use your microphone.');
        socket.emit('voice:leave');
      }
      });
    };
    void join();
    const peerJoined = (peer: Peer) => {
      if ((socket.id || '') < peer.socketId) {
        const pc = createPeer(peer);
        pc.createOffer().then((offer) => pc.setLocalDescription(offer).then(() => send(peer.socketId, { type: 'description', description: pc.localDescription })));
      } else createPeer(peer);
    };
    const peerLeft = ({ socketId }: { socketId: string }) => {
      const connection = peerMap.current.get(socketId); connection?.pc.close(); peerMap.current.delete(socketId);
      setPeers((items) => items.filter((item) => item.socketId !== socketId));
      setStreams((items) => { const next = { ...items }; delete next[socketId]; return next; });
    };
    const signal = async ({ from, signal: incoming }: { from: string; signal: any }) => {
      const peer = peersRef.current.find((item) => item.socketId === from) || pendingPeers.current.get(from);
      if (!peer) return;
      let pc = peerMap.current.get(from)?.pc;
      if (!pc) pc = createPeer(peer);
      try {
        if (incoming?.type === 'candidate') await pc.addIceCandidate(incoming.candidate);
        if (incoming?.type === 'description') {
          await pc.setRemoteDescription(incoming.description);
          if (incoming.description.type === 'offer') {
            const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
            send(from, { type: 'description', description: pc.localDescription });
          }
        }
      } catch { setError('The connection changed. Try rejoining this voice channel.'); }
    };
    const pendingPeers = { current: new Map<string, Peer>() };
    const peersRef = { current: [] as Peer[] };
    const joinedWrapped = (peer: Peer) => { pendingPeers.current.set(peer.socketId, peer); peerJoined(peer); };
    const signalWrapped = (value: any) => signal(value);
    const leftWrapped = (value: any) => peerLeft(value);
    socket.on('voice:peer-joined', joinedWrapped); socket.on('voice:peer-left', leftWrapped); socket.on('voice:signal', signalWrapped);
    const interval = window.setInterval(() => { peersRef.current = peers; deafRef.current = deafened; }, 100);
    return () => {
      mounted.current = false; window.clearInterval(interval);
      socket.off('voice:peer-joined', joinedWrapped); socket.off('voice:peer-left', leftWrapped); socket.off('voice:signal', signalWrapped);
      socket.emit('voice:leave');
      peerMap.current.forEach(({ pc }) => pc.close()); peerMap.current.clear();
      local.current?.getTracks().forEach((track) => track.stop()); local.current = null;
      setStreams({});
    };
  // peers is intentionally captured through a ref to keep the signaling listener stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, socket, createPeer, send]);

  useEffect(() => { peersRefCurrent.current = peers; }, [peers]);
  const peersRefCurrent = useRef<Peer[]>([]);
  // Keep the signal handler's peer lookup live across state updates.
  useEffect(() => { peersRefCurrent.current = peers; }, [peers]);

  const toggleMic = () => { const next = !muted; setMuted(next); local.current?.getAudioTracks().forEach((track) => { track.enabled = !next; }); };
  const toggleDeafen = () => {
    const next = !deafened; setDeafened(next); deafRef.current = next;
    document.querySelectorAll<HTMLVideoElement>('.video-tile video').forEach((video) => { if (!video.classList.contains('audio-only')) video.muted = true; });
    document.querySelectorAll<HTMLVideoElement>('.video-tile .audio-only').forEach((video) => { video.muted = next; });
  };
  const addVideoTracks = (stream: MediaStream) => {
    for (const track of stream.getVideoTracks()) {
      local.current?.addTrack(track);
      for (const { pc } of peerMap.current.values()) pc.addTrack(track, local.current!);
    }
  };
  const toggleCamera = async () => {
    if (cameraOn) {
      local.current?.getVideoTracks().filter((track) => track.label !== 'screen-share').forEach((track) => { track.stop(); local.current?.removeTrack(track); });
      setCameraOn(false); setStreams((items) => ({ ...items })); return;
    }
    try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } } }); addVideoTracks(stream); setCameraOn(true); setError(''); }
    catch { setError('Camera access is unavailable. Check Windows privacy settings.'); }
  };
  const shareScreen = async () => {
    if (sharing) {
      local.current?.getVideoTracks().filter((track) => track.label === 'screen-share').forEach((track) => { track.stop(); local.current?.removeTrack(track); });
      setSharing(false); return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 24 }, audio: false });
      const track = stream.getVideoTracks()[0]; Object.defineProperty(track, 'label', { value: 'screen-share' });
      addVideoTracks(stream); setSharing(true); setError('');
      track.onended = () => { local.current?.removeTrack(track); setSharing(false); };
    } catch { setError('Screen sharing was cancelled or unavailable.'); }
  };

  const allTiles: Tile[] = peers.flatMap((peer) => streams[peer.socketId] ? [{ peer, stream: streams[peer.socketId] }] : []);
  return <section className="call-view" aria-label={`Voice call in ${channelName}`}>
    <div className="call-topline"><div><span className="eyebrow">VOICE SPACE</span><h2>{channelName}</h2><span className="call-subtitle">{audioReady ? `${peers.length + 1} ${peers.length ? 'people' : 'person'} here` : error || 'Connecting…'}</span></div><div className="call-secure"><Signal size={14} /><span>{connected ? 'Connected' : audioReady ? 'Ready to talk' : 'Joining voice'}</span><span className="call-dot" /></div></div>
    {!audioReady && error && <div className="call-error"><div className="call-error-icon"><MicOff size={21} /></div><div><strong>We couldn’t start your microphone</strong><p>{error}</p>{error.includes('Microphone access') && <button className="button subtle small" onClick={() => window.location.reload()}><Check size={14} /> Try again</button>}</div></div>}
    <div className={`call-stage ${allTiles.length < 2 ? 'single-stage' : ''}`}>
      {audioReady && <VideoTile name={user.name} avatar={user.avatar} stream={local.current || undefined} muted local />}
      {allTiles.map(({ peer, stream }) => <VideoTile key={peer.socketId} name={peer.user.name} avatar={peer.user.avatar} stream={stream} muted={deafened} />)}
      {audioReady && peers.length === 0 && <div className="call-invite-hint"><span className="pulse-ring"><Signal size={17} /></span><strong>It’s quiet in here</strong><span>Invite someone to join the conversation.</span></div>}
    </div>
    {error && audioReady && <div className="call-warning"><span>{error}</span><button aria-label="Dismiss connection note" onClick={() => setError('')}>×</button></div>}
    <div className="call-controls"><div className="call-control-spacer" /><button className={`call-control ${muted ? 'is-active' : ''}`} aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'} onClick={toggleMic}><span>{muted ? <MicOff /> : <Mic />}</span><small>{muted ? 'Unmute' : 'Mute'}</small></button><button className={`call-control ${deafened ? 'is-active' : ''}`} aria-label={deafened ? 'Undeafen' : 'Deafen'} title={deafened ? 'Undeafen' : 'Deafen'} onClick={toggleDeafen}><span>{deafened ? <VolumeX /> : <Headphones />}</span><small>{deafened ? 'Undeafen' : 'Deafen'}</small></button><button className={`call-control ${cameraOn ? 'is-on' : ''}`} aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'} title={cameraOn ? 'Turn camera off' : 'Turn camera on'} onClick={toggleCamera}><span>{cameraOn ? <Camera /> : <CameraOff />}</span><small>Camera</small></button><button className={`call-control ${sharing ? 'is-on' : ''}`} aria-label={sharing ? 'Stop sharing screen' : 'Share screen'} title={sharing ? 'Stop sharing screen' : 'Share screen'} onClick={shareScreen}><span>{sharing ? <Check /> : <MonitorUp />}</span><small>{sharing ? 'Stop share' : 'Share'}</small></button><button className="call-control hangup" aria-label="Leave voice channel" title="Leave voice channel" onClick={onLeave}><span><PhoneOff /></span><small>Leave</small></button><div className="call-control-spacer" /></div>
  </section>;
}
