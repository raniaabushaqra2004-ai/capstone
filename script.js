const STORAGE_KEY = "medika-ai-session-v2";
const SESSION_HISTORY_KEY = "medika-ai-history-v1";
const ANALYTICS_KEY = "medika-ai-analytics-v1";
const CONSENT_KEY = "medika-ai-consent-v1";
const PROFILE_DIRECTORY_KEY = "medika-ai-profiles-v1";
const ACTIVE_PROFILE_KEY = "medika-ai-active-profile-v1";
const REMINDER_STATE_KEY = "medika-ai-reminders-v1";
const NOTIFICATION_STATE_KEY = "medika-ai-browser-notifications-v1";
const MAX_SESSION_HISTORY = 6;
const MAX_ANALYTICS_EVENTS = 240;
const MAX_ATTACHMENTS = 6;
const MAX_REMINDERS = 18;
const REVIEW_STATUS_VALUES = ["new", "reviewed", "follow_up", "closed"];
const NOTIFICATION_SWEEP_INTERVAL_MS = 15 * 60 * 1000;

let serviceWorkerRegistrationPromise = null;
let browserNotificationLoopStarted = false;

const navToggle = document.querySelector(".nav-toggle");
const navPanel = document.querySelector(".nav-panel");
const yearNode = document.getElementById("year");
const revealItems = document.querySelectorAll(".reveal");
const contactForm = document.querySelector(".contact-form");
const langToggle = document.getElementById("lang-toggle");
const langToggleLabel = document.getElementById("lang-toggle-label");
const chatLangToggle = document.getElementById("chat-lang-toggle");
const chatLangToggleLabel = document.getElementById("chat-lang-toggle-label");
const isHomePage = document.body?.classList.contains("home-page");
const isChatPage = document.body?.classList.contains("chat-page");
const isDashboardPage = document.body?.classList.contains("dashboard-page");

const LANGUAGE_KEY = "medika-home-language-v1";
const AUDIO_PREF_KEY = "medika-audio-enabled-v1";
const THEME_KEY = "medika-theme-v1";
const THEME_META_LIGHT = "#7b183f";
const THEME_META_DARK = "#111827";

