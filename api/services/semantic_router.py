# api/services/semantic_router.py
import json
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from openai import OpenAI # Or whatever fast embedding provider you prefer

class SemanticRouter:
    """
    Handles lightweight RAG by embedding user queries and fetching only the 
    most mathematically relevant columns from the dataset schema.
    """
    def __init__(self, db_session: Session, api_key: str):
        self.db = db_session
        self.client = OpenAI(api_key=api_key)
        self.embedding_model = "text-embedding-3-small"

    def _get_embedding(self, text_to_embed: str) -> List[float]:
        """Pure function to fetch vector embeddings."""
        response = self.client.embeddings.create(
            input=[text_to_embed],
            model=self.embedding_model
        )
        return response.data[0].embedding

    def index_dataset_schema(self, dataset_id: str, columns: List[Dict[str, str]]) -> None:
        """
        Takes the extracted schema from Phase 1 and indexes it into Postgres.
        columns format: [{"name": "revenue", "type": "FLOAT", "description": "..."}]
        """
        for col in columns:
            # Create a rich string to embed so the math catches synonyms (e.g., "sales" -> "revenue")
            embed_text = f"Column: {col['name']} | Type: {col['type']} | Context: {col.get('description', '')}"
            vector = self._get_embedding(embed_text)
            
            # Assuming you have a pgvector column named 'embedding' in your ColumnMetadata table
            sql = text("""
                INSERT INTO column_metadata (dataset_id, column_name, data_type, description, embedding)
                VALUES (:dataset_id, :column_name, :data_type, :description, :embedding)
                ON CONFLICT (dataset_id, column_name) 
                DO UPDATE SET embedding = :embedding
            """)
            self.db.execute(sql, {
                "dataset_id": dataset_id,
                "column_name": col["name"],
                "data_type": col["type"],
                "description": col.get("description", ""),
                "embedding": json.dumps(vector) # pgvector accepts JSON array strings
            })
        self.db.commit()

    def retrieve_relevant_schema(self, dataset_id: str, user_query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        """
        Embeds the user's question and finds the closest matching columns.
        Uses pgvector's cosine distance operator (<=>).
        """
        query_vector = self._get_embedding(user_query)
        
        sql = text("""
            SELECT column_name, data_type, description
            FROM column_metadata
            WHERE dataset_id = :dataset_id
            ORDER BY embedding <=> :query_vector::vector
            LIMIT :top_k
        """)
        
        results = self.db.execute(sql, {
            "dataset_id": dataset_id,
            "query_vector": json.dumps(query_vector),
            "top_k": top_k
        }).fetchall()

        return [{"name": r[0], "type": r[1], "description": r[2]} for r in results]