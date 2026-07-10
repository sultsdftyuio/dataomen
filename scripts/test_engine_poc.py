import logging
import os
import sys
from pathlib import Path
from typing import TypedDict

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from api.services.embeddings import EmbeddingService
from api.services.matching import PostEmbedding, find_candidate_matches
from api.services.verifier import (
    CandidatePost,
    ServiceProfile,
    VerificationResult,
    VerifierService,
)

logger = logging.getLogger("arcli.engine_poc")


class MockRedditPost(TypedDict):
    post_id: str
    subreddit: str
    text: str


MOCK_SERVICE_PROFILE = ServiceProfile(
    company_name="ChurnPilot",
    one_liner="AI churn intelligence for B2B SaaS founders and growth teams.",
    target_audience=[
        "B2B SaaS founders",
        "customer success leaders",
        "product-led growth teams",
    ],
    core_problem_solved=(
        "Identifies customer churn risk signals and recommends retention actions "
        "before accounts cancel."
    ),
    key_value_propositions=[
        "Detects churn risk from product usage, support, billing, and account signals.",
        "Prioritizes at-risk accounts by revenue impact and urgency.",
        "Turns churn patterns into retention playbooks for founders and CS teams.",
    ],
    ideal_customer_pain_points=[
        "Users are cancelling or going inactive without obvious warning.",
        "The team cannot explain why monthly churn is rising.",
        "Customer success is reacting after the cancellation instead of before it.",
    ],
    negative_keywords=[
        "tutorial",
        "course",
        "job posting",
        "affiliate",
        "crypto",
        "consumer mobile app",
    ],
)


MOCK_REDDIT_POSTS: list[MockRedditPost] = [
    {
        "post_id": "reddit-001",
        "subreddit": "SaaS",
        "text": (
            "I'm losing around 10% of my B2B SaaS users every month and I cannot "
            "tell which accounts are about to cancel until the Stripe email hits. "
            "How do I spot churn risk earlier?"
        ),
    },
    {
        "post_id": "reddit-002",
        "subreddit": "startups",
        "text": (
            "Our customer success team is drowning. Expansion revenue is fine, but "
            "we keep finding out about unhappy accounts only after they churn. Has "
            "anyone used tooling that flags risky accounts before renewal?"
        ),
    },
    {
        "post_id": "reddit-003",
        "subreddit": "SaaS",
        "text": "How to build a SaaS landing page in 30 days with no-code tools?",
    },
    {
        "post_id": "reddit-004",
        "subreddit": "learnpython",
        "text": "I wrote a tutorial on FastAPI dependency injection for beginners.",
    },
    {
        "post_id": "reddit-005",
        "subreddit": "Entrepreneur",
        "text": "What are your favorite books about pricing psychology?",
    },
    {
        "post_id": "reddit-006",
        "subreddit": "SaaS",
        "text": "LIMITED OFFER: buy 5,000 verified SaaS founder emails for $49 today only.",
    },
    {
        "post_id": "reddit-007",
        "subreddit": "forhire",
        "text": "Hiring remote SDRs for a B2B SaaS agency. Commission only. DM portfolio.",
    },
    {
        "post_id": "reddit-008",
        "subreddit": "CustomerSuccess",
        "text": (
            "We have decent onboarding analytics, but I still struggle to separate "
            "normal low activity from accounts that are actually likely to cancel."
        ),
    },
]


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def service_profile_to_embedding_text(profile: ServiceProfile) -> str:
    return "\n".join(
        [
            f"Company: {profile.company_name}",
            f"One-liner: {profile.one_liner}",
            f"Audience: {', '.join(profile.target_audience)}",
            f"Problem solved: {profile.core_problem_solved}",
            f"Value propositions: {', '.join(profile.key_value_propositions)}",
            f"Ideal pains: {', '.join(profile.ideal_customer_pain_points)}",
            f"Bad-fit terms: {', '.join(profile.negative_keywords)}",
        ]
    )


def build_post_embeddings(
    embedding_service: EmbeddingService,
    posts: list[MockRedditPost],
) -> list[PostEmbedding]:
    post_embeddings: list[PostEmbedding] = []
    for post in posts:
        embedding_response = embedding_service.embed_text(post["text"])
        post_embeddings.append(
            PostEmbedding(
                post_id=post["post_id"],
                text=post["text"],
                embedding=embedding_response.embedding,
                source="reddit",
                metadata={"subreddit": post["subreddit"]},
            )
        )
    return post_embeddings


def verify_candidates(
    verifier_service: VerifierService,
    profile: ServiceProfile,
    candidates: list[CandidatePost],
) -> list[tuple[CandidatePost, VerificationResult]]:
    results: list[tuple[CandidatePost, VerificationResult]] = []
    for candidate in candidates:
        results.append((candidate, verifier_service.verify(candidate, profile)))
    return results


def log_report(
    profile: ServiceProfile,
    total_posts: int,
    verified_results: list[tuple[CandidatePost, VerificationResult]],
) -> None:
    strong_matches = [
        (candidate, result)
        for candidate, result in verified_results
        if result.decision_label == "strong_match" and result.match
    ]

    logger.info("========== Arcli Engine POC Report ==========")
    logger.info(
        "profile=%s total_posts=%s verified_candidates=%s strong_matches=%s",
        profile.company_name,
        total_posts,
        len(verified_results),
        len(strong_matches),
    )

    for candidate, result in verified_results:
        logger.info(
            "decision post_id=%s label=%s match=%s confidence=%.2f similarity=%.3f",
            candidate.post_id,
            result.decision_label,
            result.match,
            result.confidence,
            candidate.similarity_score,
        )

    logger.info("---------- Strong Matches ----------")
    if not strong_matches:
        logger.info("No strong matches survived the verifier.")
        return

    for candidate, result in strong_matches:
        logger.info(
            "STRONG_MATCH post_id=%s subreddit=%s confidence=%.2f similarity=%.3f",
            candidate.post_id,
            candidate.metadata.get("subreddit", "unknown"),
            result.confidence,
            candidate.similarity_score,
        )
        logger.info("pain_detected=%s", result.pain_detected)
        logger.info("why_this_matches=%s", result.why_this_matches)
        logger.info("post_text=%s", candidate.text)


def main() -> None:
    configure_logging()
    if not os.getenv("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is required to run the engine POC.")

    embedding_service = EmbeddingService()
    verifier_service = VerifierService()

    logger.info("engine_poc_started posts=%s", len(MOCK_REDDIT_POSTS))
    profile_embedding = embedding_service.embed_text(
        service_profile_to_embedding_text(MOCK_SERVICE_PROFILE)
    )
    post_embeddings = build_post_embeddings(embedding_service, MOCK_REDDIT_POSTS)

    candidate_matches = find_candidate_matches(
        profile_embedding.embedding,
        post_embeddings,
        threshold=0.4,
    )
    candidates = [
        CandidatePost(
            post_id=match.post_id,
            source=match.source,
            text=match.text,
            similarity_score=match.score,
            url=match.url,
            metadata=match.metadata,
        )
        for match in candidate_matches
    ]

    verified_results = verify_candidates(
        verifier_service,
        MOCK_SERVICE_PROFILE,
        candidates,
    )
    log_report(MOCK_SERVICE_PROFILE, len(MOCK_REDDIT_POSTS), verified_results)
    logger.info("engine_poc_completed")


if __name__ == "__main__":
    main()