const createSessionId = () => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `session-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
};

const buildLocalProfile = (role = "patient", overrides = {}) => ({
    id: overrides.id || `${role}-local`,
    role,
    name: overrides.name || (role === "doctor" ? "الطبيب" : "المستخدم"),
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
});

const getDefaultProfiles = () => [
    buildLocalProfile("patient", { id: "patient-local", name: "المستخدم" }),
    buildLocalProfile("doctor", { id: "doctor-local", name: "الطبيب" }),
];

const getAppConfig = () => {
    if (typeof window === "undefined") {
        return {};
    }

    return window.MEDIKA_CONFIG || {};
};

const getApiBase = () => {
    const apiBase = String(getAppConfig().apiBase || "").trim();
    if (!apiBase) {
        return "";
    }

    return apiBase.replace(/\/+$/, "");
};

const buildApiUrl = (path) => {
    const normalizedPath = String(path || "").startsWith("/") ? String(path) : `/${String(path || "")}`;
    const apiBase = getApiBase();
    return apiBase ? `${apiBase}${normalizedPath}` : normalizedPath;
};

const HOME_TRANSLATIONS = {
    ar: {
        meta_title: "Medika AI | التوجيه الطبي الذكي",
        meta_description:
            "Medika AI منصة عربية للتوجيه الطبي الأولي تقدم تجربة أوضح، أسئلة متابعة منظمة، ونتائج قابلة للفهم للمستخدم والطبيب.",
        brand_tagline: "التوجيه الطبي الذكي",
        nav_home: "الرئيسية",
        nav_about: "عن النظام",
        nav_features: "المزايا",
        nav_team: "الفريق",
        nav_contact: "تواصل معنا",
        nav_start: "ابدأ الاستشارة",
        hero_badge: "منصة عربية أوضح للتوجيه الطبي الأولي",
        hero_title: "صف الشكوى بطريقة بسيطة، وخذ توجيهًا مرتبًا يبدو وكأنه جزء من منتج طبي حقيقي.",
        hero_text:
            "Medika AI يحول وصف الأعراض إلى تجربة أوضح: أسئلة متابعة قصيرة، تخصص طبي أقرب، درجة خطورة مفهومة، ثم تقرير مرتب يمكن عرضه على الطبيب بدل النتائج المبعثرة أو الكلام الغامض.",
        hero_insight_1: "عرض أنظف",
        hero_insight_2: "أسئلة أذكى",
        hero_insight_3: "تقرير جاهز",
        hero_cta_primary: "ابدأ الاستشارة الآن",
        hero_cta_secondary: "شاهد المزايا",
        hero_trust_1: "عربية وواضحة",
        hero_trust_2: "مسار قصير ومنظم",
        hero_trust_3: "تقرير جاهز للطبيب",
        hero_metric_1: "خطوات فقط من الشكوى إلى النتيجة",
        hero_metric_2: "واجهة واحدة لمسار واضح ومفهوم",
        hero_metric_3: "تجربة مصممة للقراءة العربية",
        hero_step_1_title: "اكتب الأعراض",
        hero_step_1_text: "باللغة العربية وبالطريقة التي تتكلم بها عادة.",
        hero_step_2_title: "أجب عن أسئلة قصيرة",
        hero_step_2_text: "حتى يبني النظام صورة أوضح للحالة.",
        hero_step_3_title: "استلم التوجيه",
        hero_step_3_text: "تخصص متوقع وخطوة متابعة وملف منظم.",
        hero_disclaimer:
            "هذه الأداة مخصصة للتوجيه الأولي فقط، ولا تغني عن مراجعة الطبيب أو الطوارئ عند وجود أعراض شديدة أو متفاقمة أو علامات إنذارية.",
        preview_live: "جلسة توجيه حية",
        preview_user_message: "عندي ألم معدة مع غثيان من الصباح",
        preview_bot_message: "سنرتب الحالة بسرعة. هل الألم يزداد؟ وهل يوجد قيء أو حرارة؟",
        preview_result_kicker: "النتيجة الأولية",
        preview_result_risk: "متوسط",
        preview_specialty: "الجهاز الهضمي",
        preview_result_text:
            "التخصص الأقرب بناءً على الشكوى والإجابات المرافقة مع حاجة إلى متابعة طبية منظمة.",
        preview_result_point_1: "أسئلة قصيرة ومباشرة",
        preview_result_point_2: "تفسير واضح للقرار",
        preview_result_point_3: "تقرير يمكن عرضه على الطبيب",
        preview_report_title: "ملخص الطبيب",
        proof_label_1: "وضوح الفكرة",
        proof_title_1: "الزائر يفهم المنتج من أول شاشة",
        proof_text_1:
            "بدل صفحة نصية فقط، أصبح هناك شرح بصري مباشر يوضح شكل التجربة والنتيجة النهائية داخل المنتج.",
        proof_label_2: "قيمة حقيقية",
        proof_title_2: "النتيجة ليست اسم تخصص فقط",
        proof_text_2:
            "المستخدم يحصل على تخصص متوقع، مستوى خطورة، خطوة متابعة، ثم صفحات مستقلة للتقرير والتفسير والطب التكميلي.",
        proof_label_3: "انطباع مهني",
        proof_title_3: "تصميم يرفع الثقة قبل أول نقرة",
        proof_text_3:
            "كل جزء في الصفحة الآن يوضح أن المشروع منظم، مقصود، وأسهل للفهم على المستخدم والطبيب معًا.",
        journey_eyebrow: "رحلة المستخدم",
        journey_title: "من الشكوى إلى التقرير في مسار واحد متسلسل.",
        journey_text:
            "صممنا الصفحة الرئيسية لتقود الزائر ذهنيًا إلى ما سيحدث لاحقًا داخل النظام، بحيث لا تبقى الفكرة نظرية بل تصبح مرئية ومفهومة من أول نظرة.",
        journey_step_1_title: "وصف الحالة",
        journey_step_1_text: "المستخدم يكتب الشكوى باللغة العربية الطبيعية كما يتحدث عادة.",
        journey_step_2_title: "أسئلة متابعة",
        journey_step_2_text: "النظام يرتب أسئلة قصيرة تبني صورة أوضح عن الشدة والمخاطر.",
        journey_step_3_title: "نتيجة قابلة للفهم",
        journey_step_3_text: "التخصص المتوقع والخطوة التالية يظهران مع تفسير وتقرير نهائي منظم.",
        showcase_eyebrow: "داخل المنصة",
        showcase_title: "التجربة ليست مجرد شات، بل طبقة قرار كاملة.",
        showcase_text:
            "الواجهة الجديدة تشرح قيمة المنتج قبل الضغط على أي زر: محادثة مرتبة، نتيجة قابلة للفهم، ملخص للطبيب، ثم صفحات مستقلة لكل جزء مهم من التجربة.",
        showcase_list_1: "مسار واحد واضح من أول وصف إلى الخطوة التالية.",
        showcase_list_2: "فصل ذكي بين الشات، التقرير، التفسير، والطب التكميلي.",
        showcase_list_3: "لغة بصرية أنظف تعطي انطباعًا أكثر مهنية وثقة.",
        showcase_card_1_label: "واجهة المحادثة",
        showcase_card_1_title: "أسئلة قصيرة تقلل الفوضى",
        showcase_card_1_text:
            "كل سؤال مصمم ليضيف قيمة فعلية إلى القرار بدل إغراق المستخدم بنموذج طويل ومربك.",
        showcase_card_2_label: "طبقة القرار",
        showcase_card_2_title: "نتيجة مفهومة وليست غامضة",
        showcase_card_2_text:
            "التخصص المتوقع، مستوى الخطورة، والخطوة العملية التالية تظهر بصياغة يمكن فهمها بسرعة.",
        showcase_card_3_label: "الملف النهائي",
        showcase_card_3_title: "صفحات جاهزة للمراجعة والعرض",
        showcase_card_3_text:
            "بدل تجميع كل شيء في مكان واحد، تم توزيع المخرجات على صفحات مستقلة أكثر ترتيبًا وسهولة.",
        workflow_title_1: "بداية بسيطة",
        workflow_text_1: "الواجهة مصممة لتوصلك مباشرة إلى الهدف بدون أي عناصر مشتتة أو غير مفهومة.",
        workflow_title_2: "تدرج واضح",
        workflow_text_2: "كل خطوة في المسار مبنية لتكون أوضح من التي قبلها، من الشكوى حتى التقرير النهائي.",
        workflow_title_3: "مخرجات جاهزة",
        workflow_text_3: "يمكنك التنقل بين صفحات مستقلة للتقرير الطبي، التفسير، والإرشادات الداعمة حسب الحاجة.",
        about_eyebrow: "عن النظام",
        about_title: "فكرة أوضح وتجربة أنضف.",
        about_text:
            "هدف Medika AI هو جعل التوجيه الطبي الأولي باللغة العربية أكثر وضوحًا، وأكثر هدوءًا، وأسهل على المستخدم والطبيب في نفس الوقت.",
        about_card_1_title: "فهم الاستفسار العربي",
        about_card_1_text: "يتعامل مع الأعراض كما يكتبها المستخدم بطريقة طبيعية، بدون حاجة إلى صياغة معقدة.",
        about_card_2_title: "توجيه آمن",
        about_card_2_text: "يعطي توصية أولية فقط مع إبراز الحالات التي يجب ألا تؤخر التقييم الطبي المباشر.",
        about_card_3_title: "مخرجات منظمة",
        about_card_3_text: "كل نتيجة تتحول إلى صفحات مرتبة: تقرير للطبيب، تفسير للقرار، وإرشادات داعمة عند الحاجة.",
        features_eyebrow: "المزايا",
        features_title: "واجهة أنظف، قراءة أسرع، وانطباع أكثر مهنية.",
        features_text:
            "تم إعادة ترتيب الصفحة بحيث تركز على الفكرة الأساسية والنتيجة الفعلية بدل أي بلوكات شكلية غير مفيدة.",
        features_card_1_title: "دخول مباشر",
        features_card_1_text: "زر البداية واضح ويقودك مباشرة إلى الشات دون التباس.",
        features_card_2_title: "تنقل بين صفحات",
        features_card_2_text: "فصلنا التقرير والتفسير والإرشادات الداعمة إلى صفحات مستقلة حتى تكون القراءة أرتب.",
        features_card_3_title: "تجربة عربية",
        features_card_3_text: "كل النصوص والهيراركية البصرية مبنية لتناسب القراءة العربية بشكل أفضل.",
        features_card_4_title: "تواصل واضح",
        features_card_4_text: "إيميلات المشروع والتواصل موجودة بوضوح في الواجهة الرئيسية وقسم التواصل.",
        team_eyebrow: "الفريق",
        team_title: "فريق المشروع",
        team_text:
            "الفريق عمل على الدمج بين التوجيه الطبي الأولي والتجربة البصرية النظيفة في واجهة عربية مبسطة.",
        team_role_1: "علوم البيانات والذكاء الاصطناعي",
        team_role_2: "علوم البيانات والذكاء الاصطناعي",
        team_role_3: "علوم الحاسوب",
        contact_eyebrow: "تواصل معنا",
        contact_title: "كل شيء واضح حتى في التواصل.",
        contact_text:
            "إذا أردتِ إرسال ملاحظات على التجربة أو متابعة تطوير المشروع أو طلب نسخة العرض، ستجدين كل وسائل التواصل بشكل مرتب هنا.",
        contact_point_1_label: "إيميل المشروع",
        contact_point_2_label: "إيميل التواصل",
        contact_point_3_label: "اسم المنصة",
        contact_point_4_label: "الخدمة",
        contact_point_4_value: "توجيه طبي أولي باللغة العربية",
        contact_form_name_label: "الاسم الكامل",
        contact_form_name_placeholder: "أدخل اسمك",
        contact_form_email_label: "البريد الإلكتروني",
        contact_form_email_placeholder: "name@example.com",
        contact_form_message_label: "الرسالة",
        contact_form_message_placeholder: "اكتب رسالتك هنا.",
        contact_form_submit: "إرسال الرسالة",
        contact_form_sent: "تم الإرسال",
        footer_tagline: "واجهة التوجيه الطبي الذكي باللغة العربية",
    },
    en: {
        meta_title: "Medika AI | Smart Medical Guidance",
        meta_description:
            "Medika AI is a clearer Arabic-first platform for first-line medical guidance with structured follow-up questions and doctor-friendly outputs.",
        brand_tagline: "Smart Medical Guidance",
        nav_home: "Home",
        nav_about: "About",
        nav_features: "Features",
        nav_team: "Team",
        nav_contact: "Contact",
        nav_start: "Start Consultation",
        hero_badge: "A clearer Arabic-first platform for first-line medical guidance",
        hero_title: "Describe the complaint simply, then get a structured direction that feels like part of a real medical product.",
        hero_text:
            "Medika AI turns symptom descriptions into a clearer experience: short follow-up questions, the closest specialty, an understandable risk level, and a tidy summary you can actually show to a doctor.",
        hero_insight_1: "Cleaner view",
        hero_insight_2: "Smarter questions",
        hero_insight_3: "Ready report",
        hero_cta_primary: "Start Now",
        hero_cta_secondary: "Explore Features",
        hero_trust_1: "Arabic-first clarity",
        hero_trust_2: "Short, structured flow",
        hero_trust_3: "Doctor-ready summary",
        hero_metric_1: "Steps from complaint to result",
        hero_metric_2: "Single interface for one clear path",
        hero_metric_3: "Designed for Arabic reading patterns",
        hero_step_1_title: "Write the symptoms",
        hero_step_1_text: "Use natural language, the way people actually describe their condition.",
        hero_step_2_title: "Answer short questions",
        hero_step_2_text: "So the system can build a clearer picture of the case.",
        hero_step_3_title: "Receive the direction",
        hero_step_3_text: "Expected specialty, next step, and an organized summary.",
        hero_disclaimer:
            "This tool is only for first-line guidance and does not replace a doctor or emergency care when symptoms are severe, worsening, or alarming.",
        preview_live: "Live guidance session",
        preview_user_message: "I have stomach pain with nausea since this morning",
        preview_bot_message: "We’ll organize this quickly. Is the pain getting worse? Any vomiting or fever?",
        preview_result_kicker: "Initial result",
        preview_result_risk: "Medium",
        preview_specialty: "Gastroenterology",
        preview_result_text:
            "The closest specialty based on the complaint and the follow-up answers, with a need for organized medical follow-up.",
        preview_result_point_1: "Short direct questions",
        preview_result_point_2: "Clear decision rationale",
        preview_result_point_3: "Doctor-shareable summary",
        preview_report_title: "Doctor Summary",
        proof_label_1: "Immediate clarity",
        proof_title_1: "The visitor understands the product from the first screen",
        proof_text_1:
            "Instead of a text-only landing page, the product now explains itself visually from the first glance.",
        proof_label_2: "Real value",
        proof_title_2: "The result is more than just a specialty name",
        proof_text_2:
            "Users get an expected specialty, risk level, next step, then separate pages for the report, reasoning, and supportive guidance.",
        proof_label_3: "Professional feel",
        proof_title_3: "The design builds trust before the first click",
        proof_text_3:
            "Each block now signals that the project is intentional, organized, and easier for both users and doctors to understand.",
        journey_eyebrow: "User Journey",
        journey_title: "From complaint to report in one connected flow.",
        journey_text:
            "The home page now previews what happens next inside the system, so the concept feels visible and concrete instead of abstract.",
        journey_step_1_title: "Describe the case",
        journey_step_1_text: "The user writes the complaint in natural language, the way they would normally speak.",
        journey_step_2_title: "Follow-up questions",
        journey_step_2_text: "The system organizes short questions to clarify severity and risk.",
        journey_step_3_title: "Readable result",
        journey_step_3_text: "The expected specialty and next step appear with an explanation and an organized final report.",
        showcase_eyebrow: "Inside the Product",
        showcase_title: "This is not just a chat box. It is a full decision layer.",
        showcase_text:
            "The refreshed landing page explains the product before any click: structured conversation, readable result, doctor summary, and separate pages for every important part of the journey.",
        showcase_list_1: "One clear path from first description to next step.",
        showcase_list_2: "A smart separation between chat, report, reasoning, and supportive care.",
        showcase_list_3: "A cleaner visual language with a more premium and trustworthy tone.",
        showcase_card_1_label: "Conversation Layer",
        showcase_card_1_title: "Short questions, less confusion",
        showcase_card_1_text:
            "Each question is meant to add real signal instead of overwhelming the user with a long form.",
        showcase_card_2_label: "Decision Layer",
        showcase_card_2_title: "A result people can actually understand",
        showcase_card_2_text:
            "Expected specialty, risk level, and the practical next step are all shown in language that reads quickly.",
        showcase_card_3_label: "Final Output",
        showcase_card_3_title: "Pages ready for review and sharing",
        showcase_card_3_text:
            "Instead of forcing everything into one screen, outputs are split into separate, cleaner pages.",
        workflow_title_1: "Simple start",
        workflow_text_1: "The interface is built to move straight toward the goal without noisy or confusing elements.",
        workflow_title_2: "Clear progression",
        workflow_text_2: "Each step is clearer than the one before it, from complaint to final report.",
        workflow_title_3: "Ready outputs",
        workflow_text_3: "You can move through separate pages for the medical report, rationale, and supportive care as needed.",
        about_eyebrow: "About",
        about_title: "A clearer idea with a cleaner experience.",
        about_text:
            "Medika AI aims to make first-line medical guidance in Arabic more readable, calmer, and easier for both users and doctors.",
        about_card_1_title: "Understands Arabic input",
        about_card_1_text: "It handles symptoms the way people naturally write them, without forcing complex phrasing.",
        about_card_2_title: "Safer guidance",
        about_card_2_text: "It offers first-line direction only, while highlighting cases that should not delay medical evaluation.",
        about_card_3_title: "Structured outputs",
        about_card_3_text: "Each result becomes a set of organized pages: report, rationale, and supportive guidance when needed.",
        features_eyebrow: "Features",
        features_title: "Cleaner interface, faster reading, stronger professional feel.",
        features_text:
            "The page is now reorganized around the real value of the product instead of generic decorative blocks.",
        features_card_1_title: "Direct entry",
        features_card_1_text: "The main entry button is obvious and leads directly to the consultation flow.",
        features_card_2_title: "Multi-page structure",
        features_card_2_text: "Report, reasoning, and supportive care are split into cleaner standalone pages.",
        features_card_3_title: "Arabic-first experience",
        features_card_3_text: "Typography, spacing, and hierarchy are shaped around Arabic reading behavior.",
        features_card_4_title: "Clear communication",
        features_card_4_text: "Project and contact details are visible and organized in the interface.",
        team_eyebrow: "Team",
        team_title: "Project Team",
        team_text:
            "The team worked on combining first-line medical guidance with a clean visual experience in an Arabic-first interface.",
        team_role_1: "Data Science and AI",
        team_role_2: "Data Science and AI",
        team_role_3: "Computer Science",
        contact_eyebrow: "Contact",
        contact_title: "Even communication feels more organized.",
        contact_text:
            "If you want to send feedback, follow the project, or request the presentation version, everything is gathered here more cleanly.",
        contact_point_1_label: "Project email",
        contact_point_2_label: "General contact",
        contact_point_3_label: "Platform",
        contact_point_4_label: "Service",
        contact_point_4_value: "First-line medical guidance in Arabic",
        contact_form_name_label: "Full name",
        contact_form_name_placeholder: "Enter your name",
        contact_form_email_label: "Email",
        contact_form_email_placeholder: "name@example.com",
        contact_form_message_label: "Message",
        contact_form_message_placeholder: "Write your message here.",
        contact_form_submit: "Send Message",
        contact_form_sent: "Sent",
        footer_tagline: "Arabic-first smart medical guidance interface",
    },
};

const CHAT_TRANSLATIONS = {
    ar: {
        meta_title: "Medika AI | الاستشارة الذكية",
        meta_description:
            "واجهة الاستشارة الذكية في Medika AI لبناء مسار منظم من الشكوى حتى التقرير الطبي والصفحات التوضيحية.",
        brand_tagline: "الاستشارة الذكية",
        nav_about: "عن النظام",
        nav_features: "المزايا",
        nav_team: "الفريق",
        nav_contact: "تواصل معنا",
        back_home: "العودة للرئيسية",
        hero_badge: "مسار واضح من الشكوى حتى الصفحات النهائية",
        hero_title: "ابدأ من هنا، واتركي الباقي على النظام.",
        hero_text:
            "هذه الصفحة مخصصة فقط للمحادثة والأسئلة والمتابعة. بعد اكتمال النتيجة ستنتقلين إلى صفحات مستقلة للتقرير الطبي، تفسير القرار، والإرشادات الداعمة عند الطلب.",
        hero_highlight_1_title: "أسئلة قصيرة",
        hero_highlight_1_text: "تبني الصورة خطوة بخطوة",
        hero_highlight_2_title: "نتيجة أوضح",
        hero_highlight_2_text: "تخصص أقرب مع مستوى خطورة",
        hero_highlight_3_title: "صفحات جاهزة",
        hero_highlight_3_text: "ملخص، تفسير، وإرشادات عند الطلب",
        stage_title: "مسار الجلسة",
        stage_note: "5 محطات واضحة",
        stage_complaint: "1. الشكوى",
        stage_questions: "2. أسئلة المتابعة",
        stage_recommendation: "3. النتيجة",
        stage_explanation: "4. التفسير",
        stage_tips: "5. إرشادات داعمة",
        session_step_label: "المسار الحالي",
        session_pages_label: "الصفحات الجاهزة",
        session_attachments_label: "المرفقات",
        status_questions: "أسئلة متابعة",
        status_result_ready: "النتيجة جاهزة",
        status_completed: "الصفحات جاهزة",
        action_ready: "جاهزة الآن",
        helper_kicker: "كيف تكتب الشكوى؟",
        helper_title: "اكتبها بطريقتك العادية",
        helper_text:
            "لا تحتاج إلى مصطلحات طبية. اكتب كما تتكلم عادة، وسنرتب الوصف إلى أسئلة وخطوات أوضح.",
        helper_example_label: "مثال طبيعي",
        helper_example_text: '"آه بحس نص راسي بوجعني كتير، بس النص يعني مش الكامل، فإيش هاد؟"',
        helper_note: "كلما كان الوصف طبيعيًا وواضحًا، كان المسار أسهل وأسرع.",
        quick_prompts_title: "أمثلة سريعة",
        quick_prompts_note: "ابدئي من مثال قريب",
        history_title: "آخر الجلسات",
        history_empty: "عند إكمال أي جلسة ستظهر هنا لاستعادتها سريعًا أو فتح تقريرها مباشرة.",
        history_load: "استعادة",
        history_open_report: "فتح التقرير",
        history_clear: "مسح",
        history_cleared: "تم مسح سجل الجلسات المحلية.",
        history_restored: "تمت استعادة جلسة سابقة. الصفحات الجاهزة أصبحت متاحة من جديد.",
        safety_title: "قاعدة الأمان",
        safety_text:
            "عند وجود أعراض شديدة أو مفاجئة أو مهددة للحياة، يجب مراجعة الطوارئ مباشرة وعدم الاعتماد على الموقع.",
        assistant_label: "المساعد السريري",
        session_title: "جلسة التوجيه الأولي",
        status_pill: "محادثة فقط",
        emergency_title: "تنبيه مهم",
        emergency_default: "تم رصد مؤشرات تتطلب تقييمًا طبيًا عاجلًا.",
        quick_replies_caption: "إجابات سريعة",
        action_links_caption: "الصفحات الجاهزة",
        input_label: "اكتب الأعراض",
        voice_label: "إملاء",
        speaker_toggle_off: "صوت: مطفأ",
        speaker_toggle_on: "صوت: شغّال",
        speaker_play: "استماع",
        speaker_stop: "إيقاف",
        new_label: "جديد",
        disclaimer:
            "هذه الصفحة للمحادثة فقط. التقرير، تفسير القرار، والإرشادات الداعمة ستظهر في صفحات منفصلة وأكثر ترتيبًا.",
        initial_assistant_message:
            "مرحبًا بك. اكتب الشكوى كما تصفها عادة، وسأرتب معك المسار خطوة بخطوة حتى نجهز النتيجة والصفحات النهائية.",
        placeholder_complaint: "اكتب الأعراض هنا... مثال: أشعر بألم في الصدر مع خفقان",
        placeholder_answer_text: "اكتب إجابتك هنا",
        placeholder_answer_choice: "اختر من الإجابات السريعة أو اكتب الإجابة يدويًا",
        placeholder_tips: "اكتب نعم أو لا",
        placeholder_completed: "ابدأ شكوى جديدة أو اضغط زر جديد",
        ready_pages_message:
            "تم تجهيز صفحتين مستقلتين: ملخص الطبيب وتفسير القرار. يمكنك فتحهما الآن من البطاقات الجاهزة أدناه.",
        ask_tips_message: "هل تريدين تجهيز صفحة الإرشادات الداعمة أيضًا؟",
        finished_session_message:
            "تم إنهاء الجلسة. صفحات ملخص الطبيب وتفسير القرار جاهزة أمامك ويمكنك فتح أي منها الآن.",
        reset_session_message: "تمت إعادة ضبط الجلسة. اكتب شكوى جديدة وسأبدأ من الصفر.",
        yes_no_prompt: "يرجى الإجابة بـ نعم أو لا.",
        voice_error: "تعذر تحويل الصوت إلى نص في هذا المتصفح أو في هذه اللحظة.",
        voice_unsupported: "ميزة تحويل الصوت إلى نص غير مدعومة في هذا المتصفح.",
        tts_error: "تعذر تشغيل القراءة الصوتية الآن.",
        tts_unsupported: "ميزة قراءة الرد بصوت مسموع غير مدعومة في هذا المتصفح.",
        tts_arabic_setup_needed:
            "الصوت العربي غير جاهز بشكل صحيح على هذا المتصفح. فعّل Azure Speech بالمفاتيح، أو ثبّت صوت عربي في النظام، ثم أعد المحاولة.",
        server_error: "تعذر الاتصال بالخادم المحلي. تأكد من تشغيل app.py ثم أعد المحاولة.",
        triage_error: "حدث خطأ أثناء تحليل الشكوى.",
        recommendation_error: "تعذر إعداد التوصية النهائية.",
        build_result_error: "حدث خطأ أثناء بناء النتيجة النهائية.",
        tips_error: "تعذر تجهيز صفحة الإرشادات الداعمة حاليًا.",
        tips_ready_message: "تم تجهيز صفحة الإرشادات الداعمة الآن، وسأفتحها لك مباشرة.",
        report_title: "ملخص الطبيب",
        report_text: "صفحة مستقلة ومنظمة للحالة الطبية والملخص السريري.",
        decision_title: "تفسير القرار",
        decision_text: "لماذا وصل النظام إلى هذه النتيجة وكيف بُني التحليل.",
        tips_title: "إرشادات داعمة",
        tips_text: "صفحة مفصلة للإرشادات الداعمة المؤقتة عند الطلب.",
        yes: "نعم",
        no: "لا",
        bot_role: "المساعد",
        user_role: "أنت",
        triage_prefix:
            "أفهم من وصفك أن التخصص الأقرب مبدئيًا هو {specialty}. هذا ما يزال توجيهًا أوليًا، وسأطرح عليك الآن بعض الأسئلة القصيرة حتى تتضح الصورة بشكل أفضل.\n{question}",
        followup_prefix: "شكرًا لك. حتى أرتب الحالة بشكل أدق، {question}",
        recommendation_prefix:
            "بعد مراجعة الشكوى والإجابات، يبدو أن التخصص الأقرب مبدئيًا هو {specialty}. كما أن مستوى الخطورة الحالي هو {risk}, والخطوة العملية التالية المقترحة هي {timing}.\n\nهذا التوجيه أولي ولا يغني عن المراجعة الطبية المباشرة، خاصة إذا كانت الأعراض مستمرة أو متفاقمة.",
        tips_preview_empty: "لا توجد إرشادات إضافية متاحة في هذه الحالة.",
        tips_preview_ready: "تم تجهيز صفحة الإرشادات الداعمة بالتفاصيل الكاملة.",
    },
    en: {
        meta_title: "Medika AI | Smart Consultation",
        meta_description:
            "Medika AI consultation interface for a structured path from the complaint to follow-up questions, a readable result, and organized output pages.",
        brand_tagline: "Smart Consultation",
        nav_about: "About",
        nav_features: "Features",
        nav_team: "Team",
        nav_contact: "Contact",
        back_home: "Back Home",
        hero_badge: "A clear path from the complaint to the final pages",
        hero_title: "Start here and let the system organize the rest.",
        hero_text:
            "This page is only for the conversation, follow-up questions, and the organized flow. Once the result is ready, you will move to separate pages for the doctor summary, decision explanation, and supportive care on request.",
        hero_highlight_1_title: "Short questions",
        hero_highlight_1_text: "Build the picture step by step",
        hero_highlight_2_title: "Clearer result",
        hero_highlight_2_text: "Closest specialty with risk level",
        hero_highlight_3_title: "Ready pages",
        hero_highlight_3_text: "Summary, explanation, and guidance on request",
        stage_title: "Session Flow",
        stage_note: "5 clear stops",
        stage_complaint: "1. Complaint",
        stage_questions: "2. Follow-up Questions",
        stage_recommendation: "3. Result",
        stage_explanation: "4. Explanation",
        stage_tips: "5. Supportive Care",
        session_step_label: "Current step",
        session_pages_label: "Ready pages",
        session_attachments_label: "Attachments",
        status_questions: "Follow-up live",
        status_result_ready: "Result ready",
        status_completed: "Pages ready",
        action_ready: "Ready now",
        helper_kicker: "What should you write?",
        helper_title: "Describe it the way you normally speak",
        helper_text:
            "You do not need medical terms. Write the complaint naturally, and we will turn it into clearer questions and next steps.",
        helper_example_label: "Natural example",
        helper_example_text:
            '"It feels like only one side of my head hurts a lot, not the whole head. What could that be?"',
        helper_note: "The clearer and more natural the description is, the smoother the session becomes. For the strongest result right now, natural Arabic descriptions still work best.",
        quick_prompts_title: "Quick Examples",
        quick_prompts_note: "Start from a close example",
        history_title: "Recent Sessions",
        history_empty: "Completed sessions will appear here so you can reopen them quickly or jump straight to the report.",
        history_load: "Restore",
        history_open_report: "Open Report",
        history_clear: "Clear",
        history_cleared: "Local session history was cleared.",
        history_restored: "A previous session was restored. The ready pages are available again.",
        safety_title: "Safety Rule",
        safety_text:
            "If the symptoms are severe, sudden, or life-threatening, the user should go to emergency care directly and not rely on the website.",
        assistant_label: "Clinical Assistant",
        session_title: "Initial Guidance Session",
        status_pill: "Chat only",
        emergency_title: "Important alert",
        emergency_default: "Signals were detected that may require urgent medical evaluation.",
        quick_replies_caption: "Quick replies",
        action_links_caption: "Ready pages",
        input_label: "Write the symptoms",
        voice_label: "Dictate",
        speaker_toggle_off: "Audio: Off",
        speaker_toggle_on: "Audio: On",
        speaker_play: "Listen",
        speaker_stop: "Stop",
        new_label: "New",
        disclaimer:
            "This page is for the conversation only. The report, decision explanation, and supportive care will appear in separate, cleaner pages.",
        initial_assistant_message:
            "Welcome. Write the complaint the way you would normally describe it, and I will organize the session with you step by step until the result and final pages are ready.",
        placeholder_complaint: "Describe the symptoms here... Example: I feel chest pain with palpitations",
        placeholder_answer_text: "Write your answer here",
        placeholder_answer_choice: "Choose from the quick replies or type the answer manually",
        placeholder_tips: "Type yes or no",
        placeholder_completed: "Start a new complaint or press New",
        ready_pages_message:
            "Two separate pages are now ready: Doctor Summary and Decision Explanation. You can open them now from the cards below.",
        ask_tips_message: "Would you like me to prepare the supportive care page too?",
        finished_session_message:
            "The session is complete. The Doctor Summary and Decision Explanation pages are ready, and you can open either one now.",
        reset_session_message: "The session has been reset. Write a new complaint and I will start again from the beginning.",
        yes_no_prompt: "Please answer with yes or no.",
        voice_error: "Voice-to-text could not be completed in this browser or at this moment.",
        voice_unsupported: "Voice-to-text is not supported in this browser.",
        tts_error: "Text-to-speech could not be played right now.",
        tts_unsupported: "Read-aloud is not supported in this browser.",
        tts_arabic_setup_needed:
            "Arabic voice output is not properly available in this browser. Configure Azure Speech keys or install an Arabic system voice, then try again.",
        server_error: "Could not connect to the local server. Make sure app.py is running and try again.",
        triage_error: "An error occurred while analyzing the complaint.",
        recommendation_error: "Could not prepare the final recommendation.",
        build_result_error: "An error occurred while building the final result.",
        tips_error: "The supportive care page could not be prepared right now.",
        tips_ready_message: "The supportive care page is ready now, and I will open it for you.",
        report_title: "Doctor Summary",
        report_text: "A separate organized page for the medical case and clinical summary.",
        decision_title: "Decision Explanation",
        decision_text: "Why the system reached this result and how the analysis was built.",
        tips_title: "Supportive Care",
        tips_text: "A separate page for temporary supportive guidance when requested.",
        yes: "Yes",
        no: "No",
        bot_role: "Assistant",
        user_role: "You",
        triage_prefix:
            "From your description, the closest specialty at this stage appears to be {specialty}. This is still an initial direction, and I will now ask a few short questions so the picture becomes clearer.\n{question}",
        followup_prefix: "Thank you. To organize the case more accurately, {question}",
        recommendation_prefix:
            "After reviewing the complaint and answers, the closest specialty at this stage appears to be {specialty}. The current risk level is {risk}, and the suggested next practical step is {timing}.\n\nThis is still an initial direction and does not replace direct medical evaluation, especially if the symptoms continue or get worse.",
        tips_preview_empty: "No additional supportive guidance is available in this case.",
        tips_preview_ready: "The supportive care page is now ready with the full details.",
    },
};

const CONSENT_COPY = {
    ar: {
        kicker: "قبل البدء",
        title: "موافقة سريعة واستخدام آمن",
        text:
            "هذه الأداة للتوجيه الطبي الأولي فقط، وليست بديلًا عن الطبيب أو الطوارئ. قد تُحفظ الجلسة والمرفقات محليًا على هذا الجهاز لتسهيل الرجوع إليها لاحقًا.",
        points: [
            "لا تستخدمها عند وجود أعراض مهددة للحياة.",
            "المخرجات مبدئية ويجب تأكيدها طبيًا.",
            "أي صور أو ملفات ترفقها ستظهر فقط داخل هذا الجهاز ما لم تقم بمشاركتها بنفسك.",
        ],
        check: "أفهم ذلك وأوافق على المتابعة.",
        accept: "موافق وأبدأ",
        decline: "العودة للرئيسية",
    },
    en: {
        kicker: "Before you start",
        title: "Quick consent and safe use",
        text:
            "This tool is for first-line medical guidance only. It does not replace a doctor or emergency care. The session and optional attachments may be stored locally on this device so you can reopen them later.",
        points: [
            "Do not rely on it for life-threatening symptoms.",
            "The output is preliminary and still needs medical confirmation.",
            "Any images or files you attach stay on this device unless you choose to share them.",
        ],
        check: "I understand this and agree to continue.",
        accept: "Agree and continue",
        decline: "Back to Home",
    },
};

const UPLOAD_COPY = {
    ar: {
        title: "مرفقات اختيارية",
        note: "تظهر في ملخص الطبيب فقط",
        skin: "صورة جلدية",
        file: "ملف طبي",
        empty: "لا توجد مرفقات بعد.",
        skinAdded: "تم إرفاق صورة جلدية. ستظهر في ملخص الطبيب ولوحة الطبيب.",
        fileAdded: "تم إرفاق ملف طبي كمرجع للجلسة الحالية.",
        removed: "تم حذف المرفق من الجلسة الحالية.",
        imageTooLarge: "الصورة كبيرة جدًا. حاول صورة أخف أو أصغر حجمًا.",
        limitReached: "تم الوصول إلى الحد الأقصى للمرفقات في هذه الجلسة.",
        parseFailed: "تم حفظ المرفق، لكن لم أستطع استخراج خلاصة واضحة منه.",
        remove: "حذف",
        imageLabel: "صورة جلدية",
        fileLabel: "ملف طبي",
        metaLabel: "مرجع محلي",
        insightLabel: "الخلاصة",
    },
    en: {
        title: "Optional attachments",
        note: "Shown in the doctor summary only",
        skin: "Skin image",
        file: "Medical file",
        empty: "No attachments yet.",
        skinAdded: "A skin image was attached. It will appear in the doctor summary and dashboard.",
        fileAdded: "A medical file was attached as context for this session.",
        removed: "The attachment was removed from this session.",
        imageTooLarge: "The image is too large. Try a lighter or smaller image.",
        limitReached: "The session reached the maximum number of attachments.",
        parseFailed: "The attachment was saved, but a clear local summary could not be extracted.",
        remove: "Remove",
        imageLabel: "Skin image",
        fileLabel: "Medical file",
        metaLabel: "Local reference",
        insightLabel: "Local insight",
    },
};

const ACCOUNT_COPY = {
    ar: {
        title: "هوية الجلسة",
        helper: "تظهر في التاريخ واللوحة",
        patient: "مريض",
        doctor: "طبيب",
        nameLabel: "الاسم الظاهر",
        namePlaceholderPatient: "مثال: أحمد",
        namePlaceholderDoctor: "مثال: د. ليان",
        save: "حفظ الهوية",
        saved: "تم تحديث الهوية النشطة",
        active: "الحساب النشط",
        roleLabel: "الدور",
        profileLabel: "الحساب",
    },
    en: {
        title: "Session identity",
        helper: "Shown in history and dashboard",
        patient: "Patient",
        doctor: "Doctor",
        nameLabel: "Display name",
        namePlaceholderPatient: "Example: Sarah",
        namePlaceholderDoctor: "Example: Dr. Lina",
        save: "Save profile",
        saved: "Active profile updated",
        active: "Active profile",
        roleLabel: "Role",
        profileLabel: "Profile",
    },
};

const DASHBOARD_COPY = {
    ar: {
        brand: "لوحة الطبيب",
        nav_about: "عن النظام",
        nav_features: "المزايا",
        nav_team: "الفريق",
        nav_contact: "تواصل معنا",
        back_chat: "العودة للشات",
        kicker: "عرض محلي للطبيب أو الفريق",
        title: "لوحة مراجعة الجلسات والمؤشرات",
        description:
            "صفحة تجمع الجلسات المحفوظة، مؤشرات الاستخدام المحلية، المرفقات، والتغذية الراجعة في مكان واحد لتسهيل المراجعة السريعة.",
        export: "تنزيل JSON",
        clear: "مسح المؤشرات",
        search: "بحث",
        risk: "الخطورة",
        role: "الدور",
        review: "حالة المراجعة",
        profile: "الحساب",
        specialty: "التخصص",
        all: "الكل",
        empty_title: "لا توجد جلسات محفوظة بعد",
        empty_text: "بعد إنهاء جلسة واحدة على الأقل، ستظهر هنا المؤشرات والبطاقات القابلة للفتح.",
        go_chat: "اذهب إلى الشات",
        open_report: "فتح الملخص",
        open_decision: "فتح التفسير",
        open_tips: "فتح الإرشادات",
        restore: "استعادة",
        no_tips: "لا توجد إرشادات بعد",
        attachmentCount: "عدد المرفقات",
        feedback: "آخر تقييم",
        exported: "تم تجهيز ملف JSON",
        cleared: "تم مسح المؤشرات المحلية.",
        profileTitle: "الحساب النشط",
        profileText: "هوية الجلسات الحالية داخل هذا الجهاز.",
        insightsTitle: "Insights سريعة",
        insightsText: "خلاصة مفيدة عن أكثر الأنماط شيوعًا في الجلسات المحفوظة.",
        remindersTitle: "متابعات وتذكيرات",
        remindersText: "عناصر محلية تساعدك على عدم نسيان الحالات أو الملفات التي تحتاج متابعة.",
        noReminders: "لا توجد تذكيرات مفتوحة الآن.",
        dismissReminder: "تم",
        reminderHighRisk: "حالة مرتفعة الخطورة تحتاج متابعة قريبة.",
        reminderDoctorNote: "هذه الجلسة لا تحتوي ملاحظة دكتور بعد.",
        reminderAttachmentReview: "يوجد مرفق يحتاج مراجعة مع الملخص.",
        reminderFeedback: "تم تسجيل ملاحظة أن النتيجة غير كافية وتحتاج مراجعة.",
        reminderFollowUpDue: "هناك متابعة مستحقة أو قريبة لهذه الجلسة.",
        reminderUrgentAck: "تنبيه الأولوية لم يُعلّم بعد على أنه مقروء.",
        reminderDone: "تم إخفاء التذكير محليًا.",
        insightTopSpecialty: "أكثر تخصص متكرر",
        insightTopRisk: "أعلى مستوى شائع",
        insightLowConfidence: "جلسات تحتاج ثقة أوضح",
        insightProfiles: "الحسابات النشطة",
        insightNeedsFollowUp: "جلسات تحتاج متابعة مفتوحة",
        chartSpecialtyTitle: "توزيع التخصصات",
        chartSpecialtyText: "أكثر التخصصات تكرارًا عبر الجلسات المحفوظة.",
        chartRiskTitle: "توزيع الخطورة",
        chartRiskText: "كيف تتوزع الجلسات بين المستويات المختلفة.",
        chartReviewTitle: "توزيع حالات المراجعة",
        chartReviewText: "كيف تتوزع الجلسات بين جديدة، مراجعَة، متابعة، أو مغلقة.",
        chartActivityTitle: "نشاط آخر 7 أيام",
        chartActivityText: "عدد الجلسات المحفوظة يوميًا خلال آخر أسبوع.",
        notificationsTitle: "تنبيهات المتصفح",
        notificationsText: "حوّل تذكيرات المتابعة المهمة إلى إشعارات متصفح فعلية على هذا الجهاز.",
        notificationsEnable: "تفعيل التنبيهات",
        notificationsDisable: "إيقاف التنبيهات",
        notificationsTest: "إرسال تنبيه تجريبي",
        notificationsUnsupported: "هذا المتصفح لا يدعم إشعارات النظام لهذا المشروع.",
        notificationsPrompt: "التنبيهات غير مفعلة بعد. اسمح للمتصفح بالإشعارات لتظهر المتابعات المهمة.",
        notificationsDenied: "المتصفح رفض الإشعارات. غيّر الإذن من إعدادات المتصفح إذا أردت تفعيلها.",
        notificationsReady: "الإشعارات مفعلة. سيتم تنبيهك عند وجود متابعة مستحقة أو حالة حرجة مفتوحة.",
        notificationsEnabled: "تم تفعيل تنبيهات المتصفح على هذا الجهاز.",
        notificationsDisabled: "تم إيقاف تنبيهات المتصفح محليًا.",
        notificationsTestSent: "تم إرسال تنبيه تجريبي.",
        notificationsNoDue: "لا توجد تنبيهات مستحقة الآن.",
        notificationBodyDefault: "افتح الملخص لمراجعة الحالة والتصرف المطلوب.",
        reviewed: "تمت المراجعة",
        markReviewed: "تعليم كمراجَعة",
        reopen: "إعادة فتح",
        needsFollowUp: "تحتاج متابعة",
        followUpDue: "موعد المتابعة",
        notScheduled: "غير محدد",
        overdue: "متأخر",
        today: "اليوم",
        upcoming: "قادم",
        reviewSummary: "ملخص المتابعة",
        metrics: {
            saved: "الجلسات المحفوظة",
            completed: "الجلسات المكتملة",
            highRisk: "الحالات المرتفعة الخطورة",
            tips: "صفحات الإرشادات الجاهزة",
            attachments: "المرفقات المسجلة",
            feedback: "التقييمات المحفوظة",
            reminders: "التذكيرات المفتوحة",
            profiles: "الحسابات المحلية",
            reviewed: "الجلسات المراجَعة",
            followUp: "متابعات مفتوحة",
        },
    },
    en: {
        brand: "Doctor Dashboard",
        nav_about: "About",
        nav_features: "Features",
        nav_team: "Team",
        nav_contact: "Contact",
        back_chat: "Back to Chat",
        kicker: "Local doctor or team view",
        title: "Session review and local metrics",
        description:
            "One page for saved sessions, local usage indicators, attachments, and feedback so the project can be reviewed faster.",
        export: "Download JSON",
        clear: "Clear metrics",
        search: "Search",
        risk: "Risk",
        role: "Role",
        review: "Review status",
        profile: "Profile",
        specialty: "Specialty",
        all: "All",
        empty_title: "No saved sessions yet",
        empty_text: "Once at least one session is completed, the local metrics and session cards will appear here.",
        go_chat: "Go to Chat",
        open_report: "Open summary",
        open_decision: "Open explanation",
        open_tips: "Open guidance",
        restore: "Restore",
        no_tips: "No guidance yet",
        attachmentCount: "Attachments",
        feedback: "Latest feedback",
        exported: "JSON file prepared",
        cleared: "Local analytics were cleared.",
        profileTitle: "Active account",
        profileText: "The profile currently shaping local sessions on this device.",
        insightsTitle: "Quick insights",
        insightsText: "A short summary of the strongest local patterns across saved sessions.",
        remindersTitle: "Follow-up reminders",
        remindersText: "Local prompts so important sessions, attachments, or review notes are not missed.",
        noReminders: "No open reminders right now.",
        dismissReminder: "Done",
        reminderHighRisk: "A high-risk case still deserves close follow-up.",
        reminderDoctorNote: "This session still has no doctor note.",
        reminderAttachmentReview: "An attachment is waiting to be reviewed with the summary.",
        reminderFeedback: "Feedback marked this result as needing another review.",
        reminderFollowUpDue: "A follow-up date is due or coming soon for this case.",
        reminderUrgentAck: "The urgency banner still has not been marked as acknowledged.",
        reminderDone: "Reminder dismissed locally.",
        insightTopSpecialty: "Most frequent specialty",
        insightTopRisk: "Most common higher-risk level",
        insightLowConfidence: "Sessions needing clearer confidence",
        insightProfiles: "Active local profiles",
        insightNeedsFollowUp: "Sessions with open follow-up",
        chartSpecialtyTitle: "Specialty distribution",
        chartSpecialtyText: "The specialties appearing most across saved sessions.",
        chartRiskTitle: "Risk distribution",
        chartRiskText: "How sessions spread across the different risk levels.",
        chartReviewTitle: "Review workflow distribution",
        chartReviewText: "How sessions spread across new, reviewed, follow-up, or closed states.",
        chartActivityTitle: "Recent 7-day activity",
        chartActivityText: "Saved session volume by day across the last week.",
        notificationsTitle: "Browser notifications",
        notificationsText: "Turn important follow-up reminders into real browser notifications on this device.",
        notificationsEnable: "Enable notifications",
        notificationsDisable: "Disable notifications",
        notificationsTest: "Send test notification",
        notificationsUnsupported: "This browser does not support system notifications for this project.",
        notificationsPrompt: "Notifications are not enabled yet. Allow browser notifications so important follow-ups can appear.",
        notificationsDenied: "Browser notifications were denied. Change the permission in browser settings if you want to enable them.",
        notificationsReady: "Notifications are enabled. You will be alerted when follow-up is due or a high-priority case stays open.",
        notificationsEnabled: "Browser notifications were enabled on this device.",
        notificationsDisabled: "Browser notifications were turned off locally.",
        notificationsTestSent: "A test notification was sent.",
        notificationsNoDue: "No due notification alerts right now.",
        notificationBodyDefault: "Open the summary to review the case and next action.",
        reviewed: "Reviewed",
        markReviewed: "Mark reviewed",
        reopen: "Reopen",
        needsFollowUp: "Needs follow-up",
        followUpDue: "Follow-up due",
        notScheduled: "Not scheduled",
        overdue: "Overdue",
        today: "Today",
        upcoming: "Upcoming",
        reviewSummary: "Follow-up summary",
        metrics: {
            saved: "Saved sessions",
            completed: "Completed sessions",
            highRisk: "High-risk cases",
            tips: "Supportive-care pages",
            attachments: "Tracked attachments",
            feedback: "Saved feedback items",
            reminders: "Open reminders",
            profiles: "Local profiles",
            reviewed: "Reviewed sessions",
            followUp: "Open follow-ups",
        },
    },
};

const FEEDBACK_COPY = {
    ar: {
        saved: "تم حفظ التقييم",
        failed: "تعذر حفظ التقييم",
        placeholderReport: "ملاحظة اختيارية للطبيب أو المستخدم",
        placeholderDecision: "ما الذي يحتاج شرحًا أفضل؟",
        placeholderTips: "ملاحظة قصيرة إن رغبت",
        none: "لا يوجد تقييم بعد",
        helpful: "مفيد",
        partly_helpful: "مفيد جزئيًا",
        not_helpful: "غير كافٍ",
    },
    en: {
        saved: "Feedback saved",
        failed: "Could not save feedback",
        placeholderReport: "Optional note for the doctor or user",
        placeholderDecision: "What should be explained more clearly?",
        placeholderTips: "Optional short note",
        none: "No feedback yet",
        helpful: "Helpful",
        partly_helpful: "Partly helpful",
        not_helpful: "Not helpful",
    },
};

const SPECIALTY_TRANSLATIONS = {
    "طب عام": "General Medicine",
    "جراحة العظام والمفاصل": "Orthopedics",
    "أمراض القلب": "Cardiology",
    "طب الاعصاب": "Neurology",
    "الجهاز الهضمي": "Gastroenterology",
    "الأمراض الجلدية": "Dermatology",
    "الباطنية": "Internal Medicine",
};

const TIMING_TRANSLATIONS = {
    "مراجعة اليوم": "seek medical care today",
    "حجز موعد قريب": "book an appointment soon",
    "مراقبة قصيرة": "short monitoring",
};

const QUESTION_TRANSLATIONS = {
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
    "هل يزداد الألم مع الحركة؟": "Does the pain get worse with movement?",
    "هل يوجد تنميل أو خدر؟": "Is there numbness or tingling?",
    "هل يوجد ضعف أو صعوبة في تحريك الطرف؟": "Is there weakness or difficulty moving the limb?",
    "هل يوجد زغللة، تشوش رؤية، أو ضعف مفاجئ؟": "Is there blurred vision, visual disturbance, or sudden weakness?",
    "هل يوجد غثيان أو انتفاخ أو حرقة أو تغيّر واضح في التبرز؟": "Is there nausea, bloating, heartburn, or a clear change in bowel habits?",
    "هل بدأ الطفح أو الحكة بعد دواء جديد أو طعام أو مادة معينة؟": "Did the rash or itching start after a new medicine, food, or specific substance?",
    "هل توجد ملاحظة مهمة إضافية تود ذكرها للطبيب؟": "Is there any additional important note you want the doctor to know?",
};

const HINT_TRANSLATIONS = {
    "العمر يساعد في ترتيب الاحتمالات الطبية.": "Age helps prioritize the most likely medical possibilities.",
};

const OPTION_TRANSLATIONS = {
    "طفل": "Child",
    "بالغ": "Adult",
    "كبير سن": "Older adult",
    "ذكر": "Male",
    "أنثى": "Female",
    "نعم": "Yes",
    "لا": "No",
    "سأكتبها": "I will type it",
    "جديدة": "New",
    "متكررة": "Recurring",
    "منذ ساعات": "Since hours ago",
    "منذ يوم": "Since one day",
    "منذ أيام": "Since a few days",
    "منذ أسبوع أو أكثر": "Since a week or more",
    "خفيفة": "Mild",
    "متوسطة": "Moderate",
    "شديدة": "Severe",
    "تتحسن": "Improving",
    "ثابتة": "Unchanged",
    "تزداد": "Getting worse",
};

const SAFETY_TRANSLATIONS = {
    "تم رصد علامة إنذارية قوية قد تحتاج إلى تقييم عاجل جدًا.": "A strong red flag was detected and it may require very urgent medical evaluation.",
    "يُنصح بالتوجه إلى الطوارئ أو طلب المساعدة الطبية فورًا.": "Please go to the emergency department or seek immediate medical help.",
    "توجد أعراض صدرية مع ضيق نفس أو تعرّق، وهذا يحتاج تقييمًا سريعًا.": "There are chest symptoms with shortness of breath or sweating, and this needs prompt medical evaluation.",
    "يُفضّل عدم تأخير المراجعة الطبية اليوم.": "Medical review today should not be delayed.",
    "ذُكرت دوخة شديدة أو إغماء، وهذا يحتاج تقييمًا مباشرًا.": "Severe dizziness or fainting was mentioned, and this requires direct medical evaluation.",
    "يُفضّل التقييم الطبي السريع.": "Prompt medical evaluation is preferred.",
    "الصداع مع زغللة أو تشوش رؤية يحتاج تقييمًا طبيًا سريعًا.": "Headache with blurred or disturbed vision needs prompt medical evaluation.",
    "يُفضّل مراجعة الطبيب اليوم.": "It is preferable to see a doctor today.",
};

const VALUE_TRANSLATIONS = {
    "غير مذكور": "Not mentioned",
    "لا يوجد واضح": "No clear warning signs",
    "لا يوجد": "None",
    "جديد": "New",
    "جديدة": "New",
    "ثابت": "Unchanged",
    "ثابتة": "Unchanged",
    "متوسط": "Moderate",
    "متوسطة": "Moderate",
    "خفيف": "Mild",
    "خفيفة": "Mild",
    "شديد": "Severe",
    "شديدة": "Severe",
    "صدر": "Chest",
    "الصدر": "Chest",
    "كتف": "Shoulder",
    "الكتف": "Shoulder",
    "ذراع": "Arm",
    "الذراع": "Arm",
    "يد": "Hand",
    "رجل": "Leg",
    "ساق": "Leg",
    "ظهر": "Back",
    "الظهر": "Back",
    "رقبة": "Neck",
    "الرقبة": "Neck",
    "راس": "Head",
    "رأس": "Head",
    "بطن": "Abdomen",
    "البطن": "Abdomen",
    "معدة": "Stomach",
    "المعدة": "Stomach",
    "عين": "Eye",
    "العين": "Eye",
    "فك": "Jaw",
    "الفك": "Jaw",
    "تنميل": "Numbness",
    "خدر": "Numbness",
    "ضعف": "Weakness",
    "حرارة": "Fever",
    "حمى": "Fever",
    "غثيان": "Nausea",
    "قيء": "Vomiting",
    "دوخة": "Dizziness",
    "إغماء": "Fainting",
    "اغماء": "Fainting",
    "دوخة أو إغماء": "Dizziness or fainting",
    "دوخة او اغماء": "Dizziness or fainting",
    "ضيق تنفس": "Shortness of breath",
    "خفقان": "Palpitations",
    "تعرق": "Sweating",
    "تعرّق": "Sweating",
    "تعرق أو خفقان": "Sweating or palpitations",
    "تعرق او خفقان": "Sweating or palpitations",
    "تعرق بارد أو خفقان": "Cold sweating or palpitations",
    "تعرق بارد او خفقان": "Cold sweating or palpitations",
    "امتداد الألم": "Pain radiation",
    "امتداد الالم": "Pain radiation",
};

const RATIONALE_TRANSLATIONS = {
    "وجود أمراض مزمنة يرفع الحاجة للحذر.": "Chronic conditions increase the need for caution.",
    "وجود ضيق تنفس مؤشر مهم على الحاجة لتقييم سريع.": "Shortness of breath is an important sign supporting prompt evaluation.",
    "وجود دوخة أو إغماء يزيد مستوى الخطورة.": "Dizziness or fainting increases the risk level.",
    "القيء قد يشير إلى شدة أو حاجة لمتابعة أقرب.": "Vomiting may suggest greater severity or the need for closer follow-up.",
    "وجود حرارة قد يشير إلى حالة داخلية تحتاج تقييمًا منظّمًا.": "Fever may point to an internal condition that needs organized medical assessment.",
    "الأعراض تتفاقم بدل أن تتحسن.": "The symptoms are worsening rather than improving.",
    "ذُكر تنميل أو ضعف وهذا يحتاج انتباهًا أكبر.": "Numbness or weakness was mentioned, and this needs closer attention.",
    "امتداد الألم يزيد احتمال الحاجة لتقييم أسرع.": "Pain spreading to other areas increases the need for faster evaluation.",
    "الخفقان أو التعرق البارد يدعم الحذر في الأعراض الصدرية.": "Palpitations or cold sweating support extra caution with chest symptoms.",
    "ذُكرت أعراض عصبية مقلقة تحتاج تقييمًا مباشرًا.": "Concerning neurological symptoms were mentioned and need direct evaluation.",
    "درجة الألم مرتفعة.": "The pain score is high.",
    "الشدة الموصوفة مرتفعة.": "The described severity is high.",
};

const STRUCTURED_LINE_TRANSLATIONS = {
    "الأماكن المستخرجة": "Extracted locations",
    "الأعراض المصاحبة": "Associated symptoms",
    "العلامات الإنذارية": "Warning signs",
    "التخصص المتوقع": "Expected specialty",
    "درجة الخطورة": "Risk level",
    "الخطوة التالية": "Next step",
    "بداية الأعراض": "Symptom onset",
    "مسار الأعراض": "Symptom course",
    "نوع الحالة": "Case type",
    "تاريخ إنشاء التقرير": "Report created",
    "الشكوى الرئيسية": "Chief complaint",
    "ملخص الأعراض": "Symptom summary",
    "المكان": "Location",
    "الشدة": "Severity",
    "المدة": "Duration",
    "اتجاه الحالة": "Trend",
};

const yesAnswers = ["نعم", "ايوه", "أيوه", "اي", "أجل", "yes", "y"];
const noAnswers = ["لا", "لأ", "كلا", "no", "n"];

const readUrlLanguage = () => {
    try {
        const lang = new URLSearchParams(window.location.search).get("lang");
        return lang === "en" || lang === "ar" ? lang : null;
    } catch (error) {
        return null;
    }
};

const readStoredLanguage = () => {
    try {
        return localStorage.getItem(LANGUAGE_KEY) || "ar";
    } catch (error) {
        return "ar";
    }
};

const writeStoredLanguage = (lang) => {
    try {
        localStorage.setItem(LANGUAGE_KEY, lang);
    } catch (error) {
        // Ignore storage failures and keep the current language in memory only.
    }
};

const readStoredAudioPreference = () => {
    try {
        return localStorage.getItem(AUDIO_PREF_KEY) === "on";
    } catch (error) {
        return false;
    }
};

const writeStoredAudioPreference = (enabled) => {
    try {
        localStorage.setItem(AUDIO_PREF_KEY, enabled ? "on" : "off");
    } catch (error) {
        // Ignore storage failures and keep the current preference in memory only.
    }
};

const readStoredTheme = () => {
    try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === "dark" || stored === "light") {
            return stored;
        }
    } catch (error) {
        // Ignore theme storage errors and fall back to system preference.
    }

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
};

const getResolvedLanguage = () => {
    const current =
        document.documentElement.lang ||
        readUrlLanguage() ||
        readStoredLanguage();
    return String(current).toLowerCase().startsWith("en") ? "en" : "ar";
};

const getInterfaceLanguage = () => getResolvedLanguage();

const getThemeCopy = (lang = getInterfaceLanguage(), theme = document.documentElement.dataset.theme || "light") => {
    const dark = theme === "dark";
    if (lang === "en") {
        return dark
            ? { label: "Light mode", action: "Switch to light mode" }
            : { label: "Dark mode", action: "Switch to dark mode" };
    }

    return dark
        ? { label: "الوضع الفاتح", action: "التبديل إلى الوضع الفاتح" }
        : { label: "الوضع الداكن", action: "التبديل إلى الوضع الداكن" };
};

const refreshThemeToggle = () => {
    const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    const copy = getThemeCopy(getInterfaceLanguage(), theme);

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        const icon = button.querySelector("i");
        const label = button.querySelector("[data-theme-toggle-label]");
        if (icon) {
            icon.className = theme === "dark" ? "fas fa-sun" : "fas fa-moon";
        }
        if (label) {
            label.textContent = copy.label;
        }
        button.setAttribute("aria-label", copy.action);
        button.setAttribute("title", copy.action);
    });
};

const applyTheme = (theme, { persist = true } = {}) => {
    const nextTheme = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    if (document.body) {
        document.body.dataset.theme = nextTheme;
    }

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
        themeMeta.setAttribute("content", nextTheme === "dark" ? THEME_META_DARK : THEME_META_LIGHT);
    }

    if (persist) {
        try {
            localStorage.setItem(THEME_KEY, nextTheme);
        } catch (error) {
            // Ignore theme persistence failures.
        }
    }

    refreshThemeToggle();
};

const mountThemeToggle = () => {
    if (!document.body || document.querySelector(".theme-toggle-fab")) {
        refreshThemeToggle();
        return;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-toggle-fab";
    button.dataset.themeToggle = "true";
    button.innerHTML = `
        <i class="fas fa-moon" aria-hidden="true"></i>
        <span data-theme-toggle-label></span>
    `;
    button.addEventListener("click", () => {
        const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
        applyTheme(current === "dark" ? "light" : "dark");
    });

    document.body.appendChild(button);
    refreshThemeToggle();
};

const mountMobileBottomNav = () => {
    if (!document.body || document.querySelector(".mobile-bottom-nav")) {
        return;
    }
    const lang = getInterfaceLanguage();
    const copy =
        lang === "en"
            ? {
                chat: "Chat",
                report: "Report",
                decision: "Why",
                tips: "Guide",
                dashboard: "Doctor",
            }
            : {
                chat: "الشات",
                report: "الملخص",
                decision: "التفسير",
                tips: "الإرشادات",
                dashboard: "الطبيب",
            };
    const page = window.location.pathname.split("/").pop() || "index.html";
    const items = [
        { href: `chat.html?lang=${lang}`, key: "chat", icon: "fa-comments", match: "chat.html" },
        { href: `report.html?lang=${lang}`, key: "report", icon: "fa-file-lines", match: "report.html" },
        { href: `decision.html?lang=${lang}`, key: "decision", icon: "fa-diagram-project", match: "decision.html" },
        { href: `integrative.html?lang=${lang}`, key: "tips", icon: "fa-seedling", match: "integrative.html" },
        { href: `dashboard.html?lang=${lang}`, key: "dashboard", icon: "fa-stethoscope", match: "dashboard.html" },
    ];
    const nav = document.createElement("nav");
    nav.className = "mobile-bottom-nav";
    nav.setAttribute("aria-label", lang === "en" ? "Mobile navigation" : "تنقل الجوال");
    nav.innerHTML = items
        .map(
            (item) => `
                <a href="${item.href}" class="mobile-bottom-nav__link ${page.includes(item.match) ? "is-active" : ""}">
                    <i class="fas ${item.icon}" aria-hidden="true"></i>
                    <span>${copy[item.key]}</span>
                </a>
            `
        )
        .join("");
    document.body.appendChild(nav);
};

applyTheme(readStoredTheme(), { persist: false });

const getHomeLanguage = () => (document.documentElement.lang === "en" ? "en" : "ar");

const applyHomeLanguage = (lang) => {
    if (!isHomePage) {
        return;
    }

    const nextLang = lang === "en" ? "en" : "ar";
    const copy = HOME_TRANSLATIONS[nextLang];

    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "en" ? "ltr" : "rtl";
    document.body.classList.toggle("is-ltr", nextLang === "en");

    document.querySelectorAll("[data-i18n]").forEach((node) => {
        const key = node.dataset.i18n;
        if (key && copy[key]) {
            node.textContent = copy[key];
        }
    });

    document.querySelectorAll("[data-i18n-placeholder]").forEach((node) => {
        const key = node.dataset.i18nPlaceholder;
        if (key && copy[key]) {
            node.setAttribute("placeholder", copy[key]);
        }
    });

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
        metaDescription.setAttribute("content", copy.meta_description);
    }

    document.title = copy.meta_title;

    if (langToggleLabel) {
        langToggleLabel.textContent = nextLang === "en" ? "العربية" : "English";
    }

    if (langToggle) {
        langToggle.setAttribute(
            "aria-label",
            nextLang === "en" ? "Switch to Arabic" : "Switch to English"
        );
    }

    document.querySelectorAll('a[href^="chat.html"]').forEach((link) => {
        link.setAttribute("href", `chat.html?lang=${nextLang}`);
    });

    writeStoredLanguage(nextLang);
    refreshThemeToggle();
    window.dispatchEvent(new CustomEvent("medika:chat-language-changed", { detail: { lang: nextLang } }));
};

const getCurrentLanguage = () => getResolvedLanguage();
const getChatCopy = () => CHAT_TRANSLATIONS[getCurrentLanguage()];

const translateKnownValue = (value, map, lang = getCurrentLanguage()) => {
    if (lang !== "en") {
        return value;
    }
    return map[value] || value;
};

const translateSpecialty = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, SPECIALTY_TRANSLATIONS, lang);

const translateTiming = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, TIMING_TRANSLATIONS, lang);

const translateQuestionText = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, QUESTION_TRANSLATIONS, lang);

const translateQuestionHint = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, HINT_TRANSLATIONS, lang);

const translateOptionLabel = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, OPTION_TRANSLATIONS, lang);

const translateSafetyText = (value, lang = getCurrentLanguage()) =>
    translateKnownValue(value, SAFETY_TRANSLATIONS, lang);

const translateRoleLabel = (value, lang = getCurrentLanguage()) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (lang === "en") {
        return normalized === "doctor" ? ACCOUNT_COPY.en.doctor : ACCOUNT_COPY.en.patient;
    }
    return normalized === "doctor" ? ACCOUNT_COPY.ar.doctor : ACCOUNT_COPY.ar.patient;
};

const getProfileDisplayName = (profile, lang = getCurrentLanguage()) =>
    String(profile?.name || "").trim() ||
    (String(profile?.role || "").toLowerCase() === "doctor" ? ACCOUNT_COPY[lang].doctor : ACCOUNT_COPY[lang].patient);

const translateRiskLevelLabel = (value, lang = getCurrentLanguage()) => {
    if (lang !== "en") {
        return value;
    }

    const labels = {
        low: "Low",
        medium: "Medium",
        high: "High",
        urgent: "Urgent",
        emergency: "Emergency",
        "non-urgent": "Non-urgent",
    };

    return labels[String(value || "").toLowerCase()] || value;
};

const translateConfidenceBand = (value, lang = getCurrentLanguage()) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
        return value;
    }

    const englishLabels = {
        "high confidence": "High confidence",
        "moderate confidence": "Moderate confidence",
        "low confidence": "Low confidence",
        "ثقة عالية": "High confidence",
        "ثقة متوسطة": "Moderate confidence",
        "ثقة منخفضة": "Low confidence",
    };

    const arabicLabels = {
        "high confidence": "ثقة عالية",
        "moderate confidence": "ثقة متوسطة",
        "low confidence": "ثقة منخفضة",
        "ثقة عالية": "ثقة عالية",
        "ثقة متوسطة": "ثقة متوسطة",
        "ثقة منخفضة": "ثقة منخفضة",
    };

    return lang === "en"
        ? englishLabels[normalized] || value
        : arabicLabels[normalized] || value;
};

const localizeQuestion = (question, lang = getCurrentLanguage()) => {
    if (!question) {
        return question;
    }

    return {
        ...question,
        displayQuestion: lang === "en" ? translateQuestionText(question.question, lang) : question.question,
        displayHint: lang === "en" ? translateQuestionHint(question.hint, lang) : question.hint,
        displayOptions: Array.isArray(question.options)
            ? question.options.map((option) => ({
                value: option,
                label: lang === "en" ? translateOptionLabel(option, lang) : option,
            }))
            : [],
    };
};

const localizeQuestions = (questions = [], lang = getCurrentLanguage()) =>
    questions.map((question) => localizeQuestion(question, lang));

const getTextDirection = (text = "", fallbackLang = getCurrentLanguage()) => {
    const hasArabic = /[\u0600-\u06FF]/.test(text);
    const hasLatin = /[A-Za-z]/.test(text);

    if (hasArabic && !hasLatin) {
        return "rtl";
    }

    if (hasLatin && !hasArabic) {
        return "ltr";
    }

    return fallbackLang === "en" ? "ltr" : "rtl";
};

const applyChatLanguage = (lang) => {
    if (!isChatPage) {
        return;
    }

    const nextLang = lang === "en" ? "en" : "ar";
    const copy = CHAT_TRANSLATIONS[nextLang];
    const metaDescription = document.querySelector('meta[name="description"]');

    document.documentElement.lang = nextLang;
    document.documentElement.dir = nextLang === "en" ? "ltr" : "rtl";
    document.body.classList.toggle("is-ltr", nextLang === "en");
    document.title = copy.meta_title;

    if (metaDescription) {
        metaDescription.setAttribute("content", copy.meta_description);
    }

    if (chatLangToggleLabel) {
        chatLangToggleLabel.textContent = nextLang === "en" ? "العربية" : "English";
    }

    if (chatLangToggle) {
        chatLangToggle.setAttribute(
            "aria-label",
            nextLang === "en" ? "Switch to Arabic" : "Switch to English"
        );
    }

    const backHomeLink = document.getElementById("chat-back-home-link");
    if (backHomeLink) {
        backHomeLink.setAttribute("href", `index.html?lang=${nextLang}`);
    }

    const chatNodeMap = {
        "chat-brand-tagline": copy.brand_tagline,
        "chat-nav-about": copy.nav_about,
        "chat-nav-features": copy.nav_features,
        "chat-nav-team": copy.nav_team,
        "chat-nav-contact": copy.nav_contact,
        "chat-back-home-link": copy.back_home,
        "chat-hero-badge-text": copy.hero_badge,
        "chat-hero-title": copy.hero_title,
        "chat-hero-text": copy.hero_text,
        "chat-highlight-1-title": copy.hero_highlight_1_title,
        "chat-highlight-1-text": copy.hero_highlight_1_text,
        "chat-highlight-2-title": copy.hero_highlight_2_title,
        "chat-highlight-2-text": copy.hero_highlight_2_text,
        "chat-highlight-3-title": copy.hero_highlight_3_title,
        "chat-highlight-3-text": copy.hero_highlight_3_text,
        "chat-stage-title": copy.stage_title,
        "chat-stage-note": copy.stage_note,
        "chat-stage-complaint": copy.stage_complaint,
        "chat-stage-questions": copy.stage_questions,
        "chat-stage-recommendation": copy.stage_recommendation,
        "chat-stage-explanation": copy.stage_explanation,
        "chat-stage-tips": copy.stage_tips,
        "chat-session-step-label": copy.session_step_label,
        "chat-session-pages-label": copy.session_pages_label,
        "chat-session-attachments-label": copy.session_attachments_label,
        "chat-helper-kicker": copy.helper_kicker,
        "chat-helper-title": copy.helper_title,
        "chat-helper-text": copy.helper_text,
        "chat-helper-example-label": copy.helper_example_label,
        "chat-helper-example-text": copy.helper_example_text,
        "chat-helper-note": copy.helper_note,
        "chat-quick-prompts-title": copy.quick_prompts_title,
        "chat-quick-prompts-note": copy.quick_prompts_note,
        "chat-history-title": copy.history_title,
        "clear-history-btn": copy.history_clear,
        "chat-safety-title": copy.safety_title,
        "chat-safety-text": copy.safety_text,
        "chat-account-title": ACCOUNT_COPY[nextLang].title,
        "chat-account-helper": ACCOUNT_COPY[nextLang].helper,
        "account-role-patient": ACCOUNT_COPY[nextLang].patient,
        "account-role-doctor": ACCOUNT_COPY[nextLang].doctor,
        "account-name-label": ACCOUNT_COPY[nextLang].nameLabel,
        "save-account-btn": ACCOUNT_COPY[nextLang].save,
        "chat-assistant-label": copy.assistant_label,
        "chat-session-title": copy.session_title,
        "chat-status-pill": copy.status_pill,
        "emergency-title": copy.emergency_title,
        "emergency-text": copy.emergency_default,
        "quick-replies-caption": copy.quick_replies_caption,
        "action-links-caption": copy.action_links_caption,
        "chat-input-label": copy.input_label,
        "voice-btn-label": copy.voice_label,
        "speaker-toggle-btn-label": copy.speaker_toggle_off,
        "new-session-btn-label": copy.new_label,
        "chat-disclaimer": copy.disclaimer,
    };

    Object.entries(chatNodeMap).forEach(([id, value]) => {
        const node = document.getElementById(id);
        if (node && value) {
            node.textContent = value;
        }
    });

    document.querySelectorAll(".quick-prompt").forEach((button) => {
        const nextLabel = nextLang === "en" ? button.dataset.labelEn : button.dataset.labelAr;
        const nextPrompt = nextLang === "en" ? button.dataset.promptEn : button.dataset.promptAr;
        if (nextLabel) {
            button.textContent = nextLabel;
        }
        if (nextPrompt) {
            button.dataset.prompt = nextPrompt;
        }
        button.dataset.promptRaw = button.dataset.promptAr || nextPrompt;
    });

    const accountNameInput = document.getElementById("account-name-input");
    if (accountNameInput) {
        const activeProfile = readActiveProfile();
        accountNameInput.placeholder =
            activeProfile.role === "doctor"
                ? ACCOUNT_COPY[nextLang].namePlaceholderDoctor
                : ACCOUNT_COPY[nextLang].namePlaceholderPatient;
    }

    writeStoredLanguage(nextLang);
    refreshThemeToggle();
};

const applyConsentLanguage = (lang = getCurrentLanguage()) => {
    const copy = CONSENT_COPY[lang];
    const setNode = (id, value) => {
        const node = document.getElementById(id);
        if (node && value) {
            node.textContent = value;
        }
    };
    setNode("consent-kicker", copy.kicker);
    setNode("consent-title", copy.title);
    setNode("consent-text", copy.text);
    setNode("consent-checkbox-label", copy.check);
    setNode("consent-accept-btn", copy.accept);
    setNode("consent-decline-btn", copy.decline);
    const list = document.getElementById("consent-points");
    if (list) {
        list.innerHTML = copy.points.map((item) => `<li>${item}</li>`).join("");
    }
};

const applyUploadLanguage = (lang = getCurrentLanguage()) => {
    const copy = UPLOAD_COPY[lang];
    const setNode = (id, value) => {
        const node = document.getElementById(id);
        if (node && value) {
            node.textContent = value;
        }
    };
    setNode("chat-upload-title", copy.title);
    setNode("chat-upload-note", copy.note);
    setNode("skin-upload-btn-label", copy.skin);
    setNode("file-upload-btn-label", copy.file);
    setNode("chat-dashboard-title", DASHBOARD_COPY[lang].brand);
    setNode("chat-dashboard-text", DASHBOARD_COPY[lang].description);
    setNode("chat-dashboard-link", lang === "en" ? "Open dashboard" : "فتح اللوحة");
    const dashboardLink = document.getElementById("chat-dashboard-link");
    if (dashboardLink) {
        dashboardLink.setAttribute("href", `dashboard.html?lang=${lang}`);
    }
};

const normalizeProfileRecord = (profile = {}) =>
    buildLocalProfile(profile.role === "doctor" ? "doctor" : "patient", {
        id: profile.id,
        name: profile.name,
        created_at: profile.created_at,
        updated_at: profile.updated_at,
    });

const readProfileDirectory = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(PROFILE_DIRECTORY_KEY) || "[]");
        if (!Array.isArray(parsed) || !parsed.length) {
            return getDefaultProfiles();
        }
        const normalized = parsed
            .map((profile) => normalizeProfileRecord(profile))
            .filter((profile, index, source) => source.findIndex((item) => item.id === profile.id) === index);
        return normalized.length ? normalized : getDefaultProfiles();
    } catch (error) {
        return getDefaultProfiles();
    }
};

const writeProfileDirectory = (profiles) => {
    const normalized = (Array.isArray(profiles) ? profiles : getDefaultProfiles()).map((profile) =>
        normalizeProfileRecord(profile)
    );
    localStorage.setItem(PROFILE_DIRECTORY_KEY, JSON.stringify(normalized));
    return normalized;
};

const readActiveProfile = () => {
    const profiles = readProfileDirectory();
    const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
    return profiles.find((profile) => profile.id === activeId) || profiles[0] || getDefaultProfiles()[0];
};

const setActiveProfile = (profile) => {
    const normalized = normalizeProfileRecord(profile);
    const profiles = readProfileDirectory();
    const merged = profiles.some((entry) => entry.id === normalized.id)
        ? profiles.map((entry) => (entry.id === normalized.id ? { ...entry, ...normalized, updated_at: new Date().toISOString() } : entry))
        : [...profiles, normalized];
    writeProfileDirectory(merged);
    localStorage.setItem(ACTIVE_PROFILE_KEY, normalized.id);
    return merged.find((entry) => entry.id === normalized.id) || normalized;
};

const buildSessionProfile = (profile = readActiveProfile()) => ({
    id: profile.id,
    role: profile.role,
    name: String(profile.name || "").trim() || (profile.role === "doctor" ? "الطبيب" : "المستخدم"),
});

const normalizeDateInputValue = (value) => {
    const text = String(value || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
};

const buildCaseManagementState = (state = {}) => ({
    review_status: REVIEW_STATUS_VALUES.includes(String(state.review_status || "").trim()) ? String(state.review_status).trim() : "new",
    follow_up_due: normalizeDateInputValue(state.follow_up_due),
    follow_up_note: String(state.follow_up_note || "").trim().slice(0, 320),
    reviewed_at: String(state.reviewed_at || "").trim(),
    attachment_reviewed: Boolean(state.attachment_reviewed),
    urgent_acknowledged_at: String(state.urgent_acknowledged_at || "").trim(),
    updated_at: String(state.updated_at || "").trim(),
});

const translateReviewStatus = (value, lang = getCurrentLanguage()) => {
    const normalized = String(value || "").trim().toLowerCase();
    const map = {
        ar: {
            new: "جديدة",
            reviewed: "تمت المراجعة",
            follow_up: "تحتاج متابعة",
            closed: "مغلقة",
        },
        en: {
            new: "New",
            reviewed: "Reviewed",
            follow_up: "Needs follow-up",
            closed: "Closed",
        },
    };
    return map[lang]?.[normalized] || (lang === "en" ? "New" : "جديدة");
};

const getFollowUpDueState = (value) => {
    const normalized = normalizeDateInputValue(value);
    if (!normalized) {
        return "none";
    }
    const today = new Date();
    const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    if (normalized < todayKey) {
        return "overdue";
    }
    if (normalized === todayKey) {
        return "today";
    }
    return "upcoming";
};

const formatFollowUpDate = (value, lang = getCurrentLanguage()) => {
    const normalized = normalizeDateInputValue(value);
    if (!normalized) {
        return lang === "en" ? "Not scheduled" : "غير محدد";
    }
    try {
        const [year, month, day] = normalized.split("-").map(Number);
        return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ar-JO", {
            year: "numeric",
            month: "short",
            day: "numeric",
        }).format(new Date(year, month - 1, day));
    } catch (error) {
        return normalized;
    }
};

const buildCaseManagementSummary = (session, lang = getCurrentLanguage()) => {
    const state = buildCaseManagementState(session?.case_management);
    const status = translateReviewStatus(state.review_status, lang);
    const due = formatFollowUpDate(state.follow_up_due, lang);
    const note = String(state.follow_up_note || "").trim();
    const parts =
        lang === "en"
            ? [
                  `Review status: ${status}.`,
                  `Follow-up date: ${due}.`,
                  state.attachment_reviewed ? "Attachments reviewed locally." : "Attachments still need review if present.",
                  state.urgent_acknowledged_at ? "Urgency banner was acknowledged locally." : "",
                  note ? `Follow-up note: ${note}` : "",
              ]
            : [
                  `حالة المراجعة: ${status}.`,
                  `موعد المتابعة: ${due}.`,
                  state.attachment_reviewed ? "تمت مراجعة المرفقات محليًا." : "المرفقات ما تزال بحاجة مراجعة إن وجدت.",
                  state.urgent_acknowledged_at ? "تمت قراءة تنبيه الأولوية محليًا." : "",
                  note ? `ملاحظة المتابعة: ${note}` : "",
              ];
    return parts.filter(Boolean).join(" ");
};

const buildUrgentChecklist = (session, lang = getCurrentLanguage()) => {
    const risk = String(
        session?.recommendation?.risk_level || session?.report?.sections?.prediction?.risk_level || ""
    ).toLowerCase();
    if (!["high", "urgent", "emergency", "مرتفع", "عاجل", "طارئ"].includes(risk)) {
        return [];
    }
    if (lang === "en") {
        return [
            "Keep the doctor summary ready when opening the report or seeking care.",
            "Do not delay care if symptoms are ongoing, worsening, or new warning signs appear.",
            "Supportive guidance is secondary in this case and does not replace direct evaluation.",
            session?.case_management?.urgent_acknowledged_at
                ? "The urgency banner was already marked as acknowledged on this device."
                : "Mark the urgency banner as acknowledged after you review the summary locally.",
        ].filter(Boolean);
    }
    return [
        "احتفظ بملخص الطبيب جاهزًا عند المراجعة أو فتح التقرير.",
        "لا تؤخر المراجعة إذا كانت الأعراض مستمرة أو متفاقمة أو ظهرت علامات إنذارية جديدة.",
        "الإرشادات الداعمة هنا ثانوية ولا تغني عن التقييم المباشر في هذه الحالة.",
        session?.case_management?.urgent_acknowledged_at
            ? "تم تعليم تنبيه الأولوية على أنه مقروء على هذا الجهاز."
            : "بعد مراجعة الملخص، علّم تنبيه الأولوية على أنه مقروء محليًا.",
    ].filter(Boolean);
};

const buildEmptySession = () => ({
    version: 4,
    session_id: createSessionId(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    profile: buildSessionProfile(),
    complaint: "",
    answers: [],
    prediction: null,
    recommendation: null,
    report: null,
    explanation: null,
    tips: null,
    attachments: [],
    feedback: {},
    case_management: buildCaseManagementState(),
    doctor_notes: {
        text: "",
        updated_at: "",
    },
});

const readStoredSession = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return buildEmptySession();
        }

        const parsed = JSON.parse(raw);
        if (!parsed || ![2, 3, 4].includes(parsed.version)) {
            return buildEmptySession();
        }

        const session = {
            ...buildEmptySession(),
            ...parsed,
        };

        if (!Array.isArray(session.attachments)) {
            session.attachments = [];
        }

        if (!session.feedback || typeof session.feedback !== "object") {
            session.feedback = {};
        }

        session.case_management = buildCaseManagementState(session.case_management);

        if (!session.doctor_notes || typeof session.doctor_notes !== "object") {
            session.doctor_notes = { text: "", updated_at: "" };
        }

        session.profile = buildSessionProfile(session.profile || readActiveProfile());

        if (!session.session_id) {
            session.session_id = createSessionId();
        }

        if (!session.created_at) {
            session.created_at = new Date().toISOString();
        }

        if (!session.updated_at) {
            session.updated_at = session.created_at;
        }

        return session;
    } catch (error) {
        return buildEmptySession();
    }
};

const writeStoredSession = (session) => {
    const normalized = {
        ...buildEmptySession(),
        ...session,
        session_id: session?.session_id || createSessionId(),
        created_at: session?.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        profile: buildSessionProfile(session?.profile || readActiveProfile()),
        case_management: buildCaseManagementState(session?.case_management),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
};

const clearStoredSession = () => {
    localStorage.removeItem(STORAGE_KEY);
};

const readSessionHistory = () => {
    try {
        const raw = localStorage.getItem(SESSION_HISTORY_KEY);
        if (!raw) {
            return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed
            .filter((entry) => entry && entry.id && entry.session?.report)
            .map((entry) => ({
                ...entry,
                profile: buildSessionProfile(entry.profile || entry.session?.profile || readActiveProfile()),
                session: {
                    ...buildEmptySession(),
                    ...(entry.session || {}),
                    profile: buildSessionProfile(entry.session?.profile || entry.profile || readActiveProfile()),
                    case_management: buildCaseManagementState(entry.session?.case_management),
                },
            }));
    } catch (error) {
        return [];
    }
};

const writeSessionHistory = (entries) => {
    localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(entries));
};

const clearSessionHistory = () => {
    localStorage.removeItem(SESSION_HISTORY_KEY);
};

const readConsentState = () => {
    try {
        return JSON.parse(localStorage.getItem(CONSENT_KEY) || "{}");
    } catch (error) {
        return {};
    }
};

const writeConsentState = (value) => {
    try {
        localStorage.setItem(CONSENT_KEY, JSON.stringify(value || {}));
    } catch (error) {
        // Ignore consent persistence failures.
    }
};

const clearConsentState = () => {
    try {
        localStorage.removeItem(CONSENT_KEY);
    } catch (error) {
        // Ignore consent persistence failures.
    }
};

const readAnalyticsState = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(ANALYTICS_KEY) || "{}");
        return {
            events: Array.isArray(parsed.events) ? parsed.events : [],
        };
    } catch (error) {
        return { events: [] };
    }
};

const writeAnalyticsState = (state) => {
    try {
        localStorage.setItem(ANALYTICS_KEY, JSON.stringify(state));
    } catch (error) {
        // Ignore analytics persistence failures.
    }
};

const clearAnalyticsState = () => {
    try {
        localStorage.removeItem(ANALYTICS_KEY);
    } catch (error) {
        // Ignore cleanup failures.
    }
};

const readReminderState = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(REMINDER_STATE_KEY) || "{}");
        return {
            dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed : [],
        };
    } catch (error) {
        return { dismissed: [] };
    }
};

const writeReminderState = (state) => {
    try {
        localStorage.setItem(
            REMINDER_STATE_KEY,
            JSON.stringify({
                dismissed: Array.isArray(state?.dismissed) ? state.dismissed.slice(0, 120) : [],
            })
        );
    } catch (error) {
        // Ignore reminder persistence failures.
    }
};

const readNotificationState = () => {
    try {
        const parsed = JSON.parse(localStorage.getItem(NOTIFICATION_STATE_KEY) || "{}");
        return {
            enabled: Boolean(parsed.enabled),
            sent: parsed.sent && typeof parsed.sent === "object" ? parsed.sent : {},
            last_permission: String(parsed.last_permission || "").trim(),
            last_sweep_at: String(parsed.last_sweep_at || "").trim(),
        };
    } catch (error) {
        return {
            enabled: false,
            sent: {},
            last_permission: "",
            last_sweep_at: "",
        };
    }
};

const writeNotificationState = (state) => {
    try {
        const entries = Object.entries(state?.sent && typeof state.sent === "object" ? state.sent : {})
            .sort((a, b) => new Date(b[1] || 0) - new Date(a[1] || 0))
            .slice(0, 180);
        localStorage.setItem(
            NOTIFICATION_STATE_KEY,
            JSON.stringify({
                enabled: Boolean(state?.enabled),
                sent: Object.fromEntries(entries),
                last_permission: String(state?.last_permission || "").trim(),
                last_sweep_at: String(state?.last_sweep_at || "").trim(),
            })
        );
    } catch (error) {
        // Ignore notification persistence failures.
    }
};

const isBrowserNotificationSupported = () =>
    typeof window !== "undefined" && "Notification" in window;

const getBrowserNotificationPermission = () =>
    isBrowserNotificationSupported() ? Notification.permission : "unsupported";

const syncNotificationPermissionState = () => {
    const state = readNotificationState();
    state.last_permission = getBrowserNotificationPermission();
    writeNotificationState(state);
    return state;
};

const trackAnalyticsEvent = (type, payload = {}) => {
    const state = readAnalyticsState();
    const activeProfile = readActiveProfile();
    state.events.unshift({
        id: createSessionId(),
        type,
        at: new Date().toISOString(),
        lang: getCurrentLanguage(),
        path: typeof window !== "undefined" ? window.location.pathname : "",
        payload: {
            profile_id: activeProfile.id,
            profile_role: activeProfile.role,
            ...payload,
        },
    });
    state.events = state.events.slice(0, MAX_ANALYTICS_EVENTS);
    writeAnalyticsState(state);
};

const persistSessionToHistory = (session) => {
    if (!session?.report || !session?.complaint) {
        return;
    }

    const normalized = writeStoredSession(session);
    const sections = normalized.report?.sections || {};
    const prediction = sections.prediction || {};
    const history = readSessionHistory().filter((entry) => entry.id !== normalized.session_id);

    history.unshift({
        id: normalized.session_id,
        saved_at: normalized.updated_at,
        complaint: normalized.complaint,
        specialty: prediction.specialty || normalized.prediction?.final_label || "",
        risk_level: prediction.risk_level || normalized.recommendation?.risk_level || "",
        next_step: prediction.next_step || normalized.recommendation?.timing || "",
        confidence: prediction.confidence || normalized.prediction?.final_confidence || 0,
        attachments_count: Array.isArray(normalized.attachments) ? normalized.attachments.length : 0,
        feedback: normalized.feedback || {},
        doctor_note: normalized.doctor_notes?.text || "",
        review_status: normalized.case_management?.review_status || "new",
        follow_up_due: normalized.case_management?.follow_up_due || "",
        profile: buildSessionProfile(normalized.profile || readActiveProfile()),
        session: normalized,
    });

    writeSessionHistory(history.slice(0, MAX_SESSION_HISTORY));
};

const normalizeReply = (text) => String(text).trim().toLowerCase();
const isYes = (text) => yesAnswers.includes(normalizeReply(text));
const isNo = (text) => noAnswers.includes(normalizeReply(text));

const setText = (node, text, fallback = "-") => {
    if (!node) {
        return;
    }
    node.textContent = text || fallback;
};

const fillList = (node, items, fallback = "لا توجد بيانات بعد.") => {
    if (!node) {
        return;
    }

    node.innerHTML = "";

    if (!items || !items.length) {
        const item = document.createElement("li");
        item.textContent = fallback;
        node.appendChild(item);
        return;
    }

    items.forEach((entry) => {
        const item = document.createElement("li");
        item.textContent = entry;
        node.appendChild(item);
    });
};

const applyRiskLevel = (node, level) => {
    if (!node) {
        return;
    }

    node.textContent = level || "-";
    if (level) {
        node.dataset.level = level;
    } else {
        node.removeAttribute("data-level");
    }
};

const formatBytes = (bytes = 0) => {
    const value = Number(bytes) || 0;
    if (value < 1024) {
        return `${value} B`;
    }
    if (value < 1024 * 1024) {
        return `${(value / 1024).toFixed(1)} KB`;
    }
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSessionTimestamp = (value, lang = getCurrentLanguage()) => {
    if (!value) {
        return "";
    }
    try {
        return new Date(value).toLocaleString(lang === "en" ? "en-US" : "ar-JO", {
            dateStyle: "medium",
            timeStyle: "short",
        });
    } catch (error) {
        return "";
    }
};

const ATTACHMENT_STOPWORDS = new Set([
    "the", "and", "with", "from", "this", "that", "have", "does", "were", "been", "into",
    "على", "مع", "من", "الى", "إلى", "هذا", "هذه", "هناك", "بعد", "قبل", "عن", "في", "او", "أو",
]);

const extractAttachmentKeywords = (text, limit = 5) => {
    const tokens = String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !ATTACHMENT_STOPWORDS.has(token));
    const counts = new Map();
    tokens.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([token]) => token);
};

const readFileAsText = (file, maxChars = 120000) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result || "").slice(0, maxChars));
        reader.readAsText(file);
    });

const getImageDimensionsFromSource = (src) =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve({ width: image.width, height: image.height });
        image.onerror = () => reject(new Error("Image dimensions unavailable"));
        image.src = src;
    });

const summarizeAttachmentText = (text, lang = getCurrentLanguage()) => {
    const cleaned = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleaned) {
        return {
            summary: lang === "en" ? "Text content was attached locally." : "تم إرفاق نص محلي كمرجع.",
            keywords: [],
        };
    }
    const firstLine = cleaned.split(/[\n\r]/).map((line) => line.trim()).find(Boolean) || cleaned.slice(0, 96);
    const keywords = extractAttachmentKeywords(cleaned);
    return {
        summary:
            lang === "en"
                ? `Text file captured locally. First clear line: ${firstLine.slice(0, 120)}`
                : `تم التقاط ملف نصي محليًا. أول سطر واضح: ${firstLine.slice(0, 120)}`,
        keywords,
    };
};

const summarizeCsvAttachment = (text, lang = getCurrentLanguage()) => {
    const rows = String(text || "").split(/\r?\n/).filter((line) => line.trim());
    const headers = rows[0] ? rows[0].split(",").map((part) => part.trim()).filter(Boolean).slice(0, 5) : [];
    const rowCount = Math.max(0, rows.length - 1);
    return {
        summary:
            lang === "en"
                ? `CSV file with ${rowCount} data row(s) and columns: ${headers.join(", ") || "not detected"}.`
                : `ملف CSV يحتوي تقريبًا على ${rowCount} صف بيانات وأعمدة: ${headers.join("، ") || "غير واضحة"}.`,
        keywords: headers,
    };
};

const summarizeJsonAttachment = (text, lang = getCurrentLanguage()) => {
    try {
        const parsed = JSON.parse(text);
        const keys =
            parsed && typeof parsed === "object"
                ? Object.keys(Array.isArray(parsed) ? parsed[0] || {} : parsed).slice(0, 6)
                : [];
        return {
            summary:
                lang === "en"
                    ? `JSON structure detected with key field(s): ${keys.join(", ") || "not detected"}.`
                    : `تم التعرف على ملف JSON مع حقول رئيسية: ${keys.join("، ") || "غير واضحة"}.`,
            keywords: keys,
        };
    } catch (error) {
        return summarizeAttachmentText(text, lang);
    }
};

const buildAttachmentInsight = async (file, category, preview = "") => {
    const extension = String(file.name || "").split(".").pop()?.toLowerCase() || "";
    const mime = String(file.type || "").toLowerCase();
    const insightAr = { summary: "تم حفظ المرفق محليًا للمراجعة.", keywords: [] };
    const insightEn = { summary: "The attachment was stored locally for review.", keywords: [] };

    if (category === "skin" && preview) {
        try {
            const dims = await getImageDimensionsFromSource(preview);
            return {
                summary_ar: `صورة جلدية محلية بأبعاد ${dims.width}×${dims.height}. يمكن استخدامها كمرجع بصري عند مراجعة الملخص.`,
                summary_en: `A local skin image (${dims.width}×${dims.height}) is available as a visual reference for the summary review.`,
                keywords: ["skin", "image", `${dims.width}x${dims.height}`],
            };
        } catch (error) {
            return {
                summary_ar: "تمت إضافة صورة جلدية محلية كمرجع بصري داخل هذه الجلسة.",
                summary_en: "A local skin image was added as a visual reference for this session.",
                keywords: ["skin", "image"],
            };
        }
    }

    if (mime.includes("json") || extension === "json") {
        const text = await readFileAsText(file);
        const ar = summarizeJsonAttachment(text, "ar");
        const en = summarizeJsonAttachment(text, "en");
        return { summary_ar: ar.summary, summary_en: en.summary, keywords: en.keywords.length ? en.keywords : ar.keywords };
    }

    if (mime.includes("csv") || extension === "csv") {
        const text = await readFileAsText(file);
        const ar = summarizeCsvAttachment(text, "ar");
        const en = summarizeCsvAttachment(text, "en");
        return { summary_ar: ar.summary, summary_en: en.summary, keywords: en.keywords.length ? en.keywords : ar.keywords };
    }

    if (mime.startsWith("text/") || ["txt", "md"].includes(extension)) {
        const text = await readFileAsText(file);
        const ar = summarizeAttachmentText(text, "ar");
        const en = summarizeAttachmentText(text, "en");
        return { summary_ar: ar.summary, summary_en: en.summary, keywords: en.keywords.length ? en.keywords : ar.keywords };
    }

    if (mime.includes("pdf") || extension === "pdf") {
        return {
            summary_ar: "تم حفظ ملف PDF محليًا. يفضّل مراجعة محتواه يدويًا مع الملخص لأنه لا يزال دون استخراج نص كامل.",
            summary_en: "A PDF was stored locally. Its content should be reviewed manually with the summary because full text extraction is not enabled here.",
            keywords: extractAttachmentKeywords(file.name),
        };
    }

    if (["doc", "docx"].includes(extension)) {
        return {
            summary_ar: "تم حفظ مستند طبي محليًا كمرجع للجلسة الحالية.",
            summary_en: "A medical document was stored locally as a reference for this session.",
            keywords: extractAttachmentKeywords(file.name),
        };
    }

    return {
        summary_ar: insightAr.summary,
        summary_en: insightEn.summary,
        keywords: extractAttachmentKeywords(file.name),
    };
};

const getAttachmentInsightText = (attachment, lang = getCurrentLanguage()) => {
    if (!attachment?.insight) {
        return "";
    }
    return lang === "en" ? attachment.insight.summary_en || "" : attachment.insight.summary_ar || "";
};

const buildAttachmentContextText = (session = currentSession, lang = getCurrentLanguage()) => {
    const attachments = Array.isArray(session?.attachments) ? session.attachments : [];
    if (!attachments.length) {
        return "";
    }
    return attachments
        .map((attachment) => {
            const label = attachment.category === "skin" ? UPLOAD_COPY[lang].imageLabel : UPLOAD_COPY[lang].fileLabel;
            const insight = getAttachmentInsightText(attachment, lang);
            const keywords = Array.isArray(attachment.insight?.keywords) && attachment.insight.keywords.length
                ? ` ${lang === "en" ? "Keywords" : "كلمات"}: ${attachment.insight.keywords.slice(0, 5).join(lang === "en" ? ", " : "، ")}.`
                : "";
            return `${label}: ${insight}${keywords}`.trim();
        })
        .filter(Boolean)
        .join("\n");
};

const getFeedbackLabel = (value, lang = getCurrentLanguage()) => {
    return FEEDBACK_COPY[lang]?.[value] || FEEDBACK_COPY[lang]?.none || value || "-";
};

const summarizeAnalytics = () => {
    const history = readSessionHistory();
    const events = readAnalyticsState().events;
    const feedbackEntries = history.flatMap((entry) => Object.values(entry.feedback || {})).filter(Boolean);
    const lowConfidence = history.filter(
        (entry) => Number(entry.confidence || entry.session?.report?.sections?.prediction?.confidence || 0) > 0 &&
            Number(entry.confidence || entry.session?.report?.sections?.prediction?.confidence || 0) < 0.62
    ).length;
    const profiles = readProfileDirectory();
    const reviewed = history.filter((entry) => buildCaseManagementState(entry.session?.case_management).review_status === "reviewed").length;
    const followUp = history.filter((entry) => buildCaseManagementState(entry.session?.case_management).review_status === "follow_up").length;
    return {
        saved: history.length,
        completed: history.filter((entry) => entry.session?.report).length,
        highRisk: history.filter((entry) => ["high", "urgent", "emergency", "مرتفع", "عاجل", "طارئ"].includes(String(entry.risk_level || "").toLowerCase()) || ["high","urgent","emergency"].includes(String(entry.session?.recommendation?.risk_level || "").toLowerCase())).length,
        tips: history.filter((entry) => Array.isArray(entry.session?.tips) && entry.session.tips.length).length,
        attachments: history.reduce((total, entry) => total + (Array.isArray(entry.session?.attachments) ? entry.session.attachments.length : 0), 0),
        feedback: feedbackEntries.length,
        shares: events.filter((event) => String(event.type).startsWith("share_")).length,
        exports: events.filter((event) => event.type === "export_report_pdf").length,
        lowConfidence,
        profiles: profiles.length,
        reviewed,
        followUp,
    };
};

const getAllKnownSpecialties = (history = readSessionHistory()) => {
    return Array.from(
        new Set(
            history
                .map((entry) => entry.specialty || entry.session?.report?.sections?.prediction?.specialty)
                .filter(Boolean)
        )
    );
};

const getAllKnownProfiles = (history = readSessionHistory()) =>
    Array.from(
        new Map(
            history
                .map((entry) => entry.profile || entry.session?.profile)
                .filter((profile) => profile?.id)
                .map((profile) => [profile.id, buildSessionProfile(profile)])
        ).values()
    );

const buildDashboardInsights = (history = readSessionHistory(), lang = getCurrentLanguage()) => {
    if (!history.length) {
        return [];
    }
    const specialtyCounts = new Map();
    const riskCounts = new Map();
    history.forEach((entry) => {
        const specialty = entry.session?.report?.sections?.prediction?.specialty || entry.specialty || "";
        const risk = String(entry.session?.recommendation?.risk_level || entry.risk_level || "").toLowerCase();
        if (specialty) {
            specialtyCounts.set(specialty, (specialtyCounts.get(specialty) || 0) + 1);
        }
        if (risk) {
            riskCounts.set(risk, (riskCounts.get(risk) || 0) + 1);
        }
    });
    const topSpecialty = Array.from(specialtyCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const topRisk = Array.from(riskCounts.entries()).sort((a, b) => b[1] - a[1])[0];
    const lowConfidence = history.filter(
        (entry) => Number(entry.confidence || entry.session?.report?.sections?.prediction?.confidence || 0) > 0 &&
            Number(entry.confidence || entry.session?.report?.sections?.prediction?.confidence || 0) < 0.62
    ).length;
    const profiles = getAllKnownProfiles(history).length;
    const followUpOpen = history.filter((entry) => buildCaseManagementState(entry.session?.case_management).review_status === "follow_up").length;
    return [
        topSpecialty
            ? `${DASHBOARD_COPY[lang].insightTopSpecialty}: ${translateSpecialty(topSpecialty[0], lang)} (${topSpecialty[1]})`
            : "",
        topRisk
            ? `${DASHBOARD_COPY[lang].insightTopRisk}: ${translateRiskLevelLabel(topRisk[0], lang)} (${topRisk[1]})`
            : "",
        `${DASHBOARD_COPY[lang].insightLowConfidence}: ${lowConfidence}`,
        `${DASHBOARD_COPY[lang].insightProfiles}: ${profiles}`,
        `${DASHBOARD_COPY[lang].insightNeedsFollowUp}: ${followUpOpen}`,
    ].filter(Boolean);
};

const buildSessionReminders = (history = readSessionHistory(), lang = getCurrentLanguage()) => {
    const dismissed = new Set(readReminderState().dismissed);
    const reminders = [];
    history.forEach((entry) => {
        const session = entry.session || {};
        const risk = String(session.recommendation?.risk_level || entry.risk_level || "").toLowerCase();
        const attachmentsCount = Array.isArray(session.attachments) ? session.attachments.length : 0;
        const doctorNote = String(session.doctor_notes?.text || "").trim();
        const caseState = buildCaseManagementState(session.case_management);
        const dueState = getFollowUpDueState(caseState.follow_up_due);
        const latestFeedback = Object.values(session.feedback || {})
            .filter(Boolean)
            .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
        const baseMeta = `${getProfileDisplayName(entry.profile || session.profile, lang)} • ${formatSessionTimestamp(entry.saved_at, lang)}`;

        if (caseState.review_status === "closed") {
            return;
        }

        const maybePush = (suffix, priority, text) => {
            const id = `${entry.id}:${suffix}`;
            if (dismissed.has(id)) {
                return;
            }
            reminders.push({
                id,
                sessionId: entry.id,
                priority,
                text,
                meta: baseMeta,
                session,
            });
        };

        if (["high", "urgent", "emergency"].includes(risk)) {
            maybePush("risk", 0, DASHBOARD_COPY[lang].reminderHighRisk);
        }
        if (session.report && !doctorNote) {
            maybePush("doctor-note", 1, DASHBOARD_COPY[lang].reminderDoctorNote);
        }
        if (attachmentsCount > 0 && !caseState.attachment_reviewed) {
            maybePush("attachment", 2, DASHBOARD_COPY[lang].reminderAttachmentReview);
        }
        if (latestFeedback?.rating === "not_helpful") {
            maybePush("feedback", 1, DASHBOARD_COPY[lang].reminderFeedback);
        }
        if (caseState.review_status === "follow_up" && ["overdue", "today"].includes(dueState)) {
            maybePush("follow-up", dueState === "overdue" ? 0 : 1, DASHBOARD_COPY[lang].reminderFollowUpDue);
        }
        if (["high", "urgent", "emergency"].includes(risk) && !caseState.urgent_acknowledged_at) {
            maybePush("urgent-ack", 0, DASHBOARD_COPY[lang].reminderUrgentAck);
        }
    });
    return reminders.sort((a, b) => a.priority - b.priority).slice(0, MAX_REMINDERS);
};

const getReminderKind = (reminder) => {
    const text = String(reminder?.id || "");
    const parts = text.split(":");
    return parts[parts.length - 1] || "";
};

const shouldNotifyForReminder = (reminder) =>
    ["risk", "follow-up", "urgent-ack"].includes(getReminderKind(reminder));

const getNotificationDeliveryKey = (reminder) => {
    const today = new Date().toISOString().slice(0, 10);
    return `${String(reminder?.id || "reminder")}::${today}`;
};

const getNotificationIconUrl = (path = "images/app-icon-192.png") => {
    if (typeof window === "undefined") {
        return path;
    }
    return new URL(path, window.location.href).toString();
};

const buildReminderNotificationPayload = (reminder, lang = getCurrentLanguage()) => {
    const complaint = String(reminder?.session?.complaint || "").trim();
    const title =
        lang === "en"
            ? complaint
                ? `Medika AI follow-up: ${complaint.slice(0, 54)}`
                : "Medika AI follow-up reminder"
            : complaint
                ? `متابعة Medika AI: ${complaint.slice(0, 54)}`
                : "تذكير متابعة من Medika AI";
    const body = [String(reminder?.text || "").trim(), String(reminder?.meta || "").trim()]
        .filter(Boolean)
        .join(" • ") || DASHBOARD_COPY[lang].notificationBodyDefault;
    return {
        title,
        body,
        tag: `medika-${String(reminder?.id || "reminder")}`,
        icon: getNotificationIconUrl("images/app-icon-192.png"),
        badge: getNotificationIconUrl("images/app-icon-192.png"),
        data: {
            url: `report.html?lang=${lang}`,
            sessionId: reminder?.sessionId || "",
            reminderId: reminder?.id || "",
        },
    };
};

const showBrowserNotification = async (payload) => {
    if (!isBrowserNotificationSupported() || getBrowserNotificationPermission() !== "granted") {
        return false;
    }
    try {
        const registration = serviceWorkerRegistrationPromise
            ? await serviceWorkerRegistrationPromise.catch(() => null)
            : await navigator.serviceWorker?.ready?.catch?.(() => null);
        if (registration?.showNotification) {
            await registration.showNotification(payload.title, {
                body: payload.body,
                icon: payload.icon,
                badge: payload.badge,
                tag: payload.tag,
                data: payload.data,
                renotify: false,
            });
            return true;
        }
        if (typeof Notification !== "undefined") {
            const notification = new Notification(payload.title, {
                body: payload.body,
                icon: payload.icon,
                tag: payload.tag,
                data: payload.data,
            });
            notification.onclick = () => {
                if (payload.data?.url) {
                    window.focus?.();
                    window.location.href = payload.data.url;
                }
            };
            return true;
        }
    } catch (error) {
        console.warn("Notification delivery failed:", error);
    }
    return false;
};

const requestBrowserNotificationPermission = async () => {
    if (!isBrowserNotificationSupported()) {
        return "unsupported";
    }
    try {
        const permission = await Notification.requestPermission();
        const state = readNotificationState();
        state.last_permission = permission;
        if (permission !== "granted") {
            state.enabled = false;
        }
        writeNotificationState(state);
        return permission;
    } catch (error) {
        return "denied";
    }
};

const triggerReminderNotifications = async (historyEntries = readSessionHistory(), lang = getCurrentLanguage(), options = {}) => {
    const { force = false } = options;
    const state = syncNotificationPermissionState();
    if (!state.enabled || state.last_permission !== "granted") {
        return 0;
    }
    const reminders = buildSessionReminders(historyEntries, lang).filter((reminder) => shouldNotifyForReminder(reminder));
    let sentCount = 0;
    for (const reminder of reminders) {
        const key = getNotificationDeliveryKey(reminder);
        if (!force && state.sent[key]) {
            continue;
        }
        const delivered = await showBrowserNotification(buildReminderNotificationPayload(reminder, lang));
        if (delivered) {
            state.sent[key] = new Date().toISOString();
            sentCount += 1;
        }
    }
    state.last_sweep_at = new Date().toISOString();
    writeNotificationState(state);
    return sentCount;
};

const startBrowserReminderNotificationLoop = () => {
    if (browserNotificationLoopStarted || typeof window === "undefined") {
        return;
    }
    browserNotificationLoopStarted = true;
    const runSweep = () => triggerReminderNotifications(readSessionHistory(), getCurrentLanguage()).catch(() => 0);
    window.setTimeout(runSweep, 2200);
    window.setInterval(runSweep, NOTIFICATION_SWEEP_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            runSweep();
        }
    });
};

const buildDistribution = (items, labelFn = (value) => value) => {
    const counts = new Map();
    items.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const rows = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6);
    const max = rows[0]?.[1] || 1;
    return rows.map(([value, count]) => ({
        label: labelFn(value),
        value: count,
        percent: Math.max(8, Math.round((count / max) * 100)),
    }));
};

const buildActivityDistribution = (history = readSessionHistory(), lang = getCurrentLanguage()) => {
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - offset);
        const key = date.toISOString().slice(0, 10);
        days.push({
            key,
            label: new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ar-JO", {
                month: "short",
                day: "numeric",
            }).format(date),
            value: 0,
        });
    }
    history.forEach((entry) => {
        const key = String(entry.saved_at || "").slice(0, 10);
        const bucket = days.find((day) => day.key === key);
        if (bucket) {
            bucket.value += 1;
        }
    });
    const max = Math.max(1, ...days.map((day) => day.value));
    return days.map((day) => ({
        label: day.label,
        value: day.value,
        percent: day.value > 0 ? Math.max(8, Math.round((day.value / max) * 100)) : 8,
    }));
};

const renderLimeChips = (container, noteNode, explanation) => {
    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (noteNode) {
        noteNode.textContent =
            explanation?.explanation_note ||
            "الكلمات التالية هي الأكثر تأثيرًا في ترجيح التخصص المتوقع.";
    }

    const items = explanation?.word_importance || [];
    if (!items.length) {
        const chip = document.createElement("span");
        chip.className = "placeholder-chip";
        chip.textContent = "لا يوجد تفسير بعد";
        container.appendChild(chip);
        return;
    }

    items.forEach(([word, weight]) => {
        const chip = document.createElement("span");
        chip.className = "lime-chip";
        chip.textContent = `${word} (${Number(weight).toFixed(2)})`;
        container.appendChild(chip);
    });
};

const parseTipLines = (tip) =>
    String(tip)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

if (navToggle && navPanel) {
    navToggle.addEventListener("click", () => {
        const expanded = navToggle.getAttribute("aria-expanded") === "true";
        navToggle.setAttribute("aria-expanded", String(!expanded));
        navPanel.classList.toggle("is-open", !expanded);
    });
}

const PWA_COPY = {
    ar: {
        install: "تثبيت التطبيق",
        installed: "تم تثبيت التطبيق على الجهاز.",
        ios_hint: "على iPhone أو iPad: افتح قائمة المشاركة ثم اختر Add to Home Screen.",
        browser_hint: "يمكنك تثبيت التطبيق من قائمة المتصفح إذا كانت ميزة التثبيت مدعومة على جهازك.",
    },
    en: {
        install: "Install App",
        installed: "The app has been installed on this device.",
        ios_hint: "On iPhone or iPad, open Share and choose Add to Home Screen.",
        browser_hint: "You can install the app from the browser menu if installation is supported on your device.",
    },
};

let deferredInstallPrompt = null;
let pwaInstallButton = null;
let pwaInstallHint = null;
let pwaHintTimer = null;

const getPwaLanguage = () => (String(document.documentElement.lang || "").toLowerCase().startsWith("en") ? "en" : "ar");
const getPwaText = () => PWA_COPY[getPwaLanguage()];
const isIosDevice = () => /iphone|ipad|ipod/i.test(window.navigator.userAgent || "");
const isStandaloneDisplay = () =>
    window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;

const ensurePwaInstallButton = () => {
    if (pwaInstallButton) {
        pwaInstallButton.querySelector("span").textContent = getPwaText().install;
        pwaInstallButton.title = getPwaText().install;
        return pwaInstallButton;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pwa-install-btn";
    button.hidden = true;
    button.innerHTML = '<i class="fas fa-mobile-screen-button" aria-hidden="true"></i><span></span>';
    button.addEventListener("click", async () => {
        if (deferredInstallPrompt) {
            deferredInstallPrompt.prompt();
            try {
                await deferredInstallPrompt.userChoice;
            } catch (error) {
                console.warn("Install prompt dismissed:", error);
            }
            deferredInstallPrompt = null;
            hidePwaInstallButton();
            return;
        }

        showPwaInstallHint(isIosDevice() ? getPwaText().ios_hint : getPwaText().browser_hint);
    });

    document.body.appendChild(button);
    pwaInstallButton = button;
    ensurePwaInstallButton();
    return pwaInstallButton;
};

const ensurePwaInstallHint = () => {
    if (pwaInstallHint) {
        return pwaInstallHint;
    }

    const hint = document.createElement("div");
    hint.className = "pwa-install-hint";
    hint.hidden = true;
    document.body.appendChild(hint);
    pwaInstallHint = hint;
    return pwaInstallHint;
};

const showPwaInstallHint = (message) => {
    const hint = ensurePwaInstallHint();
    hint.textContent = message;
    hint.hidden = false;
    hint.classList.add("is-visible");
    clearTimeout(pwaHintTimer);
    pwaHintTimer = window.setTimeout(() => {
        hint.classList.remove("is-visible");
        hint.hidden = true;
    }, 3600);
};

const showPwaInstallButton = () => {
    if (isStandaloneDisplay()) {
        hidePwaInstallButton();
        return;
    }
    const button = ensurePwaInstallButton();
    button.hidden = false;
};

const hidePwaInstallButton = () => {
    if (pwaInstallButton) {
        pwaInstallButton.hidden = true;
    }
};

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        serviceWorkerRegistrationPromise = navigator.serviceWorker.register("service-worker.js")
            .then((registration) => registration)
            .catch((error) => {
                console.warn("Service worker registration failed:", error);
                return null;
            });
        startBrowserReminderNotificationLoop();
    });
}

window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    showPwaInstallButton();
});

window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    hidePwaInstallButton();
    showPwaInstallHint(getPwaText().installed);
});

window.addEventListener("load", () => {
    if (!isStandaloneDisplay() && isIosDevice()) {
        showPwaInstallButton();
    }
});
if (yearNode) {
    yearNode.textContent = new Date().getFullYear();
}

const initialLanguage = readUrlLanguage() || readStoredLanguage();
writeStoredLanguage(initialLanguage);
trackAnalyticsEvent("page_view", {
    page: typeof window !== "undefined" ? window.location.pathname.split("/").pop() || "index.html" : "unknown",
});

if (isHomePage) {
    applyHomeLanguage(initialLanguage);
}

if (isChatPage) {
    applyChatLanguage(initialLanguage);
    applyConsentLanguage(initialLanguage);
    applyUploadLanguage(initialLanguage);
}

mountThemeToggle();
mountMobileBottomNav();

if (langToggle && isHomePage) {
    langToggle.addEventListener("click", () => {
        const nextLang = getHomeLanguage() === "en" ? "ar" : "en";
        applyHomeLanguage(nextLang);
    });
}

if (chatLangToggle && isChatPage) {
    chatLangToggle.addEventListener("click", () => {
        const nextLang = getCurrentLanguage() === "en" ? "ar" : "en";
        applyChatLanguage(nextLang);
    });
}

if (revealItems.length) {
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    entry.target.classList.add("is-visible");
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15 }
    );

    revealItems.forEach((item) => revealObserver.observe(item));
}

if (contactForm) {
    contactForm.addEventListener("submit", (event) => {
        event.preventDefault();
        const submitButton = contactForm.querySelector('button[type="submit"]');

        if (!submitButton) {
            return;
        }

        const originalLabel = submitButton.textContent;
        submitButton.textContent = isHomePage
            ? HOME_TRANSLATIONS[getHomeLanguage()].contact_form_sent
            : "تم الإرسال";
        submitButton.disabled = true;

        setTimeout(() => {
            submitButton.textContent = originalLabel;
            submitButton.disabled = false;
            contactForm.reset();
        }, 1800);
    });
}

const chatForm = document.getElementById("chat-form");

if (chatForm) {
    const stageOrder = ["complaint", "questions", "recommendation", "explanation", "tips"];
    const chatBox = document.getElementById("chat-box");
    const userInput = document.getElementById("user-input");
    const quickPrompts = document.querySelectorAll(".quick-prompt");
    const quickRepliesPanel = document.getElementById("quick-replies-panel");
    const quickReplies = document.getElementById("quick-replies");
    const sendBtn = document.getElementById("send-btn");
    const voiceBtn = document.getElementById("voice-btn");
    const speakerToggleBtn = document.getElementById("speaker-toggle-btn");
    const newSessionBtn = document.getElementById("new-session-btn");
    const stageItems = Array.from(document.querySelectorAll(".stage-item"));
    const emergencyBanner = document.getElementById("emergency-banner");
    const emergencyText = document.getElementById("emergency-text");
    const actionLinksPanel = document.getElementById("action-links-panel");
    const actionLinksGrid = document.getElementById("action-links-grid");
    const sessionHistoryList = document.getElementById("session-history-list");
    const clearHistoryBtn = document.getElementById("clear-history-btn");
    const attachmentList = document.getElementById("attachment-list");
    const skinUploadBtn = document.getElementById("skin-upload-btn");
    const fileUploadBtn = document.getElementById("file-upload-btn");
    const skinUploadInput = document.getElementById("skin-upload-input");
    const fileUploadInput = document.getElementById("file-upload-input");
    const accountRoleButtons = Array.from(document.querySelectorAll(".account-role-btn"));
    const accountNameInput = document.getElementById("account-name-input");
    const saveAccountBtn = document.getElementById("save-account-btn");
    const accountStatus = document.getElementById("account-status");
    const consentOverlay = document.getElementById("consent-overlay");
    const consentCheckbox = document.getElementById("consent-checkbox");
    const consentAcceptBtn = document.getElementById("consent-accept-btn");

    let currentMode = "complaint";
    let currentCase = null;
    let currentSession = readStoredSession();
    let activeProfile = readActiveProfile();
    let typingNode = null;
    let recognition = null;
    let isListening = false;
    let autoSpeakEnabled = readStoredAudioPreference();
    let currentSpeechButton = null;
    let currentSpeechToken = 0;
    let currentAudio = null;
    let consentAccepted = false;

    currentSession.profile = buildSessionProfile(currentSession.profile || activeProfile);

    const getCopy = () => getChatCopy();
    const canUseSpeechSynthesis = () =>
        typeof window !== "undefined" &&
        "speechSynthesis" in window &&
        typeof window.SpeechSynthesisUtterance !== "undefined";
    const canUseHtmlAudio = () => typeof Audio !== "undefined";
    const getSpeechRecognitionLocale = () => (getCurrentLanguage() === "en" ? "en-US" : "ar-LB");
    const getSpeechSynthesisLocale = () => (getCurrentLanguage() === "en" ? "en-US" : "ar-LB");
    const prepareTextForSpeech = (text) =>
        String(text || "")
            .replace(/🔹/g, "")
            .replace(/\n{2,}/g, ". ")
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

    const getPreferredSpeechVoice = (locale) => {
        if (!canUseSpeechSynthesis()) {
            return null;
        }

        const normalizedLocale = String(locale || "").toLowerCase();
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) {
            return null;
        }

        const exactMatch = voices.find((voice) => String(voice.lang || "").toLowerCase() === normalizedLocale);
        if (exactMatch) {
            return exactMatch;
        }

        if (normalizedLocale === "ar-lb") {
            return (
                voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("ar-lb")) ||
                voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith("ar-")) ||
                voices.find((voice) => /arabic/i.test(String(voice.name || ""))) ||
                null
            );
        }

        return (
            voices.find((voice) => String(voice.lang || "").toLowerCase().startsWith(normalizedLocale.slice(0, 2))) ||
            null
        );
    };

    const hasUsableArabicBrowserVoice = () => {
        const voice = getPreferredSpeechVoice("ar-LB");
        return Boolean(voice && String(voice.lang || "").toLowerCase().startsWith("ar"));
    };

    const updateSpeakerToggleUI = () => {
        if (!speakerToggleBtn) {
            return;
        }
        const audioAvailable = canUseSpeechSynthesis() || canUseHtmlAudio();
        speakerToggleBtn.classList.toggle("is-active", autoSpeakEnabled);
        speakerToggleBtn.setAttribute("aria-pressed", String(autoSpeakEnabled));
        speakerToggleBtn.setAttribute(
            "aria-label",
            autoSpeakEnabled ? getCopy().speaker_toggle_on : getCopy().speaker_toggle_off
        );
        const labelNode = document.getElementById("speaker-toggle-btn-label");
        if (labelNode) {
            labelNode.textContent = autoSpeakEnabled ? getCopy().speaker_toggle_on : getCopy().speaker_toggle_off;
        }
        if (!audioAvailable) {
            speakerToggleBtn.disabled = true;
            speakerToggleBtn.title = getCopy().tts_unsupported;
        } else {
            speakerToggleBtn.disabled = false;
            speakerToggleBtn.title = autoSpeakEnabled ? getCopy().speaker_toggle_on : getCopy().speaker_toggle_off;
        }
    };

    const updateSpeechButtonState = (button, isSpeaking) => {
        if (!button) {
            return;
        }
        button.classList.toggle("is-speaking", isSpeaking);
        button.setAttribute("aria-pressed", String(isSpeaking));
        button.setAttribute("aria-label", isSpeaking ? getCopy().speaker_stop : getCopy().speaker_play);
        button.title = isSpeaking ? getCopy().speaker_stop : getCopy().speaker_play;
        const icon = button.querySelector("i");
        const label = button.querySelector("span");
        if (icon) {
            icon.className = isSpeaking ? "fas fa-volume-xmark" : "fas fa-volume-high";
            icon.setAttribute("aria-hidden", "true");
        }
        if (label) {
            label.textContent = isSpeaking ? getCopy().speaker_stop : getCopy().speaker_play;
        }
    };

    const refreshMessageAudioButtons = () => {
        const isCurrentlySpeaking = (canUseSpeechSynthesis() && window.speechSynthesis.speaking) || Boolean(currentAudio);
        document.querySelectorAll(".message-audio-btn").forEach((button) => {
            updateSpeechButtonState(button, button === currentSpeechButton && isCurrentlySpeaking);
        });
    };

    const clearCurrentAudio = () => {
        if (!currentAudio) {
            return;
        }
        currentAudio.pause();
        currentAudio.currentTime = 0;
        if (currentAudio.dataset.objectUrl) {
            URL.revokeObjectURL(currentAudio.dataset.objectUrl);
        }
        currentAudio = null;
    };

    const stopSpeaking = () => {
        currentSpeechToken += 1;
        clearCurrentAudio();
        if (canUseSpeechSynthesis()) {
            window.speechSynthesis.cancel();
        }
        updateSpeechButtonState(currentSpeechButton, false);
        currentSpeechButton = null;
    };

    const playAzureSpeech = async (text, button, token) => {
        const response = await fetch(buildApiUrl("/api/text-to-speech"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                text,
                lang: getCurrentLanguage(),
            }),
        });

        if (!response.ok) {
            let errorPayload = null;
            try {
                errorPayload = await response.json();
            } catch (error) {
                errorPayload = null;
            }
            throw new Error(errorPayload?.error || `TTS request failed with status ${response.status}`);
        }

        const audioBlob = await response.blob();
        if (currentSpeechToken !== token) {
            return false;
        }

        const objectUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(objectUrl);
        audio.dataset.objectUrl = objectUrl;
        currentAudio = audio;
        currentSpeechButton = button;
        updateSpeechButtonState(button, true);

        audio.addEventListener("ended", () => {
            if (currentSpeechToken !== token) {
                return;
            }
            clearCurrentAudio();
            updateSpeechButtonState(currentSpeechButton, false);
            currentSpeechButton = null;
        });

        audio.addEventListener("error", () => {
            if (currentSpeechToken !== token) {
                return;
            }
            clearCurrentAudio();
            updateSpeechButtonState(currentSpeechButton, false);
            currentSpeechButton = null;
            createMessage(getCopy().tts_error, "bot", "text", { suppressAutoSpeak: true });
        });

        await audio.play();
        return true;
    };

    const speakMessageText = async (text, button = null) => {
        const cleanText = prepareTextForSpeech(text);
        if (!cleanText) {
            return;
        }

        const token = currentSpeechToken + 1;
        currentSpeechToken = token;
        stopSpeaking();
        currentSpeechToken = token;

        if (canUseHtmlAudio()) {
            try {
                const played = await playAzureSpeech(cleanText, button, token);
                if (played) {
                    return;
                }
            } catch (error) {
                console.warn("Azure TTS fallback:", error);
            }
        }

        if (getCurrentLanguage() !== "en" && !hasUsableArabicBrowserVoice()) {
            updateSpeechButtonState(currentSpeechButton, false);
            currentSpeechButton = null;
            createMessage(getCopy().tts_arabic_setup_needed, "bot", "text", { suppressAutoSpeak: true });
            return;
        }

        if (!canUseSpeechSynthesis()) {
            createMessage(getCopy().tts_error, "bot", "text", { suppressAutoSpeak: true });
            return;
        }

        const utterance = new SpeechSynthesisUtterance(cleanText);
        const locale = getSpeechSynthesisLocale();
        const preferredVoice = getPreferredSpeechVoice(locale);
        utterance.lang = preferredVoice?.lang || (locale === "ar-LB" ? "ar-SA" : locale);
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        utterance.rate = locale === "ar-LB" ? 0.97 : 1;
        utterance.pitch = 1;
        utterance.volume = 1;
        currentSpeechButton = button;
        updateSpeechButtonState(button, true);

        utterance.addEventListener("end", () => {
            if (currentSpeechToken !== token) {
                return;
            }
            updateSpeechButtonState(currentSpeechButton, false);
            currentSpeechButton = null;
        });

        utterance.addEventListener("error", () => {
            if (currentSpeechToken !== token) {
                return;
            }
            updateSpeechButtonState(currentSpeechButton, false);
            currentSpeechButton = null;
            createMessage(getCopy().tts_error, "bot", "text", { suppressAutoSpeak: true });
        });

        window.speechSynthesis.speak(utterance);
    };

    const toggleMessageSpeech = async (text, button) => {
        if (!canUseSpeechSynthesis()) {
            if (!canUseHtmlAudio()) {
                createMessage(getCopy().tts_unsupported, "bot");
                return;
            }
        }
        if (currentSpeechButton === button && ((canUseSpeechSynthesis() && window.speechSynthesis.speaking) || currentAudio)) {
            stopSpeaking();
            return;
        }
        await speakMessageText(text, button);
    };

    const buildTriageAssistantMessage = (prediction, firstQuestionText) => {
        const copy = getCopy();
        return copy.triage_prefix
            .replace("{specialty}", translateSpecialty(prediction?.final_label || "-", getCurrentLanguage()))
            .replace("{question}", firstQuestionText || "");
    };

    const buildFollowupAssistantMessage = (questionText) =>
        getCopy().followup_prefix.replace("{question}", questionText || "");

    const buildRecommendationAssistantMessage = (prediction, recommendation) => {
        const copy = getCopy();
        return copy.recommendation_prefix
            .replace("{specialty}", translateSpecialty(prediction?.final_label || "-", getCurrentLanguage()))
            .replace("{risk}", translateRiskLevelLabel(recommendation?.risk_level || "-", getCurrentLanguage()))
            .replace("{timing}", translateTiming(recommendation?.timing || "-", getCurrentLanguage()));
    };

    const getLocalizedQuestionOptions = (options = []) =>
        options.map((option) => (typeof option === "string" ? { value: option, label: option } : option));

    const setStage = (stage) => {
        const activeIndex = stageOrder.indexOf(stage);
        stageItems.forEach((item, index) => {
            item.classList.toggle("is-active", item.dataset.stage === stage);
            item.classList.toggle("is-complete", activeIndex > index);
        });
        renderSessionOverview(stage);
    };

    const getReadyPagesCount = () => {
        let count = 0;
        if (currentSession.report) count += 1;
        if (currentSession.explanation) count += 1;
        if (currentSession.tips) count += 1;
        return count;
    };

    const getStageCopyValue = (stage) => {
        const copy = getCopy();
        const stageMap = {
            complaint: copy.stage_complaint,
            questions: copy.stage_questions,
            recommendation: copy.stage_recommendation,
            explanation: copy.stage_explanation,
            tips: copy.stage_tips,
        };
        return stageMap[stage] || copy.stage_complaint;
    };

    const getStatusPillCopy = () => {
        const copy = getCopy();
        if (currentMode === "questions") {
            return copy.status_questions;
        }
        if (currentMode === "ask_tips") {
            return copy.status_result_ready;
        }
        if (currentMode === "completed") {
            return copy.status_completed;
        }
        return copy.status_pill;
    };

    const renderSessionOverview = (stage = "complaint") => {
        const stepNode = document.getElementById("chat-session-step-value");
        const pagesNode = document.getElementById("chat-session-pages-value");
        const attachmentsNode = document.getElementById("chat-session-attachments-value");
        const pillNode = document.getElementById("chat-status-pill");
        if (stepNode) {
            stepNode.textContent = getStageCopyValue(stage);
        }
        if (pagesNode) {
            pagesNode.textContent = String(getReadyPagesCount());
        }
        if (attachmentsNode) {
            attachmentsNode.textContent = String(Array.isArray(currentSession.attachments) ? currentSession.attachments.length : 0);
        }
        if (pillNode) {
            pillNode.textContent = getStatusPillCopy();
            pillNode.dataset.mode = currentMode;
        }
    };

    const setInputPlaceholder = () => {
        const copy = getCopy();
        if (currentMode === "complaint") {
            userInput.placeholder = copy.placeholder_complaint;
            return;
        }

        if (currentMode === "questions" && currentCase) {
            const question = currentCase.questions[currentCase.questionIndex];
            if (!question) {
                userInput.placeholder = copy.placeholder_answer_text;
                return;
            }

            if (question.input_type === "text") {
                userInput.placeholder = question.displayHint || copy.placeholder_answer_text;
            } else {
                userInput.placeholder = copy.placeholder_answer_choice;
            }
            return;
        }

        if (currentMode === "ask_tips") {
            userInput.placeholder = copy.placeholder_tips;
            return;
        }

        userInput.placeholder = copy.placeholder_completed;
    };

    const scrollToLatest = () => {
        chatBox.scrollTo({
            top: chatBox.scrollHeight,
            behavior: "smooth",
        });
    };

    const renderInitialTranscript = () => {
        chatBox.innerHTML = "";
        createMessage(getCopy().initial_assistant_message, "bot");
    };

    const createMessage = (content, sender, type = "text", options = {}) => {
        const row = document.createElement("article");
        row.className = `message-row ${sender}`;

        const avatar = document.createElement("div");
        avatar.className = "avatar";
        avatar.innerHTML = sender === "user"
            ? '<i class="fas fa-user" aria-hidden="true"></i>'
            : '<i class="fas fa-robot" aria-hidden="true"></i>';

        const bubble = document.createElement("div");
        bubble.className = "message-bubble";
        bubble.dir = getTextDirection(content, getCurrentLanguage());

        const role = document.createElement("span");
        role.className = "message-role";
        role.textContent = sender === "user" ? getCopy().user_role : getCopy().bot_role;
        bubble.appendChild(role);

        if (type === "typing") {
            const dots = document.createElement("div");
            dots.className = "typing-dots";
            for (let index = 0; index < 3; index += 1) {
                dots.appendChild(document.createElement("span"));
            }
            bubble.appendChild(dots);
        } else {
            const paragraph = document.createElement("p");
            paragraph.textContent = content;
            bubble.appendChild(paragraph);

            if (sender === "bot" && (canUseSpeechSynthesis() || canUseHtmlAudio())) {
                const actions = document.createElement("div");
                actions.className = "message-bubble-actions";

                const speakBtn = document.createElement("button");
                speakBtn.type = "button";
                speakBtn.className = "message-audio-btn";
                speakBtn.innerHTML = '<i class="fas fa-volume-high" aria-hidden="true"></i><span class="sr-only"></span>';
                updateSpeechButtonState(speakBtn, false);
                speakBtn.addEventListener("click", () => {
                    void toggleMessageSpeech(content, speakBtn);
                });

                actions.appendChild(speakBtn);
                bubble.appendChild(actions);

                if (autoSpeakEnabled && !options.suppressAutoSpeak) {
                    setTimeout(() => {
                        void speakMessageText(content, speakBtn);
                    }, 120);
                }
            }
        }

        row.appendChild(avatar);
        row.appendChild(bubble);
        chatBox.appendChild(row);
        scrollToLatest();
        return row;
    };

    const showTyping = () => {
        stopSpeaking();
        typingNode = createMessage("", "bot", "typing");
        userInput.disabled = true;
        sendBtn.disabled = true;
        if (voiceBtn) {
            voiceBtn.disabled = true;
        }
    };

    const removeTyping = () => {
        if (typingNode) {
            typingNode.remove();
            typingNode = null;
        }
        userInput.disabled = false;
        sendBtn.disabled = false;
        if (voiceBtn) {
            voiceBtn.disabled = false;
        }
        userInput.focus();
    };

    const postJson = async (url, payload) => {
        const response = await fetch(buildApiUrl(url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        return { response, data };
    };

    const normalizeAnswerForBackend = (question, rawAnswer) => {
        if (!question || getCurrentLanguage() !== "en") {
            return rawAnswer;
        }

        const normalized = normalizeReply(rawAnswer);
        const matchedOption = getLocalizedQuestionOptions(question.displayOptions).find(
            (option) =>
                normalizeReply(option.label) === normalized || normalizeReply(option.value) === normalized
        );

        if (matchedOption) {
            return matchedOption.value;
        }

        if (isYes(rawAnswer)) {
            return "نعم";
        }

        if (isNo(rawAnswer)) {
            return "لا";
        }

        return rawAnswer;
    };

    const resetQuickReplies = () => {
        if (!quickRepliesPanel || !quickReplies) {
            return;
        }
        quickReplies.innerHTML = "";
        quickRepliesPanel.hidden = true;
    };

    const renderQuickReplies = (options = []) => {
        if (!quickRepliesPanel || !quickReplies || !options.length) {
            resetQuickReplies();
            return;
        }

        quickReplies.innerHTML = "";
        getLocalizedQuestionOptions(options).forEach((option) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "quick-reply";
            button.textContent = option.label;
            button.addEventListener("click", () => {
                handleConversationInput(option.value, option.label);
            });
            quickReplies.appendChild(button);
        });

        quickRepliesPanel.hidden = false;
    };

    const showEmergency = (message = "", level = "") => {
        if (!emergencyBanner || !emergencyText) {
            return;
        }

        if (!message) {
            emergencyBanner.hidden = true;
            emergencyBanner.removeAttribute("data-level");
            return;
        }

        emergencyText.textContent = message;
        emergencyBanner.dataset.level = level || "urgent";
        emergencyBanner.hidden = false;
    };

    const formatHistoryTimestamp = (value) => {
        if (!value) {
            return "";
        }

        try {
            return new Date(value).toLocaleString(getCurrentLanguage() === "en" ? "en-US" : "ar-JO", {
                dateStyle: "medium",
                timeStyle: "short",
            });
        } catch (error) {
            return "";
        }
    };

    const buildHistoryMeta = (entry) => {
        const caseState = buildCaseManagementState(entry.session?.case_management || {
            review_status: entry.review_status,
            follow_up_due: entry.follow_up_due,
        });
        const parts = [
            entry.profile?.name ? `${translateRoleLabel(entry.profile?.role, getCurrentLanguage())}: ${entry.profile.name}` : "",
            entry.specialty ? translateSpecialty(entry.specialty, getCurrentLanguage()) : "",
            entry.risk_level ? translateRiskLevelLabel(entry.risk_level, getCurrentLanguage()) : "",
            translateReviewStatus(caseState.review_status, getCurrentLanguage()),
            caseState.follow_up_due
                ? `${getCurrentLanguage() === "en" ? "Follow-up" : "متابعة"}: ${formatFollowUpDate(caseState.follow_up_due, getCurrentLanguage())}`
                : "",
        ].filter(Boolean);

        return parts.join(" • ");
    };

    const renderAccountPanel = (statusText = "") => {
        const copy = ACCOUNT_COPY[getCurrentLanguage()];
        accountRoleButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.role === activeProfile.role);
        });
        if (accountNameInput) {
            accountNameInput.value = activeProfile.name || "";
            accountNameInput.placeholder =
                activeProfile.role === "doctor" ? copy.namePlaceholderDoctor : copy.namePlaceholderPatient;
        }
        if (accountStatus) {
            accountStatus.textContent = statusText;
        }
    };

    const syncSessionProfile = () => {
        currentSession.profile = buildSessionProfile(activeProfile);
    };

    const getScopedHistoryEntries = () => {
        const entries = readSessionHistory();
        if (activeProfile.role === "doctor") {
            return entries;
        }
        return entries.filter((entry) => String(entry.profile?.id || entry.session?.profile?.id || "") === String(activeProfile.id));
    };

   const renderActionLinks = () => {
    if (!actionLinksPanel || !actionLinksGrid) {
        return;
    }

    actionLinksGrid.innerHTML = "";
    const cards = [];
    const copy = getCopy();

    if (currentSession.report) {
        cards.push({
            href: `report.html?lang=${getCurrentLanguage()}`,
            title: copy.report_title,
            text: copy.report_text,
            icon: "fa-file-waveform",
            kind: "summary",
        });
    }

    if (currentSession.explanation) {
        cards.push({
            href: `decision.html?lang=${getCurrentLanguage()}`,
            title: copy.decision_title,
            text: copy.decision_text,
            icon: "fa-diagram-project",
            kind: "decision",
        });
    }

    if (currentSession.tips) {
        cards.push({
            href: `integrative.html?lang=${getCurrentLanguage()}`,
            title: copy.tips_title,
            text: copy.tips_text,
            icon: "fa-seedling",
            kind: "tips",
        });
    }

    if (!cards.length) {
        actionLinksPanel.hidden = true;
        renderSessionOverview();
        return;
    }

    cards.forEach((card) => {
        const link = document.createElement("a");
        link.className = "action-link-card";
        link.href = card.href;
        link.dataset.kind = card.kind;
        link.innerHTML = `
            <div class="action-link-card__top">
                <span class="action-link-card__icon"><i class="fas ${card.icon}" aria-hidden="true"></i></span>
                <span class="action-link-card__badge">${copy.action_ready}</span>
            </div>
            <strong>${card.title}</strong>
            <span>${card.text}</span>
        `;
        actionLinksGrid.appendChild(link);
    });

    actionLinksPanel.hidden = false;
    renderSessionOverview();
};

    const renderSessionHistory = () => {
        if (!sessionHistoryList) {
            return;
        }

        const entries = getScopedHistoryEntries();
        sessionHistoryList.innerHTML = "";

        if (!entries.length) {
            const empty = document.createElement("p");
            empty.className = "session-history-empty";
            empty.textContent = getCopy().history_empty;
            sessionHistoryList.appendChild(empty);
            return;
        }

        entries.forEach((entry) => {
            const item = document.createElement("article");
            item.className = "session-history-item";
            const caseState = buildCaseManagementState(entry.session?.case_management);

            const title = document.createElement("strong");
            title.textContent = entry.complaint || "-";
            item.appendChild(title);

            const meta = document.createElement("span");
            meta.className = "session-history-meta";
            meta.textContent = buildHistoryMeta(entry);
            item.appendChild(meta);

            const time = document.createElement("span");
            time.className = "session-history-time";
            time.textContent = formatSessionTimestamp(entry.saved_at, getCurrentLanguage());
            item.appendChild(time);

            const review = document.createElement("span");
            review.className = "session-history-review";
            review.textContent = caseState.follow_up_due
                ? `${translateReviewStatus(caseState.review_status, getCurrentLanguage())} • ${formatFollowUpDate(caseState.follow_up_due, getCurrentLanguage())}`
                : translateReviewStatus(caseState.review_status, getCurrentLanguage());
            item.appendChild(review);

            const actions = document.createElement("div");
            actions.className = "session-history-actions";

            const restoreBtn = document.createElement("button");
            restoreBtn.type = "button";
            restoreBtn.className = "session-history-btn";
            restoreBtn.textContent = getCopy().history_load;
            restoreBtn.addEventListener("click", () => {
                currentSession = entry.session || buildEmptySession();
                activeProfile = setActiveProfile(currentSession.profile || activeProfile);
                syncSessionProfile();
                currentCase = null;
                currentMode = currentSession.tips ? "completed" : "ask_tips";
                writeStoredSession(currentSession);
                trackAnalyticsEvent("session_restored", { id: entry.id });
                renderInitialTranscript();
                renderActionLinks();
                renderAttachmentList();
                renderAccountPanel();
                setStage(currentSession.tips ? "tips" : "explanation");
                setInputPlaceholder();
                createMessage(getCopy().history_restored, "bot");
                const safety = currentSession.prediction?.safety;
                if (safety) {
                    showEmergency(
                        `${translateSafetyText(safety.reason)} — ${translateSafetyText(safety.advice)}`,
                        safety.level
                    );
                } else {
                    showEmergency("");
                }
            });
            actions.appendChild(restoreBtn);

            if (entry.session?.report) {
                const reportLink = document.createElement("a");
                reportLink.className = "session-history-btn";
                reportLink.href = `report.html?lang=${getCurrentLanguage()}`;
                reportLink.textContent = getCopy().history_open_report;
                reportLink.addEventListener("click", () => {
                    writeStoredSession(entry.session);
                });
                actions.appendChild(reportLink);
            }

            item.appendChild(actions);
            sessionHistoryList.appendChild(item);
        });
    };

    const updateConsentUi = () => {
        if (!consentOverlay || !consentAcceptBtn || !consentCheckbox) {
            return;
        }
        consentAcceptBtn.disabled = !consentCheckbox.checked;
        consentOverlay.hidden = consentAccepted;
        document.body.classList.toggle("consent-is-open", !consentAccepted);
    };

    const ensureConsentAccepted = () => {
        clearConsentState();
        consentAccepted = false;
        if (consentCheckbox) {
            consentCheckbox.checked = false;
        }
        updateConsentUi();
    };

    const renderAttachmentList = () => {
        if (!attachmentList) {
            return;
        }
        const copy = UPLOAD_COPY[getCurrentLanguage()];
        attachmentList.innerHTML = "";
        const attachments = Array.isArray(currentSession.attachments) ? currentSession.attachments : [];

        if (!attachments.length) {
            const empty = document.createElement("p");
            empty.className = "attachment-empty";
            empty.textContent = copy.empty;
            attachmentList.appendChild(empty);
            renderSessionOverview();
            return;
        }

        attachments.forEach((attachment) => {
            const card = document.createElement("article");
            card.className = "attachment-item";

            if (attachment.kind === "image" && attachment.preview) {
                const image = document.createElement("img");
                image.src = attachment.preview;
                image.alt = attachment.name || copy.imageLabel;
                image.className = "attachment-preview";
                card.appendChild(image);
            } else {
                const icon = document.createElement("div");
                icon.className = "attachment-icon";
                icon.innerHTML = '<i class="fas fa-file-lines" aria-hidden="true"></i>';
                card.appendChild(icon);
            }

            const info = document.createElement("div");
            info.className = "attachment-copy";
            const insightText = getAttachmentInsightText(attachment, getCurrentLanguage());
            const tagsMarkup =
                Array.isArray(attachment.insight?.keywords) && attachment.insight.keywords.length
                    ? `<small class="attachment-keywords">${attachment.insight.keywords.slice(0, 4).join(" • ")}</small>`
                    : "";
            info.innerHTML = `
                <strong>${attachment.name || "-"}</strong>
                <span>${attachment.category === "skin" ? copy.imageLabel : copy.fileLabel}</span>
                <small>${formatBytes(attachment.size || 0)} • ${copy.metaLabel}</small>
                ${insightText ? `<p class="attachment-insight">${copy.insightLabel}: ${insightText}</p>` : ""}
                ${tagsMarkup}
            `;
            card.appendChild(info);

            const removeBtn = document.createElement("button");
            removeBtn.type = "button";
            removeBtn.className = "attachment-remove-btn";
            removeBtn.textContent = copy.remove;
            removeBtn.addEventListener("click", () => {
                currentSession.attachments = (currentSession.attachments || []).filter((item) => item.id !== attachment.id);
                saveSession();
                renderAttachmentList();
                trackAnalyticsEvent("attachment_removed", { category: attachment.category });
                createMessage(copy.removed, "bot", "text", { suppressAutoSpeak: true });
            });
            card.appendChild(removeBtn);
            attachmentList.appendChild(card);
        });
        renderSessionOverview();
    };

    const resizeImageFile = (file) =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error);
            reader.onload = () => {
                const image = new Image();
                image.onload = () => {
                    const canvas = document.createElement("canvas");
                    const maxSide = 1280;
                    const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
                    canvas.width = Math.max(1, Math.round(image.width * ratio));
                    canvas.height = Math.max(1, Math.round(image.height * ratio));
                    const context = canvas.getContext("2d");
                    if (!context) {
                        reject(new Error("Canvas is unavailable"));
                        return;
                    }
                    context.drawImage(image, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL("image/jpeg", 0.78));
                };
                image.onerror = () => reject(new Error("Image could not be loaded"));
                image.src = reader.result;
            };
            reader.readAsDataURL(file);
        });

    const addAttachment = async (file, category) => {
        const copy = UPLOAD_COPY[getCurrentLanguage()];
        if (!file) {
            return;
        }
        if ((currentSession.attachments || []).length >= MAX_ATTACHMENTS) {
            createMessage(copy.limitReached, "bot", "text", { suppressAutoSpeak: true });
            return;
        }

        const attachment = {
            id: createSessionId(),
            name: file.name,
            mime: file.type,
            size: file.size,
            category,
            added_at: new Date().toISOString(),
        };

        if (category === "skin") {
            try {
                attachment.preview = await resizeImageFile(file);
                attachment.kind = "image";
            } catch (error) {
                createMessage(copy.imageTooLarge, "bot", "text", { suppressAutoSpeak: true });
                return;
            }
        } else {
            attachment.kind = "file";
        }

        try {
            attachment.insight = await buildAttachmentInsight(file, category, attachment.preview || "");
        } catch (error) {
            attachment.insight = {
                summary_ar: UPLOAD_COPY.ar.parseFailed,
                summary_en: UPLOAD_COPY.en.parseFailed,
                keywords: [],
            };
        }

        currentSession.attachments = [...(currentSession.attachments || []), attachment];
        saveSession();
        renderAttachmentList();
        trackAnalyticsEvent(category === "skin" ? "upload_skin_image" : "upload_medical_file", {
            name: file.name,
            type: file.type,
            size: file.size,
        });
        createMessage(category === "skin" ? copy.skinAdded : copy.fileAdded, "bot", "text", {
            suppressAutoSpeak: true,
        });
    };

    const saveSession = () => {
        syncSessionProfile();
        currentSession = writeStoredSession(currentSession);
        renderActionLinks();
        renderSessionHistory();
        renderAttachmentList();
    };

    const extractAssistantAnswer = (payload, fallbackText) => {
        if (payload?.assistant_message?.answer) {
            return payload.assistant_message.answer;
        }
        return fallbackText;
    };

    const formatInitialAnalysis = (prediction) => [
        getCurrentLanguage() === "en" ? "Initial analysis:" : "تحليل أولي:",
        getCurrentLanguage() === "en"
            ? `- Expected specialty: ${translateSpecialty(prediction.final_label)}`
            : `- التخصص المتوقع: ${prediction.final_label}`,
        getCurrentLanguage() === "en"
            ? `- Current priority: ${translateRiskLevelLabel(prediction.triage_category)}`
            : `- مستوى الأولوية الحالي: ${prediction.triage_category}`,
        getCurrentLanguage() === "en"
            ? `- Confidence: ${prediction.confidence_band} (${Number(prediction.final_confidence).toFixed(2)})`
            : `- درجة الثقة: ${prediction.confidence_band} (${Number(prediction.final_confidence).toFixed(2)})`,
        getCurrentLanguage() === "en"
            ? `- Next step: ${translateSafetyText(prediction.safety?.advice || "استكمال أسئلة المتابعة")}`
            : `- الخطوة التالية: ${prediction.safety?.advice || "استكمال أسئلة المتابعة"}`,
    ].join("\n");

    const formatRecommendation = (recommendation) => {
        const english = getCurrentLanguage() === "en";
        const lines = [
            english ? "Final recommendation:" : "التوصية النهائية:",
            english
                ? `- Risk level: ${translateRiskLevelLabel(recommendation.risk_level)}`
                : `- مستوى الخطورة: ${recommendation.risk_level}`,
            english ? `- Score: ${recommendation.score}` : `- الدرجة: ${recommendation.score}`,
            english
                ? `- Suggested timing: ${translateTiming(recommendation.timing)}`
                : `- التوقيت المقترح: ${recommendation.timing}`,
        ];

        if (!english && recommendation.rationale?.length) {
            lines.push("", "مبررات القرار:");
            recommendation.rationale.forEach((item) => lines.push(`- ${item}`));
        }

        if (!english && recommendation.advice?.length) {
            lines.push("", "الخلاصة:");
            recommendation.advice.forEach((item) => lines.push(`- ${item}`));
        }

        return lines.join("\n");
    };

    const formatTipsPreview = (tips = []) => {
        const copy = getCopy();
        if (!tips.length) {
            return copy.tips_preview_empty;
        }

        if (getCurrentLanguage() === "en") {
            return copy.tips_preview_ready;
        }

        const previewLines = tips
            .slice(0, 3)
            .map((tip) => parseTipLines(tip)[0])
            .filter(Boolean);

        if (!previewLines.length) {
            return copy.tips_preview_ready;
        }

        return `تم تجهيز صفحة الإرشادات الداعمة.\n- ${previewLines.join("\n- ")}`;
    };

    const askNextQuestion = async () => {
        if (!currentCase) {
            return;
        }

        const question = currentCase.questions[currentCase.questionIndex];
        if (!question) {
            resetQuickReplies();
            sendRecommendRequest();
            return;
        }

        currentMode = "questions";
        setStage("questions");
        setInputPlaceholder();
        createMessage(buildFollowupAssistantMessage(question.displayQuestion || question.question), "bot");
        renderQuickReplies(question.displayOptions || []);
    };

    const sendTriageRequest = async (messageText) => {
    showTyping();

    try {
        const { response, data } = await postJson("/api/triage", {
            message: messageText,
            lang: getCurrentLanguage(),
            attachment_context: buildAttachmentContextText(currentSession, getCurrentLanguage()),
            profile_role: activeProfile.role,
        });

        removeTyping();

        if (!response.ok) {
            createMessage(data.error || getCopy().triage_error, "bot");
            return;
        }

        currentSession = buildEmptySession();
        currentSession.profile = buildSessionProfile(activeProfile);
        currentSession.complaint = messageText;
        currentSession.prediction = data.prediction;
        saveSession();
        trackAnalyticsEvent("session_started", {
            complaint: messageText.slice(0, 140),
            specialty: data.prediction?.final_label || "",
            role: activeProfile.role,
        });

        currentCase = {
            complaint: messageText,
            prediction: data.prediction,
            questions: localizeQuestions(data.questions || [], getCurrentLanguage()),
            answers: [],
            questionIndex: 1,
        };


const firstQuestion = currentCase.questions[0]; // ✅ ADD THIS

createMessage(
    data.assistant_message?.answer ||
    buildTriageAssistantMessage(
        data.prediction,
        firstQuestion?.displayQuestion || firstQuestion?.question || formatInitialAnalysis(data.prediction)
    ),
    "bot"
);

            if (data.prediction.safety) {
                showEmergency(
                    `${translateSafetyText(data.prediction.safety.reason)} — ${translateSafetyText(data.prediction.safety.advice)}`,
                    data.prediction.safety.level
                );
            } else {
                showEmergency("");
            }

            currentMode = "questions";
            setStage("questions");
            setInputPlaceholder();
            renderQuickReplies(firstQuestion?.displayOptions || []);
        } catch (error) {
            removeTyping();
            createMessage(getCopy().server_error, "bot");
        }
    };
const sendRecommendRequest = async () => {
    if (!currentCase) {
        return;
    }

    showTyping();

    try {
        const { response, data } = await postJson("/api/recommend", {
            message: currentCase.complaint,
            answers: currentCase.answers,
            lang: getCurrentLanguage(),
            attachment_context: buildAttachmentContextText(currentSession, getCurrentLanguage()),
            profile_role: activeProfile.role,
        });

        removeTyping();

        if (!response.ok) {
            createMessage(data.error || getCopy().recommendation_error, "bot");
            return;
        }

        currentSession.complaint = currentCase.complaint;
        currentSession.answers = currentCase.answers;
        currentSession.prediction = data.prediction;
        currentSession.recommendation = data.recommendation;
        currentSession.report = data.report;
        console.log("REPORT:", data.report);
        currentSession.explanation = data.report?.sections?.lime || null;
        saveSession();
        trackAnalyticsEvent("session_completed", {
            specialty: data.prediction?.final_label || "",
            risk_level: data.recommendation?.risk_level || "",
            role: activeProfile.role,
        });
        persistSessionToHistory(currentSession);
        renderSessionHistory();

        setStage("explanation");
        currentMode = "ask_tips";
        setInputPlaceholder();

        if (data.prediction.safety) {
            showEmergency(
                `${translateSafetyText(data.prediction.safety.reason)} — ${translateSafetyText(data.prediction.safety.advice)}`,
                data.prediction.safety.level
            );
        }

        createMessage(
            data.assistant_message?.answer ||
            buildRecommendationAssistantMessage(data.prediction, data.recommendation),
            "bot"
        );
        createMessage(getCopy().ready_pages_message, "bot");
        createMessage(getCopy().ask_tips_message, "bot");
        renderQuickReplies([
            { value: "نعم", label: getCopy().yes },
            { value: "لا", label: getCopy().no },
        ]);
    } catch (error) {
        removeTyping();
        createMessage(getCopy().build_result_error, "bot");
    }
};
    const sendTipsRequest = async () => {
    if (!currentCase) {
        return;
    }

    showTyping();

    try {
        const { response, data } = await postJson("/api/supportive-tips", {
            specialty: currentSession.prediction?.final_label || "",
            risk_level: currentSession.recommendation?.risk_level || "",
            complaint: currentCase.complaint,
            lang: getCurrentLanguage(),
        });

        removeTyping();

        if (!response.ok) {
            createMessage(data.error || getCopy().tips_error, "bot");
            return;
        }

        currentSession.tips = data.tips || [];
        saveSession();
        trackAnalyticsEvent("supportive_tips_ready", {
            specialty: currentSession.prediction?.final_label || "",
        });
        persistSessionToHistory(currentSession);
        renderSessionHistory();

        setStage("tips");
        currentMode = "completed";
        setInputPlaceholder();
        resetQuickReplies();

        createMessage(formatTipsPreview(data.tips || []), "bot");
        createMessage(getCopy().tips_ready_message, "bot");

        setTimeout(() => {
            window.location.href = `integrative.html?lang=${getCurrentLanguage()}`;
        }, 700);
   } catch (error) {
    removeTyping();
    console.error("TRIAGE FRONTEND ERROR:", error);
    createMessage("Frontend error: " + error.message, "bot");
}
};

    const beginFreshSessionIfNeeded = (messageText) => {
        if (currentMode !== "completed") {
            return messageText;
        }

        currentMode = "complaint";
        currentCase = null;
        currentSession = buildEmptySession();
        currentSession.profile = buildSessionProfile(activeProfile);
        clearStoredSession();
        resetQuickReplies();
        renderInitialTranscript();
        renderActionLinks();
        renderAccountPanel();
        showEmergency("");
        setStage("complaint");
        setInputPlaceholder();
        delete userInput.dataset.rawValue;
        delete userInput.dataset.displayValue;
        return messageText;
    };

    const handleConversationInput = (rawValue, displayValue = rawValue) => {
        if (!consentAccepted) {
            updateConsentUi();
            return;
        }
        const messageText = String(rawValue).trim();
        const messageDisplay = String(displayValue).trim();
        if (!messageText) {
            return;
        }

        if (currentMode === "completed") {
            beginFreshSessionIfNeeded(messageText);
        }

        if (currentMode === "complaint") {
            createMessage(messageDisplay, "user");
            userInput.value = "";
            delete userInput.dataset.rawValue;
            delete userInput.dataset.displayValue;
            resetQuickReplies();
            sendTriageRequest(messageText);
            return;
        }

        if (currentMode === "questions" && currentCase) {
            const question = currentCase.questions[currentCase.questionIndex];
            if (!question) {
                sendRecommendRequest();
                return;
            }

            createMessage(messageDisplay, "user");
            userInput.value = "";
            delete userInput.dataset.rawValue;
            delete userInput.dataset.displayValue;
            const answerForBackend = normalizeAnswerForBackend(question, messageText);
            currentCase.answers.push({
                id: question.id,
                question: question.question,
                answer: answerForBackend,
            });
            currentCase.questionIndex += 1;
            resetQuickReplies();
            void askNextQuestion();
            return;
        }

        if (currentMode === "ask_tips") {
            createMessage(messageDisplay, "user");
            userInput.value = "";
            delete userInput.dataset.rawValue;
            delete userInput.dataset.displayValue;

            if (isYes(messageText)) {
                resetQuickReplies();
                sendTipsRequest();
                return;
            }

            if (isNo(messageText)) {
                resetQuickReplies();
                setStage("tips");
                currentMode = "completed";
                setInputPlaceholder();
                createMessage(getCopy().finished_session_message, "bot");
                return;
            }

            createMessage(getCopy().yes_no_prompt, "bot");
        }
    };

    const startNewSession = (announce = true) => {
        stopSpeaking();
        currentMode = "complaint";
        currentCase = null;
        currentSession = buildEmptySession();
        currentSession.profile = buildSessionProfile(activeProfile);
        clearStoredSession();
        resetQuickReplies();
        renderInitialTranscript();
        renderActionLinks();
        renderAccountPanel();
        showEmergency("");
        setStage("complaint");
        setInputPlaceholder();
        userInput.value = "";
        delete userInput.dataset.rawValue;
        delete userInput.dataset.displayValue;

        if (announce) {
            createMessage(getCopy().reset_session_message, "bot");
        }
    };

    chatForm.addEventListener("submit", (event) => {
        event.preventDefault();
        handleConversationInput(
            userInput.dataset.rawValue || userInput.value,
            userInput.dataset.displayValue || userInput.value
        );
    });

    userInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            handleConversationInput(
                userInput.dataset.rawValue || userInput.value,
                userInput.dataset.displayValue || userInput.value
            );
        }
    });

    quickPrompts.forEach((button) => {
        button.addEventListener("click", () => {
            userInput.value = button.dataset.prompt || "";
            userInput.dataset.rawValue = button.dataset.promptRaw || button.dataset.prompt || "";
            userInput.dataset.displayValue = button.dataset.prompt || "";
            userInput.focus();
        });
    });

    userInput.addEventListener("input", () => {
        delete userInput.dataset.rawValue;
        delete userInput.dataset.displayValue;
    });

    if (newSessionBtn) {
        newSessionBtn.addEventListener("click", () => {
            startNewSession();
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener("click", () => {
            clearSessionHistory();
            renderSessionHistory();
            createMessage(getCopy().history_cleared, "bot");
        });
    }

    if (speakerToggleBtn) {
        updateSpeakerToggleUI();
        speakerToggleBtn.addEventListener("click", () => {
            if (!canUseSpeechSynthesis() && !canUseHtmlAudio()) {
                createMessage(getCopy().tts_unsupported, "bot", "text", { suppressAutoSpeak: true });
                return;
            }
            autoSpeakEnabled = !autoSpeakEnabled;
            writeStoredAudioPreference(autoSpeakEnabled);
            if (!autoSpeakEnabled) {
                stopSpeaking();
            }
            updateSpeakerToggleUI();
        });
    }

    accountRoleButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const nextRole = button.dataset.role === "doctor" ? "doctor" : "patient";
            const profiles = readProfileDirectory();
            activeProfile =
                profiles.find((profile) => profile.role === nextRole) ||
                buildLocalProfile(nextRole, {
                    id: `${nextRole}-local`,
                    name: nextRole === "doctor" ? ACCOUNT_COPY[getCurrentLanguage()].doctor : ACCOUNT_COPY[getCurrentLanguage()].patient,
                });
            setActiveProfile(activeProfile);
            syncSessionProfile();
            saveSession();
            renderAccountPanel();
        });
    });

    saveAccountBtn?.addEventListener("click", () => {
        const nextName = String(accountNameInput?.value || "").trim();
        activeProfile = setActiveProfile({
            ...activeProfile,
            name: nextName || (activeProfile.role === "doctor" ? ACCOUNT_COPY[getCurrentLanguage()].doctor : ACCOUNT_COPY[getCurrentLanguage()].patient),
        });
        syncSessionProfile();
        saveSession();
        renderAccountPanel(ACCOUNT_COPY[getCurrentLanguage()].saved);
        trackAnalyticsEvent("profile_updated", { role: activeProfile.role });
    });

    if (canUseSpeechSynthesis() && window.speechSynthesis) {
        window.speechSynthesis.addEventListener?.("voiceschanged", () => {
            refreshMessageAudioButtons();
            updateSpeakerToggleUI();
        });
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition && voiceBtn) {
        recognition = new SpeechRecognition();
        recognition.lang = getSpeechRecognitionLocale();
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.addEventListener("start", () => {
            isListening = true;
            voiceBtn.classList.add("is-listening");
        });

        recognition.addEventListener("result", (event) => {
            const transcript = event.results[0][0].transcript.trim();
            userInput.value = transcript;
            userInput.focus();
        });

        recognition.addEventListener("end", () => {
            isListening = false;
            voiceBtn.classList.remove("is-listening");
        });

        recognition.addEventListener("error", () => {
            isListening = false;
            voiceBtn.classList.remove("is-listening");
            createMessage(getCopy().voice_error, "bot");
        });

        voiceBtn.addEventListener("click", () => {
            if (isListening) {
                recognition.stop();
                return;
            }
            recognition.lang = getSpeechRecognitionLocale();
            recognition.start();
        });
    } else if (voiceBtn) {
        voiceBtn.addEventListener("click", () => {
            createMessage(getCopy().voice_unsupported, "bot", "text", { suppressAutoSpeak: true });
        });
    }

    if (chatLangToggle) {
        chatLangToggle.addEventListener("click", () => {
            updateSpeakerToggleUI();
            refreshMessageAudioButtons();
            renderActionLinks();
            renderSessionHistory();
            applyConsentLanguage(getCurrentLanguage());
            applyUploadLanguage(getCurrentLanguage());
            if (recognition) {
                recognition.lang = getSpeechRecognitionLocale();
            }
        });
    }

    if (skinUploadBtn && skinUploadInput) {
        skinUploadBtn.addEventListener("click", () => skinUploadInput.click());
        skinUploadInput.addEventListener("change", async () => {
            const file = skinUploadInput.files?.[0];
            if (file) {
                await addAttachment(file, "skin");
            }
            skinUploadInput.value = "";
        });
    }

    if (fileUploadBtn && fileUploadInput) {
        fileUploadBtn.addEventListener("click", () => fileUploadInput.click());
        fileUploadInput.addEventListener("change", async () => {
            const file = fileUploadInput.files?.[0];
            if (file) {
                await addAttachment(file, "medical");
            }
            fileUploadInput.value = "";
        });
    }

    if (consentCheckbox) {
        consentCheckbox.addEventListener("change", updateConsentUi);
    }

    if (consentAcceptBtn) {
        consentAcceptBtn.addEventListener("click", () => {
            if (!consentCheckbox?.checked) {
                return;
            }
            consentAccepted = true;
            writeConsentState({
                accepted: true,
                accepted_at: new Date().toISOString(),
                lang: getCurrentLanguage(),
            });
            trackAnalyticsEvent("consent_accepted");
            updateConsentUi();
            userInput?.focus();
        });
    }

    window.addEventListener("medika:chat-language-changed", () => {
        renderActionLinks();
        renderAttachmentList();
        renderSessionHistory();
        renderSessionOverview(currentSession.tips ? "tips" : currentSession.report ? "explanation" : currentCase ? "questions" : "complaint");
        setInputPlaceholder();
        renderAccountPanel();
    });

    renderInitialTranscript();
    renderActionLinks();
    renderSessionHistory();
    renderAttachmentList();
    renderAccountPanel();
    ensureConsentAccepted();

    if (currentSession.report) {
        currentMode = currentSession.tips ? "completed" : "ask_tips";
        setStage(currentSession.tips ? "tips" : "explanation");
        createMessage(getCopy().history_restored, "bot");
        const safety = currentSession.prediction?.safety;
        if (safety) {
            showEmergency(
                `${translateSafetyText(safety.reason)} — ${translateSafetyText(safety.advice)}`,
                safety.level
            );
        }
    } else {
        setStage("complaint");
    }

    setInputPlaceholder();
}

const pageLang = getCurrentLanguage();

const isEnglishPage = pageLang === "en";

const pageText = {

    ar: {

        copied: "تم النسخ",
        shared: "تمت المشاركة",

        copyReport: "نسخ التقرير",
        shareSummary: "مشاركة الملخص",
        shareDecision: "مشاركة التفسير",
        shareTips: "مشاركة الإرشادات",

        copyFailed: "تعذر النسخ",
        shareFailed: "تعذرت المشاركة",

        noExtraRationale: "لا توجد مبررات إضافية مسجلة.",

        noData: "لا توجد بيانات بعد.",

        location: "المكان",

        severity: "الشدة",

        duration: "المدة",

        trend: "المسار",

        associatedSymptoms: "الأعراض المصاحبة",

        redFlags: "العلامات الإنذارية",

        age: "العمر",

        sex: "الجنس",

        chronicDisease: "أمراض مزمنة",

        currentMeds: "أدوية حالية",

        drugAllergy: "حساسية دوائية",

        priorHistory: "تاريخ مشابه",

        sendNote: (specialty, nextStep) =>

            `يُنصح بعرض هذا الملخص على الطبيب مع التركيز على التخصص المتوقع (${specialty}) والخطوة التالية (${nextStep}).`,

        limeNote: "الكلمات التالية هي الأكثر تأثيرًا في ترجيح التخصص المتوقع.",
        priorityKickerHigh: "أولوية مرتفعة",
        priorityKickerUrgent: "تنبيه عاجل",
        priorityTitleHigh: "لا تؤخر التقييم الطبي",
        priorityTitleUrgent: "يلزم تقييم طبي عاجل",
        priorityTextHigh:
            "تشير هذه النتيجة إلى أولوية مرتفعة. الأفضل عدم تأخير المراجعة الطبية والاحتفاظ بالملخص عند التقييم.",
        priorityTextUrgent:
            "هناك مؤشرات تستدعي تقييمًا طبيًا عاجلًا. لا تعتمد على القراءة فقط إذا كانت الأعراض مستمرة أو متفاقمة.",
        priorityBackChat: "العودة للشات",
        priorityOpenReport: "فتح ملخص الطبيب",
        priorityPrint: "تصدير PDF / طباعة",
        attachments: "المرفقات المرفوعة",
        refinement: "ما الذي اتضح بعد أسئلة المتابعة؟",
        whyNotAlt: "لماذا لم يبقَ التخصص البديل هو الأقرب؟",
        followupAudit: "أثر أسئلة المتابعة",
        followupAuditIntro: "هذا التسلسل يوضح كيف أثرت الإجابات على الصورة النهائية.",
        doctorModeSummary: "ملخص مختصر بوضع الطبيب",
        doctorNoteEditorTitle: "ملاحظات الطبيب أو المشرف",
        doctorNoteEditorText: "يمكنك كتابة ملاحظة مختصرة لتبقى مرتبطة بهذه الجلسة عند فتحها لاحقًا.",
        saveDoctorNote: "حفظ الملاحظة",
        clearDoctorNote: "مسح",
        doctorNoteSaved: "تم حفظ الملاحظة",
        doctorNoteCleared: "تم مسح الملاحظة",
        urgentChecklistTitle: "خطوات المتابعة السريعة",
        urgentChecklistText: "ترتيب عملي مختصر للحالات التي تحتاج عدم تأخير المراجعة.",
        caseManagementTitle: "سير المراجعة والمتابعة",
        caseManagementText: "حدد حالة المراجعة وموعد المتابعة محليًا حتى تبقى الجلسة واضحة عند الرجوع إليها.",
        caseStatusLabel: "حالة المراجعة",
        followUpDateLabel: "موعد المتابعة",
        followUpNoteLabel: "ملاحظة متابعة مختصرة",
        attachmentsReviewedLabel: "تمت مراجعة المرفقات",
        urgentAckLabel: "تمت قراءة تنبيه الأولوية",
        saveCaseManagement: "حفظ حالة المراجعة",
        caseManagementSaved: "تم حفظ حالة المتابعة",
        caseSnapshotTitle: "متابعة الحالة محليًا",
        caseSnapshotText: "حالة المراجعة الحالية وموعد المتابعة إن وجد.",
        skipToContent: "تجاوز إلى المحتوى",
        feedbackTitleReport: "تقييم فائدة الملخص",
        feedbackTitleDecision: "هل كان التفسير واضحًا؟",
        feedbackTitleTips: "هل كانت الإرشادات مفيدة؟",
        saveFeedback: "حفظ التقييم",
        dashboardLink: "لوحة الطبيب",

        noExplanation: "لا يوجد تفسير بعد",

    },

    en: {

        copied: "Copied",
        shared: "Shared",

        copyReport: "Copy report",
        shareSummary: "Share summary",
        shareDecision: "Share explanation",
        shareTips: "Share guidance",

        copyFailed: "Copy failed",
        shareFailed: "Share failed",

        noExtraRationale: "No additional rationale recorded.",

        noData: "No data available yet.",

        location: "Location",

        severity: "Severity",

        duration: "Duration",

        trend: "Trend",

        associatedSymptoms: "Associated symptoms",

        redFlags: "Red flags",

        age: "Age",

        sex: "Sex",

        chronicDisease: "Chronic conditions",

        currentMeds: "Current medications",

        drugAllergy: "Drug allergy",

        priorHistory: "Similar history",

        sendNote: (specialty, nextStep) =>

            `It is recommended to show this summary to the doctor, focusing on the expected specialty (${specialty}) and the next step (${nextStep}).`,

        limeNote: "The following words had the strongest effect on the expected specialty.",
        priorityKickerHigh: "High priority",
        priorityKickerUrgent: "Urgent alert",
        priorityTitleHigh: "Do not delay medical evaluation",
        priorityTitleUrgent: "Urgent medical evaluation is needed",
        priorityTextHigh:
            "This result suggests a high-priority case. It is best not to delay medical review and to keep the summary available.",
        priorityTextUrgent:
            "Signals in this result may require urgent medical evaluation. Do not rely on reading alone if symptoms are ongoing or worsening.",
        priorityBackChat: "Back to Chat",
        priorityOpenReport: "Open Doctor Summary",
        priorityPrint: "Export PDF / Print",
        attachments: "Uploaded attachments",
        refinement: "What became clearer after the follow-up questions?",
        whyNotAlt: "Why did the alternative specialty become less likely?",
        followupAudit: "Follow-up impact trail",
        followupAuditIntro: "This sequence shows how the answers sharpened the final picture.",
        doctorModeSummary: "Doctor-mode concise summary",
        doctorNoteEditorTitle: "Doctor or supervisor notes",
        doctorNoteEditorText: "Add a short note that stays linked to this session when it is reopened later.",
        saveDoctorNote: "Save note",
        clearDoctorNote: "Clear",
        doctorNoteSaved: "Note saved",
        doctorNoteCleared: "Note cleared",
        urgentChecklistTitle: "Fast follow-up actions",
        urgentChecklistText: "A short practical order for cases that should not be delayed.",
        caseManagementTitle: "Review and follow-up workflow",
        caseManagementText: "Store the review status and follow-up plan locally so the session stays clear when reopened.",
        caseStatusLabel: "Review status",
        followUpDateLabel: "Follow-up date",
        followUpNoteLabel: "Short follow-up note",
        attachmentsReviewedLabel: "Attachments reviewed",
        urgentAckLabel: "Urgency banner acknowledged",
        saveCaseManagement: "Save workflow status",
        caseManagementSaved: "Workflow status saved",
        caseSnapshotTitle: "Local case follow-up",
        caseSnapshotText: "Current review state and follow-up timing, if any.",
        skipToContent: "Skip to content",
        feedbackTitleReport: "Was the summary useful?",
        feedbackTitleDecision: "Was the explanation clear?",
        feedbackTitleTips: "Was the guidance useful?",
        saveFeedback: "Save feedback",
        dashboardLink: "Doctor dashboard",

        noExplanation: "No explanation yet",

    },

};

const tPage = pageText[pageLang];

const setButtonStatus = (button, text, resetTo) => {
    if (!button) {
        return;
    }

    button.textContent = text;

    if (resetTo) {
        window.setTimeout(() => {
            button.textContent = resetTo;
        }, 1600);
    }
};

const shareTextPayload = async (text, button, defaultLabel) => {
    if (!text) {
        return;
    }

    try {
        if (navigator.share) {
            await navigator.share({
                title: "Medika AI",
                text,
            });
            trackAnalyticsEvent("share_native");
            setButtonStatus(button, tPage.shared, defaultLabel);
            return;
        }

        await navigator.clipboard.writeText(text);
        trackAnalyticsEvent("share_clipboard");
        setButtonStatus(button, tPage.copied, defaultLabel);
    } catch (error) {
        if (error?.name === "AbortError") {
            return;
        }

        setButtonStatus(button, tPage.shareFailed, defaultLabel);
    }
};

const getPriorityLevel = (value) => {
    const normalized = String(value || "").trim().toLowerCase();
    if (!normalized) {
        return "";
    }

    if (
        normalized.includes("emergency") ||
        normalized.includes("urgent") ||
        normalized.includes("عاجل") ||
        normalized.includes("طارئ")
    ) {
        return "emergency";
    }

    if (normalized.includes("high") || normalized.includes("مرتفع")) {
        return "high";
    }

    return "";
};

const getPossibleConditionLines = (value) =>
    String(value || "")
        .split("\n")
        .map((line) => line.replace(/^[-•*🔹\s]+/, "").trim())
        .filter(Boolean)
        .filter(
            (line) =>
                !line.startsWith("الأعراض") &&
                !line.startsWith("Among the possibilities") &&
                !line.startsWith("في هذه المرحلة") &&
                !line.startsWith("At this stage")
        );

const getLocalizedPossibleConditionText = (sections = {}) =>
    isEnglishPage
        ? sections.possible_condition_en || sections.possible_condition || ""
        : sections.possible_condition_ar || sections.possible_condition || "";

const buildReportShareText = (session) => {
    const sections = session.report?.sections;
    if (!sections) {
        return "";
    }

    const specialty = translateSpecialty(sections.prediction.specialty, pageLang);
    const risk = translateRiskLevelLabel(sections.prediction.risk_level, pageLang);
    const nextStep = translateTiming(sections.prediction.next_step, pageLang);
    const localizedCondition = getLocalizedPossibleConditionText(sections);
    const condition = getPossibleConditionLines(localizedCondition)[0] || translateMaybe(localizedCondition);

    if (isEnglishPage) {
        return [
            "Medika AI summary",
            `Chief complaint: ${sections.chief_complaint}`,
            `Expected specialty: ${specialty}`,
            `Top possible condition: ${condition}`,
            `Risk level: ${risk}`,
            `Next step: ${nextStep}`,
        ].join("\n");
    }

    return [
        "ملخص Medika AI",
        `الشكوى الرئيسية: ${sections.chief_complaint}`,
        `التخصص المتوقع: ${specialty}`,
        `الاحتمال الأقرب: ${condition}`,
        `مستوى الخطورة: ${risk}`,
        `الخطوة التالية: ${nextStep}`,
    ].join("\n");
};

const buildDetailedReportText = (session) => {
    const sections = session.report?.sections;
    if (!sections) {
        return "";
    }

    const specialty = translateSpecialty(sections.prediction.specialty, pageLang);
    const alternative = translateSpecialty(sections.prediction.alternative_specialty || "-", pageLang);
    const risk = translateRiskLevelLabel(sections.prediction.risk_level, pageLang);
    const nextStep = translateTiming(sections.prediction.next_step, pageLang);
    const confidence = `${translateConfidenceBand(sections.prediction.confidence_band, pageLang)} (${Number(sections.prediction.confidence).toFixed(2)})`;
    const possibleCondition = translateMaybe(getLocalizedPossibleConditionText(sections));
    const confidenceNote =
        (isEnglishPage ? sections.prediction.confidence_note_en : sections.prediction.confidence_note_ar) ||
        sections.prediction.confidence_note ||
        "";
    const timeline = Array.isArray(sections.timeline) ? translateSentenceList(sections.timeline) : [];
    const doctorNote = String(session.doctor_notes?.text || "").trim();
    const auditTrail = buildFollowUpAuditTrail(session).slice(0, 6);
    const doctorModeSummary = buildDoctorModeSummary(session);
    const profileText = `${translateRoleLabel(session.profile?.role, pageLang)}: ${getProfileDisplayName(session.profile, pageLang)}`;
    const caseWorkflowSummary = buildCaseManagementSummary(session, pageLang);
    const attachmentLines = (Array.isArray(session.attachments) ? session.attachments : [])
        .map((attachment) => getAttachmentInsightText(attachment, pageLang))
        .filter(Boolean)
        .slice(0, 4);

    if (isEnglishPage) {
        return [
            "Doctor Summary",
            `Profile: ${profileText}`,
            `Chief complaint: ${sections.chief_complaint}`,
            `Possible condition: ${possibleCondition}`,
            `Expected specialty: ${specialty}`,
            `Alternative specialty: ${alternative}`,
            `Risk level: ${risk}`,
            `Confidence: ${confidence}`,
            `Next step: ${nextStep}`,
            confidenceNote ? `Confidence note: ${translateMaybe(confidenceNote)}` : "",
            doctorModeSummary ? `Doctor-mode summary: ${doctorModeSummary}` : "",
            caseWorkflowSummary ? `Review workflow: ${caseWorkflowSummary}` : "",
            doctorNote ? `Doctor note: ${doctorNote}` : "",
            ...attachmentLines.map((item) => `Attachment insight: ${item}`),
            ...auditTrail,
            ...timeline,
        ]
            .filter(Boolean)
            .join("\n");
    }

    return [
        "ملخص الطبيب",
        `هوية الجلسة: ${profileText}`,
        `الشكوى الرئيسية: ${sections.chief_complaint}`,
        `المرض المحتمل: ${possibleCondition}`,
        `التخصص المتوقع: ${specialty}`,
        `التخصص البديل القريب: ${alternative}`,
        `مستوى الخطورة: ${risk}`,
        `درجة الثقة: ${confidence}`,
        `الخطوة التالية: ${nextStep}`,
        confidenceNote ? `ملاحظة الثقة: ${translateMaybe(confidenceNote)}` : "",
        doctorModeSummary ? `ملخص وضع الطبيب: ${doctorModeSummary}` : "",
        caseWorkflowSummary ? `سير المراجعة: ${caseWorkflowSummary}` : "",
        doctorNote ? `ملاحظة الطبيب: ${doctorNote}` : "",
        ...attachmentLines.map((item) => `خلاصة مرفق: ${item}`),
        ...auditTrail,
        ...timeline,
    ]
        .filter(Boolean)
        .join("\n");
};

const buildDecisionShareText = (session) => {
    const sections = session.report?.sections;
    if (!sections) {
        return "";
    }

    const specialty = translateSpecialty(sections.prediction.specialty, pageLang);
    const risk = translateRiskLevelLabel(sections.prediction.risk_level, pageLang);
    const localizedCondition = getLocalizedPossibleConditionText(sections);
    const condition = getPossibleConditionLines(localizedCondition)[0] || translateMaybe(localizedCondition);
    const rationale = translateSentenceList(sections.rationale || []).slice(0, 3);
    const workflow = buildCaseManagementSummary(session, pageLang);

    if (isEnglishPage) {
        return [
            "Medika AI decision explanation",
            `Expected specialty: ${specialty}`,
            `Top possible condition: ${condition}`,
            `Risk level: ${risk}`,
            `Review workflow: ${workflow}`,
            ...rationale.map((item) => `- ${item}`),
        ].join("\n");
    }

    return [
        "تفسير القرار في Medika AI",
        `التخصص المتوقع: ${specialty}`,
        `الاحتمال الأقرب: ${condition}`,
        `مستوى الخطورة: ${risk}`,
        `سير المراجعة: ${workflow}`,
        ...rationale.map((item) => `- ${item}`),
    ].join("\n");
};

const buildTipsShareText = (session) => {
    const tips = Array.isArray(session.tips) ? session.tips : [];
    const sections = session.report?.sections;
    const specialty = translateSpecialty(
        session.prediction?.final_label || sections?.prediction?.specialty || "-",
        pageLang
    );
    const risk = translateRiskLevelLabel(
        session.recommendation?.risk_level || sections?.prediction?.risk_level || "-",
        pageLang
    );
    const workflow = buildCaseManagementSummary(session, pageLang);

    const cleanedTips = tips
        .map((tip) => parseTipLines(tip).join(" "))
        .filter(Boolean)
        .slice(0, 4);

    if (isEnglishPage) {
        return [
            "Medika AI supportive guidance",
            `Related specialty: ${specialty}`,
            `Risk level: ${risk}`,
            `Review workflow: ${workflow}`,
            ...cleanedTips.map((item) => `- ${item}`),
        ].join("\n");
    }

    return [
        "الإرشادات الداعمة في Medika AI",
        `التخصص المرتبط: ${specialty}`,
        `مستوى الخطورة: ${risk}`,
        `سير المراجعة: ${workflow}`,
        ...cleanedTips.map((item) => `- ${item}`),
    ].join("\n");
};

const buildReportExportTitle = (session) => {
    const sections = session?.report?.sections || {};
    const specialty = translateSpecialty(sections.prediction?.specialty || "-", pageLang);
    const createdLine = Array.isArray(sections.timeline)
        ? sections.timeline.find((item) => /تاريخ إنشاء التقرير|Report created/i.test(String(item || "")))
        : "";
    const createdText = createdLine
        ? String(createdLine).split(":").slice(1).join(":").trim().replace(/[^\d-]/g, "").slice(0, 10)
        : new Date().toISOString().slice(0, 10);
    const safeSpecialty = String(specialty || "summary")
        .replace(/[\\/:*?"<>|]/g, " ")
        .replace(/\s+/g, "-")
        .trim()
        .slice(0, 36) || "summary";
    return `medika-doctor-summary-${safeSpecialty}-${createdText || "export"}`;
};

const exportReportPdf = (session) => {
    const originalTitle = document.title;
    trackAnalyticsEvent("export_report_pdf", {
        specialty: session?.report?.sections?.prediction?.specialty || "",
    });
    document.title = buildReportExportTitle(session);
    window.print();
    window.setTimeout(() => {
        document.title = originalTitle;
    }, 1200);
};

const setupPriorityBanner = (session) => {
    const banner = document.getElementById("page-priority-banner");
    if (!banner || !session?.report?.sections) {
        return;
    }

    const riskValue = session.recommendation?.risk_level || session.report.sections.prediction?.risk_level || "";
    const level = getPriorityLevel(riskValue);
    if (!level) {
        banner.hidden = true;
        return;
    }

    const nextStep = translateTiming(session.report.sections.prediction?.next_step || "", pageLang);
    const kickerNode = document.getElementById("page-priority-kicker");
    const titleNode = document.getElementById("page-priority-title");
    const textNode = document.getElementById("page-priority-text");
    const chatLink = document.getElementById("priority-banner-chat-link");
    const reportLink = document.getElementById("priority-banner-report-link");
    const isReportPage = window.location.pathname.includes("report.html");

    if (kickerNode) {
        kickerNode.textContent = level === "emergency" ? tPage.priorityKickerUrgent : tPage.priorityKickerHigh;
    }

    if (titleNode) {
        titleNode.textContent = level === "emergency" ? tPage.priorityTitleUrgent : tPage.priorityTitleHigh;
    }

    if (textNode) {
        const baseText = level === "emergency" ? tPage.priorityTextUrgent : tPage.priorityTextHigh;
        const suffix = nextStep ? ` ${tPage.next_step}: ${nextStep}.` : "";
        textNode.textContent = `${baseText}${suffix}`;
    }

    if (chatLink) {
        chatLink.textContent = tPage.priorityBackChat;
        chatLink.href = `chat.html?lang=${pageLang}`;
    }

    if (reportLink) {
        if (isReportPage) {
            reportLink.textContent = tPage.priorityPrint;
            reportLink.href = "#";
            reportLink.onclick = (event) => {
                event.preventDefault();
                exportReportPdf(session);
            };
        } else {
            reportLink.textContent = tPage.priorityOpenReport;
            reportLink.href = `report.html?lang=${pageLang}`;
            reportLink.onclick = null;
        }
    }

    banner.dataset.level = level;
    banner.hidden = false;
};

const renderSessionAttachments = (container, attachments = []) => {
    if (!container) {
        return;
    }
    container.innerHTML = "";
    if (!attachments.length) {
        const placeholder = document.createElement("span");
        placeholder.className = "placeholder-chip";
        placeholder.textContent = tPage.noData;
        container.appendChild(placeholder);
        return;
    }
    attachments.forEach((attachment) => {
        const card = document.createElement("article");
        card.className = "report-attachment-card";
        if (attachment.kind === "image" && attachment.preview) {
            const image = document.createElement("img");
            image.src = attachment.preview;
            image.alt = attachment.name || "attachment";
            image.className = "report-attachment-preview";
            card.appendChild(image);
        } else {
            const icon = document.createElement("div");
            icon.className = "report-attachment-icon";
            icon.innerHTML = '<i class="fas fa-file-medical" aria-hidden="true"></i>';
            card.appendChild(icon);
        }

        const body = document.createElement("div");
        body.className = "report-attachment-copy";
        const title = document.createElement("strong");
        title.textContent = attachment.name || "-";
        body.appendChild(title);
        const meta = document.createElement("span");
        meta.textContent = `${attachment.category === "skin" ? UPLOAD_COPY[pageLang].imageLabel : UPLOAD_COPY[pageLang].fileLabel} • ${formatBytes(attachment.size || 0)}`;
        body.appendChild(meta);
        const insight = getAttachmentInsightText(attachment, pageLang);
        if (insight) {
            const summary = document.createElement("span");
            summary.className = "report-attachment-insight";
            summary.textContent = insight;
            body.appendChild(summary);
        }
        if (Array.isArray(attachment.insight?.keywords) && attachment.insight.keywords.length) {
            const keywords = document.createElement("small");
            keywords.className = "attachment-keywords";
            keywords.textContent = attachment.insight.keywords.slice(0, 5).join(pageLang === "en" ? " • " : " • ");
            body.appendChild(keywords);
        }
        card.appendChild(body);
        container.appendChild(card);
    });
};

const renderCaseTimelineVisual = (container, session) => {
    if (!container) {
        return;
    }
    container.innerHTML = "";
    const sections = session?.report?.sections;
    if (!sections) {
        return;
    }
    const primaryCondition =
        getPossibleConditionLines(getLocalizedPossibleConditionText(sections))[0] ||
        translateMaybe(getLocalizedPossibleConditionText(sections)) ||
        tPage.noData;
    const steps = isEnglishPage
        ? [
              { title: "Complaint", text: sections.chief_complaint || tPage.noData },
              { title: "Follow-up", text: `${Array.isArray(session.answers) ? session.answers.length : 0} answer(s) refined the case.` },
              { title: "Top condition", text: primaryCondition },
              { title: "Next step", text: translateTiming(sections.prediction?.next_step || "-", pageLang) },
          ]
        : [
              { title: "الشكوى", text: sections.chief_complaint || tPage.noData },
              { title: "المتابعة", text: `تمت إضافة ${Array.isArray(session.answers) ? session.answers.length : 0} إجابة لتوضيح الحالة.` },
              { title: "الاحتمال الأقرب", text: primaryCondition },
              { title: "الخطوة التالية", text: translateTiming(sections.prediction?.next_step || "-", pageLang) },
          ];

    steps.forEach((step) => {
        const card = document.createElement("article");
        card.className = "case-timeline-step";
        card.innerHTML = `<strong>${step.title}</strong><span>${step.text}</span>`;
        container.appendChild(card);
    });
};

const buildFollowUpAuditTrail = (session) => {
    const answers = Array.isArray(session?.answers) ? session.answers : [];
    if (!answers.length) {
        return [];
    }

    return answers.map((item, index) => {
        const questionText = translateQuestionText(item.question || "-", pageLang);
        const answerText = translateMaybe(item.answer || "-");
        return isEnglishPage
            ? `Follow-up ${index + 1}: ${questionText} -> ${answerText}`
            : `المتابعة ${index + 1}: ${questionText} ← ${answerText}`;
    });
};

const buildDoctorModeSummary = (session) => {
    const sections = session?.report?.sections;
    if (!sections) {
        return tPage.noData;
    }

    const specialty = translateSpecialty(sections.prediction?.specialty || "-", pageLang);
    const risk = translateRiskLevelLabel(sections.prediction?.risk_level || "-", pageLang);
    const nextStep = translateTiming(sections.prediction?.next_step || "-", pageLang);
    const primaryCondition =
        getPossibleConditionLines(getLocalizedPossibleConditionText(sections))[0] ||
        translateMaybe(getLocalizedPossibleConditionText(sections));
    const confidence = `${translateConfidenceBand(sections.prediction?.confidence_band || "-", pageLang)} (${Number(sections.prediction?.confidence || 0).toFixed(2)})`;
    const profile = `${translateRoleLabel(session.profile?.role, pageLang)}: ${getProfileDisplayName(session.profile, pageLang)}`;
    const attachmentsCount = Array.isArray(session.attachments) ? session.attachments.length : 0;
    const caseWorkflowSummary = buildCaseManagementSummary(session, pageLang);

    if (isEnglishPage) {
        return [
            `Profile: ${profile}.`,
            `${specialty} remains the closest specialty.`,
            `Top likely condition: ${primaryCondition}.`,
            `Risk: ${risk}. Confidence: ${confidence}.`,
            attachmentsCount ? `Local attachments linked: ${attachmentsCount}.` : "",
            caseWorkflowSummary,
            `Immediate next step: ${nextStep}.`,
        ].join(" ");
    }

    return [
        `هوية الجلسة: ${profile}.`,
        `يبقى ${specialty} هو التخصص الأقرب.`,
        `والاحتمال الأبرز حاليًا هو: ${primaryCondition}.`,
        `مستوى الخطورة ${risk} مع ${confidence}.`,
        attachmentsCount ? `ويوجد ${attachmentsCount} مرفق محلي مرتبط بهذه الجلسة.` : "",
        caseWorkflowSummary,
        `والخطوة العملية التالية هي: ${nextStep}.`,
    ].join(" ");
};

const renderUrgentChecklistCard = (session) => {
    const card = document.getElementById("urgent-checklist-card");
    const title = document.getElementById("urgent-checklist-title");
    const text = document.getElementById("urgent-checklist-text");
    const list = document.getElementById("urgent-checklist-list");
    if (!card || !list) {
        return;
    }
    const items = buildUrgentChecklist(session, pageLang);
    card.hidden = !items.length;
    if (!items.length) {
        list.innerHTML = "";
        return;
    }
    if (title) {
        title.textContent = tPage.urgentChecklistTitle;
    }
    if (text) {
        text.textContent = tPage.urgentChecklistText;
    }
    fillList(list, items, tPage.noData);
};

const renderCaseSnapshot = (session) => {
    const title = document.getElementById("case-snapshot-title");
    const text = document.getElementById("case-snapshot-text");
    const summary = document.getElementById("case-snapshot-summary");
    if (!summary) {
        return;
    }
    if (title) {
        title.textContent = tPage.caseSnapshotTitle;
    }
    if (text) {
        text.textContent = tPage.caseSnapshotText;
    }
    summary.textContent = buildCaseManagementSummary(session, pageLang);
};

const bindCaseManagementEditor = (session) => {
    const statusLabel = document.getElementById("case-status-label");
    const title = document.getElementById("case-management-title");
    const text = document.getElementById("case-management-text");
    const dateLabel = document.getElementById("case-follow-up-date-label");
    const noteLabel = document.getElementById("case-follow-up-note-label");
    const attachmentsLabel = document.getElementById("case-attachments-reviewed-label");
    const urgentLabel = document.getElementById("case-urgent-ack-label");
    const saveBtn = document.getElementById("save-case-management-btn");
    const statusNode = document.getElementById("case-management-status");
    const summaryNode = document.getElementById("case-management-summary");
    const dueInput = document.getElementById("case-follow-up-date");
    const noteInput = document.getElementById("case-follow-up-note");
    const attachmentsReviewedInput = document.getElementById("case-attachments-reviewed");
    const urgentAckInput = document.getElementById("case-urgent-ack");
    const roleButtons = Array.from(document.querySelectorAll("[data-case-status]"));

    if (!saveBtn || !dueInput || !noteInput || !attachmentsReviewedInput || !urgentAckInput || !roleButtons.length) {
        return;
    }

    if (title) title.textContent = tPage.caseManagementTitle;
    if (text) text.textContent = tPage.caseManagementText;
    if (statusLabel) statusLabel.textContent = tPage.caseStatusLabel;
    if (dateLabel) dateLabel.textContent = tPage.followUpDateLabel;
    if (noteLabel) noteLabel.textContent = tPage.followUpNoteLabel;
    if (attachmentsLabel) attachmentsLabel.textContent = tPage.attachmentsReviewedLabel;
    if (urgentLabel) urgentLabel.textContent = tPage.urgentAckLabel;
    saveBtn.textContent = tPage.saveCaseManagement;
    noteInput.placeholder = isEnglishPage ? "Add a short follow-up note" : "اكتب ملاحظة متابعة قصيرة";

    let state = buildCaseManagementState(session.case_management);

    const syncButtons = () => {
        roleButtons.forEach((button) => {
            const status = button.dataset.caseStatus || "new";
            button.textContent = translateReviewStatus(status, pageLang);
            button.classList.toggle("is-active", status === state.review_status);
        });
    };

    const refresh = () => {
        state = buildCaseManagementState(session.case_management);
        dueInput.value = state.follow_up_due || "";
        noteInput.value = state.follow_up_note || "";
        attachmentsReviewedInput.checked = Boolean(state.attachment_reviewed);
        urgentAckInput.checked = Boolean(state.urgent_acknowledged_at);
        syncButtons();
        if (summaryNode) {
            summaryNode.textContent = buildCaseManagementSummary(session, pageLang);
        }
        if (statusNode) {
            statusNode.textContent = state.updated_at ? formatSessionTimestamp(state.updated_at, pageLang) : "";
        }
    };

    roleButtons.forEach((button) => {
        button.addEventListener("click", () => {
            state.review_status = button.dataset.caseStatus || "new";
            syncButtons();
        });
    });

    saveBtn.addEventListener("click", () => {
        const previous = buildCaseManagementState(session.case_management);
        const nextState = buildCaseManagementState({
            ...previous,
            review_status: state.review_status,
            follow_up_due: dueInput.value,
            follow_up_note: noteInput.value,
            attachment_reviewed: attachmentsReviewedInput.checked,
            urgent_acknowledged_at: urgentAckInput.checked
                ? previous.urgent_acknowledged_at || new Date().toISOString()
                : "",
            reviewed_at:
                state.review_status === "reviewed"
                    ? previous.reviewed_at || new Date().toISOString()
                    : state.review_status === "closed"
                      ? previous.reviewed_at || new Date().toISOString()
                      : "",
            updated_at: new Date().toISOString(),
        });
        session.case_management = nextState;
        writeStoredSession(session);
        persistSessionToHistory(session);
        trackAnalyticsEvent("case_management_saved", {
            review_status: nextState.review_status,
            follow_up_due: nextState.follow_up_due || "",
            attachment_reviewed: nextState.attachment_reviewed,
            urgent_ack: Boolean(nextState.urgent_acknowledged_at),
        });
        if (statusNode) {
            statusNode.textContent = tPage.caseManagementSaved;
        }
        renderCaseSnapshot(session);
        renderUrgentChecklistCard(session);
        triggerReminderNotifications(readSessionHistory(), pageLang).catch(() => 0);
        window.setTimeout(refresh, 1500);
    });

    refresh();
};

const bindDoctorNoteEditor = (session) => {
    const editor = document.getElementById("doctor-note-editor");
    const saveBtn = document.getElementById("save-doctor-note-btn");
    const clearBtn = document.getElementById("clear-doctor-note-btn");
    const statusNode = document.getElementById("doctor-note-status");
    if (!editor || !saveBtn || !clearBtn) {
        return;
    }

    editor.value = session.doctor_notes?.text || "";
    editor.placeholder = isEnglishPage
        ? "Write a short doctor note or a follow-up instruction"
        : "اكتب ملاحظة طبية مختصرة أو تعليمات متابعة";
    saveBtn.textContent = tPage.saveDoctorNote;
    clearBtn.textContent = tPage.clearDoctorNote;

    const refreshStatus = () => {
        if (!statusNode) {
            return;
        }
        statusNode.textContent = session.doctor_notes?.updated_at
            ? formatSessionTimestamp(session.doctor_notes.updated_at, pageLang)
            : "";
    };

    saveBtn.addEventListener("click", () => {
        session.doctor_notes = {
            text: editor.value.trim(),
            updated_at: new Date().toISOString(),
        };
        writeStoredSession(session);
        persistSessionToHistory(session);
        trackAnalyticsEvent("doctor_note_saved", {
            length: session.doctor_notes.text.length,
        });
        if (statusNode) {
            statusNode.textContent = tPage.doctorNoteSaved;
        }
        window.setTimeout(refreshStatus, 1500);
    });

    clearBtn.addEventListener("click", () => {
        editor.value = "";
        session.doctor_notes = {
            text: "",
            updated_at: "",
        };
        writeStoredSession(session);
        persistSessionToHistory(session);
        trackAnalyticsEvent("doctor_note_cleared");
        if (statusNode) {
            statusNode.textContent = tPage.doctorNoteCleared;
        }
        window.setTimeout(refreshStatus, 1500);
    });

    refreshStatus();
};

const bindFeedbackWidget = (session, pageKey, options) => {
    const root = document.getElementById(options.rootId);
    const statusNode = document.getElementById(options.statusId);
    const textarea = document.getElementById(options.textareaId);
    const saveBtn = document.getElementById(options.saveId);
    const optionButtons = Array.from(document.querySelectorAll(`#${options.optionsId} [data-feedback-value]`));
    if (!root || !textarea || !saveBtn || !optionButtons.length) {
        return;
    }

    let current = session.feedback?.[pageKey] || {};
    let selected = current.rating || "";
    textarea.value = current.comment || "";
    saveBtn.textContent = tPage.saveFeedback;
    if (textarea.placeholder && options.placeholderKey) {
        textarea.placeholder = FEEDBACK_COPY[pageLang][options.placeholderKey];
    }

    const refresh = () => {
        optionButtons.forEach((button) => {
            button.classList.toggle("is-active", button.dataset.feedbackValue === selected);
            if (pageLang === "en") {
                button.textContent = getFeedbackLabel(button.dataset.feedbackValue, "en");
            }
        });
        if (statusNode) {
            statusNode.textContent = current.updated_at ? formatSessionTimestamp(current.updated_at, pageLang) : "";
        }
    };

    optionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selected = button.dataset.feedbackValue || "";
            refresh();
        });
    });

    saveBtn.addEventListener("click", () => {
        try {
            session.feedback = session.feedback || {};
            session.feedback[pageKey] = {
                rating: selected || "",
                comment: textarea.value.trim(),
                updated_at: new Date().toISOString(),
            };
            current = session.feedback[pageKey];
            writeStoredSession(session);
            persistSessionToHistory(session);
            trackAnalyticsEvent("feedback_saved", {
                page: pageKey,
                rating: selected || "",
            });
            if (statusNode) {
                statusNode.textContent = FEEDBACK_COPY[pageLang].saved;
            }
            window.setTimeout(() => refresh(), 1400);
        } catch (error) {
            if (statusNode) {
                statusNode.textContent = FEEDBACK_COPY[pageLang].failed;
            }
        }
    });

    refresh();
};

