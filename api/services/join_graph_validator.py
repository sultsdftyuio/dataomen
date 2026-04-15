import logging
from enum import Enum
from typing import Dict, List, Set, Optional, Any, Tuple
from collections import defaultdict, deque
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class Cardinality(str, Enum):
    ONE_TO_ONE = "1:1"
    ONE_TO_MANY = "1:N"
    MANY_TO_ONE = "N:1"
    MANY_TO_MANY = "M:N"
    UNKNOWN = "UNKNOWN"

    @classmethod
    def inverse(cls, cardinality: "Cardinality") -> "Cardinality":
        inverses = {
            cls.ONE_TO_ONE: cls.ONE_TO_ONE,
            cls.ONE_TO_MANY: cls.MANY_TO_ONE,
            cls.MANY_TO_ONE: cls.ONE_TO_MANY,
            cls.MANY_TO_MANY: cls.MANY_TO_MANY,
            cls.UNKNOWN: cls.UNKNOWN,
        }
        return inverses[cardinality]


class JoinEdge(BaseModel):
    source_table: str
    source_column: str
    target_table: str
    target_column: str
    cardinality: Cardinality
    
    def __hash__(self):
        return hash((self.source_table, self.source_column, self.target_table, self.target_column))


class ValidationResult(BaseModel):
    is_valid: bool
    is_cartesian: bool = False
    has_fan_out: bool = False
    has_chasm_trap: bool = False
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    safe_join_path: List[JoinEdge] = Field(default_factory=list)


