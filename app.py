from __future__ import annotations

import json
import os
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from xml.sax.saxutils import escape as xml_escape

from medical_rag import MedicalConditionRAG
from triage_service import ArabicMedicalTriageSystem


ROOT = Path(__file__).resolve().parent
SYSTEM = ArabicMedicalTriageSystem()
CONDITION_RAG = MedicalConditionRAG(ROOT / "medical_rag_kb.json")
APP_VERSION = os.getenv("MEDIKA_APP_VERSION", "2026.05.02")
APP_ENV = os.getenv("APP_ENV", "development").strip() or "development"

AZURE_SPEECH_DEFAULT_VOICE_AR = "ar-LB-RamiNeural"
AZURE_SPEECH_DEFAULT_VOICE_EN = "en-US-JennyNeural"
AZURE_SPEECH_OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
DEFAULT_ALLOWED_ORIGINS = {
    "capacitor://localhost",
    "http://localhost",
    "http://127.0.0.1",
    "https://localhost",
    "https://127.0.0.1",
}


def normalize_lang(value):
    return "en" if str(value or "").strip().lower().startswith("en") else "ar"


def merge_message_with_context(message: str, attachment_context: str = "", profile_role: str = "") -> str:
    base = str(message or "").strip()
    context = str(attachment_context or "").strip()
    role = str(profile_role or "").strip().lower()
    parts = [base] if base else []

    if context:
        shortened = context[:900]
        parts.append(f"attachment context: {shortened}")

    if role in {"doctor", "patient"}:
        parts.append(f"profile role: {role}")

    return "\n".join(part for part in parts if part).strip()


SPECIALTY_EN = {
    "طب عام": "General Medicine",
    "جراحة العظام والمفاصل": "Orthopedics",
    "أمراض القلب": "Cardiology",
    "طب الاعصاب": "Neurology",
    "الجهاز الهضمي": "Gastroenterology",
    "الأمراض الجلدية": "Dermatology",
    "الباطنية": "Internal Medicine",
}

TIMING_EN = {
    "مراجعة اليوم": "seek medical care today",
    "حجز موعد قريب": "book an appointment soon",
    "مراقبة قصيرة": "short monitoring",
}

VALUE_EN = {
    "نعم": "Yes",
    "لا": "No",
    "طفل": "Child",
    "بالغ": "Adult",
    "كبير سن": "Older adult",
    "ذكر": "Male",
    "أنثى": "Female",
    "جديدة": "New",
    "متكررة": "Recurring",
    "خفيفة": "Mild",
    "متوسطة": "Moderate",
    "شديدة": "Severe",
    "تتحسن": "Improving",
    "ثابتة": "Unchanged",
    "تزداد": "Getting worse",
    "منذ ساعات": "Since hours ago",
    "منذ يوم": "Since one day",
    "منذ أيام": "Since a few days",
    "غير مذكور": "Not mentioned",
    "-": "-",
}

RISK_AR = {
    "low": "منخفض",
    "medium": "متوسط",
    "high": "مرتفع",
    "urgent": "عاجل",
    "emergency": "طارئ",
    "non-urgent": "غير عاجل",
}

CONFIDENCE_BAND_AR = {
    "high confidence": "ثقة عالية",
    "moderate confidence": "ثقة متوسطة",
    "low confidence": "ثقة منخفضة",
}

CONFIDENCE_BAND_EN = {
    "high confidence": "High confidence",
    "moderate confidence": "Moderate confidence",
    "low confidence": "Low confidence",
}


QUESTION_EN = {
    "كم عمرك تقريبًا؟": "How old are you approximately?",
    "ما الجنس؟": "What is the sex?",
    "هل لديك أمراض مزمنة مثل السكري أو الضغط أو أمراض القلب؟": "Do you have chronic conditions such as diabetes, high blood pressure, or heart disease?",
    "هل تتناول أدوية حاليًا؟ إذا نعم، اذكرها باختصار.": "Are you taking any medications now? If yes, list them briefly.",
    "هل لديك حساسية من أدوية معينة؟": "Do you have allergies to any medications?",
    "هل لديك تاريخ مرضي سابق لنفس المشكلة أو مشكلة قريبة منها؟": "Do you have previous medical history of the same problem or a similar one?",
    "هل الحالة جديدة أم متكررة؟": "Is this a new problem or a recurring one?",
    "منذ متى بدأت الأعراض؟": "When did the symptoms start?",
    "كيف تصف شدة الأعراض؟": "How would you describe the symptom severity?",
    "إذا كان هناك ألم، كم درجته من 0 إلى 10؟": "If there is pain, how severe is it from 0 to 10?",
    "هل الأعراض تتحسن أم ثابتة أم تزداد؟": "Are the symptoms improving, staying the same, or getting worse?",
    "هل توجد حرارة أو حمى؟": "Is there fever or high temperature?",
    "هل يوجد قيء؟": "Is there any vomiting?",
    "هل توجد دوخة أو إغماء؟": "Is there dizziness or fainting?",
    "هل يوجد ضيق تنفس؟": "Is there shortness of breath?",
    "هل الألم يمتد إلى الذراع أو الفك أو الظهر؟": "Does the pain spread to the arm, jaw, or back?",
    "هل يوجد تعرّق بارد أو خفقان واضح؟": "Is there cold sweating or clear palpitations?",
    "هل يوجد غثيان أو انتفاخ أو حرقة أو تغيّر واضح في التبرز؟": "Is there nausea, bloating, heartburn, or a clear change in bowel habits?",
    "هل توجد ملاحظة مهمة إضافية تود ذكرها للطبيب؟": "Is there any additional important note you want the doctor to know?",
}


def en_value(value):
    text = str(value or "-")
    return SPECIALTY_EN.get(text) or TIMING_EN.get(text) or VALUE_EN.get(text) or text


def en_question(question):
    return QUESTION_EN.get(question, question)


def localize_risk_level(value, lang: str) -> str:
    text = str(value or "-").strip()
    if lang == "en":
        return text.capitalize() if text.lower() in RISK_AR else text
    return RISK_AR.get(text.lower(), text)


def localize_confidence_band(value, lang: str) -> str:
    text = str(value or "-").strip()
    if not text or text == "-":
        return "-"
    lowered = text.lower()
    if lang == "en":
        return CONFIDENCE_BAND_EN.get(lowered, text.title())
    return CONFIDENCE_BAND_AR.get(lowered, text)


def build_timing_sentence_value(value: str, lang: str) -> str:
    text = str(value or "-").strip()
    if lang == "en":
        mapping = {
            "مراجعة اليوم": "to seek medical care today",
            "حجز موعد قريب": "to book a medical appointment soon",
            "مراقبة قصيرة": "to do short monitoring and reassess if symptoms change",
        }
        return mapping.get(text, f"to {en_value(text)}")

    mapping = {
        "مراجعة اليوم": "أن تتم المراجعة الطبية اليوم",
        "حجز موعد قريب": "حجز موعد طبي قريب",
        "مراقبة قصيرة": "مراقبة قصيرة مع إعادة التقييم إذا تغيرت الأعراض",
    }
    return mapping.get(text, text)


def normalize_condition_text(text: str) -> str:
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
    text = re.sub(r"[^\u0600-\u06FF0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def text_has_any(text: str, *terms: str) -> bool:
    return any(term in text for term in terms)


def append_unique(items: list[str], value: str) -> None:
    if value and value not in items:
        items.append(value)


def answer_is_truthy(answer: str) -> bool:
    normalized = normalize_condition_text(answer)
    return any(term in normalized for term in ["نعم", "ايوه", "أيوه", "yes", "true", "موجود", "يوجد"])


QA_YES_NO_HINTS = {
    "fever": "يوجد حرارة أو حمى",
    "vomiting": "يوجد قيء",
    "dizziness": "يوجد دوخة أو اغماء",
    "shortness_breath": "يوجد ضيق تنفس",
    "radiation": "الالم يمتد الى الذراع او الفك او الظهر",
    "sweating": "يوجد تعرق بارد او خفقان واضح",
    "movement_pain": "الالم يزداد مع الحركة",
    "numbness": "يوجد تنميل او خدر",
    "weakness": "يوجد ضعف في الطرف",
    "vision_neuro": "يوجد اعراض بصرية او عصبية مرافقة",
    "gi_symptoms": "توجد اعراض هضمية مرافقة",
    "skin_trigger": "بدا الطفح او الحكة بعد دواء او طعام او مادة معينة",
    "chronic_disease": "يوجد امراض مزمنة",
    "prior_history": "يوجد تاريخ مرضي سابق لنفس المشكلة",
    "drug_allergy": "يوجد حساسية من ادوية",
}

QA_FREE_TEXT_HINTS = {
    "age_group": "الفئة العمرية",
    "sex": "الجنس",
    "new_or_recurrent": "الحالة",
    "duration": "المدة",
    "severity": "الشدة",
    "pain_score": "درجة الالم",
    "trend": "مسار الاعراض",
    "current_medications": "الادوية الحالية",
    "open_note": "ملاحظة اضافية",
}


def build_case_signal_text(
    complaint: str,
    prediction: dict | None = None,
    qa_pairs: list[dict] | None = None,
) -> str:
    parts: list[str] = [str(complaint or "").strip()]
    extracted = (prediction or {}).get("extracted") or {}
    if extracted.get("clean_text"):
        append_unique(parts, str(extracted.get("clean_text")))
    for label in extracted.get("body_parts") or []:
        append_unique(parts, str(label))
    for label in extracted.get("associated_symptoms") or []:
        append_unique(parts, str(label))
    for label in extracted.get("red_flags") or []:
        append_unique(parts, str(label))

    for pair in qa_pairs or []:
        answer_id = str(pair.get("id", "")).strip()
        answer_text = str(pair.get("answer", "")).strip()
        if not answer_id or not answer_text:
            continue
        if answer_id in QA_YES_NO_HINTS and answer_is_truthy(answer_text):
            append_unique(parts, QA_YES_NO_HINTS[answer_id])
            continue
        if answer_id in QA_FREE_TEXT_HINTS:
            append_unique(parts, f"{QA_FREE_TEXT_HINTS[answer_id]} {answer_text}")

    return normalize_condition_text(" ".join(part for part in parts if part))


def build_rag_query_text(complaint: str, qa_pairs: list[dict] | None = None, prediction: dict | None = None) -> str:
    parts: list[str] = [str(complaint or "").strip()]
    if prediction:
        extracted = prediction.get("extracted") or {}
        for label in extracted.get("body_parts") or []:
            append_unique(parts, str(label))
        for label in extracted.get("associated_symptoms") or []:
            append_unique(parts, str(label))
        for label in extracted.get("red_flags") or []:
            append_unique(parts, str(label))

    if not qa_pairs:
        return " | ".join(part for part in parts if part)

    for pair in qa_pairs:
        answer_id = str(pair.get("id", "")).strip()
        answer_text = str(pair.get("answer", "")).strip()
        if not answer_id or not answer_text:
            continue
        if answer_id in QA_YES_NO_HINTS and answer_is_truthy(answer_text):
            append_unique(parts, QA_YES_NO_HINTS[answer_id])
            continue
        if answer_id in QA_FREE_TEXT_HINTS:
            append_unique(parts, f"{QA_FREE_TEXT_HINTS[answer_id]}: {answer_text}")

    return " | ".join(part for part in parts if part)


def merge_condition_notes(*notes: str | None) -> str | None:
    cleaned = [str(note).strip() for note in notes if str(note or "").strip()]
    if not cleaned:
        return None
    return "\n\n".join(dict.fromkeys(cleaned))


def build_rag_confidence_note(confidence: str, lang: str) -> str | None:
    if confidence != "weak":
        return None
    if lang == "en":
        return "These possibilities are still broad and may change after more details or direct medical evaluation."
    return "هذه الاحتمالات ما تزال عامة، وقد تتغير بعد تفاصيل إضافية أو بعد التقييم الطبي المباشر."


def build_prediction_confidence_note(prediction: dict | None, lang: str) -> str | None:
    prediction = prediction or {}
    score = float(prediction.get("final_confidence", 0) or 0)
    is_uncertain = bool(prediction.get("is_uncertain"))
    top_specialty = str(prediction.get("final_label", "")).strip()
    second_specialty = str(prediction.get("second_label", "")).strip()

    if not is_uncertain and score >= 0.75:
        return None

    top_label = en_value(top_specialty) if lang == "en" else top_specialty
    second_label = en_value(second_specialty) if lang == "en" else second_specialty
    has_second = bool(second_label and second_label != top_label)

    if lang == "en":
        if is_uncertain and has_second:
            return (
                f"The current signal is still limited, so {top_label} remains the leading direction for now, "
                f"while {second_label} also stays relatively close and may still need clinical confirmation."
            )
        if is_uncertain:
            return "The current signal is still limited, so this ranking remains provisional until direct medical confirmation."
        return "The answers made the picture clearer, but direct medical confirmation is still important before treating this as a fixed conclusion."

    if is_uncertain and has_second:
        return (
            f"ما تزال الإشارات الحالية محدودة نسبيًا، لذلك يبقى {top_label} هو الاتجاه الأقرب حاليًا، "
            f"مع بقاء {second_label} ضمن البدائل القريبة التي قد تحتاج تثبيتًا سريريًا مباشرًا."
        )
    if is_uncertain:
        return "ما تزال الإشارات الحالية محدودة نسبيًا، لذلك يبقى هذا الترجيح مبدئيًا إلى أن يثبته التقييم الطبي المباشر."
    return "الإجابات جعلت الصورة أوضح، لكن يبقى التثبيت الطبي المباشر مهمًا قبل التعامل مع النتيجة كاستنتاج نهائي."


def get_azure_speech_config(lang: str) -> dict[str, str]:
    normalized_lang = normalize_lang(lang)
    voice = (
        os.getenv("AZURE_SPEECH_VOICE_EN", "").strip() or AZURE_SPEECH_DEFAULT_VOICE_EN
        if normalized_lang == "en"
        else os.getenv("AZURE_SPEECH_VOICE_AR", "").strip() or AZURE_SPEECH_DEFAULT_VOICE_AR
    )
    return {
        "key": os.getenv("AZURE_SPEECH_KEY", "").strip(),
        "region": os.getenv("AZURE_SPEECH_REGION", "").strip(),
        "voice": voice,
        "lang": "en-US" if normalized_lang == "en" else "ar-LB",
    }


def build_azure_speech_ssml(text: str, lang: str, voice: str) -> str:
    locale = "en-US" if normalize_lang(lang) == "en" else "ar-LB"
    return (
        f"<speak version='1.0' xml:lang='{locale}'>"
        f"<voice xml:lang='{locale}' name='{voice}'>"
        f"{xml_escape(str(text or '').strip())}"
        f"</voice></speak>"
    )


def synthesize_azure_speech(text: str, lang: str) -> tuple[bytes | None, str | None, str | None]:
    config = get_azure_speech_config(lang)
    if not config["key"] or not config["region"]:
        return None, None, "Azure Speech is not configured."

    clean_text = str(text or "").strip()
    if not clean_text:
        return None, None, "Text is required."

    endpoint = f"https://{config['region']}.tts.speech.microsoft.com/cognitiveservices/v1"
    body = build_azure_speech_ssml(clean_text, config["lang"], config["voice"]).encode("utf-8")
    request = Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Ocp-Apim-Subscription-Key": config["key"],
            "Content-Type": "application/ssml+xml",
            "X-Microsoft-OutputFormat": AZURE_SPEECH_OUTPUT_FORMAT,
            "User-Agent": "MedikaAI",
        },
    )

    try:
        with urlopen(request, timeout=20) as response:
            return response.read(), response.headers.get_content_type() or "audio/mpeg", None
    except HTTPError as exc:
        details = exc.read().decode("utf-8", errors="ignore")
        return None, None, details or f"Azure Speech request failed with status {exc.code}."
    except URLError as exc:
        return None, None, str(exc.reason)


