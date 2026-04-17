// app/chat/[agentId]/page.tsx
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatPage({ params }: { params: { agentId: string } }) {
  return (
    <main className="flex h-screen flex-col bg-white">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Agent Interface</h1>
        <p className="text-sm text-slate-500">ID: {params.agentId}</p>
      </header>
      <section className="flex-1 min-h-0 overflow-hidden">
        <ChatLayout agentId={params.agentId} />
      </section>
    </main>
  );
}