const translateLeafValue = (value) => {

    if (!isEnglishPage) return value;

    const text = String(value ?? "").trim();

    if (!text) {
        return value;
    }

    const directTranslation =
        SPECIALTY_TRANSLATIONS[text] ||
        TIMING_TRANSLATIONS[text] ||
        OPTION_TRANSLATIONS[text] ||
        SAFETY_TRANSLATIONS[text] ||
        VALUE_TRANSLATIONS[text] ||
        RATIONALE_TRANSLATIONS[text];

    if (directTranslation) {
        return directTranslation;
    }

    if (/[،,|]/.test(text)) {
        const parts = text
            .split(/[،,|]/)
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            return parts.map((part) => translateLeafValue(part)).join(", ");
        }
    }

    return translateConfidenceBand(translateRiskLevelLabel(text, "en"), "en") || text;

};

const translateStructuredLine = (value) => {

    if (!isEnglishPage) return value;

    const text = String(value ?? "").trim();

    for (const [prefix, englishLabel] of Object.entries(STRUCTURED_LINE_TRANSLATIONS)) {
        const marker = `${prefix}:`;
        if (text.startsWith(marker)) {
            const rawValue = text.slice(marker.length).trim();
            return `${englishLabel}: ${translateLeafValue(rawValue)}`;
        }
        const englishMarker = `${englishLabel}:`;
        if (text.startsWith(englishMarker)) {
            const rawValue = text.slice(englishMarker.length).trim();
            return `${englishLabel}: ${translateLeafValue(rawValue)}`;
        }
    }

    return text;

};

