// app/chat/[agentId]/page.tsx
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatPage({ params }: { params: { agentId: string } }) {
  return (
    <main className="flex flex-col h-screen bg-background">
      <header className="px-6 py-4 border-b bg-card">
        <h1 className="text-xl font-semibold text-foreground">Agent Interface</h1>
        <p className="text-sm text-muted-foreground">ID: {params.agentId}</p>
      </header>
      <section className="flex-1 min-h-0 overflow-hidden">
        <ChatLayout agentId={params.agentId} />
      </section>
    </main>
  );
}