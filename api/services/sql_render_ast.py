from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, List, Optional, Union


# ---------------------------------------------------------------------------
# SQL AST NODES
# ---------------------------------------------------------------------------


@dataclass
class SqlIdentifier:
    name: str


@dataclass
class SqlLiteral:
    value: Any


@dataclass
class SqlColumn:
    column: str
    relation: Optional[str] = None


@dataclass
class SqlFunctionCall:
    name: str
    args: List["SqlExpression"]
    distinct: bool = False


@dataclass
class SqlBinaryOp:
    left: "SqlExpression"
    operator: str
    right: "SqlExpression"


@dataclass
class SqlStar:
    relation: Optional[str] = None
    exclude: List[str] = field(default_factory=list)


SqlExpression = Union[SqlIdentifier, SqlLiteral, SqlColumn, SqlFunctionCall, SqlBinaryOp, SqlStar]


@dataclass
class SqlSelectItem:
    expression: SqlExpression
    alias: Optional[str] = None


@dataclass
class SqlTableRef:
    table_name: str
    alias: Optional[str] = None


@dataclass
class SqlFunctionTableRef:
    function_name: str
    args: List[SqlExpression]
    alias: Optional[str] = None


SqlFromRef = Union[SqlTableRef, SqlFunctionTableRef]


@dataclass
class SqlJoinClause:
    join_type: str
    right: SqlFromRef
    on: SqlExpression


@dataclass
class SqlOrderKey:
    expression: SqlExpression
    direction: str = "ASC"


@dataclass
class SqlSelectStmt:
    select_items: List[SqlSelectItem]
    from_ref: SqlFromRef
    joins: List[SqlJoinClause] = field(default_factory=list)
    where: Optional[SqlExpression] = None
    group_by: List[SqlExpression] = field(default_factory=list)
    order_by: List[SqlOrderKey] = field(default_factory=list)
    limit: Optional[int] = None


@dataclass
class SqlCte:
    name: str
    statement: SqlSelectStmt


@dataclass
class SqlQuery:
    ctes: List[SqlCte]
    final_select: SqlSelectStmt


# ---------------------------------------------------------------------------
# SQL RENDERER
# ---------------------------------------------------------------------------


class DuckDBSqlAstRenderer:
    """Single rendering boundary from typed SQL AST to SQL text."""

    def render_query(self, query: SqlQuery) -> str:
        if not query.ctes:
            return self.render_select(query.final_select)

        cte_sql = []
        for cte in query.ctes:
            cte_sql.append(f"{cte.name} AS (\n{self.render_select(cte.statement)}\n)")

        return f"WITH {',\n\n'.join(cte_sql)}\n{self.render_select(query.final_select)}"

    def render_select(self, stmt: SqlSelectStmt) -> str:
        select_clause = ", ".join(self.render_select_item(item) for item in stmt.select_items)
        sql = f"SELECT {select_clause}\nFROM {self.render_from_ref(stmt.from_ref)}"

        if stmt.joins:
            join_sql = []
            for join in stmt.joins:
                join_sql.append(
                    f"{join.join_type} JOIN {self.render_from_ref(join.right)} ON {self.render_expression(join.on)}"
                )
            sql += "\n" + "\n".join(join_sql)

        if stmt.where is not None:
            sql += f"\nWHERE {self.render_expression(stmt.where)}"

        if stmt.group_by:
            sql += "\nGROUP BY " + ", ".join(self.render_expression(expr) for expr in stmt.group_by)

        if stmt.order_by:
            sql += "\nORDER BY " + ", ".join(
                f"{self.render_expression(order.expression)} {order.direction}"
                for order in stmt.order_by
            )

        if stmt.limit is not None:
            sql += f"\nLIMIT {int(stmt.limit)}"

        return sql

    def render_select_item(self, item: SqlSelectItem) -> str:
        rendered = self.render_expression(item.expression)
        if item.alias:
            return f"{rendered} AS {item.alias}"
        return rendered

    def render_from_ref(self, from_ref: SqlFromRef) -> str:
        if isinstance(from_ref, SqlTableRef):
            if from_ref.alias:
                return f"{from_ref.table_name} AS {from_ref.alias}"
            return from_ref.table_name

        args_sql = ", ".join(self.render_expression(arg) for arg in from_ref.args)
        rendered = f"{from_ref.function_name}({args_sql})"
        if from_ref.alias:
            return f"{rendered} AS {from_ref.alias}"
        return rendered

    def render_expression(self, expr: SqlExpression) -> str:
        if isinstance(expr, SqlIdentifier):
            return expr.name
        if isinstance(expr, SqlLiteral):
            return self._render_literal(expr.value)
        if isinstance(expr, SqlColumn):
            if expr.relation:
                return f"{expr.relation}.{expr.column}"
            return expr.column
        if isinstance(expr, SqlFunctionCall):
            args_sql = ", ".join(self.render_expression(arg) for arg in expr.args)
            if expr.distinct:
                return f"{expr.name}(DISTINCT {args_sql})"
            return f"{expr.name}({args_sql})"
        if isinstance(expr, SqlBinaryOp):
            return f"{self.render_expression(expr.left)} {expr.operator} {self.render_expression(expr.right)}"
        if isinstance(expr, SqlStar):
            base = f"{expr.relation}.*" if expr.relation else "*"
            if expr.exclude:
                return f"{base} EXCLUDE ({', '.join(expr.exclude)})"
            return base

        raise TypeError(f"Unsupported SQL expression type: {type(expr).__name__}")

    def _render_literal(self, value: Any) -> str:
        if value is None:
            return "NULL"
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, list):
            inner = ", ".join(self._render_literal(v) for v in value)
            return f"({inner})"
        safe_text = str(value).replace("'", "''")
        return f"'{safe_text}'"