def prioritize_retrieved_conditions(
    results,
    specialty: str,
    *,
    has_upper_abdomen: bool = False,
    has_burning: bool = False,
    has_bloating: bool = False,
    has_colon_pattern: bool = False,
    has_food_trigger: bool = False,
    has_nausea: bool = False,
    has_right_side: bool = False,
    has_palpitations: bool = False,
    has_chest_pain: bool = False,
    has_short_breath: bool = False,
    has_sweating: bool = False,
    has_spread: bool = False,
    has_headache: bool = False,
    has_visual: bool = False,
    has_light_sound: bool = False,
    has_dizziness: bool = False,
    has_numbness: bool = False,
    has_weakness: bool = False,
    has_injury: bool = False,
    has_joint_location: bool = False,
    has_back_neck: bool = False,
    has_swelling: bool = False,
    has_heel: bool = False,
    has_skin_trigger: bool = False,
    has_itching: bool = False,
    has_rash: bool = False,
    has_fungal_pattern: bool = False,
    has_hives_pattern: bool = False,
    has_fatigue: bool = False,
    has_diabetes_pattern: bool = False,
    has_thyroid_pattern: bool = False,
    has_pressure_pattern: bool = False,
    has_urinary_pattern: bool = False,
    has_fever: bool = False,
):
    priority_ids: list[str] = []

    if specialty == "أمراض القلب":
        if has_chest_pain and (has_short_breath or has_sweating or has_spread):
            priority_ids = ["cardio_angina", "cardio_arrhythmia", "cardio_reflux_mimic", "cardio_chest_wall", "cardio_bp"]
        elif has_chest_pain:
            priority_ids = ["cardio_angina", "cardio_reflux_mimic", "cardio_chest_wall", "cardio_arrhythmia", "cardio_bp"]
        elif has_palpitations:
            priority_ids = ["cardio_arrhythmia", "cardio_bp", "cardio_angina", "cardio_reflux_mimic", "cardio_chest_wall"]
    elif specialty == "الجهاز الهضمي":
        if has_right_side and has_food_trigger:
            priority_ids = ["gi_biliary", "gi_gastritis", "gi_gastroenteritis", "gi_ibs", "gi_reflux"]
        elif has_burning:
            priority_ids = ["gi_reflux", "gi_gastritis", "gi_ibs", "gi_gastroenteritis", "gi_biliary"]
        elif has_colon_pattern or has_bloating:
            priority_ids = ["gi_ibs", "gi_gastroenteritis", "gi_gastritis", "gi_reflux", "gi_biliary"]
        elif has_upper_abdomen or has_food_trigger:
            priority_ids = ["gi_gastritis", "gi_reflux", "gi_gastroenteritis", "gi_ibs", "gi_biliary"]
    elif specialty == "طب الاعصاب":
        if has_numbness or has_weakness:
            priority_ids = ["neuro_nerve", "neuro_vestibular", "neuro_tension", "neuro_migraine", "neuro_visual_sinus"]
        elif has_headache and (has_visual or has_light_sound or has_nausea):
            priority_ids = ["neuro_migraine", "neuro_tension", "neuro_visual_sinus", "neuro_vestibular", "neuro_nerve"]
        elif has_dizziness:
            priority_ids = ["neuro_vestibular", "neuro_nerve", "neuro_tension", "neuro_migraine", "neuro_visual_sinus"]
    elif specialty == "جراحة العظام والمفاصل":
        if has_injury:
            priority_ids = ["ortho_sprain_fracture", "ortho_radiculopathy", "ortho_tendon_joint", "ortho_disc", "ortho_heel"]
        elif has_numbness or has_weakness or has_spread:
            priority_ids = ["ortho_radiculopathy", "ortho_disc", "ortho_tendon_joint", "ortho_sprain_fracture", "ortho_heel"]
        elif has_back_neck:
            priority_ids = ["ortho_disc", "ortho_radiculopathy", "ortho_tendon_joint", "ortho_sprain_fracture", "ortho_heel"]
        elif has_joint_location:
            priority_ids = ["ortho_tendon_joint", "ortho_sprain_fracture", "ortho_disc", "ortho_radiculopathy", "ortho_heel"]
    elif specialty == "الأمراض الجلدية":
        if has_hives_pattern:
            priority_ids = ["skin_hives", "skin_contact", "skin_infection", "skin_eczema", "skin_fungal"]
        elif has_skin_trigger:
            priority_ids = ["skin_contact", "skin_hives", "skin_eczema", "skin_infection", "skin_fungal"]
        elif has_fungal_pattern:
            priority_ids = ["skin_fungal", "skin_eczema", "skin_contact", "skin_infection", "skin_hives"]
        elif has_rash and has_itching:
            priority_ids = ["skin_hives", "skin_eczema", "skin_contact", "skin_infection", "skin_fungal"]
    elif specialty == "الباطنية":
        if has_diabetes_pattern:
            priority_ids = ["internal_diabetes", "internal_anemia", "internal_systemic_infection", "internal_dehydration", "internal_thyroid"]
        elif has_thyroid_pattern:
            priority_ids = ["internal_thyroid", "internal_anemia", "internal_dehydration", "internal_diabetes", "internal_systemic_infection"]
        elif has_urinary_pattern:
            priority_ids = ["internal_urinary", "internal_systemic_infection", "internal_dehydration", "internal_anemia", "internal_diabetes"]
        elif has_fatigue or has_dizziness:
            priority_ids = ["internal_anemia", "internal_dehydration", "internal_systemic_infection", "internal_diabetes", "internal_thyroid"]
        elif has_fever:
            priority_ids = ["internal_systemic_infection", "internal_anemia", "internal_dehydration", "internal_diabetes", "internal_thyroid"]

    if not priority_ids:
        return list(results)

    priority_order = {entry_id: index for index, entry_id in enumerate(priority_ids)}
    return sorted(
        results,
        key=lambda item: (
            priority_order.get(item.entry.entry_id, len(priority_ids)),
            -item.score,
            item.entry.condition_ar,
        ),
    )


def filter_retrieved_conditions(
    results,
    specialty: str,
    *,
    has_upper_abdomen: bool = False,
    has_burning: bool = False,
    has_bloating: bool = False,
    has_colon_pattern: bool = False,
    has_food_trigger: bool = False,
    has_nausea: bool = False,
    has_right_side: bool = False,
    has_palpitations: bool = False,
    has_chest_pain: bool = False,
    has_short_breath: bool = False,
    has_sweating: bool = False,
    has_spread: bool = False,
    has_movement_pain: bool = False,
    has_headache: bool = False,
    has_visual: bool = False,
    has_light_sound: bool = False,
    has_dizziness: bool = False,
    has_numbness: bool = False,
    has_weakness: bool = False,
    has_sinus_eye: bool = False,
    has_injury: bool = False,
    has_joint_location: bool = False,
    has_back_neck: bool = False,
    has_swelling: bool = False,
    has_heel: bool = False,
    has_skin_trigger: bool = False,
    has_itching: bool = False,
    has_rash: bool = False,
    has_dry_scaly: bool = False,
    has_fungal_pattern: bool = False,
    has_hives_pattern: bool = False,
    has_fatigue: bool = False,
    has_diabetes_pattern: bool = False,
    has_thyroid_pattern: bool = False,
    has_pressure_pattern: bool = False,
    has_urinary_pattern: bool = False,
    has_fever: bool = False,
    has_vomiting: bool = False,
):
    filtered = []
    for result in results:
        entry_id = result.entry.entry_id
        keep = True

        if specialty == "أمراض القلب":
            if entry_id == "cardio_angina" and not has_chest_pain:
                keep = False
            elif entry_id == "cardio_arrhythmia" and not has_palpitations:
                keep = False
            elif entry_id == "cardio_reflux_mimic" and not (has_burning or has_upper_abdomen or has_food_trigger):
                keep = False
            elif entry_id == "cardio_chest_wall" and not has_movement_pain:
                keep = False
            elif entry_id == "cardio_bp" and not (has_pressure_pattern or has_palpitations or has_dizziness or has_headache):
                keep = False
        elif specialty == "الجهاز الهضمي":
            if entry_id == "gi_reflux" and not has_burning:
                keep = False
            elif entry_id == "gi_biliary" and not (has_right_side and has_food_trigger):
                keep = False
            elif entry_id == "gi_ibs" and not (has_colon_pattern or has_bloating):
                keep = False
        elif specialty == "طب الاعصاب":
            if entry_id == "neuro_migraine" and not (has_headache and (has_nausea or has_visual or has_light_sound)):
                keep = False
            elif entry_id == "neuro_vestibular" and not has_dizziness:
                keep = False
            elif entry_id == "neuro_nerve" and not (has_numbness or has_weakness):
                keep = False
            elif entry_id == "neuro_visual_sinus" and not (has_visual or has_sinus_eye):
                keep = False
        elif specialty == "جراحة العظام والمفاصل":
            if entry_id == "ortho_sprain_fracture" and not has_injury:
                keep = False
            elif entry_id == "ortho_tendon_joint" and not (has_joint_location and has_movement_pain):
                keep = False
            elif entry_id == "ortho_disc" and not has_back_neck:
                keep = False
            elif entry_id == "ortho_radiculopathy" and not (has_numbness or has_weakness or has_spread):
                keep = False
            elif entry_id == "ortho_heel" and not has_heel:
                keep = False
        elif specialty == "الأمراض الجلدية":
            if entry_id == "skin_contact" and not has_skin_trigger:
                keep = False
            elif entry_id == "skin_eczema" and not (has_itching and has_dry_scaly):
                keep = False
            elif entry_id == "skin_hives" and not has_hives_pattern:
                keep = False
            elif entry_id == "skin_fungal" and not has_fungal_pattern:
                keep = False
            elif entry_id == "skin_infection" and not (has_rash and has_fever):
                keep = False
        elif specialty == "الباطنية":
            if entry_id == "internal_anemia" and not (has_fatigue or has_dizziness):
                keep = False
            elif entry_id == "internal_systemic_infection" and not has_fever:
                keep = False
            elif entry_id == "internal_diabetes" and not has_diabetes_pattern:
                keep = False
            elif entry_id == "internal_thyroid" and not has_thyroid_pattern:
                keep = False
            elif entry_id == "internal_dehydration" and not (has_pressure_pattern or has_dizziness or has_vomiting or has_fever):
                keep = False
            elif entry_id == "internal_urinary" and not has_urinary_pattern:
                keep = False

        if keep:
            filtered.append(result)

    return filtered


