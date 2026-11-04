/**
 * M10 三個滑桿的刻度（純資料）。
 *
 * 用固定的刻度清單而不是連續值：先驗跨三個數量級（0.1%–50%），線性滑桿在小數值幾乎選不到；
 * 清單讓預設值（1%、95%、100%）剛好落在刻度上，螢幕報讀器也能讀出整齊的百分比。
 */
import { BAYES_DEFAULTS } from '../core/constants';
import type { BayesParams } from '../core/types';

export type BayesParam = keyof BayesParams;

export interface SliderDef {
  values: readonly number[];
}

const skillValues: number[] = Array.from({ length: 51 }, (_, i) => Math.round((0.5 + i * 0.01) * 100) / 100);

export const BAYES_SLIDERS: Readonly<Record<BayesParam, SliderDef>> = {
  prior: {
    values: [0.001, 0.002, 0.003, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5],
  },
  target: { values: [0.8, 0.85, 0.9, 0.95, 0.975, 0.99, 0.995, 0.999] },
  skill: { values: skillValues },
};

/** 最接近 value 的刻度索引 */
export function sliderIndex(param: BayesParam, value: number): number {
  const values = BAYES_SLIDERS[param].values;
  let best = 0;
  for (let i = 1; i < values.length; i++) {
    if (Math.abs(values[i]! - value) < Math.abs(values[best]! - value)) best = i;
  }
  return best;
}

/** 刻度索引 → 值（超出範圍時夾到兩端） */
export function sliderValue(param: BayesParam, index: number): number {
  const values = BAYES_SLIDERS[param].values;
  const i = Math.min(Math.max(0, Math.round(index)), values.length - 1);
  return values[i] ?? BAYES_DEFAULTS[param];
}
