export type Status = 'online' | 'idle' | 'dnd' | 'invisible';
export type User = {
  id: string; name: string; handle: string; email?: string; avatar: string | null;
  banner: string | null; bio: string; status: Status; theme: 'violet' | 'ocean' | 'moss' | 'rose';
};
export type Channel = { id: string; serverId: string; name: string; kind: 'text' | 'voice'; topic: string; position: number };
export type Member = { serverId: string; userId: string; role: 'owner' | 'admin' | 'member'; joinedAt: string; user: User };
export type Server = { id: string; name: string; ownerId: string; icon: string | null; banner: string | null; description: string; channels: Channel[]; members: Member[] };
export type Message = { id: string; scope: 'channel' | 'dm'; channelId?: string; conversationId?: string; authorId: string; author: string; handle?: string; avatar: string | null; text: string; createdAt: string; system?: boolean };
export type Conversation = { id: string; memberIds: string[]; otherUser: User; createdAt: string };
export type Invite = { id: string; serverId: string; createdAt: number; expiresAt: number; revokedAt: number | null };
