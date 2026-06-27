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
  Lock,
  ShieldCheck
} from "lucide-react";

// Import your centralized design tokens
import { C } from "@/lib/tokens";
import { ApiClient } from "@/lib/api-client";

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

  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  // --- Data Fetching ---
  useEffect(() => {
    fetchKeys();
  }, []);

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      // Note: If your Python backend returns a PaginatedApiKeyResponse, 
      // you may need to adjust this to setKeys(data.items || data) 
      const data = await ApiClient.get<any>("/api/v1/api-keys");
      setKeys(data.items || data); 
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
      const data = await ApiClient.post<{
        key_id: string;
        name: string;
        masked_key: string;
        plaintext_key: string;
      }>("/api/v1/api-keys/generate", { 
        name: newKeyName 
      });
      
      setKeys(prev => [{
        key_id: data.key_id,
        name: data.name,
        masked_key: data.masked_key,
        created_at: new Date().toISOString(),
        is_revoked: false
      }, ...prev]);

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
      await ApiClient.post("/api/v1/api-keys/revoke", { 
        key_id: keyId 
      });
      
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
    <div style={{ fontFamily: sans }}>
      {/* ── Main Panel ── */}
      <div style={{ background: C.white, padding: 32, borderRadius: 8, border: surfaceBorder, boxShadow: surfaceShadow }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h3 className="pfd" style={{ fontSize: 20, fontWeight: 600, color: C.navy, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
              <Key size={18} color={C.blue} /> API Keys
            </h3>
            <p style={{ fontSize: 15, color: C.navySoft, lineHeight: 1.5 }}>
              Manage keys for custom event ingestion and secure integrations. Keep these secret.
            </p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={{ height: 40, padding: "0 18px", borderRadius: 8, background: C.navy, color: C.white, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <Plus size={16} /> Create new API Key
          </button>
        </div>

        {/* Data Table */}
        <div style={{ border: surfaceBorder, borderRadius: 8, overflow: "hidden", background: C.white }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: C.offWhite, borderBottom: surfaceBorder }}>
                <th style={{ padding: "12px 20px", fontSize: 12, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Key Name</th>
                <th style={{ padding: "12px 20px", fontSize: 12, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>API Key</th>
                <th style={{ padding: "12px 20px", fontSize: 12, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em" }}>Created At</th>
                <th style={{ padding: "12px 20px", fontSize: 12, fontWeight: 600, color: C.faint, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={4} style={{ padding: 48, textAlign: "center", color: C.faint, fontSize: 14, fontWeight: 500 }}>
                    <Loader2 size={24} className="animate-spin mx-auto mb-3" color={C.blueLight} /> Loading keys...
                  </td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 64, textAlign: "center" }}>
                    <div style={{ width: 48, height: 48, borderRadius: 24, background: C.offWhite, border: surfaceBorder, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                      <Lock size={20} color={C.faint} />
                    </div>
                    <div style={{ color: C.navy, fontWeight: 600, fontSize: 15, marginBottom: 4 }}>No API keys generated</div>
                    <div style={{ color: C.muted, fontSize: 14 }}>Create a key to authenticate your server-side requests.</div>
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.key_id} style={{ borderBottom: surfaceBorder, opacity: k.is_revoked ? 0.6 : 1, background: k.is_revoked ? C.offWhite : "transparent" }}>
                    <td style={{ padding: "16px 20px", fontSize: 14, fontWeight: 500, color: C.navy }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        {k.name}
                        {k.is_revoked && (
                          <span style={{ fontSize: 11, background: C.redPale, color: C.red, padding: "2px 8px", borderRadius: 4, fontWeight: 600, letterSpacing: "0.02em" }}>REVOKED</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, fontFamily: "monospace", color: C.navySoft }}>
                      <code style={{ background: C.offWhite, border: surfaceBorder, padding: "4px 8px", borderRadius: 6 }}>{k.masked_key}</code>
                    </td>
                    <td style={{ padding: "16px 20px", fontSize: 13, color: C.muted }}>
                      {new Date(k.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td style={{ padding: "16px 20px", textAlign: "right" }}>
                      {!k.is_revoked ? (
                        <button 
                          onClick={() => handleRevoke(k.key_id)}
                          disabled={revokingId === k.key_id}
                          style={{ background: "transparent", border: "1px solid transparent", color: C.faint, cursor: "pointer", padding: "6px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 500, transition: "color 0.2s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = C.red)}
                          onMouseLeave={(e) => (e.currentTarget.style.color = C.faint)}
                        >
                          {revokingId === k.key_id ? <Loader2 size={15} className="animate-spin" color={C.red} /> : <Trash2 size={15} />}
                          Revoke
                        </button>
                      ) : (
                        <span style={{ fontSize: 13, color: C.faint }}>Inactive</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Generate / Reveal Modal ── */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(10, 22, 40, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, backdropFilter: "blur(2px)" }}>
          <div style={{ background: C.white, padding: 32, borderRadius: 12, width: "100%", maxWidth: 480, boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)", border: `1px solid ${C.ruleDark}`, fontFamily: sans }}>
            
            {!newlyGeneratedKey ? (
              // STEP 1: Name the Key
              <form onSubmit={handleGenerate}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: C.bluePale, color: C.blue, display: "flex", alignItems: "center", justifyContent: "center", border: surfaceBorder }}>
                    <ShieldCheck size={20} />
                  </div>
                  <h3 className="pfd" style={{ fontSize: 20, fontWeight: 600, color: C.navy }}>Create API Key</h3>
                </div>
                
                <p style={{ fontSize: 15, color: C.navySoft, marginBottom: 24, lineHeight: 1.5 }}>
                  Give your key a descriptive name so you can identify it later (e.g., "Zapier Integration").
                </p>
                
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: C.navy, marginBottom: 8 }}>Key Name</label>
                <input 
                  type="text" 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="Production Worker 1" 
                  autoFocus
                  required
                  style={{ width: "100%", padding: "10px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 15, marginBottom: 32, color: C.navy, outline: "none" }}
                  onFocus={(e) => e.target.style.borderColor = C.blueLight}
                  onBlur={(e) => e.target.style.borderColor = C.rule}
                />
                
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button type="button" onClick={closeAndResetModal} style={{ padding: "0 16px", height: 40, background: "transparent", border: "none", color: C.faint, fontWeight: 500, cursor: "pointer", fontSize: 14 }}>
                    Cancel
                  </button>
                  <button type="submit" disabled={isGenerating || !newKeyName.trim()} style={{ padding: "0 18px", height: 40, background: C.navy, color: C.white, borderRadius: 6, border: "none", fontWeight: 600, cursor: isGenerating || !newKeyName.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: isGenerating || !newKeyName.trim() ? 0.7 : 1 }}>
                    {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Key size={16} />} 
                    Create API Key
                  </button>
                </div>
              </form>
            ) : (
              // STEP 2: The Reveal-Once View
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: C.greenPale, color: C.green, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid rgba(16,185,129,0.2)` }}>
                    <CheckCircle2 size={20} />
                  </div>
                  <h3 className="pfd" style={{ fontSize: 20, fontWeight: 600, color: C.navy }}>Secret Key Generated</h3>
                </div>
                
                <div style={{ background: C.redPale, border: `1px solid ${C.red}`, padding: 16, borderRadius: 8, marginBottom: 24, display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <AlertCircle size={20} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
                  <p style={{ fontSize: 14, color: "#991B1B", lineHeight: 1.5 }}>
                    <strong style={{ display: "block", marginBottom: 2 }}>Please copy this key now.</strong>
                    For your security, it will <strong>never be shown again</strong>. If you lose it, you will need to revoke it and generate a new one.
                  </p>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  <div style={{ flex: 1, background: C.offWhite, padding: "12px 14px", borderRadius: 6, border: surfaceBorder, fontSize: 14, fontFamily: "monospace", color: C.navy, wordBreak: "break-all" }}>
                    {newlyGeneratedKey}
                  </div>
                  <button 
                    onClick={handleCopy}
                    style={{ padding: "0 16px", borderRadius: 6, border: copied ? `1px solid ${C.green}` : surfaceBorder, background: copied ? C.green : C.white, color: copied ? C.white : C.navy, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s" }}>
                    {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <button onClick={closeAndResetModal} style={{ width: "100%", padding: "0 16px", height: 44, background: C.navy, color: C.white, borderRadius: 6, border: "none", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 14 }}>
                  <EyeOff size={18} /> I have safely stored this key
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}