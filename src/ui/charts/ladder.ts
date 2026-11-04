/**
 * M12 算命師等級的階梯（HTML 清單，本身就是可讀的結構，不需要另外的表格）。
 * 範圍文字由 LEVELS 的下限產生，不手寫數字。
 */
import type { LevelId } from '../../core/types';
import { M12 } from '../../copy/zh-TW';
import { levelMeaning, levelName, levelRanges } from '../format';
import { html, type SafeHtml } from '../html';

export function levelLadder(current: LevelId): SafeHtml {
  return html`<ol class="ladder" aria-label="${M12.ladderTitle}">
    ${levelRanges().map((r) => {
      const here = r.id === current;
      return html`<li class="${here ? 'is-current' : ''}"${here ? html` aria-current="true"` : ''}>
        <span class="ladder-range">${r.range}</span>
        <span class="ladder-name">${levelName(r.id)}${here ? html`<span class="here-tag">${M12.here}</span>` : ''}</span>
        <span class="ladder-meaning">${levelMeaning(r.id)}</span>
      </li>`;
    })}
  </ol>`;
}