class JoinGraphValidator:
    """
    Phase 6+: Deterministic Join Graph Validator & Orchestrator.
    
    Operates as an absolute guardrail against LLM SQL hallucinations.
    Uses directed graph traversal to enforce referential integrity and 
    mathematical safety before compute execution.
    """

    def __init__(self):
        # Adjacency list: node -> list of directed edges
        self.adj_list: Dict[str, List[JoinEdge]] = defaultdict(list)
        self.edges: Dict[Tuple[str, str], JoinEdge] = {}
        self.nodes: Set[str] = set()

    def load_from_schema_metadata(self, tables_metadata: Dict[str, Any]) -> None:
        """
        Hydrates the graph dynamically from the upgraded DatasetService schema.
        Expects a dictionary of table definitions mapping to their columns and foreign keys.
        """
        self.adj_list.clear()
        self.edges.clear()
        self.nodes.clear()

        for table_name, meta in tables_metadata.items():
            self.nodes.add(table_name)

            if not isinstance(meta, dict):
                continue

            fk_relations: List[Dict[str, Any]] = []

            raw_fk_relations = meta.get("foreign_keys", [])
            if isinstance(raw_fk_relations, list):
                fk_relations.extend([
                    fk for fk in raw_fk_relations if isinstance(fk, dict)
                ])

            # Backward compatibility: derive FKs from per-column metadata if top-level
            # foreign_keys is absent in older schema blobs.
            columns_meta = meta.get("columns", {})
            if isinstance(columns_meta, dict):
                for col_name, col_meta in columns_meta.items():
                    if not isinstance(col_meta, dict):
                        continue

                    col_fk_relations = col_meta.get("foreign_keys", [])
                    if isinstance(col_fk_relations, list) and col_fk_relations:
                        for fk in col_fk_relations:
                            if not isinstance(fk, dict):
                                continue
                            fk_relations.append({
                                "column": fk.get("column", col_name),
                                "target_table": fk.get("target_table"),
                                "target_column": fk.get("target_column", "id"),
                                "is_unique": fk.get("is_unique", False),
                            })
                    elif col_meta.get("foreign_key_candidate"):
                        inferred_target = str(col_name)
                        if inferred_target.lower().endswith("_id"):
                            inferred_target = inferred_target[:-3]
                        fk_relations.append({
                            "column": col_name,
                            "target_table": col_meta.get("foreign_key_target_table") or inferred_target,
                            "target_column": col_meta.get("foreign_key_target_column", "id"),
                            "is_unique": False,
                        })

            for fk in fk_relations:
                source_col = fk.get("column")
                target_table = fk.get("target_table")
                target_col = fk.get("target_column", "id")

                if not source_col or not target_table:
                    continue

                # Infer cardinality based on PK/FK metadata
                card = Cardinality.ONE_TO_MANY if not fk.get("is_unique") else Cardinality.ONE_TO_ONE
                self.add_relationship(
                    source_table=table_name,
                    source_col=source_col,
                    target_table=target_table,
                    target_col=target_col,
                    cardinality=card
                )

    def add_relationship(
        self, 
        source_table: str, 
        source_col: str, 
        target_table: str, 
        target_col: str, 
        cardinality: Cardinality
    ) -> None:
        """Adds bi-directional edges with inverted cardinalities for traversal."""
        self.nodes.update([source_table, target_table])
        
        # Forward edge
        self.adj_list[source_table].append(JoinEdge(
            source_table=source_table,
            source_column=source_col,
            target_table=target_table,
            target_column=target_col,
            cardinality=cardinality
        ))
        self.edges[(source_table, target_table)] = self.adj_list[source_table][-1]
        
        # Backward edge (Inverted)
        self.adj_list[target_table].append(JoinEdge(
            source_table=target_table,
            source_column=target_col,
            target_table=source_table,
            target_column=source_col,
            cardinality=Cardinality.inverse(cardinality)
        ))
        self.edges[(target_table, source_table)] = self.adj_list[target_table][-1]

    def detect_cycles(self) -> List[List[str]]:
        """Detects directed cycles in the join graph for governance diagnostics."""
        visited: Set[str] = set()
        in_stack: Set[str] = set()
        path: List[str] = []
        cycles: List[List[str]] = []

        def dfs(node: str) -> None:
            visited.add(node)
            in_stack.add(node)
            path.append(node)

            for edge in self.adj_list.get(node, []):
                nxt = edge.target_table
                if nxt not in visited:
                    dfs(nxt)
                elif nxt in in_stack:
                    try:
                        idx = path.index(nxt)
                        cycles.append(path[idx:] + [nxt])
                    except ValueError:
                        continue

            path.pop()
            in_stack.remove(node)

        for node in self.nodes:
            if node not in visited:
                dfs(node)

        # Deduplicate canonicalized cycles
        deduped: Dict[Tuple[str, ...], List[str]] = {}
        for cyc in cycles:
            if not cyc:
                continue
            core = cyc[:-1] if len(cyc) > 1 and cyc[0] == cyc[-1] else cyc
            if not core:
                continue
            min_idx = min(range(len(core)), key=lambda i: core[i])
            rotated = core[min_idx:] + core[:min_idx]
            key = tuple(rotated)
            if key not in deduped:
                deduped[key] = rotated + [rotated[0]]

        return list(deduped.values())

    def _estimate_path_cost(self, path: List[JoinEdge]) -> float:
        """Estimates join risk/cost using cardinality-sensitive edge weights."""
        weights = {
            Cardinality.ONE_TO_ONE: 1.0,
            Cardinality.MANY_TO_ONE: 1.3,
            Cardinality.ONE_TO_MANY: 1.8,
            Cardinality.MANY_TO_MANY: 2.6,
            Cardinality.UNKNOWN: 2.0,
        }
        return sum(weights.get(edge.cardinality, 2.0) for edge in path)

    def _find_shortest_path(self, start_table: str, end_table: str) -> Optional[List[JoinEdge]]:
        """Finds the optimal path between two tables using unweighted BFS."""
        if start_table not in self.nodes or end_table not in self.nodes:
            return None
            
        queue = deque([(start_table, [])])
        visited = {start_table}
        
        while queue:
            current_node, path = queue.popleft()
            
            if current_node == end_table:
                return path
                
            for edge in self.adj_list[current_node]:
                if edge.target_table not in visited:
                    visited.add(edge.target_table)
                    # We create a new list for the path to avoid mutation issues
                    queue.append((edge.target_table, path + [edge]))
                    
        return None

    def _analyze_path_hazards(self, path: List[JoinEdge]) -> Tuple[bool, bool, List[str]]:
        """
        Deep semantic analysis of the join sequence.
        Detects Fan-outs (1:N -> 1:N) and Chasm Traps (N:1 -> 1:N).
        """
        has_fan_out = False
        has_chasm_trap = False
        warnings = []
        
        rels = [edge.cardinality for edge in path]
        
        for i in range(len(rels) - 1):
            curr_rel = rels[i]
            next_rel = rels[i+1]
            
            # Fan-out: Cascading One-to-Many relationships without aggregation boundary
            if curr_rel in [Cardinality.ONE_TO_MANY, Cardinality.MANY_TO_MANY] and \
               next_rel in [Cardinality.ONE_TO_MANY, Cardinality.MANY_TO_MANY]:
                has_fan_out = True
                warnings.append(
                    f"Fan-out hazard at step {i+1} ({path[i].target_table}). "
                    "Requires intermediate aggregation (CTE) to prevent row multiplication."
                )
                
            # Chasm Trap: Joining two distinct fact tables through a shared dimension
            if curr_rel in [Cardinality.MANY_TO_ONE, Cardinality.MANY_TO_MANY] and \
               next_rel in [Cardinality.ONE_TO_MANY, Cardinality.MANY_TO_MANY]:
                has_chasm_trap = True
                warnings.append(
                    f"Chasm trap at step {i+1} ({path[i].target_table}). "
                    "You are joining two fact tables via a shared dimension. "
                    "Measures must be aggregated before the join."
                )
                
        return has_fan_out, has_chasm_trap, warnings

    def validate_query_intent(self, requested_tables: List[str]) -> ValidationResult:
        """
        The Core Engine: Deterministically validates if an LLM's requested tables 
        can be safely queried together, and generates the exact path it MUST use.
        """
        result = ValidationResult(is_valid=True)
        
        if not requested_tables:
            result.errors.append("No tables provided for validation.")
            result.is_valid = False
            return result
            
        if len(requested_tables) == 1:
            if requested_tables[0] not in self.nodes:
                result.errors.append(f"Table '{requested_tables[0]}' is unknown to the schema graph.")
                result.is_valid = False
            return result

        # Ensure all tables exist in graph
        unknown_tables = [t for t in requested_tables if t not in self.nodes]
        if unknown_tables:
            result.errors.append(f"Unknown tables in query: {unknown_tables}")
            result.is_valid = False
            return result

        cycles = self.detect_cycles()
        if cycles:
            result.warnings.append(
                f"Join graph contains {len(cycles)} cycle(s); cost-aware path selection enabled."
            )

        # Build a minimal spanning-style join tree independent of requested order.
        anchor_table = min(requested_tables, key=lambda t: len(self.adj_list[t]))
        full_safe_path: List[JoinEdge] = []
        covered_tables: Set[str] = {anchor_table}
        remaining_tables: Set[str] = set(requested_tables) - covered_tables

        while remaining_tables:
            best_target: Optional[str] = None
            best_path: Optional[List[JoinEdge]] = None
            best_cost: Optional[float] = None

            for source in list(covered_tables):
                for target in list(remaining_tables):
                    path = self._find_shortest_path(source, target)
                    if not path:
                        continue

                    path_cost = self._estimate_path_cost(path)
                    if (
                        best_path is None
                        or len(path) < len(best_path)
                        or (len(path) == len(best_path) and (best_cost is None or path_cost < best_cost))
                    ):
                        best_path = path
                        best_target = target
                        best_cost = path_cost

            if not best_path or not best_target:
                disconnected = sorted(remaining_tables)
                result.is_cartesian = True
                result.is_valid = False
                result.errors.append(
                    "Cartesian Product Risk: No valid join path exists for all requested tables. "
                    f"Disconnected nodes from anchor '{anchor_table}': {disconnected}."
                )
                return result

            # Append unique edges to the master path
            for edge in best_path:
                if edge not in full_safe_path:
                    full_safe_path.append(edge)
                covered_tables.add(edge.source_table)
                covered_tables.add(edge.target_table)

            remaining_tables = set(requested_tables) - covered_tables

        # Analyze the constructed spanning tree for analytical traps
        fan_out, chasm, warnings = self._analyze_path_hazards(full_safe_path)
        
        result.safe_join_path = full_safe_path
        result.has_fan_out = fan_out
        result.has_chasm_trap = chasm
        result.warnings.extend(warnings)
        
        # We don't fail the validation on Fan-outs/Chasms, but we flag them 
        # so the NL2SQL generator knows it MUST generate CTEs/Aggregations.
        if fan_out or chasm:
            logger.warning(f"Complex analytical traps detected in requested join path. Graph Warnings: {warnings}")

        return result

# Global singleton
join_graph_validator = JoinGraphValidator()