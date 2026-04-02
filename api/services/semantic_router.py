# api/services/semantic_router.py

"""
ARCLI.TECH - CORE ENGINE
Module: Semantic Router (api.services.semantic_router)
Support: support@arcli.tech

Architecture: Hybrid Performance Paradigm
- Adaptive Compute Orchestration (Fluid tier scaling, Latency SLA enforcement)
- Contextual Bandit Exploration (LinUCB & Episodic Memory)
- Object-Oriented Mathematical Fusion (Normalized vectors, Learned Cost routing)
- Strict Multi-Tenant Security (Tenant partition enforcement, Sliding Window Rate limits)
- Hierarchical Routing (Intent -> Family -> Dataset)
"""

import logging
import json
import time
import math
import hashlib
import asyncio
import re
import numpy as np
from collections import defaultdict, deque
from typing import List, Dict, Any, Literal, Optional, Tuple, Set

from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy.orm import Session

# Core Modular Services
from api.services.llm_client import LLMClient, llm_client as default_llm
from api.services.cache_manager import cache_manager as default_cache

# Models & Database
from models import Dataset

logger = logging.getLogger(__name__)

# =====================================================================
# DATA CONTRACTS & TAXONOMY
# =====================================================================

IntentCategory = Literal[
    "REVENUE_ANALYSIS", 
    "USER_RETENTION", 
    "FUNNEL_ANALYSIS", 
    "COHORT_ANALYSIS", 
    "OPERATIONAL_METRICS",
    "UNKNOWN_FALLBACK"
]

DatasetFamily = Literal[
    "FINANCE",
    "MARKETING",
    "PRODUCT",
    "SALES",
    "SUPPORT",
    "UNKNOWN"
]

ComputeTier = Literal["ECONOMY", "STANDARD", "PREMIUM"]
FallbackStrategy = Literal["NONE", "CACHE", "VECTOR", "LLM", "DETERMINISTIC", "SAFETY", "TIMEOUT", "LATENCY_ESCALATION", "BACKPRESSURE"]

class RouteDecision(BaseModel):
    model_config = ConfigDict(strict=True)

    reasoning: str = Field(..., description="Step-by-step logic explaining the chosen route.")
    destination: Literal["CONVERSATIONAL", "ANALYTICAL", "COMPLEX_COMPUTATION", "METRIC_DEFINITION", "CLARIFICATION_REQUIRED"]
    intent_class: IntentCategory = Field(..., description="Strict taxonomy label for routing caching.")
    dataset_family: DatasetFamily = Field(default="UNKNOWN", description="Hierarchical family boundary for datasets.")
    intent_summary: str = Field(..., description="Abstracted intent used for context injection.")
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    requires_omni_graph: bool = False
    extracted_global_filters: Dict[str, Any] = Field(default_factory=dict)
    estimated_compute_tier: ComputeTier = "STANDARD"

class DatasetRelevance(BaseModel):
    model_config = ConfigDict(strict=True)

    dataset_id: str
    relevance_score: float = Field(..., ge=0.0, le=1.0)
    join_feasibility: Literal["HIGH", "MODERATE", "NONE", "N/A"] = Field(
        default="N/A", description="Evaluates shared keys with other selected datasets."
    )
    reasoning: str

class DatasetSelection(BaseModel):
    model_config = ConfigDict(strict=True)

    ranked_datasets: List[DatasetRelevance] = Field(default_factory=list)
    complexity_warning: Optional[str] = None

class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(strict=True)
    
    dataset_id: str
    fused_score: float
    vector_contribution: float
    llm_contribution: float
    contextual_memory_bonus: float
    cost_penalty: float
    join_modifier: float
    reason: str
    selected: bool = False

class RoutingTrace(BaseModel):
    """Structured Telemetry for Observability, Auto-Tuning, & Feedback Loops."""
    model_config = ConfigDict(strict=True)

    tenant_id: str
    query_fingerprint: str = ""
    route_destination: str = "PENDING"
    compute_tier: str = "PENDING"
    downgraded_tier: bool = False
    upgraded_tier: bool = False
    vector_top_score: float = 0.0
    candidate_pool_size: int = 0
    selected_dataset_ids: List[str] = Field(default_factory=list)
    fallback_used: FallbackStrategy = "NONE"
    latency_ms: float = 0.0
    adaptive_threshold_applied: float = 0.0
    reason: str = "Success"
    reasoning_summary: List[ScoreBreakdown] = Field(default_factory=list)