const translateMaybe = (value) => {

    if (!isEnglishPage) return value;

    const structured = translateStructuredLine(value);

    if (structured !== value) {
        return structured;
    }

    return translateLeafValue(value);

};

const translateSentenceList = (items = []) => {

    if (!Array.isArray(items)) return [];

    return items.map((item) => translateMaybe(item));

};

const fillLocalizedList = (node, items, fallback) => {

    fillList(node, translateSentenceList(items), fallback || tPage.noData);

};

const renderLocalizedLimeChips = (container, noteNode, explanation) => {

    if (!container) return;

    container.innerHTML = "";

    if (noteNode) {

        noteNode.textContent = explanation?.explanation_note

            ? translateMaybe(explanation.explanation_note)

            : tPage.limeNote;

    }

    const items = explanation?.word_importance || [];

    if (!items.length) {

        const chip = document.createElement("span");

        chip.className = "placeholder-chip";

        chip.textContent = tPage.noExplanation;

        container.appendChild(chip);

        return;

    }

    items.forEach(([word, weight]) => {

        const chip = document.createElement("span");

        chip.className = "lime-chip";

        chip.textContent = `${translateMaybe(word)} (${Number(weight).toFixed(2)})`;

        container.appendChild(chip);

    });

};
const applyOutputPageLanguage = () => {
    if (!["report.html", "decision.html", "integrative.html"].some((page) =>
        window.location.pathname.includes(page)
    )) {
        return;
    }

    const english = getCurrentLanguage() === "en";

    const textMap = {
        ar: {
            back_chat: "العودة للشات",
            nav_contact: "تواصل معنا",
            nav_team: "الفريق",
            nav_features: "المزايا",
            nav_about: "عن النظام",

            report_brand: "ملخص الطبيب",
            decision_brand: "تفسير القرار",
            tips_brand: "إرشادات داعمة",

            report_badge: "صفحة مستقلة للطبيب",
            report_title: "ملخص الحالة للطبيب",
            report_subtitle: "صفحة مستقلة ومنظمة لعرض الشكوى، النتيجة، المؤشرات المهمة، والخطوة التالية بصورة أوضح.",
            copy_report: "نسخ التقرير",
            print_pdf: "تصدير PDF / طباعة",

            decision_badge: "صفحة مستقلة لتفسير القرار",
            decision_title: "تفسير القرار",
            decision_heading: "كيف بُني القرار؟",
            decision_subtitle: "هذه الصفحة توضّح لماذا وصل النظام إلى هذه النتيجة، وما العوامل التي أثرت في الاختيار.",
            decision_page_description: "صفحة مستقلة تعرض التخصص المتوقع، المرض المحتمل، مبررات الترجيح، والكلمات الأكثر تأثيرًا في النتيجة.",

            tips_badge: "صفحة مستقلة للإرشادات الداعمة",
            tips_title: "الإرشادات الداعمة المؤقتة",

            tab_report: "ملخص الطبيب",
            tab_decision: "تفسير القرار",
            tab_tips: "إرشادات داعمة",

            specialty: "التخصص المرتبط",
            risk: "مستوى الخطورة",
            page_type: "نوع الصفحة",
            warning: "تنبيه",
            confidence: "درجة الثقة",
            next_step: "الخطوة التالية",

            intro: "مقدمة",
            input: "المدخلات",
            analysis: "التحليل",
            result: "النتيجة",
            possible_condition: "المرض المحتمل",
            current_confidence: "الثقة الحالية",
            alternative_specialty: "التخصص البديل القريب",
            confidence_note: "ملاحظة الثقة",
            open_report: "فتح ملخص الطبيب",
            go_chat: "اذهب إلى الشات",
            empty_decision_title: "لا يوجد تفسير جاهز بعد",
            empty_decision_text: "بعد إنهاء الجلسة في الشات سيظهر هنا تفسير مرتب لكيف وصل النظام إلى النتيجة.",
            empty_tips_title: "لا توجد إرشادات جاهزة بعد",
            empty_tips_text: "عند طلب الإرشادات الداعمة من داخل الشات، ستظهر هنا الإرشادات المفصلة بصياغة مرتبة وواضحة.",
            condition_why: "لماذا رُجّح هذا المرض؟",
            rationale: "مبررات القرار",
            red_flags: "العلامات الإنذارية",
            lime: "تفسير LIME",
            complaint_summary: "وصف مختصر للحالة",
            tips_page_type_value: "إرشادات داعمة مؤقتة",
            tips_warning_value: "ليست بديلًا عن التقييم الطبي",
        },
        en: {
            back_chat: "Back to Chat",
            nav_contact: "Contact",
            nav_team: "Team",
            nav_features: "Features",
            nav_about: "About",

            report_brand: "Doctor Summary",
            decision_brand: "Decision Explanation",
            tips_brand: "Supportive Care",

            report_badge: "Separate doctor page",
            report_title: "Doctor Case Summary",
            report_subtitle: "A separate organized page showing the complaint, result, important indicators, and next step more clearly.",
            copy_report: "Copy Report",
            print_pdf: "Export PDF / Print",

            decision_badge: "Separate decision explanation page",
            decision_title: "Decision Explanation",
            decision_heading: "How was the decision built?",
            decision_subtitle: "This page explains why the system reached this result and which factors influenced the decision.",
            decision_page_description: "A separate page showing the expected specialty, possible condition, decision rationale, and the terms that most influenced the result.",

            tips_badge: "Separate supportive care page",
            tips_title: "Temporary Supportive Guidance",

            tab_report: "Doctor Summary",
            tab_decision: "Decision Explanation",
            tab_tips: "Supportive Care",

            specialty: "Related specialty",
            risk: "Risk level",
            page_type: "Page type",
            warning: "Warning",
            confidence: "Confidence",
            next_step: "Next step",

            intro: "Introduction",
            input: "Input",
            analysis: "Analysis",
            result: "Result",
            possible_condition: "Possible condition",
            current_confidence: "Current confidence",
            alternative_specialty: "Alternative specialty",
            confidence_note: "Confidence note",
            open_report: "Open Doctor Summary",
            go_chat: "Go to Chat",
            empty_decision_title: "No explanation is ready yet",
            empty_decision_text: "After finishing the chat session, an organized explanation of how the result was reached will appear here.",
            empty_tips_title: "No supportive guidance is ready yet",
            empty_tips_text: "When supportive care is requested from the chat, the detailed guidance will appear here in a clear organized format.",
            condition_why: "Why this condition was considered",
            rationale: "Decision rationale",
            red_flags: "Red flags",
            lime: "LIME explanation",
            complaint_summary: "Case summary",
            tips_page_type_value: "Temporary supportive guidance",
            tips_warning_value: "Not a substitute for medical evaluation",
        },
    };

    const t = english ? textMap.en : textMap.ar;

    const replaceExactText = (from, to) => {
        document.querySelectorAll("body *").forEach((node) => {
            if (node.children.length === 0 && node.textContent.trim() === from) {
                node.textContent = to;
            }
        });
    };

    const pairs = [
        ["العودة للشات", t.back_chat],
        ["تواصل معنا", t.nav_contact],
        ["الفريق", t.nav_team],
        ["المزايا", t.nav_features],
        ["عن النظام", t.nav_about],

        ["ملخص الطبيب", t.tab_report],
        ["تفسير القرار", t.tab_decision],
        ["الطب البديل", t.tab_tips],
        ["إرشادات داعمة", t.tab_tips],

        ["صفحة مستقلة للطبيب", t.report_badge],
        ["ملخص الحالة للطبيب", t.report_title],
        ["صفحة مستقلة ومنظمة لعرض الشكوى، النتيجة، المؤشرات المهمة، والخطوة التالية بصورة أوضح.", t.report_subtitle],
        ["نسخ التقرير", t.copy_report],
        ["طباعة / PDF", t.print_pdf],
        ["تصدير PDF / طباعة", t.print_pdf],

        ["صفحة مستقلة لتفسير القرار", t.decision_badge],
        ["كيف بُني القرار؟", t.decision_heading],
        ["هذه الصفحة توضّح لماذا وصل النظام إلى هذه النتيجة، وما العوامل التي أثرت في الاختيار.", t.decision_subtitle],
        ["صفحة مستقلة تعرض التخصص المتوقع، المرض المحتمل، مبررات الترجيح، والكلمات الأكثر تأثيرًا في النتيجة.", t.decision_page_description],

        ["صفحة مستقلة للطب البديل", t.tips_badge],
        ["صفحة مستقلة للإرشادات الداعمة", t.tips_badge],
        ["الإرشادات التكاملية المؤقتة", t.tips_title],
        ["الإرشادات الداعمة المؤقتة", t.tips_title],

        ["التخصص المرتبط", t.specialty],
        ["التخصص المتوقع", t.specialty],
        ["المرض المحتمل", t.possible_condition],
        ["مستوى الخطورة", t.risk],
        ["درجة الخطورة", t.risk],
        ["نوع الصفحة", t.page_type],
        ["تنبيه", t.warning],
        ["درجة الثقة", t.confidence],
        ["الخطوة التالية", t.next_step],
        ["الثقة الحالية", t.current_confidence],
        ["التخصص البديل القريب", t.alternative_specialty],
        ["ملاحظة الثقة", t.confidence_note],

        ["مقدمة", t.intro],
        ["المدخلات", t.input],
        ["التحليل", t.analysis],
        ["النتيجة", t.result],
        ["لماذا رُجّح هذا المرض؟", t.condition_why],
        ["مبررات القرار", t.rationale],
        ["العلامات الإنذارية", t.red_flags],
        ["تفسير LIME", t.lime],
        ["وصف مختصر للحالة", t.complaint_summary],
        ["المرفقات المرفوعة", t.attachments],
        ["ما الذي اتضح بعد أسئلة المتابعة؟", t.refinement],
        ["ما الذي تغيّر بعد أسئلة المتابعة؟", t.refinement],
        ["لماذا لم يبقَ التخصص البديل هو الأقرب؟", t.whyNotAlt],
        ["لماذا لم يرجح التخصص البديل؟", t.whyNotAlt],
        ["أثر أسئلة المتابعة", t.followupAudit],
        ["هذا التسلسل يوضح كيف أثرت الإجابات على الصورة النهائية.", t.followupAuditIntro],
        ["ملخص مختصر بوضع الطبيب", t.doctorModeSummary],
        ["ملاحظات الطبيب أو المشرف", t.doctorNoteEditorTitle],
        ["يمكنك كتابة ملاحظة مختصرة لتبقى مرتبطة بهذه الجلسة عند فتحها لاحقًا.", t.doctorNoteEditorText],
        ["حفظ الملاحظة", t.saveDoctorNote],
        ["مسح", t.clearDoctorNote],
        ["تجاوز إلى المحتوى", t.skipToContent],
        ["تقييم فائدة الملخص", t.feedbackTitleReport],
        ["هل كان التفسير واضحًا؟", t.feedbackTitleDecision],
        ["هل كانت الإرشادات مفيدة؟", t.feedbackTitleTips],
        ["حفظ التقييم", t.saveFeedback],
        ["لوحة الطبيب", t.dashboardLink],
        ["فتح ملخص الطبيب", t.open_report],
        ["اذهب إلى الشات", t.go_chat],
        ["لا يوجد تفسير جاهز بعد", t.empty_decision_title],
        ["بعد إنهاء الجلسة في الشات سيظهر هنا تفسير مرتب لكيف وصل النظام إلى النتيجة.", t.empty_decision_text],
        ["لا توجد إرشادات جاهزة بعد", t.empty_tips_title],
        ["عند طلب الطب البديل من داخل الشات، ستظهر هنا الإرشادات المفصلة بصياغة مرتبة وواضحة.", t.empty_tips_text],
        ["عند طلب الإرشادات الداعمة من داخل الشات، ستظهر هنا الإرشادات المفصلة بصياغة مرتبة وواضحة.", t.empty_tips_text],
        ["إرشادات داعمة مؤقتة", t.tips_page_type_value],
        ["ليست بديلًا عن التقييم الطبي", t.tips_warning_value],
    ];

    pairs.forEach(([from, to]) => replaceExactText(from, to));

    document.documentElement.lang = english ? "en" : "ar";
    document.documentElement.dir = english ? "ltr" : "rtl";
    document.body.classList.toggle("is-ltr", english);

    if (window.location.pathname.includes("decision.html")) {
        document.title = `Medika AI | ${t.decision_title}`;
    } else if (window.location.pathname.includes("integrative.html")) {
        document.title = `Medika AI | ${t.tips_title}`;
    } else if (window.location.pathname.includes("report.html")) {
        document.title = `Medika AI | ${t.report_title}`;
    }

    document.querySelectorAll('a[href="dashboard.html"]').forEach((link) => {
        link.setAttribute("href", `dashboard.html?lang=${pageLang}`);
    });

    refreshThemeToggle();
};