def build_possible_condition_lines(
    complaint: str,
    prediction: dict,
    lang: str,
    qa_pairs: list[dict] | None = None,
    rag_query_text: str | None = None,
) -> tuple[list[str], str | None, bool]:
    specialty = prediction.get("final_label", "")
    extracted = prediction.get("extracted") or {}
    clean_text = build_case_signal_text(complaint, prediction=prediction, qa_pairs=qa_pairs)
    body_parts = set(extracted.get("body_parts") or [])
    conditions: list[str] = []
    note = None
    note_first = False

    def add(ar_text: str, en_text: str) -> None:
        append_unique(conditions, en_text if lang == "en" else ar_text)
    has_upper_abdomen = text_has_any(clean_text, "معده", "فم المعده", "اعلى البطن", "اعلي البطن")
    has_burning = text_has_any(clean_text, "حرقه", "حموضه", "ارتجاع")
    has_bloating = text_has_any(clean_text, "انتفاخ", "غازات")
    has_colon_pattern = text_has_any(clean_text, "مغص", "قولون", "امساك", "اسهال", "تبرز")
    has_food_trigger = text_has_any(clean_text, "بعد الاكل", "بعد الطعام", "اكل", "طعام", "دهني", "دسم")
    has_nausea = text_has_any(clean_text, "غثيان")
    has_vomiting = text_has_any(clean_text, "قيء", "استفراغ")
    has_fever = text_has_any(clean_text, "حراره", "حمى", "قشعريره")
    has_right_side = text_has_any(clean_text, "يمين", "الجهه اليمنى", "جهه اليمين", "جنب ايمن")

    has_palpitations = text_has_any(clean_text, "خفقان", "نبض", "تسارع", "رفرفه")
    has_chest_pain = text_has_any(clean_text, "صدر", "ضغط صدر", "ثقل", "كتمه", "وخز")
    has_short_breath = text_has_any(clean_text, "ضيق تنفس", "كتمه نفس")
    has_sweating = text_has_any(clean_text, "تعرق", "عرق")
    has_spread = text_has_any(clean_text, "يمتد", "ينتشر", "ذراع", "فك", "ظهر", "كتف")
    has_movement_pain = text_has_any(clean_text, "حركه", "عند الحركه", "مع الحركه", "لما اتحرك", "لما احرك")
    has_stress_or_caffeine = text_has_any(clean_text, "توتر", "قلق", "قهوه", "قهوة", "كافيين")

    has_headache = text_has_any(clean_text, "صداع", "راس", "شقيقه")
    has_visual = text_has_any(clean_text, "زغلله", "تشوش", "رؤيه", "رؤية", "عين")
    has_light_sound = text_has_any(clean_text, "ضوء", "صوت")
    has_dizziness = text_has_any(clean_text, "دوخه", "دوار", "توازن")
    has_numbness = text_has_any(clean_text, "تنميل", "خدر")
    has_weakness = text_has_any(clean_text, "ضعف", "رخاوه", "رخاوة")
    has_neck_tension = text_has_any(clean_text, "رقبه", "مؤخره", "مؤخرة", "شد", "توتر", "قله النوم", "اجهاد")
    has_sinus_eye = text_has_any(clean_text, "جيوب", "عين", "حول العين", "تشوش")

    has_injury = text_has_any(clean_text, "سقط", "وقع", "التواء", "التوى", "ضربه", "دكمه", "اصابه", "حادث", "كسر")
    has_joint_location = text_has_any(clean_text, "كتف", "ركبه", "مفصل", "ورك", "قدم", "يد", "رسغ", "ذراع")
    has_back_neck = text_has_any(clean_text, "ظهر", "رقبه", "رقبة", "فقرات", "اسفل الظهر")
    has_swelling = text_has_any(clean_text, "تورم", "انتفاخ", "ورم")
    has_heel = text_has_any(clean_text, "كعب", "اسفل القدم", "باطن القدم")

    has_skin_trigger = text_has_any(clean_text, "تحسس", "حساسيه", "دواء", "طعام", "صابون", "كريم", "ماده", "منظف")
    has_itching = text_has_any(clean_text, "حكه", "هرش")
    has_rash = text_has_any(clean_text, "طفح", "احمرار", "بقع")
    has_dry_scaly = text_has_any(clean_text, "جفاف", "قشور", "اكزيما")
    has_fungal_pattern = text_has_any(clean_text, "فطريات", "دائري", "بين الاصابع", "تقشر")
    has_hives_pattern = has_rash and has_itching and text_has_any(clean_text, "مفاجئ", "فجاه", "فجأة")

    has_fatigue = text_has_any(clean_text, "تعب", "خمول", "ضعف", "ارهاق", "إرهاق", "شحوب")
    has_diabetes_pattern = text_has_any(clean_text, "سكر", "عطش", "تبول", "رجفه", "رجفة")
    has_thyroid_pattern = text_has_any(clean_text, "غده", "غدة", "وزن", "برد", "حر", "خفقان")
    has_pressure_pattern = text_has_any(
        clean_text,
        "ضغط الدم",
        "ارتفاع الضغط",
        "هبوط الضغط",
        "الضغط مرتفع",
        "الضغط منخفض",
    )
    has_urinary_pattern = text_has_any(clean_text, "حرقان البول", "تبول", "بول", "خاصره", "خاصرة")
    has_respiratory_infection = text_has_any(clean_text, "سعال", "كحه", "كحة", "رشح", "التهاب حلق")
    has_face_speech_pattern = text_has_any(clean_text, "تلعثم", "كلام", "ميلان", "وجه", "فم")

    if specialty == "أمراض القلب" and has_chest_pain and (has_short_breath or has_sweating or has_spread):
        note = (
            "ألم الصدر قد يكون مرتبطًا بأسباب قلبية أو غير قلبية، لكن وجود ضيق نفس أو تعرّق أو امتداد الألم إلى الذراع أو الفك يجعل التقييم الطبي السريع أولوية."
            if lang != "en"
            else "Chest pain may have cardiac or non-cardiac causes, but shortness of breath, sweating, or pain spreading to the arm or jaw makes prompt medical evaluation a priority."
        )
        note_first = True
    elif specialty == "أمراض القلب" and has_chest_pain:
        note = (
            "ألم الصدر قد يكون قلبيًا أو غير قلبي، لذلك نرتب الاحتمالات بحذر ونبحث عن العلامات التي ترفع أولوية التقييم الطبي."
            if lang != "en"
            else "Chest pain may be cardiac or non-cardiac, so the possibilities should be ordered carefully while looking for features that raise the urgency of medical assessment."
        )
        note_first = True
    elif specialty == "طب الاعصاب" and (has_weakness or has_face_speech_pattern or (has_visual and has_dizziness)):
        note = (
            "الأعراض العصبية التي تشمل ضعفًا جديدًا أو اضطرابًا في الكلام أو تشوشًا مفاجئًا في الرؤية تحتاج عدم التأخير في التقييم الطبي."
            if lang != "en"
            else "Neurological symptoms that include new weakness, speech difficulty, or sudden visual disturbance should not be delayed for medical assessment."
        )
        note_first = True
    elif specialty == "جراحة العظام والمفاصل" and has_injury and (has_numbness or has_weakness):
        note = (
            "بعد الإصابة، وجود تنميل أو ضعف أو امتداد الألم للطرف يجعل الفحص الطبي المباشر أكثر أهمية."
            if lang != "en"
            else "After an injury, numbness, weakness, or pain radiating into a limb makes direct medical evaluation more important."
        )
        note_first = True

    rag_query = rag_query_text or build_rag_query_text(complaint, qa_pairs=qa_pairs, prediction=prediction)
    rag_summary = CONDITION_RAG.retrieve(rag_query, specialty, limit=4)
    filtered_results = filter_retrieved_conditions(
        rag_summary.results,
        specialty,
        has_upper_abdomen=has_upper_abdomen,
        has_burning=has_burning,
        has_bloating=has_bloating,
        has_colon_pattern=has_colon_pattern,
        has_food_trigger=has_food_trigger,
        has_nausea=has_nausea,
        has_right_side=has_right_side,
        has_palpitations=has_palpitations,
        has_chest_pain=has_chest_pain,
        has_short_breath=has_short_breath,
        has_sweating=has_sweating,
        has_spread=has_spread,
        has_headache=has_headache,
        has_visual=has_visual,
        has_light_sound=has_light_sound,
        has_dizziness=has_dizziness,
        has_numbness=has_numbness,
        has_weakness=has_weakness,
        has_injury=has_injury,
        has_joint_location=has_joint_location,
        has_back_neck=has_back_neck,
        has_swelling=has_swelling,
        has_heel=has_heel,
        has_skin_trigger=has_skin_trigger,
        has_itching=has_itching,
        has_rash=has_rash,
        has_dry_scaly=has_dry_scaly,
        has_fungal_pattern=has_fungal_pattern,
        has_hives_pattern=has_hives_pattern,
        has_fatigue=has_fatigue,
        has_diabetes_pattern=has_diabetes_pattern,
        has_thyroid_pattern=has_thyroid_pattern,
        has_pressure_pattern=has_pressure_pattern,
        has_urinary_pattern=has_urinary_pattern,
        has_fever=has_fever,
        has_vomiting=has_vomiting,
    )
    prioritized_results = prioritize_retrieved_conditions(
        filtered_results,
        specialty,
        has_upper_abdomen=has_upper_abdomen,
        has_burning=has_burning,
        has_bloating=has_bloating,
        has_colon_pattern=has_colon_pattern,
        has_food_trigger=has_food_trigger,
        has_nausea=has_nausea,
        has_right_side=has_right_side,
        has_palpitations=has_palpitations,
        has_chest_pain=has_chest_pain,
        has_short_breath=has_short_breath,
        has_sweating=has_sweating,
        has_spread=has_spread,
        has_headache=has_headache,
        has_visual=has_visual,
        has_light_sound=has_light_sound,
        has_dizziness=has_dizziness,
        has_numbness=has_numbness,
        has_weakness=has_weakness,
        has_injury=has_injury,
        has_joint_location=has_joint_location,
        has_back_neck=has_back_neck,
        has_swelling=has_swelling,
        has_heel=has_heel,
        has_skin_trigger=has_skin_trigger,
        has_itching=has_itching,
        has_rash=has_rash,
        has_fungal_pattern=has_fungal_pattern,
        has_hives_pattern=has_hives_pattern,
        has_fatigue=has_fatigue,
        has_diabetes_pattern=has_diabetes_pattern,
        has_thyroid_pattern=has_thyroid_pattern,
        has_pressure_pattern=has_pressure_pattern,
        has_urinary_pattern=has_urinary_pattern,
        has_fever=has_fever,
    )
    for result in prioritized_results:
        add(result.to_text("ar"), result.to_text("en"))

    use_rag_fillers_only = bool(prioritized_results and rag_summary.confidence in {"strong", "medium"})

    if use_rag_fillers_only and len(conditions) >= 3:
        return conditions[:5], merge_condition_notes(note, build_rag_confidence_note(rag_summary.confidence, lang)), note_first

    if rag_summary.results:
        note = merge_condition_notes(note, build_rag_confidence_note(rag_summary.confidence, lang))

    if not use_rag_fillers_only and specialty == "الجهاز الهضمي":
        if has_upper_abdomen or has_food_trigger:
            add(
                "التهاب المعدة أو عسر الهضم، خصوصًا إذا كان الألم أو الانزعاج في أعلى البطن أو يزداد بعد الأكل.",
                "Gastritis or indigestion, especially if the discomfort is in the upper abdomen or gets worse after meals.",
            )
        if has_burning:
            add(
                "ارتجاع مريئي أو حموضة، خاصة إذا كان هناك إحساس حارق يصعد للصدر أو الحلق أو يزداد بعد الطعام.",
                "Acid reflux or heartburn, especially if there is a burning sensation rising toward the chest or throat after food.",
            )
        if has_colon_pattern or has_bloating:
            add(
                "تشنج قولون أو قولون عصبي أو اضطراب معوي وظيفي، وهذا يصبح أقرب مع المغص والانتفاخ والغازات أو تغيّر التبرز.",
                "Bowel spasm, irritable bowel syndrome, or another functional gut disorder, especially when cramps, bloating, gas, or bowel changes are present.",
            )
        if has_nausea or has_vomiting or has_fever:
            add(
                "نزلة معوية أو تلبّك/تسمم غذائي، خصوصًا إذا ترافق الانزعاج مع غثيان أو قيء أو حرارة أو بعد وجبة مشتبه بها.",
                "Gastroenteritis or food-related irritation, especially when nausea, vomiting, fever, or symptoms after a suspicious meal are present.",
            )
        if has_right_side and has_food_trigger:
            add(
                "تهيّج في المرارة أو ألم مراري وظيفي قد يكون واردًا إذا كان الألم يميل لليمين أو يرتبط بالأكل الدسم.",
                "Gallbladder irritation or biliary-type pain can be considered if the pain leans to the right side or is triggered by fatty meals.",
            )
        if not conditions:
            add(
                "التهاب المعدة أو عسر الهضم، وهو من أكثر الاحتمالات شيوعًا عندما تكون الشكوى في المعدة أو أعلى البطن.",
                "Gastritis or indigestion, which is a common possibility when the complaint centers on the stomach or upper abdomen.",
            )
            add(
                "ارتجاع مريئي أو حموضة قد يفسّران الحرقة أو الانزعاج بعد الطعام.",
                "Acid reflux or heartburn may explain burning discomfort or symptoms after meals.",
            )
            add(
                "تشنج قولون أو اضطراب معوي وظيفي إذا كان العرض أقرب إلى المغص والانتفاخ وتغير الإخراج.",
                "Bowel spasm or a functional gut disorder if the complaint is more about cramps, bloating, and stool changes.",
            )

    elif not use_rag_fillers_only and specialty == "أمراض القلب":
        if has_palpitations:
            add(
                "خفقان أو اضطراب في نظم القلب، خاصة إذا كان الإحساس هو تسارع أو عدم انتظام واضح في النبض.",
                "Palpitations or a heart rhythm disturbance, especially if the main feeling is a fast or irregular heartbeat.",
            )
        if has_chest_pain:
            add(
                "ألم صدري يحتاج التفريق بين السبب القلبي وغيره، ويصبح أهم إذا كان الوصف ضغطًا أو ثقلًا في الصدر.",
                "Chest pain that needs differentiation between cardiac and non-cardiac causes, especially if it feels like pressure or heaviness.",
            )
        if has_chest_pain and (has_short_breath or has_sweating or has_spread):
            add(
                "نمط ألم صدري قد ينسجم مع ذبحة صدرية أو نقص تروية، ويُؤخذ بجدية أكبر عندما يترافق مع ضيق النفس أو التعرّق أو امتداد الألم للذراع أو الفك أو الظهر.",
                "A chest-pain pattern that may fit angina or ischemia, taken more seriously when it comes with shortness of breath, sweating, or pain spreading to the arm, jaw, or back.",
            )
        if has_burning or has_upper_abdomen:
            add(
                "حموضة أو ارتجاع قد يسبّبان ألمًا شبيهًا بألم الصدر، خصوصًا إذا ترافق العرض مع حرقة أو انزعاج بعد الأكل.",
                "Reflux or heartburn can mimic chest discomfort, especially when burning or post-meal symptoms are present.",
            )
        if has_movement_pain:
            add(
                "شد عضلي أو ألم من جدار الصدر قد يكون واردًا إذا كان الألم يزداد مع الحركة أو اللمس أو وضعية الجسم.",
                "Muscle strain or chest wall pain may fit if the pain worsens with movement, touch, or body position.",
            )
        if has_palpitations and has_stress_or_caffeine and not (has_short_breath or has_spread):
            add(
                "خفقان وظيفي مرتبط بالتوتر أو المنبهات قد يكون احتمالًا، لكن يحتاج استبعاد الأسباب القلبية أولًا إذا كانت الأعراض مزعجة أو متكررة.",
                "Functional palpitations related to stress or stimulants can be a possibility, though cardiac causes still need exclusion if symptoms are troublesome or recurrent.",
            )
        if not conditions:
            add(
                "خفقان أو اضطراب في نظم القلب إذا كان العرض الأساسي هو النبض السريع أو غير المنتظم.",
                "Palpitations or a rhythm disturbance if the main complaint is a fast or irregular heartbeat.",
            )
            add(
                "ألم صدري يحتاج تقييمًا قلبيًا إذا كان هناك ضغط أو ثقل أو انزعاج واضح في الصدر.",
                "Chest discomfort that may need cardiac evaluation if there is clear pressure, heaviness, or chest discomfort.",
            )
            add(
                "حموضة أو سبب غير قلبي مشابه يمكن أن يقلّد بعض أعراض الصدر.",
                "Reflux or another non-cardiac cause can sometimes mimic chest symptoms.",
            )

    elif not use_rag_fillers_only and specialty == "طب الاعصاب":
        if has_headache and (has_nausea or has_visual or has_light_sound):
            add(
                "شقيقة أو صداع نصفي، ويصبح هذا الاحتمال أقوى عندما يترافق الصداع مع غثيان أو زغللة أو حساسية للضوء والصوت.",
                "Migraine, especially when the headache is accompanied by nausea, visual disturbance, or sensitivity to light and sound.",
            )
        if has_headache and has_neck_tension:
            add(
                "صداع توتري أو صداع مرتبط بشد عضلي في الرقبة، خصوصًا إذا كان الألم مع التوتر أو قلة النوم أو شد مؤخرة الرأس والرقبة.",
                "Tension headache or a headache related to neck muscle strain, especially with stress, poor sleep, or tightness in the neck and back of the head.",
            )
        if has_dizziness:
            add(
                "دوار أو اضطراب دهليزي يحتاج التفريق، خاصة إذا كان العرض الأساسي هو الإحساس بالدوخة أو عدم التوازن.",
                "Dizziness or a vestibular balance-related problem, especially when the main issue is dizziness or imbalance.",
            )
        if has_numbness or has_weakness:
            add(
                "تهيّج عصب أو مشكلة عصبية تحتاج تقييمًا مباشرًا إذا كانت الأعراض تشمل تنميلًا أو ضعفًا جديدًا أو متفاقمًا.",
                "Nerve irritation or another neurological issue if the symptoms include new or worsening numbness or weakness.",
            )
        if has_sinus_eye:
            add(
                "إجهاد عين أو مشكلة بصرية أو حتى صداع مرتبط بالجيوب قد يرافق بعض حالات الصداع وتشوش الرؤية.",
                "Eye strain, a visual problem, or even a sinus-related headache can accompany some headache and blurred-vision patterns.",
            )
        if not conditions:
            add(
                "شقيقة أو صداع نصفي إذا كان الصداع واضحًا أو متكررًا أو مترافقًا مع غثيان أو زغللة.",
                "Migraine if the headache is clear, recurrent, or accompanied by nausea or visual symptoms.",
            )
            add(
                "صداع توتري إذا كان الوصف أقرب إلى شد أو ضغط في الرأس والرقبة.",
                "Tension headache if the pattern feels more like tightness or pressure in the head and neck.",
            )
            add(
                "دوار أو سبب عصبي يحتاج تفريقًا إذا كانت الشكوى الأساسية دوخة أو اختلال توازن.",
                "Dizziness or another neurological cause if the main complaint is vertigo or imbalance.",
            )

    elif not use_rag_fillers_only and specialty == "جراحة العظام والمفاصل":
        if has_injury:
            add(
                "التواء أو كدمة أو حتى كسر بحسب شدة الإصابة، ويقوى هذا الاحتمال إذا بدأت الأعراض بعد سقوط أو ضربة أو التواء واضح.",
                "A sprain, bruise, or even a fracture depending on severity, especially if symptoms began after a fall, blow, or twisting injury.",
            )
        if has_joint_location and has_movement_pain:
            add(
                "التهاب أوتار أو أربطة أو تهيّج في المفصل، خصوصًا إذا كان الألم في الكتف أو الركبة أو المفصل ويزداد مع الحركة.",
                "Tendon or ligament irritation, or a joint problem, especially when the pain is in the shoulder, knee, or another joint and worsens with movement.",
            )
        if has_back_neck:
            add(
                "شد عضلي أو تهيّج غضروف أو مشكلة في العمود الفقري، ويصبح هذا أقرب مع ألم الظهر أو الرقبة أو الفقرات.",
                "Muscle strain, disc irritation, or a spine-related problem, especially when the complaint centers on the back, neck, or spine.",
            )
        if has_numbness or has_weakness or has_spread:
            add(
                "ضغط على عصب أو انضغاط جذور عصبية إذا كان الألم يمتد للطرف أو يترافق مع تنميل أو خدر أو ضعف.",
                "Nerve compression or nerve-root irritation if the pain radiates into a limb or comes with numbness or weakness.",
            )
        if has_swelling:
            add(
                "التهاب مفصل أو تجمع سوائل بعد إصابة أو إجهاد، خاصة إذا كان هناك تورم واضح مع الألم.",
                "Joint inflammation or post-injury swelling, especially when visible swelling accompanies the pain.",
            )
        if has_heel:
            add(
                "التهاب اللفافة الأخمصية أو ألم الكعب الميكانيكي قد يكون احتمالًا إذا كان الوجع أسفل الكعب أو عند الوقوف والمشي.",
                "Plantar fasciitis or mechanical heel pain can be a possibility when the pain is under the heel or worse with standing and walking.",
            )
        if not conditions:
            add(
                "شد عضلي إذا كان الألم مرتبطًا بالحركة أو الجهد أو وضعية الجسم.",
                "Muscle strain if the pain seems linked to movement, effort, or body position.",
            )
            add(
                "التهاب أوتار أو أربطة إذا كان الألم موضّعًا حول مفصل أو طرف معين.",
                "Tendon or ligament irritation if the pain is localized around a joint or limb.",
            )
            add(
                "مشكلة في المفصل أو العمود الفقري إذا كانت الشكوى في الظهر أو الرقبة أو أحد الأطراف.",
                "A joint or spine-related problem if the complaint involves the back, neck, or one of the limbs.",
            )

    elif not use_rag_fillers_only and specialty == "الأمراض الجلدية":
        if has_skin_trigger:
            add(
                "تحسس جلدي أو التهاب جلد تماسي، خاصة إذا بدأت الأعراض بعد دواء جديد أو طعام أو صابون أو كريم أو مادة ملامسة للجلد.",
                "An allergic skin reaction or contact dermatitis, especially if symptoms began after a new medication, food, soap, cream, or another skin exposure.",
            )
        if has_itching and has_dry_scaly:
            add(
                "أكزيما أو التهاب جلدي تحسسي، ويصبح هذا أقرب عندما توجد حكة مع جفاف أو قشور أو تهيّج متكرر.",
                "Eczema or inflammatory dermatitis, especially when itching comes with dryness, scaling, or recurring irritation.",
            )
        if has_hives_pattern or (has_rash and has_itching):
            add(
                "شرى أو طفح تحسسي التهابي، خصوصًا إذا ظهر الطفح فجأة وكان مصحوبًا بحكة واضحة.",
                "Hives or an allergic inflammatory rash, especially if the rash appeared suddenly and is clearly itchy.",
            )
        if has_fungal_pattern:
            add(
                "فطريات سطحية في الجلد قد تكون احتمالًا إذا كان الطفح دائريًا أو متقشرًا أو موجودًا بين الأصابع.",
                "A superficial fungal skin infection can be considered if the rash is circular, scaly, or located between the toes or fingers.",
            )
        if not conditions:
            add(
                "تحسس جلدي أو التهاب جلد تماسي إذا كان هناك ارتباط واضح بمادة جديدة أو ملامسة مباشرة.",
                "An allergic skin reaction or contact dermatitis if there is a clear link to a new product or direct exposure.",
            )
            add(
                "أكزيما أو التهاب جلدي إذا كانت المشكلة أقرب إلى الحكة والجفاف والتهيج المتكرر.",
                "Eczema or inflammatory dermatitis if the pattern is more about itching, dryness, and recurrent irritation.",
            )
            add(
                "طفح جلدي التهابي أو فطريات سطحية بحسب شكل الجلد وتوزع الطفح.",
                "An inflammatory rash or superficial fungal infection depending on the skin pattern and distribution.",
            )

    elif not use_rag_fillers_only and specialty == "الباطنية":
        if has_fatigue and has_dizziness:
            add(
                "فقر دم أو نقص عناصر غذائية قد يكون احتمالًا إذا كان التعب مع دوخة أو ضعف أو شحوب هو العرض الأبرز.",
                "Anemia or a nutritional deficiency can be a possibility when fatigue is accompanied by dizziness, weakness, or pallor.",
            )
        if has_fever:
            add(
                "التهاب أو عدوى عامة تحتاج تقييمًا باطنيًا، خاصة إذا وُجدت حرارة أو قشعريرة أو شعور عام بالتعب.",
                "A systemic infection or inflammatory condition, especially when fever, chills, or generalized fatigue are present.",
            )
        if has_diabetes_pattern:
            add(
                "اضطراب في سكر الدم قد يكون واردًا إذا كانت الشكوى تتضمن عطشًا أو تبولًا متكررًا أو رجفة أو هبوطًا عامًا.",
                "A blood sugar problem can be considered if the complaint includes thirst, frequent urination, tremor, or a general crash feeling.",
            )
        if has_thyroid_pattern:
            add(
                "اضطراب في الغدة الدرقية أو الهرمونات قد يفسّر الخفقان أو تغير الوزن أو عدم تحمل الحر أو البرد مع الخمول.",
                "A thyroid or hormonal problem may explain palpitations, weight change, intolerance to heat or cold, or persistent sluggishness.",
            )
        if "بطن" in body_parts or has_upper_abdomen or has_bloating or has_nausea:
            add(
                "مشكلة هضمية أو قولونية ضمن نطاق الباطنية قد تكون احتمالًا عندما تكون الشكوى البطنية جزءًا من صورة أوسع.",
                "A digestive or bowel-related internal medicine issue may fit when abdominal symptoms are part of a broader internal-medicine picture.",
            )
        if has_pressure_pattern:
            add(
                "اضطراب ضغط الدم أو الجفاف قد يظهر على شكل صداع أو دوخة أو تعب عام، خصوصًا عند الوقوف أو مع قلة السوائل.",
                "Blood pressure changes or dehydration may present with headache, dizziness, or fatigue, especially on standing or with poor fluid intake.",
            )
        if has_urinary_pattern:
            add(
                "التهاب بولي أو مشكلة كلوية بسيطة قد يدخل في الاحتمال إذا كانت هناك أعراض بولية أو ألم في الخاصرة.",
                "A urinary infection or a mild kidney-related issue can be considered if urinary symptoms or flank pain are present.",
            )
        if not conditions:
            add(
                "التهاب أو عدوى عامة إذا كانت الصورة أقرب إلى تعب جسدي عام أو حرارة أو إرهاق غير مفسر.",
                "A systemic infection or inflammatory condition if the picture is more about generalized illness, fever, or unexplained fatigue.",
            )
            add(
                "فقر دم أو نقص عناصر غذائية إذا كان العرض الأساسي هو الخمول والدوخة والضعف العام.",
                "Anemia or a nutritional deficiency if the main pattern is low energy, dizziness, and generalized weakness.",
            )
            add(
                "اضطراب في السكر أو الضغط أو الغدة إذا كانت الأعراض منتشرة وغير محصورة بعضو واحد.",
                "A blood sugar, blood pressure, or thyroid-related issue if the symptoms are widespread rather than limited to one organ.",
            )

    elif not use_rag_fillers_only:
        if "بطن" in body_parts or has_upper_abdomen or has_bloating or has_nausea:
            add(
                "عسر هضم أو التهاب معدة أو نزلة معوية خفيفة قد تكون ضمن الاحتمالات إذا كانت الشكوى في البطن أو المعدة.",
                "Indigestion, gastritis, or a mild stomach bug may fit when the complaint is centered on the stomach or abdomen.",
            )
        if "راس" in body_parts or has_headache or has_dizziness:
            add(
                "صداع شائع أو إجهاد أو نقص سوائل قد يفسّر الأعراض إذا كانت الشكوى أقرب للرأس أو الدوخة.",
                "A common headache, fatigue, or dehydration may explain the symptoms when the complaint is more about the head or dizziness.",
            )
        if "صدر" in body_parts or has_chest_pain or has_palpitations:
            add(
                "شد عضلي أو حموضة أو سبب يحتاج فرزًا عامًا قبل تحديد التخصص الأدق، خصوصًا إذا لم تتضح الصورة من الشكوى الأولى.",
                "Muscle strain, reflux, or another cause that still needs general triage before narrowing the specialty, especially when the first complaint is still broad.",
            )
        if has_fever or has_respiratory_infection:
            add(
                "عدوى أو التهاب بسيط قد يكون احتمالًا إذا كانت هناك حرارة أو كحة أو رشح أو أعراض عامة.",
                "A mild infection or inflammation can be considered when fever, cough, cold symptoms, or general malaise are present.",
            )
        if has_fatigue or has_dizziness:
            add(
                "إجهاد عام أو جفاف أو انخفاض سكر أو فقر دم قد يفسّر التعب والدوخة والهبوط غير المحدد.",
                "General fatigue, dehydration, low blood sugar, or anemia may explain vague weakness, dizziness, or a run-down feeling.",
            )
        if not conditions:
            add(
                "التهاب أو عدوى بسيطة من الاحتمالات الشائعة عندما لا تكون الشكوى محصورة بعضو واحد بشكل واضح.",
                "A mild infection or inflammation is a common possibility when the complaint is not clearly limited to one organ system.",
            )
            add(
                "إجهاد عام أو نقص سوائل أو هبوط بسيط قد يفسّر الأعراض العامة وغير المحددة.",
                "General fatigue, dehydration, or a mild systemic dip can explain broad nonspecific symptoms.",
            )
            add(
                "نمط يحتاج تقييمًا أوليًا عند طب عام لتحديد ما إذا كان سببُه هضميًا أو عصبيًا أو باطنيًا أو عضليًا.",
                "A pattern that still needs a general-medicine review to decide whether the source is digestive, neurological, internal, or musculoskeletal.",
            )

    default_fillers = {
        "الجهاز الهضمي": [
            (
                "قرحة بسيطة أو تهيّج حمضي بالمعدة قد يكون احتمالًا إذا كان الألم حارقًا أو متكررًا في أعلى البطن.",
                "A mild ulcer-like or acid-related stomach irritation can be considered when the pain is burning or recurrent in the upper abdomen.",
            ),
            (
                "اضطراب وظيفي في القولون أو الهضم قد يفسّر الأعراض إذا كانت تتكرر مع الطعام أو التوتر.",
                "A functional bowel or digestive disturbance may fit when symptoms recur with meals or stress.",
            ),
        ],
        "أمراض القلب": [
            (
                "سبب غير قلبي مشابه مثل القلق أو الحموضة أو شد عضلات الصدر قد يقلّد بعض الأعراض القلبية.",
                "A non-cardiac mimic such as anxiety, reflux, or chest wall muscle strain can resemble some cardiac symptoms.",
            ),
        ],
        "طب الاعصاب": [
            (
                "صداع توتري أو شد في عضلات الرقبة قد يبقى احتمالًا حتى لو لم تظهر كل العلامات العصبية الواضحة.",
                "Tension headache or neck-muscle strain can still be a possibility even when clear neurological signs are not dominant.",
            ),
            (
                "إجهاد بصري أو صداع مرتبط بالعين أو الجيوب قد يفسّر بعض حالات الصداع مع التشوش أو الثقل بالرأس.",
                "Visual strain or an eye- or sinus-related headache can explain some headaches with blurring or heaviness.",
            ),
        ],
        "جراحة العظام والمفاصل": [
            (
                "شد عضلي أو إجهاد ميكانيكي يبقى من الاحتمالات الشائعة إذا كان الألم مرتبطًا بالحركة أو الوضعية.",
                "Muscle strain or mechanical overuse remains a common possibility when pain is linked to movement or posture.",
            ),
            (
                "التهاب أو تهيّج في المفصل أو الأربطة قد يفسّر الألم الموضّع حتى بدون إصابة كبيرة واضحة.",
                "Joint or ligament irritation can explain localized pain even without a major obvious injury.",
            ),
        ],
        "الأمراض الجلدية": [
            (
                "التهاب جلدي تهيّجي أو تحسسي يبقى احتمالًا حتى لو لم يتضح السبب المباشر من أول شكوى.",
                "Irritant or allergic dermatitis remains a possibility even when the trigger is not obvious from the first complaint.",
            ),
            (
                "عدوى سطحية أو فطريات خفيفة قد تُشبه بعض أنواع الطفح حسب الشكل والمكان.",
                "A mild superficial infection or fungal rash can resemble some other skin eruptions depending on pattern and location.",
            ),
        ],
        "الباطنية": [
            (
                "اضطراب استقلابي عام مثل السكر أو الغدة أو نقص العناصر قد يفسّر اجتماع أكثر من عرض في الوقت نفسه.",
                "A broader metabolic issue such as blood sugar, thyroid, or nutrient deficiency can explain multiple symptoms together.",
            ),
            (
                "حالة التهابية أو فيروسية عامة تبقى ضمن الاحتمالات إذا كان هناك تعب عام أو شعور مرضي منتشر.",
                "A generalized inflammatory or viral illness remains possible when the pattern is mostly a systemic unwell feeling.",
            ),
        ],
        "طب عام": [
            (
                "بداية عدوى فيروسية خفيفة أو التهاب عام بسيط قد تكون واردة إذا كانت الأعراض عامة وغير مركزة في عضو محدد.",
                "An early mild viral illness or a simple generalized inflammation can be possible when symptoms are broad and not focused on one organ.",
            ),
            (
                "قد تكون هناك حاجة لفرز أولي عند طب عام قبل تحويل الحالة للتخصص الأدق بحسب الأعراض المرافقة.",
                "An initial general-medicine assessment may be needed before narrowing the case to a more specific specialty.",
            ),
        ],
    }

    if specialty == "أمراض القلب":
        conditions_text = " ".join(conditions).lower()
        heart_fillers: list[tuple[str, str]] = []
        if has_palpitations:
            heart_fillers.append(
                (
                    "خفقان وظيفي مرتبط بالتوتر أو المنبهات قد يكون احتمالًا إذا كان العرض الأساسي هو النبض السريع أو الرفرفة، لكن يبقى التفريق مهمًا.",
                    "Functional palpitations related to stress or stimulants can be possible when the main complaint is a rapid or fluttering heartbeat, though proper differentiation still matters.",
                )
            )
        if (has_burning or has_upper_abdomen or has_food_trigger) and not any(
            marker in conditions_text for marker in ["ارتجاع", "حموض", "reflux", "heartburn"]
        ):
            heart_fillers.append(
                (
                    "حموضة أو ارتجاع قد يفسران بعض انزعاج الصدر إذا كان العرض يرتبط بالحرقة أو الطعام.",
                    "Reflux or heartburn may explain some chest discomfort when the pattern is linked to burning or meals.",
                )
            )
        elif has_movement_pain:
            heart_fillers.append(
                (
                    "شد عضلي أو ألم من جدار الصدر يبقى احتمالًا إذا كان الألم يتأثر بالحركة أو الوضعية.",
                    "Muscle strain or chest wall pain remains possible when discomfort changes with movement or position.",
                )
            )
        else:
            heart_fillers.append(
                (
                    "سبب غير قلبي مشابه مثل القلق أو شد عضلات الصدر قد يقلّد بعض الأعراض القلبية في البداية.",
                    "A non-cardiac mimic such as anxiety or chest wall strain can resemble some cardiac symptoms early on.",
                )
            )
        if has_pressure_pattern:
            heart_fillers.append(
                (
                    "تذبذب أو ارتفاع ضغط الدم قد يكون واردًا إذا كان الضغط نفسه جزءًا واضحًا من القصة أو مذكورًا ضمن الأعراض.",
                    "Blood-pressure fluctuation can be considered when blood pressure itself is clearly part of the story or explicitly mentioned in the symptoms.",
                )
            )
        default_fillers["أمراض القلب"] = heart_fillers

    for ar_text, en_text in default_fillers.get(specialty, []):
        if len(conditions) >= 3:
            break
        add(ar_text, en_text)

    return conditions[:5], note, note_first


