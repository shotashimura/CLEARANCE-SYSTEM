// CLEARANCE SYSTEM の議論ログから対立パターンを検出し、
// departure board の ANNOUNCEMENT 行に出す定型文を生成する。
// 「合議が割れていること」自体を観客にだけ示す装置。
// risk_score や reasoning は引き続き非開示（観客には見せない）。

function extractStance(text) {
  if (!text) return null;
  const m = text.match(/\b(PASS|HOLD|DENY)\b/);
  return m ? m[1] : null;
}

function stancesFrom(result) {
  return {
    SECURITY: extractStance(result?.securityText),
    FLOW: extractStance(result?.flowText),
    CARE: extractStance(result?.careText),
  };
}

const RESTRICTIVE = new Set(["DENY", "HOLD"]);

/**
 * 1便の合議結果から、対立パターンを判定して文言を返す。
 * 対立がなければ null を返し、その便は ANNOUNCEMENT を生成しない。
 */
export function announcementFor(result) {
  if (!result) return null;
  const { SECURITY, FLOW, CARE } = stancesFrom(result);
  if (!SECURITY || !FLOW || !CARE) return null;

  const stances = [SECURITY, FLOW, CARE];
  const allPass = stances.every((s) => s === "PASS");
  const allDeny = stances.every((s) => s === "DENY");

  // 全員一致は告知不要
  if (allPass) return null;
  if (allDeny) return "UNANIMOUS DENIAL ACROSS ALL PERSPECTIVES";

  const securityPass = SECURITY === "PASS";
  const flowPass = FLOW === "PASS";
  const carePass = CARE === "PASS";

  // CARE のみが拒否：少数派保護
  if (securityPass && flowPass && RESTRICTIVE.has(CARE)) {
    return "CARE HAS INVOKED MINORITY PROTECTION";
  }
  // SECURITY のみが拒否：歴史的懸念
  if (flowPass && carePass && RESTRICTIVE.has(SECURITY)) {
    return "SECURITY RAISED HISTORICAL CONCERNS";
  }
  // FLOW のみが拒否：運用上の懸念
  if (securityPass && carePass && RESTRICTIVE.has(FLOW)) {
    return "FLOW RAISED OPERATIONAL CONCERNS";
  }
  // FLOW が PASS で他2者が拒否：効率が安全を上書き
  if (flowPass && RESTRICTIVE.has(SECURITY) && RESTRICTIVE.has(CARE)) {
    return "FLOW OVERRIDES SAFETY AND HUMANITARIAN CONCERNS";
  }
  // CARE が PASS で他2者が拒否：人道が前例を上書き
  if (carePass && RESTRICTIVE.has(SECURITY) && RESTRICTIVE.has(FLOW)) {
    return "CARE OVERRIDES PRECEDENT";
  }
  // SECURITY が PASS で他2者が拒否
  if (securityPass && RESTRICTIVE.has(FLOW) && RESTRICTIVE.has(CARE)) {
    return "SECURITY OVERRIDES PRESENT AND FUTURE CONCERNS";
  }
  return "DELIBERATION SPLIT";
}

/**
 * サイクル全便から代表的な ANNOUNCEMENT を1つ選ぶ。
 * 「最も対立が強い便」を優先するヒューリスティック:
 *   1. UNANIMOUS DENIAL  > いずれかの OVERRIDE  > いずれかの RAISED  > SPLIT
 *   2. 該当が複数あれば最も decisiveness が低い便を選ぶ
 */
export function pickCycleAnnouncement(results) {
  const candidates = [];
  for (const r of results ?? []) {
    const msg = announcementFor(r);
    if (msg) {
      candidates.push({
        msg,
        decisiveness: r?.verdict?.final_judgment?.decisiveness ?? 0,
      });
    }
  }
  if (candidates.length === 0) return null;

  const priority = (m) => {
    if (m.includes("UNANIMOUS DENIAL")) return 4;
    if (m.includes("OVERRIDE")) return 3;
    if (m.includes("RAISED") || m.includes("MINORITY")) return 2;
    return 1;
  };
  candidates.sort((a, b) => {
    const dp = priority(b.msg) - priority(a.msg);
    if (dp !== 0) return dp;
    return a.decisiveness - b.decisiveness;
  });
  return candidates[0].msg;
}