applyOutputPageLanguage();

const reportPageContent = document.getElementById("report-page-content");

if (reportPageContent) {

    const session = readStoredSession();

    const emptyState = document.getElementById("report-empty-state");

    const copyReportBtn = document.getElementById("copy-report-btn");
    const shareReportBtn = document.getElementById("share-report-btn");

    const printReportBtn = document.getElementById("print-report-btn");

    if (copyReportBtn) {
        copyReportBtn.textContent = tPage.copyReport;
    }

    if (shareReportBtn) {
        shareReportBtn.textContent = tPage.shareSummary;
    }

    if (printReportBtn) {
        printReportBtn.textContent = tPage.priorityPrint;
    }

    if (!session.report) {

        if (emptyState) {

            emptyState.hidden = false;

        }

        reportPageContent.hidden = true;

    } else {

        const sections = session.report.sections;

        setText(

            document.getElementById("report-specialty"),

            translateSpecialty(sections.prediction.specialty, pageLang)

        );

        applyRiskLevel(

            document.getElementById("report-risk"),

            translateRiskLevelLabel(sections.prediction.risk_level, pageLang)

        );

        setText(

            document.getElementById("report-next-step"),

            translateTiming(sections.prediction.next_step, pageLang)

        );

        setText(

            document.getElementById("report-confidence-text"),

            `${translateConfidenceBand(sections.prediction.confidence_band, pageLang)} (${Number(sections.prediction.confidence).toFixed(2)})`

        );

        const confidenceBar = document.getElementById("confidence-meter-bar");

        if (confidenceBar) {

            confidenceBar.style.width = `${Math.max(

                8,

                Math.min(100, Number(sections.prediction.confidence) * 100)

            )}%`;

        }
        setText(
            document.getElementById("report-possible-condition"),
            translateMaybe(getLocalizedPossibleConditionText(sections))
        );
        setText(document.getElementById("report-complaint"), sections.chief_complaint);

        setText(document.getElementById("report-symptoms"), sections.symptoms_summary);

        setText(

            document.getElementById("report-clinical-brief"),

            `${tPage.location}: ${translateMaybe(sections.location)} | ${tPage.severity}: ${translateMaybe(sections.severity)} | ${tPage.duration}: ${translateMaybe(sections.duration)} | ${tPage.trend}: ${translateMaybe(sections.trend)}`

        );

        setText(

            document.getElementById("report-red-flags"),

            `${tPage.associatedSymptoms}: ${translateMaybe(sections.associated_symptoms)} | ${tPage.redFlags}: ${translateMaybe(sections.red_flags)}`

        );

        setText(

            document.getElementById("report-history"),

            `${tPage.age}: ${translateMaybe(sections.history.age_group)} | ${tPage.sex}: ${translateMaybe(sections.history.sex)} | ${tPage.chronicDisease}: ${translateMaybe(sections.history.chronic_disease)} | ${tPage.currentMeds}: ${translateMaybe(sections.history.current_medications)} | ${tPage.drugAllergy}: ${translateMaybe(sections.history.drug_allergy)} | ${tPage.priorHistory}: ${translateMaybe(sections.history.prior_history)}`

        );

        setText(

            document.getElementById("report-send-note"),

            String(session.doctor_notes?.text || "").trim() ||
                tPage.sendNote(
                    translateSpecialty(sections.prediction.specialty, pageLang),
                    translateTiming(sections.prediction.next_step, pageLang)
                )

        );

        setText(
            document.getElementById("report-alt-specialty"),
            translateSpecialty(sections.prediction.alternative_specialty || "-", pageLang)
        );

        setText(
            document.getElementById("report-confidence-note"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.confidence_note_en
                    : sections.prediction.confidence_note_ar) ||
                    sections.prediction.confidence_note ||
                    tPage.noData
            )
        );

        setText(
            document.getElementById("report-refinement-summary"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.refinement_summary_en
                    : sections.prediction.refinement_summary_ar) ||
                    sections.prediction.refinement_summary ||
                    tPage.noData
            )
        );

        setText(
            document.getElementById("report-why-not-alt"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.why_not_alternative_en
                    : sections.prediction.why_not_alternative_ar) ||
                    sections.prediction.why_not_alternative ||
                    tPage.noData
            )
        );

        renderSessionAttachments(
            document.getElementById("report-attachments-grid"),
            Array.isArray(session.attachments) ? session.attachments : []
        );
        renderCaseTimelineVisual(document.getElementById("report-case-timeline"), session);
        renderUrgentChecklistCard(session);
        fillLocalizedList(
            document.getElementById("follow-up-audit-list"),
            buildFollowUpAuditTrail(session),
            tPage.noData
        );
        setText(
            document.getElementById("report-doctor-mode-summary"),
            buildDoctorModeSummary(session)
        );

        fillLocalizedList(document.getElementById("timeline-list"), sections.timeline);
        setupPriorityBanner(session);

    }

    if (copyReportBtn) {

        copyReportBtn.addEventListener("click", async () => {

            const reportText = buildDetailedReportText(session);
            if (!reportText) {

                return;

            }

            try {

                await navigator.clipboard.writeText(reportText);
                trackAnalyticsEvent("copy_report_text");

                copyReportBtn.textContent = tPage.copied;

                setTimeout(() => {

                    copyReportBtn.textContent = tPage.copyReport;

                }, 1500);

            } catch (error) {

                copyReportBtn.textContent = tPage.copyFailed;

                setTimeout(() => {

                    copyReportBtn.textContent = tPage.copyReport;

                }, 1500);

            }

        });

    }

    if (shareReportBtn) {
        shareReportBtn.addEventListener("click", async () => {
            await shareTextPayload(buildReportShareText(session), shareReportBtn, tPage.shareSummary);
        });
    }

    if (printReportBtn) {

        printReportBtn.addEventListener("click", () => {

            exportReportPdf(session);

        });

    }

    bindFeedbackWidget(session, "report", {
        rootId: "report-feedback-card",
        optionsId: "report-feedback-options",
        textareaId: "report-feedback-comment",
        saveId: "report-feedback-save",
        statusId: "report-feedback-status",
        placeholderKey: "placeholderReport",
    });
    bindDoctorNoteEditor(session);
    bindCaseManagementEditor(session);

}