def build_possible_causes_text(
    complaint: str,
    prediction: dict,
    lang: str,
    qa_pairs: list[dict] | None = None,
    rag_query_text: str | None = None,
    stage: str = "initial",
) -> str:
    specialty = prediction.get("final_label", "")
    confidence_note = build_prediction_confidence_note(prediction, lang) if stage == "refined" else None
    conditions, note, note_first = build_possible_condition_lines(
        complaint,
        prediction,
        lang,
        qa_pairs=qa_pairs,
        rag_query_text=rag_query_text,
    )

    if lang == "en":
        intro_map = {
            "أمراض القلب": "Chest symptoms or palpitations can fit more than one possibility, and the main possibilities we keep in mind include:",
            "الجهاز الهضمي": "Abdominal or stomach symptoms can fit more than one digestive possibility, and the main possibilities we keep in mind include:",
            "طب الاعصاب": "Neurological-type symptoms can fit more than one possibility, and the main possibilities we keep in mind include:",
            "جراحة العظام والمفاصل": "Pain related to movement, joints, or injury can fit more than one possibility, and the main possibilities we keep in mind include:",
            "الأمراض الجلدية": "The skin changes you described can fit more than one possibility, and the main possibilities we keep in mind include:",
            "الباطنية": "This overall symptom picture can fit more than one internal-medicine possibility, and the main possibilities we keep in mind include:",
            "طب عام": "The complaint is still fairly broad at this stage, so the main initial possibilities we keep in mind include:",
        }
        intro = intro_map.get(
            specialty,
            "Based on what you described, the main possibilities we keep in mind include:",
        )
    else:
        intro_map = {
            "أمراض القلب": "أعراض الصدر أو الخفقان قد ترتبط بأكثر من احتمال، ومن الاحتمالات التي نضعها في الحسبان:",
            "الجهاز الهضمي": "أعراض البطن أو المعدة قد ترتبط بأكثر من احتمال هضمي، ومن الاحتمالات التي نضعها في الحسبان:",
            "طب الاعصاب": "الأعراض العصبية التي تصفها قد ترتبط بأكثر من احتمال، ومن الاحتمالات التي نضعها في الحسبان:",
            "جراحة العظام والمفاصل": "الألم المرتبط بالحركة أو المفاصل أو الإصابة قد يرتبط بأكثر من احتمال، ومن الاحتمالات التي نضعها في الحسبان:",
            "الأمراض الجلدية": "التغيرات الجلدية التي تصفها قد ترتبط بأكثر من احتمال، ومن الاحتمالات التي نضعها في الحسبان:",
            "الباطنية": "الصورة العامة للأعراض قد ترتبط بأكثر من احتمال باطني، ومن الاحتمالات التي نضعها في الحسبان:",
            "طب عام": "الشكوى ما تزال عامة نسبيًا في هذه المرحلة، لذلك نضع في الحسبان أكثر من احتمال أولي، مثل:",
        }
        intro = intro_map.get(
            specialty,
            "حسب وصفك، من الاحتمالات التي نضعها في الحسبان:",
        )

    if stage == "refined" and conditions:
        primary_condition = conditions[0]
        secondary_conditions = conditions[1:3]
        if specialty == "أمراض القلب" and any(
            term in str(primary_condition).lower()
            for term in ["ذبحه", "نقص ترويه", "ألم صدري", "angina", "ischemia", "chest pain"]
        ):
            filtered_secondary = [
                item
                for item in conditions[1:]
                if all(marker not in str(item).lower() for marker in ["ضغط الدم", "blood pressure"])
            ]
            secondary_conditions = filtered_secondary[:1] if note_first else filtered_secondary[:2]

        if lang == "en":
            message = (
                "After reviewing the complaint and follow-up answers, the closest possibility at this stage is:\n\n"
                f"🔹 {primary_condition}"
            )
            if secondary_conditions:
                message += "\n\nOther possibilities still worth keeping in mind include:\n\n"
                message += "\n".join(f"🔹 {item}" for item in secondary_conditions)
        else:
            message = (
                "بعد مراجعة الشكوى والإجابات، يصبح الاحتمال الأقرب في هذه المرحلة هو:\n\n"
                f"🔹 {primary_condition}"
            )
            if secondary_conditions:
                message += "\n\nوتبقى احتمالات أخرى واردة أيضًا، مثل:\n\n"
                message += "\n".join(f"🔹 {item}" for item in secondary_conditions)
    else:
        message = f"{intro}\n\n" + "\n".join(f"🔹 {item}" for item in conditions)

    if note:
        message = f"{note}\n\n{message}" if note_first else f"{message}\n\n{note}"
    if confidence_note:
        message = f"{message}\n\n{confidence_note}"
    return message


