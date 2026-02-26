import json
from typing import List, Dict, Any
import openai

class CFONarrativeService:
    """
    A stateless service responsible for generating executive summaries
    from raw analytical data.
    """
    def __init__(self, api_key: str):
        # Injecting the dependency cleanly
        self.client = openai.AsyncOpenAI(api_key=api_key)
        self.model = "gpt-4o-mini" # Fast, cheap, and perfectly capable for summarization

    async def generate_summary(self, user_question: str, data_rows: List[Dict[str, Any]]) -> str:
        """
        Takes the user's original question and the DuckDB result rows, 
        returning a highly structured, 3-sentence executive summary.
        """
        # We truncate the data rows if they are too massive to save tokens
        # A CFO doesn't need 10,000 rows to spot the trend, the top 50 is enough for a summary
        safe_data = data_rows[:50] 
        
        system_prompt = (
            "You are a fractional CFO for a modern data business. "
            "You are provided with a user's question and the raw data output from their database. "
            "Your rules are absolute: "
            "1. You must answer in exactly three sentences. "
            "2. Sentence 1 & 2: Summarize the primary mathematical insight or trend. "
            "3. Sentence 3: Provide exactly one actionable business recommendation based on this data. "
            "4. Do not use markdown, bolding, or pleasantries."
        )

        user_prompt = f"Question: {user_question}\n\nData: {json.dumps(safe_data)}"

        try:
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.2, # Low temperature for deterministic, analytical tone
                max_tokens=150
            )
            
            return response.choices[0].message.content.strip()
            
        except Exception as e:
            # Failsafe: If the LLM fails, we don't break the app, we return a graceful fallback.
            return "Narrative engine is currently unavailable. Please review the chart above for data insights."