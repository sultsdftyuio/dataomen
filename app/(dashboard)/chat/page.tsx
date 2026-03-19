import React from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] max-w-6xl mx-auto w-full animate-in fade-in duration-500 pb-4">
      {/* We delegate all state, API calls, and UI rendering to the modular ChatLayout.
        This ensures we are using OmniMessageInput, DynamicChartFactory, and the 
        Direct-to-R2 upload pipeline built into the layout.
      */}
      <ChatLayout 
        agentId="default-router" 
        agentName="Data Assistant" 
      />
    </div>
  );
}