def build_initial_specialty_line(specialty: str, lang: str) -> str:
    specialty_label = en_value(specialty or "the appropriate specialty") if lang == "en" else (specialty or "التخصص المناسب")
    if lang == "en":
        return f"At this stage, the closest specialty to start with appears to be {specialty_label}."
    return f"في هذه المرحلة، يبقى التخصص الأقرب للبدء منه هو {specialty_label}."


def build_question_transition_line(lang: str) -> str:
    if lang == "en":
        return "This is still initial guidance, and I will ask a few short questions to clarify the picture."
    return "هذا ترجيح أولي فقط، وسأطرح الآن أسئلة قصيرة لتوضيح الصورة أكثر."


def build_final_specialty_summary(
    prediction: dict,
    recommendation: dict,
    lang: str,
    top_condition: str = "",
) -> str:
    specialty = prediction.get("final_label", "-")
    specialty_label = en_value(specialty) if lang == "en" else specialty
    risk_key = str(recommendation.get("risk_level", "-") or "-").strip().lower()
    risk_label = localize_risk_level(risk_key, lang)
    timing_phrase = build_timing_sentence_value(recommendation.get("timing", "-"), lang)
    top_condition_text = str(top_condition or "").lower()
    is_uncertain = bool(prediction.get("is_uncertain"))
    second_specialty = str(prediction.get("second_label", "")).strip()
    second_label = en_value(second_specialty) if lang == "en" else second_specialty
    is_high_risk_heart = (
        specialty == "أمراض القلب"
        and risk_key in {"high", "urgent", "emergency"}
        and any(marker in top_condition_text for marker in ["ذبحه", "نقص ترويه", "ألم صدري", "angina", "ischemia", "chest pain"])
    )

    if lang == "en":
        if is_high_risk_heart:
            return (
                f"Based on that, the priority now is {timing_phrase}. "
                f"{specialty_label} remains the closest specialty to continue with, "
                f"and the current risk level is {risk_label}."
            )
        if is_uncertain and second_label and second_label != specialty_label:
            return (
                f"Based on that, {specialty_label} remains the closest specialty to continue with at this stage. "
                f"The current risk level is {risk_label}, the next practical step is {timing_phrase}, "
                f"and {second_label} still remains a nearby alternative that may need direct clinical confirmation."
            )
        return (
            f"Based on that, the closest specialty to continue with appears to be {specialty_label}. "
            f"The current risk level is {risk_label}, "
            f"and the next practical step is {timing_phrase}."
        )

    if is_high_risk_heart:
        return (
            f"وبناءً على ذلك، فالأولوية الآن هي {timing_phrase}. "
            f"ويبقى التخصص الأقرب للاستمرار منه هو {specialty_label}، "
            f"ومستوى الخطورة الحالي هو {risk_label}."
        )

    if is_uncertain and second_label and second_label != specialty_label:
        return (
            f"وبناءً على ذلك، يبقى {specialty_label} هو التخصص الأقرب للاستمرار منه في هذه المرحلة. "
            f"ومستوى الخطورة الحالي هو {risk_label}، والخطوة العملية التالية هي {timing_phrase}، "
            f"مع بقاء {second_label} ضمن البدائل القريبة التي قد تحتاج تثبيتًا سريريًا مباشرًا."
        )

    return (
        f"وبناءً على ذلك، يبقى التخصص الأقرب للاستمرار منه هو {specialty_label}، "
        f"ومستوى الخطورة الحالي هو {risk_label}، "
        f"والخطوة العملية التالية هي {timing_phrase}."
    )