const decisionPageContent = document.getElementById("decision-page-content");

if (decisionPageContent) {

    const session = readStoredSession();

    const emptyState = document.getElementById("decision-empty-state");
    const shareDecisionBtn = document.getElementById("share-decision-btn");

    const explanation = session.explanation || session.report?.sections?.lime || null;

    if (shareDecisionBtn) {
        shareDecisionBtn.textContent = tPage.shareDecision;
    }

    if (!session.report || !explanation) {

        if (emptyState) {

            emptyState.hidden = false;

        }

        decisionPageContent.hidden = true;

    } else {

        const sections = session.report.sections;
        const localizedConditionText = getLocalizedPossibleConditionText(sections);
        const conditionLines = String(localizedConditionText || "")
            .split("\n")
            .map((line) => line.replace(/^[-•*🔹\s]+/, "").trim())
            .filter(Boolean)
            .filter(
                (line) =>
                    !line.startsWith("الأعراض") &&
                    !line.startsWith("Among the possibilities") &&
                    !line.startsWith("في هذه المرحلة") &&
                    !line.startsWith("At this stage")
            );
        const conditionSummary = conditionLines[0] || translateMaybe(localizedConditionText);
        const decisionFlagLines = [
            `${isEnglishPage ? "Associated symptoms" : "الأعراض المصاحبة"}: ${translateMaybe(sections.associated_symptoms)}`,
            `${isEnglishPage ? "Warning signs" : "العلامات الإنذارية"}: ${translateMaybe(sections.red_flags)}`,
        ].filter((line) => !line.endsWith(": -"));

        setText(

            document.getElementById("decision-specialty"),

            translateSpecialty(sections.prediction.specialty, pageLang)

        );

        applyRiskLevel(

            document.getElementById("decision-risk"),

            translateRiskLevelLabel(sections.prediction.risk_level, pageLang)

        );

        setText(

            document.getElementById("decision-next-step"),

            translateTiming(sections.prediction.next_step, pageLang)

        );

        setText(

            document.getElementById("decision-confidence"),

            `${translateConfidenceBand(sections.prediction.confidence_band, pageLang)} (${Number(sections.prediction.confidence).toFixed(2)})`

        );

        setText(document.getElementById("decision-condition"), conditionSummary);
        setText(
            document.getElementById("decision-alternative"),
            translateSpecialty(sections.prediction.alternative_specialty || "-", pageLang)
        );

        setText(document.getElementById("decision-input"), sections.decision_build.input);

        fillLocalizedList(document.getElementById("decision-analysis"), sections.decision_build.analysis);

        fillLocalizedList(document.getElementById("decision-output"), sections.decision_build.output);

        fillLocalizedList(

            document.getElementById("decision-condition-why"),

            conditionLines,

            tPage.noData

        );

        fillLocalizedList(

            document.getElementById("decision-rationale"),

            sections.rationale,

            tPage.noExtraRationale

        );

        fillLocalizedList(

            document.getElementById("decision-condition-flags"),

            decisionFlagLines,

            tPage.noData

        );

        setText(
            document.getElementById("decision-confidence-note"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.confidence_note_en
                    : sections.prediction.confidence_note_ar) ||
                    sections.prediction.confidence_note ||
                    tPage.noData
            )
        );

        setText(
            document.getElementById("decision-refinement-summary"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.refinement_summary_en
                    : sections.prediction.refinement_summary_ar) ||
                    sections.prediction.refinement_summary ||
                    tPage.noData
            )
        );

        setText(
            document.getElementById("decision-why-not-alt"),
            translateMaybe(
                (isEnglishPage
                    ? sections.prediction.why_not_alternative_en
                    : sections.prediction.why_not_alternative_ar) ||
                    sections.prediction.why_not_alternative ||
                    tPage.noData
            )
        );

        renderLocalizedLimeChips(

            document.getElementById("lime-chips"),

            document.getElementById("lime-note"),

            explanation

        );

        renderUrgentChecklistCard(session);
        renderCaseSnapshot(session);
        setupPriorityBanner(session);

    }

    if (shareDecisionBtn) {
        shareDecisionBtn.addEventListener("click", async () => {
            await shareTextPayload(buildDecisionShareText(session), shareDecisionBtn, tPage.shareDecision);
        });
    }

    bindFeedbackWidget(session, "decision", {
        rootId: "decision-feedback-card",
        optionsId: "decision-feedback-options",
        textareaId: "decision-feedback-comment",
        saveId: "decision-feedback-save",
        statusId: "decision-feedback-status",
        placeholderKey: "placeholderDecision",
    });

}

