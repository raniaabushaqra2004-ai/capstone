from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, List


SYMPTOM_SYNONYMS: dict[str, tuple[str, ...]] = {
    "palpitations": ("خفقان", "نبض", "تسارع"),
    "heartbeat": ("نبض", "خفقان"),
    "chest": ("صدر", "ضغط صدر"),
    "pressure": ("ضغط", "ثقل"),
    "breathing": ("ضيق تنفس", "كتمه"),
    "shortness": ("ضيق",),
    "abdomen": ("بطن",),
    "stomach": ("معده", "فم المعده"),
    "bloating": ("انتفاخ", "غازات"),
    "nausea": ("غثيان",),
    "vomiting": ("قيء", "استفراغ"),
    "reflux": ("ارتجاع", "حموضه"),
    "heartburn": ("حرقه", "حموضه"),
    "headache": ("صداع",),
    "migraine": ("شقيقه", "صداع نصفي"),
    "dizziness": ("دوخه", "دوار"),
    "blurred": ("زغلله", "تشوش"),
    "vision": ("رؤيه", "عين"),
    "numbness": ("تنميل", "خدر"),
    "weakness": ("ضعف",),
    "shoulder": ("كتف",),
    "knee": ("ركبه",),
    "back": ("ظهر",),
    "neck": ("رقبه", "رقبة"),
    "joint": ("مفصل",),
    "rash": ("طفح", "احمرار"),
    "itching": ("حكه", "هرش"),
    "eczema": ("اكزيما", "جفاف", "قشور"),
    "fungal": ("فطريات", "تقشر"),
    "fatigue": ("تعب", "ارهاق"),
    "urination": ("تبول", "بول"),
    "fever": ("حراره", "حمى"),
}

STOPWORDS = {
    "في", "من", "على", "الى", "إلى", "مع", "او", "أو", "عن", "بعد", "قبل", "هذا", "هذه",
    "that", "with", "from", "into", "after", "before", "there", "have", "been", "does",
}


