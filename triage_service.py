from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

try:
    from lime.lime_text import LimeTextExplainer
except ImportError:  # pragma: no cover - graceful fallback when lime is unavailable
    LimeTextExplainer = None


@dataclass
class QuestionTemplate:
    qid: str
    question: str
    category: str
    stage: str = "general"
    input_type: str = "text"
    options: List[str] = field(default_factory=list)
    hint: str = ""

    def to_payload(self) -> Dict[str, Any]:
        return {
            "id": self.qid,
            "question": self.question,
            "category": self.category,
            "stage": self.stage,
            "input_type": self.input_type,
            "options": self.options,
            "hint": self.hint,
        }


class ArabicMedicalTriageSystem:
    def __init__(self) -> None:
        self.class_names = [
            "طب عام",
            "جراحة العظام والمفاصل",
            "أمراض القلب",
            "طب الاعصاب",
            "الجهاز الهضمي",
            "الأمراض الجلدية",
            "الباطنية",
        ]
        self.label_to_index = {
            label: index for index, label in enumerate(self.class_names)
        }
        self.body_keywords = {
            "صدر": ["صدر", "القلب", "قلب", "خفقان", "نبض", "ضغط صدر"],
            "راس": ["راس", "صداع", "شقيقه", "دوخه", "دوار"],
            "كتف": ["كتف", "رقبه", "ظهر", "ذراع", "يد", "مفصل", "عضله"],
            "بطن": ["بطن", "معده", "قولون", "حرقه", "انتفاخ", "غثيان", "قيء", "مغص"],
            "جلد": ["جلد", "طفح", "حكه", "تحسس", "حساسيه", "احمرار"],
        }
        self.specialty_keywords = {
            "أمراض القلب": {
                "صدر": 2.4,
                "خفقان": 2.2,
                "ضيق تنفس": 2.8,
                "تعرق": 1.7,
                "ضغط صدر": 2.6,
                "نبض": 1.4,
            },
            "طب الاعصاب": {
                "صداع": 2.3,
                "زغلله": 2.0,
                "تشوش": 1.4,
                "دوخه": 1.8,
                "ضعف": 1.9,
                "تنميل": 1.6,
            },
            "جراحة العظام والمفاصل": {
                "كتف": 2.2,
                "ظهر": 1.8,
                "رقبه": 1.7,
                "مفصل": 2.0,
                "عضله": 1.4,
                "ذراع": 1.5,
                "حركه": 1.3,
            },
            "الجهاز الهضمي": {
                "بطن": 2.2,
                "معده": 2.0,
                "غثيان": 1.8,
                "قيء": 1.8,
                "مغص": 1.6,
                "قولون": 1.8,
                "حرقه": 1.7,
                "انتفاخ": 1.4,
            },
            "الأمراض الجلدية": {
                "حكه": 2.4,
                "طفح": 2.6,
                "جلد": 1.8,
                "احمرار": 1.5,
                "تحسس": 1.8,
            },
            "الباطنية": {
                "حراره": 1.2,
                "حمى": 1.2,
                "تعب": 0.9,
                "ضعف": 0.9,
                "غثيان": 0.7,
            },
            "طب عام": {
                "تعب": 1.0,
                "الم": 0.8,
                "وجع": 0.8,
            },
        }
        self.emergency_terms = [
            "اغماء",
            "فقدان الوعي",
            "ضيق تنفس شديد",
            "قيء دم",
            "نزيف",
            "شلل",
            "تشنج",
            "الم صدر شديد",
        ]
        self.integrative_sources = [
            "NCCIH: Ginger",
            "NCCIH: Peppermint Oil",
            "NCCIH: Chamomile",
            "NCCIH: Lavender",
            "NCCIH: Aromatherapy",
            "NCCIH: Relaxation Techniques",
            "NCCIH: Yoga",
            "NCCIH: Cupping",
        ]
        self.question_bank = self._build_question_bank()

    def _build_question_bank(self) -> Dict[str, QuestionTemplate]:
        return {
            "age_group": QuestionTemplate(
                qid="age_group",
                question="كم عمرك تقريبًا؟",
                category="profile",
                input_type="choice",
                options=["طفل", "بالغ", "كبير سن"],
                hint="العمر يساعد في ترتيب الاحتمالات الطبية.",
            ),
            "sex": QuestionTemplate(
                qid="sex",
                question="ما الجنس؟",
                category="profile",
                input_type="choice",
                options=["ذكر", "أنثى"],
            ),
            "chronic_disease": QuestionTemplate(
                qid="chronic_disease",
                question="هل لديك أمراض مزمنة مثل السكري أو الضغط أو أمراض القلب؟",
                category="history",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "current_medications": QuestionTemplate(
                qid="current_medications",
                question="هل تتناول أدوية حاليًا؟ إذا نعم، اذكرها باختصار.",
                category="history",
                input_type="choice",
                options=["نعم", "لا", "سأكتبها"],
            ),
            "drug_allergy": QuestionTemplate(
                qid="drug_allergy",
                question="هل لديك حساسية من أدوية معينة؟",
                category="history",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "prior_history": QuestionTemplate(
                qid="prior_history",
                question="هل لديك تاريخ مرضي سابق لنفس المشكلة أو مشكلة قريبة منها؟",
                category="history",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "new_or_recurrent": QuestionTemplate(
                qid="new_or_recurrent",
                question="هل الحالة جديدة أم متكررة؟",
                category="timeline",
                input_type="choice",
                options=["جديدة", "متكررة"],
            ),
            "duration": QuestionTemplate(
                qid="duration",
                question="منذ متى بدأت الأعراض؟",
                category="timeline",
                input_type="choice",
                options=["منذ ساعات", "منذ يوم", "منذ أيام", "منذ أسبوع أو أكثر"],
            ),
            "severity": QuestionTemplate(
                qid="severity",
                question="كيف تصف شدة الأعراض؟",
                category="severity",
                input_type="choice",
                options=["خفيفة", "متوسطة", "شديدة"],
            ),
            "pain_score": QuestionTemplate(
                qid="pain_score",
                question="إذا كان هناك ألم، كم درجته من 0 إلى 10؟",
                category="severity",
                input_type="choice",
                options=["0", "2", "4", "6", "8", "10"],
            ),
            "trend": QuestionTemplate(
                qid="trend",
                question="هل الأعراض تتحسن أم ثابتة أم تزداد؟",
                category="timeline",
                input_type="choice",
                options=["تتحسن", "ثابتة", "تزداد"],
            ),
            "fever": QuestionTemplate(
                qid="fever",
                question="هل توجد حرارة أو حمى؟",
                category="red_flags",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "vomiting": QuestionTemplate(
                qid="vomiting",
                question="هل يوجد قيء؟",
                category="red_flags",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "dizziness": QuestionTemplate(
                qid="dizziness",
                question="هل توجد دوخة أو إغماء؟",
                category="red_flags",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "shortness_breath": QuestionTemplate(
                qid="shortness_breath",
                question="هل يوجد ضيق تنفس؟",
                category="red_flags",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "radiation": QuestionTemplate(
                qid="radiation",
                question="هل الألم يمتد إلى الذراع أو الفك أو الظهر؟",
                category="specialty",
                stage="chest",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "sweating": QuestionTemplate(
                qid="sweating",
                question="هل يوجد تعرّق بارد أو خفقان واضح؟",
                category="specialty",
                stage="chest",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "movement_pain": QuestionTemplate(
                qid="movement_pain",
                question="هل يزداد الألم مع الحركة؟",
                category="specialty",
                stage="ortho",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "numbness": QuestionTemplate(
                qid="numbness",
                question="هل يوجد تنميل أو خدر؟",
                category="specialty",
                stage="ortho",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "weakness": QuestionTemplate(
                qid="weakness",
                question="هل يوجد ضعف أو صعوبة في تحريك الطرف؟",
                category="specialty",
                stage="ortho",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "vision_neuro": QuestionTemplate(
                qid="vision_neuro",
                question="هل يوجد زغللة، تشوش رؤية، أو ضعف مفاجئ؟",
                category="specialty",
                stage="neuro",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "gi_symptoms": QuestionTemplate(
                qid="gi_symptoms",
                question="هل يوجد غثيان أو انتفاخ أو حرقة أو تغيّر واضح في التبرز؟",
                category="specialty",
                stage="gi",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "skin_trigger": QuestionTemplate(
                qid="skin_trigger",
                question="هل بدأ الطفح أو الحكة بعد دواء جديد أو طعام أو مادة معينة؟",
                category="specialty",
                stage="skin",
                input_type="choice",
                options=["نعم", "لا"],
            ),
            "open_note": QuestionTemplate(
                qid="open_note",
                question="هل توجد ملاحظة مهمة إضافية تود ذكرها للطبيب؟",
                category="free_note",
                input_type="text",
            ),
        }

    def normalize_text(self, text: str) -> str:
        text = str(text).strip().lower()
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
        text = re.sub(r"[^\u0600-\u06FF0-9\s]", " ", text)
        return re.sub(r"\s+", " ", text).strip()

    def _find_body_parts(self, text: str) -> List[str]:
        body_parts: List[str] = []
        for part, keywords in self.body_keywords.items():
            if any(keyword in text for keyword in keywords):
                body_parts.append(part)
        return body_parts

    def _extract_signals(self, message: str) -> Dict[str, Any]:
        clean = self.normalize_text(message)
        body_parts = self._find_body_parts(clean)
        severity = "unknown"
        if any(term in clean for term in ["شديد", "شديده", "حاد", "قوي", "لا يحتمل"]):
            severity = "severe"
        elif any(term in clean for term in ["خفيف", "بسيط"]):
            severity = "mild"
        elif any(term in clean for term in ["متوسط", "متوسطه"]):
            severity = "moderate"

        duration = "unknown"
        if "ساعات" in clean or "اليوم" in clean:
            duration = "acute"
        elif "يوم" in clean or "ايام" in clean or "اسبوع" in clean:
            duration = "recent"
        elif "شهر" in clean or "فتره طويله" in clean or "مزمن" in clean:
            duration = "chronic"

        spread = "yes" if any(term in clean for term in ["يمتد", "ينتشر", "للفك", "للظهر", "للذراع"]) else "no"

        associated = []
        for term in ["حمى", "حراره", "غثيان", "قيء", "دوخه", "اغماء", "ضيق تنفس", "خفقان", "حكه", "طفح", "تنميل", "ضعف"]:
            if term in clean:
                associated.append(term)

        red_flags = []
        if "ضيق تنفس" in clean:
            red_flags.append("ضيق تنفس")
        if "اغماء" in clean or "فقدان الوعي" in clean:
            red_flags.append("إغماء أو فقدان وعي")
        if "قيء دم" in clean or "نزيف" in clean:
            red_flags.append("نزف")
        if "تعرق" in clean and "صدر" in clean:
            red_flags.append("ألم صدر مع تعرق")
        if "زغلله" in clean or "تشوش" in clean:
            red_flags.append("اضطراب رؤية")

        return {
            "clean_text": clean,
            "body_parts": body_parts,
            "severity": severity,
            "duration": duration,
            "spread": spread,
            "associated_symptoms": associated,
            "red_flags": red_flags,
        }

    def _score_specialties(self, normalized_text: str) -> Dict[str, float]:
        scores = {label: 0.35 for label in self.class_names}
        for specialty, keywords in self.specialty_keywords.items():
            for keyword, weight in keywords.items():
                if keyword in normalized_text:
                    scores[specialty] += weight

        if "صدر" not in normalized_text and "خفقان" not in normalized_text:
            scores["أمراض القلب"] -= 0.05
        if "طفح" not in normalized_text and "حكه" not in normalized_text:
            scores["الأمراض الجلدية"] -= 0.05

        total = sum(max(value, 0.05) for value in scores.values())
        return {label: max(value, 0.05) / total for label, value in scores.items()}

    def predict_proba_for_lime(self, texts: List[str]):
        rows = []
        for text in texts:
            normalized = self.normalize_text(text)
            probs = self._score_specialties(normalized)
            rows.append([probs[label] for label in self.class_names])
        return rows

    def _safety_screen(self, normalized_text: str, extracted: Dict[str, Any]) -> Optional[Dict[str, str]]:
        if any(term in normalized_text for term in self.emergency_terms):
            return {
                "level": "emergency",
                "reason": "تم رصد علامة إنذارية قوية قد تحتاج إلى تقييم عاجل جدًا.",
                "advice": "يُنصح بالتوجه إلى الطوارئ أو طلب المساعدة الطبية فورًا.",
            }

        if "صدر" in extracted["body_parts"] and ("ضيق تنفس" in normalized_text or "تعرق" in normalized_text):
            return {
                "level": "urgent",
                "reason": "توجد أعراض صدرية مع ضيق نفس أو تعرّق، وهذا يحتاج تقييمًا سريعًا.",
                "advice": "يُفضّل عدم تأخير المراجعة الطبية اليوم.",
            }

        if "اغماء" in normalized_text or "فقدان الوعي" in normalized_text:
            return {
                "level": "urgent",
                "reason": "ذُكرت دوخة شديدة أو إغماء، وهذا يحتاج تقييمًا مباشرًا.",
                "advice": "يُفضّل التقييم الطبي السريع.",
            }

        if "زغلله" in normalized_text and "صداع" in normalized_text:
            return {
                "level": "urgent",
                "reason": "الصداع مع زغللة أو تشوش رؤية يحتاج تقييمًا طبيًا سريعًا.",
                "advice": "يُفضّل مراجعة الطبيب اليوم.",
            }

        return None

    def predict(self, message: str) -> Dict[str, Any]:
        normalized = self.normalize_text(message)
        extracted = self._extract_signals(message)
        safety = self._safety_screen(normalized, extracted)

        probs = self._score_specialties(normalized)
        ranking = sorted(probs.items(), key=lambda item: item[1], reverse=True)
        final_label, final_confidence = ranking[0]
        second_label, second_confidence = ranking[1]
        confidence_gap = final_confidence - second_confidence

        triage_category = safety["level"] if safety else "non-urgent"
        confidence_band = "high confidence"
        if final_confidence < 0.8:
            confidence_band = "moderate confidence"
        if final_confidence < 0.6:
            confidence_band = "low confidence"

        return {
            "mode": "normal" if not (safety and safety["level"] == "emergency") else "emergency",
            "triage_category": triage_category,
            "final_label": final_label,
            "second_label": second_label,
            "final_confidence": round(final_confidence, 3),
            "second_confidence": round(second_confidence, 3),
            "confidence_gap": round(confidence_gap, 3),
            "confidence_band": confidence_band,
            "is_uncertain": confidence_gap < 0.12 or final_confidence < 0.58,
            "uncertainty_message": "توجد حاجة إلى تفاصيل إضافية لدعم القرار بشكل أدق."
            if confidence_gap < 0.12 or final_confidence < 0.58
            else None,
            "safety": safety,
            "extracted": extracted,
        }

    def generate_questions(self, message: str) -> List[QuestionTemplate]:
        prediction = self.predict(message)
        body_parts = prediction["extracted"]["body_parts"]
        questions = [
            self.question_bank["age_group"],
            self.question_bank["sex"],
            self.question_bank["chronic_disease"],
            self.question_bank["current_medications"],
            self.question_bank["drug_allergy"],
            self.question_bank["prior_history"],
            self.question_bank["new_or_recurrent"],
            self.question_bank["duration"],
            self.question_bank["severity"],
            self.question_bank["pain_score"],
            self.question_bank["trend"],
            self.question_bank["fever"],
            self.question_bank["vomiting"],
            self.question_bank["dizziness"],
            self.question_bank["shortness_breath"],
        ]

        if "صدر" in body_parts:
            questions.extend([
                self.question_bank["radiation"],
                self.question_bank["sweating"],
            ])
        if "كتف" in body_parts:
            questions.extend([
                self.question_bank["movement_pain"],
                self.question_bank["numbness"],
                self.question_bank["weakness"],
            ])
        if "راس" in body_parts:
            questions.append(self.question_bank["vision_neuro"])
        if "بطن" in body_parts:
            questions.append(self.question_bank["gi_symptoms"])
        if "جلد" in body_parts:
            questions.append(self.question_bank["skin_trigger"])

        questions.append(self.question_bank["open_note"])

        deduped: List[QuestionTemplate] = []
        seen = set()
        for question in questions:
            if question.qid in seen:
                continue
            seen.add(question.qid)
            deduped.append(question)
        return deduped

    def _normalize_answers(self, answers: List[Any]) -> List[Dict[str, str]]:
        normalized_answers: List[Dict[str, str]] = []
        for answer in answers:
            if isinstance(answer, dict):
                normalized_answers.append(
                    {
                        "id": str(answer.get("id", "")),
                        "question": str(answer.get("question", "")),
                        "answer": str(answer.get("answer", "")).strip(),
                    }
                )
            else:
                normalized_answers.append(
                    {
                        "id": "",
                        "question": "",
                        "answer": str(answer).strip(),
                    }
                )
        return normalized_answers

    def _answer_map(self, qa_pairs: Iterable[Dict[str, str]]) -> Dict[str, str]:
        return {
            pair["id"]: self.normalize_text(pair["answer"])
            for pair in qa_pairs
            if pair.get("id")
        }

    def _truthy(self, answer: str) -> bool:
        return any(term in answer for term in ["نعم", "ايوه", "أيوه", "موجود", "يوجد", "yes", "y"])

    def _score_recommendation(self, prediction: Dict[str, Any], qa_pairs: List[Dict[str, str]]) -> Dict[str, Any]:
        answers = self._answer_map(qa_pairs)
        score = 0
        rationale: List[str] = []

        if self._truthy(answers.get("chronic_disease", "")):
            score += 2
            rationale.append("وجود أمراض مزمنة يرفع الحاجة للحذر.")
        if self._truthy(answers.get("shortness_breath", "")):
            score += 4
            rationale.append("وجود ضيق تنفس مؤشر مهم على الحاجة لتقييم سريع.")
        if self._truthy(answers.get("dizziness", "")):
            score += 3
            rationale.append("وجود دوخة أو إغماء يزيد مستوى الخطورة.")
        if self._truthy(answers.get("vomiting", "")):
            score += 2
            rationale.append("القيء قد يشير إلى شدة أو حاجة لمتابعة أقرب.")
        if self._truthy(answers.get("fever", "")):
            score += 1
            rationale.append("وجود حرارة قد يشير إلى حالة داخلية تحتاج تقييمًا منظّمًا.")
        if "تزداد" in answers.get("trend", ""):
            score += 2
            rationale.append("الأعراض تتفاقم بدل أن تتحسن.")
        if self._truthy(answers.get("numbness", "")) or self._truthy(answers.get("weakness", "")):
            score += 3
            rationale.append("ذُكر تنميل أو ضعف وهذا يحتاج انتباهًا أكبر.")
        if self._truthy(answers.get("radiation", "")):
            score += 2
            rationale.append("امتداد الألم يزيد احتمال الحاجة لتقييم أسرع.")
        if self._truthy(answers.get("sweating", "")):
            score += 2
            rationale.append("الخفقان أو التعرق البارد يدعم الحذر في الأعراض الصدرية.")
        if self._truthy(answers.get("vision_neuro", "")):
            score += 4
            rationale.append("ذُكرت أعراض عصبية مقلقة تحتاج تقييمًا مباشرًا.")
        if "8" in answers.get("pain_score", "") or "10" in answers.get("pain_score", ""):
            score += 2
            rationale.append("درجة الألم مرتفعة.")
        if "شديد" in answers.get("severity", ""):
            score += 2
            rationale.append("الشدة الموصوفة مرتفعة.")
        if "جديده" in answers.get("new_or_recurrent", "") or "جديدة" in answers.get("new_or_recurrent", ""):
            score += 1

        safety = prediction["safety"]
        if safety:
            if safety["level"] == "emergency":
                risk_level = "emergency"
                timing = "الطوارئ الآن"
            else:
                risk_level = "high"
                timing = "مراجعة اليوم"
            rationale.insert(0, safety["reason"])
        elif score >= 9:
            risk_level = "high"
            timing = "مراجعة اليوم"
        elif score >= 5:
            risk_level = "medium"
            timing = "حجز موعد قريب"
        else:
            risk_level = "low"
            timing = "متابعة قصيرة مع مراقبة الأعراض"

        advice = [
            f"التخصص الأنسب مبدئيًا هو: {prediction['final_label']}.",
            f"درجة الثقة الحالية: {prediction['confidence_band']} ({prediction['final_confidence']:.2f}).",
            f"الخطوة التالية المقترحة: {timing}.",
            "هذا التوجيه أولي ولا يغني عن التقييم الطبي المباشر.",
        ]

        return {
            "risk_level": risk_level,
            "score": score,
            "timing": timing,
            "rationale": rationale,
            "advice": advice,
        }

    def recommend(self, message: str, answers: List[Any]) -> Dict[str, Any]:
        prediction = self.predict(message)
        qa_pairs = self._normalize_answers(answers)
        recommendation = self._score_recommendation(prediction, qa_pairs)
        summary = self.build_case_summary(message, prediction, recommendation, qa_pairs)
        return {
            "prediction": prediction,
            "recommendation": recommendation,
            "qa_pairs": qa_pairs,
            "summary": summary,
        }

    def build_case_snapshot(self, complaint: str, prediction: Dict[str, Any], qa_pairs: List[Dict[str, str]]) -> Dict[str, Any]:
        answer_map = self._answer_map(qa_pairs)
        extracted = prediction["extracted"]
        symptoms = complaint
        if answer_map.get("open_note"):
            symptoms = f"{complaint} | ملاحظة إضافية: {answer_map['open_note']}"

        associated_items = list(extracted["associated_symptoms"])
        answer_driven_associated = {
            "fever": "حرارة",
            "vomiting": "قيء",
            "dizziness": "دوخة أو إغماء",
            "shortness_breath": "ضيق تنفس",
            "numbness": "تنميل أو خدر",
            "weakness": "ضعف",
            "vision_neuro": "زغللة أو تشوش رؤية",
            "gi_symptoms": "أعراض هضمية مرافقة",
            "sweating": "تعرّق أو خفقان",
        }
        for answer_id, label in answer_driven_associated.items():
            if self._truthy(answer_map.get(answer_id, "")) and label not in associated_items:
                associated_items.append(label)

        red_flags_items = list(extracted["red_flags"])
        answer_driven_flags = {
            "shortness_breath": "ضيق تنفس",
            "dizziness": "دوخة أو إغماء",
            "vision_neuro": "علامات عصبية مقلقة",
            "radiation": "امتداد الألم",
            "sweating": "تعرّق بارد أو خفقان",
        }
        for answer_id, label in answer_driven_flags.items():
            if self._truthy(answer_map.get(answer_id, "")) and label not in red_flags_items:
                red_flags_items.append(label)

        return {
            "complaint": complaint,
            "symptoms": symptoms,
            "location": "، ".join(extracted["body_parts"]) if extracted["body_parts"] else "غير محدد",
            "severity": answer_map.get("severity", extracted["severity"] or "غير محدد"),
            "duration": answer_map.get("duration", extracted["duration"] or "غير محدد"),
            "trend": answer_map.get("trend", "غير محدد"),
            "associated": "، ".join(associated_items) if associated_items else "لا يوجد واضح",
            "red_flags": "، ".join(red_flags_items) if red_flags_items else "لا يوجد واضح",
        }

    def build_case_summary(
        self,
        complaint: str,
        prediction: Dict[str, Any],
        recommendation: Dict[str, Any],
        qa_pairs: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        snapshot = self.build_case_snapshot(complaint, prediction, qa_pairs)
        summary_lines = [
            f"الشكوى الرئيسية: {snapshot['complaint']}",
            f"وصف موجز للأعراض: {snapshot['symptoms']}",
            f"المكان: {snapshot['location']}",
            f"الشدة: {snapshot['severity']}",
            f"المدة: {snapshot['duration']}",
            f"اتجاه الحالة: {snapshot['trend']}",
            f"الأعراض المصاحبة: {snapshot['associated']}",
            f"العلامات الإنذارية: {snapshot['red_flags']}",
            f"التخصص المتوقع: {prediction['final_label']}",
            f"درجة الخطورة: {recommendation['risk_level']}",
            f"التوصية التالية: {recommendation['timing']}",
        ]
        return {"summary_lines": summary_lines}

    def build_doctor_snapshot(self, complaint: str, prediction: Dict[str, Any]) -> Dict[str, str]:
        extracted = prediction["extracted"]
        return {
            "complaint": complaint,
            "symptoms": complaint,
            "prediction": prediction["final_label"],
            "risk": prediction["triage_category"],
            "red_flags": "، ".join(extracted["red_flags"]) if extracted["red_flags"] else "لا يوجد واضح",
            "send_note": "تم تجهيز ملخص أولي، وسيتم تحديثه بعد الإجابة عن أسئلة المتابعة.",
        }

    def _heuristic_explanation(self, normalized_message: str, predicted_specialty: str) -> List[List[Any]]:
        specialty_keywords = self.specialty_keywords.get(predicted_specialty, {})
        importance = []
        for token in normalized_message.split():
            if token in specialty_keywords:
                importance.append([token, round(specialty_keywords[token] / 3.0, 3)])
        if not importance:
            importance = [[token, 0.12] for token in normalized_message.split()[:4]]
        return importance[:8]

    def explain(self, message: str) -> Dict[str, Any]:
        normalized = self.normalize_text(message)
        prediction = self.predict(message)
        predicted_specialty = prediction["final_label"]

        if LimeTextExplainer is not None:
            try:
                explainer = LimeTextExplainer(class_names=self.class_names, split_expression=r"\s+")
                explanation = explainer.explain_instance(
                    normalized,
                    lambda texts: self.predict_proba_for_lime(list(texts)),
                    num_features=8,
                    top_labels=1,
                )
                label_index = self.label_to_index[predicted_specialty]
                word_importance = [
                    [word, round(weight, 3)]
                    for word, weight in explanation.as_list(label=label_index)
                ]
            except Exception:
                word_importance = self._heuristic_explanation(normalized, predicted_specialty)
        else:
            word_importance = self._heuristic_explanation(normalized, predicted_specialty)

        return {
            "predicted_specialty": predicted_specialty,
            "word_importance": word_importance,
            "explanation_note": "الكلمات التالية هي الأكثر تأثيرًا في ترجيح التخصص المتوقع.",
            "retrieved_support": [
                {
                    "label": predicted_specialty,
                    "score": prediction["final_confidence"],
                    "text_preview": "تم بناء هذا التفسير اعتمادًا على الكلمات الطبية الأكثر تأثيرًا في الشكوى.",
                }
            ],
        }

    def build_doctor_report(
        self,
        complaint: str,
        prediction: Dict[str, Any],
        recommendation: Dict[str, Any],
        qa_pairs: List[Dict[str, str]],
        explanation: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        snapshot = self.build_case_snapshot(complaint, prediction, qa_pairs)
        answer_map = self._answer_map(qa_pairs)
        explanation = explanation or self.explain(complaint)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")

        sections = {
            "chief_complaint": snapshot["complaint"],
            "symptoms_summary": snapshot["symptoms"],
            "location": snapshot["location"],
            "severity": snapshot["severity"],
            "duration": snapshot["duration"],
            "trend": snapshot["trend"],
            "associated_symptoms": snapshot["associated"],
            "red_flags": snapshot["red_flags"],
            "history": {
                "age_group": answer_map.get("age_group", "غير مذكور"),
                "sex": answer_map.get("sex", "غير مذكور"),
                "chronic_disease": answer_map.get("chronic_disease", "غير مذكور"),
                "current_medications": answer_map.get("current_medications", "غير مذكور"),
                "drug_allergy": answer_map.get("drug_allergy", "غير مذكور"),
                "prior_history": answer_map.get("prior_history", "غير مذكور"),
            },
            "prediction": {
                "specialty": prediction["final_label"],
                "second_choice": prediction["second_label"],
                "risk_level": recommendation["risk_level"],
                "confidence": prediction["final_confidence"],
                "confidence_band": prediction["confidence_band"],
                "next_step": recommendation["timing"],
            },
            "decision_build": {
                "input": complaint,
                "analysis": [
                    f"الأماكن المستخرجة: {snapshot['location']}",
                    f"الأعراض المصاحبة: {snapshot['associated']}",
                    f"العلامات الإنذارية: {snapshot['red_flags']}",
                ],
                "output": [
                    f"التخصص المتوقع: {prediction['final_label']}",
                    f"درجة الخطورة: {recommendation['risk_level']}",
                    f"الخطوة التالية: {recommendation['timing']}",
                ],
            },
            "timeline": [
                f"بداية الأعراض: {snapshot['duration']}",
                f"مسار الأعراض: {snapshot['trend']}",
                f"نوع الحالة: {answer_map.get('new_or_recurrent', 'غير مذكور')}",
                f"تاريخ إنشاء التقرير: {timestamp}",
            ],
            "rationale": recommendation["rationale"],
            "lime": explanation,
        }

        rationale_lines = [f"- {item}" for item in sections["rationale"]]
        if not rationale_lines:
            rationale_lines = ["- لا توجد مبررات إضافية مسجلة."]

        export_lines = [
            "ملخص الحالة للطبيب",
            f"الشكوى الرئيسية: {sections['chief_complaint']}",
            f"ملخص الأعراض: {sections['symptoms_summary']}",
            f"المكان: {sections['location']}",
            f"الشدة: {sections['severity']}",
            f"المدة: {sections['duration']}",
            f"اتجاه الحالة: {sections['trend']}",
            f"الأعراض المصاحبة: {sections['associated_symptoms']}",
            f"العلامات الإنذارية: {sections['red_flags']}",
            f"التخصص المتوقع: {sections['prediction']['specialty']}",
            f"درجة الخطورة: {sections['prediction']['risk_level']}",
            f"درجة الثقة: {sections['prediction']['confidence_band']} ({sections['prediction']['confidence']:.2f})",
            f"الخطوة التالية: {sections['prediction']['next_step']}",
            "مبررات القرار:",
            *rationale_lines,
        ]

        return {
            "sections": sections,
            "plain_text": "\n".join(export_lines),
        }

    def _integrative_entry(
        self,
        category: str,
        title: str,
        reason: str,
        mechanism: str,
        suitable_for: str,
        avoid_if: str,
        note: str = "",
    ) -> Dict[str, str]:
        return {
            "category": category,
            "title": title,
            "reason": reason,
            "mechanism": mechanism,
            "suitable_for": suitable_for,
            "avoid_if": avoid_if,
            "note": note,
        }

    def _render_integrative_entry(self, item: Dict[str, str], index: int) -> str:
        lines = [
            f"{index}. [{item['category']}] {item['title']}",
            f"السبب في اقتراحه: {item['reason']}",
            f"كيف قد يساعد: {item['mechanism']}",
            f"متى قد يكون مناسبًا: {item['suitable_for']}",
            f"متى يجب تجنبه أو عدم الاعتماد عليه: {item['avoid_if']}",
        ]
        if item.get("note"):
            lines.append(f"ملاحظة مهمة: {item['note']}")
        return "\n".join(lines)

    def get_supportive_optional_tips(self, specialty: str, risk_level: str, complaint: str = "") -> List[str]:
        if risk_level == "emergency":
            urgency_title = "إرشادات آمنة إلى حين التقييم الطبي المباشر"
            next_step = "الطوارئ الآن" if risk_level == "emergency" else "مراجعة طبية اليوم دون تأخير"
            return [
                urgency_title,
                "1. لماذا لا أضع هنا أعشابًا أو زيوتًا أو علاجًا بديلًا؟\n"
                "لأن مستوى الخطورة في هذه الحالة ليس منخفضًا، لذلك الأولوية هنا ليست تجربة وسائل تكاملية، بل الوصول إلى تقييم طبي مباشر وآمن.",
                "2. ما الذي ينبغي فعله الآن؟\n"
                f"الخطوة التالية المقترحة هي: {next_step}. "
                "كلما كان التقييم أسرع، كان عرض الحالة على الطبيب أوضح وأكثر أمانًا.",
                "3. ما الذي يمكن فعله إلى حين الوصول للطبيب؟\n"
                "الراحة، تقليل الجهد، الجلوس في وضعية مريحة، وتجنب أي شيء قد يزيد الأعراض مثل المجهود العالي أو التجارب المنزلية غير المضمونة.",
                "4. ماذا يجب تجنبه؟\n"
                "تجنب تأخير المراجعة، وتجنب الاعتماد على الأعشاب أو الحجامة أو الزيوت أو المسكنات العشوائية كبديل عن الفحص السريري في هذه المرحلة.",
                "5. ماذا أحضّر للطبيب؟\n"
                "خذ معك وصفًا مختصرًا للشكوى، ووقت بداية الأعراض، والأدوية الحالية، والحساسيات الدوائية، وأي أمراض مزمنة أو تقارير سابقة إن وجدت.",
                "الخلاصة العملية:\n"
                "في هذه الحالة، أفضل مخرج مهني وآمن هو التقييم الطبي المباشر، بينما تبقى الإرشادات المنزلية هنا محدودة جدًا ومقصودة فقط لتقليل الخطر وليس للعلاج.",
            ]

        high_risk_mode = risk_level in ["high", "urgent"]
        next_step = "مراجعة طبية اليوم دون تأخير" if high_risk_mode else "المراجعة الطبية المنظمة"
        if high_risk_mode:
            intro = (
                "إرشادات تكاملية مفصلة مع تنبيه مهني مهم.\n"
                f"هذه الحالة تحتاج إلى {next_step}، والإرشادات أدناه تُعرض فقط كخيارات داعمة مؤقتة جدًا لتخفيف الانزعاج أو تنظيم الراحة، "
                "ولا ينبغي استخدامها كبديل عن التقييم الطبي المباشر."
            )
            general_warning = (
                "إذا كان الألم شديدًا، أو متزايدًا، أو مصحوبًا بضيق نفس، أو حرارة عالية، أو قيء متكرر، أو نزف، أو جفاف، "
                "أو ضعف مفاجئ، أو اضطراب بالكلام أو الوعي، فالأولوية تبقى للتقييم الطبي المباشر، ويجب عدم تأخير المراجعة اعتمادًا على الإرشادات التكاملية."
            )
        else:
            intro = (
                "إرشادات تكاملية مفصلة إلى حين مراجعة الطبيب.\n"
                "هذه الإرشادات لا تُستخدم كبديل عن التقييم الطبي، بل كخيارات داعمة مؤقتة فقط في الحالات الخفيفة أو المتوسطة غير العاجلة."
            )
            general_warning = (
                "إذا كان الألم شديدًا، أو متزايدًا، أو مصحوبًا بضيق نفس، أو حرارة عالية، أو قيء متكرر، أو نزف، أو جفاف، "
                "أو ضعف مفاجئ، أو اضطراب بالكلام أو الوعي، فلا ينبغي الاعتماد على أي إرشاد تكميلي بدل التقييم الطبي المباشر."
            )

        entries: List[Dict[str, str]] = []
        if specialty == "الجهاز الهضمي":
            entries.extend([
                self._integrative_entry(
                    "أعشاب",
                    "شاي الزنجبيل",
                    "الزنجبيل من أكثر الخيارات العشبية التي تمت دراستها في الغثيان والانزعاج الهضمي، لذلك يكون طرحه منطقيًا عندما تكون الشكوى أقرب إلى غثيان خفيف أو اضطراب معدي بسيط.",
                    "تشير مصادر موثوقة إلى أن الزنجبيل قد يكون مفيدًا في بعض حالات الغثيان، ويُعتقد أن بعض مركباته النشطة مثل gingerols و shogaols قد تؤثر في مسارات مرتبطة بالغثيان وحركة الجهاز الهضمي. هذا لا يعني أنه يعالج سبب الألم نفسه، لكنه قد يخفف بعض الأعراض المصاحبة عند بعض الأشخاص.",
                    "قد يكون مناسبًا إذا كانت الشكوى أقرب إلى غثيان خفيف، انزعاج معدي بسيط، أو اضطراب هضمي غير شديد من دون علامات إنذارية.",
                    general_warning + " كما يجب الحذر إذا كان المريض يتناول أدوية قد تتداخل مع المنتجات العشبية.",
                    "الزنجبيل خيار داعم مؤقت لبعض الأعراض، وليس علاجًا تشخيصيًا لسبب ألم المعدة.",
                ),
                self._integrative_entry(
                    "أعشاب",
                    "النعناع أو زيت النعناع بحذر",
                    "النعناع قد يُطرح عندما يكون العرض أقرب إلى تقلصات أو أعراض شبيهة بمتلازمة القولون العصبي.",
                    "تشير معلومات NCCIH إلى أن زيت النعناع، خصوصًا في صورة كبسولات مغلفة معويًا، لديه بعض الأدلة على تخفيف أعراض القولون العصبي وألم البطن المرتبط به على المدى القصير. ويُحتمل أن يكون ذلك مرتبطًا بتأثير مضاد للتشنج على العضلات الملساء في الجهاز الهضمي، ويرتبط ذلك غالبًا بمركب menthol.",
                    "قد يكون مناسبًا عندما تكون الشكوى أقرب إلى تقلصات، انتفاخ، أو انزعاج بطني وظيفي خفيف، وليس إلى حرقة شديدة أو ارتجاع حمضي واضح.",
                    "إذا كانت الشكوى الأساسية هي حرقة المعدة، أو رجوع الحمض، أو عسر هضم يزداد مع النعناع، فلا يكون خيارًا مناسبًا. كما لا ينبغي اعتباره علاجًا مستقلًا لألم المعدة الشديد.",
                    "النعناع ليس مناسبًا لكل ألم معدة، وقد يزيد الحرقة أو الارتجاع عند بعض الأشخاص.",
                ),
                self._integrative_entry(
                    "أعشاب",
                    "البابونج",
                    "البابونج يُستخدم شعبيًا كمشروب مهدئ للمعدة وللاسترخاء العام، لذلك قد يُذكر في الحالات البسيطة التي يكون فيها التوتر جزءًا من الصورة.",
                    "الدليل العلمي على فائدته المحددة لعسر الهضم أو مشاكل المعدة ليس قويًا مثل بعض الخيارات الأخرى، لكن بعض الناس يجدونه مهدئًا ومريحًا. لذلك يُذكر كخيار شعبي منخفض الشدة أكثر من كونه خيارًا مدعومًا بقوة لحالة محددة.",
                    "قد يكون مناسبًا إذا كان الانزعاج الهضمي بسيطًا ومصحوبًا بتوتر أو رغبة في التهدئة العامة، ومن دون علامات إنذارية.",
                    "يجب الحذر عند من لديهم حساسية من نباتات مثل الأقحوان أو ragweed، وكذلك عند من يتناولون أدوية قد تتداخل معه مثل الوارفارين أو بعض المهدئات.",
                    "يُذكر هنا كخيار داعم منخفض الشدة، لا كخيار علاجي أساسي.",
                ),
                self._integrative_entry(
                    "تغذية وسوائل",
                    "تنظيم الطعام والسوائل",
                    "ليس كل دعم تكميلي يكون عشبيًا؛ أحيانًا يكون تعديل الطعام والسوائل أكثر واقعية وفائدة من أي وصفة بديلة.",
                    "الوجبات الخفيفة، وتجنب الأطعمة الدسمة أو الثقيلة أو كثيرة التوابل مؤقتًا، والحفاظ على شرب السوائل بكميات مناسبة، قد يقلل العبء على المعدة ويساعد في حالات الانزعاج الهضمي البسيط.",
                    "قد يكون مناسبًا في الشكاوى الهضمية الخفيفة أو المتوسطة غير المصحوبة بقيء شديد أو جفاف أو فقدان وزن أو ألم حاد.",
                    general_warning,
                    "هذا النوع من الدعم غالبًا أكثر أمانًا من المبالغة في استخدام الأعشاب أو الزيوت.",
                ),
                self._integrative_entry(
                    "تنفس واسترخاء",
                    "التنفس البطني البطيء",
                    "بعض أعراض المعدة قد تتأثر بالتوتر أو القلق، لذلك قد يُذكر التنفس البطيء كخيار تكميلي غير دوائي.",
                    "تشير NCCIH إلى أن تقنيات الاسترخاء والتنفس البطيء قد تساعد في إحداث استجابة استرخاء تتميز ببطء التنفس وانخفاض التوتر. هذا قد يكون مفيدًا عندما يكون الانزعاج الهضمي مصحوبًا بشد عصبي أو قلق.",
                    "قد يكون مناسبًا إذا كان التوتر جزءًا من الحالة أو إذا كان الألم والانزعاج يزدادان مع الانفعال.",
                    "لا يؤخر التقييم عند وجود ألم شديد أو أعراض إنذارية.",
                    "هو خيار مساعد لتنظيم التوتر، وليس علاجًا لمرض عضوي بحد ذاته.",
                ),
                self._integrative_entry(
                    "حركة وهواء",
                    "المشي الخفيف بعد الطعام أو التهوية الجيدة",
                    "الحركة الخفيفة والهواء المريح قد يكونان مفيدين في بعض حالات الثقل البسيط أو التوتر، وهما من الخيارات التكاملية الآمنة نسبيًا عند غياب الإنذارات.",
                    "المشي الهادئ قد يساعد بعض الأشخاص على تقليل الإحساس بالثقل بعد الوجبات، كما أن الخروج إلى هواء مريح أو مكان أقل ازدحامًا قد يخفف الإحساس العام بالانزعاج أو الغثيان المرتبط بالتوتر.",
                    "قد يكون مناسبًا إذا كانت الشكوى بسيطة وكان المريض قادرًا على الحركة بشكل مريح.",
                    "إذا كانت الحركة تزيد الألم، أو تسبب دوخة، أو كان هناك ضعف أو قيء أو ألم شديد، فلا يُنصح بذلك.",
                    "الهدف هنا هو الراحة وتنظيم الأعراض، وليس علاج السبب المرضي مباشرة.",
                ),
                self._integrative_entry(
                    "زيوت وعلاج عطري",
                    "استنشاق اللافندر بحذر",
                    "اللافندر يُستخدم غالبًا في العلاج العطري المرتبط بالتهدئة، وليس كعلاج مباشر لسبب عضوي في المعدة.",
                    "تشير NCCIH إلى أن اللافندر دُرس في القلق والتوتر، وبعض الدراسات تشير إلى احتمال وجود فائدة في التهدئة. لذلك إذا كان جزء من الانزعاج الهضمي مرتبطًا بالتوتر، فقد يكون الاستنشاق الخفيف لرائحته خيارًا مساعدًا على الاسترخاء.",
                    "قد يكون مناسبًا إذا كانت الشكوى الهضمية البسيطة تترافق مع توتر واضح أو قلق أو شد نفسي.",
                    "لا ينبغي ابتلاع الزيوت العطرية، ولا وضعها مباشرة على الجلد دون تخفيف مناسب، ولا الاعتماد عليها في حالات الألم الشديد أو القيء أو الإنذارات الطبية.",
                    "يُذكر اللافندر هنا كعامل تهدئة فقط، وليس كعلاج مباشر للمعدة.",
                ),
                self._integrative_entry(
                    "علاج بالطاقة",
                    "ممارسات تهدئة مثل الريكي مع تحفظ",
                    "بعض المستخدمين يسألون عن العلاج بالطاقة، لذلك يمكن ذكره بصياغة مسؤولة بدل تقديمه كعلاج مثبت.",
                    "إذا ذُكر، فيجب وصفه كخيار قد يمنح بعض الناس إحساسًا بالراحة أو التهدئة النفسية، وليس كعلاج مثبت لمرض عضوي في المعدة أو الأمعاء. الدليل العلمي عليه محدود وغير كافٍ لاعتباره علاجًا معتمدًا.",
                    "قد يُذكر فقط عندما يكون المقصود الاسترخاء النفسي في حالة غير عاجلة.",
                    "لا ينبغي طرحه كخيار بديل عن تقييم الألم المستمر أو الشديد أو المصحوب بإنذارات طبية.",
                    "إذا استخدمته في الموقع، فاستخدمه تحت بند الراحة النفسية فقط.",
                ),
            ])
        elif specialty == "جراحة العظام والمفاصل":
            entries.extend([
                self._integrative_entry(
                    "علاج موضعي",
                    "الكمادات الباردة أو الدافئة",
                    "الكمادات من أكثر الخيارات التكاملية شيوعًا في آلام العضلات والمفاصل.",
                    "البرودة قد تكون أنسب في الألم الحديث، بينما الدفء قد يكون مريحًا أكثر في الشد العضلي أو التيبس.",
                    "قد يكون مناسبًا في الألم العضلي أو المفصلي الخفيف إلى المتوسط.",
                    "إذا كان هناك ضعف، خدر، تشوه، أو إصابة شديدة، فلا ينبغي الاعتماد على الكمادات وحدها.",
                    "الهدف هو تخفيف الأعراض لا أكثر، مع مراقبة ما إذا كان الدفء أو البرودة يزعج الحالة.",
                ),
                self._integrative_entry(
                    "راحة ونمط حياة",
                    "الراحة النسبية ووضعية مريحة",
                    "الراحة النسبية أفضل عادة من الإجهاد المتواصل في كثير من الشكاوى العضلية والمفصلية.",
                    "تقليل الحركات التي تثير الألم واختيار وضعية نوم أو جلوس تقلل الضغط على المنطقة المصابة قد يساعد في خفض الشد العضلي ومنع زيادة التهيج.",
                    "قد يكون مناسبًا عند ألم الكتف أو الرقبة أو الظهر أو المفاصل إذا كانت الحركة هي العامل الأكثر إزعاجًا.",
                    "الراحة التامة لفترات طويلة ليست دائمًا مفيدة، ولا ينبغي أن تؤخر التقييم إذا كان الألم يزداد أو ترافق مع أعراض عصبية.",
                    "المقصود هنا راحة ذكية ومؤقتة، لا تثبيت كامل أو امتناع عن الحركة لأيام طويلة.",
                ),
                self._integrative_entry(
                    "تمارين ورياضية",
                    "التمدد الخفيف أو اليوغا اللطيفة",
                    "هناك بعض الأدلة على أن بعض ممارسات اليوغا قد تساعد بدرجة بسيطة في بعض أنواع الألم المزمن مثل ألم أسفل الظهر.",
                    "تشير NCCIH إلى أن اليوغا قد تعطي فائدة طفيفة في الألم والوظيفة في بعض حالات ألم الظهر المزمن. لذلك يمكن ذكر تمارين تمدد لطيفة أو يوغا بسيطة جدًا كخيار تكميلي، بشرط ألا تزيد الألم.",
                    "قد يكون مناسبًا إذا كانت الشكوى مزمنة أو متكررة وخفيفة إلى متوسطة، خاصة في الشد العضلي أو ألم الظهر غير الحاد.",
                    "إذا كان هناك ألم حاد جدًا، ضعف، خدر، دوخة، أو اشتباه بضغط عصبي واضح، فلا ينبغي بدء تمارين ذاتية بدل التقييم الطبي.",
                    "أي حركة تزيد الألم بوضوح تعتبر إشارة للتوقف.",
                ),
                self._integrative_entry(
                    "رياضة وحركة",
                    "المشي الخفيف أو السباحة الخفيفة",
                    "بعض الحركة المنظمة قد تكون أفضل من الجمود الكامل في بعض حالات الألم العضلي المزمن.",
                    "السباحة أو التمارين المائية قد تكون مريحة لأن الماء يقلل الحمل على المفاصل ويريح العضلات.",
                    "قد يكون مناسبًا في الشكاوى الخفيفة أو المتوسطة المزمنة نسبيًا.",
                    "إذا كانت الحركة نفسها تثير الألم بشدة أو هناك ضعف وخدر، فلا يُنصح بها.",
                    "السباحة ليست علاجًا مباشرًا للسبب لكنها قد تكون حركة لطيفة.",
                ),
                self._integrative_entry(
                    "علاج يدوي",
                    "التدليك اللطيف",
                    "التدليك يُستخدم على نطاق واسع كخيار تكميلي لتخفيف الشد العضلي والشعور بالتيبس.",
                    "قد يساعد التدليك اللطيف بعض الأشخاص على تقليل الإحساس بالتوتر العضلي وتحسين الإحساس بالراحة العامة، خاصة عندما يكون الألم عضليًا أكثر من كونه عصبيًا أو التهابيًا حادًا.",
                    "قد يكون مناسبًا في الشد العضلي أو التيبس الخفيف إذا لم تكن هناك علامات عصبية أو إصابة حادة.",
                    "إذا كان الألم عميقًا جدًا، أو كان هناك تورم واضح، أو حرارة موضعية، أو إصابة حديثة، أو ألم عصبي يمتد مع خدر، فلا يكون التدليك الذاتي خيارًا مناسبًا.",
                    "التدليك اللطيف ليس بديلًا عن تشخيص سبب الألم.",
                ),
                self._integrative_entry(
                    "حجامة",
                    "الحجامة بحذر شديد",
                    "الحجامة من أكثر أشكال الطب التكميلي شيوعًا في منطقتنا، لذلك قد يسأل عنها المريض.",
                    "هناك بعض الأبحاث على الحجامة للألم، لكن جودة الدليل ليست قوية بما يكفي لجعلها خيارًا أساسيًا.",
                    "إذا ذُكرت، فينبغي أن تكون فقط كخيار منخفض الدليل لبعض آلام العضلات المزمنة غير العاجلة.",
                    "لا أوصي بعرضها كحل روتيني في الحالات الحادة أو عند وجود اضطرابات نزف أو أعراض عصبية.",
                    "اذكرها كخيار منخفض الدليل يحتاج مختصًا مرخّصًا، لا كعلاج افتراضي.",
                ),
            ])
        elif specialty == "طب الاعصاب":
            entries.extend([
                self._integrative_entry(
                    "راحة وبيئة",
                    "الراحة في مكان هادئ وتقليل الضوء",
                    "بعض الصداع قد يزداد مع الضوضاء والضوء القوي.",
                    "تقليل المحفزات الحسية قد يساعد على تهدئة بعض أنواع الصداع البسيط أو الصداع المرتبط بالشد.",
                    "قد يكون مناسبًا في الصداع الخفيف أو المتوسط من دون علامات عصبية خطرة.",
                    general_warning,
                    "هذه بيئة داعمة فقط، وليست علاجًا لسبب عصبي مهم.",
                ),
                self._integrative_entry(
                    "نمط حياة",
                    "شرب السوائل وتنظيم النوم",
                    "الجفاف وقلة النوم من العوامل التي قد تزيد بعض الشكاوى العصبية البسيطة مثل الصداع والتعب.",
                    "الحفاظ على سوائل كافية وتنظيم النوم قد يقللان من بعض المثيرات العامة للصداع أو الشعور بالإرهاق.",
                    "قد يكون مناسبًا إذا لم تكن هناك علامات عصبية مقلقة وكانت الشكوى أقرب إلى صداع بسيط أو تعب عام.",
                    "إذا كان الصداع جديدًا وشديدًا جدًا أو ترافق مع أعراض عصبية، فلا ينبغي تأخير التقييم الطبي.",
                    "هذا دعم عام للجسم، وليس علاجًا نوعيًا لحالة عصبية.",
                ),
                self._integrative_entry(
                    "تنفس واسترخاء",
                    "التنفس البطيء وتمارين الاسترخاء",
                    "التوتر قد يزيد بعض أنواع الصداع والشد العصبي، لذلك قد يكون التنفس البطيء والاسترخاء منطقيين كخيار مساعد.",
                    "تشير NCCIH إلى أن تقنيات الاسترخاء والتنفس البطيء قد تساعد في إحداث استجابة استرخاء تتميز ببطء التنفس وخفض التوتر العام. وقد يكون هذا مفيدًا في الصداع المرتبط بالشد أو القلق عند بعض الأشخاص.",
                    "قد يكون مناسبًا عندما تبدو الأعراض مرتبطة بالتوتر أو الشد النفسي، ومن دون علامات عصبية خطرة.",
                    "لا يُستخدم بدل التقييم إذا كانت هناك أعراض عصبية واضحة أو جديدة أو شديدة.",
                    "يمكن ذكره كخيار آمن نسبيًا وقليل الخطورة.",
                ),
                self._integrative_entry(
                    "زيوت وعلاج عطري",
                    "اللافندر أو تهدئة حسية خفيفة",
                    "بعض الناس يستخدمون اللافندر كخيار عطري مهدئ عندما يكون الصداع أو الانزعاج العصبي مترافقًا مع توتر.",
                    "قد يساعد كعامل تهدئة نفسي عند بعض الناس، لكنه ليس علاجًا عصبيًا مباشرًا.",
                    "قد يكون مناسبًا عندما يكون التوتر عنصرًا واضحًا في الأعراض.",
                    "لا يُستخدم بدل التقييم في الصداع الشديد أو الضعف أو اضطراب الرؤية أو الكلام.",
                    "هذا خيار تهدئة، لا علاج عصبي.",
                ),
                self._integrative_entry(
                    "علاج بالطاقة",
                    "العلاج بالطاقة أو الريكي مع تحفظ شديد",
                    "بعض المستخدمين يسألون عن الريكي أو العلاج بالطاقة، لذلك يمكن ذكره بصياغة مسؤولة بدل تجاهله تمامًا.",
                    "إذا ذُكر، فيجب وصفه كخيار استرخاء شخصي قد يجده بعض الناس مريحًا نفسيًا، لا كخيار مثبت لعلاج مرض عصبي عضوي. الدليل على فائدته لحالات عصبية محددة محدود جدًا.",
                    "قد يُذكر فقط إذا كان الهدف تهدئة التوتر أو تحسين الإحساس العام بالراحة النفسية في حالة غير عاجلة.",
                    "لا ينبغي طرحه كخيار لعلاج ضعف، خدر، دوخة عصبية شديدة، اضطراب كلام، أو أعراض عصبية حادة.",
                    "إذا استخدمته في الموقع، فاستخدمه تحت بند الراحة النفسية مع تنبيه صريح إلى محدودية الدليل.",
                ),
            ])
        elif specialty == "أمراض القلب":
            entries.extend([
                self._integrative_entry(
                    "راحة",
                    "الراحة وتقليل الجهد فورًا",
                    "في الأعراض التي قد تكون مرتبطة بالقلب حتى لو بدت غير شديدة، فإن تقليل الجهد أهم من أي وصفة بديلة.",
                    "الراحة تقلل الطلب البدني على القلب مؤقتًا وقد تساعد على منع زيادة الأعراض إلى حين الحصول على التقييم المناسب.",
                    "قد يكون مناسبًا فقط كإجراء مؤقت جدًا إذا كانت الأعراض خفيفة وغير مصحوبة بإنذارات.",
                    "إذا كان هناك ألم صدر واضح أو ضيق نفس أو تعرق أو دوخة، فلا ينبغي الاعتماد على أي طب بديل بدل التقييم الطبي العاجل.",
                    "في التخصصات القلبية يجب أن يكون التركيز على السلامة أكثر من الطب البديل.",
                ),
                self._integrative_entry(
                    "تنفس واسترخاء",
                    "التنفس البطيء والتهدئة إذا كان التوتر جزءًا من الشكوى",
                    "بعض الخفقان أو الشعور بالانزعاج قد يزداد مع القلق، وهنا قد يكون التنفس البطيء خيارًا مساعدًا على التهدئة.",
                    "تقنيات الاسترخاء قد تساعد في خفض التوتر العام وبطء التنفس، لكنها لا تعالج سببًا قلبيًا عضويًا.",
                    "قد يُذكر هذا فقط إذا كانت الأعراض خفيفة وكان التوتر واضحًا كعامل مصاحب، ومن دون إنذارات قلبية.",
                    "لا يُستخدم أبدًا لتأخير التقييم في ألم الصدر أو ضيق النفس أو الأعراض القلبية المقلقة.",
                    "هذا خيار تهدئة، وليس علاجًا قلبيًا.",
                ),
                self._integrative_entry(
                    "زيوت وعلاج عطري",
                    "اللافندر للاسترخاء فقط",
                    "قد يُذكر اللافندر عند وجود توتر واضح، وليس كعلاج للقلب نفسه.",
                    "بعض الدراسات تشير إلى احتمال فائدة في التهدئة والقلق، لذلك يمكن أن يكون خيارًا عطريًا بسيطًا للاسترخاء العام عند بعض الناس.",
                    "قد يُذكر فقط إذا كان الهدف تهدئة التوتر المصاحب وليس معالجة سبب قلبي.",
                    "لا يُذكر كعلاج بديل للقلب، ولا في الحالات العاجلة، ولا بدل مراجعة الطبيب.",
                    "في الموقع الاحترافي، يجب أن يبقى هذا النوع من الاقتراحات في الهامش لا في مركز القرار.",
                ),
            ])
        elif specialty == "الأمراض الجلدية":
            entries.extend([
                self._integrative_entry(
                    "عناية موضعية",
                    "كمادات باردة أو غسول لطيف غير معطر",
                    "في بعض حالات الحكة أو التهيج الجلدي البسيط قد تكون التهدئة الموضعية ألطف وأكثر فائدة من تجربة خلطات كثيرة.",
                    "البرودة اللطيفة أو الغسل بماء فاتر ومنظف غير معطر قد يخفف الإحساس بالتهيج أو الحكة ويقلل الرغبة في الحك.",
                    "قد يكون مناسبًا في التهيج الجلدي الخفيف أو الحكة البسيطة غير المصحوبة بتورم شديد أو ضيق نفس.",
                    "إذا كان هناك تورم سريع، ضيق نفس، انتشار شديد، قيح، حرارة موضعية ملحوظة، أو طفح بعد دواء جديد مع أعراض عامة، فلا ينبغي تأخير التقييم الطبي.",
                    "العناية اللطيفة بالجلد غالبًا أفضل من تجربة مواد كثيرة قد تزيد التهيج.",
                ),
                self._integrative_entry(
                    "زيوت وعناية جلدية",
                    "مرطب بسيط خالٍ من العطور بدل الزيوت المركزة",
                    "كثير من الناس يطلبون الزيوت مباشرة، لكن الجلد المتهيج قد يتأثر سلبًا بالمنتجات المعطرة أو المركزة.",
                    "المرطب الخالي من العطور قد يساعد على دعم الحاجز الجلدي وتقليل الجفاف الذي يزيد الحكة، بينما الزيوت العطرية المركزة قد تسبب تهيجًا إضافيًا.",
                    "قد يكون مناسبًا إذا كان العرض أقرب إلى جفاف أو تهيج بسيط غير عميق.",
                    "لا تُستخدم الزيوت العطرية مباشرة على الجلد المتهيج، ولا عند وجود جروح أو إفرازات أو حساسية معروفة.",
                    "في المشاكل الجلدية غالبًا البساطة في العناية أفضل من التعدد.",
                ),
            ])
        else:
            entries.extend([
                self._integrative_entry(
                    "راحة ونمط حياة",
                    "الراحة المنظمة وتنظيم النوم",
                    "كثير من الشكاوى العامة غير المحددة تزداد مع قلة النوم والإجهاد.",
                    "النوم الكافي والراحة المنظمة قد يساعدان الجسم على استعادة التوازن وتقليل تضخيم الإحساس بالأعراض البسيطة.",
                    "قد يكون مناسبًا في الشكاوى العامة الخفيفة غير العاجلة.",
                    general_warning,
                    "هذا من أكثر الخيارات أمانًا وواقعية.",
                ),
                self._integrative_entry(
                    "تغذية وسوائل",
                    "شرب السوائل وتنظيم الوجبات",
                    "في الأعراض العامة غير المحددة، قد يكون الجفاف أو عدم انتظام الأكل عاملًا مساعدًا في زيادة التعب والانزعاج.",
                    "السوائل والوجبات الخفيفة المتوازنة قد تدعم الاستقرار العام للطاقة والإحساس الجسدي.",
                    "قد يكون مناسبًا في التعب الخفيف أو الانزعاج العام غير المفسر بشكل واضح.",
                    "لا يغني عن التقييم إذا كانت الأعراض مستمرة أو تتفاقم أو مصحوبة بعلامات إنذارية.",
                    "هذا دعم عام، وليس علاجًا نوعيًا.",
                ),
                self._integrative_entry(
                    "تنفس واسترخاء",
                    "التنفس البطيء أو الاسترخاء الموجّه",
                    "يُستخدم كثيرًا كخيار تكميلي آمن نسبيًا عندما يكون التوتر جزءًا من الحالة.",
                    "قد يساعد في إحداث استجابة استرخاء تترافق مع بطء التنفس وانخفاض التوتر العام.",
                    "قد يكون مناسبًا في القلق أو التوتر أو الأعراض العامة التي تبدو متأثرة بالحالة النفسية.",
                    "لا ينبغي استخدامه لتأخير تقييم أي عرض مستمر أو شديد أو غير واضح.",
                    "الخيار هنا لتقليل التوتر لا لتشخيص السبب.",
                ),
                self._integrative_entry(
                    "حركة وهواء",
                    "المشي الخفيف أو الهواء النقي",
                    "المشي الهادئ أو الخروج إلى هواء مريح قد يساعد بعض الناس على تقليل التوتر والإحساس العام بالثقل الجسدي.",
                    "الحركة الخفيفة قد تحسن الإحساس العام بالمزاج والدورة الدموية، والهواء النقي قد يكون مريحًا نفسيًا في الشكاوى البسيطة.",
                    "قد يكون مناسبًا إذا كانت الأعراض خفيفة وكان الشخص يشعر أنه أفضل مع الحركة اللطيفة.",
                    "إذا كانت الحركة تزيد الأعراض أو تسبب دوخة أو ضيق نفس أو ألمًا واضحًا، فلا يُنصح بها.",
                    "المقصود حركة لطيفة لا مجهودًا بدنيًا.",
                ),
                self._integrative_entry(
                    "علاج بالطاقة",
                    "العلاج بالطاقة أو الممارسات التأملية مع تحفظ",
                    "لأن بعض المستخدمين يطلبون كل أنواع الطب التكميلي، يمكن ذكر هذه الممارسات لكن بصياغة مسؤولة جدًا.",
                    "إذا ذُكرت، فيجب وصفها كوسائل قد يجدها بعض الناس مريحة نفسيًا أو ذهنيًا، وليس كعلاج مثبت لمرض عضوي محدد. الدليل عليها متفاوت ومحدود في معظم الحالات.",
                    "قد تُذكر فقط في الحالات غير العاجلة جدًا عندما يكون المقصود الاسترخاء الذهني أو تحسين الإحساس العام بالهدوء.",
                    "لا تُستخدم بدل العلاج الطبي، ولا لتأخير تقييم أعراض مستمرة أو متفاقمة.",
                    "ذكرها بهذه الصياغة المهنية أفضل من تقديمها كعلاج فعّال مثبت.",
                ),
            ])

        rendered = [intro]
        for index, item in enumerate(entries, start=1):
            rendered.append(self._render_integrative_entry(item, index))

        if high_risk_mode:
            rendered.append(
                "الخلاصة العامة:\n"
                "في هذه الحالة تبقى الأولوية المهنية للمراجعة الطبية المباشرة، بينما تُعرض الخيارات التكاملية هنا كوسائل داعمة مؤقتة ومحدودة فقط، لا كبديل عن التقييم أو العلاج."
            )
        else:
            rendered.append(
                "الخلاصة العامة:\n"
                "يمكن ذكر الخيارات التكاملية كوسائل داعمة مؤقتة فقط، لكن لا ينبغي أن تُعرض على أنها بديل عن التشخيص أو العلاج الطبي."
            )
        rendered.append(
            "مراجع داعمة عامة:\n- " + "\n- ".join(self.integrative_sources)
        )
        return rendered
