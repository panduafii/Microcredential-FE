#!/usr/bin/env node

/**
 * Idempotent upsert script for:
 * - project-manager
 * - cyber-security
 *
 * Uses admin API routes only (no seed SQL).
 *
 * Required env:
 * - API_BASE_URL (or NEXT_PUBLIC_API_URL)
 * - ADMIN_EMAIL
 * - ADMIN_PASSWORD
 *
 * Optional env:
 * - DRY_RUN=1 (read-only validation)
 */

import process from "node:process";

const API_BASE_URL = (process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DRY_RUN = process.env.DRY_RUN === "1";

const THRESHOLD_PCT = 70.0;

const ROLE_PROJECT_MANAGER = "project-manager";
const ROLE_CYBER_SECURITY = "cyber-security";

const QUESTION_MIX = {
  theoretical: 3,
  essay: 3,
  profile: 4,
};

const DURATION_OPTIONS = [
  { id: "A", text: "Short (<2 jam)" },
  { id: "B", text: "Medium (2-6 jam)" },
  { id: "C", text: "Long (>6 jam)" },
  { id: "D", text: "Any duration" },
];

const PAYMENT_OPTIONS = [
  { id: "A", text: "Paid" },
  { id: "B", text: "Free" },
  { id: "C", text: "Keduanya (Paid & Free)" },
];

const PROJECT_CONTEXT_OPTIONS = [
  { id: "personal", text: "Project personal" },
  { id: "kampus", text: "Project kampus/bootcamp" },
  { id: "production", text: "Project production (real stakeholder/user)" },
  { id: "lintas-domain", text: "Project lintas domain/industri" },
];

const PROJECT_CHECKLIST_EXPECTED = {
  type: "project_checklist",
  project_count: {
    ranges: [
      { min: 0, max: 1, score: 10 },
      { min: 2, max: 4, score: 25 },
      { min: 5, max: 8, score: 40 },
      { min: 9, max: 999, score: 60 },
    ],
  },
  checklist_scoring: {
    personal: 5,
    kampus: 10,
    production: 15,
    "lintas-domain": 10,
  },
  max_raw_score: 100,
  accepted_values: ["personal", "kampus", "production", "lintas-domain"],
  legacy_option_mapping: {
    A: { project_count: 1, selected_options: ["personal"] },
    B: { project_count: 3, selected_options: ["personal", "kampus"] },
    C: { project_count: 6, selected_options: ["personal", "kampus", "production"] },
    D: {
      project_count: 9,
      selected_options: ["personal", "kampus", "production", "lintas-domain"],
    },
  },
  allow_custom: false,
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function roleTrackPayloads() {
  return [
    {
      slug: ROLE_PROJECT_MANAGER,
      name: "Project Manager",
      description:
        "Project management competency assessment covering planning, risk, stakeholder alignment, and delivery leadership.",
      skill_focus_tags: [
        "project-management",
        "stakeholder-management",
        "risk-management",
        "planning",
        "delivery",
      ],
      question_mix_overrides: QUESTION_MIX,
      advanced_threshold_pct: THRESHOLD_PCT,
      is_active: true,
    },
    {
      slug: ROLE_CYBER_SECURITY,
      name: "Cyber Security",
      description:
        "Cyber security competency assessment covering app security, infrastructure security, incident response, and security architecture.",
      skill_focus_tags: [
        "security",
        "application-security",
        "network-security",
        "incident-response",
        "threat-modeling",
      ],
      question_mix_overrides: QUESTION_MIX,
      advanced_threshold_pct: THRESHOLD_PCT,
      is_active: true,
    },
  ];
}

function rubric(dimensions, floor = 0, ceiling = 95) {
  return {
    dimensions,
    floor,
    ceiling,
  };
}

function profileQuestions(roleSlug, roleLabel, q8AcceptedValues) {
  return [
    {
      role_slug: roleSlug,
      sequence: 7,
      question_type: "profile",
      prompt: `Masukkan total project ${roleLabel} yang pernah Anda kerjakan, lalu pilih semua konteks project yang pernah Anda tangani (checklist).`,
      difficulty: "easy",
      weight: 1.0,
      options: PROJECT_CONTEXT_OPTIONS,
      expected_values: PROJECT_CHECKLIST_EXPECTED,
      metadata: {
        dimension: "experience",
        captures: ["project_count", "project_contexts"],
      },
    },
    {
      role_slug: roleSlug,
      sequence: 8,
      question_type: "profile",
      prompt: `Tools/teknologi ${roleLabel} apa yang ingin Anda pelajari lebih dalam? (Sebutkan 2-3)`,
      difficulty: "easy",
      weight: 1.0,
      options: null,
      expected_values: {
        accepted_values: q8AcceptedValues,
        allow_custom: true,
      },
      metadata: {
        dimension: "tech-preferences",
      },
    },
    {
      role_slug: roleSlug,
      sequence: 9,
      question_type: "profile",
      prompt: "Preferensi durasi course yang Anda inginkan?",
      difficulty: "easy",
      weight: 1.0,
      options: DURATION_OPTIONS,
      expected_values: {
        accepted_values: ["A", "B", "C", "D"],
        allow_custom: false,
      },
      metadata: {
        dimension: "content-duration",
      },
    },
    {
      role_slug: roleSlug,
      sequence: 10,
      question_type: "profile",
      prompt: "Apakah Anda tertarik dengan course berbayar atau gratis?",
      difficulty: "easy",
      weight: 1.0,
      options: PAYMENT_OPTIONS,
      expected_values: {
        accepted_values: ["A", "B", "C"],
        allow_custom: false,
      },
      metadata: {
        dimension: "payment-preference",
      },
    },
  ];
}

function projectManagerQuestions() {
  const roleSlug = ROLE_PROJECT_MANAGER;
  const q = [
    {
      role_slug: roleSlug,
      sequence: 1,
      question_type: "theoretical",
      prompt: "Tujuan utama dari project scope adalah...",
      difficulty: "easy",
      weight: 1.0,
      options: [
        { id: "A", text: "Menentukan siapa yang bekerja" },
        { id: "B", text: "Menentukan apa yang termasuk dan tidak termasuk dalam proyek" },
        { id: "C", text: "Menentukan gaji tim" },
        { id: "D", text: "Menentukan tools yang dipakai" },
      ],
      correct_answer: "B",
      answer_key: "Scope mendefinisikan batasan proyek untuk mencegah scope creep.",
      model_answer: "Project scope digunakan untuk mendefinisikan apa yang termasuk dan tidak termasuk dalam proyek agar perubahan tetap terkendali.",
      metadata: { dimension: "scope-management", level: 1, points: 2 },
    },
    {
      role_slug: roleSlug,
      sequence: 2,
      question_type: "theoretical",
      prompt:
        "Jika timeline proyek terancam mundur karena satu task critical path terlambat, tindakan pertama yang paling tepat adalah...",
      difficulty: "medium",
      weight: 1.0,
      options: [
        { id: "A", text: "Mengabaikan dan berharap selesai" },
        { id: "B", text: "Menambah fitur baru" },
        { id: "C", text: "Menganalisis dampak dan mencari opsi percepatan (crashing/fast tracking)" },
        { id: "D", text: "Menyalahkan tim terkait" },
      ],
      correct_answer: "C",
      answer_key: "Fokus pertama adalah analisis dampak dan opsi mitigasi pada critical path.",
      model_answer:
        "Langkah pertama adalah mengevaluasi dampak keterlambatan terhadap critical path dan menyiapkan opsi percepatan yang realistis.",
      metadata: { dimension: "critical-path-mitigation", level: 2, points: 4 },
    },
    {
      role_slug: roleSlug,
      sequence: 3,
      question_type: "theoretical",
      prompt:
        "Seorang stakeholder meminta perubahan besar saat proyek sudah 80% selesai. Tindakan paling tepat adalah...",
      difficulty: "hard",
      weight: 1.0,
      options: [
        { id: "A", text: "Langsung menolak" },
        { id: "B", text: "Langsung menerima agar stakeholder senang" },
        { id: "C", text: "Evaluasi dampak terhadap scope, timeline, dan cost lalu diskusikan trade-off" },
        { id: "D", text: "Menunda tanpa kepastian" },
      ],
      correct_answer: "C",
      answer_key: "Change request dikelola dengan analisis dampak dan alignment keputusan.",
      model_answer:
        "Project Manager harus melakukan impact assessment pada scope, waktu, dan biaya, lalu memfasilitasi keputusan trade-off dengan stakeholder.",
      metadata: { dimension: "change-management", level: 3, points: 6 },
    },
    {
      role_slug: roleSlug,
      sequence: 4,
      question_type: "essay",
      prompt:
        "Sebuah proyek IT mengalami keterlambatan 2 minggu dari jadwal. Apa langkah-langkah yang Anda lakukan sebagai Project Manager?",
      difficulty: "easy",
      weight: 1.0,
      answer_key:
        "Jawaban ideal memuat root cause analysis, evaluasi dampak timeline, update risk log, komunikasi stakeholder, recovery plan, dan monitoring milestone lebih ketat.",
      model_answer:
        "Saya mulai dari identifikasi penyebab keterlambatan, ukur dampaknya ke rencana utama, update risk log, lalu komunikasikan kondisi terbaru ke stakeholder. Setelah itu saya susun recovery plan lewat reprioritization/resource adjustment dan memperketat monitoring milestone berikutnya.",
      rubric: rubric(
        {
          root_cause_analysis: 0.5,
          stakeholder_communication: 0.25,
          recovery_plan: 0.25,
        },
        10,
        95,
      ),
      metadata: { dimension: "schedule-recovery", level: 4, points: 8 },
    },
    {
      role_slug: roleSlug,
      sequence: 5,
      question_type: "essay",
      prompt:
        "Anda memimpin proyek pengembangan aplikasi mobile selama 4 bulan. Di bulan ke-2 developer utama resign, budget tetap, deadline tidak boleh berubah. Jelaskan prioritas, manajemen risiko, keputusan scope, dan komunikasi stakeholder Anda.",
      difficulty: "medium",
      weight: 1.0,
      answer_key:
        "Jawaban ideal mencakup impact assessment, redistribusi tugas, update risk register, mitigasi skill gap, pengurangan fitur non-critical ke MVP, dan komunikasi transparan berbasis data.",
      model_answer:
        "Prioritas awal adalah impact assessment terhadap dependency kritis dan redistribusi beban kerja. Saya update risk register, tutup skill gap lewat rotasi/hiring contract jika memungkinkan, dan negosiasikan scope non-critical agar deadline tetap tercapai sebagai MVP. Komunikasi ke stakeholder harus transparan dengan opsi, risiko, dan rekomendasi.",
      rubric: rubric(
        {
          impact_analysis: 0.3333,
          risk_mitigation: 0.3333,
          scope_prioritization: 0.1667,
          stakeholder_communication: 0.1667,
        },
        5,
        95,
      ),
      metadata: { dimension: "delivery-risk-management", level: 5, points: 12 },
    },
    {
      role_slug: roleSlug,
      sequence: 6,
      question_type: "essay",
      prompt:
        "Anda memimpin proyek transformasi digital perusahaan besar dengan banyak stakeholder, konflik lintas tim, target agresif, dan milestone terancam gagal. Jelaskan strategi alignment stakeholder, manajemen konflik, delivery realism, dan pemulihan momentum.",
      difficulty: "hard",
      weight: 1.0,
      answer_key:
        "Jawaban ideal memuat stakeholder mapping, governance dan decision rights, RACI, revalidasi scope, phase-based delivery, risk-based planning, quick wins, dan eskalasi bottleneck.",
      model_answer:
        "Saya lakukan stakeholder mapping dan steering committee berkala dengan governance yang jelas. Konflik lintas tim dikelola lewat fasilitasi berbasis data dan RACI tegas. Untuk delivery realism, saya revalidasi scope dan gunakan phase-based delivery dengan buffer berbasis risiko serta dashboard transparan. Saat momentum turun, saya dorong quick wins, rayakan milestone, dan eskalasi keputusan yang menghambat.",
      rubric: rubric(
        {
          stakeholder_alignment: 0.3333,
          conflict_resolution: 0.2222,
          delivery_governance: 0.2222,
          momentum_strategy: 0.2222,
        },
        0,
        95,
      ),
      metadata: { dimension: "strategic-project-leadership", level: 6, points: 18 },
    },
  ];

  return q.concat(
    profileQuestions(roleSlug, "project management", [
      "agile",
      "scrum",
      "kanban",
      "jira",
      "stakeholder management",
      "risk management",
      "okr",
      "roadmap planning",
      "resource planning",
      "budgeting",
      "communication",
      "leadership",
      "pmp",
      "prince2",
    ]),
  );
}

function cyberSecurityQuestions() {
  const roleSlug = ROLE_CYBER_SECURITY;
  const q = [
    {
      role_slug: roleSlug,
      sequence: 1,
      question_type: "theoretical",
      prompt: "Manakah yang termasuk prinsip dasar keamanan informasi (CIA Triad)?",
      difficulty: "easy",
      weight: 1.0,
      options: [
        { id: "A", text: "Confidentiality, Integrity, Availability" },
        { id: "B", text: "Control, Inspection, Audit" },
        { id: "C", text: "Cryptography, Inspection, Access" },
        { id: "D", text: "Confidentiality, Identity, Authorization" },
      ],
      correct_answer: "A",
      answer_key: "CIA (Confidentiality, Integrity, Availability) adalah fondasi keamanan informasi.",
      model_answer:
        "Prinsip dasar keamanan informasi adalah CIA Triad: Confidentiality, Integrity, dan Availability.",
      metadata: { dimension: "cia-triad", level: 1, points: 2 },
    },
    {
      role_slug: roleSlug,
      sequence: 2,
      question_type: "theoretical",
      prompt: "Serangan SQL Injection biasanya terjadi karena...",
      difficulty: "medium",
      weight: 1.0,
      options: [
        { id: "A", text: "Server terlalu lambat" },
        { id: "B", text: "Input user tidak divalidasi / tidak menggunakan parameterized query" },
        { id: "C", text: "Password terlalu pendek" },
        { id: "D", text: "Tidak ada firewall" },
      ],
      correct_answer: "B",
      answer_key:
        "SQL Injection muncul saat query dibangun langsung dari input user tanpa parameterized query/validasi.",
      model_answer:
        "Penyebab utama SQL Injection adalah input user yang tidak disanitasi dan query yang tidak memakai parameterized statements.",
      metadata: { dimension: "sql-injection", level: 2, points: 4 },
    },
    {
      role_slug: roleSlug,
      sequence: 3,
      question_type: "theoretical",
      prompt:
        "Jika sebuah aplikasi menggunakan JWT tanpa expiry dan tanpa mekanisme revocation, risiko utamanya adalah...",
      difficulty: "hard",
      weight: 1.0,
      options: [
        { id: "A", text: "JWT tidak bisa dibaca server" },
        { id: "B", text: "Token bisa dipakai selamanya jika bocor" },
        { id: "C", text: "JWT lebih cepat dari session" },
        { id: "D", text: "JWT otomatis terenkripsi" },
      ],
      correct_answer: "B",
      answer_key: "Tanpa expiry/revocation, token bocor tetap valid tanpa batas.",
      model_answer:
        "Risiko utamanya adalah token yang bocor dapat terus dipakai karena tidak ada batas masa berlaku atau revocation.",
      metadata: { dimension: "jwt-token-security", level: 3, points: 6 },
    },
    {
      role_slug: roleSlug,
      sequence: 4,
      question_type: "essay",
      prompt:
        "Jelaskan perbedaan Authentication dan Authorization. Berikan contoh kasus nyata dalam aplikasi web.",
      difficulty: "easy",
      weight: 1.0,
      answer_key:
        "AuthN adalah verifikasi identitas, AuthZ adalah hak akses setelah login. Jawaban baik memberi contoh konkret dan menyebut role/permission.",
      model_answer:
        "Authentication (AuthN) memverifikasi identitas pengguna, misalnya login email/password atau MFA. Authorization (AuthZ) menentukan apa yang boleh diakses setelah identitas valid, misalnya hanya admin yang boleh membuka panel manajemen. Contoh: user login berhasil (AuthN), lalu hanya bisa melihat datanya sendiri (AuthZ).",
      rubric: rubric(
        {
          concept_accuracy: 0.5,
          concrete_example: 0.25,
          role_permission_context: 0.25,
        },
        10,
        95,
      ),
      metadata: { dimension: "authn-vs-authz", level: 4, points: 8 },
    },
    {
      role_slug: roleSlug,
      sequence: 5,
      question_type: "essay",
      prompt:
        "Sebuah perusahaan menemukan bahwa database internal mereka dapat diakses dari internet publik. Jelaskan risiko, mitigasi segera, dan pencegahan jangka panjang.",
      difficulty: "medium",
      weight: 1.0,
      answer_key:
        "Jawaban ideal memuat data breach risk, containment cepat (tutup akses publik, audit log, rotasi credential), serta pencegahan seperti least privilege, segmentation, monitoring, dan audit berkala.",
      model_answer:
        "Risikonya meliputi data breach, akses tidak sah, dan eskalasi serangan. Mitigasi segera: tutup akses publik di firewall/security group, audit log, rotasi credential, verifikasi backup, dan lakukan vulnerability assessment. Pencegahan jangka panjang: network segmentation, least privilege, review IaC, continuous monitoring, dan security audit rutin.",
      rubric: rubric(
        {
          risk_identification: 0.3333,
          immediate_mitigation: 0.3333,
          long_term_prevention: 0.3333,
        },
        5,
        95,
      ),
      metadata: { dimension: "exposed-database-incident", level: 5, points: 12 },
    },
    {
      role_slug: roleSlug,
      sequence: 6,
      question_type: "essay",
      prompt:
        "Sebuah perusahaan SaaS mengalami indikasi kebocoran data user (email dan hashed password), namun breach belum terkonfirmasi. Sebagai Security Lead, jelaskan langkah 24-72 jam pertama, komunikasi, forensic, dan perbaikan pasca-insiden.",
      difficulty: "hard",
      weight: 1.0,
      answer_key:
        "Jawaban ideal meliputi IR terstruktur, containment dan evidence preservation, komunikasi terkontrol, forensic timeline, serta hardening jangka panjang (MFA, hash policy, key rotation, monitoring).",
      model_answer:
        "Saya aktifkan incident response plan, isolasi sistem terdampak, dan preserve logs/evidence untuk memastikan scope dampak. Komunikasi dilakukan transparan namun terkontrol ke manajemen dan user, termasuk langkah mitigasi seperti reset password jika diperlukan. Forensic dilakukan dengan analisis log, rekonstruksi timeline, identifikasi vektor serangan, dan audit akses. Setelah insiden, lakukan perbaikan seperti MFA enforcement, peningkatan hashing policy, rotasi secrets/keys, penguatan monitoring, serta uji penetrasi lanjutan.",
      rubric: rubric(
        {
          incident_response_structure: 0.3333,
          communication_management: 0.2222,
          forensic_reasoning: 0.2222,
          long_term_security_improvement: 0.2222,
        },
        0,
        95,
      ),
      metadata: { dimension: "breach-incident-response", level: 6, points: 18 },
    },
  ];

  return q.concat(
    profileQuestions(roleSlug, "keamanan siber", [
      "owasp",
      "siem",
      "soc",
      "incident response",
      "threat hunting",
      "penetration testing",
      "vulnerability assessment",
      "network security",
      "cloud security",
      "iam",
      "zero trust",
      "jwt security",
      "splunk",
      "wireshark",
      "burp suite",
      "forensics",
    ]),
  );
}

async function requestJson(path, { method = "GET", token = "", body = null, allow404 = false } = {}) {
  const headers = {
    Accept: "application/json",
  };

  if (body !== null) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (allow404 && response.status === 404) {
    return { ok: false, status: response.status, data: null };
  }

  if (!response.ok) {
    throw new Error(`[${method} ${path}] ${response.status} ${text}`);
  }

  return { ok: true, status: response.status, data };
}

async function loginAdmin() {
  const payload = {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  };
  const { data } = await requestJson("/auth/login", {
    method: "POST",
    body: payload,
  });

  const accessToken = data?.tokens?.access_token || data?.access_token || null;
  assert(accessToken, "Missing access token from /auth/login response");
  return accessToken;
}

function toTrackPatchPayload(track) {
  return {
    name: track.name,
    description: track.description,
    skill_focus_tags: track.skill_focus_tags,
    question_mix_overrides: track.question_mix_overrides,
    advanced_threshold_pct: track.advanced_threshold_pct,
    is_active: true,
  };
}

function toMinimalTrackPayload(track) {
  return {
    slug: track.slug,
    name: track.name,
    description: track.description,
    skill_focus_tags: track.skill_focus_tags,
    is_active: true,
  };
}

async function upsertTrack(track, token) {
  const path = `/tracks/${track.slug}`;
  const existing = await requestJson(path, { allow404: true });

  if (existing.status === 404) {
    if (DRY_RUN) {
      console.log(`[dry-run] would create track ${track.slug}`);
      return;
    }
    try {
      await requestJson("/tracks", {
        method: "POST",
        token,
        body: track,
      });
      console.log(`[tracks] created ${track.slug}`);
      return;
    } catch (error) {
      const fallback = toMinimalTrackPayload(track);
      await requestJson("/tracks", {
        method: "POST",
        token,
        body: fallback,
      });
      console.log(`[tracks] created ${track.slug} with minimal payload (${error.message})`);
      await requestJson(path, {
        method: "PATCH",
        token,
        body: toTrackPatchPayload(track),
      });
      console.log(`[tracks] patched ${track.slug} with advanced fields`);
      return;
    }
  }

  if (DRY_RUN) {
    console.log(`[dry-run] would patch track ${track.slug}`);
    return;
  }

  try {
    await requestJson(path, {
      method: "PATCH",
      token,
      body: toTrackPatchPayload(track),
    });
    console.log(`[tracks] patched ${track.slug}`);
  } catch (error) {
    await requestJson(path, {
      method: "PATCH",
      token,
      body: {
        name: track.name,
        description: track.description,
        skill_focus_tags: track.skill_focus_tags,
        is_active: true,
      },
    });
    console.log(`[tracks] patched ${track.slug} with minimal payload (${error.message})`);
  }
}

function toQuestionPatchPayload(question) {
  return {
    sequence: question.sequence,
    question_type: question.question_type,
    prompt: question.prompt,
    options: question.options ?? null,
    difficulty: question.difficulty,
    weight: question.weight,
    correct_answer: question.correct_answer ?? null,
    answer_key: question.answer_key ?? null,
    model_answer: question.model_answer ?? null,
    rubric: question.rubric ?? null,
    expected_values: question.expected_values ?? null,
    metadata: question.metadata ?? {},
  };
}

async function upsertQuestionsForRole(roleSlug, questions, token) {
  const listRes = await requestJson(`/questions?role_slug=${encodeURIComponent(roleSlug)}`);
  const currentQuestions = Array.isArray(listRes.data) ? listRes.data : [];
  const idBySequence = new Map(currentQuestions.map((item) => [item.sequence, item.id]));

  const changed = [];

  for (const q of questions) {
    const existingId = idBySequence.get(q.sequence);
    if (!existingId) {
      if (DRY_RUN) {
        console.log(`[dry-run] would create ${roleSlug} Q${q.sequence}`);
        continue;
      }
      const created = await requestJson("/questions", {
        method: "POST",
        token,
        body: q,
      });
      changed.push(created.data);
      console.log(`[questions] created ${roleSlug} Q${q.sequence} id=${created.data.id}`);
      continue;
    }

    if (DRY_RUN) {
      console.log(`[dry-run] would patch ${roleSlug} Q${q.sequence} id=${existingId}`);
      continue;
    }
    const patched = await requestJson(`/questions/${existingId}`, {
      method: "PATCH",
      token,
      body: toQuestionPatchPayload(q),
    });
    changed.push(patched.data);
    console.log(
      `[questions] patched ${roleSlug} Q${q.sequence} old_id=${existingId} new_id=${patched.data.id}`,
    );
  }

  return changed;
}

async function verifyRole(roleSlug) {
  const listRes = await requestJson(`/questions?role_slug=${encodeURIComponent(roleSlug)}`);
  const questions = Array.isArray(listRes.data) ? listRes.data : [];
  const sequences = new Set(questions.map((q) => q.sequence));

  for (let seq = 1; seq <= 10; seq += 1) {
    assert(sequences.has(seq), `[verify:${roleSlug}] missing active question sequence ${seq}`);
  }

  const qBySeq = new Map(questions.map((q) => [q.sequence, q.id]));

  const q1 = (await requestJson(`/questions/${qBySeq.get(1)}`)).data;
  assert(Array.isArray(q1.options) && q1.options.length >= 4, `[verify:${roleSlug}] Q1 options invalid`);
  assert(Boolean(q1.correct_answer), `[verify:${roleSlug}] Q1 missing correct_answer`);

  const q4 = (await requestJson(`/questions/${qBySeq.get(4)}`)).data;
  assert(Boolean(q4.answer_key), `[verify:${roleSlug}] Q4 missing answer_key`);
  assert(Boolean(q4.model_answer), `[verify:${roleSlug}] Q4 missing model_answer`);
  assert(Boolean(q4.rubric), `[verify:${roleSlug}] Q4 missing rubric`);

  const q7 = (await requestJson(`/questions/${qBySeq.get(7)}`)).data;
  assert(q7?.expected_values?.type === "project_checklist", `[verify:${roleSlug}] Q7 not project_checklist`);

  const q8 = (await requestJson(`/questions/${qBySeq.get(8)}`)).data;
  assert(q8?.expected_values?.allow_custom === true, `[verify:${roleSlug}] Q8 allow_custom != true`);

  const q9 = (await requestJson(`/questions/${qBySeq.get(9)}`)).data;
  assert(Array.isArray(q9.options) && q9.options.length >= 4, `[verify:${roleSlug}] Q9 options invalid`);

  const q10 = (await requestJson(`/questions/${qBySeq.get(10)}`)).data;
  assert(Array.isArray(q10.options) && q10.options.length >= 3, `[verify:${roleSlug}] Q10 options invalid`);

  const track = (await requestJson(`/tracks/${roleSlug}`)).data;
  assert(track?.is_active === true, `[verify:${roleSlug}] track is not active`);
  if (typeof track?.advanced_threshold_pct === "number") {
    assert(
      Math.abs(track.advanced_threshold_pct - THRESHOLD_PCT) < 1e-6,
      `[verify:${roleSlug}] threshold mismatch: ${track.advanced_threshold_pct}`,
    );
  }

  console.log(`[verify] ${roleSlug} OK (track + Q1..Q10)`);
}

async function main() {
  assert(API_BASE_URL, "Missing API_BASE_URL (or NEXT_PUBLIC_API_URL)");
  assert(ADMIN_EMAIL, "Missing ADMIN_EMAIL");
  assert(ADMIN_PASSWORD, "Missing ADMIN_PASSWORD");

  console.log(`API_BASE_URL=${API_BASE_URL}`);
  if (DRY_RUN) {
    console.log("Mode: DRY_RUN=1 (no mutating requests)");
  }

  const token = await loginAdmin();
  console.log("[auth] admin login success");

  const tracks = roleTrackPayloads();
  for (const track of tracks) {
    await upsertTrack(track, token);
  }

  const roleQuestionSets = [
    [ROLE_PROJECT_MANAGER, projectManagerQuestions()],
    [ROLE_CYBER_SECURITY, cyberSecurityQuestions()],
  ];

  const summary = [];
  for (const [roleSlug, questions] of roleQuestionSets) {
    assert(questions.length === 10, `${roleSlug} must have exactly 10 questions`);
    const changed = await upsertQuestionsForRole(roleSlug, questions, token);
    summary.push({ roleSlug, changedCount: changed.length });
  }

  for (const [roleSlug] of roleQuestionSets) {
    await verifyRole(roleSlug);
  }

  console.log("\n=== SUMMARY ===");
  for (const item of summary) {
    console.log(`${item.roleSlug}: changed=${item.changedCount}`);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error("\n[error]", error.message);
  process.exitCode = 1;
});

