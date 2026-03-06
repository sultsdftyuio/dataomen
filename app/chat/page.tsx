"use client";

import React from "react";
import Link from "next/link";
import { useAgents } from "@/hooks/useAgents";
import { Bot, MessageSquare, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ChatHubPage() {
  const { agents, isLoading } = useAgents();

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Active Chats</h1>
        <p className="text-muted-foreground mt-2">
          Select an analytical agent to begin a conversation.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : agents?.length === 0 ? (
        <Card className="border-dashed bg-muted/50">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <Bot className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Agents Found</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-6 max-w-sm">
              You need to create an analytical agent before you can start a chat.
            </p>
            <Button asChild>
              <Link href="/agents">Create Your First Agent</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents?.map((agent) => (
            <Card key={agent.id} className="hover:shadow-md transition-shadow group">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-primary" />
                  {agent.name}
                </CardTitle>
                <CardDescription className="line-clamp-2">
                  {agent.description || "Analytical agent ready for queries."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full group-hover:bg-primary/90 transition-colors">
                  <Link href={`/chat/${agent.id}`}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Start Chat
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}