/**
 * M10 要連中幾次才可信【模型】（docs/MODELS.md 第 3 節）。
 *
 * 貝氏更新：真有能力的人每次命中機率 s，亂猜的人命中機率 p0（主數字）。
 * 猜中一次的概似比 = s / p0；p0 越大（越容易猜中），每次猜中提供的證據越少。
 */
import { BAYES_DEFAULTS } from '../core/constants';
import type { BayesParams, BayesResult } from '../core/types';
import { sigmoid } from '../stats/logit';

/** 曲線長度：k = 0..K，K = min(max((hitsNeeded ?? 0) + 2, 10), 200) */
const CURVE_MIN = 10;
const CURVE_MAX = 200;

export function bayesOf(p0: number, params?: Partial<BayesParams>): BayesResult {
  // 用 ?? 而不是展開運算子：{ prior: undefined } 也要回到預設值
  const prior = params?.prior ?? BAYES_DEFAULTS.prior;
  const target = params?.target ?? BAYES_DEFAULTS.target;
  const skill = params?.skill ?? BAYES_DEFAULTS.skill;

  const posteriorAfterOne = (prior * skill) / (prior * skill + (1 - prior) * p0);

  let hitsNeeded: number | null;
  if (prior >= target) {
    hitsNeeded = 0;
  } else if (p0 === 0) {
    hitsNeeded = 1; // 亂猜不可能中：猜中一次就足以確定
  } else if (skill <= p0) {
    hitsNeeded = null; // 再怎麼連中都無法和亂猜區分
  } else {
    const x = Math.log(target / (1 - target) / (prior / (1 - prior))) / Math.log(skill / p0);
    hitsNeeded = Math.ceil(x - 1e-9); // 1e−9：x 剛好是整數時不因浮點誤差多算一次
  }

  const K = Math.min(Math.max((hitsNeeded ?? 0) + 2, CURVE_MIN), CURVE_MAX);
  const priorLogit = Math.log(prior / (1 - prior));
  const step = p0 === 0 ? 0 : Math.log(skill / p0);
  const curve: { k: number; posterior: number }[] = [];
  for (let k = 0; k <= K; k++) {
    let posterior: number;
    if (k === 0) posterior = prior;
    else if (p0 === 0) posterior = 1;
    else posterior = sigmoid(priorLogit + k * step); // logit(π_k) = ln(π/(1−π)) + k·ln(s/p0)
    curve.push({ k, posterior });
  }

  return { prior, target, skill, p0, posteriorAfterOne, hitsNeeded, curve };
}
