import React from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";

export default function ChatPage() {
  return (
    // Removed max-w-6xl, mx-auto, pb-4, and calc height.
    // Added flex-1 and h-full to inherit the parent's full dimensions perfectly.
    <div className="flex-1 flex flex-col h-full w-full animate-in fade-in duration-500">
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