def join_reason_parts(parts: list[str], lang: str) -> str:
    cleaned = [part.strip() for part in parts if str(part).strip()]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if lang == "en":
        return ", and ".join([", ".join(cleaned[:-1]), cleaned[-1]]) if len(cleaned) > 2 else " and ".join(cleaned)
    return "، و".join(["، ".join(cleaned[:-1]), cleaned[-1]]) if len(cleaned) > 2 else " و".join(cleaned)


def build_top_condition_reason_line(
    primary_condition: str,
    complaint: str,
    prediction: dict,
    qa_pairs: list[dict] | None,
    lang: str,
) -> str | None:
    if not primary_condition:
        return None

    clean_text = build_case_signal_text(complaint, prediction=prediction, qa_pairs=qa_pairs)
    answer_map = {
        str(pair.get("id", "")).strip(): str(pair.get("answer", "")).strip()
        for pair in qa_pairs or []
        if str(pair.get("id", "")).strip() and str(pair.get("answer", "")).strip()
    }
    specialty = prediction.get("final_label", "")

    has_upper_abdomen = text_has_any(clean_text, "معده", "فم المعده", "اعلى البطن", "اعلي البطن")
    has_burning = text_has_any(clean_text, "حرقه", "حموضه", "ارتجاع")
    has_bloating = text_has_any(clean_text, "انتفاخ", "غازات")
    has_colon_pattern = text_has_any(clean_text, "مغص", "قولون", "امساك", "اسهال", "تبرز")
    has_food_trigger = text_has_any(clean_text, "بعد الاكل", "بعد الطعام", "اكل", "طعام", "دهني", "دسم")
    has_nausea = text_has_any(clean_text, "غثيان")
    has_vomiting = text_has_any(clean_text, "قيء", "استفراغ")
    has_fever = text_has_any(clean_text, "حراره", "حمى", "قشعريره")
    has_palpitations = text_has_any(clean_text, "خفقان", "نبض", "تسارع", "رفرفه")
    has_chest_pain = text_has_any(clean_text, "صدر", "ضغط صدر", "ثقل", "كتمه", "وخز")
    has_short_breath = text_has_any(clean_text, "ضيق تنفس", "كتمه نفس")
    has_sweating = text_has_any(clean_text, "تعرق", "عرق")
    has_spread = text_has_any(clean_text, "يمتد", "ينتشر", "ذراع", "فك", "ظهر", "كتف")
    has_stress_or_caffeine = text_has_any(clean_text, "توتر", "قلق", "قهوه", "قهوة", "كافيين")
    has_headache = text_has_any(clean_text, "صداع", "راس", "شقيقه")
    has_visual = text_has_any(clean_text, "زغلله", "تشوش", "رؤيه", "رؤية", "عين")
    has_light_sound = text_has_any(clean_text, "ضوء", "صوت")
    has_dizziness = text_has_any(clean_text, "دوخه", "دوار", "توازن")
    has_numbness = text_has_any(clean_text, "تنميل", "خدر")
    has_weakness = text_has_any(clean_text, "ضعف", "رخاوه", "رخاوة")
    has_neck_tension = text_has_any(clean_text, "رقبه", "مؤخره", "مؤخرة", "شد", "توتر", "قله النوم", "اجهاد")
    has_sinus_eye = text_has_any(clean_text, "جيوب", "عين", "حول العين", "تشوش")
    has_injury = text_has_any(clean_text, "سقط", "وقع", "التواء", "التوى", "ضربه", "دكمه", "اصابه", "حادث", "كسر")
    has_joint_location = text_has_any(clean_text, "كتف", "ركبه", "مفصل", "ورك", "قدم", "يد", "رسغ", "ذراع")
    has_back_neck = text_has_any(clean_text, "ظهر", "رقبه", "رقبة", "فقرات", "اسفل الظهر")
    has_itching = text_has_any(clean_text, "حكه", "هرش")
    has_rash = text_has_any(clean_text, "طفح", "احمرار", "بقع")
    has_dry_scaly = text_has_any(clean_text, "جفاف", "قشور", "اكزيما")
    has_fungal_pattern = text_has_any(clean_text, "فطريات", "دائري", "بين الاصابع", "تقشر")
    has_skin_trigger = text_has_any(clean_text, "تحسس", "حساسيه", "دواء", "طعام", "صابون", "كريم", "ماده", "منظف")
    has_fatigue = text_has_any(clean_text, "تعب", "خمول", "ضعف", "ارهاق", "إرهاق", "شحوب")
    has_diabetes_pattern = text_has_any(clean_text, "سكر", "عطش", "تبول", "رجفه", "رجفة")
    has_thyroid_pattern = text_has_any(clean_text, "غده", "غدة", "وزن", "برد", "حر", "خفقان")
    has_pressure_pattern = text_has_any(clean_text, "ضغط الدم", "ارتفاع الضغط", "هبوط الضغط", "الضغط مرتفع", "الضغط منخفض")
    has_urinary_pattern = text_has_any(clean_text, "حرقان البول", "تبول", "بول", "خاصره", "خاصرة")

    reasons: list[str] = []

    def add_reason(ar_text: str, en_text: str) -> None:
        reasons.append(en_text if lang == "en" else ar_text)

    if specialty == "الجهاز الهضمي":
        if "قولون" in primary_condition or "معوي" in primary_condition:
            if has_colon_pattern:
                add_reason("الإجابات دعمت وجود مغص أو تغير في التبرز", "the answers supported a pattern of cramps or bowel changes")
            if has_bloating:
                add_reason("ظهر انتفاخ أو غازات مع الشكوى", "bloating or gas was also part of the complaint")
        elif any(term in primary_condition for term in ["معد", "عسر الهضم", "قرح", "حموض", "ارتجاع"]):
            if has_upper_abdomen:
                add_reason("الانزعاج يتركز في المعدة أو أعلى البطن", "the discomfort is centered in the stomach or upper abdomen")
            if has_food_trigger or has_nausea:
                add_reason("هناك ارتباط بالأكل أو بالغثيان", "there is a pattern linked to meals or nausea")
        elif any(term in primary_condition for term in ["نزله", "تلبك", "تسمم"]):
            if has_vomiting or has_fever:
                add_reason("وجود غثيان أو قيء أو حرارة", "nausea, vomiting, or fever were present")
    elif specialty == "أمراض القلب":
        if any(term in primary_condition for term in ["ذبحه", "نقص ترويه", "ألم صدري"]):
            if has_chest_pain:
                add_reason("الوصف يتركز على ألم أو ضغط في الصدر", "the main pattern centered on chest pain or pressure")
            if has_short_breath or has_sweating or has_spread:
                add_reason("ظهرت علامات ترفع أهمية التقييم القلبي مثل ضيق النفس أو التعرق أو امتداد الألم", "there were features that raise cardiac concern such as shortness of breath, sweating, or radiating pain")
        elif "خفقان" in primary_condition or "نظم" in primary_condition:
            if has_palpitations:
                add_reason("العرض الأساسي كان الخفقان أو عدم انتظام النبض", "the main symptom was palpitations or an irregular heartbeat")
            if has_stress_or_caffeine:
                add_reason("الإجابات تركت احتمال ارتباطه بالتوتر أو المنبهات", "the answers also left room for a stress- or stimulant-related pattern")
    elif specialty == "طب الاعصاب":
        if "شقيق" in primary_condition or "صداع نصفي" in primary_condition:
            if has_headache:
                add_reason("الشكوى تركزت على الصداع", "the complaint clearly centered on headache")
            if has_nausea or has_visual or has_light_sound:
                add_reason("وترافقت مع غثيان أو زغللة أو حساسية للضوء أو الصوت", "and it came with nausea, visual disturbance, or sensitivity to light or sound")
        elif "دوار" in primary_condition or "دهليزي" in primary_condition:
            if has_dizziness:
                add_reason("العرض الأبرز كان الدوخة أو اختلال التوازن", "the most prominent symptom was dizziness or imbalance")
        elif any(term in primary_condition for term in ["عصب", "عصبي", "تنميل", "ضعف"]):
            if has_numbness or has_weakness:
                add_reason("الإجابات دعمت وجود تنميل أو ضعف", "the answers supported numbness or weakness")
        elif "توتري" in primary_condition or "شد" in primary_condition:
            if has_neck_tension:
                add_reason("هناك شد أو توتر في الرقبة أو مع قلة النوم", "there was neck tension or a pattern linked to poor sleep or stress")
    elif specialty == "جراحة العظام والمفاصل":
        if any(term in primary_condition for term in ["التواء", "كدم", "كسر", "اصابه"]):
            if has_injury:
                add_reason("بداية الألم ارتبطت بإصابة أو التواء أو ضربة", "the pain started after an injury, twist, or impact")
        elif any(term in primary_condition for term in ["اوتار", "اربطه", "مفصل"]):
            if has_joint_location:
                add_reason("موضع الألم كان في مفصل أو طرف واضح", "the pain was localized to a clear joint or limb")
            if text_has_any(clean_text, "حركه", "عند الحركه", "مع الحركه", "لما اتحرك", "لما احرك"):
                add_reason("ويزداد مع الحركة", "and it worsens with movement")
        elif any(term in primary_condition for term in ["عصب", "جذور", "انضغاط"]):
            if has_numbness or has_weakness or has_spread:
                add_reason("الألم ترافق مع امتداد أو تنميل أو ضعف", "the pain came with radiation, numbness, or weakness")
        elif any(term in primary_condition for term in ["شد عضلي", "غضروف", "عمود"]):
            if has_back_neck:
                add_reason("الشكوى تركزت على الظهر أو الرقبة", "the complaint centered on the back or neck")
    elif specialty == "الأمراض الجلدية":
        if any(term in primary_condition for term in ["تحسس", "تماسي"]):
            if has_skin_trigger:
                add_reason("بداية الأعراض ارتبطت بمادة أو دواء أو طعام جديد", "the onset was linked to a new product, medicine, or food")
        elif "اكزي" in primary_condition:
            if has_itching or has_dry_scaly:
                add_reason("الإجابات دعمت وجود حكة مع جفاف أو قشور", "the answers supported itching with dryness or scaling")
        elif "شرى" in primary_condition or "طفح" in primary_condition:
            if has_rash and has_itching:
                add_reason("الطفح كان واضحًا مع حكة", "the rash was clearly associated with itching")
        elif "فطريات" in primary_condition and has_fungal_pattern:
            add_reason("شكل الطفح يوحي بنمط سطحي متقشر أو محدد", "the rash pattern looked more superficial and scaly")
    elif specialty == "الباطنية":
        if "فقر دم" in primary_condition or "نقص عناصر" in primary_condition:
            if has_fatigue or has_dizziness:
                add_reason("الشكوى تركزت على التعب أو الدوخة أو الضعف العام", "the complaint focused on fatigue, dizziness, or generalized weakness")
        elif "سكر" in primary_condition:
            if has_diabetes_pattern:
                add_reason("ظهرت مؤشرات مثل العطش أو التبول أو الرجفة", "features such as thirst, urination, or shakiness were present")
        elif "غده" in primary_condition or "هرمون" in primary_condition:
            if has_thyroid_pattern:
                add_reason("الإجابات دعمت نمطًا يشبه اضطراب الغدة أو الهرمونات", "the answers supported a thyroid- or hormone-related pattern")
        elif any(term in primary_condition for term in ["التهاب", "عدوى"]):
            if has_fever:
                add_reason("وجود حرارة أو شعور عام بالمرض", "fever or a generalized unwell feeling was present")
        elif any(term in primary_condition for term in ["ضغط", "جفاف"]):
            if has_pressure_pattern or has_dizziness or has_vomiting:
                add_reason("الإجابات دعمت وجود دوخة أو قلة سوائل أو تغير في الضغط", "the answers supported dizziness, low fluid intake, or blood pressure fluctuation")
        elif any(term in primary_condition for term in ["بولي", "كلوي"]):
            if has_urinary_pattern:
                add_reason("هناك أعراض بولية أو ألم في الخاصرة", "there were urinary symptoms or flank pain")

    duration = answer_map.get("duration")
    severity = answer_map.get("severity")
    if not reasons:
        if duration:
            add_reason(
                f"الإجابات أوضحت مدة الأعراض بشكل أدق ({duration})",
                f"the follow-up answers clarified the symptom duration more clearly ({duration})",
            )
        if severity:
            add_reason(
                f"كما ساعدت في تحديد شدة الأعراض ({severity})",
                f"and helped define the symptom severity more clearly ({severity})",
            )

    reason_text = join_reason_parts(reasons[:2], lang)
    if not reason_text:
        return None
    if lang == "en":
        return f"This became the closest possibility because {reason_text}."
    return f"ويبدو هذا الاحتمال أقرب لأن {reason_text}."


