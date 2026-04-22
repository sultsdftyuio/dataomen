const fs = require('fs');

function fixIdPage() {
  let content = fs.readFileSync('app/(dashboard)/datasets/[id]/page.tsx', 'utf-8');

  content = content.replace(
    /interface DatasetDetails \{\s*id: string;\s*name: string;\s*source_type: string;\s*row_count: number;\s*size_bytes: number;\s*last_synced: string;\s*version: number;\s*\}/,
    `interface DatasetDetails {
  id: string;
  name: string;
  source: { type: 'connector' | 'file'; subtype: string; };
  asset_kind: 'document' | 'tabular' | 'warehouse';
  row_count?: number;
  chunk_count?: number;
  size_bytes: number;
  last_synced: string;
  version: number;
}`
  );

  content = content.replace(
    /source_type: 'Stripe API',\s*row_count: 1450230,/,
    `source: { type: 'connector', subtype: 'Stripe API' },
      asset_kind: 'tabular',
      row_count: 1450230,`
  );

  content = content.replace(
    /<span>\{dataset\.source_type\}<\/span>\s*<span>•<\/span>\s*<span>\{\(dataset\.row_count\)\.toLocaleString\(\)\} Rows<\/span>/,
    `<span>{dataset.source.subtype}</span>
              <span>•</span>
              {dataset.asset_kind === 'document' ? (
                <span>{(dataset.chunk_count || 0).toLocaleString()} Chunks</span>
              ) : (
                <span>{(dataset.row_count || 0).toLocaleString()} Rows</span>
              )}`
  );

  fs.writeFileSync('app/(dashboard)/datasets/[id]/page.tsx', content);
}

function fixDatasetsPage() {
  let content = fs.readFileSync('app/(dashboard)/datasets/page.tsx', 'utf-8');

  // Fix Dataset interface
  content = content.replace(
    /interface Dataset \{[\s\S]*?chunk_count\?: number;\s*\}/,
    `interface Dataset {
  id: string;
  name: string;
  source: { type: 'connector' | 'file'; subtype: string; };
  asset_kind: 'document' | 'tabular' | 'warehouse';
  row_count?: number;
  chunk_count?: number;
  size: string;
  lastSynced: string;
  status: 'syncing' | 'indexing' | 'ready' | 'failed';
}`
  );

  // Fix polling
  content = content.replace(
    /const isSyncing = datasets\.some\(d => d\.status === 'Syncing'\);\s*let interval: NodeJS\.Timeout;\s*if \(isSyncing\) \{\s*interval = setInterval\(\(\) => fetchDatasets\(true\), 5000\);\s*\}\s*return \(\) => clearInterval\(interval\);/,
    `const isSyncing = datasets.some(d => ['syncing', 'indexing'].includes(d.status));
    let timeout: NodeJS.Timeout;
    let attempt = 0;
    const maxDelay = 30000;

    const poll = async () => {
      await fetchDatasets(true);
      attempt++;
      const delay = Math.min(5000 * Math.pow(1.5, attempt), maxDelay);
      timeout = setTimeout(poll, delay);
    };

    if (isSyncing) {
      timeout = setTimeout(poll, 5000);
    }
    return () => clearTimeout(timeout);`
  );

  // Fix handleConnectSubmit fake logic
  content = content.replace(
    /if \(selectedConnector\.authType === 'oauth'\) \{\s*await new Promise\(res => setTimeout\(res, 1000\)\);\s*setIsSuccess\(true\);\s*\}/,
    `if (selectedConnector.authType === 'oauth') {
        const token = await getSessionToken();
        const response = await fetch('/api/v1/integrations/oauth', {
          method: 'POST',
          headers: {
            'Authorization': \`Bearer \${token}\`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ connector_id: selectedConnector.id, credentials: formData }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail || 'OAuth connection failed.');
        }
        setIsSuccess(true);
      }`
  );

  // Status mapping UI updates
  content = content.replace(
    /\{dataset\.status === 'Ready' \? \([\s\S]*?<CheckCircle2[\s\S]*?Ready[\s\S]*?\) : dataset\.status === 'Syncing' \? \([\s\S]*?<RefreshCw[\s\S]*?Syncing\.\.\.[\s\S]*?\) : \([\s\S]*?<ShieldAlert[\s\S]*?Failed[\s\S]*?\)/,
    `{dataset.status === 'ready' ? (
                        <><CheckCircle2 className="w-4 h-4 text-emerald-500" /><span className="text-xs font-medium text-emerald-600">Ready</span></>
                      ) : dataset.status === 'syncing' ? (
                        <><RefreshCw className="w-4 h-4 text-blue-500 animate-spin" /><span className="text-xs font-medium text-blue-600">Syncing...</span></>
                      ) : dataset.status === 'indexing' ? (
                        <><RefreshCw className="w-4 h-4 text-purple-500 animate-spin" /><span className="text-xs font-medium text-purple-600">Indexing...</span></>
                      ) : (
                        <><ShieldAlert className="w-4 h-4 text-destructive" /><span className="text-xs font-medium text-destructive">Failed</span></>`
  );

  // window.location.href => router.push
  content = content.replace(/onClick=\{\(\) => window\.location\.href = '\/chat'\}/g, `onClick={() => router.push('/chat')}`);

  if (!content.includes('useRouter')) {
    content = content.replace(/import React, \{([^}]+)\} from 'react'/, `import React, { $1 } from 'react'\nimport { useRouter } from 'next/navigation'`);
    content = content.replace(/const \{ toast \} = useToast\(\)/, `const { toast } = useToast()\n  const router = useRouter()`);
  }

  // Update isDoc assignment
  content = content.replace(/const isDoc = !!dataset\.is_document;/g, `const isDoc = dataset.asset_kind === 'document';`);
  
  // sourceType logic
  content = content.replace(/isDoc \? 'Document' : dataset\.sourceType/g, `isDoc ? 'Document' : dataset.source.subtype`);

  // Silent failure catch
  content = content.replace(/console\.warn\("Dataset retrieval caught:", err\.message\);\s*setDatasets\(\[\]\);/g, 
  `toast({ variant: 'destructive', title: 'Fetch Error', description: err.message });
      setDatasets([]);`);
      
  // Update rowCount calls
  content = content.replace(/\{formatNumber\(dataset\.rowCount\)\}/g, `{formatNumber(dataset.row_count ?? 0)}`);

  fs.writeFileSync('app/(dashboard)/datasets/page.tsx', content);
}

try {
  fixIdPage();
  fixDatasetsPage();
  console.log('Fixed files successfully');
} catch (err) {
  console.error(err);
}
