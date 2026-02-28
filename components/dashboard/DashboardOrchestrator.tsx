'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DynamicChartFactory } from './DynamicChartFactory';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface WidgetLayout {
  w: number;
  h: number;
}

interface DashboardWidget {
  id: string;
  type: 'kpi' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'table';
  title: string;
  sql: string;
  xAxis?: string;
  yAxis?: string[];
  layout: WidgetLayout;
  data: any[];
}

interface DashboardConfig {
  title: string;
  widgets: DashboardWidget[];
}

interface DashboardOrchestratorProps {
  datasetId: string;
}

export function DashboardOrchestrator({ datasetId }: DashboardOrchestratorProps) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardConfig | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setDashboard(null);

    try {
      const res = await fetch(`/api/datasets/${datasetId}/dashboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      
      if (!res.ok) throw new Error('Failed to generate dynamic dashboard');
      
      const data: DashboardConfig = await res.json();
      setDashboard(data);
      toast.success('Generative Dashboard constructed successfully!');
    } catch (error: any) {
      toast.error(error.message || 'An error occurred during generation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      <div className="flex items-center space-x-3 bg-card p-4 rounded-xl shadow-sm border">
        <Sparkles className="w-5 h-5 text-primary" />
        <Input 
          placeholder="E.g., How is our marketing performing? Show spend over time and top campaigns." 
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="flex-1 border-0 focus-visible:ring-0 shadow-none bg-transparent"
          onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
        />
        <Button onClick={handleGenerate} disabled={loading || !prompt.trim()} className="rounded-full px-6">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Analyze
        </Button>
      </div>

      {dashboard && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="flex items-center justify-between">
             <h2 className="text-3xl font-bold tracking-tight text-foreground">{dashboard.title}</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {dashboard.widgets.map((widget) => (
              <div 
                key={widget.id} 
                style={{ gridColumn: `span ${widget.layout.w} / span ${widget.layout.w}` }}
                className="min-h-[200px]"
              >
                <Card className="h-full flex flex-col shadow-sm hover:shadow-md transition-shadow">
                  <CardHeader className="pb-2 border-b bg-muted/20">
                    <CardTitle className="text-sm font-semibold text-muted-foreground flex justify-between">
                      {widget.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-center pt-4">
                     <DynamicChartFactory widget={widget} />
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}