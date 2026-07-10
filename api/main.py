import os
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict, Field


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    status: Literal["ok"] = Field(default="ok")
    service: str = Field(default="arcli-api")
    version: str | None = Field(default=None)


app = FastAPI(
    title="Arcli Prospect Intelligence API",
    version=os.getenv("ARCLI_API_VERSION", "0.1.0"),
)


@app.get("/health", response_model=HealthResponse, include_in_schema=False)
def health_check() -> HealthResponse:
    return HealthResponse(version=os.getenv("ARCLI_RELEASE_SHA"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", "8080")),
    )
