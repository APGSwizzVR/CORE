export type Status = 'online' | 'idle' | 'dnd' | 'invisible';
export type Theme = 'violet' | 'ocean' | 'moss' | 'rose' | 'light' | 'system';
export type User = {
  id: string; name: string; handle: string; email?: string; avatar: string | null;
  banner: string | null; bio: string; status: Status; theme: Theme;
};
export type Channel = { id: string; serverId: string; name: string; kind: 'text' | 'voice'; topic: string; category?: string; slowModeSeconds?: number; private?: boolean; allowedUserIds?: string[]; position: number };
export type Member = { serverId: string; userId: string; role: 'owner' | 'admin' | 'member'; joinedAt: string; user: User };
export type Server = { id: string; name: string; ownerId: string; icon: string | null; banner: string | null; description: string; channels: Channel[]; members: Member[] };
export type MessageReaction = { emoji: string; userIds: string[] };
export type Poll = { question: string; options: Array<{ id: string; text: string; voterIds: string[] }>; updatedAt?: string };
export type Attachment = { url: string; name: string; mime: string; size: number };
export type Message = { id: string; scope: 'channel' | 'dm'; channelId?: string; conversationId?: string; threadParentId?: string; threadReplyCount?: number; authorId: string; author: string; handle?: string; avatar: string | null; text: string; createdAt: string; editedAt?: string; pinnedAt?: number; reactions?: MessageReaction[]; attachments?: Attachment[]; poll?: Poll; system?: boolean };
export type Conversation = { id: string; memberIds: string[]; otherUser: User; members?: User[]; isGroup?: boolean; name?: string; createdAt: string };
export type FriendRequest = { id: string; fromUserId: string; toUserId: string; createdAt: number; user: User };
export type Invite = { id: string; serverId: string; createdAt: number; expiresAt: number; revokedAt: number | null };
