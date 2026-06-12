"use client";

import React, { useState, useEffect } from "react";
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  CheckCircle2, 
  AlertCircle,
  EyeOff,
  Loader2,
  Lock
} from "lucide-react";

// Using your established design tokens
const C = {
  navy: "#0F172A",
  navySoft: "#334155",
  faint: "#64748B",
  blue: "#2563EB",
  green: "#10B981",
  red: "#EF4444",
  border: "rgba(0,0,0,0.08)",
  shadow: "0 1px 3px rgba(0,0,0,0.08)"
};

interface ApiKeyMetadata {
  key_id: string;
  name: string;
  masked_key: string;
  created_at: string;
  is_revoked: boolean;
}

export function ApiKeysManager() {
  const [keys, setKeys] = useState<ApiKeyMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Generation State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Reveal-Once State
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revocation State
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      // Adjust this URL if your Next.js route is mounted differently
      const res = await fetch("/api/v1/api-keys");
      if (res.ok) {
        const data = await res.json();
        setKeys(data);
      }
    } catch (err) {
      console.error("Failed to fetch keys", err);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Actions ---
  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    
    setIsGenerating(true);
    try {
      const res = await fetch("/api/v1/api-keys/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName })
      });

      if (!res.ok) throw new Error("Generation failed");
      
      const data = await res.json();
      
      // Update local state to show the new key immediately in the background table
      setKeys(prev => [{
        key_id: data.key_id,
        name: data.name,
        masked_key: data.masked_key,
        created_at: new Date().toISOString(),
        is_revoked: false
      }, ...prev]);

      // Trigger the Reveal-Once view
      setNewlyGeneratedKey(data.plaintext_key);
    } catch (err) {
      console.error(err);
      alert("Failed to generate API Key.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm("Are you sure? This will instantly break any integrations using this key.")) return;
    
    setRevokingId(keyId);
    try {
      const res = await fetch("/api/v1/api-keys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: keyId })
      });

      if (!res.ok) throw new Error("Revocation failed");
      
      // Optimistic UI update
      setKeys(prev => prev.map(k => k.key_id === keyId ? { ...k, is_revoked: true } : k));
    } catch (err) {
      console.error(err);
      alert("Failed to revoke API Key.");
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = () => {
    if (newlyGeneratedKey) {
      navigator.clipboard.writeText(newlyGeneratedKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const closeAndResetModal = () => {
    setIsModalOpen(false);
    setNewKeyName("");
    setNewlyGeneratedKey(null);
    setCopied(false);
  };

  return (
    <div style={{ background: "#FFFFFF", padding: 24, borderRadius: 8, border: `1px solid ${C.border}`, boxShadow: C.shadow }}>
      
      {/* --- Header --- */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: C.navy, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <Key size={18} /> API Keys
          </h3>
          <p style={{ fontSize: 14, color: C.faint }}>
            Manage production API keys for custom event ingestion and third-party integrations.
          </p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          style={{ height: 36, padding: "0 16px", borderRadius: 6, background: C.navy, color: "#fff", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={16} /> Create Secret Key
        </button>
      </div>

      {/* --- Data Table --- */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ background: "#F8FAFC", borderBottom: `1px solid ${C.border}` }}>
              <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</th>
              <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Secret Key</th>
              <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em" }}>Created</th>
              <th style={{ padding: "12px 16px", fontSize: 12, fontWeight: 600, color: C.navySoft, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} style={{ padding: 32, textAlign: "center", color: C.faint, fontSize: 14 }}>
                  <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Loading keys...
                </td>
              </tr>
            ) : keys.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: 48, textAlign: "center", color: C.faint, fontSize: 14 }}>
                  <Lock size={24} style={{ margin: "0 auto 12px", opacity: 0.5 }} />
                  No API keys generated yet.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.key_id} style={{ borderBottom: `1px solid ${C.border}`, opacity: k.is_revoked ? 0.6 : 1 }}>
                  <td style={{ padding: "16px", fontSize: 14, fontWeight: 500, color: C.navy }}>
                    {k.name}
                    {k.is_revoked && <span style={{ marginLeft: 8, fontSize: 11, background: "#FEE2E2", color: C.red, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>REVOKED</span>}
                  </td>
                  <td style={{ padding: "16px", fontSize: 13, fontFamily: "monospace", color: C.navySoft }}>
                    {k.masked_key}
                  </td>
                  <td style={{ padding: "16px", fontSize: 13, color: C.faint }}>
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "16px", textAlign: "right" }}>
                    {!k.is_revoked && (
                      <button 
                        onClick={() => handleRevoke(k.key_id)}
                        disabled={revokingId === k.key_id}
                        style={{ background: "transparent", border: "none", color: C.red, cursor: "pointer", padding: 6, borderRadius: 4 }}>
                        {revokingId === k.key_id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* --- Generate / Reveal Modal Overlay --- */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, backdropFilter: "blur(4px)" }}>
          <div style={{ background: "#fff", padding: 32, borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)" }}>
            
            {!newlyGeneratedKey ? (
              // STEP 1: Name the Key
              <form onSubmit={handleGenerate}>
                <h3 style={{ fontSize: 20, fontWeight: 600, color: C.navy, marginBottom: 8 }}>Create API Key</h3>
                <p style={{ fontSize: 14, color: C.faint, marginBottom: 24 }}>Give your key a descriptive name so you can identify it later.</p>
                
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 8 }}>Key Name</label>
                <input 
                  type="text" 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production Worker" 
                  autoFocus
                  required
                  style={{ width: "100%", padding: "10px 12px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 14, marginBottom: 24 }}
                />
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button type="button" onClick={closeAndResetModal} style={{ padding: "0 16px", height: 40, background: "transparent", border: "none", color: C.faint, fontWeight: 500, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" disabled={isGenerating || !newKeyName.trim()} style={{ padding: "0 16px", height: 40, background: C.navy, color: "#fff", borderRadius: 6, border: "none", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    {isGenerating && <Loader2 size={16} className="animate-spin" />} Generate
                  </button>
                </div>
              </form>
            ) : (
              // STEP 2: The Reveal-Once Vault
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: "rgba(16,185,129,0.1)", color: C.green, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 600, color: C.navy }}>Key Generated</h3>
                </div>
                
                <div style={{ background: "#FEF2F2", border: "1px solid #FCA5A5", padding: 16, borderRadius: 8, marginBottom: 24, display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <AlertCircle size={18} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 13, color: "#991B1B", lineHeight: 1.5 }}>
                    <strong>Please copy this key now.</strong> For your security, it will never be shown again. If you lose it, you will need to generate a new one.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  <div style={{ flex: 1, background: "#F8FAFC", padding: "12px 16px", borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 14, fontFamily: "monospace", color: C.navy, wordBreak: "break-all" }}>
                    {newlyGeneratedKey}
                  </div>
                  <button 
                    onClick={handleCopy}
                    style={{ padding: "0 16px", borderRadius: 6, border: `1px solid ${C.border}`, background: copied ? C.green : "#fff", color: copied ? "#fff" : C.navy, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }}>
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <button onClick={closeAndResetModal} style={{ width: "100%", padding: "0 16px", height: 44, background: C.navy, color: "#fff", borderRadius: 6, border: "none", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <EyeOff size={16} /> I have safely stored this key
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}