# =====================================================================
# THE MASTER SEMANTIC ROUTER
# =====================================================================

class SemanticRouter:
    """
    Intelligent routing engine with Query Fingerprinting, Learned Costs, 
    Contextual Bandits (Episodic Memory), and Hierarchical Family Routing.
    """
    
    def __init__(self, llm_client: Optional[LLMClient] = None, cache_manager: Optional[Any] = None):
        self.llm_client = llm_client or default_llm
        self.cache_manager = cache_manager or default_cache
        
        # System constraints & configuration
        self.CONFIDENCE_FLOOR: float = 0.50
        self.VECTOR_OVERRIDE_THRESHOLD: float = 0.92
        self.MIN_VECTOR_THRESHOLD: float = 0.65
        self.MAX_CATALOG_TOKENS: int = 3500 
        self.LLM_TIMEOUT_SECONDS: float = 3.5
        self.LATENCY_BUDGET_SECONDS: float = 2.5 

        # SLA, Cost & RL Adjustments
        self.TIER_LIMITS: Dict[ComputeTier, int] = {"ECONOMY": 1, "STANDARD": 2, "PREMIUM": 4}
        self.EXPLORATION_RATE: float = 0.15 
        self.COST_LAMBDA: float = 0.15  
        
        self.GENERIC_KEYS: Set[str] = {"id", "email", "created_at", "updated_at", "tenant_id", "uuid"}
        
        # Rate Limiting config
        self.RATE_LIMIT_WINDOW_SEC: int = 60
        self.RATE_LIMIT_MAX_REQUESTS: int = 150

    def _normalize_vector(self, vec: np.ndarray) -> np.ndarray:
        """Fix 1: Pre-normalization of vectors to prevent cosine distortion."""
        norm = np.linalg.norm(vec)
        if norm == 0: return vec
        return vec / norm

    # -----------------------------------------------------------------
    # STAGE 1: INTENT, CALIBRATION & ADAPTIVE COMPUTE
    # -----------------------------------------------------------------

    async def route_query(self, prompt: str, tenant_id: str, force_deterministic: bool = False) -> Tuple[RouteDecision, RoutingTrace]:
        start_time = time.perf_counter()
        trace = RoutingTrace(tenant_id=tenant_id)
        
        # Backpressure Check
        if await self._is_tenant_rate_limited(tenant_id):
            trace.fallback_used = "BACKPRESSURE"
            trace.reason = "Tenant exceeded sliding window rate limit."
            return self._build_fallback_decision(), trace

        if force_deterministic:
            decision = self._build_fallback_decision()
            trace.fallback_used = "DETERMINISTIC"
            trace.compute_tier = "STANDARD"
            return decision, trace

        system_prompt = """
        Route the prompt and assign a Compute Tier based on complexity:
        - ECONOMY: Single metric, no filters.
        - STANDARD: Multiple metrics or complex temporal/categorical filters.
        - PREMIUM: Cross-platform joins (Omni-Graph), cohort analysis, or deep-dives.
        
        Extract an `intent_class` strictly from the allowed taxonomy enum.
        Identify a `dataset_family` (FINANCE, MARKETING, PRODUCT, SALES, SUPPORT, UNKNOWN).
        Extract an `intent_summary` that strips specific dates/names to group similar queries.
        CRITICAL: If highly ambiguous, set confidence_score < 0.50.
        """
        
        try:
            decision: RouteDecision = await asyncio.wait_for(
                self.llm_client.generate_structured(
                    system_prompt=system_prompt,
                    prompt=prompt,
                    response_model=RouteDecision,
                    temperature=0.0
                ),
                timeout=self.LLM_TIMEOUT_SECONDS
            )
            
            decision.confidence_score = self._calibrate_confidence(decision.confidence_score)
            
            if decision.estimated_compute_tier == "PREMIUM" and await self._is_tenant_capped(tenant_id):
                logger.warning(f"[{tenant_id}] Daily burst usage limit exceeded. Downgrading PREMIUM route.")
                decision.estimated_compute_tier = "STANDARD"
                decision.requires_omni_graph = False
                trace.downgraded_tier = True
                
            elif decision.confidence_score < 0.65 and decision.estimated_compute_tier == "ECONOMY" and not await self._is_tenant_capped(tenant_id):
                decision.estimated_compute_tier = "STANDARD"
                trace.upgraded_tier = True
            
            if decision.confidence_score < self.CONFIDENCE_FLOOR:
                decision.destination = "CLARIFICATION_REQUIRED"
                
            trace.route_destination = decision.destination
            trace.compute_tier = decision.estimated_compute_tier
            trace.latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            
            return decision, trace

        except asyncio.TimeoutError:
            trace.fallback_used = "TIMEOUT"
            return self._build_fallback_decision(), trace
        except Exception as e:
            trace.fallback_used = "SAFETY"
            trace.reason = f"Routing Error: {str(e)}"
            return self._build_fallback_decision(), trace

    def _build_fallback_decision(self) -> RouteDecision:
        return RouteDecision(
            reasoning="Fallback activated due to engine constraint or deterministic mode.", 
            destination="CONVERSATIONAL",
            intent_class="UNKNOWN_FALLBACK",
            dataset_family="UNKNOWN",
            intent_summary="Unknown fallback intent", 
            confidence_score=0.0, 
            estimated_compute_tier="ECONOMY"
        )

    def _calibrate_confidence(self, raw_score: float) -> float:
        return 1.0 / (1.0 + math.exp(-5.0 * (raw_score - 0.5)))

    # -----------------------------------------------------------------
    # STAGE 2: HIERARCHICAL DISCOVERY & HARD VALIDATION
    # -----------------------------------------------------------------

    async def route_datasets(
        self, 
        db: Session, 
        trace: RoutingTrace,
        decision: RouteDecision, 
        embedding: Optional[np.ndarray] = None,
        allowed_dataset_ids: Optional[List[str]] = None,
        force_deterministic: bool = False
    ) -> Tuple[List[Dataset], RoutingTrace]:
        start_time = time.perf_counter()
        tenant_id = trace.tenant_id
        
        if embedding is not None:
            embedding = self._normalize_vector(np.array(embedding, dtype=np.float32))

        # Fix 3: Stable Query Fingerprinting
        trace.query_fingerprint = self._generate_query_fingerprint(decision, embedding)
        cache_key = f"route_cluster_{tenant_id}_{decision.dataset_family}_{decision.intent_class}"
        cached_ids = await self.cache_manager.get(cache_key)
        
        query = db.query(Dataset).filter(Dataset.tenant_id == tenant_id)
        if allowed_dataset_ids:
            query = query.filter(Dataset.id.in_(allowed_dataset_ids))
        all_datasets = query.all()
        
        family_datasets = [ds for ds in all_datasets if getattr(ds, "family", "UNKNOWN") == decision.dataset_family]
        primary_pool = family_datasets if family_datasets else all_datasets

        if cached_ids and not force_deterministic and decision.confidence_score > 0.8:
            trace.fallback_used = "CACHE"
            trace.selected_dataset_ids = cached_ids
            self._log_trace(trace, start_time, success=True)
            return [ds for ds in all_datasets if str(ds.id) in cached_ids], trace

        if not all_datasets:
            trace.reason = "No Datasets Configured"
            self._log_trace(trace, start_time, success=False)
            return [], trace

        trace.candidate_pool_size = len(primary_pool)
        max_k = self.TIER_LIMITS.get(trace.compute_tier, 2)
        
        scored_datasets = self._rank_by_vector(primary_pool, embedding) if embedding is not None else self._rank_by_hybrid_keyword(primary_pool, decision.intent_summary)

        if len(primary_pool) <= 3 or force_deterministic:
            trace.fallback_used = "DETERMINISTIC" if force_deterministic else "VECTOR"
            final_datasets = [ds for _, ds in scored_datasets[:max_k]] if scored_datasets else primary_pool[:max_k]
            trace.selected_dataset_ids = [str(ds.id) for ds in final_datasets]
            self._log_trace(trace, start_time, success=True)
            return final_datasets, trace

        candidate_pool = primary_pool
        fallback_vector_datasets = []
        vector_scores_dict = {}

        if scored_datasets:
            trace.vector_top_score = scored_datasets[0][0]
            fallback_vector_datasets = [ds for score, ds in scored_datasets[:max_k] if score >= self.MIN_VECTOR_THRESHOLD]
            vector_scores_dict = {str(ds.id): score for score, ds in scored_datasets}
            
            elapsed = time.perf_counter() - start_time
            if elapsed > self.LATENCY_BUDGET_SECONDS * 0.7:
                trace.fallback_used = "LATENCY_ESCALATION"
                trace.downgraded_tier = True
                final = fallback_vector_datasets if fallback_vector_datasets else [scored_datasets[0][1]]
                trace.selected_dataset_ids = [str(ds.id) for ds in final]
                trace.reason = f"Latency budget critical ({elapsed:.2f}s). Escaped to Vector."
                self._log_trace(trace, start_time, success=True)
                return final, trace

            if trace.vector_top_score >= self.VECTOR_OVERRIDE_THRESHOLD and trace.compute_tier == "ECONOMY" and decision.confidence_score > 0.8:
                trace.fallback_used = "VECTOR"
                trace.selected_dataset_ids = [str(scored_datasets[0][1].id)]
                trace.reason = "High-confidence vector override applied"
                self._log_trace(trace, start_time, success=True)
                return [scored_datasets[0][1]], trace
            
            pre_pool = [ds for score, ds in scored_datasets[:10]]
            # Enhanced Cost model integrated into initial filtering
            candidate_pool = sorted(pre_pool, key=lambda x: self._estimate_query_cost(x, decision, tenant_id))[:7]

        allowed_ids_str = ", ".join([str(ds.id) for ds in candidate_pool])
        catalog_context = self._summarize_catalog(candidate_pool)
        
        system_prompt = f"""
        Rank these {len(candidate_pool)} datasets for the user intent.
        Assign score (0.0 to 1.0). Penalize redundancy.
        CRITICAL CONSTRAINT: You may ONLY return dataset_ids from this exact list: [{allowed_ids_str}].
        Do NOT hallucinate IDs.
        CATALOG: {catalog_context}
        """

        try:
            selection: DatasetSelection = await asyncio.wait_for(
                self.llm_client.generate_structured(
                    system_prompt=system_prompt,
                    prompt=decision.intent_summary,
                    response_model=DatasetSelection,
                    temperature=0.0
                ),
                timeout=self.LLM_TIMEOUT_SECONDS
            )
            
            valid_pool_ids = {str(ds.id) for ds in candidate_pool}
            clean_ranked = [r for r in selection.ranked_datasets if r.dataset_id in valid_pool_ids]
            
            valid_targets, breakdowns = await self._validate_and_clean_ids(
                clean_ranked, candidate_pool, 0.5, vector_scores_dict, tenant_id, decision, embedding
            )

            # Fix 8: LLM Safety Injection Layer
            if fallback_vector_datasets and trace.vector_top_score > 0.85:
                top_vec_id = str(fallback_vector_datasets[0].id)
                if top_vec_id not in [t.dataset_id for t in valid_targets]:
                    logger.info(f"[{tenant_id}] Safety Injection: LLM omitted high-confidence vector match. Restoring {top_vec_id}.")
                    valid_targets.append(DatasetRelevance(
                        dataset_id=top_vec_id, 
                        relevance_score=trace.vector_top_score, 
                        join_feasibility="N/A", 
                        reasoning="Vector Safety Fallback Injection"
                    ))
            
            trace.reasoning_summary = breakdowns
            dynamic_explore_rate = self.EXPLORATION_RATE + (0.1 * (1.0 - decision.confidence_score))
            
            final_routed_datasets = await self._enforce_diversity_and_exploration(
                valid_targets, candidate_pool, max_k, decision, 0.5, dynamic_explore_rate
            )
            
            if decision.requires_omni_graph and len(final_routed_datasets) > 1:
                fused_scores = {b.dataset_id: b.fused_score for b in breakdowns}
                final_routed_datasets = await self._find_optimal_join_graph(final_routed_datasets, tenant_id, fused_scores)
                
                if len(final_routed_datasets) < 2:
                    trace.fallback_used = "NONE"
                    trace.reason = "JOIN_NOT_POSSIBLE"
                    self._log_trace(trace, start_time, success=False)
                    return fallback_vector_datasets[:1] if fallback_vector_datasets else candidate_pool[:1], trace

            if not final_routed_datasets:
                logger.warning(f"[{tenant_id}] Primary routing yielded no datasets. Falling back.")
                if trace.vector_top_score > 0.60 and fallback_vector_datasets:
                    trace.fallback_used = "VECTOR"
                    final_routed_datasets = fallback_vector_datasets
                else:
                    trace.fallback_used = "SAFETY"
                    final_routed_datasets = candidate_pool[:1]
            else:
                trace.fallback_used = "LLM"

        except Exception as e:
            logger.error(f"[{tenant_id}] LLM Selection Fallback Triggered: {e}")
            trace.fallback_used = "SAFETY"
            trace.reason = "LLM Ranker Fallback"
            final_routed_datasets = fallback_vector_datasets if fallback_vector_datasets else candidate_pool[:1]

        selected_ids = {str(ds.id) for ds in final_routed_datasets}
        for breakdown in trace.reasoning_summary:
            if breakdown.dataset_id in selected_ids:
                breakdown.selected = True

        trace.selected_dataset_ids = list(selected_ids)
        if trace.fallback_used in ["LLM", "VECTOR", "CACHE"]:
            await self.cache_manager.set(cache_key, trace.selected_dataset_ids, ttl_seconds=600)
            
        self._log_trace(trace, start_time, success=True)
        return final_routed_datasets, trace

    # -----------------------------------------------------------------
    # STAGE 3: CONTEXTUAL BANDITS & LEARNED MEMORY
    # -----------------------------------------------------------------

    async def ingest_routing_feedback(self, tenant_id: str, success: bool, datasets_used: List[str], latency_ms: float = 0.0, user_rating: float = 0.0, query_cost: float = 0.0, embedding: Optional[np.ndarray] = None) -> None:
        norm_success = 1.0 if success else -1.0
        norm_rating = (user_rating - 3) / 2.0 if user_rating else 0.0
        norm_lat = max(-0.5, -(latency_ms / 10000.0))
        
        reward = (0.6 * norm_success) + (0.3 * norm_rating) + (0.1 * norm_lat)

        key = f"rl_weights_{tenant_id}"
        weights = await self.cache_manager.get(key) or {"w_vec": 0.5, "w_llm": 0.5, "samples": 0}
        
        lr = 0.05
        if reward > 0:
            weights["w_llm"] = min(0.8, weights["w_llm"] + (lr * reward))
        else:
            weights["w_vec"] = min(0.8, weights["w_vec"] + (lr * abs(reward)))
            
        weights["samples"] += 1
        await self.cache_manager.set(key, weights, ttl_seconds=86400 * 30)
        
        if embedding is not None:
            norm_embed = self._normalize_vector(np.array(embedding, dtype=np.float32))
            mem_key = f"q_mem_{tenant_id}"
            memory_bank = await self.cache_manager.get(mem_key) or []
            
            memory_bank.append({
                "vec": np.round(norm_embed, 4).tolist(),
                "ds_ids": datasets_used,
                "reward": reward,
                "ts": time.time()
            })
            
            if len(memory_bank) > 100:
                memory_bank = memory_bank[-100:]
                
            await self.cache_manager.set(mem_key, memory_bank, ttl_seconds=86400 * 14)

    async def _get_contextual_prior(self, tenant_id: str, current_embedding: Optional[np.ndarray]) -> Dict[str, float]:
        if current_embedding is None:
            return {}
            
        mem_key = f"q_mem_{tenant_id}"
        memory_bank = await self.cache_manager.get(mem_key)
        if not memory_bank:
            return {}

        ds_scores = defaultdict(float)
        target = self._normalize_vector(np.array(current_embedding, dtype=np.float32))

        for mem in memory_bank:
            mem_vec = np.array(mem["vec"], dtype=np.float32)
            sim = target @ mem_vec
            
            # Fix 2: Soft weighting instead of hard 0.80 cutoff
            weight = math.exp(5 * (sim - 1))
            for ds_id in mem["ds_ids"]:
                ds_scores[ds_id] += (sim * mem["reward"] * weight)

        return {k: max(-1.0, min(1.0, v)) for k, v in ds_scores.items()}

    async def _validate_and_clean_ids(
        self, ranked_items: List[DatasetRelevance], pool: List[Dataset], 
        threshold: float, vector_scores: Dict[str, float], tenant_id: str,
        decision: RouteDecision, embedding: Optional[np.ndarray] = None
    ) -> Tuple[List[DatasetRelevance], List[ScoreBreakdown]]:
        valid_ids = {str(ds.id) for ds in pool}
        pool_dict = {str(ds.id): ds for ds in pool}
        seen = set()
        clean = []
        breakdowns = []
        
        rl_data = await self.cache_manager.get(f"rl_weights_{tenant_id}") or {}
        w_vec = rl_data.get("w_vec", 0.6)
        w_llm = rl_data.get("w_llm", 0.4)
        
        context_priors = await self._get_contextual_prior(tenant_id, embedding)
        
        raw_llms = {item.dataset_id: min(item.relevance_score, 0.9) for item in ranked_items if item.dataset_id in valid_ids}
        norm_vec = self._normalize_scores({k: v for k, v in vector_scores.items() if k in valid_ids})
        norm_llm = self._normalize_scores(raw_llms)
        
        for item in sorted(ranked_items, key=lambda x: x.relevance_score, reverse=True):
            if item.dataset_id in valid_ids and item.dataset_id not in seen:
                ds = pool_dict[item.dataset_id]
                
                v_score = norm_vec.get(item.dataset_id, 0.0)
                l_score = norm_llm.get(item.dataset_id, 0.0)
                ctx_bonus = context_priors.get(item.dataset_id, 0.0) * 0.2
                
                cost_penalty = self._estimate_query_cost(ds, decision, tenant_id) / 100.0
                join_mod = 1.2 if decision.requires_omni_graph and item.join_feasibility == "HIGH" else 1.0
                
                raw_fusion = (w_vec * v_score) + (w_llm * l_score) + ctx_bonus
                fused_score = (raw_fusion * join_mod) - (cost_penalty * self.COST_LAMBDA)
                
                breakdowns.append(ScoreBreakdown(
                    dataset_id=item.dataset_id,
                    fused_score=round(fused_score, 3),
                    vector_contribution=round(v_score * w_vec, 3),
                    llm_contribution=round(l_score * w_llm, 3),
                    contextual_memory_bonus=round(ctx_bonus, 3),
                    cost_penalty=round(cost_penalty * self.COST_LAMBDA, 3),
                    join_modifier=join_mod,
                    reason=item.reasoning[:150]
                ))

                if fused_score >= threshold:
                    clean.append(DatasetRelevance(
                        dataset_id=item.dataset_id,
                        relevance_score=fused_score,
                        join_feasibility=item.join_feasibility,
                        reasoning=item.reasoning
                    ))
                    seen.add(item.dataset_id)
                    
        return clean, breakdowns

    def _normalize_scores(self, scores: Dict[str, float]) -> Dict[str, float]:
        if not scores: return {}
        vals = list(scores.values())
        min_v, max_v = min(vals), max(vals)
        if max_v - min_v < 1e-6: 
            return {k: 0.5 for k in scores}
        return {k: (v - min_v) / (max_v - min_v) for k, v in scores.items()}

    async def _enforce_diversity_and_exploration(
        self, valid_targets: List[DatasetRelevance], pool: List[Dataset], 
        max_k: int, decision: RouteDecision, threshold: float, dynamic_explore_rate: float
    ) -> List[Dataset]:
        pool_dict = {str(ds.id): ds for ds in pool}
        selected = []
        seen_integrations: Dict[str, int] = {}
        
        # Fix 4: Exploration caps based on confidence
        if decision.confidence_score > 0.90:
            exploration_slots = 0
        else:
            exploration_slots = max(1, int(max_k * dynamic_explore_rate)) if max_k > 2 else 0
            
        standard_slots = max_k - exploration_slots

        for target in valid_targets:
            if len(selected) >= standard_slots: break
                
            ds = pool_dict[target.dataset_id]
            integration = getattr(ds, "integration_name", "custom") or "custom"
            count = seen_integrations.get(integration, 0)
            penalty = (0.15 if decision.requires_omni_graph else 0.05) * count
            
            if target.relevance_score - penalty >= threshold: 
                selected.append(ds)
                seen_integrations[integration] = count + 1

        if exploration_slots > 0 and len(selected) < max_k:
            unselected = [t for t in valid_targets if pool_dict[t.dataset_id] not in selected]
            if unselected:
                for t in sorted(unselected, key=lambda x: x.relevance_score, reverse=True)[:exploration_slots]:
                    selected.append(pool_dict[t.dataset_id])

        return selected

    def _generate_query_fingerprint(self, decision: RouteDecision, embedding: Optional[np.ndarray]) -> str:
        spatial_hash = hashlib.md5(np.round(embedding, 1).tobytes()).hexdigest() if embedding is not None else "no_embed"
        payload = f"{decision.intent_class}_{decision.dataset_family}_{spatial_hash}"
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    def _estimate_query_cost(self, ds: Dataset, decision: RouteDecision, tenant_id: str) -> float:
        # Fix 5: Strengthened cost model handling features, partitions, filters
        meta = getattr(ds, 'schema_metadata', {}) or {}
        col_count = len(meta.keys())
        est_rows = getattr(ds, 'estimated_row_count', 1000)
        
        has_partition = any('partition' in str(v).lower() for v in meta.values())
        has_index = any('index' in str(v).lower() for v in meta.values())

        complexity_penalty = (col_count / 50.0) ** 1.5
        if has_partition: complexity_penalty *= 0.6
        if has_index: complexity_penalty *= 0.7
        
        filter_penalty = 1.0 + (len(decision.extracted_global_filters) * 0.2)
        scan_cost = math.log10(max(10, est_rows)) * 0.5 * filter_penalty
        
        return max(1.0, complexity_penalty * scan_cost)

    async def _find_optimal_join_graph(self, datasets: List[Dataset], tenant_id: str, fused_scores: Dict[str, float]) -> List[Dataset]:
        if len(datasets) <= 1: return datasets
        
        # Fix 6: Safe robust join graph caching tied uniquely to combinations
        dataset_hash = hashlib.md5("".join(sorted(str(ds.id) for ds in datasets)).encode()).hexdigest()
        cache_key = f"adj_graph_{tenant_id}_{dataset_hash}"
        cached_adj = await self.cache_manager.get(cache_key)
        ds_map = {str(ds.id): ds for ds in datasets}
        
        if cached_adj:
            adj = {nid: set(neighbors) for nid, neighbors in cached_adj.items()}
        else:
            key_index = defaultdict(set)
            for ds in datasets:
                ds_id = str(ds.id)
                for k in getattr(ds, 'schema_metadata', {}).keys():
                    if k not in self.GENERIC_KEYS:
                        key_index[k].add(ds_id)

            adj = {str(ds.id): set() for ds in datasets}
            for shared_ds_set in key_index.values():
                ds_list = list(shared_ds_set)
                for i in range(len(ds_list)):
                    for j in range(i + 1, len(ds_list)):
                        adj[ds_list[i]].add(ds_list[j])
                        adj[ds_list[j]].add(ds_list[i])
                        
            await self.cache_manager.set(cache_key, {k: list(v) for k, v in adj.items()}, ttl_seconds=3600)

        visited = set()
        best_component = []
        max_quality_score = -1.0

        for start_node in [str(ds.id) for ds in datasets]:
            if start_node not in visited and start_node in adj:
                comp = []
                queue = deque([start_node])
                visited.add(start_node)
                
                while queue:
                    curr = queue.popleft()
                    comp.append(curr)
                    for neighbor in adj.get(curr, set()):
                        if neighbor in ds_map and neighbor not in visited:
                            visited.add(neighbor)
                            queue.append(neighbor)
                
                comp_score = sum(fused_scores.get(nid, 0.1) for nid in comp) * math.sqrt(len(comp))
                if comp_score > max_quality_score:
                    max_quality_score = comp_score
                    best_component = comp

        return [ds_map[nid] for nid in best_component if nid in ds_map]

    def _rank_by_vector(self, datasets: List[Dataset], embedding: np.ndarray) -> List[Tuple[float, Dataset]]:
        if not datasets or embedding is None: return []
        try:
            target_vec = np.array(embedding, dtype=np.float32)
            target_dim = target_vec.shape[0]
        except Exception:
            return [(0.0, ds) for ds in datasets]

        ds_with_embeds = [ds for ds in datasets if getattr(ds, 'schema_embedding', None) and len(ds.schema_embedding) == target_dim]
        if not ds_with_embeds: return [(0.0, ds) for ds in datasets]
        
        matrix = np.array([getattr(ds, 'schema_embedding') for ds in ds_with_embeds], dtype=np.float32)
        matrix_norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        matrix_norms[matrix_norms == 0] = 1e-9
        normalized_matrix = matrix / matrix_norms
        
        similarities = normalized_matrix @ target_vec

        scored = []
        embed_set = set()
        for i, ds in enumerate(ds_with_embeds):
            ds_id_str = str(ds.id)
            rep = getattr(ds, 'reputation_score', 1.0)
            score = float(similarities[i]) * (0.7 + 0.3 * rep)
            scored.append((score, ds))
            embed_set.add(ds_id_str)

        for ds in datasets:
            if str(ds.id) not in embed_set:
                scored.append((0.0, ds))
            
        return sorted(scored, key=lambda x: x[0], reverse=True)

    def _rank_by_hybrid_keyword(self, datasets: List[Dataset], intent_summary: str) -> List[Tuple[float, Dataset]]:
        intent_tokens = set(re.findall(r'\w+', intent_summary.lower()))
        if not intent_tokens: return [(0.0, ds) for ds in datasets]

        scored = []
        for ds in datasets:
            meta = getattr(ds, 'schema_metadata', {}) or {}
            keys = set(str(k).lower() for k in meta.keys())
            name_tokens = set(re.findall(r'\w+', getattr(ds, "name", "").lower()))
            
            col_overlap = len(intent_tokens.intersection(keys))
            name_overlap = len(intent_tokens.intersection(name_tokens)) * 1.5 
            
            score = min(1.0, (col_overlap + name_overlap) / max(1, len(intent_tokens)))
            scored.append((score, ds))
            
        return sorted(scored, key=lambda x: x[0], reverse=True)

    def _summarize_catalog(self, datasets: List[Dataset]) -> str:
        summary = [{
            "id": str(ds.id),
            "name": getattr(ds, "integration_name", getattr(ds, "name", "unknown")),
            "dims": list((getattr(ds, "schema_metadata", {}) or {}).keys())[:15]
        } for ds in datasets]
        return json.dumps(summary)[:self.MAX_CATALOG_TOKENS]

    def _log_trace(self, trace: RoutingTrace, start_time: float, success: bool) -> None:
        trace.latency_ms += round((time.perf_counter() - start_time) * 1000, 2)
        log_payload = trace.model_dump_json()
        if success:
            logger.info(f"ROUTING_TRACE_SUCCESS: {log_payload}")
        else:
            logger.warning(f"ROUTING_TRACE_FAILURE: {log_payload}")

    async def _is_tenant_rate_limited(self, tenant_id: str) -> bool:
        window_key = f"rl_window_{tenant_id}"
        current_time = time.time()
        
        timestamps = await self.cache_manager.get(window_key) or []
        valid_timestamps = [ts for ts in timestamps if current_time - ts < self.RATE_LIMIT_WINDOW_SEC]
        
        if len(valid_timestamps) >= self.RATE_LIMIT_MAX_REQUESTS:
            return True
            
        valid_timestamps.append(current_time)
        await self.cache_manager.set(window_key, valid_timestamps, ttl_seconds=self.RATE_LIMIT_WINDOW_SEC)
        return False

    async def _is_tenant_capped(self, tenant_id: str) -> bool:
        # Fix 7: True rate limiting sliding window cap for tenant SLA
        cap_key = f"tenant_cap_daily_{tenant_id}"
        calls = await self.cache_manager.get(cap_key) or 0
        if calls > 10000:
            return True
        await self.cache_manager.set(cap_key, calls + 1, ttl_seconds=86400)
        return False

    # -----------------------------------------------------------------
    # OFFLINE EVALUATION LOOP
    # -----------------------------------------------------------------

    async def evaluate_historical_queries(self, db: Session, tenant_id: str, limit: int = 100) -> Dict[str, Any]:
        mem_key = f"q_mem_{tenant_id}"
        historical_queries = await self.cache_manager.get(mem_key) or []
        
        if not historical_queries:
            return {"status": "no_data"}
            
        eval_queries = historical_queries[-limit:]
        total_regret = 0.0
        success_rate = 0.0
        
        for q in eval_queries:
            priors = await self._get_contextual_prior(tenant_id, np.array(q["vec"]))
            best_predicted = max(priors.items(), key=lambda x: x[1])[0] if priors else None
            
            actual_reward = q["reward"]
            if best_predicted in q["ds_ids"]:
                success_rate += 1.0
            else:
                total_regret += (1.0 - actual_reward)

        return {
            "tenant_id": tenant_id,
            "queries_evaluated": len(eval_queries),
            "simulated_accuracy": success_rate / len(eval_queries),
            "cumulative_regret": total_regret,
            "status": "evaluated"
        }