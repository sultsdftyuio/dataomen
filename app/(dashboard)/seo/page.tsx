import React from 'react';
import Link from 'next/link';
import { 
  getAllSlugs, 
  getNormalizedPage 
} from '@/lib/seo/registry';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Search, FileText, Database, ShieldCheck } from "lucide-react";

export const metadata = {
  title: 'SEO Registry Explorer | Arcli Admin',
  description: 'Inventory and audit system for Arcli SEO v10.1 pages.',
};

export default function SEORegistryPage() {
  const slugs = getAllSlugs();
  
  // Hydrate and sort pages by type and then slug
  const pages = slugs
    .map(slug => {
      const page = getNormalizedPage(slug);
      return {
        slug,
        title: page?.seo?.title || 'Untitled',
        h1: page?.seo?.h1 || 'No H1',
        type: page?.type || 'default',
        description: page?.seo?.description,
        blocksCount: page?.blocks?.length || 0,
        isV2: !!page?.blocks,
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.slug.localeCompare(b.slug));

  const stats = {
    total: pages.length,
    v2: pages.filter(p => p.isV2).length,
    v1: pages.filter(p => !p.isV2).length,
  };

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">SEO Registry Explorer</h1>
          <p className="text-slate-500 mt-1">Audit and manage {stats.total} compounding authority assets.</p>
        </div>
        <div className="flex gap-3">
          <Badge variant="outline" className="px-3 py-1">
            {stats.v2} V2 Blocks
          </Badge>
          <Badge variant="secondary" className="px-3 py-1">
            {stats.v1} Legacy V1
          </Badge>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-4 rounded-xl border bg-slate-50/50 flex items-center gap-4">
          <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><FileText size={20}/></div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Silos Tracked</div>
            <div className="text-2xl font-bold">36</div>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-slate-50/50 flex items-center gap-4">
          <div className="bg-green-100 p-2 rounded-lg text-green-600"><Database size={20}/></div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Registry Status</div>
            <div className="text-2xl font-bold text-green-600">Healthy</div>
          </div>
        </div>
        <div className="p-4 rounded-xl border bg-slate-50/50 flex items-center gap-4">
          <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><ShieldCheck size={20}/></div>
          <div>
            <div className="text-sm text-slate-500 font-medium">Last Generated</div>
            <div className="text-sm font-bold">2026-04-04</div>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-slate-50">
            <TableRow>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="min-w-[200px]">Slug / Path</TableHead>
              <TableHead>SEO Title & H1</TableHead>
              <TableHead className="text-right">Architecture</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page.slug} className="hover:bg-slate-50/50 transition-colors">
                <TableCell>
                  <Badge className={getTypeColor(page.type)}>
                    {page.type}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-blue-600 font-medium">
                  /{page.slug}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-semibold text-slate-900 line-clamp-1">{page.title}</span>
                    <span className="text-xs text-slate-500 line-clamp-1 italic">{page.h1}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {page.isV2 ? (
                    <span className="text-xs font-bold text-green-600 uppercase tracking-wider">
                      V2 ({page.blocksCount} Blocks)
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                      V1 Legacy
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/${page.slug}`} target="_blank">
                      <ExternalLink size={16} className="mr-2" />
                      View Live
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function getTypeColor(type: string) {
  switch (type) {
    case 'guide':      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'comparison': return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'template':   return 'bg-purple-50 text-purple-700 border-purple-200';
    case 'integration':return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'campaign':   return 'bg-rose-50 text-rose-700 border-rose-200';
    default:           return 'bg-slate-50 text-slate-700 border-slate-200';
  }
}