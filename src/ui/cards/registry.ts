/**
 * 模式卡的清單與顯示順序：M1、M2、M4、M8、M10、M12、M13、M14。
 * 新增模式時只要寫一個 builder 並加在這裡。
 */
import type { CardId } from '../../app/state';
import type { CardContext, CardSpec } from './common';
import { m1Card } from './m1';
import { m10Card } from './m10';
import { m12Card } from './m12';
import { m13Card } from './m13';
import { m14Card } from './m14';
import { m2Card } from './m2';
import { m4Card } from './m4';
import { m8Card } from './m8';

export type CardBuilder = (ctx: CardContext) => CardSpec | null;

export const CARD_BUILDERS: readonly (readonly [CardId, CardBuilder])[] = [
  ['m1', m1Card],
  ['m2', m2Card],
  ['m4', m4Card],
  ['m8', m8Card],
  ['m10', m10Card],
  ['m12', m12Card],
  ['m13', m13Card],
  ['m14', m14Card],
];