def normalize_arabic_text(text: str) -> str:
    text = str(text or "").strip().lower()
    replacements = {
        "أ": "ا",
        "إ": "ا",
        "آ": "ا",
        "ة": "ه",
        "ى": "ي",
        "ؤ": "و",
        "ئ": "ي",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[\u064B-\u065F]", "", text)
    text = re.sub(r"[^a-z\u0600-\u06FF0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def tokenize_arabic_text(text: str) -> List[str]:
    normalized = normalize_arabic_text(text)
    tokens = [token for token in normalized.split() if len(token) > 1 and token not in STOPWORDS]
    expanded: list[str] = []
    for token in tokens:
        expanded.append(token)
        expanded.extend(SYMPTOM_SYNONYMS.get(token, ()))
    return list(dict.fromkeys(expanded))


def generate_ngrams(text: str, min_n: int = 2, max_n: int = 3) -> set[str]:
    tokens = tokenize_arabic_text(text)
    grams: set[str] = set()
    for size in range(min_n, max_n + 1):
        for index in range(0, max(0, len(tokens) - size + 1)):
            grams.add(" ".join(tokens[index:index + size]))
    return grams


@dataclass(frozen=True)
class RAGEntry:
    entry_id: str
    specialty: str
    condition_ar: str
    condition_en: str
    summary_ar: str
    summary_en: str
    keywords: tuple[str, ...]
    support_keywords: tuple[str, ...] = ()
    exclude_keywords: tuple[str, ...] = ()
    source: str = "Local curated medical KB"
    min_score: float = 2.0

    @property
    def keyword_tokens(self) -> set[str]:
        tokens: set[str] = set()
        for keyword in self.keywords:
            tokens.update(tokenize_arabic_text(keyword))
        return tokens

    @property
    def support_keyword_tokens(self) -> set[str]:
        tokens: set[str] = set()
        for keyword in self.support_keywords:
            tokens.update(tokenize_arabic_text(keyword))
        return tokens

    @property
    def condition_tokens(self) -> set[str]:
        return set(tokenize_arabic_text(f"{self.condition_ar} {self.condition_en}"))

    @property
    def summary_tokens(self) -> set[str]:
        return set(tokenize_arabic_text(f"{self.summary_ar} {self.summary_en}"))

    @property
    def keyword_ngrams(self) -> set[str]:
        grams: set[str] = set()
        for keyword in self.keywords:
            grams.update(generate_ngrams(keyword))
        return grams

    @property
    def support_ngrams(self) -> set[str]:
        grams: set[str] = set()
        for keyword in self.support_keywords:
            grams.update(generate_ngrams(keyword))
        return grams


@dataclass(frozen=True)
class RetrievedCondition:
    entry: RAGEntry
    score: float
    matched_keywords: tuple[str, ...]
    matched_support_keywords: tuple[str, ...]

    def to_text(self, lang: str) -> str:
        if lang == "en":
            return f"{self.entry.condition_en}: {self.entry.summary_en}"
        return f"{self.entry.condition_ar}: {self.entry.summary_ar}"


@dataclass(frozen=True)
class RetrievalSummary:
    results: list[RetrievedCondition]
    confidence: str
    top_score: float
    score_gap: float
    used_query: str


class MedicalConditionRAG:
    def __init__(self, kb_path: Path) -> None:
        self.kb_path = Path(kb_path)
        self.entries = self._load_entries()

    def _load_entries(self) -> list[RAGEntry]:
        if not self.kb_path.exists():
            return []

        raw_entries: Iterable[dict[str, Any]] = json.loads(self.kb_path.read_text(encoding="utf-8"))
        loaded: list[RAGEntry] = []
        for item in raw_entries:
            loaded.append(
                RAGEntry(
                    entry_id=str(item["id"]),
                    specialty=str(item["specialty"]),
                    condition_ar=str(item["condition_ar"]),
                    condition_en=str(item["condition_en"]),
                    summary_ar=str(item["summary_ar"]),
                    summary_en=str(item["summary_en"]),
                    keywords=tuple(str(keyword) for keyword in item.get("keywords", [])),
                    support_keywords=tuple(str(keyword) for keyword in item.get("support_keywords", [])),
                    exclude_keywords=tuple(str(keyword) for keyword in item.get("exclude_keywords", [])),
                    source=str(item.get("source", "Local curated medical KB")),
                    min_score=float(item.get("min_score", 2.0)),
                )
            )
        return loaded

    def _score_terms(
        self,
        normalized_query: str,
        query_tokens: set[str],
        keywords: tuple[str, ...],
        phrase_weight: float,
        token_weight: float,
        partial_weight: float,
    ) -> tuple[float, tuple[str, ...]]:
        score = 0.0
        matched: list[str] = []

        for keyword in keywords:
            normalized_keyword = normalize_arabic_text(keyword)
            if not normalized_keyword:
                continue
            if " " in normalized_keyword:
                if normalized_keyword in normalized_query:
                    score += phrase_weight
                    matched.append(keyword)
            elif normalized_keyword in query_tokens:
                score += token_weight
                matched.append(keyword)
            elif normalized_keyword in normalized_query:
                score += partial_weight
                matched.append(keyword)

        return score, tuple(dict.fromkeys(matched))

    def _score_entry(
        self,
        normalized_query: str,
        query_tokens: set[str],
        entry: RAGEntry,
    ) -> tuple[float, tuple[str, ...], tuple[str, ...]]:
        score = 0.0
        primary_score, matched_primary = self._score_terms(
            normalized_query,
            query_tokens,
            entry.keywords,
            phrase_weight=4.5,
            token_weight=2.6,
            partial_weight=1.5,
        )
        support_score, matched_support = self._score_terms(
            normalized_query,
            query_tokens,
            entry.support_keywords,
            phrase_weight=2.0,
            token_weight=1.2,
            partial_weight=0.6,
        )
        score += primary_score + support_score
        overlap = len(query_tokens & entry.keyword_tokens)
        score += overlap * 0.35
        score += len(query_tokens & entry.support_keyword_tokens) * 0.15
        score += min(1.4, len(query_tokens & entry.condition_tokens) * 0.4)
        score += min(1.0, len(query_tokens & entry.summary_tokens) * 0.12)
        query_ngrams = generate_ngrams(normalized_query)
        score += min(2.2, len(query_ngrams & entry.keyword_ngrams) * 0.75)
        score += min(0.8, len(query_ngrams & entry.support_ngrams) * 0.35)

        if len(matched_primary) >= 2:
            score += 0.9
        elif matched_primary:
            score += 0.35

        if matched_primary and matched_support:
            score += 0.3

        for keyword in entry.exclude_keywords:
            normalized_keyword = normalize_arabic_text(keyword)
            if normalized_keyword and normalized_keyword in normalized_query:
                score -= 3.5

        return score, matched_primary, matched_support

    def _confidence_label(self, results: list[RetrievedCondition]) -> tuple[str, float, float]:
        if not results:
            return "none", 0.0, 0.0

        top_score = results[0].score
        second_score = results[1].score if len(results) > 1 else 0.0
        gap = top_score - second_score
        matched_count = len(results[0].matched_keywords) + len(results[0].matched_support_keywords)

        if top_score >= 6.8 and matched_count >= 2 and gap >= 0.7:
            return "strong", top_score, gap
        if top_score >= 3.4 and matched_count >= 1:
            return "medium", top_score, gap
        return "weak", top_score, gap

    def retrieve(self, complaint: str, specialty: str, limit: int = 4) -> RetrievalSummary:
        normalized_query = normalize_arabic_text(complaint)
        if not normalized_query or not specialty:
            return RetrievalSummary(results=[], confidence="none", top_score=0.0, score_gap=0.0, used_query=normalized_query)

        query_tokens = set(tokenize_arabic_text(normalized_query))
        results: list[RetrievedCondition] = []

        for entry in self.entries:
            if entry.specialty != specialty:
                continue
            score, matched_primary, matched_support = self._score_entry(normalized_query, query_tokens, entry)
            if score < entry.min_score:
                continue
            results.append(
                RetrievedCondition(
                    entry=entry,
                    score=score,
                    matched_keywords=matched_primary,
                    matched_support_keywords=matched_support,
                )
            )

        results.sort(
            key=lambda item: (
                item.score,
                len(item.matched_keywords),
                len(item.matched_support_keywords),
                item.entry.condition_ar,
            ),
            reverse=True,
        )
        trimmed = results[:limit]
        confidence, top_score, gap = self._confidence_label(trimmed)
        return RetrievalSummary(
            results=trimmed,
            confidence=confidence,
            top_score=top_score,
            score_gap=gap,
            used_query=normalized_query,
        )