const tipsPageContent = document.getElementById("tips-page-content");

if (tipsPageContent) {

    const session = readStoredSession();

    const emptyState = document.getElementById("tips-empty-state");
    const shareTipsBtn = document.getElementById("share-tips-btn");

    const tips = session.tips || [];

    if (shareTipsBtn) {
        shareTipsBtn.textContent = tPage.shareTips;
    }

    if (!tips.length) {

        if (emptyState) {

            emptyState.hidden = false;

        }

        tipsPageContent.hidden = true;

    } else {

        setText(

            document.getElementById("tips-specialty"),

            translateSpecialty(

                session.prediction?.final_label || session.report?.sections?.prediction?.specialty || "-",

                pageLang

            )

        );

        applyRiskLevel(

            document.getElementById("tips-risk"),

            translateRiskLevelLabel(

                session.recommendation?.risk_level || session.report?.sections?.prediction?.risk_level || "",

                pageLang

            )

        );

        setText(

            document.getElementById("tips-intro"),

            isEnglishPage

                ? "Temporary supportive guidance. These suggestions do not replace medical evaluation."

                : tips[0]

        );

        const grid = document.getElementById("integrative-grid");

        if (grid) {

            grid.innerHTML = "";

            const englishTips = [

                {

                    title: "General supportive care only",

                    body: [

                        "Use these options only as temporary comfort measures.",

                        "They should not replace direct medical assessment, especially with high-risk symptoms.",

                    ],

                },

                {

                    title: "Rest and hydration",

                    body: [

                        "Try to rest, drink enough water, and avoid heavy meals until symptoms are clearer.",

                        "Seek medical care promptly if symptoms worsen or new warning signs appear.",

                    ],

                },

                {

                    title: "Stress reduction",

                    body: [

                        "Slow breathing and relaxation may reduce tension temporarily.",

                        "This is not treatment for heart, breathing, fainting, or severe pain symptoms.",

                    ],

                },

                {

                    title: "When to avoid relying on this",

                    body: [

                        "Do not rely on supportive care if there is chest pain, shortness of breath, fainting, severe pain, or worsening symptoms.",

                        "In these cases, medical evaluation is the priority.",

                    ],

                },

            ];

            if (isEnglishPage) {

                englishTips.forEach((tip) => {

                    const card = document.createElement("article");

                    card.className = "integrative-card";

                const title = document.createElement("h3");

                    title.textContent = tip.title;

                    card.appendChild(title);

                    tip.body.forEach((line) => {

                        const paragraph = document.createElement("p");

                        paragraph.textContent = line;

                        card.appendChild(paragraph);

                    });

                    grid.appendChild(card);

                });

            } else {

                tips.slice(1).forEach((tip) => {

                    const lines = parseTipLines(tip);

                    if (!lines.length) {

                        return;

                    }

                    const card = document.createElement("article");

                    card.className = "integrative-card";

                    const title = document.createElement("h3");

                    title.textContent = lines[0];

                    card.appendChild(title);

                    lines.slice(1).forEach((line) => {

                        const paragraph = document.createElement("p");

                        paragraph.textContent = line;

                        card.appendChild(paragraph);

                    });

                grid.appendChild(card);

            });

        }

        renderUrgentChecklistCard(session);
        renderCaseSnapshot(session);
        setupPriorityBanner(session);

    }

    if (shareTipsBtn) {
        shareTipsBtn.addEventListener("click", async () => {
            await shareTextPayload(buildTipsShareText(session), shareTipsBtn, tPage.shareTips);
        });
    }

    bindFeedbackWidget(session, "tips", {
        rootId: "tips-feedback-card",
        optionsId: "tips-feedback-options",
        textareaId: "tips-feedback-comment",
        saveId: "tips-feedback-save",
        statusId: "tips-feedback-status",
        placeholderKey: "placeholderTips",
    });

}

const dashboardPage = document.getElementById("dashboard-session-list");

if (dashboardPage) {
    const lang = getCurrentLanguage();
    const copy = DASHBOARD_COPY[lang];
    const searchInput = document.getElementById("dashboard-search-input");
    const riskFilter = document.getElementById("dashboard-risk-filter");
    const roleFilter = document.getElementById("dashboard-role-filter");
    const reviewFilter = document.getElementById("dashboard-review-filter");
    const specialtyFilter = document.getElementById("dashboard-specialty-filter");
    const profileFilter = document.getElementById("dashboard-profile-filter");
    const emptyState = document.getElementById("dashboard-empty-state");
    const exportBtn = document.getElementById("dashboard-export-btn");
    const clearBtn = document.getElementById("dashboard-clear-analytics-btn");
    const metricsGrid = document.getElementById("dashboard-metrics-grid");
    const profileSummary = document.getElementById("dashboard-profile-summary");
    const insightsList = document.getElementById("dashboard-insights-list");
    const remindersList = document.getElementById("dashboard-reminders-list");
    const specialtyChart = document.getElementById("dashboard-specialty-chart");
    const riskChart = document.getElementById("dashboard-risk-chart");
    const reviewChart = document.getElementById("dashboard-review-chart");
    const activityChart = document.getElementById("dashboard-activity-chart");
    const notificationStatus = document.getElementById("dashboard-notification-status");
    const notificationEnableBtn = document.getElementById("dashboard-notifications-enable-btn");
    const notificationTestBtn = document.getElementById("dashboard-notifications-test-btn");

    const setNode = (id, value) => {
        const node = document.getElementById(id);
        if (node) {
            node.textContent = value;
        }
    };

    setNode("dashboard-brand-subtitle", copy.brand);
    setNode("dashboard-nav-about", copy.nav_about);
    setNode("dashboard-nav-features", copy.nav_features);
    setNode("dashboard-nav-team", copy.nav_team);
    setNode("dashboard-nav-contact", copy.nav_contact);
    setNode("dashboard-back-chat-link", copy.back_chat);
    setNode("dashboard-kicker", copy.kicker);
    setNode("dashboard-title", copy.title);
    setNode("dashboard-description", copy.description);
    setNode("dashboard-open-chat-btn", copy.back_chat);
    setNode("dashboard-export-btn", copy.export);
    setNode("dashboard-clear-analytics-btn", copy.clear);
    setNode("dashboard-filter-search-label", copy.search);
    setNode("dashboard-filter-risk-label", copy.risk);
    setNode("dashboard-filter-role-label", copy.role);
    setNode("dashboard-filter-review-label", copy.review);
    setNode("dashboard-filter-specialty-label", copy.specialty);
    setNode("dashboard-filter-profile-label", copy.profile);
    setNode("dashboard-empty-title", copy.empty_title);
    setNode("dashboard-empty-text", copy.empty_text);
    setNode("dashboard-empty-go-chat", copy.go_chat);
    setNode("dashboard-profile-title", copy.profileTitle);
    setNode("dashboard-profile-text", copy.profileText);
    setNode("dashboard-insights-title", copy.insightsTitle);
    setNode("dashboard-insights-text", copy.insightsText);
    setNode("dashboard-reminders-title", copy.remindersTitle);
    setNode("dashboard-reminders-text", copy.remindersText);
    setNode("dashboard-notifications-title", copy.notificationsTitle);
    setNode("dashboard-notifications-text", copy.notificationsText);
    setNode("dashboard-chart-specialty-title", copy.chartSpecialtyTitle);
    setNode("dashboard-chart-specialty-text", copy.chartSpecialtyText);
    setNode("dashboard-chart-risk-title", copy.chartRiskTitle);
    setNode("dashboard-chart-risk-text", copy.chartRiskText);
    setNode("dashboard-chart-review-title", copy.chartReviewTitle);
    setNode("dashboard-chart-review-text", copy.chartReviewText);
    setNode("dashboard-chart-activity-title", copy.chartActivityTitle);
    setNode("dashboard-chart-activity-text", copy.chartActivityText);
    document.title = `Medika AI | ${copy.brand}`;
    document.getElementById("dashboard-back-chat-link")?.setAttribute("href", `chat.html?lang=${lang}`);
    document.getElementById("dashboard-open-chat-btn")?.setAttribute("href", `chat.html?lang=${lang}`);
    document.getElementById("dashboard-empty-go-chat")?.setAttribute("href", `chat.html?lang=${lang}`);

    if (searchInput) {
        searchInput.placeholder = lang === "en" ? "Search complaint or notes" : "ابحث في الشكوى أو الملاحظات";
    }

    if (riskFilter) {
        const selectedRisk = riskFilter.value;
        const riskOptions = ["", "low", "medium", "high", "urgent", "emergency"];
        riskFilter.innerHTML = riskOptions
            .map((value) => `<option value="${value}">${value ? translateRiskLevelLabel(value, lang) : copy.all}</option>`)
            .join("");
        riskFilter.value = selectedRisk;
    }

    if (roleFilter) {
        const selectedRole = roleFilter.value;
        roleFilter.innerHTML = `
            <option value="">${copy.all}</option>
            <option value="patient">${ACCOUNT_COPY[lang].patient}</option>
            <option value="doctor">${ACCOUNT_COPY[lang].doctor}</option>
        `;
        roleFilter.value = selectedRole;
    }

    if (reviewFilter) {
        const selectedReview = reviewFilter.value;
        reviewFilter.innerHTML = `
            <option value="">${copy.all}</option>
            ${REVIEW_STATUS_VALUES.map((value) => `<option value="${value}">${translateReviewStatus(value, lang)}</option>`).join("")}
        `;
        reviewFilter.value = selectedReview;
    }

    const populateDashboardFilters = (historyEntries) => {
        if (specialtyFilter) {
            const selected = specialtyFilter.value;
            specialtyFilter.innerHTML = `<option value="">${copy.all}</option>`;
            getAllKnownSpecialties(historyEntries).forEach((specialty) => {
                const option = document.createElement("option");
                option.value = specialty;
                option.textContent = translateSpecialty(specialty, lang);
                specialtyFilter.appendChild(option);
            });
            specialtyFilter.value = selected;
        }
        if (profileFilter) {
            const selected = profileFilter.value;
            profileFilter.innerHTML = `<option value="">${copy.all}</option>`;
            getAllKnownProfiles(historyEntries).forEach((profile) => {
                const option = document.createElement("option");
                option.value = profile.id;
                option.textContent = `${translateRoleLabel(profile.role, lang)} • ${getProfileDisplayName(profile, lang)}`;
                profileFilter.appendChild(option);
            });
            profileFilter.value = selected;
        }
    };

    const renderDashboardMetrics = (historyEntries) => {
        if (!metricsGrid) {
            return;
        }
        const metrics = summarizeAnalytics();
        const reminders = buildSessionReminders(historyEntries, lang);
        const metricCards = [
            [copy.metrics.saved, metrics.saved],
            [copy.metrics.completed, metrics.completed],
            [copy.metrics.highRisk, metrics.highRisk],
            [copy.metrics.reviewed, metrics.reviewed],
            [copy.metrics.followUp, metrics.followUp],
            [copy.metrics.tips, metrics.tips],
            [copy.metrics.attachments, metrics.attachments],
            [copy.metrics.feedback, metrics.feedback],
            [copy.metrics.reminders, reminders.length],
            [copy.metrics.profiles, metrics.profiles],
        ];
        metricsGrid.innerHTML = metricCards
            .map(
                ([label, value]) => `
                    <article class="summary-item">
                        <span>${label}</span>
                        <strong>${value}</strong>
                    </article>
                `
            )
            .join("");
    };

    const renderDashboardProfile = () => {
        if (!profileSummary) {
            return;
        }
        const active = readActiveProfile();
        profileSummary.innerHTML = `
            <div class="dashboard-profile-badge">${translateRoleLabel(active.role, lang)}</div>
            <strong>${getProfileDisplayName(active, lang)}</strong>
            <span>${ACCOUNT_COPY[lang].active}</span>
        `;
    };

    const renderDashboardInsights = (historyEntries) => {
        if (!insightsList) {
            return;
        }
        const insights = buildDashboardInsights(historyEntries, lang);
        insightsList.innerHTML = "";
        if (!insights.length) {
            const item = document.createElement("li");
            item.textContent = copy.empty_text;
            insightsList.appendChild(item);
            return;
        }
        insights.forEach((text) => {
            const item = document.createElement("li");
            item.textContent = text;
            insightsList.appendChild(item);
        });
    };

    const renderDashboardNotificationPanel = (historyEntries) => {
        if (!notificationStatus) {
            return;
        }
        const state = syncNotificationPermissionState();
        const supported = isBrowserNotificationSupported();
        const permission = state.last_permission || getBrowserNotificationPermission();
        const dueNotificationCount = buildSessionReminders(historyEntries, lang).filter((reminder) => shouldNotifyForReminder(reminder)).length;

        let statusText = copy.notificationsUnsupported;
        if (supported) {
            if (permission === "denied") {
                statusText = copy.notificationsDenied;
            } else if (!state.enabled || permission !== "granted") {
                statusText = copy.notificationsPrompt;
            } else if (dueNotificationCount > 0) {
                statusText =
                    lang === "en"
                        ? `${copy.notificationsReady} ${dueNotificationCount} alert(s) are currently eligible.`
                        : `${copy.notificationsReady} يوجد ${dueNotificationCount} تنبيه مؤهل حاليًا.`;
            } else {
                statusText = `${copy.notificationsReady} ${copy.notificationsNoDue}`;
            }
        }

        notificationStatus.textContent = statusText;

        if (notificationEnableBtn) {
            notificationEnableBtn.textContent =
                supported && state.enabled && permission === "granted"
                    ? copy.notificationsDisable
                    : copy.notificationsEnable;
            notificationEnableBtn.disabled = !supported;
        }

        if (notificationTestBtn) {
            notificationTestBtn.textContent = copy.notificationsTest;
            notificationTestBtn.disabled = !supported || permission !== "granted" || !state.enabled;
        }
    };

    const renderDashboardReminders = (historyEntries) => {
        if (!remindersList) {
            return;
        }
        const reminders = buildSessionReminders(historyEntries, lang);
        remindersList.innerHTML = "";
        if (!reminders.length) {
            const empty = document.createElement("p");
            empty.className = "attachment-empty";
            empty.textContent = copy.noReminders;
            remindersList.appendChild(empty);
            return;
        }
        reminders.forEach((reminder) => {
            const card = document.createElement("article");
            card.className = "dashboard-reminder-card";
            card.innerHTML = `
                <div>
                    <strong>${reminder.text}</strong>
                    <span>${reminder.meta}</span>
                </div>
                <div class="dashboard-reminder-actions">
                    <button type="button" class="session-history-btn" data-reminder-action="open">${copy.open_report}</button>
                    <button type="button" class="session-history-btn" data-reminder-action="dismiss">${copy.dismissReminder}</button>
                </div>
            `;
            card.querySelector('[data-reminder-action="open"]')?.addEventListener("click", () => {
                setActiveProfile(reminder.session?.profile || readActiveProfile());
                writeStoredSession(reminder.session);
                window.location.href = `report.html?lang=${lang}`;
            });
            card.querySelector('[data-reminder-action="dismiss"]')?.addEventListener("click", () => {
                const state = readReminderState();
                state.dismissed = Array.from(new Set([...(state.dismissed || []), reminder.id]));
                writeReminderState(state);
                trackAnalyticsEvent("dashboard_dismiss_reminder", { id: reminder.id });
                refreshDashboardMeta();
            });
            remindersList.appendChild(card);
        });
    };

    const renderMiniChart = (container, rows) => {
        if (!container) {
            return;
        }
        container.innerHTML = "";
        if (!rows.length) {
            const empty = document.createElement("p");
            empty.className = "mini-chart-empty";
            empty.textContent = copy.empty_text;
            container.appendChild(empty);
            return;
        }
        rows.forEach((row) => {
            const item = document.createElement("article");
            item.className = "mini-chart-row";
            item.innerHTML = `
                <div class="mini-chart-head">
                    <span>${row.label}</span>
                    <strong>${row.value}</strong>
                </div>
                <div class="mini-chart-track"><div class="mini-chart-bar" style="width:${row.percent}%"></div></div>
            `;
            container.appendChild(item);
        });
    };

    const renderDashboardCharts = (historyEntries) => {
        renderMiniChart(
            specialtyChart,
            buildDistribution(
                historyEntries.map((entry) => entry.session?.report?.sections?.prediction?.specialty || entry.specialty || ""),
                (value) => translateSpecialty(value, lang)
            )
        );
        renderMiniChart(
            riskChart,
            buildDistribution(
                historyEntries.map((entry) => String(entry.session?.recommendation?.risk_level || entry.risk_level || "").toLowerCase()),
                (value) => translateRiskLevelLabel(value, lang)
            )
        );
        renderMiniChart(
            reviewChart,
            buildDistribution(
                historyEntries.map((entry) => buildCaseManagementState(entry.session?.case_management).review_status),
                (value) => translateReviewStatus(value, lang)
            )
        );
        renderMiniChart(activityChart, buildActivityDistribution(historyEntries, lang));
    };

    const refreshDashboardMeta = () => {
        const historyEntries = readSessionHistory();
        populateDashboardFilters(historyEntries);
        renderDashboardMetrics(historyEntries);
        renderDashboardProfile();
        renderDashboardInsights(historyEntries);
        renderDashboardReminders(historyEntries);
        renderDashboardNotificationPanel(historyEntries);
        renderDashboardCharts(historyEntries);
        triggerReminderNotifications(historyEntries, lang).catch(() => 0);
    };

    const renderDashboardSessions = () => {
        const history = readSessionHistory();
        const term = String(searchInput?.value || "").trim().toLowerCase();
        const riskValue = String(riskFilter?.value || "").trim().toLowerCase();
        const roleValue = String(roleFilter?.value || "").trim().toLowerCase();
        const reviewValue = String(reviewFilter?.value || "").trim().toLowerCase();
        const specialtyValue = String(specialtyFilter?.value || "").trim();
        const profileValue = String(profileFilter?.value || "").trim();
        const filtered = history.filter((entry) => {
            const session = entry.session || {};
            const caseState = buildCaseManagementState(session.case_management);
            const feedbackText = Object.values(session.feedback || {})
                .map((item) => `${item?.rating || ""} ${item?.comment || ""}`)
                .join(" ");
            const attachmentText = (Array.isArray(session.attachments) ? session.attachments : [])
                .map((attachment) => `${getAttachmentInsightText(attachment, lang)} ${(attachment.insight?.keywords || []).join(" ")}`)
                .join(" ");
            const profileName = `${entry.profile?.name || session.profile?.name || ""} ${entry.profile?.role || session.profile?.role || ""}`;
            const managementText = `${session.case_management?.review_status || ""} ${session.case_management?.follow_up_due || ""} ${session.case_management?.follow_up_note || ""}`;
            const matchesTerm =
                !term ||
                String(entry.complaint || "").toLowerCase().includes(term) ||
                feedbackText.toLowerCase().includes(term) ||
                attachmentText.toLowerCase().includes(term) ||
                String(entry.doctor_note || "").toLowerCase().includes(term) ||
                profileName.toLowerCase().includes(term) ||
                managementText.toLowerCase().includes(term);
            const normalizedRisk = String(entry.session?.recommendation?.risk_level || entry.risk_level || "").toLowerCase();
            const matchesRisk = !riskValue || normalizedRisk === riskValue;
            const normalizedRole = String(entry.profile?.role || session.profile?.role || "patient").toLowerCase();
            const matchesRole = !roleValue || normalizedRole === roleValue;
            const matchesReview = !reviewValue || caseState.review_status === reviewValue;
            const entrySpecialty = entry.session?.report?.sections?.prediction?.specialty || entry.specialty || "";
            const matchesSpecialty = !specialtyValue || entrySpecialty === specialtyValue;
            const normalizedProfileId = String(entry.profile?.id || session.profile?.id || "");
            const matchesProfile = !profileValue || normalizedProfileId === profileValue;
            return matchesTerm && matchesRisk && matchesRole && matchesReview && matchesSpecialty && matchesProfile;
        });

        dashboardPage.innerHTML = "";
        if (!filtered.length) {
            if (emptyState) {
                emptyState.hidden = false;
            }
            return;
        }
        if (emptyState) {
            emptyState.hidden = true;
        }

        filtered.forEach((entry) => {
            const session = entry.session || {};
            const card = document.createElement("article");
            card.className = "dashboard-session-card doc-card";
            const latestFeedback = Object.values(session.feedback || {}).filter(Boolean).sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))[0];
            const attachmentsCount = Array.isArray(session.attachments) ? session.attachments.length : 0;
            const doctorNote = String(session.doctor_notes?.text || "").trim();
            const caseState = buildCaseManagementState(session.case_management);
            const dueState = getFollowUpDueState(caseState.follow_up_due);
            const attachmentInsight = (Array.isArray(session.attachments) ? session.attachments : [])
                .map((attachment) => getAttachmentInsightText(attachment, lang))
                .find(Boolean);
            const profile = entry.profile || session.profile || buildSessionProfile();
            card.innerHTML = `
                <div class="dashboard-session-head">
                    <div>
                        <strong>${entry.complaint || "-"}</strong>
                        <span>${formatSessionTimestamp(entry.saved_at, lang)}</span>
                    </div>
                    <span class="dashboard-risk-pill" data-level="${String(entry.session?.recommendation?.risk_level || entry.risk_level || "").toLowerCase()}">${translateRiskLevelLabel(entry.session?.recommendation?.risk_level || entry.risk_level || "-", lang)}</span>
                </div>
                <div class="dashboard-session-badges">
                    <span class="dashboard-status-pill" data-status="${caseState.review_status}">${translateReviewStatus(caseState.review_status, lang)}</span>
                    ${
                        caseState.follow_up_due
                            ? `<span class="dashboard-status-pill" data-due="${dueState}">${copy.followUpDue}: ${formatFollowUpDate(caseState.follow_up_due, lang)}</span>`
                            : `<span class="dashboard-status-pill" data-due="none">${copy.followUpDue}: ${copy.notScheduled}</span>`
                    }
                </div>
                <p class="dashboard-session-meta">
                    ${translateSpecialty(entry.session?.report?.sections?.prediction?.specialty || entry.specialty || "-", lang)}
                </p>
                <div class="dashboard-session-stats">
                    <span>${copy.profile}: ${translateRoleLabel(profile.role, lang)} • ${getProfileDisplayName(profile, lang)}</span>
                    <span>${copy.attachmentCount}: ${attachmentsCount}</span>
                    <span>${copy.feedback}: ${latestFeedback ? getFeedbackLabel(latestFeedback.rating, lang) : FEEDBACK_COPY[lang].none}</span>
                </div>
                <p class="dashboard-session-note dashboard-session-note--soft">${copy.reviewSummary}: ${buildCaseManagementSummary(session, lang)}</p>
                ${attachmentInsight ? `<p class="dashboard-session-note dashboard-session-note--soft">${attachmentInsight}</p>` : ""}
                ${doctorNote ? `<p class="dashboard-session-note">${doctorNote}</p>` : ""}
                <div class="dashboard-session-actions">
                    <button type="button" class="session-history-btn" data-action="restore">${copy.restore}</button>
                    <button type="button" class="session-history-btn" data-action="mark-reviewed">${caseState.review_status === "reviewed" ? copy.reopen : copy.markReviewed}</button>
                    <button type="button" class="session-history-btn" data-action="follow-up">${copy.needsFollowUp}</button>
                    <a class="session-history-btn" href="report.html?lang=${lang}" data-action="report">${copy.open_report}</a>
                    <a class="session-history-btn" href="decision.html?lang=${lang}" data-action="decision">${copy.open_decision}</a>
                    ${session.tips ? `<a class="session-history-btn" href="integrative.html?lang=${lang}" data-action="tips">${copy.open_tips}</a>` : `<span class="session-history-muted">${copy.no_tips}</span>`}
                </div>
            `;

            card.querySelector('[data-action="restore"]')?.addEventListener("click", () => {
                setActiveProfile(profile);
                writeStoredSession(session);
                trackAnalyticsEvent("dashboard_restore_session", { id: entry.id });
                window.location.href = `chat.html?lang=${lang}`;
            });
            ["report", "decision", "tips"].forEach((action) => {
                card.querySelector(`[data-action="${action}"]`)?.addEventListener("click", () => {
                    setActiveProfile(profile);
                    writeStoredSession(session);
                    trackAnalyticsEvent("dashboard_open_page", { action, id: entry.id });
                });
            });
            card.querySelector('[data-action="mark-reviewed"]')?.addEventListener("click", () => {
                const nextStatus = caseState.review_status === "reviewed" ? "new" : "reviewed";
                session.case_management = buildCaseManagementState({
                    ...session.case_management,
                    review_status: nextStatus,
                    reviewed_at: nextStatus === "reviewed" ? new Date().toISOString() : "",
                    updated_at: new Date().toISOString(),
                });
                writeStoredSession(session);
                persistSessionToHistory(session);
                trackAnalyticsEvent("dashboard_review_status", { id: entry.id, review_status: nextStatus });
                refreshDashboardMeta();
                renderDashboardSessions();
            });
            card.querySelector('[data-action="follow-up"]')?.addEventListener("click", () => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const nextDue = tomorrow.toISOString().slice(0, 10);
                session.case_management = buildCaseManagementState({
                    ...session.case_management,
                    review_status: "follow_up",
                    follow_up_due: session.case_management?.follow_up_due || nextDue,
                    updated_at: new Date().toISOString(),
                });
                writeStoredSession(session);
                persistSessionToHistory(session);
                trackAnalyticsEvent("dashboard_mark_follow_up", { id: entry.id, follow_up_due: session.case_management.follow_up_due });
                refreshDashboardMeta();
                renderDashboardSessions();
            });
            dashboardPage.appendChild(card);
        });
    };

    searchInput?.addEventListener("input", renderDashboardSessions);
    riskFilter?.addEventListener("change", renderDashboardSessions);
    roleFilter?.addEventListener("change", renderDashboardSessions);
    reviewFilter?.addEventListener("change", renderDashboardSessions);
    specialtyFilter?.addEventListener("change", renderDashboardSessions);
    profileFilter?.addEventListener("change", renderDashboardSessions);

    exportBtn?.addEventListener("click", () => {
        const payload = {
            exported_at: new Date().toISOString(),
            history: readSessionHistory(),
            analytics: readAnalyticsState(),
            profiles: readProfileDirectory(),
            reminders: buildSessionReminders(readSessionHistory(), lang),
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `medika-dashboard-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        trackAnalyticsEvent("dashboard_export_json");
        setNode("dashboard-export-btn", copy.exported);
        window.setTimeout(() => setNode("dashboard-export-btn", copy.export), 1500);
    });

    clearBtn?.addEventListener("click", () => {
        clearAnalyticsState();
        trackAnalyticsEvent("dashboard_clear_analytics");
        setNode("dashboard-clear-analytics-btn", copy.cleared);
        window.setTimeout(() => setNode("dashboard-clear-analytics-btn", copy.clear), 1500);
        refreshDashboardMeta();
    });

    notificationEnableBtn?.addEventListener("click", async () => {
        const supported = isBrowserNotificationSupported();
        if (!supported) {
            renderDashboardNotificationPanel(readSessionHistory());
            return;
        }
        const current = syncNotificationPermissionState();
        if (current.enabled && current.last_permission === "granted") {
            current.enabled = false;
            writeNotificationState(current);
            trackAnalyticsEvent("notifications_disabled");
            notificationStatus.textContent = copy.notificationsDisabled;
            renderDashboardNotificationPanel(readSessionHistory());
            return;
        }
        const permission = await requestBrowserNotificationPermission();
        const nextState = readNotificationState();
        if (permission === "granted") {
            nextState.enabled = true;
            nextState.last_permission = permission;
            writeNotificationState(nextState);
            trackAnalyticsEvent("notifications_enabled");
            notificationStatus.textContent = copy.notificationsEnabled;
            await triggerReminderNotifications(readSessionHistory(), lang);
        } else {
            nextState.enabled = false;
            nextState.last_permission = permission;
            writeNotificationState(nextState);
            notificationStatus.textContent =
                permission === "denied" ? copy.notificationsDenied : copy.notificationsPrompt;
        }
        renderDashboardNotificationPanel(readSessionHistory());
    });

    notificationTestBtn?.addEventListener("click", async () => {
        const state = syncNotificationPermissionState();
        if (!isBrowserNotificationSupported() || !state.enabled || state.last_permission !== "granted") {
            renderDashboardNotificationPanel(readSessionHistory());
            return;
        }
        const delivered = await showBrowserNotification({
            title: lang === "en" ? "Medika AI test notification" : "تنبيه تجريبي من Medika AI",
            body: copy.notificationsTestSent,
            tag: "medika-test-notification",
            icon: getNotificationIconUrl("images/app-icon-192.png"),
            badge: getNotificationIconUrl("images/app-icon-192.png"),
            data: { url: `dashboard.html?lang=${lang}`, test: true },
        });
        if (delivered) {
            trackAnalyticsEvent("notifications_test_sent");
            notificationStatus.textContent = copy.notificationsTestSent;
        }
        renderDashboardNotificationPanel(readSessionHistory());
    });

    refreshDashboardMeta();
    renderDashboardSessions();
}

}
 