def build_refinement_summary(sections: dict, lang: str) -> str | None:
    if not sections:
        return None

    duration = str(sections.get("duration", "-")).strip()
    severity = str(sections.get("severity", "-")).strip()
    trend = str(sections.get("trend", "-")).strip()
    associated = str(sections.get("associated_symptoms", "-")).strip()
    red_flags = str(sections.get("red_flags", "-")).strip()

    if lang == "en":
        parts = []
        if duration and duration not in {"-", "Not mentioned"}:
            parts.append(f"the follow-up answers clarified the duration ({duration})")
        if severity and severity not in {"-", "Not mentioned"}:
            parts.append(f"the severity was narrowed down more clearly ({severity})")
        if trend and trend not in {"-", "Not mentioned"}:
            parts.append(f"the symptom course became clearer ({trend})")
        if red_flags and red_flags not in {"-", "No clear warning signs"}:
            parts.append("warning signs were checked directly through the follow-up questions")
        elif associated and associated not in {"-", "No clear warning signs"}:
            parts.append("the accompanying symptom pattern became more specific after the answers")
        if not parts:
            return "The follow-up answers mainly helped narrow the case from a broad complaint into a more specific clinical pattern."
        return "After the follow-up questions, " + ", ".join(parts[:3]) + "."

    parts = []
    if duration and duration not in {"-", "غير مذكور"}:
        parts.append(f"اتضحت مدة الأعراض بشكل أفضل ({duration})")
    if severity and severity not in {"-", "غير مذكور"}:
        parts.append(f"وأصبحت الشدة أوضح ({severity})")
    if trend and trend not in {"-", "غير مذكور"}:
        parts.append(f"كما اتضح مسار الأعراض ({trend})")
    if red_flags and red_flags not in {"-", "لا يوجد واضح"}:
        parts.append("وتم التحقق من العلامات الإنذارية بشكل مباشر عبر الأسئلة")
    elif associated and associated not in {"-", "لا يوجد واضح"}:
        parts.append("وأصبحت الأعراض المصاحبة أكثر تحديدًا بعد الإجابات")
    if not parts:
        return "ساعدت أسئلة المتابعة أساسًا على تحويل الشكوى من وصف عام إلى نمط سريري أوضح."
    return "بعد أسئلة المتابعة، " + "، ".join(parts[:3]) + "."


def build_why_not_alternative_specialty(sections: dict, lang: str) -> str | None:
    prediction = sections.get("prediction", {}) if sections else {}
    final_specialty = str(prediction.get("specialty", "")).strip()
    alt_specialty = str(prediction.get("alternative_specialty", "")).strip()
    associated = normalize_condition_text(str(sections.get("associated_symptoms", "")))
    red_flags = normalize_condition_text(str(sections.get("red_flags", "")))
    location = normalize_condition_text(str(sections.get("location", "")))

    if not alt_specialty or alt_specialty == "-" or alt_specialty == final_specialty:
        return (
            "No close alternative specialty remained strong enough after the follow-up answers."
            if lang == "en"
            else "لم يبقَ تخصص بديل قريب بنفس القوة بعد إجابات المتابعة."
        )

    missing_reason_map = {
        "أمراض القلب": (
            "the follow-up answers did not make chest-radiation or cardiopulmonary warning signs the dominant pattern",
            "لأن إجابات المتابعة لم تجعل امتداد ألم الصدر أو العلامات القلبية التنفسية هي النمط الغالب",
        ),
        "الجهاز الهضمي": (
            "the follow-up answers did not keep a clear digestive pattern as the dominant theme",
            "لأن إجابات المتابعة لم تُبقِ النمط الهضمي الواضح هو السمة الأبرز",
        ),
        "طب الاعصاب": (
            "clear focal neurological features did not remain the dominant pattern after the answers",
            "لأن العلامات العصبية البؤرية الواضحة لم تبقَ هي النمط الأبرز بعد الإجابات",
        ),
        "جراحة العظام والمفاصل": (
            "localized movement-related pain or injury cues did not stay stronger than the final pattern",
            "لأن ألم الحركة الموضّع أو مؤشرات الإصابة لم تبقَ أقوى من النمط النهائي",
        ),
        "الأمراض الجلدية": (
            "a primary skin-rash pattern did not remain stronger than the final interpretation",
            "لأن نمط الطفح أو الشكوى الجلدية الأولية لم يبقَ أقوى من التفسير النهائي",
        ),
        "الباطنية": (
            "the picture became more specific than a broad internal-medicine pattern",
            "لأن الصورة أصبحت أكثر تحديدًا من أن تبقى ضمن نمط باطني عام",
        ),
        "طب عام": (
            "the answers narrowed the case beyond a broad general-medicine starting point",
            "لأن الإجابات ضيّقت الحالة إلى ما هو أدق من إطار طب عام مبدئي",
        ),
    }

    reason_en, reason_ar = missing_reason_map.get(
        alt_specialty,
        (
            "the follow-up answers supported the final specialty more clearly than the nearby alternative",
            "لأن إجابات المتابعة دعمت التخصص النهائي بصورة أوضح من التخصص البديل القريب",
        ),
    )

    if lang == "en":
        if final_specialty == "أمراض القلب" and ("ضيق تنفس" in associated or "ضيق تنفس" in red_flags):
            return f"{en_value(alt_specialty)} became less likely because the answers reinforced a more cardiac-leaning pattern with shortness of breath or warning signs."
        if final_specialty == "الجهاز الهضمي" and any(term in associated for term in ["غثيان", "قيء", "حرقة", "اعراض هضميه"]):
            return f"{en_value(alt_specialty)} became less likely because the answers kept the digestive pattern more consistent than the nearby alternative."
        if final_specialty == "جراحة العظام والمفاصل" and any(term in location for term in ["كتف", "ظهر", "رقبه", "ذراع", "ساق"]):
            return f"{en_value(alt_specialty)} became less likely because the case stayed more localized to a movement-related or limb-based pattern."
        return f"{en_value(alt_specialty)} became less likely because {reason_en}."

    if final_specialty == "أمراض القلب" and ("ضيق تنفس" in associated or "ضيق تنفس" in red_flags):
        return f"أصبح {alt_specialty} أقل ترجيحًا لأن الإجابات عززت صورة تميل أكثر إلى النمط القلبي مع ضيق نفس أو علامات إنذارية."
    if final_specialty == "الجهاز الهضمي" and any(term in associated for term in ["غثيان", "قيء", "حرقة", "اعراض هضميه"]):
        return f"أصبح {alt_specialty} أقل ترجيحًا لأن الإجابات أبقت النمط الهضمي أكثر اتساقًا من التخصص البديل القريب."
    if final_specialty == "جراحة العظام والمفاصل" and any(term in location for term in ["كتف", "ظهر", "رقبه", "ذراع", "ساق"]):
        return f"أصبح {alt_specialty} أقل ترجيحًا لأن الحالة بقيت أكثر تموضعًا في نمط مرتبط بالحركة أو الطرف المصاب."
    return f"أصبح {alt_specialty} أقل ترجيحًا {reason_ar}."


def localize_report(report, lang, raw_prediction=None):
    if not report:
        return report

    sections = report.get("sections", {})
    raw_prediction = raw_prediction or {}

    # ✅ ADD possible condition FIRST (IMPORTANT)
    sections["possible_condition_ar"] = build_possible_causes_text(
        sections.get("chief_complaint", "") or sections.get("symptoms_summary", ""),
        {"final_label": sections.get("prediction", {}).get("specialty", "")},
        "ar",
        rag_query_text=report.get("_rag_query_text"),
        stage="refined",
    )
    sections["possible_condition_en"] = build_possible_causes_text(
        sections.get("chief_complaint", "") or sections.get("symptoms_summary", ""),
        {"final_label": sections.get("prediction", {}).get("specialty", "")},
        "en",
        rag_query_text=report.get("_rag_query_text"),
        stage="refined",
    )
    sections["possible_condition"] = sections["possible_condition_en"] if lang == "en" else sections["possible_condition_ar"]

    if lang == "en":

        if "prediction" in sections:
            pred = sections["prediction"]
            pred["specialty"] = en_value(pred.get("specialty"))
            pred["second_choice"] = en_value(pred.get("second_choice"))
            pred["next_step"] = en_value(pred.get("next_step"))
            pred["risk_level"] = localize_risk_level(pred.get("risk_level", "-"), "en")
            pred["confidence_band"] = localize_confidence_band(pred.get("confidence_band"), "en")

        if "history" in sections:
            for key, value in sections["history"].items():
                sections["history"][key] = en_value(value)

        sections["symptoms_summary"] = "Summary based on the user complaint and follow-up answers."
        sections["associated_symptoms"] = "Associated symptoms were reviewed through follow-up questions."
        sections["red_flags"] = "Warning signs were considered based on the answers."
        sections["location"] = en_value(sections.get("location"))
        sections["severity"] = en_value(sections.get("severity"))
        sections["duration"] = en_value(sections.get("duration"))
        sections["trend"] = en_value(sections.get("trend"))
    elif "prediction" in sections:
        sections["prediction"]["risk_level"] = localize_risk_level(
            sections["prediction"].get("risk_level"),
            "ar",
        )
        sections["prediction"]["confidence_band"] = localize_confidence_band(
            sections["prediction"].get("confidence_band"),
            "ar",
        )

    specialty = sections.get("prediction", {}).get("specialty", "-")
    risk = sections.get("prediction", {}).get("risk_level", "-")
    next_step = sections.get("prediction", {}).get("next_step", "-")
    if "prediction" in sections:
        pred = sections["prediction"]
        pred["alternative_specialty"] = pred.get("second_choice", "-")
        pred["is_uncertain"] = bool(raw_prediction.get("is_uncertain"))
        pred["confidence_note_ar"] = build_prediction_confidence_note(raw_prediction, "ar")
        pred["confidence_note_en"] = build_prediction_confidence_note(raw_prediction, "en")
        pred["confidence_note"] = pred["confidence_note_en"] if lang == "en" else pred["confidence_note_ar"]
        pred["confidence_code"] = str(raw_prediction.get("confidence_band", pred.get("confidence_band", "-")))
        pred["refinement_summary_ar"] = build_refinement_summary(sections, "ar")
        pred["refinement_summary_en"] = build_refinement_summary(sections, "en")
        pred["refinement_summary"] = pred["refinement_summary_en"] if lang == "en" else pred["refinement_summary_ar"]
        pred["why_not_alternative_ar"] = build_why_not_alternative_specialty(sections, "ar")
        pred["why_not_alternative_en"] = build_why_not_alternative_specialty(sections, "en")
        pred["why_not_alternative"] = pred["why_not_alternative_en"] if lang == "en" else pred["why_not_alternative_ar"]

    # ✅ CLEAN (NO DUPLICATION)
    report["sections"] = sections
    export_lines = [
        "Doctor Summary" if lang == "en" else "ملخص الطبيب",
        f"{'Complaint' if lang == 'en' else 'الشكوى الرئيسية'}: {sections.get('chief_complaint', '-')}",
        f"{'Possible condition' if lang == 'en' else 'المرض المحتمل'}:\n{sections.get('possible_condition', '-')}",
        f"{'Expected specialty' if lang == 'en' else 'التخصص المتوقع'}: {specialty}",
        f"{'Alternative specialty' if lang == 'en' else 'التخصص البديل القريب'}: {sections.get('prediction', {}).get('alternative_specialty', '-')}",
        f"{'Risk level' if lang == 'en' else 'مستوى الخطورة'}: {risk}",
        f"{'Confidence' if lang == 'en' else 'درجة الثقة'}: {sections.get('prediction', {}).get('confidence_band', '-')}",
        f"{'Next step' if lang == 'en' else 'الخطوة التالية'}: {next_step}",
    ]
    confidence_note = sections.get("prediction", {}).get("confidence_note")
    if confidence_note:
        export_lines.append(f"{'Confidence note' if lang == 'en' else 'ملاحظة الثقة'}: {confidence_note}")
    refinement_note = sections.get("prediction", {}).get("refinement_summary")
    if refinement_note:
        export_lines.append(
            f"{'Follow-up impact' if lang == 'en' else 'ما الذي اتضح بعد المتابعة'}: {refinement_note}"
        )
    why_not_note = sections.get("prediction", {}).get("why_not_alternative")
    if why_not_note:
        export_lines.append(
            f"{'Why not the nearby alternative' if lang == 'en' else 'لماذا لم يرجح التخصص البديل'}: {why_not_note}"
        )
    export_lines.append(
        "Note: This is initial guidance and does not replace direct medical evaluation."
        if lang == "en"
        else "ملاحظة: هذا توجيه أولي ولا يغني عن التقييم الطبي المباشر."
    )
    report["plain_text"] = "\n".join(export_lines)

    return report

