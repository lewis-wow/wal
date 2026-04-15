import { ChatSidebar } from './chat-sidebar';
import { ChatWindow } from './chat-window';
import { StatusIndicator } from './status-indicator';

export function ChatLayout() {
  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-background mt-4 overflow-hidden rounded-xl border border-border shadow-md">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-sidebar">
        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60">
          Nostr Blinded Chat
        </h1>
        <StatusIndicator />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <ChatSidebar />
        <div className="flex-1 bg-muted/10">
          <ChatWindow />
        </div>
      </div>
    </div>
  );
}