def localize_explanation(explanation, prediction, lang):
    if lang != "en" or not explanation:
        return explanation

    explanation["predicted_specialty"] = en_value(explanation.get("predicted_specialty"))
    explanation["explanation_note"] = (
        "The words below are original complaint terms that influenced the expected specialty."
    )
    explanation["retrieved_support"] = [
        {
            "label": en_value(prediction.get("final_label")),
            "score": prediction.get("final_confidence"),
            "text_preview": "This explanation is based on influential symptom words and matching specialty patterns.",
        }
    ]
    return explanation


def localize_tips(tips, lang):
    if lang != "en":
        return tips

    return [
        "Temporary supportive guidance. These suggestions do not replace medical evaluation.",
        "General supportive care only\nUse these options only as temporary comfort measures.\nThey should not replace direct medical assessment, especially with high-risk symptoms.",
        "Rest and hydration\nTry to rest, drink enough water, and avoid heavy meals until symptoms are clearer.\nSeek medical care promptly if symptoms worsen or new warning signs appear.",
        "Stress reduction\nSlow breathing and relaxation may reduce tension temporarily.\nThis is not treatment for heart, breathing, fainting, or severe pain symptoms.",
        "When to avoid relying on this\nDo not rely on supportive care if there is chest pain, shortness of breath, fainting, severe pain, or worsening symptoms.\nIn these cases, medical evaluation is the priority.",
    ]


def build_triage_chat_reply(complaint: str, prediction: dict, first_question: str, lang: str = "ar") -> dict:
    lang = normalize_lang(lang)
    possible = build_possible_causes_text(complaint, prediction, lang)
    specialty_line = build_initial_specialty_line(prediction.get("final_label", ""), lang)
    transition_line = build_question_transition_line(lang)

    if lang == "en":
        answer = (
            f"{possible}\n\n"
            f"{specialty_line} "
            f"{transition_line}\n\n"
            f"{en_question(first_question)}"
        )
    else:
        answer = (
            f"{possible}\n\n"
            f"{specialty_line} "
            f"{transition_line}\n\n"
            f"{first_question}"
        )

    return {"answer": answer}


def build_followup_chat_reply(question: str, lang: str = "ar") -> dict:
    lang = normalize_lang(lang)
    if lang == "en":
        return {"answer": f"Thank you. To organize the case more accurately, {en_question(question)}"}
    return {"answer": f"شكرًا لك. حتى أرتب الحالة بشكل أدق، {question}"}


def build_recommendation_chat_reply(
    complaint: str,
    prediction: dict,
    recommendation: dict,
    lang: str = "ar",
    qa_pairs: list[dict] | None = None,
) -> dict:
    lang = normalize_lang(lang)
    conditions, _, _ = build_possible_condition_lines(
        complaint,
        prediction,
        lang,
        qa_pairs=qa_pairs,
    )
    possible = build_possible_causes_text(
        complaint,
        prediction,
        lang,
        qa_pairs=qa_pairs,
        stage="refined",
    )
    reason_line = build_top_condition_reason_line(
        conditions[0] if conditions else "",
        complaint,
        prediction,
        qa_pairs,
        lang,
    )

    if lang == "en":
        reason_block = f"\n\n{reason_line}" if reason_line else ""
        final_summary = build_final_specialty_summary(
            prediction,
            recommendation,
            lang,
            conditions[0] if conditions else "",
        )
        answer = (
            f"{possible}{reason_block}\n\n"
            f"{final_summary}\n\n"
            "This is still initial guidance and does not replace direct medical evaluation, especially if symptoms continue or get worse."
        )
    else:
        reason_block = f"\n\n{reason_line}" if reason_line else ""
        final_summary = build_final_specialty_summary(
            prediction,
            recommendation,
            lang,
            conditions[0] if conditions else "",
        )
        answer = (
            f"{possible}{reason_block}\n\n"
            f"{final_summary}\n\n"
            "هذا التوجيه أولي ولا يغني عن المراجعة الطبية المباشرة، خاصة إذا كانت الأعراض مستمرة أو متفاقمة."
        )

    return {"answer": answer}


class AppHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".webmanifest": "application/manifest+json",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def get_allowed_origin(self):
        origin = str(self.headers.get("Origin", "")).strip()
        if not origin:
            return ""

        allowed = set(DEFAULT_ALLOWED_ORIGINS)
        configured = os.environ.get("MEDIKA_ALLOWED_ORIGINS", "")
        if configured.strip():
            allowed.update(
                item.strip()
                for item in configured.split(",")
                if item.strip()
            )

        if "*" in allowed:
            return "*"

        return origin if origin in allowed else ""

    def send_cors_headers(self):
        allowed_origin = self.get_allowed_origin()
        if not allowed_origin:
            return

        self.send_header("Access-Control-Allow-Origin", allowed_origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def end_headers(self):
        self.send_cors_headers()
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/health":
            return self.handle_health()
        if parsed.path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        routes = {
            "/api/triage": self.handle_triage,
            "/api/recommend": self.handle_recommend,
            "/api/explain": self.handle_explain,
            "/api/supportive-tips": self.handle_supportive_tips,
            "/api/follow-up-message": self.handle_follow_up_message,
            "/api/text-to-speech": self.handle_text_to_speech,
        }

        handler = routes.get(parsed.path)
        if handler:
            return handler()

        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def read_json(self):
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(content_length) if content_length else b"{}"
            return json.loads(body.decode("utf-8"))
        except Exception:
            return None

    def write_json(self, payload, status=HTTPStatus.OK):
        encoded = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def write_bytes(self, payload: bytes, content_type: str, status=HTTPStatus.OK):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def handle_health(self):
        return self.write_json(
            {
                "status": "ok",
                "service": "Medika AI API",
                "version": APP_VERSION,
                "environment": APP_ENV,
                "azure_speech_configured": bool(os.getenv("AZURE_SPEECH_KEY", "").strip() and os.getenv("AZURE_SPEECH_REGION", "").strip()),
                "rag_entries": len(CONDITION_RAG.entries),
            }
        )

    def handle_triage(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        message = str(payload.get("message", "")).strip()
        lang = normalize_lang(payload.get("lang", "ar"))
        attachment_context = str(payload.get("attachment_context", "")).strip()
        profile_role = str(payload.get("profile_role", "")).strip()

        if not message:
            return self.write_json({"error": "message is required"}, status=HTTPStatus.BAD_REQUEST)

        try:
            model_input = merge_message_with_context(message, attachment_context, profile_role)
            prediction = SYSTEM.predict(model_input)
            questions = SYSTEM.generate_questions(model_input)
            doctor_snapshot = SYSTEM.build_doctor_snapshot(model_input, prediction)

            assistant_message = None
            if questions:
                assistant_message = build_triage_chat_reply(
                    complaint=message,
                    prediction=prediction,
                    first_question=questions[0].question,
                    lang=lang,
                )

            return self.write_json(
                {
                    "prediction": prediction,
                    "questions": [question.to_payload() for question in questions],
                    "doctor_snapshot": doctor_snapshot,
                    "assistant_message": assistant_message,
                }
            )
        except Exception as exc:
            return self.write_json({"error": f"triage failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_recommend(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        message = str(payload.get("message", "")).strip()
        answers = payload.get("answers", [])
        lang = normalize_lang(payload.get("lang", "ar"))
        attachment_context = str(payload.get("attachment_context", "")).strip()
        profile_role = str(payload.get("profile_role", "")).strip()

        if not message:
            return self.write_json({"error": "message is required"}, status=HTTPStatus.BAD_REQUEST)
        if not isinstance(answers, list):
            return self.write_json({"error": "answers must be a list"}, status=HTTPStatus.BAD_REQUEST)

        try:
            model_input = merge_message_with_context(message, attachment_context, profile_role)
            result = SYSTEM.recommend(model_input, answers)
            explanation_preview = SYSTEM.explain(model_input)
            explanation_preview = localize_explanation(explanation_preview, result["prediction"], lang)
            rag_query_text = build_rag_query_text(model_input, qa_pairs=result["qa_pairs"], prediction=result["prediction"])

            report = SYSTEM.build_doctor_report(
                complaint=message,
                prediction=result["prediction"],
                recommendation=result["recommendation"],
                qa_pairs=result["qa_pairs"],
                explanation=explanation_preview,
            )
            report["_rag_query_text"] = rag_query_text
            report["_attachment_context"] = attachment_context[:900]
            report = localize_report(report, lang, raw_prediction=result["prediction"])

            assistant_message = build_recommendation_chat_reply(
                complaint=message,
                prediction=result["prediction"],
                recommendation=result["recommendation"],
                lang=lang,
                qa_pairs=result["qa_pairs"],
            )

            return self.write_json(
                {
                    "prediction": result["prediction"],
                    "recommendation": result["recommendation"],
                    "report": report,
                    "summary": result["summary"],
                    "assistant_message": assistant_message,
                }
            )
        except Exception as exc:
            return self.write_json({"error": f"recommendation failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_explain(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        message = str(payload.get("message", "")).strip()
        lang = normalize_lang(payload.get("lang", "ar"))

        if not message:
            return self.write_json({"error": "message is required"}, status=HTTPStatus.BAD_REQUEST)

        try:
            prediction = SYSTEM.predict(message)
            explanation = SYSTEM.explain(message)
            explanation = localize_explanation(explanation, prediction, lang)
            return self.write_json({"explanation": explanation})
        except Exception as exc:
            return self.write_json({"error": f"explanation failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_supportive_tips(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        specialty = str(payload.get("specialty", "")).strip()
        risk_level = str(payload.get("risk_level", "")).strip()
        complaint = str(payload.get("complaint", "")).strip()
        lang = normalize_lang(payload.get("lang", "ar"))

        try:
            tips = SYSTEM.get_supportive_optional_tips(
                specialty=specialty,
                risk_level=risk_level,
                complaint=complaint,
            )
            return self.write_json({"tips": localize_tips(tips, lang)})
        except Exception as exc:
            return self.write_json({"error": f"tips failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_follow_up_message(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        complaint = str(payload.get("complaint", "")).strip()
        question = str(payload.get("question", "")).strip()
        answers = payload.get("answers", [])
        lang = normalize_lang(payload.get("lang", "ar"))

        if not complaint:
            return self.write_json({"error": "complaint is required"}, status=HTTPStatus.BAD_REQUEST)
        if not question:
            return self.write_json({"error": "question is required"}, status=HTTPStatus.BAD_REQUEST)
        if not isinstance(answers, list):
            return self.write_json({"error": "answers must be a list"}, status=HTTPStatus.BAD_REQUEST)

        try:
            assistant_message = build_followup_chat_reply(question, lang=lang)
            return self.write_json({"assistant_message": assistant_message})
        except Exception as exc:
            return self.write_json({"error": f"follow-up generation failed: {exc}"}, status=HTTPStatus.INTERNAL_SERVER_ERROR)

    def handle_text_to_speech(self):
        payload = self.read_json()
        if payload is None:
            return self.write_json({"error": "Invalid JSON body."}, status=HTTPStatus.BAD_REQUEST)

        text = str(payload.get("text", "")).strip()
        lang = normalize_lang(payload.get("lang", "ar"))

        if not text:
            return self.write_json({"error": "text is required"}, status=HTTPStatus.BAD_REQUEST)

        audio_bytes, content_type, error = synthesize_azure_speech(text, lang)
        if audio_bytes and content_type:
            return self.write_bytes(audio_bytes, content_type)

        config = get_azure_speech_config(lang)
        message = error or "Azure Speech text-to-speech failed."
        status = HTTPStatus.SERVICE_UNAVAILABLE if "not configured" in message.lower() else HTTPStatus.BAD_GATEWAY
        return self.write_json(
            {
                "error": message,
                "fallback": "browser",
                "voice": config["voice"],
                "locale": config["lang"],
            },
            status=status,
        )


def run():
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Serving on http://{host}:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
